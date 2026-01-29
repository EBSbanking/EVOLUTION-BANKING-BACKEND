// src/controllers/GuarantorController.js - COMPLETE SEQUELIZE VERSION
import { sequelize } from '../models/index.js';
import Guarantor from '../models/Guarantor.js';
import LoanAccount from '../models/LoanAccount.js';
import GuarantorAudit from '../models/GuarantorAudit.js';
import { generateGuarantorId } from '../utils/generateGuarantorId.js';
import { toDecimal } from '../utils/formatUtils.js';
import { Op } from 'sequelize';

// Helper function for updating related documents
const updateRelatedDocuments = async ({ transaction, loanId, guarantor, loanAccount, user, CREATED_BY }) => {
  // Implement your logic here if needed
  console.log('Updating related documents...');
  
  if (loanAccount && guarantor) {
    // Update loan account to indicate it has a guarantor
    await LoanAccount.update(
      { hasGuarantor: true },
      { 
        where: { loanAccountId: loanId },
        transaction 
      }
    );
  }
};

// Existing functions from your previous controller...
export const createGuarantor = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    // Destructure fields from req.body
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

    // Validate required fields
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
    console.log('[ID GENERATION] Generated GUARANTOR_ID:', GUARANTOR_ID);

    // Validate ID format
    if (!/^\d{7}$/.test(GUARANTOR_ID)) {
      await transaction.rollback();
      throw new Error(`Invalid ID format generated: ${GUARANTOR_ID}`);
    }

    // Check uniqueness of GUARANTOR_ID
    const exists = await Guarantor.findOne({ 
      where: { GUARANTOR_ID },
      transaction 
    });
    
    if (exists) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: `Guarantor with ID ${GUARANTOR_ID} already exists`,
        code: 'DUPLICATE_GUARANTOR',
        generatedId: GUARANTOR_ID,
      });
    }

    // Validate loan (if provided)
    let linkedLoan = null;
    if (loanId) {
      linkedLoan = await LoanAccount.findOne({ 
        where: { loanAccountId: Number(loanId) },
        transaction 
      });
      
      if (!linkedLoan) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Loan account not found',
          code: 'LOAN_NOT_FOUND',
        });
      }

      const existingForLoan = await Guarantor.findOne({ 
        where: { loanId: Number(loanId) },
        transaction 
      });
      
      if (existingForLoan) {
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: 'Guarantor already exists for loan',
          code: 'GUARANTOR_EXISTS',
        });
      }
    }

    // Validate BVN
    if (bvn && !/^\d{11}$/.test(bvn)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'BVN must be 11 digits',
        code: 'INVALID_BVN',
      });
    }

    if (bvn) {
      const bvnUsed = await Guarantor.findOne({ 
        where: { bvn },
        transaction 
      });
      
      if (bvnUsed) {
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: 'BVN already used',
          code: 'DUPLICATE_BVN',
        });
      }
    }

    // Create guarantor
    const newGuarantor = await Guarantor.create({
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
    }, { transaction });

    console.log('[CREATION SUCCESS] New guarantor:', {
      id: newGuarantor.GUARANTOR_ID,
      name: newGuarantor.fullName,
      loan: newGuarantor.loanId || 'Not linked',
    });

    // Update related documents if loan was linked
    if (loanId && linkedLoan) {
      await updateRelatedDocuments({
        transaction,
        loanId: Number(loanId),
        guarantor: newGuarantor,
        loanAccount: linkedLoan,
        user: req.user,
        CREATED_BY: createdBy,
      });
    }

    // Create audit log
    await GuarantorAudit.create({
      action: 'CREATE',
      guarantorId: newGuarantor.GUARANTOR_ID,
      loanId: newGuarantor.loanId,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: {
        id: null,
        name: relationshipOfficerName,
      },
      details: {
        notes: 'Guarantor created',
      },
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Guarantor created successfully',
      data: {
        guarantorId: newGuarantor.GUARANTOR_ID,
        name: newGuarantor.fullName,
        loanId: newGuarantor.loanId,
        status: newGuarantor.verificationStatus,
        createdAt: newGuarantor.createdAt,
      },
      systemInfo: {
        idFormat: '7-digit string',
        idType: typeof newGuarantor.GUARANTOR_ID,
        idGeneration: 'auto-incremented',
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error('[CREATION FAILED] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create guarantor',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  }
};

export const updateGuarantor = async (req, res) => {
  const transaction = await sequelize.transaction();
  
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

    console.log(`Searching for guarantor with ID: ${guarantorId} (Type: ${typeof guarantorId})`);

    // Find existing guarantor with flexible ID type handling
    const existingGuarantor = await Guarantor.findOne({ 
      where: { 
        [Op.or]: [
          { GUARANTOR_ID: guarantorId },
          { GUARANTOR_ID: Number(guarantorId) },
          { GUARANTOR_ID: guarantorId.toString() }
        ]
      },
      transaction 
    });

    if (!existingGuarantor) {
      await transaction.rollback();
      
      // Diagnostic logging
      const allGuarantors = await Guarantor.findAll({
        attributes: ['GUARANTOR_ID'],
        transaction
      });
      
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
        where: { loanAccountId: Number(loanId) },
        transaction 
      });
      
      if (!linkedLoan) {
        await transaction.rollback();
        return res.status(404).json({ 
          success: false, 
          message: 'Loan account not found', 
          code: 'LOAN_NOT_FOUND' 
        });
      }

      // Check for other guarantors on this loan
      const existingForLoan = await Guarantor.findOne({ 
        where: { 
          loanId: Number(loanId),
          GUARANTOR_ID: { [Op.ne]: existingGuarantor.GUARANTOR_ID }
        },
        transaction 
      });
      
      if (existingForLoan) {
        await transaction.rollback();
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
        where: { 
          bvn,
          GUARANTOR_ID: { [Op.ne]: existingGuarantor.GUARANTOR_ID }
        },
        transaction 
      });
      
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
    await existingGuarantor.update(updateData, { transaction });
    const updatedGuarantor = await Guarantor.findByPk(existingGuarantor.id, { transaction });

    // Update related documents if loan changed
    if (loanId && linkedLoan) {
      await updateRelatedDocuments({
        transaction,
        loanId: Number(loanId),
        guarantor: updatedGuarantor,
        loanAccount: linkedLoan,
        user: req.user,
        CREATED_BY: existingGuarantor.createdBy
      });
    }

    // Create audit log
    const changedFields = Object.keys(updateData).filter(key => 
      updateData[key] !== existingGuarantor[key] && key !== 'updatedAt'
    );
    
    await GuarantorAudit.create({
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
        updatedFields: changedFields
      }
    }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Guarantor updated successfully',
      data: updatedGuarantor
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Update Guarantor Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to update guarantor', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Approve Guarantor
export const approveGuarantor = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { guarantorId } = req.params;
    const { comments, BU_ID, state, relationshipOfficerName } = req.body;

    const guarantor = await Guarantor.findOne({ 
      where: { GUARANTOR_ID: guarantorId },
      transaction 
    });
    
    if (!guarantor) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Guarantor not found', code: 'NOT_FOUND' });
    }

    if (guarantor.verificationStatus === 'Verified') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Guarantor is already verified', code: 'ALREADY_VERIFIED' });
    }

    // Ensure required fields
    guarantor.BU_ID = guarantor.BU_ID || BU_ID || 'DEFAULT_BU_ID';
    guarantor.state = guarantor.state || state || 'DEFAULT_STATE';
    guarantor.relationshipOfficerName = guarantor.relationshipOfficerName || relationshipOfficerName || 'Supervisor Approver';

    // Update guarantor
    await guarantor.update({
      verificationStatus: 'Verified',
      status: 'ACTIVE',
      verifiedBy: req.user?.name || 'Supervisor Approver',
      verificationDate: new Date(),
      updatedBy: req.user?.id || 'system',
      email: guarantor.email || req.body.email || 'default@example.com',
      consentDate: guarantor.consentDate || new Date()
    }, { transaction });

    // Audit log
    await GuarantorAudit.create({
      action: 'APPROVED',
      guarantorId: guarantor.GUARANTOR_ID,
      loanId: guarantor.loanId,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: { id: guarantor.BU_ID, name: guarantor.relationshipOfficerName },
      details: { notes: comments || 'Guarantor approved' },
    }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `Guarantor with ID ${guarantor.GUARANTOR_ID} has been approved`,
      data: {
        id: guarantor.id,
        guarantorId: guarantor.GUARANTOR_ID,
        name: guarantor.fullName,
        verificationStatus: guarantor.verificationStatus,
        status: guarantor.status,
        verifiedBy: guarantor.verifiedBy,
        updatedDate: guarantor.updatedAt,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Approve Guarantor Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to approve guarantor', error: error.message, code: 'APPROVE_ERROR' });
  }
};

// Reject Guarantor
export const rejectGuarantor = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { guarantorId } = req.params;
    const { comments } = req.body;

    const guarantor = await Guarantor.findOne({ 
      where: { GUARANTOR_ID: guarantorId },
      transaction 
    });
    
    if (!guarantor) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Guarantor not found', code: 'NOT_FOUND' });
    }

    if (guarantor.verificationStatus === 'Rejected') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Guarantor is already rejected', code: 'ALREADY_REJECTED' });
    }

    // Update status
    await guarantor.update({
      verificationStatus: 'Rejected',
      status: 'REJECTED',
      verifiedBy: req.user?.name || 'Supervisor Approver',
      verificationDate: new Date(),
      updatedBy: req.user?.id || 'system'
    }, { transaction });

    // Audit log
    await GuarantorAudit.create({
      action: 'REJECTED',
      guarantorId: guarantor.GUARANTOR_ID,
      loanId: guarantor.loanId,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: { id: guarantor.BU_ID, name: guarantor.relationshipOfficerName },
      details: { notes: comments || 'Guarantor rejected' },
    }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `Guarantor with ID ${guarantor.GUARANTOR_ID} has been rejected`,
      data: {
        id: guarantor.id,
        guarantorId: guarantor.GUARANTOR_ID,
        name: guarantor.fullName,
        verificationStatus: guarantor.verificationStatus,
        status: guarantor.status,
        rejectedBy: guarantor.verifiedBy,
        updatedDate: guarantor.updatedAt,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Reject Guarantor Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reject guarantor', error: error.message, code: 'REJECT_ERROR' });
  }
};

export const getAllGuarantors = async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Build filter
    const where = {};
    
    if (req.query.verificationStatus) {
      where.verificationStatus = req.query.verificationStatus;
    }
    
    if (req.query.loanId) {
      where.loanId = Number(req.query.loanId);
    }
    
    if (req.query.search) {
      where[Op.or] = [
        { fullName: { [Op.like]: `%${req.query.search}%` } },
        { GUARANTOR_ID: { [Op.like]: `%${req.query.search}%` } },
        { phoneNumber: { [Op.like]: `%${req.query.search}%` } },
        { state: { [Op.like]: `%${req.query.search}%` } },
        { localGovernment: { [Op.like]: `%${req.query.search}%` } }
      ];
    }

    // Get guarantors with pagination
    const { count, rows: guarantors } = await Guarantor.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    const totalPages = Math.ceil(count / limit);

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
        total: count,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      filters: {
        applied: Object.keys(where).length > 0,
        ...where
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
      where: {
        [Op.or]: [
          { GUARANTOR_ID: id },
          { GUARANTOR_ID: Number(id) },
          { GUARANTOR_ID: id.toString() }
        ]
      }
    });

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
  const transaction = await sequelize.transaction();
  
  try {
    const { loanId } = req.params;

    // Validate loan ID is numeric
    if (!/^\d+$/.test(loanId)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid loan ID format',
        code: 'INVALID_LOAN_ID'
      });
    }

    const numericLoanId = Number(loanId);

    // Find guarantor(s) for this loan
    const guarantors = await Guarantor.findAll({
      where: { loanId: numericLoanId },
      transaction
    });

    if (!guarantors || guarantors.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No guarantors found for this loan',
        code: 'NO_GUARANTORS',
        loanId: numericLoanId
      });
    }

    // Get loan details for reference
    const loan = await LoanAccount.findOne({
      where: { loanAccountId: numericLoanId },
      attributes: ['ACCT_NM', 'ACCT_NO', 'LOAN_STATUS'],
      transaction
    });

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

    await transaction.commit();
    return res.status(200).json({
      success: true,
      count: guarantors.length,
      loanId: numericLoanId,
      data: response
    });

  } catch (error) {
    await transaction.rollback();
    console.error('[GET GUARANTOR BY LOAN ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve guarantor(s)',
      error: error.message,
      code: 'SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
};

export const deleteGuarantor = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Valid guarantor ID is required',
        code: 'INVALID_ID_FORMAT'
      });
    }

    const guarantor = await Guarantor.findOne({
      where: {
        [Op.or]: [
          { GUARANTOR_ID: id },
          { GUARANTOR_ID: Number(id) },
          { GUARANTOR_ID: id.toString() }
        ]
      },
      transaction
    });

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
      await LoanAccount.update(
        { hasGuarantor: false },
        { 
          where: { loanAccountId: guarantor.loanId },
          transaction 
        }
      );
    }

    // Create audit log before deletion
    await GuarantorAudit.create({
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
    }, { transaction });

    // Delete the guarantor
    await guarantor.destroy({ transaction });

    await transaction.commit();

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
    await transaction.rollback();
    console.error('Delete Guarantor Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete guarantor',
      error: error.message,
      code: 'DELETE_ERROR'
    });
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
    const where = {};
    
    if (name) {
      const nameTerms = name.split(' ');
      where[Op.and] = nameTerms.map(term => ({
        fullName: { [Op.like]: `%${term.trim()}%` }
      }));
    }
    
    if (bvn) where.bvn = bvn;
    if (idNumber) where.idNumber = idNumber;
    if (relationship) where.relationshipToBorrower = relationship;
    if (officerId) where.RELATIONSHIP_OFFICER_ID = officerId;
    if (status) where.verificationStatus = status;
    if (state) where.state = { [Op.like]: `%${state}%` };
    if (localGovernment) where.localGovernment = { [Op.like]: `%${localGovernment}%` };
    
    if (minAmount || maxAmount) {
      where.GUARANTEED_AMT = {};
      if (minAmount) where.GUARANTEED_AMT[Op.gte] = Number(minAmount);
      if (maxAmount) where.GUARANTEED_AMT[Op.lte] = Number(maxAmount);
    }

    // Execute the search with pagination
    const offset = (page - 1) * limit;
    
    const { count, rows: guarantors } = await Guarantor.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });

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
        total: count,
        pages: Math.ceil(count / limit),
        page: Number(page),
        limit: Number(limit),
        hasNext: (page * limit) < count,
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

// NEW FUNCTIONS FOR YOUR ROUTES:

// Request Guarantor Removal
export const requestGuarantorRemoval = async (guarantorId, loanAccountNumber, reason, notes, userId, session) => {
  const transaction = await sequelize.transaction();
  
  try {
    const guarantor = await Guarantor.findOne({ 
      where: { GUARANTOR_ID: guarantorId },
      transaction 
    });

    if (!guarantor) {
      await transaction.rollback();
      throw new Error('Guarantor not found');
    }

    if (guarantor.status === 'DEACTIVATED') {
      await transaction.rollback();
      throw new Error('Guarantor is already deactivated');
    }

    // Update status to PENDING for removal
    await guarantor.update({
      status: 'PENDING_REMOVAL',
      removalRequestedBy: userId,
      removalRequestDate: new Date(),
      removalReason: reason,
      removalNotes: notes
    }, { transaction });

    // Create audit log
    await GuarantorAudit.create({
      action: 'REMOVAL_REQUESTED',
      guarantorId: guarantor.GUARANTOR_ID,
      loanId: guarantor.loanId,
      performedBy: userId,
      relationshipOfficer: {
        id: guarantor.RELATIONSHIP_OFFICER_ID,
        name: guarantor.relationshipOfficerName
      },
      details: {
        notes: `Removal requested: ${reason}`,
        loanAccountNumber: loanAccountNumber
      }
    }, { transaction });

    await transaction.commit();

    return {
      guarantorId: guarantor.GUARANTOR_ID,
      name: guarantor.fullName,
      status: guarantor.status,
      removalRequestDate: guarantor.removalRequestDate
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// Approve Guarantor Removal
export const approveGuarantorRemoval = async (guarantorId, approverId, session) => {
  const transaction = await sequelize.transaction();
  
  try {
    const guarantor = await Guarantor.findOne({ 
      where: { GUARANTOR_ID: guarantorId },
      transaction 
    });

    if (!guarantor) {
      await transaction.rollback();
      throw new Error('Guarantor not found');
    }

    if (guarantor.status !== 'PENDING_REMOVAL') {
      await transaction.rollback();
      throw new Error('Guarantor is not pending removal');
    }

    // Update status to DEACTIVATED
    await guarantor.update({
      status: 'DEACTIVATED',
      deactivatedBy: approverId,
      deactivationDate: new Date(),
      isActive: false
    }, { transaction });

    // Create audit log
    await GuarantorAudit.create({
      action: 'REMOVAL_APPROVED',
      guarantorId: guarantor.GUARANTOR_ID,
      loanId: guarantor.loanId,
      performedBy: approverId,
      relationshipOfficer: {
        id: guarantor.RELATIONSHIP_OFFICER_ID,
        name: guarantor.relationshipOfficerName
      },
      details: {
        notes: 'Guarantor removal approved and deactivated'
      }
    }, { transaction });

    await transaction.commit();

    return {
      guarantorId: guarantor.GUARANTOR_ID,
      name: guarantor.fullName,
      status: guarantor.status,
      deactivatedBy: approverId,
      deactivationDate: guarantor.deactivationDate
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// Reactivate Guarantor
export const reactivateGuarantor = async (guarantorId, reactivationData, session) => {
  const transaction = await sequelize.transaction();
  
  try {
    const guarantor = await Guarantor.findOne({ 
      where: { GUARANTOR_ID: guarantorId },
      transaction 
    });

    if (!guarantor) {
      await transaction.rollback();
      throw new Error('Guarantor not found');
    }

    if (guarantor.status !== 'DEACTIVATED') {
      await transaction.rollback();
      throw new Error('Guarantor is not deactivated');
    }

    // Update status to ACTIVE
    await guarantor.update({
      status: 'ACTIVE',
      verificationStatus: 'Verified',
      reactivatedBy: reactivationData.reactivatedBy,
      reactivationDate: new Date(),
      reactivationReason: reactivationData.reason,
      reactivationNotes: reactivationData.notes,
      isActive: true
    }, { transaction });

    // Create audit log
    await GuarantorAudit.create({
      action: 'REACTIVATED',
      guarantorId: guarantor.GUARANTOR_ID,
      loanId: guarantor.loanId,
      performedBy: reactivationData.reactivatedBy,
      relationshipOfficer: {
        id: guarantor.RELATIONSHIP_OFFICER_ID,
        name: guarantor.relationshipOfficerName
      },
      details: {
        notes: `Guarantor reactivated: ${reactivationData.reason}`
      }
    }, { transaction });

    await transaction.commit();

    return {
      guarantorId: guarantor.GUARANTOR_ID,
      name: guarantor.fullName,
      status: guarantor.status,
      verificationStatus: guarantor.verificationStatus,
      reactivatedBy: reactivationData.reactivatedBy,
      reactivationDate: new Date()
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// Get Guarantors by Officer
export const getGuarantorsByOfficer = async (req, res) => {
  try {
    const { officerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { count, rows: guarantors } = await Guarantor.findAndCountAll({
      where: {
        [Op.or]: [
          { RELATIONSHIP_OFFICER_ID: officerId },
          { relationshipOfficerName: { [Op.like]: `%${officerId}%` } }
        ]
      },
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(count / limit);

    const formattedGuarantors = guarantors.map(guarantor => ({
      id: guarantor.GUARANTOR_ID,
      name: guarantor.fullName,
      phone: guarantor.phoneNumber,
      status: guarantor.verificationStatus,
      guaranteedAmount: guarantor.GUARANTEED_AMT,
      loanId: guarantor.loanId || null,
      relationshipOfficer: guarantor.relationshipOfficerName,
      createdAt: guarantor.createdAt
    }));

    return res.status(200).json({
      success: true,
      data: formattedGuarantors,
      officerId: officerId,
      pagination: {
        total: count,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Get Guarantors by Officer Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve guarantors by officer',
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
};

// Get Guarantor Audit Logs
export const getGuarantorAuditLogs = async (req, res) => {
  try {
    const { guarantorId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Validate guarantor exists
    const guarantor = await Guarantor.findOne({
      where: { GUARANTOR_ID: guarantorId }
    });

    if (!guarantor) {
      return res.status(404).json({
        success: false,
        message: 'Guarantor not found',
        code: 'GUARANTOR_NOT_FOUND'
      });
    }

    const { count, rows: auditLogs } = await GuarantorAudit.findAndCountAll({
      where: { guarantorId: guarantor.GUARANTOR_ID },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(count / limit);

    const formattedLogs = auditLogs.map(log => ({
      id: log.id,
      action: log.action,
      performedBy: log.performedBy,
      timestamp: log.createdAt,
      details: log.details,
      relationshipOfficer: log.relationshipOfficer
    }));

    return res.status(200).json({
      success: true,
      data: formattedLogs,
      guarantorId: guarantorId,
      guarantorName: guarantor.fullName,
      pagination: {
        total: count,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Get Guarantor Audit Logs Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve audit logs',
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
};

// Export all controller methods
export default {
  createGuarantor,
  updateGuarantor,
  approveGuarantor,
  rejectGuarantor,
  getAllGuarantors,
  getGuarantorById,
  getGuarantorByLoanId,
  deleteGuarantor,
  searchGuarantors,
  requestGuarantorRemoval,
  approveGuarantorRemoval,
  reactivateGuarantor,
  getGuarantorsByOfficer,
  getGuarantorAuditLogs
};