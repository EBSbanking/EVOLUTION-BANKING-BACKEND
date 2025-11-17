// routes/organizationRoutes.js
import express from 'express';
import { createOrganization, getOrganizations } from '../controllers/organizationController.js'; // Adjust path as needed

const router = express.Router();

// Create a new organization
router.post('/create-organization', createOrganization);

// Get all organizations (assuming a getOrganizations controller exists)
router.get('/', getOrganizations); // You'll need to implement getOrganizations in controller

export default router;