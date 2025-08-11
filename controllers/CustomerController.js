import Customer from '../models/Customer.js';
import generateCustomerNumber from '../utils/generateCustomerNumber.js';
import moment from 'moment';
import mongoose from 'mongoose';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import { generateEventID, logAuditTrail } from '../utils/AuditLogger.js';
import NotificationService from '../services/NotificationService.js';

const parseDate = (dateStr, format) => {
  if (!dateStr) return undefined;
  const m = moment(dateStr, format, true);
  return m.isValid() ? m.toDate() : undefined;
};

export const createCustomer = async (req, res) => {
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
      REC_ST = 'Pending'
    } = req.body;

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!HOME_ADDRESS || !BU_ID) {
      return res.status(400).json({ message: 'HOME_ADDRESS and BU_ID are required.' });
    }

    if (NIN && !/^\d{11}$/.test(NIN)) {
      return res.status(400).json({ message: 'NATIONALITY_NO must be exactly 11 digits.' });
    }
     if (BVN && !/^\d{11}$/.test(BVN)) {
      return res.status(400).json({ message: 'BVN_NO must be exactly 11 digits.' });
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

   const { CUST_ID: generatedCUST_ID, CUST_NO: generatedCUST_NO } = await generateCustomerNumber();

    const finalCUST_ID = CUST_ID || generatedCUST_ID;
    const finalCUST_NO = CUST_NO || generatedCUST_NO;
    const userId = USER_ID || CREATED_BY || 'SYSTEM';
    const fullName = CUST_NM || `${FIRST_NAME ?? ''} ${MIDDLE_NAME ?? ''} ${LAST_NAME ?? ''}`.trim();
    const EVENT_ID = generateEventID();

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
      REC_ST,
      EVENT_ID
    };

    // Insert into MongoDB
    const result = await mongoose.connection.collection('customers').insertOne(customerData);
    customerData._id = result.insertedId;

    // Create Workflow Item using WF_WORK_ITEMController directly
    const workflowResult = await WF_WORK_ITEMController.submitTransaction({
      body: {
        ITEM_VALUE: finalCUST_NO,
        ITEM_DESC: `Customer Account Application for ${fullName}`,
        ITEM_CLASS_NM: 'Customer',
        ITEM_TYPE: 'Customer',
        ITEM_ID: result.insertedId,
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

    // Audit Log
    await logAuditTrail({
      EVENT_TYPE: 'CREATE',
      EVENT_ID,
      USER_ID: userId,
      ACTION: `Created customer ${finalCUST_NO}`,
      OLD_VALUE: null,
      NEW_VALUE: customerData,
      ipAddress
    });

    return res.status(201).json({
      message: 'Customer created and submitted for approval',
      insertedId: result.insertedId,
      workflowItem: workflowResult,
      approvalUrl: `/api/customer/approve/${finalCUST_ID}`,
      rejectionUrl: `/api/customer/reject/${finalCUST_ID}`,
      customerInfo: {
        CUST_ID: finalCUST_ID,
        CUST_NO: finalCUST_NO,
        CUST_NM: fullName
      }
    });

  } catch (error) {
    console.error('Create Customer Error:', error);
    return res.status(500).json({
      message: 'Failed to create customer',
      error: error.message
    });
  }
};


export const approveCustomer = async (req, res) => {
  try {
    console.log('=== Incoming Request ===');
    console.log('params:', req.params);
    console.log('body:', req.body);
    console.log('query:', req.query);

    // Normalize and validate input
    const rawCustomerId = req.params.customerId || req.body.customerId || req.query.customerId;
    const { approvedBy, USER_ID } = req.body;

    if (!rawCustomerId || typeof rawCustomerId !== 'string' || rawCustomerId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required and must be a non-empty string',
        received: {
          customerId: rawCustomerId || 'missing',
          approvedBy: approvedBy || 'missing'
        }
      });
    }

    const paddedCustomerId = rawCustomerId.padStart(10, '0'); // Ensure 10-digit CUST_ID
    console.log('🔍 Normalized Customer ID:', paddedCustomerId);

    if (!approvedBy || typeof approvedBy !== 'string' || approvedBy.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'approvedBy is required and must be a non-empty string',
        received: {
          customerId: paddedCustomerId,
          approvedBy: approvedBy || 'missing'
        }
      });
    }

    // Fetch customer
    const customer = await Customer.findOne({ CUST_ID: paddedCustomerId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found with given CUST_ID',
        attemptedCUST_ID: paddedCustomerId
      });
    }

    if (customer.REC_ST === 'Active') {
      return res.status(400).json({
        success: false,
        message: 'Customer is already approved and active',
        CUST_ID: customer.CUST_ID
      });
    }

    // Approve customer (set to Active)
    customer.REC_ST = 'Active'; 
    customer.approved_by = approvedBy;
    customer.approved_at = new Date();
    customer.UPDATED_BY = USER_ID || approvedBy;
    customer.UPDATED_AT = new Date();

    await customer.save();

    // Update workflow item if exists
    const workItem = await WF_WORK_ITEM.findOneAndUpdate(
      {
        ITEM_CLASS_NM: 'Customer',
        ITEM_VALUE: paddedCustomerId
      },
      {
        REC_ST: 'Completed',
        WAIT_ST: 'Approved',
        APPROVED_BY: approvedBy,
        APPROVED_DT: new Date(),
        COMPLETED_DT: new Date(),
        ACTION_TAKEN: 'Approved',
        UPDATED_AT: new Date(),
        UPDATED_BY: USER_ID || approvedBy
      },
      { new: true }
    );

    if (!workItem) {
      console.warn('⚠️ Workflow item not found for customer:', paddedCustomerId);
    }

    // Audit trail
    await logAuditTrail({
      action: 'Approve Customer',
      description: `Customer ${paddedCustomerId} approved and activated by ${approvedBy}`,
      userId: USER_ID || approvedBy,
      ipAddress: req.ip
    });

    return res.status(200).json({
      success: true,
      message: 'Customer approved successfully',
      data: {
        CUST_ID: paddedCustomerId,
        CUST_NM: customer.CUST_NM,
        status: customer.REC_ST, // Should return 'Active'
        workflowUpdated: !!workItem
      }
    });

  } catch (error) {
    console.error('❌ Approval Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during approval',
      error: error.message
    });
  }
};




export const rejectCustomer = async (req, res) => {
  const { customerId, rejectedBy, rejectionReason } = req.body;

  try {
    // Step 1: Reject the customer
    const customer = await Customer.findOneAndUpdate(
      { customer_id: customerId },
      {
        approval_status: 'REJECTED',
        REC_ST: 'INACTIVE',
        WAIT_ST: 'REJECTED',
        rejected_by: rejectedBy,
        rejected_at: new Date(),
        rejection_reason: rejectionReason,
        updated_at: new Date()
      },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Step 2: Update the workflow item
    const itemClass = 'CUSTOMER';

    const workItem = await WF_WORK_ITEM.findOneAndUpdate(
      { ITEM_CLASS_NM: itemClass, CUST_ID: String(customerId) },
      {
        REC_ST: 'Completed',
        WAIT_ST: 'Rejected',
        REJECTED_BY: rejectedBy,
        REJECTED_DT: new Date(),
        COMPLETED_DT: new Date(),
        ACTION_TAKEN: 'Rejected',
        UPDATED_AT: new Date()
      },
      { new: true }
    );

    if (!workItem) {
      return res.status(500).json({
        message: 'Customer rejected, but failed to update workflow item',
        error: 'Workflow item not found',
        debug: {
          customerId,
          itemClass
        }
      });
    }

    // Step 3: Return success
    return res.status(200).json({
      message: 'Customer rejected successfully',
      customer,
      workflowItem: workItem
    });

  } catch (error) {
    console.error('❌ Error in rejectCustomer:', error);
    return res.status(500).json({
      message: 'Failed to reject customer',
      error: error.message
    });
  }
};


export const getAllCustomer = async (req, res) => {
  try {
    const applications = await Customer.find();
    res.status(200).json(applications);
  } catch (error) {
    console.error('Error fetching customer account applications:', error);
    res.status(500).json({ message: 'Error fetching customer account applications', error: error.message });
  }
};

export const getCustomerById = async (req, res) => {
  try {
    let { CUST_ID } = req.params;

    if (!CUST_ID) {
      return res.status(400).json({ message: 'CUST_ID parameter is required' });
    }

    // Ensure CUST_ID is a string and is 10 digits (padding if necessary)
    CUST_ID = CUST_ID.toString().padStart(10, '0');

    const application = await Customer.findOne({ CUST_ID });

    if (!application) {
      return res.status(404).json({ message: `Customer with CUST_ID ${CUST_ID} not found` });
    }

    res.status(200).json(application);
  } catch (error) {
    console.error('Error fetching customer account application:', error);
    res.status(500).json({ message: 'Error fetching customer account application', error: error.message });
  }
};


// Example: CustomerController.js
export const getPendingCustomers = async (req, res) => {
  try {
    const pendingCustomers = await Customer.find({ REC_ST: 'Pending' });
    console.log('Found pending:', pendingCustomers.length);
    res.status(200).json(pendingCustomers);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving pending customers', error: error.message });
  }
};






export const updateCustomer = async (req, res) => {
  const { CUST_ID } = req.params;
  const updateFields = req.body;

  try {
    const customer = await Customer.findOne({ CUST_ID });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Update only existing fields on the schema
    Object.keys(updateFields).forEach((field) => {
      if (field in customer.toObject()) {
        customer[field] = updateFields[field];
      }
    });

    await customer.save();

    res.status(200).json({
      message: 'Customer updated successfully',
      updatedCustomer: customer
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({
      message: 'Failed to update customer',
      error: error.message
    });
  }
};


export const deactivateCustomer = async (req, res) => {
  const { CUST_ID } = req.params;

  try {
    const customer = await Customer.findOne({ CUST_ID });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    customer.REC_ST = 'Inactive';
    await customer.save();

    // Optional: update related work item status
    await WF_WORK_ITEMController.updateWorkItemStatusOnRejection(
      'CUSTOMER',
      CUST_ID,
      req.user?.username || 'System'
    );

    res.status(200).json({
      message: 'Customer deactivated successfully',
      customer
    });
  } catch (error) {
    console.error('Error deactivating customer:', error);
    res.status(500).json({
      message: 'Failed to deactivate customer',
      error: error.message
    });
  }
};
