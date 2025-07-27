// scripts/migrateTransactions.js
import mongoose from 'mongoose';
import Transaction from '../models/Transaction';
import LoanAccount from '../models/LoanAccount';
import dotenv from 'dotenv';

dotenv.config();

const migrateTransactions = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log('Starting transaction data migration...');

    // Update Transaction collection
    const txResult = await Transaction.updateMany(
      { TRANSACTION_TYPE: { $exists: true } },
      [
        {
          $set: {
            TRANSACTION_TYPE: {
              $switch: {
                branches: [
                  { case: { $eq: ["$TRANSACTION_TYPE", "Debit"] }, then: "DEBIT" },
                  { case: { $eq: ["$TRANSACTION_TYPE", "Credit"] }, then: "CREDIT" },
                  { case: { $eq: ["$TRANSACTION_TYPE", "Loan_Disbursement"] }, then: "LOAN_DISBURSEMENT" },
                  // Add more mappings as needed
                ],
                default: { $toUpper: "$TRANSACTION_TYPE" }
              }
            },
            currency: "NGN" // Force NGN currency
          }
        }
      ]
    );

    console.log(`Updated ${txResult.modifiedCount} transactions`);

    // Update LoanAccount collection to use NGN
    const loanResult = await LoanAccount.updateMany(
      {},
      { $set: { CRNCY_ID: "NGN" } }
    );

    console.log(`Updated ${loanResult.modifiedCount} loan accounts to NGN`);

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrateTransactions();