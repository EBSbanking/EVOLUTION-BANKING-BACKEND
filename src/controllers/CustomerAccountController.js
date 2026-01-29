// controllers/CustomerAccountController.js - UPDATED FOR SIMPLIFIED SCHEMA
import sequelize from '../../config/db.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Customer from '../models/Customer.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';
import SavingsProduct from '../models/SavingsProduct.js';
import GLAccount from '../models/GLAccount.js';
import Counter from '../models/Counter.js';



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
  console.log('🚀 Starting createCustomerAccount...');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));

  await checkModels();

  // ==================== FIRST: ENSURE DATABASE COLUMNS EXIST ====================
  try {
    console.log('🔧 Checking/creating required database columns...');
    
    // Check current table structure
    const [currentColumns] = await sequelize.query(
      "DESCRIBE customer_accounts"
    );
    
    console.log('📊 Current columns in customer_accounts:', currentColumns.map(col => col.Field));
    
    // Check if ledger_balance exists
    const hasLedgerBalance = currentColumns.some(col => col.Field === 'ledger_balance');
    const hasClearedBalance = currentColumns.some(col => col.Field === 'cleared_balance');
    
    // Add missing columns
    if (!hasLedgerBalance) {
      console.log('➕ Adding ledger_balance column...');
      await sequelize.query(`
        ALTER TABLE customer_accounts 
        ADD COLUMN ledger_balance DECIMAL(20,2) DEFAULT 0.00 AFTER available_balance
      `);
      console.log('✅ Added ledger_balance column');
    }
    
    if (!hasClearedBalance) {
      console.log('➕ Adding cleared_balance column...');
      await sequelize.query(`
        ALTER TABLE customer_accounts 
        ADD COLUMN cleared_balance DECIMAL(20,2) DEFAULT 0.00 AFTER ledger_balance
      `);
      console.log('✅ Added cleared_balance column');
    }
    
    // Verify the new structure
    const [updatedColumns] = await sequelize.query(
      "DESCRIBE customer_accounts"
    );
    console.log('✅ Final table structure verified');
    
  } catch (columnError) {
    console.error('❌ Error checking/creating database columns:', columnError.message);
    // Continue anyway - the account creation might still work
  }

  const transaction = await sequelize.transaction();

  try {
    const customerAccounts = Array.isArray(req.body) ? req.body : [req.body];
    const createdAccounts = [];
    const now = new Date();
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

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

      // ✅ Validate REC_ST
      const VALID_REC_ST = ['ACTIVE', 'DORMANT', 'SUSPENDED', 'CLOSED', 'INACTIVE', 'PENDING'];
      const normalizedRecSt = REC_ST.toUpperCase();
      if (!VALID_REC_ST.includes(normalizedRecSt)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Invalid REC_ST. Must be one of ${VALID_REC_ST.join(', ')}`,
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

      // ✅ Check for duplicate account number
      const existingAccount = await CustomerAccount.findOne({
        where: { account_number: finalAccountNumber },
        transaction
      });

      if (existingAccount) {
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: 'Account already exists',
          reason: `The account number ${finalAccountNumber} already exists.`,
          account: finalAccountNumber,
        });
      }

      // ✅ Prepare data for new account (SIMPLIFIED VERSION)
      const newAccountData = {
        // Core fields
        customer_id: parseInt(CUST_ID) || 0,
        customer_code: customerDetails?.CUST_NO || customerDetails?.cust_no || '',
        account_number: finalAccountNumber,
        
        // Product information
        product_type: normalizedAccountType,
        product: PROD_ID || product || '',
        PRODUCT_DESC: PRODUCT_DESC || `${normalizedAccountType} Account: ${ACCT_NM}`,
        
        // Status
        REC_ST: normalizedRecSt,
        ACCOUNT_TYPE: normalizedAccountType,
        substatus: normalizedRecSt === 'PENDING' ? 'Pending' : 'Active',
        
        // Branch and currency
        branch: parseInt(BU_ID) || 1,
        currency: currency,
        
        // Financial information - ALL THREE BALANCES INCLUDED
        opening_amount: parseFloat(opening_amount) || 0.0,
        cleared_balance: parseFloat(opening_amount) || 0.0,
        ledger_balance: parseFloat(opening_amount) || 0.0,
        available_balance: parseFloat(opening_amount) || 0.0,  // Note: using available_balance, not AVAILABLE_BALANCE
        
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
        
        // Dates (will be auto-set by model defaults)
        lastActivityDate: now,
        created_at: now,
        updated_at: now,
        
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

      console.log('📝 Creating account with data:', {
        account_number: newAccountData.account_number,
        customer_id: newAccountData.customer_id,
        balances: {
          opening_amount: newAccountData.opening_amount,
          ledger_balance: newAccountData.ledger_balance,
          available_balance: newAccountData.available_balance,
          cleared_balance: newAccountData.cleared_balance
        }
      });

      // ✅ Create new account
      const newCustomerAccount = await CustomerAccount.create(newAccountData, { transaction });

      createdAccounts.push(newCustomerAccount);

      // ✅ Update existing records with matching balances
      try {
        // Ensure all balances are consistent for the new account
        await CustomerAccount.update(
          {
            ledger_balance: newAccountData.ledger_balance,
            available_balance: newAccountData.available_balance,
            cleared_balance: newAccountData.cleared_balance
          },
          {
            where: { id: newCustomerAccount.id },
            transaction
          }
        );
      } catch (updateError) {
        console.warn('⚠️ Could not update balances after creation:', updateError.message);
        // Continue anyway - the account was created
      }

      // ✅ Audit trail
      try {
        if (AuditTrail && typeof AuditTrail.create === 'function') {
          await AuditTrail.create({
            event_id: Date.now(),
            user_id: userId,
            event_type: 'CUSTOMER_ACCOUNT_CREATE',
            action: 'Create Account',
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
            ip_address: ipAddress,
            timestamp: now,
            entity_type: 'CustomerAccount',
            entity_id: newCustomerAccount.id,
            status: 'SUCCESS',
            account_no: newCustomerAccount.account_number,
            description: `Created ${normalizedAccountType} account for customer ${CUST_ID}`,
          }, { transaction });
        } else {
          console.warn('⚠️ AuditTrail model not available, skipping audit trail');
        }
      } catch (auditError) {
        logger.error('Failed to create audit trail for account creation', {
          error: auditError.message,
          account: newCustomerAccount.account_number,
          timestamp: now,
        });
      }
    }

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Customer accounts created successfully',
      count: createdAccounts.length,
      accounts: createdAccounts.map(acc => ({
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
          cleared_balance: acc.cleared_balance || acc.opening_amount
        },
        created_at: acc.created_at
      })),
      note: 'All account numbers were auto-generated. Database columns verified/created.'
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error creating customer accounts:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date(),
    });

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error',
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

    // Check if error is about missing columns
    if (error.message.includes('Unknown column') || error.message.includes('column') || error.message.includes('field')) {
      console.error('❌ Database column error detected:', error.message);
      
      // Try to run column creation directly
      try {
        console.log('🔄 Attempting to create missing columns...');
        await sequelize.query(`
          ALTER TABLE customer_accounts 
          ADD COLUMN IF NOT EXISTS ledger_balance DECIMAL(20,2) DEFAULT 0.00
        `);
        
        await sequelize.query(`
          ALTER TABLE customer_accounts 
          ADD COLUMN IF NOT EXISTS cleared_balance DECIMAL(20,2) DEFAULT 0.00
        `);
        
        console.log('✅ Missing columns created. Please retry the request.');
        
        return res.status(500).json({
          success: false,
          message: 'Database structure was updated. Please retry the account creation.',
          error: 'Missing columns were created. Retry required.',
          note: 'The ledger_balance and cleared_balance columns have been added to the database.'
        });
      } catch (columnCreationError) {
        return res.status(500).json({
          success: false,
          message: 'Database column error. Please run these SQL commands manually:',
          sql_commands: [
            "ALTER TABLE customer_accounts ADD COLUMN ledger_balance DECIMAL(20,2) DEFAULT 0.00 AFTER available_balance;",
            "ALTER TABLE customer_accounts ADD COLUMN cleared_balance DECIMAL(20,2) DEFAULT 0.00 AFTER ledger_balance;"
          ],
          error: error.message
        });
      }
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating the customer accounts',
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
  const { accountNumber } = req.params;
  const updateData = req.body;
  const transaction = await sequelize.transaction();

  try {
    // Validate account number
    if (!/^\d{10}$/.test(accountNumber)) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Account number must be a 10-digit number.' 
      });
    }

    // Find existing account
    const existingAccount = await CustomerAccount.findOne({
      where: { account_number: accountNumber },
      transaction
    });
    
    if (!existingAccount) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Customer account not found' 
      });
    }

    // Prepare update data (only allow certain fields)
    const allowedUpdates = [
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
    updatePayload.lastActivityDate = new Date();
    updatePayload.updatedAt = new Date();

    // Update account
    await CustomerAccount.update(updatePayload, {
      where: { account_number: accountNumber },
      transaction
    });

    // Get updated account
    const updatedAccount = await CustomerAccount.findOne({
      where: { account_number: accountNumber },
      transaction
    });

    // Audit trail
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();
    
    if (AuditTrail && typeof AuditTrail.create === 'function') {
      await AuditTrail.create({
        event_id: Date.now(),
        user_id: userId,
        event_type: 'CUSTOMER_ACCOUNT_UPDATE',
        action: 'Update Account',
        old_value: existingAccount.toJSON(),
        new_value: updatedAccount.toJSON(),
        ip_address: ipAddress,
        timestamp: now,
        entity_type: 'CustomerAccount',
        entity_id: updatedAccount.id,
        status: 'SUCCESS',
        account_no: accountNumber,
        description: 'Updated customer account details',
      }, { transaction });
    }

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: 'Customer account updated successfully',
      account: {
        id: updatedAccount.id,
        account_number: updatedAccount.account_number,
        status: updatedAccount.REC_ST,
        substatus: updatedAccount.substatus,
        online_enabled: updatedAccount.online_enabled,
        debit_allowed: updatedAccount.DR_ALLOWED,
        credit_allowed: updatedAccount.CR_ALLOWED,
        updated_at: updatedAccount.updatedAt
      }
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating customer account:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      params: req.params,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating the customer account',
      error: error.message,
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

// Activate a customer account by account number
export const activateCustomerAccount = async (req, res) => {
  const { accountNumber } = req.params;
  const { activationReason, notes } = req.body;

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

    // Validate activation reason
    if (!activationReason || activationReason.trim() === '') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Activation reason is required.',
      });
    }

    // Find the account
    const account = await CustomerAccount.findOne({
      where: { account_number: accountNumber },
      transaction
    });

    if (!account) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Customer account not found.',
        account_number: accountNumber
      });
    }

    // Check if account is already active
    const currentStatus = account.REC_ST;
    if (currentStatus === 'ACTIVE') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Account is already active',
        account: {
          account_number: account.account_number,
          account_name: account.PRODUCT_DESC,
          current_status: currentStatus,
          account_type: account.ACCOUNT_TYPE
        }
      });
    }

    // Validate that account can be activated
    const validPreviousStates = ['DORMANT', 'INACTIVE', 'SUSPENDED', 'PENDING'];
    if (!validPreviousStates.includes(currentStatus)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot activate account with status: ${currentStatus}. Only DORMANT, INACTIVE, SUSPENDED, or PENDING accounts can be activated.`,
        currentStatus: currentStatus
      });
    }

    // Store old values for audit trail
    const oldValue = account.toJSON();

    // Activate the account
    await CustomerAccount.update({
      REC_ST: 'ACTIVE',
      substatus: 'Active',
      lastActivityDate: new Date(),
      updatedAt: new Date()
    }, {
      where: { account_number: accountNumber },
      transaction
    });

    // Get updated account
    const updatedAccount = await CustomerAccount.findOne({
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
        event_type: 'ACCOUNT_ACTIVATION',
        action: 'Activate Account',
        old_value: oldValue,
        new_value: updatedAccount.toJSON(),
        ip_address: ipAddress,
        timestamp: now,
        entity_type: 'CustomerAccount',
        entity_id: updatedAccount.id,
        status: 'SUCCESS',
        account_no: accountNumber,
        description: `Account activated from ${currentStatus} to ACTIVE`,
        additional_info: {
          previous_status: currentStatus,
          new_status: 'ACTIVE',
          activation_reason: activationReason,
          notes: notes || '',
          activated_by: userId,
          activation_date: now
        }
      }, { transaction });
    }

    await transaction.commit();

    // Log the activation
    logger.info('Account activated successfully', {
      account_number: accountNumber,
      previousStatus: currentStatus,
      activatedBy: userId,
      activationReason,
      timestamp: now
    });

    return res.status(200).json({
      success: true,
      message: 'Account activated successfully',
      account: {
        account_number: account.account_number,
        account_name: account.PRODUCT_DESC,
        account_type: account.ACCOUNT_TYPE,
        previous_status: currentStatus,
        new_status: 'ACTIVE',
        activation_date: now,
        activated_by: userId
      },
      activation_details: {
        reason: activationReason,
        notes: notes || '',
        timestamp: now
      }
    });

  } catch (error) {
    await transaction.rollback();

    logger.error('Error activating customer account:', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while activating the customer account',
      error: error.message,
    });
  }
};

// Bulk Account Activation
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
  activateCustomerAccount,
  bulkActivateAccounts,
  getAccountActivationHistory,
  updateDormantAccounts,
  searchCustomersByName,
  resetAccountCounters,
  findDuplicateAccounts
};