// src/controllers/LoanFeeController.js - MySQL VERSION
import { getPool } from '../../config/db.js'; // MySQL connection pool
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

    // First, ensure the LoanFee table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS LoanFee (
        id INT AUTO_INCREMENT PRIMARY KEY,
        PROD_ID INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        isPercentage BOOLEAN DEFAULT FALSE,
        value DECIMAL(15, 5) NOT NULL,
        minAmount DECIMAL(15, 2) DEFAULT 0,
        maxAmount DECIMAL(15, 2) DEFAULT 0,
        glAccountCode VARCHAR(50),
        taxable BOOLEAN DEFAULT FALSE,
        taxRate DECIMAL(5, 2) DEFAULT 0,
        appliesToDisbursement BOOLEAN DEFAULT FALSE,
        appliesToRepayment BOOLEAN DEFAULT FALSE,
        createdBy VARCHAR(50) DEFAULT 'system',
        workItemId VARCHAR(100),
        processId VARCHAR(100),
        active BOOLEAN DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_prod_id (PROD_ID),
        INDEX idx_type (type),
        INDEX idx_active (active),
        INDEX idx_created_at (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✅ LoanFee table checked/created');

    const { 
      PROD_ID, 
      name, 
      type, 
      isPercentage, 
      value, 
      minAmount, 
      maxAmount, 
      glAccountCode, 
      taxable, 
      taxRate, 
      appliesToDisbursement, 
      appliesToRepayment,
      createdBy = req.user?.id || 'system'
    } = req.body;
    
    const { workItemId, processId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

    // Validate required fields
    if (!PROD_ID || !name || !type || value === undefined) {
      throw new Error('PROD_ID, name, type, and value are required');
    }

    // Validate user ID
    let createdById = createdBy;
    if (createdById === 'system') {
      createdById = 'system';
    } else if (!createdById || createdById.length < 1) {
      throw new Error('Invalid createdBy value');
    }

    // Insert new fee
    const [result] = await connection.query(`
      INSERT INTO LoanFee (
        PROD_ID, name, type, isPercentage, value, minAmount, maxAmount,
        glAccountCode, taxable, taxRate, appliesToDisbursement, appliesToRepayment,
        createdBy, workItemId, processId, createdAt, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
    `, [
      PROD_ID, 
      name, 
      type, 
      isPercentage || false, 
      parseFloat(value),
      isPercentage ? (minAmount || 0) : 0,
      isPercentage ? (maxAmount || 0) : 0,
      glAccountCode || null,
      taxable || false,
      taxable ? (taxRate || 0) : 0,
      appliesToDisbursement || false,
      appliesToRepayment || false,
      createdById,
      workItemId,
      processId
    ]);

    const feeId = result.insertId;

    // Get the created fee
    const [feeRows] = await connection.query(
      'SELECT * FROM LoanFee WHERE id = ?',
      [feeId]
    );
    const newFee = feeRows[0];

    // Try to log audit trail, but don't fail if it doesn't work
    try {
      // IMPORTANT: Use the correct function signature for your AuditService
      // Import it at the top of your controller file:
      // import { logAuditTrail } from '../services/AuditService.js';
      
   // In LoanFeeController.js, update the logAuditTrail call:
await logAuditTrail({
  entityId: feeId,
  entityType: 'LOAN_FEE',
  action: 'CREATE', // Use 'CREATE' instead of 'FEE_CREATED'
  performedBy: createdById,
  ipAddress: req.ip || '127.0.0.1',
  userInfo: { id: createdById, username: createdById },
  changedFields: ['ALL'],
  previousValues: null,
  newValue: newFee,
  notes: `Loan fee "${name}" created for product ${PROD_ID}`, // Put details here
});
    } catch (auditError) {
      console.warn('⚠️ Could not log audit trail:', auditError.message);
      // Don't throw - continue with the transaction
      // Optionally, log to a simpler audit system
      try {
        // Fallback: Log to a simpler audit table
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
        console.log('✅ Fallback audit logged');
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
   * @description Get all fees for a specific loan product
   */
  static async getFeesByProduct(req, res) {
    const pool = getPool();
    let connection;
    
    try {
      connection = await pool.getConnection();
      
      const { productId } = req.params;
      const { activeOnly = 'true' } = req.query;
      const { workItemId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      let query = 'SELECT * FROM LoanFee WHERE PROD_ID = ?';
      const params = [productId];
      
      if (activeOnly === 'true') {
        query += ' AND active = 1';
      }

      const [fees] = await connection.query(query, params);

      // Get user details for createdBy and updatedBy
      if (fees.length > 0) {
        const userIds = [...new Set(fees.map(fee => fee.createdBy).filter(Boolean))];
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
            fee.createdByUser = userMap[fee.createdBy] || null;
            fee.updatedByUser = userMap[fee.updatedBy] || null;
          });
        }
      }

      // Log audit trail
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
   * @description Update an existing loan fee with workflow tracking
   */
  static async updateFee(req, res) {
    const pool = getPool();
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const { feeId } = req.params;
      const updates = req.body;
      const { workItemId, processId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      if (updates.PROD_ID || updates.createdBy) {
        throw new Error('Product ID and created by cannot be modified');
      }

      // Get existing fee
      const [existingRows] = await connection.query(
        'SELECT * FROM LoanFee WHERE id = ? FOR UPDATE',
        [feeId]
      );

      if (existingRows.length === 0) {
        throw new Error('Loan fee not found');
      }

      const existingFee = existingRows[0];
      const oldFee = { ...existingFee };

      // Prepare update data
      const updateFields = [];
      const updateValues = [];
      
      const allowedFields = [
        'name', 'type', 'isPercentage', 'value', 'minAmount', 'maxAmount',
        'glAccountCode', 'taxable', 'taxRate', 'appliesToDisbursement',
        'appliesToRepayment', 'updatedBy', 'workItemId', 'processId'
      ];

      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          if (field === 'value' || field === 'minAmount' || field === 'maxAmount' || field === 'taxRate') {
            updateValues.push(parseFloat(updates[field]));
          } else if (field === 'isPercentage' || field === 'taxable' || 
                   field === 'appliesToDisbursement' || field === 'appliesToRepayment') {
            updateValues.push(updates[field] ? 1 : 0);
          } else {
            updateValues.push(updates[field]);
          }
          updateFields.push(`${field} = ?`);
        }
      });

      // Always update these fields
      updateFields.push('updatedAt = NOW()');
      updateValues.push(feeId);

      // Update the fee
      await connection.query(
        `UPDATE LoanFee SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      // Get updated fee
      const [updatedRows] = await connection.query(
        'SELECT * FROM LoanFee WHERE id = ?',
        [feeId]
      );
      const updatedFee = updatedRows[0];

      // Log audit trail
      await logAuditTrail({
        eventId: workItemId,
        processId,
        userId: req.user?.id || 'system',
        action: 'FEE_UPDATED',
        entityType: 'LOAN_FEE',
        entityId: feeId,
        description: `Updated fee ${updatedFee.name}`,
        oldValue: oldFee,
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
   * @description Toggle fee active status with workflow tracking
   */
  static async toggleFeeStatus(req, res) {
    const pool = getPool();
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const { feeId } = req.params;
      const { workItemId, processId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      // Get fee with lock
      const [feeRows] = await connection.query(
        'SELECT * FROM LoanFee WHERE id = ? FOR UPDATE',
        [feeId]
      );

      if (feeRows.length === 0) {
        throw new Error('Loan fee not found');
      }

      const fee = feeRows[0];
      const oldStatus = fee.active;

      // Toggle active status
      const newStatus = oldStatus ? 0 : 1;
      await connection.query(`
        UPDATE LoanFee 
        SET active = ?, updatedBy = ?, updatedAt = NOW(),
            lastWorkItemId = ?, lastProcessId = ?
        WHERE id = ?
      `, [
        newStatus,
        req.user?.id || 'system',
        workItemId,
        processId,
        feeId
      ]);

      // Log audit trail
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
   * @description Calculate all fees for a specific loan amount
   */
  static async calculateFeesForAmount(req, res) {
    const pool = getPool();
    let connection;
    
    try {
      connection = await pool.getConnection();
      
      const { productId, amount } = req.params;
      const { workItemId } = req.workflowIdentifiers || generateWorkflowIdentifiers();
      
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Amount must be a positive number');
      }

      const loanAmount = parseFloat(amount);

      // Get all active fees for the product
      const [fees] = await connection.query(`
        SELECT * FROM LoanFee 
        WHERE PROD_ID = ? AND active = 1
      `, [productId]);

      // Calculate fees
      const calculatedFees = fees.map(fee => {
        let feeAmount = 0;
        
        if (fee.isPercentage) {
          feeAmount = loanAmount * (fee.value / 100);
          
          // Apply min/max constraints
          if (fee.minAmount && feeAmount < fee.minAmount) {
            feeAmount = parseFloat(fee.minAmount);
          }
          if (fee.maxAmount && feeAmount > fee.maxAmount) {
            feeAmount = parseFloat(fee.maxAmount);
          }
        } else {
          feeAmount = parseFloat(fee.value);
        }

        // Apply tax if applicable
        let taxAmount = 0;
        if (fee.taxable && fee.taxRate > 0) {
          taxAmount = feeAmount * (fee.taxRate / 100);
        }

        return {
          feeId: fee.id,
          name: fee.name,
          type: fee.type,
          isPercentage: fee.isPercentage,
          rate: fee.isPercentage ? fee.value : null,
          amount: feeAmount,
          taxable: fee.taxable,
          taxRate: fee.taxRate,
          taxAmount: taxAmount,
          totalAmount: feeAmount + taxAmount,
          appliesToDisbursement: fee.appliesToDisbursement,
          appliesToRepayment: fee.appliesToRepayment,
          glAccountCode: fee.glAccountCode
        };
      });

      // Log audit trail
      await logAuditTrail({
        eventId: workItemId,
        userId: req.user?.id || 'system',
        action: 'FEE_CALCULATION',
        entityType: 'LOAN_PRODUCT',
        entityId: productId,
        description: `Calculated fees for amount ${amount}`,
        newValue: {
          productId,
          amount,
          feesCount: calculatedFees.length
        }
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
   * @description Calculate only the processing fee for a loan amount
   */
  static async getProcessingFee(req, res) {
    const pool = getPool();
    let connection;
    
    try {
      connection = await pool.getConnection();
      
      const { productId, amount } = req.params;
      const { workItemId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      if (isNaN(amount) || amount <= 0) {
        throw new Error('Amount must be a positive number');
      }

      const loanAmount = parseFloat(amount);

      // Get processing fee for the product
      const [feeRows] = await connection.query(`
        SELECT * FROM LoanFee 
        WHERE PROD_ID = ? AND active = 1 AND type = 'PROCESSING'
        LIMIT 1
      `, [productId]);

      if (feeRows.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            productId,
            loanAmount,
            processingFee: 0,
            currency: 'NGN',
            message: 'No processing fee configured for this product'
          },
          workflowId: workItemId
        });
      }

      const fee = feeRows[0];
      let processingFee = 0;

      if (fee.isPercentage) {
        processingFee = loanAmount * (fee.value / 100);
        
        // Apply min/max constraints
        if (fee.minAmount && processingFee < fee.minAmount) {
          processingFee = parseFloat(fee.minAmount);
        }
        if (fee.maxAmount && processingFee > fee.maxAmount) {
          processingFee = parseFloat(fee.maxAmount);
        }
      } else {
        processingFee = parseFloat(fee.value);
      }

      // Apply tax if applicable
      let taxAmount = 0;
      if (fee.taxable && fee.taxRate > 0) {
        taxAmount = processingFee * (fee.taxRate / 100);
      }

      const totalProcessingFee = processingFee + taxAmount;

      // Log audit trail
      await logAuditTrail({
        eventId: workItemId,
        userId: req.user?.id || 'system',
        action: 'PROCESSING_FEE_CALCULATION',
        entityType: 'LOAN_PRODUCT',
        entityId: productId,
        description: `Calculated processing fee for amount ${amount}`,
        newValue: {
          productId,
          amount,
          processingFee: totalProcessingFee
        }
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
            taxRate: fee.taxRate,
            isPercentage: fee.isPercentage,
            rate: fee.isPercentage ? fee.value : null
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
   * @description Get a single fee by ID
   */
  static async getFeeById(req, res) {
    const pool = getPool();
    let connection;
    
    try {
      connection = await pool.getConnection();
      
      const { feeId } = req.params;
      const { workItemId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      const [feeRows] = await connection.query(
        'SELECT * FROM LoanFee WHERE id = ?',
        [feeId]
      );

      if (feeRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Loan fee not found'
        });
      }

      const fee = feeRows[0];

      // Log audit trail
      await logAuditTrail({
        eventId: workItemId,
        userId: req.user?.id || 'system',
        action: 'FEE_VIEWED',
        entityType: 'LOAN_FEE',
        entityId: feeId,
        description: `Viewed fee ${fee.name}`,
        newValue: { feeId }
      });

      res.status(200).json({
        success: true,
        data: fee,
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
   * @method deleteFee
   * @description Soft delete a loan fee
   */
  static async deleteFee(req, res) {
    const pool = getPool();
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const { feeId } = req.params;
      const { workItemId, processId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      // Check if fee exists
      const [feeRows] = await connection.query(
        'SELECT * FROM LoanFee WHERE id = ?',
        [feeId]
      );

      if (feeRows.length === 0) {
        throw new Error('Loan fee not found');
      }

      const fee = feeRows[0];

      // Soft delete by setting deleted flag
      await connection.query(`
        UPDATE LoanFee 
        SET deleted = 1, deletedAt = NOW(), deletedBy = ?, updatedAt = NOW()
        WHERE id = ?
      `, [req.user?.id || 'system', feeId]);

      // Log audit trail
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