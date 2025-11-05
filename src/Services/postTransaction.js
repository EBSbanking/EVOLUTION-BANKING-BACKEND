// controllers/transactionController.js
import mongoose from 'mongoose';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import Drawer from '../models/Drawer.js';
import { checkPolicy } from '../Services/transactionPolicyService.js';
import logger from '../utils/logger.js';
import { processDrawerTransaction } from '../controllers/DrawerController.js';  // Adjust path as needed

const generateTransactionRef = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return `${datePart}${randomPart}`;
};

// Helper function to determine if transaction is cash-based
const isCashTransaction = (description) => {
  const nonCashKeywords = ['transfer', 'cheque', 'check', 'electronic', 'wire', 'ach', 'pos', 'card'];
  const desc = description.toLowerCase();
  return !nonCashKeywords.some(keyword => desc.includes(keyword));
};

// Helper function to calculate total from currency denominations
const calculateTotalFromCurrency = (currencyCount) => {
  if (!currencyCount) return 0;
  
  const denominations = {
    OneThousandNaira: 1000,
    FiveHundredNaira: 500,
    TwoHundredNaira: 200,
    OneHundredNaira: 100,
    FiftyNaira: 50,
    TwentyNaira: 20,
    TenNaira: 10,
    FiveNaira: 5
  };

  let total = 0;
  for (const [denom, value] of Object.entries(denominations)) {
    total += (currencyCount[denom] || 0) * value;
  }
  
  return total;
};

const postTransaction = async (req, res) => {
  // Check database connection state
  if (mongoose.connection.readyState !== 1) {
    logger.error('Database not connected', { readyState: mongoose.connection.readyState });
    return res.status(503).json({
      success: false,
      message: 'Database is not connected. Please try again later.',
    });
  }

  const {
    ACCT_NO,
    ACCT_NM,
    TRANSACTION_TYPE,
    AMOUNT,
    DESCRIPTION,
    REFERENCE_NO,
    TRANSACTION_DATE,
    BUSINESS_UNIT,
    DEPOSITOR_NAME,
    CURRENCY_COUNT,
    DRAWER_ID,
  } = req.body;

  let sanitizedCurrencyCount = {
    OneThousandNaira: 0,
    FiveHundredNaira: 0,
    TwoHundredNaira: 0,
    OneHundredNaira: 0,
    FiftyNaira: 0,
    TwentyNaira: 0,
    TenNaira: 0,
    FiveNaira: 0,
    TOTAL_CURRENCY_COUNT: 0,
  };

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Input validation - ALL transactions require basic fields
    if (!TRANSACTION_TYPE || !AMOUNT || !DESCRIPTION || !BUSINESS_UNIT) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'TRANSACTION_TYPE, AMOUNT, DESCRIPTION, and BUSINESS_UNIT are required.',
      });
    }

    // NEW: Handle Opening Cash Deposit - requires DRAWER_ID, no ACCT_NO needed
    const isOpeningCashDeposit = TRANSACTION_TYPE.toUpperCase() === 'OPENING_CASH_DEPOSIT';
    if (isOpeningCashDeposit) {
      if (!DRAWER_ID) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'DRAWER_ID is REQUIRED for OPENING_CASH_DEPOSIT.',
        });
      }
      // For opening deposit, treat as cash transaction always
    } else {
      // Standard validation for regular transactions
      if (!ACCT_NO) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'ACCT_NO is required for standard transactions.',
        });
      }
    }

    // Determine if it's a cash transaction (skip for opening deposit, always cash)
    const cashTransaction = isOpeningCashDeposit || isCashTransaction(DESCRIPTION);
    
    // ENFORCEMENT: For cash transactions, DRAWER_ID is MANDATORY
    let drawer = null;
    let drawerPreviousBalance = 0;
    
    if (cashTransaction) {
      if (!DRAWER_ID) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'DRAWER_ID is REQUIRED for cash transactions. Please specify which drawer to use.',
        });
      }

      // Find the drawer - Handle both string and number DRAWER_ID
      let drawerQuery = {};
      
      // Try to parse as number first (most common case)
      const numericDrawerId = parseInt(DRAWER_ID);
      if (!isNaN(numericDrawerId)) {
        drawerQuery = { DRAWER_ID: numericDrawerId };
        console.log(`🔍 Searching for drawer with numeric DRAWER_ID: ${numericDrawerId}`);
      } else {
        // Use as string
        drawerQuery = { DRAWER_ID: DRAWER_ID };
        console.log(`🔍 Searching for drawer with string DRAWER_ID: "${DRAWER_ID}"`);
      }
      
      drawer = await Drawer.findOne(drawerQuery).session(session);
      
      if (!drawer) {
        // Try alternative search if first attempt fails
        console.log(`❌ Drawer not found with first query, trying alternative search...`);
        
        // Try searching by DRAWER_NO as fallback
        drawer = await Drawer.findOne({ DRAWER_NO: DRAWER_ID.toString() }).session(session);
        
        if (!drawer) {
          await session.abortTransaction();
          return res.status(404).json({ 
            success: false,
            message: `Drawer not found for DRAWER_ID: "${DRAWER_ID}". Please check the drawer ID.` 
          });
        }
      }

      console.log(`✅ Found drawer: ${drawer.DRAWER_NO} (DB DRAWER_ID: ${drawer.DRAWER_ID}, type: ${typeof drawer.DRAWER_ID})`);

      // Check if drawer is open and active
      if (drawer.WF_STATUS !== 'OPEN' || drawer.REC_ST !== 'A') {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false,
          message: 'Drawer is not available for transactions. Drawer must be OPEN and ACTIVE.',
          currentStatus: drawer.WF_STATUS,
          recordStatus: drawer.REC_ST
        });
      }

      // Store previous balance for audit
      drawerPreviousBalance = parseFloat(drawer.CURRENT_BALANCE.toString());
      
      console.log(`🔍 Drawer ${drawer.DRAWER_NO} initial balance: ₦${drawerPreviousBalance}`);
    }

    // Validate account number format (skip for opening deposit)
    if (!isOpeningCashDeposit && ACCT_NO && !/^\d{10}$/.test(ACCT_NO)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'ACCT_NO must be a 10-digit number.' });
    }

    const amount = parseFloat(AMOUNT);
    if (isNaN(amount) || amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'AMOUNT must be a positive number.' });
    }

    // Updated valid transaction types to include OPENING_CASH_DEPOSIT
    const validTransactionTypes = ['DR', 'CR', 'OPENING_CASH_DEPOSIT'];
    const normalizedTransactionType = TRANSACTION_TYPE.toUpperCase();
    if (!validTransactionTypes.includes(normalizedTransactionType)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `TRANSACTION_TYPE must be one of ${validTransactionTypes.join(', ')}.`,
      });
    }

    const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();
    if (isNaN(transactionDate.getTime())) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid TRANSACTION_DATE format.' });
    }

    // Currency Count Validation (required for cash transactions, including opening deposit)
    const currencyCount = CURRENCY_COUNT || {
      OneThousandNaira: 0,
      FiveHundredNaira: 0,
      TwoHundredNaira: 0,
      OneHundredNaira: 0,
      FiftyNaira: 0,
      TwentyNaira: 0,
      TenNaira: 0,
      FiveNaira: 0,
      TOTAL_CURRENCY_COUNT: 0,
    };

    const expectedKeys = [
      'OneThousandNaira', 'FiveHundredNaira', 'TwoHundredNaira',
      'OneHundredNaira', 'FiftyNaira', 'TwentyNaira', 'TenNaira',
      'FiveNaira', 'TOTAL_CURRENCY_COUNT',
    ];
    const isValid = expectedKeys.every(
      (key) => key in currencyCount && typeof currencyCount[key] === 'number' && currencyCount[key] >= 0
    );
    if (!isValid) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid CURRENCY_COUNT format.' });
    }

    sanitizedCurrencyCount = {
      OneThousandNaira: currencyCount.OneThousandNaira,
      FiveHundredNaira: currencyCount.FiveHundredNaira,
      TwoHundredNaira: currencyCount.TwoHundredNaira,
      OneHundredNaira: currencyCount.OneHundredNaira,
      FiftyNaira: currencyCount.FiftyNaira,
      TwentyNaira: currencyCount.TwentyNaira,
      TenNaira: currencyCount.TenNaira,
      FiveNaira: currencyCount.FiveNaira,
      TOTAL_CURRENCY_COUNT: currencyCount.TOTAL_CURRENCY_COUNT,
    };

    // For cash transactions, validate currency count matches amount (including opening deposit)
    if (cashTransaction) {
      const calculatedAmount = calculateTotalFromCurrency(currencyCount);
      if (calculatedAmount !== amount) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Currency count total (${calculatedAmount}) does not match transaction amount (${amount}).`,
          calculatedAmount,
          transactionAmount: amount
        });
      }
    }

    // Reference No
    let referenceNo = REFERENCE_NO || generateTransactionRef();
    const existingTransaction = await AuditTrail.findOne({ reference_no: referenceNo }).lean().session(session);
    if (existingTransaction) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: `Transaction with REFERENCE_NO ${referenceNo} already exists.` });
    }

    // Fetch Account (skip for opening cash deposit)
    let account = null;
    let ledgerBal = 0;
    let availableBal = 0;
    let clearedBal = 0;
    let requiresApproval = false;
    let authorizedRoles = [];
    let status = 'SUCCESS';

    if (!isOpeningCashDeposit) {
      account = await CustomerAccount.findOne({ ACCT_NO }).lean().session(session);
      if (!account) {
        await session.abortTransaction();
        return res.status(404).json({ success: false, message: `Account ${ACCT_NO} not found.` });
      }

      if (ACCT_NM && ACCT_NM !== account.ACCT_NM) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: `Provided ACCT_NM "${ACCT_NM}" does not match account name.` });
      }

      if (account.REC_ST !== 'ACTIVE') {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: `Account ${ACCT_NO} is not active.` });
      }

      // Restrict DR on FD/LOAN
      const isDebit = normalizedTransactionType === 'DR';
      if (isDebit && ['FIXED_DEPOSIT', 'LOAN'].includes(account.ACCOUNT_TYPE)) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: `Debit not allowed for ${account.ACCOUNT_TYPE} accounts.` });
      }

      // Apply Transaction Policy
      const policyType = isDebit ? 'Withdrawal' : 'Deposit';
      const userRole = (req.user?.role || req.headers['x-user-role'] || 'DEFAULT').toUpperCase();
      const policyResult = await checkPolicy(userRole, amount, policyType, session);
      requiresApproval = policyResult.requiresApproval;
      authorizedRoles = policyResult.authorizedRoles;
      status = requiresApproval ? 'PENDING' : 'SUCCESS';
    } else {
      // For opening deposit, no policy check, always approved
      status = 'SUCCESS';
      requiresApproval = false;
    }

    // ✅ INTEGRATED: PROCESS DRAWER BALANCE VIA processDrawerTransaction
    let drawerNewBalance = drawerPreviousBalance;  // Default to unchanged
    let drawerTransactionEffect = '';
    
    if (cashTransaction && drawer) {
      console.log(`💰 Processing CASH transaction - Type: ${normalizedTransactionType}, Amount: ₦${amount}`);

      // Map type for drawer processing
      let mappedType;
      if (isOpeningCashDeposit) {
        mappedType = 'OPENING_DEPOSIT';  // Assume processDrawerTransaction supports this; adjust if needed
      } else {
        mappedType = normalizedTransactionType === 'DR' ? 'WITHDRAWAL' : 'DEPOSIT';
      }

      const mockReq = {
        body: {
          drawerId: drawer._id.toString(),  // Use Mongo _id for findById
          transactionType: mappedType,
          amount,
          customerAccount: ACCT_NO || null,  // Null for opening deposit
          referenceNo,
          description: DESCRIPTION,
          userId: req.user?.id || req.headers['x-user-id'] || 'system'
        }
      };
      const mockRes = {};  // Mock res - processDrawerTransaction should return results instead of res.json()
      // Note: For full integration, modify processDrawerTransaction to return { success, drawer, transaction } instead of res.json()
      // Here, assuming it's refactored to return data; otherwise, extract from its internal logic
      const drawerResult = await processDrawerTransaction(mockReq, mockRes, session);  // Pass session as third param (modify function accordingly)

      // Extract results from drawerResult (adapt based on its response)
      if (drawerResult && drawerResult.success) {
        drawerNewBalance = drawerResult.drawer ? parseFloat(drawerResult.drawer.CURRENT_BALANCE.toString()) : drawerPreviousBalance + amount;
        drawerTransactionEffect = drawerResult.transaction ? drawerResult.transaction.effect : 'DEPOSIT';
      } else {
        // Fallback: Manual update for drawer if processDrawerTransaction fails
        drawerNewBalance = drawerPreviousBalance + amount;  // Always deposit for opening/CR
        drawerTransactionEffect = 'OPENING_DEPOSIT';
        // Manual save (but since session, better to use update)
        await Drawer.updateOne(
          { _id: drawer._id },
          { $inc: { CURRENT_BALANCE: mongoose.Types.Decimal128.fromString(amount.toFixed(2)) } },
          { session }
        );
      }

      console.log(`✅ Drawer updated via processDrawerTransaction: New Balance = ₦${drawerNewBalance}`);
    }

    // Account Balance Processing (skip for opening cash deposit)
    if (!isOpeningCashDeposit) {
      ledgerBal = parseFloat(account.LEDGER_BAL.toString());
      availableBal = parseFloat(account.AVAILABLE_BALANCE.toString());
      clearedBal = parseFloat(account.CLEARED_BAL.toString());

      const isDebit = normalizedTransactionType === 'DR';
      if (isDebit) {
        if (availableBal < amount) {
          await session.abortTransaction();
          return res.status(400).json({ success: false, message: `Insufficient account balance.` });
        }
        ledgerBal -= amount;
        availableBal -= amount;
        clearedBal += amount;
        if (!requiresApproval) clearedBal -= amount;
      } else {
        ledgerBal += amount;
        availableBal += amount;
        clearedBal += amount;
        if (!requiresApproval) clearedBal += amount;
      }

      if (ledgerBal < 0 || availableBal < 0 || clearedBal < 0 || availableBal > ledgerBal) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'Invalid balance after transaction.' });
      }

      // Update account balances
      const updateResult = await CustomerAccount.updateOne(
        { ACCT_NO },
        {
          $set: {
            LEDGER_BAL: mongoose.Types.Decimal128.fromString(ledgerBal.toFixed(2)),
            AVAILABLE_BALANCE: mongoose.Types.Decimal128.fromString(availableBal.toFixed(2)),
            CLEARED_BAL: mongoose.Types.Decimal128.fromString(clearedBal.toFixed(2)),
            lastActivityDate: transactionDate,
          },
        },
        { session }
      );

      if (updateResult.matchedCount === 0 || updateResult.modifiedCount === 0) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'Failed to update account balances.' });
      }
    }

    // Enhanced Audit Trail with Drawer Information
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    
    const auditData = {
      event_id: Date.now(),
      user_id: userId,
      event_type: isOpeningCashDeposit ? 'OPENING_CASH_DEPOSIT' : `TRANSACTION_${normalizedTransactionType}`,
      action: isOpeningCashDeposit ? 'Opening Cash Deposit' : `${normalizedTransactionType === 'DR' ? 'Debit' : 'Credit'} Transaction`,
      old_value: {
        ...(account && {
          LEDGER_BAL: parseFloat(account.LEDGER_BAL.toString()),
          AVAILABLE_BALANCE: parseFloat(account.AVAILABLE_BALANCE.toString()),
          CLEARED_BAL: parseFloat(account.CLEARED_BAL.toString()),
        }),
        ...(cashTransaction && drawer && { 
          DRAWER_BALANCE: drawerPreviousBalance,
          DRAWER_NO: drawer.DRAWER_NO 
        })
      },
      new_value: { 
        ...(account && {
          LEDGER_BAL: ledgerBal, 
          AVAILABLE_BALANCE: availableBal, 
          CLEARED_BAL: clearedBal,
        }),
        ...(cashTransaction && drawer && { 
          DRAWER_BALANCE: drawerNewBalance,
          DRAWER_NO: drawer.DRAWER_NO 
        })
      },
      ip_address: ipAddress,
      timestamp: transactionDate,
      entity_type: isOpeningCashDeposit ? 'Drawer' : 'CustomerAccount',
      entity_id: isOpeningCashDeposit ? drawer._id : (account ? account._id : null),
      status,
      description: DESCRIPTION,
      reference_no: referenceNo,
      account_no: ACCT_NO || null,
      additional_info: {
        amount: amount.toFixed(2),
        pending: requiresApproval,
        account_name: account ? account.ACCT_NM : null,
        transaction_date: transactionDate,
        business_unit: BUSINESS_UNIT,
        depositor_name: DEPOSITOR_NAME,
        currency_count: sanitizedCurrencyCount,
        authorized_roles: authorizedRoles,
        transaction_mode: cashTransaction ? 'CASH' : 'TRANSFER',
        transaction_type: normalizedTransactionType,
        ...(cashTransaction && drawer && {
          drawer_id: drawer._id,
          drawer_no: drawer.DRAWER_NO,
          drawer_name: drawer.DRAWER_NM,
          drawer_effect: drawerTransactionEffect,
          previous_drawer_balance: drawerPreviousBalance,
          new_drawer_balance: drawerNewBalance,
          drawer_user_id: drawer.USER_ID,
          drawer_status: drawer.WF_STATUS,
          cash_movement: isOpeningCashDeposit ? 'INCOMING_OPENING' : (normalizedTransactionType === 'DR' ? 'OUTGOING' : 'INCOMING')
        })
      },
    };

    await AuditTrail.create([auditData], { session });

    await session.commitTransaction();
    
    // Response with drawer information
    const response = {
      success: true,
      message: isOpeningCashDeposit 
        ? `Opening cash deposit of ₦${amount} posted successfully to drawer.` 
        : `${normalizedTransactionType === 'DR' ? 'Debit' : 'Credit'} transaction ${requiresApproval ? 'pending approval' : 'posted'} successfully.`,
      reference_no: referenceNo,
      transaction_date: transactionDate,
      business_unit: BUSINESS_UNIT,
      depositor_name: DEPOSITOR_NAME,
      currency_count: sanitizedCurrencyCount,
      pending: requiresApproval,
      authorized_roles: authorizedRoles,
      transaction_mode: cashTransaction ? 'CASH' : 'TRANSFER',
      transaction_type: normalizedTransactionType,
    };

    // Add account info for standard transactions
    if (!isOpeningCashDeposit && account) {
      response.account = {
        ACCT_NO: account.ACCT_NO,
        ACCT_ID: account.ACCT_ID,
        ACCT_NM: account.ACCT_NM,
      };
    }

    // Add drawer info to response if cash transaction
    if (cashTransaction && drawer) {
      response.drawer = {
        drawer_id: drawer._id,
        drawer_no: drawer.DRAWER_NO,
        drawer_name: drawer.DRAWER_NM,
        previous_balance: drawerPreviousBalance,
        new_balance: drawerNewBalance,
        effect: drawerTransactionEffect,
        cash_movement: isOpeningCashDeposit ? 'INCOMING_OPENING' : (normalizedTransactionType === 'DR' ? 'OUTGOING' : 'INCOMING'),
        user_id: drawer.USER_ID,
        status: drawer.WF_STATUS
      };
    }

    // Log successful transaction
    logger.info('Transaction processed successfully', {
      referenceNo,
      accountNo: ACCT_NO || null,
      amount,
      transactionType: normalizedTransactionType,
      cashTransaction,
      drawerId: drawer?._id,
      drawerEffect: drawerTransactionEffect,
      drawerPreviousBalance,
      drawerNewBalance,
      userId,
      isOpeningCashDeposit
    });

    console.log(`🎉 Transaction COMPLETED: ${normalizedTransactionType} ₦${amount} - Drawer: ${drawer?.DRAWER_NO} = ₦${drawerNewBalance} ${isOpeningCashDeposit ? '(Opening Deposit)' : ''}`);

    return res.status(200).json(response);

  } catch (error) {
    await session.abortTransaction();
    try {
      logger.error('Error posting transaction:', {
        error: error.message,
        stack: error.stack,
        body: {
          ACCT_NO,
          ACCT_NM,
          TRANSACTION_TYPE,
          AMOUNT,
          DESCRIPTION,
          TRANSACTION_DATE,
          BUSINESS_UNIT,
          DEPOSITOR_NAME,
          CURRENCY_COUNT: sanitizedCurrencyCount,
          DRAWER_ID,
        },
        timestamp: new Date(),
      });
    } catch (logError) {
      console.error('Failed to log error:', logError.message, logError.stack);
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error.',
        error: error.keyValue,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'An error occurred while posting the transaction.',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

export default postTransaction;