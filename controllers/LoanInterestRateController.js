import express from 'express';
import mongoose from 'mongoose';
import InterestRate from '../models/loanInterestRate.js';
import RateIndex from '../models/Rate-Index.js';

// Utility function for EMI calculation - always using 'reducing' method
export const calculateEMI = ({
  principal,
  annualRate,
  termMonths,
  startDate
}) => {
  const method = 'reducing'; // force reducing
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
      remainingBalance: balance,
      isFinalInstallment: i === termMonths
    });
  }

  return {
    emi: reducingEMI,
    totalInterest,
    totalRepayment: reducingEMI * termMonths,
    installments
  };
};

// Endpoint for EMI calculation - forcing 'reducing' method
export const calculateEMIEndpoint = async (req, res) => {
  try {
    const {
      principal,
      time,
      PROD_ID,
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
    if (PROD_ID) {
      loanProduct = await InterestRate.findOne({ PROD_ID });
      if (!loanProduct) {
        return res.status(404).json({ message: 'Loan product not found' });
      }
      if (time < loanProduct.MIN_LOAN_TERM_MONTHS || time > loanProduct.MAX_LOAN_TERM_MONTHS) {
        return res.status(400).json({ 
          message: `Loan term must be between ${loanProduct.MIN_LOAN_TERM_MONTHS} and ${loanProduct.MAX_LOAN_TERM_MONTHS} months` 
        });
      }
    }

    let annualRate;
    if (rateType === 'absolute' && ABSOLUTE_RATE != null) {
      annualRate = ABSOLUTE_RATE;
    } else if (rateType === 'fixed' && FIXED_RATE != null) {
      annualRate = FIXED_RATE;
    } else if (loanProduct) {
      annualRate = loanProduct.ABSOLUTE_RATE || loanProduct.FIXED_RATE;
    }

    if (annualRate == null || isNaN(annualRate)) {
      return res.status(400).json({ message: 'Could not determine valid interest rate.' });
    }

    if (loanProduct) {
      const maxRate = loanProduct.ABSOLUTE_RATE 
        ? Math.max(loanProduct.ABSOLUTE_RATE, loanProduct.FIXED_RATE || 0)
        : loanProduct.FIXED_RATE;
      
      if (annualRate > maxRate) {
        return res.status(400).json({
          message: `Requested rate exceeds maximum allowed rate of ${maxRate}% for this product`
        });
      }
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
        emi: emiResult.emi,
        totalInterest: emiResult.totalInterest,
        totalRepayment: emiResult.totalRepayment,
        installments: emiResult.installments
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


// Keep other exports unchanged below (unchanged content not shown here for brevity)


export const createInterestRate = async (req, res) => {
  const {
    PROD_ID,
    INDEX_RATE_ID,
    ABSOLUTE_RATE,
    FIXED_RATE,
    RATE_CHANGE_ALLOWED,
    TIME,
    EFFECTIVE_DT,
    INT_TY,
    DR_CR_IND,
    ACCRUAL_FREQ_VALUE,
    ACCRUAL_FREQ_CD,
    CREATED_BY,
    USER_ID,
    LOAN_PROUD_INT_ID,
    RATE_TY,
    MATURITY_INT_INDEX_ID,
    ACCRUAL_BASIS_TY
  } = req.body;

  try {
    const missingFields = [];

    if (!PROD_ID) missingFields.push('PROD_ID');
    if (!INDEX_RATE_ID) missingFields.push('INDEX_RATE_ID');
    if (!ABSOLUTE_RATE) missingFields.push('ABSOLUTE_RATE');
    if (!FIXED_RATE) missingFields.push('FIXED_RATE');
    if (!EFFECTIVE_DT) missingFields.push('EFFECTIVE_DT');
    if (!INT_TY) missingFields.push('INT_TY');
    if (!DR_CR_IND) missingFields.push('DR_CR_IND');
    if (!ACCRUAL_FREQ_VALUE) missingFields.push('ACCRUAL_FREQ_VALUE');
    if (!ACCRUAL_FREQ_CD) missingFields.push('ACCRUAL_FREQ_CD');
    if (!CREATED_BY) missingFields.push('CREATED_BY');
    if (!USER_ID) missingFields.push('USER_ID');
    if (!LOAN_PROUD_INT_ID) missingFields.push('LOAN_PROUD_INT_ID');
    if (!RATE_TY) missingFields.push('RATE_TY');
    if (!MATURITY_INT_INDEX_ID) missingFields.push('MATURITY_INT_INDEX_ID');
    if (!ACCRUAL_BASIS_TY) missingFields.push('ACCRUAL_BASIS_TY');

    if (isNaN(ABSOLUTE_RATE) || ABSOLUTE_RATE === 0) missingFields.push('ABSOLUTE_RATE');
    if (isNaN(FIXED_RATE) || FIXED_RATE === 0) missingFields.push('FIXED_RATE');

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: 'Missing required fields or invalid values',
        missingFields: missingFields
      });
    }

    const newInterestRate = new InterestRate({
      PROD_ID,
      INDEX_RATE_ID,
      RATE_CHANGE_ALLOWED,
      TIME,
      EFFECTIVE_DT,
      INT_TY,
      DR_CR_IND,
      ACCRUAL_FREQ_VALUE,
      ACCRUAL_FREQ_CD,
      CREATED_BY,
      USER_ID,
      LOAN_PROUD_INT_ID,
      RATE_TY,
      MATURITY_INT_INDEX_ID,
      ACCRUAL_BASIS_TY,
      FIXED_RATE,
      ABSOLUTE_RATE,
    });

    await newInterestRate.save();

    res.status(201).json({
      message: 'Interest Rate created successfully!',
      newInterestRate
    });
  } catch (error) {
    console.error('Error creating Interest Rate:', error);
    res.status(500).json({
      message: 'Failed to create Interest Rate',
      error: error.message
    });
  }
};

export const getAllInterestRates = async (req, res) => {
  try {
    const interestRates = await InterestRate.find();
    
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

export const deleteInterestRate = async (req, res) => {
  const { PROD_ID } = req.params;

  try {
    const deletedInterestRate = await InterestRate.findOneAndDelete({
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

export const updateInterestRate = async (req, res) => {
  const { PROD_ID } = req.params;
  const {
    ABSOLUTE_RATE,
    FIXED_RATE,
    RATE_CHANGE_ALLOWED,
    TIME,
    EFFECTIVE_DT,
    INT_TY,
    DR_CR_IND,
    ACCRUAL_FREQ_VALUE,
    ACCRUAL_FREQ_CD,
    MATURITY_INT_INDEX_ID,
  } = req.body;

  try {
    const interestRate = await InterestRate.findOne({ PROD_ID });

    if (!interestRate) {
      return res.status(404).json({
        message: 'Interest Rate not found for the given PROD_ID'
      });
    }

    interestRate.ABSOLUTE_RATE = ABSOLUTE_RATE || interestRate.ABSOLUTE_RATE;
    interestRate.FIXED_RATE = FIXED_RATE || interestRate.FIXED_RATE;
    interestRate.RATE_CHANGE_ALLOWED = RATE_CHANGE_ALLOWED || interestRate.RATE_CHANGE_ALLOWED;
    interestRate.TIME = TIME || interestRate.TIME;
    interestRate.EFFECTIVE_DT = EFFECTIVE_DT || interestRate.EFFECTIVE_DT;
    interestRate.INT_TY = INT_TY || interestRate.INT_TY;
    interestRate.DR_CR_IND = DR_CR_IND || interestRate.DR_CR_IND;
    interestRate.ACCRUAL_FREQ_VALUE = ACCRUAL_FREQ_VALUE || interestRate.ACCRUAL_FREQ_VALUE;
    interestRate.ACCRUAL_FREQ_CD = ACCRUAL_FREQ_CD || interestRate.ACCRUAL_FREQ_CD;
    interestRate.MATURITY_INT_INDEX_ID = MATURITY_INT_INDEX_ID || interestRate.MATURITY_INT_INDEX_ID;

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

export const getInterestRate = async (req, res) => {
  const { PROD_ID } = req.params;

  try {
    const interestRate = await InterestRate.findOne({ PROD_ID });

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

export const calculateDailyInterest = (principal, annualRate, days) => {
  return (principal * annualRate * days) / (100 * 360); // Common in loans
};

export const updateCapitalizationStatus = async (req, res) => {
  const { LOAN_PROUD_INT_ID } = req.params;
  const { status, updatedBy } = req.body;

  // Validate input
  const validStatuses = ['CAPITALIZED', 'REJECTED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      message: 'Invalid status. Must be either CAPITALIZED or REJECTED.'
    });
  }

  try {
    const interestRate = await InterestRate.findOne({ LOAN_PROUD_INT_ID });

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

export const getCapitalizationStatus = async (req, res) => {
  const { LOAN_PROUD_INT_ID } = req.params;

  try {
    const interestRate = await InterestRate.findOne({ LOAN_PROUD_INT_ID });

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
  calculateEMI,        // Utility function
  calculateEMIEndpoint, // API endpoint
  calculateDailyInterest, 
  getInterestRate,
  updateInterestRate,
  createInterestRate,
  getAllInterestRates,
  updateCapitalizationStatus,
  getCapitalizationStatus
};