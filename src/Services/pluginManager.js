// services/pluginManager.js
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../config/db.js';
import envManager from './envManager.js';
import dataSourceManager from './dataSourceManager.js';
import AdmZip from 'adm-zip';
import AdminPlugin from '../models/AdminPlugin.js';
import { Op } from 'sequelize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = path.join(__dirname, '../../plugins');

class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.modelRegistry = new Map();
    this.serviceRegistry = new Map();
    this.webhookRegistry = new Map();
    this.routeRegistry = [];
    this.thirdPartyIntegrations = new Map();
  }

  registerIntegration(name, integration) {
    this.thirdPartyIntegrations.set(name, integration);
    console.log(`🔌 Third-party integration registered: ${name}`);
    return this;
  }

  getIntegration(name) {
    return this.thirdPartyIntegrations.get(name);
  }

  getIntegrations() {
    return Array.from(this.thirdPartyIntegrations.keys());
  }

  registerService(name, service) {
    this.serviceRegistry.set(name, service);
    console.log(`📦 Service registered: ${name}`);
    return this;
  }

  getService(name) {
    return this.serviceRegistry.get(name);
  }

  registerWebhook(name, webhook) {
    this.webhookRegistry.set(name, webhook);
    console.log(`🔗 Webhook registered: ${name}`);
    return this;
  }

  getWebhook(name) {
    return this.webhookRegistry.get(name);
  }

  /**
   * Install a new plugin from a zip file buffer
   */
  async installPlugin(pluginName, fileBuffer) {
    try {
      console.log(`📦 Installing plugin: ${pluginName}`);
      console.log(`📦 File buffer size: ${fileBuffer?.length || 0}`);
      
      await fs.ensureDir(PLUGINS_DIR);
      console.log(`📂 Plugins directory: ${PLUGINS_DIR}`);

      const pluginId = Date.now();
      const pluginDir = path.join(PLUGINS_DIR, `plugin_${pluginId}`);
      console.log(`📂 Plugin directory: ${pluginDir}`);
      
      await fs.ensureDir(pluginDir);

      console.log('📦 Extracting zip...');
      try {
        const zip = new AdmZip(fileBuffer);
        zip.extractAllTo(pluginDir, true);
        console.log('✅ Zip extracted successfully');
      } catch (zipError) {
        console.error('❌ Zip extraction failed:', zipError.message);
        throw new Error(`Failed to extract zip: ${zipError.message}`);
      }

      let entryFile = null;
      const possibleEntries = ['index.js', 'main.js', 'plugin.js', `${pluginName}.js`, 'manifest.json'];
      
      const manifestPath = path.join(pluginDir, 'manifest.json');
      if (await fs.pathExists(manifestPath)) {
        try {
          const manifest = await fs.readJson(manifestPath);
          if (manifest.main) {
            const mainPath = path.join(pluginDir, manifest.main);
            if (await fs.pathExists(mainPath)) {
              entryFile = mainPath;
              console.log(`✅ Found entry from manifest: ${manifest.main}`);
            }
          }
        } catch (manifestError) {
          console.warn('⚠️ Could not parse manifest.json:', manifestError.message);
        }
      }

      if (!entryFile) {
        for (const entry of possibleEntries) {
          if (entry === 'manifest.json') continue;
          const entryPath = path.join(pluginDir, entry);
          if (await fs.pathExists(entryPath)) {
            entryFile = entryPath;
            console.log(`✅ Found entry file: ${entry}`);
            break;
          }
        }
      }

      if (!entryFile) {
        const files = await fs.readdir(pluginDir);
        console.log(`📂 Files in plugin directory: ${files.join(', ')}`);
        const jsFiles = files.filter(f => f.endsWith('.js') && !f.includes('test'));
        if (jsFiles.length > 0) {
          entryFile = path.join(pluginDir, jsFiles[0]);
          console.log(`✅ Using fallback entry: ${jsFiles[0]}`);
        }
      }

      if (!entryFile) {
        await fs.remove(pluginDir);
        throw new Error('No entry file (index.js, main.js, or plugin.js) found in the plugin zip');
      }

      console.log('💾 Saving to database using model...');
      
      const existingPlugin = await AdminPlugin.findOne({
        where: { 
          name: pluginName,
          status: { [Op.ne]: 'deleted' }
        }
      });
      
      let newPluginId;
      if (existingPlugin) {
        existingPlugin.file_path = entryFile;
        existingPlugin.status = 'stopped';
        existingPlugin.updated_at = new Date();
        await existingPlugin.save();
        newPluginId = existingPlugin.id;
        console.log(`✅ Plugin "${pluginName}" updated with ID ${newPluginId}`);
      } else {
        const plugin = await AdminPlugin.create({
          name: pluginName,
          version: '1.0.0',
          description: '',
          status: 'stopped',
          file_path: entryFile,
          auto_start: false
        });
        newPluginId = plugin.id;
        console.log(`✅ Plugin "${pluginName}" installed with ID ${newPluginId}`);
      }
      
      console.log(`📂 Entry file: ${entryFile}`);
      return newPluginId;

    } catch (error) {
      console.error('❌ Failed to install plugin:', error);
      console.error('❌ Stack:', error.stack);
      throw error;
    }
  }

  /**
   * Load all plugins from database on startup
   */
  async loadPluginsFromDB() {
    try {
      await fs.ensureDir(PLUGINS_DIR);
      
      const plugins = await AdminPlugin.findAll({
        where: { status: { [Op.ne]: 'deleted' } }
      });
      
      if (plugins.length === 0) {
        console.log('📦 No plugins found in database');
        return;
      }

      console.log(`📦 Found ${plugins.length} plugins in database`);
      
      await this.registerCoreServices();
      
      for (const plugin of plugins) {
        if (!await fs.pathExists(plugin.file_path)) {
          console.warn(`⚠️ Plugin ${plugin.name} file not found at ${plugin.file_path}, skipping`);
          continue;
        }
        
        if (plugin.auto_start || plugin.status === 'active') {
          try {
            await this.startPlugin(plugin.id, plugin.file_path);
          } catch (error) {
            console.error(`❌ Failed to auto-start plugin ${plugin.name}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error('❌ Failed to load plugins:', error);
    }
  }

  /**
   * Register core services that plugins can use
   */
  async registerCoreServices() {
    try {
      const PremblyAMLService = (await import('./PremblyAMLService.js')).default;
      this.registerService('aml', PremblyAMLService);
      
      console.log('✅ Core services registered for plugin use');
    } catch (error) {
      console.warn('⚠️ Could not register core services:', error.message);
    }
  }

  /**
   * Start a plugin
   */
  async startPlugin(pluginId, entryPath = null) {
    try {
      console.log(`🚀 Starting plugin ${pluginId}...`);
      
      if (!entryPath) {
        const plugin = await AdminPlugin.findByPk(pluginId);
        
        if (!plugin) {
          throw new Error(`Plugin ${pluginId} not found in database`);
        }
        
        if (!plugin.file_path) {
          throw new Error(`Plugin ${pluginId} has no file_path`);
        }
        
        entryPath = plugin.file_path;
        console.log(`📂 Using file_path from database: ${entryPath}`);
      }
      
      if (!entryPath || typeof entryPath !== 'string') {
        throw new Error(`Invalid entryPath for plugin ${pluginId}: ${entryPath}`);
      }
      
      if (!await fs.pathExists(entryPath)) {
        throw new Error(`Plugin file not found: ${entryPath}`);
      }
      
      const resolvedPath = path.resolve(entryPath);
      console.log(`📂 Resolved path: ${resolvedPath}`);
      
      // ✅ Import the plugin dynamically (ES module)
      const pluginModule = await import('file://' + resolvedPath);
      const plugin = pluginModule.default || pluginModule;
      
      if (!plugin.init && typeof plugin !== 'function') {
        throw new Error('Plugin must export an init function');
      }

      const app = (await import('../app.js')).default;
      
      const context = {
        app,
        envManager,
        dataSourceManager,
        pluginManager: this,
        registerModel: (name, model) => {
          this.modelRegistry.set(name, model);
          console.log(`📊 Plugin registered model: ${name}`);
        },
        registerService: (name, service) => {
          this.registerService(name, service);
        },
        registerWebhook: (name, webhook) => {
          this.registerWebhook(name, webhook);
        },
        registerIntegration: (name, integration) => {
          this.registerIntegration(name, integration);
        },
        getService: (name) => this.getService(name),
        getWebhook: (name) => this.getWebhook(name),
        getIntegration: (name) => this.getIntegration(name),
        services: {
          aml: this.getService('aml'),
        },
        pluginId
      };

      if (typeof plugin === 'function') {
        await plugin(context);
      } else if (plugin.init) {
        await plugin.init(context);
      }

      this.plugins.set(pluginId, { 
        instance: plugin, 
        status: 'active', 
        module: pluginModule 
      });

      await AdminPlugin.update(
        { status: 'active', updated_at: new Date() },
        { where: { id: pluginId } }
      );
      
      const pluginName = (await AdminPlugin.findByPk(pluginId)).name;
      console.log(`✅ Plugin "${pluginName}" (${pluginId}) started successfully`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to start plugin ${pluginId}:`, error.message);
      console.error(`❌ Stack:`, error.stack);
      
      try {
        await AdminPlugin.update(
          { status: 'error', updated_at: new Date() },
          { where: { id: pluginId } }
        );
      } catch (updateError) {
        console.error('❌ Failed to update plugin status:', updateError.message);
      }
      throw error;
    }
  }

  /**
   * Stop a plugin
   */
  async stopPlugin(pluginId) {
    try {
      const plugin = this.plugins.get(pluginId);
      
      if (plugin) {
        if (plugin.instance && typeof plugin.instance.stop === 'function') {
          await plugin.instance.stop();
        } else if (plugin.instance && typeof plugin.instance === 'function' && plugin.instance.stop) {
          await plugin.instance.stop();
        }
        this.plugins.delete(pluginId);
      }

      await AdminPlugin.update(
        { status: 'stopped', updated_at: new Date() },
        { where: { id: pluginId } }
      );

      const pluginName = (await AdminPlugin.findByPk(pluginId)).name;
      console.log(`🛑 Plugin "${pluginName}" (${pluginId}) stopped`);

    } catch (error) {
      console.error(`❌ Failed to stop plugin ${pluginId}:`, error.message);
      throw error;
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(pluginId) {
    try {
      await this.stopPlugin(pluginId);
      
      const plugin = await AdminPlugin.findByPk(pluginId);
      
      if (!plugin) {
        throw new Error(`Plugin ${pluginId} not found`);
      }

      const pluginName = plugin.name;
      const pluginDir = path.dirname(plugin.file_path);

      if (await fs.pathExists(pluginDir)) {
        await fs.remove(pluginDir);
      }

      await AdminPlugin.destroy({ where: { id: pluginId } });
      
      console.log(`🗑️ Plugin "${pluginName}" (${pluginId}) uninstalled`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to uninstall plugin ${pluginId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all plugins - ✅ FIXED: Return fields matching frontend expectations
   */
  async getAllPlugins() {
    try {
      const plugins = await AdminPlugin.findAll({
        where: { status: { [Op.ne]: 'deleted' } },
        order: [['created_at', 'DESC']]
      });
      
      return plugins.map(plugin => ({
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        author: plugin.author || 'Unknown', // Add default author
        description: plugin.description || '',
        status: this.plugins.has(plugin.id) ? 'active' : (plugin.status || 'stopped'),
        auto_start: plugin.auto_start === 1 || plugin.auto_start === true, // ✅ Changed to snake_case
        file_path: plugin.file_path, // ✅ Changed to snake_case
        installed_at: plugin.created_at, // ✅ Changed to snake_case to match frontend
        updated_at: plugin.updated_at, // ✅ Changed to snake_case
        running: this.plugins.has(plugin.id),
        // Keep camelCase for backward compatibility
        autoStart: plugin.auto_start === 1 || plugin.auto_start === true,
        filePath: plugin.file_path,
        createdAt: plugin.created_at,
        updatedAt: plugin.updated_at
      }));
    } catch (error) {
      console.error('Error getting all plugins:', error);
      return [];
    }
  }

  /**
   * Get plugin stats
   */
  async getStats(pluginName) {
    try {
      const plugin = await AdminPlugin.findOne({
        where: { 
          name: pluginName,
          status: { [Op.ne]: 'deleted' }
        }
      });
      
      if (!plugin) return null;

      const isRunning = this.plugins.has(plugin.id);
      
      return {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        status: isRunning ? 'active' : plugin.status,
        auto_start: plugin.auto_start === 1,
        running: isRunning,
        file_path: plugin.file_path,
        created_at: plugin.created_at,
        updated_at: plugin.updated_at
      };
    } catch (error) {
      console.error(`Error getting stats for plugin ${pluginName}:`, error);
      return null;
    }
  }

  /**
   * Stop all plugins
   */
  async stopAllPlugins() {
    console.log(`🛑 Stopping all running plugins...`);
    const pluginIds = Array.from(this.plugins.keys());
    
    for (const pluginId of pluginIds) {
      try {
        await this.stopPlugin(pluginId);
      } catch (error) {
        console.error(`Failed to stop plugin ${pluginId}:`, error.message);
      }
    }
    
    console.log(`✅ All ${pluginIds.length} plugins stopped`);
  }

  getModel(modelName) {
    return this.modelRegistry.get(modelName);
  }

  getModels() {
    return Array.from(this.modelRegistry.keys());
  }

  getServices() {
    return Array.from(this.serviceRegistry.keys());
  }

  getWebhooks() {
    return Array.from(this.webhookRegistry.keys());
  }

  getDebugInfo() {
    return {
      pluginsDirectory: PLUGINS_DIR,
      pluginsDirectoryExists: fs.pathExistsSync(PLUGINS_DIR),
      loadedPlugins: Array.from(this.plugins.keys()),
      registeredServices: Array.from(this.serviceRegistry.keys()),
      registeredWebhooks: Array.from(this.webhookRegistry.keys()),
      registeredModels: Array.from(this.modelRegistry.keys()),
      thirdPartyIntegrations: Array.from(this.thirdPartyIntegrations.keys()),
      pluginCount: this.plugins.size,
      serviceCount: this.serviceRegistry.size,
      webhookCount: this.webhookRegistry.size,
      modelCount: this.modelRegistry.size,
      integrationCount: this.thirdPartyIntegrations.size
    };
  }
}

export default new PluginManager();