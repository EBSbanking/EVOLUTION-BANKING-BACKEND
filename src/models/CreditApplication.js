// models/CreditApplication.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class CreditApplication extends Model {
  // Static method: Generate application ID
  static async generateApplId() {
    const Counter = sequelize.models.Counter;
    const seq = await Counter.getNextSequence('creditAppId');
    const serialNumber = seq.toString().padStart(4, '0');
    return `CRAPP/${serialNumber}`;
  }

  // Static method: Generate reference number
  static async generateRefNo() {
    const Counter = sequelize.models.Counter;
    const seq = await Counter.getNextSequence('refNo');
    return seq.toString().padStart(8, '0');
  }

  // Static method: Generate credit application ID
  static async generateCreditApplicationId() {
    const Counter = sequelize.models.Counter;
    return await Counter.getNextSequence('creditApplicationId');
  }

  // Static method: Generate customer ID
  static async generateCustId() {
    const Counter = sequelize.models.Counter;
    return await Counter.getNextSequence('custId');
  }

  // Static method: Find pending applications
  static async findPending() {
    return this.findAll({
      where: { STATUS: 'PENDING' },
      order: [['APPL_DT', 'DESC']]
    });
  }

  // Static method: Find by customer ID
  static async findByCustomerId(customerId) {
    return this.findAll({
      where: { CUST_ID: customerId },
      order: [['CREATE_DT', 'DESC']]
    });
  }

  // Static method: Find by status
  static async findByStatus(status) {
    return this.findAll({
      where: { STATUS: status },
      order: [['CREATE_DT', 'DESC']]
    });
  }

  // Instance method: Approve application
  async approve(approvedBy, approvedLimit, comments = '') {
    this.STATUS = 'APPROVED';
    this.APPROVAL_DT = new Date();
    this.APPROVED_LIMIT_AMT = approvedLimit;
    this.APPROVED_BY = approvedBy;
    this.COMMENTS = comments || this.COMMENTS;
    
    return await this.save();
  }

  // Instance method: Reject application
  async reject(rejectedBy, reason = '') {
    this.STATUS = 'REJECTED';
    this.DECLINE_DT = new Date();
    this.REJECTED_BY = rejectedBy;
    this.REJECTION_REASON = reason;
    this.COMMENTS = reason || this.COMMENTS;
    
    return await this.save();
  }

  // Instance method: Get application summary
  getSummary() {
    return {
      applicationId: this.creditApplicationId,
      applicationNumber: this.APPL_ID,
      customerName: this.CUST_NM,
      customerId: this.CUST_ID,
      product: this.PRODUCT,
      appliedAmount: this.PRIME_LIMIT_AMT,
      approvedAmount: this.APPROVED_LIMIT_AMT,
      status: this.STATUS,
      applyDate: this.APPL_DT,
      approvalDate: this.APPROVAL_DT,
      purpose: this.Purpose_of_Credit,
      referenceNumber: this.REF_NO
    };
  }

  // Instance method: Check if application is pending
  isPending() {
    return this.STATUS === 'PENDING';
  }

  // Instance method: Check if application is approved
  isApproved() {
    return this.STATUS === 'APPROVED';
  }

  // Instance method: Check if application is rejected
  isRejected() {
    return this.STATUS === 'REJECTED';
  }

  // Virtual getter: Formatted apply date
  get formattedApplyDate() {
    return this.APPL_DT ? this.APPL_DT.toLocaleString() : 'N/A';
  }

  // Virtual getter: Formatted approval date
  get formattedApprovalDate() {
    return this.APPROVAL_DT ? this.APPROVAL_DT.toLocaleString() : 'N/A';
  }

  // Virtual getter: Formatted create date
  get formattedCreateDate() {
    return this.CREATE_DT ? this.CREATE_DT.toLocaleString() : 'N/A';
  }
}

CreditApplication.init({
  // Primary ID
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  creditApplicationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    field: 'credit_application_id',
    comment: 'Numeric credit application ID'
  },
  
  CUST_NM: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'c_u_s_t__n_m',
    comment: 'Customer name'
  },
  
  CUST_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'c_u_s_t__i_d',
    comment: 'Customer ID'
  },
  
  PRODUCT: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'p_r_o_d_u_c_t',
    comment: 'Product name'
  },
  
  ACCT_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'a_c_c_t__i_d',
    comment: 'Account ID'
  },
  
  ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'a_c_c_t__n_o',
    comment: 'Account number'
  },
  
  APPL_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'a_p_p_l__d_t',
    comment: 'Application date'
  },
  
  APPL_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'a_p_p_l__i_d',
    comment: 'Application ID (formatted)'
  },
  
  PROD_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'p_r_o_d__i_d',
    comment: 'Product ID'
  },
  
  APPROVAL_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'a_p_p_r_o_v_a_l__d_t',
    comment: 'Approval date'
  },
  
  APPROVED_CRNCY_ID: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'a_p_p_r_o_v_e_d__c_r_n_c_y__i_d',
    comment: 'Approved currency ID'
  },
  
  APPROVED_CR_REQD_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'a_p_p_r_o_v_e_d__c_r__r_e_q_d__d_t',
    comment: 'Approved credit required date'
  },
  
  APPROVED_EXPIRY_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'a_p_p_r_o_v_e_d__e_x_p_i_r_y__d_t',
    comment: 'Approved expiry date'
  },
  
  APPROVED_LIMIT_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'a_p_p_r_o_v_e_d__l_i_m_i_t__a_m_t',
    comment: 'Approved limit amount'
  },
  
  APPROVED_TERM_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'a_p_p_r_o_v_e_d__t_e_r_m__c_d',
    comment: 'Approved term code'
  },
  
  APPROVED_TERM_VALUE: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'a_p_p_r_o_v_e_d__t_e_r_m__v_a_l_u_e',
    comment: 'Approved term value'
  },
  
  BANK_OFFICER_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'b_a_n_k__o_f_f_i_c_e_r__i_d',
    comment: 'Bank officer ID'
  },
  
  BU_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'b_u__i_d',
    comment: 'Business unit ID'
  },
  
  // FIXED: Borrower address with JSON serialization
  Borrower_address: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '{}',
    field: 'borrower_address',
    comment: 'Borrower address information',
    get() {
      const rawValue = this.getDataValue('Borrower_address');
      try {
        return rawValue ? JSON.parse(rawValue) : {};
      } catch (e) {
        console.warn('Failed to parse Borrower_address JSON:', e.message);
        return {};
      }
    },
    set(value) {
      if (value && typeof value === 'object') {
        this.setDataValue('Borrower_address', JSON.stringify(value));
      } else if (typeof value === 'string') {
        // Try to parse to validate it's valid JSON
        try {
          JSON.parse(value);
          this.setDataValue('Borrower_address', value);
        } catch (e) {
          // If not valid JSON, store as empty object
          console.warn('Invalid JSON string for Borrower_address');
          this.setDataValue('Borrower_address', '{}');
        }
      } else {
        this.setDataValue('Borrower_address', '{}');
      }
    }
  },
  
  COMMENTS: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'c_o_m_m_e_n_t_s',
    comment: 'Comments'
  },
  
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'c_r_e_a_t_e__d_t',
    comment: 'Create date'
  },
  
  CREATED_BY: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'c_r_e_a_t_e_d__b_y',
    comment: 'Created by user'
  },
  
  CRNCY_ID: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'c_r_n_c_y__i_d',
    comment: 'Currency ID'
  },
  
  CR_REQD_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'c_r__r_e_q_d__d_t',
    comment: 'Credit required date'
  },
  
  CR_TY_ID: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'c_r__t_y__i_d',
    comment: 'Credit type ID'
  },
  
  CR_UTILISATION_MTHD_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'c_r__u_t_i_l_i_s_a_t_i_o_n__m_t_h_d__c_d',
    comment: 'Credit utilisation method code'
  },
  
  Credit_Type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'LOAN',
    field: 'credit__type',
    comment: 'Credit type'
  },
  
  DECLINE_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'd_e_c_l_i_n_e__d_t',
    comment: 'Decline date'
  },
  
  EXPIRY_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'e_x_p_i_r_y__d_t',
    comment: 'Expiry date'
  },
  
  INDUSTRY_ID: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'i_n_d_u_s_t_r_y__i_d',
    comment: 'Industry ID'
  },
  
  LOAN_CYCLE: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'l_o_a_n__c_y_c_l_e',
    comment: 'Loan cycle number'
  },
  
  MULTI_CRNCY_FG: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'm_u_l_t_i__c_r_n_c_y__f_g',
    comment: 'Multi-currency flag'
  },
  
  OVERDRAFT_ACCT_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'o_v_e_r_d_r_a_f_t__a_c_c_t__i_d',
    comment: 'Overdraft account ID'
  },
  
  PORTFOLIO_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'p_o_r_t_f_o_l_i_o__i_d',
    comment: 'Portfolio ID'
  },
  
  PRIME_LIMIT_AMT: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'p_r_i_m_e__l_i_m_i_t__a_m_t',
    comment: 'Prime limit amount'
  },
  
  Product_Combination: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'product__combination',
    comment: 'Product combination'
  },
  
  PROD_COMB_OPTION: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'p_r_o_d__c_o_m_b__o_p_t_i_o_n',
    comment: 'Product combination option'
  },
  
  Purpose_of_Credit: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: 'GENERAL LOAN',
    field: 'purpose_of__credit',
    comment: 'Purpose of credit'
  },
  
  REC_ST: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'active',
    field: 'r_e_c__s_t',
    comment: 'Record status'
  },
  
  REF_NO: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'r_e_f__n_o',
    comment: 'Reference number'
  },
  
  REPAY_SRC_ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'r_e_p_a_y__s_r_c__a_c_c_t__n_o',
    comment: 'Repayment source account number'
  },
  
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'r_o_w__t_s',
    comment: 'Row timestamp'
  },
  
  RSN_ID: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'r_s_n__i_d',
    comment: 'Reason ID'
  },
  
  SECONDARY_BANK_OFFICER_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 's_e_c_o_n_d_a_r_y__b_a_n_k__o_f_f_i_c_e_r__i_d',
    comment: 'Secondary bank officer ID'
  },
  
  INDEX_RATE_ID: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'i_n_d_e_x__r_a_t_e__i_d',
    comment: 'Index rate ID'
  },
  
  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 's_y_s__c_r_e_a_t_e__t_s',
    comment: 'System create timestamp'
  },
  
  TERM_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    field: 't_e_r_m__c_d',
    comment: 'Term code'
  },
  
  TERM_VALUE: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 't_e_r_m__v_a_l_u_e',
    comment: 'Term value'
  },
  
  USER_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'u_s_e_r__i_d',
    comment: 'User ID'
  },
  
  VALIDITY_EXPIRATION_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'v_a_l_i_d_i_t_y__e_x_p_i_r_a_t_i_o_n__d_t',
    comment: 'Validity expiration date'
  },
  
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'v_e_r_s_i_o_n__n_o',
    comment: 'Version number'
  },
  
  TRANSACTION_TYPE: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 't_r_a_n_s_a_c_t_i_o_n__t_y_p_e',
    comment: 'Transaction type'
  },
  
  LOAN_CYCLE_START_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'l_o_a_n__c_y_c_l_e__s_t_a_r_t__d_t',
    comment: 'Loan cycle start date'
  },
  
  STATUS: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'PENDING',
    field: 's_t_a_t_u_s',
    validate: {
      isIn: [['PENDING', 'APPROVED', 'REJECTED']]
    },
    comment: 'Application status'
  },
  
  // Additional fields for rejection
  REJECTED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'r_e_j_e_c_t_e_d__b_y',
    comment: 'Rejected by user'
  },
  
  REJECTION_REASON: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'r_e_j_e_c_t_i_o_n__r_e_a_s_o_n',
    comment: 'Rejection reason'
  },
  
  APPROVED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'a_p_p_r_o_v_e_d__b_y',
    comment: 'Approved by user'
  }
}, {
  sequelize,
  modelName: 'CreditApplication',
  tableName: 'credit_applications',
  timestamps: false, // Using custom timestamp fields
  underscored: false, // Keep as false since we're explicitly defining fields
  freezeTableName: true, // Don't pluralize table names
  hooks: {
    beforeCreate: async (application) => {
      // Generate credit application ID if not provided
      if (!application.creditApplicationId) {
        application.creditApplicationId = await CreditApplication.generateCreditApplicationId();
      }

      // Generate customer ID if not provided
      if (!application.CUST_ID) {
        application.CUST_ID = await CreditApplication.generateCustId();
      }

      // Generate application ID if not provided
      if (!application.APPL_ID) {
        application.APPL_ID = await CreditApplication.generateApplId();
      }

      // Generate reference number if not provided
      if (!application.REF_NO) {
        application.REF_NO = await CreditApplication.generateRefNo();
      }

      // Set application-specific fields for pending applications
      if (application.STATUS === 'PENDING') {
        application.Credit_Type = application.Credit_Type || 'LOAN';
        application.Purpose_of_Credit = application.Purpose_of_Credit || 'GENERAL LOAN';
        application.PRIME_LIMIT_AMT = application.PRIME_LIMIT_AMT || '1000000';
        application.APPROVAL_DT = null;
        application.APPROVED_LIMIT_AMT = null;
      }

      // Set customer name if not provided
      if (!application.CUST_NM) {
        application.CUST_NM = 'Unknown Borrower';
      }

      // FIXED: Ensure Borrower_address is a valid JSON string
      if (!application.Borrower_address) {
        application.Borrower_address = '{}';
      } else if (typeof application.Borrower_address === 'object') {
        // If it's an object, stringify it
        application.Borrower_address = JSON.stringify(application.Borrower_address);
      }
    },
    
    beforeUpdate: (application) => {
      // Update ROW_TS on every update
      application.ROW_TS = new Date();
      
      // Increment version number on update
      if (application.changed() && !application.changed('VERSION_NO')) {
        application.VERSION_NO = (application.VERSION_NO || 0) + 1;
      }
    }
  },
  indexes: [
    // Primary search indexes
    { fields: ['APPL_ID'], unique: true },
    { fields: ['creditApplicationId'], unique: true },
    { fields: ['CUST_ID'] },
    { fields: ['CUST_NM'] },
    { fields: ['STATUS'] },
    { fields: ['CREATED_BY'] },
    { fields: ['BU_ID'] },
    { fields: ['PROD_ID'] },
    
    // Composite indexes for common queries
    { fields: ['STATUS', 'APPL_DT'] },
    { fields: ['CUST_ID', 'CREATE_DT'] },
    { fields: ['BU_ID', 'STATUS'] },
    { fields: ['APPL_DT', 'STATUS'] },
    
    // Search indexes
    { fields: ['REF_NO'] },
    { fields: ['ACCT_NO'] },
    { fields: ['PRODUCT'] }
  ],
  scopes: {
    pending: {
      where: { STATUS: 'PENDING' }
    },
    approved: {
      where: { STATUS: 'APPROVED' }
    },
    rejected: {
      where: { STATUS: 'REJECTED' }
    },
    active: {
      where: { REC_ST: 'active' }
    },
    byCustomer: (customerId) => ({
      where: { CUST_ID: customerId }
    }),
    byProduct: (productId) => ({
      where: { PROD_ID: productId }
    }),
    byBusinessUnit: (buId) => ({
      where: { BU_ID: buId }
    }),
    recent: {
      order: [['CREATE_DT', 'DESC']],
      limit: 100
    },
    withApprovals: {
      // Can be extended with includes when needed
    }
  }
});

export default CreditApplication;