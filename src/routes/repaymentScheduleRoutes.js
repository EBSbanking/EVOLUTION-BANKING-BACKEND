import express from 'express';
import { 
  recordPayment, 
  simpleRepayment,
  getRepaymentSchedule, 
  updateLoanServicingStatus,
  createRepaymentSchedule,
  deleteRepaymentSchedule,
  processBulkRepayments,
   recordPaymentWithRetry 
} from '../controllers/repaymentScheduleController.js';
import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanRepayment from '../models/LoanRepayment.js';

const router = express.Router();

// POST /api/repayments/:ACCT_NO/pay - Record a loan payment (handles installments if schedule exists)
router.post('/:ACCT_NO/pay', recordPayment);

// POST /api/repayments/simple/:ACCT_NO/pay - Simple repayment (no schedule logic, no transaction)
router.post('/simple/:ACCT_NO/pay', simpleRepayment);



// Record a payment for a specific loan account
router.post('/:ACCT_NO/pay', recordPaymentWithRetry);
// POST /api/repayments/bulk - Process bulk repayments
// Body: { payments: [], memberRepayments: [], commonData: {}, repaymentType: 'INDIVIDUAL' | 'GROUP' }
router.post('/bulk', processBulkRepayments);

// GET /api/repayments/:ACCT_NO/schedule - Retrieve repayment schedule
router.get('/:ACCT_NO/schedule', getRepaymentSchedule);

// POST /api/repayments/:ACCT_NO/schedule - Create repayment schedule for a loan
router.post('/:ACCT_NO/schedule', createRepaymentSchedule);

// DELETE /api/repayments/:ACCT_NO/schedule - Delete repayment schedule for a loan
router.delete('/:ACCT_NO/schedule', deleteRepaymentSchedule);

// POST /api/repayments/:ACCT_NO/servicing-status - Manually update loan servicing status
// Body: { paymentDate, isOverdue }
// This could be used for batch/cron jobs or manual triggers
router.post('/:ACCT_NO/servicing-status', async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    const { paymentDate = new Date(), isOverdue = false } = req.body;
    
    const newStatus = await updateLoanServicingStatus(ACCT_NO, new Date(paymentDate), isOverdue);
    
    res.status(200).json({
      success: true,
      message: 'Loan servicing status updated successfully',
      data: { newStatus, updateDate: new Date() }
    });
  } catch (error) {
    console.error('Error updating servicing status:', error);
    res.status(error.status || 500).json({
      success: false,
      message: 'Failed to update servicing status',
      error: error.message,
      code: error.code || 'SERVICING_UPDATE_ERROR'
    });
  }
});

// GET /api/repayments/:ACCT_NO/status - Get loan repayment status
router.get('/:ACCT_NO/status', async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    
    const loanAccount = await LoanAccount.findOne({ ACCT_NO: String(ACCT_NO) })
      .select('LOAN_STATUS OUTSTANDING_PRINCIPAL TOTAL_REPAID_AMOUNT LAST_PAYMENT_DATE SERVICING_STATUS');
    
    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: 'Loan account not found',
        code: 'LOAN_NOT_FOUND'
      });
    }

    const repaymentSchedule = await RepaymentSchedule.findOne({ ACCT_NO: String(ACCT_NO) });
    
    const pendingInstallments = repaymentSchedule?.SCHEDULE?.filter(inst => 
      inst.status === 'PENDING' || inst.status === 'PARTIAL' || inst.status === 'OVERDUE'
    ) || [];

    const nextDueInstallment = pendingInstallments.sort((a, b) => 
      new Date(a.dueDate) - new Date(b.dueDate)
    )[0];

    return res.status(200).json({
      success: true,
      message: 'Repayment status retrieved successfully',
      data: {
        loanStatus: loanAccount.LOAN_STATUS,
        servicingStatus: loanAccount.SERVICING_STATUS || 'SERVICED',
        outstandingBalance: parseFloat(loanAccount.OUTSTANDING_PRINCIPAL?.toString() || '0'),
        totalRepaid: parseFloat(loanAccount.TOTAL_REPAID_AMOUNT?.toString() || '0'),
        lastPaymentDate: loanAccount.LAST_PAYMENT_DATE,
        nextDueInstallment: nextDueInstallment ? {
          installmentNumber: nextDueInstallment.installmentNumber,
          dueDate: nextDueInstallment.dueDate,
          amountDue: parseFloat(nextDueInstallment.totalPayment.toString()) - 
                    parseFloat(nextDueInstallment.amountPaid?.toString() || '0'),
          status: nextDueInstallment.status
        } : null,
        totalPendingInstallments: pendingInstallments.length,
        hasSchedule: !!repaymentSchedule
      }
    });
  } catch (error) {
    console.error('Error getting repayment status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get repayment status',
      error: error.message,
      code: 'STATUS_RETRIEVAL_ERROR'
    });
  }
});

// GET /api/repayments/:ACCT_NO/history - Get payment history for a loan
router.get('/:ACCT_NO/history', async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    const { limit = 50, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const loanRepayments = await LoanRepayment.find({ ACCT_NO: String(ACCT_NO) })
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('amount date paymentMethod reference description principalPaid interestPaid details REPAYMENT_HISTORY');

    const totalPayments = await LoanRepayment.countDocuments({ ACCT_NO: String(ACCT_NO) });

    return res.status(200).json({
      success: true,
      message: 'Payment history retrieved successfully',
      data: {
        repayments: loanRepayments,
        pagination: {
          total: totalPayments,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalPayments / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error getting payment history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get payment history',
      error: error.message,
      code: 'HISTORY_RETRIEVAL_ERROR'
    });
  }
});

export default router;