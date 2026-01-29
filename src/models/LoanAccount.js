// models/LoanAccount.js
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
      field: 'a_c_c_t__n_o'
    },
    ACCT_NM: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'a_c_c_t__n_m'
    },
    CUST_ID: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'c_u_s_t__i_d'
    },
    LOAN_PRODUCT_ID: {
      type: DataTypes.INTEGER,
      field: 'l_o_a_n__p_r_o_d_u_c_t__i_d'
    },
    AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      field: 'a_m_o_u_n_t'
    },
    DISBURSED_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'd_i_s_b_u_r_s_e_d__a_m_o_u_n_t'
    },
    OUTSTANDING_PRINCIPAL: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l'
    },
    ACCRUED_INTEREST: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'a_c_c_r_u_e_d__i_n_t_e_r_e_s_t'
    },
    PENALTY_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'p_e_n_a_l_t_y__a_m_o_u_n_t'
    },
    INTEREST_RATE: {
      type: DataTypes.DECIMAL(10, 4),
      defaultValue: 0,
      field: 'i_n_t_e_r_e_s_t__r_a_t_e'
    },
    LOAN_STATUS: {
      type: DataTypes.STRING(50),
      defaultValue: 'PENDING',
      field: 'l_o_a_n__s_t_a_t_u_s'
    },
    SERVICING_STATUS: {
      type: DataTypes.STRING(50),
      defaultValue: 'SERVICED',
      field: 's_e_r_v_i_c_i_n_g__s_t_a_t_u_s'
    },
    APPLICATION_DATE: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'a_p_p_l_i_c_a_t_i_o_n__d_a_t_e'
    },
    APPROVAL_DATE: {
      type: DataTypes.DATE,
      field: 'a_p_p_r_o_v_a_l__d_a_t_e'
    },
    DISBURSEMENT_DATE: {
      type: DataTypes.DATE,
      field: 'd_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e'
    },
    CLOSURE_DATE: {
      type: DataTypes.DATE,
      field: 'c_l_o_s_u_r_e__d_a_t_e'
    },
    LAST_REPAYMENT_DATE: {
      type: DataTypes.DATE,
      field: 'l_a_s_t__r_e_p_a_y_m_e_n_t__d_a_t_e'
    },
    LAST_REPAYMENT_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'l_a_s_t__r_e_p_a_y_m_e_n_t__a_m_o_u_n_t'
    },
    NEXT_PAYMENT_DATE: {
      type: DataTypes.DATE,
      field: 'n_e_x_t__p_a_y_m_e_n_t__d_a_t_e'
    },
    MATURITY_DT: {
      type: DataTypes.DATE,
      field: 'm_a_t_u_r_i_t_y__d_t'
    },
    TOTAL_REPAID_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 't_o_t_a_l__r_e_p_a_i_d__a_m_o_u_n_t'
    },
    TERM_CD: {
      type: DataTypes.STRING(20),
      defaultValue: 'MONTHLY',
      field: 't_e_r_m__c_d'
    },
    TERM_VALUE: {
      type: DataTypes.INTEGER,
      defaultValue: 12,
      field: 't_e_r_m__v_a_l_u_e'
    },
    CUSTOMER_ACCOUNT_ID: {
      type: DataTypes.BIGINT,
      field: 'c_u_s_t_o_m_e_r__a_c_c_o_u_n_t__i_d'
    },
    hasRepaymentSchedule: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'has_repayment_schedule'
    },
    repaymentScheduleId: {
      type: DataTypes.INTEGER,
      field: 'repayment_schedule_id'
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at'
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

// ==================== AUTO-INITIALIZATION ====================

// Auto-initialize on app startup (development only)
if (process.env.NODE_ENV === 'development' || process.env.AUTO_INIT_TABLES === 'true') {
  // Delay initialization to let app start
  setTimeout(async () => {
    try {
      console.log('🚀 Auto-initializing LoanAccount table...');
      await LoanAccount.ensureTableExists();
      console.log('✅ LoanAccount table ready');
    } catch (error) {
      console.warn('⚠️ Auto-initialization failed (will retry on first use):', error.message);
    }
  }, 2000);
}

export default LoanAccount;