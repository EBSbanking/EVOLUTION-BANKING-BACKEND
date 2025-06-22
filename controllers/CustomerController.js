import Customer from '../models/Customer.js';
import { generateCustomerNumber } from '../utils/generateCustomerNumber.js';
import moment from 'moment';
import NotificationService from '../services/NotificationService.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';
import { generateNumber } from '../utils/generateNumber.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';


const parseDate = (dateStr, format) => {
  if (!dateStr) return undefined;
  const m = moment(dateStr, format, true);
  return m.isValid() ? m.toDate() : undefined;
};

export const createCustomer = async (req, res) => {
  try {
    const {
      CUST_ID, CUST_NO, TITLE_ID, FIRST_NAME, MIDDLE_NAME, LAST_NAME, CUST_NM,
      HOME_ADDRESS, EMAIL_ADDRESS, BU_ID, MAIDEN_NM, BIRTH_DT, CNTRY_OF_BIRTH_ID,
      CUST_CAT, CAMPAIGN_ID, GENDER_TY, NATIONALITY_NO, COUNTRY_NM, STATE, LOCAL_GOV,
      OPENING_RSN_ID, OPENED_DT, RESIDENT_CNTRY_ID, RISK_CLASS, STMNT_FREQ_CD,
      STMNT_FREQ_VALUE, CREATED_BY, USER_ID, CREATE_DT, INDUSTRY_ID, INDUSTRY_CD,
      TAX_STATUS, MARITAL_ST, TAX_GRP_ID, OPERATIONS_CRNCY_ID, EMP_ST,
      ORGANISATION_NM, REGISTRATION_ADDRESS, REGISTRATION_DT, ALERT_DELIVERY_METHOD,
      KYC_LEVEL, PHONE_NO, SMS
    } = req.body;

    // Check for existing customer
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

    // Generate customer numbers if not provided
    const { paddedCUST_ID, paddedCUST_NO } = (CUST_ID && CUST_NO)
      ? { paddedCUST_ID: CUST_ID, paddedCUST_NO: CUST_NO }
      : generateCustomerNumber();

    const userId = USER_ID || CREATED_BY || 'SYSTEM';

    // Create customer with Pending status
    const newCustomer = new Customer({
      CUST_ID: paddedCUST_ID,
      CUST_NO: paddedCUST_NO,
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
      REC_ST: 'Pending', // Initial status
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

    // Create workflow item
    const { WORK_ITEM_ID, QUEUE_ID, SUB_PROC_ID, BUS_PROC_ID } = generateWorkflowIdentifiers();

    const workflowItem = new WF_WORK_ITEM({
      WORK_ITEM_ID,
      ITEM_VALUE: paddedCUST_NO,
      ITEM_DESC: `Customer Account Application for ${newCustomer.CUST_NM}`,
      ITEM_CLASS_NM: "Customer",
      ITEM_TYPE: "Customer",
      EVENT_ID: generateNumber(7),
      CUST_ID: paddedCUST_ID,
      REC_ST: "Pending", // Workflow status
      VERSION: 1,
      USER_ID: userId,
      BU_ID,
      CREATE_DT: new Date(),
      WAIT_ST: "Pending",
      ITEM_ID: generateNumber(4),
      ITEM_REF_NO: generateNumber(4),
      ORIGINATOR_USER_ROLE_ID: userId,
      QUEUE_ID,
      SUB_PROC_ID,
      BUS_PROC_ID,
      TARGET_USER_ROLE_ID: 'Manager' // Default approver role
    });

    await workflowItem.save();

    // Send notifications to approvers
    const notificationMessage = `New customer ${newCustomer.CUST_NM} (ID: ${paddedCUST_ID}) requires approval`;

    await NotificationService.send({
      ROLE_ID: workflowItem.TARGET_USER_ROLE_ID,
      message: `New customer ${newCustomer.CUST_NM} (ID: ${paddedCUST_ID}) requires approval`,
      WORK_ITEM_ID,
      CUST_ID: paddedCUST_ID
    });

    return res.status(201).json({
      message: 'Customer created and submitted for approval',
      customer: newCustomer,
      workflowItem,
      approvalUrl: `/api/customer/approve/${paddedCUST_ID}`
    });
  } catch (error) {
    console.error('Customer creation error:', error);
    return res.status(500).json({
      message: 'Failed to create customer',
      error: error.message
    });
  }
};

// Updated Approval endpoint with complete status updates
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

    // Update customer status
    customer.REC_ST = 'Active';
    customer.APPROVED_BY = approvedBy;
    customer.APPROVED_DT = new Date();
    await customer.save();

    // Update work item status
    const updateSuccess = await WF_WORK_ITEMController.updateWorkItemStatusOnApproval(
      'Customer',
      customer._id,
      approvedBy
    );

    if (!updateSuccess) {
      console.warn('Work item update failed for customer:', cleanCustId);
    }

    res.status(200).json({
      message: 'Customer approved successfully',
      customerId: customer.CUST_ID,
      customerName: customer.CUST_NM,
      status: customer.REC_ST,
      approvedBy,
      approvalDate: customer.APPROVED_DT
    });

  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({
      message: 'Failed to approve customer',
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


export const updateWorkflowStatus = async (req, res) => {
  try {
    const { WORK_ITEM_ID, newStatus } = req.body;

    if (!['Active', 'Pending'].includes(newStatus)) {
      return res.status(400).json({ message: 'Invalid status. Only "Active" or "Pending" are allowed.' });
    }

    const workflowItem = await WF_WORK_ITEM.findById(WORK_ITEM_ID);
    if (!workflowItem) {
      return res.status(404).json({ message: 'Workflow item not found.' });
    }

    workflowItem.REC_ST = newStatus;
    await workflowItem.save();

    if (newStatus === 'Active') {
      const customer = await Customer.findOne({ CUST_ID: workflowItem.CUST_ID });
      if (!customer) {
        return res.status(404).json({ message: 'Customer not found.' });
      }

      customer.REC_ST = 'Active';
      await customer.save();
    }

    res.status(200).json({
      message: 'Workflow and customer status updated successfully.',
      workflowItem,
    });
  } catch (error) {
    console.error('Error updating workflow status:', error);
    res.status(500).json({ message: 'Error updating workflow status', error: error.message });
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