import express from 'express';
import mongoose from 'mongoose';
import InterestRate from '../models/LoanInterestRate.js';
import RateIndex from '../models/Rate-Index.js'; // Ensure correct path

export const calculateEMI = async (req, res) => {
  try {
    // Destructure the required parameters: principal, time (months), PROD_ID, rateType, ABSOLUTE_RATE, FIXED_RATE
    const { principal, time, PROD_ID, rateType, ABSOLUTE_RATE, FIXED_RATE } = req.body;

    // Validate input parameters
    if (principal == null || time == null || (ABSOLUTE_RATE == null && FIXED_RATE == null)) {
      return res.status(400).json({ message: 'Principal, time, and one of ABSOLUTE_RATE or FIXED_RATE are required.' });
    }

    if (principal <= 0 || time <= 0 || isNaN(principal) || isNaN(time)) {
      return res.status(400).json({ message: 'Principal and time must be positive numbers.' });
    }

    let effectiveRate;

    // Determine which rate to use based on the user's choice
    if (rateType === 'absolute') {
      effectiveRate = ABSOLUTE_RATE;
    } else if (rateType === 'fixed') {
      effectiveRate = FIXED_RATE;
    } else {
      return res.status(400).json({ message: 'Invalid rate type. Use either "absolute" or "fixed".' });
    }

    // If PROD_ID is provided, check for any overrides from database
    if (PROD_ID) {
      const loanInterestRate = await InterestRate.findOne({ PROD_ID });
      if (loanInterestRate) {
        // Use the rate from the database if available
        if (rateType === 'absolute' && loanInterestRate.ABSOLUTE_RATE) {
          effectiveRate = loanInterestRate.ABSOLUTE_RATE;
        } else if (rateType === 'fixed' && loanInterestRate.FIXED_RATE) {
          effectiveRate = loanInterestRate.FIXED_RATE;
        }
      }
    }

    if (!effectiveRate) {
      return res.status(400).json({ message: 'No rate found to calculate EMI.' });
    }

    // Flat interest calculation: Fixed annual interest rate, converted to monthly rate
    const monthlyRate = effectiveRate / 100 / 12;

    // Number of months (time) should be in months
    const numberOfMonths = time; // time is already in months

    // Total interest over the loan tenure (flat rate calculation)
    const totalInterest = principal * effectiveRate / 100;

    // Total amount to repay (Principal + Total Interest)
    const totalAmountToRepay = principal + totalInterest;

    // EMI remains constant: Total Amount to Repay divided by the number of months
    const emi = totalAmountToRepay / numberOfMonths;
    const roundedEMI = Math.round(emi * 100) / 100; // Round to two decimal places

    // Calculate repayment schedule based on flat interest
    const repaymentSchedules = [];

    // The interest for each month remains constant, based on the original principal
    const interestForThisMonth = principal * monthlyRate;

    let remainingPrincipal = principal;
    for (let month = 1; month <= numberOfMonths; month++) {
      // Principal for this month is the EMI minus the interest
      const principalForThisMonth = roundedEMI - interestForThisMonth;

      // Update remaining principal
      remainingPrincipal -= principalForThisMonth;

      // Ensure the final installment correctly clears the remaining principal
      if (month === numberOfMonths) {
        remainingPrincipal = 0;
      }

      // Push the repayment schedule for each month
      repaymentSchedules.push({
        ACCT_NO: "3000000002", // Use appropriate account number
        installmentNo: month,
        dueDate: new Date(new Date().setMonth(new Date().getMonth() + month - 1)), // Adjust due dates
        principal: Math.round(principalForThisMonth * 100) / 100,
        interest: Math.round(interestForThisMonth * 100) / 100,
        totalPayment: roundedEMI
      });
    }

    res.status(200).json({
      message: 'EMI calculated successfully!',
      data: {
        principal,
        time,
        rateType,
        effectiveRate,
        totalInterest,
        emi: roundedEMI,
        repaymentSchedules
      }
    });

  } catch (error) {
    console.error('Error calculating EMI:', error);
    res.status(500).json({ message: 'Failed to calculate EMI', error: error.message });
  }
};


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
    // Check if required fields are present
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

    // Ensure ABSOLUTE_RATE and FIXED_RATE are valid numbers
    if (isNaN(ABSOLUTE_RATE) || ABSOLUTE_RATE === 0) missingFields.push('ABSOLUTE_RATE');
    if (isNaN(FIXED_RATE) || FIXED_RATE === 0) missingFields.push('FIXED_RATE');

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: 'Missing required fields or invalid values',
        missingFields: missingFields
      });
    }

    // If all fields are provided, create the interest rate
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

    // Save the new interest rate
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



// Function to get all interest rates
export const getAllInterestRates = async (req, res) => {
  try {
    console.log("Fetching all interest rates...");
    const interestRates = await InterestRate.find(); // This should fetch all interest rates from your DB.
    console.log("Fetched interest rates:", interestRates);

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




// Function to delete an interest rate by PROD_ID and INDEX_RATE_ID
export const deleteInterestRate = async (req, res) => {
  const { PROD_ID } = req.params;  // Get PROD_ID and INDEX_RATE_ID from URL params

  try {
    // Find and delete the interest rate using PROD_ID and INDEX_RATE_ID
    const deletedInterestRate = await InterestRate.findOneAndDelete({
      PROD_ID
    });

    // Check if the interest rate was found and deleted
    if (!deletedInterestRate) {
      return res.status(404).json({
        message: 'Interest Rate not found for the given PROD_ID and INDEX_RATE_ID'
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


// Function to update an interest rate by PROD_ID and INDEX_RATE_ID
export const updateInterestRate = async (req, res) => {
  const { PROD_ID } = req.params;  // Get PROD_ID and INDEX_RATE_ID from URL params
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
  } = req.body;  // Get new data from the request body

  try {
    // Find the interest rate by PROD_ID and INDEX_RATE_ID
    const interestRate = await InterestRate.findOne({ PROD_ID });

    // Check if the interest rate was found
    if (!interestRate) {
      return res.status(404).json({
        message: 'Interest Rate not found for the given PROD_ID and INDEX_RATE_ID'
      });
    }

    // Update the fields with new values from the request body
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

    // Save the updated interest rate
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
  const { PROD_ID } = req.params;  // Get PROD_ID and INDEX_RATE_ID from URL params

  try {
    // Find the interest rate by PROD_ID and INDEX_RATE_ID
    const interestRate = await InterestRate.findOne({ PROD_ID });

    // Check if the interest rate was found
    if (!interestRate) {
      return res.status(404).json({
        message: 'Interest Rate not found for the given PROD_ID and INDEX_RATE_ID'
      });
    }

    // Return the found interest rate
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


// controllers/Rate-IndexController.js

// Function to calculate interest
export const calculateInterest = (principal, time, rate) => {
  if (principal <= 0 || time <= 0 || rate <= 0) {
    throw new Error('Principal, time, and rate must be positive values.');
  }
  const interest = (principal * rate * time) / 100;
  return interest;
};
