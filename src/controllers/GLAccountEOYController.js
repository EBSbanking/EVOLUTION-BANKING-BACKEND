// src/controllers/GLAccountEOYController.js - COMPLETE FIXED VERSION

import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import auditLogger from '../utils/AuditLogger.js';
import sequelize from '../../config/db.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import Ledger from '../models/Ledger.js';
import GLAccount from '../models/GLAccount.js';
import ChartofAccount from '../models/ChartofAccount.js';
import EOYReport from '../models/EOYReport.js';
import GLClosingPeriod from '../models/GLClosingPeriods.js';

export class GLAccountEOYController {
  /**
   * Execute Year-End Closing Process
   * This zeros out P&L accounts and carries balances to retained earnings
   */
  static async executeYearEndClosing(params = {}) {
    const transaction = await sequelize.transaction();
    let transactionCommitted = false;
    
    try {
      const {
        fiscalYear = new Date().getFullYear() - 1,
        closingDate = new Date(fiscalYear, 11, 31),
        userId = 'system',
        branchId = 1,
        organizationCode = 1,
        branchCode = '001',
        dryRun = false
      } = params;

      logger.info(`🚀 Starting Year-End Closing Process for FY ${fiscalYear}`, {
        closingDate,
        userId,
        branchId,
        organizationCode,
        branchCode,
        dryRun
      });

      // Step 1: Validate business date and lock period
      await this.validateClosingConditions(
        closingDate, 
        fiscalYear, 
        organizationCode, 
        branchCode, 
        transaction
      );

      // Step 2: Identify P&L accounts - ENHANCED
      const plAccounts = await this.getProfitLossAccounts(organizationCode, branchCode, transaction);
      
      if (plAccounts.length === 0) {
        logger.warn('⚠️ No Profit & Loss accounts found. Please create Revenue and Expense accounts first.');
        
        if (!dryRun) {
          await transaction.rollback();
        }
        
        return {
          success: false,
          error: 'No Profit & Loss accounts found. Please create Revenue and Expense accounts first.',
          fiscalYear,
          dryRun,
          timestamp: new Date().toISOString(),
          recommendation: 'Create at least one Revenue account (GL_ACCT_CAT: REVENUE) and one Expense account (GL_ACCT_CAT: EXPENSE)'
        };
      }

      // Step 3: Calculate closing balances
      const closingBalances = await this.calculateClosingBalances(plAccounts, fiscalYear, transaction);
      
      // Step 4: Create closing GL transactions
      const journalEntries = await this.createClosingEntries(
        closingBalances, 
        fiscalYear, 
        userId, 
        branchId,
        organizationCode,
        branchCode,
        transaction
      );

      // Step 5: Update Ledger balances
      if (!dryRun) {
        await this.updateLedgerBalances(journalEntries, transaction);
      }

      // Step 6: Create retained earnings entry
      const retainedEarnings = await this.createRetainedEarningsEntry(
        closingBalances, 
        fiscalYear, 
        userId, 
        branchId,
        organizationCode,
        branchCode,
        transaction,
        dryRun
      );

      // Step 7: Mark accounts as closed
      if (!dryRun) {
        await this.markAccountsAsClosed(plAccounts, fiscalYear, transaction);
        await this.createClosingPeriod(
          fiscalYear, 
          closingDate, 
          userId, 
          organizationCode, 
          branchCode, 
          transaction
        );
      }

      // Step 8: Create EOY report
      const eoyReport = await this.generateEOYReport(
        closingBalances, 
        journalEntries, 
        retainedEarnings, 
        fiscalYear,
        organizationCode,
        branchCode
      );

      // Commit transaction if not dry run
      if (!dryRun) {
        await transaction.commit();
        transactionCommitted = true;
        
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

        logger.info(`✅ Year-End Closing completed successfully for FY ${fiscalYear}`);
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
          revenueTotal: closingBalances.revenueTotal,
          expenseTotal: closingBalances.expenseTotal,
          report: eoyReport
        }
      };

    } catch (error) {
      if (!transactionCommitted) {
        await transaction.rollback();
      }
      
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
  static async validateClosingConditions(closingDate, fiscalYear, organizationCode, branchCode, transaction) {
    const closingDateObj = new Date(closingDate);
    const closingYear = closingDateObj.getFullYear();
    
    // ✅ Check if closing date matches fiscal year
    if (closingYear !== parseInt(fiscalYear)) {
      throw new Error(`Closing date ${closingYear} does not match fiscal year ${fiscalYear}`);
    }

    // Check if period is already closed
    const existingClosing = await GLClosingPeriod.findOne({
      where: { 
        fiscal_year: parseInt(fiscalYear),
        organization_code: parseInt(organizationCode) || 1,
        branch_code: branchCode || '001',
        status: 'CLOSED'
      },
      transaction
    });

    if (existingClosing) {
      throw new Error(`Fiscal Year ${fiscalYear} is already closed`);
    }

    // Check for pending GL transactions
    const pendingTransactions = await GLAccountTransaction.count({
      where: {
        STATUS: 'PENDING',
        createdAt: {
          [Op.gte]: new Date(parseInt(fiscalYear), 0, 1),
          [Op.lte]: closingDateObj
        }
      },
      transaction
    });

    if (pendingTransactions > 0) {
      throw new Error(`${pendingTransactions} pending transactions must be processed before closing`);
    }

    logger.info('✅ Closing conditions validated');
  }

  /**
   * Get all Profit & Loss accounts - ENHANCED with multiple search strategies
   */
  static async getProfitLossAccounts(organizationCode, branchCode, transaction) {
    const plAccounts = [];
    const orgCode = parseInt(organizationCode) || 1;
    const brCode = branchCode || '001';
    
    // ✅ Strategy 1: Try GLAccount table first
    const glAccounts = await GLAccount.findAll({
      where: {
        organizationCode: orgCode,
        branchCode: brCode,
        GL_ACCT_CAT: {
          [Op.in]: ['REVENUE', 'EXPENSE', 'INCOME', 'COST_OF_SALES']
        },
        REC_ST: 'Active'
      },
      transaction,
      logging: false
    });

    if (glAccounts.length > 0) {
      logger.info(`✅ Found ${glAccounts.length} P&L accounts in GLAccount table`);
      plAccounts.push(...glAccounts);
    }

    // ✅ Strategy 2: Try ChartofAccount table if no GL accounts found
    if (plAccounts.length === 0) {
      const chartAccounts = await ChartofAccount.findAll({
        where: {
          organization_code: orgCode,
          branch_code: brCode,
          type: {
            [Op.in]: ['REVENUE', 'EXPENSE', 'INCOME', 'COST_OF_SALES']
          },
          status: 'ACTIVE'
        },
        transaction,
        logging: false
      });

      if (chartAccounts.length > 0) {
        logger.info(`✅ Found ${chartAccounts.length} P&L accounts in ChartofAccount table`);
        // Map ChartofAccount to GLAccount-like objects
        const mappedAccounts = chartAccounts.map(chart => ({
          id: chart.id,
          GL_ACCT_NO: chart.glcode,
          GL_ACCT_ID: chart.glAccountId || chart.id,
          ACCT_DESC: chart.name,
          GL_ACCT_CAT: chart.type,
          account_type: chart.type,
          account_code: chart.glcode,
          account_name: chart.name,
          is_active: chart.status === 'ACTIVE',
          is_closed: false,
          chartAccount: chart
        }));
        plAccounts.push(...mappedAccounts);
      }
    }

    // ✅ Strategy 3: Broad search with case-insensitive matching
    if (plAccounts.length === 0) {
      const broadAccounts = await GLAccount.findAll({
        where: {
          organizationCode: orgCode,
          branchCode: brCode,
          REC_ST: 'Active'
        },
        transaction,
        logging: false
      });

      // Filter manually for P&L type accounts
      const filtered = broadAccounts.filter(acc => {
        const cat = (acc.GL_ACCT_CAT || '').toUpperCase();
        return ['REVENUE', 'EXPENSE', 'INCOME', 'COST', 'COST_OF_SALES', 'REV', 'EXP', 'INC'].some(
          type => cat.includes(type)
        );
      });

      if (filtered.length > 0) {
        logger.info(`✅ Found ${filtered.length} P&L accounts via broad search`);
        plAccounts.push(...filtered);
      }
    }

    // ✅ Strategy 4: Direct SQL query as fallback
    if (plAccounts.length === 0) {
      try {
        const [results] = await sequelize.query(`
          SELECT * FROM gl_accounts 
          WHERE organizationCode = ${orgCode}
          AND branchCode = '${brCode}'
          AND REC_ST = 'Active'
          AND (GL_ACCT_CAT LIKE '%REVENUE%' 
            OR GL_ACCT_CAT LIKE '%EXPENSE%' 
            OR GL_ACCT_CAT LIKE '%INCOME%'
            OR GL_ACCT_CAT LIKE '%COST%')
        `, { transaction });

        if (results && results.length > 0) {
          logger.info(`✅ Found ${results.length} P&L accounts via direct SQL query`);
          plAccounts.push(...results);
        }
      } catch (sqlError) {
        logger.warn('⚠️ Direct SQL query failed:', sqlError.message);
      }
    }

    // ✅ Strategy 5: If still no accounts, check if there are ANY GL accounts
    if (plAccounts.length === 0) {
      const totalAccounts = await GLAccount.count({
        where: {
          organizationCode: orgCode,
          branchCode: brCode,
          REC_ST: 'Active'
        },
        transaction
      });

      if (totalAccounts === 0) {
        logger.warn(`⚠️ No GL accounts found at all for organization ${orgCode}, branch ${brCode}`);
        logger.warn('📋 Please create GL accounts first using /api/gl/create-coa-aligned');
      } else {
        logger.warn(`⚠️ Found ${totalAccounts} GL accounts but none are Revenue or Expense type`);
        logger.warn('📋 Please create Revenue and Expense accounts');
      }
    }

    logger.info(`📊 Total P&L accounts found: ${plAccounts.length}`);
    return plAccounts;
  }

  /**
   * Calculate closing balances for all P&L accounts
   */
  static async calculateClosingBalances(plAccounts, fiscalYear, transaction) {
    const yearStart = new Date(parseInt(fiscalYear), 0, 1);
    const yearEnd = new Date(parseInt(fiscalYear), 11, 31, 23, 59, 59);

    const closingBalances = {
      revenueTotal: 0,
      expenseTotal: 0,
      incomeTotal: 0,
      costTotal: 0,
      accountDetails: [],
      netProfit: 0
    };

    for (const account of plAccounts) {
      const accountNo = account.GL_ACCT_NO || account.glcode || account.account_code;
      const accountType = account.GL_ACCT_CAT || account.type || account.account_type;
      
      // Get all transactions for this account
      const transactions = await GLAccountTransaction.findAll({
        where: {
          [Op.or]: [
            { DR_ACCT_NO: accountNo },
            { CR_ACCT_NO: accountNo }
          ],
          createdAt: {
            [Op.gte]: yearStart,
            [Op.lte]: yearEnd
          },
          STATUS: 'POSTED'
        },
        transaction
      });

      // Calculate net balance
      let accountBalance = 0;
      
      transactions.forEach(tx => {
        const amount = parseFloat(tx.AMOUNT) || 0;
        
        if (tx.DR_ACCT_NO === accountNo) {
          accountBalance -= amount;
        }
        if (tx.CR_ACCT_NO === accountNo) {
          accountBalance += amount;
        }
      });

      // Adjust sign based on account type
      let closingAmount = 0;
      let displayType = '';

      const upperType = String(accountType).toUpperCase();
      
      if (['REVENUE', 'INCOME'].includes(upperType)) {
        closingAmount = -accountBalance;
        closingBalances.revenueTotal += accountBalance;
        displayType = 'Revenue';
      } else if (['EXPENSE', 'COST_OF_SALES', 'COST'].includes(upperType)) {
        closingAmount = accountBalance;
        closingBalances.expenseTotal += accountBalance;
        displayType = 'Expense';
      }

      closingBalances.accountDetails.push({
        accountId: account.id,
        accountCode: accountNo,
        accountName: account.ACCT_DESC || account.name || account.account_name,
        accountType: upperType,
        displayType: displayType,
        openingBalance: accountBalance,
        closingAmount: closingAmount,
        transactionCount: transactions.length,
        newBalance: 0
      });
    }

    // Calculate net profit/loss
    closingBalances.netProfit = 
      closingBalances.revenueTotal - 
      closingBalances.expenseTotal;

    logger.info('📈 Calculated closing balances:', {
      revenueTotal: closingBalances.revenueTotal,
      expenseTotal: closingBalances.expenseTotal,
      netProfit: closingBalances.netProfit,
      accountCount: closingBalances.accountDetails.length
    });

    return closingBalances;
  }

  /**
   * Create closing journal entries using GLAccountTransaction
   */
  static async createClosingEntries(closingBalances, fiscalYear, userId, branchId, organizationCode, branchCode, transaction) {
    const journalEntries = [];
    const journalId = `EOY-${fiscalYear}-${Date.now()}`;
    const txnIdNum = await GLAccountTransaction.generateTransactionId();

    for (const account of closingBalances.accountDetails) {
      if (Math.abs(account.closingAmount) < 0.01) continue;

      const isCredit = account.closingAmount > 0;
      const amount = Math.abs(account.closingAmount);

      // Create GL Transaction
      const entry = await GLAccountTransaction.create({
        JOURNAL_ID: journalId,
        TRANSACTION_ID: `EOY-TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        DR_ACCT_NO: isCredit ? null : account.accountCode,
        CR_ACCT_NO: isCredit ? account.accountCode : null,
        AMOUNT: amount,
        NARRATION: `Year-End Closing FY${fiscalYear} - ${account.accountName} (${account.accountType})`,
        CREATED_BY: userId,
        TRANSACTION_TYPE: 'EOY_CLOSING',
        CURRENCY_CODE: 'NGN',
        STATUS: 'POSTED',
        TransactionId: txnIdNum + journalEntries.length,
        BU_ID: branchCode || '001',
        organizationCode: parseInt(organizationCode) || 1,
        branchCode: branchCode || '001'
      }, { transaction });

      journalEntries.push(entry);
    }

    logger.info(`📝 Created ${journalEntries.length} closing journal entries`);
    return journalEntries;
  }

  /**
   * Update Ledger balances after closing
   */
  static async updateLedgerBalances(journalEntries, transaction) {
    const updatedAccounts = [];

    for (const entry of journalEntries) {
      // Update DR account
      if (entry.DR_ACCT_NO) {
        await Ledger.updateBalanceForTransaction(
          entry.DR_ACCT_NO,
          entry.AMOUNT,
          false,
          { transaction }
        );
        updatedAccounts.push(entry.DR_ACCT_NO);
      }

      // Update CR account
      if (entry.CR_ACCT_NO) {
        await Ledger.updateBalanceForTransaction(
          entry.CR_ACCT_NO,
          entry.AMOUNT,
          true,
          { transaction }
        );
        updatedAccounts.push(entry.CR_ACCT_NO);
      }
    }

    logger.info(`🔄 Updated balances for ${updatedAccounts.length} accounts`);
  }

  /**
   * Create retained earnings entry
   */
  static async createRetainedEarningsEntry(closingBalances, fiscalYear, userId, branchId, organizationCode, branchCode, transaction, dryRun = false) {
    if (Math.abs(closingBalances.netProfit) < 0.01) {
      logger.info('📊 Net profit is zero, skipping retained earnings entry');
      return null;
    }

    // Find retained earnings account
    const retainedEarningsAccount = await GLAccount.findOne({
      where: {
        GL_ACCT_NO: '3100',
        organizationCode: parseInt(organizationCode) || 1,
        branchCode: branchCode || '001',
        REC_ST: 'Active'
      },
      transaction
    });

    if (!retainedEarningsAccount) {
      logger.warn('⚠️ Retained Earnings account (3100) not found, using default');
      const defaultAccount = await GLAccount.findOne({
        where: {
          GL_ACCT_CAT: 'EQUITY',
          organizationCode: parseInt(organizationCode) || 1,
          branchCode: branchCode || '001',
          REC_ST: 'Active'
        },
        transaction
      });
      
      if (!defaultAccount) {
        throw new Error('No equity account found for retained earnings');
      }
      return await this.createRetainedEarningsEntryWithAccount(
        defaultAccount, closingBalances, fiscalYear, userId, branchId, organizationCode, branchCode, transaction, dryRun
      );
    }

    return await this.createRetainedEarningsEntryWithAccount(
      retainedEarningsAccount, closingBalances, fiscalYear, userId, branchId, organizationCode, branchCode, transaction, dryRun
    );
  }

  /**
   * Helper: Create retained earnings entry with specific account
   */
  static async createRetainedEarningsEntryWithAccount(account, closingBalances, fiscalYear, userId, branchId, organizationCode, branchCode, transaction, dryRun = false) {
    if (dryRun) {
      logger.info(`📋 DRY RUN: Would create retained earnings entry for ${account.GL_ACCT_NO}: ${closingBalances.netProfit}`);
      return {
        account: account.GL_ACCT_NO,
        amount: Math.abs(closingBalances.netProfit),
        type: closingBalances.netProfit > 0 ? 'CREDIT' : 'DEBIT',
        dryRun: true
      };
    }

    const isCredit = closingBalances.netProfit > 0;
    const amount = Math.abs(closingBalances.netProfit);
    const txnIdNum = await GLAccountTransaction.generateTransactionId();

    const entry = await GLAccountTransaction.create({
      JOURNAL_ID: `RE-${fiscalYear}-${Date.now()}`,
      TRANSACTION_ID: `RE-TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      DR_ACCT_NO: isCredit ? null : account.GL_ACCT_NO,
      CR_ACCT_NO: isCredit ? account.GL_ACCT_NO : null,
      AMOUNT: amount,
      NARRATION: `Retained Earnings FY${fiscalYear} - ${closingBalances.netProfit > 0 ? 'Profit' : 'Loss'}`,
      CREATED_BY: userId,
      TRANSACTION_TYPE: 'RETAINED_EARNINGS',
      CURRENCY_CODE: 'NGN',
      STATUS: 'POSTED',
      TransactionId: txnIdNum,
      BU_ID: branchCode || '001',
      organizationCode: parseInt(organizationCode) || 1,
      branchCode: branchCode || '001'
    }, { transaction });

    // Update the retained earnings account ledger
    await Ledger.updateBalanceForTransaction(
      account.GL_ACCT_NO,
      amount,
      isCredit,
      { transaction }
    );

    logger.info('💰 Created retained earnings entry:', {
      account: account.GL_ACCT_NO,
      amount: closingBalances.netProfit,
      type: closingBalances.netProfit > 0 ? 'Profit' : 'Loss'
    });

    return entry;
  }

  /**
   * Mark accounts as closed for the fiscal year
   */
  static async markAccountsAsClosed(plAccounts, fiscalYear, transaction) {
    const accountIds = plAccounts
      .filter(acc => acc.id)
      .map(acc => acc.id);

    if (accountIds.length > 0) {
      await GLAccount.update({
        REC_ST: 'Closed',
        updatedAt: new Date()
      }, {
        where: {
          id: {
            [Op.in]: accountIds
          }
        },
        transaction
      });
    }

    logger.info(`🔒 Marked ${accountIds.length} P&L accounts as closed for FY ${fiscalYear}`);
  }

  /**
   * Create closing period record
   */
  static async createClosingPeriod(fiscalYear, closingDate, userId, organizationCode, branchCode, transaction) {
    const existing = await GLClosingPeriod.findOne({
      where: {
        fiscal_year: parseInt(fiscalYear),
        organization_code: parseInt(organizationCode) || 1,
        branch_code: branchCode || '001'
      },
      transaction
    });

    if (existing) {
      existing.status = 'CLOSED';
      existing.closed_by = userId;
      existing.closed_at = new Date();
      await existing.save({ transaction });
      logger.info(`📅 Updated closing period record for FY ${fiscalYear}`);
    } else {
      await GLClosingPeriod.create({
        fiscal_year: parseInt(fiscalYear),
        closing_date: closingDate,
        status: 'CLOSED',
        closed_by: userId,
        closed_at: new Date(),
        organization_code: parseInt(organizationCode) || 1,
        branch_code: branchCode || '001'
      }, { transaction });
      logger.info(`📅 Created closing period record for FY ${fiscalYear}`);
    }
  }

  /**
   * Generate EOY report
   */
  static async generateEOYReport(closingBalances, journalEntries, retainedEarnings, fiscalYear, organizationCode, branchCode) {
    const reportId = `EOY-REPORT-${fiscalYear}-${Date.now()}`;
    
    const report = {
      reportId,
      fiscalYear,
      generationDate: new Date(),
      organizationCode: parseInt(organizationCode) || 1,
      branchCode: branchCode || '001',
      summary: {
        totalPLAccounts: closingBalances.accountDetails.length,
        totalJournalEntries: journalEntries.length,
        revenueTotal: closingBalances.revenueTotal,
        expenseTotal: closingBalances.expenseTotal,
        netProfit: closingBalances.netProfit,
        hasRetainedEarnings: !!retainedEarnings,
        retainedEarningsAmount: retainedEarnings?.amount || 0
      },
      accountDetails: closingBalances.accountDetails.map(acc => ({
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        accountType: acc.accountType,
        openingBalance: acc.openingBalance,
        closingAmount: acc.closingAmount,
        transactionCount: acc.transactionCount
      })),
      journalEntries: journalEntries.map(entry => ({
        id: entry.id,
        journalId: entry.JOURNAL_ID,
        transactionId: entry.TRANSACTION_ID,
        drAccount: entry.DR_ACCT_NO,
        crAccount: entry.CR_ACCT_NO,
        amount: entry.AMOUNT,
        narration: entry.NARRATION
      })),
      financialStatement: {
        revenue: closingBalances.revenueTotal,
        expenses: closingBalances.expenseTotal,
        grossProfit: closingBalances.revenueTotal - closingBalances.expenseTotal,
        netProfit: closingBalances.netProfit,
        retainedEarnings: retainedEarnings?.amount || 0
      }
    };

    // Save report to database
    try {
      await EOYReport.create({
        report_id: report.reportId,
        fiscal_year: parseInt(fiscalYear),
        report_data: report,
        organization_code: parseInt(organizationCode) || 1,
        branch_code: branchCode || '001',
        generated_at: new Date(),
        generated_by: 'system',
        status: 'COMPLETED'
      });
      logger.info(`📄 Saved EOY Report: ${reportId}`);
    } catch (error) {
      logger.warn('⚠️ Could not save EOY report to database:', error.message);
    }

    logger.info(`📄 Generated EOY Report: ${reportId}`);
    return report;
  }

  /**
   * Get closing status
   */
  static async getClosingStatus(fiscalYear, organizationCode = 1, branchCode = '001') {
    try {
      return await GLClosingPeriod.findOne({
        where: { 
          fiscal_year: parseInt(fiscalYear),
          organization_code: parseInt(organizationCode) || 1,
          branch_code: branchCode || '001'
        }
      });
    } catch (error) {
      logger.warn('⚠️ Could not get closing status:', error.message);
      return null;
    }
  }

  /**
   * Reverse Year-End Closing
   */
  static async reverseYearEndClosing(fiscalYear, userId, reason, organizationCode = 1, branchCode = '001') {
    const transaction = await sequelize.transaction();
    
    try {
      logger.warn(`🔄 Reversing Year-End Closing for FY ${fiscalYear}`, { userId, reason });

      const closingPeriod = await GLClosingPeriod.findOne({
        where: {
          fiscal_year: parseInt(fiscalYear),
          organization_code: parseInt(organizationCode) || 1,
          branch_code: branchCode || '001',
          status: 'CLOSED'
        },
        transaction
      });

      if (!closingPeriod) {
        throw new Error(`No closed period found for FY ${fiscalYear}`);
      }

      // Find and reverse EOY closing transactions
      const eoyTransactions = await GLAccountTransaction.findAll({
        where: {
          TRANSACTION_TYPE: 'EOY_CLOSING',
          createdAt: {
            [Op.gte]: new Date(parseInt(fiscalYear), 11, 25),
            [Op.lte]: new Date(parseInt(fiscalYear), 11, 31, 23, 59, 59)
          },
          STATUS: 'POSTED'
        },
        transaction
      });

      for (const tx of eoyTransactions) {
        tx.STATUS = 'REVERSED';
        tx.REVERSAL_DATE = new Date();
        tx.REVERSED_BY = userId;
        tx.REVERSAL_REASON = reason || 'Year-End Closing Reversal';
        await tx.save({ transaction });

        // Reverse ledger balances
        if (tx.DR_ACCT_NO) {
          await Ledger.updateBalanceForTransaction(
            tx.DR_ACCT_NO,
            tx.AMOUNT,
            true,
            { transaction }
          );
        }
        if (tx.CR_ACCT_NO) {
          await Ledger.updateBalanceForTransaction(
            tx.CR_ACCT_NO,
            tx.AMOUNT,
            false,
            { transaction }
          );
        }
      }

      closingPeriod.status = 'REVERSED';
      closingPeriod.reversed_by = userId;
      closingPeriod.reversed_at = new Date();
      closingPeriod.reversal_reason = reason;
      await closingPeriod.save({ transaction });

      // Unmark accounts
      await GLAccount.update({
        REC_ST: 'Active',
        updatedAt: new Date()
      }, {
        where: {
          REC_ST: 'Closed',
          organizationCode: parseInt(organizationCode) || 1,
          branchCode: branchCode || '001'
        },
        transaction
      });

      await transaction.commit();
      logger.info(`✅ Year-End Closing reversed for FY ${fiscalYear}`);

      return {
        success: true,
        fiscalYear,
        transactionsReversed: eoyTransactions.length,
        message: `Year-End Closing for FY ${fiscalYear} has been reversed`
      };

    } catch (error) {
      await transaction.rollback();
      logger.error('❌ Failed to reverse Year-End Closing:', error);
      throw error;
    }
  }
}

export default GLAccountEOYController;