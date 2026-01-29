// models/SavingsProduct.js - FIXED VERSION
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class SavingsProduct extends Model {}

SavingsProduct.init({
  // ==================== PRIMARY KEY ====================
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
    field: 'id'
  },
  
  PROD_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    field: 'PROD_ID'
  },
  
  // ==================== CORE PRODUCT INFO ====================
  PROD_CD: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'PROD_CD'
  },
  
  PROD_DESC: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'PROD_DESC'
  },
  
  PRODUCT_TYPE: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'SAVINGS',
    field: 'PRODUCT_TYPE'
  },
  
  productCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'productCode'
  },
  
  productName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'productName'
  },
  
  productDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'productDescription'
  },
  
  // ==================== GL ACCOUNTS ====================
  principalBalanceGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '0000000000',
    field: 'principalBalanceGLAccountNo'
  },
  
  interestGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '0000000000',
    field: 'interestGLAccountNo'
  },
  
  interestPayableGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '0000000000',
    field: 'interestPayableGLAccountNo'
  },
  
  withholdingTaxGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '0000000000',
    field: 'withholdingTaxGLAccountNo'
  },
  
  interestExpenseGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'interestExpenseGLAccountNo'
  },
  
  depositChargeReceivableGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'depositChargeReceivableGLAccountNo'
  },
  
  // ==================== ADDITIONAL GL ACCOUNTS (snake_case in DB) ====================
  delinquentBalanceGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'delinquent_balance_gl_account_no'
  },
  
  dormantBalanceGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'dormant_balance_gl_account_no'
  },
  
  earmarkedBalanceGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'earmarked_balance_gl_account_no'
  },
  
  escheatedBalanceGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'escheated_balance_gl_account_no'
  },
  
  interestChequesGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'interest_cheques_gl_account_no'
  },
  
  interestIncomeGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'interest_income_gl_account_no'
  },
  
  interestReceivableGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'interest_receivable_gl_account_no'
  },
  
  interestSuspenseGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'interest_suspense_gl_account_no'
  },
  
  maturedBalanceGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'matured_balance_gl_account_no'
  },
  
  maturityChequesGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'maturity_cheques_gl_account_no'
  },
  
  nonAccrualBalanceGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'non_accrual_balance_gl_account_no'
  },
  
  overdrawnBalanceGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'overdrawn_balance_gl_account_no'
  },
  
  preDormantBalanceGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'pre_dormant_balance_gl_account_no'
  },
  
  provisionReserveGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'provision_reserve_gl_account_no'
  },
  
  provisionExpenseGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'provision_expense_gl_account_no'
  },
  
  rejectedCreditSuspenseGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'rejected_credit_suspense_gl_account_no'
  },
  
  rejectedDebitSuspenseGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'rejected_debit_suspense_gl_account_no'
  },
  
  reservedBalanceGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'reserved_balance_gl_account_no'
  },
  
  unclearedBalanceGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'uncleared_balance_gl_account_no'
  },
  
  writeOffBalanceGLAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'write_off_balance_gl_account_no'
  },
  
  // ==================== RATE INFORMATION ====================
  rateType: {
    type: DataTypes.STRING(50),
    defaultValue: 'FIXED',
    field: 'rateType'
  },
  
  fixedRate: {
    type: DataTypes.DECIMAL(10, 4),
    defaultValue: 0.0,
    field: 'fixedRate'
  },
  
  effectiveRate: {
    type: DataTypes.DECIMAL(10, 4),
    defaultValue: 0.0,
    field: 'effectiveRate'
  },
  
  effectiveDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'effectiveDate'
  },
  
  // ==================== SETTLEMENT INFORMATION ====================
  settlementFrequency: {
    type: DataTypes.STRING(50),
    defaultValue: 'MONTHLY',
    field: 'settlementFrequency'
  },
  
  principalSettlementMethod: {
    type: DataTypes.STRING(50),
    defaultValue: 'ACCOUNT',
    field: 'principalSettlementMethod'
  },
  
  interestSettlementMethod: {
    type: DataTypes.STRING(50),
    defaultValue: 'ACCOUNT',
    field: 'interestSettlementMethod'
  },
  
  // ==================== ACCRUAL INFORMATION ====================
  accrualFrequency: {
    type: DataTypes.STRING(50),
    defaultValue: 'DAILY',
    field: 'accrualFrequency'
  },
  
  accrualBasis: {
    type: DataTypes.STRING(50),
    defaultValue: 'ACTUAL_DAYS/ACTUAL_DAYS',
    field: 'accrualBasis'
  },
  
  // ==================== JSON FIELDS (LONGTEXT in DB) ====================
  rateInformation: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'rateInformation',
    get() {
      const value = this.getDataValue('rateInformation');
      try {
        return value ? JSON.parse(value) : {};
      } catch {
        return {};
      }
    },
    set(value) {
      this.setDataValue('rateInformation', 
        typeof value === 'string' ? value : JSON.stringify(value || {})
      );
    }
  },
  
  settlementInformation: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'settlementInformation',
    get() {
      const value = this.getDataValue('settlementInformation');
      try {
        return value ? JSON.parse(value) : {};
      } catch {
        return {};
      }
    },
    set(value) {
      this.setDataValue('settlementInformation', 
        typeof value === 'string' ? value : JSON.stringify(value || {})
      );
    }
  },
  
  accrualInformation: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'accrualInformation',
    get() {
      const value = this.getDataValue('accrualInformation');
      try {
        return value ? JSON.parse(value) : {};
      } catch {
        return {};
      }
    },
    set(value) {
      this.setDataValue('accrualInformation', 
        typeof value === 'string' ? value : JSON.stringify(value || {})
      );
    }
  },
  
  chargesSetup: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'chargesSetup',
    get() {
      const value = this.getDataValue('chargesSetup');
      try {
        return value ? JSON.parse(value) : [];
      } catch {
        return [];
      }
    },
    set(value) {
      this.setDataValue('chargesSetup', 
        typeof value === 'string' ? value : JSON.stringify(value || [])
      );
    }
  },
  
  metadata: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'metadata',
    get() {
      const value = this.getDataValue('metadata');
      try {
        return value ? JSON.parse(value) : {};
      } catch {
        return {};
      }
    },
    set(value) {
      this.setDataValue('metadata', 
        typeof value === 'string' ? value : JSON.stringify(value || {})
      );
    }
  },
  
  // ==================== PRODUCT CONFIGURATION ====================
  CRNCY_ID: {
    type: DataTypes.STRING(10),
    defaultValue: 'NGN',
    field: 'CRNCY_ID'
  },
  
  START_DT: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'START_DT'
  },
  
  REC_ST: {
    type: DataTypes.STRING(20),
    defaultValue: 'Active',
    field: 'REC_ST'
  },
  
  BU_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'BU_ID'
  },
  
  // ==================== ADDITIONAL FIELDS ====================
  PROD_CAT_TY: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'PROD_CAT_TY'
  },
  
  PROD_DESIGN_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'PROD_DESIGN_ID'
  },
  
  MIN_AGE_YEAR: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'MIN_AGE_YEAR'
  },
  
  STMNT_FREQ_CD: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'STMNT_FREQ_CD'
  },
  
  STMNT_FREQ_VALUE: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'STMNT_FREQ_VALUE'
  },
  
  ACCT_CYCLE_CD: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'ACCT_CYCLE_CD'
  },
  
  ACCT_CYCLE_VALUE: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'ACCT_CYCLE_VALUE'
  },
  
  ACCT_AUTH_BUS_PROD_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'ACCT_AUTH_BUS_PROD_ID'
  },
  
  VERSION_NO: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'VERSION_NO'
  },
  
  // ==================== AUDIT FIELDS ====================
  CREATED_BY: {
    type: DataTypes.STRING(100),
    defaultValue: 'system',
    field: 'CREATED_BY'
  },
  
  USER_ID: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'USER_ID'
  },
  
  // ==================== TIMESTAMPS ====================
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  sequelize,
  modelName: 'SavingsProduct',
  tableName: 'savings_products',
  timestamps: true,
  underscored: false,
  freezeTableName: true
});

// ==================== STATIC METHODS ====================

/**
 * Helper function to create the table if it doesn't exist
 */
SavingsProduct.createTableIfNotExists = async function() {
  try {
    // Check if table exists
    const [tables] = await sequelize.query(
      "SHOW TABLES LIKE 'savings_products'"
    );
    
    if (tables.length === 0) {
      console.log('📦 Creating savings_products table...');
      
      await sequelize.query(`
        CREATE TABLE savings_products (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          PROD_ID INT NOT NULL UNIQUE,
          PROD_CD VARCHAR(50) NOT NULL,
          PROD_DESC VARCHAR(255) NOT NULL,
          PRODUCT_TYPE VARCHAR(50) NOT NULL DEFAULT 'SAVINGS',
          productCode VARCHAR(50) NOT NULL UNIQUE,
          productName VARCHAR(100) NOT NULL,
          productDescription TEXT,
          principalBalanceGLAccountNo VARCHAR(50) NOT NULL DEFAULT '0000000000',
          interestGLAccountNo VARCHAR(50) NOT NULL DEFAULT '0000000000',
          interestPayableGLAccountNo VARCHAR(50) NOT NULL DEFAULT '0000000000',
          withholdingTaxGLAccountNo VARCHAR(50) NOT NULL DEFAULT '0000000000',
          interestExpenseGLAccountNo VARCHAR(50),
          depositChargeReceivableGLAccountNo VARCHAR(50),
          rateType VARCHAR(50) DEFAULT 'FIXED',
          fixedRate DECIMAL(10,4) DEFAULT 0.0,
          effectiveRate DECIMAL(10,4) DEFAULT 0.0,
          effectiveDate DATETIME DEFAULT CURRENT_TIMESTAMP,
          settlementFrequency VARCHAR(50) DEFAULT 'MONTHLY',
          principalSettlementMethod VARCHAR(50) DEFAULT 'ACCOUNT',
          interestSettlementMethod VARCHAR(50) DEFAULT 'ACCOUNT',
          accrualFrequency VARCHAR(50) DEFAULT 'DAILY',
          accrualBasis VARCHAR(50) DEFAULT 'ACTUAL_DAYS/ACTUAL_DAYS',
          rateInformation LONGTEXT,
          settlementInformation LONGTEXT,
          accrualInformation LONGTEXT,
          chargesSetup LONGTEXT,
          metadata LONGTEXT,
          CRNCY_ID VARCHAR(10) DEFAULT 'NGN',
          START_DT DATETIME DEFAULT CURRENT_TIMESTAMP,
          REC_ST VARCHAR(20) DEFAULT 'Active',
          BU_ID VARCHAR(50),
          PROD_CAT_TY VARCHAR(50),
          PROD_DESIGN_ID INT,
          MIN_AGE_YEAR INT,
          STMNT_FREQ_CD VARCHAR(50),
          STMNT_FREQ_VALUE INT,
          ACCT_CYCLE_CD VARCHAR(50),
          ACCT_CYCLE_VALUE INT,
          ACCT_AUTH_BUS_PROD_ID INT,
          VERSION_NO INT DEFAULT 1,
          CREATED_BY VARCHAR(100) DEFAULT 'system',
          USER_ID VARCHAR(100),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          delinquent_balance_gl_account_no VARCHAR(50),
          dormant_balance_gl_account_no VARCHAR(50),
          earmarked_balance_gl_account_no VARCHAR(50),
          escheated_balance_gl_account_no VARCHAR(50),
          interest_cheques_gl_account_no VARCHAR(50),
          interest_income_gl_account_no VARCHAR(50),
          interest_receivable_gl_account_no VARCHAR(50),
          interest_suspense_gl_account_no VARCHAR(50),
          matured_balance_gl_account_no VARCHAR(50),
          maturity_cheques_gl_account_no VARCHAR(50),
          non_accrual_balance_gl_account_no VARCHAR(50),
          overdrawn_balance_gl_account_no VARCHAR(50),
          pre_dormant_balance_gl_account_no VARCHAR(50),
          provision_reserve_gl_account_no VARCHAR(50),
          provision_expense_gl_account_no VARCHAR(50),
          rejected_credit_suspense_gl_account_no VARCHAR(50),
          rejected_debit_suspense_gl_account_no VARCHAR(50),
          reserved_balance_gl_account_no VARCHAR(50),
          uncleared_balance_gl_account_no VARCHAR(50),
          write_off_balance_gl_account_no VARCHAR(50)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      
      console.log('✅ savings_products table created successfully');
      return true;
    }
    
    console.log('✅ savings_products table already exists');
    return true;
    
  } catch (error) {
    console.error('❌ Error creating/updating savings_products table:', error.message);
    return false;
  }
};

/**
 * Initialize the table - call this during app startup
 */
SavingsProduct.initializeTable = async function() {
  try {
    await this.createTableIfNotExists();
    console.log('✅ SavingsProduct table initialization complete');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize SavingsProduct table:', error);
    return false;
  }
};

/**
 * Find by product code
 */
SavingsProduct.findByProductCode = async function(productCode) {
  return await this.findOne({
    where: {
      [sequelize.Op.or]: [
        { productCode },
        { PROD_CD: productCode }
      ]
    }
  });
};

export default SavingsProduct;