import LoanFee from '../models/LoanFee.js';
import mongoose from 'mongoose';
import { logAuditTrail } from '../Services/AuditService.js';
import generateWorkflowIdentifiers from '../utils/generateWorkflowIdentifiers.js';

class LoanFeeController {
  /**
   * @method createFee
   * @description Create a new loan fee with workflow tracking
   */
  static async createFee(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
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

      // Convert createdBy to proper format
      let createdById;
      if (createdBy === 'system') {
        createdById = 'system';
      } else if (mongoose.isValidObjectId(createdBy)) {
        createdById = new mongoose.Types.ObjectId(createdBy);
      } else {
        throw new Error('Invalid createdBy value - must be either "system" or a valid ObjectId');
      }

      const newFee = new LoanFee({
        PROD_ID,
        name,
        type,
        isPercentage,
        value,
        minAmount: isPercentage ? minAmount || 0 : 0,
        maxAmount: isPercentage ? maxAmount || 0 : 0,
        glAccountCode,
        taxable,
        taxRate: taxable ? taxRate || 0 : 0,
        appliesToDisbursement,
        appliesToRepayment,
        createdBy: createdById,
        workflowMetadata: {
          workItemId,
          processId,
          ...req.workflowIdentifiers
        }
      });

      await newFee.save({ session });

      await logAuditTrail({
        eventId: workItemId,
        processId,
        userId: createdById === 'system' ? 'system' : createdById,
        action: 'FEE_CREATED',
        entityType: 'LOAN_FEE',
        entityId: newFee._id,
        description: `Created fee ${name} for product ${PROD_ID}`,
        oldValue: {},
        newValue: newFee.toObject(),
        session
      });

      await session.commitTransaction();

      res.status(201).json({
        success: true,
        message: 'Loan fee created successfully',
        data: newFee,
        workflowId: workItemId
      });
    } catch (error) {
      await session.abortTransaction();
      res.status(400).json({
        success: false,
        message: 'Failed to create loan fee',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * @method getFeesByProduct
   * @description Get all fees for a specific loan product
   */
  static async getFeesByProduct(req, res) {
    try {
      const { productId } = req.params;
      const { activeOnly = 'true' } = req.query;
      const { workItemId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      const query = { PROD_ID: productId };
      if (activeOnly === 'true') query.active = true;

      const fees = await LoanFee.find(query)
        .populate('createdBy', 'firstName lastName')
        .populate('updatedBy', 'firstName lastName')
        .lean();

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
    }
  }

  /**
   * @method updateFee
   * @description Update an existing loan fee with workflow tracking
   */
  static async updateFee(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { feeId } = req.params;
      const updates = req.body;
      const { workItemId, processId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      if (updates.PROD_ID || updates.createdBy) {
        throw new Error('Product ID and created by cannot be modified');
      }

      const existingFee = await LoanFee.findById(feeId).session(session);
      if (!existingFee) {
        throw new Error('Loan fee not found');
      }

      const oldFee = existingFee.toObject();
      Object.assign(existingFee, {
        ...updates,
        updatedBy: req.user?.id || 'system',
        updatedAt: new Date(),
        workflowMetadata: {
          ...existingFee.workflowMetadata,
          lastWorkItemId: workItemId,
          lastProcessId: processId
        }
      });

      await existingFee.save({ session });

      await logAuditTrail({
        eventId: workItemId,
        processId,
        userId: req.user?.id || 'system',
        action: 'FEE_UPDATED',
        entityType: 'LOAN_FEE',
        entityId: existingFee._id,
        description: `Updated fee ${existingFee.name}`,
        oldValue: oldFee,
        newValue: existingFee.toObject(),
        session
      });

      await session.commitTransaction();

      res.status(200).json({
        success: true,
        message: 'Loan fee updated successfully',
        data: existingFee,
        workflowId: workItemId
      });
    } catch (error) {
      await session.abortTransaction();
      res.status(400).json({
        success: false,
        message: 'Failed to update loan fee',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * @method toggleFeeStatus
   * @description Toggle fee active status with workflow tracking
   */
  static async toggleFeeStatus(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { feeId } = req.params;
      const { workItemId, processId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      const fee = await LoanFee.findById(feeId).session(session);
      if (!fee) {
        throw new Error('Loan fee not found');
      }

      const oldStatus = fee.active;
      fee.active = !fee.active;
      fee.updatedBy = req.user?.id || 'system';
      fee.updatedAt = new Date();
      fee.workflowMetadata = {
        ...fee.workflowMetadata,
        lastWorkItemId: workItemId,
        lastProcessId: processId
      };

      await fee.save({ session });

      await logAuditTrail({
        eventId: workItemId,
        processId,
        userId: req.user?.id || 'system',
        action: 'FEE_STATUS_CHANGED',
        entityType: 'LOAN_FEE',
        entityId: fee._id,
        description: `Changed fee ${fee.name} status from ${oldStatus} to ${fee.active}`,
        oldValue: { active: oldStatus },
        newValue: { active: fee.active },
        session
      });

      await session.commitTransaction();

      res.status(200).json({
        success: true,
        message: `Fee ${fee.active ? 'activated' : 'deactivated'} successfully`,
        data: { active: fee.active },
        workflowId: workItemId
      });
    } catch (error) {
      await session.abortTransaction();
      res.status(400).json({
        success: false,
        message: 'Failed to toggle fee status',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * @method calculateFeesForAmount
   * @description Calculate all fees for a specific loan amount
   */
  static async calculateFeesForAmount(req, res) {
    try {
      const { productId, amount } = req.params;
      const { workItemId } = req.workflowIdentifiers || generateWorkflowIdentifiers();
      
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Amount must be a positive number');
      }

      const calculatedFees = await LoanFee.calculateFees(productId, parseFloat(amount));

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
          fees: calculatedFees
        }
      });

      res.status(200).json({
        success: true,
        data: {
          productId,
          loanAmount: parseFloat(amount),
          fees: calculatedFees,
          totalFees: calculatedFees.reduce((sum, fee) => sum + fee.amount, 0),
          workflowId: workItemId
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Failed to calculate fees',
        error: error.message
      });
    }
  }

  /**
   * @method getProcessingFee
   * @description Calculate only the processing fee for a loan amount
   */
  static async getProcessingFee(req, res) {
    try {
      const { productId, amount } = req.params;
      const { workItemId } = req.workflowIdentifiers || generateWorkflowIdentifiers();

      if (isNaN(amount) || amount <= 0) {
        throw new Error('Amount must be a positive number');
      }

      const processingFee = await LoanFee.getProcessingFee(productId, parseFloat(amount));

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
          processingFee
        }
      });

      res.status(200).json({
        success: true,
        data: {
          productId,
          loanAmount: parseFloat(amount),
          processingFee,
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
    }
  }
}

export default LoanFeeController;