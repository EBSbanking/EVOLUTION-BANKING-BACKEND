// src/models/Thrift.js - FINAL WORKING VERSION
import { DataTypes, Model } from 'sequelize';  // ← ADD Model HERE
import sequelize from '../../config/db.js';

// === DEFINE ENUM CONSTANTS ===
const COLLECTION_TYPES = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
};

const ACCOUNT_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  CLOSED: 'CLOSED',
};

const ACCOUNT_TYPES = {
  SAVINGS: 'SAVINGS',
  CURRENT: 'CURRENT',
  FIXED_DEPOSIT: 'FIXED_DEPOSIT',
  THRIFT: 'THRIFT',
};

// Now Model is defined — no more ReferenceError
class Thrift extends Model {}

Thrift.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'Auto-increment primary key',
    },

    CUST_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Customer ID',
    },

    ACCT_NO: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Account number',
    },

    ACCT_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Account ID',
    },

    FIRST_NAME: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'First name',
    },

    LASTNAME: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Last name',
    },

    FULL_NAME: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: 'Full name',
    },

    RELATIONSHIP_MANAGER: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Relationship manager code',
    },

    AMOUNT: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: 'Current account balance',
      validate: { min: 0 },
    },

    ADDRESS: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        street: null,
        city: null,
        state: null,
        zipCode: null,
        country: 'Nigeria',
      },
      comment: 'Customer address',
    },

    COLLECTION_TYPE: {
      type: DataTypes.ENUM(
        COLLECTION_TYPES.DAILY,
        COLLECTION_TYPES.WEEKLY,
        COLLECTION_TYPES.MONTHLY,
        COLLECTION_TYPES.QUARTERLY
      ),
      allowNull: false,
      comment: 'Collection frequency type',
    },

    OPENED_DT: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Account opening date',
    },

    TRANSACTION_DATE: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Specific transaction date',
    },

    status: {
      type: DataTypes.ENUM(
        ACCOUNT_STATUS.ACTIVE,
        ACCOUNT_STATUS.INACTIVE,
        ACCOUNT_STATUS.SUSPENDED,
        ACCOUNT_STATUS.CLOSED
      ),
      allowNull: false,
      defaultValue: ACCOUNT_STATUS.ACTIVE,
      comment: 'Account status',
    },

    openingDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Account opening date (alternative)',
    },

    lastCollectionDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last collection date',
    },

    initialAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0.00,
      comment: 'Initial deposit amount',
      validate: { min: 0 },
    },

    accountType: {
      type: DataTypes.ENUM(
        ACCOUNT_TYPES.SAVINGS,
        ACCOUNT_TYPES.CURRENT,
        ACCOUNT_TYPES.FIXED_DEPOSIT,
        ACCOUNT_TYPES.THRIFT
      ),
      allowNull: false,
      defaultValue: ACCOUNT_TYPES.THRIFT,
      comment: 'Account type',
    },

    nextCollectionDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Next scheduled collection date',
    },

    totalContributions: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: 'Total contributions made',
      validate: { min: 0 },
    },

    totalWithdrawals: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: 'Total withdrawals made',
      validate: { min: 0 },
    },

    lastTransactionDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date of last transaction',
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Account active status',
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional notes',
    },
  },
  {
    sequelize,
    modelName: 'Thrift',
    tableName: 'THRIFT_ACCOUNTS',
    timestamps: true,
    comment: 'Thrift accounts table',
    indexes: [
      { fields: ['CUST_ID'] },
      { fields: ['ACCT_NO'], unique: true },
      { fields: ['ACCT_ID'], unique: true },
      { fields: ['status'] },
      { fields: ['COLLECTION_TYPE'] },
      { fields: ['OPENED_DT'] },
    ],
    hooks: {
      beforeCreate: (thrift) => {
        thrift.OPENED_DT = new Date();
        thrift.openingDate = new Date();
      },
      beforeUpdate: (thrift) => {
        if (thrift.changed('AMOUNT')) {
          thrift.lastTransactionDate = new Date();
        }
      },
    },
  }
);

export default Thrift;