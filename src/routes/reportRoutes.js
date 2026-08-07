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
import { QueryTypes } from 'sequelize';

// Import Inward Funds Transfer models
import InwardFundsTransfer from "../models/InwardFundsTransfer.js";
import CustomerAccount from "../models/CustomerAccount.js";
import PendingGLTransaction from "../models/PendingGLTransaction.js";
import Customer from "../models/Customer.js";

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
    businessUnitId,
    format = 'json'
  } = req.query;

  let whereClause = '';
  const replacements = [];

  if (startDate && endDate) {
    whereClause += ' AND DATE(ld.disbursementDate) BETWEEN ? AND ?';
    replacements.push(startDate, endDate);
  } else if (startDate) {
    whereClause += ' AND DATE(ld.disbursementDate) >= ?';
    replacements.push(startDate);
  } else if (endDate) {
    whereClause += ' AND DATE(ld.disbursementDate) <= ?';
    replacements.push(endDate);
  }

  if (status) {
    whereClause += ' AND ld.status = ?';
    replacements.push(status);
  }

  if (businessUnitId) {
    whereClause += ' AND ld.businessUnitId = ?';
    replacements.push(businessUnitId);
  }

  const query = `
    SELECT
      ld.id AS disbursementId,
      ld.accountNumber AS loanAccountNumber,
      ld.applicationId AS applicationId,
      ld.customerId AS customerId,
      ld.accountName AS customerName,
      ld.interestRate AS interestRate,
      ld.termValue AS termValue,
      ld.termCode AS termCode,
      ld.amount AS disbursedAmount,
      ld.loanAccountId AS loanAccountId,
      ld.repaymentScheduleId AS repaymentScheduleId,
      ld.guarantorId AS guarantorId,
      g.GUARANTOR_ID AS guarantorNumber,
      g.full_name AS guarantorName,
      g.phone_number AS guarantorPhone,
      g.email AS guarantorEmail,
      ld.productId AS productId,
      lp.name AS productName,
      lp.product_type AS productType,
      lp.product_category AS productCategory,
      ld.productType AS disbursementProductType,
      ld.status AS disbursementStatus,
      ld.disbursementDate AS disbursementDate,
      ld.updatedAt AS lastUpdated,
      la.ACCT_NO AS loanAccountNo,
      la.LOAN_STATUS AS loanStatus,
      la.CUST_ID AS loanCustomerId,
      ld.emiAmount AS emiAmount,
      ld.totalInterest AS totalInterest,
      ld.totalRepayment AS totalRepayment,
      ld.netDisbursementAmount AS netDisbursementAmount,
      ld.feesAmount AS feesAmount,
      ld.upfrontInterestAmount AS upfrontInterestAmount,
      ld.startDate AS startDate,
      ld.maturityDate AS maturityDate,
      ld.paymentFrequency AS paymentFrequency,
      ld.calculationMethod AS calculationMethod,
      ld.transactionReference AS transactionReference,
      ld.createdBy AS createdBy,
      ld.approvedBy AS approvedBy,
      ld.approvalDate AS approvalDate,
      ld.executedBy AS executedBy,
      ld.executionDate AS executionDate,
      ld.disbursedBy AS disbursedBy,
      ld.businessUnitId AS businessUnitId,
      ld.primaryOfficerId AS primaryOfficerId,
      ld.repaymentSourceAccount AS repaymentSourceAccount,
      ld.loanCycle AS loanCycle,
      ld.disbursementType AS disbursementType,
      ld.createdAt AS createdAt,
      ld.borrowerAddress AS borrowerAddress,
      ld.remarks AS remarks,
      ld.failureReason AS failureReason,
      ld.cancellationReason AS cancellationReason,
      ld.transactionNotes AS transactionNotes,
      ld.interestConfiguration AS interestConfiguration,
      ld.repaymentScheduleJson AS repaymentScheduleJson
    FROM loan_disbursements ld
    LEFT JOIN loan_accounts la ON ld.loanAccountId = la.id
    LEFT JOIN loan_products lp ON ld.productId = lp.prod_id
    LEFT JOIN guarantors g ON ld.guarantorId = g.id
    WHERE 1=1
    ${whereClause}
    ORDER BY ld.disbursementDate DESC, ld.id DESC
  `;

  console.log('Executing query:', query);
  console.log('Replacements:', replacements);

  try {
    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
      timeout: 30000
    });

    console.log(`✅ Found ${results.length} disbursement records`);

    const fields = [
      { key: 'disbursementId', displayName: 'Disbursement ID', type: 'number' },
      { key: 'loanAccountNumber', displayName: 'Loan Account Number', type: 'string' },
      { key: 'applicationId', displayName: 'Application ID', type: 'string' },
      { key: 'customerId', displayName: 'Customer ID', type: 'string' },
      { key: 'customerName', displayName: 'Customer Name', type: 'string' },
      { key: 'interestRate', displayName: 'Interest Rate (%)', type: 'number' },
      { key: 'termValue', displayName: 'Term Value', type: 'number' },
      { key: 'termCode', displayName: 'Term Code', type: 'string' },
      { key: 'disbursedAmount', displayName: 'Disbursed Amount (₦)', type: 'number' },
      { key: 'emiAmount', displayName: 'EMI Amount (₦)', type: 'number' },
      { key: 'totalInterest', displayName: 'Total Interest (₦)', type: 'number' },
      { key: 'totalRepayment', displayName: 'Total Repayment (₦)', type: 'number' },
      { key: 'netDisbursementAmount', displayName: 'Net Disbursement (₦)', type: 'number' },
      { key: 'feesAmount', displayName: 'Fees (₦)', type: 'number' },
      { key: 'upfrontInterestAmount', displayName: 'Upfront Interest (₦)', type: 'number' },
      { key: 'loanAccountNo', displayName: 'Loan Account No', type: 'string' },
      { key: 'loanStatus', displayName: 'Loan Status', type: 'string' },
      { key: 'loanCustomerId', displayName: 'Loan Customer ID', type: 'string' },
      { key: 'guarantorId', displayName: 'Guarantor ID', type: 'number' },
      { key: 'guarantorNumber', displayName: 'Guarantor Number', type: 'string' },
      { key: 'guarantorName', displayName: 'Guarantor Name', type: 'string' },
      { key: 'guarantorPhone', displayName: 'Guarantor Phone', type: 'string' },
      { key: 'guarantorEmail', displayName: 'Guarantor Email', type: 'string' },
      { key: 'productId', displayName: 'Product ID', type: 'string' },
      { key: 'productName', displayName: 'Product Name', type: 'string' },
      { key: 'productType', displayName: 'Product Type', type: 'string' },
      { key: 'productCategory', displayName: 'Product Category', type: 'string' },
      { key: 'disbursementProductType', displayName: 'Disbursement Product Type', type: 'string' },
      { key: 'disbursementStatus', displayName: 'Disbursement Status', type: 'string' },
      { key: 'disbursementDate', displayName: 'Disbursement Date', type: 'date' },
      { key: 'startDate', displayName: 'Start Date', type: 'date' },
      { key: 'maturityDate', displayName: 'Maturity Date', type: 'date' },
      { key: 'approvalDate', displayName: 'Approval Date', type: 'date' },
      { key: 'executionDate', displayName: 'Execution Date', type: 'date' },
      { key: 'lastUpdated', displayName: 'Last Updated', type: 'date' },
      { key: 'createdAt', displayName: 'Created At', type: 'date' },
      { key: 'paymentFrequency', displayName: 'Payment Frequency', type: 'string' },
      { key: 'calculationMethod', displayName: 'Calculation Method', type: 'string' },
      { key: 'transactionReference', displayName: 'Transaction Reference', type: 'string' },
      { key: 'createdBy', displayName: 'Created By', type: 'string' },
      { key: 'approvedBy', displayName: 'Approved By', type: 'string' },
      { key: 'executedBy', displayName: 'Executed By', type: 'string' },
      { key: 'disbursedBy', displayName: 'Disbursed By', type: 'string' },
      { key: 'businessUnitId', displayName: 'Business Unit', type: 'string' },
      { key: 'primaryOfficerId', displayName: 'Primary Officer', type: 'string' },
      { key: 'repaymentSourceAccount', displayName: 'Repayment Source Account', type: 'string' },
      { key: 'loanCycle', displayName: 'Loan Cycle', type: 'number' },
      { key: 'disbursementType', displayName: 'Disbursement Type', type: 'string' },
      { key: 'borrowerAddress', displayName: 'Borrower Address', type: 'string' },
      { key: 'remarks', displayName: 'Remarks', type: 'string' },
      { key: 'failureReason', displayName: 'Failure Reason', type: 'string' },
      { key: 'cancellationReason', displayName: 'Cancellation Reason', type: 'string' },
      { key: 'transactionNotes', displayName: 'Transaction Notes', type: 'string' }
    ];

    if (format === 'excel') {
      const fileName = `loan_disbursements_${startDate || 'all'}_${endDate || 'all'}_${businessUnitId || 'all'}.xlsx`;
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
      const fileName = `loan_disbursements_${startDate || 'all'}_${endDate || 'all'}_${businessUnitId || 'all'}.pdf`;
      return generateReport('loan_disbursements', results, fields, 'Loan Disbursement Report', res, fileName);
    }

    res.json({
      success: true,
      data: results,
      total_records: results.length,
      filters: { startDate, endDate, status, businessUnitId },
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in loan disbursements report:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate loan disbursements report',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
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
// LOAN ACCOUNTS FOR DROPDOWN WITH PAGINATION
// ============================================

router.get('/loans/accounts', async (req, res) => {
  try {
    const { limit = 50, offset = 0, search = '' } = req.query;

    let whereClause = '';
    const replacements = [];

    if (search) {
      whereClause = ' WHERE acct_no LIKE ? OR acct_nm LIKE ?';
      replacements.push(`%${search}%`, `%${search}%`);
    }

    const accounts = await sequelize.query(`
      SELECT 
        id, 
        acct_no AS account_number, 
        acct_nm AS account_name, 
        loan_status AS loan_status,
        cust_id AS customer_id,
        outstanding_principal AS outstanding_principal
      FROM loan_accounts 
      ${whereClause}
      ORDER BY id DESC 
      LIMIT ? OFFSET ?
    `, {
      replacements: [...replacements, parseInt(limit), parseInt(offset)],
      type: sequelize.QueryTypes.SELECT
    });

    // Get total count for pagination
    const countResult = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM loan_accounts 
      ${whereClause}
    `, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: accounts,
      pagination: {
        total: countResult[0]?.total || 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error fetching loan accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loan accounts',
      error: error.message
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
      ORDER BY loan_account_id DESC
    `, {
      type: sequelize.QueryTypes.SELECT
    });
    
    res.json({
      success: true,
      data: results,
      total: results.length,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching all loans status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to fetch loan status report'
    });
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

// INWARD PAYMENTS REPORT ENDPOINT
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


// ============================================================
// Helper: Build the loan provision query (without JSON_TABLE)
// ============================================================
const buildLoanProvisionQuery = (filters = {}) => {
  const { branch, product, status } = filters;
  const conditions = ["la.LOAN_STATUS IN ('ACTIVE', 'OVERDUE', 'DISBURSED')"];
  const replacements = {};

  // Branch filter using BU_ID from customers table
  if (branch) {
    conditions.push('c.BU_ID = :branch');
    replacements.branch = branch;
  }
  
  if (product) {
    conditions.push('la.LOAN_PRODUCT_ID = :product');
    replacements.product = product;
  }
  
  // Status filter for provision
  if (status) {
    conditions.push('lp.status = :status');
    replacements.status = status;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      -- Customer Info
      c.CUST_ID AS customerId,
      CONCAT(COALESCE(c.FIRST_NAME, ''), ' ', COALESCE(c.LAST_NAME, '')) AS "Customer Name",
      c.GENDER_TY AS "Gender",
      c.BVN AS "BVN",
      c.INDUSTRY_CD AS industryCode,
      c.BU_ID AS "Branch Code",
      c.CREATED_BY AS "Account Officer",
      c.BU_ID AS "Branch",
      
      -- Loan Account Info
      la.ACCT_NO AS "Account Number",
      la.ACCT_NM AS accountName,
      la.AMOUNT AS "Disbursement Amount",
      la.DISBURSED_AMOUNT AS actualDisbursed,
      la.OUTSTANDING_PRINCIPAL AS "Principal Outstanding",
      la.ACCRUED_INTEREST AS "Accrued Interest",
      (ABS(la.OUTSTANDING_PRINCIPAL) + COALESCE(la.ACCRUED_INTEREST, 0)) AS "Ledger Balance",
      la.TOTAL_REPAID_AMOUNT AS totalRepaid,
      
      -- Provision Data
      COALESCE(lp.provision_amount, 0) AS "Provision Balance",
      lp.provision_rate AS "Provision PCT",
      lp.provision_date AS provisionDate,
      lp.gl_account AS provisionGLAccount,
      lp.status AS provisionStatus,
      lp.metadata AS provisionMetadata,
      
      -- Loan Status
      la.LOAN_STATUS AS loanStatus,
      la.SERVICING_STATUS AS servicingStatus,
      la.DISBURSEMENT_DATE AS "Disbursement Date",
      la.MATURITY_DT AS "Maturity Date",
      la.INTEREST_RATE AS interestRate,
      
      -- Product Info
      lp2.product_code AS productCode,
      lp2.name AS "Product",
      lp2.PROD_ID AS productId,
      lp2.product_type AS productType,
      
      -- Repayment Schedule Info
      rs.installments_json AS "Installment Schedule",
      rs.emi_amount AS "EMI Amount",
      rs.total_interest AS "Total Interest",
      rs.total_repayment AS "Total Repayment",
      
      -- Calculated Fields
      GREATEST(0, DATEDIFF(CURDATE(), COALESCE(la.DISBURSEMENT_DATE, la.APPLICATION_DATE, la.created_at))) AS "Days in Arrears",
      
      -- ✅ Simple arrears calculation based on loan status
      CASE 
        WHEN la.LOAN_STATUS = 'OVERDUE' THEN ABS(la.OUTSTANDING_PRINCIPAL)
        ELSE 0
      END AS "Principal Arrears",
      
      -- Loan Cycle
      la.loan_cycle AS "Loan Cycle",
      
      -- Guarantor Info
      g.guarantor_id AS "Guarantor ID",
      g.full_name AS "Guarantor Name",
      g.phone_number AS "Guarantor Phone",
      g.email AS "Guarantor Email",
      g.address AS "Guarantor Address",
      g.bvn AS "Guarantor BVN",
      g.id_number AS "Guarantor ID Number",
      g.id_type AS "Guarantor ID Type",
      g.relationship_to_borrower AS "Guarantor Relationship",
      g.verification_status AS "Guarantor Verification Status",
      g.net_worth AS "Guarantor Net Worth",
      la.guaranteed_amount AS "Guaranteed Amount",
      
      -- Provision Class (based on days since disbursement)
      CASE 
        WHEN DATEDIFF(CURDATE(), COALESCE(la.DISBURSEMENT_DATE, la.APPLICATION_DATE, la.created_at)) <= 30 THEN 'Standard'
        WHEN DATEDIFF(CURDATE(), COALESCE(la.DISBURSEMENT_DATE, la.APPLICATION_DATE, la.created_at)) BETWEEN 31 AND 60 THEN 'Watch'
        WHEN DATEDIFF(CURDATE(), COALESCE(la.DISBURSEMENT_DATE, la.APPLICATION_DATE, la.created_at)) BETWEEN 61 AND 90 THEN 'Substandard'
        WHEN DATEDIFF(CURDATE(), COALESCE(la.DISBURSEMENT_DATE, la.APPLICATION_DATE, la.created_at)) BETWEEN 91 AND 180 THEN 'Doubtful'
        ELSE 'Loss'
      END AS "Provision Class",
      
      -- Risk Category
      CASE 
        WHEN DATEDIFF(CURDATE(), COALESCE(la.DISBURSEMENT_DATE, la.APPLICATION_DATE, la.created_at)) <= 30 THEN 'Low Risk'
        WHEN DATEDIFF(CURDATE(), COALESCE(la.DISBURSEMENT_DATE, la.APPLICATION_DATE, la.created_at)) BETWEEN 31 AND 60 THEN 'Moderate Risk'
        WHEN DATEDIFF(CURDATE(), COALESCE(la.DISBURSEMENT_DATE, la.APPLICATION_DATE, la.created_at)) BETWEEN 61 AND 90 THEN 'High Risk'
        ELSE 'Critical Risk'
      END AS "Risk Category"
      
    FROM loan_accounts la
    
    -- Joins with CAST to avoid collation issues
    INNER JOIN customers c ON CAST(la.CUST_ID AS UNSIGNED) = CAST(c.CUST_ID AS UNSIGNED)
    LEFT JOIN loan_provisions lp ON lp.loan_account_id = la.id
    LEFT JOIN loan_products lp2 ON la.LOAN_PRODUCT_ID = lp2.PROD_ID
    LEFT JOIN repayment_schedules rs ON rs.loan_account_id = la.id
    LEFT JOIN guarantors g ON CAST(g.guarantor_id AS CHAR) = CAST(la.guarantor_internal_id AS CHAR)
    
    ${whereClause}
    ORDER BY la.DISBURSEMENT_DATE DESC, la.created_at DESC
  `;

  return { query, replacements };
};

// ============================================================
// Helper: Calculate Arrears from Installments JSON in JavaScript
// ============================================================
const calculateArrearsFromSchedule = (installmentsJson) => {
  if (!installmentsJson) return { totalArrears: 0, missedPayments: 0, overdueAmount: 0 };
  
  try {
    const installments = typeof installmentsJson === 'string' 
      ? JSON.parse(installmentsJson) 
      : installmentsJson;
    
    if (!Array.isArray(installments)) return { totalArrears: 0, missedPayments: 0, overdueAmount: 0 };
    
    const today = new Date();
    let totalArrears = 0;
    let missedPayments = 0;
    let overdueAmount = 0;
    
    installments.forEach(inst => {
      const dueDate = new Date(inst.dueDate);
      if (dueDate <= today) {
        // This installment is due or overdue
        const paymentAmount = (inst.principal || 0) + (inst.interest || 0);
        // Assuming no payments made yet, the full amount is overdue
        // In a real scenario, you'd subtract any payments made
        totalArrears += paymentAmount;
        overdueAmount += paymentAmount;
        missedPayments++;
      }
    });
    
    return { totalArrears, missedPayments, overdueAmount };
  } catch (error) {
    console.error('Error parsing installments JSON:', error);
    return { totalArrears: 0, missedPayments: 0, overdueAmount: 0 };
  }
};

// ============================================================
// GET /api/reports/loan-provision
// ============================================================
router.get('/loan-provision', async (req, res) => {
  try {
    // ✅ Set session collation to match your database
    await sequelize.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci', { 
      type: sequelize.QueryTypes.RAW 
    });
    
    await sequelize.query('SET SESSION collation_connection = utf8mb4_unicode_ci', {
      type: sequelize.QueryTypes.RAW
    });

    const { branch, product, status, page = 1, limit = 25, export: exportType } = req.query;
    const { query, replacements } = buildLoanProvisionQuery({ branch, product, status });

    console.log('📊 Loan Provision Query:', query);
    console.log('📊 Replacements:', replacements);

    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // ✅ Process results to calculate accurate arrears from schedule
    const processedResults = results.map(row => {
      const scheduleData = calculateArrearsFromSchedule(row["Installment Schedule"]);
      
      return {
        ...row,
        "Principal Arrears": scheduleData.totalArrears,
        "Missed Payments": scheduleData.missedPayments,
        "Overdue Amount": scheduleData.overdueAmount
      };
    });

    // Calculate totals
    const totals = {
      totalLoans: processedResults.length,
      totalDisbursed: 0,
      totalOutstanding: 0,
      totalProvision: 0,
      totalArrears: 0,
      totalMissedPayments: 0,
      loansWithProvision: processedResults.filter(r => r["Provision Balance"] !== null && parseFloat(r["Provision Balance"]) > 0).length,
    };

    processedResults.forEach(row => {
      totals.totalDisbursed += parseFloat(row["Disbursement Amount"] || row.actualDisbursed || 0);
      totals.totalOutstanding += parseFloat(row["Principal Outstanding"] || 0) + parseFloat(row["Accrued Interest"] || 0);
      totals.totalProvision += parseFloat(row["Provision Balance"] || 0);
      totals.totalArrears += parseFloat(row["Principal Arrears"] || 0);
      totals.totalMissedPayments += parseInt(row["Missed Payments"] || 0);
    });

    // If export requested, return full data
    if (exportType === 'true' || exportType === 'excel' || exportType === 'json') {
      return res.json({
        success: true,
        count: processedResults.length,
        totals,
        data: processedResults,
        exportReady: true
      });
    }

    // Pagination for UI
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 25;
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;
    const paginatedData = processedResults.slice(startIndex, endIndex);

    res.json({
      success: true,
      count: processedResults.length,
      totals,
      data: paginatedData,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: processedResults.length,
        totalPages: Math.ceil(processedResults.length / limitNum)
      },
      headers: [
        'Customer Name',
        'Account Number',
        'Disbursement Amount',
        'Ledger Balance',
        'Provision Balance',
        'Provision PCT',
        'Provision Class',
        'Days in Arrears',
        'Risk Category',
        'Principal Outstanding',
        'Principal Arrears',
        'Missed Payments',
        'Overdue Amount',
        'Accrued Interest',
        'Gender',
        'Branch Code',
        'Branch',
        'Account Officer',
        'Product',
        'Disbursement Date',
        'Maturity Date',
        'Loan Cycle',
        'BVN',
        'Guarantor ID',
        'Guarantor Name',
        'Guarantor Phone',
        'Guarantor Email',
        'Guarantor Relationship',
        'Guarantor Verification Status'
      ]
    });
  } catch (error) {
    console.error('❌ Loan provision report error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate loan provision report',
      details: error.message,
      sql: error.sql || null
    });
  }
});

// ============================================================
// GET /api/reports/loan-provision/summary
// ============================================================
router.get('/loan-provision/summary', async (req, res) => {
  try {
    // ✅ Set session collation
    await sequelize.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci', { 
      type: sequelize.QueryTypes.RAW 
    });
    await sequelize.query('SET SESSION collation_connection = utf8mb4_unicode_ci', {
      type: sequelize.QueryTypes.RAW
    });

    const { branch, product } = req.query;
    
    // ✅ Fetch data with installments_json
    let dataQuery = `
      SELECT 
        lp.status AS provisionStatus,
        lp.loan_account_id,
        rs.installments_json,
        la.OUTSTANDING_PRINCIPAL,
        la.ACCRUED_INTEREST,
        lp.provision_amount,
        lp.provision_rate,
        lp.provision_date,
        la.DISBURSEMENT_DATE,
        la.APPLICATION_DATE,
        la.created_at,
        la.LOAN_STATUS
      FROM loan_provisions lp
      JOIN loan_accounts la ON lp.loan_account_id = la.id
      INNER JOIN customers c ON CAST(la.CUST_ID AS UNSIGNED) = CAST(c.CUST_ID AS UNSIGNED)
      LEFT JOIN repayment_schedules rs ON rs.loan_account_id = la.id
      WHERE la.LOAN_STATUS IN ('ACTIVE', 'OVERDUE', 'DISBURSED')
        AND lp.status = 'ACTIVE'
    `;

    const replacements = {};

    if (branch) {
      dataQuery += ` AND c.BU_ID = :branch`;
      replacements.branch = branch;
    }

    if (product) {
      dataQuery += ` AND la.LOAN_PRODUCT_ID = :product`;
      replacements.product = product;
    }

    const results = await sequelize.query(dataQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // ✅ Process in JavaScript to calculate arrears
    const statusMap = {};
    let overallTotals = {
      totalProvision: 0,
      totalOutstandingPrincipal: 0,
      totalArrears: 0,
      totalCount: 0,
      standardCount: 0,
      watchCount: 0,
      substandardCount: 0,
      doubtfulCount: 0,
      lossCount: 0
    };

    results.forEach(row => {
      const status = row.provisionStatus || 'ACTIVE';
      
      if (!statusMap[status]) {
        statusMap[status] = {
          provisionStatus: status,
          count: 0,
          totalProvision: 0,
          totalOutstandingPrincipal: 0,
          totalArrears: 0,
          avgProvisionRate: 0,
          firstProvisionDate: null,
          lastProvisionDate: null,
          standardCount: 0,
          watchCount: 0,
          substandardCount: 0,
          doubtfulCount: 0,
          lossCount: 0,
          provisionRates: []
        };
      }

      const entry = statusMap[status];
      entry.count++;
      
      // Calculate arrears from schedule
      const scheduleArrears = calculateArrearsFromSchedule(row.installments_json);
      const principalOutstanding = parseFloat(row.OUTSTANDING_PRINCIPAL || 0);
      const provisionAmount = parseFloat(row.provision_amount || 0);
      const provisionRate = parseFloat(row.provision_rate || 0);
      
      entry.totalProvision += provisionAmount;
      entry.totalOutstandingPrincipal += principalOutstanding;
      entry.totalArrears += scheduleArrears.totalArrears;
      entry.provisionRates.push(provisionRate);
      
      // Provision Class based on days since disbursement
      const disbursementDate = row.DISBURSEMENT_DATE || row.APPLICATION_DATE || row.created_at;
      const daysSinceDisbursement = disbursementDate 
        ? Math.floor((new Date() - new Date(disbursementDate)) / (1000 * 60 * 60 * 24))
        : 0;
      
      if (daysSinceDisbursement <= 30) {
        entry.standardCount++;
        overallTotals.standardCount++;
      } else if (daysSinceDisbursement <= 60) {
        entry.watchCount++;
        overallTotals.watchCount++;
      } else if (daysSinceDisbursement <= 90) {
        entry.substandardCount++;
        overallTotals.substandardCount++;
      } else if (daysSinceDisbursement <= 180) {
        entry.doubtfulCount++;
        overallTotals.doubtfulCount++;
      } else {
        entry.lossCount++;
        overallTotals.lossCount++;
      }
      
      // Update overall totals
      overallTotals.totalProvision += provisionAmount;
      overallTotals.totalOutstandingPrincipal += principalOutstanding;
      overallTotals.totalArrears += scheduleArrears.totalArrears;
      overallTotals.totalCount++;
    });

    // Calculate averages for each status
    const byStatus = Object.values(statusMap).map(entry => {
      const avgRate = entry.provisionRates.length > 0 
        ? entry.provisionRates.reduce((a, b) => a + b, 0) / entry.provisionRates.length 
        : 0;
      
      return {
        provisionStatus: entry.provisionStatus,
        count: entry.count,
        totalProvision: entry.totalProvision,
        totalOutstandingPrincipal: entry.totalOutstandingPrincipal,
        totalArrears: entry.totalArrears,
        avgProvisionRate: parseFloat(avgRate.toFixed(4)),
        firstProvisionDate: entry.firstProvisionDate,
        lastProvisionDate: entry.lastProvisionDate,
        standardCount: entry.standardCount,
        watchCount: entry.watchCount,
        substandardCount: entry.substandardCount,
        doubtfulCount: entry.doubtfulCount,
        lossCount: entry.lossCount
      };
    });

    res.json({
      success: true,
      data: {
        byStatus,
        overall: {
          totalProvision: overallTotals.totalProvision,
          totalOutstandingPrincipal: overallTotals.totalOutstandingPrincipal,
          totalArrears: overallTotals.totalArrears,
          totalCount: overallTotals.totalCount,
          provisionClassBreakdown: {
            Standard: overallTotals.standardCount,
            Watch: overallTotals.watchCount,
            Substandard: overallTotals.substandardCount,
            Doubtful: overallTotals.doubtfulCount,
            Loss: overallTotals.lossCount
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Provision summary error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate provision summary',
      details: error.message
    });
  }
});

// ============================================================
// GET /api/reports/loan-provision/export
// ============================================================
router.get('/loan-provision/export', async (req, res) => {
  try {
    // ✅ Set session collation
    await sequelize.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci', { 
      type: sequelize.QueryTypes.RAW 
    });
    await sequelize.query('SET SESSION collation_connection = utf8mb4_unicode_ci', {
      type: sequelize.QueryTypes.RAW
    });

    const { branch, product, status, format = 'excel' } = req.query;
    const { query, replacements } = buildLoanProvisionQuery({ branch, product, status });

    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // ✅ Process results to calculate accurate arrears from schedule
    const processedResults = results.map(row => {
      const scheduleData = calculateArrearsFromSchedule(row["Installment Schedule"]);
      
      return {
        ...row,
        "Principal Arrears": scheduleData.totalArrears,
        "Missed Payments": scheduleData.missedPayments,
        "Overdue Amount": scheduleData.overdueAmount
      };
    });

    if (format === 'json') {
      return res.json({
        success: true,
        data: processedResults,
        total: processedResults.length
      });
    }

    res.json({
      success: true,
      data: processedResults,
      total: processedResults.length,
      exportReady: true,
      message: 'Data ready for export'
    });

  } catch (error) {
    console.error('❌ Export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export report',
      details: error.message
    });
  }
});

///////////////////////////////////////////
// ICAD REPORT
// Enhanced ICADReport with multiple filters
/////////////////////////////////////////////
router.get('/icad', async (req, res) => {
    try {
        const { 
            dateFrom, 
            dateTo, 
            accountStatus, 
            customerCategory,
            accountType,
            kycLevel,
            searchTerm,
            limit = 1000,
            offset = 0
        } = req.query;
        
        // Build the WHERE clause dynamically
        let whereConditions = [];
        let replacements = {};
        
        // Base conditions - using correct table names
        whereConditions.push('ca.status = :accountStatus');
        replacements.accountStatus = accountStatus || 'ACTIVE';
        
        // Customer category filter
        if (customerCategory) {
            whereConditions.push('c.CUST_CAT = :customerCategory');
            replacements.customerCategory = customerCategory;
        } else {
            whereConditions.push('c.CUST_CAT = :customerCategory');
            replacements.customerCategory = 'INDIVIDUAL';
        }
        
        // Account type filter
        if (accountType) {
            whereConditions.push(`CASE 
                WHEN ca.product_code IN ('SAV', 'SAVINGS') THEN 'Savings'
                WHEN ca.product_code IN ('CUR', 'CURRENT') THEN 'Current'
                WHEN ca.product_code IN ('TD', 'T-DEP', 'FIXED') THEN 'Fixed Deposit'
                ELSE 'Other'
            END = :accountType`);
            replacements.accountType = accountType;
        }
        
        // KYC Level filter
        if (kycLevel) {
            whereConditions.push('c.KYC_LEVEL = :kycLevel');
            replacements.kycLevel = kycLevel;
        }
        
        // Search term filter
        if (searchTerm) {
            whereConditions.push(`(
                UPPER(ca.account_name) LIKE UPPER(:searchTerm) OR
                UPPER(ca.account_number) LIKE UPPER(:searchTerm) OR
                UPPER(c.FIRST_NAME) LIKE UPPER(:searchTerm) OR
                UPPER(c.LAST_NAME) LIKE UPPER(:searchTerm) OR
                UPPER(c.EMAIL_ADDRESS) LIKE UPPER(:searchTerm) OR
                UPPER(c.PHONE_NO) LIKE UPPER(:searchTerm) OR
                UPPER(c.BVN) LIKE UPPER(:searchTerm)
            )`);
            replacements.searchTerm = `%${searchTerm}%`;
        }
        
        // Date range filter
        if (dateFrom) {
            whereConditions.push('(DATE(c.CREATE_DT) >= :dateFrom OR DATE(c.created_at) >= :dateFrom)');
            replacements.dateFrom = dateFrom;
        }
        
        if (dateTo) {
            whereConditions.push('(DATE(c.CREATE_DT) <= :dateTo OR DATE(c.created_at) <= :dateTo)');
            replacements.dateTo = dateTo;
        }
        
        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
        
        // Count query for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM 
                customers c
            INNER JOIN 
                customer_accounts ca ON c.CUST_ID = ca.CUST_ID
            ${whereClause}
        `;
        
        const countResult = await sequelize.query(countQuery, { 
            type: QueryTypes.SELECT,
            replacements: replacements
        });
        const totalRecords = countResult[0]?.total || 0;
        
        // Main query with pagination
        const query = `
            SELECT 
                @rownum := @rownum + 1 AS "SN",
                ca.account_name AS "AccountName",
                ca.account_number AS "AccountNumber",
                DATE_FORMAT(c.BIRTH_DT, '%Y-%m-%d') AS "DateOfBirth",
                c.EMAIL_ADDRESS AS "Email",
                COALESCE(c.FIRST_NAME, 'N/A') AS "FirstName",
                COALESCE(c.MIDDLE_NAME, 'N/A') AS "MiddleName",
                COALESCE(c.LAST_NAME, 'N/A') AS "LastName",
                COALESCE(c.PHONE_NO, 'N/A') AS "PhoneNumber",
                ca.account_name AS "AccountDesignation",
                ca.status AS "AccountStatus",
                CASE 
                    WHEN ca.product_code IN ('SAV', 'SAVINGS') THEN 'Savings'
                    WHEN ca.product_code IN ('CUR', 'CURRENT') THEN 'Current'
                    WHEN ca.product_code IN ('TD', 'T-DEP', 'FIXED') THEN 'Fixed Deposit'
                    ELSE 'Other'
                END AS "AccountType",
                COALESCE(c.BVN, 'N/A') AS "BVN",
                CASE WHEN c.IS_PEP = 1 THEN 'Yes' ELSE 'No' END AS "PEP",
                COALESCE(c.INDUSTRY_CD, 'N/A') AS "SectorCode",
                COALESCE(c.TAX_GRP_ID, 'N/A') AS "TIN",
                DATE_FORMAT(COALESCE(c.CREATE_DT, c.created_at), '%Y-%m-%d') AS "DATEOPENED",
                COALESCE(c.CREATED_BY, c.USER_ID) AS "USER-ID",
                COALESCE(c.KYC_LEVEL, 'Tier-1') AS "ACCOUNTTIER",
                COALESCE(c.HOME_ADDRESS, 'N/A') AS "ADDRESS",
                c.CUST_NO AS "CustomerNumber",
                c.GENDER_TY AS "Gender",
                c.CUST_CAT AS "CustomerCategory"
            FROM 
                customers c
            INNER JOIN 
                customer_accounts ca ON c.CUST_ID = ca.CUST_ID
            CROSS JOIN (SELECT @rownum := 0) r
            ${whereClause}
            ORDER BY 
                c.CUST_ID ASC
            LIMIT :limit OFFSET :offset
        `;
        
        const results = await sequelize.query(query, { 
            type: QueryTypes.SELECT,
            replacements: {
                ...replacements,
                offset: parseInt(offset || 0),
                limit: parseInt(limit || 1000)
            }
        });
        
        // Calculate summary statistics
        const accountTypes = {};
        const statusCounts = {};
        const kycLevels = {};
        const genderCounts = {};
        const customerCategories = {};
        
        results.forEach(r => {
            accountTypes[r.AccountType] = (accountTypes[r.AccountType] || 0) + 1;
            statusCounts[r.AccountStatus] = (statusCounts[r.AccountStatus] || 0) + 1;
            kycLevels[r.ACCOUNTTIER] = (kycLevels[r.ACCOUNTTIER] || 0) + 1;
            if (r.Gender) {
                genderCounts[r.Gender] = (genderCounts[r.Gender] || 0) + 1;
            }
            if (r.CustomerCategory) {
                customerCategories[r.CustomerCategory] = (customerCategories[r.CustomerCategory] || 0) + 1;
            }
        });
        
        res.json({
            success: true,
            data: results,
            pagination: {
                total: totalRecords,
                limit: parseInt(limit),
                offset: parseInt(offset),
                pages: Math.ceil(totalRecords / parseInt(limit))
            },
            summary: {
                totalRecords: totalRecords,
                accountTypes: accountTypes,
                statusCounts: statusCounts,
                kycLevels: kycLevels,
                genderCounts: genderCounts,
                customerCategories: customerCategories,
                dateFrom: dateFrom || 'All',
                dateTo: dateTo || 'All'
            },
            filters: {
                dateFrom: dateFrom || null,
                dateTo: dateTo || null,
                accountStatus: replacements.accountStatus,
                customerCategory: replacements.customerCategory,
                accountType: accountType || null,
                kycLevel: kycLevel || null,
                searchTerm: searchTerm || null
            },
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error generating ICAD Report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating report',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * NDIC COR Report - Corporate Depositors
 * Uses customers, loan_accounts, customer_accounts, guarantors, and collateral tables
 * FIXED: Collation mismatch on guarantor_id join, added collateral data
 * FIXED: Use guarantor_internal_id instead of GUARANTOR_ID
 */
router.get('/ndic-cor', async (req, res) => {
    try {
        const { 
            dateFrom, 
            dateTo, 
            loanStatus,
            customerType = 'CORPORATE',
            limit = 1000,
            offset = 0
        } = req.query;
        
        let whereConditions = [];
        let replacements = {
            customerType: customerType || 'CORPORATE'
        };
        
        // Customer type filter - CUST_CAT is the customer category
        whereConditions.push('C.CUST_CAT = :customerType');
        
        // Date range filter
        if (dateFrom) {
            whereConditions.push('DATE(COALESCE(LA.DISBURSEMENT_DATE, LA.APPROVAL_DATE, LA.APPLICATION_DATE)) >= :dateFrom');
            replacements.dateFrom = dateFrom;
        }
        
        if (dateTo) {
            whereConditions.push('DATE(COALESCE(LA.DISBURSEMENT_DATE, LA.APPROVAL_DATE, LA.APPLICATION_DATE)) <= :dateTo');
            replacements.dateTo = dateTo;
        }
        
        // Loan status filter
        if (loanStatus && loanStatus !== 'ALL') {
            whereConditions.push('LA.LOAN_STATUS = :loanStatus');
            replacements.loanStatus = loanStatus;
        } else {
            whereConditions.push('LA.LOAN_STATUS IN (:loanStatuses)');
            replacements.loanStatuses = ['ACTIVE', 'DISBURSED', 'OVERDUE', 'APPROVED'];
        }
        
        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
        
        const query = `
            SELECT 
                C.CUST_NO AS "SCVID",
                LA.ACCT_NO AS "Account Number",
                LA.ACCT_NM AS "Account Name",
                'Loan' AS "Account Type (Savings, Current, Fixed, Domicilary)",
                'Corporate' AS "Category of Account (Private or Public{e.g Local Govt, State Govt. or MDA})",
                C.TAX_GRP_ID AS "TIN",
                C.REGISTRATION_NO AS "Corporate Customer RC Number (CAC Reg. No.)",
                C.CUST_NM AS "Name of Chief Executive",
                C.BVN AS "BVN of Chief Executive",
                C.PHONE_NO AS "Mobile No of Chief Executive",
                C.HOME_ADDRESS AS "Contact Address of the Entity",
                C.PHONE_NO AS "Office Phone Number",
                LA.OUTSTANDING_PRINCIPAL AS "Account Balance",
                CASE 
                    WHEN LA.LOAN_STATUS IN ('ACTIVE', 'DISBURSED', 'APPROVED') THEN 'Active'
                    WHEN LA.LOAN_STATUS = 'OVERDUE' THEN 'Restricted'
                    WHEN LA.LOAN_STATUS IN ('CLOSED', 'REJECTED') THEN 'Dormant'
                    WHEN LA.LOAN_STATUS = 'PENDING' THEN 'Pending'
                    ELSE 'Active'
                END AS "Account Status (Active, Dormant or Restricted)",
                '0' AS "Portion of Deposit Pledged as Collateral for Loan",
                COALESCE(CA.TOTAL_DEPOSITS, 0) AS "Aggregated Deposit Balance by TIN, CAC or Unique Identifier (i.e. addition of all deposit account balances of the customer) (A)",
                CASE 
                    WHEN LA.LOAN_PRODUCT_ID IN (301, 302, 303, 304, 305, 306, 307) THEN 'Term Loan'
                    WHEN LA.LOAN_PRODUCT_ID IN (401, 402) THEN 'Overdraft'
                    WHEN LA.LOAN_PRODUCT_ID IN (501, 502, 503) THEN 'Commercial Paper'
                    ELSE 'Other'
                END AS "Loan type (Overdraft, Term, others )",
                DATE_FORMAT(COALESCE(LA.DISBURSEMENT_DATE, LA.APPROVAL_DATE, LA.APPLICATION_DATE), '%Y-%m-%d') AS "Date Granted",
                LA.AMOUNT AS "Loan Amount",
                LA.OUTSTANDING_PRINCIPAL AS "Loan Outstanding",
                LA.OUTSTANDING_PRINCIPAL AS "Principal",
                COALESCE(LA.ACCRUED_INTEREST, 0) AS "Interest",
                CASE 
                    WHEN LA.SERVICING_STATUS = 'WRITTEN_OFF' THEN 'Yes'
                    ELSE 'No'
                END AS "Waiver/Write Off",
                -- ✅ Collateral Information
                CASE 
                    WHEN COL.collateral_id IS NOT NULL THEN 'Yes'
                    ELSE 'No'
                END AS "Secured",
                CASE 
                    WHEN COL.collateral_id IS NOT NULL THEN 'Yes'
                    ELSE 'No'
                END AS "Cash Backed",
                COALESCE(COL.collateral_market_value, 0) AS "Cash Amount If Yes",
                COALESCE(COL.collateral_type_desc, 'N/A') AS "Collateral Type (Legal Mortgage/Equitable Mortgage /OTHERS)",
                COALESCE(COL.collateral_market_value, 0) AS "Collateral Value",
                COALESCE(COL.collateral_location, 'N/A') AS "Collateral Location",
                COALESCE(
                    CASE 
                        WHEN COL.rec_st = 'P' THEN 'Pending'
                        WHEN COL.collateral_status = 'Active' THEN 'Active'
                        WHEN COL.collateral_status = 'Inactive' THEN 'Inactive'
                        WHEN COL.collateral_status = 'Expired' THEN 'Expired'
                        ELSE COL.collateral_status
                    END, 'N/A'
                ) AS "Collateral Status ",
                -- ✅ Guarantor Information - FIXED: Use guarantor_internal_id
                G.full_name AS "Guarantor(s) Name",
                G.bvn AS "Guarantor(s) BVN",
                G.id_number AS "Guarantor(s) Additional National ID No (NIMC No, Passport No, Voter's Card No, etc)",
                G.address AS "Guarantor(s) Address",
                G.phone_number AS "Guarantor(s) Phone Number",
                COALESCE(LA2.TOTAL_LOANS, 0) AS "Aggregated Loan Balance by BVN or Unique Identifier (i.e. addition of all loan account balances of the customer) (B)",
                (COALESCE(CA.TOTAL_DEPOSITS, 0) - COALESCE(LA2.TOTAL_LOANS, 0)) AS "Net Depositor's Balance (A)-(B)"
            FROM 
                CUSTOMERS C
            INNER JOIN 
                LOAN_ACCOUNTS LA ON (LA.CUST_ID = C.CUST_ID OR LA.CUST_ID = C.CUST_NO OR LA.CUST_ID = CAST(C.CUST_ID AS UNSIGNED) OR LA.CUST_ID = CAST(C.CUST_NO AS UNSIGNED))
            LEFT JOIN 
                (
                    SELECT 
                        CUST_ID,
                        SUM(cleared_balance) AS TOTAL_DEPOSITS
                    FROM customer_accounts
                    WHERE status = 'ACTIVE'
                    GROUP BY CUST_ID
                ) CA ON (CA.CUST_ID = C.CUST_ID OR CA.CUST_ID = C.CUST_NO OR CA.CUST_ID = CAST(C.CUST_ID AS UNSIGNED) OR CA.CUST_ID = CAST(C.CUST_NO AS UNSIGNED))
            LEFT JOIN 
                (
                    SELECT 
                        CUST_ID,
                        SUM(OUTSTANDING_PRINCIPAL) AS TOTAL_LOANS
                    FROM LOAN_ACCOUNTS
                    WHERE LOAN_STATUS IN ('ACTIVE', 'DISBURSED', 'OVERDUE', 'APPROVED')
                    GROUP BY CUST_ID
                ) LA2 ON (LA2.CUST_ID = C.CUST_ID OR LA2.CUST_ID = C.CUST_NO OR LA2.CUST_ID = CAST(C.CUST_ID AS UNSIGNED) OR LA2.CUST_ID = CAST(C.CUST_NO AS UNSIGNED))
            -- ✅ Collateral subquery - get most recent per loan
            LEFT JOIN (
                SELECT 
                    COL1.*
                FROM collateral COL1
                INNER JOIN (
                    SELECT 
                        loan_account_no,
                        MAX(created_at) AS max_created
                    FROM collateral
                    WHERE rec_st != 'D'
                        AND loan_account_no IS NOT NULL
                        AND loan_account_no != ''
                    GROUP BY loan_account_no
                ) COL2 ON COL1.loan_account_no = COL2.loan_account_no 
                    AND COL1.created_at = COL2.max_created
                WHERE COL1.rec_st != 'D'
            ) COL ON COL.loan_account_no = LA.ACCT_NO
            -- ✅ FIXED: Use guarantor_internal_id (same as NDIC IND)
            LEFT JOIN 
                GUARANTORS G ON G.guarantor_id = LA.guarantor_internal_id
            ${whereClause}
            ORDER BY 
                C.CUST_NO ASC
            LIMIT :limit OFFSET :offset
        `;
        
        const results = await sequelize.query(query, { 
            type: QueryTypes.SELECT,
            replacements: {
                ...replacements,
                offset: parseInt(offset || 0),
                limit: parseInt(limit || 1000)
            }
        });
        
        // Calculate summary statistics
        const accountTypes = {};
        const loanStatuses = {};
        const customerTypes = {};
        const guarantorCount = {};
        const collateralTypes = {};
        const collateralStatuses = {};
        let securedCount = 0;
        let unsecuredCount = 0;
        let totalCollateralValue = 0;
        
        results.forEach(r => {
            const type = r["Account Type (Savings, Current, Fixed, Domicilary)"];
            accountTypes[type] = (accountTypes[type] || 0) + 1;
            
            const status = r["Account Status (Active, Dormant or Restricted)"];
            loanStatuses[status] = (loanStatuses[status] || 0) + 1;
            
            const cat = r["Category of Account (Private or Public{e.g Local Govt, State Govt. or MDA})"];
            customerTypes[cat] = (customerTypes[cat] || 0) + 1;
            
            // Track if guarantor exists
            const guarantorName = r["Guarantor(s) Name"];
            if (guarantorName && guarantorName !== 'N/A' && guarantorName !== null && guarantorName.trim() !== '') {
                guarantorCount['Has Guarantor'] = (guarantorCount['Has Guarantor'] || 0) + 1;
            } else {
                guarantorCount['No Guarantor'] = (guarantorCount['No Guarantor'] || 0) + 1;
            }
            
            // Track collateral
            if (r["Secured"] === 'Yes') {
                securedCount++;
                const collValue = parseFloat(r["Collateral Value"]) || 0;
                totalCollateralValue += collValue;
                
                const collType = r["Collateral Type (Legal Mortgage/Equitable Mortgage /OTHERS)"];
                if (collType && collType !== 'N/A') {
                    collateralTypes[collType] = (collateralTypes[collType] || 0) + 1;
                }
                
                const collStatus = r["Collateral Status "];
                if (collStatus && collStatus !== 'N/A') {
                    collateralStatuses[collStatus] = (collateralStatuses[collStatus] || 0) + 1;
                }
            } else {
                unsecuredCount++;
            }
        });
        
        res.json({
            success: true,
            data: results,
            total: results.length,
            reportType: 'NDIC COR',
            reportName: 'NDIC Corporate Depositors Report',
            summary: {
                totalRecords: results.length,
                accountTypes: accountTypes,
                loanStatuses: loanStatuses,
                customerTypes: customerTypes,
                guarantorStats: guarantorCount,
                collateralTypes: collateralTypes,
                collateralStatuses: collateralStatuses,
                securedCount: securedCount,
                unsecuredCount: unsecuredCount,
                totalCollateralValue: totalCollateralValue,
                dateFrom: dateFrom || 'All',
                dateTo: dateTo || 'All'
            },
            filters: {
                dateFrom: dateFrom || null,
                dateTo: dateTo || null,
                loanStatus: loanStatus || 'All',
                customerType: customerType || 'CORPORATE'
            },
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error generating NDIC COR Report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating NDIC COR Report',
            error: error.message
        });
    }
});

// In your ReportsRoutes.js

/**
 * NDIC IND Report - Individual Depositors
 * Uses customers, loan_accounts, customer_accounts, guarantors, and collateral tables
 * FIXED: Compatible with MariaDB (no LATERAL joins)
 */
router.get('/ndic-ind', async (req, res) => {
    try {
        const { 
            dateFrom, 
            dateTo, 
            loanStatus,
            customerType = 'INDIVIDUAL',
            limit = 1000,
            offset = 0
        } = req.query;
        
        let whereConditions = [];
        let replacements = {
            customerType: customerType || 'INDIVIDUAL'
        };
        
        // Customer type filter - CUST_CAT is the customer category
        whereConditions.push('C.CUST_CAT = :customerType');
        
        // Date range filter
        if (dateFrom) {
            whereConditions.push('DATE(COALESCE(LA.DISBURSEMENT_DATE, LA.APPROVAL_DATE, LA.APPLICATION_DATE)) >= :dateFrom');
            replacements.dateFrom = dateFrom;
        }
        
        if (dateTo) {
            whereConditions.push('DATE(COALESCE(LA.DISBURSEMENT_DATE, LA.APPROVAL_DATE, LA.APPLICATION_DATE)) <= :dateTo');
            replacements.dateTo = dateTo;
        }
        
        // Loan status filter
        if (loanStatus && loanStatus !== 'ALL') {
            whereConditions.push('LA.LOAN_STATUS = :loanStatus');
            replacements.loanStatus = loanStatus;
        } else {
            whereConditions.push('LA.LOAN_STATUS IN (:loanStatuses)');
            replacements.loanStatuses = ['ACTIVE', 'DISBURSED', 'OVERDUE', 'APPROVED'];
        }
        
        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
        
        const query = `
            SELECT 
                C.CUST_NO AS "SCVID",
                LA.ACCT_NO AS "Account Number",
                LA.ACCT_NM AS "Account Name",
                'Loan' AS "Account Type (Savings, Current, Fixed, Domicilary)",
                'Private Individual' AS "Category of Account (Private or Public{e.g Local Govt, State Govt. or MDA})",
                C.TAX_GRP_ID AS "TIN",
                NULL AS "Corporate Customer RC Number (CAC Reg. No.)",
                C.CUST_NM AS "Name of Chief Executive",
                C.BVN AS "BVN of Chief Executive",
                C.PHONE_NO AS "Mobile No of Chief Executive",
                C.HOME_ADDRESS AS "Contact Address of the Entity",
                C.PHONE_NO AS "Office Phone Number",
                LA.OUTSTANDING_PRINCIPAL AS "Account Balance",
                CASE 
                    WHEN LA.LOAN_STATUS IN ('ACTIVE', 'DISBURSED', 'APPROVED') THEN 'Active'
                    WHEN LA.LOAN_STATUS = 'OVERDUE' THEN 'Restricted'
                    WHEN LA.LOAN_STATUS IN ('CLOSED', 'REJECTED') THEN 'Dormant'
                    WHEN LA.LOAN_STATUS = 'PENDING' THEN 'Pending'
                    ELSE 'Active'
                END AS "Account Status (Active, Dormant or Restricted)",
                '0' AS "Portion of Deposit Pledged as Collateral for Loan",
                COALESCE(CA.TOTAL_DEPOSITS, 0) AS "Aggregated Deposit Balance by TIN, CAC or Unique Identifier (i.e. addition of all deposit account balances of the customer) (A)",
                CASE 
                    WHEN LA.LOAN_PRODUCT_ID IN (301, 302, 303, 304, 305, 306, 307) THEN 'Term Loan'
                    WHEN LA.LOAN_PRODUCT_ID IN (401, 402) THEN 'Overdraft'
                    WHEN LA.LOAN_PRODUCT_ID IN (501, 502, 503) THEN 'Commercial Paper'
                    ELSE 'Other'
                END AS "Loan type (Overdraft, Term, others )",
                DATE_FORMAT(COALESCE(LA.DISBURSEMENT_DATE, LA.APPROVAL_DATE, LA.APPLICATION_DATE), '%Y-%m-%d') AS "Date Granted",
                LA.AMOUNT AS "Loan Amount",
                LA.OUTSTANDING_PRINCIPAL AS "Loan Outstanding",
                LA.OUTSTANDING_PRINCIPAL AS "Principal",
                COALESCE(LA.ACCRUED_INTEREST, 0) AS "Interest",
                CASE 
                    WHEN LA.SERVICING_STATUS = 'WRITTEN_OFF' THEN 'Yes'
                    ELSE 'No'
                END AS "Waiver/Write Off",
                -- ✅ Collateral Information - Using subquery for MariaDB compatibility
                CASE 
                    WHEN COL.collateral_id IS NOT NULL THEN 'Yes'
                    ELSE 'No'
                END AS "Secured",
                CASE 
                    WHEN COL.collateral_id IS NOT NULL THEN 'Yes'
                    ELSE 'No'
                END AS "Cash Backed",
                COALESCE(COL.collateral_market_value, 0) AS "Cash Amount If Yes",
                COALESCE(COL.collateral_type_desc, 'N/A') AS "Collateral Type (Legal Mortgage/Equitable Mortgage /OTHERS)",
                COALESCE(COL.collateral_market_value, 0) AS "Collateral Value",
                COALESCE(COL.collateral_location, 'N/A') AS "Collateral Location",
                COALESCE(
                    CASE 
                        WHEN COL.rec_st = 'P' THEN 'Pending'
                        WHEN COL.collateral_status = 'Active' THEN 'Active'
                        WHEN COL.collateral_status = 'Inactive' THEN 'Inactive'
                        WHEN COL.collateral_status = 'Expired' THEN 'Expired'
                        ELSE COL.collateral_status
                    END, 'N/A'
                ) AS "Collateral Status ",
                -- ✅ Guarantor Information
                G.full_name AS "Guarantor(s) Name",
                G.bvn AS "Guarantor(s) BVN",
                G.id_number AS "Guarantor(s) Additional National ID No (NIMC No, Passport No, Voter's Card No, etc)",
                G.address AS "Guarantor(s) Address",
                G.phone_number AS "Guarantor(s) Phone Number",
                COALESCE(LA2.TOTAL_LOANS, 0) AS "Aggregated Loan Balance by BVN or Unique Identifier (i.e. addition of all loan account balances of the customer) (B)",
                (COALESCE(CA.TOTAL_DEPOSITS, 0) - COALESCE(LA2.TOTAL_LOANS, 0)) AS "Net Depositor's Balance (A)-(B)"
            FROM 
                CUSTOMERS C
            INNER JOIN 
                LOAN_ACCOUNTS LA ON (LA.CUST_ID = C.CUST_ID OR LA.CUST_ID = C.CUST_NO OR LA.CUST_ID = CAST(C.CUST_ID AS UNSIGNED) OR LA.CUST_ID = CAST(C.CUST_NO AS UNSIGNED))
            LEFT JOIN 
                (
                    SELECT 
                        CUST_ID,
                        SUM(cleared_balance) AS TOTAL_DEPOSITS
                    FROM customer_accounts
                    WHERE status = 'ACTIVE'
                    GROUP BY CUST_ID
                ) CA ON (CA.CUST_ID = C.CUST_ID OR CA.CUST_ID = C.CUST_NO OR CA.CUST_ID = CAST(C.CUST_ID AS UNSIGNED) OR CA.CUST_ID = CAST(C.CUST_NO AS UNSIGNED))
            LEFT JOIN 
                (
                    SELECT 
                        CUST_ID,
                        SUM(OUTSTANDING_PRINCIPAL) AS TOTAL_LOANS
                    FROM LOAN_ACCOUNTS
                    WHERE LOAN_STATUS IN ('ACTIVE', 'DISBURSED', 'OVERDUE', 'APPROVED')
                    GROUP BY CUST_ID
                ) LA2 ON (LA2.CUST_ID = C.CUST_ID OR LA2.CUST_ID = C.CUST_NO OR LA2.CUST_ID = CAST(C.CUST_ID AS UNSIGNED) OR LA2.CUST_ID = CAST(C.CUST_NO AS UNSIGNED))
            LEFT JOIN 
                GUARANTORS G ON G.guarantor_id = LA.guarantor_internal_id
            -- ✅ LEFT JOIN COLLATERAL - Using subquery to get most recent per loan
            LEFT JOIN (
                SELECT 
                    COL1.*
                FROM collateral COL1
                INNER JOIN (
                    SELECT 
                        loan_account_no,
                        MAX(created_at) AS max_created
                    FROM collateral
                    WHERE rec_st != 'D'
                        AND loan_account_no IS NOT NULL
                        AND loan_account_no != ''
                    GROUP BY loan_account_no
                ) COL2 ON COL1.loan_account_no = COL2.loan_account_no 
                    AND COL1.created_at = COL2.max_created
                WHERE COL1.rec_st != 'D'
            ) COL ON COL.loan_account_no = LA.ACCT_NO
            ${whereClause}
            ORDER BY 
                C.CUST_NO ASC
            LIMIT :limit OFFSET :offset
        `;
        
        const results = await sequelize.query(query, { 
            type: QueryTypes.SELECT,
            replacements: {
                ...replacements,
                offset: parseInt(offset || 0),
                limit: parseInt(limit || 1000)
            }
        });
        
        // Calculate summary statistics
        const accountTypes = {};
        const loanStatuses = {};
        const customerTypes = {};
        const guarantorCount = {};
        const collateralTypes = {};
        const collateralStatuses = {};
        let securedCount = 0;
        let unsecuredCount = 0;
        let totalCollateralValue = 0;
        
        results.forEach(r => {
            const type = r["Account Type (Savings, Current, Fixed, Domicilary)"];
            accountTypes[type] = (accountTypes[type] || 0) + 1;
            
            const status = r["Account Status (Active, Dormant or Restricted)"];
            loanStatuses[status] = (loanStatuses[status] || 0) + 1;
            
            const cat = r["Category of Account (Private or Public{e.g Local Govt, State Govt. or MDA})"];
            customerTypes[cat] = (customerTypes[cat] || 0) + 1;
            
            // Track if guarantor exists
            const guarantorName = r["Guarantor(s) Name"];
            if (guarantorName && guarantorName !== 'N/A' && guarantorName !== null && guarantorName.trim() !== '') {
                guarantorCount['Has Guarantor'] = (guarantorCount['Has Guarantor'] || 0) + 1;
            } else {
                guarantorCount['No Guarantor'] = (guarantorCount['No Guarantor'] || 0) + 1;
            }
            
            // Track if secured
            const secured = r["Secured"];
            if (secured === 'Yes') {
                securedCount++;
                const collValue = parseFloat(r["Collateral Value"]) || 0;
                totalCollateralValue += collValue;
            } else {
                unsecuredCount++;
            }
            
            // Track collateral types
            const collType = r["Collateral Type (Legal Mortgage/Equitable Mortgage /OTHERS)"];
            if (collType && collType !== 'N/A') {
                collateralTypes[collType] = (collateralTypes[collType] || 0) + 1;
            }
            
            // Track collateral status
            const collStatus = r["Collateral Status "];
            if (collStatus && collStatus !== 'N/A') {
                collateralStatuses[collStatus] = (collateralStatuses[collStatus] || 0) + 1;
            }
        });
        
        res.json({
            success: true,
            data: results,
            total: results.length,
            reportType: 'NDIC IND',
            reportName: 'NDIC Individual Depositors Report',
            summary: {
                totalRecords: results.length,
                accountTypes: accountTypes,
                loanStatuses: loanStatuses,
                customerTypes: customerTypes,
                guarantorStats: guarantorCount,
                collateralTypes: collateralTypes,
                collateralStatuses: collateralStatuses,
                securedCount: securedCount,
                unsecuredCount: unsecuredCount,
                totalCollateralValue: totalCollateralValue,
                dateFrom: dateFrom || 'All',
                dateTo: dateTo || 'All'
            },
            filters: {
                dateFrom: dateFrom || null,
                dateTo: dateTo || null,
                loanStatus: loanStatus || 'All',
                customerType: customerType || 'INDIVIDUAL'
            },
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error generating NDIC IND Report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating NDIC IND Report',
            error: error.message
        });
    }
});

/**
 * NDIC COMBINED Report - Both Individual and Corporate with Loans
 * Uses customers, loan_accounts, customer_accounts, guarantors, and collateral tables
 * FIXED: Use guarantor_internal_id (matching NDIC IND report)
 * FIXED: Added collateral data
 */
router.get('/ndic-combined', async (req, res) => {
    try {
        const { 
            dateFrom, 
            dateTo, 
            loanStatus,
            customerType = 'ALL',
            limit = 1000,
            offset = 0
        } = req.query;
        
        let whereConditions = [];
        let replacements = {};
        
        // Customer category filter - using CUST_CAT
        if (customerType && customerType !== 'ALL') {
            whereConditions.push('C.CUST_CAT = :customerType');
            replacements.customerType = customerType;
        } else {
            whereConditions.push('C.CUST_CAT IN (:custCats)');
            replacements.custCats = ['INDIVIDUAL', 'CORPORATE'];
        }
        
        // Date range filter
        if (dateFrom) {
            whereConditions.push('DATE(COALESCE(LA.DISBURSEMENT_DATE, LA.APPROVAL_DATE, LA.APPLICATION_DATE)) >= :dateFrom');
            replacements.dateFrom = dateFrom;
        }
        
        if (dateTo) {
            whereConditions.push('DATE(COALESCE(LA.DISBURSEMENT_DATE, LA.APPROVAL_DATE, LA.APPLICATION_DATE)) <= :dateTo');
            replacements.dateTo = dateTo;
        }
        
        // Loan status filter
        if (loanStatus && loanStatus !== 'ALL') {
            whereConditions.push('LA.LOAN_STATUS = :loanStatus');
            replacements.loanStatus = loanStatus;
        } else {
            whereConditions.push('LA.LOAN_STATUS IN (:loanStatuses)');
            replacements.loanStatuses = ['ACTIVE', 'DISBURSED', 'OVERDUE', 'APPROVED'];
        }
        
        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
        
        // Count query
        const countQuery = `
            SELECT COUNT(*) as total
            FROM 
                CUSTOMERS C
            INNER JOIN 
                LOAN_ACCOUNTS LA ON (LA.CUST_ID = C.CUST_ID OR LA.CUST_ID = C.CUST_NO OR LA.CUST_ID = CAST(C.CUST_ID AS UNSIGNED) OR LA.CUST_ID = CAST(C.CUST_NO AS UNSIGNED))
            ${whereClause}
        `;
        
        const countResult = await sequelize.query(countQuery, { 
            type: QueryTypes.SELECT,
            replacements: replacements
        });
        const totalRecords = countResult[0]?.total || 0;
        
        // Main query with collateral
        const query = `
            SELECT 
                C.CUST_NO AS "SCVID",
                LA.ACCT_NO AS "Account Number",
                LA.ACCT_NM AS "Account Name",
                'Loan' AS "Account Type (Savings, Current, Fixed, Domicilary)",
                CASE 
                    WHEN C.CUST_CAT = 'INDIVIDUAL' THEN 'Private Individual'
                    WHEN C.CUST_CAT = 'CORPORATE' THEN 'Corporate'
                    WHEN C.CUST_CAT IN ('GOVT', 'GOVERNMENT', 'PUBLIC') THEN 'Public'
                    ELSE 'Private'
                END AS "Category of Account (Private or Public{e.g Local Govt, State Govt. or MDA})",
                C.TAX_GRP_ID AS "TIN",
                C.REGISTRATION_NO AS "Corporate Customer RC Number (CAC Reg. No.)",
                C.CUST_NM AS "Name of Chief Executive",
                C.BVN AS "BVN of Chief Executive",
                C.PHONE_NO AS "Mobile No of Chief Executive",
                C.HOME_ADDRESS AS "Contact Address of the Entity",
                C.PHONE_NO AS "Office Phone Number",
                LA.OUTSTANDING_PRINCIPAL AS "Account Balance",
                CASE 
                    WHEN LA.LOAN_STATUS IN ('ACTIVE', 'DISBURSED', 'APPROVED') THEN 'Active'
                    WHEN LA.LOAN_STATUS = 'OVERDUE' THEN 'Restricted'
                    WHEN LA.LOAN_STATUS IN ('CLOSED', 'REJECTED') THEN 'Dormant'
                    WHEN LA.LOAN_STATUS = 'PENDING' THEN 'Pending'
                    ELSE 'Active'
                END AS "Account Status (Active, Dormant or Restricted)",
                '0' AS "Portion of Deposit Pledged as Collateral for Loan",
                COALESCE(CA.TOTAL_DEPOSITS, 0) AS "Aggregated Deposit Balance by TIN, CAC or Unique Identifier (i.e. addition of all deposit account balances of the customer) (A)",
                CASE 
                    WHEN LA.LOAN_PRODUCT_ID IN (301, 302, 303, 304, 305, 306, 307) THEN 'Term Loan'
                    WHEN LA.LOAN_PRODUCT_ID IN (401, 402) THEN 'Overdraft'
                    WHEN LA.LOAN_PRODUCT_ID IN (501, 502, 503) THEN 'Commercial Paper'
                    ELSE 'Other'
                END AS "Loan type (Overdraft, Term, others )",
                DATE_FORMAT(COALESCE(LA.DISBURSEMENT_DATE, LA.APPROVAL_DATE, LA.APPLICATION_DATE), '%Y-%m-%d') AS "Date Granted",
                LA.AMOUNT AS "Loan Amount",
                LA.OUTSTANDING_PRINCIPAL AS "Loan Outstanding",
                LA.OUTSTANDING_PRINCIPAL AS "Principal",
                COALESCE(LA.ACCRUED_INTEREST, 0) AS "Interest",
                CASE 
                    WHEN LA.SERVICING_STATUS = 'WRITTEN_OFF' THEN 'Yes'
                    ELSE 'No'
                END AS "Waiver/Write Off",
                -- ✅ Collateral Information
                CASE 
                    WHEN COL.collateral_id IS NOT NULL THEN 'Yes'
                    ELSE 'No'
                END AS "Secured",
                CASE 
                    WHEN COL.collateral_id IS NOT NULL THEN 'Yes'
                    ELSE 'No'
                END AS "Cash Backed",
                COALESCE(COL.collateral_market_value, 0) AS "Cash Amount If Yes",
                COALESCE(COL.collateral_type_desc, 'N/A') AS "Collateral Type (Legal Mortgage/Equitable Mortgage /OTHERS)",
                COALESCE(COL.collateral_market_value, 0) AS "Collateral Value",
                COALESCE(COL.collateral_location, 'N/A') AS "Collateral Location",
                COALESCE(
                    CASE 
                        WHEN COL.rec_st = 'P' THEN 'Pending'
                        WHEN COL.collateral_status = 'Active' THEN 'Active'
                        WHEN COL.collateral_status = 'Inactive' THEN 'Inactive'
                        WHEN COL.collateral_status = 'Expired' THEN 'Expired'
                        ELSE COL.collateral_status
                    END, 'N/A'
                ) AS "Collateral Status ",
                -- ✅ Guarantor Information - FIXED: Use guarantor_internal_id (same as NDIC IND)
                G.full_name AS "Guarantor(s) Name",
                G.bvn AS "Guarantor(s) BVN",
                G.id_number AS "Guarantor(s) Additional National ID No (NIMC No, Passport No, Voter's Card No, etc)",
                G.address AS "Guarantor(s) Address",
                G.phone_number AS "Guarantor(s) Phone Number",
                COALESCE(LA2.TOTAL_LOANS, 0) AS "Aggregated Loan Balance by BVN or Unique Identifier (i.e. addition of all loan account balances of the customer) (B)",
                (COALESCE(CA.TOTAL_DEPOSITS, 0) - COALESCE(LA2.TOTAL_LOANS, 0)) AS "Net Depositor's Balance (A)-(B)"
            FROM 
                CUSTOMERS C
            INNER JOIN 
                LOAN_ACCOUNTS LA ON (LA.CUST_ID = C.CUST_ID OR LA.CUST_ID = C.CUST_NO OR LA.CUST_ID = CAST(C.CUST_ID AS UNSIGNED) OR LA.CUST_ID = CAST(C.CUST_NO AS UNSIGNED))
            LEFT JOIN 
                (
                    SELECT 
                        CUST_ID,
                        SUM(cleared_balance) AS TOTAL_DEPOSITS
                    FROM customer_accounts
                    WHERE status = 'ACTIVE'
                    GROUP BY CUST_ID
                ) CA ON (CA.CUST_ID = C.CUST_ID OR CA.CUST_ID = C.CUST_NO OR CA.CUST_ID = CAST(C.CUST_ID AS UNSIGNED) OR CA.CUST_ID = CAST(C.CUST_NO AS UNSIGNED))
            LEFT JOIN 
                (
                    SELECT 
                        CUST_ID,
                        SUM(OUTSTANDING_PRINCIPAL) AS TOTAL_LOANS
                    FROM LOAN_ACCOUNTS
                    WHERE LOAN_STATUS IN ('ACTIVE', 'DISBURSED', 'OVERDUE', 'APPROVED')
                    GROUP BY CUST_ID
                ) LA2 ON (LA2.CUST_ID = C.CUST_ID OR LA2.CUST_ID = C.CUST_NO OR LA2.CUST_ID = CAST(C.CUST_ID AS UNSIGNED) OR LA2.CUST_ID = CAST(C.CUST_NO AS UNSIGNED))
            -- ✅ Collateral subquery - get most recent per loan
            LEFT JOIN (
                SELECT 
                    COL1.*
                FROM collateral COL1
                INNER JOIN (
                    SELECT 
                        loan_account_no,
                        MAX(created_at) AS max_created
                    FROM collateral
                    WHERE rec_st != 'D'
                        AND loan_account_no IS NOT NULL
                        AND loan_account_no != ''
                    GROUP BY loan_account_no
                ) COL2 ON COL1.loan_account_no = COL2.loan_account_no 
                    AND COL1.created_at = COL2.max_created
                WHERE COL1.rec_st != 'D'
            ) COL ON COL.loan_account_no = LA.ACCT_NO
            -- ✅ FIXED: Use guarantor_internal_id (matches NDIC IND report)
            LEFT JOIN 
                GUARANTORS G ON G.guarantor_id = LA.guarantor_internal_id
            ${whereClause}
            ORDER BY 
                C.CUST_NO ASC
            LIMIT :limit OFFSET :offset
        `;
        
        const results = await sequelize.query(query, { 
            type: QueryTypes.SELECT,
            replacements: {
                ...replacements,
                offset: parseInt(offset || 0),
                limit: parseInt(limit || 1000)
            }
        });
        
        // Calculate summary statistics
        const accountTypes = {};
        const loanStatuses = {};
        const customerTypes = {};
        const depositRanges = {};
        const guarantorCount = {};
        const collateralTypes = {};
        const collateralStatuses = {};
        let securedCount = 0;
        let unsecuredCount = 0;
        let totalCollateralValue = 0;
        
        results.forEach(r => {
            const type = r["Account Type (Savings, Current, Fixed, Domicilary)"];
            accountTypes[type] = (accountTypes[type] || 0) + 1;
            
            const status = r["Account Status (Active, Dormant or Restricted)"];
            loanStatuses[status] = (loanStatuses[status] || 0) + 1;
            
            const cat = r["Category of Account (Private or Public{e.g Local Govt, State Govt. or MDA})"];
            customerTypes[cat] = (customerTypes[cat] || 0) + 1;
            
            const deposit = parseFloat(r["Aggregated Deposit Balance by TIN, CAC or Unique Identifier (i.e. addition of all deposit account balances of the customer) (A)"] || 0);
            if (deposit === 0) {
                depositRanges['Zero'] = (depositRanges['Zero'] || 0) + 1;
            } else if (deposit <= 100000) {
                depositRanges['0 - 100,000'] = (depositRanges['0 - 100,000'] || 0) + 1;
            } else if (deposit <= 500000) {
                depositRanges['100,001 - 500,000'] = (depositRanges['100,001 - 500,000'] || 0) + 1;
            } else if (deposit <= 1000000) {
                depositRanges['500,001 - 1,000,000'] = (depositRanges['500,001 - 1,000,000'] || 0) + 1;
            } else {
                depositRanges['1,000,000+'] = (depositRanges['1,000,000+'] || 0) + 1;
            }
            
            // Track if guarantor exists
            const guarantorName = r["Guarantor(s) Name"];
            if (guarantorName && guarantorName !== 'N/A' && guarantorName !== null && guarantorName.trim() !== '') {
                guarantorCount['Has Guarantor'] = (guarantorCount['Has Guarantor'] || 0) + 1;
            } else {
                guarantorCount['No Guarantor'] = (guarantorCount['No Guarantor'] || 0) + 1;
            }
            
            // Track collateral
            if (r["Secured"] === 'Yes') {
                securedCount++;
                const collValue = parseFloat(r["Collateral Value"]) || 0;
                totalCollateralValue += collValue;
                
                const collType = r["Collateral Type (Legal Mortgage/Equitable Mortgage /OTHERS)"];
                if (collType && collType !== 'N/A') {
                    collateralTypes[collType] = (collateralTypes[collType] || 0) + 1;
                }
                
                const collStatus = r["Collateral Status "];
                if (collStatus && collStatus !== 'N/A') {
                    collateralStatuses[collStatus] = (collateralStatuses[collStatus] || 0) + 1;
                }
            } else {
                unsecuredCount++;
            }
        });
        
        res.json({
            success: true,
            data: results,
            reportType: 'NDIC COMBINED',
            reportName: 'NDIC Combined Depositors Report (Individual & Corporate)',
            pagination: {
                total: totalRecords,
                limit: parseInt(limit),
                offset: parseInt(offset),
                pages: Math.ceil(totalRecords / parseInt(limit))
            },
            summary: {
                totalRecords: totalRecords,
                accountTypes: accountTypes,
                loanStatuses: loanStatuses,
                customerTypes: customerTypes,
                depositRanges: depositRanges,
                guarantorStats: guarantorCount,
                collateralTypes: collateralTypes,
                collateralStatuses: collateralStatuses,
                securedCount: securedCount,
                unsecuredCount: unsecuredCount,
                totalCollateralValue: totalCollateralValue,
                dateFrom: dateFrom || 'All',
                dateTo: dateTo || 'All'
            },
            filters: {
                dateFrom: dateFrom || null,
                dateTo: dateTo || null,
                loanStatus: loanStatus || 'All',
                customerType: customerType || 'All'
            },
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error generating NDIC Combined Report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating NDIC Combined Report',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Add this to your ReportsRoutes.js

/**
 * EMTL Transactions Report
 * GET /reports/emtl-transactions
 */
router.get('/emtl-transactions', async (req, res) => {
  try {
    const {
      status,
      startDate,
      endDate,
      search,
      channel,
      transactionType,
      limit = 1000,
      offset = 0
    } = req.query;

    let whereConditions = [];
    let replacements = {};

    // Status filter
    if (status) {
      whereConditions.push('et.status = :status');
      replacements.status = status;
    }

    // Date range filter
    if (startDate && endDate) {
      whereConditions.push('DATE(et.transfer_date) BETWEEN :startDate AND :endDate');
      replacements.startDate = startDate;
      replacements.endDate = endDate;
    } else if (startDate) {
      whereConditions.push('DATE(et.transfer_date) >= :startDate');
      replacements.startDate = startDate;
    } else if (endDate) {
      whereConditions.push('DATE(et.transfer_date) <= :endDate');
      replacements.endDate = endDate;
    }

    // Channel filter
    if (channel) {
      whereConditions.push('et.channel = :channel');
      replacements.channel = channel;
    }

    // Transaction type filter
    if (transactionType) {
      whereConditions.push('et.transaction_type = :transactionType');
      replacements.transactionType = transactionType;
    }

    // Search filter
    if (search) {
      whereConditions.push(`(
        et.transaction_reference LIKE :search OR
        et.customer_no LIKE :search OR
        et.account_no LIKE :search OR
        et.transaction_id LIKE :search
      )`);
      replacements.search = `%${search}%`;
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ') 
      : '';

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM emtl_transactions et
      ${whereClause}
    `;

    const countResult = await sequelize.query(countQuery, {
      type: QueryTypes.SELECT,
      replacements: replacements
    });
    const totalRecords = countResult[0]?.total || 0;

    // Main query
    const query = `
      SELECT 
        et.id,
        et.transaction_id,
        et.transaction_reference,
        et.customer_no,
        et.account_no,
        et.amount,
        et.transfer_amount,
        et.transfer_date,
        et.channel,
        et.transaction_type,
        et.status,
        et.remittance_batch_id,
        et.remitted_date,
        et.remittance_reference,
        et.journal_entry_id,
        et.gl_account,
        et.levy_calculation,
        et.created_by,
        et.created_date,
        et.updated_by,
        et.updated_date
      FROM emtl_transactions et
      ${whereClause}
      ORDER BY et.transfer_date DESC, et.created_date DESC
      LIMIT :limit OFFSET :offset
    `;

    const results = await sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements: {
        ...replacements,
        offset: parseInt(offset || 0),
        limit: parseInt(limit || 1000)
      }
    });

    res.json({
      success: true,
      data: results,
      pagination: {
        total: totalRecords,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(totalRecords / parseInt(limit))
      },
      filters: {
        status: status || null,
        startDate: startDate || null,
        endDate: endDate || null,
        search: search || null,
        channel: channel || null,
        transactionType: transactionType || null
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching EMTL transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching EMTL transactions',
      error: error.message
    });
  }
});

export default router;