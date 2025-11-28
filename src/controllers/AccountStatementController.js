import { generateCustomerAccountStatement, generateReport, generateExcelReport, cleanupReportFiles } from '../utils/pdfGenerator.js';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from "../utils/logger.js";

// ✅ Generate account statement with support for both legacy and new account formats
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

    // 🔹 Get customer account - UPDATED: Search in BOTH legacy and new fields
    const customerAccount = await CustomerAccount.findOne({
      $or: [
        { ACCT_NO: acctNo },           // Legacy format
        { account_number: acctNo }     // New format
      ]
    });

    if (!customerAccount) {
      // Enhanced debugging: Check what accounts exist with similar numbers
      const similarAccounts = await CustomerAccount.find({
        $or: [
          { ACCT_NO: { $regex: acctNo.slice(-4) } },
          { account_number: { $regex: acctNo.slice(-4) } }
        ]
      })
      .select('ACCT_NO account_number ACCT_NM status REC_ST')
      .limit(5)
      .lean();

      return res.status(404).json({
        error: 'Account not found',
        message: `Account with number ${acctNo} does not exist in either legacy (ACCT_NO) or new (account_number) systems`,
        searched_fields: ['ACCT_NO', 'account_number'],
        similar_accounts_found: similarAccounts,
        troubleshooting: [
          'Check if account exists in the database',
          'Verify account number format',
          'Check both ACCT_NO (legacy) and account_number (new) fields'
        ]
      });
    }

    // Determine which field was matched for logging
    const matchedField = customerAccount.ACCT_NO === acctNo ? 'ACCT_NO' : 
                        customerAccount.account_number === acctNo ? 'account_number' : 'unknown';

    console.log(`✅ Found account ${acctNo} in field: ${matchedField}`);
    console.log(`📝 Account details:`, {
      ACCT_NO: customerAccount.ACCT_NO,
      account_number: customerAccount.account_number,
      ACCT_NM: customerAccount.ACCT_NM,
      status: customerAccount.status || customerAccount.REC_ST
    });

    // 🔹 Get opening balance - handle both legacy and new balance fields
    let openingBalance = 0;
    
    // Try new format first, then legacy format
    if (customerAccount.ledger_balance !== undefined && customerAccount.ledger_balance !== null) {
      openingBalance = parseFloat(customerAccount.ledger_balance.toString() || 0);
    } else if (customerAccount.LEDGER_BAL !== undefined && customerAccount.LEDGER_BAL !== null) {
      openingBalance = parseFloat(customerAccount.LEDGER_BAL.toString() || 0);
    } else if (customerAccount.balance !== undefined && customerAccount.balance !== null) {
      openingBalance = parseFloat(customerAccount.balance.toString() || 0);
    }

    console.log(`💰 Opening balance: ${openingBalance}`);

    // 🔹 Get transactions - UPDATED: Search in multiple possible account number fields
    const auditTrailTransactions = await AuditTrail.find({
      $or: [
        { account_no: acctNo },
        { account_no: customerAccount.ACCT_NO },
        { account_no: customerAccount.account_number },
        { 'additional_info.account_no': acctNo },
        { 'additional_info.account_no': customerAccount.ACCT_NO },
        { 'additional_info.account_no': customerAccount.account_number },
        { 'additional_info.ACCT_NO': acctNo },
        { 'additional_info.account_number': acctNo }
      ],
      event_type: { $in: ['TRANSACTION_DR', 'TRANSACTION_CR', 'TRANSACTION', 'DEPOSIT', 'WITHDRAWAL'] },
      timestamp: { $gte: start, $lte: end },
    }).sort({ timestamp: 1 });

    console.log(`📊 Found ${auditTrailTransactions.length} transactions for account ${acctNo}`);

    // 🔹 Calculate running balance
    let runningBalance = openingBalance;
    const transactions = auditTrailTransactions.map(record => {
      // Determine transaction type and amount
      let isDebit = false;
      let amount = 0;

      // Handle different event types
      if (record.event_type === 'TRANSACTION_DR' || record.event_type === 'WITHDRAWAL') {
        isDebit = true;
      } else if (record.event_type === 'TRANSACTION_CR' || record.event_type === 'DEPOSIT') {
        isDebit = false;
      } else if (record.event_type === 'TRANSACTION') {
        // For generic TRANSACTION type, check amount or description
        isDebit = record.description?.toLowerCase().includes('debit') || 
                 record.description?.toLowerCase().includes('withdrawal') ||
                 (record.additional_info?.amount && parseFloat(record.additional_info.amount) < 0);
      }

      // Extract amount from various possible fields
      if (record.additional_info?.amount) {
        amount = Math.abs(parseFloat(record.additional_info.amount));
      } else if (record.amount) {
        amount = Math.abs(parseFloat(record.amount));
      } else {
        amount = 0;
      }

      // Update running balance
      if (isDebit) {
        runningBalance -= amount;
      } else {
        runningBalance += amount;
      }

      return {
        TRANS_DT: record.timestamp,
        TRANS_TYPE: isDebit ? 'DEBIT' : 'CREDIT',
        DESCRIPTION: record.description || 'Transaction',
        REFERENCE_NO: record.reference_no || record.event_id || 'N/A',
        DR_AMOUNT: isDebit ? amount : 0,
        CR_AMOUNT: !isDebit ? amount : 0,
        BALANCE_AFTER: runningBalance,
        STATUS: record.status || 'COMPLETED',
        IS_DEBIT: isDebit,
        DISPLAY_AMOUNT: amount,
        EVENT_TYPE: record.event_type
      };
    });

    const closingBalance = runningBalance;

    console.log(`📈 Statement summary:`, {
      openingBalance,
      closingBalance,
      transactionCount: transactions.length,
      dateRange: `${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`
    });

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
        closingBalance,
        matchedField: matchedField
      },
      res
    );

    // Log successful statement generation
    logger.info('Account statement generated successfully', {
      accountNumber: acctNo,
      matchedField,
      transactionCount: transactions.length,
      dateRange: `${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`,
      openingBalance,
      closingBalance
    });

  } catch (error) {
    if (res.headersSent) {
      console.error('Error occurred after headers were sent:', error);
      return;
    }
    
    console.error('Error generating account statement:', error);
    logger.error('Failed to generate account statement', {
      error: error.message,
      stack: error.stack,
      accountNumber: req.params.acctNo,
      timestamp: new Date()
    });

    res.status(500).json({
      error: 'Failed to generate account statement',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// ✅ Enhanced export function that shows all accounts for debugging
export const exportCustomerAccounts = async (req, res) => {
  try {
    const { search, limit = 100 } = req.query;
    
    let query = {};
    if (search) {
      query = {
        $or: [
          { ACCT_NO: { $regex: search, $options: 'i' } },
          { account_number: { $regex: search, $options: 'i' } },
          { ACCT_NM: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const customers = await CustomerAccount.find(query)
      .select('ACCT_NO account_number ACCT_NM customer_id CUST_ID status REC_ST product_type ACCOUNT_TYPE ledger_balance LEDGER_BAL available_balance AVAILABLE_BALANCE')
      .limit(parseInt(limit))
      .lean();

    // Add account type identification
    const enhancedCustomers = customers.map(customer => ({
      ...customer,
      account_type: customer.ACCT_NO ? 'legacy' : customer.account_number ? 'new' : 'unknown',
      effective_account_number: customer.account_number || customer.ACCT_NO,
      effective_balance: customer.ledger_balance || customer.LEDGER_BAL || 0
    }));

    res.json({
      success: true,
      count: enhancedCustomers.length,
      search_used: search || 'none',
      data: enhancedCustomers,
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

// ✅ NEW: Debug endpoint to check specific account
export const debugAccount = async (req, res) => {
  try {
    const { acctNo } = req.params;

    if (!acctNo) {
      return res.status(400).json({
        success: false,
        message: 'Account number is required'
      });
    }

    // Search in all possible fields
    const account = await CustomerAccount.findOne({
      $or: [
        { ACCT_NO: acctNo },
        { account_number: acctNo },
        { ACCT_NO: acctNo.padStart(10, '0') },
        { account_number: acctNo.padStart(10, '0') }
      ]
    })
    .select('ACCT_NO account_number ACCT_NM customer_id CUST_ID status REC_ST product_type ACCOUNT_TYPE ledger_balance LEDGER_BAL available_balance AVAILABLE_BALANCE CLEARED_BAL cleared_balance branch BU_ID')
    .lean();

    if (!account) {
      // Find similar accounts for debugging
      const similarAccounts = await CustomerAccount.find({
        $or: [
          { ACCT_NO: { $regex: acctNo.slice(-4) } },
          { account_number: { $regex: acctNo.slice(-4) } }
        ]
      })
      .select('ACCT_NO account_number ACCT_NM status REC_ST')
      .limit(10)
      .lean();

      return res.status(404).json({
        success: false,
        message: `Account ${acctNo} not found`,
        searched_fields: ['ACCT_NO', 'account_number'],
        similar_accounts: similarAccounts,
        total_accounts_in_db: await CustomerAccount.countDocuments()
      });
    }

    res.json({
      success: true,
      message: 'Account found',
      account: {
        ...account,
        account_type: account.ACCT_NO ? 'legacy' : account.account_number ? 'new' : 'unknown',
        effective_account_number: account.account_number || account.ACCT_NO,
        effective_balance: account.ledger_balance || account.LEDGER_BAL || 0
      },
      search_details: {
        searched_number: acctNo,
        matched_field: account.ACCT_NO === acctNo ? 'ACCT_NO' : 
                      account.account_number === acctNo ? 'account_number' : 'unknown'
      }
    });
  } catch (error) {
    console.error('Debug account error:', error);
    res.status(500).json({
      success: false,
      message: 'Error debugging account',
      error: error.message
    });
  }
};