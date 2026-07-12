// controllers/DebitCardController.js
import { processCardTransaction } from '../Services/CardTransactionService.js';
import DebitCard from '../models/DebitCard.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Charge from '../models/Charge.js';
import { generateCardNumber } from '../utils/cardGenerator.js';
import crypto from 'crypto';
import { logAuditTrail } from '../utils/AuditLogger.js';
import sequelize from '../../config/db.js';
import Transaction from '../models/Transaction.js';
import { getModel } from '../models/index.js';
import { Op } from 'sequelize';

// ==================== HELPERS ====================
const getUserId = (req) => req.user?.username || req.user?.id || 'system';
const getClientIp = (req) => req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '127.0.0.1';

async function getCardIssuanceCharge() {
  const charge = await Charge.findOne({
    where: { CHRG_TY: 'CARD_ISSUANCE', REC_ST: 'A' }
  });
  if (!charge) {
    throw new Error('Card issuance fee not configured. Please set up a charge with type CARD_ISSUANCE and status A.');
  }
  const amount = parseFloat(charge.CHRG_AMT);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Invalid card issuance fee amount in charge configuration');
  }
  
  let glAccount = charge.dataValues?.charge_g_l_account_no || charge.charge_g_l_account_no;
  if (!glAccount || glAccount === 'NONE') {
    glAccount = charge.INCOME_GL_ACCT_NO;
  }
  if (!glAccount || glAccount === 'NONE') {
    throw new Error('Income GL account not set for card issuance charge');
  }
  
  return {
    amount,
    creditGlAccount: glAccount,
    chargeCode: charge.CHRG_CD,
    chargeName: charge.CHRG_NM
  };
}

// POST /api/cards/issue
// POST /api/cards/issue – with reissuance logic for lost/stolen cards
export const issueCard = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  let card = null;
  let feeDetails = null;
  let existingCard = null;
  let isReissuance = false;

  const organizationName = req.body.organizationName || req.user?.organizationName;
  const branchName = req.body.branchName || req.user?.branchName;
  if (!organizationName || !branchName) {
    return res.status(400).json({
      success: false,
      error: 'Organization name and branch name are required (in body or user context)'
    });
  }

  const dbTransaction = await sequelize.transaction();

  try {
    let { customerId, accountNumber, accountId, cardType } = req.body;
    if (!accountNumber && accountId) accountNumber = accountId;
    if (!accountNumber) throw new Error('Account number is required');

    // 1. Verify customer account
    const customerAccount = await CustomerAccount.findOne({
      where: { 
        account_number: accountNumber, 
        CUST_ID: customerId,
        status: 'ACTIVE' 
      },
      transaction: dbTransaction,
      lock: true
    });
    if (!customerAccount) throw new Error('Customer account not found or not active');

    // 2. Check existing cards for this customer
    const existingCards = await DebitCard.findAll({
      where: { customerId: customerId },
      transaction: dbTransaction,
      lock: true
    });

    if (existingCards.length > 0) {
      // Find active cards (ACTIVE or ISSUED)
      const activeCard = existingCards.find(card => 
        card.cardStatus === 'ACTIVE' || card.cardStatus === 'ISSUED'
      );
      if (activeCard) {
        throw new Error('Customer already has an active card. Cancel or replace it first.');
      }

      // Find lost/stolen cards (BLOCKED with reason LOST or STOLEN)
      const lostStolenCard = existingCards.find(card => 
        card.cardStatus === 'BLOCKED' && 
        (card.blockReason === 'LOST' || card.blockReason === 'STOLEN')
      );
      if (lostStolenCard) {
        isReissuance = true;
        existingCard = lostStolenCard;
        console.log(`📝 Reissuing card for customer ${customerId}, replacing lost/stolen card ${lostStolenCard.id}`);
        // Optionally mark old card as REPLACED (or keep as BLOCKED)
        await lostStolenCard.update({ 
          blockReason: `REPLACED (was ${lostStolenCard.blockReason})`,
          cardStatus: 'CANCELLED'   // or keep BLOCKED, but mark as replaced
        }, { transaction: dbTransaction });
      }
    }

    // 3. Proceed with issuance (fee, PAN generation, etc.)
    feeDetails = await getCardIssuanceCharge();
    const feeAmount = feeDetails.amount;

    const currentAvailable = parseFloat(customerAccount.available_balance);
    if (currentAvailable < feeAmount) {
      throw new Error(`Insufficient balance. Fee: ${feeAmount}, Available: ${currentAvailable}`);
    }

    const pan = await generateCardNumber('506099', 16, dbTransaction);
    const bin = pan.slice(0, 6);
    const expiryMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const expiryYear = (new Date().getFullYear() + 3).toString();
    const cvv = Math.floor(100 + Math.random() * 900).toString();
    const hashedCVV = crypto.createHash('sha256').update(cvv).digest('hex');

    // Fetch BIN metadata
    const BinInfo = getModel('BinInfo');
    let binInfo = { bank_name: 'Unknown', country: 'Unknown', network: 'Unknown', card_type: 'Unknown' };
    if (BinInfo) {
      const binRecord = await BinInfo.findOne({ 
        where: { bin },
        transaction: dbTransaction 
      });
      if (binRecord) {
        binInfo = {
          bank_name: binRecord.bank_name || 'Unknown',
          country: binRecord.country || 'Unknown',
          network: binRecord.network || 'Unknown',
          card_type: binRecord.card_type || 'Unknown'
        };
      }
    }

    // Create new card
    card = await DebitCard.create({
      customerId: customerId,
      accountId: customerAccount.id,
      cardPan: pan,
      cardHolderName: customerAccount.account_name || 'Card Holder',
      expiryMonth: expiryMonth,
      expiryYear: expiryYear,
      cvvHash: hashedCVV,
      cardType: cardType || 'VIRTUAL',
      cardStatus: 'ISSUED',
      issuedBy: userId,
      issuedAt: new Date(),
      cardLast4: pan.slice(-4),
      cardBin: bin,
      binBankName: binInfo.bank_name,
      binCountry: binInfo.country,
      binNetwork: binInfo.network,
      binCardType: binInfo.card_type,
      // If reissuing, store the replaced card ID (optional – add column if needed)
      // replacesCardId: existingCard ? existingCard.id : null
    }, { transaction: dbTransaction });

    // Deduct fee (same as before)
    const newAvailable = currentAvailable - feeAmount;
    const newCurrent = parseFloat(customerAccount.current_balance) - feeAmount;
    const newLedger = parseFloat(customerAccount.ledger_balance) - feeAmount;
    await customerAccount.update({
      available_balance: newAvailable,
      current_balance: newCurrent,
      ledger_balance: newLedger,
      last_transaction_date: new Date()
    }, { transaction: dbTransaction });

    // Transaction record
    const getNextTransactionId = async () => {
      const lastTx = await Transaction.findOne({
        order: [['TRANSACTION_IDENTIFIER', 'DESC']],
        attributes: ['TRANSACTION_IDENTIFIER'],
        transaction: dbTransaction
      });
      return (lastTx?.TRANSACTION_IDENTIFIER || 0) + 1;
    };
    const txIdentifier = await getNextTransactionId();
    const journalId = `JRN_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const transactionId = `TXN_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    await Transaction.create({
      ACCT_NO: customerAccount.account_number,
      ACCT_ID: String(customerAccount.id),
      BU_ID: customerAccount.bu_id || 1,
      CUST_ID: String(customerId),
      ACCT_NM: customerAccount.account_name,
      AMOUNT: feeAmount,
      transactionDirection: 'DEBIT',
      TRANSACTION_TYPE: 'FEE_CHARGE',
      TRANSACTION_IDENTIFIER: txIdentifier,
      EVENT_ID: txIdentifier,
      TRAN_JOURNAL_ID: journalId,
      TRANSACTION_ID: transactionId,
      REFERENCE: `CARD_FEE_${card.id}_${Date.now()}`,
      description: `Card issuance fee (${feeDetails.chargeCode})`,
      status: 'COMPLETED',
      currency: customerAccount.currency_code || 'NGN',
      createdBy: userId,
      metadata: {
        card_id: card.id,
        card_last4: card.cardLast4,
        charge_code: feeDetails.chargeCode,
        credit_gl_account: feeDetails.creditGlAccount,
        ...(isReissuance && { replaced_card_id: existingCard.id })
      }
    }, { transaction: dbTransaction });

    // GL Posting (unchanged)
    const clearingGlAccount = process.env.FEE_CLEARING_GL_ACCOUNT;
    if (!clearingGlAccount) {
      throw new Error('Fee clearing GL account not configured. Set FEE_CLEARING_GL_ACCOUNT in .env');
    }
    const glJournalId = `GL_JRN_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const glTransactionId = `GL_TXN_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const glTxId = Math.floor(Date.now() * 1000) + Math.floor(Math.random() * 1000);

    await sequelize.query(
      `INSERT INTO gl_account_transactions (
        JOURNAL_ID, TRANSACTION_ID, DR_ACCT_NO, CR_ACCT_NO, AMOUNT, NARRATION,
        CREATED_BY, TRANSACTION_TYPE, CURRENCY_CODE, STATUS, TransactionId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      {
        replacements: [
          glJournalId,
          glTransactionId,
          clearingGlAccount,
          feeDetails.creditGlAccount,
          feeAmount,
          `Card issuance fee for card ending ${card.cardLast4}`,
          userId,
          'Credit',
          'NGN',
          'POSTED',
          glTxId
        ],
        transaction: dbTransaction
      }
    );

    await dbTransaction.commit();

    // Audit log
    await logAuditTrail(
      'DEBIT_CARD',
      card.id.toString(),
      userId,
      'ISSUE',
      null,
      {
        customerId,
        accountNumber,
        cardType,
        maskedPan: `**** **** **** ${card.cardLast4}`,
        status: card.cardStatus,
        cardId: card.id,
        feeAmount,
        creditGlAccount: feeDetails.creditGlAccount,
        debitGlAccount: clearingGlAccount,
        glPosted: true,
        glJournalId,
        isReissuance,
        ...(isReissuance && { replacedCardId: existingCard.id })
      },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );

    return res.status(201).json({
      success: true,
      data: {
        cardId: card.id,
        maskedPan: `**** **** **** ${card.cardLast4}`,
        expiry: `${expiryMonth}/${expiryYear}`,
        cardType: card.cardType,
        status: card.cardStatus,
        accountNumber: customerAccount.account_number,
        feeCharged: feeAmount,
        bankName: binInfo.bank_name,
        country: binInfo.country,
        network: binInfo.network,
        message: isReissuance 
          ? `Replacement card issued. Old card (${existingCard.cardLast4}) has been cancelled. Fee of ${feeAmount} deducted.`
          : `Card issued. A fee of ${feeAmount} was deducted and GL entry created. Please set a PIN before first use.`
      }
    });

  } catch (error) {
    await dbTransaction.rollback();
    await logAuditTrail(
      'DEBIT_CARD',
      card?.id?.toString() || 'unknown',
      userId,
      'ISSUE_FAILED',
      req.body,
      { error: error.message, feeAttempted: feeDetails?.amount, glAccount: feeDetails?.creditGlAccount },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );
    return res.status(400).json({ success: false, error: error.message });
  }
};

// POST /api/cards/transaction
// POST /api/cards/transaction
export const cardPurchase = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { cardPan, amount, merchantInfo, txRef } = req.body;

  try {
    // Validate input
    if (!cardPan) {
      return res.status(400).json({ success: false, error: 'cardPan is required' });
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amount is required' });
    }
    const txAmount = parseFloat(amount);

    // ✅ Find card using model attribute (camelCase)
    const card = await DebitCard.findOne({ where: { cardPan } });
    if (!card) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }

    // Validate card status & limits
    const validation = card.isValidForTransaction(txAmount);
    if (!validation.valid) {
      await logAuditTrail(
        'DEBIT_CARD',
        card.cardLast4,
        userId,
        'PURCHASE_DECLINED',
        { amount, merchantInfo, txRef },
        { error: validation.reason },
        ipAddress,
        'CARD_TRANSACTION',
        { branch: req.user?.branch || 1 }
      );
      return res.status(400).json({ success: false, error: validation.reason });
    }

    const dbTransaction = await sequelize.transaction();

    try {
      // Update card daily spent
      const today = new Date().toISOString().slice(0, 10);
      if (card.lastResetDate !== today) {
        card.dailySpentToday = 0;
        card.lastResetDate = today;
      }
      card.dailySpentToday = (card.dailySpentToday || 0) + txAmount;
      await card.save({ transaction: dbTransaction });

      // Find the associated customer account
      const customerAccount = await CustomerAccount.findOne({
        where: { id: card.accountId },
        transaction: dbTransaction,
        lock: true
      });
      if (!customerAccount) {
        throw new Error('Associated account not found');
      }

      // Check sufficient balance
      const currentAvailable = parseFloat(customerAccount.available_balance);
      if (currentAvailable < txAmount) {
        throw new Error('Insufficient balance');
      }

      // Deduct balance
      const newAvailable = currentAvailable - txAmount;
      const newCurrent = parseFloat(customerAccount.current_balance) - txAmount;
      const newLedger = parseFloat(customerAccount.ledger_balance) - txAmount;
      await customerAccount.update({
        available_balance: newAvailable,
        current_balance: newCurrent,
        ledger_balance: newLedger,
        last_transaction_date: new Date()
      }, { transaction: dbTransaction });

      // --- Generate required transaction identifiers (same as in issueCard) ---
      const getNextTransactionId = async () => {
        const lastTx = await Transaction.findOne({
          order: [['TRANSACTION_IDENTIFIER', 'DESC']],
          attributes: ['TRANSACTION_IDENTIFIER'],
          transaction: dbTransaction
        });
        return (lastTx?.TRANSACTION_IDENTIFIER || 0) + 1;
      };
      const txIdentifier = await getNextTransactionId();
      const journalId = `JRN_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const transactionId = `TXN_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      // Create transaction record
      const transactionRecord = await Transaction.create({
        ACCT_NO: customerAccount.account_number,
        ACCT_ID: String(customerAccount.id),
        BU_ID: customerAccount.bu_id || 1,                         // ✅ required field
        CUST_ID: String(customerAccount.CUST_ID),                  // ✅ use the customer ID from account
        ACCT_NM: customerAccount.account_name,
        AMOUNT: txAmount,
        transactionDirection: 'DEBIT',
        TRANSACTION_TYPE: 'CARD_PURCHASE',
        TRANSACTION_IDENTIFIER: txIdentifier,                     // ✅ required
        EVENT_ID: txIdentifier,                                   // ✅ required (usually same as identifier)
        TRAN_JOURNAL_ID: journalId,                               // ✅ required
        TRANSACTION_ID: transactionId,
        REFERENCE: txRef || `CARD_TXN_${Date.now()}`,
        description: `Card purchase at ${merchantInfo?.name || 'Merchant'}`,
        status: 'COMPLETED',
        currency: customerAccount.currency || 'NGN',
        createdBy: userId,
        metadata: {
          card_last4: card.cardLast4,
          merchant_id: merchantInfo?.id,
          merchant_name: merchantInfo?.name,
          merchant_category: merchantInfo?.category,
          merchant_location: merchantInfo?.location
        }
      }, { transaction: dbTransaction });

      await dbTransaction.commit();

      // Success audit log
      await logAuditTrail(
        'DEBIT_CARD',
        card.cardLast4,
        userId,
        'PURCHASE',
        null,
        {
          amount: txAmount,
          merchant: merchantInfo?.name || 'Unknown',
          txRef,
          newBalance: newAvailable,
          cardLast4: card.cardLast4
        },
        ipAddress,
        'CARD_TRANSACTION',
        { branch: req.user?.branch || 1 }
      );

      return res.status(200).json({
        success: true,
        data: {
          transactionId: transactionRecord.id,
          amount: txAmount,
          newBalance: newAvailable,
          cardLast4: card.cardLast4,
          merchant: merchantInfo?.name,
          timestamp: new Date().toISOString()
        }
      });
    } catch (txError) {
      await dbTransaction.rollback();
      throw txError;
    }
  } catch (error) {
    console.error('Card purchase error:', error);
    await logAuditTrail(
      'DEBIT_CARD',
      cardPan?.slice(-4) || 'unknown',
      userId,
      'PURCHASE_ERROR',
      { amount, merchantInfo, txRef },
      { error: error.message },
      ipAddress,
      'CARD_TRANSACTION',
      { branch: req.user?.branch || 1 }
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/cards/customer/:customerId
// GET /api/debit-cards/cards/customer/:customerId
export const getCustomerCards = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { customerId } = req.params;

  try {
    // ✅ Use camelCase attribute names
    const cards = await DebitCard.findAll({
      where: { customerId: customerId },          // attribute name
      attributes: [
        'id', 
        'cardLast4', 
        'cardType', 
        'cardStatus', 
        'expiryMonth', 
        'expiryYear', 
        'dailyLimit', 
        'perTransactionLimit'
      ]
    });

    await logAuditTrail(
      'DEBIT_CARD',
      customerId,
      userId,
      'VIEW_CARDS',
      null,
      { count: cards.length },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );

    return res.status(200).json({ success: true, data: cards });
  } catch (error) {
    await logAuditTrail(
      'DEBIT_CARD',
      customerId,
      userId,
      'VIEW_CARDS_FAILED',
      null,
      { error: error.message },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/cards/:cardId/daily-limit
// PUT /api/cards/daily-limit (change route accordingly)
export const setDailyLimit = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { accountNumber, last4, dailyLimit } = req.body;  // ✅ changed: accept accountNumber + last4

  try {
    // Validate required fields
    if (!accountNumber) {
      return res.status(400).json({ success: false, error: 'Account number is required' });
    }
    if (!last4 || !/^\d{4}$/.test(last4)) {
      return res.status(400).json({ success: false, error: 'Last 4 digits must be exactly 4 digits' });
    }
    if (dailyLimit === undefined || dailyLimit === null) {
      return res.status(400).json({ success: false, error: 'dailyLimit is required' });
    }

    const limit = parseFloat(dailyLimit);
    if (isNaN(limit) || limit < 0) {
      return res.status(400).json({ success: false, error: 'dailyLimit must be a non-negative number' });
    }
    const MAX_DAILY_LIMIT = 5000000;
    if (limit > MAX_DAILY_LIMIT) {
      return res.status(400).json({ success: false, error: `Daily limit cannot exceed ${MAX_DAILY_LIMIT.toLocaleString()}` });
    }

    // Find the customer account
    const customerAccount = await CustomerAccount.findOne({
      where: { account_number: accountNumber, status: 'ACTIVE' }
    });
    if (!customerAccount) {
      return res.status(404).json({ success: false, error: 'Account not found or inactive' });
    }

    // Find the card belonging to that account with the given last4
    const card = await DebitCard.findOne({
      where: { accountId: customerAccount.id, cardLast4: last4 }
    });
    if (!card) {
      return res.status(404).json({ success: false, error: 'Card not found for this account' });
    }

    const oldLimit = card.dailyLimit;        // note: attribute name is dailyLimit (camelCase)
    await card.update({ dailyLimit: limit });

    await logAuditTrail(
      'DEBIT_CARD',
      card.id,
      userId,
      'UPDATE_DAILY_LIMIT',
      { daily_limit: oldLimit },
      { daily_limit: limit, card_last4: card.cardLast4 },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );

    return res.status(200).json({
      success: true,
      message: 'Daily limit updated successfully',
      data: { cardId: card.id, daily_limit: limit, cardLast4: card.cardLast4, accountNumber }
    });
  } catch (error) {
    await logAuditTrail(
      'DEBIT_CARD',
      null,
      userId,
      'UPDATE_DAILY_LIMIT_FAILED',
      { accountNumber, last4, dailyLimit },
      { error: error.message },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};


// PUT /api/cards/per-transaction-limit
// PUT /api/cards/per-transaction-limit
export const setPerTransactionLimit = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { last4, customerId, perTransactionLimit } = req.body;

  try {
    // Validate last4
    if (!last4) {
      return res.status(400).json({ success: false, error: 'last4 is required (4 digits)' });
    }
    if (!/^\d{4}$/.test(last4)) {
      return res.status(400).json({ success: false, error: 'last4 must be exactly 4 digits' });
    }

    // Validate perTransactionLimit
    if (perTransactionLimit === undefined || perTransactionLimit === null) {
      return res.status(400).json({ success: false, error: 'perTransactionLimit is required' });
    }
    const limit = parseFloat(perTransactionLimit);
    if (isNaN(limit) || limit < 0) {
      return res.status(400).json({ success: false, error: 'perTransactionLimit must be a non-negative number' });
    }
    const MAX_PER_TX_LIMIT = 1000000;
    if (limit > MAX_PER_TX_LIMIT) {
      return res.status(400).json({ success: false, error: `Per-transaction limit cannot exceed ${MAX_PER_TX_LIMIT.toLocaleString()}` });
    }

    // Build where clause using MODEL ATTRIBUTE NAMES
    const whereClause = { cardLast4: last4 };
    if (customerId) {
      // customerId may be a string like '0100000003' – convert to number (BigInt)
      const parsedCustomerId = parseInt(customerId, 10);
      if (isNaN(parsedCustomerId)) {
        return res.status(400).json({ success: false, error: 'Invalid customerId format' });
      }
      whereClause.customerId = parsedCustomerId;
    }

    const card = await DebitCard.findOne({ where: whereClause });
    if (!card) {
      return res.status(404).json({ 
        success: false, 
        error: 'Card not found. Please verify the last 4 digits and customer ID.' 
      });
    }

    const oldLimit = card.perTransactionLimit;
    // Update the card
    await card.update({ perTransactionLimit: limit });

    // Audit log
    await logAuditTrail(
      'DEBIT_CARD',
      card.id,
      userId,
      'UPDATE_PER_TX_LIMIT',
      { per_transaction_limit: oldLimit },
      { per_transaction_limit: limit, card_last4: card.cardLast4 },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );

    return res.status(200).json({
      success: true,
      message: 'Per‑transaction limit updated successfully',
      data: { 
        cardId: card.id, 
        per_transaction_limit: limit, 
        cardLast4: card.cardLast4 
      }
    });
  } catch (error) {
    console.error('Error updating per‑transaction limit:', error);
    await logAuditTrail(
      'DEBIT_CARD',
      null,
      userId,
      'UPDATE_PER_TX_LIMIT_FAILED',
      { last4, customerId, perTransactionLimit },
      { error: error.message },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Helper to mask PAN (show first6+last4)
function maskPan(pan) {
  if (!pan || pan.length < 10) return '****';
  return pan.slice(0,6) + '******' + pan.slice(-4);
}


// POST /api/debit-cards/cards/set-pin
export const setCardPin = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { last4, pin, customerId, cardPan } = req.body;

  try {
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ success: false, error: 'PIN must be 4 digits' });
    }

    // Build where clause using MODEL ATTRIBUTE NAMES (camelCase)
    const whereClause = {};

    if (cardPan) {
      whereClause.cardPan = cardPan;          // model attribute → maps to 'card_pan'
    } else if (last4) {
      if (!/^\d{4}$/.test(last4)) {
        return res.status(400).json({ success: false, error: 'Last 4 digits must be 4 digits' });
      }
      whereClause.cardLast4 = last4;          // attribute → maps to 'card_last4'

      if (customerId) {
        const parsedCustomerId = parseInt(customerId, 10);
        if (!isNaN(parsedCustomerId)) {
          whereClause.customerId = parsedCustomerId;   // attribute → maps to 'customer_id'
        } else {
          console.warn(`Invalid customerId: ${customerId}`);
        }
      } else if (req.user?.customerId) {
        whereClause.customerId = parseInt(req.user.customerId, 10);
      }
    } else {
      return res.status(400).json({ success: false, error: 'Either last4 or cardPan is required' });
    }

    console.log('Searching for card with (model attributes):', whereClause);

    const card = await DebitCard.findOne({ where: whereClause });

    if (!card) {
      return res.status(404).json({
        success: false,
        error: 'Card not found. Check the last 4 digits or card number.',
        debug: { last4, customerId, cardPan, whereClause }
      });
    }

    // Update using MODEL ATTRIBUTE NAMES
    const oldStatus = card.cardStatus;        // attribute name
    const hashedPin = crypto.createHash('sha256').update(pin).digest('hex');
    await card.update({
      pinHash: hashedPin,                    // attribute → maps to 'pin_hash'
      cardStatus: 'ACTIVE',                  // attribute → maps to 'card_status'
      activatedAt: new Date()                // attribute → maps to 'activated_at'
    });

    // Audit log (use attribute names consistently)
    await logAuditTrail(
      'DEBIT_CARD',
      card.id,
      userId,
      'SET_PIN',
      { card_status: oldStatus },
      { card_status: 'ACTIVE', card_last4: card.cardLast4, pin_set: true },
      ipAddress,
      'CARD_SECURITY',
      { branch: req.user?.branch || 1 }
    );

    return res.status(200).json({ success: true, message: 'PIN set successfully' });

  } catch (error) {
    await logAuditTrail(
      'DEBIT_CARD',
      null,
      userId,
      'SET_PIN_FAILED',
      null,
      { error: error.message },
      ipAddress,
      'CARD_SECURITY',
      { branch: req.user?.branch || 1 }
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/cards/:cardId/block
// POST /api/cards/block  (or keep route /api/cards/block)
export const blockCard = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { accountNumber, last4, reason } = req.body;

  try {
    // Validate required fields
    if (!accountNumber) {
      return res.status(400).json({ success: false, error: 'Account number is required' });
    }
    if (!last4 || !/^\d{4}$/.test(last4)) {
      return res.status(400).json({ success: false, error: 'Last 4 digits of the card are required and must be exactly 4 digits' });
    }

    // Find the customer account
    const customerAccount = await CustomerAccount.findOne({
      where: { account_number: accountNumber, status: 'ACTIVE' }
    });
    if (!customerAccount) {
      return res.status(404).json({ success: false, error: 'Account not found or inactive' });
    }

    // Find the card belonging to that account with the given last4
    const card = await DebitCard.findOne({
      where: { accountId: customerAccount.id, cardLast4: last4 }
    });
    if (!card) {
      return res.status(404).json({ success: false, error: 'Card not found for this account' });
    }

    const oldStatus = card.cardStatus;
    const blockReason = reason || 'User requested';
    await card.update({
      cardStatus: 'BLOCKED',
      blockedAt: new Date(),
      blockReason: blockReason
    });

    await logAuditTrail(
      'DEBIT_CARD',
      card.id,
      userId,
      'BLOCK_CARD',
      { card_status: oldStatus, block_reason: card.blockReason },
      { card_status: 'BLOCKED', block_reason: blockReason, card_last4: card.cardLast4 },
      ipAddress,
      'CARD_SECURITY',
      { branch: req.user?.branch || 1 }
    );

    return res.status(200).json({
      success: true,
      message: 'Card blocked successfully',
      data: { accountNumber, cardLast4: card.cardLast4, cardId: card.id }
    });
  } catch (error) {
    await logAuditTrail(
      'DEBIT_CARD',
      null,
      userId,
      'BLOCK_CARD_FAILED',
      { accountNumber, last4, reason },
      { error: error.message },
      ipAddress,
      'CARD_SECURITY',
      { branch: req.user?.branch || 1 }
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};


// POST /api/cards/unblock
export const unblockCard = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { accountNumber, last4, reason } = req.body;  // ✅ added reason

  try {
    if (!accountNumber) {
      return res.status(400).json({ success: false, error: 'Account number is required' });
    }
    if (!last4 || !/^\d{4}$/.test(last4)) {
      return res.status(400).json({ success: false, error: 'Last 4 digits must be exactly 4 digits' });
    }
    if (!reason?.trim()) {
      return res.status(400).json({ success: false, error: 'Reason for unblocking is required' });
    }

    const customerAccount = await CustomerAccount.findOne({
      where: { account_number: accountNumber, status: 'ACTIVE' }
    });
    if (!customerAccount) {
      return res.status(404).json({ success: false, error: 'Account not found or inactive' });
    }

    const card = await DebitCard.findOne({
      where: { accountId: customerAccount.id, cardLast4: last4, cardStatus: 'BLOCKED' }
    });
    if (!card) {
      return res.status(404).json({ success: false, error: 'No blocked card found for this account with the specified last 4 digits' });
    }

    const oldStatus = card.cardStatus;
    const oldBlockReason = card.blockReason;
    const unblockReason = reason.trim();

    await card.update({
      cardStatus: 'ACTIVE',
      blockedAt: null,
      blockReason: null,
      unblockReason: unblockReason  // ✅ store if column exists (otherwise ignore)
    });

    await logAuditTrail(
      'DEBIT_CARD',
      card.id,
      userId,
      'UNBLOCK_CARD',
      { card_status: oldStatus, block_reason: oldBlockReason },
      { card_status: 'ACTIVE', card_last4: card.cardLast4, unblock_reason: unblockReason },
      ipAddress,
      'CARD_SECURITY',
      { branch: req.user?.branch || 1 }
    );

    return res.status(200).json({
      success: true,
      message: 'Card unblocked successfully',
      data: { accountNumber, cardLast4: card.cardLast4, cardId: card.id, unblockReason }
    });
  } catch (error) {
    await logAuditTrail(
      'DEBIT_CARD',
      null,
      userId,
      'UNBLOCK_CARD_FAILED',
      { accountNumber, last4, reason },
      { error: error.message },
      ipAddress,
      'CARD_SECURITY',
      { branch: req.user?.branch || 1 }
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};



// GET /api/cards/transactions
export const getCardTransactionHistory = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { accountNumber, last4, limit = 20, offset = 0 } = req.query; // removed startDate/endDate for simplicity

  try {
    // Validate required fields
    if (!accountNumber) {
      return res.status(400).json({ success: false, error: 'Account number is required' });
    }
    if (!last4 || !/^\d{4}$/.test(last4)) {
      return res.status(400).json({ success: false, error: 'Last 4 digits are required and must be exactly 4 digits' });
    }

    const customerAccount = await CustomerAccount.findOne({
      where: { account_number: accountNumber, status: 'ACTIVE' }
    });
    if (!customerAccount) {
      return res.status(404).json({ success: false, error: 'Account not found or inactive' });
    }

    const card = await DebitCard.findOne({
      where: { accountId: customerAccount.id, cardLast4: last4 }
    });
    if (!card) {
      return res.status(404).json({ success: false, error: 'Card not found for this account' });
    }

    // Build where clause for transactions – only by account number
    const whereClause = { ACCT_NO: customerAccount.account_number };

    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    // ✅ Order by primary key 'id' (auto-increment, reflects chronological order)
    const { count, rows: transactions } = await Transaction.findAndCountAll({
      where: whereClause,
      order: [['id', 'DESC']],          // use 'id' – no 'createdAt'
      limit: parsedLimit,
      offset: parsedOffset
    });

    await logAuditTrail(
      'DEBIT_CARD',
      card.id,
      userId,
      'VIEW_TRANSACTION_HISTORY',
      null,
      { count, cardLast4: card.cardLast4, accountNumber },
      ipAddress,
      'CARD_TRANSACTION',
      { branch: req.user?.branch || 1 }
    );

    return res.status(200).json({
      success: true,
      data: {
        card: {
          cardId: card.id,
          cardLast4: card.cardLast4,
          cardType: card.cardType,
          cardStatus: card.cardStatus
        },
        account: {
          accountNumber: customerAccount.account_number,
          accountName: customerAccount.account_name
        },
        transactions,
        pagination: {
          total: count,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore: parsedOffset + parsedLimit < count
        }
      }
    });
  } catch (error) {
    await logAuditTrail(
      'DEBIT_CARD',
      null,
      userId,
      'VIEW_TRANSACTION_HISTORY_FAILED',
      { accountNumber, last4, limit, offset },
      { error: error.message },
      ipAddress,
      'CARD_TRANSACTION',
      { branch: req.user?.branch || 1 }
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};