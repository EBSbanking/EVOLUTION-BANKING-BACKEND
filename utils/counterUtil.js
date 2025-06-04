import Counter from '../models/Counter.js';
import CreditApplication from '../models/CreditApplication.js'; // Import CreditApplication model to use for loan cycle count

/**
 * Get the loan cycle count for a given customer ID (cust_ID).
 * @param {String} custID - The customer ID.
 * @returns {Promise<Number>} - The loan cycle count.
 */
export const getLoanCycleCount = async (custID) => {
    try {
        // Count the number of existing loan applications for the given customer ID
        const loanCycleCount = await CreditApplication.countDocuments({ CUST_ID: custID });
        return loanCycleCount + 1; // The next loan cycle number
    } catch (error) {
        console.error('Error fetching loan cycle count:', error);
        throw error;
    }
};

/**
 * Utility to generate ACCT_NO
 * @returns {Promise<Number>} - The generated account number.
 */
export const generateAcctNo = async () => {
    const prefix = 3000000000;
    try {
        // Increment the sequence in the Counter model
        const counter = await Counter.findOneAndUpdate(
            { _id: 'acctNo' }, // Counter identifier
            { $inc: { seq: 1 } }, // Increment sequence
            { new: true, upsert: true, setDefaultsOnInsert: true } // Create if not exists
        );
        return prefix + counter.seq;
    } catch (error) {
        throw new Error('Error generating ACCT_NO: ' + error.message);
    }
};
