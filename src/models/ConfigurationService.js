// src/services/ConfigurationService.js
import db from './index.js';
import logger from '../utils/logger.js';

class ConfigurationService {
  constructor() {
    this.cache = new Map();
    this.initialized = false;
    this.tableExists = null;
    this.defaultValues = {
      'login.enable_hours_restriction': false,
      'login.default_earliest_time': '08:00:00',
      'login.default_latest_time': '18:00:00',
      'login.allow_admin_override': true,
      'login.override_roles': ['Administrator', 'SuperAdmin'],
      'skip_repayment_on_holiday': true
    };
  }

  async checkTableExists() {
    if (this.tableExists !== null) return this.tableExists;
    try {
      await db.Configuration.count({ limit: 1 });
      this.tableExists = true;
    } catch (error) {
      if (error.name === 'SequelizeDatabaseError' && error.parent?.code === 'ER_NO_SUCH_TABLE') {
        logger.warn('Configuration table does not exist. Using default values only.');
        this.tableExists = false;
      } else {
        logger.error('Error checking configuration table:', error);
        this.tableExists = false;
      }
    }
    return this.tableExists;
  }

  async initialize() {
    if (this.initialized) return;
    const tableExists = await this.checkTableExists();
    if (!tableExists) {
      this.initialized = true;
      logger.info('ConfigurationService initialized with default values (table missing)');
      return;
    }
    try {
      const configs = await db.Configuration.findAll();
      configs.forEach(config => {
        this.cache.set(config.key, this.parseValue(config.value, config.type));
      });
    } catch (error) {
      logger.error('Failed to load configurations:', error);
    }
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
        try { return JSON.parse(value); } catch { return value; }
      case 'array':
        try { return JSON.parse(value); } catch { return Array.isArray(value) ? value : [value]; }
      default:
        return value;
    }
  }

  async get(key, defaultValue = null) {
    if (this.cache.has(key)) return this.cache.get(key);

    const tableExists = await this.checkTableExists();
    if (!tableExists) {
      const fallback = this.defaultValues[key] !== undefined ? this.defaultValues[key] : defaultValue;
      if (fallback !== null) this.cache.set(key, fallback);
      return fallback;
    }

    try {
      const config = await db.Configuration.findOne({ where: { key } });
      if (config) {
        const value = this.parseValue(config.value, config.type);
        this.cache.set(key, value);
        return value;
      }
    } catch (error) {
      logger.error(`Error fetching configuration key ${key}:`, error);
    }

    const fallback = this.defaultValues[key] !== undefined ? this.defaultValues[key] : defaultValue;
    if (fallback !== null) this.cache.set(key, fallback);
    return fallback;
  }

  /**
   * Set a configuration value, with full support for the table columns.
   * @param {string} key - Configuration key
   * @param {any} value - The value to store
   * @param {Object} options - Additional metadata
   * @param {string} options.type - 'string'|'boolean'|'number'|'json'|'array' (default 'string')
   * @param {string} options.category - Category (default 'system')
   * @param {string} options.description - Description of the setting
   * @param {boolean} options.is_editable - Whether UI can edit (default true)
   * @param {boolean} options.requires_restart - If change requires server restart (default false)
   * @param {string} options.min_value - Minimum allowed value (for numeric/string)
   * @param {string} options.max_value - Maximum allowed value
   * @param {any} options.options - Dropdown options (stored as JSON)
   * @param {string} options.updated_by - Username or ID of updater
   */
  async set(key, value, options = {}) {
    const {
      type = 'string',
      category = 'system',
      description = '',
      is_editable = true,
      requires_restart = false,
      min_value = null,
      max_value = null,
      options: selectOptions = null,
      updated_by = null
    } = options;

    const tableExists = await this.checkTableExists();
    if (!tableExists) {
      logger.warn(`Cannot save configuration ${key} – table missing. Value will not persist.`);
      this.cache.set(key, value);
      return null;
    }

    let storedValue = value;
    if (type === 'json' || type === 'array') {
      storedValue = JSON.stringify(value);
    } else if (type === 'boolean') {
      storedValue = value ? 'true' : 'false';
    }

    try {
      const [config] = await db.Configuration.upsert({
        key,
        value: storedValue,
        type,
        category,
        description,
        is_editable,
        requires_restart,
        min_value: min_value ?? null,
        max_value: max_value ?? null,
        options: selectOptions ? JSON.stringify(selectOptions) : null,
        updated_by,
        updated_at: new Date()
      }, { where: { key }, returning: true });

      this.cache.set(key, this.parseValue(config.value, config.type));
      return config;
    } catch (error) {
      logger.error(`Failed to set configuration ${key}:`, error);
      return null;
    }
  }

  async getAll(category = null) {
    const tableExists = await this.checkTableExists();
    if (!tableExists) return [];

    try {
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
    } catch (error) {
      logger.error('Failed to get all configurations:', error);
      return [];
    }
  }

  async clearCache(key = null) {
    if (key) this.cache.delete(key);
    else this.cache.clear();
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
    const tableExists = await this.checkTableExists();
    if (!tableExists) return [];
    try {
      const categories = await db.Configuration.findAll({
        attributes: ['category'],
        group: ['category']
      });
      return categories.map(c => c.category);
    } catch (error) {
      logger.error('Failed to get categories:', error);
      return [];
    }
  }
}

export default ConfigurationService;
