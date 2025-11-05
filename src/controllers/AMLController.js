import AML from '../models/AML.js';
import Customer from '../models/Customer.js';
import auditLogger from '../utils/AuditLogger.js';  // Fixed: Default import for hybrid logger
import { checkSanctionList } from '../utils/checkSanctionList.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import { validateAMLInput } from '../utils/amlValidator.js';

export const upsertAML = async (req, res) => {
  try {
    const {
      CUST_ID,
      BVN,
      NIN,
      IS_PEP,
      SANCTION_SCORE,
      LAST_RISK_ASSESSMENT_DT,
      ID_DOCUMENTS,
      AML_STATUS,
      RISK_REASON,
      NEXT_REVIEW_DATE,
      USER_ID,
      fullName,
      BU_ID,
      HOME_ADDRESS,
      DOCUMENT_VERIFICATION_STATUS
    } = req.body;

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Validate input
    const validationError = validateAMLInput(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

    // Check if customer exists
    const customerExists = await Customer.findOne({ CUST_ID });
    if (!customerExists) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found. Please register customer first.'
      });
    }

    // Enhanced sanction check
    const { isSanctioned, sanctionDetails } = await checkSanctionList(BVN, NIN);

    const CUSTOMER_RISK_RATING = calculateRiskRating({
      IS_PEP,
      SANCTION_SCORE,
      isSanctioned,
      DOCUMENT_VERIFICATION_STATUS
    });

    const newAMLData = {
      fullName,
      BVN,
      NIN,
      IS_PEP,
      SANCTION_SCORE,
      LAST_RISK_ASSESSMENT_DT,
      ID_DOCUMENTS,
      SANCTION_MATCH: isSanctioned,
      SANCTION_DETAILS: sanctionDetails,
      CUSTOMER_RISK_RATING,
      AML_STATUS: AML_STATUS || 'Pending',
      RISK_REASON: RISK_REASON || 
        (IS_PEP ? 'PEP' : 
         isSanctioned ? 'Sanction Hit' : 
         SANCTION_SCORE > 70 ? 'High Risk Score' : 'Normal'),
      NEXT_REVIEW_DATE: calculateNextReviewDate(CUSTOMER_RISK_RATING, NEXT_REVIEW_DATE),
      DOCUMENT_VERIFICATION_STATUS: DOCUMENT_VERIFICATION_STATUS || 'Pending',
      UPDATED_AT: new Date(),
      UPDATED_BY: USER_ID || 'system'
    };

    const existing = await AML.findOne({ CUST_ID });
    let amlRecord, action;

    if (existing) {
      const oldValue = JSON.stringify(existing);
      amlRecord = await AML.findOneAndUpdate(
        { CUST_ID },
        newAMLData,
        { new: true, runValidators: true }
      );

      // Audit via hybrid logger
      auditLogger.info('Audit Event', {
        entity_type: 'AML_UPDATE',
        entity_id: amlRecord._id,
        user_id: USER_ID,
        action: 'Updated AML record',
        old_value: oldValue,
        new_value: JSON.stringify(amlRecord),
        ip_address: ipAddress,
        event_type: 'AML_UPDATE',
        outcome: 'success'
      });

      action = 'updated';
    } else {
      amlRecord = await AML.create({ CUST_ID, ...newAMLData });

      // Audit via hybrid logger
      auditLogger.info('Audit Event', {
        entity_type: 'AML_CREATE',
        entity_id: amlRecord._id,
        user_id: USER_ID,
        action: 'Created AML record',
        old_value: null,
        new_value: JSON.stringify(amlRecord),
        ip_address: ipAddress,
        event_type: 'AML_CREATE',
        outcome: 'success'
      });

      // Submit Workflow Item
      try {
        const workflowResult = await WF_WORK_ITEMController.submitTransaction({
          body: {
            ITEM_VALUE: CUST_ID,
            ITEM_DESC: `Customer AML Profile for ${fullName}`,
            ITEM_CLASS_NM: 'Customer',
            ITEM_TYPE: 'AML',
            ITEM_ID: amlRecord._id,
            CUST_ID,
            USER_ID,
            BU_ID,
            HOME_ADDRESS,
            TARGET_USER_ROLE_ID: 'Manager',
            ORIGINATOR_USER_ROLE_ID: 'Originator',
            CREATE_DT: new Date(),
            REC_ST: 'Pending',
            WAIT_ST: 'Pending',
            VERSION: 1,
            ITEM_BU_ID: BU_ID,
            RISK_RATING: CUSTOMER_RISK_RATING,
            PRIORITY: CUSTOMER_RISK_RATING === 'High' ? 'High' : 'Normal'
          }
        });

        console.log('Workflow Result:', workflowResult?.data || workflowResult);
      } catch (workflowError) {
        console.error('Workflow submission error:', workflowError);
      }

      action = 'created';
    }

    // Update Customer
    await Customer.updateOne(
      { CUST_ID },
      { 
        AML_STATUS: amlRecord.AML_STATUS,
        RISK_RATING: amlRecord.CUSTOMER_RISK_RATING,
        LAST_AML_UPDATE: new Date()
      }
    );

    return res.status(200).json({
      success: true,
      message: `AML record ${action} successfully.`,
      data: amlRecord
    });

  } catch (error) {
    console.error('❌ AML Upsert Error:', error);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'AML_UPSERT',
      entity_id: null,
      user_id: req.body.USER_ID || 'system',
      action: 'upsert_aml',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'AML_ERROR',
      outcome: 'failure',
      error: error.message
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to process AML record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


// Helper function to calculate risk rating
function calculateRiskRating({ IS_PEP, SANCTION_SCORE, isSanctioned, DOCUMENT_VERIFICATION_STATUS }) {
  if (IS_PEP || isSanctioned) return 'High';
  if (SANCTION_SCORE > 70) return 'High';
  if (DOCUMENT_VERIFICATION_STATUS === 'Failed') return 'Medium';
  if (SANCTION_SCORE > 30) return 'Medium';
  return 'Low';
}

// Helper function to calculate next review date based on risk rating
function calculateNextReviewDate(riskRating, customDate) {
  if (customDate) return new Date(customDate);
  
  const now = new Date();
  switch(riskRating) {
    case 'High': return new Date(now.setMonth(now.getMonth() + 1)); // Monthly review for high risk
    case 'Medium': return new Date(now.setMonth(now.getMonth() + 3)); // Quarterly for medium
    default: return new Date(now.setMonth(now.getMonth() + 6)); // Biannual for low
  }
}

export const approveAML = async (req, res) => {
  try {
    const { CUST_ID, USER_ID, fullName, BU_ID, HOME_ADDRESS, comments } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!CUST_ID || !USER_ID) {
      return res.status(400).json({
        success: false,
        message: 'CUST_ID and USER_ID are required for approval'
      });
    }

    // Ensure CUST_ID remains padded
    const custIdString = String(CUST_ID).padStart(10, '0');

    const aml = await AML.findOne({ CUST_ID: custIdString });

    if (!aml) {
      return res.status(404).json({
        success: false,
        message: 'AML record not found',
        CUST_ID: custIdString
      });
    }

    const oldValue = JSON.stringify(aml);

    // Update AML fields
    aml.AML_STATUS = 'Approved';
    aml.APPROVED_BY = USER_ID;
    aml.APPROVAL_COMMENTS = comments || '';
    aml.APPROVAL_DATE = new Date();
    aml.UPDATED_BY = USER_ID;
    aml.UPDATED_AT = new Date();

    // Verify ID documents if present
    if (aml.ID_DOCUMENTS && aml.ID_DOCUMENTS.length > 0) {
      aml.ID_DOCUMENTS = aml.ID_DOCUMENTS.map(doc => ({
        ...doc._doc,
        verificationStatus: 'Verified'
      }));
      aml.DOCUMENT_VERIFICATION_STATUS = 'Verified';
    }

    await aml.save();

    // Update Customer record
    await Customer.updateOne(
      { CUST_ID: custIdString },
      {
        AML_STATUS: 'Approved',
        LAST_AML_UPDATE: new Date(),
        APPROVED_BY: USER_ID
      }
    );

    // Submit workflow
    try {
      await WF_WORK_ITEMController.submitTransaction({
        body: {
          ITEM_VALUE: aml.CUST_NO || custIdString,
          ITEM_DESC: `Customer Account Application for ${fullName}`,
          ITEM_CLASS_NM: 'Customer',
          ITEM_TYPE: 'Customer',
          ITEM_ID: aml._id,
          CUST_ID: custIdString,
          USER_ID,
          BU_ID,
          HOME_ADDRESS,
          TARGET_USER_ROLE_ID: 'Manager',
          ORIGINATOR_USER_ROLE_ID: 'Originator',
          CREATE_DT: new Date(),
          REC_ST: 'Approved',
          WAIT_ST: 'Completed',
          VERSION: 1,
          ITEM_BU_ID: BU_ID,
          COMMENTS: comments
        }
      });
    } catch (workflowError) {
      console.error('⚠️ Workflow submission failed:', workflowError.message || workflowError);
    }

    // Audit log via hybrid logger
    auditLogger.info('Audit Event', {
      entity_type: 'AML_APPROVAL',
      entity_id: aml._id,
      user_id: USER_ID,
      action: 'Approved AML record',
      old_value: oldValue,
      new_value: JSON.stringify(aml),
      ip_address: ipAddress,
      event_type: 'AML_APPROVAL',
      outcome: 'success'
    });

    return res.status(200).json({
      success: true,
      message: 'AML record approved successfully',
      data: aml
    });
  } catch (error) {
    console.error('❌ AML Approval Error:', error);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'AML_APPROVAL',
      entity_id: null,
      user_id: req.body.USER_ID || 'system',
      action: 'approve_aml',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'AML_ERROR',
      outcome: 'failure',
      error: error.message
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to approve AML record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


export const rejectAML = async (req, res) => {
  try {
    const { CUST_ID, USER_ID, fullName = 'Unknown User', rejectionReason, comments } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Validate required fields
    if (!CUST_ID || !USER_ID || !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'CUST_ID, USER_ID, and rejectionReason are required for rejection.'
      });
    }

    // Find existing AML record
    const existingAML = await AML.findOne({ CUST_ID });
    if (!existingAML) {
      return res.status(404).json({
        success: false,
        message: `No AML record found for CUST_ID: ${CUST_ID}`
      });
    }

    const oldValue = JSON.stringify(existingAML);

    // Update AML status and rejection metadata
    existingAML.AML_STATUS = 'Rejected';
    existingAML.REJECTION_DATE = new Date();
    existingAML.REJECTED_BY = USER_ID;
    existingAML.REJECTION_REASON = rejectionReason;
    existingAML.REJECTION_COMMENTS = comments || null;
    existingAML.UPDATED_AT = new Date();
    existingAML.UPDATED_BY = USER_ID;

    await existingAML.save();

    // Update AML status on the corresponding customer record
    await Customer.updateOne(
      { CUST_ID },
      {
        AML_STATUS: 'Rejected',
        LAST_AML_UPDATE: new Date(),
        REJECTED_BY: USER_ID
      }
    );

    // Log audit trail via hybrid logger
    auditLogger.info('Audit Event', {
      entity_type: 'AML_REJECTION',
      entity_id: existingAML._id,
      user_id: USER_ID,
      action: `Rejected AML record for ${fullName}`,
      old_value: oldValue,
      new_value: JSON.stringify(existingAML),
      ip_address: ipAddress,
      event_type: 'AML_REJECTION',
      outcome: 'success',
      rejection_reason: rejectionReason
    });

    return res.status(200).json({
      success: true,
      message: 'AML record rejected successfully.',
      data: existingAML
    });
  } catch (error) {
    console.error('❌ AML Rejection Error:', error);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'AML_REJECTION',
      entity_id: null,
      user_id: req.body.USER_ID || 'system',
      action: 'reject_aml',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'AML_ERROR',
      outcome: 'failure',
      error: error.message
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to reject AML record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


export const getAMLByCustomer = async (req, res) => {
  try {
    const { custId } = req.params;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';

    if (!custId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer ID is required' 
      });
    }

    const aml = await AML.findOne({ CUST_ID: custId })
      .populate('customer')
      .populate('SARs')
      .populate('UPDATED_BY', 'username email')
      .populate('APPROVED_BY', 'username email')
      .populate('REJECTED_BY', 'username email');

    if (!aml) {
      // Self-audit not-found (optional)
      auditLogger.info('Audit Event', {
        entity_type: 'aml_query',
        entity_id: custId,
        user_id: userId,
        action: 'get_aml_by_customer',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address: ipAddress,
        event_type: 'QUERY_NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ 
        success: false, 
        message: 'AML record not found.' 
      });
    }

    // Self-audit success (optional)
    auditLogger.info('Audit Event', {
      entity_type: 'aml_query',
      entity_id: custId,
      user_id: userId,
      action: 'get_aml_by_customer',
      old_value: null,
      new_value: { event_id: aml.event_id },
      ip_address: ipAddress,
      event_type: 'QUERY_SUCCESS',
      outcome: 'success'
    });

    res.status(200).json({ 
      success: true, 
      data: aml 
    });
  } catch (error) {
    console.error('Error fetching AML by customer:', error);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'aml_query',
      entity_id: req.params.custId || null,
      user_id: req.user_id || 'system',
      action: 'get_aml_by_customer',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: error.message
    });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve AML record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const deleteAMLByCustId = async (req, res) => {
  try {
    const { custId } = req.params;
    const { USER_ID, reason } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!USER_ID || !reason) {
      return res.status(400).json({ 
        success: false, 
        message: 'USER_ID and deletion reason are required' 
      });
    }

    const existing = await AML.findOne({ CUST_ID: custId });
    if (!existing) {
      return res.status(404).json({ 
        success: false, 
        message: 'AML record not found.' 
      });
    }

    const oldValue = JSON.stringify(existing);

    // Log before deletion via hybrid logger
    auditLogger.info('Audit Event', {
      entity_type: 'AML_DELETION',
      entity_id: existing._id,
      user_id: USER_ID,
      action: `Deleted AML record for customer ${custId}`,
      old_value: oldValue,
      new_value: null,
      ip_address: ipAddress,
      event_type: 'AML_DELETION',
      outcome: 'success',
      reason: reason
    });

    await AML.findOneAndDelete({ CUST_ID: custId });

    // Update customer status
    await Customer.updateOne(
      { CUST_ID: custId },
      { 
        AML_STATUS: 'Deleted',
        LAST_AML_UPDATE: new Date()
      }
    );

    return res.json({ 
      success: true, 
      message: 'AML record deleted successfully.' 
    });
  } catch (err) {
    console.error('Error deleting AML by CustId:', err);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'AML_DELETION',
      entity_id: req.params.custId || null,
      user_id: req.body.USER_ID || 'system',
      action: 'delete_aml_by_cust_id',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'AML_ERROR',
      outcome: 'failure',
      error: err.message,
      reason: req.body.reason || null
    });
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to delete AML record',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

export const getAllAMLRecords = async (req, res) => {
  try {
    const { status, riskRating, page = 1, limit = 20 } = req.query;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';
    
    const filter = {};
    if (status) filter.AML_STATUS = status;
    if (riskRating) filter.CUSTOMER_RISK_RATING = riskRating;

    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      AML.find(filter)
        .skip(skip)
        .limit(Number(limit))
        .populate('customer', 'CUST_ID fullName')
        .sort({ UPDATED_AT: -1 }),
      AML.countDocuments(filter)
    ]);

    // Self-audit the query (optional)
    auditLogger.info('Audit Event', {
      entity_type: 'aml_list_query',
      entity_id: null,
      user_id: userId,
      action: 'get_all_aml_records',
      old_value: null,
      new_value: { count: records.length, filters: { status, riskRating }, pagination: { page, limit, total } },
      ip_address: ipAddress,
      event_type: 'QUERY_SUCCESS',
      outcome: 'success'
    });

    return res.json({ 
      success: true, 
      data: records,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching all AML records:', err);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'aml_list_query',
      entity_id: null,
      user_id: req.user_id || 'system',
      action: 'get_all_aml_records',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: err.message
    });
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve AML records',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

export const updateAMLByCustId = async (req, res) => {
  try {
    const {
      fullName,
      CUST_ID,
      BVN,
      NIN,
      IS_PEP,
      SANCTION_SCORE,
      LAST_RISK_ASSESSMENT_DT,
      ID_DOCUMENTS,
      AML_STATUS,
      RISK_REASON,
      NEXT_REVIEW_DATE,
      USER_ID,
      DOCUMENT_VERIFICATION_STATUS
    } = req.body;

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!CUST_ID || !USER_ID) {
      return res.status(400).json({
        success: false,
        message: 'CUST_ID and USER_ID are required.'
      });
    }

    const existing = await AML.findOne({ CUST_ID });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'AML record not found for the given CUST_ID.'
      });
    }

    // Enhanced sanction check with existing values if new ones not provided
    const { isSanctioned, sanctionDetails } = await checkSanctionList(
      BVN || existing.BVN, 
      NIN || existing.NIN
    );

    const CUSTOMER_RISK_RATING = calculateRiskRating({
      IS_PEP: IS_PEP !== undefined ? IS_PEP : existing.IS_PEP,
      SANCTION_SCORE: SANCTION_SCORE || existing.SANCTION_SCORE,
      isSanctioned,
      DOCUMENT_VERIFICATION_STATUS: DOCUMENT_VERIFICATION_STATUS || existing.DOCUMENT_VERIFICATION_STATUS
    });

    const updatedAMLData = {
      ...(BVN && { BVN }),
      ...(NIN && { NIN }),
      ...(typeof IS_PEP !== 'undefined' && { IS_PEP }),
      ...(SANCTION_SCORE && { SANCTION_SCORE }),
      ...(LAST_RISK_ASSESSMENT_DT && { LAST_RISK_ASSESSMENT_DT }),
      ...(ID_DOCUMENTS && { ID_DOCUMENTS }),
      AML_STATUS: AML_STATUS || existing.AML_STATUS,
      RISK_REASON: RISK_REASON || 
        (IS_PEP ? 'PEP' : 
         isSanctioned ? 'Sanction Hit' : 
         SANCTION_SCORE > 70 ? 'High Risk Score' : 'Normal'),
      NEXT_REVIEW_DATE: calculateNextReviewDate(
        CUSTOMER_RISK_RATING, 
        NEXT_REVIEW_DATE || existing.NEXT_REVIEW_DATE
      ),
      SANCTION_MATCH: isSanctioned,
      SANCTION_DETAILS: sanctionDetails,
      CUSTOMER_RISK_RATING,
      DOCUMENT_VERIFICATION_STATUS: DOCUMENT_VERIFICATION_STATUS || existing.DOCUMENT_VERIFICATION_STATUS,
      UPDATED_AT: new Date(),
      UPDATED_BY: USER_ID
    };

    const oldValue = JSON.stringify(existing);
    const updated = await AML.findOneAndUpdate(
      { CUST_ID }, 
      updatedAMLData, 
      { new: true, runValidators: true }
    );

    // Audit via hybrid logger
    auditLogger.info('Audit Event', {
      entity_type: 'AML_UPDATE',
      entity_id: updated._id,
      user_id: USER_ID,
      action: 'Updated AML by CUST_ID',
      old_value: oldValue,
      new_value: JSON.stringify(updated),
      ip_address: ipAddress,
      event_type: 'AML_UPDATE',
      outcome: 'success'
    });

    // Update customer record if risk rating changed
    if (existing.CUSTOMER_RISK_RATING !== updated.CUSTOMER_RISK_RATING) {
      await Customer.updateOne(
        { CUST_ID },
        { RISK_RATING: updated.CUSTOMER_RISK_RATING }
      );
    }

    return res.status(200).json({
      success: true,
      message: 'AML record updated successfully.',
      data: updated
    });
  } catch (error) {
    console.error('❌ updateAMLByCustId Error:', error);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'AML_UPDATE',
      entity_id: null,
      user_id: req.body.USER_ID || 'system',
      action: 'update_aml_by_cust_id',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'AML_ERROR',
      outcome: 'failure',
      error: error.message
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to update AML record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getAMLByCustId = async (req, res) => {
  try {
    const { custId } = req.params;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';
    
    if (!custId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer ID is required' 
      });
    }

    const aml = await AML.findOne({ CUST_ID: custId })
      .populate('customer', 'CUST_ID fullName email phone')
      .populate('UPDATED_BY', 'username email')
      .populate('APPROVED_BY', 'username email')
      .populate('REJECTED_BY', 'username email');

    if (!aml) {
      // Self-audit not-found (optional)
      auditLogger.info('Audit Event', {
        entity_type: 'aml_query',
        entity_id: custId,
        user_id: userId,
        action: 'get_aml_by_cust_id',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address: ipAddress,
        event_type: 'QUERY_NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ 
        success: false, 
        message: 'AML record not found.' 
      });
    }

    // Self-audit success (optional)
    auditLogger.info('Audit Event', {
      entity_type: 'aml_query',
      entity_id: custId,
      user_id: userId,
      action: 'get_aml_by_cust_id',
      old_value: null,
      new_value: { event_id: aml.event_id },
      ip_address: ipAddress,
      event_type: 'QUERY_SUCCESS',
      outcome: 'success'
    });

    return res.json({ 
      success: true, 
      data: aml 
    });
  } catch (err) {
    console.error('Error fetching AML by CustId:', err);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'aml_query',
      entity_id: req.params.custId || null,
      user_id: req.user_id || 'system',
      action: 'get_aml_by_cust_id',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: err.message
    });
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve AML record',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// New function to get AML risk statistics
export const getAMLRiskStats = async (req, res) => {
  try {
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';

    const stats = await AML.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          highRisk: { $sum: { $cond: [{ $eq: ["$CUSTOMER_RISK_RATING", "High"] }, 1, 0] } },
          mediumRisk: { $sum: { $cond: [{ $eq: ["$CUSTOMER_RISK_RATING", "Medium"] }, 1, 0] } },
          lowRisk: { $sum: { $cond: [{ $eq: ["$CUSTOMER_RISK_RATING", "Low"] }, 1, 0] } },
          pepCount: { $sum: { $cond: ["$IS_PEP", 1, 0] } },
          sanctionedCount: { $sum: { $cond: ["$SANCTION_MATCH", 1, 0] } }
        }
      }
    ]);

    // Self-audit the query (optional)
    auditLogger.info('Audit Event', {
      entity_type: 'aml_stats_query',
      entity_id: null,
      user_id: userId,
      action: 'get_aml_risk_stats',
      old_value: null,
      new_value: stats[0] || { total: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0, pepCount: 0, sanctionedCount: 0 },
      ip_address: ipAddress,
      event_type: 'QUERY_SUCCESS',
      outcome: 'success'
    });

    return res.json({ 
      success: true, 
      data: stats[0] || {
        total: 0,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
        pepCount: 0,
        sanctionedCount: 0
      }
    });
  } catch (err) {
    console.error('Error fetching AML risk stats:', err);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'aml_stats_query',
      entity_id: null,
      user_id: req.user_id || 'system',
      action: 'get_aml_risk_stats',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: err.message
    });
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve AML statistics',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};