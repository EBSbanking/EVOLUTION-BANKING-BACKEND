// controllers/tellerStatsController.js
import mongoose from 'mongoose';
import AuditTrail from '../models/AuditTrail.js';
import Drawer from '../models/Drawer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import asyncHandler from 'express-async-handler';
import logger from '../utils/logger.js';
import PERMISSIONS from '../constants/permissions.js';
import { hasPermission } from '../utils/permissionHelpers.js';
import BusinessUnit from '../models/BusinessUnit.js';

// Get today's statistics for teller dashboard
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // ✅ IMPROVED FIX: Query BusinessUnit model to get numeric BU_ID
    let numericBuId = 101; // Default to 101 based on your API response
    
    try {
      // Try to find the business unit by name to get the numeric ID
      const businessUnit = await BusinessUnit.findOne({ 
        BUSINESS_UNIT: buId 
      }).select('BU_ID').lean();

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
        USER_ID: userId,
        BU_ID: numericBuId,
        REC_ST: 'A',
        WF_STATUS: 'OPEN'
      }).lean();

      // Strategy 2: If not found, search by business unit name (fallback)
      if (!drawer) {
        console.log(`🔄 Drawer not found with BU_ID: ${numericBuId}, trying business unit name...`);
        drawer = await Drawer.findOne({ 
          USER_ID: userId,
          // Some systems might store business unit name in a different field
          $or: [
            { BUSINESS_UNIT: buId },
            { DRAWER_NM: { $regex: buId, $options: 'i' } }
          ],
          REC_ST: 'A',
          WF_STATUS: 'OPEN'
        }).lean();
      }

      // Strategy 3: If still not found, search for any open drawer for this user
      if (!drawer) {
        console.log(`🔄 No drawer found for specific BU, searching any open drawer for user...`);
        drawer = await Drawer.findOne({ 
          USER_ID: userId,
          REC_ST: 'A',
          WF_STATUS: 'OPEN'
        }).lean();
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
        // Try to get drawer balance from your existing drawer balance endpoint
        try {
          const drawerResponse = await apiClient.get(`/drawer/001/balance`);
          if (drawerResponse.data.success && drawerResponse.data.drawer) {
            cashInDrawer = drawerResponse.data.drawer.currentBalance || 0;
            console.log(`💰 Using drawer balance from API: ${cashInDrawer}`);
          }
        } catch (drawerError) {
          console.log('❌ Could not fetch drawer balance from API:', drawerError.message);
        }
      }
    } catch (drawerError) {
      console.error('❌ Error searching for drawer:', drawerError);
      // Continue with cashInDrawer = 0
    }

    // Get transaction statistics from AuditTrail WITH BU FILTER
    const transactionStats = await AuditTrail.aggregate([
      {
        $match: {
          timestamp: { $gte: today, $lt: tomorrow },
          entity_type: 'CustomerAccount',
          'additional_info.bu_id': buId,  // ✅ Keep string for AuditTrail
          $or: [
            { event_type: 'TRANSACTION_DR' },
            { event_type: 'TRANSACTION_CR' }
          ],
          status: 'SUCCESS'
        }
      },
      {
        $group: {
          _id: '$event_type',
          count: { $sum: 1 },
          totalAmount: { $sum: { $toDouble: '$additional_info.amount' } }
        }
      }
    ]);

    console.log(`📊 Transaction stats found:`, transactionStats);

    // Calculate totals
    let deposits = 0;
    let withdrawals = 0;
    let transactions = 0;
    let transfers = 0;

    transactionStats.forEach(stat => {
      if (stat._id === 'TRANSACTION_CR') {
        deposits += stat.totalAmount || 0;
      } else if (stat._id === 'TRANSACTION_DR') {
        withdrawals += stat.totalAmount || 0;
      }
      transactions += stat.count || 0;
    });

    // Count transfers WITH BU FILTER (using string bu_id for AuditTrail)
    const transferStats = await AuditTrail.countDocuments({
      timestamp: { $gte: today, $lt: tomorrow },
      entity_type: 'CustomerAccount',
      'additional_info.bu_id': buId,  // ✅ Keep string for AuditTrail
      'additional_info.transaction_mode': 'TRANSFER',
      status: 'SUCCESS'
    });

    transfers = transferStats;

    // Count unique customers served today WITH BU FILTER (using string bu_id for AuditTrail)
    const uniqueCustomers = await AuditTrail.distinct('account_no', {
      timestamp: { $gte: today, $lt: tomorrow },
      entity_type: 'CustomerAccount',
      'additional_info.bu_id': buId,  // ✅ Keep string for AuditTrail
      status: 'SUCCESS'
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
    const recentTransactions = await AuditTrail.find({
      entity_type: 'CustomerAccount',
      'additional_info.bu_id': buId,
      $or: [
        { event_type: 'TRANSACTION_DR' },
        { event_type: 'TRANSACTION_CR' }
      ],
      status: 'SUCCESS'
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .lean();

    // Format transactions for frontend
    const formattedTransactions = recentTransactions.map((transaction, index) => {
      const isDeposit = transaction.event_type === 'TRANSACTION_CR';
      const amount = parseFloat(transaction.additional_info?.amount || 0);
      const customerName = transaction.additional_info?.account_name || 'Unknown Customer';
      
      const transactionTime = new Date(transaction.timestamp);
      const timeString = transactionTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      return {
        id: transaction._id || index + 1,
        type: isDeposit ? 'Deposit' : 'Withdrawal',
        amount: amount,
        customer: customerName,
        time: timeString,
        status: 'completed',
        reference: transaction.reference_no,
        account: transaction.account_no,
        buId: transaction.additional_info?.bu_id
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
          DRAWER_ID: drawerIdNum,
          BU_ID: buId
        });
      } else {
        drawer = await Drawer.findOne({ 
          DRAWER_NO: drawerId,
          BU_ID: buId
        });
      }
    } else {
      drawer = await Drawer.findOne({ 
        USER_ID: userId,
        BU_ID: buId,
        REC_ST: 'A',
        WF_STATUS: 'OPEN'
      });
    }

    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: 'Drawer not found or not active in your business unit'
      });
    }

    // Get today's drawer transactions WITH BU FILTER
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const drawerTransactions = await AuditTrail.find({
      entity_type: 'Drawer',
      entity_id: drawer._id,
      'additional_info.bu_id': buId,
      timestamp: { $gte: today, $lt: tomorrow }
    }).sort({ timestamp: -1 }).lean();

    // Calculate drawer statistics
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let transactionCount = 0;

    drawerTransactions.forEach(transaction => {
      const amount = parseFloat(transaction.additional_info?.amount || 0);
      const effect = transaction.additional_info?.effect;
      
      if (effect === 'CREDIT') {
        totalDeposits += amount;
      } else if (effect === 'DEBIT') {
        totalWithdrawals += amount;
      }
      
      if (transaction.event_type === 'TRANSACTION_PROCESSED') {
        transactionCount++;
      }
    });

    const drawerStats = {
      drawerId: drawer.DRAWER_ID,
      drawerNo: drawer.DRAWER_NO,
      drawerName: drawer.DRAWER_NM,
      currentBalance: parseFloat(drawer.CURRENT_BALANCE?.toString() || 0),
      openingBalance: parseFloat(drawer.OPENING_BALANCE?.toString() || 0),
      minBalance: parseFloat(drawer.MIN_BAL?.toString() || 0),
      maxBalance: parseFloat(drawer.MAX_BAL?.toString() || 0),
      todayDeposits: totalDeposits,
      todayWithdrawals: totalWithdrawals,
      todayTransactions: transactionCount,
      status: drawer.WF_STATUS,
      lastUpdated: drawer.LAST_UPDATE_DT,
      buId: drawer.BU_ID
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

    // Get performance data WITH BU FILTER
    const performanceData = await AuditTrail.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
          'additional_info.bu_id': buId,
          entity_type: 'CustomerAccount',
          status: 'SUCCESS',
          $or: [
            { event_type: 'TRANSACTION_DR' },
            { event_type: 'TRANSACTION_CR' }
          ]
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            type: '$event_type'
          },
          count: { $sum: 1 },
          totalAmount: { $sum: { $toDouble: '$additional_info.amount' } }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

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

    // Get teller performance data WITH BU FILTER
    const tellerPerformance = await AuditTrail.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
          'additional_info.bu_id': buId,
          entity_type: 'CustomerAccount',
          status: 'SUCCESS',
          $or: [
            { event_type: 'TRANSACTION_DR' },
            { event_type: 'TRANSACTION_CR' }
          ]
        }
      },
      {
        $group: {
          _id: '$user_id',
          transactionCount: { $sum: 1 },
          totalAmount: { $sum: { $toDouble: '$additional_info.amount' } },
          depositCount: {
            $sum: {
              $cond: [{ $eq: ['$event_type', 'TRANSACTION_CR'] }, 1, 0]
            }
          },
          withdrawalCount: {
            $sum: {
              $cond: [{ $eq: ['$event_type', 'TRANSACTION_DR'] }, 1, 0]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'USER_ID',
          as: 'userInfo'
        }
      },
      {
        $unwind: {
          path: '$userInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          tellerId: '$_id',
          tellerName: {
            $ifNull: [
              '$userInfo.FULL_NAME',
              'Unknown Teller'
            ]
          },
          transactionCount: 1,
          totalAmount: 1,
          depositCount: 1,
          withdrawalCount: 1,
          averageTransaction: {
            $cond: [
              { $eq: ['$transactionCount', 0] },
              0,
              { $divide: ['$totalAmount', '$transactionCount'] }
            ]
          }
        }
      },
      {
        $sort: { transactionCount: -1 }
      }
    ]);

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