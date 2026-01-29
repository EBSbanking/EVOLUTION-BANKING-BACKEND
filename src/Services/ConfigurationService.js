// src/services/ConfigurationService.js - UPDATED WITH SQL SYNTAX FIX
import { getSequelize } from '../models/index.js';

class ConfigurationService {
  constructor() {
    this.configCache = new Map();
    this.initialized = false;
    this.sequelize = null;
    
    // Default values for common configurations
    this.defaultValues = {
      'login.enable_hours_restriction': false,
      'login.default_earliest_time': '08:00:00',
      'login.default_latest_time': '18:00:00',
      'login.allow_admin_override': true,
      'login.override_roles': ['Administrator', 'SuperAdmin']
    };
  }

  async initialize() {
    try {
      console.log('🔄 Initializing ConfigurationService...');
      
      this.sequelize = getSequelize();
      if (!this.sequelize) {
        console.warn('❌ Sequelize instance not available');
        return;
      }
      
      // Create table if it doesn't exist
      await this.ensureTableExists();
      
      // Preload common configurations
      await this.preloadConfigurations();
      this.initialized = true;
      console.log('✅ ConfigurationService initialized');
    } catch (error) {
      console.error('❌ Failed to initialize ConfigurationService:', error);
    }
  }

  async ensureTableExists() {
    try {
      // Check if table exists
      const [results] = await this.sequelize.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'configurations'
      `);
      
      if (results.length === 0) {
        console.log('📝 Creating configurations table...');
        await this.sequelize.query(`
          CREATE TABLE configurations (
            id INT PRIMARY KEY AUTO_INCREMENT,
            \`key\` VARCHAR(100) UNIQUE NOT NULL,
            value TEXT,
            type ENUM('boolean', 'string', 'number', 'json', 'time', 'array') DEFAULT 'string',
            category VARCHAR(50) DEFAULT 'system',
            description TEXT,
            is_editable BOOLEAN DEFAULT TRUE,
            requires_restart BOOLEAN DEFAULT FALSE,
            min_value VARCHAR(50),
            max_value VARCHAR(50),
            options TEXT,
            created_by INT,
            updated_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);
        console.log('✅ Configurations table created');
      } else {
        console.log('✅ Configurations table already exists');
      }
    } catch (error) {
      console.error('❌ Failed to ensure table exists:', error);
      throw error;
    }
  }

  async preloadConfigurations() {
    const defaultConfigs = [
      {
        key: 'login.enable_hours_restriction',
        value: 'false',
        type: 'boolean',
        category: 'security',
        description: 'Enable/disable login hours restriction globally',
        is_editable: true,
        requires_restart: false
      },
      {
        key: 'login.default_earliest_time',
        value: '08:00:00',
        type: 'time',
        category: 'security',
        description: 'Default earliest login time for new users',
        is_editable: true,
        requires_restart: false
      },
      {
        key: 'login.default_latest_time',
        value: '18:00:00',
        type: 'time',
        category: 'security',
        description: 'Default latest login time for new users',
        is_editable: true,
        requires_restart: false
      },
      {
        key: 'login.allow_admin_override',
        value: 'true',
        type: 'boolean',
        category: 'security',
        description: 'Allow admin users to bypass login hours',
        is_editable: true,
        requires_restart: false
      },
      {
        key: 'login.override_roles',
        value: '["Administrator", "SuperAdmin"]',
        type: 'json',
        category: 'security',
        description: 'Roles that can bypass login hours',
        is_editable: true,
        requires_restart: false
      }
    ];

    for (const config of defaultConfigs) {
      try {
        await this.set(config.key, config.value, {
          type: config.type,
          category: config.category,
          description: config.description,
          is_editable: config.is_editable,
          requires_restart: config.requires_restart
        });
        console.log(`✅ Preloaded config: ${config.key}`);
      } catch (error) {
        console.warn(`⚠️ Failed to preload config ${config.key}:`, error.message);
      }
    }
  }

  async get(key, defaultValue = null) {
    // Check cache first
    if (this.configCache.has(key)) {
      return this.configCache.get(key);
    }

    if (!this.sequelize) {
      console.warn(`⚠️ Sequelize not available, using default for ${key}`);
      return this.defaultValues[key] !== undefined ? this.defaultValues[key] : defaultValue;
    }

    try {
      // FIXED: Use backticks around 'key' column (reserved word in MySQL)
      const [results] = await this.sequelize.query(
        'SELECT `value`, `type` FROM `configurations` WHERE `key` = ? LIMIT 1',
        { replacements: [key] }
      );
      
      if (results.length === 0) {
        // Return default value from defaults if available
        const finalDefault = this.defaultValues[key] !== undefined ? this.defaultValues[key] : defaultValue;
        this.configCache.set(key, finalDefault);
        return finalDefault;
      }
      
      const { value, type } = results[0];
      let parsedValue = this.parseValue(value, type);
      
      this.configCache.set(key, parsedValue);
      return parsedValue;
    } catch (error) {
      console.error(`❌ Error getting config ${key}:`, error.message);
      // Return default value from defaults if available
      return this.defaultValues[key] !== undefined ? this.defaultValues[key] : defaultValue;
    }
  }

  async getRawConfig(key) {
    try {
      if (!this.sequelize) {
        return null;
      }
      
      // FIXED: Use backticks around 'key' column
      const [results] = await this.sequelize.query(
        'SELECT `value`, `type` FROM `configurations` WHERE `key` = ? LIMIT 1',
        { replacements: [key] }
      );
      
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error(`❌ Error in getRawConfig for key "${key}":`, error.message);
      return null;
    }
  }

  async set(key, value, options = {}) {
    if (!this.sequelize) {
      throw new Error('Database connection not available');
    }

    try {
      const type = options.type || this.determineType(value);
      const stringValue = this.stringifyValue(value, type);
      
      // FIXED: Use backticks around 'key' column in INSERT statement
      await this.sequelize.query(`
        INSERT INTO configurations (\`key\`, value, type, category, description, is_editable, requires_restart, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          value = VALUES(value),
          type = VALUES(type),
          category = VALUES(category),
          description = VALUES(description),
          is_editable = VALUES(is_editable),
          requires_restart = VALUES(requires_restart),
          updated_by = VALUES(updated_by),
          updated_at = CURRENT_TIMESTAMP
      `, {
        replacements: [
          key,
          stringValue,
          type,
          options.category || 'system',
          options.description || '',
          options.is_editable !== undefined ? (options.is_editable ? 1 : 0) : 1,
          options.requires_restart || 0,
          options.created_by || null,
          options.updated_by || null
        ]
      });
      
      // Update cache
      const parsedValue = this.parseValue(stringValue, type);
      this.configCache.set(key, parsedValue);
      
      console.log(`✅ Config saved: ${key} = ${parsedValue}`);
      
      return { key, value: parsedValue, type };
    } catch (error) {
      console.error(`❌ Error setting config ${key}:`, error);
      throw error;
    }
  }

  determineType(value) {
    if (value === null || value === undefined) return 'string';
    
    const valueType = typeof value;
    
    if (valueType === 'boolean') return 'boolean';
    if (valueType === 'number') return 'number';
    if (Array.isArray(value)) return 'array';
    if (valueType === 'object') return 'json';
    if (typeof value === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(value)) return 'time';
    
    return 'string';
  }

  parseValue(value, type) {
    if (value === null || value === undefined) return value;
    
    switch(type) {
      case 'boolean':
        return value === true || value === 'true' || value === 1 || value === '1';
      case 'number':
        return Number(value);
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      case 'array':
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return value.split(',').map(item => item.trim());
          }
        }
        return value;
      case 'time':
        // Ensure time format
        if (typeof value === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
          return value.length === 5 ? `${value}:00` : value;
        }
        return value;
      default:
        return String(value);
    }
  }

  stringifyValue(value, type) {
    if (value === null || value === undefined) return null;
    
    switch(type) {
      case 'boolean':
        return value === true || value === 'true' || value === 1 || value === '1' ? 'true' : 'false';
      case 'number':
        return String(value);
      case 'json':
      case 'array':
        if (typeof value === 'string') {
          return value;
        }
        return JSON.stringify(value);
      default:
        return String(value);
    }
  }

  async clearCache(key = null) {
    if (key) {
      this.configCache.delete(key);
    } else {
      this.configCache.clear();
    }
    console.log('🗑️ Configuration cache cleared');
  }

  async getAll(category = null) {
    if (!this.sequelize) {
      return [];
    }

    try {
      let query = 'SELECT * FROM `configurations`';
      const replacements = [];
      
      if (category) {
        query += ' WHERE category = ?';
        replacements.push(category);
      }
      
      query += ' ORDER BY category, `key`';
      
      const [results] = await this.sequelize.query(query, { replacements });
      
      return results.map(row => ({
        key: row.key,
        value: this.parseValue(row.value, row.type),
        type: row.type,
        category: row.category,
        description: row.description,
        is_editable: row.is_editable,
        requires_restart: row.requires_restart,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
    } catch (error) {
      console.error('❌ Error getting all configurations:', error);
      return [];
    }
  }

  // Convenience methods for login configuration
  async isLoginHoursRestrictionEnabled() {
    return await this.get('login.enable_hours_restriction', false);
  }

  async getLoginHours() {
    const enabled = await this.isLoginHoursRestrictionEnabled();
    
    return {
      enabled: enabled,
      earliest: await this.get('login.default_earliest_time', '08:00:00'),
      latest: await this.get('login.default_latest_time', '18:00:00'),
      allow_admin_override: await this.get('login.allow_admin_override', true),
      override_roles: await this.get('login.override_roles', ['Administrator', 'SuperAdmin'])
    };
  }

  async canBypassLoginHours(roles = []) {
    const allowOverride = await this.get('login.allow_admin_override', true);
    if (!allowOverride) return false;

    const overrideRoles = await this.get('login.override_roles', ['Administrator', 'SuperAdmin']);
    return roles.some(role => overrideRoles.includes(role));
  }

  async getCategories() {
    if (!this.sequelize) {
      return [];
    }

    try {
      const [results] = await this.sequelize.query(
        'SELECT DISTINCT category FROM `configurations` ORDER BY category'
      );
      return results.map(row => row.category);
    } catch (error) {
      console.error('❌ Error getting categories:', error);
      return [];
    }
  }
}

// Singleton instance
const configurationService = new ConfigurationService();

export default configurationService;