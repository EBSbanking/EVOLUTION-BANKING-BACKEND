// src/models/Thrift.js - ADAPTED TO MATCH DATABASE SCHEMA
import { DataTypes, Model } from 'sequelize';
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

class Thrift extends Model {}

Thrift.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },

    // Try both possible column names for customer ID
    CUST_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'CUST_ID', // Try this first
      comment: 'Customer ID',
    },
    
    // Add a virtual field to handle if the column is actually 'customer_id'
    customer_id: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.getDataValue('CUST_ID');
      },
      set(value) {
        this.setDataValue('CUST_ID', value);
      }
    },

    ACCT_NO: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'ACCT_NO',
      comment: 'Account number',
    },

    ACCT_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'ACCT_ID',
      comment: 'Account ID',
    },

    FIRST_NAME: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'FIRST_NAME',
      comment: 'First name',
    },

    LASTNAME: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'LASTNAME',
      comment: 'Last name',
    },

    FULL_NAME: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'FULL_NAME',
      comment: 'Full name',
    },

    // Try both possible column names for relationship manager
    RELATIONSHIP_MANAGER: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'RELATIONSHIP_MANAGER', // Try this first
      comment: 'Relationship manager code',
    },
    
    // Add a virtual field to handle if the column is actually 'relationship_manager_id'
    relationship_manager_id: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.getDataValue('RELATIONSHIP_MANAGER');
      },
      set(value) {
        this.setDataValue('RELATIONSHIP_MANAGER', value);
      }
    },

    AMOUNT: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'AMOUNT',
      comment: 'Current account balance',
    },

    ADDRESS: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'ADDRESS',
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
      field: 'COLLECTION_TYPE',
      comment: 'Collection frequency type',
    },

    OPENED_DT: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'OPENED_DT',
      comment: 'Account opening date',
    },

    TRANSACTION_DATE: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'TRANSACTION_DATE',
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
      field: 'status',
      comment: 'Account status',
    },

    openingDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'opening_date',
      comment: 'Account opening date (alternative)',
    },

    lastCollectionDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_collection_date',
      comment: 'Last collection date',
    },

    initialAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0.00,
      field: 'initial_amount',
      comment: 'Initial deposit amount',
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
      field: 'account_type',
      comment: 'Account type',
    },

    nextCollectionDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'next_collection_date',
      comment: 'Next scheduled collection date',
    },

    totalContributions: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'total_contributions',
      comment: 'Total contributions made',
    },

    totalWithdrawals: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'total_withdrawals',
      comment: 'Total withdrawals made',
    },

    lastTransactionDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_transaction_date',
      comment: 'Date of last transaction',
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
      comment: 'Account active status',
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'notes',
      comment: 'Additional notes',
    },

    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
      comment: 'Record creation timestamp',
    },

    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
      comment: 'Record update timestamp',
    },
  },
  {
    sequelize,
    modelName: 'Thrift',
    tableName: 'THRIFT_ACCOUNTS',
    timestamps: true,
    underscored: false,
    freezeTableName: true,
    engine: 'InnoDB',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    paranoid: false,
    comment: 'Thrift accounts table',
    indexes: [
  { fields: ['CUST_ID'] },
  { fields: ['ACCT_NO'], unique: true },
  { fields: ['ACCT_ID'], unique: true },
  { fields: ['status'] },
  { fields: ['COLLECTION_TYPE'] },
  { fields: ['OPENED_DT'] },
  // { fields: ['accountType'] },  // REMOVE THIS LINE
  { fields: ['isActive'] },
  { fields: ['RELATIONSHIP_MANAGER'] },
],
    hooks: {
      beforeCreate: (thrift) => {
        if (!thrift.OPENED_DT) {
          thrift.OPENED_DT = new Date();
        }
        if (!thrift.openingDate) {
          thrift.openingDate = new Date();
        }
        if (!thrift.notes) {
          thrift.notes = `Thrift account created on ${new Date().toISOString()}`;
        }
      },
      beforeUpdate: (thrift) => {
        if (thrift.changed('AMOUNT')) {
          thrift.lastTransactionDate = new Date();
        }
        if (thrift.changed('status') && thrift.status === 'CLOSED') {
          thrift.isActive = false;
          thrift.notes = thrift.notes ? `${thrift.notes}\nAccount closed on ${new Date().toISOString()}` : `Account closed on ${new Date().toISOString()}`;
        }
      },
    },
  }
);

// ============================================
// AUTO-CREATION FUNCTIONS
// ============================================

Thrift.createTable = async (force = false) => {
  try {
    console.log('🔄 Creating/verifying THRIFT_ACCOUNTS table...');
    
    if (force) {
      await sequelize.query('DROP TABLE IF EXISTS THRIFT_ACCOUNTS');
    }
    
    await Thrift.sync({ force });
    
    console.log(`✅ THRIFT_ACCOUNTS table ${force ? 'recreated' : 'created'} successfully`);
    
    const tableInfo = await sequelize.query(
      'DESCRIBE THRIFT_ACCOUNTS',
      { type: sequelize.QueryTypes.SELECT }
    );
    
    console.log('\n📋 Table structure:');
    console.log('='.repeat(60));
    tableInfo.forEach(col => {
      console.log(`${col.Field.padEnd(25)} | ${col.Type.padEnd(25)} | ${col.Null}`);
    });
    
    return { 
      created: true, 
      message: `Table ${force ? 'recreated' : 'created'} successfully`,
      columns: tableInfo.length
    };
  } catch (error) {
    console.error('❌ Failed to create THRIFT_ACCOUNTS table:', error.message);
    throw error;
  }
};

Thrift.fixExistingTable = async () => {
  try {
    console.log('🔧 Fixing existing THRIFT_ACCOUNTS table...');
    
    const currentStructure = await sequelize.query(
      'DESCRIBE THRIFT_ACCOUNTS',
      { type: sequelize.QueryTypes.SELECT }
    ).catch(() => []);
    
    if (currentStructure.length === 0) {
      console.log('📦 Table not found, creating new one...');
      return await Thrift.createTable(false);
    }
    
    console.log('✅ Table structure verified');
    return { fixed: false, message: 'Table already exists' };
    
  } catch (error) {
    console.error('❌ Failed to fix table:', error.message);
    throw error;
  }
};

Thrift.initializeTable = async () => {
  try {
    console.log('\n🚀 Initializing Thrift table...');
    
    const result = await Thrift.fixExistingTable();
    
    if (result.fixed === false && result.created === false) {
      await Thrift.sync({ alter: true });
      console.log('✅ Thrift table synchronized');
    }
    
    console.log('✅ Thrift table initialization complete');
    return result;
    
  } catch (error) {
    console.error('❌ Failed to initialize Thrift table:', error.message);
    
    try {
      console.log('🔄 Attempting fresh table creation...');
      return await Thrift.createTable(true);
    } catch (createError) {
      console.error('❌ Complete failure:', createError.message);
      throw createError;
    }
  }
};

// ============================================
// INSTANCE METHODS
// ============================================

Thrift.prototype.getAvailableBalance = function() {
  return this.AMOUNT;
};

Thrift.prototype.getNetBalance = function() {
  return (this.totalContributions || 0) - (this.totalWithdrawals || 0);
};

Thrift.prototype.isOverdue = function() {
  if (!this.nextCollectionDate) return false;
  const today = new Date();
  return this.nextCollectionDate < today && this.status === 'ACTIVE';
};

Thrift.prototype.getAccountInfo = function() {
  return {
    accountNumber: this.ACCT_NO,
    accountId: this.ACCT_ID,
    customerId: this.CUST_ID || this.customer_id,
    customerName: this.FULL_NAME,
    balance: this.AMOUNT,
    availableBalance: this.getAvailableBalance(),
    netBalance: this.getNetBalance(),
    status: this.status,
    collectionType: this.COLLECTION_TYPE,
    openingDate: this.OPENED_DT,
    isActive: this.isActive,
    isOverdue: this.isOverdue(),
    relationshipManager: this.RELATIONSHIP_MANAGER || this.relationship_manager_id,
    totalContributions: this.totalContributions,
    totalWithdrawals: this.totalWithdrawals,
  };
};

export default Thrift;
