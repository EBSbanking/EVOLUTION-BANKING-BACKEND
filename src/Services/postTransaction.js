// controllers/transactionController.js
import { Op } from 'sequelize';
import CustomerAccount from '../models/CustomerAccount.js';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import AuditTrail from '../models/AuditTrail.js';
import { initializeDrawerModel } from '../models/Drawer.js'; // Import initialization function
import logger from '../utils/logger.js';
import sequelize from '../../config/db.js';
import { DataTypes } from 'sequelize';
import {TransactionPolicy, TransactionPolicyRange, TransactionPolicyRole}  from '../models/TransactionPolicy.js';


// Initialize Drawer model - UPDATED with better error handling
let Drawer;
try {
  Drawer = initializeDrawerModel(sequelize); // Removed DataTypes parameter
  console.log('✅ Drawer model initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Drawer model:', error.message);
  // Don't throw error, just set Drawer to null and use fallback
  Drawer = null;
  console.log('⚠️ Will use fallback for drawer operations');
}

// Rest of your code remains the same...

const generateTransactionRef = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return `${datePart}${randomPart}`;
};

// FIXED: Generate event_id that fits in database column
const generateEventId = () => {
  // Use a shorter timestamp that fits in typical integer columns
  return Math.floor(Date.now() / 1000); // Convert to seconds instead of milliseconds
};

// Helper function to determine if transaction is cash-based
const isCashTransaction = (description) => {
  const nonCashKeywords = ['transfer', 'cheque', 'check', 'electronic', 'wire', 'ach', 'pos', 'card'];
  const desc = description.toLowerCase();
  return !nonCashKeywords.some(keyword => desc.includes(keyword));
};

// Helper function to calculate total from currency denominations
const calculateTotalFromCurrency = (currencyCount) => {
  if (!currencyCount) return 0;
  
  const denominations = {
    OneThousandNaira: 1000,
    FiveHundredNaira: 500,
    TwoHundredNaira: 200,
    OneHundredNaira: 100,
    FiftyNaira: 50,
    TwentyNaira: 20,
    TenNaira: 10,
    FiveNaira: 5
  };

  let total = 0;
  for (const [denom, value] of Object.entries(denominations)) {
    total += (parseInt(currencyCount[denom]) || 0) * value;
  }
  
  return total;
};

// UPDATED: Function to find account by account number
const findAccountByNumber = async (accountNumber, transaction = null) => {
  console.log(`🔍 Searching for account: ${accountNumber}`);
  
  const queryOptions = transaction ? { transaction } : {};

  try {
    // Try to find the account in customer_accounts table
    const [results] = await sequelize.query(
      `SELECT 
        id,
        customer_id,
        account_number,
        account_name, -- ADDED THIS: Query the account_name column
        status,
        account_type,
        available_balance,
        ledger_balance,
        cleared_balance,
        created_at,
        updated_at
      FROM customer_accounts 
      WHERE account_number = ? 
      LIMIT 1`,
      {
        replacements: [accountNumber],
        type: sequelize.QueryTypes.SELECT,
        ...queryOptions
      }
    );
    
    if (results) {
      console.log(`✅ Found account in CustomerAccount: ${results.account_number}`);
      
      // Check if account_name exists in the database result
      let accountName = results.account_name || `Customer ${results.customer_id}`;
      
      // If account_name is empty in DB, try to get customer name
      if (!results.account_name || results.account_name.trim() === '') {
        try {
          const [customer] = await sequelize.query(
            `SELECT FIRST_NAME, LAST_NAME FROM customers WHERE id = ? OR CUST_ID = ? LIMIT 1`,
            {
              replacements: [results.customer_id, results.customer_id],
              type: sequelize.QueryTypes.SELECT,
              ...queryOptions
            }
          );
          
          if (customer && (customer.FIRST_NAME || customer.LAST_NAME)) {
            accountName = `${customer.FIRST_NAME || ''} ${customer.LAST_NAME || ''}`.trim();
          }
        } catch (customerError) {
          console.log('⚠️ Could not fetch customer details:', customerError.message);
        }
      }
      
      return {
        model: 'CustomerAccount',
        data: results,
        accountNumber: results.account_number,
        accountName: accountName, // Now this will use the account_name from DB
        accountId: results.id,
        customerId: results.customer_id,
        ledgerBalance: parseFloat(results.ledger_balance?.toString() || '0'),
        availableBalance: parseFloat(results.available_balance?.toString() || '0'),
        clearedBalance: parseFloat(results.cleared_balance?.toString() || '0'),
        accountType: results.account_type || 'SAVINGS',
        status: results.status || 'ACTIVE',
        currencyId: 'NGN',
        productId: null,
        branch: null
      };
    }

    console.log(`❌ Account not found in customer_accounts: ${accountNumber}`);
    return null;
    
  } catch (error) {
    console.error('❌ Error searching for account:', error.message);
    return null;
  }
};

// UPDATED: Helper function to update account balances AND account name
const updateAccountBalances = async (accountInfo, newBalances, transaction, accountName = null) => {
  try {
    const { model, accountId, accountNumber } = accountInfo;
    
    console.log(`💰 Updating ${model} balances for account ${accountNumber}`);
    
    let query;
    let replacements;

    if (model === 'CustomerAccount') {
      if (accountName) {
        // Update both balances and account name
        query = `UPDATE customer_accounts 
                SET 
                  account_name = ?,
                  available_balance = ?,
                  ledger_balance = ?,
                  cleared_balance = ?,
                  updated_at = NOW()
                WHERE id = ?`;
        
        replacements = [
          accountName.trim(), // Add account name
          parseFloat(newBalances.availableBalance.toFixed(2)),
          parseFloat(newBalances.ledgerBalance.toFixed(2)),
          parseFloat(newBalances.clearedBalance.toFixed(2)),
          accountId
        ];
        
        console.log(`📝 Also updating account name to: ${accountName}`);
      } else {
        // Update only balances
        query = `UPDATE customer_accounts 
                SET 
                  available_balance = ?,
                  ledger_balance = ?,
                  cleared_balance = ?,
                  updated_at = NOW()
                WHERE id = ?`;
        
        replacements = [
          parseFloat(newBalances.availableBalance.toFixed(2)),
          parseFloat(newBalances.ledgerBalance.toFixed(2)),
          parseFloat(newBalances.clearedBalance.toFixed(2)),
          accountId
        ];
      }
      
      const [affectedRows] = await sequelize.query(query, {
        replacements,
        transaction
      });
      
      if (affectedRows[0] > 0) {
        console.log(`✅ Updated CustomerAccount ${accountNumber}`);
        return true;
      } else {
        console.warn(`⚠️ No rows affected when updating account ${accountNumber}`);
        return false;
      }
    }
    
    return false;
    
  } catch (error) {
    console.error('❌ Error updating account balances:', error.message);
    throw error;
  }
};

// Helper function to check policy
const checkPolicy = async (userRole, amount, transactionType, transaction) => {
  return {
    requiresApproval: false,
    authorizedRoles: ['TELLER', 'SUPERVISOR', 'MANAGER']
  };
};


// ==================== FIXED MAIN TRANSACTION FUNCTION ====================
// ==================== UPDATED: DRAWER LOGIC FIXED ====================
// Updated postTransaction function - COMPLETE VERSION with TransactionPolicy integration
export const postTransaction = async (req, res) => {
  console.log('📤 Transaction request received:', req.body);
  
  // Import sequelize and models
  const dbModule = await import('../../config/db.js');
  const sequelize = dbModule.default || dbModule;
  const { Op } = sequelize;
  
  // Check database connection
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection verified');
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: 'Database is not connected. Please try again later.',
    });
  }

  const {
    ACCT_NO,
    ACCT_NM,
    TRANSACTION_TYPE,
    AMOUNT,
    DESCRIPTION,
    REFERENCE_NO,
    TRANSACTION_DATE,
    BUSINESS_UNIT,
    DEPOSITOR_NAME,
    CURRENCY_COUNT,
    DRAWER_ID,
  } = req.body;

  // Helper functions (from your existing code)
  const isCashTransaction = (description) => {
    if (!description) return false;
    const cashKeywords = ['cash', 'CASH', 'currency', 'physical', 'drawer', 'teller', 'deposit', 'withdrawal'];
    return cashKeywords.some(keyword => description.toLowerCase().includes(keyword.toLowerCase()));
  };

  const calculateTotalFromCurrency = (currencyCount) => {
    return (currencyCount.OneThousandNaira * 1000) +
           (currencyCount.FiveHundredNaira * 500) +
           (currencyCount.TwoHundredNaira * 200) +
           (currencyCount.OneHundredNaira * 100) +
           (currencyCount.FiftyNaira * 50) +
           (currencyCount.TwentyNaira * 20) +
           (currencyCount.TenNaira * 10) +
           (currencyCount.FiveNaira * 5);
  };

  const generateTransactionRef = () => {
    return `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
  };

  const generateEventId = () => {
    return Math.floor(Date.now() / 1000);
  };

  let sanitizedCurrencyCount = {
    OneThousandNaira: 0,
    FiveHundredNaira: 0,
    TwoHundredNaira: 0,
    OneHundredNaira: 0,
    FiftyNaira: 0,
    TwentyNaira: 0,
    TenNaira: 0,
    FiveNaira: 0,
    TOTAL_CURRENCY_COUNT: 0,
  };

  const transaction = await sequelize.transaction();
  
  try {
    // Input validation
    if (!TRANSACTION_TYPE || !AMOUNT || !DESCRIPTION || !BUSINESS_UNIT) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'TRANSACTION_TYPE, AMOUNT, DESCRIPTION, and BUSINESS_UNIT are required.',
      });
    }

    const isOpeningCashDeposit = TRANSACTION_TYPE.toUpperCase() === 'OPENING_CASH_DEPOSIT';
    const amount = parseFloat(AMOUNT);
    
    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'AMOUNT must be a positive number.' 
      });
    }

    // Validate transaction type
    const validTransactionTypes = ['DR', 'CR', 'OPENING_CASH_DEPOSIT'];
    const normalizedTransactionType = TRANSACTION_TYPE.toUpperCase();
    if (!validTransactionTypes.includes(normalizedTransactionType)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `TRANSACTION_TYPE must be one of ${validTransactionTypes.join(', ')}.`,
      });
    }

    // Validate account for non-opening deposits
    if (!isOpeningCashDeposit && !ACCT_NO) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'ACCT_NO is required for standard transactions.',
      });
    }

    // ========== CRITICAL FIX: FORCE CASH TRANSACTION DETECTION ==========
    let cashTransaction = false;
    let isCashDeposit = false;
    let isCashWithdrawal = false;
    
    // RULE 1: If CURRENCY_COUNT is provided, it MUST be a cash transaction
    if (CURRENCY_COUNT && Object.values(CURRENCY_COUNT).some(val => val > 0)) {
      cashTransaction = true;
      console.log('💰 FORCING cash transaction because CURRENCY_COUNT provided');
      
      if (!DRAWER_ID) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'DRAWER_ID is REQUIRED when CURRENCY_COUNT is provided (cash transaction).',
        });
      }
    }
    
    // RULE 2: If DRAWER_ID provided, it's a cash transaction
    else if (DRAWER_ID) {
      cashTransaction = true;
      console.log('💰 FORCING cash transaction because DRAWER_ID provided');
    }
    
    // RULE 3: Opening deposits are always cash
    if (isOpeningCashDeposit) {
      cashTransaction = true;
      isCashDeposit = true;
      console.log('💰 Transaction identified as OPENING CASH DEPOSIT');
      
      if (!DRAWER_ID) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'DRAWER_ID is REQUIRED for opening cash deposits.',
        });
      }
    }
    
    // RULE 4: Determine cash deposit vs withdrawal
    if (cashTransaction) {
      if (normalizedTransactionType === 'CR') {
        isCashDeposit = true;
        console.log('💰 Transaction identified as CASH DEPOSIT');
      } else if (normalizedTransactionType === 'DR') {
        isCashWithdrawal = true;
        console.log('💸 Transaction identified as CASH WITHDRAWAL');
      }
    }

    // ========== ENHANCED DRAWER LOOKUP WITH STRICT VALIDATION ==========
    let drawer = null;
    let drawerPreviousBalance = 0;
    let drawerNewBalance = 0;
    let drawerTransactionEffect = '';
    
    if (cashTransaction) {
      if (!DRAWER_ID) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'DRAWER_ID is REQUIRED for cash transactions.',
        });
      }

      console.log(`🔍 Searching for drawer with ID: "${DRAWER_ID}"`);
      
      // Try to find drawer using multiple patterns
      const { Drawer } = sequelize.models;
      
      // Try multiple search patterns
      const searchPatterns = [
        { DRAWER_NO: DRAWER_ID.toString() },              // Exact match
        { DRAWER_NO: DRAWER_ID.toString().padStart(4, '0') }, // Pad to 4 digits
        { DRAWER_NO: DRAWER_ID.toString().padStart(3, '0') }, // Pad to 3 digits
        { DRAWER_ID: parseInt(DRAWER_ID) || 0 },          // Numeric DRAWER_ID
        { id: parseInt(DRAWER_ID) || 0 }                  // Primary key
      ];
      
      // Try each pattern
      for (const pattern of searchPatterns) {
        drawer = await Drawer.findOne({
          where: {
            ...pattern,
            REC_ST: 'A' // Only active drawers
          },
          transaction
        });
        
        if (drawer) {
          console.log(`✅ Drawer found using pattern:`, pattern);
          break;
        }
      }
      
      if (!drawer) {
        // Get list of available drawers for helpful error
        const allDrawers = await Drawer.findAll({
          attributes: ['DRAWER_NO', 'DRAWER_ID', 'WF_STATUS', 'DRAWER_NM', 'CURRENT_BALANCE'],
          where: { REC_ST: 'A' },
          limit: 10,
          transaction
        });
        
        await transaction.rollback();
        return res.status(404).json({ 
          success: false,
          message: `Active drawer not found for ID: "${DRAWER_ID}".`,
          availableDrawers: allDrawers.map(d => ({
            DRAWER_NO: d.DRAWER_NO,
            DRAWER_ID: d.DRAWER_ID,
            name: d.DRAWER_NM,
            status: d.WF_STATUS,
            balance: `₦${parseFloat(d.CURRENT_BALANCE || 0).toFixed(2)}`
          })),
          attemptedSearches: searchPatterns.map(p => JSON.stringify(p)),
          hint: `Your drawer in database has DRAWER_NO: "1001". Try using DRAWER_ID: "1001" instead of "${DRAWER_ID}"`
        });
      }
      
      // ========== STRICT DRAWER STATUS VALIDATION ==========
      console.log(`🔍 Drawer found: ${drawer.DRAWER_NO} (${drawer.DRAWER_NM}) - Status: ${drawer.WF_STATUS}`);
      
      // CRITICAL: Reject if drawer is CLOSED
      if (drawer.WF_STATUS !== 'OPEN') {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false,
          message: `Drawer ${drawer.DRAWER_NO} (${drawer.DRAWER_NM}) is ${drawer.WF_STATUS}. Cannot process cash transactions.`,
          drawerNumber: drawer.DRAWER_NO,
          drawerName: drawer.DRAWER_NM,
          currentStatus: drawer.WF_STATUS,
          lastClosed: drawer.LAST_DRAWER_CLOSE_DT,
          lastOpened: drawer.LAST_DRAWER_OPEN_DT,
          currentBalance: `₦${parseFloat(drawer.CURRENT_BALANCE || 0).toFixed(2)}`,
          actionRequired: 'Open the drawer first using the drawer management system before processing cash transactions.'
        });
      }

      // Validate drawer for transaction
      drawerPreviousBalance = parseFloat(drawer.CURRENT_BALANCE?.toString() || '0');
      
      // Check sufficient balance for withdrawals
      if (isCashWithdrawal && drawerPreviousBalance < amount) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false,
          message: `Insufficient drawer balance for cash withdrawal. Available: ₦${drawerPreviousBalance.toFixed(2)}, Required: ₦${amount.toFixed(2)}`,
          drawerNumber: drawer.DRAWER_NO,
          drawerName: drawer.DRAWER_NM,
          currentBalance: `₦${drawerPreviousBalance.toFixed(2)}`,
          requiredAmount: `₦${amount.toFixed(2)}`,
          shortfall: `₦${(amount - drawerPreviousBalance).toFixed(2)}`,
          actionRequired: 'Fund the drawer first or reduce withdrawal amount.'
        });
      }

      // Calculate new balance
      if (isOpeningCashDeposit || isCashDeposit) {
        drawerNewBalance = drawerPreviousBalance + amount;
      } else if (isCashWithdrawal) {
        drawerNewBalance = drawerPreviousBalance - amount;
      }
      
      // Set transaction effect
      if (isOpeningCashDeposit) {
        drawerTransactionEffect = 'OPENING_DEPOSIT';
        console.log(`📈 Opening deposit: ₦${amount.toFixed(2)} added to drawer`);
      } else if (isCashDeposit) {
        drawerTransactionEffect = 'CASH_DEPOSIT';
        console.log(`📈 Cash deposit: ₦${amount.toFixed(2)} added to drawer`);
      } else if (isCashWithdrawal) {
        drawerTransactionEffect = 'CASH_WITHDRAWAL';
        console.log(`📉 Cash withdrawal: ₦${amount.toFixed(2)} deducted from drawer`);
      }

      // Check drawer limits
      const minBalance = parseFloat(drawer.MIN_BAL) || 0;
      const maxBalance = parseFloat(drawer.MAX_BAL) || 999999999;
      
      if (drawerNewBalance > maxBalance || drawerNewBalance < minBalance) {
        console.log(`⚠️ Drawer limit exceeded! New balance: ₦${drawerNewBalance.toFixed(2)} (Min: ₦${minBalance}, Max: ₦${maxBalance})`);
      }

      console.log(`✅ Drawer validated: ${drawer.DRAWER_NO} - Balance: ₦${drawerPreviousBalance.toFixed(2)} → ₦${drawerNewBalance.toFixed(2)}`);
    }

    // ========== ACCOUNT HANDLING ==========
    let accountInfo = null;
    let ledgerBal = 0;
    let availableBal = 0;
    let clearedBal = 0;
    let requiresApproval = false;
    let authorizedRoles = [];
    let status = 'SUCCESS';

    if (!isOpeningCashDeposit && ACCT_NO) {
      // Validate account number format
      if (!/^\d{10}$/.test(ACCT_NO)) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false, 
          message: 'ACCT_NO must be a 10-digit number.' 
        });
      }

      // Find account by number - FIXED: Handle array result properly
      const accountResults = await sequelize.query(
        `SELECT * FROM customer_accounts WHERE account_number = ? LIMIT 1`,
        {
          replacements: [ACCT_NO],
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );
      
      // Check if we got results
      if (!accountResults || accountResults.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ 
          success: false, 
          message: `Account ${ACCT_NO} not found.` 
        });
      }

      // Get the first (and should be only) result
      accountInfo = accountResults[0];
      console.log(`✅ Account found: ${accountInfo.account_number} - ${accountInfo.account_name}`);

      // Update account name if provided
      if (ACCT_NM && ACCT_NM.trim() !== '' && ACCT_NM !== accountInfo.account_name) {
        console.log(`📝 Updating account name from "${accountInfo.account_name}" to "${ACCT_NM}"`);
        
        try {
          await sequelize.query(
            `UPDATE customer_accounts 
            SET account_name = ?, updated_at = NOW()
            WHERE account_number = ?`,
            {
              replacements: [ACCT_NM.trim(), ACCT_NO],
              transaction
            }
          );
          
          accountInfo.account_name = ACCT_NM;
          console.log(`✅ Account name updated in database`);
        } catch (nameError) {
          console.error('❌ Error updating account name:', nameError.message);
        }
      }

      // Check account status
      const activeStatuses = ['ACTIVE', 'Active', 'A', 'APPROVED', 'Approved'];
      if (!activeStatuses.includes(accountInfo.status)) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false, 
          message: `Account ${ACCT_NO} is not active. Current status: ${accountInfo.status}` 
        });
      }

      // Restrict DR on FD/LOAN accounts
      const isDebit = normalizedTransactionType === 'DR';
      const restrictedTypes = ['FIXED_DEPOSIT', 'LOAN', 'fixed_deposit', 'loan'];
      if (isDebit && restrictedTypes.includes(accountInfo.account_type)) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false, 
          message: `Debit not allowed for ${accountInfo.account_type} accounts.` 
        });
      }

      // ========== TRANSACTION POLICY CHECK ==========
      const userRole = (req.user?.role || req.headers['x-user-role'] || 'DEFAULT').toUpperCase();
      const policyType = isDebit ? 'Withdrawal' : 'Deposit';
      
      // Import TransactionPolicy model
      const { TransactionPolicy } = sequelize.models;
      
      if (!TransactionPolicy) {
        console.error('❌ TransactionPolicy model not found in sequelize.models');
        await transaction.rollback();
        return res.status(500).json({
          success: false,
          message: 'Transaction policy system not configured properly.'
        });
      }
      
      try {
        const policyCheck = await TransactionPolicy.checkRequiresApproval(
          policyType,
          userRole,
          amount,
          BUSINESS_UNIT || null,
          null // branch_code
        );
        
        console.log('🔍 Transaction Policy Check Result:', {
          policyType,
          userRole,
          amount,
          businessUnit: BUSINESS_UNIT,
          requiresApproval: policyCheck.requiresApproval,
          authorizedRoles: policyCheck.authorizedRoles
        });
        
        requiresApproval = policyCheck.requiresApproval;
        authorizedRoles = policyCheck.authorizedRoles || [];
        status = requiresApproval ? 'PENDING' : 'SUCCESS';
        
        if (policyCheck.policy) {
          console.log(`✅ Policy applied: ${policyCheck.policy.POLICY_ID} (${policyType} for ${userRole})`);
        } else {
          console.log(`ℹ️ No specific policy found for ${policyType} by ${userRole}, using defaults`);
        }
        
      } catch (policyError) {
        console.error('❌ Transaction policy check error:', policyError);
        requiresApproval = false;
        authorizedRoles = [];
        status = 'SUCCESS';
        console.log('⚠️ Using default transaction approval (no policy check)');
      }

      // Get current balances
      ledgerBal = parseFloat(accountInfo.ledger_balance) || 0;
      availableBal = parseFloat(accountInfo.available_balance) || 0;
      clearedBal = parseFloat(accountInfo.cleared_balance) || 0;

      console.log(`💰 Current balances for ${ACCT_NO}:`, {
        ledger: ledgerBal.toFixed(2),
        available: availableBal.toFixed(2),
        cleared: clearedBal.toFixed(2)
      });

      // Update balances based on transaction type
      if (isDebit) {
        // Check if account has sufficient available balance
        if (availableBal < amount) {
          await transaction.rollback();
          return res.status(400).json({ 
            success: false, 
            message: `Insufficient available balance. Available: ₦${availableBal.toFixed(2)}, Required: ₦${amount.toFixed(2)}` 
          });
        }
        
        // Debit transaction: reduce all balances
        ledgerBal -= amount;
        availableBal -= amount;
        clearedBal -= amount;
        
        console.log(`💸 DEBIT: Deducting ₦${amount.toFixed(2)} from all balances`);
      } else {
        // Credit transaction: add to all balances
        ledgerBal += amount;
        availableBal += amount;
        clearedBal += amount;
        
        console.log(`💰 CREDIT: Adding ₦${amount.toFixed(2)} to all balances`);
      }

      // Update account balances in database
      await sequelize.query(
        `UPDATE customer_accounts 
         SET ledger_balance = ?, 
             available_balance = ?, 
             cleared_balance = ?,
             updated_at = NOW()
         WHERE account_number = ?`,
        {
          replacements: [
            ledgerBal.toFixed(2),
            availableBal.toFixed(2),
            clearedBal.toFixed(2),
            ACCT_NO
          ],
          transaction
        }
      );

      console.log(`✅ Account ${ACCT_NO} balances updated`);
    }

    // ========== CURRENCY COUNT VALIDATION ==========
    const currencyCount = CURRENCY_COUNT || {
      OneThousandNaira: 0,
      FiveHundredNaira: 0,
      TwoHundredNaira: 0,
      OneHundredNaira: 0,
      FiftyNaira: 0,
      TwentyNaira: 0,
      TenNaira: 0,
      FiveNaira: 0,
      TOTAL_CURRENCY_COUNT: 0,
    };

    const expectedKeys = [
      'OneThousandNaira', 'FiveHundredNaira', 'TwoHundredNaira',
      'OneHundredNaira', 'FiftyNaira', 'TwentyNaira', 'TenNaira',
      'FiveNaira', 'TOTAL_CURRENCY_COUNT',
    ];
    
    const isValid = expectedKeys.every(
      (key) => key in currencyCount && !isNaN(parseInt(currencyCount[key])) && parseInt(currencyCount[key]) >= 0
    );
    
    if (!isValid) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid CURRENCY_COUNT format.' });
    }

    sanitizedCurrencyCount = {
      OneThousandNaira: parseInt(currencyCount.OneThousandNaira) || 0,
      FiveHundredNaira: parseInt(currencyCount.FiveHundredNaira) || 0,
      TwoHundredNaira: parseInt(currencyCount.TwoHundredNaira) || 0,
      OneHundredNaira: parseInt(currencyCount.OneHundredNaira) || 0,
      FiftyNaira: parseInt(currencyCount.FiftyNaira) || 0,
      TwentyNaira: parseInt(currencyCount.TwentyNaira) || 0,
      TenNaira: parseInt(currencyCount.TenNaira) || 0,
      FiveNaira: parseInt(currencyCount.FiveNaira) || 0,
      TOTAL_CURRENCY_COUNT: parseInt(currencyCount.TOTAL_CURRENCY_COUNT) || 0,
    };

    // For cash transactions, validate currency count matches amount
    if (cashTransaction) {
      const calculatedAmount = calculateTotalFromCurrency(currencyCount);
      if (calculatedAmount !== amount) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Currency count total (${calculatedAmount}) does not match transaction amount (${amount}).`,
          calculatedAmount,
          transactionAmount: amount
        });
      }
    }

    // ========== UPDATE DRAWER BALANCE ==========
    if (cashTransaction && drawer) {
      // Update drawer balance in database
      await sequelize.query(
        `UPDATE drawers SET 
         CURRENT_BALANCE = ?, 
         VERSION_NO = COALESCE(VERSION_NO, 0) + 1,
         updated_at = NOW()
         WHERE id = ?`,
        {
          replacements: [drawerNewBalance.toFixed(2), drawer.id],
          transaction
        }
      );

      console.log(`💰 Drawer ${drawer.DRAWER_NO} updated: ₦${drawerPreviousBalance.toFixed(2)} → ₦${drawerNewBalance.toFixed(2)}`);
    }

    // ========== CREATE AUDIT TRAIL ==========
    const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const referenceNo = REFERENCE_NO || generateTransactionRef();
    const eventId = generateEventId();

    const auditData = {
      event_id: eventId,
      user_id: userId,
      event_type: isOpeningCashDeposit ? 'OPENING_CASH_DEPOSIT' : `TRANSACTION_${normalizedTransactionType}`,
      action: isOpeningCashDeposit ? 'Opening Cash Deposit' : `${normalizedTransactionType === 'DR' ? 'Debit' : 'Credit'} Transaction`,
      old_value: JSON.stringify({
        ...(accountInfo && {
          LEDGER_BAL: accountInfo.ledger_balance,
          AVAILABLE_BALANCE: accountInfo.available_balance,
          CLEARED_BAL: accountInfo.cleared_balance,
          ACCOUNT_NAME: accountInfo.account_name
        }),
        ...(cashTransaction && drawer && { 
          DRAWER_BALANCE: drawerPreviousBalance,
          DRAWER_NO: drawer.DRAWER_NO || drawer.DRAWER_NM
        })
      }),
      new_value: JSON.stringify({ 
        ...(accountInfo && {
          LEDGER_BAL: ledgerBal.toFixed(2), 
          AVAILABLE_BALANCE: availableBal.toFixed(2), 
          CLEARED_BAL: clearedBal.toFixed(2),
          ACCOUNT_NAME: accountInfo.account_name
        }),
        ...(cashTransaction && drawer && { 
          DRAWER_BALANCE: drawerNewBalance.toFixed(2),
          DRAWER_NO: drawer.DRAWER_NO || drawer.DRAWER_NM
        })
      }),
      ip_address: ipAddress,
      timestamp: transactionDate,
      entity_type: isOpeningCashDeposit ? 'Drawer' : 'CustomerAccount',
      entity_id: isOpeningCashDeposit ? drawer.id : (accountInfo ? accountInfo.id : null),
      status,
      description: DESCRIPTION,
      reference_no: referenceNo,
      account_no: ACCT_NO || null,
      additional_info: JSON.stringify({
        amount: amount.toFixed(2),
        pending: requiresApproval,
        account_name: accountInfo ? accountInfo.account_name : null,
        transaction_date: transactionDate,
        business_unit: BUSINESS_UNIT,
        depositor_name: DEPOSITOR_NAME,
        currency_count: sanitizedCurrencyCount,
        authorized_roles: authorizedRoles,
        transaction_mode: cashTransaction ? 'CASH' : 'TRANSFER',
        transaction_type: normalizedTransactionType,
        policy_applied: authorizedRoles.length > 0 ? 'YES' : 'NO',
        approval_required: requiresApproval,
        balance_changes: accountInfo ? {
          ledger_balance_change: (normalizedTransactionType === 'DR' ? -amount : amount).toFixed(2),
          available_balance_change: (normalizedTransactionType === 'DR' ? -amount : amount).toFixed(2),
          cleared_balance_change: (normalizedTransactionType === 'DR' ? -amount : amount).toFixed(2)
        } : null,
        ...(cashTransaction && drawer && {
          drawer_id: drawer.id,
          drawer_no: drawer.DRAWER_NO || drawer.DRAWER_NM,
          drawer_name: drawer.DRAWER_NM,
          drawer_effect: drawerTransactionEffect,
          previous_drawer_balance: drawerPreviousBalance,
          new_drawer_balance: drawerNewBalance,
          drawer_user_id: drawer.USER_ID || drawer.CURRENT_ASSIGNEE_ID,
          drawer_status: drawer.WF_STATUS,
          cash_movement: isCashDeposit ? 'INCOMING' : (isCashWithdrawal ? 'OUTGOING' : 'OPENING')
        })
      }),
    };

    // Create audit trail record
    const { AuditTrail } = sequelize.models;
    await AuditTrail.create(auditData, { transaction });
    console.log('✅ Audit trail created');

    // ========== COMMIT TRANSACTION ==========
    await transaction.commit();
    
    // ========== RESPONSE ==========
    const response = {
      success: true,
      message: isOpeningCashDeposit 
        ? `Opening cash deposit of ₦${amount.toFixed(2)} posted successfully to drawer.` 
        : `${normalizedTransactionType === 'DR' ? 'Debit' : 'Credit'} transaction ${requiresApproval ? 'pending approval' : 'posted'} successfully.`,
      reference_no: referenceNo,
      transaction_date: transactionDate,
      business_unit: BUSINESS_UNIT,
      depositor_name: DEPOSITOR_NAME,
      currency_count: sanitizedCurrencyCount,
      pending: requiresApproval,
      authorized_roles: authorizedRoles,
      transaction_mode: cashTransaction ? 'CASH' : 'TRANSFER',
      transaction_type: normalizedTransactionType,
      policy_applied: authorizedRoles.length > 0
    };

    // Add account info for standard transactions
    if (!isOpeningCashDeposit && accountInfo) {
      response.account = {
        ACCT_NO: accountInfo.account_number,
        ACCT_NM: accountInfo.account_name,
        ACCOUNT_TYPE: accountInfo.account_type,
        new_balances: {
          ledger_balance: ledgerBal.toFixed(2),
          available_balance: availableBal.toFixed(2),
          cleared_balance: clearedBal.toFixed(2)
        },
        balance_changes: {
          ledger_balance_change: (normalizedTransactionType === 'DR' ? -amount : amount).toFixed(2),
          available_balance_change: (normalizedTransactionType === 'DR' ? -amount : amount).toFixed(2),
          cleared_balance_change: (normalizedTransactionType === 'DR' ? -amount : amount).toFixed(2)
        }
      };
    }

    // Add drawer info to response if cash transaction
    if (cashTransaction && drawer) {
      response.drawer = {
        drawer_id: drawer.id,
        drawer_no: drawer.DRAWER_NO || drawer.DRAWER_NM,
        drawer_name: drawer.DRAWER_NM,
        previous_balance: drawerPreviousBalance.toFixed(2),
        new_balance: drawerNewBalance.toFixed(2),
        effect: drawerTransactionEffect,
        cash_movement: isCashDeposit ? 'INCOMING' : (isCashWithdrawal ? 'OUTGOING' : 'OPENING'),
        user_id: drawer.USER_ID || drawer.CURRENT_ASSIGNEE_ID,
        status: drawer.WF_STATUS,
        limit_exceeded: drawerNewBalance > parseFloat(drawer.MAX_BAL) || drawerNewBalance < parseFloat(drawer.MIN_BAL)
      };
    }

    console.log(`🎉 Transaction COMPLETED with drawer sync`);
    console.log(`💰 Final drawer balance: ${drawer ? drawer.DRAWER_NO + ' = ₦' + drawerNewBalance.toFixed(2) : 'N/A'}`);

    return res.status(200).json(response);

  } catch (error) {
    await transaction.rollback();
    
    console.error('💥 Transaction error:', error);
    console.error('💥 Stack trace:', error.stack);

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Duplicate transaction reference.',
        error: error.errors.map(e => e.message),
      });
    }
    
    if (error.message.includes('event_id') || error.message.includes('Out of range')) {
      return res.status(500).json({
        success: false,
        message: 'Database configuration error.',
        error: error.message,
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'An error occurred while posting the transaction.',
      error: error.message,
    });
  }
};

// Get transactions by account number with current balances
export const getTransactionsByAccount = async (req, res) => {
  try {
    const { accountNo } = req.params;
    const { startDate, endDate, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    // First, get current account balances from customer_accounts table
    const [accountDetails] = await sequelize.query(`
      SELECT 
        id,
        customer_id,
        account_number,
        status,
        account_type,
        available_balance,
        ledger_balance,
        cleared_balance,
        created_at,
        updated_at
      FROM customer_accounts 
      WHERE account_number = ?
      LIMIT 1
    `, {
      replacements: [accountNo]
    });
    
    if (!accountDetails || accountDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Account ${accountNo} not found in customer_accounts table.`
      });
    }
    
    const accountInfo = accountDetails[0];
    
    // Get customer info
    let customerInfo = null;
    try {
      const [customerData] = await sequelize.query(`
        SELECT 
          id,
          CUST_ID,
          FIRST_NAME,
          LAST_NAME,
          FULL_NAME,
          EMAIL,
          PHONE
        FROM customers 
        WHERE id = ? OR CUST_ID = ?
        LIMIT 1
      `, {
        replacements: [accountInfo.customer_id, accountInfo.customer_id]
      });
      
      if (customerData && customerData.length > 0) {
        customerInfo = {
          customer_id: customerData[0].id || customerData[0].CUST_ID,
          cust_id: customerData[0].CUST_ID,
          first_name: customerData[0].FIRST_NAME,
          last_name: customerData[0].LAST_NAME,
          full_name: customerData[0].FULL_NAME,
          email: customerData[0].EMAIL,
          phone: customerData[0].PHONE
        };
      }
    } catch (customerError) {
      console.log('⚠️ Could not fetch customer info:', customerError.message);
    }
    
    // Now get transaction history
    const whereClause = { account_no: accountNo };
    
    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp[Op.gte] = new Date(startDate);
      if (endDate) whereClause.timestamp[Op.lte] = new Date(endDate);
    }
    
    const { count, rows } = await AuditTrail.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['timestamp', 'DESC']]
    });
    
    // Calculate statistics from transactions
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let lastTransactionDate = null;
    
    if (rows.length > 0) {
      lastTransactionDate = rows[0].timestamp;
      
      // Calculate totals from transaction history
      rows.forEach(transaction => {
        try {
          const additionalInfo = JSON.parse(transaction.additional_info || '{}');
          const amount = parseFloat(additionalInfo.amount || 0);
          const transactionType = additionalInfo.transaction_type || '';
          
          if (transactionType === 'CR' || transaction.event_type.includes('CREDIT')) {
            totalDeposits += amount;
          } else if (transactionType === 'DR' || transaction.event_type.includes('DEBIT')) {
            totalWithdrawals += amount;
          }
        } catch (e) {
          console.log('Error parsing transaction data:', e.message);
        }
      });
    }
    
    return res.status(200).json({
      success: true,
      account_summary: {
        account_number: accountInfo.account_number,
        account_type: accountInfo.account_type,
        status: accountInfo.status,
        current_balances: {
          available_balance: parseFloat(accountInfo.available_balance).toFixed(2),
          ledger_balance: parseFloat(accountInfo.ledger_balance).toFixed(2),
          cleared_balance: parseFloat(accountInfo.cleared_balance).toFixed(2)
        },
        customer_info: customerInfo,
        account_created: accountInfo.created_at,
        last_updated: accountInfo.updated_at
      },
      transaction_statistics: {
        total_transactions: count,
        total_deposits: totalDeposits.toFixed(2),
        total_withdrawals: totalWithdrawals.toFixed(2),
        net_flow: (totalDeposits - totalWithdrawals).toFixed(2),
        last_transaction_date: lastTransactionDate
      },
      transactions: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
    
  } catch (error) {
    logger.error('Error fetching transactions by account:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching transactions by account',
      error: error.message
    });
  }
};

// Get account balance only (for quick check)
export const getAccountBalance = async (req, res) => {
  try {
    const { accountNo } = req.params;
    
    const [accountDetails] = await sequelize.query(`
      SELECT 
        account_number,
        status,
        account_type,
        available_balance,
        ledger_balance,
        cleared_balance,
        created_at,
        updated_at
      FROM customer_accounts 
      WHERE account_number = ?
      LIMIT 1
    `, {
      replacements: [accountNo]
    });
    
    if (!accountDetails || accountDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Account ${accountNo} not found.`
      });
    }
    
    const accountInfo = accountDetails[0];
    
    // Get last 5 transactions
    const recentTransactions = await AuditTrail.findAll({
      where: { account_no: accountNo },
      limit: 5,
      order: [['timestamp', 'DESC']],
      attributes: ['event_type', 'description', 'timestamp', 'reference_no', 'additional_info']
    });
    
    // Parse transaction details
    const formattedTransactions = recentTransactions.map(tx => {
      let additionalInfo = {};
      try {
        additionalInfo = JSON.parse(tx.additional_info || '{}');
      } catch (e) {
        // ignore parsing errors
      }
      
      return {
        reference_no: tx.reference_no,
        type: tx.event_type,
        description: tx.description,
        amount: additionalInfo.amount || '0.00',
        date: tx.timestamp,
        status: tx.status || 'SUCCESS'
      };
    });
    
    return res.status(200).json({
      success: true,
      account_number: accountInfo.account_number,
      account_type: accountInfo.account_type,
      status: accountInfo.status,
      balances: {
        available: parseFloat(accountInfo.available_balance).toFixed(2),
        ledger: parseFloat(accountInfo.ledger_balance).toFixed(2),
        cleared: parseFloat(accountInfo.cleared_balance).toFixed(2)
      },
      last_updated: accountInfo.updated_at,
      account_created: accountInfo.created_at,
      recent_transactions: formattedTransactions
    });
    
  } catch (error) {
    logger.error('Error fetching account balance:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching account balance',
      error: error.message
    });
  }
};

// Get transaction history with account balance summary
export const getTransactionHistory = async (req, res) => {
  try {
    const { 
      accountNo, 
      startDate, 
      endDate, 
      transactionType, 
      status,
      page = 1,
      limit = 50
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    const whereClause = {};
    
    if (accountNo) {
      whereClause.account_no = accountNo;
    }
    
    if (transactionType) {
      whereClause.event_type = { [Op.like]: `%${transactionType}%` };
    }
    
    if (status) {
      whereClause.status = status;
    }
    
    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp[Op.gte] = new Date(startDate);
      if (endDate) whereClause.timestamp[Op.lte] = new Date(endDate);
    }
    
    const { count, rows } = await AuditTrail.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['timestamp', 'DESC']]
    });
    
    // Get account balance if accountNo is provided
    let accountBalance = null;
    if (accountNo) {
      try {
        const [accountDetails] = await sequelize.query(`
          SELECT 
            available_balance,
            ledger_balance,
            cleared_balance,
            status
          FROM customer_accounts 
          WHERE account_number = ?
          LIMIT 1
        `, {
          replacements: [accountNo]
        });
        
        if (accountDetails && accountDetails.length > 0) {
          accountBalance = {
            available: parseFloat(accountDetails[0].available_balance).toFixed(2),
            ledger: parseFloat(accountDetails[0].ledger_balance).toFixed(2),
            cleared: parseFloat(accountDetails[0].cleared_balance).toFixed(2),
            status: accountDetails[0].status
          };
        }
      } catch (balanceError) {
        console.log('⚠️ Could not fetch account balance:', balanceError.message);
      }
    }
    
    // Calculate transaction statistics
    let totalAmount = 0;
    let depositCount = 0;
    let withdrawalCount = 0;
    
    rows.forEach(transaction => {
      try {
        const additionalInfo = JSON.parse(transaction.additional_info || '{}');
        const amount = parseFloat(additionalInfo.amount || 0);
        
        if (!isNaN(amount)) {
          totalAmount += amount;
          
          if (transaction.event_type.includes('CREDIT') || additionalInfo.transaction_type === 'CR') {
            depositCount++;
          } else if (transaction.event_type.includes('DEBIT') || additionalInfo.transaction_type === 'DR') {
            withdrawalCount++;
          }
        }
      } catch (e) {
        // ignore parsing errors
      }
    });
    
    return res.status(200).json({
      success: true,
      account_balance: accountBalance,
      transaction_statistics: {
        total_transactions: count,
        total_amount: totalAmount.toFixed(2),
        deposit_count: depositCount,
        withdrawal_count: withdrawalCount,
        average_transaction: count > 0 ? (totalAmount / count).toFixed(2) : '0.00'
      },
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
    
  } catch (error) {
    logger.error('Error fetching transaction history:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching transaction history',
      error: error.message
    });
  }
};

// Get customer accounts with balances
export const getCustomerAccounts = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    // Get customer info
    const [customerInfo] = await sequelize.query(`
      SELECT 
        id,
        CUST_ID,
        FIRST_NAME,
        LAST_NAME,
        FULL_NAME,
        EMAIL,
        PHONE,
        ADDRESS,
        STATUS
      FROM customers 
      WHERE id = ? OR CUST_ID = ?
      LIMIT 1
    `, {
      replacements: [customerId, customerId]
    });
    
    if (!customerInfo || customerInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found.'
      });
    }
    
    const customer = customerInfo[0];
    
    // Get all accounts for this customer
    const [accounts] = await sequelize.query(`
      SELECT 
        ca.id,
        ca.account_number,
        ca.account_type,
        ca.status,
        ca.available_balance,
        ca.ledger_balance,
        ca.cleared_balance,
        ca.created_at,
        ca.updated_at
      FROM customer_accounts ca
      WHERE ca.customer_id = ? OR ca.customer_id = ?
      ORDER BY ca.created_at DESC
    `, {
      replacements: [customer.id, customer.CUST_ID]
    });
    
    // Calculate total balances
    let totalAvailable = 0;
    let totalLedger = 0;
    let totalCleared = 0;
    
    accounts.forEach(account => {
      totalAvailable += parseFloat(account.available_balance || 0);
      totalLedger += parseFloat(account.ledger_balance || 0);
      totalCleared += parseFloat(account.cleared_balance || 0);
    });
    
    return res.status(200).json({
      success: true,
      customer_info: {
        customer_id: customer.id,
        cust_id: customer.CUST_ID,
        full_name: customer.FULL_NAME || `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim(),
        first_name: customer.FIRST_NAME,
        last_name: customer.LAST_NAME,
        email: customer.EMAIL,
        phone: customer.PHONE,
        address: customer.ADDRESS,
        status: customer.STATUS
      },
      accounts_summary: {
        total_accounts: accounts.length,
        total_balances: {
          available: totalAvailable.toFixed(2),
          ledger: totalLedger.toFixed(2),
          cleared: totalCleared.toFixed(2)
        }
      },
      accounts: accounts.map(account => ({
        account_number: account.account_number,
        account_type: account.account_type,
        status: account.status,
        balances: {
          available: parseFloat(account.available_balance).toFixed(2),
          ledger: parseFloat(account.ledger_balance).toFixed(2),
          cleared: parseFloat(account.cleared_balance).toFixed(2)
        },
        created: account.created_at,
        last_updated: account.updated_at
      }))
    });
    
  } catch (error) {
    logger.error('Error fetching customer accounts:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching customer accounts',
      error: error.message
    });
  }
};

// Export transaction as CSV
export const exportTransactions = async (req, res) => {
  try {
    const { startDate, endDate, format = 'csv' } = req.query;
    
    const whereClause = {};
    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp[Op.gte] = new Date(startDate);
      if (endDate) whereClause.timestamp[Op.lte] = new Date(endDate);
    }
    
    const transactions = await AuditTrail.findAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit: 1000 // Limit for export
    });
    
    if (format === 'csv') {
      // Convert to CSV
      const csvRows = [];
      
      // Add header
      const headers = [
        'Reference No', 'Account No', 'Transaction Type', 'Amount', 
        'Description', 'Status', 'Transaction Date', 'Business Unit',
        'Created At'
      ];
      csvRows.push(headers.join(','));
      
      // Add data rows
      transactions.forEach(transaction => {
        const additionalInfo = JSON.parse(transaction.additional_info || '{}');
        const amount = additionalInfo.amount || '0';
        
        const row = [
          transaction.reference_no,
          transaction.account_no || '',
          transaction.event_type,
          amount,
          transaction.description,
          transaction.status,
          transaction.timestamp,
          additionalInfo.business_unit || '',
          transaction.createdAt
        ].map(field => {
          const str = String(field || '');
          return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
        });
        
        csvRows.push(row.join(','));
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
      return res.send(csvRows.join('\n'));
    }
    
    // Default to JSON
    return res.status(200).json({
      success: true,
      data: transactions
    });
    
  } catch (error) {
    logger.error('Error exporting transactions:', error);
    return res.status(500).json({
      success: false,
      message: 'Error exporting transactions',
      error: error.message
    });
  }
};

// Create a safe wrapper for the main function
const postTransactionSafeWrapper = async (req, res) => {
  try {
    return await postTransaction(req, res);
  } catch (error) {
    console.error('Transaction controller error:', error);
    return res.status(500).json({
      success: false,
      message: 'Transaction processing failed',
      error: error.message
    });
  }
};

// Add debug endpoint
export const debugAccounts = async (req, res) => {
  try {
    // Get all accounts from customer_accounts
    const [customerAccounts] = await sequelize.query(`
      SELECT 
        account_number,
        customer_id,
        status,
        account_type,
        available_balance,
        ledger_balance,
        cleared_balance,
        created_at
      FROM customer_accounts
      ORDER BY created_at DESC
    `);
    
    return res.status(200).json({
      success: true,
      data: {
        customer_accounts: customerAccounts,
        total_accounts: customerAccounts.length
      }
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    return res.status(500).json({
      success: false,
      message: 'Debug error',
      error: error.message
    });
  }
};
// Export transactions by customer ID
export const exportTransactionsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate, format = 'csv' } = req.query;
    
    // First, get customer info
    const [customerInfo] = await sequelize.query(`
      SELECT 
        id,
        CUST_ID,
        FIRST_NAME,
        LAST_NAME,
        FULL_NAME,
        EMAIL,
        PHONE
      FROM customers 
      WHERE id = ? OR CUST_ID = ?
      LIMIT 1
    `, {
      replacements: [customerId, customerId]
    });
    
    if (!customerInfo || customerInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found.'
      });
    }
    
    const customer = customerInfo[0];
    const customerName = customer.FULL_NAME || `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim();
    
    // Get all accounts for this customer
    const [customerAccounts] = await sequelize.query(`
      SELECT account_number 
      FROM customer_accounts 
      WHERE customer_id = ? OR customer_id = ?
    `, {
      replacements: [customer.id, customer.CUST_ID]
    });
    
    const accountNumbers = customerAccounts.map(acc => acc.account_number);
    
    if (accountNumbers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No accounts found for this customer',
        customer_id: customerId,
        customer_name: customerName
      });
    }
    
    // Build WHERE conditions
    const whereClause = {
      account_no: { [Op.in]: accountNumbers }
    };
    
    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp[Op.gte] = new Date(startDate);
      if (endDate) whereClause.timestamp[Op.lte] = new Date(endDate);
    }
    
    // Get transactions
    const transactions = await AuditTrail.findAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit: 5000 // Higher limit for export
    });
    
    if (format === 'csv') {
      // Convert to CSV
      const csvRows = [];
      
      // Add metadata header
      csvRows.push(`Customer ID:,${customer.CUST_ID || customer.id}`);
      csvRows.push(`Customer Name:,${customerName}`);
      csvRows.push(`Email:,${customer.EMAIL || 'N/A'}`);
      csvRows.push(`Phone:,${customer.PHONE || 'N/A'}`);
      csvRows.push(`Accounts:,${accountNumbers.join(', ')}`);
      csvRows.push(`Total Transactions:,${transactions.length}`);
      csvRows.push(`Export Date:,${new Date().toISOString().split('T')[0]}`);
      csvRows.push(''); // Empty line
      
      // Add data header
      const headers = [
        'Reference No',
        'Account No',
        'Transaction Type',
        'Amount',
        'Description',
        'Status',
        'Transaction Date',
        'Business Unit',
        'Depositor Name',
        'Transaction Mode',
        'Currency Count',
        'Created At'
      ];
      csvRows.push(headers.join(','));
      
      // Add data rows
      transactions.forEach(transaction => {
        const additionalInfo = JSON.parse(transaction.additional_info || '{}');
        const amount = additionalInfo.amount || '0';
        const currencyCount = additionalInfo.currency_count ? 
          JSON.stringify(additionalInfo.currency_count) : '';
        
        const row = [
          transaction.reference_no,
          transaction.account_no || '',
          transaction.event_type,
          amount,
          transaction.description,
          transaction.status,
          transaction.timestamp,
          additionalInfo.business_unit || '',
          additionalInfo.depositor_name || '',
          additionalInfo.transaction_mode || '',
          currencyCount,
          transaction.createdAt
        ].map(field => {
          const str = String(field || '');
          return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
        });
        
        csvRows.push(row.join(','));
      });
      
      // Generate filename
      const safeCustomerName = customerName.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `transactions_customer_${safeCustomerName}_${customer.CUST_ID || customer.id}_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csvRows.join('\n'));
    } else if (format === 'json') {
      // Prepare JSON response
      const formattedTransactions = transactions.map(transaction => {
        const additionalInfo = JSON.parse(transaction.additional_info || '{}');
        
        return {
          reference_no: transaction.reference_no,
          account_no: transaction.account_no,
          transaction_type: transaction.event_type,
          amount: additionalInfo.amount || '0',
          description: transaction.description,
          status: transaction.status,
          transaction_date: transaction.timestamp,
          business_unit: additionalInfo.business_unit,
          depositor_name: additionalInfo.depositor_name,
          transaction_mode: additionalInfo.transaction_mode,
          currency_count: additionalInfo.currency_count,
          created_at: transaction.createdAt,
          additional_info: additionalInfo
        };
      });
      
      const response = {
        success: true,
        customer_info: {
          customer_id: customer.CUST_ID || customer.id,
          customer_name: customerName,
          email: customer.EMAIL,
          phone: customer.PHONE,
          total_accounts: accountNumbers.length,
          accounts: accountNumbers
        },
        export_info: {
          total_transactions: transactions.length,
          date_range: {
            start: startDate || 'All',
            end: endDate || 'All'
          },
          export_date: new Date().toISOString()
        },
        transactions: formattedTransactions
      };
      
      return res.status(200).json(response);
    } else if (format === 'excel') {
      // For Excel format (using simple CSV with .xlsx extension)
      const csvRows = [];
      const headers = [
        'Reference No', 'Account No', 'Transaction Type', 'Amount', 
        'Description', 'Status', 'Transaction Date', 'Business Unit',
        'Depositor Name', 'Transaction Mode', 'Created At'
      ];
      csvRows.push(headers.join('\t'));
      
      transactions.forEach(transaction => {
        const additionalInfo = JSON.parse(transaction.additional_info || '{}');
        const amount = additionalInfo.amount || '0';
        
        const row = [
          transaction.reference_no,
          transaction.account_no || '',
          transaction.event_type,
          amount,
          transaction.description,
          transaction.status,
          transaction.timestamp,
          additionalInfo.business_unit || '',
          additionalInfo.depositor_name || '',
          additionalInfo.transaction_mode || '',
          transaction.createdAt
        ].map(field => String(field || ''));
        
        csvRows.push(row.join('\t'));
      });
      
      const safeCustomerName = customerName.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `transactions_customer_${safeCustomerName}_${customer.CUST_ID || customer.id}_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csvRows.join('\n'));
    }
    
    // Default to JSON
    const response = {
      success: true,
      customer_id: customerId,
      customer_name: customerName,
      total_transactions: transactions.length,
      transactions: transactions
    };
    
    return res.status(200).json(response);
    
  } catch (error) {
    logger.error('Error exporting transactions by customer:', error);
    return res.status(500).json({
      success: false,
      message: 'Error exporting transactions by customer',
      error: error.message
    });
  }
};

// Export transactions by customer name
export const exportTransactionsByCustomerName = async (req, res) => {
  try {
    const { customerName } = req.params;
    const { startDate, endDate, format = 'csv', exactMatch = 'false' } = req.query;
    
    // Find customers matching the name
    let customersQuery = `
      SELECT 
        id,
        CUST_ID,
        FIRST_NAME,
        LAST_NAME,
        FULL_NAME,
        EMAIL,
        PHONE
      FROM customers 
      WHERE 
    `;
    
    if (exactMatch === 'true') {
      customersQuery += `FULL_NAME = ? OR (FIRST_NAME = ? AND LAST_NAME = ?)`;
    } else {
      customersQuery += `FIRST_NAME LIKE ? OR LAST_NAME LIKE ? OR FULL_NAME LIKE ?`;
    }
    
    const searchTerm = exactMatch === 'true' ? customerName : `%${customerName}%`;
    const replacements = exactMatch === 'true' 
      ? [customerName, ...customerName.split(' ')] 
      : [searchTerm, searchTerm, searchTerm];
    
    const [matchingCustomers] = await sequelize.query(customersQuery, {
      replacements
    });
    
    if (matchingCustomers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No customers found with this name.'
      });
    }
    
    // Get account numbers for all matching customers
    const customerIds = matchingCustomers.map(c => c.id);
    const custIds = matchingCustomers.map(c => c.CUST_ID);
    
    const [customerAccounts] = await sequelize.query(`
      SELECT account_number 
      FROM customer_accounts 
      WHERE customer_id IN (?) OR customer_id IN (?)
    `, {
      replacements: [customerIds, custIds]
    });
    
    const accountNumbers = customerAccounts.map(acc => acc.account_number);
    
    if (accountNumbers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No accounts found for matching customers',
        matching_customers: matchingCustomers.length,
        customers: matchingCustomers.map(c => ({
          id: c.id,
          cust_id: c.CUST_ID,
          name: c.FULL_NAME || `${c.FIRST_NAME} ${c.LAST_NAME}`.trim()
        }))
      });
    }
    
    // Build WHERE conditions
    const whereClause = {
      account_no: { [Op.in]: accountNumbers }
    };
    
    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp[Op.gte] = new Date(startDate);
      if (endDate) whereClause.timestamp[Op.lte] = new Date(endDate);
    }
    
    // Get transactions
    const transactions = await AuditTrail.findAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit: 5000
    });
    
    if (format === 'csv') {
      const csvRows = [];
      
      // Add metadata
      csvRows.push(`Search Name:,${customerName}`);
      csvRows.push(`Exact Match:,${exactMatch}`);
      csvRows.push(`Matching Customers:,${matchingCustomers.length}`);
      csvRows.push(`Total Accounts:,${accountNumbers.length}`);
      csvRows.push(`Total Transactions:,${transactions.length}`);
      csvRows.push(`Export Date:,${new Date().toISOString().split('T')[0]}`);
      csvRows.push('');
      
      // Add customer list
      csvRows.push('Matching Customers:');
      csvRows.push('Customer ID,Full Name,Email,Phone,Accounts');
      
      matchingCustomers.forEach(customer => {
        const custAccounts = customerAccounts.filter(acc => 
          acc.customer_id === customer.id || acc.customer_id === customer.CUST_ID
        ).map(acc => acc.account_number).join('; ');
        
        const row = [
          customer.CUST_ID || customer.id,
          customer.FULL_NAME || `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
          customer.EMAIL || '',
          customer.PHONE || '',
          custAccounts
        ].map(field => {
          const str = String(field || '');
          return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
        });
        
        csvRows.push(row.join(','));
      });
      
      csvRows.push('');
      csvRows.push('Transactions:');
      
      // Add transaction header
      const headers = [
        'Customer Name',
        'Customer ID',
        'Account No',
        'Reference No',
        'Transaction Type',
        'Amount',
        'Description',
        'Transaction Date',
        'Business Unit',
        'Depositor Name'
      ];
      csvRows.push(headers.join(','));
      
      // Create a map for quick customer lookup
      const customerMap = {};
      matchingCustomers.forEach(customer => {
        customerMap[customer.id] = customer;
        customerMap[customer.CUST_ID] = customer;
      });
      
      // Get account to customer mapping
      const [accountCustomerMap] = await sequelize.query(`
        SELECT account_number, customer_id FROM customer_accounts WHERE account_number IN (?)
      `, {
        replacements: [accountNumbers]
      });
      
      const accountToCustomer = {};
      accountCustomerMap.forEach(item => {
        accountToCustomer[item.account_number] = item.customer_id;
      });
      
      // Add transaction rows
      transactions.forEach(transaction => {
        const accountNo = transaction.account_no;
        const customerId = accountToCustomer[accountNo];
        const customer = customerMap[customerId];
        const additionalInfo = JSON.parse(transaction.additional_info || '{}');
        const amount = additionalInfo.amount || '0';
        
        const row = [
          customer ? (customer.FULL_NAME || `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim()) : 'Unknown',
          customer ? (customer.CUST_ID || customer.id) : 'Unknown',
          accountNo,
          transaction.reference_no,
          transaction.event_type,
          amount,
          transaction.description,
          transaction.timestamp,
          additionalInfo.business_unit || '',
          additionalInfo.depositor_name || ''
        ].map(field => {
          const str = String(field || '');
          return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
        });
        
        csvRows.push(row.join(','));
      });
      
      const safeSearchName = customerName.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `transactions_search_${safeSearchName}_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csvRows.join('\n'));
    }
    
    // Default JSON response
    const response = {
      success: true,
      search_info: {
        search_name: customerName,
        exact_match: exactMatch === 'true',
        matching_customers: matchingCustomers.length,
        total_accounts: accountNumbers.length,
        total_transactions: transactions.length
      },
      customers: matchingCustomers.map(customer => ({
        customer_id: customer.CUST_ID || customer.id,
        full_name: customer.FULL_NAME || `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim(),
        email: customer.EMAIL,
        phone: customer.PHONE
      })),
      transactions: transactions.map(transaction => {
        const additionalInfo = JSON.parse(transaction.additional_info || '{}');
        return {
          ...transaction.toJSON(),
          additional_info: additionalInfo
        };
      })
    };
    
    return res.status(200).json(response);
    
  } catch (error) {
    logger.error('Error exporting transactions by customer name:', error);
    return res.status(500).json({
      success: false,
      message: 'Error exporting transactions by customer name',
      error: error.message
    });
  }
};

// Batch export multiple customers
export const exportBatchTransactions = async (req, res) => {
  try {
    const { customerIds, accountNumbers, format = 'csv' } = req.body;
    
    if ((!customerIds || customerIds.length === 0) && (!accountNumbers || accountNumbers.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide either customerIds or accountNumbers'
      });
    }
    
    let targetAccountNumbers = [];
    
    if (accountNumbers && accountNumbers.length > 0) {
      targetAccountNumbers = accountNumbers;
    } else if (customerIds && customerIds.length > 0) {
      // Get accounts for all specified customers
      const [allAccounts] = await sequelize.query(`
        SELECT account_number 
        FROM customer_accounts 
        WHERE customer_id IN (?) OR customer_id IN (
          SELECT id FROM customers WHERE CUST_ID IN (?)
        )
      `, {
        replacements: [customerIds, customerIds]
      });
      
      targetAccountNumbers = allAccounts.map(acc => acc.account_number);
    }
    
    if (targetAccountNumbers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No accounts found for the specified criteria'
      });
    }
    
    // Get transactions
    const transactions = await AuditTrail.findAll({
      where: {
        account_no: { [Op.in]: targetAccountNumbers }
      },
      order: [['timestamp', 'DESC']],
      limit: 10000 // Higher limit for batch export
    });
    
    if (format === 'csv') {
      const csvRows = [];
      
      // Add metadata
      csvRows.push(`Batch Export Report`);
      csvRows.push(`Export Date:,${new Date().toISOString()}`);
      csvRows.push(`Total Accounts:,${targetAccountNumbers.length}`);
      csvRows.push(`Total Transactions:,${transactions.length}`);
      csvRows.push(`Search Criteria:,${customerIds ? 'Customer IDs: ' + customerIds.join(', ') : 'Account Numbers: ' + accountNumbers.join(', ')}`);
      csvRows.push('');
      
      // Add transaction header
      const headers = [
        'Account No',
        'Reference No',
        'Transaction Type',
        'Amount',
        'Description',
        'Status',
        'Transaction Date',
        'Business Unit',
        'Depositor Name',
        'Created At'
      ];
      csvRows.push(headers.join(','));
      
      // Add transaction rows
      transactions.forEach(transaction => {
        const additionalInfo = JSON.parse(transaction.additional_info || '{}');
        const amount = additionalInfo.amount || '0';
        
        const row = [
          transaction.account_no || '',
          transaction.reference_no,
          transaction.event_type,
          amount,
          transaction.description,
          transaction.status,
          transaction.timestamp,
          additionalInfo.business_unit || '',
          additionalInfo.depositor_name || '',
          transaction.createdAt
        ].map(field => {
          const str = String(field || '');
          return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
        });
        
        csvRows.push(row.join(','));
      });
      
      const filename = `batch_transactions_export_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csvRows.join('\n'));
    }
    
    // Default JSON response
    return res.status(200).json({
      success: true,
      export_info: {
        total_accounts: targetAccountNumbers.length,
        total_transactions: transactions.length,
        export_date: new Date().toISOString()
      },
      accounts: targetAccountNumbers,
      transactions: transactions.map(tx => ({
        ...tx.toJSON(),
        additional_info: JSON.parse(tx.additional_info || '{}')
      }))
    });
    
  } catch (error) {
    logger.error('Error in batch export:', error);
    return res.status(500).json({
      success: false,
      message: 'Error exporting batch transactions',
      error: error.message
    });
  }
};
// Get transactions by customer ID with export option
export const getTransactionsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { 
      startDate, 
      endDate, 
      page = 1, 
      limit = 50,
      export: exportFormat // Optional export parameter
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    console.log(`🔍 Fetching transactions for customer ID: ${customerId}`);
    console.log(`📊 Query parameters:`, { startDate, endDate, page, limit, exportFormat, offset });
    
    // First, get customer info - FIXED: Removed FULL_NAME column
    const [customerInfo] = await sequelize.query(`
      SELECT 
        id,
        CUST_ID,
        FIRST_NAME,
        LAST_NAME,
        EMAIL,
        PHONE,
        STATUS,
        REC_ST
      FROM customers 
      WHERE id = ? OR CUST_ID = ?
      LIMIT 1
    `, {
      replacements: [customerId, customerId]
    });
    
    console.log(`✅ Customer query results:`, customerInfo);
    
    if (!customerInfo || customerInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found.'
      });
    }
    
    const customer = customerInfo[0];
    const customerName = `${customer.FIRST_NAME || ''} ${customer.LAST_NAME || ''}`.trim();
    
    console.log(`✅ Found customer: ${customerName} (ID: ${customer.id}, CUST_ID: ${customer.CUST_ID})`);
    
    // Get all accounts for this customer
    const [customerAccounts] = await sequelize.query(`
      SELECT 
        ca.account_number,
        ca.account_type,
        ca.status as account_status,
        ca.available_balance,
        ca.ledger_balance,
        ca.cleared_balance,
        ca.created_at as account_created
      FROM customer_accounts ca
      WHERE ca.customer_id = ?
      ORDER BY ca.created_at DESC
    `, {
      replacements: [customer.id]
    });
    
    console.log(`✅ Found ${customerAccounts.length} accounts for customer`);
    
    const accountNumbers = customerAccounts.map(acc => acc.account_number);
    
    if (accountNumbers.length === 0) {
      return res.status(200).json({
        success: true,
        customer_id: customerId,
        customer_name: customerName,
        data: [],
        message: 'No accounts found for this customer',
        pagination: {
          total: 0,
          page: 1,
          limit: parseInt(limit),
          totalPages: 0
        }
      });
    }
    
    console.log(`📊 Account numbers found: ${accountNumbers.join(', ')}`);
    
    // Calculate total balances for all accounts
    let totalAvailableBalance = 0;
    let totalLedgerBalance = 0;
    let totalClearedBalance = 0;
    
    customerAccounts.forEach(account => {
      totalAvailableBalance += parseFloat(account.available_balance || 0);
      totalLedgerBalance += parseFloat(account.ledger_balance || 0);
      totalClearedBalance += parseFloat(account.cleared_balance || 0);
    });
    
    console.log(`💰 Total balances - Available: ${totalAvailableBalance}, Ledger: ${totalLedgerBalance}, Cleared: ${totalClearedBalance}`);
    
    const whereClause = {
      account_no: { [Op.in]: accountNumbers }
    };
    
    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp[Op.gte] = new Date(startDate);
      if (endDate) whereClause.timestamp[Op.lte] = new Date(endDate);
    }
    
    console.log('🔍 Where clause for audit trail:', whereClause);
    
    // Get transaction count
    const { count } = await AuditTrail.findAndCountAll({
      where: whereClause
    });
    
    console.log(`📊 Found ${count} total transactions`);
    
    // Get transactions with pagination (unless exporting)
    const transactions = await AuditTrail.findAll({
      where: whereClause,
      limit: exportFormat ? undefined : parseInt(limit),
      offset: exportFormat ? undefined : parseInt(offset),
      order: [['timestamp', 'DESC']]
    });
    
    console.log(`📊 Retrieved ${transactions.length} transactions`);
    
    // Calculate transaction statistics
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let transactionStats = [];
    
    transactions.forEach(transaction => {
      try {
        const additionalInfo = JSON.parse(transaction.additional_info || '{}');
        const amount = parseFloat(additionalInfo.amount || 0);
        
        if (transaction.event_type.includes('CREDIT') || additionalInfo.transaction_type === 'CR') {
          totalDeposits += amount;
        } else if (transaction.event_type.includes('DEBIT') || additionalInfo.transaction_type === 'DR') {
          totalWithdrawals += amount;
        }
        
        transactionStats.push({
          reference: transaction.reference_no,
          type: transaction.event_type,
          amount: amount,
          date: transaction.timestamp
        });
      } catch (e) {
        console.log('⚠️ Error parsing transaction additional_info:', e.message);
      }
    });
    
    console.log(`💰 Transaction statistics - Deposits: ${totalDeposits}, Withdrawals: ${totalWithdrawals}`);
    
    // Handle export
    if (exportFormat) {
      if (exportFormat === 'csv') {
        const csvRows = [];
        
        // Add customer info header
        csvRows.push('CUSTOMER INFORMATION');
        csvRows.push(`Customer ID:,${customer.CUST_ID || customer.id}`);
        csvRows.push(`First Name:,${customer.FIRST_NAME || 'N/A'}`);
        csvRows.push(`Last Name:,${customer.LAST_NAME || 'N/A'}`);
        csvRows.push(`Full Name:,${customerName}`);
        csvRows.push(`Email:,${customer.EMAIL || 'N/A'}`);
        csvRows.push(`Phone:,${customer.PHONE || 'N/A'}`);
        csvRows.push(`Status:,${customer.STATUS || customer.REC_ST || 'N/A'}`);
        csvRows.push('');
        
        // Add account summary
        csvRows.push('ACCOUNT SUMMARY');
        csvRows.push('Account Number,Account Type,Status,Available Balance,Ledger Balance,Cleared Balance,Created Date');
        customerAccounts.forEach(account => {
          const row = [
            account.account_number,
            account.account_type,
            account.account_status,
            parseFloat(account.available_balance).toFixed(2),
            parseFloat(account.ledger_balance).toFixed(2),
            parseFloat(account.cleared_balance).toFixed(2),
            account.account_created
          ].map(field => {
            const str = String(field || '');
            return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
          });
          csvRows.push(row.join(','));
        });
        
        csvRows.push('');
        csvRows.push(`Total Available Balance:,${totalAvailableBalance.toFixed(2)}`);
        csvRows.push(`Total Ledger Balance:,${totalLedgerBalance.toFixed(2)}`);
        csvRows.push(`Total Cleared Balance:,${totalClearedBalance.toFixed(2)}`);
        csvRows.push('');
        
        // Add transaction summary
        csvRows.push('TRANSACTION SUMMARY');
        csvRows.push(`Total Transactions:,${count}`);
        csvRows.push(`Total Deposits:,${totalDeposits.toFixed(2)}`);
        csvRows.push(`Total Withdrawals:,${totalWithdrawals.toFixed(2)}`);
        csvRows.push(`Net Flow:,${(totalDeposits - totalWithdrawals).toFixed(2)}`);
        csvRows.push('');
        
        // Add transaction details
        csvRows.push('TRANSACTION DETAILS');
        csvRows.push('Reference No,Account No,Transaction Type,Amount,Description,Status,Transaction Date,Business Unit,Depositor Name,Balance Change');
        
        transactions.forEach(transaction => {
          const additionalInfo = JSON.parse(transaction.additional_info || '{}');
          const amount = additionalInfo.amount || '0';
          const balanceChanges = additionalInfo.balance_changes || {};
          
          const row = [
            transaction.reference_no,
            transaction.account_no || '',
            transaction.event_type,
            amount,
            transaction.description,
            transaction.status,
            transaction.timestamp,
            additionalInfo.business_unit || '',
            additionalInfo.depositor_name || '',
            JSON.stringify(balanceChanges)
          ].map(field => {
            const str = String(field || '');
            return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
          });
          
          csvRows.push(row.join(','));
        });
        
        const safeCustomerName = customerName.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `customer_${safeCustomerName}_transactions_${new Date().toISOString().split('T')[0]}.csv`;
        
        console.log(`📤 Exporting CSV file: ${filename} with ${transactions.length} transactions`);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csvRows.join('\n'));
      } else if (exportFormat === 'json') {
        // JSON export
        const response = {
          success: true,
          export_type: 'customer_transactions',
          export_date: new Date().toISOString(),
          customer_info: {
            customer_id: customer.CUST_ID || customer.id,
            first_name: customer.FIRST_NAME,
            last_name: customer.LAST_NAME,
            full_name: customerName,
            email: customer.EMAIL,
            phone: customer.PHONE,
            status: customer.STATUS || customer.REC_ST
          },
          account_summary: {
            total_accounts: customerAccounts.length,
            total_balances: {
              available: totalAvailableBalance.toFixed(2),
              ledger: totalLedgerBalance.toFixed(2),
              cleared: totalClearedBalance.toFixed(2)
            },
            accounts: customerAccounts.map(acc => ({
              account_number: acc.account_number,
              account_type: acc.account_type,
              status: acc.account_status,
              balances: {
                available: parseFloat(acc.available_balance).toFixed(2),
                ledger: parseFloat(acc.ledger_balance).toFixed(2),
                cleared: parseFloat(acc.cleared_balance).toFixed(2)
              },
              created: acc.account_created
            }))
          },
          transaction_summary: {
            total_transactions: count,
            total_deposits: totalDeposits.toFixed(2),
            total_withdrawals: totalWithdrawals.toFixed(2),
            net_flow: (totalDeposits - totalWithdrawals).toFixed(2)
          },
          transactions: transactions.map(tx => {
            const additionalInfo = JSON.parse(tx.additional_info || '{}');
            return {
              reference_no: tx.reference_no,
              account_no: tx.account_no,
              transaction_type: tx.event_type,
              amount: additionalInfo.amount || '0',
              description: tx.description,
              status: tx.status,
              transaction_date: tx.timestamp,
              business_unit: additionalInfo.business_unit,
              depositor_name: additionalInfo.depositor_name,
              balance_changes: additionalInfo.balance_changes,
              additional_info: additionalInfo
            };
          })
        };
        
        console.log('📤 Exporting JSON response');
        return res.status(200).json(response);
      }
    }
    
    // Regular response (non-export)
    const response = {
      success: true,
      customer_info: {
        customer_id: customer.CUST_ID || customer.id,
        first_name: customer.FIRST_NAME,
        last_name: customer.LAST_NAME,
        full_name: customerName,
        email: customer.EMAIL,
        phone: customer.PHONE,
        status: customer.STATUS || customer.REC_ST
      },
      account_summary: {
        total_accounts: customerAccounts.length,
        accounts: customerAccounts.map(acc => ({
          account_number: acc.account_number,
          account_type: acc.account_type,
          status: acc.account_status,
          balances: {
            available: parseFloat(acc.available_balance).toFixed(2),
            ledger: parseFloat(acc.ledger_balance).toFixed(2),
            cleared: parseFloat(acc.cleared_balance).toFixed(2)
          },
          created: acc.account_created
        })),
        total_balances: {
          available: totalAvailableBalance.toFixed(2),
          ledger: totalLedgerBalance.toFixed(2),
          cleared: totalClearedBalance.toFixed(2)
        }
      },
      transaction_summary: {
        total_transactions: count,
        total_deposits: totalDeposits.toFixed(2),
        total_withdrawals: totalWithdrawals.toFixed(2),
        net_flow: (totalDeposits - totalWithdrawals).toFixed(2),
        date_range: {
          start: startDate || 'All',
          end: endDate || 'All'
        }
      },
      transactions: transactions.map(tx => {
        const additionalInfo = JSON.parse(tx.additional_info || '{}');
        return {
          ...tx.toJSON(),
          additional_info: additionalInfo
        };
      }),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    };
    
    console.log('✅ Successfully prepared response');
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('❌ Error fetching transactions by customer:', error.message);
    console.error('Error stack:', error.stack);
    
    logger.error('Error fetching transactions by customer:', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      query: req.query
    });
    
    return res.status(500).json({
      success: false,
      message: 'Error fetching transactions by customer',
      error: error.message,
      details: 'Please check if the required columns exist in your database'
    });
  }
};

// Get transactions by customer name with export option
export const getTransactionsByCustomerName = async (req, res) => {
  try {
    const { customerName } = req.params;
    const { 
      startDate, 
      endDate, 
      page = 1, 
      limit = 50,
      export: exportFormat,
      exactMatch = 'false'
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    console.log(`🔍 Searching for customer name: "${customerName}"`);
    
    // First, let's check what columns actually exist in the customers table
    let tableInfo;
    try {
      const [columns] = await sequelize.query(`
        SHOW COLUMNS FROM customers
      `);
      tableInfo = columns;
      console.log('📊 Customers table columns:', columns.map(col => col.Field));
    } catch (tableError) {
      console.log('⚠️ Could not fetch table structure:', tableError.message);
    }
    
    // Build dynamic SELECT query based on available columns
    const possibleColumns = [
      'id', 'CUST_ID', 'FIRST_NAME', 'LAST_NAME', 'FULL_NAME',
      'EMAIL', 'PHONE', 'STATUS', 'REC_ST', 'customer_id',
      'first_name', 'last_name', 'email', 'phone', 'status'
    ];
    
    // Check which columns actually exist
    const existingColumns = [];
    if (tableInfo) {
      const availableColumns = tableInfo.map(col => col.Field);
      possibleColumns.forEach(col => {
        if (availableColumns.includes(col)) {
          existingColumns.push(col);
        }
      });
    } else {
      // If we can't check, use a safe minimal set
      existingColumns.push('id', 'CUST_ID', 'FIRST_NAME', 'LAST_NAME', 'STATUS', 'REC_ST');
    }
    
    console.log(`📊 Using columns: ${existingColumns.join(', ')}`);
    
    // Build customers query
    let customersQuery = `
      SELECT ${existingColumns.join(', ')}
      FROM customers 
      WHERE 
    `;
    
    if (exactMatch === 'true') {
      customersQuery += `(FIRST_NAME = ? OR LAST_NAME = ?)`;
    } else {
      customersQuery += `FIRST_NAME LIKE ? OR LAST_NAME LIKE ?`;
    }
    
    const searchTerm = exactMatch === 'true' ? customerName : `%${customerName}%`;
    const replacements = [searchTerm, searchTerm];
    
    console.log('🔍 Executing customer search query:', customersQuery);
    console.log('🔍 Search parameters:', replacements);
    
    const [matchingCustomers] = await sequelize.query(customersQuery, {
      replacements
    });
    
    console.log(`✅ Found ${matchingCustomers.length} matching customers`);
    
    if (matchingCustomers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No customers found with this name.'
      });
    }
    
    // Get account numbers for all matching customers
    const customerIds = matchingCustomers.map(c => c.id || c.customer_id);
    
    console.log(`🔍 Customer IDs found:`, customerIds);
    
    if (customerIds.length === 0) {
      return res.status(200).json({
        success: true,
        search_name: customerName,
        matching_customers: matchingCustomers.length,
        customers: matchingCustomers,
        data: [],
        message: 'No valid customer IDs found',
        pagination: {
          total: 0,
          page: 1,
          limit: parseInt(limit),
          totalPages: 0
        }
      });
    }
    
    // Get accounts with balances
    const [customerAccounts] = await sequelize.query(`
      SELECT 
        ca.account_number,
        ca.account_type,
        ca.status as account_status,
        ca.available_balance,
        ca.ledger_balance,
        ca.cleared_balance,
        ca.created_at as account_created,
        ca.customer_id
      FROM customer_accounts ca
      WHERE ca.customer_id IN (?)
      ORDER BY ca.customer_id, ca.created_at DESC
    `, {
      replacements: [customerIds]
    });
    
    console.log(`✅ Found ${customerAccounts.length} customer accounts`);
    
    const accountNumbers = customerAccounts.map(acc => acc.account_number);
    
    if (accountNumbers.length === 0) {
      // Format customer info safely
      const formattedCustomers = matchingCustomers.map(customer => {
        const firstName = customer.FIRST_NAME || customer.first_name || '';
        const lastName = customer.LAST_NAME || customer.last_name || '';
        const custId = customer.CUST_ID || customer.customer_id || customer.id;
        const email = customer.EMAIL || customer.email || '';
        const phone = customer.PHONE || customer.phone || '';
        const status = customer.STATUS || customer.status || customer.REC_ST || '';
        
        return {
          id: customer.id,
          cust_id: custId,
          first_name: firstName,
          last_name: lastName,
          name: `${firstName} ${lastName}`.trim(),
          email: email,
          phone: phone,
          status: status
        };
      });
      
      return res.status(200).json({
        success: true,
        search_name: customerName,
        matching_customers: matchingCustomers.length,
        customers: formattedCustomers,
        data: [],
        message: 'No accounts found for matching customers',
        pagination: {
          total: 0,
          page: 1,
          limit: parseInt(limit),
          totalPages: 0
        }
      });
    }
    
    console.log(`📊 Account numbers found: ${accountNumbers.join(', ')}`);
    
    // Calculate total balances
    let totalAvailableBalance = 0;
    let totalLedgerBalance = 0;
    let totalClearedBalance = 0;
    
    customerAccounts.forEach(account => {
      totalAvailableBalance += parseFloat(account.available_balance || 0);
      totalLedgerBalance += parseFloat(account.ledger_balance || 0);
      totalClearedBalance += parseFloat(account.cleared_balance || 0);
    });
    
    console.log(`💰 Total balances - Available: ${totalAvailableBalance}, Ledger: ${totalLedgerBalance}, Cleared: ${totalClearedBalance}`);
    
    const whereClause = {
      account_no: { [Op.in]: accountNumbers }
    };
    
    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp[Op.gte] = new Date(startDate);
      if (endDate) whereClause.timestamp[Op.lte] = new Date(endDate);
    }
    
    console.log('🔍 Where clause for audit trail:', whereClause);
    
    // Get transaction count
    const { count } = await AuditTrail.findAndCountAll({
      where: whereClause
    });
    
    console.log(`📊 Found ${count} total transactions`);
    
    // Get transactions
    const transactions = await AuditTrail.findAll({
      where: whereClause,
      limit: exportFormat ? undefined : parseInt(limit),
      offset: exportFormat ? undefined : parseInt(offset),
      order: [['timestamp', 'DESC']]
    });
    
    console.log(`📊 Retrieved ${transactions.length} transactions`);
    
    // Calculate statistics
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    
    transactions.forEach(transaction => {
      try {
        const additionalInfo = JSON.parse(transaction.additional_info || '{}');
        const amount = parseFloat(additionalInfo.amount || 0);
        
        if (transaction.event_type.includes('CREDIT') || additionalInfo.transaction_type === 'CR') {
          totalDeposits += amount;
        } else if (transaction.event_type.includes('DEBIT') || additionalInfo.transaction_type === 'DR') {
          totalWithdrawals += amount;
        }
      } catch (e) {
        console.log('⚠️ Error parsing transaction additional_info:', e.message);
      }
    });
    
    // Create account-to-customer mapping
    const accountToCustomer = {};
    customerAccounts.forEach(account => {
      accountToCustomer[account.account_number] = account.customer_id;
    });
    
    // Create customer map for quick lookup
    const customerMap = {};
    matchingCustomers.forEach(customer => {
      const customerId = customer.id || customer.customer_id;
      customerMap[customerId] = customer;
      if (customer.CUST_ID) {
        customerMap[customer.CUST_ID] = customer;
      }
    });
    
    // Handle export
    if (exportFormat) {
      if (exportFormat === 'csv') {
        const csvRows = [];
        
        // Add search info
        csvRows.push('SEARCH INFORMATION');
        csvRows.push(`Search Name:,${customerName}`);
        csvRows.push(`Exact Match:,${exactMatch}`);
        csvRows.push(`Matching Customers:,${matchingCustomers.length}`);
        csvRows.push(`Total Accounts:,${accountNumbers.length}`);
        csvRows.push(`Total Transactions:,${count}`);
        csvRows.push(`Export Date:,${new Date().toISOString().split('T')[0]}`);
        csvRows.push('');
        
        // Add customer list
        csvRows.push('MATCHING CUSTOMERS');
        csvRows.push('Customer ID,First Name,Last Name,Total Accounts,Total Balance');
        
        matchingCustomers.forEach(customer => {
          const customerId = customer.id || customer.customer_id;
          const customerAccountsList = customerAccounts.filter(acc => 
            acc.customer_id === customerId
          );
          
          const customerTotalBalance = customerAccountsList.reduce((sum, acc) => 
            sum + parseFloat(acc.available_balance || 0), 0
          );
          
          const firstName = customer.FIRST_NAME || customer.first_name || '';
          const lastName = customer.LAST_NAME || customer.last_name || '';
          const custId = customer.CUST_ID || customer.customer_id || customer.id;
          
          const row = [
            custId,
            firstName,
            lastName,
            customerAccountsList.length,
            customerTotalBalance.toFixed(2)
          ].map(field => {
            const str = String(field || '');
            return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
          });
          
          csvRows.push(row.join(','));
        });
        
        csvRows.push('');
        csvRows.push('TOTAL BALANCE SUMMARY');
        csvRows.push(`Total Available Balance:,${totalAvailableBalance.toFixed(2)}`);
        csvRows.push(`Total Ledger Balance:,${totalLedgerBalance.toFixed(2)}`);
        csvRows.push(`Total Cleared Balance:,${totalClearedBalance.toFixed(2)}`);
        csvRows.push('');
        
        // Add transaction summary
        csvRows.push('TRANSACTION SUMMARY');
        csvRows.push(`Total Transactions:,${count}`);
        csvRows.push(`Total Deposits:,${totalDeposits.toFixed(2)}`);
        csvRows.push(`Total Withdrawals:,${totalWithdrawals.toFixed(2)}`);
        csvRows.push(`Net Flow:,${(totalDeposits - totalWithdrawals).toFixed(2)}`);
        csvRows.push('');
        
        // Add transaction details
        csvRows.push('TRANSACTION DETAILS');
        csvRows.push('Customer First Name,Customer Last Name,Customer ID,Account No,Reference No,Transaction Type,Amount,Description,Transaction Date,Business Unit,Available Balance');
        
        transactions.forEach(transaction => {
          const accountNo = transaction.account_no;
          const customerId = accountToCustomer[accountNo];
          const customer = customerMap[customerId];
          const additionalInfo = JSON.parse(transaction.additional_info || '{}');
          const amount = additionalInfo.amount || '0';
          
          // Find account balance
          const account = customerAccounts.find(acc => acc.account_number === accountNo);
          const currentBalance = account ? parseFloat(account.available_balance).toFixed(2) : '0.00';
          
          const firstName = customer ? (customer.FIRST_NAME || customer.first_name || '') : 'Unknown';
          const lastName = customer ? (customer.LAST_NAME || customer.last_name || '') : 'Unknown';
          const custId = customer ? (customer.CUST_ID || customer.customer_id || customer.id) : 'Unknown';
          
          const row = [
            firstName,
            lastName,
            custId,
            accountNo,
            transaction.reference_no,
            transaction.event_type,
            amount,
            transaction.description,
            transaction.timestamp,
            additionalInfo.business_unit || '',
            currentBalance
          ].map(field => {
            const str = String(field || '');
            return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
          });
          
          csvRows.push(row.join(','));
        });
        
        const safeSearchName = customerName.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `search_${safeSearchName}_transactions_${new Date().toISOString().split('T')[0]}.csv`;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csvRows.join('\n'));
      }
    }
    
    // Regular response (non-export)
    const response = {
      success: true,
      search_info: {
        search_name: customerName,
        exact_match: exactMatch === 'true',
        matching_customers: matchingCustomers.length,
        total_accounts: accountNumbers.length,
        total_transactions: count
      },
      balance_summary: {
        total_available: totalAvailableBalance.toFixed(2),
        total_ledger: totalLedgerBalance.toFixed(2),
        total_cleared: totalClearedBalance.toFixed(2)
      },
      transaction_summary: {
        total_deposits: totalDeposits.toFixed(2),
        total_withdrawals: totalWithdrawals.toFixed(2),
        net_flow: (totalDeposits - totalWithdrawals).toFixed(2)
      },
      customers: matchingCustomers.map(customer => {
        const customerId = customer.id || customer.customer_id;
        const custAccounts = customerAccounts.filter(acc => 
          acc.customer_id === customerId
        );
        
        const custTotalBalance = custAccounts.reduce((sum, acc) => 
          sum + parseFloat(acc.available_balance || 0), 0
        );
        
        const firstName = customer.FIRST_NAME || customer.first_name || '';
        const lastName = customer.LAST_NAME || customer.last_name || '';
        const custId = customer.CUST_ID || customer.customer_id || customer.id;
        const email = customer.EMAIL || customer.email || '';
        const phone = customer.PHONE || customer.phone || '';
        const status = customer.STATUS || customer.status || customer.REC_ST || '';
        
        return {
          customer_id: custId,
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`.trim(),
          email: email,
          phone: phone,
          status: status,
          total_accounts: custAccounts.length,
          total_balance: custTotalBalance.toFixed(2),
          accounts: custAccounts.map(acc => ({
            account_number: acc.account_number,
            account_type: acc.account_type,
            balances: {
              available: parseFloat(acc.available_balance).toFixed(2),
              ledger: parseFloat(acc.ledger_balance).toFixed(2),
              cleared: parseFloat(acc.cleared_balance).toFixed(2)
            }
          }))
        };
      }),
      transactions: transactions.map(transaction => {
        const accountNo = transaction.account_no;
        const customerId = accountToCustomer[accountNo];
        const customer = customerMap[customerId];
        const additionalInfo = JSON.parse(transaction.additional_info || '{}');
        
        const firstName = customer ? (customer.FIRST_NAME || customer.first_name || '') : 'Unknown';
        const lastName = customer ? (customer.LAST_NAME || customer.last_name || '') : 'Unknown';
        const custId = customer ? (customer.CUST_ID || customer.customer_id || customer.id) : 'Unknown';
        
        return {
          ...transaction.toJSON(),
          customer_first_name: firstName,
          customer_last_name: lastName,
          customer_name: `${firstName} ${lastName}`.trim(),
          customer_id: custId,
          additional_info: additionalInfo
        };
      }),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    };
    
    console.log('✅ Response prepared successfully');
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('❌ Error fetching transactions by customer name:', error.message);
    console.error('Error stack:', error.stack);
    
    logger.error('Error fetching transactions by customer name:', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      query: req.query
    });
    
    return res.status(500).json({
      success: false,
      message: 'Error fetching transactions by customer name',
      error: error.message,
      details: 'Please check if the required columns exist in your database'
    });
  }
};

// In your transactionController.js, update the export:
// In transactionController.js, update the export:
export default {
  postTransaction: postTransactionSafeWrapper,
  getTransactionHistory,
  getTransactionsByAccount,
  getTransactionsByCustomer,
  getTransactionsByCustomerName,
  exportTransactions,
  debugAccounts,
  getAccountBalance,
  getCustomerAccounts,
  exportTransactionsByCustomer,        // NEW
  exportTransactionsByCustomerName,    // NEW
  exportBatchTransactions              // NEW
  // Add exportTransactionsByAccount if you create it
};