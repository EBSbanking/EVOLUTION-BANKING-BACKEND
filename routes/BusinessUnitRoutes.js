import express from 'express';
import {
    createBusinessUnit,
    getAllBusinessUnits,
    getBusinessUnitById,
    updateBusinessUnit,
    deleteBusinessUnit
} from '../controllers/BusinessUnitController.js';

const router = express.Router();

// Route to create a new business unit
router.post('/create', createBusinessUnit);

// Route to get all business units
router.get('/all', getAllBusinessUnits);

// Route to get a specific business unit by ID
router.get('/business-unit/:BU_ID', getBusinessUnitById); // :BU_ID is the route parameter


// Route to update a business unit by ID
router.put('/business-unit/update/:BU_ID', updateBusinessUnit);

// Route to delete a business unit by ID
router.delete('/business-unit/delete/:BU_ID', deleteBusinessUnit);

export default router;
