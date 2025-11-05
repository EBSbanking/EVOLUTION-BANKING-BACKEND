import { generateCustomerAccountStatement, generateReport, generateExcelReport, cleanupReportFiles } from '../utils/pdfGenerator.js';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from "../utils/logger.js";

// ✅ Generate account statement with optional date range (supports both query params and body)
export const generateAccountStatement = async (req, res) => {
  try {
    const { acctNo } = req.params;
    
    // Check both query params and body for dates
    let { startDate, endDate } = req.query;
    
    if ((!startDate && !endDate) && req.body) {
      startDate = req.body.startDate;
      endDate = req.body.endDate;
    }

    // 🔹 Validate account number
    if (!acctNo || !/^\d{10}$/.test(acctNo)) {
      return res.status(400).json({
        error: 'Invalid account number',
        message: 'Account number must be a 10-digit number',
      });
    }

    // 🔹 Validate dates
    let start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); 
    let end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'Dates must be in valid format (YYYY-MM-DD)',
      });
    }

    if (start > end) {
      return res.status(400).json({
        error: 'Invalid date range',
        message: 'Start date cannot be after end date',
      });
    }

    // 🔹 Get customer account
    const customerAccount = await CustomerAccount.findOne({ ACCT_NO: acctNo });
    if (!customerAccount) {
      return res.status(404).json({
        error: 'Account not found',
        message: `Account with number ${acctNo} does not exist`,
      });
    }

    // 🔹 Get opening balance
    let openingBalance = parseFloat(customerAccount.LEDGER_BAL?.toString() || 0);

    // 🔹 Get transactions
    const auditTrailTransactions = await AuditTrail.find({
      $or: [
        { account_no: acctNo },
        { 'additional_info.account_no': acctNo },
      ],
      event_type: { $in: ['TRANSACTION_DR', 'TRANSACTION_CR'] },
      timestamp: { $gte: start, $lte: end },
    }).sort({ timestamp: 1 });

    // 🔹 Calculate running balance
    let runningBalance = openingBalance;
    const transactions = auditTrailTransactions.map(record => {
      const isDebit = record.event_type === 'TRANSACTION_DR';
      const amount = parseFloat(record.additional_info?.amount || 0);

      if (isDebit) {
        runningBalance -= amount;
      } else {
        runningBalance += amount;
      }

      return {
        TRANS_DT: record.timestamp,
        TRANS_TYPE: isDebit ? 'DEBIT' : 'CREDIT',
        DESCRIPTION: record.description,
        REFERENCE_NO: record.reference_no,
        DR_AMOUNT: isDebit ? amount : 0,
        CR_AMOUNT: !isDebit ? amount : 0,
        BALANCE_AFTER: runningBalance,
        STATUS: record.status,
        IS_DEBIT: isDebit,
        DISPLAY_AMOUNT: amount
      };
    });

    const closingBalance = runningBalance;

    if (res.headersSent) {
      console.warn('Headers already sent, cannot send PDF');
      return;
    }

    // 🔹 Send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Account_Statement_${acctNo}_${start.toISOString().split('T')[0]}_to_${end.toISOString().split('T')[0]}.pdf`
    );

    await generateCustomerAccountStatement(
      customerAccount,
      transactions,
      { 
        startDate: start, 
        endDate: end, 
        openingBalance, 
        closingBalance 
      },
      res
    );
  } catch (error) {
    if (res.headersSent) {
      console.error('Error occurred after headers were sent:', error);
      return;
    }
    console.error('Error generating account statement:', error);
    res.status(500).json({
      error: 'Failed to generate account statement',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// ✅ Export all customer accounts (JSON response)
export const exportCustomerAccounts = async (req, res) => {
  try {
    const customers = await CustomerAccount.find().lean();
    res.json({
      success: true,
      count: customers.length,
      data: customers,
    });
  } catch (err) {
    logger.error("Error fetching customer accounts", { error: err.message, stack: err.stack });
    res.status(500).json({
      success: false,
      message: "Failed to fetch customer accounts",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};
