import express from 'express';
import InterestCalculationService from '../Services/InterestCalculationService.js';
import LoanInterestRate from '../models/loanInterestRate.js';

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
    if (!effectiveRate && productId) {
      const productRate = await LoanInterestRate.findOne({ PROD_ID: productId })
        .populate('INDEX_RATE_ID');

      if (!productRate) {
        return res.status(404).json({
          success: false,
          message: 'Loan product not found'
        });
      }

      switch (rateType.toLowerCase()) {
        case 'fixed':
          effectiveRate = productRate.FIXED_RATE;
          break;
        case 'indexed':
          effectiveRate = (productRate.INDEX_RATE_ID?.INDEX_RATE || 0) +
                          (productRate.MARGIN_RATE || 0);
          break;
        default: // absolute
          effectiveRate = productRate.ABSOLUTE_RATE;
      }

      if (isNaN(effectiveRate)) {
        return res.status(400).json({
          success: false,
          message: `Could not determine ${rateType} rate for product`
        });
      }
    }

    if (isNaN(effectiveRate) || effectiveRate < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid interest rate - must be a non-negative number'
      });
    }

    const emiResult = await interestService.calculateEMI({
      principal: Number(principal),
      annualRate: Number(effectiveRate),
      termMonths: Number(termMonths),
      startDate: disbursementDate ? new Date(disbursementDate) : new Date(),
      precision: Number(precision)
    });

    return res.json({
      success: true,
      data: emiResult
    });

  } catch (error) {
    console.error('[EMI Calculation Error]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to calculate EMI',
      errorCode: 'EMI_CALCULATION_ERROR'
    });
  }
});

/**
 * @api {post} /api/loan-interest/calculate-emi Controller-based EMI
 */
router.post('/loan-interest/calculate-emi', calculateEMIEndpoint);

/**
 * @api CRUD for Loan Interest Rates
 */
router.post('/loan-interest/create', createInterestRate);
router.get('/loan-interest/create', getAllInterestRates);
router.get('/loan-interest/:PROD_ID', getInterestRate);
router.put('/loan-interest/:PROD_ID', updateInterestRate);
router.delete('/loan-interest/:PROD_ID', deleteInterestRate);

/**
 * @api Capitalization Status Routes
 */
router.put('/loan-interest/capitalization/:LOAN_PROUD_INT_ID', updateCapitalizationStatus);
router.get('/loan-interest/capitalization/:LOAN_PROUD_INT_ID', getCapitalizationStatus);


////////////////////////
// Rate Index Routes //
////////////////////////

/**
 * @api Get all Rate Indices
 */
router.get('/rate-index', getAllRateIndices);

/**
 * @api Create new Rate Index
 */
router.post('/rate-index', createRateIndex);

/**
 * @api Get Rate Index by ID
 */
router.get('/rate-index/:id', getRateIndexById);

/**
 * @api Update Rate Index by ID
 */
router.put('/rate-index/:id', updateRateIndex);

/**
 * @api Delete Rate Index by ID
 */
router.delete('/rate-index/:id', deleteRateIndex);

/**
 * @api Calculate interest using Rate Index
 */
router.post('/rate-index/:rateIndexId/calculate-interest', calculateInterest);


export default router;
