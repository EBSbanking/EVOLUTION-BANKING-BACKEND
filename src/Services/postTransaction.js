// Services/postTransaction.js – COMPLETE FIXED VERSION
// Fixes:
// 1. Properly sets created_by to the actual user ID (PCO02) instead of 'system'
// 2. Gets user info from req.user
// 3. All transactions are properly attributed to the teller

import sequelize from '../../config/db.js';
import { QueryTypes } from 'sequelize';
import smsService from '../utils/smsService.js';
import moment from 'moment';
import PremblyAMLService from '../Services/PremblyAMLService.js';
import SMS from '../models/SMS.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import Drawer from '../models/Drawer.js';
import { TransactionPolicy } from '../models/TransactionPolicy.js';

class TransactionController {
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
          approval_status VARCHAR(20) DEFAULT 'PENDING'
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

      if (req.decrypted) console.log('🔓 Request decrypted');

      const transactionData = req.body;
      
      // ================================================================
      // ✅ FIX 1: Get the actual user ID from the authenticated request
      // ================================================================
      // Get user info from req.user (set by authentication middleware)
      const authenticatedUser = req.user || {};
      const userId = authenticatedUser.username || 
                     authenticatedUser.id || 
                     authenticatedUser.user_name ||
                     transactionData.USER_ID || 
                     transactionData.CREATED_BY || 
                     'system';
      
      const userRole = authenticatedUser.role || 
                       authenticatedUser.user_role ||
                       transactionData.USER_ROLE || 
                       'TELLER';
      
      const normalizedRole = userRole.toUpperCase();
      
      console.log(`👤 Transaction created by: ${userId} (Role: ${normalizedRole})`);
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

      // Validate required fields
      const accountNumber = transactionData.ACCT_NO || transactionData.account_number;
      const amount = parseFloat(transactionData.AMOUNT || transactionData.amount);
      const transactionType = transactionData.TRANSACTION_TYPE || transactionData.transaction_type;
      const depositorName = transactionData.DEPOSITOR_NAME || transactionData.depositor_name;
      const description = transactionData.DESCRIPTION || transactionData.description || 'Cash Transaction';
      const transactionDate = transactionData.TRANSACTION_DATE || transactionData.transaction_date || new Date();
      const valueDate = transactionData.VALUE_DATE || transactionData.value_date || transactionDate;
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

      // Determine policy type
      const policyType = isDeposit ? 'Deposit' : 'Withdrawal';
      
      const formattedAmount = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
      }).format(amount);

      // ================================================================
      // ✅ TRANSACTION POLICY VALIDATION - IMPROVED
      // ================================================================
      let requiresApproval = false;
      let authorizedRoles = [];
      let policyCheckResult = null;
      let policyFound = false;
      
      try {
        console.log(`🔍 Checking transaction policy for:`);
        console.log(`   - User ID: ${userId}`);
        console.log(`   - Role: ${normalizedRole}`);
        console.log(`   - Policy Type: ${policyType}`);
        console.log(`   - Amount: ₦${amount.toLocaleString()}`);
        console.log(`   - BU_ID: ${businessUnit || 'None'}`);
        console.log(`   - Branch: ${branchId || 'None'}`);
        
        // First, check if any policies exist for this role and type
        const existingPolicies = await TransactionPolicy.getAllPolicies({
          role_name: normalizedRole,
          policy_type: policyType,
          status: 'ACTIVE'
        });
        
        console.log(`📋 Found ${existingPolicies.length} active policies for ${normalizedRole} - ${policyType}`);
        
        if (existingPolicies.length === 0) {
          console.warn(`⚠️ NO POLICY FOUND for ${normalizedRole} - ${policyType}`);
          console.log(`🔧 Defaulting to: requiresApproval = FALSE (no policy means auto-approve)`);
          requiresApproval = false;
          authorizedRoles = [];
          policyFound = false;
        } else {
          // Policies exist, check if amount falls within any range
          policyCheckResult = await TransactionPolicy.checkRequiresApproval(
            policyType,
            normalizedRole,
            amount,
            businessUnit || null,
            branchId || null
          );
          
          policyFound = !!policyCheckResult.policy;
          
          console.log(`📋 Policy check result:`, {
            hasPolicy: !!policyCheckResult.policy,
            hasRange: !!policyCheckResult.range,
            requiresApproval: policyCheckResult.requiresApproval,
            authorizedRoles: policyCheckResult.authorizedRoles
          });
          
          if (!policyCheckResult.policy) {
            console.warn(`⚠️ No active policy found for ${normalizedRole} - ${policyType}`);
            console.log(`🔧 Defaulting to: requiresApproval = FALSE`);
            requiresApproval = false;
            authorizedRoles = [];
          } else if (!policyCheckResult.range) {
            console.warn(`⚠️ Amount ₦${amount.toLocaleString()} is outside all ranges for ${normalizedRole} - ${policyType}`);
            console.log(`🔧 Defaulting to: requiresApproval = TRUE (outside policy ranges)`);
            requiresApproval = true;
            authorizedRoles = ['SUPERVISOR', 'MANAGER'];
          } else {
            requiresApproval = policyCheckResult.requiresApproval;
            authorizedRoles = policyCheckResult.authorizedRoles || [];
            console.log(`✅ Valid policy found! requiresApproval = ${requiresApproval}`);
            console.log(`   Authorized Roles: ${authorizedRoles.join(', ') || 'None'}`);
          }
        }
        
        console.log(`📊 FINAL DECISION: requiresApproval = ${requiresApproval}`);
        if (requiresApproval) {
          console.log(`   Approvers: ${authorizedRoles.join(', ')}`);
        }
        
      } catch (policyError) {
        console.error('❌ Error checking transaction policy:', policyError);
        requiresApproval = false;
        authorizedRoles = [];
        policyFound = false;
        console.log(`🔧 Error fallback: requiresApproval = FALSE`);
      }

      // ================================================================
      // AML CHECK
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
      
      if (shouldBlock) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: 'Transaction blocked – critical amount exceeds limit',
          code: 'AML_BLOCK',
        });
      }

      if (amountRiskLevel === 'HIGH' || amountRiskLevel === 'CRITICAL') {
        requiresApproval = true;
        if (!authorizedRoles || authorizedRoles.length === 0) {
          authorizedRoles = ['SUPERVISOR', 'MANAGER', 'ADMIN'];
        }
        console.log(`🔒 AML ${amountRiskLevel} risk detected, requiring approval`);
      }

      const finalAmlCheck = {
        riskLevel: amountRiskLevel,
        riskScore: amountRiskScore,
        requiresApproval: requiresApproval,
        requiresSuspiciousReport: amountRequiresSuspiciousReport,
      };

      // ========== Find account ==========
      let account = null;
      let accountSummary = null;
      let customerPhoneNumber = null,
        customerName = null;
      let customerFirstName = null,
        customerLastName = null,
        customerMiddleName = null,
        customerGender = null;
      let allowSms = false;

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
          ca.created_at,
          ca.updated_at,
          ca.sms_alert,
          c.PHONE_NO AS phone_number,
          CONCAT(c.FIRST_NAME, ' ', c.LAST_NAME) AS customer_name,
          c.FIRST_NAME,
          c.MIDDLE_NAME,
          c.LAST_NAME,
          c.GENDER_TY AS gender,
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
        customerPhoneNumber = customerAccount.phone_number;
        customerName = customerAccount.customer_name || customerAccount.acct_nm;
        customerFirstName = customerAccount.FIRST_NAME;
        customerMiddleName = customerAccount.MIDDLE_NAME;
        customerLastName = customerAccount.LAST_NAME;
        customerGender = customerAccount.gender;
        allowSms = customerAccount.sms_alert === 'Yes';
        console.log(`✅ Account found: ${account.account_number}, sms_alert=${customerAccount.sms_alert}`);

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
            a.created_at,
            a.updated_at,
            c.PHONE_NO as phone_number,
            CONCAT(c.FIRST_NAME, ' ', c.LAST_NAME) as customer_name,
            c.FIRST_NAME,
            c.MIDDLE_NAME,
            c.LAST_NAME,
            c.GENDER_TY as gender,
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
          customerPhoneNumber = fallback.phone_number;
          customerName = fallback.customer_name || fallback.acct_nm;
          customerFirstName = fallback.FIRST_NAME;
          customerMiddleName = fallback.MIDDLE_NAME;
          customerLastName = fallback.LAST_NAME;
          customerGender = fallback.gender;
          allowSms = true;
          console.log(`✅ Account found in accounts table: ${account.account_number}`);

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

      // Generate reference number
      const generateReferenceNumber = () => {
        const timestamp = Date.now().toString();
        const randomDigits = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
        const referenceNo = (timestamp + randomDigits).slice(0, 18);
        return referenceNo;
      };

      const referenceNo = generateReferenceNumber();
      const journalId = `JRNL-DEP-${Date.now()}-${accountNumber}`;

      let currentLedgerBalance = 0;
      let currentClearedBalance = 0;
      if (accountSummary) {
        currentLedgerBalance = parseFloat(accountSummary.LEDGER_BAL || 0);
        currentClearedBalance = parseFloat(accountSummary.CLEARED_BAL || 0);
      } else {
        currentLedgerBalance = parseFloat(account.ledger_balance || 0);
        currentClearedBalance = parseFloat(account.cleared_balance || 0);
      }
      console.log(`📊 Current balance: ₦${currentLedgerBalance.toFixed(2)}`);

      // Calculate new balances
      let newLedgerBalance = currentLedgerBalance;
      let newClearedBalance = currentClearedBalance;
      let drTurnover = parseFloat(accountSummary?.DR_TURNOVER || 0);
      let crTurnover = parseFloat(accountSummary?.CR_TURNOVER || 0);
      let drCount = parseInt(accountSummary?.DR_COUNT || 0);
      let crCount = parseInt(accountSummary?.CR_COUNT || 0);

      if (isDeposit) {
        newLedgerBalance += amount;
        newClearedBalance += amount;
        crTurnover += amount;
        crCount++;
        console.log(`💰 DEPOSIT: +₦${amount} → ₦${newLedgerBalance}`);
      } else if (isWithdrawal) {
        if (currentLedgerBalance < amount)
          throw { status: 400, code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds' };
        newLedgerBalance -= amount;
        newClearedBalance -= amount;
        drTurnover += amount;
        drCount++;
        console.log(`💸 WITHDRAWAL: -₦${amount} → ₦${newLedgerBalance}`);
      }

      // ================================================================
      // DRAWER UPDATE
      // ================================================================
      const drawerId = transactionData.DRAWER_ID || transactionData.drawerId || null;
      let drawerUpdated = false;
      let drawerBalanceBefore = 0;
      let drawerBalanceAfter = 0;
      let drawerNo = null;
      
      if (drawerId) {
        console.log(`🔄 Updating drawer ${drawerId} for transaction`);
        
        const drawer = await Drawer.findOne({ 
          where: { 
            DRAWER_ID: drawerId 
          },
          transaction 
        });
        
        if (!drawer) {
          console.warn(`⚠️ Drawer ${drawerId} not found, skipping drawer update`);
        } else if (drawer.WF_STATUS !== 'OPEN') {
          console.warn(`⚠️ Drawer ${drawerId} is not open (status: ${drawer.WF_STATUS}), skipping drawer update`);
        } else {
          drawerNo = drawer.DRAWER_NO;
          drawerBalanceBefore = parseFloat(drawer.CURRENT_BALANCE || 0);
          let newDrawerBalance = drawerBalanceBefore;
          
          if (isDeposit) {
            newDrawerBalance = drawerBalanceBefore + amount;
            console.log(`💰 Drawer ${drawerId}: +₦${amount} → ₦${newDrawerBalance}`);
          } else if (isWithdrawal) {
            if (drawerBalanceBefore < amount) {
              console.warn(`⚠️ Insufficient drawer balance: ₦${drawerBalanceBefore} < ₦${amount}`);
            }
            newDrawerBalance = drawerBalanceBefore - amount;
            console.log(`💸 Drawer ${drawerId}: -₦${amount} → ₦${newDrawerBalance}`);
          }
          
          drawerBalanceAfter = newDrawerBalance;
          
          await Drawer.update(
            {
              CURRENT_BALANCE: newDrawerBalance,
              VERSION_NO: sequelize.literal('VERSION_NO + 1'),
              updatedAt: new Date()
            },
            {
              where: { 
                DRAWER_ID: drawerId 
              },
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
              where: { 
                DRAWER_ID: drawerId 
              },
              transaction
            }
          );
          
          drawerUpdated = true;
          
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
                  userId: userId  // ✅ Use the actual user ID
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
      // INSERT HISTORY RECORD
      // ================================================================
      const historyId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 100);
      const depositAccountId = account.id;
      const drCrInd = isDeposit ? 'C' : 'D';
      const eventId = Math.floor(Date.now() / 1000);

      await sequelize.query(
        `
        INSERT INTO deposit_account_history (
          ACCT_HIST_ID, DEPOSIT_ACCT_ID, ACCT_NO, CONTRA_ACCT_NO, TRAN_DT, VALUE_DT,
          TOTAL_CHRG_AMT, TRAN_DESC, DR_CR_IND, TRAN_REF_TXT, CHQ_NO, SUPERVISOR_ID,
          STMNT_BAL, REC_ST, VERSION_NO, ROW_TS, USER_ID, CREATE_DT, CREATED_BY,
          SYS_CREATE_TS, CHANNEL_ID, EVENT_ID, TXN_AMT, ACCT_AMT, CONTRA_ACCT_AMT,
          DEPOSITOR_PAYEE_NM, created_at, updated_at
        ) VALUES (
          :historyId, :depositAccountId, :accountNumber, :contraAccountNo, :transactionDate, :valueDate,
          :amount, :description, :drCrInd, :referenceNo, :chequeNo, :supervisorId,
          :newBalance, 'A', 1, NOW(), :userId, :transactionDate, :createdBy,
          NOW(), :channelId, :eventId, :amount, :amount, :amount, :depositorName,
          NOW(), NOW()
        )
        `,
        {
          replacements: {
            historyId,
            depositAccountId,
            accountNumber,
            contraAccountNo,
            transactionDate,
            valueDate,
            amount: amount.toFixed(2),
            description,
            drCrInd,
            referenceNo,
            chequeNo,
            supervisorId,
            newBalance: newLedgerBalance.toFixed(2),
            userId: userId,  // ✅ Use the actual user ID
            createdBy: userId,  // ✅ Use the actual user ID
            channelId: businessUnit,
            eventId,
            depositorName: depositorName || customerName || null,
          },
          transaction,
        }
      );
      console.log(`✅ History record ${historyId} inserted`);

      // ================================================================
      // UPDATE ACCOUNT SUMMARY
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
        if (isWithdrawal) {
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
              clearedBalance: newClearedBalance.toFixed(2),
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
        await sequelize.query(
          `INSERT INTO deposit_account_summary (
            ACCT_ID, ACCT_NO, LEDGER_BAL, CLEARED_BAL, DR_TURNOVER, CR_TURNOVER,
            DR_COUNT, CR_COUNT, LAST_ACTIVITY_DT, LAST_DEPOSIT_DT, LAST_DEPOSIT_AMT,
            LAST_WITHDRAWL_DT, LAST_WITHDRAWL_AMT, REC_ST, VERSION_NO, ROW_TS,
            USER_ID, CREATE_DT, CREATED_BY, SYS_CREATE_TS, created_at, updated_at
          ) VALUES (
            :accountId, :accountNumber, :ledgerBalance, :clearedBalance,
            :drTurnover, :crTurnover, :drCount, :crCount, NOW(),
            ${isDeposit ? 'NOW()' : 'NULL'}, ${isDeposit ? ':amount' : '0'},
            ${isWithdrawal ? 'NOW()' : 'NULL'}, ${isWithdrawal ? ':amount' : '0'},
            'A', 1, NOW(), :userId, NOW(), :createdBy, NOW(), NOW(), NOW()
          )`,
          {
            replacements: {
              accountId: account.id,
              accountNumber,
              ledgerBalance: newLedgerBalance.toFixed(2),
              clearedBalance: newClearedBalance.toFixed(2),
              drTurnover: drTurnover.toFixed(2),
              crTurnover: crTurnover.toFixed(2),
              drCount,
              crCount,
              amount: amount.toFixed(2),
              userId: userId,  // ✅ Use the actual user ID
              createdBy: userId,  // ✅ Use the actual user ID
            },
            transaction,
          }
        );
        console.log(`✅ New deposit account summary created`);
      }

      // ================================================================
      // UPDATE CUSTOMER ACCOUNTS
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
            clearedBalance: newClearedBalance.toFixed(2),
            accountId: account.id,
          },
          transaction,
        }
      );

      // ================================================================
      // ✅ DETERMINE FINAL TRANSACTION STATUS
      // ================================================================
      const finalRequiresApproval = requiresApproval;
      const txnStatus = finalRequiresApproval ? 'PENDING_APPROVAL' : 'COMPLETED';
      
      console.log(`📊 Transaction Status: ${txnStatus}`);
      console.log(`📊 Requires Approval: ${finalRequiresApproval}`);
      console.log(`📊 Authorized Roles: ${authorizedRoles.join(', ') || 'None'}`);

      // ================================================================
      // ✅ INSERT INTO deposit_transactions WITH CORRECT created_by
      // ================================================================
      await sequelize.query(
        `
        INSERT INTO deposit_transactions 
          (customer_id, account_number, transaction_type, amount, currency, status,
           aml_risk_level, aml_risk_score, aml_indicators,
           created_by, transaction_date, branch_id, approved_by, approved_at,
           transaction_ref_no, description, requires_approval, approved_by_role, approval_status)
        VALUES
          (:customerId, :accountNumber, :transactionType, :amount, :currency, :status,
           :amlRiskLevel, :amlRiskScore, :amlIndicators,
           :createdBy, :transactionDate, :branchId, NULL,
           :approvedAt,
           :referenceNo, :description, :requiresApproval, :approvedByRole, :approvalStatus)
        `,
        {
          replacements: {
            customerId: account.customer_id || 0,
            accountNumber,
            transactionType: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
            amount: amount.toFixed(2),
            currency,
            status: txnStatus,
            amlRiskLevel: finalAmlCheck.riskLevel,
            amlRiskScore: finalAmlCheck.riskScore,
            amlIndicators: JSON.stringify([]),
            createdBy: userId,  // ✅ FIX: Use actual user ID instead of 'system'
            transactionDate,
            branchId,
            referenceNo,
            description,
            requiresApproval: finalRequiresApproval,
            approvedAt: finalRequiresApproval ? null : new Date(),
            approvedByRole: finalRequiresApproval ? authorizedRoles.join(',') : 'AUTO',
            approvalStatus: finalRequiresApproval ? 'PENDING' : 'APPROVED'
          },
          transaction,
        }
      );
      console.log(`✅ Transaction record inserted with status: ${txnStatus} and created_by: ${userId}`);

      // ================================================================
      // ✅ IF REQUIRES APPROVAL - RETURN PENDING STATUS
      // ================================================================
      if (finalRequiresApproval) {
        await transaction.commit();
        console.log(`⏳ Transaction ${referenceNo} is pending approval`);
        
        return res.status(202).json({
          success: true,
          message: `Transaction requires approval. Pending approval from: ${authorizedRoles.join(', ')}`,
          reference_no: referenceNo,
          requires_approval: true,
          authorized_roles: authorizedRoles,
          approval_status: 'PENDING',
          amount: amount,
          account_number: accountNumber,
          transaction_type: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
          policy_checked: policyFound,
          aml_risk_level: finalAmlCheck.riskLevel,
          created_by: userId  // ✅ Include the creator in response
        });
      }

      // ================================================================
      // ✅ TRANSACTION IS AUTO-APPROVED - CONTINUE
      // ================================================================

      // ================================================================
      // SMS NOTIFICATION (conditional on sms_alert)
      // ================================================================
      if (allowSms && customerPhoneNumber && customerPhoneNumber.trim()) {
        try {
          const externalSmsId = `SMS_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
          const formattedBalance = new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
          }).format(newLedgerBalance);
          const transactionIndicator = isDeposit ? 'C' : 'D';

          let messageContent = '';
          if (isDeposit) {
            messageContent = `${customerName || 'Dear customer'}, ${formattedAmount} has been credited to your account ${accountNumber} on ${new Date(
              transactionDate
            ).toLocaleDateString()}. New balance: ${formattedBalance}. Ref: ${referenceNo.slice(
              -8
            )}. Thank you for banking with us.`;
          } else {
            messageContent = `${customerName || 'Dear customer'}, ${formattedAmount} has been debited from your account ${accountNumber} on ${new Date(
              transactionDate
            ).toLocaleDateString()}. New balance: ${formattedBalance}. Ref: ${referenceNo.slice(
              -8
            )}. Thank you for banking with us.`;
          }

          await SMS.create(
            {
              EXTERNAL_SMS_ID: externalSmsId,
              RECIPIENT_PHONE_NUMBER: customerPhoneNumber,
              REC_ST: 'A',
              USER_ID: userId,  // ✅ Use actual user ID
              MESSAGE_CONTENT: messageContent,
              CREATE_DT: new Date(),
              CREATED_BY: userId,  // ✅ Use actual user ID
              ACCT_BALANCE: newLedgerBalance,
              TXN_AMT: amount,
              ACCT_NO: accountNumber,
              DR_CR_IND: transactionIndicator,
              TXN_DATE: transactionDate,
              DISP_AVAIL_BAL: newLedgerBalance,
              DEPOSITOR_PAYEE_NM: depositorName || customerName || 'System',
            },
            { transaction }
          );
          console.log(`✅ SMS record created for ${isDeposit ? 'DEPOSIT' : 'WITHDRAWAL'} to ${customerPhoneNumber}`);

          setImmediate(async () => {
            try {
              const smsResult = await smsService.sendSMS(customerPhoneNumber, messageContent);
              if (smsResult.success) {
                console.log(`✅ SMS sent successfully to ${customerPhoneNumber}`);
              } else {
                console.error(`❌ Failed to send SMS to ${customerPhoneNumber}:`, smsResult.error);
              }
            } catch (smsSendError) {
              console.error('❌ SMS sending error:', smsSendError.message);
            }
          });
        } catch (smsError) {
          console.error('❌ Failed to create SMS record:', smsError.message);
        }
      } else if (!allowSms) {
        console.log(`📵 SMS alerts disabled for account ${accountNumber}, skipping notification`);
      } else {
        console.warn(`⚠️ No phone number found for account ${accountNumber}, skipping SMS notification`);
      }

      // ================================================================
      // GL UPDATE
      // ================================================================
      try {
        const [cashGl] = await sequelize.query(
          `SELECT id, gl_acct_no FROM gl_accounts WHERE account_type = 'ASSET' AND rec_st = 'Active' LIMIT 1`,
          { type: QueryTypes.SELECT, transaction }
        );
        const [liabGl] = await sequelize.query(
          `SELECT id, gl_acct_no FROM gl_accounts WHERE account_type = 'LIABILITY' AND rec_st = 'Active' LIMIT 1`,
          { type: QueryTypes.SELECT, transaction }
        );

        if (cashGl && liabGl) {
          await sequelize.query(
            `UPDATE gl_accounts SET ledger_balance = ledger_balance + :amount WHERE id = :id`,
            { replacements: { amount, id: cashGl.id }, transaction }
          );
          await sequelize.query(
            `UPDATE gl_accounts SET ledger_balance = ledger_balance + :amount WHERE id = :id`,
            { replacements: { amount, id: liabGl.id }, transaction }
          );

          const generateTransactionId = () => {
            const base = Date.now().toString();
            const random = Math.floor(1000 + Math.random() * 9000);
            return parseInt(base + random);
          };
          const transactionIdNumeric = generateTransactionId();

          await sequelize.query(
            `INSERT INTO gl_account_transactions 
              (JOURNAL_ID, TRANSACTION_ID, DR_ACCT_NO, CR_ACCT_NO, AMOUNT, NARRATION, 
               CREATED_BY, TRANSACTION_TYPE, CURRENCY_CODE, STATUS, TransactionId)
             VALUES 
              (:journalId, :txnId, :drAcct, :crAcct, :amount, :narration, 
               :createdBy, 'DEPOSIT', :currency, 'POSTED', :transactionIdNumeric)`,
            {
              replacements: {
                journalId,
                txnId: `GL-${referenceNo}`,
                drAcct: cashGl.gl_acct_no,
                crAcct: liabGl.gl_acct_no,
                amount: amount.toFixed(2),
                narration: `Deposit of ${formattedAmount} to account ${accountNumber}`,
                createdBy: userId,  // ✅ Use actual user ID
                currency,
                transactionIdNumeric
              },
              transaction,
            }
          );
          console.log('✅ GL entries created');
        } else {
          console.warn('⚠️ GL accounts not found');
        }
      } catch (glErr) {
        console.error('❌ GL update failed:', glErr.message);
      }

      // ================================================================
      // AUDIT TRAIL
      // ================================================================
      try {
        await sequelize.query(
          `INSERT INTO audit_trail 
           (event_id, user_id, event_type, action, old_value, new_value, ip_address, 
            timestamp, entity_type, entity_id, status, account_no, description, created_at, updated_at)
           VALUES (:eventId, :userId, 'TRANSACTION_POST', 'Post Transaction', :oldValue, :newValue, 
            :ipAddress, NOW(), 'Transaction', :transactionId, 'SUCCESS', :accountNo, :description, NOW(), NOW())`,
          {
            replacements: {
              eventId: Math.floor(Date.now() / 1000),
              userId: userId,  // ✅ Use actual user ID
              oldValue: JSON.stringify({ previous_balance: currentLedgerBalance }),
              newValue: JSON.stringify({ referenceNo, amount, newBalance: newLedgerBalance }),
              ipAddress: req.ip || 'unknown',
              transactionId: referenceNo,
              accountNo: accountNumber,
              description,
            },
            transaction,
          }
        );
      } catch (e) {
        console.warn('Audit error:', e);
      }

      await transaction.commit();
      console.log(`✅ Transaction ${referenceNo} completed successfully by ${userId}`);

      // ================================================================
      // ✅ BUILD RESPONSE
      // ================================================================
      const responseData = {
        success: true,
        message: isDeposit ? 'Deposit successful' : 'Withdrawal successful',
        reference_no: referenceNo,
        new_balance: newLedgerBalance,
        transaction_date: new Date(),
        depositor_name: depositorName,
        aml_risk: finalAmlCheck.riskLevel,
        requires_approval: false,
        approval_status: 'APPROVED',
        policy_checked: policyFound,
        created_by: userId  // ✅ Include the creator in response
      };

      if (drawerUpdated) {
        responseData.drawer = {
          drawerId: drawerId,
          drawerNo: drawerNo,
          previousBalance: drawerBalanceBefore,
          newBalance: drawerBalanceAfter,
          netChange: isDeposit ? amount : -amount,
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

  /**
   * Get account balance
   */
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
  
  /**
   * Get transactions by account
   */
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
  
  /**
   * Get customer accounts
   */
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
  
  /**
   * Get transaction history with filters
   */
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
  
  /**
   * Get transactions by customer ID
   */
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
  
  /**
   * Get transactions by customer name
   */
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
  
  /**
   * Export all transactions
   */
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
  
  /**
   * Export transactions by customer
   */
  async exportTransactionsByCustomer(req, res) {
    try {
      const { customerId } = req.params;
      const { format = 'json' } = req.query;
      
      const transactions = await sequelize.query(
        `SELECT dt.* FROM deposit_transactions dt
         JOIN customer_accounts ca ON dt.account_number = ca.account_number
         WHERE ca.customer_id = :customerId
         ORDER BY dt.transaction_date DESC`,
        {
          replacements: { customerId },
          type: QueryTypes.SELECT
        }
      );
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=customer_transactions.csv');
        
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
      console.error('Error exporting customer transactions:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to export transactions',
        error: error.message
      });
    }
  }
  
  /**
   * Export transactions by customer name
   */
  async exportTransactionsByCustomerName(req, res) {
    try {
      const { customerName } = req.params;
      const { format = 'json' } = req.query;
      
      const transactions = await sequelize.query(
        `SELECT dt.* FROM deposit_transactions dt
         JOIN customer_accounts ca ON dt.account_number = ca.account_number
         JOIN customers c ON ca.customer_id = c.id
         WHERE c.FIRST_NAME LIKE :name OR c.LAST_NAME LIKE :name OR c.CUST_NM LIKE :name
         ORDER BY dt.transaction_date DESC`,
        {
          replacements: { name: `%${customerName}%` },
          type: QueryTypes.SELECT
        }
      );
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=transactions_by_name.csv');
        
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
      console.error('Error exporting transactions by customer name:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to export transactions',
        error: error.message
      });
    }
  }
  
  /**
   * Export batch transactions for multiple accounts
   */
  async exportBatchTransactions(req, res) {
    try {
      const { accountNumbers, startDate, endDate, format = 'json' } = req.body;
      
      if (!accountNumbers || !Array.isArray(accountNumbers) || accountNumbers.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Account numbers are required',
          code: 'MISSING_ACCOUNT_NUMBERS'
        });
      }
      
      let whereClause = 'account_number IN (:accountNumbers)';
      const replacements = { accountNumbers };
      
      if (startDate) {
        whereClause += ' AND transaction_date >= :startDate';
        replacements.startDate = startDate;
      }
      
      if (endDate) {
        whereClause += ' AND transaction_date <= :endDate';
        replacements.endDate = endDate;
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
        res.setHeader('Content-Disposition', 'attachment; filename=batch_transactions.csv');
        
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
      console.error('Error exporting batch transactions:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to export batch transactions',
        error: error.message
      });
    }
  }
  
  /**
   * Debug accounts - view account structure
   */
  async debugAccounts(req, res) {
    try {
      const customerAccounts = await sequelize.query(
        `SELECT id, account_number, account_name, ledger_balance, available_balance, 
                cleared_balance, customer_id, status, created_at
         FROM customer_accounts 
         LIMIT 10`,
        {
          type: QueryTypes.SELECT
        }
      );
      
      const accounts = await sequelize.query(
        `SELECT id, account_number, acct_nm, ledger_balance, available_balance, 
                cleared_balance, customer_id, branch, REC_ST, created_at
         FROM accounts 
         LIMIT 10`,
        {
          type: QueryTypes.SELECT
        }
      );
      
      return res.status(200).json({
        success: true,
        data: {
          customer_accounts: customerAccounts,
          accounts: accounts,
          total_customer_accounts: customerAccounts.length,
          total_accounts: accounts.length
        }
      });
      
    } catch (error) {
      console.error('Error debugging accounts:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to debug accounts',
        error: error.message
      });
    }
  }


/**
 * Get daily transactions for a specific teller user
 * GET /api/transactions/teller/daily/:userId
 */
async getTellerDailyTransactions(req, res) {
  try {
    const { userId } = req.params;
    const { date, startDate, endDate } = req.query;
    
    // Determine the user ID
    const tellerUserId = userId || req.query.userId;
    
    if (!tellerUserId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required. Provide as :userId in path or ?userId= in query.'
      });
    }

    // Determine date range
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

    // ✅ FIRST: Check if there are ANY transactions in deposit_transactions
    const totalCount = await sequelize.query(
      `SELECT COUNT(*) as count FROM deposit_transactions`,
      { type: QueryTypes.SELECT }
    );
    console.log(`📊 Total transactions in deposit_transactions: ${totalCount[0]?.count || 0}`);

    // ✅ SECOND: Get transactions by created_by
    const depositTransactions = await sequelize.query(
      `
      SELECT 
        id,
        customer_id,
        account_number,
        transaction_type,
        amount,
        currency,
        status,
        aml_risk_level,
        created_by,
        transaction_date,
        created_at,
        branch_id,
        approved_by,
        approved_at,
        transaction_ref_no,
        description,
        requires_approval,
        approved_by_role,
        approval_status
      FROM deposit_transactions
      WHERE created_by = :userId
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

    // ✅ THIRD: If no transactions found, try using LIKE for created_by
    let allTransactions = depositTransactions;
    
    if (depositTransactions.length === 0) {
      console.log(`🔄 No exact matches, trying LIKE search...`);
      
      const likeTransactions = await sequelize.query(
        `
        SELECT 
          id,
          customer_id,
          account_number,
          transaction_type,
          amount,
          currency,
          status,
          aml_risk_level,
          created_by,
          transaction_date,
          created_at,
          branch_id,
          approved_by,
          approved_at,
          transaction_ref_no,
          description,
          requires_approval,
          approved_by_role,
          approval_status
        FROM deposit_transactions
        WHERE created_by LIKE :userIdPattern
          AND transaction_date BETWEEN :startDate AND :endDate
        ORDER BY transaction_date DESC, created_at DESC
        `,
        {
          replacements: {
            userIdPattern: `%${tellerUserId}%`,
            startDate: startDateTime,
            endDate: endDateTime
          },
          type: QueryTypes.SELECT
        }
      );
      
      console.log(`🔍 Found ${likeTransactions.length} transactions with LIKE search`);
      allTransactions = likeTransactions;
    }

    // ✅ FOURTH: Also check deposit_account_history (fallback)
    let historyTransactions = [];
    try {
      historyTransactions = await sequelize.query(
        `
        SELECT 
          ACCT_HIST_ID as id,
          ACCT_NO as account_number,
          TRAN_DESC as description,
          TXN_AMT as amount,
          DR_CR_IND as transaction_type,
          TRAN_REF_TXT as reference_no,
          USER_ID as created_by,
          CREATE_DT as created_at,
          DEPOSITOR_PAYEE_NM as customer_name,
          'HISTORY' as source
        FROM deposit_account_history
        WHERE USER_ID = :userId
          AND CREATE_DT BETWEEN :startDate AND :endDate
        ORDER BY CREATE_DT DESC
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
      console.log(`✅ Found ${historyTransactions.length} history transactions`);
    } catch (historyError) {
      console.warn('⚠️ Could not fetch history transactions:', historyError.message);
    }

    // ✅ FIFTH: Get drawer transactions
    let drawerTransactions = [];
    try {
      drawerTransactions = await sequelize.query(
        `
        SELECT 
          id,
          drawer_id,
          drawer_no,
          transaction_type,
          amount,
          previous_balance,
          new_balance,
          transaction_ref_no,
          customer_account,
          description,
          user_id,
          created_at
        FROM drawer_transactions
        WHERE user_id = :userId
          AND created_at BETWEEN :startDate AND :endDate
        ORDER BY created_at DESC
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
      console.log(`✅ Found ${drawerTransactions.length} drawer transactions`);
    } catch (drawerError) {
      console.warn('⚠️ Could not fetch drawer transactions:', drawerError.message);
    }

    // ✅ SIXTH: If still no transactions, check all transactions to debug
    if (allTransactions.length === 0 && historyTransactions.length === 0) {
      console.log(`🔍 No transactions found. Checking all recent transactions...`);
      
      const allRecent = await sequelize.query(
        `
        SELECT 
          id,
          customer_id,
          account_number,
          transaction_type,
          amount,
          status,
          created_by,
          transaction_date,
          created_at,
          transaction_ref_no
        FROM deposit_transactions
        WHERE transaction_date BETWEEN :startDate AND :endDate
        ORDER BY transaction_date DESC
        LIMIT 20
        `,
        {
          replacements: {
            startDate: startDateTime,
            endDate: endDateTime
          },
          type: QueryTypes.SELECT
        }
      );
      
      console.log(`📋 All transactions in date range:`, allRecent);
      
      // Get all unique created_by values
      const allUsers = await sequelize.query(
        `
        SELECT DISTINCT created_by, COUNT(*) as count
        FROM deposit_transactions
        WHERE transaction_date BETWEEN :startDate AND :endDate
        GROUP BY created_by
        `,
        {
          replacements: {
            startDate: startDateTime,
            endDate: endDateTime
          },
          type: QueryTypes.SELECT
        }
      );
      
      console.log(`📋 Users with transactions:`, allUsers);
    }

    // ================================================================
    // CALCULATE SUMMARY
    // ================================================================
    const summary = {
      totalTransactions: allTransactions.length + drawerTransactions.length,
      totalDepositAmount: 0,
      totalWithdrawalAmount: 0,
      totalAmount: 0,
      approvedTransactions: 0,
      pendingTransactions: 0,
      rejectedTransactions: 0,
      depositCount: 0,
      withdrawalCount: 0
    };

    allTransactions.forEach(tx => {
      const amount = parseFloat(tx.amount || 0);
      const isDeposit = tx.transaction_type === 'DEPOSIT' || tx.transaction_type === 'CR' || tx.transaction_type === 'C';
      
      if (isDeposit) {
        summary.depositCount++;
        summary.totalDepositAmount += amount;
      } else {
        summary.withdrawalCount++;
        summary.totalWithdrawalAmount += amount;
      }
      
      summary.totalAmount += amount;
      
      const status = tx.status || tx.approval_status || '';
      if (status === 'COMPLETED' || status === 'APPROVED') {
        summary.approvedTransactions++;
      } else if (status === 'PENDING_APPROVAL' || status === 'PENDING') {
        summary.pendingTransactions++;
      } else if (status === 'REJECTED' || status === 'FAILED') {
        summary.rejectedTransactions++;
      }
    });

    drawerTransactions.forEach(tx => {
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

    // ================================================================
    // GET USER INFO
    // ================================================================
    let userInfo = null;
    try {
      const [user] = await sequelize.query(
        `
        SELECT 
          username as user_name,
          full_name,
          email,
          role_id,
          business_unit
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
      console.log('✅ User info retrieved:', userInfo);
    } catch (userError) {
      console.warn('⚠️ Could not fetch user info:', userError.message);
    }

    // ================================================================
    // GET DRAWER INFO
    // ================================================================
    let drawerInfo = [];
    try {
      drawerInfo = await sequelize.query(
        `
        SELECT 
          DRAWER_ID,
          DRAWER_NO,
          DRAWER_NM,
          WF_STATUS as status,
          CURRENT_BALANCE as balance
        FROM drawers
        WHERE USER_ID = :userId OR DRAWER_NO = :userId
        LIMIT 1
        `,
        {
          replacements: { userId: tellerUserId },
          type: QueryTypes.SELECT
        }
      );
      console.log('✅ Drawer info retrieved:', drawerInfo);
    } catch (drawerInfoError) {
      console.warn('⚠️ Could not fetch drawer info:', drawerInfoError.message);
    }

    // ================================================================
    // FORMAT RESPONSE
    // ================================================================
    const formattedTransactions = allTransactions.map(tx => ({
      id: tx.id,
      reference_no: tx.transaction_ref_no || `TXN-${tx.id}`,
      account_number: tx.account_number,
      transaction_type: tx.transaction_type,
      amount: parseFloat(tx.amount || 0),
      currency: tx.currency || 'NGN',
      status: tx.status || tx.approval_status || 'UNKNOWN',
      description: tx.description || '',
      transaction_date: tx.transaction_date || tx.created_at,
      created_by: tx.created_by,
      approved_by: tx.approved_by,
      approved_at: tx.approved_at,
      requires_approval: !!tx.requires_approval,
      approval_status: tx.approval_status || tx.status || 'UNKNOWN',
      aml_risk_level: tx.aml_risk_level || 'LOW'
    }));

    // ================================================================
    // RETURN RESPONSE
    // ================================================================
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
        drawer: drawerInfo.length > 0 ? {
          drawerId: drawerInfo[0].DRAWER_ID,
          drawerNo: drawerInfo[0].DRAWER_NO,
          drawerName: drawerInfo[0].DRAWER_NM || `Drawer ${drawerInfo[0].DRAWER_NO}`,
          status: drawerInfo[0].status,
          balance: parseFloat(drawerInfo[0].balance || 0)
        } : null,
        dateRange: {
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          date: startDateTime.toISOString().split('T')[0]
        },
        summary: {
          totalTransactions: summary.totalTransactions,
          totalDepositAmount: summary.totalDepositAmount,
          totalWithdrawalAmount: summary.totalWithdrawalAmount,
          totalAmount: summary.totalAmount,
          depositCount: summary.depositCount,
          withdrawalCount: summary.withdrawalCount,
          approvedTransactions: summary.approvedTransactions,
          pendingTransactions: summary.pendingTransactions,
          rejectedTransactions: summary.rejectedTransactions
        },
        transactions: {
          deposits: formattedTransactions,
          drawer_transactions: drawerTransactions.map(tx => ({
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
          })),
          history: historyTransactions.map(h => ({
            id: h.id,
            account_number: h.account_number,
            description: h.description,
            amount: parseFloat(h.amount || 0),
            transaction_type: h.transaction_type === 'C' ? 'DEPOSIT' : 'WITHDRAWAL',
            reference_no: h.reference_no,
            created_by: h.created_by,
            created_at: h.created_at,
            customer_name: h.customer_name
          }))
        },
        debug: {
          total_in_database: totalCount[0]?.count || 0,
          query_date_range: {
            start: startDateTime.toISOString(),
            end: endDateTime.toISOString()
          },
          user_id_searched: tellerUserId
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

  /**
   * Get teller transaction summary (for dashboard)
   * GET /api/transactions/teller/summary?userId=PCO02
   */
  async getTellerTransactionSummary(req, res) {
    try {
      const { userId } = req.query;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      // Get today's date
      const today = new Date();
      const startDate = new Date(today);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);

      // Get today's transactions
      const [transactions] = await sequelize.query(
        `
        SELECT 
          COUNT(*) as total_count,
          SUM(CASE WHEN transaction_type IN ('DEPOSIT', 'CR') THEN amount ELSE 0 END) as total_deposits,
          SUM(CASE WHEN transaction_type IN ('WITHDRAWAL', 'DR') THEN amount ELSE 0 END) as total_withdrawals,
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

      // Get drawer transactions
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

      // Get drawer balance
      const [drawer] = await sequelize.query(
        `
        SELECT 
          DRAWER_ID,
          DRAWER_NO,
          CURRENT_BALANCE as balance,
          WF_STATUS as status
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
};
// Export singleton instance with all methods
const transactionController = new TransactionController();
export default transactionController;