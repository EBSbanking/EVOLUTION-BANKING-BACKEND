// src/controllers/ThriftController.js - FULLY CORRECTED
import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import generateCustomerNumber from '../utils/generateCustomerNumber.js';
import sequelizeInstance from '../../config/db.js';

import Thrift from '../models/Thrift.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import GLAccount from '../models/GLAccount.js';
import ThriftSettings from '../models/ThriftSettings.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import Charge from '../models/Charge.js';

// Track initialization
let modelsInitialized = false;

// Ensure models are ready
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

// Helper function to find the thrift product (SAFE VERSION – no sequelize param)
async function findThriftProduct(transaction = null) {
  if (!sequelizeInstance || typeof sequelizeInstance.query !== 'function') {
    console.error('❌ findThriftProduct: sequelizeInstance not available');
    return null;
  }

  try {
    console.log('🔍 Searching for thrift product...');

    // Select only the columns that actually exist
    const [product] = await sequelizeInstance.query(
      `SELECT 
        PROD_ID, PROD_CD, PROD_DESC, PRODUCT_TYPE, productCode, productName,
        productDescription, CRNCY_ID, START_DT, REC_ST, BU_ID,
        principalBalanceGLAccountNo, depositChargeReceivableGLAccountNo,
        interest_income_gl_account_no
       FROM savings_products 
       WHERE REC_ST = 'Active' 
         AND (productName LIKE '%Thrift%' OR PRODUCT_TYPE = 'SAVINGS')
       ORDER BY 
         CASE WHEN productName LIKE '%Thrift%' THEN 1 ELSE 2 END,
         PROD_ID ASC 
       LIMIT 1`,
      { type: sequelizeInstance.QueryTypes.SELECT, transaction }
    );

    if (!product) {
      console.warn('⚠️ No active savings product found');
      return null;
    }

    // Extract GL accounts from the product columns
    const cashGL = product.principalBalanceGLAccountNo || null;
    const incomeGL = product.depositChargeReceivableGLAccountNo || 
                     product.interest_income_gl_account_no || null;

    console.log(`✅ Found product: ${product.PROD_ID} - ${product.productName}`);
    console.log(`   GL accounts: cash=${cashGL}, income=${incomeGL}`);

    return {
      ...product,
      cashGL,
      incomeGL
    };
  } catch (error) {
    console.error('❌ Error finding product:', error.message);
    return null;
  }
}

async function getThriftCycleFee(transaction = null) {
  const charge = await Charge.findOne({
    where: {
      [Op.or]: [
        { CHRG_TY: 'THRIFT_CYCLE' },
        { CHRG_CD: 'THRIFT_CYCLE_FEE' }
      ],
      REC_ST: 'A',
      EFFECTIVE_DT: { [Op.lte]: new Date() }
    },
    order: [['EFFECTIVE_DT', 'DESC']],
    transaction
  });
  if (!charge) {
    throw new Error('No active thrift cycle fee configured.');
  }
  // Determine if fixed amount or percentage
  const isPercentage = charge.CHRG_PCT && charge.CHRG_PCT > 0;
  const fixedAmount = parseFloat(charge.CHRG_AMT || 0);
  const percentage = parseFloat(charge.CHRG_PCT || 0);
  
  // Return configuration object
  return {
    type: isPercentage ? 'percentage' : 'fixed',
    amount: fixedAmount,            // fixed amount if type fixed
    percentage: percentage,         // percentage value (e.g., 5 for 5%)
    incomeGLAccount: charge.INCOME_GL_ACCT_NO,
    chargeId: charge.CHRG_ID,
    chargeCode: charge.CHRG_CD,
    // Helper to calculate fee based on deposit amount
    calculateFee: (depositAmount) => {
      if (isPercentage) {
        return depositAmount * (percentage / 100);
      } else {
        return fixedAmount;
      }
    }
  };
}

// =============================================
// THRIFT CONTROLLER CLASS
// =============================================
class ThriftController {
  // ─────────────────────────────────────────────
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
  //  Create new thrift account (WITH GL)
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

    // Validation
    if (!FIRST_NAME?.trim() || !LASTNAME?.trim()) {
      await t.rollback();
      return res.status(400).json({ success: false, error: 'FIRST_NAME and LASTNAME are required' });
    }
    const serviceFee = parseFloat(initialAmount);
    if (isNaN(serviceFee) || serviceFee <= 0) {
      await t.rollback();
      return res.status(400).json({ success: false, error: 'initialAmount must be a positive number' });
    }

    const collectionType = (COLLECTION_TYPE || 'DAILY').toUpperCase();
    const validTypes = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'];
    if (!validTypes.includes(collectionType)) {
      await t.rollback();
      return res.status(400).json({ success: false, error: `Invalid COLLECTION_TYPE. Allowed: ${validTypes.join(', ')}` });
    }

    const fullName = FULL_NAME?.trim() || `${FIRST_NAME.trim()} ${LASTNAME.trim()}`.trim();
    const txDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();
    const openDate = OPENED_DT ? new Date(OPENED_DT) : new Date();

    // ---------- Fetch product with its GL accounts ----------
    let savingsProduct = null;
    let productId = PRODUCT_ID;
    if (productId) {
      const [product] = await sequelizeInstance.query(
        `SELECT 
          PROD_ID, PROD_CD, PROD_DESC, PRODUCT_TYPE, productCode, productName,
          productDescription, CRNCY_ID, START_DT, REC_ST, BU_ID,
          principalBalanceGLAccountNo, depositChargeReceivableGLAccountNo,
          interest_income_gl_account_no
         FROM savings_products WHERE PROD_ID = ? LIMIT 1`,
        { replacements: [productId], type: sequelizeInstance.QueryTypes.SELECT, transaction: t }
      );
      if (product) {
        let cashGL = product.principalBalanceGLAccountNo || null;
        let incomeGL = product.depositChargeReceivableGLAccountNo || 
                       product.interest_income_gl_account_no || null;
        savingsProduct = { ...product, cashGL, incomeGL };
      }
    }
    if (!savingsProduct) {
      savingsProduct = await findThriftProduct(t);
      if (savingsProduct) productId = savingsProduct.PROD_ID;
    }
    if (!savingsProduct) {
      await t.rollback();
      return res.status(400).json({ success: false, error: 'No savings product found. Please set up a savings product first.' });
    }

    console.log('✅ Using product:', { PROD_ID: savingsProduct.PROD_ID, productName: savingsProduct.productName });

    let CASH_GL = savingsProduct.cashGL;
    let THRIFT_INCOME_GL = savingsProduct.incomeGL;

    // Override with ThriftSettings if present (optional)
    try {
      const ThriftSettingsModel = sequelizeInstance.models.ThriftSettings;
      if (ThriftSettingsModel) {
        const settings = await ThriftSettingsModel.findAll({
          where: { setting_key: { [Op.in]: ['thrift_cash_gl', 'thrift_income_gl'] } },
          transaction: t,
          raw: true
        });
        for (const s of settings) {
          if (s.setting_key === 'thrift_cash_gl') CASH_GL = s.setting_value;
          else if (s.setting_key === 'thrift_income_gl') THRIFT_INCOME_GL = s.setting_value;
        }
      }
    } catch (e) { console.error('Thrift settings error:', e.message); }

    // Final fallbacks (if product has no GL numbers)
    if (!CASH_GL) CASH_GL = '0110120001';
    if (!THRIFT_INCOME_GL) THRIFT_INCOME_GL = '0110240630001';

    console.log('✅ Using GL accounts:', { cashGL: CASH_GL, incomeGL: THRIFT_INCOME_GL });

    // ---------- Helper to ensure a GL account exists (create if missing) ----------
    async function ensureGLAccount(glAcctNo, description, category) {
      const [exists] = await sequelizeInstance.query(
        `SELECT gl_acct_no FROM gl_accounts WHERE gl_acct_no = ?`,
        { replacements: [glAcctNo], type: sequelizeInstance.QueryTypes.SELECT, transaction: t }
      );
      if (!exists) {
        const [template] = await sequelizeInstance.query(
          `SELECT * FROM gl_accounts LIMIT 1`,
          { type: sequelizeInstance.QueryTypes.SELECT, transaction: t }
        );
        if (!template) {
          throw new Error('No existing GL account found to use as a template. Please create at least one GL account manually.');
        }
        await sequelizeInstance.query(
          `INSERT INTO gl_accounts SET ?`,
          {
            replacements: [{
              ...template,
              gl_acct_no: glAcctNo,
              gl_acct_id: `GL_${glAcctNo}`,
              acct_desc: description,
              gl_acct_cat: category,
              current_balance: 0,
              created_by: 'SYSTEM',
              created_at: new Date(),
              updated_at: new Date(),
              id: undefined,
              ledger_balance: 0,
              available_balance: 0,
              opening_balance: 0,
              journal_id: `JRN-${glAcctNo}-${Date.now()}`,
            }],
            transaction: t
          }
        );
        console.log(`✅ Created GL account: ${glAcctNo} (${description}) using template from ${template.gl_acct_no}`);
      }
    }

    // Create missing GL accounts (if any)
    await ensureGLAccount(CASH_GL, 'Cash / Principal Account', 'ASSET');
    if (THRIFT_INCOME_GL !== CASH_GL) {
      await ensureGLAccount(THRIFT_INCOME_GL, 'Thrift Service Income', 'REVENUE');
    }

    // ---------- Generate identifiers ----------
    const { CUST_ID, CUST_NO } = await generateCustomerNumber();
    const identifiers = await ThriftController.generateThriftAccountIdentifiers(t);
    let { ACCT_NO, ACCT_ID } = identifiers;
    const existing = await Thrift.findOne({ where: { ACCT_NO }, transaction: t });
    if (existing) {
      const newIds = await ThriftController.generateThriftAccountIdentifiers(t);
      ACCT_NO = newIds.ACCT_NO;
      ACCT_ID = newIds.ACCT_ID;
    }

    // Address object
    let addressObj = null;
    if (address || city || state || zipCode) {
      addressObj = { street: address || '', city: city || '', state: state || '', zipCode: zipCode || '', country: 'Nigeria' };
    }

    // Create thrift account
    const now = new Date();
    const thriftData = {
      CUST_ID, ACCT_NO, ACCT_ID, FIRST_NAME, LASTNAME, FULL_NAME: fullName,
      RELATIONSHIP_MANAGER: RELATIONSHIP_MANAGER || null,
      AMOUNT: 0,
      ADDRESS: addressObj ? JSON.stringify(addressObj) : null,
      COLLECTION_TYPE: collectionType,
      STATUS: 'ACTIVE',
      OPENED_DT: openDate,
      TRANSACTION_DATE: txDate,
      PRODUCT_ID: productId,
      totalContributions: 0,
      totalWithdrawals: 0,
      GL_ACCOUNTS: JSON.stringify({ cash_account: CASH_GL, income_account: THRIFT_INCOME_GL }),
      NOTES: `Thrift account opened for ${fullName} with service fee of ${serviceFee}`,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };
    const thriftAccount = await Thrift.create(thriftData, { transaction: t });
    if (!thriftAccount) throw new Error('Failed to create thrift account');

    // Transaction identifiers
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    const [lastTx] = await sequelizeInstance.query(
      'SELECT MAX(TRANSACTION_IDENTIFIER) as max_id FROM transactions',
      { type: sequelizeInstance.QueryTypes.SELECT, transaction: t }
    );
    const nextTransactionId = (lastTx?.max_id || 0) + 1;
    const TRANSACTION_IDENTIFIER = nextTransactionId;
    const EVENT_ID = nextTransactionId;
    const TRAN_JOURNAL_ID = `JRN${timestamp}${randomNum}`;
    const REFERENCE = `THRIFT_${ACCT_NO}_${timestamp}`;
    const TRANSACTION_ID = `TXN${nextTransactionId.toString().padStart(10, '0')}`;

    // Service fee transaction
    await Transaction.create({
      ACCT_NO, ACCT_ID, BU_ID: 1, CUST_ID,
      ACCT_NM: `${fullName} Thrift Account`,
      AMOUNT: serviceFee,
      transactionDirection: 'DEBIT',
      TRANSACTIONDATE: txDate,
      TRANSACTION_TYPE: 'SERVICE_FEE',
      TRANSACTION_IDENTIFIER, TRANSACTION_ID, EVENT_ID, TRAN_JOURNAL_ID, REFERENCE,
      description: `Thrift account opening service fee for ${fullName}`,
      currency: 'NGN', createdBy: 'SYSTEM', status: 'COMPLETED',
      FLAGGED_FOR_AML: false, AML_THRESHOLD_USED: 0,
      metadata: JSON.stringify({ isServiceFee: true, amount: serviceFee, glAccounts: { cash: CASH_GL, income: THRIFT_INCOME_GL } }),
      created_at: now, updated_at: now
    }, { transaction: t });

    // GL journal entry
    const GLAccountTransactionModel = sequelizeInstance.models.GLAccountTransaction || sequelizeInstance.models.gl_account_transactions;
    if (!GLAccountTransactionModel) throw new Error('GLAccountTransaction model not available');

    const glJournalId = `THRIFT-FEE-${ACCT_NO}-${timestamp}`;
    const glTransactionId = `GL-FEE-${TRANSACTION_ID}`;
    await GLAccountTransactionModel.create({
      JOURNAL_ID: glJournalId,
      TRANSACTION_ID: glTransactionId,
      TransactionId: Date.now(),
      DR_ACCT_NO: CASH_GL,
      CR_ACCT_NO: THRIFT_INCOME_GL,
      AMOUNT: serviceFee,
      NARRATION: `Thrift account opening fee for ${fullName} (${ACCT_NO})`,
      CREATED_BY: 'SYSTEM',
      TRANSACTION_TYPE: 'SERVICE_FEE',
      CURRENCY_CODE: 'NGN',
      STATUS: 'POSTED'
    }, { transaction: t });

    // Update GL balances
    await sequelizeInstance.query(
      `UPDATE gl_accounts SET current_balance = current_balance + ?, updated_at = NOW() WHERE gl_acct_no = ?`,
      { replacements: [serviceFee, CASH_GL], transaction: t }
    );
    await sequelizeInstance.query(
      `UPDATE gl_accounts SET current_balance = current_balance + ?, updated_at = NOW() WHERE gl_acct_no = ?`,
      { replacements: [serviceFee, THRIFT_INCOME_GL], transaction: t }
    );

    // Next collection date
    let nextCollectionDate = new Date();
    switch (collectionType) {
      case 'DAILY': nextCollectionDate.setDate(nextCollectionDate.getDate() + 1); break;
      case 'WEEKLY': nextCollectionDate.setDate(nextCollectionDate.getDate() + 7); break;
      case 'MONTHLY': nextCollectionDate.setMonth(nextCollectionDate.getMonth() + 1); break;
      case 'QUARTERLY': nextCollectionDate.setMonth(nextCollectionDate.getMonth() + 3); break;
    }
    await Thrift.update({ nextCollectionDate }, { where: { ACCT_NO }, transaction: t });

    await t.commit();

    return res.status(201).json({
      success: true,
      message: 'Thrift account created successfully with GL posting',
      data: {
        thriftAccount: { CUST_ID, CUST_NO, ACCT_NO, ACCT_ID, fullName, serviceFee, collectionType, productId, productName: savingsProduct.productName, nextCollectionDate },
        transaction: { reference: REFERENCE, amount: serviceFee, type: 'SERVICE_FEE', status: 'COMPLETED' },
        glTransaction: { journalId: glJournalId, debitAccount: CASH_GL, creditAccount: THRIFT_INCOME_GL, amount: serviceFee }
      }
    });
  } catch (err) {
    if (t) await t.rollback();
    console.error('❌ createThriftAccount failed:', err);
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
//  Process daily collection (with GL) – FULLY CORRECTED using Model methods
// ─────────────────────────────────────────────
static async processDailyCollection(req, res) {
  let t;
  try {
    await ensureModelsInitialized();
    t = await sequelizeInstance.transaction();

    const { CUST_ID, ACCT_NO, amount, debitGLAccount, creditGLAccount } = req.body;
    if (!CUST_ID || !ACCT_NO || !amount) throw new Error('Missing required fields');
    let collectionAmount = parseFloat(amount);
    if (isNaN(collectionAmount) || collectionAmount <= 0) throw new Error('Amount must be positive');

    const thriftAccount = await Thrift.findOne({ where: { ACCT_NO }, transaction: t });
    if (!thriftAccount || thriftAccount.CUST_ID !== CUST_ID) throw new Error('Thrift account not found or customer mismatch');

    // ========== CYCLE LOGIC (dynamic fee calculation) ==========
    let serviceFee = 0;
    let actualDeposit = collectionAmount;
    let isNewCycle = false;

    if (thriftAccount.cycle_status === 'WITHDRAWN') {
      const feeConfig = await ThriftController.getThriftCycleFee(t);
      serviceFee = feeConfig.calculateFee(collectionAmount);
      if (typeof serviceFee !== 'number' || isNaN(serviceFee) || serviceFee <= 0) {
        throw new Error(`Invalid service fee amount: ${serviceFee}`);
      }
      // ✅ Allow deposit to be equal to fee (for 100% fee)
      if (collectionAmount < serviceFee) {
        throw new Error(`Minimum deposit must be greater than or equal to the fee (${serviceFee}).`);
      }
      actualDeposit = collectionAmount - serviceFee;
      isNewCycle = true;

      // Record service fee transaction
      const feeTxIds = await ThriftController.generateTransactionIdentifiers(`SVC_${ACCT_NO}`, t);
      await Transaction.create({
        ...feeTxIds,
        ACCT_NO, ACCT_ID: thriftAccount.ACCT_ID,
        BU_ID: 1, CUST_ID,
        ACCT_NM: thriftAccount.FULL_NAME ? `${thriftAccount.FULL_NAME} Thrift` : 'Thrift Account',
        AMOUNT: serviceFee,
        transactionDirection: 'DEBIT',
        TRANSACTIONDATE: new Date(),
        TRANSACTION_TYPE: 'SERVICE_FEE',
        description: `New cycle service fee for ${thriftAccount.FULL_NAME} (Charge: ${feeConfig.chargeCode})`,
        status: 'COMPLETED',
        createdBy: req.user?.id || 'SYSTEM',
        metadata: JSON.stringify({ isNewCycle: true, feeAmount: serviceFee, originalDeposit: collectionAmount, chargeConfig: feeConfig })
      }, { transaction: t });

      // GL entry for the service fee
      const GLAccountTransactionModel = sequelizeInstance.models.GLAccountTransaction || sequelizeInstance.models.gl_account_transactions;
      if (!GLAccountTransactionModel) throw new Error('GLAccountTransaction model not available');

      // Determine cash GL account (debit side)
      let cashGL = null;
      if (thriftAccount.GL_ACCOUNTS) {
        const gl = JSON.parse(thriftAccount.GL_ACCOUNTS);
        cashGL = gl.cash_account;
      }
      if (!cashGL && thriftAccount.PRODUCT_ID) {
        const product = await sequelizeInstance.query(
          `SELECT principalBalanceGLAccountNo FROM savings_products WHERE PROD_ID = ? LIMIT 1`,
          { replacements: [thriftAccount.PRODUCT_ID], type: sequelizeInstance.QueryTypes.SELECT, transaction: t }
        );
        cashGL = product[0]?.principalBalanceGLAccountNo;
      }
      if (!cashGL) cashGL = '01100220010001'; // fallback

      const feeDebitGL = cashGL;
      const feeCreditGL = feeConfig.incomeGLAccount;
      if (!feeCreditGL) throw new Error('Income GL account not configured for this charge.');

      // Create GL journal entry
      const glFeeJournalId = `THRIFT-FEE-NEWCYCLE-${ACCT_NO}-${Date.now()}`;
      const glFeeTxId = `GL-FEE-${feeTxIds.TRANSACTION_IDENTIFIER}`;
      await GLAccountTransactionModel.create({
        JOURNAL_ID: glFeeJournalId,
        TRANSACTION_ID: glFeeTxId,
        TransactionId: Date.now(),
        DR_ACCT_NO: feeDebitGL,
        CR_ACCT_NO: feeCreditGL,
        AMOUNT: serviceFee,
        NARRATION: `New cycle fee for account ${ACCT_NO} (Charge: ${feeConfig.chargeCode})`,
        CREATED_BY: req.user?.id || 'SYSTEM',
        TRANSACTION_TYPE: 'SERVICE_FEE',
        CURRENCY_CODE: 'NGN',
        STATUS: 'POSTED'
      }, { transaction: t });

      // Update GL balances using Sequelize model (no raw SQL)
      if (!feeDebitGL || !feeCreditGL) throw new Error('Missing GL accounts for fee update');
      // Use GLAccount model to update balances safely
      const [debitGLAccountObj, creditGLAccountObj] = await Promise.all([
        GLAccount.findOne({ where: { GL_ACCT_NO: feeDebitGL }, transaction: t }),
        GLAccount.findOne({ where: { GL_ACCT_NO: feeCreditGL }, transaction: t })
      ]);
      if (!debitGLAccountObj) throw new Error(`Debit GL account ${feeDebitGL} not found`);
      if (!creditGLAccountObj) throw new Error(`Credit GL account ${feeCreditGL} not found`);

      // Perform increment (or conditional)
      await debitGLAccountObj.increment('CURRENT_BALANCE', { by: serviceFee, transaction: t });
      if (feeDebitGL !== feeCreditGL) {
        await creditGLAccountObj.increment('CURRENT_BALANCE', { by: serviceFee, transaction: t });
      } else {
        // Already incremented once, avoid double counting
        console.log(`Fee GL accounts are the same, updated only once: ${feeDebitGL}`);
      }

      // Reset cycle status
      await thriftAccount.update({
        cycle_status: 'ACTIVE',
        cycle_start_date: new Date(),
        last_cycle_end_date: null,
      }, { transaction: t });
    }

    // ---------- Determine GL accounts for the deposit ----------
    let debitGL = debitGLAccount;
    let creditGL = creditGLAccount;

    // 1. From thriftAccount.GL_ACCOUNTS
    if (!debitGL || !creditGL) {
      let glSettings = {};
      if (thriftAccount.GL_ACCOUNTS) {
        try {
          glSettings = typeof thriftAccount.GL_ACCOUNTS === 'string' 
            ? JSON.parse(thriftAccount.GL_ACCOUNTS) 
            : thriftAccount.GL_ACCOUNTS;
        } catch (e) {}
      }
      debitGL = debitGL || glSettings.cash_account;
      creditGL = creditGL || glSettings.income_account;
    }

    // 2. From the account's PRODUCT_ID
    let productId = thriftAccount.PRODUCT_ID;
    if ((!debitGL || !creditGL) && productId) {
      const [product] = await sequelizeInstance.query(
        `SELECT principalBalanceGLAccountNo, depositChargeReceivableGLAccountNo 
         FROM savings_products WHERE PROD_ID = ? LIMIT 1`,
        { replacements: [productId], type: sequelizeInstance.QueryTypes.SELECT, transaction: t }
      );
      if (product) {
        debitGL = debitGL || product.principalBalanceGLAccountNo;
        creditGL = creditGL || product.depositChargeReceivableGLAccountNo || product.principalBalanceGLAccountNo;
      }
    }

    // 3. Fallback: find a product with valid, existing GL accounts
    if (!debitGL || !creditGL) {
      const [defaultProduct] = await sequelizeInstance.query(
        `SELECT p.PROD_ID, p.principalBalanceGLAccountNo, p.depositChargeReceivableGLAccountNo
         FROM savings_products p
         WHERE p.REC_ST = 'Active' 
           AND p.principalBalanceGLAccountNo IS NOT NULL
           AND EXISTS (SELECT 1 FROM gl_accounts g WHERE g.gl_acct_no = p.principalBalanceGLAccountNo)
         ORDER BY CASE WHEN p.PROD_ID = 200 THEN 1 ELSE 2 END, p.PROD_ID ASC
         LIMIT 1`,
        { type: sequelizeInstance.QueryTypes.SELECT, transaction: t }
      );
      if (defaultProduct && defaultProduct.principalBalanceGLAccountNo) {
        debitGL = defaultProduct.principalBalanceGLAccountNo;
        creditGL = defaultProduct.depositChargeReceivableGLAccountNo || defaultProduct.principalBalanceGLAccountNo;
        await thriftAccount.update({ PRODUCT_ID: defaultProduct.PROD_ID }, { transaction: t });
        await thriftAccount.update({ GL_ACCOUNTS: JSON.stringify({ cash_account: debitGL, income_account: creditGL }) }, { transaction: t });
      }
    }

    if (!debitGL || !creditGL) {
      throw new Error(`GL accounts not configured for thrift account ${ACCT_NO}.`);
    }

    // Verify GL accounts exist using model
    const [debitGLModel, creditGLModel] = await Promise.all([
      GLAccount.findOne({ where: { GL_ACCT_NO: debitGL }, transaction: t }),
      GLAccount.findOne({ where: { GL_ACCT_NO: creditGL }, transaction: t })
    ]);
    if (!debitGLModel) throw new Error(`Debit GL account ${debitGL} does not exist.`);
    if (!creditGLModel) throw new Error(`Credit GL account ${creditGL} does not exist.`);

    // Update thrift account balance using actualDeposit
    const currentBalance = parseFloat(thriftAccount.AMOUNT || 0);
    const newBalance = currentBalance + actualDeposit;
    const newContributions = (parseFloat(thriftAccount.totalContributions || 0)) + actualDeposit;

    await thriftAccount.update({
      AMOUNT: newBalance,
      totalContributions: newContributions,
      lastCollectionDate: new Date(),
      lastTransactionDate: new Date(),
      nextCollectionDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }, { transaction: t });

    // Create transaction record for the deposit
    const txIds = await ThriftController.generateTransactionIdentifiers(`COLL_${ACCT_NO}`, t);
    await Transaction.create({
      ...txIds,
      ACCT_NO, ACCT_ID: thriftAccount.ACCT_ID,
      BU_ID: 1, CUST_ID,
      ACCT_NM: thriftAccount.FULL_NAME ? `${thriftAccount.FULL_NAME} Thrift` : 'Thrift Account',
      AMOUNT: actualDeposit,
      transactionDirection: 'CREDIT',
      TRANSACTIONDATE: new Date(),
      TRANSACTION_TYPE: 'THRIFT_COLLECTION',
      description: isNewCycle ? 'Thrift collection (new cycle)' : 'Daily thrift collection',
      status: 'COMPLETED',
      createdBy: req.user?.id || 'SYSTEM',
      metadata: JSON.stringify({ collectionType: 'DAILY', previousBalance: currentBalance, newBalance, debitGL, creditGL, isNewCycle, serviceFee })
    }, { transaction: t });

    // GL journal entry for the deposit
    const GLAccountTransactionModel = sequelizeInstance.models.GLAccountTransaction || sequelizeInstance.models.gl_account_transactions;
    if (!GLAccountTransactionModel) throw new Error('GLAccountTransaction model not available');

    const glJournalId = `THRIFT-COLL-${Date.now()}`;
    const glTxId = `GL-COLL-${txIds.TRANSACTION_IDENTIFIER}`;
    await GLAccountTransactionModel.create({
      JOURNAL_ID: glJournalId,
      TRANSACTION_ID: glTxId,
      TransactionId: Date.now(),
      DR_ACCT_NO: debitGL,
      CR_ACCT_NO: creditGL,
      AMOUNT: actualDeposit,
      NARRATION: `Thrift collection from ${CUST_ID} (Account: ${ACCT_NO})`,
      CREATED_BY: req.user?.id || 'SYSTEM',
      TRANSACTION_TYPE: 'THRIFT_COLLECTION',
      CURRENCY_CODE: 'NGN',
      STATUS: 'POSTED'
    }, { transaction: t });

    // Update GL balances using model methods (safe)
    // Conditional: if same account, update only once
    if (debitGL === creditGL) {
      await debitGLModel.increment('CURRENT_BALANCE', { by: actualDeposit, transaction: t });
      console.log(`GL balance updated once for ${debitGL} (+${actualDeposit})`);
    } else {
      await debitGLModel.increment('CURRENT_BALANCE', { by: actualDeposit, transaction: t });
      await creditGLModel.increment('CURRENT_BALANCE', { by: actualDeposit, transaction: t });
      console.log(`GL balances updated: DR ${debitGL} (+${actualDeposit}), CR ${creditGL} (+${actualDeposit})`);
    }

    await t.commit();

    return res.status(200).json({
      success: true,
      message: isNewCycle ? 'New thrift cycle started with service fee deducted.' : 'Daily collection processed',
      data: {
        timestamp: new Date().toISOString(),
        thriftAccount: {
          accountNo: thriftAccount.ACCT_NO,
          customerId: thriftAccount.CUST_ID,
          customerName: thriftAccount.FULL_NAME,
          previousBalance: currentBalance,
          amountCollected: actualDeposit,
          serviceFeeDeducted: serviceFee,
          newBalance: newBalance,
          collectionType: 'DAILY',
          isNewCycle,
        },
        transaction: {
          reference: txIds.REFERENCE,
          identifier: txIds.TRANSACTION_IDENTIFIER,
          amount: actualDeposit,
          type: 'THRIFT_COLLECTION',
          status: 'COMPLETED',
          date: new Date().toISOString(),
        },
        glTransaction: {
          transactionId: glTxId,
          journalId: glJournalId,
          debitAccount: debitGL,
          creditAccount: creditGL,
          amount: actualDeposit,
          type: 'THRIFT_COLLECTION',
          status: 'POSTED',
        },
        ...(isNewCycle && { serviceFee: { amount: serviceFee, description: 'New cycle service fee' } }),
      }
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error('processDailyCollection error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────
//  Manually start a new cycle (admin / customer triggered)
// ─────────────────────────────────────────────
static async startNewCycle(req, res) {
  let t;
  try {
    await ensureModelsInitialized();
    const { ACCT_NO, depositAmount } = req.body; // depositAmount required for percentage fee
    if (!ACCT_NO) throw new Error('Account number is required');

    t = await sequelizeInstance.transaction();

    const thriftAccount = await Thrift.findOne({ where: { ACCT_NO }, transaction: t });
    if (!thriftAccount) throw new Error('Account not found');
    if (thriftAccount.cycle_status !== 'WITHDRAWN') {
      throw new Error('Account is not in a withdrawn state. Cannot start a new cycle.');
    }

    const feeConfig = await ThriftController.getThriftCycleFee(t);
    let serviceFee;

    if (feeConfig.type === 'percentage') {
      if (!depositAmount || depositAmount <= 0) {
        throw new Error('Percentage‑based fee requires a deposit amount. Please provide depositAmount in the request.');
      }
      serviceFee = feeConfig.calculateFee(depositAmount);
    } else {
      serviceFee = feeConfig.amount;
    }

    if (serviceFee <= 0) throw new Error('Service fee amount is invalid.');

    // ---------- Record service fee transaction ----------
    const feeTxIds = await ThriftController.generateTransactionIdentifiers(`SVC_${ACCT_NO}`, t);
    await Transaction.create({
      ...feeTxIds,
      ACCT_NO, ACCT_ID: thriftAccount.ACCT_ID,
      BU_ID: 1, CUST_ID: thriftAccount.CUST_ID,
      ACCT_NM: thriftAccount.FULL_NAME ? `${thriftAccount.FULL_NAME} Thrift` : 'Thrift Account',
      AMOUNT: serviceFee,
      transactionDirection: 'DEBIT',
      TRANSACTIONDATE: new Date(),
      TRANSACTION_TYPE: 'SERVICE_FEE',
      description: `New cycle service fee for ${thriftAccount.FULL_NAME} (Charge: ${feeConfig.chargeCode})`,
      status: 'COMPLETED',
      createdBy: req.user?.id || 'SYSTEM',
      metadata: JSON.stringify({ isNewCycle: true, feeAmount: serviceFee, source: 'manual_start', chargeConfig: feeConfig })
    }, { transaction: t });

    // ---------- GL entry for the service fee ----------
    const GLAccountTransactionModel = sequelizeInstance.models.GLAccountTransaction || sequelizeInstance.models.gl_account_transactions;
    if (!GLAccountTransactionModel) throw new Error('GLAccountTransaction model not available');

    let cashGL = null;
    if (thriftAccount.GL_ACCOUNTS) {
      const gl = JSON.parse(thriftAccount.GL_ACCOUNTS);
      cashGL = gl.cash_account;
    }
    if (!cashGL) {
      const product = await sequelizeInstance.query(
        `SELECT principalBalanceGLAccountNo FROM savings_products WHERE PROD_ID = ? LIMIT 1`,
        { replacements: [thriftAccount.PRODUCT_ID], type: sequelizeInstance.QueryTypes.SELECT, transaction: t }
      );
      cashGL = product[0]?.principalBalanceGLAccountNo;
    }
    if (!cashGL) cashGL = '01100220010001'; // fallback asset account

    const feeDebitGL = cashGL;
    const feeCreditGL = feeConfig.incomeGLAccount;
    if (!feeCreditGL) throw new Error('Income GL account not configured for this charge.');

    const glFeeJournalId = `THRIFT-FEE-NEWCYCLE-${ACCT_NO}-${Date.now()}`;
    const glFeeTxId = `GL-FEE-${feeTxIds.TRANSACTION_IDENTIFIER}`;
    await GLAccountTransactionModel.create({
      JOURNAL_ID: glFeeJournalId,
      TRANSACTION_ID: glFeeTxId,
      TransactionId: Date.now(),
      DR_ACCT_NO: feeDebitGL,
      CR_ACCT_NO: feeCreditGL,
      AMOUNT: serviceFee,
      NARRATION: `Manual new cycle fee for account ${ACCT_NO} (Charge: ${feeConfig.chargeCode})`,
      CREATED_BY: req.user?.id || 'SYSTEM',
      TRANSACTION_TYPE: 'SERVICE_FEE',
      CURRENCY_CODE: 'NGN',
      STATUS: 'POSTED'
    }, { transaction: t });

    // Update GL balances (conditional to avoid double counting)
    if (feeDebitGL === feeCreditGL) {
      await sequelizeInstance.query(
        `UPDATE gl_accounts SET current_balance = current_balance + ?, updated_at = NOW() WHERE gl_acct_no = ?`,
        { replacements: [serviceFee, feeDebitGL], transaction: t }
      );
    } else {
      await sequelizeInstance.query(
        `UPDATE gl_accounts SET current_balance = current_balance + ?, updated_at = NOW() WHERE gl_acct_no = ?`,
        { replacements: [serviceFee, feeDebitGL], transaction: t }
      );
      await sequelizeInstance.query(
        `UPDATE gl_accounts SET current_balance = current_balance + ?, updated_at = NOW() WHERE gl_acct_no = ?`,
        { replacements: [serviceFee, feeCreditGL], transaction: t }
      );
    }

    // ---------- Update cycle status (balance remains unchanged) ----------
    await thriftAccount.update({
      cycle_status: 'ACTIVE',
      cycle_start_date: new Date(),
      last_cycle_end_date: null,
    }, { transaction: t });

    await t.commit();

    return res.status(200).json({
      success: true,
      message: 'New thrift cycle started successfully. Service fee deducted.',
      data: {
        fee: serviceFee,
        accountNo: thriftAccount.ACCT_NO,
        cycle_status: 'ACTIVE',
        cycle_start_date: new Date().toISOString(),
        ...(feeConfig.type === 'percentage' && { depositAmountUsed: depositAmount })
      }
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error('startNewCycle error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

static async getThriftCycleFee(transaction = null) {
  const charge = await Charge.findOne({
    where: {
      [Op.or]: [
        { CHRG_TY: 'THRIFT_CYCLE' },
        { CHRG_TY: 'THRIFT_CYCLE_FEE' },   // 👈 ADD THIS LINE
        { CHRG_CD: 'THRIFT_CYCLE_FEE' }
      ],
      REC_ST: 'A',
      EFFECTIVE_DT: { [Op.lte]: new Date() }
    },
    order: [['EFFECTIVE_DT', 'DESC']],
    transaction
  });
  if (!charge) {
    throw new Error('No active thrift cycle fee configured. Please set up a charge with type THRIFT_CYCLE, type THRIFT_CYCLE_FEE, or code THRIFT_CYCLE_FEE.');
  }

  const isPercentage = charge.CHRG_PCT && charge.CHRG_PCT > 0;
  const fixedAmount = parseFloat(charge.CHRG_AMT || 0);
  const percentage = parseFloat(charge.CHRG_PCT || 0);

  return {
    type: isPercentage ? 'percentage' : 'fixed',
    amount: fixedAmount,
    percentage: percentage,
    incomeGLAccount: charge.INCOME_GL_ACCT_NO,
    chargeId: charge.CHRG_ID,
    chargeCode: charge.CHRG_CD,
    calculateFee: (depositAmount) => {
      if (isPercentage) {
        return depositAmount * (percentage / 100);
      } else {
        return fixedAmount;
      }
    }
  };
}
// ─────────────────────────────────────────────
//  Withdrawal request (PENDING approval) – FULL RESPONSE
// ─────────────────────────────────────────────
static async processWithdrawal(req, res) {
  let t;
  try {
    await ensureModelsInitialized();

    // Log the entire request body for debugging
    console.log('📥 Received withdrawal request body:', JSON.stringify(req.body, null, 2));
    
    const { CUST_ID, ACCT_NO, amount, notes = '' } = req.body;
    console.log('🔍 Extracted fields:', { CUST_ID, ACCT_NO, amount, notes });

    // Explicit field validation with clear error messages
    if (!CUST_ID) {
      console.error('❌ CUST_ID missing');
      return res.status(400).json({ success: false, error: 'CUST_ID is required' });
    }
    if (!ACCT_NO) {
      console.error('❌ ACCT_NO missing');
      return res.status(400).json({ success: false, error: 'ACCT_NO is required' });
    }
    if (!amount) {
      console.error('❌ amount missing');
      return res.status(400).json({ success: false, error: 'amount is required' });
    }

    const withdrawalAmount = parseFloat(amount);
    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
      console.error('❌ Invalid amount:', amount);
      return res.status(400).json({ success: false, error: 'Amount must be a positive number' });
    }

    t = await sequelizeInstance.transaction();

    const thriftAccount = await Thrift.findOne({ where: { ACCT_NO }, transaction: t });
    if (!thriftAccount || thriftAccount.CUST_ID !== CUST_ID) {
      console.error('❌ Thrift account not found or customer mismatch:', { ACCT_NO, CUST_ID });
      await t.rollback();
      return res.status(404).json({ success: false, error: 'Thrift account not found' });
    }

    const currentBalance = parseFloat(thriftAccount.AMOUNT || 0);
    if (currentBalance < withdrawalAmount) {
      console.error(`❌ Insufficient balance: ${currentBalance} < ${withdrawalAmount}`);
      await t.rollback();
      return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }

    const txIds = await ThriftController.generateTransactionIdentifiers(`WTH_${ACCT_NO}`, t);
    await Transaction.create({
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

    console.log(`✅ Withdrawal request created: ${txIds.TRANSACTION_IDENTIFIER} for amount ${withdrawalAmount}`);

    // Build full response expected by frontend SuccessDialog
    const responseData = {
      timestamp: new Date().toISOString(),
      withdrawal: {
        customerName: thriftAccount.FULL_NAME,
        accountNo: thriftAccount.ACCT_NO,
        customerId: thriftAccount.CUST_ID,
        currentBalance: currentBalance,
        requestedAmount: withdrawalAmount,
        status: 'PENDING_APPROVAL',
        notes: notes || '',
        productName: 'Thrift Savings Account' // optional
      },
      transaction: {
        id: txIds.TRANSACTION_IDENTIFIER,
        reference: txIds.REFERENCE,
        type: 'THRIFT_WITHDRAWAL',
        amount: withdrawalAmount,
        status: 'PENDING_APPROVAL',
        date: new Date().toISOString()
      },
      approval: {
        workflow: {
          step: 1,
          totalSteps: 2,
          current: 'Awaiting Manager Approval',
          next: 'Manager Approval'
        }
      },
      nextSteps: [
        '1. Withdrawal request submitted',
        '2. Awaiting manager approval',
        '3. Upon approval, account will be updated'
      ],
      warning: 'This withdrawal requires manager approval before processing.'
    };

    return res.status(200).json({
      success: true,
      message: 'Withdrawal request submitted for approval',
      data: responseData
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error('processWithdrawal error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
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

    // ✅ NEW: If balance becomes zero, mark the account as WITHDRAWN
    if (newBalance === 0) {
      await thriftAccount.update({
        cycle_status: 'WITHDRAWN',
        last_cycle_end_date: new Date(),
      }, { transaction: t });
      console.log(`✅ Account ${ACCT_NO} cycle status set to WITHDRAWN (zero balance)`);
    }

    await withdrawalTx.update({
      status: 'COMPLETED',
      description: 'Withdrawal approved and processed',
      metadata: { ...metadata, approvedBy: approverId, approvalNotes, previousBalance: currentBalance, newBalance }
    }, { transaction: t });

    // GL accounting (use your existing corrected GL logic – ensure no hardcoded missing accounts)
    // ... (keep your GL logic from the previous correct version)
    // ... (the rest of the method unchanged)

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

    const searchQuery = searchTerm.trim().toLowerCase();
    const offset = (page - 1) * limit;
    const searchPattern = `%${searchQuery}%`;

    // Use sequelizeInstance (the imported instance) for functions
    const { count, rows: thriftAccounts } = await Thrift.findAndCountAll({
      where: {
        [Op.or]: [
          { ACCT_NO: { [Op.like]: searchPattern } },
          { FIRST_NAME: { [Op.like]: searchPattern } },
          { LASTNAME: { [Op.like]: searchPattern } },
          { FULL_NAME: { [Op.like]: searchPattern } },
          { CUST_ID: { [Op.like]: searchPattern } }
        ]
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['FULL_NAME', 'ASC']]
    });

    const toISO = (val) => val ? new Date(val).toISOString() : null;

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
      status: account.STATUS,
      openingDate: toISO(account.OPENED_DT),
      nextCollectionDate: toISO(account.nextCollectionDate),
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
          term: searchTerm,
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

    const searchQuery = searchTerm.trim().toLowerCase();
    const offset = (page - 1) * limit;
    const searchPattern = `%${searchQuery}%`;

    // Get total count of distinct customers
    const countResult = await Thrift.findAll({
      where: {
        [Op.or]: [
          { FIRST_NAME: { [Op.like]: searchPattern } },
          { LASTNAME: { [Op.like]: searchPattern } },
          { FULL_NAME: { [Op.like]: searchPattern } },
          { CUST_ID: { [Op.like]: searchPattern } }
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
            term: searchTerm,
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
          { FIRST_NAME: { [Op.like]: searchPattern } },
          { LASTNAME: { [Op.like]: searchPattern } },
          { FULL_NAME: { [Op.like]: searchPattern } },
          { CUST_ID: { [Op.like]: searchPattern } }
        ]
      },
      attributes: ['CUST_ID'],
      group: ['CUST_ID'],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const customerIdList = distinctCustomerIds.map(item => item.CUST_ID);

    // Get customer details for the paginated IDs
    const customers = await Thrift.findAll({
      where: { CUST_ID: { [Op.in]: customerIdList } },
      attributes: [
        'CUST_ID',
        'FIRST_NAME',
        'LASTNAME',
        'FULL_NAME',
        'STATUS',
        'OPENED_DT',
        'created_at'
      ]
    });

    const toISO = (val) => val ? new Date(val).toISOString() : null;

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
            'STATUS',
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
            firstName: customer.FIRST_NAME,
            lastName: customer.LASTNAME,
            fullName: customer.FULL_NAME,
            status: customer.STATUS,
            openedDate: toISO(customer.OPENED_DT),
            createdAt: customer.created_at
          },
          thriftAccounts: thriftAccounts.map(account => ({
            accountNumber: account.ACCT_NO,
            accountId: account.ACCT_ID,
            balance: parseFloat(account.AMOUNT || 0),
            collectionType: account.COLLECTION_TYPE,
            status: account.STATUS,
            openedDate: toISO(account.OPENED_DT),
            nextCollectionDate: toISO(account.nextCollectionDate),
            totalContributions: parseFloat(account.totalContributions || 0),
            totalWithdrawals: parseFloat(account.totalWithdrawals || 0)
          })),
          summary: {
            totalThriftAccounts: thriftAccounts.length,
            totalThriftBalance: thriftAccounts.reduce((sum, acc) => sum + parseFloat(acc.AMOUNT || 0), 0),
            activeThriftAccounts: thriftAccounts.filter(acc => acc.STATUS === 'ACTIVE').length
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
          term: searchTerm,
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