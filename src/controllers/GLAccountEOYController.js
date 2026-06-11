// src/controllers/GLAccountEOYController.js

import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import auditLogger from '../utils/AuditLogger.js';
import { sendEOYNotification } from '../Services/NotificationService.js';
import sequelize from '../../config/db.js';

export class GLAccountEOYController {
  /**
   * Execute Year-End Closing Process
   * This zeros out P&L accounts and carries balances to retained earnings
   */
  static async executeYearEndClosing(params = {}) {
    const transaction = await sequelize.transaction();
    
    try {
      const {
        fiscalYear = new Date().getFullYear() - 1,
        closingDate = new Date(),
        userId = 'system',
        branchId = 1,
        dryRun = false
      } = params;

      logger.info(`🚀 Starting Year-End Closing Process for FY ${fiscalYear}`, {
        closingDate,
        userId,
        branchId,
        dryRun
      });

      // Step 1: Validate business date and lock period
      await this.validateClosingConditions(closingDate, transaction);

      // Step 2: Identify P&L accounts
      const plAccounts = await this.getProfitLossAccounts(transaction);
      
      // Step 3: Calculate closing balances
      const closingBalances = await this.calculateClosingBalances(plAccounts, fiscalYear, transaction);
      
      // Step 4: Create closing journal entries
      const journalEntries = await this.createClosingEntries(
        closingBalances, 
        fiscalYear, 
        userId, 
        branchId, 
        transaction
      );

      // Step 5: Update account balances
      if (!dryRun) {
        await this.updateAccountBalances(journalEntries, transaction);
      }

      // Step 6: Create retained earnings entry
      const retainedEarnings = await this.createRetainedEarningsEntry(
        closingBalances, 
        fiscalYear, 
        userId, 
        branchId, 
        transaction,
        dryRun
      );

      // Step 7: Mark accounts as closed
      if (!dryRun) {
        await this.markAccountsAsClosed(plAccounts, fiscalYear, transaction);
      }

      // Step 8: Create EOY report
      const eoyReport = await this.generateEOYReport(
        closingBalances, 
        journalEntries, 
        retainedEarnings, 
        fiscalYear
      );

      // Commit transaction if not dry run
      if (!dryRun) {
        await transaction.commit();
        
        // Log audit
        await auditLogger.info({
          action: 'YEAR_END_CLOSING',
          entity_type: 'financial_year',
          entity_id: fiscalYear.toString(),
          user_id: userId,
          branch_id: branchId,
          new_value: {
            fiscalYear,
            closingDate,
            totalEntries: journalEntries.length,
            totalAmount: closingBalances.netProfit,
            reportId: eoyReport.reportId
          },
          outcome: 'success'
        });

        // Send notifications
        await sendEOYNotification(eoyReport, userId);
      } else {
        await transaction.rollback();
        logger.info('📋 Dry run completed - no changes made');
      }

      return {
        success: true,
        dryRun,
        fiscalYear,
        closingDate,
        summary: {
          totalPLAccounts: plAccounts.length,
          totalJournalEntries: journalEntries.length,
          netProfit: closingBalances.netProfit,
          report: eoyReport
        }
      };

    } catch (error) {
      await transaction.rollback();
      
      logger.error('❌ Year-End Closing failed:', error);
      
      await auditLogger.error({
        action: 'YEAR_END_CLOSING',
        entity_type: 'financial_year',
        user_id: params.userId || 'system',
        error_message: error.message,
        outcome: 'failed'
      });

      throw error;
    }
  }

  /**
   * Validate that closing can proceed
   */
  static async validateClosingConditions(closingDate, transaction) {
    const lastDayOfYear = new Date(closingDate.getFullYear(), 11, 31);
    
    if (closingDate.getTime() !== lastDayOfYear.getTime()) {
      throw new Error('Year-End closing must be performed on December 31st');
    }

    // Check if period is already closed
    const existingClosing = await GLClosingPeriod.findOne({
      where: { 
        fiscal_year: closingDate.getFullYear(),
        status: 'CLOSED'
      },
      transaction
    });

    if (existingClosing) {
      throw new Error(`Fiscal Year ${closingDate.getFullYear()} is already closed`);
    }

    // Check for pending transactions
    const pendingTransactions = await Transaction.count({
      where: {
        transaction_date: {
          [Op.gte]: new Date(closingDate.getFullYear(), 0, 1),
          [Op.lte]: closingDate
        },
        status: 'PENDING'
      },
      transaction
    });

    if (pendingTransactions > 0) {
      throw new Error(`${pendingTransactions} pending transactions must be processed before closing`);
    }

    logger.info('✅ Closing conditions validated');
  }

  /**
   * Get all Profit & Loss accounts
   */
  static async getProfitLossAccounts(transaction) {
    const GLAccount = (await import('../models/GLAccount.js')).default;
    
    const plAccounts = await GLAccount.findAll({
      where: {
        account_type: {
          [Op.in]: ['REVENUE', 'EXPENSE', 'INCOME', 'COST_OF_SALES']
        },
        is_active: true,
        is_closed: false
      },
      transaction
    });

    if (plAccounts.length === 0) {
      throw new Error('No Profit & Loss accounts found for closing');
    }

    logger.info(`📊 Found ${plAccounts.length} P&L accounts`);
    return plAccounts;
  }

  /**
   * Calculate closing balances for all P&L accounts
   */
  static async calculateClosingBalances(plAccounts, fiscalYear, transaction) {
    const Transaction = (await import('../models/Transaction.js')).default;
    
    const yearStart = new Date(fiscalYear, 0, 1);
    const yearEnd = new Date(fiscalYear, 11, 31, 23, 59, 59);

    const closingBalances = {
      revenueTotal: 0,
      expenseTotal: 0,
      incomeTotal: 0,
      costTotal: 0,
      accountDetails: []
    };

    for (const account of plAccounts) {
      const transactions = await Transaction.findAll({
        where: {
          gl_account_id: account.id,
          transaction_date: {
            [Op.gte]: yearStart,
            [Op.lte]: yearEnd
          },
          status: 'POSTED'
        },
        attributes: [
          'transaction_type',
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
        ],
        group: ['transaction_type'],
        transaction
      });

      let accountBalance = 0;
      
      // Calculate balance based on transaction types
      transactions.forEach(tx => {
        const amount = parseFloat(tx.dataValues.total_amount) || 0;
        
        if (['CREDIT', 'REVENUE', 'INCOME'].includes(tx.transaction_type)) {
          accountBalance += amount;  // Increase for credits
        } else if (['DEBIT', 'EXPENSE', 'COST'].includes(tx.transaction_type)) {
          accountBalance -= amount;  // Decrease for debits
        }
      });

      // Adjust sign based on account type
      let closingAmount = 0;
      let accountType = '';
      
      switch(account.account_type) {
        case 'REVENUE':
        case 'INCOME':
          closingAmount = -accountBalance;  // Revenue accounts need to be debited to zero
          closingBalances.revenueTotal += accountBalance;
          accountType = 'Revenue';
          break;
        case 'EXPENSE':
        case 'COST_OF_SALES':
          closingAmount = accountBalance;   // Expense accounts need to be credited to zero
          closingBalances.expenseTotal += accountBalance;
          accountType = 'Expense';
          break;
      }

      closingBalances.accountDetails.push({
        accountId: account.id,
        accountCode: account.account_code,
        accountName: account.account_name,
        accountType: account.account_type,
        openingBalance: accountBalance,
        closingAmount: closingAmount,
        newBalance: 0
      });
    }

    // Calculate net profit/loss
    closingBalances.netProfit = 
      closingBalances.revenueTotal - 
      closingBalances.expenseTotal +
      closingBalances.incomeTotal -
      closingBalances.costTotal;

    logger.info('📈 Calculated closing balances:', {
      revenueTotal: closingBalances.revenueTotal,
      expenseTotal: closingBalances.expenseTotal,
      netProfit: closingBalances.netProfit,
      accountCount: closingBalances.accountDetails.length
    });

    return closingBalances;
  }

  /**
   * Create closing journal entries
   */
  static async createClosingEntries(closingBalances, fiscalYear, userId, branchId, transaction) {
    const JournalEntry = (await import('../models/JournalEntry.js')).default;
    const journalEntries = [];
    const batchId = `EOY-${fiscalYear}-${Date.now()}`;

    // Create entries for each account
    for (const account of closingBalances.accountDetails) {
      if (Math.abs(account.closingAmount) > 0.01) { // Ignore zero amounts
        const entry = await JournalEntry.create({
          journal_id: batchId,
          account_id: account.accountId,
          transaction_date: new Date(fiscalYear, 11, 31),
          fiscal_year: fiscalYear,
          amount: Math.abs(account.closingAmount),
          transaction_type: account.closingAmount > 0 ? 'CREDIT' : 'DEBIT',
          description: `Year-End Closing FY${fiscalYear}`,
          reference: `EOY-${account.accountCode}`,
          status: 'POSTED',
          created_by: userId,
          branch_id: branchId,
          is_closing_entry: true,
          closing_fiscal_year: fiscalYear
        }, { transaction });

        journalEntries.push(entry);
      }
    }

    logger.info(`📝 Created ${journalEntries.length} closing journal entries`);
    return journalEntries;
  }

  /**
   * Create retained earnings entry
   */
  static async createRetainedEarningsEntry(closingBalances, fiscalYear, userId, branchId, transaction, dryRun = false) {
    if (Math.abs(closingBalances.netProfit) < 0.01) {
      logger.info('📊 Net profit is zero, skipping retained earnings entry');
      return null;
    }

    // Find retained earnings account
    const GLAccount = (await import('../models/GLAccount.js')).default;
    const retainedEarningsAccount = await GLAccount.findOne({
      where: {
        account_code: '3100', // Retained Earnings account code
        is_active: true
      },
      transaction
    });

    if (!retainedEarningsAccount) {
      throw new Error('Retained Earnings account (3100) not found');
    }

    const JournalEntry = (await import('../models/JournalEntry.js')).default;
    
    const entry = await JournalEntry.create({
      journal_id: `RE-${fiscalYear}-${Date.now()}`,
      account_id: retainedEarningsAccount.id,
      transaction_date: new Date(fiscalYear, 11, 31),
      fiscal_year: fiscalYear,
      amount: Math.abs(closingBalances.netProfit),
      transaction_type: closingBalances.netProfit > 0 ? 'CREDIT' : 'DEBIT',
      description: `Retained Earnings FY${fiscalYear}`,
      reference: `RE-EOY-${fiscalYear}`,
      status: 'POSTED',
      created_by: userId,
      branch_id: branchId,
      is_closing_entry: true,
      is_retained_earnings: true,
      closing_fiscal_year: fiscalYear
    }, { transaction });

    logger.info('💰 Created retained earnings entry:', {
      account: retainedEarningsAccount.account_code,
      amount: closingBalances.netProfit,
      type: closingBalances.netProfit > 0 ? 'Profit' : 'Loss'
    });

    return entry;
  }

  /**
   * Update account balances to zero
   */
  static async updateAccountBalances(journalEntries, transaction) {
    const GLAccount = (await import('../models/GLAccount.js')).default;
    
    // Group by account
    const accountUpdates = {};
    
    journalEntries.forEach(entry => {
      if (!accountUpdates[entry.account_id]) {
        accountUpdates[entry.account_id] = {
          debitTotal: 0,
          creditTotal: 0
        };
      }
      
      if (entry.transaction_type === 'DEBIT') {
        accountUpdates[entry.account_id].debitTotal += entry.amount;
      } else {
        accountUpdates[entry.account_id].creditTotal += entry.amount;
      }
    });

    // Update each account
    for (const [accountId, totals] of Object.entries(accountUpdates)) {
      const netChange = totals.creditTotal - totals.debitTotal;
      
      await GLAccount.update({
        current_balance: sequelize.literal('current_balance + ' + netChange),
        ytd_debit: sequelize.literal('ytd_debit + ' + totals.debitTotal),
        ytd_credit: sequelize.literal('ytd_credit + ' + totals.creditTotal),
        last_closing_date: new Date(),
        updated_at: new Date()
      }, {
        where: { id: accountId },
        transaction
      });
    }

    logger.info(`🔄 Updated balances for ${Object.keys(accountUpdates).length} accounts`);
  }

  /**
   * Mark accounts as closed for the fiscal year
   */
  static async markAccountsAsClosed(plAccounts, fiscalYear, transaction) {
    const GLAccount = (await import('../models/GLAccount.js')).default;
    
    await GLAccount.update({
      is_closed: true,
      closed_fiscal_year: fiscalYear,
      last_closing_date: new Date()
    }, {
      where: {
        id: plAccounts.map(acc => acc.id),
        account_type: {
          [Op.in]: ['REVENUE', 'EXPENSE', 'INCOME', 'COST_OF_SALES']
        }
      },
      transaction
    });

    logger.info(`🔒 Marked ${plAccounts.length} P&L accounts as closed for FY ${fiscalYear}`);
  }

  /**
   * Generate EOY report
   */
  static async generateEOYReport(closingBalances, journalEntries, retainedEarnings, fiscalYear) {
    const reportId = `EOY-REPORT-${fiscalYear}-${Date.now()}`;
    
    const report = {
      reportId,
      fiscalYear,
      generationDate: new Date(),
      summary: {
        totalPLAccounts: closingBalances.accountDetails.length,
        totalJournalEntries: journalEntries.length,
        revenueTotal: closingBalances.revenueTotal,
        expenseTotal: closingBalances.expenseTotal,
        netProfit: closingBalances.netProfit,
        hasRetainedEarnings: !!retainedEarnings,
        retainedEarningsAmount: retainedEarnings?.amount || 0
      },
      accountDetails: closingBalances.accountDetails,
      journalEntries: journalEntries.map(entry => ({
        id: entry.id,
        accountCode: entry.account_code,
        amount: entry.amount,
        type: entry.transaction_type,
        description: entry.description
      })),
      financialStatement: {
        revenue: closingBalances.revenueTotal,
        expenses: closingBalances.expenseTotal,
        grossProfit: closingBalances.revenueTotal - closingBalances.expenseTotal,
        netProfit: closingBalances.netProfit,
        retainedEarnings: retainedEarnings?.amount || 0
      }
    };

    // Save report to database or file system
    await this.saveEOYReport(report);

    logger.info(`📄 Generated EOY Report: ${reportId}`);
    return report;
  }

  static async saveEOYReport(report) {
    // Implement report saving logic
    // Could save to database, file system, or cloud storage
    const EOYReport = (await import('../models/EOYReport.js')).default;
    
    await EOYReport.create({
      report_id: report.reportId,
      fiscal_year: report.fiscalYear,
      report_data: report,
      generated_at: new Date(),
      status: 'COMPLETED'
    });
  }

  /**
   * Get EOY closing status
   */
  static async getClosingStatus(fiscalYear) {
    const GLClosingPeriod = (await import('../models/GLClosingPeriod.js')).default;
    
    return await GLClosingPeriod.findOne({
      where: { fiscal_year: fiscalYear }
    });
  }

  /**
   * Reverse Year-End Closing (if needed)
   */
  static async reverseYearEndClosing(fiscalYear, userId, reason) {
    // Implementation for reversal
    // This should be carefully controlled with proper approvals
  }
}