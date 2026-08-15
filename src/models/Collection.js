// models/Collection.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';
import Group from './Group.js';
import GroupLoan from './GroupLoan.js';
import LoanAccount from './LoanAccount.js';   // ? added – needed to update loan balances

class Collection extends Model {
  // Static method: Find by group loan
  static async findByGroupLoan(groupLoanId) {
    return this.findAll({
      where: { groupLoanId },
      order: [['collectionDate', 'DESC']]
    });
  }

  // Static method: Find by loan account
  static async findByLoanAccount(loanAccountId) {
    return this.findAll({
      where: {
        loanAccountId,
        status: ['processed', 'partially_processed']
      },
      order: [['collectionDate', 'DESC']]
    });
  }

  // Static method: Get loan repayment summary
  static async getLoanRepaymentSummary(groupLoanId) {
    const collections = await this.findAll({
      where: {
        groupLoanId,
        status: ['processed', 'partially_processed']
      },
      include: [{
        association: 'loanRepayments',
        where: { status: 'processed' }
      }]
    });

    const summary = {
      totalCollections: 0,
      totalPrincipal: 0,
      totalInterest: 0,
      totalPenalty: 0,
      totalRepaid: 0,
      uniqueLoanAccounts: new Set()
    };

    collections.forEach(collection => {
      summary.totalCollections++;
      collection.loanRepayments.forEach(repayment => {
        summary.totalPrincipal += repayment.principalAmount || 0;
        summary.totalInterest += repayment.interestAmount || 0;
        summary.totalPenalty += repayment.penaltyAmount || 0;
        summary.totalRepaid += repayment.totalAmount || 0;
        summary.uniqueLoanAccounts.add(repayment.loanAccountId);
      });
    });

    return [{
      totalCollections: summary.totalCollections,
      totalPrincipal: summary.totalPrincipal,
      totalInterest: summary.totalInterest,
      totalPenalty: summary.totalPenalty,
      totalRepaid: summary.totalRepaid,
      uniqueLoanAccountsCount: summary.uniqueLoanAccounts.size
    }];
  }

  // Instance method: Add loan repayment
  async addLoanRepayment(repaymentData) {
    const LoanRepayment = sequelize.models.LoanRepayment;
    return await LoanRepayment.create({
      collectionId: this.id,
      ...repaymentData,
      status: 'pending'
    });
  }

  // Instance method: Add savings collection
  async addSavingsCollection(savingsData) {
    const SavingsCollection = sequelize.models.SavingsCollection;
    return await SavingsCollection.create({
      collectionId: this.id,
      ...savingsData,
      status: 'pending'
    });
  }

  // Instance method: Process repayments (now updates LoanAccount)
  async processRepayments() {
    const GroupLoan = sequelize.models.GroupLoan;
    const LoanAccountModel = sequelize.models.LoanAccount;
    
    let successfulRepayments = 0;
    let totalLoanCollected = 0;
    
    const loanRepayments = await this.getLoanRepayments();
    
    for (let repayment of loanRepayments) {
      if (repayment.status === 'pending') {
        try {
          // 1. Update the loan account directly
          if (repayment.loanAccountId) {
            const loanAccount = await LoanAccountModel.findByPk(repayment.loanAccountId);
            if (loanAccount) {
              // Reduce outstanding principal by the principal portion of the repayment
              const newPrincipal = (loanAccount.OUTSTANDING_PRINCIPAL || 0) - (repayment.principalAmount || 0);
              await loanAccount.update({
                OUTSTANDING_PRINCIPAL: newPrincipal < 0 ? 0 : newPrincipal,
                LAST_REPAYMENT_DATE: new Date(),
                LAST_REPAYMENT_AMOUNT: repayment.totalAmount,
                // If fully repaid, update status
                LOAN_STATUS: newPrincipal <= 0 ? 'CLOSED' : loanAccount.LOAN_STATUS
              });
            }
          }
          
          // 2. Update GroupLoan collection history (if group loan exists)
          if (this.groupLoanId) {
            const groupLoan = await GroupLoan.findByPk(this.groupLoanId);
            if (groupLoan) {
              // Example: update totals – adjust to your actual model methods
              await groupLoan.updateCollectionTotals(repayment.totalAmount || 0);
              await groupLoan.markMemberAsRepaid(repayment.loanAccountId);
              
              await groupLoan.addCollectionRecord({
                collectedBy: this.createdBy,
                loanCollections: [{
                  accountNo: repayment.loanAccountNumber,
                  amount: repayment.totalAmount,
                  receiptNo: this.transactionReference,
                  installmentNo: repayment.installmentNumber
                }],
                successfulCollections: 1,
                totalLoanCollected: repayment.totalAmount,
                paymentMethod: this.paymentMethod,
                transactionReference: this.transactionReference
              });
            }
          }
          
          repayment.status = 'processed';
          await repayment.save();
          
          successfulRepayments++;
          totalLoanCollected += repayment.totalAmount || 0;
          
        } catch (error) {
          repayment.status = 'failed';
          await repayment.save();
          console.error(`Failed to process repayment for loan account ${repayment.loanAccountId}:`, error);
        }
      }
    }
    
    // Update collection status
    if (successfulRepayments > 0) {
      const totalRepayments = loanRepayments.length;
      this.status = totalRepayments === successfulRepayments ? 'processed' : 'partially_processed';
      this.processedAt = new Date();
      this.processedBy = this.createdBy;
      
      // Update processing summary
      const summary = await this.getProcessingSummary();
      summary.successfulLoanRepayments = successfulRepayments;
      summary.totalLoanAmount = totalLoanCollected;
      summary.repaymentSchedulesUpdated = successfulRepayments;
      summary.totalProcessedAmount = totalLoanCollected;
      
      await summary.save();
    }
    
    return this.save();
  }

  // Instance method: Get repayment breakdown
  async getRepaymentBreakdown() {
    const loanRepayments = await this.getLoanRepayments();
    const breakdown = {
      principal: 0,
      interest: 0,
      penalty: 0,
      total: 0,
      byLoanAccount: {}
    };
    
    loanRepayments.forEach(repayment => {
      breakdown.principal += repayment.principalAmount || 0;
      breakdown.interest += repayment.interestAmount || 0;
      breakdown.penalty += repayment.penaltyAmount || 0;
      breakdown.total += repayment.totalAmount || 0;
      
      if (repayment.loanAccountNumber) {
        if (!breakdown.byLoanAccount[repayment.loanAccountNumber]) {
          breakdown.byLoanAccount[repayment.loanAccountNumber] = {
            principal: 0,
            interest: 0,
            penalty: 0,
            total: 0
          };
        }
        breakdown.byLoanAccount[repayment.loanAccountNumber].principal += repayment.principalAmount || 0;
        breakdown.byLoanAccount[repayment.loanAccountNumber].interest += repayment.interestAmount || 0;
        breakdown.byLoanAccount[repayment.loanAccountNumber].penalty += repayment.penaltyAmount || 0;
        breakdown.byLoanAccount[repayment.loanAccountNumber].total += repayment.totalAmount || 0;
      }
    });
    
    return breakdown;
  }

  // Virtual getter: Formatted amount
  get formattedAmount() {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: this.currency
    }).format(this.amount);
  }

  // Virtual getter: Is processed
  get isProcessed() {
    return this.status === 'processed' || this.status === 'partially_processed';
  }

  // Virtual getter: Total loan repayments
  async totalLoanRepayments() {
    const loanRepayments = await this.getLoanRepayments();
    return loanRepayments.reduce((sum, repayment) => sum + (repayment.totalAmount || 0), 0);
  }

  // Virtual getter: Total savings
  async totalSavings() {
    const savingsCollections = await this.getSavingsCollections();
    return savingsCollections.reduce((sum, savings) => sum + (savings.amount || 0), 0);
  }
}

Collection.init({
  // Primary identifiers
  collectionId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    defaultValue: function() {
      return `COL${Date.now()}${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
    }
  },
  
  // Relationships
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  groupCode: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  groupLoanId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  loanId: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  
  // Collection details
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'NGN',
    validate: {
      isIn: [['NGN', 'USD', 'EUR', 'GBP']]
    }
  },
  collectionDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'approved', 'rejected', 'processed', 'cancelled', 'partially_processed']]
    }
  },
  
  // Loan repayment tracking
  repaymentType: {
    type: DataTypes.STRING(20),
    defaultValue: 'loan_repayment',
    validate: {
      isIn: [['loan_repayment', 'savings', 'insurance', 'fees', 'mixed']]
    }
  },
  
  // Branch and relationship info
  branch: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  branchName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  relationshipManager: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  relationshipManagerName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  // Channel information
  channel: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 6
  },
  channelName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  // Payment method
  paymentMethod: {
    type: DataTypes.STRING(20),
    defaultValue: 'CASH',
    validate: {
      isIn: [['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'POS']]
    }
  },
  transactionReference: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true
  },
  
  // Audit fields
  createdBy: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  createdByName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  processedBy: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  offlineId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  
  // Rejection details
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  rejectedBy: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  rejectedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Legacy system reference
  mysqlId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true
  }
}, {
  sequelize,
  modelName: 'Collection',
  tableName: 'collections',
  timestamps: true,
  hooks: {
    beforeSave: async (collection) => {
      if (collection.changed()) {
        const processingSummary = await collection.getProcessingSummary();
        const loanRepayments = await collection.getLoanRepayments();
        const savingsCollections = await collection.getSavingsCollections();
        
        processingSummary.totalLoanAmount = loanRepayments.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
        processingSummary.totalSavingsAmount = savingsCollections.reduce((sum, s) => sum + (s.amount || 0), 0);
        processingSummary.successfulLoanRepayments = loanRepayments.filter(r => r.status === 'processed').length;
        processingSummary.failedLoanRepayments = loanRepayments.filter(r => r.status === 'failed').length;
        processingSummary.successfulSavings = savingsCollections.filter(s => s.status === 'processed').length;
        processingSummary.failedSavings = savingsCollections.filter(s => s.status === 'failed').length;
        processingSummary.totalProcessedAmount = processingSummary.totalLoanAmount + processingSummary.totalSavingsAmount;
        
        await processingSummary.save();
      }
    }
  },
  scopes: {
    pending: { where: { status: 'pending' } },
    processed: { where: { status: ['processed', 'partially_processed'] } },
    byGroup: (groupId) => ({ where: { groupId } }),
    byGroupLoan: (groupLoanId) => ({ where: { groupLoanId } }),
    byDateRange: (startDate, endDate) => ({
      where: {
        collectionDate: { [Op.between]: [startDate, endDate] }
      }
    }),
    byBranch: (branch) => ({ where: { branch } }),
    byRelationshipManager: (managerId) => ({ where: { relationshipManager: managerId } })
  }
});

// ==================== RELATED MODELS ====================

// LoanRepayment model
class LoanRepayment extends Model {}
LoanRepayment.init({
  collectionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'collections', key: 'id' }
  },
  loanAccountId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  loanAccountNumber: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  customerId: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  customerName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  principalAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  interestAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  penaltyAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  totalAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  installmentNumber: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  repaymentDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  transactionReference: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'pending',
    validate: { isIn: [['pending', 'processed', 'failed', 'reversed']] }
  }
}, {
  sequelize,
  modelName: 'LoanRepayment',
  tableName: 'loan_repayments',
  timestamps: true
});

// SavingsCollection model
class SavingsCollection extends Model {}
SavingsCollection.init({
  collectionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'collections', key: 'id' }
  },
  accountNumber: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  customerId: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  customerName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  savingsType: {
    type: DataTypes.STRING(20),
    defaultValue: 'GROUP_SAVINGS',
    validate: { isIn: [['GROUP_SAVINGS', 'INDIVIDUAL_SAVINGS', 'SPECIAL_SAVINGS']] }
  },
  transactionReference: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'pending',
    validate: { isIn: [['pending', 'processed', 'failed']] }
  }
}, {
  sequelize,
  modelName: 'SavingsCollection',
  tableName: 'savings_collections',
  timestamps: true
});

// ProcessingSummary model
class ProcessingSummary extends Model {}
ProcessingSummary.init({
  collectionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: 'collections', key: 'id' }
  },
  totalLoanAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  totalSavingsAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  totalFeesAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  successfulLoanRepayments: { type: DataTypes.INTEGER, defaultValue: 0 },
  failedLoanRepayments: { type: DataTypes.INTEGER, defaultValue: 0 },
  successfulSavings: { type: DataTypes.INTEGER, defaultValue: 0 },
  failedSavings: { type: DataTypes.INTEGER, defaultValue: 0 },
  repaymentSchedulesUpdated: { type: DataTypes.INTEGER, defaultValue: 0 },
  totalProcessedAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 }
}, {
  sequelize,
  modelName: 'ProcessingSummary',
  tableName: 'processing_summaries',
  timestamps: true
});

// ==================== ASSOCIATIONS ====================
Collection.hasMany(LoanRepayment, { foreignKey: 'collectionId', as: 'loanRepayments' });
Collection.hasMany(SavingsCollection, { foreignKey: 'collectionId', as: 'savingsCollections' });
Collection.hasOne(ProcessingSummary, { foreignKey: 'collectionId', as: 'processingSummary' });

LoanRepayment.belongsTo(Collection, { foreignKey: 'collectionId', as: 'collection' });
SavingsCollection.belongsTo(Collection, { foreignKey: 'collectionId', as: 'collection' });
ProcessingSummary.belongsTo(Collection, { foreignKey: 'collectionId', as: 'collection' });

// Instead of:
// Collection.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
// Collection.belongsTo(GroupLoan, { foreignKey: 'groupLoanId', as: 'groupLoan' });

// ? Correct – use already attached models
if (sequelize.models.Group) {
  Collection.belongsTo(sequelize.models.Group, { foreignKey: 'groupId', as: 'group' });
}
if (sequelize.models.GroupLoan) {
  Collection.belongsTo(sequelize.models.GroupLoan, { foreignKey: 'groupLoanId', as: 'groupLoan' });
}
export default Collection;
export { LoanRepayment, SavingsCollection, ProcessingSummary };
