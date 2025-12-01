import express from 'express';
import mongoose from 'mongoose';
import LoanInterestRate from '../models/LoanInterestRate.js'; // ✅ FIXED IMPORT
import RateIndex from '../models/Rate-Index.js';
import LoanProduct from '../models/LoanProduct.js';

// Utility function for EMI calculation - reducing balance method
export const calculateEMI = ({
  principal,
  annualRate,
  termMonths,
  startDate
}) => {
  const method = 'reducing';
  const monthlyRate = annualRate / 100 / 12;
  const currentDate = startDate ? new Date(startDate) : new Date();
  let installments = [], totalInterest = 0;

  const reducingEMI = principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);
  
  let balance = principal;

  for (let i = 1; i <= termMonths; i++) {
    const interest = balance * monthlyRate;
    const principalPayment = reducingEMI - interest;
    totalInterest += interest;
    balance -= principalPayment;

    const dueDate = new Date(currentDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    installments.push({
      installmentNo: i,
      dueDate,
      principal: principalPayment,
      interest,
      totalPayment: reducingEMI,
      remainingBalance: balance > 0 ? balance : 0,
      isFinalInstallment: i === termMonths
    });
  }

  return {
    monthlyPayment: reducingEMI,
    totalInterest,
    totalRepayment: reducingEMI * termMonths,
    installments,
    method: 'reducing'
  };
};

// Utility function for Flat Rate calculation
export const calculateFlatRate = ({
  principal,
  annualRate,
  termMonths,
  startDate
}) => {
  const monthlyRate = annualRate / 100 / 12;
  const totalInterest = principal * monthlyRate * termMonths;
  const totalRepayment = principal + totalInterest;
  const monthlyPayment = totalRepayment / termMonths;
  
  const currentDate = startDate ? new Date(startDate) : new Date();
  let installments = [];
  let balance = principal;

  for (let i = 1; i <= termMonths; i++) {
    const interest = principal * monthlyRate; // Same interest every month
    const principalPayment = monthlyPayment - interest;
    balance -= principalPayment;

    const dueDate = new Date(currentDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    installments.push({
      installmentNo: i,
      dueDate,
      principal: principalPayment,
      interest,
      totalPayment: monthlyPayment,
      remainingBalance: balance > 0 ? balance : 0,
      isFinalInstallment: i === termMonths
    });
  }

  return {
    monthlyPayment,
    totalInterest,
    totalRepayment,
    installments,
    method: 'flat'
  };
};

// Combined loan repayment calculation with method choice
export const calculateLoanRepayment = ({
  principal,
  annualRate,
  termMonths,
  startDate,
  method = 'reducing' // 'reducing' or 'flat'
}) => {
  if (method === 'flat') {
    return calculateFlatRate({
      principal,
      annualRate,
      termMonths,
      startDate
    });
  } else {
    return calculateEMI({
      principal,
      annualRate,
      termMonths,
      startDate
    });
  }
};

// Enhanced endpoint for EMI calculation with LoanProduct integration
export const calculateEMIEndpoint = async (req, res) => {
  try {
    const {
      principal,
      time,
      PROD_ID,
      INDEX_RATE_ID,
      rateType,
      ABSOLUTE_RATE,
      FIXED_RATE,
      disbursementDate
    } = req.body;

    if (principal == null || time == null) {
      return res.status(400).json({ message: 'Principal and time are required.' });
    }

    if (principal <= 0 || time <= 0 || isNaN(principal) || isNaN(time)) {
      return res.status(400).json({ message: 'Principal and time must be positive numbers.' });
    }

    let loanProduct;
    let loanProductDetails;
    
    if (PROD_ID) {
      // Try to find in LoanProduct first
      loanProductDetails = await LoanProduct.findOne({ PROD_ID });
      
      if (!loanProductDetails) {
        // Fallback to LoanInterestRate if not found in LoanProduct
        loanProduct = await LoanInterestRate.findOne({ PROD_ID }); // ✅ FIXED
        if (!loanProduct) {
          return res.status(404).json({ message: 'Loan product not found' });
        }
      } else {
        // Use LoanProduct details
        loanProduct = loanProductDetails;
      }
      
      // Validate loan term against product constraints
      const minTerm = loanProduct.MIN_LOAN_TERM_MONTHS || loanProduct.minTermMonths || 1;
      const maxTerm = loanProduct.MAX_LOAN_TERM_MONTHS || loanProduct.maxTermMonths || 60;
      
      if (time < minTerm || time > maxTerm) {
        return res.status(400).json({ 
          message: `Loan term must be between ${minTerm} and ${maxTerm} months` 
        });
      }
    }

    let annualRate;
    if (INDEX_RATE_ID) {
      const rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: parseInt(INDEX_RATE_ID) });
      if (!rateIndex || !rateIndex.INDEX_RATE) {
        return res.status(400).json({
          message: `Rate index with ID ${INDEX_RATE_ID} not found or missing INDEX_RATE`
        });
      }
      annualRate = parseFloat(rateIndex.INDEX_RATE);
      console.log(`Using RateIndex.INDEX_RATE: ${annualRate}% for INDEX_RATE_ID: ${INDEX_RATE_ID}`);
    } else if (loanProduct) {
      // Get rate from loan product (check both LoanInterestRate and LoanProduct fields)
      annualRate = parseFloat(
        loanProduct.ABSOLUTE_RATE || 
        loanProduct.FIXED_RATE || 
        loanProduct.interestRate || 
        loanProduct.annualInterestRate
      );
      console.log(`Using loan product rate: ${annualRate}%`);
    } else if (rateType === 'absolute' && ABSOLUTE_RATE != null) {
      annualRate = parseFloat(ABSOLUTE_RATE);
    } else if (rateType === 'fixed' && FIXED_RATE != null) {
      annualRate = parseFloat(FIXED_RATE);
    }

    if (annualRate == null || isNaN(annualRate) || annualRate <= 0) {
      return res.status(400).json({ message: 'Could not determine valid interest rate.' });
    }

    const emiResult = calculateEMI({
      principal,
      annualRate,
      termMonths: time,
      startDate: disbursementDate
    });

    res.status(200).json({
      message: 'EMI calculated successfully using REDUCING method',
      data: {
        principal,
        termMonths: time,
        annualInterestRate: annualRate,
        monthlyInterestRate: annualRate / 12,
        method: 'reducing',
        monthlyPayment: emiResult.monthlyPayment,
        totalInterest: emiResult.totalInterest,
        totalRepayment: emiResult.totalRepayment,
        installments: emiResult.installments,
        productDetails: loanProductDetails ? {
          PROD_ID: loanProductDetails.PROD_ID,
          productName: loanProductDetails.productName,
          productType: loanProductDetails.productType,
          minAmount: loanProductDetails.minLoanAmount,
          maxAmount: loanProductDetails.maxLoanAmount
        } : null
      }
    });
  } catch (error) {
    console.error('Error calculating EMI:', error);
    res.status(500).json({
      message: 'Failed to calculate EMI',
      error: error.message
    });
  }
};

// Enhanced endpoint with method selection and LoanProduct integration
export const calculateLoanRepaymentEndpoint = async (req, res) => {
  try {
    const {
      principal,
      time,
      PROD_ID,
      INDEX_RATE_ID,
      rateType,
      ABSOLUTE_RATE,
      FIXED_RATE,
      disbursementDate,
      method = 'reducing' // 'reducing' or 'flat'
    } = req.body;

    if (principal == null || time == null) {
      return res.status(400).json({ message: 'Principal and time are required.' });
    }

    if (principal <= 0 || time <= 0 || isNaN(principal) || isNaN(time)) {
      return res.status(400).json({ message: 'Principal and time must be positive numbers.' });
    }

    // Validate method
    if (!['reducing', 'flat'].includes(method)) {
      return res.status(400).json({ message: 'Method must be either "reducing" or "flat".' });
    }

    let loanProduct;
    let loanProductDetails;
    
    if (PROD_ID) {
      // Try to find in LoanProduct first
      loanProductDetails = await LoanProduct.findOne({ PROD_ID });
      
      if (!loanProductDetails) {
        // Fallback to LoanInterestRate if not found in LoanProduct
        loanProduct = await LoanInterestRate.findOne({ PROD_ID }); // ✅ FIXED
        if (!loanProduct) {
          return res.status(404).json({ message: 'Loan product not found' });
        }
      } else {
        // Use LoanProduct details
        loanProduct = loanProductDetails;
      }
      
      // Validate loan amount against product constraints
      const minAmount = loanProduct.MIN_LOAN_AMOUNT || loanProduct.minLoanAmount || 0;
      const maxAmount = loanProduct.MAX_LOAN_AMOUNT || loanProduct.maxLoanAmount || Number.MAX_SAFE_INTEGER;
      
      if (principal < minAmount || principal > maxAmount) {
        return res.status(400).json({ 
          message: `Loan amount must be between ${minAmount} and ${maxAmount}` 
        });
      }
      
      // Validate loan term against product constraints
      const minTerm = loanProduct.MIN_LOAN_TERM_MONTHS || loanProduct.minTermMonths || 1;
      const maxTerm = loanProduct.MAX_LOAN_TERM_MONTHS || loanProduct.maxTermMonths || 60;
      
      if (time < minTerm || time > maxTerm) {
        return res.status(400).json({ 
          message: `Loan term must be between ${minTerm} and ${maxTerm} months` 
        });
      }
    }

    let annualRate;
    if (INDEX_RATE_ID) {
      const rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: parseInt(INDEX_RATE_ID) });
      if (!rateIndex || !rateIndex.INDEX_RATE) {
        return res.status(400).json({
          message: `Rate index with ID ${INDEX_RATE_ID} not found or missing INDEX_RATE`
        });
      }
      annualRate = parseFloat(rateIndex.INDEX_RATE);
      console.log(`Using RateIndex.INDEX_RATE: ${annualRate}% for INDEX_RATE_ID: ${INDEX_RATE_ID}`);
    } else if (loanProduct) {
      // Get rate from loan product (check both LoanInterestRate and LoanProduct fields)
      annualRate = parseFloat(
        loanProduct.ABSOLUTE_RATE || 
        loanProduct.FIXED_RATE || 
        loanProduct.interestRate || 
        loanProduct.annualInterestRate
      );
      console.log(`Using loan product rate: ${annualRate}%`);
    } else if (rateType === 'absolute' && ABSOLUTE_RATE != null) {
      annualRate = parseFloat(ABSOLUTE_RATE);
    } else if (rateType === 'fixed' && FIXED_RATE != null) {
      annualRate = parseFloat(FIXED_RATE);
    }

    if (annualRate == null || isNaN(annualRate) || annualRate <= 0) {
      return res.status(400).json({ message: 'Could not determine valid interest rate.' });
    }

    const repaymentResult = calculateLoanRepayment({
      principal,
      annualRate,
      termMonths: time,
      startDate: disbursementDate,
      method
    });

    const methodName = method === 'reducing' ? 'EMI (Reducing Balance)' : 'Flat Rate';
    
    res.status(200).json({
      message: `Loan repayment calculated successfully using ${methodName} method`,
      data: {
        principal,
        termMonths: time,
        annualInterestRate: annualRate,
        monthlyInterestRate: annualRate / 12,
        method,
        monthlyPayment: repaymentResult.monthlyPayment,
        totalInterest: repaymentResult.totalInterest,
        totalRepayment: repaymentResult.totalRepayment,
        installments: repaymentResult.installments,
        productDetails: loanProductDetails ? {
          PROD_ID: loanProductDetails.PROD_ID,
          productName: loanProductDetails.productName,
          productType: loanProductDetails.productType,
          minAmount: loanProductDetails.minLoanAmount,
          maxAmount: loanProductDetails.maxLoanAmount,
          minTerm: loanProductDetails.minTermMonths,
          maxTerm: loanProductDetails.maxTermMonths
        } : null
      }
    });
  } catch (error) {
    console.error('Error calculating loan repayment:', error);
    res.status(500).json({
      message: 'Failed to calculate loan repayment',
      error: error.message
    });
  }
};

// New endpoint to get all available loan products
export const getLoanProducts = async (req, res) => {
  try {
    const loanProducts = await LoanProduct.find({ status: 'active' });
    
    if (!loanProducts || loanProducts.length === 0) {
      return res.status(404).json({ message: 'No active loan products found' });
    }
    
    const formattedProducts = loanProducts.map(product => ({
      PROD_ID: product.PROD_ID,
      productName: product.productName,
      productType: product.productType,
      description: product.description,
      minLoanAmount: product.minLoanAmount,
      maxLoanAmount: product.maxLoanAmount,
      minTermMonths: product.minTermMonths,
      maxTermMonths: product.maxTermMonths,
      interestRate: product.interestRate,
      calculationMethod: product.calculationMethod || 'reducing', // 'reducing' or 'flat'
      status: product.status
    }));
    
    res.status(200).json({
      message: 'Loan products retrieved successfully!',
      data: formattedProducts,
    });
  } catch (error) {
    console.error('Error fetching loan products:', error);
    res.status(500).json({
      message: 'Failed to fetch loan products',
      error: error.message,
    });
  }
};

// New endpoint to get specific loan product details
export const getLoanProduct = async (req, res) => {
  const { PROD_ID } = req.params;

  try {
    const loanProduct = await LoanProduct.findOne({ PROD_ID });

    if (!loanProduct) {
      return res.status(404).json({
        message: 'Loan product not found for the given PROD_ID'
      });
    }

    res.status(200).json({
      message: 'Loan product retrieved successfully!',
      data: {
        PROD_ID: loanProduct.PROD_ID,
        productName: loanProduct.productName,
        productType: loanProduct.productType,
        description: loanProduct.description,
        minLoanAmount: loanProduct.minLoanAmount,
        maxLoanAmount: loanProduct.maxLoanAmount,
        minTermMonths: loanProduct.minTermMonths,
        maxTermMonths: loanProduct.maxTermMonths,
        interestRate: loanProduct.interestRate,
        calculationMethod: loanProduct.calculationMethod || 'reducing',
        status: loanProduct.status,
        features: loanProduct.features,
        eligibilityCriteria: loanProduct.eligibilityCriteria
      },
    });
  } catch (error) {
    console.error('Error fetching loan product:', error);
    res.status(500).json({
      message: 'Failed to fetch loan product',
      error: error.message,
    });
  }
};

// Create Interest Rate
export const createInterestRate = async (req, res) => {
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

        console.log('🔍 Received request to create interest rate:', {
            PROD_ID,
            LOAN_PROUD_INT_ID,
            RATE_TY,
            DAILY_ACCRUAL_CONFIG
        });

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
            MIN_LOAN_TERM_MONTHS: parseInt(MIN_LOAN_TERM_MONTHS),
            MAX_LOAN_TERM_MONTHS: parseInt(MAX_LOAN_TERM_MONTHS),
            STATUS,
            DAILY_ACCRUAL_CONFIG: {
                GL_ACCOUNT: DAILY_ACCRUAL_CONFIG?.GL_ACCOUNT || '400100',
                POSTING_FREQUENCY: DAILY_ACCRUAL_CONFIG?.POSTING_FREQUENCY || 'EOD'
            },
            RATE_CHANGE_ALLOWED: RATE_CHANGE_ALLOWED === true || RATE_CHANGE_ALLOWED === 'true',
            TIME: TIME ? parseInt(TIME) : 12
        };

        console.log('📝 Creating interest rate with data:', interestRateData);

        // Create new interest rate
        const newInterestRate = new LoanInterestRate(interestRateData); // ✅ FIXED
        await newInterestRate.save({ session });

        await session.commitTransaction();

        console.log('✅ Interest rate created successfully:', newInterestRate._id);

        res.status(201).json({
            success: true,
            message: 'Interest rate created successfully',
            data: newInterestRate
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Error creating Interest Rate:', error);
        
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
};

// Get all interest rates
export const getAllInterestRates = async (req, res) => {
  try {
    const interestRates = await LoanInterestRate.find(); // ✅ FIXED
    
    if (!interestRates || interestRates.length === 0) {
      return res.status(404).json({ message: 'No Interest Rates found' });
    }
    
    res.status(200).json({
      message: 'Interest Rates retrieved successfully!',
      data: interestRates,
    });
  } catch (error) {
    console.error('Error fetching interest rates:', error);
    res.status(500).json({
      message: 'Failed to fetch Interest Rates',
      error: error.message,
    });
  }
};

// Delete interest rate
export const deleteInterestRate = async (req, res) => {
  const { PROD_ID } = req.params;

  try {
    const deletedInterestRate = await LoanInterestRate.findOneAndDelete({ // ✅ FIXED
      PROD_ID
    });

    if (!deletedInterestRate) {
      return res.status(404).json({
        message: 'Interest Rate not found for the given PROD_ID'
      });
    }

    res.status(200).json({
      message: 'Interest Rate deleted successfully',
      data: deletedInterestRate
    });
  } catch (error) {
    console.error('Error deleting interest rate:', error);
    res.status(500).json({
      message: 'Failed to delete Interest Rate',
      error: error.message
    });
  }
};

// Update interest rate
export const updateInterestRate = async (req, res) => {
  const { PROD_ID } = req.params;
  const {
    INDEX_RATE_ID,
    RATE_CHANGE_ALLOWED,
    TIME,
    EFFECTIVE_DT,
    INT_TY,
    DR_CR_IND,
    ACCRUAL_FREQ_VALUE,
    ACCRUAL_FREQ_CD,
    MATURITY_INT_INDEX_ID,
    MIN_LOAN_TERM_MONTHS,
    MAX_LOAN_TERM_MONTHS
  } = req.body;

  try {
    const interestRate = await LoanInterestRate.findOne({ PROD_ID }); // ✅ FIXED

    if (!interestRate) {
      return res.status(404).json({
        message: 'Interest Rate not found for the given PROD_ID'
      });
    }

    // Update ABSOLUTE_RATE and FIXED_RATE if INDEX_RATE_ID changes
    if (INDEX_RATE_ID) {
      const rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: parseInt(INDEX_RATE_ID) });
      if (!rateIndex || !rateIndex.INDEX_RATE) {
        return res.status(400).json({
          message: `Rate index with ID ${INDEX_RATE_ID} not found or missing INDEX_RATE`
        });
      }
      const indexRate = parseFloat(rateIndex.INDEX_RATE);
      if (indexRate <= 0) {
        return res.status(400).json({
          message: 'INDEX_RATE must be a positive number'
        });
      }
      interestRate.ABSOLUTE_RATE = indexRate;
      interestRate.FIXED_RATE = indexRate;
      interestRate.INDEX_RATE_ID = INDEX_RATE_ID;
    }

    interestRate.RATE_CHANGE_ALLOWED = RATE_CHANGE_ALLOWED ?? interestRate.RATE_CHANGE_ALLOWED;
    interestRate.TIME = TIME ?? interestRate.TIME;
    interestRate.EFFECTIVE_DT = EFFECTIVE_DT ?? interestRate.EFFECTIVE_DT;
    interestRate.INT_TY = INT_TY ?? interestRate.INT_TY;
    interestRate.DR_CR_IND = DR_CR_IND ?? interestRate.DR_CR_IND;
    interestRate.ACCRUAL_FREQ_VALUE = ACCRUAL_FREQ_VALUE ?? interestRate.ACCRUAL_FREQ_VALUE;
    interestRate.ACCRUAL_FREQ_CD = ACCRUAL_FREQ_CD ?? interestRate.ACCRUAL_FREQ_CD;
    interestRate.MATURITY_INT_INDEX_ID = MATURITY_INT_INDEX_ID ?? interestRate.MATURITY_INT_INDEX_ID;
    interestRate.MIN_LOAN_TERM_MONTHS = MIN_LOAN_TERM_MONTHS ?? interestRate.MIN_LOAN_TERM_MONTHS;
    interestRate.MAX_LOAN_TERM_MONTHS = MAX_LOAN_TERM_MONTHS ?? interestRate.MAX_LOAN_TERM_MONTHS;

    await interestRate.save();

    res.status(200).json({
      message: 'Interest Rate updated successfully!',
      data: interestRate,
    });
  } catch (error) {
    console.error('Error updating interest rate:', error);
    res.status(500).json({
      message: 'Failed to update Interest Rate',
      error: error.message,
    });
  }
};

// Get interest rate by PROD_ID
export const getInterestRate = async (req, res) => {
  const { PROD_ID } = req.params;

  try {
    const interestRate = await LoanInterestRate.findOne({ PROD_ID }); // ✅ FIXED

    if (!interestRate) {
      return res.status(404).json({
        message: 'Interest Rate not found for the given PROD_ID'
      });
    }

    res.status(200).json({
      message: 'Interest Rate retrieved successfully!',
      data: interestRate,
    });
  } catch (error) {
    console.error('Error fetching interest rate:', error);
    res.status(500).json({
      message: 'Failed to fetch Interest Rate',
      error: error.message,
    });
  }
};

// Calculate daily interest utility
export const calculateDailyInterest = (principal, annualRate, days) => {
  return (principal * annualRate * days) / (100 * 360);
};

// Update capitalization status
export const updateCapitalizationStatus = async (req, res) => {
  const { LOAN_PROUD_INT_ID } = req.params;
  const { status, updatedBy } = req.body;

  const validStatuses = ['CAPITALIZED', 'REJECTED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      message: 'Invalid status. Must be either CAPITALIZED or REJECTED.'
    });
  }

  try {
    const interestRate = await LoanInterestRate.findOne({ LOAN_PROUD_INT_ID }); // ✅ FIXED

    if (!interestRate) {
      return res.status(404).json({
        message: 'Interest Rate record not found for the given LOAN_PROUD_INT_ID'
      });
    }

    interestRate.CAPITALIZE_ACCT_ST = status;
    if (updatedBy) interestRate.LAST_MODIFIED_BY = updatedBy;

    await interestRate.save();

    return res.status(200).json({
      message: `Capitalization status updated to ${status}`,
      data: interestRate
    });
  } catch (error) {
    console.error('Error updating capitalization status:', error);
    return res.status(500).json({
      message: 'Failed to update capitalization status',
      error: error.message
    });
  }
};

// Get capitalization status
export const getCapitalizationStatus = async (req, res) => {
  const { LOAN_PROUD_INT_ID } = req.params;

  try {
    const interestRate = await LoanInterestRate.findOne({ LOAN_PROUD_INT_ID }); // ✅ FIXED

    if (!interestRate) {
      return res.status(404).json({
        message: 'Interest Rate record not found for the given LOAN_PROUD_INT_ID'
      });
    }

    return res.status(200).json({
      message: 'Capitalization status retrieved successfully',
      LOAN_PROUD_INT_ID: interestRate.LOAN_PROUD_INT_ID,
      status: interestRate.CAPITALIZE_ACCT_ST
    });
  } catch (error) {
    console.error('Error retrieving capitalization status:', error);
    return res.status(500).json({
      message: 'Failed to retrieve capitalization status',
      error: error.message
    });
  }
};

export default { 
  calculateEMI,
  calculateFlatRate,
  calculateLoanRepayment,
  calculateEMIEndpoint,
  calculateLoanRepaymentEndpoint,
  getLoanProducts,
  getLoanProduct,
  calculateDailyInterest, 
  getInterestRate,
  updateInterestRate,
  createInterestRate,
  getAllInterestRates,
  updateCapitalizationStatus,
  getCapitalizationStatus
};