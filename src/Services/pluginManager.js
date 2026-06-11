// services/pluginManager.js
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../config/db.js';
import envManager from './envManager.js';
import dataSourceManager from './dataSourceManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = path.join(__dirname, '../../plugins');

class PluginManager {
  constructor() {
    this.plugins = new Map(); // pluginId -> { instance, status, module }
    this.modelRegistry = new Map(); // modelName -> model
  }

  async loadPluginsFromDB() {
    await fs.ensureDir(PLUGINS_DIR);
    const [rows] = await db.query('SELECT * FROM admin_plugins WHERE status != "deleted"');
    for (const row of rows) {
      if (row.auto_start) await this.startPlugin(row.id, row.file_path);
    }
  }

async uninstallPlugin(pluginId) {
  await this.stopPlugin(pluginId);
  const [rows] = await db.query('SELECT file_path FROM admin_plugins WHERE id = ?', [pluginId]);
  if (rows.length) {
    const pluginDir = path.dirname(rows[0].file_path);
    await fs.remove(pluginDir);
    await db.query('DELETE FROM admin_plugins WHERE id = ?', [pluginId]);
  }
}

  async startPlugin(pluginId, entryPath) {
    try {
      // Clear require cache for hot reload (optional)
      delete require.cache[require.resolve(entryPath)];
      const pluginModule = await import('file://' + entryPath);
      const plugin = pluginModule.default;
      if (!plugin.init) throw new Error('Plugin must export an init function');
      
      const app = (await import('../app.js')).default; // get main Express app
      const registerModel = (name, model) => this.modelRegistry.set(name, model);
      
      await plugin.init({
        app,
        envManager,
        dataSourceManager,
        registerModel
      });
      
      this.plugins.set(pluginId, { instance: plugin, status: 'active', module: pluginModule });
      await db.query('UPDATE admin_plugins SET status = "active", updated_at = NOW() WHERE id = ?', [pluginId]);
      console.log(`Plugin ${pluginId} started`);
    } catch (err) {
      console.error(`Failed to start plugin ${pluginId}:`, err);
      await db.query('UPDATE admin_plugins SET status = "error", updated_at = NOW() WHERE id = ?', [pluginId]);
      throw err;
    }
  }

async stopAllPlugins() {
  console.log(`🛑 Stopping all running plugins...`);
  const stopPromises = [];
  for (const [pluginId, plugin] of this.plugins.entries()) {
    stopPromises.push(this.stopPlugin(pluginId));
  }
  await Promise.all(stopPromises);
  console.log(`✅ All plugins stopped`);
}


  async uninstallPlugin(pluginId) {
    await this.stopPlugin(pluginId);
    const [rows] = await db.query('SELECT file_path FROM admin_plugins WHERE id = ?', [pluginId]);
    if (rows.length) {
      const pluginDir = path.dirname(rows[0].file_path);
      await fs.remove(pluginDir);
      await db.query('DELETE FROM admin_plugins WHERE id = ?', [pluginId]);
    }
  }
}

export default new PluginManager();