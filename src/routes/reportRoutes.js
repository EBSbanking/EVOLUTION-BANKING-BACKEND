import express from "express";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken"; // ✅ Added missing import
import sequelize from "../../config/db.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import { Op } from "sequelize";
import LoanAccount from "../models/LoanAccount.js";
import TermDeposit from "../models/TermDeposit.js";
import GLAccount from "../models/GLAccount.js";
import GLAccountTransaction from "../models/GLAccountTransaction.js";
import { exportTrialBalance } from '../controllers/TrialBalanceReportController.js';
import {
  generateReport,
  generateExcelReport,
  generateTermDepositContractLetter,
  cleanupReportFiles,
} from "../utils/pdfGenerator.js";
import logger from "../utils/logger.js";

// Import Inward Funds Transfer models
import InwardFundsTransfer from "../models/InwardFundsTransfer.js";
import CustomerAccount from "../models/CustomerAccount.js";
import PendingGLTransaction from "../models/PendingGLTransaction.js";

const router = express.Router();

/**
 * Trial Balance Route
 */
router.get('/reports/trial-balance', exportTrialBalance);

// ============================================
// LOAN & SAVINGS COMBINED REPORT
// ============================================

// ✅ Authentication middleware (if not already imported from authMiddleware)
// We'll keep a local version for safety, but ensure it's consistent
const localAuthenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  console.log('🔐 Auth token received:', token ? 'present' : 'missing');

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No authentication token provided',
      code: 'NO_TOKEN'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    console.log('✅ Token verified for user:', decoded.username || decoded.id);
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      code: 'INVALID_TOKEN'
    });
  }
};

// Use the local authenticator (or import from authMiddleware if preferred)
router.get('/loans-savings-combined', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  let whereClause = '';
  const replacements = [];

  if (startDate && endDate) {
    whereClause += ' AND DATE(la.d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e) BETWEEN ? AND ?';
    replacements.push(startDate, endDate);
  } else if (startDate) {
    whereClause += ' AND DATE(la.d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e) >= ?';
    replacements.push(startDate);
  } else if (endDate) {
    whereClause += ' AND DATE(la.d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e) <= ?';
    replacements.push(endDate);
  }

  const query = `
    SELECT
        la.CUST_ID AS customer_id,
        la.a_c_c_t__n_m AS customer_name,
        la.a_c_c_t__n_o AS loan_account_number,
        la.a_m_o_u_n_t AS loan_amount,
        la.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l AS outstanding_balance,
        ca.account_number AS savings_account_number,
        ca.current_balance AS current_savings_balance,
        la.l_o_a_n__s_t_a_t_u_s AS status,
        la.d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e AS opened_date,
        la.m_a_t_u_r_i_t_y__d_t AS maturity_date
    FROM loan_accounts la
    LEFT JOIN customer_accounts ca 
        ON la.CUST_ID = ca.customer_id 
        AND ca.account_type = 'SAVINGS' 
        AND ca.status = 'ACTIVE'
    WHERE la.l_o_a_n__s_t_a_t_u_s IN ('ACTIVE', 'PARTIALLY_REPAID')
      AND la.d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e IS NOT NULL
      ${whereClause}
    ORDER BY la.CUST_ID, la.d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e
  `;

  console.log('📊 Executing loan-savings report query with replacements:', replacements);

  try {
    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
      timeout: 30000
    });

    let totalLoanAmount = 0;
    const uniqueSavings = new Map();

    results.forEach(row => {
      totalLoanAmount += parseFloat(row.loan_amount) || 0;
      if (row.current_savings_balance && !uniqueSavings.has(row.customer_id)) {
        uniqueSavings.set(row.customer_id, parseFloat(row.current_savings_balance));
      }
    });

    const totalSavingsBalance = Array.from(uniqueSavings.values()).reduce((sum, val) => sum + val, 0);

    res.json({
      success: true,
      data: results,
      total_records: results.length,
      totals: {
        total_loan_amount: totalLoanAmount,
        total_savings_balance: totalSavingsBalance,
      },
      generated_at: new Date().toISOString(),
      filters: { startDate, endDate }
    });
  } catch (sqlError) {
    console.error('❌ SQL Error in loans-savings-combined:', sqlError.message);
    res.status(500).json({
      success: false,
      message: 'Database query failed',
      error: sqlError.message
    });
  }
}));

// ============================================
// (All other existing routes remain unchanged)
// ============================================

/**
 * Loan Report
 * GET /loans
 */
router.get("/loans", async (req, res) => {
  try {
    const { format = "json", status } = req.query;
    const query = status ? { LOAN_STATUS: status } : {};

    const loans = await LoanAccount.find(query).lean();

    const fields = [
      { key: "loanAccountId", displayName: "Loan Account ID", type: "number" },
      { key: "CUST_ID", displayName: "Customer ID", type: "number" },
      { key: "ACCT_NO", displayName: "Account Number", type: "string" },
      { key: "ACCT_NM", displayName: "Account Name", type: "string" },
      { key: "DISBURSEMENT_LIMIT", displayName: "Disbursement Limit", type: "number" },
      { key: "ACTUAL_DISBURSEMENT", displayName: "Actual Disbursement", type: "number" },
      { key: "INTEREST_RATE", displayName: "Interest Rate", type: "number" },
      { key: "START_DT", displayName: "Start Date", type: "date" },
      { key: "MATURITY_DT", displayName: "Maturity Date", type: "date" },
      { key: "LOAN_STATUS", displayName: "Status", type: "string" },
    ];

    if (format === "excel") {
      const excelPath = await generateExcelReport(loans, "loan", fields, "Loan Report");
      return res.download(excelPath, "Loan_Report.xlsx", (err) => {
        cleanupReportFiles(excelPath);
        if (err) {
          console.error("Error sending Excel file:", err);
          res.status(500).json({ message: "Failed to download Excel" });
        }
      });
    }

    if (format === "pdf") {
      return generateReport("loan", loans, fields, "Loan Report", res);
    }

    res.json(loans);
  } catch (err) {
    console.error("Error generating loan report:", err);
    res.status(500).json({ message: "Error generating loan report" });
  }
});

/**
 * Term Deposit Report
 * GET /term-deposits
 */
router.get("/term-deposits", async (req, res) => {
  try {
    const { format = "json", acctNo } = req.query;
    const query = acctNo ? { ACCT_NO: acctNo } : {};

    const deposits = await TermDeposit.find(query).lean();

    if (acctNo && deposits.length === 0) {
      return res.status(404).json({ message: `No Term Deposit found for ACCT_NO: ${acctNo}` });
    }

    const fields = [
      { key: "ACCT_NO", displayName: "Account Number", type: "string" },
      { key: "CUST_ID", displayName: "Customer ID", type: "string" },
      { key: "ACCT_NM", displayName: "Account Name", type: "string" },
      { key: "CUST_NM", displayName: "Customer Name", type: "string" },
      { key: "TERM", displayName: "Term", type: "number" },
      { key: "START_DT", displayName: "Start Date", type: "date" },
      { key: "MATURITY_DT", displayName: "Maturity Date", type: "date" },
      { key: "NOTICE_AMOUNT", displayName: "Principal Amount", type: "number" },
      { key: "EFFECTIVE_RATE", displayName: "Interest Rate", type: "number" },
      { key: "INTEREST_PAYMENT_STATUS", displayName: "Interest Payment Status", type: "string" },
      { key: "UPFRONT_INTEREST_AMOUNT", displayName: "Upfront Interest Amount", type: "number" },
    ];

    if (format === "excel") {
      const fileName = acctNo ? `TermDeposit_${acctNo}.xlsx` : "TermDeposit_Report.xlsx";
      const excelPath = await generateExcelReport(deposits, "term-deposit", fields, "Term Deposit Report");
      return res.download(excelPath, fileName, (err) => {
        cleanupReportFiles(excelPath);
        if (err) {
          console.error("Error sending Excel file:", err);
          res.status(500).json({ message: "Failed to download Excel" });
        }
      });
    }

    if (format === "pdf") {
      const fileName = acctNo ? `term-deposit_${acctNo}` : "term-deposit";
      return generateReport(fileName, deposits, fields, "Term Deposit Report", res);
    }

    res.json(deposits);
  } catch (err) {
    console.error("Error generating term deposit report:", err);
    res.status(500).json({ message: "Error generating term deposit report" });
  }
});

/**
 * Term Deposit Contract Letter (PDF)
 */
router.get("/term-deposit/:acctNo/pdf", async (req, res) => {
  try {
    const { acctNo } = req.params;

    const termDeposit = await TermDeposit.findOne({ ACCT_NO: acctNo });
    if (!termDeposit) {
      return res.status(404).json({ message: `No Term Deposit found for ACCT_NO: ${acctNo}` });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=TermDeposit_${acctNo}.pdf`);

    await generateTermDepositContractLetter(termDeposit, res);
  } catch (error) {
    console.error("Error generating contract letter:", error);
    res.status(500).json({ message: "Error generating contract letter" });
  }
});

/**
 * Term Deposit Excel Report
 */
router.get("/term-deposit/:acctNo/excel", async (req, res) => {
  try {
    const { acctNo } = req.params;

    const termDeposit = await TermDeposit.findOne({ ACCT_NO: acctNo }).lean();
    if (!termDeposit) {
      return res.status(404).json({ message: `No Term Deposit found for ACCT_NO: ${acctNo}` });
    }

    const fields = [
      { key: "ACCT_NO", displayName: "Account Number", type: "string" },
      { key: "ACCT_NM", displayName: "Account Name", type: "string" },
      { key: "CUST_NM", displayName: "Customer Name", type: "string" },
      { key: "TERM", displayName: "Term (Months)", type: "number" },
      { key: "START_DT", displayName: "Start Date", type: "date" },
      { key: "MATURITY_DT", displayName: "Maturity Date", type: "date" },
      { key: "NOTICE_AMOUNT", displayName: "Principal Amount", type: "number" },
      { key: "EFFECTIVE_RATE", displayName: "Interest Rate", type: "number" },
      { key: "INTEREST_PAYMENT_STATUS", displayName: "Interest Payment Status", type: "string" },
      { key: "UPFRONT_INTEREST_AMOUNT", displayName: "Upfront Interest Amount", type: "number" },
    ];

    const excelPath = await generateExcelReport([termDeposit], "TermDeposit", fields, "Term Deposit Report");
    res.download(excelPath, `TermDeposit_${acctNo}.xlsx`, (err) => {
      cleanupReportFiles(excelPath);
      if (err) {
        console.error("Error sending Excel file:", err);
        res.status(500).json({ message: "Error generating Excel report" });
      }
    });
  } catch (error) {
    console.error("Error generating Excel report:", error);
    res.status(500).json({ message: "Error generating Excel report" });
  }
});

// ============================================
// LOAN DISBURSEMENT REPORT
// ============================================
router.get('/loan-disbursements', localAuthenticate, asyncHandler(async (req, res) => {
  const {
    startDate,
    endDate,
    status,
    format = 'json'
  } = req.query;

  let whereClause = '';
  const replacements = [];

  if (startDate && endDate) {
    whereClause += ' AND DATE(ld.created_at) BETWEEN ? AND ?';
    replacements.push(startDate, endDate);
  } else if (startDate) {
    whereClause += ' AND DATE(ld.created_at) >= ?';
    replacements.push(startDate);
  } else if (endDate) {
    whereClause += ' AND DATE(ld.created_at) <= ?';
    replacements.push(endDate);
  }

  if (status) {
    whereClause += ' AND ld.s_t_a_t_u_s = ?';
    replacements.push(status);
  }

  const query = `
    SELECT
      ld.id AS disbursement_id,
      ld.a_c_c_t__n_o AS loan_account_number,
      ld.a_p_p_l__i_d AS application_id,
      ld.CUST_ID AS customer_id,
      c.CUST_NM AS customer_name,
      c.EMAIL_ADDRESS AS customer_email,
      c.PHONE_NO AS customer_phone,
      c.HOME_ADDRESS AS customer_address,
      ld.i_n_t_e_r_e_s_t__r_a_t_e AS interest_rate,
      ld.t_e_r_m__v_a_l_u_e AS term_value,
      ld.t_e_r_m__c_d AS term_code,
      ld.a_m_o_u_n_t AS disbursed_amount,
      ld.l_o_a_n__a_c_c_o_u_n_t__i_d AS loan_account_id,
      ld.r_e_p_a_y_m_e_n_t__s_c_h_e_d_u_l_e__i_d AS repayment_schedule_id,
      ld.g_u_a_r_a_n_t_o_r__i_d AS guarantor_id,
      g.GUARANTOR_ID AS guarantor_number,
      g.full_name AS guarantor_name,
      g.phone_number AS guarantor_phone,
      ld.p_r_o_d__i_d AS product_id,
      lp.name AS product_name,
      lp.PRODUCT_TYPE AS product_type,
      ld.p_r_o_d_u_c_t__t_y_p_e AS product_category,
      ld.s_t_a_t_u_s AS disbursement_status,
      ld.created_at AS disbursement_date,
      ld.updated_at AS last_updated,
      la.a_c_c_t__n_m AS loan_account_name,
      la.l_o_a_n__s_t_a_t_u_s AS loan_status
    FROM loan_disbursements ld
    LEFT JOIN customers c ON ld.CUST_ID = c.CUST_ID
    LEFT JOIN loan_accounts la ON ld.l_o_a_n__a_c_c_o_u_n_t__i_d = la.id
    LEFT JOIN loan_product lp ON ld.p_r_o_d__i_d = lp.PROD_ID
    LEFT JOIN guarantors g ON ld.g_u_a_r_a_n_t_o_r__i_d = g.id
    WHERE 1=1
    ${whereClause}
    ORDER BY ld.created_at DESC
  `;

  const results = await sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.SELECT,
    timeout: 30000
  });

  const fields = [
    { key: 'disbursement_id', displayName: 'Disbursement ID', type: 'number' },
    { key: 'loan_account_number', displayName: 'Loan Account Number', type: 'string' },
    { key: 'application_id', displayName: 'Application ID', type: 'string' },
    { key: 'customer_id', displayName: 'Customer ID', type: 'string' },
    { key: 'customer_name', displayName: 'Customer Name', type: 'string' },
    { key: 'customer_email', displayName: 'Customer Email', type: 'string' },
    { key: 'customer_phone', displayName: 'Customer Phone', type: 'string' },
    { key: 'customer_address', displayName: 'Customer Address', type: 'string' },
    { key: 'interest_rate', displayName: 'Interest Rate (%)', type: 'number' },
    { key: 'term_value', displayName: 'Term Value', type: 'number' },
    { key: 'term_code', displayName: 'Term Code', type: 'string' },
    { key: 'disbursed_amount', displayName: 'Disbursed Amount (₦)', type: 'number' },
    { key: 'loan_account_name', displayName: 'Loan Account Name', type: 'string' },
    { key: 'loan_status', displayName: 'Loan Status', type: 'string' },
    { key: 'guarantor_id', displayName: 'Guarantor ID', type: 'number' },
    { key: 'guarantor_number', displayName: 'Guarantor Number', type: 'string' },
    { key: 'guarantor_name', displayName: 'Guarantor Name', type: 'string' },
    { key: 'guarantor_phone', displayName: 'Guarantor Phone', type: 'string' },
    { key: 'product_id', displayName: 'Product ID', type: 'string' },
    { key: 'product_name', displayName: 'Product Name', type: 'string' },
    { key: 'product_type', displayName: 'Product Type', type: 'string' },
    { key: 'product_category', displayName: 'Product Category', type: 'string' },
    { key: 'disbursement_status', displayName: 'Status', type: 'string' },
    { key: 'disbursement_date', displayName: 'Disbursement Date', type: 'date' },
    { key: 'last_updated', displayName: 'Last Updated', type: 'date' }
  ];

  if (format === 'excel') {
    const fileName = `loan_disbursements_${startDate || 'all'}_${endDate || 'all'}.xlsx`;
    const excelPath = await generateExcelReport(results, 'loan_disbursements', fields, 'Loan Disbursement Report');
    return res.download(excelPath, fileName, (err) => {
      cleanupReportFiles(excelPath);
      if (err) {
        console.error('Error sending Excel file:', err);
        res.status(500).json({ message: 'Failed to download Excel' });
      }
    });
  }

  if (format === 'pdf') {
    const fileName = `loan_disbursements_${startDate || 'all'}_${endDate || 'all'}.pdf`;
    return generateReport('loan_disbursements', results, fields, 'Loan Disbursement Report', res, fileName);
  }

  res.json({
    success: true,
    data: results,
    total_records: results.length,
    filters: { startDate, endDate, status },
    generated_at: new Date().toISOString()
  });
}));

// ============================================
// INSTALLMENT SUMMARY (Stored Procedure)
// ============================================

router.post('/installment-summary', async (req, res) => {
  const { loan_account_number } = req.body;

  if (!loan_account_number) {
    return res.status(400).json({
      success: false,
      message: 'loan_account_number is required'
    });
  }

  try {
    const [summaryData] = await sequelize.query(`
      SELECT 
        COUNT(*) AS total_installments_paid,
        SUM(principal_amount) AS total_principal_paid,
        SUM(interest_amount) AS total_interest_paid,
        SUM(penalty_amount) AS total_penalty_paid,
        SUM(total_amount) AS total_amount_paid,
        MIN(repayment_date) AS first_payment_date,
        MAX(repayment_date) AS last_payment_date
      FROM loan_repayments
      WHERE loan_account_number = :loan_account_number
        AND status = 'COMPLETED'
    `, {
      replacements: { loan_account_number: loan_account_number },
      type: sequelize.QueryTypes.SELECT
    });

    const result = summaryData || {
      total_installments_paid: 0,
      total_principal_paid: 0,
      total_interest_paid: 0,
      total_penalty_paid: 0,
      total_amount_paid: 0,
      first_payment_date: null,
      last_payment_date: null
    };

    res.json({
      success: true,
      data: result,
      message: 'Report generated successfully'
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
});

// ============================================
// LOAN ACCOUNTS FOR DROPDOWN
// ============================================

router.get('/loans/accounts', async (req, res) => {
  try {
    const [accounts] = await sequelize.query(`
      SELECT id, a_c_c_t__n_o, a_c_c_t__n_m, l_o_a_n__s_t_a_t_u_s 
      FROM loan_accounts 
      ORDER BY id DESC 
      LIMIT 50
    `);

    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    console.error('Error fetching loan accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loan accounts'
    });
  }
});

// ============================================
// ALL LOANS REPAYMENT STATUS (VIEW)
// ============================================

router.get('/reports/all-loans-status', async (req, res) => {
  try {
    const results = await sequelize.query(`
      SELECT * FROM vw_all_loans_repayment_status
      ORDER BY id
    `, {
      type: sequelize.QueryTypes.SELECT
    });
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LOAN REPAYMENTS BY ACCOUNT NUMBER (PRIMARY ENDPOINT)
// ============================================

router.get('/reports/loan-repayments/:accountNumber', async (req, res) => {
  const { accountNumber } = req.params;
  try {
    const loanAccount = await sequelize.query(`
      SELECT 
        id,
        a_c_c_t__n_o as account_number,
        a_c_c_t__n_m as account_name,
        CUST_ID as customer_id,
        a_m_o_u_n_t as loan_amount,
        l_o_a_n__s_t_a_t_u_s as loan_status,
        o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l as outstanding_principal,
        a_c_c_r_u_e_d__i_n_t_e_r_e_s_t as accrued_interest,
        t_o_t_a_l__r_e_p_a_i_d__a_m_o_u_n_t as total_repaid
      FROM loan_accounts 
      WHERE a_c_c_t__n_o = ?
    `, {
      replacements: [accountNumber],
      type: sequelize.QueryTypes.SELECT
    });
    
    if (!loanAccount || loanAccount.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: `Loan account with number ${accountNumber} not found` 
      });
    }
    
    const loanId = loanAccount[0].id;
    
    const repayments = await sequelize.query(`
      SELECT 
        id,
        installment_number,
        repayment_date,
        principal_amount,
        interest_amount,
        penalty_amount,
        total_amount,
        status,
        transaction_reference,
        created_at
      FROM loan_repayments 
      WHERE loan_account_id = ?
      ORDER BY installment_number ASC
    `, {
      replacements: [loanId],
      type: sequelize.QueryTypes.SELECT
    });
    
    const summary = {
      total_repayments: repayments.length,
      total_principal_paid: repayments.reduce((sum, r) => sum + (parseFloat(r.principal_amount) || 0), 0),
      total_interest_paid: repayments.reduce((sum, r) => sum + (parseFloat(r.interest_amount) || 0), 0),
      total_penalty_paid: repayments.reduce((sum, r) => sum + (parseFloat(r.penalty_amount) || 0), 0),
      total_amount_paid: repayments.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0),
      first_payment_date: repayments.length > 0 ? repayments[0]?.repayment_date : null,
      last_payment_date: repayments.length > 0 ? repayments[repayments.length - 1]?.repayment_date : null
    };
    
    res.json({
      success: true,
      message: 'Loan repayment report generated successfully',
      data: {
        loan_info: loanAccount[0],
        summary: summary,
        repayments: repayments,
        total_count: repayments.length
      }
    });
  } catch (error) {
    console.error('Error fetching loan repayments:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch loan repayments',
      error: error.message 
    });
  }
});

// ============================================
// DETAILED LOAN REPAYMENT REPORT (BY ACCOUNT NUMBER)
// ============================================

router.get('/reports/loan-repayment-details/:accountNumber', async (req, res) => {
  const { accountNumber } = req.params;
  try {
    const loanAccount = await sequelize.query(`
      SELECT 
        id,
        a_c_c_t__n_o as account_number,
        a_c_c_t__n_m as account_name,
        CUST_ID as customer_id,
        a_m_o_u_n_t as loan_amount,
        l_o_a_n__s_t_a_t_u_s as loan_status,
        o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l as outstanding_principal,
        a_c_c_r_u_e_d__i_n_t_e_r_e_s_t as accrued_interest,
        t_e_r_m__v_a_l_u_e as total_installments,
        PAYMENTS_MADE as payments_made,
        TOTAL_REPAID_AMOUNT as total_repaid,
        LAST_REPAYMENT_DATE as last_repayment_date,
        d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e as disbursement_date,
        m_a_t_u_r_i_t_y__d_t as maturity_date
      FROM loan_accounts 
      WHERE a_c_c_t__n_o = ?
    `, {
      replacements: [accountNumber],
      type: sequelize.QueryTypes.SELECT
    });
    
    if (!loanAccount || loanAccount.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: `Loan account with number ${accountNumber} not found` 
      });
    }
    
    const loan = loanAccount[0];
    
    const repayments = await sequelize.query(`
      SELECT 
        id,
        installment_number,
        repayment_date,
        principal_amount,
        interest_amount,
        penalty_amount,
        total_amount,
        status,
        transaction_reference,
        created_at,
        customer_name
      FROM loan_repayments 
      WHERE loan_account_id = ?
      ORDER BY repayment_date DESC
    `, {
      replacements: [loan.id],
      type: sequelize.QueryTypes.SELECT
    });
    
    const schedule = await sequelize.query(`
      SELECT 
        id,
        installments_json,
        status as schedule_status,
        created_at,
        updated_at
      FROM repayment_schedules 
      WHERE loan_account_id = ?
    `, {
      replacements: [loan.id],
      type: sequelize.QueryTypes.SELECT
    });
    
    const monthly_trend = await sequelize.query(`
      SELECT 
        DATE_FORMAT(repayment_date, '%Y-%m') as month,
        COUNT(*) as payment_count,
        SUM(total_amount) as total_amount,
        SUM(principal_amount) as total_principal,
        SUM(interest_amount) as total_interest
      FROM loan_repayments 
      WHERE loan_account_id = ?
        AND status = 'COMPLETED'
      GROUP BY DATE_FORMAT(repayment_date, '%Y-%m')
      ORDER BY month DESC
    `, {
      replacements: [loan.id],
      type: sequelize.QueryTypes.SELECT
    });
    
    const expected_total = Math.abs(parseFloat(loan.loan_amount)) + parseFloat(loan.accrued_interest || 0);
    const actual_paid = repayments.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0);
    const remaining_balance = Math.max(0, expected_total - actual_paid);
    
    res.json({
      success: true,
      message: 'Loan repayment details generated successfully',
      data: {
        loan_details: {
          id: loan.id,
          account_number: loan.account_number,
          account_name: loan.account_name,
          customer_id: loan.customer_id,
          loan_amount: Math.abs(parseFloat(loan.loan_amount) || 0),
          loan_status: loan.loan_status,
          outstanding_principal: Math.abs(parseFloat(loan.outstanding_principal) || 0),
          accrued_interest: parseFloat(loan.accrued_interest) || 0,
          total_installments: loan.total_installments || 0,
          payments_made: loan.payments_made || 0,
          total_repaid: parseFloat(loan.total_repaid) || 0,
          last_repayment_date: loan.last_repayment_date,
          disbursement_date: loan.disbursement_date,
          maturity_date: loan.maturity_date,
          completion_percentage: loan.total_installments > 0 
            ? ((loan.payments_made || 0) / loan.total_installments * 100).toFixed(2)
            : 0
        },
        financial_summary: {
          expected_total: expected_total,
          actual_paid: actual_paid,
          remaining_balance: remaining_balance,
          payment_progress: expected_total > 0 ? ((actual_paid / expected_total) * 100).toFixed(2) : 0
        },
        repayments: repayments,
        repayment_summary: {
          total_repayments: repayments.length,
          total_principal_paid: repayments.reduce((sum, r) => sum + (parseFloat(r.principal_amount) || 0), 0),
          total_interest_paid: repayments.reduce((sum, r) => sum + (parseFloat(r.interest_amount) || 0), 0),
          total_penalty_paid: repayments.reduce((sum, r) => sum + (parseFloat(r.penalty_amount) || 0), 0),
          total_amount_paid: actual_paid,
          first_payment_date: repayments.length > 0 ? repayments[repayments.length - 1]?.repayment_date : null,
          last_payment_date: repayments.length > 0 ? repayments[0]?.repayment_date : null
        },
        monthly_trend: monthly_trend,
        has_schedule: schedule.length > 0,
        schedule: schedule.length > 0 ? schedule[0] : null,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching loan repayment details:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch loan repayment details',
      error: error.message 
    });
  }
});

// ============================================
// ALL LOANS REPAYMENT SUMMARY
// ============================================

router.get('/reports/all-loans-repayment-summary', async (req, res) => {
  try {
    const loans = await sequelize.query(`
      SELECT 
        la.id as loan_id,
        la.a_c_c_t__n_o as account_number,
        la.a_c_c_t__n_m as account_name,
        la.CUST_ID as customer_id,
        la.a_m_o_u_n_t as loan_amount,
        la.l_o_a_n__s_t_a_t_u_s as loan_status,
        la.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l as outstanding_principal,
        la.a_c_c_r_u_e_d__i_n_t_e_r_e_s_t as accrued_interest,
        la.t_e_r_m__v_a_l_u_e as total_installments,
        la.PAYMENTS_MADE as payments_made,
        la.TOTAL_REPAID_AMOUNT as total_repaid,
        la.LAST_REPAYMENT_DATE as last_repayment_date
      FROM loan_accounts la
      ORDER BY la.id
    `, {
      type: sequelize.QueryTypes.SELECT
    });
    
    const results = [];
    for (const loan of loans) {
      const repayments = await sequelize.query(`
        SELECT 
          COUNT(*) as repayment_count,
          SUM(principal_amount) as total_principal_paid,
          SUM(interest_amount) as total_interest_paid,
          SUM(penalty_amount) as total_penalty_paid,
          SUM(total_amount) as total_amount_paid
        FROM loan_repayments 
        WHERE loan_account_id = ?
        AND status = 'COMPLETED'
      `, {
        replacements: [loan.loan_id],
        type: sequelize.QueryTypes.SELECT
      });
      
      results.push({
        ...loan,
        repayment_summary: repayments[0] || {
          repayment_count: 0,
          total_principal_paid: 0,
          total_interest_paid: 0,
          total_penalty_paid: 0,
          total_amount_paid: 0
        },
        completion_percentage: loan.total_installments > 0 
          ? ((loan.payments_made || 0) / loan.total_installments * 100).toFixed(2)
          : 0
      });
    }
    
    const overall_totals = {
      total_loans: loans.length,
      total_disbursed: loans.reduce((sum, l) => sum + (parseFloat(l.loan_amount) || 0), 0),
      total_repaid: results.reduce((sum, r) => sum + (parseFloat(r.repayment_summary.total_amount_paid) || 0), 0),
      total_outstanding: results.reduce((sum, r) => sum + (Math.abs(parseFloat(r.outstanding_principal)) || 0), 0),
      total_interest_paid: results.reduce((sum, r) => sum + (parseFloat(r.repayment_summary.total_interest_paid) || 0), 0),
      active_loans: loans.filter(l => l.loan_status === 'ACTIVE').length,
      closed_loans: loans.filter(l => l.loan_status === 'CLOSED').length
    };
    
    res.json({
      success: true,
      message: 'All loans repayment summary generated successfully',
      data: {
        loans: results,
        overall_totals: overall_totals,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching all loans repayment summary:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch loans repayment summary',
      error: error.message 
    });
  }
});

// ============================================
// DETAILED LOAN REPAYMENT REPORT (by identifier)
// ============================================

router.get('/reports/loan-repayment-details/:identifier', async (req, res) => {
  const { identifier } = req.params;
  try {
    let loanAccount = null;
    
    if (/^\d+$/.test(identifier)) {
      loanAccount = await sequelize.query(`
        SELECT 
          id,
          a_c_c_t__n_o as account_number,
          a_c_c_t__n_m as account_name,
          CUST_ID as customer_id,
          a_m_o_u_n_t as loan_amount,
          l_o_a_n__s_t_a_t_u_s as loan_status,
          o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l as outstanding_principal,
          a_c_c_r_u_e_d__i_n_t_e_r_e_s_t as accrued_interest,
          t_e_r_m__v_a_l_u_e as total_installments,
          PAYMENTS_MADE as payments_made,
          TOTAL_REPAID_AMOUNT as total_repaid,
          LAST_REPAYMENT_DATE as last_repayment_date,
          d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e as disbursement_date,
          m_a_t_u_r_i_t_y__d_t as maturity_date
        FROM loan_accounts 
        WHERE id = ? OR a_c_c_t__n_o = ? OR ACCT_NO = ?
      `, {
        replacements: [parseInt(identifier), identifier, identifier],
        type: sequelize.QueryTypes.SELECT
      });
    } else {
      loanAccount = await sequelize.query(`
        SELECT 
          id,
          a_c_c_t__n_o as account_number,
          a_c_c_t__n_m as account_name,
          CUST_ID as customer_id,
          a_m_o_u_n_t as loan_amount,
          l_o_a_n__s_t_a_t_u_s as loan_status,
          o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l as outstanding_principal,
          a_c_c_r_u_e_d__i_n_t_e_r_e_s_t as accrued_interest,
          t_e_r_m__v_a_l_u_e as total_installments,
          PAYMENTS_MADE as payments_made,
          TOTAL_REPAID_AMOUNT as total_repaid,
          LAST_REPAYMENT_DATE as last_repayment_date,
          d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e as disbursement_date,
          m_a_t_u_r_i_t_y__d_t as maturity_date
        FROM loan_accounts 
        WHERE a_c_c_t__n_o = ? OR ACCT_NO = ?
      `, {
        replacements: [identifier, identifier],
        type: sequelize.QueryTypes.SELECT
      });
    }
    
    if (!loanAccount || loanAccount.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: `Loan account not found for identifier: ${identifier}` 
      });
    }
    
    const loan = loanAccount[0];
    
    const repayments = await sequelize.query(`
      SELECT 
        id,
        installment_number,
        repayment_date,
        principal_amount,
        interest_amount,
        penalty_amount,
        total_amount,
        status,
        transaction_reference,
        created_at,
        customer_name
      FROM loan_repayments 
      WHERE loan_account_id = ?
      ORDER BY repayment_date DESC
    `, {
      replacements: [loan.id],
      type: sequelize.QueryTypes.SELECT
    });
    
    const schedule = await sequelize.query(`
      SELECT 
        id,
        installments_json,
        status as schedule_status,
        created_at,
        updated_at
      FROM repayment_schedules 
      WHERE loan_account_id = ?
    `, {
      replacements: [loan.id],
      type: sequelize.QueryTypes.SELECT
    });
    
    const monthly_trend = await sequelize.query(`
      SELECT 
        DATE_FORMAT(repayment_date, '%Y-%m') as month,
        COUNT(*) as payment_count,
        SUM(total_amount) as total_amount,
        SUM(principal_amount) as total_principal,
        SUM(interest_amount) as total_interest
      FROM loan_repayments 
      WHERE loan_account_id = ?
        AND status = 'COMPLETED'
      GROUP BY DATE_FORMAT(repayment_date, '%Y-%m')
      ORDER BY month DESC
    `, {
      replacements: [loan.id],
      type: sequelize.QueryTypes.SELECT
    });
    
    const expected_total = parseFloat(loan.loan_amount) + parseFloat(loan.accrued_interest || 0);
    const actual_paid = repayments.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0);
    const remaining_balance = Math.max(0, expected_total - actual_paid);
    
    res.json({
      success: true,
      message: 'Loan repayment details generated successfully',
      data: {
        loan_details: {
          id: loan.id,
          account_number: loan.account_number,
          account_name: loan.account_name,
          customer_id: loan.customer_id,
          loan_amount: parseFloat(loan.loan_amount) || 0,
          loan_status: loan.loan_status,
          outstanding_principal: Math.abs(parseFloat(loan.outstanding_principal) || 0),
          accrued_interest: parseFloat(loan.accrued_interest) || 0,
          total_installments: loan.total_installments || 0,
          payments_made: loan.payments_made || 0,
          total_repaid: parseFloat(loan.total_repaid) || 0,
          last_repayment_date: loan.last_repayment_date,
          disbursement_date: loan.disbursement_date,
          maturity_date: loan.maturity_date,
          completion_percentage: loan.total_installments > 0 
            ? ((loan.payments_made || 0) / loan.total_installments * 100).toFixed(2)
            : 0
        },
        financial_summary: {
          expected_total: expected_total,
          actual_paid: actual_paid,
          remaining_balance: remaining_balance,
          payment_progress: expected_total > 0 ? ((actual_paid / expected_total) * 100).toFixed(2) : 0
        },
        repayments: repayments,
        repayment_summary: {
          total_repayments: repayments.length,
          total_principal_paid: repayments.reduce((sum, r) => sum + (parseFloat(r.principal_amount) || 0), 0),
          total_interest_paid: repayments.reduce((sum, r) => sum + (parseFloat(r.interest_amount) || 0), 0),
          total_penalty_paid: repayments.reduce((sum, r) => sum + (parseFloat(r.penalty_amount) || 0), 0),
          total_amount_paid: actual_paid,
          first_payment_date: repayments.length > 0 ? repayments[repayments.length - 1]?.repayment_date : null,
          last_payment_date: repayments.length > 0 ? repayments[0]?.repayment_date : null
        },
        monthly_trend: monthly_trend,
        has_schedule: schedule.length > 0,
        schedule: schedule.length > 0 ? schedule[0] : null,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching loan repayment details:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch loan repayment details',
      error: error.message 
    });
  }
});

// ==================== NEW: Inward Payments Report Endpoint ====================
router.get('/reports/inward-payments', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      status,
      search,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereClause = {};

    if (startDate && endDate) {
      whereClause.v_a_l_u_e__d_t = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    } else if (startDate) {
      whereClause.v_a_l_u_e__d_t = { [Op.gte]: new Date(startDate) };
    } else if (endDate) {
      whereClause.v_a_l_u_e__d_t = { [Op.lte]: new Date(endDate) };
    }

    if (status) whereClause.r_e_c__s_t = status;

    if (search) {
      whereClause[Op.or] = [
        { x_f_e_r__r_e_f: { [Op.like]: `%${search}%` } },
        { b_e_n_e_f_i_c_i_a_r_y__a_c_c_t: { [Op.like]: `%${search}%` } },
        { b_e_n_e_f_i_c_i_a_r_y__n_m: { [Op.like]: `%${search}%` } },
        { r_e_m_i_t_t_e_r__n_m: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await InwardFundsTransfer.findAndCountAll({
      where: whereClause,
      attributes: [
        ['i_n_w_d__f_u_n_d_s__x_f_e_r__i_d', 'INWD_FUNDS_XFER_ID'],
        ['x_f_e_r__r_e_f', 'XFER_REF'],
        ['p_a_y_m_e_n_t__m_t_d__c_d', 'PAYMENT_MTD_CD'],
        ['x_f_e_r__c_r_n_c_y__i_d', 'XFER_CRNCY_ID'],
        ['x_f_e_r__a_m_t', 'XFER_AMT'],
        ['s_e_n_d_i_n_g__b_a_n_k__c_h_r_g', 'SENDING_BANK_CHRG'],
        ['r_e_c_i_e_v_i_n_g__b_a_n_k__c_h_r_g', 'RECIEVING_BANK_CHRG'],
        ['t_o_t_a_l__c_h_r_g', 'TOTAL_CHRG'],
        ['n_e_t__a_m_t__x_f_e_r_e_d', 'NET_AMT_XFERED'],
        ['v_a_l_u_e__d_t', 'VALUE_DT'],
        ['p_r_i_o_r_i_t_y__l_e_v_e_l__c_d', 'PRIORITY_LEVEL_CD'],
        ['b_e_n_e_f_i_c_i_a_r_y__n_m', 'BENEFICIARY_NM'],
        ['b_e_n_e_f_i_c_i_a_r_y__a_c_c_t', 'BENEFICIARY_ACCT'],
        ['b_e_n_e_f_i_c_i_a_r_y__b_a_n_k__n_m', 'BENEFICIARY_BANK_NM'],
        ['b_e_n_e_f_i_c_i_a_r_y__b_r_a_n_c_h', 'BENEFICIARY_BRANCH'],
        ['r_e_m_i_t_t_e_r__n_m', 'REMITTER_NM'],
        ['r_e_c__s_t', 'REC_ST'],
      ],
      limit: parseInt(limit),
      offset,
      order: [['c_r_e_a_t_e__d_t', 'DESC']],
      raw: true,
    });

    const payments = rows.map(row => ({
      INWD_FUNDS_XFER_ID: row.INWD_FUNDS_XFER_ID,
      XFER_REF: row.XFER_REF || null,
      PAYMENT_MTD_CD: row.PAYMENT_MTD_CD || null,
      XFER_CRNCY_ID: row.XFER_CRNCY_ID || null,
      XFER_AMT: parseFloat(row.XFER_AMT) || 0,
      SENDING_BANK_CHRG: parseFloat(row.SENDING_BANK_CHRG) || 0,
      RECIEVING_BANK_CHRG: parseFloat(row.RECIEVING_BANK_CHRG) || 0,
      TOTAL_CHRG: row.TOTAL_CHRG ? parseFloat(row.TOTAL_CHRG) : null,
      NET_AMT_XFERED: parseFloat(row.NET_AMT_XFERED) || 0,
      VALUE_DT: row.VALUE_DT ? new Date(row.VALUE_DT).toISOString() : null,
      PRIORITY_LEVEL_CD: row.PRIORITY_LEVEL_CD || null,
      BENEFICIARY_NM: row.BENEFICIARY_NM || null,
      BENEFICIARY_ACCT: row.BENEFICIARY_ACCT || null,
      BENEFICIARY_BANK_NM: row.BENEFICIARY_BANK_NM || null,
      BENEFICIARY_BRANCH: row.BENEFICIARY_BRANCH || null,
      REMITTER_NM: row.REMITTER_NM || null,
      REC_ST: row.REC_ST || null,
    }));

    const summaryResult = await InwardFundsTransfer.findOne({
      where: whereClause,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('i_n_w_d__f_u_n_d_s__x_f_e_r__i_d')), 'totalCount'],
        [sequelize.fn('SUM', sequelize.col('x_f_e_r__a_m_t')), 'totalAmount'],
        [sequelize.fn('AVG', sequelize.col('x_f_e_r__a_m_t')), 'averageAmount'],
      ],
      raw: true,
    });

    const totalCount = parseInt(summaryResult.totalCount) || 0;
    const totalAmount = parseFloat(summaryResult.totalAmount) || 0;
    const averageAmount = totalCount > 0 ? totalAmount / totalCount : 0;

    res.status(200).json({
      success: true,
      data: {
        payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit),
        },
        summary: { totalCount, totalAmount, averageAmount },
      },
    });
  } catch (error) {
    logger.error('Error fetching inward payments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch inward payments', error: error.message });
  }
});

export default router;