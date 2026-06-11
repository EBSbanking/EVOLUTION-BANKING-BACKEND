// services/dataSourceManager.js
import { Sequelize } from 'sequelize';
import db from '../../config/db.js'; // main admin DB (Sequelize instance)

class DataSourceManager {
  constructor() {
    this.sources = new Map(); // name -> { sequelize, config, status, peakActive? }
  }

  async loadFromDB() {
    // ✅ SELECT with QueryTypes.SELECT returns rows directly (no extra array wrapper)
    const rows = await db.query('SELECT * FROM admin_data_sources WHERE status != "deleted"', {
      type: db.QueryTypes.SELECT
    });
    for (const row of rows) {
      await this.createOrUpdate(row, null); // userId null = no audit during startup
    }
  }

  async createOrUpdate(config, userId = null) {
    const { name, type, host, port, database, username, password, pool_min, pool_max, connection_string } = config;
    const sequelize = new Sequelize(connection_string || `${type}://${username}:${password}@${host}:${port}/${database}`, {
      pool: { min: pool_min, max: pool_max },
      logging: false
    });
    await sequelize.authenticate();

    const existing = this.sources.has(name);
    let oldConfig = null;
    if (existing) {
      oldConfig = this.sources.get(name).config;
      await this.sources.get(name).sequelize.close();
    }

    this.sources.set(name, {
      sequelize,
      config,
      status: 'active',
      peakActive: 0
    });

    // ✅ UPDATE with replacements
    await db.query('UPDATE admin_data_sources SET status = "active", updated_at = NOW() WHERE name = ?', {
      replacements: [name]
    });

    if (userId) {
      const action = existing ? 'UPDATE' : 'CREATE';
      const details = JSON.stringify({ before: oldConfig || null, after: config });
      await db.query(
        `INSERT INTO admin_audit_log (action, resource_type, resource_name, details, user_id)
         VALUES (?, ?, ?, ?, ?)`,
        {
          replacements: [action, 'datasource', name, details, userId]
        }
      );
    }

    return sequelize;
  }

  get(name) {
    const entry = this.sources.get(name);
    return entry ? entry.sequelize : null;
  }

  async getStats(name) {
    const entry = this.sources.get(name);
    if (!entry) return null;
    const pool = entry.sequelize.connectionManager.pool;
    const active = pool.numActive();
    const idle = pool.numIdle();
    const total = pool.numTotal();
    const waiting = pool.numWaiting();

    let peak = entry.peakActive || 0;
    if (active > peak) {
      peak = active;
      entry.peakActive = peak;
    }

    return {
      activeConnections: active,
      idleConnections: idle,
      totalConnections: total,
      waitingRequests: waiting,
      highCount: peak,
      status: entry.status,
    };
  }

  async testConnection(config) {
    const { type, host, port, database, username, password, connection_string } = config;
    const sequelize = new Sequelize(connection_string || `${type}://${username}:${password}@${host}:${port}/${database}`, {
      logging: false,
      pool: { min: 0, max: 1 }
    });
    try {
      await sequelize.authenticate();
      return true;
    } catch (err) {
      console.error('Connection test failed:', err.message);
      return false;
    } finally {
      await sequelize.close();
    }
  }

  async remove(name, userId = null) {
    const entry = this.sources.get(name);
    if (!entry) return;

    await entry.sequelize.close();
    this.sources.delete(name);

    // ✅ UPDATE with replacements
    await db.query('UPDATE admin_data_sources SET status = "deleted" WHERE name = ?', {
      replacements: [name]
    });

    if (userId) {
      const details = JSON.stringify({ deletedConfig: entry.config });
      await db.query(
        `INSERT INTO admin_audit_log (action, resource_type, resource_name, details, user_id)
         VALUES (?, ?, ?, ?, ?)`,
        {
          replacements: ['DELETE', 'datasource', name, details, userId]
        }
      );
    }
  }

  async closeAll() {
    console.log(`🛑 Closing all data source pools...`);
    const closePromises = [];
    for (const [name, entry] of this.sources.entries()) {
      console.log(`   Closing data source: ${name}`);
      closePromises.push(entry.sequelize.close());
    }
    await Promise.all(closePromises);
    this.sources.clear();
    console.log(`✅ All data source pools closed`);
  }
}

export default new DataSourceManager();