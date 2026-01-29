// src/controllers/ConfigurationController.js
import configurationService from '../Services/ConfigurationService.js';

export const getConfigurations = async (req, res) => {
  try {
    const { category, key } = req.query;
    
    if (key) {
      const value = await configurationService.get(key);
      return res.status(200).json({
        success: true,
        data: { [key]: value }
      });
    }
    
    const configs = await configurationService.getAll(category);
    return res.status(200).json({
      success: true,
      data: configs
    });
    
  } catch (error) {
    console.error('Error getting configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving configurations',
      error: error.message
    });
  }
};

export const getConfiguration = async (req, res) => {
  try {
    const { key } = req.params;
    const config = await configurationService.getConfig(key);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Configuration not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: config
    });
    
  } catch (error) {
    console.error('Error getting configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving configuration',
      error: error.message
    });
  }
};

export const updateConfiguration = async (req, res) => {
  try {
    const { key, value, type, category, description } = req.body;
    const user = req.user; // Assuming user is attached to request
    
    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Configuration key is required'
      });
    }
    
    const config = await configurationService.set(key, value, {
      type,
      category,
      description,
      updated_by: user?.id
    });
    
    // Clear cache for this key
    await configurationService.clearCache(key);
    
    res.status(200).json({
      success: true,
      message: 'Configuration updated successfully',
      data: config
    });
    
  } catch (error) {
    console.error('Error updating configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating configuration',
      error: error.message
    });
  }
};

export const getLoginSettings = async (req, res) => {
  try {
    const loginHours = await configurationService.getLoginHours();
    const allowAdminOverride = await configurationService.get('login.allow_admin_override', true);
    const overrideRoles = await configurationService.get('login.override_roles', ['Administrator', 'SuperAdmin']);
    
    res.status(200).json({
      success: true,
      data: {
        login_hours: loginHours,
        allow_admin_override: allowAdminOverride,
        override_roles: overrideRoles
      }
    });
    
  } catch (error) {
    console.error('Error getting login settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving login settings',
      error: error.message
    });
  }
};

export const updateLoginSettings = async (req, res) => {
  try {
    const { 
      enable_hours_restriction, 
      default_earliest_time, 
      default_latest_time,
      allow_admin_override,
      override_roles 
    } = req.body;
    
    console.log('🔧 Updating login settings. User:', req.user);
    
    // Get user ID from req.user
    const userId = req.user?.id || req.user?.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User information not available'
      });
    }
    
    const updates = [];
    
    if (enable_hours_restriction !== undefined) {
      updates.push(
        configurationService.set('login.enable_hours_restriction', enable_hours_restriction, {
          type: 'boolean',
          category: 'security',
          updated_by: userId
        })
      );
    }
    
    if (default_earliest_time) {
      updates.push(
        configurationService.set('login.default_earliest_time', default_earliest_time, {
          type: 'time',
          category: 'security',
          updated_by: userId
        })
      );
    }
    
    if (default_latest_time) {
      updates.push(
        configurationService.set('login.default_latest_time', default_latest_time, {
          type: 'time',
          category: 'security',
          updated_by: userId
        })
      );
    }
    
    if (allow_admin_override !== undefined) {
      updates.push(
        configurationService.set('login.allow_admin_override', allow_admin_override, {
          type: 'boolean',
          category: 'security',
          updated_by: userId
        })
      );
    }
    
    if (override_roles) {
      updates.push(
        configurationService.set('login.override_roles', JSON.stringify(override_roles), {
          type: 'json',
          category: 'security',
          updated_by: userId
        })
      );
    }
    
    await Promise.all(updates);
    
    // Clear cache
    await configurationService.clearCache();
    
    res.status(200).json({
      success: true,
      message: 'Login settings updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating login settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating login settings',
      error: error.message
    });
  }
};

export const getCategories = async (req, res) => {
  try {
    const categories = await configurationService.getCategories();
    
    res.status(200).json({
      success: true,
      data: categories
    });
    
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving categories',
      error: error.message
    });
  }
};