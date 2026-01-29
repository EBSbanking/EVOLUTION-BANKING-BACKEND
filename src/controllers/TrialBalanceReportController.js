import GLAccount from '../models/GLAccount.js';
import Ledger from '../models/Ledger.js'; // ← Use Ledger model instead
import { generateReport, generateExcelReport, cleanupReportFiles } from '../utils/pdfGenerator.js';
import logger from '../utils/logger.js';
import { Op } from 'sequelize';

/**
 * Export Trial Balance report as PDF, Excel, or JSON
 */
export const exportTrialBalance = async (req, res, next) => {
  try {
    const { format = 'json', from, to, startDate, endDate } = req.query;

    console.log('Trial balance request received:', { format, from, to, startDate, endDate });

    const startParam = from || startDate;
    const endParam = to || endDate;

    if (!startParam || !endParam) {
      return res.status(400).json({
        success: false,
        message: 'Both start date and end date are required',
        timestamp: new Date().toISOString(),
      });
    }

    const start = new Date(startParam);
    const end = new Date(endParam);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format: Use YYYY-MM-DD',
        timestamp: new Date().toISOString(),
      });
    }
    
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be after end date',
        timestamp: new Date().toISOString(),
      });
    }

    console.log('Fetching ledger balances as of:', end);

    // Get all active GL accounts with their ledger balances using Sequelize
    const ledgers = await Ledger.findAll({ 
      where: { REC_ST: 'Active' },
      raw: true // Returns plain objects instead of model instances
    });
    console.log('Found', ledgers.length, 'active ledger accounts');

    // Get GL accounts for additional information
    const glAccounts = await GLAccount.findAll({ 
      where: { REC_ST: 'Active' },
      raw: true
    });
    console.log('Found', glAccounts.length, 'active GL accounts');

    // Create a map of GL account details for easy lookup
    const glAccountMap = {};
    glAccounts.forEach(acc => {
      glAccountMap[acc.GL_ACCT_NO] = acc;
    });

    // Prepare report data from ledger balances
    let reportData = ledgers.map((ledger) => {
      const glAccount = glAccountMap[ledger.GL_ACCT_NO] || {};
      
      // Determine debit/credit based on account category and balance
      let debit = 0;
      let credit = 0;
      
      // Parse LEDGER_BALANCE to number if it's a Decimal type
      const ledgerBalance = parseFloat(ledger.LEDGER_BALANCE) || 0;
      
      if (['ASSET', 'EXPENSE'].includes(ledger.GL_ACCT_CAT)) {
        // Assets and Expenses: Debit balance is positive, Credit balance is negative
        debit = Math.max(0, ledgerBalance);
        credit = Math.max(0, -ledgerBalance);
      } else {
        // Liabilities, Equity, Revenue: Credit balance is positive, Debit balance is negative
        credit = Math.max(0, ledgerBalance);
        debit = Math.max(0, -ledgerBalance);
      }
      
      return {
        GL_ACCT_NO: ledger.GL_ACCT_NO,
        ACCT_DESC: ledger.ACCT_DESC || glAccount.ACCT_DESC || '',
        GL_ACCT_CAT: ledger.GL_ACCT_CAT || glAccount.GL_ACCT_CAT || '',
        DEBIT: debit,
        CREDIT: credit,
        NET: ledgerBalance,
      };
    });

    const categoryOrder = { 'ASSET': 1, 'LIABILITY': 2, 'EQUITY': 3, 'REVENUE': 4, 'EXPENSE': 5 };
    reportData.sort((a, b) => {
      if (categoryOrder[a.GL_ACCT_CAT] !== categoryOrder[b.GL_ACCT_CAT]) {
        return categoryOrder[a.GL_ACCT_CAT] - categoryOrder[b.GL_ACCT_CAT];
      }
      return a.GL_ACCT_NO.localeCompare(b.GL_ACCT_NO);
    });

    if (!reportData.length) {
      return res.status(404).json({
        success: false,
        message: 'No trial balance data found',
        timestamp: new Date().toISOString(),
      });
    }

    const totalDebit = reportData.reduce((sum, item) => sum + item.DEBIT, 0);
    const totalCredit = reportData.reduce((sum, item) => sum + item.CREDIT, 0);
    const totalNet = reportData.reduce((sum, item) => sum + item.NET, 0);

    const totalsRow = {
      GL_ACCT_NO: 'TOTALS',
      ACCT_DESC: '',
      GL_ACCT_CAT: '',
      DEBIT: totalDebit,
      CREDIT: totalCredit,
      NET: totalNet,
    };

    const fields = [
      { key: 'GL_ACCT_NO', displayName: 'GL Account Number', type: 'string' },
      { key: 'ACCT_DESC', displayName: 'Account Description', type: 'string' },
      { key: 'GL_ACCT_CAT', displayName: 'Category', type: 'string' },
      { key: 'DEBIT', displayName: 'Debit (NGN)', type: 'number' },
      { key: 'CREDIT', displayName: 'Credit (NGN)', type: 'number' },
      { key: 'NET', displayName: 'Net Balance (NGN)', type: 'number' },
    ];

    const period = `As of ${end.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    const title = `Trial Balance Report (${period})`;

    console.log('Generating report in format:', format);
    console.log('Total Debit:', totalDebit, 'Total Credit:', totalCredit);

    if (format === 'excel') {
      const excelData = [...reportData, totalsRow];
      const filePath = await generateExcelReport(excelData, 'trial_balance', fields, title);
      return res.download(filePath, `Trial_Balance_Report_${startParam}_${endParam}.xlsx`, (err) => {
        cleanupReportFiles(filePath);
        if (err) {
          logger.error('Error sending Excel file', { error: err.message, stack: err.stack });
          if (!res.headersSent) {
            res.status(500).json({ 
              success: false, 
              message: 'Failed to download Excel report', 
              timestamp: new Date().toISOString() 
            });
          }
        }
      });
    }

    if (format === 'pdf') {
      const pdfData = [...reportData, totalsRow];
      return generateReport('trial_balance', pdfData, fields, title, res);
    }

    // Default: JSON response
    res.json({
      success: true,
      data: reportData,
      totals: { 
        debit: totalDebit, 
        credit: totalCredit,
        net: totalNet
      },
      period: {
        asOf: end.toISOString()
      },
      generatedAt: new Date().toISOString(),
      recordCount: reportData.length
    });
  } catch (err) {
    logger.error('Error generating trial balance report', { error: err.message, stack: err.stack });
    next(err);
  }
};

// Additional utility functions for trial balance
export const getTrialBalanceSummary = async (req, res) => {
  try {
    const { organizationCode, branchCode, asOf } = req.query;
    
    const queryDate = asOf ? new Date(asOf) : new Date();
    
    let whereClause = { REC_ST: 'Active' };
    
    if (organizationCode) {
      whereClause.organizationCode = organizationCode;
    }
    
    if (branchCode) {
      whereClause.branchCode = branchCode;
    }
    
    // Using raw query for complex aggregation
    const trialBalanceData = await Ledger.sequelize.query(`
      SELECT 
        l.GL_ACCT_NO,
        l.ACCT_DESC,
        l.GL_ACCT_CAT,
        COALESCE(l.LEDGER_BALANCE, 0) as LEDGER_BALANCE,
        CASE 
          WHEN l.GL_ACCT_CAT IN ('ASSET', 'EXPENSE') THEN 
            GREATEST(COALESCE(l.LEDGER_BALANCE, 0), 0)
          ELSE 0
        END as DEBIT,
        CASE 
          WHEN l.GL_ACCT_CAT NOT IN ('ASSET', 'EXPENSE') THEN 
            GREATEST(COALESCE(l.LEDGER_BALANCE, 0), 0)
          ELSE GREATEST(-COALESCE(l.LEDGER_BALANCE, 0), 0)
        END as CREDIT
      FROM ledgers l
      WHERE l.REC_ST = 'Active'
      ${organizationCode ? `AND l.organizationCode = ${organizationCode}` : ''}
      ${branchCode ? `AND l.branchCode = '${branchCode}'` : ''}
      ORDER BY 
        CASE l.GL_ACCT_CAT
          WHEN 'ASSET' THEN 1
          WHEN 'LIABILITY' THEN 2
          WHEN 'EQUITY' THEN 3
          WHEN 'REVENUE' THEN 4
          WHEN 'EXPENSE' THEN 5
          ELSE 6
        END,
        l.GL_ACCT_NO
    `, {
      type: Ledger.sequelize.QueryTypes.SELECT,
      replacements: { organizationCode, branchCode }
    });

    // Calculate totals
    const totals = trialBalanceData.reduce((acc, item) => {
      acc.totalDebit += parseFloat(item.DEBIT) || 0;
      acc.totalCredit += parseFloat(item.CREDIT) || 0;
      return acc;
    }, { totalDebit: 0, totalCredit: 0 });

    res.json({
      success: true,
      asOf: queryDate.toISOString(),
      data: trialBalanceData,
      totals: totals,
      recordCount: trialBalanceData.length,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting trial balance summary', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to get trial balance summary',
      error: error.message
    });
  }
};

export const validateTrialBalance = async (req, res) => {
  try {
    const { organizationCode, asOf } = req.query;
    const queryDate = asOf ? new Date(asOf) : new Date();
    
    let whereClause = { REC_ST: 'Active' };
    if (organizationCode) {
      whereClause.organizationCode = organizationCode;
    }
    
    const ledgers = await Ledger.findAll({
      where: whereClause,
      attributes: [
        'GL_ACCT_NO',
        'GL_ACCT_CAT',
        'LEDGER_BALANCE'
      ],
      raw: true
    });

    // Calculate totals by category
    const categoryTotals = ledgers.reduce((acc, ledger) => {
      const category = ledger.GL_ACCT_CAT || 'UNCATEGORIZED';
      const balance = parseFloat(ledger.LEDGER_BALANCE) || 0;
      
      if (!acc[category]) {
        acc[category] = { total: 0, count: 0 };
      }
      
      acc[category].total += balance;
      acc[category].count += 1;
      
      return acc;
    }, {});

    // Calculate overall totals
    let totalDebit = 0;
    let totalCredit = 0;
    
    ledgers.forEach(ledger => {
      const balance = parseFloat(ledger.LEDGER_BALANCE) || 0;
      const category = ledger.GL_ACCT_CAT || '';
      
      if (['ASSET', 'EXPENSE'].includes(category)) {
        if (balance >= 0) {
          totalDebit += balance;
        } else {
          totalCredit += Math.abs(balance);
        }
      } else {
        if (balance >= 0) {
          totalCredit += balance;
        } else {
          totalDebit += Math.abs(balance);
        }
      }
    });

    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01; // Account for floating point errors
    
    res.json({
      success: true,
      isBalanced: isBalanced,
      totals: {
        debit: totalDebit,
        credit: totalCredit,
        difference: Math.abs(totalDebit - totalCredit)
      },
      categoryTotals: categoryTotals,
      asOf: queryDate.toISOString(),
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error validating trial balance', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to validate trial balance',
      error: error.message
    });
  }
};