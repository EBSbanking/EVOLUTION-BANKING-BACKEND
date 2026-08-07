// services/EMTLCollectionService.js - Updated to use EMTLTransaction model
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import EMTLTransaction from '../models/EMTLTransaction.js';

class EMTLCollectionService {
  /**
   * Create an EMTL collection record using the model
   */
  static async createCollection(data) {
    try {
      // Use the Sequelize model instead of raw SQL
      const record = await EMTLTransaction.create({
        TRANSACTION_ID: data.transactionId || `EMTL-${Date.now()}`,
        TRANSACTION_REFERENCE: data.referenceNo || data.transactionId,
        CUSTOMER_NO: data.customerId || '0',
        ACCOUNT_NO: data.accountNumber,
        AMOUNT: data.emtlAmount,
        TRANSFER_AMOUNT: data.principalAmount,
        TRANSFER_DATE: data.transferDate || new Date(),
        CHANNEL: data.channel || 'WEB',
        TRANSACTION_TYPE: data.transactionType || 'TRANSFER',
        STATUS: 'PENDING_REMITTANCE',
        GL_ACCOUNT: data.glAccount || '2401000001',
        LEVY_CALCULATION: data.levyCalculation || {},
        CREATED_BY: data.createdBy || 'SYSTEM'
      });
      
      console.log(`✅ EMTL collection record created: ${record.id}`);
      return record;
    } catch (error) {
      console.error('Error creating EMTL record:', error.message);
      throw error;
    }
  }

  /**
   * Get pending EMTL collections
   */
  static async getPendingCollections(options = {}) {
    try {
      const { limit = 1000, offset = 0 } = options;
      
      const collections = await EMTLTransaction.findAll({
        where: { STATUS: 'PENDING_REMITTANCE' },
        limit: limit,
        offset: offset,
        order: [['CREATED_DATE', 'ASC']]
      });
      
      return collections;
    } catch (error) {
      console.error('Error getting pending collections:', error.message);
      throw error;
    }
  }

  /**
   * Get collections by batch ID
   */
  static async getByBatchId(batchId) {
    try {
      const collections = await EMTLTransaction.findAll({
        where: { REMITTANCE_BATCH_ID: batchId }
      });
      
      return collections;
    } catch (error) {
      console.error('Error getting collections by batch:', error.message);
      throw error;
    }
  }

  /**
   * Get collections by date range
   */
  static async getByDateRange(startDate, endDate, status = null) {
    try {
      const whereClause = {
        TRANSFER_DATE: {
          [Op.between]: [startDate, endDate]
        }
      };
      
      if (status) {
        whereClause.STATUS = status;
      }
      
      const collections = await EMTLTransaction.findAll({
        where: whereClause,
        order: [['CREATED_DATE', 'DESC']]
      });
      
      return collections;
    } catch (error) {
      console.error('Error getting collections by date range:', error.message);
      throw error;
    }
  }

  /**
   * Update collection status
   */
  static async updateStatus(collectionId, status, data = {}) {
    try {
      const updateData = {
        STATUS: status,
        UPDATED_DATE: new Date()
      };
      
      if (status === 'REMITTED') {
        updateData.REMITTED_DATE = new Date();
        if (data.remittanceReference) {
          updateData.REMITTANCE_REFERENCE = data.remittanceReference;
        }
      }
      
      if (data.remittanceBatchId) {
        updateData.REMITTANCE_BATCH_ID = data.remittanceBatchId;
      }
      
      if (data.updatedBy) {
        updateData.UPDATED_BY = data.updatedBy;
      }
      
      const [result] = await EMTLTransaction.update(updateData, {
        where: { id: collectionId }
      });
      
      return result;
    } catch (error) {
      console.error('Error updating collection status:', error.message);
      throw error;
    }
  }

  /**
   * Get collection summary
   */
  static async getSummary(startDate, endDate) {
    try {
      const [summary] = await sequelize.query(`
        SELECT 
          COUNT(*) as total_collections,
          SUM(amount) as total_amount,
          SUM(transfer_amount) as total_transfer_amount,
          COUNT(CASE WHEN status = 'PENDING_REMITTANCE' THEN 1 END) as pending_count,
          COUNT(CASE WHEN status = 'REMITTED' THEN 1 END) as remitted_count,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_count,
          SUM(CASE WHEN status = 'PENDING_REMITTANCE' THEN amount ELSE 0 END) as pending_amount,
          SUM(CASE WHEN status = 'REMITTED' THEN amount ELSE 0 END) as remitted_amount,
          SUM(CASE WHEN status = 'FAILED' THEN amount ELSE 0 END) as failed_amount
        FROM emtl_transactions
        WHERE created_date BETWEEN :startDate AND :endDate
      `, {
        replacements: { startDate, endDate },
        type: QueryTypes.SELECT
      });
      
      return summary;
    } catch (error) {
      console.error('Error getting summary:', error.message);
      throw error;
    }
  }

  /**
   * Get collections by account number
   */
  static async getByAccount(accountNo, options = {}) {
    try {
      const { limit = 100, offset = 0 } = options;
      
      const collections = await EMTLTransaction.findAll({
        where: { ACCOUNT_NO: accountNo },
        limit: limit,
        offset: offset,
        order: [['CREATED_DATE', 'DESC']]
      });
      
      return collections;
    } catch (error) {
      console.error('Error getting collections by account:', error.message);
      throw error;
    }
  }

  /**
   * Get collections by customer ID
   */
  static async getByCustomer(customerNo, options = {}) {
    try {
      const { limit = 100, offset = 0 } = options;
      
      const collections = await EMTLTransaction.findAll({
        where: { CUSTOMER_NO: customerNo },
        limit: limit,
        offset: offset,
        order: [['CREATED_DATE', 'DESC']]
      });
      
      return collections;
    } catch (error) {
      console.error('Error getting collections by customer:', error.message);
      throw error;
    }
  }

  /**
   * Generate remittance batch
   */
  static async generateBatch(startDate, endDate, createdBy = 'SYSTEM') {
    try {
      const pending = await this.getPendingCollections({ limit: 99999 });

      if (pending.length === 0) {
        return { message: 'No pending collections to remit' };
      }

      const batchId = `BATCH-${Date.now()}`;
      const totalAmount = pending.reduce((sum, p) => sum + parseFloat(p.AMOUNT), 0);

      // Update all pending collections with batch ID
      for (const collection of pending) {
        await this.updateStatus(collection.id, 'PENDING_REMITTANCE', {
          remittanceBatchId: batchId,
          updatedBy: createdBy
        });
      }

      return {
        batchId,
        totalCollections: pending.length,
        totalAmount,
        collections: pending
      };
    } catch (error) {
      console.error('Error generating batch:', error.message);
      throw error;
    }
  }
}

export default EMTLCollectionService;