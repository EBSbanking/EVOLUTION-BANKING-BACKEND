// src/controllers/VaultConfigController.js
import Vault from '../models/Vault.js';
import mongoose from 'mongoose';

class VaultConfigController {
  /**
   * Enhanced configuration validation
   */
  static validateConfiguration(config) {
    const errors = [];

    // Personnel validation
    if (config.minAuthorizedPersons !== undefined) {
      if (!Number.isInteger(config.minAuthorizedPersons) || config.minAuthorizedPersons < 1 || config.minAuthorizedPersons > 10) {
        errors.push('MIN_AUTHORIZED_PERSONS must be an integer between 1 and 10');
      }
    }

    if (config.maxAuthorizedPersons !== undefined) {
      if (!Number.isInteger(config.maxAuthorizedPersons) || config.maxAuthorizedPersons < 1 || config.maxAuthorizedPersons > 20) {
        errors.push('MAX_AUTHORIZED_PERSONS must be an integer between 1 and 20');
      }
    }

    if (config.minAuthorizedPersons !== undefined && config.maxAuthorizedPersons !== undefined) {
      if (config.minAuthorizedPersons > config.maxAuthorizedPersons) {
        errors.push('MIN_AUTHORIZED_PERSONS cannot be greater than MAX_AUTHORIZED_PERSONS');
      }
    }

    // Transaction limits validation
    if (config.transactionLimits) {
      for (const [key, value] of Object.entries(config.transactionLimits)) {
        if (value !== undefined && value !== null) {
          const numValue = parseFloat(value);
          if (isNaN(numValue) || numValue < 0) {
            errors.push(`Transaction limit ${key} must be a non-negative number`);
          }
        }
      }
    }

    return errors;
  }

  /**
   * Set vault configuration with enhanced validation
   */
  static async setVaultConfiguration(req, res) {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const { id } = req.params;
      const configuration = req.body;

      // ✅ Check if user is authenticated
      if (!req.user) {
        await session.abortTransaction();
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Find vault
      const vault = await Vault.findOne({ 
        $or: [
          { _id: id },
          { VAULT_ID: parseInt(id) || 0 },
          { VAULT_CD: id }
        ]
      }).session(session);

      if (!vault) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Vault not found'
        });
      }

      // Check permissions
      if (!this.hasConfigurationPermission(req.user.role || req.user.primary_business_role, vault.VAULT_CATEGORY)) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to configure vault'
        });
      }

      // Validate configuration
      const validationErrors = this.validateConfiguration(configuration);
      if (validationErrors.length > 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          errors: validationErrors
        });
      }

      // Apply configuration updates
      this.applyConfigurationUpdates(vault, configuration, req.user.userId || req.user.id);

      await vault.save({ session });
      await session.commitTransaction();

      res.json({
        success: true,
        message: 'Vault configuration updated successfully',
        data: this.getConfigurationResponse(vault)
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Set vault configuration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update vault configuration',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * Get vault configuration
   */
  static async getVaultConfiguration(req, res) {
    try {
      const { id } = req.params;
      
      // ✅ Check authentication
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const vault = await Vault.findOne({
        $or: [
          { _id: id },
          { VAULT_ID: parseInt(id) || 0 },
          { VAULT_CD: id }
        ]
      }).select('MIN_AUTHORIZED_PERSONS MAX_AUTHORIZED_PERSONS REQUIRES_DUAL_CONTROL SECURITY_LEVEL TRANSACTION_LIMITS ROLE_ACCESS_MATRIX ESCALATION_HIERARCHY VAULT_CATEGORY VAULT_NM VAULT_CD VAULT_ID');
      
      if (!vault) {
        return res.status(404).json({
          success: false,
          message: 'Vault not found'
        });
      }

      res.json({
        success: true,
        data: this.getConfigurationResponse(vault)
      });

    } catch (error) {
      console.error('Get vault configuration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vault configuration',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Set configuration for multiple vaults by category
   */
  static async setConfigurationByCategory(req, res) {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const { category } = req.params;
      const configuration = req.body;

      // ✅ Check authentication
      if (!req.user) {
        await session.abortTransaction();
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Validate category
      const validCategories = ['MAIN_VAULT', 'BRANCH_VAULT', 'TEMPORARY_VAULT', 'CASH_VAULT', 'BULLION_VAULT', 'HIGH_SECURITY_VAULT'];
      if (!validCategories.includes(category)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Invalid vault category'
        });
      }

      // Validate configuration
      const validationErrors = this.validateConfiguration(configuration);
      if (validationErrors.length > 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          errors: validationErrors
        });
      }

      // Update all vaults of this category
      const updateData = {};
      const updateableFields = [
        'minAuthorizedPersons',
        'maxAuthorizedPersons', 
        'requiresDualControl',
        'securityLevel'
      ];

      updateableFields.forEach(field => {
        if (configuration[field] !== undefined) {
          const vaultField = field.toUpperCase();
          updateData[vaultField] = configuration[field];
        }
      });

      // Handle nested objects
      if (configuration.transactionLimits) {
        updateData.TRANSACTION_LIMITS = configuration.transactionLimits;
      }

      if (configuration.roleAccessMatrix) {
        updateData.ROLE_ACCESS_MATRIX = configuration.roleAccessMatrix;
      }

      if (configuration.escalationHierarchy) {
        updateData.ESCALATION_HIERARCHY = configuration.escalationHierarchy;
      }

      // ✅ Better user reference handling
      updateData.UPDATED_BY = req.user?.userId || req.user?.id || 'SYSTEM';
      updateData.LAST_ACTIVITY_DATE = new Date();

      const result = await Vault.updateMany(
        { VAULT_CATEGORY: category, IS_ACTIVE: true },
        { $set: updateData },
        { session }
      );

      await session.commitTransaction();

      res.json({
        success: true,
        message: `Configuration updated for ${result.modifiedCount} vaults in category ${category}`,
        data: {
          modifiedCount: result.modifiedCount,
          category,
          configuration: updateData
        }
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Set configuration by category error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update vault configurations',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * Get default configurations by vault category
   */
  static async getDefaultConfigurations(req, res) {
    try {
      // ✅ Check authentication
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      res.json({
        success: true,
        data: {
          defaultConfigurations: this.getDefaultConfigurations()
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch default configurations',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get configuration template for vault category
   */
  static async getConfigurationTemplate(req, res) {
    try {
      const { category } = req.params;
      
      // ✅ Check authentication
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const template = this.getDefaultConfigurations()[category];
      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Configuration template not found for this category'
        });
      }

      res.json({
        success: true,
        data: {
          category,
          template,
          description: this.getCategoryDescription(category)
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch configuration template',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Apply configuration updates to vault instance
   */
  static applyConfigurationUpdates(vault, config, updatedBy) {
    const updateableFields = [
      'minAuthorizedPersons',
      'maxAuthorizedPersons', 
      'requiresDualControl',
      'securityLevel'
    ];

    updateableFields.forEach(field => {
      if (config[field] !== undefined) {
        const vaultField = field.toUpperCase();
        vault[vaultField] = config[field];
      }
    });

    // Handle nested objects
    if (config.transactionLimits) {
      vault.TRANSACTION_LIMITS = { ...vault.TRANSACTION_LIMITS, ...config.transactionLimits };
    }

    if (config.roleAccessMatrix) {
      vault.ROLE_ACCESS_MATRIX = { ...vault.ROLE_ACCESS_MATRIX, ...config.roleAccessMatrix };
    }

    if (config.escalationHierarchy) {
      vault.ESCALATION_HIERARCHY = { ...vault.ESCALATION_HIERARCHY, ...config.escalationHierarchy };
    }

    vault.UPDATED_BY = updatedBy;
    vault.LAST_ACTIVITY_DATE = new Date();
  }

  /**
   * Get formatted configuration response
   */
  static getConfigurationResponse(vault) {
    return {
      vaultId: vault.VAULT_ID,
      vaultCode: vault.VAULT_CD,
      vaultName: vault.VAULT_NM,
      configuration: {
        minAuthorizedPersons: vault.MIN_AUTHORIZED_PERSONS,
        maxAuthorizedPersons: vault.MAX_AUTHORIZED_PERSONS,
        requiresDualControl: vault.REQUIRES_DUAL_CONTROL,
        securityLevel: vault.SECURITY_LEVEL,
        transactionLimits: vault.TRANSACTION_LIMITS,
        roleAccessMatrix: vault.ROLE_ACCESS_MATRIX,
        escalationHierarchy: vault.ESCALATION_HIERARCHY,
        vaultCategory: vault.VAULT_CATEGORY
      },
      utilization: {
        currentPersonnel: vault.activeAuthorizedCount || 0,
        utilizationPercentage: vault.utilizationPercentage || 0,
        availableCapacity: vault.availableCapacity || 0
      }
    };
  }

  /**
   * Check if user has permission to configure vault
   */
  static hasConfigurationPermission(userRole, vaultCategory) {
    const permissions = {
      VAULT_MANAGER: ['MAIN_VAULT', 'BRANCH_VAULT', 'TEMPORARY_VAULT', 'CASH_VAULT', 'BULLION_VAULT', 'HIGH_SECURITY_VAULT'],
      BRANCH_MANAGER: ['BRANCH_VAULT', 'TEMPORARY_VAULT', 'CASH_VAULT'],
      HEAD_TELLER: ['TEMPORARY_VAULT', 'CASH_VAULT'],
      // ✅ Support for new role names from your auth system
      ADMIN: ['MAIN_VAULT', 'BRANCH_VAULT', 'TEMPORARY_VAULT', 'CASH_VAULT', 'BULLION_VAULT', 'HIGH_SECURITY_VAULT'],
      TELLER_SUPERVISOR: ['TEMPORARY_VAULT', 'CASH_VAULT'],
      // Additional roles for compatibility
      'Vault Manager': ['MAIN_VAULT', 'BRANCH_VAULT', 'TEMPORARY_VAULT', 'CASH_VAULT', 'BULLION_VAULT', 'HIGH_SECURITY_VAULT'],
      'Branch Manager': ['BRANCH_VAULT', 'TEMPORARY_VAULT', 'CASH_VAULT'],
      'Head Teller': ['TEMPORARY_VAULT', 'CASH_VAULT']
    };

    return permissions[userRole]?.includes(vaultCategory) || false;
  }

  /**
   * Get category description
   */
  static getCategoryDescription(category) {
    const descriptions = {
      MAIN_VAULT: 'Primary vault for high-value storage with maximum security',
      BRANCH_VAULT: 'Standard branch vault for daily operations',
      TEMPORARY_VAULT: 'Temporary storage with reduced security requirements',
      CASH_VAULT: 'Specialized vault for cash storage and processing',
      BULLION_VAULT: 'High-security vault for precious metals and bullion',
      HIGH_SECURITY_VAULT: 'Maximum security vault for critical assets'
    };
    
    return descriptions[category] || 'Standard vault configuration';
  }

  /**
   * Get default configurations
   */
  static getDefaultConfigurations() {
    return {
      MAIN_VAULT: {
        minAuthorizedPersons: 3,
        maxAuthorizedPersons: 6,
        requiresDualControl: true,
        securityLevel: 'LEVEL_4',
        transactionLimits: {
          max_single_deposit: 10000000,
          max_single_withdrawal: 5000000,
          daily_deposit_limit: 50000000,
          daily_withdrawal_limit: 25000000,
          require_approval_amount: 1000000
        }
      },
      BRANCH_VAULT: {
        minAuthorizedPersons: 2,
        maxAuthorizedPersons: 4,
        requiresDualControl: true,
        securityLevel: 'LEVEL_3',
        transactionLimits: {
          max_single_deposit: 5000000,
          max_single_withdrawal: 2500000,
          daily_deposit_limit: 25000000,
          daily_withdrawal_limit: 15000000,
          require_approval_amount: 500000
        }
      },
      TEMPORARY_VAULT: {
        minAuthorizedPersons: 1,
        maxAuthorizedPersons: 2,
        requiresDualControl: false,
        securityLevel: 'LEVEL_2',
        transactionLimits: {
          max_single_deposit: 1000000,
          max_single_withdrawal: 500000,
          daily_deposit_limit: 5000000,
          daily_withdrawal_limit: 2500000,
          require_approval_amount: 250000
        }
      },
      CASH_VAULT: {
        minAuthorizedPersons: 2,
        maxAuthorizedPersons: 5,
        requiresDualControl: true,
        securityLevel: 'LEVEL_3',
        transactionLimits: {
          max_single_deposit: 8000000,
          max_single_withdrawal: 4000000,
          daily_deposit_limit: 40000000,
          daily_withdrawal_limit: 20000000,
          require_approval_amount: 750000
        }
      },
      BULLION_VAULT: {
        minAuthorizedPersons: 3,
        maxAuthorizedPersons: 5,
        requiresDualControl: true,
        securityLevel: 'LEVEL_4',
        transactionLimits: {
          max_single_deposit: 20000000,
          max_single_withdrawal: 10000000,
          daily_deposit_limit: 100000000,
          daily_withdrawal_limit: 50000000,
          require_approval_amount: 2000000
        }
      },
      HIGH_SECURITY_VAULT: {
        minAuthorizedPersons: 3,
        maxAuthorizedPersons: 6,
        requiresDualControl: true,
        securityLevel: 'LEVEL_4',
        transactionLimits: {
          max_single_deposit: 15000000,
          max_single_withdrawal: 7500000,
          daily_deposit_limit: 75000000,
          daily_withdrawal_limit: 40000000,
          require_approval_amount: 1500000
        }
      }
    };
  }

  /**
   * Auto-configure vault based on category
   */
  static async autoConfigureVault(vaultId, category) {
    try {
      const defaultConfigs = this.getDefaultConfigurations();
      const config = defaultConfigs[category] || defaultConfigs.BRANCH_VAULT;

      await Vault.findOneAndUpdate(
        { VAULT_ID: vaultId },
        {
          MIN_AUTHORIZED_PERSONS: config.minAuthorizedPersons,
          MAX_AUTHORIZED_PERSONS: config.maxAuthorizedPersons,
          REQUIRES_DUAL_CONTROL: config.requiresDualControl,
          SECURITY_LEVEL: config.securityLevel,
          TRANSACTION_LIMITS: config.transactionLimits,
          UPDATED_BY: 'SYSTEM_AUTO_CONFIG'
        }
      );

      return config;
    } catch (error) {
      console.error('Auto-configuration failed:', error);
      throw error;
    }
  }

  /**
   * Reset vault configuration to defaults
   */
  static async resetVaultConfiguration(req, res) {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const { id } = req.params;

      // ✅ Check authentication
      if (!req.user) {
        await session.abortTransaction();
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Find vault
      const vault = await Vault.findOne({ 
        $or: [
          { _id: id },
          { VAULT_ID: parseInt(id) || 0 },
          { VAULT_CD: id }
        ]
      }).session(session);

      if (!vault) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Vault not found'
        });
      }

      // Check permissions
      if (!this.hasConfigurationPermission(req.user.role || req.user.primary_business_role, vault.VAULT_CATEGORY)) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to reset vault configuration'
        });
      }

      // Get default configuration for this category
      const defaultConfigs = this.getDefaultConfigurations();
      const defaultConfig = defaultConfigs[vault.VAULT_CATEGORY] || defaultConfigs.BRANCH_VAULT;

      // Reset to defaults
      vault.MIN_AUTHORIZED_PERSONS = defaultConfig.minAuthorizedPersons;
      vault.MAX_AUTHORIZED_PERSONS = defaultConfig.maxAuthorizedPersons;
      vault.REQUIRES_DUAL_CONTROL = defaultConfig.requiresDualControl;
      vault.SECURITY_LEVEL = defaultConfig.securityLevel;
      vault.TRANSACTION_LIMITS = defaultConfig.transactionLimits;
      vault.UPDATED_BY = req.user.userId || req.user.id;
      vault.LAST_ACTIVITY_DATE = new Date();

      await vault.save({ session });
      await session.commitTransaction();

      res.json({
        success: true,
        message: 'Vault configuration reset to defaults successfully',
        data: this.getConfigurationResponse(vault)
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Reset vault configuration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset vault configuration',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * Get vault configuration statistics
   */
  static async getConfigurationStatistics(req, res) {
    try {
      // ✅ Check authentication
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const stats = await Vault.aggregate([
        {
          $group: {
            _id: '$VAULT_CATEGORY',
            count: { $sum: 1 },
            avgMinPersons: { $avg: '$MIN_AUTHORIZED_PERSONS' },
            avgMaxPersons: { $avg: '$MAX_AUTHORIZED_PERSONS' },
            dualControlCount: {
              $sum: { $cond: ['$REQUIRES_DUAL_CONTROL', 1, 0] }
            }
          }
        },
        {
          $project: {
            category: '$_id',
            count: 1,
            avgMinPersons: { $round: ['$avgMinPersons', 2] },
            avgMaxPersons: { $round: ['$avgMaxPersons', 2] },
            dualControlPercentage: {
              $round: [{ $multiply: [{ $divide: ['$dualControlCount', '$count'] }, 100] }, 2]
            }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          statistics: stats,
          totalVaults: stats.reduce((sum, stat) => sum + stat.count, 0),
          categories: stats.length
        }
      });

    } catch (error) {
      console.error('Get configuration statistics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch configuration statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
}

export default VaultConfigController;