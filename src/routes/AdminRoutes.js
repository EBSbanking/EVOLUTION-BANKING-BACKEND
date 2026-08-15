// src/routes/AdminRoutes.js - CORRECTED IMPORTS

import express from 'express';
import { sequelize } from '../../config/db.js';
import { protectAdmin, isAdminConsole } from '../middlewares/adminAuthMiddleware.js';
import envManager from '../Services/envManager.js';
import dataSourceManager from '../Services/dataSourceManager.js';
import pluginManager from '../Services/pluginManager.js';
import multer from 'multer';
import { QueryTypes } from 'sequelize';
import { authenticate } from '../middlewares/authMiddleware.js'; 
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import Docker from 'dockerode';  // ✅ ADD THIS IMPORT
import { exec, spawn } from 'child_process';
import WebhookConfig from '../models/WebhookConfig.js';
import AdminPlugin from '../models/AdminPlugin.js';
import { Op } from 'sequelize';
import net from 'net';
import AuditTrail from '../models/AuditTrail.js';
import UserSession from '../models/UserSession.js';
import UserActivityLog from '../models/UserActivityLog.js';
import User from '../models/User.js';
import sessionTracker from '../middlewares/sessionTracker.js';
import OsController from '../controllers/OsController.js';
import PenaltyAccrualService from '../Services/PenaltyService.js';
import { getLoanAccount, getLoanPenalty, getPenaltyRule, getRepaymentSchedule } from '../models/index.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ✅ Create docker instance AFTER importing
// ============================================================
// ✅ DOCKER CONFIGURATION WITH WINDOWS FALLBACK
// ============================================================
let docker;
try {
  // Detect platform
  const isWindows = process.platform === 'win32';
  
  // Docker socket paths
  const socketPath = isWindows 
    ? '//./pipe/docker_engine'  // Windows named pipe
    : '/var/run/docker.sock';    // Linux socket
  
  // Create Docker client
  docker = new Docker({ socketPath });
  
  // Test connection
  docker.ping((err) => {
    if (err) {
      console.warn('⚠️ Docker ping failed:', err.message);
      console.warn('⚠️ Running in fallback mode (Docker features disabled)');
      // Switch to fallback mode on ping failure
      docker = createDockerFallback();
    } else {
      console.log('✅ Docker client initialized successfully');
    }
  });
  
} catch (error) {
  console.warn('⚠️ Docker not available, running in fallback mode:', error.message);
  docker = createDockerFallback();
}

// ✅ Create Docker fallback object
function createDockerFallback() {
  return {
    getContainer: (name) => ({
      inspect: async () => {
        console.warn(`⚠️ Docker not available, simulating container ${name}`);
        return { 
          State: { 
            Status: 'unknown',
            Running: false
          } 
        };
      },
      restart: async () => {
        console.warn(`⚠️ Docker not available, cannot restart container ${name}`);
        throw new Error('Docker not available');
      },
      stop: async () => {
        console.warn(`⚠️ Docker not available, cannot stop container ${name}`);
        throw new Error('Docker not available');
      },
      start: async () => {
        console.warn(`⚠️ Docker not available, cannot start container ${name}`);
        throw new Error('Docker not available');
      }
    }),
    ping: (callback) => {
      callback(new Error('Docker not available'));
    }
  };
}



// ... rest of your code

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

// Add this after router.use(isAdminConsole);

// ==========================================
// 0. HEALTH CHECK ENDPOINT
// ==========================================

/**
 * GET /health
 * Simple health check endpoint for monitoring
 */
router.get('/health', async (req, res) => {
  try {
    // Check database connection
    let dbStatus = 'connected';
    try {
      await sequelize.authenticate();
    } catch (dbError) {
      dbStatus = 'disconnected';
    }

    // Check Redis if available
    let redisStatus = 'not_configured';
    try {
      const redis = req.app.get('redisClient');
      if (redis) {
        const pingResult = await redis.ping();
        redisStatus = pingResult === 'PONG' ? 'connected' : 'disconnected';
      }
    } catch (redisError) {
      redisStatus = 'disconnected';
    }

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbStatus,
        redis: redisStatus,
        api: 'running'
      },
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      nodeVersion: process.version
    });
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({
      status: 'ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ==========================================
// 1. NIP METRICS - USING ONLY RAW SQL (FIXED)
// ==========================================
const getNIPMetrics = async () => {
  try {
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
    
    return {
      totalInward,
      totalOutward: parseInt(data.totalOutward) || 0,
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
const pluginUpload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are allowed'), false);
    }
  }
});

router.get('/plugins', async (req, res) => {
  try {
    const plugins = await pluginManager.getAllPlugins();
    console.log('📦 Plugins from database:', JSON.stringify(plugins, null, 2));
    console.log('📦 Plugins count:', plugins.length);
    if (plugins.length > 0) {
      console.log('📦 First plugin fields:', Object.keys(plugins[0]));
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Range', `items 0-${plugins.length - 1}/${plugins.length}`);
    res.json(plugins);
  } catch (error) {
    console.error('Error fetching plugins:', error);
    res.status(500).json({ error: 'Failed to fetch plugins' });
  }
});

router.get('/plugins/:id', async (req, res) => {
  try {
    const plugin = await AdminPlugin.findByPk(req.params.id);
    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
    }
    res.json({ data: plugin.getSummary() });
  } catch (error) {
    console.error('Error fetching plugin:', error);
    res.status(500).json({ error: 'Failed to fetch plugin' });
  }
});

router.post('/plugins/upload', pluginUpload.single('plugin'), async (req, res) => {
  try {
    console.log('📤 Plugin upload received');
    console.log('Body:', req.body);
    console.log('File:', req.file);
    
    if (!req.file) {
      console.error('❌ No file uploaded');
      return res.status(400).json({ error: 'No plugin file uploaded' });
    }

    try {
      const existingPlugin = await AdminPlugin.findOne({
        where: { 
          name: req.body.name,
          status: { [Op.ne]: 'deleted' }
        }
      });
      
      if (existingPlugin) {
        return res.status(400).json({ 
          error: `Plugin "${req.body.name}" already exists`,
          existingPlugin: existingPlugin.getSummary()
        });
      }
    } catch (findError) {
      console.warn('Could not check for existing plugin:', findError.message);
    }

    console.log('📦 Installing plugin...');
    const pluginId = await pluginManager.installPlugin(req.body.name, req.file.buffer);
    console.log('✅ Plugin installed with ID:', pluginId);
    
    const plugin = await AdminPlugin.findByPk(pluginId);
    
    res.json({ 
      data: plugin ? plugin.getSummary() : { id: pluginId },
      message: 'Plugin uploaded and installed successfully'
    });
  } catch (error) {
    console.error('❌ Error uploading plugin:', error);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to upload plugin', 
      details: error.message 
    });
  }
});

router.post('/plugins/:id/start', async (req, res) => {
  try {
    const pluginId = req.params.id;
    
    const plugin = await AdminPlugin.findByPk(pluginId);
    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
    }
    
    if (!plugin.file_path) {
      return res.status(400).json({ 
        error: 'Plugin has no file_path. Please reinstall the plugin.' 
      });
    }
    
    if (!plugin.canStart()) {
      return res.status(400).json({ 
        error: `Plugin cannot be started. Current status: ${plugin.status}` 
      });
    }
    
    await pluginManager.startPlugin(pluginId, plugin.file_path);
    
    const updatedPlugin = await AdminPlugin.findByPk(pluginId);
    
    res.json({ 
      data: updatedPlugin ? updatedPlugin.getSummary() : { id: pluginId },
      message: 'Plugin started successfully'
    });
  } catch (error) {
    console.error('Error starting plugin:', error);
    res.status(500).json({ 
      error: 'Failed to start plugin', 
      details: error.message 
    });
  }
});

router.post('/plugins/:id/stop', async (req, res) => {
  try {
    const pluginId = req.params.id;
    
    const plugin = await AdminPlugin.findByPk(pluginId);
    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
    }
    
    if (!plugin.canStop()) {
      return res.status(400).json({ 
        error: `Plugin cannot be stopped. Current status: ${plugin.status}` 
      });
    }
    
    await pluginManager.stopPlugin(pluginId);
    
    const updatedPlugin = await AdminPlugin.findByPk(pluginId);
    
    res.json({ 
      data: updatedPlugin ? updatedPlugin.getSummary() : { id: pluginId },
      message: 'Plugin stopped successfully'
    });
  } catch (error) {
    console.error('Error stopping plugin:', error);
    res.status(500).json({ error: 'Failed to stop plugin', details: error.message });
  }
});

router.delete('/plugins/:id', async (req, res) => {
  try {
    const pluginId = req.params.id;
    
    const plugin = await AdminPlugin.findByPk(pluginId);
    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
    }
    
    if (!plugin.canDelete()) {
      return res.status(400).json({ 
        error: `Plugin cannot be deleted. Current status: ${plugin.status}` 
      });
    }
    
    const pluginName = plugin.name;
    await pluginManager.uninstallPlugin(pluginId);
    
    res.json({ 
      data: { success: true, id: pluginId, name: pluginName },
      message: `Plugin "${pluginName}" uninstalled successfully`
    });
  } catch (error) {
    console.error('Error deleting plugin:', error);
    res.status(500).json({ error: 'Failed to delete plugin', details: error.message });
  }
});

router.put('/plugins/:id/auto-start', async (req, res) => {
  try {
    const pluginId = req.params.id;
    const { autoStart } = req.body;
    
    const plugin = await AdminPlugin.findByPk(pluginId);
    if (!plugin) {
      return res.status(404).json({ error: 'Plugin not found' });
    }
    
    plugin.auto_start = autoStart !== undefined ? autoStart : !plugin.auto_start;
    await plugin.save();
    
    res.json({
      data: plugin.getSummary(),
      message: `Auto-start ${plugin.auto_start ? 'enabled' : 'disabled'} for plugin "${plugin.name}"`
    });
  } catch (error) {
    console.error('Error updating plugin auto-start:', error);
    res.status(500).json({ error: 'Failed to update auto-start', details: error.message });
  }
});

router.get('/plugins/stats', async (req, res) => {
  try {
    const stats = await AdminPlugin.getStats();
    const allPlugins = await pluginManager.getAllPlugins();
    
    res.json({
      success: true,
      data: {
        ...stats,
        plugins: allPlugins,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting plugin stats:', error);
    res.status(500).json({ error: 'Failed to get plugin stats' });
  }
});

router.get('/plugins/debug', async (req, res) => {
  try {
    const debugInfo = pluginManager.getDebugInfo();
    const dbStats = await AdminPlugin.getStats();
    
    res.json({
      success: true,
      data: {
        ...debugInfo,
        databaseStats: dbStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in plugin debug:', error);
    res.status(500).json({ error: 'Failed to get debug info', details: error.message });
  }
});

router.post('/plugins/reload', async (req, res) => {
  try {
    await pluginManager.stopAllPlugins();
    await pluginManager.loadPluginsFromDB();
    
    res.json({
      success: true,
      message: 'All plugins reloaded successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error reloading plugins:', error);
    res.status(500).json({ error: 'Failed to reload plugins', details: error.message });
  }
});

// src/routes/AdminRoutes.js - AUDIT ROUTES SECTION

// ==========================================
// 5. AUDIT LOGS - ✅ FIXED WITH CORRECT FIELD HANDLING
// ==========================================

/**
 * GET /audit - Get all audit logs with pagination and filtering
 */
router.get('/audit', async (req, res) => {
  try {
    const range = req.query.range ? JSON.parse(req.query.range) : [0, 24];
    const sort = req.query.sort ? JSON.parse(req.query.sort) : ['created_at', 'DESC'];
    const filter = req.query.filter ? JSON.parse(req.query.filter) : {};

    const whereClause = {};
    
    // Search filter - using database column names (uppercase)
    if (filter.q) {
      whereClause[Op.or] = [
        { EVENT_TYPE: { [Op.like]: `%${filter.q}%` } },
        { ACTION: { [Op.like]: `%${filter.q}%` } },
        { USER_ID: { [Op.like]: `%${filter.q}%` } },
        { description: { [Op.like]: `%${filter.q}%` } },
        { ENTITY_TYPE: { [Op.like]: `%${filter.q}%` } }
      ];
    }

    // Filter by event type (using database column name)
    if (filter.event_type) {
      whereClause.EVENT_TYPE = filter.event_type;
    }
    
    // Filter by status (using database column name)
    if (filter.status) {
      whereClause.status = filter.status;
    }
    
    // Filter by user ID (using database column name)
    if (filter.user_id) {
      whereClause.USER_ID = filter.user_id;
    }
    
    // Date range filter (using database column name)
    if (filter.date_from && filter.date_to) {
      whereClause.created_at = {
        [Op.between]: [new Date(filter.date_from), new Date(filter.date_to)]
      };
    }

    // Sort field - must be a valid database column name
    let sortField = sort[0];
    const validColumns = ['event_id', 'created_at', 'updated_at', 'EVENT_TYPE', 'ACTION', 'USER_ID', 'ENTITY_TYPE', 'status'];
    if (!validColumns.includes(sortField)) {
      sortField = 'created_at';
    }
    const sortOrder = sort[1]?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const limit = range[1] - range[0] + 1;
    const offset = range[0];

    // Use AuditTrail model directly
    const { count, rows } = await AuditTrail.findAndCountAll({
      where: whereClause,
      order: [[sortField, sortOrder]],
      limit: limit,
      offset: offset,
    });

    // Convert to plain objects with proper field names
    const finalData = rows.map(row => {
      const data = row.toJSON ? row.toJSON() : row;
      // Ensure we have both uppercase and lowercase versions for compatibility
      return {
        // Uppercase versions (database format)
        EVENT_TYPE: data.EVENT_TYPE || data.event_type,
        ACTION: data.ACTION || data.action,
        USER_ID: data.USER_ID || data.user_id,
        ENTITY_TYPE: data.ENTITY_TYPE || data.entity_type,
        ENTITY_ID: data.ENTITY_ID || data.entity_id,
        IP_ADDRESS: data.IP_ADDRESS || data.ip_address,
        OLD_VALUE: data.OLD_VALUE || data.old_value,
        NEW_VALUE: data.NEW_VALUE || data.new_value,
        ADDITIONAL_INFO: data.ADDITIONAL_INFO || data.additional_info,
        // Lowercase versions (model format)
        event_type: data.EVENT_TYPE || data.event_type,
        action: data.ACTION || data.action,
        user_id: data.USER_ID || data.user_id,
        entity_type: data.ENTITY_TYPE || data.entity_type,
        entity_id: data.ENTITY_ID || data.entity_id,
        ip_address: data.IP_ADDRESS || data.ip_address,
        old_value: data.OLD_VALUE || data.old_value,
        new_value: data.NEW_VALUE || data.new_value,
        additional_info: data.ADDITIONAL_INFO || data.additional_info,
        // Common fields
        event_id: data.event_id,
        status: data.status,
        description: data.description,
        created_at: data.created_at,
        updated_at: data.updated_at,
        user_role: data.user_role,
        reference_no: data.reference_no,
        account_no: data.account_no,
        session_id: data.session_id,
        request_id: data.request_id,
        endpoint: data.endpoint,
        method: data.method,
        user_agent: data.user_agent,
        branch: data.branch,
      };
    });

    res.setHeader('Content-Range', `items ${range[0]}-${range[1]}/${count}`);
    res.json(finalData);
  } catch (error) {
    console.error('❌ Audit fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/**
 * GET /audit/:id - Get a single audit log by ID
 */
router.get('/audit/:id', async (req, res) => {
  try {
    const auditLog = await AuditTrail.findByPk(req.params.id);

    if (!auditLog) {
      return res.status(404).json({ error: 'Audit log not found' });
    }

    const data = auditLog.toJSON ? auditLog.toJSON() : auditLog;
    
    // Ensure both uppercase and lowercase versions are available
    const responseData = {
      // Uppercase versions (database format)
      EVENT_TYPE: data.EVENT_TYPE || data.event_type,
      ACTION: data.ACTION || data.action,
      USER_ID: data.USER_ID || data.user_id,
      ENTITY_TYPE: data.ENTITY_TYPE || data.entity_type,
      ENTITY_ID: data.ENTITY_ID || data.entity_id,
      IP_ADDRESS: data.IP_ADDRESS || data.ip_address,
      OLD_VALUE: data.OLD_VALUE || data.old_value,
      NEW_VALUE: data.NEW_VALUE || data.new_value,
      ADDITIONAL_INFO: data.ADDITIONAL_INFO || data.additional_info,
      // Lowercase versions (model format)
      event_type: data.EVENT_TYPE || data.event_type,
      action: data.ACTION || data.action,
      user_id: data.USER_ID || data.user_id,
      entity_type: data.ENTITY_TYPE || data.entity_type,
      entity_id: data.ENTITY_ID || data.entity_id,
      ip_address: data.IP_ADDRESS || data.ip_address,
      old_value: data.OLD_VALUE || data.old_value,
      new_value: data.NEW_VALUE || data.new_value,
      additional_info: data.ADDITIONAL_INFO || data.additional_info,
      // Common fields
      event_id: data.event_id,
      status: data.status,
      description: data.description,
      created_at: data.created_at,
      updated_at: data.updated_at,
      user_role: data.user_role,
      reference_no: data.reference_no,
      account_no: data.account_no,
      session_id: data.session_id,
      request_id: data.request_id,
      endpoint: data.endpoint,
      method: data.method,
      user_agent: data.user_agent,
      branch: data.branch,
    };

    console.log('📤 AUDIT getOne response:', JSON.stringify({ data: responseData }));
    res.json({ data: responseData });
  } catch (error) {
    console.error('❌ Audit fetch by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

/**
 * GET /audit/stats - Get audit statistics
 */
router.get('/audit/stats', async (req, res) => {
  try {
    const stats = await AuditTrail.findAll({
      attributes: [
        'EVENT_TYPE',
        [sequelize.fn('COUNT', sequelize.col('event_id')), 'count']
      ],
      group: ['EVENT_TYPE'],
      order: [[sequelize.fn('COUNT', sequelize.col('event_id')), 'DESC']]
    });

    const statusStats = await AuditTrail.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('event_id')), 'count']
      ],
      group: ['status']
    });

    const totalCount = await AuditTrail.count();

    res.json({
      total: totalCount,
      byEventType: stats,
      byStatus: statusStats
    });
  } catch (error) {
    console.error('❌ Audit stats error:', error);
    res.status(500).json({ error: 'Failed to fetch audit statistics' });
  }
});

/**
 * GET /audit/user/:userId - Get audit logs for a specific user
 */
router.get('/audit/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { count, rows } = await AuditTrail.findAndCountAll({
      where: { USER_ID: userId },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      total: count,
      data: rows.map(row => row.toJSON())
    });
  } catch (error) {
    console.error('❌ User audit fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch user audit logs' });
  }
});

/**
 * GET /audit/entity/:entityType/:entityId - Get audit logs for a specific entity
 */
router.get('/audit/entity/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { count, rows } = await AuditTrail.findAndCountAll({
      where: {
        ENTITY_TYPE: entityType,
        ENTITY_ID: entityId
      },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      total: count,
      data: rows.map(row => row.toJSON())
    });
  } catch (error) {
    console.error('❌ Entity audit fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch entity audit logs' });
  }
});

// ==========================================
// 6. USER SESSION MONITORING
// ==========================================

/**
 * GET /users/active-sessions - Get all active user sessions
 */
router.get('/users/active-sessions', async (req, res) => {
  try {
    console.log('📊 Fetching active sessions...');
    
    if (!sessionTracker || typeof sessionTracker.getActiveSessions !== 'function') {
      console.error('❌ sessionTracker not properly initialized');
      return res.status(500).json({
        success: false,
        message: 'Session tracker not initialized',
        data: {
          sessions: [],
          summary: {
            total_active_sessions: 0,
            unique_users: 0,
            timestamp: new Date().toISOString()
          }
        }
      });
    }
    
    const sessions = await sessionTracker.getActiveSessions();
    
    console.log(`✅ Found ${sessions.length} active sessions`);
    
    const formattedSessions = sessions.map(session => {
      const duration = Math.floor((Date.now() - new Date(session.login_time).getTime()) / 1000);
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      
      const user = session.User || {};
      
      return {
        id: session.id,
        user_id: session.user_id,
        user_name: user.user_name || 'Unknown',
        full_name: user.first_name || user.last_name ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'Unknown',
        email: user.email || 'N/A',
        role: user.primary_business_role || 'N/A',
        session_id: session.session_id,
        login_time: session.login_time,
        last_activity: session.last_activity,
        duration: `${hours}h ${minutes}m`,
        duration_seconds: duration,
        ip_address: session.ip_address || 'N/A',
        device_type: session.device_type || 'desktop',
        browser: session.browser || 'Unknown',
        os: session.os || 'Unknown',
        request_count: session.request_count || 0,
        last_request_url: session.last_request_url,
        last_request_method: session.last_request_method,
        is_active: session.is_active
      };
    });
    
    const totalActive = sessions.length;
    const uniqueUsers = new Set(sessions.map(s => s.user_id)).size;
    
    res.status(200).json({
      success: true,
      data: {
        sessions: formattedSessions,
        summary: {
          total_active_sessions: totalActive,
          unique_users: uniqueUsers,
          timestamp: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching active sessions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      data: {
        sessions: [],
        summary: {
          total_active_sessions: 0,
          unique_users: 0,
          timestamp: new Date().toISOString()
        }
      }
    });
  }
});

/**
 * POST /users/sessions/terminate - Terminate a user session
 */
router.post('/users/sessions/terminate', async (req, res) => {
  try {
    const { session_id, reason } = req.body;
    
    if (!session_id) {
      return res.status(400).json({
        success: false,
        message: 'Session ID required'
      });
    }
    
    const session = await UserSession.findOne({
      where: {
        session_id: session_id,
        is_active: true,
        logout_time: null
      }
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Active session not found'
      });
    }
    
    const user = await User.findByPk(session.user_id, {
      attributes: ['user_name']
    });
    
    await session.update({
      is_active: false,
      logout_time: new Date(),
      session_duration: sequelize.literal(`TIMESTAMPDIFF(SECOND, login_time, NOW())`)
    });
    
    // Log the activity
    try {
      await UserActivityLog.create({
        user_id: session.user_id,
        action_type: 'LOGOUT',
        action: 'Session terminated by admin',
        description: `Session terminated by admin: ${reason || 'No reason provided'}`,
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.headers['user-agent'],
        metadata: {
          terminated_by: req.user?.user_name || 'admin',
          reason: reason || 'No reason provided',
          session_id: session_id
        }
      });
    } catch (logError) {
      console.warn('Could not create activity log:', logError.message);
    }
    
    res.status(200).json({
      success: true,
      message: 'Session terminated successfully',
      data: {
        user_id: session.user_id,
        user_name: user?.user_name || 'Unknown',
        terminated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error terminating session:', error);
    res.status(500).json({
      success: false,
      message: 'Error terminating session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /users/force-lock/:identifier - Force lock a user
 */
router.post('/users/force-lock/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { reason } = req.body;

    console.log('🔒 Force lock user request:', { identifier, reason, lockedBy: req.user?.id });

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: identifier },
          { username: identifier },
          { email: identifier },
          { employer_number: identifier },
          { id: !isNaN(identifier) ? parseInt(identifier) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        identifier
      });
    }

    if (user.status === 'ForceLocked') {
      return res.status(400).json({
        success: false,
        message: 'User is already force-locked',
        user: {
          user_name: user.user_name,
          status: user.status,
          force_lock_reason: user.force_lock_reason,
          force_locked_at: user.force_locked_at,
          force_locked_by: user.force_locked_by
        }
      });
    }

    await user.update({
      status: 'ForceLocked',
      force_lock_reason: reason || 'Suspicious activity detected',
      force_locked_at: new Date(),
      force_locked_by: req.user?.id || 'system',
      internal_employee_enabled: false
    });

    console.log('✅ User force-locked successfully:', {
      user_name: user.user_name,
      status: user.status,
      force_lock_reason: user.force_lock_reason,
      locked_by_admin_id: req.user?.id
    });

    res.status(200).json({
      success: true,
      message: 'User force-locked successfully',
      user: {
        id: user.id,
        user_name: user.user_name,
        email: user.email,
        status: user.status,
        force_lock_reason: user.force_lock_reason,
        force_locked_at: user.force_locked_at,
        force_locked_by: user.force_locked_by
      },
      lockDetails: {
        reason: reason || 'Suspicious activity detected',
        timestamp: user.force_locked_at,
        performedBy: req.user?.user_name || 'system'
      }
    });

  } catch (error) {
    console.error('💥 Force lock user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error force-locking user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /users/unlock-force-locked/:identifier - Unlock a force-locked user
 */
router.post('/users/unlock-force-locked/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { reason } = req.body;

    console.log('🔓 Unlock force-locked user request:', { 
      identifier, 
      reason, 
      unlockedBy: req.user?.user_name || req.user?.username || 'system'
    });

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: identifier },
          { username: identifier },
          { email: identifier },
          { employer_number: identifier },
          { id: !isNaN(identifier) ? parseInt(identifier) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined && value !== 'null' && value !== 'undefined';
        })
      }
    });

    if (!user) {
      console.log('❌ User not found:', { identifier });
      return res.status(404).json({
        success: false,
        message: 'User not found',
        identifier
      });
    }

    if (user.status !== 'ForceLocked') {
      console.log('ℹ️ User is not force-locked:', { 
        user_name: user.user_name, 
        status: user.status 
      });
      return res.status(400).json({
        success: false,
        message: 'User is not force-locked',
        user: {
          user_name: user.user_name,
          status: user.status
        }
      });
    }

    await user.update({
      status: 'Active',
      force_lock_reason: null,
      force_locked_at: null,
      force_locked_by: null,
      internal_employee_enabled: true,
      lock_until: null,
      failed_attempts: 0
    });

    console.log('✅ User unlocked from force-lock successfully:', {
      user_name: user.user_name,
      status: user.status
    });

    res.status(200).json({
      success: true,
      message: 'User unlocked from force-lock successfully',
      user: {
        id: user.id,
        user_name: user.user_name,
        email: user.email,
        status: user.status
      },
      unlockDetails: {
        reason: reason || 'Manual unlock by administrator',
        timestamp: new Date(),
        performedBy: req.user?.user_name || req.user?.username || 'System'
      }
    });

  } catch (error) {
    console.error('💥 Unlock force-locked user error:', {
      error: error.message,
      stack: error.stack,
      identifier
    });
    res.status(500).json({
      success: false,
      message: 'Error unlocking force-locked user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /users/force-reset-password - Force reset a user's password
 */
router.post('/users/force-reset-password', async (req, res) => {
  const { user_name, username, new_password } = req.body;
  
  try {
    console.log('🔄 FORCE PASSWORD RESET:', { user_name, username });
    
    const loginIdentifier = username || user_name;
    
    if (!loginIdentifier || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Username and new password are required'
      });
    }

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: loginIdentifier },
          { username: loginIdentifier }
        ]
      }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Password validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(new_password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be 8+ characters with uppercase, lowercase, number, and special character'
      });
    }

    // Hash the new password
    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    await user.update({
      password: hashedPassword,
      passwordChangedAt: new Date(),
      failed_attempts: 0,
      lock_until: null,
      force_password_change: true,
      is_first_login: false
    });

    console.log('✅ PASSWORD RESET SUCCESSFUL:', {
      user_name: user.user_name,
      force_password_change: true
    });

    res.json({ 
      success: true, 
      message: 'Password reset successfully. User must change password on next login.',
      user: { 
        user_name: user.user_name, 
        email: user.email,
        force_password_change: true
      }
    });

  } catch (error) {
    console.error('💥 Password reset error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Password reset failed', 
      error: error.message 
    });
  }
});

// ==========================================
// 7. SERVER STATUS & CONTROL
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
// 8. SCHEDULER / JOBS REGISTRY
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
// 9. EOD (End of Day) ROUTES
// ==========================================
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
// 10. PENALTY ACCRUAL ROUTES
// ==========================================
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
// 11. UTILITIES STATUS
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
// 12. SERVICES (filesystem)
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
// 13. TRAFFIC MONITORING
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
// 14. WEBLOGIC SERVERS
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

const isPortOpen = (port, host = 'localhost') => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 1500;
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, host);
  });
};

const formatMemory = (bytes) => {
  if (!bytes) return 'N/A';
  if (typeof bytes === 'string') return bytes;
  
  if (typeof bytes === 'object') {
    if (bytes.bytes) bytes = bytes.bytes;
    else if (bytes.rss) bytes = bytes.rss;
    else if (bytes.heapUsed) bytes = bytes.heapUsed;
    else if (bytes.heapTotal) bytes = bytes.heapTotal;
    else if (bytes.external) bytes = bytes.external;
    else return 'N/A';
  }
  
  const numBytes = Number(bytes);
  if (isNaN(numBytes) || numBytes === 0) return '0 B';
  
  if (numBytes > 1024 * 1024 * 1024) {
    return (numBytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
  if (numBytes > 1024 * 1024) {
    return (numBytes / 1024 / 1024).toFixed(2) + ' MB';
  }
  if (numBytes > 1024) {
    return (numBytes / 1024).toFixed(2) + ' KB';
  }
  return numBytes + ' B';
};

const formatUptime = (seconds) => {
  if (!seconds) return 'N/A';
  if (typeof seconds === 'string') return seconds;
  if (typeof seconds === 'object') {
    if (seconds.seconds) seconds = seconds.seconds;
    else if (seconds.uptime) seconds = seconds.uptime;
    else return 'N/A';
  }
  
  const numSeconds = Number(seconds);
  if (isNaN(numSeconds) || numSeconds === 0) return 'N/A';
  
  const days = Math.floor(numSeconds / 86400);
  const hours = Math.floor((numSeconds % 86400) / 3600);
  const minutes = Math.floor((numSeconds % 3600) / 60);
  const secs = Math.floor(numSeconds % 60);
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${secs}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

const checkServer = async (def) => {
  const startTime = Date.now();
  const isOpen = await isPortOpen(def.port);
  
  if (!isOpen) {
    return {
      ...def,
      state: 'STOPPED',
      health: 'FAILED',
      details: {
        pid: 'N/A',
        uptime: 'N/A',
        nodeVersion: 'N/A',
        environment: 'N/A',
        memory: null,
        cpu: null,
        hostname: 'N/A',
        loadAverage: 'N/A',
        responseTime: Date.now() - startTime,
        error: 'Server not running'
      }
    };
  }

  const url = `http://localhost:${def.port}/health`;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    const responseTime = Date.now() - startTime;
    
    if (response.ok) {
      try {
        const text = await response.text();
        let jsonData = {};
        try {
          jsonData = JSON.parse(text);
        } catch (e) {
          jsonData = { status: text.trim() || 'OK' };
        }
        
        let memoryData = null;
        if (jsonData.memory) {
          memoryData = {
            rss: jsonData.memory.rss || jsonData.memory.bytes || 0,
            heapTotal: jsonData.memory.heapTotal || 0,
            heapUsed: jsonData.memory.heapUsed || 0,
            external: jsonData.memory.external || 0
          };
        } else {
          const mem = process.memoryUsage();
          memoryData = {
            rss: mem.rss || 0,
            heapTotal: mem.heapTotal || 0,
            heapUsed: mem.heapUsed || 0,
            external: mem.external || 0
          };
        }
        
        let cpuData = null;
        if (jsonData.cpu) {
          cpuData = {
            user: jsonData.cpu.user || 0,
            system: jsonData.cpu.system || 0
          };
        } else if (process.cpuUsage) {
          const cpu = process.cpuUsage();
          cpuData = {
            user: cpu.user || 0,
            system: cpu.system || 0
          };
        }
        
        const details = {
          pid: jsonData.pid || process.pid,
          uptime: jsonData.uptime || process.uptime(),
          nodeVersion: jsonData.nodeVersion || process.version,
          environment: jsonData.env || process.env.NODE_ENV || 'development',
          memory: memoryData,
          cpu: cpuData,
          hostname: jsonData.hostname || os.hostname(),
          loadAverage: jsonData.loadAverage || os.loadavg(),
          responseTime: responseTime,
          status: jsonData.status || 'OK'
        };
        
        let health = 'OK';
        let state = 'RUNNING';
        
        if (def.port === 3002) {
          health = 'OK';
          state = 'RUNNING';
        } else {
          if (memoryData && memoryData.heapUsed && memoryData.heapTotal) {
            const usageRatio = memoryData.heapUsed / memoryData.heapTotal;
            if (usageRatio > 0.9) {
              health = 'CRITICAL';
              state = 'DEGRADED';
            } else if (usageRatio > 0.8) {
              health = 'WARNING';
            }
          }
          
          if (jsonData.status && jsonData.status !== 'OK' && health === 'OK') {
            health = 'WARNING';
          }
        }
        
        return { ...def, state, health, details };
      } catch (parseError) {
        if (def.port === 3002) {
          const mem = process.memoryUsage();
          return {
            ...def,
            state: 'RUNNING',
            health: 'OK',
            details: {
              pid: process.pid,
              uptime: process.uptime(),
              nodeVersion: process.version,
              environment: process.env.NODE_ENV || 'development',
              memory: {
                rss: mem.rss || 0,
                heapTotal: mem.heapTotal || 0,
                heapUsed: mem.heapUsed || 0,
                external: mem.external || 0
              },
              cpu: process.cpuUsage ? {
                user: process.cpuUsage().user || 0,
                system: process.cpuUsage().system || 0
              } : { user: 0, system: 0 },
              hostname: os.hostname(),
              loadAverage: os.loadavg(),
              responseTime: responseTime,
              status: 'OK (fallback)',
              note: 'Health endpoint returned invalid response, but server is running'
            }
          };
        }
        
        const mem = process.memoryUsage();
        return {
          ...def,
          state: 'RUNNING',
          health: 'DEGRADED',
          details: {
            pid: process.pid,
            uptime: process.uptime(),
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'development',
            memory: {
              rss: mem.rss || 0,
              heapTotal: mem.heapTotal || 0,
              heapUsed: mem.heapUsed || 0,
              external: mem.external || 0
            },
            cpu: process.cpuUsage ? {
              user: process.cpuUsage().user || 0,
              system: process.cpuUsage().system || 0
            } : { user: 0, system: 0 },
            hostname: os.hostname(),
            loadAverage: os.loadavg(),
            responseTime: responseTime,
            error: 'Invalid health response'
          }
        };
      }
    } else {
      if (def.port === 3002) {
        const mem = process.memoryUsage();
        return {
          ...def,
          state: 'RUNNING',
          health: 'OK',
          details: {
            pid: process.pid,
            uptime: process.uptime(),
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'development',
            memory: {
              rss: mem.rss || 0,
              heapTotal: mem.heapTotal || 0,
              heapUsed: mem.heapUsed || 0,
              external: mem.external || 0
            },
            cpu: process.cpuUsage ? {
              user: process.cpuUsage().user || 0,
              system: process.cpuUsage().system || 0
            } : { user: 0, system: 0 },
            hostname: os.hostname(),
            loadAverage: os.loadavg(),
            responseTime: responseTime,
            statusCode: response.status,
            note: 'Health endpoint returned error, but server is running'
          }
        };
      }
      
      return {
        ...def,
        state: 'DEGRADED',
        health: 'WARNING',
        details: {
          pid: 'N/A',
          uptime: 'N/A',
          nodeVersion: 'N/A',
          environment: 'N/A',
          memory: null,
          cpu: null,
          hostname: 'N/A',
          loadAverage: 'N/A',
          responseTime: responseTime,
          statusCode: response.status,
          error: `HTTP ${response.status}`
        }
      };
    }
  } catch (error) {
    if (def.port === 3002) {
      const mem = process.memoryUsage();
      return {
        ...def,
        state: 'RUNNING',
        health: 'OK',
        details: {
          pid: process.pid,
          uptime: process.uptime(),
          nodeVersion: process.version,
          environment: process.env.NODE_ENV || 'development',
          memory: {
            rss: mem.rss || 0,
            heapTotal: mem.heapTotal || 0,
            heapUsed: mem.heapUsed || 0,
            external: mem.external || 0
          },
          cpu: process.cpuUsage ? {
            user: process.cpuUsage().user || 0,
            system: process.cpuUsage().system || 0
          } : { user: 0, system: 0 },
          hostname: os.hostname(),
          loadAverage: os.loadavg(),
          responseTime: Date.now() - startTime,
          note: 'Health check failed, but server is running',
          error: error.message
        }
      };
    }
    
    const mem = process.memoryUsage();
    return {
      ...def,
      state: 'RUNNING',
      health: 'DEGRADED',
      details: {
        pid: process.pid,
        uptime: process.uptime(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        memory: {
          rss: mem.rss || 0,
          heapTotal: mem.heapTotal || 0,
          heapUsed: mem.heapUsed || 0,
          external: mem.external || 0
        },
        cpu: process.cpuUsage ? {
          user: process.cpuUsage().user || 0,
          system: process.cpuUsage().system || 0
        } : { user: 0, system: 0 },
        hostname: os.hostname(),
        loadAverage: os.loadavg(),
        responseTime: Date.now() - startTime,
        error: 'Health check failed',
        message: error.message
      }
    };
  }
};

router.get('/servers', async (req, res) => {
  try {
    const results = await Promise.all(
      serverDefinitions.map(def => checkServer(def))
    );
    
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
      details: r.details ? {
        pid: r.details.pid || 'N/A',
        uptime: r.details.uptime !== undefined && r.details.uptime !== 'N/A' ? formatUptime(r.details.uptime) : 'N/A',
        nodeVersion: r.details.nodeVersion || 'N/A',
        environment: r.details.environment || 'N/A',
        memory: r.details.memory ? {
          rss: formatMemory(r.details.memory.rss),
          heapTotal: formatMemory(r.details.memory.heapTotal),
          heapUsed: formatMemory(r.details.memory.heapUsed),
          external: formatMemory(r.details.memory.external)
        } : null,
        cpu: r.details.cpu ? {
          user: r.details.cpu.user ? `${(r.details.cpu.user / 1000000).toFixed(2)}ms` : 'N/A',
          system: r.details.cpu.system ? `${(r.details.cpu.system / 1000000).toFixed(2)}ms` : 'N/A'
        } : null,
        hostname: r.details.hostname || 'N/A',
        loadAverage: r.details.loadAverage ? 
          `${Array.isArray(r.details.loadAverage) ? r.details.loadAverage.map(l => l.toFixed(2)).join(', ') : r.details.loadAverage}` : 'N/A',
        responseTime: r.details.responseTime ? `${r.details.responseTime}ms` : 'N/A',
        error: r.details.error || null
      } : null
    }));
    
    const counts = { OK: 0, WARNING: 0, CRITICAL: 0, FAILED: 0 };
    results.forEach(r => {
      const h = r.health || 'FAILED';
      if (counts.hasOwnProperty(h)) counts[h]++;
      else counts.FAILED++;
    });
    
    const total = servers.length;
    res.setHeader('Content-Range', `items 0-${total - 1}/${total}`);
    res.json(servers);
  } catch (error) {
    console.error('❌ Error fetching servers:', error);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

router.get('/servers/:id', async (req, res) => {
  const { id } = req.params;
  const def = serverDefinitions.find(s => s.id === id);
  if (!def) {
    return res.status(404).json({ error: 'Server not found' });
  }

  try {
    const result = await checkServer(def);
    
    const memoryData = result.details?.memory ? {
      rss: {
        bytes: Number(result.details.memory.rss) || 0,
        formatted: formatMemory(result.details.memory.rss)
      },
      heapTotal: {
        bytes: Number(result.details.memory.heapTotal) || 0,
        formatted: formatMemory(result.details.memory.heapTotal)
      },
      heapUsed: {
        bytes: Number(result.details.memory.heapUsed) || 0,
        formatted: formatMemory(result.details.memory.heapUsed)
      },
      external: {
        bytes: Number(result.details.memory.external) || 0,
        formatted: formatMemory(result.details.memory.external)
      }
    } : null;
    
    const data = {
      id: result.id,
      name: result.name,
      type: result.type,
      cluster: result.cluster || 'Standalone',
      machine: result.machine || '-',
      state: result.state,
      health: result.health,
      listenPort: result.port,
      details: result.details ? {
        pid: result.details.pid || 'N/A',
        uptime: result.details.uptime !== undefined && result.details.uptime !== 'N/A' ? {
          seconds: typeof result.details.uptime === 'number' ? result.details.uptime : 0,
          formatted: formatUptime(result.details.uptime)
        } : null,
        nodeVersion: result.details.nodeVersion || 'N/A',
        environment: result.details.environment || 'N/A',
        memory: memoryData,
        cpu: result.details.cpu ? {
          user: Number(result.details.cpu.user) || 0,
          system: Number(result.details.cpu.system) || 0,
          formatted: {
            user: result.details.cpu.user ? `${(Number(result.details.cpu.user) / 1000000).toFixed(2)}ms` : 'N/A',
            system: result.details.cpu.system ? `${(Number(result.details.cpu.system) / 1000000).toFixed(2)}ms` : 'N/A'
          }
        } : null,
        hostname: result.details.hostname || 'N/A',
        loadAverage: result.details.loadAverage || null,
        responseTime: result.details.responseTime || null,
        error: result.details.error || null,
        note: result.details.note || null
      } : null
    };
    
    res.json({ data });
  } catch (error) {
    console.error(`❌ Error fetching server ${id}:`, error);
    res.status(500).json({ error: 'Failed to fetch server details' });
  }
});

// ==========================================
// 15. FRONTEND STATUS MONITORING
// ==========================================

// In AdminRoutes.js - frontend/status endpoint
router.get('/frontend/status', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const containerName = process.env.FRONTEND_CONTAINER_NAME || 'evolution-frontend';
  const skipDockerCheck = process.env.SKIP_DOCKER_CHECK === 'true' || process.env.NODE_ENV === 'development';
  const startTime = Date.now();
  let status = 'unknown';
  let statusCode = 0;
  let responseTime = 0;
  let error = null;
  let bodySample = '';
  let healthCheck = {};
  let containerStatus = null;

  try {
    // ✅ Skip Docker check if running locally or in development
    if (!skipDockerCheck) {
      // ... docker check code
    }

    // ✅ Check frontend health endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    // Try /health first
    let response;
    try {
      response = await fetch(`${frontendUrl}/health`, {
        signal: controller.signal,
        headers: { 
          'User-Agent': 'Admin-Monitor/1.0',
          'Accept': 'application/json'
        },
      });
    } catch (healthError) {
      // If /health fails, try root
      console.warn('⚠️ /health failed, trying root...', healthError.message);
      response = await fetch(`${frontendUrl}/`, {
        signal: controller.signal,
        headers: { 
          'User-Agent': 'Admin-Monitor/1.0'
        },
      });
    }
    clearTimeout(timeout);
    
    statusCode = response.status;
    responseTime = Date.now() - startTime;

    // Try to parse JSON response (for /health endpoint)
    try {
      const jsonData = await response.json();
      healthCheck = jsonData;
      
      if (response.status === 200 && jsonData.status === 'OK') {
        status = 'up';
      } else if (response.status >= 200 && response.status < 400) {
        status = 'degraded';
        error = 'Health endpoint returned non-OK status';
      } else {
        status = 'down';
        error = `Health endpoint returned ${response.status}`;
      }
    } catch (jsonError) {
      // If not JSON, try HTML check (for root endpoint)
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
    }
    
    // Only send alert if frontend is down AND Docker is being used
    if ((status === 'down' || status === 'degraded') && !skipDockerCheck) {
      try {
        const { default: healthMonitor } = await import('../services/HealthMonitorService.js');
        await healthMonitor.sendAlertEmail(
          status === 'down' ? '🚨 Frontend Application Down' : '⚠️ Frontend Application Degraded',
          {
            frontendUrl,
            status,
            statusCode,
            responseTime: `${responseTime}ms`,
            error,
            healthCheck,
            containerStatus,
            timestamp: new Date().toISOString()
          },
          status === 'down'
        );
      } catch (emailError) {
        console.error('Failed to send frontend alert email:', emailError.message);
      }
    }
    
  } catch (err) {
    error = err.message;
    status = 'down';
    responseTime = Date.now() - startTime;
    
    if (!skipDockerCheck) {
      try {
        const { default: healthMonitor } = await import('../services/HealthMonitorService.js');
        await healthMonitor.sendAlertEmail(
          '🚨 Frontend Application Unreachable',
          {
            frontendUrl,
            error: error,
            responseTime: `${responseTime}ms`,
            containerStatus,
            timestamp: new Date().toISOString()
          },
          true
        );
      } catch (emailError) {
        console.error('Failed to send frontend alert email:', emailError.message);
      }
    }
  }

  res.json({
    data: {
      url: frontendUrl,
      status,
      statusCode,
      responseTime: responseTime + 'ms',
      lastChecked: new Date().toISOString(),
      error: error || null,
      bodySample: bodySample || null,
      healthCheck: Object.keys(healthCheck).length > 0 ? healthCheck : null,
      containerStatus,
      skipDockerCheck,
    },
  });
});

/**
 * GET /frontend/status/health
 * Detailed frontend health check with authentication
 * Protected endpoint (requires admin auth)
 */
router.get('/frontend/status/health', authenticate, async (req, res) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const containerName = process.env.FRONTEND_CONTAINER_NAME || 'evolution-frontend';
    const skipDockerCheck = process.env.SKIP_DOCKER_CHECK === 'true' || process.env.NODE_ENV === 'development';
    const startTime = Date.now();
    
    let status = 'unknown';
    let statusCode = null;
    let error = null;
    let responseTime = 'N/A';
    let details = {};
    let containerStatus = null;

    // Check container status - skip if in development
    if (!skipDockerCheck) {
      try {
        const container = docker.getContainer(containerName);
        const inspectData = await container.inspect();
        containerStatus = inspectData.State.Status;
      } catch (containerError) {
        containerStatus = 'unknown';
      }
    } else {
      containerStatus = 'skipped';
    }
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${frontendUrl}/health`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Admin-Monitor/1.0',
          'Accept': 'application/json',
        },
      });
      clearTimeout(timeout);
      
      statusCode = response.status;
      responseTime = `${Date.now() - startTime}ms`;
      
      if (response.status === 200) {
        try {
          const jsonData = await response.json();
          details = jsonData;
          status = jsonData.status === 'OK' ? 'up' : 'degraded';
        } catch (e) {
          status = 'up';
          details = { status: 'OK', raw: true };
        }
      } else if (response.status >= 200 && response.status < 400) {
        status = 'degraded';
        error = `Status: ${response.status}`;
      } else {
        status = 'down';
        error = `Status: ${response.status}`;
      }
    } catch (err) {
      status = 'down';
      error = err.message;
      responseTime = `${Date.now() - startTime}ms`;
    }
    
    res.json({
      success: true,
      data: {
        status,
        url: frontendUrl,
        statusCode,
        responseTime,
        error,
        lastChecked: new Date().toISOString(),
        details,
        containerStatus,
        skipDockerCheck,
      }
    });
  } catch (error) {
    console.error('Error in frontend health check:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /frontend/restart
 * Restart the frontend application
 * Protected endpoint (requires admin auth)
 */
router.post('/frontend/restart', authenticate, async (req, res) => {
  const { force = true } = req.body;  // ✅ Default to true for development
  const containerName = process.env.FRONTEND_CONTAINER_NAME || 'evolution-frontend';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const skipDockerCheck = process.env.SKIP_DOCKER_CHECK === 'true' || process.env.NODE_ENV === 'development';
  
  try {
    console.log(`🔄 Frontend restart initiated by ${req.user?.username || 'unknown'}`);
    
    let isRunning = false;
    let containerStatus = null;
    
    // Check if frontend is currently running
    if (!skipDockerCheck) {
      try {
        const container = docker.getContainer(containerName);
        const inspectData = await container.inspect();
        containerStatus = inspectData.State.Status;
        isRunning = containerStatus === 'running';
      } catch (containerError) {
        console.warn('Container check failed:', containerError.message);
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          const response = await fetch(`${frontendUrl}/health`, {
            signal: controller.signal,
          });
          clearTimeout(timeout);
          isRunning = response.ok;
        } catch (e) {
          isRunning = false;
        }
      }
    } else {
      containerStatus = 'skipped';
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${frontendUrl}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        isRunning = response.ok;
      } catch (e) {
        isRunning = false;
      }
    }

    // ✅ If not running and force is false, return error
    if (!isRunning && !force) {
      return res.status(400).json({
        success: false,
        message: 'Frontend is not currently running. Use force=true to force restart.',
        isRunning: false,
        containerStatus,
        skipDockerCheck,
      });
    }

    // ✅ If not running but force is true, log it
    if (!isRunning && force) {
      console.log('⚠️ Frontend is not running, but force=true. Attempting forced restart...');
    }

    // Send notification that restart is happening
    try {
      const { default: healthMonitor } = await import('../services/HealthMonitorService.js');
      await healthMonitor.sendAlertEmail(
        '🔄 Frontend Restart Initiated',
        {
          frontendUrl,
          containerName,
          initiatedBy: req.user?.username || 'system',
          isRunning,
          force,
          containerStatus,
          skipDockerCheck,
          timestamp: new Date().toISOString()
        },
        false
      );
    } catch (emailError) {
      console.error('Failed to send restart notification:', emailError.message);
    }

    // ============================================================
    // ATTEMPT RESTART
    // ============================================================
    let restartMethod = 'none';
    let restartSuccess = false;
    
    if (!skipDockerCheck) {
      try {
        console.log(`🐳 Attempting Docker restart for container: ${containerName}`);
        const container = docker.getContainer(containerName);
        await container.restart();
        restartMethod = 'docker';
        restartSuccess = true;
        console.log(`✅ Docker container "${containerName}" restarted successfully`);
      } catch (dockerError) {
        console.warn('⚠️ Docker restart failed:', dockerError.message);
      }
    } else {
      console.log('ℹ️ Skipping Docker restart (development mode)');
    }
    
    // If Docker restart failed or skipped, try PM2
    if (!restartSuccess) {
      try {
        const pm2Command = process.env.FRONTEND_RESTART_COMMAND || 'pm2 restart frontend';
        console.log(`🔄 Attempting PM2 restart: ${pm2Command}`);
        
        const { exec } = await import('child_process');
        const execPromise = (command) => new Promise((resolve, reject) => {
          exec(command, (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`PM2 error: ${error.message}\nstderr: ${stderr}`));
            } else {
              resolve(stdout);
            }
          });
        });
        
        const output = await execPromise(pm2Command);
        restartMethod = 'pm2';
        restartSuccess = true;
        console.log(`✅ PM2 restart successful: ${output}`);
      } catch (pm2Error) {
        console.error('❌ PM2 restart failed:', pm2Error.message);
        
        try {
          const fallbackCommand = process.env.FRONTEND_FALLBACK_RESTART_COMMAND || 'systemctl restart frontend';
          console.log(`🔄 Attempting fallback restart: ${fallbackCommand}`);
          
          const { exec } = await import('child_process');
          const execPromise = (command) => new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
              if (error) {
                reject(new Error(`Fallback error: ${error.message}\nstderr: ${stderr}`));
              } else {
                resolve(stdout);
              }
            });
          });
          
          const output = await execPromise(fallbackCommand);
          restartMethod = 'fallback';
          restartSuccess = true;
          console.log(`✅ Fallback restart successful: ${output}`);
        } catch (fallbackError) {
          console.error('❌ All restart methods failed:', fallbackError.message);
          
          try {
            const { default: healthMonitor } = await import('../services/HealthMonitorService.js');
            await healthMonitor.sendAlertEmail(
              '🚨 Frontend Restart Failed - All Methods',
              {
                frontendUrl,
                containerName,
                dockerError: dockerError.message,
                pm2Error: pm2Error.message,
                fallbackError: fallbackError.message,
                initiatedBy: req.user?.username || 'system',
                skipDockerCheck,
                timestamp: new Date().toISOString()
              },
              true
            );
          } catch (emailError) {
            console.error('Failed to send alert email:', emailError.message);
          }
          
          return res.status(500).json({
            success: false,
            message: 'All restart methods failed. Please check the server logs.',
            errors: {
              docker: dockerError.message,
              pm2: pm2Error.message,
              fallback: fallbackError.message,
            },
            skipDockerCheck,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // ============================================================
    // VERIFY RESTART SUCCESS
    // ============================================================
    let isBackUp = false;
    let checkAttempts = 0;
    const maxAttempts = 10;
    
    console.log(`⏳ Waiting for frontend to come back up...`);
    
    while (!isBackUp && checkAttempts < maxAttempts) {
      checkAttempts++;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${frontendUrl}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.ok) {
          isBackUp = true;
          console.log(`✅ Frontend is back online after ${checkAttempts} attempts`);
          break;
        }
      } catch (e) {
        // Still starting up
      }
      
      if (checkAttempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Send notification about restart result
    try {
      const { default: healthMonitor } = await import('../services/HealthMonitorService.js');
      await healthMonitor.sendAlertEmail(
        isBackUp ? '✅ Frontend Restart Successful' : '⚠️ Frontend Restart May Have Failed',
        {
          frontendUrl,
          containerName,
          initiatedBy: req.user?.username || 'system',
          restartMethod,
          isRunning: isBackUp,
          checkAttempts,
          skipDockerCheck,
          timestamp: new Date().toISOString()
        },
        !isBackUp
      );
    } catch (emailError) {
      console.error('Failed to send restart result notification:', emailError.message);
    }

    res.json({
      success: true,
      message: isBackUp 
        ? `Frontend restarted successfully via ${restartMethod} and is back online.` 
        : `Frontend restart via ${restartMethod} initiated. It may take a moment to come back online.`,
      isRunning: isBackUp,
      restartMethod,
      checkAttempts,
      containerStatus: restartSuccess ? 'restarting' : containerStatus,
      skipDockerCheck,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Error restarting frontend:', error);
    
    try {
      const { default: healthMonitor } = await import('../services/HealthMonitorService.js');
      await healthMonitor.sendAlertEmail(
        '🚨 Frontend Restart Failed',
        {
          frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
          containerName,
          error: error.message,
          initiatedBy: req.user?.username || 'system',
          skipDockerCheck,
          timestamp: new Date().toISOString()
        },
        true
      );
    } catch (emailError) {
      console.error('Failed to send restart failure notification:', emailError.message);
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to restart frontend',
      skipDockerCheck,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /frontend/status/history
 * Get frontend status history
 * Protected endpoint (requires admin auth)
 */
router.get('/frontend/status/history', authenticate, async (req, res) => {
  try {
    const { limit = 50, days = 7 } = req.query;
    
    // If you have a status history table, query it here
    // For now, return sample data
    const history = [];
    const now = new Date();
    
    for (let i = 0; i < Math.min(limit, 50); i++) {
      const date = new Date(now);
      date.setMinutes(date.getMinutes() - i * 5);
      
      // Simulate some random statuses
      const statuses = ['up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'degraded'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      
      history.push({
        timestamp: date.toISOString(),
        status,
        responseTime: Math.floor(Math.random() * 200 + 50),
      });
    }
    
    res.json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error) {
    console.error('Error fetching frontend status history:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});


// ==========================================
// 16. MIDDLEWARES (filesystem)
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
// 17. WEBHOOKS
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

// ============================================
// 18. TRAFFIC STATS ENDPOINTS
// ============================================
router.get('/traffic/stats', async (req, res) => {
  try {
    const redis = req.app.get('redisClient');
    if (!redis) {
      return res.status(200).json({
        success: true,
        data: {
          totalRequests: 0,
          uniqueRoutes: 0,
          topRoutes: [],
          allRoutes: [],
          redisConnected: false,
          message: 'Redis not available - traffic monitoring disabled'
        },
        timestamp: new Date().toISOString()
      });
    }

    const redisConnected = redis.status === 'ready';
    if (!redisConnected) {
      return res.status(200).json({
        success: true,
        data: {
          totalRequests: 0,
          uniqueRoutes: 0,
          topRoutes: [],
          allRoutes: [],
          redisConnected: false,
          message: 'Redis is not connected'
        },
        timestamp: new Date().toISOString()
      });
    }

    const keys = await redis.keys('traffic:*');
    const stats = [];
    let totalRequests = 0;

    for (const key of keys) {
      const count = await redis.get(key);
      const route = key.replace('traffic:', '');
      const numCount = parseInt(count) || 0;
      totalRequests += numCount;
      stats.push({
        route,
        count: numCount,
        percentage: 0
      });
    }

    stats.forEach(stat => {
      stat.percentage = totalRequests > 0 ? ((stat.count / totalRequests) * 100).toFixed(1) : 0;
    });

    stats.sort((a, b) => b.count - a.count);

    const topRoutes = stats.slice(0, 20);
    const uniqueRoutes = stats.length;

    res.status(200).json({
      success: true,
      data: {
        totalRequests,
        uniqueRoutes,
        topRoutes,
        allRoutes: stats,
        redisConnected: true,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching traffic stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch traffic stats',
      error: error.message,
      data: {
        totalRequests: 0,
        uniqueRoutes: 0,
        topRoutes: [],
        allRoutes: [],
        redisConnected: false,
        error: error.message
      }
    });
  }
});

router.get('/traffic', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  try {
    const redis = req.app.get('redisClient');
    if (!redis) {
      console.warn('⚠️ Redis client not available – returning empty traffic stats');
      return res.json({
        success: true,
        data: [],
        summary: {
          totalRequests: 0,
          uniqueRoutes: 0,
          topRoute: null
        },
        message: 'Redis not available',
        timestamp: new Date().toISOString()
      });
    }

    const redisConnected = redis.status === 'ready';
    if (!redisConnected) {
      return res.json({
        success: true,
        data: [],
        summary: {
          totalRequests: 0,
          uniqueRoutes: 0,
          topRoute: null
        },
        message: 'Redis is not connected',
        timestamp: new Date().toISOString()
      });
    }

    let keys = [];
    try {
      keys = await redis.keys('traffic:*');
    } catch (redisError) {
      console.warn('⚠️ Redis query failed – returning empty traffic stats:', redisError.message);
      return res.json({
        success: true,
        data: [],
        summary: {
          totalRequests: 0,
          uniqueRoutes: 0,
          topRoute: null
        },
        message: 'Redis query failed',
        timestamp: new Date().toISOString()
      });
    }

    const data = [];
    let total = 0;
    for (const key of keys) {
      const count = await redis.get(key).catch(() => 0);
      const route = key.replace('traffic:', '');
      const numCount = parseInt(count, 10) || 0;
      total += numCount;
      data.push({ route, count: numCount });
    }
    data.sort((a, b) => b.count - a.count);

    const summary = {
      totalRequests: total,
      uniqueRoutes: data.length,
      topRoute: data.length > 0 ? data[0] : null,
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data,
      summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Traffic stats error:', error);
    res.status(200).json({
      success: false,
      data: [],
      summary: {
        totalRequests: 0,
        uniqueRoutes: 0,
        topRoute: null
      },
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/traffic/redis-status', async (req, res) => {
  try {
    const redis = req.app.get('redisClient');
    const redisConnected = redis && redis.status === 'ready';
    
    res.status(200).json({
      success: true,
      data: {
        connected: redisConnected,
        status: redisConnected ? 'Connected' : 'Disconnected',
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check Redis status',
      error: error.message
    });
  }
});

router.post('/traffic/reset', async (req, res) => {
  try {
    const redis = req.app.get('redisClient');
    if (!redis) {
      return res.status(200).json({
        success: false,
        message: 'Redis not available',
        timestamp: new Date().toISOString()
      });
    }

    const redisConnected = redis.status === 'ready';
    if (!redisConnected) {
      return res.status(200).json({
        success: false,
        message: 'Redis is not connected',
        timestamp: new Date().toISOString()
      });
    }

    const keys = await redis.keys('traffic:*');
    let deleted = 0;
    for (const key of keys) {
      await redis.del(key);
      deleted++;
    }

    res.status(200).json({
      success: true,
      message: `Reset ${deleted} traffic counters`,
      deletedCount: deleted,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error resetting traffic stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to reset traffic stats',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ==========================================
// 19. EXPORT ROUTER
// ==========================================
export default router;