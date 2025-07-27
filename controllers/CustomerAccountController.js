import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import Customer from '../models/Customer.js';
import logger from '../utils/logger.js';

export const createCustomerAccount = async (req, res) => {
  const customerAccounts = req.body;

  if (!Array.isArray(customerAccounts)) {
    return res.status(400).json({
      message: 'Request body must be an array of customer accounts.',
    });
  }

  try {
    const createdAccounts = [];
    const now = new Date();

    for (const accountData of customerAccounts) {
      const {
        ACCT_NO, ACCT_NM, BU_ID,
        LEDGER_BAL, CLEARED_BAL, AVAILABLE_BALANCE,
        ACCOUNT_TYPE, PRODUCT_DESC, REC_ST, CUST_ID
      } = accountData;

      // Validate required fields
      if (!CUST_ID) {
        return res.status(400).json({ 
          message: 'CUST_ID is required and cannot be null',
          account: ACCT_NO || 'new account'
        });
      }

      // Check if customer exists
      const customerExists = await Customer.exists({ CUST_ID });
      if (!customerExists) {
        return res.status(400).json({
          message: 'Customer does not exist',
          CUST_ID,
          account: ACCT_NO || 'new account'
        });
      }

      // Validate financial fields
      if (parseFloat(LEDGER_BAL) < 0 || parseFloat(CLEARED_BAL) < 0 || parseFloat(AVAILABLE_BALANCE) < 0) {
        return res.status(400).json({
          message: 'Balance values cannot be negative',
          account: ACCT_NO || 'new account'
        });
      }

      // Check available balance doesn't exceed ledger balance
      if (parseFloat(AVAILABLE_BALANCE) > parseFloat(LEDGER_BAL)) {
        return res.status(400).json({
          message: 'Available balance cannot exceed ledger balance',
          account: ACCT_NO || 'new account'
        });
      }

      // Check for duplicate account number
      if (ACCT_NO) {
        const existingAccount = await CustomerAccount.findOne({ ACCT_NO });
        if (existingAccount) {
          return res.status(400).json({
            message: 'Account already exists',
            reason: `The account number ${ACCT_NO} already exists.`,
          });
        }
      }

      // Create the new account
      const newCustomerAccount = new CustomerAccount({
        CUST_ID,
        ACCT_NM,
        BU_ID,
        LEDGER_BAL: parseFloat(LEDGER_BAL) || 0,
        CLEARED_BAL: parseFloat(CLEARED_BAL) || 0,
        AVAILABLE_BALANCE: parseFloat(AVAILABLE_BALANCE) || 0,
        ACCOUNT_TYPE: ACCOUNT_TYPE?.toUpperCase(),
        PRODUCT_DESC,
        REC_ST: REC_ST?.toUpperCase() || 'ACTIVE',
        lastActivityDate: now
      });

      // ACCT_NO and ACCT_ID will be auto-generated in pre-save hook
      const savedAccount = await newCustomerAccount.save();
      createdAccounts.push(savedAccount);

      // Audit trail
      const userId = req.user?.id || 'system';
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

      try {
        await AuditTrail.create({
          event_id: Date.now(),
          user_id: userId,
          event_type: 'CUSTOMER_ACCOUNT_CREATE',
          action: 'Create Account',
          old_value: null,
          new_value: savedAccount,
          ip_address: ipAddress,
          timestamp: now
        });
      } catch (auditError) {
        logger.error('Failed to create audit trail for account creation', {
          error: auditError.message,
          account: savedAccount.ACCT_NO,
          timestamp: now
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Customer accounts created successfully',
      count: createdAccounts.length,
      accounts: createdAccounts,
    });

  } catch (error) {
    logger.error('Error creating customer accounts:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date()
    });

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error',
        error: error.keyValue,
      });
    }

    return res.status(500).json({
      success: false,
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

export const getCustomerAccountById = async (req, res) => {
    const { ACCT_NO } = req.params;
    try {
        // Convert to string to match database type
        const account = await CustomerAccount.findOne({ ACCT_NO: ACCT_NO.toString() });

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
                UPDATED_AT: Date.now()
            },
            { new: true }
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

// ------------------------------
// Update dormant accounts by inactivity
const INACTIVITY_PERIOD_MONTHS = 6;

export const updateDormantAccounts = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - INACTIVITY_PERIOD_MONTHS);

    const accountsToDormant = await CustomerAccount.find({
      REC_ST: 'ACTIVE',
      lastActivityDate: { $lt: cutoffDate }
    });

    for (const account of accountsToDormant) {
      account.REC_ST = 'DORMANT';
      await account.save();
      console.log(`Account ${account.ACCT_NO} marked as DORMANT due to inactivity.`);
    }
  } catch (error) {
    console.error('Error updating dormant accounts:', error);
  }
};

// Get customer accounts by CUST_ID
export const getCustomerAccountByCUST_ID = async (req, res) => {
    const { CUST_ID } = req.params;
    
    try {
        // Find all accounts for the given customer ID
        const accounts = await CustomerAccount.find({ CUST_ID: CUST_ID.toString() });

        if (!accounts || accounts.length === 0) {
            return res.status(404).json({
                message: 'No accounts found for this customer ID',
                CUST_ID,
            });
        }

        // Get customer details if needed
        const customer = await Customer.findOne({ CUST_ID });
        
        return res.status(200).json({
            message: 'Customer accounts retrieved successfully',
            count: accounts.length,
            customer: customer || null,
            accounts,
        });
    } catch (error) {
        console.error('Error fetching customer accounts:', error);
        return res.status(500).json({
            message: 'An error occurred while fetching customer accounts',
            error: error.message,
        });
    }
};