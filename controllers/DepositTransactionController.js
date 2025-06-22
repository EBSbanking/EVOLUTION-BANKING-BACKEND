// controllers/DepositTransactionController.js

import { createGLTransaction } from '../controllers/GLAccountTransactionSingle.js';
import DepositTransaction from '../models/DepositTransaction.js';
import NotificationService from '../services/NotificationService.js';
import CustomerAccount from '../models/CustomerAccount.js';
import TransactionPolicy from '../models/TransactionPolicy.js';
import Ledger from '../models/Ledger.js';
import GLAccount from '../models/GLAccount.js';
import Subfolder from '../models/Subfolder.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import mongoose from 'mongoose';

const generateTransactionRefNo = () => `TRX${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateNumber = len => Math.random().toString().slice(2, 2 + len).padStart(len, '0');
const normalizeRecSt = val => val ? val.charAt(0).toUpperCase() + val.slice(1).toLowerCase() : 'Active';

const generateWorkflowIdentifiers = () => ({
  WORK_ITEM_ID: generateNumber(6),
  QUEUE_ID: generateNumber(4),
  SUB_PROC_ID: generateNumber(4),
  BUS_PROC_ID: generateNumber(4)
});

// Default values for required GL account fields
const GL_ACCOUNT_DEFAULTS = {
  GL_ACCT_CAT_CD: 'ASSET', // Default category (adjust based on your needs)
  CHART_OF_ACCT_ID: 'DEFAULT_CHART', // Default chart of accounts
  GL_ACCT_ID: `GL_${Date.now()}` // Auto-generated if missing
};

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
    return res.status(400).json({
      message: 'Missing required fields',
      missingFields,
      receivedData: req.body
    });
  }

  if (!AMOUNT || AMOUNT <= 0) {
    return res.status(400).json({
      message: 'Amount must be a positive number',
      receivedAmount: AMOUNT
    });
  }

  const finalAmount = AMOUNT - TOTAL_CHARGES;
  if (finalAmount <= 0) {
    return res.status(400).json({
      message: 'Amount after charges must be positive',
      amount: AMOUNT,
      charges: TOTAL_CHARGES,
      finalAmount
    });
  }

  try {
    // Check if customer account exists
    const customer = await CustomerAccount.findOne({ ACCT_NO });
    if (!customer) {
      return res.status(404).json({
        message: 'Customer account not found',
        ACCT_NO
      });
    }

    // Find or create ledger with enhanced error handling
    let ledger = await Ledger.findOne({ GL_ACCT_NO });
    
    if (!ledger) {
      let glAccount = await GLAccount.findOne({ GL_ACCT_NO });

      // If GL account doesn't exist, create a minimal one with defaults
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
        console.log(`⚠️ Created new GL account with defaults: ${GL_ACCT_NO}`);
      }

      // Apply defaults for any missing required fields
      const ledgerData = {
        JOURNAL_ID: Math.floor(Math.random() * 1_000_000_000),
        LEDGER_NO: Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`),
        GL_ACCT_NO,
        BAL_CD: 'CR',
        SUB_LEDGER_NO: '0000',
        BU_ID: glAccount.BU_ID || BUSINESS_UNIT,
        SEG_NO: '001',
        CHART_OF_ACCT_ID: glAccount.CHART_OF_ACCT_ID || GL_ACCOUNT_DEFAULTS.CHART_OF_ACCT_ID,
        ACCT_DESC: glAccount.ACCT_DESC || ACCT_NM || 'Auto Ledger',
        GL_ACCT_ID: glAccount.GL_ACCT_ID || GL_ACCOUNT_DEFAULTS.GL_ACCT_ID,
        GL_ACCT_STRUCT_ID: glAccount.GL_ACCT_STRUCT_ID || '',
        GL_ACCT_CAT_CD: glAccount.GL_ACCT_CAT_CD || GL_ACCOUNT_DEFAULTS.GL_ACCT_CAT_CD,
        LEDGER_BALANCE: 0,
        CREATED_BY: USER_ID,
        CREATE_DT: new Date(),
        TRANSACTION_TYPE: 'Credit',
        AMOUNT: 0
      };

      ledger = new Ledger(ledgerData);
      await ledger.save();
      console.log(`✅ Created new ledger for GL account: ${GL_ACCT_NO}`);
    }

    // Check transaction policy
    const policy = await TransactionPolicy.findOne({ ROLE_NM: new RegExp(`^${ROLE_NM}$`, 'i') });
    if (!policy) {
      return res.status(403).json({
        message: `No transaction policy found for role: ${ROLE_NM}`,
        ROLE_NM
      });
    }

    const range = policy.RANGES.find(r => AMOUNT >= r.MIN_AMOUNT && AMOUNT <= r.MAX_AMOUNT);
    if (!range) {
      return res.status(403).json({
        message: `No policy range found for amount ${AMOUNT}`,
        AMOUNT,
        policyRanges: policy.RANGES
      });
    }

    // Handle approval workflow if needed
    if (range.requiresApproval) {
      const identifiers = generateWorkflowIdentifiers();
      const { WORK_ITEM_ID, QUEUE_ID, SUB_PROC_ID, BUS_PROC_ID } = identifiers;

      const workflowItem = new WF_WORK_ITEM({
        WORK_ITEM_ID,
        ITEM_VALUE: AMOUNT,
        ITEM_DESC: `Deposit of ${AMOUNT} for Account ${ACCT_NO}`,
        ITEM_CLASS_NM: 'Transaction',
        ITEM_TYPE: 'Deposit',
        EVENT_ID: generateNumber(7),
        CUST_ID,
        REC_ST: 'Pending',
        VERSION: 1,
        USER_ID,
        BU_ID: BUSINESS_UNIT,
        CREATE_DT: new Date(),
        WAIT_ST: 'Pending',
        ITEM_ID: generateNumber(4),
        ITEM_REF_NO: generateNumber(4),
        ORIGINATOR_USER_ROLE_ID: USER_ID,
        QUEUE_ID,
        SUB_PROC_ID,
        BUS_PROC_ID,
        TARGET_USER_ROLE_ID: 'Manager'
      });

      await workflowItem.save();

      if (workflowItem.TARGET_USER_ROLE_ID && WORK_ITEM_ID) {
        await NotificationService.send({
          ROLE_ID: workflowItem.TARGET_USER_ROLE_ID,
          message: `Deposit of ₦${AMOUNT} for Account ${ACCT_NO} requires approval`,
          WORK_ITEM_ID: workflowItem.WORK_ITEM_ID,
          CUST_ID
        });
      }

      return res.status(202).json({
        message: 'Transaction requires approval',
        workflowItem: {
          WORK_ITEM_ID,
          status: 'Pending',
          targetRole: workflowItem.TARGET_USER_ROLE_ID
        }
      });
    }

    // Process the deposit transaction
    const balanceBefore = parseFloat(customer.LEDGER_BAL) || 0;
    const newBalance = balanceBefore + finalAmount;
    const transactionRefNo = generateTransactionRefNo();

    const deposit = new DepositTransaction({
      ACCT_ID,
      ACCT_NO,
      ACCT_NM,
      GL_ACCT_NO,
      TRANSACTION_TYPE: 'Deposit',
      AMOUNT: finalAmount,
      TRANSACTION_REF_NO: transactionRefNo,
      BALANCE_AFTER_TRANSACTION: newBalance,
      VALUE_DATE: new Date(VALUE_DATE),
      TRANSACTION_DATE: new Date(TRANSACTION_DATE),
      STATUS: 'Approved',
      APPROVED_BY: USER_ID,
      APPROVED_DATE: new Date(),
      BUSINESS_UNIT,
      DEPOSITOR_NAME,
      CURRENCY_COUNT,
      TOTAL_CURRENCY_COUNT,
      REC_ST: 'Active',
      DESCRIPTION: DESCRIPTION || `Cash deposit at counter by ${DEPOSITOR_NAME}`
    });

    await deposit.save();

    // Update customer balances
    customer.LEDGER_BAL = newBalance;
    customer.CLEARED_BAL = newBalance;
    customer.AVAILABLE_BALANCE = newBalance;
    customer.lastActivityDate = new Date();
    customer.UPDATED_AT = new Date();
    await customer.save();

    // Create GL transaction
    await createGLTransaction(
      null,
      null,
      {
        GL_ACCT_NO,
        AMOUNT: finalAmount,
        TRANSACTION_TYPE: 'CREDIT',
        DRS_ALLOWED_FG: false,
        CRS_ALLOWED_FG: true,
        CREATED_BY: USER_ID,
        CREATE_DT: new Date(TRANSACTION_DATE),
        description: DESCRIPTION || `Deposit for ${ACCT_NO}`,
        SUB_LEDGER_NO: ACCT_NO,
        SEG_NO: BUSINESS_UNIT
      }
    );

    console.log(`✅ Deposit successful: ₦${finalAmount} to ${ACCT_NO}`);

    return res.status(201).json({
      message: 'Deposit completed successfully',
      transaction: {
        reference: transactionRefNo,
        amount: finalAmount,
        charges: TOTAL_CHARGES,
        date: new Date()
      },
      balance: {
        previous: balanceBefore,
        new: newBalance,
        available: newBalance
      },
      account: {
        ACCT_NO,
        ACCT_NM
      }
    });

  } catch (err) {
    console.error('❌ Deposit processing error:', err);
    return res.status(500).json({
      message: 'Transaction processing failed',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};



export const approveDepositTransaction = async (req, res) => {
  const { WORK_ITEM_ID, APPROVED_BY } = req.body;

  if (!WORK_ITEM_ID || !APPROVED_BY) {
    return res.status(400).json({ message: 'WORK_ITEM_ID and APPROVED_BY are required' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const workItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID }).session(session);
    if (!workItem) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Work item not found' });
    }

    const amount = parseFloat(workItem.ITEM_VALUE);
    const CUST_ID = workItem.CUST_ID;
    const accountMatch = workItem.ITEM_DESC.match(/account\s(\d+)/i);
    const ACCT_NO = accountMatch ? accountMatch[1] : null;

    if (!ACCT_NO || isNaN(amount)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid account number or amount in workflow item' });
    }

    const customer = await CustomerAccount.findOne({ ACCT_NO }).session(session);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Customer account not found' });
    }

    const balanceBefore = parseFloat(customer.LEDGER_BAL) || 0;
    const newBalance = balanceBefore + amount;
    const transactionRefNo = generateTransactionRefNo();

    const deposit = new DepositTransaction({
      ACCT_ID: customer.ACCT_ID,
      ACCT_NO,
      ACCT_NM: customer.ACCT_NM,
      GL_ACCT_NO: customer.GL_ACCT_NO || '',
      TRANSACTION_TYPE: 'Deposit',
      AMOUNT: amount,
      TRANSACTION_REF_NO: transactionRefNo,
      BALANCE_AFTER_TRANSACTION: newBalance,
      VALUE_DATE: new Date(),
      STATUS: 'Approved',
      APPROVED_BY,
      APPROVED_DATE: new Date(),
      BUSINESS_UNIT: customer.BU_ID || '',
      CURRENCY_COUNT: 1,
      TOTAL_CURRENCY_COUNT: 1,
      REC_ST: 'Active'
    });

    await deposit.save({ session });

    customer.LEDGER_BAL = newBalance;
    customer.CLEARED_BAL = newBalance;
    customer.AVAILABLE_BALANCE = newBalance;
    customer.lastActivityDate = new Date();
    customer.UPDATED_AT = new Date();
    await customer.save({ session });

    workItem.REC_ST = 'Approved';
    workItem.WAIT_ST = 'Approved';
    workItem.APPROVED_BY = APPROVED_BY;
    workItem.APPROVED_DT = new Date();
    await workItem.save({ session });

    await session.commitTransaction();
    session.endSession();

    await NotificationService.send({
      ACCT_NO,
      message: `Your deposit of ₦${amount} has been approved. New balance: ₦${newBalance}`
    });

    await NotificationService.send({
      USER_ID: workItem.USER_ID,
      message: `Deposit transaction of ₦${amount} (Ref: ${transactionRefNo}) approved by ${APPROVED_BY}`,
      WORK_ITEM_ID
    });

    return res.status(200).json({
      message: 'Deposit transaction approved and processed successfully',
      transaction: deposit,
      newBalance
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('❌ Error approving deposit transaction:', error);
    return res.status(500).json({ 
      message: 'Error approving transaction', 
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
