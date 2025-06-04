import express from 'express';
import { createRelationshipOfficer, getRelationshipOfficers, getRelationshipOfficerById, updateRelationshipOfficer, deleteRelationshipOfficer } from '../controllers/RelationshipOfficerController.js';

const router = express.Router();

// Create a new Relationship Officer
router.post('/', createRelationshipOfficer);

// Get all Relationship Officers
router.get('/', getRelationshipOfficers);

// Get a specific Relationship Officer by ID
router.get('/:id', getRelationshipOfficerById);

// Update Relationship Officer
router.put('/:id', updateRelationshipOfficer);

// Delete a Relationship Officer
router.delete('/:id', deleteRelationshipOfficer);

export default router;
