// routes/adminRoutes.js
import express from 'express';
import { sequelize } from '../../config/db.js';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';
import envManager from '../services/envManager.js';
import dataSourceManager from '../services/dataSourceManager.js';
import pluginManager from '../services/pluginManager.js';
import multer from 'multer';

const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });
const router = express.Router();

// 🔐 Apply authentication & admin check to ALL admin routes
router.use(protect);
router.use(isAdmin);

// ----- Environment -----
router.get('/env', async (req, res) => {
  const [rows] = await sequelize.query('SELECT * FROM admin_env_vars');
  res.json(rows);
});

router.put('/env/:key', async (req, res) => {
  const { key } = req.params;
  const { value, description } = req.body;
  await envManager.set(key, value, description);
  res.json({ success: true });
});

// ----- Data Sources -----
router.get('/datasources', async (req, res) => {
  const [rows] = await sequelize.query('SELECT * FROM admin_data_sources WHERE status != "deleted"');
  res.json(rows);
});

// ✅ Monitoring stats endpoint
router.get('/datasources/:name/stats', async (req, res) => {
  const { name } = req.params;
  const stats = await dataSourceManager.getStats(name);
  if (!stats) {
    return res.status(404).json({ error: 'Data source not found' });
  }
  res.json(stats);
});

router.post('/datasources/test', async (req, res) => {
  const ok = await dataSourceManager.testConnection(req.body);
  res.json({ success: ok });
});

// ✅ Pass userId for audit logging (CREATE or UPDATE)
router.post('/datasources', async (req, res) => {
  await dataSourceManager.createOrUpdate(req.body, req.user.id);
  res.json({ name: req.body.name });
});

// ✅ Pass userId for audit logging (DELETE)
router.delete('/datasources/:name', async (req, res) => {
  await dataSourceManager.remove(req.params.name, req.user.id);
  res.json({ success: true });
});

// ----- Plugins -----
router.post('/plugins/upload', upload.single('plugin'), async (req, res) => {
  const pluginId = await pluginManager.installPlugin(req.body.name, req.file.buffer);
  res.json({ pluginId });
});

router.post('/plugins/:id/start', async (req, res) => {
  await pluginManager.startPlugin(req.params.id);
  res.json({ success: true });
});

router.post('/plugins/:id/stop', async (req, res) => {
  await pluginManager.stopPlugin(req.params.id);
  res.json({ success: true });
});

router.delete('/plugins/:id', async (req, res) => {
  await pluginManager.uninstallPlugin(req.params.id);
  res.json({ success: true });
});

router.get('/plugins', async (req, res) => {
  const [rows] = await sequelize.query('SELECT id, name, version, status, updated_at FROM admin_plugins');
  res.json(rows);
});

export default router;