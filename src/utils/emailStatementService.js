// utils/emailStatementService.js - COMPLETE FIXED VERSION
// ✅ Uses the same email pattern as welcome email (which works)
import nodemailer from 'nodemailer';
import moment from 'moment';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import smsService from './smsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ============================================
// EMAIL CONFIGURATION (Same as TwoFactorService)
// ============================================
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'warelogtech@gmail.com',
    pass: process.env.SMTP_PASS,
  },
  from: process.env.SMTP_FROM || 'warelogtech@gmail.com',
  name: process.env.SMTP_NAME || 'Evolution Banking',
};

// ============================================
// 📧 SEND STATEMENT EMAIL - Using the same pattern as welcome email
// ============================================
async function sendStatementEmailInternal(statementData, options = {}) {
  try {
    const { dryRun = false, testMode = false } = options;
    
    console.log('📧 Preparing to send statement email...');
    
    const { customer, period } = statementData;
    
    if (!customer.email) {
      console.error('❌ No email address for customer');
      return { success: false, error: 'No email address' };
    }

    if (dryRun) {
      console.log(`🔍 DRY RUN: Would send email to ${customer.email}`);
      return { 
        success: true, 
        messageId: 'DRY_RUN',
        customerId: customer.id,
        dryRun: true
      };
    }

    let toEmail = customer.email;
    if (testMode) {
      toEmail = process.env.TEST_EMAIL || 'test@example.com';
      console.log(`🧪 TEST MODE: Using ${toEmail} instead of ${customer.email}`);
    }

    console.log(`📧 Creating transporter with config:`, {
      host: emailConfig.host,
      port: emailConfig.port,
      user: emailConfig.auth.user,
      from: emailConfig.from
    });

    // ✅ Create a NEW transporter each time (same as welcome email)
    const transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: {
        user: emailConfig.auth.user,
        pass: emailConfig.auth.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // ✅ Verify transporter (same as welcome email)
    await transporter.verify();
    console.log('✅ SMTP Transporter verified');

    // ✅ ALL values from .env
    const fromEmail = emailConfig.from || emailConfig.auth.user;
    const appName = process.env.APP_NAME || emailConfig.name || 'Evolution Banking';
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@evolutionbanking.com';

    // Generate HTML email
    const htmlContent = generateStatementEmailHTML(statementData);
    const textContent = generateStatementEmailText(statementData);

    const mailOptions = {
      from: `"${appName} Statements" <${fromEmail}>`,
      to: toEmail,
      cc: testMode ? process.env.TEST_CC || undefined : undefined,
      subject: `📊 Account Statement - ${customer.name} - ${period.startDate} to ${period.endDate}`,
      html: htmlContent,
      text: textContent,
      replyTo: supportEmail,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'High'
      }
    };

    console.log(`📧 Sending email to: ${toEmail}`);
    console.log(`📧 Subject: ${mailOptions.subject}`);

    const info = await transporter.sendMail(mailOptions);
    
    console.log(`✅ Statement email sent successfully to ${customer.email}`, {
      messageId: info.messageId,
      customerId: customer.id
    });
    logger.info(`✅ Statement email sent to ${customer.email}`, {
      messageId: info.messageId,
      customerId: customer.id
    });

    // Record the statement sent
    try {
      await recordStatementSent(customer, period, info.messageId, 'EMAIL');
    } catch (recordError) {
      console.warn('Could not record statement sent:', recordError.message);
    }

    return {
      success: true,
      messageId: info.messageId,
      customerId: customer.id,
      email: customer.email,
    };

  } catch (error) {
    console.error('❌ Failed to send statement email:', error.message);
    console.error('❌ Error details:', error.stack);
    logger.error('❌ Failed to send statement email:', error);
    return {
      success: false,
      error: error.message,
      customerId: statementData?.customer?.id,
      email: statementData?.customer?.email,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

// ============================================
// STATEMENT GENERATION SERVICE
// ============================================

/**
 * Get customers who are due for statement delivery based on their frequency
 */
export const getCustomersDueForStatement = async (asOfDate = new Date()) => {
  try {
    const today = moment(asOfDate).startOf('day');
    
    const [customers] = await sequelize.query(
      `SELECT 
        c.id,
        c.CUST_ID,
        c.CUST_NO,
        c.CUST_NM,
        c.FIRST_NAME,
        c.LAST_NAME,
        c.EMAIL_ADDRESS,
        c.PHONE_NO,
        c.STMNT_FREQ_CD,
        c.STMNT_FREQ_VALUE,
        c.ALERT_DELIVERY_METHOD,
        c.BU_ID,
        c.CREATED_BY,
        c.CREATE_DT,
        c.created_at,
        c.updated_at,
        ca.account_number,
        ca.account_name,
        ca.available_balance,
        ca.ledger_balance
      FROM customers c
      LEFT JOIN customer_accounts ca ON ca.CUST_ID = c.CUST_ID
      WHERE c.EMAIL_ADDRESS IS NOT NULL
        AND c.EMAIL_ADDRESS != ''
        AND c.EMAIL_ADDRESS LIKE '%@%'
        AND c.STMNT_FREQ_CD IS NOT NULL
        AND c.STMNT_FREQ_CD != ''
        AND c.STMNT_FREQ_CD != 'None'
        AND c.STMNT_FREQ_VALUE IS NOT NULL
        AND c.STMNT_FREQ_VALUE != ''
        AND c.status = 'Approved'
        AND c.REC_ST = 'ACTIVE'
      ORDER BY c.CUST_ID ASC`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );

    console.log(`🔍 Found ${customers?.length || 0} customers with email and frequency`);

    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      console.log('No customers found with email and frequency');
      return [];
    }

    const dueCustomers = [];

    for (const customer of customers) {
      const isDue = await isCustomerDueForStatement(customer, today);
      
      if (isDue) {
        const statementPeriod = getStatementPeriod(customer, today);
        
        const hasValidEmail = customer.EMAIL_ADDRESS && customer.EMAIL_ADDRESS.includes('@');
        const hasValidPhone = customer.PHONE_NO && customer.PHONE_NO && customer.PHONE_NO.length >= 10;
        
        // Check if customer can receive email statements
        const alertMethod = (customer.ALERT_DELIVERY_METHOD || '').toUpperCase();
        const canSendEmail = alertMethod === 'EMAIL' || alertMethod === 'BOTH';
        
        // For email statements, we need valid email and email delivery method
        if (!canSendEmail || !hasValidEmail) {
          console.log(`⏭️ Skipping customer ${customer.CUST_ID} - cannot send email (Method: ${alertMethod})`);
          continue;
        }
        
        console.log(`✅ Customer ${customer.CUST_ID} is DUE and can receive EMAIL`);
        
        dueCustomers.push({
          ...customer,
          statementPeriod,
          dueDate: today.toDate(),
          account_number: customer.account_number || null,
          account_name: customer.account_name || customer.CUST_NM,
          available_balance: customer.available_balance || 0,
          ledger_balance: customer.ledger_balance || 0,
          deliveryMethod: alertMethod || 'Email',
          canSendEmail: hasValidEmail,
          canSendSms: alertMethod === 'SMS' || alertMethod === 'BOTH'
        });
      }
    }

    console.log(`📧 ${dueCustomers.length} customers due for statement today`);
    return dueCustomers;

  } catch (error) {
    console.error('Error getting customers due for statement:', error);
    return [];
  }
};

/**
 * Check if a customer is due for statement based on their frequency
 */
export const isCustomerDueForStatement = async (customer, asOfDate = new Date()) => {
  try {
    const today = moment(asOfDate).startOf('day');
    const freqCode = customer.STMNT_FREQ_CD?.toUpperCase() || '';
    const freqValue = parseInt(customer.STMNT_FREQ_VALUE) || 1;

    if (!freqCode || freqCode === 'NONE') {
      return false;
    }

    const baselineDate = moment(customer.CREATE_DT || customer.created_at || asOfDate);

    if (baselineDate.isAfter(today)) {
      return false;
    }

    let nextDueDate = baselineDate.clone();
    
    switch (freqCode) {
      case 'DAILY':
        nextDueDate.add(freqValue, 'days');
        break;
      case 'WEEKLY':
        nextDueDate.add(freqValue * 7, 'days');
        break;
      case 'MONTHLY':
        nextDueDate.add(freqValue, 'months');
        break;
      case 'QUARTERLY':
        nextDueDate.add(freqValue * 3, 'months');
        break;
      case 'YEARLY':
        nextDueDate.add(freqValue, 'years');
        break;
      default:
        nextDueDate.add(1, 'months');
    }

    const isDue = today.isSameOrAfter(nextDueDate, 'day');

    if (isDue) {
      console.log(`✅ Customer ${customer.CUST_ID} (${customer.CUST_NM}) IS DUE`);
    }

    return isDue;

  } catch (error) {
    console.error(`Error checking if customer ${customer?.CUST_ID} is due:`, error);
    return false;
  }
};

/**
 * Get the statement period for a customer
 * ✅ FIXED: Correct period calculation based on frequency
 */
export const getStatementPeriod = (customer, asOfDate = new Date()) => {
  const today = moment(asOfDate);
  const freqCode = customer.STMNT_FREQ_CD?.toUpperCase() || 'MONTHLY';
  const freqValue = parseInt(customer.STMNT_FREQ_VALUE) || 1;

  let startDate = today.clone();
  let endDate = today.clone();

  // Calculate based on frequency
  switch (freqCode) {
    case 'DAILY':
      startDate.subtract(freqValue, 'days');
      break;
    case 'WEEKLY':
      startDate.subtract(freqValue * 7, 'days');
      break;
    case 'MONTHLY':
      startDate.subtract(freqValue, 'months');
      break;
    case 'QUARTERLY':
      startDate.subtract(freqValue * 3, 'months');
      break;
    case 'YEARLY':
      startDate.subtract(freqValue, 'years');
      break;
    default:
      startDate.subtract(1, 'months');
  }

  // Ensure start date is not before creation date
  const createDate = moment(customer.CREATE_DT || customer.created_at || asOfDate);
  if (startDate.isBefore(createDate)) {
    startDate = createDate.clone();
  }

  return {
    startDate: startDate.startOf('day').toDate(),
    endDate: endDate.endOf('day').toDate(),
    startDateFormatted: startDate.format('YYYY-MM-DD'),
    endDateFormatted: endDate.format('YYYY-MM-DD'),
    frequency: freqCode,
    frequencyValue: freqValue,
  };
};

// ============================================
// GET EMAIL STATEMENT STATUS
// ============================================

export const getEmailStatementStatus = async (asOfDate = new Date()) => {
  try {
    const today = moment(asOfDate).startOf('day');
    
    const [customers] = await sequelize.query(
      `SELECT 
        c.id,
        c.CUST_ID,
        c.CUST_NM,
        c.EMAIL_ADDRESS,
        c.STMNT_FREQ_CD,
        c.STMNT_FREQ_VALUE,
        c.CREATE_DT,
        c.created_at,
        c.ALERT_DELIVERY_METHOD,
        c.REC_ST,
        c.status
      FROM customers c
      WHERE c.EMAIL_ADDRESS IS NOT NULL
        AND c.EMAIL_ADDRESS != ''
        AND c.EMAIL_ADDRESS LIKE '%@%'
        AND c.status = 'Approved'
        AND c.REC_ST = 'ACTIVE'
        AND c.STMNT_FREQ_CD IS NOT NULL
        AND c.STMNT_FREQ_CD != ''
        AND c.STMNT_FREQ_CD != 'None'
      ORDER BY c.CUST_ID ASC`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      return {
        totalCustomers: 0,
        customersWithEmail: 0,
        customersDue: 0,
        nextDueDates: [],
        summary: {
          totalChecked: 0,
          duePercentage: 0,
          withEmailPercentage: 0
        }
      };
    }

    let customersWithEmail = 0;
    let customersDue = 0;
    let nextDueDates = [];

    for (const customer of customers) {
      if (customer.EMAIL_ADDRESS) {
        customersWithEmail++;
      }

      const isDue = await isCustomerDueForStatement(customer, today);
      
      if (isDue) {
        customersDue++;
        const period = getStatementPeriod(customer, today);
        nextDueDates.push({
          customerId: customer.CUST_ID,
          name: customer.CUST_NM,
          email: customer.EMAIL_ADDRESS,
          frequency: customer.STMNT_FREQ_CD || 'Monthly',
          frequencyValue: customer.STMNT_FREQ_VALUE || 1,
          alertMethod: customer.ALERT_DELIVERY_METHOD || 'SMS',
          nextDueDate: period.endDate,
          formattedNextDueDate: moment(period.endDate).format('YYYY-MM-DD'),
          createdDate: moment(customer.CREATE_DT || customer.created_at).format('YYYY-MM-DD')
        });
      }
    }

    nextDueDates.sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate));

    return {
      totalCustomers: customers.length,
      customersWithEmail,
      customersDue,
      nextDueDates: nextDueDates.slice(0, 10),
      summary: {
        totalChecked: customers.length,
        duePercentage: customers.length > 0 ? (customersDue / customers.length * 100).toFixed(1) : 0,
        withEmailPercentage: customers.length > 0 ? (customersWithEmail / customers.length * 100).toFixed(1) : 0
      },
      asOfDate: today.format('YYYY-MM-DD')
    };

  } catch (error) {
    console.error('Error getting email statement status:', error);
    return {
      error: error.message,
      totalCustomers: 0,
      customersWithEmail: 0,
      customersDue: 0,
      nextDueDates: [],
      summary: {
        totalChecked: 0,
        duePercentage: 0,
        withEmailPercentage: 0
      }
    };
  }
};

// ============================================
// GENERATE CUSTOMER STATEMENT
// ============================================

export const generateCustomerStatement = async (customer, period) => {
  try {
    const { startDate, endDate } = period;
    const accountNumber = customer.account_number;

    let acctNo = accountNumber;
    if (!acctNo) {
      const [account] = await sequelize.query(
        `SELECT account_number FROM customer_accounts WHERE CUST_ID = :customerId LIMIT 1`,
        {
          replacements: { customerId: customer.CUST_ID },
          type: sequelize.QueryTypes.SELECT
        }
      );
      if (account) {
        acctNo = account.account_number;
      }
    }

    if (!acctNo) {
      console.log(`⚠️ No account number found for customer ${customer.CUST_ID}`);
      return {
        customer: {
          id: customer.CUST_ID,
          customerNo: customer.CUST_NO,
          name: customer.CUST_NM || `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim(),
          firstName: customer.FIRST_NAME,
          lastName: customer.LAST_NAME,
          email: customer.EMAIL_ADDRESS,
          phone: customer.PHONE_NO,
          accountNumber: 'N/A',
          accountName: customer.CUST_NM,
          alertDeliveryMethod: customer.ALERT_DELIVERY_METHOD || 'Email',
          frequency: customer.STMNT_FREQ_CD || 'Monthly',
          frequencyValue: customer.STMNT_FREQ_VALUE || 30,
          createdDate: customer.CREATE_DT || customer.created_at,
          branchId: customer.BU_ID,
        },
        accounts: [],
        period: {
          startDate: moment(startDate).format('DD/MM/YYYY'),
          endDate: moment(endDate).format('DD/MM/YYYY'),
          startDateRaw: startDate,
          endDateRaw: endDate,
          frequency: customer.STMNT_FREQ_CD || 'Monthly',
          frequencyValue: customer.STMNT_FREQ_VALUE || 30,
        },
        summary: {
          openingBalance: '0.00',
          totalCredits: '0.00',
          totalDebits: '0.00',
          totalEMTL: '0.00',
          closingBalance: '0.00',
          transactionCount: 0,
          netChange: '0.00',
        },
        transactions: [],
        generatedAt: new Date().toISOString(),
        generatedBy: 'Evolution Banking System',
        noAccount: true
      };
    }

    const [transactions] = await sequelize.query(
      `SELECT 
        dt.id,
        dt.transaction_ref_no,
        dt.transaction_type,
        dt.amount,
        dt.emtl_amount,
        dt.total_debit,
        dt.currency,
        dt.status,
        dt.description,
        dt.transaction_date,
        dt.created_at,
        dt.created_by,
        dt.branch_id,
        dt.approved_by,
        dt.approved_at,
        dt.depositor_name,
        dt.server_processing_date,
        dt.system_time,
        dt.system_user_id
      FROM deposit_transactions dt
      WHERE dt.account_number = :accountNumber
        AND dt.transaction_date BETWEEN :startDate AND :endDate
        AND dt.status IN ('COMPLETED', 'APPROVED')
      ORDER BY dt.transaction_date ASC, dt.created_at ASC`,
      {
        replacements: {
          accountNumber: acctNo,
          startDate: startDate,
          endDate: endDate
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    let totalCredits = 0;
    let totalDebits = 0;
    let totalEMTL = 0;
    let transactionCount = 0;

    if (transactions && Array.isArray(transactions)) {
      transactions.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0;
        const isCredit = tx.transaction_type === 'DEPOSIT' || 
                         tx.transaction_type === 'CR' || 
                         tx.transaction_type === 'C' ||
                         tx.transaction_type === 'DEPOSIT_CR' ||
                         tx.transaction_type === 'OPENING_DEPOSIT';
        
        if (isCredit) {
          totalCredits += amount;
        } else {
          totalDebits += amount;
        }
        
        totalEMTL += parseFloat(tx.emtl_amount) || 0;
        transactionCount++;
      });
    }

    const [openingBalance] = await sequelize.query(
      `SELECT ledger_balance, available_balance 
       FROM customer_accounts 
       WHERE account_number = :accountNumber`,
      {
        replacements: { accountNumber: acctNo },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const openingBal = parseFloat(openingBalance?.ledger_balance || 0) - totalCredits + totalDebits;
    const closingBalance = parseFloat(customer.ledger_balance || openingBalance?.ledger_balance || 0);

    const formattedTransactions = (transactions && Array.isArray(transactions)) ? transactions.map(tx => ({
      date: moment(tx.transaction_date).format('DD/MM/YYYY HH:mm'),
      reference: tx.transaction_ref_no || `TXN-${tx.id}`,
      type: tx.transaction_type,
      description: tx.description || tx.transaction_type,
      amount: parseFloat(tx.amount).toFixed(2),
      emtl: parseFloat(tx.emtl_amount || 0).toFixed(2),
      totalDebit: parseFloat(tx.total_debit || tx.amount || 0).toFixed(2),
      status: tx.status,
      createdBy: tx.created_by || tx.depositor_name || 'System',
      serverProcessingDate: tx.server_processing_date ? moment(tx.server_processing_date).format('DD/MM/YYYY') : '',
      systemTime: tx.system_time ? moment(tx.system_time).format('DD/MM/YYYY HH:mm') : '',
      systemUserId: tx.system_user_id || ''
    })) : [];

    const [allAccounts] = await sequelize.query(
      `SELECT 
        account_number,
        account_name,
        available_balance,
        ledger_balance,
        currency,
        status
      FROM customer_accounts 
      WHERE CUST_ID = :customerId`,
      {
        replacements: { customerId: customer.CUST_ID },
        type: sequelize.QueryTypes.SELECT
      }
    );

    return {
      customer: {
        id: customer.CUST_ID,
        customerNo: customer.CUST_NO,
        name: customer.CUST_NM || `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim(),
        firstName: customer.FIRST_NAME,
        lastName: customer.LAST_NAME,
        email: customer.EMAIL_ADDRESS,
        phone: customer.PHONE_NO,
        accountNumber: acctNo || 'N/A',
        accountName: customer.account_name || customer.CUST_NM,
        alertDeliveryMethod: customer.ALERT_DELIVERY_METHOD || 'Email',
        frequency: customer.STMNT_FREQ_CD || 'Monthly',
        frequencyValue: customer.STMNT_FREQ_VALUE || 30,
        createdDate: customer.CREATE_DT || customer.created_at,
        branchId: customer.BU_ID,
      },
      accounts: allAccounts || [],
      period: {
        startDate: moment(startDate).format('DD/MM/YYYY'),
        endDate: moment(endDate).format('DD/MM/YYYY'),
        startDateRaw: startDate,
        endDateRaw: endDate,
        frequency: customer.STMNT_FREQ_CD || 'Monthly',
        frequencyValue: customer.STMNT_FREQ_VALUE || 30,
      },
      summary: {
        openingBalance: openingBal.toFixed(2),
        totalCredits: totalCredits.toFixed(2),
        totalDebits: totalDebits.toFixed(2),
        totalEMTL: totalEMTL.toFixed(2),
        closingBalance: closingBalance.toFixed(2),
        transactionCount: transactionCount,
        netChange: (totalCredits - totalDebits).toFixed(2),
      },
      transactions: formattedTransactions,
      generatedAt: new Date().toISOString(),
      generatedBy: 'Evolution Banking System',
    };

  } catch (error) {
    console.error(`Error generating statement for customer ${customer.CUST_ID}:`, error);
    return null;
  }
};

// ============================================
// SEND STATEMENT EMAIL - Exported function
// ============================================

export const sendStatementEmail = async (statementData, options = {}) => {
  return sendStatementEmailInternal(statementData, options);
};

// ============================================
// SEND STATEMENT SMS
// ============================================

export const sendStatementSMS = async (statementData, options = {}) => {
  try {
    const { dryRun = false, testMode = false } = options;
    
    const { customer, period, summary } = statementData;
    
    if (!customer.phone) {
      console.error(`❌ No phone number for customer ${customer.id}`);
      return { success: false, error: 'No phone number' };
    }

    if (dryRun) {
      console.log(`🔍 DRY RUN: Would send SMS to ${customer.phone}`);
      return { 
        success: true, 
        customerId: customer.id,
        dryRun: true
      };
    }

    let toPhone = customer.phone;
    if (testMode) {
      toPhone = process.env.TEST_PHONE || '08012345678';
      console.log(`🧪 TEST MODE: Would send to ${customer.phone}, using ${toPhone} instead`);
    }

    const appName = process.env.APP_NAME || 'Evolution Banking';
    
    let message = `🏦 ${appName} - Account Statement\n\n`;
    message += `Customer: ${customer.name}\n`;
    message += `Account: ${customer.accountNumber}\n`;
    message += `Period: ${period.startDate} to ${period.endDate}\n\n`;
    message += `📊 SUMMARY:\n`;
    message += `Opening: ₦${summary.openingBalance}\n`;
    message += `Credits: ₦${summary.totalCredits}\n`;
    message += `Debits: ₦${summary.totalDebits}\n`;
    message += `Closing: ₦${summary.closingBalance}\n`;
    message += `Transactions: ${summary.transactionCount}\n\n`;
    message += `For full details, please visit your nearest branch or check your email.`;
    message += `\n\nThank you for banking with us!`;

    const result = await smsService.sendSMS(toPhone, message);
    
    if (result.success) {
      console.log(`✅ Statement SMS sent to ${customer.phone}`);
      try {
        await recordStatementSent(customer, period, result.data?.message_id || null, 'SMS');
      } catch (recordError) {
        console.warn('Could not record statement sent:', recordError.message);
      }
      return {
        success: true,
        customerId: customer.id,
        phone: customer.phone,
      };
    } else {
      console.error(`❌ Failed to send statement SMS to ${customer.phone}:`, result.error);
      return {
        success: false,
        error: result.error || 'SMS sending failed',
        customerId: customer.id,
        phone: customer.phone,
      };
    }

  } catch (error) {
    console.error(`❌ Error sending statement SMS:`, error);
    return {
      success: false,
      error: error.message,
      customerId: statementData?.customer?.id,
      phone: statementData?.customer?.phone,
    };
  }
};

// ============================================
// RECORD STATEMENT SENT
// ============================================

export const recordStatementSent = async (customer, period, messageId, deliveryMethod = 'EMAIL') => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS customer_statements (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id VARCHAR(50) NOT NULL,
        customer_no VARCHAR(50),
        customer_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(20),
        account_number VARCHAR(50),
        statement_type VARCHAR(20) DEFAULT 'EMAIL',
        delivery_method VARCHAR(20) DEFAULT 'EMAIL',
        period_start DATE,
        period_end DATE,
        frequency VARCHAR(20),
        frequency_value INT,
        message_id VARCHAR(255),
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'SENT',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_customer_id (customer_id),
        INDEX idx_sent_at (sent_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await sequelize.query(
      `INSERT INTO customer_statements (
        customer_id, customer_no, customer_name, email, phone, account_number,
        statement_type, delivery_method, period_start, period_end, 
        frequency, frequency_value, message_id, sent_at, status
      ) VALUES (
        :customerId, :customerNo, :customerName, :email, :phone, :accountNumber,
        :statementType, :deliveryMethod, :periodStart, :periodEnd,
        :frequency, :frequencyValue, :messageId, NOW(), 'SENT'
      )`,
      {
        replacements: {
          customerId: customer.CUST_ID || customer.id,
          customerNo: customer.CUST_NO || null,
          customerName: customer.CUST_NM || customer.name || null,
          email: customer.EMAIL_ADDRESS || customer.email || null,
          phone: customer.PHONE_NO || customer.phone || null,
          accountNumber: customer.account_number || null,
          statementType: deliveryMethod === 'SMS' ? 'SMS' : 'EMAIL',
          deliveryMethod: deliveryMethod,
          periodStart: period.startDate,
          periodEnd: period.endDate,
          frequency: period.frequency || 'Monthly',
          frequencyValue: period.frequencyValue || 30,
          messageId: messageId || null,
        },
        type: sequelize.QueryTypes.INSERT
      }
    );

    console.log(`✅ Statement record created for customer ${customer.CUST_ID} via ${deliveryMethod}`);

  } catch (error) {
    console.warn('Error recording statement sent (non-critical):', error.message);
  }
};

// ============================================
// GENERATE STATEMENT EMAIL HTML
// ============================================

const generateStatementEmailHTML = (statementData) => {
  const { customer, period, summary, transactions } = statementData;
  
  let transactionRows = '';
  
  if (transactions && transactions.length > 0) {
    transactionRows = transactions.map(tx => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${tx.date}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${tx.reference}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${tx.type}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${tx.description}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₦${tx.amount}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₦${tx.emtl}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₦${tx.totalDebit}</td>
      </tr>
    `).join('');
  } else {
    transactionRows = `
      <tr>
        <td colspan="7" style="padding: 20px; text-align: center; color: #888;">
          No transactions found for this period.
        </td>
      </tr>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Statement</title>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background-color: #f4f7fc;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          }
          .header {
            text-align: center;
            border-bottom: 3px solid #667eea;
            padding-bottom: 20px;
            margin-bottom: 25px;
          }
          .header h1 {
            color: #667eea;
            font-size: 28px;
            margin: 0;
          }
          .header p {
            color: #888;
            margin: 5px 0 0;
          }
          .customer-info {
            background: #f8f9fa;
            padding: 15px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .customer-info table {
            width: 100%;
          }
          .customer-info td {
            padding: 4px 8px;
            font-size: 14px;
          }
          .customer-info .label {
            color: #666;
            font-weight: 600;
            width: 120px;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin: 20px 0;
          }
          .summary-item {
            background: #f5f7ff;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
          }
          .summary-item .label {
            font-size: 12px;
            color: #888;
            text-transform: uppercase;
          }
          .summary-item .value {
            font-size: 18px;
            font-weight: 700;
            color: #333;
          }
          .summary-item .value.credit { color: #28a745; }
          .summary-item .value.debit { color: #dc3545; }
          .summary-item .value.balance { color: #667eea; }
          .table-container {
            overflow-x: auto;
            margin: 20px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
          }
          table th {
            background: #667eea;
            color: #fff;
            padding: 10px;
            text-align: left;
          }
          table td {
            padding: 8px;
            border-bottom: 1px solid #eee;
          }
          table tr:hover td {
            background: #f8f9fa;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
            color: #999;
            font-size: 12px;
          }
          .footer .brand {
            color: #667eea;
            font-weight: 600;
          }
          .disclaimer {
            margin-top: 15px;
            padding: 12px;
            background: #fef9e7;
            border-radius: 8px;
            font-size: 12px;
            color: #856404;
          }
          @media (max-width: 600px) {
            .container { padding: 20px; }
            .summary-grid { grid-template-columns: 1fr 1fr; }
            table { font-size: 11px; }
            table th, table td { padding: 4px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏦 Account Statement</h1>
            <p>${period.frequency} Statement - ${period.startDate} to ${period.endDate}</p>
          </div>

          <div class="customer-info">
            <table>
              <tr>
                <td class="label">Customer:</td>
                <td><strong>${customer.name}</strong></td>
                <td class="label">Account:</td>
                <td><strong>${customer.accountNumber}</strong></td>
              </tr>
              <tr>
                <td class="label">Email:</td>
                <td>${customer.email}</td>
                <td class="label">Account Name:</td>
                <td>${customer.accountName}</td>
              </tr>
              <tr>
                <td class="label">Phone:</td>
                <td>${customer.phone}</td>
                <td class="label">Frequency:</td>
                <td>${customer.frequency} (${customer.frequencyValue} days)</td>
              </tr>
            </table>
          </div>

          <div class="summary-grid">
            <div class="summary-item">
              <div class="label">Opening Balance</div>
              <div class="value balance">₦${summary.openingBalance}</div>
            </div>
            <div class="summary-item">
              <div class="label">Total Credits</div>
              <div class="value credit">₦${summary.totalCredits}</div>
            </div>
            <div class="summary-item">
              <div class="label">Total Debits</div>
              <div class="value debit">₦${summary.totalDebits}</div>
            </div>
            <div class="summary-item">
              <div class="label">EMTL Levied</div>
              <div class="value">₦${summary.totalEMTL}</div>
            </div>
            <div class="summary-item">
              <div class="label">Closing Balance</div>
              <div class="value balance">₦${summary.closingBalance}</div>
            </div>
            <div class="summary-item">
              <div class="label">Transactions</div>
              <div class="value">${summary.transactionCount}</div>
            </div>
            <div class="summary-item">
              <div class="label">Net Change</div>
              <div class="value ${parseFloat(summary.netChange) >= 0 ? 'credit' : 'debit'}">₦${summary.netChange}</div>
            </div>
          </div>

          <h3 style="margin-top: 25px;">Transaction History</h3>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th style="text-align: right;">Amount</th>
                  <th style="text-align: right;">EMTL</th>
                  <th style="text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${transactionRows}
              </tbody>
            </table>
          </div>

          <div class="disclaimer">
            <strong>📋 Disclaimer:</strong> This statement is for informational purposes only. 
            Please verify all transactions and contact support for any discrepancies.
          </div>

          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} <span class="brand">Evolution Banking</span>. All rights reserved.</p>
            <p style="margin-top: 5px; font-size: 11px; color: #bbb;">
              This is an automated message, please do not reply to this email.
            </p>
            <p style="margin-top: 5px; font-size: 11px; color: #bbb;">
              Generated on: ${new Date().toLocaleString()}
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
};

// ============================================
// GENERATE STATEMENT EMAIL TEXT
// ============================================

const generateStatementEmailText = (statementData) => {
  const { customer, period, summary, transactions } = statementData;
  
  let transactionText = '';
  
  if (transactions && transactions.length > 0) {
    transactionText = transactions.map(tx => 
      `${tx.date} | ${tx.reference} | ${tx.type} | ${tx.description} | ₦${tx.amount} | ₦${tx.emtl} | ₦${tx.totalDebit}`
    ).join('\n');
  } else {
    transactionText = 'No transactions found for this period.';
  }

  return `
${'='.repeat(60)}
                    ACCOUNT STATEMENT
${'='.repeat(60)}

Customer: ${customer.name}
Account: ${customer.accountNumber}
Account Name: ${customer.accountName}
Email: ${customer.email}
Phone: ${customer.phone}
Period: ${period.startDate} to ${period.endDate}
Frequency: ${period.frequency}

${'='.repeat(60)}
                    SUMMARY
${'='.repeat(60)}

Opening Balance: ₦${summary.openingBalance}
Total Credits:    ₦${summary.totalCredits}
Total Debits:     ₦${summary.totalDebits}
EMTL Levied:      ₦${summary.totalEMTL}
Closing Balance:  ₦${summary.closingBalance}
Transactions:     ${summary.transactionCount}
Net Change:       ₦${summary.netChange}

${'='.repeat(60)}
              TRANSACTION HISTORY
${'='.repeat(60)}

Date       | Reference    | Type | Description | Amount   | EMTL     | Total
${'-'.repeat(60)}
${transactionText}

${'='.repeat(60)}
${'Evolution Banking'} - Secure Banking
${'='.repeat(60)}
Generated: ${new Date().toLocaleString()}
  `;
};

// ============================================
// MAIN SERVICE FUNCTION
// ============================================

export const processEmailStatements = async (options = {}) => {
  const startTime = Date.now();
  const {
    asOfDate = new Date(),
    dryRun = false,
    batchSize = 100,
    sendEmail = true,
    sendSms = true,
  } = options;

  const checkDate = moment(asOfDate).format('YYYY-MM-DD');
  console.log(`📧 Starting statement processing as of ${checkDate}...`);
  console.log(`📋 Options: dryRun=${dryRun}, sendEmail=${sendEmail}, sendSms=${sendSms}`);

  const results = {
    totalCustomersChecked: 0,
    customersDue: 0,
    statementsGenerated: 0,
    emailsSent: 0,
    emailsFailed: 0,
    smsSent: 0,
    smsFailed: 0,
    customersWithNoEmail: 0,
    customersWithNoPhone: 0,
    errors: [],
    details: [],
    skipped: [],
    executionTime: 0,
    dryRun,
    asOfDate: checkDate
  };

  try {
    const dueCustomers = await getCustomersDueForStatement(asOfDate);
    results.totalCustomersChecked = dueCustomers.length;

    if (dueCustomers.length === 0) {
      console.log('📧 No customers due for statement today');
      
      const status = await getEmailStatementStatus(asOfDate);
      console.log('📧 Email statement status:', {
        totalCustomers: status.totalCustomers,
        customersWithEmail: status.customersWithEmail,
        customersDue: status.customersDue,
        nextDueDates: status.nextDueDates?.slice(0, 3)
      });
      
      results.executionTime = Date.now() - startTime;
      return results;
    }

    for (const customer of dueCustomers) {
      try {
        console.log(`📧 Processing customer ${customer.CUST_ID}...`);
        
        const statementData = await generateCustomerStatement(customer, customer.statementPeriod);
        
        if (!statementData) {
          results.errors.push({
            customerId: customer.CUST_ID,
            error: 'Failed to generate statement'
          });
          continue;
        }

        results.statementsGenerated++;
        results.customersDue++;

        const deliveryMethod = customer.ALERT_DELIVERY_METHOD || 'Email';
        let emailSent = false;
        let smsSent = false;

        // ✅ Send Email
        if ((deliveryMethod === 'Email' || deliveryMethod === 'Both') && sendEmail) {
          if (!dryRun) {
            console.log(`📧 Attempting to send email to ${customer.EMAIL_ADDRESS}...`);
            const emailResult = await sendStatementEmailInternal(statementData);
            if (emailResult.success) {
              results.emailsSent++;
              emailSent = true;
              console.log(`✅ Email sent to ${customer.EMAIL_ADDRESS}`);
            } else {
              results.emailsFailed++;
              results.errors.push({
                customerId: customer.CUST_ID,
                error: emailResult.error || 'Email sending failed'
              });
              console.error(`❌ Email failed for ${customer.EMAIL_ADDRESS}: ${emailResult.error}`);
            }
          } else {
            console.log(`🔍 DRY RUN: Would send email to ${customer.EMAIL_ADDRESS}`);
            results.emailsSent++;
            emailSent = true;
          }
        }

        // ✅ Send SMS
        if ((deliveryMethod === 'SMS' || deliveryMethod === 'Both') && sendSms) {
          if (!dryRun) {
            const smsResult = await sendStatementSMS(statementData);
            if (smsResult.success) {
              results.smsSent++;
              smsSent = true;
            } else {
              results.smsFailed++;
              results.errors.push({
                customerId: customer.CUST_ID,
                error: smsResult.error || 'SMS sending failed'
              });
            }
          } else {
            console.log(`🔍 DRY RUN: Would send SMS to ${customer.PHONE_NO}`);
            results.smsSent++;
            smsSent = true;
          }
        }

        results.details.push({
          customerId: customer.CUST_ID,
          customerName: customer.CUST_NM,
          email: customer.EMAIL_ADDRESS,
          phone: customer.PHONE_NO,
          accountNumber: customer.account_number,
          deliveryMethod: deliveryMethod,
          emailSent: emailSent,
          smsSent: smsSent,
          dryRun: dryRun,
        });

      } catch (error) {
        console.error(`❌ Error processing customer ${customer.CUST_ID}:`, error);
        results.errors.push({
          customerId: customer.CUST_ID,
          error: error.message
        });
      }
    }

    results.executionTime = Date.now() - startTime;

    console.log(`📧 Statement processing completed`, {
      totalCustomersChecked: results.totalCustomersChecked,
      customersDue: results.customersDue,
      statementsGenerated: results.statementsGenerated,
      emailsSent: results.emailsSent,
      emailsFailed: results.emailsFailed,
      smsSent: results.smsSent,
      smsFailed: results.smsFailed,
      executionTime: `${results.executionTime}ms`,
      dryRun: results.dryRun
    });

    return results;

  } catch (error) {
    console.error('❌ Statement processing failed:', error);
    results.errors.push({
      error: error.message,
      stack: error.stack
    });
    results.executionTime = Date.now() - startTime;
    return results;
  }
};

// ============================================
// INITIALIZE SERVICE STATUS
// ============================================

export const initializeEmailStatementService = () => {
  return {
    serviceName: 'emailStatements',
    healthy: true,
    lastRun: null,
    executionTime: null,
    processed: 0,
    failed: 0,
    details: {
      totalCustomersChecked: 0,
      customersDue: 0,
      statementsGenerated: 0,
      emailsSent: 0,
      emailsFailed: 0,
      smsSent: 0,
      smsFailed: 0,
    },
    lastError: null,
  };
};

// ============================================
// DEBUG FUNCTION
// ============================================

export const debugEmailStatementService = async () => {
  try {
    console.log('\n🔍 ========== EMAIL STATEMENT SERVICE DEBUG ==========');
    
    const today = new Date();
    console.log(`📅 Today: ${today.toISOString().split('T')[0]}`);
    
    // 1. Check all customers
    const [allCustomers] = await sequelize.query(
      `SELECT CUST_ID, CUST_NM, EMAIL_ADDRESS, REC_ST, status, ALERT_DELIVERY_METHOD, STMNT_FREQ_CD, STMNT_FREQ_VALUE, CREATE_DT 
       FROM customers 
       WHERE REC_ST IN ('A', 'ACTIVE') AND status = 'Approved'`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    const allCustomersArray = allCustomers || [];
    console.log(`📊 1. Active/Approved customers: ${allCustomersArray.length || 0}`);
    if (allCustomersArray.length > 0) {
      allCustomersArray.forEach(c => {
        console.log(`   - ${c.CUST_ID}: ${c.CUST_NM} (${c.ALERT_DELIVERY_METHOD}) - Freq: ${c.STMNT_FREQ_CD}(${c.STMNT_FREQ_VALUE}) - Created: ${c.CREATE_DT}`);
      });
    }
    
    // 2. Check customers with email
    const [withEmail] = await sequelize.query(
      `SELECT CUST_ID, CUST_NM, EMAIL_ADDRESS, ALERT_DELIVERY_METHOD
       FROM customers 
       WHERE EMAIL_ADDRESS IS NOT NULL AND EMAIL_ADDRESS != '' AND REC_ST IN ('A', 'ACTIVE') AND status = 'Approved'`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );
    const withEmailArray = withEmail || [];
    console.log(`📊 2. Customers with email: ${withEmailArray.length || 0}`);
    if (withEmailArray.length > 0) {
      withEmailArray.forEach(c => {
        console.log(`   - ${c.CUST_ID}: ${c.CUST_NM} - ${c.EMAIL_ADDRESS} (${c.ALERT_DELIVERY_METHOD})`);
      });
    }
    
    // 3. Check customers with frequency
    const [withFreq] = await sequelize.query(
      `SELECT CUST_ID, CUST_NM, STMNT_FREQ_CD, STMNT_FREQ_VALUE, CREATE_DT
       FROM customers 
       WHERE STMNT_FREQ_CD IS NOT NULL AND STMNT_FREQ_CD != '' AND REC_ST IN ('A', 'ACTIVE') AND status = 'Approved'`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );
    const withFreqArray = withFreq || [];
    console.log(`📊 3. Customers with frequency: ${withFreqArray.length || 0}`);
    if (withFreqArray.length > 0) {
      withFreqArray.forEach(c => {
        console.log(`   - ${c.CUST_ID}: ${c.STMNT_FREQ_CD}(${c.STMNT_FREQ_VALUE}) - Created: ${c.CREATE_DT}`);
      });
    }
    
    // 4. Calculate due dates for each customer
    console.log(`\n📊 4. Due date calculations:`);
    let dueCount = 0;
    if (allCustomersArray.length > 0) {
      for (const customer of allCustomersArray) {
        if (!customer.STMNT_FREQ_CD || !customer.STMNT_FREQ_VALUE) continue;
        
        const freqCode = customer.STMNT_FREQ_CD?.toUpperCase() || '';
        const freqValue = parseInt(customer.STMNT_FREQ_VALUE) || 1;
        const baselineDate = moment(customer.CREATE_DT || customer.created_at || today);
        
        let nextDueDate = baselineDate.clone();
        switch (freqCode) {
          case 'DAILY': nextDueDate.add(freqValue, 'days'); break;
          case 'WEEKLY': nextDueDate.add(freqValue * 7, 'days'); break;
          case 'MONTHLY': nextDueDate.add(freqValue, 'months'); break;
          case 'QUARTERLY': nextDueDate.add(freqValue * 3, 'months'); break;
          case 'YEARLY': nextDueDate.add(freqValue, 'years'); break;
          default: nextDueDate.add(1, 'months');
        }
        
        const isDue = moment(today).isSameOrAfter(nextDueDate, 'day');
        const canSendEmail = (customer.ALERT_DELIVERY_METHOD || '').toUpperCase() === 'EMAIL' || 
                             (customer.ALERT_DELIVERY_METHOD || '').toUpperCase() === 'BOTH';
        
        console.log(`   - ${customer.CUST_ID}: ${customer.CUST_NM}`);
        console.log(`     Created: ${baselineDate.format('YYYY-MM-DD')}`);
        console.log(`     Next Due: ${nextDueDate.format('YYYY-MM-DD')}`);
        console.log(`     Is Due: ${isDue ? '✅ YES' : '❌ NO'}`);
        console.log(`     Can Send Email: ${canSendEmail ? '✅ YES' : '❌ NO'}`);
        console.log(`     Alert Method: ${customer.ALERT_DELIVERY_METHOD}`);
        console.log(`     ${isDue && canSendEmail ? '✅ SHOULD RECEIVE EMAIL' : '⏭️ SKIPPED'}`);
        
        if (isDue && canSendEmail) dueCount++;
      }
    }
    
    console.log(`\n📊 SUMMARY: ${dueCount} customers should receive email today`);
    console.log('🔍 ==========================================\n');
    
    return {
      success: true,
      date: today.toISOString().split('T')[0],
      allCustomers: allCustomersArray.length,
      withEmail: withEmailArray.length,
      withFreq: withFreqArray.length,
      dueCount: dueCount,
      details: allCustomersArray
    };
  } catch (error) {
    console.error('❌ Debug error:', error);
    return { error: error.message };
  }
};

// ============================================
// EXPORTS
// ============================================

