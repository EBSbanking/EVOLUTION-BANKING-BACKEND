// services/EMTLRemittanceService.js
import sequelize from '../../config/db.js';
import { QueryTypes } from 'sequelize';
import EMTLCollectionService from './EMTLCollectionService.js';
import moment from 'moment';

class EMTLRemittanceService {
  /**
   * Generate remittance file for Rev360
   */
  static async generateRemittanceFile(startDate, endDate) {
    const collections = await EMTLCollectionService.getByDateRange(
      startDate, 
      endDate, 
      'PENDING_REMITTANCE'
    );

    if (collections.length === 0) {
      return { message: 'No collections to remit' };
    }

    // Generate CSV in Rev360 format
    const csv = this.generateCSV(collections);
    const fileName = `EMTL_REMITTANCE_${moment().format('YYYYMMDD_HHmmss')}.csv`;

    return {
      fileName,
      csv,
      totalRecords: collections.length,
      totalAmount: collections.reduce((sum, c) => sum + parseFloat(c.amount), 0)
    };
  }

  /**
   * Generate CSV for Rev360
   */
  static generateCSV(collections) {
    const headers = [
      'Transaction ID',
      'Customer ID',
      'Account Number',
      'Amount (₦)',
      'Transfer Amount (₦)',
      'Transfer Date',
      'Transaction Type',
      'Channel',
      'Reference'
    ];

    let csv = headers.join(',') + '\n';

    collections.forEach(record => {
      const row = [
        record.transaction_id,
        record.customer_no,
        record.account_no,
        parseFloat(record.amount).toFixed(2),
        parseFloat(record.transfer_amount).toFixed(2),
        moment(record.transfer_date).format('YYYY-MM-DD'),
        record.transaction_type,
        record.channel || 'WEB',
        record.transaction_reference
      ];
      csv += row.join(',') + '\n';
    });

    return csv;
  }

  /**
   * Mark collections as remitted
   */
  static async markAsRemitted(batchId, remittanceReference, updatedBy = 'SYSTEM') {
    const collections = await EMTLCollectionService.getByBatchId(batchId);

    if (collections.length === 0) {
      throw new Error('No collections found for batch');
    }

    const results = [];
    for (const collection of collections) {
      const result = await EMTLCollectionService.updateStatus(
        collection.id,
        'REMITTED',
        {
          remittanceReference,
          updatedBy
        }
      );
      results.push(result);
    }

    return {
      success: true,
      updatedCount: results.length,
      batchId,
      remittanceReference
    };
  }

  /**
   * Generate weekly remittance report
   */
  static async generateWeeklyReport() {
    const weekStart = moment().startOf('week');
    const weekEnd = moment().endOf('week');

    const pending = await EMTLCollectionService.getPendingCollections();
    const summary = await EMTLCollectionService.getSummary(weekStart, weekEnd);

    return {
      weekStart: weekStart.format('YYYY-MM-DD'),
      weekEnd: weekEnd.format('YYYY-MM-DD'),
      summary,
      pending: pending.map(p => ({
        id: p.id,
        accountNo: p.account_no,
        amount: parseFloat(p.amount),
        transferAmount: parseFloat(p.transfer_amount),
        createdDate: p.created_date
      }))
    };
  }

  /**
   * Upload to Rev360 (stub - implement with actual API)
   */
  static async uploadToRev360(filePath, fileName) {
    console.log(`📤 Uploading ${fileName} to Rev360...`);
    
    // Simulate upload
    return {
      success: true,
      reference: `REV360_${Date.now()}`,
      uploadDate: new Date(),
      filePath
    };
  }

  /**
   * Get remittance history
   */
  static async getRemittanceHistory(startDate, endDate) {
    const history = await sequelize.query(`
      SELECT 
        remittance_batch_id,
        remittance_reference,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        MIN(remitted_date) as first_remitted,
        MAX(remitted_date) as last_remitted
      FROM emtl_collections
      WHERE status = 'REMITTED'
        AND remitted_date BETWEEN :startDate AND :endDate
      GROUP BY remittance_batch_id, remittance_reference
      ORDER BY last_remitted DESC
    `, {
      replacements: { startDate, endDate },
      type: QueryTypes.SELECT
    });

    return history;
  }

  /**
   * Validate remittance file
   */
  static async validateRemittanceFile(collections) {
    const errors = [];
    const warnings = [];

    collections.forEach((record, index) => {
      // Check required fields
      if (!record.transaction_id) {
        errors.push(`Row ${index + 1}: Missing transaction ID`);
      }
      if (!record.account_no) {
        errors.push(`Row ${index + 1}: Missing account number`);
      }
      if (!record.amount || parseFloat(record.amount) <= 0) {
        errors.push(`Row ${index + 1}: Invalid amount`);
      }

      // Check for duplicates
      // Check amount format
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      totalRecords: collections.length
    };
  }
}

export default EMTLRemittanceService;