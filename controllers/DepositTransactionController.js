import DepositTransaction from '../models/DepositTransaction.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import TransactionPolicy from '../models/TransactionPolicy.js';
import CustomerAccount from '../models/CustomerAccount.js';
import GLAccount from '../models/GLAccount.js';
import Ledger from '../models/Ledger.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import { createGLTransaction } from '../controllers/GLAccountTransactionSingle.js';  // Adjust this path as needed
import NotificationService from '../Services/NotificationService.js';

// Helper functions
const generateTransactionRefNo = () => `TRX${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateNumber = len => Math.random().toString().slice(2, 2 + len).padStart(len, '0');

const GL_ACCOUNT_DEFAULTS = {
  GL_ACCT_CAT_CD: 'ASSET',
  CHART_OF_ACCT_ID: 'DEFAULT_CHART',
  GL_ACCT_ID: `GL_${Date.now()}`
};

async function updateCustomerAccountAndLedger(deposit, userId, description) {
  const customer = await CustomerAccount.findOne({ ACCT_NO: deposit.ACCT_NO });
  if (!customer) throw new Error('CustomerAccount not found when updating balances');

  customer.LEDGER_BAL += deposit.AMOUNT;
  customer.CLEARED_BAL += deposit.AMOUNT;
  customer.AVAILABLE_BALANCE += deposit.AMOUNT;
  await customer.save();

  const ledger = await Ledger.findOne({ GL_ACCT_NO: deposit.GL_ACCT_NO });
  if (!ledger) throw new Error('Ledger not found when updating balances');

  ledger.LEDGER_BALANCE += deposit.AMOUNT;
  await ledger.save();

  return {
    updatedCustomerAccount: customer,
    updatedLedger: ledger
  };
}

export const createDepositTransaction = async (req, res) => {
  const {
    ACCT_ID, ACCT_NO, GL_ACCT_NO, ACCT_NM,
    AMOUNT, TOTAL_CHARGES = 0, TRANSACTION_DATE = new Date(), DESCRIPTION = '',
    VALUE_DATE, DEPOSITOR_NAME, BUSINESS_UNIT = '001', CURRENCY_COUNT,
    TOTAL_CURRENCY_COUNT = 0, USER_ID = 'SYSTEM', ROLE_NM, CUST_ID
  } = req.body;

  // Validate required fields
  const requiredFields = ['ACCT_NO', 'DEPOSITOR_NAME', 'VALUE_DATE', 'USER_ID', 'ROLE_NM', 'CUST_ID', 'GL_ACCT_NO'];
  const missingFields = requiredFields.filter(field => !req.body[field]);
  if (missingFields.length > 0) {
    return res.status(400).json({ message: 'Missing required fields', missingFields });
  }

  if (!AMOUNT || AMOUNT <= 0) {
    return res.status(400).json({ message: 'Amount must be a positive number', receivedAmount: AMOUNT });
  }

  const finalAmount = AMOUNT - TOTAL_CHARGES;
  if (finalAmount <= 0) {
    return res.status(400).json({ message: 'Amount after charges must be positive', finalAmount });
  }

  try {
    // Fetch customer account and validate CUST_ID presence
    const customer = await CustomerAccount.findOne({ ACCT_NO });
    if (!customer) {
      return res.status(404).json({
        message: 'Customer must have Customer Account Opening before Deposit Transaction',
        ACCT_NO
      });
    }
    if (!customer.CUST_ID) {
      return res.status(500).json({ message: 'Customer account is missing required CUST_ID', ACCT_NO });
    }

    // Find or create Ledger and GL Account if missing
    let ledger = await Ledger.findOne({ GL_ACCT_NO });
    if (!ledger) {
      let glAccount = await GLAccount.findOne({ GL_ACCT_NO });
      if (!glAccount) {
        glAccount = new GLAccount({
          GL_ACCT_NO,
          ACCT_DESC: ACCT_NM || 'Auto-created GL Account',
          ...GL_ACCOUNT_DEFAULTS,
          BU_ID: BUSINESS_UNIT,
          CREATED_BY: USER_ID,
          CREATE_DT: new Date()
        });
        await glAccount.save();
      }

      ledger = new Ledger({
        JOURNAL_ID: Math.floor(Math.random() * 1_000_000_000),
        LEDGER_NO: Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`),
        GL_ACCT_NO,
        BAL_CD: 'CR',
        SUB_LEDGER_NO: '0000',
        BU_ID: glAccount.BU_ID,
        SEG_NO: '001',
        CHART_OF_ACCT_ID: glAccount.CHART_OF_ACCT_ID,
        ACCT_DESC: glAccount.ACCT_DESC,
        GL_ACCT_ID: glAccount.GL_ACCT_ID,
        GL_ACCT_STRUCT_ID: glAccount.GL_ACCT_STRUCT_ID || '',
        GL_ACCT_CAT_CD: glAccount.GL_ACCT_CAT_CD,
        LEDGER_BALANCE: 0,
        CREATED_BY: USER_ID,
        CREATE_DT: new Date(),
        TRANSACTION_TYPE: 'Credit',
        AMOUNT: 0
      });
      await ledger.save();
    }

    // Create deposit transaction doc
    const deposit = new DepositTransaction({
      ACCT_ID,
      ACCT_NO,
      ACCT_NM,
      GL_ACCT_NO,
      TRANSACTION_TYPE: 'Deposit',
      AMOUNT: finalAmount,
      TRANSACTION_REF_NO: generateTransactionRefNo(),
      BALANCE_AFTER_TRANSACTION: 0,
      VALUE_DATE: new Date(VALUE_DATE),
      TRANSACTION_DATE: new Date(TRANSACTION_DATE),
      BUSINESS_UNIT,
      DEPOSITOR_NAME,
      CURRENCY_COUNT,
      TOTAL_CURRENCY_COUNT,
      REC_ST: 'Pending',
      DESCRIPTION,
      CUST_ID,
      USER_ID
    });

    await deposit.save();

    // Load transaction policy for the role
    const policy = await TransactionPolicy.findOne({ ROLE_NM: new RegExp(`^${ROLE_NM}$`, 'i') });
    if (!policy || !Array.isArray(policy.RANGES) || policy.RANGES.length === 0) {
      return res.status(403).json({ message: `No transaction policy found for role: ${ROLE_NM}` });
    }

    const range = policy.RANGES.find(r => AMOUNT >= r.MIN_AMOUNT && AMOUNT <= r.MAX_AMOUNT);
    if (!range) {
      return res.status(403).json({ message: `No policy range matched for amount ${AMOUNT} under role ${ROLE_NM}` });
    }

    if (range.requiresApproval === true) {
      // Send to workflow for approval
      const workflowPayload = {
        ITEM_VALUE: AMOUNT,
        ITEM_DESC: `Deposit of ₦${AMOUNT} for Account ${ACCT_NO}`,
        ITEM_CLASS_NM: 'Transaction',
        ITEM_TYPE: 'DepositTransaction',
        CUST_ID: Number(CUST_ID),
        USER_ID,
        BU_ID: BUSINESS_UNIT,
        ORIGINATOR_USER_ROLE_ID: ROLE_NM,
        TARGET_USER_ROLE_ID: range.AUTHORIZED_ROLES?.[0] || 'Manager',
        depositPayload: { _id: deposit._id }
      };

      return WF_WORK_ITEMController.submitTransaction({ body: workflowPayload }, res);
    }

    // If approval not required, finalize transaction immediately & post GL transaction
    deposit.REC_ST = 'Completed';
    await deposit.save();

    // Post the GL transaction using createGLTransaction service
    try {
      await createGLTransaction(null, null, {
        GL_ACCT_NO,
        AMOUNT: finalAmount,
        TRANSACTION_TYPE: 'CR', // Credit for deposit
        CREATED_BY: USER_ID,
        description: DESCRIPTION,
        SUB_LEDGER_NO: '0000',
        SEG_NO: BUSINESS_UNIT,
        DRS_ALLOWED_FG: false,
        CRS_ALLOWED_FG: true,
        CREATE_DT: new Date()
      });
    } catch (glErr) {
      console.error('GL Transaction posting failed:', glErr);
      return res.status(500).json({ message: 'Failed to post GL transaction', error: glErr.message });
    }

    // Update customer account and ledger balances
    const updateResult = await updateCustomerAccountAndLedger(deposit, USER_ID, DESCRIPTION);

    return res.status(201).json({
      message: 'Deposit transaction processed successfully.',
      transaction: deposit,
      updatedCustomerAccount: updateResult.updatedCustomerAccount,
      updatedLedger: updateResult.updatedLedger
    });

  } catch (err) {
    console.error('❌ Deposit processing error:', err);
    return res.status(500).json({
      message: 'Transaction processing failed',
      error: err.message || err
    });
  }
};

// NOTE: Make sure you have defined processImmediateDeposit somewhere in your code, as it is called above.


// 🔄 Updated Workflow Approval Functions
export const approveDepositTransaction = async (req, res) => {
  const { WORK_ITEM_ID, APPROVED_BY, CUST_ID, comments } = req.body;

  if (!WORK_ITEM_ID || !APPROVED_BY || !CUST_ID) {
    return res.status(400).json({
      message: 'WORK_ITEM_ID, APPROVED_BY, and CUST_ID are required'
    });
  }

  try {
    // Find work item
    const workItem = await WF_WORK_ITEM.findOne({
      WORK_ITEM_ID: Number(WORK_ITEM_ID),
      CUST_ID: Number(CUST_ID),
      REC_ST: 'Pending'
    });

    if (!workItem) {
      return res.status(404).json({
        message: 'Pending work item not found',
        WORK_ITEM_ID,
        CUST_ID
      });
    }

    // Find associated deposit
    const deposit = await DepositTransaction.findOne({
      _id: workItem.ITEM_ID,
      CUST_ID: CUST_ID.toString(),
      REC_ST: 'Pending'
    });

    if (!deposit) {
      return res.status(404).json({
        message: 'Pending deposit transaction not found',
        transactionId: workItem.ITEM_ID
      });
    }

    // Verify customer account
    const customer = await CustomerAccount.findOne({ ACCT_NO: deposit.ACCT_NO });
    if (!customer) {
      return res.status(404).json({
        message: 'Customer account not found',
        ACCT_NO: deposit.ACCT_NO
      });
    }

    // Update balances
    const balanceBefore = parseFloat(customer.LEDGER_BAL) || 0;
    const newBalance = balanceBefore + deposit.AMOUNT;

    // Update deposit status
    deposit.STATUS = 'Approved';
    deposit.REC_ST = 'Active';
    deposit.APPROVED_BY = APPROVED_BY;
    deposit.APPROVED_DATE = new Date();
    deposit.BALANCE_AFTER_TRANSACTION = newBalance;
    await deposit.save();

    // Update customer balance
    customer.LEDGER_BAL = customer.CLEARED_BAL = customer.AVAILABLE_BALANCE = newBalance;
    customer.lastActivityDate = new Date();
    customer.UPDATED_AT = new Date();
    await customer.save();

    // Update workflow item
    workItem.REC_ST = 'Active';
    workItem.APPROVED_BY = APPROVED_BY;
    workItem.APPROVED_DATE = new Date();
    workItem.WAIT_ST = 'Completed';
    workItem.COMMENTS = comments;
    await workItem.save();

    // Create GL entry
    await createGLTransaction(null, null, {
      GL_ACCT_NO: deposit.GL_ACCT_NO,
      AMOUNT: deposit.AMOUNT,
      TRANSACTION_TYPE: 'CREDIT',
      DRS_ALLOWED_FG: false,
      CRS_ALLOWED_FG: true,
      CREATED_BY: APPROVED_BY,
      CREATE_DT: new Date(),
      description: deposit.DESCRIPTION,
      SUB_LEDGER_NO: deposit.ACCT_NO,
      SEG_NO: deposit.BUSINESS_UNIT
    });

    return res.status(200).json({
      message: 'Deposit transaction approved successfully',
      transaction: {
        reference: deposit.TRANSACTION_REF_NO,
        amount: deposit.AMOUNT,
        date: deposit.APPROVED_DATE
      },
      account: {
        ACCT_NO: deposit.ACCT_NO,
        newBalance: newBalance
      }
    });
  } catch (error) {
    console.error('Approval error:', error);
    return res.status(500).json({
      message: 'Error approving transaction',
      error: error.message
    });
  }
};

// ❌ Updated Reject Function
export const rejectDepositTransaction = async (req, res) => {
  const { WORK_ITEM_ID, REJECTED_BY, CUST_ID, comments } = req.body;

  if (!WORK_ITEM_ID || !REJECTED_BY || !CUST_ID) {
    return res.status(400).json({
      message: 'WORK_ITEM_ID, REJECTED_BY, and CUST_ID are required'
    });
  }

  try {
    // Find the workflow item
    const workItem = await WF_WORK_ITEM.findOne({
      WORK_ITEM_ID: Number(WORK_ITEM_ID),
      CUST_ID: Number(CUST_ID),
      REC_ST: 'Pending'
    });

    if (!workItem) {
      return res.status(404).json({
        message: 'Pending work item not found',
        WORK_ITEM_ID,
        CUST_ID
      });
    }

    // Find the associated deposit transaction
    const deposit = await DepositTransaction.findOne({
      _id: workItem.ITEM_ID,
      CUST_ID: CUST_ID.toString(),
      REC_ST: 'Pending'
    });

    if (!deposit) {
      return res.status(404).json({
        message: 'Pending deposit transaction not found',
        transactionId: workItem.ITEM_ID
      });
    }

    // Update the deposit transaction to reflect rejection
    deposit.STATUS = 'Rejected';
    deposit.REC_ST = 'Inactive'; // ✅ Allowed enum value
    deposit.REJECTED_BY = REJECTED_BY;
    deposit.REJECTED_DATE = new Date();
    await deposit.save();

    // Update the work item
    workItem.REC_ST = 'Rejected'; // ✅ Assuming allowed in WF_WORK_ITEM schema
    workItem.REJECTED_BY = REJECTED_BY;
    workItem.REJECTED_DATE = new Date();
    workItem.WAIT_ST = 'Completed';
    workItem.COMMENTS = comments;
    await workItem.save();

    // ✅ Send notification with correct keys
    await NotificationService.send({
      ROLE_ID: workItem.ORIGINATOR_USER_ROLE_ID,
      message: `Your deposit of ₦${deposit.AMOUNT} for Account ${deposit.ACCT_NO} was rejected`,
      WORK_ITEM_ID,
      CUST_ID
    });

    return res.status(200).json({
      message: 'Deposit transaction rejected successfully',
      transaction: {
        reference: deposit.TRANSACTION_REF_NO,
        amount: deposit.AMOUNT
      }
    });
  } catch (error) {
    console.error('Rejection error:', error);
    return res.status(500).json({
      message: 'Error rejecting transaction',
      error: error.message
    });
  }
};


// 📋 Updated Pending Approvals Query
export const getPendingApprovalsByCustId = async (req, res) => {
  try {
    const { custId } = req.params;
    
    // Get all pending workflow items for DepositTransaction and customer
    const pendingItems = await WF_WORK_ITEM.find({
      ITEM_TYPE: 'DepositTransaction',
      CUST_ID: Number(custId),
      REC_ST: 'Pending'
    }).sort({ CREATE_DT: -1 });

    if (pendingItems.length === 0) {
      return res.status(404).json({ 
        message: 'No pending approvals for this customer' 
      });
    }

    // Fetch DepositTransaction details for each pending work item
    const pendingTransactions = await Promise.all(
      pendingItems.map(async (item) => {
        const transaction = await DepositTransaction.findOne({
          _id: item.ITEM_ID,
          CUST_ID: custId.toString()
        });
        
        return {
          ...item.toObject(),
          transactionDetails: transaction ? {
            ACCT_NO: transaction.ACCT_NO,
            ACCT_NM: transaction.ACCT_NM,
            AMOUNT: transaction.AMOUNT,
            DEPOSITOR_NAME: transaction.DEPOSITOR_NAME,
            TRANSACTION_DATE: transaction.TRANSACTION_DATE,
            TRANSACTION_REF_NO: transaction.TRANSACTION_REF_NO,
            DESCRIPTION: transaction.DESCRIPTION,
            GL_ACCT_NO: transaction.GL_ACCT_NO
          } : null
        };
      })
    );

    return res.status(200).json(pendingTransactions);
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ 
      message: 'Error retrieving pending approvals', 
      error: error.message 
    });
  }
};


// Route to get all transaction reference numbers (TRANSACTION_REF_NO) by Account Number (ACCT_NO)
export const getTransactionRefNosByAcctNo = async (req, res) => {
    try {
        const { acctNo } = req.params;

        // Fetch only the transaction reference numbers for the specified account number
        const transactions = await DepositTransaction.find({ ACCT_NO: acctNo }).select('TRANSACTION_REF_NO');

        if (transactions.length > 0) {
            res.status(200).json(transactions);
        } else {
            res.status(404).json({ message: 'No transactions found for this account' });
        }
    } catch (error) {
        console.error('Error fetching transaction reference numbers:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get all transactions by Account Number (ACCT_NO)
export const getTransactionsByAcctNo = async (req, res) => {
    try {
        const { acctNo } = req.params;

        // Fetch transactions by Account Number
        const transactions = await DepositTransaction.find({ ACCT_NO: acctNo });

        if (transactions.length > 0) {
            res.status(200).json(transactions);
        } else {
            res.status(404).json({ message: 'No transactions found for this account' });
        }
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: error.message });
    }
};

