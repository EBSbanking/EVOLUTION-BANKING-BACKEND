import Deposit from '../models/Deposit.js'; // Import the Deposit model
import { generateDepositAccountDetails as generateDepositAccountDetailsFromModel } from '../models/Deposit.js'; // Import the function for generating deposit account details

// Create a new deposit transaction
const createDeposit = async (req, res) => {
    try {
        const { CUST_ID, ACCT_NM, BU_ID, RSM_ID, OPENED_DT, AVAIL_DT, PROD_ID } = req.body;

        // Generate deposit account details (ACCT_ID and ACCT_NO)
        const accountDetails = await generateDepositAccountDetailsFromModel();

        // Create a new deposit document
        const newDeposit = new Deposit({
            CUST_ID,
            ACCT_NM,
            ACCT_ID: accountDetails.ACCT_ID,
            ACCT_NO: accountDetails.ACCT_NO,
            BU_ID,
            RSM_ID,
            OPENED_DT,
            AVAIL_DT,
            PROD_ID,
        });

        // Save the deposit transaction
        await newDeposit.save();

        // Send successful response
        res.status(201).json({
            message: 'Deposit transaction created successfully',
            deposit: newDeposit,
        });
    } catch (error) {
        console.error('Error creating deposit transaction:', error.message);
        res.status(500).json({
            message: 'An error occurred while creating the deposit transaction',
            error: error.message,
        });
    }
};

// Fetch all deposits
const getAllDeposits = async (req, res) => {
    try {
        const deposits = await Deposit.find();
        res.status(200).json(deposits);
    } catch (error) {
        console.error('Error fetching deposits:', error.message);
        res.status(500).json({
            message: 'An error occurred while fetching deposits',
            error: error.message,
        });
    }
};

// Fetch a deposit by account number
const getDepositByAcctNo = async (req, res) => {
    try {
        const { acct_no } = req.params;

        const deposit = await Deposit.findOne({ ACCT_NO: acct_no });

        if (!deposit) {
            return res.status(404).json({ message: 'Deposit account not found' });
        }

        res.status(200).json(deposit);
    } catch (error) {
        console.error('Error fetching deposit account:', error.message);
        res.status(500).json({
            message: 'An error occurred while fetching the deposit account',
            error: error.message,
        });
    }
};

// Update a deposit by account number
const updateDepositByAcctNo = async (req, res) => {
    try {
        const { acct_no } = req.params;
        const updateData = req.body;

        const updatedDeposit = await Deposit.findOneAndUpdate({ ACCT_NO: acct_no }, updateData, { new: true });

        if (!updatedDeposit) {
            return res.status(404).json({ message: 'Deposit account not found' });
        }

        res.status(200).json({
            message: 'Deposit account updated successfully',
            deposit: updatedDeposit,
        });
    } catch (error) {
        console.error('Error updating deposit account:', error.message);
        res.status(500).json({
            message: 'An error occurred while updating the deposit account',
            error: error.message,
        });
    }
};

// Delete a deposit by account number
const deleteDepositByAcctNo = async (req, res) => {
    try {
        const { acct_no } = req.params;

        const result = await Deposit.findOneAndDelete({ ACCT_NO: acct_no });

        if (!result) {
            return res.status(404).json({ message: 'Deposit account not found' });
        }

        res.status(200).json({ message: 'Deposit account deleted successfully' });
    } catch (error) {
        console.error('Error deleting deposit account:', error.message);
        res.status(500).json({
            message: 'An error occurred while deleting the deposit account',
            error: error.message,
        });
    }
};

// Fetch a deposit by customer ID
const getDepositByCustId = async (req, res) => {
    try {
        const cust_id = Number(req.params.cust_id); // Convert to number

        const deposit = await Deposit.findOne({ CUST_ID: cust_id });

        if (!deposit) {
            return res.status(404).json({ message: 'Deposit account not found for the given CUST_ID' });
        }

        res.status(200).json(deposit);
    } catch (error) {
        console.error('Error fetching deposit account by CUST_ID:', error.message);
        res.status(500).json({
            message: 'An error occurred while fetching the deposit account by CUST_ID',
            error: error.message,
        });
    }
};


// Export functions for use in DepositRoutes.js
export {
    createDeposit,
    getAllDeposits,
    getDepositByAcctNo,
    updateDepositByAcctNo,
    deleteDepositByAcctNo,
    getDepositByCustId,
    generateDepositAccountDetailsFromModel as generateDepositAccountDetails,
};
