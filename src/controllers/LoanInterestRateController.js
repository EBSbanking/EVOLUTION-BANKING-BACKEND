// src/controllers/LoanInterestController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import LoanInterestRate from '../models/LoanInterestRate.js';
import RateIndex from '../models/Rate-Index.js';
import AuditTrail from '../models/AuditTrail.js';

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

const LoanInterestController = {
  // CREATE LOAN INTEREST RATE
  createInterestRate: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const {
        PROD_ID,
        INDEX_RATE_ID,
        LOAN_PROUD_INT_ID,
        RATE_TY,
        INT_TY,
        ACCRUAL_BASIS_TY,
        ACCRUAL_FREQ_CD,
        ACCRUAL_FREQ_VALUE,
        FIXED_RATE,
        ABSOLUTE_RATE,
        DR_CR_IND,
        MATURITY_INT_INDEX_ID,
        EFFECTIVE_DT,
        CREATED_BY,
        USER_ID,
        MIN_LOAN_TERM_MONTHS,
        MAX_LOAN_TERM_MONTHS,
        STATUS,
        DAILY_ACCRUAL_CONFIG,
        RATE_CHANGE_ALLOWED,
        TIME
      } = req.body;

      // Validate required fields
      const requiredFields = {
        PROD_ID, INDEX_RATE_ID, LOAN_PROUD_INT_ID, RATE_TY, INT_TY,
        ACCRUAL_BASIS_TY, ACCRUAL_FREQ_CD, ACCRUAL_FREQ_VALUE,
        ABSOLUTE_RATE, DR_CR_IND, EFFECTIVE_DT, CREATED_BY, USER_ID,
        MIN_LOAN_TERM_MONTHS, MAX_LOAN_TERM_MONTHS, STATUS
      };

      const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => !value)
        .map(([field]) => field);

      if (missingFields.length > 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          missingFields
        });
      }

      // Check for duplicate LOAN_PROUD_INT_ID
      const existingRate = await LoanInterestRate.findOne({
        LOAN_PROUD_INT_ID
      }).session(session);

      if (existingRate) {
        await session.abortTransaction();
        return res.status(409).json({
          success: false,
          message: 'Interest rate with this LOAN_PROUD_INT_ID already exists'
        });
      }

      // Prepare the data with proper defaults
      const interestRateData = {
        PROD_ID: parseInt(PROD_ID),
        INDEX_RATE_ID: parseInt(INDEX_RATE_ID),
        LOAN_PROUD_INT_ID,
        RATE_TY,
        INT_TY,
        ACCRUAL_BASIS_TY,
        ACCRUAL_FREQ_CD,
        ACCRUAL_FREQ_VALUE: parseInt(ACCRUAL_FREQ_VALUE),
        FIXED_RATE: FIXED_RATE ? parseFloat(FIXED_RATE) : undefined,
        ABSOLUTE_RATE: parseFloat(ABSOLUTE_RATE),
        DR_CR_IND,
        MATURITY_INT_INDEX_ID: MATURITY_INT_INDEX_ID ? parseInt(MATURITY_INT_INDEX_ID) : undefined,
        EFFECTIVE_DT: new Date(EFFECTIVE_DT),
        CREATED_BY,
        USER_ID,
        MIN_LOAN_TERM_MONTHS: parseInt(MIN_LOAN_TERM_MONTHS), // FIXED: uppercase 'S'
        MAX_LOAN_TERM_MONTHS: parseInt(MAX_LOAN_TERM_MONTHS),
        STATUS,
        DAILY_ACCRUAL_CONFIG: {
          GL_ACCOUNT: DAILY_ACCRUAL_CONFIG?.GL_ACCOUNT || '400100',
          POSTING_FREQUENCY: DAILY_ACCRUAL_CONFIG?.POSTING_FREQUENCY || 'EOD'
        },
        RATE_CHANGE_ALLOWED: RATE_CHANGE_ALLOWED === true || RATE_CHANGE_ALLOWED === 'true',
        TIME: TIME ? parseInt(TIME) : 12
      };

      // Create new interest rate
      const newInterestRate = new LoanInterestRate(interestRateData);
      await newInterestRate.save({ session });

      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: CREATED_BY || 'SYSTEM',
        event_type: 'CREATE',
        action: 'CREATE_LOAN_INTEREST_RATE',
        old_value: null,
        new_value: {
          PROD_ID: newInterestRate.PROD_ID,
          LOAN_PROUD_INT_ID: newInterestRate.LOAN_PROUD_INT_ID,
          INDEX_RATE_ID: newInterestRate.INDEX_RATE_ID,
          RATE_TY: newInterestRate.RATE_TY,
          INT_TY: newInterestRate.INT_TY,
          ABSOLUTE_RATE: newInterestRate.ABSOLUTE_RATE,
          EFFECTIVE_DT: newInterestRate.EFFECTIVE_DT
        },
        ip_address: getClientIp(req),
        entity_id: newInterestRate._id.toString(),
        entity_type: 'LoanInterestRate',
        status: 'SUCCESS',
        description: `Created loan interest rate: ${newInterestRate.LOAN_PROUD_INT_ID}`,
        timestamp: new Date()
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

      res.status(201).json({
        success: true,
        message: 'Interest rate created successfully',
        data: newInterestRate
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Error creating Interest Rate:', error);
      
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: Object.values(error.errors).map(err => ({
            field: err.path,
            message: err.message
          }))
        });
      }
      
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Duplicate interest rate ID'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create Interest Rate',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }),

  // GET ALL INTEREST RATES
  getAllInterestRates: asyncHandler(async (req, res) => {
    try {
      const { page = 1, limit = 10, search, status, rateType } = req.query;
      
      const query = {};
      
      // Search filter
      if (search) {
        query.$or = [
          { LOAN_PROUD_INT_ID: { $regex: search, $options: 'i' } },
          { RATE_TY: { $regex: search, $options: 'i' } }
        ];
      }
      
      // Status filter
      if (status) {
        query.STATUS = status;
      }
      
      // Rate type filter
      if (rateType) {
        query.RATE_TY = rateType;
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { EFFECTIVE_DT: -1 },
        lean: true
      };

      const interestRates = await LoanInterestRate.paginate(query, options);
      
      if (!interestRates.docs || interestRates.docs.length === 0) {
        return res.status(404).json({ 
          success: false,
          message: 'No Interest Rates found' 
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Interest Rates retrieved successfully!',
        data: interestRates.docs,
        pagination: {
          page: options.page,
          limit: options.limit,
          total: interestRates.total,
          pages: interestRates.pages
        }
      });
    } catch (error) {
      console.error('Error fetching interest rates:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Interest Rates',
        error: error.message,
      });
    }
  }),

  // GET INTEREST RATE BY PROD_ID
  getInterestRate: asyncHandler(async (req, res) => {
    const { PROD_ID } = req.params;

    try {
      const interestRate = await LoanInterestRate.findOne({ PROD_ID });

      if (!interestRate) {
        return res.status(404).json({
          success: false,
          message: 'Interest Rate not found for the given PROD_ID'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Interest Rate retrieved successfully!',
        data: interestRate,
      });
    } catch (error) {
      console.error('Error fetching interest rate:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Interest Rate',
        error: error.message,
      });
    }
  }),

  // GET INTEREST RATE BY LOAN_PROUD_INT_ID
  getInterestRateByLoanProductId: asyncHandler(async (req, res) => {
    const { LOAN_PROUD_INT_ID } = req.params;

    try {
      const interestRate = await LoanInterestRate.findOne({ LOAN_PROUD_INT_ID });

      if (!interestRate) {
        return res.status(404).json({
          success: false,
          message: 'Interest Rate not found for the given LOAN_PROUD_INT_ID'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Interest Rate retrieved successfully!',
        data: interestRate,
      });
    } catch (error) {
      console.error('Error fetching interest rate:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Interest Rate',
        error: error.message,
      });
    }
  }),

  // UPDATE INTEREST RATE
  updateInterestRate: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { PROD_ID } = req.params;
      const updateData = req.body;

      const interestRate = await LoanInterestRate.findOne({ PROD_ID }).session(session);

      if (!interestRate) {
        return res.status(404).json({
          success: false,
          message: 'Interest Rate not found for the given PROD_ID'
        });
      }

      // Store old values for audit
      const oldValues = {
        INDEX_RATE_ID: interestRate.INDEX_RATE_ID,
        ABSOLUTE_RATE: interestRate.ABSOLUTE_RATE,
        RATE_CHANGE_ALLOWED: interestRate.RATE_CHANGE_ALLOWED,
        EFFECTIVE_DT: interestRate.EFFECTIVE_DT,
        STATUS: interestRate.STATUS
      };

      // Update ABSOLUTE_RATE and FIXED_RATE if INDEX_RATE_ID changes
      if (updateData.INDEX_RATE_ID) {
        const rateIndex = await RateIndex.findOne({ 
          INDEX_RATE_ID: parseInt(updateData.INDEX_RATE_ID) 
        }).session(session);
        
        if (!rateIndex || !rateIndex.INDEX_RATE) {
          throw new Error(`Rate index with ID ${updateData.INDEX_RATE_ID} not found`);
        }
        
        updateData.ABSOLUTE_RATE = parseFloat(rateIndex.INDEX_RATE);
        updateData.FIXED_RATE = parseFloat(rateIndex.INDEX_RATE);
      }

      // Update the interest rate
      Object.assign(interestRate, updateData);
      await interestRate.save({ session });

      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'UPDATE',
        action: 'UPDATE_LOAN_INTEREST_RATE',
        old_value: oldValues,
        new_value: {
          INDEX_RATE_ID: interestRate.INDEX_RATE_ID,
          ABSOLUTE_RATE: interestRate.ABSOLUTE_RATE,
          RATE_CHANGE_ALLOWED: interestRate.RATE_CHANGE_ALLOWED,
          EFFECTIVE_DT: interestRate.EFFECTIVE_DT,
          STATUS: interestRate.STATUS
        },
        ip_address: getClientIp(req),
        entity_id: interestRate._id.toString(),
        entity_type: 'LoanInterestRate',
        status: 'SUCCESS',
        description: `Updated loan interest rate: PROD_ID ${PROD_ID}`,
        timestamp: new Date()
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

      res.status(200).json({
        success: true,
        message: 'Interest Rate updated successfully!',
        data: interestRate,
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Error updating interest rate:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update Interest Rate',
      });
    } finally {
      session.endSession();
    }
  }),

  // DELETE INTEREST RATE
  deleteInterestRate: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { PROD_ID } = req.params;

      const interestRate = await LoanInterestRate.findOneAndDelete({ 
        PROD_ID 
      }).session(session);

      if (!interestRate) {
        return res.status(404).json({
          success: false,
          message: 'Interest Rate not found for the given PROD_ID'
        });
      }

      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'DELETE',
        action: 'DELETE_LOAN_INTEREST_RATE',
        old_value: {
          PROD_ID: interestRate.PROD_ID,
          LOAN_PROUD_INT_ID: interestRate.LOAN_PROUD_INT_ID,
          INDEX_RATE_ID: interestRate.INDEX_RATE_ID,
          STATUS: interestRate.STATUS
        },
        new_value: null,
        ip_address: getClientIp(req),
        entity_id: interestRate._id.toString(),
        entity_type: 'LoanInterestRate',
        status: 'SUCCESS',
        description: `Deleted loan interest rate: ${interestRate.LOAN_PROUD_INT_ID}`,
        timestamp: new Date()
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

      res.status(200).json({
        success: true,
        message: 'Interest Rate deleted successfully',
        data: interestRate
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Error deleting interest rate:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete Interest Rate',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }),

  // UPDATE CAPITALIZATION STATUS
  updateCapitalizationStatus: asyncHandler(async (req, res) => {
    const { LOAN_PROUD_INT_ID } = req.params;
    const { status, updatedBy, notes } = req.body;

    // Normalize status input
    let normalizedStatus = status ? status.toString().trim().toUpperCase() : '';
    
    // Map common variations to valid statuses
    const statusMapping = {
      'CAPITALIZED': 'CAPITALIZED',
      'CAPITALIZE': 'CAPITALIZED',
      'CAPITALISED': 'CAPITALIZED',
      'CAPITALISE': 'CAPITALIZED',
      'REJECTED': 'REJECTED',
      'REJECT': 'REJECTED',
      'DECLINED': 'REJECTED',
      'DENIED': 'REJECTED'
    };

    const finalStatus = statusMapping[normalizedStatus] || normalizedStatus;
    const validStatuses = ['CAPITALIZED', 'REJECTED'];

    if (!validStatuses.includes(finalStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status: "${status}". Must be either CAPITALIZED or REJECTED.`
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const interestRate = await LoanInterestRate.findOne({ LOAN_PROUD_INT_ID }).session(session);

      if (!interestRate) {
        return res.status(404).json({
          success: false,
          message: 'Interest Rate record not found'
        });
      }

      const oldStatus = interestRate.CAPITALIZE_ACCT_ST;
      interestRate.CAPITALIZE_ACCT_ST = finalStatus;
      if (updatedBy) interestRate.LAST_MODIFIED_BY = updatedBy;

      await interestRate.save({ session });

      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: updatedBy || 'SYSTEM',
        event_type: 'UPDATE',
        action: 'UPDATE_CAPITALIZATION_STATUS',
        old_value: { status: oldStatus },
        new_value: { status: finalStatus },
        ip_address: getClientIp(req),
        entity_id: interestRate._id.toString(),
        entity_type: 'LoanInterestRate',
        status: 'SUCCESS',
        description: `Updated capitalization status to ${finalStatus} for ${LOAN_PROUD_INT_ID}`,
        notes: notes || '',
        timestamp: new Date()
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

      return res.status(200).json({
        success: true,
        message: `Capitalization status updated to ${finalStatus}`,
        data: {
          LOAN_PROUD_INT_ID: interestRate.LOAN_PROUD_INT_ID,
          PROD_ID: interestRate.PROD_ID,
          status: interestRate.CAPITALIZE_ACCT_ST,
          lastModifiedBy: interestRate.LAST_MODIFIED_BY,
          updatedAt: interestRate.updatedAt
        }
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Error updating capitalization status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update capitalization status',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }),

  // GET CAPITALIZATION STATUS
  getCapitalizationStatus: asyncHandler(async (req, res) => {
    const { LOAN_PROUD_INT_ID } = req.params;

    try {
      const interestRate = await LoanInterestRate.findOne({ LOAN_PROUD_INT_ID });

      if (!interestRate) {
        return res.status(404).json({
          success: false,
          message: 'Interest Rate record not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Capitalization status retrieved successfully',
        data: {
          LOAN_PROUD_INT_ID: interestRate.LOAN_PROUD_INT_ID,
          PROD_ID: interestRate.PROD_ID,
          status: interestRate.CAPITALIZE_ACCT_ST || 'NOT_SET',
          lastModifiedBy: interestRate.LAST_MODIFIED_BY,
          updatedAt: interestRate.updatedAt
        }
      });
    } catch (error) {
      console.error('Error retrieving capitalization status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve capitalization status',
        error: error.message
      });
    }
  }),

  // SEARCH INTEREST RATES
  searchInterestRates: asyncHandler(async (req, res) => {
    try {
      const { 
        search,
        productId,
        status,
        rateType,
        startDate,
        endDate,
        page = 1,
        limit = 20
      } = req.query;

      const query = {};

      // Search by multiple criteria
      if (search) {
        query.$or = [
          { LOAN_PROUD_INT_ID: { $regex: search, $options: 'i' } },
          { PROD_ID: { $regex: search, $options: 'i' } },
          { RATE_TY: { $regex: search, $options: 'i' } },
          { INT_TY: { $regex: search, $options: 'i' } }
        ];
      }

      // Filter by product ID
      if (productId) {
        query.PROD_ID = productId;
      }

      // Filter by status
      if (status) {
        query.STATUS = status;
      }

      // Filter by rate type
      if (rateType) {
        query.RATE_TY = rateType;
      }

      // Filter by date range
      if (startDate || endDate) {
        query.EFFECTIVE_DT = {};
        if (startDate) {
          query.EFFECTIVE_DT.$gte = new Date(startDate);
        }
        if (endDate) {
          query.EFFECTIVE_DT.$lte = new Date(endDate);
        }
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { EFFECTIVE_DT: -1 },
        lean: true
      };

      const results = await LoanInterestRate.paginate(query, options);

      res.status(200).json({
        success: true,
        message: 'Search results retrieved successfully',
        data: results.docs,
        pagination: {
          page: results.page,
          limit: results.limit,
          total: results.total,
          pages: results.pages
        }
      });

    } catch (error) {
      console.error('Error searching interest rates:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search interest rates',
        error: error.message
      });
    }
  }),

  // CALCULATE EMI
  calculateEMI: asyncHandler(async (req, res) => {
    try {
      const { principal, annualInterestRate, loanTermMonths, interestType } = req.body;

      if (!principal || !annualInterestRate || !loanTermMonths) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: principal, annualInterestRate, loanTermMonths'
        });
      }

      const monthlyRate = annualInterestRate / 100 / 12;
      const emi = principal * monthlyRate * 
                  Math.pow(1 + monthlyRate, loanTermMonths) / 
                  (Math.pow(1 + monthlyRate, loanTermMonths) - 1);

      res.status(200).json({
        success: true,
        message: 'EMI calculated successfully',
        data: {
          principal,
          annualInterestRate: `${annualInterestRate}%`,
          loanTermMonths,
          emi: emi.toFixed(2),
          totalPayment: (emi * loanTermMonths).toFixed(2),
          totalInterest: ((emi * loanTermMonths) - principal).toFixed(2)
        }
      });
    } catch (error) {
      console.error('Error calculating EMI:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate EMI',
        error: error.message
      });
    }
  }),

  // CALCULATE DAILY INTEREST
  calculateDailyInterest: asyncHandler(async (req, res) => {
    try {
      const { principal, annualInterestRate, days, accrualBasis = 'ACTUAL_365' } = req.body;

      if (!principal || !annualInterestRate || !days) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: principal, annualInterestRate, days'
        });
      }

      let dailyRate;
      switch (accrualBasis) {
        case 'ACTUAL_365':
          dailyRate = annualInterestRate / 100 / 365;
          break;
        case 'ACTUAL_360':
          dailyRate = annualInterestRate / 100 / 360;
          break;
        case '30_360':
          dailyRate = annualInterestRate / 100 / 360;
          break;
        default:
          dailyRate = annualInterestRate / 100 / 365;
      }

      const dailyInterest = principal * dailyRate * days;

      res.status(200).json({
        success: true,
        message: 'Daily interest calculated successfully',
        data: {
          principal,
          annualInterestRate: `${annualInterestRate}%`,
          days,
          accrualBasis,
          dailyInterest: dailyInterest.toFixed(2),
          dailyRate: dailyRate.toFixed(6)
        }
      });
    } catch (error) {
      console.error('Error calculating daily interest:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate daily interest',
        error: error.message
      });
    }
  })
};

// CHOOSE ONLY ONE EXPORT METHOD:

// OPTION 1: Default export (use if you import like: import LoanInterestController from './LoanInterestController.js')
export default LoanInterestController;

// OR

// OPTION 2: Named exports (use if you import like: import { calculateEMI, createInterestRate } from './LoanInterestController.js')
export const {
  // createInterestRate,
  // getAllInterestRates,
  // getInterestRate,
  // getInterestRateByLoanProductId,
  // updateInterestRate,
  // deleteInterestRate,
  // updateCapitalizationStatus,
  // getCapitalizationStatus,
  // searchInterestRates,
     calculateEMI,
     calculateDailyInterest
 } = LoanInterestController;