import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import Ledger from '../models/Ledger.js';
import { 
  generateExcelReport, 
  cleanupReportFiles, 
  generateReport
} from '../utils/pdfGenerator.js';
import logger from '../utils/logger.js';
import LoanFee from '../models/LoanFee.js'

// Define revenue transaction types (from gl_account_transactions)
const REVENUE_TRANSACTION_TYPES = [
  'PROCESSING_FEE',
  'THRIFT_OPENING_FEE', 
  'LOAN_DISBURSEMENT_FEES',
  'SERVICE_FEE',
  'INTEREST_INCOME',
  'LATE_PAYMENT_FEE',
  'MAINTENANCE_FEE'
];

// Define expense transaction types (from transactions table)
const EXPENSE_TRANSACTION_TYPES = [
  'SALARY',
  'RENT',
  'UTILITIES',
  'OPERATIONAL_COST',
  'MAINTENANCE_COST',
  'ADMIN_EXPENSE',
  'SOFTWARE_SUBSCRIPTION',
  'MARKETING',
  'STAFF_TRAINING',
  'OFFICE_SUPPLIES',
  'TAX',
  'INSURANCE'
];

// Helper function to get income and expense data
export const getIncomeExpenseData = async (startDate, endDate) => {
  try {
    // 1. Fetch revenue/expense accounts from Ledger (metadata only)
    const ledgerAccounts = await Ledger.findAll({
      where: {
        GL_ACCT_CAT: { [Op.in]: ['REVENUE', 'EXPENSE'] },
        REC_ST: 'Active'
      },
      raw: true
    });

    const accountMap = new Map();
    ledgerAccounts.forEach(acc => {
      accountMap.set(acc.GL_ACCT_NO, {
        GL_ACCT_NO: acc.GL_ACCT_NO,
        Description: acc.ACCT_DESC,
        Category: acc.GL_ACCT_CAT
      });
    });

    // 2. Fetch REVENUE transactions from gl_account_transactions (based on TRANSACTION_TYPE)
    const revenueTransactions = await sequelize.query(
      `SELECT 
         CR_ACCT_NO AS GL_ACCT_NO, 
         'CR' AS TXN_TYPE, 
         AMOUNT,
         TRANSACTION_TYPE
       FROM gl_account_transactions 
       WHERE STATUS = 'POSTED' 
         AND TRANSACTION_TYPE IN (:revenueTypes)
         AND createdAt BETWEEN :startDate AND :endDate`,
      {
        replacements: { 
          startDate, 
          endDate,
          revenueTypes: REVENUE_TRANSACTION_TYPES
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    // 3. Fetch EXPENSE transactions from transactions table (without gl_account_code column)
    const expenseTransactions = await sequelize.query(
      `SELECT 
         amount,
         transaction_type,
         metadata,
         created_at
       FROM transactions 
       WHERE status = 'COMPLETED'
         AND transaction_type IN (:expenseTypes)
         AND created_at BETWEEN :startDate AND :endDate`,
      {
        replacements: { 
          startDate, 
          endDate,
          expenseTypes: EXPENSE_TRANSACTION_TYPES
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    // 4. Fetch thrift opening deposits from transactions table (these are revenue)
    const thriftOpeningDeposits = await sequelize.query(
      `SELECT 
         amount,
         transaction_type,
         metadata,
         created_at
       FROM transactions 
       WHERE transaction_type = 'DEPOSIT'
         AND status = 'COMPLETED'
         AND JSON_EXTRACT(metadata, '$.transactionType') = 'OPENING_DEPOSIT'
         AND created_at BETWEEN :startDate AND :endDate`,
      {
        replacements: { startDate, endDate },
        type: sequelize.QueryTypes.SELECT
      }
    );

    // Aggregate totals per GL account
    const totals = new Map();
    
    // Process revenue transactions (CREDIT entries - INCOME)
    for (const txn of revenueTransactions) {
      const gl = txn.GL_ACCT_NO;
      if (!totals.has(gl)) totals.set(gl, { debit: 0, credit: 0 });
      const record = totals.get(gl);
      record.credit += parseFloat(txn.AMOUNT) || 0;
    }

    // Process expense transactions from transactions table (DEBIT entries - EXPENSES)
    for (const txn of expenseTransactions) {
      // Extract GL account from metadata or use default expense account
      let glAccountNo = 'EXPENSE_ACCOUNT';
      
      if (txn.metadata) {
        try {
          const metadata = typeof txn.metadata === 'string' 
            ? JSON.parse(txn.metadata) 
            : txn.metadata;
          // Try different possible field names
          glAccountNo = metadata?.gl_account_code || 
                        metadata?.glAccountCode || 
                        metadata?.expense_account ||
                        metadata?.glAccount ||
                        'EXPENSE_ACCOUNT';
        } catch (e) {
          glAccountNo = 'EXPENSE_ACCOUNT';
        }
      }
      
      if (!totals.has(glAccountNo)) totals.set(glAccountNo, { debit: 0, credit: 0 });
      const record = totals.get(glAccountNo);
      record.debit += parseFloat(txn.amount) || 0;
    }

    // Process thrift opening deposits as REVENUE (credit entry)
    for (const deposit of thriftOpeningDeposits) {
      let glAccountNo = null;
      
      if (deposit.metadata) {
        try {
          const metadata = typeof deposit.metadata === 'string' 
            ? JSON.parse(deposit.metadata) 
            : deposit.metadata;
          glAccountNo = metadata?.glAccounts?.income || 'THRIFT_INCOME_ACCOUNT';
        } catch (e) {
          glAccountNo = 'THRIFT_INCOME_ACCOUNT';
        }
      } else {
        glAccountNo = 'THRIFT_INCOME_ACCOUNT';
      }
      
      const amount = parseFloat(deposit.amount) || 0;
      
      if (!totals.has(glAccountNo)) {
        totals.set(glAccountNo, { debit: 0, credit: 0 });
      }
      const record = totals.get(glAccountNo);
      record.credit += amount;
    }

    // 5. Compute net
    const incomeData = [];
    const expenseData = [];
    let totalIncome = 0;
    let totalExpense = 0;

    for (const [glAccountNo, { debit, credit }] of totals.entries()) {
      const rawNet = credit - debit;
      const accountInfo = accountMap.get(glAccountNo);
      let description = accountInfo?.Description || `GL Account ${glAccountNo} (not in Ledger)`;
      let category = accountInfo?.Category;
      if (!category) {
        category = rawNet >= 0 ? 'REVENUE' : 'EXPENSE';
        description += ' – Auto‑classified';
      }

      if (category === 'REVENUE') {
        totalIncome += rawNet;
        incomeData.push({
          GL_ACCT_NO: glAccountNo,
          Description: description,
          Category: 'REVENUE',
          Debit: debit,
          Credit: credit,
          Net: rawNet,
          Source: accountInfo ? 'GL' : 'GL (Missing Ledger)'
        });
      } else if (category === 'EXPENSE') {
        const expenseNet = debit - credit;
        totalExpense += expenseNet;
        expenseData.push({
          GL_ACCT_NO: glAccountNo,
          Description: description,
          Category: 'EXPENSE',
          Debit: debit,
          Credit: credit,
          Net: expenseNet,
          Source: accountInfo ? 'GL' : 'GL (Missing Ledger)'
        });
      }
    }

    // 6. Loan fees from loan_fees table (as revenue)
    const loanFees = await sequelize.query(
      `SELECT id, value, gl_account_code AS glAccountCode, created_at AS createdAt, type
       FROM loan_fees 
       WHERE active = 1 
         AND type IN ('PROCESSING_FEE', 'LOAN_DISBURSEMENT_FEES')
         AND created_at BETWEEN :startDate AND :endDate`,
      {
        replacements: { startDate, endDate },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const isFeeAlreadyInGL = async (fee) => {
      const existing = await sequelize.query(
        `SELECT id FROM gl_account_transactions 
         WHERE AMOUNT = :amount 
           AND TRANSACTION_TYPE = :feeType
           AND STATUS = 'POSTED' 
           AND createdAt BETWEEN :startDate AND :endDate
         LIMIT 1`,
        { 
          replacements: { 
            amount: fee.value, 
            feeType: fee.type,
            startDate, 
            endDate 
          }, 
          type: sequelize.QueryTypes.SELECT 
        }
      );
      return existing.length > 0;
    };

    let unpostedLoanFeeTotal = 0;
    for (const fee of loanFees) {
      const alreadyPosted = await isFeeAlreadyInGL(fee);
      if (!alreadyPosted) unpostedLoanFeeTotal += parseFloat(fee.value) || 0;
    }

    if (unpostedLoanFeeTotal > 0) {
      incomeData.push({
        GL_ACCT_NO: 'LOAN_FEE_UNPOSTED',
        Description: 'Loan Fees (Not yet posted to GL)',
        Category: 'REVENUE',
        Debit: 0,
        Credit: unpostedLoanFeeTotal,
        Net: unpostedLoanFeeTotal,
        Source: 'LoanFeeTable'
      });
      totalIncome += unpostedLoanFeeTotal;
    }

    const netIncome = totalIncome - totalExpense;

    return {
      incomeData,
      expenseData,
      summary: { totalIncome, totalExpense, netIncome },
      period: { startDate, endDate }
    };
  } catch (error) {
    logger.error('Error in getIncomeExpenseData', { error: error.message, stack: error.stack });
    throw new Error(`Failed to fetch income and expense data: ${error.message}`);
  }
};

// Function to generate income and expense PDF
const generateIncomeExpensePDF = async (data, period, res) => {
  try {
    const reportData = [
      ...data.incomeData,
      ...data.expenseData,
      {
        GL_ACCT_NO: 'TOTALS',
        Description: '',
        Category: '',
        Debit: data.summary.totalExpense,
        Credit: data.summary.totalIncome,
        Net: data.summary.netIncome
      }
    ];

    const fields = [
      { key: 'GL_ACCT_NO', displayName: 'Account Number', type: 'string' },
      { key: 'Description', displayName: 'Description', type: 'string' },
      { key: 'Category', displayName: 'Category', type: 'string' },
      { key: 'Debit', displayName: 'Debit (NGN)', type: 'number' },
      { key: 'Credit', displayName: 'Credit (NGN)', type: 'number' },
      { key: 'Net', displayName: 'Net Amount (NGN)', type: 'number' },
    ];

    await generateReport('income_expense', reportData, fields, `Income and Expense Report (${period})`, res);
  } catch (error) {
    logger.error('Error generating income expense PDF', { error: error.message, stack: error.stack });
    throw new Error(`PDF generation failed: ${error.message}`);
  }
};

// Main export function for income and expense report
export const exportIncomeExpenseReport = async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;

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

    const data = await getIncomeExpenseData(startDate, endDate);
    const period = `${start.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })} - ${end.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    if (format === 'json') {
      return res.json({
        success: true,
        data: {
          incomeData: data.incomeData,
          expenseData: data.expenseData,
          summary: data.summary,
          period: data.period
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (format === 'pdf') {
      await generateIncomeExpensePDF(data, period, res);
      return;
    }

    if (format === 'excel') {
      const allRows = [];

      data.incomeData.forEach(row => {
        allRows.push({
          Type: 'INCOME',
          'Account Number': row.GL_ACCT_NO,
          Description: row.Description,
          'Debit (₦)': row.Debit,
          'Credit (₦)': row.Credit,
          'Net (₦)': row.Net
        });
      });

      data.expenseData.forEach(row => {
        allRows.push({
          Type: 'EXPENSE',
          'Account Number': row.GL_ACCT_NO,
          Description: row.Description,
          'Debit (₦)': row.Debit,
          'Credit (₦)': row.Credit,
          'Net (₦)': row.Net
        });
      });

      allRows.push({
        Type: 'SUMMARY',
        'Account Number': '',
        Description: 'Total Income',
        'Debit (₦)': '',
        'Credit (₦)': '',
        'Net (₦)': data.summary.totalIncome
      });
      allRows.push({
        Type: 'SUMMARY',
        'Account Number': '',
        Description: 'Total Expenses',
        'Debit (₦)': '',
        'Credit (₦)': '',
        'Net (₦)': data.summary.totalExpense
      });
      allRows.push({
        Type: 'SUMMARY',
        'Account Number': '',
        Description: 'Net Income',
        'Debit (₦)': '',
        'Credit (₦)': '',
        'Net (₦)': data.summary.netIncome
      });

      const fields = [
        { key: 'Type', displayName: 'Type', type: 'string' },
        { key: 'Account Number', displayName: 'Account Number', type: 'string' },
        { key: 'Description', displayName: 'Description', type: 'string' },
        { key: 'Debit (₦)', displayName: 'Debit (₦)', type: 'number' },
        { key: 'Credit (₦)', displayName: 'Credit (₦)', type: 'number' },
        { key: 'Net (₦)', displayName: 'Net (₦)', type: 'number' }
      ];

      const excelPath = await generateExcelReport(allRows, 'income_expense', fields, `Income and Expense Report (${period})`);
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
      return;
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid format. Use "json", "pdf", or "excel"',
      timestamp: new Date().toISOString(),
    });
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