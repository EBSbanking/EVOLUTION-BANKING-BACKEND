import DepositTransaction from '../models/DepositTransaction.js'; // Importing the DepositTransaction model
import NotificationService from '../services/NotificationService.js'; // Assuming a Notification Service is available for SMS handling
import axios from 'axios';
import moment from 'moment';

// Helper function to generate a random 18-digit transaction reference number
const generateTransactionRefNo = () => {
    const serialPrefix = 'TRX';
    const randomDigits = Math.floor(Math.random() * 1e18); // 18-digit number
    return `${serialPrefix}${randomDigits}`;
};

// Define the createDepositTransaction function for handling deposit transaction creation
export const createDepositTransaction = async (req, res) => {
    const {
        ACCT_ID,
        ACCT_NO,
        GL_ACCT_NO,
        ACCT_NM,
        TRANSACTION_TYPE = 'Deposit',
        AMOUNT,
        TOTAL_CHARGES = 0, // Default value for charges
        TRANSACTION_DATE = new Date(), // Default to current date if not provided
        DESCRIPTION = '',
        VALUE_DATE,
        DEPOSITOR_NAME,
        BUSINESS_UNIT,
        CURRENCY_COUNT, // Default value
        TOTAL_CURRENCY_COUNT = 0 // Default to 0 if not provided
    } = req.body;

    // Validate required fields
    if (!ACCT_NO || !DEPOSITOR_NAME || !BUSINESS_UNIT || !VALUE_DATE) {
        return res.status(400).json({ message: 'All required fields must be provided.' });
    }

    // Validate AMOUNT (should be positive)
    if (AMOUNT <= 0) {
        return res.status(400).json({ message: 'Amount must be a positive number.' });
    }

    // Calculate the final amount after subtracting the charges
    const finalAmount = AMOUNT - TOTAL_CHARGES;

    // Validate if finalAmount is positive after charges subtraction
    if (finalAmount <= 0) {
        return res.status(400).json({ message: 'Amount after charges must be a positive number.' });
    }

    try {
        // Fetch the most recent transaction for the account
        const lastTransaction = await DepositTransaction.findOne({ ACCT_NO }).sort({ TRANSACTION_DATE: -1 });

        let balanceBeforeTransaction = 0;

        // If a previous transaction exists, get the last balance, else set to 0
        if (lastTransaction) {
            balanceBeforeTransaction = parseFloat(lastTransaction.BALANCE_AFTER_TRANSACTION);
        }

        // Calculate the balance after the transaction based on the type
        let newBalance;

        if (TRANSACTION_TYPE === 'Deposit') {
            newBalance = balanceBeforeTransaction + finalAmount;
        } else {
            return res.status(400).json({ message: 'Invalid transaction type' });
        }

        // Generate a transaction reference number
        const transactionRefNo = generateTransactionRefNo();

        // Create a new deposit transaction object
        const newTransaction = new DepositTransaction({
            ACCT_ID,
            ACCT_NO,
            ACCT_NM,
            GL_ACCT_NO,
            TRANSACTION_TYPE,
            AMOUNT,
            TOTAL_CHARGES, // Store the charges as part of the transaction
            TRANSACTION_DATE,
            DESCRIPTION,
            TRANSACTION_REF_NO: transactionRefNo,
            BALANCE_AFTER_TRANSACTION: newBalance,
            VALUE_DATE,
            DEPOSITOR_NAME,
            BUSINESS_UNIT,
            CURRENCY_COUNT,
            TOTAL_CURRENCY_COUNT
        });

        // Save the new transaction object to the database
        await newTransaction.save()

        return res.status(201).json({
            message: 'Deposit transaction created successfully',
            transaction: newTransaction,
            transactionRefNo
        });

    } catch (error) {
        console.error('Error creating deposit transaction:', error);
        return res.status(500).json({ message: 'Error creating transaction', error: error.message });
    }
};

// Route to get all transaction reference numbers (TRANSACTION_REF_NO) by Account Number (ACCT_NO)
export const getTransactionRefNosByAcctNo = async (req, res) => {
    try {
        const { acctNo } = req.params;

        // Fetch only the transaction reference numbers for the specified account number
        const transactions = await DepositTransaction.find({ ACCT_NO: acctNo }).select('TRANSACTION_REF_NO');

        if (transactions.length > 0) {
            res.status(200).json(transactions);
        } else {
            res.status(404).json({ message: 'No transactions found for this account' });
        }
    } catch (error) {
        console.error('Error fetching transaction reference numbers:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get all transactions by Account Number (ACCT_NO)
export const getTransactionsByAcctNo = async (req, res) => {
    try {
        const { acctNo } = req.params;

        // Fetch transactions by Account Number
        const transactions = await DepositTransaction.find({ ACCT_NO: acctNo });

        if (transactions.length > 0) {
            res.status(200).json(transactions);
        } else {
            res.status(404).json({ message: 'No transactions found for this account' });
        }
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: error.message });
    }
};
