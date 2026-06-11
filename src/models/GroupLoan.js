// models/GroupLoan.js - COMPLETE FIXED VERSION
import { DataTypes } from 'sequelize';

export default (sequelize) => {
  // Helper getter for decimal fields → float
  const decimalGetter = (fieldName) => ({
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    get: function() {
      const val = this.getDataValue(fieldName);
      return val ? parseFloat(val) : 0.0;
    },
  });

  const GroupLoan = sequelize.define('GroupLoan', {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },

    loanId: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false,
    },

    groupId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'References Group.groupCode or Group.id',
    },

    groupCode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: false,
    },

    groupName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    totalAmount: decimalGetter('totalAmount'),

    individualShare: decimalGetter('individualShare'),

    memberCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },

    members: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of { memberId, name, individualAmount }',
    },

    branch: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },

    primaryRelationshipManager: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: '',
    },

    secondaryRelationshipManager: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    approvedAt: DataTypes.DATE,
    approvedBy: DataTypes.STRING(100),
    approvalNotes: DataTypes.STRING(500),

    rejectedAt: DataTypes.DATE,
    rejectedBy: DataTypes.STRING(100),
    rejectionReason: DataTypes.STRING(500),

    applicationDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },

    status: {
      type: DataTypes.ENUM(
        'applied',
        'approved',
        'disbursed',
        'rejected',
        'active',
        'closed',
        'partially_disbursed'
      ),
      defaultValue: 'applied',
    },

    disbursedAt: DataTypes.DATE,
    actualDisbursementDate: DataTypes.DATE,
    closedAt: DataTypes.DATE,
    closedBy: DataTypes.STRING(100),

    lastCollectionDate: DataTypes.DATE,

    collectionHistory: {
      type: DataTypes.JSON,
      defaultValue: [],
    },

    disbursedToMembers: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of LoanAccount.id',
    },

    repaidToMembers: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of LoanAccount.id',
    },

    createdBy: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    lastUpdatedBy: DataTypes.STRING(100),

    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },

    loanPurpose: DataTypes.STRING(255),
    savingsAccount: DataTypes.STRING(100),

    interestRate: decimalGetter('interestRate'),

    loanTerm: {
      type: DataTypes.ENUM('weekly', 'monthly', 'yearly'),
      defaultValue: 'monthly',
    },

    termValue: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      validate: { min: 1 },
    },

    disbursementMethod: {
      type: DataTypes.ENUM('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE'),
      defaultValue: 'CASH',
    },

    useSavingsAsCollateral: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    groupSavingsId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },

    savingsCollateral: decimalGetter('savingsCollateral'),

    individualLoanAccounts: {
      type: DataTypes.JSON,
      defaultValue: [],
    },

    totalInterest: decimalGetter('totalInterest'),

    totalRepayable: decimalGetter('totalRepayable'),

    totalRepaid: decimalGetter('totalRepaid'),

    remainingBalance: decimalGetter('remainingBalance'),

    installmentAmount: decimalGetter('installmentAmount'),

    numPeriods: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    installmentsPaid: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    netDisbursementAmount: decimalGetter('netDisbursementAmount'),

    totalFees: decimalGetter('totalFees'),

    upfrontInterestAmount: decimalGetter('upfrontInterestAmount'),

    remainingInterestAmount: decimalGetter('remainingInterestAmount'),

    feesCollected: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    disbursementResults: {
      type: DataTypes.JSON,
      defaultValue: {
        summary: {
          totalMembers: 0,
          successful: 0,
          failed: 0,
          insufficientFunds: 0,
          skipped: 0,
          validationErrors: 0,
          totalDisbursed: 0.00,
          totalFeesCollected: 0.00,
        },
        details: {
          successful: [],
          failed: [],
          feesCollected: [],
          insuranceActivated: [],
          insufficientFunds: [],
          skipped: [],
          validationErrors: [],
        },
      },
    },

    feeSummary: {
      type: DataTypes.JSON,
      defaultValue: {
        processingFee: 0.00,
        adminFee: 0.00,
        insuranceFee: 0.00,
        otherFees: 0.00,
        totalCharges: 0.00,
        totalFees: 0.00,
        charges: [],
        upfrontInterestPercentage: 0.00,
        processingFeePercentage: 0.00,
        adminFeeAmount: 0.00,
      },
    },

    insuranceDetails: {
      type: DataTypes.JSON,
      defaultValue: {
        totalPremium: 0.00,
        totalCoverage: 0.00,
        coverageType: 'LOAN_PROTECTION',
        provider: 'DEFAULT_INSURER',
        policyNumber: '',
        premiumCollected: false,
        policyActive: false,
      },
    },

    rateType: { type: DataTypes.STRING, defaultValue: 'FIXED' },
    interestType: { type: DataTypes.STRING, defaultValue: 'COMPOUND' },
    accrualBasisType: DataTypes.STRING,
    accrualFrequency: { type: DataTypes.STRING, defaultValue: 'DAILY' },
    accrualFrequencyValue: { type: DataTypes.INTEGER, defaultValue: 1 },
    fixedRate: { type: DataTypes.BOOLEAN, defaultValue: true },
    capitalizeInterest: { type: DataTypes.BOOLEAN, defaultValue: false },
    amortized: { type: DataTypes.BOOLEAN, defaultValue: false },
    rateChangeAllowed: { type: DataTypes.BOOLEAN, defaultValue: false },
    rateChangeNoticeDays: { type: DataTypes.INTEGER, defaultValue: 30 },
    upfrontInterest: { type: DataTypes.BOOLEAN, defaultValue: false },
    upfrontInterestPercentage: decimalGetter('upfrontInterestPercentage'),
  }, {
    tableName: 'group_loans',
    timestamps: false,
    updatedAt: 'updatedAt',
    createdAt: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['approvedAt'] },
      { fields: ['rejectedAt'] },
      { fields: ['disbursedAt'] },
      { fields: ['createdBy'] },
      { fields: ['groupCode', 'status'] },
      { fields: ['lastCollectionDate'] },
      { fields: ['totalRepaid'] },
      { fields: ['remainingBalance'] },
      { unique: true, fields: ['loanId'] },
    ],
    hooks: {
      beforeCreate: async function(groupLoan) {
        if (!groupLoan.individualShare && groupLoan.memberCount > 0 && groupLoan.totalAmount) {
          groupLoan.individualShare = (groupLoan.totalAmount / groupLoan.memberCount).toFixed(2);
        }
        groupLoan.applicationDate = new Date();
        groupLoan.updatedAt = new Date();
      },
      beforeUpdate: async function(groupLoan) {
        groupLoan.updatedAt = new Date();

        const totalAmount = parseFloat(groupLoan.totalAmount || 0);
        const totalInterest = parseFloat(groupLoan.totalInterest || 0);
        const totalRepaid = parseFloat(groupLoan.totalRepaid || 0);

        groupLoan.totalRepayable = (totalAmount + totalInterest).toFixed(2);
        groupLoan.remainingBalance = Math.max(0, totalAmount + totalInterest - totalRepaid).toFixed(2);
      },
    },
  });

  // Instance methods
  GroupLoan.prototype.updateCollectionTotals = async function(loanAmount, savingsAmount = 0) {
    const currentRepaid = parseFloat(this.totalRepaid || 0);
    const loanNum = parseFloat(loanAmount || 0);
    this.totalRepaid = (currentRepaid + loanNum).toFixed(2);

    const repayable = parseFloat(this.totalRepayable || 0);
    this.remainingBalance = Math.max(0, repayable - (currentRepaid + loanNum)).toFixed(2);

    this.lastCollectionDate = new Date();
    await this.save();
  };

  GroupLoan.prototype.getCollectionSummary = function() {
    const totalExpected = parseFloat(this.totalRepayable || 0);
    const totalCollected = parseFloat(this.totalRepaid || 0);
    const rate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;

    return {
      totalExpected,
      totalCollected,
      remainingBalance: parseFloat(this.remainingBalance || 0),
      collectionRate: Math.round(rate * 100) / 100,
      installmentsPaid: this.installmentsPaid || 0,
      lastCollectionDate: this.lastCollectionDate,
    };
  };

  GroupLoan.prototype.addCollectionRecord = async function(collectionData) {
    if (!this.collectionHistory) this.collectionHistory = [];

    this.collectionHistory.push({
      collectionDate: collectionData.collectionDate || new Date(),
      collectedBy: collectionData.collectedBy,
      loanCollections: collectionData.loanCollections || [],
      savingsCollections: collectionData.savingsCollections || [],
      successfulCollections: collectionData.successfulCollections || 0,
      failedCollections: collectionData.failedCollections || 0,
      savingsProcessed: collectionData.savingsProcessed || 0,
      totalLoanCollected: parseFloat(collectionData.totalLoanCollected || 0).toFixed(2),
      totalSavingsCollected: parseFloat(collectionData.totalSavingsCollected || 0).toFixed(2),
      paymentMethod: collectionData.paymentMethod || 'CASH',
      transactionReference: collectionData.transactionReference,
    });

    this.lastCollectionDate = new Date();
    await this.save();
  };

  GroupLoan.prototype.markMemberAsRepaid = async function(loanAccountId) {
    if (!this.repaidToMembers) this.repaidToMembers = [];
    if (!this.repaidToMembers.includes(loanAccountId)) {
      this.repaidToMembers.push(loanAccountId);
    }
    await this.save();
  };

  GroupLoan.prototype.allMembersRepaid = function() {
    const disbursed = this.disbursedToMembers?.length || 0;
    const repaid = this.repaidToMembers?.length || 0;
    return disbursed > 0 && disbursed === repaid;
  };

  return GroupLoan;
};