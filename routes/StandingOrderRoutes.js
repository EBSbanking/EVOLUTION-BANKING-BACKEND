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

const router = express.Router();

// Create and list
router.post('/create', createStandingOrder);
router.get('/:customerAcctNo', getStandingOrders);

// Specific operations
router.put('/:customerAcctNo/:id', updateStandingOrder);
router.delete('/:customerAcctNo/:id', deleteStandingOrder);
router.post('/:customerAcctNo/:id/execute', processStandingOrderExecution);
router.get('/:customerAcctNo/:id/executions', getStandingOrderExecutions);

// FIXED: Consistent route structure - removed "standing-order" prefix
router.put('/:customerAcctNo/approve', approveStandingOrder);
router.put('/:customerAcctNo/reject', rejectStandingOrder);

export default router;