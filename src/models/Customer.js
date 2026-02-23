// src/models/Customer.js - COMPLETE UPDATED VERSION WITH STATIC METHODS
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

// Define the Customer class that extends Model
class Customer extends Model {}

Customer.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id'
    },

    CUST_ID: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'CUST_ID'
    },

    CUST_NO: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'CUST_NO'
    },

    TITLE_ID: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'TITLE_ID'
    },

    FIRST_NAME: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'FIRST_NAME'
    },

    MIDDLE_NAME: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'MIDDLE_NAME'
    },

    LAST_NAME: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'LAST_NAME'
    },

    CUST_NM: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'CUST_NM'
    },

    HOME_ADDRESS: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'HOME_ADDRESS'
    },

    EMAIL_ADDRESS: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: { isEmail: true },
      field: 'EMAIL_ADDRESS'
    },

    BU_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'BU_ID'
    },

    MAIDEN_NM: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'MAIDEN_NM'
    },

    BIRTH_DT: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'BIRTH_DT'
    },

    CNTRY_OF_BIRTH_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'CNTRY_OF_BIRTH_ID'
    },

    CUST_CAT: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'CUST_CAT'
    },

    CAMPAIGN_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'CAMPAIGN_ID'
    },

    GENDER_TY: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'GENDER_TY'
    },

    COUNTRY_NM: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'COUNTRY_NM'
    },

    STATE: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'STATE'
    },

    NIN: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'NIN'
    },

    BVN: {
      type: DataTypes.STRING(11),
      allowNull: true,
      field: 'BVN',
      validate: {
        len: [0, 11]
      }
    },

    BVN_VERIFIED: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      field: 'BVN_VERIFIED'
    },

    BVN_VERIFIED_AT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'BVN_VERIFIED_AT'
    },

    LOCAL_GOV: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'LOCAL_GOV'
    },

    OPENING_RSN_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'OPENING_RSN_ID'
    },

    OPENED_DT: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'OPENED_DT'
    },

    RESIDENT_CNTRY_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'RESIDENT_CNTRY_ID'
    },

    RISK_CLASS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'RISK_CLASS'
    },

    STMNT_FREQ_CD: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'STMNT_FREQ_CD'
    },

    STMNT_FREQ_VALUE: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'STMNT_FREQ_VALUE'
    },

    CREATED_BY: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'CREATED_BY'
    },

    USER_ID: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'USER_ID'
    },

    CREATE_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'CREATE_DT'
    },

    INDUSTRY_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'INDUSTRY_ID'
    },

    INDUSTRY_CD: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'INDUSTRY_CD'
    },

    TAX_STATUS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'TAX_STATUS'
    },

    MARITAL_ST: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'MARITAL_ST'
    },

    TAX_GRP_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'TAX_GRP_ID'
    },

    OPERATIONS_CRNCY_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'OPERATIONS_CRNCY_ID'
    },

    EMP_ST: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'EMP_ST'
    },

    ORGANISATION_NM: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'ORGANISATION_NM'
    },

    REGISTRATION_ADDRESS: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'REGISTRATION_ADDRESS'
    },

    REGISTRATION_DT: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'REGISTRATION_DT'
    },

    ALERT_DELIVERY_METHOD: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'ALERT_DELIVERY_METHOD'
    },

    KYC_LEVEL: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'KYC_LEVEL'
    },

    PHONE_NO: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'PHONE_NO'
    },

    SMS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Enabled',
      field: 'SMS'
    },

    IS_PEP: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      field: 'IS_PEP'
    },

    SANCTION_SCORE: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 10,
      field: 'SANCTION_SCORE'
    },

    DOCUMENT_VERIFICATION_STATUS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Pending',
      field: 'DOCUMENT_VERIFICATION_STATUS'
    },

    REC_ST: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'PENDING',
      field: 'REC_ST'
    },

    status: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Pending',
      field: 'status'
    },

    APPROVED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'APPROVED_BY'
    },

    APPROVED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'APPROVED_DT'
    },

    SUSPENDED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'SUSPENDED_BY'
    },

    SUSPENDED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'SUSPENDED_DT'
    },

    CLOSED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'CLOSED_BY'
    },

    CLOSED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'CLOSED_DT'
    },

    REJECTED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'REJECTED_BY'
    },

    REJECTED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'REJECTED_DT'
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },

    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    },
  },
  {
    sequelize,
    modelName: 'Customer',
    tableName: 'customers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    freezeTableName: true,
    indexes: [
      { fields: ['CUST_ID'] },
      { fields: ['CUST_NO'] },
      { fields: ['BVN'] },
      { fields: ['NIN'] },
      { fields: ['EMAIL_ADDRESS'] },
      { fields: ['PHONE_NO'] },
      { fields: ['FIRST_NAME'] },
      { fields: ['LAST_NAME'] },
      { fields: ['CUST_NM'] },
      { fields: ['REC_ST'] },
      { fields: ['status'] },
      { fields: ['BU_ID'] },
      { fields: ['REC_ST', 'CREATE_DT'] },
      { fields: ['BU_ID', 'REC_ST'] },
      { fields: ['KYC_LEVEL', 'REC_ST'] },
      { fields: ['IS_PEP', 'REC_ST'] },
      { fields: ['BVN_VERIFIED'] },
      { fields: ['BVN_VERIFIED_AT'] },
      { fields: ['created_at'] },
      { fields: ['updated_at'] }
    ]
  }
);

// ========== INSTANCE METHODS ==========
Customer.prototype.getFullName = function() {
  return [this.TITLE_ID, this.FIRST_NAME, this.MIDDLE_NAME, this.LAST_NAME]
    .filter(Boolean)
    .join(' ');
};

Customer.prototype.getAge = function() {
  if (!this.BIRTH_DT) return null;
  const today = new Date();
  const birthDate = new Date(this.BIRTH_DT);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

Customer.prototype.activate = async function(activatedBy) {
  this.REC_ST = 'ACTIVE';
  this.status = 'Active';
  this.APPROVED_BY = activatedBy;
  this.APPROVED_DT = new Date();
  return await this.save();
};

Customer.prototype.suspend = async function(suspendedBy) {
  this.REC_ST = 'SUSPENDED';
  this.status = 'Suspended';
  this.SUSPENDED_BY = suspendedBy;
  this.SUSPENDED_DT = new Date();
  return await this.save();
};

Customer.prototype.close = async function(closedBy) {
  this.REC_ST = 'CLOSED';
  this.status = 'Closed';
  this.CLOSED_BY = closedBy;
  this.CLOSED_DT = new Date();
  return await this.save();
};

Customer.prototype.getSummary = function() {
  return {
    customerId: this.CUST_ID,
    customerNo: this.CUST_NO,
    name: this.getFullName(),
    email: this.EMAIL_ADDRESS,
    phone: this.PHONE_NO,
    bvn: this.BVN,
    bvnVerified: this.BVN_VERIFIED,
    bvnVerifiedAt: this.BVN_VERIFIED_AT,
    nin: this.NIN,
    status: this.status,
    recordStatus: this.REC_ST,
    businessUnit: this.BU_ID,
    kycLevel: this.KYC_LEVEL,
    isPep: this.IS_PEP,
    createdDate: this.CREATE_DT,
    createdAt: this.created_at,
    updatedAt: this.updated_at
  };
};

Customer.prototype.isActive = function() {
  return this.REC_ST === 'ACTIVE';
};

Customer.prototype.isPending = function() {
  return this.REC_ST === 'PENDING';
};

Customer.prototype.hasCompleteKYC = function() {
  return this.KYC_LEVEL === 'COMPLETE' || this.KYC_LEVEL === 'FULL';
};

Customer.prototype.isBVNVerified = function() {
  return this.BVN_VERIFIED === true;
};

// ========== STATIC METHODS ==========

/**
 * Get customer with BVN details by ID
 * @param {number|string} customerId - Customer ID or CUST_ID
 * @returns {Promise<Customer>}
 */
Customer.getWithBVN = async function(customerId) {
  return this.findByPk(customerId, {
    attributes: [
      'id', 
      'CUST_ID', 
      'CUST_NO',
      'FIRST_NAME', 
      'LAST_NAME', 
      'BVN', 
      'BVN_VERIFIED',
      'BVN_VERIFIED_AT',
      'PHONE_NO',
      'EMAIL_ADDRESS',
      'status',
      'REC_ST'
    ]
  });
};

/**
 * Get customer with their active loan details
 * @param {number|string} customerId - Customer ID or CUST_ID
 * @returns {Promise<Customer>}
 */
Customer.getLoanDetails = async function(customerId) {
  try {
    // Dynamic import to avoid circular dependency
    const LoanAccount = (await import('./LoanAccount.js')).default;
    
    const customer = await this.findByPk(customerId, {
      attributes: [
        'id', 
        'CUST_ID', 
        'CUST_NO',
        'FIRST_NAME', 
        'LAST_NAME', 
        'BVN',
        'BVN_VERIFIED',
        'PHONE_NO',
        'EMAIL_ADDRESS'
      ],
      include: [{
        model: LoanAccount,
        as: 'loanAccounts',
        required: false,
        separate: true,
        limit: 10,
        order: [['created_at', 'DESC']]
      }]
    });
    
    return customer;
  } catch (error) {
    console.error('Error in Customer.getLoanDetails:', error.message);
    return null;
  }
};

/**
 * Find customer by BVN
 * @param {string} bvn - BVN number
 * @returns {Promise<Customer>}
 */
Customer.findByBVN = async function(bvn) {
  return this.findOne({
    where: { BVN: bvn },
    attributes: ['id', 'CUST_ID', 'FIRST_NAME', 'LAST_NAME', 'BVN', 'BVN_VERIFIED', 'PHONE_NO', 'EMAIL_ADDRESS']
  });
};

/**
 * Update BVN verification status
 * @param {number|string} customerId - Customer ID
 * @param {boolean} verified - Verification status
 * @param {object} verificationData - Additional verification data
 * @returns {Promise<Customer>}
 */
Customer.updateBVNVerification = async function(customerId, verified, verificationData = {}) {
  const customer = await this.findByPk(customerId);
  
  if (!customer) {
    throw new Error('Customer not found');
  }
  
  customer.BVN_VERIFIED = verified;
  customer.BVN_VERIFIED_AT = verified ? new Date() : null;
  
  if (verificationData.bvn) {
    customer.BVN = verificationData.bvn;
  }
  
  await customer.save();
  return customer;
};

/**
 * Check if customer has any active loans
 * @param {number|string} customerId - Customer ID
 * @returns {Promise<boolean>}
 */
Customer.hasActiveLoan = async function(customerId) {
  try {
    const LoanAccount = (await import('./LoanAccount.js')).default;
    
    const activeLoan = await LoanAccount.findOne({
      where: {
        customer_id: customerId,
        status: 'ACTIVE'
      }
    });
    
    return !!activeLoan;
  } catch (error) {
    console.error('Error checking active loan:', error.message);
    return false;
  }
};

/**
 * Get customer summary with loan status
 * @param {number|string} customerId - Customer ID
 * @returns {Promise<object>}
 */
Customer.getFullSummary = async function(customerId) {
  const customer = await this.findByPk(customerId);
  
  if (!customer) {
    return null;
  }
  
  const hasActiveLoan = await this.hasActiveLoan(customerId);
  const loanDetails = await this.getLoanDetails(customerId);
  
  const activeLoans = loanDetails?.loanAccounts?.filter(
    loan => loan.status === 'ACTIVE'
  ) || [];
  
  const totalOutstanding = activeLoans.reduce(
    (sum, loan) => sum + parseFloat(loan.outstanding_balance || 0), 
    0
  );
  
  return {
    ...customer.getSummary(),
    loanStatus: {
      hasActiveLoan,
      activeLoanCount: activeLoans.length,
      totalOutstandingBalance: totalOutstanding,
      totalLoans: loanDetails?.loanAccounts?.length || 0
    }
  };
};

export default Customer;