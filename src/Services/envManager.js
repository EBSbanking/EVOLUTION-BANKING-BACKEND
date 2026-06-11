// services/envManager.js
import db from '../../config/db.js';

class EnvManager {
  constructor() {
    this.cache = new Map();
    this.listeners = new Map(); // pluginId -> callback
  }

  // ✅ NEW: Create the table if it doesn't exist
  async ensureTable() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS admin_env_vars (
          id INT PRIMARY KEY AUTO_INCREMENT,
          \`key\` VARCHAR(255) NOT NULL UNIQUE,
          \`value\` TEXT,
          description TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Admin env vars table ready');
    } catch (err) {
      console.error('❌ Failed to create admin_env_vars table:', err.message);
      throw err;
    }
  }

  async loadAll() {
    // ✅ Ensure table exists before querying
    await this.ensureTable();

    const [rows] = await db.query('SELECT `key`, `value` FROM admin_env_vars');
    rows.forEach(row => this.cache.set(row.key, row.value));
  }

  async get(key, defaultValue = null) {
    return this.cache.get(key) ?? defaultValue;
  }

  async set(key, value, description = '') {
    // Ensure table exists (though loadAll already did, but in case set is called before loadAll)
    await this.ensureTable();

    await db.query(
      'INSERT INTO admin_env_vars (`key`, `value`, description, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = NOW()',
      [key, value, description, value]
    );
    this.cache.set(key, value);
    // Notify all listening plugins
    for (const [pluginId, callback] of this.listeners.entries()) {
      try { callback(key, value); } catch (err) { console.error(err); }
    }
  }

  subscribe(pluginId, callback) {
    this.listeners.set(pluginId, callback);
  }

  unsubscribe(pluginId) {
    this.listeners.delete(pluginId);
  }
}

export default new EnvManager();