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
import { roleHasPermission } from '../constants/roleMapping.js';
import CardApprovalRequest from '../models/CardApprovalRequest.js';
import ApprovalWorkflowConfig from '../models/ApprovalWorkflowConfig.js';
import { sendApprovalNotificationToBUUsers } from './NotificationController.js';
import { ROLES } from '../utils/roleConstants.js';
import Notification from '../models/index.js';

// ✅ Import the encryption functions
import { 
    encryptCVV, 
    decryptCVV, 
    checkEncryptionStatus,
    encryptCVVForFlutterwaveV3,
    decryptV3_3DES,
    generateV3Nonce,
    encryptV3_3DES
} from '../utils/encryption.js';

// ✅ Import all Flutterwave service functions
import { 
    chargeCard,
    verifyTransaction,
    refundTransaction,
    getTransactionStatus,
    listTransactions,
    healthCheck,
    generateNonce,
    encryptField,
    decryptField,
    decryptStoredCVV
} from '../Services/flutterwave.service.js';

// ==================== HELPERS ====================
const getUserId = (req) => {
  if (!req.user) return 'system';
  return req.user.username || 
         req.user.user_name || 
         req.user.id || 
         req.user.userId || 
         req.user.user_id || 
         'system';
};

const getClientIp = (req) => req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '127.0.0.1';

/**
 * Resolve a GL account pattern that may contain wildcards (***)
 */
function resolveGLAccount(glAccountPattern, branchCode) {
  if (!glAccountPattern) return null;
  if (glAccountPattern.includes('***')) {
    const branch = String(branchCode).padStart(3, '0');
    const resolved = glAccountPattern.replace(/\*\*\*/g, branch);
    console.log(`🔁 Resolved GL account: ${glAccountPattern} -> ${resolved}`);
    return resolved;
  }
  return glAccountPattern;
}

function isValidGLAccount(glAccount) {
  if (!glAccount) return false;
  if (glAccount === 'NONE') return false;
  if (glAccount.includes('***')) return true;
  return glAccount.length >= 10;
}

async function getCardIssuanceCharge() {
  console.log('🔍 Looking for card issuance charge...');
  
  const chargeTypes = ['CARD_ISSUANCE_CHARGE', 'CARD_ISSUANCE_FEE', 'CARD_ISSUANCE', 'CARD_FEE'];
  let charge = null;
  
  for (const type of chargeTypes) {
    charge = await Charge.findOne({
      where: { 
        CHRG_TY: type, 
        REC_ST: 'A' 
      }
    });
    if (charge) {
      console.log(`✅ Found charge with type: ${type}`);
      break;
    }
  }

  if (!charge) {
    console.error('❌ No card issuance charge found in database');
    throw new Error('Card issuance fee not configured. Please set up a charge with type CARD_ISSUANCE_CHARGE, CARD_ISSUANCE_FEE, CARD_ISSUANCE, or CARD_FEE with status A.');
  }

  let amount = 0;
  if (charge.CHRG_AMT) {
    amount = parseFloat(charge.CHRG_AMT);
  }
  
  if (isNaN(amount) || amount <= 0) {
    console.error('❌ Invalid charge amount:', charge.CHRG_AMT);
    throw new Error('Invalid card issuance fee amount in charge configuration');
  }

  let glAccount = charge.INCOME_GL_ACCT_NO;
  if (glAccount && glAccount.includes('***')) {
    console.log(`✅ Using wildcard GL account pattern: ${glAccount}`);
  } else if (!glAccount || glAccount === 'NONE' || glAccount === '') {
    console.error('❌ No GL account found in charge record');
    throw new Error('Income GL account not set for card issuance charge. Please configure the charge with a valid GL account.');
  }

  console.log(`✅ Card issuance charge configured: ${charge.CHRG_CD} - ${charge.CHRG_NM || charge.CHRG_TY}, Amount: ${amount}, GL: ${glAccount}`);

  return {
    amount,
    creditGlAccount: glAccount,
    chargeCode: charge.CHRG_CD,
    chargeName: charge.CHRG_NM || charge.CHRG_TY,
    chargeId: charge.CHRG_ID,
    isVATApplicable: charge.IS_VAT_APPLICABLE || false,
    vatRate: charge.VAT_RATE || 7.5,
    vatGLAccountNo: charge.VAT_GL_ACCOUNT_NO || null
  };
}

// ==================== GET CARD DETAILS FOR PRINTING ====================

export const getCardDetailsForPrinting = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { identifier } = req.params;

  try {
    const user = req.user;
    if (!user) {
      console.warn('⚠️ Unauthenticated attempt to access card details');
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized - Please login' 
      });
    }

    const isNumeric = /^\d+$/.test(identifier);
    const maskedIdentifier = isNumeric ? `ID: ${identifier}` : `PAN: ****${identifier.slice(-4)}`;
    
    console.log(`🔍 User ${user.user_name || user.username || user.id} requesting card details for ${maskedIdentifier}`);

    const roleId = user.roleId || user.BU_ROLE_ID || user.role_id || user.id;
    const isAdmin = user.isAdmin === true || 
                    parseInt(roleId) === 1 || 
                    user.role === 'Administrator' ||
                    user.BU_ROLE_ID === '1';

    let hasPrintPermission = false;
    
    if (isAdmin) {
      hasPrintPermission = true;
      console.log('✅ Admin user - granted print permission');
    } else {
      try {
        hasPrintPermission = await roleHasPermission(roleId, 'debit_card.print');
        console.log(`✅ Print permission check result: ${hasPrintPermission}`);
      } catch (permError) {
        console.error('Error checking permissions:', permError);
        if (user.permissions && Array.isArray(user.permissions)) {
          hasPrintPermission = user.permissions.includes('debit_card.print');
        }
      }
    }

    if (!hasPrintPermission) {
      console.warn(`❌ User ${user.user_name || user.username || user.id} lacks debit_card.print permission`);
      await logAuditTrail(
        'DEBIT_CARD',
        identifier,
        userId,
        'VIEW_CARD_DETAILS_DENIED',
        null,
        { 
          error: 'Insufficient permissions', 
          requestedBy: userId,
          roleId: roleId,
          requiredPermission: 'debit_card.print'
        },
        ipAddress,
        'CARD_MANAGEMENT',
        { branch: req.user?.branch || 1 }
      );
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized to view card details. Required permission: debit_card.print' 
      });
    }

    let card;
    if (isNumeric) {
      console.log(`🔍 Searching by card ID: ${identifier}`);
      card = await DebitCard.findByPk(parseInt(identifier), {
        include: [{ model: CustomerAccount, as: 'customerAccount' }]
      });
    } else {
      console.log(`🔍 Searching by card PAN: "${identifier}"`);
      card = await DebitCard.findOne({
        where: { cardPan: identifier },
        include: [{ model: CustomerAccount, as: 'customerAccount' }]
      });
    }

    if (!card) {
      console.log(`❌ Card not found with identifier: ${identifier}`);
      await logAuditTrail(
        'DEBIT_CARD',
        identifier,
        userId,
        'CARD_NOT_FOUND',
        null,
        { error: 'Card not found', requestedBy: userId },
        ipAddress,
        'CARD_MANAGEMENT',
        { branch: req.user?.branch || 1 }
      );
      return res.status(404).json({ 
        success: false, 
        error: 'Card not found' 
      });
    }

    console.log(`✅ Card found: ID ${card.id}, PAN: ${card.cardPan}, Last4: ${card.cardLast4}`);

    const isCardAdmin = isAdmin;
    const isIssuer = card.issuedBy === userId;
    const isAccountHolder = card.customerId === user.customerId || card.customerId === user.CUST_ID;

    if (!isCardAdmin && !isIssuer && !isAccountHolder) {
      console.warn(`❌ User ${user.user_name || user.username || user.id} not authorized for card ${card.cardLast4}`);
      await logAuditTrail(
        'DEBIT_CARD',
        card.id,
        userId,
        'VIEW_CARD_DETAILS_DENIED',
        null,
        { 
          error: 'User not authorized for this card', 
          requestedBy: userId,
          cardIssuer: card.issuedBy,
          cardCustomerId: card.customerId,
          cardLast4: card.cardLast4
        },
        ipAddress,
        'CARD_MANAGEMENT',
        { branch: req.user?.branch || 1 }
      );
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized to view this card' 
      });
    }

    let cvv = null;
    if (card.encryptedCvv && card.cvvNonce) {
      try {
        console.log(`🔓 Decrypting CVV for card ${card.cardLast4} using V3 3DES...`);
        const decryptedCVV = decryptV3_3DES(card.encryptedCvv, card.cvvNonce);
        if (decryptedCVV && /^\d{3,4}$/.test(decryptedCVV)) {
          cvv = decryptedCVV;
          console.log(`✅ CVV decrypted successfully for card ${card.cardLast4}`);
        } else {
          console.warn(`⚠️ Failed to decrypt CVV for card ${card.cardLast4}`);
        }
      } catch (error) {
        console.error('Failed to decrypt CVV for printing:', error.message);
        cvv = null;
      }
    } else {
      console.warn(`⚠️ No encrypted CVV or nonce found for card ${card.cardLast4}`);
    }

    await logAuditTrail(
      'DEBIT_CARD',
      card.id,
      userId,
      'VIEW_CARD_DETAILS_FOR_PRINTING',
      null,
      { 
        cardLast4: card.cardLast4, 
        requestedBy: userId,
        hasCvv: cvv !== null,
        roleId: roleId
      },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );

    return res.status(200).json({
      success: true,
      data: {
        cardId: card.id,
        cardPan: card.cardPan,
        cardLast4: card.cardLast4,
        cardHolderName: card.cardHolderName,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cvv: cvv,
        cardScheme: card.cardScheme,
        cardType: card.cardType,
        cardStatus: card.cardStatus,
        issuedAt: card.issuedAt,
        flutterwaveEnabled: card.flutterwaveEnabled,
        hasEncryptedCVV: !!card.encryptedCvv,
        customer: card.customerAccount ? {
          id: card.customerAccount.id,
          name: card.customerAccount.account_name,
          accountNumber: card.customerAccount.account_number
        } : null
      }
    });

  } catch (error) {
    console.error('❌ Error getting card details for printing:', error);
    await logAuditTrail(
      'DEBIT_CARD',
      identifier || 'unknown',
      userId,
      'VIEW_CARD_DETAILS_FAILED',
      null,
      { 
        error: error.message,
        stack: error.stack,
        requestedBy: userId 
      },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve card details. Please try again.' 
    });
  }
};

// ==================== CARD ISSUANCE WITH APPROVAL WORKFLOW ====================

/**
 * POST /api/cards/request-issuance
 * Request card issuance with approval workflow
 * ✅ ALL REQUESTS GO THROUGH APPROVAL - NO BYPASS
 * ✅ STRICT VALIDATION: Prevents multiple cards for the same customer
 */
export const requestCardIssuance = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const userRoleId = req.user?.roleId || req.user?.BU_ROLE_ID || req.user?.role_id;
  const userBU = req.user?.BU_ID || req.user?.branchCode || req.user?.branch || 101;
  const userBranch = req.user?.branchName || req.user?.branch || 'Main Branch';

  let transaction = null;

  try {
    let {
      customerId,
      accountNumber,
      accountId,
      cardType,
      enableFlutterwave,
      cardScheme,
      organizationName = req.body.organizationName || req.user?.organizationName || 'EVOLUTION BANK',
      branchName = req.body.branchName || req.user?.branchName || userBranch,
      branchCode = req.body.branchCode || req.user?.branchCode || userBU,
      priority = 'medium',
      forceReissue = false
    } = req.body;

    if (!accountNumber && accountId) accountNumber = accountId;
    if (!accountNumber) throw new Error('Account number is required');

    const flutterwaveEnabled = enableFlutterwave !== undefined ? enableFlutterwave : false;

    // ✅ START TRANSACTION
    transaction = await sequelize.transaction();

    // 1. Validate customer account
    const customerAccount = await CustomerAccount.findOne({
      where: {
        account_number: accountNumber,
        CUST_ID: customerId,
        status: 'ACTIVE'
      },
      transaction,
      lock: true
    });
    if (!customerAccount) throw new Error('Customer account not found or not active');

    // ============================================================
    // ✅ STRICT CARD VALIDATION - Check ALL existing cards
    // ============================================================
    
    const existingCards = await DebitCard.findAll({
      where: { customerId: customerId },
      transaction,
      lock: true
    });

    console.log(`📋 Found ${existingCards.length} existing cards for customer ${customerId}`);

    // ✅ Check for ANY card that is not CANCELLED or EXPIRED
    const nonCancelledCards = existingCards.filter(card => 
      card.cardStatus !== 'CANCELLED' && card.cardStatus !== 'EXPIRED'
    );

    if (nonCancelledCards.length > 0) {
      console.log(`⚠️ Customer has ${nonCancelledCards.length} non-cancelled cards`);
      
      nonCancelledCards.forEach(card => {
        console.log(`  - Card ID: ${card.id}, Last4: ${card.cardLast4}, Status: ${card.cardStatus}`);
      });

      // ✅ Check for ACTIVE or ISSUED cards
      const activeOrIssuedCards = nonCancelledCards.filter(card => 
        card.cardStatus === 'ACTIVE' || card.cardStatus === 'ISSUED'
      );

      if (activeOrIssuedCards.length > 0) {
        const cardLast4s = activeOrIssuedCards.map(c => c.cardLast4).join(', ');
        throw new Error(
          `Customer already has active card(s) ending in: ${cardLast4s}. ` +
          `Please cancel or replace the existing card first.`
        );
      }

      // ✅ Check for BLOCKED (lost/stolen) cards
      const lostStolenCards = nonCancelledCards.filter(card => 
        card.cardStatus === 'BLOCKED' && 
        (card.blockReason === 'LOST' || card.blockReason === 'STOLEN')
      );

      if (lostStolenCards.length > 0) {
        if (forceReissue) {
          console.log(`🔄 Force reissue: Cancelling ${lostStolenCards.length} lost/stolen cards`);
          for (const card of lostStolenCards) {
            await card.update({
              blockReason: `REPLACED (was ${card.blockReason})`,
              cardStatus: 'CANCELLED'
            }, { transaction });
            console.log(`  ✅ Cancelled card ${card.id} (${card.cardLast4})`);
          }
        } else {
          const cardLast4s = lostStolenCards.map(c => c.cardLast4).join(', ');
          throw new Error(
            `Customer has lost/stolen card(s) ending in: ${cardLast4s}. ` +
            `To issue a replacement, please set forceReissue=true in the request.`
          );
        }
      }

      // ✅ Check for PENDING cards
      const pendingCards = nonCancelledCards.filter(card => 
        card.cardStatus === 'PENDING'
      );

      if (pendingCards.length > 0) {
        const cardLast4s = pendingCards.map(c => c.cardLast4).join(', ');
        throw new Error(
          `Customer already has pending card(s) ending in: ${cardLast4s}. ` +
          `Please wait for the pending request to be processed or cancelled.`
        );
      }

      // ✅ Check for any other non-cancelled cards
      const otherCards = nonCancelledCards.filter(card => 
        !['ACTIVE', 'ISSUED', 'BLOCKED', 'PENDING'].includes(card.cardStatus)
      );

      if (otherCards.length > 0) {
        const cardLast4s = otherCards.map(c => c.cardLast4).join(', ');
        throw new Error(
          `Customer has card(s) in status: ${otherCards.map(c => c.cardStatus).join(', ')} ` +
          `ending in: ${cardLast4s}. Please resolve these cards first.`
        );
      }
    }

    // ✅ Check for existing PENDING approval requests
    try {
      const existingApprovalRequest = await CardApprovalRequest.findOne({
        where: {
          customerId: customerId,
          status: 'PENDING',
          expiresAt: {
            [Op.gt]: new Date()
          }
        },
        transaction
      });

      if (existingApprovalRequest) {
        throw new Error(
          `Customer already has a pending approval request (ID: ${existingApprovalRequest.id}). ` +
          `Please wait for it to be processed or cancelled.`
        );
      }
    } catch (error) {
      if (error.message && error.message.includes('pending approval request')) {
        throw error;
      }
      console.warn('⚠️ Could not check pending approval requests:', error.message);
    }

    console.log(`✅ Customer ${customerId} is eligible for card issuance`);

    // ============================================================
    // 3. Get fee details
    // ============================================================
    let feeDetails;
    try {
      feeDetails = await getCardIssuanceCharge();
    } catch (error) {
      console.error('❌ Failed to get card issuance charge:', error.message);
      feeDetails = {
        amount: 1000,
        creditGlAccount: '01***441400001',
        chargeCode: 'CARD_ISSUANCE',
        chargeName: 'Card Issuance Fee',
        isVATApplicable: true,
        vatRate: 7.5,
        vatGLAccountNo: '01***441500001'
      };
    }

    const feeAmount = feeDetails.amount || 1000;
    let vatAmount = 0;
    let totalDeduction = feeAmount;

    if (feeDetails.isVATApplicable && feeDetails.vatRate > 0) {
      vatAmount = (feeDetails.vatRate / 100) * feeAmount;
      totalDeduction = feeAmount + vatAmount;
      console.log(`💰 VAT calculated: ${vatAmount} (${feeDetails.vatRate}% of ${feeAmount})`);
    }

    // ============================================================
    // ✅ GENERATE CARD DETAILS
    // ============================================================
    
    const schemeBinMap = {
      'VERVE': '506099',
      'VISA': '4',
      'MASTERCARD': '5',
      'AMEX': '34',
      'DISCOVER': '6'
    };
    const binPrefix = schemeBinMap[cardScheme] || '506099';
    const pan = await generateCardNumber(binPrefix, 16, transaction);
    const bin = pan.slice(0, 6);
    const expiryMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const expiryYear = (new Date().getFullYear() + 3).toString();
    const cvv = Math.floor(100 + Math.random() * 900).toString();
    const hashedCVV = crypto.createHash('sha256').update(cvv).digest('hex');

    let encryptedCVV = null;
    let cvvNonce = null;

    if (flutterwaveEnabled) {
      try {
        // ✅ Use the unified encryptCVV function
        const result = encryptCVV(cvv);
        if (result) {
          encryptedCVV = result.encrypted;
          cvvNonce = result.nonce;
          console.log(`🔐 CVV encrypted with ${result.method} for Flutterwave`);
        } else {
          console.warn('⚠️ CVV encryption returned null');
        }
      } catch (error) {
        console.warn('⚠️ Failed to encrypt CVV:', error.message);
      }
    }

    // Get BIN info
    let binInfo = { bank_name: 'Unknown', country: 'Unknown', network: 'Unknown', card_type: 'Unknown' };
    try {
      const [binResults] = await sequelize.query(
        `SELECT * FROM bin_info WHERE bin = :bin LIMIT 1`,
        {
          replacements: { bin },
          transaction,
          type: sequelize.QueryTypes.SELECT
        }
      );
      if (binResults) {
        binInfo = {
          bank_name: binResults.bank_name || 'Unknown',
          country: binResults.country || 'Unknown',
          network: binResults.network || 'Unknown',
          card_type: binResults.card_type || 'Unknown'
        };
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch BIN info:', error.message);
    }

    // ============================================================
    // ✅ PREPARE CARD DATA
    // ============================================================
    
    const cardData = {
      customerId,
      accountNumber,
      accountId: customerAccount.id,
      cardType: cardType || 'VIRTUAL',
      cardScheme: cardScheme || 'VERVE',
      enableFlutterwave: flutterwaveEnabled,
      isReissuance: false,
      existingCardId: null,
      customerName: customerAccount.account_name || 'Customer',
      accountName: customerAccount.account_name,
      organizationName,
      branchName,
      branchCode,
      pan,
      bin,
      expiryMonth,
      expiryYear,
      cvv: hashedCVV,
      encryptedCVV,
      cvvNonce,
      binInfo,
      cardLast4: pan.slice(-4)
    };

    // ============================================================
    // ✅ CREATE APPROVAL REQUEST - NO FALLBACK
    // ============================================================
    let approvalRequest = null;
    
    console.log('🔍 Creating approval request...');
    
    if (!CardApprovalRequest) {
      console.error('❌ CardApprovalRequest model is not imported');
      throw new Error('CardApprovalRequest model not available');
    }

    if (typeof CardApprovalRequest.create !== 'function') {
      console.error('❌ CardApprovalRequest.create is not a function');
      throw new Error('CardApprovalRequest model is not properly initialized');
    }

    // ✅ Create the approval request - NO FALLBACK
    approvalRequest = await CardApprovalRequest.create({
      requestType: 'ISSUE',
      customerId: customerId,
      accountNumber: accountNumber,
      accountId: customerAccount.id,
      cardData: JSON.stringify(cardData),
      feeDetails: JSON.stringify({
        feeAmount,
        vatRate: feeDetails.vatRate || 0,
        vatAmount,
        totalAmount: totalDeduction,
        creditGlAccount: feeDetails.creditGlAccount,
        vatGLAccountNo: feeDetails.vatGLAccountNo,
        chargeCode: feeDetails.chargeCode || 'CARD_ISSUANCE',
        chargeName: feeDetails.chargeName || 'Card Issuance Fee'
      }),
      requestedBy: userId,
      requestedByRoleId: parseInt(userRoleId) || 29,
      branchCode: branchCode,
      organizationName: organizationName,
      branchName: branchName,
      ipAddress: ipAddress,
      isReissuance: 0,
      existingCardId: null,
      approvalLevel: 0,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      requestDate: new Date(),
      approvalHistory: JSON.stringify([]),
      rec_st: 'A'
    }, { transaction });

    console.log(`✅ Approval request created: ID ${approvalRequest.id}, Status: ${approvalRequest.status}`);

    // ✅ Reload to get fresh data
    await approvalRequest.reload({ transaction });
    console.log(`✅ After reload - ID: ${approvalRequest.id}, Status: ${approvalRequest.status}`);

    await transaction.commit();
    transaction = null;

    // Log audit trail
    await logAuditTrail(
      'DEBIT_CARD_APPROVAL_REQUEST',
      approvalRequest.id,
      userId,
      'REQUEST_CARD_ISSUANCE',
      req.body,
      {
        customerId,
        accountNumber,
        cardType,
        cardScheme,
        totalAmount: totalDeduction,
        isReissuance: false,
        hasEncryptedCVV: !!encryptedCVV,
        requestedByRole: userRoleId,
        status: 'PENDING',
        existingCardsCount: existingCards.length
      },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: branchCode }
    );

    // Send notification to approvers
    try {
      const notificationService = await import('../services/NotificationService.js').then(m => m.default);
      
      await notificationService.sendApprovalNotification({
        itemType: 'Card Issuance',
        itemId: approvalRequest.id,
        itemName: `${cardType || 'Virtual'} Card for ${customerAccount.account_name || 'Customer'}`,
        description: `Request to issue a ${cardType || 'Virtual'} card (${cardScheme || 'VERVE'}) for account ${accountNumber}. Fee: ₦${totalDeduction}`,
        submittedBy: req.user?.user_name || userId,
        BU_ID: branchCode || userBU,
        priority: priority || 'medium',
        metadata: {
          requestId: approvalRequest.id,
          customerId,
          accountNumber,
          feeAmount,
          vatAmount,
          totalDeduction,
          cardType,
          cardScheme,
          flutterwaveEnabled,
          customerName: customerAccount.account_name,
          organizationName,
          branchName,
          hasEncryptedCVV: !!encryptedCVV,
          requestedByRole: userRoleId,
          status: 'PENDING',
          cardLast4: pan.slice(-4),
          existingCardsCount: existingCards.length
        }
      });

      console.log(`📧 Notification sent successfully`);

    } catch (notifError) {
      console.warn('⚠️ Notification failed (non-blocking):', notifError.message);
    }

    // Return response
    return res.status(202).json({
      success: true,
      message: 'Card issuance request submitted for approval',
      data: {
        requestId: approvalRequest.id,
        status: 'PENDING',
        totalAmount: totalDeduction,
        feeCharged: feeAmount,
        vatCharged: vatAmount,
        estimatedApprovalTime: '24-48 hours',
        expiresAt: approvalRequest.expiresAt,
        flutterwaveEnabled: flutterwaveEnabled,
        hasEncryptedCVV: !!encryptedCVV,
        requestedByRole: userRoleId,
        isReissuance: false,
        cardType: cardType || 'VIRTUAL',
        cardScheme: cardScheme || 'VERVE',
        cardLast4: pan.slice(-4),
        existingCardsCount: existingCards.length
      }
    });

  } catch (error) {
    // Rollback transaction if it exists and is not finished
    if (transaction && !transaction.finished) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('⚠️ Rollback error:', rollbackError.message);
      }
    }
    
    await logAuditTrail(
      'DEBIT_CARD',
      'unknown',
      userId,
      'REQUEST_ISSUANCE_FAILED',
      req.body,
      {
        error: error.message,
        customerId: req.body.customerId,
        accountNumber: req.body.accountNumber
      },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );
    
    console.error('❌ Error in requestCardIssuance:', error);
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// ==================== ORIGINAL ISSUE CARD (DIRECT ISSUANCE) ====================

/**
 * POST /api/cards/issue
 * Direct card issuance (kept for backward compatibility)
 */
export const issueCard = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  let card = null;
  let feeDetails = null;
  let existingCard = null;
  let isReissuance = false;
  let vatAmount = 0;
  let totalDeduction = 0;

  const organizationName = req.body.organizationName || req.user?.organizationName;
  const branchName = req.body.branchName || req.user?.branchName;
  if (!organizationName || !branchName) {
    return res.status(400).json({
      success: false,
      error: 'Organization name and branch name are required (in body or user context)'
    });
  }

  const branchCode = req.user?.branchCode || req.user?.branch || 101;

  const dbTransaction = await sequelize.transaction();

  try {
    let { 
      customerId, 
      accountNumber, 
      accountId, 
      cardType, 
      enableFlutterwave,
      cardScheme
    } = req.body;
    
    if (!accountNumber && accountId) accountNumber = accountId;
    if (!accountNumber) throw new Error('Account number is required');

    const flutterwaveEnabled = enableFlutterwave !== undefined ? enableFlutterwave : false;

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

    const existingCards = await DebitCard.findAll({
      where: { customerId: customerId },
      transaction: dbTransaction,
      lock: true
    });

    if (existingCards.length > 0) {
      const activeCard = existingCards.find(card => 
        card.cardStatus === 'ACTIVE' || card.cardStatus === 'ISSUED'
      );
      if (activeCard) {
        throw new Error('Customer already has an active card. Cancel or replace it first.');
      }

      const lostStolenCard = existingCards.find(card => 
        card.cardStatus === 'BLOCKED' && 
        (card.blockReason === 'LOST' || card.blockReason === 'STOLEN')
      );
      if (lostStolenCard) {
        isReissuance = true;
        existingCard = lostStolenCard;
        console.log(`📝 Reissuing card for customer ${customerId}, replacing lost/stolen card ${lostStolenCard.id}`);
        await lostStolenCard.update({ 
          blockReason: `REPLACED (was ${lostStolenCard.blockReason})`,
          cardStatus: 'CANCELLED'
        }, { transaction: dbTransaction });
      }
    }

    feeDetails = await getCardIssuanceCharge();
    const feeAmount = feeDetails.amount;

    if (feeDetails.isVATApplicable && feeDetails.vatRate > 0) {
      vatAmount = (feeDetails.vatRate / 100) * feeAmount;
      totalDeduction = feeAmount + vatAmount;
      console.log(`💰 VAT calculated: ${vatAmount} (${feeDetails.vatRate}% of ${feeAmount})`);
    } else {
      totalDeduction = feeAmount;
    }

    const currentAvailable = parseFloat(customerAccount.available_balance);
    if (currentAvailable < totalDeduction) {
      throw new Error(`Insufficient balance. Total: ${totalDeduction} (Fee: ${feeAmount} + VAT: ${vatAmount}), Available: ${currentAvailable}`);
    }

    // Generate PAN and card details
    const schemeBinMap = {
      'VERVE': '506099',
      'VISA': '4',
      'MASTERCARD': '5',
      'AMEX': '34',
      'DISCOVER': '6'
    };
    const binPrefix = schemeBinMap[cardScheme] || '506099';
    console.log(`🔢 Generating card with BIN prefix: ${binPrefix} for scheme: ${cardScheme || 'VERVE'}`);

    const pan = await generateCardNumber(binPrefix, 16, dbTransaction);
    const bin = pan.slice(0, 6);
    const expiryMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const expiryYear = (new Date().getFullYear() + 3).toString();
    const cvv = Math.floor(100 + Math.random() * 900).toString();
    const hashedCVV = crypto.createHash('sha256').update(cvv).digest('hex');

    let encryptedCVV = null;
    let cvvNonce = null;
    if (flutterwaveEnabled) {
      try {
        const result = encryptCVV(cvv);
        if (result) {
          encryptedCVV = result.encrypted;
          cvvNonce = result.nonce;
          console.log(`🔐 CVV encrypted with ${result.method} for Flutterwave`);
        }
      } catch (error) {
        console.warn('⚠️ Failed to encrypt CVV:', error.message);
      }
    }

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

    // Card is created with PENDING status - requires approval before issuance
    card = await DebitCard.create({
      customerId: customerId,
      accountId: customerAccount.id,
      cardPan: pan,
      cardHolderName: customerAccount.account_name || 'Card Holder',
      expiryMonth: expiryMonth,
      expiryYear: expiryYear,
      cvvHash: hashedCVV,
      encryptedCvv: encryptedCVV,
      cvvNonce: cvvNonce,
      cardType: cardType || 'VIRTUAL',
      cardScheme: cardScheme || binInfo.network || 'VERVE',
      cardStatus: 'PENDING',
      issuedBy: userId,
      issuedAt: new Date(),
      cardLast4: pan.slice(-4),
      cardBin: bin,
      binBankName: binInfo.bank_name,
      binCountry: binInfo.country,
      binNetwork: binInfo.network,
      binCardType: binInfo.card_type,
      flutterwaveEnabled: flutterwaveEnabled && encryptedCVV !== null,
      lastUsedAt: null,
    }, { transaction: dbTransaction });

    // Deduct balances
    const currentBalAvailable = parseFloat(customerAccount.available_balance || 0);
    const currentBalCurrent = parseFloat(customerAccount.current_balance || 0);
    const currentBalLedger = parseFloat(customerAccount.ledger_balance || 0);
    const currentBalCleared = parseFloat(customerAccount.cleared_balance || 0);

    const newAvailable = currentBalAvailable - totalDeduction;
    const newCurrent = currentBalCurrent - totalDeduction;
    const newLedger = currentBalLedger - totalDeduction;
    const newCleared = currentBalCleared - totalDeduction;

    console.log('💰 Balance Update:', {
      before: { available: currentBalAvailable, current: currentBalCurrent, ledger: currentBalLedger, cleared: currentBalCleared },
      after: { available: newAvailable, current: newCurrent, ledger: newLedger, cleared: newCleared },
      deduction: totalDeduction,
      fee: feeAmount,
      vat: vatAmount
    });

    await customerAccount.update({
      available_balance: newAvailable,
      current_balance: newCurrent,
      ledger_balance: newLedger,
      cleared_balance: newCleared,
      last_transaction_date: new Date()
    }, { transaction: dbTransaction });

    // Create fee transaction
    const getNextTransactionId = async () => {
      const lastTx = await Transaction.findOne({
        order: [['TRANSACTION_IDENTIFIER', 'DESC']],
        attributes: ['TRANSACTION_IDENTIFIER'],
        transaction: dbTransaction
      });
      return (lastTx?.TRANSACTION_IDENTIFIER || 0) + 1;
    };
    const txIdentifier = await getNextTransactionId();

    await Transaction.create({
      ACCT_NO: customerAccount.account_number,
      ACCT_ID: String(customerAccount.id),
      BU_ID: customerAccount.bu_id || 1,
      CUST_ID: String(customerAccount.CUST_ID),
      ACCT_NM: customerAccount.account_name,
      AMOUNT: feeAmount,
      transactionDirection: 'DEBIT',
      TRANSACTION_TYPE: 'CARD_ISSUANCE_FEE',
      TRANSACTION_IDENTIFIER: txIdentifier,
      EVENT_ID: txIdentifier,
      TRAN_JOURNAL_ID: `JRN_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      TRANSACTION_ID: `TXN_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      REFERENCE: `CARD_ISSUE_${card.id}_${Date.now()}`,
      description: `Card issuance fee for card ${card.id}`,
      status: 'COMPLETED',
      currency: customerAccount.currency || 'NGN',
      createdBy: userId,
      debitAccount: customerAccount.account_number,
      creditAccount: resolveGLAccount(feeDetails.creditGlAccount, branchCode)
    }, { transaction: dbTransaction });

    if (vatAmount > 0) {
      const vatTxIdentifier = await getNextTransactionId() + 1;
      await Transaction.create({
        ACCT_NO: customerAccount.account_number,
        ACCT_ID: String(customerAccount.id),
        BU_ID: customerAccount.bu_id || 1,
        CUST_ID: String(customerAccount.CUST_ID),
        ACCT_NM: customerAccount.account_name,
        AMOUNT: vatAmount,
        transactionDirection: 'DEBIT',
        TRANSACTION_TYPE: 'VAT_CARD_ISSUANCE',
        TRANSACTION_IDENTIFIER: vatTxIdentifier,
        EVENT_ID: vatTxIdentifier,
        TRAN_JOURNAL_ID: `JRN_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        TRANSACTION_ID: `TXN_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        REFERENCE: `CARD_ISSUE_VAT_${card.id}_${Date.now()}`,
        description: `VAT on card issuance for card ${card.id}`,
        status: 'COMPLETED',
        currency: customerAccount.currency || 'NGN',
        createdBy: userId,
        debitAccount: customerAccount.account_number,
        creditAccount: resolveGLAccount(feeDetails.vatGLAccountNo, branchCode)
      }, { transaction: dbTransaction });
    }

    await dbTransaction.commit();

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
        cardScheme: card.cardScheme,
        maskedPan: `**** **** **** ${card.cardLast4}`,
        status: card.cardStatus,
        cardId: card.id,
        feeAmount,
        vatAmount,
        totalDeduction,
        creditGlAccount: feeDetails.creditGlAccount,
        flutterwaveEnabled: card.flutterwaveEnabled,
        hasEncryptedCVV: !!card.encryptedCvv,
        ...(isReissuance && { replacedCardId: existingCard.id })
      },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1, branchCode: branchCode }
    );

    // Send pending status notification
    await sendCardPendingNotification({
      cardId: card.id,
      customerId: customerId,
      customerName: customerAccount.account_name || 'Customer',
      customerEmail: customerAccount.email,
      maskedPan: `**** **** **** ${card.cardLast4}`,
      cardScheme: card.cardScheme,
      cardType: card.cardType,
      expiry: `${expiryMonth}/${expiryYear}`,
      feeAmount: feeAmount,
      vatAmount: vatAmount,
      totalDeduction: totalDeduction,
      isReissuance: isReissuance,
      organizationName: organizationName,
      branchName: branchName,
      flutterwaveEnabled: card.flutterwaveEnabled,
      hasEncryptedCVV: !!card.encryptedCvv
    });

    return res.status(201).json({
      success: true,
      data: {
        cardId: card.id,
        cardScheme: card.cardScheme,
        maskedPan: `**** **** **** ${card.cardLast4}`,
        expiry: `${expiryMonth}/${expiryYear}`,
        cardType: card.cardType,
        status: card.cardStatus,
        accountNumber: customerAccount.account_number,
        feeCharged: feeAmount,
        vatCharged: vatAmount,
        totalCharged: totalDeduction,
        bankName: binInfo.bank_name,
        country: binInfo.country,
        network: binInfo.network,
        flutterwaveEnabled: card.flutterwaveEnabled,
        hasEncryptedCVV: !!card.encryptedCvv,
        message: isReissuance 
          ? `Replacement card request submitted for approval. Old card (${existingCard.cardLast4}) has been cancelled. Fee of ${feeAmount}${vatAmount > 0 ? ` + VAT ${vatAmount}` : ''} deducted.${card.flutterwaveEnabled ? ' Card enabled for Flutterwave payments.' : ''} Please wait for approval before use.`
          : `Card request submitted for approval. A fee of ${feeAmount}${vatAmount > 0 ? ` + VAT ${vatAmount}` : ''} was deducted. ${card.flutterwaveEnabled ? ' Card enabled for Flutterwave payments.' : ''} Please wait for approval before use.`
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
      { 
        error: error.message, 
        feeAttempted: feeDetails?.amount, 
        vatAttempted: vatAmount,
        totalAttempted: totalDeduction,
        glAccount: feeDetails?.creditGlAccount,
        vatGlAccount: feeDetails?.vatGLAccountNo
      },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );
    return res.status(400).json({ success: false, error: error.message });
  }
};

// ==================== SEND CARD PENDING NOTIFICATION ====================

/**
 * Send card pending approval notification
 */
export const sendCardPendingNotification = async ({
  cardId,
  customerId,
  customerName,
  customerEmail,
  maskedPan,
  cardScheme,
  cardType,
  expiry,
  feeAmount,
  vatAmount,
  totalDeduction,
  isReissuance,
  organizationName,
  branchName,
  flutterwaveEnabled,
  hasEncryptedCVV = false
}) => {
  try {
    const approverEmail = process.env.DEFAULT_APPROVER_EMAIL || 'admin@banking-system.com';
    
    const subject = isReissuance 
      ? `🔁 Replacement Card Request Pending Approval - ${maskedPan}`
      : `🆕 New Card Request Pending Approval - ${maskedPan}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { background-color: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px -30px; }
          .header h1 { margin: 0; font-size: 24px; }
          .status-badge { display: inline-block; background-color: #f59e0b; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
          .card-details { background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .card-details table { width: 100%; }
          .card-details td { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
          .card-details td:last-child { text-align: right; font-weight: bold; }
          .fee-breakdown { background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #22c55e; }
          .fee-breakdown table { width: 100%; }
          .fee-breakdown td { padding: 6px 0; }
          .fee-breakdown td:last-child { text-align: right; }
          .total { font-weight: bold; font-size: 18px; color: #dc2626; }
          .actions { margin: 20px 0; padding: 15px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b; }
          .btn { display: inline-block; padding: 12px 24px; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
          .btn-approve { background-color: #22c55e; }
          .btn-reject { background-color: #ef4444; margin-left: 10px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${isReissuance ? '🔄 Replacement Card Request' : '💳 New Card Request'}</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">${organizationName || 'Bank'} - ${branchName || 'Main'}</p>
          </div>

          <p style="font-size: 16px;">Dear Approval Team,</p>
          <p>A ${cardType || 'VIRTUAL'} card request has been submitted and is awaiting your approval.</p>

          <div style="display: flex; align-items: center; gap: 10px; margin: 15px 0;">
            <span class="status-badge">PENDING APPROVAL</span>
            <span style="font-size: 14px; color: #6b7280;">Request ID: #${cardId}</span>
          </div>

          <div class="card-details">
            <h3 style="margin-top: 0;">💳 Card Details</h3>
            <table>
              <tr><td>Card Number</td><td>${maskedPan || '**** **** **** ****'}</td></tr>
              <tr><td>Card Scheme</td><td>${cardScheme || 'UNKNOWN'}</td></tr>
              <tr><td>Card Type</td><td>${cardType || 'VIRTUAL'}</td></tr>
              <tr><td>Expiry Date</td><td>${expiry || 'MM/YYYY'}</td></tr>
              <tr><td>Card Holder</td><td>${customerName || 'Customer'}</td></tr>
              <tr><td>Customer ID</td><td>${customerId || 'N/A'}</td></tr>
              ${flutterwaveEnabled ? `<tr><td>Flutterwave</td><td>✅ Enabled</td></tr>` : ''}
              ${hasEncryptedCVV ? `<tr><td>CVV Encryption</td><td>✅ Encrypted</td></tr>` : ''}
              ${isReissuance ? `<tr><td>Replacement</td><td>✅ Yes (Lost/Stolen Card)</td></tr>` : ''}
            </table>
          </div>

          <div class="fee-breakdown">
            <h3 style="margin-top: 0;">💰 Fee Breakdown</h3>
            <table>
              <tr><td>Issuance Fee</td><td>₦${(feeAmount || 0).toFixed(2)}</td></tr>
              ${(vatAmount || 0) > 0 ? `<tr><td>VAT (7.5%)</td><td>₦${(vatAmount || 0).toFixed(2)}</td></tr>` : ''}
              <tr><td class="total">Total Deducted</td><td class="total">₦${(totalDeduction || 0).toFixed(2)}</td></tr>
            </table>
          </div>

          <div class="actions">
            <p style="margin: 0 0 10px 0;"><strong>📋 Action Required</strong></p>
            <p style="margin: 0 0 15px 0; font-size: 14px; color: #6b7280;">
              Please review the card request and take appropriate action.
            </p>
            <div>
              <a href="${process.env.APP_URL || 'http://localhost:3000'}/admin/cards/pending/${cardId}" class="btn btn-approve">✅ Approve Card</a>
              <a href="${process.env.APP_URL || 'http://localhost:3000'}/admin/cards/pending/${cardId}?action=reject" class="btn btn-reject">❌ Reject Request</a>
            </div>
            <p style="font-size: 12px; color: #6b7280; margin-top: 10px;">
              Or go to: ${process.env.APP_URL || 'http://localhost:3000'}/admin/cards/pending
            </p>
          </div>

          <div class="footer">
            <p>This is an automated notification from the Banking Core System.</p>
            <p>If you have any questions, please contact the Card Management Team.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
${isReissuance ? 'REPLACEMENT CARD REQUEST PENDING APPROVAL' : 'NEW CARD REQUEST PENDING APPROVAL'}
${organizationName || 'Bank'} - ${branchName || 'Main'}

Request ID: #${cardId}
Customer: ${customerName || 'Customer'} (${customerId || 'N/A'})
Card: ${maskedPan || '**** **** **** ****'}
Scheme: ${cardScheme || 'UNKNOWN'}
Type: ${cardType || 'VIRTUAL'}
Expiry: ${expiry || 'MM/YYYY'}
${flutterwaveEnabled ? 'Flutterwave: Enabled' : ''}
${isReissuance ? 'Replacement: Yes (Lost/Stolen Card)' : ''}

Fee Breakdown:
- Issuance Fee: ₦${(feeAmount || 0).toFixed(2)}
${(vatAmount || 0) > 0 ? `- VAT: ₦${(vatAmount || 0).toFixed(2)}` : ''}
- Total Deducted: ₦${(totalDeduction || 0).toFixed(2)}

Please login to the admin portal to approve or reject this request.
    `;

    let transporter;
    try {
      const emailModule = await import('../config/email.js');
      transporter = emailModule.transporter;
    } catch (e) {
      console.log('📧 Email transporter not available');
    }

    if (transporter) {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@banking-system.com',
        to: approverEmail,
        ...(customerEmail && { cc: customerEmail }),
        subject: subject,
        html: html,
        text: text
      });
      console.log(`📧 Notification sent for card #${cardId} to ${approverEmail}`);
    } else {
      console.log('📧 EMAIL (transporter not configured):', {
        to: approverEmail,
        subject: subject,
        body: text
      });
    }

    return true;

  } catch (error) {
    console.error('❌ Failed to send card pending notification:', error.message);
    return false;
  }
};

// ================================================================
// ✅ EXECUTE CARD ISSUANCE FROM APPROVAL - UPDATED WITH ENCRYPTION
// ================================================================

/**
 * Execute card issuance from an approved approval request
 * This is called by the approval workflow when all approvals are completed
 * 
 * @param {Object} approvalRequest - The approved CardApprovalRequest instance
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<Object>} Card issuance result with cardLast4 included
 */
export const executeCardIssuanceFromApproval = async (approvalRequest, transaction) => {
  // ✅ Parse cardData if it's a string
  let cardData = approvalRequest.cardData;
  if (typeof cardData === 'string') {
    try {
      cardData = JSON.parse(cardData);
    } catch (e) {
      console.error('❌ Could not parse cardData:', e.message);
      cardData = {};
    }
  }
  
  // ✅ Parse feeDetails if it's a string
  let feeDetails = approvalRequest.feeDetails;
  if (typeof feeDetails === 'string') {
    try {
      feeDetails = JSON.parse(feeDetails);
    } catch (e) {
      console.error('❌ Could not parse feeDetails:', e.message);
      feeDetails = {};
    }
  }

  // ✅ Get values from multiple sources with proper fallbacks
  const customerId = cardData?.customerId || approvalRequest.customerId;
  const accountNumber = cardData?.accountNumber || approvalRequest.accountNumber;
  const accountId = cardData?.accountId || approvalRequest.accountId;
  
  console.log('📋 Extracted card data:', {
    customerId,
    accountNumber,
    accountId,
    cardDataCustomerId: cardData?.customerId,
    approvalRequestCustomerId: approvalRequest.customerId,
    cardDataAccountNumber: cardData?.accountNumber,
    approvalRequestAccountNumber: approvalRequest.accountNumber
  });

  // ✅ Validate required fields
  if (!customerId) {
    console.error('❌ Missing customerId. cardData:', cardData, 'approvalRequest:', approvalRequest);
    throw new Error('Customer ID is required for card issuance');
  }
  
  if (!accountNumber) {
    console.error('❌ Missing accountNumber. cardData:', cardData, 'approvalRequest:', approvalRequest);
    throw new Error('Account number is required for card issuance');
  }

  // Destructure cardData with fallbacks
  const cardType = cardData?.cardType || 'VIRTUAL';
  const cardScheme = cardData?.cardScheme || 'VERVE';
  const enableFlutterwave = cardData?.enableFlutterwave || false;
  const existingCardId = cardData?.existingCardId || null;
  const branchCode = cardData?.branchCode || approvalRequest.branchCode || '101';
  const pan = cardData?.pan;
  const bin = cardData?.bin;
  const expiryMonth = cardData?.expiryMonth;
  const expiryYear = cardData?.expiryYear;
  const hashedCVV = cardData?.cvv;
  const existingEncryptedCVV = cardData?.encryptedCVV;
  const existingCvvNonce = cardData?.cvvNonce;
  const cardBinInfo = cardData?.binInfo;
  const cardDataLast4 = cardData?.cardLast4;

  // Destructure feeDetails with fallbacks
  const feeAmount = feeDetails?.feeAmount || 0;
  const vatAmount = feeDetails?.vatAmount || 0;
  const totalAmount = feeDetails?.totalAmount || 0;
  const creditGlAccount = feeDetails?.creditGlAccount || '01***441400001';
  const vatGLAccountNo = feeDetails?.vatGLAccountNo || '01***441500001';

  console.log('🔧 Executing card issuance from approval request:', {
    approvalRequestId: approvalRequest.id,
    customerId,
    accountNumber,
    accountId,
    cardType,
    cardScheme,
    enableFlutterwave,
    totalAmount
  });

  // Resolve GL accounts
  const resolvedCreditGlAccount = resolveGLAccount(creditGlAccount, branchCode);
  const resolvedVatGlAccount = resolveGLAccount(vatGLAccountNo, branchCode);

  console.log('💰 GL Account Resolution:', {
    creditGlAccount,
    resolvedCreditGlAccount,
    vatGLAccountNo,
    resolvedVatGlAccount,
    branchCode
  });

  // Get customer account
  const customerAccount = await CustomerAccount.findOne({
    where: {
      account_number: accountNumber,
      CUST_ID: customerId,
      status: 'ACTIVE'
    },
    transaction,
    lock: true
  });

  if (!customerAccount) {
    console.error('❌ Customer account not found:', { accountNumber, customerId });
    throw new Error(`Customer account not found or not active for account: ${accountNumber}, customer: ${customerId}`);
  }

  console.log('✅ Customer account found:', {
    id: customerAccount.id,
    account_number: customerAccount.account_number,
    account_name: customerAccount.account_name,
    available_balance: customerAccount.available_balance
  });

  // Handle reissuance - cancel existing card if any
  let existingCard = null;
  if (existingCardId) {
    existingCard = await DebitCard.findByPk(existingCardId, { transaction, lock: true });
    if (existingCard) {
      await existingCard.update({
        blockReason: `REPLACED (was ${existingCard.blockReason})`,
        cardStatus: 'CANCELLED'
      }, { transaction });
      console.log(`✅ Replaced existing card ${existingCard.id} (${existingCard.cardLast4})`);
    }
  }

  // Generate card details if not already provided
  const schemeBinMap = {
    'VERVE': '506099',
    'VISA': '4',
    'MASTERCARD': '5',
    'AMEX': '34',
    'DISCOVER': '6'
  };
  const binPrefix = schemeBinMap[cardScheme] || '506099';
  
  // ✅ Generate a 16-digit card number (not PAN - PAN is a tax identifier)
  const finalCardNumber = pan || await generateCardNumber(binPrefix, 16, transaction);
  const finalBin = bin || finalCardNumber.slice(0, 6);
  const finalExpiryMonth = expiryMonth || (new Date().getMonth() + 1).toString().padStart(2, '0');
  const finalExpiryYear = expiryYear || (new Date().getFullYear() + 3).toString();
  const finalCardLast4 = cardDataLast4 || finalCardNumber.slice(-4);
  
  // Generate CVV (3-4 digits)
  const finalCvv = Math.floor(100 + Math.random() * 900).toString();
  console.log(`🔐 Generated CVV: ${finalCvv}`);
  
  // ✅ Hash CVV using SHA-256
  const finalHashedCVV = hashedCVV || crypto.createHash('sha256').update(finalCvv).digest('hex');
  console.log(`🔐 CVV Hash: ${finalHashedCVV}`);
  
  // ✅ ALWAYS encrypt CVV for storage
  let finalEncryptedCVV = existingEncryptedCVV;
  let finalCvvNonce = existingCvvNonce;
  
  // ✅ Check encryption status
  const encStatus = checkEncryptionStatus();
  console.log('🔐 Encryption status:', encStatus);
  
  try {
    // Always encrypt the CVV for secure storage
    const result = encryptCVV(finalCvv);
    if (result) {
      finalEncryptedCVV = result.encrypted;
      finalCvvNonce = result.nonce;
      console.log(`🔐 CVV encrypted successfully with ${result.method}`);
      console.log(`🔐 Encrypted CVV: ${finalEncryptedCVV}`);
      console.log(`🔐 CVV Nonce: ${finalCvvNonce}`);
      
      // ✅ Verify we can decrypt it (self-test)
      try {
        const testDecrypt = decryptCVV(finalEncryptedCVV, finalCvvNonce);
        if (testDecrypt === finalCvv) {
          console.log(`✅ CVV encryption verification passed`);
        } else {
          console.warn(`⚠️ CVV encryption verification failed - decrypted value doesn't match`);
          console.warn(`   Expected: ${finalCvv}, Got: ${testDecrypt}`);
        }
      } catch (decryptError) {
        console.warn(`⚠️ Could not verify CVV decryption:`, decryptError.message);
      }
    } else {
      console.error('❌ CVV encryption returned null - check encryption keys');
      finalEncryptedCVV = null;
      finalCvvNonce = null;
    }
  } catch (error) {
    console.error('❌ CVV encryption failed:', error.message);
    finalEncryptedCVV = null;
    finalCvvNonce = null;
  }

  // Get BIN info
  const BinInfo = getModel('BinInfo');
  let binInfo = { bank_name: 'Unknown', country: 'Unknown', network: 'Unknown', card_type: 'Unknown' };
  if (BinInfo) {
    try {
      const binRecord = await BinInfo.findOne({
        where: { bin: finalBin },
        transaction
      });
      if (binRecord) {
        binInfo = {
          bank_name: binRecord.bank_name || 'Unknown',
          country: binRecord.country || 'Unknown',
          network: binRecord.network || 'Unknown',
          card_type: binRecord.card_type || 'Unknown'
        };
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch BIN info:', error.message);
    }
  }

  // ✅ Create the card with proper encryption
  const card = await DebitCard.create({
    customerId: customerId,
    accountId: customerAccount.id,
    cardPan: finalCardNumber,  // This is the card number, not a tax PAN
    cardHolderName: customerAccount.account_name || 'Card Holder',
    expiryMonth: finalExpiryMonth,
    expiryYear: finalExpiryYear,
    cvvHash: finalHashedCVV,
    encryptedCvv: finalEncryptedCVV,
    cvvNonce: finalCvvNonce,
    cardType: cardType || 'VIRTUAL',
    cardScheme: cardScheme || binInfo.network || 'VERVE',
    cardStatus: 'ISSUED',
    issuedBy: approvalRequest.approvedBy || approvalRequest.requestedBy,
    issuedAt: new Date(),
    cardLast4: finalCardLast4,
    cardBin: finalBin,
    binBankName: binInfo.bank_name,
    binCountry: binInfo.country,
    binNetwork: binInfo.network,
    binCardType: binInfo.card_type,
    flutterwaveEnabled: enableFlutterwave && !!finalEncryptedCVV,
    lastUsedAt: null,
    approvalRequestId: approvalRequest.id
  }, { transaction });

  console.log(`✅ Card created: ID ${card.id}, Last4 ${card.cardLast4}`);
  console.log(`✅ Flutterwave Enabled: ${card.flutterwaveEnabled}`);
  console.log(`✅ Encrypted CVV: ${card.encryptedCvv ? 'SET (' + card.encryptedCvv.length + ' chars)' : 'MISSING'}`);
  console.log(`✅ CVV Hash: ${card.cvvHash ? 'SET' : 'MISSING'}`);
  console.log(`✅ CVV Nonce: ${card.cvvNonce ? 'SET' : 'MISSING'}`);

  // Deduct balances
  const currentBalAvailable = parseFloat(customerAccount.available_balance || 0);
  const currentBalCurrent = parseFloat(customerAccount.current_balance || 0);
  const currentBalLedger = parseFloat(customerAccount.ledger_balance || 0);
  const currentBalCleared = parseFloat(customerAccount.cleared_balance || 0);

  const newAvailable = currentBalAvailable - totalAmount;
  const newCurrent = currentBalCurrent - totalAmount;
  const newLedger = currentBalLedger - totalAmount;
  const newCleared = currentBalCleared - totalAmount;

  await customerAccount.update({
    available_balance: newAvailable,
    current_balance: newCurrent,
    ledger_balance: newLedger,
    cleared_balance: newCleared,
    last_transaction_date: new Date()
  }, { transaction });

  console.log(`💰 Balance updated: Deducted ${totalAmount} from account ${accountNumber}`);

  // Create fee transaction
  const getNextTransactionId = async () => {
    const lastTx = await Transaction.findOne({
      order: [['TRANSACTION_IDENTIFIER', 'DESC']],
      attributes: ['TRANSACTION_IDENTIFIER'],
      transaction
    });
    return (lastTx?.TRANSACTION_IDENTIFIER || 0) + 1;
  };

  const txIdentifier = await getNextTransactionId();

  // Main fee transaction
  await Transaction.create({
    ACCT_NO: customerAccount.account_number,
    ACCT_ID: String(customerAccount.id),
    BU_ID: customerAccount.bu_id || 1,
    CUST_ID: String(customerAccount.CUST_ID),
    ACCT_NM: customerAccount.account_name,
    AMOUNT: feeAmount,
    transactionDirection: 'DEBIT',
    TRANSACTION_TYPE: 'CARD_ISSUANCE_FEE',
    TRANSACTION_IDENTIFIER: txIdentifier,
    EVENT_ID: txIdentifier,
    TRAN_JOURNAL_ID: `JRN_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    TRANSACTION_ID: `TXN_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    REFERENCE: `CARD_ISSUE_${card.id}_${Date.now()}`,
    description: `Card issuance fee for card ${card.id} (Approval: ${approvalRequest.id})`,
    status: 'COMPLETED',
    currency: customerAccount.currency || 'NGN',
    createdBy: approvalRequest.approvedBy || approvalRequest.requestedBy,
    debitAccount: customerAccount.account_number,
    creditAccount: resolvedCreditGlAccount
  }, { transaction });

  // VAT transaction if applicable
  if (vatAmount > 0) {
    const vatTxIdentifier = await getNextTransactionId() + 1;
    await Transaction.create({
      ACCT_NO: customerAccount.account_number,
      ACCT_ID: String(customerAccount.id),
      BU_ID: customerAccount.bu_id || 1,
      CUST_ID: String(customerAccount.CUST_ID),
      ACCT_NM: customerAccount.account_name,
      AMOUNT: vatAmount,
      transactionDirection: 'DEBIT',
      TRANSACTION_TYPE: 'VAT_CARD_ISSUANCE',
      TRANSACTION_IDENTIFIER: vatTxIdentifier,
      EVENT_ID: vatTxIdentifier,
      TRAN_JOURNAL_ID: `JRN_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      TRANSACTION_ID: `TXN_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      REFERENCE: `CARD_ISSUE_VAT_${card.id}_${Date.now()}`,
      description: `VAT on card issuance for card ${card.id} (Approval: ${approvalRequest.id})`,
      status: 'COMPLETED',
      currency: customerAccount.currency || 'NGN',
      createdBy: approvalRequest.approvedBy || approvalRequest.requestedBy,
      debitAccount: customerAccount.account_number,
      creditAccount: resolvedVatGlAccount
    }, { transaction });
  }

  // Update approval request with card details
  await approvalRequest.update({
    cardData: {
      ...approvalRequest.cardData,
      cardId: card.id,
      cardLast4: card.cardLast4,
      maskedPan: `**** **** **** ${card.cardLast4}`,
      expiry: `${finalExpiryMonth}/${finalExpiryYear}`,
      cardStatus: card.cardStatus,
      executedAt: new Date(),
      glEntriesPosted: true,
      glJournalId: `GL_JRN_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      resolvedCreditGlAccount,
      resolvedVatGlAccount,
      flutterwaveEnabled: card.flutterwaveEnabled,
      hasEncryptedCVV: !!card.encryptedCvv,
      hasCvvHash: !!card.cvvHash,
      encryptionMethod: finalEncryptedCVV ? 'ENCRYPTED' : 'NONE'
    }
  }, { transaction });

  console.log(`✅ Approval request ${approvalRequest.id} updated with card details`);

  // ✅ Return all card details
  return {
    cardId: card.id,
    cardLast4: card.cardLast4,
    maskedPan: `**** **** **** ${card.cardLast4}`,
    expiry: `${finalExpiryMonth}/${finalExpiryYear}`,
    cvv: finalCvv,
    cardScheme: card.cardScheme,
    cardType: card.cardType,
    cardStatus: card.cardStatus,
    feeCharged: feeAmount,
    vatCharged: vatAmount,
    totalCharged: totalAmount,
    flutterwaveEnabled: card.flutterwaveEnabled,
    hasEncryptedCVV: !!card.encryptedCvv,
    hasCvvHash: !!card.cvvHash,
    bankName: binInfo.bank_name,
    country: binInfo.country,
    network: binInfo.network,
    isReissuance: !!existingCard,
    replacedCardId: existingCard?.id || null,
    glJournalId: `GL_JRN_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    resolvedCreditGlAccount,
    resolvedVatGlAccount,
    message: existingCard 
      ? `Replacement card issued. Old card (${existingCard.cardLast4}) has been cancelled.` 
      : `Card issued successfully. Please set a PIN before first use.`
  };
};

// ==================== REMAINING ORIGINAL FUNCTIONS ====================

// ==================== FLUTTERWAVE CARD PAYMENT ====================

export const cardPayment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const ipAddress = getClientIp(req);
    
    const {
      cardId,
      customerId,
      amount,
      currency = 'NGN',
      reference,
      redirectUrl,
      metadata = {}
    } = req.body;

    if (!cardId && !customerId) {
      return res.status(400).json({
        success: false,
        message: 'Either cardId or customerId is required'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    if (cardId) {
      const card = await DebitCard.findByPk(cardId, {
        include: [{ model: CustomerAccount, as: 'customerAccount' }]
      });

      if (!card) {
        return res.status(404).json({
          success: false,
          message: 'Card not found'
        });
      }

      if (!card.flutterwaveEnabled) {
        return res.status(400).json({
          success: false,
          message: 'Card is not enabled for Flutterwave payments'
        });
      }

      if (card.cardStatus !== 'ACTIVE' && card.cardStatus !== 'ISSUED') {
        return res.status(400).json({
          success: false,
          message: `Card status ${card.cardStatus} - cannot process payment`
        });
      }

      const now = new Date();
      const expiryDate = new Date(parseInt(card.expiryYear), parseInt(card.expiryMonth) - 1);
      if (now > expiryDate) {
        return res.status(400).json({
          success: false,
          message: 'Card has expired'
        });
      }

      let cvv = null;
      if (card.encryptedCvv) {
        try {
          console.log('🔐 Decrypting CVV for card:', card.cardLast4);
          cvv = decryptStoredCVV(card.encryptedCvv);
          if (cvv) {
            console.log('✅ CVV decrypted successfully');
          } else {
            console.warn('⚠️ CVV decryption returned null');
          }
        } catch (error) {
          console.error('❌ Failed to decrypt CVV:', error.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to decrypt card CVV',
            error: error.message
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Card does not have encrypted CVV for Flutterwave payments'
        });
      }

      if (!cvv) {
        return res.status(400).json({
          success: false,
          message: 'Unable to retrieve CVV for payment'
        });
      }

      const customerEmail = card.customerAccount?.email || 'customer@example.com';

      const paymentData = {
        cardNumber: card.cardPan,
        cvv: cvv,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        email: customerEmail,
        amount: Number(amount),
        currency: currency,
        reference: reference || `FLW-${Date.now()}-${card.id}`,
        redirectUrl: redirectUrl || process.env.FLUTTERWAVE_CALLBACK_URL || process.env.FLW_CALLBACK_URL,
        metadata: {
          ...metadata,
          card_id: card.id,
          card_last4: card.cardLast4,
          card_scheme: card.cardScheme,
          source: 'evolution_banking',
          payment_method: 'debit_card',
          customer_id: card.customerId,
          account_number: card.customerAccount?.account_number
        }
      };

      console.log('💳 Initiating Flutterwave payment for card:', {
        cardId: card.id,
        cardLast4: card.cardLast4,
        amount: paymentData.amount,
        currency: paymentData.currency,
        customer: customerEmail
      });

      await logAuditTrail(
        'DEBIT_CARD',
        card.id,
        userId,
        'FLUTTERWAVE_PAYMENT_INITIATED',
        null,
        {
          card_last4: card.cardLast4,
          amount: amount,
          currency: currency,
          reference: paymentData.reference
        },
        ipAddress,
        'CARD_MANAGEMENT',
        { branch: req.user?.branch || 1 }
      );

      const result = await chargeCard(paymentData);

      if (!result || !result.success) {
        throw new Error(result?.message || 'Payment initiation failed');
      }

      await card.update({
        lastUsedAt: new Date()
      });

      await logAuditTrail(
        'DEBIT_CARD',
        card.id,
        userId,
        'FLUTTERWAVE_PAYMENT_SUCCESS',
        null,
        {
          card_last4: card.cardLast4,
          amount: amount,
          reference: paymentData.reference,
          flutterwave_reference: result.data?.id
        },
        ipAddress,
        'CARD_MANAGEMENT',
        { branch: req.user?.branch || 1 }
      );

      return res.status(200).json({
        success: true,
        message: 'Payment initiated successfully',
        data: {
          reference: result.reference,
          flutterwave_ref: result.data?.id,
          status: result.data?.status,
          payment_method_id: result.payment_method_id,
          requires_auth: !!result.data?.next_action,
          next_action: result.data?.next_action,
          redirect_url: result.data?.redirect_url,
          transaction_details: result.data
        }
      });

    } else if (customerId) {
      const card = await DebitCard.findOne({
        where: {
          customerId: customerId,
          flutterwaveEnabled: true,
          cardStatus: ['ACTIVE', 'ISSUED']
        },
        include: [{ model: CustomerAccount, as: 'customerAccount' }]
      });

      if (!card) {
        return res.status(404).json({
          success: false,
          message: 'No active Flutterwave-enabled card found for this customer'
        });
      }

      req.body.cardId = card.id;
      return cardPayment(req, res);
    }

  } catch (error) {
    console.error('❌ Card payment error:', error);
    
    await logAuditTrail(
      'DEBIT_CARD',
      req.body?.cardId || req.body?.customerId || 'unknown',
      getUserId(req),
      'FLUTTERWAVE_PAYMENT_FAILED',
      null,
      {
        error: error.message,
        amount: req.body?.amount,
        currency: req.body?.currency
      },
      getClientIp(req),
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );

    return res.status(500).json({
      success: false,
      message: 'Payment processing failed',
      error: error.message,
      details: error.details || null
    });
  }
};

// ==================== VERIFY FLUTTERWAVE PAYMENT ====================

export const verifyFlutterwavePayment = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required'
      });
    }

    const result = await verifyTransaction(reference);

    return res.status(200).json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('❌ Payment verification error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Verification failed'
    });
  }
};

// ==================== REFUND FLUTTERWAVE PAYMENT ====================

export const refundFlutterwavePayment = async (req, res) => {
  try {
    const { reference, amount, reason } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required'
      });
    }

    const result = await refundTransaction(reference, amount, reason);

    return res.status(200).json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('❌ Refund error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Refund failed'
    });
  }
};

// ==================== GET FLUTTERWAVE TRANSACTION STATUS ====================

export const getFlutterwaveTransactionStatus = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required'
      });
    }

    const result = await getTransactionStatus(reference);

    return res.status(200).json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('❌ Status check error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to check transaction status'
    });
  }
};

// ==================== LIST FLUTTERWAVE TRANSACTIONS ====================

export const listFlutterwaveTransactions = async (req, res) => {
  try {
    const { page, limit, status, email } = req.query;

    const result = await listTransactions({
      page: page || 1,
      limit: limit || 20,
      status: status || undefined,
      email: email || undefined
    });

    return res.status(200).json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('❌ List transactions error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to list transactions'
    });
  }
};

// ==================== FLUTTERWAVE HEALTH CHECK ====================

export const flutterwaveHealthCheck = async (req, res) => {
  try {
    const result = await healthCheck();

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Health check error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Health check failed'
    });
  }
};

// ==================== CARD MANAGEMENT FUNCTIONS ====================

export const getCustomerCards = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { customerId } = req.params;

  try {
    const user = req.user;
    const roleId = user?.roleId || user?.BU_ROLE_ID || user?.role_id || user?.id;
    const isAdmin = user?.isAdmin === true || 
                    parseInt(roleId) === 1 || 
                    user?.role === 'Administrator' ||
                    user?.BU_ROLE_ID === '1';
    
    let hasFullAccess = isAdmin;
    if (!hasFullAccess) {
      try {
        hasFullAccess = await roleHasPermission(roleId, 'debit_card.print');
      } catch (permError) {
        hasFullAccess = false;
      }
    }

    let attributes = [
      'id', 
      'cardLast4', 
      'cardType', 
      'cardScheme',
      'cardStatus', 
      'expiryMonth', 
      'expiryYear', 
      'dailyLimit', 
      'perTransactionLimit',
      'flutterwaveEnabled',
      'lastUsedAt'
    ];

    if (hasFullAccess) {
      attributes.push('cardPan');
    }

    const cards = await DebitCard.findAll({
      where: { customerId: customerId },
      attributes: attributes
    });

    const maskedCards = cards.map(card => {
      const cardData = card.toJSON ? card.toJSON() : card;
      if (cardData.cardPan && !hasFullAccess) {
        const pan = cardData.cardPan;
        cardData.cardPan = `**** **** **** ${pan.slice(-4)}`;
      }
      if (!cardData.cardPan) {
        cardData.cardPan = `**** **** **** ${cardData.cardLast4 || '****'}`;
      }
      return cardData;
    });

    await logAuditTrail(
      'DEBIT_CARD',
      customerId,
      userId,
      'VIEW_CARDS',
      null,
      { 
        count: cards.length,
        includesPan: hasFullAccess
      },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: req.user?.branch || 1 }
    );

    return res.status(200).json({ 
      success: true, 
      data: maskedCards,
      meta: {
        includesFullPan: hasFullAccess,
        cardCount: maskedCards.length
      }
    });
  } catch (error) {
    console.error('❌ Error getting customer cards:', error.message);
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

export const setDailyLimit = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { accountNumber, last4, dailyLimit } = req.body;

  try {
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

    const oldLimit = card.dailyLimit;
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

export const setPerTransactionLimit = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { last4, customerId, perTransactionLimit } = req.body;

  try {
    if (!last4) {
      return res.status(400).json({ success: false, error: 'last4 is required (4 digits)' });
    }
    if (!/^\d{4}$/.test(last4)) {
      return res.status(400).json({ success: false, error: 'last4 must be exactly 4 digits' });
    }

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

    const whereClause = { cardLast4: last4 };
    if (customerId) {
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
    await card.update({ perTransactionLimit: limit });

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

export const setCardPin = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { last4, pin, customerId, cardPan, cardId } = req.body;

  try {
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ success: false, error: 'PIN must be 4 digits' });
    }

    let whereClause = {};

    if (cardId) {
      whereClause.id = cardId;
    } else if (cardPan) {
      whereClause.cardPan = cardPan;
    } else if (last4) {
      if (!/^\d{4}$/.test(last4)) {
        return res.status(400).json({ success: false, error: 'Last 4 digits must be 4 digits' });
      }
      whereClause.cardLast4 = last4;

      let foundCustomerId = customerId || req.user?.customerId || req.user?.CUST_ID;
      
      if (foundCustomerId) {
        const parsedId = parseInt(foundCustomerId, 10);
        if (!isNaN(parsedId)) {
          whereClause.customerId = parsedId;
        } else {
          whereClause.customerId = foundCustomerId;
        }
      }
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Please provide cardId, cardPan, or last4 with customerId' 
      });
    }

    console.log('🔍 Searching for card with:', whereClause);

    const card = await DebitCard.findOne({ where: whereClause });

    if (!card) {
      return res.status(404).json({
        success: false,
        error: 'Card not found. Check the provided details.',
        debug: { whereClause }
      });
    }

    console.log('✅ Card found:', {
      id: card.id,
      cardLast4: card.cardLast4,
      cardStatus: card.cardStatus,
      customerId: card.customerId
    });

    const oldStatus = card.cardStatus;
    const hashedPin = crypto.createHash('sha256').update(pin).digest('hex');
    
    await card.update({
      pinHash: hashedPin,
      cardStatus: 'ACTIVE',
      activatedAt: new Date()
    });

    await logAuditTrail(
      'DEBIT_CARD',
      card.id,
      userId,
      'SET_PIN',
      { card_status: oldStatus },
      { 
        card_status: 'ACTIVE', 
        card_last4: card.cardLast4, 
        pin_set: true,
        activated_at: new Date().toISOString()
      },
      ipAddress,
      'CARD_SECURITY',
      { branch: req.user?.branch || 1 }
    );

    return res.status(200).json({ 
      success: true, 
      message: 'PIN set successfully. Card is now ACTIVE.',
      data: {
        cardId: card.id,
        cardLast4: card.cardLast4,
        cardStatus: 'ACTIVE',
        flutterwaveEnabled: card.flutterwaveEnabled
      }
    });

  } catch (error) {
    console.error('❌ Set PIN error:', error.message);
    
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
    
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

export const blockCard = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { accountNumber, last4, reason } = req.body;

  try {
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

export const unblockCard = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { accountNumber, last4, reason } = req.body;

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
      unblockReason: unblockReason
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

export const getCardTransactionHistory = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { accountNumber, last4, limit = 20, offset = 0 } = req.query;

  try {
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

    const whereClause = { ACCT_NO: customerAccount.account_number };

    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    const { count, rows: transactions } = await Transaction.findAndCountAll({
      where: whereClause,
      order: [['id', 'DESC']],
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
          cardScheme: card.cardScheme,
          cardStatus: card.cardStatus,
          flutterwaveEnabled: card.flutterwaveEnabled
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

export const cardPurchase = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);
  const { cardPan, amount, merchantInfo, txRef } = req.body;

  try {
    if (!cardPan) {
      return res.status(400).json({ success: false, error: 'cardPan is required' });
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amount is required' });
    }
    const txAmount = parseFloat(amount);

    const card = await DebitCard.findOne({ where: { cardPan } });
    if (!card) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }

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
      const today = new Date().toISOString().slice(0, 10);
      if (card.lastResetDate !== today) {
        card.dailySpentToday = 0;
        card.lastResetDate = today;
      }
      card.dailySpentToday = (card.dailySpentToday || 0) + txAmount;
      card.lastUsedAt = new Date();
      await card.save({ transaction: dbTransaction });

      const customerAccount = await CustomerAccount.findOne({
        where: { id: card.accountId },
        transaction: dbTransaction,
        lock: true
      });
      if (!customerAccount) {
        throw new Error('Associated account not found');
      }

      const currentAvailable = parseFloat(customerAccount.available_balance);
      if (currentAvailable < txAmount) {
        throw new Error('Insufficient balance');
      }

      const currentBalAvailable = parseFloat(customerAccount.available_balance || 0);
      const currentBalCurrent = parseFloat(customerAccount.current_balance || 0);
      const currentBalLedger = parseFloat(customerAccount.ledger_balance || 0);
      const currentBalCleared = parseFloat(customerAccount.cleared_balance || 0);

      const newAvailable = currentBalAvailable - txAmount;
      const newCurrent = currentBalCurrent - txAmount;
      const newLedger = currentBalLedger - txAmount;
      const newCleared = currentBalCleared - txAmount;

      await customerAccount.update({
        available_balance: newAvailable,
        current_balance: newCurrent,
        ledger_balance: newLedger,
        cleared_balance: newCleared,
        last_transaction_date: new Date()
      }, { transaction: dbTransaction });

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

      const transactionRecord = await Transaction.create({
        ACCT_NO: customerAccount.account_number,
        ACCT_ID: String(customerAccount.id),
        BU_ID: customerAccount.bu_id || 1,
        CUST_ID: String(customerAccount.CUST_ID),
        ACCT_NM: customerAccount.account_name,
        AMOUNT: txAmount,
        transactionDirection: 'DEBIT',
        TRANSACTION_TYPE: 'CARD_PURCHASE',
        TRANSACTION_IDENTIFIER: txIdentifier,
        EVENT_ID: txIdentifier,
        TRAN_JOURNAL_ID: journalId,
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
          merchant_location: merchantInfo?.location,
          flutterwave_enabled: card.flutterwaveEnabled
        }
      }, { transaction: dbTransaction });

      await dbTransaction.commit();

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

// ============================================
// 9. ISSUE CARD DIRECTLY (Bypass Approval)
// ============================================
export const issueCardDirectly = async (req, res) => {
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);

  try {
    // ✅ Import and call issueCard from DebitCardController
    const { issueCard } = await import('./DebitCardController.js');
    return await issueCard(req, res);

  } catch (error) {
    console.error('❌ Error in issueCardDirectly:', error.message);
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// ==================== EXPORT ALL FUNCTIONS ====================

 export {
   getCardIssuanceCharge,
//   getCardDetailsForPrinting,
//   requestCardIssuance,
//   issueCard,
//   sendCardPendingNotification,
//   executeCardIssuanceFromApproval,
//   cardPayment,
//   verifyFlutterwavePayment,
//   refundFlutterwavePayment,
//   getFlutterwaveTransactionStatus,
//   listFlutterwaveTransactions,
//   flutterwaveHealthCheck,
//   getCustomerCards,
//   setDailyLimit,
//   setPerTransactionLimit,
//   setCardPin,
//   blockCard,
//   unblockCard,
//   getCardTransactionHistory,
//   cardPurchase,
//   issueCardDirectly
};