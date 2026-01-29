import { body, validationResult } from 'express-validator';
import sequelize from '../../config/db.js';
import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { ForbiddenError, NotFoundError } from '../middlewares/errors/index.js';

export const validateRepayment = [
  // Authorization middleware would go here if needed
  
  // Validate ACCT_NO (Loan Account Number)
  body('ACCT_NO')
    .notEmpty().withMessage('Account number is required')
    .isString().withMessage('Account number must be a string')
    .trim()
    .custom(async (value, { req }) => {
      const account = await LoanAccount.findOne({ 
        where: { ACCT_NO: value } 
      });
      
      if (!account) {
        throw new NotFoundError('Loan account not found');
      }
      
      if (account.status !== 'ACTIVE') {
        throw new ForbiddenError('Loan account is not active for repayments');
      }
      
      // Check if loan is not already paid off
      if (account.outstanding_balance <= 0) {
        throw new ForbiddenError('Loan has already been fully repaid');
      }
      
      // Check if loan is not overdue beyond allowed limit
      if (account.is_overdue && account.days_overdue > 90) {
        throw new ForbiddenError('Loan is severely overdue. Please contact customer service');
      }
      
      req.loanAccount = account;
      return true;
    }),

  // Validate CUST_ID
  body('CUST_ID')
    .notEmpty().withMessage('Customer ID is required')
    .isString().withMessage('Customer ID must be a string')
    .trim()
    .custom(async (value, { req }) => {
      // First check if customer exists
      const customer = await CustomerAccount.findOne({ 
        where: { CUST_ID: value }
      });
      
      if (!customer) {
        throw new NotFoundError('Customer account not found');
      }
      
      // Verify customer owns this loan account
      if (req.loanAccount && req.loanAccount.CUST_ID !== value) {
        throw new ForbiddenError('Customer does not own this loan account');
      }
      
      // Check if customer account is active
      if (customer.account_status !== 'ACTIVE') {
        throw new ForbiddenError('Customer account is not active');
      }
      
      req.customerAccount = customer;
      return true;
    }),

  // Validate repayment amount
  body('repayment_amount')
    .notEmpty().withMessage('Repayment amount is required')
    .isFloat({ min: 0.01 }).withMessage('Repayment amount must be greater than 0')
    .custom(async (value, { req }) => {
      if (req.loanAccount) {
        const amount = parseFloat(value);
        const outstanding = parseFloat(req.loanAccount.outstanding_balance || 0);
        const minimumPayment = parseFloat(req.loanAccount.minimum_payment || 0);
        
        // Check if amount is less than minimum payment
        if (amount < minimumPayment) {
          throw new Error(`Repayment amount must be at least ${minimumPayment}`);
        }
        
        // Check if amount exceeds outstanding balance
        if (amount > outstanding) {
          throw new Error(`Repayment amount cannot exceed outstanding balance of ${outstanding}`);
        }
        
        // Check if amount is within acceptable range (not too large)
        const maxSinglePayment = outstanding * 2; // Allow up to double payment
        if (amount > maxSinglePayment) {
          throw new Error('Repayment amount is unusually large. Please contact support');
        }
      }
      return true;
    }),

  // Validate payment method
  body('payment_method')
    .notEmpty().withMessage('Payment method is required')
    .isIn(['BANK_TRANSFER', 'CASH', 'CARD', 'MOBILE_MONEY', 'DIRECT_DEBIT'])
    .withMessage('Invalid payment method'),

  // Validate payment reference
  body('payment_reference')
    .optional()
    .isString().withMessage('Payment reference must be a string')
    .trim()
    .isLength({ max: 50 }).withMessage('Payment reference cannot exceed 50 characters')
    .custom(async (value) => {
      // Check if reference already exists
      const existingPayment = await Repayment.findOne({
        where: { payment_reference: value }
      });
      
      if (existingPayment) {
        throw new Error('Payment reference already used');
      }
      return true;
    }),

  // Validate transaction date
  body('transaction_date')
    .optional()
    .isISO8601().withMessage('Transaction date must be a valid date')
    .toDate()
    .custom((value) => {
      const transactionDate = new Date(value);
      const today = new Date();
      
      // Cannot be future date
      if (transactionDate > today) {
        throw new Error('Transaction date cannot be in the future');
      }
      
      // Cannot be too far in the past (e.g., more than 30 days)
      const maxDaysPast = 30;
      const maxPastDate = new Date();
      maxPastDate.setDate(today.getDate() - maxDaysPast);
      
      if (transactionDate < maxPastDate) {
        throw new Error(`Transaction date cannot be more than ${maxDaysPast} days in the past`);
      }
      
      return true;
    }),

  // Validate currency
  body('currency')
    .optional()
    .isString().withMessage('Currency must be a string')
    .isIn(['NGN', 'USD', 'EUR', 'GBP', 'KES', 'GHS'])
    .withMessage('Invalid currency'),

  // Validate payment notes
  body('payment_notes')
    .optional()
    .isString().withMessage('Payment notes must be a string')
    .trim()
    .isLength({ max: 500 }).withMessage('Payment notes cannot exceed 500 characters'),

  // Validate partial payment flag
  body('is_partial_payment')
    .optional()
    .isBoolean().withMessage('Partial payment flag must be boolean')
    .custom((value, { req }) => {
      if (value === false && req.body.repayment_amount) {
        const amount = parseFloat(req.body.repayment_amount);
        const outstanding = req.loanAccount ? parseFloat(req.loanAccount.outstanding_balance) : 0;
        
        if (amount !== outstanding) {
          throw new Error('Non-partial payment must equal outstanding balance');
        }
      }
      return true;
    }),

  // Error handling middleware
  async (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors: errorMessages,
        timestamp: new Date().toISOString()
      });
    }

    try {
      // Additional business validations
      await performAdditionalValidations(req);
      
      // All validations passed
      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        return res.status(error.statusCode || 400).json({
          success: false,
          message: error.message,
          code: error.code || 'VALIDATION_ERROR'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Internal validation error',
        code: 'INTERNAL_VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  }
];

// Additional business validation function
async function performAdditionalValidations(req) {
  const { loanAccount, customerAccount } = req;
  
  // Check if loan is in grace period
  if (loanAccount.grace_period_end_date && new Date() < new Date(loanAccount.grace_period_end_date)) {
    // Allow repayment but log it's during grace period
    console.log(`Repayment during grace period for account ${loanAccount.ACCT_NO}`);
  }
  
  // Check for payment restrictions (e.g., public holidays, maintenance windows)
  const today = new Date();
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;
  const isHoliday = await checkIfHoliday(today);
  
  if (isHoliday) {
    console.warn(`Payment attempted on holiday for account ${loanAccount.ACCT_NO}`);
  }
  
  // Validate currency matching
  const requestedCurrency = req.body.currency || 'NGN';
  if (loanAccount.currency && loanAccount.currency !== requestedCurrency) {
    throw new ForbiddenError(`Loan is denominated in ${loanAccount.currency}. Please repay in the correct currency`);
  }
  
  // Check repayment frequency limits
  const recentPayments = await getRecentPayments(loanAccount.id);
  if (recentPayments.length >= 5) {
    throw new ForbiddenError('Too many recent payments. Please wait before making another payment');
  }
  
  // Add loan and customer info to request for use in controller
  req.validatedData = {
    loanAccount,
    customerAccount,
    repaymentAmount: parseFloat(req.body.repayment_amount),
    paymentMethod: req.body.payment_method,
    transactionDate: req.body.transaction_date ? new Date(req.body.transaction_date) : new Date(),
    currency: requestedCurrency,
    paymentReference: req.body.payment_reference,
    paymentNotes: req.body.payment_notes || '',
    isPartialPayment: req.body.is_partial_payment !== false
  };
}

// Transaction middleware (Sequelize version)
export const withRepaymentTransaction = async (req, res, next) => {
  const transaction = await sequelize.transaction({
    isolationLevel: sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });
  
  try {
    // Attach transaction to request
    req.transaction = transaction;
    
    // Execute route handler with transaction
    await next();
    
    // Commit transaction if no errors
    await transaction.commit();
    
  } catch (error) {
    // Rollback transaction on error
    if (transaction) {
      await transaction.rollback();
    }
    
    console.error('Repayment transaction error:', {
      error: error.message,
      stack: error.stack,
      account: req.loanAccount?.ACCT_NO,
      customer: req.customerAccount?.CUST_ID
    });
    
    // Handle specific transaction errors
    if (error.name === 'SequelizeDatabaseError') {
      return res.status(503).json({
        success: false,
        message: 'Database error occurred. Please try again',
        code: 'DATABASE_ERROR'
      });
    }
    
    if (error.name === 'SequelizeTimeoutError') {
      return res.status(408).json({
        success: false,
        message: 'Transaction timeout. Please try again',
        code: 'TRANSACTION_TIMEOUT'
      });
    }
    
    next(error);
  }
};

// Helper functions
async function checkIfHoliday(date) {
  // Implement holiday checking logic
  // This could query a holidays table or use an external API
  const holidays = await Holiday.findAll({
    where: {
      holiday_date: {
        [sequelize.Op.eq]: date.toISOString().split('T')[0]
      }
    }
  });
  
  return holidays.length > 0;
}

async function getRecentPayments(loanAccountId, hours = 24) {
  const Repayment = sequelize.models.Repayment; // Assuming you have a Repayment model
  
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hours);
  
  return Repayment.findAll({
    where: {
      loan_account_id: loanAccountId,
      payment_date: {
        [sequelize.Op.gte]: cutoffDate
      },
      payment_status: 'COMPLETED'
    },
    order: [['payment_date', 'DESC']],
    limit: 10
  });
}

// Additional validation middleware for specific scenarios
export const validateRepaymentUpdate = [
  body('repayment_amount')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Repayment amount must be greater than 0'),
  
  body('payment_status')
    .optional()
    .isIn(['PENDING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED'])
    .withMessage('Invalid payment status'),
  
  body('reversal_reason')
    .optional()
    .isString().withMessage('Reversal reason must be a string')
    .isLength({ max: 255 }).withMessage('Reversal reason cannot exceed 255 characters'),
  
  async (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Update validation failed',
        errors: errors.array()
      });
    }
    
    next();
  }
];

// Middleware to verify repayment can be updated
export const verifyRepaymentUpdate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const Repayment = sequelize.models.Repayment;
    
    const repayment = await Repayment.findByPk(id);
    
    if (!repayment) {
      throw new NotFoundError('Repayment record not found');
    }
    
    // Check if repayment can be updated
    if (repayment.payment_status === 'COMPLETED' && req.body.payment_status === 'FAILED') {
      throw new ForbiddenError('Cannot change completed payment to failed');
    }
    
    // Check if reversal is allowed
    if (req.body.payment_status === 'REVERSED' && !req.body.reversal_reason) {
      throw new Error('Reversal reason is required for payment reversal');
    }
    
    req.existingRepayment = repayment;
    next();
  } catch (error) {
    next(error);
  }
};

// Export validation chain as default
export default validateRepayment;