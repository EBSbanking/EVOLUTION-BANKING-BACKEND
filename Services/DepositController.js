// DepositController.js

import Deposit from '../models/Deposit.js';  // Corrected import path
import crypto from 'crypto';  // For generating unique identifiers

// Generate Random Number
const generateRandomNumber = (length) => {
    return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
};

let lastGeneratedAcctId = 1; // Initialize the first ACCT_ID
let lastGeneratedAcctNo = 1000000000; // Initialize the first ACCT_NO

export const getgenerateIdentifiers = (req, res) => {
    try {
        // Generate ACCT_ID as an 8-digit sequential number with leading zeros
        const ACCT_ID = lastGeneratedAcctId.toString().padStart(8, '0'); 
        const ACCT_NO = lastGeneratedAcctNo; // Use the last generated account number

        lastGeneratedAcctId += 1; // Increment ACCT_ID for the next generation
        lastGeneratedAcctNo += 1; // Increment ACCT_NO for the next generation

        // Ensure valid JSON response
        res.status(200).json({ ACCT_ID, ACCT_NO });
    } catch (error) {
        console.error('Error generating identifiers:', error);
        res.status(500).json({ message: 'Something went wrong!', error: error.message }); // Properly handle errors
    }
};




// Generate Deposit Account ID
export const generateDepositAccountId = async () => {
    try {
        const lastDeposit = await Deposit.findOne().sort({ ACCT_ID: -1 }).select('ACCT_ID');
        if (!lastDeposit) {
            return 'DA:001'; // Starting point if no deposit found
        }
        const lastId = parseInt(lastDeposit.ACCT_ID.split(':')[1], 10);
        const newId = `DA:${String(lastId + 1).padStart(3, '0')}`;
        return newId;
    } catch (error) {
        console.error('Error generating deposit account ID:', error);
        throw new Error('Error generating deposit account ID');
    }
};

// Generate Deposit Account Number
export const generateDepositAccountNumber = async () => {
    try {
        const lastDeposit = await Deposit.findOne().sort({ ACCT_NO: -1 }).select('ACCT_NO');
        const currentAccountNumber = lastDeposit ? parseInt(lastDeposit.ACCT_NO, 10) : 1000000000;
        const nextAccountNumber = (currentAccountNumber + 1).toString().padStart(10, '0');
        return nextAccountNumber;
    } catch (error) {
        console.error('Error generating deposit account number:', error);
        throw new Error('Error generating deposit account number');
    }
};

// Create Deposit Account
export const createDepositAccount = async (req, res) => {
    const { CUST_ID, ACCT_NM, CRNCY_ID, AMOUNT, TERM, START_DATE, END_DATE } = req.body;

    try {
        if (!CUST_ID || !ACCT_NM || !CRNCY_ID || !AMOUNT || !TERM || !START_DATE || !END_DATE) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const ACCT_ID = await generateDepositAccountId();
        const ACCT_NO = await generateDepositAccountNumber();

        const newDeposit = new Deposit({
            CUST_ID, ACCT_NM, ACCT_ID, ACCT_NO, CRNCY_ID, AMOUNT, TERM, START_DATE, END_DATE
        });

        await newDeposit.save();
        res.status(200).json({ message: 'Deposit account created successfully', depositAccount: newDeposit });
    } catch (error) {
        console.error('Error creating deposit account:', error);
        res.status(500).json({ message: 'Error creating deposit account', error: error.message });
    }
};

// Fetch Deposit Account by Account Number
export const getDepositAccountByAcctNo = async (req, res) => {
    const { ACCT_NO } = req.params;

    try {
        const depositAccount = await Deposit.findOne({ ACCT_NO });
        if (!depositAccount) {
            return res.status(404).json({ message: 'Deposit account not found' });
        }

        res.status(200).json({ message: 'Deposit account retrieved successfully', depositAccount });
    } catch (error) {
        console.error('Error fetching deposit account:', error);
        res.status(500).json({ message: 'Error fetching deposit account', error: error.message });
    }
};

// Get all Deposit Accounts
export const getAllDepositAccounts = async (req, res) => {
    try {
        const deposits = await Deposit.find();
        res.status(200).json({ message: 'All deposit accounts retrieved successfully', deposits });
    } catch (error) {
        console.error('Error fetching deposit accounts:', error);
        res.status(500).json({ message: 'Error fetching deposit accounts', error: error.message });
    }
};

// Create a Deposit (this can be your simplified deposit creation)
export const createDeposit = (req, res) => {
    const depositAmount = req.body.amount;
    if (depositAmount <= 0) {
        return res.status(400).json({ error: 'Deposit amount must be greater than zero' });
    }
    return res.status(201).json({ message: `Deposit of $${depositAmount} created successfully!` });
};

