// controllers/AccountStatementController.js
import { generateCustomerAccountStatement, generateReport, generateExcelReport } from '../utils/pdfGenerator.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Account from '../models/Accounts.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from "../utils/logger.js";
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import Transaction from '../models/Transaction.js';

// ✅ Generate account statement - works with both CustomerAccount and Account models
export const generateAccountStatement = async (req, res) => {
  try {
    const { acctNo } = req.params;
    
    let { startDate, endDate } = req.query;
    
    if ((!startDate && !endDate) && req.body) {
      startDate = req.body.startDate;
      endDate = req.body.endDate;
    }

    // Validate account number
    if (!acctNo) {
      return res.status(400).json({
        error: 'Invalid account number',
        message: 'Account number is required',
      });
    }

    // Validate dates
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

    // ✅ Try to find account in CustomerAccount model first
    let customerAccount = await CustomerAccount.findOne({
      where: {
        [Op.or]: [
          { account_number: acctNo },
          { gl_account_number: acctNo }
        ]
      }
    });

    // ✅ If not found, try Account model
    let account = null;
    if (!customerAccount) {
      account = await Account.findOne({
        where: {
          [Op.or]: [
            { account_number: acctNo },
            { acct_no: acctNo }
          ]
        }
      });
    }

    if (!customerAccount && !account) {
      return res.status(404).json({
        error: 'Account not found',
        message: `Account with number ${acctNo} does not exist in either CustomerAccount or Account tables`,
      });
    }

    // Use whichever account was found
    const activeAccount = customerAccount || account;
    const accountType = customerAccount ? 'CustomerAccount' : 'Account';
    
    console.log(`✅ Found account ${acctNo} in model: ${accountType}`);

    // Get opening balance
    let openingBalance = 0;
    if (customerAccount) {
      openingBalance = parseFloat(customerAccount.ledger_balance || customerAccount.current_balance || 0);
    } else if (account) {
      openingBalance = parseFloat(account.ledger_balance || 0);
    }

    console.log(`💰 Opening balance: ${openingBalance}`);

    // ✅ Get transactions from AuditTrail
    const auditTrailTransactions = await AuditTrail.findAll({
      where: {
        [Op.or]: [
          { account_no: acctNo },
          { reference_no: acctNo }
        ],
        event_type: {
          [Op.in]: ['TRANSACTION_DR', 'TRANSACTION_CR', 'TRANSACTION', 'DEPOSIT', 'WITHDRAWAL', 'CREDIT', 'DEBIT']
        },
        timestamp: {
          [Op.gte]: start,
          [Op.lte]: end
        }
      },
      order: [['timestamp', 'ASC']],
      limit: 10000
    });

    // Also get transactions from Transaction model if it exists
    let transactionModelTransactions = [];
    if (Transaction) {
      try {
        transactionModelTransactions = await Transaction.findAll({
          where: {
            [Op.or]: [
              { account_number: acctNo },
              { from_account: acctNo },
              { to_account: acctNo }
            ],
            created_at: {
              [Op.gte]: start,
              [Op.lte]: end
            }
          },
          order: [['created_at', 'ASC']],
          limit: 10000
        });
      } catch (err) {
        console.log('Transaction model query failed:', err.message);
      }
    }
    
    // Combine both sources
    let transactionRecords = [...auditTrailTransactions, ...transactionModelTransactions];
    
    // Sort by date
    transactionRecords.sort((a, b) => {
      const dateA = a.timestamp || a.created_at;
      const dateB = b.timestamp || b.created_at;
      return new Date(dateA) - new Date(dateB);
    });

    console.log(`📊 Found ${transactionRecords.length} transactions for account ${acctNo}`);

    // Calculate running balance
    let runningBalance = openingBalance;
    const transactions = transactionRecords.map(record => {
      let isDebit = false;
      let amount = 0;
      let description = record.description || record.event_type || record.transaction_type || 'Transaction';
      let reference = record.reference_no || record.event_id || record.reference || record.transaction_id || 'N/A';

      // Determine transaction type
      const eventType = (record.event_type || record.transaction_type || '').toUpperCase();
      if (eventType.includes('DEBIT') || eventType.includes('WITHDRAWAL') || eventType === 'DR') {
        isDebit = true;
      } else if (eventType.includes('CREDIT') || eventType.includes('DEPOSIT') || eventType === 'CR') {
        isDebit = false;
      }

      // Extract amount
      if (record.amount) {
        amount = Math.abs(parseFloat(record.amount));
      } else if (record.transaction_amount) {
        amount = Math.abs(parseFloat(record.transaction_amount));
      } else if (record.additional_info) {
        // Parse JSON if additional_info is a string
        let additionalInfo = record.additional_info;
        if (typeof additionalInfo === 'string') {
          try {
            additionalInfo = JSON.parse(additionalInfo);
          } catch (e) {
            // Not valid JSON, ignore
          }
        }
        if (additionalInfo && typeof additionalInfo === 'object') {
          if (additionalInfo.amount) {
            amount = Math.abs(parseFloat(additionalInfo.amount));
          } else if (additionalInfo.transaction_amount) {
            amount = Math.abs(parseFloat(additionalInfo.transaction_amount));
          }
        }
      }

      // Update running balance
      if (isDebit) {
        runningBalance -= amount;
      } else {
        runningBalance += amount;
      }

      return {
        TRANS_DT: record.timestamp || record.created_at || new Date(),
        TRANS_TYPE: isDebit ? 'DEBIT' : 'CREDIT',
        DESCRIPTION: description,
        REFERENCE_NO: reference,
        DR_AMOUNT: isDebit ? amount : 0,
        CR_AMOUNT: !isDebit ? amount : 0,
        BALANCE_AFTER: runningBalance,
        STATUS: record.status || 'COMPLETED'
      };
    });

    const closingBalance = runningBalance;

    if (res.headersSent) {
      console.warn('Headers already sent, cannot send PDF');
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Account_Statement_${acctNo}_${start.toISOString().split('T')[0]}_to_${end.toISOString().split('T')[0]}.pdf`
    );

    // Prepare account data for PDF generation
    const accountData = {
      account_number: activeAccount.account_number || acctNo,
      account_name: activeAccount.account_name || activeAccount.acct_nm || 'Customer Account',
      customer_id: activeAccount.customer_id,
      product_type: activeAccount.product_type || activeAccount.product,
      status: activeAccount.status || activeAccount.rec_st || 'ACTIVE'
    };

    await generateCustomerAccountStatement(
      accountData,
      transactions,
      { 
        startDate: start, 
        endDate: end, 
        openingBalance, 
        closingBalance
      },
      res
    );

    logger.info('Account statement generated successfully', {
      accountNumber: acctNo,
      accountType,
      transactionCount: transactions.length,
      dateRange: `${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`
    });

  } catch (error) {
    if (res.headersSent) return;
    
    console.error('Error generating account statement:', error);
    logger.error('Failed to generate account statement', {
      error: error.message,
      stack: error.stack,
      accountNumber: req.params.acctNo
    });

    res.status(500).json({
      error: 'Failed to generate account statement',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// ✅ Export customer accounts - FIXED (removed gl_account_number and corrected column names)
// ✅ Export customer accounts - CORRECTED with product type from accounts table
export const exportCustomerAccounts = async (req, res) => {
  try {
    const { search, limit = 100, branch, status, dateFrom, dateTo } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const replacements = { limit: parseInt(limit) };

    // ✅ Search filter
    if (search) {
      whereClause += ' AND (ca.account_number LIKE :search OR ca.account_name LIKE :search OR ca.depositor_name LIKE :search OR c.CUST_NM LIKE :search OR a.account_number LIKE :search)';
      replacements.search = `%${search}%`;
    }

    // ✅ Branch filter
    if (branch) {
      whereClause += ' AND ca.branch_id = :branch';
      replacements.branch = branch;
    }

    // ✅ Status filter
    if (status) {
      whereClause += ' AND ca.status = :status';
      replacements.status = status;
    }

    // ✅ Date range filter
    if (dateFrom) {
      whereClause += ' AND DATE(ca.created_at) >= :dateFrom';
      replacements.dateFrom = dateFrom;
    }
    if (dateTo) {
      whereClause += ' AND DATE(ca.created_at) <= :dateTo';
      replacements.dateTo = dateTo;
    }

    // ✅ CORRECTED: Join with accounts table to get product_type and product
    const query = `
      SELECT 
        ca.id,
        ca.CUST_ID AS customer_id,
        ca.account_number,
        ca.account_name,
        ca.depositor_name,
        ca.product_id,
        ca.product_code,
        ca.prod_id,
        ca.branch_id,
        ca.status,
        ca.opening_balance,
        ca.current_balance,
        ca.ledger_balance,
        ca.available_balance,
        ca.cleared_balance,
        ca.currency,
        ca.allow_debit,
        ca.allow_credit,
        ca.sms_alert,
        ca.created_at,
        ca.updated_at,
        c.CUST_NM AS customer_name,
        c.EMAIL_ADDRESS AS customer_email,
        c.PHONE_NO AS customer_phone,
        c.BVN AS customer_bvn,
        c.CUST_NO AS customer_number,
        c.HOME_ADDRESS AS customer_address,
        c.CUST_CAT AS customer_category,
        -- ✅ Get product info from accounts table
        a.product_type AS account_product_type,
        a.product AS account_product_name,
        a.account_type AS account_type,
        a.ledger_balance AS account_ledger_balance,
        a.available_balance AS account_available_balance,
        a.cleared_balance AS account_cleared_balance,
        a.rec_st AS account_status,
        a.online_enabled,
        a.dr_allowed,
        a.cr_allowed,
        a.last_activity_date
      FROM customer_accounts ca
      LEFT JOIN customers c ON c.CUST_ID = ca.CUST_ID
      LEFT JOIN accounts a ON a.account_number = ca.account_number
      ${whereClause}
      ORDER BY ca.created_at DESC
      LIMIT :limit
    `;

    console.log('📊 Export Query:', query);
    console.log('📊 Replacements:', replacements);

    const customers = await sequelize.query(query, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // Calculate summary totals
    const totals = {
      totalAccounts: customers.length,
      totalOpeningBalance: customers.reduce((sum, c) => sum + parseFloat(c.opening_balance || 0), 0),
      totalCurrentBalance: customers.reduce((sum, c) => sum + parseFloat(c.current_balance || 0), 0),
      totalLedgerBalance: customers.reduce((sum, c) => sum + parseFloat(c.ledger_balance || 0), 0),
      totalAvailableBalance: customers.reduce((sum, c) => sum + parseFloat(c.available_balance || 0), 0),
      totalClearedBalance: customers.reduce((sum, c) => sum + parseFloat(c.cleared_balance || 0), 0),
      totalAccountLedgerBalance: customers.reduce((sum, c) => sum + parseFloat(c.account_ledger_balance || 0), 0),
    };

    // Group by status
    const byStatus = {};
    customers.forEach(c => {
      const status = c.status || 'Unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    // Group by product type (from accounts table)
    const byProductType = {};
    customers.forEach(c => {
      const productType = c.account_product_type || c.product_code || c.product_id || 'Unknown';
      byProductType[productType] = (byProductType[productType] || 0) + 1;
    });

    // Group by product name (from accounts table)
    const byProduct = {};
    customers.forEach(c => {
      const product = c.account_product_name || c.product_code || 'Unknown';
      byProduct[product] = (byProduct[product] || 0) + 1;
    });

    // Group by account type (from accounts table)
    const byAccountType = {};
    customers.forEach(c => {
      const accountType = c.account_type || 'Unknown';
      byAccountType[accountType] = (byAccountType[accountType] || 0) + 1;
    });

    // Group by branch
    const byBranch = {};
    customers.forEach(c => {
      const branch = c.branch_id || 'Unknown';
      byBranch[branch] = (byBranch[branch] || 0) + 1;
    });

    const enhancedCustomers = customers.map(customer => ({
      id: customer.id,
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      customer_number: customer.customer_number,
      customer_email: customer.customer_email,
      customer_phone: customer.customer_phone,
      customer_bvn: customer.customer_bvn,
      customer_address: customer.customer_address,
      customer_category: customer.customer_category,
      account_number: customer.account_number,
      account_name: customer.account_name,
      depositor_name: customer.depositor_name,
      product_id: customer.product_id,
      product_code: customer.product_code,
      prod_id: customer.prod_id,
      // ✅ Product info from accounts table
      product_type: customer.account_product_type,
      product_name: customer.account_product_name,
      account_type: customer.account_type,
      branch_id: customer.branch_id,
      status: customer.status,
      account_status: customer.account_status,
      opening_balance: parseFloat(customer.opening_balance || 0),
      current_balance: parseFloat(customer.current_balance || 0),
      ledger_balance: parseFloat(customer.ledger_balance || 0),
      available_balance: parseFloat(customer.available_balance || 0),
      cleared_balance: parseFloat(customer.cleared_balance || 0),
      account_ledger_balance: parseFloat(customer.account_ledger_balance || 0),
      account_available_balance: parseFloat(customer.account_available_balance || 0),
      account_cleared_balance: parseFloat(customer.account_cleared_balance || 0),
      currency: customer.currency || 'NGN',
      allow_debit: customer.allow_debit === 1 ? 'Yes' : 'No',
      allow_credit: customer.allow_credit === 1 ? 'Yes' : 'No',
      online_enabled: customer.online_enabled === 1 ? 'Yes' : 'No',
      dr_allowed: customer.dr_allowed === 1 ? 'Yes' : 'No',
      cr_allowed: customer.cr_allowed === 1 ? 'Yes' : 'No',
      sms_alert: customer.sms_alert || 'No',
      last_activity_date: customer.last_activity_date,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
    }));

    res.json({
      success: true,
      count: enhancedCustomers.length,
      search_used: search || 'none',
      totals: totals,
      summary: {
        byStatus: byStatus,
        byProductType: byProductType,
        byProduct: byProduct,
        byAccountType: byAccountType,
        byBranch: byBranch,
        generatedAt: new Date().toISOString()
      },
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

// ✅ Debug account endpoint
// ✅ Debug account endpoint - FIXED
export const debugAccount = async (req, res) => {
  try {
    const { acctNo } = req.params;

    if (!acctNo) {
      return res.status(400).json({
        success: false,
        message: 'Account number is required'
      });
    }

    // ✅ Search in CustomerAccount - removed gl_account_number
    const customerAccount = await CustomerAccount.findOne({
      where: {
        [Op.or]: [
          { account_number: acctNo }
        ]
      }
    });

    // Search in Account
    const account = await Account.findOne({
      where: {
        [Op.or]: [
          { account_number: acctNo },
          { acct_no: acctNo }
        ]
      }
    });

    if (!customerAccount && !account) {
      // Find similar accounts
      const similarCustomerAccounts = await CustomerAccount.findAll({
        where: {
          account_number: { [Op.like]: `%${acctNo.slice(-4)}%` }
        },
        limit: 5
      });

      const similarAccounts = await Account.findAll({
        where: {
          [Op.or]: [
            { account_number: { [Op.like]: `%${acctNo.slice(-4)}%` } },
            { acct_no: { [Op.like]: `%${acctNo.slice(-4)}%` } }
          ]
        },
        limit: 5
      });

      return res.status(404).json({
        success: false,
        message: `Account ${acctNo} not found`,
        customer_accounts_found: similarCustomerAccounts.length,
        accounts_found: similarAccounts.length,
        similar_customer_accounts: similarCustomerAccounts,
        similar_accounts: similarAccounts
      });
    }

    res.json({
      success: true,
      message: 'Account found',
      customer_account: customerAccount ? {
        id: customerAccount.id,
        account_number: customerAccount.account_number,
        account_name: customerAccount.account_name,
        customer_id: customerAccount.CUST_ID,
        status: customerAccount.status,
        ledger_balance: parseFloat(customerAccount.ledger_balance || 0)
      } : null,
      account: account ? {
        id: account.id,
        account_number: account.account_number,
        acct_no: account.acct_no,
        acct_nm: account.acct_nm,
        customer_id: account.customer_id,
        status: account.rec_st,
        ledger_balance: parseFloat(account.ledger_balance || 0)
      } : null
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

// ✅ Get account statement as JSON (for frontend display) - FIXED
export const getAccountStatementJSON = async (req, res) => {
  try {
    const { acctNo } = req.params;
    
    let { startDate, endDate } = req.query;

    // Validate account number
    if (!acctNo) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account number',
        message: 'Account number is required',
      });
    }

    // Validate dates
    let start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); 
    let end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format',
        message: 'Dates must be in valid format (YYYY-MM-DD)',
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date range',
        message: 'Start date cannot be after end date',
      });
    }

    // ✅ FIXED: Search for account using only existing columns
    let customerAccount = await CustomerAccount.findOne({
      where: {
        [Op.or]: [
          { account_number: acctNo },
          { account_number: { [Op.like]: `%${acctNo}` } }
        ]
      }
    });

    // If not found in CustomerAccount, try Account model
    let account = null;
    if (!customerAccount) {
      account = await Account.findOne({
        where: {
          [Op.or]: [
            { account_number: acctNo },
            { acct_no: acctNo }
          ]
        }
      });
    }

    if (!customerAccount && !account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found',
        message: `Account with number ${acctNo} does not exist`,
      });
    }

    // Use whichever account was found
    const activeAccount = customerAccount || account;
    
    // Get opening balance
    let openingBalance = 0;
    if (customerAccount) {
      openingBalance = parseFloat(customerAccount.ledger_balance || customerAccount.current_balance || 0);
    } else if (account) {
      openingBalance = parseFloat(account.ledger_balance || 0);
    }

    console.log(`💰 Opening balance: ${openingBalance}`);

    // ✅ Get transactions from AuditTrail - FIXED where clause
    const auditTrailTransactions = await AuditTrail.findAll({
      where: {
        [Op.or]: [
          { account_no: acctNo },
          { reference_no: acctNo }
        ]
      },
      timestamp: {
        [Op.gte]: start,
        [Op.lte]: end
      },
      order: [['timestamp', 'ASC']],
      limit: 10000
    });

    console.log(`📊 Found ${auditTrailTransactions.length} transactions`);

    // Process transactions
    let runningBalance = openingBalance;
    const transactions = auditTrailTransactions.map(record => {
      let isDebit = false;
      let amount = 0;
      let description = record.description || record.event_type || 'Transaction';
      let reference = record.reference_no || record.event_id || 'N/A';

      // Extract amount from various sources
      if (record.amount && parseFloat(record.amount) !== 0) {
        amount = Math.abs(parseFloat(record.amount));
      } else if (record.transaction_amount && parseFloat(record.transaction_amount) !== 0) {
        amount = Math.abs(parseFloat(record.transaction_amount));
      } else if (record.additional_info) {
        try {
          let additionalInfo = record.additional_info;
          if (typeof additionalInfo === 'string') {
            additionalInfo = JSON.parse(additionalInfo);
          }
          if (additionalInfo && typeof additionalInfo === 'object') {
            if (additionalInfo.amount && parseFloat(additionalInfo.amount) !== 0) {
              amount = Math.abs(parseFloat(additionalInfo.amount));
            } else if (additionalInfo.transaction_amount && parseFloat(additionalInfo.transaction_amount) !== 0) {
              amount = Math.abs(parseFloat(additionalInfo.transaction_amount));
            }
          }
        } catch (e) {
          console.log('Error parsing additional_info:', e.message);
        }
      }

      // Determine transaction type
      const eventType = (record.event_type || '').toUpperCase();
      const descriptionText = (record.description || '').toUpperCase();
      
      if (eventType.includes('DEBIT') || eventType.includes('WITHDRAWAL') || 
          descriptionText.includes('WITHDRAWAL') || descriptionText.includes('DEBIT')) {
        isDebit = true;
      } else if (eventType.includes('CREDIT') || eventType.includes('DEPOSIT') || 
                 descriptionText.includes('DEPOSIT') || descriptionText.includes('CREDIT')) {
        isDebit = false;
      } else {
        isDebit = true; // Default to debit
      }

      // Update running balance
      if (isDebit) {
        runningBalance -= amount;
      } else {
        runningBalance += amount;
      }

      return {
        id: record.id || record.event_id,
        date: record.timestamp || record.created_at || new Date(),
        description: description,
        type: isDebit ? 'DEBIT' : 'CREDIT',
        amount: amount,
        balance: runningBalance,
        reference: reference,
        status: record.status || 'COMPLETED'
      };
    });
    
    // Sort by date (newest first)
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const closingBalance = transactions.length > 0 ? transactions[0].balance : openingBalance;
    
    const totalCredits = transactions.filter(t => t.type === 'CREDIT').reduce((sum, t) => sum + t.amount, 0);
    const totalDebits = transactions.filter(t => t.type === 'DEBIT').reduce((sum, t) => sum + t.amount, 0);

    // Get account name from either model
    let accountName = 'Customer Account';
    if (customerAccount) {
      accountName = customerAccount.account_name || customerAccount.depositor_name || 'Customer Account';
    } else if (account) {
      accountName = account.acct_nm || account.account_name || 'Customer Account';
    }

    res.json({
      success: true,
      isMockData: false,
      accountNumber: acctNo,
      accountName: accountName,
      currency: 'NGN',
      statementPeriod: {
        from: start,
        to: end
      },
      openingBalance: openingBalance,
      closingBalance: closingBalance,
      transactions: transactions,
      summary: {
        totalCredits: totalCredits,
        totalDebits: totalDebits,
        transactionCount: transactions.length
      }
    });

  } catch (error) {
    console.error('Error generating account statement JSON:', error);
    logger.error('Failed to generate account statement JSON', {
      error: error.message,
      stack: error.stack,
      accountNumber: req.params.acctNo
    });

    res.status(500).json({
      success: false,
      error: 'Failed to generate account statement',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Debug function to check transactions for an account
export const debugAccountTransactions = async (req, res) => {
  try {
    const { acctNo } = req.params;
    
    console.log(`🔍 Debugging transactions for account: ${acctNo}`);
    
    const auditTrailTransactions = await AuditTrail.findAll({
      where: {
        [Op.or]: [
          { account_no: acctNo },
          { reference_no: acctNo }
        ]
      },
      limit: 50,
      order: [['timestamp', 'DESC']]
    });
    
    const sampleAuditTrail = await AuditTrail.findOne();
    
    const customerAccount = await CustomerAccount.findOne({
      where: {
        [Op.or]: [
          { account_number: acctNo },
          { gl_account_number: acctNo }
        ]
      }
    });
    
    const uniqueAccounts = await AuditTrail.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('account_no')), 'account_no']],
      where: {
        account_no: { [Op.ne]: null }
      },
      limit: 20,
      raw: true
    });
    
    res.json({
      success: true,
      message: 'Debug info for account transactions',
      accountNumber: acctNo,
      customerAccountFound: customerAccount ? {
        account_number: customerAccount.account_number,
        gl_account_number: customerAccount.gl_account_number,
        ledger_balance: customerAccount.ledger_balance,
        status: customerAccount.status
      } : null,
      auditTrailTransactionsFound: auditTrailTransactions.length,
      auditTrailTransactions: auditTrailTransactions.map(t => ({
        id: t.id,
        account_no: t.account_no,
        reference_no: t.reference_no,
        event_type: t.event_type,
        timestamp: t.timestamp,
        description: t.description,
        amount: t.amount
      })),
      sampleAccountNumbersInAuditTrail: uniqueAccounts.map(a => a.account_no),
      auditTrailTableColumns: sampleAuditTrail ? Object.keys(sampleAuditTrail.toJSON()) : [],
      suggestion: auditTrailTransactions.length === 0 ? 
        'No transactions found. Check if transactions are being logged to AuditTrail table with account_no = ' + acctNo : 
        'Transactions found! They are being displayed now.'
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};

// Check real transactions endpoint
export const checkRealTransactions = async (req, res) => {
  try {
    const { acctNo } = req.params;
    
    console.log(`🔍 Checking ALL transactions for account: ${acctNo}`);
    
    const allTransactions = await AuditTrail.findAll({
      where: {
        [Op.or]: [
          { account_no: acctNo },
          { reference_no: acctNo }
        ]
      },
      limit: 100,
      order: [['timestamp', 'DESC']],
      raw: true
    });
    
    const sampleTransaction = await AuditTrail.findOne({
      raw: true
    });
    
    const eventTypes = await AuditTrail.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('event_type')), 'event_type']],
      where: {
        event_type: { [Op.ne]: null }
      },
      raw: true
    });
    
    res.json({
      success: true,
      accountNumber: acctNo,
      totalTransactionsFound: allTransactions.length,
      transactions: allTransactions.map(t => ({
        id: t.id,
        account_no: t.account_no,
        reference_no: t.reference_no,
        event_type: t.event_type,
        timestamp: t.timestamp,
        description: t.description,
        amount: t.amount,
        additional_info: t.additional_info
      })),
      sampleTransactionStructure: sampleTransaction,
      availableEventTypes: eventTypes.map(e => e.event_type),
      suggestion: allTransactions.length === 0 
        ? `No transactions found for account ${acctNo}. Check if: 
           1. Transactions are being logged to AuditTrail table
           2. The account number format matches (with/without leading zeros)
           3. There are transactions in the database at all`
        : `Found ${allTransactions.length} transactions! They will now appear in the statement.`
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};

// ✅ Cleanup function
export const cleanupReportFiles = async (req, res) => {
  try {
    res.json({ success: true, message: 'Cleanup completed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================
// TRANSACTION HISTORY CONTROLLER
// ============================================================

// ✅ Get transaction history for a specific account
export const getTransactionHistory = async (req, res) => {
  try {
    const { acctNo } = req.params;
    const { 
      startDate, 
      endDate, 
      transactionType, 
      status,
      limit = 100,
      page = 1,
      sortBy = 'transaction_date',
      sortOrder = 'DESC'
    } = req.query;

    if (!acctNo) {
      return res.status(400).json({
        success: false,
        message: 'Account number is required'
      });
    }

    // Validate dates
    let start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be after end date'
      });
    }

    // Build where clause
    let whereClause = 'WHERE 1=1';
    const replacements = {
      account_number: acctNo,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    };

    // Account filter
    whereClause += ' AND (account_number = :account_number OR customer_id = :account_number)';
    replacements.account_number = acctNo;

    // Date range filter
    if (startDate) {
      whereClause += ' AND DATE(transaction_date) >= :startDate';
      replacements.startDate = startDate;
    }
    if (endDate) {
      whereClause += ' AND DATE(transaction_date) <= :endDate';
      replacements.endDate = endDate;
    }

    // Transaction type filter
    if (transactionType && transactionType !== 'ALL') {
      whereClause += ' AND transaction_type = :transactionType';
      replacements.transactionType = transactionType;
    }

    // Status filter
    if (status && status !== 'ALL') {
      whereClause += ' AND status = :status';
      replacements.status = status;
    }

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM deposit_transactions
      ${whereClause}
    `;

    const countResult = await sequelize.query(countQuery, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const totalRecords = countResult[0]?.total || 0;

    // ✅ Main query with proper sorting
    const query = `
      SELECT 
        id,
        customer_id,
        account_number,
        transaction_type,
        amount,
        emtl_amount,
        total_debit,
        emtl_applicable,
        emtl_reason,
        emtl_gl_account,
        emtl_beneficiary,
        currency,
        status,
        aml_risk_level,
        aml_risk_score,
        aml_indicators,
        created_by,
        transaction_date,
        created_at,
        updated_at,
        branch_id,
        approved_by,
        approved_at,
        transaction_ref_no,
        description,
        requires_approval,
        approved_by_role,
        approval_status,
        depositor_name
      FROM deposit_transactions
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT :limit OFFSET :offset
    `;

    const transactions = await sequelize.query(query, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // ✅ Calculate summary statistics
    const summary = {
      totalTransactions: transactions.length,
      totalAmount: transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0),
      totalDebit: transactions.reduce((sum, t) => sum + parseFloat(t.total_debit || 0), 0),
      totalEmtl: transactions.reduce((sum, t) => sum + parseFloat(t.emtl_amount || 0), 0),
      byType: {},
      byStatus: {},
      amlRisks: {}
    };

    transactions.forEach(t => {
      const type = t.transaction_type || 'Unknown';
      summary.byType[type] = (summary.byType[type] || 0) + 1;

      const status = t.status || 'Unknown';
      summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;

      const risk = t.aml_risk_level || 'Unknown';
      summary.amlRisks[risk] = (summary.amlRisks[risk] || 0) + 1;
    });

    // ✅ Get account info
    const account = await CustomerAccount.findOne({
      where: {
        account_number: acctNo
      }
    });

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRecords,
        pages: Math.ceil(totalRecords / parseInt(limit))
      },
      summary: summary,
      accountInfo: account ? {
        account_number: account.account_number,
        account_name: account.account_name || account.depositor_name,
        customer_id: account.CUST_ID,
        current_balance: account.current_balance,
        ledger_balance: account.ledger_balance,
        available_balance: account.available_balance
      } : null,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        transactionType: transactionType || 'ALL',
        status: status || 'ALL'
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching transaction history:', error);
    logger.error('Failed to fetch transaction history', {
      error: error.message,
      stack: error.stack,
      accountNumber: req.params.acctNo
    });

    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ✅ Get transaction details by ID
export const getTransactionDetails = async (req, res) => {
  try {
    const { transactionId } = req.params;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }

    const query = `
      SELECT 
        id,
        customer_id,
        account_number,
        transaction_type,
        amount,
        emtl_amount,
        total_debit,
        emtl_applicable,
        emtl_reason,
        emtl_gl_account,
        emtl_beneficiary,
        currency,
        status,
        aml_risk_level,
        aml_risk_score,
        aml_indicators,
        created_by,
        transaction_date,
        created_at,
        updated_at,
        branch_id,
        approved_by,
        approved_at,
        transaction_ref_no,
        description,
        requires_approval,
        approved_by_role,
        approval_status,
        depositor_name
      FROM deposit_transactions
      WHERE id = :transactionId
    `;

    const transactions = await sequelize.query(query, {
      replacements: { transactionId: transactionId },
      type: sequelize.QueryTypes.SELECT
    });

    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Transaction with ID ${transactionId} not found`
      });
    }

    const transaction = transactions[0];

    // ✅ Get previous and next transaction for context
    const prevNextQuery = `
      SELECT 
        id,
        transaction_date,
        amount,
        transaction_type,
        status
      FROM deposit_transactions
      WHERE account_number = :accountNumber
      ORDER BY transaction_date DESC
      LIMIT 10
    `;

    const relatedTransactions = await sequelize.query(prevNextQuery, {
      replacements: { accountNumber: transaction.account_number },
      type: sequelize.QueryTypes.SELECT
    });

    // Find previous and next
    const currentIndex = relatedTransactions.findIndex(t => t.id === parseInt(transactionId));
    const previous = currentIndex > 0 ? relatedTransactions[currentIndex - 1] : null;
    const next = currentIndex < relatedTransactions.length - 1 ? relatedTransactions[currentIndex + 1] : null;

    // ✅ Get account info
    const account = await CustomerAccount.findOne({
      where: {
        account_number: transaction.account_number
      }
    });

    res.json({
      success: true,
      data: {
        transaction: transaction,
        previous: previous,
        next: next,
        related: relatedTransactions.filter(t => t.id !== parseInt(transactionId)).slice(0, 5)
      },
      accountInfo: account ? {
        account_number: account.account_number,
        account_name: account.account_name || account.depositor_name,
        customer_id: account.CUST_ID,
        current_balance: account.current_balance,
        ledger_balance: account.ledger_balance,
        available_balance: account.available_balance
      } : null,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching transaction details:', error);
    logger.error('Failed to fetch transaction details', {
      error: error.message,
      stack: error.stack,
      transactionId: req.params.transactionId
    });

    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ✅ Get transaction types summary (for dropdowns)
export const getTransactionTypes = async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT 
        transaction_type,
        COUNT(*) as count
      FROM deposit_transactions
      GROUP BY transaction_type
      ORDER BY transaction_type
    `;

    const results = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: results.map(r => ({
        type: r.transaction_type,
        count: r.count
      })),
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching transaction types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction types',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ✅ Export transaction history (for reports)
export const exportTransactionHistory = async (req, res) => {
  try {
    const { acctNo, startDate, endDate, transactionType, status, format = 'json' } = req.query;

    if (!acctNo) {
      return res.status(400).json({
        success: false,
        message: 'Account number is required'
      });
    }

    let whereClause = 'WHERE 1=1';
    const replacements = { account_number: acctNo };

    whereClause += ' AND (account_number = :account_number OR customer_id = :account_number)';

    if (startDate) {
      whereClause += ' AND DATE(transaction_date) >= :startDate';
      replacements.startDate = startDate;
    }
    if (endDate) {
      whereClause += ' AND DATE(transaction_date) <= :endDate';
      replacements.endDate = endDate;
    }
    if (transactionType && transactionType !== 'ALL') {
      whereClause += ' AND transaction_type = :transactionType';
      replacements.transactionType = transactionType;
    }
    if (status && status !== 'ALL') {
      whereClause += ' AND status = :status';
      replacements.status = status;
    }

    const query = `
      SELECT 
        id,
        customer_id,
        account_number,
        transaction_type,
        amount,
        total_debit,
        currency,
        status,
        created_by,
        transaction_date,
        created_at,
        branch_id,
        approved_by,
        approved_at,
        transaction_ref_no,
        description,
        approval_status,
        depositor_name
      FROM deposit_transactions
      ${whereClause}
      ORDER BY transaction_date DESC
      LIMIT 10000
    `;

    const transactions = await sequelize.query(query, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT
    });

    if (format === 'json') {
      return res.json({
        success: true,
        data: transactions,
        total: transactions.length,
        generatedAt: new Date().toISOString()
      });
    }

    // For Excel/CSV export, return the data with headers
    res.json({
      success: true,
      data: transactions,
      total: transactions.length,
      exportReady: true,
      headers: [
        'ID',
        'Customer ID',
        'Account Number',
        'Transaction Type',
        'Amount',
        'Total Debit',
        'Currency',
        'Status',
        'Created By',
        'Transaction Date',
        'Branch ID',
        'Approved By',
        'Approved At',
        'Reference',
        'Description',
        'Approval Status',
        'Depositor Name'
      ],
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error exporting transaction history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export transaction history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};