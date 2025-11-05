import express from 'express';
import InterestCalculationService from '../Services/InterestCalculationService.js';
import LoanInterestRate from '../models/LoanInterestRate.js';

import {
  createInterestRate,
  getAllInterestRates,
  getInterestRate,
  updateInterestRate,
  deleteInterestRate,
  calculateEMIEndpoint,
  updateCapitalizationStatus,
  getCapitalizationStatus
} from '../controllers/LoanInterestRateController.js';

import {
  getAllRateIndices,
  createRateIndex,
  getRateIndexById,
  updateRateIndex,
  deleteRateIndex,
  calculateInterest
} from '../controllers/Rate-IndexController.js';

const router = express.Router();
const interestService = new InterestCalculationService();

//////////////////////////
// Loan Interest Routes //
//////////////////////////

/**
 * @api {post} /api/loan-interest/emi Calculate EMI (Service-based)
 * @apiName CalculateEMI
 * @apiGroup LoanInterest
 * @apiParam {Number} principal Loan principal amount
 * @apiParam {Number} termMonths Loan term in months
 * @apiParam {Number} [annualRate] Annual interest rate (optional if productId provided)
 * @apiParam {Number} [productId] Product ID to lookup rates (optional if annualRate provided)
 * @apiParam {String} [rateType=absolute] Rate type: 'fixed', 'variable', 'absolute'
 * @apiParam {String} [disbursementDate] Loan disbursement date
 * @apiParam {Number} [precision=2] Decimal precision for calculations
 */
router.post('/loan-interest/emi', async (req, res) => {
  try {
    const { 
      principal, 
      termMonths, 
      productId, 
      annualRate, 
      rateType = 'absolute', 
      disbursementDate,
      precision = 2
    } = req.body;

    // Input validation
    const validationErrors = [];

    if (!principal || isNaN(principal) || principal <= 0) {
      validationErrors.push('Principal must be a positive number');
    }
    if (!termMonths || isNaN(termMonths) || termMonths <= 0) {
      validationErrors.push('Term must be a positive number of months');
    }
    if (!annualRate && !productId) {
      validationErrors.push('Either annualRate or productId must be provided');
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    let effectiveRate = annualRate;
    
    // If no direct rate provided, look up from product
    if (!effectiveRate && productId) {
      const productRate = await LoanInterestRate.findOne({ 
        PROD_ID: productId,
        STATUS: 'ACTIVE'
      }).populate('INDEX_RATE_ID');

      if (!productRate) {
        return res.status(404).json({
          success: false,
          message: 'Active loan product not found'
        });
      }

      // Determine effective rate based on rate type
      switch (rateType.toLowerCase()) {
        case 'fixed':
          effectiveRate = productRate.FIXED_RATE;
          break;
        case 'variable':
        case 'indexed':
          effectiveRate = (productRate.INDEX_RATE_ID?.INDEX_RATE || 0) +
                         (productRate.MARGIN_RATE || 0);
          break;
        default: // absolute
          effectiveRate = productRate.ABSOLUTE_RATE;
      }

      if (isNaN(effectiveRate) || effectiveRate < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid ${rateType} rate configuration for product`
        });
      }
    }

    // Final rate validation
    if (isNaN(effectiveRate) || effectiveRate < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid interest rate - must be a non-negative number'
      });
    }

    // Calculate EMI using service
    const emiResult = await interestService.calculateEMI({
      principal: Number(principal),
      annualRate: Number(effectiveRate),
      termMonths: Number(termMonths),
      startDate: disbursementDate ? new Date(disbursementDate) : new Date(),
      precision: Number(precision)
    });

    return res.json({
      success: true,
      data: emiResult,
      metadata: {
        rateTypeUsed: rateType,
        effectiveAnnualRate: effectiveRate,
        productId: productId || 'direct-rate'
      }
    });

  } catch (error) {
    console.error('[EMI Calculation Error]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to calculate EMI',
      errorCode: 'EMI_CALCULATION_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @api {post} /api/loan-interest/calculate-emi Controller-based EMI
 * @apiName CalculateEMIController
 * @apiGroup LoanInterest
 */
router.post('/loan-interest/calculate-emi', calculateEMIEndpoint);

/**
 * @api {post} /api/loan-interest/create Create Loan Interest Rate
 * @apiName CreateInterestRate
 * @apiGroup LoanInterest
 */
router.post('/loan-interest/create', createInterestRate);

/**
 * @api {get} /api/loan-interest/get-all Get All Interest Rates
 * @apiName GetAllInterestRates
 * @apiGroup LoanInterest
 */
router.get('/loan-interest/get-all', getAllInterestRates);

/**
 * @api {get} /api/loan-interest/:PROD_ID Get Interest Rate by Product ID
 * @apiName GetInterestRate
 * @apiGroup LoanInterest
 */
router.get('/loan-interest/:PROD_ID', getInterestRate);

/**
 * @api {put} /api/loan-interest/:PROD_ID Update Interest Rate
 * @apiName UpdateInterestRate
 * @apiGroup LoanInterest
 */
router.put('/loan-interest/:PROD_ID', updateInterestRate);

/**
 * @api {delete} /api/loan-interest/:PROD_ID Delete Interest Rate
 * @apiName DeleteInterestRate
 * @apiGroup LoanInterest
 */
router.delete('/loan-interest/:PROD_ID', deleteInterestRate);

/**
 * @api {put} /api/loan-interest/capitalization/:LOAN_PROUD_INT_ID Update Capitalization Status
 * @apiName UpdateCapitalizationStatus
 * @apiGroup LoanInterest
 */
router.put('/loan-interest/capitalization/:LOAN_PROUD_INT_ID', updateCapitalizationStatus);

/**
 * @api {get} /api/loan-interest/capitalization/:LOAN_PROUD_INT_ID Get Capitalization Status
 * @apiName GetCapitalizationStatus
 * @apiGroup LoanInterest
 */
router.get('/loan-interest/capitalization/:LOAN_PROUD_INT_ID', getCapitalizationStatus);

////////////////////////
// Rate Index Routes //
////////////////////////

/**
 * @api {get} /api/rate-index Get All Rate Indices
 * @apiName GetAllRateIndices
 * @apiGroup RateIndex
 */
router.get('/rate-index', getAllRateIndices);

/**
 * @api {post} /api/rate-index Create Rate Index
 * @apiName CreateRateIndex
 * @apiGroup RateIndex
 */
router.post('/rate-index', createRateIndex);

/**
 * @api {get} /api/rate-index/:id Get Rate Index by ID
 * @apiName GetRateIndexById
 * @apiGroup RateIndex
 */
router.get('/rate-index/:id', getRateIndexById);

/**
 * @api {put} /api/rate-index/:id Update Rate Index
 * @apiName UpdateRateIndex
 * @apiGroup RateIndex
 */
router.put('/rate-index/:id', updateRateIndex);

/**
 * @api {delete} /api/rate-index/:id Delete Rate Index
 * @apiName DeleteRateIndex
 * @apiGroup RateIndex
 */
router.delete('/rate-index/:id', deleteRateIndex);

/**
 * @api {post} /api/rate-index/:rateIndexId/calculate-interest Calculate Interest using Rate Index
 * @apiName CalculateInterestWithIndex
 * @apiGroup RateIndex
 */
router.post('/rate-index/:rateIndexId/calculate-interest', calculateInterest);

////////////////////////////
// Additional Utility Routes //
////////////////////////////

/**
 * @api {get} /api/interest/health Health Check
 * @apiName InterestHealthCheck
 * @apiGroup Utility
 */
router.get('/interest/health', (req, res) => {
  res.json({
    success: true,
    message: 'Interest Calculation Service is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

/**
 * @api {get} /api/interest/products/active Get Active Loan Products
 * @apiName GetActiveLoanProducts
 * @apiGroup LoanInterest
 */
router.get('/interest/products/active', async (req, res) => {
  try {
    const activeProducts = await LoanInterestRate.find({ 
      STATUS: 'ACTIVE' 
    }).select('PROD_ID LOAN_PROUD_INT_ID RATE_TY ABSOLUTE_RATE FIXED_RATE MARGIN_RATE');

    res.json({
      success: true,
      data: activeProducts,
      count: activeProducts.length
    });
  } catch (error) {
    console.error('[Active Products Error]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active loan products'
    });
  }
});

/**
 * @api {post} /api/interest/calculate-daily-accrual Calculate Daily Interest Accrual
 * @apiName CalculateDailyAccrual
 * @apiGroup LoanInterest
 * @apiParam {Number} principal Loan principal
 * @apiParam {Number} annualRate Annual interest rate
 * @apiParam {Number} days Number of days
 * @apiParam {String} [accrualBasis=ACTUAL/360] Accrual basis
 */
router.post('/interest/calculate-daily-accrual', async (req, res) => {
  try {
    const { principal, annualRate, days, accrualBasis = 'ACTUAL/360' } = req.body;

    // Input validation
    if (!principal || !annualRate || !days) {
      return res.status(400).json({
        success: false,
        message: 'Principal, annualRate, and days are required'
      });
    }

    const dailyInterest = LoanInterestRate.calculateDailyInterest(
      Number(principal),
      Number(annualRate),
      Number(days),
      accrualBasis
    );

    res.json({
      success: true,
      data: {
        principal,
        annualRate: `${annualRate}%`,
        days,
        accrualBasis,
        dailyInterest: dailyInterest.toFixed(4),
        totalAccrued: (dailyInterest * days).toFixed(4)
      }
    });

  } catch (error) {
    console.error('[Daily Accrual Error]', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Global error handling for this router
router.use((error, req, res, next) => {
  console.error('[Interest Routes Error]', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error in interest routes',
    errorCode: 'INTEREST_ROUTES_ERROR'
  });
});

// 404 handler for interest routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Interest route not found: ${req.originalUrl}`,
    availableRoutes: [
      'POST /api/loan-interest/emi',
      'POST /api/loan-interest/calculate-emi',
      'GET /api/loan-interest/get-all',
      'GET /api/loan-interest/:PROD_ID',
      'POST /api/loan-interest/create',
      'PUT /api/loan-interest/:PROD_ID',
      'DELETE /api/loan-interest/:PROD_ID',
      'GET /api/rate-index',
      'POST /api/rate-index',
      'GET /api/rate-index/:id',
      'PUT /api/rate-index/:id',
      'DELETE /api/rate-index/:id',
      'POST /api/rate-index/:rateIndexId/calculate-interest'
    ]
  });
});

export default router;