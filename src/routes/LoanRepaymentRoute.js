import express from 'express';
import sequelize from '../../config/db.js'; // Import your Sequelize instance
import { 
    handleLoanRepayment as repayLoan, 
    getRepaymentHistory 
} from '../controllers/LoanRepaymentController.js';
import { validateRepayment, withRepaymentTransaction } from '../middlewares/loanRepaymentValidation.js';

const router = express.Router();

// Route for loan repayment (Sequelize version)
router.post('/repay-loan', 
    validateRepayment, // This now uses Sequelize validation
    withRepaymentTransaction, // This uses Sequelize transactions
    async (req, res) => {
        try {
            // The transaction is already started in withRepaymentTransaction middleware
            // and attached to req.transaction
            await repayLoan(req, res);
            // Transaction is committed in withRepaymentTransaction middleware after successful execution
        } catch (error) {
            // Error is already handled in withRepaymentTransaction middleware
            // Log additional details if needed
            console.error('Loan repayment route error:', error);
            
            if (!res.headersSent) {
                return res.status(500).json({
                    success: false,
                    message: 'Loan repayment failed',
                    code: 'REPAYMENT_PROCESSING_ERROR',
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
    }
);

// Alternative simplified version without the transaction wrapper middleware
router.post('/repay-loan-simple', 
    validateRepayment,
    async (req, res) => {
        const transaction = await sequelize.transaction();
        
        try {
            // Attach transaction to request for controller use
            req.transaction = transaction;
            
            await repayLoan(req, res);
            
            // Only commit if controller didn't send response yet
            if (!res.headersSent) {
                await transaction.commit();
                console.log(`Transaction committed for loan repayment: ${req.body.ACCT_NO}`);
            }
        } catch (error) {
            // Rollback transaction on error
            if (transaction) {
                await transaction.rollback();
                console.log(`Transaction rolled back for loan repayment: ${req.body.ACCT_NO}`);
            }
            
            console.error('Loan repayment transaction error:', error);
            
            if (!res.headersSent) {
                // Handle specific error types
                if (error.name === 'SequelizeValidationError') {
                    return res.status(400).json({
                        success: false,
                        message: 'Validation error',
                        errors: error.errors?.map(err => ({
                            field: err.path,
                            message: err.message,
                            value: err.value
                        })),
                        code: 'VALIDATION_ERROR'
                    });
                }
                
                if (error.name === 'SequelizeUniqueConstraintError') {
                    return res.status(409).json({
                        success: false,
                        message: 'Duplicate transaction detected',
                        code: 'DUPLICATE_TRANSACTION',
                        details: error.errors
                    });
                }
                
                if (error.name === 'SequelizeForeignKeyConstraintError') {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid reference data',
                        code: 'REFERENCE_ERROR',
                        details: error.message
                    });
                }
                
                res.status(500).json({
                    success: false,
                    message: 'Loan repayment failed',
                    code: 'REPAYMENT_PROCESSING_ERROR',
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
    }
);

// Route for repayment history with parameter validation
router.get('/repayment-history', 
    async (req, res) => {
        try {
            const { ACCT_NO, CUST_ID, startDate, endDate, page = 1, limit = 20 } = req.query;
            
            // Validate account number
            if (!ACCT_NO) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Account number (ACCT_NO) is required as a query parameter',
                    code: 'MISSING_ACCOUNT_NUMBER'
                });
            }
            
            // Optionally validate format (adjust regex as needed)
            const accountRegex = /^[A-Z0-9\-_]+$/;
            if (!accountRegex.test(ACCT_NO)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid account number format',
                    code: 'INVALID_ACCOUNT_FORMAT'
                });
            }
            
            // Validate dates if provided
            if (startDate) {
                const start = new Date(startDate);
                if (isNaN(start.getTime())) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Invalid start date format. Use ISO format (YYYY-MM-DD)',
                        code: 'INVALID_DATE_FORMAT'
                    });
                }
            }
            
            if (endDate) {
                const end = new Date(endDate);
                if (isNaN(end.getTime())) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Invalid end date format. Use ISO format (YYYY-MM-DD)',
                        code: 'INVALID_DATE_FORMAT'
                    });
                }
            }
            
            // Validate pagination parameters
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            
            if (isNaN(pageNum) || pageNum < 1) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Page must be a positive integer',
                    code: 'INVALID_PAGE_NUMBER'
                });
            }
            
            if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Limit must be between 1 and 100',
                    code: 'INVALID_LIMIT_VALUE'
                });
            }
            
            // Set up pagination in request
            req.pagination = {
                page: pageNum,
                limit: limitNum,
                offset: (pageNum - 1) * limitNum
            };
            
            // Set filter parameters
            req.filters = {
                ACCT_NO,
                CUST_ID,
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null
            };
            
            // Call controller
            await getRepaymentHistory(req, res);
            
        } catch (error) {
            console.error('[History Route Error]', error);
            
            if (!res.headersSent) {
                return res.status(500).json({ 
                    success: false, 
                    message: 'Internal server error while fetching repayment history',
                    code: 'HISTORY_FETCH_ERROR',
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }
);

// Alternative route with route parameter
router.get('/repayment-history/:accountNo', 
    async (req, res) => {
        try {
            const { accountNo } = req.params;
            const { startDate, endDate, page = 1, limit = 20 } = req.query;
            
            // Validate account number from route parameter
            if (!accountNo) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Account number is required',
                    code: 'MISSING_ACCOUNT_NUMBER'
                });
            }
            
            // Set up request parameters
            req.filters = {
                ACCT_NO: accountNo,
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null
            };
            
            req.pagination = {
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 20,
                offset: ((parseInt(page) || 1) - 1) * (parseInt(limit) || 20)
            };
            
            await getRepaymentHistory(req, res);
            
        } catch (error) {
            console.error('[History Route Error]', error);
            
            if (!res.headersSent) {
                return res.status(500).json({ 
                    success: false, 
                    message: 'Internal server error while fetching repayment history',
                    code: 'HISTORY_FETCH_ERROR'
                });
            }
        }
    }
);

// Get repayment summary
router.get('/repayment-summary/:accountNo', 
    async (req, res) => {
        try {
            const { accountNo } = req.params;
            
            if (!accountNo) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Account number is required',
                    code: 'MISSING_ACCOUNT_NUMBER'
                });
            }
            
            // You would typically call a controller function here
            // For now, return a placeholder response
            res.json({
                success: true,
                data: {
                    accountNo,
                    totalRepaid: 0,
                    lastPaymentDate: null,
                    nextPaymentDue: null,
                    outstandingBalance: 0
                },
                message: 'Repayment summary endpoint - implement controller logic'
            });
            
        } catch (error) {
            console.error('[Summary Route Error]', error);
            res.status(500).json({ 
                success: false, 
                message: 'Internal server error while fetching repayment summary',
                code: 'SUMMARY_FETCH_ERROR'
            });
        }
    }
);

export default router;