// services/cardTransactionService.js
import { sequelize } from '../../config/db.js';
import DebitCard from '../models/DebitCard.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Account from '../models/Accounts.js';
import Ledger from '../models/Ledger.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import Charge from '../models/Charge.js';
import { recordTransaction } from './transactionHistory.js';
import { CARD_TX_TYPES } from '../constants/transactionTypes.js';
import binService from './binService.js';
import { getModel } from '../models/index.js';

/**
 * Fetch the card purchase charge configuration from the Charges table.
 * @returns {Promise<{creditGlAccount: string, chargeCode: string, chargeName: string}>}
 */
async function getCardPurchaseCharge() {
  const charge = await Charge.findOne({
    where: { CHRG_TY: 'CARD_PURCHASE', REC_ST: 'A' }
  });
  if (!charge) {
    throw new Error('Card purchase charge not configured. Please set up a charge with type CARD_PURCHASE and status A.');
  }

  let glAccount = charge.dataValues?.charge_g_l_account_no || charge.charge_g_l_account_no;
  if (!glAccount || glAccount === 'NONE') {
    glAccount = charge.INCOME_GL_ACCT_NO;
  }
  if (!glAccount || glAccount === 'NONE') {
    throw new Error('Income GL account not set for card purchase charge');
  }

  return {
    creditGlAccount: glAccount,
    chargeCode: charge.CHRG_CD,
    chargeName: charge.CHRG_NM
  };
}

/**
 * Generate a unique journal ID: JRNL-CARD-{timestamp}-{random}
 */
function generateJournalId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000000000);
  return `JRNL-CARD-${timestamp}-${random}`;
}

/**
 * Generate a unique string transaction reference: GL-{timestamp}{random}
 */
function generateTransactionId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return `GL-${timestamp}${random}`;
}

/**
 * Generate a numeric TransactionId (bigint) for gl_account_transactions
 */
function generateNumericTransactionId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000000);
  return parseInt(`${timestamp}${random}`);
}

/**
 * Process a card transaction with BIN validation
 * @param {string} cardPan - Full card PAN
 * @param {number} amount - Transaction amount
 * @param {Object} merchantInfo - Merchant information
 * @param {string} txRef - Transaction reference
 * @param {string} createdBy - User who created the transaction
 * @returns {Promise<Object>} - Transaction result
 */
export async function processCardTransaction(cardPan, amount, merchantInfo, txRef, createdBy = 'CARD_SYSTEM') {
  const dbTransaction = await sequelize.transaction();
  try {
    // 1. Find card with linked CustomerAccount
    const card = await DebitCard.findOne({
      where: { card_pan: cardPan },
      include: [{ model: CustomerAccount, as: 'customerAccount' }],
      transaction: dbTransaction,
      lock: true
    });
    if (!card) throw new Error('Card not found');
    if (!card.customerAccount) throw new Error('Linked customer account not found');

    // ✅ Validate BIN before transaction
    const binValidation = await binService.validateCardWithBIN(cardPan, amount, dbTransaction);
    if (!binValidation.valid) {
      throw new Error(`BIN validation failed: ${binValidation.error}`);
    }

    // Log BIN validation result
    console.log(`✅ BIN Validation: ${binValidation.bank_name} - ${binValidation.card_scheme} (${binValidation.card_type})`);
    console.log(`✅ BIN Details:`, {
      bin: binValidation.bin,
      bank: binValidation.bank_name,
      scheme: binValidation.card_scheme,
      type: binValidation.card_type,
      isPrepaid: binValidation.is_prepaid
    });

    // 2. Validate card
    const validity = card.isValidForTransaction(amount);
    if (!validity.valid) throw new Error(validity.reason);

    const customerAccount = card.customerAccount;

    // 3. Find the operational Account (intermediate layer)
    const operationalAccount = await Account.findOne({
      where: { account_number: customerAccount.account_number },
      transaction: dbTransaction,
      lock: true
    });
    if (!operationalAccount) throw new Error('Operational account not found');
    if (operationalAccount.rec_st !== 'ACTIVE') throw new Error('Operational account not active');
    if (!operationalAccount.dr_allowed) throw new Error('Debits not allowed on operational account');
    if (parseFloat(operationalAccount.available_balance) < amount) {
      throw new Error('Insufficient available balance');
    }

    // 4. Compute & update operational Account balances
    const newOpAvailable = parseFloat(operationalAccount.available_balance) - amount;
    const newOpLedger = parseFloat(operationalAccount.ledger_balance) - amount;
    const newOpCleared = parseFloat(operationalAccount.cleared_balance) - amount;

    await operationalAccount.update({
      available_balance: newOpAvailable,
      ledger_balance: newOpLedger,
      cleared_balance: newOpCleared,
      last_activity_date: new Date()
    }, { transaction: dbTransaction });

    // 5. Update card daily spend
    const today = new Date().toISOString().slice(0, 10);
    await card.update({
      daily_spent_today: parseFloat(card.daily_spent_today || 0) + amount,
      last_reset_date: today
    }, { transaction: dbTransaction });

    // ==================== GENERAL LEDGER (ledgers table) UPDATES ====================
    // 6. Fetch Ledger accounts (debit side = operational account's GL number)
    const debitLedger = await Ledger.findOne({
      where: { GL_ACCT_NO: operationalAccount.account_number },
      transaction: dbTransaction,
      lock: true
    });
    if (!debitLedger) {
      throw new Error(`Ledger account not found for GL_ACCT_NO: ${operationalAccount.account_number}`);
    }

    // 7. Get credit GL account from charge configuration
    const { creditGlAccount: creditGlAccountNo } = await getCardPurchaseCharge();

    const creditLedger = await Ledger.findOne({
      where: { GL_ACCT_NO: creditGlAccountNo },
      transaction: dbTransaction,
      lock: true
    });
    if (!creditLedger) {
      throw new Error(`Credit Ledger account not found: ${creditGlAccountNo}`);
    }

    // 8. Compute new Ledger balances (debit account decreases, credit account increases)
    const newDebitLedgerBalance = parseFloat(debitLedger.LEDGER_BALANCE) - amount;
    const newDebitAvailableBalance = parseFloat(debitLedger.AVAILABLE_BALANCE) - amount;
    const newDebitCurrentBalance = parseFloat(debitLedger.CURRENT_BALANCE) - amount;

    const newCreditLedgerBalance = parseFloat(creditLedger.LEDGER_BALANCE) + amount;
    const newCreditAvailableBalance = parseFloat(creditLedger.AVAILABLE_BALANCE) + amount;
    const newCreditCurrentBalance = parseFloat(creditLedger.CURRENT_BALANCE) + amount;

    // 9. Update Ledger balances
    await debitLedger.update({
      LEDGER_BALANCE: newDebitLedgerBalance,
      AVAILABLE_BALANCE: newDebitAvailableBalance,
      CURRENT_BALANCE: newDebitCurrentBalance,
      updatedAt: new Date()
    }, { transaction: dbTransaction });

    await creditLedger.update({
      LEDGER_BALANCE: newCreditLedgerBalance,
      AVAILABLE_BALANCE: newCreditAvailableBalance,
      CURRENT_BALANCE: newCreditCurrentBalance,
      updatedAt: new Date()
    }, { transaction: dbTransaction });

    // ==================== GL JOURNAL ENTRY ====================
    const journalId = generateJournalId();
    const glTransactionId = generateTransactionId();
    const numericTransactionId = generateNumericTransactionId();

    // ✅ Add BIN info to GL transaction
    const GLTransactionModel = getModel('GLAccountTransaction');
    await GLTransactionModel.create(
      {
        JOURNAL_ID: journalId,
        TRANSACTION_ID: glTransactionId,
        DR_ACCT_NO: operationalAccount.account_number,
        CR_ACCT_NO: creditGlAccountNo,
        AMOUNT: amount,
        NARRATION: `Card purchase at ${merchantInfo.name || 'Merchant'} - Card ${card.card_last4} | BIN: ${binValidation.bin} | Bank: ${binValidation.bank_name} | Ref: ${txRef}`,
        CREATED_BY: createdBy,
        TRANSACTION_TYPE: 'CARD_PURCHASE',
        CURRENCY_CODE: operationalAccount.currency || 'NGN',
        STATUS: 'POSTED',
        TransactionId: numericTransactionId,
        metadata: {
          bin: binValidation.bin,
          bank_name: binValidation.bank_name,
          bank_code: binValidation.mapping?.bank_code || null,
          card_scheme: binValidation.card_scheme,
          card_type: binValidation.card_type,
          is_prepaid: binValidation.is_prepaid,
          merchant: merchantInfo,
          transaction_reference: txRef
        }
      },
      {
        transaction: dbTransaction,
        skipHooks: true   // Prevents the model's afterCreate hook from double-updating Ledger
      }
    );

    // ==================== CUSTOMER TRANSACTION HISTORY ====================
    // This will:
    // - Insert a record into the "transactions" table
    // - Update CustomerAccount balances (ledger_balance, available_balance, cleared_balance)
    await recordTransaction({
      accountNumber: customerAccount.account_number,
      accountId: String(customerAccount.id),
      buId: operationalAccount.branch || 1,
      customerId: String(operationalAccount.customer_id),
      accountName: operationalAccount.acct_nm || customerAccount.account_name,
      amount: amount,
      direction: 'DEBIT',
      transactionType: 'CARD_PURCHASE',
      reference: txRef,
      description: `Card purchase at ${merchantInfo.name || 'Merchant'} - Card ${card.card_last4} (${binValidation.bank_name})`,
      createdBy: createdBy,
      currency: operationalAccount.currency || 'NGN',
      metadata: {
        card_id: card.id,
        card_pan_last4: card.card_last4,
        bin: binValidation.bin,
        bank_name: binValidation.bank_name,
        bank_code: binValidation.mapping?.bank_code || null,
        card_scheme: binValidation.card_scheme,
        card_type: binValidation.card_type,
        is_prepaid: binValidation.is_prepaid,
        merchant: merchantInfo,
        transaction_ref: txRef,
        operational_balance_after: newOpAvailable,
        gl_journal_id: journalId
      },
      existingTransaction: dbTransaction
    });

    // Commit everything
    await dbTransaction.commit();
    return {
      success: true,
      newBalance: newOpAvailable,
      reference: txRef,
      cardLast4: card.card_last4,
      glJournalId: journalId,
      binInfo: {
        bin: binValidation.bin,
        bank: binValidation.bank_name,
        bankCode: binValidation.mapping?.bank_code || null,
        scheme: binValidation.card_scheme,
        type: binValidation.card_type,
        isPrepaid: binValidation.is_prepaid
      },
      merchant: merchantInfo,
      amount: amount,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    await dbTransaction.rollback();
    console.error('❌ Card transaction failed:', error.message);
    return { 
      success: false, 
      error: error.message,
      reference: txRef,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Process a card transaction with additional BIN validation for prepaid cards
 * @param {string} cardPan - Full card PAN
 * @param {number} amount - Transaction amount
 * @param {Object} merchantInfo - Merchant information
 * @param {string} txRef - Transaction reference
 * @param {string} createdBy - User who created the transaction
 * @returns {Promise<Object>} - Transaction result
 */
export async function processPrepaidCardTransaction(cardPan, amount, merchantInfo, txRef, createdBy = 'CARD_SYSTEM') {
  const dbTransaction = await sequelize.transaction();
  try {
    // 1. Find card with linked CustomerAccount
    const card = await DebitCard.findOne({
      where: { card_pan: cardPan },
      include: [{ model: CustomerAccount, as: 'customerAccount' }],
      transaction: dbTransaction,
      lock: true
    });
    if (!card) throw new Error('Card not found');
    if (!card.customerAccount) throw new Error('Linked customer account not found');

    // ✅ Validate BIN before transaction
    const binValidation = await binService.validateCardWithBIN(cardPan, amount, dbTransaction);
    if (!binValidation.valid) {
      throw new Error(`BIN validation failed: ${binValidation.error}`);
    }

    // ✅ Check if card is prepaid
    if (!binValidation.is_prepaid) {
      throw new Error('This card is not a prepaid card. Use standard transaction processing.');
    }

    // Log BIN validation result
    console.log(`✅ Prepaid BIN Validation: ${binValidation.bank_name} - ${binValidation.card_scheme} (PREPAID)`);
    console.log(`✅ Prepaid BIN Details:`, {
      bin: binValidation.bin,
      bank: binValidation.bank_name,
      scheme: binValidation.card_scheme,
      type: binValidation.card_type,
      isPrepaid: binValidation.is_prepaid
    });

    // 2. Validate card
    const validity = card.isValidForTransaction(amount);
    if (!validity.valid) throw new Error(validity.reason);

    const customerAccount = card.customerAccount;

    // 3. Find the operational Account (intermediate layer)
    const operationalAccount = await Account.findOne({
      where: { account_number: customerAccount.account_number },
      transaction: dbTransaction,
      lock: true
    });
    if (!operationalAccount) throw new Error('Operational account not found');
    if (operationalAccount.rec_st !== 'ACTIVE') throw new Error('Operational account not active');
    if (!operationalAccount.dr_allowed) throw new Error('Debits not allowed on operational account');
    if (parseFloat(operationalAccount.available_balance) < amount) {
      throw new Error('Insufficient available balance');
    }

    // 4. Compute & update operational Account balances
    const newOpAvailable = parseFloat(operationalAccount.available_balance) - amount;
    const newOpLedger = parseFloat(operationalAccount.ledger_balance) - amount;
    const newOpCleared = parseFloat(operationalAccount.cleared_balance) - amount;

    await operationalAccount.update({
      available_balance: newOpAvailable,
      ledger_balance: newOpLedger,
      cleared_balance: newOpCleared,
      last_activity_date: new Date()
    }, { transaction: dbTransaction });

    // 5. Update card daily spend
    const today = new Date().toISOString().slice(0, 10);
    await card.update({
      daily_spent_today: parseFloat(card.daily_spent_today || 0) + amount,
      last_reset_date: today
    }, { transaction: dbTransaction });

    // ==================== GENERAL LEDGER (ledgers table) UPDATES ====================
    const debitLedger = await Ledger.findOne({
      where: { GL_ACCT_NO: operationalAccount.account_number },
      transaction: dbTransaction,
      lock: true
    });
    if (!debitLedger) {
      throw new Error(`Ledger account not found for GL_ACCT_NO: ${operationalAccount.account_number}`);
    }

    const { creditGlAccount: creditGlAccountNo } = await getCardPurchaseCharge();

    const creditLedger = await Ledger.findOne({
      where: { GL_ACCT_NO: creditGlAccountNo },
      transaction: dbTransaction,
      lock: true
    });
    if (!creditLedger) {
      throw new Error(`Credit Ledger account not found: ${creditGlAccountNo}`);
    }

    const newDebitLedgerBalance = parseFloat(debitLedger.LEDGER_BALANCE) - amount;
    const newDebitAvailableBalance = parseFloat(debitLedger.AVAILABLE_BALANCE) - amount;
    const newDebitCurrentBalance = parseFloat(debitLedger.CURRENT_BALANCE) - amount;

    const newCreditLedgerBalance = parseFloat(creditLedger.LEDGER_BALANCE) + amount;
    const newCreditAvailableBalance = parseFloat(creditLedger.AVAILABLE_BALANCE) + amount;
    const newCreditCurrentBalance = parseFloat(creditLedger.CURRENT_BALANCE) + amount;

    await debitLedger.update({
      LEDGER_BALANCE: newDebitLedgerBalance,
      AVAILABLE_BALANCE: newDebitAvailableBalance,
      CURRENT_BALANCE: newDebitCurrentBalance,
      updatedAt: new Date()
    }, { transaction: dbTransaction });

    await creditLedger.update({
      LEDGER_BALANCE: newCreditLedgerBalance,
      AVAILABLE_BALANCE: newCreditAvailableBalance,
      CURRENT_BALANCE: newCreditCurrentBalance,
      updatedAt: new Date()
    }, { transaction: dbTransaction });

    // ==================== GL JOURNAL ENTRY ====================
    const journalId = generateJournalId();
    const glTransactionId = generateTransactionId();
    const numericTransactionId = generateNumericTransactionId();

    const GLTransactionModel = getModel('GLAccountTransaction');
    await GLTransactionModel.create(
      {
        JOURNAL_ID: journalId,
        TRANSACTION_ID: glTransactionId,
        DR_ACCT_NO: operationalAccount.account_number,
        CR_ACCT_NO: creditGlAccountNo,
        AMOUNT: amount,
        NARRATION: `Prepaid card purchase at ${merchantInfo.name || 'Merchant'} - Card ${card.card_last4} | BIN: ${binValidation.bin} | Bank: ${binValidation.bank_name} | Ref: ${txRef}`,
        CREATED_BY: createdBy,
        TRANSACTION_TYPE: 'PREPAID_CARD_PURCHASE',
        CURRENCY_CODE: operationalAccount.currency || 'NGN',
        STATUS: 'POSTED',
        TransactionId: numericTransactionId,
        metadata: {
          bin: binValidation.bin,
          bank_name: binValidation.bank_name,
          bank_code: binValidation.mapping?.bank_code || null,
          card_scheme: binValidation.card_scheme,
          card_type: 'PREPAID',
          is_prepaid: true,
          merchant: merchantInfo,
          transaction_reference: txRef,
          prepaid_bin: binValidation.mapping?.prepaid_bin || null
        }
      },
      {
        transaction: dbTransaction,
        skipHooks: true
      }
    );

    // ==================== CUSTOMER TRANSACTION HISTORY ====================
    await recordTransaction({
      accountNumber: customerAccount.account_number,
      accountId: String(customerAccount.id),
      buId: operationalAccount.branch || 1,
      customerId: String(operationalAccount.customer_id),
      accountName: operationalAccount.acct_nm || customerAccount.account_name,
      amount: amount,
      direction: 'DEBIT',
      transactionType: 'PREPAID_CARD_PURCHASE',
      reference: txRef,
      description: `Prepaid card purchase at ${merchantInfo.name || 'Merchant'} - Card ${card.card_last4} (${binValidation.bank_name})`,
      createdBy: createdBy,
      currency: operationalAccount.currency || 'NGN',
      metadata: {
        card_id: card.id,
        card_pan_last4: card.card_last4,
        bin: binValidation.bin,
        bank_name: binValidation.bank_name,
        bank_code: binValidation.mapping?.bank_code || null,
        card_scheme: binValidation.card_scheme,
        card_type: 'PREPAID',
        is_prepaid: true,
        prepaid_bin: binValidation.mapping?.prepaid_bin || null,
        merchant: merchantInfo,
        transaction_ref: txRef,
        operational_balance_after: newOpAvailable,
        gl_journal_id: journalId
      },
      existingTransaction: dbTransaction
    });

    await dbTransaction.commit();
    return {
      success: true,
      newBalance: newOpAvailable,
      reference: txRef,
      cardLast4: card.card_last4,
      glJournalId: journalId,
      binInfo: {
        bin: binValidation.bin,
        bank: binValidation.bank_name,
        bankCode: binValidation.mapping?.bank_code || null,
        scheme: binValidation.card_scheme,
        type: 'PREPAID',
        isPrepaid: true,
        prepaidBin: binValidation.mapping?.prepaid_bin || null
      },
      merchant: merchantInfo,
      amount: amount,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    await dbTransaction.rollback();
    console.error('❌ Prepaid card transaction failed:', error.message);
    return { 
      success: false, 
      error: error.message,
      reference: txRef,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get BIN information for a card without processing a transaction
 * @param {string} cardPan - Full card PAN
 * @returns {Promise<Object>} - BIN information
 */
export async function getCardBINInfo(cardPan) {
  try {
    const binValidation = await binService.validateCardWithBIN(cardPan);
    if (!binValidation.valid) {
      return {
        success: false,
        error: binValidation.error
      };
    }

    return {
      success: true,
      binInfo: {
        bin: binValidation.bin,
        bank: binValidation.bank_name,
        bankCode: binValidation.mapping?.bank_code || null,
        scheme: binValidation.card_scheme,
        type: binValidation.card_type,
        isPrepaid: binValidation.is_prepaid,
        country: binValidation.mapping?.country || 'NG',
        currency: binValidation.mapping?.currency || 'NGN'
      }
    };
  } catch (error) {
    console.error('❌ Error getting card BIN info:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export all functions
export default {
  processCardTransaction,
  processPrepaidCardTransaction,
  getCardBINInfo,
  getCardPurchaseCharge
};