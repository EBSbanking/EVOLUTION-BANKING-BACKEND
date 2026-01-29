// models/LoanDisbursement.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class LoanDisbursement extends Model {
  // Static methods
  static async findByAccountNumber(accountNumber) {
    return this.findOne({ where: { ACCT_NO: accountNumber } });
  }

  static async findByApplicationId(applicationId) {
    return this.findAll({ where: { APPL_ID: applicationId } });
  }

  static async findByStatus(status) {
    return this.findAll({ where: { STATUS: status } });
  }

  static async findByLoanAccountId(loanAccountId) {
    return this.findOne({ where: { LOAN_ACCOUNT_ID: loanAccountId } });
  }

  // Instance method to update status
  async updateStatus(newStatus) {
    this.STATUS = newStatus;
    return this.save();
  }

  // Instance method to get formatted amount
  get formattedAmount() {
    const amount = parseFloat(this.AMOUNT || 0);
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: this.CRNCY_ID || 'NGN'
    }).format(amount);
  }
}

LoanDisbursement.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  
  // Core Identification Fields with field mappings
  ACCT_NO: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    field: 'a_c_c_t__n_o'  // Map to actual column name
  },
  
  APPL_ID: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'a_p_p_l__i_d'
  },
  
  CUST_ID: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'c_u_s_t__i_d'
  },
  
  // Loan Details
  INTEREST_RATE: {
    type: DataTypes.DECIMAL(7, 4),
    allowNull: false,
    field: 'i_n_t_e_r_e_s_t__r_a_t_e'
  },
  
  TERM_VALUE: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 't_e_r_m__v_a_l_u_e'
  },
  
  TERM_CD: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 't_e_r_m__c_d'
  },
  
  AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    field: 'a_m_o_u_n_t'
  },
  
  CALCULATION_METHOD: {
    type: DataTypes.ENUM('FLAT_RATE', 'DECLINING_BALANCE'),
    allowNull: false,
    defaultValue: 'FLAT_RATE',
    field: 'c_a_l_c_u_l_a_t_i_o_n__m_e_t_h_o_d'
  },
  
  PAYMENT_FREQUENCY: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'p_a_y_m_e_n_t__f_r_e_q_u_e_n_c_y'
  },
  
  // Financial Summary
  EMI_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    field: 'e_m_i__a_m_o_u_n_t'
  },
  
  TOTAL_INTEREST: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    field: 't_o_t_a_l__i_n_t_e_r_e_s_t'
  },
  
  TOTAL_REPAYMENT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    field: 't_o_t_a_l__r_e_p_a_y_m_e_n_t'
  },
  
  // References to other documents
  LOAN_ACCOUNT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'l_o_a_n__a_c_c_o_u_n_t__i_d'
  },
  
  CREDIT_APPLICATION_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'c_r_e_d_i_t__a_p_p_l_i_c_a_t_i_o_n__i_d'
  },
  
  REPAYMENT_SCHEDULE_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'r_e_p_a_y_m_e_n_t__s_c_h_e_d_u_l_e__i_d'
  },
  
  GUARANTOR_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'g_u_a_r_a_n_t_o_r__i_d'
  },
  
  // Transaction and Workflow IDs
  TRANSACTION_ID: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 't_r_a_n_s_a_c_t_i_o_n__i_d'
  },
  
  EVENT_ID: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'e_v_e_n_t__i_d'
  },
  
  JOURNAL_ID: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'j_o_u_r_n_a_l__i_d'
  },
  
  // Product Information
  PROD_ID: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'p_r_o_d__i_d'
  },
  
  PRODUCT_TYPE: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'p_r_o_d_u_c_t__t_y_p_e'
  },
  
  // Account Information
  ACCT_NM: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'a_c_c_t__n_m'
  },
  
  CRNCY_ID: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'NGN',
    field: 'c_r_n_c_y__i_d'
  },
  
  BU_ID: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'b_u__i_d'
  },
  
  // Officer Information
  PRIMARY_OFFICER_ID: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'p_r_i_m_a_r_y__o_f_f_i_c_e_r__i_d'
  },
  
  REPAY_SRC_ACCT_NO: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'r_e_p_a_y__s_r_c__a_c_c_t__n_o'
  },
  
  // Dates
  START_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 's_t_a_r_t__d_t'
  },
  
  MATURITY_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'm_a_t_u_r_i_t_y__d_t'
  },
  
  // JSON Fields
  borrower_address: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
    field: 'borrower_address'
  },
  
  guarantor_details: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
    field: 'guarantor_details'
  },
  
  interest_rate_details: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
    field: 'interest_rate_details'
  },
  
  // Status and Metadata
  STATUS: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'ACTIVE', 'REJECTED', 'DISBURSED', 'COMPLETED'),
    allowNull: false,
    defaultValue: 'PENDING',
    field: 's_t_a_t_u_s'
  },
  
  CREATED_BY: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'c_r_e_a_t_e_d__b_y'
  },
  
  // Disbursement Details
  DISBURSEMENT_TYPE: {
    type: DataTypes.ENUM('CUSTOMER_ACCOUNT', 'CASH', 'BANK_TRANSFER'),
    allowNull: false,
    defaultValue: 'CUSTOMER_ACCOUNT',
    field: 'd_i_s_b_u_r_s_e_m_e_n_t__t_y_p_e'
  },
  
  FEES_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'f_e_e_s__a_m_o_u_n_t'
  },
  
  UPFRONT_INTEREST_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'u_p_f_r_o_n_t__i_n_t_e_r_e_s_t__a_m_o_u_n_t'
  },
  
  NET_DISBURSEMENT_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    field: 'n_e_t__d_i_s_b_u_r_s_e_m_e_n_t__a_m_o_u_n_t'
  },
  
  // Additional Metadata
  metadata: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
    field: 'metadata'
  },
  
  // Sequelize timestamps
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
  modelName: 'LoanDisbursement',
  tableName: 'loan_disbursements',  // Explicit lowercase table name
  timestamps: true,
  underscored: false,
  freezeTableName: true,  // This prevents Sequelize from pluralizing
  name: {
    singular: 'LoanDisbursement',
    plural: 'LoanDisbursements'
  },
  hooks: {
    beforeCreate: (disbursement) => {
      // Calculate NET_DISBURSEMENT_AMOUNT if not provided
      if (!disbursement.NET_DISBURSEMENT_AMOUNT) {
        const amount = parseFloat(disbursement.AMOUNT || 0);
        const fees = parseFloat(disbursement.FEES_AMOUNT || 0);
        const upfrontInterest = parseFloat(disbursement.UPFRONT_INTEREST_AMOUNT || 0);
        const netAmount = amount - fees - upfrontInterest;
        disbursement.NET_DISBURSEMENT_AMOUNT = Math.max(0, netAmount);
      }
      
      // Ensure JSON fields have proper defaults
      if (!disbursement.borrower_address || typeof disbursement.borrower_address !== 'object') {
        disbursement.borrower_address = {};
      }
      
      if (!disbursement.guarantor_details || typeof disbursement.guarantor_details !== 'object') {
        disbursement.guarantor_details = {};
      }
      
      if (!disbursement.interest_rate_details || typeof disbursement.interest_rate_details !== 'object') {
        disbursement.interest_rate_details = {};
      }
      
      if (!disbursement.metadata || typeof disbursement.metadata !== 'object') {
        disbursement.metadata = {};
      }
    },
    
    beforeUpdate: (disbursement) => {
      // Calculate NET_DISBURSEMENT_AMOUNT if relevant fields changed
      if (disbursement.changed('AMOUNT') || disbursement.changed('FEES_AMOUNT') || disbursement.changed('UPFRONT_INTEREST_AMOUNT')) {
        const amount = parseFloat(disbursement.AMOUNT || 0);
        const fees = parseFloat(disbursement.FEES_AMOUNT || 0);
        const upfrontInterest = parseFloat(disbursement.UPFRONT_INTEREST_AMOUNT || 0);
        const netAmount = amount - fees - upfrontInterest;
        disbursement.NET_DISBURSEMENT_AMOUNT = Math.max(0, netAmount);
      }
    }
  },
  indexes: [
    // FIXED: Use actual column names in indexes
    {
      unique: true,
      fields: ['ACCT_NO'],  // Model property name
      name: 'idx_acct_no_unique'
    },
    {
      fields: ['APPL_ID'],
      name: 'idx_appl_id'
    },
    {
      fields: ['CUST_ID'],
      name: 'idx_cust_id'
    },
    {
      fields: ['LOAN_ACCOUNT_ID'],
      name: 'idx_loan_acct_id'
    },
    {
      fields: ['GUARANTOR_ID'],
      name: 'idx_guarantor_id'
    },
    {
      fields: ['TRANSACTION_ID'],
      name: 'idx_transaction_id'
    },
    {
      fields: ['EVENT_ID'],
      name: 'idx_event_id'
    },
    {
      fields: ['PROD_ID'],
      name: 'idx_prod_id'
    },
    {
      fields: ['STATUS'],
      name: 'idx_status'
    },
    {
      fields: ['CREATED_BY'],
      name: 'idx_created_by'
    },
    {
      fields: ['createdAt'],
      name: 'idx_created_at'
    },
    {
      fields: ['TERM_CD'],
      name: 'idx_term_cd'
    },
    {
      fields: ['PRODUCT_TYPE'],
      name: 'idx_product_type'
    },
    {
      fields: ['CRNCY_ID'],
      name: 'idx_crncy_id'
    },
    {
      fields: ['BU_ID'],
      name: 'idx_bu_id'
    },
    {
      fields: ['PRIMARY_OFFICER_ID'],
      name: 'idx_primary_officer'
    }
  ]
});

// Define associations
LoanDisbursement.associate = (models) => {
  if (models.LoanAccount) {
    LoanDisbursement.belongsTo(models.LoanAccount, {
      foreignKey: 'LOAN_ACCOUNT_ID',
      as: 'loanAccount',
      constraints: false
    });
  }
  
  if (models.RepaymentSchedule) {
    LoanDisbursement.belongsTo(models.RepaymentSchedule, {
      foreignKey: 'REPAYMENT_SCHEDULE_ID',
      as: 'repaymentSchedule',
      constraints: false
    });
  }
  
  if (models.Guarantor) {
    LoanDisbursement.belongsTo(models.Guarantor, {
      foreignKey: 'GUARANTOR_ID',
      as: 'guarantor',
      constraints: false
    });
  }
  
  if (models.Customer) {
    LoanDisbursement.belongsTo(models.Customer, {
      foreignKey: 'CUST_ID',
      targetKey: 'CUST_ID',
      as: 'customer',
      constraints: false
    });
  }
};

export default LoanDisbursement;