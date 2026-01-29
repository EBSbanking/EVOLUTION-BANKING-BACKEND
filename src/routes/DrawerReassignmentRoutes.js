// routes/drawerReassignmentRoutes.js
import express from 'express';
import {
  createDrawerReassignment,
  getAllDrawerReassignments,
  getDrawerReassignmentById,
  updateDrawerReassignment,
  deleteDrawerReassignment,
  getDrawerReassignmentHistory,
  getUserReassignments,
  getReassignmentAnalytics,
  getCurrentDrawerAssignment,
  getUserCurrentAssignments,
  getDrawerReassignmentsWithDetails,
  getReassignmentStatistics,
  getReassignmentsByStatus,
  getActiveDrawerReassignments
} from '../controllers/DrawerReassignmentController.js';

const router = express.Router();

/**
 * @route   POST /api/drawer-reassignments
 * @desc    Create a new drawer reassignment
 * @body    See controller for required fields
 * @access  Private (Manager/Supervisor)
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
 * @route   GET /api/drawer-reassignments/with-details
 * @desc    Get all drawer reassignments with drawer details included
 * @query   drawerId, userId, reassignmentType, startDate, endDate, limit, offset, includeDrawer
 * @access  Private (Manager/Supervisor)
 */
router.get('/with-details', getDrawerReassignmentsWithDetails);

/**
 * @route   GET /api/drawer-reassignments/:id
 * @desc    Get a specific drawer reassignment by ID
 * @param   id - Reassignment ID (can be integer or string)
 * @access  Private (Manager/Supervisor/Teller)
 */
router.get('/:id', getDrawerReassignmentById);

/**
 * @route   PUT /api/drawer-reassignments/:id
 * @desc    Update a drawer reassignment
 * @param   id - Reassignment ID
 * @body    REMARKS, REASON_CODE, STATUS
 * @access  Private (Manager/Supervisor)
 */
router.put('/:id', updateDrawerReassignment);

/**
 * @route   DELETE /api/drawer-reassignments/:id
 * @desc    Delete (soft delete) a drawer reassignment
 * @param   id - Reassignment ID
 * @access  Private (Manager/Supervisor)
 */
router.delete('/:id', deleteDrawerReassignment);

/**
 * @route   GET /api/drawer-reassignments/drawer/:drawerId/history
 * @desc    Get reassignment history for a specific drawer
 * @param   drawerId - ID of the drawer
 * @query   limit, offset
 * @access  Private (Manager/Supervisor/Teller)
 */
router.get('/drawer/:drawerId/history', getDrawerReassignmentHistory);

/**
 * @route   GET /api/drawer-reassignments/drawer/:drawerId/current
 * @desc    Get the current active assignment for a specific drawer
 * @param   drawerId - ID of the drawer (can be DRAWER_ID or DRAWER_NO)
 * @access  Private (Teller/Manager/Supervisor)
 */
router.get('/drawer/:drawerId/current', getCurrentDrawerAssignment); // Changed to getCurrentDrawerAssignment

/**
 * @route   GET /api/drawer-reassignments/drawer/:drawerId/active
 * @desc    Get active reassignments for a drawer
 * @param   drawerId - ID of the drawer
 * @access  Private (Manager/Supervisor)
 */
router.get('/drawer/:drawerId/active', getActiveDrawerReassignments);

/**
 * @route   GET /api/drawer-reassignments/user/:userId
 * @desc    Get all reassignments for a specific user
 * @param   userId - User ID
 * @query   type (all/assigned/unassigned), limit, offset
 * @access  Private (Manager/Supervisor)
 */
router.get('/user/:userId', getUserReassignments);

/**
 * @route   GET /api/drawer-reassignments/user/:userId/current
 * @desc    Get all current active assignments for a specific user
 * @param   userId - ID of the user
 * @access  Private (Teller/Manager/Supervisor)
 */
router.get('/user/:userId/current', getUserCurrentAssignments);

/**
 * @route   GET /api/drawer-reassignments/status/:status
 * @desc    Get reassignments by status
 * @param   status - Status (PENDING, APPROVED, COMPLETED, etc.)
 * @query   limit, offset
 * @access  Private (Manager/Supervisor)
 */
router.get('/status/:status', getReassignmentsByStatus);

/**
 * @route   GET /api/drawer-reassignments/analytics
 * @desc    Get reassignment analytics
 * @query   startDate, endDate, businessUnit, reassignmentType
 * @access  Private (Manager/Supervisor)
 */
router.get('/analytics', getReassignmentAnalytics);

/**
 * @route   GET /api/drawer-reassignments/statistics
 * @desc    Get reassignment statistics by period
 * @query   period (day/week/month/year), startDate, endDate, buId
 * @access  Private (Manager/Supervisor)
 */
router.get('/statistics', getReassignmentStatistics);

export default router;