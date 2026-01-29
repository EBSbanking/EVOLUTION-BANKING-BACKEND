// controllers/vaultConfigController.js
import Vault from '../models/Vault.js';

/**
 * Enhanced Vault Configuration Controller
 * Works with both MongoDB and provides fallbacks
 */

// Helper function to find vault by ID
const findVault = async (identifier) => {
  return await Vault.findOne({
    $or: [
      { _id: identifier },
      { VAULT_ID: parseInt(identifier) || 0 },
      { VAULT_CD: identifier }
    ]
  });
};

// Default configurations by category
const DEFAULT_CONFIGS = {
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
  }
};

/**
 * Get vault configuration
 */
export const getVaultConfiguration = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const vault = await findVault(id);
    
    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Return vault configuration
    const config = {
      vaultId: vault.VAULT_ID || vault._id,
      vaultCode: vault.VAULT_CD || 'N/A',
      vaultName: vault.VAULT_NM || 'N/A',
      configuration: {
        minAuthorizedPersons: vault.MIN_AUTHORIZED_PERSONS || DEFAULT_CONFIGS.BRANCH_VAULT.minAuthorizedPersons,
        maxAuthorizedPersons: vault.MAX_AUTHORIZED_PERSONS || DEFAULT_CONFIGS.BRANCH_VAULT.maxAuthorizedPersons,
        requiresDualControl: vault.REQUIRES_DUAL_CONTROL !== undefined ? vault.REQUIRES_DUAL_CONTROL : DEFAULT_CONFIGS.BRANCH_VAULT.requiresDualControl,
        securityLevel: vault.SECURITY_LEVEL || DEFAULT_CONFIGS.BRANCH_VAULT.securityLevel,
        transactionLimits: vault.TRANSACTION_LIMITS || DEFAULT_CONFIGS.BRANCH_VAULT.transactionLimits,
        vaultCategory: vault.VAULT_CATEGORY || 'BRANCH_VAULT'
      }
    };

    res.json({
      success: true,
      message: 'Vault configuration retrieved successfully',
      data: config
    });

  } catch (error) {
    console.error('Get vault configuration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get vault configuration',
      error: error.message
    });
  }
};

/**
 * Set vault configuration
 */
export const setVaultConfiguration = async (req, res) => {
  try {
    const { id } = req.params;
    const config = req.body;

    // Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const vault = await findVault(id);
    
    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Update configuration
    if (config.minAuthorizedPersons !== undefined) {
      vault.MIN_AUTHORIZED_PERSONS = config.minAuthorizedPersons;
    }
    if (config.maxAuthorizedPersons !== undefined) {
      vault.MAX_AUTHORIZED_PERSONS = config.maxAuthorizedPersons;
    }
    if (config.requiresDualControl !== undefined) {
      vault.REQUIRES_DUAL_CONTROL = config.requiresDualControl;
    }
    if (config.securityLevel !== undefined) {
      vault.SECURITY_LEVEL = config.securityLevel;
    }
    if (config.transactionLimits !== undefined) {
      vault.TRANSACTION_LIMITS = config.transactionLimits;
    }

    vault.UPDATED_BY = req.user.userId || req.user.id || 'SYSTEM';
    vault.LAST_ACTIVITY_DATE = new Date();

    await vault.save();

    res.json({
      success: true,
      message: 'Vault configuration updated successfully',
      data: {
        vaultId: vault.VAULT_ID || vault._id,
        vaultCode: vault.VAULT_CD,
        vaultName: vault.VAULT_NM,
        updatedFields: config
      }
    });

  } catch (error) {
    console.error('Set vault configuration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set vault configuration',
      error: error.message
    });
  }
};

/**
 * Get configuration template for a category
 */
export const getConfigurationTemplate = async (req, res) => {
  try {
    const { category } = req.params;
    
    // Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const template = DEFAULT_CONFIGS[category] || DEFAULT_CONFIGS.BRANCH_VAULT;
    
    const descriptions = {
      MAIN_VAULT: 'Primary vault for high-value storage with maximum security',
      BRANCH_VAULT: 'Standard branch vault for daily operations',
      TEMPORARY_VAULT: 'Temporary storage with reduced security requirements',
      CASH_VAULT: 'Specialized vault for cash storage and processing',
      BULLION_VAULT: 'High-security vault for precious metals and bullion',
      HIGH_SECURITY_VAULT: 'Maximum security vault for critical assets'
    };

    res.json({
      success: true,
      message: 'Configuration template retrieved',
      data: {
        category,
        template,
        description: descriptions[category] || 'Standard vault configuration',
        recommendedFor: getRecommendedUsage(category)
      }
    });

  } catch (error) {
    console.error('Get configuration template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get configuration template',
      error: error.message
    });
  }
};

/**
 * Set configuration for all vaults in a category
 */
export const setConfigurationByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const config = req.body;

    // Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Validate category
    const validCategories = ['MAIN_VAULT', 'BRANCH_VAULT', 'TEMPORARY_VAULT', 'CASH_VAULT', 'BULLION_VAULT', 'HIGH_SECURITY_VAULT'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vault category'
      });
    }

    // Build update object
    const updateData = {};
    if (config.minAuthorizedPersons !== undefined) updateData.MIN_AUTHORIZED_PERSONS = config.minAuthorizedPersons;
    if (config.maxAuthorizedPersons !== undefined) updateData.MAX_AUTHORIZED_PERSONS = config.maxAuthorizedPersons;
    if (config.requiresDualControl !== undefined) updateData.REQUIRES_DUAL_CONTROL = config.requiresDualControl;
    if (config.securityLevel !== undefined) updateData.SECURITY_LEVEL = config.securityLevel;
    if (config.transactionLimits !== undefined) updateData.TRANSACTION_LIMITS = config.transactionLimits;
    
    updateData.UPDATED_BY = req.user.userId || req.user.id || 'SYSTEM';
    updateData.LAST_ACTIVITY_DATE = new Date();

    // Update vaults
    const result = await Vault.updateMany(
      { VAULT_CATEGORY: category, IS_ACTIVE: true },
      { $set: updateData }
    );

    res.json({
      success: true,
      message: `Configuration updated for ${result.modifiedCount} vaults in category ${category}`,
      data: {
        modifiedCount: result.modifiedCount,
        category,
        updatedFields: config
      }
    });

  } catch (error) {
    console.error('Set configuration by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set configuration by category',
      error: error.message
    });
  }
};

/**
 * Get all default configurations
 */
export const getDefaultConfigurations = async (req, res) => {
  try {
    // Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    res.json({
      success: true,
      message: 'Default configurations retrieved',
      data: {
        defaultConfigurations: DEFAULT_CONFIGS,
        categories: Object.keys(DEFAULT_CONFIGS),
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Get default configurations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get default configurations',
      error: error.message
    });
  }
};

/**
 * Reset vault configuration to defaults
 */
export const resetVaultConfiguration = async (req, res) => {
  try {
    const { id } = req.params;

    // Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const vault = await findVault(id);
    
    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Get default config for this category
    const defaultConfig = DEFAULT_CONFIGS[vault.VAULT_CATEGORY] || DEFAULT_CONFIGS.BRANCH_VAULT;

    // Reset to defaults
    vault.MIN_AUTHORIZED_PERSONS = defaultConfig.minAuthorizedPersons;
    vault.MAX_AUTHORIZED_PERSONS = defaultConfig.maxAuthorizedPersons;
    vault.REQUIRES_DUAL_CONTROL = defaultConfig.requiresDualControl;
    vault.SECURITY_LEVEL = defaultConfig.securityLevel;
    vault.TRANSACTION_LIMITS = defaultConfig.transactionLimits;
    vault.UPDATED_BY = req.user.userId || req.user.id || 'SYSTEM';
    vault.LAST_ACTIVITY_DATE = new Date();

    await vault.save();

    res.json({
      success: true,
      message: 'Vault configuration reset to defaults successfully',
      data: {
        vaultId: vault.VAULT_ID || vault._id,
        vaultCode: vault.VAULT_CD,
        vaultName: vault.VAULT_NM,
        appliedDefaults: defaultConfig
      }
    });

  } catch (error) {
    console.error('Reset vault configuration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset vault configuration',
      error: error.message
    });
  }
};

/**
 * Get vault configuration statistics
 */
export const getConfigurationStatistics = async (req, res) => {
  try {
    // Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Basic statistics
    const totalVaults = await Vault.countDocuments({ IS_ACTIVE: true });
    const byCategory = await Vault.aggregate([
      { $match: { IS_ACTIVE: true } },
      {
        $group: {
          _id: '$VAULT_CATEGORY',
          count: { $sum: 1 },
          avgMinPersons: { $avg: '$MIN_AUTHORIZED_PERSONS' },
          avgMaxPersons: { $avg: '$MAX_AUTHORIZED_PERSONS' }
        }
      }
    ]);

    res.json({
      success: true,
      message: 'Configuration statistics retrieved',
      data: {
        totalVaults,
        byCategory,
        summary: {
          categories: byCategory.length,
          totalDualControl: await Vault.countDocuments({ REQUIRES_DUAL_CONTROL: true, IS_ACTIVE: true }),
          averageMinPersons: byCategory.reduce((sum, cat) => sum + (cat.avgMinPersons || 0), 0) / byCategory.length,
          averageMaxPersons: byCategory.reduce((sum, cat) => sum + (cat.avgMaxPersons || 0), 0) / byCategory.length
        }
      }
    });

  } catch (error) {
    console.error('Get configuration statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get configuration statistics',
      error: error.message
    });
  }
};

// Helper function
function getRecommendedUsage(category) {
  const usage = {
    MAIN_VAULT: 'Head offices, regional centers',
    BRANCH_VAULT: 'Daily branch operations',
    TEMPORARY_VAULT: 'Temporary storage, backup',
    CASH_VAULT: 'Cash handling areas',
    BULLION_VAULT: 'Precious metal storage',
    HIGH_SECURITY_VAULT: 'Critical documents, high-value items'
  };
  return usage[category] || 'General purpose storage';
}

// Export as default object for compatibility
export default {
  getVaultConfiguration,
  setVaultConfiguration,
  getConfigurationTemplate,
  setConfigurationByCategory,
  getDefaultConfigurations,
  resetVaultConfiguration,
  getConfigurationStatistics
};