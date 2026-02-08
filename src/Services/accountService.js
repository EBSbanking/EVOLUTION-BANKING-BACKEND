// services/accountService.js
import Counter from '../models/Counter.js';
import { getProductTypeByProdIdInternal } from '../controllers/ProductTypeMappingController.js';
import { sequelize } from '../models/index.js';
import Account from '../models/Accounts.js'; // Your Account model
import CustomerAccount from '../models/CustomerAccount.js'; // Import CustomerAccount model

// Example of existing imports and constants
const ACCOUNT_NUMBER_LENGTH = 10;
const ACCOUNT_ID_LENGTH = 6;

// ✅ NEW: Account Sync Service Integration
class AccountSyncService {
  static async syncBalances(accountNumber, transaction = null) {
    try {
      console.log(`🔄 AccountSyncService: Syncing balances for account ${accountNumber}`);
      
      const customerAccount = await CustomerAccount.findOne({
        where: { account_number: accountNumber },
        transaction
      });
      
      const coreAccount = await Account.findOne({
        where: { account_number: accountNumber },
        transaction
      });
      
      if (customerAccount && coreAccount) {
        // Sync from core to customer
        await customerAccount.update({
          ledger_balance: coreAccount.ledger_balance,
          available_balance: coreAccount.available_balance,
          cleared_balance: coreAccount.cleared_balance,
          current_balance: coreAccount.available_balance,
          last_transaction_date: coreAccount.last_activity_date,
          updated_at: new Date()
        }, { transaction });
        
        console.log(`✅ AccountSyncService: Balances synchronized for ${accountNumber}`);
        return true;
      } else if (customerAccount && !coreAccount) {
        console.warn(`⚠️ AccountSyncService: Customer account exists but core account missing for ${accountNumber}`);
        return false;
      } else if (!customerAccount && coreAccount) {
        console.warn(`⚠️ AccountSyncService: Core account exists but customer account missing for ${accountNumber}`);
        return false;
      }
      
      console.warn(`⚠️ AccountSyncService: Both accounts missing for ${accountNumber}`);
      return false;
    } catch (error) {
      console.error(`❌ AccountSyncService: Error syncing balances for ${accountNumber}:`, error.message);
      throw error;
    }
  }
  
  static async syncStatus(accountNumber, newStatus, transaction = null) {
    try {
      console.log(`🔄 AccountSyncService: Syncing status for account ${accountNumber} to ${newStatus}`);
      
      // Update both tables
      await CustomerAccount.update(
        { 
          REC_ST: newStatus, 
          substatus: newStatus,
          updated_at: new Date()
        },
        { where: { account_number: accountNumber }, transaction }
      );
      
      await Account.update(
        { 
          rec_st: newStatus,
          updated_at: new Date()
        },
        { where: { account_number: accountNumber }, transaction }
      );
      
      console.log(`✅ AccountSyncService: Status synchronized to ${newStatus} for ${accountNumber}`);
      return true;
    } catch (error) {
      console.error(`❌ AccountSyncService: Error syncing status for ${accountNumber}:`, error.message);
      throw error;
    }
  }
  
  static async syncAllAccounts(accountNumber, transaction = null) {
    try {
      console.log(`🔄 AccountSyncService: Full sync for account ${accountNumber}`);
      
      const customerAccount = await CustomerAccount.findOne({
        where: { account_number: accountNumber },
        transaction
      });
      
      const coreAccount = await Account.findOne({
        where: { account_number: accountNumber },
        transaction
      });
      
      if (customerAccount && coreAccount) {
        // Sync from core to customer
        await customerAccount.update({
          ledger_balance: coreAccount.ledger_balance,
          available_balance: coreAccount.available_balance,
          cleared_balance: coreAccount.cleared_balance,
          current_balance: coreAccount.available_balance,
          last_transaction_date: coreAccount.last_activity_date,
          currency: coreAccount.currency,
          online_enabled: coreAccount.online_enabled,
          dr_allowed: coreAccount.dr_allowed,
          cr_allowed: coreAccount.cr_allowed,
          updated_at: new Date()
        }, { transaction });
        
        console.log(`✅ AccountSyncService: Full sync completed for ${accountNumber}`);
        return {
          success: true,
          customer_account_id: customerAccount.id,
          core_account_id: coreAccount.id
        };
      }
      
      return { success: false, message: 'Accounts not found' };
    } catch (error) {
      console.error(`❌ AccountSyncService: Error in full sync for ${accountNumber}:`, error.message);
      throw error;
    }
  }
}

// Existing generateAccountNumber function
export async function generateAccountNumber(accountType) {
  const prefixMap = {
    'ACCT_LOAN': '300',
    'ACCT_TERM_DEPOSIT': '200',
    'ACCT_SAVINGS': '100'
  };

  if (!prefixMap[accountType]) {
    throw new Error(`Invalid account type: ${accountType}`);
  }

  const counter = await Counter.findByIdAndUpdate(
    accountType,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const prefix = prefixMap[accountType];
  const paddedSequence = String(counter.seq).padStart(7, '0');
  return `${prefix}${paddedSequence}`;
}

// ✅ Add this function here
export async function generateAccountNumberByProdId(prodId) {
  const product = await getProductTypeByProdIdInternal(prodId);

  // Use PROD_CAT_TY or PROD_DESC
  const productType = (product.PROD_CAT_TY || product.PROD_DESC || '').toUpperCase();

  const productConfig = {
    'LOAN': 'ACCT_LOAN',
    'TERM_DEPOSIT': 'ACCT_TERM_DEPOSIT',
    'SAVINGS': 'ACCT_SAVINGS'
  };

  const accountType = productConfig[productType];
  if (!accountType) throw new Error(`Invalid product type: ${productType}`);

  const accountNumber = await generateAccountNumber(accountType);
  return {
    numericValue: parseInt(accountNumber),
    formattedString: accountNumber
  };
}

// ✅ ENHANCED: Create or Update Account with Synchronization
export async function createOrUpdateAccount(accountData, transaction = null, syncWithCustomerAccount = true) {
  try {
    console.log('AccountService: Creating/updating account with data:', accountData);
    
    // Validate required fields
    if (!accountData.account_number) {
      throw new Error('Account number is required');
    }
    
    if (!accountData.customer_id) {
      throw new Error('Customer ID is required');
    }
    
    // Ensure branch is provided (required field)
    if (!accountData.branch && accountData.branch !== 0) {
      console.warn('AccountService: Branch not provided, using default branch 1');
      accountData.branch = 1; // Default branch
    }
    
    // Check if account exists
    const whereClause = { 
      account_number: accountData.account_number 
    };
    
    const existingAccount = await Account.findOne({ 
      where: whereClause,
      transaction 
    });

    let result;
    
    if (!existingAccount) {
      // Create new account with all required fields
      const newAccountData = {
        customer_id: accountData.customer_id,
        account_number: accountData.account_number,
        acct_no: accountData.account_number,
        acct_nm: accountData.acct_nm || accountData.account_name || 'Unknown Account',
        account_type: accountData.account_type || 'SAVINGS',
        product_type: accountData.product_type || 'SAVINGS',
        product: accountData.product || 'Savings Account',
        branch: accountData.branch,
        ledger_balance: parseFloat(accountData.ledger_balance || 0),
        available_balance: parseFloat(accountData.available_balance || 0),
        cleared_balance: parseFloat(accountData.cleared_balance || 0),
        rec_st: accountData.rec_st || 'ACTIVE',
        currency: accountData.currency || 'NGN',
        online_enabled: accountData.online_enabled !== undefined ? accountData.online_enabled : 1,
        dr_allowed: accountData.dr_allowed !== undefined ? accountData.dr_allowed : 1,
        cr_allowed: accountData.cr_allowed !== undefined ? accountData.cr_allowed : 1,
        last_activity_date: accountData.last_activity_date || new Date(),
        created_by: accountData.created_by || 'SYSTEM',
        product_desc: accountData.product_desc || 'Account created by loan system',
        // Set other fields with defaults or provided values
        customer_code: accountData.customer_code || null,
        opening_amount: parseFloat(accountData.opening_amount || 0),
        interest_rate: parseFloat(accountData.interest_rate || 0),
        accrued_interest: parseFloat(accountData.accrued_interest || 0),
        overdraft_limit: parseFloat(accountData.overdraft_limit || 0),
        substatus: accountData.substatus || 'Active',
        sms_alert: accountData.sms_alert || 'No',
        email_alert: accountData.email_alert || 'No',
        is_overdraft_allowed: accountData.is_overdraft_allowed || 0,
        auto_approve: accountData.auto_approve || 0,
        disbursement_method: accountData.disbursement_method || 'Cheque',
        creation_date: accountData.creation_date || new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };
      
      // Add optional fields if provided
      if (accountData.acct_id) newAccountData.acct_id = accountData.acct_id;
      if (accountData.cust_id) newAccountData.cust_id = accountData.cust_id;
      if (accountData.bu_id) newAccountData.bu_id = accountData.bu_id;
      if (accountData.secondary_branch) newAccountData.secondary_branch = accountData.secondary_branch;
      if (accountData.loan_amount) newAccountData.loan_amount = parseFloat(accountData.loan_amount);
      if (accountData.agreed_interest_rate) newAccountData.agreed_interest_rate = parseFloat(accountData.agreed_interest_rate);
      
      const account = await Account.create(newAccountData, { transaction });
      
      console.log(`✅ AccountService: Created account ${account.account_number} with ID: ${account.id}`);
      
      result = {
        success: true,
        action: 'created',
        account: account,
        message: `Account ${account.account_number} created successfully`
      };
      
      // ✅ NEW: Synchronize with customer_accounts if requested
      if (syncWithCustomerAccount) {
        try {
          await syncToCustomerAccount(account, accountData, transaction);
        } catch (syncError) {
          console.warn(`⚠️ AccountService: Could not sync to customer_accounts: ${syncError.message}`);
          // Continue anyway - core account was created
        }
      }
      
    } else {
      // Update existing account
      const updateData = {
        ledger_balance: parseFloat(accountData.ledger_balance || existingAccount.ledger_balance),
        available_balance: parseFloat(accountData.available_balance || existingAccount.available_balance),
        cleared_balance: parseFloat(accountData.cleared_balance || existingAccount.cleared_balance),
        last_activity_date: accountData.last_activity_date || new Date(),
        updated_at: new Date()
      };
      
      // Optional updates
      if (accountData.acct_nm) updateData.acct_nm = accountData.acct_nm;
      if (accountData.rec_st) updateData.rec_st = accountData.rec_st;
      if (accountData.account_type) updateData.account_type = accountData.account_type;
      if (accountData.currency) updateData.currency = accountData.currency;
      
      await existingAccount.update(updateData, { transaction });
      
      console.log(`✅ AccountService: Updated account ${existingAccount.account_number}`);
      
      result = {
        success: true,
        action: 'updated',
        account: existingAccount,
        message: `Account ${existingAccount.account_number} updated successfully`
      };
      
      // ✅ NEW: Synchronize with customer_accounts if requested
      if (syncWithCustomerAccount) {
        try {
          await AccountSyncService.syncBalances(existingAccount.account_number, transaction);
        } catch (syncError) {
          console.warn(`⚠️ AccountService: Could not sync balances to customer_accounts: ${syncError.message}`);
        }
      }
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ AccountService Error in createOrUpdateAccount:', error.message);
    console.error('Error stack:', error.stack);
    
    // If model operation fails, fallback to raw SQL
    try {
      console.log('🔄 AccountService: Falling back to raw SQL...');
      return await createOrUpdateAccountRawSQL(accountData, transaction, syncWithCustomerAccount);
    } catch (sqlError) {
      console.error('❌ AccountService: Raw SQL fallback also failed:', sqlError.message);
      throw new Error(`Account creation/update failed: ${error.message} (SQL fallback: ${sqlError.message})`);
    }
  }
}

// ✅ NEW: Helper function to sync to customer_accounts
async function syncToCustomerAccount(coreAccount, accountData, transaction = null) {
  try {
    console.log(`🔄 AccountService: Syncing to customer_accounts for ${coreAccount.account_number}`);
    
    // Check if customer account already exists
    const existingCustomerAccount = await CustomerAccount.findOne({
      where: { account_number: coreAccount.account_number },
      transaction
    });
    
    if (existingCustomerAccount) {
      // Update existing customer account
      await existingCustomerAccount.update({
        ledger_balance: coreAccount.ledger_balance,
        available_balance: coreAccount.available_balance,
        cleared_balance: coreAccount.cleared_balance,
        current_balance: coreAccount.available_balance,
        REC_ST: coreAccount.rec_st,
        ACCOUNT_TYPE: coreAccount.account_type,
        currency: coreAccount.currency,
        core_account_id: coreAccount.id,
        last_transaction_date: coreAccount.last_activity_date,
        updated_at: new Date()
      }, { transaction });
      
      console.log(`✅ AccountService: Updated existing customer account for ${coreAccount.account_number}`);
    } else {
      // Create new customer account
      const customerAccountData = {
        customer_id: coreAccount.customer_id,
        account_number: coreAccount.account_number,
        ACCT_NM: coreAccount.acct_nm || accountData.acct_nm || 'Unknown Account',
        ACCOUNT_TYPE: coreAccount.account_type,
        product_type: coreAccount.product_type,
        product: coreAccount.product,
        branch: coreAccount.branch,
        ledger_balance: coreAccount.ledger_balance,
        available_balance: coreAccount.available_balance,
        cleared_balance: coreAccount.cleared_balance,
        current_balance: coreAccount.available_balance,
        REC_ST: coreAccount.rec_st,
        currency: coreAccount.currency,
        online_enabled: coreAccount.online_enabled,
        DR_ALLOWED: coreAccount.dr_allowed,
        CR_ALLOWED: coreAccount.cr_allowed,
        core_account_id: coreAccount.id,
        last_transaction_date: coreAccount.last_activity_date,
        created_by: accountData.created_by || 'SYSTEM',
        created_at: new Date(),
        updated_at: new Date()
      };
      
      await CustomerAccount.create(customerAccountData, { transaction });
      
      console.log(`✅ AccountService: Created new customer account for ${coreAccount.account_number}`);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ AccountService: Error syncing to customer_accounts:`, error.message);
    throw error;
  }
}

// ✅ ENHANCED: Fallback function using raw SQL with sync
async function createOrUpdateAccountRawSQL(accountData, transaction = null, syncWithCustomerAccount = true) {
  const sqlDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  // Check if account exists
  const checkQuery = `
    SELECT id FROM accounts 
    WHERE account_number = '${accountData.account_number}' 
       OR acct_no = '${accountData.account_number}'
    LIMIT 1
  `;
  
  const [existingAccount] = await sequelize.query(checkQuery, {
    transaction,
    type: sequelize.QueryTypes.SELECT
  });
  
  let result;
  
  if (existingAccount) {
    // Update existing account
    const updateQuery = `
      UPDATE accounts 
      SET ledger_balance = ${parseFloat(accountData.ledger_balance || 0)},
          available_balance = ${parseFloat(accountData.available_balance || 0)},
          cleared_balance = ${parseFloat(accountData.cleared_balance || 0)},
          last_activity_date = '${sqlDate}',
          updated_at = '${sqlDate}'
      WHERE account_number = '${accountData.account_number}' 
         OR acct_no = '${accountData.account_number}'
    `;
    
    await sequelize.query(updateQuery, { transaction });
    
    console.log(`✅ AccountService (raw SQL): Updated account ${accountData.account_number}`);
    
    result = {
      success: true,
      action: 'updated',
      account: { account_number: accountData.account_number, id: existingAccount.id },
      message: `Account ${accountData.account_number} updated successfully (raw SQL)`
    };
    
    // Sync if requested
    if (syncWithCustomerAccount) {
      try {
        await syncCustomerAccountRawSQL(accountData, existingAccount.id, transaction);
      } catch (syncError) {
        console.warn(`⚠️ AccountService (raw SQL): Sync failed: ${syncError.message}`);
      }
    }
  } else {
    // Create new account
    const createQuery = `
      INSERT INTO accounts (
        customer_id, account_number, acct_no, acct_nm,
        account_type, product_type, product,
        ledger_balance, available_balance, cleared_balance,
        rec_st, currency, online_enabled,
        dr_allowed, cr_allowed, last_activity_date,
        created_at, updated_at, branch,
        created_by, product_desc
      ) VALUES (
        ${accountData.customer_id || 'NULL'},
        '${accountData.account_number}',
        '${accountData.account_number}',
        '${accountData.acct_nm || accountData.account_name || 'Unknown Account'}',
        '${accountData.account_type || 'SAVINGS'}',
        '${accountData.product_type || 'SAVINGS'}',
        '${accountData.product || 'Savings Account'}',
        ${parseFloat(accountData.ledger_balance || 0)},
        ${parseFloat(accountData.available_balance || 0)},
        ${parseFloat(accountData.cleared_balance || 0)},
        '${accountData.rec_st || 'ACTIVE'}',
        '${accountData.currency || 'NGN'}',
        ${accountData.online_enabled !== undefined ? accountData.online_enabled : 1},
        ${accountData.dr_allowed !== undefined ? accountData.dr_allowed : 1},
        ${accountData.cr_allowed !== undefined ? accountData.cr_allowed : 1},
        '${sqlDate}',
        '${sqlDate}',
        '${sqlDate}',
        ${accountData.branch || 1},
        '${accountData.created_by || 'SYSTEM'}',
        '${accountData.product_desc || 'Account created by loan system'}'
      )
    `;
    
    const [insertResult] = await sequelize.query(createQuery, { transaction });
    const insertId = insertResult.insertId;
    
    console.log(`✅ AccountService (raw SQL): Created account ${accountData.account_number} with ID: ${insertId}`);
    
    result = {
      success: true,
      action: 'created',
      account: { account_number: accountData.account_number, id: insertId },
      message: `Account ${accountData.account_number} created successfully (raw SQL)`
    };
    
    // Sync if requested
    if (syncWithCustomerAccount) {
      try {
        await syncCustomerAccountRawSQL(accountData, insertId, transaction);
      } catch (syncError) {
        console.warn(`⚠️ AccountService (raw SQL): Sync failed: ${syncError.message}`);
      }
    }
  }
  
  return result;
}

// ✅ NEW: Raw SQL sync function
async function syncCustomerAccountRawSQL(accountData, coreAccountId, transaction = null) {
  try {
    const sqlDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    // Check if customer account exists
    const checkQuery = `
      SELECT id FROM customer_accounts 
      WHERE account_number = '${accountData.account_number}'
      LIMIT 1
    `;
    
    const [existingCustomerAccount] = await sequelize.query(checkQuery, {
      transaction,
      type: sequelize.QueryTypes.SELECT
    });
    
    if (existingCustomerAccount) {
      // Update existing
      const updateQuery = `
        UPDATE customer_accounts 
        SET ledger_balance = ${parseFloat(accountData.ledger_balance || 0)},
            available_balance = ${parseFloat(accountData.available_balance || 0)},
            cleared_balance = ${parseFloat(accountData.cleared_balance || 0)},
            current_balance = ${parseFloat(accountData.available_balance || 0)},
            REC_ST = '${accountData.rec_st || 'ACTIVE'}',
            ACCOUNT_TYPE = '${accountData.account_type || 'SAVINGS'}',
            currency = '${accountData.currency || 'NGN'}',
            core_account_id = ${coreAccountId},
            last_transaction_date = '${sqlDate}',
            updated_at = '${sqlDate}'
        WHERE account_number = '${accountData.account_number}'
      `;
      
      await sequelize.query(updateQuery, { transaction });
    } else {
      // Create new
      const createQuery = `
        INSERT INTO customer_accounts (
          customer_id, account_number, ACCT_NM, ACCOUNT_TYPE,
          product_type, product, branch,
          ledger_balance, available_balance, cleared_balance, current_balance,
          REC_ST, currency, online_enabled,
          DR_ALLOWED, CR_ALLOWED, core_account_id,
          last_transaction_date, created_by, created_at, updated_at
        ) VALUES (
          ${accountData.customer_id || 'NULL'},
          '${accountData.account_number}',
          '${accountData.acct_nm || accountData.account_name || 'Unknown Account'}',
          '${accountData.account_type || 'SAVINGS'}',
          '${accountData.product_type || 'SAVINGS'}',
          '${accountData.product || 'Savings Account'}',
          ${accountData.branch || 1},
          ${parseFloat(accountData.ledger_balance || 0)},
          ${parseFloat(accountData.available_balance || 0)},
          ${parseFloat(accountData.cleared_balance || 0)},
          ${parseFloat(accountData.available_balance || 0)},
          '${accountData.rec_st || 'ACTIVE'}',
          '${accountData.currency || 'NGN'}',
          ${accountData.online_enabled !== undefined ? accountData.online_enabled : 1},
          ${accountData.dr_allowed !== undefined ? accountData.dr_allowed : 1},
          ${accountData.cr_allowed !== undefined ? accountData.cr_allowed : 1},
          ${coreAccountId},
          '${sqlDate}',
          '${accountData.created_by || 'SYSTEM'}',
          '${sqlDate}',
          '${sqlDate}'
        )
      `;
      
      await sequelize.query(createQuery, { transaction });
    }
    
    console.log(`✅ AccountService (raw SQL): Synced to customer_accounts for ${accountData.account_number}`);
    return true;
  } catch (error) {
    console.error(`❌ AccountService (raw SQL): Error syncing to customer_accounts:`, error.message);
    throw error;
  }
}

// ✅ ENHANCED: Get account by account number with sync option
export async function getAccountByNumber(accountNumber, transaction = null, syncIfMissing = false) {
  try {
    const account = await Account.findOne({
      where: { account_number: accountNumber },
      transaction
    });
    
    if (!account) {
      console.log(`AccountService: Account ${accountNumber} not found`);
      
      // Optionally check customer_accounts if syncIfMissing is true
      if (syncIfMissing) {
        try {
          const customerAccount = await CustomerAccount.findOne({
            where: { account_number: accountNumber },
            transaction
          });
          
          if (customerAccount) {
            console.log(`🔄 AccountService: Found in customer_accounts, creating in accounts...`);
            // Create in accounts table from customer_accounts
            const accountData = {
              customer_id: customerAccount.customer_id,
              account_number: customerAccount.account_number,
              acct_nm: customerAccount.ACCT_NM,
              account_type: customerAccount.ACCOUNT_TYPE,
              product_type: customerAccount.product_type,
              product: customerAccount.product,
              branch: customerAccount.branch,
              ledger_balance: customerAccount.ledger_balance,
              available_balance: customerAccount.available_balance,
              cleared_balance: customerAccount.cleared_balance,
              rec_st: customerAccount.REC_ST,
              currency: customerAccount.currency,
              online_enabled: customerAccount.online_enabled,
              dr_allowed: customerAccount.DR_ALLOWED,
              cr_allowed: customerAccount.CR_ALLOWED,
              created_by: 'SYSTEM_SYNC'
            };
            
            const result = await createOrUpdateAccount(accountData, transaction, false);
            return result.account;
          }
        } catch (syncError) {
          console.warn(`⚠️ AccountService: Sync attempt failed: ${syncError.message}`);
        }
      }
      
      return null;
    }
    
    return account;
  } catch (error) {
    console.error('❌ AccountService Error in getAccountByNumber:', error.message);
    
    // Fallback to raw SQL
    try {
      const query = `SELECT * FROM accounts WHERE account_number = '${accountNumber}' LIMIT 1`;
      const [account] = await sequelize.query(query, {
        transaction,
        type: sequelize.QueryTypes.SELECT
      });
      
      return account || null;
    } catch (sqlError) {
      console.error('AccountService: Raw SQL fallback failed:', sqlError.message);
      return null;
    }
  }
}

// ✅ ENHANCED: Update account balance with sync
export async function updateAccountBalance(accountNumber, amount, transactionType = 'CREDIT', transaction = null, syncWithCustomerAccount = true) {
  try {
    const account = await getAccountByNumber(accountNumber, transaction);
    
    if (!account) {
      throw new Error(`Account ${accountNumber} not found`);
    }
    
    const currentBalance = parseFloat(account.ledger_balance || 0);
    let newBalance;
    
    if (transactionType.toUpperCase() === 'CREDIT') {
      newBalance = currentBalance + parseFloat(amount);
    } else if (transactionType.toUpperCase() === 'DEBIT') {
      newBalance = currentBalance - parseFloat(amount);
    } else {
      throw new Error(`Invalid transaction type: ${transactionType}`);
    }
    
    // Update using model if available
    if (account.update) {
      await account.update({
        ledger_balance: newBalance,
        available_balance: newBalance,
        cleared_balance: newBalance,
        last_activity_date: new Date(),
        updated_at: new Date()
      }, { transaction });
    } else {
      // Raw SQL update
      const updateQuery = `
        UPDATE accounts 
        SET ledger_balance = ${newBalance},
            available_balance = ${newBalance},
            cleared_balance = ${newBalance},
            last_activity_date = NOW(),
            updated_at = NOW()
        WHERE account_number = '${accountNumber}'
      `;
      
      await sequelize.query(updateQuery, { transaction });
    }
    
    console.log(`✅ AccountService: Updated account ${accountNumber} balance: ${transactionType} ₦${amount}, New balance: ₦${newBalance}`);
    
    // Sync to customer_accounts if requested
    if (syncWithCustomerAccount) {
      try {
        await AccountSyncService.syncBalances(accountNumber, transaction);
      } catch (syncError) {
        console.warn(`⚠️ AccountService: Could not sync after balance update: ${syncError.message}`);
      }
    }
    
    return {
      success: true,
      accountNumber,
      transactionType,
      amount,
      previousBalance: currentBalance,
      newBalance,
      message: `Account ${accountNumber} balance updated successfully`
    };
  } catch (error) {
    console.error('❌ AccountService Error in updateAccountBalance:', error.message);
    throw error;
  }
}

// ✅ Get customer accounts
export async function getCustomerAccounts(customerId, transaction = null) {
  try {
    const accounts = await Account.findAll({
      where: { customer_id: customerId },
      transaction
    });
    
    return accounts;
  } catch (error) {
    console.error('❌ AccountService Error in getCustomerAccounts:', error.message);
    
    // Fallback to raw SQL
    try {
      const query = `SELECT * FROM accounts WHERE customer_id = ${customerId}`;
      const accounts = await sequelize.query(query, {
        transaction,
        type: sequelize.QueryTypes.SELECT
      });
      
      return accounts;
    } catch (sqlError) {
      console.error('AccountService: Raw SQL fallback failed:', sqlError.message);
      return [];
    }
  }
}

// ✅ NEW: Create dual accounts (both customer_accounts and accounts)
export async function createDualAccounts(accountData, transaction = null) {
  const internalTransaction = transaction || await sequelize.transaction();
  let shouldCommit = !transaction;
  
  try {
    console.log('AccountService: Creating dual accounts for:', accountData.account_number);
    
    // Step 1: Create core account
    const coreResult = await createOrUpdateAccount(accountData, internalTransaction, false);
    
    if (!coreResult.success) {
      throw new Error('Failed to create core account');
    }
    
    // Step 2: Create/update customer account
    const customerAccountData = {
      customer_id: accountData.customer_id,
      account_number: accountData.account_number,
      ACCT_NM: accountData.acct_nm || accountData.account_name || 'Unknown Account',
      ACCOUNT_TYPE: accountData.account_type || 'SAVINGS',
      product_type: accountData.product_type || 'SAVINGS',
      product: accountData.product || 'Savings Account',
      branch: accountData.branch || 1,
      ledger_balance: parseFloat(accountData.ledger_balance || 0),
      available_balance: parseFloat(accountData.available_balance || 0),
      cleared_balance: parseFloat(accountData.cleared_balance || 0),
      current_balance: parseFloat(accountData.available_balance || 0),
      REC_ST: accountData.rec_st || 'ACTIVE',
      currency: accountData.currency || 'NGN',
      online_enabled: accountData.online_enabled !== undefined ? accountData.online_enabled : 1,
      DR_ALLOWED: accountData.dr_allowed !== undefined ? accountData.dr_allowed : 1,
      CR_ALLOWED: accountData.cr_allowed !== undefined ? accountData.cr_allowed : 1,
      core_account_id: coreResult.account.id,
      created_by: accountData.created_by || 'SYSTEM'
    };
    
    // Check if customer account exists
    const existingCustomerAccount = await CustomerAccount.findOne({
      where: { account_number: accountData.account_number },
      transaction: internalTransaction
    });
    
    let customerAccount;
    
    if (existingCustomerAccount) {
      // Update existing
      customerAccount = await existingCustomerAccount.update(customerAccountData, { transaction: internalTransaction });
    } else {
      // Create new
      customerAccount = await CustomerAccount.create(customerAccountData, { transaction: internalTransaction });
    }
    
    // Commit if we started the transaction
    if (shouldCommit) {
      await internalTransaction.commit();
    }
    
    console.log(`✅ AccountService: Created dual accounts for ${accountData.account_number}`);
    
    return {
      success: true,
      core_account: coreResult.account,
      customer_account: customerAccount,
      message: 'Dual accounts created successfully'
    };
    
  } catch (error) {
    // Rollback if we started the transaction
    if (shouldCommit && internalTransaction && !internalTransaction.finished) {
      await internalTransaction.rollback();
    }
    
    console.error('❌ AccountService Error in createDualAccounts:', error.message);
    throw error;
  }
}

// Export AccountSyncService
export { AccountSyncService };