// controllers/transactionController.js
import mongoose from 'mongoose';
import CustomerAccount from '../models/CustomerAccount.js';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import AuditTrail from '../models/AuditTrail.js';
import Drawer from '../models/Drawer.js';
import { checkPolicy } from '../Services/transactionPolicyService.js';
import logger from '../utils/logger.js';
import { processDrawerTransaction } from '../controllers/DrawerController.js';

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

// UPDATED: Function to find account by account number across both models
const findAccountByNumber = async (accountNumber, session = null) => {
  console.log(`🔍 Searching for account: ${accountNumber}`);
  
  const queryOptions = session ? { session } : {};

  // FIRST: Try CustomerAccount model with account_number field (your updated schema)
  let account = await CustomerAccount.findOne({ 
    account_number: accountNumber 
  }).lean().session(session);
  
  if (account) {
    console.log(`✅ Found account in CustomerAccount: ${account.account_number} - ${account.product_type}`);
    
    // Determine account name based on available fields
    let accountName = account.account_name || `Customer ${account.customer_id}`;
    if (account.ACCT_NM) accountName = account.ACCT_NM; // Legacy field
    
    return {
      model: 'CustomerAccount',
      data: account,
      accountNumber: account.account_number,
      accountName: accountName,
      accountId: account._id,
      ledgerBalance: parseFloat(account.ledger_balance?.toString() || account.ledgerBalance?.toString() || '0'),
      availableBalance: parseFloat(account.available_balance?.toString() || account.AVAILABLE_BALANCE?.toString() || '0'),
      clearedBalance: parseFloat(account.cleared_balance?.toString() || account.clearedBalance?.toString() || '0'),
      accountType: account.product_type || account.ACCOUNT_TYPE,
      status: account.status || account.REC_ST,
      currencyId: account.currency || 'NGN',
      productId: account.product,
      customerId: account.customer_id,
      branch: account.branch
    };
  }

  // SECOND: Try CustomerAccount model with ACCT_NO field (legacy accounts)
  account = await CustomerAccount.findOne({ 
    ACCT_NO: accountNumber 
  }).lean().session(session);
  
  if (account) {
    console.log(`✅ Found account in CustomerAccount (legacy): ${account.ACCT_NO} - ${account.ACCT_NM}`);
    return {
      model: 'CustomerAccount',
      data: account,
      accountNumber: account.ACCT_NO,
      accountName: account.ACCT_NM,
      accountId: account.ACCT_ID || account._id,
      ledgerBalance: parseFloat(account.LEDGER_BAL?.toString() || '0'),
      availableBalance: parseFloat(account.AVAILABLE_BALANCE?.toString() || '0'),
      clearedBalance: parseFloat(account.CLEARED_BAL?.toString() || '0'),
      accountType: account.ACCOUNT_TYPE,
      status: account.REC_ST,
      currencyId: account.CRNCY_ID,
      productId: account.PROD_ID,
      customerId: account.CUST_ID
    };
  }
  
  // THIRD: Try DepositAccountApplication model
  account = await DepositAccountApplication.findOne({ 
    ACCT_NO: accountNumber 
  }).lean().session(session);
  
  if (account) {
    console.log(`✅ Found account in DepositAccountApplication: ${account.ACCT_NO} - ${account.ACCT_NM}`);
    return {
      model: 'DepositAccountApplication',
      data: account,
      accountNumber: account.ACCT_NO,
      accountName: account.ACCT_NM,
      accountId: account.ACCT_ID,
      ledgerBalance: parseFloat(account.LEDGER_BAL?.toString() || '0'),
      availableBalance: parseFloat(account.AVAILABLE_BALANCE?.toString() || '0'),
      clearedBalance: parseFloat(account.CLEARED_BAL?.toString() || '0'),
      accountType: account.ACCOUNT_TYPE,
      status: account.STATUS,
      currencyId: account.CRNCY_ID,
      productId: account.PROD_ID,
      customerId: account.CUST_ID
    };
  }
  
  console.log(`❌ Account not found in any model: ${accountNumber}`);
  return null;
};

// UPDATED: Function to update account balances in the correct model
const updateAccountBalances = async (accountInfo, newBalances, session) => {
  const { model, accountNumber, data } = accountInfo;
  const { ledgerBalance, availableBalance, clearedBalance } = newBalances;
  
  console.log(`🔄 Updating account balances for ${accountNumber} in ${model}:`, {
    ledgerBalance,
    availableBalance,
    clearedBalance
  });
  
  const updateData = {
    lastActivityDate: new Date(),
    updatedAt: new Date()
  };
  
  // Add balance fields based on model structure
  switch (model) {
    case 'CustomerAccount':
      // For updated CustomerAccount schema with account_number field
      updateData.ledger_balance = mongoose.Types.Decimal128.fromString(ledgerBalance.toFixed(2));
      updateData.available_balance = mongoose.Types.Decimal128.fromString(availableBalance.toFixed(2));
      updateData.cleared_balance = mongoose.Types.Decimal128.fromString(clearedBalance.toFixed(2));
      // Also update legacy fields if they exist
      updateData.LEDGER_BAL = mongoose.Types.Decimal128.fromString(ledgerBalance.toFixed(2));
      updateData.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(availableBalance.toFixed(2));
      updateData.CLEARED_BAL = mongoose.Types.Decimal128.fromString(clearedBalance.toFixed(2));
      break;
      
    case 'DepositAccountApplication':
      updateData.LEDGER_BAL = mongoose.Types.Decimal128.fromString(ledgerBalance.toFixed(2));
      updateData.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(availableBalance.toFixed(2));
      updateData.CLEARED_BAL = mongoose.Types.Decimal128.fromString(clearedBalance.toFixed(2));
      break;
  }
  
  let updateResult;
  
  switch (model) {
    case 'CustomerAccount':
      // Try updating by account_number first, then by ACCT_NO
      updateResult = await CustomerAccount.updateOne(
        { account_number: accountNumber },
        { $set: updateData },
        { session }
      );
      
      if (updateResult.matchedCount === 0) {
        // Try with ACCT_NO for legacy accounts
        updateResult = await CustomerAccount.updateOne(
          { ACCT_NO: accountNumber },
          { $set: updateData },
          { session }
        );
      }
      break;
      
    case 'DepositAccountApplication':
      updateResult = await DepositAccountApplication.updateOne(
        { ACCT_NO: accountNumber },
        { $set: updateData },
        { session }
      );
      break;
  }
  
  if (updateResult.matchedCount === 0) {
    throw new Error(`Account ${accountNumber} not found in ${model} during update`);
  }
  
  if (updateResult.modifiedCount === 0) {
    console.warn(`No changes made to account ${accountNumber} - balances may be the same`);
  }
  
  return updateResult;
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

    // Handle Opening Cash Deposit - requires DRAWER_ID, no ACCT_NO needed
    const isOpeningCashDeposit = TRANSACTION_TYPE.toUpperCase() === 'OPENING_CASH_DEPOSIT';
    if (isOpeningCashDeposit) {
      if (!DRAWER_ID) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'DRAWER_ID is REQUIRED for OPENING_CASH_DEPOSIT.',
        });
      }
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

    // Determine if it's a cash transaction
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

      // Find the drawer
      let drawerQuery = {};
      const numericDrawerId = parseInt(DRAWER_ID);
      if (!isNaN(numericDrawerId)) {
        drawerQuery = { DRAWER_ID: numericDrawerId };
      } else {
        drawerQuery = { DRAWER_ID: DRAWER_ID };
      }
      
      drawer = await Drawer.findOne(drawerQuery).session(session);
      
      if (!drawer) {
        // Try alternative search
        drawer = await Drawer.findOne({ DRAWER_NO: DRAWER_ID.toString() }).session(session);
        
        if (!drawer) {
          await session.abortTransaction();
          return res.status(404).json({ 
            success: false,
            message: `Drawer not found for DRAWER_ID: "${DRAWER_ID}". Please check the drawer ID.` 
          });
        }
      }

      console.log(`✅ Found drawer: ${drawer.DRAWER_NO}`);

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

    // Valid transaction types
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

    // Currency Count Validation
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

    // For cash transactions, validate currency count matches amount
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

    // UPDATED: Fetch Account using the new multi-model search function
    let accountInfo = null;
    let ledgerBal = 0;
    let availableBal = 0;
    let clearedBal = 0;
    let requiresApproval = false;
    let authorizedRoles = [];
    let status = 'SUCCESS';

    if (!isOpeningCashDeposit) {
      accountInfo = await findAccountByNumber(ACCT_NO, session);
      if (!accountInfo) {
        await session.abortTransaction();
        return res.status(404).json({ 
          success: false, 
          message: `Account ${ACCT_NO} not found in CustomerAccount or DepositAccountApplication systems.` 
        });
      }

      console.log(`✅ Account found: ${accountInfo.accountNumber} - ${accountInfo.accountName} in ${accountInfo.model}`);

      // Validate account name if provided (more flexible for different models)
      if (ACCT_NM && accountInfo.accountName && ACCT_NM !== accountInfo.accountName) {
        console.warn(`Account name mismatch: Provided "${ACCT_NM}" vs System "${accountInfo.accountName}"`);
        // You might want to make this less strict depending on your requirements
      }

      // Check account status (handle different status formats)
      const activeStatuses = ['ACTIVE', 'Active', 'A', 'APPROVED', 'Approved'];
      if (!activeStatuses.includes(accountInfo.status)) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false, 
          message: `Account ${ACCT_NO} is not active. Current status: ${accountInfo.status}` 
        });
      }

      // Restrict DR on FD/LOAN
      const isDebit = normalizedTransactionType === 'DR';
      const restrictedTypes = ['FIXED_DEPOSIT', 'LOAN', 'fixed_deposit', 'loan'];
      if (isDebit && restrictedTypes.includes(accountInfo.accountType)) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false, 
          message: `Debit not allowed for ${accountInfo.accountType} accounts.` 
        });
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

    // Get current balances for account transactions
    if (!isOpeningCashDeposit && accountInfo) {
      ledgerBal = accountInfo.ledgerBalance;
      availableBal = accountInfo.availableBalance;
      clearedBal = accountInfo.clearedBalance;

      console.log(`💰 Current balances for ${ACCT_NO}:`, {
        ledger: ledgerBal,
        available: availableBal,
        cleared: clearedBal
      });

      const isDebit = normalizedTransactionType === 'DR';
      if (isDebit) {
        if (availableBal < amount) {
          await session.abortTransaction();
          return res.status(400).json({ 
            success: false, 
            message: `Insufficient account balance. Available: ₦${availableBal}, Required: ₦${amount}` 
          });
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

      console.log(`💰 Updated balances for ${ACCT_NO}:`, {
        ledger: ledgerBal,
        available: availableBal,
        cleared: clearedBal
      });

      if (ledgerBal < 0 || availableBal < 0 || clearedBal < 0 || availableBal > ledgerBal) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid balance after transaction.',
          balances: { ledgerBal, availableBal, clearedBal }
        });
      }

      // UPDATED: Update account balances using the new function
      await updateAccountBalances(accountInfo, {
        ledgerBalance: ledgerBal,
        availableBalance: availableBal,
        clearedBalance: clearedBal
      }, session);
    }

    // Process drawer transaction for cash transactions
    let drawerNewBalance = drawerPreviousBalance;
    let drawerTransactionEffect = '';
    
    if (cashTransaction && drawer) {
      console.log(`💰 Processing CASH transaction - Type: ${normalizedTransactionType}, Amount: ₦${amount}`);

      let mappedType;
      if (isOpeningCashDeposit) {
        mappedType = 'OPENING_DEPOSIT';
      } else {
        mappedType = normalizedTransactionType === 'DR' ? 'WITHDRAWAL' : 'DEPOSIT';
      }

      // Process drawer transaction
      const mockReq = {
        body: {
          drawerId: drawer._id.toString(),
          transactionType: mappedType,
          amount,
          customerAccount: ACCT_NO || null,
          referenceNo,
          description: DESCRIPTION,
          userId: req.user?.id || req.headers['x-user-id'] || 'system'
        }
      };
      
      try {
        const drawerResult = await processDrawerTransaction(mockReq, {}, session);
        if (drawerResult && drawerResult.success) {
          drawerNewBalance = drawerResult.drawer ? parseFloat(drawerResult.drawer.CURRENT_BALANCE.toString()) : drawerPreviousBalance + amount;
          drawerTransactionEffect = drawerResult.transaction ? drawerResult.transaction.effect : 'DEPOSIT';
        } else {
          // Fallback
          drawerNewBalance = drawerPreviousBalance + amount;
          drawerTransactionEffect = 'OPENING_DEPOSIT';
          await Drawer.updateOne(
            { _id: drawer._id },
            { $inc: { CURRENT_BALANCE: mongoose.Types.Decimal128.fromString(amount.toFixed(2)) } },
            { session }
          );
        }
      } catch (drawerError) {
        console.error('Error processing drawer transaction:', drawerError);
        drawerNewBalance = drawerPreviousBalance + amount;
        drawerTransactionEffect = 'DEPOSIT';
        await Drawer.updateOne(
          { _id: drawer._id },
          { $inc: { CURRENT_BALANCE: mongoose.Types.Decimal128.fromString(amount.toFixed(2)) } },
          { session }
        );
      }

      console.log(`✅ Drawer updated: New Balance = ₦${drawerNewBalance}`);
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
        ...(accountInfo && {
          LEDGER_BAL: accountInfo.ledgerBalance,
          AVAILABLE_BALANCE: accountInfo.availableBalance,
          CLEARED_BAL: accountInfo.clearedBalance,
          ACCOUNT_MODEL: accountInfo.model
        }),
        ...(cashTransaction && drawer && { 
          DRAWER_BALANCE: drawerPreviousBalance,
          DRAWER_NO: drawer.DRAWER_NO 
        })
      },
      new_value: { 
        ...(accountInfo && {
          LEDGER_BAL: ledgerBal, 
          AVAILABLE_BALANCE: availableBal, 
          CLEARED_BAL: clearedBal,
          ACCOUNT_MODEL: accountInfo.model
        }),
        ...(cashTransaction && drawer && { 
          DRAWER_BALANCE: drawerNewBalance,
          DRAWER_NO: drawer.DRAWER_NO 
        })
      },
      ip_address: ipAddress,
      timestamp: transactionDate,
      entity_type: isOpeningCashDeposit ? 'Drawer' : 'CustomerAccount',
      entity_id: isOpeningCashDeposit ? drawer._id : (accountInfo ? accountInfo.accountId : null),
      status,
      description: DESCRIPTION,
      reference_no: referenceNo,
      account_no: ACCT_NO || null,
      additional_info: {
        amount: amount.toFixed(2),
        pending: requiresApproval,
        account_name: accountInfo ? accountInfo.accountName : null,
        account_model: accountInfo ? accountInfo.model : null,
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
    
    // Response with account and drawer information
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
    if (!isOpeningCashDeposit && accountInfo) {
      response.account = {
        ACCT_NO: accountInfo.accountNumber,
        ACCT_NM: accountInfo.accountName,
        ACCOUNT_MODEL: accountInfo.model,
        ACCOUNT_TYPE: accountInfo.accountType,
        new_balances: {
          ledger_balance: ledgerBal,
          available_balance: availableBal,
          cleared_balance: clearedBal
        }
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
      accountModel: accountInfo?.model,
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

    console.log(`🎉 Transaction COMPLETED: ${normalizedTransactionType} ₦${amount} - Account: ${ACCT_NO} - Drawer: ${drawer?.DRAWER_NO} = ₦${drawerNewBalance} ${isOpeningCashDeposit ? '(Opening Deposit)' : ''}`);

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