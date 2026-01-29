import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const LoanContractForm = sequelize.define('LoanContractForm', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  loan_contract_no: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notNull: { msg: 'Loan contract number is required' },
      notEmpty: true
    }
  },
  customer_id: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notNull: { msg: 'Customer ID is required' },
      notEmpty: true
    }
  },
  borrower_name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notNull: { msg: 'Borrower name is required' },
      notEmpty: true
    }
  },
  co_signatory_name: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: ''
  },
  borrower_address: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Address Not Provided'
  },
  loan_purpose: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notNull: { msg: 'Loan purpose is required' },
      notEmpty: true
    }
  },
  loan_amount: {
    type: DataTypes.STRING, // Consider changing to DECIMAL if you need numeric operations
    allowNull: false,
    validate: {
      notNull: { msg: 'Loan amount is required' },
      notEmpty: true
    }
  },
  loan_term: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      notNull: { msg: 'Loan term is required' },
      min: { args: [1], msg: 'Loan term must be at least 1' }
    }
  },
  TERM_CD: {
    type: DataTypes.ENUM('M', 'Y'),
    field: 't_e_r_m__c_d',  // Map to actual database column
    allowNull: false,
    defaultValue: 'M',
    validate: {
      notNull: { msg: 'Term code is required' },
      isIn: { args: [['M', 'Y']], msg: 'Term code must be either M or Y' }
    }
  },
  interest_rate: {
    type: DataTypes.DECIMAL(7, 4), // 7 total digits, 4 decimal places
    allowNull: false,
    validate: {
      notNull: { msg: 'Interest rate is required' },
      min: { args: [0], msg: 'Interest rate cannot be negative' },
      max: { args: [100], msg: 'Interest rate cannot exceed 100%' }
    }
  },
  interest_rate_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 101
  },
  guarantor_name: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: ''
  },
  bank_name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notNull: { msg: 'Bank name is required' },
      notEmpty: true
    }
  },
  bank_short: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notNull: { msg: 'Bank short code is required' },
      notEmpty: true
    }
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'DISBURSED', 'ACTIVE', 'CLOSED'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  contract_text: {
    type: DataTypes.TEXT, // Use TEXT for longer content
    allowNull: false,
    defaultValue: ''
  },
  USER_ID: {
    type: DataTypes.STRING,
    field: 'u_s_e_r__i_d',  // Map to actual database column
    allowNull: false,
    validate: {
      notNull: { msg: 'User ID is required' },
      notEmpty: true
    }
  },
  applicationId: {
    type: DataTypes.STRING,
    field: 'application_id',  // Map to actual database column
    allowNull: false,
    validate: {
      notNull: { msg: 'Application ID is required' },
      notEmpty: true
    }
  },
  loanAccountNo: {
    type: DataTypes.STRING,
    field: 'loan_account_no',  // Map to actual database column
    allowNull: false,
    validate: {
      notNull: { msg: 'Loan account number is required' },
      notEmpty: true
    }
  },
  fundingAccountNo: {
    type: DataTypes.STRING,
    field: 'funding_account_no',  // Map to actual database column
    allowNull: false,
    validate: {
      notNull: { msg: 'Funding account number is required' },
      notEmpty: true
    }
  },
  workflowId: {
    type: DataTypes.BIGINT, // Use BIGINT for large numbers
    field: 'workflow_id',  // Map to actual database column
    unique: true,
    allowNull: true
  },
  fees: {
    type: DataTypes.JSON, // Store JSON object for fees
    allowNull: false,
    defaultValue: {
      processingFee: 0,
      latePaymentFee: 0,
      earlyRepaymentFee: 0
    },
    validate: {
      isValidFees(value) {
        if (typeof value !== 'object' || value === null) {
          throw new Error('Fees must be an object');
        }
        if (value.processingFee === undefined) {
          throw new Error('Processing fee is required');
        }
        if (typeof value.processingFee !== 'number' || value.processingFee < 0) {
          throw new Error('Processing fee must be a non-negative number');
        }
        if (value.latePaymentFee !== undefined && (typeof value.latePaymentFee !== 'number' || value.latePaymentFee < 0)) {
          throw new Error('Late payment fee must be a non-negative number');
        }
        if (value.earlyRepaymentFee !== undefined && (typeof value.earlyRepaymentFee !== 'number' || value.earlyRepaymentFee < 0)) {
          throw new Error('Early repayment fee must be a non-negative number');
        }
      }
    }
  },
  signatureRequirements: {
    type: DataTypes.JSON, // Store JSON object for signature requirements
    field: 'signature_requirements',  // Map to actual database column
    allowNull: false,
    defaultValue: {
      customerSignatureRequired: true,
      witnessSignatureRequired: false,
      bankOfficerSignatureRequired: true
    }
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  disbursementDate: {
    type: DataTypes.DATE,
    field: 'disbursement_date',  // Map to actual database column
    allowNull: true
  },
  maturityDate: {
    type: DataTypes.DATE,
    field: 'maturity_date',  // Map to actual database column
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    field: 'created_at',  // Map to actual database column
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    field: 'updated_at',  // Map to actual database column
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'loan_contract_forms',
  timestamps: false, // We're handling timestamps manually with field mappings
  underscored: false, // Disable automatic underscore conversion since we're mapping manually
  hooks: {
    beforeCreate: (contract, options) => {
      // Generate workflowId if not provided
      if (!contract.workflowId) {
        contract.workflowId = Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
      }

      // Ensure TERM_CD is valid and uppercase
      if (!contract.TERM_CD) {
        contract.TERM_CD = 'M';
      }
      contract.TERM_CD = contract.TERM_CD.toUpperCase();
      if (!['M', 'Y'].includes(contract.TERM_CD)) {
        contract.TERM_CD = 'M';
      }

      // Ensure interest_rate_id is valid
      if (!contract.interest_rate_id || isNaN(contract.interest_rate_id)) {
        contract.interest_rate_id = 101;
      }

      // Ensure all JSON fields have proper defaults
      if (!contract.fees || typeof contract.fees !== 'object') {
        contract.fees = {
          processingFee: 0,
          latePaymentFee: 0,
          earlyRepaymentFee: 0
        };
      }
      
      if (!contract.signatureRequirements || typeof contract.signatureRequirements !== 'object') {
        contract.signatureRequirements = {
          customerSignatureRequired: true,
          witnessSignatureRequired: false,
          bankOfficerSignatureRequired: true
        };
      }
      
      if (!contract.metadata || typeof contract.metadata !== 'object') {
        contract.metadata = {};
      }
      
      // Set timestamps
      const now = new Date();
      contract.createdAt = now;
      contract.updatedAt = now;
    },
    
    beforeUpdate: (contract, options) => {
      // Ensure TERM_CD is valid and uppercase
      if (contract.changed('TERM_CD')) {
        if (!contract.TERM_CD) {
          contract.TERM_CD = 'M';
        }
        contract.TERM_CD = contract.TERM_CD.toUpperCase();
        if (!['M', 'Y'].includes(contract.TERM_CD)) {
          contract.TERM_CD = 'M';
        }
      }

      // Ensure interest_rate_id is valid
      if (contract.changed('interest_rate_id') && (!contract.interest_rate_id || isNaN(contract.interest_rate_id))) {
        contract.interest_rate_id = 101;
      }
      
      // Update timestamp
      contract.updatedAt = new Date();
    }
  },
  indexes: [
    {
      unique: true,
      fields: ['loan_contract_no']
    },
    {
      fields: ['customer_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['application_id']  // Use database column name
    },
    {
      unique: true,
      fields: ['workflow_id']  // Use database column name
    },
    {
      fields: ['loan_account_no']  // Use database column name
    },
    {
      fields: ['t_e_r_m__c_d']  // Use database column name
    },
    {
      fields: ['u_s_e_r__i_d']  // Use database column name
    },
    {
      fields: ['created_at']  // Use database column name
    },
    {
      fields: ['status', 't_e_r_m__c_d']  // Use database column names
    }
  ]
});

// Define associations
LoanContractForm.associate = (models) => {
  LoanContractForm.belongsTo(models.Customer, {
    foreignKey: 'customer_id',
    targetKey: 'customer_id', // Adjust based on your Customer model
    as: 'customer'
  });
  
  LoanContractForm.belongsTo(models.User, {
    foreignKey: 'u_s_e_r__i_d',  // Use actual database column name
    targetKey: 'user_id', // Adjust based on your User model
    as: 'user'
  });
  
  LoanContractForm.belongsTo(models.LoanAccount, {
    foreignKey: 'loan_account_no',  // Use actual database column name
    targetKey: 'ACCT_NO', // Adjust based on your LoanAccount model
    as: 'loanAccount'
  });
  
  LoanContractForm.belongsTo(models.Account, {
    foreignKey: 'funding_account_no',  // Use actual database column name
    targetKey: 'accountNumber', // Adjust based on your Account model
    as: 'fundingAccount'
  });
};

export default LoanContractForm;