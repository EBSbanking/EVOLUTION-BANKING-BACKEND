// Services/postTransaction.js – FINAL CLEAN VERSION (with Sequelize SMS model)
import sequelize from '../../config/db.js';
import { QueryTypes } from 'sequelize';
import smsService from '../utils/smsService.js';
import moment from 'moment';
import PremblyAMLService from '../services/PremblyAMLService.js';
import SMS from '../models/SMS.js';   // ✅ Added import for SMS model
import GLAccountTransaction from '../models/GLAccountTransaction.js';

class TransactionController {
async postTransaction(req, res) {
  const transaction = await sequelize.transaction();

  try {
    // ==================== AUTO-CREATE DEPOSIT_TRANSACTIONS TABLE ====================
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
        description TEXT
      )
      `,
      { transaction }
    );

    if (req.decrypted) console.log('🔓 Request decrypted');

    const transactionData = req.body;
    console.log('📝 Processing transaction:', {
      ACCT_NO: transactionData.ACCT_NO,
      AMOUNT: transactionData.AMOUNT,
      TRANSACTION_TYPE: transactionData.TRANSACTION_TYPE,
      DESCRIPTION: transactionData.DESCRIPTION,
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
    const createdBy = transactionData.CREATED_BY || transactionData.created_by || transactionData.USER_ID || 'system';
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

    // Pre‑format amount for messages and GL narration
    const formattedAmount = new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount);

    // ========== Find account in customer_accounts ==========
    let account = null;
    let accountSummary = null;
    let customerPhoneNumber = null,
      customerName = null;
    let customerFirstName = null,
      customerLastName = null,
      customerMiddleName = null,
      customerGender = null;

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
      console.log(`✅ Account found in customer_accounts: ${account.account_number}`);

      // Get account summary from deposit_account_summary
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
      // Fallback to accounts table
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

    // Generate 18‑digit numeric reference number
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

    // ==================== AML CHECK ====================
    const AMOUNT_THRESHOLDS = {
      LOW_RISK_MAX: 500000,
      MEDIUM_RISK_MAX: 2000000,
      HIGH_RISK_MIN: 5000000,
      CRITICAL_RISK_MIN: 10000000,
    };
    let amountRiskLevel = 'LOW',
      amountRiskScore = 10,
      amountRequiresApproval = false;
    let amountRequiresSuspiciousReport = false,
      shouldBlock = false;
    if (amount >= AMOUNT_THRESHOLDS.CRITICAL_RISK_MIN) {
      amountRiskLevel = 'CRITICAL';
      amountRiskScore = 95;
      amountRequiresApproval = true;
      amountRequiresSuspiciousReport = true;
      shouldBlock = true;
    } else if (amount >= AMOUNT_THRESHOLDS.HIGH_RISK_MIN) {
      amountRiskLevel = 'HIGH';
      amountRiskScore = 75;
      amountRequiresApproval = true;
      amountRequiresSuspiciousReport = true;
    } else if (amount > AMOUNT_THRESHOLDS.MEDIUM_RISK_MAX) {
      amountRiskLevel = 'MEDIUM';
      amountRiskScore = 50;
      amountRequiresApproval = true;
    } else if (amount > AMOUNT_THRESHOLDS.LOW_RISK_MAX) {
      amountRiskLevel = 'LOW_MEDIUM';
      amountRiskScore = 30;
    }
    if (shouldBlock) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Transaction blocked – critical amount',
        code: 'AML_BLOCK',
      });
    }

    const finalAmlCheck = {
      riskLevel: amountRiskLevel,
      riskScore: amountRiskScore,
      requiresApproval: amountRequiresApproval,
      requiresSuspiciousReport: amountRequiresSuspiciousReport,
    };

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

    // ==================== INSERT INTO deposit_account_history ====================
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
          userId: createdBy,
          createdBy,
          channelId: businessUnit,
          eventId,
          depositorName: depositorName || customerName || null,
        },
        transaction,
      }
    );
    console.log(`✅ History record ${historyId} inserted`);

   // ==================== UPDATE deposit_account_summary ====================
if (accountSummary && accountSummary.ACCT_ID) {
  // Build SET assignments as an array to avoid comma issues
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
  // INSERT for new summary (already correct)
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
        userId: createdBy,
        createdBy,
      },
      transaction,
    }
  );
  console.log(`✅ New deposit account summary created`);
}
    // Update customer_accounts balance
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

    // Insert into deposit_transactions
    const txnStatus = finalAmlCheck.requiresApproval ? 'PENDING' : 'COMPLETED';
    await sequelize.query(
      `
      INSERT INTO deposit_transactions 
        (customer_id, account_number, transaction_type, amount, currency, status,
         aml_risk_level, aml_risk_score, aml_indicators,
         created_by, transaction_date, branch_id, approved_by, approved_at,
         transaction_ref_no, description)
      VALUES
        (:customerId, :accountNumber, :transactionType, :amount, :currency, :status,
         :amlRiskLevel, :amlRiskScore, :amlIndicators,
         :createdBy, :transactionDate, :branchId, :createdBy,
         IF(:requiresApproval, NULL, NOW()),
         :referenceNo, :description)
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
          createdBy,
          transactionDate,
          branchId,
          referenceNo,
          description,
          requiresApproval: finalAmlCheck.requiresApproval || false,
        },
        transaction,
      }
    );

    if (finalAmlCheck.requiresApproval) {
      await transaction.commit();
      return res.status(202).json({
        success: true,
        message: 'Transaction pending approval',
        reference_no: referenceNo,
      });
    }

    // ==================== SMS NOTIFICATION ====================
    if (customerPhoneNumber && customerPhoneNumber.trim()) {
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
            USER_ID: createdBy,
            MESSAGE_CONTENT: messageContent,
            CREATE_DT: new Date(),
            CREATED_BY: createdBy,
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
    } else if (finalAmlCheck.requiresApproval) {
      console.log(`📋 Transaction ${referenceNo} pending approval - SMS not sent`);
    } else {
      console.warn(`⚠️ No phone number found for account ${accountNumber}, skipping SMS notification`);
    }

   // ==================== GL UPDATE ====================
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
    // Update GL balances
    await sequelize.query(
      `UPDATE gl_accounts SET ledger_balance = ledger_balance + :amount WHERE id = :id`,
      { replacements: { amount, id: cashGl.id }, transaction }
    );
    await sequelize.query(
      `UPDATE gl_accounts SET ledger_balance = ledger_balance + :amount WHERE id = :id`,
      { replacements: { amount, id: liabGl.id }, transaction }
    );

    // ✅ Generate TransactionId manually (same logic as model's generateTransactionId)
    const generateTransactionId = () => {
      const base = Date.now().toString();
      const random = Math.floor(1000 + Math.random() * 9000);
      return parseInt(base + random);
    };
    const transactionIdNumeric = generateTransactionId();

    // Insert GL transaction with explicit TransactionId
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
          createdBy,
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
  // Don't rollback the deposit
}
    // ==================== AUDIT TRAIL ====================
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
            userId: createdBy,
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
    console.log(`✅ Transaction ${referenceNo} completed`);

    return res.status(200).json({
      success: true,
      message: isDeposit ? 'Deposit successful' : 'Withdrawal successful',
      reference_no: referenceNo,
      new_balance: newLedgerBalance,
      transaction_date: new Date(),
      depositor_name: depositorName,
      aml_risk: finalAmlCheck.riskLevel,
    });
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
}

// Export singleton instance with all methods
const transactionController = new TransactionController();
export default transactionController;