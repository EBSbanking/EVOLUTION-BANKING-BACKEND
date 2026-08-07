// controllers/outwardTransferController.js
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import { QueryTypes } from 'sequelize';
import axios from 'axios';
import OutwardFundsTransfer, { 
  RECORD_STATUS, 
  TRANSACTION_STATUS, 
  REPAIR_FLAG, 
  FOREIGN_OFT_FLAG 
} from '../models/OutwardFundsTransfer.js';
import { TransactionPolicy } from '../models/TransactionPolicy.js';
import {
  EMTLPolicyService,
  EMTLCollectionService
} from '../Services/index.js';
import EMTLTransaction from '../models/EMTLTransaction.js';
import logger from '../utils/logger.js';
import smsService from '../utils/smsService.js';
import SMS from '../models/SMS.js';
// ✅ Import Notification Service
import { sendApprovalNotificationToBUUsers } from '../controllers/NotificationController.js';

// Helper function to safely parse numbers
const safeParseFloat = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/,/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

// Helper function to safely format numbers
const safeToFixed = (value, decimals = 2) => {
  const num = safeParseFloat(value);
  return num.toFixed(decimals);
};

// ================================================================
// ✅ PAYSTACK VALIDATION FUNCTIONS (Built-in)
// ================================================================

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;
const PAYSTACK_BASE_URL = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';

/**
 * Resolve/Verify account number via Paystack
 * Validates the receiver name and account
 */
const resolvePaystackAccount = async (accountNumber, bankCode) => {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      console.warn('⚠️ Paystack secret key not configured');
      return {
        success: false,
        verified: false,
        message: 'Paystack secret key not configured. Please add PAYSTACK_SECRET_KEY to your .env file.'
      };
    }

    console.log(`🔍 Resolving account: ${accountNumber} with bank: ${bankCode}`);
    
    const response = await axios.get(`${PAYSTACK_BASE_URL}/bank/resolve`, {
      params: {
        account_number: accountNumber,
        bank_code: bankCode,
      },
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000
    });
    
    console.log(`📥 Paystack response status: ${response.data.status}`);
    
    if (response.data.status) {
      const accountData = response.data.data;
      console.log(`✅ Account resolved: ${accountData.account_name} (${accountData.account_number})`);
      return {
        success: true,
        verified: true,
        accountNumber: accountData.account_number,
        accountName: accountData.account_name,
        bankCode: accountData.bank_code,
        bankName: accountData.bank_name,
        message: 'Account verified successfully'
      };
    }
    
    return {
      success: false,
      verified: false,
      message: response.data.message || 'Account verification failed'
    };
  } catch (error) {
    console.error('❌ Error resolving Paystack account:', error.response?.data || error.message);
    
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        verified: false,
        message: 'Request timeout - Paystack API is not responding'
      };
    }
    
    if (error.response?.status === 401) {
      return {
        success: false,
        verified: false,
        message: 'Invalid Paystack secret key. Please check your configuration.'
      };
    }
    
    if (error.response?.status === 404) {
      return {
        success: false,
        verified: false,
        message: 'Account not found. Please check the account number and bank code.'
      };
    }
    
    const errorMessage = error.response?.data?.message || 'Account verification failed';
    
    if (errorMessage.includes('Invalid account number')) {
      return {
        success: false,
        verified: false,
        message: 'Invalid account number. Please check and try again.'
      };
    }
    
    if (errorMessage.includes('Invalid bank code')) {
      return {
        success: false,
        verified: false,
        message: 'Invalid bank selected. Please select a valid bank.'
      };
    }
    
    return {
      success: false,
      verified: false,
      message: errorMessage
    };
  }
};

export const outwardTransferController = {
/**
 * Initiate an outward transfer (sending money outside the bank)
 * POST /api/outward/transfer
 * ✅ Validates receiver name via Paystack
 * ✅ Debits sender account directly (no drawer involvement)
 * ✅ Sends approval notification to supervisors in the branch
 */
async initiateTransfer(req, res) {
  const transaction = await sequelize.transaction();

  try {
    const {
      amount,
      beneficiary,
      remitter,
      transferType,
      channel,
      currencyId,
      customerTier,
      metadata,
      buId,
      branchId,
      userId,
      userRole,
      description,
      paymentPurpose,
      priorityLevel,
      validateBeneficiary = true,
      skipValidation = false
    } = req.body;

    const parsedAmount = safeParseFloat(amount);
    
    // Validate required fields
    if (!parsedAmount || parsedAmount <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Valid amount is required'
      });
    }

    if (!beneficiary?.account || !beneficiary?.bankCode || !remitter?.account) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: beneficiary.account, beneficiary.bankCode, remitter.account'
      });
    }

    // ================================================================
    // ✅ VALIDATE BENEFICIARY ACCOUNT VIA PAYSTACK
    // ================================================================
    let validationResult = null;
    let beneficiaryVerifiedName = beneficiary.name || 'Beneficiary';

    const isPaystackConfigured = PAYSTACK_SECRET_KEY && PAYSTACK_SECRET_KEY !== '';

    if (validateBeneficiary && !skipValidation) {
      if (!isPaystackConfigured) {
        console.warn('⚠️ Paystack not configured. Skipping beneficiary validation.');
        logger.warn('⚠️ Paystack not configured. Skipping beneficiary validation.');
        validationResult = {
          success: true,
          verified: false,
          accountNumber: beneficiary.account,
          accountName: beneficiary.name || 'Unverified',
          bankCode: beneficiary.bankCode,
          bankName: beneficiary.bankName || 'Unknown Bank',
          message: 'Skipped validation - Paystack not configured',
          skipped: true
        };
        beneficiaryVerifiedName = beneficiary.name || 'Beneficiary';
      } else {
        try {
          console.log(`🔍 Validating beneficiary account via Paystack: ${beneficiary.account} (Bank: ${beneficiary.bankCode})`);
          
          validationResult = await resolvePaystackAccount(
            beneficiary.account,
            beneficiary.bankCode
          );
          
          if (!validationResult.success || !validationResult.verified) {
            await transaction.rollback();
            return res.status(400).json({
              success: false,
              error: `Beneficiary account validation failed: ${validationResult.message}`,
              validation: validationResult
            });
          }
          
          beneficiaryVerifiedName = validationResult.accountName;
          
          console.log(`✅ Beneficiary validated: ${validationResult.accountName} (${validationResult.accountNumber})`);
          
          const providedName = beneficiary.name?.trim() || '';
          const verifiedName = validationResult.accountName || '';
          
          if (providedName && providedName.toLowerCase() !== verifiedName.toLowerCase()) {
            console.warn(`⚠️ Name mismatch: Provided "${providedName}" vs Verified "${verifiedName}"`);
            beneficiary.name = verifiedName;
            beneficiaryVerifiedName = verifiedName;
          }
          
        } catch (validationError) {
          console.error('❌ Beneficiary validation error:', validationError.message);
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            error: `Failed to validate beneficiary account: ${validationError.message}`,
            validation: { success: false, error: validationError.message }
          });
        }
      }
    }

    // ================================================================
    // USER ID EXTRACTION
    // ================================================================
    const authenticatedUser = req.user || {};
    const currentUserId = authenticatedUser.username || 
                         authenticatedUser.id || 
                         authenticatedUser.user_name ||
                         authenticatedUser.userId ||
                         userId ||
                         req.body.USER_ID ||
                         'system';

    const currentUserRole = authenticatedUser.role || 
                           authenticatedUser.user_role ||
                           userRole ||
                           req.body.USER_ROLE ||
                           'TELLER';

    console.log(`👤 Outward transfer initiated by: ${currentUserId} (Role: ${currentUserRole})`);
    console.log(`📝 Processing outward transfer:`, {
      amount: parsedAmount,
      beneficiary: beneficiary.account,
      bank: beneficiary.bankCode,
      verifiedName: beneficiaryVerifiedName,
      remitter: remitter.account
    });

    // ================================================================
    // FIND SENDER ACCOUNT AND VALIDATE
    // ================================================================
    const [account] = await sequelize.query(
      `
      SELECT 
        ca.id,
        ca.CUST_ID AS customer_id,
        ca.account_number,
        ca.account_name AS acct_nm,
        ca.status,
        ca.available_balance,
        ca.ledger_balance,
        ca.cleared_balance,
        ca.sms_alert,
        c.PHONE_NO AS phone_number,
        CONCAT(c.FIRST_NAME, ' ', c.LAST_NAME) AS customer_name,
        c.FIRST_NAME,
        c.LAST_NAME,
        c.CUST_ID
      FROM customer_accounts ca
      LEFT JOIN customers c ON ca.CUST_ID = c.CUST_ID
      WHERE ca.account_number = :accountNumber
      LIMIT 1
      `,
      {
        replacements: { accountNumber: remitter.account },
        type: QueryTypes.SELECT,
        transaction
      }
    );

    if (!account) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: `Account ${remitter.account} not found`
      });
    }

    if (account.status !== 'ACTIVE' && account.status !== 'APPROVED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: `Account ${remitter.account} is not active`
      });
    }

    const currentBalance = safeParseFloat(account.ledger_balance);
    console.log(`📊 Current balance: ₦${safeToFixed(currentBalance)}`);

    // ================================================================
    // EMTL CALCULATION
    // ================================================================
    let emtlResult = { amount: 0, applicable: false, reason: 'Not applicable' };
    
    try {
      emtlResult = await EMTLPolicyService.calculateEMTL({
        amount: parsedAmount,
        transactionType: 'OUTWARD_TRANSFER',
        customerSegment: customerTier || 'RETAIL',
        sourceCustomer: account.customer_id,
        destinationCustomer: beneficiary.account
      });
      
      console.log(`💰 EMTL Calculation:`, {
        amount: emtlResult.amount,
        applicable: emtlResult.applicable,
        reason: emtlResult.reason
      });
    } catch (emtlError) {
      console.error('❌ EMTL calculation error:', emtlError.message);
      emtlResult = { amount: 0, applicable: false, reason: 'EMTL calculation failed' };
    }

    // ================================================================
    // CALCULATE TOTAL DEBIT
    // ================================================================
    const sendingBankCharge = safeParseFloat(req.body.sendingBankCharge);
    const receivingBankCharge = safeParseFloat(req.body.receivingBankCharge);
    const nipFee = safeParseFloat(req.body.nipFee);
    const vatAmount = safeParseFloat(req.body.vatAmount);
    
    const totalCharges = sendingBankCharge + receivingBankCharge + nipFee + vatAmount;
    const emtlAmount = safeParseFloat(emtlResult.amount);
    const totalDebitAmount = parsedAmount + emtlAmount + totalCharges;
      
    console.log(`📊 Transaction amounts:`, {
      principal: parsedAmount,
      emtl: emtlAmount,
      charges: totalCharges,
      totalDebit: totalDebitAmount
    });

    // Check sufficient balance
    if (currentBalance < totalDebitAmount) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: `Insufficient funds. Required: ₦${safeToFixed(totalDebitAmount)}, Available: ₦${safeToFixed(currentBalance)}`
      });
    }

    // ================================================================
    // GENERATE REFERENCE
    // ================================================================
    const generateReferenceNumber = () => {
      const timestamp = Date.now().toString();
      const randomDigits = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
      return (timestamp + randomDigits).slice(0, 18);
    };

    const referenceNo = generateReferenceNumber();
    const xferRef = `OUT-${referenceNo}`;

    // ================================================================
    // ✅ DEBIT SENDER ACCOUNT DIRECTLY (NO DRAWER)
    // ================================================================
    const newBalance = currentBalance - totalDebitAmount;

    await sequelize.query(
      `UPDATE customer_accounts 
       SET ledger_balance = :newBalance,
           available_balance = :newBalance,
           cleared_balance = :newBalance,
           updated_at = NOW()
       WHERE id = :accountId`,
      {
        replacements: {
          newBalance: safeToFixed(newBalance),
          accountId: account.id
        },
        transaction
      }
    );

    await sequelize.query(
      `UPDATE deposit_account_summary 
       SET LEDGER_BAL = :newBalance,
           CLEARED_BAL = :newBalance,
           DR_TURNOVER = DR_TURNOVER + :amount,
           DR_COUNT = DR_COUNT + 1,
           LAST_WITHDRAWL_DT = NOW(),
           LAST_WITHDRAWL_AMT = :amount,
           LAST_ACTIVITY_DT = NOW(),
           ROW_TS = NOW()
       WHERE ACCT_NO = :accountNumber`,
      {
        replacements: {
          newBalance: safeToFixed(newBalance),
          amount: safeToFixed(totalDebitAmount),
          accountNumber: remitter.account
        },
        transaction
      }
    );

    console.log(`✅ Account ${remitter.account} debited: ₦${safeToFixed(totalDebitAmount)} → ₦${safeToFixed(newBalance)}`);

    // ================================================================
    // ✅ CREATE DEPOSIT TRANSACTION RECORD (WITH ALL COLUMNS INCLUDING EMTL)
    // ================================================================
    await sequelize.query(
      `
      INSERT INTO deposit_transactions 
        (customer_id, account_number, transaction_type, amount, 
         emtl_amount, total_debit, emtl_applicable, emtl_reason, 
         emtl_gl_account, emtl_beneficiary, emtl_remittance_status,
         currency, status, aml_risk_level, aml_risk_score, aml_indicators,
         created_by, transaction_date, branch_id, transaction_ref_no, 
         description, requires_approval, approval_status, depositor_name)
      VALUES
        (:customerId, :accountNumber, 'OUTWARD_TRANSFER', :amount,
         :emtlAmount, :totalDebit, :emtlApplicable, :emtlReason,
         :emtlGlAccount, :emtlBeneficiary, 'PENDING',
         :currency, 'COMPLETED', 'LOW', 10, '[]',
         :createdBy, NOW(), :branchId, :referenceNo,
         :description, 0, 'APPROVED', :depositorName)
      `,
      {
        replacements: {
          customerId: account.customer_id || 0,
          accountNumber: remitter.account,
          amount: safeToFixed(parsedAmount),
          emtlAmount: safeToFixed(emtlAmount),
          totalDebit: safeToFixed(totalDebitAmount),
          emtlApplicable: emtlResult.applicable ? 1 : 0,
          emtlReason: emtlResult.reason || 'N/A',
          emtlGlAccount: emtlResult.glAccount || '2401000001',
          emtlBeneficiary: emtlResult.beneficiary || 'FGN',
          currency: 'NGN',
          createdBy: currentUserId.toString(),
          branchId: branchId || '101',
          referenceNo: referenceNo,
          description: description || `Outward transfer to ${beneficiary.account}`,
          depositorName: account.customer_name || remitter.name || 'Customer'
        },
        transaction
      }
    );

    // ================================================================
    // ✅ CREATE EMTL TRANSACTION RECORD (Using EMTLTransaction model)
    // ================================================================
    if (emtlResult.applicable && emtlAmount > 0) {
      try {
        const emtlRecord = await EMTLTransaction.createRecord({
          transactionId: `EMTL-${referenceNo}`,
          transactionReference: referenceNo,
          customerNo: account.customer_id || 'N/A',
          accountNo: remitter.account,
          amount: emtlAmount,
          transferAmount: parsedAmount,
          transferDate: new Date(),
          channel: channel || 'API',
          transactionType: 'OUTWARD_TRANSFER',
          glAccount: emtlResult.glAccount || '2401000001',
          levyCalculation: {
            threshold: emtlResult.policy?.threshold || 10000,
            levyAmount: emtlAmount,
            levyType: emtlResult.policy?.levy_type || 'FLAT',
            appliedAt: new Date(),
            tier: emtlResult.tier || 'Tier 3',
            reason: emtlResult.reason
          },
          createdBy: currentUserId.toString()
        });
        console.log(`✅ EMTL transaction record created: ${emtlRecord.TRANSACTION_ID}`);
      } catch (emtlRecordError) {
        console.error('❌ Failed to create EMTL transaction record:', emtlRecordError.message);
      }
    }

    // ================================================================
    // ✅ CREATE OUTWARD FUNDS TRANSFER RECORD WITH VALIDATION DATA
    // ================================================================
    const outwardTransferData = {
      xferRef: xferRef,
      xferAmt: parsedAmount,
      xferCrncyId: currencyId || 1,
      payCrncyId: currencyId || 1,
      valueDt: new Date(),
      processingDate: new Date(),
      priorityLevelCd: priorityLevel || 'NORMAL',
      
      // Beneficiary details
      beneficiaryNm: beneficiaryVerifiedName,
      beneficiaryAcct: beneficiary.account,
      beneficiaryBankNm: beneficiary.bankName || 'External Bank',
      beneficiaryBankCode: beneficiary.bankCode,
      beneficiaryBankCntryId: 1,
      beneficiaryEmail: beneficiary.email || null,
      beneficiaryPhone: beneficiary.phone || null,
      
      // ✅ Validation fields
      beneficiaryVerifiedName: beneficiaryVerifiedName,
      beneficiaryValidation: validationResult ? JSON.stringify({
        verified: validationResult.verified,
        accountNumber: validationResult.accountNumber,
        accountName: validationResult.accountName,
        bankCode: validationResult.bankCode,
        bankName: validationResult.bankName,
        verifiedAt: new Date().toISOString(),
        validationMethod: 'PAYSTACK_RESOLVE'
      }) : null,
      validationStatus: validationResult ? 'VERIFIED' : 'PENDING',
      validatedAt: validationResult ? new Date() : null,
      
      // Remitter details
      remitterNm: account.customer_name || remitter.name || 'Remitter',
      remitterAcctNo: remitter.account,
      remitterCustomerId: account.customer_id || null,
      remitterEmail: remitter.email || null,
      remitterPhone: remitter.phone || null,
      
      // Charges
      sendingBankChrg: sendingBankCharge,
      receivingBankChrg: receivingBankCharge,
      nipTransactionFee: nipFee,
      vatAmount: vatAmount,
      totalChrg: totalCharges,
      netAmtXfered: parsedAmount - totalCharges,
      
      // Payment details
      payDetails: description || `Outward transfer to ${beneficiary.account}`,
      xferPurposeId: paymentPurpose || null,
      
      // NIP details
      nipChannelCode: channel || 'API',
      nipTransactionLocation: 'WEB',
      
      // Status
      recSt: RECORD_STATUS.ACTIVE,
      transactionStatus: TRANSACTION_STATUS.PROCESSING,
      repairFg: REPAIR_FLAG.NO,
      foreignOftFg: FOREIGN_OFT_FLAG.NO,
      
      // Audit
      createdBy: currentUserId.toString(),
      userId: currentUserId.toString(),
      versionNo: 1,
      rowTs: new Date(),
      createDt: new Date(),
      sysCreateTs: new Date()
    };

    const outwardTransfer = await OutwardFundsTransfer.create(outwardTransferData, { transaction });
    console.log(`✅ Outward transfer record created: ${outwardTransfer.xferRef}`);

    await transaction.commit();
    console.log(`✅ Outward transfer ${referenceNo} completed successfully`);

    // ================================================================
    // ✅ SEND SMS NOTIFICATION TO SENDER
    // ================================================================
    if (account.sms_alert && account.phone_number) {
      try {
        const smsMessage = `Dear ${account.customer_name || 'Customer'}, 
Your outward transfer of ₦${safeToFixed(parsedAmount)} to ${beneficiaryVerifiedName} (${beneficiary.account}) has been processed. 
Ref: ${referenceNo}
New Balance: ₦${safeToFixed(newBalance)}`;
        
        await smsService.sendSMS(account.phone_number, smsMessage);
      } catch (smsError) {
        console.warn('⚠️ SMS notification failed:', smsError.message);
      }
    }

    // ================================================================
    // ✅ SEND APPROVAL NOTIFICATION TO SUPERVISORS IN BRANCH
    // ================================================================
    try {
      const BU_ID = branchId || account.BU_ID || remitter.buId || '101';
      
      console.log(`📨 Sending approval notification to supervisors in BU: ${BU_ID}`);
      
      const notificationResult = await sendApprovalNotificationToBUUsers({
        BU_ID: BU_ID,
        itemType: 'outward_transfer',
        itemId: referenceNo,
        itemName: `Outward Transfer to ${beneficiaryVerifiedName}`,
        description: `Amount: ₦${safeToFixed(parsedAmount)} | Beneficiary: ${beneficiary.account} | Bank: ${beneficiary.bankName}`,
        submittedBy: account.customer_name || currentUserId || 'System',
        priority: parsedAmount > 1000000 ? 'high' : 'medium',
        metadata: {
          accountNumber: remitter.account,
          customerName: account.customer_name,
          amount: parsedAmount,
          beneficiaryAccount: beneficiary.account,
          beneficiaryName: beneficiaryVerifiedName,
          bankCode: beneficiary.bankCode,
          bankName: beneficiary.bankName,
          reference: referenceNo,
          xferRef: xferRef,
          channel: channel || 'API',
          transferType: transferType || 'OUTWARD',
          validationStatus: validationResult?.verified ? 'VERIFIED' : 'PENDING',
          validatedAt: validationResult?.verifiedAt || null,
          emtlAmount: emtlAmount,
          totalCharges: totalCharges,
          totalDebit: totalDebitAmount,
          newBalance: newBalance
        }
      });
      
      if (notificationResult.success) {
        console.log(`✅ Approval notification sent to ${notificationResult.notificationCount} user(s) in BU ${BU_ID}`);
      } else {
        console.warn(`⚠️ Approval notification partially failed: ${notificationResult.message || 'Unknown error'}`);
      }
    } catch (notifError) {
      console.error('❌ Error sending approval notification:', notifError.message);
    }

    // ================================================================
    // RESPONSE
    // ================================================================
    return res.status(201).json({
      success: true,
      message: 'Outward transfer initiated successfully',
      data: {
        reference_no: referenceNo,
        xferRef: xferRef,
        amount: parsedAmount,
        emtl_charged: emtlAmount,
        total_debited: totalDebitAmount,
        new_balance: newBalance,
        validation: validationResult ? {
          verified: validationResult.verified,
          accountName: validationResult.accountName,
          bankName: validationResult.bankName,
          verifiedAt: new Date().toISOString()
        } : null,
        charges: {
          sending_bank: sendingBankCharge,
          receiving_bank: receivingBankCharge,
          nip_fee: nipFee,
          vat: vatAmount,
          total: totalCharges
        },
        beneficiary: {
          account: beneficiary.account,
          name: beneficiaryVerifiedName,
          providedName: beneficiary.name,
          bankCode: beneficiary.bankCode,
          bankName: beneficiary.bankName
        },
        remitter: {
          account: remitter.account,
          name: account.customer_name
        },
        transaction_date: new Date(),
        status: 'PROCESSING',
        charges_breakdown: {
          emtl: {
            amount: emtlAmount,
            applicable: emtlResult.applicable,
            reason: emtlResult.reason,
            glAccount: emtlResult.glAccount,
            beneficiary: emtlResult.beneficiary
          }
        },
        transfer_record: outwardTransfer.getSummary ? outwardTransfer.getSummary() : outwardTransfer.toJSON(),
        notification_sent: true
      }
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Outward transfer initiation failed:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate outward transfer'
    });
  }
},

  /**
   * Get Banks List
   * GET /api/transfers/banks
   */
  async getBanks(req, res) {
    try {
      const { currency = 'NGN' } = req.query;
      
      if (!PAYSTACK_SECRET_KEY) {
        return res.status(400).json({
          success: false,
          message: 'Paystack secret key not configured. Please add PAYSTACK_SECRET_KEY to your .env file.',
          hint: 'Get your secret key from https://dashboard.paystack.com/#/settings/developer'
        });
      }

      console.log(`🔍 Fetching banks for currency: ${currency}`);
      
      const response = await axios.get(`${PAYSTACK_BASE_URL}/bank`, {
        params: { currency },
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000
      });
      
      if (response.data.status) {
        console.log(`✅ Retrieved ${response.data.data.length} banks`);
        return res.status(200).json({
          success: true,
          banks: response.data.data,
          message: `Retrieved ${response.data.data.length} banks`
        });
      }
      
      return res.status(400).json({
        success: false,
        message: response.data.message || 'Failed to fetch banks'
      });
    } catch (error) {
      console.error('❌ Error fetching banks:', error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        return res.status(401).json({
          success: false,
          message: 'Invalid Paystack secret key. Please check your configuration.'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: error.response?.data?.message || 'Failed to fetch banks'
      });
    }
  },

  /**
   * Verify Beneficiary Account
   * POST /api/transfers/beneficiaries/verify
   */
  async verifyBeneficiary(req, res) {
    try {
      const { accountNumber, bankCode } = req.body;
      
      if (!accountNumber || !bankCode) {
        return res.status(400).json({
          success: false,
          message: 'Account number and bank code are required'
        });
      }
      
      if (!PAYSTACK_SECRET_KEY) {
        return res.status(400).json({
          success: false,
          message: 'Paystack secret key not configured. Please add PAYSTACK_SECRET_KEY to your .env file.',
          hint: 'Get your secret key from https://dashboard.paystack.com/#/settings/developer'
        });
      }
      
      const result = await resolvePaystackAccount(accountNumber, bankCode);
      
      if (result.success) {
        return res.status(200).json({
          success: true,
          verified: true,
          accountNumber: result.accountNumber,
          accountName: result.accountName,
          bankCode: result.bankCode,
          bankName: result.bankName,
          message: 'Account verified successfully'
        });
      }
      
      return res.status(400).json(result);
    } catch (error) {
      logger.error('Error verifying beneficiary:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify beneficiary account',
        error: error.message
      });
    }
  },

  /**
   * Test Paystack Configuration
   * GET /api/transfers/paystack/test
   */
  async testPaystackConfig(req, res) {
    try {
      const config = {
        hasSecretKey: !!PAYSTACK_SECRET_KEY,
        secretKeyPrefix: PAYSTACK_SECRET_KEY ? PAYSTACK_SECRET_KEY.substring(0, 10) + '...' : 'Not set',
        hasPublicKey: !!PAYSTACK_PUBLIC_KEY,
        publicKeyPrefix: PAYSTACK_PUBLIC_KEY ? PAYSTACK_PUBLIC_KEY.substring(0, 10) + '...' : 'Not set',
        baseUrl: PAYSTACK_BASE_URL,
        environment: PAYSTACK_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : 
                     PAYSTACK_SECRET_KEY?.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN'
      };
      
      let testResult = { success: false, message: 'Not tested' };
      
      if (PAYSTACK_SECRET_KEY) {
        try {
          const response = await axios.get(`${PAYSTACK_BASE_URL}/bank`, {
            params: { currency: 'NGN' },
            headers: {
              'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000
          });
          
          if (response.data.status) {
            testResult = {
              success: true,
              message: 'Paystack API is working correctly',
              bankCount: response.data.data?.length || 0
            };
          } else {
            testResult = {
              success: false,
              message: response.data.message || 'Paystack API returned an error'
            };
          }
        } catch (error) {
          testResult = {
            success: false,
            message: error.response?.data?.message || error.message,
            status: error.response?.status
          };
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'Paystack configuration test results',
        data: {
          config,
          testResult
        }
      });
    } catch (error) {
      console.error('❌ Error testing Paystack config:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to test Paystack configuration',
        error: error.message
      });
    }
  },

  /**
   * Approve a pending outward transfer
   * POST /api/outward/transfer/:reference/approve
   */
  async approveTransfer(req, res) {
    try {
      const { reference } = req.params;
      const approverId = req.user?.id || req.user?.userId || 'SYSTEM';

      const transfer = await OutwardFundsTransfer.findOne({
        where: { 
          xferRef: reference,
          transactionStatus: TRANSACTION_STATUS.INITIATED
        }
      });

      if (!transfer) {
        return res.status(404).json({
          success: false,
          error: 'Transfer not found or already processed'
        });
      }

      await transfer.update({
        transactionStatus: TRANSACTION_STATUS.PROCESSING,
        processingDate: new Date(),
        rowTs: new Date()
      });

      await transfer.update({
        transactionStatus: TRANSACTION_STATUS.COMPLETED,
        completedDate: new Date(),
        rowTs: new Date()
      });

      return res.status(200).json({
        success: true,
        message: 'Transfer approved and processed successfully',
        data: transfer.getSummary ? transfer.getSummary() : transfer.toJSON()
      });
    } catch (error) {
      logger.error('Approve transfer error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Reject a pending outward transfer
   * POST /api/outward/transfer/:reference/reject
   */
  async rejectTransfer(req, res) {
    try {
      const { reference } = req.params;
      const { reason } = req.body;
      const approverId = req.user?.id || req.user?.userId || 'SYSTEM';

      const transfer = await OutwardFundsTransfer.findOne({
        where: { 
          xferRef: reference,
          transactionStatus: {
            [Op.in]: [TRANSACTION_STATUS.INITIATED, TRANSACTION_STATUS.PROCESSING]
          }
        }
      });

      if (!transfer) {
        return res.status(404).json({
          success: false,
          error: 'Transfer not found or already processed'
        });
      }

      await transfer.update({
        transactionStatus: TRANSACTION_STATUS.FAILED,
        failureReason: reason || 'Rejected by approver',
        recSt: RECORD_STATUS.INACTIVE,
        rowTs: new Date()
      });

      return res.status(200).json({
        success: true,
        message: 'Transfer rejected successfully',
        data: transfer.getSummary ? transfer.getSummary() : transfer.toJSON()
      });
    } catch (error) {
      logger.error('Reject transfer error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Get transfer status by reference
   * GET /api/outward/transfer/:reference
   */
  async getTransferStatus(req, res) {
    try {
      const { reference } = req.params;
      
      const transfer = await OutwardFundsTransfer.findOne({
        where: { xferRef: reference }
      });
      
      if (!transfer) {
        return res.status(404).json({
          success: false,
          error: 'Transfer not found'
        });
      }
      
      return res.status(200).json({
        success: true,
        data: transfer.getSummary ? transfer.getSummary() : transfer.toJSON()
      });
    } catch (error) {
      logger.error('Status check failed:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Get pending transfers
   * GET /api/outward/transfers/pending
   */
  async getPendingTransfers(req, res) {
    try {
      const { status } = req.query;
      const where = {};
      
      if (status) {
        where.transactionStatus = status;
      } else {
        where.transactionStatus = {
          [Op.in]: [TRANSACTION_STATUS.INITIATED, TRANSACTION_STATUS.PROCESSING]
        };
      }
      
      const transfers = await OutwardFundsTransfer.findAll({
        where,
        order: [['createDt', 'DESC']]
      });
      
      return res.status(200).json({
        success: true,
        data: transfers.map(t => t.getSummary ? t.getSummary() : t.toJSON()),
        count: transfers.length
      });
    } catch (error) {
      logger.error('Get pending transfers error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Get transfer by reference with full details
   * GET /api/outward/transfer/:reference/details
   */
  async getTransferDetails(req, res) {
    try {
      const { reference } = req.params;
      
      const transfer = await OutwardFundsTransfer.findOne({
        where: { xferRef: reference }
      });
      
      if (!transfer) {
        return res.status(404).json({
          success: false,
          error: 'Transfer not found'
        });
      }
      
      return res.status(200).json({
        success: true,
        data: {
          summary: transfer.getSummary ? transfer.getSummary() : transfer.toJSON(),
          beneficiary: transfer.beneficiary || null,
          remitter: transfer.remitter || null,
          charges: transfer.charges || null,
          raw: transfer.toJSON(),
          validation: {
            status: transfer.validationStatus,
            verifiedName: transfer.beneficiaryVerifiedName,
            validatedAt: transfer.validatedAt,
            details: transfer.beneficiaryValidation ? JSON.parse(transfer.beneficiaryValidation) : null
          }
        }
      });
    } catch (error) {
      logger.error('Get transfer details error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Get transfer statistics
   * GET /api/outward/transfers/stats
   */
  async getTransferStats(req, res) {
    try {
      const { startDate, endDate } = req.query;
      
      const where = {};
      if (startDate && endDate) {
        where.createDt = {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        };
      }
      
      const stats = await OutwardFundsTransfer.findAll({
        where,
        attributes: [
          'transactionStatus',
          'validationStatus',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('xferAmt')), 'totalAmount']
        ],
        group: ['transactionStatus', 'validationStatus']
      });
      
      return res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Get transfer stats error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Handle Paystack webhook
   * POST /api/outward/webhook/paystack
   */
  async handlePaystackWebhook(req, res) {
    try {
      const signature = req.headers['x-paystack-signature'];
      const event = req.body;
      
      const transfer = await OutwardFundsTransfer.findOne({
        where: { 
          paystackReference: event.data?.reference || event.data?.transaction_reference
        }
      });

      if (!transfer) {
        logger.warn('Webhook: Transfer not found', { reference: event.data?.reference });
        return res.status(200).json({ status: 'ignored', message: 'Transfer not found' });
      }

      if (event.event === 'charge.success') {
        await transfer.update({
          transactionStatus: TRANSACTION_STATUS.COMPLETED,
          completedDate: new Date(),
          amountReceived: event.data?.amount ? safeParseFloat(event.data.amount) / 100 : null,
          paystackFee: event.data?.fee ? safeParseFloat(event.data.fee) / 100 : null,
          paystackResponse: JSON.stringify(event),
          rowTs: new Date()
        });
        logger.info('Webhook: Transfer completed', { xferRef: transfer.xferRef });
      } else if (event.event === 'charge.failed') {
        await transfer.update({
          transactionStatus: TRANSACTION_STATUS.FAILED,
          failureReason: event.data?.gateway_response || 'Payment failed',
          paystackResponse: JSON.stringify(event),
          rowTs: new Date()
        });
        logger.warn('Webhook: Transfer failed', { xferRef: transfer.xferRef });
      }

      return res.status(200).json({ status: 'ok' });
    } catch (error) {
      logger.error('Webhook error:', error);
      return res.status(200).json({ status: 'ignored', error: error.message });
    }
  }
};

// Export individual functions for routes
export const initiateTransfer = outwardTransferController.initiateTransfer;
export const approveTransfer = outwardTransferController.approveTransfer;
export const rejectTransfer = outwardTransferController.rejectTransfer;
export const getTransferStatus = outwardTransferController.getTransferStatus;
export const getPendingTransfers = outwardTransferController.getPendingTransfers;
export const getTransferDetails = outwardTransferController.getTransferDetails;
export const getTransferStats = outwardTransferController.getTransferStats;
export const handlePaystackWebhook = outwardTransferController.handlePaystackWebhook;
export const getBanks = outwardTransferController.getBanks;
export const verifyBeneficiary = outwardTransferController.verifyBeneficiary;
export const testPaystackConfig = outwardTransferController.testPaystackConfig;