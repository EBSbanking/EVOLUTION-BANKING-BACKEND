import express from 'express';
import { 
    handleLoanRepayment as repayLoan, 
    getRepaymentHistory 
} from '../controllers/LoanRepaymentController.js';
import { validateRepaymentInput } from '../middlewares/loanRepaymentValidation.js';

const router = express.Router();

// Route for loan repayment
router.post('/repay-loan', 
    validateRepaymentInput,
    async (req, res, next) => {
        // Start Mongoose session
        const session = await mongoose.startSession();
        session.startTransaction();
        req.session = session; // Attach to request for controller use
        
        try {
            await handleLoanRepayment(req, res, next);
            await session.commitTransaction();
        } catch (error) {
            await session.abortTransaction();
            res.status(500).json({
                success: false,
                error: 'Transaction failed',
                details: error.message
            });
        } finally {
            session.endSession();
        }
    }
);

// Route for repayment history with parameter validation
router.get('/repayment-history', 
    async (req, res) => {
        try {
            const { ACCT_NO } = req.query;
            
            if (!ACCT_NO) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Account number (ACCT_NO) is required as a query parameter' 
                });
            }
            
            if (isNaN(Number(ACCT_NO))) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Account number must be a numeric value' 
                });
            }
            
            const result = await getRepaymentHistory(req, res);
            return result; // The controller already sends the response
        } catch (error) {
            console.error('[History Route Error]', error);
            return res.status(500).json({ 
                success: false, 
                error: 'Internal server error while fetching repayment history' 
            });
        }
    }
);

export default router;