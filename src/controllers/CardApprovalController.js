// controllers/CardApprovalController.js
import { Op } from 'sequelize';
import CardApprovalRequest from '../models/CardApprovalRequest.js';
import ApprovalWorkflowConfig from '../models/ApprovalWorkflowConfig.js';
import Customer from '../models/Customer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import DebitCard from '../models/DebitCard.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { ROLES } from '../utils/roleConstants.js';
import { logAuditTrail } from '../utils/auditLogger.js';
import crypto from 'crypto';
import sequelize from '../../config/db.js';

// ✅ Import from DebitCardController for card issuance execution and fee details
import { 
    executeCardIssuanceFromApproval,
    getCardIssuanceCharge,  // ✅ Import the existing function
    issueCard
} from './DebitCardController.js';

// ============================================
// GL ACCOUNT HELPER FUNCTIONS
// ============================================

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

/**
 * Check if a GL account is valid
 */
function isValidGLAccount(glAccount) {
  if (!glAccount) return false;
  if (glAccount === 'NONE') return false;
  if (glAccount.includes('***')) return true;
  return glAccount.length >= 10;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get user ID from request
 */
const getUserId = (req) => {
  if (!req.user) return 'system';
  return req.user.username || req.user.user_name || req.user.id || req.user.userId || req.user.user_id || 'system';
};

/**
 * Get client IP from request
 */
const getClientIp = (req) => req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '127.0.0.1';

/**
 * Get model helper - ✅ FIXED
 */
const getModel = (modelName) => {
  try {
    if (sequelize.models && sequelize.models[modelName]) {
      return sequelize.models[modelName];
    }
    console.warn(`⚠️ Model ${modelName} not found`);
    return null;
  } catch (error) {
    console.warn(`⚠️ Error getting model ${modelName}:`, error.message);
    return null;
  }
};

/**
 * Get list of users who can approve card requests
 */
const getApprovers = async () => {
  try {
    const UserModel = getModel('User');
    if (!UserModel) {
      return [{ email: process.env.DEFAULT_APPROVER_EMAIL || 'admin@bank.com', name: 'Default Approver' }];
    }
    
    const approvers = await UserModel.findAll({
      where: {
        role: ['ADMIN', 'MANAGER', 'CARD_APPROVER'],
        status: 'ACTIVE'
      },
      attributes: ['id', 'email', 'username', 'user_name', 'name']
    });

    return approvers.length > 0 
      ? approvers.map(user => ({
          email: user.email,
          name: user.username || user.user_name || user.name || 'Approver'
        }))
      : [{ email: process.env.DEFAULT_APPROVER_EMAIL || 'admin@bank.com', name: 'Default Approver' }];

  } catch (error) {
    console.error('Failed to get approvers:', error.message);
    return [{ email: process.env.DEFAULT_APPROVER_EMAIL || 'admin@bank.com', name: 'Default Approver' }];
  }
};

/**
 * Generate a card number
 */
const generateCardNumber = async (binPrefix, length = 16, transaction = null) => {
    let cardNumber = binPrefix;
    while (cardNumber.length < length - 1) {
        cardNumber += Math.floor(Math.random() * 10).toString();
    }
    cardNumber += Math.floor(Math.random() * 10).toString();
    return cardNumber;
};

/**
 * Check if user is an approver
 */
const isUserApprover = async (userId, request) => {
    const UserModel = getModel('User');
    if (!UserModel) return false;
    
    const user = await UserModel.findByPk(userId);
    if (!user) return false;
    
    const adminRoles = [ROLES.ADMINISTRATOR, ROLES.CHIEF_EXECUTIVE_OFFICER];
    return adminRoles.includes(user.roleId);
};

/**
 * Notify approvers (placeholder)
 */
const notifyApprovers = async (approvalRequest, workflowConfig) => {
    console.log(`📧 Notifying approvers for request ${approvalRequest.id}`);
};

/**
 * Notify next approver (placeholder)
 */
const notifyNextApprover = async (approvalRequest, workflowConfig, nextLevel) => {
    console.log(`📧 Notifying next approver for request ${approvalRequest.id}, level ${nextLevel + 1}`);
};

/**
 * Notify requester (placeholder)
 */
const notifyRequester = async (approvalRequest, status, reason = null) => {
    console.log(`📧 Notifying requester for request ${approvalRequest.id}: ${status}`);
};

// ============================================
// 1. REQUEST CARD ISSUANCE
// ============================================
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
      priority = 'medium'
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

    // 2. Check existing cards
    const existingCards = await DebitCard.findAll({
      where: { customerId: customerId },
      transaction,
      lock: true
    });

    let isReissuance = false;
    let existingCard = null;

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
      }
    }

    // 3. Get fee details - ✅ USING THE IMPORTED FUNCTION FROM DebitCardController
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

    // 4. Check if user has direct approval authority (bypass)
    const bypassRoles = [1, 2, 3];
    const canBypass = bypassRoles.includes(parseInt(userRoleId));

    // 5. Check if auto-approve based on amount
    let needsApproval = true;
    if (totalDeduction < 5000) {
      needsApproval = false;
      console.log(`💰 Amount ${totalDeduction} below threshold, auto-approving`);
    }

    // 6. If can bypass or auto-approve, issue directly
    if (canBypass || !needsApproval) {
      console.log(`✅ Direct issuance: bypass=${canBypass}, auto-approve=${!needsApproval}`);
      await transaction.commit();
      transaction = null;
      return await issueCard(req, res);
    }

    // 7. Generate card details
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
        // ✅ Use the correct encryption function
        const { encryptFlutterwaveField } = await import('../utils/encryption.js');
        const nonce = crypto.randomBytes(6).toString('hex');
        encryptedCVV = encryptFlutterwaveField(cvv, nonce);
        cvvNonce = nonce;
        if (encryptedCVV) {
          console.log('🔐 CVV encrypted with Flutterwave-compatible format');
        }
      } catch (error) {
        console.warn('⚠️ Failed to encrypt CVV:', error.message);
      }
    }

    // Get BIN info
    let binInfo = { bank_name: 'Unknown', country: 'Unknown', network: 'Unknown', card_type: 'Unknown' };
    try {
      const [binRecord] = await sequelize.query(
        `SELECT bank_name, country, network, card_type FROM bin_info WHERE bin = :bin LIMIT 1`,
        {
          replacements: { bin },
          transaction,
          type: sequelize.QueryTypes.SELECT
        }
      );
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

    // 8. Prepare card data for approval
    const cardData = {
      customerId,
      accountNumber,
      accountId: customerAccount.id,
      cardType: cardType || 'VIRTUAL',
      cardScheme: cardScheme || 'VERVE',
      enableFlutterwave: flutterwaveEnabled,
      isReissuance,
      existingCardId: existingCard?.id || null,
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

    // 9. Create approval request
    let approvalRequest = null;
    try {
      const [tableExists] = await sequelize.query(
        `SELECT 1 FROM information_schema.tables 
         WHERE table_schema = DATABASE() 
         AND table_name = 'card_approval_requests'`,
        { transaction }
      );

      if (tableExists && tableExists.length > 0) {
        const CardApprovalRequestModel = getModel('CardApprovalRequest');
        if (CardApprovalRequestModel && typeof CardApprovalRequestModel.create === 'function') {
          approvalRequest = await CardApprovalRequestModel.create({
            requestType: isReissuance ? 'REISSUE' : 'ISSUE',
            customerId,
            accountNumber,
            accountId: customerAccount.id,
            cardData: JSON.stringify(cardData),
            feeDetails: JSON.stringify({
              feeAmount,
              vatRate: feeDetails.vatRate || 0,
              vatAmount,
              totalAmount: totalDeduction,
              creditGlAccount: feeDetails.creditGlAccount,
              vatGLAccountNo: feeDetails.vatGLAccountNo
            }),
            requestedBy: userId,
            requestedByRoleId: parseInt(userRoleId) || 29,
            branchCode: branchCode,
            organizationName: organizationName,
            branchName: branchName,
            ipAddress,
            isReissuance,
            existingCardId: existingCard?.id || null,
            approvalLevel: 0,
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }, { transaction });
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not create approval request:', error.message);
    }

    // If approval request creation failed, issue directly
    if (!approvalRequest) {
      console.log('⚠️ Approval request creation failed, issuing directly');
      await transaction.commit();
      transaction = null;
      req.body.customerId = customerId;
      req.body.accountNumber = accountNumber;
      req.body.cardType = cardType;
      req.body.cardScheme = cardScheme;
      req.body.enableFlutterwave = enableFlutterwave;
      req.body.organizationName = organizationName;
      req.body.branchName = branchName;
      return await issueCard(req, res);
    }

    await transaction.commit();
    transaction = null;

    // 10. Log audit trail
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
        isReissuance,
        hasEncryptedCVV: !!encryptedCVV,
        status: 'PENDING'
      },
      ipAddress,
      'CARD_MANAGEMENT',
      { branch: branchCode }
    );

    // 11. Send notification (non-blocking)
    try {
      const notificationService = await import('../services/NotificationService.js').then(m => m.default);
      await notificationService.sendApprovalNotification({
        itemType: isReissuance ? 'Card Reissuance' : 'Card Issuance',
        itemId: approvalRequest.id,
        itemName: `${cardType || 'Virtual'} Card for ${customerAccount.account_name || 'Customer'}`,
        description: `Request to ${isReissuance ? 'reissue' : 'issue'} a ${cardType || 'Virtual'} card (${cardScheme || 'VERVE'}) for account ${accountNumber}. Fee: ₦${totalDeduction}`,
        submittedBy: req.user?.user_name || userId,
        BU_ID: branchCode || userBU,
        priority: priority || 'medium',
        metadata: { 
          requestId: approvalRequest.id, 
          customerId, 
          accountNumber, 
          isReissuance, 
          feeAmount, 
          vatAmount, 
          totalDeduction, 
          cardType, 
          cardScheme, 
          flutterwaveEnabled 
        }
      });
    } catch (notifError) {
      console.warn('⚠️ Notification failed (non-blocking):', notifError.message);
    }

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
        hasEncryptedCVV: !!encryptedCVV
      }
    });

  } catch (error) {
    // ✅ Only rollback if transaction exists and is not finished
    if (transaction && !transaction.finished) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('⚠️ Rollback error (transaction may have been committed):', rollbackError.message);
      }
    }
    
    console.error('❌ Error in requestCardIssuance:', error.message);
    
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// 2. GET PENDING APPROVALS - RAW SQL ONLY
// ============================================
export const getPendingApprovals = async (req, res) => {
  const userRoleId = req.user?.roleId;
  const branchCode = req.user?.branchCode;
  const userId = getUserId(req);

  try {
    console.log(`🔍 Fetching pending approvals for user: ${userId}, Role: ${userRoleId}, Branch: ${branchCode}`);

    // ✅ Use raw SQL directly - NO associations
    let pendingRequests = [];
    try {
      const [rawResults] = await sequelize.query(
        `SELECT 
          id,
          request_type,
          customer_id,
          account_number,
          account_id,
          card_data,
          fee_details,
          status,
          requested_by,
          requested_by_role_id,
          branch_code,
          organization_name,
          branch_name,
          request_date,
          approved_by,
          approved_by_role_id,
          approved_at,
          rejected_by,
          rejected_by_role_id,
          rejected_at,
          rejection_reason,
          approval_level,
          is_reissuance,
          existing_card_id,
          ip_address,
          expires_at,
          approval_history,
          rec_st,
          created_at,
          updated_at
        FROM card_approval_requests 
        WHERE status = 'PENDING' 
        AND expires_at > NOW() 
        ORDER BY created_at DESC`
      );
      pendingRequests = rawResults;
      console.log(`✅ Raw SQL found ${pendingRequests.length} pending requests`);
      
      // Log first request for debugging
      if (pendingRequests.length > 0) {
        console.log('📋 First request raw data:', {
          id: pendingRequests[0].id,
          customerId: pendingRequests[0].customer_id,
          cardDataPreview: pendingRequests[0].card_data?.substring(0, 100)
        });
      }
    } catch (sqlError) {
      console.error('❌ SQL Error:', sqlError.message);
      return res.status(200).json({
        success: true,
        data: {
          total: 0,
          requests: [],
          summary: {
            totalAmount: 0,
            byType: {},
            byLevel: {}
          }
        }
      });
    }

    // ✅ If no pending requests, return empty
    if (!pendingRequests || pendingRequests.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          total: 0,
          requests: [],
          summary: {
            totalAmount: 0,
            byType: {},
            byLevel: {}
          }
        }
      });
    }

    // ✅ Format and return the requests
    const formattedRequests = pendingRequests.map(request => formatPendingRequestRaw(request));

    // Build summary
    const summary = {
      totalAmount: formattedRequests.reduce((sum, r) => sum + (r.amount || 0), 0),
      byType: {},
      byLevel: {}
    };

    formattedRequests.forEach(r => {
      const type = r.requestType || 'ISSUE';
      summary.byType[type] = (summary.byType[type] || 0) + 1;
      const level = r.approvalLevel || 0;
      summary.byLevel[level] = (summary.byLevel[level] || 0) + 1;
    });

    console.log(`✅ Returning ${formattedRequests.length} pending requests`);

    return res.status(200).json({
      success: true,
      data: {
        total: formattedRequests.length,
        requests: formattedRequests,
        summary: summary
      }
    });

  } catch (error) {
    console.error('❌ Error in getPendingApprovals:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ============================================
// HELPER: Format a pending request - FIXED
// ============================================
function formatPendingRequestRaw(request) {
  // ✅ Parse cardData - handle double-encoded JSON
  let cardData = {};
  try {
    let rawCardData = request.card_data;
    
    // If it's a string, parse it
    if (typeof rawCardData === 'string') {
      // Handle double-encoded JSON (string that starts with "{")
      if (rawCardData.startsWith('"') && rawCardData.endsWith('"')) {
        // Remove outer quotes and unescape
        rawCardData = rawCardData.slice(1, -1).replace(/\\"/g, '"');
      }
      cardData = JSON.parse(rawCardData);
    } else if (typeof rawCardData === 'object' && rawCardData !== null) {
      cardData = rawCardData;
    }
    console.log('✅ Parsed cardData:', {
      hasCardLast4: !!cardData?.cardLast4,
      cardLast4: cardData?.cardLast4,
      enableFlutterwave: cardData?.enableFlutterwave,
      customerName: cardData?.customerName?.substring(0, 20)
    });
  } catch (e) {
    console.error('❌ Could not parse cardData:', e.message);
    console.error('Raw cardData:', request.card_data?.substring(0, 200));
    cardData = {};
  }
  
  // ✅ Parse feeDetails - handle double-encoded JSON
  let feeDetails = {};
  try {
    let rawFeeDetails = request.fee_details;
    
    if (typeof rawFeeDetails === 'string') {
      if (rawFeeDetails.startsWith('"') && rawFeeDetails.endsWith('"')) {
        rawFeeDetails = rawFeeDetails.slice(1, -1).replace(/\\"/g, '"');
      }
      feeDetails = JSON.parse(rawFeeDetails);
    } else if (typeof rawFeeDetails === 'object' && rawFeeDetails !== null) {
      feeDetails = rawFeeDetails;
    }
    console.log('✅ Parsed feeDetails:', {
      totalAmount: feeDetails?.totalAmount,
      feeAmount: feeDetails?.feeAmount
    });
  } catch (e) {
    console.error('❌ Could not parse feeDetails:', e.message);
    feeDetails = {};
  }

  // ✅ Extract card details from cardData
  const cardLast4 = cardData?.cardLast4 || 'N/A';
  const cardType = cardData?.cardType || 'VIRTUAL';
  const cardScheme = cardData?.cardScheme || 'VERVE';
  const enableFlutterwave = cardData?.enableFlutterwave || false;
  const expiryMonth = cardData?.expiryMonth;
  const expiryYear = cardData?.expiryYear;
  const expiry = expiryMonth && expiryYear ? `${expiryMonth}/${expiryYear}` : 'N/A';
  const customerNameFromCard = cardData?.customerName || 'N/A';
  const accountNameFromCard = cardData?.accountName || 'N/A';
  const binInfo = cardData?.binInfo || null;
  const hasEncryptedCVV = !!cardData?.encryptedCVV;

  // ✅ Get customer info from cardData
  const customerName = cardData?.customerName || 'N/A';
  const customerEmail = cardData?.customerEmail || 'N/A';
  const customerPhone = cardData?.customerPhone || 'N/A';

  // ✅ Get account info from cardData
  const accountName = cardData?.accountName || 'N/A';
  const accountBalance = 0; // Not stored in cardData

  // ✅ Calculate total amount from feeDetails
  const amount = feeDetails?.totalAmount || 0;

  // ✅ Build response object
  return {
    id: request.id,
    requestType: request.request_type || 'ISSUE',
    customerId: request.customer_id,
    customerName: customerName,
    customerEmail: customerEmail,
    customerPhone: customerPhone,
    accountNumber: request.account_number,
    accountName: accountName,
    accountBalance: accountBalance,
    amount: amount,
    feeBreakdown: {
      fee: feeDetails?.feeAmount || 0,
      vat: feeDetails?.vatAmount || 0,
      vatRate: feeDetails?.vatRate || 0,
      total: feeDetails?.totalAmount || 0,
      chargeCode: feeDetails?.chargeCode || null,
      chargeName: feeDetails?.chargeName || null
    },
    requestedBy: request.requested_by || 'Unknown',
    requestedByName: request.requested_by || 'Unknown',
    requestedByRole: 'Unknown',
    requestedAt: request.request_date || request.created_at,
    currentLevel: request.approval_level || 0,
    status: request.status || 'PENDING',
    expiresAt: request.expires_at,
    cardData: {
      cardType: cardType,
      cardScheme: cardScheme,
      cardLast4: cardLast4,
      maskedPan: cardLast4 !== 'N/A' ? `**** **** **** ${cardLast4}` : '**** **** **** ****',
      enableFlutterwave: enableFlutterwave,
      isReissuance: request.is_reissuance || false,
      expiry: expiry,
      customerName: customerNameFromCard,
      accountName: accountNameFromCard,
      binInfo: binInfo,
      encryptedCVV: hasEncryptedCVV,
      flutterwaveEnabled: enableFlutterwave
    },
    branchCode: request.branch_code,
    organizationName: request.organization_name,
    branchName: request.branch_name,
    isReissuance: request.is_reissuance || false,
    approvalLevel: request.approval_level || 0,
    ipAddress: request.ip_address,
    approvalHistory: request.approval_history || [],
    feeDetails: feeDetails
  };
}
// ============================================
// 3. APPROVE CARD REQUEST - FIXED
// ============================================
export const approveCardRequest = async (req, res) => {
  const { requestId } = req.params;
  const userId = getUserId(req);
  const userRoleId = req.user?.roleId || req.user?.BU_ROLE_ID || req.user?.role_id || 29;
  const userRoleName = req.user?.roleName || req.user?.ROLE_NM || req.user?.role || 'User';
  const ipAddress = getClientIp(req);

  const transaction = await sequelize.transaction();

  try {
    console.log(`🔍 Approving request: ${requestId}`);
    console.log(`👤 User: ${userId}, Role ID: ${userRoleId}, Role Name: ${userRoleName}`);

    const approvalRequest = await CardApprovalRequest.findByPk(requestId, {
      transaction,
      lock: true
    });

    if (!approvalRequest) {
      throw new Error('Approval request not found');
    }

    console.log(`📋 Request: ${approvalRequest.id}, Status: ${approvalRequest.status}, Type: ${approvalRequest.requestType}`);

    if (approvalRequest.status !== 'PENDING') {
      throw new Error(`Request already ${approvalRequest.status.toLowerCase()}`);
    }

    if (new Date() > new Date(approvalRequest.expiresAt)) {
      approvalRequest.status = 'EXPIRED';
      await approvalRequest.save({ transaction });
      throw new Error('Approval request has expired');
    }

    // ✅ Parse approvalHistory if it's a string
    let approvalHistory = approvalRequest.approvalHistory || [];
    if (typeof approvalHistory === 'string') {
      try {
        approvalHistory = JSON.parse(approvalHistory);
      } catch (e) {
        console.warn('⚠️ Could not parse approvalHistory:', e.message);
        approvalHistory = [];
      }
    }
    if (!Array.isArray(approvalHistory)) {
      approvalHistory = [];
    }

    // ✅ Try to get workflow config
    let workflowConfig = null;
    let approvalLevels = [];
    let isSuperUser = [1, 2, 3].includes(parseInt(userRoleId));

    try {
      workflowConfig = await ApprovalWorkflowConfig.findOne({
        where: {
          requestType: approvalRequest.requestType,
          isActive: true
        },
        transaction
      });
      
      if (workflowConfig) {
        let rawLevels = workflowConfig.approvalLevels;
        if (typeof rawLevels === 'string') {
          try {
            approvalLevels = JSON.parse(rawLevels);
          } catch (e) {
            console.warn('⚠️ Could not parse approvalLevels:', e.message);
            approvalLevels = [];
          }
        } else if (Array.isArray(rawLevels)) {
          approvalLevels = rawLevels;
        } else {
          approvalLevels = [];
        }
        console.log(`✅ Workflow config found with ${approvalLevels.length} approval levels`);
      } else {
        console.log('⚠️ No workflow config found - allowing any user to approve');
        approvalLevels = [];
      }
    } catch (error) {
      console.warn('⚠️ Error fetching workflow config:', error.message);
      approvalLevels = [];
    }

    const currentLevel = approvalRequest.approvalLevel || 0;
    let userLevelIndex = -1;

    if (approvalLevels.length > 0) {
      approvalLevels.forEach((level, index) => {
        const levelRoleId = parseInt(level.roleId);
        const userRoleIdInt = parseInt(userRoleId);
        if (levelRoleId === userRoleIdInt && index >= currentLevel) {
          userLevelIndex = index;
        }
      });
    }

    const isAuthorized = isSuperUser || 
                         approvalLevels.length === 0 || 
                         userLevelIndex !== -1;

    if (!isAuthorized) {
      throw new Error('You are not authorized to approve this request');
    }

    const nextLevel = userLevelIndex !== -1 ? userLevelIndex + 1 : currentLevel + 1;

    // ✅ Push to parsed array
    approvalHistory.push({
      level: nextLevel,
      approver: userId,
      approverRoleId: userRoleId,
      approverRoleName: userRoleName,
      approvedAt: new Date(),
      status: 'APPROVED',
      notes: req.body.notes || null
    });

    const isFinalApproval = isSuperUser || nextLevel >= approvalLevels.length || approvalLevels.length === 0;

    if (isFinalApproval) {
      approvalRequest.status = 'APPROVED';
      approvalRequest.approvedBy = userId;
      approvalRequest.approvedByRoleId = userRoleId;
      approvalRequest.approvedAt = new Date();
      approvalRequest.approvalLevel = nextLevel;
      // ✅ Store as JSON string
      approvalRequest.approvalHistory = JSON.stringify(approvalHistory);

      await approvalRequest.save({ transaction });

      const result = await executeCardIssuanceFromApproval(approvalRequest, transaction);

      await transaction.commit();

      await logAuditTrail(
        'DEBIT_CARD_APPROVAL',
        approvalRequest.id,
        userId,
        'APPROVE_CARD_REQUEST_FINAL',
        { requestId },
        {
          approvedBy: userId,
          roleId: userRoleId,
          roleName: userRoleName,
          finalApproval: true,
          cardId: result.cardId,
          cardLast4: result.cardLast4
        },
        ipAddress,
        'CARD_MANAGEMENT'
      );

      notifyRequester(approvalRequest, 'APPROVED').catch(console.error);

      return res.status(200).json({
        success: true,
        message: 'Card request fully approved and issued',
        data: {
          requestId: approvalRequest.id,
          cardId: result.cardId,
          cardLast4: result.cardLast4,
          status: 'APPROVED',
          maskedPan: result.maskedPan,
          expiry: result.expiry,
          totalCharged: result.totalCharged,
          flutterwaveEnabled: result.flutterwaveEnabled,
          bankName: result.bankName,
          network: result.network,
          isReissuance: result.isReissuance || false,
          cardType: result.cardType || 'VIRTUAL',
          cardScheme: result.cardScheme || 'VERVE'
        }
      });

    } else {
      approvalRequest.approvalLevel = nextLevel;
      // ✅ Store as JSON string
      approvalRequest.approvalHistory = JSON.stringify(approvalHistory);
      approvalRequest.approvedBy = userId;
      approvalRequest.approvedByRoleId = userRoleId;
      approvalRequest.approvedAt = new Date();

      await approvalRequest.save({ transaction });

      await transaction.commit();

      const cardData = typeof approvalRequest.cardData === 'string' 
        ? JSON.parse(approvalRequest.cardData) 
        : approvalRequest.cardData;

      const nextApprover = approvalLevels[nextLevel] || { role: 'Next Approver', name: 'Next Approver' };

      await logAuditTrail(
        'DEBIT_CARD_APPROVAL',
        approvalRequest.id,
        userId,
        'APPROVE_CARD_REQUEST_PARTIAL',
        { requestId },
        {
          approvedBy: userId,
          roleId: userRoleId,
          roleName: userRoleName,
          nextApprovalLevel: nextLevel + 1,
          requiredApprovals: approvalLevels.length,
          cardLast4: cardData?.cardLast4 || 'N/A'
        },
        ipAddress,
        'CARD_MANAGEMENT'
      );

      notifyNextApprover(approvalRequest, workflowConfig, nextLevel).catch(console.error);

      return res.status(200).json({
        success: true,
        message: `Request approved by ${userRoleName}. Waiting for ${nextApprover.name || nextApprover.role} approval.`,
        data: {
          requestId: approvalRequest.id,
          status: 'PARTIALLY_APPROVED',
          currentLevel: nextLevel,
          nextApprover: nextApprover.role || nextApprover.name,
          pendingApprovals: approvalLevels.length - nextLevel,
          cardLast4: cardData?.cardLast4 || 'N/A'
        }
      });
    }

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error approving request:', error.message);
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// 4. REJECT CARD REQUEST - FIXED
// ============================================
export const rejectCardRequest = async (req, res) => {
  const { requestId } = req.params;
  const { reason } = req.body;
  const userId = getUserId(req);
  const userRoleId = req.user?.roleId || req.user?.BU_ROLE_ID || req.user?.role_id || 29;
  const userRoleName = req.user?.roleName || req.user?.ROLE_NM || req.user?.role || 'User';
  const ipAddress = getClientIp(req);

  const transaction = await sequelize.transaction();

  try {
    console.log(`🔍 Rejecting request: ${requestId}`);

    const approvalRequest = await CardApprovalRequest.findByPk(requestId, {
      transaction,
      lock: true
    });

    if (!approvalRequest) {
      throw new Error('Approval request not found');
    }

    if (approvalRequest.status !== 'PENDING') {
      throw new Error(`Request already ${approvalRequest.status.toLowerCase()}`);
    }

    if (new Date() > new Date(approvalRequest.expiresAt)) {
      approvalRequest.status = 'EXPIRED';
      await approvalRequest.save({ transaction });
      throw new Error('Approval request has expired');
    }

    // ✅ Parse approvalHistory if it's a string
    let approvalHistory = approvalRequest.approvalHistory || [];
    if (typeof approvalHistory === 'string') {
      try {
        approvalHistory = JSON.parse(approvalHistory);
      } catch (e) {
        console.warn('⚠️ Could not parse approvalHistory:', e.message);
        approvalHistory = [];
      }
    }
    if (!Array.isArray(approvalHistory)) {
      approvalHistory = [];
    }

    // ✅ Try to get workflow config
    let workflowConfig = null;
    let approvalLevels = [];
    let isSuperUser = [1, 2, 3].includes(parseInt(userRoleId));

    try {
      workflowConfig = await ApprovalWorkflowConfig.findOne({
        where: {
          requestType: approvalRequest.requestType,
          isActive: true
        },
        transaction
      });
      
      if (workflowConfig) {
        let rawLevels = workflowConfig.approvalLevels;
        if (typeof rawLevels === 'string') {
          try {
            approvalLevels = JSON.parse(rawLevels);
          } catch (e) {
            console.warn('⚠️ Could not parse approvalLevels:', e.message);
            approvalLevels = [];
          }
        } else if (Array.isArray(rawLevels)) {
          approvalLevels = rawLevels;
        } else {
          approvalLevels = [];
        }
      } else {
        approvalLevels = [];
      }
    } catch (error) {
      console.warn('⚠️ Error fetching workflow config:', error.message);
      approvalLevels = [];
    }

    const currentLevel = approvalRequest.approvalLevel || 0;
    let isAuthorized = isSuperUser || approvalLevels.length === 0;

    if (!isAuthorized && approvalLevels.length > 0) {
      approvalLevels.forEach((level, index) => {
        const levelRoleId = parseInt(level.roleId);
        const userRoleIdInt = parseInt(userRoleId);
        if (levelRoleId === userRoleIdInt && index >= currentLevel) {
          isAuthorized = true;
        }
      });
    }

    if (!isAuthorized) {
      throw new Error('You are not authorized to reject this request');
    }

    const cardData = typeof approvalRequest.cardData === 'string' 
      ? JSON.parse(approvalRequest.cardData) 
      : approvalRequest.cardData;

    const cardLast4 = cardData?.cardLast4 || 
                      cardData?.pan?.slice(-4) || 
                      'N/A';

    // ✅ Push to parsed array
    approvalHistory.push({
      level: currentLevel + 1,
      approver: userId,
      approverRoleId: userRoleId,
      approverRoleName: userRoleName,
      rejectedAt: new Date(),
      status: 'REJECTED',
      reason: reason || 'No reason provided',
      cardLast4: cardLast4
    });

    approvalRequest.status = 'REJECTED';
    approvalRequest.rejectedBy = userId;
    approvalRequest.rejectedByRoleId = userRoleId;
    approvalRequest.rejectedAt = new Date();
    approvalRequest.rejectionReason = reason || 'No reason provided';
    approvalRequest.approvalHistory = JSON.stringify(approvalHistory);

    await approvalRequest.save({ transaction });

    await transaction.commit();

    await logAuditTrail(
      'DEBIT_CARD_APPROVAL',
      approvalRequest.id,
      userId,
      'REJECT_CARD_REQUEST',
      { requestId, reason },
      {
        rejectedBy: userId,
        roleId: userRoleId,
        roleName: userRoleName,
        reason: reason || 'No reason provided',
        cardLast4: cardLast4,
        requestType: approvalRequest.requestType,
        customerId: approvalRequest.customerId,
        accountNumber: approvalRequest.accountNumber
      },
      ipAddress,
      'CARD_MANAGEMENT'
    );

    notifyRequester(approvalRequest, 'REJECTED', reason).catch(console.error);

    return res.status(200).json({
      success: true,
      message: 'Card request rejected',
      data: {
        requestId: approvalRequest.id,
        status: 'REJECTED',
        rejectedBy: userId,
        rejectedByRole: userRoleName,
        rejectedAt: approvalRequest.rejectedAt,
        reason: reason || 'No reason provided',
        cardLast4: cardLast4,
        requestType: approvalRequest.requestType,
        customerId: approvalRequest.customerId,
        accountNumber: approvalRequest.accountNumber
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error rejecting card request:', error.message);
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
};
// ============================================
// 5. GET APPROVAL QUEUE
// ============================================
export const getApprovalQueue = async (req, res) => {
  const userRoleId = req.user?.roleId;
  const branchCode = req.user?.branchCode;

  try {
    const workflowConfigs = await ApprovalWorkflowConfig.findAll({
      where: { isActive: true }
    });

    const pendingRequests = await CardApprovalRequest.findAll({
      where: {
        status: 'PENDING',
        expiresAt: {
          [Op.gt]: new Date()
        }
      },
      include: [
        { 
          model: Customer, 
          as: 'customer',
          attributes: ['CUST_ID', 'CUST_FIRST_NAME', 'CUST_LAST_NAME', 'CUST_EMAIL']
        },
        { 
          model: CustomerAccount, 
          as: 'account',
          attributes: ['id', 'account_number', 'account_name', 'available_balance']
        },
        { 
          model: User, 
          as: 'requester',
          attributes: ['id', 'username', 'email']
        },
        { 
          model: Role, 
          as: 'requesterRole',
          attributes: ['id', 'ROLE_NM']
        }
      ],
      order: [['requestDate', 'ASC']]
    });

    const authorizedRequests = pendingRequests.filter(request => {
      const config = workflowConfigs.find(wc => wc.requestType === request.requestType);
      if (!config) return false;

      const approvalLevels = config.approvalLevels;
      const currentLevel = request.approvalLevel;

      if ([ROLES.ADMINISTRATOR, ROLES.CHIEF_EXECUTIVE_OFFICER].includes(userRoleId)) {
        return true;
      }

      let isAuthorized = false;
      approvalLevels.forEach((level, index) => {
        if (index >= currentLevel && level.roleId === userRoleId) {
          if (config.branchCode && config.branchCode !== branchCode) {
            return;
          }
          isAuthorized = true;
        }
      });

      return isAuthorized;
    });

    const queueStats = {
      total: authorizedRequests.length,
      byLevel: {},
      byRequestType: {},
      byBranch: {}
    };

    authorizedRequests.forEach(request => {
      const level = request.approvalLevel || 0;
      queueStats.byLevel[level] = (queueStats.byLevel[level] || 0) + 1;
      const type = request.requestType || 'UNKNOWN';
      queueStats.byRequestType[type] = (queueStats.byRequestType[type] || 0) + 1;
      const branch = request.branchCode || 'UNKNOWN';
      queueStats.byBranch[branch] = (queueStats.byBranch[branch] || 0) + 1;
    });

    return res.status(200).json({
      success: true,
      data: {
        queue: authorizedRequests.map(request => ({
          id: request.id,
          requestType: request.requestType,
          customerId: request.customerId,
          customerName: request.customer ? 
            `${request.customer.CUST_FIRST_NAME} ${request.customer.CUST_LAST_NAME}` : 'N/A',
          accountNumber: request.accountNumber,
          amount: request.feeDetails?.totalAmount || 0,
          requestedBy: request.requester?.username || request.requestedBy,
          requestedAt: request.requestDate,
          currentLevel: request.approvalLevel,
          status: request.status,
          expiresAt: request.expiresAt,
          cardData: request.cardData,
          branchCode: request.branchCode,
          organizationName: request.organizationName
        })),
        stats: queueStats
      }
    });

  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// 6. GET APPROVAL REQUEST STATUS
// ============================================
export const getApprovalRequestStatus = async (req, res) => {
  const { requestId } = req.params;
  const userId = getUserId(req);

  try {
    const request = await CardApprovalRequest.findByPk(requestId, {
      include: [
        { 
          model: Customer, 
          as: 'customer',
          attributes: ['CUST_ID', 'CUST_FIRST_NAME', 'CUST_LAST_NAME', 'CUST_EMAIL']
        },
        { 
          model: CustomerAccount, 
          as: 'account',
          attributes: ['id', 'account_number', 'account_name']
        },
        { 
          model: User, 
          as: 'requester',
          attributes: ['id', 'username', 'email']
        },
        { 
          model: Role, 
          as: 'requesterRole',
          attributes: ['id', 'ROLE_NM']
        },
        { 
          model: User, 
          as: 'approver',
          attributes: ['id', 'username', 'email']
        },
        { 
          model: Role, 
          as: 'approverRole',
          attributes: ['id', 'ROLE_NM']
        },
        { 
          model: DebitCard, 
          as: 'existingCard',
          attributes: ['id', 'cardLast4', 'cardStatus', 'cardType']
        }
      ]
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    const isOwner = request.requestedBy === userId;
    const isApprover = await isUserApprover(userId, request);

    if (!isOwner && !isApprover) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this request'
      });
    }

    const workflowConfig = await ApprovalWorkflowConfig.findOne({
      where: {
        requestType: request.requestType,
        isActive: true
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        id: request.id,
        requestType: request.requestType,
        status: request.status,
        customerId: request.customerId,
        customerName: request.customer ? 
          `${request.customer.CUST_FIRST_NAME} ${request.customer.CUST_LAST_NAME}` : 'N/A',
        accountNumber: request.accountNumber,
        accountName: request.account?.account_name,
        amount: request.feeDetails?.totalAmount || 0,
        feeBreakdown: {
          fee: request.feeDetails?.feeAmount || 0,
          vat: request.feeDetails?.vatAmount || 0,
          total: request.feeDetails?.totalAmount || 0
        },
        requestedBy: request.requester?.username || request.requestedBy,
        requestedByRole: request.requesterRole?.ROLE_NM || 'Unknown',
        requestedAt: request.requestDate,
        approvalLevel: request.approvalLevel,
        approvalHistory: request.approvalHistory,
        approvedBy: request.approver?.username || request.approvedBy,
        approvedByRole: request.approverRole?.ROLE_NM || 'Unknown',
        approvedAt: request.approvedAt,
        rejectedBy: request.rejectedBy,
        rejectedAt: request.rejectedAt,
        rejectionReason: request.rejectionReason,
        expiresAt: request.expiresAt,
        isReissuance: request.isReissuance,
        existingCard: request.existingCard ? {
          id: request.existingCard.id,
          last4: request.existingCard.cardLast4,
          status: request.existingCard.cardStatus
        } : null,
        cardData: request.status === 'APPROVED' ? {
          maskedPan: request.cardData?.maskedPan,
          expiry: request.cardData?.expiry,
          cardType: request.cardData?.cardType,
          cardScheme: request.cardData?.cardScheme
        } : request.cardData,
        workflow: workflowConfig ? {
          levels: workflowConfig.approvalLevels,
          requiresAll: workflowConfig.requiresAll
        } : null
      }
    });

  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// 7. GET MY REQUESTS
// ============================================
export const getMyRequests = async (req, res) => {
  const userId = getUserId(req);
  const { status, limit = 10, offset = 0 } = req.query;

  try {
    const whereClause = {
      requestedBy: userId
    };

    if (status) {
      whereClause.status = status;
    }

    const { count, rows } = await CardApprovalRequest.findAndCountAll({
      where: whereClause,
      include: [
        { 
          model: Customer, 
          as: 'customer',
          attributes: ['CUST_ID', 'CUST_FIRST_NAME', 'CUST_LAST_NAME']
        },
        { 
          model: CustomerAccount, 
          as: 'account',
          attributes: ['id', 'account_number', 'account_name']
        },
        { 
          model: Role, 
          as: 'requesterRole',
          attributes: ['id', 'ROLE_NM']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return res.status(200).json({
      success: true,
      data: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        requests: rows.map(request => ({
          id: request.id,
          requestType: request.requestType,
          status: request.status,
          customerId: request.customerId,
          customerName: request.customer ? 
            `${request.customer.CUST_FIRST_NAME} ${request.customer.CUST_LAST_NAME}` : 'N/A',
          accountNumber: request.accountNumber,
          amount: request.feeDetails?.totalAmount || 0,
          requestedAt: request.requestDate,
          approvalLevel: request.approvalLevel,
          approvedAt: request.approvedAt,
          rejectedAt: request.rejectedAt,
          rejectionReason: request.rejectionReason,
          expiresAt: request.expiresAt
        }))
      }
    });

  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// 8. CANCEL REQUEST
// ============================================
export const cancelRequest = async (req, res) => {
  const { requestId } = req.params;
  const userId = getUserId(req);
  const ipAddress = getClientIp(req);

  try {
    const approvalRequest = await CardApprovalRequest.findByPk(requestId);

    if (!approvalRequest) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    if (approvalRequest.requestedBy !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only cancel your own requests'
      });
    }

    if (approvalRequest.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel request in ${approvalRequest.status} status`
      });
    }

    approvalRequest.status = 'CANCELLED';
    await approvalRequest.save();

    await logAuditTrail(
      'DEBIT_CARD_APPROVAL',
      approvalRequest.id,
      userId,
      'CANCEL_REQUEST',
      { requestId },
      { status: 'CANCELLED' },
      ipAddress,
      'CARD_MANAGEMENT'
    );

    return res.status(200).json({
      success: true,
      message: 'Request cancelled successfully',
      data: {
        requestId: approvalRequest.id,
        status: 'CANCELLED'
      }
    });

  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
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

// ============================================
// 9. GET APPROVAL STATISTICS
// ============================================
export const getApprovalStatistics = async (req, res) => {
  const userRoleId = req.user?.roleId;
  const branchCode = req.user?.branchCode;

  try {
    const workflowConfigs = await ApprovalWorkflowConfig.findAll({
      where: { isActive: true }
    });

    const { startDate, endDate } = req.query;
    const dateFilter = {};
    
    if (startDate) {
      dateFilter.createdAt = { [Op.gte]: new Date(startDate) };
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.createdAt = { ...dateFilter.createdAt, [Op.lte]: end };
    }

    const allRequests = await CardApprovalRequest.findAll({
      where: {
        ...dateFilter,
        rec_st: 'A'
      },
      include: [
        { 
          model: Customer, 
          as: 'customer',
          attributes: ['CUST_ID', 'CUST_FIRST_NAME', 'CUST_LAST_NAME', 'CUST_EMAIL']
        },
        { 
          model: CustomerAccount, 
          as: 'account',
          attributes: ['id', 'account_number', 'account_name', 'available_balance']
        },
        { 
          model: User, 
          as: 'requester',
          attributes: ['id', 'username', 'email']
        },
        { 
          model: Role, 
          as: 'requesterRole',
          attributes: ['id', 'ROLE_NM']
        },
        { 
          model: User, 
          as: 'approver',
          attributes: ['id', 'username', 'email']
        },
        { 
          model: Role, 
          as: 'approverRole',
          attributes: ['id', 'ROLE_NM']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const isAdmin = [ROLES.ADMINISTRATOR, ROLES.CHIEF_EXECUTIVE_OFFICER].includes(userRoleId);
    
    let authorizedRequests = allRequests;
    if (!isAdmin) {
      authorizedRequests = allRequests.filter(request => {
        const config = workflowConfigs.find(wc => wc.requestType === request.requestType);
        if (!config) return false;

        const approvalLevels = config.approvalLevels;
        const currentLevel = request.approvalLevel;

        let isAuthorized = false;
        approvalLevels.forEach((level, index) => {
          if (index >= currentLevel && level.roleId === userRoleId) {
            if (config.branchCode && config.branchCode !== branchCode) {
              return;
            }
            isAuthorized = true;
          }
        });

        return isAuthorized;
      });
    }

    const totalRequests = authorizedRequests.length;
    const pendingRequests = authorizedRequests.filter(r => r.status === 'PENDING').length;
    const approvedRequests = authorizedRequests.filter(r => r.status === 'APPROVED').length;
    const rejectedRequests = authorizedRequests.filter(r => r.status === 'REJECTED').length;
    const cancelledRequests = authorizedRequests.filter(r => r.status === 'CANCELLED').length;
    const expiredRequests = authorizedRequests.filter(r => r.status === 'EXPIRED').length;

    const totalAmount = authorizedRequests.reduce((sum, r) => sum + (r.feeDetails?.totalAmount || 0), 0);
    const avgAmount = totalRequests > 0 ? totalAmount / totalRequests : 0;
    const successRate = totalRequests > 0 ? (approvedRequests / totalRequests) * 100 : 0;

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalRequests,
          pendingRequests,
          approvedRequests,
          rejectedRequests,
          cancelledRequests,
          expiredRequests,
          successRate: Math.round(successRate * 100) / 100
        },
        amounts: {
          total: totalAmount,
          average: Math.round(avgAmount * 100) / 100
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching approval statistics:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// 10. GET REQUEST HISTORY
// ============================================
export const getRequestHistory = async (req, res) => {
  const userId = getUserId(req);
  const userRoleId = req.user?.roleId;
  const { requestId } = req.params;

  try {
    const request = await CardApprovalRequest.findByPk(requestId, {
      include: [
        { 
          model: Customer, 
          as: 'customer',
          attributes: ['CUST_ID', 'CUST_FIRST_NAME', 'CUST_LAST_NAME', 'CUST_EMAIL', 'CUST_NM', 'PHONE_NO']
        },
        { 
          model: CustomerAccount, 
          as: 'account',
          attributes: ['id', 'account_number', 'account_name', 'available_balance', 'current_balance']
        },
        { 
          model: User, 
          as: 'requester',
          attributes: ['id', 'username', 'email']
        },
        { 
          model: Role, 
          as: 'requesterRole',
          attributes: ['id', 'ROLE_NM', 'ROLE_DESC']
        },
        { 
          model: User, 
          as: 'approver',
          attributes: ['id', 'username', 'email']
        },
        { 
          model: Role, 
          as: 'approverRole',
          attributes: ['id', 'ROLE_NM', 'ROLE_DESC']
        },
        { 
          model: User, 
          as: 'rejectedByUser',
          attributes: ['id', 'username', 'email']
        },
        { 
          model: Role, 
          as: 'rejectedByRole',
          attributes: ['id', 'ROLE_NM', 'ROLE_DESC']
        },
        { 
          model: DebitCard, 
          as: 'existingCard',
          attributes: ['id', 'cardLast4', 'cardStatus', 'cardType', 'cardScheme', 'expiryMonth', 'expiryYear']
        },
        { 
          model: DebitCard, 
          as: 'issuedCard',
          attributes: ['id', 'cardLast4', 'cardStatus', 'cardType', 'cardScheme', 'expiryMonth', 'expiryYear', 'issuedAt']
        },
        { 
          model: ApprovalWorkflowConfig, 
          as: 'workflowConfig',
          attributes: ['id', 'requestType', 'approvalLevels', 'minAmount', 'requiresAll']
        }
      ]
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    const isAdmin = [ROLES.ADMINISTRATOR, ROLES.CHIEF_EXECUTIVE_OFFICER].includes(userRoleId);
    const isOwner = request.requestedBy === userId;
    const isApprover = await isUserApprover(userId, request);

    if (!isAdmin && !isOwner && !isApprover) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this request'
      });
    }

    const workflowConfig = await ApprovalWorkflowConfig.findOne({
      where: {
        requestType: request.requestType,
        isActive: true
      }
    });

    const approvalHistory = request.approvalHistory || [];
    
    const timeline = [
      {
        event: 'REQUEST_CREATED',
        timestamp: request.createdAt,
        user: request.requester?.username || request.requestedBy,
        role: request.requesterRole?.ROLE_NM || 'Unknown',
        details: {
          requestType: request.requestType,
          amount: request.feeDetails?.totalAmount || 0,
          status: 'PENDING'
        }
      }
    ];

    approvalHistory.forEach((entry, index) => {
      let event = '';
      if (entry.status === 'APPROVED') {
        event = index === approvalHistory.length - 1 && request.status === 'APPROVED' 
          ? 'FINAL_APPROVAL' 
          : 'APPROVAL';
      } else if (entry.status === 'REJECTED') {
        event = 'REJECTED';
      }
      
      timeline.push({
        event: event,
        timestamp: entry.approvedAt || entry.rejectedAt || entry.createdAt,
        user: entry.approver || entry.rejector || 'SYSTEM',
        role: entry.approverRoleName || entry.rejectorRoleName || 'Unknown',
        details: {
          level: entry.level,
          notes: entry.notes || null,
          reason: entry.reason || null,
          status: entry.status
        }
      });
    });

    if (request.status === 'APPROVED' && request.approvedAt) {
      timeline.push({
        event: 'COMPLETED',
        timestamp: request.approvedAt,
        user: request.approver?.username || request.approvedBy,
        role: request.approverRole?.ROLE_NM || 'Unknown',
        details: {
          cardIssued: true,
          cardId: request.cardData?.cardId,
          maskedPan: request.cardData?.maskedPan,
          expiry: request.cardData?.expiry
        }
      });
    } else if (request.status === 'REJECTED' && request.rejectedAt) {
      timeline.push({
        event: 'COMPLETED',
        timestamp: request.rejectedAt,
        user: request.rejectedByUser?.username || request.rejectedBy,
        role: request.rejectedByRole?.ROLE_NM || 'Unknown',
        details: {
          reason: request.rejectionReason
        }
      });
    } else if (request.status === 'CANCELLED') {
      timeline.push({
        event: 'CANCELLED',
        timestamp: request.updatedAt,
        user: request.requester?.username || request.requestedBy,
        role: request.requesterRole?.ROLE_NM || 'Unknown',
        details: {
          reason: 'Request cancelled by user'
        }
      });
    } else if (request.status === 'EXPIRED') {
      timeline.push({
        event: 'EXPIRED',
        timestamp: request.expiresAt,
        user: 'SYSTEM',
        role: 'System',
        details: {
          reason: 'Request expired'
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        request: {
          id: request.id,
          requestType: request.requestType,
          status: request.status,
          customerId: request.customerId,
          customerName: request.customer ? 
            `${request.customer.CUST_FIRST_NAME} ${request.customer.CUST_LAST_NAME}` : 'N/A',
          customerEmail: request.customer?.CUST_EMAIL || 'N/A',
          customerPhone: request.customer?.PHONE_NO || 'N/A',
          accountNumber: request.accountNumber,
          accountName: request.account?.account_name || 'N/A',
          accountBalance: request.account?.available_balance || 0,
          amount: request.feeDetails?.totalAmount || 0,
          feeBreakdown: {
            fee: request.feeDetails?.feeAmount || 0,
            vat: request.feeDetails?.vatAmount || 0,
            vatRate: request.feeDetails?.vatRate || 0,
            total: request.feeDetails?.totalAmount || 0,
            chargeCode: request.feeDetails?.chargeCode || null,
            chargeName: request.feeDetails?.chargeName || null
          },
          cardData: {
            cardType: request.cardData?.cardType || 'VIRTUAL',
            cardScheme: request.cardData?.cardScheme || 'VERVE',
            enableFlutterwave: request.cardData?.enableFlutterwave || false,
            isReissuance: request.isReissuance || false,
            existingCardId: request.existingCardId,
            existingCard: request.existingCard ? {
              id: request.existingCard.id,
              last4: request.existingCard.cardLast4,
              status: request.existingCard.cardStatus,
              type: request.existingCard.cardType,
              scheme: request.existingCard.cardScheme,
              expiry: `${request.existingCard.expiryMonth}/${request.existingCard.expiryYear}`
            } : null,
            issuedCard: request.issuedCard ? {
              id: request.issuedCard.id,
              last4: request.issuedCard.cardLast4,
              status: request.issuedCard.cardStatus,
              type: request.issuedCard.cardType,
              scheme: request.issuedCard.cardScheme,
              expiry: `${request.issuedCard.expiryMonth}/${request.issuedCard.expiryYear}`,
              issuedAt: request.issuedCard.issuedAt
            } : null
          },
          requester: {
            id: request.requester?.id,
            username: request.requester?.username || request.requestedBy,
            email: request.requester?.email,
            fullName: request.requester ? 
              `${request.requester.firstName || ''} ${request.requester.lastName || ''}`.trim() : 
              'Unknown',
            role: request.requesterRole?.ROLE_NM || 'Unknown'
          },
          approver: request.approver ? {
            id: request.approver?.id,
            username: request.approver?.username || request.approvedBy,
            email: request.approver?.email,
            fullName: request.approver ? 
              `${request.approver.firstName || ''} ${request.approver.lastName || ''}`.trim() : 
              'Unknown',
            role: request.approverRole?.ROLE_NM || 'Unknown'
          } : null,
          rejectedBy: request.rejectedBy ? {
            id: request.rejectedByUser?.id,
            username: request.rejectedByUser?.username || request.rejectedBy,
            email: request.rejectedByUser?.email,
            fullName: request.rejectedByUser ? 
              `${request.rejectedByUser.firstName || ''} ${request.rejectedByUser.lastName || ''}`.trim() : 
              'Unknown',
            role: request.rejectedByRole?.ROLE_NM || 'Unknown'
          } : null,
          rejectionReason: request.rejectionReason || null,
          branchCode: request.branchCode,
          organizationName: request.organizationName,
          branchName: request.branchName,
          ipAddress: request.ipAddress,
          requestedAt: request.requestDate || request.createdAt,
          approvedAt: request.approvedAt,
          rejectedAt: request.rejectedAt,
          expiresAt: request.expiresAt,
          approvalLevel: request.approvalLevel,
          totalApprovalLevels: workflowConfig?.approvalLevels?.length || 0,
          glEntriesPosted: request.cardData?.glEntriesPosted || false,
          glJournalId: request.cardData?.glJournalId || null
        },
        timeline: timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
        approvalHistory: approvalHistory.map(entry => ({
          level: entry.level,
          approver: entry.approver || entry.rejector || 'SYSTEM',
          role: entry.approverRoleName || entry.rejectorRoleName || 'Unknown',
          status: entry.status,
          timestamp: entry.approvedAt || entry.rejectedAt || entry.createdAt,
          notes: entry.notes || null,
          reason: entry.reason || null
        })),
        glEntries: request.cardData?.glEntriesPosted ? {
          journalId: request.cardData?.glJournalId,
          creditGlAccount: request.cardData?.resolvedCreditGlAccount,
          vatGlAccount: request.cardData?.resolvedVatGlAccount,
          feeAmount: request.feeDetails?.feeAmount || 0,
          vatAmount: request.feeDetails?.vatAmount || 0,
          totalAmount: request.feeDetails?.totalAmount || 0
        } : null,
        workflow: workflowConfig ? {
          levels: workflowConfig.approvalLevels.map((level, index) => ({
            level: index + 1,
            roleId: level.roleId,
            roleName: level.role,
            name: level.name,
            description: level.description || null,
            current: request.approvalLevel === index,
            completed: request.approvalLevel > index,
            pending: request.approvalLevel === index && request.status === 'PENDING',
            status: index < request.approvalLevel ? 'COMPLETED' : 
                    index === request.approvalLevel ? 'IN_PROGRESS' : 'PENDING'
          })),
          requiresAll: workflowConfig.requiresAll || false
        } : null,
        metadata: {
          historyLength: timeline.length,
          totalApprovals: approvalHistory.length,
          requestAge: Math.floor((new Date() - new Date(request.createdAt)) / (1000 * 60 * 60)),
          requestAgeDisplay: getTimeAgoDisplay(request.createdAt)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching request history:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// HELPER: Get time ago display
// ============================================
const getTimeAgoDisplay = (date) => {
  if (!date) return 'Unknown';
  const diff = Math.floor((new Date() - new Date(date)) / 1000);
  
  if (diff < 60) return `${diff} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
  return `${Math.floor(diff / 2592000)} months ago`;
};

// ============================================
// 11. GET WORKFLOW CONFIGURATIONS - FIXED
// ============================================
export const getWorkflowConfigs = async (req, res) => {
  try {
    const { 
      requestType, 
      isActive, 
      branchCode: filterBranchCode,
      organizationName,
      includeInactive = 'false'
    } = req.query;

    const whereClause = {};
    
    if (requestType) {
      whereClause.requestType = requestType;
    }
    
    if (isActive !== undefined) {
      whereClause.isActive = isActive === 'true';
    } else if (includeInactive === 'false') {
      whereClause.isActive = true;
    }
    
    if (filterBranchCode) {
      whereClause.branchCode = filterBranchCode;
    }
    
    if (organizationName) {
      whereClause.organizationName = organizationName;
    }

    const configs = await ApprovalWorkflowConfig.findAll({
      where: whereClause,
      order: [
        ['request_type', 'ASC'],
        ['min_amount', 'ASC']
      ]
    });

    if (!configs || configs.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          configs: [],
          summary: {
            totalConfigs: 0,
            activeConfigs: 0,
            inactiveConfigs: 0,
            byRequestType: {}
          },
          availableRequestTypes: [],
          filters: {
            requestType: requestType || null,
            isActive: isActive !== undefined ? isActive : null,
            branchCode: filterBranchCode || null,
            organizationName: organizationName || null
          }
        }
      });
    }

    const configsWithStats = await Promise.all(configs.map(async (config) => {
      const configId = config.id;
      
      const requestCount = await CardApprovalRequest.count({
        where: {
          workflowConfigId: configId,
          rec_st: 'A'
        }
      });

      const pendingCount = await CardApprovalRequest.count({
        where: {
          workflowConfigId: configId,
          status: 'PENDING',
          rec_st: 'A'
        }
      });

      const approvedCount = await CardApprovalRequest.count({
        where: {
          workflowConfigId: configId,
          status: 'APPROVED',
          rec_st: 'A'
        }
      });

      const rejectedCount = await CardApprovalRequest.count({
        where: {
          workflowConfigId: configId,
          status: 'REJECTED',
          rec_st: 'A'
        }
      });

      let totalAmount = 0;
      try {
        const requests = await CardApprovalRequest.findAll({
          where: {
            workflowConfigId: configId,
            status: 'APPROVED',
            rec_st: 'A'
          },
          attributes: ['feeDetails']
        });
        requests.forEach(r => {
          if (r.feeDetails?.totalAmount) {
            totalAmount += parseFloat(r.feeDetails.totalAmount) || 0;
          }
        });
      } catch (e) {
        console.warn('⚠️ Could not calculate total amount:', e.message);
      }

      const recentRequests = await CardApprovalRequest.findAll({
        where: {
          workflowConfigId: configId,
          rec_st: 'A'
        },
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['CUST_ID', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM']
          },
          {
            model: User,
            as: 'requester',
            attributes: ['id', 'username', 'user_name']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: 5
      });

      const configData = {
        id: config.id,
        requestType: config.requestType,
        minAmount: config.minAmount,
        maxAmount: config.maxAmount,
        approvalLevels: config.approvalLevels,
        requiresAll: config.requiresAll,
        isActive: config.isActive,
        branchCode: config.branchCode,
        organizationName: config.organizationName,
        autoApproveThreshold: config.autoApproveThreshold,
        requiresMultiBranchApproval: config.requiresMultiBranchApproval,
        escalationLevels: config.escalationLevels,
        createdBy: config.createdBy,
        updatedBy: config.updatedBy,
        rec_st: config.rec_st,
        createdAt: config.created_at || config.createdAt,
        updatedAt: config.updated_at || config.updatedAt,
        statistics: {
          totalRequests: requestCount,
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount,
          totalApprovedAmount: totalAmount,
          successRate: requestCount > 0 ? Math.round((approvedCount / requestCount) * 100) : 0
        },
        recentRequests: recentRequests.map(r => ({
          id: r.id,
          requestType: r.requestType,
          customerId: r.customerId,
          customerName: r.customer ? 
            `${r.customer.FIRST_NAME || ''} ${r.customer.LAST_NAME || ''}`.trim() || r.customer.CUST_NM || 'N/A' : 'N/A',
          amount: r.feeDetails?.totalAmount || 0,
          status: r.status,
          requestedBy: r.requester?.username || r.requester?.user_name || r.requestedBy || 'Unknown',
          requestedAt: r.request_date || r.created_at || r.createdAt
        }))
      };

      return configData;
    }));

    const summary = {
      totalConfigs: configs.length,
      activeConfigs: configs.filter(c => c.isActive).length,
      inactiveConfigs: configs.filter(c => !c.isActive).length,
      byRequestType: {}
    };

    configs.forEach(config => {
      const type = config.requestType || 'UNKNOWN';
      if (!summary.byRequestType[type]) {
        summary.byRequestType[type] = {
          total: 0,
          active: 0,
          inactive: 0
        };
      }
      summary.byRequestType[type].total++;
      if (config.isActive) {
        summary.byRequestType[type].active++;
      } else {
        summary.byRequestType[type].inactive++;
      }
    });

    const availableRequestTypes = [...new Set(configs.map(c => c.requestType))].filter(Boolean);

    return res.status(200).json({
      success: true,
      data: {
        configs: configsWithStats,
        summary,
        availableRequestTypes,
        filters: {
          requestType: requestType || null,
          isActive: isActive !== undefined ? isActive : null,
          branchCode: filterBranchCode || null,
          organizationName: organizationName || null
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching workflow configs:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
// ============================================
// 12. UPDATE WORKFLOW CONFIG
// ============================================
// In CardApprovalController.js - updateWorkflowConfig function

export const updateWorkflowConfig = async (req, res) => {
  const userId = getUserId(req);
  const { configId } = req.params;
  const { 
    requestType, 
    approvalLevels, 
    minAmount, 
    maxAmount, 
    branchCode, 
    organizationName,
    requiresAll,
    isActive
    // ✅ REMOVED: description
  } = req.body;

  try {
    const config = await ApprovalWorkflowConfig.findByPk(configId);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Workflow configuration not found'
      });
    }

    if (isActive === false && config.isActive === true) {
      const pendingRequests = await CardApprovalRequest.count({
        where: {
          workflowConfigId: config.id,
          status: 'PENDING',
          rec_st: 'A'
        }
      });

      if (pendingRequests > 0) {
        return res.status(400).json({
          success: false,
          error: `Cannot deactivate workflow config with ${pendingRequests} pending approval requests.`
        });
      }
    }

    if (approvalLevels && (!Array.isArray(approvalLevels) || approvalLevels.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Approval levels must be a non-empty array'
      });
    }

    if (requestType && (requestType !== config.requestType)) {
      const existingConfig = await ApprovalWorkflowConfig.findOne({
        where: {
          requestType,
          branchCode: branchCode !== undefined ? branchCode : config.branchCode,
          organizationName: organizationName !== undefined ? organizationName : config.organizationName,
          id: { [Op.ne]: configId }
        }
      });

      if (existingConfig) {
        return res.status(400).json({
          success: false,
          error: 'Another workflow config already exists for this request type and branch/organization'
        });
      }
    }

    const updateData = {};
    
    if (requestType !== undefined) updateData.requestType = requestType;
    if (approvalLevels !== undefined) updateData.approvalLevels = approvalLevels;
    if (minAmount !== undefined) updateData.minAmount = minAmount;
    if (maxAmount !== undefined) updateData.maxAmount = maxAmount;
    if (branchCode !== undefined) updateData.branchCode = branchCode;
    if (organizationName !== undefined) updateData.organizationName = organizationName;
    if (requiresAll !== undefined) updateData.requiresAll = requiresAll;
    if (isActive !== undefined) updateData.isActive = isActive;
    // ✅ REMOVED: description
    
    updateData.updatedBy = userId;
    updateData.updatedAt = new Date();

    await config.update(updateData);
    await config.reload();

    await logAuditTrail(
      'APPROVAL_WORKFLOW',
      config.id,
      userId,
      'UPDATE_WORKFLOW_CONFIG',
      req.body,
      {
        requestType: config.requestType,
        approvalLevels: config.approvalLevels?.length || 0,
        minAmount: config.minAmount,
        maxAmount: config.maxAmount,
        isActive: config.isActive,
        branchCode: config.branchCode,
        organizationName: config.organizationName
      },
      getClientIp(req),
      'CARD_MANAGEMENT'
    );

    return res.status(200).json({
      success: true,
      message: 'Workflow configuration updated successfully',
      data: config
    });

  } catch (error) {
    console.error('❌ Error updating workflow config:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
// ============================================
// 13. DELETE WORKFLOW CONFIG
// ============================================
export const deleteWorkflowConfig = async (req, res) => {
  const userId = getUserId(req);
  const { configId } = req.params;

  try {
    const config = await ApprovalWorkflowConfig.findByPk(configId);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Workflow configuration not found'
      });
    }

    const requestCount = await CardApprovalRequest.count({
      where: {
        workflowConfigId: config.id,
        rec_st: 'A'
      }
    });

    if (requestCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete workflow config with ${requestCount} associated approval requests. Please deactivate it instead.`
      });
    }

    await config.update({
      rec_st: 'D',
      isActive: false,
      updatedBy: userId,
      updatedAt: new Date()
    });

    await logAuditTrail(
      'APPROVAL_WORKFLOW',
      config.id,
      userId,
      'DELETE_WORKFLOW_CONFIG',
      { configId },
      {
        requestType: config.requestType,
        branchCode: config.branchCode,
        organizationName: config.organizationName
      },
      getClientIp(req),
      'CARD_MANAGEMENT'
    );

    return res.status(200).json({
      success: true,
      message: 'Workflow configuration deleted successfully',
      data: {
        id: config.id,
        requestType: config.requestType
      }
    });

  } catch (error) {
    console.error('❌ Error deleting workflow config:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// EXPORTS
// ============================================

// export {
//   requestCardIssuance,
//   approveCardRequest,
//   rejectCardRequest,
//   getPendingApprovals,
//   getApprovalQueue,
//   getApprovalRequestStatus,
//   getMyRequests,
//   cancelRequest,
//   getApprovalStatistics,
//   getRequestHistory,
//   getWorkflowConfigs,
//   updateWorkflowConfig,
//   deleteWorkflowConfig
// };