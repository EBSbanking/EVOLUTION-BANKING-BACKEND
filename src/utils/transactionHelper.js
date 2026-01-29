// utils/transactionHelper.js - DYNAMIC BU_ID - MYSQL VERSION
import sequelize from '../../config/db.js';

// Cache for business units to avoid repeated database queries
let businessUnitsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Function to get business units with caching
const getBusinessUnits = async () => {
  const now = Date.now();
  
  // Return cached data if it's still valid
  if (businessUnitsCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return businessUnitsCache;
  }

  try {
    // Check if business_units table exists
    const [tableExists] = await sequelize.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = DATABASE() AND table_name = 'business_units'
    `);

    if (tableExists[0].count === 0) {
      console.warn('Business units table does not exist');
      return null;
    }

    const [units] = await sequelize.query(`
      SELECT * FROM business_units 
      WHERE status = 'Active' 
      ORDER BY bu_id ASC
    `);

    businessUnitsCache = units;
    cacheTimestamp = now;
    
    return units;
  } catch (error) {
    console.warn('Could not fetch business units, using default:', error.message);
    return null;
  }
};

// Function to get the appropriate BU_ID for group savings
const getGroupSavingsBUId = async () => {
  // First try environment variable
  if (process.env.GROUP_SAVINGS_BU_ID) {
    return process.env.GROUP_SAVINGS_BU_ID;
  }

  // Then try to find a matching business unit
  const businessUnits = await getBusinessUnits();
  if (businessUnits) {
    // Look for business units with names related to savings, groups, or cooperatives
    const preferredUnits = businessUnits.filter(unit => 
      (unit.business_unit_name || '').toLowerCase().includes('saving') ||
      (unit.business_unit_name || '').toLowerCase().includes('group') ||
      (unit.business_unit_name || '').toLowerCase().includes('cooperative') ||
      (unit.business_unit_name || '').toLowerCase().includes('union') ||
      (unit.description || '').toLowerCase().includes('saving') ||
      (unit.description || '').toLowerCase().includes('group')
    );

    if (preferredUnits.length > 0) {
      return preferredUnits[0].bu_id;
    }

    // Fallback to Information Technology (106) if no specific savings unit found
    const itUnit = businessUnits.find(unit => unit.bu_id == 106 || unit.bu_id == '106');
    if (itUnit) {
      return itUnit.bu_id;
    }

    // Final fallback: use the first available business unit
    if (businessUnits.length > 0) {
      return businessUnits[0].bu_id;
    }
  }

  // Ultimate fallback
  return '106';
};

export const createGroupSavingsTransaction = async (transactionData, transaction = null) => {
  const {
    groupSavings,
    memberCustId,
    amount,
    transactionType,
    description,
    reference,
    balanceAfter,
    ledgerBalanceAfter,
    clearedBalanceAfter,
    createdBy,
    contributionId = null,
    customBUId = null // Allow overriding BU_ID per transaction
  } = transactionData;

  // Get dynamic BU_ID
  const BU_ID = customBUId || await getGroupSavingsBUId();

  // Generate unique transaction ID
  const transactionId = `GS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const transactionPayload = {
    // Required transaction fields
    transaction_id: transactionId,
    transaction_type: transactionType.toUpperCase(),
    amount: amount,
    account_number: groupSavings.accountNumber,
    account_name: groupSavings.groupName,
    customer_id: memberCustId,
    bu_id: BU_ID, // Dynamic BU_ID
    description: description || `${transactionType} for Group Savings ${groupSavings.groupName}`,
    reference: reference,
    balance_after: balanceAfter,
    ledger_balance_after: ledgerBalanceAfter,
    cleared_balance_after: clearedBalanceAfter,
    created_by: createdBy,
    
    // Additional fields
    transaction_method: 'CASH',
    currency: 'NGN',
    status: 'COMPLETED',
    
    // Group savings specific fields
    transaction_category: 'GROUP_SAVINGS_CONTRIBUTION',
    member_cust_id: memberCustId,
    group_savings_id: groupSavings.id || groupSavings._id,
    group_account_number: groupSavings.accountNumber,
    group_name: groupSavings.groupName
  };

  if (contributionId) {
    transactionPayload.contribution_id = contributionId;
  }

  try {
    // Ensure transactions table exists
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_id VARCHAR(100) UNIQUE,
        transaction_type VARCHAR(50) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        account_number VARCHAR(50),
        account_name VARCHAR(255),
        customer_id VARCHAR(50),
        bu_id VARCHAR(20),
        description TEXT,
        reference VARCHAR(255),
        balance_after DECIMAL(15,2),
        ledger_balance_after DECIMAL(15,2),
        cleared_balance_after DECIMAL(15,2),
        created_by INT,
        transaction_method VARCHAR(50),
        currency VARCHAR(10) DEFAULT 'NGN',
        status VARCHAR(20) DEFAULT 'COMPLETED',
        transaction_category VARCHAR(50),
        member_cust_id VARCHAR(50),
        group_savings_id INT,
        group_account_number VARCHAR(50),
        group_name VARCHAR(255),
        contribution_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_transaction_id (transaction_id),
        INDEX idx_account_number (account_number),
        INDEX idx_customer_id (customer_id),
        INDEX idx_created_at (created_at),
        INDEX idx_group_savings (group_savings_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Insert transaction
    const [result] = await sequelize.query(
      `INSERT INTO transactions SET ?`,
      { replacements: [transactionPayload] }
    );

    // Get the inserted transaction
    const [insertedTransaction] = await sequelize.query(
      `SELECT * FROM transactions WHERE id = ?`,
      { replacements: [result.insertId] }
    );

    return insertedTransaction[0];
  } catch (error) {
    console.error('Error creating group savings transaction:', error.message);
    throw error;
  }
};

// Create regular transaction (non-group savings)
export const createTransaction = async (transactionData) => {
  const {
    accountNumber,
    accountName,
    customerId,
    amount,
    transactionType,
    description,
    reference,
    balanceAfter,
    ledgerBalanceAfter,
    clearedBalanceAfter,
    createdBy,
    buId = null,
    transactionMethod = 'CASH',
    currency = 'NGN',
    status = 'COMPLETED'
  } = transactionData;

  // Get BU_ID if not provided
  const BU_ID = buId || await getGroupSavingsBUId();

  // Generate unique transaction ID
  const transactionId = `TRX_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const transactionPayload = {
    transaction_id: transactionId,
    transaction_type: transactionType.toUpperCase(),
    amount: amount,
    account_number: accountNumber,
    account_name: accountName,
    customer_id: customerId,
    bu_id: BU_ID,
    description: description,
    reference: reference,
    balance_after: balanceAfter,
    ledger_balance_after: ledgerBalanceAfter,
    cleared_balance_after: clearedBalanceAfter,
    created_by: createdBy,
    transaction_method: transactionMethod,
    currency: currency,
    status: status,
    created_at: new Date()
  };

  try {
    await sequelize.query(
      `INSERT INTO transactions SET ?`,
      { replacements: [transactionPayload] }
    );

    return transactionPayload;
  } catch (error) {
    console.error('Error creating transaction:', error.message);
    throw error;
  }
};

// Get transactions for a specific account
export const getAccountTransactions = async (accountNumber, limit = 50, offset = 0) => {
  try {
    const [transactions] = await sequelize.query(
      `SELECT * FROM transactions 
       WHERE account_number = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      { replacements: [accountNumber, limit, offset] }
    );

    return transactions;
  } catch (error) {
    console.error('Error fetching account transactions:', error.message);
    throw error;
  }
};

// Get group savings transactions
export const getGroupSavingsTransactions = async (groupSavingsId, limit = 50, offset = 0) => {
  try {
    const [transactions] = await sequelize.query(
      `SELECT * FROM transactions 
       WHERE group_savings_id = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      { replacements: [groupSavingsId, limit, offset] }
    );

    return transactions;
  } catch (error) {
    console.error('Error fetching group savings transactions:', error.message);
    throw error;
  }
};

// Get transaction by ID
export const getTransactionById = async (transactionId) => {
  try {
    const [transactions] = await sequelize.query(
      `SELECT * FROM transactions WHERE transaction_id = ? OR id = ? LIMIT 1`,
      { replacements: [transactionId, transactionId] }
    );

    return transactions[0] || null;
  } catch (error) {
    console.error('Error fetching transaction:', error.message);
    throw error;
  }
};

// Update transaction status
export const updateTransactionStatus = async (transactionId, status, notes = null) => {
  try {
    const updateData = { status, updated_at: new Date() };
    if (notes) updateData.notes = notes;

    await sequelize.query(
      `UPDATE transactions SET ? WHERE transaction_id = ?`,
      { replacements: [updateData, transactionId] }
    );

    return true;
  } catch (error) {
    console.error('Error updating transaction status:', error.message);
    throw error;
  }
};

// Utility function to refresh the cache if needed
export const refreshBusinessUnitsCache = async () => {
  businessUnitsCache = null;
  cacheTimestamp = null;
  return await getBusinessUnits();
};

// Create business units table if it doesn't exist (helper function)
export const initializeBusinessUnitsTable = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS business_units (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bu_id VARCHAR(20) UNIQUE NOT NULL,
        business_unit_name VARCHAR(255) NOT NULL,
        description TEXT,
        manager_id INT,
        parent_bu_id VARCHAR(20),
        status ENUM('Active', 'Inactive', 'Suspended') DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_bu_id (bu_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('✅ Business units table initialized');
    return true;
  } catch (error) {
    console.error('Error initializing business units table:', error.message);
    return false;
  }
};

// Export helper functions
export {
  getBusinessUnits,
  getGroupSavingsBUId
};