import Ledger from '../models/Ledger.js';
import { 
  generateExcelReport, 
  cleanupReportFiles, 
  generateTrialBalanceReport,
  generateReport  // Add this import
} from '../utils/pdfGenerator.js';
import logger from '../utils/logger.js';

// Helper function to get income and expense data
export const getIncomeExpenseData = async (startDate, endDate) => {
  try {
    // Get all revenue and expense accounts with their transactions
    const accounts = await Ledger.find({
      GL_ACCT_CAT: { $in: ['REVENUE', 'EXPENSE'] },
      REC_ST: 'Active'
    }).populate({
      path: 'transactions',
      match: {
        TXN_DT: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }
    });

    // Process data for income and expense report
    const incomeData = [];
    const expenseData = [];
    let totalIncome = 0;
    let totalExpense = 0;

    for (const account of accounts) {
      let totalDebit = 0;
      let totalCredit = 0;

      // Calculate totals from transactions
      if (account.transactions && account.transactions.length > 0) {
        account.transactions.forEach(transaction => {
          if (transaction.TXN_TYPE === 'DR') {
            totalDebit += transaction.AMT || 0;
          } else if (transaction.TXN_TYPE === 'CR') {
            totalCredit += transaction.AMT || 0;
          }
        });
      }

      // For revenue accounts: Credit increases revenue, Debit decreases
      // For expense accounts: Debit increases expense, Credit decreases
      let netAmount = 0;
      
      if (account.GL_ACCT_CAT === 'REVENUE') {
        netAmount = totalCredit - totalDebit;
        totalIncome += netAmount;
        
        incomeData.push({
          GL_ACCT_NO: account.GL_ACCT_NO,
          Description: account.ACCT_DESC,
          Category: account.GL_ACCT_CAT,
          Debit: totalDebit,
          Credit: totalCredit,
          Net: netAmount
        });
      } else if (account.GL_ACCT_CAT === 'EXPENSE') {
        netAmount = totalDebit - totalCredit;
        totalExpense += netAmount;
        
        expenseData.push({
          GL_ACCT_NO: account.GL_ACCT_NO,
          Description: account.ACCT_DESC,
          Category: account.GL_ACCT_CAT,
          Debit: totalDebit,
          Credit: totalCredit,
          Net: netAmount
        });
      }
    }

    // Calculate net income
    const netIncome = totalIncome - totalExpense;

    return {
      incomeData,
      expenseData,
      summary: {
        totalIncome,
        totalExpense,
        netIncome
      },
      period: {
        startDate,
        endDate
      }
    };
  } catch (error) {
    logger.error('Error in getIncomeExpenseData', { error: error.message, stack: error.stack });
    throw new Error(`Failed to fetch income and expense data: ${error.message}`);
  }
};

// Function to generate income and expense PDF using your existing generateReport function
const generateIncomeExpensePDF = async (data, period, res) => {
  try {
    // Combine income and expense data for the report
    const reportData = [
      ...data.incomeData,
      ...data.expenseData,
      {
        GL_ACCT_NO: 'TOTALS',
        Description: '',
        Category: '',
        Debit: data.summary.totalExpense, // Total expenses (debits)
        Credit: data.summary.totalIncome,  // Total income (credits)
        Net: data.summary.netIncome
      }
    ];

    // Define fields for the report
    const fields = [
      { key: 'GL_ACCT_NO', displayName: 'Account Number', type: 'string' },
      { key: 'Description', displayName: 'Description', type: 'string' },
      { key: 'Category', displayName: 'Category', type: 'string' },
      { key: 'Debit', displayName: 'Debit (NGN)', type: 'number' },
      { key: 'Credit', displayName: 'Credit (NGN)', type: 'number' },
      { key: 'Net', displayName: 'Net Amount (NGN)', type: 'number' },
    ];

    // Use your existing generateReport function with dynamic period
    await generateReport('income_expense', reportData, fields, `Income and Expense Report (${period})`, res);
  } catch (error) {
    logger.error('Error generating income expense PDF', { error: error.message, stack: error.stack });
    throw new Error(`PDF generation failed: ${error.message}`);
  }
};

// Main export function for income and expense report
export const exportIncomeExpenseReport = async (req, res) => {
  try {
    const { startDate, endDate, format = 'pdf' } = req.query;

    // Validate query parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required',
        timestamp: new Date().toISOString(),
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid startDate or endDate format',
        timestamp: new Date().toISOString(),
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'startDate must be before endDate',
        timestamp: new Date().toISOString(),
      });
    }

    if (!['pdf', 'excel'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid format. Use "pdf" or "excel"',
        timestamp: new Date().toISOString(),
      });
    }

    // Fetch data
    const data = await getIncomeExpenseData(startDate, endDate);

    // Format period for display - use the actual dates from the request
    const period = `${start.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })} - ${end.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    if (format === 'pdf') {
      await generateIncomeExpensePDF(data, period, res);
    } else if (format === 'excel') {
      // Define fields for Excel export
      const incomeFields = [
        { key: 'GL_ACCT_NO', displayName: 'Account Number', type: 'string' },
        { key: 'Description', displayName: 'Description', type: 'string' },
        { key: 'Debit', displayName: 'Debit (NGN)', type: 'number' },
        { key: 'Credit', displayName: 'Credit (NGN)', type: 'number' },
        { key: 'Net', displayName: 'Net Revenue (NGN)', type: 'number' },
      ];

      const expenseFields = [
        { key: 'GL_ACCT_NO', displayName: 'Account Number', type: 'string' },
        { key: 'Description', displayName: 'Description', type: 'string' },
        { key: 'Debit', displayName: 'Debit (NGN)', type: 'number' },
        { key: 'Credit', displayName: 'Credit (NGN)', type: 'number' },
        { key: 'Net', displayName: 'Net Expense (NGN)', type: 'number' },
      ];

      // Generate Excel report with dynamic period
      const excelPath = generateExcelReport(
        { 
          Income: data.incomeData, 
          Expenses: data.expenseData,
          Summary: [{
            'Total Income': data.summary.totalIncome,
            'Total Expenses': data.summary.totalExpense,
            'Net Income': data.summary.netIncome
          }]
        }, 
        'income_expense', 
        { Income: incomeFields, Expenses: expenseFields, Summary: [] },
        `Income and Expense Report (${period})`  // Use dynamic period here
      );
      
      res.download(excelPath, `Income_Expense_Report_${startDate}_${endDate}.xlsx`, (err) => {
        if (err) {
          logger.error('Error sending Excel file', { error: err.message, stack: err.stack });
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: 'Error sending Excel file',
              timestamp: new Date().toISOString(),
            });
          }
        }
        cleanupReportFiles(excelPath);
      });
    }
  } catch (error) {
    logger.error('Error in exportIncomeExpenseReport', { error: error.message, stack: error.stack });
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: `Error generating income and expense report: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }
};

// Route to get income and expense summary for dashboard
export const getIncomeExpenseSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required',
      });
    }

    const data = await getIncomeExpenseData(startDate, endDate);
    
    res.json({
      success: true,
      data: {
        totalIncome: data.summary.totalIncome,
        totalExpense: data.summary.totalExpense,
        netIncome: data.summary.netIncome,
        period: data.period
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error in getIncomeExpenseSummary', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: `Error fetching income and expense summary: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
  }
};