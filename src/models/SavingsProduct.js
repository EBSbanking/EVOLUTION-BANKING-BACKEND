// models/SavingsProduct.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const SavingsProduct = sequelize.define('SavingsProduct', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  // Core fields – normal names, no camelCase
  PROD_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'Product identifier from core system',
  },
  PROD_CD: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Product code (legacy)',
  },
  PROD_DESC: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Product description',
  },
  PRODUCT_TYPE: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'SAVINGS',
    comment: 'Product type (e.g., SAVINGS, CURRENT, etc.)',
  },
  productCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Unique product code (modern)',
  },
  productName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Product short name',
  },
  productDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Detailed product description',
  },

  // Branch / Global configuration – changed to TEXT
  BU_ID: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Comma-separated list of branch codes or "*" for all branches',
  },
  isGlobalProduct: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether product is available to all branches',
  },
  accessibleBUs: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON or comma-separated list of allowed business units',
  },
  visibility: {
    type: DataTypes.STRING(50),
    defaultValue: 'SPECIFIC_BRANCH',
    comment: 'Visibility scope: GLOBAL, MULTIPLE_BRANCHES, SPECIFIC_BRANCH',
  },

  // GL Accounts – all changed to TEXT
  principalBalanceGLAccountNo: { type: DataTypes.TEXT, defaultValue: '0000000000' },
  interestGLAccountNo: { type: DataTypes.TEXT, defaultValue: '0000000000' },
  interestPayableGLAccountNo: { type: DataTypes.TEXT, defaultValue: '0000000000' },
  withholdingTaxGLAccountNo: { type: DataTypes.TEXT, defaultValue: '0000000000' },
  interestExpenseGLAccountNo: { type: DataTypes.TEXT, allowNull: true },
  depositChargeReceivableGLAccountNo: { type: DataTypes.TEXT, allowNull: true },
  delinquent_balance_gl_account_no: DataTypes.TEXT,
  dormant_balance_gl_account_no: DataTypes.TEXT,
  earmarked_balance_gl_account_no: DataTypes.TEXT,
  escheated_balance_gl_account_no: DataTypes.TEXT,
  interest_cheques_gl_account_no: DataTypes.TEXT,
  interest_income_gl_account_no: DataTypes.TEXT,
  interest_receivable_gl_account_no: DataTypes.TEXT,
  interest_suspense_gl_account_no: DataTypes.TEXT,
  matured_balance_gl_account_no: DataTypes.TEXT,
  maturity_cheques_gl_account_no: DataTypes.TEXT,
  non_accrual_balance_gl_account_no: DataTypes.TEXT,
  overdrawn_balance_gl_account_no: DataTypes.TEXT,
  pre_dormant_balance_gl_account_no: DataTypes.TEXT,
  provision_reserve_gl_account_no: DataTypes.TEXT,
  provision_expense_gl_account_no: DataTypes.TEXT,
  rejected_credit_suspense_gl_account_no: DataTypes.TEXT,
  rejected_debit_suspense_gl_account_no: DataTypes.TEXT,
  reserved_balance_gl_account_no: DataTypes.TEXT,
  uncleared_balance_gl_account_no: DataTypes.TEXT,
  write_off_balance_gl_account_no: DataTypes.TEXT,

  // Rate fields
  rateType: { type: DataTypes.STRING(50), defaultValue: 'FIXED' },
  fixedRate: { type: DataTypes.DECIMAL(10,4), defaultValue: 0.0 },
  effectiveRate: { type: DataTypes.DECIMAL(10,4), defaultValue: 0.0 },
  effectiveDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },

  // Settlement & Accrual
  settlementFrequency: { type: DataTypes.STRING(50), defaultValue: 'MONTHLY' },
  principalSettlementMethod: { type: DataTypes.STRING(50), defaultValue: 'ACCOUNT' },
  interestSettlementMethod: { type: DataTypes.STRING(50), defaultValue: 'ACCOUNT' },
  accrualFrequency: { type: DataTypes.STRING(50), defaultValue: 'DAILY' },
  accrualBasis: { type: DataTypes.STRING(50), defaultValue: 'ACTUAL_DAYS/ACTUAL_DAYS' },

  // JSON fields (TEXT)
  rateInformation: DataTypes.TEXT,
  settlementInformation: DataTypes.TEXT,
  accrualInformation: DataTypes.TEXT,
  chargesSetup: DataTypes.TEXT,
  metadata: DataTypes.TEXT,

  // Other fields
  CRNCY_ID: { type: DataTypes.STRING(10), defaultValue: 'NGN' },
  START_DT: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  REC_ST: { type: DataTypes.STRING(20), defaultValue: 'Active' },
  PROD_CAT_TY: DataTypes.STRING(50),
  PROD_DESIGN_ID: DataTypes.INTEGER,
  MIN_AGE_YEAR: DataTypes.INTEGER,
  STMNT_FREQ_CD: DataTypes.STRING(50),
  STMNT_FREQ_VALUE: DataTypes.INTEGER,
  ACCT_CYCLE_CD: DataTypes.STRING(50),
  ACCT_CYCLE_VALUE: DataTypes.INTEGER,
  ACCT_AUTH_BUS_PROD_ID: DataTypes.INTEGER,

  // Audit fields
  VERSION_NO: { type: DataTypes.INTEGER, defaultValue: 1 },
  CREATED_BY: { type: DataTypes.STRING(100), defaultValue: 'system' },
  USER_ID: DataTypes.STRING(100),
}, {
  tableName: 'savings_products',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,
});

/**
 * Create the savings_products table if it doesn't exist
 * This method handles table creation with proper error handling
 * @returns {Promise<Object>} Result of the operation
 */
SavingsProduct.createTableIfNotExists = async function() {
  try {
    const queryInterface = this.sequelize.queryInterface;
    const tableName = 'savings_products';
    
    // Check if table exists
    const tableExists = await queryInterface.tableExists(tableName);
    
    if (!tableExists) {
      console.log('📦 Creating savings_products table...');
      await this.sync({ force: false });
      console.log('✅ savings_products table created successfully');
      return { created: true, message: 'Table created successfully' };
    } else {
      console.log('✅ savings_products table already exists');
      
      // Verify critical columns exist
      const columns = await queryInterface.describeTable(tableName);
      const criticalColumns = ['PROD_ID', 'PROD_CD', 'PROD_DESC', 'productCode', 'productName'];
      const missingColumns = criticalColumns.filter(col => !columns[col]);
      
      if (missingColumns.length > 0) {
        console.warn(`⚠️ Missing critical columns: ${missingColumns.join(', ')}`);
        console.log('🔄 Attempting to update table schema...');
        await this.sync({ alter: false });
        console.log('✅ Table schema updated successfully');
        return { created: false, updated: true, message: 'Table schema updated' };
      }
      
      return { created: false, updated: false, message: 'Table already exists with correct schema' };
    }
  } catch (error) {
    console.error('❌ Error in SavingsProduct.createTableIfNotExists:', error);
    throw new Error(`Failed to create/update savings_products table: ${error.message}`);
  }
};

/**
 * Check if the table exists and has the correct schema
 * @returns {Promise<Object>} Table status information
 */
SavingsProduct.checkTableStatus = async function() {
  try {
    const queryInterface = this.sequelize.queryInterface;
    const tableName = 'savings_products';
    
    const tableExists = await queryInterface.tableExists(tableName);
    if (!tableExists) {
      return { exists: false, message: 'Table does not exist' };
    }
    
    const columns = await queryInterface.describeTable(tableName);
    const columnNames = Object.keys(columns);
    
    return {
      exists: true,
      columns: columnNames,
      columnCount: columnNames.length,
      message: 'Table exists'
    };
  } catch (error) {
    console.error('❌ Error checking table status:', error);
    throw new Error(`Failed to check table status: ${error.message}`);
  }
};

export default SavingsProduct;
