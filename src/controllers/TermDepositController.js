// controllers/termDepositController.js
import { Sequelize, Op } from 'sequelize';
import TermDeposit from '../models/TermDeposit.js';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import GLAccount from '../models/GLAccount.js';
import  createGLTransaction from '../controllers/GLAccountTransactionController.js'; // ✅ FIXED: Correct import path
import { generateAccountNumber } from '../utils/generateAccountNumber.js';
import { generateTermDepositContractLetter } from '../utils/pdfGenerator.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';
import logger from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import SavingsProduct from '../models/SavingsProduct.js';
import sequelize from '../../config/db.js';

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
    .filter(([_, value]) => value == null || value === '')
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
const generateEventId = async (transaction = null) => {
  try {
    const options = transaction ? { transaction } : {};
    const lastAudit = await AuditTrail.findOne({
      order: [['event_id', 'DESC']]
    }, options);
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
    validatedParams.eventId = await generateEventId(options.transaction);
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
    const auditTrail = await AuditTrail.create({
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
    }, { transaction: options.transaction });

    logger.info(`Audit Trail created successfully: event_id=${validatedParams.eventId}`);
    return auditTrail;
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
const validateGLAccount = async (glAccountNo, transactionType, glAcctCat, transaction, isInterestPayable = false) => {
  logger.info(
    `Validating GL Account: ${glAccountNo}, Type: ${transactionType}, Category: ${glAcctCat}, IsInterestPayable: ${isInterestPayable}`
  );

  if (!validateGLAccountFormat(glAccountNo)) {
    throw new CustomValidationError(
      `Invalid GL Account format: ${glAccountNo}. Expected format: XX-XXX-XXX-XXX-XXX or X-XXX-XXX-XXX-XXX`
    );
  }

  const glAccount = await GLAccount.findOne({
    where: { GL_ACCT_NO: glAccountNo },
    transaction
  });
  
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
  const transaction = await sequelize.transaction();
  
  try {
    const termDeposits = await TermDeposit.findAll({
      where: {
        SETTLEMENT_STATUS: 'ACTIVE',
        UPFRONT_INTEREST_PAYMENT: false,
      },
      transaction
    });
    
    const userId = 'system';
    const ipAddress = 'EOD_PROCESS';
    
    for (const termDeposit of termDeposits) {
      try {
        const identifiers = await generateWorkflowIdentifiers();
        validateTransactionIds(identifiers);
        
        await validateGLAccount(termDeposit.INTEREST_GL_ACCT_NO, 'DR', 'EXPENSE', transaction);
        await validateGLAccount(termDeposit.INTEREST_PAYABLE_GL_ACCT_NO, 'CR', 'LIABILITY', transaction, true);
        
        const validatedBU_ID = validateBU_ID(termDeposit.BU_ID);
        const principal = parseFloat(termDeposit.NOTICE_AMOUNT);
        const annualRate = parseFloat(termDeposit.rateInformation?.fixedRate || 0) / 100;
        const accrualBasis = termDeposit.accrualInformation?.accrualBasis || 'ACT/365';
        const daysInYear = accrualBasis === 'ACT/360' ? 360 : 365;
        const dailyInterest = (principal * annualRate) / daysInYear;
        
        termDeposit.ACCRUED_INTEREST = (parseFloat(termDeposit.ACCRUED_INTEREST) || 0) + dailyInterest;
        termDeposit.LAST_ACCRUAL_DATE = new Date();
        
        await termDeposit.save({ transaction });
        
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
        
        for (const transactionData of glTransactions) {
          await createGLTransaction(null, null, transactionData, { transaction });
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
        }, { transaction });
        
      } catch (error) {
        logger.error(`Error processing term deposit ${termDeposit.ACCT_NO}: ${error.message}`);
        throw error;
      }
    }
    
    await transaction.commit();
    logger.info('Daily interest accrual completed successfully');
    
  } catch (error) {
    await transaction.rollback();
    logger.error('Daily interest accrual error:', error);
    throw error;
  }
};

// Create term deposit
export const createTermDeposit = async (req, res) => {
  const transaction = await sequelize.transaction();
  
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
      taxRate,
      createdBy,
    } = req.body;

    // Validate required fields
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
    };
    
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => value == null || value === '')
      .map(([key]) => key);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Validate productCode
    const product = await SavingsProduct.findOne({
      where: { productCode },
      transaction
    });
    
    if (!product) {
      throw new Error(`Invalid productCode: ${productCode}. No matching SavingsProduct found.`);
    }

    // Validate customer account
    const customerAccount = await CustomerAccount.findOne({
      where: { ACCT_NO },
      transaction
    });
    
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
    
    if (parseFloat(customerAccount.AVAILABLE_BALANCE) < debitAmount) {
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
    
    if (taxRate > 0 && !product.withholdingTaxGLAccountNo) {
      throw new Error('withholdingTaxGLAccountNo is required when taxRate is greater than 0');
    }

    // Validate GL accounts
    const glAccountsToValidate = [
      { account: product.principalBalanceGLAccountNo, transactionType: 'CR', category: 'LIABILITY' },
      { account: product.interestCreditGLAccountNo, transactionType: 'CR', category: 'LIABILITY' },
      ...(taxRate > 0 && product.withholdingTaxGLAccountNo ? [{ account: product.withholdingTaxGLAccountNo, transactionType: 'CR', category: 'LIABILITY' }] : []),
    ];
    
    for (const { account, transactionType, category } of glAccountsToValidate) {
      await validateGLAccount(account, transactionType, category, transaction);
    }

    // Generate identifiers
    const identifiers = await generateWorkflowIdentifiers();
    validateTransactionIds(identifiers);

    // Calculate interest amounts using rateInformation from SavingsProduct
    const productRateInfo = product.rateInformation || {};
    const calculatedInterest = parseFloat(NOTICE_AMOUNT) * (parseFloat(productRateInfo.fixedRate || 0) / 100) * (parseFloat(TERM) / 12);
    const finalUpfrontInterestRate = UPFRONT_INTEREST_PAYMENT ? parseFloat(productRateInfo.fixedRate || 0) : 0;
    const finalUpfrontInterestAmount = UPFRONT_INTEREST_PAYMENT ? calculatedInterest : 0;
    const finalMaturityInterestAmount = UPFRONT_INTEREST_PAYMENT ? 0 : calculatedInterest;
    const maturityAmount = parseFloat(NOTICE_AMOUNT) + finalMaturityInterestAmount;

    const userId = req.user?.id || createdBy || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

    // Debit customer account
    const oldLedgerBal = parseFloat(customerAccount.LEDGER_BAL);
    const oldClearedBal = parseFloat(customerAccount.CLEARED_BAL || oldLedgerBal);
    const oldAvailableBal = parseFloat(customerAccount.AVAILABLE_BALANCE);
    
    customerAccount.LEDGER_BAL = (oldLedgerBal - debitAmount).toFixed(2);
    customerAccount.CLEARED_BAL = (oldClearedBal - debitAmount).toFixed(2);
    customerAccount.AVAILABLE_BALANCE = (oldAvailableBal - debitAmount).toFixed(2);
    customerAccount.lastActivityDate = new Date();
    
    logger.info(`Debiting customer account ${ACCT_NO}: oldBalance=${oldLedgerBal}, newBalance=${customerAccount.LEDGER_BAL}`);
    await customerAccount.save({ transaction });

    // Create audit trail for customer account debit
    await createAuditTrail({
      eventId: identifiers.EVENT_ID,
      userId,
      eventType: 'CUSTOMER_ACCOUNT_DEBIT',
      action: 'Debit Customer Account for Term Deposit',
      oldValue: { 
        LEDGER_BAL: oldLedgerBal.toString(), 
        CLEARED_BAL: oldClearedBal.toString(), 
        AVAILABLE_BALANCE: oldAvailableBal.toString() 
      },
      newValue: {
        LEDGER_BAL: customerAccount.LEDGER_BAL.toString(),
        CLEARED_BAL: customerAccount.CLEARED_BAL.toString(),
        AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE.toString(),
      },
      ipAddress,
      accountNo: ACCT_NO,
    }, { transaction });

    // GL transaction for principal credit
    const glTransactions = [
      {
        GL_ACCT_NO: product.principalBalanceGLAccountNo,
        AMOUNT: debitAmount.toFixed(2),
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
    for (const glTransaction of glTransactions) {
      logger.info(`Processing GL transaction: ${JSON.stringify(glTransaction)}`);
      await createGLTransaction(null, null, glTransaction, { transaction });
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
    }, { transaction });

    // Create term deposit
    const termDepositData = {
      ACCT_NM,
      ACCT_NO,
      START_DT: new Date(START_DT),
      ROLLOVER_OPT_CD,
      ROLLOVER_TYPE: ROLLOVER_TYPE.toUpperCase(),
      TERM,
      MATURITY_DT: new Date(MATURITY_DT),
      NOTICE_AMOUNT: debitAmount.toFixed(2),
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
      AUTO_CLOSE_ON_EXPIRY_FG: AUTO_CLOSE_ON_EXPIRY_FG || false,
      UPFRONT_INTEREST_PAYMENT: UPFRONT_INTEREST_PAYMENT || false,
      PARTIAL_INTEREST_PAYMENT: PARTIAL_INTEREST_PAYMENT || false,
      UPFRONT_INTEREST_RATE: finalUpfrontInterestRate.toFixed(2),
      UPFRONT_INTEREST_AMOUNT: finalUpfrontInterestAmount.toFixed(2),
      MATURITY_INTEREST_AMOUNT: finalMaturityInterestAmount.toFixed(2),
      MATURITY_AMOUNT: maturityAmount.toFixed(2),
      INTEREST_PAYMENT_STATUS: INTEREST_PAYMENT_STATUS?.toUpperCase() || (UPFRONT_INTEREST_PAYMENT ? 'PAID' : 'PENDING'),
      SETTLEMENT_STATUS: SETTLEMENT_STATUS?.toUpperCase() || 'ACTIVE',
      GL_INTEREST_PAYMENT_TXN_ID,
      GL_SETTLEMENT_TXN_ID,
      CUSTOMER_INTEREST_PAYMENT_TXN_ID,
      CUSTOMER_SETTLEMENT_TXN_ID,
      INTEREST_GL_ACCT_NO: product.interestIncomeGLAccountNo,
      INTEREST_PAYABLE_GL_ACCT_NO: product.interestPayableGLAccountNo,
      SETTLEMENT_GL_ACCT_NO: product.principalBalanceGLAccountNo,
      depositChargeReceivableGLAccountNo: product.depositChargeReceivableGLAccountNo,
      delinquentBalanceGLAccountNo: product.delinquentBalanceGLAccountNo,
      dormantBalanceGLAccountNo: product.dormantBalanceGLAccountNo,
      earmarkedBalanceGLAccountNo: product.earmarkedBalanceGLAccountNo,
      escheatedBalanceGLAccountNo: product.escheatedBalanceGLAccountNo,
      interestChequesGLAccountNo: product.interestChequesGLAccountNo,
      interestExpenseGLAccountNo: product.interestExpenseGLAccountNo,
      interestIncomeGLAccountNo: product.interestIncomeGLAccountNo,
      interestReceivableGLAccountNo: product.interestReceivableGLAccountNo,
      interestSuspenseGLAccountNo: product.interestSuspenseGLAccountNo,
      maturedBalanceGLAccountNo: product.maturedBalanceGLAccountNo,
      maturityChequesGLAccountNo: product.maturityChequesGLAccountNo,
      nonAccrualBalanceGLAccountNo: product.nonAccrualBalanceGLAccountNo,
      overdrawnBalanceGLAccountNo: product.overdrawnBalanceGLAccountNo,
      preDormantBalanceGLAccountNo: product.preDormantBalanceGLAccountNo,
      principalBalanceGLAccountNo: product.principalBalanceGLAccountNo,
      provisionReserveGLAccountNo: product.provisionReserveGLAccountNo,
      provisionExpenseGLAccountNo: product.provisionExpenseGLAccountNo,
      rejectedCreditSuspenseGLAccountNo: product.rejectedCreditSuspenseGLAccountNo,
      rejectedDebitSuspenseGLAccountNo: product.rejectedDebitSuspenseGLAccountNo,
      reservedBalanceGLAccountNo: product.reservedBalanceGLAccountNo,
      unclearedBalanceGLAccountNo: product.unclearedBalanceGLAccountNo,
      writeOffBalanceGLAccountNo: product.writeOffBalanceGLAccountNo,
      recoveriesGLAccountNo: product.recoveriesGLAccountNo,
      interestCreditGLAccountNo: product.interestCreditGLAccountNo,
      interestDebitGLAccountNo: product.interestDebitGLAccountNo,
      withholdingTaxGLAccountNo: product.withholdingTaxGLAccountNo,
      rateInformation: product.rateInformation,
      settlementInformation: product.settlementInformation,
      accrualInformation: product.accrualInformation,
      chargesSetup: product.chargesSetup,
      ACCRUED_INTEREST: '0.00',
      LAST_ACCRUAL_DATE: null,
    };

    const termDeposit = await TermDeposit.create(termDepositData, { transaction });
    logger.info(`Term deposit created successfully: ACCT_NO=${ACCT_NO}`);

    // Process upfront interest payment
    if (UPFRONT_INTEREST_PAYMENT && finalUpfrontInterestAmount > 0) {
      const taxAmount = finalUpfrontInterestAmount * taxRate;
      const netInterest = finalUpfrontInterestAmount - taxAmount;
      logger.info(`Processing upfront interest: gross=${finalUpfrontInterestAmount}, tax=${taxAmount}, net=${netInterest}`);

      const customerAccountForInterest = await CustomerAccount.findOne({
        where: { ACCT_NO },
        transaction
      });
      
      if (!customerAccountForInterest) {
        throw new Error(`Customer account not found: ${ACCT_NO}`);
      }
      
      if (!customerAccountForInterest.CR_ALLOWED) {
        throw new Error(`Customer account ${ACCT_NO} does not allow credit transactions`);
      }
      
      const oldLedgerBalInterest = parseFloat(customerAccountForInterest.LEDGER_BAL);
      const oldClearedBalInterest = parseFloat(customerAccountForInterest.CLEARED_BAL || oldLedgerBalInterest);
      const oldAvailableBalInterest = parseFloat(customerAccountForInterest.AVAILABLE_BALANCE);

      const interestGLTransactions = [
        {
          GL_ACCT_NO: product.principalBalanceGLAccountNo,
          AMOUNT: netInterest.toFixed(2),
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
          GL_ACCT_NO: product.interestPayableGLAccountNo,
          AMOUNT: finalUpfrontInterestAmount.toFixed(2),
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
          GL_ACCT_NO: product.principalBalanceGLAccountNo,
          AMOUNT: taxAmount.toFixed(2),
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
          GL_ACCT_NO: product.withholdingTaxGLAccountNo,
          AMOUNT: taxAmount.toFixed(2),
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
      for (const glTransaction of [...interestGLTransactions, ...taxGLTransactions]) {
        logger.info(`Processing GL transaction: ${JSON.stringify(glTransaction)}`);
        await createGLTransaction(null, null, glTransaction, { transaction });
      }

      // Credit customer account with net interest
      customerAccountForInterest.LEDGER_BAL = (oldLedgerBalInterest + netInterest).toFixed(2);
      customerAccountForInterest.CLEARED_BAL = (oldClearedBalInterest + netInterest).toFixed(2);
      customerAccountForInterest.AVAILABLE_BALANCE = (oldAvailableBalInterest + netInterest).toFixed(2);
      customerAccountForInterest.lastActivityDate = new Date();
      
      logger.info(`Crediting customer account ${ACCT_NO}: oldBalance=${oldLedgerBalInterest}, newBalance=${customerAccountForInterest.LEDGER_BAL}`);
      await customerAccountForInterest.save({ transaction });

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
      }, { transaction });

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
        }, { transaction });
      }
    }

    await transaction.commit();
    
    res.status(201).json({
      success: true,
      message: 'Term Deposit created successfully',
      termDeposit,
    });
    
  } catch (error) {
    await transaction.rollback();
    logger.error('Term Deposit creation error:', error);
    
    res.status(error.name === 'ValidationError' ? 400 : 500).json({
      success: false,
      message: error.message,
    });
  }
};

// Settle matured term deposit
export const settleMaturedTermDeposit = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { 
      termDepositId, 
      customerAccountNo, 
      taxRate 
    } = req.body;
    
    validateRequiredFields({ termDepositId });

    // Find term deposit
    const termDeposit = await TermDeposit.findByPk(termDepositId, { transaction });
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
    
    if (taxRate > 0 && !termDeposit.withholdingTaxGLAccountNo) {
      throw new CustomValidationError('withholdingTaxGLAccountNo is required when taxRate is greater than 0');
    }

    const validatedBU_ID = validateBU_ID(termDeposit.BU_ID);

    // Validate GL accounts
    await validateGLAccount(termDeposit.principalBalanceGLAccountNo, 'DR', 'LIABILITY', transaction);
    await validateGLAccount(termDeposit.interestPayableGLAccountNo, 'DR', 'LIABILITY', transaction, true);
    await validateGLAccount(termDeposit.interestIncomeGLAccountNo, 'CR', 'EXPENSE', transaction);
    
    if (taxRate > 0 && termDeposit.withholdingTaxGLAccountNo) {
      await validateGLAccount(termDeposit.withholdingTaxGLAccountNo, 'CR', 'LIABILITY', transaction);
    }
    
    await validateGLAccount(termDeposit.principalBalanceGLAccountNo, 'CR', 'ASSET', transaction);

    let customerAccount = null;
    const accountNo = customerAccountNo || termDeposit.SETTLEMENT_ACCOUNT;
    
    customerAccount = await CustomerAccount.findOne({
      where: { ACCT_NO: accountNo },
      transaction
    });
    
    if (!customerAccount) {
      throw new CustomValidationError(`Customer account not found: ${accountNo}`);
    }
    
    if (!customerAccount.CR_ALLOWED) {
      throw new CustomValidationError(`Customer account ${accountNo} does not allow credit transactions`);
    }

    const userId = req.user?.id || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const identifiers = await generateWorkflowIdentifiers();
    validateTransactionIds(identifiers);

    const principalAmount = parseFloat(termDeposit.NOTICE_AMOUNT);
    const rateInfo = termDeposit.rateInformation || {};
    const totalInterest = parseFloat(termDeposit.NOTICE_AMOUNT) * (parseFloat(rateInfo.fixedRate || 0) / 100) * (parseFloat(termDeposit.TERM) / 12);

    // GL transactions for principal settlement
    const glTransactions = [
      {
        GL_ACCT_NO: termDeposit.principalBalanceGLAccountNo,
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
        GL_ACCT_NO: termDeposit.principalBalanceGLAccountNo,
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

    // Credit customer account with principal
    const oldValues = {
      LEDGER_BAL: customerAccount.LEDGER_BAL,
      AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE,
    };
    
    customerAccount.LEDGER_BAL = (parseFloat(customerAccount.LEDGER_BAL) + principalAmount).toFixed(2);
    customerAccount.AVAILABLE_BALANCE = (parseFloat(customerAccount.AVAILABLE_BALANCE) + principalAmount).toFixed(2);
    customerAccount.lastActivityDate = new Date();
    await customerAccount.save({ transaction });
    
    glTransactions.push({
      GL_ACCT_NO: termDeposit.principalBalanceGLAccountNo,
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
    }, { transaction });

    let interestToPay = 0;
    let interestAction = '';
    
    if (termDeposit.UPFRONT_INTEREST_PAYMENT && !termDeposit.PARTIAL_INTEREST_PAYMENT) {
      // Full upfront interest paid, settle to interestGLAccountNo
      interestToPay = totalInterest;
      interestAction = 'Credit Full Interest to Interest GL Account';
      
      glTransactions.push(
        {
          GL_ACCT_NO: termDeposit.interestPayableGLAccountNo,
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
          GL_ACCT_NO: termDeposit.interestIncomeGLAccountNo,
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
      }, { transaction });
    } else {
      // Partial upfront interest or no upfront interest
      interestToPay = termDeposit.UPFRONT_INTEREST_PAYMENT
        ? totalInterest - parseFloat(termDeposit.UPFRONT_INTEREST_AMOUNT || 0)
        : totalInterest;
        
      if (interestToPay > 0) {
        const taxAmount = interestToPay * taxRate;
        const netInterest = interestToPay - taxAmount;
        interestAction = termDeposit.UPFRONT_INTEREST_PAYMENT
          ? 'Credit Remaining Net Interest to Customer Account'
          : 'Credit Full Net Interest to Customer Account';

        glTransactions.push(
          {
            GL_ACCT_NO: termDeposit.interestPayableGLAccountNo,
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
            GL_ACCT_NO: termDeposit.principalBalanceGLAccountNo,
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
            GL_ACCT_NO: termDeposit.principalBalanceGLAccountNo,
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
        
        customerAccount.LEDGER_BAL = (parseFloat(customerAccount.LEDGER_BAL) + netInterest).toFixed(2);
        customerAccount.AVAILABLE_BALANCE = (parseFloat(customerAccount.AVAILABLE_BALANCE) + netInterest).toFixed(2);
        customerAccount.lastActivityDate = new Date();
        await customerAccount.save({ transaction });

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
        }, { transaction });

        if (taxAmount > 0) {
          glTransactions.push(
            {
              GL_ACCT_NO: termDeposit.principalBalanceGLAccountNo,
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
              GL_ACCT_NO: termDeposit.withholdingTaxGLAccountNo,
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
          }, { transaction });
        }
      }
    }

    // Process all GL transactions
    for (const glTransaction of glTransactions) {
      await createGLTransaction(null, null, glTransaction, { transaction });
    }

    // Update term deposit status
    termDeposit.SETTLEMENT_STATUS = termDeposit.AUTO_CLOSE_ON_EXPIRY_FG ? 'CLOSED' : 'COMPLETED';
    termDeposit.INTEREST_PAYMENT_STATUS = interestToPay > 0 ? 'PAID' : termDeposit.INTEREST_PAYMENT_STATUS;
    termDeposit.ACCRUED_INTEREST = 0;
    termDeposit.MATURITY_INTEREST_AMOUNT = interestToPay;
    await termDeposit.save({ transaction });

    await transaction.commit();
    
    res.status(200).json({
      message: `Term Deposit ${termDeposit.ACCT_NO} matured and processed successfully`,
      termDeposit,
    });
    
  } catch (error) {
    await transaction.rollback();
    logger.error('Term Deposit maturity error:', error);
    
    res.status(error.name === 'ValidationError' ? 400 : 500).json({
      success: false,
      message: error.message,
    });
  }
};

// Early terminate term deposit
export const earlyTerminateTermDeposit = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { termDepositId, customerAccountNo, taxRate } = req.body;
    validateRequiredFields({ termDepositId });

    // Find term deposit
    const termDeposit = await TermDeposit.findByPk(termDepositId, { transaction });
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
    
    if (taxRate > 0 && !termDeposit.withholdingTaxGLAccountNo) {
      throw new CustomValidationError('withholdingTaxGLAccountNo is required when taxRate is greater than 0');
    }

    const validatedBU_ID = validateBU_ID(termDeposit.BU_ID);

    // Validate GL accounts
    await validateGLAccount(termDeposit.principalBalanceGLAccountNo, 'DR', 'LIABILITY', transaction);
    await validateGLAccount(termDeposit.interestPayableGLAccountNo, 'DR', 'LIABILITY', transaction, true);
    
    if (taxRate > 0 && termDeposit.withholdingTaxGLAccountNo) {
      await validateGLAccount(termDeposit.withholdingTaxGLAccountNo, 'CR', 'LIABILITY', transaction);
    }
    
    await validateGLAccount(termDeposit.principalBalanceGLAccountNo, 'CR', 'ASSET', transaction);

    let customerAccount = null;
    const accountNo = customerAccountNo || termDeposit.SETTLEMENT_ACCOUNT;
    
    customerAccount = await CustomerAccount.findOne({
      where: { ACCT_NO: accountNo },
      transaction
    });
    
    if (!customerAccount) {
      throw new CustomValidationError(`Customer account not found: ${accountNo}`);
    }
    
    if (!customerAccount.CR_ALLOWED) {
      throw new CustomValidationError(`Customer account ${accountNo} does not allow credit transactions`);
    }

    const userId = req.user?.id || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const identifiers = await generateWorkflowIdentifiers();
    validateTransactionIds(identifiers);

    const principalAmount = parseFloat(termDeposit.NOTICE_AMOUNT);
    const interestAmount = parseFloat(termDeposit.ACCRUED_INTEREST || 0);

    // GL transactions for principal settlement
    const glTransactions = [
      {
        GL_ACCT_NO: termDeposit.principalBalanceGLAccountNo,
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
        GL_ACCT_NO: termDeposit.principalBalanceGLAccountNo,
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

    // Credit customer account with principal
    const oldValues = {
      LEDGER_BAL: customerAccount.LEDGER_BAL,
      AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE,
    };
    
    customerAccount.LEDGER_BAL = (parseFloat(customerAccount.LEDGER_BAL) + principalAmount).toFixed(2);
    customerAccount.AVAILABLE_BALANCE = (parseFloat(customerAccount.AVAILABLE_BALANCE) + principalAmount).toFixed(2);
    customerAccount.lastActivityDate = new Date();
    await customerAccount.save({ transaction });

    glTransactions.push({
      GL_ACCT_NO: termDeposit.principalBalanceGLAccountNo,
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
    }, { transaction });

    if (interestAmount > 0) {
      const taxAmount = interestAmount * taxRate;
      const netInterest = interestAmount - taxAmount;

      glTransactions.push(
        {
          GL_ACCT_NO: termDeposit.interestPayableGLAccountNo,
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
          GL_ACCT_NO: termDeposit.principalBalanceGLAccountNo,
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
          GL_ACCT_NO: termDeposit.principalBalanceGLAccountNo,
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
      
      customerAccount.LEDGER_BAL = (parseFloat(customerAccount.LEDGER_BAL) + netInterest).toFixed(2);
      customerAccount.AVAILABLE_BALANCE = (parseFloat(customerAccount.AVAILABLE_BALANCE) + netInterest).toFixed(2);
      customerAccount.lastActivityDate = new Date();
      await customerAccount.save({ transaction });

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
      }, { transaction });

      if (taxAmount > 0) {
        glTransactions.push(
          {
            GL_ACCT_NO: termDeposit.principalBalanceGLAccountNo,
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
            GL_ACCT_NO: termDeposit.withholdingTaxGLAccountNo,
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
        }, { transaction });
      }
    }

    // Process all GL transactions
    for (const glTransaction of glTransactions) {
      await createGLTransaction(null, null, glTransaction, { transaction });
    }

    // Update term deposit status
    termDeposit.SETTLEMENT_STATUS = 'TERMINATED';
    termDeposit.INTEREST_PAYMENT_STATUS = interestAmount > 0 ? 'PAID' : termDeposit.INTEREST_PAYMENT_STATUS;
    termDeposit.MATURITY_INTEREST_AMOUNT = interestAmount;
    termDeposit.ACCRUED_INTEREST = 0;
    await termDeposit.save({ transaction });

    await transaction.commit();
    
    res.status(200).json({
      message: `Term Deposit ${termDeposit.ACCT_NO} early terminated and processed successfully`,
      termDeposit,
    });
    
  } catch (error) {
    await transaction.rollback();
    logger.error('Term Deposit early termination error:', error);
    
    res.status(error.name === 'ValidationError' ? 400 : 500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get a term deposit by ID
export const getTermDepositById = async (req, res) => {
  try {
    const termDeposit = await TermDeposit.findByPk(req.params.id);
    if (!termDeposit) {
      return res.status(404).json({ 
        success: false,
        message: 'Term Deposit not found' 
      });
    }
    res.status(200).json({
      success: true,
      data: termDeposit
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get all term deposits
export const getAllTermDeposits = async (req, res) => {
  try {
    const termDeposits = await TermDeposit.findAll();
    res.status(200).json({
      success: true,
      data: termDeposits,
      count: termDeposits.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error fetching term deposits',
      error: error.message 
    });
  }
};

// Update a term deposit by ID
export const updateTermDeposit = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const termDeposit = await TermDeposit.findByPk(req.params.id, { transaction });
    if (!termDeposit) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'Term Deposit not found' 
      });
    }

    // Update only allowed fields
    const allowedFields = [
      'ROLLOVER_OPT_CD',
      'ROLLOVER_TYPE',
      'PRIMARY_OFFICER',
      'PRIMARY_OFFICER_ID',
      'SECONDARY_OFFICER_ID',
      'OPENING_RSN_ID',
      'MKT_CAMPAIGN_REF',
      'AUTO_CLOSE_ON_EXPIRY_FG',
      'ALLOW_MULTIPLE_FD',
      'STATUS',
      'VERSION_NO'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Handle versioning
    if (updateData.VERSION_NO) {
      updateData.VERSION_NO = parseInt(termDeposit.VERSION_NO) + 1;
    }

    await termDeposit.update(updateData, { transaction });

    // Create audit trail for the update
    await createAuditTrail({
      userId: req.user?.id || 'system',
      eventType: 'TERM_DEPOSIT_UPDATE',
      action: 'Update Term Deposit',
      oldValue: termDeposit.toJSON(),
      newValue: { ...termDeposit.toJSON(), ...updateData },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      accountNo: termDeposit.ACCT_NO,
    }, { transaction });

    await transaction.commit();
    
    const updatedTermDeposit = await TermDeposit.findByPk(req.params.id);
    
    res.status(200).json({
      success: true,
      message: 'Term Deposit updated successfully',
      data: updatedTermDeposit
    });
    
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Delete a term deposit by ID
export const deleteTermDeposit = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const termDeposit = await TermDeposit.findByPk(req.params.id, { transaction });
    if (!termDeposit) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'Term Deposit not found' 
      });
    }

    // Check if term deposit can be deleted
    if (!['PENDING', 'CLOSED'].includes(termDeposit.STATUS)) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Cannot delete active or matured term deposit' 
      });
    }

    // Create audit trail before deletion
    await createAuditTrail({
      userId: req.user?.id || 'system',
      eventType: 'TERM_DEPOSIT_DELETION',
      action: 'Delete Term Deposit',
      oldValue: termDeposit.toJSON(),
      newValue: null,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      accountNo: termDeposit.ACCT_NO,
    }, { transaction });

    await termDeposit.destroy({ transaction });
    await transaction.commit();
    
    res.status(200).json({
      success: true,
      message: 'Term Deposit deleted successfully'
    });
    
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get term deposits by status
export const getTermDepositsByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const validStatuses = ['ACTIVE', 'MATURED', 'CLOSED', 'PENDING'];
    
    if (!validStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const termDeposits = await TermDeposit.findAll({
      where: { STATUS: status.toUpperCase() }
    });
    
    res.status(200).json({
      success: true,
      data: termDeposits,
      count: termDeposits.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching term deposits by status',
      error: error.message
    });
  }
};

// Get term deposits by customer
export const getTermDepositsByCustomer = async (req, res) => {
  try {
    const { custId } = req.params;
    
    const termDeposits = await TermDeposit.findAll({
      where: { CUST_ID: custId },
      order: [['CREATED_AT', 'DESC']]
    });
    
    res.status(200).json({
      success: true,
      data: termDeposits,
      count: termDeposits.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching term deposits by customer',
      error: error.message
    });
  }
};