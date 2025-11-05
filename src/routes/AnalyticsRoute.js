// routes/analytics.js
import express from 'express';
import mongoose from 'mongoose';

// Controllers for general analytics
import {
  getAllBusinessUnits,
  getTotalCustomerCount,
  getTotalCustomerCountByBU,
  getTotalCustomerAccountCount,
  getTotalCustomerAccountCountByBU,
  getTotalLoanAccountCount,
  getTotalLoanAccountCountByBU
} from '../controllers/AnalyticsController.js';

// Models for approval workflow analytics
import Customer from '../models/Customer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanAccount from '../models/LoanAccount.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import CreditApplication from '../models/CreditApplication.js';

const router = express.Router();

/* =========================
   General Customer Analytics
   ========================= */
router.get('/business-units', getAllBusinessUnits);
router.get('/customers/total', getTotalCustomerCount);
router.get('/customers/total/:businessUnit', getTotalCustomerCountByBU);
router.get('/customer-accounts/total', getTotalCustomerAccountCount);
router.get('/customer-accounts/total/:businessUnit', getTotalCustomerAccountCountByBU);
router.get('/loan-accounts/total', getTotalLoanAccountCount);
router.get('/loan-accounts/total/:businessUnit', getTotalLoanAccountCountByBU);

/* =========================
   Approval Workflow Analytics
   ========================= */
router.get('/approval-analytics', async (req, res) => {
  try {
    const { range = 'week' } = req.query;

    // Determine date range
    const now = new Date();
    let startDate = new Date();
    if (range === 'week') startDate.setDate(now.getDate() - 7);
    if (range === 'month') startDate.setMonth(now.getMonth() - 1);
    if (range === 'quarter') startDate.setMonth(now.getMonth() - 3);

    // Run all analytics in parallel
    const [
      byStatus,
      byType,
      byUser,
      timeline,
      totalPending,
      totalApproved,
      approvalTimes,
      creditAppByStatus,
      businessUnits,
      totalCustomerCount,
      totalCustomerAccountCount,
      totalLoanAccountCount
    ] = await Promise.all([
      // 1. WF_WORK_ITEM: By Status
      WF_WORK_ITEM.aggregate([
        { $match: { CREATED_AT: { $gte: startDate } } },
        { $group: { _id: '$WAIT_ST', value: { $sum: 1 } } },
        { $project: { name: '$_id', value: 1, _id: 0 } }
      ]),

      // 2. WF_WORK_ITEM: By Type
      WF_WORK_ITEM.aggregate([
        { $match: { CREATED_AT: { $gte: startDate } } },
        {
          $group: {
            _id: '$ITEM_TYPE',
            pending: { $sum: { $cond: [{ $eq: ['$WAIT_ST', 'Pending'] }, 1, 0] } },
            approved: { $sum: { $cond: [{ $eq: ['$WAIT_ST', 'Approved'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$WAIT_ST', 'Rejected'] }, 1, 0] } }
          }
        },
        { $project: { name: '$_id', pending: 1, approved: 1, rejected: 1, _id: 0 } }
      ]),

      // 3. WF_WORK_ITEM: By User
      WF_WORK_ITEM.aggregate([
        { $match: { CREATED_AT: { $gte: startDate } } },
        { $group: { _id: '$APPROVED_BY', count: { $sum: 1 } } },
        { $project: { name: '$_id', count: 1, _id: 0 } },
        { $sort: { count: -1 } }
      ]),

      // 4. WF_WORK_ITEM: Timeline
      WF_WORK_ITEM.aggregate([
        { $match: { CREATED_AT: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$CREATED_AT' } },
            pending: { $sum: { $cond: [{ $eq: ['$WAIT_ST', 'Pending'] }, 1, 0] } },
            approved: { $sum: { $cond: [{ $eq: ['$WAIT_ST', 'Approved'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$WAIT_ST', 'Rejected'] }, 1, 0] } }
          }
        },
        { $project: { date: '$_id', pending: 1, approved: 1, rejected: 1, _id: 0 } },
        { $sort: { date: 1 } }
      ]),

      // 5. WF_WORK_ITEM: Total Pending
      WF_WORK_ITEM.countDocuments({ WAIT_ST: 'Pending' }),

      // 6. WF_WORK_ITEM: Total Approved
      WF_WORK_ITEM.countDocuments({ WAIT_ST: 'Approved' }),

      // 7. WF_WORK_ITEM: Avg Approval Time
      WF_WORK_ITEM.aggregate([
        { $match: { WAIT_ST: 'Approved', CREATED_AT: { $gte: startDate } } },
        {
          $project: {
            diffHours: {
              $divide: [
                { $subtract: ['$APPROVED_DT', '$CREATED_AT'] },
                1000 * 60 * 60
              ]
            }
          }
        },
        { $group: { _id: null, avg: { $avg: '$diffHours' } } }
      ]),

      // 8. CreditApplication: By Status
      CreditApplication.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$status', value: { $sum: 1 } } },
        { $project: { name: '$_id', value: 1, _id: 0 } }
      ]),

      // 9. Customer: Business Units
      Customer.distinct('BU_ID'),

      // 10. Customer: Total Count
      Customer.countDocuments(),

      // 11. CustomerAccount: Total Count
      CustomerAccount.countDocuments(),

      // 12. LoanAccount: Total Count
      LoanAccount.countDocuments()
    ]);

    // Calculate approval rate
    const approvalRate =
      totalApproved + totalPending > 0
        ? Math.round((totalApproved / (totalApproved + totalPending)) * 100)
        : 0;

    res.json({
      wfWorkItem: {
        byStatus,
        byType,
        byUser,
        timeline,
        summary: {
          totalPending,
          totalApproved,
          avgApprovalTime: approvalTimes.length ? approvalTimes[0].avg.toFixed(2) : 0,
          approvalRate
        }
      },
      creditApplications: { byStatus: creditAppByStatus },
      customers: {
        businessUnits,
        totalCustomerCount,
        totalCustomerAccountCount,
        totalLoanAccountCount
      }
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
