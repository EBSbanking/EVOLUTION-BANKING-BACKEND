// routes/StandingOrderRoutes.js
import express from 'express';
import { 
  createStandingOrder, 
  getStandingOrders, 
  updateStandingOrder, 
  deleteStandingOrder, 
  processStandingOrderExecution, 
  getStandingOrderExecutions,
  approveStandingOrder,
  rejectStandingOrder,
  getAllPendingStandingOrders
} from '../controllers/StandingOrderController.js';  // ← Fixed: Was importing from TermDepositController
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

// ============================================================
// PUBLIC ROUTES (No authentication required)
// ============================================================

// Create standing order
router.post('/', createStandingOrder);

// ============================================================
// PROTECTED ROUTES (Authentication required)
// ============================================================

// Get all pending standing orders (admin/approval)
router.get('/pending', authenticate, getAllPendingStandingOrders);

// Approve standing order
router.patch('/:customerAcctNo/approve', authenticate, approveStandingOrder);

// Reject standing order
router.patch('/:customerAcctNo/reject', authenticate, rejectStandingOrder);

// ============================================================
// CUSTOMER ROUTES (Authentication required)
// ============================================================

// Get all standing orders for a customer
router.get('/:customerAcctNo', authenticate, getStandingOrders);

// Get standing order by ID with executions
router.get('/:customerAcctNo/:id/executions', authenticate, getStandingOrderExecutions);

// Update standing order
router.put('/:customerAcctNo/:id', authenticate, updateStandingOrder);

// Delete standing order
router.delete('/:customerAcctNo/:id', authenticate, deleteStandingOrder);

// Execute standing order (manual)
router.post('/:customerAcctNo/:id/execute', authenticate, processStandingOrderExecution);

export default router;