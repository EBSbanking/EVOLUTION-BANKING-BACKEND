// middlewares/loanRepaymentValidation.js
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';

export const validateRepaymentInput = [
    // Validate ACCT_NO (Loan Account Number)
    body('ACCT_NO')
        .notEmpty().withMessage('Account number is required')
        .isInt({ gt: 0 }).withMessage('Account number must be a positive integer')
        .toInt()
        .custom(async (value) => {
            const account = await LoanAccount.findOne({ ACCT_NO: value });
            if (!account) {
                throw new Error('Loan account not found in database');
            }
            return true;
        }),

    // Validate amount with Decimal128 compatibility
    body('amount')
        .notEmpty().withMessage('Amount is required')
        .isFloat({ gt: 0 }).withMessage('Amount must be a positive number')
        .toFloat()
        .customSanitizer(value => mongoose.Types.Decimal128.fromString(value.toString())),

    // Validate date with Mongoose Date compatibility
    body('date')
        .notEmpty().withMessage('Date is required')
        .isISO8601().withMessage('Date must be in ISO8601 format (YYYY-MM-DD)')
        .customSanitizer(value => new Date(value))
        .custom(value => {
            if (value > new Date()) {
                throw new Error('Date cannot be in the future');
            }
            return true;
        }),

    // Validate CUST_ID with database check
    body('CUST_ID')
        .optional()
        .isInt({ gt: 0 }).withMessage('Customer ID must be a positive integer')
        .toInt()
        .custom(async (value, { req }) => {
            const customer = await CustomerAccount.findOne({ 
                CUST_ID: value,
                ACCT_NO: req.body.ACCT_NO 
            });
            if (!customer) {
                throw new Error('Customer ID does not match the account');
            }
            return true;
        }),

    // Modified GL_ACCT_NO validation (as string but checking against LEDGER_NO)
    body('GL_ACCT_NO')
        .notEmpty().withMessage('GL Account number is required')
        .isString().withMessage('GL Account number must be a string')
        .trim()
        .custom(async (value) => {
            // Remove hyphens and convert to number if possible
            const numericValue = Number(value.replace(/-/g, ''));
            if (isNaN(numericValue)) {
                throw new Error('Invalid GL account number format');
            }
            
            const glAccount = await CustomerAccount.findOne({ 
                LEDGER_NO: numericValue 
            });
            
            if (!glAccount) {
                throw new Error('GL account not found in database');
            }
            return true;
        }),

    // Handle validation errors
    async (req, res, next) => {
        const errors = validationResult(req);
        
        if (!errors.isEmpty()) {
            const errorMessages = errors.array().map(error => error.msg);
            return res.status(400).json({
                success: false,
                errors: errorMessages,
                message: 'Validation failed'
            });
        }

        // Additional business logic validation
        try {
            const loanAccount = await LoanAccount.findOne({ ACCT_NO: req.body.ACCT_NO });
            const customerAccount = await CustomerAccount.findOne({ 
                ACCT_NO: req.body.ACCT_NO,
                CUST_ID: req.body.CUST_ID 
            });

            // Check if customer has sufficient balance
            if (customerAccount && parseFloat(customerAccount.AVAILABLE_BALANCE.toString()) < parseFloat(req.body.amount)) {
                return res.status(400).json({
                    success: false,
                    errors: ['Insufficient balance in customer account'],
                    message: 'Validation failed'
                });
            }

            next();
        } catch (dbError) {
            return res.status(500).json({
                success: false,
                errors: ['Database validation error'],
                message: dbError.message
            });
        }
    }
];