// src/services/ConfigurationService.js
import db from './index.js';

class ConfigurationService {
  constructor() {
    this.cache = new Map();
    this.initialized = false;
    this.defaultValues = {
      'login.enable_hours_restriction': false,
      'login.default_earliest_time': '08:00:00',
      'login.default_latest_time': '18:00:00',
      'login.allow_admin_override': true,
      'login.override_roles': ['Administrator', 'SuperAdmin']
    };
  }

  async initialize() {
    if (this.initialized) return;
    
    // Load all configurations into cache
    const configs = await db.Configuration.findAll();
    configs.forEach(config => {
      this.cache.set(config.key, this.parseValue(config.value, config.type));
    });
    
    this.initialized = true;
  }

  parseValue(value, type) {
    if (value === null || value === undefined) return null;
    
    switch (type) {
      case 'boolean':
        return value === 'true' || value === true || value === 1;
      case 'number':
        return Number(value);
      case 'json':
        try {
          return JSON.parse(value);
        } catch (e) {
          return value;
        }
      case 'array':
        try {
          return JSON.parse(value);
        } catch (e) {
          return Array.isArray(value) ? value : [value];
        }
      default:
        return value;
    }
  }

  async get(key, defaultValue = null) {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const config = await db.Configuration.findOne({ where: { key } });
    
    if (config) {
      const value = this.parseValue(config.value, config.type);
      this.cache.set(key, value);
      return value;
    }

    // Return default value if exists
    return this.defaultValues[key] !== undefined ? this.defaultValues[key] : defaultValue;
  }

  async set(key, value, options = {}) {
    const { type = 'string', category = 'system', description = '', updated_by = null } = options;
    
    let storedValue = value;
    if (type === 'json' || type === 'array') {
      storedValue = JSON.stringify(value);
    } else if (type === 'boolean') {
      storedValue = value ? 'true' : 'false';
    }
    
    const [config, created] = await db.Configuration.upsert({
      key,
      value: storedValue,
      type,
      category,
      description,
      updated_by,
      updated_at: new Date()
    }, {
      where: { key },
      returning: true
    });

    // Update cache
    this.cache.set(key, this.parseValue(config.value, config.type));
    
    return config;
  }

  async getAll(category = null) {
    const where = category ? { category } : {};
    const configs = await db.Configuration.findAll({ where });
    
    return configs.map(config => ({
      key: config.key,
      value: this.parseValue(config.value, config.type),
      type: config.type,
      category: config.category,
      description: config.description,
      is_editable: config.is_editable,
      requires_restart: config.requires_restart,
      min_value: config.min_value,
      max_value: config.max_value,
      options: config.options,
      created_at: config.created_at,
      updated_at: config.updated_at
    }));
  }

  async clearCache(key = null) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  async isLoginHoursRestrictionEnabled() {
    return await this.get('login.enable_hours_restriction', false);
  }

  async canBypassLoginHours(userRoles) {
    const allowOverride = await this.get('login.allow_admin_override', true);
    const overrideRoles = await this.get('login.override_roles', ['Administrator', 'SuperAdmin']);
    
    if (!allowOverride) return false;
    
    return userRoles.some(role => overrideRoles.includes(role));
  }

  async getLoginHours() {
    return {
      enabled: await this.get('login.enable_hours_restriction', false),
      default_earliest: await this.get('login.default_earliest_time', '08:00:00'),
      default_latest: await this.get('login.default_latest_time', '18:00:00'),
      allow_admin_override: await this.get('login.allow_admin_override', true),
      override_roles: await this.get('login.override_roles', ['Administrator', 'SuperAdmin'])
    };
  }

  async getCategories() {
    const categories = await db.Configuration.findAll({
      attributes: ['category'],
      group: ['category']
    });
    
    return categories.map(c => c.category);
  }
}

export default ConfigurationService;