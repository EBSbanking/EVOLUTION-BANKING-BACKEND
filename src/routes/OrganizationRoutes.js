import express from 'express';
import { 
  createOrganization, 
  getOrganizations, 
  getOrganizationById, 
  getOrganizationByCode,
  updateOrganization, 
  deleteOrganization 
} from '../controllers/organizationController.js';

const router = express.Router();

// Create a new organization
router.post('/create-organization', createOrganization);

// Get all organizations with pagination and search
router.get('/', getOrganizations);

// Get organization by ID
router.get('/:id', getOrganizationById);

// Get organization by numeric code
router.get('/code/:code', getOrganizationByCode);

// Update organization
router.put('/:id', updateOrganization);

// Delete organization
router.delete('/:id', deleteOrganization);

export default router;