import { generateReport, generateExcelReport } from "../utils/pdfGenerator.js";
import LoanAccount from "../models/LoanAccount.js"; // Correct schema

// Export Loan Portfolio Report (Unified with BU_ID and Date Filters)
// Supports: PDF/Excel formats, optional BU_ID filter, optional date range filter
// @route GET /reports/loan-portfolio
// @query {string} buId - Optional BU_ID filter (e.g., '102')
// @query {string} startDate - Optional start date (YYYY-MM-DD)
// @query {string} endDate - Optional end date (YYYY-MM-DD)
// @query {string} format - 'pdf' or 'excel' (default: 'pdf')
export const exportLoanPortfolio = async (req, res) => {
  try {
    const { buId, startDate, endDate, format = "pdf" } = req.query;

    // Build query filter
    const query = {};
    if (buId) {
      query.BU_ID = buId; // BU_ID filter from the router example
    }
    if (startDate && endDate) {
      query.applicationDate = { // Date range filter
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const loans = await LoanAccount.find(query).lean();

    if (!loans || loans.length === 0) {
      const message = buId ? `No loans found for BU_ID: ${buId}` :
                     (startDate && endDate ? `No loans found for date range ${startDate} to ${endDate}` : 'No loans found');
      return res.status(404).json({
        success: false,
        message
      });
    }

    // Transform data for consistency (used for both PDF and Excel)
    const reportData = loans.map(loan => ({
      CUST_ID: loan.CUST_ID || 'N/A',
      ACCT_NM: loan.ACCT_NM || 'N/A',
      ACCT_NO: loan.ACCT_NO || 'N/A',
      APPL_ID: loan.APPL_ID || 'N/A',
      PRODUCT_TYPE: loan.PRODUCT_TYPE || 'N/A',
      PROD_ID: loan.PROD_ID || 'N/A',
      REPAYMENT_SOURCE_ACCOUNT: loan.REPAYMENT_SOURCE_ACCOUNT || 'N/A',
      BU_ID: loan.BU_ID || 'N/A',
      PRIMARY_OFFICER_ID: loan.PRIMARY_OFFICER_ID || 'N/A',
      ACTUAL_DISBURSEMENT: Number(loan.ACTUAL_DISBURSEMENT || 0),  // Coerce to number, default 0
      START_DT: loan.START_DT || 'N/A',
      MATURITY_DT: loan.MATURITY_DT || 'N/A',
      INTEREST_RATE: Number(loan.INTEREST_RATE || 0),  // Coerce to number
      LOAN_STATUS: loan.LOAN_STATUS || 'N/A',
      TOTAL_INTEREST: Number(loan.TOTAL_INTEREST || 0),  // Coerce to number
      TOTAL_REPAYMENT: Number(loan.TOTAL_REPAYMENT || 0),  // Coerce to number
    }));

    // Calculate totals for key numeric fields (with NaN safety)
    const totalDisbursement = reportData.reduce((sum, loan) => sum + (loan.ACTUAL_DISBURSEMENT || 0), 0);
    const totalInterest = reportData.reduce((sum, loan) => sum + (loan.TOTAL_INTEREST || 0), 0);
    const totalRepayment = reportData.reduce((sum, loan) => sum + (loan.TOTAL_REPAYMENT || 0), 0);

    // Ensure totals are not NaN
    const safeTotals = {
      disbursement: isNaN(totalDisbursement) ? 0 : totalDisbursement,
      interest: isNaN(totalInterest) ? 0 : totalInterest,
      repayment: isNaN(totalRepayment) ? 0 : totalRepayment
    };

    // For Excel: Append totals row (inline in table)
    let dataForExcel = [...reportData];
    if (format === "excel") {
      dataForExcel.push({
        CUST_ID: 'TOTALS',
        ACCT_NM: '',
        ACCT_NO: '',
        APPL_ID: '',
        PRODUCT_TYPE: '',
        PROD_ID: '',
        REPAYMENT_SOURCE_ACCOUNT: '',
        BU_ID: '',
        PRIMARY_OFFICER_ID: '',
        ACTUAL_DISBURSEMENT: safeTotals.disbursement,
        START_DT: '',
        MATURITY_DT: '',
        INTEREST_RATE: '',
        LOAN_STATUS: '',
        TOTAL_INTEREST: safeTotals.interest,
        TOTAL_REPAYMENT: safeTotals.repayment,
      });
    }

    // For PDF: Use only main data (totals rendered separately below table)
    const dataForReport = format === "pdf" ? reportData : dataForExcel;

    const fields = [
      { key: "CUST_ID", displayName: "Customer ID", type: "string" }, // Aligned type from router (string, not number)
      { key: "ACCT_NM", displayName: "Account Name", type: "string" },
      { key: "ACCT_NO", displayName: "Account No", type: "string" },
      { key: "APPL_ID", displayName: "Application ID", type: "string" },
      { key: "PRODUCT_TYPE", displayName: "Product Type", type: "string" },
      { key: "PROD_ID", displayName: "Product ID", type: "string" },
      { key: "REPAYMENT_SOURCE_ACCOUNT", displayName: "Repayment Source Account", type: "string" },
      { key: "BU_ID", displayName: "Business Unit ID", type: "string" },
      { key: "PRIMARY_OFFICER_ID", displayName: "Primary Officer ID", type: "string" },
      { key: "ACTUAL_DISBURSEMENT", displayName: "Actual Disbursement", type: "number" },
      { key: "START_DT", displayName: "Start Date", type: "date" },
      { key: "MATURITY_DT", displayName: "Maturity Date", type: "date" },
      { key: "INTEREST_RATE", displayName: "Interest Rate (%)", type: "number" },
      { key: "LOAN_STATUS", displayName: "Loan Status", type: "string" },
      { key: "TOTAL_INTEREST", displayName: "Total Interest", type: "number" },
      { key: "TOTAL_REPAYMENT", displayName: "Total Repayment", type: "number" },
    ];

    // Generate title with filter info (aligned with router example)
    let filterText = '';
    if (buId) filterText += ` for BU_ID: ${buId}`;
    if (startDate && endDate) filterText += `${filterText ? ' and ' : ' for '}date range ${startDate} to ${endDate}`;
    if (!filterText) filterText = ' (All)';
    const title = `Loan Portfolio Report${filterText} - Generated on ${new Date().toLocaleDateString('en-NG')}`;

    // Pass totals data to PDF generator for separate rendering below table
    const pdfOptions = format === "pdf" ? {
      totals: safeTotals
    } : {};

    if (format === "excel") {
      const filePath = generateExcelReport(dataForExcel, "loan_portfolio", fields, title); // Removed await (sync function)
      return res.download(filePath, "Loan_Portfolio_Report.xlsx");
    }

    generateReport("loan_portfolio", dataForReport, fields, title, res, pdfOptions);
  } catch (error) {
    console.error("Error generating loan portfolio report:", error.message);
    res.status(500).json({
      success: false,
      message: "Error generating loan portfolio report",
      error: error.message,
    });
  }
}; 