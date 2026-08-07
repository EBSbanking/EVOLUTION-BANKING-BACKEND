// src/controllers/GuarantorController.js - CORRECTED (aligned with model attributes)
import Guarantor from '../models/Guarantor.js';
import LoanAccount from '../models/LoanAccount.js';
import GuarantorAudit from '../models/GuarantorAudit.js';
import { generateGuarantorId } from '../utils/generateGuarantorId.js';
import { toDecimal } from '../utils/formatUtils.js';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';

// Helper function for updating related documents
const updateRelatedDocuments = async ({ transaction, loanId, guarantor, loanAccount, user, CREATED_BY }) => {
  console.log('Updating related documents...');
  if (loanAccount && guarantor) {
    await LoanAccount.update(
      { hasGuarantor: true },
      { where: { id: loanId }, transaction }
    );
  }
};

// ==================== CREATE ====================
export const createGuarantor = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      fullName,
      phoneNumber,
      relationshipToBorrower,
      guaranteed_amount,
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

    // ✅ Log received data for debugging
    console.log('📥 Received guarantor data:', {
      fullName,
      phoneNumber,
      relationshipToBorrower,
      guaranteed_amount,
      createdBy,
      relationshipOfficerName,
      state,
      BU_ID,
      country,
      bvn,
      idType,
      idNumber
    });

    // ✅ Validate required fields
    if (!fullName || !phoneNumber || !relationshipToBorrower || !guaranteed_amount || !createdBy || !state || !BU_ID) {
      const missingFields = {
        fullName: !fullName,
        phoneNumber: !phoneNumber,
        relationshipToBorrower: !relationshipToBorrower,
        guaranteed_amount: !guaranteed_amount,
        createdBy: !createdBy,
        state: !state,
        BU_ID: !BU_ID,
      };
      
      console.log('❌ Missing fields:', Object.keys(missingFields).filter(k => missingFields[k]));
      
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Required fields are missing',
        code: 'MISSING_FIELDS',
        missingFields: missingFields,
      });
    }

    // ✅ Generate guarantor ID
    const guarantor_id = await generateGuarantorId();
    console.log('[ID GENERATION] Generated guarantor_id:', guarantor_id);

    if (!/^\d{7}$/.test(guarantor_id)) {
      await transaction.rollback();
      throw new Error(`Invalid ID format generated: ${guarantor_id}`);
    }

    // ✅ Check for duplicate ID
    const exists = await Guarantor.findOne({ where: { guarantor_id }, transaction });
    if (exists) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: `Guarantor with ID ${guarantor_id} already exists`,
        code: 'DUPLICATE_GUARANTOR',
        generatedId: guarantor_id,
      });
    }

    // ✅ Check loan if provided
    let linkedLoan = null;
    if (loanId) {
      linkedLoan = await LoanAccount.findOne({ where: { id: Number(loanId) }, transaction });
      if (!linkedLoan) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: 'Loan account not found', code: 'LOAN_NOT_FOUND' });
      }
      const existingForLoan = await Guarantor.findOne({ where: { loanId: Number(loanId) }, transaction });
      if (existingForLoan) {
        await transaction.rollback();
        return res.status(409).json({ success: false, message: 'Guarantor already exists for loan', code: 'GUARANTOR_EXISTS' });
      }
    }

    // ✅ Validate BVN
    if (bvn) {
      if (!/^\d{11}$/.test(bvn)) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'BVN must be 11 digits', code: 'INVALID_BVN' });
      }
      const bvnUsed = await Guarantor.findOne({ where: { bvn }, transaction });
      if (bvnUsed) {
        await transaction.rollback();
        return res.status(409).json({ success: false, message: 'BVN already used', code: 'DUPLICATE_BVN' });
      }
    }

    // ✅ Validate phone number
    if (phoneNumber && !/^\+?\d{10,15}$/.test(phoneNumber)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid phone number format', code: 'INVALID_PHONE' });
    }

    // ✅ Validate email if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid email format', code: 'INVALID_EMAIL' });
    }

    // ✅ Create the guarantor with correct field mapping
    console.log('📝 Creating guarantor with data:', {
      guarantor_id,
      fullName,
      phoneNumber,
      relationshipToBorrower,
      guaranteed_amount: toDecimal(guaranteed_amount),
      createdBy,
      relationshipOfficerName,
      loanId: loanId ? Number(loanId) : null,
      status: status || 'PENDING',
      state,
      BU_ID: String(BU_ID),
      country,
    });

    const newGuarantor = await Guarantor.create({
      guarantor_id,
      fullName,
      phoneNumber,
      relationshipToBorrower,
      guaranteed_amount: toDecimal(guaranteed_amount),
      createdBy,
      relationshipOfficerName,
      loanId: loanId ? Number(loanId) : null,
      status: status || 'PENDING',
      email: email || null,
      address: address || null,
      state,
      localGovernment: localGovernment || null,
      BU_ID: String(BU_ID),
      country: country || 'Nigeria',
      idType: idType || null,
      idNumber: idNumber || null,
      bvn: bvn || null,
      dateOfBirth: dateOfBirth || null,
      netWorth: netWorth ? toDecimal(netWorth) : null,
      annualIncome: annualIncome ? toDecimal(annualIncome) : null,
      occupation: occupation || null,
      employmentType: employmentType || null,
      verificationStatus: 'Pending',
      isActive: true,
      version: 1,
    }, { transaction });

    console.log('✅ Guarantor created successfully:', newGuarantor.id);

    // ✅ Update related documents if loan exists
    if (loanId && linkedLoan) {
      await updateRelatedDocuments({ 
        transaction, 
        loanId: Number(loanId), 
        guarantor: newGuarantor, 
        loanAccount: linkedLoan, 
        user: req.user, 
        CREATED_BY: createdBy 
      });
    }

    // ✅ Create audit log
    try {
      await GuarantorAudit.create({
        action: 'CREATE',
        guarantorId: newGuarantor.guarantor_id,
        loanId: newGuarantor.loanId,
        performedBy: req.user?.id || 'system',
        relationshipOfficer: { id: null, name: relationshipOfficerName },
        details: { notes: 'Guarantor created' },
      }, { transaction });
    } catch (auditError) {
      console.warn('⚠️ Audit creation failed:', auditError.message);
      // Don't fail the transaction for audit errors
    }

    await transaction.commit();

    // ✅ Return success response
    return res.status(201).json({
      success: true,
      message: 'Guarantor created successfully',
      data: {
        id: newGuarantor.id,
        guarantorId: newGuarantor.guarantor_id,
        name: newGuarantor.fullName,
        phoneNumber: newGuarantor.phoneNumber,
        loanId: newGuarantor.loanId,
        status: newGuarantor.status,
        verificationStatus: newGuarantor.verificationStatus,
        createdAt: newGuarantor.created_at,
      },
    });

  } catch (error) {
    await transaction.rollback();
    console.error('[CREATION FAILED] Error:', error);
    console.error('[CREATION FAILED] Stack:', error.stack);
    
    // ✅ Send detailed error response
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to create guarantor', 
      error: error.message, 
      code: 'INTERNAL_SERVER_ERROR',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ==================== UPDATE ====================
export const updateGuarantor = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { guarantorId } = req.params;
    if (!guarantorId) return res.status(400).json({ success: false, message: 'Guarantor ID is required', code: 'MISSING_GUARANTOR_ID' });

    const existingGuarantor = await Guarantor.findOne({ where: { guarantor_id: guarantorId }, transaction });
    if (!existingGuarantor) {
      const allGuarantors = await Guarantor.findAll({ attributes: ['guarantor_id'], transaction });
      return res.status(404).json({ success: false, message: 'Guarantor not found', code: 'GUARANTOR_NOT_FOUND', searchedId: guarantorId, existingIds: allGuarantors.map(g => g.guarantor_id) });
    }

    const {
      fullName, phoneNumber, relationshipToBorrower, guaranteed_amount,
      RELATIONSHIP_OFFICER_ID, relationshipOfficerName, loanId, email, address, city, state, localGovernment,
      country, idType, idNumber, bvn, dateOfBirth, netWorth, annualIncome, occupation, employmentType, verificationStatus
    } = req.body;

    if (fullName === undefined && phoneNumber === undefined && relationshipToBorrower === undefined && guaranteed_amount === undefined && state === undefined) {
      return res.status(400).json({ success: false, message: 'At least one required field must be provided', code: 'MISSING_REQUIRED_FIELDS' });
    }

    let linkedLoan = null;
    if (loanId) {
      linkedLoan = await LoanAccount.findOne({ where: { id: Number(loanId) }, transaction });
      if (!linkedLoan) return res.status(404).json({ success: false, message: 'Loan account not found', code: 'LOAN_NOT_FOUND' });
      const existingForLoan = await Guarantor.findOne({ where: { loanId: Number(loanId), guarantor_id: { [Op.ne]: existingGuarantor.guarantor_id } }, transaction });
      if (existingForLoan) return res.status(409).json({ success: false, message: 'Another guarantor already exists for this loan', code: 'GUARANTOR_EXISTS' });
    }

    if (bvn && bvn !== existingGuarantor.bvn) {
      if (!/^\d{11}$/.test(bvn)) return res.status(400).json({ success: false, message: 'BVN must be 11 digits', code: 'INVALID_BVN' });
      const bvnUsed = await Guarantor.findOne({ where: { bvn, guarantor_id: { [Op.ne]: existingGuarantor.guarantor_id } }, transaction });
      if (bvnUsed) return res.status(409).json({ success: false, message: 'BVN already used by another guarantor', code: 'DUPLICATE_BVN' });
    }

    const updateData = {
      fullName: fullName || existingGuarantor.fullName,
      phoneNumber: phoneNumber || existingGuarantor.phoneNumber,
      relationshipToBorrower: relationshipToBorrower || existingGuarantor.relationshipToBorrower,
      guaranteed_amount: guaranteed_amount ? toDecimal(guaranteed_amount) : existingGuarantor.guaranteed_amount,
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
      updated_at: new Date()
    };

    await existingGuarantor.update(updateData, { transaction });
    const updatedGuarantor = await Guarantor.findByPk(existingGuarantor.id, { transaction });

    if (loanId && linkedLoan) {
      await updateRelatedDocuments({ transaction, loanId: Number(loanId), guarantor: updatedGuarantor, loanAccount: linkedLoan, user: req.user, CREATED_BY: existingGuarantor.createdBy });
    }

    const changedFields = Object.keys(updateData).filter(key => updateData[key] !== existingGuarantor[key] && key !== 'updated_at');
    await GuarantorAudit.create({
      action: 'UPDATE',
      guarantorId: updatedGuarantor.guarantor_id,
      loanId: updatedGuarantor.loanId,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: { id: updatedGuarantor.RELATIONSHIP_OFFICER_ID, name: updatedGuarantor.relationshipOfficerName },
      details: { notes: 'Guarantor updated', updatedFields: changedFields }
    }, { transaction });

    await transaction.commit();
    return res.status(200).json({ success: true, message: 'Guarantor updated successfully', data: updatedGuarantor });
  } catch (error) {
    await transaction.rollback();
    console.error('Update Guarantor Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update guarantor', error: error.message });
  }
};

// ==================== APPROVE ====================
export const approveGuarantor = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { guarantorId } = req.params;
    const { comments, BU_ID, state, relationshipOfficerName } = req.body;

    console.log('🔍 Approving guarantor with ID:', guarantorId);

    // ✅ Try to find by guarantor_id first, then by id
    let guarantor = await Guarantor.findOne({ 
      where: { guarantor_id: guarantorId }, 
      transaction 
    });
    
    // If not found by guarantor_id, try by numeric id
    if (!guarantor && !isNaN(guarantorId)) {
      guarantor = await Guarantor.findOne({ 
        where: { id: parseInt(guarantorId) }, 
        transaction 
      });
    }

    if (!guarantor) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Guarantor not found', 
        code: 'NOT_FOUND',
        searchedId: guarantorId 
      });
    }

    console.log('✅ Found guarantor:', guarantor.id, guarantor.guarantor_id);

    // ✅ Check if already verified
    if (guarantor.verificationStatus === 'Verified') {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Guarantor is already verified', 
        code: 'ALREADY_VERIFIED' 
      });
    }

    // ✅ Check if rejected
    if (guarantor.verificationStatus === 'Rejected') {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Guarantor was rejected, cannot approve. Please create a new request.', 
        code: 'WAS_REJECTED' 
      });
    }

    // ✅ Prepare update data
    const updateData = {
      verificationStatus: 'Verified',
      status: 'ACTIVE',
      verifiedBy: req.user?.name || req.user?.username || 'Supervisor Approver',
      verificationDate: new Date(),
      updatedBy: req.user?.id || req.user?.userId || 'system',
      isActive: true,
      rejectedBy: null, // Clear rejection fields if any
      rejectionDate: null,
      rejectionReason: null,
    };

    // ✅ Update optional fields if provided
    if (BU_ID) updateData.BU_ID = BU_ID;
    if (state) updateData.state = state;
    if (relationshipOfficerName) updateData.relationshipOfficerName = relationshipOfficerName;
    if (comments) updateData.notes = comments;

    // ✅ Update the guarantor
    await guarantor.update(updateData, { transaction });

    console.log('✅ Guarantor approved successfully');

    // ✅ Create audit log
    try {
      await GuarantorAudit.create({
        action: 'APPROVED',
        guarantorId: guarantor.guarantor_id,
        loanId: guarantor.loanId,
        performedBy: req.user?.id || req.user?.userId || 'system',
        relationshipOfficer: { 
          id: guarantor.BU_ID || BU_ID, 
          name: guarantor.relationshipOfficerName || relationshipOfficerName 
        },
        details: { 
          notes: comments || 'Guarantor approved',
          approvedBy: req.user?.name || 'Supervisor Approver',
          approvedAt: new Date().toISOString()
        },
      }, { transaction });
    } catch (auditError) {
      console.warn('Could not create audit log:', auditError.message);
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `Guarantor with ID ${guarantor.guarantor_id} has been approved`,
      data: {
        id: guarantor.id,
        guarantorId: guarantor.guarantor_id,
        name: guarantor.fullName,
        phoneNumber: guarantor.phoneNumber,
        verificationStatus: guarantor.verificationStatus,
        status: guarantor.status,
        verifiedBy: guarantor.verifiedBy,
        verificationDate: guarantor.verificationDate,
        updatedDate: guarantor.updated_at,
      },
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Approve Guarantor Error:', error);
    console.error('Approve Guarantor Stack:', error.stack);
    
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to approve guarantor', 
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// ==================== REJECT ====================
// ==================== REJECT ====================
export const rejectGuarantor = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { guarantorId } = req.params;
    const { comments, reason } = req.body;

    console.log('🔍 Rejecting guarantor with ID:', guarantorId);

    if (!guarantorId) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Guarantor ID is required', 
        code: 'MISSING_GUARANTOR_ID' 
      });
    }

    // ✅ Try to find by guarantor_id first, then by id
    let guarantor = await Guarantor.findOne({ 
      where: { guarantor_id: guarantorId }, 
      transaction 
    });
    
    // If not found by guarantor_id, try by numeric id
    if (!guarantor && !isNaN(guarantorId)) {
      guarantor = await Guarantor.findOne({ 
        where: { id: parseInt(guarantorId) }, 
        transaction 
      });
    }

    if (!guarantor) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: `Guarantor with ID ${guarantorId} not found`, 
        code: 'NOT_FOUND',
        searchedId: guarantorId 
      });
    }

    console.log('✅ Found guarantor:', guarantor.id, guarantor.guarantor_id);

    // ✅ Check if already rejected
    if (guarantor.verificationStatus === 'Rejected') {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Guarantor is already rejected', 
        code: 'ALREADY_REJECTED' 
      });
    }

    // ✅ Check if already verified
    if (guarantor.verificationStatus === 'Verified') {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Guarantor is already verified, cannot reject', 
        code: 'ALREADY_VERIFIED' 
      });
    }

    // ✅ Prepare update data
    const updateData = {
      verificationStatus: 'Rejected',
      status: 'REJECTED',
      rejectedBy: req.user?.name || req.user?.username || 'Supervisor Approver',
      rejectionDate: new Date(),
      rejectionReason: reason || comments || 'Rejected by supervisor',
      updatedBy: req.user?.id || req.user?.userId || 'system',
      isActive: false,
      verifiedBy: null, // Clear verified_by since it's rejected
      verificationDate: null,
    };

    // ✅ Update the guarantor
    await guarantor.update(updateData, { transaction });

    console.log('✅ Guarantor rejected successfully');

    // ✅ Create audit log
    try {
      await GuarantorAudit.create({
        action: 'REJECTED',
        guarantorId: guarantor.guarantor_id,
        loanId: guarantor.loanId,
        performedBy: req.user?.id || req.user?.userId || 'system',
        relationshipOfficer: { 
          id: guarantor.BU_ID, 
          name: guarantor.relationshipOfficerName 
        },
        details: { 
          notes: comments || 'Guarantor rejected',
          reason: reason || comments || 'Rejected by supervisor',
          rejected_by: req.user?.name || 'Supervisor Approver',
          rejection_date: new Date().toISOString()
        },
      }, { transaction });
    } catch (auditError) {
      console.warn('Could not create audit log:', auditError.message);
    }

    await transaction.commit();

    // ✅ Return success response
    return res.status(200).json({
      success: true,
      message: `Guarantor with ID ${guarantor.guarantor_id} has been rejected successfully`,
      data: {
        id: guarantor.id,
        guarantorId: guarantor.guarantor_id,
        name: guarantor.fullName,
        phoneNumber: guarantor.phoneNumber,
        verificationStatus: guarantor.verificationStatus,
        status: guarantor.status,
        rejectedBy: guarantor.rejectedBy,
        rejectionReason: guarantor.rejectionReason,
        rejectionDate: guarantor.rejectionDate,
        updatedDate: guarantor.updated_at,
      },
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Reject Guarantor Error:', error);
    console.error('Reject Guarantor Stack:', error.stack);
    
    // ✅ Handle validation errors
    if (error.name === 'SequelizeValidationError') {
      const validationErrors = error.errors.map(err => ({ 
        field: err.path, 
        message: err.message 
      }));
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error while rejecting guarantor', 
        errors: validationErrors, 
        code: 'VALIDATION_ERROR' 
      });
    }
    
    // ✅ Handle database errors
    if (error.name === 'SequelizeDatabaseError') {
      return res.status(500).json({ 
        success: false, 
        message: 'Database error while rejecting guarantor', 
        error: error.message,
        code: 'DATABASE_ERROR' 
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to reject guarantor', 
      error: error.message, 
      code: 'REJECT_ERROR' 
    });
  }
};

// ==================== GET ALL (with pagination) ====================
export const getAllGuarantors = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.verificationStatus) where.verificationStatus = req.query.verificationStatus;
    if (req.query.loanId) where.loanId = Number(req.query.loanId);
    if (req.query.search) {
      where[Op.or] = [
        { fullName: { [Op.like]: `%${req.query.search}%` } },
        { guarantor_id: { [Op.like]: `%${req.query.search}%` } },
        { phoneNumber: { [Op.like]: `%${req.query.search}%` } },
        { state: { [Op.like]: `%${req.query.search}%` } },
        { localGovernment: { [Op.like]: `%${req.query.search}%` } }
      ];
    }

    const { count, rows: guarantors } = await Guarantor.findAndCountAll({
      where,
      limit,
      offset,
      order: [['created_at', 'DESC']],
    });

    const totalPages = Math.ceil(count / limit);
    const formattedGuarantors = guarantors.map(g => ({
      id: g.guarantor_id,
      name: g.fullName,
      phone: g.phoneNumber,
      status: g.verificationStatus,
      guaranteedAmount: g.guaranteed_amount,
      loanId: g.loanId || null,
      state: g.state,
      localGovernment: g.localGovernment,
      country: g.country,
      // ✅ ADD THESE - Include relationship fields
      relationship_to_borrower: g.relationshipToBorrower || g.relationship_to_borrower,
      relationship: g.relationshipToBorrower || g.relationship_to_borrower,
      relationshipInfo: {
        toBorrower: g.relationshipToBorrower || g.relationship_to_borrower
      },
      createdAt: g.created_at,
      updatedAt: g.updated_at
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
      filters: { applied: Object.keys(where).length > 0, ...where }
    });
  } catch (error) {
    console.error('[GET ALL GUARANTORS ERROR]', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve guarantors', 
      error: error.message, 
      code: 'SERVER_ERROR' 
    });
  }
};

// ==================== GET BY ID ====================
// ==================== GET BY ID ====================
export const getGuarantorById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // ✅ Validate ID format
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Guarantor ID is required', 
        code: 'MISSING_ID' 
      });
    }

    console.log('🔍 [GET BY ID] Searching for guarantor with ID:', id);

    // ✅ Try to find by guarantor_id first, then by id
    let guarantor = await Guarantor.findOne({ 
      where: { guarantor_id: id } 
    });
    
    // If not found by guarantor_id, try by numeric id
    if (!guarantor && !isNaN(id)) {
      guarantor = await Guarantor.findOne({ 
        where: { id: parseInt(id) } 
      });
    }

    if (!guarantor) {
      return res.status(404).json({ 
        success: false, 
        message: 'Guarantor not found', 
        code: 'NOT_FOUND', 
        searchedId: id 
      });
    }

    console.log('✅ [GET BY ID] Found guarantor:', {
      id: guarantor.id,
      guarantor_id: guarantor.guarantor_id,
      fullName: guarantor.fullName,
      relationshipToBorrower: guarantor.relationshipToBorrower,
      relationship_to_borrower: guarantor.relationship_to_borrower
    });

    // ✅ Format the response with proper field mapping
    const response = {
      id: guarantor.id,
      guarantorId: guarantor.guarantor_id,
      personalInfo: {
        fullName: guarantor.fullName || guarantor.full_name || 'N/A',
        phoneNumber: guarantor.phoneNumber || guarantor.phone_number || 'N/A',
        email: guarantor.email || null,
        dateOfBirth: guarantor.dateOfBirth || guarantor.date_of_birth || null,
        bvn: guarantor.bvn ? guarantor.bvn.slice(0, 3) + '******' : null,
        idType: guarantor.idType || guarantor.id_type || null,
        idNumber: guarantor.idNumber || guarantor.id_number ? '****' + (guarantor.idNumber || guarantor.id_number).slice(-4) : null
      },
      relationshipInfo: {
        toBorrower: guarantor.relationshipToBorrower || guarantor.relationship_to_borrower || 'N/A',
        officerId: guarantor.RELATIONSHIP_OFFICER_ID || null,
        officerName: guarantor.relationshipOfficerName || guarantor.relationship_officer_name || null
      },
      financialInfo: {
        guaranteedAmount: parseFloat(guarantor.guaranteed_amount || 0),
        netWorth: parseFloat(guarantor.netWorth || guarantor.net_worth || 0),
        annualIncome: parseFloat(guarantor.annualIncome || guarantor.annual_income || 0),
        occupation: guarantor.occupation || null,
        employmentType: guarantor.employmentType || guarantor.employment_type || null
      },
      addressInfo: {
        address: guarantor.address || null,
        state: guarantor.state || null,
        localGovernment: guarantor.localGovernment || guarantor.local_government || null,
        country: guarantor.country || 'Nigeria'
      },
      loanInfo: {
        loanId: guarantor.loanId || guarantor.loan_id || null,
        status: guarantor.status || 'PENDING',
        verificationStatus: guarantor.verificationStatus || guarantor.verification_status || 'Pending',
        createdBy: guarantor.createdBy || guarantor.created_by || null,
        createdAt: guarantor.created_at || guarantor.createdAt || null,
        updatedAt: guarantor.updated_at || guarantor.updatedAt || null,
        isActive: guarantor.isActive !== undefined ? guarantor.isActive : true
      }
    };

    return res.status(200).json({ 
      success: true, 
      data: response 
    });

  } catch (error) {
    console.error('[GET GUARANTOR BY ID ERROR]', error);
    console.error('[GET GUARANTOR BY ID] Stack:', error.stack);
    
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve guarantor', 
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// ==================== GET BY LOAN ID ====================
export const getGuarantorByLoanId = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { loanId } = req.params;
    if (!/^\d+$/.test(loanId)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid loan ID format', code: 'INVALID_LOAN_ID' });
    }
    const numericLoanId = Number(loanId);
    const guarantors = await Guarantor.findAll({ where: { loanId: numericLoanId }, transaction });
    if (!guarantors.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'No guarantors found for this loan', code: 'NO_GUARANTORS', loanId: numericLoanId });
    }
    const loan = await LoanAccount.findOne({ where: { id: numericLoanId }, attributes: ['ACCT_NM', 'ACCT_NO', 'LOAN_STATUS'], transaction });
    const response = guarantors.map(g => ({
      guarantorId: g.guarantor_id,
      name: g.fullName,
      phone: g.phoneNumber,
      relationship: g.relationshipToBorrower,
      guaranteedAmount: g.guaranteed_amount,
      status: g.verificationStatus,
      state: g.state,
      localGovernment: g.localGovernment,
      country: g.country,
      created: g.created_at,
      loanDetails: {
        accountName: loan?.ACCT_NM || 'Not found',
        accountNumber: loan?.ACCT_NO || 'Not found',
        status: loan?.LOAN_STATUS || 'Not found'
      }
    }));
    await transaction.commit();
    return res.status(200).json({ success: true, count: guarantors.length, loanId: numericLoanId, data: response });
  } catch (error) {
    await transaction.rollback();
    console.error('[GET GUARANTOR BY LOAN ERROR]', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve guarantor(s)', error: error.message });
  }
};

// ==================== DELETE ====================
export const deleteGuarantor = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid guarantor ID is required', code: 'INVALID_ID_FORMAT' });
    }
    const guarantor = await Guarantor.findOne({ where: { guarantor_id: id }, transaction });
    if (!guarantor) {
      return res.status(404).json({ success: false, message: 'Guarantor not found', code: 'GUARANTOR_NOT_FOUND', guarantorId: id });
    }
    if (guarantor.loanId) {
      await LoanAccount.update({ hasGuarantor: false }, { where: { id: guarantor.loanId }, transaction });
    }
    await GuarantorAudit.create({
      action: 'DELETE',
      guarantorId: guarantor.guarantor_id,
      loanId: guarantor.loanId,
      performedBy: req.user?.id || 'system',
      relationshipOfficer: { id: guarantor.RELATIONSHIP_OFFICER_ID, name: guarantor.relationshipOfficerName },
      details: { notes: 'Guarantor permanently deleted' }
    }, { transaction });
    await guarantor.destroy({ transaction });
    await transaction.commit();
    return res.status(200).json({ success: true, message: 'Guarantor deleted successfully', data: { name: guarantor.fullName, guarantorId: guarantor.guarantor_id, deletedAt: new Date() } });
  } catch (error) {
    await transaction.rollback();
    console.error('Delete Guarantor Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete guarantor', error: error.message });
  }
};

// ==================== SEARCH ====================
export const searchGuarantors = async (req, res) => {
  try {
    const { name, bvn, idNumber, relationship, minAmount, maxAmount, officerId, status, state, localGovernment, page = 1, limit = 10 } = req.query;
    const hasSearchParams = name || bvn || idNumber || relationship || minAmount || maxAmount || officerId || status || state || localGovernment;
    if (!hasSearchParams) {
      return res.status(400).json({ success: false, message: 'At least one search parameter is required', code: 'MISSING_SEARCH_PARAMS' });
    }
    const where = {};
    if (name) {
      const nameTerms = name.split(' ');
      where[Op.and] = nameTerms.map(term => ({ fullName: { [Op.like]: `%${term.trim()}%` } }));
    }
    if (bvn) where.bvn = bvn;
    if (idNumber) where.idNumber = idNumber;
    if (relationship) where.relationshipToBorrower = relationship;
    if (officerId) where.RELATIONSHIP_OFFICER_ID = officerId;
    if (status) where.verificationStatus = status;
    if (state) where.state = { [Op.like]: `%${state}%` };
    if (localGovernment) where.localGovernment = { [Op.like]: `%${localGovernment}%` };
    if (minAmount || maxAmount) {
      where.guaranteed_amount = {};
      if (minAmount) where.guaranteed_amount[Op.gte] = Number(minAmount);
      if (maxAmount) where.guaranteed_amount[Op.lte] = Number(maxAmount);
    }
    const offset = (page - 1) * limit;
    const { count, rows: guarantors } = await Guarantor.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });
    const formattedGuarantors = guarantors.map(g => ({
      id: g.guarantor_id,
      name: g.fullName,
      phone: g.phoneNumber,
      status: g.verificationStatus,
      guaranteedAmount: g.guaranteed_amount,
      loanId: g.loanId || null,
      state: g.state,
      localGovernment: g.localGovernment,
      country: g.country,
      createdAt: g.created_at,
      updatedAt: g.updated_at
    }));
    return res.status(200).json({
      success: true,
      message: guarantors.length > 0 ? `${guarantors.length} guarantor(s) found` : 'No guarantors matched your search criteria',
      data: formattedGuarantors,
      pagination: { total: count, pages: Math.ceil(count / limit), page: Number(page), limit: Number(limit), hasNext: (page * limit) < count, hasPrev: page > 1 }
    });
  } catch (error) {
    console.error('Search Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to search guarantors', error: error.message });
  }
};

// ==================== REMOVAL REQUESTS ====================
export const requestGuarantorRemoval = async (guarantorId, loanAccountNumber, reason, notes, userId, session) => {
  const transaction = await sequelize.transaction();
  try {
    const guarantor = await Guarantor.findOne({ where: { guarantor_id: guarantorId }, transaction });
    if (!guarantor) throw new Error('Guarantor not found');
    if (guarantor.status === 'DEACTIVATED') throw new Error('Guarantor is already deactivated');
    await guarantor.update({
      status: 'PENDING_REMOVAL',
      removalRequestedBy: userId,
      removalRequestDate: new Date(),
      removalReason: reason,
      removalNotes: notes
    }, { transaction });
    await GuarantorAudit.create({
      action: 'REMOVAL_REQUESTED',
      guarantorId: guarantor.guarantor_id,
      loanId: guarantor.loanId,
      performedBy: userId,
      relationshipOfficer: { id: guarantor.RELATIONSHIP_OFFICER_ID, name: guarantor.relationshipOfficerName },
      details: { notes: `Removal requested: ${reason}`, loanAccountNumber }
    }, { transaction });
    await transaction.commit();
    return { guarantorId: guarantor.guarantor_id, name: guarantor.fullName, status: guarantor.status, removalRequestDate: guarantor.removalRequestDate };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const approveGuarantorRemoval = async (guarantorId, approverId, session) => {
  const transaction = await sequelize.transaction();
  try {
    const guarantor = await Guarantor.findOne({ where: { guarantor_id: guarantorId }, transaction });
    if (!guarantor) throw new Error('Guarantor not found');
    if (guarantor.status !== 'PENDING_REMOVAL') throw new Error('Guarantor is not pending removal');
    await guarantor.update({
      status: 'DEACTIVATED',
      deactivatedBy: approverId,
      deactivationDate: new Date(),
      isActive: false
    }, { transaction });
    await GuarantorAudit.create({
      action: 'REMOVAL_APPROVED',
      guarantorId: guarantor.guarantor_id,
      loanId: guarantor.loanId,
      performedBy: approverId,
      relationshipOfficer: { id: guarantor.RELATIONSHIP_OFFICER_ID, name: guarantor.relationshipOfficerName },
      details: { notes: 'Guarantor removal approved and deactivated' }
    }, { transaction });
    await transaction.commit();
    return { guarantorId: guarantor.guarantor_id, name: guarantor.fullName, status: guarantor.status, deactivatedBy: approverId, deactivationDate: guarantor.deactivationDate };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const reactivateGuarantor = async (guarantorId, reactivationData, session) => {
  const transaction = await sequelize.transaction();
  try {
    const guarantor = await Guarantor.findOne({ where: { guarantor_id: guarantorId }, transaction });
    if (!guarantor) throw new Error('Guarantor not found');
    if (guarantor.status !== 'DEACTIVATED') throw new Error('Guarantor is not deactivated');
    await guarantor.update({
      status: 'ACTIVE',
      verificationStatus: 'Verified',
      reactivatedBy: reactivationData.reactivatedBy,
      reactivationDate: new Date(),
      reactivationReason: reactivationData.reason,
      reactivationNotes: reactivationData.notes,
      isActive: true
    }, { transaction });
    await GuarantorAudit.create({
      action: 'REACTIVATED',
      guarantorId: guarantor.guarantor_id,
      loanId: guarantor.loanId,
      performedBy: reactivationData.reactivatedBy,
      relationshipOfficer: { id: guarantor.RELATIONSHIP_OFFICER_ID, name: guarantor.relationshipOfficerName },
      details: { notes: `Guarantor reactivated: ${reactivationData.reason}` }
    }, { transaction });
    await transaction.commit();
    return { guarantorId: guarantor.guarantor_id, name: guarantor.fullName, status: guarantor.status, verificationStatus: guarantor.verificationStatus, reactivatedBy: reactivationData.reactivatedBy, reactivationDate: new Date() };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const getGuarantorsByOfficer = async (req, res) => {
  try {
    const { officerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { count, rows: guarantors } = await Guarantor.findAndCountAll({
      where: { [Op.or]: [{ RELATIONSHIP_OFFICER_ID: officerId }, { relationshipOfficerName: { [Op.like]: `%${officerId}%` } }] },
      limit,
      offset,
      order: [['created_at', 'DESC']]
    });
    const totalPages = Math.ceil(count / limit);
    const formatted = guarantors.map(g => ({
      id: g.guarantor_id,
      name: g.fullName,
      phone: g.phoneNumber,
      status: g.verificationStatus,
      guaranteedAmount: g.guaranteed_amount,
      loanId: g.loanId || null,
      relationshipOfficer: g.relationshipOfficerName,
      createdAt: g.created_at
    }));
    return res.status(200).json({ success: true, data: formatted, officerId, pagination: { total: count, totalPages, currentPage: page, hasNextPage: page < totalPages, hasPrevPage: page > 1 } });
  } catch (error) {
    console.error('Get Guarantors by Officer Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve guarantors by officer', error: error.message });
  }
};

export const getGuarantorAuditLogs = async (req, res) => {
  try {
    const { guarantorId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const guarantor = await Guarantor.findOne({ where: { guarantor_id: guarantorId } });
    if (!guarantor) return res.status(404).json({ success: false, message: 'Guarantor not found', code: 'GUARANTOR_NOT_FOUND' });
    const { count, rows: auditLogs } = await GuarantorAudit.findAndCountAll({
      where: { guarantorId: guarantor.guarantor_id },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });
    const totalPages = Math.ceil(count / limit);
    const formattedLogs = auditLogs.map(log => ({ id: log.id, action: log.action, performedBy: log.performedBy, timestamp: log.createdAt, details: log.details, relationshipOfficer: log.relationshipOfficer }));
    return res.status(200).json({ success: true, data: formattedLogs, guarantorId, guarantorName: guarantor.fullName, pagination: { total: count, totalPages, currentPage: page, hasNextPage: page < totalPages, hasPrevPage: page > 1 } });
  } catch (error) {
    console.error('Get Guarantor Audit Logs Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve audit logs', error: error.message });
  }
};

// ==================== DEFAULT EXPORT ====================
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