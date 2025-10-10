import express from 'express';
import { createOrganization } from '../controllers/organizationController.js'; // Import the controller function

const router = express.Router();

// POST route for creating an organization
router.post('/create-organization', createOrganization);

export default router;