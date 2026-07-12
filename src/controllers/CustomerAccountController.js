import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import Customer from '../models/Customer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';
import SavingsProduct from '../models/SavingsProduct.js';
import GLAccount from '../models/GLAccount.js';
import Counter from '../models/Counter.js';
import NotificationService, { sendApprovalNotification } from '../Services/NotificationService.js';
import Approval from '../models/Approval.js';
// import Account from '../models/Accounts.js';

// Then inside your functions where you need Account, use dynamic import:
let Account;
try {
  const accountModule = await import('../models/Accounts.js');
  Account = accountModule.default;
  console.log('✅ Account dynamically imported');
} catch (error) {
  console.error('❌ Failed to import Account:', error.message);
  // Handle the error - maybe set Account to null and check before using
}

// ============================
// MODEL INITIALIZATION CHECK
// ============================

const checkModels = async () => {
  console.log('🔍 Checking model initialization...');
  
  try {
    const models = {
      CustomerAccount: CustomerAccount,
      Customer: Customer,
      AuditTrail: AuditTrail,
      SavingsProduct: SavingsProduct,
      GLAccount: GLAccount,
      Counter: Counter,
      Account: Account,
      sequelize: sequelize
    };

    for (const [name, model] of Object.entries(models)) {
      if (model) {
        if (typeof model === 'function' && model.name === 'Sequelize') {
          console.log(`  ✅ ${name}: Sequelize instance`);
        } else if (typeof model.findOne === 'function') {
          console.log(`  ✅ ${name}: Sequelize model with findOne`);
        } else if (typeof model === 'function') {
          console.log(`  ⚠️ ${name}: Function but not a Sequelize model`);
        } else {
          console.log(`  ❌ ${name}: Not properly initialized`);
        }
      } else {
        console.log(`  ❌ ${name}: Undefined/null`);
      }
    }

    await sequelize.authenticate();
    console.log('✅ Database connection successful');

    if (Customer && typeof Customer.findOne === 'function') {
      console.log('✅ Customer model has findOne method');
    } else {
      console.log('❌ Customer model missing findOne method - will use raw query');
    }

    return true;
  } catch (error) {
    console.error('❌ Model initialization check failed:', error.message);
    return false;
  }
};

// ============================
// ACCOUNT NUMBER GENERATION FUNCTIONS
// ============================

const USE_NUBAN = true;
const BANK_CODE = '011';

const calculateNUBANCheckDigit = (baseNumber) => {
  const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3];
  let sum = 0;
  for (let i = 0; i < baseNumber.length; i++) {
    sum += Number(baseNumber[i]) * weights[i];
  }
  const mod = sum % 10;
  return mod === 0 ? '0' : String(10 - mod);
};

/**
 * Generate account number for customer - FIXED VERSION (NO Op.or USAGE)
 */
const generateAccountNumberForCustomer = async (customerId, accountType = 'SAVINGS', transaction = null) => {
  console.log(`🔢 generateAccountNumberForCustomer called with:`, { 
    customerId, 
    accountType, 
    hasTransaction: !!transaction 
  });
  
  try {
    // Get CustomerAccount model (already imported)
    let accountNumber;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    // Determine prefix based on account type
    let prefix = '2'; // Default for savings
    const upperAccountType = accountType ? accountType.toUpperCase() : 'SAVINGS';
    
    if (upperAccountType === 'CURRENT') {
      prefix = '1';
    } else if (upperAccountType === 'LOAN') {
      prefix = '3';
    } else if (upperAccountType === 'FIXED_DEPOSIT' || upperAccountType === 'TERM_DEPOSIT') {
      prefix = '5';
    }
    
    console.log(`🔢 Using prefix ${prefix} for account type: ${upperAccountType}`);
    
    while (!isUnique && attempts < maxAttempts) {
      // Generate random part - 9 digits
      const randomPart = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
      accountNumber = prefix + randomPart.slice(0, 9); // Ensure exactly 10 digits
      
      console.log(`🔍 Checking if account number ${accountNumber} exists (attempt ${attempts + 1})...`);
      
      // SIMPLE QUERY - NO Op.or USED HERE
      const queryOptions = { 
        where: { account_number: accountNumber },
        attributes: ['id']
      };
      
      // Add transaction if provided
      if (transaction) {
        queryOptions.transaction = transaction;
      }
      
      try {
        // Execute query
        const existing = await CustomerAccount.findOne(queryOptions);
        
        if (!existing) {
          isUnique = true;
          console.log(`✅ Generated unique account number: ${accountNumber}`);
        } else {
          console.log(`⚠️ Account number ${accountNumber} already exists, retrying...`);
        }
      } catch (queryError) {
        console.error(`❌ Error checking account number:`, queryError.message);
        // If there's an error checking, assume it's unique and continue
        isUnique = true;
      }
      
      attempts++;
    }
    
    if (!isUnique) {
      // Fallback to timestamp-based generation
      console.log('⚠️ Could not generate unique random number, using timestamp fallback');
      const timestamp = Date.now().toString().slice(-9);
      accountNumber = prefix + timestamp.padStart(9, '0');
    }

    // Generate ACCT_ID (6 digits)
    let ACCT_ID;
    const acctIdCounter = await Counter.findOne({
      where: { counter_type: 'ACCT_ID_SEQ' },
      transaction
    });

    if (!acctIdCounter) {
      const newCounter = await Counter.create({
        counter_type: 'ACCT_ID_SEQ',
        seq: 1000,
        description: 'Counter for ACCT_ID'
      }, { transaction });
      ACCT_ID = newCounter.seq.toString().padStart(6, '0');
    } else {
      await acctIdCounter.increment('seq', { by: 1, transaction });
      await acctIdCounter.reload({ transaction });
      ACCT_ID = acctIdCounter.seq.toString().padStart(6, '0');
    }
    
    console.log(`✅ Generated Account for Customer ${customerId}: account_number=${accountNumber}, ACCT_ID=${ACCT_ID}, Type=${upperAccountType}`);
    
    // Return in multiple formats to ensure compatibility
    return {
      ACCT_NO: accountNumber,
      account_number: accountNumber,
      accountNumber: accountNumber,
      ACCT_ID: ACCT_ID,
      CUST_ID: customerId,
      accountType: upperAccountType,
      success: true,
      message: 'Generated customer account number'
    };
    
  } catch (error) {
    console.error('❌ Error in generateAccountNumberForCustomer:', error);
    
    // Emergency fallback - use timestamp
    const timestamp = Date.now().toString().slice(-9);
    const prefix = accountType?.toUpperCase() === 'SAVINGS' ? '2' : 
                  accountType?.toUpperCase() === 'CURRENT' ? '1' : '3';
    
    const emergencyAcctNo = `${prefix}${timestamp}`.padStart(10, '0');
    const emergencyAcctId = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    
    console.log(`🆘 Using emergency fallback account number: ${emergencyAcctNo}`);
    
    return {
      ACCT_NO: emergencyAcctNo,
      account_number: emergencyAcctNo,
      accountNumber: emergencyAcctNo,
      ACCT_ID: emergencyAcctId,
      CUST_ID: customerId,
      accountType: accountType?.toUpperCase() || 'SAVINGS',
      success: true,
      isFallback: true,
      message: 'Generated emergency fallback account number'
    };
  }
};

// ============================
// UTILITY FUNCTIONS
// ============================

export const resetAccountCounters = async () => {
  const transaction = await sequelize.transaction();
  
  try {
    const counterTypes = ['ACCT_SAVINGS', 'ACCT_CURRENT', 'ACCT_LOAN', 'ACCT_ID_SEQ'];
    
    for (const counterType of counterTypes) {
      const [counter, created] = await Counter.findOrCreate({
        where: { counter_type: counterType },
        defaults: {
          seq: 1000,
          description: `Counter for ${counterType}`
        },
        transaction
      });

      if (!created) {
        await Counter.update(
          { seq: 1000 },
          { where: { counter_type: counterType }, transaction }
        );
      }
    }

    await transaction.commit();
    console.log('✅ Counters reset successfully');
    return { success: true, message: 'Counters reset successfully' };
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error resetting counters:', error);
    return { success: false, message: error.message };
  }
};

export const findDuplicateAccounts = async () => {
  try {
    const duplicates = await sequelize.query(`
      SELECT account_number, COUNT(*) as count, 
             GROUP_CONCAT(id) as account_ids
      FROM accounts
      GROUP BY account_number
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    console.log(`Found ${duplicates.length} duplicate account numbers`);
    return duplicates;
  } catch (error) {
    console.error('Error finding duplicates:', error);
    return [];
  }
};

// ============================
// HEALTH CHECK ENDPOINT
// ============================

export const healthCheck = async (req, res) => {
  try {
    const modelStatus = await checkModels();
    
    return res.status(200).json({
      success: true,
      message: 'Customer Account Controller Health Check',
      timestamp: new Date().toISOString(),
      models: {
        CustomerAccount: !!CustomerAccount,
        Customer: !!Customer,
        AuditTrail: !!AuditTrail,
        SavingsProduct: !!SavingsProduct,
        GLAccount: !!GLAccount,
        Counter: !!Counter,
        Account: !!Account,
        sequelize: !!sequelize
      },
      database: {
        connected: true,
        dialect: sequelize.getDialect(),
        database: sequelize.getDatabaseName()
      },
      status: modelStatus ? 'HEALTHY' : 'DEGRADED'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// ============================
// MAIN CREATE ACCOUNT FUNCTION
// ============================

export const createCustomerAccount = async (req, res) => {
  console.log('🚀 Starting createCustomerAccount with accounts table sync...');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));

  await checkModels();

  const transaction = await sequelize.transaction();

  try {
    const customerAccounts = Array.isArray(req.body) ? req.body : [req.body];
    const createdAccounts = [];
    const createdCoreAccounts = [];
    const now = new Date();
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';

    for (const accountData of customerAccounts) {
      const {
        CUST_ID,
        ACCT_NM,
        BU_ID = '001',
        ACCOUNT_TYPE = 'SAVINGS',
        PRODUCT_DESC,
        REC_ST = 'PENDING',
        PROD_ID = '',
        currency = 'NGN',
        opening_amount = 0,
        product = '',
        branch = 1,
        product_type = 'SAVINGS',
      } = accountData;

      console.log(`📝 Processing account for customer: ${CUST_ID}`);

      // ✅ Validate required fields
      if (!CUST_ID || !ACCT_NM) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'CUST_ID and ACCT_NM are required.',
          account: 'new account',
        });
      }

      // ✅ Customer existence check
      let customerExists = false;
      let customerDetails = null;
      
      if (Customer && typeof Customer.findOne === 'function') {
        console.log('🔍 Checking customer using Customer model...');
        try {
          const customer = await Customer.findOne({
            where: {
              CUST_ID: String(CUST_ID).padStart(10, '0')
            },
            transaction
          });
          
          customerExists = !!customer;
          customerDetails = customer;
          if (customerExists) {
            console.log(`✅ Customer found via model: ${customer.CUST_ID}`);
          }
        } catch (modelError) {
          console.warn('⚠️ Customer model query failed, trying raw query:', modelError.message);
        }
      }

      // Raw query fallback
      if (!customerExists) {
        console.log('🔍 Checking customer using raw query...');
        try {
          const [results] = await sequelize.query(
            `SELECT * FROM customers 
             WHERE CUST_ID = :customerId 
                OR CUST_ID = :paddedId 
                OR TRIM(LEADING '0' FROM CUST_ID) = :cleanId 
             LIMIT 1`,
            {
              replacements: {
                customerId: String(CUST_ID),
                paddedId: String(CUST_ID).padStart(10, '0'),
                cleanId: String(CUST_ID).replace(/^0+/, '')
              },
              type: sequelize.QueryTypes.SELECT,
              transaction
            }
          );
          
          customerExists = !!results;
          customerDetails = results;
          if (customerExists) {
            console.log(`✅ Customer found via raw query: ${results.CUST_ID}`);
          }
        } catch (rawError) {
          console.error('❌ Raw customer query failed:', rawError.message);
        }
      }

      if (!customerExists) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Customer does not exist. CUST_ID: ${CUST_ID}`,
          CUST_ID,
          account: 'new account',
        });
      }

      // ✅ Validate ACCOUNT_TYPE
      const VALID_ACCOUNT_TYPES = ['SAVINGS', 'CURRENT', 'LOAN'];
      const normalizedAccountType = ACCOUNT_TYPE.toUpperCase();
      if (!VALID_ACCOUNT_TYPES.includes(normalizedAccountType)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Invalid ACCOUNT_TYPE. Must be one of ${VALID_ACCOUNT_TYPES.join(', ')}`,
          account: 'new account',
        });
      }

      // ✅ Generate account number - USING FIXED FUNCTION
      let finalAccountNumber;
      let finalAcctId;
      try {
        console.log(`🔢 Generating account number for customer ${CUST_ID}, type: ${normalizedAccountType}`);
        
        const generatedAccount = await generateAccountNumberForCustomer(
          CUST_ID,
          normalizedAccountType,
          transaction
        );

        console.log('📦 Generator response:', JSON.stringify(generatedAccount, null, 2));

        // Handle different possible return formats
        if (generatedAccount && generatedAccount.ACCT_NO) {
          finalAccountNumber = generatedAccount.ACCT_NO;
        } else if (generatedAccount && generatedAccount.account_number) {
          finalAccountNumber = generatedAccount.account_number;
        } else if (generatedAccount && generatedAccount.accountNumber) {
          finalAccountNumber = generatedAccount.accountNumber;
        } else if (typeof generatedAccount === 'string') {
          finalAccountNumber = generatedAccount;
        } else {
          console.error('❌ Unexpected generator return format:', generatedAccount);
          throw new Error('Account generator returned unexpected format');
        }

        finalAcctId = generatedAccount.ACCT_ID;

        if (!finalAccountNumber) {
          throw new Error('Generated account number is empty');
        }

        // Ensure it's a string and has proper length
        finalAccountNumber = String(finalAccountNumber).trim();
        if (finalAccountNumber.length !== 10) {
          console.warn(`⚠️ Generated account number length is ${finalAccountNumber.length}, expected 10`);
        }

        console.log(`✅ Auto-generated account number: ${finalAccountNumber} for customer ${CUST_ID}`);
      } catch (genError) {
        console.error('❌ Account generation error:', genError);
        await transaction.rollback();
        
        return res.status(500).json({
          success: false,
          message: `Failed to generate account number: ${genError.message}`,
          account: 'new account',
          debug: {
            error: genError.message,
            stack: process.env.NODE_ENV === 'development' ? genError.stack : undefined
          }
        });
      }

      // ✅ Check for duplicate account number in BOTH tables
      const existingCustomerAccount = await CustomerAccount.findOne({
        where: { account_number: finalAccountNumber },
        transaction
      });

      const existingCoreAccount = await Account.findOne({
        where: { account_number: finalAccountNumber },
        transaction
      });

      if (existingCustomerAccount || existingCoreAccount) {
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: 'Account already exists',
          reason: `The account number ${finalAccountNumber} already exists in ${existingCustomerAccount ? 'customer_accounts' : 'accounts'} table.`,
          account: finalAccountNumber,
        });
      }

      // ✅ Prepare data for customer_accounts table
      const newCustomerAccountData = {
        customer_id: parseInt(CUST_ID) || 0,
        customer_code: customerDetails?.CUST_NO || customerDetails?.cust_no || '',
        account_number: finalAccountNumber,
        ACCT_ID: finalAcctId,
        product_type: normalizedAccountType,
        product: PROD_ID || product || '',
        PRODUCT_DESC: PRODUCT_DESC || `${normalizedAccountType} Account: ${ACCT_NM}`,
        REC_ST: REC_ST.toUpperCase(),
        ACCOUNT_TYPE: normalizedAccountType,
        substatus: REC_ST === 'PENDING' ? 'Pending' : 'Active',
        branch: parseInt(BU_ID) || branch,
        currency: currency,
        opening_amount: parseFloat(opening_amount) || 0.0,
        cleared_balance: parseFloat(opening_amount) || 0.0,
        ledger_balance: parseFloat(opening_amount) || 0.0,
        available_balance: parseFloat(opening_amount) || 0.0,
        current_balance: parseFloat(opening_amount) || 0.0,
        INTEREST_RATE: 0.0,
        ACCRUED_INTEREST: 0.0,
        agreed_interest_rate: 0.0,
        online_enabled: true,
        auto_approve: false,
        sms_alert: 'No',
        email_alert: 'No',
        DR_ALLOWED: true,
        CR_ALLOWED: true,
        isOverdraftAllowed: false,
        created_by: userId,
        lastActivityDate: now,
        last_transaction_date: now,
        primary_relationship_manager: 1,
        overdraftLimit: 0.0,
        CURRENCY_COUNT: JSON.stringify({
          'OneThousandNaira': 0,
          'FiveHundredNaira': 0,
          'TwoHundredNaira': 0,
          'OneHundredNaira': 0,
          'FiftyNaira': 0,
          'TwentyNaira': 0,
          'TenNaira': 0,
          'FiveNaira': 0,
          'TOTAL_CURRENCY_COUNT': 0
        })
      };

      // ✅ Prepare data for accounts table
      const newCoreAccountData = {
        customer_id: parseInt(CUST_ID) || 0,
        account_number: finalAccountNumber,
        acct_no: finalAccountNumber,
        acct_nm: ACCT_NM,
        account_type: normalizedAccountType,
        product_type: product_type || normalizedAccountType,
        product: product || `${normalizedAccountType} Account`,
        branch: parseInt(BU_ID) || branch,
        ledger_balance: parseFloat(opening_amount) || 0.00,
        available_balance: parseFloat(opening_amount) || 0.00,
        cleared_balance: parseFloat(opening_amount) || 0.00,
        rec_st: REC_ST.toUpperCase(),
        currency: currency,
        online_enabled: true,
        dr_allowed: true,
        cr_allowed: true,
        last_activity_date: now,
        created_by: userId,
        created_at: now,
        updated_at: now
      };

      console.log('📝 Creating accounts with data:', {
        account_number: finalAccountNumber,
        customer_id: newCustomerAccountData.customer_id,
        balances: {
          opening_amount: parseFloat(opening_amount) || 0.0,
          ledger_balance: parseFloat(opening_amount) || 0.0,
          available_balance: parseFloat(opening_amount) || 0.0,
          cleared_balance: parseFloat(opening_amount) || 0.0
        }
      });

      // ✅ STEP 1: Create customer account record
      const newCustomerAccount = await CustomerAccount.create(newCustomerAccountData, { transaction });
      createdAccounts.push(newCustomerAccount);

      // ✅ STEP 2: Create core account record
      let newCoreAccount;
      try {
        newCoreAccount = await Account.create(newCoreAccountData, { transaction });
        createdCoreAccounts.push(newCoreAccount);
        console.log(`✅ Created core account record: ID ${newCoreAccount.id}`);
      } catch (coreAccountError) {
        console.error('❌ Failed to create core account record:', coreAccountError.message);
        await transaction.rollback();
        
        return res.status(500).json({
          success: false,
          message: 'Failed to create core account record',
          error: coreAccountError.message,
          account: finalAccountNumber,
          note: 'Both customer_accounts and accounts tables must be updated together.'
        });
      }

      // ✅ STEP 3: Update customer account with core account ID reference
      try {
        await CustomerAccount.update(
          {
            core_account_id: newCoreAccount.id,
            ledger_balance: newCoreAccount.ledger_balance,
            available_balance: newCoreAccount.available_balance,
            cleared_balance: newCoreAccount.cleared_balance,
            updated_at: now
          },
          {
            where: { id: newCustomerAccount.id },
            transaction
          }
        );
      } catch (updateError) {
        console.warn('⚠️ Could not update customer account with core reference:', updateError.message);
      }

      // ✅ STEP 4: Create audit trail
      try {
        if (AuditTrail && typeof AuditTrail.create === 'function') {
          await AuditTrail.create({
            event_id: Date.now(),
            user_id: userId,
            event_type: 'CUSTOMER_ACCOUNT_CREATE',
            action: 'Create Customer Account',
            old_value: null,
            new_value: {
              id: newCustomerAccount.id,
              account_number: newCustomerAccount.account_number,
              customer_id: newCustomerAccount.customer_id,
              account_type: newCustomerAccount.ACCOUNT_TYPE,
              balances: {
                ledger_balance: newCustomerAccount.ledger_balance,
                available_balance: newCustomerAccount.available_balance,
                cleared_balance: newCustomerAccount.cleared_balance
              },
              status: newCustomerAccount.REC_ST,
              created_at: newCustomerAccount.created_at
            },
            entity_type: 'CustomerAccount',
            entity_id: newCustomerAccount.id,
            status: 'SUCCESS',
            account_no: newCustomerAccount.account_number,
            description: `Created ${normalizedAccountType} customer account for customer ${CUST_ID}`,
          }, { transaction });

          // Audit for core account creation
          await AuditTrail.create({
            event_id: Date.now() + 1,
            user_id: userId,
            event_type: 'CORE_ACCOUNT_CREATE',
            action: 'Create Core Account',
            old_value: null,
            new_value: {
              id: newCoreAccount.id,
              account_number: newCoreAccount.account_number,
              customer_id: newCoreAccount.customer_id,
              account_type: newCoreAccount.account_type,
              balances: {
                ledger_balance: newCoreAccount.ledger_balance,
                available_balance: newCoreAccount.available_balance,
                cleared_balance: newCoreAccount.cleared_balance
              },
              status: newCoreAccount.rec_st,
              created_at: newCoreAccount.created_at
            },
            entity_type: 'Account',
            entity_id: newCoreAccount.id,
            status: 'SUCCESS',
            account_no: newCoreAccount.account_number,
            description: `Created ${normalizedAccountType} core account for customer ${CUST_ID}`,
          }, { transaction });
        }
      } catch (auditError) {
        console.warn('⚠️ Audit trail creation failed:', auditError.message);
      }
    }

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Customer accounts created successfully and synchronized with core accounts',
      count: createdAccounts.length,
      customer_accounts: createdAccounts.map(acc => ({
        id: acc.id,
        customer_id: acc.customer_id,
        account_number: acc.account_number,
        account_type: acc.ACCOUNT_TYPE,
        product_type: acc.product_type,
        status: acc.REC_ST,
        branch: acc.branch,
        currency: acc.currency,
        balances: {
          opening_amount: acc.opening_amount,
          ledger_balance: acc.ledger_balance || acc.opening_amount,
          available_balance: acc.available_balance || acc.opening_amount,
          cleared_balance: acc.cleared_balance || acc.opening_amount,
          current_balance: acc.current_balance || acc.opening_amount
        },
        core_account_id: acc.core_account_id,
        created_at: acc.created_at
      })),
      core_accounts: createdCoreAccounts.map(acc => ({
        id: acc.id,
        customer_id: acc.customer_id,
        account_number: acc.account_number,
        account_name: acc.acct_nm,
        account_type: acc.account_type,
        product_type: acc.product_type,
        product: acc.product,
        status: acc.rec_st,
        branch: acc.branch,
        balances: {
          ledger: acc.ledger_balance,
          available: acc.available_balance,
          cleared: acc.cleared_balance
        },
        created_at: acc.created_at
      })),
      note: 'Accounts synchronized between customer_accounts and accounts tables.'
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error in account creation:', error);

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Duplicate account number',
        error: error.errors.map(e => e.message),
      });
    }

    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }))
      });
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating accounts',
      error: error.message,
    });
  }
};

// ============================
// SIMPLIFIED ACCOUNT CREATION
// ============================

export const createCustomerAccountWithAutoNumbers = async (req, res) => {
  console.log('🚀 Starting createCustomerAccountWithAutoNumbers...');
  
  await checkModels();
  
  const transaction = await sequelize.transaction();

  try {
    const { CUST_ID, ACCOUNT_TYPE = 'SAVINGS', ...otherData } = req.body;

    if (!CUST_ID || !otherData.ACCT_NM) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'CUST_ID and ACCT_NM are required.',
      });
    }

    // Use the fixed generator
    const generatedAccount = await generateAccountNumberForCustomer(
      CUST_ID,
      ACCOUNT_TYPE,
      transaction
    );

    const account_number = generatedAccount.ACCT_NO || generatedAccount.account_number;
    const acct_id = generatedAccount.ACCT_ID;
    const openingAmount = parseFloat(otherData.opening_amount) || 0.0;

    const newAccount = await CustomerAccount.create({
      customer_id: parseInt(CUST_ID) || 0,
      account_number: account_number,
      ACCT_ID: acct_id,
      product_type: ACCOUNT_TYPE.toUpperCase(),
      product: otherData.PROD_ID || '',
      branch: parseInt(otherData.BU_ID) || 1,
      REC_ST: 'PENDING',
      ACCOUNT_TYPE: ACCOUNT_TYPE.toUpperCase(),
      PRODUCT_DESC: `${ACCOUNT_TYPE} Account: ${otherData.ACCT_NM}`,
      currency: otherData.currency || 'NGN',
      opening_amount: openingAmount,
      ledger_balance: openingAmount,
      available_balance: openingAmount,
      cleared_balance: openingAmount,
      online_enabled: true,
      DR_ALLOWED: true,
      CR_ALLOWED: true,
      created_by: req.user?.id || req.headers['x-user-id'] || 'system',
      created_at: new Date(),
      updated_at: new Date()
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        id: newAccount.id,
        customer_id: newAccount.customer_id,
        account_number: newAccount.account_number,
        account_type: newAccount.ACCOUNT_TYPE,
        status: newAccount.REC_ST,
        branch: newAccount.branch,
        currency: newAccount.currency,
        balances: {
          opening_amount: newAccount.opening_amount,
          ledger_balance: newAccount.ledger_balance,
          available_balance: newAccount.available_balance,
          cleared_balance: newAccount.cleared_balance
        },
        created_at: newAccount.created_at
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating account:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create account',
      error: error.message
    });
  }
};


export const getAccountByNumber = async (req, res) => {
  const { accountNumber } = req.params;

  try {
    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Account number parameter is required',
      });
    }

    console.log(`🔍 Searching for account: ${accountNumber}`);
    const cleanAccountNumber = accountNumber.trim();

    // ✅ SELECT columns including sms_alert
    const query = `
      SELECT 
        id,
        CUST_ID as customer_id,
        account_name,
        account_number,
        branch_id,
        status,
        opening_balance,
        ledger_balance,
        cleared_balance,
        currency as currency_code,
        created_at,
        updated_at,
        product_id,
        product_code,
        depositor_name,
        sms_alert
      FROM customer_accounts 
      WHERE account_number = ?
      LIMIT 1
    `;

    const [rows] = await sequelize.query(query, {
      replacements: [cleanAccountNumber],
      type: sequelize.QueryTypes.SELECT
    });

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Account not found: ${cleanAccountNumber}`,
      });
    }

    const account = rows;

    // Prepare response with fallback values for missing fields
    const responseData = {
      success: true,
      message: 'Account retrieved successfully',
      data: {
        id: account.id,
        account_number: account.account_number,
        account_name: account.account_name,
        customer_id: account.customer_id,
        
        // Basic fields
        status: account.status,
        account_type: 'SAVINGS',        // default
        product_type: 'SAVINGS',        // default
        product_name: '',
        product_description: '',
        product_code: account.product_code || '',
        
        branch_id: account.branch_id || '',
        branch_name: '',                // not in table
        bu_id: '',                      // not in table
        
        // Balances
        opening_balance: parseFloat(account.opening_balance) || 0,
        current_balance: parseFloat(account.ledger_balance) || 0,
        available_balance: parseFloat(account.ledger_balance) || 0,
        ledger_balance: parseFloat(account.ledger_balance) || 0,
        cleared_balance: parseFloat(account.cleared_balance) || 0,
        
        interest_rate: 0,
        accrued_interest: 0,
        currency_code: account.currency_code || 'NGN',
        
        is_online_enabled: true,
        allow_debit: true,
        allow_credit: true,
        
        account_opened_date: account.created_at,
        last_transaction_date: null,
        created_at: account.created_at,
        updated_at: account.updated_at,
        approved_at: null,
        
        created_by: '',
        created_by_name: '',
        approved_by: '',
        approved_by_name: '',
        
        prod_id: account.product_id,
        gl_account_id: null,
        gl_account_number: null,
        
        // ✅ SMS alert flag
        sms_alert: account.sms_alert || 'No'   // default to 'No' if null
      }
    };

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('❌ Error fetching account:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching account',
      error: error.message,
    });
  }
};

export const getAllCustomerAccounts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      accountType,
      buId,           // new: filter by Business Unit ID
      startDate,      // new: start date (YYYY-MM-DD)
      endDate         // new: end date (YYYY-MM-DD)
    } = req.query;

    const offset = (page - 1) * limit;

    const where = {};

    // Existing filters
    if (status) where.status = status.toUpperCase();
    if (accountType) where.account_type = accountType.toUpperCase();
    
    // New: BU filter
    if (buId) where.bu_id = buId;

    // New: date range filter on created_at
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // include full end day
      where.created_at = {
        [Op.between]: [start, end]
      };
    } else if (startDate) {
      const start = new Date(startDate);
      where.created_at = { [Op.gte]: start };
    } else if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.created_at = { [Op.lte]: end };
    }

    const { rows: accounts, count } = await CustomerAccount.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      message: 'Customer accounts retrieved successfully',
      count: accounts.length,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit),
      accounts: accounts.map(acc => ({
        CUST_ID: acc.customer_id,
        ACCT_ID: acc.id,
        ACCT_NO: acc.account_number,
        ACCT_NM: acc.account_name,
        BU_ID: acc.bu_id,
        ACCOUNT_TYPE: acc.account_type,
        PRODUCT_DESC: acc.product_description,
        REC_ST: acc.status,
        createdAt: acc.created_at,
        updatedAt: acc.updated_at,
      })),
    });
  } catch (error) {
    logger.error('Error fetching customer accounts:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date(),
    });
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching the customer accounts',
      error: error.message,
    });
  }
};


// Get customer accounts by CUST_ID (Simplified version)
export const getCustomerAccountByCUST_ID = async (req, res) => {
  const { CUST_ID } = req.params;

  try {
    if (!CUST_ID) {
      return res.status(400).json({
        success: false,
        message: 'CUST_ID parameter is required',
      });
    }

    console.log(`🔍 Searching for customer accounts with identifier: ${CUST_ID}`);

    const originalId = CUST_ID.toString().trim();
    const cleanId = originalId.replace(/^0+/, '');
    const numericId = parseInt(cleanId, 10) || 0;
    const paddedId = originalId.padStart(10, '0');

    console.log(`📋 Search formats: original=${originalId}, clean=${cleanId}, numeric=${numericId}, padded=${paddedId}`);

    // Check customer existence first
    const [customerResult] = await sequelize.query(
      `SELECT CUST_ID FROM customers 
       WHERE CUST_ID = :customerId 
          OR CUST_ID = :paddedId 
          OR TRIM(LEADING '0' FROM CUST_ID) = :cleanId 
       LIMIT 1`,
      {
        replacements: {
          customerId: originalId,
          paddedId: paddedId,
          cleanId: cleanId
        },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    const customerExists = !!customerResult;

    if (!customerExists) {
      return res.status(404).json({
        success: false,
        message: `Customer ${originalId} not found`,
        searched_identifier: originalId,
      });
    }

    // 🔧 FIXED: Use CUST_ID instead of customer_id; join on CUST_ID
    const accounts = await sequelize.query(
      `SELECT ca.*, c.FIRST_NAME, c.LAST_NAME, c.EMAIL_ADDRESS, c.PHONE_NO, c.CUST_NM
       FROM customer_accounts ca
       LEFT JOIN customers c ON c.CUST_ID = ca.CUST_ID
       WHERE ca.CUST_ID = :originalId 
          OR ca.CUST_ID = :paddedId 
          OR ca.CUST_ID = :cleanId
          OR ca.CUST_ID = :numericId
       ORDER BY ca.created_at DESC`,
      {
        replacements: {
          originalId: originalId,
          paddedId: paddedId,
          cleanId: cleanId,
          numericId: String(numericId)
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    console.log(`📊 Found ${accounts.length} accounts for customer ${CUST_ID}`);

    if (!accounts || accounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No accounts found for customer: ${originalId}`,
        searched_identifier: originalId,
        customer_exists: true,
      });
    }

    // Process accounts (same as before, but use ca.CUST_ID)
    const processedAccounts = accounts.map(account => {
      let accountName = account.account_name || 'Account';
      
      if (account.FIRST_NAME || account.LAST_NAME) {
        accountName = `${account.FIRST_NAME || ''} ${account.LAST_NAME || ''}`.trim();
      } else if (account.CUST_NM) {
        accountName = account.CUST_NM;
      }
      
      if ((accountName === 'Account' || !accountName) && account.product_description) {
        accountName = account.product_description.replace(/Account:/g, '').trim();
      }

      if (!accountName || accountName.trim() === '') {
        accountName = `Customer ${account.CUST_ID}`;
      }

      return {
        id: account.id,
        account_number: account.account_number,
        account_name: accountName,
        customer_id: account.CUST_ID,  // use CUST_ID
        customer_code: account.CUST_ID,

        status: account.status || account.REC_ST,
        account_type: account.account_type,
        product_type: account.product_type,
        product_description: account.product_description,

        opening_amount: parseFloat(account.opening_balance || account.opening_amount || 0),
        cleared_balance: parseFloat(account.cleared_balance || 0),
        ledger_balance: parseFloat(account.ledger_balance || account.current_balance || 0),
        available_balance: parseFloat(account.available_balance || 0),

        interest_rate: parseFloat(account.interest_rate || 0),
        accrued_interest: parseFloat(account.accrued_interest || 0),

        branch: account.branch_name || account.branch_id,
        currency: account.currency_code || 'NGN',
        opened_date: account.account_opened_date || account.created_at,
        last_activity_date: account.last_transaction_date,

        customer_name: account.FIRST_NAME || account.LAST_NAME 
          ? `${account.FIRST_NAME || ''} ${account.LAST_NAME || ''}`.trim() 
          : account.CUST_NM,
        customer_email: account.EMAIL_ADDRESS || null,
        customer_phone: account.PHONE_NO || null,
        
        product_name: account.product_name,
        branch_id: account.branch_id,
        is_online_enabled: account.is_online_enabled,
        allow_debit: account.allow_debit,
        allow_credit: account.allow_credit
      };
    });

    const totalBalance = processedAccounts.reduce((sum, account) => sum + account.ledger_balance, 0);
    const activeAccounts = processedAccounts.filter(account => account.status === 'ACTIVE').length;

    return res.status(200).json({
      success: true,
      message: 'Customer accounts retrieved successfully',
      count: processedAccounts.length,
      summary: {
        total_balance: totalBalance,
        active_accounts: activeAccounts,
        total_accounts: processedAccounts.length
      },
      accounts: processedAccounts
    });
  } catch (error) {
    console.error('❌ Error fetching customer accounts:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching customer accounts',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


// In CustomerAccountController.js or wherever transaction history is handled
export const getAccountTransactionHistory = async (req, res) => {
  const { accountNumber } = req.params;

  try {
    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Account number parameter is required',
      });
    }

    console.log(`🔍 Fetching transaction history for account: ${accountNumber}`);

    // ✅ Select only columns that exist in the audit_trail table (no reference_no)
    const transactions = await sequelize.query(
      `SELECT 
        event_id,
        event_type,
        action,
        old_value,
        new_value,
        user_id,
        ip_address,
        description,
        additional_info,
        timestamp,
        created_at,
        updated_at,
        status as transaction_status
      FROM audit_trail 
      WHERE account_no = :accountNumber 
        AND event_type IN ('TRANSACTION_DR', 'TRANSACTION_CR')
      ORDER BY timestamp DESC
      LIMIT 100`,
      {
        replacements: { accountNumber },
        type: sequelize.QueryTypes.SELECT
      }
    );

    // Process and format transactions
    const formattedTransactions = transactions.map(txn => {
      let oldValue = null;
      let newValue = null;
      let additionalInfo = null;
      try {
        if (txn.old_value) oldValue = JSON.parse(txn.old_value);
        if (txn.new_value) newValue = JSON.parse(txn.new_value);
        if (txn.additional_info) additionalInfo = JSON.parse(txn.additional_info);
      } catch (e) {
        console.warn(`Failed to parse JSON for event ${txn.event_id}`);
      }

      let amount = 0;
      let transactionType = txn.event_type === 'TRANSACTION_DR' ? 'DEBIT' : 'CREDIT';

      if (newValue && newValue.amount !== undefined) {
        amount = parseFloat(newValue.amount);
      } else if (additionalInfo && additionalInfo.amount !== undefined) {
        amount = parseFloat(additionalInfo.amount);
      }

      return {
        id: txn.event_id,
        transaction_id: txn.event_id,
        type: transactionType,
        amount: amount,
        balance: newValue?.balance || 0,
        description: txn.description || txn.action || 'Transaction',
        date: txn.timestamp || txn.created_at,
        status: txn.transaction_status || 'COMPLETED',
        initiated_by: txn.user_id,
        ip_address: txn.ip_address,
        additional_info: additionalInfo
      };
    });

    const totalDebit = formattedTransactions
      .filter(t => t.type === 'DEBIT')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalCredit = formattedTransactions
      .filter(t => t.type === 'CREDIT')
      .reduce((sum, t) => sum + t.amount, 0);

    return res.status(200).json({
      success: true,
      message: 'Transaction history retrieved successfully',
      data: {
        account_number: accountNumber,
        transactions: formattedTransactions,
        summary: {
          total_debit: totalDebit,
          total_credit: totalCredit,
          net_change: totalCredit - totalDebit,
          total_count: formattedTransactions.length
        }
      }
    });

  } catch (error) {
    console.error('❌ Transaction history fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching transaction history',
      error: error.message
    });
  }
};

// Update a customer account by account number
export const updateCustomerAccount = async (req, res) => {
  // Get raw account number from URL
  const rawAccountNumber = req.params.accountNumber;
  
  console.log('🔍 DEBUG - Update request details:', {
    fullUrl: req.originalUrl,
    method: req.method,
    rawParams: req.params,
    rawAccountNumber: rawAccountNumber,
    rawAccountNumberType: typeof rawAccountNumber,
    rawAccountNumberLength: rawAccountNumber?.length,
    rawAccountNumberValue: `"${rawAccountNumber}"`,
    headers: req.headers,
    body: req.body
  });

  const transaction = await sequelize.transaction();
  const updateData = req.body;

  try {
    // First, check if accountNumber is even present
    if (!rawAccountNumber) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Account number is required',
        debug: { received: rawAccountNumber }
      });
    }

    // Convert to string and trim
    const accountNum = String(rawAccountNumber).trim();
    
    console.log('🔍 DEBUG - After string conversion:', {
      accountNum: accountNum,
      accountNumLength: accountNum.length,
      accountNumCharCodes: Array.from(accountNum).map(char => char.charCodeAt(0))
    });

    // Check if it's exactly 10 digits
    if (!/^\d{10}$/.test(accountNum)) {
      await transaction.rollback();
      
      // Check what's actually in the string
      const nonDigitChars = accountNum.replace(/\d/g, '');
      
      return res.status(400).json({ 
        success: false, 
        message: 'Account number must be a 10-digit number.',
        details: {
          received: accountNum,
          expected: '10-digit number',
          actualLength: accountNum.length,
          isAllDigits: /^\d+$/.test(accountNum),
          nonDigitCharacters: nonDigitChars || 'none',
          characterAnalysis: Array.from(accountNum).map((char, index) => ({
            position: index + 1,
            character: char,
            charCode: char.charCodeAt(0),
            isDigit: /\d/.test(char)
          }))
        }
      });
    }

    console.log('✅ Account number validated:', accountNum);

    // Find existing account
    const existingAccount = await CustomerAccount.findOne({
      where: { account_number: accountNum },
      transaction
    });
    
    if (!existingAccount) {
      await transaction.rollback();
      console.log('❌ Account not found in database:', accountNum);
      
      // Check if it exists with different formatting
      const similarAccounts = await CustomerAccount.findAll({
        where: {
          account_number: {
            [Op.like]: `%${accountNum}%`
          }
        },
        limit: 5,
        attributes: ['account_number', 'id']
      });
      
      return res.status(404).json({ 
        success: false, 
        message: 'Customer account not found',
        accountNumber: accountNum,
        similarAccounts: similarAccounts.map(acc => acc.account_number)
      });
    }

    console.log('✅ Account found:', existingAccount.account_number);

    // ============== ADD THIS MISSING PART ==============
    // Prepare update data (only allow certain fields)
    const allowedUpdates = [
      'account_name', // Added this since you're trying to update account_name
      'REC_ST',
      'substatus',
      'online_enabled',
      'DR_ALLOWED',
      'CR_ALLOWED',
      'isOverdraftAllowed',
      'sms_alert',
      'email_alert',
      'auto_approve',
      'PRODUCT_DESC',
      'notes'
    ];

    const updatePayload = {};
    for (const key of allowedUpdates) {
      if (updateData[key] !== undefined) {
        updatePayload[key] = updateData[key];
      }
    }

    console.log('📋 Update payload prepared:', updatePayload);

    // Check if we have anything to update
    if (Object.keys(updatePayload).length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    // Special handling for REC_ST
    if (updatePayload.REC_ST) {
      updatePayload.REC_ST = updatePayload.REC_ST.toUpperCase();
      const VALID_REC_ST = ['ACTIVE', 'DORMANT', 'SUSPENDED', 'CLOSED', 'INACTIVE', 'PENDING'];
      if (!VALID_REC_ST.includes(updatePayload.REC_ST)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Invalid REC_ST. Must be one of ${VALID_REC_ST.join(', ')}`,
        });
      }
    }

    // Update timestamps
    updatePayload.updatedAt = new Date();
    if (existingAccount.lastActivityDate) {
      updatePayload.lastActivityDate = new Date();
    }

    console.log('🔄 Updating account with payload:', updatePayload);

    // Update account
    const [affectedRows] = await CustomerAccount.update(updatePayload, {
      where: { account_number: accountNum },
      transaction
    });

    console.log(`✅ Updated ${affectedRows} row(s)`);

    // Get updated account
    const updatedAccount = await CustomerAccount.findOne({
      where: { account_number: accountNum },
      transaction
    });

    console.log('✅ Account updated successfully');

    // Audit trail
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();
    
    if (AuditTrail && typeof AuditTrail.create === 'function') {
      try {
        await AuditTrail.create({
          event_id: Date.now(),
          user_id: userId,
          event_type: 'CUSTOMER_ACCOUNT_UPDATE',
          action: 'Update Account',
          old_value: JSON.stringify(existingAccount.toJSON()),
          new_value: JSON.stringify(updatedAccount.toJSON()),
          ip_address: ipAddress,
          timestamp: now,
          entity_type: 'CustomerAccount',
          entity_id: updatedAccount.id,
          status: 'SUCCESS',
          account_no: accountNum,
          description: 'Updated customer account details',
        }, { transaction });
        console.log('✅ Audit trail created');
      } catch (auditError) {
        console.error('⚠️ Failed to create audit trail:', auditError.message);
        // Don't fail the whole request if audit fails
      }
    }

    // COMMIT THE TRANSACTION
    await transaction.commit();
    console.log('✅ Transaction committed successfully');
    
    return res.status(200).json({
      success: true,
      message: 'Customer account updated successfully',
      account: {
        id: updatedAccount.id,
        account_number: updatedAccount.account_number,
        account_name: updatedAccount.account_name, // Added this
        status: updatedAccount.REC_ST,
        substatus: updatedAccount.substatus,
        online_enabled: updatedAccount.online_enabled,
        debit_allowed: updatedAccount.DR_ALLOWED,
        credit_allowed: updatedAccount.CR_ALLOWED,
        updated_at: updatedAccount.updatedAt
      }
    });
    // ============== END OF MISSING PART ==============

  } catch (error) {
    // Make sure to rollback if there's an error
    try {
      await transaction.rollback();
      console.log('✅ Transaction rolled back due to error');
    } catch (rollbackError) {
      console.error('⚠️ Failed to rollback transaction:', rollbackError.message);
    }
    
    console.error('❌ Error updating account:', error.message);
    console.error('❌ Error stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating the customer account',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get account details by account number


// Delete a customer account by account number
export const deleteCustomerAccount = async (req, res) => {
  const { accountNumber } = req.params;
  const transaction = await sequelize.transaction();

  try {
    // Validate account number
    if (!/^\d{10}$/.test(accountNumber)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Account number must be a 10-digit number.',
      });
    }

    const accountToDelete = await CustomerAccount.findOne({
      where: { account_number: accountNumber },
      transaction
    });
    
    if (!accountToDelete) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Customer account not found',
      });
    }

    // Check if account can be deleted (not active)
    if (accountToDelete.REC_ST === 'ACTIVE') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot delete active account. Deactivate it first.',
        current_status: accountToDelete.REC_ST
      });
    }

    await CustomerAccount.destroy({
      where: { account_number: accountNumber },
      transaction
    });

    // Record audit trail
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();

    if (AuditTrail && typeof AuditTrail.create === 'function') {
      await AuditTrail.create({
        event_id: Date.now(),
        user_id: userId,
        event_type: 'CUSTOMER_ACCOUNT_DELETE',
        action: 'Delete Account',
        old_value: accountToDelete.toJSON(),
        new_value: null,
        ip_address: ipAddress,
        timestamp: now,
        entity_type: 'CustomerAccount',
        entity_id: accountToDelete.id,
        status: 'SUCCESS',
        account_no: accountNumber,
        description: 'Deleted customer account',
      }, { transaction });
    }

    await transaction.commit();
    
    return res.status(200).json({
      success: true,
      message: 'Customer account deleted successfully',
      account: {
        account_number: accountToDelete.account_number,
        account_name: accountToDelete.PRODUCT_DESC,
        deleted_at: now
      },
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting customer account:', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      timestamp: new Date(),
    });

    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete account because it has related transactions',
        code: 'FOREIGN_KEY_CONSTRAINT'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the customer account',
      error: error.message,
    });
  }
};
// Add this function to the CustomerAccountController.js after the deleteCustomerAccount function


export const requestAccountActivation = async (req, res) => {
  const { accountNumber } = req.params;
  const { activationReason, notes } = req.body;
  const userId = req.user?.id;
  const userRole = req.user?.role;

  try {
    console.log('🔍 Activation request received:', {
      accountNumber,
      activationReason,
      notes,
      userId,
      userRole
    });

    // Validate account number
    if (!/^\d{10}$/.test(accountNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Account number must be a 10-digit number.',
      });
    }

    // Validate activation reason
    if (!activationReason || activationReason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Activation reason is required.',
      });
    }

    // Find the account by accountNumber
    const account = await CustomerAccount.findOne({
      where: { account_number: accountNumber }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found.',
        account_number: accountNumber
      });
    }

    // Check current status
    const accountData = account.toJSON ? account.toJSON() : account;
    const statusFieldNames = ['REC_ST', 'status', 'account_status', 'acc_status', 'state', 'account_state', 'STATUS'];
    let currentStatus = null;

    for (const field of statusFieldNames) {
      if (accountData[field] !== undefined && accountData[field] !== null) {
        currentStatus = String(accountData[field]).toUpperCase();
        break;
      }
    }

    // Check if account is already active
    if (currentStatus === 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Account is already active',
        account: {
          account_number: accountData.account_number,
          current_status: currentStatus
        }
      });
    }

    // Validate that account can be activated
    const validPreviousStates = ['DORMANT', 'INACTIVE', 'SUSPENDED', 'PENDING', 'CLOSED'];
    if (!validPreviousStates.includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot activate account with status: "${currentStatus}". Only ${validPreviousStates.join(', ')} accounts can be activated.`,
        currentStatus: currentStatus
      });
    }

    // Generate unique request ID
    const requestId = `ACT-${accountNumber}-${Date.now()}`;
    
    // Calculate expiry date (24 hours from now)
    const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Find approver (MANAGER)
    const approver = await User.findOne({
      where: { 
        role: 'MANAGER',
        is_active: true
      }
    });

    if (!approver) {
      return res.status(404).json({
        success: false,
        message: 'No active manager found to approve this request.'
      });
    }

    // Create approval request with single approval
    const approvalRequest = await Approval.create({
      request_id: requestId,
      entity_type: 'CustomerAccount',
      entity_id: accountNumber, // Using accountNumber as entity_id
      action_type: 'ACTIVATE_ACCOUNT',
      current_status: currentStatus,
      requested_status: 'ACTIVE',
      request_data: {
        account_number: accountNumber,
        account_name: accountData.account_name || accountData.PRODUCT_DESC,
        account_type: accountData.account_type || accountData.ACCOUNT_TYPE,
        activation_reason: activationReason,
        notes: notes || '',
        original_status: currentStatus
      },
      request_notes: notes,
      initiator_id: userId,
      initiator_role: userRole,
      approver_id: approver.id, // Single approver
      approver_role: approver.role,
      approval_status: 'PENDING',
      overall_status: 'PENDING_APPROVAL',
      expiry_date: expiryDate,
      executed: false
    });

    // Send notification to approver
    try {
      await sendApprovalNotification({
        type: 'APPROVAL_REQUEST',
        userId: approver.id,
        requestId: requestId,
        action: 'Account Activation',
        accountNumber: accountNumber,
        accountName: accountData.account_name || 'Unknown',
        currentStatus: currentStatus,
        requestedStatus: 'ACTIVE',
        reason: activationReason,
        urgency: 'MEDIUM',
        expiryDate: expiryDate,
        initiatorName: req.user?.name || 'System User'
      });
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
      // Continue even if notification fails
    }

    // Record audit trail
    await AuditTrail.create({
      event_id: Date.now(),
      user_id: userId,
      event_type: 'ACTIVATION_REQUEST_CREATED',
      action: 'Request Account Activation',
      old_value: JSON.stringify(accountData),
      new_value: JSON.stringify(approvalRequest.toJSON()),
      ip_address: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      timestamp: new Date(),
      entity_type: 'Approval',
      entity_id: approvalRequest.id,
      status: 'PENDING',
      account_no: accountNumber,
      description: `Activation request created for account ${accountNumber}`,
      additional_info: {
        request_id: requestId,
        current_status: currentStatus,
        requested_status: 'ACTIVE',
        activation_reason: activationReason,
        notes: notes || '',
        expiry_date: expiryDate,
        approver_id: approver.id,
        approver_name: approver.name || 'Manager'
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Activation request submitted for approval',
      approval_request: {
        request_id: requestId,
        status: 'PENDING_APPROVAL',
        current_status: currentStatus,
        requested_status: 'ACTIVE',
        approvers_required: 1,
        approvals_received: 0,
        expiry_date: expiryDate,
        estimated_completion_time: 'Within 24 hours'
      },
      details: {
        account_number: accountNumber,
        account_name: accountData.account_name || accountData.PRODUCT_DESC,
        activation_reason: activationReason,
        notes: notes || '',
        submitted_by: userId,
        submitted_at: new Date(),
        approver: {
          id: approver.id,
          role: approver.role,
          name: approver.name || 'Manager'
        }
      }
    });

  } catch (error) {
    console.error('❌ Error creating activation request:', error);
    
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating activation request',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const approveActivationRequest = async (req, res) => {
  const { accountNumber } = req.params;
  const { approvalStatus, notes, userId, userRole } = req.body;
  const userName = req.body.userName || req.user?.name || 'Unknown';

  let transaction;
  
  try {
    console.log('🔍 Approval request received:', {
      accountNumber,
      approvalStatus,
      notes,
      userId,
      userRole,
      userName
    });

    // Validate account number
    if (!accountNumber || !/^\d{10}$/.test(accountNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Valid 10-digit account number is required'
      });
    }

    // Validate approval status
    if (!['APPROVED', 'REJECTED'].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Approval status must be either "APPROVED" or "REJECTED"'
      });
    }

    // Validate user info
    if (!userId || !userRole) {
      return res.status(400).json({
        success: false,
        message: 'User ID and role are required'
      });
    }

    // Start transaction
    transaction = await sequelize.transaction();

    // Find PENDING_APPROVAL activation request for this account
    console.log('🔍 Looking for activation request for account:', accountNumber);
    
    let approvalRequest;
    try {
      approvalRequest = await Approval.findOne({
        where: { 
          entity_id: accountNumber,
          entity_type: 'CustomerAccount',
          action_type: 'ACTIVATE_ACCOUNT',
          overall_status: 'PENDING_APPROVAL'
        }
        // Removed order clause since createdAt column doesn't exist
      });
    } catch (dbError) {
      console.error('❌ Database error finding approval request:', dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    if (!approvalRequest) {
      if (transaction) await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No pending activation request found for this account',
        account_number: accountNumber,
        suggestion: 'Make sure an activation request was created first'
      });
    }

    console.log('✅ Found approval request:', {
      request_id: approvalRequest.request_id,
      entity_id: approvalRequest.entity_id,
      overall_status: approvalRequest.overall_status,
      approver_id: approvalRequest.approver_id,
      approver_role: approvalRequest.approver_role,
      current_status: approvalRequest.current_status,
      requested_status: approvalRequest.requested_status
    });

    // Check if request is expired
    if (new Date() > approvalRequest.expiry_date) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Approval request has expired',
        expiry_date: approvalRequest.expiry_date,
        request_id: approvalRequest.request_id
      });
    }

    // Check if already executed
    if (approvalRequest.executed) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Request has already been executed',
        execution_date: approvalRequest.execution_date,
        request_id: approvalRequest.request_id
      });
    }

    // Check if user is authorized to approve
    if (userRole !== approvalRequest.approver_role) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: `Only ${approvalRequest.approver_role} can approve this request. Your role: ${userRole}`,
        required_role: approvalRequest.approver_role,
        your_role: userRole,
        request_id: approvalRequest.request_id
      });
    }

    const now = new Date();

    // Update approval request
    try {
      await Approval.update({
        approver_id: userId,
        approval_status: approvalStatus,
        approval_notes: notes || '',
        approval_date: now,
        overall_status: approvalStatus === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        ...(approvalStatus === 'APPROVED' && {
          executed: true,
          executed_by: userId,
          execution_date: now
        })
      }, {
        where: { 
          request_id: approvalRequest.request_id,
          entity_id: accountNumber 
        },
        transaction
      });
      console.log('✅ Approval request updated successfully');
    } catch (updateError) {
      console.error('❌ Error updating approval request:', updateError);
      throw updateError;
    }

    // If approved, execute the activation
    if (approvalStatus === 'APPROVED') {
      try {
        await executeActivation(approvalRequest, userId, transaction);
        console.log('✅ Account activation executed successfully');
      } catch (executionError) {
        console.error('❌ Error executing activation:', executionError);
        throw executionError;
      }
    }

    await transaction.commit();
    console.log('✅ Transaction committed successfully');

    // Get updated approval request for response
    const updatedApproval = await Approval.findOne({
      where: { request_id: approvalRequest.request_id }
    });

    // Prepare response
    const response = {
      success: true,
      message: `Activation request ${approvalStatus.toLowerCase()} successfully`,
      account_number: accountNumber,
      approval: {
        request_id: approvalRequest.request_id,
        status: approvalStatus,
        approved_by: userId,
        approved_by_name: userName,
        approved_at: now,
        notes: notes || '',
        next_step: approvalStatus === 'APPROVED' ? 'Account activated' : 'Request closed'
      }
    };

    // Add execution details if executed
    if (approvalStatus === 'APPROVED' && updatedApproval?.executed) {
      response.execution_details = {
        executed_by: updatedApproval.executed_by,
        execution_date: updatedApproval.execution_date,
        status: 'COMPLETED'
      };
      
      // Add account status update info
      response.account_status_update = {
        previous_status: approvalRequest.current_status,
        new_status: 'ACTIVE',
        updated_at: now
      };
    }

    return res.status(200).json(response);

  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
        console.log('✅ Transaction rolled back due to error');
      } catch (rollbackError) {
        console.error('❌ Error rolling back transaction:', rollbackError);
      }
    }
    
    console.error('❌ Error approving activation request:', error);
    
    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing approval',
      error: error.message,
      account_number: accountNumber,
      timestamp: new Date().toISOString()
    });
  }
};

// Helper function to execute activation
async function executeActivation(approvalRequest, userId, transaction) {
  const accountNumber = approvalRequest.entity_id;
  
  console.log(`🔍 Executing activation for account: ${accountNumber}`);

  // Find the account
  const account = await CustomerAccount.findOne({
    where: { account_number: accountNumber },
    transaction
  });

  if (!account) {
    throw new Error(`Account ${accountNumber} not found`);
  }

  console.log(`✅ Found account: ${accountNumber}, current status: ${approvalRequest.current_status}`);

  // Update account status to ACTIVE
  const updateData = {
    status: 'ACTIVE',
    account_status: 'ACTIVE',
    REC_ST: 'ACTIVE',
    last_updated_by: userId,
    last_updated_date: new Date(),
    activation_date: new Date(),
    activated_by: userId
  };

  await CustomerAccount.update(updateData, {
    where: { account_number: accountNumber },
    transaction
  });

  console.log(`✅ Account ${accountNumber} updated to ACTIVE`);

  // Record audit trail for execution
  await AuditTrail.create({
    event_id: Date.now(),
    user_id: userId,
    event_type: 'ACCOUNT_ACTIVATED',
    action: 'Account Activation Executed',
    old_value: JSON.stringify({
      account_number: accountNumber,
      previous_status: approvalRequest.current_status,
      request_id: approvalRequest.request_id
    }),
    new_value: JSON.stringify({
      account_number: accountNumber,
      new_status: 'ACTIVE',
      activated_by: userId,
      activation_date: new Date(),
      request_id: approvalRequest.request_id
    }),
    ip_address: 'SYSTEM',
    timestamp: new Date(),
    entity_type: 'CustomerAccount',
    entity_id: accountNumber,
    status: 'COMPLETED',
    account_no: accountNumber,
    description: `Account ${accountNumber} activated from ${approvalRequest.current_status} to ACTIVE`,
    additional_info: {
      request_id: approvalRequest.request_id,
      approved_by: userId,
      execution_date: new Date(),
      approval_notes: approvalRequest.approval_notes || '',
      previous_status: approvalRequest.current_status
    }
  }, { transaction });

  console.log(`✅ Audit trail recorded for account ${accountNumber}`);

  return true;
}

// Check approval status
export const checkApprovalStatus = async (req, res) => {
  const { requestId } = req.params;

  try {
    const approvalRequest = await Approval.findOne({
      where: { request_id: requestId }
    });

    if (!approvalRequest) {
      return res.status(404).json({
        success: false,
        message: 'Approval request not found'
      });
    }

    const response = {
      success: true,
      request: {
        request_id: approvalRequest.request_id,
        entity_type: approvalRequest.entity_type,
        entity_id: approvalRequest.entity_id,
        action_type: approvalRequest.action_type,
        current_status: approvalRequest.current_status,
        requested_status: approvalRequest.requested_status,
        overall_status: approvalRequest.overall_status,
        initiator: {
          id: approvalRequest.initiator_id,
          role: approvalRequest.initiator_role
        },
        first_approval: {
          approver_id: approvalRequest.first_approver_id,
          approver_role: approvalRequest.first_approver_role,
          status: approvalRequest.first_approval_status,
          notes: approvalRequest.first_approval_notes,
          date: approvalRequest.first_approval_date
        },
        second_approval: {
          approver_id: approvalRequest.second_approver_id,
          approver_role: approvalRequest.second_approver_role,
          status: approvalRequest.second_approval_status,
          notes: approvalRequest.second_approval_notes,
          date: approvalRequest.second_approval_date
        },
        timeline: {
          created_at: approvalRequest.createdAt,
          expiry_date: approvalRequest.expiry_date,
          executed: approvalRequest.executed,
          execution_date: approvalRequest.execution_date,
          executed_by: approvalRequest.executed_by
        },
        request_data: approvalRequest.request_data,
        is_expired: new Date() > approvalRequest.expiry_date
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error checking approval status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking approval status',
      error: error.message
    });
  }
};


export const requestAccountDeactivation = async (req, res) => {
  const { accountNumber } = req.params;
  const { 
    deactivationReason, 
    notes, 
    deactivationType = 'DORMANT',
    userId = 'system',
    userRole = 'SYSTEM_ADMIN'
  } = req.body;

  try {
    console.log('🔍 Deactivation request received (no auth mode):', {
      accountNumber,
      deactivationType,
      deactivationReason,
      notes,
      userId,
      userRole
    });

    // Validate account number
    if (!/^\d{10}$/.test(accountNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Account number must be a 10-digit number.',
      });
    }

    // Validate deactivation reason
    if (!deactivationReason || deactivationReason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Deactivation reason is required.',
      });
    }

    // Validate deactivation type
    const VALID_DEACTIVATION_TYPES = ['DORMANT', 'SUSPENDED', 'CLOSED', 'INACTIVE'];
    const normalizedDeactivationType = deactivationType.toUpperCase();
    
    if (!VALID_DEACTIVATION_TYPES.includes(normalizedDeactivationType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid deactivation type. Must be one of: ${VALID_DEACTIVATION_TYPES.join(', ')}`,
        valid_types: VALID_DEACTIVATION_TYPES
      });
    }

    // Find the account
    const account = await CustomerAccount.findOne({
      where: { account_number: accountNumber }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found.',
        account_number: accountNumber
      });
    }

    // DEBUG: Log all account fields to see what's available
    const accountData = account.toJSON ? account.toJSON() : account;
    console.log('📊 Account data keys:', Object.keys(accountData));
    console.log('📊 Account REC_ST value:', accountData.REC_ST);
    console.log('📊 Account status fields:', {
      REC_ST: accountData.REC_ST,
      status: accountData.status,
      account_status: accountData.account_status,
      substatus: accountData.substatus
    });

    // Get current status - check multiple possible fields
    let currentStatus = accountData.REC_ST;
    
    // If REC_ST is null/undefined, check other status fields
    if (!currentStatus) {
      currentStatus = accountData.status || 
                     accountData.account_status || 
                     accountData.substatus || 
                     'ACTIVE'; // Default if no status found
      
      console.log('⚠️ REC_ST was null/undefined, using:', currentStatus);
    }

    // Ensure currentStatus is a string
    currentStatus = String(currentStatus).toUpperCase().trim();
    
    // If still empty, use a default
    if (!currentStatus || currentStatus === 'NULL' || currentStatus === 'UNDEFINED') {
      currentStatus = 'ACTIVE';
      console.log('⚠️ Status was empty, defaulting to:', currentStatus);
    }

    console.log('✅ Final current status:', currentStatus);

    // Check if account is already in target state
    if (currentStatus === normalizedDeactivationType) {
      return res.status(400).json({
        success: false,
        message: `Account is already ${normalizedDeactivationType}`,
        account: {
          account_number: account.account_number,
          account_name: account.account_name || account.PRODUCT_DESC,
          current_status: currentStatus,
          all_status_fields: {
            REC_ST: accountData.REC_ST,
            status: accountData.status,
            account_status: accountData.account_status,
            substatus: accountData.substatus
          }
        }
      });
    }

    // Generate unique request ID
    const requestId = `DEACT-${accountNumber}-${Date.now()}`;
    const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Prepare request data
    const requestData = {
      account_number: accountNumber,
      account_name: account.account_name || account.PRODUCT_DESC,
      account_type: account.account_type || account.ACCOUNT_TYPE,
      deactivation_type: normalizedDeactivationType,
      deactivation_reason: deactivationReason,
      notes: notes || '',
      current_status: currentStatus,
      requested_status: normalizedDeactivationType,
      balances: {
        ledger_balance: account.ledger_balance || 0,
        available_balance: account.available_balance || 0,
        cleared_balance: account.cleared_balance || 0
      },
      customer_info: {
        customer_id: account.customer_id,
        customer_name: account.customer_name
      }
    };

    console.log('📝 Creating approval with:', {
      current_status: currentStatus,
      requested_status: normalizedDeactivationType
    });

    // Create approval request
  // In your requestAccountDeactivation function, change this part:
const approvalRequest = await Approval.create({
  request_id: requestId,
  entity_type: 'CustomerAccount',
  entity_id: accountNumber,
  action_type: 'DEACTIVATE_ACCOUNT',
  current_status: currentStatus,
  requested_status: normalizedDeactivationType,
  request_data: requestData,
  request_notes: notes,
  initiator_id: userId,
  initiator_role: userRole,
  first_approver_id: null,
  first_approver_role: 'MANAGER', // Single approver
  first_approval_status: 'PENDING',
  second_approver_id: null, // Remove second approver
  second_approver_role: null, // Remove second approver
  second_approval_status: null, // Remove second approval
  overall_status: 'PENDING', // Changed from PENDING_FIRST to PENDING
  expiry_date: expiryDate,
  executed: false
});

    console.log('✅ Approval request created successfully:', approvalRequest.id);

    // Record audit trail
    try {
      await AuditTrail.create({
        event_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        user_id: userId,
        event_type: 'DEACTIVATION_REQUEST_CREATED',
        action: `Request Account Deactivation (${normalizedDeactivationType})`,
        old_value: JSON.stringify({
          account_number: accountNumber,
          status: currentStatus,
          original_REC_ST: accountData.REC_ST
        }),
        new_value: JSON.stringify({
          request_id: requestId,
          deactivation_type: normalizedDeactivationType,
          current_status: currentStatus,
          requested_status: normalizedDeactivationType
        }),
        ip_address: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        timestamp: new Date(),
        entity_type: 'Approval',
        entity_id: approvalRequest.id,
        status: 'SUCCESS',
        account_no: accountNumber,
        description: `Deactivation request created for account ${accountNumber}`,
        additional_info: {
          request_id: requestId,
          deactivation_type: normalizedDeactivationType,
          deactivation_reason: deactivationReason.substring(0, 200),
          expiry_date: expiryDate.toISOString(),
          status_resolution: {
            original_REC_ST: accountData.REC_ST,
            final_current_status: currentStatus,
            used_default: accountData.REC_ST ? false : true
          }
        }
      });
    } catch (auditError) {
      console.warn('⚠️ Audit trail creation failed:', auditError.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Deactivation request submitted for approval',
      note: 'Operating in no-authentication mode',
      approval_request: {
        request_id: requestId,
        status: 'PENDING_FIRST',
        current_status: currentStatus,
        requested_status: normalizedDeactivationType,
        approvers_required: 2,
        approvals_received: 0,
        expiry_date: expiryDate.toISOString(),
        estimated_completion_time: 'Within 24 hours',
        approval_workflow: [
          { level: 1, role: 'MANAGER', status: 'PENDING' },
          { level: 2, role: 'HEAD_OF_DEPARTMENT', status: 'PENDING' }
        ]
      },
      details: {
        account_number: accountNumber,
        account_name: account.account_name || account.PRODUCT_DESC,
        deactivation_type: normalizedDeactivationType,
        deactivation_reason: deactivationReason,
        notes: notes || '',
        submitted_by: userId,
        submitted_by_role: userRole,
        submitted_at: new Date().toISOString(),
        next_approver_role: 'MANAGER',
        status_info: {
          original_REC_ST: accountData.REC_ST,
          final_current_status: currentStatus,
          used_default_status: accountData.REC_ST ? 'No' : 'Yes'
        }
      }
    });

  } catch (error) {
    console.error('❌ Error creating deactivation request:', error);
    
    // Better error response
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error creating approval request',
        errors: error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        })),
        debug_info: {
          accountNumber,
          userId,
          userRole
        }
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating deactivation request',
      error: error.message,
      error_type: error.name
    });
  }
};

export const approveDeactivationRequest = async (req, res) => {
  const { accountNumber } = req.params;
  const { approvalStatus, notes } = req.body;
  const userId = req.user?.id || req.body.userId;
  const userRole = req.user?.role || req.body.userRole;
  const userName = req.user?.name || req.body.userName || 'Unknown';

  const transaction = await sequelize.transaction();

  try {
    console.log('🔍 SINGLE-LEVEL Deactivation approval request received:', {
      accountNumber,
      approvalStatus,
      userId,
      userRole
    });

    // Validate approval status
    if (!['APPROVED', 'REJECTED'].includes(approvalStatus)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Approval status must be either "APPROVED" or "REJECTED"'
      });
    }

    // Find the most recent pending deactivation request for this account
    const approvalRequest = await Approval.findOne({
      where: { 
        entity_type: 'CustomerAccount',
        entity_id: accountNumber,
        action_type: 'DEACTIVATE_ACCOUNT',
        overall_status: 'PENDING' // Single pending status
      },
      order: [['created_at', 'DESC']],
      transaction
    });

    if (!approvalRequest) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No pending deactivation request found for this account',
        accountNumber,
        suggestion: 'Make sure a deactivation request was created first'
      });
    }

    // Check if request is expired
    if (new Date() > approvalRequest.expiry_date) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Approval request has expired',
        expiry_date: approvalRequest.expiry_date,
        account_number: accountNumber
      });
    }

    // Check if already executed
    if (approvalRequest.executed) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Request has already been executed',
        execution_date: approvalRequest.execution_date,
        account_number: accountNumber
      });
    }

    // Check if user has permission to approve (single approver role)
    const APPROVER_ROLE = 'MANAGER'; // Single approver role
    if (userRole !== APPROVER_ROLE) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: `Only ${APPROVER_ROLE} can approve deactivation requests`,
        user_role: userRole,
        required_role: APPROVER_ROLE
      });
    }

    const now = new Date();

    // Update approval request - SINGLE APPROVAL
    const updateData = {
      first_approver_id: userId,
      first_approver_role: userRole,
      first_approval_status: approvalStatus,
      first_approval_notes: notes || '',
      first_approval_date: now,
      overall_status: approvalStatus === 'APPROVED' ? 'APPROVED' : 'REJECTED'
    };

    await Approval.update(updateData, {
      where: { request_id: approvalRequest.request_id },
      transaction
    });

    // If approved, execute the deactivation immediately
    if (approvalStatus === 'APPROVED') {
      await executeDeactivation(approvalRequest, userId, transaction);
    }

    await transaction.commit();

    // Send notifications
    try {
      if (approvalStatus === 'APPROVED') {
        // Notify initiator that request was approved
        await sendApprovalNotification({
          type: 'EXECUTION_COMPLETE',
          userId: approvalRequest.initiator_id,
          requestId: approvalRequest.request_id,
          action: `Account Deactivation (${approvalRequest.requested_status})`,
          accountNumber: accountNumber,
          executedBy: userName
        });
      } else {
        // Notify initiator about rejection
        await sendApprovalNotification({
          type: 'REQUEST_REJECTED',
          userId: approvalRequest.initiator_id,
          requestId: approvalRequest.request_id,
          action: `Account Deactivation (${approvalRequest.requested_status})`,
          accountNumber: accountNumber,
          notes: notes || '',
          approval_level: 'Single',
          approvedBy: userName
        });
      }
    } catch (notificationError) {
      logger.error('Failed to send notification:', notificationError);
      // Don't fail the main request if notification fails
    }

    // Prepare response
    const response = {
      success: true,
      message: approvalStatus === 'APPROVED' 
        ? `Deactivation request approved and executed successfully`
        : `Deactivation request rejected`,
      account_number: accountNumber,
      approval: {
        request_id: approvalRequest.request_id,
        status: approvalStatus,
        approved_by: userId,
        approved_by_name: userName,
        approved_at: now,
        notes: notes || '',
        approver_role: userRole
      }
    };

    // Add execution details if executed
    if (approvalStatus === 'APPROVED') {
      const finalApproval = await Approval.findOne({
        where: { request_id: approvalRequest.request_id }
      });
      
      if (finalApproval?.executed) {
        response.execution_details = {
          executed_by: finalApproval.executed_by,
          execution_date: finalApproval.execution_date,
          status: 'COMPLETED',
          new_account_status: approvalRequest.requested_status
        };
      }
    }

    return res.status(200).json(response);

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error approving deactivation request:', error);
    
    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing deactivation approval',
      error: error.message,
      account_number: accountNumber,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


// Helper function to execute deactivation after approvals
const executeDeactivation = async (approvalRequest, executedBy, transaction) => {
  try {
    const { entity_id: accountNumber, request_data, requested_status } = approvalRequest;
    const { deactivation_reason, notes, deactivation_type } = request_data;

    // Find the account
    const account = await CustomerAccount.findOne({
      where: { account_number: accountNumber },
      transaction
    });

    if (!account) {
      throw new Error(`Account ${accountNumber} not found`);
    }

    // Store old values for audit trail
    const oldValue = account.toJSON();

    // Prepare update data based on deactivation type
    const updateData = {
      REC_ST: requested_status,
      updatedAt: new Date(),
      deactivation_reason: deactivation_reason,
      deactivation_notes: notes || '',
      deactivated_by: executedBy,
      deactivation_date: new Date()
    };

    // Set substatus based on deactivation type
    switch (requested_status) {
      case 'DORMANT':
        updateData.substatus = 'Dormant';
        updateData.dormancy_date = new Date();
        break;
      case 'SUSPENDED':
        updateData.substatus = 'Suspended';
        updateData.suspension_date = new Date();
        updateData.DR_ALLOWED = false;
        updateData.CR_ALLOWED = false;
        break;
      case 'CLOSED':
        updateData.substatus = 'Closed';
        updateData.closed_date = new Date();
        updateData.closed_by = executedBy;
        updateData.DR_ALLOWED = false;
        updateData.CR_ALLOWED = false;
        updateData.is_online_enabled = false;
        updateData.is_active = false;
        break;
      case 'INACTIVE':
        updateData.substatus = 'Inactive';
        updateData.inactive_date = new Date();
        break;
    }

    // Update account
    await CustomerAccount.update(updateData, {
      where: { account_number: accountNumber },
      transaction
    });

    // Update approval request with execution details
    await Approval.update({
      executed: true,
      execution_date: new Date(),
      executed_by: executedBy
    }, {
      where: { request_id: approvalRequest.request_id },
      transaction
    });

    // Record audit trail for execution
    await AuditTrail.create({
      event_id: Date.now(),
      user_id: executedBy,
      event_type: 'ACCOUNT_DEACTIVATION_EXECUTED',
      action: `Execute Account Deactivation (${requested_status})`,
      old_value: JSON.stringify(oldValue),
      new_value: JSON.stringify({ ...oldValue, ...updateData }),
      ip_address: 'system',
      timestamp: new Date(),
      entity_type: 'CustomerAccount',
      entity_id: oldValue.id,
      status: 'SUCCESS',
      account_no: accountNumber,
      description: `Account deactivated to ${requested_status} after two-level approval`,
      additional_info: {
        approval_request_id: approvalRequest.request_id,
        previous_status: approvalRequest.current_status,
        new_status: requested_status,
        deactivation_type: deactivation_type,
        deactivation_reason: deactivation_reason,
        notes: notes || '',
        executed_by: executedBy,
        first_approver: approvalRequest.first_approver_id,
        second_approver: approvalRequest.second_approver_id,
        execution_date: new Date(),
        restrictions_applied: requested_status === 'CLOSED' ? 'ALL' : 
                            requested_status === 'SUSPENDED' ? 'DEBIT_CREDIT' : 'NONE'
      }
    }, { transaction });

    logger.info('Account deactivation executed successfully', {
      account_number: accountNumber,
      previous_status: approvalRequest.current_status,
      new_status: requested_status,
      executed_by: executedBy,
      approval_request_id: approvalRequest.request_id
    });

    return true;

  } catch (error) {
    console.error('❌ Error executing deactivation:', error);
    throw error;
  }
};


const validateAccountForClosure = async (account, accountNumber) => {
  const results = {
    valid: true,
    checks: [],
    issues: []
  };

  // Check balance
  const ledgerBalance = parseFloat(account.ledger_balance) || 0;
  const availableBalance = parseFloat(account.available_balance) || 0;
  
  if (ledgerBalance !== 0 || availableBalance !== 0) {
    results.valid = false;
    results.issues.push({
      code: 'NON_ZERO_BALANCE',
      message: 'Account has non-zero balance',
      details: {
        ledger_balance: ledgerBalance,
        available_balance: availableBalance
      }
    });
  }
  
  results.checks.push({
    check: 'balance_check',
    status: (ledgerBalance === 0 && availableBalance === 0) ? 'PASSED' : 'FAILED',
    details: { ledgerBalance, availableBalance }
  });

  // Check pending transactions
  const pendingTransactions = await AuditTrail.count({
    where: {
      account_no: accountNumber,
      status: 'PENDING',
      timestamp: {
        [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    }
  });

  if (pendingTransactions > 0) {
    results.valid = false;
    results.issues.push({
      code: 'PENDING_TRANSACTIONS',
      message: `Account has ${pendingTransactions} pending transaction(s)`,
      details: { pending_transactions: pendingTransactions }
    });
  }
  
  results.checks.push({
    check: 'pending_transactions',
    status: pendingTransactions === 0 ? 'PASSED' : 'FAILED',
    details: { pendingTransactions }
  });

  // Check if account has active standing orders
  const activeStandingOrders = await StandingOrder.count({
    where: {
      account_number: accountNumber,
      status: 'ACTIVE'
    }
  });

  if (activeStandingOrders > 0) {
    results.valid = false;
    results.issues.push({
      code: 'ACTIVE_STANDING_ORDERS',
      message: `Account has ${activeStandingOrders} active standing order(s)`,
      details: { active_standing_orders: activeStandingOrders }
    });
  }
  
  results.checks.push({
    check: 'standing_orders',
    status: activeStandingOrders === 0 ? 'PASSED' : 'FAILED',
    details: { activeStandingOrders }
  });

  return results;
};

const generateRequestId = (prefix, accountNumber) => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${accountNumber}-${timestamp}-${random}`;
};

const generateEventId = () => {
  return `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};

const generateErrorReference = () => {
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
};

const getUrgencyLevel = (deactivationType) => {
  const urgencyMap = {
    'CLOSED': 'HIGH',
    'SUSPENDED': 'HIGH',
    'DORMANT': 'MEDIUM',
    'INACTIVE': 'LOW'
  };
  return urgencyMap[deactivationType] || 'MEDIUM';
};

// Cancel deactivation request (only by initiator)
export const cancelDeactivationRequest = async (req, res) => {
  const { requestId } = req.params;
  const { cancellationReason } = req.body;
  const userId = req.user?.id;

  const transaction = await sequelize.transaction();

  try {
    // Find approval request
    const approvalRequest = await Approval.findOne({
      where: { request_id: requestId },
      transaction
    });

    if (!approvalRequest) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Deactivation approval request not found'
      });
    }

    // Check if initiator is cancelling
    if (approvalRequest.initiator_id !== userId) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Only the initiator can cancel this request'
      });
    }

    // Check if already processed
    if (approvalRequest.executed || 
        approvalRequest.overall_status === 'APPROVED' || 
        approvalRequest.overall_status === 'REJECTED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot cancel request in ${approvalRequest.overall_status} state`
      });
    }

    const now = new Date();

    // Update approval request
    await Approval.update({
      overall_status: 'CANCELLED',
      cancellation_reason: cancellationReason,
      cancelled_at: now,
      cancelled_by: userId
    }, {
      where: { request_id: requestId },
      transaction
    });

    // Record audit trail
    await AuditTrail.create({
      event_id: Date.now(),
      user_id: userId,
      event_type: 'DEACTIVATION_REQUEST_CANCELLED',
      action: 'Cancel Deactivation Request',
      old_value: JSON.stringify(approvalRequest.toJSON()),
      new_value: JSON.stringify({...approvalRequest.toJSON(), overall_status: 'CANCELLED'}),
      ip_address: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      timestamp: now,
      entity_type: 'Approval',
      entity_id: approvalRequest.id,
      status: 'CANCELLED',
      account_no: approvalRequest.entity_id,
      description: `Deactivation request cancelled by initiator`,
      additional_info: {
        request_id: requestId,
        cancelled_by: userId,
        cancellation_reason: cancellationReason,
        deactivation_type: approvalRequest.requested_status
      }
    }, { transaction });

    await transaction.commit();

    // Send notifications to approvers
    if (approvalRequest.first_approver_id) {
      await sendNotification({
        type: 'REQUEST_CANCELLED',
        userId: approvalRequest.first_approver_id,
        requestId: requestId,
        action: `Account Deactivation (${approvalRequest.requested_status})`,
        accountNumber: approvalRequest.entity_id,
        cancelled_by: userId,
        cancelled_at: now,
        cancellation_reason: cancellationReason
      });
    }

    if (approvalRequest.second_approver_id) {
      await sendNotification({
        type: 'REQUEST_CANCELLED',
        userId: approvalRequest.second_approver_id,
        requestId: requestId,
        action: `Account Deactivation (${approvalRequest.requested_status})`,
        accountNumber: approvalRequest.entity_id,
        cancelled_by: userId,
        cancelled_at: now,
        cancellation_reason: cancellationReason
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Deactivation request cancelled successfully',
      cancellation: {
        request_id: requestId,
        cancelled_by: userId,
        cancelled_at: now,
        cancellation_reason: cancellationReason,
        previous_status: approvalRequest.overall_status
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error cancelling deactivation request:', error);
    
    return res.status(500).json({
      success: false,
      message: 'An error occurred while cancelling deactivation request',
      error: error.message
    });
  }
};

// Get pending deactivation requests for an approver
// Get pending deactivation requests for an approver
export const getPendingDeactivationRequests = async (req, res) => {
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const { page = 1, limit = 10, status = 'PENDING' } = req.query;

  try {
    const offset = (page - 1) * limit;

    // Build where clause based on user role
    let whereClause = {
      action_type: 'DEACTIVATE_ACCOUNT',
      executed: false
    };

    // Add status filter
    if (status === 'PENDING') {
      whereClause.overall_status = ['PENDING_FIRST', 'PENDING_SECOND'];
    } else if (status === 'FIRST_LEVEL') {
      whereClause.overall_status = 'PENDING_FIRST';
    } else if (status === 'SECOND_LEVEL') {
      whereClause.overall_status = 'PENDING_SECOND';
    } else if (status === 'APPROVED') {
      whereClause.overall_status = 'APPROVED';
    } else if (status === 'REJECTED') {
      whereClause.overall_status = 'REJECTED';
    }

    // Add role-specific filters
    if (userRole === 'MANAGER') {
      whereClause.first_approver_role = userRole;
      whereClause.first_approval_status = 'PENDING';
    } else if (userRole === 'HEAD_OF_DEPARTMENT') {
      whereClause.second_approver_role = userRole;
      whereClause.first_approval_status = 'APPROVED';
      whereClause.second_approval_status = 'PENDING';
    }

    // Count total
    const total = await Approval.count({ where: whereClause });

    // Get requests - FIX: Use 'created_at' instead of 'createdAt'
    const requests = await Approval.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']], // CHANGED: 'createdAt' → 'created_at'
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return res.status(200).json({
      success: true,
      data: {
        requests: requests.map(req => req.toJSON()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        summary: {
          total_pending: total,
          pending_first_level: await Approval.count({
            where: { ...whereClause, overall_status: 'PENDING_FIRST' }
          }),
          pending_second_level: await Approval.count({
            where: { ...whereClause, overall_status: 'PENDING_SECOND' }
          })
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching pending deactivation requests:', error);
    
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching pending requests',
      error: error.message
    });
  }
};

// Get deactivation request details
export const getDeactivationRequestDetails = async (req, res) => {
  const { requestId } = req.params;

  try {
    const approvalRequest = await Approval.findOne({
      where: { request_id: requestId, action_type: 'DEACTIVATE_ACCOUNT' },
      include: [
        {
          model: CustomerAccount,
          as: 'account',
          foreignKey: 'entity_id',
          targetKey: 'account_number'
        }
      ]
    });

    if (!approvalRequest) {
      return res.status(404).json({
        success: false,
        message: 'Deactivation request not found'
      });
    }

    // Get audit trail for this request
    const auditTrails = await AuditTrail.findAll({
      where: {
        [Op.or]: [
          { entity_id: approvalRequest.id },
          { additional_info: { [Op.like]: `%${requestId}%` } }
        ]
      },
      order: [['timestamp', 'DESC']],
      limit: 10
    });

    // Get current account status
    const currentAccount = await CustomerAccount.findOne({
      where: { account_number: approvalRequest.entity_id }
    });

    return res.status(200).json({
      success: true,
      data: {
        request: approvalRequest.toJSON(),
        account: currentAccount ? currentAccount.toJSON() : null,
        audit_trail: auditTrails.map(audit => audit.toJSON()),
        status_summary: {
          is_expired: new Date() > approvalRequest.expiry_date,
          can_approve: approvalRequest.overall_status === 'PENDING_FIRST' || 
                      approvalRequest.overall_status === 'PENDING_SECOND',
          can_execute: approvalRequest.overall_status === 'APPROVED' && !approvalRequest.executed,
          time_remaining: approvalRequest.expiry_date - new Date()
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching deactivation request details:', error);
    
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching request details',
      error: error.message
    });
  }
};







export const bulkActivateAccounts = async (req, res) => {
  const { accountNumbers, activationReason, notes } = req.body;

  const transaction = await sequelize.transaction();

  try {
    // Validate input
    if (!Array.isArray(accountNumbers) || accountNumbers.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'accountNumbers must be a non-empty array of account numbers.',
      });
    }

    if (!activationReason || activationReason.trim() === '') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Activation reason is required for bulk activation.',
      });
    }

    // Validate all account numbers format
    const invalidAccounts = accountNumbers.filter(acctNo => !/^\d{10}$/.test(acctNo));
    if (invalidAccounts.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid account number format',
        invalidAccounts,
        details: 'All account numbers must be 10-digit numbers.'
      });
    }

    // Find all accounts
    const accounts = await CustomerAccount.findAll({
      where: { account_number: { [sequelize.Op.in]: accountNumbers } },
      transaction
    });

    if (accounts.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No accounts found with the provided account numbers.',
      });
    }

    // Check for missing accounts
    const foundAccountNumbers = accounts.map(acc => acc.account_number);
    const missingAccounts = accountNumbers.filter(acctNo => !foundAccountNumbers.includes(acctNo));

    if (missingAccounts.length > 0) {
      console.warn('Some accounts not found:', missingAccounts);
    }

    const activationResults = {
      activated: [],
      alreadyActive: [],
      cannotActivate: [],
      notFound: missingAccounts
    };

    const now = new Date();
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    // Process each account
    for (const account of accounts) {
      const oldValue = account.toJSON();
      const currentStatus = account.REC_ST;

      // Skip if already active
      if (currentStatus === 'ACTIVE') {
        activationResults.alreadyActive.push({
          account_number: account.account_number,
          account_name: account.PRODUCT_DESC,
          current_status: currentStatus
        });
        continue;
      }

      // Check if account can be activated
      const validPreviousStates = ['DORMANT', 'INACTIVE', 'SUSPENDED', 'PENDING'];
      if (!validPreviousStates.includes(currentStatus)) {
        activationResults.cannotActivate.push({
          account_number: account.account_number,
          account_name: account.PRODUCT_DESC,
          current_status: currentStatus,
          reason: `Cannot activate account with status: ${currentStatus}`
        });
        continue;
      }

      // Activate the account
      await CustomerAccount.update({
        REC_ST: 'ACTIVE',
        substatus: 'Active',
        lastActivityDate: now,
        updatedAt: now
      }, {
        where: { id: account.id },
        transaction
      });

      activationResults.activated.push({
        account_number: account.account_number,
        account_name: account.PRODUCT_DESC,
        previous_status: currentStatus,
        new_status: 'ACTIVE'
      });

      // Create audit trail for each activated account
      if (AuditTrail && typeof AuditTrail.create === 'function') {
        await AuditTrail.create({
          event_id: Date.now() + Math.random(), // Ensure unique event_id
          user_id: userId,
          event_type: 'BULK_ACCOUNT_ACTIVATION',
          action: 'Bulk Activate Account',
          old_value: oldValue,
          new_value: { ...account.toJSON(), REC_ST: 'ACTIVE', substatus: 'Active' },
          ip_address: ipAddress,
          timestamp: now,
          entity_type: 'CustomerAccount',
          entity_id: account.id,
          status: 'SUCCESS',
          account_no: account.account_number,
          description: `Account activated from ${currentStatus} to ACTIVE (Bulk operation)`,
          additional_info: {
            previous_status: currentStatus,
            new_status: 'ACTIVE',
            activation_reason: activationReason,
            notes: notes || '',
            activated_by: userId,
            activation_date: now,
            bulk_operation: true
          }
        }, { transaction });
      }
    }

    await transaction.commit();

    // Log bulk activation results
    logger.info('Bulk account activation completed', {
      totalRequested: accountNumbers.length,
      activated: activationResults.activated.length,
      alreadyActive: activationResults.alreadyActive.length,
      cannotActivate: activationResults.cannotActivate.length,
      notFound: activationResults.notFound.length,
      activatedBy: userId,
      timestamp: now
    });

    return res.status(200).json({
      success: true,
      message: 'Bulk account activation completed',
      results: activationResults,
      summary: {
        total_requested: accountNumbers.length,
        successfully_activated: activationResults.activated.length,
        already_active: activationResults.alreadyActive.length,
        cannot_activate: activationResults.cannotActivate.length,
        not_found: activationResults.notFound.length
      },
      activation_details: {
        reason: activationReason,
        notes: notes || '',
        timestamp: now,
        performed_by: userId
      }
    });

  } catch (error) {
    await transaction.rollback();

    logger.error('Error in bulk account activation:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred during bulk account activation',
      error: error.message,
    });
  }
};

// Get account activation history
export const getAccountActivationHistory = async (req, res) => {
  const { accountNumber } = req.params;

  try {
    // Validate account number
    if (!/^\d{10}$/.test(accountNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Account number must be a 10-digit number.',
      });
    }

    // Check if account exists
    const account = await CustomerAccount.findOne({
      where: { account_number: accountNumber }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found.',
      });
    }

    // Get activation history from audit trail
    const activationHistory = await AuditTrail.findAll({
      where: {
        account_no: accountNumber,
        event_type: { [sequelize.Op.in]: ['ACCOUNT_ACTIVATION', 'BULK_ACCOUNT_ACTIVATION'] }
      },
      order: [['timestamp', 'DESC']],
      attributes: ['event_type', 'action', 'timestamp', 'user_id', 'description', 'additional_info']
    });

    return res.status(200).json({
      success: true,
      message: 'Account activation history retrieved successfully',
      account: {
        account_number: account.account_number,
        account_name: account.PRODUCT_DESC,
        account_type: account.ACCOUNT_TYPE,
        current_status: account.REC_ST
      },
      activation_history: activationHistory,
      total_activations: activationHistory.length
    });

  } catch (error) {
    logger.error('Error fetching account activation history:', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching account activation history',
      error: error.message,
    });
  }
};

// Update dormant accounts by inactivity
const INACTIVITY_PERIOD_MONTHS = 6;

export const updateDormantAccounts = async () => {
  const transaction = await sequelize.transaction();

  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - INACTIVITY_PERIOD_MONTHS);

    const accountsToDormant = await CustomerAccount.findAll({
      where: {
        REC_ST: 'ACTIVE',
        lastActivityDate: { [sequelize.Op.lt]: cutoffDate }
      },
      transaction
    });

    const updatedAccounts = [];
    for (const account of accountsToDormant) {
      const oldValue = account.toJSON();
      
      await CustomerAccount.update(
        { 
          REC_ST: 'DORMANT', 
          substatus: 'Dormant',
          updatedAt: new Date() 
        },
        {
          where: { id: account.id },
          transaction
        }
      );

      // Get updated account
      const updatedAccount = await CustomerAccount.findByPk(account.id, { transaction });
      updatedAccounts.push(updatedAccount);

      if (AuditTrail && typeof AuditTrail.create === 'function') {
        await AuditTrail.create({
          event_id: Date.now(),
          user_id: 'system',
          event_type: 'CUSTOMER_ACCOUNT_UPDATE',
          action: 'Mark Account Dormant',
          old_value: oldValue,
          new_value: updatedAccount.toJSON(),
          ip_address: 'system',
          timestamp: new Date(),
          entity_type: 'CustomerAccount',
          entity_id: account.id,
          status: 'SUCCESS',
          account_no: account.account_number,
          description: `Account marked DORMANT due to inactivity for ${INACTIVITY_PERIOD_MONTHS} months`,
        }, { transaction });
      }

      logger.info(`Account ${account.account_number} marked as DORMANT due to inactivity.`);
    }

    await transaction.commit();
    logger.info(`Updated ${updatedAccounts.length} accounts to DORMANT status.`);
    return updatedAccounts;
  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating dormant accounts:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date(),
    });
    throw error;
  }
};

// Search customers by name using customer_accounts table
export const searchCustomersByName = async (req, res) => {
  const { name } = req.params || req.query;

  try {
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Name parameter is required'
      });
    }

    const searchTerm = name.toString().trim();
    console.log(`🔍 Searching customers by name: "${searchTerm}"`);
    const searchPattern = `%${searchTerm}%`;

    // Using accounts table for account_name (acct_nm) and joining with customers
    const customers = await sequelize.query(
      `SELECT DISTINCT
        c.CUST_ID,
        c.CUST_NM,
        c.FIRST_NAME,
        c.LAST_NAME,
        c.EMAIL_ADDRESS,
        c.PHONE_NO,
        a.acct_nm as account_name,
        a.account_number,
        a.account_type,
        a.rec_st as account_status,
        a.ledger_balance
      FROM customers c
      LEFT JOIN accounts a ON a.customer_id = c.CUST_ID
      WHERE 
        c.CUST_NM LIKE :searchPattern
        OR c.FIRST_NAME LIKE :searchPattern
        OR c.LAST_NAME LIKE :searchPattern
        OR CONCAT(c.FIRST_NAME, ' ', c.LAST_NAME) LIKE :searchPattern
        OR a.acct_nm LIKE :searchPattern
      LIMIT 50`,
      {
        replacements: { searchPattern },
        type: sequelize.QueryTypes.SELECT
      }
    );

    console.log(`✅ Found ${customers.length} customers matching "${searchTerm}"`);

    if (customers.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No customers found matching "${searchTerm}"`,
        searched_name: searchTerm
      });
    }

    // Group by customer
    const customerMap = new Map();
    customers.forEach(cust => {
      if (!customerMap.has(cust.CUST_ID)) {
        customerMap.set(cust.CUST_ID, {
          customer_id: cust.CUST_ID,
          customer_name: cust.CUST_NM || `${cust.FIRST_NAME || ''} ${cust.LAST_NAME || ''}`.trim(),
          first_name: cust.FIRST_NAME,
          last_name: cust.LAST_NAME,
          email: cust.EMAIL_ADDRESS,
          phone: cust.PHONE_NO,
          accounts: []
        });
      }
      if (cust.account_number) {
        customerMap.get(cust.CUST_ID).accounts.push({
          account_number: cust.account_number,
          account_name: cust.account_name,
          account_type: cust.account_type,
          status: cust.account_status,
          balance: parseFloat(cust.ledger_balance || 0)
        });
      }
    });

    const result = Array.from(customerMap.values());

    return res.status(200).json({
      success: true,
      message: `Found ${result.length} customer(s) matching "${searchTerm}"`,
      search_term: searchTerm,
      count: result.length,
      customers: result
    });

  } catch (error) {
    console.error('❌ Error searching customers by name:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while searching customers',
      error: error.message
    });
  }
};

// ============================
// EXPORT ALL FUNCTIONS
// ============================

export default {
  healthCheck,
  createCustomerAccount,
  createCustomerAccountWithAutoNumbers,
  getAllCustomerAccounts,
  getCustomerAccountByCUST_ID,
  updateCustomerAccount,
  getAccountByNumber,
  deleteCustomerAccount,
  getAccountTransactionHistory,

  bulkActivateAccounts,
  getAccountActivationHistory,
  updateDormantAccounts,
  searchCustomersByName,
  resetAccountCounters,
  findDuplicateAccounts
};