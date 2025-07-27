// controllers/guarantorController.js
import mongoose from 'mongoose';
import Guarantor from '../models/Guarantor.js';
import LoanAccount from '../models/LoanAccount.js';
import GuarantorAudit from '../models/GuarantorAudit.js';
import { generateGuarantorId } from '../utils/generateGuarantorId.js'; // Adjust path as needed
import { toDecimal } from '../utils/formatUtils.js'; // If you have this helper

export const createGuarantor = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Destructure all fields from req.body
    const {
      fullName,
      phoneNumber,
      relationshipToBorrower,
      GUARANTEED_AMT,
      createdBy,
      RELATIONSHIP_OFFICER_ID,
      relationshipOfficerName,
      loanId,
      status,
      email,
      address,
      city,
      state,
      country = 'Nigeria',
      idType,
      idNumber,
      bvn,
      dateOfBirth,
      netWorth,
      annualIncome,
      occupation,
      employmentType
    } = req.body;

    // Validate required fields
    if (!fullName || !phoneNumber || !relationshipToBorrower || !GUARANTEED_AMT || !createdBy) {
      return res.status(400).json({ 
        success: false, 
        message: 'Required fields are missing', 
        code: 'MISSING_FIELDS',
        missingFields: {
          fullName: !fullName,
          phoneNumber: !phoneNumber,
          relationshipToBorrower: !relationshipToBorrower,
          GUARANTEED_AMT: !GUARANTEED_AMT,
          createdBy: !createdBy
        }
      });
    }

    // Generate and validate 7-digit GUARANTOR_ID
    const GUARANTOR_ID = await generateGuarantorId();
    console.log('[ID GENERATION] Generated GUARANTOR_ID:', {
      value: GUARANTOR_ID,
      type: typeof GUARANTOR_ID,
      length: GUARANTOR_ID.length
    });

    // Validate ID format
    if (!/^\d{7}$/.test(GUARANTOR_ID)) {
      throw new Error(`Invalid ID format generated: ${GUARANTOR_ID}`);
    }

    // Check uniqueness
    const exists = await Guarantor.findOne({ GUARANTOR_ID }).session(session);
    if (exists) {
      await session.abortTransaction();
      return res.status(409).json({ 
        success: false, 
        message: `Guarantor with ID ${GUARANTOR_ID} already exists`, 
        code: 'DUPLICATE_GUARANTOR',
        generatedId: GUARANTOR_ID
      });
    }

    // Validate loan (if provided)
    let linkedLoan = null;
    if (loanId) {
      linkedLoan = await LoanAccount.findOne({ loanAccountId: Number(loanId) }).session(session);
      if (!linkedLoan) {
        await session.abortTransaction();
        return res.status(404).json({ 
          success: false, 
          message: 'Loan account not found', 
          code: 'LOAN_NOT_FOUND' 
        });
      }

      const existingForLoan = await Guarantor.findOne({ loanId: Number(loanId) }).session(session);
      if (existingForLoan) {
        await session.abortTransaction();
        return res.status(409).json({ 
          success: false, 
          message: 'Guarantor already exists for loan', 
          code: 'GUARANTOR_EXISTS' 
        });
      }
    }

    // Validate BVN
    if (bvn && !/^\d{11}$/.test(bvn)) {
      return res.status(400).json({ 
        success: false, 
        message: 'BVN must be 11 digits', 
        code: 'INVALID_BVN' 
      });
    }

    if (bvn) {
      const bvnUsed = await Guarantor.findOne({ bvn }).session(session);
      if (bvnUsed) {
        await session.abortTransaction();
        return res.status(409).json({ 
          success: false, 
          message: 'BVN already used', 
          code: 'DUPLICATE_BVN' 
        });
      }
    }

    // Create guarantor document
    const newGuarantor = await Guarantor.create([{
      GUARANTOR_ID,
      fullName,
      phoneNumber,
      relationshipToBorrower,
      GUARANTEED_AMT: toDecimal(GUARANTEED_AMT),
      createdBy,
      RELATIONSHIP_OFFICER_ID,
      relationshipOfficerName,
      loanId: loanId ? Number(loanId) : null,
      status,
      email,
      address,
      city,
      state,
      country,
      idType,
      idNumber,
      bvn,
      dateOfBirth,
      netWorth: netWorth ? toDecimal(netWorth) : null,
      annualIncome: annualIncome ? toDecimal(annualIncome) : null,
      occupation,
      employmentType,
      verificationStatus: 'Pending'
    }], { session });

    console.log('[CREATION SUCCESS] New guarantor:', {
      id: newGuarantor[0].GUARANTOR_ID,
      name: newGuarantor[0].fullName,
      loan: newGuarantor[0].loanId || 'Not linked'
    });

    // Update related documents if loan was linked
    if (loanId && linkedLoan) {
      await updateRelatedDocuments({
        session,
        loanId: Number(loanId),
        guarantor: newGuarantor[0],
        loanAccount: linkedLoan,
        user: req.user,
        CREATED_BY: createdBy
      });
    }

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: 'Guarantor created successfully',
      data: {
        guarantorId: newGuarantor[0].GUARANTOR_ID,
        name: newGuarantor[0].fullName,
        loanId: newGuarantor[0].loanId,
        status: newGuarantor[0].verificationStatus,
        createdAt: newGuarantor[0].createdAt
      },
      systemInfo: {
        idFormat: '7-digit string',
        idType: typeof newGuarantor[0].GUARANTOR_ID,
        idGeneration: 'auto-incremented'
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('[CREATION FAILED] Error:', {
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to create guarantor',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  } finally {
    session.endSession();
  }
};

// Approve Guarantor
export const approveGuarantor = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { guarantorId } = req.params;

    // Find guarantor by GUARANTOR_ID
    const guarantor = await Guarantor.findOne({ GUARANTOR_ID: guarantorId }).session(session);
    if (!guarantor) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false, 
        message: 'Guarantor not found', 
        code: 'NOT_FOUND' 
      });
    }

    // Check if already verified
    if (guarantor.verificationStatus === 'Verified') {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'Guarantor is already verified', 
        code: 'ALREADY_VERIFIED' 
      });
    }

    // Update both verificationStatus AND status fields
    guarantor.verificationStatus = 'Verified';
    guarantor.status = 'ACTIVE';  // This is the new line you need to add
    guarantor.updatedBy = req.user?.id || 'system';
    guarantor.verifiedBy = req.user?.name || 'Supervisor Approver';
    guarantor.verifier = {
      id: req.user?.id || 'system',
      name: req.user?.name || 'Supervisor Approver'
    };

    // Set consentDate if missing
    if (!guarantor.consentDate) {
      guarantor.consentDate = new Date();
    }

    // Save update
    await guarantor.save({ session });

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Guarantor approved successfully',
      data: {
        id: guarantor._id,
        guarantorId: guarantor.GUARANTOR_ID,
        name: guarantor.fullName,
        verificationStatus: guarantor.verificationStatus,
        status: guarantor.status,  // Include the new status in response
        verifiedBy: guarantor.verifier,
        updatedDate: guarantor.updatedAt
      }
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Approve Guarantor Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to approve guarantor', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

export const rejectGuarantor = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { guarantorId } = req.params;

    // Find guarantor by GUARANTOR_ID
    const guarantor = await Guarantor.findOne({ GUARANTOR_ID: guarantorId }).session(session);
    if (!guarantor) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false, 
        message: 'Guarantor not found', 
        code: 'NOT_FOUND' 
      });
    }

    // Check if already rejected
    if (guarantor.verificationStatus === 'Rejected') {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'Guarantor is already rejected', 
        code: 'ALREADY_REJECTED' 
      });
    }

    // Update status to REJECTED
    guarantor.verificationStatus = 'Rejected';
    guarantor.status = 'REJECTED';
    guarantor.updatedBy = req.user?.id || 'system';
    guarantor.rejectedBy = req.user?.name || 'Supervisor Approver';
    guarantor.verifier = {
      id: req.user?.id || 'system',
      name: req.user?.name || 'Supervisor Approver'
    };

    // Optionally store reason or rejectionDate if needed
    if (!guarantor.rejectionDate) {
      guarantor.rejectionDate = new Date();
    }

    // Save changes
    await guarantor.save({ session });

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Guarantor rejected successfully',
      data: {
        id: guarantor._id,
        guarantorId: guarantor.GUARANTOR_ID,
        name: guarantor.fullName,
        verificationStatus: guarantor.verificationStatus,
        status: guarantor.status,
        rejectedBy: guarantor.verifier,
        updatedDate: guarantor.updatedAt
      }
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Reject Guarantor Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to reject guarantor', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};


// Update Guarantor
export const updateGuarantor = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { guarantorId } = req.params;
    
    // Enhanced ID validation
    if (!guarantorId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Guarantor ID is required', 
        code: 'MISSING_GUARANTOR_ID' 
      });
    }

    // Log the ID being searched for debugging
    console.log(`Searching for guarantor with ID: ${guarantorId} (Type: ${typeof guarantorId})`);

    // Find existing guarantor with flexible ID type handling
    const existingGuarantor = await Guarantor.findOne({ 
      $or: [
        { GUARANTOR_ID: guarantorId },
        { GUARANTOR_ID: Number(guarantorId) },
        { GUARANTOR_ID: guarantorId.toString() }
      ]
    }).session(session);

    if (!existingGuarantor) {
      await session.abortTransaction();
      
      // Diagnostic logging
      const allGuarantors = await Guarantor.find({}, 'GUARANTOR_ID').session(session);
      console.log('Existing guarantor IDs:', allGuarantors.map(g => g.GUARANTOR_ID));
      
      return res.status(404).json({ 
        success: false, 
        message: 'Guarantor not found', 
        code: 'GUARANTOR_NOT_FOUND',
        searchedId: guarantorId,
        existingIds: allGuarantors.map(g => g.GUARANTOR_ID)
      });
    }

    // Extract and validate update data
    const {
      fullName,
      phoneNumber,
      relationshipToBorrower,
      GUARANTEED_AMT,
      RELATIONSHIP_OFFICER_ID,
      relationshipOfficerName,
      loanId,
      email,
      address,
      city,
      state,
      country,
      idType,
      idNumber,
      bvn,
      dateOfBirth,
      netWorth,
      annualIncome,
      occupation,
      employmentType,
      verificationStatus
    } = req.body;

    // Validate loan if provided
    let linkedLoan = null;
    if (loanId) {
      linkedLoan = await LoanAccount.findOne({ 
        loanAccountId: Number(loanId) 
      }).session(session);
      
      if (!linkedLoan) {
        await session.abortTransaction();
        return res.status(404).json({ 
          success: false, 
          message: 'Loan account not found', 
          code: 'LOAN_NOT_FOUND' 
        });
      }

      // Check for other guarantors on this loan
      const existingForLoan = await Guarantor.findOne({ 
        loanId: Number(loanId),
        GUARANTOR_ID: { $ne: existingGuarantor.GUARANTOR_ID }
      }).session(session);
      
      if (existingForLoan) {
        await session.abortTransaction();
        return res.status(409).json({ 
          success: false, 
          message: 'Another guarantor already exists for this loan', 
          code: 'GUARANTOR_EXISTS' 
        });
      }
    }

    // BVN validation
    if (bvn && bvn !== existingGuarantor.bvn) {
      if (!/^\d{11}$/.test(bvn)) {
        return res.status(400).json({ 
          success: false, 
          message: 'BVN must be 11 digits', 
          code: 'INVALID_BVN' 
        });
      }

      const bvnUsed = await Guarantor.findOne({ 
        bvn,
        GUARANTOR_ID: { $ne: existingGuarantor.GUARANTOR_ID }
      }).session(session);
      
      if (bvnUsed) {
        return res.status(409).json({ 
          success: false, 
          message: 'BVN already used by another guarantor', 
          code: 'DUPLICATE_BVN' 
        });
      }
    }

    // Prepare update data with fallbacks
    const updateData = {
      fullName: fullName || existingGuarantor.fullName,
      phoneNumber: phoneNumber || existingGuarantor.phoneNumber,
      relationshipToBorrower: relationshipToBorrower || existingGuarantor.relationshipToBorrower,
      GUARANTEED_AMT: GUARANTEED_AMT ? toDecimal(GUARANTEED_AMT) : existingGuarantor.GUARANTEED_AMT,
      RELATIONSHIP_OFFICER_ID: RELATIONSHIP_OFFICER_ID || existingGuarantor.RELATIONSHIP_OFFICER_ID,
      relationshipOfficerName: relationshipOfficerName || existingGuarantor.relationshipOfficerName,
      loanId: loanId ? Number(loanId) : existingGuarantor.loanId,
      email: email || existingGuarantor.email,
      address: address || existingGuarantor.address,
      city: city || existingGuarantor.city,
      state: state || existingGuarantor.state,
      country: country || existingGuarantor.country,
      idType: idType || existingGuarantor.idType,
      idNumber: idNumber || existingGuarantor.idNumber,
      bvn: bvn || existingGuarantor.bvn,
      dateOfBirth: dateOfBirth || existingGuarantor.dateOfBirth,
      netWorth: netWorth ? toDecimal(netWorth) : existingGuarantor.netWorth,
      annualIncome: annualIncome ? toDecimal(annualIncome) : existingGuarantor.annualIncome,
      occupation: occupation || existingGuarantor.occupation,
      employmentType: employmentType || existingGuarantor.employmentType,
      verificationStatus: verificationStatus || existingGuarantor.verificationStatus,
      updatedAt: new Date()
    };

    // Perform the update
    const updatedGuarantor = await Guarantor.findOneAndUpdate(
      { _id: existingGuarantor._id }, // More reliable than GUARANTOR_ID
      updateData,
      { new: true, session }
    );

    // Update related documents if loan changed
    if (loanId && linkedLoan) {
      await updateRelatedDocuments({
        session,
        loanId: Number(loanId),
        guarantor: updatedGuarantor,
        loanAccount: linkedLoan,
        user: req.user,
        CREATED_BY: existingGuarantor.createdBy
      });
    }

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Guarantor updated successfully',
      data: updatedGuarantor
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Update Guarantor Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to update guarantor', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Get all guarantors with optional filtering and pagination
 * @route   GET /api/guarantors
 * @access  Private (Admin/Authorized roles)
 */
export const getAllGuarantors = async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Filtering parameters
    const filter = {};
    if (req.query.verificationStatus) {
      filter.verificationStatus = req.query.verificationStatus;
    }
    if (req.query.loanId) {
      filter.loanId = Number(req.query.loanId);
    }
    if (req.query.search) {
      filter.$or = [
        { fullName: { $regex: req.query.search, $options: 'i' } },
        { GUARANTOR_ID: req.query.search },
        { phoneNumber: req.query.search }
      ];
    }

    // Get guarantors with pagination
    const guarantors = await Guarantor.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    // Count total documents for pagination info
    const total = await Guarantor.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    // Format response
    const formattedGuarantors = guarantors.map(guarantor => ({
      id: guarantor.GUARANTOR_ID,
      name: guarantor.fullName,
      phone: guarantor.phoneNumber,
      status: guarantor.verificationStatus,
      guaranteedAmount: guarantor.GUARANTEED_AMT,
      loanId: guarantor.loanId || null,
      createdAt: guarantor.createdAt,
      updatedAt: guarantor.updatedAt
    }));

    return res.status(200).json({
      success: true,
      data: formattedGuarantors,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      filters: {
        applied: Object.keys(filter).length > 0,
        ...filter
      }
    });

  } catch (error) {
    console.error('[GET ALL GUARANTORS ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve guarantors',
      error: error.message,
      code: 'SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
};

/**
 * @desc    Get a single guarantor by GUARANTOR_ID
 * @route   GET /api/guarantors/:id
 * @access  Private (Admin/Authorized roles)
 */
export const getGuarantorById = async (req, res) => {
  try {
    const { id } = req.params;

    // Find guarantor by GUARANTOR_ID
    const guarantor = await Guarantor.findOne({ GUARANTOR_ID: id }).lean();

    if (!guarantor) {
      return res.status(404).json({
        success: false,
        message: 'Guarantor not found',
        code: 'NOT_FOUND',
        searchedId: id
      });
    }

    // Format response
    const response = {
      id: guarantor.GUARANTOR_ID,
      personalInfo: {
        fullName: guarantor.fullName,
        phoneNumber: guarantor.phoneNumber,
        email: guarantor.email,
        dateOfBirth: guarantor.dateOfBirth,
        bvn: guarantor.bvn ? guarantor.bvn.slice(0, 3) + '******' : null,
        idType: guarantor.idType,
        idNumber: guarantor.idNumber ? '****' + guarantor.idNumber.slice(-4) : null
      },
      relationshipInfo: {
        toBorrower: guarantor.relationshipToBorrower,
        officerId: guarantor.RELATIONSHIP_OFFICER_ID,
        officerName: guarantor.relationshipOfficerName
      },
      financialInfo: {
        guaranteedAmount: guarantor.GUARANTEED_AMT,
        netWorth: guarantor.netWorth,
        annualIncome: guarantor.annualIncome,
        occupation: guarantor.occupation,
        employmentType: guarantor.employmentType
      },
      addressInfo: {
        address: guarantor.address,
        city: guarantor.city,
        state: guarantor.state,
        country: guarantor.country
      },
      loanInfo: {
        loanId: guarantor.loanId,
        status: guarantor.verificationStatus,
        createdBy: guarantor.createdBy,
        createdAt: guarantor.createdAt,
        updatedAt: guarantor.updatedAt
      }
    };

    return res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('[GET GUARANTOR BY ID ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve guarantor',
      error: error.message,
      code: 'SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
};

/**
 * @desc    Get guarantor(s) associated with a specific loan
 * @route   GET /api/guarantors/loan/:loanId
 * @access  Private (Admin/Relationship Officer)
 */
export const getGuarantorByLoanId = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { loanId } = req.params;

    // Validate loan ID is numeric
    if (!/^\d+$/.test(loanId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Invalid loan ID format',
        code: 'INVALID_LOAN_ID'
      });
    }

    const numericLoanId = Number(loanId);

    // Find guarantor(s) for this loan
    const guarantors = await Guarantor.find({ loanId: numericLoanId })
      .session(session)
      .lean();

    if (!guarantors || guarantors.length === 0) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'No guarantors found for this loan',
        code: 'NO_GUARANTORS',
        loanId: numericLoanId
      });
    }

    // Get loan details for reference
    const loan = await LoanAccount.findOne({ loanAccountId: numericLoanId })
      .session(session)
      .select('ACCT_NM ACCT_NO LOAN_STATUS')
      .lean();

    // Format response
    const response = guarantors.map(guarantor => ({
      guarantorId: guarantor.GUARANTOR_ID,
      name: guarantor.fullName,
      phone: guarantor.phoneNumber,
      relationship: guarantor.relationshipToBorrower,
      guaranteedAmount: guarantor.GUARANTEED_AMT,
      status: guarantor.verificationStatus,
      created: guarantor.createdAt,
      loanDetails: {
        accountName: loan?.ACCT_NM || 'Not found',
        accountNumber: loan?.ACCT_NO || 'Not found',
        status: loan?.LOAN_STATUS || 'Not found'
      }
    }));

    await session.commitTransaction();
    return res.status(200).json({
      success: true,
      count: guarantors.length,
      loanId: numericLoanId,
      data: response
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('[GET GUARANTOR BY LOAN ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve guarantor(s)',
      error: error.message,
      code: 'SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  } finally {
    session.endSession();
  }
};


// Helper function for consistent error responses
const handleError = (res, error, context) => {
  console.error(`${context} Error:`, error);
  return res.status(500).json({
    success: false,
    message: `Failed to ${context.toLowerCase()}`,
    error: error.message,
    code: `GUARANTOR_${context.toUpperCase()}_ERROR`,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

// ✅ Delete guarantor by ID
export const deleteGuarantor = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const { id } = req.params;

    // Validate ID format
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Valid guarantor ID is required',
        code: 'INVALID_ID_FORMAT'
      });
    }

    const guarantor = await Guarantor.findOneAndDelete({ GUARANTOR_ID: id }).session(session);

    if (!guarantor) {
      return res.status(404).json({
        success: false,
        message: 'Guarantor not found',
        code: 'GUARANTOR_NOT_FOUND',
        guarantorId: id
      });
    }

    // Update loan account if exists
    if (guarantor.loanId) {
      await LoanAccount.findByIdAndUpdate(
        guarantor.loanId,
        { $set: { hasGuarantor: false } },
        { session }
      );
    }

    // Create audit log
    await new GuarantorAudit({
      action: 'DELETE',
      guarantorId: guarantor._id,
      loanId: guarantor.loanId,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: {
        id: guarantor.RELATIONSHIP_OFFICER_ID,
        name: guarantor.relationshipOfficerName
      },
      details: {
        notes: "Guarantor permanently deleted"
      }
    }).save();

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Guarantor deleted successfully',
      data: {
        name: guarantor.fullName,
        guarantorId: guarantor.GUARANTOR_ID,
        deletedAt: new Date()
      }
    });

  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error, 'Delete Guarantor');
  } finally {
    session.endSession();
  }
};

// ✅ Search guarantors by various criteria
export const searchGuarantors = async (req, res) => {
  try {
    const { name, bvn, idNumber, relationship, minAmount, maxAmount, officerId, status, page = 1, limit = 10 } = req.query;

    // Validate at least one search parameter exists
    const hasSearchParams = name || bvn || idNumber || relationship || minAmount || maxAmount || officerId || status;
    if (!hasSearchParams) {
      return res.status(400).json({
        success: false,
        message: 'At least one search parameter is required',
        code: 'MISSING_SEARCH_PARAMS'
      });
    }

    // Build the search query
    const query = {};
    
    if (name) {
      // Split the search term into words and search for each word separately
      const nameTerms = name.split(' ');
      query.$and = nameTerms.map(term => ({
        fullName: { $regex: new RegExp(term.trim(), 'i') }
      }));
    }
    if (bvn) query.bvn = bvn;
    if (idNumber) query.idNumber = idNumber;
    if (relationship) query.relationshipToBorrower = relationship;
    if (officerId) query.RELATIONSHIP_OFFICER_ID = officerId;
    if (status) query.verificationStatus = status;
    
    if (minAmount || maxAmount) {
      query.GUARANTEED_AMT = {};
      if (minAmount) query.GUARANTEED_AMT.$gte = Number(minAmount);
      if (maxAmount) query.GUARANTEED_AMT.$lte = Number(maxAmount);
    }

    // Execute the search with pagination
    const guarantors = await Guarantor.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('loanId', 'ACCT_NM ACCT_NO LOAN_STATUS')
      .populate('createdBy', 'name email')
      .lean();

    const total = await Guarantor.countDocuments(query);

    // Return results (even if empty)
    return res.status(200).json({
      success: true,
      message: guarantors.length > 0 
        ? `${guarantors.length} guarantor(s) found` 
        : 'No guarantors matched your search criteria',
      data: guarantors,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page: Number(page),
        limit: Number(limit),
        hasNext: (page * limit) < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Search Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search guarantors',
      error: error.message,
      code: 'SEARCH_ERROR'
    });
  }
};

// ✅ Remove guarantor from loan (soft delete)
export const uncheckGuarantor = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const { guarantorId } = req.params;

    if (!guarantorId) {
      return res.status(400).json({
        success: false,
        message: 'Guarantor ID is required',
        code: 'MISSING_GUARANTOR_ID'
      });
    }

    const guarantor = await Guarantor.findOne({ GUARANTOR_ID: guarantorId })
      .session(session)
      .populate('loanId', 'ACCT_NM ACCT_NO');

    if (!guarantor) {
      return res.status(404).json({
        success: false,
        message: 'Guarantor not found',
        code: 'GUARANTOR_NOT_FOUND'
      });
    }

    // Update guarantor
    guarantor.isActive = false;
    guarantor.removedAt = new Date();
    guarantor.removalReason = req.body.reason || 'Guarantor voluntarily withdrew';
    guarantor.updatedBy = req.user?.id || 'system';
    await guarantor.save({ session });

    // Update loan account if exists
    if (guarantor.loanId) {
      await LoanAccount.findByIdAndUpdate(
        guarantor.loanId._id,
        { $set: { hasGuarantor: false } },
        { session }
      );
    }

    // Create audit log - ensure types match your schema
    const auditData = {
      action: 'DEACTIVATE',
      guarantorId: guarantor.GUARANTOR_ID, // Use the numeric ID if your schema expects Number
      loanId: guarantor.loanId?._id,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: {
        id: guarantor.RELATIONSHIP_OFFICER_ID,
        name: guarantor.relationshipOfficerName
      },
      details: {
        reason: req.body.reason,
        notes: req.body.notes
      }
    };

    // Handle different schema expectations
    if (GuarantorAudit.schema.path('guarantorId').instance === 'Number') {
      auditData.guarantorId = Number(guarantor.GUARANTOR_ID);
    } else if (GuarantorAudit.schema.path('guarantorId').instance === 'ObjectID') {
      auditData.guarantorId = guarantor._id;
    }

    await new GuarantorAudit(auditData).save({ session });

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Guarantor successfully removed from loan',
      data: {
        guarantorId: guarantor.GUARANTOR_ID,
        name: guarantor.fullName,
        loanDetails: guarantor.loanId ? {
          accountName: guarantor.loanId.ACCT_NM,
          accountNumber: guarantor.loanId.ACCT_NO
        } : null,
        removedAt: guarantor.removedAt,
        removedBy: req.user?.id || 'system'
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Uncheck Guarantor Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to uncheck guarantor',
      error: error.message,
      code: 'GUARANTOR_UNCHECK_ERROR'
    });
  } finally {
    session.endSession();
  }
};

// ✅ Reactivate guarantor
export const reactivateGuarantor = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const { guarantorId } = req.params;

    // Validate the numeric ID format
    if (!guarantorId || isNaN(guarantorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid guarantor ID format (must be a number)',
        code: 'INVALID_ID_FORMAT'
      });
    }

    // Find by GUARANTOR_ID instead of _id
    const guarantor = await Guarantor.findOne({ GUARANTOR_ID: guarantorId })
      .session(session)
      .populate('loanId', 'ACCT_NM ACCT_NO LOAN_STATUS');

    if (!guarantor) {
      return res.status(404).json({
        success: false,
        message: 'Guarantor not found',
        code: 'GUARANTOR_NOT_FOUND'
      });
    }

    // Verify loan status if exists
    if (guarantor.loanId) {
      if (guarantor.loanId.LOAN_STATUS !== 'ACTIVE') {
        return res.status(400).json({
          success: false,
          message: 'Cannot reactivate - associated loan is not active',
          code: 'INACTIVE_LOAN',
          loanStatus: guarantor.loanId.LOAN_STATUS
        });
      }
    }

    // Update guarantor
    const updatedGuarantor = await Guarantor.findOneAndUpdate(
      { GUARANTOR_ID: guarantorId },
      {
        $set: {
          isActive: true,
          updatedBy: req.user?.id || 'system'
        },
        $unset: {
          removedAt: 1,
          removalReason: 1
        }
      },
      { new: true, session }
    ).populate('loanId', 'ACCT_NM ACCT_NO');

    // Update loan account if exists
    if (updatedGuarantor.loanId) {
      await LoanAccount.findByIdAndUpdate(
        updatedGuarantor.loanId._id,
        { $set: { hasGuarantor: true } },
        { session }
      );
    }

    // Create audit log - ensure this matches your GuarantorAudit schema
    const auditData = {
      action: 'REACTIVATE',
      guarantorId: guarantor.GUARANTOR_ID, // Using numeric ID
      loanId: updatedGuarantor.loanId?._id,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: {
        id: updatedGuarantor.RELATIONSHIP_OFFICER_ID,
        name: updatedGuarantor.relationshipOfficerName
      },
      details: {
        notes: req.body.notes || 'Guarantor reactivated'
      }
    };

    // Handle schema type differences
    if (GuarantorAudit.schema.path('guarantorId').instance === 'Number') {
      auditData.guarantorId = Number(guarantor.GUARANTOR_ID);
    } else if (GuarantorAudit.schema.path('guarantorId').instance === 'ObjectID') {
      auditData.guarantorId = guarantor._id;
    }

    await new GuarantorAudit(auditData).save({ session });

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Guarantor successfully reactivated',
      data: {
        GUARANTOR_ID: updatedGuarantor.GUARANTOR_ID,
        fullName: updatedGuarantor.fullName,
        isActive: updatedGuarantor.isActive,
        loanDetails: updatedGuarantor.loanId ? {
          accountName: updatedGuarantor.loanId.ACCT_NM,
          accountNumber: updatedGuarantor.loanId.ACCT_NO
        } : null
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Reactivate Guarantor Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reactivate guarantor',
      error: error.message,
      code: 'GUARANTOR_REACTIVATE_ERROR'
    });
  } finally {
    session.endSession();
  }
};

// ✅ Get guarantors by relationship officer
export const getGuarantorsByOfficer = async (req, res) => {
  try {
    const { officerId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!officerId) {
      return res.status(400).json({
        success: false,
        message: 'Officer ID is required',
        code: 'MISSING_OFFICER_ID'
      });
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'loanId', select: 'ACCT_NM ACCT_NO LOAN_STATUS' },
        { path: 'createdBy', select: 'name email' }
      ]
    };

    const result = await Guarantor.paginate(
      { RELATIONSHIP_OFFICER_ID: officerId },
      options
    );

    if (result.totalDocs === 0) {
      return res.status(404).json({
        success: false,
        message: 'No guarantors found for this officer',
        code: 'NO_GUARANTORS_FOUND'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.docs,
      pagination: {
        total: result.totalDocs,
        pages: result.totalPages,
        page: result.page,
        limit: result.limit,
        hasNext: result.hasNextPage,
        hasPrev: result.hasPrevPage
      }
    });

  } catch (error) {
    console.error('Error in getGuarantorsByOfficer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get guarantors by officer',
      error: error.message,
      code: 'GUARANTOR_GET_BY_OFFICER_ERROR'
    });
  }
};

// ✅ Get guarantor audit logs
export const getGuarantorAuditLogs = async (req, res) => {
  try {
    const { guarantorId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Validate that guarantorId is a number (not ObjectId)
    if (isNaN(guarantorId)) {
      return res.status(400).json({
        success: false,
        message: 'Guarantor ID must be a number (e.g., 1000000)',
        code: 'INVALID_ID_FORMAT'
      });
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { timestamp: -1 } // Newest first
    };

    // Query using the numeric guarantorId
    const result = await GuarantorAudit.paginate(
      { guarantorId: Number(guarantorId) }, // Ensure it's a number
      options
    );

    return res.status(200).json({
      success: true,
      data: result.docs,
      pagination: {
        total: result.totalDocs,
        pages: result.totalPages,
        page: result.page,
        limit: result.limit,
        hasNext: result.hasNextPage,
        hasPrev: result.hasPrevPage
      }
    });

  } catch (error) {
    console.error('Error fetching guarantor audit logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get guarantor audit logs',
      error: error.message,
      code: 'GUARANTOR_GET_AUDIT_LOGS_ERROR'
    });
  }
};
// Export all controller methods
export default {
  deleteGuarantor,
  searchGuarantors,
  uncheckGuarantor,
  reactivateGuarantor,
  getGuarantorsByOfficer,
  getGuarantorAuditLogs
};