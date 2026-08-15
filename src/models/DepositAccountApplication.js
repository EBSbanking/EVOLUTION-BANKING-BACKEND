import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DepositAccountApplication extends Model {
  // Static method: Find by customer ID
  static async findByCustomerId(customerId) {
    return this.findAll({
      where: { CUST_ID: customerId },
      order: [['CREATED_AT', 'DESC']]
    });
  }

  // Static method: Find active applications
  static async findActiveApplications() {
    return this.findAll({
      where: { STATUS: ['Pending', 'Active'] },
      order: [['CREATED_AT', 'DESC']]
    });
  }

  // Static method: Find by document type
  static async findByDocumentType(documentType) {
    return this.findAll({
      where: { DOCUMENT_TYPE: documentType },
      order: [['CREATED_AT', 'DESC']]
    });
  }

  // Static method: Find pending applications
  static async findPending() {
    return this.findAll({
      where: { STATUS: 'Pending' },
      order: [['CREATED_AT', 'DESC']]
    });
  }

  // Static method: Find approved applications
  static async findApproved() {
    return this.findAll({
      where: { STATUS: 'Active' },
      order: [['CREATED_AT', 'DESC']]
    });
  }

  // Static method: Generate account number (NUBAN format starting with 2)
  static generateNubanAccountNumber() {
    // Generate 9 random digits
    const random9 = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    // Prepend '2' for savings account (NUBAN format)
    return `2${random9}`;
  }

  // Static method: Validate NUBAN account number
  static validateNubanAccountNumber(accountNo) {
    // Basic NUBAN validation: 10 digits starting with 2 for savings
    return /^2\d{9}$/.test(accountNo);
  }

  // Instance method: Approve application
  async approve(approvedBy) {
    this.STATUS = 'Active';
    this.APPROVED_DATE = new Date();
    this.APPROVED_BY = approvedBy;
    return await this.save();
  }

  // Instance method: Reject application
  async reject(reason, rejectedBy) {
    this.STATUS = 'Rejected';
    this.REJECTION_REASON = reason;
    this.REJECTED_BY = rejectedBy;
    this.REJECTED_DATE = new Date();
    return await this.save();
  }

  // Instance method: Check if pending
  isPending() {
    return this.STATUS === 'Pending';
  }

  // Instance method: Check if approved
  isApproved() {
    return this.STATUS === 'Active';
  }

  // Instance method: Check if rejected
  isRejected() {
    return this.STATUS === 'Rejected';
  }

  // Instance method: Get application summary
  getApplicationSummary() {
    return {
      applicationId: this.id,
      customerId: this.CUST_ID,
      accountId: this.ACCT_ID,
      accountNumber: this.ACCT_NO,
      accountName: this.ACCT_NM,
      productId: this.PROD_ID,
      businessUnit: this.BU_ID,
      currency: this.CRNCY_ID,
      amount: this.AMOUNT,
      depositorName: this.DEPOSITOR_NAME,
      status: this.STATUS,
      documentType: this.DOCUMENT_TYPE,
      documentNumber: this.DOCUMENT_NUMBER,
      createdBy: this.CREATED_BY,
      userId: this.USER_ID,
      createdAt: this.CREATED_AT,
      openedDate: this.OPENED_DT,
      availableDate: this.AVAIL_DT,
      accountType: this.ACCOUNT_TYPE,
      formattedAccountNumber: this.formattedAccountNumber
    };
  }

  // Virtual getter: Formatted account number (for display)
  get formattedAccountNumber() {
    if (this.ACCT_NO && this.ACCT_NO.length === 10) {
      return `${this.ACCT_NO.slice(0, 3)}-${this.ACCT_NO.slice(3, 7)}-${this.ACCT_NO.slice(7)}`;
    }
    return this.ACCT_NO;
  }

  // Virtual getter: Days since application
  get daysSinceApplication() {
    if (!this.CREATED_AT) return null;
    const today = new Date();
    const appDate = new Date(this.CREATED_AT);
    const diffTime = Math.abs(today - appDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

DepositAccountApplication.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  CUST_ID: {
    type: DataTypes.STRING(10),
    allowNull: false,
    validate: {
      is: /^\d{10}$/,
      notEmpty: true
    },
    comment: 'Customer identifier (10 digits)'
  },
  
  ACCT_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      is: /^[A-Z0-9_]+$/,
      notEmpty: true
    },
    comment: 'Account identifier'
  },
  
  ACCT_NO: {
    type: DataTypes.STRING(10),
    allowNull: false,
    unique: true,
    validate: {
      is: /^\d{10}$/,
      customValidator(value) {
        if (!value.startsWith('2')) {
          throw new Error('Savings account number must start with "2" for NUBAN format');
        }
      }
    },
    comment: 'Account number (NUBAN format)'
  },
  
  ACCT_NM: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Account name'
  },
  
 CRNCY_ID: {
  type: DataTypes.STRING(3),
  allowNull: false,
  defaultValue: 'NGN',
  validate: {
    isIn: [['NGN']]  // Only 'NGN' is allowed!
  },
  comment: 'Currency identifier'
},
  
  PROD_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      isNumeric: true,
      notEmpty: true
    },
    comment: 'Product identifier'
  },
  
  BU_ID: {
    type: DataTypes.STRING(3),
    allowNull: false,
    validate: {
      is: /^\d{3}$/,
      notEmpty: true
    },
    comment: 'Business unit identifier'
  },
  
  AVAIL_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Account available date'
  },
  
  OPENED_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Account opened date'
  },
  
  CREATED_BY: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Created by user'
  },
  
  USER_ID: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'User identifier'
  },
  
  CREATED_AT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Application creation date'
  },
  
  IMAGE: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Image URL or base64 string'
  },
  
  DOCUMENT: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Document URL or base64 string'
  },
  
  DOCUMENT_TYPE: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Document type'
  },
  
  DOCUMENT_NUMBER: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Document number'
  },
  
  BANK_MANDATE: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Bank mandate document'
  },
  
  AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: 'Deposit amount'
  },
  
  DEPOSITOR_NAME: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Depositor name'
  },
  
  STATUS: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'Pending',
    validate: {
      isIn: [['Pending', 'Approved', 'Rejected', 'Active', 'Inactive']]
    },
    comment: 'Application status'
  },
  
  DENOMINATIONS: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
    comment: 'Currency breakdown tracking'
  },
  
  ACCOUNT_TYPE: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'SAVINGS',
    validate: {
      isIn: [['SAVINGS']]
    },
    comment: 'Account type'
  },
  
  // Approval metadata - using uppercase to match other fields
  APPROVED_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Approval date'
  },
  
  APPROVED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Approved by user'
  },
  
  REJECTED_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Rejection date'
  },
  
  REJECTED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Rejected by user'
  },
  
  REJECTION_REASON: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Rejection reason'
  },
  
  NOTES: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Additional notes'
  },
  
  BRANCH_NAME: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Branch name'
  },
  
  TELLER_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Teller identifier'
  },
  
  APPLICATION_DATE: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Application submission date'
  },
  
  UPDATED_AT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Last update timestamp'
  }
}, {
  sequelize,
  modelName: 'DepositAccountApplication',
  tableName: 'deposit_account_applications',
  timestamps: false,  // We're handling timestamps manually with UPDATED_AT
  underscored: false,  // Don't convert to snake_case
  freezeTableName: true,
  
  indexes: [
    // Primary indexes
    { 
      fields: ['ACCT_NO'], 
      unique: true,
      name: 'idx_acct_no_unique'
    },
    { 
      fields: ['CUST_ID'],
      name: 'idx_cust_id'
    },
    { 
      fields: ['PROD_ID'],
      name: 'idx_prod_id'
    },
    { 
      fields: ['BU_ID'],
      name: 'idx_bu_id'
    },
    { 
      fields: ['STATUS'],
      name: 'idx_status'
    },
    { 
      fields: ['CREATED_AT'],
      name: 'idx_created_at'
    },
    { 
      fields: ['DOCUMENT_TYPE'],
      name: 'idx_document_type'
    },
    { 
      fields: ['ACCT_ID'],
      name: 'idx_acct_id'
    },
    
    // Composite indexes for common queries
    { 
      fields: ['CUST_ID', 'STATUS'],
      name: 'idx_cust_status'
    },
    { 
      fields: ['BU_ID', 'STATUS'],
      name: 'idx_bu_status'
    },
    { 
      fields: ['STATUS', 'CREATED_AT'],
      name: 'idx_status_created'
    },
    { 
      fields: ['PROD_ID', 'STATUS'],
      name: 'idx_prod_status'
    },
    { 
      fields: ['ACCOUNT_TYPE', 'STATUS'],
      name: 'idx_account_type_status'
    }
  ],
  
  hooks: {
    beforeValidate: (application) => {
      // Ensure uppercase for ACCT_ID
      if (application.ACCT_ID) {
        application.ACCT_ID = application.ACCT_ID.toUpperCase();
      }
      
      // Ensure STATUS is properly capitalized
      if (application.STATUS) {
        application.STATUS = application.STATUS.charAt(0).toUpperCase() + application.STATUS.slice(1).toLowerCase();
      }
      
      // Trim string fields
      const fieldsToTrim = [
        'CUST_ID', 'ACCT_NO', 'ACCT_NM', 'CREATED_BY', 'USER_ID',
        'DOCUMENT_TYPE', 'DOCUMENT_NUMBER', 'DEPOSITOR_NAME',
        'APPROVED_BY', 'REJECTED_BY', 'NOTES', 'BRANCH_NAME', 'TELLER_ID'
      ];
      
      fieldsToTrim.forEach(field => {
        if (application[field]) {
          application[field] = application[field].toString().trim();
        }
      });
    },
    
    beforeCreate: async (application) => {
      // Validate CUST_ID format
      if (!/^\d{10}$/.test(application.CUST_ID)) {
        throw new Error(`CUST_ID ${application.CUST_ID} is invalid. Must be 10 digits`);
      }
      
      // Validate ACCT_NO format (NUBAN)
      if (!/^\d{10}$/.test(application.ACCT_NO)) {
        throw new Error(`ACCT_NO ${application.ACCT_NO} is invalid. Must be 10 digits`);
      }
      
      // For NUBAN accounts, ensure it starts with '2' for savings
      if (!application.ACCT_NO.startsWith('2')) {
        throw new Error('Savings account number must start with "2" for NUBAN format');
      }
      
      // Generate ACCT_ID if not provided
      if (!application.ACCT_ID) {
        const timestamp = Date.now();
        const randomSuffix = Math.floor(Math.random() * 1000);
        application.ACCT_ID = `ACCT_${timestamp}_${randomSuffix}`.toUpperCase();
      }
      
      // Validate ACCT_ID format
      if (!/^[A-Z0-9_]+$/.test(application.ACCT_ID)) {
        throw new Error(`ACCT_ID ${application.ACCT_ID} is invalid. Must be alphanumeric with underscores`);
      }
      
      // Validate PROD_ID
      if (!/^\d+$/.test(application.PROD_ID)) {
        throw new Error(`PROD_ID ${application.PROD_ID} must contain only digits`);
      }
      
      // Validate BU_ID
      if (!/^\d{3}$/.test(application.BU_ID)) {
        throw new Error(`BU_ID ${application.BU_ID} must be exactly 3 digits`);
      }
      
      // Validate DOCUMENT_TYPE is not empty
      if (!application.DOCUMENT_TYPE || application.DOCUMENT_TYPE.trim() === '') {
        throw new Error('DOCUMENT_TYPE is required');
      }
      
      // Validate DOCUMENT_NUMBER is not empty
      if (!application.DOCUMENT_NUMBER || application.DOCUMENT_NUMBER.trim() === '') {
        throw new Error('DOCUMENT_NUMBER is required');
      }
      
      // Set timestamps
      const now = new Date();
      if (!application.CREATED_AT) application.CREATED_AT = now;
      if (!application.APPLICATION_DATE) application.APPLICATION_DATE = now;
      if (!application.OPENED_DT) application.OPENED_DT = now;
      if (!application.AVAIL_DT) application.AVAIL_DT = now;
      if (!application.UPDATED_AT) application.UPDATED_AT = now;
      
      // Set available date to opened date + 1 day if same
      if (application.OPENED_DT.getTime() === application.AVAIL_DT.getTime()) {
        const availDate = new Date(application.AVAIL_DT);
        availDate.setDate(availDate.getDate() + 1);
        application.AVAIL_DT = availDate;
      }
    },
    
    beforeUpdate: (application) => {
      // Update timestamp
      application.UPDATED_AT = new Date();
    }
  },
  scopes: {
    pending: {
      where: { STATUS: 'Pending' }
    },
    active: {
      where: { STATUS: 'Active' }
    },
    approved: {
      where: { STATUS: 'Active' }
    },
    rejected: {
      where: { STATUS: 'Rejected' }
    },
    inactive: {
      where: { STATUS: 'Inactive' }
    },
    byCustomer: (customerId) => ({
      where: { CUST_ID: customerId }
    }),
    byBusinessUnit: (buId) => ({
      where: { BU_ID: buId }
    }),
    byProduct: (productId) => ({
      where: { PROD_ID: productId }
    }),
    byDocumentType: (docType) => ({
      where: { DOCUMENT_TYPE: docType }
    }),
    recent: {
      order: [['CREATED_AT', 'DESC']],
      limit: 100
    },
    today: {
      where: {
        CREATED_AT: {
          [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    },
    thisWeek: {
      where: {
        CREATED_AT: {
          [Op.gte]: new Date(new Date().setDate(new Date().getDate() - 7))
        }
      }
    },
    thisMonth: {
      where: {
        CREATED_AT: {
          [Op.gte]: new Date(new Date().setDate(new Date().getDate() - 30))
        }
      }
    }
  }
});

export default DepositAccountApplication;
