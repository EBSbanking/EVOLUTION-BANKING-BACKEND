import mongoose from 'mongoose';
import LoanAccount from '../models/LoanAccount.js';  // LoanAccount model
import Customer from '../models/Customer.js';  // Customer model
import LoanRepayment from '../models/LoanRepayment.js';  // LoanRepayment model
import GLAccount from '../models/GLAccount.js';  // General Ledger model for managing transactions

// Helper function to create GL transactions
const createGLTransaction = async (accountNumber, amount, transactionType, description) => {
    const glTransaction = new GLAccount({
        account_number: accountNumber,
        amount: amount,
        transaction_type: transactionType,
        date: new Date(),
        description: description,
    });
    await glTransaction.save();
};

// **Repay Loan**
export const repayLoan = async (req, res) => {
  const { ACCT_NO, amount } = req.body;

  try {
    const result = await repayLoanService(ACCT_NO, amount);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Repayment Error]', error);
    return res.status(500).json({ message: error.message || 'Error processing loan repayment' });
  }
};

// Handle Repayment History Request
export const getRepaymentHistory = async (req, res) => {
  const { ACCT_NO } = req.query;

  try {
    const result = await getRepaymentHistoryService(ACCT_NO);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[History Error]', error);
    return res.status(500).json({ message: error.message || 'Error fetching repayment history' });
  }
};