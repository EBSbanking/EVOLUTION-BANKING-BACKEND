// controllers/ThriftSettingsController.js
import { Op } from 'sequelize';
import sequelizeInstance from '../../config/db.js';
import ThriftSettings from '../models/ThriftSettings.js';
import logger from '../utils/logger.js';

class ThriftSettingsController {
  // ============================================
  // GET ALL SETTINGS
  // ============================================
  static async getAllSettings(req, res) {
    try {
      const ThriftSettingsModel = ThriftSettings(sequelizeInstance);
      const settings = await ThriftSettingsModel.findAll({
        order: [['setting_key', 'ASC']]
      });

      // Format as key-value object for easy frontend use
      const settingsObject = {};
      settings.forEach(setting => {
        settingsObject[setting.setting_key] = {
          value: setting.setting_value,
          description: setting.description,
          id: setting.id
        };
      });

      return res.status(200).json({
        success: true,
        data: settings,
        formatted: settingsObject,
        count: settings.length
      });

    } catch (error) {
      logger.error('Error fetching thrift settings:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch thrift settings',
        details: error.message
      });
    }
  }

  // ============================================
  // GET SPECIFIC GL ACCOUNTS FOR THRIFT
  // ============================================
  static async getThriftGLAccounts(req, res) {
    try {
      const ThriftSettingsModel = ThriftSettings(sequelizeInstance);
      
      const settings = await ThriftSettingsModel.findAll({
        where: {
          setting_key: {
            [Op.in]: ['thrift_cash_gl', 'thrift_income_gl']
          }
        }
      });

      const glAccounts = {
        cash_gl: null,
        income_gl: null,
        configured: false
      };

      settings.forEach(setting => {
        if (setting.setting_key === 'thrift_cash_gl') {
          glAccounts.cash_gl = {
            account: setting.setting_value,
            description: setting.description
          };
        } else if (setting.setting_key === 'thrift_income_gl') {
          glAccounts.income_gl = {
            account: setting.setting_value,
            description: setting.description
          };
        }
      });

      glAccounts.configured = !!(glAccounts.cash_gl && glAccounts.income_gl);

      return res.status(200).json({
        success: true,
        data: glAccounts
      });

    } catch (error) {
      logger.error('Error fetching thrift GL accounts:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch thrift GL accounts',
        details: error.message
      });
    }
  }

  // ============================================
  // GET SETTINGS FOR THRIFT ACCOUNT CREATION
  // ============================================
  static async getThriftAccountSettings(req, res) {
    try {
      const ThriftSettingsModel = ThriftSettings(sequelizeInstance);
      
      const requiredKeys = [
        'thrift_cash_gl',
        'thrift_income_gl',
        'thrift_default_collection_type',
        'thrift_min_opening_balance'
      ];

      const settings = await ThriftSettingsModel.findAll({
        where: {
          setting_key: {
            [Op.in]: requiredKeys
          }
        }
      });

      const settingsMap = {};
      settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
      });

      // Check if all required settings exist
      const missingKeys = requiredKeys.filter(key => !settingsMap[key]);

      return res.status(200).json({
        success: true,
        data: settingsMap,
        missing: missingKeys,
        configured: missingKeys.length === 0
      });

    } catch (error) {
      logger.error('Error fetching thrift account settings:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch thrift account settings',
        details: error.message
      });
    }
  }

  // ============================================
  // GET SETTING BY KEY
  // ============================================
  static async getSettingByKey(req, res) {
    try {
      const { key } = req.params;
      const ThriftSettingsModel = ThriftSettings(sequelizeInstance);

      const setting = await ThriftSettingsModel.findOne({
        where: { setting_key: key }
      });

      if (!setting) {
        return res.status(404).json({
          success: false,
          error: `Setting with key '${key}' not found`
        });
      }

      return res.status(200).json({
        success: true,
        data: setting
      });

    } catch (error) {
      logger.error('Error fetching thrift setting:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch thrift setting',
        details: error.message
      });
    }
  }

  // ============================================
  // CREATE OR UPDATE SETTING
  // ============================================
  static async createOrUpdateSetting(req, res) {
    try {
      const { key } = req.params;
      const { value, description } = req.body;
      const ThriftSettingsModel = ThriftSettings(sequelizeInstance);

      if (!key) {
        return res.status(400).json({
          success: false,
          error: 'Setting key is required'
        });
      }

      if (value === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Setting value is required'
        });
      }

      // Check if setting exists
      const [setting, created] = await ThriftSettingsModel.upsert({
        setting_key: key,
        setting_value: value,
        description: description || null
      });

      logger.info(`${created ? '✅ Created' : '✅ Updated'} thrift setting: ${key} = ${value}`);

      return res.status(200).json({
        success: true,
        message: created ? 'Setting created successfully' : 'Setting updated successfully',
        data: setting
      });

    } catch (error) {
      logger.error('Error saving thrift setting:', error);
      
      // Handle unique constraint error
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({
          success: false,
          error: 'Setting key already exists'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to save thrift setting',
        details: error.message
      });
    }
  }

  // ============================================
  // BATCH UPDATE MULTIPLE SETTINGS
  // ============================================
  static async batchUpdateSettings(req, res) {
    const transaction = await sequelizeInstance.transaction();
    
    try {
      const { settings } = req.body;
      const ThriftSettingsModel = ThriftSettings(sequelizeInstance);

      if (!settings || typeof settings !== 'object') {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: 'Settings object is required'
        });
      }

      const results = [];
      const errors = [];

      for (const [key, data] of Object.entries(settings)) {
        try {
          const [setting, created] = await ThriftSettingsModel.upsert({
            setting_key: key,
            setting_value: data.value || data,
            description: data.description || null
          }, { transaction });

          results.push({
            key,
            status: created ? 'created' : 'updated',
            value: setting.setting_value
          });
        } catch (settingError) {
          errors.push({
            key,
            error: settingError.message
          });
        }
      }

      if (errors.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: 'Some settings failed to save',
          results,
          errors
        });
      }

      await transaction.commit();

      logger.info(`✅ Batch updated ${results.length} thrift settings`);

      return res.status(200).json({
        success: true,
        message: `Successfully saved ${results.length} settings`,
        data: results
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error batch updating thrift settings:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to batch update thrift settings',
        details: error.message
      });
    }
  }

  // ============================================
  // DELETE SETTING
  // ============================================
  static async deleteSetting(req, res) {
    try {
      const { key } = req.params;
      const ThriftSettingsModel = ThriftSettings(sequelizeInstance);

      const deleted = await ThriftSettingsModel.destroy({
        where: { setting_key: key }
      });

      if (deleted === 0) {
        return res.status(404).json({
          success: false,
          error: `Setting with key '${key}' not found`
        });
      }

      logger.info(`🗑️ Deleted thrift setting: ${key}`);

      return res.status(200).json({
        success: true,
        message: `Setting '${key}' deleted successfully`
      });

    } catch (error) {
      logger.error('Error deleting thrift setting:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete thrift setting',
        details: error.message
      });
    }
  }

  // ============================================
  // INITIALIZE DEFAULT THRIFT SETTINGS
  // ============================================
  static async initializeDefaultSettings(req, res) {
    const transaction = await sequelizeInstance.transaction();
    
    try {
      const ThriftSettingsModel = ThriftSettings(sequelizeInstance);
      
      const defaultSettings = [
        {
          setting_key: 'thrift_cash_gl',
          setting_value: '0110120001',
          description: 'Cash GL account for thrift collections (Asset account)'
        },
        {
          setting_key: 'thrift_income_gl',
          setting_value: '4040010001',
          description: 'Income GL account for thrift service fees (Revenue account)'
        },
        {
          setting_key: 'thrift_default_collection_type',
          setting_value: 'DAILY',
          description: 'Default collection type for new thrift accounts (DAILY, WEEKLY, MONTHLY, QUARTERLY)'
        },
        {
          setting_key: 'thrift_min_opening_balance',
          setting_value: '1000',
          description: 'Minimum opening balance for thrift accounts'
        }
      ];

      const results = [];
      for (const setting of defaultSettings) {
        const [result, created] = await ThriftSettingsModel.upsert(setting, { transaction });
        results.push({
          key: result.setting_key,
          value: result.setting_value,
          status: created ? 'created' : 'already exists'
        });
      }

      await transaction.commit();

      logger.info(`✅ Initialized ${results.length} default thrift settings`);

      return res.status(200).json({
        success: true,
        message: 'Default thrift settings initialized successfully',
        data: results
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error initializing default thrift settings:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize default thrift settings',
        details: error.message
      });
    }
  }
}

export default ThriftSettingsController;