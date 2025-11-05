import LoanProduct from '../models/LoanProduct.js';
import LoanFee from '../models/LoanFee.js';

export default class FeeCalculationService {
    async calculateInitialFees({ loanAmount, productId, term, termCode }) {
        // Query by PROD_ID instead of _id
        const product = await LoanProduct.findOne({ PROD_ID: productId });
        
        if (!product) {
            throw new Error(`Loan product with PROD_ID ${productId} not found`);
        }

        // Get all fees configured for this product
        const configuredFees = await LoanFee.find({
            productId: product._id,  // Use the ObjectId here
            isActive: true
        });

        const feeBreakdown = configuredFees.map(fee => ({
            name: fee.name,
            amount: fee.isPercentage 
                ? (loanAmount * fee.rate / 100)
                : fee.fixedAmount,
            feeType: fee.feeType,
            glAccountCode: fee.glAccountCode,
            isPercentage: fee.isPercentage,
            value: fee.isPercentage ? fee.rate : fee.fixedAmount
        }));

        return {
            totalFees: feeBreakdown.reduce((sum, fee) => sum + fee.amount, 0),
            feeBreakdown
        };
    }
}