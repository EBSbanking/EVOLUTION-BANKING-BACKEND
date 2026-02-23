// src/controllers/ThriftController.js - COMPLETE FIXED VERSION (NO CUSTOMER MODEL)
import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import generateCustomerNumber from '../utils/generateCustomerNumber.js';
import { generateAccountIdentifiersFromCounter } from '../utils/generateAccountNumber.js';

// Import models directly to avoid loader issues
import sequelizeInstance from '../../config/db.js';
import Thrift from '../models/Thrift.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import GLAccount from '../models/GLAccount.js';

// Track initialization
let modelsInitialized = false;


// Helper function to ensure models are ready
async function ensureModelsInitialized() {
  if (modelsInitialized) {
    return true;
  }
  
  try {
    console.log('🔄 Verifying ThriftController models...');
    
    // Test database connection
    await sequelizeInstance.authenticate();
    console.log('✅ Database connection verified');
    
    // Check if Thrift model is working
    if (!Thrift || typeof Thrift.findOne !== 'function') {
      throw new Error('Thrift model not properly initialized');
    }
    
    // Check if Transaction model is working
    if (!Transaction || typeof Transaction.findOne !== 'function') {
      throw new Error('Transaction model not properly initialized');
    }
    
    modelsInitialized = true;
    console.log('✅ ThriftController models verified');
    return true;
    
  } catch (error) {
    console.error('❌ Model verification failed:', error.message);
    throw error;
  }
}

// Helper function to get Cash GL account (CASH IN HAND)
async function getCashGLAccount(sequelize, transaction = null) {
  try {
    console.log('🔍 Searching for cash GL account...');
    
    const query = `
      SELECT 
        g_l__a_c_c_t__n_o as account_no,
        a_c_c_t__d_e_s_c as account_description,
        category_name,
        g_l__a_c_c_t__c_a_t as category_type,
        c_u_r_r_e_n_t__b_a_l_a_n_c_e
      FROM gl_accounts 
      WHERE (
        -- By account number range (01 typically for assets like cash)
        (g_l__a_c_c_t__n_o LIKE '01%' AND 
         (UPPER(a_c_c_t__d_e_s_c) LIKE '%CASH%' OR g_l__a_c_c_t__n_o LIKE '011012%')) OR
        
        -- By account description
        (UPPER(a_c_c_t__d_e_s_c) LIKE '%CASH%' AND 
         (UPPER(a_c_c_t__d_e_s_c) LIKE '%HAND%' OR 
          UPPER(a_c_c_t__d_e_s_c) LIKE '%VAULT%' OR
          UPPER(a_c_c_t__d_e_s_c) LIKE '%TELLER%')) OR
        
        -- By category
        (UPPER(category_name) LIKE '%CASH%' AND UPPER(category_name) LIKE '%ASSET%') OR
        
        -- By category type
        (g_l__a_c_c_t__c_a_t = 'ASSET' AND UPPER(a_c_c_t__d_e_s_c) LIKE '%CASH%')
      )
      ORDER BY 
        CASE 
          WHEN UPPER(a_c_c_t__d_e_s_c) LIKE '%CASH IN HAND%' THEN 1
          WHEN UPPER(a_c_c_t__d_e_s_c) LIKE '%CASH%HAND%' THEN 2
          WHEN g_l__a_c_c_t__n_o LIKE '011012%' THEN 3  -- Typical cash account number
          WHEN UPPER(a_c_c_t__d_e_s_c) LIKE '%CASH%' THEN 4
          ELSE 5
        END
      LIMIT 1`;
    
    console.log('🔍 Executing cash GL query...');
    const [cashAccount] = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
      transaction: transaction
    });
    
    if (cashAccount) {
      console.log(`✅ Found cash GL account:`, {
        account_no: cashAccount.account_no,
        description: cashAccount.account_description,
        category: cashAccount.category_name,
        current_balance: cashAccount.c_u_r_r_e_n_t__b_a_l_a_n_c_e
      });
      return cashAccount.account_no;
    }
    
    // Fallback: Get any asset account starting with 01
    console.log('🔍 No specific cash account found, trying any asset account starting with 01...');
    const [anyAsset] = await sequelize.query(
      `SELECT g_l__a_c_c_t__n_o as account_no, a_c_c_t__d_e_s_c as description
       FROM gl_accounts 
       WHERE g_l__a_c_c_t__c_a_t = 'ASSET' 
         AND g_l__a_c_c_t__n_o LIKE '01%'
       ORDER BY g_l__a_c_c_t__n_o ASC 
       LIMIT 1`,
      {
        type: sequelize.QueryTypes.SELECT,
        transaction: transaction
      }
    );
    
    if (anyAsset) {
      console.log(`⚠️ Using asset account as cash GL: ${anyAsset.account_no} - ${anyAsset.description}`);
      return anyAsset.account_no;
    }
    
    console.error('❌ No cash GL account found');
    return null;
    
  } catch (error) {
    console.error('Error fetching cash GL account:', error.message);
    console.error('Query error details:', error);
    return null;
  }
}

// Helper function to get Thrift Service Income GL account
async function getThriftServiceIncomeGL(sequelize, transaction = null) {
  try {
    console.log('🔍 Searching for thrift service income GL account...');
    
    const query = `
      SELECT 
        g_l__a_c_c_t__n_o as account_no,
        a_c_c_t__d_e_s_c as account_description,
        category_name,
        g_l__a_c_c_t__c_a_t as category_type,
        category_code,
        c_u_r_r_e_n_t__b_a_l_a_n_c_e
      FROM gl_accounts 
      WHERE (
        -- By category name (REVENUE - SERVICE_INCOME)
        (UPPER(category_name) LIKE '%REVENUE%' AND 
         UPPER(category_name) LIKE '%SERVICE_INCOME%') OR
        
        -- By account description
        (UPPER(a_c_c_t__d_e_s_c) LIKE '%THRIFT%' AND 
         (UPPER(a_c_c_t__d_e_s_c) LIKE '%INCOME%' OR 
          UPPER(a_c_c_t__d_e_s_c) LIKE '%SERVICE%' OR
          UPPER(a_c_c_t__d_e_s_c) LIKE '%REVENUE%')) OR
        
        -- Service income in description
        (UPPER(a_c_c_t__d_e_s_c) LIKE '%SERVICE%INCOME%') OR
        
        -- By category code (404 is often service income)
        (category_code = '404') OR
        
        -- By category type (REVENUE)
        (g_l__a_c_c_t__c_a_t = 'REVENUE' AND 
         UPPER(a_c_c_t__d_e_s_c) LIKE '%SERVICE%')
      )
      ORDER BY 
        CASE 
          WHEN UPPER(a_c_c_t__d_e_s_c) LIKE '%THRIFT%SERVICE%INCOME%' THEN 1
          WHEN UPPER(a_c_c_t__d_e_s_c) LIKE '%THRIFT%INCOME%' THEN 2
          WHEN UPPER(a_c_c_t__d_e_s_c) LIKE '%SERVICE%INCOME%' THEN 3
          WHEN UPPER(category_name) LIKE '%REVENUE%SERVICE_INCOME%' THEN 4
          WHEN category_code = '404' THEN 5
          WHEN g_l__a_c_c_t__c_a_t = 'REVENUE' THEN 6
          ELSE 7
        END
      LIMIT 1`;
    
    console.log('🔍 Executing income GL query...');
    const [incomeAccount] = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
      transaction: transaction
    });
    
    if (incomeAccount) {
      console.log(`✅ Found thrift service income GL account:`, {
        account_no: incomeAccount.account_no,
        description: incomeAccount.account_description,
        category: incomeAccount.category_name,
        category_code: incomeAccount.category_code,
        current_balance: incomeAccount.c_u_r_r_e_n_t__b_a_l_a_n_c_e
      });
      return incomeAccount.account_no;
    }
    
    // Fallback: Get any revenue account
    console.log('🔍 No specific income account found, trying any revenue account...');
    const [anyRevenue] = await sequelize.query(
      `SELECT g_l__a_c_c_t__n_o as account_no, a_c_c_t__d_e_s_c as description
       FROM gl_accounts 
       WHERE g_l__a_c_c_t__c_a_t = 'REVENUE'
       ORDER BY g_l__a_c_c_t__n_o ASC 
       LIMIT 1`,
      {
        type: sequelize.QueryTypes.SELECT,
        transaction: transaction
      }
    );
    
    if (anyRevenue) {
      console.log(`⚠️ Using revenue account as thrift income GL: ${anyRevenue.account_no} - ${anyRevenue.description}`);
      return anyRevenue.account_no;
    }
    
    console.error('❌ No thrift service income GL account found');
    return null;
    
  } catch (error) {
    console.error('Error fetching thrift service income GL account:', error.message);
    console.error('Query error details:', error);
    return null;
  }
}

// Helper function to find the thrift product dynamically - DEBUG VERSION
async function findThriftProduct(sequelize, transaction = null) {
  try {
    console.log('🔍 Searching for thrift product...');
    
    // First, just get ANY product to see what's there
    console.log('📋 Getting any product first...');
    const [anyProduct] = await sequelize.query(
      `SELECT * FROM savings_products LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, transaction }
    );
    
    if (anyProduct) {
      console.log('📊 Sample product from database:', {
        PROD_ID: anyProduct.PROD_ID,
        PROD_CD: anyProduct.PROD_CD,
        productName: anyProduct.productName,
        PRODUCT_TYPE: anyProduct.PRODUCT_TYPE
      });
    }
    
    // Simple query to get the first active savings product
    const query = `
      SELECT 
        PROD_ID,
        PROD_CD,
        PROD_DESC,
        PRODUCT_TYPE,
        productCode,
        productName,
        productDescription,
        CRNCY_ID,
        START_DT,
        REC_ST,
        BU_ID,
        created_at,
        updated_at
      FROM savings_products 
      WHERE REC_ST = 'ACTIVE'
      ORDER BY PROD_ID ASC 
      LIMIT 1
    `;
    
    console.log('🔍 Executing query for product...');
    
    const [product] = await sequelize.query(
      query,
      { type: sequelize.QueryTypes.SELECT, transaction }
    );
    
    if (product) {
      console.log(`✅ Found product:`, {
        PROD_ID: product.PROD_ID,
        productName: product.productName,
        PROD_CD: product.PROD_CD,
        REC_ST: product.REC_ST
      });
      return product;
    }
    
    console.error('❌ No active product found');
    return null;
    
  } catch (error) {
    console.error('❌ Error finding product:', error.message);
    return null;
  }
}

class ThriftController {
  // ─────────────────────────────────────────────
  //  Helper: Generate unique thrift account identifiers
  // ─────────────────────────────────────────────
  static async generateThriftAccountIdentifiers(sequelize, transaction = null) {
    try {
      console.log('🔢 Generating unique thrift account identifiers...');
      
      // Check if THRIFT_ACCOUNTS table exists
      try {
        const [tableCheck] = await sequelize.query(
          `SELECT TABLE_NAME 
           FROM INFORMATION_SCHEMA.TABLES 
           WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'THRIFT_ACCOUNTS'`,
          { type: sequelize.QueryTypes.SELECT, transaction }
        );
        
        if (!tableCheck) {
          console.log('ℹ️ THRIFT_ACCOUNTS table does not exist yet, using default identifiers');
          return {
            ACCT_NO: `000100${Math.floor(Math.random() * 9000) + 1000}`,
            ACCT_ID: Math.floor(Math.random() * 90000000 + 10000000).toString()
          };
        }
      } catch (tableError) {
        console.log('ℹ️ Error checking THRIFT_ACCOUNTS table:', tableError.message);
      }
      
      // Get the last used account number from THRIFT_ACCOUNTS
      const [lastAccount] = await sequelize.query(
        `SELECT MAX(ACCT_NO) as max_acct_no FROM THRIFT_ACCOUNTS`,
        { type: sequelize.QueryTypes.SELECT, transaction }
      );
      
      let nextAcctNo;
      if (lastAccount && lastAccount.max_acct_no) {
        // Increment the last account number
        const lastNum = parseInt(lastAccount.max_acct_no.slice(-4));
        const nextNum = (lastNum + 1).toString().padStart(4, '0');
        nextAcctNo = `000100${nextNum}`;
        console.log(`📊 Last ACCT_NO: ${lastAccount.max_acct_no}, Next: ${nextAcctNo}`);
      } else {
        // First account
        nextAcctNo = '0001000001';
        console.log('📊 First thrift account, starting at: 0001000001');
      }
      
      // Generate a unique 8-digit ACCT_ID
      const timestamp = Date.now();
      const timestampStr = timestamp.toString();
      const ACCT_ID = timestampStr.slice(-8).padStart(8, '0');
      
      console.log(`✅ Generated thrift identifiers: ACCT_NO=${nextAcctNo}, ACCT_ID=${ACCT_ID}`);
      
      return {
        ACCT_NO: nextAcctNo,
        ACCT_ID: ACCT_ID
      };
      
    } catch (error) {
      console.error('❌ Error generating thrift account identifiers:', error);
      
      // Fallback: generate random numbers
      return {
        ACCT_NO: `000100${Math.floor(Math.random() * 9000) + 1000}`,
        ACCT_ID: Math.floor(Math.random() * 90000000 + 10000000).toString()
      };
    }
  }

// ─────────────────────────────────────────────
//  Create new thrift account
// ─────────────────────────────────────────────
static async createThriftAccount(req, res) {
  let t = null;
  
  try {
    console.log('🚀 Starting createThriftAccount...');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Ensure models are initialized
    await ensureModelsInitialized();
    console.log('✅ Models verified');
    
    // Validate required models
    if (!Thrift || !Transaction) {
      throw new Error('Required models not available');
    }
    
    // Get GL models directly from sequelize.models if available
    const models = sequelizeInstance.models;
    const GLAccount = models.GLAccount || models.gl_accounts;
    const GLAccountTransaction = models.GLAccountTransaction || models.gl_account_transactions;
    
    // Start transaction
    t = await sequelizeInstance.transaction();
    
    const {
      FIRST_NAME,
      LASTNAME,
      FULL_NAME,
      initialAmount,
      COLLECTION_TYPE,
      address,
      phone,
      RELATIONSHIP_MANAGER,
      TRANSACTION_DATE,
      OPENED_DT,
      city,
      state,
      zipCode,
      PRODUCT_ID // Optional: Allow manual override from request
    } = req.body;
    
    // ─── Validation ────────────────────────────────────────
    if (!FIRST_NAME?.trim() || !LASTNAME?.trim()) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: 'FIRST_NAME and LASTNAME are required',
      });
    }
    
    if (!initialAmount || Number(initialAmount) <= 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: 'initialAmount must be a positive number',
      });
    }
    
    const collectionType = COLLECTION_TYPE ? COLLECTION_TYPE.toUpperCase().trim() : 'DAILY';
    const validTypes = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'];
    if (!validTypes.includes(collectionType)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: `Invalid COLLECTION_TYPE. Allowed values: ${validTypes.join(', ')}`,
      });
    }
    
    const fullName = FULL_NAME?.trim() || `${FIRST_NAME.trim()} ${LASTNAME.trim()}`.trim();
    const txDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();
    const openDate = OPENED_DT ? new Date(OPENED_DT) : new Date();
    
    // ─── Dynamically Fetch Savings Product Configuration ────
    let savingsProduct = null;
    let productId = PRODUCT_ID;
    let CASH_GL = null;
    let THRIFT_INCOME_GL = null;

    console.log('🔍 Starting product search...');

    // If PRODUCT_ID is provided, try to find it directly
    if (productId) {
      console.log(`📋 Looking for provided PRODUCT_ID: ${productId}`);
      
      try {
        const [product] = await sequelizeInstance.query(
          `SELECT * FROM savings_products WHERE PROD_ID = ? LIMIT 1`,
          {
            replacements: [productId],
            type: sequelizeInstance.QueryTypes.SELECT,
            transaction: t
          }
        );
        
        if (product) {
          savingsProduct = product;
          console.log(`✅ Found provided PRODUCT_ID: ${productId}`);
        } else {
          console.warn(`⚠️ Provided PRODUCT_ID ${productId} not found, searching dynamically...`);
          savingsProduct = await findThriftProduct(sequelizeInstance, t);
          if (savingsProduct) {
            productId = savingsProduct.PROD_ID;
          }
        }
      } catch (sqlError) {
        console.error('❌ Error finding provided product:', sqlError.message);
        savingsProduct = await findThriftProduct(sequelizeInstance, t);
        if (savingsProduct) {
          productId = savingsProduct.PROD_ID;
        }
      }
    } else {
      // No PRODUCT_ID provided, search dynamically
      console.log('🔍 No PRODUCT_ID provided, searching for thrift product...');
      savingsProduct = await findThriftProduct(sequelizeInstance, t);
      if (savingsProduct) {
        productId = savingsProduct.PROD_ID;
      }
    }

    // ─── Get GL Accounts and validate ───────────────────────
    if (savingsProduct) {
      console.log('✅ Using savings product configuration:', {
        productId: savingsProduct.PROD_ID,
        productName: savingsProduct.productName,
        productCode: savingsProduct.productCode
      });
      
      // Get GL accounts dynamically
      CASH_GL = await getCashGLAccount(sequelizeInstance, t);
      THRIFT_INCOME_GL = await getThriftServiceIncomeGL(sequelizeInstance, t);
      
      // Verify both GL accounts exist
      if (!CASH_GL || !THRIFT_INCOME_GL) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          error: 'GL accounts not configured',
          details: `Cash GL: ${CASH_GL ? 'Found' : 'Missing'}, Income GL: ${THRIFT_INCOME_GL ? 'Found' : 'Missing'}`
        });
      }
      
      console.log('✅ Using dynamically found GL accounts:', {
        cashGL: CASH_GL,
        thriftIncomeGL: THRIFT_INCOME_GL
      });
      
    } else {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: 'No savings product found',
        details: 'Please set up a savings product in the system first.'
      });
    }

    // ─── Generate identifiers ───────────────────────────────
    const { CUST_ID, CUST_NO } = await generateCustomerNumber();
    
    // USE THE THRIFT-SPECIFIC GENERATOR
    const identifiers = await ThriftController.generateThriftAccountIdentifiers(sequelizeInstance, t);
    let ACCT_NO = identifiers.ACCT_NO;
    let ACCT_ID = identifiers.ACCT_ID;

    console.log(`📊 Generated identifiers: CUST_ID=${CUST_ID}, ACCT_NO=${ACCT_NO}, ACCT_ID=${ACCT_ID}`);
    
    // Generate transaction identifiers
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    
    // Get the next transaction identifier
    let nextTransactionId = 1;
    try {
      const [lastTransaction] = await sequelizeInstance.query(
        'SELECT MAX(TRANSACTION_IDENTIFIER) as max_id FROM transactions',
        { type: sequelizeInstance.QueryTypes.SELECT, transaction: t }
      );
      nextTransactionId = (lastTransaction?.max_id || 0) + 1;
    } catch (txError) {
      console.log('ℹ️ Could not get max transaction ID:', txError.message);
    }
    
    // Generate identifiers
    const TRANSACTION_IDENTIFIER = nextTransactionId;
    const EVENT_ID = nextTransactionId;
    const TRAN_JOURNAL_ID = `JRN${timestamp}${randomNum}`;
    const REFERENCE = `THRIFT_${ACCT_NO}_${timestamp}`;
    const TRANSACTION_ID = `TXN${nextTransactionId.toString().padStart(10, '0')}`;
    
    console.log('Generated transaction IDs:', {
      TRANSACTION_IDENTIFIER,
      EVENT_ID,
      TRAN_JOURNAL_ID,
      REFERENCE,
      TRANSACTION_ID
    });
    
    // ─── Check for conflicts ────────────────────────────────
    const existingThrift = await Thrift.findOne({
      where: { ACCT_NO },
      transaction: t,
    });
    
    if (existingThrift) {
      // If there's a conflict, generate new ones
      console.warn(`⚠️ ACCT_NO ${ACCT_NO} already exists, generating new...`);
      const newIdentifiers = await ThriftController.generateThriftAccountIdentifiers(sequelizeInstance, t);
      ACCT_NO = newIdentifiers.ACCT_NO;
      ACCT_ID = newIdentifiers.ACCT_ID;
      console.log(`🔄 Using new identifiers: ACCT_NO=${ACCT_NO}, ACCT_ID=${ACCT_ID}`);
    }
    
    // ─── Prepare address object ─────────────────────────────
    let addressObj = null;
    if (address || city || state || zipCode) {
      try {
        addressObj = typeof address === 'string' ? JSON.parse(address) : (address || {});
        if (!addressObj || typeof addressObj !== 'object') {
          addressObj = {};
        }
        if (city) addressObj.city = city;
        if (state) addressObj.state = state;
        if (zipCode) addressObj.zipCode = zipCode;
        if (!addressObj.country) addressObj.country = 'Nigeria';
      } catch {
        addressObj = {
          street: address || '',
          city: city || '',
          state: state || '',
          zipCode: zipCode || '',
          country: 'Nigeria'
        };
      }
    }
    
    // ─── Create thrift account ──────────────────────────────
    console.log('Creating thrift account...');
    
    const thriftData = {
      CUST_ID: CUST_ID,
      ACCT_NO: ACCT_NO,
      ACCT_ID: ACCT_ID,
      FIRST_NAME: FIRST_NAME,
      LASTNAME: LASTNAME,
      FULL_NAME: fullName,
      RELATIONSHIP_MANAGER: RELATIONSHIP_MANAGER || null,
      AMOUNT: parseFloat(initialAmount),
      ADDRESS: addressObj ? JSON.stringify(addressObj) : null,
      COLLECTION_TYPE: collectionType,
      STATUS: 'ACTIVE',
      OPENING_DATE: openDate,
      OPENED_DT: openDate,
      TRANSACTION_DATE: txDate,
      INITIAL_AMOUNT: parseFloat(initialAmount),
      ACCOUNT_TYPE: 'THRIFT',
      PRODUCT_ID: productId,
      TOTAL_CONTRIBUTIONS: parseFloat(initialAmount),
      TOTAL_WITHDRAWALS: 0,
      GL_ACCOUNTS: JSON.stringify({
        cash_account: CASH_GL,
        income_account: THRIFT_INCOME_GL
      }),
      NOTES: `Thrift account opened for ${fullName} with initial deposit of ${initialAmount} (Product: ${savingsProduct.productName})`,
      CREATED_AT: new Date(),
      UPDATED_AT: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    };
    
    console.log('⚠️ DEBUG: Thrift data being created:', thriftData);
    
    const thriftAccount = await Thrift.create(thriftData, { transaction: t });
    
    if (!thriftAccount) {
      await t.rollback();
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create thrift account' 
      });
    }
    
    console.log(`✅ Thrift account created: ${thriftAccount.ACCT_NO}`);
    
    // ─── Create opening transaction ─────────────────────────
    console.log('Creating transaction record...');
    
    // Prepare metadata for transaction
    const metadata = {
      direction: 'DEBIT',
      amountToBank: parseFloat(initialAmount),
      amountToCustomer: 0,
      reference: REFERENCE,
      customerName: fullName,
      collectionType: collectionType,
      relationshipManager: RELATIONSHIP_MANAGER,
      transactionType: 'OPENING_DEPOSIT',
      productId: productId,
      productName: savingsProduct.productName,
      glAccounts: {
        cash: CASH_GL,
        income: THRIFT_INCOME_GL
      }
    };
    
    // IMPORTANT: No manual timestamp fields - Sequelize will add them automatically
    const transactionData = {
      ACCT_NO: thriftAccount.ACCT_NO,
      ACCT_ID: thriftAccount.ACCT_ID,
      BU_ID: 1,
      CUST_ID: CUST_ID,
      ACCT_NM: `${fullName} Thrift Account`,
      AMOUNT: parseFloat(initialAmount),
      transactionDirection: 'DEBIT',
      TRANSACTIONDATE: txDate,
      TRANSACTION_TYPE: 'THRIFT_OPENING',
      TRANSACTION_IDENTIFIER: TRANSACTION_IDENTIFIER,
      TRANSACTION_ID: TRANSACTION_ID,
      EVENT_ID: EVENT_ID,
      TRAN_JOURNAL_ID: TRAN_JOURNAL_ID,
      REFERENCE: REFERENCE,
      description: `Thrift account opening – initial deposit for ${fullName} (Product: ${savingsProduct.productName})`,
      currency: 'NGN',
      createdBy: 'SYSTEM',
      status: 'COMPLETED',
      FLAGGED_FOR_AML: false,
      AML_THRESHOLD_USED: 0,
      metadata: JSON.stringify(metadata)
      // NO timestamp fields here - Sequelize will add them automatically
    };
    
    console.log('Transaction data to create:', JSON.stringify(transactionData, null, 2));
    
    const transactionRecord = await Transaction.create(transactionData, { transaction: t });
    
    if (!transactionRecord) {
      await t.rollback();
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create transaction record' 
      });
    }
    
    console.log(`✅ Transaction created: ${REFERENCE}`);
    
    // ─── Create GL Accounting Entries ──────────────────────
    console.log('Creating GL accounting entries...');
    let glTransactionInfo = null;
    
    if (GLAccountTransaction) {
      try {
        // Verify all GL accounts exist before proceeding
        const [cashAccountExists, incomeAccountExists] = await Promise.all([
          sequelizeInstance.query(
            `SELECT g_l__a_c_c_t__n_o, a_c_c_t__d_e_s_c FROM gl_accounts WHERE g_l__a_c_c_t__n_o = ?`,
            {
              replacements: [CASH_GL],
              type: sequelizeInstance.QueryTypes.SELECT,
              transaction: t
            }
          ),
          sequelizeInstance.query(
            `SELECT g_l__a_c_c_t__n_o, a_c_c_t__d_e_s_c FROM gl_accounts WHERE g_l__a_c_c_t__n_o = ?`,
            {
              replacements: [THRIFT_INCOME_GL],
              type: sequelizeInstance.QueryTypes.SELECT,
              transaction: t
            }
          )
        ]);
        
        if (!cashAccountExists.length) {
          throw new Error(`Cash GL account ${CASH_GL} does not exist in gl_accounts table`);
        }
        
        if (!incomeAccountExists.length) {
          throw new Error(`Thrift Service Income GL account ${THRIFT_INCOME_GL} does not exist in gl_accounts table`);
        }
        
        console.log('✅ GL accounts verified:', {
          cashAccount: `${CASH_GL} - ${cashAccountExists[0]?.a_c_c_t__d_e_s_c}`,
          incomeAccount: `${THRIFT_INCOME_GL} - ${incomeAccountExists[0]?.a_c_c_t__d_e_s_c}`
        });
        
        // Create unique journal ID for GL entries
        const glJournalId = `THRIFT-${ACCT_NO}-${timestamp}`;
        const glTransactionId = `GL-${TRANSACTION_ID}`;
        
        // Get current balances before update
        const [cashCurrent, incomeCurrent] = await Promise.all([
          sequelizeInstance.query(
            `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
             FROM gl_accounts 
             WHERE g_l__a_c_c_t__n_o = ?`,
            {
              replacements: [CASH_GL],
              type: sequelizeInstance.QueryTypes.SELECT,
              transaction: t
            }
          ),
          sequelizeInstance.query(
            `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
             FROM gl_accounts 
             WHERE g_l__a_c_c_t__n_o = ?`,
            {
              replacements: [THRIFT_INCOME_GL],
              type: sequelizeInstance.QueryTypes.SELECT,
              transaction: t
            }
          )
        ]);

        const cashPreviousBalance = cashCurrent[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0;
        const incomePreviousBalance = incomeCurrent[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0;
        
        // Create GL transaction record
        await GLAccountTransaction.create({
          JOURNAL_ID: glJournalId,
          TRANSACTION_ID: glTransactionId,
          TransactionId: Date.now(),
          DR_ACCT_NO: CASH_GL,
          CR_ACCT_NO: THRIFT_INCOME_GL,
          AMOUNT: parseFloat(initialAmount),
          NARRATION: `Thrift account opening fee for ${fullName} (Account: ${ACCT_NO}, Product: ${savingsProduct.productName})`,
          CREATED_BY: 'SYSTEM',
          UPDATED_BY: 'SYSTEM',
          TRANSACTION_TYPE: 'THRIFT_OPENING_FEE',
          PRODUCT_ID: productId,
          CURRENCY_CODE: 'NGN',
          STATUS: 'POSTED',
          ACCOUNTING_IMPACT: 'DEBIT_CASH_CREDIT_INCOME',
          createdAt: new Date(),
          updatedAt: new Date()
        }, { transaction: t });
        
        console.log(`✅ GL double-entry transaction created: ${glJournalId}`);
        console.log(`📊 Journal Entry: DEBIT Cash ${CASH_GL}, CREDIT Income ${THRIFT_INCOME_GL} for ₦${initialAmount}`);
        
        // Update GL account balances if GLAccount model exists
        if (GLAccount) {
          // Update Cash Account (DEBIT - increase balance - Asset Account)
          await sequelizeInstance.query(
            `UPDATE gl_accounts 
             SET 
               c_u_r_r_e_n_t__b_a_l_a_n_c_e = c_u_r_r_e_n_t__b_a_l_a_n_c_e + ?,
               l_e_d_g_e_r__b_a_l_a_n_c_e = l_e_d_g_e_r__b_a_l_a_n_c_e + ?,
               a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e = a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e + ?,
               updated_at = NOW()
             WHERE g_l__a_c_c_t__n_o = ?`,
            {
              replacements: [
                parseFloat(initialAmount),
                parseFloat(initialAmount),
                parseFloat(initialAmount),
                CASH_GL
              ],
              transaction: t
            }
          );
          
          // Update Thrift Service Income Account (CREDIT - increase balance - Revenue Account)
          await sequelizeInstance.query(
            `UPDATE gl_accounts 
             SET 
               c_u_r_r_e_n_t__b_a_l_a_n_c_e = c_u_r_r_e_n_t__b_a_l_a_n_c_e + ?,
               l_e_d_g_e_r__b_a_l_a_n_c_e = l_e_d_g_e_r__b_a_l_a_n_c_e + ?,
               a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e = a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e + ?,
               updated_at = NOW()
             WHERE g_l__a_c_c_t__n_o = ?`,
            {
              replacements: [
                parseFloat(initialAmount),
                parseFloat(initialAmount),
                parseFloat(initialAmount),
                THRIFT_INCOME_GL
              ],
              transaction: t
            }
          );
          
          console.log('✅ GL account balances updated');
        }
        
        // Get updated balances for response
        const [cashUpdated, incomeUpdated] = await Promise.all([
          sequelizeInstance.query(
            `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
             FROM gl_accounts 
             WHERE g_l__a_c_c_t__n_o = ?`,
            {
              replacements: [CASH_GL],
              type: sequelizeInstance.QueryTypes.SELECT,
              transaction: t
            }
          ),
          sequelizeInstance.query(
            `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
             FROM gl_accounts 
             WHERE g_l__a_c_c_t__n_o = ?`,
            {
              replacements: [THRIFT_INCOME_GL],
              type: sequelizeInstance.QueryTypes.SELECT,
              transaction: t
            }
          )
        ]);

        glTransactionInfo = {
          transactionId: glTransactionId,
          journalId: glJournalId,
          debitAccount: CASH_GL,
          creditAccount: THRIFT_INCOME_GL,
          amount: parseFloat(initialAmount),
          productId: productId,
          status: 'POSTED',
          accountingImpact: {
            debitAccount: 'Cash Account (Asset Increase)',
            creditAccount: 'Thrift Service Income (Revenue Increase)',
            description: 'Double-entry accounting for thrift opening fee income',
            productName: savingsProduct.productName
          },
          balances: {
            cashAccount: {
              previous: cashPreviousBalance,
              new: cashUpdated[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0,
              change: parseFloat(initialAmount)
            },
            incomeAccount: {
              previous: incomePreviousBalance,
              new: incomeUpdated[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0,
              change: parseFloat(initialAmount)
            }
          }
        };
        
      } catch (glError) {
        console.error('❌ GL accounting error:', glError.message);
        await t.rollback();
        return res.status(500).json({
          success: false,
          error: 'GL Accounting failed',
          details: glError.message
        });
      }
    } else {
      console.log('⚠️ GLAccountTransaction model not available, skipping GL entries');
    }
    
    // ─── Calculate next collection date ─────────────────────
    let nextCollectionDate;
    const today = new Date();
    
    switch (collectionType) {
      case 'DAILY':
        nextCollectionDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'WEEKLY':
        nextCollectionDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'MONTHLY':
        nextCollectionDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
        break;
      case 'QUARTERLY':
        nextCollectionDate = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
        break;
      default:
        nextCollectionDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    }
    
    // Update thrift account with next collection date
    await Thrift.update(
      { 
        nextCollectionDate,
        updated_at: new Date()
      },
      { 
        where: { ACCT_NO: ACCT_NO },
        transaction: t 
      }
    );
    
    await t.commit();
    console.log('✅ Transaction committed successfully');
    
    // ─── Helper function for safe date conversion ────────────
    const safeToISOString = (dateValue) => {
      if (!dateValue) return null;
      try {
        if (dateValue instanceof Date && !isNaN(dateValue)) {
          return dateValue.toISOString();
        }
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
        return null;
      } catch (error) {
        console.error('Error converting date:', error, 'Value:', dateValue);
        return null;
      }
    };
    
    // ─── Log success ────────────────────────────────────────
    console.log('Thrift account created successfully', {
      CUST_ID,
      ACCT_NO,
      ACCT_ID,
      customerName: fullName,
      initialAmount,
      collectionType,
      productId,
      productName: savingsProduct.productName,
      transactionDate: txDate,
      nextCollectionDate,
      transactionId: TRANSACTION_IDENTIFIER,
      reference: REFERENCE,
      glTransactionId: glTransactionInfo?.transactionId || null
    });
    
    // ─── Prepare response data ──────────────────────────────
    const responseData = {
      success: true,
      message: 'Thrift account created successfully' + (glTransactionInfo ? ' with GL posting' : ''),
      data: {
        thriftAccount: {
          CUST_ID,
          CUST_NO,
          ACCT_NO,
          ACCT_ID,
          firstName: FIRST_NAME,
          lastName: LASTNAME,
          fullName: fullName,
          relationshipManager: RELATIONSHIP_MANAGER || null,
          amount: parseFloat(initialAmount),
          address: addressObj,
          collectionType: collectionType,
          status: 'ACTIVE',
          productId: productId,
          productName: savingsProduct.productName,
          openingDate: safeToISOString(openDate),
          transactionDate: safeToISOString(txDate),
          initialAmount: parseFloat(initialAmount),
          accountType: 'THRIFT',
          totalContributions: parseFloat(initialAmount),
          totalWithdrawals: 0,
          nextCollectionDate: safeToISOString(nextCollectionDate),
          isActive: true,
          glAccounts: {
            cash: CASH_GL,
            income: THRIFT_INCOME_GL
          },
          notes: `Thrift account opened for ${fullName} with initial deposit of ${initialAmount}`
        },
        transaction: {
          transactionIdentifier: TRANSACTION_IDENTIFIER,
          transactionId: TRANSACTION_ID,
          eventId: EVENT_ID,
          journalId: TRAN_JOURNAL_ID,
          reference: REFERENCE,
          amount: parseFloat(initialAmount),
          type: 'DEPOSIT',
          status: 'COMPLETED',
          date: safeToISOString(txDate),
          description: `Thrift account opening – initial deposit for ${fullName}`,
          direction: 'DEBIT',
          productId: productId
        },
        product: {
          productId: savingsProduct.PROD_ID,
          productName: savingsProduct.productName,
          productCode: savingsProduct.productCode,
          description: savingsProduct.productDescription || savingsProduct.PROD_DESC
        },
        summary: {
          initialDeposit: parseFloat(initialAmount),
          thriftAccountBalance: parseFloat(initialAmount),
          netTransfer: parseFloat(initialAmount),
          nextCollectionDate: safeToISOString(nextCollectionDate),
          collectionFrequency: collectionType,
          transactionIdentifier: TRANSACTION_IDENTIFIER,
          reference: REFERENCE,
          productId: productId
        }
      }
    };
    
    // Add GL transaction data if available
    if (glTransactionInfo) {
      responseData.data.glTransaction = glTransactionInfo;
    }
    
    // ─── Return success response ────────────────────────────
    return res.status(201).json(responseData);
    
  } catch (err) {
    if (t) {
      try {
        await t.rollback();
        console.log('🔄 Transaction rolled back');
      } catch (rollbackErr) {
        console.error('Rollback failed:', rollbackErr.message);
      }
    }
    
    // Log detailed error
    console.error('❌ CREATE ERROR DETAILS:', {
      name: err.name,
      message: err.message,
      errors: err.errors ? err.errors.map(e => ({
        path: e.path,
        message: e.message,
        value: e.value,
        type: e.type
      })) : null,
      sql: err.sql,
      parameters: err.parameters
    });
    
    console.error('createThriftAccount failed', { 
      error: err.message, 
      stack: err.stack,
      body: req.body,
      timestamp: new Date().toISOString()
    });
    
    // Check for specific errors
    let errorMessage = 'Failed to create thrift account';
    if (err.name === 'SequelizeUniqueConstraintError') {
      errorMessage = 'Account number already exists';
    } else if (err.name === 'SequelizeValidationError') {
      errorMessage = 'Validation error: ' + (err.errors?.map(e => `${e.path}: ${e.message}`).join(', ') || err.message);
    } else if (err.message.includes('foreign key constraint')) {
      errorMessage = 'Invalid customer reference';
    } else if (err.message.includes('ACCT_NO') || err.message.includes('acct_no')) {
      errorMessage = 'Database column issue. Please sync database schema.';
    } else if (err.message.includes('toISOString')) {
      errorMessage = 'Date conversion error';
    } else if (err.message.includes('Product configuration error')) {
      errorMessage = err.message;
    } else if (err.message.includes('GL Accounting failed')) {
      errorMessage = err.message;
    } else if (err.message.includes('No savings product found')) {
      errorMessage = err.message;
    } else if (err.message.includes('GL accounts not configured')) {
      errorMessage = err.message;
    }
    
    return res.status(500).json({ 
      success: false, 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

  // ─────────────────────────────────────────────
  //  Get thrift account by account number
  // ─────────────────────────────────────────────
  static async getThriftAccount(req, res) {
    try {
      const { accountNo } = req.params;
      
      if (!accountNo) {
        return res.status(400).json({
          success: false,
          error: 'Account number is required'
        });
      }
      
      await ensureModelsInitialized();
      
      const thrift = await Thrift.findOne({
        where: { ACCT_NO: accountNo }
      });
      
      if (!thrift) {
        return res.status(404).json({
          success: false,
          error: 'Thrift account not found'
        });
      }
      
      res.json({
        success: true,
        data: thrift
      });
      
    } catch (error) {
      console.error('Error getting thrift account:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get thrift account',
        details: error.message
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Get all thrift accounts for a customer
  // ─────────────────────────────────────────────
  static async getCustomerThriftAccounts(req, res) {
    try {
      const { customerId } = req.params;
      
      if (!customerId) {
        return res.status(400).json({
          success: false,
          error: 'Customer ID is required'
        });
      }
      
      await ensureModelsInitialized();
      
      const thrifts = await Thrift.findAll({
        where: { CUST_ID: customerId },
        order: [['created_at', 'DESC']]
      });
      
      res.json({
        success: true,
        count: thrifts.length,
        data: thrifts
      });
      
    } catch (error) {
      console.error('Error getting customer thrift accounts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get customer thrift accounts',
        details: error.message
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Update thrift account status
  // ─────────────────────────────────────────────
  static async updateThriftStatus(req, res) {
    try {
      const { accountNo } = req.params;
      const { status, reason } = req.body;
      
      if (!accountNo) {
        return res.status(400).json({
          success: false,
          error: 'Account number is required'
        });
      }
      
      if (!status) {
        return res.status(400).json({
          success: false,
          error: 'Status is required'
        });
      }
      
      const validStatuses = ['ACTIVE', 'SUSPENDED', 'CLOSED', 'INACTIVE'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Allowed values: ${validStatuses.join(', ')}`
        });
      }
      
      await ensureModelsInitialized();
      
      const thrift = await Thrift.findOne({
        where: { ACCT_NO: accountNo }
      });
      
      if (!thrift) {
        return res.status(404).json({
          success: false,
          error: 'Thrift account not found'
        });
      }
      
      await thrift.update({
        STATUS: status,
        statusReason: reason || null,
        updated_at: new Date()
      });
      
      res.json({
        success: true,
        message: `Thrift account status updated to ${status}`,
        data: thrift
      });
      
    } catch (error) {
      console.error('Error updating thrift status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update thrift status',
        details: error.message
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Get thrift account transactions
  // ─────────────────────────────────────────────
  static async getThriftTransactions(req, res) {
    try {
      const { accountNo } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      if (!accountNo) {
        return res.status(400).json({
          success: false,
          error: 'Account number is required'
        });
      }
      
      await ensureModelsInitialized();
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      const transactions = await Transaction.findAll({
        where: { ACCT_NO: accountNo },
        order: [['TRANSACTIONDATE', 'DESC']],
        limit: parseInt(limit),
        offset: offset
      });
      
      const total = await Transaction.count({
        where: { ACCT_NO: accountNo }
      });
      
      res.json({
        success: true,
        count: transactions.length,
        total: total,
        page: parseInt(page),
        limit: parseInt(limit),
        data: transactions
      });
      
    } catch (error) {
      console.error('Error getting thrift transactions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get thrift transactions',
        details: error.message
      });
    }
  }

  // ─────────────────────────────────────────────
  // Helper function to generate transaction identifiers with CORRECT TYPES
  // ─────────────────────────────────────────────
  static async generateTransactionIdentifiers(prefix = 'THRIFT', transaction) {
    try {
      // Get the next transaction identifier
      const [lastTransaction] = await sequelizeInstance.query(
        'SELECT MAX(transaction_identifier) as max_id FROM transactions',
        { type: sequelizeInstance.QueryTypes.SELECT, transaction }
      );
      
      const nextTransactionId = (lastTransaction?.max_id || 0) + 1;
      const timestamp = Date.now();
      const randomNum = Math.floor(Math.random() * 10000);
      
      return {
        TRANSACTION_IDENTIFIER: nextTransactionId, // INTEGER
        EVENT_ID: nextTransactionId, // INTEGER
        TRAN_JOURNAL_ID: `JRN${timestamp}${randomNum}`, // STRING
        REFERENCE: `${prefix}_${timestamp}_${randomNum}`, // STRING
        TRANSACTION_ID: `TXN${nextTransactionId.toString().padStart(10, '0')}` // STRING
      };
    } catch (error) {
      console.error('Error generating transaction IDs:', error);
      // Fallback
      const fallbackId = Math.floor(Math.random() * 1000000);
      const timestamp = Date.now();
      
      return {
        TRANSACTION_IDENTIFIER: fallbackId,
        EVENT_ID: fallbackId,
        TRAN_JOURNAL_ID: `JRN${timestamp}`,
        REFERENCE: `${prefix}_${timestamp}`,
        TRANSACTION_ID: `TXN${fallbackId}`
      };
    }
  }

  // ─────────────────────────────────────────────
  //  Create thrift account for existing customer (SINGLE VERSION)
  // ─────────────────────────────────────────────
  static async createThriftAccountForExistingCustomer(req, res) {
    let t;
    
    try {
      console.log('🔄 Creating thrift account for existing customer...');
      
      await ensureModelsInitialized();
      
      t = await sequelizeInstance.transaction();
      
      const {
        CUST_ID,
        FULL_NAME: providedFullName,
        initialAmount,
        COLLECTION_TYPE,
        address,
        RELATIONSHIP_MANAGER,
        TRANSACTION_DATE,
        OPENED_DT
      } = req.body;

      // Validate required fields
      if (!CUST_ID || !initialAmount || !COLLECTION_TYPE) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: CUST_ID, initialAmount, COLLECTION_TYPE'
        });
      }

      // Validate initial amount
      if (Number(initialAmount) <= 0) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Initial amount must be greater than 0'
        });
      }

      // Set transaction date and opened date
      const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();
      const openedDate = OPENED_DT ? new Date(OPENED_DT) : new Date();

      // Validate relationship manager
      if (RELATIONSHIP_MANAGER) {
        const managerExists = await User.findOne({
          where: { code: RELATIONSHIP_MANAGER },
          transaction: t
        });
        if (!managerExists) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: 'Invalid relationship manager code'
          });
        }
      }

      // Check if CUST_ID already exists in thrift accounts
      const existingThriftAccount = await Thrift.findOne({
        where: { CUST_ID },
        transaction: t
      });

      if (!existingThriftAccount) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Customer not found in thrift system'
        });
      }

      // Compute FULL_NAME if not provided
      const fullName = providedFullName || existingThriftAccount.FULL_NAME || 
                      `${existingThriftAccount.FIRST_NAME} ${existingThriftAccount.LASTNAME}`.trim();
      if (!fullName) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Full name cannot be empty'
        });
      }

      // Generate thrift account numbers
      const identifiers = await ThriftController.generateThriftAccountIdentifiers(sequelizeInstance, t);
      const { ACCT_NO, ACCT_ID } = identifiers;
      
      console.log(`📊 Generated account identifiers: ACCT_NO=${ACCT_NO}, ACCT_ID=${ACCT_ID}`);

      // Generate transaction identifiers WITH CORRECT TYPES
      const { 
        TRANSACTION_IDENTIFIER, 
        EVENT_ID, 
        TRAN_JOURNAL_ID, 
        REFERENCE,
        TRANSACTION_ID 
      } = await ThriftController.generateTransactionIdentifiers('THRIFT_EXIST', t);

      // Check if thrift account already exists with this collection type
      const existingAccount = await Thrift.findOne({
        where: {
          CUST_ID,
          COLLECTION_TYPE: COLLECTION_TYPE.toUpperCase()
        },
        transaction: t
      });

      if (existingAccount) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Thrift account with ${COLLECTION_TYPE} collection type already exists for this customer`
        });
      }

      // Check if customer has sufficient balance
      const currentBalance = parseFloat(existingThriftAccount.AMOUNT || 0);
      if (currentBalance < Number(initialAmount)) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient thrift balance for initial payment'
        });
      }

      // Create new thrift account
      const thriftAccount = await Thrift.create({
        CUST_ID,
        ACCT_NO,
        ACCT_ID,
        FIRST_NAME: existingThriftAccount.FIRST_NAME,
        LASTNAME: existingThriftAccount.LASTNAME,
        FULL_NAME: fullName,
        RELATIONSHIP_MANAGER: RELATIONSHIP_MANAGER || existingThriftAccount.RELATIONSHIP_MANAGER,
        AMOUNT: Number(initialAmount),
        ADDRESS: address || existingThriftAccount.ADDRESS ? {
          street: address || '',
          city: '',
          state: '',
          zipCode: '',
          country: 'Nigeria'
        } : null,
        COLLECTION_TYPE: COLLECTION_TYPE.toUpperCase(),
        status: 'ACTIVE',
        openingDate: openedDate,
        OPENED_DT: openedDate,
        TRANSACTION_DATE: transactionDate,
        initialAmount: Number(initialAmount),
        accountType: 'THRIFT',
        totalContributions: Number(initialAmount),
        notes: `Additional thrift account opened for customer ${fullName} with initial deposit of ${initialAmount}`,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction: t });

      // Update original thrift account balance (deduct amount)
      const newBalance = currentBalance - Number(initialAmount);
      await existingThriftAccount.update({
        AMOUNT: newBalance,
        totalWithdrawals: (parseFloat(existingThriftAccount.totalWithdrawals || 0) + Number(initialAmount)),
        updated_at: new Date()
      }, { transaction: t });

      // Create transaction record
      const transactionRecord = await Transaction.create({
        TRANSACTION_IDENTIFIER,
        EVENT_ID,
        TRAN_JOURNAL_ID,
        REFERENCE,
        TRANSACTION_ID,
        ACCT_NO: existingThriftAccount.ACCT_NO,
        ACCT_ID: existingThriftAccount.ACCT_ID,
        BU_ID: 1,
        CUST_ID,
        ACCT_NM: `${fullName} Thrift Account`,
        AMOUNT: Number(initialAmount),
        transactionDirection: 'DEBIT',
        TRANSACTIONDATE: transactionDate,
        TRANSACTION_TYPE: 'THRIFT_TRANSFER',
        description: 'Transfer to new thrift account',
        status: 'COMPLETED',
        createdBy: 'SYSTEM',
        currency: 'NGN',
        metadata: {
          fromAccount: existingThriftAccount.ACCT_NO,
          toAccount: ACCT_NO,
          amount: Number(initialAmount),
          collectionType: COLLECTION_TYPE,
          reference: REFERENCE
        },
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction: t });

      // Create transaction record for new account
      await Transaction.create({
        TRANSACTION_IDENTIFIER: TRANSACTION_IDENTIFIER + 1,
        EVENT_ID: EVENT_ID + 1,
        TRAN_JOURNAL_ID: `JRN${Date.now()}${Math.floor(Math.random() * 10000)}`,
        REFERENCE: `THRIFT_NEW_${ACCT_NO}`,
        TRANSACTION_ID: `TXN${(nextTransactionId + 1).toString().padStart(10, '0')}`,
        ACCT_NO,
        ACCT_ID,
        BU_ID: 1,
        CUST_ID,
        ACCT_NM: `${fullName} Thrift Account`,
        AMOUNT: Number(initialAmount),
        transactionDirection: 'CREDIT',
        TRANSACTIONDATE: transactionDate,
        TRANSACTION_TYPE: 'THRIFT_OPENING',
        description: 'New thrift account opening - transfer from existing account',
        status: 'COMPLETED',
        createdBy: 'SYSTEM',
        currency: 'NGN',
        metadata: {
          fromAccount: existingThriftAccount.ACCT_NO,
          toAccount: ACCT_NO,
          amount: Number(initialAmount),
          collectionType: COLLECTION_TYPE,
          reference: REFERENCE
        },
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction: t });

      await t.commit();

      logger.info(`Additional thrift account created for customer ${CUST_ID}`, {
        CUST_ID, ACCT_NO, ACCT_ID, initialAmount, COLLECTION_TYPE,
        customerName: fullName, RELATIONSHIP_MANAGER, transactionDate, openedDate,
        transactionId: TRANSACTION_IDENTIFIER, reference: REFERENCE
      });

      // Safe date conversion helper
      const safeToISOString = (dateValue) => {
        if (!dateValue) return null;
        try {
          if (dateValue instanceof Date && !isNaN(dateValue)) {
            return dateValue.toISOString();
          }
          const date = new Date(dateValue);
          if (!isNaN(date.getTime())) {
            return date.toISOString();
          }
          return null;
        } catch (error) {
          console.error('Error converting date:', error);
          return null;
        }
      };

      return res.status(201).json({
        success: true,
        message: 'Additional thrift account created successfully',
        data: {
          originalAccount: {
            ACCT_NO: existingThriftAccount.ACCT_NO,
            newBalance: newBalance,
            amountDebited: Number(initialAmount)
          },
          newThriftAccount: {
            ACCT_NO,
            ACCT_ID,
            firstName: existingThriftAccount.FIRST_NAME,
            lastName: existingThriftAccount.LASTNAME,
            fullName: fullName,
            relationshipManager: RELATIONSHIP_MANAGER || existingThriftAccount.RELATIONSHIP_MANAGER,
            amount: Number(initialAmount),
            collectionType: COLLECTION_TYPE.toUpperCase(),
            status: 'ACTIVE',
            openingDate: safeToISOString(openedDate),
            transactionDate: safeToISOString(transactionDate)
          },
          transaction: {
            id: transactionRecord.id,
            reference: REFERENCE,
            amount: Number(initialAmount),
            type: 'THRIFT_TRANSFER',
            status: 'COMPLETED',
            date: safeToISOString(transactionDate)
          },
          summary: {
            transferAmount: Number(initialAmount),
            originalAccountBalance: newBalance,
            newAccountBalance: Number(initialAmount),
            collectionFrequency: COLLECTION_TYPE
          }
        }
      });

    } catch (error) {
      if (t && !t.finished) {
        await t.rollback();
      }
      console.error('Error creating additional thrift account:', error);
      logger.error('createThriftAccountForExistingCustomer failed', { 
        error: error.message, 
        stack: error.stack,
        body: req.body,
        timestamp: new Date().toISOString()
      });
      
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Process daily collection
  // ─────────────────────────────────────────────
  static async processDailyCollection(req, res) {
    let t;
    
    try {
      await ensureModelsInitialized();
      
      t = await sequelizeInstance.transaction();
      
      const { CUST_ID, ACCT_NO, amount, debitGLAccount, creditGLAccount } = req.body;
      
      // Validate required fields
      if (!CUST_ID || !ACCT_NO || !amount) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'CUST_ID, ACCT_NO, and amount are required'
        });
      }

      // Find thrift account
      const thriftAccount = await Thrift.findOne({
        where: { 
          acct_no: ACCT_NO
        },
        transaction: t
      });

      if (!thriftAccount) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: `Thrift account not found for ACCT_NO: ${ACCT_NO}`
        });
      }

      // Verify customer ID matches
      const accountCustomerId = thriftAccount.cust_id || thriftAccount.CUST_ID;
      if (accountCustomerId !== CUST_ID) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Customer ID mismatch. Account belongs to customer: ${accountCustomerId}`
        });
      }

      // Get current balance - use uppercase column name
      const currentBalance = parseFloat(thriftAccount.AMOUNT || thriftAccount.amount || 0);
      const collectionAmount = parseFloat(amount);
      
      if (isNaN(collectionAmount) || collectionAmount <= 0) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Amount must be a positive number'
        });
      }
      
      const newBalance = currentBalance + collectionAmount;
      const currentContributions = parseFloat(thriftAccount.total_contributions || 0);
      const newContributions = currentContributions + collectionAmount;
      
      console.log('🔍 Thrift account update details:', {
        ACCT_NO,
        currentBalance,
        collectionAmount,
        newBalance,
        currentContributions,
        newContributions
      });
      
      // 1. Update thrift account balance using raw SQL to ensure column names match
      await sequelizeInstance.query(
        `UPDATE THRIFT_ACCOUNTS 
         SET 
           AMOUNT = ?,
           total_contributions = ?,
           last_collection_date = ?,
           next_collection_date = ?,
           last_transaction_date = ?,
           updated_at = ?
         WHERE acct_no = ?`,
        {
          replacements: [
            newBalance,                    // AMOUNT
            newContributions,              // total_contributions
            new Date(),                    // last_collection_date
            new Date(Date.now() + 24 * 60 * 60 * 1000), // next_collection_date
            new Date(),                    // last_transaction_date
            new Date(),                    // updated_at
            ACCT_NO                       // acct_no
          ],
          transaction: t
        }
      );

      // Verify the update
      const updatedThriftAccount = await Thrift.findOne({
        where: { acct_no: ACCT_NO },
        transaction: t
      });
      
      console.log('✅ Thrift account updated:', {
        ACCT_NO,
        previousBalance: currentBalance,
        newBalanceInDB: updatedThriftAccount?.AMOUNT || updatedThriftAccount?.amount,
        previousContributions: currentContributions,
        newContributionsInDB: updatedThriftAccount?.total_contributions
      });

      // Generate small integer identifiers
      const generateSmallIntId = () => {
        const counter = Math.floor(Math.random() * 900000) + 100000;
        return counter;
      };
      
      const baseId = generateSmallIntId();
      const transactionIdentifier = baseId;
      const eventId = baseId + 1;
      const journalId = baseId + 2;
      const reference = baseId + 3;

      // 2. Create thrift transaction record
      const transactionData = {
        TRANSACTION_IDENTIFIER: transactionIdentifier,
        EVENT_ID: eventId,
        TRAN_JOURNAL_ID: journalId,
        REFERENCE: reference,
        
        CUST_ID,
        ACCT_NO,
        ACCT_ID: thriftAccount.acct_id || thriftAccount.ACCT_ID || ACCT_NO,
        BU_ID: thriftAccount.BU_ID || 1,
        ACCT_NM: thriftAccount.acct_nm || thriftAccount.ACCT_NM || 'Thrift Account',
        AMOUNT: collectionAmount,
        TRANSACTION_TYPE: 'DEPOSIT',
        description: 'Daily thrift collection',
        status: 'COMPLETED',
        createdBy: req.user?.id || 'SYSTEM',
        TRANSACTIONDATE: new Date(),
        
        metadata: JSON.stringify({
          collectionType: 'DAILY',
          amount: collectionAmount,
          previousBalance: currentBalance,
          newBalance: newBalance,
          accountNo: ACCT_NO,
          customerId: CUST_ID,
          timestamp: new Date().toISOString(),
          debitGLAccount,
          creditGLAccount
        }),
        
        created_at: new Date(),
        updated_at: new Date()
      };

      await Transaction.create(transactionData, { transaction: t });

      // 3. Process GL transactions
      let glTransactionInfo = null;
      let glAccountBalances = null;
      
      if (debitGLAccount && creditGLAccount) {
        try {
          // Generate GL identifiers
          const glTransactionId = `THRFT-${Date.now()}`;
          const glJournalId = `JRN-${Date.now()}`;
          
          // Get GL models
          const models = sequelizeInstance.models;
          const GLAccountTransaction = models.GLAccountTransaction || models.gl_account_transactions;
          
          if (GLAccountTransaction) {
            await GLAccountTransaction.create({
              JOURNAL_ID: glJournalId,
              TRANSACTION_ID: glTransactionId,
              TransactionId: Date.now(),
              DR_ACCT_NO: debitGLAccount,
              CR_ACCT_NO: creditGLAccount,
              AMOUNT: collectionAmount,
              NARRATION: `Thrift collection from ${CUST_ID} (Account: ${ACCT_NO})`,
              CREATED_BY: req.user?.id || 'SYSTEM',
              UPDATED_BY: req.user?.id || 'SYSTEM',
              TRANSACTION_TYPE: 'THRIFT_COLLECTION',
              CURRENCY_CODE: 'NGN',
              STATUS: 'POSTED',
              createdAt: new Date(),
              updatedAt: new Date()
            }, { transaction: t });
          } else {
            // Fallback: Use raw SQL if model not available
            await sequelizeInstance.query(
              `INSERT INTO gl_account_transactions 
               (JOURNAL_ID, TRANSACTION_ID, TransactionId, DR_ACCT_NO, CR_ACCT_NO, AMOUNT, 
                NARRATION, CREATED_BY, UPDATED_BY, TRANSACTION_TYPE, CURRENCY_CODE, STATUS,
                createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              {
                replacements: [
                  glJournalId,
                  glTransactionId,
                  Date.now(),
                  debitGLAccount,
                  creditGLAccount,
                  collectionAmount,
                  `Thrift collection from ${CUST_ID} (Account: ${ACCT_NO})`,
                  req.user?.id || 'SYSTEM',
                  req.user?.id || 'SYSTEM',
                  'THRIFT_COLLECTION',
                  'NGN',
                  'POSTED'
                ],
                transaction: t
              }
            );
          }

          // Get current balances before update
          const [debitCurrent, creditCurrent] = await Promise.all([
            sequelizeInstance.query(
              `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
               FROM gl_accounts 
               WHERE g_l__a_c_c_t__n_o = ?`,
              {
                replacements: [debitGLAccount],
                type: sequelizeInstance.QueryTypes.SELECT,
                transaction: t
              }
            ),
            sequelizeInstance.query(
              `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
               FROM gl_accounts 
               WHERE g_l__a_c_c_t__n_o = ?`,
              {
                replacements: [creditGLAccount],
                type: sequelizeInstance.QueryTypes.SELECT,
                transaction: t
              }
            )
          ]);

          const debitPreviousBalance = debitCurrent[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0;
          const creditPreviousBalance = creditCurrent[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0;
          
          // Update Debit Account (Bank Cash) - ASSET increases with DEBIT
          await sequelizeInstance.query(
            `UPDATE gl_accounts 
             SET 
               c_u_r_r_e_n_t__b_a_l_a_n_c_e = c_u_r_r_e_n_t__b_a_l_a_n_c_e + ?,
               l_e_d_g_e_r__b_a_l_a_n_c_e = l_e_d_g_e_r__b_a_l_a_n_c_e + ?,
               a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e = a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e + ?,
               updated_at = NOW()
             WHERE g_l__a_c_c_t__n_o = ?`,
            {
              replacements: [
                collectionAmount,
                collectionAmount,
                collectionAmount,
                debitGLAccount
              ],
              transaction: t
            }
          );

          // Update Credit Account (Customer Deposit) - LIABILITY increases with CREDIT
          await sequelizeInstance.query(
            `UPDATE gl_accounts 
             SET 
               c_u_r_r_e_n_t__b_a_l_a_n_c_e = c_u_r_r_e_n_t__b_a_l_a_n_c_e + ?,
               l_e_d_g_e_r__b_a_l_a_n_c_e = l_e_d_g_e_r__b_a_l_a_n_c_e + ?,
               a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e = a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e + ?,
               updated_at = NOW()
             WHERE g_l__a_c_c_t__n_o = ?`,
            {
              replacements: [
                collectionAmount,
                collectionAmount,
                collectionAmount,
                creditGLAccount
              ],
              transaction: t
            }
          );

          // Get updated balances
          const [debitUpdated, creditUpdated] = await Promise.all([
            sequelizeInstance.query(
              `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
               FROM gl_accounts 
               WHERE g_l__a_c_c_t__n_o = ?`,
              {
                replacements: [debitGLAccount],
                type: sequelizeInstance.QueryTypes.SELECT,
                transaction: t
              }
            ),
            sequelizeInstance.query(
              `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
               FROM gl_accounts 
               WHERE g_l__a_c_c_t__n_o = ?`,
              {
                replacements: [creditGLAccount],
                type: sequelizeInstance.QueryTypes.SELECT,
                transaction: t
              }
            )
          ]);

          console.log('✅ GL Account Updates Verified:');
          console.log('Debit Account (Bank Cash):', {
            account: debitGLAccount,
            previous: debitPreviousBalance,
            new: debitUpdated[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e,
            change: collectionAmount
          });
          console.log('Credit Account (Customer Deposit):', {
            account: creditGLAccount,
            previous: creditPreviousBalance,
            new: creditUpdated[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e,
            change: collectionAmount
          });

          glTransactionInfo = {
            transactionId: glTransactionId,
            journalId: glJournalId,
            debitAccount: debitGLAccount,
            creditAccount: creditGLAccount,
            amount: collectionAmount,
            status: 'POSTED'
          };
          
          glAccountBalances = {
            debit: {
              account: debitGLAccount,
              previousBalance: parseFloat(debitPreviousBalance),
              newBalance: parseFloat(debitUpdated[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0),
              ledgerBalance: parseFloat(debitUpdated[0]?.l_e_d_g_e_r__b_a_l_a_n_c_e || 0),
              availableBalance: parseFloat(debitUpdated[0]?.a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e || 0),
              change: collectionAmount
            },
            credit: {
              account: creditGLAccount,
              previousBalance: parseFloat(creditPreviousBalance),
              newBalance: parseFloat(creditUpdated[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0),
              ledgerBalance: parseFloat(creditUpdated[0]?.l_e_d_g_e_r__b_a_l_a_n_c_e || 0),
              availableBalance: parseFloat(creditUpdated[0]?.a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e || 0),
              change: collectionAmount
            }
          };
          
        } catch (glError) {
          console.error('❌ GL processing error:', glError);
          console.error('GL error stack:', glError.stack);
          glTransactionInfo = {
            success: false,
            error: glError.message
          };
        }
      }

      await t.commit();

      // Prepare response
      const response = {
        success: true,
        message: 'Daily collection processed successfully',
        data: {
          thriftAccount: {
            accountNo: ACCT_NO,
            customerId: CUST_ID,
            customerName: thriftAccount.FULL_NAME || `${thriftAccount.FIRST_NAME} ${thriftAccount.LASTNAME}`,
            previousBalance: currentBalance,
            newBalance: newBalance,
            amountCollected: collectionAmount,
            totalContributions: newContributions
          },
          transaction: {
            id: transactionIdentifier,
            reference: reference,
            amount: collectionAmount
          },
          timestamp: new Date().toISOString(),
          totalContributions: newContributions,
          AMOUNT: newBalance
        }
      };
      
      // Add GL info if available
      if (glTransactionInfo) {
        response.data.glTransaction = glTransactionInfo;
        if (!glTransactionInfo.error) {
          response.message += ' with GL posting';
        } else {
          response.message += ' (GL posting failed but thrift transaction completed)';
        }
      }
      
      if (glAccountBalances) {
        response.data.glAccountBalances = glAccountBalances;
      }

      res.status(200).json(response);

    } catch (error) {
      if (t && !t.finished) await t.rollback();
      console.error('❌ Error in processDailyCollection:', error);
      console.error('Error stack:', error.stack);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Process withdrawal (PENDING APPROVAL)
  // ─────────────────────────────────────────────
  static async processWithdrawal(req, res) {
    let t;
    
    try {
      console.log('🔄 Processing withdrawal request (PENDING APPROVAL)...');
      
      await ensureModelsInitialized();
      
      t = await sequelizeInstance.transaction();
      
      const { 
        CUST_ID, 
        ACCT_NO, 
        amount, 
        FULL_NAME: providedFullName,
        TRANSACTION_DATE,
        notes = '',
        approvedBy = null // Optional: pre-approved by someone
      } = req.body;

      if (!CUST_ID || !ACCT_NO || !amount) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'CUST_ID, ACCT_NO, and amount are required'
        });
      }

      const withdrawalAmount = parseFloat(amount);
      if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Amount must be a positive number'
        });
      }

      const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();

      // Generate small integer identifiers
      const generateSmallIntId = () => {
        const counter = Math.floor(Math.random() * 900000) + 100000;
        return counter;
      };

      // Find thrift account
      const thriftAccount = await Thrift.findOne({
        where: { acct_no: ACCT_NO },
        transaction: t
      });

      if (!thriftAccount) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Thrift account not found'
        });
      }

      // Verify customer ID matches
      const accountCustomerId = thriftAccount.cust_id || thriftAccount.CUST_ID;
      if (accountCustomerId !== CUST_ID) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Customer ID mismatch. Account belongs to customer: ${accountCustomerId}`
        });
      }

      // Check if thrift account has sufficient balance - use uppercase column name
      const currentBalance = parseFloat(thriftAccount.AMOUNT || thriftAccount.amount || 0);
      if (currentBalance < withdrawalAmount) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient thrift balance for withdrawal'
        });
      }

      // DO NOT update thrift account balance yet - wait for approval
      const newBalance = currentBalance - withdrawalAmount;
      const currentWithdrawals = parseFloat(thriftAccount.total_withdrawals || 0);
      const newWithdrawals = currentWithdrawals + withdrawalAmount;

      // Compute FULL_NAME
      const fullName = providedFullName || thriftAccount.full_name || thriftAccount.FULL_NAME ||
                      `${thriftAccount.FIRST_NAME || ''} ${thriftAccount.LASTNAME || ''}`.trim();
      if (!fullName) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Full name is required for transaction'
        });
      }

      console.log('🔍 Withdrawal request details (PENDING):', {
        ACCT_NO,
        currentBalance,
        withdrawalAmount,
        requestedNewBalance: newBalance,
        currentWithdrawals,
        requestedNewWithdrawals: newWithdrawals,
        status: 'PENDING_APPROVAL'
      });

      // Get the product ID from the thrift account
      const productId = thriftAccount.product_id || thriftAccount.PRODUCT_ID;
      let savingsProduct = null;
      
      if (productId) {
        try {
          const [product] = await sequelizeInstance.query(
            `SELECT * FROM savings_products WHERE PROD_ID = ? LIMIT 1`,
            {
              replacements: [productId],
              type: sequelizeInstance.QueryTypes.SELECT,
              transaction: t
            }
          );
          
          if (product) {
            savingsProduct = product;
          }
        } catch (error) {
          console.error('Error fetching product:', error.message);
        }
      }

      // Generate transaction identifiers
      const baseId = generateSmallIntId();
      const transactionIdentifier = baseId;
      const eventId = baseId + 1;
      const journalId = baseId + 2;
      const reference = baseId + 3;

      // 1. Create withdrawal transaction record with PENDING status
      const transactionData = {
        TRANSACTION_IDENTIFIER: transactionIdentifier,
        EVENT_ID: eventId,
        TRAN_JOURNAL_ID: journalId,
        REFERENCE: reference,
        
        CUST_ID,
        ACCT_NO,
        ACCT_ID: thriftAccount.acct_id || thriftAccount.ACCT_ID || ACCT_NO,
        BU_ID: thriftAccount.BU_ID || 1,
        ACCT_NM: thriftAccount.acct_nm || thriftAccount.ACCT_NM || 'Thrift Account',
        AMOUNT: withdrawalAmount,
        TRANSACTION_TYPE: 'THRIFT_WITHDRAWAL',
        description: 'Withdrawal from thrift account - PENDING APPROVAL',
        status: 'PENDING_APPROVAL',
        approvalStatus: 'PENDING',
        createdBy: req.user?.id || 'SYSTEM',
        approvedBy: approvedBy || null,
        approvalNotes: notes,
        TRANSACTIONDATE: transactionDate,
        
        metadata: JSON.stringify({
          withdrawalType: 'WITHDRAWAL',
          amount: withdrawalAmount,
          previousBalance: currentBalance,
          requestedNewBalance: newBalance,
          accountNo: ACCT_NO,
          customerId: CUST_ID,
          customerName: fullName,
          timestamp: new Date().toISOString(),
          productId: productId,
          productName: savingsProduct?.productName || 'Thrift',
          status: 'PENDING_APPROVAL',
          notes: notes,
          createdBy: req.user?.id || 'SYSTEM',
          approvalWorkflow: {
            step: 1,
            totalSteps: 2,
            currentStatus: 'AWAITING_APPROVAL',
            nextAction: 'MANAGER_APPROVAL'
          }
        }),
        
        created_at: new Date(),
        updated_at: new Date()
      };

      const withdrawalTransaction = await Transaction.create(transactionData, { transaction: t });
      
      // 2. Create approval request record
      try {
        // Create approval request table if it doesn't exist
        await sequelizeInstance.query(`
          CREATE TABLE IF NOT EXISTS withdrawal_approvals (
            id INT AUTO_INCREMENT PRIMARY KEY,
            transaction_id VARCHAR(255) NOT NULL,
            transaction_identifier BIGINT NOT NULL,
            cust_id VARCHAR(50) NOT NULL,
            acct_no VARCHAR(50) NOT NULL,
            amount DECIMAL(15,2) NOT NULL,
            status ENUM('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED') DEFAULT 'PENDING',
            requested_by VARCHAR(100),
            requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            approved_by VARCHAR(100),
            approved_at DATETIME,
            approval_notes TEXT,
            rejection_reason TEXT,
            gl_posted BOOLEAN DEFAULT FALSE,
            account_updated BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_status (status),
            INDEX idx_transaction_id (transaction_id),
            INDEX idx_cust_id (cust_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `, { transaction: t });

        // Insert approval request
        await sequelizeInstance.query(
          `INSERT INTO withdrawal_approvals 
           (transaction_id, transaction_identifier, cust_id, acct_no, amount, status, requested_by, requested_at, approval_notes)
           VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NOW(), ?)`,
          {
            replacements: [
              transactionIdentifier.toString(),
              transactionIdentifier,
              CUST_ID,
              ACCT_NO,
              withdrawalAmount,
              req.user?.id || 'SYSTEM',
              notes
            ],
            transaction: t
          }
        );
      } catch (error) {
        console.error('Error creating approval request:', error.message);
        // Continue even if approval table fails
      }

      await t.commit();

      // Prepare response for pending withdrawal
      const response = {
        success: true,
        message: 'Withdrawal request submitted successfully. Awaiting approval.',
        data: {
          withdrawal: {
            accountNo: ACCT_NO,
            customerId: CUST_ID,
            customerName: fullName,
            currentBalance: currentBalance,
            requestedAmount: withdrawalAmount,
            status: 'PENDING_APPROVAL',
            productId: productId,
            productName: savingsProduct?.productName || 'Thrift',
            notes: notes
          },
          transaction: {
            id: transactionIdentifier,
            reference: reference,
            amount: withdrawalAmount,
            type: 'THRIFT_WITHDRAWAL',
            status: 'PENDING_APPROVAL'
          },
          approval: {
            required: true,
            status: 'PENDING',
            message: 'This withdrawal requires manager approval before processing.',
            workflow: {
              step: 1,
              totalSteps: 2,
              current: 'Submitted for approval',
              next: 'Manager review and approval'
            }
          },
          timestamp: new Date().toISOString(),
          productInfo: {
            productId: productId,
            productName: savingsProduct?.productName || 'Thrift',
            productCode: savingsProduct?.productCode || null
          },
          nextSteps: [
            'Withdrawal request submitted',
            'Awaiting manager approval',
            'Upon approval, account will be updated',
            'GL entries will be posted'
          ],
          warning: '⚠️ Account balance has NOT been updated yet. Update will occur after approval.'
        }
      };

      // Add relationship manager info if available
      if (thriftAccount.relationship_manager) {
        response.data.withdrawal.relationshipManager = thriftAccount.relationship_manager;
      }

      res.status(200).json(response);

    } catch (error) {
      if (t && !t.finished) {
        await t.rollback();
      }
      console.error('❌ Error processing withdrawal request:', error);
      console.error('Error stack:', error.stack);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Approve withdrawal
  // ─────────────────────────────────────────────
  static async approveWithdrawal(req, res) {
    let t;
    
    try {
      console.log('🔄 Processing withdrawal approval...');
      
      await ensureModelsInitialized();
      
      const { 
        transactionId,
        approvalNotes = '',
        reject = false,
        rejectionReason = ''
      } = req.body;

      if (!transactionId) {
        return res.status(400).json({
          success: false,
          message: 'Transaction ID is required'
        });
      }

      const approverId = req.user?.id || req.user?.userId || 'SYSTEM';
      const approverName = req.user?.name || req.user?.username || 'System Administrator';

      t = await sequelizeInstance.transaction();

      // 1. Get the withdrawal transaction
      let withdrawalTransaction = await Transaction.findOne({
        where: { 
          TRANSACTION_IDENTIFIER: transactionId,
          TRANSACTION_TYPE: 'THRIFT_WITHDRAWAL'
        },
        transaction: t
      });

      if (!withdrawalTransaction) {
        // Try alternative lookup by id
        withdrawalTransaction = await Transaction.findOne({
          where: { 
            id: transactionId,
            TRANSACTION_TYPE: 'THRIFT_WITHDRAWAL'
          },
          transaction: t
        });

        if (!withdrawalTransaction) {
          await t.rollback();
          return res.status(404).json({
            success: false,
            message: 'Withdrawal transaction not found'
          });
        }
      }

      // Check current status
      const currentStatus = withdrawalTransaction.status;
      console.log(`📋 Current transaction status: "${currentStatus}"`);
      
      // Allow both 'PENDING_APPROVAL' and 'PENDING' statuses
      const isPending = currentStatus && (
        currentStatus.includes('PENDING') || 
        currentStatus === 'PENDING' ||
        currentStatus === 'PENDING_APPROVAL'
      );
      
      if (!isPending) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Transaction is not pending. Current status: ${currentStatus}`
        });
      }

      const { CUST_ID, ACCT_NO, AMOUNT, metadata, REFERENCE } = withdrawalTransaction;
      const metadataObj = metadata ? (typeof metadata === 'string' ? JSON.parse(metadata) : metadata) : {};
      
      // ─────────────────────────────────────────────
      //  REJECTION HANDLING
      // ─────────────────────────────────────────────
      if (reject) {
        console.log('❌ Processing withdrawal rejection...');
        
        if (!rejectionReason || rejectionReason.trim() === '') {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: 'Rejection reason is required when rejecting a withdrawal'
          });
        }
        
        // Update transaction status
        await withdrawalTransaction.update({
          status: 'REJECTED',
          description: `Withdrawal rejected: ${rejectionReason.substring(0, 200)}`,
          metadata: JSON.stringify({
            ...metadataObj,
            status: 'REJECTED',
            rejectedBy: approverId,
            rejectedByName: approverName,
            rejectedAt: new Date().toISOString(),
            rejectionReason: rejectionReason.trim(),
            approvalNotes: approvalNotes || `Rejected: ${rejectionReason}`
          }),
          updated_at: new Date()
        }, { transaction: t });

        // Update approval table if exists
        try {
          await sequelizeInstance.query(
            `UPDATE withdrawal_approvals 
             SET status = 'REJECTED', 
                 approved_by = ?, 
                 approved_at = NOW(),
                 rejection_reason = ?,
                 approval_notes = ?,
                 updated_at = NOW()
             WHERE transaction_identifier = ?`,
            {
              replacements: [
                approverId, 
                rejectionReason.trim(), 
                approvalNotes || `Rejected: ${rejectionReason}`, 
                transactionId
              ],
              transaction: t
            }
          );
        } catch (error) {
          console.log('ℹ️ Approval table not updated (may not exist):', error.message);
        }

        await t.commit();

        return res.status(200).json({
          success: true,
          message: 'Withdrawal request rejected successfully',
          data: {
            transactionId,
            reference: REFERENCE,
            accountNo: ACCT_NO,
            customerId: CUST_ID,
            customerName: metadataObj.customerName || 'Customer',
            amount: parseFloat(AMOUNT || 0),
            status: 'REJECTED',
            rejectedBy: approverId,
            rejectedByName: approverName,
            rejectionReason: rejectionReason.trim(),
            timestamp: new Date().toISOString()
          }
        });
      }

      // ─────────────────────────────────────────────
      //  APPROVAL HANDLING
      // ─────────────────────────────────────────────
      console.log('✅ Processing withdrawal approval...');
      
      // 2. APPROVE - Get current account balance
      const thriftAccount = await Thrift.findOne({
        where: { acct_no: ACCT_NO },
        transaction: t
      });

      if (!thriftAccount) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Thrift account not found'
        });
      }

      const withdrawalAmount = parseFloat(AMOUNT);
      const currentBalance = parseFloat(thriftAccount.AMOUNT || thriftAccount.amount || 0);
      
      // Double-check sufficient balance at approval time
      if (currentBalance < withdrawalAmount) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient thrift balance for withdrawal at approval time',
          details: {
            currentBalance,
            withdrawalAmount,
            accountNo: ACCT_NO
          }
        });
      }

      const newBalance = currentBalance - withdrawalAmount;
      const currentWithdrawals = parseFloat(thriftAccount.total_withdrawals || 0);
      const newWithdrawals = currentWithdrawals + withdrawalAmount;

      // 3. Update thrift account balance
      await sequelizeInstance.query(
        `UPDATE THRIFT_ACCOUNTS 
         SET 
           AMOUNT = ?,
           total_withdrawals = ?,
           last_transaction_date = ?,
           updated_at = ?
         WHERE cust_id = ? AND acct_no = ?`,
        {
          replacements: [
            newBalance,
            newWithdrawals,
            new Date(),
            new Date(),
            CUST_ID,
            ACCT_NO
          ],
          transaction: t
        }
      );

      // 4. Update transaction status to COMPLETED
      await withdrawalTransaction.update({
        status: 'COMPLETED',
        description: 'Withdrawal from thrift account - APPROVED AND PROCESSED',
        metadata: JSON.stringify({
          ...metadataObj,
          status: 'COMPLETED',
          approvedBy: approverId,
          approvedByName: approverName,
          approvedAt: new Date().toISOString(),
          approvalNotes: approvalNotes,
          previousBalance: currentBalance,
          newBalance: newBalance,
          accountUpdated: true,
          processedAt: new Date().toISOString()
        }),
        updated_at: new Date()
      }, { transaction: t });

      // 5. Update approval table
      try {
        await sequelizeInstance.query(
          `UPDATE withdrawal_approvals 
           SET status = 'APPROVED', 
               approved_by = ?, 
               approved_at = NOW(),
               approval_notes = ?,
               account_updated = TRUE,
               updated_at = NOW()
           WHERE transaction_identifier = ?`,
          {
            replacements: [approverId, approvalNotes, transactionId],
            transaction: t
          }
        );
      } catch (error) {
        console.error('Error updating approval table:', error.message);
      }

      await t.commit();

      // Prepare response
      const customerName = metadataObj.customerName || 'Customer';
      const response = {
        success: true,
        message: 'Withdrawal approved and processed successfully',
        data: {
          withdrawal: {
            transactionId,
            reference: REFERENCE,
            accountNo: ACCT_NO,
            customerId: CUST_ID,
            customerName,
            previousBalance: currentBalance,
            newBalance: newBalance,
            amountWithdrawn: withdrawalAmount,
            totalWithdrawals: newWithdrawals,
            balanceAfter: newBalance
          },
          transaction: {
            id: transactionId,
            amount: withdrawalAmount,
            type: 'THRIFT_WITHDRAWAL',
            status: 'COMPLETED',
            approvedBy: approverId,
            approvedByName: approverName
          },
          approval: {
            approvedBy: approverId,
            approvedByName: approverName,
            approvedAt: new Date().toISOString(),
            approvalNotes: approvalNotes,
            status: 'APPROVED'
          },
          timestamp: new Date().toISOString(),
          accountUpdated: true
        }
      };

      res.status(200).json(response);

    } catch (error) {
      if (t && !t.finished) await t.rollback();
      console.error('❌ Error processing withdrawal approval:', error);
      console.error('Error stack:', error.stack);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error during withdrawal processing',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Get pending withdrawals
  // ─────────────────────────────────────────────
  static async getPendingWithdrawals(req, res) {
    try {
      await ensureModelsInitialized();
      
      const { page = 1, limit = 20, status = 'PENDING_APPROVAL' } = req.query;
      const offset = (page - 1) * limit;

      // Get pending transactions
      const { count, rows } = await Transaction.findAndCountAll({
        where: {
          TRANSACTION_TYPE: 'THRIFT_WITHDRAWAL',
          status: status
        },
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      // Format response
      const pendingWithdrawals = rows.map(transaction => {
        let metadata = {};
        try {
          metadata = transaction.metadata ? JSON.parse(transaction.metadata) : {};
        } catch (error) {
          // Ignore metadata parsing errors
        }

        return {
          transactionId: transaction.TRANSACTION_IDENTIFIER,
          reference: transaction.REFERENCE,
          custId: transaction.CUST_ID,
          acctNo: transaction.ACCT_NO,
          amount: transaction.AMOUNT,
          status: transaction.status,
          createdAt: transaction.created_at,
          requestedBy: transaction.createdBy || 'SYSTEM',
          customerName: metadata.customerName || 'Customer',
          approvalStatus: 'PENDING',
          notes: metadata.notes || ''
        };
      });

      res.status(200).json({
        success: true,
        data: {
          withdrawals: pendingWithdrawals,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            totalPages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      console.error('❌ Error fetching pending withdrawals:', error);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Get withdrawal approval details
  // ─────────────────────────────────────────────
  static async getWithdrawalApprovalDetails(req, res) {
    try {
      await ensureModelsInitialized();
      
      const { transactionId } = req.params;

      if (!transactionId) {
        return res.status(400).json({
          success: false,
          message: 'Transaction ID is required'
        });
      }

      // Get transaction
      const transaction = await Transaction.findOne({
        where: { TRANSACTION_IDENTIFIER: transactionId }
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      // Get thrift account
      const thriftAccount = await Thrift.findOne({
        where: { acct_no: transaction.ACCT_NO }
      });

      // Parse metadata safely
      let metadata = {};
      try {
        metadata = transaction.metadata ? JSON.parse(transaction.metadata) : {};
      } catch (error) {
        console.error('Error parsing transaction metadata:', error.message);
      }

      const currentBalance = parseFloat(thriftAccount?.AMOUNT || thriftAccount?.amount || 0);
      const requestedAmount = parseFloat(transaction.AMOUNT);
      const newBalance = currentBalance - requestedAmount;

      const response = {
        success: true,
        data: {
          transaction: {
            id: transaction.TRANSACTION_IDENTIFIER,
            reference: transaction.REFERENCE,
            amount: requestedAmount,
            status: transaction.status,
            createdAt: transaction.created_at,
            description: transaction.description,
            transactionType: transaction.TRANSACTION_TYPE,
            createdBy: transaction.createdBy
          },
          account: {
            acctNo: transaction.ACCT_NO,
            custId: transaction.CUST_ID,
            currentBalance: currentBalance,
            requestedAmount: requestedAmount,
            newBalanceAfter: newBalance,
            sufficientBalance: currentBalance >= requestedAmount,
            accountName: metadata.accountName || thriftAccount?.ACCT_NM || 'Thrift Account'
          },
          metadata: metadata,
          workflow: {
            currentStep: transaction.status === 'PENDING_APPROVAL' ? 1 : 2,
            totalSteps: 2,
            canApprove: transaction.status === 'PENDING_APPROVAL' && currentBalance >= requestedAmount,
            canReject: transaction.status === 'PENDING_APPROVAL',
            requiresGLPosting: transaction.status === 'PENDING_APPROVAL' && currentBalance >= requestedAmount
          },
          timestamps: {
            createdAt: transaction.created_at,
            currentTime: new Date().toISOString()
          }
        }
      };

      res.status(200).json(response);

    } catch (error) {
      console.error('❌ Error fetching withdrawal details:', error);
      console.error('Error stack:', error.stack);
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Get account summary
  // ─────────────────────────────────────────────
  static async getAccountSummary(req, res) {
    try {
      console.log('🔄 Getting account summary...');
      
      const { CUST_ID, ACCT_NO } = req.params;

      const thriftAccount = await Thrift.findOne({
        where: { CUST_ID, ACCT_NO }
      });

      if (!thriftAccount) {
        return res.status(404).json({
          success: false,
          message: 'Thrift account not found'
        });
      }

      const today = new Date();
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      const summary = {
        accountInfo: {
          CUST_ID: thriftAccount.CUST_ID,
          ACCT_NO: thriftAccount.ACCT_NO,
          ACCT_ID: thriftAccount.ACCT_ID,
          FIRST_NAME: thriftAccount.FIRST_NAME,
          LASTNAME: thriftAccount.LASTNAME,
          FULL_NAME: thriftAccount.FULL_NAME,
          RELATIONSHIP_MANAGER: thriftAccount.RELATIONSHIP_MANAGER,
          AMOUNT: thriftAccount.AMOUNT,
          COLLECTION_TYPE: thriftAccount.COLLECTION_TYPE,
          ADDRESS: thriftAccount.ADDRESS,
          status: thriftAccount.status,
          openingDate: thriftAccount.openingDate,
          lastCollectionDate: thriftAccount.lastCollectionDate,
          accountType: thriftAccount.accountType,
          totalContributions: thriftAccount.totalContributions,
          totalWithdrawals: thriftAccount.totalWithdrawals,
          nextCollectionDate: thriftAccount.nextCollectionDate
        },
        nextBankPaymentDate: lastDayOfMonth,
        availableForWithdrawal: thriftAccount.AMOUNT,
        totalContributions: thriftAccount.totalContributions,
        netContribution: thriftAccount.totalContributions - thriftAccount.totalWithdrawals,
        collectionStats: {
          daily: thriftAccount.COLLECTION_TYPE === 'DAILY',
          weekly: thriftAccount.COLLECTION_TYPE === 'WEEKLY',
          monthly: thriftAccount.COLLECTION_TYPE === 'MONTHLY',
          quarterly: thriftAccount.COLLECTION_TYPE === 'QUARTERLY'
        }
      };

      res.status(200).json({
        success: true,
        data: summary
      });

    } catch (error) {
      logger.error('Error getting account summary:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Get all thrift accounts (Admin)
  // ─────────────────────────────────────────────
  static async getAllThriftAccounts(req, res) {
    try {
      console.log('🔄 Getting all thrift accounts...');
      
      const { page = 1, limit = 10, status, relationshipManagerId } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      if (status) where.status = status;
      if (relationshipManagerId) where.RELATIONSHIP_MANAGER = relationshipManagerId;

      const { count, rows: thriftAccounts } = await Thrift.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: {
          thriftAccounts: thriftAccounts.map(account => ({
            CUST_ID: account.CUST_ID,
            ACCT_NO: account.ACCT_NO,
            ACCT_ID: account.ACCT_ID,
            FIRST_NAME: account.FIRST_NAME,
            LASTNAME: account.LASTNAME,
            FULL_NAME: account.FULL_NAME,
            RELATIONSHIP_MANAGER: account.RELATIONSHIP_MANAGER,
            AMOUNT: account.AMOUNT,
            COLLECTION_TYPE: account.COLLECTION_TYPE,
            ADDRESS: account.ADDRESS,
            status: account.status,
            openingDate: account.openingDate,
            lastCollectionDate: account.lastCollectionDate,
            accountType: account.accountType,
            TRANSACTION_DATE: account.TRANSACTION_DATE,
            nextCollectionDate: account.nextCollectionDate,
            totalContributions: account.totalContributions,
            totalWithdrawals: account.totalWithdrawals,
            created_at: account.created_at
          })),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            pages: Math.ceil(count / limit)
          },
          summary: {
            totalAccounts: count,
            totalBalance: thriftAccounts.reduce((sum, acc) => sum + parseFloat(acc.AMOUNT || 0), 0),
            activeAccounts: thriftAccounts.filter(acc => acc.status === 'ACTIVE').length
          }
        }
      });

    } catch (error) {
      logger.error('Error getting all thrift accounts:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Get transaction history for a thrift account
  // ─────────────────────────────────────────────
  static async getTransactionHistory(req, res) {
    try {
      console.log('🔄 Getting transaction history...');
      
      const { CUST_ID, ACCT_NO } = req.params;
      const { page = 1, limit = 10, fromDate, toDate, type } = req.query;
      const offset = (page - 1) * limit;

      if (!CUST_ID && !ACCT_NO) {
        return res.status(400).json({
          success: false,
          message: 'Either CUST_ID or ACCT_NO is required'
        });
      }

      const where = {};
      if (CUST_ID) where.CUST_ID = CUST_ID;
      if (ACCT_NO) where.ACCT_NO = ACCT_NO;
      if (type) where.TRANSACTION_TYPE = type;

      if (fromDate) {
        where.TRANSACTION_DATE = { [Op.gte]: new Date(fromDate) };
      }
      if (toDate) {
        where.TRANSACTION_DATE = where.TRANSACTION_DATE || {};
        where.TRANSACTION_DATE[Op.lte] = new Date(toDate);
      }

      const { count, rows: transactions } = await Transaction.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['TRANSACTIONDATE', 'DESC']]
      });

      const enrichedTransactions = transactions.map(txn => ({
        id: txn.id,
        CUST_ID: txn.CUST_ID,
        ACCT_NO: txn.ACCT_NO,
        ACCT_ID: txn.ACCT_ID,
        TRANSACTION_TYPE: txn.TRANSACTION_TYPE,
        AMOUNT: parseFloat(txn.AMOUNT || 0),
        description: txn.description,
        status: txn.status,
        TRANSACTIONDATE: txn.TRANSACTIONDATE,
        formattedDate: new Date(txn.TRANSACTIONDATE).toLocaleDateString(),
        formattedAmount: parseFloat(txn.AMOUNT || 0).toLocaleString(),
        metadata: txn.metadata
      }));

      res.status(200).json({
        success: true,
        data: {
          transactions: enrichedTransactions,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            pages: Math.ceil(count / limit)
          },
          filters: {
            fromDate,
            toDate,
            type
          },
          summary: {
            totalTransactions: count,
            totalAmount: transactions.reduce((sum, txn) => sum + parseFloat(txn.AMOUNT || 0), 0)
          }
        }
      });

    } catch (error) {
      logger.error('Error getting transaction history:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Search thrift accounts by customer name
  // ─────────────────────────────────────────────
  static async searchThriftAccountsByName(req, res) {
    try {
      await ensureModelsInitialized();
      
      const { searchTerm, page = 1, limit = 20 } = req.query;
      
      if (!searchTerm || searchTerm.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Search term is required'
        });
      }
      
      const searchQuery = searchTerm.trim();
      const offset = (page - 1) * limit;
      
      // Search directly in thrift accounts
      const { count, rows: thriftAccounts } = await Thrift.findAndCountAll({
        where: {
          [Op.or]: [
            { ACCT_NO: { [Op.like]: `%${searchQuery}%` } },
            { FIRST_NAME: { [Op.like]: `%${searchQuery}%` } },
            { LASTNAME: { [Op.like]: `%${searchQuery}%` } },
            { FULL_NAME: { [Op.like]: `%${searchQuery}%` } },
            { CUST_ID: { [Op.like]: `%${searchQuery}%` } }
          ]
        },
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['FULL_NAME', 'ASC']]
      });
      
      const formattedAccounts = thriftAccounts.map(account => ({
        CUST_ID: account.CUST_ID,
        ACCT_NO: account.ACCT_NO,
        ACCT_ID: account.ACCT_ID,
        firstName: account.FIRST_NAME,
        lastName: account.LASTNAME,
        fullName: account.FULL_NAME,
        relationshipManager: account.RELATIONSHIP_MANAGER || null,
        amount: parseFloat(account.AMOUNT || 0),
        collectionType: account.COLLECTION_TYPE,
        status: account.status,
        openingDate: account.OPENED_DT ? 
          (typeof account.OPENED_DT.toISOString === 'function' 
            ? account.OPENED_DT.toISOString() 
            : new Date(account.OPENED_DT).toISOString()) 
          : null,
        nextCollectionDate: account.nextCollectionDate ? 
          (typeof account.nextCollectionDate.toISOString === 'function' 
            ? account.nextCollectionDate.toISOString() 
            : new Date(account.nextCollectionDate).toISOString()) 
          : null,
        totalContributions: parseFloat(account.totalContributions || 0),
        totalWithdrawals: parseFloat(account.totalWithdrawals || 0),
        isActive: account.isActive
      }));
      
      return res.status(200).json({
        success: true,
        message: 'Search completed successfully',
        data: {
          thriftAccounts: formattedAccounts,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            pages: Math.ceil(count / limit),
            hasMore: (offset + thriftAccounts.length) < count
          },
          search: {
            term: searchQuery,
            totalResults: count,
            resultsInPage: thriftAccounts.length
          }
        }
      });
      
    } catch (error) {
      console.error('Error searching thrift accounts:', error);
      logger.error('searchThriftAccountsByName failed', { 
        error: error.message, 
        stack: error.stack,
        query: req.query,
        timestamp: new Date().toISOString()
      });
      
      return res.status(500).json({
        success: false,
        message: 'Error searching thrift accounts',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Add this method to your ThriftController class in src/controllers/ThriftController.js

// ─────────────────────────────────────────────
//  Search customers by name in thrift accounts
// ─────────────────────────────────────────────
static async searchCustomersByName(req, res) {
  try {
    await ensureModelsInitialized();
    
    const { searchTerm, page = 1, limit = 20 } = req.query;
    
    if (!searchTerm || searchTerm.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }
    
    const searchQuery = searchTerm.trim();
    const offset = (page - 1) * limit;
    
    // Search for customers in thrift accounts
    const { count, rows: customers } = await Thrift.findAndCountAll({
      where: {
        [Op.or]: [
          { FIRST_NAME: { [Op.like]: `%${searchQuery}%` } },
          { LASTNAME: { [Op.like]: `%${searchQuery}%` } },
          { FULL_NAME: { [Op.like]: `%${searchQuery}%` } },
          { CUST_ID: { [Op.like]: `%${searchQuery}%` } }
        ]
      },
      attributes: [
        'CUST_ID',
        'CUST_NO',
        'FIRST_NAME',
        'LASTNAME',
        'FULL_NAME',
        'PHONE_NO',
        'ADDRESS',
        'status',
        'OPENED_DT',
        'created_at'
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['FULL_NAME', 'ASC']],
      group: ['CUST_ID'] // Get unique customers
    });
    
    // Get thrift accounts for each customer
    const customersWithAccounts = await Promise.all(
      customers.map(async (customer) => {
        const thriftAccounts = await Thrift.findAll({
          where: { CUST_ID: customer.CUST_ID },
          attributes: [
            'ACCT_NO',
            'ACCT_ID',
            'AMOUNT',
            'COLLECTION_TYPE',
            'status',
            'OPENED_DT',
            'nextCollectionDate',
            'totalContributions',
            'totalWithdrawals'
          ],
          order: [['OPENED_DT', 'DESC']]
        });
        
        return {
          customer: {
            CUST_ID: customer.CUST_ID,
            CUST_NO: customer.CUST_NO,
            firstName: customer.FIRST_NAME,
            lastName: customer.LASTNAME,
            fullName: customer.FULL_NAME,
            phone: customer.PHONE_NO || null,
            address: customer.ADDRESS ? 
              (typeof customer.ADDRESS === 'string' ? JSON.parse(customer.ADDRESS) : customer.ADDRESS) : null,
            status: customer.status,
            openedDate: customer.OPENED_DT ? 
              (typeof customer.OPENED_DT.toISOString === 'function' 
                ? customer.OPENED_DT.toISOString() 
                : new Date(customer.OPENED_DT).toISOString()) 
              : null,
            createdAt: customer.created_at
          },
          thriftAccounts: thriftAccounts.map(account => ({
            accountNumber: account.ACCT_NO,
            accountId: account.ACCT_ID,
            balance: parseFloat(account.AMOUNT || 0),
            collectionType: account.COLLECTION_TYPE,
            status: account.status,
            openedDate: account.OPENED_DT ? 
              (typeof account.OPENED_DT.toISOString === 'function' 
                ? account.OPENED_DT.toISOString() 
                : new Date(account.OPENED_DT).toISOString()) 
              : null,
            nextCollectionDate: account.nextCollectionDate ? 
              (typeof account.nextCollectionDate.toISOString === 'function' 
                ? account.nextCollectionDate.toISOString() 
                : new Date(account.nextCollectionDate).toISOString()) 
              : null,
            totalContributions: parseFloat(account.totalContributions || 0),
            totalWithdrawals: parseFloat(account.totalWithdrawals || 0)
          })),
          summary: {
            totalThriftAccounts: thriftAccounts.length,
            totalThriftBalance: thriftAccounts.reduce((sum, acc) => sum + parseFloat(acc.AMOUNT || 0), 0),
            activeThriftAccounts: thriftAccounts.filter(acc => acc.status === 'ACTIVE').length
          }
        };
      })
    );
    
    return res.status(200).json({
      success: true,
      message: 'Customers searched successfully',
      data: {
        customers: customersWithAccounts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count.length || count, // Handle when count is array from group by
          pages: Math.ceil((count.length || count) / limit),
          hasMore: (offset + customers.length) < (count.length || count)
        },
        search: {
          term: searchQuery,
          totalResults: count.length || count,
          resultsInPage: customers.length
        }
      }
    });
    
  } catch (error) {
    console.error('Error searching customers:', error);
    logger.error('searchCustomersByName failed', { 
      error: error.message, 
      stack: error.stack,
      query: req.query,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({
      success: false,
      message: 'Error searching customers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

  // ─────────────────────────────────────────────
  //  Quick search for thrift collection
  // ─────────────────────────────────────────────
  static async quickSearchForCollection(req, res) {
    try {
      await ensureModelsInitialized();
      
      const { searchTerm } = req.query;
      
      if (!searchTerm || searchTerm.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Search term is required'
        });
      }
      
      const searchQuery = searchTerm.trim();
      
      // Search for active thrift accounts
      const thriftAccounts = await Thrift.findAll({
        where: {
          status: 'ACTIVE',
          [Op.or]: [
            { ACCT_NO: { [Op.like]: `%${searchQuery}%` } },
            { FIRST_NAME: { [Op.like]: `%${searchQuery}%` } },
            { LASTNAME: { [Op.like]: `%${searchQuery}%` } },
            { FULL_NAME: { [Op.like]: `%${searchQuery}%` } }
          ]
        },
        limit: 10,
        order: [['FULL_NAME', 'ASC']]
      });
      
      const formattedResults = thriftAccounts.map(account => ({
        CUST_ID: account.CUST_ID,
        ACCT_NO: account.ACCT_NO,
        ACCT_ID: account.ACCT_ID,
        customerName: account.FULL_NAME,
        firstName: account.FIRST_NAME,
        lastName: account.LASTNAME,
        currentBalance: parseFloat(account.AMOUNT || 0),
        collectionType: account.COLLECTION_TYPE,
        nextCollectionDate: account.nextCollectionDate ? 
          (typeof account.nextCollectionDate.toISOString === 'function' 
            ? account.nextCollectionDate.toISOString() 
            : new Date(account.nextCollectionDate).toISOString()) 
          : null,
        relationshipManager: account.RELATIONSHIP_MANAGER || null
      }));
      
      return res.status(200).json({
        success: true,
        message: 'Quick search completed',
        data: {
          results: formattedResults,
          count: formattedResults.length,
          searchTerm: searchQuery
        }
      });
      
    } catch (error) {
      console.error('Error in quick search:', error);
      return res.status(500).json({
        success: false,
        message: 'Error performing quick search',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Helper methods (keep these as is)
  static isLastWeekOfMonth(date) {
    const nextWeek = new Date(date);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.getMonth() !== date.getMonth();
  }

  static async isFirstMonthlyPayment(ACCT_NO) {
    const count = await Transaction.count({
      where: {
        ACCT_NO,
        TRANSACTION_TYPE: 'THRIFT_COLLECTION',
        metadata: { collectionType: 'MONTHLY' }
      }
    });
    return count === 0;
  }

  static isQuarterEnd(date) {
    const month = date.getMonth();
    const quarterEndMonths = [2, 5, 8, 11];
    return quarterEndMonths.includes(month);
  }

  static isYearEnd(date) {
    return date.getMonth() === 11;
  }

  static getQuarter(date) {
    const month = date.getMonth();
    return Math.floor(month / 3) + 1;
  }

  static getBankPaymentType(isFirstPayment, isQuarterEnd, isYearEnd) {
    if (isFirstPayment) return 'FIRST_PAYMENT';
    if (isYearEnd) return 'ANNUAL_PAYMENT';
    if (isQuarterEnd) return 'QUARTERLY_PAYMENT';
    return 'REGULAR_PAYMENT';
  }

  static getNextMonthlyPaymentDate(currentDate) {
    const nextPayment = new Date(currentDate);
    nextPayment.setMonth(nextPayment.getMonth() + 1);
    nextPayment.setDate(1);
    return nextPayment;
  }

  static async calculateExpectedMonthlyAmount(ACCT_NO) {
    return 5000; // Default value
  }
}

export default ThriftController;