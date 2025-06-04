import express from 'express';  // Use import for express
import { 
    getAllWorkflowRoutings, 
    getWorkflowRoutingById, 
    createWorkflowRouting, 
    updateWorkflowRoutingById, 
    deleteWorkflowRoutingById, 
    findWorkflowRoutingsByField 
} from '../controllers/CustWorkflowRoutingController.js';  // Make sure these are correctly named exports

const router = express.Router();

// Define routes
router.post('/workflow-routing', createWorkflowRouting);
router.get('/workflow-routing', getAllWorkflowRoutings);
router.get('/workflow-routing/:userId/:wfRoutingId', getWorkflowRoutingById);  // Updated route
router.put('/workflow-routing/:id', updateWorkflowRoutingById);
router.delete('/workflow-routing/:id', deleteWorkflowRoutingById);
router.get('/workflow-routing/find/:field/:value', findWorkflowRoutingsByField);

export default router;  // Export router as default
