import express from "express";
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



const router = express.Router();


/**
 * Trial Balance Route
 */
router.get("/reports/trial-balance", exportTrialBalance);



/**
 * Loan Report
 * GET /loans
 * Supports JSON, PDF, and Excel formats with optional status filter
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
 * Supports JSON, PDF, and Excel formats with optional ACCT_NO filter
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
 * GET /term-deposit/:acctNo/pdf
 * Generate PDF contract letter for a specific term deposit by ACCT_NO
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
 * GET /term-deposit/:acctNo/excel
 * Generate Excel report for a specific term deposit by ACCT_NO
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

export default router;