import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
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
      const account = await LoanAccount.findOne({ ACCT_NO: value });
      if (!account) {
        throw new NotFoundError('Loan account not found');
      }
      if (account.status !== 'ACTIVE') {
        throw new ForbiddenError('Loan account is not active for repayments');
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
      const customer = await CustomerAccount.findOne({ 
        CUST_ID: value,
        ACCT_NO: req.body.ACCT_NO 
      });
      if (!customer) {
        throw new NotFoundError('Customer account not found or does not match loan account');
      }
      req.customerAccount = customer;
      return true;
    }),

  // ... rest of your validation chain ...

  // Error handling middleware
  async (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(error => ({
        field: error.param,
        message: error.msg
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errorMessages
      });
    }

    try {
      // Additional business validations
      next();
    } catch (error) {
      next(error);
    }
  }
];

// Transaction middleware
export const withRepaymentTransaction = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    const transactionOptions = {
      readPreference: 'primary',
      readConcern: { level: 'local' },
      writeConcern: { w: 'majority' }
    };

    await session.withTransaction(async () => {
      return next();
    }, transactionOptions);

  } catch (error) {
    console.error('Repayment transaction error:', error);
    next(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

// Named exports only
export default validateRepayment;