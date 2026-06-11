// src/controllers/LoanFeeController.js - MySQL VERSION (snake_case schema)
import { getPool } from '../../config/db.js';
import { logAuditTrail } from '../Services/AuditService.js';
import generateWorkflowIdentifiers from '../utils/generateWorkflowIdentifiers.js';

class LoanFeeController {
  /**
   * @method createFee
   * @description Create a new loan fee with workflow tracking
   */
  static async createFee(req, res) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Ensure table exists with snake_case columns (matches your actual DB)
      await connection.query(`
        CREATE TABLE IF NOT EXISTS loan_fees (
          id INT AUTO_INCREMENT PRIMARY KEY,
          PROD_ID INT NOT NULL,
          name VARCHAR(100) NOT NULL,
          type VARCHAR(50) NOT NULL,
          is_percentage BOOLEAN DEFAULT FALSE,
          value DECIMAL(20,4) NOT NULL,
          min_amount DECIMAL(20,2) DEFAULT 0,
          max_amount DECIMAL(20,2) DEFAULT 0,
          gl_account_code VARCHAR(20),
          taxable BOOLEAN DEFAULT FALSE,
          tax_rate DECIMAL(5,2) DEFAULT 0,
          applies_to_disbursement BOOLEAN DEFAULT TRUE,
          applies_to_repayment BOOLEAN DEFAULT FALSE,
          created_by VARCHAR(255) DEFAULT 'system',
          work_item_id VARCHAR(100),
          process_id VARCHAR(100),
          active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          deleted BOOLEAN DEFAULT FALSE,
          deleted_at TIMESTAMP NULL,
          deleted_by VARCHAR(255),
          
          INDEX idx_prod_id (PROD_ID),
          INDEX idx_type (type),
          INDEX idx_active (active),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log('✅ loan_fees table checked/created');

      const {
        PROD_ID,
        name,
        type,
        is_percentage,
        value,
        min_amount,
        max_amount,
        gl_account_code,
        taxable,
        tax_rate,
        applies_to_disbursement,
        applies_to_repayment,
        created_by = req.user?.id || 'system'
      } = req.body;

      const { workItemId, processId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      if (!PROD_ID || !name || !type || value === undefined) {
        throw new Error('PROD_ID, name, type, and value are required');
      }

      let createdById = created_by;
      if (createdById === 'system') {
        createdById = 'system';
      } else if (!createdById || createdById.length < 1) {
        throw new Error('Invalid created_by value');
      }

      const [result] = await connection.query(`
        INSERT INTO loan_fees (
          PROD_ID, name, type, is_percentage, value, min_amount, max_amount,
          gl_account_code, taxable, tax_rate, applies_to_disbursement, applies_to_repayment,
          created_by, work_item_id, process_id, created_at, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
      `, [
        PROD_ID,
        name,
        type,
        is_percentage || false,
        parseFloat(value),
        is_percentage ? (min_amount || 0) : 0,
        is_percentage ? (max_amount || 0) : 0,
        gl_account_code || null,
        taxable || false,
        taxable ? (tax_rate || 0) : 0,
        applies_to_disbursement || false,
        applies_to_repayment || false,
        createdById,
        workItemId,
        processId
      ]);

      const feeId = result.insertId;

      const [feeRows] = await connection.query(
        'SELECT * FROM loan_fees WHERE id = ?',
        [feeId]
      );
      const newFee = feeRows[0];

      // Audit log (adjust to your audit service parameters)
      try {
        await logAuditTrail({
          entityId: feeId,
          entityType: 'LOAN_FEE',
          action: 'CREATE',
          performedBy: createdById,
          ipAddress: req.ip || '127.0.0.1',
          userInfo: { id: createdById, username: createdById },
          changedFields: ['ALL'],
          previousValues: null,
          newValue: newFee,
          notes: `Loan fee "${name}" created for product ${PROD_ID}`,
        });
      } catch (auditError) {
        console.warn('⚠️ Could not log audit trail:', auditError.message);
        try {
          await connection.query(`
            INSERT INTO system_events (event_type, entity_type, entity_id, user_id, action, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
          `, [
            'LOAN_FEE_CREATED',
            'LOAN_FEE',
            feeId,
            createdById,
            'FEE_CREATED',
            JSON.stringify({ name, type, PROD_ID })
          ]);
        } catch (fallbackError) {
          console.warn('⚠️ Could not log fallback audit:', fallbackError.message);
        }
      }

      await connection.commit();

      res.status(201).json({
        success: true,
        message: 'Loan fee created successfully',
        data: newFee,
        workflowId: workItemId
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error creating loan fee:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to create loan fee',
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * @method getFeesByProduct
   */
  static async getFeesByProduct(req, res) {
    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();
      const { productId } = req.params;
      const { activeOnly = 'true' } = req.query;
      const { workItemId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      let query = 'SELECT * FROM loan_fees WHERE PROD_ID = ?';
      const params = [productId];
      if (activeOnly === 'true') {
        query += ' AND active = 1';
      }

      const [fees] = await connection.query(query, params);

      // Enrich with user names if needed
      if (fees.length > 0) {
        const userIds = [...new Set(fees.map(fee => fee.created_by).filter(Boolean))];
        if (userIds.length > 0) {
          const [users] = await connection.query(
            'SELECT id, firstName, lastName FROM Users WHERE id IN (?)',
            [userIds]
          );
          const userMap = users.reduce((map, user) => {
            map[user.id] = `${user.firstName || ''} ${user.lastName || ''}`.trim();
            return map;
          }, {});
          fees.forEach(fee => {
            fee.createdByUser = userMap[fee.created_by] || null;
          });
        }
      }

      await logAuditTrail({
        eventId: workItemId,
        userId: req.user?.id || 'system',
        action: 'FEES_VIEWED',
        entityType: 'LOAN_PRODUCT',
        entityId: productId,
        description: `Viewed fees for product ${productId}`,
        newValue: { count: fees.length }
      });

      res.status(200).json({
        success: true,
        data: fees,
        workflowId: workItemId
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch loan fees',
        error: error.message
      });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * @method updateFee
   */
  static async updateFee(req, res) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const { feeId } = req.params;
      const updates = req.body;
      const { workItemId, processId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      if (updates.PROD_ID || updates.created_by) {
        throw new Error('Product ID and created_by cannot be modified');
      }

      const [existingRows] = await connection.query(
        'SELECT * FROM loan_fees WHERE id = ? FOR UPDATE',
        [feeId]
      );
      if (existingRows.length === 0) throw new Error('Loan fee not found');
      const existingFee = existingRows[0];

      const updateFields = [];
      const updateValues = [];

      const allowedFields = [
        'name', 'type', 'is_percentage', 'value', 'min_amount', 'max_amount',
        'gl_account_code', 'taxable', 'tax_rate', 'applies_to_disbursement',
        'applies_to_repayment', 'created_by', 'work_item_id', 'process_id'
      ];

      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          if (['value', 'min_amount', 'max_amount', 'tax_rate'].includes(field)) {
            updateValues.push(parseFloat(updates[field]));
          } else if (['is_percentage', 'taxable', 'applies_to_disbursement', 'applies_to_repayment'].includes(field)) {
            updateValues.push(updates[field] ? 1 : 0);
          } else {
            updateValues.push(updates[field]);
          }
          updateFields.push(`${field} = ?`);
        }
      });

      updateFields.push('updated_at = NOW()');
      updateValues.push(feeId);

      await connection.query(
        `UPDATE loan_fees SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      const [updatedRows] = await connection.query(
        'SELECT * FROM loan_fees WHERE id = ?',
        [feeId]
      );
      const updatedFee = updatedRows[0];

      await logAuditTrail({
        eventId: workItemId,
        processId,
        userId: req.user?.id || 'system',
        action: 'FEE_UPDATED',
        entityType: 'LOAN_FEE',
        entityId: feeId,
        description: `Updated fee ${updatedFee.name}`,
        oldValue: existingFee,
        newValue: updatedFee,
        connection
      });

      await connection.commit();
      res.status(200).json({
        success: true,
        message: 'Loan fee updated successfully',
        data: updatedFee,
        workflowId: workItemId
      });
    } catch (error) {
      await connection.rollback();
      res.status(400).json({
        success: false,
        message: 'Failed to update loan fee',
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * @method toggleFeeStatus
   */
  static async toggleFeeStatus(req, res) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const { feeId } = req.params;
      const { workItemId, processId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      const [feeRows] = await connection.query(
        'SELECT * FROM loan_fees WHERE id = ? FOR UPDATE',
        [feeId]
      );
      if (feeRows.length === 0) throw new Error('Loan fee not found');
      const fee = feeRows[0];
      const oldStatus = fee.active;
      const newStatus = oldStatus ? 0 : 1;

      await connection.query(`
        UPDATE loan_fees 
        SET active = ?, updated_at = NOW(), work_item_id = ?, process_id = ?
        WHERE id = ?
      `, [newStatus, workItemId, processId, feeId]);

      await logAuditTrail({
        eventId: workItemId,
        processId,
        userId: req.user?.id || 'system',
        action: 'FEE_STATUS_CHANGED',
        entityType: 'LOAN_FEE',
        entityId: feeId,
        description: `Changed fee ${fee.name} status from ${oldStatus} to ${newStatus}`,
        oldValue: { active: oldStatus },
        newValue: { active: newStatus },
        connection
      });

      await connection.commit();
      res.status(200).json({
        success: true,
        message: `Fee ${newStatus ? 'activated' : 'deactivated'} successfully`,
        data: { active: newStatus },
        workflowId: workItemId
      });
    } catch (error) {
      await connection.rollback();
      res.status(400).json({
        success: false,
        message: 'Failed to toggle fee status',
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * @method calculateFeesForAmount
   */
  static async calculateFeesForAmount(req, res) {
    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();
      const { productId, amount } = req.params;
      const { workItemId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      if (isNaN(amount) || amount <= 0) throw new Error('Amount must be a positive number');
      const loanAmount = parseFloat(amount);

      const [fees] = await connection.query(`
        SELECT * FROM loan_fees 
        WHERE PROD_ID = ? AND active = 1
      `, [productId]);

      const calculatedFees = fees.map(fee => {
        let feeAmount = 0;
        if (fee.is_percentage) {
          feeAmount = loanAmount * (fee.value / 100);
          if (fee.min_amount && feeAmount < fee.min_amount) feeAmount = parseFloat(fee.min_amount);
          if (fee.max_amount && feeAmount > fee.max_amount) feeAmount = parseFloat(fee.max_amount);
        } else {
          feeAmount = parseFloat(fee.value);
        }

        let taxAmount = 0;
        if (fee.taxable && fee.tax_rate > 0) {
          taxAmount = feeAmount * (fee.tax_rate / 100);
        }

        return {
          feeId: fee.id,
          name: fee.name,
          type: fee.type,
          isPercentage: fee.is_percentage,
          rate: fee.is_percentage ? fee.value : null,
          amount: feeAmount,
          taxable: fee.taxable,
          taxRate: fee.tax_rate,
          taxAmount: taxAmount,
          totalAmount: feeAmount + taxAmount,
          appliesToDisbursement: fee.applies_to_disbursement,
          appliesToRepayment: fee.applies_to_repayment,
          glAccountCode: fee.gl_account_code
        };
      });

      await logAuditTrail({
        eventId: workItemId,
        userId: req.user?.id || 'system',
        action: 'FEE_CALCULATION',
        entityType: 'LOAN_PRODUCT',
        entityId: productId,
        description: `Calculated fees for amount ${amount}`,
        newValue: { productId, amount, feesCount: calculatedFees.length }
      });

      const totalFees = calculatedFees.reduce((sum, fee) => sum + fee.totalAmount, 0);

      res.status(200).json({
        success: true,
        data: {
          productId,
          loanAmount,
          fees: calculatedFees,
          totalFees,
          summary: {
            totalFeeAmount: calculatedFees.reduce((sum, fee) => sum + fee.amount, 0),
            totalTaxAmount: calculatedFees.reduce((sum, fee) => sum + fee.taxAmount, 0),
            feeCount: calculatedFees.length
          },
          workflowId: workItemId
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Failed to calculate fees',
        error: error.message
      });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * @method getProcessingFee
   */
  static async getProcessingFee(req, res) {
    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();
      const { productId, amount } = req.params;
      const { workItemId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      if (isNaN(amount) || amount <= 0) throw new Error('Amount must be a positive number');
      const loanAmount = parseFloat(amount);

      const [feeRows] = await connection.query(`
        SELECT * FROM loan_fees 
        WHERE PROD_ID = ? AND active = 1 AND type = 'PROCESSING_FEE'
        LIMIT 1
      `, [productId]);

      if (feeRows.length === 0) {
        return res.status(200).json({
          success: true,
          data: { productId, loanAmount, processingFee: 0, currency: 'NGN', message: 'No processing fee configured' },
          workflowId: workItemId
        });
      }

      const fee = feeRows[0];
      let processingFee = 0;
      if (fee.is_percentage) {
        processingFee = loanAmount * (fee.value / 100);
        if (fee.min_amount && processingFee < fee.min_amount) processingFee = parseFloat(fee.min_amount);
        if (fee.max_amount && processingFee > fee.max_amount) processingFee = parseFloat(fee.max_amount);
      } else {
        processingFee = parseFloat(fee.value);
      }

      let taxAmount = 0;
      if (fee.taxable && fee.tax_rate > 0) {
        taxAmount = processingFee * (fee.tax_rate / 100);
      }
      const totalProcessingFee = processingFee + taxAmount;

      await logAuditTrail({
        eventId: workItemId,
        userId: req.user?.id || 'system',
        action: 'PROCESSING_FEE_CALCULATION',
        entityType: 'LOAN_PRODUCT',
        entityId: productId,
        description: `Calculated processing fee for amount ${amount}`,
        newValue: { productId, amount, processingFee: totalProcessingFee }
      });

      res.status(200).json({
        success: true,
        data: {
          productId,
          loanAmount,
          processingFee: totalProcessingFee,
          breakdown: {
            baseFee: processingFee,
            taxAmount: taxAmount,
            taxRate: fee.tax_rate,
            isPercentage: fee.is_percentage,
            rate: fee.is_percentage ? fee.value : null
          },
          currency: 'NGN',
          workflowId: workItemId
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Failed to calculate processing fee',
        error: error.message
      });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * @method getFeeById
   */
  static async getFeeById(req, res) {
    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();
      const { feeId } = req.params;
      const { workItemId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      const [feeRows] = await connection.query(
        'SELECT * FROM loan_fees WHERE id = ?',
        [feeId]
      );
      if (feeRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Loan fee not found' });
      }

      await logAuditTrail({
        eventId: workItemId,
        userId: req.user?.id || 'system',
        action: 'FEE_VIEWED',
        entityType: 'LOAN_FEE',
        entityId: feeId,
        description: `Viewed fee ${feeRows[0].name}`,
        newValue: { feeId }
      });

      res.status(200).json({
        success: true,
        data: feeRows[0],
        workflowId: workItemId
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch loan fee',
        error: error.message
      });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * @method deleteFee (soft delete)
   */
  static async deleteFee(req, res) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const { feeId } = req.params;
      const { workItemId, processId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      const [feeRows] = await connection.query(
        'SELECT * FROM loan_fees WHERE id = ?',
        [feeId]
      );
      if (feeRows.length === 0) throw new Error('Loan fee not found');
      const fee = feeRows[0];

      await connection.query(`
        UPDATE loan_fees 
        SET deleted = 1, deleted_at = NOW(), deleted_by = ?, updated_at = NOW()
        WHERE id = ?
      `, [req.user?.id || 'system', feeId]);

      await logAuditTrail({
        eventId: workItemId,
        processId,
        userId: req.user?.id || 'system',
        action: 'FEE_DELETED',
        entityType: 'LOAN_FEE',
        entityId: feeId,
        description: `Deleted fee ${fee.name}`,
        oldValue: fee,
        newValue: { deleted: true },
        connection
      });

      await connection.commit();
      res.status(200).json({
        success: true,
        message: 'Loan fee deleted successfully',
        workflowId: workItemId
      });
    } catch (error) {
      await connection.rollback();
      res.status(400).json({
        success: false,
        message: 'Failed to delete loan fee',
        error: error.message
      });
    } finally {
      connection.release();
    }
  }
}

export default LoanFeeController;