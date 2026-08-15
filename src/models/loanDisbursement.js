// models/LoanDisbursement.js – camelCase attributes, underscored: false
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class LoanDisbursement extends Model {
  // static methods (camelCase parameters)
  static findByApplicationId(applicationId) {
    return this.findOne({ where: { applicationId } });
  }

  static findByAccountNumber(accountNumber) {
    return this.findAll({ where: { accountNumber }, order: [['disbursementDate', 'DESC']] });
  }

  static findByCustomerId(customerId) {
    return this.findAll({ where: { customerId }, order: [['disbursementDate', 'DESC']] });
  }

  static findByStatus(status) {
    return this.findAll({ where: { status }, order: [['disbursementDate', 'DESC']] });
  }

  static findPendingDisbursements() {
    return this.findAll({ where: { status: 'PENDING' }, order: [['createdAt', 'ASC']] });
  }

  static findByDateRange(startDate, endDate) {
    return this.findAll({ 
      where: { 
        disbursementDate: { [Op.between]: [startDate, endDate] } 
      }, 
      order: [['disbursementDate', 'DESC']] 
    });
  }

  // instance methods
  async approve(approvedBy) {
    return this.update({ 
      status: 'APPROVED', 
      approvedBy, 
      approvalDate: new Date() 
    });
  }

  async reject(reason, rejectedBy) {
    return this.update({ 
      status: 'REJECTED', 
      failureReason: reason, 
      approvedBy: rejectedBy, 
      approvalDate: new Date() 
    });
  }

  async execute(executedBy) {
    return this.update({ 
      status: 'EXECUTED', 
      executedBy, 
      executionDate: new Date(), 
      disbursementDate: new Date() 
    });
  }

  async disburse(disbursedBy, transactionReference = null) {
    const updateData = { 
      status: 'DISBURSED', 
      disbursedBy, 
      executionDate: new Date(), 
      disbursementDate: new Date() 
    };
    if (transactionReference) updateData.transactionReference = transactionReference;
    return this.update(updateData);
  }

  async cancel(reason, cancelledBy) {
    return this.update({ 
      status: 'CANCELLED', 
      cancellationReason: reason, 
      approvedBy: cancelledBy, 
      approvalDate: new Date() 
    });
  }

  async fail(reason) {
    return this.update({ 
      status: 'FAILED', 
      failureReason: reason 
    });
  }

  async updateEMI(newEMI) {
    return this.update({ emiAmount: newEMI });
  }

  async updateInterestRate(newRate) {
    return this.update({ interestRate: newRate });
  }

  isPending() { return this.status === 'PENDING'; }
  isApproved() { return this.status === 'APPROVED'; }
  isExecuted() { return this.status === 'EXECUTED'; }
  isDisbursed() { return this.status === 'DISBURSED'; }
  isRejected() { return this.status === 'REJECTED'; }
  isFailed() { return this.status === 'FAILED'; }
  isCancelled() { return this.status === 'CANCELLED'; }

  calculateEMI() {
    const principal = parseFloat(this.amount) || 0;
    const annualRate = parseFloat(this.interestRate) || 0;
    const term = this.termValue || 1;
    const method = this.calculationMethod || 'REDUCING_BALANCE';
    let emi;
    
    if (method === 'FLAT_RATE' || method === 'FIXED_RATE') {
      const totalInterest = principal * (annualRate / 100);
      emi = (principal + totalInterest) / term;
    } else {
      const monthlyRate = annualRate / 100 / 12;
      if (monthlyRate === 0) emi = principal / term;
      else emi = principal * monthlyRate * Math.pow(1 + monthlyRate, term) / (Math.pow(1 + monthlyRate, term) - 1);
    }
    return isFinite(emi) ? emi.toFixed(2) : '0.00';
  }

  calculateNetDisbursement() {
    const amount = parseFloat(this.amount) || 0;
    const fees = parseFloat(this.feesAmount) || 0;
    const upfront = parseFloat(this.upfrontInterestAmount) || 0;
    const net = amount - fees - upfront;
    return net > 0 ? net.toFixed(2) : '0.00';
  }

  calculateTotalInterest() {
    const principal = parseFloat(this.amount) || 0;
    const annualRate = parseFloat(this.interestRate) || 0;
    const term = this.termValue || 1;
    const method = this.calculationMethod || 'REDUCING_BALANCE';
    
    if (method === 'FLAT_RATE' || method === 'FIXED_RATE') {
      return (principal * (annualRate / 100)).toFixed(2);
    } else {
      const emi = parseFloat(this.calculateEMI());
      const totalRepayment = emi * term;
      return (totalRepayment - principal).toFixed(2);
    }
  }

  calculateTotalRepayment() {
    const principal = parseFloat(this.amount) || 0;
    const totalInterest = parseFloat(this.calculateTotalInterest());
    return (principal + totalInterest).toFixed(2);
  }

  getDisbursementDetails() {
    return {
      id: this.id,
      accountNumber: this.accountNumber,
      applicationId: this.applicationId,
      customerId: this.customerId,
      amount: parseFloat(this.amount) || 0,
      interestRate: parseFloat(this.interestRate) || 0,
      termValue: this.termValue,
      termCode: this.termCode,
      emiAmount: parseFloat(this.emiAmount) || 0,
      netDisbursementAmount: parseFloat(this.netDisbursementAmount) || 0,
      status: this.status,
      disbursementDate: this.disbursementDate,
      startDate: this.startDate,
      maturityDate: this.maturityDate,
      transactionReference: this.transactionReference,
      createdBy: this.createdBy,
      approvedBy: this.approvedBy,
      approvalDate: this.approvalDate
    };
  }

  get principalAmount() { return parseFloat(this.amount) || 0; }
  get emiAmountNumeric() { return parseFloat(this.emiAmount) || 0; }
  get netAmountNumeric() { return parseFloat(this.netDisbursementAmount) || 0; }
  get totalInterestNumeric() { return parseFloat(this.totalInterest) || 0; }
  get totalRepaymentNumeric() { return parseFloat(this.totalRepayment) || 0; }

  get daysSinceDisbursement() {
    if (!this.disbursementDate) return null;
    const diff = new Date() - new Date(this.disbursementDate);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  get loanDurationDays() {
    if (!this.startDate || !this.maturityDate) return null;
    const diff = new Date(this.maturityDate) - new Date(this.startDate);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  get isActiveLoan() { 
    return this.isDisbursed() && (!this.maturityDate || new Date(this.maturityDate) > new Date()); 
  }
}

LoanDisbursement.init({
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },
  accountNumber: { 
    type: DataTypes.STRING(20), 
    allowNull: false 
  },
  interestRate: { 
    type: DataTypes.DECIMAL(6,4), 
    allowNull: false 
  },
  termValue: { 
    type: DataTypes.INTEGER, 
    allowNull: false 
  },
  termCode: { 
    type: DataTypes.STRING(10), 
    allowNull: false, 
    defaultValue: 'M' 
    // ✅ Validation removed - no isIn validation anymore
  },
  amount: { 
    type: DataTypes.DECIMAL(15,2), 
    allowNull: false 
  },
  customerId: { 
    type: DataTypes.STRING(20), 
    allowNull: false 
  },
  applicationId: { 
    type: DataTypes.STRING(50), 
    allowNull: false, 
    unique: true 
  },
  calculationMethod: { 
    type: DataTypes.STRING(20), 
    defaultValue: 'REDUCING_BALANCE' 
  },
  paymentFrequency: { 
    type: DataTypes.STRING(20), 
    defaultValue: 'MONTHLY' 
  },
  emiAmount: { 
    type: DataTypes.DECIMAL(15,2) 
  },
  totalInterest: { 
    type: DataTypes.DECIMAL(15,2) 
  },
  totalRepayment: { 
    type: DataTypes.DECIMAL(15,2) 
  },
  interestConfiguration: { 
    type: DataTypes.JSON, 
    defaultValue: {} 
  },
  loanAccountId: { 
    type: DataTypes.INTEGER, 
    allowNull: false 
  },
  creditApplicationId: { 
    type: DataTypes.INTEGER 
  },
  guarantorId: { 
    type: DataTypes.INTEGER, 
    allowNull: false 
  },
  repaymentScheduleId: { 
    type: DataTypes.INTEGER 
  },
  productId: { 
    type: DataTypes.INTEGER, 
    allowNull: false 
  },
  productType: { 
    type: DataTypes.STRING(20), 
    allowNull: false 
  },
  accountName: { 
    type: DataTypes.STRING(100), 
    allowNull: false 
  },
  currencyId: { 
    type: DataTypes.STRING(3), 
    defaultValue: 'NGN' 
  },
  businessUnitId: { 
    type: DataTypes.STRING(10), 
    allowNull: false 
  },
  primaryOfficerId: { 
    type: DataTypes.STRING(20), 
    allowNull: false 
  },
  repaymentSourceAccount: { 
    type: DataTypes.STRING(20), 
    allowNull: false 
  },
  startDate: { 
    type: DataTypes.DATE, 
    allowNull: false 
  },
  maturityDate: { 
    type: DataTypes.DATE, 
    allowNull: false 
  },
  loanCycle: { 
    type: DataTypes.INTEGER, 
    defaultValue: 1 
  },
  disbursementDate: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  },
  feesAmount: { 
    type: DataTypes.DECIMAL(15,2), 
    defaultValue: 0 
  },
  upfrontInterestAmount: { 
    type: DataTypes.DECIMAL(15,2), 
    defaultValue: 0 
  },
  netDisbursementAmount: { 
    type: DataTypes.DECIMAL(15,2) 
  },
  status: { 
    type: DataTypes.STRING(20), 
    defaultValue: 'PENDING' 
  },
  disbursementType: { 
    type: DataTypes.STRING(20), 
    defaultValue: 'CUSTOMER_ACCOUNT' 
  },
  transactionId: { 
    type: DataTypes.STRING(50), 
    allowNull: false 
  },
  eventId: { 
    type: DataTypes.STRING(50), 
    allowNull: false 
  },
  journalId: { 
    type: DataTypes.STRING(50) 
  },
  transactionReference: { 
    type: DataTypes.STRING(50), 
    unique: true 
  },
  createdBy: { 
    type: DataTypes.STRING(50), 
    allowNull: false 
  },
  approvedBy: { 
    type: DataTypes.STRING(50) 
  },
  approvalDate: { 
    type: DataTypes.DATE 
  },
  executedBy: { 
    type: DataTypes.STRING(50) 
  },
  executionDate: { 
    type: DataTypes.DATE 
  },
  disbursedBy: { 
    type: DataTypes.STRING(50) 
  },
  remarks: { 
    type: DataTypes.STRING(500) 
  },
  failureReason: { 
    type: DataTypes.TEXT 
  },
  cancellationReason: { 
    type: DataTypes.TEXT 
  },
  transactionNotes: { 
    type: DataTypes.STRING(1000) 
  },
  borrowerAddress: { 
    type: DataTypes.JSON, 
    defaultValue: { 
      street: '', 
      city: '', 
      state: '', 
      zipCode: '', 
      country: 'Nigeria' 
    } 
  },
  repaymentScheduleJson: { 
    type: DataTypes.JSON, 
    defaultValue: [] 
  },
  createdAt: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  },
  updatedAt: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  }
}, {
  sequelize,
  modelName: 'LoanDisbursement',
  tableName: 'loan_disbursements',
  timestamps: true,
  underscored: false,
  indexes: [
    { fields: ['applicationId'], unique: true },
    { fields: ['accountNumber'] },
    { fields: ['customerId'] },
    { fields: ['loanAccountId'] },
    { fields: ['guarantorId'] },
    { fields: ['status', 'disbursementDate'] },
    { fields: ['transactionId'] },
    { fields: ['productId'] },
    { fields: ['startDate'] },
    { fields: ['maturityDate'] },
    { fields: ['transactionReference'], unique: true }
  ]
});

export default LoanDisbursement;
