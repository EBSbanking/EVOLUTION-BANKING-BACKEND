import mongoose from 'mongoose';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import UserRole from '../models/UserRole.js';
import logger from '../utils/logger.js';
import { checkPolicy } from '../Services/transactionPolicyService.js';

const generateTransactionRef = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return `${datePart}${randomPart}`;
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
  } = req.body;

  // Initialize sanitizedCurrencyCount early to avoid ReferenceError
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
    // Input validation
    if (!ACCT_NO || !TRANSACTION_TYPE || !AMOUNT || !DESCRIPTION || !BUSINESS_UNIT || !DEPOSITOR_NAME) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'ACCT_NO, TRANSACTION_TYPE, AMOUNT, DESCRIPTION, BUSINESS_UNIT, and DEPOSITOR_NAME are required.',
      });
    }

    if (!/^\d{10}$/.test(ACCT_NO)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'ACCT_NO must be a 10-digit number.' });
    }

    const amount = parseFloat(AMOUNT);
    if (isNaN(amount) || amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'AMOUNT must be a positive number.' });
    }

    const validTransactionTypes = ['DR', 'CR'];
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

    // Update sanitizedCurrencyCount with actual values
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

    // Reference No
    let referenceNo = REFERENCE_NO || generateTransactionRef();
    const existingTransaction = await AuditTrail.findOne({ reference_no: referenceNo }).lean().session(session);
    if (existingTransaction) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: `Transaction with REFERENCE_NO ${referenceNo} already exists.` });
    }

    // Fetch Account
    const account = await CustomerAccount.findOne({ ACCT_NO }).lean().session(session);
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
    const { requiresApproval, authorizedRoles } = await checkPolicy(userRole, amount, policyType, session);
    let transactionStatus = requiresApproval ? 'PENDING' : 'APPROVED';
    if (!requiresApproval && authorizedRoles.length > 0 && !authorizedRoles.includes(userRole)) {
      transactionStatus = 'PENDING';
    }

    // Balances
    let ledgerBal = parseFloat(account.LEDGER_BAL.toString());
    let availableBal = parseFloat(account.AVAILABLE_BALANCE.toString());
    let clearedBal = parseFloat(account.CLEARED_BAL.toString());
    const status = requiresApproval ? 'PENDING' : 'SUCCESS';

    if (isDebit) {
      if (availableBal < amount) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: `Insufficient balance.` });
      }
      ledgerBal -= amount;
      availableBal -= amount;
      if (!requiresApproval) clearedBal -= amount;
    } else {
      ledgerBal += amount;
      availableBal += amount;
      if (!requiresApproval) clearedBal += amount;
    }

    if (ledgerBal < 0 || availableBal < 0 || clearedBal < 0 || availableBal > ledgerBal) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid balance after transaction.' });
    }

    // Update account balances using updateOne
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

    // Audit Trail
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    await AuditTrail.create(
      [{
        event_id: Date.now(),
        user_id: userId,
        event_type: `TRANSACTION_${normalizedTransactionType}`,
        action: `${isDebit ? 'Debit' : 'Credit'} Transaction`,
        old_value: {
          LEDGER_BAL: parseFloat(account.LEDGER_BAL.toString()),
          AVAILABLE_BALANCE: parseFloat(account.AVAILABLE_BALANCE.toString()),
          CLEARED_BAL: parseFloat(account.CLEARED_BAL.toString()),
        },
        new_value: { LEDGER_BAL: ledgerBal, AVAILABLE_BALANCE: availableBal, CLEARED_BAL: clearedBal },
        ip_address: ipAddress,
        timestamp: transactionDate,
        entity_type: 'CustomerAccount',
        entity_id: account._id,
        status,
        description: DESCRIPTION,
        reference_no: referenceNo,
        account_no: ACCT_NO,
        additional_info: {
          amount: amount.toFixed(2),
          pending: requiresApproval,
          account_name: account.ACCT_NM,
          transaction_date: transactionDate,
          business_unit: BUSINESS_UNIT,
          depositor_name: DEPOSITOR_NAME,
          currency_count: sanitizedCurrencyCount,
          authorized_roles: authorizedRoles,
        },
      }],
      { session }
    );

    await session.commitTransaction();
    return res.status(200).json({
      success: true,
      message: `${isDebit ? 'Debit' : 'Credit'} transaction ${requiresApproval ? 'pending approval' : 'posted'} successfully.`,
      account: {
        ACCT_NO: account.ACCT_NO,
        ACCT_ID: account.ACCT_ID,
        ACCT_NM: account.ACCT_NM,
      },
      reference_no: referenceNo,
      transaction_date: transactionDate,
      business_unit: BUSINESS_UNIT,
      depositor_name: DEPOSITOR_NAME,
      currency_count: sanitizedCurrencyCount,
      pending: requiresApproval,
      authorized_roles: authorizedRoles,
    });
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