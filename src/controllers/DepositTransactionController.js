import DepositTransaction from '../models/DepositTransaction.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import TransactionPolicy from '../models/TransactionPolicy.js';
import CustomerAccount from '../models/CustomerAccount.js';
import GLAccount from '../models/GLAccount.js';
import Ledger from '../models/Ledger.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import NotificationService from '../Services/NotificationService.js';
import { createGLAccountTransaction } from '../controllers/GLAccountTransactionController.js';

// Helper functions
const generateTransactionRefNo = () => `TRX${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
const generateNumber = (len) => Math.random().toString().slice(2, 2 + len).padStart(len, '0');

// // Validate GL account number format: 6 groups of 1-3 digits separated by '-'
// const isValidGLAcctNo = (glAcctNo) => {
//   const regex = /^(\d{1,3}-){5}\d{1,3}$/;
//   return regex.test(glAcctNo);
// };

const GL_ACCOUNT_DEFAULTS = {
  GL_ACCT_CAT: 'ASSET',
  CHART_OF_ACCT_ID: '1001',
  GL_ACCT_ID: `GL_${Date.now()}`,
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
    updatedLedger: ledger,
  };
}

export const createDepositTransaction = async (req, res) => {
  const {
    ACCT_ID, // Make this optional
    ACCT_NO,
    GL_ACCT_NO,
    ACCT_NM,
    AMOUNT,
    TOTAL_CHARGES = 0,
    TRANSACTION_DATE = new Date(),
    DESCRIPTION = '',
    VALUE_DATE,
    DEPOSITOR_NAME,
    BUSINESS_UNIT = '001',
    CURRENCY_COUNT,
    USER_ID = 'SYSTEM',
    ROLE_NM,
    CUST_ID,
  } = req.body;

  // Updated: ACCT_ID is no longer required
  const requiredFields = ['ACCT_NO', 'DEPOSITOR_NAME', 'VALUE_DATE', 'USER_ID', 'ROLE_NM', 'CUST_ID', 'GL_ACCT_NO'];
  const missingFields = requiredFields.filter((field) => !req.body[field]);
  if (missingFields.length > 0) {
    return res.status(400).json({ 
      message: 'Missing required fields', 
      missingFields,
      note: 'ACCT_ID is optional and not required'
    });
  }

  if (!AMOUNT || AMOUNT <= 0) {
    return res.status(400).json({ message: 'Amount must be a positive number', receivedAmount: AMOUNT });
  }

  if (!isValidGLAcctNo(GL_ACCT_NO)) {
    return res.status(400).json({ message: 'Invalid GL_ACCT_NO format. It should be in the format xx-xx-xx-xx-xx-xx (e.g., 2-400-100-200-101-1)' });
  }

  const finalAmount = AMOUNT - TOTAL_CHARGES;
  if (finalAmount <= 0) {
    return res.status(400).json({ message: 'Amount after charges must be positive', finalAmount });
  }

  // Validate CURRENCY_COUNT structure - SUPPORT BOTH OLD AND NEW KEY NAMES
  if (CURRENCY_COUNT) {
    // Support both old keys (OneThousandNaira, FiveHundredNaira) and new keys (NGN1000, NGN500)
    const {
      // Old key names
      OneThousandNaira = 0,
      FiveHundredNaira = 0,
      TwoHundredNaira = 0,
      OneHundredNaira = 0,
      FiftyNaira = 0,
      TwentyNaira = 0,
      TenNaira = 0,
      FiveNaira = 0,
      // New key names
      NGN1000 = 0,
      NGN500 = 0,
      NGN200 = 0,
      NGN100 = 0,
      NGN50 = 0,
      NGN20 = 0,
      NGN10 = 0,
      NGN5 = 0,
    } = CURRENCY_COUNT;

    // Use new keys if provided, otherwise use old keys
    const calculatedAmount =
      ((OneThousandNaira || NGN1000) * 1000) +
      ((FiveHundredNaira || NGN500) * 500) +
      ((TwoHundredNaira || NGN200) * 200) +
      ((OneHundredNaira || NGN100) * 100) +
      ((FiftyNaira || NGN50) * 50) +
      ((TwentyNaira || NGN20) * 20) +
      ((TenNaira || NGN10) * 10) +
      ((FiveNaira || NGN5) * 5);

    if (calculatedAmount !== AMOUNT) {
      return res.status(400).json({
        message: 'AMOUNT does not match the sum of currency denominations',
        calculatedAmount,
        providedAmount: AMOUNT,
        denominationBreakdown: {
          oneThousandNotes: OneThousandNaira || NGN1000,
          fiveHundredNotes: FiveHundredNaira || NGN500,
          twoHundredNotes: TwoHundredNaira || NGN200,
          oneHundredNotes: OneHundredNaira || NGN100,
          fiftyNotes: FiftyNaira || NGN50,
          twentyNotes: TwentyNaira || NGN20,
          tenNotes: TenNaira || NGN10,
          fiveNotes: FiveNaira || NGN5
        },
        note: 'Currency denominations can use either old keys (OneThousandNaira) or new keys (NGN1000)'
      });
    }

    // Calculate total count for both key naming conventions
    CURRENCY_COUNT.TOTAL_CURRENCY_COUNT =
      (OneThousandNaira || NGN1000) +
      (FiveHundredNaira || NGN500) +
      (TwoHundredNaira || NGN200) +
      (OneHundredNaira || NGN100) +
      (FiftyNaira || NGN50) +
      (TwentyNaira || NGN20) +
      (TenNaira || NGN10) +
      (FiveNaira || NGN5);

    // Ensure all keys are present for backward compatibility
    CURRENCY_COUNT.OneThousandNaira = OneThousandNaira || NGN1000;
    CURRENCY_COUNT.FiveHundredNaira = FiveHundredNaira || NGN500;
    CURRENCY_COUNT.TwoHundredNaira = TwoHundredNaira || NGN200;
    CURRENCY_COUNT.OneHundredNaira = OneHundredNaira || NGN100;
    CURRENCY_COUNT.FiftyNaira = FiftyNaira || NGN50;
    CURRENCY_COUNT.TwentyNaira = TwentyNaira || NGN20;
    CURRENCY_COUNT.TenNaira = TenNaira || NGN10;
    CURRENCY_COUNT.FiveNaira = FiveNaira || NGN5;
  }

  try {
    // Fetch customer account and validate CUST_ID presence
    const customer = await CustomerAccount.findOne({ ACCT_NO: String(ACCT_NO) });
    if (!customer) {
      return res.status(404).json({
        message: 'Customer must have Customer Account Opening before Deposit Transaction',
        ACCT_NO,
      });
    }
    
    // Use customer.CUST_ID if CUST_ID not provided in request
    const finalCustId = CUST_ID || customer.CUST_ID;
    if (!finalCustId) {
      return res.status(500).json({ 
        message: 'Customer account is missing CUST_ID', 
        ACCT_NO,
        suggestion: 'Please provide CUST_ID in the request'
      });
    }

    // Find or create Ledger and GL Account if missing
    let glAccount = await GLAccount.findOne({ GL_ACCT_NO });
    if (!glAccount) {
      glAccount = new GLAccount({
        GL_ACCT_NO,
        ACCT_DESC: ACCT_NM || 'Auto-created GL Account',
        ...GL_ACCOUNT_DEFAULTS,
        BU_ID: String(BUSINESS_UNIT),
        CREATED_BY: USER_ID,
        CREATE_DT: new Date(),
        LEDGER_NO: '0000',
        BAL_CD: 'CR',
        SUB_LEDGER_NO: '0000',
        SEG_NO: String(BUSINESS_UNIT) || '001',
        subfolderId: 1,
        DELAY_GL_POSTING: false,
        CR_ALLOWED: true,
        DR_ALLOWED: false,
        REC_ST: 'Active',
        POST_ALLOW: true,
        POST_FG: true,
        CONTROL_ACCT_FG: false,
        SUPENSE_ACCT_FG: false,
        ALLOW_BAL_SWING_FG: false,
        ROW_TS: new Date(),
      });
      await glAccount.save();
    }

    let ledger = await Ledger.findOne({ GL_ACCT_NO });
    if (!ledger) {
      ledger = new Ledger({
        JOURNAL_ID: Math.floor(Math.random() * 1_000_000_000),
        LEDGER_NO: generateNumber(7),
        GL_ACCT_NO,
        BAL_CD: 'CR',
        SUB_LEDGER_NO: '0000',
        BU_ID: glAccount.BU_ID || String(BUSINESS_UNIT),
        SEG_NO: String(BUSINESS_UNIT) || '001',
        CHART_OF_ACCT_ID: glAccount.CHART_OF_ACCT_ID,
        ACCT_DESC: glAccount.ACCT_DESC || ACCT_NM,
        GL_ACCT_ID: glAccount.GL_ACCT_ID,
        GL_ACCT_STRUCT_ID: glAccount.GL_ACCT_STRUCT_ID || '',
        GL_ACCT_CAT_CD: glAccount.GL_ACCT_CAT,
        LEDGER_BALANCE: 0,
        CREATED_BY: USER_ID,
        CREATE_DT: new Date(),
        TRANSACTION_TYPE: 'Credit',
      });
      await ledger.save();
    }

    // Create deposit transaction doc - ACCT_ID is now optional
    const deposit = new DepositTransaction({
      ACCT_ID: ACCT_ID || null, // Optional field
      ACCT_NO: String(ACCT_NO),
      ACCT_NM,
      GL_ACCT_NO,
      TRANSACTION_TYPE: 'Deposit',
      AMOUNT: finalAmount,
      TRANSACTION_REF_NO: generateTransactionRefNo(),
      BALANCE_AFTER_TRANSACTION: (customer.AVAILABLE_BALANCE || 0) + finalAmount,
      VALUE_DATE: new Date(VALUE_DATE),
      TRANSACTION_DATE: new Date(TRANSACTION_DATE),
      BUSINESS_UNIT: String(BUSINESS_UNIT),
      DEPOSITOR_NAME,
      CURRENCY_COUNT: CURRENCY_COUNT || {
        OneThousandNaira: 0,
        FiveHundredNaira: 0,
        TwoHundredNaira: 0,
        OneHundredNaira: 0,
        FiftyNaira: 0,
        TwentyNaira: 0,
        TenNaira: 0,
        FiveNaira: 0,
        TOTAL_CURRENCY_COUNT: 0,
      },
      REC_ST: 'Pending',
      STATUS: 'Pending',
      DESCRIPTION,
      CUST_ID: String(finalCustId), // Use the final CUST_ID
      USER_ID,
    });
    await deposit.save();

    // Load transaction policy for the role
    const policy = await TransactionPolicy.findOne({ ROLE_NM: new RegExp(`^${ROLE_NM}$`, 'i') });
    if (!policy || !Array.isArray(policy.RANGES) || policy.RANGES.length === 0) {
      return res.status(403).json({ message: `No transaction policy found for role: ${ROLE_NM}` });
    }

    const range = policy.RANGES.find((r) => AMOUNT >= r.MIN_AMOUNT && AMOUNT <= r.MAX_AMOUNT);
    if (!range) {
      return res.status(403).json({ message: `No policy range matched for amount ${AMOUNT} under role ${ROLE_NM}` });
    }

    if (range.requiresApproval === true) {
      // Send to workflow for approval
      const workflowPayload = {
        ITEM_VALUE: finalAmount,
        ITEM_DESC: `Deposit of ₦${finalAmount} for Account ${ACCT_NO}`,
        ITEM_CLASS_NM: 'Transaction',
        ITEM_TYPE: 'DepositTransaction',
        CUST_ID: Number(finalCustId), // Use the final CUST_ID
        USER_ID,
        BU_ID: String(BUSINESS_UNIT),
        ORIGINATOR_USER_ROLE_ID: ROLE_NM,
        TARGET_USER_ROLE_ID: range.AUTHORIZED_ROLES?.[0] || 'Manager',
        depositPayload: { _id: deposit._id },
      };

      // Submit to workflow
      const workflowResult = await WF_WORK_ITEMController.submitTransaction({ body: workflowPayload }, res);

      // If WF_WORK_ITEMController sent a response, return it
      if (res.headersSent) {
        return;
      }

      // Send notification to target role for approval
      try {
        await NotificationService.send({
          ROLE_ID: workflowPayload.TARGET_USER_ROLE_ID,
          message: `New deposit transaction of ₦${finalAmount} for Account ${ACCT_NO} requires your approval`,
          WORK_ITEM_ID: workflowResult?.workItem?.WORK_ITEM_ID || 'N/A',
          CUST_ID: finalCustId,
          TRANSACTION_REF_NO: deposit.TRANSACTION_REF_NO,
        });
      } catch (notificationErr) {
        console.error('Notification error:', notificationErr);
        // Optionally, don't fail the transaction due to notification error
      }

      return res.status(200).json({
        success: true,
        message: 'Deposit transaction submitted for approval',
        transaction: deposit,
        workflow: workflowResult?.workItem || workflowPayload,
        note: 'ACCT_ID is optional and was not required for this transaction'
      });
    }

    // If approval not required, finalize transaction immediately & post GL transaction
    deposit.REC_ST = 'Completed';
    deposit.STATUS = 'Approved';
    await deposit.save();

    // Post the GL transaction using createGLAccountTransaction
    let glTransaction;
    try {
      // Create a mock response object to capture the GL transaction result
      const mockRes = {
        statusCode: null,
        responseData: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this.responseData = data;
          return this;
        },
      };

      await createGLAccountTransaction(
        {
          body: {
            GL_ACCT_NO,
            AMOUNT: finalAmount,
            TRANSACTION_TYPE: 'CR',
            CREATED_BY: USER_ID,
            description: DESCRIPTION,
            SUB_LEDGER_NO: '0000',
            SEG_NO: String(BUSINESS_UNIT),
            DRS_ALLOWED_FG: false,
            CRS_ALLOWED_FG: true,
            CREATE_DT: new Date(TRANSACTION_DATE),
            JOURNAL_ID: deposit.TRANSACTION_REF_NO,
          },
          headers: req.headers,
          user: req.user,
        },
        mockRes
      );

      if (mockRes.statusCode === 201 && mockRes.responseData?.transaction) {
        // Queued transaction
        glTransaction = mockRes.responseData.transaction;
        deposit.GL_TransactionId = glTransaction.TransactionId || glTransaction._id;
        deposit.QueueTransactionId = glTransaction._id; // Store ObjectId from GLTransactionQueue
      } else if (mockRes.statusCode === 200 && mockRes.responseData?.transaction) {
        // Immediate transaction
        glTransaction = mockRes.responseData.transaction;
        deposit.GL_TransactionId = glTransaction.TransactionId;
        deposit.QueueTransactionId = glTransaction.QueueTransactionId;
      } else {
        throw new Error('Unexpected GL transaction response');
      }

      await deposit.save();
    } catch (glErr) {
      console.error('GL Transaction posting failed:', glErr);
      return res.status(500).json({ 
        success: false,
        message: 'Failed to post GL transaction', 
        error: glErr.message 
      });
    }

    // Update customer account and ledger balances
    const updateResult = await updateCustomerAccountAndLedger(deposit, USER_ID, DESCRIPTION);

    // Send notification for completed transaction
    try {
      await NotificationService.send({
        ROLE_ID: ROLE_NM,
        message: `Deposit of ₦${finalAmount} for Account ${ACCT_NO} completed successfully`,
        CUST_ID: finalCustId,
        TRANSACTION_REF_NO: deposit.TRANSACTION_REF_NO,
      });
    } catch (notificationErr) {
      console.error('Notification error:', notificationErr);
      // Optionally, don't fail the transaction due to notification error
    }

    return res.status(201).json({
      success: true,
      message: 'Deposit transaction processed successfully.',
      transaction: deposit,
      updatedCustomerAccount: updateResult.updatedCustomerAccount,
      updatedLedger: updateResult.updatedLedger,
      glTransaction,
      note: 'ACCT_ID is optional and was not required for this transaction'
    });
  } catch (err) {
    console.error('❌ Deposit processing error:', err);
    return res.status(500).json({
      success: false,
      message: 'Transaction processing failed',
      error: err.message || err,
    });
  }
};

// Approve Deposit Transaction
export const approveDepositTransaction = async (req, res) => {
  const { WORK_ITEM_ID, APPROVED_BY, CUST_ID, comments } = req.body;

  if (!WORK_ITEM_ID || !APPROVED_BY || !CUST_ID) {
    return res.status(400).json({
      message: 'WORK_ITEM_ID, APPROVED_BY, and CUST_ID are required',
    });
  }

  try {
    // Find work item
    const workItem = await WF_WORK_ITEM.findOne({
      WORK_ITEM_ID: Number(WORK_ITEM_ID),
      CUST_ID: Number(CUST_ID),
      REC_ST: 'Pending',
    });

    if (!workItem) {
      return res.status(404).json({
        message: 'Pending work item not found',
        WORK_ITEM_ID,
        CUST_ID,
      });
    }

    // Find associated deposit
    const deposit = await DepositTransaction.findOne({
      _id: workItem.ITEM_ID,
      CUST_ID: CUST_ID.toString(),
      REC_ST: 'Pending',
    });

    if (!deposit) {
      return res.status(404).json({
        message: 'Pending deposit transaction not found',
        transactionId: workItem.ITEM_ID,
      });
    }

    // Verify customer account
    const customer = await CustomerAccount.findOne({ ACCT_NO: deposit.ACCT_NO });
    if (!customer) {
      return res.status(404).json({
        message: 'Customer account not found',
        ACCT_NO: deposit.ACCT_NO,
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

    // Post GL transaction
    let glTransaction;
    try {
      const mockRes = {
        statusCode: null,
        responseData: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this.responseData = data;
          return this;
        },
      };

      await createGLAccountTransaction(
        {
          body: {
            GL_ACCT_NO: deposit.GL_ACCT_NO,
            AMOUNT: deposit.AMOUNT,
            TRANSACTION_TYPE: 'CR',
            CREATED_BY: APPROVED_BY,
            description: deposit.DESCRIPTION,
            SUB_LEDGER_NO: '0000',
            SEG_NO: deposit.BUSINESS_UNIT,
            DRS_ALLOWED_FG: false,
            CRS_ALLOWED_FG: true,
            CREATE_DT: new Date(),
            JOURNAL_ID: deposit.TRANSACTION_REF_NO,
          },
          headers: req.headers,
          user: req.user,
        },
        mockRes
      );

      if (mockRes.statusCode === 201 && mockRes.responseData?.transaction) {
        // Queued transaction
        glTransaction = mockRes.responseData.transaction;
        deposit.GL_TransactionId = glTransaction.TransactionId || glTransaction._id;
        deposit.QueueTransactionId = glTransaction._id; // Store ObjectId from GLTransactionQueue
      } else if (mockRes.statusCode === 200 && mockRes.responseData?.transaction) {
        // Immediate transaction
        glTransaction = mockRes.responseData.transaction;
        deposit.GL_TransactionId = glTransaction.TransactionId;
        deposit.QueueTransactionId = glTransaction.QueueTransactionId;
      } else {
        throw new Error('Unexpected GL transaction response');
      }

      await deposit.save();
    } catch (glErr) {
      console.error('GL Transaction posting failed:', glErr);
      return res.status(500).json({ message: 'Failed to post GL transaction', error: glErr.message });
    }

    // Send notification for approved transaction
    try {
      await NotificationService.send({
        ROLE_ID: workItem.ORIGINATOR_USER_ROLE_ID,
        message: `Your deposit of ₦${deposit.AMOUNT} for Account ${deposit.ACCT_NO} has been approved`,
        WORK_ITEM_ID,
        CUST_ID,
        TRANSACTION_REF_NO: deposit.TRANSACTION_REF_NO,
      });
    } catch (notificationErr) {
      console.error('Notification error:', notificationErr);
      // Optionally, don't fail the transaction due to notification error
    }

    return res.status(200).json({
      message: 'Deposit transaction approved successfully',
      transaction: {
        reference: deposit.TRANSACTION_REF_NO,
        amount: deposit.AMOUNT,
        date: deposit.APPROVED_DATE,
        GL_TransactionId: deposit.GL_TransactionId,
        QueueTransactionId: deposit.QueueTransactionId,
      },
      account: {
        ACCT_NO: deposit.ACCT_NO,
        newBalance: newBalance,
      },
      glTransaction,
    });
  } catch (error) {
    console.error('Approval error:', error);
    return res.status(500).json({
      message: 'Error approving transaction',
      error: error.message,
    });
  }
};

// Reject Deposit Transaction
export const rejectDepositTransaction = async (req, res) => {
  const { WORK_ITEM_ID, REJECTED_BY, CUST_ID, comments } = req.body;

  if (!WORK_ITEM_ID || !REJECTED_BY || !CUST_ID) {
    return res.status(400).json({
      message: 'WORK_ITEM_ID, REJECTED_BY, and CUST_ID are required',
    });
  }

  try {
    // Find the workflow item
    const workItem = await WF_WORK_ITEM.findOne({
      WORK_ITEM_ID: Number(WORK_ITEM_ID),
      CUST_ID: Number(CUST_ID),
      REC_ST: 'Pending',
    });

    if (!workItem) {
      return res.status(404).json({
        message: 'Pending work item not found',
        WORK_ITEM_ID,
        CUST_ID,
      });
    }

    // Find the associated deposit transaction
    const deposit = await DepositTransaction.findOne({
      _id: workItem.ITEM_ID,
      CUST_ID: CUST_ID.toString(),
      REC_ST: 'Pending',
    });

    if (!deposit) {
      return res.status(404).json({
        message: 'Pending deposit transaction not found',
        transactionId: workItem.ITEM_ID,
      });
    }

    // Update the deposit transaction to reflect rejection
    deposit.STATUS = 'Rejected';
    deposit.REC_ST = 'Inactive';
    deposit.REJECTED_BY = REJECTED_BY;
    deposit.REJECTED_DATE = new Date();
    await deposit.save();

    // Update the work item
    workItem.REC_ST = 'Rejected';
    workItem.REJECTED_BY = REJECTED_BY;
    workItem.REJECTED_DATE = new Date();
    workItem.WAIT_ST = 'Completed';
    workItem.COMMENTS = comments;
    await workItem.save();

    // Send notification
    await NotificationService.send({
      ROLE_ID: workItem.ORIGINATOR_USER_ROLE_ID,
      message: `Your deposit of ₦${deposit.AMOUNT} for Account ${deposit.ACCT_NO} was rejected`,
      WORK_ITEM_ID,
      CUST_ID,
      TRANSACTION_REF_NO: deposit.TRANSACTION_REF_NO,
    });

    return res.status(200).json({
      message: 'Deposit transaction rejected successfully',
      transaction: {
        reference: deposit.TRANSACTION_REF_NO,
        amount: deposit.AMOUNT,
      },
    });
  } catch (error) {
    console.error('Rejection error:', error);
    return res.status(500).json({
      message: 'Error rejecting transaction',
      error: error.message,
    });
  }
};

// Get Pending Approvals by Customer ID
export const getPendingApprovalsByCustId = async (req, res) => {
  try {
    const { custId } = req.params;

    // Get all pending workflow items for DepositTransaction and customer
    const pendingItems = await WF_WORK_ITEM.find({
      ITEM_TYPE: 'DepositTransaction',
      CUST_ID: Number(custId),
      REC_ST: 'Pending',
    }).sort({ CREATE_DT: -1 });

    if (pendingItems.length === 0) {
      return res.status(404).json({
        message: 'No pending approvals for this customer',
      });
    }

    // Fetch DepositTransaction details for each pending work item
    const pendingTransactions = await Promise.all(
      pendingItems.map(async (item) => {
        const transaction = await DepositTransaction.findOne({
          _id: item.ITEM_ID,
          CUST_ID: custId.toString(),
        });

        return {
          ...item.toObject(),
          transactionDetails: transaction
            ? {
                ACCT_NO: transaction.ACCT_NO,
                ACCT_NM: transaction.ACCT_NM,
                AMOUNT: transaction.AMOUNT,
                DEPOSITOR_NAME: transaction.DEPOSITOR_NAME,
                TRANSACTION_DATE: transaction.TRANSACTION_DATE,
                TRANSACTION_REF_NO: transaction.TRANSACTION_REF_NO,
                DESCRIPTION: transaction.DESCRIPTION,
                GL_ACCT_NO: transaction.GL_ACCT_NO,
              }
            : null,
        };
      })
    );

    return res.status(200).json(pendingTransactions);
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({
      message: 'Error retrieving pending approvals',
      error: error.message,
    });
  }
};

// Get all transaction reference numbers by Account Number
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

// Get all transactions by Account Number
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