import TransactionPolicy from '../models/TransactionPolicy.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import NotificationService from '../services/NotificationService.js';// Assuming you have a Notification Service
import moment from 'moment';


// Controller to validate and handle transactions based on policies
export const validateTransaction = async (req, res) => {
    const { ROLE_NM, AMOUNT, USER_ID, BU_ID, CUST_ID } = req.body; // Include CUST_ID
  
    if (!ROLE_NM || !AMOUNT || !USER_ID || !BU_ID || !CUST_ID) {
      return res.status(400).json({
        message: 'ROLE_NM, AMOUNT, USER_ID, BU_ID, and CUST_ID are required.',
      });
    }
  
    try {
      // Fetch the policy for the given role
      const policy = await TransactionPolicy.findOne({ ROLE_NM });
  
      if (!policy) {
        return res.status(403).json({ message: `No transaction policy found for role: ${ROLE_NM}` });
      }
  
      // Validate transaction amount based on policy limits
      if (AMOUNT < policy.MIN_AMOUNT) {
        return res.status(400).json({ message: `Transaction amount is below the minimum allowed for ${ROLE_NM}.` });
      }
  
      if (AMOUNT <= policy.MAX_AMOUNT) {
        return res.status(200).json({
          message: 'Transaction approved.',
          transactionStatus: 'Approved',
        });
      }
  
      if (AMOUNT > policy.MAX_AMOUNT) {
        // Transaction exceeds maximum limit; requires authorization
  
        const WORK_ITEM_ID = generateNumber(6);
        const EVENT_ID = generateNumber(7);
        const WAIT_ST = 'Pending';
        const REC_ST_WORKFLOW = 'Active';
  
        // Create a new workflow item, now including CUST_ID
        const workflowItemData = new WF_WORK_ITEM({
          WORK_ITEM_ID,
          ITEM_VALUE: AMOUNT.toString(),
          ITEM_DESC: `Transaction of amount ${AMOUNT} requires approval`,
          ITEM_CLASS_NM: 'Transaction',
          EVENT_ID,
          REC_ST: REC_ST_WORKFLOW,
          VERSION: 1,
          USER_ID,
          BU_ID,
          CUST_ID, // Add CUST_ID here
          CREATE_DT: new Date().toISOString(),
          WAIT_ST,
          ITEM_ID: generateNumber(4),
          ITEM_REF_NO: generateNumber(4),
          ORIGINATOR_USER_ROLE_ID: USER_ID,
          QUEUE_ID: generateNumber(4),
          SUB_PROC_ID: generateNumber(4),
          BUS_PROC_ID: generateNumber(4),
        });
  
        await workflowItemData.save();
  
        const roles = policy.AUTHORIZED_ROLES;
        const message = `Transaction (ID: ${WORK_ITEM_ID}) of amount ${AMOUNT} requires your approval.`;
  
        for (const role of roles) {
          await NotificationService.send({
            ROLE_ID: role,
            message,
            WORK_ITEM_ID,
          });
        }
  
        return res.status(403).json({
          message: 'Transaction requires approval from authorized roles.',
          transactionStatus: 'Pending Authorization',
          workflowItem: workflowItemData,
          workflowStatusUrl: `/api/workflow/${WORK_ITEM_ID}`,
        });
      }
    } catch (error) {
      res.status(500).json({
        message: 'Error validating transaction.',
        error: error.message,
      });
    }
  };
  

// Helper function to generate random numbers for workflow items
const generateNumber = (length) => Math.random().toString().slice(2, 2 + length).padStart(length, '0');

// Controller to validate and handle transactions based on policies (alternate version)
export const validateTransactionSimple = async (req, res) => {
  const { ROLE_NM, AMOUNT } = req.body;

  if (!ROLE_NM || !AMOUNT) {
    return res.status(400).json({ message: 'ROLE_NAME and AMOUNT are required.' });
  }

  try {
    // Fetch the policy for the given role
    const policy = await TransactionPolicy.findOne({ ROLE_NM });

    if (!policy) {
      return res.status(403).json({ message: `No transaction policy found for role: ${ROLE_NM}` });
    }

    // Validate transaction amount based on policy limits
    if (AMOUNT < policy.MIN_AMOUNT) {
      return res.status(400).json({ message: `Transaction amount is below the minimum allowed for ${ROLE_NM}.` });
    }

    if (AMOUNT <= policy.MAX_AMOUNT) {
      // Transaction is within allowed limits; proceed with processing
      return res.status(200).json({
        message: 'Transaction approved.',
        transactionStatus: 'Approved',
      });
    }

    if (AMOUNT > policy.MAX_AMOUNT) {
      // Transaction exceeds maximum limit; requires authorization
      return res.status(403).json({
        message: `Transaction requires approval from authorized roles.`,
        transactionStatus: 'Pending Authorization',
        authorizedRoles: policy.AUTHORIZED_ROLES,
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error validating transaction.', error: error.message });
  }
};

// Controller to get all policies
export const getAllPolicies = async (req, res) => {
  try {
    const policies = await TransactionPolicy.find();
    res.status(200).json(policies);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching policies.', error: error.message });
  }
};

// Controller to get a specific policy by role
export const getPolicyByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const policy = await TransactionPolicy.findOne({ ROLE_NM: role });

    if (!policy) {
      return res.status(404).json({ message: `No policy found for role: ${role}` });
    }

    res.status(200).json(policy);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching policy.', error: error.message });
  }
};

// Example addOrUpdatePolicy function
export const addOrUpdatePolicy = async (req, res) => {
    const { ROLE_NM, MIN_AMOUNT, MAX_AMOUNT, AUTHORIZED_ROLES } = req.body;
  
    if (!ROLE_NM || !MIN_AMOUNT || !MAX_AMOUNT || !AUTHORIZED_ROLES) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
  
    try {
      let policy = await TransactionPolicy.findOne({ ROLE_NM });
  
      if (policy) {
        // Update existing policy
        policy.MIN_AMOUNT = MIN_AMOUNT;
        policy.MAX_AMOUNT = MAX_AMOUNT;
        policy.AUTHORIZED_ROLES = AUTHORIZED_ROLES;
      } else {
        // Create new policy
        policy = new TransactionPolicy({
          ROLE_NM,
          MIN_AMOUNT,
          MAX_AMOUNT,
          AUTHORIZED_ROLES,
        });
      }
  
      await policy.save();
      res.status(200).json({ message: 'Policy added or updated successfully.', policy });
    } catch (error) {
      res.status(500).json({ message: 'Error adding or updating policy.', error: error.message });
    }
  };
  
