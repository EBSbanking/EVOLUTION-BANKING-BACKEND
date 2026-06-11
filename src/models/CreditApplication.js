// models/CreditApplication.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class CreditApplication extends Model {
  static async generateApplId() {
    const Counter = sequelize.models.Counter;
    const seq = await Counter.getNextSequence('creditAppId');
    const serialNumber = seq.toString().padStart(4, '0');
    return `CRAPP/${serialNumber}`;
  }

  static async generateRefNo() {
    const Counter = sequelize.models.Counter;
    const seq = await Counter.getNextSequence('refNo');
    return seq.toString().padStart(8, '0');
  }

  static async generateCreditApplicationId() {
    const Counter = sequelize.models.Counter;
    return await Counter.getNextSequence('creditApplicationId');
  }

  static async generateCustId() {
    const Counter = sequelize.models.Counter;
    return await Counter.getNextSequence('custId');
  }

  static async findPending() {
    return this.findAll({
      where: { status: 'PENDING' },
      order: [['applyDate', 'DESC']]
    });
  }

  static async findByCustomerId(customerId) {
    return this.findAll({
      where: { custId: customerId },
      order: [['createDate', 'DESC']]
    });
  }

  static async findByStatus(status) {
    return this.findAll({
      where: { status },
      order: [['createDate', 'DESC']]
    });
  }

  async approve(approvedBy, approvedLimit, comments = '') {
    this.status = 'APPROVED';
    this.approvalDate = new Date();
    this.approvedLimitAmount = approvedLimit;
    this.approvedBy = approvedBy;
    this.comments = comments || this.comments;
    return await this.save();
  }

  async reject(rejectedBy, reason = '') {
    this.status = 'REJECTED';
    this.declineDate = new Date();
    this.rejectedBy = rejectedBy;
    this.rejectionReason = reason;
    this.comments = reason || this.comments;
    return await this.save();
  }

  getSummary() {
    return {
      applicationId: this.creditApplicationId,
      applicationNumber: this.applId,
      customerName: this.customerName,
      customerId: this.custId,
      product: this.product,
      appliedAmount: this.primeLimitAmount,
      approvedAmount: this.approvedLimitAmount,
      status: this.status,
      applyDate: this.applyDate,
      approvalDate: this.approvalDate,
      purpose: this.purposeOfCredit,
      referenceNumber: this.refNo
    };
  }

  isPending() { return this.status === 'PENDING'; }
  isApproved() { return this.status === 'APPROVED'; }
  isRejected() { return this.status === 'REJECTED'; }

  get formattedApplyDate() {
    return this.applyDate ? this.applyDate.toLocaleString() : 'N/A';
  }

  get formattedApprovalDate() {
    return this.approvalDate ? this.approvalDate.toLocaleString() : 'N/A';
  }

  get formattedCreateDate() {
    return this.createDate ? this.createDate.toLocaleString() : 'N/A';
  }
}

CreditApplication.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  creditApplicationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'Numeric credit application ID'
  },
  customerName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Customer name'
  },
  custId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Customer ID'
  },
  product: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Product name'
  },
  accountId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Account ID'
  },
  accountNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Account number'
  },
  applyDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Application date'
  },
  applId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Application ID (formatted)'
  },
  prodId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Product ID'
  },
  approvalDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Approval date'
  },
  approvedCurrencyId: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Approved currency ID'
  },
  approvedCreditRequiredDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Approved credit required date'
  },
  approvedExpiryDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Approved expiry date'
  },
  approvedLimitAmount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Approved limit amount'
  },
  approvedTermCode: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Approved term code'
  },
  approvedTermValue: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Approved term value'
  },
  bankOfficerId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Bank officer ID'
  },
  businessUnitId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Business unit ID'
  },
  borrowerAddress: {
    type: DataTypes.JSON,           // MySQL JSON type – much cleaner
    allowNull: true,
    defaultValue: {},
    comment: 'Borrower address information'
  },
  comments: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Comments'
  },
  createDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Create date'
  },
  createdBy: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Created by user'
  },
  currencyId: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Currency ID'
  },
  creditRequiredDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Credit required date'
  },
  creditTypeId: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Credit type ID'
  },
  creditUtilisationMethodCode: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Credit utilisation method code'
  },
  creditType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'LOAN',
    comment: 'Credit type'
  },
  declineDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Decline date'
  },
  expiryDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Expiry date'
  },
  industryId: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Industry ID'
  },
  loanCycle: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Loan cycle number'
  },
  multiCurrencyFlag: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Multi-currency flag'
  },
  overdraftAccountId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Overdraft account ID'
  },
  portfolioId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Portfolio ID'
  },
  primeLimitAmount: {
    type: DataTypes.STRING(50),  // keep as string as original
    allowNull: true,
    comment: 'Prime limit amount'
  },
  productCombination: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Product combination'
  },
  productCombOption: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Product combination option'
  },
  purposeOfCredit: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: 'GENERAL LOAN',
    comment: 'Purpose of credit'
  },
  recordStatus: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'active',
    comment: 'Record status'
  },
  refNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Reference number'
  },
  repaymentSourceAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Repayment source account number'
  },
  rowTimestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Row timestamp'
  },
  reasonId: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Reason ID'
  },
  secondaryBankOfficerId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Secondary bank officer ID'
  },
  indexRateId: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Index rate ID'
  },
  systemCreateTimestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'System create timestamp'
  },
  termCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Term code'
  },
  termValue: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Term value'
  },
  userId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'User ID'
  },
  validityExpirationDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Validity expiration date'
  },
  versionNo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Version number'
  },
  transactionType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Transaction type'
  },
  loanCycleStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Loan cycle start date'
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'PENDING',
    validate: {
      isIn: [['PENDING', 'APPROVED', 'REJECTED']]
    },
    comment: 'Application status'
  },
  rejectedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Rejected by user'
  },
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Rejection reason'
  },
  approvedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Approved by user'
  }
}, {
  sequelize,
  modelName: 'CreditApplication',
  tableName: 'credit_applications',
  timestamps: false,  // we have custom createDate / rowTimestamp
  underscored: true,   // camelCase → snake_case automatically
  freezeTableName: true,
  hooks: {
    beforeCreate: async (application) => {
      if (!application.creditApplicationId) {
        application.creditApplicationId = await CreditApplication.generateCreditApplicationId();
      }
      if (!application.custId) {
        application.custId = await CreditApplication.generateCustId();
      }
      if (!application.applId) {
        application.applId = await CreditApplication.generateApplId();
      }
      if (!application.refNo) {
        application.refNo = await CreditApplication.generateRefNo();
      }
      if (application.status === 'PENDING') {
        application.creditType = application.creditType || 'LOAN';
        application.purposeOfCredit = application.purposeOfCredit || 'GENERAL LOAN';
        application.primeLimitAmount = application.primeLimitAmount || '1000000';
        application.approvalDate = null;
        application.approvedLimitAmount = null;
      }
      if (!application.customerName) {
        application.customerName = 'Unknown Borrower';
      }
      if (!application.borrowerAddress || typeof application.borrowerAddress === 'object') {
        application.borrowerAddress = application.borrowerAddress || {};
      }
    },
    beforeUpdate: (application) => {
      application.rowTimestamp = new Date();
      if (application.changed() && !application.changed('versionNo')) {
        application.versionNo = (application.versionNo || 0) + 1;
      }
    }
  },
  scopes: {
    pending: { where: { status: 'PENDING' } },
    approved: { where: { status: 'APPROVED' } },
    rejected: { where: { status: 'REJECTED' } },
    active: { where: { recordStatus: 'active' } },
    byCustomer: (custId) => ({ where: { custId } }),
    byProduct: (prodId) => ({ where: { prodId } }),
    byBusinessUnit: (businessUnitId) => ({ where: { businessUnitId } }),
    recent: { order: [['createDate', 'DESC']], limit: 100 }
  }
});

export default CreditApplication;