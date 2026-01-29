// models/VaultTransaction.js
import { DataTypes } from 'sequelize';

/**
 * MySQL/Sequelize VaultTransaction Model
 */
export default function createVaultTransactionModel(sequelize) {
  const VaultTransaction = sequelize.define('VaultTransaction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'Primary key'
    },
    
    // Reference to base transaction
    TRANSACTION_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: {
        model: 'transactions',
        key: 'id'
      },
      comment: 'Reference to base transaction',
      validate: {
        notNull: {
          msg: 'Transaction ID is required'
        }
      }
    },
    
    // Vault-specific fields
    VAULT_DRAWER_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'drawers',
        key: 'id'
      },
      comment: 'Vault drawer ID',
      validate: {
        notNull: {
          msg: 'Vault drawer ID is required'
        }
      }
    },
    
    TELLER_DRAWER_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'drawers',
        key: 'id'
      },
      comment: 'Teller drawer ID',
      validate: {
        notNull: {
          msg: 'Teller drawer ID is required'
        }
      }
    },
    
    // Vault transaction specifics
    IS_VAULT_ISSUANCE: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'true = vault to teller, false = teller to vault'
    },
    
    VAULT_TRANSACTION_CATEGORY: {
      type: DataTypes.ENUM('CASH_ISSUANCE', 'CASH_RETURN', 'CASH_ADJUSTMENT', 'CASH_TRANSFER'),
      allowNull: false,
      comment: 'Type of vault transaction',
      validate: {
        isIn: {
          args: [['CASH_ISSUANCE', 'CASH_RETURN', 'CASH_ADJUSTMENT', 'CASH_TRANSFER']],
          msg: 'Invalid vault transaction category'
        }
      }
    },
    
    // Vault authorization levels
    VAULT_AUTHORIZATION_REQUIRED: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether vault authorization is required'
    },
    
    VAULT_AUTHORIZED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'User who authorized the vault transaction'
    },
    
    VAULT_AUTHORIZATION_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date and time of vault authorization'
    },
    
    // Cash management
    CASH_COUNT_VERIFIED: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether cash count has been verified'
    },
    
    CASH_COUNT_VERIFIED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'User who verified cash count'
    },
    
    CASH_COUNT_VERIFIED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date and time of cash count verification'
    },
    
    // Security
    IS_HIGH_VALUE_TRANSACTION: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Flag for high-value transactions'
    },
    
    HIGH_VALUE_THRESHOLD: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      defaultValue: 500000.00,
      comment: 'Threshold amount for high-value transactions (NGN)',
      validate: {
        min: {
          args: [0],
          msg: 'High value threshold cannot be negative'
        }
      }
    },
    
    // Additional vault controls
    REQUIRES_DUAL_CONTROL: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether dual control is required'
    },
    
    DUAL_CONTROL_USER_ID: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Second user ID for dual control'
    },
    
    DUAL_CONTROL_USER_NAME: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Second user name for dual control'
    },
    
    // Vault session tracking
    VAULT_SESSION_ID: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Vault session identifier'
    },
    
    // Audit fields
    CREATED_BY: {
      type: DataTypes.STRING(24),
      allowNull: false,
      comment: 'User who created the record',
      validate: {
        notNull: {
          msg: 'Created by is required'
        },
        notEmpty: {
          msg: 'Created by cannot be empty'
        }
      }
    },
    
    CREATE_DT: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Creation date and time'
    },
    
    MODIFIED_BY: {
      type: DataTypes.STRING(24),
      allowNull: true,
      comment: 'User who last modified the record'
    },
    
    MODIFY_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last modification date and time'
    },
    
    // Transaction status
    TRANSACTION_STATUS: {
      type: DataTypes.ENUM('PENDING', 'AUTHORIZED', 'COMPLETED', 'CANCELLED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'PENDING',
      comment: 'Current status of the vault transaction',
      validate: {
        isIn: {
          args: [['PENDING', 'AUTHORIZED', 'COMPLETED', 'CANCELLED', 'REJECTED']],
          msg: 'Invalid transaction status'
        }
      }
    },
    
    // Additional fields for better tracking
    REMARKS: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional notes or remarks'
    },
    
    VERIFICATION_METHOD: {
      type: DataTypes.ENUM('MANUAL', 'MACHINE', 'DUAL_MANUAL', null),
      allowNull: true,
      comment: 'Method used for cash verification'
    },
    
    IS_RECONCILED: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether transaction has been reconciled'
    },
    
    RECONCILIATION_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date and time of reconciliation'
    },
    
    // Additional tracking fields
    BATCH_NUMBER: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Batch number for grouped transactions'
    },
    
    REFERENCE_NUMBER: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      comment: 'External reference number'
    },
    
    IS_REVERSED: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether transaction has been reversed'
    },
    
    REVERSAL_REASON: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Reason for transaction reversal'
    },
    
    REVERSAL_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date and time of reversal'
    }

  }, {
    tableName: 'vault_transactions',
    timestamps: true,
    createdAt: 'CREATE_DT',
    updatedAt: 'MODIFY_DT',
    underscored: false,
    
    // Hooks
    hooks: {
      beforeCreate: async (vaultTransaction) => {
        // Set default values
        if (!vaultTransaction.VAULT_SESSION_ID) {
          vaultTransaction.VAULT_SESSION_ID = `VAULT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        
        // Validate vault and teller drawers are different
        if (vaultTransaction.VAULT_DRAWER_ID === vaultTransaction.TELLER_DRAWER_ID) {
          throw new Error('Vault drawer and teller drawer cannot be the same');
        }
      },
      
      beforeUpdate: async (vaultTransaction) => {
        // Auto-update IS_HIGH_VALUE_TRANSACTION based on related transaction amount
        if (vaultTransaction.changed('TRANSACTION_ID') || vaultTransaction.changed('HIGH_VALUE_THRESHOLD')) {
          try {
            const transaction = await sequelize.models.Transaction.findByPk(vaultTransaction.TRANSACTION_ID);
            if (transaction) {
              const amount = parseFloat(transaction.TRANSACTION_AMOUNT || 0);
              const threshold = parseFloat(vaultTransaction.HIGH_VALUE_THRESHOLD || 500000.00);
              vaultTransaction.IS_HIGH_VALUE_TRANSACTION = amount >= threshold;
            }
          } catch (error) {
            console.error('Error checking high value transaction:', error);
          }
        }
        
        // Update authorization timestamp when authorized
        if (vaultTransaction.changed('VAULT_AUTHORIZED_BY') && vaultTransaction.VAULT_AUTHORIZED_BY) {
          vaultTransaction.VAULT_AUTHORIZATION_DT = new Date();
        }
        
        // Update verification timestamp when verified
        if (vaultTransaction.changed('CASH_COUNT_VERIFIED_BY') && vaultTransaction.CASH_COUNT_VERIFIED_BY) {
          vaultTransaction.CASH_COUNT_VERIFIED_DT = new Date();
          vaultTransaction.CASH_COUNT_VERIFIED = true;
        }
        
        // Update reconciliation timestamp
        if (vaultTransaction.changed('IS_RECONCILED') && vaultTransaction.IS_RECONCILED) {
          vaultTransaction.RECONCILIATION_DT = new Date();
        }
        
        // Update reversal timestamp
        if (vaultTransaction.changed('IS_REVERSED') && vaultTransaction.IS_REVERSED) {
          vaultTransaction.REVERSAL_DT = new Date();
        }
      }
    },
    
    // Default scope
    defaultScope: {
      attributes: {
        exclude: [] // No fields excluded by default
      }
    },
    
    // Scopes
    scopes: {
      pendingAuthorization: {
        where: {
          VAULT_AUTHORIZATION_REQUIRED: true,
          VAULT_AUTHORIZED_BY: null
        }
      },
      pendingVerification: {
        where: {
          CASH_COUNT_VERIFIED: false
        }
      },
      highValueTransactions: {
        where: {
          IS_HIGH_VALUE_TRANSACTION: true
        }
      },
      today: {
        where: {
          CREATE_DT: {
            [Op.between]: [
              new Date(new Date().setHours(0, 0, 0, 0)),
              new Date(new Date().setHours(23, 59, 59, 999))
            ]
          }
        }
      },
      byVaultDrawer: (drawerId) => ({
        where: { VAULT_DRAWER_ID: drawerId }
      }),
      byTellerDrawer: (drawerId) => ({
        where: { TELLER_DRAWER_ID: drawerId }
      }),
      byStatus: (status) => ({
        where: { TRANSACTION_STATUS: status }
      }),
      byCategory: (category) => ({
        where: { VAULT_TRANSACTION_CATEGORY: category }
      }),
      withPendingDualControl: {
        where: {
          REQUIRES_DUAL_CONTROL: true,
          DUAL_CONTROL_USER_ID: null
        }
      },
      completed: {
        where: {
          TRANSACTION_STATUS: 'COMPLETED'
        }
      },
      pending: {
        where: {
          TRANSACTION_STATUS: 'PENDING'
        }
      },
      reconciled: {
        where: {
          IS_RECONCILED: true
        }
      },
      unreconciled: {
        where: {
          IS_RECONCILED: false
        }
      },
      reversed: {
        where: {
          IS_REVERSED: true
        }
      }
    },
    
    // Indexes
    indexes: [
      // Basic indexes
      {
        fields: ['TRANSACTION_ID'],
        unique: true
      },
      {
        fields: ['VAULT_DRAWER_ID']
      },
      {
        fields: ['TELLER_DRAWER_ID']
      },
      {
        fields: ['TRANSACTION_STATUS']
      },
      {
        fields: ['VAULT_TRANSACTION_CATEGORY']
      },
      {
        fields: ['IS_VAULT_ISSUANCE']
      },
      {
        fields: ['IS_HIGH_VALUE_TRANSACTION']
      },
      {
        fields: ['CREATE_DT']
      },
      {
        fields: ['CREATED_BY']
      },
      {
        fields: ['REFERENCE_NUMBER'],
        unique: true
      },
      {
        fields: ['BATCH_NUMBER']
      },
      
      // Compound indexes for common queries
      {
        fields: ['VAULT_DRAWER_ID', 'CREATE_DT']
      },
      {
        fields: ['TELLER_DRAWER_ID', 'CREATE_DT']
      },
      {
        fields: ['TRANSACTION_STATUS', 'CREATE_DT']
      },
      {
        fields: ['IS_VAULT_ISSUANCE', 'TRANSACTION_STATUS']
      },
      {
        fields: ['CREATED_BY', 'CREATE_DT']
      },
      {
        fields: ['VAULT_AUTHORIZED_BY', 'VAULT_AUTHORIZATION_DT']
      },
      {
        fields: ['IS_RECONCILED', 'RECONCILIATION_DT']
      },
      {
        fields: ['IS_REVERSED', 'REVERSAL_DT']
      }
    ]
  });

  // Instance Methods
  VaultTransaction.prototype.canProcessVaultTransaction = function() {
    const errors = [];
    
    if (this.REQUIRES_DUAL_CONTROL && !this.DUAL_CONTROL_USER_ID) {
      errors.push('Dual control required but not assigned');
    }
    
    if (this.VAULT_AUTHORIZATION_REQUIRED && !this.VAULT_AUTHORIZED_BY) {
      errors.push('Vault authorization required but not provided');
    }
    
    if (!this.CASH_COUNT_VERIFIED) {
      errors.push('Cash count verification pending');
    }
    
    return {
      canProcess: errors.length === 0,
      errors: errors
    };
  };

  VaultTransaction.prototype.isHighValue = async function() {
    try {
      // Need to fetch the related transaction to check amount
      const transaction = await sequelize.models.Transaction.findByPk(this.TRANSACTION_ID);
      if (!transaction) return false;
      
      const amount = parseFloat(transaction.TRANSACTION_AMOUNT || 0);
      const threshold = parseFloat(this.HIGH_VALUE_THRESHOLD || 500000.00);
      return amount >= threshold;
    } catch (error) {
      console.error('Error checking high value:', error);
      return false;
    }
  };

  VaultTransaction.prototype.requiresDualControl = async function() {
    const isHighValue = await this.isHighValue();
    return this.REQUIRES_DUAL_CONTROL || isHighValue;
  };

  VaultTransaction.prototype.authorize = function(authorizedBy, remarks = null) {
    this.VAULT_AUTHORIZED_BY = authorizedBy;
    this.VAULT_AUTHORIZATION_DT = new Date();
    this.TRANSACTION_STATUS = 'AUTHORIZED';
    
    if (remarks) {
      this.REMARKS = this.REMARKS ? `${this.REMARKS}\nAuthorized: ${remarks}` : `Authorized: ${remarks}`;
    }
    
    return this.save();
  };

  VaultTransaction.prototype.verifyCashCount = function(verifiedBy, method = 'MANUAL', remarks = null) {
    this.CASH_COUNT_VERIFIED = true;
    this.CASH_COUNT_VERIFIED_BY = verifiedBy;
    this.CASH_COUNT_VERIFIED_DT = new Date();
    this.VERIFICATION_METHOD = method;
    
    if (remarks) {
      this.REMARKS = this.REMARKS ? `${this.REMARKS}\nVerified: ${remarks}` : `Verified: ${remarks}`;
    }
    
    return this.save();
  };

  VaultTransaction.prototype.assignDualControl = function(userId, userName) {
    this.DUAL_CONTROL_USER_ID = userId;
    this.DUAL_CONTROL_USER_NAME = userName;
    return this.save();
  };

  VaultTransaction.prototype.complete = function(remarks = null) {
    this.TRANSACTION_STATUS = 'COMPLETED';
    
    if (remarks) {
      this.REMARKS = this.REMARKS ? `${this.REMARKS}\nCompleted: ${remarks}` : `Completed: ${remarks}`;
    }
    
    return this.save();
  };

  VaultTransaction.prototype.cancel = function(reason = null) {
    this.TRANSACTION_STATUS = 'CANCELLED';
    
    if (reason) {
      this.REMARKS = this.REMARKS ? `${this.REMARKS}\nCancelled: ${reason}` : `Cancelled: ${reason}`;
    }
    
    return this.save();
  };

  VaultTransaction.prototype.reject = function(reason) {
    this.TRANSACTION_STATUS = 'REJECTED';
    
    if (reason) {
      this.REMARKS = this.REMARKS ? `${this.REMARKS}\nRejected: ${reason}` : `Rejected: ${reason}`;
    }
    
    return this.save();
  };

  VaultTransaction.prototype.reverse = function(reason) {
    this.IS_REVERSED = true;
    this.REVERSAL_REASON = reason;
    
    if (reason) {
      this.REMARKS = this.REMARKS ? `${this.REMARKS}\nReversed: ${reason}` : `Reversed: ${reason}`;
    }
    
    return this.save();
  };

  VaultTransaction.prototype.reconcile = function(remarks = null) {
    this.IS_RECONCILED = true;
    this.RECONCILIATION_DT = new Date();
    
    if (remarks) {
      this.REMARKS = this.REMARKS ? `${this.REMARKS}\nReconciled: ${remarks}` : `Reconciled: ${remarks}`;
    }
    
    return this.save();
  };

  // Static Methods
  VaultTransaction.findByTransactionId = function(transactionId) {
    return this.findOne({
      where: { TRANSACTION_ID: transactionId },
      include: [
        {
          model: sequelize.models.Transaction,
          as: 'transaction',
          attributes: ['id', 'TRANSACTION_AMOUNT', 'TRANSACTION_TYPE', 'CURRENCY']
        },
        {
          model: sequelize.models.Drawer,
          as: 'vaultDrawer',
          attributes: ['id', 'DRAWER_NAME', 'DRAWER_TYPE', 'CURRENT_BALANCE']
        },
        {
          model: sequelize.models.Drawer,
          as: 'tellerDrawer',
          attributes: ['id', 'DRAWER_NAME', 'DRAWER_TYPE', 'CURRENT_BALANCE']
        }
      ]
    });
  };

  VaultTransaction.getVaultTransactionsByDate = function(startDate, endDate, options = {}) {
    const where = {
      CREATE_DT: {
        [Op.between]: [startDate, endDate]
      }
    };
    
    if (options.vaultDrawerId) {
      where.VAULT_DRAWER_ID = options.vaultDrawerId;
    }
    
    if (options.tellerDrawerId) {
      where.TELLER_DRAWER_ID = options.tellerDrawerId;
    }
    
    if (options.status) {
      where.TRANSACTION_STATUS = options.status;
    }
    
    if (options.category) {
      where.VAULT_TRANSACTION_CATEGORY = options.category;
    }
    
    return this.findAll({
      where,
      include: options.include || [],
      order: [['CREATE_DT', 'DESC']]
    });
  };

  VaultTransaction.getHighValueTransactions = function(threshold = null) {
    const where = {
      IS_HIGH_VALUE_TRANSACTION: true
    };
    
    if (threshold) {
      where.HIGH_VALUE_THRESHOLD = {
        [Op.lte]: threshold
      };
    }
    
    return this.findAll({
      where,
      include: [
        {
          model: sequelize.models.Transaction,
          as: 'transaction',
          attributes: ['id', 'TRANSACTION_AMOUNT', 'TRANSACTION_TYPE', 'CURRENCY']
        }
      ],
      order: [['CREATE_DT', 'DESC']]
    });
  };

  VaultTransaction.getPendingTransactions = function() {
    return this.scope('pending').findAll({
      include: [
        {
          model: sequelize.models.Transaction,
          as: 'transaction',
          attributes: ['id', 'TRANSACTION_AMOUNT', 'TRANSACTION_TYPE']
        }
      ],
      order: [['CREATE_DT', 'ASC']]
    });
  };

  // Virtual getters (not true virtuals in Sequelize, but methods that simulate them)
  VaultTransaction.prototype.getTransactionSummary = async function() {
    const transaction = await sequelize.models.Transaction.findByPk(this.TRANSACTION_ID);
    const vaultDrawer = await sequelize.models.Drawer.findByPk(this.VAULT_DRAWER_ID);
    const tellerDrawer = await sequelize.models.Drawer.findByPk(this.TELLER_DRAWER_ID);
    
    return {
      transactionId: this.TRANSACTION_ID,
      transactionAmount: transaction ? transaction.TRANSACTION_AMOUNT : null,
      vaultDrawer: vaultDrawer ? vaultDrawer.DRAWER_NAME : null,
      tellerDrawer: tellerDrawer ? tellerDrawer.DRAWER_NAME : null,
      category: this.VAULT_TRANSACTION_CATEGORY,
      status: this.TRANSACTION_STATUS,
      isIssuance: this.IS_VAULT_ISSUANCE,
      createdAt: this.CREATE_DT,
      createdBy: this.CREATED_BY
    };
  };

  // Define associations
  VaultTransaction.associate = function(models) {
    VaultTransaction.belongsTo(models.Transaction, {
      foreignKey: 'TRANSACTION_ID',
      as: 'transaction'
    });
    
    VaultTransaction.belongsTo(models.Drawer, {
      foreignKey: 'VAULT_DRAWER_ID',
      as: 'vaultDrawer'
    });
    
    VaultTransaction.belongsTo(models.Drawer, {
      foreignKey: 'TELLER_DRAWER_ID',
      as: 'tellerDrawer'
    });
    
    // Optional: User who created the transaction
    VaultTransaction.belongsTo(models.User, {
      foreignKey: 'CREATED_BY',
      targetKey: 'user_name',
      as: 'creator'
    });
    
    // Optional: User who authorized
    VaultTransaction.belongsTo(models.User, {
      foreignKey: 'VAULT_AUTHORIZED_BY',
      targetKey: 'user_name',
      as: 'authorizer'
    });
  };

  return VaultTransaction;
}
