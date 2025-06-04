// routes/overdueLoans.js

import express from 'express';
import LoanAccount from '../models/LoanAccount.js';
import LoanRepayment from '../models/LoanRepayment.js'; // Needed for processing logic
import { getOverdueLoans } from '../Services/overdueLoanHandler.js';

const router = express.Router();

// ✅ GET /api/overdue
// Fetch loan accounts directly from LoanAccount model with status 'Overdue'
router.get('/overdue', async (req, res) => {
  try {
    const overdueLoans = await LoanAccount.find({ loan_status: 'Overdue' });

    if (!overdueLoans.length) {
      return res.status(404).json({ message: 'No overdue loans found' });
    }

    res.status(200).json(overdueLoans);
  } catch (error) {
    console.error('Error fetching overdue loans from LoanAccount:', error.message);
    res.status(500).json({ message: 'Failed to fetch overdue loans.', error: error.message });
  }
});

// ✅ GET /api/overdue/list
// Fetch overdue loans from OverdueLoan collection (if you store them separately)
router.get('/overdue/list', async (req, res) => {
  try {
    const overdueLoanRecords = await getOverdueLoans();

    if (!overdueLoanRecords.length) {
      return res.status(404).json({ message: 'No overdue loan records found' });
    }

    res.status(200).json(overdueLoanRecords);
  } catch (error) {
    console.error('Error retrieving overdue loan records:', error.message);
    res.status(500).json({ message: 'Failed to retrieve overdue loan records.', error: error.message });
  }
});

// ✅ POST /api/overdue/check
// Process and mark overdue loans
router.post('/check', async (req, res) => {
  try {
    const today = new Date();

    const overdueLoans = await LoanAccount.find({
  due_date: { $lt: today },
  loan_status: 'Active'  // Only update if not already overdue
});


    for (const loan of overdueLoans) {
      try {
        if (!loan || !loan.ACCT_NO) {
          console.error(`Error updating loan status for account ${loan?.ACCT_NO}: Loan account ${loan?._id || 'unknown'} not found.`);
          continue;
        }

        loan.loan_status = 'Overdue';
        await loan.save();

        console.log(`Loan account ${loan.ACCT_NO} marked as overdue.`);
      } catch (innerErr) {
        console.error(`Error updating loan status for account ${loan?.ACCT_NO}:`, innerErr.message);
      }
    }

    console.log('[Service] Overdue loan check completed.');
    res.status(200).json({ message: 'Overdue loan check completed successfully.' });
  } catch (error) {
    console.error('Failed to check overdue loans:', error.message);
    res.status(500).json({ message: 'Failed to check overdue loans.', error: error.message });
  }
});

export default router;
