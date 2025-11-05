import express from "express";
import {
  createGuarantor,
  approveGuarantor,
  updateGuarantor,
  getAllGuarantors,
  getGuarantorById,
  getGuarantorByLoanId,
  deleteGuarantor,
  searchGuarantors,
  requestGuarantorRemoval,
  approveGuarantorRemoval,
  reactivateGuarantor,
  getGuarantorsByOfficer,
  getGuarantorAuditLogs,
  rejectGuarantor
} from "../controllers/GuarantorController.js";
import Guarantor from '../models/Guarantor.js'

import { authenticate } from '../middlewares/authMiddleware.js';
import mongoose from "mongoose";

const router = express.Router();

// ✅ Create guarantor
router.post("/create", createGuarantor);

// ✅ Approve guarantor
router.put("/approve/:guarantorId", approveGuarantor);

// Reject a guarantor
router.patch('/guarantors/:guarantorId/reject', rejectGuarantor);

// Update a guarantor by ID
router.put('/:guarantorId', updateGuarantor); 

// ✅ Get all guarantors (with optional filters)
router.get("/", getAllGuarantors);

// ✅ Get guarantor by system ID (GUARANTOR_ID)
router.get("/:id", getGuarantorById);

// ✅ Get guarantor by loan ID
router.get("/by-loan/:loanId", getGuarantorByLoanId);

// ✅ Delete guarantor by GUARANTOR_ID
router.delete("/:id", deleteGuarantor);

// ✅ Search guarantors
router.get("/search", searchGuarantors);


// @route   POST /api/guarantors/remove-request/:guarantorId
// @desc    Request guarantor removal (sets status to PENDING)
// @access  Private
router.post('/remove-request/:guarantorId', authenticate, async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { guarantorId } = req.params;
    const { loanAccountNumber, reason, notes } = req.body;
    const userId = req.user.id;

    await session.startTransaction();

    const result = await requestGuarantorRemoval(
      guarantorId,
      loanAccountNumber,
      reason,
      notes,
      userId,
      session
    );

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: 'Guarantor removal request submitted for approval',
      data: result
    });

  } catch (error) {
    await session.abortTransaction();
    
    console.error('Error in guarantor removal request:', error);
    
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to submit removal request'
    });
  } finally {
    session.endSession();
  }
});


// @route   PUT /api/guarantors/approve-removal/:guarantorId
// @desc    Approve guarantor removal (sets status to DEACTIVATED)
// @access  Private (Manager role)
// ✅ Approve guarantor removal
router.put("/approve-removal/:guarantorId", authenticate, async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { guarantorId } = req.params;
    const approverId = req.user.id;

    await session.startTransaction();

    const result = await approveGuarantorRemoval(
      guarantorId,
      approverId,
      session
    );

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: 'Guarantor removal approved and deactivated',
      data: result
    });

  } catch (error) {
    await session.abortTransaction();
    
    console.error('Error in approving guarantor removal:', error);
    
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to approve removal'
    });
  } finally {
    session.endSession();
  }
});




// ✅ TEMPORARY: Reactivate a guarantor (bypass role check for testing)
router.put("/reactivate/:guarantorId", authenticate, async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { guarantorId } = req.params;
    const { reason, notes, loanAccountNumber } = req.body;
    const userId = req.user.id;

    // TEMPORARY: Bypass role check for testing
    console.log('⚠️ TEMPORARY: Role check bypassed for testing. User:', req.user.user_name);

    await session.startTransaction();

    const result = await reactivateGuarantor(
      guarantorId,
      {
        reactivatedBy: userId,
        reason: reason || 'Reactivation approved',
        notes: notes || '',
        loanAccountNumber: loanAccountNumber
      },
      session
    );

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: 'Guarantor successfully reactivated',
      data: result
    });

  } catch (error) {
    await session.abortTransaction();
    
    console.error('Error in reactivate guarantor:', error);
    
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to reactivate guarantor'
    });
  } finally {
    session.endSession();
  }
});

// ✅ Get guarantors by relationship officer
router.get("/officer/:officerId", getGuarantorsByOfficer);

// ✅ Get guarantor audit logs
router.get('/audit/:guarantorId', getGuarantorAuditLogs);

// Temporary debug route for verification
router.get('/guarantors/:id/verify', async (req, res) => {
  try {
    // Add type conversion if needed (match your creation logic)
    const searchId = req.params.id; // or Number(req.params.id) if stored as number
    const guarantor = await Guarantor.findOne({ GUARANTOR_ID: searchId });
    
    // Enhanced debug info:
    res.json({ 
      exists: !!guarantor,
      type: typeof guarantor?.GUARANTOR_ID,
      id: req.params.id,
      searchedAs: searchId,
      guarantor: guarantor,
      debugNote: "Note: GUARANTOR_IDs are 7-digit strings (e.g., '1000001')"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Temporary debug route
router.get('/guarantors/debug', async (req, res) => {
  try {
    const guarantors = await Guarantor.find({}, 'GUARANTOR_ID');
    res.json({
      count: guarantors.length,
      data: guarantors.map(g => ({ 
        id: g.GUARANTOR_ID, 
        type: typeof g.GUARANTOR_ID 
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;