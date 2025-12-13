import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanRepayment from '../models/LoanRepayment.js';
import mongoose from 'mongoose';

export const handleLoanRepayment = async ({ ACCT_NO, amount, date, customerAccountNo }) => {
    if (isNaN(new Date(date).getTime())) {
        throw new Error('Invalid repayment date.');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Fetch loan account
        const loanAccount = await LoanAccount.findOne({ 
            ACCT_NO: String(ACCT_NO).trim() 
        }).session(session);
        
        if (!loanAccount) throw new Error('Loan account not found.');

        // 2. Check if loan is active
        const validRepaymentStatuses = ['ACTIVE', 'DISBURSED', 'ONGOING'];
        if (!validRepaymentStatuses.includes(loanAccount.LOAN_STATUS?.toUpperCase())) {
            throw new Error(`Loan account is not active for repayments. Current status: ${loanAccount.LOAN_STATUS}`);
        }

        // 3. Find customer account by account_number
        const customerAccount = await CustomerAccount.findOne({ 
            account_number: String(customerAccountNo).trim() 
        }).session(session);

        if (!customerAccount) {
            throw new Error(`Customer account ${customerAccountNo} not found.`);
        }

        // 4. Verify customer matches loan (optional but good practice)
        const loanCustId = String(loanAccount.CUST_ID).trim();
        const custId = String(customerAccount.customer_id).trim();
        
        if (loanCustId !== custId) {
            console.warn(`Customer ID mismatch: Loan has ${loanCustId}, Account has ${custId}`);
            // Continue anyway - sometimes accounts might be linked differently
        }

        // 5. Check customer balance
        const amountNum = parseFloat(amount.toString());
        
        // Get customer balance - using available_balance from your data
        const customerAvailableBalance = customerAccount.available_balance ? 
            parseFloat(customerAccount.available_balance.toString()) :
            customerAccount.AVAILABLE_BALANCE ? 
                parseFloat(customerAccount.AVAILABLE_BALANCE.toString()) : 0;

        if (customerAvailableBalance < amountNum) {
            throw new Error(`Insufficient balance in customer account. Available: ${customerAvailableBalance}, Required: ${amountNum}`);
        }

        // 6. Update LoanAccount
        const currentOutstanding = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL?.toString() || '0');
        const currentTotalRepaid = parseFloat(loanAccount.TOTAL_REPAID_AMOUNT?.toString() || '0');
        
        // Update outstanding principal
        const newOutstanding = Math.max(0, currentOutstanding - amountNum);
        loanAccount.OUTSTANDING_PRINCIPAL = mongoose.Types.Decimal128.fromString(newOutstanding.toString());
        
        // Update total repaid
        loanAccount.TOTAL_REPAID_AMOUNT = mongoose.Types.Decimal128.fromString(
            (currentTotalRepaid + amountNum).toString()
        );
        
        // Update payment history
        loanAccount.LAST_PAYMENT_DATE = new Date(date);
        loanAccount.LAST_PAYMENT_AMOUNT = mongoose.Types.Decimal128.fromString(amountNum.toString());
        
        // Check if loan is fully paid
        if (newOutstanding <= 0) {
            loanAccount.LOAN_STATUS = 'CLOSED';
            loanAccount.CLOSURE_DATE = new Date(date);
        }
        
        // Add to payment history array
        if (!loanAccount.paymentHistory) loanAccount.paymentHistory = [];
        loanAccount.paymentHistory.push({
            date: new Date(date),
            amount: mongoose.Types.Decimal128.fromString(amountNum.toString()),
            type: 'REPAYMENT',
            description: 'Loan repayment'
        });
        
        await loanAccount.save({ session });

        // 7. Debit CustomerAccount
        // Deduct from available_balance
        if (customerAccount.available_balance !== undefined) {
            customerAccount.available_balance = mongoose.Types.Decimal128.fromString(
                (customerAvailableBalance - amountNum).toString()
            );
        } else if (customerAccount.AVAILABLE_BALANCE !== undefined) {
            customerAccount.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(
                (customerAvailableBalance - amountNum).toString()
            );
        }
        
        // Also update ledger_balance
        if (customerAccount.ledger_balance !== undefined) {
            const currentLedger = parseFloat(customerAccount.ledger_balance.toString());
            customerAccount.ledger_balance = mongoose.Types.Decimal128.fromString(
                (currentLedger - amountNum).toString()
            );
        }
        
        // Add transaction history
        if (!customerAccount.transactionHistory) customerAccount.transactionHistory = [];
        customerAccount.transactionHistory.push({
            date: new Date(date),
            amount: mongoose.Types.Decimal128.fromString(amountNum.toString()),
            type: 'LOAN_REPAYMENT',
            description: `Loan repayment for account ${ACCT_NO}`,
            reference: `REPAY-${Date.now()}`
        });
        
        await customerAccount.save({ session });

        // 8. Record repayment
        const repayment = new LoanRepayment({
            ACCT_NO: String(ACCT_NO).trim(),
            amount: mongoose.Types.Decimal128.fromString(amountNum.toString()),
            date: new Date(date),
            CUST_ID: String(loanAccount.CUST_ID).trim(),
            customerAccountNo: String(customerAccountNo).trim(),
            customerAccountId: customerAccount._id,
            loanAccountId: loanAccount._id,
            paymentMethod: 'BANK_TRANSFER',
            status: 'COMPLETED',
            reference: `REPAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            details: {
                customerBalanceBefore: customerAvailableBalance,
                customerBalanceAfter: customerAvailableBalance - amountNum,
                loanOutstandingBefore: currentOutstanding,
                loanOutstandingAfter: newOutstanding,
                isFinalPayment: newOutstanding <= 0
            }
        });
        await repayment.save({ session });

        await session.commitTransaction();
        session.endSession();

        return { 
            success: true, 
            message: 'Loan repayment successful.',
            data: {
                repaymentId: repayment._id,
                loanAccount: {
                    ACCT_NO: loanAccount.ACCT_NO,
                    newOutstandingPrincipal: newOutstanding,
                    totalRepaid: currentTotalRepaid + amountNum,
                    loanStatus: loanAccount.LOAN_STATUS
                },
                customerAccount: {
                    accountNumber: customerAccount.account_number,
                    balanceAfter: customerAvailableBalance - amountNum
                }
            }
        };

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return { success: false, error: error.message };
    }
};

export const repayLoan = async (req, res) => {
    try {
        const { ACCT_NO, amount, date, customerAccountNo } = req.body;

        // Validate required fields
        const errors = [];
        if (!ACCT_NO) errors.push({ message: 'ACCT_NO is required' });
        if (!amount || isNaN(amount) || amount <= 0) errors.push({ message: 'Valid amount is required' });
        if (!date || isNaN(new Date(date).getTime())) errors.push({ message: 'Valid date is required' });
        if (!customerAccountNo) errors.push({ message: 'customerAccountNo is required' });

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
        }

        const result = await handleLoanRepayment({ 
            ACCT_NO, 
            amount, 
            date, 
            customerAccountNo 
        });

        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(400).json({
                success: false,
                message: result.error,
                errors: [{ message: result.error }]
            });
        }
    } catch (error) {
        console.error('[Repayment Error]', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            errors: [{ message: error.message }]
        });
    }
};

export const getRepaymentHistoryService = async (ACCT_NO) => {
    try {
        const repayments = await LoanRepayment.find({ 
            ACCT_NO: String(ACCT_NO).trim() 
        })
            .sort({ date: -1 })
            .lean();
        
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
        return res.status(400).json({ 
            success: false,
            message: 'Account number is required',
            errors: [{ message: 'Account number is required' }]
        });
    }

    try {
        const result = await getRepaymentHistoryService(ACCT_NO);
        return res.status(200).json({
            success: true,
            message: 'Repayment history retrieved successfully',
            data: result,
            count: result.length
        });
    } catch (error) {
        console.error('[History Error]', error);
        return res.status(500).json({ 
            success: false,
            message: error.message || 'Error fetching repayment history',
            errors: [{ message: error.message || 'Internal server error' }]
        });
    }
};