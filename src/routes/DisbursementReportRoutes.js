// src/routes/DisbursementReportRoutes.js
import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// Helper function to safely convert Decimal128 to number
const toNumber = (value) => {
  if (!value && value !== 0) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (value && typeof value === 'object' && value._bsontype === 'Decimal128') {
    return parseFloat(value.toString()) || 0;
  }
  return 0;
};

// Get model safely
const getModel = (modelName) => {
  if (!mongoose.models[modelName]) {
    throw new Error(`${modelName} model not found`);
  }
  return mongoose.models[modelName];
};

// Get all loan disbursements
router.get('/disbursements', async (req, res) => {
  try {
    const LoanDisbursement = getModel('LoanDisbursement');
    
    const {
      page = 1,
      limit = 10,
      status,
      startDate,
      endDate,
      search,
      branchId,
      productId,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};

    // Filter by status
    if (status && status !== 'ALL') {
      query.STATUS = status;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    // Filter by branch
    if (branchId) {
      query.BU_ID = branchId;
    }

    // Filter by product
    if (productId) {
      query.PROD_ID = productId;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { ACCT_NO: { $regex: search, $options: 'i' } },
        { ACCT_NM: { $regex: search, $options: 'i' } },
        { CUST_ID: { $regex: search, $options: 'i' } },
        { APPL_ID: { $regex: search, $options: 'i' } },
        { 'Borrower_address.street': { $regex: search, $options: 'i' } },
        { 'Borrower_address.city': { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [disbursements, total] = await Promise.all([
      LoanDisbursement.find(query)
        .populate('LOAN_ACCOUNT_ID', 'ACCT_NO ACCT_NM CUST_ID LOAN_STATUS')
        .populate('CREDIT_APPLICATION_ID', 'APPL_ID CUST_NM CREATED_AT')
        .populate('GUARANTOR_ID', 'GUARANTOR_ID fullName phoneNumber email')
        .populate('REPAYMENT_SCHEDULE_ID', 'ACCT_NO EMI_AMOUNT TOTAL_REPAYMENT')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      LoanDisbursement.countDocuments(query)
    ]);

    // Format Decimal128 values in disbursements
    const formattedDisbursements = disbursements.map(disb => ({
      ...disb,
      AMOUNT: toNumber(disb.AMOUNT),
      INTEREST_RATE: toNumber(disb.INTEREST_RATE),
      EMI_AMOUNT: toNumber(disb.EMI_AMOUNT),
      TOTAL_INTEREST: toNumber(disb.TOTAL_INTEREST),
      TOTAL_REPAYMENT: toNumber(disb.TOTAL_REPAYMENT),
      NET_DISBURSEMENT_AMOUNT: toNumber(disb.NET_DISBURSEMENT_AMOUNT),
      FEES_AMOUNT: toNumber(disb.FEES_AMOUNT),
      UPFRONT_INTEREST_AMOUNT: toNumber(disb.UPFRONT_INTEREST_AMOUNT)
    }));

    // Calculate summary statistics
    const summaryPipeline = [
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: { $toDouble: '$AMOUNT' } },
          totalDisbursements: { $sum: 1 },
          avgLoanAmount: { $avg: { $toDouble: '$AMOUNT' } },
          totalInterest: { $sum: { $toDouble: '$TOTAL_INTEREST' } },
          totalNetDisbursement: { $sum: { $toDouble: '$NET_DISBURSEMENT_AMOUNT' } }
        }
      }
    ];

    const summary = await LoanDisbursement.aggregate(summaryPipeline);

    // Status distribution
    const statusDistribution = await LoanDisbursement.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$STATUS',
          count: { $sum: 1 },
          amount: { $sum: { $toDouble: '$AMOUNT' } }
        }
      }
    ]);

    // Product-wise distribution
    const productDistribution = await LoanDisbursement.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$PROD_ID',
          count: { $sum: 1 },
          amount: { $sum: { $toDouble: '$AMOUNT' } }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        disbursements: formattedDisbursements,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        },
        summary: summary[0] || {
          totalAmount: 0,
          totalDisbursements: 0,
          avgLoanAmount: 0,
          totalInterest: 0,
          totalNetDisbursement: 0
        },
        analytics: {
          statusDistribution,
          productDistribution
        }
      }
    });

  } catch (error) {
    console.error('Error fetching loan disbursements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loan disbursements',
      error: error.message
    });
  }
});

// Get single loan disbursement by ID
router.get('/disbursements/:id', async (req, res) => {
  try {
    const LoanDisbursement = getModel('LoanDisbursement');
    const Customer = getModel('Customer');
    const Guarantor = getModel('Guarantor');
    const RepaymentSchedule = getModel('RepaymentSchedule');
    
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid disbursement ID'
      });
    }

    const disbursement = await LoanDisbursement.findById(id)
      .populate('LOAN_ACCOUNT_ID')
      .populate('CREDIT_APPLICATION_ID')
      .populate('GUARANTOR_ID')
      .populate('REPAYMENT_SCHEDULE_ID')
      .lean();

    if (!disbursement) {
      return res.status(404).json({
        success: false,
        message: 'Loan disbursement not found'
      });
    }

    // Format Decimal128 values
    const formattedDisbursement = {
      ...disbursement,
      AMOUNT: toNumber(disbursement.AMOUNT),
      INTEREST_RATE: toNumber(disbursement.INTEREST_RATE),
      EMI_AMOUNT: toNumber(disbursement.EMI_AMOUNT),
      TOTAL_INTEREST: toNumber(disbursement.TOTAL_INTEREST),
      TOTAL_REPAYMENT: toNumber(disbursement.TOTAL_REPAYMENT),
      NET_DISBURSEMENT_AMOUNT: toNumber(disbursement.NET_DISBURSEMENT_AMOUNT),
      FEES_AMOUNT: toNumber(disbursement.FEES_AMOUNT),
      UPFRONT_INTEREST_AMOUNT: toNumber(disbursement.UPFRONT_INTEREST_AMOUNT)
    };

    // Get related data
    const [customer, guarantorDetails, repaymentSchedule] = await Promise.all([
      Customer.findOne({ CUST_ID: disbursement.CUST_ID }).lean(),
      Guarantor.findById(disbursement.GUARANTOR_ID).lean(),
      RepaymentSchedule.findById(disbursement.REPAYMENT_SCHEDULE_ID).lean()
    ]);

    // Format related data if needed
    const formattedRepaymentSchedule = repaymentSchedule ? {
      ...repaymentSchedule,
      PRINCIPAL_AMOUNT: toNumber(repaymentSchedule.PRINCIPAL_AMOUNT),
      INTEREST_RATE: toNumber(repaymentSchedule.INTEREST_RATE),
      EMI_AMOUNT: toNumber(repaymentSchedule.EMI_AMOUNT),
      TOTAL_INTEREST: toNumber(repaymentSchedule.TOTAL_INTEREST),
      TOTAL_REPAYMENT: toNumber(repaymentSchedule.TOTAL_REPAYMENT)
    } : null;

    res.status(200).json({
      success: true,
      data: {
        disbursement: formattedDisbursement,
        customer,
        guarantorDetails,
        repaymentSchedule: formattedRepaymentSchedule
      }
    });

  } catch (error) {
    console.error('Error fetching loan disbursement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loan disbursement',
      error: error.message
    });
  }
});

// Get disbursement statistics
router.get('/disbursements/statistics', async (req, res) => {
  try {
    const LoanDisbursement = getModel('LoanDisbursement');
    
    const { startDate, endDate, branchId } = req.query;

    const matchStage = {};

    // Date range filter
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    // Branch filter
    if (branchId) {
      matchStage.BU_ID = branchId;
    }

    const statistics = await LoanDisbursement.aggregate([
      { $match: matchStage },
      {
        $facet: {
          // Daily statistics for last 30 days
          dailyStats: [
            {
              $match: {
                createdAt: {
                  $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                }
              }
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                },
                count: { $sum: 1 },
                amount: { $sum: { $toDouble: '$AMOUNT' } }
              }
            },
            { $sort: { '_id': 1 } }
          ],
          // Monthly statistics
          monthlyStats: [
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m', date: '$createdAt' }
                },
                count: { $sum: 1 },
                amount: { $sum: { $toDouble: '$AMOUNT' } }
              }
            },
            { $sort: { '_id': 1 } }
          ],
          // Status summary
          statusSummary: [
            {
              $group: {
                _id: '$STATUS',
                count: { $sum: 1 },
                amount: { $sum: { $toDouble: '$AMOUNT' } }
              }
            }
          ],
          // Product summary
          productSummary: [
            {
              $group: {
                _id: '$PROD_ID',
                count: { $sum: 1 },
                amount: { $sum: { $toDouble: '$AMOUNT' } }
              }
            },
            { $sort: { amount: -1 } }
          ],
          // Branch summary
          branchSummary: [
            {
              $group: {
                _id: '$BU_ID',
                count: { $sum: 1 },
                amount: { $sum: { $toDouble: '$AMOUNT' } }
              }
            },
            { $sort: { amount: -1 } }
          ],
          // Overall summary
          overallSummary: [
            {
              $group: {
                _id: null,
                totalDisbursements: { $sum: 1 },
                totalAmount: { $sum: { $toDouble: '$AMOUNT' } },
                totalInterest: { $sum: { $toDouble: '$TOTAL_INTEREST' } },
                totalNetDisbursed: { $sum: { $toDouble: '$NET_DISBURSEMENT_AMOUNT' } },
                avgLoanAmount: { $avg: { $toDouble: '$AMOUNT' } },
                avgInterestRate: { $avg: { $toDouble: '$INTEREST_RATE' } }
              }
            }
          ]
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: statistics[0]
    });

  } catch (error) {
    console.error('Error fetching disbursement statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch disbursement statistics',
      error: error.message
    });
  }
});

// Export disbursements to CSV/Excel
router.get('/disbursements/export', async (req, res) => {
  try {
    const LoanDisbursement = getModel('LoanDisbursement');
    
    const { format = 'csv', ...filters } = req.query;

    // Build query from filters
    const query = {};
    
    if (filters.status && filters.status !== 'ALL') {
      query.STATUS = filters.status;
    }
    
    if (filters.startDate) {
      query.createdAt = { $gte: new Date(filters.startDate) };
    }
    
    if (filters.endDate) {
      query.createdAt = { ...query.createdAt, $lte: new Date(filters.endDate) };
    }
    
    if (filters.branchId) {
      query.BU_ID = filters.branchId;
    }
    
    if (filters.productId) {
      query.PROD_ID = filters.productId;
    }

    const disbursements = await LoanDisbursement.find(query)
      .populate('LOAN_ACCOUNT_ID', 'ACCT_NO ACCT_NM')
      .populate('CREDIT_APPLICATION_ID', 'APPL_ID')
      .populate('GUARANTOR_ID', 'fullName')
      .lean();

    // Transform data for export
    const exportData = disbursements.map(disb => ({
      'Disbursement ID': disb._id,
      'Account Number': disb.ACCT_NO,
      'Account Name': disb.ACCT_NM,
      'Customer ID': disb.CUST_ID,
      'Application ID': disb.APPL_ID,
      'Loan Amount': toNumber(disb.AMOUNT),
      'Interest Rate (%)': toNumber(disb.INTEREST_RATE),
      'Total Interest': toNumber(disb.TOTAL_INTEREST),
      'Total Repayment': toNumber(disb.TOTAL_REPAYMENT),
      'EMI Amount': toNumber(disb.EMI_AMOUNT),
      'Term Value': disb.TERM_VALUE,
      'Term Code': disb.TERM_CD,
      'Product ID': disb.PROD_ID,
      'Product Type': disb.PRODUCT_TYPE,
      'Branch ID': disb.BU_ID,
      'Status': disb.STATUS,
      'Disbursement Date': disb.DISBURSEMENT_DATE,
      'Created At': disb.createdAt,
      'Created By': disb.CREATED_BY,
      'Repayment Source Account': disb.REPAY_SRC_ACCT_NO,
      'Primary Officer': disb.PRIMARY_OFFICER_ID,
      'Transaction ID': disb.TRANSACTION_ID,
      'Currency': disb.CRNCY_ID,
      'Calculation Method': disb.CALCULATION_METHOD,
      'Payment Frequency': disb.PAYMENT_FREQUENCY,
      'Start Date': disb.START_DT,
      'Maturity Date': disb.MATURITY_DT,
      'Net Disbursement': toNumber(disb.NET_DISBURSEMENT_AMOUNT),
      'Guarantor': disb.GUARANTOR_ID?.fullName || 'N/A',
      'Borrower Address': disb.Borrower_address ? 
        `${disb.Borrower_address.street || ''}, ${disb.Borrower_address.city || ''}, ${disb.Borrower_address.state || ''}` : 'N/A'
    }));

    if (format === 'csv') {
      // Convert to CSV
      const headers = Object.keys(exportData[0] || {});
      const csv = [
        headers.join(','),
        ...exportData.map(row => 
          headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
            if (value instanceof Date) return value.toISOString();
            return String(value);
          }).join(',')
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=loan_disbursements_${Date.now()}.csv`);
      return res.send(csv);
    } else {
      // For Excel, you would use a library like exceljs
      res.status(200).json({
        success: true,
        data: exportData,
        format: 'json'
      });
    }

  } catch (error) {
    console.error('Error exporting disbursements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export disbursements',
      error: error.message
    });
  }
});

// Update disbursement status
router.put('/disbursements/:id/status', async (req, res) => {
  try {
    const LoanDisbursement = getModel('LoanDisbursement');
    const LoanAccount = getModel('LoanAccount');
    
    const { id } = req.params;
    const { status, notes, updatedBy } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid disbursement ID'
      });
    }

    const validStatuses = ['PENDING', 'APPROVED', 'DISBURSED', 'REJECTED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const updateData = {
      STATUS: status,
      updatedAt: new Date()
    };

    // Add status history if field exists in schema
    // Check if statusHistory field exists in the model
    if (LoanDisbursement.schema && LoanDisbursement.schema.path('statusHistory')) {
      updateData.$push = {
        statusHistory: {
          status,
          changedBy: updatedBy || 'SYSTEM',
          changedAt: new Date(),
          notes: notes || ''
        }
      };
    }

    const disbursement = await LoanDisbursement.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!disbursement) {
      return res.status(404).json({
        success: false,
        message: 'Loan disbursement not found'
      });
    }

    // If status is DISBURSED, update related LoanAccount
    if (status === 'DISBURSED' && disbursement.LOAN_ACCOUNT_ID) {
      await LoanAccount.findByIdAndUpdate(
        disbursement.LOAN_ACCOUNT_ID,
        {
          LOAN_STATUS: 'ACTIVE',
          DISBURSEMENT_DATE: new Date(),
          DISBURSED_AMOUNT: disbursement.AMOUNT
        }
      );
    }

    res.status(200).json({
      success: true,
      message: 'Disbursement status updated successfully',
      data: disbursement
    });

  } catch (error) {
    console.error('Error updating disbursement status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update disbursement status',
      error: error.message
    });
  }
});

// Get disbursement dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const LoanDisbursement = getModel('LoanDisbursement');
    
    const { branchId } = req.query;
    const matchStage = branchId ? { BU_ID: branchId } : {};

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      todayStats,
      monthlyStats,
      statusStats,
      topProducts,
      recentDisbursements
    ] = await Promise.all([
      // Today's disbursements
      LoanDisbursement.aggregate([
        {
          $match: {
            ...matchStage,
            createdAt: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0)),
              $lte: new Date()
            }
          }
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            amount: { $sum: { $toDouble: '$AMOUNT' } }
          }
        }
      ]),
      // Last 30 days trend
      LoanDisbursement.aggregate([
        {
          $match: {
            ...matchStage,
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 },
            amount: { $sum: { $toDouble: '$AMOUNT' } }
          }
        },
        { $sort: { '_id': 1 } },
        { $limit: 30 }
      ]),
      // Status distribution
      LoanDisbursement.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$STATUS',
            count: { $sum: 1 },
            amount: { $sum: { $toDouble: '$AMOUNT' } }
          }
        }
      ]),
      // Top 5 products
      LoanDisbursement.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$PROD_ID',
            count: { $sum: 1 },
            amount: { $sum: { $toDouble: '$AMOUNT' } }
          }
        },
        { $sort: { amount: -1 } },
        { $limit: 5 }
      ]),
      // Recent disbursements
      LoanDisbursement.find(matchStage)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('LOAN_ACCOUNT_ID', 'ACCT_NO ACCT_NM')
        .populate('CREDIT_APPLICATION_ID', 'APPL_ID')
        .lean()
    ]);

    // Format recent disbursements
    const formattedRecentDisbursements = recentDisbursements.map(disb => ({
      ...disb,
      AMOUNT: toNumber(disb.AMOUNT),
      INTEREST_RATE: toNumber(disb.INTEREST_RATE),
      EMI_AMOUNT: toNumber(disb.EMI_AMOUNT)
    }));

    res.status(200).json({
      success: true,
      data: {
        today: todayStats[0] || { count: 0, amount: 0 },
        monthlyTrend: monthlyStats,
        statusDistribution: statusStats,
        topProducts,
        recentDisbursements: formattedRecentDisbursements
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
});

export default router;