// Services/postTransaction.js - UPDATED with AI Sanction Check Integration
// ============================================================================
// Features:
// 1. ✅ Uses SERVER DATE as the processing/transaction date (from /system-date/current)
// 2. ✅ Uses SYSTEM TIME (user's local computer time) for audit records
// 3. ✅ Stores both server date and system time for complete audit trail
// 4. ✅ Properly sets created_by to the actual user ID
// 5. ✅ Full EMTL integration
// 6. ✅ Approval workflow with notifications
// 7. ✅ ✅ NEW: AI-Powered Sanction Check automatically before posting
// ============================================================================

import sequelize from '../../config/db.js';
import { QueryTypes } from 'sequelize';
import smsService from '../utils/smsService.js';
import moment from 'moment';
import PremblyAMLService from '../Services/PremblyAMLService.js';
import SMS from '../models/SMS.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import Drawer from '../models/Drawer.js';
import  TransactionPolicy  from '../models/TransactionPolicy.js';
import {
  EMTLPolicyService,
  EMTLCollectionService,
  EMTLRemittanceService,
  EMTLReceiptService,
  EMTLReportService
} from './index.js';
import EMTLTransaction from '../models/EMTLTransaction.js';
import SystemDate from '../models/SystemDate.js';

// ✅ Import Notification Service
import notificationService, { 
  sendApprovalNotification, 
  sendNotification 
} from '../services/NotificationService.js';

// ✅ Import AI-Powered Sanction Check
import { checkSanctionList, getAIDatabaseStats } from '../utils/checkSanctionList.js';

import Transaction from '../models/Transaction.js';

class TransactionController {
  
  // ================================================================
  // ✅ HELPER: Get Server Date (Business Date) from SystemDate
  // ================================================================
  async getServerBusinessDate() {
    try {
      const systemDate = await SystemDate.findOne({
        order: [['created_at', 'DESC']]
      });
      
      if (systemDate && systemDate.current_business_date) {
        return new Date(systemDate.current_business_date);
      }
      
      console.warn('⚠️ No system date found, using current date as fallback');
      return new Date();
    } catch (error) {
      console.error('❌ Error fetching system date:', error);
      return new Date();
    }
  }

  // ================================================================
  // ✅ HELPER: Get Server Time (for audit)
  // ================================================================
  async getServerTime() {
    try {
      const systemDate = await SystemDate.findOne({
        order: [['created_at', 'DESC']]
      });
      
      if (systemDate && systemDate.updated_at) {
        return new Date(systemDate.updated_at);
      }
      
      return new Date();
    } catch (error) {
      return new Date();
    }
  }

  // ================================================================
  // ✅ NEW: AI-Powered Sanction Check Integration
  // ================================================================
  async performAISanctionCheck(customerData, userId, ipAddress) {
    try {
      console.log('🤖 AI: Performing automatic sanction check...');
      
      const { 
        BVN, 
        NIN, 
        customerName, 
        customerEmail, 
        customerPhone,
        accountNumber,
        transactionAmount
      } = customerData;

      // Run the AI-powered sanction check
      const result = await checkSanctionList(
        BVN || null,
        NIN || null,
        customerName || null,
        userId || 'system',
        ipAddress || '0.0.0.0'
      );

      console.log('📊 AI Sanction Check Result:', {
        isSanctioned: result.isSanctioned,
        riskLevel: result.sanctionDetails?.riskLevel,
        riskScore: result.sanctionDetails?.riskScore,
        matches: result.sanctionDetails?.matches?.length || 0,
        aiDetected: result.aiDetected
      });

      // If sanction match found, block the transaction
      if (result.isSanctioned) {
        const riskLevel = result.sanctionDetails?.riskLevel || 'HIGH';
        const riskScore = result.sanctionDetails?.riskScore || 75;
        const matches = result.sanctionDetails?.matches || [];
        
        // Build detailed match descriptions
        const matchDescriptions = matches.map(m => 
          `${m.type}: ${m.description} (${m.confidence} confidence)`
        ).join('; ');

        // Log the sanction match
        console.warn(`⚠️ AI: Sanction match detected! Risk: ${riskLevel}, Score: ${riskScore}`);
        console.warn(`📋 Match details: ${matchDescriptions}`);

        // Determine if transaction should be blocked or flagged for review
        const shouldBlock = riskLevel === 'CRITICAL' || riskLevel === 'HIGH' || riskScore >= 70;
        const shouldFlagForReview = riskLevel === 'MEDIUM' || (riskScore >= 40 && riskScore < 70);

        if (shouldBlock) {
          // Block the transaction immediately
          return {
            blocked: true,
            reason: `AI Sanction Match: ${matchDescriptions}`,
            riskLevel,
            riskScore,
            matches,
            shouldBlock: true,
            shouldFlagForReview: false,
            result
          };
        } else if (shouldFlagForReview) {
          // Flag for review but allow with warning
          return {
            blocked: false,
            reason: `AI Sanction Suspicion: ${matchDescriptions}`,
            riskLevel,
            riskScore,
            matches,
            shouldBlock: false,
            shouldFlagForReview: true,
            result
          };
        }
      }

      // No sanction match - proceed normally
      return {
        blocked: false,
        reason: 'AI Sanction Check: Clear',
        riskLevel: result.sanctionDetails?.riskLevel || 'LOW',
        riskScore: result.sanctionDetails?.riskScore || 0,
        matches: [],
        shouldBlock: false,
        shouldFlagForReview: false,
        result
      };

    } catch (error) {
      console.error('❌ AI Sanction Check Error:', error.message);
      // Fail-safe - allow transaction but log warning
      return {
        blocked: false,
        reason: `AI Sanction Check Error: ${error.message}`,
        riskLevel: 'UNKNOWN',
        riskScore: 0,
        matches: [],
        shouldBlock: false,
        shouldFlagForReview: false,
        result: null,
        error: error.message
      };
    }
  }


// In your TransactionController class, add this method:

// ================================================================
// ✅ INTERBRANCH HELPER - QUERY GL_ACCOUNTS TABLE ONLY
// ================================================================
async getInterbranchGlAccount(sourceBranch, destBranch, transaction) {
  try {
    console.log(`🔍 Looking for interbranch GL for branch: ${sourceBranch}`);
    
    // Method 1: Find by account_type = 'INTER_BRANCH_SETTLEMENT' and branch
    const [result] = await sequelize.query(
      `SELECT gl_acct_no, acct_desc, branch_code 
       FROM gl_accounts 
       WHERE account_type = 'INTER_BRANCH_SETTLEMENT' 
         AND branch_code = :sourceBranch
         AND rec_st = 'Active'
       LIMIT 1`,
      {
        replacements: { sourceBranch: sourceBranch || '101' },
        type: QueryTypes.SELECT,
        transaction
      }
    );
    
    if (result) {
      console.log(`✅ Found interbranch GL by account_type: ${result.gl_acct_no}`);
      return result.gl_acct_no;
    }
    
    // Method 2: Find by acct_desc = 'INTER_BRANCH_SETTLEMENT'
    const [resultByDesc] = await sequelize.query(
      `SELECT gl_acct_no, acct_desc, branch_code 
       FROM gl_accounts 
       WHERE acct_desc = 'INTER_BRANCH_SETTLEMENT' 
         AND branch_code = :sourceBranch
         AND rec_st = 'Active'
       LIMIT 1`,
      {
        replacements: { sourceBranch: sourceBranch || '101' },
        type: QueryTypes.SELECT,
        transaction
      }
    );
    
    if (resultByDesc) {
      console.log(`✅ Found interbranch GL by description: ${resultByDesc.gl_acct_no}`);
      return resultByDesc.gl_acct_no;
    }
    
    // Method 3: Find by category_code = '6000'
    const [resultByCategory] = await sequelize.query(
      `SELECT gl_acct_no, acct_desc, branch_code 
       FROM gl_accounts 
       WHERE category_code = '6000' 
         AND branch_code = :sourceBranch
         AND rec_st = 'Active'
       LIMIT 1`,
      {
        replacements: { sourceBranch: sourceBranch || '101' },
        type: QueryTypes.SELECT,
        transaction
      }
    );
    
    if (resultByCategory) {
      console.log(`✅ Found interbranch GL by category: ${resultByCategory.gl_acct_no}`);
      return resultByCategory.gl_acct_no;
    }
    
    // Method 4: Fallback - any interbranch GL regardless of branch
    const [fallbackResult] = await sequelize.query(
      `SELECT gl_acct_no, acct_desc, branch_code 
       FROM gl_accounts 
       WHERE (account_type = 'INTER_BRANCH_SETTLEMENT' 
          OR acct_desc = 'INTER_BRANCH_SETTLEMENT'
          OR acct_desc LIKE '%INTER_BRANCH%'
          OR category_code = '6000')
         AND rec_st = 'Active'
       LIMIT 1`,
      {
        type: QueryTypes.SELECT,
        transaction
      }
    );
    
    if (fallbackResult) {
      console.log(`✅ Found fallback interbranch GL: ${fallbackResult.gl_acct_no}`);
      return fallbackResult.gl_acct_no;
    }
    
    console.warn('⚠️ No interbranch GL account found in gl_accounts table');
    return null;
    
  } catch (error) {
    console.error('❌ Error getting interbranch GL account:', error.message);
    return null;
  }
}

// ================================================================
// ✅ POST TRANSACTION - COMPLETE FIXED VERSION
// ================================================================
async postTransaction(req, res) {
  const transaction = await sequelize.transaction();

  try {
    // ==================== AUTO-CREATE TABLES ====================
    await sequelize.query(
      `
      CREATE TABLE IF NOT EXISTS deposit_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id VARCHAR(20),
        account_number VARCHAR(20),
        transaction_type VARCHAR(50),
        amount DECIMAL(20,2),
        emtl_amount DECIMAL(20,2) DEFAULT 0,
        total_debit DECIMAL(20,2) DEFAULT 0,
        emtl_applicable BOOLEAN DEFAULT FALSE,
        emtl_reason VARCHAR(255),
        emtl_gl_account VARCHAR(20),
        emtl_beneficiary VARCHAR(100),
        emtl_remittance_status VARCHAR(20) DEFAULT 'PENDING',
        emtl_remittance_batch_id VARCHAR(100),
        emtl_remitted_date DATETIME,
        emtl_remittance_reference VARCHAR(100),
        currency VARCHAR(3) DEFAULT 'NGN',
        status VARCHAR(20) DEFAULT 'PENDING',
        aml_risk_level VARCHAR(20),
        aml_risk_score INT,
        aml_indicators TEXT,
        created_by VARCHAR(100),
        transaction_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        branch_id VARCHAR(10),
        approved_by VARCHAR(100),
        approved_at DATETIME,
        transaction_ref_no VARCHAR(100) UNIQUE,
        description TEXT,
        requires_approval BOOLEAN DEFAULT FALSE,
        approved_by_role VARCHAR(100),
        approval_status VARCHAR(20) DEFAULT 'PENDING',
        depositor_name VARCHAR(100),
        server_processing_date DATETIME,
        system_time DATETIME,
        system_user_id VARCHAR(100),
        sanction_check_result JSON,
        ai_sanction_status VARCHAR(20) DEFAULT 'CLEAR',
        INDEX idx_account_number (account_number),
        INDEX idx_customer_id (customer_id),
        INDEX idx_created_by (created_by),
        INDEX idx_transaction_date (transaction_date),
        INDEX idx_emtl_applicable (emtl_applicable),
        INDEX idx_emtl_remittance_status (emtl_remittance_status),
        INDEX idx_server_processing_date (server_processing_date),
        INDEX idx_system_time (system_time)
      )
      `,
      { transaction }
    );

    await sequelize.query(
      `
      CREATE TABLE IF NOT EXISTS drawer_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        drawer_id INT NOT NULL,
        drawer_no VARCHAR(50) NOT NULL,
        transaction_type VARCHAR(20) NOT NULL,
        amount DECIMAL(20,2) NOT NULL,
        previous_balance DECIMAL(20,2) NOT NULL,
        new_balance DECIMAL(20,2) NOT NULL,
        transaction_ref_no VARCHAR(100),
        customer_account VARCHAR(20),
        description TEXT,
        user_id VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_drawer_id (drawer_id),
        INDEX idx_drawer_no (drawer_no),
        INDEX idx_transaction_ref (transaction_ref_no)
      )
      `,
      { transaction }
    );

    await EMTLTransaction.initializeTable();

    await sequelize.query(
      `
      CREATE TABLE IF NOT EXISTS emtl_collections (
        id INT PRIMARY KEY AUTO_INCREMENT,
        transaction_id VARCHAR(100) NOT NULL,
        transaction_reference VARCHAR(100) NOT NULL,
        customer_no VARCHAR(50) NOT NULL,
        account_no VARCHAR(20) NOT NULL,
        amount DECIMAL(20,2) NOT NULL,
        transfer_amount DECIMAL(20,2) NOT NULL,
        transfer_date DATETIME NOT NULL,
        channel VARCHAR(50) DEFAULT 'WEB',
        transaction_type VARCHAR(50) DEFAULT 'TRANSFER',
        status VARCHAR(20) DEFAULT 'PENDING_REMITTANCE',
        remittance_batch_id VARCHAR(100),
        remitted_date DATETIME,
        remittance_reference VARCHAR(100),
        gl_account VARCHAR(20) DEFAULT '2401000001',
        levy_calculation JSON,
        created_by VARCHAR(100) DEFAULT 'SYSTEM',
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(100),
        updated_date DATETIME,
        server_processing_date DATETIME,
        system_time DATETIME,
        INDEX idx_transaction_id (transaction_id),
        INDEX idx_reference (transaction_reference),
        INDEX idx_account (account_no),
        INDEX idx_status (status),
        INDEX idx_created_date (created_date)
      )
      `,
      { transaction }
    );

    // ================================================================
    // ✅ GL TRANSACTIONS TABLE
    // ================================================================
    await sequelize.query(
      `
      CREATE TABLE IF NOT EXISTS gl_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        gl_account_no VARCHAR(50) NOT NULL,
        transaction_type VARCHAR(20) NOT NULL,
        amount DECIMAL(20,2) NOT NULL,
        previous_balance DECIMAL(20,2) NOT NULL,
        new_balance DECIMAL(20,2) NOT NULL,
        reference_no VARCHAR(100),
        drawer_id INT,
        drawer_no VARCHAR(50),
        account_number VARCHAR(50),
        description TEXT,
        created_by VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        transaction_date DATETIME,
        source_reference VARCHAR(100),
        INDEX idx_gl_account (gl_account_no),
        INDEX idx_created_at (created_at),
        INDEX idx_reference (reference_no)
      )
      `,
      { transaction }
    );

    if (req.decrypted) console.log('🔓 Request decrypted');

    const transactionData = req.body;

    // ================================================================
    // ✅ GENERATE REFERENCE NUMBER
    // ================================================================
    const generateReferenceNumber = () => {
      const timestamp = Date.now().toString();
      const randomDigits = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
      return (timestamp + randomDigits).slice(0, 18);
    };

    const referenceNo = generateReferenceNumber();

    // ================================================================
    // ✅ USER ID EXTRACTION
    // ================================================================
    const authenticatedUser = req.user || {};
    let userId = authenticatedUser.username || 
                 authenticatedUser.id || 
                 authenticatedUser.user_name ||
                 authenticatedUser.userId ||
                 transactionData.USER_ID || 
                 transactionData.userId ||
                 transactionData.CREATED_BY || 
                 transactionData.createdBy ||
                 (authenticatedUser.role ? 'TELLER' : null) ||
                 'system';

    const userRole = authenticatedUser.role || 
                     authenticatedUser.user_role ||
                     transactionData.USER_ROLE || 
                     'TELLER';

    const normalizedRole = userRole.toUpperCase();

    console.log(`👤 Transaction created by: ${userId} (Role: ${normalizedRole})`);

    if (userId === 'system' && transactionData.DRAWER_ID) {
      const drawerLookup = await Drawer.findOne({ 
        where: { DRAWER_NO: transactionData.DRAWER_ID.toString() }
      });
      if (drawerLookup && drawerLookup.USER_ID) {
        userId = drawerLookup.USER_ID;
        console.log(`✅ Using drawer's USER_ID: ${userId}`);
      }
    }

    console.log(`📝 Processing transaction:`, {
      ACCT_NO: transactionData.ACCT_NO,
      AMOUNT: transactionData.AMOUNT,
      TRANSACTION_TYPE: transactionData.TRANSACTION_TYPE,
      DESCRIPTION: transactionData.DESCRIPTION,
      DRAWER_ID: transactionData.DRAWER_ID,
      USER_ROLE: userRole,
      AUTH_USER: authenticatedUser.username || authenticatedUser.id || 'unknown',
      DECRYPTED: req.decrypted || false,
    });

    // ================================================================
    // ✅ GET SERVER BUSINESS DATE
    // ================================================================
    const serverBusinessDate = await this.getServerBusinessDate();
    const serverBusinessDateStr = serverBusinessDate.toISOString();
    console.log(`📅 Server Business Date: ${serverBusinessDateStr}`);

    // ================================================================
    // ✅ GET SYSTEM TIME
    // ================================================================
    const systemTime = new Date();
    const systemTimeStr = systemTime.toISOString();
    console.log(`🖥️ System Time: ${systemTimeStr}`);

    // ================================================================
    // ✅ GET SERVER TIME
    // ================================================================
    const serverTime = await this.getServerTime();
    const serverTimeStr = serverTime.toISOString();
    console.log(`☁️ Server Time: ${serverTimeStr}`);

    // ================================================================
    // ✅ EXTRACT TRANSACTION DATA
    // ================================================================
    const accountNumber = transactionData.ACCT_NO || transactionData.account_number;
    const amount = parseFloat(transactionData.AMOUNT || transactionData.amount);
    const transactionType = transactionData.TRANSACTION_TYPE || transactionData.transaction_type;
    const depositorName = transactionData.DEPOSITOR_NAME || transactionData.depositor_name;
    const description = transactionData.DESCRIPTION || transactionData.description || 'Cash Transaction';
    const valueDate = transactionData.VALUE_DATE || transactionData.value_date || serverBusinessDate;
    const businessUnit = transactionData.BUSINESS_UNIT || transactionData.business_unit || '001';
    const currency = transactionData.CURRENCY || transactionData.currency || 'NGN';
    const branchId = transactionData.BU_ID || transactionData.branch_id || businessUnit;
    const contraAccountNo = transactionData.CONTRA_ACCT_NO || transactionData.contra_account_no || null;
    const chequeNo = transactionData.CHEQUE_NO || transactionData.cheque_no || null;
    const supervisorId = transactionData.SUPERVISOR_ID || transactionData.supervisor_id || null;

    if (!accountNumber)
      throw { status: 400, code: 'MISSING_ACCOUNT', message: 'Account number required' };
    if (!amount || isNaN(amount) || amount <= 0)
      throw { status: 400, code: 'INVALID_AMOUNT', message: 'Valid amount required' };
    if (!transactionType)
      throw { status: 400, code: 'MISSING_TRANSACTION_TYPE', message: 'Transaction type required' };

    const validTypes = ['CR', 'DR', 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER'];
    const normalized = transactionType.toUpperCase();
    if (!validTypes.includes(normalized))
      throw { status: 400, code: 'INVALID_TRANSACTION_TYPE', message: 'Invalid type' };

    const isDeposit = normalized === 'CR' || normalized === 'DEPOSIT';
    const isWithdrawal = normalized === 'DR' || normalized === 'WITHDRAWAL';
    const isTransfer = normalized === 'TRANSFER';

    const policyType = isDeposit ? 'Deposit' : 'Withdrawal';

    // ================================================================
    // ✅ FIND ACCOUNT FOR SANCTION CHECK
    // ================================================================
    let customerInfo = {
      BVN: null,
      NIN: null,
      customerName: null,
      customerEmail: null,
      customerPhone: null,
      accountNumber: accountNumber
    };

    try {
      const [accountInfo] = await sequelize.query(
        `
        SELECT 
          c.BVN,
          c.NIN,
          CONCAT(c.FIRST_NAME, ' ', c.LAST_NAME) AS customer_name,
          c.EMAIL_ADDRESS AS customer_email,
          c.PHONE_NO AS customer_phone,
          ca.account_number
        FROM customer_accounts ca
        LEFT JOIN customers c ON ca.CUST_ID = c.CUST_ID
        WHERE ca.account_number = :accountNumber
        LIMIT 1
        `,
        {
          replacements: { accountNumber },
          type: QueryTypes.SELECT,
          transaction
        }
      );

      if (accountInfo) {
        customerInfo = {
          BVN: accountInfo.BVN || null,
          NIN: accountInfo.NIN || null,
          customerName: accountInfo.customer_name || depositorName || null,
          customerEmail: accountInfo.customer_email || null,
          customerPhone: accountInfo.customer_phone || null,
          accountNumber: accountNumber
        };
        console.log('✅ Customer info found for sanction check');
      }
    } catch (customerError) {
      console.warn('⚠️ Could not fetch customer info for sanction check:', customerError.message);
    }

    // ================================================================
    // ✅ AI-POWERED SANCTION CHECK
    // ================================================================
    console.log('🤖 AI: Running automatic sanction check...');
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '0.0.0.0';
    
    const sanctionResult = await this.performAISanctionCheck(
      {
        BVN: customerInfo.BVN,
        NIN: customerInfo.NIN,
        customerName: customerInfo.customerName || depositorName,
        customerEmail: customerInfo.customerEmail,
        customerPhone: customerInfo.customerPhone,
        accountNumber: accountNumber,
        transactionAmount: amount
      },
      userId,
      ipAddress
    );

    console.log('📊 AI Sanction Check Result:', {
      blocked: sanctionResult.blocked,
      riskLevel: sanctionResult.riskLevel,
      riskScore: sanctionResult.riskScore,
      matches: sanctionResult.matches?.length || 0,
      shouldFlagForReview: sanctionResult.shouldFlagForReview
    });

    // ✅ If AI detects sanction match and should block
    if (sanctionResult.blocked) {
      await transaction.rollback();
      console.warn('🚫 AI: Transaction blocked due to sanction match');
      
      try {
        await sendNotification({
          roleId: 'Admin',
          message: `🚫 Transaction BLOCKED by AI Sanction Check for ${accountNumber}: ${sanctionResult.reason}`,
          itemId: `BLOCKED-${Date.now()}`,
          priority: 'urgent',
          metadata: {
            accountNumber,
            amount,
            sanctionResult,
            customerName: customerInfo.customerName,
            timestamp: new Date().toISOString()
          }
        });
      } catch (notifError) {
        console.warn('⚠️ Failed to send sanction block notification:', notifError.message);
      }

      return res.status(403).json({
        success: false,
        message: 'Transaction blocked by AI Sanction Check',
        code: 'SANCTION_MATCH',
        sanction: {
          blocked: true,
          reason: sanctionResult.reason,
          riskLevel: sanctionResult.riskLevel,
          riskScore: sanctionResult.riskScore,
          matches: sanctionResult.matches,
          aiDetected: true
        },
        timestamp: new Date().toISOString()
      });
    }

    // ✅ If AI detects suspicious activity - require approval
    let requiresApproval = false;
    let authorizedRoles = [];
    
    if (sanctionResult.shouldFlagForReview) {
      console.warn('⚠️ AI: Transaction flagged for review due to sanction suspicion');
      requiresApproval = true;
      if (!authorizedRoles || authorizedRoles.length === 0) {
        authorizedRoles = ['SUPERVISOR', 'MANAGER', 'ADMIN'];
      }
      
      try {
        await sendNotification({
          roleId: 'Admin',
          message: `⚠️ AI Flagged: Transaction requires review for ${accountNumber}: ${sanctionResult.reason}`,
          itemId: `FLAGGED-${Date.now()}`,
          priority: 'high',
          metadata: {
            accountNumber,
            amount,
            sanctionResult,
            customerName: customerInfo.customerName,
            requiresApproval: true,
            timestamp: new Date().toISOString()
          }
        });
      } catch (notifError) {
        console.warn('⚠️ Failed to send flag notification:', notifError.message);
      }
    }

    // ================================================================
    // ✅ EMTL CALCULATION
    // ================================================================
    let emtlResult = { amount: 0, applicable: false, reason: 'Not applicable' };
    
    if (isWithdrawal || isTransfer) {
      try {
        emtlResult = await EMTLPolicyService.calculateEMTL({
          amount: amount,
          transactionType: transactionType,
          customerSegment: transactionData.CUSTOMER_SEGMENT || transactionData.customerSegment,
          sourceCustomer: transactionData.SOURCE_CUSTOMER || transactionData.sourceCustomer,
          destinationCustomer: transactionData.DESTINATION_CUSTOMER || transactionData.destinationCustomer,
        });
        
        console.log(`💰 EMTL Calculation:`, {
          amount: emtlResult.amount,
          applicable: emtlResult.applicable,
          reason: emtlResult.reason,
          glAccount: emtlResult.glAccount,
          beneficiary: emtlResult.beneficiary
        });
      } catch (emtlError) {
        console.error('❌ EMTL calculation error:', emtlError.message);
        emtlResult = { amount: 0, applicable: false, reason: 'EMTL calculation failed' };
      }
    }

    // ================================================================
    // ✅ TRANSACTION POLICY VALIDATION - FIXED (NO DUPLICATE DECLARATION)
    // ================================================================
    let policyFound = false;

    try {
      console.log(`🔍 Checking policy for ${normalizedRole} - ${policyType}`);
      console.log(`🔍 Amount: ${amount}, Business Unit: ${businessUnit}, Branch: ${branchId}`);
      
      // ✅ DIRECT SQL QUERY TO DEBUG
      const [policyCount] = await sequelize.query(
        `SELECT COUNT(*) as count FROM transaction_policies 
         WHERE role_name = :roleName 
           AND policy_type = :policyType 
           AND status = 'ACTIVE'`,
        {
          replacements: {
            roleName: normalizedRole,
            policyType: policyType
          },
          type: QueryTypes.SELECT,
          transaction
        }
      );
      console.log(`📊 Direct SQL count: ${policyCount?.count || 0} policies found`);
      
      // ✅ Direct SQL query to get the policy
      const [policyResult] = await sequelize.query(
        `SELECT * FROM transaction_policies 
         WHERE role_name = :roleName 
           AND policy_type = :policyType 
           AND status = 'ACTIVE'
         ORDER BY 
           CASE WHEN bu_id = :buId AND branch_code = :branchCode THEN 1
                WHEN bu_id = :buId THEN 2
                WHEN branch_code = :branchCode THEN 3
                ELSE 4
           END
         LIMIT 1`,
        {
          replacements: {
            roleName: normalizedRole,
            policyType: policyType,
            buId: businessUnit || '100',
            branchCode: branchId || '100'
          },
          type: QueryTypes.SELECT,
          transaction
        }
      );
      
      if (policyResult) {
        policyFound = true;
        console.log(`✅ Found policy: ${policyResult.policy_id}`);
        console.log(`   Min: ${policyResult.min_amount}, Max: ${policyResult.max_amount}`);
        console.log(`   Requires Approval: ${policyResult.requires_approval}`);
        
        // Check if amount is within range
        const minAmount = parseFloat(policyResult.min_amount || 0);
        const maxAmount = parseFloat(policyResult.max_amount || 999999999.99);
        
        if (amount >= minAmount && amount <= maxAmount) {
          requiresApproval = policyResult.requires_approval === 1;
          authorizedRoles = policyResult.authorized_roles 
            ? policyResult.authorized_roles.split(',').map(r => r.trim())
            : ['SUPERVISOR', 'MANAGER'];
          console.log(`✅ Amount ₦${amount} is within range (${minAmount} - ${maxAmount})`);
          console.log(`   Requires Approval: ${requiresApproval}`);
          console.log(`   Authorized Roles: ${authorizedRoles.join(', ')}`);
        } else {
          console.warn(`⚠️ Amount ₦${amount} is outside range (${minAmount} - ${maxAmount})`);
          requiresApproval = true;
          authorizedRoles = ['SUPERVISOR', 'MANAGER'];
        }
      } else {
        console.warn(`⚠️ NO POLICY FOUND for ${normalizedRole} - ${policyType}`);
        policyFound = false;
        requiresApproval = false;
        authorizedRoles = ['SUPERVISOR', 'MANAGER'];
      }
      
    } catch (policyError) {
      console.error('❌ Error checking transaction policy:', policyError);
      requiresApproval = false;
      authorizedRoles = ['SUPERVISOR', 'MANAGER'];
      policyFound = false;
    }

    console.log(`📊 FINAL DECISION: requiresApproval = ${requiresApproval}, policyFound = ${policyFound}`);

    // ================================================================
    // ✅ AML CHECK
    // ================================================================
    const AMOUNT_THRESHOLDS = {
      LOW_RISK_MAX: 500000,
      MEDIUM_RISK_MAX: 2000000,
      HIGH_RISK_MIN: 5000000,
      CRITICAL_RISK_MIN: 10000000,
    };
    
    let amountRiskLevel = 'LOW';
    let amountRiskScore = 10;
    let amountRequiresSuspiciousReport = false;
    let shouldBlock = false;
    
    if (amount >= AMOUNT_THRESHOLDS.CRITICAL_RISK_MIN) {
      amountRiskLevel = 'CRITICAL';
      amountRiskScore = 95;
      amountRequiresSuspiciousReport = true;
      shouldBlock = true;
    } else if (amount >= AMOUNT_THRESHOLDS.HIGH_RISK_MIN) {
      amountRiskLevel = 'HIGH';
      amountRiskScore = 75;
      amountRequiresSuspiciousReport = true;
    } else if (amount > AMOUNT_THRESHOLDS.MEDIUM_RISK_MAX) {
      amountRiskLevel = 'MEDIUM';
      amountRiskScore = 50;
    } else if (amount > AMOUNT_THRESHOLDS.LOW_RISK_MAX) {
      amountRiskLevel = 'LOW_MEDIUM';
      amountRiskScore = 30;
    }
    
    const finalRiskLevel = sanctionResult.riskLevel !== 'LOW' && sanctionResult.riskLevel !== 'UNKNOWN' 
      ? sanctionResult.riskLevel 
      : amountRiskLevel;
    
    const finalRiskScore = Math.max(amountRiskScore, sanctionResult.riskScore || 0);
    
    if (shouldBlock) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Transaction blocked – critical amount exceeds limit',
        code: 'AML_BLOCK',
      });
    }

    if (amountRiskLevel === 'HIGH' || amountRiskLevel === 'CRITICAL' || sanctionResult.shouldFlagForReview) {
      requiresApproval = true;
      if (!authorizedRoles || authorizedRoles.length === 0) {
        authorizedRoles = ['SUPERVISOR', 'MANAGER', 'ADMIN'];
      }
      console.log(`🔒 AML ${amountRiskLevel} risk detected, requiring approval`);
    }

    const finalAmlCheck = {
      riskLevel: finalRiskLevel,
      riskScore: finalRiskScore,
      requiresApproval: requiresApproval,
      requiresSuspiciousReport: amountRequiresSuspiciousReport || sanctionResult.shouldFlagForReview,
      sanctionCheck: {
        performed: true,
        result: sanctionResult,
        aiDetected: true
      }
    };

    // ========== Find account ==========
    let account = null;
    let accountSummary = null;
    let customerPhoneNumber = null;
    let customerName = null;
    let allowSms = false;
    let customerId = null;

    const [customerAccount] = await sequelize.query(
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
        c.CUST_ID
      FROM customer_accounts ca
      LEFT JOIN customers c ON ca.CUST_ID = c.CUST_ID
      WHERE ca.account_number = :accountNumber
      LIMIT 1
      `,
      { replacements: { accountNumber }, type: QueryTypes.SELECT, transaction }
    );

    if (customerAccount) {
      account = customerAccount;
      customerId = account.customer_id;
      customerPhoneNumber = account.phone_number;
      customerName = account.customer_name || account.acct_nm;
      allowSms = account.sms_alert === 'Yes';
      console.log(`✅ Account found: ${account.account_number}`);

      [accountSummary] = await sequelize.query(
        `
        SELECT 
          ACCT_ID, ACCT_NO, LEDGER_BAL, CLEARED_BAL, DR_TURNOVER, CR_TURNOVER,
          DR_COUNT, CR_COUNT, LAST_DEPOSIT_DT, LAST_DEPOSIT_AMT, LAST_WITHDRAWL_DT,
          LAST_WITHDRAWL_AMT, LAST_ACTIVITY_DT, REC_ST, VERSION_NO, ROW_TS,
          USER_ID, CREATE_DT, CREATED_BY, SYS_CREATE_TS
        FROM deposit_account_summary 
        WHERE ACCT_NO = :accountNumber
        LIMIT 1
        `,
        { replacements: { accountNumber }, type: QueryTypes.SELECT, transaction }
      );
    } else {
      const [fallback] = await sequelize.query(
        `
        SELECT 
          a.id,
          a.customer_id,
          a.account_number,
          a.acct_nm,
          a.status as rec_st,
          a.available_balance,
          a.ledger_balance,
          a.cleared_balance,
          c.PHONE_NO as phone_number,
          CONCAT(c.FIRST_NAME, ' ', c.LAST_NAME) as customer_name,
          c.CUST_ID
        FROM accounts a
        LEFT JOIN customers c ON a.customer_id = c.CUST_ID
        WHERE a.account_number = :accountNumber OR a.ACCT_NO = :accountNumber
        LIMIT 1
        `,
        { replacements: { accountNumber }, type: QueryTypes.SELECT, transaction }
      );
      if (fallback) {
        account = fallback;
        customerId = account.customer_id;
        customerPhoneNumber = fallback.phone_number;
        customerName = fallback.customer_name || fallback.acct_nm;
        allowSms = true;

        [accountSummary] = await sequelize.query(
          `SELECT * FROM deposit_account_summary WHERE ACCT_NO = :accountNumber LIMIT 1`,
          { replacements: { accountNumber }, type: QueryTypes.SELECT, transaction }
        );
      }
    }

    if (!account)
      throw {
        status: 404,
        code: 'ACCOUNT_NOT_FOUND',
        message: `Account ${accountNumber} not found`,
      };

    const accountStatus = (account.status || '').toUpperCase();
    if (!['ACTIVE', 'APPROVED', 'A'].includes(accountStatus)) {
      throw {
        status: 400,
        code: 'ACCOUNT_INACTIVE',
        message: `Account ${accountNumber} not active`,
      };
    }

    // ================================================================
    // ✅ FIND DRAWER
    // ================================================================
    const drawerId = transactionData.DRAWER_ID || 
                     transactionData.drawerId || 
                     transactionData.DRAWER_NO || 
                     transactionData.drawerNo || 
                     null;

    let drawer = null;
    let drawerUpdated = false;
    let drawerBalanceBefore = 0;
    let drawerBalanceAfter = 0;
    let drawerNo = null;

    if (drawerId) {
      console.log(`🔄 Looking up drawer with identifier: ${drawerId}`);
      
      const idStr = drawerId.toString().trim();
      const idNum = parseInt(idStr);
      
      if (userId && userId !== 'system' && userId !== 'SYSTEM') {
        drawer = await Drawer.findOne({ 
          where: { USER_ID: userId, WF_STATUS: 'OPEN' },
          transaction 
        });
        if (drawer) {
          console.log(`✅ Found drawer by USER_ID: ${drawer.DRAWER_NO}`);
        }
      }
      
      if (!drawer) {
        drawer = await Drawer.findOne({ 
          where: { DRAWER_NO: idStr, WF_STATUS: 'OPEN' },
          transaction 
        });
        if (drawer) {
          console.log(`✅ Found drawer by DRAWER_NO: ${drawer.DRAWER_NO}`);
        }
      }
      
      if (!drawer && !isNaN(idNum)) {
        const paddedId = idNum.toString().padStart(3, '0');
        if (paddedId !== idStr) {
          drawer = await Drawer.findOne({ 
            where: { DRAWER_NO: paddedId, WF_STATUS: 'OPEN' },
            transaction 
          });
          if (drawer) {
            console.log(`✅ Found drawer by padded DRAWER_NO: ${drawer.DRAWER_NO}`);
          }
        }
      }
      
      if (!drawer) {
        drawer = await Drawer.findOne({ 
          where: { DRAWER_ID: idStr, WF_STATUS: 'OPEN' },
          transaction 
        });
        if (drawer) {
          console.log(`✅ Found drawer by DRAWER_ID: ${drawer.DRAWER_ID}`);
        }
      }
      
      if (!drawer && !isNaN(idNum)) {
        drawer = await Drawer.findOne({ 
          where: { id: idNum, WF_STATUS: 'OPEN' },
          transaction 
        });
        if (drawer) {
          console.log(`✅ Found drawer by primary key id: ${drawer.id}`);
        }
      }
      
      if (!drawer) {
        console.warn(`⚠️ Drawer with identifier ${drawerId} not found`);
      } else if (drawer.WF_STATUS !== 'OPEN') {
        console.warn(`⚠️ Drawer ${drawer.DRAWER_NO} is not open (status: ${drawer.WF_STATUS})`);
        drawer = null;
      } else {
        drawerNo = drawer.DRAWER_NO;
        drawerBalanceBefore = parseFloat(drawer.CURRENT_BALANCE || 0);
        let newDrawerBalance = drawerBalanceBefore;
        
        if (isDeposit) {
          newDrawerBalance = drawerBalanceBefore + amount;
          console.log(`💰 Drawer ${drawer.DRAWER_NO}: +₦${amount} → ₦${newDrawerBalance}`);
        } else if (isWithdrawal || isTransfer) {
          if (drawerBalanceBefore < amount) {
            console.warn(`⚠️ Insufficient drawer balance: ₦${drawerBalanceBefore} < ₦${amount}`);
          }
          newDrawerBalance = drawerBalanceBefore - amount;
          console.log(`💸 Drawer ${drawer.DRAWER_NO}: -₦${amount} → ₦${newDrawerBalance}`);
        }
        
        drawerBalanceAfter = newDrawerBalance;
        
        await Drawer.update(
          {
            CURRENT_BALANCE: newDrawerBalance,
            VERSION_NO: sequelize.literal('VERSION_NO + 1'),
            updatedAt: new Date()
          },
          {
            where: { id: drawer.id },
            transaction
          }
        );
        
        const minBalance = parseFloat(drawer.MIN_BAL || 0);
        const maxBalance = parseFloat(drawer.MAX_BAL || 0);
        let limitFlag = 'N';
        
        if (newDrawerBalance > maxBalance || newDrawerBalance < minBalance) {
          limitFlag = 'Y';
        }
        
        await Drawer.update(
          {
            DRAWER_CASH_LIMIT_FG: limitFlag
          },
          {
            where: { id: drawer.id },
            transaction
          }
        );
        
        drawerUpdated = true;
        console.log(`✅ Drawer ${drawer.DRAWER_NO} balance updated to ₦${newDrawerBalance}`);
        
        try {
          await sequelize.query(
            `INSERT INTO drawer_transactions (
              drawer_id, drawer_no, transaction_type, amount,
              previous_balance, new_balance, transaction_ref_no,
              customer_account, description, user_id, created_at
            ) VALUES (
              :drawerId, :drawerNo, :transactionType, :amount,
              :previousBalance, :newBalance, :referenceNo,
              :customerAccount, :description, :userId, NOW()
            )`,
            {
              replacements: {
                drawerId: drawer.id,
                drawerNo: drawer.DRAWER_NO,
                transactionType: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
                amount: amount.toFixed(2),
                previousBalance: drawerBalanceBefore.toFixed(2),
                newBalance: drawerBalanceAfter.toFixed(2),
                referenceNo: referenceNo,
                customerAccount: accountNumber,
                description: description,
                userId: userId
              },
              transaction
            }
          );
          console.log(`✅ Drawer transaction record created for ${drawer.DRAWER_NO}`);
        } catch (drawerTxnError) {
          console.warn('⚠️ Failed to create drawer transaction record:', drawerTxnError.message);
        }
      }
    }

    // ================================================================
    // ✅ GET CURRENT BALANCES
    // ================================================================
    let currentLedgerBalance = 0;

    if (accountSummary) {
      currentLedgerBalance = parseFloat(accountSummary.LEDGER_BAL || 0);
    } else {
      currentLedgerBalance = parseFloat(account.ledger_balance || 0);
    }

    console.log(`📊 Current balances - Ledger: ₦${currentLedgerBalance.toFixed(2)}`);

    // ================================================================
    // ✅ CALCULATE TOTAL DEBIT INCLUDING EMTL
    // ================================================================
    const totalDebitAmount = (isWithdrawal || isTransfer) ? amount + emtlResult.amount : amount;
    
    console.log(`📊 Transaction amounts:`, {
      principal: amount,
      emtl: emtlResult.amount,
      totalDebit: totalDebitAmount,
      isWithdrawal,
      isTransfer
    });

    if ((isWithdrawal || isTransfer) && currentLedgerBalance < totalDebitAmount) {
      throw {
        status: 400,
        code: 'INSUFFICIENT_FUNDS',
        message: `Insufficient funds. Required: ₦${totalDebitAmount.toFixed(2)}, Available: ₦${currentLedgerBalance.toFixed(2)}`
      };
    }

    // ================================================================
    // ✅ CALCULATE NEW BALANCES
    // ================================================================
    let newLedgerBalance = currentLedgerBalance;
    let drTurnover = parseFloat(accountSummary?.DR_TURNOVER || 0);
    let crTurnover = parseFloat(accountSummary?.CR_TURNOVER || 0);
    let drCount = parseInt(accountSummary?.DR_COUNT || 0);
    let crCount = parseInt(accountSummary?.CR_COUNT || 0);

    if (isDeposit) {
      newLedgerBalance += amount;
      crTurnover += amount;
      crCount++;
      console.log(`💰 DEPOSIT: +₦${amount} → ₦${newLedgerBalance}`);
    } else if (isWithdrawal || isTransfer) {
      newLedgerBalance -= totalDebitAmount;
      drTurnover += totalDebitAmount;
      drCount++;
      console.log(`💸 WITHDRAWAL/TRANSFER: -₦${totalDebitAmount} → ₦${newLedgerBalance}`);
      
      if (emtlResult.amount > 0) {
        console.log(`💰 EMTL of ₦${emtlResult.amount} included in withdrawal`);
      }
    }

    // ================================================================
    // ✅ INSERT HISTORY RECORD - FIXED
    // ================================================================
    const historyId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 100);
    const depositAccountId = account.id;
    const drCrInd = isDeposit ? 'C' : 'D';
    const eventId = Math.floor(Date.now() / 1000);
    
    const descriptionWithEMTL = emtlResult.amount > 0 
      ? `${description} (EMTL: ₦${emtlResult.amount.toFixed(2)})`
      : description;

    const transactionDate = serverBusinessDate;
    const valueDateFormatted = valueDate;

    // ✅ FIXED: Removed createdAt, updatedAt columns and NOW(), NOW() values
    await sequelize.query(
      `
      INSERT INTO deposit_account_history (
        ACCT_HIST_ID, DEPOSIT_ACCT_ID, ACCT_NO, CONTRA_ACCT_NO, TRAN_DT, VALUE_DT,
        TOTAL_CHRG_AMT, TRAN_DESC, DR_CR_IND, TRAN_REF_TXT, CHQ_NO, SUPERVISOR_ID,
        STMNT_BAL, REC_ST, VERSION_NO, ROW_TS, USER_ID, CREATE_DT, CREATED_BY,
        SYS_CREATE_TS, CHANNEL_ID, EVENT_ID, TXN_AMT, ACCT_AMT, CONTRA_ACCT_AMT,
        DEPOSITOR_PAYEE_NM,
        server_processing_date, system_time
      ) VALUES (
        :historyId, :depositAccountId, :accountNumber, :contraAccountNo, :transactionDate, :valueDate,
        :amount, :description, :drCrInd, :referenceNo, :chequeNo, :supervisorId,
        :newBalance, 'A', 1, NOW(), :userId, :transactionDate, :createdBy,
        NOW(), :channelId, :eventId, :amount, :amount, :amount, :depositorName,
        :serverProcessingDate, :systemTime
      )
      `,
      {
        replacements: {
          historyId,
          depositAccountId,
          accountNumber,
          contraAccountNo: contraAccountNo || null,
          transactionDate: transactionDate.toISOString().split('T')[0],
          valueDate: valueDateFormatted,
          amount: amount.toFixed(2),
          description: descriptionWithEMTL,
          drCrInd,
          referenceNo,
          chequeNo: chequeNo || null,
          supervisorId: supervisorId || null,
          newBalance: newLedgerBalance.toFixed(2),
          userId: userId,
          createdBy: userId,
          channelId: businessUnit,
          eventId,
          depositorName: depositorName || customerName || null,
          serverProcessingDate: serverBusinessDate.toISOString(),
          systemTime: systemTime.toISOString()
        },
        transaction,
      }
    );
    console.log(`✅ History record ${historyId} inserted`);

    // ================================================================
    // ✅ UPDATE ACCOUNT SUMMARY
    // ================================================================
    if (accountSummary && accountSummary.ACCT_ID) {
      const setAssignments = [
        `LEDGER_BAL = :ledgerBalance`,
        `CLEARED_BAL = :clearedBalance`,
        `LAST_ACTIVITY_DT = NOW()`
      ];
      if (isDeposit) {
        setAssignments.push(`LAST_DEPOSIT_DT = NOW()`);
        setAssignments.push(`LAST_DEPOSIT_AMT = :amount`);
      }
      if (isWithdrawal || isTransfer) {
        setAssignments.push(`LAST_WITHDRAWL_DT = NOW()`);
        setAssignments.push(`LAST_WITHDRAWL_AMT = :amount`);
      }
      setAssignments.push(
        `DR_TURNOVER = :drTurnover`,
        `CR_TURNOVER = :crTurnover`,
        `DR_COUNT = :drCount`,
        `CR_COUNT = :crCount`,
        `ROW_TS = NOW()`,
        `updated_at = NOW()`
      );
      const setClause = setAssignments.join(',\n          ');
      await sequelize.query(
        `UPDATE deposit_account_summary 
         SET ${setClause}
         WHERE ACCT_ID = :accountId`,
        {
          replacements: {
            ledgerBalance: newLedgerBalance.toFixed(2),
            clearedBalance: newLedgerBalance.toFixed(2),
            amount: amount.toFixed(2),
            drTurnover: drTurnover.toFixed(2),
            crTurnover: crTurnover.toFixed(2),
            drCount,
            crCount,
            accountId: accountSummary.ACCT_ID,
          },
          transaction,
        }
      );
      console.log(`✅ Deposit account summary updated`);
    } else {
      // ✅ FIXED: This is the second INSERT - now properly formatted with all replacements
      await sequelize.query(
        `
        INSERT INTO deposit_account_summary (
          ACCT_ID, ACCT_NO, LEDGER_BAL, CLEARED_BAL, 
          DR_TURNOVER, CR_TURNOVER, DR_COUNT, CR_COUNT,
          LAST_ACTIVITY_DT, REC_ST, VERSION_NO, ROW_TS,
          USER_ID, CREATE_DT, CREATED_BY, SYS_CREATE_TS,
          updated_at
        ) VALUES (
          :accountId, :accountNumber, :ledgerBalance, :clearedBalance,
          :drTurnover, :crTurnover, :drCount, :crCount,
          NOW(), 'A', 1, NOW(),
          :userId, NOW(), :createdBy, NOW(),
          NOW()
        )
        `,
        {
          replacements: {
            accountId: account.id,
            accountNumber,
            ledgerBalance: newLedgerBalance.toFixed(2),
            clearedBalance: newLedgerBalance.toFixed(2),
            drTurnover: drTurnover.toFixed(2),
            crTurnover: crTurnover.toFixed(2),
            drCount,
            crCount,
            userId: userId,
            createdBy: userId,
          },
          transaction,
        }
      );
      console.log(`✅ New deposit account summary created`);
    }

    // ================================================================
    // ✅ UPDATE CUSTOMER ACCOUNTS
    // ================================================================
    await sequelize.query(
      `UPDATE customer_accounts 
       SET ledger_balance = :ledgerBalance,
           available_balance = :availableBalance,
           cleared_balance = :clearedBalance,
           updated_at = NOW()
       WHERE id = :accountId`,
      {
        replacements: {
          ledgerBalance: newLedgerBalance.toFixed(2),
          availableBalance: newLedgerBalance.toFixed(2),
          clearedBalance: newLedgerBalance.toFixed(2),
          accountId: account.id,
        },
        transaction,
      }
    );

    // ================================================================
    // ✅ DETERMINE FINAL TRANSACTION STATUS
    // ================================================================
    const finalRequiresApproval = requiresApproval || sanctionResult.shouldFlagForReview;
    const txnStatus = finalRequiresApproval ? 'PENDING_APPROVAL' : 'COMPLETED';
    
    console.log(`📊 Transaction Status: ${txnStatus}`);
    console.log(`📊 Requires Approval: ${finalRequiresApproval}`);

    // ================================================================
    // ✅ INSERT INTO deposit_transactions
    // ================================================================
    await sequelize.query(
      `
      INSERT INTO deposit_transactions 
        (customer_id, account_number, transaction_type, amount, emtl_amount, total_debit,
         emtl_applicable, emtl_reason, emtl_gl_account, emtl_beneficiary,
         emtl_remittance_status,
         currency, status, aml_risk_level, aml_risk_score, aml_indicators,
         created_by, transaction_date, branch_id, approved_by, approved_at,
         transaction_ref_no, description, requires_approval, approved_by_role, approval_status,
         depositor_name, server_processing_date, system_time, system_user_id,
         sanction_check_result, ai_sanction_status)
      VALUES
        (:customerId, :accountNumber, :transactionType, :amount, :emtlAmount, :totalDebit,
         :emtlApplicable, :emtlReason, :emtlGlAccount, :emtlBeneficiary,
         'PENDING_REMITTANCE',
         :currency, :status, :amlRiskLevel, :amlRiskScore, :amlIndicators,
         :createdBy, :transactionDate, :branchId, :approvedBy, :approvedAt,
         :referenceNo, :description, :requiresApproval, :approvedByRole, :approvalStatus,
         :depositorName, :serverProcessingDate, :systemTime, :systemUserId,
         :sanctionCheckResult, :aiSanctionStatus)
      `,
      {
        replacements: {
          customerId: account.customer_id || 0,
          accountNumber,
          transactionType: isDeposit ? 'DEPOSIT' : (isTransfer ? 'TRANSFER' : 'WITHDRAWAL'),
          amount: amount.toFixed(2),
          emtlAmount: emtlResult.amount.toFixed(2),
          totalDebit: totalDebitAmount.toFixed(2),
          emtlApplicable: emtlResult.applicable,
          emtlReason: emtlResult.reason || 'N/A',
          emtlGlAccount: emtlResult.glAccount || null,
          emtlBeneficiary: emtlResult.beneficiary || null,
          currency,
          status: txnStatus,
          amlRiskLevel: finalAmlCheck.riskLevel,
          amlRiskScore: finalAmlCheck.riskScore,
          amlIndicators: JSON.stringify({
            amount: amount,
            emtl: emtlResult.amount,
            sanctionCheck: sanctionResult,
            aiDetected: true
          }),
          createdBy: userId,
          transactionDate: serverBusinessDate,
          branchId,
          approvedBy: finalRequiresApproval ? null : userId,
          approvedAt: finalRequiresApproval ? null : new Date(),
          referenceNo,
          description: descriptionWithEMTL,
          requiresApproval: finalRequiresApproval,
          approvedByRole: finalRequiresApproval ? authorizedRoles.join(',') : 'AUTO',
          approvalStatus: finalRequiresApproval ? 'PENDING' : 'APPROVED',
          depositorName: depositorName || customerName || null,
          serverProcessingDate: serverBusinessDate.toISOString(),
          systemTime: systemTime.toISOString(),
          systemUserId: userId,
          sanctionCheckResult: JSON.stringify(sanctionResult),
          aiSanctionStatus: sanctionResult.blocked ? 'BLOCKED' : 
                             sanctionResult.shouldFlagForReview ? 'FLAGGED' : 'CLEAR'
        },
        transaction,
      }
    );
    console.log(`✅ Transaction record inserted`);

    // ================================================================
    // ✅ EMTL COLLECTION RECORD
    // ================================================================
    if (emtlResult.applicable && emtlResult.amount > 0) {
      try {
        await EMTLCollectionService.createCollection({
          transactionId: referenceNo,
          referenceNo: referenceNo,
          customerId: account.customer_id || 0,
          accountNumber: accountNumber,
          emtlAmount: emtlResult.amount,
          principalAmount: amount,
          transferDate: serverBusinessDate,
          channel: transactionData.CHANNEL || transactionData.channel || 'WEB',
          transactionType: transactionType || 'TRANSFER',
          glAccount: emtlResult.glAccount || '2401000001',
          levyCalculation: {
            threshold: emtlResult.policy?.threshold || 10000,
            levyAmount: emtlResult.amount,
            levyType: emtlResult.policy?.levy_type || 'FLAT',
            appliedAt: new Date()
          },
          createdBy: userId,
          serverProcessingDate: serverBusinessDate,
          systemTime: systemTime
        });
        console.log(`✅ EMTL collection record created`);
      } catch (emtlRecordError) {
        console.error('❌ Failed to create EMTL collection record:', emtlRecordError.message);
      }
    }

    // ================================================================
    // ✅ FULL GL POSTING - DYNAMIC FROM GL_ACCOUNTS TABLE
    // ================================================================
    try {
      // 1. Get Drawer GL Account
      let drawerGlAccount = null;
      if (drawer) {
        const drawerGlResult = await sequelize.query(
          `SELECT gl_acct_no, ledger_balance, current_balance, available_balance 
           FROM gl_accounts 
           WHERE gl_acct_no = :glAccountNo AND rec_st = 'Active'
           LIMIT 1`,
          {
            replacements: { glAccountNo: drawer.GL_ACCT_NO },
            type: QueryTypes.SELECT,
            transaction
          }
        );
        drawerGlAccount = drawerGlResult[0] || null;
      }
      
      // If no drawer GL found, try to find a cash account
      if (!drawerGlAccount) {
        const cashAccounts = await sequelize.query(
          `SELECT gl_acct_no, ledger_balance, current_balance, available_balance 
           FROM gl_accounts 
           WHERE (account_type = 'ASSET' OR acct_desc LIKE '%CASH%') 
             AND rec_st = 'Active'
           LIMIT 1`,
          {
            type: QueryTypes.SELECT,
            transaction
          }
        );
        drawerGlAccount = cashAccounts[0] || null;
        if (drawerGlAccount) {
          console.log(`✅ Using fallback CASH GL: ${drawerGlAccount.gl_acct_no}`);
        }
      }

      // 2. Get Customer GL Account
      let customerGlAccount = null;
      
      const liabAccounts = await sequelize.query(
        `SELECT gl_acct_no, ledger_balance, current_balance, available_balance 
         FROM gl_accounts 
         WHERE (account_type = 'LIABILITY' OR acct_desc LIKE '%CUSTOMER_DEPOSITS%') 
           AND rec_st = 'Active'
         LIMIT 1`,
        {
          type: QueryTypes.SELECT,
          transaction
        }
      );
      customerGlAccount = liabAccounts[0] || null;
      if (customerGlAccount) {
        console.log(`✅ Using LIABILITY GL for customer: ${customerGlAccount.gl_acct_no}`);
      }

      // ================================================================
      // ✅ USE THE INTERBRANCH GL FROM GL_ACCOUNTS - FIXED with this.
      // ================================================================
      let interBranchGlAccount = null;
      if (drawer) {
        try {
          const interbranchGlNo = await this.getInterbranchGlAccount(
            drawer.BRANCH_CODE || '101',
            branchId || '101',
            transaction
          );
          
          if (interbranchGlNo) {
            const ibGlResult = await sequelize.query(
              `SELECT gl_acct_no, ledger_balance, current_balance, available_balance 
               FROM gl_accounts 
               WHERE gl_acct_no = :glAccountNo AND rec_st = 'Active'
               LIMIT 1`,
              {
                replacements: { glAccountNo: interbranchGlNo },
                type: QueryTypes.SELECT,
                transaction
              }
            );
            interBranchGlAccount = ibGlResult[0] || null;
            if (interBranchGlAccount) {
              console.log(`✅ Found Inter-Branch GL: ${interBranchGlAccount.gl_acct_no}`);
            }
          }
        } catch (ibError) {
          console.warn('⚠️ Error finding interbranch GL:', ibError.message);
        }
      }

      // 4. Get EMTL GL Account
      let emtlGlAccount = null;
      if (emtlResult.applicable && emtlResult.amount > 0) {
        const emtlGlResult = await sequelize.query(
          `SELECT gl_acct_no, ledger_balance, current_balance, available_balance 
           FROM gl_accounts 
           WHERE gl_acct_no = :glAccountNo AND rec_st = 'Active'
           LIMIT 1`,
          {
            replacements: { glAccountNo: emtlResult.glAccount || '2401000001' },
            type: QueryTypes.SELECT,
            transaction
          }
        );
        emtlGlAccount = emtlGlResult[0] || null;
        if (!emtlGlAccount) {
          console.warn(`⚠️ EMTL GL account ${emtlResult.glAccount} not found`);
        }
      }

      // ================================================================
      // ✅ PERFORM GL POSTING
      // ================================================================
      if (drawerGlAccount && customerGlAccount) {
        const currentDrawerGlBalance = parseFloat(drawerGlAccount.ledger_balance || 0);
        const currentCustomerGlBalance = parseFloat(customerGlAccount.ledger_balance || 0);
        
        let newDrawerGlBalance, newCustomerGlBalance;
        let drawerGlDirection, customerGlDirection;
        
        if (isDeposit) {
          newDrawerGlBalance = currentDrawerGlBalance + amount;
          newCustomerGlBalance = currentCustomerGlBalance + amount;
          drawerGlDirection = 'DEBIT';
          customerGlDirection = 'CREDIT';
        } else {
          newDrawerGlBalance = currentDrawerGlBalance - totalDebitAmount;
          newCustomerGlBalance = currentCustomerGlBalance - amount;
          drawerGlDirection = 'CREDIT';
          customerGlDirection = 'DEBIT';
        }
        
        // Update Drawer GL
        await sequelize.query(
          `UPDATE gl_accounts 
           SET ledger_balance = :newBalance,
               current_balance = :newBalance,
               available_balance = :newBalance,
               updated_at = NOW()
           WHERE gl_acct_no = :glAccountNo`,
          {
            replacements: {
              glAccountNo: drawerGlAccount.gl_acct_no,
              newBalance: newDrawerGlBalance.toFixed(2)
            },
            transaction
          }
        );
        
        // Update Customer GL
        await sequelize.query(
          `UPDATE gl_accounts 
           SET ledger_balance = :newBalance,
               current_balance = :newBalance,
               available_balance = :newBalance,
               updated_at = NOW()
           WHERE gl_acct_no = :glAccountNo`,
          {
            replacements: {
              glAccountNo: customerGlAccount.gl_acct_no,
              newBalance: newCustomerGlBalance.toFixed(2)
            },
            transaction
          }
        );
        
        // Update Inter-Branch GL
        if (interBranchGlAccount) {
          const currentIbBalance = parseFloat(interBranchGlAccount.ledger_balance || 0);
          let newIbBalance, ibDirection;
          
          if (isDeposit) {
            newIbBalance = currentIbBalance + amount;
            ibDirection = 'CREDIT';
          } else {
            newIbBalance = currentIbBalance - amount;
            ibDirection = 'DEBIT';
          }
          
          await sequelize.query(
            `UPDATE gl_accounts 
             SET ledger_balance = :newBalance,
                 current_balance = :newBalance,
                 available_balance = :newBalance,
                 updated_at = NOW()
             WHERE gl_acct_no = :glAccountNo`,
            {
              replacements: {
                glAccountNo: interBranchGlAccount.gl_acct_no,
                newBalance: newIbBalance.toFixed(2)
              },
              transaction
            }
          );
          
          // Record Inter-Branch GL Transaction
          await sequelize.query(
            `INSERT INTO gl_transactions (
              gl_account_no, transaction_type, amount,
              previous_balance, new_balance, reference_no,
              drawer_id, drawer_no, account_number,
              description, created_by,
              transaction_date, source_reference
            ) VALUES (
              :glAccountNo, :direction, :amount,
              :prevBalance, :newBalance, :referenceNo,
              :drawerId, :drawerNo, :accountNumber,
              :description, :createdBy,
              NOW(), :sourceRef
            )`,
            {
              replacements: {
                glAccountNo: interBranchGlAccount.gl_acct_no,
                direction: ibDirection,
                amount: amount.toFixed(2),
                prevBalance: currentIbBalance.toFixed(2),
                newBalance: newIbBalance.toFixed(2),
                referenceNo: `IB-${referenceNo}`,
                drawerId: drawer?.id || null,
                drawerNo: drawer?.DRAWER_NO || null,
                accountNumber: accountNumber,
                description: `${isDeposit ? 'Branch Credit' : 'Branch Debit'} - ${accountNumber}`,
                createdBy: userId,
                sourceRef: referenceNo
              },
              transaction
            }
          );
        }
        
        // Update EMTL GL
        if (emtlGlAccount && emtlResult.amount > 0) {
          const currentEmtlBalance = parseFloat(emtlGlAccount.ledger_balance || 0);
          const newEmtlBalance = currentEmtlBalance + emtlResult.amount;
          
          await sequelize.query(
            `UPDATE gl_accounts 
             SET ledger_balance = :newBalance,
                 current_balance = :newBalance,
                 available_balance = :newBalance,
                 updated_at = NOW()
             WHERE gl_acct_no = :glAccountNo`,
            {
              replacements: {
                glAccountNo: emtlGlAccount.gl_acct_no,
                newBalance: newEmtlBalance.toFixed(2)
              },
              transaction
            }
          );
          
          // Record EMTL GL Transaction
          await sequelize.query(
            `INSERT INTO gl_transactions (
              gl_account_no, transaction_type, amount,
              previous_balance, new_balance, reference_no,
              drawer_id, drawer_no, account_number,
              description, created_by, created_at,
              transaction_date, source_reference
            ) VALUES (
              :glAccountNo, :direction, :amount,
              :prevBalance, :newBalance, :referenceNo,
              :drawerId, :drawerNo, :accountNumber,
              :description, :createdBy, NOW(),
              NOW(), :sourceRef
            )`,
            {
              replacements: {
                glAccountNo: emtlGlAccount.gl_acct_no,
                direction: 'CREDIT',
                amount: emtlResult.amount.toFixed(2),
                prevBalance: currentEmtlBalance.toFixed(2),
                newBalance: newEmtlBalance.toFixed(2),
                referenceNo: `GL-EMTL-${referenceNo}`,
                drawerId: drawer?.id || null,
                drawerNo: drawer?.DRAWER_NO || null,
                accountNumber: accountNumber,
                description: `EMTL on ${isDeposit ? 'Deposit' : 'Withdrawal'} - ${accountNumber}`,
                createdBy: userId,
                sourceRef: referenceNo
              },
              transaction
            }
          );
        }
        
        // Record Drawer GL Transaction
        await sequelize.query(
          `INSERT INTO gl_transactions (
            gl_account_no, transaction_type, amount,
            previous_balance, new_balance, reference_no,
            drawer_id, drawer_no, account_number,
            description, created_by, created_at,
            transaction_date, source_reference
          ) VALUES (
            :glAccountNo, :direction, :amount,
            :prevBalance, :newBalance, :referenceNo,
            :drawerId, :drawerNo, :accountNumber,
            :description, :createdBy, NOW(),
            NOW(), :sourceRef
          )`,
          {
            replacements: {
              glAccountNo: drawerGlAccount.gl_acct_no,
              direction: drawerGlDirection,
              amount: isDeposit ? amount.toFixed(2) : totalDebitAmount.toFixed(2),
              prevBalance: currentDrawerGlBalance.toFixed(2),
              newBalance: newDrawerGlBalance.toFixed(2),
              referenceNo: `GL-DRAWER-${referenceNo}`,
              drawerId: drawer?.id || null,
              drawerNo: drawer?.DRAWER_NO || null,
              accountNumber: accountNumber,
              description: `${isDeposit ? 'Cash Deposit' : 'Cash Withdrawal'} - ${accountNumber}`,
              createdBy: userId,
              sourceRef: referenceNo
            },
            transaction
          }
        );
        
        // Record Customer GL Transaction
        await sequelize.query(
          `INSERT INTO gl_transactions (
            gl_account_no, transaction_type, amount,
            previous_balance, new_balance, reference_no,
            drawer_id, drawer_no, account_number,
            description, created_by, created_at,
            transaction_date, source_reference
          ) VALUES (
            :glAccountNo, :direction, :amount,
            :prevBalance, :newBalance, :referenceNo,
            :drawerId, :drawerNo, :accountNumber,
            :description, :createdBy, NOW(),
            NOW(), :sourceRef
          )`,
          {
            replacements: {
              glAccountNo: customerGlAccount.gl_acct_no,
              direction: customerGlDirection,
              amount: amount.toFixed(2),
              prevBalance: currentCustomerGlBalance.toFixed(2),
              newBalance: newCustomerGlBalance.toFixed(2),
              referenceNo: `GL-CUST-${referenceNo}`,
              drawerId: drawer?.id || null,
              drawerNo: drawer?.DRAWER_NO || null,
              accountNumber: accountNumber,
              description: `${isDeposit ? 'Customer Deposit' : 'Customer Withdrawal'} - ${accountNumber}`,
              createdBy: userId,
              sourceRef: referenceNo
            },
            transaction
          }
        );
        
        console.log('✅ Full GL posting completed');
        console.log(`   Drawer GL ${drawerGlAccount.gl_acct_no}: ${currentDrawerGlBalance} -> ${newDrawerGlBalance}`);
        console.log(`   Customer GL ${customerGlAccount.gl_acct_no}: ${currentCustomerGlBalance} -> ${newCustomerGlBalance}`);
        if (interBranchGlAccount) {
          console.log(`   Inter-Branch GL ${interBranchGlAccount.gl_acct_no}: updated`);
        }
        if (emtlGlAccount && emtlResult.amount > 0) {
          console.log(`   EMTL GL ${emtlGlAccount.gl_acct_no}: +₦${emtlResult.amount}`);
        }
      } else {
        console.warn('⚠️ GL accounts not found, skipping GL posting');
      }
    } catch (glError) {
      console.error('❌ GL posting error:', glError.message);
      // Don't rollback - GL is optional for now
    }

    // ================================================================
    // ✅ APPROVAL NOTIFICATIONS
    // ================================================================
    if (finalRequiresApproval) {
      try {
        await sendApprovalNotification({
          itemType: 'transaction',
          itemId: referenceNo,
          itemName: `${isDeposit ? 'Deposit' : (isTransfer ? 'Transfer' : 'Withdrawal')} of ₦${amount.toLocaleString()}`,
          description: `${isDeposit ? 'Deposit' : (isTransfer ? 'Transfer' : 'Withdrawal')} of ₦${amount.toLocaleString()} for account ${accountNumber}`,
          submittedBy: userId,
          BU_ID: branchId || businessUnit || '001',
          priority: sanctionResult.shouldFlagForReview ? 'urgent' : 'high',
          metadata: {
            accountNumber: accountNumber,
            customerName: customerName || 'Unknown',
            transactionType: isDeposit ? 'DEPOSIT' : (isTransfer ? 'TRANSFER' : 'WITHDRAWAL'),
            amount: amount,
            emtlAmount: emtlResult.amount,
            totalDebit: totalDebitAmount,
            referenceNo: referenceNo,
            requiresApproval: true,
            authorizedRoles: authorizedRoles,
            amlRiskLevel: finalAmlCheck.riskLevel,
            policyFound: policyFound,
            branchId: branchId || businessUnit,
            serverProcessingDate: serverBusinessDateStr,
            systemTime: systemTimeStr,
            createdBy: userId,
            aiSanctionCheck: {
              performed: true,
              riskLevel: sanctionResult.riskLevel,
              riskScore: sanctionResult.riskScore,
              matches: sanctionResult.matches,
              flagged: sanctionResult.shouldFlagForReview,
              blocked: sanctionResult.blocked
            }
          }
        });
        console.log('✅ Approval notification sent');
      } catch (notifError) {
        console.warn('⚠️ Failed to send approval notification:', notifError.message);
      }
      
      await transaction.commit();
      
      return res.status(202).json({
        success: true,
        message: `Transaction requires approval. Pending approval from: ${authorizedRoles.join(', ')}`,
        reference_no: referenceNo,
        requires_approval: true,
        authorized_roles: authorizedRoles,
        approval_status: 'PENDING',
        amount: amount,
        account_number: accountNumber,
        transaction_type: isDeposit ? 'DEPOSIT' : (isTransfer ? 'TRANSFER' : 'WITHDRAWAL'),
        policy_checked: policyFound,
        aml_risk_level: finalAmlCheck.riskLevel,
        created_by: userId,
        server_processing_date: serverBusinessDateStr,
        system_time: systemTimeStr,
        emtl: {
          amount: emtlResult.amount,
          applicable: emtlResult.applicable,
          reason: emtlResult.reason
        },
        ai_sanction_check: {
          performed: true,
          risk_level: sanctionResult.riskLevel,
          risk_score: sanctionResult.riskScore,
          matches: sanctionResult.matches?.length || 0,
          flagged: sanctionResult.shouldFlagForReview,
          blocked: sanctionResult.blocked
        }
      });
    }

    // ================================================================
    // ✅ COMPLETION NOTIFICATION
    // ================================================================
    try {
      await sendNotification({
        roleId: 'Admin',
        message: `✅ Transaction completed: ${isDeposit ? 'Deposit' : 'Withdrawal'} of ₦${amount.toLocaleString()} for ${customerName || 'customer'} (${accountNumber})${sanctionResult.riskLevel !== 'LOW' ? ` - AI Risk: ${sanctionResult.riskLevel}` : ''}`,
        itemId: referenceNo,
        priority: sanctionResult.riskLevel === 'MEDIUM' ? 'high' : 'medium',
        metadata: {
          accountNumber: accountNumber,
          customerName: customerName || 'Unknown',
          amount: amount,
          referenceNo: referenceNo,
          transactionType: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
          completedBy: userId,
          emtlAmount: emtlResult.amount,
          newBalance: newLedgerBalance,
          serverProcessingDate: serverBusinessDateStr,
          systemTime: systemTimeStr,
          aiSanctionCheck: {
            performed: true,
            riskLevel: sanctionResult.riskLevel,
            riskScore: sanctionResult.riskScore,
            matches: sanctionResult.matches?.length || 0
          }
        }
      });
    } catch (notifError) {
      console.warn('⚠️ Failed to send completion notification:', notifError.message);
    }

    // ================================================================
    // ✅ SMS NOTIFICATION
    // ================================================================
    if (allowSms && customerPhoneNumber && customerPhoneNumber.trim()) {
      try {
        const formattedBalance = new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
        }).format(newLedgerBalance);
        
        const formattedAmount = new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
        }).format(amount);
        
        const formattedEMTL = emtlResult.amount > 0 
          ? ` (EMTL: ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(emtlResult.amount)})`
          : '';

        let messageContent = '';
        if (isDeposit) {
          messageContent = `${customerName || 'Dear customer'}, ${formattedAmount} credited to ${accountNumber} on ${new Date(serverBusinessDate).toLocaleDateString()}. New balance: ${formattedBalance}. Ref: ${referenceNo.slice(-8)}.`;
        } else {
          messageContent = `${customerName || 'Dear customer'}, ${formattedAmount} debited from ${accountNumber} on ${new Date(serverBusinessDate).toLocaleDateString()}${formattedEMTL}. New balance: ${formattedBalance}. Ref: ${referenceNo.slice(-8)}.`;
        }

        await SMS.create(
          {
            EXTERNAL_SMS_ID: `SMS_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            RECIPIENT_PHONE_NUMBER: customerPhoneNumber,
            REC_ST: 'A',
            USER_ID: userId,
            MESSAGE_CONTENT: messageContent,
            CREATE_DT: new Date(),
            CREATED_BY: userId,
            ACCT_BALANCE: newLedgerBalance,
            TXN_AMT: isDeposit ? amount : totalDebitAmount,
            ACCT_NO: accountNumber,
            DR_CR_IND: isDeposit ? 'C' : 'D',
            TXN_DATE: serverBusinessDate,
            DISP_AVAIL_BAL: newLedgerBalance,
            DEPOSITOR_PAYEE_NM: depositorName || customerName || 'System',
          },
          { transaction }
        );
        console.log(`✅ SMS record created`);

        setImmediate(async () => {
          try {
            const smsResult = await smsService.sendSMS(customerPhoneNumber, messageContent);
            if (smsResult.success) {
              console.log(`✅ SMS sent successfully`);
            } else {
              console.error(`❌ Failed to send SMS:`, smsResult.error);
            }
          } catch (smsSendError) {
            console.error('❌ SMS sending error:', smsSendError.message);
          }
        });
      } catch (smsError) {
        console.error('❌ Failed to create SMS record:', smsError.message);
      }
    }

    // ================================================================
    // ✅ AUDIT TRAIL
    // ================================================================
    try {
      await sequelize.query(
        `INSERT INTO audit_trail 
         (event_id, user_id, event_type, action, old_value, new_value, ip_address, 
          timestamp, entity_type, entity_id, status, account_no, description, 
          server_processing_date, system_time, created_at, updated_at)
         VALUES (:eventId, :userId, 'TRANSACTION_POST', 'Post Transaction', :oldValue, :newValue, 
          :ipAddress, NOW(), 'Transaction', :transactionId, 'SUCCESS', :accountNo, :description,
          :serverProcessingDate, :systemTime, NOW(), NOW())`,
        {
          replacements: {
            eventId: Math.floor(Date.now() / 1000),
            userId: userId,
            oldValue: JSON.stringify({ previous_balance: currentLedgerBalance }),
            newValue: JSON.stringify({ 
              referenceNo, 
              amount, 
              emtl: emtlResult.amount,
              newBalance: newLedgerBalance,
              serverProcessingDate: serverBusinessDateStr,
              systemTime: systemTimeStr,
              aiSanctionCheck: {
                performed: true,
                riskLevel: sanctionResult.riskLevel,
                riskScore: sanctionResult.riskScore
              }
            }),
            ipAddress: req.ip || 'unknown',
            transactionId: referenceNo,
            accountNo: accountNumber,
            description: descriptionWithEMTL,
            serverProcessingDate: serverBusinessDateStr,
            systemTime: systemTimeStr
          },
          transaction,
        }
      );
    } catch (e) {
      console.warn('Audit error:', e);
    }

    await transaction.commit();
    console.log(`✅ Transaction ${referenceNo} completed successfully`);

    // ================================================================
    // ✅ BUILD RESPONSE
    // ================================================================
    const responseData = {
      success: true,
      message: isDeposit ? 'Deposit successful' : 'Withdrawal successful',
      reference_no: referenceNo,
      new_balance: newLedgerBalance,
      transaction_date: serverBusinessDate,
      server_processing_date: serverBusinessDateStr,
      system_time: systemTimeStr,
      posted_by: userId,
      depositor_name: depositorName,
      aml_risk: finalAmlCheck.riskLevel,
      requires_approval: false,
      approval_status: 'APPROVED',
      policy_checked: policyFound,
      created_by: userId,
      charges: {
        emtl: {
          amount: emtlResult.amount,
          applicable: emtlResult.applicable,
          reason: emtlResult.reason,
          glAccount: emtlResult.glAccount,
          beneficiary: emtlResult.beneficiary
        }
      },
      total_debit: totalDebitAmount,
      notification_sent: true,
      audit: {
        server_processing_date: serverBusinessDateStr,
        system_time: systemTimeStr,
        system_user: userId
      },
      ai_sanction_check: {
        performed: true,
        risk_level: sanctionResult.riskLevel,
        risk_score: sanctionResult.riskScore,
        matches: sanctionResult.matches?.length || 0,
        blocked: sanctionResult.blocked,
        flagged: sanctionResult.shouldFlagForReview,
        clear: !sanctionResult.blocked && !sanctionResult.shouldFlagForReview
      }
    };

    if (drawerUpdated) {
      responseData.drawer = {
        drawerId: drawerId,
        drawerNo: drawerNo,
        previousBalance: drawerBalanceBefore,
        newBalance: drawerBalanceAfter,
        netChange: isDeposit ? amount : -(amount + emtlResult.amount),
        updated: true
      };
    }

    return res.status(200).json(responseData);
    
  } catch (error) {
    await transaction.rollback();
    console.error('Transaction error:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Transaction processing failed',
      code: error.code || 'TRANSACTION_ERROR',
    });
  }
}


  // ================================================================
  // ✅ APPROVE TRANSACTION
  // ================================================================
  async approveTransaction(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { referenceNo, approvedBy, notes } = req.body;
      const approverId = req.user?.username || approvedBy || req.user?.id || 'system';
      const approverRole = req.user?.role || 'SUPERVISOR';
      
      if (!referenceNo) {
        return res.status(400).json({
          success: false,
          message: 'Reference number is required'
        });
      }
      
      const [pendingTxn] = await sequelize.query(
        `SELECT * FROM deposit_transactions 
         WHERE transaction_ref_no = :referenceNo 
         AND status = 'PENDING_APPROVAL'
         LIMIT 1`,
        {
          replacements: { referenceNo },
          type: QueryTypes.SELECT,
          transaction
        }
      );
      
      if (!pendingTxn) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Pending transaction not found'
        });
      }
      
      await sequelize.query(
        `UPDATE deposit_transactions 
         SET status = 'COMPLETED',
             approval_status = 'APPROVED',
             approved_by = :approverId,
             approved_at = NOW(),
             updated_at = NOW()
         WHERE transaction_ref_no = :referenceNo`,
        {
          replacements: { referenceNo, approverId },
          transaction
        }
      );
      
      try {
        await sendNotification({
          roleId: 'Admin',
          message: `✅ Transaction ${referenceNo} has been approved by ${approverId}`,
          itemId: referenceNo,
          priority: 'medium',
          metadata: {
            referenceNo: referenceNo,
            approvedBy: approverId,
            notes: notes || 'Approved',
            accountNumber: pendingTxn.account_number,
            amount: pendingTxn.amount,
            transactionType: pendingTxn.transaction_type
          }
        });
        console.log(`✅ Approval notification sent for ${referenceNo}`);
      } catch (notifError) {
        console.warn('⚠️ Failed to send approval notification:', notifError.message);
      }
      
      await transaction.commit();
      
      return res.status(200).json({
        success: true,
        message: 'Transaction approved successfully',
        data: {
          referenceNo: referenceNo,
          approvedBy: approverId,
          approvedAt: new Date()
        }
      });
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error approving transaction:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to approve transaction',
        error: error.message
      });
    }
  }

  // ================================================================
  // ✅ REJECT TRANSACTION
  // ================================================================
  async rejectTransaction(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { referenceNo, rejectedBy, reason } = req.body;
      const rejectorId = req.user?.username || rejectedBy || req.user?.id || 'system';
      
      if (!referenceNo) {
        return res.status(400).json({
          success: false,
          message: 'Reference number is required'
        });
      }
      
      const [pendingTxn] = await sequelize.query(
        `SELECT * FROM deposit_transactions 
         WHERE transaction_ref_no = :referenceNo 
         AND status = 'PENDING_APPROVAL'
         LIMIT 1`,
        {
          replacements: { referenceNo },
          type: QueryTypes.SELECT,
          transaction
        }
      );
      
      if (!pendingTxn) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Pending transaction not found'
        });
      }
      
      await sequelize.query(
        `UPDATE deposit_transactions 
         SET status = 'REJECTED',
             approval_status = 'REJECTED',
             approved_by = :rejectorId,
             approved_at = NOW(),
             description = CONCAT(description, ' - REJECTED: ', :reason),
             updated_at = NOW()
         WHERE transaction_ref_no = :referenceNo`,
        {
          replacements: { referenceNo, rejectorId, reason: reason || 'No reason provided' },
          transaction
        }
      );
      
      try {
        await sendNotification({
          roleId: 'Admin',
          message: `❌ Transaction ${referenceNo} has been REJECTED by ${rejectorId}. Reason: ${reason || 'No reason provided'}`,
          itemId: referenceNo,
          priority: 'urgent',
          metadata: {
            referenceNo: referenceNo,
            rejectedBy: rejectorId,
            reason: reason || 'No reason provided',
            accountNumber: pendingTxn.account_number,
            amount: pendingTxn.amount
          }
        });
        console.log(`✅ Rejection notification sent for ${referenceNo}`);
      } catch (notifError) {
        console.warn('⚠️ Failed to send rejection notification:', notifError.message);
      }
      
      await transaction.commit();
      
      return res.status(200).json({
        success: true,
        message: 'Transaction rejected',
        data: {
          referenceNo: referenceNo,
          rejectedBy: rejectorId,
          rejectedAt: new Date(),
          reason: reason || 'No reason provided'
        }
      });
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error rejecting transaction:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to reject transaction',
        error: error.message
      });
    }
  }

  // ================================================================
  // ✅ GET PENDING TRANSACTIONS
  // ================================================================
  async getPendingTransactions(req, res) {
    try {
      const { limit = 100, offset = 0 } = req.query;
      
      const [transactions] = await sequelize.query(
        `SELECT * FROM deposit_transactions 
         WHERE status = 'PENDING_APPROVAL' 
         ORDER BY created_at ASC
         LIMIT :limit OFFSET :offset`,
        {
          replacements: {
            limit: parseInt(limit),
            offset: parseInt(offset)
          },
          type: QueryTypes.SELECT
        }
      );
      
      const [countResult] = await sequelize.query(
        `SELECT COUNT(*) as count FROM deposit_transactions 
         WHERE status = 'PENDING_APPROVAL'`,
        {
          type: QueryTypes.SELECT
        }
      );
      
      return res.status(200).json({
        success: true,
        data: transactions,
        count: parseInt(countResult?.count || 0),
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
    } catch (error) {
      console.error('❌ Error fetching pending transactions:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch pending transactions',
        error: error.message
      });
    }
  }

  // ================================================================
  // ✅ GET ACCOUNT BALANCE
  // ================================================================
  async getAccountBalance(req, res) {
    try {
      const { accountNo } = req.params;
      
      let [account] = await sequelize.query(
        `SELECT account_number, account_name as acct_nm, ledger_balance, available_balance, cleared_balance
         FROM customer_accounts 
         WHERE account_number = :accountNo
         LIMIT 1`,
        {
          replacements: { accountNo },
          type: QueryTypes.SELECT
        }
      );
      
      if (!account) {
        [account] = await sequelize.query(
          `SELECT account_number, acct_nm, ledger_balance, available_balance, cleared_balance
           FROM accounts 
           WHERE account_number = :accountNo OR ACCT_NO = :accountNo
           LIMIT 1`,
          {
            replacements: { accountNo },
            type: QueryTypes.SELECT
          }
        );
      }
      
      if (!account) {
        return res.status(404).json({
          success: false,
          message: `Account not found: ${accountNo}`,
          code: 'ACCOUNT_NOT_FOUND'
        });
      }
      
      return res.status(200).json({
        success: true,
        data: {
          account_number: account.account_number,
          account_name: account.acct_nm,
          ledger_balance: parseFloat(account.ledger_balance) || 0,
          available_balance: parseFloat(account.available_balance) || 0,
          cleared_balance: parseFloat(account.cleared_balance) || 0
        }
      });
      
    } catch (error) {
      console.error('Error fetching account balance:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch account balance',
        error: error.message
      });
    }
  }

  // ================================================================
  // ✅ GET TRANSACTIONS BY ACCOUNT
  // ================================================================
  async getTransactionsByAccount(req, res) {
    try {
      const { accountNo } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      const transactions = await sequelize.query(
        `SELECT * FROM deposit_transactions 
         WHERE account_number = :accountNo
         ORDER BY transaction_date DESC
         LIMIT :limit OFFSET :offset`,
        {
          replacements: { accountNo, limit: parseInt(limit), offset: parseInt(offset) },
          type: QueryTypes.SELECT
        }
      );
      
      return res.status(200).json({
        success: true,
        data: transactions,
        count: transactions.length
      });
      
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions',
        error: error.message
      });
    }
  }

  // ================================================================
  // ✅ GET CUSTOMER ACCOUNTS
  // ================================================================
  async getCustomerAccounts(req, res) {
    try {
      const { customerId } = req.params;
      
      const accounts = await sequelize.query(
        `SELECT * FROM customer_accounts 
         WHERE customer_id = :customerId
         ORDER BY created_at DESC`,
        {
          replacements: { customerId },
          type: QueryTypes.SELECT
        }
      );
      
      return res.status(200).json({
        success: true,
        data: accounts,
        count: accounts.length
      });
      
    } catch (error) {
      console.error('Error fetching customer accounts:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch customer accounts',
        error: error.message
      });
    }
  }

  // ================================================================
  // ✅ GET TRANSACTION HISTORY WITH FILTERS
  // ================================================================
  async getTransactionHistory(req, res) {
    try {
      const { startDate, endDate, accountNo, limit = 100 } = req.query;
      
      let whereClause = '1=1';
      const replacements = {};
      
      if (startDate) {
        whereClause += ' AND transaction_date >= :startDate';
        replacements.startDate = startDate;
      }
      
      if (endDate) {
        whereClause += ' AND transaction_date <= :endDate';
        replacements.endDate = endDate;
      }
      
      if (accountNo) {
        whereClause += ' AND account_number = :accountNo';
        replacements.accountNo = accountNo;
      }
      
      const transactions = await sequelize.query(
        `SELECT * FROM deposit_transactions 
         WHERE ${whereClause}
         ORDER BY transaction_date DESC
         LIMIT :limit`,
        {
          replacements: { ...replacements, limit: parseInt(limit) },
          type: QueryTypes.SELECT
        }
      );
      
      return res.status(200).json({
        success: true,
        data: transactions,
        count: transactions.length
      });
      
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction history',
        error: error.message
      });
    }
  }

  // ================================================================
  // ✅ GET TRANSACTIONS BY CUSTOMER ID
  // ================================================================
  async getTransactionsByCustomer(req, res) {
    try {
      const { customerId } = req.params;
      const { limit = 50 } = req.query;
      
      const transactions = await sequelize.query(
        `SELECT dt.* FROM deposit_transactions dt
         JOIN customer_accounts ca ON dt.account_number = ca.account_number
         WHERE ca.customer_id = :customerId
         ORDER BY dt.transaction_date DESC
         LIMIT :limit`,
        {
          replacements: { customerId, limit: parseInt(limit) },
          type: QueryTypes.SELECT
        }
      );
      
      return res.status(200).json({
        success: true,
        data: transactions,
        count: transactions.length
      });
      
    } catch (error) {
      console.error('Error fetching customer transactions:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch customer transactions',
        error: error.message
      });
    }
  }

  // ================================================================
  // ✅ GET TRANSACTIONS BY CUSTOMER NAME
  // ================================================================
  async getTransactionsByCustomerName(req, res) {
    try {
      const { customerName } = req.params;
      const { limit = 50 } = req.query;
      
      const transactions = await sequelize.query(
        `SELECT dt.* FROM deposit_transactions dt
         JOIN customer_accounts ca ON dt.account_number = ca.account_number
         JOIN customers c ON ca.customer_id = c.id
         WHERE c.FIRST_NAME LIKE :name OR c.LAST_NAME LIKE :name OR c.CUST_NM LIKE :name
         ORDER BY dt.transaction_date DESC
         LIMIT :limit`,
        {
          replacements: { name: `%${customerName}%`, limit: parseInt(limit) },
          type: QueryTypes.SELECT
        }
      );
      
      return res.status(200).json({
        success: true,
        data: transactions,
        count: transactions.length
      });
      
    } catch (error) {
      console.error('Error fetching transactions by customer name:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions',
        error: error.message
      });
    }
  }

  // ================================================================
  // ✅ EXPORT TRANSACTIONS
  // ================================================================
  async exportTransactions(req, res) {
    try {
      const { format = 'json', startDate, endDate, accountNo } = req.query;
      
      let whereClause = '1=1';
      const replacements = {};
      
      if (startDate) {
        whereClause += ' AND transaction_date >= :startDate';
        replacements.startDate = startDate;
      }
      
      if (endDate) {
        whereClause += ' AND transaction_date <= :endDate';
        replacements.endDate = endDate;
      }
      
      if (accountNo) {
        whereClause += ' AND account_number = :accountNo';
        replacements.accountNo = accountNo;
      }
      
      const transactions = await sequelize.query(
        `SELECT * FROM deposit_transactions 
         WHERE ${whereClause}
         ORDER BY transaction_date DESC`,
        {
          replacements,
          type: QueryTypes.SELECT
        }
      );
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
        
        const headers = Object.keys(transactions[0] || {}).join(',');
        const rows = transactions.map(t => Object.values(t).join(','));
        const csv = [headers, ...rows].join('\n');
        
        return res.send(csv);
      }
      
      return res.status(200).json({
        success: true,
        data: transactions,
        count: transactions.length
      });
      
    } catch (error) {
      console.error('Error exporting transactions:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to export transactions',
        error: error.message
      });
    }
  }

  // ================================================================
  // ✅ EMTL SERVICES
  // ================================================================
  async getEMTLReport(req, res) {
    try {
      const { startDate, endDate, reportType = 'daily' } = req.query;

      let report;
      switch (reportType) {
        case 'daily':
          report = await EMTLReportService.generateDailyReport(startDate);
          break;
        case 'weekly':
          report = await EMTLReportService.generateWeeklyReport(startDate);
          break;
        case 'monthly':
          report = await EMTLReportService.generateMonthlyReport(startDate);
          break;
        default:
          report = await EMTLReportService.generateReportByDateRange(
            new Date(startDate),
            new Date(endDate)
          );
      }

      return res.status(200).json({
        success: true,
        data: report
      });
    } catch (error) {
      console.error('Error generating EMTL report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate EMTL report',
        error: error.message
      });
    }
  }

  async getRemittanceReport(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const report = await EMTLReportService.generateReconciliationReport(
        new Date(startDate),
        new Date(endDate)
      );

      return res.status(200).json({
        success: true,
        data: report
      });
    } catch (error) {
      console.error('Error generating remittance report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate remittance report',
        error: error.message
      });
    }
  }

  async generateReceipt(req, res) {
    try {
      const { transactionId } = req.params;

      const [transaction] = await sequelize.query(
        `SELECT * FROM deposit_transactions WHERE transaction_ref_no = :transactionId OR id = :transactionId`,
        {
          replacements: { transactionId },
          type: QueryTypes.SELECT
        }
      );

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      const receipt = EMTLReceiptService.generateReceipt({
        transactionId: transaction.id,
        referenceNo: transaction.transaction_ref_no,
        customerId: transaction.customer_id,
        customerName: transaction.depositor_name || 'Customer',
        accountNo: transaction.account_number,
        amount: parseFloat(transaction.amount),
        emtlAmount: parseFloat(transaction.emtl_amount || 0),
        totalDebit: parseFloat(transaction.total_debit || transaction.amount),
        emtlApplicable: transaction.emtl_applicable === 1 || transaction.emtl_applicable === true,
        emtlReason: transaction.emtl_reason,
        transactionType: transaction.transaction_type,
        transactionDate: transaction.transaction_date,
        description: transaction.description
      });

      if (req.query.format === 'html') {
        const html = EMTLReceiptService.generateHTMLReceipt({
          transactionId: transaction.id,
          referenceNo: transaction.transaction_ref_no,
          customerId: transaction.customer_id,
          customerName: transaction.depositor_name || 'Customer',
          accountNo: transaction.account_number,
          amount: parseFloat(transaction.amount),
          emtlAmount: parseFloat(transaction.emtl_amount || 0),
          totalDebit: parseFloat(transaction.total_debit || transaction.amount),
          emtlApplicable: transaction.emtl_applicable === 1 || transaction.emtl_applicable === true,
          emtlReason: transaction.emtl_reason,
          transactionType: transaction.transaction_type,
          transactionDate: transaction.transaction_date,
          description: transaction.description
        });
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(html);
      }

      return res.status(200).json({
        success: true,
        data: receipt
      });
    } catch (error) {
      console.error('Error generating receipt:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate receipt',
        error: error.message
      });
    }
  }

  async generateRemittanceFile(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const result = await EMTLRemittanceService.generateRemittanceFile(
        new Date(startDate),
        new Date(endDate)
      );

      if (result.message) {
        return res.status(200).json({
          success: true,
          message: result.message
        });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${result.fileName}`);
      return res.send(result.csv);
    } catch (error) {
      console.error('Error generating remittance file:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate remittance file',
        error: error.message
      });
    }
  }

  async markCollectionsRemitted(req, res) {
    try {
      const { batchId, remittanceReference } = req.body;
      const userId = req.user?.username || 'SYSTEM';

      if (!batchId) {
        return res.status(400).json({
          success: false,
          message: 'Batch ID is required'
        });
      }

      const result = await EMTLRemittanceService.markAsRemitted(
        batchId,
        remittanceReference,
        userId
      );

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error marking collections as remitted:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark collections as remitted',
        error: error.message
      });
    }
  }

  async getPendingCollections(req, res) {
    try {
      const { limit = 1000, offset = 0 } = req.query;

      const collections = await EMTLCollectionService.getPendingCollections({
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return res.status(200).json({
        success: true,
        data: collections,
        count: collections.length
      });
    } catch (error) {
      console.error('Error fetching pending collections:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch pending collections',
        error: error.message
      });
    }
  }

  async getCollectionsByDateRange(req, res) {
    try {
      const { startDate, endDate, status } = req.query;

      const collections = await EMTLCollectionService.getByDateRange(
        new Date(startDate),
        new Date(endDate),
        status
      );

      return res.status(200).json({
        success: true,
        data: collections,
        count: collections.length
      });
    } catch (error) {
      console.error('Error fetching collections:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch collections',
        error: error.message
      });
    }
  }

  async getCollectionsByAccount(req, res) {
    try {
      const { accountNo } = req.params;
      const { limit = 100, offset = 0 } = req.query;

      const collections = await EMTLCollectionService.getByAccount(accountNo, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return res.status(200).json({
        success: true,
        data: collections,
        count: collections.length
      });
    } catch (error) {
      console.error('Error fetching collections by account:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch collections',
        error: error.message
      });
    }
  }

  async getCollectionsByCustomer(req, res) {
    try {
      const { customerNo } = req.params;
      const { limit = 100, offset = 0 } = req.query;

      const collections = await EMTLCollectionService.getByCustomer(customerNo, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return res.status(200).json({
        success: true,
        data: collections,
        count: collections.length
      });
    } catch (error) {
      console.error('Error fetching collections by customer:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch collections',
        error: error.message
      });
    }
  }

  // ================================================================
  // ✅ TELLER TRANSACTIONS
  // ================================================================
  async getTellerDailyTransactions(req, res) {
    try {
      const { userId } = req.params;
      const { date, startDate, endDate } = req.query;
      
      const tellerUserId = userId || req.query.userId;
      
      if (!tellerUserId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required. Provide as :userId in path or ?userId= in query.'
        });
      }

      let startDateTime, endDateTime;
      
      if (startDate && endDate) {
        startDateTime = new Date(startDate);
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
      } else if (date) {
        startDateTime = new Date(date);
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime = new Date(date);
        endDateTime.setHours(23, 59, 59, 999);
      } else {
        const today = new Date();
        startDateTime = new Date(today);
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime = new Date(today);
        endDateTime.setHours(23, 59, 59, 999);
      }

      console.log(`📊 Fetching daily transactions for teller: ${tellerUserId}`);
      console.log(`📅 Date range: ${startDateTime.toISOString()} to ${endDateTime.toISOString()}`);

      const depositTransactions = await sequelize.query(
        `
        SELECT 
          id, customer_id, account_number, transaction_type, amount,
          emtl_amount, total_debit, emtl_applicable, emtl_reason,
          currency, status, aml_risk_level,
          created_by, transaction_date, created_at,
          branch_id, approved_by, approved_at,
          transaction_ref_no, description,
          requires_approval, approved_by_role, approval_status,
          server_processing_date, system_time, system_user_id
        FROM deposit_transactions
        WHERE created_by IN (:userId, 'system')
          AND transaction_date BETWEEN :startDate AND :endDate
        ORDER BY transaction_date DESC, created_at DESC
        `,
        {
          replacements: {
            userId: tellerUserId,
            startDate: startDateTime,
            endDate: endDateTime
          },
          type: QueryTypes.SELECT
        }
      );

      console.log(`✅ Found ${depositTransactions.length} deposit transactions for ${tellerUserId}`);

      const [drawer] = await sequelize.query(
        `
        SELECT DRAWER_ID, DRAWER_NO, USER_ID, WF_STATUS, CURRENT_BALANCE
        FROM drawers
        WHERE USER_ID = :userId OR DRAWER_NO = :userId
        LIMIT 1
        `,
        {
          replacements: { userId: tellerUserId },
          type: QueryTypes.SELECT
        }
      );

      let drawerTransactionsByNo = [];

      if (drawer) {
        console.log(`✅ Found drawer: ${drawer.DRAWER_NO} for user ${tellerUserId}`);
        
        drawerTransactionsByNo = await sequelize.query(
          `
          SELECT 
            id, drawer_id, drawer_no, transaction_type, amount,
            previous_balance, new_balance, transaction_ref_no,
            customer_account, description, user_id, created_at
          FROM drawer_transactions
          WHERE drawer_no = :drawerNo
            AND created_at BETWEEN :startDate AND :endDate
          ORDER BY created_at DESC
          `,
          {
            replacements: {
              drawerNo: drawer.DRAWER_NO,
              startDate: startDateTime,
              endDate: endDateTime
            },
            type: QueryTypes.SELECT
          }
        );
        
        console.log(`✅ Found ${drawerTransactionsByNo.length} drawer transactions for ${drawer.DRAWER_NO}`);
      }

      const summary = {
        totalTransactions: depositTransactions.length + drawerTransactionsByNo.length,
        totalDepositAmount: 0,
        totalWithdrawalAmount: 0,
        totalEMTLAmount: 0,
        totalAmount: 0,
        approvedTransactions: 0,
        pendingTransactions: 0,
        rejectedTransactions: 0,
        depositCount: 0,
        withdrawalCount: 0
      };

      depositTransactions.forEach(tx => {
        const amount = parseFloat(tx.amount || 0);
        const emtl = parseFloat(tx.emtl_amount || 0);
        const isDeposit = tx.transaction_type === 'DEPOSIT' || 
                           tx.transaction_type === 'CR' || 
                           tx.transaction_type === 'C' ||
                           tx.transaction_type === 'DEPOSIT_CR';
        
        if (isDeposit) {
          summary.depositCount++;
          summary.totalDepositAmount += amount;
        } else {
          summary.withdrawalCount++;
          summary.totalWithdrawalAmount += amount;
        }
        
        summary.totalAmount += amount;
        summary.totalEMTLAmount += emtl;
        
        const status = tx.status || tx.approval_status || '';
        if (status === 'COMPLETED' || status === 'APPROVED') {
          summary.approvedTransactions++;
        } else if (status === 'PENDING_APPROVAL' || status === 'PENDING') {
          summary.pendingTransactions++;
        } else if (status === 'REJECTED' || status === 'FAILED') {
          summary.rejectedTransactions++;
        }
      });

      drawerTransactionsByNo.forEach(tx => {
        const amount = parseFloat(tx.amount || 0);
        const isDeposit = tx.transaction_type === 'DEPOSIT';
        
        if (isDeposit) {
          summary.depositCount++;
          summary.totalDepositAmount += amount;
        } else {
          summary.withdrawalCount++;
          summary.totalWithdrawalAmount += amount;
        }
        summary.totalAmount += amount;
      });

      let userInfo = null;
      try {
        const [user] = await sequelize.query(
          `
          SELECT username as user_name, full_name, email, role_id, business_unit
          FROM users
          WHERE username = :userId OR id = :userId
          LIMIT 1
          `,
          {
            replacements: { userId: tellerUserId },
            type: QueryTypes.SELECT
          }
        );
        userInfo = user;
      } catch (userError) {
        console.warn('⚠️ Could not fetch user info:', userError.message);
      }

      const formattedTransactions = depositTransactions.map(tx => ({
        id: tx.id,
        reference_no: tx.transaction_ref_no || `TXN-${tx.id}`,
        account_number: tx.account_number,
        transaction_type: tx.transaction_type,
        amount: parseFloat(tx.amount || 0),
        emtl_amount: parseFloat(tx.emtl_amount || 0),
        total_debit: parseFloat(tx.total_debit || 0),
        emtl_applicable: !!tx.emtl_applicable,
        emtl_reason: tx.emtl_reason,
        currency: tx.currency || 'NGN',
        status: tx.status || tx.approval_status || 'UNKNOWN',
        description: tx.description || '',
        transaction_date: tx.transaction_date || tx.created_at,
        created_by: tx.created_by,
        approved_by: tx.approved_by,
        approved_at: tx.approved_at,
        requires_approval: !!tx.requires_approval,
        approval_status: tx.approval_status || tx.status || 'UNKNOWN',
        aml_risk_level: tx.aml_risk_level || 'LOW',
        server_processing_date: tx.server_processing_date,
        system_time: tx.system_time,
        system_user_id: tx.system_user_id
      }));

      return res.status(200).json({
        success: true,
        data: {
          user: {
            userId: tellerUserId,
            userName: userInfo?.user_name || tellerUserId,
            fullName: userInfo?.full_name || null,
            email: userInfo?.email || null,
            roleId: userInfo?.role_id || null,
            businessUnit: userInfo?.business_unit || null
          },
          drawer: drawer ? {
            drawerId: drawer.DRAWER_ID,
            drawerNo: drawer.DRAWER_NO,
            drawerName: drawer.DRAWER_NM || `Drawer ${drawer.DRAWER_NO}`,
            status: drawer.WF_STATUS,
            balance: parseFloat(drawer.CURRENT_BALANCE || 0)
          } : null,
          dateRange: {
            start: startDateTime.toISOString(),
            end: endDateTime.toISOString(),
            date: startDateTime.toISOString().split('T')[0]
          },
          summary: summary,
          transactions: {
            deposits: formattedTransactions,
            drawer_transactions: drawerTransactionsByNo.map(tx => ({
              id: tx.id,
              reference_no: tx.transaction_ref_no,
              drawer_no: tx.drawer_no,
              drawer_id: tx.drawer_id,
              transaction_type: tx.transaction_type,
              amount: parseFloat(tx.amount || 0),
              previous_balance: parseFloat(tx.previous_balance || 0),
              new_balance: parseFloat(tx.new_balance || 0),
              customer_account: tx.customer_account,
              description: tx.description,
              created_at: tx.created_at,
              user_id: tx.user_id
            }))
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Error fetching teller daily transactions:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch teller daily transactions',
        error: error.message
      });
    }
  }

  async getTellerTransactionSummary(req, res) {
    try {
      const { userId } = req.query;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      const today = new Date();
      const startDate = new Date(today);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);

      const [transactions] = await sequelize.query(
        `
        SELECT 
          COUNT(*) as total_count,
          SUM(CASE WHEN transaction_type IN ('DEPOSIT', 'CR') THEN amount ELSE 0 END) as total_deposits,
          SUM(CASE WHEN transaction_type IN ('WITHDRAWAL', 'DR') THEN amount ELSE 0 END) as total_withdrawals,
          SUM(emtl_amount) as total_emtl,
          COUNT(CASE WHEN status = 'PENDING_APPROVAL' OR approval_status = 'PENDING' THEN 1 END) as pending_count
        FROM deposit_transactions
        WHERE created_by = :userId
          AND transaction_date BETWEEN :startDate AND :endDate
        `,
        {
          replacements: {
            userId,
            startDate,
            endDate
          },
          type: QueryTypes.SELECT
        }
      );

      const [drawerTxns] = await sequelize.query(
        `
        SELECT 
          COUNT(*) as count,
          SUM(CASE WHEN transaction_type = 'DEPOSIT' THEN amount ELSE 0 END) as total_deposits,
          SUM(CASE WHEN transaction_type = 'WITHDRAWAL' THEN amount ELSE 0 END) as total_withdrawals
        FROM drawer_transactions
        WHERE user_id = :userId
          AND created_at BETWEEN :startDate AND :endDate
        `,
        {
          replacements: {
            userId,
            startDate,
            endDate
          },
          type: QueryTypes.SELECT
        }
      );

      const [drawer] = await sequelize.query(
        `
        SELECT DRAWER_ID, DRAWER_NO, CURRENT_BALANCE as balance, WF_STATUS as status
        FROM drawers
        WHERE USER_ID = :userId
        LIMIT 1
        `,
        {
          replacements: { userId },
          type: QueryTypes.SELECT
        }
      );

      return res.status(200).json({
        success: true,
        data: {
          userId,
          date: today.toISOString().split('T')[0],
          summary: {
            totalTransactions: parseInt(transactions?.total_count || 0) + parseInt(drawerTxns?.count || 0),
            totalDeposits: parseFloat(transactions?.total_deposits || 0) + parseFloat(drawerTxns?.total_deposits || 0),
            totalWithdrawals: parseFloat(transactions?.total_withdrawals || 0) + parseFloat(drawerTxns?.total_withdrawals || 0),
            totalEMTL: parseFloat(transactions?.total_emtl || 0),
            pendingApprovals: parseInt(transactions?.pending_count || 0)
          },
          drawer: drawer ? {
            drawerId: drawer.DRAWER_ID,
            drawerNo: drawer.DRAWER_NO,
            balance: parseFloat(drawer.balance || 0),
            status: drawer.status
          } : null
        }
      });

    } catch (error) {
      console.error('❌ Error fetching teller transaction summary:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch teller transaction summary',
        error: error.message
      });
    }
  }
}

// Export singleton instance
const transactionController = new TransactionController();
export default transactionController;