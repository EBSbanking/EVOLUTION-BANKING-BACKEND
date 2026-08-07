// routes/NotificationRoutes.js
import express from 'express';
import { Op } from 'sequelize';
import {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  createNotification,
  deleteNotification,
  sendApprovalNotification,
  getBranchPendingApprovals,
  getUserNotificationsService,
  getNotificationStats
} from '../controllers/NotificationController.js';
import Notification from '../models/Notification.js';
import { authenticate } from '../middlewares/auth.js';
import { authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ============================================
// BASIC NOTIFICATION ROUTES
// ============================================

/**
 * Get user notifications (for bell icon)
 * GET /api/notifications/user/:userId/:roleId?
 * ✅ FIXED: Accepts userId and optional roleId
 */
router.get(
  '/user/:userId/:roleId?',
  authenticate,
  getUserNotifications
);

/**
 * Get user notifications by BU_ID (for branch managers)
 * GET /api/notifications/bu/:BU_ID
 * ✅ NEW: Get all notifications for a specific Business Unit
 */
router.get(
  '/bu/:BU_ID',
  authenticate,
  authorize(['Admin', 'Manager', 'Branch Manager', 'Supervisor']),
  async (req, res) => {
    try {
      const { BU_ID } = req.params;
      const { status, limit = 50, offset = 0 } = req.query;
      
      const whereClause = {
        [Op.or]: [
          { 'metadata.BU_ID': BU_ID },
          { BU_ID: BU_ID }
        ]
      };
      
      if (status) {
        whereClause.status = status;
      }
      
      const notifications = await Notification.findAndCountAll({
        where: whereClause,
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      res.json({
        success: true,
        data: notifications.rows,
        total: notifications.count,
        BU_ID
      });
    } catch (error) {
      console.error('❌ Error fetching BU notifications:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Mark notification as read
 * PUT /api/notifications/:notificationId/read
 */
router.put(
  '/:notificationId/read',
  authenticate,
  markAsRead
);

/**
 * Mark all notifications as read for a user
 * PUT /api/notifications/user/:userId/:roleId/read-all
 */
router.put(
  '/user/:userId/:roleId/read-all',
  authenticate,
  markAllAsRead
);

/**
 * Create notification (Admin/Manager only)
 * POST /api/notifications
 */
router.post(
  '/',
  authenticate,
  authorize(['Admin', 'Manager']),
  createNotification
);

/**
 * Delete notification (Admin only)
 * DELETE /api/notifications/:notificationId
 */
router.delete(
  '/:notificationId',
  authenticate,
  authorize(['Admin']),
  deleteNotification
);

// ============================================
// APPROVAL NOTIFICATION ROUTES
// ============================================

/**
 * Send approval notification (for workflow approvals)
 * POST /api/notifications/send-approval
 * ✅ FIXED: Now sends to Branch Manager instead of Admin
 */
router.post(
  '/send-approval',
  authenticate,
  authorize(['Admin', 'Manager', 'Supervisor', 'Branch Manager']),
  async (req, res) => {
    try {
      const {
        itemType,
        itemId,
        itemName,
        description,
        submittedBy,
        BU_ID,
        metadata = {},
        priority = 'medium'
      } = req.body;
      
      // Validate required fields
      if (!itemType || !itemId || !itemName || !submittedBy || !BU_ID) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: itemType, itemId, itemName, submittedBy, BU_ID'
        });
      }
      
      // Use the controller's sendApprovalNotification
      const result = await sendApprovalNotification(req, res);
      
      // If the controller already sent a response, return
      if (res.headersSent) {
        return;
      }
      
      // Otherwise, send the result
      res.json(result);
      
    } catch (error) {
      console.error('❌ Error in send-approval route:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get branch pending approvals summary
 * GET /api/notifications/branch/:BU_ID/pending
 * ✅ FIXED: Shows pending approvals for a specific branch
 */
router.get(
  '/branch/:BU_ID/pending',
  authenticate,
  authorize(['Admin', 'Manager', 'Branch Manager', 'Supervisor']),
  getBranchPendingApprovals
);

/**
 * Get user notifications with service fallback
 * GET /api/notifications/user-service/:userId/:roleId?
 */
router.get(
  '/user-service/:userId/:roleId?',
  authenticate,
  getUserNotificationsService
);

/**
 * Get notification statistics by BU
 * GET /api/notifications/stats/:BU_ID
 * ✅ FIXED: Returns statistics for a specific BU
 */
router.get(
  '/stats/:BU_ID',
  authenticate,
  authorize(['Admin', 'Manager', 'Branch Manager']),
  getNotificationStats
);

/**
 * Get unread count for a user
 * GET /api/notifications/user/:userId/:roleId/unread-count
 * ✅ NEW: Get only the unread count
 */
router.get(
  '/user/:userId/:roleId/unread-count',
  authenticate,
  async (req, res) => {
    try {
      const { userId, roleId } = req.params;
      
      const count = await Notification.count({
        where: {
          [Op.or]: [
            { recipient_id: userId },
            { ROLE_ID: roleId }
          ],
          status: { [Op.in]: ['pending', 'sent'] }
        }
      });
      
      res.json({
        success: true,
        unreadCount: count
      });
    } catch (error) {
      console.error('❌ Error getting unread count:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get notifications by status
 * GET /api/notifications/status/:status
 * ✅ NEW: Filter notifications by status
 */
router.get(
  '/status/:status',
  authenticate,
  authorize(['Admin', 'Manager']),
  async (req, res) => {
    try {
      const { status } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      const notifications = await Notification.findAndCountAll({
        where: { status: status },
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      res.json({
        success: true,
        data: notifications.rows,
        total: notifications.count,
        status
      });
    } catch (error) {
      console.error('❌ Error fetching notifications by status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get notifications assigned to a specific role
 * GET /api/notifications/role/:roleId
 * ✅ NEW: Get notifications for a specific role
 */
router.get(
  '/role/:roleId',
  authenticate,
  authorize(['Admin', 'Manager']),
  async (req, res) => {
    try {
      const { roleId } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      const notifications = await Notification.findAndCountAll({
        where: { ROLE_ID: roleId },
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      res.json({
        success: true,
        data: notifications.rows,
        total: notifications.count,
        roleId
      });
    } catch (error) {
      console.error('❌ Error fetching notifications by role:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get branch managers notifications
 * GET /api/notifications/branch-managers/:BU_ID
 * ✅ NEW: Get notifications specifically for branch managers
 */
router.get(
  '/branch-managers/:BU_ID',
  authenticate,
  authorize(['Admin', 'Manager', 'Branch Manager']),
  async (req, res) => {
    try {
      const { BU_ID } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      // Find branch manager role IDs (19, 20, 30, 31, 32)
      const managerRoleIds = ['19', '20', '30', '31', '32'];
      
      const notifications = await Notification.findAndCountAll({
        where: {
          [Op.and]: [
            {
              [Op.or]: [
                { 'metadata.BU_ID': BU_ID },
                { BU_ID: BU_ID }
              ]
            },
            {
              ROLE_ID: { [Op.in]: managerRoleIds }
            }
          ]
        },
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      res.json({
        success: true,
        data: notifications.rows,
        total: notifications.count,
        BU_ID
      });
    } catch (error) {
      console.error('❌ Error fetching branch manager notifications:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get recent notifications (last 7 days)
 * GET /api/notifications/recent
 * ✅ NEW: Get recent notifications
 */
router.get(
  '/recent',
  authenticate,
  async (req, res) => {
    try {
      const { userId, roleId, limit = 20 } = req.query;
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const whereClause = {
        created_at: { [Op.gte]: sevenDaysAgo }
      };
      
      if (userId) {
        whereClause[Op.or] = [
          { recipient_id: userId },
          { ROLE_ID: roleId }
        ];
      }
      
      const notifications = await Notification.findAll({
        where: whereClause,
        order: [['created_at', 'DESC']],
        limit: parseInt(limit)
      });
      
      res.json({
        success: true,
        data: notifications,
        count: notifications.length
      });
    } catch (error) {
      console.error('❌ Error fetching recent notifications:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Cleanup old notifications (Admin only)
 * DELETE /api/notifications/cleanup
 */
router.delete(
  '/cleanup',
  authenticate,
  authorize(['Admin']),
  async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const deleted = await Notification.destroy({
        where: {
          status: { [Op.in]: ['read', 'viewed', 'archived'] },
          created_at: { [Op.lt]: cutoffDate }
        }
      });
      
      res.json({
        success: true,
        message: `Cleaned up ${deleted} old notifications`,
        deleted,
        days
      });
    } catch (error) {
      console.error('❌ Cleanup error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get notification by ID
 * GET /api/notifications/:notificationId
 * ✅ NEW: Get a specific notification by ID
 */
router.get(
  '/:notificationId',
  authenticate,
  async (req, res) => {
    try {
      const { notificationId } = req.params;
      
      const notification = await Notification.findByPk(notificationId);
      
      if (!notification) {
        return res.status(404).json({
          success: false,
          error: 'Notification not found'
        });
      }
      
      // Check if user has access to this notification
      const userId = req.user?.id || req.user?.user_id;
      const roleId = req.user?.BU_ROLE_ID || req.user?.roleId;
      
      if (notification.recipient_id !== userId && 
          notification.ROLE_ID !== roleId && 
          req.user?.BU_ROLE_ID !== '1') {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this notification'
        });
      }
      
      res.json({
        success: true,
        data: notification
      });
    } catch (error) {
      console.error('❌ Error fetching notification:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Bulk mark notifications as read
 * PUT /api/notifications/bulk-read
 * ✅ NEW: Mark multiple notifications as read at once
 */
router.put(
  '/bulk-read',
  authenticate,
  async (req, res) => {
    try {
      const { notificationIds } = req.body;
      
      if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'notificationIds array is required'
        });
      }
      
      const userId = req.user?.id || req.user?.user_id;
      
      const [updatedCount] = await Notification.update(
        {
          status: 'viewed',
          viewed_at: new Date()
        },
        {
          where: {
            id: { [Op.in]: notificationIds },
            recipient_id: userId
          }
        }
      );
      
      res.json({
        success: true,
        message: `Marked ${updatedCount} notifications as read`,
        updatedCount
      });
    } catch (error) {
      console.error('❌ Error bulk marking notifications:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

export default router;