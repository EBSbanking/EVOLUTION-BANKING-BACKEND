// routes/drawerReassignmentRoutes.js
import express from 'express';
import {
  createDrawerReassignment,  // FIXED: Use reassignment function
  getDrawerReassignmentHistory,
  getUserReassignments,
  getReassignmentAnalytics,
  getAllDrawerReassignments,
  getDrawerReassignmentById,
  updateDrawerReassignment,
  deleteDrawerReassignment
} from '../controllers/DrawerReassignmentController.js';

const router = express.Router();

// =============================================
// DRAWER REASSIGNMENT CRUD OPERATIONS
// =============================================

/**
 * @route   POST /api/drawer-reassignments
 * @desc    Create a new drawer reassignment record
 * @body    {
 *   DRAWER_REASSIGNMENT_ID: 1001,
 *   DRAWER_ID: 5001,
 *   BU_ID: 1,
 *   CURRENT_ASSIGNEE_ID: 2001,
 *   NEW_ASSIGNEE_ID: 2002,
 *   RSN_ID: 10,
 *   REMARKS: "Shift change",
 *   REASSIGNMENT_TYPE: "REGULAR",
 *   REASON_CODE: "SHIFT_CHANGE", 
 *   USER_ID: "manager001",
 *   CREATED_BY: "manager001",
 *   NEW_ASSIGNEE_NAME: "Jane Smith"
 * }
 * @access  Private (Manager)
 */
router.post('/', createDrawerReassignment);

/**
 * @route   GET /api/drawer-reassignments
 * @desc    Get all drawer reassignments with filtering
 * @query   drawerId, userId, reassignmentType, startDate, endDate, limit, offset
 * @access  Private (Manager/Supervisor)
 */
router.get('/', getAllDrawerReassignments);

/**
 * @route   GET /api/drawer-reassignments/:id
 * @desc    Get specific reassignment by ID
 * @access  Private
 */
router.get('/:id', getDrawerReassignmentById);

/**
 * @route   PUT /api/drawer-reassignments/:id
 * @desc    Update reassignment record (limited fields)
 * @body    { REMARKS, REASON_CODE, STATUS }
 * @access  Private (Manager)
 */
router.put('/:id', updateDrawerReassignment);

/**
 * @route   DELETE /api/drawer-reassignments/:id
 * @desc    Delete reassignment record (soft delete)
 * @access  Private (Admin)
 */
router.delete('/:id', deleteDrawerReassignment);

// =============================================
// DRAWER REASSIGNMENT REPORTS & ANALYTICS
// =============================================

/**
 * @route   GET /api/drawer-reassignments/drawer/:drawerId/history
 * @desc    Get reassignment history for a specific drawer
 * @query   limit, offset
 * @access  Private
 */
router.get('/drawer/:drawerId/history', getDrawerReassignmentHistory);

/**
 * @route   GET /api/drawer-reassignments/user/:userId
 * @desc    Get all reassignments for a specific user
 * @query   type, limit, offset
 * @access  Private
 */
router.get('/user/:userId', getUserReassignments);

/**
 * @route   GET /api/drawer-reassignments/analytics/summary
 * @desc    Get reassignment analytics and summary reports
 * @query   startDate, endDate, businessUnit, reassignmentType
 * @access  Private (Manager/Admin)
 */
router.get('/analytics/summary', getReassignmentAnalytics);

export default router;