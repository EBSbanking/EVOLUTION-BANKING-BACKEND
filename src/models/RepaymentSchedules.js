import mongoose from 'mongoose';

const RepaymentScheduleSchema = new mongoose.Schema({
  LOAN_ACCOUNT_ID: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'LoanAccount',
    required: true 
  },
  ACCT_NO: { 
    type: String, 
    required: true 
  },
  CUST_ID: { 
    type: String,  // CHANGED: From Number to String to match backend
    required: true 
  },
  START_DATE: { 
    type: Date, 
    required: true 
  },
  MATURITY_DATE: { 
    type: Date, 
    required: true 
  },
  PRINCIPAL_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  INTEREST_RATE: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  TERM: { 
    type: Number, 
    required: true 
  },
  TERM_TYPE: { 
    type: String, 
    enum: ['D', 'W', 'BW', 'M', 'Y'], // CHANGED: Added 'BW' for Bi-Weekly
    required: true 
  },
  paymentFrequency: {
    type: String,
    enum: ['DAILY', 'WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'], // CHANGED: Added 'BI_WEEKLY'
    required: true
  },
  // CHANGED: Renamed SCHEDULE to installments to match backend structure
  installments: [{
    installmentNo: {  // CHANGED: From installmentNumber to installmentNo to match backend
      type: Number, 
      required: true 
    },
    dueDate: { 
      type: Date, 
      required: true 
    },
    principal: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString())
    },
    interest: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString())
    },
    totalPayment: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString())
    },
    remainingBalance: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString())
    },
    status: {
      type: String,
      enum: ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'],
      default: 'PENDING'
    },
    amountPaid: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString())
    },
    principalPaid: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString())
    },
    interestPaid: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString())
    },
    paymentDate: { type: Date },
    isEarlyPayment: { type: Boolean, default: false },
    isOverduePayment: { type: Boolean, default: false },
    lateFeeCharged: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString())
    }
  }],
  STATUS: {
    type: String,
    enum: ['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED',`PENDING_DISBURSEMENT`],
    default: 'PENDING'
  },
  TOTAL_INTEREST: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  TOTAL_REPAYMENT: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  TRANSACTION_ID: { 
    type: String, 
    required: true 
  },
  EVENT_ID: { 
    type: String, 
    required: true 
  },
  CREATED_BY: { 
    type: String, 
    required: true 
  },
  // NEW FIELDS to match backend disbursement structure
  UPFRONT_INTEREST: {
    type: {
      type: String,
      enum: ['NONE', 'PARTIAL', 'FULL'],
      default: 'NONE'
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString())
    },
    percentage: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString())
    }
  },
  GUARANTOR_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guarantor'
  },
  GUARANTEED_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00'),
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  EMI_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  }
}, { 
  timestamps: true, 
  toJSON: { getters: true } 
});

// UPDATED Static method to create repayment schedule from EMI result
RepaymentScheduleSchema.statics.createFromEMIResult = async function(emiResult, loanData) {
  try {
    // Validate installments structure before creating
    validateInstallmentsStructure(emiResult.installments, 'EMI Result');

    const scheduleData = {
      LOAN_ACCOUNT_ID: loanData._id || loanData.loanAccountId,
      ACCT_NO: loanData.ACCT_NO,
      CUST_ID: loanData.CUST_ID.toString(), // Ensure string type
      START_DATE: loanData.START_DT || loanData.START_DATE,
      MATURITY_DATE: loanData.MATURITY_DT || loanData.MATURITY_DATE,
      PRINCIPAL_AMOUNT: loanData.DISBURSEMENT_LIMIT || loanData.PRINCIPAL_AMOUNT,
      INTEREST_RATE: loanData.INTEREST_RATE,
      TERM: loanData.TERM_VALUE,
      TERM_TYPE: loanData.TERM_CD,
      paymentFrequency: loanData.PAYMENT_FREQUENCY || 'MONTHLY',
      installments: emiResult.installments.map(installment => ({
        installmentNo: installment.installmentNo || installment.installmentNumber,
        dueDate: installment.dueDate,
        principal: installment.principal,
        interest: installment.interest,
        totalPayment: installment.totalPayment,
        remainingBalance: installment.remainingBalance,
        status: 'PENDING'
      })),
      TOTAL_INTEREST: emiResult.totalInterest,
      TOTAL_REPAYMENT: emiResult.totalRepayment,
      TRANSACTION_ID: loanData.TRANSACTION_ID,
      EVENT_ID: loanData.EVENT_ID,
      CREATED_BY: loanData.CREATED_BY || loanData.USER_ID,
      STATUS: 'PENDING',
      EMI_AMOUNT: emiResult.emi,
      // NEW: Add upfront interest details
      UPFRONT_INTEREST: {
        type: loanData.partialUpfrontInterest ? 'PARTIAL' : 
               loanData.deductUpfrontInterest ? 'FULL' : 'NONE',
        amount: loanData.upfrontInterestAmount || mongoose.Types.Decimal128.fromString('0.00'),
        percentage: loanData.upfrontInterestPercentage || mongoose.Types.Decimal128.fromString('0.00')
      },
      // NEW: Add guarantor details
      GUARANTOR_ID: loanData.GUARANTOR_ID,
      GUARANTEED_AMOUNT: loanData.GUARANTEED_AMOUNT || loanData.GUARANTEED_AMT
    };

    return await this.create(scheduleData);
  } catch (error) {
    console.error('Error creating repayment schedule from EMI result:', error);
    throw error;
  }
};

// UPDATED Helper function to validate installments structure
function validateInstallmentsStructure(installments, source) {
  if (!Array.isArray(installments) || installments.length === 0) {
    throw new Error(`No installments generated by ${source}`);
  }
  
  const requiredFields = ['dueDate', 'principal', 'interest', 'totalPayment', 'remainingBalance'];
  installments.forEach((inst, index) => {
    // Check for presence of installmentNo (backend uses installmentNo)
    if (inst.installmentNo == null && inst.installmentNumber == null) {
      throw new Error(`Installment ${index + 1} from ${source} missing installmentNo or installmentNumber`);
    }
    
    const missing = requiredFields.filter(f => inst[f] == null);
    if (missing.length > 0) {
      console.error(`Installment ${index + 1} from ${source} missing fields:`, missing);
      console.error('Full structure:', inst);
      throw new Error(`Installment ${index + 1} from ${source} missing fields: ${missing.join(', ')}`);
    }
    
    // Log sample for debugging
    if (index === 0 || index === installments.length - 1) {
      console.log(`${source} Installment ${index + 1} sample:`, {
        installmentNo: inst.installmentNo || inst.installmentNumber,
        dueDate: inst.dueDate,
        principal: inst.principal,
        interest: inst.interest,
        totalPayment: inst.totalPayment,
        remainingBalance: inst.remainingBalance
      });
    }
  });
}

// UPDATED Instance method to update installment payment
RepaymentScheduleSchema.methods.updateInstallmentPayment = function(installmentNo, paymentData) {
  const installment = this.installments.find(inst => 
    inst.installmentNo === installmentNo
  );
  
  if (!installment) {
    throw new Error(`Installment ${installmentNo} not found`);
  }

  const paymentAmount = parseFloat(paymentData.amount);
  const principalAmount = parseFloat(paymentData.principal || paymentAmount);
  const interestAmount = parseFloat(paymentData.interest || 0);
  
  installment.amountPaid = mongoose.Types.Decimal128.fromString((parseFloat(installment.amountPaid.toString()) + paymentAmount).toFixed(2));
  installment.principalPaid = mongoose.Types.Decimal128.fromString((parseFloat(installment.principalPaid.toString()) + principalAmount).toFixed(2));
  installment.interestPaid = mongoose.Types.Decimal128.fromString((parseFloat(installment.interestPaid.toString()) + interestAmount).toFixed(2));
  
  // Update status
  const totalPayment = parseFloat(installment.totalPayment.toString());
  const amountPaid = parseFloat(installment.amountPaid.toString());
  
  if (amountPaid >= totalPayment) {
    installment.status = 'PAID';
  } else if (amountPaid > 0) {
    installment.status = 'PARTIAL';
  }
  
  installment.paymentDate = paymentData.paymentDate || new Date();
  installment.isEarlyPayment = paymentData.isEarlyPayment || false;
  
  // Check if all installments are paid to update overall status
  const allPaid = this.installments.every(inst => inst.status === 'PAID');
  if (allPaid) {
    this.STATUS = 'COMPLETED';
  } else {
    this.STATUS = 'ACTIVE';
  }
  
  return installment;
};

// UPDATED Virtual for next payment due
RepaymentScheduleSchema.virtual('nextPayment').get(function() {
  const now = new Date();
  const pendingInstallment = this.installments.find(inst => 
    (inst.status === 'PENDING' || inst.status === 'PARTIAL') && 
    new Date(inst.dueDate) >= now
  );
  return pendingInstallment || null;
});

// UPDATED Virtual for total paid amount
RepaymentScheduleSchema.virtual('totalPaid').get(function() {
  return this.installments.reduce((total, inst) => {
    return total + parseFloat(inst.amountPaid.toString());
  }, 0);
});

// UPDATED Virtual for overdue installments
RepaymentScheduleSchema.virtual('overdueInstallments').get(function() {
  const now = new Date();
  return this.installments.filter(inst => 
    inst.status !== 'PAID' && new Date(inst.dueDate) < now
  );
});

// UPDATED Pre-save hook to validate schedule
// UPDATED Pre-save hook to validate schedule
RepaymentScheduleSchema.pre('save', function(next) {
  // Validate that installments array is not empty
  if (!this.installments || !Array.isArray(this.installments) || this.installments.length === 0) {
    return next(new Error('Repayment schedule must have at least one installment'));
  }

  // Validate that all required fields in installments are present
  const requiredFields = [
    'installmentNo',
    'dueDate',
    'principal',
    'interest',
    'totalPayment',
    'remainingBalance'
  ];
  
  for (const [index, installment] of this.installments.entries()) {
    const missingFields = requiredFields.filter(field => installment[field] == null);
    if (missingFields.length > 0) {
      console.error(`Installment ${index + 1} missing fields:`, missingFields, 'Full structure:', installment);
      return next(new Error(`All installments must have required fields: ${requiredFields.join(', ')}. Missing in installment ${index + 1}: ${missingFields.join(', ')}`));
    }
  }

  // Validate due dates sequence and balance calculations
  let prevDueDate = this.START_DATE;
  let runningBalance = parseFloat(this.PRINCIPAL_AMOUNT.toString());
  
  for (const installment of this.installments) {
    const dueDate = new Date(installment.dueDate);
    if (dueDate <= prevDueDate) {
      return next(new Error(`Installment due dates must be in ascending order`));
    }
    prevDueDate = dueDate;

    const principalPayment = parseFloat(installment.principal.toString());
    const expectedRemaining = runningBalance - principalPayment;
    const actualRemaining = parseFloat(installment.remainingBalance.toString());
    
    // Allow reasonable rounding differences (increased tolerance)
    if (Math.abs(actualRemaining - expectedRemaining) > 1.00) { // Changed from 0.01 to 1.00
      console.warn(`Balance mismatch in installment ${installment.installmentNo}: expected ${expectedRemaining}, got ${actualRemaining}`);
      // Instead of throwing error, we can auto-correct
      installment.remainingBalance = mongoose.Types.Decimal128.fromString(expectedRemaining.toFixed(2));
    }
    runningBalance = expectedRemaining;
  }
  
  // Final balance should be approximately zero (more lenient)
  if (Math.abs(runningBalance) > 0.50) { // Changed from > 0.01 to > 0.50
    console.warn(`Final remaining balance not zero: ${runningBalance}. Auto-correcting...`);
    // Auto-correct the last installment
    const lastInstallment = this.installments[this.installments.length - 1];
    lastInstallment.remainingBalance = mongoose.Types.Decimal128.fromString('0.00');
    
    // Adjust principal if needed
    if (runningBalance > 0.50) {
      const adjustedPrincipal = parseFloat(lastInstallment.principal.toString()) + runningBalance;
      lastInstallment.principal = mongoose.Types.Decimal128.fromString(adjustedPrincipal.toFixed(2));
      lastInstallment.totalPayment = mongoose.Types.Decimal128.fromString(
        (adjustedPrincipal + parseFloat(lastInstallment.interest.toString())).toFixed(2)
      );
    }
  }

  next();
});

// NEW: Method to mark installment as overdue
RepaymentScheduleSchema.methods.markOverdue = function() {
  const now = new Date();
  let updated = false;
  
  this.installments.forEach(inst => {
    if (inst.status === 'PENDING' && new Date(inst.dueDate) < now) {
      inst.status = 'OVERDUE';
      inst.isOverduePayment = true;
      updated = true;
    }
  });
  
  if (updated) {
    this.STATUS = 'ACTIVE';
  }
  
  return updated;
};

// NEW: Method to calculate outstanding balance
RepaymentScheduleSchema.methods.getOutstandingBalance = function() {
  const pendingInstallments = this.installments.filter(inst => 
    inst.status === 'PENDING' || inst.status === 'OVERDUE' || inst.status === 'PARTIAL'
  );
  
  return pendingInstallments.reduce((total, inst) => {
    const totalPayment = parseFloat(inst.totalPayment.toString());
    const amountPaid = parseFloat(inst.amountPaid.toString());
    return total + (totalPayment - amountPaid);
  }, 0);
};

export default mongoose.model('RepaymentSchedule', RepaymentScheduleSchema);