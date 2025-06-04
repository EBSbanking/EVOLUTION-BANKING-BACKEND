import RepaymentSchedule from '../models/RepaymentSchedule.js';
import LoanAccount from '../models/LoanAccount.js'; 

export const getRepaymentSchedule = async (req, res) => {
    const { ACCT_NO } = req.params;

    if (!ACCT_NO) {
        return res.status(400).json({ message: 'Account number is required' });
    }

    try {
        console.log('Fetching repayment schedule for account number:', ACCT_NO);

        // Check if the loan account exists
        const loanAccount = await LoanAccount.findOne({ ACCT_NO: Number(ACCT_NO) });
        if (!loanAccount) {
            return res.status(404).json({ message: 'Loan account not found' });
        }

        const now = new Date();

        // Mark overdue repayments before fetching
        await RepaymentSchedule.updateMany(
            {
                ACCT_NO: String(ACCT_NO),
                dueDate: { $lt: now },
                status: 'Pending'  // Only pending installments
            },
            { $set: { status: 'Overdue' } }
        );

        // Now fetch repayment schedules for this account
        const repaymentSchedules = await RepaymentSchedule.find({ ACCT_NO: String(ACCT_NO) });

        console.log('Repayment schedules found:', repaymentSchedules);

        if (repaymentSchedules.length === 0) {
            return res.status(404).json({ message: 'No repayment schedule found for the provided account number' });
        }

        res.status(200).json({
            message: 'Repayment schedule retrieved successfully',
            repaymentSchedules,
        });
    } catch (error) {
        console.error('Error fetching repayment schedule:', error);
        res.status(500).json({ message: 'Error fetching repayment schedule', error: error.message });
    }
};
