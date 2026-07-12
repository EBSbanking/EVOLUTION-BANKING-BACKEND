// src/models/VaultAccessAttempt.js - Class-based with updated_at
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class VaultAccessAttempt extends Model {
  // ==================== STATIC METHODS ====================
  
  /**
   * Get access attempts by vault ID
   */
  static async findByVaultId(vaultId, options = {}) {
    const defaultOptions = {
      where: { vault_id: vaultId },
      order: [['created_at', 'DESC']],
      limit: options.limit || 50
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  /**
   * Get access attempts by user ID
   */
  static async findByUserId(userId, options = {}) {
    const defaultOptions = {
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit: options.limit || 50
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  /**
   * Get failed access attempts
   */
  static async getFailedAttempts(vaultId, options = {}) {
    const defaultOptions = {
      where: { 
        vault_id: vaultId,
        status: 'FAILED'
      },
      order: [['created_at', 'DESC']],
      limit: options.limit || 100
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  /**
   * Get blocked access attempts
   */
  static async getBlockedAttempts(vaultId, options = {}) {
    const defaultOptions = {
      where: { 
        vault_id: vaultId,
        status: 'BLOCKED'
      },
      order: [['created_at', 'DESC']],
      limit: options.limit || 100
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  /**
   * Get recent access attempts
   */
  static async getRecentAttempts(vaultId, hours = 24) {
    const since = new Date();
    since.setHours(since.getHours() - hours);
    
    return this.findAll({
      where: {
        vault_id: vaultId,
        created_at: { [Op.gte]: since }
      },
      order: [['created_at', 'DESC']]
    });
  }

  /**
   * Get access attempt statistics
   */
  static async getStatistics(vaultId) {
    const total = await this.count({ where: { vault_id: vaultId } });
    const successful = await this.count({ 
      where: { vault_id: vaultId, status: 'SUCCESS' } 
    });
    const failed = await this.count({ 
      where: { vault_id: vaultId, status: 'FAILED' } 
    });
    const blocked = await this.count({ 
      where: { vault_id: vaultId, status: 'BLOCKED' } 
    });

    return {
      total,
      successful,
      failed,
      blocked,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(2) + '%' : '0%',
      failureRate: total > 0 ? ((failed / total) * 100).toFixed(2) + '%' : '0%'
    };
  }

  // ==================== INSTANCE METHODS ====================
  
  /**
   * Check if attempt was successful
   */
  get isSuccessful() {
    return this.status === 'SUCCESS';
  }

  /**
   * Check if attempt failed
   */
  get isFailed() {
    return this.status === 'FAILED';
  }

  /**
   * Check if attempt was blocked
   */
  get isBlocked() {
    return this.status === 'BLOCKED';
  }

  /**
   * Get formatted timestamp
   */
  get formattedCreatedAt() {
    return new Date(this.created_at).toLocaleString('en-NG', {
      timeZone: 'Africa/Lagos',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * Get formatted updated timestamp
   */
  get formattedUpdatedAt() {
    if (!this.updated_at) return 'N/A';
    return new Date(this.updated_at).toLocaleString('en-NG', {
      timeZone: 'Africa/Lagos',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * Get attempt age in minutes
   */
  get ageInMinutes() {
    const now = new Date();
    const attemptTime = new Date(this.created_at);
    return Math.floor((now - attemptTime) / (1000 * 60));
  }

  /**
   * Get attempt age in hours
   */
  get ageInHours() {
    return Math.floor(this.ageInMinutes / 60);
  }
}

// ==================== MODEL INITIALIZATION ====================

VaultAccessAttempt.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  vault_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'vaults',
      key: 'id'
    },
    validate: {
      notNull: {
        msg: 'vault_id is required'
      },
      isInt: {
        msg: 'vault_id must be an integer'
      }
    }
  },
  user_id: {
    type: DataTypes.STRING(24),
    allowNull: false,
    validate: {
      notNull: {
        msg: 'user_id is required'
      },
      len: {
        args: [1, 24],
        msg: 'user_id must be between 1 and 24 characters'
      }
    }
  },
  attempt_type: {
    type: DataTypes.ENUM('ACCESS', 'AUTHENTICATION', 'TRANSACTION'),
    allowNull: false,
    validate: {
      isIn: {
        args: [['ACCESS', 'AUTHENTICATION', 'TRANSACTION']],
        msg: 'Invalid attempt_type. Must be ACCESS, AUTHENTICATION, or TRANSACTION'
      }
    }
  },
  status: {
    type: DataTypes.ENUM('SUCCESS', 'FAILED', 'BLOCKED'),
    allowNull: false,
    validate: {
      isIn: {
        args: [['SUCCESS', 'FAILED', 'BLOCKED']],
        msg: 'Invalid status. Must be SUCCESS, FAILED, or BLOCKED'
      }
    }
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
    validate: {
      isIP: {
        msg: 'Invalid IP address format'
      }
    }
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // ✅ TIMESTAMPS with explicit definitions
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'VaultAccessAttempt',
  tableName: 'vault_access_attempts',
  timestamps: true,
  underscored: false,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  
  // ==================== HOOKS ====================
  hooks: {
    beforeCreate: (attempt) => {
      // Ensure timestamps are set
      if (!attempt.created_at) attempt.created_at = new Date();
      if (!attempt.updated_at) attempt.updated_at = new Date();
      
      // Log access attempt (can be extended for audit)
      console.log(`🔐 Access attempt: ${attempt.attempt_type} - ${attempt.status} by ${attempt.user_id}`);
    },
    
    beforeUpdate: (attempt) => {
      // Always update updated_at on changes
      attempt.updated_at = new Date();
    },
    
    afterCreate: (attempt) => {
      // If blocked, log additional security action
      if (attempt.status === 'BLOCKED') {
        console.warn(`🚫 Access blocked: ${attempt.user_id} attempted ${attempt.attempt_type} on vault ${attempt.vault_id}`);
      }
    }
  },
  
  // ==================== INDEXES ====================
  indexes: [
    { fields: ['vault_id'] },
    { fields: ['user_id'] },
    { fields: ['attempt_type'] },
    { fields: ['status'] },
    { fields: ['created_at'] },
    { fields: ['updated_at'] },
    { fields: ['vault_id', 'status'] },
    { fields: ['vault_id', 'created_at'] },
    { fields: ['user_id', 'created_at'] },
    { fields: ['attempt_type', 'status'] },
    // ✅ Composite index for common queries
    { fields: ['vault_id', 'status', 'created_at'] }
  ],
  
  // ==================== SCOPES ====================
  scopes: {
    successful: { where: { status: 'SUCCESS' } },
    failed: { where: { status: 'FAILED' } },
    blocked: { where: { status: 'BLOCKED' } },
    access: { where: { attempt_type: 'ACCESS' } },
    authentication: { where: { attempt_type: 'AUTHENTICATION' } },
    transaction: { where: { attempt_type: 'TRANSACTION' } },
    today: {
      where: {
        created_at: {
          [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    },
    last24Hours: {
      where: {
        created_at: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    },
    byVault: (vaultId) => ({ where: { vault_id: vaultId } }),
    byUser: (userId) => ({ where: { user_id: userId } }),
    byStatus: (status) => ({ where: { status } }),
    byType: (type) => ({ where: { attempt_type: type } }),
    orderedByDateDesc: { order: [['created_at', 'DESC']] },
    orderedByDateAsc: { order: [['created_at', 'ASC']] }
  }
});

export default VaultAccessAttempt;