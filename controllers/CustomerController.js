import Customer from '../models/Customer.js';
import AML from '../models/AML.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import auditLogger from '../utils/AuditLogger.js';  // Fixed: Default import for hybrid logger
import { checkSanctionList } from '../utils/checkSanctionList.js';
import { validateAMLInput } from '../utils/amlValidator.js';
import generateCustomerNumber from '../utils/generateCustomerNumber.js';
import NotificationService from '../services/NotificationService.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import CustomerBatchService from '../Services/customerBatchService.js';

import moment from 'moment';
import mongoose from 'mongoose';

// ===== Helper Functions =====
const parseDate = (dateStr, format) => {
  if (!dateStr) return undefined;
  const m = moment(dateStr, format, true);
  return m.isValid() ? m.toDate() : undefined;
};

const calculateRiskRating = ({ IS_PEP, SANCTION_SCORE, isSanctioned, DOCUMENT_VERIFICATION_STATUS }) => {
  if (IS_PEP || isSanctioned) return 'High';
  if (SANCTION_SCORE > 70) return 'High';
  if (DOCUMENT_VERIFICATION_STATUS !== 'Verified') return 'Medium';
  return 'Low';
};

const calculateNextReviewDate = (rating, providedDate) => {
  if (providedDate) return providedDate;
  const date = new Date();
  if (rating === 'High') date.setMonth(date.getMonth() + 3);
  else if (rating === 'Medium') date.setMonth(date.getMonth() + 6);
  else date.setFullYear(date.getFullYear() + 1);
  return date;
};

// ===== Validation for Next of Kin =====
const validateNextOfKin = (nextOfKinArray) => {
  if (!Array.isArray(nextOfKinArray)) return 'nextOfKin must be an array';
  
  if (nextOfKinArray.length > 5) return 'Maximum 5 next of kin allowed';
  
  // Ensure at least one primary
  const hasPrimary = nextOfKinArray.some(nok => nok.IS_PRIMARY === true);
  if (!hasPrimary && nextOfKinArray.length > 0) {
    return 'At least one next of kin must be marked as primary';
  }
  
  // Validate required fields for each
  for (let i = 0; i < nextOfKinArray.length; i++) {
    const nok = nextOfKinArray[i];
    if (!nok.NEXTOF_KIN_NM || !nok.RELATIONSHIP || !nok.PHONE_NO || !nok.ADDRESS) {
      return `Next of kin ${i + 1} missing required fields (NEXTOF_KIN_NM, RELATIONSHIP, PHONE_NO, ADDRESS)`;
    }
    if (nok.PHONE_NO && !/^\+?\d{10,15}$/.test(nok.PHONE_NO)) {
      return `Invalid phone number format for next of kin ${i + 1}`;
    }
  }
  
  return null; // Valid
};

// ===== Controller =====
export const createCustomer = async (req, res) => {
  const session = await Customer.startSession();
  session.startTransaction();

  try {
    const {
      CUST_ID,
      CUST_NO,
      TITLE_ID,
      FIRST_NAME,
      MIDDLE_NAME,
      LAST_NAME,
      CUST_NM,
      HOME_ADDRESS,
      EMAIL_ADDRESS,
      BU_ID,
      MAIDEN_NM,
      BIRTH_DT,
      CNTRY_OF_BIRTH_ID,
      CUST_CAT,
      CAMPAIGN_ID,
      GENDER_TY,
      COUNTRY_NM,
      STATE,
      NIN,
      BVN,
      LOCAL_GOV,
      OPENING_RSN_ID,
      OPENED_DT,
      RESIDENT_CNTRY_ID,
      RISK_CLASS,
      STMNT_FREQ_CD,
      STMNT_FREQ_VALUE,
      CREATED_BY,
      USER_ID,
      CREATE_DT,
      INDUSTRY_ID,
      INDUSTRY_CD,
      TAX_STATUS,
      MARITAL_ST,
      TAX_GRP_ID,
      OPERATIONS_CRNCY_ID,
      EMP_ST,
      ORGANISATION_NM,
      REGISTRATION_ADDRESS,
      REGISTRATION_DT,
      ALERT_DELIVERY_METHOD,
      KYC_LEVEL,
      PHONE_NO,
      SMS,
      IS_PEP,
      SANCTION_SCORE,
      DOCUMENT_VERIFICATION_STATUS,
      nextOfKin, // ✅ Next of Kin array (from model: nextOfKin array with NEXTOF_KIN_NM, RELATIONSHIP, PHONE_NO, EMAIL, ADDRESS, IS_PRIMARY, CREATED_DT)
      REC_ST = 'Pending'
    } = req.body;

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // ===== Basic Validation =====
    if (!HOME_ADDRESS || !BU_ID) {
      return res.status(400).json({ message: 'HOME_ADDRESS and BU_ID are required.' });
    }

    if (NIN && !/^\d{11}$/.test(NIN)) {
      return res.status(400).json({ message: 'NIN must be exactly 11 digits.' });
    }
    if (BVN && !/^\d{11}$/.test(BVN)) {
      return res.status(400).json({ message: 'BVN must be exactly 11 digits.' });
    }

    // ✅ Validation for Next of Kin (matches model fields: NEXTOF_KIN_NM, RELATIONSHIP, PHONE_NO, EMAIL, ADDRESS, IS_PRIMARY)
    const nokValidationError = validateNextOfKin(nextOfKin);
    if (nokValidationError) {
      return res.status(400).json({ message: nokValidationError });
    }

    const existingCustomer = await Customer.findOne({
      $or: [
        { CUST_NO: CUST_NO || '' },
        { EMAIL_ADDRESS: EMAIL_ADDRESS || '' }
      ]
    });
    if (existingCustomer) {
      return res.status(400).json({ message: 'Customer with this CUST_NO or EMAIL_ADDRESS already exists' });
    }

    // ===== Auto-generate Customer ID & Number if not provided =====
    const { CUST_ID: generatedCUST_ID, CUST_NO: generatedCUST_NO } = await generateCustomerNumber();
    const finalCUST_ID = CUST_ID || generatedCUST_ID;
    const finalCUST_NO = CUST_NO || generatedCUST_NO;

    const userId = USER_ID || CREATED_BY || 'SYSTEM';
    const fullName = CUST_NM || `${FIRST_NAME ?? ''} ${MIDDLE_NAME ?? ''} ${LAST_NAME ?? ''}`.trim();

    // ===== Prepare Customer Data (includes nextOfKin array matching model) =====
    const customerData = {
      CUST_ID: finalCUST_ID,
      CUST_NO: finalCUST_NO,
      TITLE_ID,
      FIRST_NAME,
      MIDDLE_NAME,
      LAST_NAME,
      CUST_NM: fullName,
      HOME_ADDRESS,
      EMAIL_ADDRESS,
      BU_ID,
      MAIDEN_NM,
      BIRTH_DT: parseDate(BIRTH_DT, 'MM-DD-YYYY'),
      CNTRY_OF_BIRTH_ID: CNTRY_OF_BIRTH_ID || 'NGA',
      CUST_CAT,
      CAMPAIGN_ID,
      GENDER_TY,
      COUNTRY_NM: COUNTRY_NM || 'Nigeria',
      STATE,
      NIN,
      BVN,
      LOCAL_GOV,
      OPENING_RSN_ID,
      OPENED_DT: parseDate(OPENED_DT, 'MM-DD-YYYY'),
      RESIDENT_CNTRY_ID: RESIDENT_CNTRY_ID || 'NGA',
      RISK_CLASS,
      STMNT_FREQ_CD,
      STMNT_FREQ_VALUE,
      CREATED_BY,
      USER_ID: userId,
      CREATE_DT: CREATE_DT ? new Date(CREATE_DT) : new Date(),
      INDUSTRY_ID,
      INDUSTRY_CD,
      TAX_STATUS,
      MARITAL_ST,
      TAX_GRP_ID,
      OPERATIONS_CRNCY_ID: OPERATIONS_CRNCY_ID || 'NGN',
      EMP_ST,
      ORGANISATION_NM,
      REGISTRATION_ADDRESS,
      REGISTRATION_DT: parseDate(REGISTRATION_DT, 'MM-DD-YYYY'),
      ALERT_DELIVERY_METHOD,
      KYC_LEVEL,
      PHONE_NO,
      SMS,
      IS_PEP,
      SANCTION_SCORE,
      DOCUMENT_VERIFICATION_STATUS,
      nextOfKin: nextOfKin || [], // ✅ Next of Kin array (directly from req.body, validated above)
      REC_ST,
    };

    // ===== Insert Customer =====
    const [newCustomer] = await Customer.create([customerData], { session });

    // ===== Audit Log via hybrid logger =====
    auditLogger.info('Audit Event', {
      entity_type: 'CUSTOMER_CREATE',
      entity_id: newCustomer._id,
      user_id: userId,
      action: `Created customer ${fullName}${nextOfKin && nextOfKin.length > 0 ? ` with ${nextOfKin.length} next of kin` : ''}`,
      old_value: null,
      new_value: JSON.stringify(newCustomer),
      ip_address: ipAddress,
      event_type: 'CUSTOMER_CREATE',
      outcome: 'success'
    });

    // ===== AML & Sanction List Check for PEP =====
    let amlWorkItemId = null;
    if (IS_PEP) {
      const validationError = validateAMLInput({
        CUST_ID: finalCUST_ID,
        BVN,
        NIN,
        IS_PEP,
        SANCTION_SCORE,
        DOCUMENT_VERIFICATION_STATUS
      });
      if (validationError) throw new Error(validationError);

      const { isSanctioned, sanctionDetails } = await checkSanctionList(BVN, NIN);

      const CUSTOMER_RISK_RATING = calculateRiskRating({
        IS_PEP,
        SANCTION_SCORE,
        isSanctioned,
        DOCUMENT_VERIFICATION_STATUS
      });

      const amlRecord = await AML.create([{
        fullName,
        CUST_ID: finalCUST_ID,
        BVN,
        NIN,
        IS_PEP,
        SANCTION_SCORE,
        LAST_RISK_ASSESSMENT_DT: new Date(),
        SANCTION_MATCH: isSanctioned,
        SANCTION_DETAILS: sanctionDetails,
        CUSTOMER_RISK_RATING,
        AML_STATUS: 'Pending',
        RISK_REASON: IS_PEP
          ? 'PEP'
          : isSanctioned
            ? 'Sanction Hit'
            : SANCTION_SCORE > 70
              ? 'High Risk Score'
              : 'Normal',
        NEXT_REVIEW_DATE: calculateNextReviewDate(CUSTOMER_RISK_RATING),
        DOCUMENT_VERIFICATION_STATUS: DOCUMENT_VERIFICATION_STATUS || 'Pending',
        UPDATED_AT: new Date(),
        UPDATED_BY: userId || 'system'
      }], { session });

      // Audit AML creation via hybrid logger
      auditLogger.info('Audit Event', {
        entity_type: 'AML_CREATE',
        entity_id: amlRecord[0]._id,
        user_id: userId,
        action: 'Created AML record (Auto due to PEP)',
        old_value: null,
        new_value: JSON.stringify(amlRecord[0]),
        ip_address: ipAddress,
        event_type: 'AML_CREATE',
        outcome: 'success'
      });

      // ===== Workflow Submission for AML =====
      const amlWorkflowResponse = await WF_WORK_ITEMController.submitTransaction({
        body: {
          ITEM_VALUE: finalCUST_ID,
          ITEM_DESC: `Customer AML Profile for ${fullName}`,
          ITEM_CLASS_NM: 'Customer',
          ITEM_TYPE: 'AML',
          ITEM_ID: amlRecord[0]._id,
          CUST_ID: finalCUST_ID,
          USER_ID: userId,
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

      if (amlWorkflowResponse.success) {
        amlWorkItemId = amlWorkflowResponse.data.WORK_ITEM_ID;
      } else {
        throw new Error('Failed to create AML workflow item');
      }
    }

    // ===== Workflow Submission for Customer =====
    const customerWorkflowResponse = await WF_WORK_ITEMController.submitTransaction({
      body: {
        ITEM_VALUE: finalCUST_NO,
        ITEM_DESC: `Customer Account Application for ${fullName}`,
        ITEM_CLASS_NM: 'Customer',
        ITEM_TYPE: 'Customer',
        ITEM_ID: newCustomer._id,
        CUST_ID: finalCUST_ID,
        USER_ID: userId,
        BU_ID,
        HOME_ADDRESS,
        TARGET_USER_ROLE_ID: 'Manager',
        ORIGINATOR_USER_ROLE_ID: 'Originator',
        CREATE_DT: new Date(),
        REC_ST: 'Pending',
        WAIT_ST: 'Pending',
        VERSION: 1,
        ITEM_BU_ID: BU_ID
      }
    });

    if (!customerWorkflowResponse.success) {
      throw new Error('Failed to create customer workflow item');
    }

    const customerWorkItemId = customerWorkflowResponse.data.WORK_ITEM_ID;

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: `Customer ${fullName} created successfully${IS_PEP ? ' with AML profile' : ''}${nextOfKin && nextOfKin.length > 0 ? ` with ${nextOfKin.length} next of kin` : ''}. Workflow item ID: ${customerWorkItemId}${amlWorkItemId ? `, AML Workflow item ID: ${amlWorkItemId}` : ''}.`,
      customerInfo: {
        CUST_ID: finalCUST_ID,
        CUST_NO: finalCUST_NO,
        CUST_NM: fullName,
        nextOfKinCount: nextOfKin ? nextOfKin.length : 0,
        WORK_ITEM_ID: customerWorkItemId,
        AML_WORK_ITEM_ID: amlWorkItemId
      }
    });

 } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('❌ Create Customer Error:', error);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'CUSTOMER_CREATE',
      entity_id: null,
      user_id: req.body.USER_ID || 'system',
      action: 'create_customer',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'CUSTOMER_ERROR',
      outcome: 'failure',
      error: error.message
    });
    return res.status(500).json({
      message: 'Failed to create customer',
      error: error.message
    });
  }
};


// controllers/CustomerController.js

// Update your batchUploadCustomers function to accept buffer
export const batchUploadCustomers = async (fileBuffer) => {
  try {
    console.log('📁 Processing batch upload with buffer length:', fileBuffer?.length);
    
    if (!fileBuffer || fileBuffer.length === 0) {
      return {
        success: false,
        message: 'Empty file buffer received',
        total: 0,
        created: 0,
        errors: ['File buffer is empty'],
        duplicates: 0,
        failed: 0
      };
    }

    const result = await CustomerBatchService.processExcelBatch(fileBuffer);
    console.log('✅ Batch processing result:', result);
    
    // Ensure the result has all required fields
    return {
      success: result.success || false,
      message: result.message || 'Processing completed',
      total: result.total || 0,
      created: result.created || 0,
      duplicates: result.duplicates || 0,
      failed: result.failed || 0,
      errors: result.errors || [],
      ...result // Spread any additional properties
    };

  } catch (error) {
    console.error('❌ Batch upload error in controller:', error);
    return {
      success: false,
      message: 'Processing failed',
      error: error.message,
      total: 0,
      created: 0,
      duplicates: 0,
      failed: 0,
      errors: [error.message]
    };
  }
};

// Or if you want to keep the original signature, create a wrapper:
export const handleBatchUpload = async (req, res) => {
  try {
    if (!req.files || !req.files.customersFile) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const file = req.files.customersFile;
    const result = await CustomerBatchService.processExcelBatch(file.data);
    
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Batch upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const approveCustomer = async (req, res) => {
  try {
    console.log('🔍 FULL REQUEST ANALYSIS:', {
      'req.params': req.params,
      'req.body': req.body,
      'req.originalUrl': req.originalUrl
    });

    // --- Extract customerId from BOTH URL params and request body ---
    const CUSTOMER_ID = String(
      req.params.customerId ||  // From URL: /approve/0000000109
      req.body.customerId ||    // From body: { "customerId": "0000000109" }
      ''
    ).trim();

    const APPROVED_BY = String(req.body.approvedBy || '').trim();

    console.log('🔍 EXTRACTED VALUES:', {
      customerIdFromParams: req.params.customerId,
      customerIdFromBody: req.body.customerId,
      finalCustomerId: CUSTOMER_ID,
      approvedBy: APPROVED_BY
    });

    // --- Validation ---
    if (!CUSTOMER_ID) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required',
        help: 'Provide it in URL (/approve/0000000109) OR request body ({ "customerId": "0000000109" })',
        received: {
          params: req.params,
          body: req.body
        }
      });
    }

    if (!APPROVED_BY) {
      return res.status(400).json({
        success: false,
        message: 'approvedBy is required in request body',
        example: { "approvedBy": "PCO006" }
      });
    }

    const paddedCustomerId = CUSTOMER_ID.padStart(10, '0');
    console.log('🔍 Processing approval for:', paddedCustomerId);

    // --- Find the customer ---
    const customer = await Customer.findOne({ CUST_ID: paddedCustomerId });
    
    if (!customer) {
      console.log('❌ Customer not found:', paddedCustomerId);
      return res.status(404).json({
        success: false,
        message: `Customer not found: ${paddedCustomerId}`
      });
    }

    console.log('🔍 FOUND CUSTOMER:', {
      CUST_ID: customer.CUST_ID,
      CURRENT_STATUS: customer.REC_ST,
      _id: customer._id,
      nextOfKinCount: customer.nextOfKin ? customer.nextOfKin.length : 0
    });

    // --- Check current status ---
    if (customer.REC_ST === 'Active') {
      console.log('❌ Customer already Active');
      return res.status(400).json({
        success: false,
        message: 'Customer is already Active',
        currentStatus: customer.REC_ST
      });
    }

    if (customer.REC_ST !== 'Pending') {
      console.log('❌ Customer not in Pending state:', customer.REC_ST);
      return res.status(400).json({
        success: false,
        message: `Customer cannot be approved from current status: ${customer.REC_ST}`,
        currentStatus: customer.REC_ST
      });
    }

    // --- APPROVE THE CUSTOMER ---
    console.log('✅ Approving customer from Pending to Active');
    
    const updateResult = await Customer.findOneAndUpdate(
      { 
        CUST_ID: paddedCustomerId,
        REC_ST: 'Pending'
      },
      {
        $set: {
          REC_ST: 'Active',
          approved_by: APPROVED_BY,
          approved_at: new Date(),
          UPDATED_BY: APPROVED_BY,
          UPDATED_AT: new Date()
        }
      },
      { new: true }
    );

    if (!updateResult) {
      console.log('❌ Customer status changed during approval process');
      return res.status(409).json({
        success: false,
        message: 'Customer status was changed by another process. Please refresh and try again.'
      });
    }

    console.log('✅ CUSTOMER APPROVED SUCCESSFULLY:', {
      CUST_ID: updateResult.CUST_ID,
      NEW_STATUS: updateResult.REC_ST,
      approved_by: updateResult.approved_by,
      nextOfKinCount: updateResult.nextOfKin ? updateResult.nextOfKin.length : 0
    });

    // --- Update workflow ---
    try {
      await WF_WORK_ITEM.findOneAndUpdate(
        {
          ITEM_CLASS_NM: 'Customer',
          ITEM_VALUE: paddedCustomerId,
          REC_ST: 'Pending'
        },
        {
          REC_ST: 'Completed',
          WAIT_ST: 'Approved',
          APPROVED_BY: APPROVED_BY,
          APPROVED_DT: new Date(),
          COMPLETED_DT: new Date(),
          ACTION_TAKEN: 'Approved',
          UPDATED_AT: new Date(),
          UPDATED_BY: APPROVED_BY
        }
      );
      console.log('✅ Workflow updated');
    } catch (wfError) {
      console.warn('⚠ Workflow update failed:', wfError.message);
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // --- Audit trail via hybrid logger ---
    auditLogger.info('Audit Event', {
      entity_type: 'CUSTOMER_APPROVE',
      entity_id: customer._id,
      user_id: APPROVED_BY,
      action: `Customer ${paddedCustomerId} approved by ${APPROVED_BY}. Status changed from Pending to Active`,
      old_value: 'Pending',
      new_value: 'Active',
      ip_address: ipAddress,
      event_type: 'CUSTOMER_APPROVE',
      outcome: 'success'
    });

    // --- Success response ---
    return res.status(200).json({
      success: true,
      message: 'Customer approved successfully',
      data: {
        CUST_ID: updateResult.CUST_ID,
        CUST_NO: updateResult.CUST_NO,
        CUST_NM: updateResult.CUST_NM,
        previousStatus: 'Pending',
        newStatus: 'Active',
        approvedBy: APPROVED_BY,
        approvedAt: updateResult.approved_at,
        nextOfKinCount: updateResult.nextOfKin ? updateResult.nextOfKin.length : 0
      }
    });

  } catch (error) {
    console.error('❌ APPROVAL ERROR:', error);
    // Audit failure (non-blocking)
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    auditLogger.error('Audit Event', {
      entity_type: 'CUSTOMER_APPROVE',
      entity_id: req.params.customerId || null,
      user_id: req.body.approvedBy || 'system',
      action: 'approve_customer',
      old_value: null,
      new_value: null,
      ip_address: ipAddress,
      event_type: 'CUSTOMER_ERROR',
      outcome: 'failure',
      error: error.message
    });
    return res.status(500).json({
      success: false,
      message: 'Internal server error during approval',
      error: error.message
    });
  }
};

export const rejectCustomer = async (req, res) => {
  try {
    console.log('🔍 REJECTION REQUEST:', {
      body: req.body,
      params: req.params,
      timestamp: new Date().toISOString()
    });

    // --- Extract parameters from both body and params ---
    const CUSTOMER_ID = String(
      req.params.customerId || 
      req.body.customerId || 
      ''
    ).trim();
    
    const REJECTED_BY = String(req.body.rejectedBy || '').trim();
    const REJECTION_REASON = String(req.body.rejectionReason || 'No reason provided').trim();

    // --- Validation ---
    if (!CUSTOMER_ID) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    if (!REJECTED_BY) {
      return res.status(400).json({
        success: false,
        message: 'rejectedBy is required'
      });
    }

    const paddedCustomerId = CUSTOMER_ID.padStart(10, '0');
    console.log('🔍 Looking up customer for rejection:', paddedCustomerId);

    // --- Find the customer first to check current status ---
    const customer = await Customer.findOne({ CUST_ID: paddedCustomerId });
    
    if (!customer) {
      console.log('❌ Customer not found for rejection:', paddedCustomerId);
      return res.status(404).json({
        success: false,
        message: `Customer not found: ${paddedCustomerId}`
      });
    }

    console.log('🔍 CUSTOMER FOUND FOR REJECTION:', {
      CUST_ID: customer.CUST_ID,
      CURRENT_STATUS: customer.REC_ST,
      _id: customer._id,
      nextOfKinCount: customer.nextOfKin ? customer.nextOfKin.length : 0
    });

    // --- Check if customer can be rejected ---
    if (customer.REC_ST === 'Rejected') {
      return res.status(400).json({
        success: false,
        message: 'Customer is already Rejected'
      });
    }

    if (customer.REC_ST === 'Active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reject an Active customer'
      });
    }

    // --- REJECT THE CUSTOMER ---
    console.log('✅ Rejecting customer from', customer.REC_ST, 'to Rejected');
    
    const updateResult = await Customer.findOneAndUpdate(
      { 
        CUST_ID: paddedCustomerId,
        REC_ST: { $in: ['Pending', 'Submitted', 'Under Review'] } // Only reject from these states
      },
      {
        $set: {
          REC_ST: 'Rejected',
          rejected_by: REJECTED_BY,
          rejected_at: new Date(),
          rejection_reason: REJECTION_REASON,
          UPDATED_BY: REJECTED_BY,
          UPDATED_AT: new Date()
        }
      },
      { new: true }
    );

    if (!updateResult) {
      console.log('❌ Customer status changed during rejection process');
      return res.status(409).json({
        success: false,
        message: 'Customer status was changed by another process. Please refresh and try again.'
      });
    }

    console.log('✅ CUSTOMER REJECTED SUCCESSFULLY:', {
      CUST_ID: updateResult.CUST_ID,
      NEW_STATUS: updateResult.REC_ST,
      rejected_by: updateResult.rejected_by,
      nextOfKinCount: updateResult.nextOfKin ? updateResult.nextOfKin.length : 0
    });

    // --- Update workflow ---
    let workflowUpdated = false;
    try {
      const workItem = await WF_WORK_ITEM.findOneAndUpdate(
        {
          ITEM_CLASS_NM: 'Customer',
          ITEM_VALUE: paddedCustomerId,
          REC_ST: { $in: ['Pending', 'Submitted'] }
        },
        {
          REC_ST: 'Completed',
          WAIT_ST: 'Rejected',
          REJECTED_BY: REJECTED_BY,
          REJECTED_DT: new Date(),
          COMPLETED_DT: new Date(),
          ACTION_TAKEN: 'Rejected',
          REJECTION_REASON: REJECTION_REASON,
          UPDATED_AT: new Date(),
          UPDATED_BY: REJECTED_BY
        },
        { new: true }
      );

      if (workItem) {
        workflowUpdated = true;
        console.log('✅ Workflow updated for rejection:', workItem._id);
      } else {
        console.warn('⚠ Workflow item not found for customer:', paddedCustomerId);
      }
    } catch (wfError) {
      console.warn('⚠ Workflow update failed:', wfError.message);
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // --- Audit trail via hybrid logger ---
    auditLogger.info('Audit Event', {
      entity_type: 'CUSTOMER_REJECT',
      entity_id: customer._id,
      user_id: REJECTED_BY,
      action: `Customer ${paddedCustomerId} rejected by ${REJECTED_BY}. Reason: ${REJECTION_REASON}`,
      old_value: customer.REC_ST,
      new_value: 'Rejected',
      ip_address: ipAddress,
      event_type: 'CUSTOMER_REJECT',
      outcome: 'success',
      rejection_reason: REJECTION_REASON
    });

    // --- Send notification ---
    try {
      await NotificationService.sendNotification({
        type: 'CUSTOMER_REJECTED',
        recipient: REJECTED_BY,
        title: 'Customer Rejection Completed',
        message: `Customer ${customer.CUST_NM} (${customer.CUST_ID}) has been rejected. Reason: ${REJECTION_REASON}`,
        data: {
          customerId: customer.CUST_ID,
          customerName: customer.CUST_NM,
          rejectedBy: REJECTED_BY,
          rejectionReason: REJECTION_REASON,
          timestamp: new Date()
        }
      });
    } catch (notifyError) {
      console.warn('⚠ Notification failed:', notifyError.message);
    }

    // --- Success response ---
    return res.status(200).json({
      success: true,
      message: 'Customer rejected successfully',
      data: {
        CUST_ID: updateResult.CUST_ID,
        CUST_NO: updateResult.CUST_NO,
        CUST_NM: updateResult.CUST_NM,
        previousStatus: customer.REC_ST,
        newStatus: 'Rejected',
        rejectedBy: REJECTED_BY,
        rejectionReason: REJECTION_REASON,
        rejectedAt: updateResult.rejected_at,
        workflowUpdated: workflowUpdated,
        nextOfKinCount: updateResult.nextOfKin ? updateResult.nextOfKin.length : 0
      }
    });

  } catch (error) {
    console.error('❌ REJECTION ERROR:', error);
    // Audit failure (non-blocking)
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    auditLogger.error('Audit Event', {
      entity_type: 'CUSTOMER_REJECT',
      entity_id: req.params.customerId || null,
      user_id: req.body.rejectedBy || 'system',
      action: 'reject_customer',
      old_value: null,
      new_value: null,
      ip_address: ipAddress,
      event_type: 'CUSTOMER_ERROR',
      outcome: 'failure',
      error: error.message,
      rejection_reason: req.body.rejectionReason || null
    });
    return res.status(500).json({
      success: false,
      message: 'Internal server error during rejection',
      error: error.message
    });
  }
};

export const getAllCustomer = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';
    
    let query = {};

    if (status) {
      query.REC_ST = status;
    }

    const customers = await Customer.find(query)
      .sort({ CREATE_DT: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('nextOfKin'); // ✅ ADDED: Populate nextOfKin

    const total = await Customer.countDocuments(query);

    // Self-audit the query (optional)
    auditLogger.info('Audit Event', {
      entity_type: 'customer_list_query',
      entity_id: null,
      user_id: userId,
      action: 'get_all_customer',
      old_value: null,
      new_value: { count: customers.length, filter: { status }, pagination: { page, limit, total } },
      ip_address: ipAddress,
      event_type: 'QUERY_SUCCESS',
      outcome: 'success'
    });

    res.status(200).json({
      success: true,
      data: customers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'customer_list_query',
      entity_id: null,
      user_id: req.user_id || 'system',
      action: 'get_all_customer',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: error.message
    });
    res.status(500).json({ 
      success: false,
      message: 'Error fetching customers', 
      error: error.message 
    });
  }
};

export const getCustomerById = async (req, res) => {
  try {
    let { CUST_ID } = req.params;
    const userId = req.user_id || 'system';
    const ipAddress = req.ip_address || '0.0.0.0';

    if (!CUST_ID) {
      return res.status(400).json({ message: 'CUST_ID parameter is required' });
    }

    // Clean the CUST_ID - remove leading zeros
    const cleanCustId = CUST_ID.toString().replace(/^0+/, '');

    const customer = await Customer.findOne({ CUST_ID: cleanCustId }).populate('nextOfKin');

    if (!customer) {
      // Self-audit not-found
      auditLogger.info('Audit Event', {
        entity_type: 'customer_query',
        entity_id: cleanCustId,
        user_id: userId,
        action: 'get_customer_by_id',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address: ipAddress,
        event_type: 'QUERY_NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: `Customer with CUST_ID ${CUST_ID} not found` });
    }

    // Self-audit success
    auditLogger.info('Audit Event', {
      entity_type: 'customer_query',
      entity_id: cleanCustId,
      user_id: userId,
      action: 'get_customer_by_id',
      old_value: null,
      new_value: { event_id: customer.event_id },
      ip_address: ipAddress,
      event_type: 'QUERY_SUCCESS',
      outcome: 'success'
    });

    res.status(200).json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    auditLogger.error('Audit Event', {
      entity_type: 'customer_query',
      entity_id: req.params.CUST_ID || null,
      user_id: req.user_id || 'system',
      action: 'get_customer_by_id',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: error.message
    });
    res.status(500).json({ 
      success: false,
      message: 'Error fetching customer', 
      error: error.message 
    });
  }
};
// Example: CustomerController.js
export const getPendingCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';
    
    const pendingCustomers = await Customer.find({ REC_ST: 'Pending' })
      .sort({ CREATE_DT: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('nextOfKin'); // ✅ ADDED: Populate nextOfKin

    const total = await Customer.countDocuments({ REC_ST: 'Pending' });

    // Self-audit the query (optional)
    auditLogger.info('Audit Event', {
      entity_type: 'pending_customer_query',
      entity_id: null,
      user_id: userId,
      action: 'get_pending_customers',
      old_value: null,
      new_value: { count: pendingCustomers.length, pagination: { page, limit, total } },
      ip_address: ipAddress,
      event_type: 'QUERY_SUCCESS',
      outcome: 'success'
    });

    console.log('Found pending:', pendingCustomers.length);
    res.status(200).json({
      success: true,
      data: pendingCustomers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error retrieving pending customers:', error);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'pending_customer_query',
      entity_id: null,
      user_id: req.user_id || 'system',
      action: 'get_pending_customers',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: error.message
    });
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving pending customers', 
      error: error.message 
    });
  }
};

export const updateCustomer = async (req, res) => {
  const { CUST_ID } = req.params;
  const updateFields = req.body;
  const userId = req.user?.username || req.body.USER_ID || 'SYSTEM';  // From user or body
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  try {
    const customer = await Customer.findOne({ CUST_ID });

    if (!customer) {
      // Self-audit not-found (optional)
      auditLogger.info('Audit Event', {
        entity_type: 'customer_update',
        entity_id: CUST_ID,
        user_id: userId,
        action: 'update_customer',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address: ipAddress,
        event_type: 'UPDATE_NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: 'Customer not found' });
    }

    const oldValue = JSON.stringify(customer);

    // Validate Next of Kin if provided
    if (updateFields.nextOfKin) {
      const nokValidationError = validateNextOfKin(updateFields.nextOfKin);
      if (nokValidationError) {
        return res.status(400).json({ message: nokValidationError });
      }
    }

    // Update only existing fields on the schema
    Object.keys(updateFields).forEach((field) => {
      if (field in customer.toObject()) {
        customer[field] = updateFields[field];
      }
    });

    await customer.save();

    // Audit log via hybrid logger
    auditLogger.info('Audit Event', {
      entity_type: 'CUSTOMER_UPDATE',
      entity_id: customer._id,
      user_id: userId,
      action: `Customer ${customer.CUST_NM} updated`,
      old_value: oldValue,
      new_value: JSON.stringify(customer),
      ip_address: ipAddress,
      event_type: 'CUSTOMER_UPDATE',
      outcome: 'success'
    });

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      updatedCustomer: customer
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'customer_update',
      entity_id: CUST_ID,
      user_id: userId,
      action: 'update_customer',
      old_value: null,
      new_value: null,
      ip_address: ipAddress,
      event_type: 'UPDATE_ERROR',
      outcome: 'failure',
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: 'Failed to update customer',
      error: error.message
    });
  }
};

export const deactivateCustomer = async (req, res) => {
  const { CUST_ID } = req.params;
  const userId = req.user?.username || req.body.USER_ID || 'SYSTEM';  // From user or body
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  try {
    const customer = await Customer.findOne({ CUST_ID });

    if (!customer) {
      // Self-audit not-found (optional)
      auditLogger.info('Audit Event', {
        entity_type: 'customer_deactivate',
        entity_id: CUST_ID,
        user_id: userId,
        action: 'deactivate_customer',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address: ipAddress,
        event_type: 'DEACTIVATE_NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: 'Customer not found' });
    }

    const oldValue = JSON.stringify(customer);

    customer.REC_ST = 'Inactive';
    await customer.save();

    const oldStatus = customer.REC_ST;  // Before update

    // Optional: update related work item status
    await WF_WORK_ITEMController.updateWorkItemStatusOnRejection(
      'CUSTOMER',
      CUST_ID,
      userId
    );

    // Audit log via hybrid logger
    auditLogger.info('Audit Event', {
      entity_type: 'CUSTOMER_DEACTIVATE',
      entity_id: customer._id,
      user_id: userId,
      action: `Customer ${customer.CUST_NM} deactivated`,
      old_value: oldStatus,
      new_value: 'Inactive',
      ip_address: ipAddress,
      event_type: 'CUSTOMER_DEACTIVATE',
      outcome: 'success'
    });

    res.status(200).json({
      success: true,
      message: 'Customer deactivated successfully',
      customer
    });
  } catch (error) {
    console.error('Error deactivating customer:', error);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'customer_deactivate',
      entity_id: CUST_ID,
      user_id: userId,
      action: 'deactivate_customer',
      old_value: null,
      new_value: null,
      ip_address: ipAddress,
      event_type: 'DEACTIVATE_ERROR',
      outcome: 'failure',
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate customer',
      error: error.message
    });
  }
};