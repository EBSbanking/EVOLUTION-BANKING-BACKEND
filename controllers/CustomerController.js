import Customer from '../models/Customer.js';
import { generateCustomerNumber } from '../utils/generateCustomerNumber.js';
import moment from 'moment';
import NotificationService from '../services/NotificationService.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';
import { generateNumber } from '../utils/generateNumber.js'; // Keep this import, remove local function


// Your existing generateCustomerNumber and generateWorkflowIdentifiers
// (Assuming you have these implemented somewhere and imported here)
const parseDate = (dateStr, format) => {
  if (!dateStr) return undefined;
  const m = moment(dateStr, format, true); // strict parsing
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

    // Check if a customer already exists with the same CUST_NO or EMAIL_ADDRESS
    const existingCustomer = await Customer.findOne({
      $or: [
        { CUST_NO },
        { EMAIL_ADDRESS },
      ]
    });

    if (existingCustomer) {
      return res.status(400).json({ message: 'Customer with this CUST_NO or EMAIL_ADDRESS already exists' });
    }

    // Generate customer numbers if not provided (example function assumed)
    const { paddedCUST_ID, paddedCUST_NO } = (CUST_ID && CUST_NO) 
      ? { paddedCUST_ID: CUST_ID, paddedCUST_NO: CUST_NO }
      : generateCustomerNumber();

    // Construct new customer object
    const newCustomer = new Customer({
      CUST_ID: paddedCUST_ID,
      CUST_NO: paddedCUST_NO,
      TITLE_ID,
      FIRST_NAME,
      MIDDLE_NAME,
      LAST_NAME,
      CUST_NM,
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
      REC_ST: 'Pending', // Default status
      CREATED_BY,
      USER_ID,
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

    // Save new customer
    await newCustomer.save();

    // Generate workflow identifiers
    const { WORK_ITEM_ID, QUEUE_ID, SUB_PROC_ID, BUS_PROC_ID } = generateWorkflowIdentifiers();

    // Create workflow item for approval process
    const workflowItemData = new WF_WORK_ITEM({
      WORK_ITEM_ID,
      ITEM_VALUE: paddedCUST_NO,
      ITEM_DESC: `Customer Account Application for ${CUST_NM || FIRST_NAME}`,
      ITEM_CLASS_NM: "Customer",
      EVENT_ID: generateNumber(7),
      CUST_ID: paddedCUST_ID,
      REC_ST: "Active",
      VERSION: 1,
      USER_ID,
      BU_ID,
      CREATE_DT: moment().toISOString(),
      WAIT_ST: "Pending",
      ITEM_ID: generateNumber(4),
      ITEM_REF_NO: generateNumber(4),
      ORIGINATOR_USER_ROLE_ID: USER_ID,
      QUEUE_ID,
      SUB_PROC_ID,
      BUS_PROC_ID,
    });

    await workflowItemData.save();

    // Notify roles
    const roles = ['Manager', 'Branch Operation Supervisor'];
    const message = `New customer application (ID: ${WORK_ITEM_ID}) requires your approval.`;

    for (const role of roles) {
      await NotificationService.send({
        ROLE_ID: role,
        message,
        WORK_ITEM_ID,
      });
    }

    return res.status(201).json({
      message: 'Customer Account Application created successfully and submitted for approval',
      status: 'Pending',
      customer: newCustomer,
      workflowItem: workflowItemData,
      workflowStatusUrl: `/api/workflow/${WORK_ITEM_ID}`,
    });

  } catch (error) {
    console.error('Error creating customer account application:', error);
    return res.status(500).json({ message: 'Error creating customer account application', error: error.message });
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

// Get customer by CUST_ID
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

// Update customer by CUST_ID
export const updateWorkflowStatus = async (req, res) => {
  try {
    const { WORK_ITEM_ID, newStatus } = req.body;

    // Validate the new status (ensure it's either 'Active' or 'Pending')
    if (!['Active', 'Pending'].includes(newStatus)) {
      return res.status(400).json({ message: 'Invalid status. Only "Active" or "Pending" are allowed.' });
    }

    // Find the corresponding workflow item
    const workflowItem = await WF_WORK_ITEM.findById(WORK_ITEM_ID);
    if (!workflowItem) {
      return res.status(404).json({ message: 'Workflow item not found.' });
    }

    // Update the workflow item status
    workflowItem.REC_ST = newStatus;
    await workflowItem.save();

    // If the workflow item is approved (status is 'Active'), update the customer status as well
    if (newStatus === 'Active') {
      const customer = await Customer.findOne({ CUST_ID: workflowItem.CUST_ID });
      if (!customer) {
        return res.status(404).json({ message: 'Customer not found.' });
      }

      // Update the customer status to 'Active'
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

// Deactivate customer account
export const deactivateCustomer = async (req, res) => {
  const { CUST_ID } = req.params;
  try {
    const application = await Customer.findOne({ CUST_ID: CUST_ID });
    if (!application) {
      return res.status(404).json({ message: 'Customer Account Application not found' });
    }

    application.REC_ST = 'Inactive';  // Soft delete or change status
    await application.save();

    res.status(200).json({ message: 'Customer Account Application deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating customer account application:', error);
    res.status(500).json({ message: 'Error deactivating customer account application', error: error.message });
  }
};
