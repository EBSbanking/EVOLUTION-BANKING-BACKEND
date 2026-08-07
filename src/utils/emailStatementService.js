// utils/emailStatementService.js
import nodemailer from 'nodemailer';
import moment from 'moment';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ============================================
// EMAIL CONFIGURATION
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

// Create email transporter
let emailTransporter = null;

const initEmailTransporter = () => {
  try {
    if (emailConfig.auth.user && emailConfig.auth.pass) {
      emailTransporter = nodemailer.createTransport({
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

      emailTransporter.verify((error, success) => {
        if (error) {
          console.error('❌ SMTP Transporter verification failed:', error.message);
        } else {
          console.log('✅ SMTP Transporter verified successfully');
        }
      });

      logger.info('✅ Email transporter initialized for statement service');
    } else {
      logger.warn('⚠️ SMTP not configured, email statements disabled');
    }
  } catch (error) {
    logger.error('❌ Failed to initialize email transporter:', error);
  }
};

initEmailTransporter();

// ============================================
// STATEMENT GENERATION SERVICE
// ============================================

/**
 * Get customers who are due for statement delivery based on their frequency
 */
export const getCustomersDueForStatement = async (asOfDate = new Date()) => {
  try {
    const today = moment(asOfDate).startOf('day');
    
    // Find customers with ALERT_DELIVERY_METHOD = 'Email' and valid STMNT_FREQ_CD
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
      WHERE c.ALERT_DELIVERY_METHOD = 'Email'
        AND c.STMNT_FREQ_CD IS NOT NULL
        AND c.STMNT_FREQ_CD != ''
        AND c.STMNT_FREQ_CD != 'None'
        AND c.STMNT_FREQ_VALUE IS NOT NULL
        AND c.STMNT_FREQ_VALUE != ''
        AND c.status = 'Approved'
        AND c.REC_ST = 'A'
        AND c.EMAIL_ADDRESS IS NOT NULL
        AND c.EMAIL_ADDRESS != ''
        AND c.EMAIL_ADDRESS LIKE '%@%'
      ORDER BY c.CUST_ID ASC`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!customers || customers.length === 0) {
      logger.info('No customers found with email statement delivery enabled');
      return [];
    }

    logger.info(`Found ${customers.length} customers with email statement delivery`);

    // Filter customers based on their frequency
    const dueCustomers = [];
    const todayStr = today.format('YYYY-MM-DD');

    for (const customer of customers) {
      // Determine if customer is due for statement
      const isDue = await isCustomerDueForStatement(customer, today);
      
      if (isDue) {
        // Get the statement period for this customer
        const statementPeriod = getStatementPeriod(customer, today);
        
        dueCustomers.push({
          ...customer,
          statementPeriod,
          dueDate: today.toDate(),
          account_number: customer.account_number || null,
          account_name: customer.account_name || customer.CUST_NM,
          available_balance: customer.available_balance || 0,
          ledger_balance: customer.ledger_balance || 0,
        });
      }
    }

    logger.info(`${dueCustomers.length} customers due for email statement today`);
    return dueCustomers;

  } catch (error) {
    logger.error('Error getting customers due for statement:', error);
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

    // If no frequency code, not due
    if (!freqCode || freqCode === 'NONE') {
      return false;
    }

    // Get the customer's creation date or last statement date
    let lastStatementDate = null;
    
    // Check if customer has previous statements
    const [lastStatement] = await sequelize.query(
      `SELECT MAX(sent_at) as last_sent_at 
       FROM customer_statements 
       WHERE customer_id = :customerId 
       AND statement_type = 'EMAIL'`,
      {
        replacements: { customerId: customer.CUST_ID || customer.id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (lastStatement?.last_sent_at) {
      lastStatementDate = moment(lastStatement.last_sent_at);
    } else {
      // Use customer creation date as baseline
      lastStatementDate = moment(customer.CREATE_DT || customer.created_at || asOfDate);
    }

    // Calculate next due date based on frequency
    let nextDueDate = lastStatementDate.clone();
    
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
        // Default to monthly if unknown
        nextDueDate.add(1, 'months');
    }

    // Check if today is on or after the next due date
    const isDue = today.isSameOrAfter(nextDueDate, 'day');

    if (isDue) {
      logger.debug(`Customer ${customer.CUST_ID} is due for statement`, {
        freqCode,
        freqValue,
        lastStatementDate: lastStatementDate.format('YYYY-MM-DD'),
        nextDueDate: nextDueDate.format('YYYY-MM-DD'),
        today: today.format('YYYY-MM-DD')
      });
    }

    return isDue;

  } catch (error) {
    logger.error(`Error checking if customer ${customer?.CUST_ID} is due for statement:`, error);
    return false;
  }
};

/**
 * Get the statement period for a customer
 */
export const getStatementPeriod = (customer, asOfDate = new Date()) => {
  const today = moment(asOfDate);
  const freqCode = customer.STMNT_FREQ_CD?.toUpperCase() || 'MONTHLY';
  const freqValue = parseInt(customer.STMNT_FREQ_VALUE) || 1;

  let startDate = today.clone();
  let endDate = today.clone();

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

  return {
    startDate: startDate.startOf('day').toDate(),
    endDate: endDate.endOf('day').toDate(),
    startDateFormatted: startDate.format('YYYY-MM-DD'),
    endDateFormatted: endDate.format('YYYY-MM-DD'),
    frequency: freqCode,
    frequencyValue: freqValue,
  };
};

/**
 * Generate statement for a customer
 */
export const generateCustomerStatement = async (customer, period) => {
  try {
    const { startDate, endDate } = period;
    const accountNumber = customer.account_number;

    // Get all transactions for the customer during the period
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
        dt.depositor_name
      FROM deposit_transactions dt
      WHERE dt.account_number = :accountNumber
        AND dt.transaction_date BETWEEN :startDate AND :endDate
        AND dt.status IN ('COMPLETED', 'APPROVED')
      ORDER BY dt.transaction_date ASC, dt.created_at ASC`,
      {
        replacements: {
          accountNumber: accountNumber,
          startDate: startDate,
          endDate: endDate
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    // Calculate summary
    let totalCredits = 0;
    let totalDebits = 0;
    let totalEMTL = 0;
    let transactionCount = 0;

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

    // Get opening balance (balance before the period)
    const [openingBalance] = await sequelize.query(
      `SELECT ledger_balance, available_balance 
       FROM customer_accounts 
       WHERE account_number = :accountNumber`,
      {
        replacements: { accountNumber: accountNumber },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const openingBal = parseFloat(openingBalance?.ledger_balance || 0) - totalCredits + totalDebits;
    const closingBalance = parseFloat(customer.ledger_balance || 0);

    // Format transactions for display
    const formattedTransactions = transactions.map(tx => ({
      date: moment(tx.transaction_date).format('DD/MM/YYYY HH:mm'),
      reference: tx.transaction_ref_no || `TXN-${tx.id}`,
      type: tx.transaction_type,
      description: tx.description || tx.transaction_type,
      amount: parseFloat(tx.amount).toFixed(2),
      emtl: parseFloat(tx.emtl_amount || 0).toFixed(2),
      totalDebit: parseFloat(tx.total_debit || tx.amount || 0).toFixed(2),
      status: tx.status,
      createdBy: tx.created_by || tx.depositor_name || 'System',
    }));

    return {
      customer: {
        id: customer.CUST_ID,
        name: customer.CUST_NM || `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim(),
        email: customer.EMAIL_ADDRESS,
        phone: customer.PHONE_NO,
        accountNumber: customer.account_number || 'N/A',
        accountName: customer.account_name || customer.CUST_NM,
      },
      period: {
        startDate: moment(startDate).format('DD/MM/YYYY'),
        endDate: moment(endDate).format('DD/MM/YYYY'),
        frequency: customer.STMNT_FREQ_CD,
        frequencyValue: customer.STMNT_FREQ_VALUE,
      },
      summary: {
        openingBalance: openingBal.toFixed(2),
        totalCredits: totalCredits.toFixed(2),
        totalDebits: totalDebits.toFixed(2),
        totalEMTL: totalEMTL.toFixed(2),
        closingBalance: closingBalance.toFixed(2),
        transactionCount: transactionCount,
      },
      transactions: formattedTransactions,
      generatedAt: new Date().toISOString(),
    };

  } catch (error) {
    logger.error(`Error generating statement for customer ${customer.CUST_ID}:`, error);
    return null;
  }
};

// ============================================
// EMAIL TEMPLATES
// ============================================

/**
 * Generate HTML email for statement
 */
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
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Generate plain text email for statement
 */
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

${'='.repeat(60)}
              TRANSACTION HISTORY
${'='.repeat(60)}

Date       | Reference    | Type | Description | Amount   | EMTL     | Total
${'-'.repeat(60)}
${transactionText}

${'='.repeat(60)}
${'Evolution Banking'} - Secure Banking
${'='.repeat(60)}
  `;
};

// ============================================
// SEND STATEMENT EMAIL
// ============================================

/**
 * Send statement email to customer
 */
export const sendStatementEmail = async (statementData) => {
  try {
    if (!emailTransporter) {
      logger.error('❌ Email transporter not initialized');
      return { success: false, error: 'Email transporter not configured' };
    }

    const { customer, period } = statementData;
    
    if (!customer.email) {
      logger.error(`❌ No email address for customer ${customer.CUST_ID}`);
      return { success: false, error: 'No email address' };
    }

    const appName = process.env.APP_NAME || emailConfig.name || 'Evolution Banking';
    const fromEmail = emailConfig.from || emailConfig.auth.user;

    const htmlContent = generateStatementEmailHTML(statementData);
    const textContent = generateStatementEmailText(statementData);

    const mailOptions = {
      from: `"${appName} Statements" <${fromEmail}>`,
      to: customer.email,
      subject: `📊 Account Statement - ${period.startDate} to ${period.endDate}`,
      html: htmlContent,
      text: textContent,
    };

    // Send email
    const info = await emailTransporter.sendMail(mailOptions);
    logger.info(`✅ Statement email sent to ${customer.email}`, {
      messageId: info.messageId,
      customerId: customer.CUST_ID,
      period: `${period.startDate} to ${period.endDate}`
    });

    // Record the statement sent
    await recordStatementSent(customer, period, info.messageId);

    return {
      success: true,
      messageId: info.messageId,
      customerId: customer.CUST_ID,
    };

  } catch (error) {
    logger.error(`❌ Failed to send statement email to ${statementData?.customer?.email}:`, error);
    return {
      success: false,
      error: error.message,
      customerId: statementData?.customer?.CUST_ID,
    };
  }
};

// ============================================
// RECORD STATEMENT SENT
// ============================================

/**
 * Record that a statement was sent to a customer
 */
export const recordStatementSent = async (customer, period, messageId) => {
  try {
    // Create customer_statements table if it doesn't exist
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS customer_statements (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id VARCHAR(50) NOT NULL,
        customer_no VARCHAR(50),
        customer_name VARCHAR(255),
        email VARCHAR(255),
        account_number VARCHAR(50),
        statement_type VARCHAR(20) DEFAULT 'EMAIL',
        period_start DATE,
        period_end DATE,
        frequency VARCHAR(20),
        frequency_value INT,
        transaction_count INT DEFAULT 0,
        opening_balance DECIMAL(20,2) DEFAULT 0,
        closing_balance DECIMAL(20,2) DEFAULT 0,
        total_credits DECIMAL(20,2) DEFAULT 0,
        total_debits DECIMAL(20,2) DEFAULT 0,
        total_emtl DECIMAL(20,2) DEFAULT 0,
        message_id VARCHAR(255),
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'SENT',
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_customer_id (customer_id),
        INDEX idx_sent_at (sent_at),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Insert record
    await sequelize.query(
      `INSERT INTO customer_statements (
        customer_id, customer_no, customer_name, email, account_number,
        statement_type, period_start, period_end, frequency, frequency_value,
        transaction_count, opening_balance, closing_balance,
        total_credits, total_debits, total_emtl, message_id, sent_at, status
      ) VALUES (
        :customerId, :customerNo, :customerName, :email, :accountNumber,
        'EMAIL', :periodStart, :periodEnd, :frequency, :frequencyValue,
        :transactionCount, :openingBalance, :closingBalance,
        :totalCredits, :totalDebits, :totalEMTL, :messageId, NOW(), 'SENT'
      )`,
      {
        replacements: {
          customerId: customer.CUST_ID || customer.id,
          customerNo: customer.CUST_NO || null,
          customerName: customer.CUST_NM || customer.name || null,
          email: customer.EMAIL_ADDRESS || customer.email,
          accountNumber: customer.account_number || null,
          periodStart: period.startDate,
          periodEnd: period.endDate,
          frequency: period.frequency,
          frequencyValue: period.frequencyValue || 1,
          transactionCount: 0,
          openingBalance: 0,
          closingBalance: 0,
          totalCredits: 0,
          totalDebits: 0,
          totalEMTL: 0,
          messageId: messageId || null,
        },
        type: sequelize.QueryTypes.INSERT
      }
    );

    logger.info(`✅ Statement record created for customer ${customer.CUST_ID}`);

  } catch (error) {
    logger.error('Error recording statement sent:', error);
  }
};

// ============================================
// MAIN SERVICE FUNCTION FOR OS CONTROLLER
// ============================================

/**
 * Process email statements for all due customers
 * This function is called from the OS controller during EOD
 */
export const processEmailStatements = async (options = {}) => {
  const startTime = Date.now();
  const {
    asOfDate = new Date(),
    dryRun = false,
    batchSize = 100,
    maxRetries = 3,
    sendEmail = true,
  } = options;

  logger.info(`📧 Starting email statement processing as of ${moment(asOfDate).format('YYYY-MM-DD')}...`);
  logger.info(`📋 Options: dryRun=${dryRun}, batchSize=${batchSize}, sendEmail=${sendEmail}`);

  const results = {
    totalCustomersChecked: 0,
    customersDue: 0,
    statementsGenerated: 0,
    emailsSent: 0,
    emailsFailed: 0,
    customersWithNoEmail: 0,
    customersWithNoAccount: 0,
    errors: [],
    details: [],
    executionTime: 0,
    dryRun
  };

  try {
    // Get customers due for statement
    const dueCustomers = await getCustomersDueForStatement(asOfDate);
    results.totalCustomersChecked = dueCustomers.length;

    if (dueCustomers.length === 0) {
      logger.info('No customers due for email statement today');
      results.executionTime = Date.now() - startTime;
      return results;
    }

    // Process each customer
    for (const customer of dueCustomers) {
      try {
        // Generate statement
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

        // Update summary with actual values
        statementData.summary.transactionCount = statementData.transactions?.length || 0;

        // Update results with actual transaction count
        const updateQuery = `
          UPDATE customer_statements 
          SET transaction_count = :transactionCount,
              opening_balance = :openingBalance,
              closing_balance = :closingBalance,
              total_credits = :totalCredits,
              total_debits = :totalDebits,
              total_emtl = :totalEMTL
          WHERE customer_id = :customerId 
          AND sent_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
          ORDER BY sent_at DESC LIMIT 1
        `;
        
        await sequelize.query(updateQuery, {
          replacements: {
            transactionCount: statementData.transactions?.length || 0,
            openingBalance: parseFloat(statementData.summary.openingBalance) || 0,
            closingBalance: parseFloat(statementData.summary.closingBalance) || 0,
            totalCredits: parseFloat(statementData.summary.totalCredits) || 0,
            totalDebits: parseFloat(statementData.summary.totalDebits) || 0,
            totalEMTL: parseFloat(statementData.summary.totalEMTL) || 0,
            customerId: customer.CUST_ID,
          },
          type: sequelize.QueryTypes.UPDATE
        });

        // Send email if not dry run
        if (!dryRun && sendEmail) {
          const emailResult = await sendStatementEmail(statementData);
          
          if (emailResult.success) {
            results.emailsSent++;
          } else {
            results.emailsFailed++;
            results.errors.push({
              customerId: customer.CUST_ID,
              error: emailResult.error || 'Email sending failed'
            });
          }
        } else if (dryRun) {
          logger.info(`🔍 DRY RUN: Would send statement to ${customer.EMAIL_ADDRESS}`);
          results.emailsSent++; // Count as sent for dry run
        }

        results.details.push({
          customerId: customer.CUST_ID,
          customerName: customer.CUST_NM,
          email: customer.EMAIL_ADDRESS,
          accountNumber: customer.account_number,
          statementGenerated: true,
          emailSent: !dryRun && sendEmail,
          dryRun: dryRun,
        });

      } catch (error) {
        logger.error(`Error processing customer ${customer.CUST_ID}:`, error);
        results.errors.push({
          customerId: customer.CUST_ID,
          error: error.message
        });
        results.emailsFailed++;
      }
    }

    results.executionTime = Date.now() - startTime;

    logger.info(`📧 Email statement processing completed`, {
      totalCustomersChecked: results.totalCustomersChecked,
      customersDue: results.customersDue,
      statementsGenerated: results.statementsGenerated,
      emailsSent: results.emailsSent,
      emailsFailed: results.emailsFailed,
      executionTime: `${results.executionTime}ms`,
      dryRun: results.dryRun
    });

    return results;

  } catch (error) {
    logger.error('❌ Email statement processing failed:', error);
    results.errors.push({
      error: error.message,
      stack: error.stack
    });
    results.executionTime = Date.now() - startTime;
    return results;
  }
};

// ============================================
// EXPORTS
// ============================================

export default {
  processEmailStatements,
  getCustomersDueForStatement,
  isCustomerDueForStatement,
  generateCustomerStatement,
  sendStatementEmail,
  getStatementPeriod,
};

// ============================================
// INITIALIZE SERVICE STATUS IN OS CONTROLLER
// ============================================

/**
 * Initialize email statement service status
 * This should be called when the OS controller initializes
 */
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
    },
    lastError: null,
  };
};