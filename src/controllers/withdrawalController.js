// controllers/cashWithdrawalController.js
import CashWithdrawalTransaction from '../models/CashWithdrawalTransaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import TransactionPolicy from '../models/TransactionPolicy.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import NotificationService from '../Services/NotificationService.js';
import sequelize  from '../../config/db.js'; // Import your sequelize instance

// Helper function to generate random numbers
const generateNumber = (length) => Math.random().toString().slice(2, 2 + length).padStart(length, '0');

// Generate 18-digit transaction reference number
const generateTransactionRefNo = () => {
  const serialPrefix = 'TRX';
  const randomDigits = Math.floor(Math.random() * 1e15); // Safe for JS (max ~9e15 accurate)
  return `${serialPrefix}${String(randomDigits).padStart(15, '0')}`;
};

export const createWithdrawalTransaction = async (req, res) => {
  console.log('Received Request Body:', req.body);

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

  // Fetch transaction policy
  const policy = await TransactionPolicy.findOne({ where: { ROLE_NAME } });
  if (!policy) {
    return res.status(403).json({ message: `No transaction policy found for role: ${ROLE_NAME}` });
  }

  // Check if amount exceeds policy limit
  if (amount > policy.MAX_AMOUNT) {
    const WORK_ITEM_ID = Math.floor(Math.random() * 1000000);
    const EVENT_ID = Math.floor(Math.random() * 10000000);

    const workflowItem = await WF_WORK_ITEM.create({
      WORK_ITEM_ID,
      ITEM_VALUE: amount.toString(),
      ITEM_DESC: `Transaction of amount ${amount} requires approval`,
      ITEM_CLASS_NM: 'Transaction',
      EVENT_ID,
      REC_ST: 'Active',
      VERSION: 1,
      USER_ID,
      BU_ID: BUSINESS_UNIT,
      CUST_ID: Number(CUST_ID),
      CREATE_DT: new Date(),
      WAIT_ST: 'Pending',
      ITEM_ID: generateNumber(4),
      ITEM_REF_NO: generateNumber(4),
      ORIGINATOR_USER_ROLE_ID: USER_ID,
      QUEUE_ID: generateNumber(4),
      SUB_PROC_ID: generateNumber(4),
      BUS_PROC_ID: generateNumber(4),
    });

    // Send notifications
    for (const role of policy.AUTHORIZED_ROLES) {
      await NotificationService.send({
        ROLE_ID: role,
        message: `Transaction (ID: ${WORK_ITEM_ID}) of amount ${amount} requires your approval.`,
        WORK_ITEM_ID,
      });
    }

    return res.status(403).json({
      message: 'Transaction requires approval from authorized roles.',
      transactionStatus: 'Pending Authorization',
      workflowItem,
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

  // Proceed with transaction (within limit)
  const t = await sequelize.transaction();

  try {
    const account = await CustomerAccount.findOne({
      where: { account_number: ACCT_NO },
      transaction: t,
    });

    if (!account) {
      await t.rollback();
      return res.status(404).json({ message: 'Account not found.' });
    }

    const balanceBeforeTransaction = parseFloat(account.AVAILABLE_BALANCE || 0);
    const finalAmount = amount + parseFloat(TOTAL_CHARGES);

    if (balanceBeforeTransaction < finalAmount) {
      await t.rollback();
      return res.status(400).json({ message: 'Insufficient funds for the transaction.' });
    }

    const newBalance = balanceBeforeTransaction - finalAmount;
    const transactionRefNo = generateTransactionRefNo();

    const newTransaction = await CashWithdrawalTransaction.create({
      CUST_ID: Number(CUST_ID),
      ACCT_ID: account.id, // Now integer ID from MySQL
      ACCT_NO,
      ACCT_NM,
      amount,
      TOTAL_CHARGES,
      VALUE_DATE: new Date(VALUE_DATE),
      WITHDRAWER_NAME,
      BUSINESS_UNIT,
      DESCRIPTION,
      SOURCE_OF_FUNDS,
      CURRENCY_COUNT,
      TOTAL_CURRENCY_COUNT,
      TRANSACTION_REF_NO: transactionRefNo,
      BALANCE_BEFORE_TRANSACTION: balanceBeforeTransaction,
      BALANCE_AFTER_TRANSACTION: newBalance,
      WORK_ITEM_ID: Math.floor(Math.random() * 1000000),
      transactionStatus: 'Completed',
    }, { transaction: t });

    // Update account balances
    await CustomerAccount.update({
      LEDGER_BAL: sequelize.literal(`LEDGER_BAL - ${finalAmount}`),
      CLEARED_BAL: sequelize.literal(`CLEARED_BAL - ${finalAmount}`),
      AVAILABLE_BALANCE: sequelize.literal(`AVAILABLE_BALANCE - ${finalAmount}`),
    }, {
      where: { id: account.id },
      transaction: t,
    });

    await t.commit();

    res.status(201).json({
      message: 'Transaction created successfully',
      transaction: newTransaction,
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
        WORK_ITEM_ID: newTransaction.WORK_ITEM_ID,
      },
    });
  } catch (error) {
    await t.rollback();
    console.error('Error during transaction:', error);
    res.status(500).json({ message: 'Error creating transaction', error: error.message });
  }
};

export const getPendingApprovals = async (req, res) => {
  try {
    const { CUST_ID, USER_ID } = req.query;

    if (!CUST_ID || !USER_ID) {
      return res.status(400).json({ message: 'CUST_ID and USER_ID are required' });
    }

    const pendingApprovals = await WF_WORK_ITEM.findAll({
      where: {
        CUST_ID: Number(CUST_ID),
        USER_ID,
        WAIT_ST: 'Pending',
      },
    });

    if (pendingApprovals.length === 0) {
      return res.status(404).json({ message: 'No pending approvals found.' });
    }

    const formattedApprovals = pendingApprovals.map(approval => {
      let itemValue = {};
      if (typeof approval.ITEM_VALUE === 'string') {
        try {
          itemValue = JSON.parse(approval.ITEM_VALUE);
        } catch (err) {
          console.error('Error parsing ITEM_VALUE:', err);
        }
      }

      return {
        transactionDetails: {
          ROLE_NAME: approval.ROLE_NAME || null,
          USER_ID: USER_ID || 'N/A',
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
          CURRENCY_COUNT: approval.CURRENCY_COUNT || itemValue?.CURRENCY_COUNT || {},
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
  const t = await sequelize.transaction();

  try {
    const { WORK_ITEM_ID } = req.params;

    const workflowItem = await WF_WORK_ITEM.findOne({ where: { WORK_ITEM_ID } });

    if (!workflowItem) {
      return res.status(404).json({ message: 'Workflow item not found.' });
    }

    if (workflowItem.WAIT_ST !== 'Approved') {
      return res.status(400).json({ message: 'Workflow item is not approved yet.' });
    }

    const amount = parseFloat(workflowItem.ITEM_VALUE);
    const account = await CustomerAccount.findOne({
      where: { customer_id: workflowItem.CUST_ID },
      transaction: t,
    });

    if (!account) {
      await t.rollback();
      return res.status(404).json({ message: 'Customer account not found.' });
    }

    const balanceBeforeTransaction = parseFloat(account.AVAILABLE_BALANCE || 0);

    if (balanceBeforeTransaction < amount) {
      await t.rollback();
      return res.status(400).json({ message: 'Insufficient funds for the transaction.' });
    }

    const newBalance = balanceBeforeTransaction - amount;
    const transactionRefNo = generateTransactionRefNo();

    const newTransaction = await CashWithdrawalTransaction.create({
      CUST_ID: workflowItem.CUST_ID,
      ACCT_ID: account.id,
      ACCT_NO: account.account_number,
      ACCT_NM: account.ACCT_NM || account.account_number,
      amount,
      TOTAL_CHARGES: 0,
      VALUE_DATE: new Date(),
      WITHDRAWER_NAME: 'System',
      BUSINESS_UNIT: workflowItem.BU_ID,
      DESCRIPTION: workflowItem.ITEM_DESC,
      SOURCE_OF_FUNDS: 'Workflow Approval',
      CURRENCY_COUNT: {},
      TOTAL_CURRENCY_COUNT: 0,
      TRANSACTION_REF_NO: transactionRefNo,
      BALANCE_BEFORE_TRANSACTION: balanceBeforeTransaction,
      BALANCE_AFTER_TRANSACTION: newBalance,
      WORK_ITEM_ID: WORK_ITEM_ID,
      transactionStatus: 'Completed',
    }, { transaction: t });

    await CustomerAccount.update({
      LEDGER_BAL: sequelize.literal(`LEDGER_BAL - ${amount}`),
      CLEARED_BAL: sequelize.literal(`CLEARED_BAL - ${amount}`),
      AVAILABLE_BALANCE: sequelize.literal(`AVAILABLE_BALANCE - ${amount}`),
    }, {
      where: { id: account.id },
      transaction: t,
    });

    await WF_WORK_ITEM.update(
      { REC_ST: 'Completed' },
      { where: { WORK_ITEM_ID }, transaction: t }
    );

    await t.commit();

    res.status(201).json({
      message: 'Transaction processed successfully',
      transaction: newTransaction,
      workflowItem,
    });
  } catch (error) {
    await t.rollback();
    console.error('Error processing transaction:', error);
    res.status(500).json({ message: 'Error processing transaction', error: error.message });
  }
};

export const createCustomerAccounts = async (req, res) => {
  const customerAccounts = req.body;

  if (customerAccounts.some(acc => !acc.CUST_ID)) {
    return res.status(400).json({ message: 'CUST_ID is required for all accounts.' });
  }

  try {
    const accountsToInsert = customerAccounts.map(account => ({
      id: account.ACCT_ID, // assuming ACCT_ID maps to primary key
      account_number: account.ACCT_NO,
      ACCT_NM: account.ACCT_NM,
      BU_ID: account.BU_ID,
      GL_ACCT_NO: account.GL_ACCT_NO,
      LEDGER_BAL: account.LEDGER_BAL,
      CLEARED_BAL: account.CLEARED_BAL,
      AVAILABLE_BALANCE: account.AVAILABLE_BALANCE,
      ACCOUNT_TYPE: account.ACCOUNT_TYPE,
      PRODUCT_DESC: account.PRODUCT_DESC,
      REC_ST: account.REC_ST,
      customer_id: account.CUST_ID,
    }));

    const createdAccounts = await CustomerAccount.bulkCreate(accountsToInsert);
    res.status(201).json({ message: 'Accounts created successfully', accounts: createdAccounts });
  } catch (error) {
    console.error('Error creating accounts:', error);
    res.status(500).json({ message: 'Error creating accounts', error: error.message });
  }
};

export const getWorkflowItemWithTransaction = async (req, res) => {
  try {
    const { workItemId } = req.params;

    const workflowItem = await WF_WORK_ITEM.findOne({ where: { WORK_ITEM_ID: workItemId } });

    if (!workflowItem) {
      return res.status(404).json({ message: 'Workflow item not found' });
    }

    const transaction = await CashWithdrawalTransaction.findOne({ where: { WORK_ITEM_ID: workItemId } });

    if (!transaction) {
      return res.status(404).json({
        message: `Workflow item found, but no associated transaction exists for WORK_ITEM_ID: ${workItemId}`,
        workflowItem: {
          WORK_ITEM_ID: workflowItem.WORK_ITEM_ID,
          DESCRIPTION: workflowItem.ITEM_DESC || 'No description available',
          STATUS: workflowItem.WAIT_ST || 'Unknown',
          createdAt: workflowItem.CREATE_DT,
        },
      });
    }

    res.status(200).json({
      workflowItem: {
        WORK_ITEM_ID: workflowItem.WORK_ITEM_ID,
        DESCRIPTION: workflowItem.ITEM_DESC || 'No description available',
        STATUS: workflowItem.WAIT_ST || 'Unknown',
        createdAt: workflowItem.CREATE_DT,
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

export const getTransactionByRefNo = async (req, res) => {
  try {
    const { refNo } = req.params;

    const transaction = await CashWithdrawalTransaction.findOne({
      where: { TRANSACTION_REF_NO: refNo },
    });

    if (transaction) {
      res.status(200).json(transaction);
    } else {
      res.status(404).json({ message: 'Transaction not found' });
    }
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getTransactionsByAcctNoOrWorkItemId = async (req, res) => {
  try {
    const { acctNoOrWorkItemId } = req.params;

    const isAcctNo = /^\d{8,10}$/.test(acctNoOrWorkItemId); // Adjust regex as needed
    const where = isAcctNo
      ? { ACCT_NO: acctNoOrWorkItemId }
      : { WORK_ITEM_ID: parseInt(acctNoOrWorkItemId) };

    const transactions = await CashWithdrawalTransaction.findAll({ where });

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

export const rejectWorkflowItem = async (req, res) => {
  try {
    const { workItemId } = req.params;
    const { rejectionReason } = req.body;

    const workflowItem = await WF_WORK_ITEM.findOne({ where: { WORK_ITEM_ID: workItemId } });

    if (!workflowItem) {
      return res.status(404).json({ message: 'Workflow item not found.' });
    }

    if (workflowItem.WAIT_ST !== 'Pending') {
      return res.status(400).json({ message: 'Workflow item is not pending approval.' });
    }

    await WF_WORK_ITEM.update({
      WAIT_ST: 'Rejected',
      REC_ST: 'Completed',
      REJECTION_REASON: rejectionReason || 'No reason provided',
      REJECTED_DT: new Date(),
    }, { where: { WORK_ITEM_ID: workItemId } });

    await NotificationService.send({
      ROLE_ID: workflowItem.ORIGINATOR_USER_ROLE_ID,
      message: `Transaction (ID: ${workItemId}) has been rejected. Reason: ${rejectionReason || 'No reason provided'}`,
      WORK_ITEM_ID: workItemId,
    });

    res.status(200).json({
      message: `Workflow item ${workItemId} has been rejected successfully.`,
    });
  } catch (error) {
    console.error('Error rejecting workflow item:', error);
    res.status(500).json({ message: 'Error rejecting workflow item', error: error.message });
  }
};

export const getAllWithdrawalTransactions = async (req, res) => {
  try {
    const { WORK_ITEM_ID } = req.query;

    const where = WORK_ITEM_ID ? { WORK_ITEM_ID: parseInt(WORK_ITEM_ID) } : {};

    const transactions = await CashWithdrawalTransaction.findAll({ where });

    if (transactions.length === 0) {
      return res.status(404).json({ message: `No withdrawal transactions found.` });
    }

    res.status(200).json({
      message: 'Withdrawal transactions retrieved successfully.',
      transactions,
    });
  } catch (error) {
    console.error('Error fetching withdrawal transactions:', error);
    res.status(500).json({ message: 'Error fetching withdrawal transactions', error: error.message });
  }
};