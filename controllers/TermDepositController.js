import mongoose from 'mongoose';
import TermDeposit from '../models/TermDeposit.js';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import GLAccount from '../models/GLAccount.js';
import { createGLTransaction } from './GLAccountTransactionSingle.js';
import { generateAccountNumber } from '../utils/generateAccountNumber.js';
import { generateTermDepositContractLetter } from '../utils/pdfGenerator.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';
import logger from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fsPromises from 'fs/promises';
import fs from 'fs';
import SavingsProduct from '../models/SavingsProduct.js';

// Get __dirname for file operations
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom error class for validation errors
class CustomValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Helper function to validate required fields
const validateRequiredFields = (fields) => {
  const missingFields = Object.entries(fields)
    .filter(([_, value]) => value == null)
    .map(([key]) => key);
  if (missingFields.length > 0) {
    throw new CustomValidationError(`Missing required fields: ${missingFields.join(', ')}`);
  }
  return null;
};

// Helper function to validate BU_ID
const validateBU_ID = (BU_ID) => {
  const validatedBU_ID = BU_ID || '01';
  if (!/^\d{2,3}$/.test(validatedBU_ID)) {
    throw new CustomValidationError('BU_ID must be a 2- or 3-digit number');
  }
  return validatedBU_ID;
};

// Helper function to generate a unique event_id
const generateEventId = async (session = null) => {
  try {
    const lastAudit = await AuditTrail.findOne().sort({ event_id: -1 }).session(session).exec();
    return lastAudit && lastAudit.event_id ? lastAudit.event_id + 1 : 1;
  } catch (error) {
    logger.error('generateEventId error:', error.message);
    throw new Error(`Failed to generate event_id: ${error.message}`);
  }
};

// Helper function to create audit trail
const createAuditTrail = async ({ eventId, userId, eventType, action, oldValue, newValue, ipAddress, accountNo }, options = {}) => {
  logger.info('Creating Audit Trail:', { eventId, userId, eventType, action, oldValue, newValue, ipAddress, accountNo });

  const validatedParams = {
    eventId: eventId && typeof eventId === 'number' ? eventId : null,
    userId: userId || 'system',
    eventType: eventType || null,
    action: action || null,
    oldValue: oldValue || null,
    newValue: newValue || null,
    ipAddress: ipAddress || '127.0.0.1',
    accountNo: accountNo || null,
  };

  if (!validatedParams.eventId) {
    logger.warn(`Missing or invalid eventId: ${eventId}, generating new event_id`);
    validatedParams.eventId = await generateEventId(options.session);
  }
  const missingFields = [];
  if (!validatedParams.userId) missingFields.push('userId');
  if (!validatedParams.eventType) missingFields.push('eventType');
  if (!validatedParams.action) missingFields.push('action');
  if (!validatedParams.newValue) missingFields.push('newValue');
  if (!validatedParams.ipAddress) missingFields.push('ipAddress');

  if (missingFields.length > 0) {
    const errorMessage = `Missing required audit trail fields: ${missingFields.join(', ')}`;
    logger.error(errorMessage, validatedParams);
    throw new Error(errorMessage);
  }

  try {
    const auditTrail = await AuditTrail.create(
      [{
        event_id: validatedParams.eventId,
        user_id: validatedParams.userId,
        event_type: validatedParams.eventType,
        action: validatedParams.action,
        old_value: validatedParams.oldValue,
        new_value: validatedParams.newValue,
        ip_address: validatedParams.ipAddress,
        timestamp: new Date(),
        account_no: validatedParams.accountNo,
        status: 'SUCCESS',
      }],
      { session: options.session }
    );

    logger.info(`Audit Trail created successfully: event_id=${validatedParams.eventId}`);
    return auditTrail[0];
  } catch (error) {
    logger.error('AuditTrail creation error:', { error: error.message, ...validatedParams });
    throw new Error(`Failed to create audit trail: ${error.message}`);
  }
};

// Helper function to validate transaction IDs
const validateTransactionIds = (identifiers) => {
  if (!identifiers || typeof identifiers !== 'object') {
    throw new Error('Failed to generate workflow identifiers: identifiers object is undefined or invalid');
  }
  const transactionIds = [
    'glInterestPaymentTxnId',
    'glSettlementTxnId',
    'customerInterestPaymentTxnId',
    'customerSettlementTxnId',
  ];
  const invalidIds = transactionIds.filter(
    (id) => !identifiers[id] || typeof identifiers[id] !== 'string' || !/^\d{8,12}$/.test(identifiers[id])
  );
  if (invalidIds.length > 0) {
    throw new Error(`Invalid transaction IDs: ${invalidIds.join(', ')}`);
  }
  return null;
};

// Helper function to map transaction type to numeric BAL_CD
const mapTransactionTypeToBalCd = (transactionType) => {
  return transactionType.toUpperCase() === 'CR' ? '02' : '01';
};

// Helper function to validate GL account number format
const validateGLAccountFormat = (glAccountNo) => {
  const shortPattern = /^\d{1,2}-\d{1,3}-\d{1,3}-\d{1,3}-\d{2,3}$/;
  const paddedPattern = /^\d{2}-\d{3}-\d{3}-\d{3}-\d{2,3}$/;
  return shortPattern.test(glAccountNo) || paddedPattern.test(glAccountNo);
};

// Helper function to validate GL account
const validateGLAccount = async (glAccountNo, transactionType, glAcctCat, session, isInterestPayable = false) => {
  logger.info(
    `Validating GL Account: ${glAccountNo}, Type: ${transactionType}, Category: ${glAcctCat}, IsInterestPayable: ${isInterestPayable}`
  );

  if (!validateGLAccountFormat(glAccountNo)) {
    throw new CustomValidationError(
      `Invalid GL Account format: ${glAccountNo}. Expected format: XX-XXX-XXX-XXX-XXX or X-XXX-XXX-XXX-XXX`
    );
  }

  const glAccount = await GLAccount.findOne({ GL_ACCT_NO: glAccountNo }, null, { session });
  if (!glAccount) {
    throw new CustomValidationError(`GL Account ${glAccountNo} not found`);
  }

  if (transactionType === 'DR' && !glAccount.DR_ALLOWED) {
    throw new CustomValidationError(`GL Account ${glAccountNo} does not allow debit transactions`);
  }
  if (transactionType === 'CR' && !glAccount.CR_ALLOWED) {
    throw new CustomValidationError(`GL Account ${glAccountNo} does not allow credit transactions`);
  }

  if (isInterestPayable) {
    const expectedCategory = 'LIABILITY';
    if (glAccount.GL_ACCT_CAT.toUpperCase() !== expectedCategory) {
      throw new CustomValidationError(
        `GL Account ${glAccountNo} category must be ${expectedCategory} for interest payable transactions`
      );
    }
  } else if (glAcctCat && glAccount.GL_ACCT_CAT.toUpperCase() !== glAcctCat.toUpperCase()) {
    throw new CustomValidationError(`GL Account ${glAccountNo} category does not match expected: ${glAcctCat}`);
  }

  return glAccount;
};

// Daily interest accrual
export const accrueDailyInterest = async () => {
  try {
    const termDeposits = await TermDeposit.find({
      SETTLEMENT_STATUS: 'ACTIVE',
      UPFRONT_INTEREST_PAYMENT: false,
    });
    const userId = 'system';
    const ipAddress = 'EOD_PROCESS';
    for (const termDeposit of termDeposits) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const identifiers = await generateWorkflowIdentifiers();
          validateTransactionIds(identifiers);
          await validateGLAccount(termDeposit.INTEREST_GL_ACCT_NO, 'DR', 'EXPENSE', session);
          await validateGLAccount(termDeposit.INTEREST_PAYABLE_GL_ACCT_NO, 'CR', 'LIABILITY', session, true);
          const validatedBU_ID = validateBU_ID(termDeposit.BU_ID);
          const principal = parseFloat(termDeposit.NOTICE_AMOUNT);
          const annualRate = parseFloat(termDeposit.FIXED_RATE) / 100;
          const daysInYear = termDeposit.ACCRUAL_BASIS === 'ACT/360' ? 360 : 365;
          const dailyInterest = (principal * annualRate) / daysInYear;
          termDeposit.ACCRUED_INTEREST = (termDeposit.ACCRUED_INTEREST || 0) + dailyInterest;
          await termDeposit.save({ session });
          const glTransactions = [
            {
              GL_ACCT_NO: termDeposit.INTEREST_GL_ACCT_NO,
              AMOUNT: dailyInterest,
              TRANSACTION_TYPE: 'DR',
              CREATED_BY: userId,
              SUB_LEDGER_NO: '000',
              SEG_NO: validatedBU_ID,
              LEDGER_NO: '000',
              description: `Daily Interest Accrual for Term Deposit ${termDeposit.ACCT_NO}`,
              JOURNAL_ID: identifiers.JOURNAL_ID,
              DRS_ALLOWED_FG: true,
              CRS_ALLOWED_FG: false,
              BAL_CD: mapTransactionTypeToBalCd('DR'),
              GL_ACCT_CAT: 'EXPENSE',
            },
            {
              GL_ACCT_NO: termDeposit.INTEREST_PAYABLE_GL_ACCT_NO,
              AMOUNT: dailyInterest,
              TRANSACTION_TYPE: 'CR',
              CREATED_BY: userId,
              SUB_LEDGER_NO: '000',
              SEG_NO: validatedBU_ID,
              LEDGER_NO: '000',
              description: `Daily Interest Accrual to Interest Payable GL for Term Deposit ${termDeposit.ACCT_NO}`,
              JOURNAL_ID: identifiers.JOURNAL_ID,
              DRS_ALLOWED_FG: false,
              CRS_ALLOWED_FG: true,
              BAL_CD: mapTransactionTypeToBalCd('CR'),
              GL_ACCT_CAT: 'LIABILITY',
            },
          ];
          for (const transaction of glTransactions) {
            await createGLTransaction(null, null, transaction, { session });
          }
          await createAuditTrail({
            eventId: identifiers.EVENT_ID,
            userId,
            eventType: 'INTEREST_ACCRUAL',
            action: 'Daily Interest Accrual for Term Deposit',
            oldValue: { ACCRUED_INTEREST: termDeposit.ACCRUED_INTEREST - dailyInterest },
            newValue: { ACCRUED_INTEREST: termDeposit.ACCRUED_INTEREST },
            ipAddress,
            accountNo: termDeposit.ACCT_NO,
          }, { session });
        });
      } catch (error) {
        logger.error(`Error processing term deposit ${termDeposit.ACCT_NO}: ${error.message}`);
        throw error;
      } finally {
        session.endSession();
      }
    }
    logger.info('Daily interest accrual completed successfully');
  } catch (error) {
    logger.error('Daily interest accrual error:', error);
    throw error;
  }
};


export const createTermDeposit = async (req, res) => {
  try {
    const {
      ACCT_NM,
      START_DT,
      ROLLOVER_OPT_CD,
      ROLLOVER_TYPE = 'NONE',
      TERM,
      MATURITY_DT,
      NOTICE_AMOUNT,
      PRIMARY_OFFICER,
      INT_SETLMNT_OPTION_CD,
      SETTLEMENT_ACCOUNT,
      CUST_NM,
      PRINCIPAL_SETTLEMENT_METHOD,
      VERSION_NO,
      CUST_ID,
      PRIMARY_OFFICER_ID,
      SECONDARY_OFFICER_ID,
      BU_ID,
      CRNCY_ID,
      productCode,
      OPENING_RSN_ID,
      MKT_CAMPAIGN_REF,
      ACCT_ID,
      AUTO_CLOSE_ON_EXPIRY_FG,
      UPFRONT_INTEREST_PAYMENT,
      PARTIAL_INTEREST_PAYMENT,
      UPFRONT_INTEREST_RATE,
      UPFRONT_INTEREST_AMOUNT,
      MATURITY_INTEREST_AMOUNT,
      MATURITY_AMOUNT,
      INTEREST_PAYMENT_STATUS,
      SETTLEMENT_STATUS,
      ACCT_NO,
      GL_INTEREST_PAYMENT_TXN_ID,
      GL_SETTLEMENT_TXN_ID,
      CUSTOMER_INTEREST_PAYMENT_TXN_ID,
      CUSTOMER_SETTLEMENT_TXN_ID,
      INTEREST_GL_ACCT_NO,
      INTEREST_PAYABLE_GL_ACCT_NO,
      SETTLEMENT_GL_ACCT_NO,
      depositChargeReceivableGLAccountNo,
      delinquentBalanceGLAccountNo,
      dormantBalanceGLAccountNo,
      earmarkedBalanceGLAccountNo,
      escheatedBalanceGLAccountNo,
      interestChequesGLAccountNo,
      interestExpenseGLAccountNo,
      interestIncomeGLAccountNo,
      interestReceivableGLAccountNo,
      interestSuspenseGLAccountNo,
      maturedBalanceGLAccountNo,
      maturityChequesGLAccountNo,
      nonAccrualBalanceGLAccountNo,
      overdrawnBalanceGLAccountNo,
      preDormantBalanceGLAccountNo,
      principalBalanceGLAccountNo,
      provisionReserveGLAccountNo,
      provisionExpenseGLAccountNo,
      rejectedCreditSuspenseGLAccountNo,
      rejectedDebitSuspenseGLAccountNo,
      reservedBalanceGLAccountNo,
      unclearedBalanceGLAccountNo,
      writeOffBalanceGLAccountNo,
      recoveriesGLAccountNo,
      interestCreditGLAccountNo,
      interestDebitGLAccountNo,
      withholdingTaxGLAccountNo,
      taxRate,
      createdBy,
    } = req.body;

    const requiredFields = {
      ACCT_NM,
      START_DT,
      ROLLOVER_OPT_CD,
      TERM,
      MATURITY_DT,
      NOTICE_AMOUNT,
      PRIMARY_OFFICER,
      INT_SETLMNT_OPTION_CD,
      SETTLEMENT_ACCOUNT,
      CUST_NM,
      PRINCIPAL_SETTLEMENT_METHOD,
      VERSION_NO,
      CUST_ID,
      PRIMARY_OFFICER_ID,
      BU_ID,
      CRNCY_ID,
      productCode,
      ACCT_NO,
      INTEREST_GL_ACCT_NO,
      INTEREST_PAYABLE_GL_ACCT_NO,
      SETTLEMENT_GL_ACCT_NO,
      depositChargeReceivableGLAccountNo,
      delinquentBalanceGLAccountNo,
      dormantBalanceGLAccountNo,
      earmarkedBalanceGLAccountNo,
      escheatedBalanceGLAccountNo,
      interestChequesGLAccountNo,
      interestExpenseGLAccountNo,
      interestIncomeGLAccountNo,
      interestReceivableGLAccountNo,
      interestSuspenseGLAccountNo,
      maturedBalanceGLAccountNo,
      maturityChequesGLAccountNo,
      nonAccrualBalanceGLAccountNo,
      overdrawnBalanceGLAccountNo,
      preDormantBalanceGLAccountNo,
      principalBalanceGLAccountNo,
      provisionReserveGLAccountNo,
      provisionExpenseGLAccountNo,
      rejectedCreditSuspenseGLAccountNo,
      rejectedDebitSuspenseGLAccountNo,
      reservedBalanceGLAccountNo,
      unclearedBalanceGLAccountNo,
      writeOffBalanceGLAccountNo,
      recoveriesGLAccountNo,
      interestCreditGLAccountNo,
      interestDebitGLAccountNo,
    };
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => value == null)
      .map(([key]) => key);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(async () => {
        // Validate productCode
        const product = await SavingsProduct.findOne({ productCode }).session(session);
        if (!product) {
          throw new Error(`Invalid productCode: ${productCode}. No matching SavingsProduct found.`);
        }

        // Validate customer account
        const customerAccount = await CustomerAccount.findOne({ ACCT_NO }).session(session);
        if (!customerAccount) {
          throw new Error(`Customer account not found: ${ACCT_NO}`);
        }
        if (!customerAccount.DR_ALLOWED) {
          throw new Error(`Customer account ${ACCT_NO} does not allow debit transactions`);
        }
        const debitAmount = parseFloat(NOTICE_AMOUNT);
        if (isNaN(debitAmount) || debitAmount <= 0) {
          throw new Error(`Invalid NOTICE_AMOUNT: ${NOTICE_AMOUNT}`);
        }
        if (parseFloat(customerAccount.AVAILABLE_BALANCE.toString()) < debitAmount) {
          throw new Error(`Insufficient available balance in Customer Account: ${customerAccount.AVAILABLE_BALANCE} < ${debitAmount}`);
        }
        if (SETTLEMENT_ACCOUNT && SETTLEMENT_ACCOUNT !== ACCT_NO) {
          throw new Error('SETTLEMENT_ACCOUNT must match ACCT_NO');
        }

        // Validate interest and tax parameters
        if (UPFRONT_INTEREST_PAYMENT && taxRate == null) {
          throw new Error('taxRate is required when UPFRONT_INTEREST_PAYMENT is true');
        }
        if (taxRate != null && (taxRate < 0 || taxRate > 1)) {
          throw new Error('taxRate must be between 0 and 1');
        }
        if (taxRate > 0 && !withholdingTaxGLAccountNo) {
          throw new Error('withholdingTaxGLAccountNo is required when taxRate is greater than 0');
        }

        // Validate GL accounts (simplified, assuming validateGLAccount checks category and permissions)
        const glAccountsToValidate = [
          { account: SETTLEMENT_GL_ACCT_NO, transactionType: 'DR', category: 'ASSET' },
          { account: SETTLEMENT_GL_ACCT_NO, transactionType: 'CR', category: 'ASSET' },
          { account: INTEREST_GL_ACCT_NO, transactionType: 'DR', category: 'EXPENSE' },
          { account: INTEREST_PAYABLE_GL_ACCT_NO, transactionType: 'CR', category: 'LIABILITY' },
          { account: principalBalanceGLAccountNo, transactionType: 'CR', category: 'LIABILITY' },
          { account: interestCreditGLAccountNo, transactionType: 'CR', category: 'LIABILITY' },
          ...(taxRate > 0 && withholdingTaxGLAccountNo ? [{ account: withholdingTaxGLAccountNo, transactionType: 'CR', category: 'LIABILITY' }] : []),
          ...(PRINCIPAL_SETTLEMENT_METHOD === 'GL' && SETTLEMENT_ACCOUNT ? [{ account: SETTLEMENT_ACCOUNT, transactionType: 'CR', category: 'ASSET' }] : []),
          ...(INT_SETLMNT_OPTION_CD === 'GL' && SETTLEMENT_ACCOUNT ? [{ account: SETTLEMENT_ACCOUNT, transactionType: 'CR', category: 'ASSET' }] : []),
        ];
        for (const { account, transactionType, category } of glAccountsToValidate) {
          await validateGLAccount(account, transactionType, category, session);
        }

        // Generate identifiers
        const identifiers = await generateWorkflowIdentifiers();
        validateTransactionIds(identifiers);

        // Calculate interest amounts using rateInformation from SavingsProduct
        const calculatedInterest = parseFloat(NOTICE_AMOUNT) * (parseFloat(product.rateInformation.fixedRate.toString()) / 100) * (parseFloat(TERM) / 12);
        const finalUpfrontInterestRate = UPFRONT_INTEREST_PAYMENT ? parseFloat(product.rateInformation.fixedRate.toString()) : 0;
        const finalUpfrontInterestAmount = UPFRONT_INTEREST_PAYMENT ? calculatedInterest : 0;
        const finalMaturityInterestAmount = UPFRONT_INTEREST_PAYMENT ? 0 : calculatedInterest;
        const maturityAmount = parseFloat(NOTICE_AMOUNT) + finalMaturityInterestAmount;

        const userId = req.user?.id || createdBy || 'system';
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

        // Debit customer account
        const oldLedgerBal = customerAccount.LEDGER_BAL;
        const oldClearedBal = customerAccount.CLEARED_BAL || oldLedgerBal;
        const oldAvailableBal = customerAccount.AVAILABLE_BALANCE;
        customerAccount.LEDGER_BAL = mongoose.Types.Decimal128.fromString((parseFloat(oldLedgerBal.toString()) - debitAmount).toFixed(2));
        customerAccount.CLEARED_BAL = mongoose.Types.Decimal128.fromString((parseFloat(oldClearedBal.toString()) - debitAmount).toFixed(2));
        customerAccount.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString((parseFloat(oldAvailableBal.toString()) - debitAmount).toFixed(2));
        customerAccount.lastActivityDate = new Date();
        logger.info(`Debiting customer account ${ACCT_NO}: oldBalance=${oldLedgerBal}, newBalance=${customerAccount.LEDGER_BAL}`);
        await customerAccount.save({ session });

        // Create audit trail for customer account debit
        await createAuditTrail({
          eventId: identifiers.EVENT_ID,
          userId,
          eventType: 'CUSTOMER_ACCOUNT_DEBIT',
          action: 'Debit Customer Account for Term Deposit',
          oldValue: { LEDGER_BAL: oldLedgerBal.toString(), CLEARED_BAL: oldClearedBal.toString(), AVAILABLE_BALANCE: oldAvailableBal.toString() },
          newValue: {
            LEDGER_BAL: customerAccount.LEDGER_BAL.toString(),
            CLEARED_BAL: customerAccount.CLEARED_BAL.toString(),
            AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE.toString(),
          },
          ipAddress,
          accountNo: ACCT_NO,
        }, { session });

        // GL transaction for principal credit
        const glTransactions = [
          {
            GL_ACCT_NO: principalBalanceGLAccountNo,
            AMOUNT: mongoose.Types.Decimal128.fromString(debitAmount.toFixed(2)),
            TRANSACTION_TYPE: 'CR',
            CREATED_BY: userId,
            SUB_LEDGER_NO: '000',
            SEG_NO: BU_ID,
            LEDGER_NO: '000',
            description: `Term Deposit Booking for ${ACCT_NO}`,
            JOURNAL_ID: identifiers.glSettlementTxnId,
            DRS_ALLOWED_FG: false,
            CRS_ALLOWED_FG: true,
            BAL_CD: mapTransactionTypeToBalCd('CR'),
            GL_ACCT_CAT: 'LIABILITY',
          },
        ];

        // Process GL transaction for principal
        for (const transaction of glTransactions) {
          logger.info(`Processing GL transaction: ${JSON.stringify(transaction)}`);
          await createGLTransaction(null, null, transaction, { session });
        }

        // Create audit trail for GL credit
        await createAuditTrail({
          eventId: identifiers.EVENT_ID,
          userId,
          eventType: 'GL_ACCOUNT_CREDIT',
          action: 'Credit GL Account for Term Deposit Booking',
          oldValue: { BALANCE: 'N/A' },
          newValue: { BALANCE: `Credited ${debitAmount}` },
          ipAddress,
          accountNo: ACCT_NO,
        }, { session });

        // Save term deposit
        const termDeposit = new TermDeposit({
          ACCT_NM,
          ACCT_NO,
          START_DT: new Date(START_DT),
          ROLLOVER_OPT_CD,
          ROLLOVER_TYPE: ROLLOVER_TYPE.toUpperCase(),
          TERM,
          MATURITY_DT: new Date(MATURITY_DT),
          NOTICE_AMOUNT: mongoose.Types.Decimal128.fromString(parseFloat(NOTICE_AMOUNT).toFixed(2)),
          PRIMARY_OFFICER,
          INT_SETLMNT_OPTION_CD: INT_SETLMNT_OPTION_CD.toUpperCase(),
          SETTLEMENT_ACCOUNT,
          CUST_NM,
          PRINCIPAL_SETTLEMENT_METHOD: PRINCIPAL_SETTLEMENT_METHOD.toUpperCase(),
          VERSION_NO,
          CUST_ID: Number(CUST_ID),
          PRIMARY_OFFICER_ID,
          SECONDARY_OFFICER_ID,
          BU_ID,
          CRNCY_ID,
          productCode,
          OPENING_RSN_ID,
          MKT_CAMPAIGN_REF,
          ACCT_ID,
          AUTO_CLOSE_ON_EXPIRY_FG,
          UPFRONT_INTEREST_PAYMENT,
          PARTIAL_INTEREST_PAYMENT,
          UPFRONT_INTEREST_RATE: mongoose.Types.Decimal128.fromString(parseFloat(UPFRONT_INTEREST_RATE || finalUpfrontInterestRate).toFixed(2)),
          UPFRONT_INTEREST_AMOUNT: mongoose.Types.Decimal128.fromString(parseFloat(UPFRONT_INTEREST_AMOUNT || finalUpfrontInterestAmount).toFixed(2)),
          MATURITY_INTEREST_AMOUNT: mongoose.Types.Decimal128.fromString(parseFloat(MATURITY_INTEREST_AMOUNT || finalMaturityInterestAmount).toFixed(2)),
          MATURITY_AMOUNT: mongoose.Types.Decimal128.fromString(parseFloat(MATURITY_AMOUNT || maturityAmount).toFixed(2)),
          INTEREST_PAYMENT_STATUS: INTEREST_PAYMENT_STATUS?.toUpperCase() || (UPFRONT_INTEREST_PAYMENT ? 'PAID' : 'PENDING'),
          SETTLEMENT_STATUS: SETTLEMENT_STATUS?.toUpperCase() || 'ACTIVE',
          GL_INTEREST_PAYMENT_TXN_ID,
          GL_SETTLEMENT_TXN_ID,
          CUSTOMER_INTEREST_PAYMENT_TXN_ID,
          CUSTOMER_SETTLEMENT_TXN_ID,
          INTEREST_GL_ACCT_NO,
          INTEREST_PAYABLE_GL_ACCT_NO,
          SETTLEMENT_GL_ACCT_NO,
          depositChargeReceivableGLAccountNo,
          delinquentBalanceGLAccountNo,
          dormantBalanceGLAccountNo,
          earmarkedBalanceGLAccountNo,
          escheatedBalanceGLAccountNo,
          interestChequesGLAccountNo,
          interestExpenseGLAccountNo,
          interestIncomeGLAccountNo,
          interestReceivableGLAccountNo,
          interestSuspenseGLAccountNo,
          maturedBalanceGLAccountNo,
          maturityChequesGLAccountNo,
          nonAccrualBalanceGLAccountNo,
          overdrawnBalanceGLAccountNo,
          preDormantBalanceGLAccountNo,
          principalBalanceGLAccountNo,
          provisionReserveGLAccountNo,
          provisionExpenseGLAccountNo,
          rejectedCreditSuspenseGLAccountNo,
          rejectedDebitSuspenseGLAccountNo,
          reservedBalanceGLAccountNo,
          unclearedBalanceGLAccountNo,
          writeOffBalanceGLAccountNo,
          recoveriesGLAccountNo,
          interestCreditGLAccountNo,
          interestDebitGLAccountNo,
          ACCRUED_INTEREST: mongoose.Types.Decimal128.fromString('0.00'),
        });

        logger.info(`Saving term deposit: ACCT_NO=${ACCT_NO}`);
        const savedTermDeposit = await termDeposit.save({ session });

        // Process upfront interest payment
        if (UPFRONT_INTEREST_PAYMENT && finalUpfrontInterestAmount > 0) {
          const taxAmount = finalUpfrontInterestAmount * taxRate;
          const netInterest = finalUpfrontInterestAmount - taxAmount;
          logger.info(`Processing upfront interest: gross=${finalUpfrontInterestAmount}, tax=${taxAmount}, net=${netInterest}`);

          const customerAccountForInterest = await CustomerAccount.findOne({ ACCT_NO }, null, { session });
          if (!customerAccountForInterest) {
            throw new Error(`Customer account not found: ${ACCT_NO}`);
          }
          if (!customerAccountForInterest.CR_ALLOWED) {
            throw new Error(`Customer account ${ACCT_NO} does not allow credit transactions`);
          }
          const oldLedgerBalInterest = customerAccountForInterest.LEDGER_BAL;
          const oldClearedBalInterest = customerAccountForInterest.CLEARED_BAL || oldLedgerBalInterest;
          const oldAvailableBalInterest = customerAccountForInterest.AVAILABLE_BALANCE;

          const interestGLTransactions = [
            {
              GL_ACCT_NO: SETTLEMENT_GL_ACCT_NO,
              AMOUNT: mongoose.Types.Decimal128.fromString(netInterest.toFixed(2)),
              TRANSACTION_TYPE: 'DR',
              CREATED_BY: userId,
              SUB_LEDGER_NO: '000',
              SEG_NO: BU_ID,
              LEDGER_NO: '000',
              description: `Upfront Net Interest Payout to Customer for ${ACCT_NO}`,
              JOURNAL_ID: identifiers.customerInterestPaymentTxnId,
              DRS_ALLOWED_FG: true,
              CRS_ALLOWED_FG: false,
              BAL_CD: mapTransactionTypeToBalCd('DR'),
              GL_ACCT_CAT: 'ASSET',
            },
            {
              GL_ACCT_NO: INTEREST_PAYABLE_GL_ACCT_NO,
              AMOUNT: mongoose.Types.Decimal128.fromString(finalUpfrontInterestAmount.toFixed(2)),
              TRANSACTION_TYPE: 'CR',
              CREATED_BY: userId,
              SUB_LEDGER_NO: '000',
              SEG_NO: BU_ID,
              LEDGER_NO: '000',
              description: `Upfront Interest Accrual for ${ACCT_NO}`,
              JOURNAL_ID: identifiers.glInterestPaymentTxnId,
              DRS_ALLOWED_FG: false,
              CRS_ALLOWED_FG: true,
              BAL_CD: mapTransactionTypeToBalCd('CR'),
              GL_ACCT_CAT: 'LIABILITY',
            },
          ];

          const taxGLTransactions = taxAmount > 0 ? [
            {
              GL_ACCT_NO: SETTLEMENT_GL_ACCT_NO,
              AMOUNT: mongoose.Types.Decimal128.fromString(taxAmount.toFixed(2)),
              TRANSACTION_TYPE: 'DR',
              CREATED_BY: userId,
              SUB_LEDGER_NO: '000',
              SEG_NO: BU_ID,
              LEDGER_NO: '000',
              description: `Withholding Tax on Upfront Interest for Term Deposit ${ACCT_NO}`,
              JOURNAL_ID: identifiers.JOURNAL_ID,
              DRS_ALLOWED_FG: true,
              CRS_ALLOWED_FG: false,
              BAL_CD: mapTransactionTypeToBalCd('DR'),
              GL_ACCT_CAT: 'ASSET',
            },
            {
              GL_ACCT_NO: withholdingTaxGLAccountNo,
              AMOUNT: mongoose.Types.Decimal128.fromString(taxAmount.toFixed(2)),
              TRANSACTION_TYPE: 'CR',
              CREATED_BY: userId,
              SUB_LEDGER_NO: '000',
              SEG_NO: BU_ID,
              LEDGER_NO: '000',
              description: `Withholding Tax Credit for Term Deposit ${ACCT_NO}`,
              JOURNAL_ID: identifiers.JOURNAL_ID,
              DRS_ALLOWED_FG: false,
              CRS_ALLOWED_FG: true,
              BAL_CD: mapTransactionTypeToBalCd('CR'),
              GL_ACCT_CAT: 'LIABILITY',
            },
          ] : [];

          // Process interest and tax transactions
          for (const transaction of [...interestGLTransactions, ...taxGLTransactions]) {
            logger.info(`Processing GL transaction: ${JSON.stringify(transaction)}`);
            await createGLTransaction(null, null, transaction, { session });
          }

          // Credit customer account with net interest
          customerAccountForInterest.LEDGER_BAL = mongoose.Types.Decimal128.fromString(
            (parseFloat(oldLedgerBalInterest.toString()) + netInterest).toFixed(2)
          );
          customerAccountForInterest.CLEARED_BAL = mongoose.Types.Decimal128.fromString(
            (parseFloat(oldClearedBalInterest.toString()) + netInterest).toFixed(2)
          );
          customerAccountForInterest.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(
            (parseFloat(oldAvailableBalInterest.toString()) + netInterest).toFixed(2)
          );
          customerAccountForInterest.lastActivityDate = new Date();
          logger.info(`Crediting customer account ${ACCT_NO}: oldBalance=${oldLedgerBalInterest}, newBalance=${customerAccountForInterest.LEDGER_BAL}`);
          await customerAccountForInterest.save({ session });

          // Audit trail for interest credit
          await createAuditTrail({
            eventId: identifiers.EVENT_ID,
            userId,
            eventType: 'CUSTOMER_ACCOUNT_CREDIT',
            action: 'Credit Upfront Net Interest to Customer Account',
            oldValue: {
              LEDGER_BAL: oldLedgerBalInterest.toString(),
              CLEARED_BAL: oldClearedBalInterest.toString(),
              AVAILABLE_BALANCE: oldAvailableBalInterest.toString(),
            },
            newValue: {
              LEDGER_BAL: customerAccountForInterest.LEDGER_BAL.toString(),
              CLEARED_BAL: customerAccountForInterest.CLEARED_BAL.toString(),
              AVAILABLE_BALANCE: customerAccountForInterest.AVAILABLE_BALANCE.toString(),
            },
            ipAddress,
            accountNo: ACCT_NO,
          }, { session });

          if (taxAmount > 0) {
            await createAuditTrail({
              eventId: identifiers.EVENT_ID,
              userId,
              eventType: 'WITHHOLDING_TAX',
              action: 'Withholding Tax on Upfront Interest',
              oldValue: { BALANCE: 'N/A' },
              newValue: { BALANCE: `Credited ${taxAmount} to Withholding Tax GL` },
              ipAddress,
              accountNo: ACCT_NO,
            }, { session });
          }
        }

        return { termDeposit: savedTermDeposit };
      });

      await session.commitTransaction();
      logger.info(`Term Deposit created successfully: ACCT_NO=${result.termDeposit.ACCT_NO}`);
      res.status(201).json({
        success: true,
        message: 'Term Deposit created successfully',
        termDeposit: result.termDeposit,
      });
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
        logger.error(`Transaction aborted for term deposit: ${error.message}`);
      }
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error('Term Deposit creation error:', error);
    res.status(error.name === 'ValidationError' ? 400 : 500).json({
      success: false,
      message: error.message,
    });
  }
};

// Settle matured term deposit
export const settleMaturedTermDeposit = async (req, res) => {
  try {
    const { termDepositId, customerAccountNo, glAccountNo, interestGLAccountNo, withholdingTaxGLAccountNo, taxRate, settlementGLAccountNo, interestPayableGLAccountNo } = req.body;
    validateRequiredFields({ termDepositId, glAccountNo, settlementGLAccountNo, interestPayableGLAccountNo, interestGLAccountNo });

    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const termDeposit = await TermDeposit.findById(termDepositId, null, { session });
        if (!termDeposit) {
          throw new CustomValidationError(`Term Deposit not found: ${termDepositId}`);
        }
        if (['SETTLED', 'CLOSED', 'COMPLETED'].includes(termDeposit.SETTLEMENT_STATUS)) {
          throw new CustomValidationError('Term Deposit already settled');
        }
        const today = new Date();
        if (new Date(termDeposit.MATURITY_DT) > today && !termDeposit.AUTO_CLOSE_ON_EXPIRY_FG) {
          throw new CustomValidationError('Term Deposit has not yet matured');
        }
        if (taxRate == null) {
          throw new CustomValidationError('taxRate is required for interest payment on maturity');
        }
        if (taxRate < 0 || taxRate > 1) {
          throw new CustomValidationError('taxRate must be between 0 and 1');
        }
        if (taxRate > 0 && !withholdingTaxGLAccountNo) {
          throw new CustomValidationError('withholdingTaxGLAccountNo is required when taxRate is greater than 0');
        }

        const validatedBU_ID = validateBU_ID(termDeposit.BU_ID);

        await validateGLAccount(glAccountNo, 'DR', 'LIABILITY', session);
        await validateGLAccount(interestPayableGLAccountNo, 'DR', 'LIABILITY', session, true);
        await validateGLAccount(interestGLAccountNo, 'CR', 'EXPENSE', session);
        if (taxRate > 0 && withholdingTaxGLAccountNo) {
          await validateGLAccount(withholdingTaxGLAccountNo, 'CR', 'LIABILITY', session);
        }
        await validateGLAccount(settlementGLAccountNo, 'CR', 'ASSET', session);

        let customerAccount = null;
        if (customerAccountNo) {
          customerAccount = await CustomerAccount.findOne({ ACCT_NO: customerAccountNo }, null, { session });
          if (!customerAccount) {
            throw new CustomValidationError(`Customer account not found: ${customerAccountNo}`);
          }
          if (!customerAccount.CR_ALLOWED) {
            throw new CustomValidationError(`Customer account ${customerAccountNo} does not allow credit transactions`);
          }
        }

        const userId = req.user?.id || 'system';
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
        const identifiers = await generateWorkflowIdentifiers();
        validateTransactionIds(identifiers);

        const principalAmount = parseFloat(termDeposit.NOTICE_AMOUNT);
        const totalInterest = parseFloat(termDeposit.NOTICE_AMOUNT) * (parseFloat(termDeposit.FIXED_RATE) / 100) * (parseFloat(termDeposit.TERM) / 12);

        const glTransactions = [
          {
            GL_ACCT_NO: glAccountNo,
            AMOUNT: principalAmount,
            TRANSACTION_TYPE: 'DR',
            CREATED_BY: userId,
            SUB_LEDGER_NO: '000',
            SEG_NO: validatedBU_ID,
            LEDGER_NO: '000',
            description: `Term Deposit Principal Settlement for ${termDeposit.ACCT_NO}`,
            JOURNAL_ID: identifiers.glSettlementTxnId,
            DRS_ALLOWED_FG: true,
            CRS_ALLOWED_FG: false,
            BAL_CD: mapTransactionTypeToBalCd('DR'),
            GL_ACCT_CAT: 'LIABILITY',
          },
          {
            GL_ACCT_NO: settlementGLAccountNo,
            AMOUNT: principalAmount,
            TRANSACTION_TYPE: 'CR',
            CREATED_BY: userId,
            SUB_LEDGER_NO: '000',
            SEG_NO: validatedBU_ID,
            LEDGER_NO: '000',
            description: `Term Deposit Principal Credit to Settlement GL for ${termDeposit.ACCT_NO}`,
            JOURNAL_ID: identifiers.glSettlementTxnId,
            DRS_ALLOWED_FG: false,
            CRS_ALLOWED_FG: true,
            BAL_CD: mapTransactionTypeToBalCd('CR'),
            GL_ACCT_CAT: 'ASSET',
          },
        ];

        const accountNo = customerAccountNo || termDeposit.SETTLEMENT_ACCOUNT;
        customerAccount = await CustomerAccount.findOne({ ACCT_NO: accountNo }, null, { session });
        if (!customerAccount) {
          throw new CustomValidationError(`Customer account not found: ${accountNo}`);
        }
        if (!customerAccount.CR_ALLOWED) {
          throw new CustomValidationError(`Customer account ${accountNo} does not allow credit transactions`);
        }
        const oldValues = {
          LEDGER_BAL: customerAccount.LEDGER_BAL,
          AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE,
        };
        customerAccount.LEDGER_BAL += principalAmount;
        customerAccount.AVAILABLE_BALANCE += principalAmount;
        customerAccount.lastActivityDate = new Date();
        await customerAccount.save({ session });
        glTransactions.push({
          GL_ACCT_NO: settlementGLAccountNo,
          AMOUNT: principalAmount,
          TRANSACTION_TYPE: 'DR',
          CREATED_BY: userId,
          SUB_LEDGER_NO: '000',
          SEG_NO: validatedBU_ID,
          LEDGER_NO: '000',
          description: `Term Deposit Principal Payout to Customer for ${termDeposit.ACCT_NO}`,
          JOURNAL_ID: identifiers.customerSettlementTxnId,
          DRS_ALLOWED_FG: true,
          CRS_ALLOWED_FG: false,
          BAL_CD: mapTransactionTypeToBalCd('DR'),
          GL_ACCT_CAT: 'ASSET',
        });

        await createAuditTrail({
          eventId: identifiers.EVENT_ID,
          userId,
          eventType: 'CUSTOMER_ACCOUNT_CREDIT',
          action: 'Credit Principal to Customer Account for Term Deposit Maturity',
          oldValue: oldValues,
          newValue: {
            LEDGER_BAL: customerAccount.LEDGER_BAL,
            AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE,
          },
          ipAddress,
          accountNo,
        }, { session });

        let interestToPay = 0;
        let interestAction = '';
        if (termDeposit.UPFRONT_INTEREST_PAYMENT && !termDeposit.PARTIAL_INTEREST_PAYMENT) {
          // Full upfront interest paid, settle to interestGLAccountNo
          interestToPay = totalInterest;
          interestAction = 'Credit Full Interest to Interest GL Account';
          glTransactions.push(
            {
              GL_ACCT_NO: interestPayableGLAccountNo,
              AMOUNT: interestToPay,
              TRANSACTION_TYPE: 'DR',
              CREATED_BY: userId,
              SUB_LEDGER_NO: '000',
              SEG_NO: validatedBU_ID,
              LEDGER_NO: '000',
              description: `Maturity Interest Settlement to Interest GL for ${termDeposit.ACCT_NO}`,
              JOURNAL_ID: identifiers.glInterestPaymentTxnId,
              DRS_ALLOWED_FG: true,
              CRS_ALLOWED_FG: false,
              BAL_CD: mapTransactionTypeToBalCd('DR'),
              GL_ACCT_CAT: 'LIABILITY',
            },
            {
              GL_ACCT_NO: interestGLAccountNo,
              AMOUNT: interestToPay,
              TRANSACTION_TYPE: 'CR',
              CREATED_BY: userId,
              SUB_LEDGER_NO: '000',
              SEG_NO: validatedBU_ID,
              LEDGER_NO: '000',
              description: `Maturity Interest Credit to Interest GL for ${termDeposit.ACCT_NO}`,
              JOURNAL_ID: identifiers.glInterestPaymentTxnId,
              DRS_ALLOWED_FG: false,
              CRS_ALLOWED_FG: true,
              BAL_CD: mapTransactionTypeToBalCd('CR'),
              GL_ACCT_CAT: 'EXPENSE',
            }
          );

          await createAuditTrail({
            eventId: identifiers.EVENT_ID,
            userId,
            eventType: 'GL_ACCOUNT_CREDIT',
            action: interestAction,
            oldValue: { BALANCE: 'N/A' },
            newValue: { BALANCE: `Credited ${interestToPay} to Interest GL` },
            ipAddress,
            accountNo: termDeposit.ACCT_NO,
          }, { session });
        } else {
          // Partial upfront interest or no upfront interest
          interestToPay = termDeposit.UPFRONT_INTEREST_PAYMENT
            ? totalInterest - parseFloat(termDeposit.UPFRONT_INTEREST_AMOUNT)
            : totalInterest;
          if (interestToPay > 0) {
            const taxAmount = interestToPay * taxRate;
            const netInterest = interestToPay - taxAmount;
            interestAction = termDeposit.UPFRONT_INTEREST_PAYMENT
              ? 'Credit Remaining Net Interest to Customer Account'
              : 'Credit Full Net Interest to Customer Account';

            glTransactions.push(
              {
                GL_ACCT_NO: interestPayableGLAccountNo,
                AMOUNT: interestToPay,
                TRANSACTION_TYPE: 'DR',
                CREATED_BY: userId,
                SUB_LEDGER_NO: '000',
                SEG_NO: validatedBU_ID,
                LEDGER_NO: '000',
                description: `Maturity Interest Payout from Interest Payable GL for ${termDeposit.ACCT_NO}`,
                JOURNAL_ID: identifiers.glInterestPaymentTxnId,
                DRS_ALLOWED_FG: true,
                CRS_ALLOWED_FG: false,
                BAL_CD: mapTransactionTypeToBalCd('DR'),
                GL_ACCT_CAT: 'LIABILITY',
              },
              {
                GL_ACCT_NO: settlementGLAccountNo,
                AMOUNT: interestToPay,
                TRANSACTION_TYPE: 'CR',
                CREATED_BY: userId,
                SUB_LEDGER_NO: '000',
                SEG_NO: validatedBU_ID,
                LEDGER_NO: '000',
                description: `Maturity Interest Credit to Settlement GL for ${termDeposit.ACCT_NO}`,
                JOURNAL_ID: identifiers.glInterestPaymentTxnId,
                DRS_ALLOWED_FG: false,
                CRS_ALLOWED_FG: true,
                BAL_CD: mapTransactionTypeToBalCd('CR'),
                GL_ACCT_CAT: 'ASSET',
              },
              {
                GL_ACCT_NO: settlementGLAccountNo,
                AMOUNT: netInterest,
                TRANSACTION_TYPE: 'DR',
                CREATED_BY: userId,
                SUB_LEDGER_NO: '000',
                SEG_NO: validatedBU_ID,
                LEDGER_NO: '000',
                description: `Maturity Net Interest Payout to Customer for ${termDeposit.ACCT_NO}`,
                JOURNAL_ID: identifiers.customerInterestPaymentTxnId,
                DRS_ALLOWED_FG: true,
                CRS_ALLOWED_FG: false,
                BAL_CD: mapTransactionTypeToBalCd('DR'),
                GL_ACCT_CAT: 'ASSET',
              }
            );

            const oldValuesInterest = {
              LEDGER_BAL: customerAccount.LEDGER_BAL,
              AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE,
            };
            customerAccount.LEDGER_BAL += netInterest;
            customerAccount.AVAILABLE_BALANCE += netInterest;
            customerAccount.lastActivityDate = new Date();
            await customerAccount.save({ session });

            await createAuditTrail({
              eventId: identifiers.EVENT_ID,
              userId,
              eventType: 'CUSTOMER_ACCOUNT_CREDIT',
              action: interestAction,
              oldValue: oldValuesInterest,
              newValue: {
                LEDGER_BAL: customerAccount.LEDGER_BAL,
                AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE,
              },
              ipAddress,
              accountNo,
            }, { session });

            if (taxAmount > 0) {
              glTransactions.push(
                {
                  GL_ACCT_NO: settlementGLAccountNo,
                  AMOUNT: taxAmount,
                  TRANSACTION_TYPE: 'DR',
                  CREATED_BY: userId,
                  SUB_LEDGER_NO: '000',
                  SEG_NO: validatedBU_ID,
                  LEDGER_NO: '000',
                  description: `Withholding Tax on Maturity Interest for ${termDeposit.ACCT_NO}`,
                  JOURNAL_ID: identifiers.JOURNAL_ID,
                  DRS_ALLOWED_FG: true,
                  CRS_ALLOWED_FG: false,
                  BAL_CD: mapTransactionTypeToBalCd('DR'),
                  GL_ACCT_CAT: 'ASSET',
                },
                {
                  GL_ACCT_NO: withholdingTaxGLAccountNo,
                  AMOUNT: taxAmount,
                  TRANSACTION_TYPE: 'CR',
                  CREATED_BY: userId,
                  SUB_LEDGER_NO: '000',
                  SEG_NO: validatedBU_ID,
                  LEDGER_NO: '000',
                  description: `Withholding Tax Credit for Term Deposit ${termDeposit.ACCT_NO}`,
                  JOURNAL_ID: identifiers.JOURNAL_ID,
                  DRS_ALLOWED_FG: false,
                  CRS_ALLOWED_FG: true,
                  BAL_CD: mapTransactionTypeToBalCd('CR'),
                  GL_ACCT_CAT: 'LIABILITY',
                }
              );

              await createAuditTrail({
                eventId: identifiers.EVENT_ID,
                userId,
                eventType: 'WITHHOLDING_TAX',
                action: 'Withholding Tax on Maturity Interest',
                oldValue: { BALANCE: 'N/A' },
                newValue: { BALANCE: `Credited ${taxAmount} to Withholding Tax GL` },
                ipAddress,
                accountNo: termDeposit.ACCT_NO,
              }, { session });
            }
          }
        }

        for (const transaction of glTransactions) {
          await createGLTransaction(null, null, transaction, { session });
        }

        termDeposit.SETTLEMENT_STATUS = termDeposit.AUTO_CLOSE_ON_EXPIRY_FG ? 'CLOSED' : 'COMPLETED';
        termDeposit.INTEREST_PAYMENT_STATUS = interestToPay > 0 ? 'PAID' : termDeposit.INTEREST_PAYMENT_STATUS;
        termDeposit.ACCRUED_INTEREST = 0;
        termDeposit.MATURITY_INTEREST_AMOUNT = interestToPay;
        await termDeposit.save({ session });

        return { message: `Term Deposit ${termDeposit.ACCT_NO} matured and processed successfully`, termDeposit };
      });

      await session.commitTransaction();
      res.status(200).json(result);
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error('Term Deposit maturity error:', error);
    res.status(error.name === 'ValidationError' ? 400 : 500).json({ message: error.message });
  }
};

// Early terminate term deposit
export const earlyTerminateTermDeposit = async (req, res) => {
  try {
    const { termDepositId, customerAccountNo, glAccountNo, interestGLAccountNo, withholdingTaxGLAccountNo, taxRate, settlementGLAccountNo, interestPayableGLAccountNo } = req.body;
    validateRequiredFields({ termDepositId, glAccountNo, settlementGLAccountNo, interestPayableGLAccountNo });

    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const termDeposit = await TermDeposit.findById(termDepositId, null, { session });
        if (!termDeposit) {
          throw new CustomValidationError(`Term Deposit not found: ${termDepositId}`);
        }
        if (['SETTLED', 'CLOSED', 'COMPLETED', 'TERMINATED'].includes(termDeposit.SETTLEMENT_STATUS)) {
          throw new CustomValidationError('Term Deposit already settled or terminated');
        }
        const today = new Date();
        if (new Date(termDeposit.MATURITY_DT) <= today) {
          throw new CustomValidationError('Term Deposit has already matured. Use settleMaturedTermDeposit instead.');
        }
        if (!termDeposit.UPFRONT_INTEREST_PAYMENT && taxRate == null) {
          throw new CustomValidationError('taxRate is required for early termination interest payment');
        }
        if (taxRate != null && (taxRate < 0 || taxRate > 1)) {
          throw new CustomValidationError('taxRate must be between 0 and 1');
        }
        if (taxRate > 0 && !withholdingTaxGLAccountNo) {
          throw new CustomValidationError('withholdingTaxGLAccountNo is required when taxRate is greater than 0');
        }

        const validatedBU_ID = validateBU_ID(termDeposit.BU_ID);

        await validateGLAccount(glAccountNo, 'DR', 'LIABILITY', session);
        await validateGLAccount(interestPayableGLAccountNo, 'DR', 'LIABILITY', session, true);
        if (interestGLAccountNo) {
          await validateGLAccount(interestGLAccountNo, 'DR', 'EXPENSE', session);
        }
        if (taxRate > 0 && withholdingTaxGLAccountNo) {
          await validateGLAccount(withholdingTaxGLAccountNo, 'CR', 'LIABILITY', session);
        }
        await validateGLAccount(settlementGLAccountNo, 'CR', 'ASSET', session);

        let customerAccount = null;
        if (customerAccountNo) {
          customerAccount = await CustomerAccount.findOne({ ACCT_NO: customerAccountNo }, null, { session });
          if (!customerAccount) {
            throw new CustomValidationError(`Customer account not found: ${customerAccountNo}`);
          }
          if (!customerAccount.CR_ALLOWED) {
            throw new CustomValidationError(`Customer account ${customerAccountNo} does not allow credit transactions`);
          }
        }

        const userId = req.user?.id || 'system';
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
        const identifiers = await generateWorkflowIdentifiers();
        validateTransactionIds(identifiers);

        const principalAmount = parseFloat(termDeposit.NOTICE_AMOUNT);
        const interestAmount = parseFloat(termDeposit.ACCRUED_INTEREST || 0);

        const glTransactions = [
          {
            GL_ACCT_NO: glAccountNo,
            AMOUNT: principalAmount,
            TRANSACTION_TYPE: 'DR',
            CREATED_BY: userId,
            SUB_LEDGER_NO: '000',
            SEG_NO: validatedBU_ID,
            LEDGER_NO: '000',
            description: `Early Termination Principal Settlement for ${termDeposit.ACCT_NO}`,
            JOURNAL_ID: identifiers.glSettlementTxnId,
            DRS_ALLOWED_FG: true,
            CRS_ALLOWED_FG: false,
            BAL_CD: mapTransactionTypeToBalCd('DR'),
            GL_ACCT_CAT: 'LIABILITY',
          },
          {
            GL_ACCT_NO: settlementGLAccountNo,
            AMOUNT: principalAmount,
            TRANSACTION_TYPE: 'CR',
            CREATED_BY: userId,
            SUB_LEDGER_NO: '000',
            SEG_NO: validatedBU_ID,
            LEDGER_NO: '000',
            description: `Early Termination Principal Credit to Settlement GL for ${termDeposit.ACCT_NO}`,
            JOURNAL_ID: identifiers.glSettlementTxnId,
            DRS_ALLOWED_FG: false,
            CRS_ALLOWED_FG: true,
            BAL_CD: mapTransactionTypeToBalCd('CR'),
            GL_ACCT_CAT: 'ASSET',
          },
        ];

        const accountNo = customerAccountNo || termDeposit.SETTLEMENT_ACCOUNT;
        customerAccount = await CustomerAccount.findOne({ ACCT_NO: accountNo }, null, { session });
        if (!customerAccount) {
          throw new CustomValidationError(`Customer account not found: ${accountNo}`);
        }
        if (!customerAccount.CR_ALLOWED) {
          throw new CustomValidationError(`Customer account ${accountNo} does not allow credit transactions`);
        }
        const oldValues = {
          LEDGER_BAL: customerAccount.LEDGER_BAL,
          AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE,
        };
        customerAccount.LEDGER_BAL += principalAmount;
        customerAccount.AVAILABLE_BALANCE += principalAmount;
        customerAccount.lastActivityDate = new Date();
        await customerAccount.save({ session });

        glTransactions.push({
          GL_ACCT_NO: settlementGLAccountNo,
          AMOUNT: principalAmount,
          TRANSACTION_TYPE: 'DR',
          CREATED_BY: userId,
          SUB_LEDGER_NO: '000',
          SEG_NO: validatedBU_ID,
          LEDGER_NO: '000',
          description: `Early Termination Principal Payout to Customer for ${termDeposit.ACCT_NO}`,
          JOURNAL_ID: identifiers.customerSettlementTxnId,
          DRS_ALLOWED_FG: true,
          CRS_ALLOWED_FG: false,
          BAL_CD: mapTransactionTypeToBalCd('DR'),
          GL_ACCT_CAT: 'ASSET',
        });

        await createAuditTrail({
          eventId: identifiers.EVENT_ID,
          userId,
          eventType: 'CUSTOMER_ACCOUNT_CREDIT',
          action: 'Credit Principal to Customer Account on Early Termination',
          oldValue: oldValues,
          newValue: {
            LEDGER_BAL: customerAccount.LEDGER_BAL,
            AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE,
          },
          ipAddress,
          accountNo,
        }, { session });

        if (interestAmount > 0) {
          const taxAmount = interestAmount * taxRate;
          const netInterest = interestAmount - taxAmount;

          glTransactions.push(
            {
              GL_ACCT_NO: interestPayableGLAccountNo,
              AMOUNT: interestAmount,
              TRANSACTION_TYPE: 'DR',
              CREATED_BY: userId,
              SUB_LEDGER_NO: '000',
              SEG_NO: validatedBU_ID,
              LEDGER_NO: '000',
              description: `Early Termination Interest Payout from Interest Payable GL for ${termDeposit.ACCT_NO}`,
              JOURNAL_ID: identifiers.glInterestPaymentTxnId,
              DRS_ALLOWED_FG: true,
              CRS_ALLOWED_FG: false,
              BAL_CD: mapTransactionTypeToBalCd('DR'),
              GL_ACCT_CAT: 'LIABILITY',
            },
            {
              GL_ACCT_NO: settlementGLAccountNo,
              AMOUNT: interestAmount,
              TRANSACTION_TYPE: 'CR',
              CREATED_BY: userId,
              SUB_LEDGER_NO: '000',
              SEG_NO: validatedBU_ID,
              LEDGER_NO: '000',
              description: `Early Termination Interest Credit to Settlement GL for ${termDeposit.ACCT_NO}`,
              JOURNAL_ID: identifiers.glInterestPaymentTxnId,
              DRS_ALLOWED_FG: false,
              CRS_ALLOWED_FG: true,
              BAL_CD: mapTransactionTypeToBalCd('CR'),
              GL_ACCT_CAT: 'ASSET',
            },
            {
              GL_ACCT_NO: settlementGLAccountNo,
              AMOUNT: netInterest,
              TRANSACTION_TYPE: 'DR',
              CREATED_BY: userId,
              SUB_LEDGER_NO: '000',
              SEG_NO: validatedBU_ID,
              LEDGER_NO: '000',
              description: `Early Termination Net Interest Payout to Customer for ${termDeposit.ACCT_NO}`,
              JOURNAL_ID: identifiers.customerInterestPaymentTxnId,
              DRS_ALLOWED_FG: true,
              CRS_ALLOWED_FG: false,
              BAL_CD: mapTransactionTypeToBalCd('DR'),
              GL_ACCT_CAT: 'ASSET',
            }
          );

          const oldValuesInterest = {
            LEDGER_BAL: customerAccount.LEDGER_BAL,
            AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE,
          };
          customerAccount.LEDGER_BAL += netInterest;
          customerAccount.AVAILABLE_BALANCE += netInterest;
          customerAccount.lastActivityDate = new Date();
          await customerAccount.save({ session });

          await createAuditTrail({
            eventId: identifiers.EVENT_ID,
            userId,
            eventType: 'CUSTOMER_ACCOUNT_CREDIT',
            action: 'Credit Early Termination Net Interest to Customer Account',
            oldValue: oldValuesInterest,
            newValue: {
              LEDGER_BAL: customerAccount.LEDGER_BAL,
              AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE,
            },
            ipAddress,
            accountNo,
          }, { session });

          if (taxAmount > 0) {
            glTransactions.push(
              {
                GL_ACCT_NO: settlementGLAccountNo,
                AMOUNT: taxAmount,
                TRANSACTION_TYPE: 'DR',
                CREATED_BY: userId,
                SUB_LEDGER_NO: '000',
                SEG_NO: validatedBU_ID,
                LEDGER_NO: '000',
                description: `Withholding Tax on Early Termination Interest for ${termDeposit.ACCT_NO}`,
                JOURNAL_ID: identifiers.JOURNAL_ID,
                DRS_ALLOWED_FG: true,
                CRS_ALLOWED_FG: false,
                BAL_CD: mapTransactionTypeToBalCd('DR'),
                GL_ACCT_CAT: 'ASSET',
              },
              {
                GL_ACCT_NO: withholdingTaxGLAccountNo,
                AMOUNT: taxAmount,
                TRANSACTION_TYPE: 'CR',
                CREATED_BY: userId,
                SUB_LEDGER_NO: '000',
                SEG_NO: validatedBU_ID,
                LEDGER_NO: '000',
                description: `Withholding Tax Credit for Term Deposit ${termDeposit.ACCT_NO}`,
                JOURNAL_ID: identifiers.JOURNAL_ID,
                DRS_ALLOWED_FG: false,
                CRS_ALLOWED_FG: true,
                BAL_CD: mapTransactionTypeToBalCd('CR'),
                GL_ACCT_CAT: 'LIABILITY',
              }
            );

            await createAuditTrail({
              eventId: identifiers.EVENT_ID,
              userId,
              eventType: 'WITHHOLDING_TAX',
              action: 'Withholding Tax on Early Termination Interest',
              oldValue: { BALANCE: 'N/A' },
              newValue: { BALANCE: `Credited ${taxAmount} to Withholding Tax GL` },
              ipAddress,
              accountNo: termDeposit.ACCT_NO,
            }, { session });
          }
        }

        for (const transaction of glTransactions) {
          await createGLTransaction(null, null, transaction, { session });
        }

        termDeposit.SETTLEMENT_STATUS = 'TERMINATED';
        termDeposit.INTEREST_PAYMENT_STATUS = interestAmount > 0 ? 'PAID' : termDeposit.INTEREST_PAYMENT_STATUS;
        termDeposit.MATURITY_INTEREST_AMOUNT = interestAmount;
        termDeposit.ACCRUED_INTEREST = 0;
        await termDeposit.save({ session });

        return { message: `Term Deposit ${termDeposit.ACCT_NO} early terminated and processed successfully`, termDeposit };
      });

      await session.commitTransaction();
      res.status(200).json(result);
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error('Term Deposit early termination error:', error);
    res.status(error.name === 'ValidationError' ? 400 : 500).json({ message: error.message });
  }
};

// Get a term deposit by ID
export const getTermDepositById = async (req, res) => {
  try {
    const termDeposit = await TermDeposit.findById(req.params.id);
    if (!termDeposit) {
      return res.status(404).json({ message: 'Term Deposit not found' });
    }
    res.status(200).json(termDeposit);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllTermDeposits = async (req, res) => {
  try {
    const termDeposits = await TermDeposit.find();
    res.status(200).json(termDeposits);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching term deposits', error });
  }
};

// Update a term deposit by ID
export const updateTermDeposit = async (req, res) => {
  try {
    const updatedDeposit = await TermDeposit.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedDeposit) {
      return res.status(404).json({ message: 'Term Deposit not found' });
    }
    res.status(200).json(updatedDeposit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete a term deposit by ID
export const deleteTermDeposit = async (req, res) => {
  try {
    const termDeposit = await TermDeposit.findById(req.params.id);
    if (!termDeposit) {
      return res.status(404).json({ message: 'Term Deposit not found' });
    }
    await termDeposit.remove();
    res.status(200).json({ message: 'Term Deposit deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};