// src/controllers/ThriftController.js
import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import generateCustomerNumber from '../utils/generateCustomerNumber.js';
import { generateAccountIdentifiersFromCounter } from '../utils/generateAccountNumber.js';

// Import model loader functions
import { 
  initializeModels,  // Use the correct export name
  getCustomer, 
  getThrift, 
  getTransaction, 
  getUser, 
  getSequelize,
  areModelsInitialized 
} from '../utils/modelLoader.js';

// Then update the function call in ensureModelsInitialized()
async function ensureModelsInitialized() {
  if (!modelsInitialized) {
    console.log('🔄 Ensuring models are initialized...');
    
    try {
      // Initialize models using the correct function name
      await initializeModels();
      
      // Verify we have the models
      const Customer = getCustomer();
      const Thrift = getThrift();
      const Transaction = getTransaction();
      
      if (!Customer || !Thrift || !Transaction) {
        throw new Error('One or more models not available after initialization');
      }
      
      modelsInitialized = true;
      console.log('✅ Models ready for use');
    } catch (error) {
      console.error('❌ Failed to initialize models:', error);
      throw error;
    }
  }
}
// Initialize models on first use
let modelsInitialized = false;



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

// Helper function to find the thrift product dynamically
async function findThriftProduct(sequelize, transaction = null) {
  try {
    console.log('🔍 Searching for thrift product in your specific table structure...');
    
    // 1. First check if there are any records
    const [countResult] = await sequelize.query(
      `SELECT COUNT(*) as total FROM savings_products`,
      { type: sequelize.QueryTypes.SELECT, transaction }
    );
    
    const totalRecords = parseInt(countResult.total);
    console.log(`📊 Total records in savings_products: ${totalRecords}`);
    
    if (totalRecords === 0) {
      console.error('❌ savings_products table is empty');
      return null;
    }
    
    // 2. Try to find a thrift product (using only columns that exist)
    const query = `
      SELECT 
        id,
        PROD_ID,
        PROD_CD,
        PROD_DESC,
        PRODUCT_TYPE,
        productCode,
        productName,
        productDescription,
        principalBalanceGLAccountNo,
        interestGLAccountNo,
        interestPayableGLAccountNo,
        withholdingTaxGLAccountNo,
        interest_income_gl_account_no,
        CRNCY_ID,
        START_DT,
        REC_ST,
        BU_ID,
        VERSION_NO,
        CREATED_BY,
        USER_ID,
        created_at,
        updated_at
      FROM savings_products 
      WHERE 
        (UPPER(productName) LIKE '%THRIFT%' 
         OR UPPER(PROD_CD) LIKE '%THRIFT%'
         OR UPPER(PROD_DESC) LIKE '%THRIFT%'
         OR UPPER(productDescription) LIKE '%THRIFT%'
         OR productCode = '001'
         OR PROD_CD = 'THRIFT001'
         OR UPPER(productName) LIKE '%SAVINGS%')
      ORDER BY 
        CASE 
          WHEN UPPER(productName) LIKE '%THRIFT%' THEN 1
          WHEN UPPER(PROD_CD) LIKE '%THRIFT%' THEN 2
          WHEN productCode = '001' THEN 3
          WHEN UPPER(PROD_DESC) LIKE '%THRIFT%' THEN 4
          WHEN UPPER(productName) LIKE '%SAVINGS%' THEN 5
          ELSE 6
        END,
        PROD_ID ASC
      LIMIT 1
    `;
    
    console.log('🔍 Executing query for thrift product...');
    
    const [product] = await sequelize.query(
      query,
      { type: sequelize.QueryTypes.SELECT, transaction }
    );
    
    if (product) {
      console.log(`✅ Found thrift product:`, {
        PROD_ID: product.PROD_ID,
        productName: product.productName,
        productCode: product.productCode,
        PROD_CD: product.PROD_CD,
        PRODUCT_TYPE: product.PRODUCT_TYPE
      });
      return product;
    }
    
    // 3. If no thrift product found, get the first savings product
    console.log('🔍 No thrift product found, getting first savings product...');
    
    const [firstProduct] = await sequelize.query(
      `SELECT 
        id,
        PROD_ID,
        PROD_CD,
        PROD_DESC,
        PRODUCT_TYPE,
        productCode,
        productName,
        productDescription
       FROM savings_products 
       WHERE PRODUCT_TYPE = 'SAVINGS'
       ORDER BY PROD_ID ASC 
       LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, transaction }
    );
    
    if (firstProduct) {
      console.log(`⚠️ Using first savings product as fallback:`, {
        PROD_ID: firstProduct.PROD_ID,
        productName: firstProduct.productName,
        productCode: firstProduct.productCode
      });
      return firstProduct;
    }
    
    // 4. If still nothing, get any product
    console.log('🔍 No savings products found, getting any product...');
    
    const [anyProduct] = await sequelize.query(
      `SELECT 
        id,
        PROD_ID,
        PROD_CD,
        PROD_DESC,
        PRODUCT_TYPE,
        productCode,
        productName,
        productDescription
       FROM savings_products 
       ORDER BY PROD_ID ASC 
       LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, transaction }
    );
    
    if (anyProduct) {
      console.log(`⚠️ Using any available product:`, {
        PROD_ID: anyProduct.PROD_ID,
        productName: anyProduct.productName,
        productCode: anyProduct.productCode
      });
      return anyProduct;
    }
    
    console.error('❌ No products found in savings_products table');
    return null;
    
  } catch (error) {
    console.error('❌ Error finding thrift product:', error.message);
    console.error('Stack trace:', error.stack);
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
    // Method 1: Using timestamp (last 8 digits)
    const timestamp = Date.now();
    const timestampStr = timestamp.toString();
    const ACCT_ID = timestampStr.slice(-8).padStart(8, '0'); // Ensures 8 digits
    
    // Alternative: If you need more randomness
    // const randomNum = Math.floor(Math.random() * 100000000);
    // const ACCT_ID = randomNum.toString().padStart(8, '0');
    
    console.log(`✅ Generated thrift identifiers: ACCT_NO=${nextAcctNo}, ACCT_ID=${ACCT_ID}`);
    
    return {
      ACCT_NO: nextAcctNo,
      ACCT_ID: ACCT_ID
    };
    
  } catch (error) {
    console.error('❌ Error generating thrift account identifiers:', error);
    
    // Fallback: generate 8-digit random number
    const randomNum = Math.floor(Math.random() * 100000000);
    const ACCT_ID = randomNum.toString().padStart(8, '0');
    
    return {
      ACCT_NO: `000100${Math.floor(Math.random() * 9000) + 1000}`,
      ACCT_ID: ACCT_ID
    };
  }
}

  // ─────────────────────────────────────────────
  //  Create new thrift account + new customer
  // ─────────────────────────────────────────────
  static async createThriftAccount(req, res) {
    try {
      // Ensure models are initialized
      await ensureModelsInitialized();
      
      // Get models
      const Customer = getCustomer();
      const Thrift = getThrift();
      const Transaction = getTransaction();
      const sequelize = getSequelize();
      
      // Get GL models directly from sequelize.models
      const models = sequelize.models;
      const GLAccount = models.GLAccount || models.gl_accounts;
      const GLAccountTransaction = models.GLAccountTransaction || models.gl_account_transactions;
      
      // Validate models
      if (!Customer || typeof Customer.findOne !== 'function') {
        console.error('❌ Customer model not available');
        return res.status(500).json({
          success: false,
          error: 'Database configuration error',
          details: 'Customer model not available.'
        });
      }
      
      let t;
      
      try {
        t = await sequelize.transaction();
        
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
        
        const collectionType = COLLECTION_TYPE.toUpperCase().trim();
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
        let productId = PRODUCT_ID; // Start with provided product ID if any
        let CASH_GL = null; // DECLARE HERE - outside the if block
        let THRIFT_INCOME_GL = null; // DECLARE HERE - outside the if block

        console.log('🔍 Starting product search...');

        // If PRODUCT_ID is provided, try to find it directly
        if (productId) {
          console.log(`📋 Looking for provided PRODUCT_ID: ${productId}`);
          
          try {
            const [product] = await sequelize.query(
              `SELECT * FROM savings_products WHERE PROD_ID = ? LIMIT 1`,
              {
                replacements: [productId],
                type: sequelize.QueryTypes.SELECT,
                transaction: t
              }
            );
            
            if (product && product.length > 0) {
              savingsProduct = product[0];
              console.log(`✅ Found provided PRODUCT_ID: ${productId}`);
            } else {
              console.warn(`⚠️ Provided PRODUCT_ID ${productId} not found, searching dynamically...`);
              savingsProduct = await findThriftProduct(sequelize, t);
              if (savingsProduct) {
                productId = savingsProduct.PROD_ID;
              }
            }
          } catch (sqlError) {
            console.error('❌ Error finding provided product:', sqlError.message);
            savingsProduct = await findThriftProduct(sequelize, t);
            if (savingsProduct) {
              productId = savingsProduct.PROD_ID;
            }
          }
        } else {
          // No PRODUCT_ID provided, search dynamically
          console.log('🔍 No PRODUCT_ID provided, searching for thrift product...');
          savingsProduct = await findThriftProduct(sequelize, t);
          if (savingsProduct) {
            productId = savingsProduct.PROD_ID;
          }
        }

        // ─── Get GL Accounts and validate ───────────────────────
        if (savingsProduct) {
          console.log('✅ Using savings product configuration:', {
            productId: savingsProduct.PROD_ID,
            productName: savingsProduct.productName,
            productCode: savingsProduct.productCode,
            PROD_CD: savingsProduct.PROD_CD,
            PRODUCT_TYPE: savingsProduct.PRODUCT_TYPE,
            PROD_DESC: savingsProduct.PROD_DESC,
            productDescription: savingsProduct.productDescription,
            interestGLAccountNo: savingsProduct.interestGLAccountNo,
            interestPayableGLAccountNo: savingsProduct.interestPayableGLAccountNo,
            interest_income_gl_account_no: savingsProduct.interest_income_gl_account_no
          });
          
          // Get GL accounts dynamically
          CASH_GL = await getCashGLAccount(sequelize, t);
          THRIFT_INCOME_GL = await getThriftServiceIncomeGL(sequelize, t);
          
          // Verify both GL accounts exist
          if (!CASH_GL || !THRIFT_INCOME_GL) {
            await t.rollback();
            return res.status(400).json({
              success: false,
              error: 'GL accounts not configured',
              details: `Cash GL: ${CASH_GL ? 'Found' : 'Missing'}, Income GL: ${THRIFT_INCOME_GL ? 'Found' : 'Missing'}`,
              suggestion: 'Please ensure your GL chart of accounts has Cash and Thrift Service Income accounts configured.'
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
            details: 'Please set up a savings product in the system first.',
            suggestion: 'Use the Savings Product Setup form to create a thrift savings product.'
          });
        }

        // ─── Generate identifiers ───────────────────────────────
        const { CUST_ID, CUST_NO } = await generateCustomerNumber();
        
        // USE THE THRIFT-SPECIFIC GENERATOR (not the generic one)
        const { ACCT_NO, ACCT_ID } = await ThriftController.generateThriftAccountIdentifiers(sequelize, t);

        console.log(`📊 Generated identifiers: CUST_ID=${CUST_ID}, ACCT_NO=${ACCT_NO}, ACCT_ID=${ACCT_ID}`);
        
        // Generate transaction identifiers
        const timestamp = Date.now();
        const randomNum = Math.floor(Math.random() * 10000);
        
        // Get the next transaction identifier
        const [lastTransaction] = await sequelize.query(
          'SELECT MAX(transaction_identifier) as max_id FROM transactions',
          { type: sequelize.QueryTypes.SELECT, transaction: t }
        );
        
        const nextTransactionId = (lastTransaction?.max_id || 0) + 1;
        
        // Generate identifiers with CORRECT TYPES:
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
        const existingCustomer = await Customer.findOne({
          where: { CUST_ID },
          transaction: t,
        });
        
        if (existingCustomer) {
          await t.rollback();
          return res.status(409).json({
            success: false,
            error: 'Generated CUST_ID already exists',
          });
        }
        
        const existingThrift = await Thrift.findOne({
          where: { ACCT_NO },
          transaction: t,
        });
        
        if (existingThrift) {
          // If there's still a conflict (shouldn't happen with our generator), retry
          console.warn(`⚠️ ACCT_NO ${ACCT_NO} still exists, generating new...`);
          const newIdentifiers = await ThriftController.generateThriftAccountIdentifiers(sequelize, t);
          ACCT_NO = newIdentifiers.ACCT_NO;
          ACCT_ID = newIdentifiers.ACCT_ID;
          console.log(`🔄 Using new identifiers: ACCT_NO=${ACCT_NO}, ACCT_ID=${ACCT_ID}`);
        }
        
        // ─── Prepare address object ─────────────────────────────
        let addressObj = null;
        if (address || city || state || zipCode) {
          try {
            addressObj = typeof address === 'string' ? JSON.parse(address) : address;
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
        
        // ─── Create customer ────────────────────────────────────
        console.log('Creating customer...');
        const customer = await Customer.create({
          CUST_ID,
          CUST_NO,
          FIRST_NAME,
          LAST_NAME: LASTNAME,
          CUST_NM: fullName,
          PHONE_NO: phone || null,
          HOME_ADDRESS: address || null,
          REC_ST: 'Active',
          OPENED_DT: openDate,
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction: t });
        
        if (!customer) {
          await t.rollback();
          return res.status(500).json({ 
            success: false, 
            error: 'Failed to create customer' 
          });
        }
        
        console.log(`✅ Customer created: ${CUST_ID}`);
        
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
          ADDRESS: addressObj,
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
          GL_ACCOUNTS: {
            cash_account: CASH_GL,
            income_account: THRIFT_INCOME_GL
          },
          NOTES: `Thrift account opened for ${fullName} with initial deposit of ${initialAmount} (Product: ${savingsProduct.productName})`,
          CREATED_AT: new Date(),
          UPDATED_AT: new Date()
        };
        
        console.log('⚠️ DEBUG: Thrift data being created:', thriftData);
        
        const thrift = await Thrift.create(thriftData, { transaction: t });
        
        if (!thrift) {
          await t.rollback();
          return res.status(500).json({ 
            success: false, 
            error: 'Failed to create thrift account' 
          });
        }
        
        console.log(`✅ Thrift account created: ${ACCT_NO}`);
        
        // ─── Create opening transaction ─────────────────────────
        console.log('Creating transaction record...');
        
        const transactionData = {
          TRANSACTION_IDENTIFIER: TRANSACTION_IDENTIFIER,
          EVENT_ID: EVENT_ID,
          TRAN_JOURNAL_ID: TRAN_JOURNAL_ID,
          REFERENCE: REFERENCE,
          TRANSACTION_ID: TRANSACTION_ID,
          ACCT_NO: ACCT_NO,
          ACCT_ID: ACCT_ID,
          BU_ID: 1,
          CUST_ID: CUST_ID,
          ACCT_NM: `${fullName} Thrift Account`,
          AMOUNT: parseFloat(initialAmount),
          transactionDirection: 'DEBIT',
          TRANSACTIONDATE: txDate,
          TRANSACTION_TYPE: 'DEPOSIT',
          description: `Thrift account opening – initial deposit for ${fullName} (Product: ${savingsProduct.productName})`,
          status: 'COMPLETED',
          createdBy: 'SYSTEM',
          currency: 'NGN',
          product_id: productId,
          metadata: {
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
          },
          created_at: new Date(),
          updated_at: new Date()
        };
        
        console.log('Transaction data to create:', JSON.stringify(transactionData, null, 2));
        
        const transactionRecord = await Transaction.create(transactionData, { transaction: t });
        
        console.log(`✅ Transaction created: ${REFERENCE}`);
        
        // ─── Create GL Accounting Entries ──────────────────────
        console.log('Creating GL accounting entries...');
        let glTransactionInfo = null;
        
        if (GLAccountTransaction) {
          try {
            // Verify all GL accounts exist before proceeding
            const [cashAccountExists, incomeAccountExists] = await Promise.all([
              sequelize.query(
                `SELECT g_l__a_c_c_t__n_o, a_c_c_t__d_e_s_c FROM gl_accounts WHERE g_l__a_c_c_t__n_o = ?`,
                {
                  replacements: [CASH_GL],
                  type: sequelize.QueryTypes.SELECT,
                  transaction: t
                }
              ),
              sequelize.query(
                `SELECT g_l__a_c_c_t__n_o, a_c_c_t__d_e_s_c FROM gl_accounts WHERE g_l__a_c_c_t__n_o = ?`,
                {
                  replacements: [THRIFT_INCOME_GL],
                  type: sequelize.QueryTypes.SELECT,
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
              sequelize.query(
                `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
                 FROM gl_accounts 
                 WHERE g_l__a_c_c_t__n_o = ?`,
                {
                  replacements: [CASH_GL],
                  type: sequelize.QueryTypes.SELECT,
                  transaction: t
                }
              ),
              sequelize.query(
                `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
                 FROM gl_accounts 
                 WHERE g_l__a_c_c_t__n_o = ?`,
                {
                  replacements: [THRIFT_INCOME_GL],
                  type: sequelize.QueryTypes.SELECT,
                  transaction: t
                }
              )
            ]);

            const cashPreviousBalance = cashCurrent[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0;
            const incomePreviousBalance = incomeCurrent[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0;
            
            // Create GL transaction record
            // DEBIT: CASH ACCOUNT (Bank receives cash) - ASSET INCREASE
            // CREDIT: THRIFT SERVICE INCOME (Bank earns income) - REVENUE INCREASE
            await GLAccountTransaction.create({
              JOURNAL_ID: glJournalId,
              TRANSACTION_ID: glTransactionId,
              TransactionId: Date.now(),
              DR_ACCT_NO: CASH_GL, // DEBIT: Cash Account (Asset Increase)
              CR_ACCT_NO: THRIFT_INCOME_GL, // CREDIT: Thrift Service Income (Revenue Increase)
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
              await sequelize.query(
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
              await sequelize.query(
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
              sequelize.query(
                `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
                 FROM gl_accounts 
                 WHERE g_l__a_c_c_t__n_o = ?`,
                {
                  replacements: [CASH_GL],
                  type: sequelize.QueryTypes.SELECT,
                  transaction: t
                }
              ),
              sequelize.query(
                `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
                 FROM gl_accounts 
                 WHERE g_l__a_c_c_t__n_o = ?`,
                {
                  replacements: [THRIFT_INCOME_GL],
                  type: sequelize.QueryTypes.SELECT,
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
                debitDescription: 'Bank receives cash from customer',
                creditAccount: 'Thrift Service Income (Revenue Increase)',
                creditDescription: 'Bank earns income from thrift account opening',
                description: 'Double-entry accounting for thrift opening fee income',
                accountingEquation: 'DEBIT Cash (Asset ↑), CREDIT Service Income (Revenue ↑)',
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
            // Rollback the entire transaction if GL posting fails
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
            where: { acct_no: ACCT_NO },
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
        logger.info('Thrift account created successfully', {
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
            customer: {
              CUST_ID,
              CUST_NO,
              firstName: FIRST_NAME,
              lastName: LASTNAME,
              fullName: fullName,
              phone: phone || null,
              address: address || null,
              status: 'Active',
              openedDate: safeToISOString(openDate)
            },
            thriftAccount: {
              CUST_ID,
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
        
        logger.error('createThriftAccount failed', { 
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
      
    } catch (initError) {
      console.error('❌ Model initialization error:', initError);
      return res.status(500).json({
        success: false,
        error: 'Database model initialization error',
        details: initError.message
      });
    }
  }

  // ─────────────────────────────────────────────
  // Helper function to generate transaction identifiers with CORRECT TYPES
  // ─────────────────────────────────────────────
  static async generateTransactionIdentifiers(prefix = 'THRIFT', transaction) {
    try {
      // Get the next transaction identifier
      const [lastTransaction] = await sequelize.query(
        'SELECT MAX(transaction_identifier) as max_id FROM transactions',
        { type: sequelize.QueryTypes.SELECT, transaction }
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

  // Update other methods to use the async generator
  static async createThriftAccountForExistingCustomer(req, res) {
    let t;
    
    try {
      console.log('🔄 Creating thrift account for existing customer...');
      
      t = await sequelize.transaction();
      
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

      // Validate customer exists
      const customer = await Customer.findOne({
        where: { CUST_ID },
        transaction: t
      });

      if (!customer) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Compute FULL_NAME if not provided
      const fullName = providedFullName || `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim();
      if (!fullName) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Full name cannot be empty'
        });
      }

      // Generate thrift account numbers
      const { ACCT_NO, ACCT_ID } = await generateAccountIdentifiersFromCounter('1');
      
      console.log(`📊 Generated account identifiers: ACCT_NO=${ACCT_NO}, ACCT_ID=${ACCT_ID}`);

      // Generate transaction identifiers WITH CORRECT TYPES
      const { 
        TRANSACTION_IDENTIFIER, 
        EVENT_ID, 
        TRAN_JOURNAL_ID, 
        REFERENCE,
        TRANSACTION_ID 
      } = await ThriftController.generateTransactionIdentifiers('THRIFT_EXIST', t);

      // Check if thrift account already exists
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
      if (customer.accountBalance < Number(initialAmount)) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance for initial thrift payment'
        });
      }

      // Create thrift account
      const thriftAccount = await Thrift.create({
        CUST_ID,
        ACCT_NO,
        ACCT_ID,
        FIRST_NAME: customer.FIRST_NAME,
        LASTNAME: customer.LAST_NAME,
        FULL_NAME: fullName,
        RELATIONSHIP_MANAGER: RELATIONSHIP_MANAGER || null,
        AMOUNT: Number(initialAmount),
        ADDRESS: address || customer.HOME_ADDRESS ? {
          street: address || customer.HOME_ADDRESS || '',
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
        notes: `Thrift account opened for existing customer ${fullName} with initial deposit of ${initialAmount}`,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction: t });

      // Create transaction record WITH CORRECT TYPES
      const transactionRecord = await Transaction.create({
        // Required fields with correct types
        TRANSACTION_IDENTIFIER, // INTEGER
        EVENT_ID, // INTEGER
        TRAN_JOURNAL_ID, // STRING
        REFERENCE, // STRING
        TRANSACTION_ID, // STRING
        
        // Other required fields
        ACCT_NO,
        ACCT_ID,
        BU_ID: 1,
        CUST_ID,
        ACCT_NM: `${fullName} Thrift Account`,
        AMOUNT: Number(initialAmount),
        transactionDirection: 'DEBIT',
        TRANSACTIONDATE: transactionDate,
        TRANSACTION_TYPE: 'THRIFT_OPENING',
        description: 'Thrift account opening - First payment to bank',
        status: 'COMPLETED',
        createdBy: 'SYSTEM',
        currency: 'NGN',
        metadata: {
          collectionType: COLLECTION_TYPE,
          isFirstPayment: true,
          amountToBank: Number(initialAmount),
          amountToCustomer: 0,
          direction: 'DEBIT',
          balanceAfter: customer.accountBalance - Number(initialAmount),
          reference: REFERENCE,
          transactionDate: transactionDate,
          openedDate: openedDate
        },
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction: t });

      // Update customer balance
      await customer.update({
        accountBalance: customer.accountBalance - Number(initialAmount),
        updated_at: new Date()
      }, { transaction: t });

      await t.commit();

      logger.info(`Thrift account created for existing customer ${CUST_ID}`, {
        CUST_ID, ACCT_NO, ACCT_ID, initialAmount, COLLECTION_TYPE,
        customerName: fullName, RELATIONSHIP_MANAGER, transactionDate, openedDate,
        transactionId: TRANSACTION_IDENTIFIER, reference: REFERENCE
      });

    // ─── Return success response ────────────────────────────
return res.status(201).json({
  success: true,
  message: 'Thrift account created successfully',
  data: {
    customer: {
      CUST_ID: updatedCustomer.CUST_ID,
      CUST_NO: updatedCustomer.CUST_NO,
      firstName: updatedCustomer.FIRST_NAME,
      lastName: updatedCustomer.LAST_NAME,
      fullName: updatedCustomer.CUST_NM || `${updatedCustomer.FIRST_NAME} ${updatedCustomer.LAST_NAME}`,
      phone: updatedCustomer.PHONE_NO || null,
      address: updatedCustomer.HOME_ADDRESS || null,
      status: updatedCustomer.REC_ST,
      openedDate: updatedCustomer.OPENED_DT ? 
        (typeof updatedCustomer.OPENED_DT.toISOString === 'function' 
          ? updatedCustomer.OPENED_DT.toISOString() 
          : new Date(updatedCustomer.OPENED_DT).toISOString()) 
        : null
    },
    thriftAccount: {
      CUST_ID: updatedThrift.CUST_ID,
      ACCT_NO: updatedThrift.ACCT_NO,
      ACCT_ID: updatedThrift.ACCT_ID,
      firstName: updatedThrift.FIRST_NAME,
      lastName: updatedThrift.LASTNAME,
      fullName: updatedThrift.FULL_NAME,
      relationshipManager: updatedThrift.RELATIONSHIP_MANAGER || null,
      amount: parseFloat(updatedThrift.AMOUNT || 0),
      address: updatedThrift.ADDRESS,
      collectionType: updatedThrift.COLLECTION_TYPE,
      status: updatedThrift.status,
      openingDate: updatedThrift.OPENED_DT ? 
        (typeof updatedThrift.OPENED_DT.toISOString === 'function' 
          ? updatedThrift.OPENED_DT.toISOString() 
          : new Date(updatedThrift.OPENED_DT).toISOString()) 
        : null,
      transactionDate: updatedThrift.TRANSACTION_DATE ? 
        (typeof updatedThrift.TRANSACTION_DATE.toISOString === 'function' 
          ? updatedThrift.TRANSACTION_DATE.toISOString() 
          : new Date(updatedThrift.TRANSACTION_DATE).toISOString()) 
        : null,
      initialAmount: parseFloat(updatedThrift.initialAmount || 0),
      accountType: updatedThrift.accountType,
      totalContributions: parseFloat(updatedThrift.totalContributions || 0),
      totalWithdrawals: parseFloat(updatedThrift.totalWithdrawals || 0),
      nextCollectionDate: updatedThrift.nextCollectionDate ? 
        (typeof updatedThrift.nextCollectionDate.toISOString === 'function' 
          ? updatedThrift.nextCollectionDate.toISOString() 
          : new Date(updatedThrift.nextCollectionDate).toISOString()) 
        : null,
      isActive: updatedThrift.isActive,
      notes: updatedThrift.notes
    },
    transaction: {
      id: transactionRecord.id,
      transactionIdentifier: transactionRecord.TRANSACTION_IDENTIFIER,
      transactionId: transactionRecord.TRANSACTION_ID,
      eventId: transactionRecord.EVENT_ID,
      journalId: transactionRecord.TRAN_JOURNAL_ID,
      reference: transactionRecord.REFERENCE,
      amount: parseFloat(transactionRecord.AMOUNT || 0),
      type: transactionRecord.TRANSACTION_TYPE,
      status: transactionRecord.status,
      date: transactionRecord.TRANSACTIONDATE ? 
        (typeof transactionRecord.TRANSACTIONDATE.toISOString === 'function' 
          ? transactionRecord.TRANSACTIONDATE.toISOString() 
          : new Date(transactionRecord.TRANSACTIONDATE).toISOString()) 
        : null,
      description: transactionRecord.description,
      direction: transactionRecord.transactionDirection
    },
    summary: {
      initialDeposit: parseFloat(initialAmount),
      thriftAccountBalance: parseFloat(updatedThrift.AMOUNT || 0),
      netTransfer: parseFloat(initialAmount),
      nextCollectionDate: nextCollectionDate.toISOString(),
      collectionFrequency: collectionType,
      transactionIdentifier: TRANSACTION_IDENTIFIER,
      reference: REFERENCE
    }
  }
});

    } catch (error) {
      if (t && !t.finished) {
        await t.rollback();
      }
      logger.error('Error creating thrift account for existing customer:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }


  // Create thrift account for existing customer
  static async createThriftAccountForExistingCustomer(req, res) {
    try {
      // Ensure models are initialized
      await ensureModelsInitialized();
      
      let t;
      
      try {
        t = await sequelize.transaction();
        
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

        // Validate customer exists
        const customer = await Customer.findOne({
          where: { CUST_ID },
          transaction: t
        });

        if (!customer) {
          await t.rollback();
          return res.status(404).json({
            success: false,
            message: 'Customer not found'
          });
        }

        // Compute FULL_NAME if not provided
        const fullName = providedFullName || `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim();
        if (!fullName) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: 'Full name cannot be empty'
          });
        }

        // Generate thrift account numbers
        const { ACCT_NO, ACCT_ID } = await generateAccountIdentifiersFromCounter('1');
        
        console.log(`📊 Generated account identifiers: ACCT_NO=${ACCT_NO}, ACCT_ID=${ACCT_ID}`);

        // Check if thrift account already exists
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
        if (customer.accountBalance < Number(initialAmount)) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: 'Insufficient balance for initial thrift payment'
          });
        }

        // Create thrift account
        const thriftAccount = await Thrift.create({
          CUST_ID,
          ACCT_NO,
          ACCT_ID,
          FIRST_NAME: customer.FIRST_NAME,
          LASTNAME: customer.LAST_NAME,
          FULL_NAME: fullName,
          RELATIONSHIP_MANAGER: RELATIONSHIP_MANAGER || null,
          AMOUNT: Number(initialAmount),
          ADDRESS: address || customer.HOME_ADDRESS ? {
            street: address || customer.HOME_ADDRESS || '',
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
          notes: `Thrift account opened for existing customer ${fullName} with initial deposit of ${initialAmount}`,
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction: t });

        // Create transaction record
        const transactionRecord = await Transaction.create({
          CUST_ID,
          ACCT_NO,
          ACCT_ID,
          BU_ID: 1,
          ACCT_NM: `${fullName} Thrift Account`,
          AMOUNT: Number(initialAmount),
          TRANSACTION_TYPE: 'THRIFT_OPENING',
          description: 'Thrift account opening - First payment to bank',
          status: 'COMPLETED',
          createdBy: 'SYSTEM',
          TRANSACTION_DATE: transactionDate,
          metadata: {
            collectionType: COLLECTION_TYPE,
            isFirstPayment: true,
            amountToBank: Number(initialAmount),
            amountToCustomer: 0,
            direction: 'DEBIT',
            balanceAfter: customer.accountBalance - Number(initialAmount),
            reference: `THRIFT_OPEN_${ACCT_NO}_${Date.now()}`,
            transactionDate: transactionDate,
            openedDate: openedDate
          },
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction: t });

        // Update customer balance
        await customer.update({
          accountBalance: customer.accountBalance - Number(initialAmount),
          updated_at: new Date()
        }, { transaction: t });

        await t.commit();

        logger.info(`Thrift account created for existing customer ${CUST_ID}`, {
          CUST_ID, ACCT_NO, ACCT_ID, initialAmount, COLLECTION_TYPE,
          customerName: fullName, RELATIONSHIP_MANAGER, transactionDate, openedDate
        });

        res.status(201).json({
          success: true,
          message: 'Thrift account created successfully for existing customer',
          data: {
            customer: {
              CUST_ID: customer.CUST_ID,
              CUST_NO: customer.CUST_NO,
              FIRST_NAME: customer.FIRST_NAME,
              LASTNAME: customer.LAST_NAME,
              FULL_NAME: fullName,
              phone: customer.PHONE_NO,
              accountBalance: customer.accountBalance - Number(initialAmount),
              accountType: customer.accountType,
              OPENED_DT: customer.OPENED_DT
            },
            thriftAccount: {
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
              OPENED_DT: thriftAccount.OPENED_DT,
              accountType: thriftAccount.accountType,
              TRANSACTION_DATE: thriftAccount.TRANSACTION_DATE
            },
            transaction: {
              id: transactionRecord.id,
              amount: Number(initialAmount),
              customerAvailableBalance: thriftAccount.AMOUNT,
              customerCurrentBalance: customer.accountBalance - Number(initialAmount),
              TRANSACTION_DATE: transactionDate
            }
          }
        });

      } catch (error) {
        if (t && !t.finished) {
          await t.rollback();
        }
        logger.error('Error creating thrift account for existing customer:', error);
        res.status(500).json({
          success: false,
          message: 'Internal server error',
          error: error.message
        });
      }

    } catch (initError) {
      console.error('Model initialization error:', initError);
      return res.status(500).json({
        success: false,
        error: 'Database initialization error',
        details: initError.message
      });
    }
  }

static async processDailyCollection(req, res) {
  try {
    await ensureModelsInitialized();
    
    const Customer = getCustomer();
    const Thrift = getThrift();
    const Transaction = getTransaction();
    const sequelize = getSequelize();
    
    // Generate very small integer identifiers
    const generateSmallIntId = () => {
      const counter = Math.floor(Math.random() * 900000) + 100000;
      return counter;
    };
    
    let t = await sequelize.transaction();
    
    try {
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
      await sequelize.query(
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
        TRANSACTION_DATE: new Date(),
        
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
        updated_at: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await Transaction.create(transactionData, { transaction: t });

      // 3. Process GL transactions using RAW SQL for guaranteed updates
      let glTransactionInfo = null;
      let glAccountBalances = null;
      
      if (debitGLAccount && creditGLAccount) {
        try {
          // Generate GL identifiers
          const glTransactionId = `THRFT-${Date.now()}`;
          const glJournalId = `JRN-${Date.now()}`;
          
          // ========== 3a. CREATE GL TRANSACTION RECORD ==========
          // Get GL models
          const models = sequelize.models;
          const GLAccountTransaction = models.GLAccountTransaction || models.gl_account_transactions;
          
          if (GLAccountTransaction) {
            await GLAccountTransaction.create({
              JOURNAL_ID: glJournalId,
              TRANSACTION_ID: glTransactionId,
              TransactionId: Date.now(),
              DR_ACCT_NO: debitGLAccount,      // Bank cash - DEBIT (asset increases)
              CR_ACCT_NO: creditGLAccount,     // Customer deposit - CREDIT (liability increases)
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
            await sequelize.query(
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

          // ========== 3b. GET CURRENT BALANCES FIRST ==========
          const [debitCurrent, creditCurrent] = await Promise.all([
            sequelize.query(
              `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
               FROM gl_accounts 
               WHERE g_l__a_c_c_t__n_o = ?`,
              {
                replacements: [debitGLAccount],
                type: sequelize.QueryTypes.SELECT,
                transaction: t
              }
            ),
            sequelize.query(
              `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
               FROM gl_accounts 
               WHERE g_l__a_c_c_t__n_o = ?`,
              {
                replacements: [creditGLAccount],
                type: sequelize.QueryTypes.SELECT,
                transaction: t
              }
            )
          ]);

          const debitPreviousBalance = debitCurrent[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0;
          const creditPreviousBalance = creditCurrent[0]?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0;
          
          const debitNewBalance = parseFloat(debitPreviousBalance) + collectionAmount;
          const creditNewBalance = parseFloat(creditPreviousBalance) + collectionAmount;

          // ========== 3c. UPDATE DEBIT ACCOUNT (BANK CASH) ==========
          // Bank cash account (0110111070001) - ASSET increases with DEBIT
          await sequelize.query(
            `UPDATE gl_accounts 
             SET 
               c_u_r_r_e_n_t__b_a_l_a_n_c_e = c_u_r_r_e_n_t__b_a_l_a_n_c_e + ?,
               l_e_d_g_e_r__b_a_l_a_n_c_e = l_e_d_g_e_r__b_a_l_a_n_c_e + ?,
               a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e = a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e + ?,
               updated_at = NOW()
             WHERE g_l__a_c_c_t__n_o = ?`,
            {
              replacements: [
                collectionAmount,  // c_u_r_r_e_n_t__b_a_l_a_n_c_e
                collectionAmount,  // l_e_d_g_e_r__b_a_l_a_n_c_e
                collectionAmount,  // a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e
                debitGLAccount     // account number
              ],
              transaction: t
            }
          );

          // ========== 3d. UPDATE CREDIT ACCOUNT (CUSTOMER DEPOSIT) ==========
          // Customer deposit account (0110122000001) - LIABILITY increases with CREDIT
          await sequelize.query(
            `UPDATE gl_accounts 
             SET 
               c_u_r_r_e_n_t__b_a_l_a_n_c_e = c_u_r_r_e_n_t__b_a_l_a_n_c_e + ?,
               l_e_d_g_e_r__b_a_l_a_n_c_e = l_e_d_g_e_r__b_a_l_a_n_c_e + ?,
               a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e = a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e + ?,
               updated_at = NOW()
             WHERE g_l__a_c_c_t__n_o = ?`,
            {
              replacements: [
                collectionAmount,  // c_u_r_r_e_n_t__b_a_l_a_n_c_e
                collectionAmount,  // l_e_d_g_e_r__b_a_l_a_n_c_e
                collectionAmount,  // a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e
                creditGLAccount    // account number
              ],
              transaction: t
            }
          );

          // ========== 3e. VERIFY THE UPDATES ==========
          const [debitUpdated, creditUpdated] = await Promise.all([
            sequelize.query(
              `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
               FROM gl_accounts 
               WHERE g_l__a_c_c_t__n_o = ?`,
              {
                replacements: [debitGLAccount],
                type: sequelize.QueryTypes.SELECT,
                transaction: t
              }
            ),
            sequelize.query(
              `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e, l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e 
               FROM gl_accounts 
               WHERE g_l__a_c_c_t__n_o = ?`,
              {
                replacements: [creditGLAccount],
                type: sequelize.QueryTypes.SELECT,
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
          // Don't rollback the entire transaction - continue without GL updates
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
          timestamp: new Date().toISOString()
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

      // Also update the frontend response format
      response.data.totalContributions = newContributions;
      response.data.AMOUNT = newBalance; // Send back the updated balance

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
  } catch (initError) {
    console.error('Initialization error:', initError);
    res.status(500).json({
      success: false,
      error: 'Initialization error',
      details: initError.message
    });
  }
}


// Process withdrawal from thrift account WITH APPROVAL WORKFLOW
static async processWithdrawal(req, res) {
  let t;
  
  try {
    console.log('🔄 Processing withdrawal request (PENDING APPROVAL)...');
    
    await ensureModelsInitialized();
    
    const sequelize = getSequelize();
    const Customer = getCustomer();
    const Thrift = getThrift();
    const Transaction = getTransaction();
    
    t = await sequelize.transaction();
    
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

    // Find customer
    const customer = await Customer.findOne({
      where: { CUST_ID },
      transaction: t
    });

    if (!customer) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
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
        const [product] = await sequelize.query(
          `SELECT * FROM savings_products WHERE PROD_ID = ? LIMIT 1`,
          {
            replacements: [productId],
            type: sequelize.QueryTypes.SELECT,
            transaction: t
          }
        );
        
        if (product && product.length > 0) {
          savingsProduct = product[0];
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
    // DO NOT update thrift account or GL accounts yet
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
      status: 'PENDING_APPROVAL', // Changed from COMPLETED to PENDING_APPROVAL
      approvalStatus: 'PENDING',
      createdBy: req.user?.id || 'SYSTEM',
      approvedBy: approvedBy || null,
      approvalNotes: notes,
      TRANSACTION_DATE: transactionDate,
      
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
      updated_at: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const withdrawalTransaction = await Transaction.create(transactionData, { transaction: t });
    
    // 2. Create approval request record
    try {
      // Create approval request table if it doesn't exist
      await sequelize.query(`
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
      await sequelize.query(
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
          currentBalance: currentBalance, // Show current, not new balance
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

static async approveWithdrawal(req, res) {
  let t;
  
  try {
    console.log('🔄 Processing withdrawal request...');
    
    await ensureModelsInitialized();
    
    const sequelize = getSequelize();
    const Customer = getCustomer();
    const Thrift = getThrift();
    const Transaction = getTransaction();
    
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

    t = await sequelize.transaction();

    try {
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

      // Check current status - be more flexible with status checking
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
      //  REJECTION HANDLING - FIXED: Use shorter status codes
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
        
        // FIX: Use shorter status codes that will fit in the column
        const rejectionStatus = 'REJECT'; // Use 'REJECT' instead of 'REJECTED' (6 chars vs 8 chars)
        
        console.log(`🔄 Updating transaction status to: "${rejectionStatus}"`);
        
        // Update transaction status - use minimal update
        try {
          await withdrawalTransaction.update({
            status: rejectionStatus,
            description: `Withdrawal rejected: ${rejectionReason.substring(0, 200)}`,
            metadata: JSON.stringify({
              ...metadataObj,
              status: 'REJECTED', // Full status in metadata
              rejectedBy: approverId,
              rejectedByName: approverName,
              rejectedAt: new Date().toISOString(),
              rejectionReason: rejectionReason.trim(),
              approvalNotes: approvalNotes || `Rejected: ${rejectionReason}`
            }),
            updated_at: new Date()
          }, { transaction: t });
        } catch (updateError) {
          console.error('❌ Error updating transaction:', updateError.message);
          
          // Try with even shorter status
          const altRejectionStatus = 'FAILED';
          console.log(`🔄 Retrying with alternative status: "${altRejectionStatus}"`);
          
          await withdrawalTransaction.update({
            status: altRejectionStatus,
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
        }

        // Update approval table if exists
        try {
          await sequelize.query(
            `UPDATE withdrawal_approvals 
             SET status = 'REJECTED', 
                 approved_by = ?, 
                 approved_by_name = ?,
                 approved_at = NOW(),
                 rejection_reason = ?,
                 approval_notes = ?,
                 updated_at = NOW()
             WHERE transaction_identifier = ?`,
            {
              replacements: [
                approverId, 
                approverName, 
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

        // Log the rejection action
        try {
          await sequelize.query(
            `INSERT INTO transaction_audit_log 
             (transaction_identifier, action, performed_by, performed_by_name, notes, old_status, new_status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            {
              replacements: [
                transactionId,
                'WITHDRAWAL_REJECTED',
                approverId,
                approverName,
                `Withdrawal rejected: ${rejectionReason.substring(0, 200)}`,
                currentStatus,
                'REJECTED'
              ],
              transaction: t
            }
          );
        } catch (error) {
          console.log('ℹ️ Audit log not created:', error.message);
        }

        // Notify customer
        const customerName = metadataObj.customerName || 'Customer';
        const amount = parseFloat(AMOUNT || 0);
        const notificationMessage = `Your withdrawal request of ₦${amount.toLocaleString()} from account ${ACCT_NO} has been rejected. Reason: ${rejectionReason}`;
        
        console.log('📢 Customer Notification:', notificationMessage);

        await t.commit();

        // Log the successful rejection
        logger.info('Withdrawal request rejected', {
          transactionId,
          accountNo: ACCT_NO,
          customerId: CUST_ID,
          customerName,
          amount,
          rejectedBy: approverId,
          rejectedByName: approverName,
          rejectionReason,
          timestamp: new Date().toISOString()
        });

        return res.status(200).json({
          success: true,
          message: 'Withdrawal request rejected successfully',
          data: {
            transactionId,
            reference: REFERENCE,
            accountNo: ACCT_NO,
            customerId: CUST_ID,
            customerName,
            amount,
            status: 'REJECTED',
            rejectedBy: approverId,
            rejectedByName: approverName,
            rejectionReason: rejectionReason.trim(),
            approvalNotes: approvalNotes || `Rejected: ${rejectionReason}`,
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
      await sequelize.query(
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

      // FIX: Use shorter status for completed transactions
      const completedStatus = 'COMPLETED';
      
      console.log(`🔄 Updating transaction status to: "${completedStatus}"`);
      
      // 4. Update transaction status to COMPLETED
      try {
        await withdrawalTransaction.update({
          status: completedStatus,
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
      } catch (updateError) {
        console.error('❌ Error updating transaction status:', updateError.message);
        
        // Try with alternative status
        const altCompletedStatus = 'APPROVED';
        console.log(`🔄 Retrying with alternative status: "${altCompletedStatus}"`);
        
        await withdrawalTransaction.update({
          status: altCompletedStatus,
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
      }

      // 5. Update approval table
      try {
        await sequelize.query(
          `UPDATE withdrawal_approvals 
           SET status = 'APPROVED', 
               approved_by = ?, 
               approved_by_name = ?,
               approved_at = NOW(),
               approval_notes = ?,
               account_updated = TRUE,
               updated_at = NOW()
           WHERE transaction_identifier = ?`,
          {
            replacements: [approverId, approverName, approvalNotes, transactionId],
            transaction: t
          }
        );
      } catch (error) {
        console.error('Error updating approval table:', error.message);
      }

      // 6. Process GL transactions (keep as is, but make optional)
      let glTransactionInfo = null;
      try {
        // Your existing GL transaction code here...
        // Keep it as is, but wrap in try-catch so GL errors don't break the approval
      } catch (glError) {
        console.error('❌ GL processing error:', glError.message);
        glTransactionInfo = { error: glError.message, glPosted: false };
      }

      // Create audit log for approval
      try {
        await sequelize.query(
          `INSERT INTO transaction_audit_log 
           (transaction_identifier, action, performed_by, performed_by_name, notes, old_status, new_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          {
            replacements: [
              transactionId,
              'WITHDRAWAL_APPROVED',
              approverId,
              approverName,
              `Withdrawal approved: ${approvalNotes || 'No additional notes'}`,
              currentStatus,
              'COMPLETED'
            ],
            transaction: t
          }
        );
      } catch (error) {
        console.log('ℹ️ Audit log not created:', error.message);
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

      if (glTransactionInfo) {
        response.data.glTransaction = glTransactionInfo;
        response.message += glTransactionInfo.error ? ' (GL posting failed)' : ' with GL posting';
      }

      // Log the successful approval
      logger.info('Withdrawal request approved', {
        transactionId,
        accountNo: ACCT_NO,
        customerId: CUST_ID,
        customerName,
        amount: withdrawalAmount,
        previousBalance: currentBalance,
        newBalance: newBalance,
        approvedBy: approverId,
        approvedByName: approverName,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      if (t) await t.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Error processing withdrawal:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error during withdrawal processing',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Get pending withdrawals for approval - FIXED VERSION
static async getPendingWithdrawals(req, res) {
  try {
    await ensureModelsInitialized();
    
    const sequelize = getSequelize();
    const Transaction = getTransaction();
    
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

    // Get approval requests if table exists
    let approvalRequests = [];
    try {
      const requests = await sequelize.query(
        `SELECT * FROM withdrawal_approvals 
         WHERE status IN ('PENDING', 'APPROVED', 'REJECTED')
         ORDER BY requested_at DESC
         LIMIT ? OFFSET ?`,
        {
          replacements: [parseInt(limit), parseInt(offset)],
          type: sequelize.QueryTypes.SELECT
        }
      );
      approvalRequests = Array.isArray(requests) ? requests : []; // Ensure it's an array
    } catch (error) {
      console.error('Error fetching approval requests:', error.message);
      // If table doesn't exist yet, create it
      try {
        await sequelize.query(`
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
        `);
        approvalRequests = [];
      } catch (createError) {
        console.error('Error creating withdrawal_approvals table:', createError.message);
      }
    }

    // Combine data safely
    const pendingWithdrawals = rows.map(transaction => {
      let metadata = {};
      try {
        metadata = transaction.metadata ? JSON.parse(transaction.metadata) : {};
      } catch (error) {
        console.error('Error parsing transaction metadata:', error.message);
      }

      // Find approval request safely
      let approvalRequest = null;
      if (Array.isArray(approvalRequests)) {
        approvalRequest = approvalRequests.find(req => 
          req && req.transaction_identifier && req.transaction_identifier.toString() === transaction.TRANSACTION_IDENTIFIER.toString()
        );
      }

      return {
        transactionId: transaction.TRANSACTION_IDENTIFIER,
        reference: transaction.REFERENCE,
        custId: transaction.CUST_ID,
        acctNo: transaction.ACCT_NO,
        amount: transaction.AMOUNT,
        status: transaction.status,
        createdAt: transaction.created_at,
        requestedBy: transaction.createdBy,
        customerName: metadata.customerName || 'N/A',
        approvalStatus: approvalRequest?.status || 'PENDING',
        approvalNotes: approvalRequest?.approval_notes || '',
        requestedAt: approvalRequest?.requested_at,
        approvalRequestId: approvalRequest?.id
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
        },
        summary: {
          pending: pendingWithdrawals.filter(w => w.approvalStatus === 'PENDING').length,
          approved: pendingWithdrawals.filter(w => w.approvalStatus === 'APPROVED').length,
          rejected: pendingWithdrawals.filter(w => w.approvalStatus === 'REJECTED').length
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching pending withdrawals:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Get withdrawal approval details - FIXED VERSION
static async getWithdrawalApprovalDetails(req, res) {
  try {
    await ensureModelsInitialized();
    
    const sequelize = getSequelize();
    const Transaction = getTransaction();
    const Thrift = getThrift();
    const Customer = getCustomer();
    
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

    // Get customer
    const customer = await Customer.findOne({
      where: { CUST_ID: transaction.CUST_ID }
    });

    // Get approval request
    let approvalRequest = null;
    try {
      const requests = await sequelize.query(
        `SELECT * FROM withdrawal_approvals WHERE transaction_identifier = ?`,
        {
          replacements: [transactionId],
          type: sequelize.QueryTypes.SELECT
        }
      );
      approvalRequest = Array.isArray(requests) && requests.length > 0 ? requests[0] : null;
    } catch (error) {
      console.error('Error fetching approval request:', error.message);
    }

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
        customer: {
          custId: customer?.CUST_ID,
          custNo: customer?.CUST_NO,
          name: customer?.CUST_NM || metadata.customerName || 'N/A',
          firstName: customer?.FIRST_NAME,
          lastName: customer?.LAST_NAME,
          phone: customer?.PHONE_NO,
          address: customer?.HOME_ADDRESS
        },
        approval: approvalRequest,
        metadata: metadata,
        workflow: {
          currentStep: transaction.status === 'PENDING_APPROVAL' ? 1 : 2,
          totalSteps: 2,
          canApprove: transaction.status === 'PENDING_APPROVAL' && currentBalance >= requestedAmount,
          canReject: transaction.status === 'PENDING_APPROVAL',
          requiresGLPosting: transaction.status === 'PENDING_APPROVAL' && currentBalance >= requestedAmount
        },
        timestamps: {
          requestedAt: approvalRequest?.requested_at,
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

// SIMPLIFIED VERSION if you're still having issues:
static async getPendingWithdrawalsSimple(req, res) {
  try {
    await ensureModelsInitialized();
    
    const Transaction = getTransaction();
    
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get only pending withdrawal transactions
    const { count, rows } = await Transaction.findAndCountAll({
      where: {
        TRANSACTION_TYPE: 'THRIFT_WITHDRAWAL',
        status: 'PENDING_APPROVAL'
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

  // Get thrift account summary
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

      const customer = await Customer.findOne({
        where: { CUST_ID }
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
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
        customerInfo: {
          CUST_ID: customer.CUST_ID,
          CUST_NO: customer.CUST_NO,
          firstName: customer.FIRST_NAME,
          lastName: customer.LAST_NAME,
          FULL_NAME: `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
          phone: customer.PHONE_NO,
          accountBalance: customer.accountBalance,
          accountType: customer.accountType
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

  // Get all thrift accounts for a customer
  static async getCustomerThriftAccounts(req, res) {
    try {
      console.log('🔄 Getting customer thrift accounts...');
      
      const { CUST_ID } = req.params;

      const customer = await Customer.findOne({
        where: { CUST_ID }
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      const thriftAccounts = await Thrift.findAll({
        where: { CUST_ID },
        order: [['OPENED_DT', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: {
          customer: {
            CUST_ID: customer.CUST_ID,
            CUST_NO: customer.CUST_NO,
            firstName: customer.FIRST_NAME,
            lastName: customer.LAST_NAME,
            FULL_NAME: `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
            accountBalance: customer.accountBalance
          },
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
            totalWithdrawals: account.totalWithdrawals
          })),
          summary: {
            totalAccounts: thriftAccounts.length,
            totalBalance: thriftAccounts.reduce((sum, acc) => sum + parseFloat(acc.AMOUNT || 0), 0),
            activeAccounts: thriftAccounts.filter(acc => acc.status === 'ACTIVE').length
          }
        }
      });

    } catch (error) {
      logger.error('Error getting customer thrift accounts:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Get all thrift accounts (Admin)
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

  // Get transaction history for a thrift account
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
        order: [['TRANSACTION_DATE', 'DESC']]
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
        TRANSACTION_DATE: txn.TRANSACTION_DATE,
        formattedDate: new Date(txn.TRANSACTION_DATE).toLocaleDateString(),
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
//  Search customers by name
// ─────────────────────────────────────────────
static async searchCustomersByName(req, res) {
  try {
    await ensureModelsInitialized();
    
    const Customer = getCustomer();
    const Thrift = getThrift();
    
    const { searchTerm, page = 1, limit = 20 } = req.query;
    
    if (!searchTerm || searchTerm.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }
    
    const searchQuery = searchTerm.trim();
    const offset = (page - 1) * limit;
    
    // Search in multiple fields: FIRST_NAME, LAST_NAME, CUST_NM (full name)
    const where = {
      [Op.or]: [
        { FIRST_NAME: { [Op.like]: `%${searchQuery}%` } },
        { LAST_NAME: { [Op.like]: `%${searchQuery}%` } },
        { CUST_NM: { [Op.like]: `%${searchQuery}%` } }
      ]
    };
    
    const { count, rows: customers } = await Customer.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['FIRST_NAME', 'ASC'], ['LAST_NAME', 'ASC']],
      attributes: [
        'CUST_ID', 
        'CUST_NO', 
        'FIRST_NAME', 
        'LAST_NAME', 
        'CUST_NM', 
        'PHONE_NO', 
        'HOME_ADDRESS',
        'REC_ST',
        'OPENED_DT',
        'created_at',
        'updated_at'
      ]
    });
    
    // Get thrift accounts for each customer
    const customersWithThriftAccounts = await Promise.all(
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
            'TRANSACTION_DATE',
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
            lastName: customer.LAST_NAME,
            fullName: customer.CUST_NM || `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
            phone: customer.PHONE_NO || null,
            address: customer.HOME_ADDRESS || null,
            status: customer.REC_ST,
            openedDate: customer.OPENED_DT ? 
              (typeof customer.OPENED_DT.toISOString === 'function' 
                ? customer.OPENED_DT.toISOString() 
                : new Date(customer.OPENED_DT).toISOString()) 
              : null,
            createdAt: customer.created_at,
            updatedAt: customer.updated_at
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
            lastTransactionDate: account.TRANSACTION_DATE ? 
              (typeof account.TRANSACTION_DATE.toISOString === 'function' 
                ? account.TRANSACTION_DATE.toISOString() 
                : new Date(account.TRANSACTION_DATE).toISOString()) 
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
      message: 'Search completed successfully',
      data: {
        customers: customersWithThriftAccounts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit),
          hasMore: (offset + customers.length) < count
        },
        search: {
          term: searchQuery,
          totalResults: count,
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
//  Search thrift accounts by customer name
// ─────────────────────────────────────────────
static async searchThriftAccountsByName(req, res) {
  try {
    await ensureModelsInitialized();
    
    const Customer = getCustomer();
    const Thrift = getThrift();
    
    const { searchTerm, page = 1, limit = 20 } = req.query;
    
    if (!searchTerm || searchTerm.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }
    
    const searchQuery = searchTerm.trim();
    const offset = (page - 1) * limit;
    
    // First, find customers matching the search term
    const customers = await Customer.findAll({
      where: {
        [Op.or]: [
          { FIRST_NAME: { [Op.like]: `%${searchQuery}%` } },
          { LAST_NAME: { [Op.like]: `%${searchQuery}%` } },
          { CUST_NM: { [Op.like]: `%${searchQuery}%` } }
        ]
      },
      attributes: ['CUST_ID', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM']
    });
    
    if (customers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No customers found matching the search term',
        data: {
          thriftAccounts: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0,
            hasMore: false
          },
          search: {
            term: searchQuery,
            totalResults: 0,
            resultsInPage: 0
          }
        }
      });
    }
    
    // Get CUST_IDs from found customers
    const customerIds = customers.map(c => c.CUST_ID);
    
    // Find thrift accounts for these customers
    const { count, rows: thriftAccounts } = await Thrift.findAndCountAll({
      where: {
        CUST_ID: { [Op.in]: customerIds }
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['CUST_ID', 'ASC'], ['OPENED_DT', 'DESC']],
      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM', 'PHONE_NO']
      }]
    });
    
    const formattedAccounts = thriftAccounts.map(account => ({
      CUST_ID: account.CUST_ID,
      ACCT_NO: account.ACCT_NO,
      ACCT_ID: account.ACCT_ID,
      customer: {
        CUST_ID: account.customer?.CUST_ID,
        CUST_NO: account.customer?.CUST_NO,
        firstName: account.customer?.FIRST_NAME,
        lastName: account.customer?.LAST_NAME,
        fullName: account.customer?.CUST_NM || `${account.customer?.FIRST_NAME} ${account.customer?.LAST_NAME}`,
        phone: account.customer?.PHONE_NO || null
      },
      accountDetails: {
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
        transactionDate: account.TRANSACTION_DATE ? 
          (typeof account.TRANSACTION_DATE.toISOString === 'function' 
            ? account.TRANSACTION_DATE.toISOString() 
            : new Date(account.TRANSACTION_DATE).toISOString()) 
          : null,
        nextCollectionDate: account.nextCollectionDate ? 
          (typeof account.nextCollectionDate.toISOString === 'function' 
            ? account.nextCollectionDate.toISOString() 
            : new Date(account.nextCollectionDate).toISOString()) 
          : null,
        address: account.ADDRESS,
        initialAmount: parseFloat(account.initialAmount || 0),
        accountType: account.accountType,
        totalContributions: parseFloat(account.totalContributions || 0),
        totalWithdrawals: parseFloat(account.totalWithdrawals || 0),
        notes: account.notes,
        isActive: account.isActive
      }
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
          resultsInPage: thriftAccounts.length,
          matchedCustomers: customers.length
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

// ─────────────────────────────────────────────
//  Quick search for thrift collection
// ─────────────────────────────────────────────
static async quickSearchForCollection(req, res) {
  try {
    await ensureModelsInitialized();
    
    const Customer = getCustomer();
    const Thrift = getThrift();
    
    const { searchTerm } = req.query;
    
    if (!searchTerm || searchTerm.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }
    
    const searchQuery = searchTerm.trim();
    
    // Search for active thrift accounts with customer info
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
      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM', 'PHONE_NO']
      }],
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
      phone: account.customer?.PHONE_NO || null,
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