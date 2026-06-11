import { generateReport, generateExcelReport } from "../utils/pdfGenerator.js";
import CustomerAccount from "../models/CustomerAccount.js";


// Export Customer Accounts Report
export const exportCustomerAccounts = async (req, res) => {
  try {
    const { startDate, endDate, format = "pdf" } = req.query;

    // Build query filter
    const query = {};
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const accounts = await CustomerAccount.find(query).lean();

    if (!accounts || accounts.length === 0) {
      return res.status(404).json({ message: "No customer accounts found" });
    }

    const fields = [
      { key: "CUST_ID", displayName: "Customer ID", type: "number" },
      { key: "ACCT_ID", displayName: "Account ID", type: "string" },
      { key: "ACCT_NO", displayName: "Account Number", type: "string" },
      { key: "ACCT_NM", displayName: "Account Name", type: "string" },
      { key: "ACCOUNT_TYPE", displayName: "Account Type", type: "string" },
      { key: "PRODUCT_DESC", displayName: "Product Description", type: "string" },
      { key: "LEDGER_BAL", displayName: "Ledger Balance", type: "number" },
      { key: "AVAILABLE_BALANCE", displayName: "Available Balance", type: "number" },
      { key: "REC_ST", displayName: "Status", type: "string" },
      { key: "INTEREST_RATE", displayName: "Interest Rate", type: "number" },
      { key: "LAST_INTEREST_DATE", displayName: "Last Interest Date", type: "date" },
      { key: "createdAt", displayName: "Created At", type: "date" },
      { key: "updatedAt", displayName: "Updated At", type: "date" },
    ];

    const title = "Customer Accounts Report";

    if (format === "excel") {
      const filePath = await generateExcelReport(accounts, "customer_accounts", fields, title);
      return res.download(filePath, "Customer_Accounts_Report.xlsx");
    }

    generateReport("customer_accounts", accounts, fields, title, res);
  } catch (error) {
    console.error("Error generating customer accounts report:", error.message);
    res.status(500).json({
      message: "Error generating customer accounts report",
      error: error.message,
    });
  }
};




