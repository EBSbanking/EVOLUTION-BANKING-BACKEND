// src/middlewares/validations/repaymentValidation.js
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanRepayment from '../models/LoanRepayment.js';
import Holiday from '../models/Holiday.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';

// ========== HELPER FUNCTIONS ==========

async function checkIfHoliday(date) {
  try {
    const dateStr = date.toISOString().split('T')[0];
    const holidays = await Holiday.findAll({
      where: {
        date: dateStr
      }
    });
    return holidays.length > 0;
  } catch (error) {
    console.warn('Error checking holiday:', error.message);
    return false;
  }
}

async function getRecentPayments(loanAccountId, hours = 24) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);
    
    return await LoanRepayment.findAll({
      where: {
        loanAccountId: loanAccountId,
        repaymentDate: {
          [Op.gte]: cutoffDate
        },
        status: 'COMPLETED'
      },
      order: [['repaymentDate', 'DESC']],
      limit: 10
    });
  } catch (error) {
    console.warn('Error getting recent payments:', error.message);
    return [];
  }
}

// ========== MAIN VALIDATION ==========

export const validateRepayment = [
  // ========== ACCT_NO Validation ==========
  body('ACCT_NO')
    .notEmpty().withMessage('Account number is required')
    .isString().withMessage('Account number must be a string')
    .trim()
    .custom(async (value, { req }) => {
      const account = await LoanAccount.findOne({ 
        where: { 
          ACCT_NO: value
        } 
      });
      
      if (!account) {
        throw new NotFoundError('Loan account not found');
      }
      
      // Check if loan is active or can accept repayments
      const validStatuses = ['ACTIVE', 'DISBURSED', 'ONGOING', 'OVERDUE', 'DEFAULT'];
      if (!validStatuses.includes(account.LOAN_STATUS?.toUpperCase())) {
        throw new ForbiddenError(`Loan account is not active for repayments. Status: ${account.LOAN_STATUS}`);
      }
      
      // Check if loan is not already paid off
      const outstanding = parseFloat(account.OUTSTANDING_PRINCIPAL || 0);
      if (outstanding <= 0) {
        throw new ForbiddenError('Loan has already been fully repaid');
      }
      
      req.loanAccount = account;
      return true;
    }),

  // ========== CUST_ID Validation (optional) ==========
  body('CUST_ID')
    .optional()
    .isString().withMessage('Customer ID must be a string')
    .trim()
    .custom(async (value, { req }) => {
      if (!value) return true;
      
      const customer = await CustomerAccount.findOne({ 
        where: { 
          [Op.or]: [
            { CUST_ID: value },
            { customer_id: value }
          ]
        }
      });
      
      if (!customer) {
        throw new NotFoundError('Customer account not found');
      }
      
      if (req.loanAccount) {
        const loanCustId = req.loanAccount.CUST_ID;
        if (loanCustId && loanCustId.toString() !== value.toString()) {
          throw new ForbiddenError('Customer does not own this loan account');
        }
      }
      
      req.customerAccount = customer;
      return true;
    }),

  // ========== amount Validation ==========
  body('amount')
    .notEmpty().withMessage('Repayment amount is required')
    .isFloat({ min: 0.01 }).withMessage('Repayment amount must be greater than 0')
    .custom(async (value, { req }) => {
      if (req.loanAccount) {
        const amount = parseFloat(value);
        const outstanding = parseFloat(req.loanAccount.OUTSTANDING_PRINCIPAL || 0);
        const accruedInterest = parseFloat(req.loanAccount.ACCRUED_INTEREST || 0);
        const penalty = parseFloat(req.loanAccount.PENALTY_AMOUNT || 0);
        const totalOutstanding = outstanding + accruedInterest + penalty;
        
        if (amount > totalOutstanding) {
          throw new Error(`Repayment amount cannot exceed outstanding balance of ${totalOutstanding}`);
        }
        
        const maxSinglePayment = totalOutstanding * 2;
        if (amount > maxSinglePayment) {
          throw new Error('Repayment amount is unusually large. Please contact support');
        }
      }
      return true;
    }),

  // ========== customerAccountNo Validation ==========
  body('customerAccountNo')
    .optional()
    .isString().withMessage('Customer account number must be a string')
    .trim()
    .custom(async (value, { req }) => {
      if (!value) return true;
      
      const account = await CustomerAccount.findOne({
        where: {
          account_number: value
        }
      });
      
      if (!account) {
        throw new NotFoundError('Customer account not found');
      }
      
      req.customerDepositAccount = account;
      return true;
    }),

  // ========== paymentMethod Validation ==========
  body('paymentMethod')
    .notEmpty().withMessage('Payment method is required')
    .isIn(['BANK_TRANSFER', 'CASH', 'CARD', 'MOBILE_MONEY', 'DIRECT_DEBIT', 'CHEQUE'])
    .withMessage('Invalid payment method'),

  // ========== reference Validation ==========
  body('reference')
    .optional()
    .isString().withMessage('Payment reference must be a string')
    .trim()
    .isLength({ max: 100 }).withMessage('Payment reference cannot exceed 100 characters')
    .custom(async (value) => {
      if (value) {
        const existingPayment = await LoanRepayment.findOne({
          where: { transactionReference: value }
        });
        
        if (existingPayment) {
          throw new Error('Payment reference already used');
        }
      }
      return true;
    }),

  // ========== date Validation ==========
  body('date')
    .optional()
    .isISO8601().withMessage('Date must be a valid date')
    .toDate()
    .custom((value) => {
      const transactionDate = new Date(value);
      const today = new Date();
      
      if (transactionDate > today) {
        throw new Error('Transaction date cannot be in the future');
      }
      
      const maxDaysPast = 30;
      const maxPastDate = new Date();
      maxPastDate.setDate(today.getDate() - maxDaysPast);
      
      if (transactionDate < maxPastDate) {
        throw new Error(`Transaction date cannot be more than ${maxDaysPast} days in the past`);
      }
      
      return true;
    }),

  // ========== description Validation ==========
  body('description')
    .optional()
    .isString().withMessage('Description must be a string')
    .trim()
    .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),

  // ========== createdBy Validation ==========
  body('createdBy')
    .optional()
    .isString().withMessage('Created by must be a string')
    .trim()
    .isLength({ max: 100 }).withMessage('Created by cannot exceed 100 characters'),

  // ========== interestAmount Validation ==========
  body('interestAmount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Interest amount must be a positive number'),

  // ========== penaltyAmount Validation ==========
  body('penaltyAmount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Penalty amount must be a positive number'),

  // ========== Error Handler ==========
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
      await performAdditionalValidations(req);
      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        return res.status(error.statusCode || 400).json({
          success: false,
          message: error.message,
          code: error.code || 'VALIDATION_ERROR',
          timestamp: new Date().toISOString()
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

// ========== ADDITIONAL VALIDATIONS ==========

async function performAdditionalValidations(req) {
  const { loanAccount } = req;
  
  if (!loanAccount) {
    throw new Error('Loan account not found in request');
  }
  
  // Check for payment restrictions (holidays)
  const today = new Date();
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;
  const isHoliday = await checkIfHoliday(today);
  
  if (isHoliday || isWeekend) {
    console.warn(`Payment attempted on ${isHoliday ? 'holiday' : 'weekend'} for account ${loanAccount.ACCT_NO}`);
  }
  
  // Store validated data
  req.validatedData = {
    loanAccount,
    customerAccount: req.customerAccount || null,
    customerDepositAccount: req.customerDepositAccount || null,
    repaymentAmount: parseFloat(req.body.amount),
    paymentMethod: req.body.paymentMethod,
    transactionDate: req.body.date ? new Date(req.body.date) : new Date(),
    reference: req.body.reference || null,
    description: req.body.description || '',
    createdBy: req.body.createdBy || 'SYSTEM',
    interestAmount: parseFloat(req.body.interestAmount || 0),
    penaltyAmount: parseFloat(req.body.penaltyAmount || 0),
    customerAccountNo: req.body.customerAccountNo || null
  };
}

// ========== TRANSACTION MIDDLEWARE ==========

export const withRepaymentTransaction = async (req, res, next) => {
  const transaction = await sequelize.transaction({
    isolationLevel: sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });
  
  try {
    req.transaction = transaction;
    await next();
    await transaction.commit();
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    
    console.error('Repayment transaction error:', {
      error: error.message,
      stack: error.stack,
      account: req.loanAccount?.ACCT_NO
    });
    
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

// ========== UPDATE VALIDATION ==========

export const validateRepaymentUpdate = [
  body('status')
    .optional()
    .isIn(['PENDING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED'])
    .withMessage('Invalid payment status'),

  body('reversalReason')
    .optional()
    .isString().withMessage('Reversal reason must be a string')
    .isLength({ max: 255 }).withMessage('Reversal reason cannot exceed 255 characters'),

  body('amount')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),

  body('reference')
    .optional()
    .isString().withMessage('Reference must be a string')
    .trim()
    .isLength({ max: 100 }).withMessage('Reference cannot exceed 100 characters'),

  body('updatedBy')
    .optional()
    .isString().withMessage('Updated by must be a string')
    .trim()
    .isLength({ max: 100 }).withMessage('Updated by cannot exceed 100 characters'),

  body('notes')
    .optional()
    .isString().withMessage('Notes must be a string')
    .trim()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters'),

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
        message: 'Update validation failed',
        code: 'VALIDATION_ERROR',
        errors: errorMessages,
        timestamp: new Date().toISOString()
      });
    }

    next();
  }
];

// ========== VERIFY REPAYMENT UPDATE ==========

export const verifyRepaymentUpdate = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      throw new Error('Valid repayment ID is required');
    }
    
    const repayment = await LoanRepayment.findByPk(id);
    
    if (!repayment) {
      throw new NotFoundError('Repayment record not found');
    }
    
    if (repayment.status === 'COMPLETED' && req.body.status === 'FAILED') {
      throw new ForbiddenError('Cannot change completed payment to failed');
    }
    
    if (repayment.status === 'COMPLETED' && req.body.status === 'PENDING') {
      throw new ForbiddenError('Cannot change completed payment back to pending');
    }
    
    if (req.body.status === 'REVERSED' && !req.body.reversalReason) {
      throw new Error('Reversal reason is required for payment reversal');
    }
    
    if (repayment.status === 'COMPLETED' && req.body.amount && req.body.amount !== repayment.totalAmount) {
      throw new ForbiddenError('Cannot modify amount of a completed transaction');
    }
    
    if (req.body.status === 'CANCELLED' && repayment.status === 'COMPLETED') {
      throw new ForbiddenError('Cannot cancel a completed transaction');
    }
    
    req.existingRepayment = repayment;
    next();
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code || 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }
    next(error);
  }
};

// ========== BULK UPDATE VALIDATION ==========

export const validateBulkRepaymentUpdate = [
  body('repayments')
    .isArray({ min: 1 }).withMessage('Repayments must be a non-empty array')
    .custom((value) => {
      for (const repayment of value) {
        if (!repayment.id) {
          throw new Error('Each repayment must have an id');
        }
        if (!repayment.status) {
          throw new Error('Each repayment must have a status');
        }
        if (!['PENDING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED'].includes(repayment.status)) {
          throw new Error(`Invalid status: ${repayment.status}`);
        }
      }
      return true;
    }),

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
        message: 'Bulk update validation failed',
        code: 'VALIDATION_ERROR',
        errors: errorMessages,
        timestamp: new Date().toISOString()
      });
    }

    next();
  }
];

// ========== EXPORTS ==========

export default {
  validateRepayment,
  withRepaymentTransaction,
  validateRepaymentUpdate,
  verifyRepaymentUpdate,
  validateBulkRepaymentUpdate
};