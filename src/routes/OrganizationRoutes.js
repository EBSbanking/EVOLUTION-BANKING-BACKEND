import express from 'express';
import { 
  createOrganization, 
  getOrganizations, 
  getOrganizationById, 
  getOrganizationByCode,
  updateOrganization, 
  deleteOrganization,
  searchOrganizations,
  getOrganizationStatistics,
  deactivateOrganization,
  reactivateOrganization
} from '../controllers/organizationController.js';

const router = express.Router();

// Create a new organization
router.post('/create-organization', createOrganization);

// Get all organizations with pagination and search
router.get('/', getOrganizations);

// Search organizations with advanced filtering
router.get('/search', searchOrganizations);

// Get organization statistics
router.get('/statistics', getOrganizationStatistics);

// Get organization by ID
router.get('/:id', getOrganizationById);

// Get organization by numeric code
router.get('/code/:code', getOrganizationByCode);

// Update organization
router.put('/:id', updateOrganization);

// Deactivate organization (soft delete)
router.patch('/:id/deactivate', deactivateOrganization);

// Reactivate organization
router.patch('/:id/reactivate', reactivateOrganization);

// Delete organization (hard delete)
router.delete('/:id', deleteOrganization);

export default router;