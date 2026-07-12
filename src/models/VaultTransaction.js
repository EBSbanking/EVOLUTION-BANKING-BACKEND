// src/models/VaultTransaction.js - Class-based
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class VaultTransaction extends Model {}

VaultTransaction.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  TRANSACTION_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'transactions',
      key: 'id'
    }
  },
  VAULT_DRAWER_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'drawers',
      key: 'id'
    }
  },
  TELLER_DRAWER_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'drawers',
      key: 'id'
    }
  },
  IS_VAULT_ISSUANCE: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  VAULT_TRANSACTION_CATEGORY: {
    type: DataTypes.ENUM('CASH_ISSUANCE', 'CASH_RETURN', 'CASH_ADJUSTMENT', 'CASH_TRANSFER'),
    allowNull: false
  },
  VAULT_AUTHORIZATION_REQUIRED: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  VAULT_AUTHORIZED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  VAULT_AUTHORIZATION_DT: {
    type: DataTypes.DATE,
    allowNull: true
  },
  CASH_COUNT_VERIFIED: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  CASH_COUNT_VERIFIED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  CASH_COUNT_VERIFIED_DT: {
    type: DataTypes.DATE,
    allowNull: true
  },
  IS_HIGH_VALUE_TRANSACTION: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  HIGH_VALUE_THRESHOLD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 500000.00
  },
  REQUIRES_DUAL_CONTROL: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  DUAL_CONTROL_USER_ID: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  DUAL_CONTROL_USER_NAME: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  VAULT_SESSION_ID: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  MODIFIED_BY: {
    type: DataTypes.STRING(24),
    allowNull: true
  },
  MODIFY_DT: {
    type: DataTypes.DATE,
    allowNull: true
  },
  TRANSACTION_STATUS: {
    type: DataTypes.ENUM('PENDING', 'AUTHORIZED', 'COMPLETED', 'CANCELLED', 'REJECTED'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  REMARKS: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  VERIFICATION_METHOD: {
    type: DataTypes.ENUM('MANUAL', 'MACHINE', 'DUAL_MANUAL'),
    allowNull: true
  },
  IS_RECONCILED: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  RECONCILIATION_DT: {
    type: DataTypes.DATE,
    allowNull: true
  },
  BATCH_NUMBER: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  REFERENCE_NUMBER: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true
  },
  IS_REVERSED: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  REVERSAL_REASON: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  REVERSAL_DT: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'VaultTransaction',
  tableName: 'vault_transactions',
  timestamps: true,
  underscored: false,
  createdAt: 'CREATE_DT',
  updatedAt: 'MODIFY_DT'
});

export default VaultTransaction;