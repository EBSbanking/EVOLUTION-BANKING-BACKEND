import mongoose from 'mongoose';
import GLAccount from '../models/GLAccount.js';
import Ledger from '../models/Ledger.js'; // ← Use Ledger model instead
import { generateReport, generateExcelReport, cleanupReportFiles } from '../utils/pdfGenerator.js';
import logger from '../utils/logger.js';

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

    // Get all active GL accounts with their ledger balances
    const ledgers = await Ledger.find({ REC_ST: 'Active' }).lean();
    console.log('Found', ledgers.length, 'active ledger accounts');

    // Get GL accounts for additional information
    const glAccounts = await GLAccount.find({ REC_ST: 'Active' }).lean();
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
      
      if (['ASSET', 'EXPENSE'].includes(ledger.GL_ACCT_CAT)) {
        // Assets and Expenses: Debit balance is positive, Credit balance is negative
        debit = Math.max(0, ledger.LEDGER_BALANCE);
        credit = Math.max(0, -ledger.LEDGER_BALANCE);
      } else {
        // Liabilities, Equity, Revenue: Credit balance is positive, Debit balance is negative
        credit = Math.max(0, ledger.LEDGER_BALANCE);
        debit = Math.max(0, -ledger.LEDGER_BALANCE);
      }
      
      return {
        GL_ACCT_NO: ledger.GL_ACCT_NO,
        ACCT_DESC: ledger.ACCT_DESC || glAccount.ACCT_DESC || '',
        GL_ACCT_CAT: ledger.GL_ACCT_CAT || glAccount.GL_ACCT_CAT || '',
        DEBIT: debit,
        CREDIT: credit,
        NET: ledger.LEDGER_BALANCE,
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