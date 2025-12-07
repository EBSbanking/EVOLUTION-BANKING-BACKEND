// src/controllers/RateIndexController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import RateIndex from '../models/Rate-Index.js';
import AuditTrail from '../models/AuditTrail.js';
import InterestCalculationService from '../Services/InterestCalculationService.js';

const interestService = new InterestCalculationService();

// Helper functions (same as LoanProductController)
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
    const { INDEX_RATE, CRNCY_ID, REC_ST } = req.query;
    const filter = {};
    
    if (INDEX_RATE) filter.INDEX_RATE = INDEX_RATE;
    if (CRNCY_ID) filter.CRNCY_ID = CRNCY_ID;
    if (REC_ST) filter.REC_ST = REC_ST;

    const rateIndices = await RateIndex.find(filter)
      .sort({ EFFECTIVE_DT: -1 }); // Most recent first
      
    res.status(200).json({
      success: true,
      count: rateIndices.length,
      data: rateIndices
    });
  }),

  // CREATE A NEW RATE INDEX
  createRateIndex: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
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
      if (req.body.INDEX_RATE <= 0) {
        throw new Error('INDEX_RATE must be a positive number');
      }

      // Check for duplicate INDEX_RATE_ID
      const existingRateIndex = await RateIndex.findOne({
        INDEX_RATE_ID: req.body.INDEX_RATE_ID
      }).session(session);
      
      if (existingRateIndex) {
        throw new Error('Rate Index with this INDEX_RATE_ID already exists');
      }

      const newRateIndex = new RateIndex(req.body);
      await newRateIndex.save({ session });

      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'CREATE',
        action: 'CREATE_RATE_INDEX',
        old_value: null,
        new_value: {
          INDEX_RATE_ID: newRateIndex.INDEX_RATE_ID,
          INDEX_CD: newRateIndex.INDEX_CD,
          INDEX_RATE: newRateIndex.INDEX_RATE,
          INDEX_NM: newRateIndex.INDEX_NM,
          CRNCY_ID: newRateIndex.CRNCY_ID,
          EFFECTIVE_DT: newRateIndex.EFFECTIVE_DT
        },
        ip_address: getClientIp(req),
        entity_id: newRateIndex._id.toString(),
        entity_type: 'RateIndex',
        status: 'SUCCESS',
        description: `Created rate index: ${newRateIndex.INDEX_NM} (${newRateIndex.INDEX_CD})`,
        timestamp: new Date()
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

      res.status(201).json({
        success: true,
        message: 'Rate Index created successfully',
        data: newRateIndex
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Error creating Rate Index:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create Rate Index'
      });
    } finally {
      session.endSession();
    }
  }),

  // GET SPECIFIC RATE INDEX BY ID
  getRateIndexById: asyncHandler(async (req, res) => {
    const rateIndex = await RateIndex.findOne({ 
      INDEX_RATE_ID: parseInt(req.params.id) 
    });
    
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
  }),

  // UPDATE EXISTING RATE INDEX
  updateRateIndex: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Prevent updating immutable fields
      const { CREATED_DT, SYS_CREATE_TS, _id, __v, INDEX_RATE_ID, ...updateData } = req.body;
      
      const rateIndex = await RateIndex.findOneAndUpdate(
        { INDEX_RATE_ID: parseInt(req.params.id) },
        updateData,
        { new: true, runValidators: true, session }
      );

      if (!rateIndex) {
        return res.status(404).json({
          success: false,
          message: 'Rate Index not found'
        });
      }

      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'UPDATE',
        action: 'UPDATE_RATE_INDEX',
        old_value: null, // In production, store old values
        new_value: {
          INDEX_RATE_ID: rateIndex.INDEX_RATE_ID,
          INDEX_CD: rateIndex.INDEX_CD,
          INDEX_RATE: rateIndex.INDEX_RATE,
          INDEX_NM: rateIndex.INDEX_NM,
          ...updateData
        },
        ip_address: getClientIp(req),
        entity_id: rateIndex._id.toString(),
        entity_type: 'RateIndex',
        status: 'SUCCESS',
        description: `Updated rate index: ${rateIndex.INDEX_NM}`,
        timestamp: new Date()
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

  // DELETE RATE INDEX BY ID
  deleteRateIndex: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const rateIndexId = parseInt(req.params.id);

      // Check if any loan products are using this rate index
      // You would need to import LoanProduct model and check
      // const productsUsingRate = await LoanProduct.countDocuments({ 
      //   'rateInformation.indexRate': rateIndexId 
      // }).session(session);
      
      // if (productsUsingRate > 0) {
      //   throw new Error('Cannot delete - rate index is in use by loan products');
      // }

      const rateIndex = await RateIndex.findOneAndDelete({ 
        INDEX_RATE_ID: rateIndexId 
      }).session(session);

      if (!rateIndex) {
        return res.status(404).json({
          success: false,
          message: 'Rate Index not found'
        });
      }

      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
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
        entity_id: rateIndex._id.toString(),
        entity_type: 'RateIndex',
        status: 'SUCCESS',
        description: `Deleted rate index: ${rateIndex.INDEX_NM} (${rateIndex.INDEX_CD})`,
        timestamp: new Date()
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

  // CALCULATE INTEREST USING RATE INDEX
  calculateInterest: asyncHandler(async (req, res) => {
    try {
      const { rateIndexId } = req.params;
      const { principal, startDate, endDate } = req.body;

      // Validate inputs
      if (!principal || !startDate) {
        return res.status(400).json({
          success: false,
          message: 'Principal and start date are required'
        });
      }

      // Ensure numeric rateIndexId
      const numericRateIndexId = Number(rateIndexId);
      if (isNaN(numericRateIndexId)) {
        return res.status(400).json({
          success: false,
          message: 'rateIndexId must be a valid number'
        });
      }

      // Get the rate index
      const rateIndex = await RateIndex.findOne({
        INDEX_RATE_ID: numericRateIndexId
      });

      if (!rateIndex) {
        return res.status(404).json({
          success: false,
          message: 'Rate Index not found'
        });
      }

      // Use the centralized service
      const result = await interestService.calculateInterest({
        rateIndexId: numericRateIndexId,
        principal: parseFloat(principal),
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : new Date()
      });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error calculating interest:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate interest',
        error: error.message
      });
    }
  }),

  // GET ACTIVE RATE INDICES FOR CURRENCY
  getActiveRateIndicesByCurrency: asyncHandler(async (req, res) => {
    const { currency } = req.params;
    const { date = new Date().toISOString().split('T')[0] } = req.query;

    const effectiveDate = new Date(date);

    const rateIndices = await RateIndex.find({
      CRNCY_ID: currency,
      REC_ST: 'ACTIVE',
      EFFECTIVE_DT: { $lte: effectiveDate }
    })
    .sort({ EFFECTIVE_DT: -1 })
    .limit(10);

    res.status(200).json({
      success: true,
      data: rateIndices
    });
  }),

  // BULK UPDATE RATE INDICES
  bulkUpdateRateIndices: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { updates } = req.body; // Array of { INDEX_RATE_ID, updates }

      if (!Array.isArray(updates) || updates.length === 0) {
        throw new Error('Updates array is required and must not be empty');
      }

      const results = [];
      const errors = [];

      for (const update of updates) {
        try {
          const { INDEX_RATE_ID, ...updateData } = update;
          
          if (!INDEX_RATE_ID) {
            errors.push({ INDEX_RATE_ID, error: 'INDEX_RATE_ID is required' });
            continue;
          }

          const rateIndex = await RateIndex.findOneAndUpdate(
            { INDEX_RATE_ID: parseInt(INDEX_RATE_ID) },
            updateData,
            { new: true, runValidators: true, session }
          );

          if (rateIndex) {
            results.push(rateIndex);
          } else {
            errors.push({ INDEX_RATE_ID, error: 'Rate Index not found' });
          }
        } catch (error) {
          errors.push({ INDEX_RATE_ID: update.INDEX_RATE_ID, error: error.message });
        }
      }

      // AUDIT TRAIL for bulk update
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'BULK_UPDATE',
        action: 'BULK_UPDATE_RATE_INDICES',
        old_value: null,
        new_value: {
          totalUpdates: updates.length,
          successful: results.length,
          failed: errors.length,
          results: results.map(r => ({ 
            INDEX_RATE_ID: r.INDEX_RATE_ID, 
            INDEX_NM: r.INDEX_NM 
          }))
        },
        ip_address: getClientIp(req),
        entity_id: 'BULK_UPDATE',
        entity_type: 'RateIndex',
        status: 'SUCCESS',
        description: `Bulk updated ${results.length} rate indices`,
        timestamp: new Date()
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

      res.status(200).json({
        success: true,
        message: `Bulk update completed. Success: ${results.length}, Failed: ${errors.length}`,
        data: {
          results,
          errors
        }
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Error in bulk update:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to perform bulk update'
      });
    } finally {
      session.endSession();
    }
  })
};

export default RateIndexController;