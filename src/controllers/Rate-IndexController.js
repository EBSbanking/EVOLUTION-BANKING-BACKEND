// src/controllers/RateIndexController.js - UPDATED VERSION
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import RateIndex from '../models/Rate-Index.js';
import AuditTrail from '../models/AuditTrail.js';
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
      const filter = {};
      
      if (RATE_TYPE) filter.RATE_TYPE = RATE_TYPE;
      if (CRNCY_ID) filter.CRNCY_ID = CRNCY_ID;
      if (STATUS) filter.STATUS = STATUS;

      const rateIndices = await RateIndex.find(filter)
        .sort({ INDEX_RATE_ID: 1 }); // Sort by ID
      
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

  // CREATE A NEW RATE INDEX - UPDATED FOR YOUR FRONTEND
  createRateIndex: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

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
      const existingRateIndex = await RateIndex.findOne({
        INDEX_RATE_ID: req.body.INDEX_RATE_ID
      }).session(session);
      
      if (existingRateIndex) {
        throw new Error(`Rate Index with ID ${req.body.INDEX_RATE_ID} already exists`);
      }

      // Check for duplicate INDEX_CD
      const existingRateCode = await RateIndex.findOne({
        INDEX_CD: req.body.INDEX_CD
      }).session(session);
      
      if (existingRateCode) {
        throw new Error(`Rate Index with code ${req.body.INDEX_CD} already exists`);
      }

      // If setting as default, unset other defaults
      if (req.body.IS_DEFAULT === true) {
        await RateIndex.updateMany(
          { IS_DEFAULT: true },
          { IS_DEFAULT: false },
          { session }
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

      const newRateIndex = new RateIndex(rateIndexData);
      await newRateIndex.save({ session });

      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        user_name: req.user?.name || 'SYSTEM',
        event_type: 'CREATE',
        action: 'CREATE_RATE_INDEX',
        old_value: null,
        new_value: {
          INDEX_RATE_ID: newRateIndex.INDEX_RATE_ID,
          INDEX_CD: newRateIndex.INDEX_CD,
          INDEX_RATE: newRateIndex.INDEX_RATE,
          INDEX_NM: newRateIndex.INDEX_NM,
          RATE_TYPE: newRateIndex.RATE_TYPE,
          CRNCY_ID: newRateIndex.CRNCY_ID,
          EFFECTIVE_DT: newRateIndex.EFFECTIVE_DT,
          IS_DEFAULT: newRateIndex.IS_DEFAULT,
          STATUS: newRateIndex.STATUS
        },
        ip_address: getClientIp(req),
        user_agent: req.headers['user-agent'],
        entity_id: newRateIndex._id.toString(),
        entity_type: 'RateIndex',
        status: 'SUCCESS',
        description: `Created rate index: ${newRateIndex.INDEX_NM} (${newRateIndex.INDEX_CD})`,
        timestamp: new Date(),
        metadata: {
          route: req.originalUrl,
          method: req.method
        }
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

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
      await session.abortTransaction();
      console.error('Error creating Rate Index:', error);
      
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }));
        
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }
      
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(400).json({
          success: false,
          message: `Duplicate value for ${field}`,
          field
        });
      }
      
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create Rate Index',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } finally {
      session.endSession();
    }
  }),

  // GET SPECIFIC RATE INDEX BY ID
  getRateIndexById: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      
      let rateIndex;
      if (mongoose.Types.ObjectId.isValid(id)) {
        rateIndex = await RateIndex.findById(id);
      } else {
        // Try to find by INDEX_RATE_ID
        const numericId = parseInt(id);
        if (!isNaN(numericId)) {
          rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: numericId });
        }
        if (!rateIndex) {
          // Try by INDEX_CD
          rateIndex = await RateIndex.findOne({ INDEX_CD: id.toUpperCase() });
        }
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

  // UPDATE EXISTING RATE INDEX - UPDATED
  updateRateIndex: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Find rate index
      let rateIndex;
      if (mongoose.Types.ObjectId.isValid(id)) {
        rateIndex = await RateIndex.findById(id).session(session);
      } else {
        const numericId = parseInt(id);
        if (!isNaN(numericId)) {
          rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: numericId }).session(session);
        }
      }
      
      if (!rateIndex) {
        return res.status(404).json({
          success: false,
          message: 'Rate Index not found'
        });
      }
      
      // Handle IS_DEFAULT update
      if (updateData.IS_DEFAULT === true && !rateIndex.IS_DEFAULT) {
        await RateIndex.updateMany(
          { IS_DEFAULT: true },
          { IS_DEFAULT: false },
          { session }
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
      Object.assign(rateIndex, updates);
      await rateIndex.save({ session });

      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        user_name: req.user?.name || 'SYSTEM',
        event_type: 'UPDATE',
        action: 'UPDATE_RATE_INDEX',
        old_value: null, // In production, store old values
        new_value: updates,
        ip_address: getClientIp(req),
        user_agent: req.headers['user-agent'],
        entity_id: rateIndex._id.toString(),
        entity_type: 'RateIndex',
        status: 'SUCCESS',
        description: `Updated rate index: ${rateIndex.INDEX_NM} (${rateIndex.INDEX_CD})`,
        timestamp: new Date(),
        metadata: {
          route: req.originalUrl,
          method: req.method
        }
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

      res.status(200).json({
        success: true,
        message: 'Rate Index updated successfully',
        data: rateIndex
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Error updating Rate Index:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update Rate Index'
      });
    } finally {
      session.endSession();
    }
  }),

  // DELETE RATE INDEX BY ID - UPDATED
  deleteRateIndex: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;
      
      let rateIndex;
      if (mongoose.Types.ObjectId.isValid(id)) {
        rateIndex = await RateIndex.findById(id).session(session);
      } else {
        const numericId = parseInt(id);
        if (!isNaN(numericId)) {
          rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: numericId }).session(session);
        }
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
      
      await rateIndex.deleteOne({ session });

      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        user_name: req.user?.name || 'SYSTEM',
        event_type: 'DELETE',
        action: 'DELETE_RATE_INDEX',
        old_value: {
          INDEX_RATE_ID: rateIndex.INDEX_RATE_ID,
          INDEX_CD: rateIndex.INDEX_CD,
          INDEX_NM: rateIndex.INDEX_NM,
          INDEX_RATE: rateIndex.INDEX_RATE
        },
        new_value: null,
        ip_address: getClientIp(req),
        user_agent: req.headers['user-agent'],
        entity_id: rateIndex._id.toString(),
        entity_type: 'RateIndex',
        status: 'SUCCESS',
        description: `Deleted rate index: ${rateIndex.INDEX_NM} (${rateIndex.INDEX_CD})`,
        timestamp: new Date(),
        metadata: {
          route: req.originalUrl,
          method: req.method
        }
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

      res.status(200).json({
        success: true,
        message: 'Rate Index deleted successfully'
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Error deleting Rate Index:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete Rate Index'
      });
    } finally {
      session.endSession();
    }
  }),

  // CALCULATE INTEREST USING RATE INDEX - UPDATED
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
      if (mongoose.Types.ObjectId.isValid(id)) {
        rateIndex = await RateIndex.findById(id);
      } else {
        const numericId = parseInt(id);
        if (!isNaN(numericId)) {
          rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: numericId });
        }
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
      const defaultRate = await RateIndex.findOne({ 
        IS_DEFAULT: true, 
        STATUS: 'ACTIVE' 
      });
      
      if (!defaultRate) {
        // Fallback to first active rate
        const fallbackRate = await RateIndex.findOne({ STATUS: 'ACTIVE' })
          .sort({ INDEX_RATE_ID: 1 });
        
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

  // Add these methods to your existing Rate-IndexController.js file

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
    
    const rateIndices = await RateIndex.find({
      CRNCY_ID: currency.toUpperCase(),
      STATUS: 'ACTIVE'
    }).sort({ IS_DEFAULT: -1, INDEX_RATE_ID: 1 }); // Default rates first
    
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
  const session = await mongoose.startSession();
  session.startTransaction();

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
        if (mongoose.Types.ObjectId.isValid(id)) {
          rateIndex = await RateIndex.findById(id).session(session);
        } else {
          const numericId = parseInt(id);
          if (!isNaN(numericId)) {
            rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: numericId }).session(session);
          }
        }
        
        if (!rateIndex) {
          errors.push({
            id,
            error: 'Rate Index not found'
          });
          continue;
        }
        
        // Handle IS_DEFAULT update
        if (updateData.IS_DEFAULT === true && !rateIndex.IS_DEFAULT) {
          await RateIndex.updateMany(
            { IS_DEFAULT: true },
            { IS_DEFAULT: false },
            { session }
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
        Object.assign(rateIndex, updatesToApply);
        await rateIndex.save({ session });
        
        results.push({
          id,
          success: true,
          data: rateIndex
        });
        
        // AUDIT TRAIL for each update
        const auditTrailData = {
          event_id: generateEventId(),
          user_id: req.user?.id || 'SYSTEM',
          user_name: req.user?.name || 'SYSTEM',
          event_type: 'UPDATE',
          action: 'BULK_UPDATE_RATE_INDEX',
          old_value: null,
          new_value: updatesToApply,
          ip_address: getClientIp(req),
          user_agent: req.headers['user-agent'],
          entity_id: rateIndex._id.toString(),
          entity_type: 'RateIndex',
          status: 'SUCCESS',
          description: `Bulk update for rate index: ${rateIndex.INDEX_NM}`,
          timestamp: new Date(),
          metadata: {
            route: req.originalUrl,
            method: req.method,
            batchOperation: true
          }
        };
        
        await new AuditTrail(auditTrailData).save({ session });
        
      } catch (itemError) {
        errors.push({
          id: update.id,
          error: itemError.message
        });
      }
    }
    
    await session.commitTransaction();
    
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
    await session.abortTransaction();
    console.error('Error in bulk update:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk update failed',
      error: error.message
    });
  } finally {
    session.endSession();
  }
}),

// Also add this method if you want to get rate indices by type
getRateIndicesByType: asyncHandler(async (req, res) => {
  try {
    const { type } = req.params;
    
    const rateIndices = await RateIndex.find({
      RATE_TYPE: type.toUpperCase(),
      STATUS: 'ACTIVE'
    }).sort({ IS_DEFAULT: -1, INDEX_RATE_ID: 1 });
    
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


  // Other methods remain the same...
};

export default RateIndexController;