// routes/repaymentScheduleRoutes.js - CORRECTED (clean column names)
import express from 'express';
import {
  getRepaymentSchedule,
  createRepaymentSchedule,
  updateRepaymentSchedule,
  deleteRepaymentSchedule,
  getOverdueInstallments,
  recalculateSchedule,
  getPaymentHistory,
  processSchedulePayment,   // import the working one from repaymentScheduleController
  recordManualRepayment      // if available, otherwise use loanAccountController.recordManualRepayment
} from '../controllers/repaymentScheduleController.js';

// Import the loan account controller only for manual repayment if not in repaymentScheduleController
import loanAccountController from '../controllers/LoanAccountController.js';

import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanRepayment from '../models/LoanRepayment.js';

const router = express.Router();

// ========== PAYMENT ENDPOINTS ==========
// Use the clean controller function (which uses Sequelize correctly)
router.post('/:ACCT_NO/payment', processSchedulePayment);

// Manual repayment endpoint - use the correct controller (ensure it uses clean fields)
router.post('/:ACCT_NO/repayments', loanAccountController.recordManualRepayment || loanAccountController.recordRepayment);

// ========== SCHEDULE MANAGEMENT ==========
router.get('/:ACCT_NO/schedule', getRepaymentSchedule);
router.post('/:ACCT_NO/schedule', createRepaymentSchedule);
router.put('/:ACCT_NO/schedule', updateRepaymentSchedule);
router.delete('/:ACCT_NO/schedule', deleteRepaymentSchedule);
router.post('/:ACCT_NO/schedule/recalculate', recalculateSchedule);

// ========== STATUS & INFO ENDPOINTS ==========
router.get('/:ACCT_NO/overdue', getOverdueInstallments);

// GET /api/repayments/:ACCT_NO/status - cleaned column names
router.get('/:ACCT_NO/status', async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    
    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: String(ACCT_NO) },
      attributes: [
        'LOAN_STATUS', 'OUTSTANDING_PRINCIPAL', 'TOTAL_REPAID_AMOUNT', 
        'LAST_REPAYMENT_DATE', 'ACCT_NM'
      ]
    });
    
    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: 'Loan account not found',
        code: 'LOAN_NOT_FOUND'
      });
    }

    const repaymentSchedule = await RepaymentSchedule.findOne({
      where: { account_number: String(ACCT_NO) }
    });
    
    const installments = repaymentSchedule?.installments_json || [];
    const pendingInstallments = installments.filter(inst => 
      inst.status === 'PENDING' || inst.status === 'PARTIAL' || inst.status === 'OVERDUE'
    );

    const nextDueInstallment = pendingInstallments.sort((a, b) => 
      new Date(a.dueDate) - new Date(b.dueDate)
    )[0];

    const outstandingRaw = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL) || 0;
    const outstandingBalance = Math.abs(outstandingRaw);

    return res.status(200).json({
      success: true,
      message: 'Repayment status retrieved successfully',
      data: {
        loanAccount: {
          accountNumber: loanAccount.ACCT_NO,
          accountName: loanAccount.ACCT_NM,
          loanStatus: loanAccount.LOAN_STATUS,
          outstandingBalance: outstandingBalance,
          totalRepaid: parseFloat(loanAccount.TOTAL_REPAID_AMOUNT) || 0,
          lastPaymentDate: loanAccount.LAST_REPAYMENT_DATE
        },
        nextDueInstallment: nextDueInstallment ? {
          installmentNumber: nextDueInstallment.installmentNo || nextDueInstallment.installmentNumber,
          dueDate: nextDueInstallment.dueDate,
          amountDue: (parseFloat(nextDueInstallment.totalPayment) || 0) - (parseFloat(nextDueInstallment.amountPaid) || 0),
          status: nextDueInstallment.status
        } : null,
        scheduleSummary: {
          totalInstallments: installments.length,
          paidInstallments: installments.filter(inst => inst.status === 'PAID').length,
          pendingInstallments: pendingInstallments.length,
          overdueInstallments: installments.filter(inst => inst.status === 'OVERDUE').length,
          partialInstallments: installments.filter(inst => inst.status === 'PARTIAL').length
        },
        hasSchedule: !!repaymentSchedule,
        scheduleStatus: repaymentSchedule?.status || 'NONE'
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

// GET /api/repayments/:ACCT_NO/history - from controller
router.get('/:ACCT_NO/history', getPaymentHistory);

// Alternative history endpoint with pagination (cleaned)
router.get('/:ACCT_NO/history-detailed', async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    const { limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const loanRepayments = await LoanRepayment.findAll({
      where: { loan_account_number: String(ACCT_NO) }, // use correct field
      order: [['repayment_date', 'DESC']],
      offset: offset,
      limit: parseInt(limit)
    });

    const totalPayments = await LoanRepayment.count({
      where: { loan_account_number: String(ACCT_NO) }
    });

    return res.status(200).json({
      success: true,
      message: 'Payment history retrieved successfully',
      data: {
        repayments: loanRepayments.map(r => ({
          id: r.id,
          amount: r.total_amount,
          date: r.repayment_date,
          paymentMethod: r.payment_method,
          reference: r.transaction_reference,
          description: r.notes,
          principalPaid: r.principal_amount,
          interestPaid: r.interest_amount,
          status: r.status
        })),
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