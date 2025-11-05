import mongoose from 'mongoose';
import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';

class AutoReclassification {
    static async checkLoanPerformance(accountNumber, session = null) {
        try {
            const queryOptions = session ? { session } : {};
            
            // 1. Find the loan account
            const loan = await LoanAccount.findOne({ ACCT_NO: accountNumber }, null, queryOptions);
            if (!loan) {
                console.warn(`Loan account ${accountNumber} not found`);
                return;
            }

            // 2. Check for any overdue or pending installments
            const hasOutstandingInstallments = await RepaymentSchedule.exists({
                ACCT_NO: String(accountNumber),
                status: { $in: ['Overdue', 'Pending'] },
                dueDate: { $lte: new Date() }
            }, null, queryOptions);

            // 3. Reclassify if no outstanding installments
            if (!hasOutstandingInstallments) {
                await LoanAccount.updateOne(
                    { ACCT_NO: accountNumber },
                    { 
                        $set: { 
                            status: 'Performing',
                            REC_ST: 'Active',
                            lastReclassificationDate: new Date() 
                        } 
                    },
                    queryOptions
                );
                console.log(`Loan ${accountNumber} reclassified to Performing`);
            }

        } catch (error) {
            console.error(`Error in checkLoanPerformance for account ${accountNumber}:`, error);
            throw error; // Re-throw for transaction handling
        }
    }
}

export default AutoReclassification;