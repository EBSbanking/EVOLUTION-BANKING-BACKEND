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
  uncheckGuarantor,
  reactivateGuarantor,
  getGuarantorsByOfficer,
  getGuarantorAuditLogs,
  rejectGuarantor
} from "../controllers/GuarantorController.js";
import Guarantor from '../models/Guarantor.js'

const router = express.Router();

// ✅ Create guarantor
router.post("/create", createGuarantor);

// ✅ Approve guarantor
router.put("/approve/:guarantorId", approveGuarantor);

// Reject a guarantor
router.patch('/guarantors/:guarantorId/reject',  rejectGuarantor);


// Update a guarantor by ID
router.put('/:guarantorId', updateGuarantor); 

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

router.get('/', getAllGuarantors);
router.get('/:id', getGuarantorById);

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



// ✅ Get all guarantors (with optional filters)
router.get("/", getAllGuarantors);

// ✅ Get guarantor by system ID
router.get("/by-id/:guarantorId", getGuarantorById);

// ✅ Get guarantor by loan ID
router.get("/by-loan/:loanId", getGuarantorByLoanId);

// ✅ Delete guarantor by GUARANTOR_ID
router.delete("/:id", deleteGuarantor);

// ✅ Search guarantors
router.get("/search", searchGuarantors);

// ✅ Uncheck (deactivate) guarantor
router.put("/uncheck/:guarantorId", uncheckGuarantor);


// ✅ Reactivate a guarantor
router.put("/reactivate/:guarantorId", reactivateGuarantor);

// ✅ Get guarantors by relationship officer
router.get("/officer/:officerId", getGuarantorsByOfficer);

// ✅ Get guarantor audit logs
router.get('/audit/:guarantorId', getGuarantorAuditLogs);

export default router;
