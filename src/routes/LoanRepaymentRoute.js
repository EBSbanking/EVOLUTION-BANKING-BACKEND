// routes/loanRepaymentRoutes.js
import express from 'express';
import sequelize from '../../config/db.js';
import { 
    repayLoan, 
    getRepaymentHistory,
    getRepaymentSummary,
    getLoanInstallments  // ✅ Import the new function
} from '../controllers/LoanRepaymentController.js';

const router = express.Router();

// ============================================================
// REPAYMENT ROUTES
// ============================================================

// Route for loan repayment (simplified - no validation)
router.post('/repay-loan', 
    async (req, res) => {
        const transaction = await sequelize.transaction();
        
        try {
            req.transaction = transaction;
            await repayLoan(req, res);
            
            if (!res.headersSent) {
                await transaction.commit();
                console.log(`✅ Transaction committed for loan repayment: ${req.body.ACCT_NO}`);
            }
        } catch (error) {
            if (transaction) {
                await transaction.rollback();
                console.log(`❌ Transaction rolled back for loan repayment: ${req.body.ACCT_NO}`);
            }
            
            console.error('Loan repayment error:', error);
            
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
                        code: 'VALIDATION_ERROR',
                        timestamp: new Date().toISOString()
                    });
                }
                
                if (error.name === 'SequelizeUniqueConstraintError') {
                    return res.status(409).json({
                        success: false,
                        message: 'Duplicate transaction detected',
                        code: 'DUPLICATE_TRANSACTION',
                        details: error.errors,
                        timestamp: new Date().toISOString()
                    });
                }
                
                if (error.name === 'SequelizeForeignKeyConstraintError') {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid reference data',
                        code: 'REFERENCE_ERROR',
                        details: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
                
                res.status(500).json({
                    success: false,
                    message: 'Loan repayment failed',
                    code: 'REPAYMENT_PROCESSING_ERROR',
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }
);

// ============================================================
// LOAN INSTALLMENTS ROUTES  ✅ NEW
// ============================================================

/**
 * GET /api/loan-repayments/installments/:ACCT_NO
 * Get loan installments by account number
 * Returns the repayment schedule with installment details
 */
router.get('/installments/:ACCT_NO', async (req, res) => {
    try {
        const { ACCT_NO } = req.params;
        
        if (!ACCT_NO) {
            return res.status(400).json({
                success: false,
                message: 'Account number (ACCT_NO) is required',
                code: 'MISSING_ACCOUNT_NUMBER',
                timestamp: new Date().toISOString()
            });
        }
        
        // Pass the account number to the controller
        req.params.ACCT_NO = ACCT_NO;
        await getLoanInstallments(req, res);
        
    } catch (error) {
        console.error('[Installments Route Error]', error);
        
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: 'Internal server error while fetching loan installments',
                code: 'INSTALLMENT_FETCH_ERROR',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }
});

// ============================================================
// REPAYMENT HISTORY ROUTES
// ============================================================

// Get repayment history with query parameters
router.get('/repayment-history', async (req, res) => {
    try {
        const { ACCT_NO, CUST_ID, startDate, endDate, page = 1, limit = 20 } = req.query;
        
        if (!ACCT_NO) {
            return res.status(400).json({ 
                success: false, 
                message: 'Account number (ACCT_NO) is required',
                code: 'MISSING_ACCOUNT_NUMBER',
                timestamp: new Date().toISOString()
            });
        }
        
        req.pagination = {
            page: parseInt(page),
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        };
        
        req.filters = {
            ACCT_NO,
            CUST_ID: CUST_ID || null,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null
        };
        
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
});

// Get repayment history with route parameter
router.get('/repayment-history/:accountNo', async (req, res) => {
    try {
        const { accountNo } = req.params;
        const { startDate, endDate, page = 1, limit = 20 } = req.query;
        
        if (!accountNo) {
            return res.status(400).json({ 
                success: false, 
                message: 'Account number is required',
                code: 'MISSING_ACCOUNT_NUMBER',
                timestamp: new Date().toISOString()
            });
        }
        
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
                code: 'HISTORY_FETCH_ERROR',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }
});

// ============================================================
// REPAYMENT SUMMARY ROUTES
// ============================================================

// Get repayment summary by account number
router.get('/repayment-summary/:accountNo', async (req, res) => {
    try {
        const { accountNo } = req.params;
        
        if (!accountNo) {
            return res.status(400).json({ 
                success: false, 
                message: 'Account number is required',
                code: 'MISSING_ACCOUNT_NUMBER',
                timestamp: new Date().toISOString()
            });
        }
        
        req.params.ACCT_NO = accountNo;
        await getRepaymentSummary(req, res);
        
    } catch (error) {
        console.error('[Summary Route Error]', error);
        
        if (!res.headersSent) {
            return res.status(500).json({ 
                success: false, 
                message: 'Internal server error while fetching repayment summary',
                code: 'SUMMARY_FETCH_ERROR',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }
});

// ============================================================
// HEALTH CHECK ROUTE
// ============================================================

router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Loan Repayment API is running',
        endpoints: {
            repay: 'POST /api/loan-repayments/repay-loan',
            installments: 'GET /api/loan-repayments/installments/:ACCT_NO',
            history: 'GET /api/loan-repayments/repayment-history',
            historyByAccount: 'GET /api/loan-repayments/repayment-history/:accountNo',
            summary: 'GET /api/loan-repayments/repayment-summary/:accountNo',
            health: 'GET /api/loan-repayments/health'
        },
        timestamp: new Date().toISOString()
    });
});

export default router;