// models/LoanAccount.js - FIXED VERSION (NO FIELD MAPPINGS)
import { DataTypes, Model, QueryTypes } from 'sequelize';
import sequelize from '../../config/db.js';

class LoanAccount extends Model {}

LoanAccount.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    ACCT_NO: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: 'Account number'
    },
    ACCT_NM: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Account name'
    },
    CUST_ID: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Customer identifier'
    },
    LOAN_PRODUCT_ID: {
      type: DataTypes.INTEGER,
      comment: 'Loan product identifier'
    },
    AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      comment: 'Loan amount'
    },
    DISBURSED_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      comment: 'Amount disbursed'
    },
    OUTSTANDING_PRINCIPAL: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      comment: 'Outstanding principal balance'
    },
    ACCRUED_INTEREST: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      comment: 'Accrued interest'
    },
    PENALTY_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      comment: 'Penalty amount'
    },
    INTEREST_RATE: {
      type: DataTypes.DECIMAL(10, 4),
      defaultValue: 0,
      comment: 'Interest rate'
    },
    LOAN_STATUS: {
      type: DataTypes.STRING(50),
      defaultValue: 'PENDING',
      comment: 'Loan status'
    },
    SERVICING_STATUS: {
      type: DataTypes.STRING(50),
      defaultValue: 'SERVICED',
      comment: 'Servicing status'
    },
    APPLICATION_DATE: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'Application date'
    },
    APPROVAL_DATE: {
      type: DataTypes.DATE,
      comment: 'Approval date'
    },
    DISBURSEMENT_DATE: {
      type: DataTypes.DATE,
      comment: 'Disbursement date'
    },
    CLOSURE_DATE: {
      type: DataTypes.DATE,
      comment: 'Closure date'
    },
    LAST_REPAYMENT_DATE: {
      type: DataTypes.DATE,
      comment: 'Last repayment date'
    },
    LAST_REPAYMENT_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      comment: 'Last repayment amount'
    },
    NEXT_PAYMENT_DATE: {
      type: DataTypes.DATE,
      comment: 'Next payment date'
    },
    MATURITY_DT: {
      type: DataTypes.DATE,
      comment: 'Maturity date'
    },
    TOTAL_REPAID_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      comment: 'Total repaid amount'
    },
    TERM_CD: {
      type: DataTypes.STRING(20),
      defaultValue: 'MONTHLY',
      comment: 'Term code (M=Monthly, Y=Yearly)'
    },
    TERM_VALUE: {
      type: DataTypes.INTEGER,
      defaultValue: 12,
      comment: 'Term value (number of months/years)'
    },
    CUSTOMER_ACCOUNT_ID: {
      type: DataTypes.BIGINT,
      comment: 'Customer account identifier'
    },
    hasRepaymentSchedule: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Has repayment schedule'
    },
    repaymentScheduleId: {
      type: DataTypes.INTEGER,
      comment: 'Repayment schedule identifier'
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'Created at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'Updated at'
    }
  },
  {
    sequelize,
    modelName: 'LoanAccount',
    tableName: 'loan_accounts',
    timestamps: true,
    freezeTableName: true,
    // Add hooks for auto-initialization
    hooks: {
      beforeValidate: async (instance, options) => {
        if (!LoanAccount._tableChecked) {
          await LoanAccount.ensureTableExists();
          LoanAccount._tableChecked = true;
        }
      }
    }
  }
);

// ==================== SIMPLIFIED TABLE INITIALIZATION ====================

/**
 * Simple table initialization - creates only if doesn't exist
 */
LoanAccount.ensureTableExists = async function() {
  try {
    // Check if table exists
    const [result] = await sequelize.query(
      `SELECT COUNT(*) as tableExists FROM information_schema.tables 
       WHERE table_schema = DATABASE() AND table_name = 'loan_accounts'`,
      { type: QueryTypes.SELECT }
    );
    
    if (result.tableExists === 0) {
      console.log('📝 Creating loan_accounts table (first time)...');
      
      // Use Sequelize sync to create table (won't alter existing tables)
      await LoanAccount.sync({ force: false });
      console.log('✅ loan_accounts table created');
      
      return true;
    }
    
    console.log('✅ loan_accounts table already exists');
    return true;
    
  } catch (error) {
    console.error('❌ Error ensuring loan_accounts table:', error.message);
    
    // Try a simple sync as fallback
    try {
      await LoanAccount.sync({ force: false });
      console.log('✅ Table created via fallback sync');
      return true;
    } catch (syncError) {
      console.error('❌ Fallback sync also failed:', syncError.message);
      throw error;
    }
  }
};

/**
 * Safe sync with options
 */
LoanAccount.syncTable = async function(options = {}) {
  try {
    console.log('🔄 Syncing LoanAccount table...');
    
    if (options.force) {
      console.warn('⚠️ FORCE SYNC: This will drop and recreate the table (data loss!)');
      await LoanAccount.sync({ force: true });
      console.log('✅ Table force-synced');
    } else if (options.alter) {
      console.log('⚠️ ALTER SYNC: This will modify table structure');
      await LoanAccount.sync({ alter: true });
      console.log('✅ Table altered');
    } else {
      // Safe sync: create if doesn't exist, no modifications
      await LoanAccount.ensureTableExists();
      console.log('✅ Table ensured (safe)');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error syncing table:', error.message);
    throw error;
  }
};

// ==================== INSTANCE METHODS ====================

LoanAccount.prototype.getAccountNumber = function() {
  return this.ACCT_NO;
};

LoanAccount.prototype.getCustomerId = function() {
  return this.CUST_ID;
};

LoanAccount.prototype.getLoanStatus = function() {
  return this.LOAN_STATUS;
};

LoanAccount.prototype.getOutstandingPrincipal = function() {
  const value = parseFloat(this.OUTSTANDING_PRINCIPAL) || 0;
  return Math.abs(value);
};

LoanAccount.prototype.isActive = function() {
  return ['ACTIVE', 'DISBURSED', 'ONGOING'].includes(this.LOAN_STATUS);
};

LoanAccount.prototype.getFormattedOutstanding = function() {
  return this.getOutstandingPrincipal();
};

// ==================== STATIC METHODS ====================

LoanAccount.findByAccountNumber = async function(accountNumber) {
  // Auto-create table if needed
  if (!this._tableChecked) {
    await this.ensureTableExists();
    this._tableChecked = true;
  }
  return await this.findOne({
    where: { ACCT_NO: accountNumber }
  });
};

LoanAccount.findByCustomerId = async function(customerId) {
  if (!this._tableChecked) {
    await this.ensureTableExists();
    this._tableChecked = true;
  }
  return await this.findAll({
    where: { CUST_ID: customerId }
  });
};

// ==================== ADDITIONAL HELPER METHODS ====================

/**
 * Find loan account with fallback search
 */
LoanAccount.findByAccountNumberFlexible = async function(accountNumber) {
  try {
    // Try direct search first
    const account = await this.findByAccountNumber(accountNumber);
    if (account) return account;
    
    // If not found, try raw SQL with different column names
    const results = await sequelize.query(
      `SELECT * FROM loan_accounts 
       WHERE ACCT_NO = ? 
          OR a_c_c_t__n_o = ? 
          OR acc_t__n_o = ? 
       LIMIT 1`,
      {
        replacements: [accountNumber, accountNumber, accountNumber],
        type: QueryTypes.SELECT
      }
    );
    
    if (results && results.length > 0) {
      // Convert raw result to model instance
      return this.build(results[0], { isNewRecord: false });
    }
    
    return null;
  } catch (error) {
    console.error('Error in findByAccountNumberFlexible:', error);
    return null;
  }
};

/**
 * Check and fix table structure
 */
LoanAccount.checkAndFixTableStructure = async function() {
  try {
    // Check if ACCT_NO column exists
    const columnCheck = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'loan_accounts' 
       AND COLUMN_NAME = 'ACCT_NO'`,
      { type: QueryTypes.SELECT }
    );
    
    if (columnCheck.length === 0) {
      console.log('⚠️ ACCT_NO column missing, checking for old column names...');
      
      // Check for old column names
      const oldColumns = await sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'loan_accounts' 
         AND (COLUMN_NAME LIKE '%acc%' OR COLUMN_NAME LIKE '%no%')`,
        { type: QueryTypes.SELECT }
      );
      
      console.log('Old account columns found:', oldColumns);
      
      // If we have an old column, rename it
      if (oldColumns.length > 0) {
        const oldColumn = oldColumns[0].COLUMN_NAME;
        console.log(`🔄 Renaming ${oldColumn} to ACCT_NO`);
        
        await sequelize.query(
          `ALTER TABLE loan_accounts CHANGE ${oldColumn} ACCT_NO VARCHAR(255)`
        );
        
        console.log('✅ Column renamed successfully');
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error checking table structure:', error);
    return false;
  }
};

// ==================== AUTO-INITIALIZATION ====================

// Auto-initialize on app startup (development only)
if (process.env.NODE_ENV === 'development' || process.env.AUTO_INIT_TABLES === 'true') {
  // Delay initialization to let app start
  setTimeout(async () => {
    try {
      console.log('🚀 Auto-initializing LoanAccount table...');
      await LoanAccount.ensureTableExists();
      
      // Check and fix table structure
      await LoanAccount.checkAndFixTableStructure();
      
      console.log('✅ LoanAccount table ready');
    } catch (error) {
      console.warn('⚠️ Auto-initialization failed (will retry on first use):', error.message);
    }
  }, 2000);
}

export default LoanAccount;