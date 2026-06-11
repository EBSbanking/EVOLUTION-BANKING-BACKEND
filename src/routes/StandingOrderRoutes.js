import express from 'express';
import { 
  createStandingOrder, 
  getStandingOrders, 
  updateStandingOrder, 
  deleteStandingOrder, 
  processStandingOrderExecution, 
  getStandingOrderExecutions,
  approveStandingOrder,
  rejectStandingOrder
} from '../controllers/StandingOrderController.js';
import { authenticate} from '../middlewares/auth.js';

const router = express.Router();

// Create (no parameters)
router.post('/create', createStandingOrder);

// ✅ Protected routes – require authentication
router.put('/:customerAcctNo/approve',  authenticate, approveStandingOrder); // no authenticate
router.put('/:customerAcctNo/reject', authenticate, rejectStandingOrder);

// Generic routes with ID parameter (place AFTER specific ones)
router.put('/:customerAcctNo/:id', updateStandingOrder);
router.delete('/:customerAcctNo/:id', deleteStandingOrder);
router.post('/:customerAcctNo/:id/execute', processStandingOrderExecution);
router.get('/:customerAcctNo/:id/executions', getStandingOrderExecutions);

// List all standing orders for a customer (no ID)
router.get('/:customerAcctNo', getStandingOrders);

export default router;