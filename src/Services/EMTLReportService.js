// services/EMTLReportService.js
import sequelize from '../../config/db.js';
import { QueryTypes } from 'sequelize';
import moment from 'moment';
import EMTLCollectionService from './EMTLCollectionService.js';

class EMTLReportService {
  /**
   * Generate daily EMTL report
   */
  static async generateDailyReport(date = null) {
    const reportDate = date ? new Date(date) : new Date();
    const startDate = moment(reportDate).startOf('day');
    const endDate = moment(reportDate).endOf('day');

    const [summary] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(amount) as total_amount,
        SUM(emtl_amount) as total_emtl,
        SUM(total_debit) as total_debit,
        COUNT(CASE WHEN emtl_applicable = true THEN 1 END) as emtl_applied_count,
        COUNT(CASE WHEN emtl_applicable = false THEN 1 END) as emtl_exempt_count,
        AVG(emtl_amount) as avg_emtl,
        MAX(emtl_amount) as max_emtl,
        MIN(emtl_amount) as min_emtl
      FROM deposit_transactions
      WHERE transaction_date BETWEEN :startDate AND :endDate
        AND transaction_type IN ('WITHDRAWAL', 'TRANSFER', 'DR')
        AND status = 'COMPLETED'
    `, {
      replacements: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      type: QueryTypes.SELECT
    });

    // Get transactions with EMTL
    const transactions = await sequelize.query(`
      SELECT 
        id,
        account_number,
        amount,
        emtl_amount,
        total_debit,
        transaction_ref_no,
        emtl_applicable,
        emtl_reason,
        created_by,
        transaction_date
      FROM deposit_transactions
      WHERE transaction_date BETWEEN :startDate AND :endDate
        AND transaction_type IN ('WITHDRAWAL', 'TRANSFER', 'DR')
        AND status = 'COMPLETED'
      ORDER BY transaction_date DESC
      LIMIT 1000
    `, {
      replacements: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      type: QueryTypes.SELECT
    });

    return {
      reportDate: reportDate.toISOString().split('T')[0],
      summary: {
        totalTransactions: parseInt(summary.total_transactions) || 0,
        totalAmount: parseFloat(summary.total_amount) || 0,
        totalEMTL: parseFloat(summary.total_emtl) || 0,
        totalDebit: parseFloat(summary.total_debit) || 0,
        emtlAppliedCount: parseInt(summary.emtl_applied_count) || 0,
        emtlExemptCount: parseInt(summary.emtl_exempt_count) || 0,
        averageEMTL: parseFloat(summary.avg_emtl) || 0,
        maxEMTL: parseFloat(summary.max_emtl) || 0,
        minEMTL: parseFloat(summary.min_emtl) || 0,
        emtlCollectionRate: summary.total_transactions > 0 
          ? ((summary.emtl_applied_count / summary.total_transactions) * 100).toFixed(2)
          : 0
      },
      transactions: transactions.map(t => ({
        id: t.id,
        accountNumber: t.account_number,
        amount: parseFloat(t.amount),
        emtlAmount: parseFloat(t.emtl_amount || 0),
        totalDebit: parseFloat(t.total_debit || 0),
        reference: t.transaction_ref_no,
        applicable: t.emtl_applicable === 1 || t.emtl_applicable === true,
        reason: t.emtl_reason,
        createdBy: t.created_by,
        date: t.transaction_date
      }))
    };
  }

  /**
   * Generate weekly EMTL report
   */
  static async generateWeeklyReport(date = null) {
    const reportDate = date ? new Date(date) : new Date();
    const startDate = moment(reportDate).startOf('week');
    const endDate = moment(reportDate).endOf('week');

    return this.generateReportByDateRange(startDate, endDate);
  }

  /**
   * Generate monthly EMTL report
   */
  static async generateMonthlyReport(date = null) {
    const reportDate = date ? new Date(date) : new Date();
    const startDate = moment(reportDate).startOf('month');
    const endDate = moment(reportDate).endOf('month');

    return this.generateReportByDateRange(startDate, endDate);
  }

  /**
   * Generate report by date range
   */
  static async generateReportByDateRange(startDate, endDate) {
    const summary = await EMTLCollectionService.getSummary(startDate, endDate);

    // Get daily breakdown
    const dailyBreakdown = await sequelize.query(`
      SELECT 
        DATE(transaction_date) as date,
        COUNT(*) as transactions,
        SUM(amount) as total_amount,
        SUM(emtl_amount) as total_emtl,
        SUM(CASE WHEN emtl_applicable = true THEN 1 ELSE 0 END) as applied_count
      FROM deposit_transactions
      WHERE transaction_date BETWEEN :startDate AND :endDate
        AND transaction_type IN ('WITHDRAWAL', 'TRANSFER', 'DR')
        AND status = 'COMPLETED'
      GROUP BY DATE(transaction_date)
      ORDER BY date ASC
    `, {
      replacements: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      type: QueryTypes.SELECT
    });

    // Get top contributors
    const topContributors = await sequelize.query(`
      SELECT 
        account_number,
        COUNT(*) as transaction_count,
        SUM(emtl_amount) as total_emtl,
        SUM(amount) as total_transfer_amount
      FROM deposit_transactions
      WHERE transaction_date BETWEEN :startDate AND :endDate
        AND transaction_type IN ('WITHDRAWAL', 'TRANSFER', 'DR')
        AND status = 'COMPLETED'
        AND emtl_applicable = true
        AND emtl_amount > 0
      GROUP BY account_number
      ORDER BY total_emtl DESC
      LIMIT 10
    `, {
      replacements: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      type: QueryTypes.SELECT
    });

    return {
      period: {
        startDate: startDate.format('YYYY-MM-DD'),
        endDate: endDate.format('YYYY-MM-DD')
      },
      summary: {
        totalCollections: parseInt(summary.total_collections) || 0,
        totalAmount: parseFloat(summary.total_amount) || 0,
        totalTransferAmount: parseFloat(summary.total_transfer_amount) || 0,
        pendingCount: parseInt(summary.pending_count) || 0,
        remittedCount: parseInt(summary.remitted_count) || 0,
        failedCount: parseInt(summary.failed_count) || 0,
        pendingAmount: parseFloat(summary.pending_amount) || 0,
        remittedAmount: parseFloat(summary.remitted_amount) || 0,
        failedAmount: parseFloat(summary.failed_amount) || 0
      },
      dailyBreakdown: dailyBreakdown.map(d => ({
        date: d.date,
        transactions: parseInt(d.transactions),
        totalAmount: parseFloat(d.total_amount || 0),
        totalEMTL: parseFloat(d.total_emtl || 0),
        appliedCount: parseInt(d.applied_count || 0)
      })),
      topContributors: topContributors.map(c => ({
        accountNumber: c.account_number,
        transactionCount: parseInt(c.transaction_count),
        totalEMTL: parseFloat(c.total_emtl || 0),
        totalTransferAmount: parseFloat(c.total_transfer_amount || 0)
      }))
    };
  }

  /**
   * Generate Rev360 reconciliation report
   */
  static async generateReconciliationReport(startDate, endDate) {
    const collections = await EMTLCollectionService.getByDateRange(startDate, endDate);

    const totals = {
      pending: collections.filter(c => c.status === 'PENDING_REMITTANCE'),
      remitted: collections.filter(c => c.status === 'REMITTED'),
      failed: collections.filter(c => c.status === 'FAILED')
    };

    const totalPendingAmount = totals.pending.reduce((sum, c) => sum + parseFloat(c.amount), 0);
    const totalRemittedAmount = totals.remitted.reduce((sum, c) => sum + parseFloat(c.amount), 0);
    const totalFailedAmount = totals.failed.reduce((sum, c) => sum + parseFloat(c.amount), 0);

    return {
      period: {
        startDate: moment(startDate).format('YYYY-MM-DD'),
        endDate: moment(endDate).format('YYYY-MM-DD')
      },
      summary: {
        totalCollections: collections.length,
        totalAmount: totalPendingAmount + totalRemittedAmount + totalFailedAmount,
        pendingCount: totals.pending.length,
        pendingAmount: totalPendingAmount,
        remittedCount: totals.remitted.length,
        remittedAmount: totalRemittedAmount,
        failedCount: totals.failed.length,
        failedAmount: totalFailedAmount,
        remittanceRate: collections.length > 0
          ? ((totals.remitted.length / collections.length) * 100).toFixed(2)
          : 0
      },
      details: {
        pending: totals.pending.map(c => ({
          id: c.id,
          accountNo: c.account_no,
          amount: parseFloat(c.amount),
          createdDate: c.created_date
        })),
        remitted: totals.remitted.map(c => ({
          id: c.id,
          accountNo: c.account_no,
          amount: parseFloat(c.amount),
          remittedDate: c.remitted_date,
          remittanceRef: c.remittance_reference
        })),
        failed: totals.failed.map(c => ({
          id: c.id,
          accountNo: c.account_no,
          amount: parseFloat(c.amount),
          createdDate: c.created_date
        }))
      }
    };
  }

  /**
   * Export report to CSV
   */
  static exportToCSV(reportData, filename = 'emtl_report.csv') {
    const { transactions } = reportData;
    
    if (!transactions || transactions.length === 0) {
      return null;
    }

    const headers = [
      'Date',
      'Account Number',
      'Amount',
      'EMTL Amount',
      'Total Debit',
      'Reference',
      'Applicable',
      'Reason',
      'Created By'
    ];

    let csv = headers.join(',') + '\n';

    transactions.forEach(t => {
      const row = [
        moment(t.date).format('YYYY-MM-DD'),
        t.accountNumber,
        t.amount.toFixed(2),
        t.emtlAmount.toFixed(2),
        t.totalDebit.toFixed(2),
        t.reference || '',
        t.applicable ? 'YES' : 'NO',
        t.reason || '',
        t.createdBy || ''
      ];
      csv += row.join(',') + '\n';
    });

    return csv;
  }
}

export default EMTLReportService;