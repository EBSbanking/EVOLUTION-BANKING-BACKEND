import express from 'express';
import { 
  createCustomerAccount, 
  getAllCustomerAccounts, 
  updateCustomerAccount, 
  deleteCustomerAccount,
  getCustomerAccountByCUST_ID,
  updateDormantAccounts,
  searchCustomerAccounts,
  getAccountByNumber,
  activateCustomerAccount, 
  bulkActivateAccounts, 
  getAccountActivationHistory 
} from '../controllers/CustomerAccountController.js';

import postTransaction  from '../Services/postTransaction.js';
import logger from '../utils/logger.js'; 
import AuditTrail from '../models/AuditTrail.js';
import CustomerAccount from '../models/CustomerAccount.js';

const router = express.Router();

// Add this comprehensive debug endpoint
router.get('/debug-all-accounts', async (req, res) => {
  try {
    const allAccounts = await CustomerAccount.find({});
    
    console.log('📊 TOTAL ACCOUNTS IN DATABASE:', allAccounts.length);
    
    const accountsAnalysis = allAccounts.map(acc => {
      const accountData = acc.toObject();
      return {
        _id: accountData._id,
        // Check all possible account number fields
        account_number: accountData.account_number,
        ACCT_NO: accountData.ACCT_NO,
        accountNumber: accountData.accountNumber,
        // Customer identifiers
        customer_id: accountData.customer_id,
        CUST_ID: accountData.CUST_ID,
        // Status
        status: accountData.status,
        REC_ST: accountData.REC_ST,
        // Product info
        product: accountData.product,
        product_type: accountData.product_type,
        ACCOUNT_TYPE: accountData.ACCOUNT_TYPE,
        // Check if it has old vs new schema fields
        hasOldSchema: !!(accountData.CUST_ID || accountData.ACCT_ID),
        hasNewSchema: !!(accountData.customer_id || accountData.account_number),
        // All fields for inspection
        allFields: Object.keys(accountData)
      };
    });

    // Group by schema type
    const migratedAccounts = accountsAnalysis.filter(acc => acc.hasOldSchema && !acc.hasNewSchema);
    const newAccounts = accountsAnalysis.filter(acc => acc.hasNewSchema);
    const hybridAccounts = accountsAnalysis.filter(acc => acc.hasOldSchema && acc.hasNewSchema);

    return res.json({
      totalAccounts: allAccounts.length,
      schemaAnalysis: {
        migratedAccounts: migratedAccounts.length,
        newAccounts: newAccounts.length,
        hybridAccounts: hybridAccounts.length
      },
      sampleMigratedAccounts: migratedAccounts.slice(0, 3),
      sampleNewAccounts: newAccounts.slice(0, 3),
      sampleHybridAccounts: hybridAccounts.slice(0, 3),
      allAccounts: accountsAnalysis
    });
  } catch (error) {
    console.error('Debug all accounts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SINGLE ROUTE for getting account by number - REMOVE THE DUPLICATE BELOW
router.get('/accounts/:accountNumber', getAccountByNumber);

// Add search route
router.get('/search', searchCustomerAccounts);

// REMOVE THIS DUPLICATE ROUTE - IT'S OVERRIDING THE ABOVE ONE
/*
router.get('/accounts/:accountNumber', async (req, res) => {
  try {
    const { accountNumber } = req.params;
    
    console.log('🔍 Comprehensive account lookup for:', accountNumber);
    
    // Try ALL possible field combinations for both migrated and new accounts
    const searchConditions = [
      // New schema fields
      { account_number: accountNumber },
      { accountNumber: accountNumber },
      
      // Old schema fields (for migrated accounts)
      { ACCT_NO: accountNumber },
      
      // Case-insensitive search
      { account_number: new RegExp(`^${accountNumber}$`, 'i') },
      { ACCT_NO: new RegExp(`^${accountNumber}$`, 'i') }
    ];

    let account = null;
    let foundWithField = '';

    // Try each search condition
    for (const condition of searchConditions) {
      account = await CustomerAccount.findOne(condition);
      if (account) {
        foundWithField = Object.keys(condition)[0];
        console.log(`✅ Account found with field: ${foundWithField}`);
        break;
      }
    }

    if (!account) {
      console.log('❌ Account not found with any search condition');
      
      // Get some sample accounts to see what exists
      const sampleAccounts = await CustomerAccount.find({}).limit(10);
      const sampleData = sampleAccounts.map(acc => ({
        account_number: acc.account_number,
        ACCT_NO: acc.ACCT_NO,
        accountNumber: acc.accountNumber,
        customer_id: acc.customer_id,
        CUST_ID: acc.CUST_ID,
        status: acc.status
      }));
      
      return res.status(404).json({
        success: false,
        message: "Customer account not found",
        searchedNumber: accountNumber,
        searchFieldsTried: searchConditions.map(cond => Object.keys(cond)[0]),
        sampleExistingAccounts: sampleData
      });
    }

    console.log('✅ Account found successfully:', {
      foundWithField,
      account_number: account.account_number,
      ACCT_NO: account.ACCT_NO,
      customer_id: account.customer_id,
      CUST_ID: account.CUST_ID,
      status: account.status
    });
    
    return res.json({
      success: true,
      data: account,
      foundWith: foundWithField,
      schemaType: account.account_number ? 'new' : account.ACCT_NO ? 'migrated' : 'unknown'
    });
  } catch (error) {
    console.error('Error fetching account:', error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
});
*/

//====================ROUTES=======================

router.post('/accounts', createCustomerAccount);
router.get('/accounts', getAllCustomerAccounts);
router.put('/accounts/:ACCT_NO', updateCustomerAccount);
router.delete('/accounts/:ACCT_NO', deleteCustomerAccount);
router.get('/customer/:CUST_ID', getCustomerAccountByCUST_ID);

// ==================== ACCOUNT ACTIVATION ROUTES ====================
// Single account activation
router.patch('/accounts/:ACCT_NO/activate', activateCustomerAccount);

// Bulk account activation
router.post('/accounts/bulk-activate', bulkActivateAccounts);

// Get account activation history
router.get('/accounts/:ACCT_NO/activation-history', getAccountActivationHistory);

// ==================== TRANSACTION ROUTES ====================
// Post Transaction
router.post('/transactions', postTransaction);

router.get('/transactions/:ACCT_NO', async (req, res) => {
  const { ACCT_NO } = req.params;
  try {
    if (!/^\d{10}$/.test(ACCT_NO)) {
      return res.status(400).json({ success: false, message: 'ACCT_NO must be a 10-digit number.' });
    }

    const transactions = await AuditTrail.find({
      account_no: ACCT_NO,
      event_type: { $in: ['TRANSACTION_DR', 'TRANSACTION_CR'] },
    }).sort({ timestamp: -1 });

    return res.status(200).json({
      success: true,
      message: 'Transaction history retrieved successfully',
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    // Logging error
    logger.error('Error fetching transaction history:', { 
      error: error.message, 
      stack: error.stack 
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching transaction history',
      error: error.message,
    });
  }
});

////////////////////////////////////////////////////////////////////////////////////////////
// Comprehensive Savings Reports for Frontend
router.get('/savings-reports', async (req, res) => {
  try {
    const { 
      reportType = 'summary', 
      startDate, 
      endDate, 
      branch, 
      productType,
      status = 'Active',
      page = 1,
      limit = 50
    } = req.query;

    console.log('📊 Generating Savings Reports with params:', {
      reportType, startDate, endDate, branch, productType, status, page, limit
    });

    // Build base query for savings accounts
    let baseQuery = {
      $or: [
        { ACCOUNT_TYPE: 'SAVINGS' },
        { product_type: 'savings' },
        { product_type: /savings/i }
      ]
    };

    // Add status filter
    if (status && status !== 'all') {
      baseQuery.status = status;
    }

    // Add branch filter
    if (branch) {
      baseQuery.$or = [
        { branch: Number(branch) },
        { BU_ID: String(branch).padStart(3, '0') }
      ];
    }

    // Add product type filter
    if (productType && productType !== 'all') {
      baseQuery.$or = [
        ...(baseQuery.$or || []),
        { product: productType },
        { productCode: productType }
      ];
    }

    // Add date range filter for creation date
    let dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }
    if (startDate || endDate) {
      baseQuery.$or = [
        ...(baseQuery.$or || []),
        { creation_date: dateFilter },
        { application_date: dateFilter },
        { created_at: dateFilter }
      ];
    }

    console.log('🔍 Base query for savings reports:', JSON.stringify(baseQuery, null, 2));

    // Execute query based on report type
    switch (reportType) {
      case 'summary':
        return await getSavingsSummaryReport(res, baseQuery);
      
      case 'detailed':
        return await getDetailedSavingsReport(res, baseQuery, parseInt(page), parseInt(limit));
      
      case 'branch-wise':
        return await getBranchWiseReport(res, baseQuery);
      
      case 'product-wise':
        return await getProductWiseReport(res, baseQuery);
      
      case 'status-wise':
        return await getStatusWiseReport(res, baseQuery);
      
      case 'balance-analysis':
        return await getBalanceAnalysisReport(res, baseQuery);
      
      default:
        return await getSavingsSummaryReport(res, baseQuery);
    }
  } catch (error) {
    console.error('❌ Error generating savings reports:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating savings reports',
      error: error.message
    });
  }
});

// 1. Summary Report
async function getSavingsSummaryReport(res, query) {
  try {
    const totalAccounts = await CustomerAccount.countDocuments(query);
    
    const activeAccounts = await CustomerAccount.countDocuments({
      ...query,
      status: 'Active'
    });

    const pendingAccounts = await CustomerAccount.countDocuments({
      ...query,
      status: 'Pending'
    });

    const closedAccounts = await CustomerAccount.countDocuments({
      ...query,
      status: 'Closed'
    });

    // Balance aggregates
    const balanceStats = await CustomerAccount.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalBalance: { $sum: { $toDouble: "$cleared_balance" } },
          avgBalance: { $avg: { $toDouble: "$cleared_balance" } },
          maxBalance: { $max: { $toDouble: "$cleared_balance" } },
          minBalance: { $min: { $toDouble: "$cleared_balance" } },
          totalAccounts: { $sum: 1 }
        }
      }
    ]);

    // Recent accounts (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentAccounts = await CustomerAccount.countDocuments({
      ...query,
      $or: [
        { creation_date: { $gte: thirtyDaysAgo } },
        { application_date: { $gte: thirtyDaysAgo } },
        { created_at: { $gte: thirtyDaysAgo } }
      ]
    });

    const balanceData = balanceStats[0] || {
      totalBalance: 0,
      avgBalance: 0,
      maxBalance: 0,
      minBalance: 0,
      totalAccounts: 0
    };

    return res.json({
      success: true,
      reportType: 'summary',
      generatedAt: new Date(),
      data: {
        overview: {
          totalSavingsAccounts: totalAccounts,
          activeAccounts,
          pendingAccounts,
          closedAccounts,
          recentAccountsLast30Days: recentAccounts
        },
        balanceSummary: {
          totalBalance: Math.round(balanceData.totalBalance * 100) / 100,
          averageBalance: Math.round(balanceData.avgBalance * 100) / 100,
          maximumBalance: Math.round(balanceData.maxBalance * 100) / 100,
          minimumBalance: Math.round(balanceData.minBalance * 100) / 100
        },
        percentages: {
          activePercentage: totalAccounts > 0 ? Math.round((activeAccounts / totalAccounts) * 100) : 0,
          pendingPercentage: totalAccounts > 0 ? Math.round((pendingAccounts / totalAccounts) * 100) : 0,
          closedPercentage: totalAccounts > 0 ? Math.round((closedAccounts / totalAccounts) * 100) : 0
        }
      }
    });
  } catch (error) {
    throw new Error(`Summary report error: ${error.message}`);
  }
}

// 2. Detailed Report with Pagination
async function getDetailedSavingsReport(res, query, page, limit) {
  try {
    const skip = (page - 1) * limit;

    const accounts = await CustomerAccount.find(query)
      .select('account_number ACCT_NO customer_id CUST_ID ACCT_NM status cleared_balance ledger_balance AVAILABLE_BALANCE branch BU_ID product product_type ACCOUNT_TYPE creation_date last_updated')
      .sort({ creation_date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalCount = await CustomerAccount.countDocuments(query);

    // Transform data for frontend consistency
    const transformedAccounts = accounts.map(account => ({
      id: account._id,
      accountNumber: account.account_number || account.ACCT_NO,
      customerId: account.customer_id || account.CUST_ID,
      accountName: account.ACCT_NM,
      status: account.status,
      balances: {
        cleared: account.cleared_balance ? parseFloat(account.cleared_balance.toString()) : 0,
        ledger: account.ledger_balance ? parseFloat(account.ledger_balance.toString()) : 0,
        available: account.AVAILABLE_BALANCE ? parseFloat(account.AVAILABLE_BALANCE.toString()) : 0
      },
      branch: account.branch || account.BU_ID,
      product: account.product || account.product_type,
      accountType: account.ACCOUNT_TYPE,
      createdDate: account.creation_date || account.created_at,
      lastUpdated: account.last_updated
    }));

    return res.json({
      success: true,
      reportType: 'detailed',
      generatedAt: new Date(),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: limit
      },
      data: transformedAccounts
    });
  } catch (error) {
    throw new Error(`Detailed report error: ${error.message}`);
  }
}

// 3. Branch-wise Report
async function getBranchWiseReport(res, query) {
  try {
    const branchStats = await CustomerAccount.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            $ifNull: ["$branch", "$BU_ID"]
          },
          totalAccounts: { $sum: 1 },
          activeAccounts: {
            $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] }
          },
          totalBalance: { $sum: { $toDouble: "$cleared_balance" } },
          averageBalance: { $avg: { $toDouble: "$cleared_balance" } }
        }
      },
      { $sort: { totalBalance: -1 } }
    ]);

    const transformedStats = branchStats.map(branch => ({
      branchId: branch._id,
      totalAccounts: branch.totalAccounts,
      activeAccounts: branch.activeAccounts,
      inactiveAccounts: branch.totalAccounts - branch.activeAccounts,
      totalBalance: Math.round(branch.totalBalance * 100) / 100,
      averageBalance: Math.round(branch.averageBalance * 100) / 100
    }));

    return res.json({
      success: true,
      reportType: 'branch-wise',
      generatedAt: new Date(),
      data: transformedStats
    });
  } catch (error) {
    throw new Error(`Branch-wise report error: ${error.message}`);
  }
}

// 4. Product-wise Report
async function getProductWiseReport(res, query) {
  try {
    const productStats = await CustomerAccount.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            $ifNull: ["$product", "$productCode", "$product_type"]
          },
          totalAccounts: { $sum: 1 },
          activeAccounts: {
            $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] }
          },
          totalBalance: { $sum: { $toDouble: "$cleared_balance" } },
          averageBalance: { $avg: { $toDouble: "$cleared_balance" } }
        }
      },
      { $sort: { totalBalance: -1 } }
    ]);

    const transformedStats = productStats.map(product => ({
      productCode: product._id,
      totalAccounts: product.totalAccounts,
      activeAccounts: product.activeAccounts,
      totalBalance: Math.round(product.totalBalance * 100) / 100,
      averageBalance: Math.round(product.averageBalance * 100) / 100
    }));

    return res.json({
      success: true,
      reportType: 'product-wise',
      generatedAt: new Date(),
      data: transformedStats
    });
  } catch (error) {
    throw new Error(`Product-wise report error: ${error.message}`);
  }
}

// 5. Status-wise Report
async function getStatusWiseReport(res, query) {
  try {
    const statusStats = await CustomerAccount.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$status",
          totalAccounts: { $sum: 1 },
          totalBalance: { $sum: { $toDouble: "$cleared_balance" } },
          averageBalance: { $avg: { $toDouble: "$cleared_balance" } }
        }
      },
      { $sort: { totalAccounts: -1 } }
    ]);

    const transformedStats = statusStats.map(status => ({
      status: status._id || 'Unknown',
      totalAccounts: status.totalAccounts,
      totalBalance: Math.round(status.totalBalance * 100) / 100,
      averageBalance: Math.round(status.averageBalance * 100) / 100
    }));

    return res.json({
      success: true,
      reportType: 'status-wise',
      generatedAt: new Date(),
      data: transformedStats
    });
  } catch (error) {
    throw new Error(`Status-wise report error: ${error.message}`);
  }
}

// FIXED: System Operations - Remove requireRole or define it
router.post('/system/update-dormant', async (req, res) => {
  try {
    const updatedAccounts = await updateDormantAccounts();
    res.status(200).json({
      success: true,
      message: 'Dormant accounts updated successfully.',
      data: {
        updatedCount: updatedAccounts.length,
        accounts: updatedAccounts
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating dormant accounts.',
      error: error.message
    });
  }
});

// 6. Balance Analysis Report
async function getBalanceAnalysisReport(res, query) {
  try {
    const balanceRanges = [
      { range: '0-1000', min: 0, max: 1000 },
      { range: '1001-5000', min: 1001, max: 5000 },
      { range: '5001-10000', min: 5001, max: 10000 },
      { range: '10001-50000', min: 10001, max: 50000 },
      { range: '50001+', min: 50001, max: Number.MAX_SAFE_INTEGER }
    ];

    const balanceAnalysis = [];

    for (const range of balanceRanges) {
      const count = await CustomerAccount.countDocuments({
        ...query,
        cleared_balance: {
          $gte: range.min,
          $lte: range.max
        }
      });

      balanceAnalysis.push({
        range: range.range,
        accountCount: count,
        percentage: 0 // Will calculate after we have total
      });
    }

    // Calculate percentages
    const totalAccounts = balanceAnalysis.reduce((sum, item) => sum + item.accountCount, 0);
    balanceAnalysis.forEach(item => {
      item.percentage = totalAccounts > 0 ? Math.round((item.accountCount / totalAccounts) * 100) : 0;
    });

    // Top accounts by balance
    const topAccounts = await CustomerAccount.find(query)
      .select('account_number ACCT_NO ACCT_NM cleared_balance status')
      .sort({ cleared_balance: -1 })
      .limit(10)
      .lean();

    const transformedTopAccounts = topAccounts.map(account => ({
      accountNumber: account.account_number || account.ACCT_NO,
      accountName: account.ACCT_NM,
      balance: account.cleared_balance ? parseFloat(account.cleared_balance.toString()) : 0,
      status: account.status
    }));

    return res.json({
      success: true,
      reportType: 'balance-analysis',
      generatedAt: new Date(),
      data: {
        balanceDistribution: balanceAnalysis,
        topAccountsByBalance: transformedTopAccounts,
        summary: {
          totalAccountsAnalyzed: totalAccounts,
          ranges: balanceRanges.length
        }
      }
    });
  } catch (error) {
    throw new Error(`Balance analysis report error: ${error.message}`);
  }
}

// Additional endpoint for real-time dashboard metrics
router.get('/savings-dashboard-metrics', async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Parallel execution for better performance
    const [
      totalAccounts,
      activeAccounts,
      totalBalance,
      newAccountsThisMonth,
      branchStats
    ] = await Promise.all([
      // Total savings accounts
      CustomerAccount.countDocuments({
        $or: [
          { ACCOUNT_TYPE: 'SAVINGS' },
          { product_type: 'savings' }
        ]
      }),
      
      // Active accounts
      CustomerAccount.countDocuments({
        $or: [
          { ACCOUNT_TYPE: 'SAVINGS' },
          { product_type: 'savings' }
        ],
        status: 'Active'
      }),
      
      // Total balance
      CustomerAccount.aggregate([
        {
          $match: {
            $or: [
              { ACCOUNT_TYPE: 'SAVINGS' },
              { product_type: 'savings' }
            ]
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $toDouble: "$cleared_balance" } }
          }
        }
      ]),
      
      // New accounts this month
      CustomerAccount.countDocuments({
        $or: [
          { ACCOUNT_TYPE: 'SAVINGS' },
          { product_type: 'savings' }
        ],
        $or: [
          { creation_date: { $gte: thirtyDaysAgo } },
          { application_date: { $gte: thirtyDaysAgo } }
        ]
      }),
      
      // Branch distribution
      CustomerAccount.aggregate([
        {
          $match: {
            $or: [
              { ACCOUNT_TYPE: 'SAVINGS' },
              { product_type: 'savings' }
            ]
          }
        },
        {
          $group: {
            _id: {
              $ifNull: ["$branch", "$BU_ID"]
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ]);

    const totalBalanceValue = totalBalance[0]?.total || 0;

    return res.json({
      success: true,
      generatedAt: new Date(),
      metrics: {
        totalSavingsAccounts: totalAccounts,
        activeAccounts,
        totalBalance: Math.round(totalBalanceValue * 100) / 100,
        newAccountsLast30Days: newAccountsThisMonth,
        inactiveAccounts: totalAccounts - activeAccounts,
        topBranches: branchStats.map(branch => ({
          branchId: branch._id,
          accountCount: branch.count
        }))
      },
      charts: {
        statusDistribution: {
          active: activeAccounts,
          inactive: totalAccounts - activeAccounts
        }
      }
    });
  } catch (error) {
    console.error('❌ Dashboard metrics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching dashboard metrics',
      error: error.message
    });
  }
});

export default router;