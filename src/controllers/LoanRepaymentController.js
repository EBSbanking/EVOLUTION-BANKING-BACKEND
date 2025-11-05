// controllers/loanRepaymentController.js
import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanRepayment from '../models/LoanRepayment.js';
import mongoose from 'mongoose';

export const handleLoanRepayment = async ({ ACCT_NO, amount, date, CUST_ID, GL_ACCT_NO }) => {
    if (isNaN(new Date(date).getTime())) {
        throw new Error('Invalid repayment date.');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Fetch loan account
        const loanAccount = await LoanAccount.findOne({ ACCT_NO }).session(session);
        if (!loanAccount) throw new Error('Loan account not found.');

        // 2. Fetch customer account (debit source)
        const customerAccount = await CustomerAccount.findOne({ ACCT_NO, CUST_ID }).session(session);
        if (!customerAccount) throw new Error('Customer account not found.');

        const amountDecimal = mongoose.Types.Decimal128.fromString(amount.toString());
        const customerAvailableBalance = parseFloat(customerAccount.AVAILABLE_BALANCE.toString());

        if (customerAvailableBalance < parseFloat(amount.toString())) {
            throw new Error('Insufficient balance in customer account.');
        }

        // 3. Update LoanAccount balances
        loanAccount.CLEARED_BALANCE = mongoose.Types.Decimal128.fromString(
            (parseFloat(loanAccount.CLEARED_BALANCE.toString()) + parseFloat(amount.toString())).toString()
        );
        loanAccount.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(
            (parseFloat(loanAccount.AVAILABLE_BALANCE.toString()) + parseFloat(amount.toString())).toString()
        );
        loanAccount.LEDGER_BALANCE = mongoose.Types.Decimal128.fromString(
            (parseFloat(loanAccount.LEDGER_BALANCE.toString()) + parseFloat(amount.toString())).toString()
        );
        await loanAccount.save({ session });

        // 4. Debit CustomerAccount
        customerAccount.CLEARED_BAL = mongoose.Types.Decimal128.fromString(
            (parseFloat(customerAccount.CLEARED_BAL.toString()) - parseFloat(amount.toString())).toString()
        );
        customerAccount.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(
            (parseFloat(customerAccount.AVAILABLE_BALANCE.toString()) - parseFloat(amount.toString())).toString()
        );
        customerAccount.LEDGER_BAL = mongoose.Types.Decimal128.fromString(
            (parseFloat(customerAccount.LEDGER_BAL.toString()) - parseFloat(amount.toString())).toString()
        );
        await customerAccount.save({ session });

        // 5. Credit GL account
        const glAccount = await CustomerAccount.findOne({ ACCT_NO: GL_ACCT_NO }).session(session);
        if (!glAccount) throw new Error('GL account not found.');

        glAccount.CLEARED_BAL = mongoose.Types.Decimal128.fromString(
            (parseFloat(glAccount.CLEARED_BAL.toString()) + parseFloat(amount.toString())).toString()
        );
        glAccount.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(
            (parseFloat(glAccount.AVAILABLE_BALANCE.toString()) + parseFloat(amount.toString())).toString()
        );
        glAccount.LEDGER_BAL = mongoose.Types.Decimal128.fromString(
            (parseFloat(glAccount.LEDGER_BAL.toString()) + parseFloat(amount.toString())).toString()
        );
        await glAccount.save({ session });

        // 6. Record repayment
        const repayment = new LoanRepayment({
            ACCT_NO,
            amount: amountDecimal,
            date: new Date(date),
            CUST_ID,
        });
        await repayment.save({ session });

        await session.commitTransaction();
        session.endSession();

        return { success: true, message: 'Loan repayment successful.' };

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return { success: false, error: error.message };
    }
};

export const getRepaymentHistoryService = async (ACCT_NO) => {
    try {
        const repayments = await LoanRepayment.find({ ACCT_NO })
            .sort({ date: -1 })
            .lean(); // Use lean() for better performance
        
        // Convert Decimal128 to numbers for the response
        return repayments.map(repayment => ({
            ...repayment,
            amount: parseFloat(repayment.amount.toString()),
            REPAYMENT_HISTORY: repayment.REPAYMENT_HISTORY?.map(item => ({
                amount: parseFloat(item.amount.toString()),
                date: item.date
            })) || []
        }));
    } catch (error) {
        throw new Error(`Error fetching repayment history: ${error.message}`);
    }
};

export const getRepaymentHistory = async (req, res) => {
    const { ACCT_NO } = req.query;

    if (!ACCT_NO) {
        return res.status(400).json({ message: 'Account number is required' });
    }

    try {
        const result = await getRepaymentHistoryService(ACCT_NO);
        return res.status(200).json(result);
    } catch (error) {
        console.error('[History Error]', error);
        return res.status(500).json({ message: error.message || 'Error fetching repayment history' });
    }
};