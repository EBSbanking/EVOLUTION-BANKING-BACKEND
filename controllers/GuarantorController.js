import mongoose from 'mongoose';
import Guarantor from '../models/Guarantor.js';
import LoanAccount from '../models/LoanAccount.js';
import GuarantorAudit from '../models/GuarantorAudit.js';
import { generateGuarantorId } from '../utils/generateGuarantorId.js';
import { toDecimal } from '../utils/formatUtils.js';

export const createGuarantor = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Destructure fields from req.body, aligning with frontend payload
    const {
      fullName,
      phoneNumber,
      relationshipToBorrower,
      GUARANTEED_AMT,
      createdBy,
      relationshipOfficerName,
      loanId,
      status,
      email,
      address,
      state,
      localGovernment,
      BU_ID,
      country = 'Nigeria',
      idType,
      idNumber,
      bvn,
      dateOfBirth,
      netWorth,
      annualIncome,
      occupation,
      employmentType,
    } = req.body;

    // Validate required fields (aligned with Guarantor.jsx)
    if (!fullName || !phoneNumber || !relationshipToBorrower || !GUARANTEED_AMT || !createdBy || !state || !BU_ID) {
      return res.status(400).json({
        success: false,
        message: 'Required fields are missing',
        code: 'MISSING_FIELDS',
        missingFields: {
          fullName: !fullName,
          phoneNumber: !phoneNumber,
          relationshipToBorrower: !relationshipToBorrower,
          GUARANTEED_AMT: !GUARANTEED_AMT,
          createdBy: !createdBy,
          state: !state,
          BU_ID: !BU_ID,
        },
      });
    }

    // Generate and validate 7-digit GUARANTOR_ID
    const GUARANTOR_ID = await generateGuarantorId();
    console.log('[ID GENERATION] Generated GUARANTOR_ID:', {
      value: GUARANTOR_ID,
      type: typeof GUARANTOR_ID,
      length: GUARANTOR_ID.length,
    });

    // Validate ID format
    if (!/^\d{7}$/.test(GUARANTOR_ID)) {
      throw new Error(`Invalid ID format generated: ${GUARANTOR_ID}`);
    }

    // Check uniqueness of GUARANTOR_ID
    const exists = await Guarantor.findOne({ GUARANTOR_ID }).session(session);
    if (exists) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: `Guarantor with ID ${GUARANTOR_ID} already exists`,
        code: 'DUPLICATE_GUARANTOR',
        generatedId: GUARANTOR_ID,
      });
    }

    // Validate BU_ID (ensure it exists in business units)
    const BusinessUnit = mongoose.model('BusinessUnit');
    const businessUnit = await BusinessUnit.findOne({ BU_ID: String(BU_ID) }).session(session);
    if (!businessUnit) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Business Unit with ID ${BU_ID} not found`,
        code: 'INVALID_BU_ID',
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
          code: 'LOAN_NOT_FOUND',
        });
      }

      const existingForLoan = await Guarantor.findOne({ loanId: Number(loanId) }).session(session);
      if (existingForLoan) {
        await session.abortTransaction();
        return res.status(409).json({
          success: false,
          message: 'Guarantor already exists for loan',
          code: 'GUARANTOR_EXISTS',
        });
      }
    }

    // Validate BVN
    if (bvn && !/^\d{11}$/.test(bvn)) {
      return res.status(400).json({
        success: false,
        message: 'BVN must be 11 digits',
        code: 'INVALID_BVN',
      });
    }

    if (bvn) {
      const bvnUsed = await Guarantor.findOne({ bvn }).session(session);
      if (bvnUsed) {
        await session.abortTransaction();
        return res.status(409).json({
          success: false,
          message: 'BVN already used',
          code: 'DUPLICATE_BVN',
        });
      }
    }

    // Create guarantor document
    const newGuarantor = await Guarantor.create(
      [{
        GUARANTOR_ID,
        fullName,
        phoneNumber,
        relationshipToBorrower,
        GUARANTEED_AMT: toDecimal(GUARANTEED_AMT),
        createdBy,
        relationshipOfficerName,
        loanId: loanId ? Number(loanId) : null,
        status: status || 'PENDING',
        email,
        address,
        state,
        localGovernment: localGovernment || null,
        BU_ID: String(BU_ID),
        country,
        idType,
        idNumber,
        bvn,
        dateOfBirth,
        netWorth: netWorth ? toDecimal(netWorth) : null,
        annualIncome: annualIncome ? toDecimal(annualIncome) : null,
        occupation,
        employmentType,
        verificationStatus: 'Pending',
      }],
      { session }
    );

    console.log('[CREATION SUCCESS] New guarantor:', {
      id: newGuarantor[0].GUARANTOR_ID,
      name: newGuarantor[0].fullName,
      loan: newGuarantor[0].loanId || 'Not linked',
    });

    // Update related documents if loan was linked
    if (loanId && linkedLoan) {
      await updateRelatedDocuments({
        session,
        loanId: Number(loanId),
        guarantor: newGuarantor[0],
        loanAccount: linkedLoan,
        user: req.user,
        CREATED_BY: createdBy,
      });
    }

    // Create audit log - FIXED: Use the custom GUARANTOR_ID instead of ObjectID
    const auditData = {
      action: 'CREATE',
      guarantorId: newGuarantor[0].GUARANTOR_ID, // Use the 7-digit custom ID
      loanId: newGuarantor[0].loanId,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: {
        id: null,
        name: relationshipOfficerName,
      },
      details: {
        notes: 'Guarantor created',
      },
    };
    
    await new GuarantorAudit(auditData).save({ session });

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: 'Guarantor created successfully',
      data: {
        guarantorId: newGuarantor[0].GUARANTOR_ID,
        name: newGuarantor[0].fullName,
        loanId: newGuarantor[0].loanId,
        status: newGuarantor[0].verificationStatus,
        createdAt: newGuarantor[0].createdAt,
      },
      systemInfo: {
        idFormat: '7-digit string',
        idType: typeof newGuarantor[0].GUARANTOR_ID,
        idGeneration: 'auto-incremented',
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('[CREATION FAILED] Error:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to create guarantor',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  } finally {
    session.endSession();
  }
};


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
      localGovernment,
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

    // Validate required fields
    if (fullName === undefined && phoneNumber === undefined && relationshipToBorrower === undefined && 
        GUARANTEED_AMT === undefined && state === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one required field (fullName, phoneNumber, relationshipToBorrower, GUARANTEED_AMT, state) must be provided for update', 
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

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
      localGovernment: localGovernment !== undefined ? localGovernment : existingGuarantor.localGovernment,
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
      { _id: existingGuarantor._id },
      updateData,
      { new: true, session }
    );

    // Update related documents if loan changed
    // Note: updateRelatedDocuments is assumed to be defined elsewhere
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

    // Create audit log
    const auditData = {
      action: 'UPDATE',
      guarantorId: updatedGuarantor.GUARANTOR_ID,
      loanId: updatedGuarantor.loanId,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: {
        id: updatedGuarantor.RELATIONSHIP_OFFICER_ID,
        name: updatedGuarantor.relationshipOfficerName
      },
      details: {
        notes: 'Guarantor updated',
        updatedFields: Object.keys(updateData).filter(key => updateData[key] !== existingGuarantor[key])
      }
    };
    if (GuarantorAudit.schema.path('guarantorId').instance === 'Number') {
      auditData.guarantorId = Number(updatedGuarantor.GUARANTOR_ID);
    } else if (GuarantorAudit.schema.path('guarantorId').instance === 'ObjectID') {
      auditData.guarantorId = updatedGuarantor._id;
    }
    await new GuarantorAudit(auditData).save({ session });

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



// Approve Guarantor with comments
// Approve Guarantor with comments
export const approveGuarantor = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { guarantorId } = req.params;
    const { comments, BU_ID, state, relationshipOfficerName } = req.body;

    const guarantor = await Guarantor.findOne({ GUARANTOR_ID: guarantorId }).session(session);
    if (!guarantor) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Guarantor not found', code: 'NOT_FOUND' });
    }

    if (guarantor.verificationStatus === 'Verified') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Guarantor is already verified', code: 'ALREADY_VERIFIED' });
    }

    // Ensure required fields
    guarantor.BU_ID = guarantor.BU_ID || BU_ID || 'DEFAULT_BU_ID';
    guarantor.state = guarantor.state || state || 'DEFAULT_STATE';
    guarantor.relationshipOfficerName = guarantor.relationshipOfficerName || relationshipOfficerName || 'Supervisor Approver';

    // Update guarantor
    guarantor.verificationStatus = 'Verified';
    guarantor.status = 'ACTIVE';
    guarantor.verifiedBy = req.user?.name || 'Supervisor Approver';
    guarantor.verificationDate = new Date();
    guarantor.updatedBy = req.user?.id || 'system';
    guarantor.email = guarantor.email || req.body.email || 'default@example.com';
    if (!guarantor.consentDate) guarantor.consentDate = new Date();

    await guarantor.save({ session });

    // Audit log
    const auditData = {
      action: 'APPROVED',
      guarantorId: guarantor.GUARANTOR_ID,
      loanId: guarantor.loanId,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: { id: guarantor.BU_ID, name: guarantor.relationshipOfficerName },
      details: { notes: comments || 'Guarantor approved' },
    };
    await new GuarantorAudit(auditData).save({ session });

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: `Guarantor with ID ${guarantor.GUARANTOR_ID} has been approved`,
      data: {
        id: guarantor._id,
        guarantorId: guarantor.GUARANTOR_ID,
        name: guarantor.fullName,
        verificationStatus: guarantor.verificationStatus,
        status: guarantor.status,
        verifiedBy: guarantor.verifiedBy,
        updatedDate: guarantor.updatedAt,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Approve Guarantor Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to approve guarantor', error: error.message, code: 'APPROVE_ERROR' });
  } finally {
    session.endSession();
  }
};


// Reject Guarantor with comments
export const rejectGuarantor = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { guarantorId } = req.params;
    const { comments } = req.body;

    const guarantor = await Guarantor.findOne({ GUARANTOR_ID: guarantorId }).session(session);
    if (!guarantor) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Guarantor not found', code: 'NOT_FOUND' });
    }

    if (guarantor.verificationStatus === 'Rejected') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Guarantor is already rejected', code: 'ALREADY_REJECTED' });
    }

    // Update status
    guarantor.verificationStatus = 'Rejected';
    guarantor.status = 'REJECTED';
    guarantor.verifiedBy = req.user?.name || 'Supervisor Approver';
    guarantor.verificationDate = new Date();
    guarantor.updatedBy = req.user?.id || 'system';

    await guarantor.save({ session });

    // Audit log
    const auditData = {
      action: 'REJECTED',
      guarantorId: guarantor.GUARANTOR_ID,
      loanId: guarantor.loanId,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: { id: guarantor.BU_ID, name: guarantor.relationshipOfficerName },
      details: { notes: comments || 'Guarantor rejected' },
    };
    await new GuarantorAudit(auditData).save({ session });

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: `Guarantor with ID ${guarantor.GUARANTOR_ID} has been rejected`, // ✅ dynamic ID
      data: {
        id: guarantor._id,
        guarantorId: guarantor.GUARANTOR_ID,
        name: guarantor.fullName,
        verificationStatus: guarantor.verificationStatus,
        status: guarantor.status,
        rejectedBy: guarantor.verifiedBy,
        updatedDate: guarantor.updatedAt,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Reject Guarantor Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reject guarantor', error: error.message, code: 'REJECT_ERROR' });
  } finally {
    session.endSession();
  }
};


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
        { phoneNumber: req.query.search },
        { state: { $regex: req.query.search, $options: 'i' } },
        { localGovernment: { $regex: req.query.search, $options: 'i' } }
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
      state: guarantor.state,
      localGovernment: guarantor.localGovernment,
      country: guarantor.country,
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

export const getGuarantorById = async (req, res) => {
  try {
    const { id } = req.params;

    // Find guarantor by GUARANTOR_ID with flexible type handling
    const guarantor = await Guarantor.findOne({ 
      $or: [
        { GUARANTOR_ID: id },
        { GUARANTOR_ID: Number(id) },
        { GUARANTOR_ID: id.toString() }
      ]
    }).lean();

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
        localGovernment: guarantor.localGovernment,
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
      state: guarantor.state,
      localGovernment: guarantor.localGovernment,
      country: guarantor.country,
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

    const guarantor = await Guarantor.findOneAndDelete({ 
      $or: [
        { GUARANTOR_ID: id },
        { GUARANTOR_ID: Number(id) },
        { GUARANTOR_ID: id.toString() }
      ]
    }).session(session);

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
    const auditData = {
      action: 'DELETE',
      guarantorId: guarantor.GUARANTOR_ID,
      loanId: guarantor.loanId,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: {
        id: guarantor.RELATIONSHIP_OFFICER_ID,
        name: guarantor.relationshipOfficerName
      },
      details: {
        notes: 'Guarantor permanently deleted'
      }
    };
    if (GuarantorAudit.schema.path('guarantorId').instance === 'Number') {
      auditData.guarantorId = Number(guarantor.GUARANTOR_ID);
    } else if (GuarantorAudit.schema.path('guarantorId').instance === 'ObjectID') {
      auditData.guarantorId = guarantor._id;
    }
    await new GuarantorAudit(auditData).save({ session });

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
    console.error('Delete Guarantor Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete guarantor',
      error: error.message,
      code: 'DELETE_ERROR'
    });
  } finally {
    session.endSession();
  }
};

export const searchGuarantors = async (req, res) => {
  try {
    const { name, bvn, idNumber, relationship, minAmount, maxAmount, officerId, status, state, localGovernment, page = 1, limit = 10 } = req.query;

    // Validate at least one search parameter exists
    const hasSearchParams = name || bvn || idNumber || relationship || minAmount || maxAmount || officerId || status || state || localGovernment;
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
    if (state) query.state = { $regex: new RegExp(state, 'i') };
    if (localGovernment) query.localGovernment = { $regex: new RegExp(localGovernment, 'i') };
    
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

    // Format response
    const formattedGuarantors = guarantors.map(guarantor => ({
      id: guarantor.GUARANTOR_ID,
      name: guarantor.fullName,
      phone: guarantor.phoneNumber,
      status: guarantor.verificationStatus,
      guaranteedAmount: guarantor.GUARANTEED_AMT,
      loanId: guarantor.loanId || null,
      state: guarantor.state,
      localGovernment: guarantor.localGovernment,
      country: guarantor.country,
      createdAt: guarantor.createdAt,
      updatedAt: guarantor.updatedAt
    }));

    return res.status(200).json({
      success: true,
      message: guarantors.length > 0 
        ? `${guarantors.length} guarantor(s) found` 
        : 'No guarantors matched your search criteria',
      data: formattedGuarantors,
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

export const uncheckGuarantor = async (guarantorId, loanAccountNumber, reason, notes, userId, session) => {
  let guarantor = await Guarantor.findOne({ GUARANTOR_ID: guarantorId })
    .session(session)
    .populate('guaranteedLoans');

  if (!guarantor) {
    throw new Error('Guarantor not found');
  }

  let loanAccount = guarantor.guaranteedLoans.find(loan => loan.ACCT_NO === loanAccountNumber);
  if (!loanAccount && loanAccountNumber) {
    loanAccount = await LoanAccount.findOne({ ACCT_NO: loanAccountNumber }).session(session);
    if (loanAccount && !guarantor.guaranteedLoans.includes(loanAccount._id)) {
      guarantor.guaranteedLoans.push(loanAccount._id);
      await guarantor.save({ session });
    }
  }

  guarantor.isActive = false;
  guarantor.removedAt = new Date();
  guarantor.removalReason = reason || 'Guarantor voluntarily withdrew';
  guarantor.updatedBy = userId;
  await guarantor.save({ session });

  if (loanAccount) {
    loanAccount.HAS_GUARANTOR = false;
    await loanAccount.save({ session });
  }

  await new GuarantorAudit({
    action: 'DEACTIVATE',
    guarantorId: guarantor.GUARANTOR_ID,
    loanId: loanAccount?._id,
    performedBy: userId,
    relationshipOfficer: { id: guarantor.BU_ID, name: guarantor.relationshipOfficerName },
    details: { reason, notes }
  }).save({ session });

  return {
    guarantorId: guarantor.GUARANTOR_ID,
    name: guarantor.fullName,
    removedAt: guarantor.removedAt,
    removedBy: userId,
    loanDetails: loanAccount ? {
      accountName: loanAccount.ACCT_NM,
      accountNumber: loanAccount.ACCT_NO,
      loanStatus: loanAccount.LOAN_STATUS,
      disbursementLimit: loanAccount.DISBURSEMENT_LIMIT,
      totalInterest: loanAccount.TOTAL_INTEREST,
      maturityDate: loanAccount.MATURITY_DT
    } : null
  };
};

export const reactivateGuarantor = async (guarantorId, loanAccountNumber, notes, userId, session) => {
  let guarantor = await Guarantor.findOne({ GUARANTOR_ID: guarantorId })
    .session(session)
    .populate('guaranteedLoans');

  if (!guarantor) {
    throw new Error('Guarantor not found');
  }

  let loanAccount = guarantor.guaranteedLoans.find(loan => loan.ACCT_NO === loanAccountNumber);
  if (!loanAccount && loanAccountNumber) {
    loanAccount = await LoanAccount.findOne({ ACCT_NO: loanAccountNumber }).session(session);
    if (loanAccount && !guarantor.guaranteedLoans.includes(loanAccount._id)) {
      guarantor.guaranteedLoans.push(loanAccount._id);
      await guarantor.save({ session });
    }
  }

  if (loanAccount && loanAccount.LOAN_STATUS !== 'ACTIVE') {
    throw new Error('Cannot reactivate - loan not active');
  }

  guarantor.isActive = true;
  guarantor.removedAt = undefined;
  guarantor.removalReason = undefined;
  guarantor.updatedBy = userId;
  await guarantor.save({ session });

  if (loanAccount) {
    loanAccount.HAS_GUARANTOR = true;
    await loanAccount.save({ session });
  }

  await new GuarantorAudit({
    action: 'REACTIVATE',
    guarantorId: guarantor.GUARANTOR_ID,
    loanId: loanAccount?._id,
    performedBy: userId,
    relationshipOfficer: { id: guarantor.BU_ID, name: guarantor.relationshipOfficerName },
    details: { notes: notes || 'Guarantor reactivated' }
  }).save({ session });

  return {
    guarantorId: guarantor.GUARANTOR_ID,
    name: guarantor.fullName,
    isActive: guarantor.isActive,
    loanDetails: loanAccount ? {
      accountName: loanAccount.ACCT_NM,
      accountNumber: loanAccount.ACCT_NO,
      loanStatus: loanAccount.LOAN_STATUS,
      disbursementLimit: loanAccount.DISBURSEMENT_LIMIT,
      totalInterest: loanAccount.TOTAL_INTEREST,
      maturityDate: loanAccount.MATURITY_DT
    } : null
  };
};



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

    // Format response
    const formattedDocs = result.docs.map(guarantor => ({
      id: guarantor.GUARANTOR_ID,
      name: guarantor.fullName,
      phone: guarantor.phoneNumber,
      status: guarantor.verificationStatus,
      guaranteedAmount: guarantor.GUARANTEED_AMT,
      loanId: guarantor.loanId || null,
      state: guarantor.state,
      localGovernment: guarantor.localGovernment,
      country: guarantor.country,
      createdAt: guarantor.createdAt,
      updatedAt: guarantor.updatedAt
    }));

    return res.status(200).json({
      success: true,
      data: formattedDocs,
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

export const getGuarantorAuditLogs = async (req, res) => {
  try {
    const { guarantorId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Validate ID format
    if (!guarantorId) {
      return res.status(400).json({
        success: false,
        message: 'Guarantor ID is required',
        code: 'INVALID_ID_FORMAT'
      });
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { timestamp: -1 }
    };

    // Query using flexible ID type handling
    const query = {
      $or: [
        { guarantorId: guarantorId },
        { guarantorId: Number(guarantorId) },
        { guarantorId: mongoose.Types.ObjectId.isValid(guarantorId) ? mongoose.Types.ObjectId(guarantorId) : null }
      ].filter(condition => condition.guarantorId !== null)
    };

    const result = await GuarantorAudit.paginate(query, options);

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