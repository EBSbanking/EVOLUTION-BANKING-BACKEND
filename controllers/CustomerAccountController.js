import CustomerAccount from '../models/CustomerAccount.js'

// Allowed enums for ACCOUNT_TYPE and REC_ST
const VALID_ACCOUNT_TYPES = ['SAVINGS', 'CURRENT', 'FIXED_DEPOSIT', 'LOAN', 'CREDIT_CARD'];
const VALID_REC_STATES = ['ACTIVE', 'DORMANT', 'SUSPENDED', 'CLOSED', 'INACTIVE', 'LOCKED', 'CANCELLED', 'BLOCKED', 'PENDING', 'FROZEN', 'OVERDUE'];

export const createCustomerAccount = async (req, res) => {
    const customerAccounts = req.body; // Expecting an array of customer account objects

    // Ensure the request body is an array
    if (!Array.isArray(customerAccounts)) {
        return res.status(400).json({
            message: 'Request body must be an array of customer accounts.',
        });
    }

    try {
        const createdAccounts = [];

        for (const accountData of customerAccounts) {
            const {
                ACCT_ID,
                ACCT_NO,
                ACCT_NM,
                BU_ID,
                GL_ACCT_NO,
                LEDGER_BAL,
                CLEARED_BAL,
                AVAILABLE_BALANCE,
                ACCOUNT_TYPE,
                PRODUCT_DESC,
                REC_ST,
                CUST_ID
            } = accountData;

            // === Validation ===
            if (!CUST_ID) {
                return res.status(400).json({ message: 'CUST_ID is required and cannot be null' });
            }

            if (!VALID_ACCOUNT_TYPES.includes(ACCOUNT_TYPE)) {
                return res.status(400).json({ 
                    message: `Invalid ACCOUNT_TYPE. Must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}` 
                });
            }

            if (!VALID_REC_STATES.includes(REC_ST)) {
                return res.status(400).json({ 
                    message: `Invalid REC_ST. Must be one of: ${VALID_REC_STATES.join(', ')}` 
                });
            }

            // Check for duplicate ACCT_NO
            const existingAccount = await CustomerAccount.findOne({ ACCT_NO });
            if (existingAccount) {
                console.warn(`Duplicate account detected: ACCT_NO=${ACCT_NO}`);
                return res.status(400).json({
                    message: 'Account already exists',
                    reason: `The account number ${ACCT_NO} already exists.`,
                });
            }

            // Create and save the account
            const newCustomerAccount = new CustomerAccount({
                ACCT_ID,
                ACCT_NO,
                ACCT_NM,
                BU_ID,
                GL_ACCT_NO,
                LEDGER_BAL,
                CLEARED_BAL,
                AVAILABLE_BALANCE,
                ACCOUNT_TYPE,
                PRODUCT_DESC,
                REC_ST,
                CUST_ID,
            });

            const savedAccount = await newCustomerAccount.save();
            createdAccounts.push(savedAccount);
        }

        return res.status(201).json({
            message: 'Customer accounts created successfully',
            accounts: createdAccounts,
        });

    } catch (error) {
        console.error('Error creating customer accounts:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                message: 'Duplicate key error',
                error: error.keyValue,
            });
        }

        return res.status(500).json({
            message: 'An error occurred while creating the customer accounts',
            error: error.message,
        });
    }
};


// Get all customer accounts
export const getAllCustomerAccounts = async (req, res) => {
    try {
        const accounts = await CustomerAccount.find();
        return res.status(200).json({
            message: 'Customer accounts retrieved successfully',
            accounts,
        });
    } catch (error) {
        console.error('Error fetching customer accounts:', error);
        return res.status(500).json({
            message: 'An error occurred while fetching the customer accounts',
            error: error.message,
        });
    }
};

// Get a single customer account by account number
export const getCustomerAccountById = async (req, res) => {
    const { ACCT_NO } = req.params;
    try {
        const account = await CustomerAccount.findOne({ ACCT_NO });

        if (!account) {
            return res.status(404).json({
                message: 'Customer account not found',
            });
        }

        return res.status(200).json({
            message: 'Customer account retrieved successfully',
            account,
        });
    } catch (error) {
        console.error('Error fetching customer account:', error);
        return res.status(500).json({
            message: 'An error occurred while fetching the customer account',
            error: error.message,
        });
    }
};

// Update a customer account by account number
export const updateCustomerAccount = async (req, res) => {
    const { ACCT_NO } = req.params;
    const { 
        CUST_ID, 
        ACCT_NM,
        BU_ID,  
        PHONE_NUMBER, 
        LEDGER_BAL, 
        CLEARED_BAL, 
        AVAILABLE_BALANCE, 
        ACCOUNT_TYPE, 
        PRODUCT_DESC, 
        REC_ST 
    } = req.body;

    try {
        const updatedAccount = await CustomerAccount.findOneAndUpdate(
            { ACCT_NO },
            { 
                CUST_ID,
                ACCT_NM,
                BU_ID,  
                PHONE_NUMBER,
                LEDGER_BAL,
                CLEARED_BAL,
                AVAILABLE_BALANCE,
                ACCOUNT_TYPE,
                PRODUCT_DESC,
                REC_ST,
                UPDATED_AT: Date.now() // Auto update timestamp
            },
            { new: true } // Return the updated document
        );

        if (!updatedAccount) {
            return res.status(404).json({
                message: 'Customer account not found',
            });
        }

        return res.status(200).json({
            message: 'Customer account updated successfully',
            account: updatedAccount,
        });
    } catch (error) {
        console.error('Error updating customer account:', error);
        return res.status(500).json({
            message: 'An error occurred while updating the customer account',
            error: error.message,
        });
    }
};

// Delete a customer account by account number
export const deleteCustomerAccount = async (req, res) => {
    const { ACCT_NO } = req.params;
    try {
        const deletedAccount = await CustomerAccount.findOneAndDelete({ ACCT_NO });

        if (!deletedAccount) {
            return res.status(404).json({
                message: 'Customer account not found',
            });
        }

        return res.status(200).json({
            message: 'Customer account deleted successfully',
            account: deletedAccount,
        });
    } catch (error) {
        console.error('Error deleting customer account:', error);
        return res.status(500).json({
            message: 'An error occurred while deleting the customer account',
            error: error.message,
        });
    }
};
