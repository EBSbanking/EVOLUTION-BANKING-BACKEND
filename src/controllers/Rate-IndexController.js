// src/controllers/RateIndexController.js - UPDATED VERSION WITH SEQUELIZE
import asyncHandler from 'express-async-handler';
import { Sequelize, Op } from 'sequelize';
import db from '../models/index.js'; // Your Sequelize models
import { 
  auditLogger, 
  logAuditTrail, 
  logAuditTrailWithBranch 
} from '../utils/AuditLogger.js';
import InterestCalculationService from '../Services/InterestCalculationService.js';

const interestService = new InterestCalculationService();

// Helper functions
const getClientIp = (req) => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         '127.0.0.1';
};

const generateEventId = () => {
  return Date.now() + Math.floor(Math.random() * 1000);
};

const RateIndexController = {
  // GET ALL RATE INDICES
  getAllRateIndices: asyncHandler(async (req, res) => {
    try {
      const { RATE_TYPE, CRNCY_ID, STATUS } = req.query;
      
      const where = {};
      
      if (RATE_TYPE) where.RATE_TYPE = RATE_TYPE;
      if (CRNCY_ID) where.CRNCY_ID = CRNCY_ID;
      if (STATUS) where.STATUS = STATUS;

      const rateIndices = await db.RateIndex.findAll({
        where,
        order: [['INDEX_RATE_ID', 'ASC']]
      });
      
      res.status(200).json({
        success: true,
        count: rateIndices.length,
        data: rateIndices
      });
    } catch (error) {
      console.error('Error fetching rate indices:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch rate indices'
      });
    }
  }),

  // CREATE A NEW RATE INDEX
  createRateIndex: asyncHandler(async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      // Required fields based on your frontend
      const requiredFields = [
        'INDEX_RATE_ID', 'INDEX_CD', 'INDEX_RATE', 
        'INDEX_NM', 'CRNCY_ID', 'PRECISION', 
        'EFFECTIVE_DT', 'DAY_COUNT_CONVENTION'
      ];
      
      const missingFields = requiredFields.filter(field => !req.body[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          missingFields
        });
      }

      // Validate rate is a positive number
      const rateValue = parseFloat(req.body.INDEX_RATE);
      if (isNaN(rateValue) || rateValue <= 0) {
        throw new Error('INDEX_RATE must be a positive number');
      }

      // Check for duplicate INDEX_RATE_ID
      const existingRateIndexById = await db.RateIndex.findOne({
        where: {
          INDEX_RATE_ID: parseInt(req.body.INDEX_RATE_ID)
        },
        transaction
      });
      
      if (existingRateIndexById) {
        throw new Error(`Rate Index with ID ${req.body.INDEX_RATE_ID} already exists`);
      }

      // Check for duplicate INDEX_CD
      const existingRateCode = await db.RateIndex.findOne({
        where: {
          INDEX_CD: req.body.INDEX_CD.toUpperCase()
        },
        transaction
      });
      
      if (existingRateCode) {
        throw new Error(`Rate Index with code ${req.body.INDEX_CD} already exists`);
      }

      // If setting as default, unset other defaults
      if (req.body.IS_DEFAULT === true) {
        await db.RateIndex.update(
          { IS_DEFAULT: false },
          {
            where: { IS_DEFAULT: true },
            transaction
          }
        );
      }

      // Prepare rate index data
      const rateIndexData = {
        INDEX_RATE_ID: parseInt(req.body.INDEX_RATE_ID),
        INDEX_CD: req.body.INDEX_CD.toUpperCase(),
        INDEX_RATE: rateValue,
        INDEX_NM: req.body.INDEX_NM,
        RATE_TYPE: req.body.RATE_TYPE || 'FIXED',
        CRNCY_ID: req.body.CRNCY_ID.toUpperCase(),
        PRECISION: parseInt(req.body.PRECISION),
        EFFECTIVE_DT: new Date(req.body.EFFECTIVE_DT),
        DAY_COUNT_CONVENTION: req.body.DAY_COUNT_CONVENTION,
        IS_DEFAULT: req.body.IS_DEFAULT || false,
        STATUS: req.body.STATUS || 'ACTIVE',
        DESCRIPTION: req.body.DESCRIPTION || '',
        CREATED_BY: req.body.CREATED_BY || req.user?.id || 'SYSTEM',
        UPDATED_BY: req.body.UPDATED_BY || req.user?.id || 'SYSTEM',
        CREATED_AT: new Date(),
        UPDATED_AT: new Date()
      };

      const newRateIndex = await db.RateIndex.create(rateIndexData, { transaction });

      // AUDIT TRAIL using the imported audit logger
      await logAuditTrail(
        'RateIndex',
        newRateIndex.id.toString(),
        req.user?.id?.toString() || 'SYSTEM',
        'CREATE',
        null, // old_value
        {
          INDEX_RATE_ID: newRateIndex.INDEX_RATE_ID,
          INDEX_CD: newRateIndex.INDEX_CD,
          INDEX_RATE: newRateIndex.INDEX_RATE,
          INDEX_NM: newRateIndex.INDEX_NM,
          RATE_TYPE: newRateIndex.RATE_TYPE,
          CRNCY_ID: newRateIndex.CRNCY_ID,
          EFFECTIVE_DT: newRateIndex.EFFECTIVE_DT,
          IS_DEFAULT: newRateIndex.IS_DEFAULT,
          STATUS: newRateIndex.STATUS
        }, // new_value
        getClientIp(req),
        'RATE_INDEX_CREATED',
        {
          branch: 1, // Default branch
          user_name: req.user?.name || 'SYSTEM',
          user_agent: req.headers['user-agent'],
          route: req.originalUrl,
          method: req.method
        } // additional_info
      );

      await transaction.commit();

      res.status(201).json({
        success: true,
        message: 'Rate Index created successfully',
        data: newRateIndex,
        metadata: {
          rateIndexId: newRateIndex.INDEX_RATE_ID,
          rateCode: newRateIndex.INDEX_CD,
          isDefault: newRateIndex.IS_DEFAULT,
          effectiveDate: newRateIndex.EFFECTIVE_DT
        }
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Error creating Rate Index:', error);
      
      if (error.name === 'SequelizeUniqueConstraintError') {
        const field = error.errors?.[0]?.path || 'unique field';
        return res.status(400).json({
          success: false,
          message: `Duplicate value for ${field}`,
          field
        });
      }
      
      if (error.name === 'SequelizeValidationError') {
        const errors = error.errors.map(err => ({
          field: err.path,
          message: err.message
        }));
        
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }
      
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create Rate Index',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }),

  // GET SPECIFIC RATE INDEX BY ID
  getRateIndexById: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      
      let rateIndex;
      
      // Try to find by INDEX_RATE_ID first (if numeric)
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        rateIndex = await db.RateIndex.findOne({
          where: { INDEX_RATE_ID: numericId }
        });
      }
      
      // If not found by INDEX_RATE_ID, try by INDEX_CD
      if (!rateIndex) {
        rateIndex = await db.RateIndex.findOne({
          where: { INDEX_CD: id.toUpperCase() }
        });
      }
      
      // If still not found, try by primary key (id)
      if (!rateIndex) {
        rateIndex = await db.RateIndex.findByPk(id);
      }
      
      if (!rateIndex) {
        return res.status(404).json({
          success: false,
          message: 'Rate Index not found'
        });
      }
      
      res.status(200).json({
        success: true,
        data: rateIndex
      });
    } catch (error) {
      console.error('Error fetching rate index:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch rate index'
      });
    }
  }),

  // UPDATE EXISTING RATE INDEX
  updateRateIndex: asyncHandler(async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Find rate index
      let rateIndex;
      
      // Try by INDEX_RATE_ID first
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        rateIndex = await db.RateIndex.findOne({
          where: { INDEX_RATE_ID: numericId },
          transaction
        });
      }
      
      // If not found, try by primary key
      if (!rateIndex) {
        rateIndex = await db.RateIndex.findByPk(id, { transaction });
      }
      
      if (!rateIndex) {
        return res.status(404).json({
          success: false,
          message: 'Rate Index not found'
        });
      }
      
      // Store old values for audit
      const oldValues = {
        INDEX_NM: rateIndex.INDEX_NM,
        INDEX_RATE: rateIndex.INDEX_RATE,
        RATE_TYPE: rateIndex.RATE_TYPE,
        STATUS: rateIndex.STATUS,
        IS_DEFAULT: rateIndex.IS_DEFAULT,
        DAY_COUNT_CONVENTION: rateIndex.DAY_COUNT_CONVENTION,
        DESCRIPTION: rateIndex.DESCRIPTION
      };
      
      // Handle IS_DEFAULT update
      if (updateData.IS_DEFAULT === true && !rateIndex.IS_DEFAULT) {
        await db.RateIndex.update(
          { IS_DEFAULT: false },
          {
            where: { IS_DEFAULT: true },
            transaction
          }
        );
      }
      
      // Update specific fields
      const allowedUpdates = [
        'INDEX_NM', 'INDEX_RATE', 'RATE_TYPE', 'STATUS', 
        'IS_DEFAULT', 'DAY_COUNT_CONVENTION', 'DESCRIPTION'
      ];
      
      const updates = {};
      allowedUpdates.forEach(field => {
        if (updateData[field] !== undefined) {
          updates[field] = updateData[field];
        }
      });
      
      if (updates.INDEX_RATE !== undefined) {
        updates.INDEX_RATE = parseFloat(updates.INDEX_RATE);
        if (isNaN(updates.INDEX_RATE) || updates.INDEX_RATE <= 0) {
          throw new Error('INDEX_RATE must be a positive number');
        }
      }
      
      updates.UPDATED_AT = new Date();
      updates.UPDATED_BY = req.user?.id || 'SYSTEM';
      
      // Update the rate index
      await rateIndex.update(updates, { transaction });

      // AUDIT TRAIL
      await logAuditTrail(
        'RateIndex',
        rateIndex.id.toString(),
        req.user?.id?.toString() || 'SYSTEM',
        'UPDATE',
        oldValues,
        updates,
        getClientIp(req),
        'RATE_INDEX_UPDATED',
        {
          branch: 1,
          user_name: req.user?.name || 'SYSTEM',
          user_agent: req.headers['user-agent'],
          route: req.originalUrl,
          method: req.method,
          rateIndexId: rateIndex.INDEX_RATE_ID,
          rateCode: rateIndex.INDEX_CD
        }
      );

      await transaction.commit();

      res.status(200).json({
        success: true,
        message: 'Rate Index updated successfully',
        data: rateIndex
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Error updating Rate Index:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update Rate Index'
      });
    }
  }),

  // DELETE RATE INDEX BY ID
  deleteRateIndex: asyncHandler(async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      
      // Find rate index
      let rateIndex;
      
      // Try by INDEX_RATE_ID first
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        rateIndex = await db.RateIndex.findOne({
          where: { INDEX_RATE_ID: numericId },
          transaction
        });
      }
      
      // If not found, try by primary key
      if (!rateIndex) {
        rateIndex = await db.RateIndex.findByPk(id, { transaction });
      }
      
      if (!rateIndex) {
        return res.status(404).json({
          success: false,
          message: 'Rate Index not found'
        });
      }
      
      // Prevent deletion of default rate
      if (rateIndex.IS_DEFAULT) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete default rate index. Set another rate as default first.'
        });
      }
      
      const oldValue = {
        INDEX_RATE_ID: rateIndex.INDEX_RATE_ID,
        INDEX_CD: rateIndex.INDEX_CD,
        INDEX_NM: rateIndex.INDEX_NM,
        INDEX_RATE: rateIndex.INDEX_RATE,
        RATE_TYPE: rateIndex.RATE_TYPE,
        CRNCY_ID: rateIndex.CRNCY_ID,
        STATUS: rateIndex.STATUS
      };
      
      await rateIndex.destroy({ transaction });

      // AUDIT TRAIL
      await logAuditTrail(
        'RateIndex',
        rateIndex.id.toString(),
        req.user?.id?.toString() || 'SYSTEM',
        'DELETE',
        oldValue,
        null,
        getClientIp(req),
        'RATE_INDEX_DELETED',
        {
          branch: 1,
          user_name: req.user?.name || 'SYSTEM',
          user_agent: req.headers['user-agent'],
          route: req.originalUrl,
          method: req.method
        }
      );

      await transaction.commit();

      res.status(200).json({
        success: true,
        message: 'Rate Index deleted successfully'
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Error deleting Rate Index:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete Rate Index'
      });
    }
  }),

  // CALCULATE INTEREST USING RATE INDEX
  calculateInterest: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { principal, days, calculationMethod = 'SIMPLE' } = req.body;
      
      // Validate inputs
      if (!principal || !days) {
        return res.status(400).json({
          success: false,
          message: 'Principal and days are required'
        });
      }
      
      const principalAmount = parseFloat(principal);
      const daysCount = parseInt(days);
      
      if (isNaN(principalAmount) || principalAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Principal must be a positive number'
        });
      }
      
      if (isNaN(daysCount) || daysCount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Days must be a positive number'
        });
      }
      
      // Find rate index
      let rateIndex;
      
      // Try by INDEX_RATE_ID first
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        rateIndex = await db.RateIndex.findOne({
          where: { INDEX_RATE_ID: numericId }
        });
      }
      
      // If not found, try by primary key
      if (!rateIndex) {
        rateIndex = await db.RateIndex.findByPk(id);
      }
      
      if (!rateIndex) {
        return res.status(404).json({
          success: false,
          message: 'Rate Index not found'
        });
      }
      
      // Calculate interest based on day count convention
      const annualRate = parseFloat(rateIndex.INDEX_RATE) / 100;
      let interestAmount;
      
      switch (rateIndex.DAY_COUNT_CONVENTION) {
        case 'ACTUAL/360':
          interestAmount = principalAmount * annualRate * (daysCount / 360);
          break;
        case 'ACTUAL/365':
          interestAmount = principalAmount * annualRate * (daysCount / 365);
          break;
        case '30/360':
          interestAmount = principalAmount * annualRate * (daysCount / 360);
          break;
        case 'BUSINESS/252':
          interestAmount = principalAmount * annualRate * (daysCount / 252);
          break;
        default:
          interestAmount = principalAmount * annualRate * (daysCount / 365);
      }
      
      // For compound interest (basic calculation)
      if (calculationMethod.toUpperCase() === 'COMPOUND') {
        const dailyRate = annualRate / 365;
        interestAmount = principalAmount * (Math.pow(1 + dailyRate, daysCount) - 1);
      }
      
      const totalAmount = principalAmount + interestAmount;
      const dailyInterest = interestAmount / daysCount;
      
      res.status(200).json({
        success: true,
        data: {
          principal: principalAmount,
          annualRate: rateIndex.INDEX_RATE,
          days: daysCount,
          dayCountConvention: rateIndex.DAY_COUNT_CONVENTION,
          calculationMethod,
          interestAmount: parseFloat(interestAmount.toFixed(2)),
          totalAmount: parseFloat(totalAmount.toFixed(2)),
          dailyInterest: parseFloat(dailyInterest.toFixed(2)),
          rateIndexDetails: {
            name: rateIndex.INDEX_NM,
            code: rateIndex.INDEX_CD,
            type: rateIndex.RATE_TYPE
          }
        }
      });
      
    } catch (error) {
      console.error('Error calculating interest:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate interest'
      });
    }
  }),

  // GET DEFAULT RATE INDEX
  getDefaultRateIndex: asyncHandler(async (req, res) => {
    try {
      const defaultRate = await db.RateIndex.findOne({ 
        where: { 
          IS_DEFAULT: true, 
          STATUS: 'ACTIVE' 
        }
      });
      
      if (!defaultRate) {
        // Fallback to first active rate
        const fallbackRate = await db.RateIndex.findOne({ 
          where: { STATUS: 'ACTIVE' },
          order: [['INDEX_RATE_ID', 'ASC']]
        });
        
        if (!fallbackRate) {
          return res.status(404).json({
            success: false,
            message: 'No rate indices found'
          });
        }
        
        return res.status(200).json({
          success: true,
          data: fallbackRate,
          isFallback: true
        });
      }
      
      res.status(200).json({
        success: true,
        data: defaultRate
      });
      
    } catch (error) {
      console.error('Error fetching default rate:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch default rate index'
      });
    }
  }),

  // GET ACTIVE RATE INDICES BY CURRENCY
  getActiveRateIndicesByCurrency: asyncHandler(async (req, res) => {
    try {
      const { currency } = req.params;
      
      if (!currency) {
        return res.status(400).json({
          success: false,
          message: 'Currency parameter is required'
        });
      }
      
      const rateIndices = await db.RateIndex.findAll({
        where: {
          CRNCY_ID: currency.toUpperCase(),
          STATUS: 'ACTIVE'
        },
        order: [
          ['IS_DEFAULT', 'DESC'],
          ['INDEX_RATE_ID', 'ASC']
        ]
      });
      
      res.status(200).json({
        success: true,
        count: rateIndices.length,
        data: rateIndices
      });
    } catch (error) {
      console.error('Error fetching active rate indices by currency:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch active rate indices'
      });
    }
  }),

  // BULK UPDATE RATE INDICES
  bulkUpdateRateIndices: asyncHandler(async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { updates } = req.body;
      
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Updates array is required and must not be empty'
        });
      }
      
      const results = [];
      const errors = [];
      
      for (const update of updates) {
        try {
          const { id, ...updateData } = update;
          
          // Find rate index
          let rateIndex;
          const numericId = parseInt(id);
          if (!isNaN(numericId)) {
            rateIndex = await db.RateIndex.findOne({
              where: { INDEX_RATE_ID: numericId },
              transaction
            });
          }
          
          // If not found by INDEX_RATE_ID, try by primary key
          if (!rateIndex) {
            rateIndex = await db.RateIndex.findByPk(id, { transaction });
          }
          
          if (!rateIndex) {
            errors.push({
              id,
              error: 'Rate Index not found'
            });
            continue;
          }
          
          // Store old values for audit
          const oldValues = {
            INDEX_NM: rateIndex.INDEX_NM,
            INDEX_RATE: rateIndex.INDEX_RATE,
            RATE_TYPE: rateIndex.RATE_TYPE,
            STATUS: rateIndex.STATUS,
            IS_DEFAULT: rateIndex.IS_DEFAULT,
            DAY_COUNT_CONVENTION: rateIndex.DAY_COUNT_CONVENTION,
            DESCRIPTION: rateIndex.DESCRIPTION
          };
          
          // Handle IS_DEFAULT update
          if (updateData.IS_DEFAULT === true && !rateIndex.IS_DEFAULT) {
            await db.RateIndex.update(
              { IS_DEFAULT: false },
              {
                where: { IS_DEFAULT: true },
                transaction
              }
            );
          }
          
          // Update specific fields
          const allowedUpdates = [
            'INDEX_NM', 'INDEX_RATE', 'RATE_TYPE', 'STATUS', 
            'IS_DEFAULT', 'DAY_COUNT_CONVENTION', 'DESCRIPTION'
          ];
          
          const updatesToApply = {};
          allowedUpdates.forEach(field => {
            if (updateData[field] !== undefined) {
              updatesToApply[field] = updateData[field];
            }
          });
          
          if (updatesToApply.INDEX_RATE !== undefined) {
            updatesToApply.INDEX_RATE = parseFloat(updatesToApply.INDEX_RATE);
            if (isNaN(updatesToApply.INDEX_RATE) || updatesToApply.INDEX_RATE <= 0) {
              throw new Error('INDEX_RATE must be a positive number');
            }
          }
          
          updatesToApply.UPDATED_AT = new Date();
          updatesToApply.UPDATED_BY = req.user?.id || 'SYSTEM';
          
          // Apply updates
          await rateIndex.update(updatesToApply, { transaction });
          
          results.push({
            id,
            success: true,
            data: rateIndex
          });
          
          // AUDIT TRAIL for each update
          await logAuditTrail(
            'RateIndex',
            rateIndex.id.toString(),
            req.user?.id?.toString() || 'SYSTEM',
            'UPDATE',
            oldValues,
            updatesToApply,
            getClientIp(req),
            'RATE_INDEX_BULK_UPDATED',
            {
              branch: 1,
              user_name: req.user?.name || 'SYSTEM',
              user_agent: req.headers['user-agent'],
              route: req.originalUrl,
              method: req.method,
              batchOperation: true,
              rateIndexId: rateIndex.INDEX_RATE_ID,
              rateCode: rateIndex.INDEX_CD
            }
          );
          
        } catch (itemError) {
          errors.push({
            id: update.id,
            error: itemError.message
          });
        }
      }
      
      await transaction.commit();
      
      res.status(200).json({
        success: true,
        message: 'Bulk update completed',
        results: {
          successful: results.length,
          failed: errors.length,
          total: updates.length
        },
        data: results,
        errors: errors.length > 0 ? errors : undefined
      });
      
    } catch (error) {
      await transaction.rollback();
      console.error('Error in bulk update:', error);
      res.status(500).json({
        success: false,
        message: 'Bulk update failed',
        error: error.message
      });
    }
  }),

  // GET RATE INDICES BY TYPE
  getRateIndicesByType: asyncHandler(async (req, res) => {
    try {
      const { type } = req.params;
      
      const rateIndices = await db.RateIndex.findAll({
        where: {
          RATE_TYPE: type.toUpperCase(),
          STATUS: 'ACTIVE'
        },
        order: [
          ['IS_DEFAULT', 'DESC'],
          ['INDEX_RATE_ID', 'ASC']
        ]
      });
      
      res.status(200).json({
        success: true,
        count: rateIndices.length,
        data: rateIndices
      });
    } catch (error) {
      console.error('Error fetching rate indices by type:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch rate indices by type'
      });
    }
  })
};

export default RateIndexController;