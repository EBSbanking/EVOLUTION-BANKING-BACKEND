// src/models/Thrift.js - COMPLETE & CORRECT with cycle fields
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

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

const CYCLE_STATUS = {
  ACTIVE: 'ACTIVE',
  WITHDRAWN: 'WITHDRAWN',
  CLOSED: 'CLOSED',
};

class Thrift extends Model {}

Thrift.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    ACCT_NO: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'ACCT_NO',
    },
    ACCT_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'ACCT_ID',
    },
    CUST_ID: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'CUST_ID',
    },
    FIRST_NAME: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'FIRST_NAME',
    },
    LASTNAME: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'LASTNAME',
    },
    FULL_NAME: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'FULL_NAME',
    },
    AMOUNT: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0.00,
      field: 'AMOUNT',
    },
    COLLECTION_TYPE: {
      type: DataTypes.ENUM(...Object.values(COLLECTION_TYPES)),
      allowNull: true,
      defaultValue: 'DAILY',
      field: 'COLLECTION_TYPE',
    },
    STATUS: {
      type: DataTypes.ENUM(...Object.values(ACCOUNT_STATUS)),
      allowNull: true,
      defaultValue: 'ACTIVE',
      field: 'STATUS',
    },
    OPENED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'OPENED_DT',
    },
    RELATIONSHIP_MANAGER: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'RELATIONSHIP_MANAGER',
    },
    ADDRESS: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'ADDRESS',
    },
    TRANSACTION_DATE: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'TRANSACTION_DATE',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true,
      field: 'isActive',
    },
    // ========== ADDED FIELDS ==========
    nextCollectionDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'next_collection_date',
    },
    totalContributions: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'total_contributions',
    },
    totalWithdrawals: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'total_withdrawals',
    },
    lastCollectionDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_collection_date',
    },
    initialAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      field: 'initial_amount',
    },
    accountType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'account_type',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'notes',
    },
    // CYCLE FIELDS
    cycle_status: {
      type: DataTypes.ENUM(...Object.values(CYCLE_STATUS)),
      allowNull: false,
      defaultValue: 'ACTIVE',
      field: 'cycle_status',
    },
    cycle_start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'cycle_start_date',
    },
    last_cycle_end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'last_cycle_end_date',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'CREATED_AT',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'UPDATED_AT',
    },
  },
  {
    sequelize,
    modelName: 'Thrift',
    tableName: 'THRIFT_ACCOUNTS',
    timestamps: false,
    freezeTableName: true,
  }
);

// Instance methods
Thrift.prototype.getAvailableBalance = function () {
  return this.AMOUNT || 0;
};

Thrift.prototype.getAccountInfo = function () {
  return {
    accountNumber: this.ACCT_NO,
    accountId: this.ACCT_ID,
    customerId: this.CUST_ID,
    customerName: this.FULL_NAME,
    balance: this.AMOUNT,
    availableBalance: this.getAvailableBalance(),
    status: this.STATUS,
    collectionType: this.COLLECTION_TYPE,
    openingDate: this.OPENED_DT,
    isActive: this.isActive,
    relationshipManager: this.RELATIONSHIP_MANAGER,
    nextCollectionDate: this.nextCollectionDate,
    totalContributions: this.totalContributions,
    totalWithdrawals: this.totalWithdrawals,
    cycle_status: this.cycle_status,
    cycle_start_date: this.cycle_start_date,
    last_cycle_end_date: this.last_cycle_end_date,
  };
};

export default Thrift;