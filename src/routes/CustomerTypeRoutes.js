import express from 'express';
import controller from '../controllers/CustomerTypeController.js';

const router = express.Router();

router.post('/create', controller.createCustomerType); // Create
router.get('/create', controller.getAllCustomerTypes);        // Get all
router.get('/:id', controller.getCustomerTypeById);    // Get by id
router.put('/:id', controller.updateCustomerType);     // Update
router.delete('/:id', controller.deleteCustomerType);  // Delete

export default router;
