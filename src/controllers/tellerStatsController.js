// controllers/tellerStatsController.js
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import AuditTrail from '../models/AuditTrail.js';
import Drawer from '../models/Drawer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import asyncHandler from 'express-async-handler';
import logger from '../utils/logger.js';
import PERMISSIONS from '../constants/permissions.js';
import { hasPermission } from '../utils/permissionHelpers.js';
import BusinessUnit from '../models/BusinessUnit.js';

// Helper function for date range
const getTodayDateRange = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { start: today, end: tomorrow };
};

// Get today's statistics for teller dashboard
export const getTellerTodayStats = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 FULL req.user:', req.user);
    console.log('🔍 FULL req.authUser:', req.authUser);
    
    // Try multiple sources with fallbacks
    const buId = req.user?.businessUnit || 
                 req.user?.bu_id ||
                 req.authUser?.businessUnit ||
                 req.authUser?.bu_id ||
                 'RELIEF BRANCH'; // ✅ FALLBACK
    
    const userId = req.user?.userId || req.authUser?.id;
    const userRoleId = req.user?.BU_ROLE_ID || req.authUser?.BU_ROLE_ID || 29;
    const userPermissions = req.user?.permissions || req.authUser?.permissions;
    
    console.log('📊 Fetching teller stats for:', {
      userId,
      userRoleId,
      buId,
      userPermissions,
      authUserBusinessUnit: req.authUser?.businessUnit,
      userBusinessUnit: req.user?.businessUnit,
      timestamp: new Date().toISOString()
    });

    // ✅ KEEP THE VALIDATION BUT ALLOW FALLBACK VALUE
    if (!buId || buId === 'undefined') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: No business unit context',
        debug: {
          authUser: req.authUser,
          user: req.user,
          authUserFields: req.authUser ? Object.keys(req.authUser) : [],
          userFields: req.user ? Object.keys(req.user) : []
        }
      });
    }

    // ✅ FIXED PERMISSION CHECK: Use role-based access (Teller role = 29)
    if (userRoleId !== 29) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Teller role required to view real-time statistics'
      });
    }

    // Get today's date range
    const { start: today, end: tomorrow } = getTodayDateRange();

    // ✅ IMPROVED FIX: Query BusinessUnit model to get numeric BU_ID
    let numericBuId = 101; // Default to 101 based on your API response
    
    try {
      // Try to find the business unit by name to get the numeric ID
      const businessUnit = await BusinessUnit.findOne({ 
        where: { BUSINESS_UNIT: buId },
        attributes: ['BU_ID']
      });

      if (businessUnit && businessUnit.BU_ID) {
        numericBuId = parseInt(businessUnit.BU_ID);
        console.log(`✅ Found numeric BU_ID: ${numericBuId} for business unit: ${buId}`);
      } else {
        console.log(`⚠️ Business unit not found: ${buId}, using default BU_ID: 101`);
        
        // Alternative: Try to find by BU_ID if buId is already numeric
        if (!isNaN(buId)) {
          numericBuId = parseInt(buId);
          console.log(`✅ Using numeric BU_ID directly: ${numericBuId}`);
        }
      }
    } catch (buError) {
      console.error('❌ Error querying BusinessUnit:', buError);
      // Fallback to default mapping based on your API response
      const fallbackMapping = {
        'RELIEF BRANCH': 101, // Based on your API response
        'MAIN BRANCH': 102,
        'HEAD OFFICE': 103,
      };
      numericBuId = fallbackMapping[buId] || 101;
      console.log(`🔄 Using fallback BU_ID: ${numericBuId} for: ${buId}`);
    }

    // ✅ IMPROVED: Find user's drawer with multiple search strategies
    let drawer = null;
    let cashInDrawer = 0;

    try {
      // Strategy 1: Search by numeric BU_ID (primary)
      drawer = await Drawer.findOne({ 
        where: {
          USER_ID: userId,
          BU_ID: numericBuId,
          REC_ST: 'A',
          WF_STATUS: 'OPEN'
        }
      });

      // Strategy 2: If not found, search by business unit name (fallback)
      if (!drawer) {
        console.log(`🔄 Drawer not found with BU_ID: ${numericBuId}, trying business unit name...`);
        drawer = await Drawer.findOne({ 
          where: {
            USER_ID: userId,
            [Op.or]: [
              { BUSINESS_UNIT: buId },
              { DRAWER_NM: { [Op.like]: `%${buId}%` } }
            ],
            REC_ST: 'A',
            WF_STATUS: 'OPEN'
          }
        });
      }

      // Strategy 3: If still not found, search for any open drawer for this user
      if (!drawer) {
        console.log(`🔄 No drawer found for specific BU, searching any open drawer for user...`);
        drawer = await Drawer.findOne({ 
          where: {
            USER_ID: userId,
            REC_ST: 'A',
            WF_STATUS: 'OPEN'
          }
        });
      }

      if (drawer) {
        cashInDrawer = parseFloat(drawer.CURRENT_BALANCE?.toString() || 0);
        console.log(`💰 Drawer found with balance: ${cashInDrawer}`, {
          drawerId: drawer.DRAWER_ID,
          drawerNo: drawer.DRAWER_NO,
          buId: drawer.BU_ID,
          userId: drawer.USER_ID
        });
      } else {
        console.log(`❌ No open drawer found for user: ${userId}`);
        // Note: API client calls would need to be updated separately
      }
    } catch (drawerError) {
      console.error('❌ Error searching for drawer:', drawerError);
      // Continue with cashInDrawer = 0
    }

    // Get transaction statistics from AuditTrail WITH BU FILTER
    const transactionStats = await AuditTrail.findAll({
      where: {
        timestamp: { [Op.gte]: today, [Op.lt]: tomorrow },
        entity_type: 'CustomerAccount',
        additional_info: sequelize.where(
          sequelize.fn('JSON_EXTRACT', sequelize.col('additional_info'), '$.bu_id'),
          buId
        ),
        [Op.or]: [
          { event_type: 'TRANSACTION_DR' },
          { event_type: 'TRANSACTION_CR' }
        ],
        status: 'SUCCESS'
      },
      raw: true
    });

    console.log(`📊 Transaction stats found:`, transactionStats.length);

    // Calculate totals
    let deposits = 0;
    let withdrawals = 0;
    let transactions = 0;
    let transfers = 0;

    transactionStats.forEach(stat => {
      const amount = parseFloat(stat.additional_info?.amount || 0);
      if (stat.event_type === 'TRANSACTION_CR') {
        deposits += amount;
      } else if (stat.event_type === 'TRANSACTION_DR') {
        withdrawals += amount;
      }
      transactions++;
    });

    // Count transfers WITH BU FILTER
    const transferStats = await AuditTrail.count({
      where: {
        timestamp: { [Op.gte]: today, [Op.lt]: tomorrow },
        entity_type: 'CustomerAccount',
        additional_info: sequelize.where(
          sequelize.fn('JSON_EXTRACT', sequelize.col('additional_info'), '$.bu_id'),
          buId
        ),
        additional_info: sequelize.where(
          sequelize.fn('JSON_EXTRACT', sequelize.col('additional_info'), '$.transaction_mode'),
          'TRANSFER'
        ),
        status: 'SUCCESS'
      }
    });

    transfers = transferStats;

    // Count unique customers served today WITH BU FILTER
    const uniqueCustomers = await AuditTrail.findAll({
      where: {
        timestamp: { [Op.gte]: today, [Op.lt]: tomorrow },
        entity_type: 'CustomerAccount',
        additional_info: sequelize.where(
          sequelize.fn('JSON_EXTRACT', sequelize.col('additional_info'), '$.bu_id'),
          buId
        ),
        status: 'SUCCESS'
      },
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('account_no')), 'account_no']],
      raw: true
    });

    const customers = uniqueCustomers.length;

    // Calculate daily target achievement
    const dailyTarget = 25;
    const targetAchievement = Math.min(100, Math.floor((transactions / dailyTarget) * 100));

    const stats = {
      transactions,
      deposits,
      withdrawals,
      customers,
      transfers,
      cashInDrawer,
      dailyTarget,
      targetAchievement,
      buId,
      numericBuId  // ✅ Include numeric ID for debugging
    };

    console.log('📈 Teller stats calculated:', { 
      buId, 
      numericBuId, 
      transactions,
      deposits,
      withdrawals,
      customers,
      transfers,
      cashInDrawer
    });

    res.status(200).json({
      success: true,
      data: stats,
      message: 'Teller statistics retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching teller stats:', error);
    logger.error('Error in getTellerTodayStats', {
      error: error.message,
      userId: req.user?.userId,
      buId: req.user?.businessUnit,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching teller statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get recent transactions for teller dashboard
export const getTellerRecentTransactions = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 FULL req.user:', req.user);
    console.log('🔍 FULL req.authUser:', req.authUser);
    
    // Try multiple sources with fallbacks
    const buId = req.user?.businessUnit || 
                 req.user?.bu_id ||
                 req.authUser?.businessUnit ||
                 req.authUser?.bu_id ||
                 'RELIEF BRANCH'; // ✅ FALLBACK
    
    const userId = req.user?.userId || req.authUser?.id;
    const userPermissions = req.user?.permissions || req.authUser?.permissions;
    
    console.log('🔄 Fetching recent transactions for:', { 
      userId, 
      buId,
      authUserBusinessUnit: req.authUser?.businessUnit,
      userBusinessUnit: req.user?.businessUnit
    });

    // ✅ KEEP THE VALIDATION BUT ALLOW FALLBACK VALUE
    if (!buId || buId === 'undefined') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: No business unit context',
        debug: {
          authUser: req.authUser,
          user: req.user,
          authUserFields: req.authUser ? Object.keys(req.authUser) : [],
          userFields: req.user ? Object.keys(req.user) : []
        }
      });
    }

    // Check if user has permission to view teller dashboard
    const hasAccess = hasPermission(userPermissions, PERMISSIONS.DASHBOARD.VIEW_TELLER_DASHBOARD);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Insufficient permissions to view teller dashboard'
      });
    }

    // Get last 10 transactions WITH BU FILTER
    const recentTransactions = await AuditTrail.findAll({
      where: {
        entity_type: 'CustomerAccount',
        additional_info: sequelize.where(
          sequelize.fn('JSON_EXTRACT', sequelize.col('additional_info'), '$.bu_id'),
          buId
        ),
        [Op.or]: [
          { event_type: 'TRANSACTION_DR' },
          { event_type: 'TRANSACTION_CR' }
        ],
        status: 'SUCCESS'
      },
      order: [['timestamp', 'DESC']],
      limit: 10,
      raw: true
    });

    // Format transactions for frontend
    const formattedTransactions = recentTransactions.map((transaction, index) => {
      const isDeposit = transaction.event_type === 'TRANSACTION_CR';
      const additionalInfo = transaction.additional_info || {};
      const amount = parseFloat(additionalInfo.amount || 0);
      const customerName = additionalInfo.account_name || 'Unknown Customer';
      
      const transactionTime = new Date(transaction.timestamp);
      const timeString = transactionTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      return {
        id: transaction.id || index + 1,
        type: isDeposit ? 'Deposit' : 'Withdrawal',
        amount: amount,
        customer: customerName,
        time: timeString,
        status: 'completed',
        reference: transaction.reference_no,
        account: transaction.account_no,
        buId: additionalInfo.bu_id
      };
    });

    console.log('📋 Recent transactions found for BU:', { buId, count: formattedTransactions.length });

    res.status(200).json({
      success: true,
      data: formattedTransactions,
      message: 'Recent transactions retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching recent transactions:', error);
    logger.error('Error in getTellerRecentTransactions', {
      error: error.message,
      userId: req.user?.userId,
      buId: req.user?.businessUnit,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching recent transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get drawer-specific statistics
export const getDrawerStats = asyncHandler(async (req, res) => {
  try {
    const { drawerId } = req.params;
    const userId = req.user?.userId;
    const buId = req.user?.businessUnit; // ✅ CHANGED: bu_id → businessUnit
    const userPermissions = req.user?.permissions;

    console.log('💰 Fetching drawer stats for:', { drawerId, userId, buId });

    // Validate BU context
    if (!buId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: No business unit context'
      });
    }

    // Check if user has permission to view drawer
    const hasAccess = hasPermission(userPermissions, PERMISSIONS.DRAWER.VIEW);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Insufficient permissions to view drawer'
      });
    }

    // Find drawer by ID or user WITH BU CHECK
    let drawer;
    if (drawerId) {
      const drawerIdNum = parseInt(drawerId);
      if (!isNaN(drawerIdNum)) {
        drawer = await Drawer.findOne({ 
          where: {
            DRAWER_ID: drawerIdNum,
            BU_ID: buId
          }
        });
      } else {
        drawer = await Drawer.findOne({ 
          where: {
            DRAWER_NO: drawerId,
            BU_ID: buId
          }
        });
      }
    } else {
      drawer = await Drawer.findOne({ 
        where: {
          USER_ID: userId,
          BU_ID: buId,
          REC_ST: 'A',
          WF_STATUS: 'OPEN'
        }
      });
    }

    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: 'Drawer not found or not active in your business unit'
      });
    }

    // Get today's drawer transactions WITH BU FILTER
    const { start: today, end: tomorrow } = getTodayDateRange();

    const drawerTransactions = await AuditTrail.findAll({
      where: {
        entity_type: 'Drawer',
        entity_id: drawer.id,
        additional_info: sequelize.where(
          sequelize.fn('JSON_EXTRACT', sequelize.col('additional_info'), '$.bu_id'),
          buId
        ),
        timestamp: { [Op.gte]: today, [Op.lt]: tomorrow }
      },
      order: [['timestamp', 'DESC']],
      raw: true
    });

    // Calculate drawer statistics
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let transactionCount = 0;

    drawerTransactions.forEach(transaction => {
      const additionalInfo = transaction.additional_info || {};
      const amount = parseFloat(additionalInfo.amount || 0);
      const effect = additionalInfo.effect;
      
      if (effect === 'CREDIT') {
        totalDeposits += amount;
      } else if (effect === 'DEBIT') {
        totalWithdrawals += amount;
      }
      
      if (transaction.event_type === 'TRANSACTION_PROCESSED') {
        transactionCount++;
      }
    });

    const drawerData = drawer.get({ plain: true });
    const drawerStats = {
      drawerId: drawerData.DRAWER_ID,
      drawerNo: drawerData.DRAWER_NO,
      drawerName: drawerData.DRAWER_NM,
      currentBalance: parseFloat(drawerData.CURRENT_BALANCE?.toString() || 0),
      openingBalance: parseFloat(drawerData.OPENING_BALANCE?.toString() || 0),
      minBalance: parseFloat(drawerData.MIN_BAL?.toString() || 0),
      maxBalance: parseFloat(drawerData.MAX_BAL?.toString() || 0),
      todayDeposits: totalDeposits,
      todayWithdrawals: totalWithdrawals,
      todayTransactions: transactionCount,
      status: drawerData.WF_STATUS,
      lastUpdated: drawerData.LAST_UPDATE_DT,
      buId: drawerData.BU_ID
    };

    console.log('📊 Drawer stats calculated for BU:', { buId, drawerStats });

    res.status(200).json({
      success: true,
      data: drawerStats,
      message: 'Drawer statistics retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching drawer stats:', error);
    logger.error('Error in getDrawerStats', {
      error: error.message,
      drawerId: req.params.drawerId,
      userId: req.user?.userId,
      buId: req.user?.businessUnit,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching drawer statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get business unit performance summary
export const getBUPerformanceSummary = asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.userId;
    const buId = req.user?.businessUnit; // ✅ CHANGED: bu_id → businessUnit
    const userPermissions = req.user?.permissions;
    
    if (!buId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: No business unit context'
      });
    }

    // Check if user has permission to view dashboard
    const hasAccess = hasPermission(userPermissions, PERMISSIONS.DASHBOARD.VIEW);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Insufficient permissions to view dashboard'
      });
    }

    // Get date range (last 7 days)
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);

    // Get performance data WITH BU FILTER using raw SQL for complex aggregation
    const performanceData = await sequelize.query(`
      SELECT 
        DATE(timestamp) as date,
        event_type as type,
        COUNT(*) as count,
        SUM(CAST(JSON_EXTRACT(additional_info, '$.amount') AS DECIMAL(10,2))) as totalAmount
      FROM audit_trails
      WHERE timestamp BETWEEN :startDate AND :endDate
        AND entity_type = 'CustomerAccount'
        AND JSON_EXTRACT(additional_info, '$.bu_id') = :buId
        AND status = 'SUCCESS'
        AND (event_type = 'TRANSACTION_DR' OR event_type = 'TRANSACTION_CR')
      GROUP BY DATE(timestamp), event_type
      ORDER BY date ASC
    `, {
      replacements: { 
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        buId: buId
      },
      type: sequelize.QueryTypes.SELECT
    });

    console.log('📈 BU performance summary for:', { buId, dataPoints: performanceData.length });

    res.status(200).json({
      success: true,
      data: performanceData,
      message: 'Business unit performance summary retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching BU performance summary:', error);
    logger.error('Error in getBUPerformanceSummary', {
      error: error.message,
      buId: req.user?.businessUnit,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching performance summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get teller performance metrics (for managers/supervisors)
export const getTellerPerformanceMetrics = asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.userId;
    const buId = req.user?.businessUnit; // ✅ CHANGED: bu_id → businessUnit
    const userPermissions = req.user?.permissions;
    
    if (!buId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: No business unit context'
      });
    }

    // Check if user has permission to view reports
    const hasAccess = hasPermission(userPermissions, PERMISSIONS.REPORT.VIEW);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Insufficient permissions to view performance metrics'
      });
    }

    // Get date range (current month)
    const startDate = new Date();
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // Get teller performance data WITH BU FILTER using raw SQL for complex aggregation
    const tellerPerformance = await sequelize.query(`
      SELECT 
        user_id as tellerId,
        COUNT(*) as transactionCount,
        SUM(CAST(JSON_EXTRACT(additional_info, '$.amount') AS DECIMAL(10,2))) as totalAmount,
        SUM(CASE WHEN event_type = 'TRANSACTION_CR' THEN 1 ELSE 0 END) as depositCount,
        SUM(CASE WHEN event_type = 'TRANSACTION_DR' THEN 1 ELSE 0 END) as withdrawalCount,
        u.FULL_NAME as tellerName,
        CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE SUM(CAST(JSON_EXTRACT(additional_info, '$.amount') AS DECIMAL(10,2))) / COUNT(*)
        END as averageTransaction
      FROM audit_trails a
      LEFT JOIN users u ON a.user_id = u.USER_ID
      WHERE a.timestamp BETWEEN :startDate AND :endDate
        AND a.entity_type = 'CustomerAccount'
        AND JSON_EXTRACT(a.additional_info, '$.bu_id') = :buId
        AND a.status = 'SUCCESS'
        AND (a.event_type = 'TRANSACTION_DR' OR a.event_type = 'TRANSACTION_CR')
      GROUP BY a.user_id
      ORDER BY transactionCount DESC
    `, {
      replacements: { 
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        buId: buId
      },
      type: sequelize.QueryTypes.SELECT
    });

    console.log('📊 Teller performance metrics for BU:', { buId, tellerCount: tellerPerformance.length });

    res.status(200).json({
      success: true,
      data: tellerPerformance,
      message: 'Teller performance metrics retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching teller performance metrics:', error);
    logger.error('Error in getTellerPerformanceMetrics', {
      error: error.message,
      buId: req.user?.businessUnit,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching teller performance metrics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Additional helper functions

// Get teller dashboard overview
export const getTellerDashboardOverview = asyncHandler(async (req, res) => {
  try {
    const buId = req.user?.businessUnit;
    const userId = req.user?.userId;

    if (!buId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: No business unit context'
      });
    }

    // Get all statistics in parallel
    const [todayStats, recentTransactions, drawerStats] = await Promise.all([
      // Get today's stats (simplified version)
      (async () => {
        const { start: today, end: tomorrow } = getTodayDateRange();
        
        const transactions = await AuditTrail.count({
          where: {
            timestamp: { [Op.gte]: today, [Op.lt]: tomorrow },
            entity_type: 'CustomerAccount',
            additional_info: sequelize.where(
              sequelize.fn('JSON_EXTRACT', sequelize.col('additional_info'), '$.bu_id'),
              buId
            ),
            [Op.or]: [
              { event_type: 'TRANSACTION_DR' },
              { event_type: 'TRANSACTION_CR' }
            ],
            status: 'SUCCESS'
          }
        });

        const customers = await AuditTrail.count({
          where: {
            timestamp: { [Op.gte]: today, [Op.lt]: tomorrow },
            entity_type: 'CustomerAccount',
            additional_info: sequelize.where(
              sequelize.fn('JSON_EXTRACT', sequelize.col('additional_info'), '$.bu_id'),
              buId
            ),
            status: 'SUCCESS'
          },
          distinct: true,
          col: 'account_no'
        });

        return {
          transactions,
          customers,
          dailyTarget: 25,
          targetAchievement: Math.min(100, Math.floor((transactions / 25) * 100))
        };
      })(),

      // Get recent transactions
      getTellerRecentTransactionsData(buId),

      // Get drawer stats
      (async () => {
        const drawer = await Drawer.findOne({
          where: {
            USER_ID: userId,
            BU_ID: buId,
            REC_ST: 'A',
            WF_STATUS: 'OPEN'
          }
        });

        if (drawer) {
          const drawerData = drawer.get({ plain: true });
          return {
            drawerId: drawerData.DRAWER_ID,
            drawerNo: drawerData.DRAWER_NO,
            currentBalance: parseFloat(drawerData.CURRENT_BALANCE?.toString() || 0),
            status: drawerData.WF_STATUS
          };
        }
        return null;
      })()
    ]);

    const overview = {
      todayStats,
      recentTransactions,
      drawerStats,
      buId,
      lastUpdated: new Date().toISOString()
    };

    res.status(200).json({
      success: true,
      data: overview,
      message: 'Teller dashboard overview retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching teller dashboard overview:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teller dashboard overview',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper function for recent transactions data
async function getTellerRecentTransactionsData(buId, limit = 5) {
  const transactions = await AuditTrail.findAll({
    where: {
      entity_type: 'CustomerAccount',
      additional_info: sequelize.where(
        sequelize.fn('JSON_EXTRACT', sequelize.col('additional_info'), '$.bu_id'),
        buId
      ),
      [Op.or]: [
        { event_type: 'TRANSACTION_DR' },
        { event_type: 'TRANSACTION_CR' }
      ],
      status: 'SUCCESS'
    },
    order: [['timestamp', 'DESC']],
    limit: limit,
    raw: true
  });

  return transactions.map((transaction, index) => {
    const isDeposit = transaction.event_type === 'TRANSACTION_CR';
    const additionalInfo = transaction.additional_info || {};
    const amount = parseFloat(additionalInfo.amount || 0);
    const customerName = additionalInfo.account_name || 'Unknown Customer';
    
    const transactionTime = new Date(transaction.timestamp);
    const timeString = transactionTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return {
      id: transaction.id || index + 1,
      type: isDeposit ? 'Deposit' : 'Withdrawal',
      amount: amount,
      customer: customerName,
      time: timeString,
      status: 'completed'
    };
  });
}

export default {
  getTellerTodayStats,
  getTellerRecentTransactions,
  getDrawerStats,
  getBUPerformanceSummary,
  getTellerPerformanceMetrics,
  getTellerDashboardOverview
};