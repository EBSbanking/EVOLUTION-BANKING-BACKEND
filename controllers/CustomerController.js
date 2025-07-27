import Customer from '../models/Customer.js';
import generateCustomerNumber from '../utils/generateCustomerNumber.js';
import moment from 'moment';
import { submitWorkflowItem } from '../Services/workflowService.js'; // ✅ imported workflow service
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';




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
      NATIONALITY_NO,
      COUNTRY_NM,
      STATE,
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
      SMS
    } = req.body;

    const existingCustomer = await Customer.findOne({
      $or: [
        { CUST_NO: CUST_NO || '' },
        { EMAIL_ADDRESS: EMAIL_ADDRESS || '' },
      ]
    });

    if (existingCustomer) {
      return res.status(400).json({
        message: 'Customer with this CUST_NO or EMAIL_ADDRESS already exists'
      });
    }

    if (NATIONALITY_NO && !/^\d{11}$/.test(NATIONALITY_NO)) {
      return res.status(400).json({
        message: 'NATIONALITY_NO must be exactly 11 digits.'
      });
    }

    // ✅ Call async generateCustomerNumber to get the latest from DB
    const { CUST_ID: generatedCUST_ID, CUST_NO: generatedCUST_NO } = await generateCustomerNumber();

    const finalCUST_ID = CUST_ID || generatedCUST_ID;
    const finalCUST_NO = CUST_NO || generatedCUST_NO;
    const userId = USER_ID || CREATED_BY || 'SYSTEM';

    const newCustomer = new Customer({
      CUST_ID: finalCUST_ID,
      CUST_NO: finalCUST_NO,
      TITLE_ID,
      FIRST_NAME,
      MIDDLE_NAME,
      LAST_NAME,
      CUST_NM: CUST_NM || `${FIRST_NAME} ${LAST_NAME}`.trim(),
      HOME_ADDRESS,
      EMAIL_ADDRESS,
      BU_ID,
      MAIDEN_NM,
      BIRTH_DT: parseDate(BIRTH_DT, "MM-DD-YYYY"),
      CNTRY_OF_BIRTH_ID: CNTRY_OF_BIRTH_ID || "NGA",
      CUST_CAT,
      CAMPAIGN_ID,
      GENDER_TY,
      NATIONALITY_NO,
      COUNTRY_NM: COUNTRY_NM || "Nigeria",
      STATE,
      LOCAL_GOV,
      OPENING_RSN_ID,
      OPENED_DT: parseDate(OPENED_DT, "MM-DD-YYYY"),
      RESIDENT_CNTRY_ID: RESIDENT_CNTRY_ID || "NGA",
      RISK_CLASS,
      STMNT_FREQ_CD,
      STMNT_FREQ_VALUE,
      REC_ST: 'Pending',
      CREATED_BY,
      USER_ID: userId,
      CREATE_DT: CREATE_DT ? new Date(CREATE_DT) : new Date(),
      INDUSTRY_ID,
      INDUSTRY_CD,
      TAX_STATUS,
      MARITAL_ST,
      TAX_GRP_ID,
      OPERATIONS_CRNCY_ID: OPERATIONS_CRNCY_ID || "NGN",
      EMP_ST,
      ORGANISATION_NM,
      REGISTRATION_ADDRESS,
      REGISTRATION_DT: parseDate(REGISTRATION_DT, "MM-DD-YYYY"),
      ALERT_DELIVERY_METHOD,
      KYC_LEVEL,
      PHONE_NO,
      SMS
    });

    await newCustomer.save();

    const workflowItem = await submitWorkflowItem({
      itemValue: finalCUST_NO,
      itemDesc: `Customer Account Application for ${newCustomer.CUST_NM}`,
      itemClass: 'Customer',
      itemType: 'Customer',
      itemId: newCustomer._id,
      custId: finalCUST_ID,
      buId: BU_ID,
      userId,
      homeAddress: HOME_ADDRESS,
      targetRole: 'Manager'
    });

    return res.status(201).json({
      message: 'Customer created and submitted for approval',
      customer: newCustomer,
      workflowItem,
      approvalUrl: `/api/customer/approve/${finalCUST_ID}`,
      rejectionUrl: `/api/customer/reject/${finalCUST_ID}`
    });

  } catch (error) {
    console.error('Customer creation error:', error);
    return res.status(500).json({
      message: 'Failed to create customer',
      error: error.message
    });
  }
};




// ✅ Approve Customer Controller
export const approveCustomer = async (req, res) => {
  try {
    const { custId } = req.params;
    const { approvedBy } = req.body;

    if (!custId || !approvedBy) {
      return res.status(400).json({
        message: 'Customer ID and approvedBy are required'
      });
    }

    const cleanCustId = String(custId).trim();
    const customer = await Customer.findOne({ CUST_ID: cleanCustId });

    if (!customer) {
      return res.status(404).json({ 
        message: 'Customer not found',
        searchedId: cleanCustId
      });
    }

    customer.REC_ST = 'Active';
    customer.APPROVED_BY = approvedBy;
    customer.APPROVED_DT = new Date();
    await customer.save();

    const updateResult = await WF_WORK_ITEMController.updateWorkItemStatusOnApproval(
      'Customer',
      customer.CUST_ID,
      approvedBy
    );

    res.status(200).json({
      message: 'Customer approved successfully',
      customerId: customer.CUST_ID,
      customerName: customer.CUST_NM,
      status: customer.REC_ST,
      approvedBy,
      approvalDate: customer.APPROVED_DT,
      workItemStatus: updateResult.success ? 'Updated' : 'Not updated',
      workItem: updateResult.data || null
    });

  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({
      message: 'Failed to approve customer',
      error: error.message
    });
  }
};

// ✅ Reject Customer Controller
export const rejectCustomer = async (req, res) => {
  try {
    const { custId } = req.params;
    const { approvedBy, rejectionReason } = req.body;

    if (!custId || !approvedBy || !rejectionReason) {
      return res.status(400).json({
        message: 'Customer ID, approvedBy, and rejectionReason are required'
      });
    }

    const cleanCustId = String(custId).trim().padStart(10, '0');
    const customer = await Customer.findOne({ CUST_ID: cleanCustId });

    if (!customer) {
      return res.status(404).json({ 
        message: 'Customer not found',
        searchedId: cleanCustId
      });
    }

    customer.REC_ST = 'Rejected';
    customer.REJECTED_BY = approvedBy;
    customer.REJECTED_DT = new Date();
    customer.REJECTION_REASON = rejectionReason;
    await customer.save();

    const updateResult = await WF_WORK_ITEMController.updateWorkItemStatusOnRejection(
      'Customer',
      customer.CUST_ID,
      approvedBy,
      rejectionReason
    );

    res.status(200).json({
      message: 'Customer rejected successfully',
      customerId: customer.CUST_ID,
      customerName: customer.CUST_NM,
      status: customer.REC_ST,
      rejectedBy: approvedBy,
      rejectionDate: customer.REJECTED_DT,
      rejectionReason: customer.REJECTION_REASON,
      workItemStatus: updateResult.success ? 'Updated' : 'Not updated',
      workItem: updateResult.data || null
    });

  } catch (error) {
    console.error('Rejection error:', error);
    res.status(500).json({
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
  const { CUST_ID } = req.params;
  try {
    const application = await Customer.findOne({ CUST_ID: CUST_ID });
    if (!application) {
      return res.status(404).json({ message: 'Customer Account Application not found' });
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
    res.status(200).json(pendingCustomers);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving pending customers', error: error.message });
  }
};




// 🟢 Approve a work item
export const updateWorkItemStatusOnApproval = async (itemClass, itemId, approvedBy) => {
  try {
    const workItem = await WF_WORK_ITEM.findOneAndUpdate(
      { ITEM_CLASS_NM: itemClass, ITEM_ID: itemId },
      {
        REC_ST: 'Completed',
        WAIT_ST: 'Approved',
        APPROVED_BY: approvedBy,
        APPROVED_DT: new Date(),
        COMPLETED_DT: new Date(),
        ACTION_TAKEN: 'Approved',
        UPDATED_AT: new Date()
      },
      { new: true }
    );
    return { success: !!workItem, data: workItem };
  } catch (error) {
    console.error('❌ Error updating work item on approval:', error);
    return { success: false, error: error.message };
  }
};

// 🔴 Reject a work item
export const updateWorkItemStatusOnRejection = async (itemClass, itemId, rejectedBy) => {
  try {
    const workItem = await WF_WORK_ITEM.findOneAndUpdate(
      { ITEM_CLASS_NM: itemClass, ITEM_ID: itemId },
      {
        REC_ST: 'Rejected',
        WAIT_ST: 'Rejected',
        COMPLETED_BY: rejectedBy,
        COMPLETED_DT: new Date(),
        ACTION_TAKEN: 'Rejected',
        UPDATED_AT: new Date()
      },
      { new: true }
    );
    return { success: !!workItem, data: workItem };
  } catch (error) {
    console.error('❌ Error updating work item on rejection:', error);
    return { success: false, error: error.message };
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

    // Apply updates
    Object.keys(updateFields).forEach(field => {
      customer[field] = updateFields[field];
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
    const application = await Customer.findOne({ CUST_ID: CUST_ID });
    if (!application) {
      return res.status(404).json({ message: 'Customer Account Application not found' });
    }

    application.REC_ST = 'Inactive';
    await application.save();

    res.status(200).json({ message: 'Customer Account Application deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating customer account application:', error);
    res.status(500).json({ message: 'Error deactivating customer account application', error: error.message });
  }
};