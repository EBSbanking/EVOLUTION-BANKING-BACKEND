// controllers/CustomerAccountController.js - UPDATED FOR SIMPLIFIED SCHEMA
import sequelize from '../../config/db.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Customer from '../models/Customer.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';
import SavingsProduct from '../models/SavingsProduct.js';
import GLAccount from '../models/GLAccount.js';
import Counter from '../models/Counter.js';
import NotificationService, { sendApprovalNotification } from '../Services/NotificationService.js';
import Approval from '../models/Approval.js';



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

// Generate Account Number for Customer (SIMPLIFIED VERSION)
const generateAccountNumberForCustomer = async (customerId, accountType = 'SAVINGS', transaction = null) => {
  try {
    console.log(`🔍 Looking for customer with ID: ${customerId}`);
    
    // Get the customer
    let customer;
    
    if (Customer && typeof Customer.findOne === 'function') {
      console.log('📦 Using Customer model findOne method');
      
      customer = await Customer.findOne({
        where: {
          [sequelize.Op.or]: [
            { CUST_ID: String(customerId) },
            { CUST_ID: String(customerId).padStart(10, '0') },
            sequelize.where(
              sequelize.cast(sequelize.col('CUST_ID'), 'CHAR'),
              String(customerId).replace(/^0+/, '')
            )
          ]
        },
        transaction
      });
    } else {
      console.log('⚠️ Customer model not available, using raw query');
      
      const [results] = await sequelize.query(
        `SELECT * FROM customers 
         WHERE CUST_ID = :customerId 
            OR CUST_ID = :paddedId 
            OR TRIM(LEADING '0' FROM CUST_ID) = :cleanId 
         LIMIT 1`,
        {
          replacements: {
            customerId: String(customerId),
            paddedId: String(customerId).padStart(10, '0'),
            cleanId: String(customerId).replace(/^0+/, '')
          },
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );
      
      customer = results ? { CUST_ID: results.CUST_ID } : null;
    }

    if (!customer) {
      const numericCustomerId = parseInt(customerId) || 0;
      if (numericCustomerId > 0) {
        const [results] = await sequelize.query(
          `SELECT * FROM customers WHERE id = :id OR CUST_ID = :custId LIMIT 1`,
          {
            replacements: { id: numericCustomerId, custId: String(customerId) },
            type: sequelize.QueryTypes.SELECT,
            transaction
          }
        );
        customer = results ? { CUST_ID: results.CUST_ID } : null;
      }
    }

    if (!customer) {
      console.error(`❌ Customer ${customerId} not found`);
      throw new Error(`Customer ${customerId} not found`);
    }

    console.log(`✅ Found customer: ${customer.CUST_ID}`);

    // Generate account number (simple method - 10 digits starting with 2)
    let accountNumber;
    if (USE_NUBAN) {
      // For simplified schema: just generate 10 digits starting with 2
      const timestamp = Date.now().toString().slice(-8); // Get last 8 digits of timestamp
      const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const base = `2${timestamp.slice(0, 6)}${randomPart}`.slice(0, 9);
      const checkDigit = calculateNUBANCheckDigit(base);
      accountNumber = `${base}${checkDigit}`;
    } else {
      // Legacy format
      const prefixMap = {
        'SAVINGS': '2',
        'CURRENT': '3',
        'LOAN': '1',
      };
      const prefix = prefixMap[accountType.toUpperCase()] || '2';
      const random = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
      accountNumber = `${prefix}${random}`.slice(0, 10);
    }

    // Verify account number is 10 digits
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new Error(`Generated account number ${accountNumber} is not 10 digits`);
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

    console.log(`✅ Generated Account for Customer ${customerId}: account_number=${accountNumber}, ACCT_ID=${ACCT_ID}, Type=${accountType}`);

    return {
      account_number: accountNumber,
      ACCT_ID,
      CUST_ID: customerId,
      accountType: accountType.toUpperCase()
    };
  } catch (error) {
    console.error('❌ Error generating account number:', error);
    throw new Error(`Failed to generate account number: ${error.message}`);
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
// MAIN ACCOUNT CREATION CONTROLLERS
// ============================

// Health check endpoint
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

// MAIN CREATE ACCOUNT FUNCTION - UPDATED FOR SIMPLIFIED SCHEMA
// MAIN CREATE ACCOUNT FUNCTION - UPDATED FOR SIMPLIFIED SCHEMA WITH COLUMN CREATION
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

      // ✅ Generate account number
      let finalAccountNumber;
      try {
        const generatedAccount = await generateAccountNumberForCustomer(
          CUST_ID,
          normalizedAccountType,
          transaction
        );

        finalAccountNumber = generatedAccount.account_number;
        console.log(`✅ Auto-generated account number: ${finalAccountNumber} for customer ${CUST_ID}`);
      } catch (genError) {
        await transaction.rollback();
        return res.status(500).json({
          success: false,
          message: `Failed to generate account number: ${genError.message}`,
          account: 'new account',
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
        // Core fields
        customer_id: parseInt(CUST_ID) || 0,
        customer_code: customerDetails?.CUST_NO || customerDetails?.cust_no || '',
        account_number: finalAccountNumber,
        
        // Product information
        product_type: normalizedAccountType,
        product: PROD_ID || product || '',
        PRODUCT_DESC: PRODUCT_DESC || `${normalizedAccountType} Account: ${ACCT_NM}`,
        
        // Status
        REC_ST: REC_ST.toUpperCase(),
        ACCOUNT_TYPE: normalizedAccountType,
        substatus: REC_ST === 'PENDING' ? 'Pending' : 'Active',
        
        // Branch and currency
        branch: parseInt(BU_ID) || branch,
        currency: currency,
        
        // Financial information
        opening_amount: parseFloat(opening_amount) || 0.0,
        cleared_balance: parseFloat(opening_amount) || 0.0,
        ledger_balance: parseFloat(opening_amount) || 0.0,
        available_balance: parseFloat(opening_amount) || 0.0,
        current_balance: parseFloat(opening_amount) || 0.0,
        
        // Interest fields
        INTEREST_RATE: 0.0,
        ACCRUED_INTEREST: 0.0,
        agreed_interest_rate: 0.0,
        
        // Flags
        online_enabled: true,
        auto_approve: false,
        sms_alert: 'No',
        email_alert: 'No',
        DR_ALLOWED: true,
        CR_ALLOWED: true,
        isOverdraftAllowed: false,
        
        // User tracking
        created_by: userId,
        
        // Dates
        lastActivityDate: now,
        last_transaction_date: now,
        
        // Other fields
        primary_relationship_manager: 1,
        overdraftLimit: 0.0,
        
        // JSON field
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
        acct_no: finalAccountNumber, // Same as account_number
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
        
        // Rollback the entire transaction if core account creation fails
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

      // ✅ STEP 4: Create audit trail for both
      try {
        if (AuditTrail && typeof AuditTrail.create === 'function') {
          // Audit for customer account creation
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

    // Handle specific errors
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

// Alternative simplified account creation with auto column creation
export const createCustomerAccountWithAutoNumbers = async (req, res) => {
  console.log('🚀 Starting createCustomerAccountWithAutoNumbers...');
  
  await checkModels();
  
  // ==================== FIRST: ENSURE DATABASE COLUMNS EXIST ====================
  try {
    console.log('🔧 Ensuring required columns exist...');
    
    // Check and create ledger_balance column
    try {
      await sequelize.query('SELECT ledger_balance FROM customer_accounts LIMIT 1');
    } catch (error) {
      if (error.message.includes('Unknown column')) {
        console.log('➕ Creating ledger_balance column...');
        await sequelize.query(`
          ALTER TABLE customer_accounts 
          ADD COLUMN ledger_balance DECIMAL(20,2) DEFAULT 0.00
        `);
      }
    }
    
    // Check and create cleared_balance column
    try {
      await sequelize.query('SELECT cleared_balance FROM customer_accounts LIMIT 1');
    } catch (error) {
      if (error.message.includes('Unknown column')) {
        console.log('➕ Creating cleared_balance column...');
        await sequelize.query(`
          ALTER TABLE customer_accounts 
          ADD COLUMN cleared_balance DECIMAL(20,2) DEFAULT 0.00
        `);
      }
    }
    
    console.log('✅ Database columns verified/created');
    
  } catch (columnError) {
    console.error('⚠️ Could not verify/create columns:', columnError.message);
  }

  const transaction = await sequelize.transaction();

  try {
    const { CUST_ID, ACCOUNT_TYPE = 'SAVINGS', ...otherData } = req.body;

    // Validate required fields
    if (!CUST_ID || !otherData.ACCT_NM) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'CUST_ID and ACCT_NM are required.',
      });
    }

    // Generate account number
    const { account_number } = await generateAccountNumberForCustomer(
      CUST_ID,
      ACCOUNT_TYPE,
      transaction
    );

    // Parse opening amount
    const openingAmount = parseFloat(otherData.opening_amount) || 0.0;

    // Create the account with all three balances
    const newAccount = await CustomerAccount.create({
      customer_id: parseInt(CUST_ID) || 0,
      account_number: account_number,
      product_type: ACCOUNT_TYPE.toUpperCase(),
      product: otherData.PROD_ID || '',
      branch: parseInt(otherData.BU_ID) || 1,
      REC_ST: 'PENDING',
      ACCOUNT_TYPE: ACCOUNT_TYPE.toUpperCase(),
      PRODUCT_DESC: `${ACCOUNT_TYPE} Account: ${otherData.ACCT_NM}`,
      currency: otherData.currency || 'NGN',
      opening_amount: openingAmount,
      
      // ALL THREE BALANCES
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

    // Audit trail
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();

    if (AuditTrail && typeof AuditTrail.create === 'function') {
      await AuditTrail.create({
        event_id: Date.now(),
        user_id: userId,
        event_type: 'CUSTOMER_ACCOUNT_CREATE',
        action: 'Create Account',
        old_value: null,
        new_value: {
          id: newAccount.id,
          account_number: newAccount.account_number,
          customer_id: newAccount.customer_id,
          balances: {
            ledger_balance: newAccount.ledger_balance,
            available_balance: newAccount.available_balance,
            cleared_balance: newAccount.cleared_balance
          }
        },
        ip_address: ipAddress,
        timestamp: now,
        entity_type: 'CustomerAccount',
        entity_id: newAccount.id,
        status: 'SUCCESS',
        account_no: newAccount.account_number,
        description: `Created ${ACCOUNT_TYPE} account for customer ${CUST_ID}`,
      }, { transaction });
    }

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
      },
      note: 'Account number was auto-generated. All three balance columns are now available.'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating account:', error);

    // Provide helpful error message for column issues
    if (error.message.includes('Unknown column') || error.message.includes('ledger_balance') || error.message.includes('cleared_balance')) {
      return res.status(500).json({
        success: false,
        message: 'Database column issue detected.',
        solution: 'Run these SQL commands to add missing columns:',
        sql_commands: [
          "ALTER TABLE customer_accounts ADD COLUMN ledger_balance DECIMAL(20,2) DEFAULT 0.00;",
          "ALTER TABLE customer_accounts ADD COLUMN cleared_balance DECIMAL(20,2) DEFAULT 0.00;"
        ],
        error: error.message
      });
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error',
        error: error.errors.map(e => e.message),
      });
    }

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

    // Clean the account number
    const cleanAccountNumber = accountNumber.trim();
    
    // DEBUG: Show what we're searching for
    console.log(`🔍 Clean account number: "${cleanAccountNumber}"`);
    console.log(`🔍 Length: ${cleanAccountNumber.length}`);

    // Use a simpler, more reliable query
    const query = `
      SELECT 
        id,
        customer_id,
        account_name,
        account_number,
        branch_id,
        branch_name,
        bu_id,
        status,
        account_type,
        product_type,
        product_name,
        product_description,
        currency_code,
        opening_balance,
        current_balance,
        available_balance,
        ledger_balance,
        cleared_balance,
        interest_rate,
        accrued_interest,
        is_online_enabled,
        allow_debit,
        allow_credit,
        created_at,
        updated_at,
        account_opened_date,
        last_transaction_date,
        created_by,
        created_by_name,
        approved_by,
        approved_by_name,
        approved_at,
        prod_id,
        product_code,
        gl_account_id,
        gl_account_number
      FROM customer_accounts 
      WHERE account_number = ?
      LIMIT 1
    `;

    console.log(`🔍 Executing query for: ${cleanAccountNumber}`);
    
    const [rows] = await sequelize.query(query, {
      replacements: [cleanAccountNumber],
      type: sequelize.QueryTypes.SELECT
    });

    console.log(`🔍 Query result:`, rows ? 'Found' : 'Not found');
    
    // Check if we got a result
    if (!rows || rows.length === 0) {
      // Try alternative: check if table exists and has data
      console.log(`🔄 Trying to check table structure...`);
      
      try {
        const [tableCheck] = await sequelize.query(
          "SELECT COUNT(*) as count FROM customer_accounts"
        );
        console.log(`📊 Total accounts in table: ${tableCheck[0]?.count || 0}`);
        
        // List first few accounts to see what's in the table
        const [sampleAccounts] = await sequelize.query(
          "SELECT account_number, account_name FROM customer_accounts LIMIT 5"
        );
        console.log(`📋 Sample accounts:`, sampleAccounts);
        
      } catch (tableError) {
        console.error(`❌ Error checking table:`, tableError.message);
      }
      
      return res.status(404).json({
        success: false,
        message: `Account not found: ${cleanAccountNumber}`,
        note: 'Check if account number exists in database'
      });
    }

    // Extract the account data (rows is the actual object, not an array)
    const account = rows;

    console.log(`✅ Account found: ${account.account_number} - ${account.account_name}`);
    console.log(`✅ Account ID: ${account.id}`);
    console.log(`✅ Branch ID: ${account.branch_id}`);

    // Prepare response
    const responseData = {
      success: true,
      message: 'Account retrieved successfully',
      data: {
        // Basic account info
        id: account.id,
        account_number: account.account_number,
        account_name: account.account_name,
        customer_id: account.customer_id,
        
        // Status and type
        status: account.status,
        account_type: account.account_type,
        product_type: account.product_type,
        product_name: account.product_name || '',
        product_description: account.product_description,
        product_code: account.product_code,
        
        // Branch information
        branch_id: account.branch_id || '',
        branch_name: account.branch_name || '',
        bu_id: account.bu_id || '',
        
        // Balances
        opening_balance: parseFloat(account.opening_balance) || 0,
        current_balance: parseFloat(account.current_balance) || 0,
        available_balance: parseFloat(account.available_balance) || 0,
        ledger_balance: parseFloat(account.ledger_balance) || 0,
        cleared_balance: parseFloat(account.cleared_balance) || 0,
        
        // Interest
        interest_rate: parseFloat(account.interest_rate) || 0,
        accrued_interest: parseFloat(account.accrued_interest) || 0,
        
        // Currency
        currency_code: account.currency_code || 'NGN',
        
        // Flags
        is_online_enabled: Boolean(account.is_online_enabled),
        allow_debit: Boolean(account.allow_debit),
        allow_credit: Boolean(account.allow_credit),
        
        // Dates
        account_opened_date: account.account_opened_date,
        last_transaction_date: account.last_transaction_date,
        created_at: account.created_at,
        updated_at: account.updated_at,
        approved_at: account.approved_at,
        
        // User tracking
        created_by: account.created_by || '',
        created_by_name: account.created_by_name || '',
        approved_by: account.approved_by || '',
        approved_by_name: account.approved_by_name || '',
        
        // Product references
        prod_id: account.prod_id,
        
        // GL Account references
        gl_account_id: account.gl_account_id,
        gl_account_number: account.gl_account_number
      }
    };

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('❌ Error fetching account:', error);
    console.error('❌ Error stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching account',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get all customer accounts
export const getAllCustomerAccounts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, accountType } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (status) where.REC_ST = status.toUpperCase();
    if (accountType) where.ACCOUNT_TYPE = accountType.toUpperCase();

    const { rows: accounts, count } = await CustomerAccount.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      message: 'Customer accounts retrieved successfully',
      count: accounts.length,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit),
      accounts: accounts.map(acc => ({
        id: acc.id,
        customer_id: acc.customer_id,
        account_number: acc.account_number,
        account_type: acc.ACCOUNT_TYPE,
        product_type: acc.product_type,
        status: acc.REC_ST,
        product_description: acc.PRODUCT_DESC,
        branch: acc.branch,
        currency: acc.currency,
        opening_amount: acc.opening_amount,
        cleared_balance: acc.cleared_balance,
        ledger_balance: acc.ledger_balance,
        available_balance: acc.AVAILABLE_BALANCE,
        interest_rate: acc.INTEREST_RATE,
        accrued_interest: acc.ACCRUED_INTEREST,
        created_at: acc.createdAt,
        last_activity_date: acc.lastActivityDate
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
// Get customer accounts by CUST_ID
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

    // Search for accounts using raw SQL
    const accounts = await sequelize.query(
      `SELECT ca.*, c.FIRST_NAME, c.LAST_NAME, c.EMAIL_ADDRESS, c.PHONE_NO, c.CUST_NM
       FROM customer_accounts ca
       LEFT JOIN customers c ON c.CUST_ID = :paddedId OR TRIM(LEADING '0' FROM c.CUST_ID) = :cleanId
       WHERE ca.customer_id = :numericId 
          OR ca.customer_id = :cleanId 
          OR ca.customer_id = :originalId
       ORDER BY ca.created_at DESC`,
      {
        replacements: {
          customerId: originalId,
          paddedId: paddedId,
          numericId: numericId,
          cleanId: cleanId,
          originalId: originalId
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

    // Process accounts for consistent response
    const processedAccounts = accounts.map(account => {
      // Determine account name
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
        accountName = `Customer ${account.customer_id}`;
      }

      return {
        // Primary identifiers
        id: account.id,
        account_number: account.account_number,
        account_name: accountName,
        customer_id: account.customer_id,
        customer_code: account.customer_id, // Using customer_id as customer_code

        // Status and type
        status: account.status || account.REC_ST,
        account_type: account.account_type,
        product_type: account.product_type,
        product_description: account.product_description,

        // Balances
        opening_amount: parseFloat(account.opening_balance || account.opening_amount || 0),
        cleared_balance: parseFloat(account.cleared_balance || 0),
        ledger_balance: parseFloat(account.ledger_balance || account.current_balance || 0),
        available_balance: parseFloat(account.available_balance || 0),

        // Interest
        interest_rate: parseFloat(account.interest_rate || 0),
        accrued_interest: parseFloat(account.accrued_interest || 0),

        // Additional info
        branch: account.branch_name || account.branch_id,
        currency: account.currency_code || 'NGN',
        opened_date: account.account_opened_date || account.created_at,
        last_activity_date: account.last_transaction_date,

        // Customer info
        customer_name: account.FIRST_NAME || account.LAST_NAME 
          ? `${account.FIRST_NAME || ''} ${account.LAST_NAME || ''}`.trim() 
          : account.CUST_NM,
        customer_email: account.EMAIL_ADDRESS || null,
        customer_phone: account.PHONE_NO || null,
        
        // Additional fields from your schema
        product_name: account.product_name,
        branch_id: account.branch_id,
        is_online_enabled: account.is_online_enabled,
        allow_debit: account.allow_debit,
        allow_credit: account.allow_credit
      };
    });

    // Calculate summary
    const totalBalance = processedAccounts.reduce((sum, account) => {
      return sum + account.ledger_balance;
    }, 0);

    const activeAccounts = processedAccounts.filter(account => 
      account.status === 'ACTIVE'
    ).length;

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

// // Activate a customer account by account number
// export const activateCustomerAccount = async (req, res) => {
//   const { accountNumber } = req.params;
//   const { activationReason, notes } = req.body;

//   const transaction = await sequelize.transaction();

//   try {
//     console.log('🔍 Activation request received:', {
//       accountNumber,
//       activationReason,
//       notes
//     });

//     // Validate account number
//     if (!/^\d{10}$/.test(accountNumber)) {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Account number must be a 10-digit number.',
//       });
//     }

//     // Validate activation reason
//     if (!activationReason || activationReason.trim() === '') {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Activation reason is required.',
//       });
//     }

//     // Find the account with all fields
//     const account = await CustomerAccount.findOne({
//       where: { account_number: accountNumber },
//       transaction
//     });

//     if (!account) {
//       await transaction.rollback();
//       return res.status(404).json({
//         success: false,
//         message: 'Customer account not found.',
//         account_number: accountNumber
//       });
//     }

//     // Get account as plain object for easier inspection
//     const accountData = account.toJSON ? account.toJSON() : account;
    
//     console.log('📊 Account data:', accountData);

//     // Try to find the status field - check all possible field names
//     const statusFieldNames = ['REC_ST', 'status', 'account_status', 'acc_status', 'state', 'account_state', 'STATUS'];
//     let currentStatus = null;
//     let statusFieldName = null;

//     for (const field of statusFieldNames) {
//       if (accountData[field] !== undefined && accountData[field] !== null) {
//         currentStatus = String(accountData[field]).toUpperCase();
//         statusFieldName = field;
//         break;
//       }
//     }

//     console.log('📋 Status detection:', {
//       foundField: statusFieldName,
//       currentStatus: currentStatus,
//       allFields: Object.keys(accountData)
//     });

//     if (!currentStatus) {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Could not determine account status. Available fields: ' + Object.keys(accountData).join(', '),
//         available_fields: Object.keys(accountData),
//         account_sample: {
//           account_number: accountData.account_number,
//           account_name: accountData.account_name,
//           account_type: accountData.account_type
//         }
//       });
//     }

//     // Check if account is already active
//     if (currentStatus === 'ACTIVE') {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Account is already active',
//         account: {
//           account_number: accountData.account_number,
//           account_name: accountData.account_name || accountData.PRODUCT_DESC,
//           current_status: currentStatus,
//           account_type: accountData.account_type || accountData.ACCOUNT_TYPE,
//           status_field: statusFieldName
//         }
//       });
//     }

//     // Validate that account can be activated
//     const validPreviousStates = ['DORMANT', 'INACTIVE', 'SUSPENDED', 'PENDING', 'CLOSED'];
//     if (!validPreviousStates.includes(currentStatus)) {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Cannot activate account with status: "${currentStatus}". Only ${validPreviousStates.join(', ')} accounts can be activated.`,
//         currentStatus: currentStatus,
//         status_field: statusFieldName,
//         validStates: validPreviousStates
//       });
//     }

//     // Store old values for audit trail
//     const oldValue = JSON.parse(JSON.stringify(accountData));

//     // Prepare update data
//     const updateData = {
//       updatedAt: new Date(),
//       lastActivityDate: new Date()
//     };

//     // Set the status field to ACTIVE
//     if (statusFieldName) {
//       updateData[statusFieldName] = 'ACTIVE';
//     }

//     // Also update substatus if field exists
//     if (accountData.substatus !== undefined) {
//       updateData.substatus = 'Active';
//     }

//     console.log('🔄 Update data:', updateData);

//     // Activate the account
//     const [affectedRows] = await CustomerAccount.update(updateData, {
//       where: { account_number: accountNumber },
//       transaction
//     });

//     console.log(`✅ Updated ${affectedRows} row(s)`);

//     // Get updated account
//     const updatedAccount = await CustomerAccount.findOne({
//       where: { account_number: accountNumber },
//       transaction
//     });

//     const updatedAccountData = updatedAccount.toJSON ? updatedAccount.toJSON() : updatedAccount;

//     // Record audit trail
//     const userId = req.user?.id || req.headers['x-user-id'] || 'system';
//     const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
//     const now = new Date();

//     if (AuditTrail && typeof AuditTrail.create === 'function') {
//       try {
//         await AuditTrail.create({
//           event_id: Date.now(),
//           user_id: userId,
//           event_type: 'ACCOUNT_ACTIVATION',
//           action: 'Activate Account',
//           old_value: JSON.stringify(oldValue),
//           new_value: JSON.stringify(updatedAccountData),
//           ip_address: ipAddress,
//           timestamp: now,
//           entity_type: 'CustomerAccount',
//           entity_id: updatedAccountData.id,
//           status: 'SUCCESS',
//           account_no: accountNumber,
//           description: `Account activated from ${currentStatus} to ACTIVE`,
//           additional_info: {
//             previous_status: currentStatus,
//             new_status: 'ACTIVE',
//             activation_reason: activationReason,
//             notes: notes || '',
//             activated_by: userId,
//             activation_date: now,
//             status_field_used: statusFieldName,
//             updated_fields: Object.keys(updateData)
//           }
//         }, { transaction });
//         console.log('✅ Audit trail created');
//       } catch (auditError) {
//         console.error('⚠️ Failed to create audit trail:', auditError.message);
//       }
//     }

//     await transaction.commit();
//     console.log('✅ Transaction committed');

//     // Log the activation
//     logger.info('Account activated successfully', {
//       account_number: accountNumber,
//       previousStatus: currentStatus,
//       newStatus: 'ACTIVE',
//       statusField: statusFieldName,
//       activatedBy: userId,
//       activationReason,
//       timestamp: now
//     });

//     return res.status(200).json({
//       success: true,
//       message: 'Account activated successfully',
//       account: {
//         account_number: accountData.account_number,
//         account_name: accountData.account_name || accountData.PRODUCT_DESC,
//         account_type: accountData.account_type || accountData.ACCOUNT_TYPE,
//         previous_status: currentStatus,
//         new_status: 'ACTIVE',
//         status_field: statusFieldName,
//         activation_date: now,
//         activated_by: userId
//       },
//       activation_details: {
//         reason: activationReason,
//         notes: notes || '',
//         timestamp: now
//       },
//       debug: process.env.NODE_ENV === 'development' ? {
//         old_status: currentStatus,
//         status_field: statusFieldName,
//         updated_fields: Object.keys(updateData)
//       } : undefined
//     });

//   } catch (error) {
//     await transaction.rollback();

//     console.error('❌ Error activating customer account:', error);
    
//     return res.status(500).json({
//       success: false,
//       message: 'An error occurred while activating the customer account',
//       error: error.message,
//       stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// };
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

// export const deactivateCustomerAccount = async (req, res) => {
//   const { accountNumber } = req.params;
//   const { deactivationReason, notes, deactivationType = 'DORMANT' } = req.body;

//   const transaction = await sequelize.transaction();

//   try {
//     console.log('🔍 Deactivation request:', {
//       accountNumber,
//       deactivationType,
//       deactivationReason,
//       notes
//     });

//     // Validate account number
//     if (!/^\d{10}$/.test(accountNumber)) {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Account number must be a 10-digit number.',
//       });
//     }

//     // Validate deactivation reason
//     if (!deactivationReason || deactivationReason.trim() === '') {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Deactivation reason is required.',
//       });
//     }

//     // Validate deactivation type
//     const VALID_DEACTIVATION_TYPES = ['DORMANT', 'SUSPENDED', 'CLOSED', 'INACTIVE'];
//     const normalizedDeactivationType = deactivationType.toUpperCase();
    
//     if (!VALID_DEACTIVATION_TYPES.includes(normalizedDeactivationType)) {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Invalid deactivation type. Must be one of: ${VALID_DEACTIVATION_TYPES.join(', ')}`,
//         valid_types: VALID_DEACTIVATION_TYPES
//       });
//     }

//     // Find the account
//     const account = await CustomerAccount.findOne({
//       where: { account_number: accountNumber },
//       transaction
//     });

//     if (!account) {
//       await transaction.rollback();
//       return res.status(404).json({
//         success: false,
//         message: 'Customer account not found.',
//         account_number: accountNumber
//       });
//     }

//     // Check current status
//     const currentStatus = account.REC_ST;
//     console.log('📊 Current account status:', currentStatus);

//     // Check if account is already in the target deactivation state
//     if (currentStatus === normalizedDeactivationType) {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Account is already ${normalizedDeactivationType}`,
//         account: {
//           account_number: account.account_number,
//           account_name: account.account_name || account.PRODUCT_DESC,
//           current_status: currentStatus,
//           account_type: account.account_type || account.ACCOUNT_TYPE
//         }
//       });
//     }

//     // Special validations based on deactivation type
//     if (normalizedDeactivationType === 'CLOSED') {
//       // Check if account has zero balance before closing
//       if (account.ledger_balance !== 0 || account.available_balance !== 0) {
//         await transaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Account cannot be closed with non-zero balance',
//           balances: {
//             ledger_balance: account.ledger_balance,
//             available_balance: account.available_balance,
//             cleared_balance: account.cleared_balance
//           }
//         });
//       }

//       // Check if account has any pending transactions
//       const pendingTransactions = await AuditTrail.count({
//         where: {
//           account_no: accountNumber,
//           status: 'PENDING',
//           timestamp: {
//             [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
//           }
//         },
//         transaction
//       });

//       if (pendingTransactions > 0) {
//         await transaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: `Account has ${pendingTransactions} pending transaction(s) and cannot be closed`,
//           pending_transactions: pendingTransactions
//         });
//       }
//     }

//     // Store old values for audit trail
//     const oldValue = account.toJSON();

//     // Determine substatus based on deactivation type
//     let substatus = 'Active';
//     switch (normalizedDeactivationType) {
//       case 'DORMANT':
//         substatus = 'Dormant';
//         break;
//       case 'SUSPENDED':
//         substatus = 'Suspended';
//         break;
//       case 'CLOSED':
//         substatus = 'Closed';
//         break;
//       case 'INACTIVE':
//         substatus = 'Inactive';
//         break;
//     }

//     // Deactivate the account
//     const updateData = {
//       REC_ST: normalizedDeactivationType,
//       substatus: substatus,
//       updatedAt: new Date()
//     };

//     // For dormant accounts, record the dormancy date
//     if (normalizedDeactivationType === 'DORMANT') {
//       updateData.dormancy_date = new Date();
//     }

//     // For closed accounts, record closure details
//     if (normalizedDeactivationType === 'CLOSED') {
//       updateData.closed_date = new Date();
//       updateData.closed_by = req.user?.id || req.headers['x-user-id'] || 'system';
//       // Disable transactions for closed accounts
//       updateData.DR_ALLOWED = false;
//       updateData.CR_ALLOWED = false;
//       updateData.is_online_enabled = false;
//     }

//     console.log('🔄 Updating account with:', updateData);

//     await CustomerAccount.update(updateData, {
//       where: { account_number: accountNumber },
//       transaction
//     });

//     // Get updated account
//     const updatedAccount = await CustomerAccount.findOne({
//       where: { account_number: accountNumber },
//       transaction
//     });

//     // Record audit trail
//     const userId = req.user?.id || req.headers['x-user-id'] || 'system';
//     const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
//     const now = new Date();

//     if (AuditTrail && typeof AuditTrail.create === 'function') {
//       await AuditTrail.create({
//         event_id: Date.now(),
//         user_id: userId,
//         event_type: 'ACCOUNT_DEACTIVATION',
//         action: `Deactivate Account (${normalizedDeactivationType})`,
//         old_value: oldValue,
//         new_value: updatedAccount.toJSON(),
//         ip_address: ipAddress,
//         timestamp: now,
//         entity_type: 'CustomerAccount',
//         entity_id: updatedAccount.id,
//         status: 'SUCCESS',
//         account_no: accountNumber,
//         description: `Account deactivated from ${currentStatus} to ${normalizedDeactivationType}`,
//         additional_info: {
//           previous_status: currentStatus,
//           new_status: normalizedDeactivationType,
//           deactivation_reason: deactivationReason,
//           deactivation_type: normalizedDeactivationType,
//           notes: notes || '',
//           deactivated_by: userId,
//           deactivation_date: now,
//           balances_at_deactivation: {
//             ledger_balance: account.ledger_balance,
//             available_balance: account.available_balance,
//             cleared_balance: account.cleared_balance
//           }
//         }
//       }, { transaction });
//     }

//     await transaction.commit();

//     // Log the deactivation
//     logger.info('Account deactivated successfully', {
//       account_number: accountNumber,
//       previousStatus: currentStatus,
//       newStatus: normalizedDeactivationType,
//       deactivatedBy: userId,
//       deactivationReason,
//       deactivationType: normalizedDeactivationType,
//       timestamp: now
//     });

//     return res.status(200).json({
//       success: true,
//       message: `Account ${normalizedDeactivationType.toLowerCase()} successfully`,
//       account: {
//         account_number: account.account_number,
//         account_name: account.account_name || account.PRODUCT_DESC,
//         account_type: account.account_type || account.ACCOUNT_TYPE,
//         previous_status: currentStatus,
//         new_status: normalizedDeactivationType,
//         deactivation_date: now,
//         deactivated_by: userId,
//         balances: {
//           ledger_balance: account.ledger_balance,
//           available_balance: account.available_balance,
//           cleared_balance: account.cleared_balance
//         }
//       },
//       deactivation_details: {
//         type: normalizedDeactivationType,
//         reason: deactivationReason,
//         notes: notes || '',
//         timestamp: now,
//         restrictions: normalizedDeactivationType === 'CLOSED' ? {
//           debit_transactions_allowed: false,
//           credit_transactions_allowed: false,
//           online_access_allowed: false
//         } : normalizedDeactivationType === 'SUSPENDED' ? {
//           debit_transactions_allowed: false,
//           credit_transactions_allowed: false
//         } : {
//           debit_transactions_allowed: account.DR_ALLOWED,
//           credit_transactions_allowed: account.CR_ALLOWED
//         }
//       }
//     });

//   } catch (error) {
//     await transaction.rollback();

//     console.error('❌ Error deactivating account:', error);
//     logger.error('Error deactivating customer account:', {
//       error: error.message,
//       stack: error.stack,
//       params: req.params,
//       body: req.body,
//       timestamp: new Date(),
//     });

//     return res.status(500).json({
//       success: false,
//       message: 'An error occurred while deactivating the customer account',
//       error: error.message,
//     });
//   }
// };





// Bulk Account Activation

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



// // Reject deactivation request
// // Enhanced deactivation request controller with better error handling and logging
// export const requestAccountDeactivation = async (req, res) => {
//   const { accountNumber } = req.params;
//   const { deactivationReason, notes, deactivationType = 'DORMANT' } = req.body;
//   const userId = req.user?.id;
//   const userRole = req.user?.role;

//   // Validate user authentication
//   if (!userId || !userRole) {
//     return res.status(401).json({
//       success: false,
//       message: 'Authentication required',
//       code: 'AUTH_REQUIRED'
//     });
//   }

//   try {
//     logger.info('Deactivation request initiated', {
//       accountNumber,
//       deactivationType,
//       userId,
//       userRole,
//       timestamp: new Date()
//     });

//     // Validate account number with better error messages
//     if (!/^\d{10}$/.test(accountNumber)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Account number must be exactly 10 digits',
//         code: 'INVALID_ACCOUNT_FORMAT',
//         expected: '10 digits',
//         received: accountNumber
//       });
//     }

//     // Enhanced validation for deactivation reason
//     if (!deactivationReason || deactivationReason.trim() === '') {
//       return res.status(400).json({
//         success: false,
//         message: 'Deactivation reason is required',
//         code: 'REASON_REQUIRED',
//         field: 'deactivationReason'
//       });
//     }

//     if (deactivationReason.length < 10) {
//       return res.status(400).json({
//         success: false,
//         message: 'Deactivation reason must be at least 10 characters',
//         code: 'REASON_TOO_SHORT',
//         minLength: 10,
//         currentLength: deactivationReason.length
//       });
//     }

//     // Validate deactivation type with descriptions
//     const VALID_DEACTIVATION_TYPES = [
//       { value: 'DORMANT', description: 'Account with no activity for extended period' },
//       { value: 'SUSPENDED', description: 'Temporary suspension due to suspicious activity' },
//       { value: 'CLOSED', description: 'Permanent closure of account' },
//       { value: 'INACTIVE', description: 'Account with minimal or no activity' }
//     ];
    
//     const normalizedDeactivationType = deactivationType.toUpperCase();
//     const validType = VALID_DEACTIVATION_TYPES.find(t => t.value === normalizedDeactivationType);
    
//     if (!validType) {
//       return res.status(400).json({
//         success: false,
//         message: `Invalid deactivation type. Valid types are: ${VALID_DEACTIVATION_TYPES.map(t => t.value).join(', ')}`,
//         code: 'INVALID_DEACTIVATION_TYPE',
//         validTypes: VALID_DEACTIVATION_TYPES,
//         received: deactivationType
//       });
//     }

//     // Find the account with transaction for consistency
//     const account = await CustomerAccount.findOne({
//       where: { account_number: accountNumber }
//     });

//     if (!account) {
//       logger.warn('Account not found for deactivation', { accountNumber });
//       return res.status(404).json({
//         success: false,
//         message: 'Customer account not found',
//         code: 'ACCOUNT_NOT_FOUND',
//         account_number: accountNumber,
//         suggestions: [
//           'Verify the account number',
//           'Check if account has been migrated',
//           'Contact system administrator'
//         ]
//       });
//     }

//     // Check current status
//     const currentStatus = account.REC_ST;
//     logger.debug('Account status check', {
//       accountNumber,
//       currentStatus,
//       requestedStatus: normalizedDeactivationType
//     });

//     // Enhanced check for already in target state
//     if (currentStatus === normalizedDeactivationType) {
//       return res.status(409).json({
//         success: false,
//         message: `Account is already in ${normalizedDeactivationType} state`,
//         code: 'ALREADY_IN_STATE',
//         account: {
//           account_number: account.account_number,
//           account_name: account.account_name || account.PRODUCT_DESC,
//           current_status: currentStatus,
//           status_since: account.updatedAt || account.createdAt
//         },
//         action: 'No action required'
//       });
//     }

//     // Special validations for CLOSED with detailed checks
//     if (normalizedDeactivationType === 'CLOSED') {
//       const validationResults = await validateAccountForClosure(account, accountNumber);
      
//       if (!validationResults.valid) {
//         return res.status(400).json({
//           success: false,
//           message: 'Account cannot be closed',
//           code: 'CLOSURE_VALIDATION_FAILED',
//           details: validationResults
//         });
//       }
//     }

//     // Generate unique request ID with better format
//     const requestId = generateRequestId('DEACT', accountNumber);
//     const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

//     // Enhanced request data with more details
//     const requestData = {
//       account_number: accountNumber,
//       account_name: account.account_name || account.PRODUCT_DESC,
//       account_type: account.account_type || account.ACCOUNT_TYPE,
//       deactivation_type: normalizedDeactivationType,
//       deactivation_reason: deactivationReason,
//       notes: notes || '',
//       current_status: currentStatus,
//       requested_status: normalizedDeactivationType,
//       balances: {
//         ledger_balance: account.ledger_balance || 0,
//         available_balance: account.available_balance || 0,
//         cleared_balance: account.cleared_balance || 0,
//         currency: account.currency || 'NGN'
//       },
//       customer_info: {
//         customer_id: account.customer_id,
//         customer_name: account.customer_name,
//         customer_type: account.customer_type,
//         email: account.email,
//         phone: account.phone_number
//       },
//       account_details: {
//         product_code: account.product_code,
//         branch_code: account.branch_code,
//         opening_date: account.opening_date,
//         last_activity_date: account.lastActivityDate
//       },
//       initiator: {
//         id: userId,
//         role: userRole,
//         timestamp: new Date()
//       }
//     };

//     // Create approval request within transaction
//     const transaction = await sequelize.transaction();
    
//     try {
//       const approvalRequest = await Approval.create({
//         request_id: requestId,
//         entity_type: 'CustomerAccount',
//         entity_id: accountNumber,
//         action_type: 'DEACTIVATE_ACCOUNT',
//         current_status: currentStatus,
//         requested_status: normalizedDeactivationType,
//         request_data: requestData,
//         request_notes: notes,
//         initiator_id: userId,
//         initiator_role: userRole,
//         initiator_details: {
//           name: req.user?.name || 'Unknown',
//           department: req.user?.department || 'Unknown'
//         },
//         first_approver_id: null,
//         first_approver_role: 'MANAGER',
//         first_approval_status: 'PENDING',
//         second_approver_id: null,
//         second_approver_role: 'HEAD_OF_DEPARTMENT',
//         second_approval_status: 'PENDING',
//         overall_status: 'PENDING_FIRST',
//         expiry_date: expiryDate,
//         executed: false,
//         metadata: {
//           ip_address: req.ip,
//           user_agent: req.headers['user-agent'],
//           validation_checks: normalizedDeactivationType === 'CLOSED' ? 'PASSED' : 'NOT_REQUIRED'
//         }
//       }, { transaction });

//       // Send enhanced notification
//       await sendNotification({
//         type: 'APPROVAL_REQUEST',
//         userId: userId,
//         approverRole: 'MANAGER',
//         requestId: requestId,
//         action: `Account Deactivation (${normalizedDeactivationType})`,
//         accountNumber: accountNumber,
//         accountName: account.account_name || account.PRODUCT_DESC,
//         currentStatus: currentStatus,
//         requestedStatus: normalizedDeactivationType,
//         reason: deactivationReason,
//         urgency: getUrgencyLevel(normalizedDeactivationType),
//         expiryDate: expiryDate,
//         initiator: {
//           id: userId,
//           name: req.user?.name || 'Unknown'
//         },
//         accountDetails: {
//           type: account.account_type,
//           customer: account.customer_name,
//           balance: account.ledger_balance || 0
//         }
//       });

//       // Enhanced audit trail
//       await AuditTrail.create({
//         event_id: generateEventId(),
//         user_id: userId,
//         event_type: 'DEACTIVATION_REQUEST_CREATED',
//         action: `Request Account Deactivation (${normalizedDeactivationType})`,
//         old_value: JSON.stringify({
//           account_number: accountNumber,
//           status: currentStatus,
//           status_field: 'REC_ST'
//         }),
//         new_value: JSON.stringify(approvalRequest.toJSON()),
//         ip_address: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
//         user_agent: req.headers['user-agent'],
//         timestamp: new Date(),
//         entity_type: 'Approval',
//         entity_id: approvalRequest.id,
//         status: 'PENDING',
//         account_no: accountNumber,
//         description: `Deactivation request created for account ${accountNumber} from ${currentStatus} to ${normalizedDeactivationType}`,
//         additional_info: {
//           request_id: requestId,
//           deactivation_type: normalizedDeactivationType,
//           deactivation_reason: deactivationReason,
//           notes: notes || '',
//           expiry_date: expiryDate,
//           approvers_required: 2,
//           current_approval_level: 1,
//           estimated_completion: 'Within 24 hours',
//           validation: {
//             balance_check: normalizedDeactivationType === 'CLOSED' ? 
//               (parseFloat(account.ledger_balance) === 0 && parseFloat(account.available_balance) === 0 ? 'PASSED' : 'FAILED') : 
//               'NOT_REQUIRED',
//             pending_transactions: normalizedDeactivationType === 'CLOSED' ? 'CHECKED' : 'NOT_REQUIRED'
//           }
//         }
//       }, { transaction });

//       await transaction.commit();

//       logger.info('Deactivation request created successfully', {
//         requestId,
//         accountNumber,
//         currentStatus,
//         requestedStatus: normalizedDeactivationType,
//         userId,
//         expiryDate
//       });

//       return res.status(200).json({
//         success: true,
//         message: 'Deactivation request submitted for approval',
//         code: 'REQUEST_CREATED',
//         timestamp: new Date().toISOString(),
//         approval_request: {
//           request_id: requestId,
//           status: 'PENDING_FIRST',
//           current_status: currentStatus,
//           requested_status: normalizedDeactivationType,
//           approvers_required: 2,
//           approvals_received: 0,
//           expiry_date: expiryDate,
//           estimated_completion_time: 'Within 24 hours',
//           approval_workflow: [
//             { level: 1, role: 'MANAGER', status: 'PENDING', action: 'Review request' },
//             { level: 2, role: 'HEAD_OF_DEPARTMENT', status: 'PENDING', action: 'Final approval' }
//           ],
//           links: {
//             status: `/api/approvals/${requestId}/status`,
//             details: `/api/approvals/deactivation/${requestId}/details`,
//             cancel: `/api/approvals/deactivation/${requestId}/cancel`
//           }
//         },
//         details: {
//           account_number: accountNumber,
//           account_name: account.account_name || account.PRODUCT_DESC,
//           deactivation_type: normalizedDeactivationType,
//           deactivation_reason: deactivationReason,
//           notes: notes || '',
//           submitted_by: {
//             id: userId,
//             role: userRole,
//             name: req.user?.name || 'Unknown'
//           },
//           submitted_at: new Date(),
//           next_approver_role: 'MANAGER',
//           validation_summary: {
//             balance_check: normalizedDeactivationType === 'CLOSED' ? 
//               (parseFloat(account.ledger_balance) === 0 && parseFloat(account.available_balance) === 0 ? 'PASSED' : 'FAILED') : 
//               'NOT_REQUIRED',
//             pending_transactions: normalizedDeactivationType === 'CLOSED' ? 'CHECKED' : 'NOT_REQUIRED',
//             account_exists: 'VERIFIED',
//             status_transition: `${currentStatus} → ${normalizedDeactivationType}`
//           }
//         }
//       });

//     } catch (error) {
//       await transaction.rollback();
//       throw error;
//     }

//   } catch (error) {
//     logger.error('Error creating deactivation request:', {
//       error: error.message,
//       stack: error.stack,
//       accountNumber,
//       userId,
//       timestamp: new Date()
//     });
    
//     return res.status(500).json({
//       success: false,
//       message: 'An error occurred while creating deactivation request',
//       code: 'INTERNAL_SERVER_ERROR',
//       error: process.env.NODE_ENV === 'development' ? error.message : 'Please contact support',
//       reference_id: generateErrorReference(),
//       timestamp: new Date().toISOString()
//     });
//   }
// };

// Helper functions for the enhanced controller

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
// Supports multiple search formats like getCustomerAccountByCUST_ID
export const searchCustomersByName = async (req, res) => {
  const { name } = req.params || req.query;

  try {
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Name parameter is required',
        usage: 'GET /api/customers-account/search/:name or GET /api/customers-account?name=:name'
      });
    }

    const originalSearchTerm = name.toString().trim();
    console.log(`🔍 Searching customers by name: "${originalSearchTerm}"`);

    // Prepare multiple search patterns for flexible matching
    const searchVariants = [
      originalSearchTerm,                          // Original search
      originalSearchTerm.toLowerCase(),            // Lowercase
      originalSearchTerm.toUpperCase(),            // Uppercase
      `%${originalSearchTerm}%`,                   // Partial match (anywhere)
      `${originalSearchTerm}%`,                    // Starts with
      `%${originalSearchTerm}`,                    // Ends with
      `%${originalSearchTerm.replace(/\s+/g, '%')}%` // Handle spaces
    ];

    // Split search term into words for better matching
    const words = originalSearchTerm.split(/\s+/).filter(word => word.length > 0);
    
    console.log(`📋 Search variants: ${searchVariants.length}, Words: ${words.length}`);

    // Build WHERE conditions dynamically
    const whereConditions = [];
    const replacements = {};
    
    // Add all search variants for account_name
    searchVariants.forEach((variant, index) => {
      const key = `variant${index}`;
      replacements[key] = variant;
      whereConditions.push(`ca.account_name LIKE :${key}`);
    });

    // Add search variants for customer names (only if columns exist)
    searchVariants.forEach((variant, index) => {
      const key = `custVariant${index}`;
      replacements[key] = variant;
      whereConditions.push(`c.FIRST_NAME LIKE :${key}`);
      whereConditions.push(`c.LAST_NAME LIKE :${key}`);
      // CUST_NM might exist based on your previous queries
      whereConditions.push(`c.CUST_NM LIKE :${key}`);
    });

    // For multi-word searches, also search each word individually
    if (words.length > 1) {
      words.forEach((word, index) => {
        const wordKey = `word${index}`;
        replacements[wordKey] = `%${word}%`;
        whereConditions.push(`ca.account_name LIKE :${wordKey}`);
        whereConditions.push(`c.FIRST_NAME LIKE :${wordKey}`);
        whereConditions.push(`c.LAST_NAME LIKE :${wordKey}`);
      });
    }

    // Construct final WHERE clause
    const whereClause = whereConditions.join(' OR ');
    
    console.log(`📝 WHERE clause has ${whereConditions.length} conditions`);

    // First, check if any customers exist with this name pattern
    const [customerCheck] = await sequelize.query(
      `SELECT COUNT(DISTINCT ca.customer_id) as customer_count 
       FROM customer_accounts ca
       LEFT JOIN customers c ON c.CUST_ID = LPAD(ca.customer_id, 10, '0')
       WHERE ${whereClause}
         AND ca.status = 'ACTIVE'`,
      {
        replacements: replacements,
        type: sequelize.QueryTypes.SELECT
      }
    );

    const customerCount = parseInt(customerCheck?.customer_count || 0);
    
    if (customerCount === 0) {
      return res.status(404).json({
        success: false,
        message: `No customers found matching "${originalSearchTerm}"`,
        searched_name: originalSearchTerm,
        suggestions: [
          'Try a different name or partial name',
          'Remove any extra spaces',
          'Search with just first or last name'
        ]
      });
    }

    console.log(`📊 Found ${customerCount} potential customers matching "${originalSearchTerm}"`);

    // Main query - get detailed customer information
    // Using only columns that definitely exist based on your previous successful queries
    const accounts = await sequelize.query(
      `SELECT DISTINCT
        -- Customer information from accounts table
        ca.customer_id,
        ca.account_name,
        
        -- Get matching customer details (only columns that exist)
        c.CUST_ID,
        c.FIRST_NAME,
        c.LAST_NAME,
        c.CUST_NM,
        c.EMAIL_ADDRESS,
        c.PHONE_NO,
        
        -- Account summary for this customer
        (
          SELECT COUNT(*) 
          FROM customer_accounts ca2 
          WHERE ca2.customer_id = ca.customer_id
            AND ca2.status = 'ACTIVE'
        ) as total_accounts,
        
        (
          SELECT SUM(ca2.ledger_balance)
          FROM customer_accounts ca2 
          WHERE ca2.customer_id = ca.customer_id
            AND ca2.status = 'ACTIVE'
        ) as total_balance,
        
        -- Get one sample account number
        (
          SELECT ca3.account_number
          FROM customer_accounts ca3
          WHERE ca3.customer_id = ca.customer_id
            AND ca3.status = 'ACTIVE'
          ORDER BY ca3.created_at DESC
          LIMIT 1
        ) as sample_account_number,
        
        -- Get recent account for additional info
        (
          SELECT ca4.account_type
          FROM customer_accounts ca4
          WHERE ca4.customer_id = ca.customer_id
            AND ca4.status = 'ACTIVE'
          ORDER BY ca4.created_at DESC
          LIMIT 1
        ) as recent_account_type
        
      FROM customer_accounts ca
      LEFT JOIN customers c ON c.CUST_ID = LPAD(ca.customer_id, 10, '0')
      WHERE ${whereClause}
        AND ca.status = 'ACTIVE'
      GROUP BY ca.customer_id, ca.account_name, c.CUST_ID,
               c.FIRST_NAME, c.LAST_NAME, c.CUST_NM,
               c.EMAIL_ADDRESS, c.PHONE_NO
      ORDER BY 
        -- Priority 1: Exact match on account_name
        CASE 
          WHEN ca.account_name = :exactTerm THEN 1
          WHEN ca.account_name LIKE CONCAT(:exactTerm, '%') THEN 2
          WHEN ca.account_name LIKE CONCAT('%', :exactTerm, '%') THEN 3
          ELSE 4
        END,
        -- Priority 2: Exact match on customer name
        CASE 
          WHEN c.CUST_NM = :exactTerm THEN 1
          WHEN CONCAT(c.FIRST_NAME, ' ', c.LAST_NAME) = :exactTerm THEN 2
          ELSE 3
        END,
        -- Sort by total balance (highest first)
        total_balance DESC
      LIMIT 50`,
      {
        replacements: {
          ...replacements,
          exactTerm: originalSearchTerm
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    console.log(`✅ Retrieved ${accounts.length} customer records`);

    // Process and format the response
    const processedCustomers = accounts.map(account => {
      // Determine best display name
      let displayName = account.account_name || '';
      let displaySource = 'account_name';
      
      if (!displayName && (account.FIRST_NAME || account.LAST_NAME)) {
        displayName = `${account.FIRST_NAME || ''} ${account.LAST_NAME || ''}`.trim();
        displaySource = 'customer_names';
      }
      
      if (!displayName && account.CUST_NM) {
        displayName = account.CUST_NM;
        displaySource = 'CUST_NM';
      }
      
      if (!displayName) {
        displayName = `Customer ${account.customer_id}`;
        displaySource = 'customer_id';
      }

      // Format phone number
      let formattedPhone = account.PHONE_NO;
      let phoneFormatted = false;
      if (formattedPhone && formattedPhone.length >= 10) {
        formattedPhone = formattedPhone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
        phoneFormatted = true;
      }

      // Calculate match score
      const matchInfo = calculateMatchScore(displayName, originalSearchTerm);

      return {
        // Search metadata
        searched_name: originalSearchTerm,
        match_score: matchInfo.score,
        match_type: matchInfo.type,
        display_source: displaySource,

        // Customer identifiers
        customer_id: account.customer_id,
        CUST_ID: account.CUST_ID,
        
        // Name information
        FIRST_NAME: account.FIRST_NAME,
        LAST_NAME: account.LAST_NAME,
        FULL_NAME: displayName,
        ACCOUNT_NAME: account.account_name,
        CUST_NM: account.CUST_NM,
        
        // Contact information
        EMAIL: account.EMAIL_ADDRESS || null,
        PHONE: account.PHONE_NO || null,
        FORMATTED_PHONE: formattedPhone || null,
        PHONE_FORMATTED: phoneFormatted,
        
        // Account summary
        TOTAL_ACCOUNTS: parseInt(account.total_accounts || 0),
        TOTAL_BALANCE: parseFloat(account.total_balance || 0),
        SAMPLE_ACCOUNT_NUMBER: account.sample_account_number,
        RECENT_ACCOUNT_TYPE: account.recent_account_type,
        
        // Timestamps
        retrieved_at: new Date().toISOString()
      };
    });

    // Helper function to calculate match score
    function calculateMatchScore(displayName, searchTerm) {
      const nameLower = displayName.toLowerCase();
      const searchLower = searchTerm.toLowerCase();
      
      if (nameLower === searchLower) return { score: 100, type: 'exact' };
      if (nameLower.startsWith(searchLower)) return { score: 90, type: 'starts_with' };
      if (nameLower.includes(searchLower)) return { score: 80, type: 'contains' };
      
      // Check for word-by-word matching
      const searchWords = searchLower.split(/\s+/);
      const nameWords = nameLower.split(/\s+/);
      let wordMatches = 0;
      
      searchWords.forEach(searchWord => {
        if (nameWords.some(nameWord => nameWord.includes(searchWord))) {
          wordMatches++;
        }
      });
      
      const score = Math.min(70, (wordMatches / searchWords.length) * 100);
      return { score: score, type: 'partial_words' };
    }

    // Sort by match score (highest first)
    processedCustomers.sort((a, b) => b.match_score - a.match_score);

    // Calculate summary statistics
    const totalBalance = processedCustomers.reduce((sum, cust) => sum + cust.TOTAL_BALANCE, 0);
    const totalAccounts = processedCustomers.reduce((sum, cust) => sum + cust.TOTAL_ACCOUNTS, 0);
    const avgMatchScore = processedCustomers.length > 0 
      ? Math.round(processedCustomers.reduce((sum, cust) => sum + cust.match_score, 0) / processedCustomers.length)
      : 0;
    
    const matchTypes = processedCustomers.reduce((acc, cust) => {
      acc[cust.match_type] = (acc[cust.match_type] || 0) + 1;
      return acc;
    }, {});

    const summary = {
      search_performed: originalSearchTerm,
      total_customers: processedCustomers.length,
      total_accounts: totalAccounts,
      total_balance: totalBalance,
      average_match_score: avgMatchScore,
      match_type_distribution: matchTypes,
      highest_match_score: processedCustomers[0]?.match_score || 0,
      lowest_match_score: processedCustomers[processedCustomers.length - 1]?.match_score || 0
    };

    return res.status(200).json({
      success: true,
      message: `Found ${processedCustomers.length} customer(s) matching "${originalSearchTerm}"`,
      search_term: originalSearchTerm,
      count: processedCustomers.length,
      summary: summary,
      customers: processedCustomers,
      search_info: {
        method: req.method,
        endpoint: req.originalUrl,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error searching customers by name:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while searching customers',
      error: error.message,
      searched_name: name || 'unknown',
      request_info: {
        params: req.params,
        query: req.query,
        method: req.method,
        url: req.originalUrl,
        timestamp: new Date().toISOString()
      }
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

  bulkActivateAccounts,
  getAccountActivationHistory,
  updateDormantAccounts,
  searchCustomersByName,
  resetAccountCounters,
  findDuplicateAccounts
};