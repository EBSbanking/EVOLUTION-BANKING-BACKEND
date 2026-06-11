// src/controllers/ThriftController.js - CORRECTED & CLEANED
import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import generateCustomerNumber from '../utils/generateCustomerNumber.js';
import { generateAccountIdentifiersFromCounter } from '../utils/generateAccountNumber.js';
import sequelizeInstance from '../../config/db.js';

import Thrift from '../models/Thrift.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import GLAccount from '../models/GLAccount.js';
import ThriftSettings from '../models/ThriftSettings.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js'; // ✅ for GL journal entries



// Track initialization
let modelsInitialized = false;

// Helper function to get ThriftSettings model
async function getThriftSettingsModel() {
  try {
    const ThriftSettingsModel = ThriftSettings(sequelizeInstance);
    await ThriftSettingsModel.findOne();
    return ThriftSettingsModel;
  } catch (error) {
    console.error('❌ Error initializing ThriftSettings model:', error.message);
    return null;
  }
}


async function ensureModelsInitialized() {
  if (modelsInitialized) return true;
  try {
    await sequelizeInstance.authenticate();
    if (!Thrift || typeof Thrift.findOne !== 'function') throw new Error('Thrift model not ready');
    if (!Transaction || typeof Transaction.findOne !== 'function') throw new Error('Transaction model not ready');
    modelsInitialized = true;
    console.log('✅ ThriftController models verified');
    return true;
  } catch (error) {
    console.error('❌ Model verification failed:', error.message);
    throw error;
  }
}



// Helper function to get Cash GL account (CASH IN HAND)
async function getCashGLAccount(transaction = null) {
  try {
    console.log('🔍 Searching for cash GL account...');
    const cashAccount = await GLAccount.findOne({
      where: {
        [Op.or]: [
          { GL_ACCT_NO: { [Op.like]: '01%' }, ACCT_DESC: { [Op.like]: '%CASH%' } },
          { GL_ACCT_NO: '0110120001' },
          { GL_ACCT_CAT: 'ASSET', ACCT_DESC: { [Op.like]: '%CASH%' } }
        ]
      },
      order: [
        [
          sequelizeInstance.literal(
            `CASE 
              WHEN ACCT_DESC LIKE '%CASH IN HAND%' THEN 1
              WHEN ACCT_DESC LIKE '%CASH%HAND%' THEN 2
              WHEN GL_ACCT_NO = '0110120001' THEN 3
              WHEN ACCT_DESC LIKE '%CASH%' THEN 4
              ELSE 5
            END`
          ),
          'ASC'
        ]
      ],
      transaction
    });
    if (cashAccount) {
      console.log(`✅ Found cash GL account: ${cashAccount.GL_ACCT_NO} - ${cashAccount.ACCT_DESC}`);
      return cashAccount.GL_ACCT_NO;
    }
    // Fallback: any asset account starting with 01
    const fallback = await GLAccount.findOne({
      where: { GL_ACCT_CAT: 'ASSET', GL_ACCT_NO: { [Op.startsWith]: '01' } },
      transaction
    });
    if (fallback) {
      console.log(`⚠️ Using asset account ${fallback.GL_ACCT_NO} as cash GL`);
      return fallback.GL_ACCT_NO;
    }
    console.error('❌ No cash GL account found');
    return null;
  } catch (error) {
    console.error('Error fetching cash GL account:', error.message);
    return null;
  }
}

// Helper function to get Thrift Service Income GL account
async function getThriftServiceIncomeGL(transaction = null) {
  try {
    console.log('🔍 Searching for thrift service income GL account...');
    const incomeAccount = await GLAccount.findOne({
      where: {
        [Op.or]: [
          { GL_ACCT_CAT: 'REVENUE', ACCT_DESC: { [Op.like]: '%SERVICE%INCOME%' } },
          { GL_ACCT_CAT: 'REVENUE', ACCT_DESC: { [Op.like]: '%THRIFT%INCOME%' } },
          { categoryCode: '404' }
        ]
      },
      transaction
    });
    if (incomeAccount) {
      console.log(`✅ Found income GL account: ${incomeAccount.GL_ACCT_NO} - ${incomeAccount.ACCT_DESC}`);
      return incomeAccount.GL_ACCT_NO;
    }
    // Fallback: any revenue account
    const fallback = await GLAccount.findOne({ where: { GL_ACCT_CAT: 'REVENUE' }, transaction });
    if (fallback) {
      console.log(`⚠️ Using revenue account ${fallback.GL_ACCT_NO} as thrift income GL`);
      return fallback.GL_ACCT_NO;
    }
    console.error('❌ No thrift service income GL account found');
    return null;
  } catch (error) {
    console.error('Error fetching thrift income GL:', error.message);
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

// =============================================
// THRIFT CONTROLLER CLASS
// =============================================
class ThriftController {
  // ─────────────────────────────────────────────
  //  Helper: Generate unique thrift account identifiers
  // ─────────────────────────────────────────────
  static async generateThriftAccountIdentifiers(transaction = null) {
  try {
    const [lastAccount] = await sequelizeInstance.query(
      `SELECT MAX(ACCT_NO) as max_acct_no FROM THRIFT_ACCOUNTS`,
      { type: sequelizeInstance.QueryTypes.SELECT, transaction }
    );
    let nextAcctNo = '0001000001';
    if (lastAccount?.max_acct_no) {
      const lastNum = parseInt(lastAccount.max_acct_no.slice(-4));
      const nextNum = (lastNum + 1).toString().padStart(4, '0');
      nextAcctNo = `000100${nextNum}`;
    }
    const timestamp = Date.now();
    const ACCT_ID = timestamp.toString().slice(-8).padStart(8, '0');
    return { ACCT_NO: nextAcctNo, ACCT_ID };
  } catch (error) {
    console.error('Error generating thrift identifiers:', error);
    return {
      ACCT_NO: `000100${Math.floor(Math.random() * 9000) + 1000}`,
      ACCT_ID: Math.floor(Math.random() * 90000000 + 10000000).toString()
    };
    }
  }

 // ─────────────────────────────────────────────
//  Create new thrift account (WITH THRIFT SETTINGS INTEGRATION) - FORCED GL ENTRIES
// ─────────────────────────────────────────────
static async createThriftAccount(req, res) {
  let t = null;
  
  try {
    console.log('🚀 Starting createThriftAccount...');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Determine if we're in development mode
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Ensure models are initialized
    await ensureModelsInitialized();
    console.log('✅ Models verified');
    
    // Validate required models
    if (!Thrift || !Transaction) {
      throw new Error('Required models not available');
    }
    
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
      PRODUCT_ID
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

    if (productId) {
      console.log(`📋 Looking for provided PRODUCT_ID: ${productId}`);
      try {
        const [product] = await sequelizeInstance.query(
          `SELECT * FROM savings_products WHERE PROD_ID = ? LIMIT 1`,
          { replacements: [productId], type: sequelizeInstance.QueryTypes.SELECT, transaction: t }
        );
        if (product) {
          savingsProduct = product;
          console.log(`✅ Found provided PRODUCT_ID: ${productId}`);
        } else {
          savingsProduct = await findThriftProduct(sequelizeInstance, t);
          if (savingsProduct) productId = savingsProduct.PROD_ID;
        }
      } catch (sqlError) {
        savingsProduct = await findThriftProduct(sequelizeInstance, t);
        if (savingsProduct) productId = savingsProduct.PROD_ID;
      }
    } else {
      savingsProduct = await findThriftProduct(sequelizeInstance, t);
      if (savingsProduct) productId = savingsProduct.PROD_ID;
    }

    if (!savingsProduct) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: 'No savings product found',
        details: 'Please set up a savings product in the system first.'
      });
    }

    console.log('✅ Using savings product configuration:', {
      productId: savingsProduct.PROD_ID,
      productName: savingsProduct.productName,
      productCode: savingsProduct.productCode
    });
    
    // ─── Get GL Accounts from ThriftSettings ─────────
    console.log('🔍 Fetching thrift GL accounts from settings...');

    try {
      const ThriftSettingsModel = ThriftSettings(sequelizeInstance);
      const settings = await ThriftSettingsModel.findAll({
        where: { setting_key: { [Op.in]: ['thrift_cash_gl', 'thrift_income_gl'] } },
        transaction: t,
        raw: true
      });

      if (settings && settings.length > 0) {
        settings.forEach(setting => {
          if (setting.setting_key === 'thrift_cash_gl') {
            CASH_GL = setting.setting_value;
          } else if (setting.setting_key === 'thrift_income_gl') {
            THRIFT_INCOME_GL = setting.setting_value;
          }
        });
      }
    } catch (settingsError) {
      console.error('❌ Error fetching thrift settings:', settingsError.message);
    }

    // Fallback to product GL_ACCOUNTS
    if (!CASH_GL || !THRIFT_INCOME_GL) {
      if (savingsProduct?.GL_ACCOUNTS) {
        try {
          const productGL = JSON.parse(savingsProduct.GL_ACCOUNTS);
          CASH_GL = CASH_GL || productGL.cash_account || productGL.cash;
          THRIFT_INCOME_GL = THRIFT_INCOME_GL || productGL.income_account || productGL.income;
        } catch (e) {}
      }
    }

    // Final fallback - use default GL accounts
    if (!CASH_GL) CASH_GL = '0110120001';  // Default cash account
    if (!THRIFT_INCOME_GL) THRIFT_INCOME_GL = '0110240630001';  // Default thrift income account
      
    console.log('✅ Using GL accounts:', {
      cashGL: CASH_GL,
      thriftIncomeGL: THRIFT_INCOME_GL
    });

    // ─── Generate identifiers ───────────────────────────────
    const { CUST_ID, CUST_NO } = await generateCustomerNumber();
    const identifiers = await ThriftController.generateThriftAccountIdentifiers(sequelizeInstance, t);
    let ACCT_NO = identifiers.ACCT_NO;
    let ACCT_ID = identifiers.ACCT_ID;

    console.log(`📊 Generated identifiers: CUST_ID=${CUST_ID}, ACCT_NO=${ACCT_NO}, ACCT_ID=${ACCT_ID}`);
    
    // Generate transaction identifiers
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    
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
    
    const TRANSACTION_IDENTIFIER = nextTransactionId;
    const EVENT_ID = nextTransactionId;
    const TRAN_JOURNAL_ID = `JRN${timestamp}${randomNum}`;
    const REFERENCE = `THRIFT_${ACCT_NO}_${timestamp}`;
    const TRANSACTION_ID = `TXN${nextTransactionId.toString().padStart(10, '0')}`;
    
    // ─── Check for conflicts ────────────────────────────────
    const existingThrift = await Thrift.findOne({ where: { ACCT_NO }, transaction: t });
    if (existingThrift) {
      const newIdentifiers = await ThriftController.generateThriftAccountIdentifiers(sequelizeInstance, t);
      ACCT_NO = newIdentifiers.ACCT_NO;
      ACCT_ID = newIdentifiers.ACCT_ID;
    }
    
    // ─── Prepare address object ─────────────────────────────
    let addressObj = null;
    if (address || city || state || zipCode) {
      try {
        addressObj = typeof address === 'string' ? JSON.parse(address) : (address || {});
        if (!addressObj || typeof addressObj !== 'object') addressObj = {};
        if (city) addressObj.city = city;
        if (state) addressObj.state = state;
        if (zipCode) addressObj.zipCode = zipCode;
        if (!addressObj.country) addressObj.country = 'Nigeria';
      } catch {
        addressObj = { street: address || '', city: city || '', state: state || '', zipCode: zipCode || '', country: 'Nigeria' };
      }
    }
    
    // ─── Create thrift account ──────────────────────────────
    const now = new Date();
    const serviceFee = parseFloat(initialAmount);
    const customerBalance = 0.00;

    const thriftData = {
      CUST_ID, ACCT_NO, ACCT_ID, FIRST_NAME, LASTNAME, FULL_NAME: fullName,
      RELATIONSHIP_MANAGER: RELATIONSHIP_MANAGER || null, AMOUNT: customerBalance,
      ADDRESS: addressObj ? JSON.stringify(addressObj) : null, COLLECTION_TYPE: collectionType,
      STATUS: 'ACTIVE', OPENED_DT: openDate, TRANSACTION_DATE: txDate, openingDate: openDate,
      initialAmount: customerBalance, accountType: 'THRIFT', PRODUCT_ID: productId,
      totalContributions: 0, totalWithdrawals: 0,
      GL_ACCOUNTS: JSON.stringify({ cash_account: CASH_GL, income_account: THRIFT_INCOME_GL }),
      NOTES: `Thrift account opened for ${fullName} with service fee of ${serviceFee}`,
      createdAt: now, updatedAt: now, isActive: true
    };

    const thriftAccount = await Thrift.create(thriftData, { transaction: t });
    if (!thriftAccount) {
      await t.rollback();
      return res.status(500).json({ success: false, error: 'Failed to create thrift account' });
    }

    // ─── Create opening transaction record ─────────────────────────
    const metadata = {
      direction: 'DEBIT', amountToBank: serviceFee, amountToCustomer: 0,
      reference: REFERENCE, customerName: fullName, collectionType: collectionType,
      relationshipManager: RELATIONSHIP_MANAGER, transactionType: 'SERVICE_FEE',
      productId, productName: savingsProduct.productName,
      glAccounts: { cash: CASH_GL, income: THRIFT_INCOME_GL },
      isServiceFee: true, customerSavingsBalance: 0
    };

    const transactionData = {
      ACCT_NO: thriftAccount.ACCT_NO, ACCT_ID: thriftAccount.ACCT_ID, BU_ID: 1,
      CUST_ID, ACCT_NM: `${fullName} Thrift Account`, AMOUNT: serviceFee,
      transactionDirection: 'DEBIT', TRANSACTIONDATE: txDate, TRANSACTION_TYPE: 'SERVICE_FEE',
      TRANSACTION_IDENTIFIER, TRANSACTION_ID, EVENT_ID, TRAN_JOURNAL_ID, REFERENCE,
      description: `Thrift account opening service fee for ${fullName}`,
      currency: 'NGN', createdBy: 'SYSTEM', status: 'COMPLETED',
      FLAGGED_FOR_AML: false, AML_THRESHOLD_USED: 0,
      metadata: JSON.stringify(metadata), created_at: now, updated_at: now
    };

    const transactionRecord = await Transaction.create(transactionData, { transaction: t });
    if (!transactionRecord) {
      await t.rollback();
      return res.status(500).json({ success: false, error: 'Failed to create transaction record' });
    }

    // ─── FORCED GL ACCOUNTING ENTRIES ───────────────────────────────
    let glTransactionInfo = null;

    // ALWAYS try to create GL entries - this is mandatory for accounting
    try {
      // Get or import GLAccountTransaction model
      const models = sequelizeInstance.models;
      const GLAccountTransaction = models.GLAccountTransaction || models.gl_account_transactions;
      
      if (!GLAccountTransaction) {
        console.error('❌ GLAccountTransaction model NOT AVAILABLE!');
        throw new Error('GLAccountTransaction model is required for accounting');
      }
      
      // Verify cash GL account exists, if not, create it
      const [cashAccount] = await sequelizeInstance.query(
        `SELECT g_l__a_c_c_t__n_o FROM gl_accounts WHERE g_l__a_c_c_t__n_o = ?`,
        { replacements: [CASH_GL], type: sequelizeInstance.QueryTypes.SELECT, transaction: t }
      );
      
      if (!cashAccount) {
        console.log(`⚠️ Cash GL account ${CASH_GL} not found, creating it...`);
        await sequelizeInstance.query(
          `INSERT INTO gl_accounts (
            g_l__a_c_c_t__n_o, g_l__a_c_c_t__i_d, a_c_c_t__d_e_s_c, 
            g_l__a_c_c_t__c_a_t, c_u_r_r_e_n_t__b_a_l_a_n_c_e, 
            c_r__a_l_l_o_w_e_d, d_r__a_l_l_o_w_e_d, r_e_c__s_t,
            created_at, updated_at
          ) VALUES (?, CONCAT('GL', ?), 'Cash Account', 'ASSET', 0, 1, 1, 'Active', NOW(), NOW())`,
          { replacements: [CASH_GL, CASH_GL], transaction: t }
        );
        console.log(`✅ Created cash GL account: ${CASH_GL}`);
      }
      
      // Verify income GL account exists
      const [incomeAccount] = await sequelizeInstance.query(
        `SELECT g_l__a_c_c_t__n_o FROM gl_accounts WHERE g_l__a_c_c_t__n_o = ?`,
        { replacements: [THRIFT_INCOME_GL], type: sequelizeInstance.QueryTypes.SELECT, transaction: t }
      );
      
      if (!incomeAccount) {
        console.log(`⚠️ Income GL account ${THRIFT_INCOME_GL} not found, creating it...`);
        await sequelizeInstance.query(
          `INSERT INTO gl_accounts (
            g_l__a_c_c_t__n_o, g_l__a_c_c_t__i_d, a_c_c_t__d_e_s_c, 
            g_l__a_c_c_t__c_a_t, c_u_r_r_e_n_t__b_a_l_a_n_c_e, 
            c_r__a_l_l_o_w_e_d, d_r__a_l_l_o_w_e_d, r_e_c__s_t,
            created_at, updated_at
          ) VALUES (?, CONCAT('GL', ?), 'Thrift Service Income', 'REVENUE', 0, 1, 1, 'Active', NOW(), NOW())`,
          { replacements: [THRIFT_INCOME_GL, THRIFT_INCOME_GL], transaction: t }
        );
        console.log(`✅ Created income GL account: ${THRIFT_INCOME_GL}`);
      }
      
      // Create GL transaction record
      const glJournalId = `THRIFT-FEE-${ACCT_NO}-${timestamp}`;
      const glTransactionId = `GL-FEE-${TRANSACTION_ID}`;
      
      await GLAccountTransaction.create({
        JOURNAL_ID: glJournalId,
        TRANSACTION_ID: glTransactionId,
        TransactionId: Date.now(),
        DR_ACCT_NO: CASH_GL,
        CR_ACCT_NO: THRIFT_INCOME_GL,
        AMOUNT: serviceFee,
        NARRATION: `Thrift account opening service fee for ${fullName} (Account: ${ACCT_NO})`,
        CREATED_BY: 'SYSTEM',
        UPDATED_BY: 'SYSTEM',
        TRANSACTION_TYPE: 'SERVICE_FEE',
        CURRENCY_CODE: 'NGN',
        STATUS: 'POSTED',
        createdAt: new Date(),
        updatedAt: new Date()
      }, { transaction: t });
      
      console.log(`✅ GL double-entry transaction created: ${glJournalId}`);
      console.log(`📊 Journal Entry: DEBIT Cash ${CASH_GL}, CREDIT Income ${THRIFT_INCOME_GL} for ₦${serviceFee}`);
      
      // Update GL account balances
      await sequelizeInstance.query(
        `UPDATE gl_accounts SET c_u_r_r_e_n_t__b_a_l_a_n_c_e = c_u_r_r_e_n_t__b_a_l_a_n_c_e + ?, updated_at = NOW() WHERE g_l__a_c_c_t__n_o = ?`,
        { replacements: [serviceFee, CASH_GL], transaction: t }
      );
      
      await sequelizeInstance.query(
        `UPDATE gl_accounts SET c_u_r_r_e_n_t__b_a_l_a_n_c_e = c_u_r_r_e_n_t__b_a_l_a_n_c_e + ?, updated_at = NOW() WHERE g_l__a_c_c_t__n_o = ?`,
        { replacements: [serviceFee, THRIFT_INCOME_GL], transaction: t }
      );
      
      console.log('✅ GL account balances updated');
      
      glTransactionInfo = {
        transactionId: glTransactionId,
        journalId: glJournalId,
        debitAccount: CASH_GL,
        creditAccount: THRIFT_INCOME_GL,
        amount: serviceFee,
        type: 'SERVICE_FEE',
        status: 'POSTED'
      };
      
    } catch (glError) {
      console.error('❌ GL accounting error:', glError.message);
      console.error('GL error stack:', glError.stack);
      // For thrift opening, GL entries are MANDATORY - rollback if they fail
      await t.rollback();
      return res.status(500).json({
        success: false,
        error: 'GL accounting failed - transaction rolled back',
        details: glError.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // ─── Calculate next collection date ─────────────────────
    let nextCollectionDate;
    const today = new Date();
    switch (collectionType) {
      case 'DAILY': nextCollectionDate = new Date(today.getTime() + 24 * 60 * 60 * 1000); break;
      case 'WEEKLY': nextCollectionDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); break;
      case 'MONTHLY': nextCollectionDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()); break;
      case 'QUARTERLY': nextCollectionDate = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate()); break;
      default: nextCollectionDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    }
    
    await Thrift.update({ nextCollectionDate, updated_at: new Date() }, { where: { ACCT_NO }, transaction: t });
    await t.commit();
    
    const safeToISOString = (dateValue) => {
      if (!dateValue) return null;
      try {
        const date = new Date(dateValue);
        return !isNaN(date.getTime()) ? date.toISOString() : null;
      } catch { return null; }
    };
    
    const responseData = {
      success: true,
      message: 'Thrift account created successfully with GL posting',
      data: {
        thriftAccount: {
          CUST_ID, CUST_NO, ACCT_NO, ACCT_ID, firstName: FIRST_NAME, lastName: LASTNAME,
          fullName: fullName, relationshipManager: RELATIONSHIP_MANAGER || null,
          amount: customerBalance, serviceFee: serviceFee, address: addressObj,
          collectionType: collectionType, status: 'ACTIVE', productId, productName: savingsProduct.productName,
          openingDate: safeToISOString(openDate), transactionDate: safeToISOString(txDate),
          initialAmount: customerBalance, accountType: 'THRIFT', totalContributions: 0, totalWithdrawals: 0,
          nextCollectionDate: safeToISOString(nextCollectionDate), isActive: true,
          glAccounts: { cash: CASH_GL, income: THRIFT_INCOME_GL }
        },
        transaction: {
          transactionIdentifier: TRANSACTION_IDENTIFIER, transactionId: TRANSACTION_ID,
          eventId: EVENT_ID, journalId: TRAN_JOURNAL_ID, reference: REFERENCE,
          amount: serviceFee, type: 'SERVICE_FEE', status: 'COMPLETED',
          date: safeToISOString(txDate), description: `Thrift account opening service fee for ${fullName}`,
          direction: 'DEBIT', productId, isServiceFee: true
        },
        glTransaction: glTransactionInfo,
        product: {
          productId: savingsProduct.PROD_ID, productName: savingsProduct.productName,
          productCode: savingsProduct.productCode,
          description: savingsProduct.productDescription || savingsProduct.PROD_DESC
        },
        summary: {
          serviceFee, customerSavingsBalance: customerBalance,
          nextCollectionDate: safeToISOString(nextCollectionDate),
          collectionFrequency: collectionType, transactionIdentifier: TRANSACTION_IDENTIFIER,
          reference: REFERENCE, productId, isActive: true
        }
      }
    };
    
    return res.status(201).json(responseData);
    
  } catch (err) {
    if (t) await t.rollback();
    console.error('❌ createThriftAccount failed', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
  // ─────────────────────────────────────────────
  //  Additional methods for Thrift account management
  // ─────────────────────────────────────────────

  /**
   * Get all thrift accounts with optional filtering
   */
  static async getThriftAccounts(req, res) {
    try {
      await ensureModelsInitialized();
      
      const {
        page = 1,
        limit = 20,
        status,
        collectionType,
        search,
        isActive
      } = req.query;
      
      const offset = (page - 1) * limit;
      const whereClause = {};
      
      // Apply filters
      if (status) {
        whereClause.STATUS = status;
      }
      
      if (collectionType) {
        whereClause.COLLECTION_TYPE = collectionType;
      }
      
      // Filter by active status
      if (isActive !== undefined) {
        whereClause.isActive = isActive === 'true';
      }
      
      if (search) {
        whereClause[Op.or] = [
          { ACCT_NO: { [Op.like]: `%${search}%` } },
          { FULL_NAME: { [Op.like]: `%${search}%` } },
          { FIRST_NAME: { [Op.like]: `%${search}%` } },
          { LASTNAME: { [Op.like]: `%${search}%` } }
        ];
      }
      
      const { count, rows } = await Thrift.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });
      
      return res.status(200).json({
        success: true,
        data: rows.map(account => account.getAccountInfo()),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });
      
    } catch (error) {
      console.error('Error fetching thrift accounts:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch thrift accounts',
        details: error.message
      });
    }
  }

  /**
   * Get thrift account by account number
   */
  static async getThriftAccountByNumber(req, res) {
    try {
      await ensureModelsInitialized();
      
      const { accountNumber } = req.params;
      
      const account = await Thrift.findOne({
        where: { ACCT_NO: accountNumber }
      });
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Thrift account not found'
        });
      }
      
      return res.status(200).json({
        success: true,
        data: account.getAccountInfo()
      });
      
    } catch (error) {
      console.error('Error fetching thrift account:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch thrift account',
        details: error.message
      });
    }
  }

  /**
   * Update thrift account status
   */
  static async updateThriftStatus(req, res) {
    let t = null;
    
    try {
      await ensureModelsInitialized();
      
      const { accountNumber } = req.params;
      const { status, reason } = req.body;
      
      const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }
      
      t = await sequelizeInstance.transaction();
      
      const account = await Thrift.findOne({
        where: { ACCT_NO: accountNumber },
        transaction: t
      });
      
      if (!account) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          error: 'Thrift account not found'
        });
      }
      
      // Update status and isActive based on status
      const updateData = {
        STATUS: status,
        notes: account.notes 
          ? `${account.notes}\n${new Date().toISOString()}: Status changed to ${status}${reason ? ` - ${reason}` : ''}`
          : `${new Date().toISOString()}: Status changed to ${status}${reason ? ` - ${reason}` : ''}`
      };
      
      // Automatically update isActive based on status
      updateData.isActive = status === 'ACTIVE';
      
      await account.update(updateData, { transaction: t });
      
      await t.commit();
      
      return res.status(200).json({
        success: true,
        message: `Thrift account status updated to ${status}`,
        data: {
          accountNumber: account.ACCT_NO,
          status: account.STATUS,
          isActive: account.isActive,
          notes: account.notes
        }
      });
      
    } catch (error) {
      if (t) await t.rollback();
      console.error('Error updating thrift account status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update thrift account status',
        details: error.message
      });
    }
  }

  /**
   * Toggle thrift account active status
   */
  static async toggleActiveStatus(req, res) {
    let t = null;
    
    try {
      await ensureModelsInitialized();
      
      const { accountNumber } = req.params;
      const { active, reason } = req.body;
      
      if (active === undefined) {
        return res.status(400).json({
          success: false,
          error: 'active flag is required (true/false)'
        });
      }
      
      t = await sequelizeInstance.transaction();
      
      const account = await Thrift.findOne({
        where: { ACCT_NO: accountNumber },
        transaction: t
      });
      
      if (!account) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          error: 'Thrift account not found'
        });
      }
      
      const isActive = active === true || active === 'true';
      
      await account.update({
        isActive: isActive,
        notes: account.notes 
          ? `${account.notes}\n${new Date().toISOString()}: Account ${isActive ? 'activated' : 'deactivated'}${reason ? ` - ${reason}` : ''}`
          : `${new Date().toISOString()}: Account ${isActive ? 'activated' : 'deactivated'}${reason ? ` - ${reason}` : ''}`
      }, { transaction: t });
      
      await t.commit();
      
      return res.status(200).json({
        success: true,
        message: `Thrift account ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: {
          accountNumber: account.ACCT_NO,
          isActive: account.isActive,
          status: account.STATUS,
          notes: account.notes
        }
      });
      
    } catch (error) {
      if (t) await t.rollback();
      console.error('Error toggling thrift account active status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to toggle thrift account active status',
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
  //  Get transaction history for a thrift account (by account number only)
  // ─────────────────────────────────────────────
  static async getPaymentHistoryByAccountNo(req, res) {
    try {
      await ensureModelsInitialized();
      const { accountNo } = req.params;
      const { page = 1, limit = 50, fromDate, toDate, transactionType } = req.query;

      if (!accountNo) {
        return res.status(400).json({ success: false, message: 'Account number is required' });
      }

      const thriftAccount = await Thrift.findOne({ where: { ACCT_NO: accountNo } });
      if (!thriftAccount) {
        return res.status(404).json({ success: false, message: `Thrift account ${accountNo} not found` });
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);
      const whereClause = { ACCT_NO: accountNo };
      if (transactionType) whereClause.TRANSACTION_TYPE = transactionType;
      if (fromDate) whereClause.TRANSACTIONDATE = { [Op.gte]: new Date(fromDate) };
      if (toDate) whereClause.TRANSACTIONDATE = { ...whereClause.TRANSACTIONDATE, [Op.lte]: new Date(toDate) };

      const { count, rows: transactions } = await Transaction.findAndCountAll({
        where: whereClause,
        order: [['TRANSACTIONDATE', 'DESC']],
        limit: parseInt(limit),
        offset
      });

      const enrichedTransactions = transactions.map(txn => ({
        id: txn.id,
        transactionIdentifier: txn.TRANSACTION_IDENTIFIER,
        reference: txn.REFERENCE,
        amount: parseFloat(txn.AMOUNT || 0),
        type: txn.TRANSACTION_TYPE,
        direction: txn.transactionDirection || (txn.AMOUNT > 0 ? 'CREDIT' : 'DEBIT'),
        status: txn.status,
        date: txn.TRANSACTIONDATE,
        formattedDate: new Date(txn.TRANSACTIONDATE).toLocaleString(),
        description: txn.description,
        metadata: txn.metadata ? (typeof txn.metadata === 'string' ? JSON.parse(txn.metadata) : txn.metadata) : null
      }));

      const totalDeposits = enrichedTransactions.filter(t => t.type === 'DEPOSIT' || t.type === 'THRIFT_COLLECTION').reduce((s, t) => s + t.amount, 0);
      const totalWithdrawals = enrichedTransactions.filter(t => t.type === 'THRIFT_WITHDRAWAL').reduce((s, t) => s + t.amount, 0);
      const totalFees = enrichedTransactions.filter(t => t.type === 'SERVICE_FEE').reduce((s, t) => s + t.amount, 0);

      return res.status(200).json({
        success: true,
        message: `Transaction history for account ${accountNo}`,
        data: {
          accountInfo: {
            accountNumber: thriftAccount.ACCT_NO,
            customerName: thriftAccount.FULL_NAME,
            customerId: thriftAccount.CUST_ID,
            currentBalance: parseFloat(thriftAccount.AMOUNT || 0),
            collectionType: thriftAccount.COLLECTION_TYPE,
            status: thriftAccount.STATUS
          },
          transactions: enrichedTransactions,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            totalPages: Math.ceil(count / limit),
            hasMore: offset + transactions.length < count
          },
          summary: { totalTransactions: count, totalDeposits, totalWithdrawals, totalFees, netChange: totalDeposits - totalWithdrawals - totalFees }
        }
      });
    } catch (error) {
      console.error('Error fetching payment history:', error);
      logger.error('getPaymentHistoryByAccountNo failed', { error: error.message, stack: error.stack, accountNo: req.params.accountNo, query: req.query });
      return res.status(500).json({ success: false, message: 'Failed to fetch transaction history', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
  }

  // ─────────────────────────────────────────────
  // Helper function to generate transaction identifiers with CORRECT TYPES
  // ─────────────────────────────────────────────
  static async generateTransactionIdentifiers(prefix = 'THRIFT', transaction = null) {
  try {
    const [lastTx] = await sequelizeInstance.query(
      'SELECT MAX(TRANSACTION_IDENTIFIER) as max_id FROM transactions',
      { type: sequelizeInstance.QueryTypes.SELECT, transaction }
    );
    const nextId = (lastTx?.max_id || 0) + 1;
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return {
      TRANSACTION_IDENTIFIER: nextId,
      EVENT_ID: nextId,
      TRAN_JOURNAL_ID: `JRN${timestamp}${random}`,
      REFERENCE: `${prefix}_${timestamp}_${random}`,
      TRANSACTION_ID: `TXN${nextId.toString().padStart(10, '0')}`
    };
  } catch (error) {
    const fallbackId = Math.floor(Math.random() * 1000000);
    return {
      TRANSACTION_IDENTIFIER: fallbackId,
      EVENT_ID: fallbackId,
      TRAN_JOURNAL_ID: `JRN${Date.now()}`,
      REFERENCE: `${prefix}_${Date.now()}`,
      TRANSACTION_ID: `TXN${fallbackId}`
    };
    }
  }

  // ─────────────────────────────────────────────
  //  Get thrift accounts by customer ID
  // ─────────────────────────────────────────────
  static async getThriftAccountsByCustomerId(req, res) {
    try {
      await ensureModelsInitialized();
      
      const { customerId } = req.params;
      
      if (!customerId) {
        return res.status(400).json({
          success: false,
          message: 'Customer ID is required'
        });
      }

      console.log(`🔍 Fetching thrift accounts for customer: ${customerId}`);

      // Find all thrift accounts for this customer
      const thriftAccounts = await Thrift.findAll({
        where: { 
          CUST_ID: customerId 
        },
        order: [['created_at', 'DESC']]
      });

      if (!thriftAccounts || thriftAccounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No thrift accounts found for customer ID: ${customerId}`
        });
      }

      // Format the response
      const formattedAccounts = thriftAccounts.map(account => ({
        accountNumber: account.ACCT_NO,
        accountId: account.ACCT_ID,
        customerId: account.CUST_ID,
        firstName: account.FIRST_NAME,
        lastName: account.LASTNAME,
        fullName: account.FULL_NAME,
        balance: parseFloat(account.AMOUNT || 0),
        collectionType: account.COLLECTION_TYPE,
        status: account.status,
        isActive: account.isActive,
        openedDate: account.OPENED_DT,
        lastCollectionDate: account.lastCollectionDate,
        nextCollectionDate: account.nextCollectionDate,
        totalContributions: parseFloat(account.totalContributions || 0),
        totalWithdrawals: parseFloat(account.totalWithdrawals || 0),
        relationshipManager: account.RELATIONSHIP_MANAGER || null,
        notes: account.notes
      }));

      // Calculate summary
      const summary = {
        totalAccounts: formattedAccounts.length,
        totalBalance: formattedAccounts.reduce((sum, acc) => sum + acc.balance, 0),
        activeAccounts: formattedAccounts.filter(acc => acc.status === 'ACTIVE').length,
        totalContributions: formattedAccounts.reduce((sum, acc) => sum + acc.totalContributions, 0),
        totalWithdrawals: formattedAccounts.reduce((sum, acc) => sum + acc.totalWithdrawals, 0),
        netBalance: formattedAccounts.reduce((sum, acc) => sum + (acc.totalContributions - acc.totalWithdrawals), 0)
      };

      return res.status(200).json({
        success: true,
        message: `Found ${formattedAccounts.length} thrift account(s) for customer`,
        data: {
          customerId: customerId,
          accounts: formattedAccounts,
          summary: summary
        }
      });

    } catch (error) {
      console.error('❌ Error fetching thrift accounts by customer ID:', error);
      logger.error('getThriftAccountsByCustomerId failed', { 
        error: error.message, 
        stack: error.stack,
        customerId: req.params.customerId,
        timestamp: new Date().toISOString()
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch thrift accounts',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Create thrift account for existing customer (SINGLE VERSION)
  // ─────────────────────────────────────────────
  static async createThriftAccount(req, res) {
    let t = null;
    try {
      console.log('🚀 Starting createThriftAccount...');
      await ensureModelsInitialized();
      t = await sequelizeInstance.transaction();

      const {
        FIRST_NAME, LASTNAME, FULL_NAME, initialAmount, COLLECTION_TYPE,
        address, phone, RELATIONSHIP_MANAGER, TRANSACTION_DATE, OPENED_DT,
        city, state, zipCode, PRODUCT_ID
      } = req.body;

      if (!FIRST_NAME?.trim() || !LASTNAME?.trim()) {
        await t.rollback();
        return res.status(400).json({ success: false, error: 'FIRST_NAME and LASTNAME are required' });
      }
      const amount = parseFloat(initialAmount);
      if (isNaN(amount) || amount <= 0) {
        await t.rollback();
        return res.status(400).json({ success: false, error: 'initialAmount must be a positive number' });
      }
      const collectionType = (COLLECTION_TYPE || 'DAILY').toUpperCase();
      const validTypes = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'];
      if (!validTypes.includes(collectionType)) {
        await t.rollback();
        return res.status(400).json({ success: false, error: `Invalid COLLECTION_TYPE. Allowed: ${validTypes.join(', ')}` });
      }

      const fullName = FULL_NAME?.trim() || `${FIRST_NAME} ${LASTNAME}`.trim();
      const txDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();
      const openDate = OPENED_DT ? new Date(OPENED_DT) : new Date();

      // Find product
      let productId = PRODUCT_ID;
      let savingsProduct = await findThriftProduct(t);
      if (savingsProduct && !productId) productId = savingsProduct.PROD_ID;
      if (!savingsProduct) {
        await t.rollback();
        return res.status(400).json({ success: false, error: 'No savings product found. Please set up a savings product first.' });
      }

      // Get GL accounts from settings or product
      let CASH_GL = null, THRIFT_INCOME_GL = null;
      try {
        const ThriftSettingsModel = ThriftSettings(sequelizeInstance);
        const settings = await ThriftSettingsModel.findAll({
          where: { setting_key: { [Op.in]: ['thrift_cash_gl', 'thrift_income_gl'] } },
          transaction: t,
          raw: true
        });
        for (const s of settings) {
          if (s.setting_key === 'thrift_cash_gl') CASH_GL = s.setting_value;
          else if (s.setting_key === 'thrift_income_gl') THRIFT_INCOME_GL = s.setting_value;
        }
      } catch (e) { console.error('Thrift settings error:', e.message); }

      if (!CASH_GL || !THRIFT_INCOME_GL) {
        const productGL = savingsProduct.GL_ACCOUNTS ? JSON.parse(savingsProduct.GL_ACCOUNTS) : {};
        CASH_GL = CASH_GL || productGL.cash_account || productGL.cash || '0110120001';
        THRIFT_INCOME_GL = THRIFT_INCOME_GL || productGL.income_account || productGL.income || '0110240630001';
      }

      // Generate identifiers
      const { CUST_ID, CUST_NO } = await generateCustomerNumber();
      const identifiers = await generateThriftAccountIdentifiers(t);
      let { ACCT_NO, ACCT_ID } = identifiers;
      const existing = await Thrift.findOne({ where: { ACCT_NO }, transaction: t });
      if (existing) {
        const newIds = await generateThriftAccountIdentifiers(t);
        ACCT_NO = newIds.ACCT_NO;
        ACCT_ID = newIds.ACCT_ID;
      }

      // Prepare address object
      let addressObj = null;
      if (address || city || state || zipCode) {
        addressObj = { street: address || '', city: city || '', state: state || '', zipCode: zipCode || '', country: 'Nigeria' };
      }

      // Create thrift account
      const thriftData = {
        CUST_ID, ACCT_NO, ACCT_ID, FIRST_NAME, LASTNAME, FULL_NAME: fullName,
        RELATIONSHIP_MANAGER: RELATIONSHIP_MANAGER || null,
        AMOUNT: 0,
        ADDRESS: addressObj ? JSON.stringify(addressObj) : null,
        COLLECTION_TYPE: collectionType,
        STATUS: 'ACTIVE', OPENED_DT: openDate, TRANSACTION_DATE: txDate,
        PRODUCT_ID: productId,
        totalContributions: 0, totalWithdrawals: 0,
        GL_ACCOUNTS: JSON.stringify({ cash_account: CASH_GL, income_account: THRIFT_INCOME_GL }),
        NOTES: `Thrift account opened for ${fullName} with service fee of ${amount}`,
        isActive: true
      };
      const thriftAccount = await Thrift.create(thriftData, { transaction: t });

      // Create opening service fee transaction
      const txIds = await generateTransactionIdentifiers(`THRIFT_${ACCT_NO}`, t);
      const transactionData = {
        ACCT_NO, ACCT_ID, BU_ID: 1, CUST_ID,
        ACCT_NM: `${fullName} Thrift Account`,
        AMOUNT: amount,
        transactionDirection: 'DEBIT',
        TRANSACTIONDATE: txDate,
        TRANSACTION_TYPE: 'SERVICE_FEE',
        ...txIds,
        description: `Thrift account opening service fee for ${fullName}`,
        currency: 'NGN', createdBy: 'SYSTEM', status: 'COMPLETED',
        metadata: JSON.stringify({
          isServiceFee: true, amount, collectionType, productId,
          glAccounts: { cash: CASH_GL, income: THRIFT_INCOME_GL }
        })
      };
      await Transaction.create(transactionData, { transaction: t });

      // GL double‑entry: DR Cash, CR Income
      const glJournalId = `THRIFT-FEE-${ACCT_NO}-${Date.now()}`;
      const glTxId = `GL-FEE-${txIds.TRANSACTION_IDENTIFIER}`;
      await GLAccountTransaction.create({
        JOURNAL_ID: glJournalId,
        TRANSACTION_ID: glTxId,
        TransactionId: Date.now(),
        DR_ACCT_NO: CASH_GL,
        CR_ACCT_NO: THRIFT_INCOME_GL,
        AMOUNT: amount,
        NARRATION: `Thrift account opening service fee for ${fullName} (Account: ${ACCT_NO})`,
        CREATED_BY: 'SYSTEM',
        TRANSACTION_TYPE: 'SERVICE_FEE',
        CURRENCY_CODE: 'NGN',
        STATUS: 'POSTED'
      }, { transaction: t });

      // Update GL balances
      await GLAccount.increment({ CURRENT_BALANCE: amount }, { where: { GL_ACCT_NO: CASH_GL }, transaction: t });
      await GLAccount.increment({ CURRENT_BALANCE: amount }, { where: { GL_ACCT_NO: THRIFT_INCOME_GL }, transaction: t });

      // Calculate next collection date
      let nextCollectionDate = new Date();
      switch (collectionType) {
        case 'DAILY': nextCollectionDate.setDate(nextCollectionDate.getDate() + 1); break;
        case 'WEEKLY': nextCollectionDate.setDate(nextCollectionDate.getDate() + 7); break;
        case 'MONTHLY': nextCollectionDate.setMonth(nextCollectionDate.getMonth() + 1); break;
        case 'QUARTERLY': nextCollectionDate.setMonth(nextCollectionDate.getMonth() + 3); break;
      }
      await thriftAccount.update({ nextCollectionDate }, { transaction: t });

      await t.commit();

      return res.status(201).json({
        success: true,
        message: 'Thrift account created successfully with GL posting',
        data: {
          thriftAccount: {
            CUST_ID, ACCT_NO, ACCT_ID, fullName,
            amount: 0, serviceFee: amount, collectionType,
            productId, productName: savingsProduct.productName,
            nextCollectionDate
          },
          transaction: { reference: txIds.REFERENCE, amount, type: 'SERVICE_FEE', status: 'COMPLETED' },
          glTransaction: { journalId: glJournalId, debitAccount: CASH_GL, creditAccount: THRIFT_INCOME_GL, amount }
        }
      });
    } catch (err) {
      if (t) await t.rollback();
      console.error('createThriftAccount failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

 
 // ─────────────────────────────────────────────
  //  Process daily collection (with GL)
  // ─────────────────────────────────────────────
  static async processDailyCollection(req, res) {
    let t;
    try {
      await ensureModelsInitialized();
      t = await sequelizeInstance.transaction();

      const { CUST_ID, ACCT_NO, amount, debitGLAccount, creditGLAccount } = req.body;
      if (!CUST_ID || !ACCT_NO || !amount) throw new Error('Missing required fields');
      const collectionAmount = parseFloat(amount);
      if (isNaN(collectionAmount) || collectionAmount <= 0) throw new Error('Amount must be positive');

      const thriftAccount = await Thrift.findOne({ where: { ACCT_NO }, transaction: t });
      if (!thriftAccount || thriftAccount.CUST_ID !== CUST_ID) throw new Error('Thrift account not found or customer mismatch');

      const currentBalance = parseFloat(thriftAccount.AMOUNT || 0);
      const newBalance = currentBalance + collectionAmount;
      const newContributions = (parseFloat(thriftAccount.totalContributions || 0)) + collectionAmount;

      await thriftAccount.update({
        AMOUNT: newBalance,
        totalContributions: newContributions,
        lastCollectionDate: new Date(),
        lastTransactionDate: new Date(),
        nextCollectionDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }, { transaction: t });

      // Transaction record
      const txIds = await generateTransactionIdentifiers(`COLL_${ACCT_NO}`, t);
      await Transaction.create({
        ...txIds,
        ACCT_NO, ACCT_ID: thriftAccount.ACCT_ID,
        BU_ID: 1, CUST_ID,
        ACCT_NM: thriftAccount.FULL_NAME ? `${thriftAccount.FULL_NAME} Thrift` : 'Thrift Account',
        AMOUNT: collectionAmount,
        transactionDirection: 'CREDIT',
        TRANSACTIONDATE: new Date(),
        TRANSACTION_TYPE: 'THRIFT_COLLECTION',
        description: 'Daily thrift collection',
        status: 'COMPLETED',
        createdBy: req.user?.id || 'SYSTEM',
        metadata: JSON.stringify({ collectionType: 'DAILY', previousBalance: currentBalance, newBalance })
      }, { transaction: t });

      // GL accounting
      let debitGL = debitGLAccount, creditGL = creditGLAccount;
      if (!debitGL || !creditGL) {
        const glSettings = thriftAccount.GL_ACCOUNTS ? JSON.parse(thriftAccount.GL_ACCOUNTS) : {};
        debitGL = debitGL || glSettings.cash_account || '0110120001';
        creditGL = creditGL || glSettings.income_account || '0110240630001';
      }

      const glJournalId = `THRIFT-COLL-${Date.now()}`;
      const glTxId = `GL-COLL-${txIds.TRANSACTION_IDENTIFIER}`;
      await GLAccountTransaction.create({
        JOURNAL_ID: glJournalId,
        TRANSACTION_ID: glTxId,
        TransactionId: Date.now(),
        DR_ACCT_NO: debitGL,
        CR_ACCT_NO: creditGL,
        AMOUNT: collectionAmount,
        NARRATION: `Thrift collection from ${CUST_ID} (Account: ${ACCT_NO})`,
        CREATED_BY: req.user?.id || 'SYSTEM',
        TRANSACTION_TYPE: 'THRIFT_COLLECTION',
        CURRENCY_CODE: 'NGN',
        STATUS: 'POSTED'
      }, { transaction: t });

      await GLAccount.increment({ CURRENT_BALANCE: collectionAmount }, { where: { GL_ACCT_NO: debitGL }, transaction: t });
      await GLAccount.increment({ CURRENT_BALANCE: collectionAmount }, { where: { GL_ACCT_NO: creditGL }, transaction: t });

      await t.commit();
      return res.status(200).json({
        success: true,
        message: 'Daily collection processed with GL posting',
        data: { accountNo: ACCT_NO, previousBalance: currentBalance, newBalance, amountCollected: collectionAmount }
      });
    } catch (error) {
      if (t) await t.rollback();
      console.error('processDailyCollection error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }


 
 // ─────────────────────────────────────────────
  //  Withdrawal request (PENDING approval)
  // ─────────────────────────────────────────────
  static async processWithdrawal(req, res) {
    let t;
    try {
      await ensureModelsInitialized();
      t = await sequelizeInstance.transaction();

      const { CUST_ID, ACCT_NO, amount, notes = '' } = req.body;
      if (!CUST_ID || !ACCT_NO || !amount) throw new Error('Missing required fields');
      const withdrawalAmount = parseFloat(amount);
      if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) throw new Error('Amount must be positive');

      const thriftAccount = await Thrift.findOne({ where: { ACCT_NO }, transaction: t });
      if (!thriftAccount || thriftAccount.CUST_ID !== CUST_ID) throw new Error('Thrift account not found');
      const currentBalance = parseFloat(thriftAccount.AMOUNT || 0);
      if (currentBalance < withdrawalAmount) throw new Error('Insufficient balance');

      const txIds = await generateTransactionIdentifiers(`WTH_${ACCT_NO}`, t);
      const withdrawalTx = await Transaction.create({
        ...txIds,
        ACCT_NO, ACCT_ID: thriftAccount.ACCT_ID,
        BU_ID: 1, CUST_ID,
        ACCT_NM: thriftAccount.FULL_NAME ? `${thriftAccount.FULL_NAME} Thrift` : 'Thrift Account',
        AMOUNT: withdrawalAmount,
        transactionDirection: 'DEBIT',
        TRANSACTIONDATE: new Date(),
        TRANSACTION_TYPE: 'THRIFT_WITHDRAWAL',
        description: 'Withdrawal request - pending approval',
        status: 'PENDING_APPROVAL',
        createdBy: req.user?.id || 'SYSTEM',
        metadata: JSON.stringify({ previousBalance: currentBalance, requestedAmount: withdrawalAmount, notes })
      }, { transaction: t });

      await t.commit();
      return res.status(200).json({
        success: true,
        message: 'Withdrawal request submitted for approval',
        data: { transactionId: txIds.TRANSACTION_IDENTIFIER, amount: withdrawalAmount, status: 'PENDING_APPROVAL' }
      });
    } catch (error) {
      if (t) await t.rollback();
      console.error('processWithdrawal error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }


// ─────────────────────────────────────────────
  //  Approve withdrawal (with GL)
  // ─────────────────────────────────────────────
  static async approveWithdrawal(req, res) {
    let t;
    try {
      await ensureModelsInitialized();
      const { transactionId, approvalNotes = '', reject = false, rejectionReason = '' } = req.body;
      if (!transactionId) throw new Error('Transaction ID required');
      const approverId = req.user?.id || 'SYSTEM';

      t = await sequelizeInstance.transaction();

      const withdrawalTx = await Transaction.findOne({
        where: { TRANSACTION_IDENTIFIER: transactionId, TRANSACTION_TYPE: 'THRIFT_WITHDRAWAL' },
        transaction: t
      });
      if (!withdrawalTx) throw new Error('Withdrawal transaction not found');
      if (withdrawalTx.status !== 'PENDING_APPROVAL') throw new Error(`Transaction not pending (status: ${withdrawalTx.status})`);

      if (reject) {
        if (!rejectionReason) throw new Error('Rejection reason required');
        await withdrawalTx.update({
          status: 'REJECTED',
          description: `Withdrawal rejected: ${rejectionReason}`,
          metadata: { ...withdrawalTx.metadata, status: 'REJECTED', rejectedBy: approverId, rejectionReason }
        }, { transaction: t });
        await t.commit();
        return res.status(200).json({ success: true, message: 'Withdrawal rejected', data: { transactionId, status: 'REJECTED' } });
      }

      // APPROVE
      const { CUST_ID, ACCT_NO, AMOUNT, metadata } = withdrawalTx;
      const withdrawalAmount = parseFloat(AMOUNT);
      const thriftAccount = await Thrift.findOne({ where: { ACCT_NO }, transaction: t });
      if (!thriftAccount) throw new Error('Thrift account not found');
      const currentBalance = parseFloat(thriftAccount.AMOUNT || 0);
      if (currentBalance < withdrawalAmount) throw new Error('Insufficient balance at approval time');

      const newBalance = currentBalance - withdrawalAmount;
      const newWithdrawals = (parseFloat(thriftAccount.totalWithdrawals || 0)) + withdrawalAmount;

      await thriftAccount.update({
        AMOUNT: newBalance,
        totalWithdrawals: newWithdrawals,
        lastTransactionDate: new Date()
      }, { transaction: t });

      await withdrawalTx.update({
        status: 'COMPLETED',
        description: 'Withdrawal approved and processed',
        metadata: { ...metadata, approvedBy: approverId, approvalNotes, previousBalance: currentBalance, newBalance }
      }, { transaction: t });

      // GL accounting for withdrawal: DR Liability, CR Cash
      const glSettings = thriftAccount.GL_ACCOUNTS ? JSON.parse(thriftAccount.GL_ACCOUNTS) : {};
      const liabilityGL = glSettings.liability_account || glSettings.income_account || '0110240630001';
      const cashGL = glSettings.cash_account || '0110120001';

      const glJournalId = `THRIFT-WTH-${Date.now()}`;
      const glTxId = `GL-WTH-${withdrawalTx.TRANSACTION_IDENTIFIER}`;
      await GLAccountTransaction.create({
        JOURNAL_ID: glJournalId,
        TRANSACTION_ID: glTxId,
        TransactionId: Date.now(),
        DR_ACCT_NO: liabilityGL,
        CR_ACCT_NO: cashGL,
        AMOUNT: withdrawalAmount,
        NARRATION: `Thrift withdrawal approval for ${CUST_ID} (Account: ${ACCT_NO})`,
        CREATED_BY: approverId,
        TRANSACTION_TYPE: 'THRIFT_WITHDRAWAL',
        CURRENCY_CODE: 'NGN',
        STATUS: 'POSTED'
      }, { transaction: t });

      await GLAccount.decrement({ CURRENT_BALANCE: withdrawalAmount }, { where: { GL_ACCT_NO: liabilityGL }, transaction: t });
      await GLAccount.decrement({ CURRENT_BALANCE: withdrawalAmount }, { where: { GL_ACCT_NO: cashGL }, transaction: t });

      await t.commit();
      return res.status(200).json({
        success: true,
        message: 'Withdrawal approved and processed',
        data: { transactionId, amount: withdrawalAmount, newBalance, previousBalance: currentBalance }
      });
    } catch (error) {
      if (t) await t.rollback();
      console.error('approveWithdrawal error:', error);
      return res.status(500).json({ success: false, error: error.message });
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
  //  Get transaction history for a thrift account (by CUST_ID/ACCT_NO)
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
      
      // Get total count of distinct customers matching the search
      const countResult = await Thrift.findAll({
        where: {
          [Op.or]: [
            { FIRST_NAME: { [Op.like]: `%${searchQuery}%` } },
            { LASTNAME: { [Op.like]: `%${searchQuery}%` } },
            { FULL_NAME: { [Op.like]: `%${searchQuery}%` } },
            { CUST_ID: { [Op.like]: `%${searchQuery}%` } }
          ]
        },
        attributes: [
          [sequelizeInstance.fn('DISTINCT', sequelizeInstance.col('CUST_ID')), 'CUST_ID']
        ]
      });

      const totalCount = countResult.length;

      if (totalCount === 0) {
        return res.status(200).json({
          success: true,
          message: 'No customers found',
          data: {
            customers: [],
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

      // Get paginated distinct customer IDs
      const distinctCustomerIds = await Thrift.findAll({
        where: {
          [Op.or]: [
            { FIRST_NAME: { [Op.like]: `%${searchQuery}%` } },
            { LASTNAME: { [Op.like]: `%${searchQuery}%` } },
            { FULL_NAME: { [Op.like]: `%${searchQuery}%` } },
            { CUST_ID: { [Op.like]: `%${searchQuery}%` } }
          ]
        },
        attributes: ['CUST_ID'],
        group: ['CUST_ID'],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const customerIdList = distinctCustomerIds.map(item => item.CUST_ID);

      // Get customer details for the paginated IDs - REMOVED PHONE_NO and other problematic columns
      const customers = await Thrift.findAll({
        where: {
          CUST_ID: {
            [Op.in]: customerIdList
          }
        },
        attributes: [
          'CUST_ID',
          'FIRST_NAME',
          'LASTNAME',
          'FULL_NAME',
          // 'PHONE_NO', // REMOVED - column doesn't exist
          // 'ADDRESS',  // REMOVED - might be JSON field
          'status',
          'OPENED_DT',
          'created_at'
        ]
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
          
          // Safely parse address if it exists
          let address = null;
          if (customer.ADDRESS) {
            try {
              address = typeof customer.ADDRESS === 'string' 
                ? JSON.parse(customer.ADDRESS) 
                : customer.ADDRESS;
            } catch (e) {
              address = customer.ADDRESS;
            }
          }
          
          return {
            customer: {
              CUST_ID: customer.CUST_ID,
              firstName: customer.FIRST_NAME,
              lastName: customer.LASTNAME,
              fullName: customer.FULL_NAME,
              // phone: null, // REMOVED - column doesn't exist
              // address: address, // REMOVED - might not exist
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
            total: totalCount,
            pages: Math.ceil(totalCount / limit),
            hasMore: (offset + customers.length) < totalCount
          },
          search: {
            term: searchQuery,
            totalResults: totalCount,
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

  static async getDashboardStats(req, res) {
    try {
      await ensureModelsInitialized();
      
      const totalAccounts = await Thrift.count();
      const activeAccounts = await Thrift.count({ where: { status: 'ACTIVE' } });
      const totalBalance = await Thrift.sum('AMOUNT');
      const pendingWithdrawals = await Transaction.count({
        where: { 
          TRANSACTION_TYPE: 'THRIFT_WITHDRAWAL',
          status: 'PENDING_APPROVAL'
        }
      });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const todayCollections = await Transaction.sum('AMOUNT', {
        where: {
          TRANSACTION_TYPE: 'DEPOSIT',
          description: 'Daily thrift collection',
          TRANSACTIONDATE: {
            [Op.between]: [today, tomorrow]
          }
        }
      });
      
      res.status(200).json({
        success: true,
        data: {
          totalAccounts,
          activeAccounts,
          totalBalance: parseFloat(totalBalance || 0),
          pendingWithdrawals,
          todayCollections: parseFloat(todayCollections || 0)
        }
      });
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      res.status(500).json({ success: false, error: error.message });
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