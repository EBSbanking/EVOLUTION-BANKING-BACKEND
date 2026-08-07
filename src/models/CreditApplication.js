// models/CreditApplication.js - ADD GUARANTOR_ID FIELD
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const CreditApplication = sequelize.define('CreditApplication', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  creditApplicationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    field: 'credit_application_id'
  },
  applId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'appl_id'
  },
  custId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'cust_id'
  },
  customerName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'customer_name'
  },
  product: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'product'
  },
  accountId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'account_id'
  },
  accountNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'account_number'
  },
  applyDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'apply_date'
  },
  prodId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'prod_id'
  },
  approvalDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approval_date'
  },
  approvedCurrencyId: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'approved_currency_id'
  },
  approvedCreditRequiredDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approved_credit_required_date'
  },
  approvedExpiryDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approved_expiry_date'
  },
  approvedLimitAmount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'approved_limit_amount'
  },
  approvedTermCode: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'approved_term_code'
  },
  approvedTermValue: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'approved_term_value'
  },
  bankOfficerId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'bank_officer_id'
  },
  businessUnitId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'business_unit_id'
  },
  borrowerAddress: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
    field: 'borrower_address'
  },
  comments: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'comments'
  },
  createDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'create_date'
  },
  createdBy: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'created_by'
  },
  currencyId: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'currency_id'
  },
  creditRequiredDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'credit_required_date'
  },
  creditTypeId: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'credit_type_id'
  },
  creditUtilisationMethodCode: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'credit_utilisation_method_code'
  },
  creditType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'LOAN',
    field: 'credit_type'
  },
  declineDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'decline_date'
  },
  expiryDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expiry_date'
  },
  industryId: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'industry_id'
  },
  loanCycle: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'loan_cycle'
  },
  multiCurrencyFlag: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'multi_currency_flag'
  },
  overdraftAccountId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'overdraft_account_id'
  },
  portfolioId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'portfolio_id'
  },
  primeLimitAmount: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'prime_limit_amount'
  },
  productCombination: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'product_combination'
  },
  productCombOption: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'product_comb_option'
  },
  purposeOfCredit: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: 'GENERAL LOAN',
    field: 'purpose_of_credit'
  },
  recordStatus: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'active',
    field: 'record_status'
  },
  refNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'ref_no'
  },
  repaymentSourceAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'repayment_source_account_no'
  },
  rowTimestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'row_timestamp'
  },
  reasonId: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'reason_id'
  },
  secondaryBankOfficerId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'secondary_bank_officer_id'
  },
  indexRateId: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'index_rate_id'
  },
  systemCreateTimestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'system_create_timestamp'
  },
  termCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'M',
    field: 'term_code',
    comment: 'Term code (D=Days, W=Weeks, BW=Bi-Weekly, M=Months, Q=Quarters, Y=Years)'
  },
  termValue: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'term_value',
    comment: 'Term value (number of days/weeks/months/etc.)'
  },
  userId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'user_id'
  },
  validityExpirationDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'validity_expiration_date'
  },
  versionNo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'version_no'
  },
  transactionType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'transaction_type'
  },
  loanCycleStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'loan_cycle_start_date'
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'PENDING',
    field: 'status'
  },
  rejectedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'rejected_by'
  },
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'rejection_reason'
  },
  approvedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'approved_by'
  },
  // ✅ ADDED: Guarantor ID field
  guarantorId: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'guarantor_id',
    comment: 'Business ID of the guarantor (e.g., 1000000)'
  }
}, {
  sequelize,
  modelName: 'CreditApplication',
  tableName: 'credit_applications',
  timestamps: false,
  underscored: false,
  freezeTableName: true,
  hooks: {
    beforeCreate: (application) => {
      // Set defaults if not provided
      if (!application.termCode) {
        application.termCode = 'M';
      }
      if (!application.termValue) {
        application.termValue = 1;
      }
      if (!application.status) {
        application.status = 'PENDING';
      }
    }
  }
});

export default CreditApplication;