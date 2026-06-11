import sequelize from '../../config/db.js';

// Simple in-memory cache (replaces node-cache)
class SimpleCache {
  constructor() {
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return undefined;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return item.value;
  }

  set(key, value, ttl = 300) {
    this.cache.set(key, {
      value: value,
      expiry: Date.now() + (ttl * 1000)
    });
  }

  del(key) {
    this.cache.delete(key);
  }

  keys() {
    return Array.from(this.cache.keys());
  }
}

class AMLConfigurationService {
  constructor() {
    // Cache configuration with 5 minute TTL
    this.cache = new SimpleCache();
    this.configPrefix = 'aml_config_';
  }

  async getConfig(key, defaultValue = null) {
    const cacheKey = `${this.configPrefix}${key}`;
    let value = this.cache.get(cacheKey);
    
    if (value !== undefined) {
      return this.parseValue(value);
    }
    
    const [result] = await sequelize.query(
      `SELECT config_value, data_type FROM aml_configurations WHERE config_key = :key AND is_active = 1`,
      { replacements: { key }, type: sequelize.QueryTypes.SELECT }
    );
    
    if (!result) {
      return defaultValue;
    }
    
    this.cache.set(cacheKey, result.config_value);
    return this.parseValue(result.config_value, result.data_type);
  }

  async getConfigs(keys) {
    const placeholders = keys.map(() => '?').join(',');
    const results = await sequelize.query(
      `SELECT config_key, config_value, data_type FROM aml_configurations 
       WHERE config_key IN (${placeholders}) AND is_active = 1`,
      { replacements: keys, type: sequelize.QueryTypes.SELECT }
    );
    
    const configs = {};
    results.forEach(result => {
      configs[result.config_key] = this.parseValue(result.config_value, result.data_type);
    });
    
    return configs;
  }

  async getAllConfigs() {
    const results = await sequelize.query(
      `SELECT config_key, config_value, data_type, description FROM aml_configurations 
       WHERE is_active = 1 
       ORDER BY config_key`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    const configs = {};
    results.forEach(result => {
      configs[result.config_key] = this.parseValue(result.config_value, result.data_type);
    });
    
    return configs;
  }

  async updateConfig(key, value, updatedBy = 'system') {
    let dataType = 'STRING';
    if (typeof value === 'number') dataType = 'NUMBER';
    else if (typeof value === 'boolean') dataType = 'BOOLEAN';
    else if (typeof value === 'object') dataType = 'JSON';
    
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    
    await sequelize.query(
      `UPDATE aml_configurations 
       SET config_value = :value, 
           data_type = :dataType, 
           updated_at = NOW(),
           updated_by = :updatedBy
       WHERE config_key = :key`,
      { replacements: { key, value: stringValue, dataType, updatedBy } }
    );
    
    this.cache.del(`${this.configPrefix}${key}`);
    return true;
  }

  parseValue(value, dataType = null) {
    if (!dataType) {
      if (value === 'true' || value === 'false') return value === 'true';
      if (!isNaN(value) && value.trim() !== '') return Number(value);
      if (value.startsWith('{') || value.startsWith('[')) {
        try { return JSON.parse(value); } catch(e) { return value; }
      }
      return value;
    }
    
    switch(dataType) {
      case 'NUMBER': return Number(value);
      case 'BOOLEAN': return value === 'true' || value === '1';
      case 'JSON': try { return JSON.parse(value); } catch(e) { return value; }
      default: return value;
    }
  }

  clearCache() {
    const keys = this.cache.keys();
    keys.forEach(key => {
      if (key.startsWith(this.configPrefix)) {
        this.cache.del(key);
      }
    });
  }

  async reloadAllConfigs() {
    this.clearCache();
    return await this.getAllConfigs();
  }

  async getRiskThreshold(riskLevel) {
    const thresholds = await this.getConfigs([
      'CRITICAL_RISK_THRESHOLD',
      'HIGH_RISK_THRESHOLD', 
      'MEDIUM_RISK_THRESHOLD',
      'LOW_RISK_THRESHOLD'
    ]);
    
    switch(riskLevel) {
      case 'CRITICAL': return thresholds.CRITICAL_RISK_THRESHOLD || 200;
      case 'HIGH': return thresholds.HIGH_RISK_THRESHOLD || 100;
      case 'MEDIUM': return thresholds.MEDIUM_RISK_THRESHOLD || 50;
      case 'LOW': return thresholds.LOW_RISK_THRESHOLD || 20;
      default: return 0;
    }
  }

  async getRiskScore(riskLevel) {
    const scores = await this.getConfigs([
      'RISK_SCORE_VERY_HIGH',
      'RISK_SCORE_HIGH',
      'RISK_SCORE_MEDIUM',
      'RISK_SCORE_LOW',
      'RISK_SCORE_VERY_LOW'
    ]);
    
    switch(riskLevel) {
      case 'VERY_HIGH': return scores.RISK_SCORE_VERY_HIGH || 100;
      case 'HIGH': return scores.RISK_SCORE_HIGH || 75;
      case 'MEDIUM': return scores.RISK_SCORE_MEDIUM || 50;
      case 'LOW': return scores.RISK_SCORE_LOW || 25;
      default: return scores.RISK_SCORE_VERY_LOW || 10;
    }
  }

  async getTransactionLimits(transactionType) {
    const limits = await this.getConfigs([
      'SINGLE_TRANSACTION_LIMIT',
      'MEDIUM_TRANSACTION_LIMIT',
      'LOW_TRANSACTION_LIMIT',
      `${transactionType.toUpperCase()}_HIGH_RISK_LIMIT`
    ]);
    
    return {
      high: limits.SINGLE_TRANSACTION_LIMIT,
      medium: limits.MEDIUM_TRANSACTION_LIMIT,
      low: limits.LOW_TRANSACTION_LIMIT,
      typeSpecific: limits[`${transactionType.toUpperCase()}_HIGH_RISK_LIMIT`] || limits.SINGLE_TRANSACTION_LIMIT
    };
  }
}

export default new AMLConfigurationService();