// routes/repaymentScheduleRoutes.js
import express from 'express';
import {
  getRepaymentSchedule,
  createRepaymentSchedule,
  updateRepaymentSchedule,
  deleteRepaymentSchedule,
  getOverdueInstallments,
  recalculateSchedule,
  getPaymentHistory
} from '../controllers/repaymentScheduleController.js';

// Import the controller correctly
import loanAccountController from '../controllers/LoanAccountController.js'; // Default import

import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanRepayment from '../models/LoanRepayment.js';

const router = express.Router();

// ========== PAYMENT ENDPOINTS ==========

// POST /api/repayments/:ACCT_NO/payment - Process payment against schedule
router.post('/:ACCT_NO/payment', (req, res) => loanAccountController.processSchedulePayment(req, res));

// POST /api/repayments/:ACCT_NO/repayments - Record manual repayment
router.post('/:ACCT_NO/repayments', (req, res) => loanAccountController.recordRepayment(req, res));

// ========== SCHEDULE MANAGEMENT ==========

// GET /api/repayments/:ACCT_NO/schedule - Get repayment schedule
router.get('/:ACCT_NO/schedule', getRepaymentSchedule);

// POST /api/repayments/:ACCT_NO/schedule - Create repayment schedule
router.post('/:ACCT_NO/schedule', createRepaymentSchedule);

// PUT /api/repayments/:ACCT_NO/schedule - Update repayment schedule
router.put('/:ACCT_NO/schedule', updateRepaymentSchedule);

// DELETE /api/repayments/:ACCT_NO/schedule - Delete repayment schedule
router.delete('/:ACCT_NO/schedule', deleteRepaymentSchedule);

// POST /api/repayments/:ACCT_NO/schedule/recalculate - Recalculate schedule
router.post('/:ACCT_NO/schedule/recalculate', recalculateSchedule);

// ========== STATUS & INFO ENDPOINTS ==========

// GET /api/repayments/:ACCT_NO/overdue - Get overdue installments
router.get('/:ACCT_NO/overdue', getOverdueInstallments);

// GET /api/repayments/:ACCT_NO/status - Get loan repayment status
router.get('/:ACCT_NO/status', async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    
    // Use correct column name based on your schema
    const loanAccount = await LoanAccount.findOne({
      where: { a_c_c_t__n_o: String(ACCT_NO) },
      attributes: [
        'l_o_a_n__s_t_a_t_u_s', 'o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l', 't_o_t_a_l__r_e_p_a_i_d__a_m_o_u_n_t', 
        'l_a_s_t__r_e_p_a_y_m_e_n_t__d_a_t_e', 'a_c_c_t__n_m'
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
    ) || [];

    const nextDueInstallment = pendingInstallments.sort((a, b) => 
      new Date(a.dueDate) - new Date(b.dueDate)
    )[0];

    return res.status(200).json({
      success: true,
      message: 'Repayment status retrieved successfully',
      data: {
        loanAccount: {
          accountNumber: loanAccount.a_c_c_t__n_o,
          accountName: loanAccount.a_c_c_t__n_m,
          loanStatus: loanAccount.l_o_a_n__s_t_a_t_u_s,
          outstandingBalance: Math.abs(parseFloat(loanAccount.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l?.toString() || '0')),
          totalRepaid: parseFloat(loanAccount.t_o_t_a_l__r_e_p_a_i_d__a_m_o_u_n_t?.toString() || '0'),
          lastPaymentDate: loanAccount.l_a_s_t__r_e_p_a_y_m_e_n_t__d_a_t_e
        },
        nextDueInstallment: nextDueInstallment ? {
          installmentNumber: nextDueInstallment.installmentNo || nextDueInstallment.installmentNumber,
          dueDate: nextDueInstallment.dueDate,
          amountDue: parseFloat(nextDueInstallment.totalPayment.toString()) - 
                    parseFloat(nextDueInstallment.amountPaid?.toString() || '0'),
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

// GET /api/repayments/:ACCT_NO/history - Get payment history (from controller)
router.get('/:ACCT_NO/history', getPaymentHistory);

// Alternative history endpoint with pagination (if needed)
router.get('/:ACCT_NO/history-detailed', async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    const { limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const loanRepayments = await LoanRepayment.findAll({
      where: { ACCT_NO: String(ACCT_NO) },
      order: [['date', 'DESC']],
      offset: offset,
      limit: parseInt(limit),
      attributes: [
        'id', 'amount', 'date', 'paymentMethod', 'reference', 'description',
        'principalPaid', 'interestPaid', 'details', 'status'
      ]
    });

    const totalPayments = await LoanRepayment.count({
      where: { ACCT_NO: String(ACCT_NO) }
    });

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