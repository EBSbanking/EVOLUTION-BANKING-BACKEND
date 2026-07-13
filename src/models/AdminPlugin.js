// src/models/AdminPlugin.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class AdminPlugin extends Model {
  /**
   * Get plugin status label
   */
  getStatusLabel() {
    const labels = {
      'active': 'Active',
      'stopped': 'Stopped',
      'error': 'Error',
      'deleted': 'Deleted'
    };
    return labels[this.status] || this.status;
  }

  /**
   * Check if plugin is running
   */
  isRunning() {
    return this.status === 'active';
  }

  /**
   * Check if plugin is installed (not deleted)
   */
  isInstalled() {
    return this.status !== 'deleted';
  }

  /**
   * Check if plugin can be started
   */
  canStart() {
    return this.status === 'stopped' || this.status === 'error';
  }

  /**
   * Check if plugin can be stopped
   */
  canStop() {
    return this.status === 'active';
  }

  /**
   * Check if plugin can be deleted
   */
  canDelete() {
    return this.status !== 'deleted';
  }

  /**
   * Get plugin summary
   */
  getSummary() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      description: this.description,
      status: this.status,
      statusLabel: this.getStatusLabel(),
      isRunning: this.isRunning(),
      isInstalled: this.isInstalled(),
      canStart: this.canStart(),
      canStop: this.canStop(),
      canDelete: this.canDelete(),
      autoStart: this.auto_start === 1 || this.auto_start === true,
      filePath: this.file_path,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  /**
   * Start the plugin (instance method)
   */
  async start() {
    this.status = 'active';
    this.updated_at = new Date();
    await this.save();
    return this;
  }

  /**
   * Stop the plugin (instance method)
   */
  async stop() {
    this.status = 'stopped';
    this.updated_at = new Date();
    await this.save();
    return this;
  }

  /**
   * Soft delete the plugin (instance method)
   */
  async softDelete() {
    this.status = 'deleted';
    this.updated_at = new Date();
    await this.save();
    return this;
  }

  /**
   * Mark plugin as error (instance method)
   */
  async markError() {
    this.status = 'error';
    this.updated_at = new Date();
    await this.save();
    return this;
  }

  /**
   * Toggle auto-start (instance method)
   */
  async toggleAutoStart() {
    this.auto_start = !this.auto_start;
    this.updated_at = new Date();
    await this.save();
    return this.auto_start;
  }
}

AdminPlugin.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'name'
    },
    version: {
      type: DataTypes.STRING(50),
      defaultValue: '1.0.0',
      field: 'version'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'description'
    },
    status: {
      type: DataTypes.ENUM('active', 'stopped', 'error', 'deleted'),
      defaultValue: 'stopped',
      field: 'status'
    },
    file_path: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'file_path'
    },
    auto_start: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'auto_start'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  },
  {
    sequelize,
    modelName: 'AdminPlugin',
    tableName: 'admin_plugins',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    indexes: [
      {
        name: 'idx_status',
        fields: ['status']
      },
      {
        name: 'idx_name',
        fields: ['name']
      },
      {
        name: 'idx_auto_start',
        fields: ['auto_start']
      }
    ],
    hooks: {
      beforeCreate: (plugin) => {
        if (!plugin.version) {
          plugin.version = '1.0.0';
        }
        if (!plugin.status) {
          plugin.status = 'stopped';
        }
        if (plugin.auto_start === undefined || plugin.auto_start === null) {
          plugin.auto_start = false;
        }
        if (!plugin.created_at) {
          plugin.created_at = new Date();
        }
        if (!plugin.updated_at) {
          plugin.updated_at = new Date();
        }
      },
      beforeUpdate: (plugin) => {
        plugin.updated_at = new Date();
      }
    }
  }
);

// =============================================
// STATIC METHODS
// =============================================

/**
 * Get all active plugins
 */
AdminPlugin.getActivePlugins = async function() {
  return await this.findAll({
    where: { status: 'active' },
    order: [['name', 'ASC']]
  });
};

/**
 * Get all stopped plugins
 */
AdminPlugin.getStoppedPlugins = async function() {
  return await this.findAll({
    where: { status: 'stopped' },
    order: [['name', 'ASC']]
  });
};

/**
 * Get all plugins with errors
 */
AdminPlugin.getErrorPlugins = async function() {
  return await this.findAll({
    where: { status: 'error' },
    order: [['name', 'ASC']]
  });
};

/**
 * Get all plugins (excluding deleted)
 */
AdminPlugin.getAllActive = async function() {
  return await this.findAll({
    where: { status: { [Op.ne]: 'deleted' } },
    order: [['name', 'ASC']]
  });
};

/**
 * Get plugin by name
 */
AdminPlugin.getByName = async function(name) {
  return await this.findOne({
    where: { 
      name: name, 
      status: { [Op.ne]: 'deleted' } 
    }
  });
};

/**
 * Get all plugins that should auto-start
 */
AdminPlugin.getAutoStartPlugins = async function() {
  return await this.findAll({
    where: { 
      auto_start: true,
      status: { [Op.ne]: 'deleted' }
    },
    order: [['name', 'ASC']]
  });
};

/**
 * Count plugins by status
 */
AdminPlugin.countByStatus = async function() {
  const counts = await this.findAll({
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    where: {
      status: { [Op.ne]: 'deleted' }
    },
    group: ['status']
  });
  
  const result = { active: 0, stopped: 0, error: 0, total: 0 };
  counts.forEach(item => {
    const count = parseInt(item.get('count')) || 0;
    result[item.status] = count;
    result.total += count;
  });
  return result;
};

/**
 * Get plugin statistics (comprehensive)
 */
AdminPlugin.getStats = async function() {
  const total = await this.count({ 
    where: { status: { [Op.ne]: 'deleted' } } 
  });
  const active = await this.count({ 
    where: { status: 'active' } 
  });
  const stopped = await this.count({ 
    where: { status: 'stopped' } 
  });
  const error = await this.count({ 
    where: { status: 'error' } 
  });
  const autoStart = await this.count({ 
    where: { 
      auto_start: true, 
      status: { [Op.ne]: 'deleted' } 
    } 
  });
  
  return {
    total,
    active,
    stopped,
    error,
    autoStart,
    successRate: total > 0 ? ((active / total) * 100).toFixed(1) : 0
  };
};

/**
 * Mark plugin as deleted
 */
AdminPlugin.softDelete = async function(pluginId) {
  const plugin = await this.findByPk(pluginId);
  if (!plugin) {
    throw new Error(`Plugin with ID ${pluginId} not found`);
  }
  plugin.status = 'deleted';
  plugin.updated_at = new Date();
  await plugin.save();
  return plugin;
};

/**
 * Update plugin status
 */
AdminPlugin.updateStatus = async function(pluginId, status) {
  const plugin = await this.findByPk(pluginId);
  if (!plugin) {
    throw new Error(`Plugin with ID ${pluginId} not found`);
  }
  if (!['active', 'stopped', 'error', 'deleted'].includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  plugin.status = status;
  plugin.updated_at = new Date();
  await plugin.save();
  return plugin;
};

/**
 * Find or create plugin
 */
AdminPlugin.findOrCreatePlugin = async function(pluginData) {
  const [plugin, created] = await this.findOrCreate({
    where: { name: pluginData.name },
    defaults: {
      ...pluginData,
      status: 'stopped',
      auto_start: false
    }
  });
  return { plugin, created };
};

/**
 * Bulk update plugin statuses
 */
AdminPlugin.bulkUpdateStatus = async function(pluginIds, status) {
  const [updatedCount] = await this.update(
    { status, updated_at: new Date() },
    { 
      where: { 
        id: { [Op.in]: pluginIds },
        status: { [Op.ne]: 'deleted' }
      } 
    }
  );
  return updatedCount;
};

// =============================================
// INSTANCE METHODS (already defined above)
// =============================================

export default AdminPlugin;