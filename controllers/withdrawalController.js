import mongoose from 'mongoose';
import CashWithdrawalTransaction from '../models/CashWithdrawalTransaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import TransactionPolicy from '../models/TransactionPolicy.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import NotificationService from '../services/NotificationService.js';
import moment from 'moment';

// Helper function to generate random numbers for workflow items
const generateNumber = (length) => Math.random().toString().slice(2, 2 + length).padStart(length, '0');

// Helper function to generate a random 18-digit transaction reference number
const generateTransactionRefNo = () => {
  const serialPrefix = 'TRX';
  const randomDigits = Math.floor(Math.random() * 1e18); // 18-digit number
  return `${serialPrefix}${randomDigits}`;
};

// Controllers
export const createWithdrawalTransaction = async (req, res) => {
  console.log('Received Request Body:', req.body);

  // Extract values from the request body
  const {
    VALUE_DATE, WITHDRAWER_NAME, ACCT_NO, ACCT_NM, amount, TOTAL_CHARGES = 0, ROLE_NAME,
    USER_ID, CUST_ID, BUSINESS_UNIT, SOURCE_OF_FUNDS, DESCRIPTION = '', CURRENCY_COUNT = {},
    TOTAL_CURRENCY_COUNT = 0, EVENT_ID
  } = req.body;

  // Validation
  if (!ROLE_NAME || !ACCT_NO || !ACCT_NM || !BUSINESS_UNIT || !VALUE_DATE || !SOURCE_OF_FUNDS || !amount) {
    return res.status(400).json({ message: 'All required fields must be provided.' });
  }

  if (amount <= 0) {
    return res.status(400).json({ message: 'Amount must be a positive number.' });
  }

  // Fetch transaction policy based on ROLE_NAME
  const policy = await TransactionPolicy.findOne({ ROLE_NAME });
  if (!policy) {
    return res.status(403).json({ message: `No transaction policy found for role: ${ROLE_NAME}` });
  }

  // Check if the transaction exceeds the max allowed amount
  if (amount > policy.MAX_AMOUNT) {
    // Generate WORK_ITEM_ID and EVENT_ID for workflow approval
    const WORK_ITEM_ID = Math.floor(Math.random() * 1000000); // Randomly generated WORK_ITEM_ID
    const EVENT_ID = Math.floor(Math.random() * 10000000); // Randomly generated EVENT_ID
    const WAIT_ST = 'Pending';
    const REC_ST_WORKFLOW = 'Active';

    // Create workflow item data (for approval process)
    const workflowItemData = new WF_WORK_ITEM({
      WORK_ITEM_ID,
      ITEM_VALUE: amount.toString(),
      ITEM_DESC: `Transaction of amount ${amount} requires approval`,
      ITEM_CLASS_NM: 'Transaction',
      EVENT_ID,
      REC_ST: REC_ST_WORKFLOW,
      VERSION: 1,
      USER_ID,
      BU_ID: BUSINESS_UNIT,
      CUST_ID: Number(CUST_ID),
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

    // Send notification to authorized roles for approval
    const roles = policy.AUTHORIZED_ROLES;
    const message = `Transaction (ID: ${WORK_ITEM_ID}) of amount ${amount} requires your approval.`;
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
      transactionDetails: {
        ROLE_NAME,
        USER_ID,
        CUST_ID: Number(CUST_ID),
        ACCT_NO,
        ACCT_NM,
        amount,
        TOTAL_CHARGES,
        VALUE_DATE,
        WITHDRAWER_NAME,
        BUSINESS_UNIT,
        SOURCE_OF_FUNDS,
        DESCRIPTION,
        CURRENCY_COUNT,
        TOTAL_CURRENCY_COUNT,
        TRANSACTION_REF_NO: generateTransactionRefNo(),
      },
    });
  }

  // If the amount is less than or equal to the max amount, proceed with the transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find account information
    const account = await CustomerAccount.findOne({ ACCT_NO }).session(session);
    if (!account) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const balanceBeforeTransaction = parseFloat(account.AVAILABLE_BALANCE);
    const finalAmount = amount + parseFloat(TOTAL_CHARGES);

    // Check for sufficient balance
    if (balanceBeforeTransaction < finalAmount) {
      return res.status(400).json({ message: 'Insufficient funds for the transaction.' });
    }

    // Update the account balances
    const newBalance = balanceBeforeTransaction - finalAmount;
    const transactionRefNo = generateTransactionRefNo();

    // Create the new withdrawal transaction
    const newTransaction = new CashWithdrawalTransaction({
      CUST_ID: Number(CUST_ID),
      ACCT_ID: account.ACCT_ID,
      ACCT_NO,
      ACCT_NM,
      amount,
      TOTAL_CHARGES,
      VALUE_DATE,
      WITHDRAWER_NAME,
      BUSINESS_UNIT,
      DESCRIPTION,
      SOURCE_OF_FUNDS,
      CURRENCY_COUNT,
      TOTAL_CURRENCY_COUNT,
      TRANSACTION_REF_NO: transactionRefNo,
      BALANCE_BEFORE_TRANSACTION: balanceBeforeTransaction,
      BALANCE_AFTER_TRANSACTION: newBalance,
      WORK_ITEM_ID: Math.floor(Math.random() * 1000000), // Generate WORK_ITEM_ID here as well
      transactionStatus: 'Completed',
    });

    const savedTransaction = await newTransaction.save({ session });

    // Update the account balances in the database
    account.LEDGER_BAL -= finalAmount;
    account.CLEARED_BAL -= finalAmount;
    account.AVAILABLE_BALANCE -= finalAmount;

    await account.save({ session });
    await session.commitTransaction();

    // Respond with the transaction details
    res.status(201).json({
      message: 'Transaction created successfully',
      transaction: savedTransaction,
      generatedTransactionRefNo: transactionRefNo,
      transactionDetails: {
        ROLE_NAME,
        USER_ID,
        CUST_ID: Number(CUST_ID),
        ACCT_NO,
        ACCT_NM,
        amount,
        TOTAL_CHARGES,
        VALUE_DATE,
        WITHDRAWER_NAME,
        BUSINESS_UNIT,
        SOURCE_OF_FUNDS,
        DESCRIPTION,
        CURRENCY_COUNT,
        TOTAL_CURRENCY_COUNT,
        TRANSACTION_REF_NO: transactionRefNo,
        WORK_ITEM_ID: savedTransaction.WORK_ITEM_ID, // Include WORK_ITEM_ID in response
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error during transaction:', error);
    res.status(500).json({ message: 'Error creating transaction', error: error.message });
  } finally {
    session.endSession();
  }
};



export const getPendingApprovals = async (req, res) => {
  try {
    const { CUST_ID, USER_ID } = req.query;

    if (!CUST_ID || !USER_ID) {
      return res.status(400).json({ message: 'CUST_ID and USER_ID are required' });
    }

    // Fetch the first pending approval for the given CUST_ID and USER_ID
    const pendingApproval = await WF_WORK_ITEM.findOne({ CUST_ID, USER_ID, WAIT_ST: 'Pending' });

    if (!pendingApproval) {
      return res.status(404).json({ message: 'No pending approvals found for the given CUST_ID and USER_ID.' });
    }

    const WORK_ITEM_ID = pendingApproval.WORK_ITEM_ID;

    // Fetch all pending approvals related to this WORK_ITEM_ID
    const pendingApprovals = await WF_WORK_ITEM.find({ WORK_ITEM_ID, WAIT_ST: 'Pending' });

    const formattedApprovals = pendingApprovals.map((approval) => {
      let itemValue = approval.ITEM_VALUE;

      // Convert Buffer to JSON if needed
      if (Buffer.isBuffer(itemValue)) {
        try {
          itemValue = JSON.parse(itemValue.toString());
        } catch (err) {
          console.error('Error parsing buffer:', err);
          itemValue = {}; // Fallback if parsing fails
        }
      }

      return {
        transactionDetails: {
          ROLE_NAME: approval.ROLE_NAME || null,
          USER_ID: req.query.USER_ID || 'N/A',
          CUST_ID: Number(approval.CUST_ID) || null,
          ACCT_NO: approval.ACCT_NO || itemValue?.ACCT_NO || null,
          ACCT_NM: approval.ACCT_NM || itemValue?.ACCT_NM || null,
          amount: approval.amount || itemValue?.amount || 0,
          TOTAL_CHARGES: approval.TOTAL_CHARGES || itemValue?.TOTAL_CHARGES || 0,
          VALUE_DATE: approval.VALUE_DATE || itemValue?.VALUE_DATE || null,
          WITHDRAWER_NAME: approval.WITHDRAWER_NAME || itemValue?.WITHDRAWER_NAME || null,
          BUSINESS_UNIT: approval.BUSINESS_UNIT || itemValue?.BUSINESS_UNIT || null,
          SOURCE_OF_FUNDS: approval.SOURCE_OF_FUNDS || itemValue?.SOURCE_OF_FUNDS || null,
          DESCRIPTION: approval.DESCRIPTION || itemValue?.DESCRIPTION || null,
          CURRENCY_COUNT: approval.CURRENCY_COUNT || itemValue?.CURRENCY_COUNT || 0,
          TOTAL_CURRENCY_COUNT: approval.TOTAL_CURRENCY_COUNT || itemValue?.TOTAL_CURRENCY_COUNT || 0,
          TRANSACTION_REF_NO: approval.TRANSACTION_REF_NO || itemValue?.TRANSACTION_REF_NO || null,
        },
      };
    });

    res.status(200).json({
      message: 'Pending approvals retrieved successfully.',
      pendingApprovals: formattedApprovals,
    });
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ message: 'Error fetching pending approvals', error: error.message });
  }
};



export const processApprovedWorkflowItem = async (req, res) => {
  try {
    const { WORK_ITEM_ID } = req.params;

    const workflowItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID });

    if (!workflowItem) {
      return res.status(404).json({ message: 'Workflow item not found.' });
    }

    if (workflowItem.WAIT_ST !== 'Approved') {
      return res.status(400).json({ message: 'Workflow item is not approved yet.' });
    }

    const { ITEM_VALUE: amount, CUST_ID, BU_ID: BUSINESS_UNIT, ITEM_DESC: DESCRIPTION } = workflowItem;
    const account = await CustomerAccount.findOne({ CUST_ID });

    if (!account) {
      return res.status(404).json({ message: 'Customer account not found.' });
    }

    const balanceBeforeTransaction = parseFloat(account.AVAILABLE_BALANCE);
    const finalAmount = parseFloat(amount);

    if (balanceBeforeTransaction < finalAmount) {
      return res.status(400).json({ message: 'Insufficient funds for the transaction.' });
    }

    const newBalance = balanceBeforeTransaction - finalAmount;
    const transactionRefNo = generateTransactionRefNo();

    const newTransaction = new CashWithdrawalTransaction({
      CUST_ID: Number(CUST_ID),
      ACCT_ID: account.ACCT_ID,
      ACCT_NO: account.ACCT_NO,
      ACCT_NM: account.ACCT_NM,
      amount: finalAmount,
      TOTAL_CHARGES: 0, // Assuming no charges for simplicity
      VALUE_DATE: new Date().toISOString(),
      WITHDRAWER_NAME: 'System', // Workflow-driven
      BUSINESS_UNIT,
      DESCRIPTION,
      SOURCE_OF_FUNDS: 'Workflow Approval',
      CURRENCY_COUNT: {}, // Assuming no currency breakdown
      TOTAL_CURRENCY_COUNT: 0,
      TRANSACTION_REF_NO: transactionRefNo,
      BALANCE_BEFORE_TRANSACTION: balanceBeforeTransaction,
      BALANCE_AFTER_TRANSACTION: newBalance,
    });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const savedTransaction = await newTransaction.save({ session });

      account.LEDGER_BAL -= finalAmount;
      account.CLEARED_BAL -= finalAmount;
      account.AVAILABLE_BALANCE -= finalAmount;

      await account.save({ session });

      workflowItem.REC_ST = 'Completed';
      await workflowItem.save({ session });

      await session.commitTransaction();

      res.status(201).json({
        message: 'Transaction processed successfully',
        transaction: savedTransaction,
        workflowItem,
      });
    } catch (error) {
      await session.abortTransaction();
      console.error('Error processing transaction:', error);
      res.status(500).json({ message: 'Error processing transaction', error: error.message });
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Error processing workflow item:', error);
    res.status(500).json({ message: 'Error processing workflow item', error: error.message });
  }
};

export const createCustomerAccounts = async (req, res) => {
  const customerAccounts = req.body;

  for (const accountData of customerAccounts) {
    if (!accountData.CUST_ID) {
      return res.status(400).json({ message: 'CUST_ID is required for all accounts.' });
    }
  }

  try {
    customerAccounts.forEach(account => {
      console.log(`Creating account: ${account.ACCT_NO} for customer ${account.ACCT_NM}`);
    });

    const accountsToInsert = customerAccounts.map(account => ({
      ACCT_ID: account.ACCT_ID,
      ACCT_NO: account.ACCT_NO,
      ACCT_NM: account.ACCT_NM,
      BU_ID: account.BU_ID,
      GL_ACCT_NO: account.GL_ACCT_NO,
      LEDGER_BAL: account.LEDGER_BAL,
      CLEARED_BAL: account.CLEARED_BAL,
      AVAILABLE_BALANCE: account.AVAILABLE_BALANCE,
      ACCOUNT_TYPE: account.ACCOUNT_TYPE,
      PRODUCT_DESC: account.PRODUCT_DESC,
      REC_ST: account.REC_ST,
      CUST_ID: account.CUST_ID,
    }));

    const createdAccounts = await CustomerAccount.insertMany(accountsToInsert);
    res.status(201).json({ message: 'Accounts created successfully', accounts: createdAccounts });
  } catch (error) {
    console.error('Error creating accounts:', error);
    res.status(500).json({ message: 'Error creating accounts', error: error.message });
  }
};

// Controller function to get a workflow item by ID
export const getWorkflowItemWithTransaction = async (req, res) => {
  try {
    const { workItemId } = req.params;

    console.log(`Fetching workflow item with ID: ${workItemId}`);

    // Fetch the workflow item from the database
    const workflowItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID: workItemId });

    if (!workflowItem) {
      console.log(`Workflow item with ID: ${workItemId} not found.`);
      return res.status(404).json({ message: 'Workflow item not found' });
    }

    console.log(`Workflow item found:`, workflowItem);

    // Fetch the associated transaction using the workflow item ID
    const transaction = await CashWithdrawalTransaction.findOne({ WORK_ITEM_ID: workItemId });
    console.log(`Transaction query result for WORK_ITEM_ID ${workItemId}:`, transaction);

    if (!transaction) {
      console.log(`No transaction found for workflow item ID: ${workItemId}`);
      return res.status(404).json({
        message: `Workflow item found, but no associated transaction exists for WORK_ITEM_ID: ${workItemId}`,
        workflowItem: {
          WORK_ITEM_ID: workflowItem.WORK_ITEM_ID,
          DESCRIPTION: workflowItem.DESCRIPTION || 'No description available',
          STATUS: workflowItem.STATUS || 'Unknown',
          createdAt: workflowItem.CREATE_DT || workflowItem.SYS_CREATE_TS,
        },
      });
    }

    console.log(`Associated transaction found:`, transaction);

    // Respond with the workflow item and associated transaction
    res.status(200).json({
      workflowItem: {
        WORK_ITEM_ID: workflowItem.WORK_ITEM_ID,
        DESCRIPTION: workflowItem.DESCRIPTION || 'No description available',
        STATUS: workflowItem.STATUS || 'Unknown',
        createdAt: workflowItem.CREATE_DT || workflowItem.SYS_CREATE_TS,
      },
      transaction: {
        CUST_ID: transaction.CUST_ID,
        ACCT_ID: transaction.ACCT_ID,
        ACCT_NO: transaction.ACCT_NO,
        ACCT_NM: transaction.ACCT_NM,
        amount: transaction.amount,
        TOTAL_CHARGES: transaction.TOTAL_CHARGES,
        VALUE_DATE: transaction.VALUE_DATE,
        WITHDRAWER_NAME: transaction.WITHDRAWER_NAME,
        BUSINESS_UNIT: transaction.BUSINESS_UNIT,
        DESCRIPTION: transaction.DESCRIPTION,
        SOURCE_OF_FUNDS: transaction.SOURCE_OF_FUNDS,
        WORK_ITEM_ID: transaction.WORK_ITEM_ID,
        TRANSACTION_REF_NO: transaction.TRANSACTION_REF_NO,
      },
    });
  } catch (error) {
    console.error('Error fetching workflow item:', error);
    res.status(500).json({ message: 'Error fetching workflow item', error: error.message });
  }
};



// Controller function to get transaction by reference number
export const getTransactionByRefNo = async (req, res) => {
  try {
    const { refNo } = req.params;

    // Fetch transaction using the TRANSACTION_REF_NO
    const transaction = await CashWithdrawalTransaction.findOne({ TRANSACTION_REF_NO: refNo });

    if (transaction) {
      res.status(200).json(transaction);
    } else {
      res.status(404).json({ message: 'Transaction not found' });
    }
  } catch (error) {
    console.error('Error fetching transaction by reference number:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getTransactionsByAcctNoOrWorkItemId = async (req, res) => {
  try {
    const { acctNoOrWorkItemId } = req.params;

    // Build query: check if the parameter is an account number or work item ID
    const isAcctNo = /^\d{8}$/.test(acctNoOrWorkItemId); // Example regex for an 8-digit account number
    const query = isAcctNo
      ? { ACCT_NO: acctNoOrWorkItemId }
      : { WORK_ITEM_ID: acctNoOrWorkItemId };

    console.log('Query:', query);

    // Fetch transactions
    const transactions = await CashWithdrawalTransaction.find(query);

    if (transactions.length > 0) {
      res.status(200).json(transactions);
    } else {
      res.status(404).json({ message: 'No transactions found for the provided criteria.' });
    }
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: error.message });
  }
};


// Controller function to reject a workflow item
export const rejectWorkflowItem = async (req, res) => {
  try {
    const { workItemId } = req.params;
    const { rejectionReason } = req.body;

    // Find the workflow item by ID
    const workflowItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID: workItemId });

    if (!workflowItem) {
      return res.status(404).json({ message: 'Workflow item not found.' });
    }

    if (workflowItem.WAIT_ST !== 'Pending') {
      return res.status(400).json({ message: 'Workflow item is not pending approval.' });
    }

    // Update the workflow item status to "Rejected"
    workflowItem.WAIT_ST = 'Rejected';
    workflowItem.REC_ST = 'Completed';
    workflowItem.REJECTION_REASON = rejectionReason || 'No reason provided';
    workflowItem.REJECTED_DT = new Date().toISOString();

    await workflowItem.save();

    // Optionally, send a notification to the originator
    await NotificationService.send({
      ROLE_ID: workflowItem.ORIGINATOR_USER_ROLE_ID,
      message: `Transaction (ID: ${workItemId}) has been rejected. Reason: ${workflowItem.REJECTION_REASON}`,
      WORK_ITEM_ID: workItemId,
    });

    res.status(200).json({
      message: `Workflow item ${workItemId} has been rejected successfully.`,
      workflowItem,
    });
  } catch (error) {
    console.error('Error rejecting workflow item:', error);
    res.status(500).json({ message: 'Error rejecting workflow item', error: error.message });
  }
};

export const getAllWithdrawalTransactions = async (req, res) => {
  try {
    // Extract WORK_ITEM_ID from the query params (if available)
    const { WORK_ITEM_ID } = req.query;

    // Define the query filter for transactions
    let filter = {};

    // If WORK_ITEM_ID is provided in the query, use it to filter the results
    if (WORK_ITEM_ID) {
      filter.WORK_ITEM_ID = WORK_ITEM_ID;
    }

    // Query the database for transactions using the filter
    const transactions = await CashWithdrawalTransaction.find(filter);

    // If no transactions are found
    if (transactions.length === 0) {
      return res.status(404).json({ message: `No withdrawal transactions found for WORK_ITEM_ID: ${WORK_ITEM_ID || 'all'}` });
    }

    // If transactions are found, return them
    res.status(200).json({
      message: 'Withdrawal transactions retrieved successfully.',
      transactions,
    });
  } catch (error) {
    console.error('Error fetching withdrawal transactions:', error);
    res.status(500).json({ message: 'Error fetching withdrawal transactions', error: error.message });
  }
};
