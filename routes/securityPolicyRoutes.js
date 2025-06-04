import express from 'express'; // Use import instead of require
import securityPolicyController from './controllers/securityPolicyController.js'; // Ensure the path is correct

const router = express.Router();

// Define your routes here
router.post('/', securityPolicyController.createSecurityPolicy);
router.get('/', securityPolicyController.getAllSecurityPolicies);
router.get('/:id', securityPolicyController.getSecurityPolicyById);
router.put('/:id', securityPolicyController.updateSecurityPolicy);
router.delete('/:id', securityPolicyController.deleteSecurityPolicy);

// Use the correct export statement for ES Modules
export default router; 
