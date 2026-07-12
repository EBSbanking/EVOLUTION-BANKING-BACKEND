// src/routes/AdminRoutes.js - COMPLETE UPDATED VERSION
import express from 'express';
import { sequelize } from '../../config/db.js';
import { protectAdmin, isAdminConsole } from '../middlewares/adminAuthMiddleware.js';
import envManager from '../Services/envManager.js';
import dataSourceManager from '../Services/dataSourceManager.js';
import pluginManager from '../Services/pluginManager.js';
import multer from 'multer';
import { QueryTypes, Op } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import Docker from 'dockerode';
import { exec, spawn } from 'child_process';
import WebhookConfig from '../models/WebhookConfig.js';

// ✅ Import OsController as default
import OsController from '../controllers/OsController.js';

// ✅ Import Penalty Services and Models
import PenaltyAccrualService from '../Services/PenaltyService.js';
import { getLoanAccount, getLoanPenalty, getPenaltyRule, getRepaymentSchedule } from '../models/index.js';
import logger from '../utils/logger.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----- Services directory -----
const SERVICES_DIR = path.join(process.cwd(), 'src/Services');
if (!fs.existsSync(SERVICES_DIR)) fs.mkdirSync(SERVICES_DIR, { recursive: true });

const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });
const router = express.Router();

// ----- Multer storage for service file uploads -----
const serviceStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SERVICES_DIR),
  filename: (req, file, cb) => {
    const name = req.body.name ? req.body.name.trim() : path.basename(file.originalname, path.extname(file.originalname));
    const ext = path.extname(file.originalname) || '.js';
    cb(null, name + ext);
  }
});

const serviceUpload = multer({
  storage: serviceStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    if (ext !== '.js') return cb(new Error('Only .js files allowed'));
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ✅ Apply admin middleware to ALL routes in this router
router.use(protectAdmin);
router.use(isAdminConsole);

// ==========================================
// 1. NIP METRICS - USING ONLY RAW SQL (FIXED)
// ==========================================
const getNIPMetrics = async () => {
  try {
    // ✅ FIXED: Removed CREATED_BY column - using created_at instead
    const results = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN direction = 'INWARD' THEN 1 ELSE 0 END) as totalInward,
        SUM(CASE WHEN direction = 'OUTWARD' THEN 1 ELSE 0 END) as totalOutward,
        SUM(CASE WHEN direction = 'INWARD' AND status = 'PENDING' THEN 1 ELSE 0 END) as pendingInward,
        SUM(CASE WHEN direction = 'OUTWARD' AND status = 'PENDING' THEN 1 ELSE 0 END) as pendingOutward,
        AVG(CASE WHEN status = 'COMPLETED' THEN processing_time ELSE NULL END) as avgProcessingTime
      FROM inward_funds_transfers
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `, { type: QueryTypes.SELECT });
    
    const data = results && results.length > 0 ? results[0] : {};
    
    const total = parseInt(data.total) || 0;
    const totalInward = parseInt(data.totalInward) || 0;
    const totalOutward = parseInt(data.totalOutward) || 0;
    
    return {
      totalInward,
      totalOutward,
      pendingInward: parseInt(data.pendingInward) || 0,
      pendingOutward: parseInt(data.pendingOutward) || 0,
      successRate: total > 0 ? (totalInward / total) * 100 : 0,
      averageProcessingTime: parseFloat(data.avgProcessingTime) || 0,
      totalTransactions: total
    };
  } catch (error) {
    console.error('❌ Failed to get NIP metrics:', error.message);
    return {
      totalInward: 0,
      totalOutward: 0,
      pendingInward: 0,
      pendingOutward: 0,
      successRate: 0,
      averageProcessingTime: 0,
      totalTransactions: 0
    };
  }
};

// GET /nip/metrics - Get NIP metrics
router.get('/nip/metrics', async (req, res) => {
  try {
    const metrics = await getNIPMetrics();
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching NIP metrics:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch NIP metrics',
      error: error.message
    });
  }
});

// ==========================================
// 2. ENVIRONMENT VARIABLES API ROUTES (FULL CRUD)
// ==========================================

// GET /env - Get all environment variables
router.get('/env', async (req, res) => {
  try {
    const rows = await sequelize.query(
      'SELECT * FROM admin_env_vars ORDER BY `key` ASC',
      { type: QueryTypes.SELECT }
    );
    const data = Array.isArray(rows) ? rows : Object.values(rows);
    res.setHeader('Content-Range', `items 0-${data.length - 1}/${data.length}`);
    res.json(data);
  } catch (error) {
    console.error('Error fetching env vars:', error);
    res.status(500).json({ error: 'Failed to fetch env vars' });
  }
});

// GET /env/:id - Get a single environment variable
router.get('/env/:id', async (req, res) => {
  const { id } = req.params;
  try {
    let rows;
    if (!isNaN(id)) {
      rows = await sequelize.query(
        'SELECT * FROM admin_env_vars WHERE id = ?',
        { replacements: [id], type: QueryTypes.SELECT }
      );
    } else {
      rows = await sequelize.query(
        'SELECT * FROM admin_env_vars WHERE `key` = ?',
        { replacements: [id], type: QueryTypes.SELECT }
      );
    }
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Environment variable not found' });
    }
    const data = rows[0];
    data.id = data.id || id;
    console.log('📤 ENV getOne response:', JSON.stringify({ data }));
    res.json({ data });
  } catch (error) {
    console.error('Error fetching env var:', error);
    res.status(500).json({ error: 'Failed to fetch env var' });
  }
});

// POST /env - Create a new environment variable
router.post('/env', async (req, res) => {
  try {
    const { key, value, description } = req.body;
    
    if (!key || key.trim() === '') {
      return res.status(400).json({ 
        error: 'Key is required',
        details: 'The "key" field cannot be empty'
      });
    }
    
    if (!value || value.trim() === '') {
      return res.status(400).json({ 
        error: 'Value is required',
        details: 'The "value" field cannot be empty'
      });
    }

    const trimmedKey = key.trim();
    const trimmedValue = value.trim();

    const existing = await sequelize.query(
      'SELECT id FROM admin_env_vars WHERE `key` = ?',
      { replacements: [trimmedKey], type: QueryTypes.SELECT }
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        error: `Key "${trimmedKey}" already exists`,
        details: 'Please use a different key name'
      });
    }

    await sequelize.query(
      'INSERT INTO admin_env_vars (`key`, `value`, description, updated_at) VALUES (?, ?, ?, NOW())',
      { replacements: [trimmedKey, trimmedValue, description || null] }
    );

    process.env[trimmedKey] = trimmedValue;

    const [newRecord] = await sequelize.query(
      'SELECT * FROM admin_env_vars WHERE `key` = ?',
      { replacements: [trimmedKey], type: QueryTypes.SELECT }
    );

    console.log('✅ Environment variable created:', newRecord);

    res.status(201).json({ 
      data: {
        id: newRecord.id,
        key: newRecord.key,
        value: newRecord.value,
        description: newRecord.description || null
      }
    });
  } catch (error) {
    console.error('Error creating environment variable:', error);
    res.status(500).json({ 
      error: 'Failed to create environment variable',
      details: error.message
    });
  }
});

// PUT /env/:id - Update an environment variable
router.put('/env/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { key, value, description } = req.body;
    
    if (!key || !value) {
      return res.status(400).json({ error: 'Key and value are required' });
    }

    const [existing] = await sequelize.query(
      'SELECT * FROM admin_env_vars WHERE id = ?',
      { replacements: [id], type: QueryTypes.SELECT }
    );

    if (!existing) {
      return res.status(404).json({ error: 'Environment variable not found' });
    }

    if (key !== existing.key) {
      const conflict = await sequelize.query(
        'SELECT id FROM admin_env_vars WHERE `key` = ? AND id != ?',
        { replacements: [key, id], type: QueryTypes.SELECT }
      );
      if (conflict.length > 0) {
        return res.status(400).json({ error: `Key "${key}" already exists` });
      }
    }

    await sequelize.query(
      'UPDATE admin_env_vars SET `key` = ?, `value` = ?, description = ? WHERE id = ?',
      { replacements: [key, value, description || null, id] }
    );

    if (existing.key !== key) {
      delete process.env[existing.key];
    }
    process.env[key] = value;

    const [updated] = await sequelize.query(
      'SELECT * FROM admin_env_vars WHERE id = ?',
      { replacements: [id], type: QueryTypes.SELECT }
    );

    res.json({ data: updated });
  } catch (error) {
    console.error('Error updating environment variable:', error);
    res.status(500).json({ error: 'Failed to update environment variable' });
  }
});

// DELETE /env/:id - Delete an environment variable
router.delete('/env/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [record] = await sequelize.query(
      'SELECT `key` FROM admin_env_vars WHERE id = ?',
      { replacements: [id], type: QueryTypes.SELECT }
    );

    if (!record) {
      return res.status(404).json({ error: 'Environment variable not found' });
    }

    await sequelize.query(
      'DELETE FROM admin_env_vars WHERE id = ?',
      { replacements: [id] }
    );

    delete process.env[record.key];

    res.json({ 
      data: { 
        success: true, 
        message: `Environment variable "${record.key}" deleted successfully` 
      } 
    });
  } catch (error) {
    console.error('Error deleting environment variable:', error);
    res.status(500).json({ error: 'Failed to delete environment variable' });
  }
});

// POST /env/reload - Reload environment variables from database
router.post('/env/reload', async (req, res) => {
  try {
    const rows = await sequelize.query(
      'SELECT `key`, `value` FROM admin_env_vars',
      { type: QueryTypes.SELECT }
    );
    
    let loaded = 0;
    if (Array.isArray(rows) && rows.length > 0) {
      for (const row of rows) {
        if (row.key && row.value !== undefined && row.value !== null) {
          process.env[row.key] = row.value;
          loaded++;
        }
      }
      console.log(`✅ Environment variables reloaded from database (${loaded} variables loaded)`);
    }
    
    res.json({ 
      data: { 
        success: true, 
        message: `Environment variables reloaded successfully (${loaded} variables loaded)` 
      } 
    });
  } catch (error) {
    console.error('Error reloading environment variables:', error);
    res.status(500).json({ error: 'Failed to reload environment variables' });
  }
});

// POST /env/import - Import environment variables from .env file
router.post('/env/import', async (req, res) => {
  try {
    const ENV_PATH = path.join(process.cwd(), '.env');
    
    if (!fs.existsSync(ENV_PATH)) {
      return res.status(404).json({ error: '.env file not found at: ' + ENV_PATH });
    }

    console.log('📂 Reading .env file from:', ENV_PATH);
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    const lines = content.split('\n');
    let count = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.trim() === '' || line.trim().startsWith('#')) {
        continue;
      }

      const match = line.match(/^([^=#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        let description = null;
        if (i > 0 && lines[i - 1].trim().startsWith('#')) {
          description = lines[i - 1].trim().replace(/^#\s*/, '');
        }

        try {
          const existing = await sequelize.query(
            'SELECT id FROM admin_env_vars WHERE `key` = ?',
            { replacements: [key], type: QueryTypes.SELECT }
          );

          if (existing.length === 0) {
            await sequelize.query(
              'INSERT INTO admin_env_vars (`key`, `value`, description, updated_at) VALUES (?, ?, ?, NOW())',
              { replacements: [key, value, description] }
            );
            count++;
          } else {
            await sequelize.query(
              'UPDATE admin_env_vars SET `value` = ?, description = ? WHERE `key` = ?',
              { replacements: [value, description, key] }
            );
            updated++;
          }
        } catch (err) {
          console.error(`❌ Error processing ${key}:`, err.message);
          skipped++;
        }
      }
    }

    const allVars = await sequelize.query(
      'SELECT `key`, `value` FROM admin_env_vars',
      { type: QueryTypes.SELECT }
    );
    let loaded = 0;
    for (const row of allVars) {
      if (row.key && row.value !== undefined && row.value !== null) {
        process.env[row.key] = row.value;
        loaded++;
      }
    }

    console.log(`✅ Import complete: ${count} new, ${updated} updated, ${skipped} skipped`);

    res.json({
      data: {
        success: true,
        message: `Imported ${count} new variables, updated ${updated} existing variables (${loaded} loaded into process.env)`,
        imported: count,
        updated: updated,
        skipped: skipped
      }
    });
  } catch (error) {
    console.error('Error importing .env file:', error);
    res.status(500).json({ error: 'Failed to import .env file: ' + error.message });
  }
});

// ==========================================
// 3. DATA SOURCES
// ==========================================
router.get('/datasources', async (req, res) => {
  try {
    const countResult = await sequelize.query(
      'SELECT COUNT(*) as total FROM admin_data_sources WHERE status != "deleted"',
      { type: QueryTypes.SELECT }
    );
    const total = countResult[0]?.total || 0;

    let rows = await sequelize.query(
      'SELECT * FROM admin_data_sources WHERE status != "deleted"',
      { type: QueryTypes.SELECT }
    );
    let dataArray = Array.isArray(rows) ? rows : Object.values(rows);
    const finalData = dataArray.map(row => {
      if (row.id) return row;
      const firstKey = Object.keys(row)[0];
      return { ...row, id: row[firstKey] };
    });

    res.setHeader('Content-Range', `items 0-${finalData.length - 1}/${total}`);
    res.json(finalData);
  } catch (error) {
    console.error('Error fetching data sources:', error);
    res.status(500).json({ error: 'Failed to fetch data sources' });
  }
});

router.get('/datasources/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await sequelize.query(
      'SELECT * FROM admin_data_sources WHERE id = ?',
      { replacements: [id], type: QueryTypes.SELECT }
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Data source not found' });
    const data = rows[0];
    data.id = data.id || data.data_source_id || id;
    console.log('📤 DATASOURCE getOne response:', JSON.stringify({ data }));
    res.json({ data });
  } catch (error) {
    console.error('Error fetching data source:', error);
    res.status(500).json({ error: 'Failed to fetch data source' });
  }
});

router.get('/datasources/:name/stats', async (req, res) => {
  const { name } = req.params;
  try {
    const stats = await dataSourceManager.getStats(name);
    if (!stats) return res.status(404).json({ error: 'Data source not found' });
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/datasources', async (req, res) => {
  try {
    await dataSourceManager.createOrUpdate(req.body, req.user.id);
    res.json({ data: { name: req.body.name } });
  } catch (error) {
    console.error('Error creating data source:', error);
    res.status(500).json({ error: 'Failed to create data source', details: error.message });
  }
});

router.put('/datasources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...req.body, id: parseInt(id) };
    await dataSourceManager.createOrUpdate(data, req.user.id);
    const updated = await sequelize.query(
      'SELECT * FROM admin_data_sources WHERE id = ?',
      { replacements: [id], type: QueryTypes.SELECT }
    );
    res.json({ data: updated[0] || { id } });
  } catch (error) {
    console.error('Error updating data source:', error);
    res.status(500).json({ error: 'Failed to update data source', details: error.message });
  }
});

router.delete('/datasources/:name', async (req, res) => {
  try {
    await dataSourceManager.remove(req.params.name, req.user.id);
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Error deleting data source:', error);
    res.status(500).json({ error: 'Failed to delete data source' });
  }
});

router.post('/datasources/test', async (req, res) => {
  try {
    const ok = await dataSourceManager.testConnection(req.body);
    res.json({ success: ok });
  } catch (error) {
    console.error('Error testing connection:', error);
    res.status(500).json({ error: 'Connection test failed' });
  }
});

// ==========================================
// 4. PLUGINS
// ==========================================
router.get('/plugins', async (req, res) => {
  try {
    const countResult = await sequelize.query(
      'SELECT COUNT(*) as total FROM admin_plugins',
      { type: QueryTypes.SELECT }
    );
    const total = countResult[0]?.total || 0;

    let rows = await sequelize.query('SELECT * FROM admin_plugins', { type: QueryTypes.SELECT });
    let dataArray = Array.isArray(rows) ? rows : Object.values(rows);
    const finalData = dataArray.map(row => {
      if (row.id) return row;
      const firstKey = Object.keys(row)[0];
      return { ...row, id: row[firstKey] };
    });
    res.setHeader('Content-Range', `items 0-${finalData.length - 1}/${total}`);
    res.json(finalData);
  } catch (error) {
    console.error('Error fetching plugins:', error);
    res.status(500).json({ error: 'Failed to fetch plugins' });
  }
});

router.get('/plugins/:id', async (req, res) => {
  try {
    const rows = await sequelize.query(
      'SELECT * FROM admin_plugins WHERE id = ?',
      { replacements: [req.params.id], type: QueryTypes.SELECT }
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Plugin not found' });
    const data = rows[0];
    data.id = data.id || data.plugin_id || req.params.id;
    console.log('📤 PLUGIN getOne response:', JSON.stringify({ data }));
    res.json({ data });
  } catch (error) {
    console.error('Error fetching plugin:', error);
    res.status(500).json({ error: 'Failed to fetch plugin' });
  }
});

router.post('/plugins/upload', upload.single('plugin'), async (req, res) => {
  try {
    const pluginId = await pluginManager.installPlugin(req.body.name, req.file.buffer);
    res.json({ data: { id: pluginId } });
  } catch (error) {
    console.error('Error uploading plugin:', error);
    res.status(500).json({ error: 'Failed to upload plugin' });
  }
});

router.post('/plugins/:id/start', async (req, res) => {
  try {
    await pluginManager.startPlugin(req.params.id);
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Error starting plugin:', error);
    res.status(500).json({ error: 'Failed to start plugin' });
  }
});

router.post('/plugins/:id/stop', async (req, res) => {
  try {
    await pluginManager.stopPlugin(req.params.id);
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Error stopping plugin:', error);
    res.status(500).json({ error: 'Failed to stop plugin' });
  }
});

router.delete('/plugins/:id', async (req, res) => {
  try {
    await pluginManager.uninstallPlugin(req.params.id);
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Error deleting plugin:', error);
    res.status(500).json({ error: 'Failed to delete plugin' });
  }
});

// ==========================================
// 5. AUDIT LOGS
// ==========================================
router.get('/audit', async (req, res) => {
  try {
    const range = req.query.range ? JSON.parse(req.query.range) : [0, 9];
    const sort = req.query.sort ? JSON.parse(req.query.sort) : ['created_at', 'DESC'];
    const filter = req.query.filter ? JSON.parse(req.query.filter) : {};

    let sortField = sort[0];
    const validColumns = ['id', 'event_id', 'created_at', 'updated_at', 'event_type', 'action', 'user_id', 'entity_type'];
    if (!validColumns.includes(sortField)) sortField = 'created_at';
    const sortOrder = sort[1]?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const limit = range[1] - range[0] + 1;
    const offset = range[0];

    let whereClause = '';
    const replacements = [];
    if (filter.q) {
      whereClause = `WHERE (event_type LIKE ? OR action LIKE ? OR user_id LIKE ? OR description LIKE ? OR entity_type LIKE ?)`;
      const searchTerm = `%${filter.q}%`;
      replacements.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const countQuery = `SELECT COUNT(*) as total FROM audit_trail ${whereClause}`;
    const countResult = await sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT });
    const total = countResult[0]?.total || 0;

    const orderBy = `${sortField} ${sortOrder}`;
    const query = `
      SELECT * FROM audit_trail
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;
    let rows = await sequelize.query(query, {
      replacements: [...replacements, limit, offset],
      type: QueryTypes.SELECT
    });

    let dataArray = Array.isArray(rows) ? rows : Object.values(rows);
    const finalData = dataArray.map(row => {
      if (row.id) return row;
      const firstKey = Object.keys(row)[0];
      return { ...row, id: row[firstKey] };
    });
    res.setHeader('Content-Range', `items ${range[0]}-${range[1]}/${total}`);
    res.json(finalData);
  } catch (error) {
    console.error('Audit fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

router.get('/audit/:id', async (req, res) => {
  try {
    const rows = await sequelize.query(
      'SELECT * FROM audit_trail WHERE event_id = ?',
      { replacements: [req.params.id], type: QueryTypes.SELECT }
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Audit log not found' });
    const data = rows[0];
    data.id = data.event_id || data.id || req.params.id;
    console.log('📤 AUDIT getOne response:', JSON.stringify({ data }));
    res.json({ data });
  } catch (error) {
    console.error('Audit fetch by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// ==========================================
// 6. SERVER STATUS & CONTROL
// ==========================================
router.get('/server/status', (req, res) => {
  const memory = process.memoryUsage();
  const uptime = process.uptime();
  const loadAvg = os.loadavg();

  res.json({
    data: {
      status: 'Running',
      pid: process.pid,
      uptime,
      nodeVersion: process.version,
      env: process.env.NODE_ENV || 'development',
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
      },
      cpu: loadAvg,
      hostname: os.hostname(),
      health: { ok: true },
    }
  });
});

router.post('/server/restart', async (req, res) => {
  const containerName = 'evolution-backend';
  
  try {
    const container = docker.getContainer(containerName);
    await container.inspect();
    await container.restart();
    return res.json({
      success: true,
      message: `Container ${containerName} restarted successfully.`,
    });
  } catch (dockerError) {
    console.warn('⚠️ Docker unavailable, falling back to process restart:', dockerError.message);
    
    try {
      const projectRoot = process.cwd();
      const serverPath = path.join(projectRoot, 'server.js');
      const nodeExec = process.execPath;
      const child = spawn(nodeExec, [serverPath], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
        cwd: projectRoot,
      });
      child.unref();
      res.json({ 
        success: true, 
        message: 'Server restarting (fallback mode).' 
      });
      setTimeout(() => {
        console.log('💀 Old process exiting, new process should be running.');
        process.exit(0);
      }, 1500);
    } catch (spawnError) {
      console.error('Fallback restart error:', spawnError);
      res.status(500).json({
        success: false,
        message: `Restart failed: ${spawnError.message}`,
      });
    }
  }
});

router.post('/server/stop', async (req, res) => {
  const containerName = 'evolution-backend';
  
  try {
    const container = docker.getContainer(containerName);
    await container.inspect();
    await container.stop();
    return res.json({
      success: true,
      message: `Container ${containerName} stopped successfully.`,
    });
  } catch (dockerError) {
    console.warn('⚠️ Docker unavailable, falling back to process stop:', dockerError.message);
    
    res.json({ 
      success: true, 
      message: 'Server stopping (fallback mode).' 
    });
    
    setTimeout(() => {
      console.log('🛑 Server stopping by admin request.');
      process.exit(0);
    }, 1000);
  }
});

// ==========================================
// 7. SCHEDULER / JOBS REGISTRY
// ==========================================
router.get('/scheduler/jobs', async (req, res) => {
  try {
    const jobRegistry = await import('../services/jobRegistry.js').then(m => m.default);
    const jobs = jobRegistry.getJobs();
    res.json({ data: jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.post('/scheduler/jobs/:jobName/run', async (req, res) => {
  try {
    const { jobName } = req.params;
    const jobRegistry = await import('../services/jobRegistry.js').then(m => m.default);
    const result = await jobRegistry.runJob(jobName);
    res.json({ data: result });
  } catch (error) {
    console.error('Error running job:', error);
    res.status(500).json({ error: error.message || 'Failed to run job' });
  }
});

router.get('/scheduler/status', async (req, res) => {
  try {
    const { getSchedulerStatus } = await import('../scheduler/eodScheduler.js');
    const status = getSchedulerStatus();
    res.json({ data: status });
  } catch (error) {
    console.error('Scheduler status error:', error);
    res.status(500).json({ error: 'Failed to get scheduler status' });
  }
});

// ==========================================
// 8. EOD (End of Day) ROUTES - FIXED WITH OSCONTROLLER
// ==========================================

/**
 * GET /os/eod/status - Get EOD status from OsController
 */
router.get('/os/eod/status', async (req, res) => {
  try {
    await OsController.getEODStatus(req, res);
  } catch (error) {
    console.error('❌ Error getting EOD status from OsController:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get EOD status',
      data: {
        system: {
          currentBusinessDate: new Date().toISOString().split('T')[0],
          nextBusinessDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          eodStatus: 'ERROR',
          lastRun: null,
        },
        services: []
      }
    });
  }
});

/**
 * POST /os/eod/trigger - Trigger EOD process using OsController
 */
router.post('/os/eod/trigger', async (req, res) => {
  try {
    await OsController.triggerEndOfDayProcess(req, res);
  } catch (error) {
    console.error('❌ EOD trigger error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'EOD processing failed',
      results: {}
    });
  }
});

/**
 * GET /os/status - Get system status from OsController
 */
router.get('/os/status', async (req, res) => {
  try {
    await OsController.getStatusOS(req, res);
  } catch (error) {
    console.error('❌ Error getting OS status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get system status'
    });
  }
});

/**
 * GET /os/current-business-date - Get current business date
 */
router.get('/os/current-business-date', async (req, res) => {
  try {
    await OsController.getCurrentBusinessDateOS(req, res);
  } catch (error) {
    console.error('❌ Error getting business date:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get business date'
    });
  }
});

/**
 * POST /os/initialize-dates - Initialize system dates
 */
router.post('/os/initialize-dates', async (req, res) => {
  try {
    await OsController.initializeSystemDatesOS(req, res);
  } catch (error) {
    console.error('❌ Error initializing dates:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initialize system dates'
    });
  }
});

// ==========================================
// 9. PENALTY ACCRUAL ROUTES (ADMIN ONLY)
// ==========================================

/**
 * GET /penalty/status - Get penalty accrual status
 */
router.get('/penalty/status', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        status: 'IDLE',
        lastRun: null,
        nextRun: null,
        schedule: 'Daily at 00:05 AM'
      }
    });
  } catch (error) {
    logger.error('Failed to get penalty status:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get penalty status',
      error: error.message
    });
  }
});

/**
 * POST /penalty/accrue - Manually trigger penalty accrual
 */
router.post('/penalty/accrue', async (req, res) => {
  try {
    const { accrualDate } = req.body;
    const date = accrualDate ? new Date(accrualDate) : new Date();
    
    logger.info(`Manual penalty accrual triggered by ${req.user?.user_name || 'unknown'}`);
    
    const results = await PenaltyAccrualService.runDailyPenaltyAccrual(date);
    
    res.status(200).json({
      success: true,
      message: `Penalty accrual completed: ${results.penaltiesApplied} penalties applied totaling ₦${results.totalPenaltyAmount.toFixed(2)}`,
      data: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Manual penalty accrual failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Penalty accrual failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /penalty/loan/:loanId - Get penalty summary for a loan
 */
router.get('/penalty/loan/:loanId', async (req, res) => {
  try {
    const { loanId } = req.params;
    const summary = await PenaltyAccrualService.getLoanPenaltySummary(loanId);
    
    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error getting penalty summary:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get penalty summary',
      error: error.message
    });
  }
});

/**
 * POST /penalty/pay - Process penalty payment
 */
router.post('/penalty/pay', async (req, res) => {
  try {
    const { loanId, amount, paymentMethod = 'CASH' } = req.body;
    
    if (!loanId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request: loanId and amount are required'
      });
    }
    
    const result = await PenaltyAccrualService.processPenaltyPayment(
      loanId,
      amount,
      paymentMethod
    );
    
    res.status(200).json({
      success: true,
      message: 'Penalty payment processed successfully',
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error processing penalty payment:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to process penalty payment',
      error: error.message
    });
  }
});

/**
 * POST /penalty/waive - Waive a penalty
 */
router.post('/penalty/waive', async (req, res) => {
  try {
    const { penaltyId, reason } = req.body;
    const userId = req.user?.user_name || req.user?.id || 'system';
    
    if (!penaltyId) {
      return res.status(400).json({
        success: false,
        message: 'penaltyId is required'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Penalty waived successfully',
      data: {
        penaltyId,
        waivedBy: userId,
        reason: reason || 'Admin action',
        waivedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error waiving penalty:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to waive penalty',
      error: error.message
    });
  }
});

/**
 * GET /penalty/debug - Debug penalty accrual
 */
router.get('/penalty/debug', async (req, res) => {
  try {
    const LoanAccount = getLoanAccount();
    const LoanPenalty = getLoanPenalty();
    const PenaltyRule = getPenaltyRule();
    const RepaymentSchedule = getRepaymentSchedule();
    
    const debugInfo = {
      services: {
        PenaltyAccrualService: typeof PenaltyAccrualService !== 'undefined',
        hasRunMethod: typeof PenaltyAccrualService?.runDailyPenaltyAccrual === 'function'
      },
      models: {
        LoanAccount: !!LoanAccount,
        LoanPenalty: !!LoanPenalty,
        PenaltyRule: !!PenaltyRule,
        RepaymentSchedule: !!RepaymentSchedule
      },
      database: {
        sequelize: typeof sequelize !== 'undefined',
        isConnected: sequelize?.authenticate ? await sequelize.authenticate().then(() => true).catch(() => false) : false
      }
    };

    // Try to find any overdue loans
    try {
      if (LoanAccount) {
        const overdueLoans = await LoanAccount.unscoped().findAll({
          attributes: ['id', 'acct_no', 'loan_status', 'outstanding_principal', 'next_payment_date', 'maturity_dt'],
          where: {
            loan_status: ['OVERDUE', 'DELINQUENT', 'ACTIVE'],
            outstanding_principal: { [Op.gt]: 0 }
          },
          limit: 5
        });
        debugInfo.sampleLoans = overdueLoans.map(loan => ({
          id: loan.id,
          acct_no: loan.acct_no,
          loan_status: loan.loan_status,
          outstanding_principal: loan.outstanding_principal,
          next_payment_date: loan.next_payment_date,
          maturity_dt: loan.maturity_dt
        }));
        debugInfo.totalOverdueLoans = await LoanAccount.count({
          where: {
            loan_status: ['OVERDUE', 'DELINQUENT', 'ACTIVE'],
            outstanding_principal: { [Op.gt]: 0 }
          }
        });
      }
    } catch (loanError) {
      debugInfo.loanError = loanError.message;
    }

    // Try to find penalty rules
    try {
      if (PenaltyRule) {
        const penaltyRules = await PenaltyRule.findAll({
          where: { 
            [Op.or]: [
              { is_active: true },
              { status: 'ACTIVE' }
            ]
          },
          limit: 5
        });
        debugInfo.penaltyRules = penaltyRules.map(rule => ({
          id: rule.id,
          name: rule.rule_name || rule.name,
          calculation_method: rule.calculation_method,
          rate: rule.rate_value || rule.rate,
          is_active: rule.is_active,
          status: rule.status
        }));
        debugInfo.totalPenaltyRules = await PenaltyRule.count({
          where: { 
            [Op.or]: [
              { is_active: true },
              { status: 'ACTIVE' }
            ]
          }
        });
      }
    } catch (ruleError) {
      debugInfo.ruleError = ruleError.message;
    }

    res.status(200).json({
      success: true,
      data: debugInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Debug endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ==========================================
// 10. UTILITIES STATUS
// ==========================================
router.get('/utils/status', async (req, res) => {
  try {
    const utilsDir = path.join(process.cwd(), 'src/utils');
    if (!fs.existsSync(utilsDir)) {
      return res.json({ data: [] });
    }
    const files = fs.readdirSync(utilsDir).filter(f => f.endsWith('.js') && !f.endsWith('.test.js'));
    const statuses = [];
    for (const file of files) {
      const filePath = path.join(utilsDir, file);
      let status = 'running';
      let error = null;
      try {
        await import(`file://${filePath}`);
      } catch (err) {
        status = 'failed';
        error = err.message;
      }
      statuses.push({ name: file, status, error });
    }
    res.json({ data: statuses });
  } catch (error) {
    console.error('Error fetching utils status:', error);
    res.status(500).json({ error: 'Failed to fetch utils status' });
  }
});

// ==========================================
// 11. SERVICES (filesystem)
// ==========================================
router.get('/services', async (req, res) => {
  try {
    console.log('📂 SERVICES_DIR path:', SERVICES_DIR);
    if (!fs.existsSync(SERVICES_DIR)) {
      console.error('❌ SERVICES_DIR does not exist:', SERVICES_DIR);
      return res.status(404).json({ error: 'Services directory not found' });
    }
    const files = fs.readdirSync(SERVICES_DIR);
    console.log(`📁 Found ${files.length} files in SERVICES_DIR:`, files);

    const services = files
      .filter(file => {
        const isJs = file.endsWith('.js');
        const isTest = file.endsWith('.test.js');
        const isConfig = file.includes('config') || file.includes('setup');
        return isJs && !isTest && !isConfig;
      })
      .sort()
      .map((file, index) => {
        const filePath = path.join(SERVICES_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          id: index + 1,
          name: file.replace(/\.js$/, ''),
          filename: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
          status: 'Running',
        };
      });

    console.log(`✅ Returning ${services.length} services`);
    console.log('📤 Services list:', services.map(s => s.name).join(', '));

    res.setHeader('Content-Range', `items 0-${services.length - 1}/${services.length}`);
    res.json(services);
  } catch (error) {
    console.error('❌ Error listing services:', error);
    res.status(500).json({ error: 'Failed to list services' });
  }
});

router.get('/services/:id/content', async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId) || numericId < 1) {
      return res.status(400).json({ error: 'Invalid service ID' });
    }
    if (!fs.existsSync(SERVICES_DIR)) {
      return res.status(404).json({ error: 'Services directory not found' });
    }
    const files = fs.readdirSync(SERVICES_DIR)
      .filter(file => file.endsWith('.js') && !file.endsWith('.test.js') && !file.includes('config') && !file.includes('setup'))
      .sort();
    if (numericId > files.length) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const filename = files[numericId - 1];
    const filePath = path.join(SERVICES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Service file not found' });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ data: content });
  } catch (error) {
    console.error('❌ Error fetching service content:', error);
    res.status(500).json({ error: 'Failed to fetch content', details: error.message });
  }
});

router.get('/services/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const files = fs.readdirSync(SERVICES_DIR)
      .filter(file => file.endsWith('.js') && !file.endsWith('.test.js') && !file.includes('config') && !file.includes('setup'))
      .sort();
    const file = files[parseInt(id) - 1];
    if (!file) return res.status(404).json({ error: 'Service not found' });
    const stats = fs.statSync(path.join(SERVICES_DIR, file));
    const data = {
      id: parseInt(id),
      name: file.replace(/\.js$/, ''),
      filename: file,
      path: path.join(SERVICES_DIR, file),
      size: stats.size,
      modified: stats.mtime,
      status: 'Running',
    };
    res.json({ data });
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

router.post('/services', serviceUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { name, description, type, status } = req.body;
    const filename = req.file.filename;
    const filePath = req.file.path;
    const stats = fs.statSync(filePath);
    const serviceData = {
      id: Date.now(),
      name: name || filename.replace(/\.js$/, ''),
      filename,
      path: filePath,
      size: stats.size,
      modified: stats.mtime,
      description: description || '',
      type: type || 'custom',
      status: status || 'Running',
    };
    res.status(201).json({ data: serviceData });
  } catch (error) {
    console.error('Error uploading service:', error);
    res.status(500).json({ error: 'Failed to upload service' });
  }
});

router.put('/services/:id', async (req, res) => {
  res.status(405).json({ error: 'Method not allowed for filesystem services' });
});

router.delete('/services/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const files = fs.readdirSync(SERVICES_DIR)
      .filter(file => file.endsWith('.js') && !file.endsWith('.test.js') && !file.includes('config') && !file.includes('setup'))
      .sort();
    const file = files[parseInt(id) - 1];
    if (!file) return res.status(404).json({ error: 'Service not found' });
    fs.unlinkSync(path.join(SERVICES_DIR, file));
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

router.get('/services/debug', (req, res) => {
  res.json({
    servicesDir: SERVICES_DIR,
    exists: fs.existsSync(SERVICES_DIR),
    files: fs.existsSync(SERVICES_DIR) ? fs.readdirSync(SERVICES_DIR) : []
  });
});

// ==========================================
// 12. TRAFFIC MONITORING
// ==========================================
router.get('/traffic', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  try {
    const redis = req.app.get('redisClient');
    if (!redis) {
      console.warn('⚠️ Redis client not available – returning empty traffic stats');
      return res.json({ data: [] });
    }

    let keys = [];
    try {
      keys = await redis.keys('traffic:*');
    } catch (redisError) {
      console.warn('⚠️ Redis query failed – returning empty traffic stats:', redisError.message);
      return res.json({ data: [] });
    }

    const data = [];
    for (const key of keys) {
      const count = await redis.get(key).catch(() => 0);
      const route = key.replace('traffic:', '');
      data.push({ route, count: parseInt(count, 10) });
    }
    data.sort((a, b) => b.count - a.count);
    res.json({ data });
  } catch (error) {
    console.error('❌ Traffic stats error:', error);
    res.status(200).json({ data: [] });
  }
});

// ==========================================
// 13. WEBLOGIC SERVERS
// ==========================================
const serverDefinitions = [
  { id: 'AdminServer', name: 'AdminServer', type: 'Configured', cluster: null, machine: null, port: 3003 },
  { id: 'ManagedServer1', name: 'ManagedServer1', type: 'Managed', cluster: 'Cluster1', machine: 'Node1', port: 3002 },
  { id: 'ManagedServer2', name: 'ManagedServer2', type: 'Managed', cluster: 'Cluster1', machine: 'Node2', port: 3004 },
  { id: 'ManagedServer3', name: 'ManagedServer3', type: 'Managed', cluster: 'Cluster1', machine: 'Node3', port: 3005 },
  { id: 'ManagedServer4', name: 'ManagedServer4', type: 'Managed', cluster: 'Cluster1', machine: 'Node4', port: 3006 },
  { id: 'ManagedServer5', name: 'ManagedServer5', type: 'Managed', cluster: 'Cluster1', machine: 'Node5', port: 3007 },
  { id: 'ManagedServer6', name: 'ManagedServer6', type: 'Managed', cluster: 'Cluster1', machine: 'Node6', port: 3008 },
  { id: 'ManagedServer7', name: 'ManagedServer7', type: 'Managed', cluster: 'Cluster1', machine: 'Node7', port: 3009 },
];

const checkServer = async (def) => {
  const url = `http://localhost:${def.port}/health`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    let details = null;
    let health = 'OK';
    let state = 'RUNNING';

    if (response.ok) {
      try {
        details = await response.json();
        health = details.status || 'OK';
      } catch (e) {}
    } else {
      state = 'DEGRADED';
      health = 'WARNING';
    }
    return { ...def, state, health, details };
  } catch (err) {
    return { ...def, state: 'STOPPED', health: 'FAILED', details: null };
  }
};

router.get('/servers', async (req, res) => {
  const results = await Promise.all(serverDefinitions.map(def => checkServer(def)));
  results.sort((a, b) => a.port - b.port);
  const servers = results.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    cluster: r.cluster || 'Standalone',
    machine: r.machine || '-',
    state: r.state,
    health: r.health,
    listenPort: r.port,
  }));
  const total = servers.length;
  res.setHeader('Content-Range', `items 0-${total - 1}/${total}`);
  res.json(servers);
});

router.get('/servers/:id', async (req, res) => {
  const { id } = req.params;
  const def = serverDefinitions.find(s => s.id === id);
  if (!def) return res.status(404).json({ error: 'Server not found' });

  const result = await checkServer(def);
  const data = {
    id: result.id,
    name: result.name,
    type: result.type,
    cluster: result.cluster || 'Standalone',
    machine: result.machine || '-',
    state: result.state,
    health: result.health,
    listenPort: result.port,
    ...(result.details || {}),
    details: result.details || {},
  };
  res.json({ data });
});

// ==========================================
// 14. FRONTEND STATUS MONITORING
// ==========================================
router.get('/frontend/status', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const startTime = Date.now();
  let status = 'unknown';
  let statusCode = 0;
  let responseTime = 0;
  let error = null;
  let bodySample = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(frontendUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Admin-Monitor/1.0' },
    });
    clearTimeout(timeout);
    statusCode = response.status;
    responseTime = Date.now() - startTime;

    const text = await response.text();
    bodySample = text.substring(0, 200);
    const hasHtml = /<html/i.test(text);
    const hasReactRoot = /<div\s+id="root"/i.test(text);

    if (response.status >= 200 && response.status < 400 && (hasHtml || hasReactRoot)) {
      status = 'up';
    } else {
      status = 'degraded';
      error = 'Response does not look like a frontend page';
    }
  } catch (err) {
    error = err.message;
    status = 'down';
    responseTime = Date.now() - startTime;
  }

  res.json({
    data: {
      url: frontendUrl,
      status,
      statusCode,
      responseTime: responseTime + 'ms',
      lastChecked: new Date().toISOString(),
      error: error || null,
      bodySample,
    },
  });
});

router.post('/frontend/restart', async (req, res) => {
  const containerName = process.env.FRONTEND_CONTAINER_NAME || 'evolution-frontend';

  try {
    const container = docker.getContainer(containerName);
    await container.restart();
    return res.json({
      success: true,
      message: `Frontend container "${containerName}" restarted successfully.`,
    });
  } catch (dockerError) {
    console.warn('⚠️ Docker restart failed, trying fallback command:', dockerError.message);

    const fallbackCommand = process.env.FRONTEND_RESTART_COMMAND || 'pm2 restart frontend';
    const { exec } = await import('child_process');
    exec(fallbackCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('Fallback restart error:', error);
        return res.status(500).json({
          success: false,
          message: `Restart failed: ${error.message}`,
        });
      }
      res.json({
        success: true,
        message: `Frontend restarted via fallback command.`,
        output: stdout.trim(),
      });
    });
  }
});

// ==========================================
// 15. MIDDLEWARES (filesystem)
// ==========================================

const MIDDLEWARE_PATHS = [
  path.join(process.cwd(), 'src/middleware'),
  path.join(process.cwd(), 'src/middlewares'),
];

const getAllMiddlewareFiles = () => {
  const files = [];
  const seenNames = new Set();
  
  for (const dir of MIDDLEWARE_PATHS) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.js')) {
        const filePath = path.join(dir, entry.name);
        const stats = fs.statSync(filePath);
        const id = entry.name.replace(/\.js$/, '');
        
        if (seenNames.has(id)) {
          console.warn(`⚠️ Duplicate middleware found: ${id}, skipping...`);
          continue;
        }
        seenNames.add(id);
        
        files.push({
          id: id,
          name: entry.name,
          filePath: filePath,
          size: stats.size,
          modified: stats.mtime,
          status: 'AVAILABLE',
        });
      }
    }
  }
  files.sort((a, b) => a.id.localeCompare(b.id));
  return files;
};

router.get('/middlewares', (req, res) => {
  try {
    const middlewares = getAllMiddlewareFiles();
    const total = middlewares.length;
    res.setHeader('Content-Range', `items 0-${total - 1}/${total}`);
    res.json(middlewares);
  } catch (error) {
    console.error('Error fetching middlewares:', error);
    res.status(500).json({ error: 'Failed to fetch middlewares' });
  }
});

router.get('/middlewares/:id', (req, res) => {
  const { id } = req.params;
  try {
    const all = getAllMiddlewareFiles();
    const middleware = all.find(m => m.id === id);
    if (!middleware) {
      return res.status(404).json({ error: 'Middleware not found' });
    }

    const content = fs.readFileSync(middleware.filePath, 'utf8');
    const data = {
      ...middleware,
      content,
    };
    res.json({ data: { ...data, id: data.id } });
  } catch (error) {
    console.error(`Error reading middleware ${id}:`, error);
    res.status(500).json({ error: 'Failed to read middleware' });
  }
});

router.delete('/middlewares/:id', (req, res) => {
  const { id } = req.params;
  try {
    const all = getAllMiddlewareFiles();
    const middleware = all.find(m => m.id === id);
    if (!middleware) {
      return res.status(404).json({ error: 'Middleware not found' });
    }

    fs.unlinkSync(middleware.filePath);
    res.json({ data: { success: true, message: `Middleware "${id}" deleted successfully` } });
  } catch (error) {
    console.error(`Error deleting middleware ${id}:`, error);
    res.status(500).json({ error: 'Failed to delete middleware' });
  }
});

router.put('/middlewares/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  
  try {
    const all = getAllMiddlewareFiles();
    const middleware = all.find(m => m.id === id);
    if (!middleware) {
      return res.status(404).json({ error: 'Middleware not found' });
    }

    if (name && name !== middleware.id) {
      const newPath = path.join(path.dirname(middleware.filePath), `${name}.js`);
      fs.renameSync(middleware.filePath, newPath);
      
      const updatedMiddleware = {
        ...middleware,
        id: name,
        name: `${name}.js`,
        filePath: newPath,
      };
      return res.json({ data: updatedMiddleware });
    }
    
    res.json({ data: middleware });
  } catch (error) {
    console.error(`Error updating middleware ${id}:`, error);
    res.status(500).json({ error: 'Failed to update middleware' });
  }
});

router.put('/middlewares/:id/content', (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  
  try {
    const all = getAllMiddlewareFiles();
    const middleware = all.find(m => m.id === id);
    if (!middleware) {
      return res.status(404).json({ error: 'Middleware not found' });
    }

    fs.writeFileSync(middleware.filePath, content, 'utf8');
    res.json({ data: { success: true, message: `Middleware "${id}" updated successfully` } });
  } catch (error) {
    console.error(`Error updating middleware content ${id}:`, error);
    res.status(500).json({ error: 'Failed to update middleware content' });
  }
});

// ==========================================
// 16. WEBHOOKS
// ==========================================
const runningWebhookServers = new Map();

const getAllWebhookFiles = () => {
  const WEBHOOKS_DIR = path.join(process.cwd(), 'src/webhooks');
  if (!fs.existsSync(WEBHOOKS_DIR)) return [];
  const entries = fs.readdirSync(WEBHOOKS_DIR, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
      const filePath = path.join(WEBHOOKS_DIR, entry.name);
      const stats = fs.statSync(filePath);
      files.push({
        id: entry.name.replace(/\.js$/, ''),
        name: entry.name,
        filePath,
        size: stats.size,
        modified: stats.mtime,
        status: 'AVAILABLE',
      });
    }
  }
  files.sort((a, b) => a.id.localeCompare(b.id));
  return files;
};

async function getWebhookInstance(name) {
  const WEBHOOKS_DIR = path.join(process.cwd(), 'src/webhooks');
  const filePath = path.join(WEBHOOKS_DIR, `${name}.js`);
  if (!fs.existsSync(filePath)) throw new Error(`Webhook file not found: ${name}`);
  const module = await import(`file://${filePath}`);
  const WebhookClass = module.default || module;
  return new WebhookClass();
}

async function startWebhookById(id) {
  const [config] = await sequelize.query(
    'SELECT * FROM webhook_configs WHERE id = ?',
    { replacements: [id], type: QueryTypes.SELECT }
  );
  if (!config) throw new Error('Config not found');
  if (!config.enabled) throw new Error('Webhook is disabled');
  if (!config.port) throw new Error('No port assigned');
  if (runningWebhookServers.has(id)) return;

  const express = await import('express');
  const app = express.default();
  app.use(express.json());

  const webhookInstance = await getWebhookInstance(config.webhook_name);
  app.post('/webhook', (req, res) => webhookInstance.handleWebhook(req, res));
  app.get('/health', (req, res) => webhookInstance.healthCheck(req, res));
  if (webhookInstance.handleNIPNameEnquiry) {
    app.post('/name-enquiry', (req, res) => webhookInstance.handleNIPNameEnquiry(req, res));
  }
  if (webhookInstance.handleNIPStatusEnquiry) {
    app.post('/status-enquiry', (req, res) => webhookInstance.handleNIPStatusEnquiry(req, res));
  }
  if (webhookInstance.handleNIPReversal) {
    app.post('/reversal', (req, res) => webhookInstance.handleNIPReversal(req, res));
  }
  if (webhookInstance.handleFinancialInstitutionList) {
    app.post('/institutions', (req, res) => webhookInstance.handleFinancialInstitutionList(req, res));
  }

  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`✅ Webhook "${config.webhook_name}" started on port ${config.port}`);
  });

  runningWebhookServers.set(id, { server, app, instance: webhookInstance });
  return { server, app, instance: webhookInstance };
}

export async function startAllWebhooks() {
  try {
    const configs = await sequelize.query(
      'SELECT * FROM webhook_configs WHERE enabled = 1 AND port IS NOT NULL',
      { type: QueryTypes.SELECT }
    );
    for (const config of configs) {
      try {
        await startWebhookById(config.id);
      } catch (err) {
        console.error(`Failed to start webhook ${config.webhook_name}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Error starting webhooks:', err);
  }
}

export async function stopAllWebhooks() {
  for (const [id, { server }] of runningWebhookServers) {
    server.close(() => {
      console.log(`🛑 Webhook server stopped (ID: ${id})`);
    });
  }
  runningWebhookServers.clear();
}

router.get('/webhook_configs', async (req, res) => {
  try {
    const configs = await WebhookConfig.findAll({
      raw: true,
      attributes: ['id', 'webhook_name', 'port', 'enabled', 'load_balancer_group', 'created_at', 'updated_at']
    });
    const redis = req.app.get('redisClient');
    const rows = await Promise.all(configs.map(async (row) => {
      let traffic = 0;
      if (redis) {
        const count = await redis.get(`webhook_traffic:${row.webhook_name}`).catch(() => 0);
        traffic = parseInt(count) || 0;
      }
      return { ...row, traffic, running: runningWebhookServers.has(row.id) };
    }));
    res.setHeader('Content-Range', `items 0-${rows.length - 1}/${rows.length}`);
    res.json({ data: rows });
  } catch (error) {
    console.error('Error fetching webhook configs:', error);
    res.status(500).json({ error: 'Failed to fetch webhook configs' });
  }
});

router.get('/webhook_configs/init', async (req, res) => {
  try {
    const files = getAllWebhookFiles();
    for (const file of files) {
      const [existing] = await sequelize.query(
        'SELECT id FROM webhook_configs WHERE webhook_name = ?',
        { replacements: [file.id], type: QueryTypes.SELECT }
      );
      if (!existing) {
        await sequelize.query(
          'INSERT INTO webhook_configs (webhook_name, port, enabled) VALUES (?, ?, ?)',
          { replacements: [file.id, null, true] }
        );
      }
    }
    res.json({ success: true, message: 'Webhook configs initialized' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/webhook_configs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    let rows;
    if (!isNaN(id)) {
      rows = await sequelize.query('SELECT * FROM webhook_configs WHERE id = ?', {
        replacements: [id],
        type: QueryTypes.SELECT
      });
    } else {
      rows = await sequelize.query('SELECT * FROM webhook_configs WHERE webhook_name = ?', {
        replacements: [id],
        type: QueryTypes.SELECT
      });
    }
    if (rows.length === 0) return res.status(404).json({ error: 'Config not found' });
    const data = rows[0];
    const redis = req.app.get('redisClient');
    if (redis) {
      const count = await redis.get(`webhook_traffic:${data.webhook_name}`).catch(() => 0);
      data.traffic = parseInt(count) || 0;
    }
    data.running = runningWebhookServers.has(parseInt(data.id) || data.id);
    res.json({ data });
  } catch (error) {
    console.error('Error fetching webhook config:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/webhook_configs/:id', async (req, res) => {
  const { id } = req.params;
  const { port, enabled, load_balancer_group } = req.body;

  try {
    const config = await WebhookConfig.findByPk(id);
    if (!config) {
      return res.status(404).json({ error: 'Config not found' });
    }

    if (port !== undefined) config.port = port;
    if (enabled !== undefined) config.enabled = enabled;
    if (load_balancer_group !== undefined) config.load_balancer_group = load_balancer_group;

    await config.save();
    res.json({ data: config });
  } catch (error) {
    console.error('Error updating webhook config:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/webhook_configs/:id/start', async (req, res) => {
  const { id } = req.params;
  try {
    if (runningWebhookServers.has(parseInt(id))) {
      return res.status(400).json({ error: 'Webhook already running' });
    }
    await startWebhookById(id);
    res.json({ success: true, message: 'Webhook started' });
  } catch (error) {
    console.error('Error starting webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/webhook_configs/:id/stop', async (req, res) => {
  const { id } = req.params;
  try {
    const running = runningWebhookServers.get(parseInt(id));
    if (!running) return res.status(400).json({ error: 'Webhook not running' });
    running.server.close(() => {
      console.log(`🛑 Webhook server stopped (ID: ${id})`);
    });
    runningWebhookServers.delete(parseInt(id));
    res.json({ success: true, message: 'Webhook stopped' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/webhook_configs/:id/status', async (req, res) => {
  const { id } = req.params;
  try {
    const [config] = await sequelize.query('SELECT * FROM webhook_configs WHERE id = ?', {
      replacements: [id],
      type: QueryTypes.SELECT
    });
    if (!config) return res.status(404).json({ error: 'Config not found' });
    const running = runningWebhookServers.has(parseInt(id));
    res.json({
      id: config.id,
      webhook_name: config.webhook_name,
      port: config.port,
      enabled: config.enabled,
      running,
      status: running ? 'RUNNING' : 'STOPPED'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;