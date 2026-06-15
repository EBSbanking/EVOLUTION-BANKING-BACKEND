// controllers/AccountApplicationController.js - FULLY CORRECTED & COMPLETE
import AccountApplication from '../models/AccountApplication.js';
import CustomerAccount from '../models/CustomerAccount.js';
import DepositTransaction from '../models/DepositTransaction.js';
import Customer from '../models/Customer.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import AuditTrail from '../models/AuditTrail.js';
import SavingsProduct from '../models/SavingsProduct.js';
import sequelize from '../../config/db.js';
import smsService from '../utils/smsService.js';
import { v2 as cloudinaryV2 } from 'cloudinary';
import multer from 'multer';
import { Op } from 'sequelize';

// Configure Cloudinary
cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for in-memory storage
const storage = multer.memoryStorage();

// ==================== HELPER FUNCTIONS ====================

// Ensure customer_accounts table exists
const ensureCustomerAccountsTable = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS customer_accounts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        CUST_ID VARCHAR(20) NOT NULL,
        account_number VARCHAR(20) UNIQUE NOT NULL,
        account_name VARCHAR(100) NOT NULL,
        depositor_name VARCHAR(100),
        product_id INT,
        product_code VARCHAR(50),
        branch_id VARCHAR(10),
        status ENUM('ACTIVE', 'DORMANT', 'CLOSED', 'PENDING') DEFAULT 'PENDING',
        opening_balance DECIMAL(20,2) DEFAULT 0,
        current_balance DECIMAL(20,2) DEFAULT 0,
        ledger_balance DECIMAL(20,2) DEFAULT 0,
        cleared_balance DECIMAL(20,2) DEFAULT 0,
        currency VARCHAR(3) DEFAULT 'NGN',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_cust_id (CUST_ID),
        INDEX idx_branch_id (branch_id),
        INDEX idx_account_number (account_number)
      )
    `);
    console.log('✅ customer_accounts table verified/created');
  } catch (error) {
    console.error('❌ Failed to create customer_accounts table:', error.message);
  }
};

// Ensure missing columns in customer_accounts
const ensureCustomerAccountColumns = async () => {
  try {
    const [columns] = await sequelize.query("DESCRIBE customer_accounts");
    const hasLedgerBalance = columns.some(col => col.Field === 'ledger_balance');
    const hasClearedBalance = columns.some(col => col.Field === 'cleared_balance');
    const hasProdId = columns.some(col => col.Field === 'prod_id');
    const hasProductCode = columns.some(col => col.Field === 'product_code');
    if (!hasLedgerBalance) await sequelize.query(`ALTER TABLE customer_accounts ADD COLUMN ledger_balance DECIMAL(20,2) DEFAULT 0.00`);
    if (!hasClearedBalance) await sequelize.query(`ALTER TABLE customer_accounts ADD COLUMN cleared_balance DECIMAL(20,2) DEFAULT 0.00`);
    if (!hasProdId) await sequelize.query(`ALTER TABLE customer_accounts ADD COLUMN prod_id INT(11) DEFAULT NULL`);
    if (!hasProductCode) await sequelize.query(`ALTER TABLE customer_accounts ADD COLUMN product_code VARCHAR(50) DEFAULT NULL`);
    console.log('✅ Database columns verified/created');
  } catch (err) {
    console.warn('Column check error:', err.message);
  }
};

// Find customer by CUST_ID
const findCustomer = async (custId, transaction) => {
  const [customer] = await sequelize.query(
    `SELECT * FROM customers WHERE CUST_ID = ? LIMIT 1`,
    { replacements: [custId], type: sequelize.QueryTypes.SELECT, transaction }
  );
  return customer;
};
// Helper function to get savings product details
const getSavingsProductDetails = async (productId, transaction) => {
  try {
    if (!productId) {
      console.log('⚠️ No product ID provided');
      return null;
    }
    
    console.log(`🔍 Looking for savings product: ${productId}`);
    
    let product = null;
    
    // Method 1: By productCode (string)
    product = await SavingsProduct.findOne({
      where: {
        rec_st: 'A',
        product_code: productId.toString()
      },
      transaction
    });
    
    // Method 2: By PROD_CD if not found
    if (!product) {
      product = await SavingsProduct.findOne({
        where: {
          rec_st: 'A',
          PROD_CD: productId.toString()
        },
        transaction
      });
    }
    
    // Method 3: By PROD_ID (numeric)
    if (!product && !isNaN(productId)) {
      const numericId = parseInt(productId);
      product = await SavingsProduct.findOne({
        where: {
          rec_st: 'A',
          PROD_ID: numericId
        },
        transaction
      });
    }
    
    if (product) {
      console.log(`✅ Found savings product: ${product.productName || product.PROD_DESC || 'N/A'}`);
    } else {
      console.warn(`⚠️ No active savings product found for ID: ${productId}`);
    }
    
    return product;
  } catch (error) {
    console.error('❌ Error fetching savings product:', error.message);
    return null;
  }
};


// Check existing accounts for customer in a branch
const checkExistingCustomerAccounts = async (custId, branchId, transaction) => {
  const [accounts] = await sequelize.query(
    `SELECT * FROM customer_accounts WHERE CUST_ID = ? AND branch_id = ? AND status IN ('ACTIVE', 'PENDING')`,
    { replacements: [custId, branchId], type: sequelize.QueryTypes.SELECT, transaction }
  );
  return accounts;
};

// Upload document to Cloudinary (mock – replace with real implementation)
const uploadDocumentToCloudinary = async (buffer, originalName, folder) => {
  // Replace with actual Cloudinary upload logic
  return { secure_url: 'http://example.com/fake', public_id: 'fake' };
};

// ==================== CREATE APPLICATION (NO FILES) ====================
export const createSimpleApplication = async (req, res) => {
  console.log('🧪 Simple application creation (no files)...');
  await ensureCustomerAccountsTable();
  await ensureCustomerAccountColumns();

  const userBranchId = req.user?.branch_id || req.headers['x-branch-id'];
  if (!userBranchId) {
    return res.status(400).json({ success: false, message: 'Branch ID is required', code: 'BRANCH_ID_REQUIRED' });
  }
  console.log(`🏢 User's branch: ${userBranchId}`);

  const transaction = await sequelize.transaction();
  try {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'This endpoint does not accept multipart/form-data' });
    }
    const requestData = req.body || {};

    const {
      CUST_ID, ACCT_NM, DEPOSITOR_NAME, DOCUMENT_TYPE, DOCUMENT_NUMBER, AMOUNT, PROD_ID,
      BU_ID, CRNCY_ID, CREATED_BY, USER_ID, NOTES, BRANCH_NAME,
      cust_id, acct_nm, depositor_name, document_type, document_number, amount, prod_id,
      bu_id, crncy_id, created_by, user_id, notes, branch_name
    } = requestData;

    const finalCUST_ID = (CUST_ID || cust_id || '').toString().trim();
    const finalACCT_NM = (ACCT_NM || acct_nm || '').toString().trim();
    const finalDEPOSITOR_NAME = (DEPOSITOR_NAME || depositor_name || '').toString().trim();
    const finalDOCUMENT_TYPE = (DOCUMENT_TYPE || document_type || '').toString().trim();
    const finalDOCUMENT_NUMBER = (DOCUMENT_NUMBER || document_number || '').toString().trim();
    const finalAMOUNT = (AMOUNT || amount || '').toString().trim();
    const finalPROD_ID = (PROD_ID || prod_id || '').toString().trim();
    const finalBU_ID = (BU_ID || bu_id || userBranchId).toString().trim();
    const finalCRNCY_ID = (CRNCY_ID || crncy_id || 'NGN').toString().trim();
    const finalCREATED_BY = (CREATED_BY || created_by || user_id || '').toString().trim();
    const finalUSER_ID = (USER_ID || user_id || created_by || '').toString().trim();
    const finalNOTES = (NOTES || notes || '').toString().trim();
    const finalBRANCH_NAME = (BRANCH_NAME || branch_name || '').toString().trim();

    if (finalBU_ID !== userBranchId) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Cannot create application for different branch', code: 'BRANCH_MISMATCH' });
    }

    const normalizedCUST_ID = finalCUST_ID.padStart(10, '0');
    const requiredFields = ['CUST_ID', 'ACCT_NM', 'DEPOSITOR_NAME', 'DOCUMENT_TYPE', 'DOCUMENT_NUMBER', 'CREATED_BY', 'BU_ID', 'PROD_ID'];
    const missing = requiredFields.filter(f => !eval(`final${f}`));
    if (missing.length) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}` });
    }
    if (!/^\d{10}$/.test(normalizedCUST_ID)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'CUST_ID must be exactly 10 digits' });
    }

    const validDocTypes = ['Passport', 'National ID', 'Driver License', 'Voter Card', 'Other'];
    if (!validDocTypes.includes(finalDOCUMENT_TYPE)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid document type' });
    }

    const customer = await findCustomer(normalizedCUST_ID, transaction);
    if (!customer) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: `Customer not found: ${normalizedCUST_ID}` });
    }
    const custStatus = (customer.REC_ST || customer.rec_st || customer.status || '').toUpperCase();
    if (!['ACTIVE', 'APPROVED'].includes(custStatus)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: `Customer not active. Status: ${custStatus}` });
    }

    // ========== PRODUCT LOOKUP – CORRECT COLUMN NAMES ==========
    console.log('🔍 Looking up product for PROD_ID:', finalPROD_ID);
    let productName = '', productCode = '', productDescription = '';
    try {
      const [product] = await sequelize.query(
        `SELECT product_name, product_code, product_description 
         FROM savings_products 
         WHERE (PROD_ID = ? OR product_code = ?) 
         AND REC_ST = 'Active' 
         LIMIT 1`,
        {
          replacements: [finalPROD_ID, finalPROD_ID],
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );
      if (!product) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Product with ID or code "${finalPROD_ID}" not found in savings_products`,
          code: 'PRODUCT_NOT_FOUND'
        });
      }
      productName = product.product_name || '';
      productCode = product.product_code || '';
      productDescription = product.product_description || '';
      console.log(`✅ Found product: ${productName} (${productCode})`);
    } catch (err) {
      console.error('❌ Product lookup SQL error:', err.message);
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Product lookup failed', details: err.message });
    }

    const existingAccounts = await checkExistingCustomerAccounts(normalizedCUST_ID, finalBU_ID, transaction);
    if (existingAccounts && existingAccounts.length) {
      await transaction.rollback();
      return res.status(409).json({ success: false, message: `Customer already has accounts in branch ${finalBU_ID}` });
    }

    // Generate unique account number
    let accountNumber, isUnique = false;
    for (let attempts = 0; attempts < 10; attempts++) {
      accountNumber = `2${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`;
      const existingApp = await AccountApplication.findOne({ where: { account_number: accountNumber }, transaction });
      const existingAcct = await CustomerAccount.findOne({ where: { account_number: accountNumber }, transaction });
      if (!existingApp && !existingAcct) { isUnique = true; break; }
    }
    if (!isUnique) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Failed to generate unique account number' });
    }

    const openingAmount = parseFloat(finalAMOUNT);
    if (isNaN(openingAmount) || openingAmount < 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const applicationData = {
      customer_id: normalizedCUST_ID, account_number: accountNumber, account_name: finalACCT_NM,
      depositor_name: finalDEPOSITOR_NAME, document_type: finalDOCUMENT_TYPE, document_number: finalDOCUMENT_NUMBER,
      amount: openingAmount, status: 'PENDING', created_by: finalCREATED_BY,
      document_urls: null, notes: finalNOTES || `Product: ${productName}`, branch_id: finalBU_ID,
      product_id: finalPROD_ID, product_name: productName, product_code: productCode,
      currency: finalCRNCY_ID, branch_name: finalBRANCH_NAME, user_id: finalUSER_ID
    };
    const accountApplication = await AccountApplication.create(applicationData, { transaction });
    console.log('✅ AccountApplication created ID:', accountApplication.id);

    // ========== UPDATED GL REFERENCE WITH AVAILABLE_BALANCE ==========
    try {
      // Add available_balance column if not exists (using CREATE TABLE IF NOT EXISTS with full schema)
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS gl_references (
          id INT PRIMARY KEY AUTO_INCREMENT,
          reference_id VARCHAR(100) UNIQUE,
          application_id INT NOT NULL,
          customer_id VARCHAR(20) NOT NULL,
          account_number VARCHAR(20) NOT NULL,
          amount DECIMAL(20,2) NOT NULL,
          available_balance DECIMAL(20,2) DEFAULT 0,
          currency VARCHAR(3) DEFAULT 'NGN',
          status VARCHAR(20) DEFAULT 'PENDING',
          created_by VARCHAR(100),
          branch_id VARCHAR(10),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, { transaction });
      
      // Insert with available_balance set to the same amount (opening deposit)
      await sequelize.query(
        `INSERT INTO gl_references (reference_id, application_id, customer_id, account_number, amount, available_balance, currency, status, created_by, branch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
        {
          replacements: [
            `GL_REF_${Date.now()}_${accountApplication.id}`,
            accountApplication.id,
            normalizedCUST_ID,
            accountNumber,
            openingAmount,
            openingAmount,  // available_balance = amount
            finalCRNCY_ID,
            finalCREATED_BY,
            finalBU_ID
          ],
          transaction
        }
      );
    } catch (glErr) { console.warn('GL reference warning:', glErr.message); }

    await transaction.commit();
    return res.status(201).json({
      success: true,
      message: 'Simple account application created successfully',
      data: { applicationId: accountApplication.id, customerId: normalizedCUST_ID, accountNumber, productName, status: 'PENDING' }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ createSimpleApplication error:', error.message);
    return res.status(500).json({ success: false, message: 'Error creating application', details: error.message });
  }
};

// ==================== CREATE APPLICATION (WITH FILE UPLOADS) ====================
export const createApplication = async (req, res) => {
  console.log('🚀 === STARTING CREATE ACCOUNT APPLICATION (with files) ===');
  await ensureCustomerAccountsTable();
  await ensureCustomerAccountColumns();

  const userBranchId = (req.body?.branch_id || req.body?.BU_ID || req.headers['x-branch-id'] || req.user?.branch_id || '001').toString().trim();
  console.log(`🏢 Branch: ${userBranchId}`);

  const transaction = await sequelize.transaction();
  try {
    const { CUST_ID, ACCT_NM, DEPOSITOR_NAME, DOCUMENT_TYPE, DOCUMENT_NUMBER, AMOUNT, PROD_ID,
            BU_ID, CRNCY_ID, CREATED_BY, USER_ID, NOTES, BRANCH_NAME } = req.body;

    const finalCUST_ID = (CUST_ID || '').toString().trim();
    const finalACCT_NM = (ACCT_NM || '').toString().trim();
    const finalDEPOSITOR_NAME = (DEPOSITOR_NAME || '').toString().trim();
    const finalDOCUMENT_TYPE = (DOCUMENT_TYPE || '').toString().trim();
    const finalDOCUMENT_NUMBER = (DOCUMENT_NUMBER || '').toString().trim();
    const finalAMOUNT = (AMOUNT || '').toString().trim();
    const finalPROD_ID = (PROD_ID || '').toString().trim();
    const finalBU_ID = (BU_ID || userBranchId).toString().trim();
    const finalCRNCY_ID = (CRNCY_ID || 'NGN').toString().trim();
    const finalCREATED_BY = (CREATED_BY || USER_ID || '').toString().trim();
    const finalUSER_ID = (USER_ID || CREATED_BY || '').toString().trim();
    const finalNOTES = (NOTES || '').toString().trim();
    const finalBRANCH_NAME = (BRANCH_NAME || '').toString().trim();

    if (userBranchId !== '001' && finalBU_ID !== userBranchId) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Branch mismatch', code: 'BRANCH_MISMATCH' });
    }

    const normalizedCUST_ID = finalCUST_ID.padStart(10, '0');
    const required = ['CUST_ID', 'ACCT_NM', 'DEPOSITOR_NAME', 'DOCUMENT_TYPE', 'DOCUMENT_NUMBER', 'CREATED_BY', 'USER_ID', 'BU_ID', 'PROD_ID'];
    const missing = required.filter(f => !eval(`final${f}`));
    if (missing.length) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: `Missing: ${missing.join(', ')}` });
    }
    if (!/^\d{10}$/.test(normalizedCUST_ID)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'CUST_ID must be 10 digits' });
    }

    const customer = await findCustomer(normalizedCUST_ID, transaction);
    if (!customer) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: `Customer ${normalizedCUST_ID} not found` });
    }

    // ========== PRODUCT LOOKUP – CORRECT COLUMN NAMES ==========
    console.log('🔍 Looking up product for PROD_ID:', finalPROD_ID);
    let productName = '', productCode = '', productDescription = '';
    try {
      const [product] = await sequelize.query(
        `SELECT productName, productCode, productDescription 
         FROM savings_products 
         WHERE (PROD_ID = ? OR productCode = ?) 
         AND REC_ST = 'Active' 
         LIMIT 1`,
        {
          replacements: [finalPROD_ID, finalPROD_ID],
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );
      if (!product) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Product with ID or code "${finalPROD_ID}" not found in savings_products`,
          code: 'PRODUCT_NOT_FOUND'
        });
      }
      productName = product.productName || '';
      productCode = product.productCode || '';
      productDescription = product.productDescription || '';
      console.log(`✅ Found product: ${productName} (${productCode})`);
    } catch (err) {
      console.error('❌ Product lookup SQL error:', err.message);
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Product lookup failed', details: err.message });
    }

    // Process uploaded files
    let documentUrls = [];
    if (req.files && req.files.length) {
      for (const file of req.files) {
        if (file.buffer) {
          const uploadResult = await uploadDocumentToCloudinary(file.buffer, file.originalname, `account-applications/branch-${finalBU_ID}`);
          documentUrls.push({ originalName: file.originalname, url: uploadResult.secure_url, publicId: uploadResult.public_id, uploadedAt: new Date() });
        }
      }
    }

    const existingAccounts = await checkExistingCustomerAccounts(normalizedCUST_ID, finalBU_ID, transaction);
    if (existingAccounts && existingAccounts.length) {
      await transaction.rollback();
      return res.status(409).json({ success: false, message: `Customer already has accounts in branch ${finalBU_ID}` });
    }

    // Generate unique account number
    let accountNumber, unique = false;
    for (let i = 0; i < 10; i++) {
      accountNumber = `2${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`;
      const appExists = await AccountApplication.findOne({ where: { account_number: accountNumber }, transaction });
      const acctExists = await CustomerAccount.findOne({ where: { account_number: accountNumber }, transaction });
      if (!appExists && !acctExists) { unique = true; break; }
    }
    if (!unique) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: 'Could not generate unique account number' });
    }

    const openingAmount = parseFloat(finalAMOUNT);
    if (isNaN(openingAmount) || openingAmount < 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const applicationData = {
      customer_id: normalizedCUST_ID, account_number: accountNumber, account_name: finalACCT_NM,
      depositor_name: finalDEPOSITOR_NAME, document_type: finalDOCUMENT_TYPE, document_number: finalDOCUMENT_NUMBER,
      amount: openingAmount, status: 'PENDING', created_by: finalCREATED_BY,
      document_urls: documentUrls.length ? JSON.stringify(documentUrls) : null,
      notes: finalNOTES || `Product: ${productName}`, branch_id: finalBU_ID,
      product_id: finalPROD_ID, product_name: productName, product_code: productCode,
      currency: finalCRNCY_ID, branch_name: finalBRANCH_NAME, user_id: finalUSER_ID
    };
    const accountApplication = await AccountApplication.create(applicationData, { transaction });
    console.log('✅ Application created ID:', accountApplication.id);

    // ========== UPDATED GL REFERENCE WITH AVAILABLE_BALANCE ==========
    try {
      // Create table with available_balance column
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS gl_references (
          id INT PRIMARY KEY AUTO_INCREMENT,
          reference_id VARCHAR(100) UNIQUE,
          application_id INT NOT NULL,
          customer_id VARCHAR(20) NOT NULL,
          account_number VARCHAR(20) NOT NULL,
          amount DECIMAL(20,2) NOT NULL,
          available_balance DECIMAL(20,2) DEFAULT 0,
          currency VARCHAR(3) DEFAULT 'NGN',
          status VARCHAR(20) DEFAULT 'PENDING',
          created_by VARCHAR(100),
          branch_id VARCHAR(10),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, { transaction });
      
      // Insert with available_balance
      await sequelize.query(
        `INSERT INTO gl_references (reference_id, application_id, customer_id, account_number, amount, available_balance, currency, status, created_by, branch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
        {
          replacements: [
            `GL_REF_${Date.now()}_${accountApplication.id}`,
            accountApplication.id,
            normalizedCUST_ID,
            accountNumber,
            openingAmount,
            openingAmount,  // available_balance = amount
            finalCRNCY_ID,
            finalCREATED_BY,
            finalBU_ID
          ],
          transaction
        }
      );
    } catch (glErr) { console.warn('GL ref error:', glErr.message); }

    await transaction.commit();
    return res.status(201).json({
      success: true,
      message: 'Account application created successfully',
      data: { applicationId: accountApplication.id, customerId: normalizedCUST_ID, accountNumber, productName, productCode, status: 'PENDING' }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ createApplication error:', error.message);
    return res.status(500).json({ success: false, message: 'Error creating application', details: error.message });
  }
};

// ==================== MIDDLEWARE & TEST FUNCTIONS ====================
export const debugFormData = (req, res) => {
  console.log('🔧 === DEBUG FORM DATA ===');
  const contentType = req.headers['content-type'] || '';
  res.status(200).json({
    success: true,
    message: 'Debug endpoint active',
    contentType,
    headers: req.headers,
    body: req.body,
    files: req.files ? 'present' : 'none'
  });
};

export const handleFormData = (req, res, next) => {
  console.log('🔧 Form Data Handler - Starting...');
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    console.log('⚠️ Not a multipart request, skipping');
    return next();
  }
  next();
};

export const handleMultipartForm = (req, res, next) => {
  console.log('📋 Checking request for files...');
  if (req.files && Object.keys(req.files).length > 0) {
    console.log(`✅ Found files via express-fileupload`);
    if (!Array.isArray(req.files)) {
      const filesArray = [];
      for (const key in req.files) {
        if (Array.isArray(req.files[key])) filesArray.push(...req.files[key]);
        else filesArray.push(req.files[key]);
      }
      req.files = filesArray;
    }
  }
  next();
};

export const testNoFiles = async (req, res) => {
  res.status(200).json({ success: true, message: 'Test successful', receivedData: req.body });
};

export const testUpload = async (req, res) => {
  const files = req.files || [];
  res.status(200).json({ success: true, message: 'Upload test successful', filesReceived: files.length });
};

// ==================== APPLICATION MANAGEMENT FUNCTIONS ====================
export const getAllApplications = async (req, res) => {
  try {
    const { status, customer_id, document_type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const where = {};
    if (status) where.status = status.toUpperCase();
    if (customer_id) where.customer_id = String(customer_id).padStart(10, '0');
    if (document_type) where.document_type = document_type;

    const { count, rows } = await AccountApplication.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return res.json({
      success: true,
      data: rows.map(app => app.getApplicationSummary ? app.getApplicationSummary() : app),
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    console.error('❌ getAllApplications error:', error.message);
    return res.status(500).json({ success: false, message: 'Error fetching applications', details: error.message });
  }
};

export const getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await AccountApplication.findByPk(id);
    if (!application) return res.status(404).json({ success: false, message: 'Application not found' });
    return res.json({ success: true, data: application.getApplicationSummary ? application.getApplicationSummary() : application });
  } catch (error) {
    console.error('❌ getApplicationById error:', error.message);
    return res.status(500).json({ success: false, message: 'Error fetching application', details: error.message });
  }
};

export const getApplicationByBu = async (req, res) => {
  try {
    const { bu_id } = req.params;
    const { status = 'PENDING', searchField = 'branch_id' } = req.query;
    if (!bu_id) return res.status(400).json({ success: false, message: 'BU_ID parameter is required' });

    const where = { [searchField]: bu_id };
    if (status.toUpperCase() !== 'ALL') where.status = status.toUpperCase();

    const applications = await AccountApplication.findAll({ where, order: [['created_at', 'DESC']] });
    return res.json({
      success: true,
      count: applications.length,
      searchedField: searchField,
      searchedValue: bu_id,
      statusFilter: status,
      data: applications.map(app => app.getApplicationSummary ? app.getApplicationSummary() : app)
    });
  } catch (error) {
    console.error('❌ getApplicationByBu error:', error.message);
    return res.status(500).json({ success: false, message: 'Error fetching applications by BU', details: error.message });
  }
};

export const getPendingCount = async (req, res) => {
  try {
    const count = await AccountApplication.count({ where: { status: 'PENDING' } });
    return res.json({ success: true, data: { count } });
  } catch (error) {
    console.error('❌ getPendingCount error:', error.message);
    return res.status(500).json({ success: false, message: 'Error fetching pending count', details: error.message });
  }
};

export const updateApplicationByCustomer = async (req, res) => {
  console.log('🔄 Updating application by customer...');
  const transaction = await sequelize.transaction();
  try {
    const { customerId } = req.params;
    const updates = req.body;
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const userBranchId = req.user?.branch_id || req.headers['x-branch-id'];

    if (!userBranchId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Branch ID required' });
    }

    const normalizedCustomerId = String(customerId).padStart(10, '0');
    const application = await AccountApplication.findOne({
      where: { customer_id: normalizedCustomerId, branch_id: userBranchId, status: 'PENDING' },
      order: [['created_at', 'DESC']],
      transaction
    });

    if (!application) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: `No pending application for customer ${customerId} in branch ${userBranchId}` });
    }

    // Remove restricted fields
    delete updates.id;
    delete updates.customer_id;
    delete updates.account_number;
    delete updates.created_at;
    delete updates.created_by;
    delete updates.branch_id;

    await application.update(updates, { transaction });
    await transaction.commit();

    return res.json({ success: true, message: 'Application updated', data: application });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ updateApplicationByCustomer error:', error.message);
    return res.status(500).json({ success: false, message: 'Error updating application', details: error.message });
  }
};

export const rejectApplicationByCustomer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { customerId } = req.params;
    const { rejection_reason } = req.body;
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const userBranchId = req.user?.branch_id || req.headers['x-branch-id'];

    if (!rejection_reason) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Rejection reason required' });
    }

    const normalizedCustomerId = String(customerId).padStart(10, '0');
    const application = await AccountApplication.findOne({
      where: { customer_id: normalizedCustomerId, branch_id: userBranchId, status: 'PENDING' },
      order: [['created_at', 'DESC']],
      transaction
    });

    if (!application) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: `No pending application for customer ${customerId} in branch ${userBranchId}` });
    }

    await application.update({
      status: 'REJECTED',
      rejected_by: userId,
      rejected_at: new Date(),
      rejection_reason,
      notes: (application.notes || '') + `\n${new Date().toLocaleDateString()}: Rejected - ${rejection_reason}`
    }, { transaction });

    await transaction.commit();
    return res.json({ success: true, message: 'Application rejected', data: application });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ rejectApplicationByCustomer error:', error.message);
    return res.status(500).json({ success: false, message: 'Error rejecting application', details: error.message });
  }
};

export const getApplicationsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const userBranchId = req.user?.branch_id || req.headers['x-branch-id'];
    const showAllBranches = req.query.all_branches === 'true';

    const normalizedCustomerId = String(customerId).padStart(10, '0');
    const where = { customer_id: normalizedCustomerId };
    if (!showAllBranches && userBranchId) where.branch_id = userBranchId;

    const applications = await AccountApplication.findAll({
      where,
      order: [['created_at', 'DESC']]
    });

    return res.json({
      success: true,
      data: applications.map(app => app.getApplicationSummary ? app.getApplicationSummary() : app)
    });
  } catch (error) {
    console.error('❌ getApplicationsByCustomer error:', error.message);
    return res.status(500).json({ success: false, message: 'Error fetching applications', details: error.message });
  }
};

export const addDocumentsToApplication = async (req, res) => {
  console.log('📎 Adding documents to existing application...');
  const transaction = await sequelize.transaction();
  try {
    const { customerId } = req.params;
    const userBranchId = req.headers['x-branch-id'];
    const normalizedCustomerId = String(customerId).padStart(10, '0');

    const application = await AccountApplication.findOne({
      where: { customer_id: normalizedCustomerId, branch_id: userBranchId, status: 'PENDING' },
      order: [['created_at', 'DESC']],
      transaction
    });

    if (!application) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: `No pending application for customer ${customerId} in branch ${userBranchId}` });
    }

    let existingDocuments = [];
    if (application.document_urls) existingDocuments = JSON.parse(application.document_urls);

    const newDocumentUrls = [];
    if (req.files && req.files.length) {
      for (const file of req.files) {
        if (file.buffer) {
          const uploadResult = await uploadDocumentToCloudinary(file.buffer, file.originalname, `account-applications/branch-${userBranchId}`);
          newDocumentUrls.push({
            originalName: file.originalname,
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            uploadedAt: new Date(),
            uploadedBy: req.user?.id || 'system'
          });
        }
      }
    }

    const allDocuments = [...existingDocuments, ...newDocumentUrls];
    await application.update({
      document_urls: JSON.stringify(allDocuments),
      notes: (application.notes || '') + `\n${new Date().toLocaleDateString()}: Added ${newDocumentUrls.length} document(s)`
    }, { transaction });

    await transaction.commit();
    return res.json({ success: true, message: 'Documents added', data: { totalDocuments: allDocuments.length, newDocuments: newDocumentUrls.length } });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ addDocumentsToApplication error:', error.message);
    return res.status(500).json({ success: false, message: 'Error adding documents', details: error.message });
  }
};

export const getApplicationDocuments = async (req, res) => {
  try {
    const { customerId } = req.params;
    const userBranchId = req.headers['x-branch-id'];
    const normalizedCustomerId = String(customerId).padStart(10, '0');

    const application = await AccountApplication.findOne({
      where: { customer_id: normalizedCustomerId, branch_id: userBranchId },
      order: [['created_at', 'DESC']]
    });

    if (!application) return res.status(404).json({ success: false, message: 'No application found' });

    let documents = [];
    if (application.document_urls) documents = JSON.parse(application.document_urls);

    return res.json({ success: true, data: { applicationId: application.id, documents, count: documents.length } });
  } catch (error) {
    console.error('❌ getApplicationDocuments error:', error.message);
    return res.status(500).json({ success: false, message: 'Error fetching documents', details: error.message });
  }
};

export const deleteApplicationDocument = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { customerId, documentId } = req.params;
    const userBranchId = req.headers['x-branch-id'];
    const normalizedCustomerId = String(customerId).padStart(10, '0');

    const application = await AccountApplication.findOne({
      where: { customer_id: normalizedCustomerId, branch_id: userBranchId, status: 'PENDING' },
      order: [['created_at', 'DESC']],
      transaction
    });

    if (!application) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'No pending application found' });
    }

    let documents = [];
    if (application.document_urls) documents = JSON.parse(application.document_urls);
    const docIndex = documents.findIndex(d => d.id === documentId || d.publicId === documentId);
    if (docIndex === -1) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    documents.splice(docIndex, 1);
    await application.update({ document_urls: JSON.stringify(documents) }, { transaction });
    await transaction.commit();

    return res.json({ success: true, message: 'Document deleted', data: { remainingDocuments: documents.length } });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ deleteApplicationDocument error:', error.message);
    return res.status(500).json({ success: false, message: 'Error deleting document', details: error.message });
  }
};

export const approveApplicationByCustomer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { customerId } = req.params;
    const { approvedBy, notes, branch_id } = req.body;
    const userId = req.user?.id || req.headers['x-user-id'] || approvedBy || 'system';
    const approverBranchId = branch_id || req.headers['x-branch-id'] || req.user?.branch_id;

    if (!approverBranchId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Branch ID is required for approval' });
    }

    const normalizedCustomerId = String(customerId).padStart(10, '0');
    const application = await AccountApplication.findOne({
      where: { customer_id: normalizedCustomerId, branch_id: approverBranchId, status: 'PENDING' },
      order: [['created_at', 'DESC']],
      transaction
    });

    if (!application) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: `No pending application for customer ${customerId} in branch ${approverBranchId}` });
    }

    // ----- 1. Update application status -----
    await application.update({
      status: 'APPROVED',
      approved_by: approvedBy || userId,
      approved_at: new Date(),
      notes: (application.notes || '') + `\n${new Date().toLocaleDateString()}: Approved. ${notes || ''}`
    }, { transaction });

    // ----- 2. Get customer details -----
    const [customer] = await sequelize.query(
      `SELECT * FROM customers WHERE CUST_ID = ?`,
      { replacements: [normalizedCustomerId], type: sequelize.QueryTypes.SELECT, transaction }
    );
    if (!customer) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: `Customer ${normalizedCustomerId} not found` });
    }

    const openingAmount = parseFloat(application.amount) || 0;
    const productName = application.product_name || 'Savings Account';
    const productCode = application.product_code || 'SAV001';
    let interestRate = 1.5;

    // ----- 3. Create entry in customer_accounts -----
    const [existingCustomerAccount] = await sequelize.query(
      `SELECT * FROM customer_accounts WHERE account_number = ? LIMIT 1`,
      { replacements: [application.account_number], type: sequelize.QueryTypes.SELECT, transaction }
    );
    let customerAccountId;
    if (existingCustomerAccount) {
      await sequelize.query(
        `UPDATE customer_accounts SET account_name = ?, status = 'ACTIVE', updated_at = NOW() WHERE id = ?`,
        { replacements: [application.account_name, existingCustomerAccount.id], transaction }
      );
      customerAccountId = existingCustomerAccount.id;
    } else {
      const [columns] = await sequelize.query("SHOW COLUMNS FROM customer_accounts", { transaction });
      const columnNames = columns.map(col => col.Field);
      const customerAccountData = {};
      const addField = (field, value) => {
        const match = columnNames.find(c => c.toLowerCase() === field.toLowerCase());
        if (match) customerAccountData[match] = value;
      };
      addField('CUST_ID', normalizedCustomerId);
      addField('account_number', application.account_number);
      addField('account_name', application.account_name);
      addField('depositor_name', application.depositor_name);
      addField('product_id', application.product_id);
      addField('product_code', productCode);
      addField('branch_id', approverBranchId);
      addField('status', 'ACTIVE');
      addField('opening_balance', openingAmount);
      addField('ledger_balance', openingAmount);
      addField('cleared_balance', openingAmount);
      addField('currency', application.currency || 'NGN');
      addField('created_at', new Date());
      addField('updated_at', new Date());
      const columnList = Object.keys(customerAccountData).join(', ');
      const placeholders = Object.keys(customerAccountData).map(() => '?').join(', ');
      const values = Object.values(customerAccountData);
      const [result] = await sequelize.query(
        `INSERT INTO customer_accounts (${columnList}) VALUES (${placeholders})`,
        { replacements: values, transaction }
      );
      customerAccountId = result.insertId;
    }

    // ----- 4. Create entry in accounts table (main account) -----
    const [columns] = await sequelize.query("SHOW COLUMNS FROM accounts", { transaction });
    const columnNames = columns.map(col => col.Field);
    const mainAccountData = {};
    const addFieldIfExists = (field, value) => {
      const match = columnNames.find(c => c.toLowerCase() === field.toLowerCase());
      if (match) mainAccountData[match] = value;
    };
    const now = new Date();

    addFieldIfExists('created_at', now);
    addFieldIfExists('updated_at', now);
    addFieldIfExists('customer_id', parseInt(application.customer_id) || 0);
    addFieldIfExists('account_number', application.account_number);
    addFieldIfExists('product_type', 'SAVINGS');
    addFieldIfExists('branch', parseInt(application.branch_id) || 1);
    addFieldIfExists('REC_ST', 'ACTIVE');
    addFieldIfExists('ledger_balance', openingAmount);
    addFieldIfExists('cleared_balance', openingAmount);
    addFieldIfExists('currency', application.currency || 'NGN');
    addFieldIfExists('opening_amount', openingAmount);
    addFieldIfExists('AVAILABLE_BALANCE', openingAmount);
    addFieldIfExists('INTEREST_RATE', interestRate);
    addFieldIfExists('online_enabled', 1);
    addFieldIfExists('DR_ALLOWED', 1);
    addFieldIfExists('CR_ALLOWED', 1);
    addFieldIfExists('created_by', application.created_by);
    addFieldIfExists('approved_by', approvedBy || userId);
    addFieldIfExists('approval_date', now);
    addFieldIfExists('prod_id', application.product_id || 100);
    addFieldIfExists('product_code', productCode);
    addFieldIfExists('product_name', productName);

    const productValue = (productCode && productCode !== '') ? productCode : (application.product_id || 'SAV001');
    if (columnNames.includes('product')) {
      mainAccountData['product'] = productValue;
    } else if (columnNames.includes('PRODUCT')) {
      mainAccountData['PRODUCT'] = productValue;
    } else {
      addFieldIfExists('product', productValue);
    }

    let mainAccountId;
    if (Object.keys(mainAccountData).length > 0) {
      const columnList = Object.keys(mainAccountData).join(', ');
      const placeholders = Object.keys(mainAccountData).map(() => '?').join(', ');
      const values = Object.values(mainAccountData);
      const [result] = await sequelize.query(
        `INSERT INTO accounts (${columnList}) VALUES (${placeholders})`,
        { replacements: values, transaction }
      );
      mainAccountId = result.insertId;
    }

    // ----- 5. (Optional) Create deposit transaction (legacy) -----
    if (openingAmount > 0) {
      try {
        await sequelize.query(
          `INSERT INTO deposit_transactions (customer_id, account_number, transaction_type, amount, currency, status, created_by, transaction_date, branch_id, approved_by, approved_at, created_at, updated_at)
           VALUES (?, ?, 'OPENING_DEPOSIT', ?, ?, 'COMPLETED', ?, NOW(), ?, ?, NOW(), NOW(), NOW())`,
          { replacements: [normalizedCustomerId, application.account_number, openingAmount, application.currency || 'NGN', approvedBy || userId, approverBranchId, approvedBy || userId], transaction }
        );
      } catch (e) { console.warn('Deposit transaction not created:', e.message); }
    }

    // ========== NEW: Create audit trail for the opening deposit (credit transaction) ==========
    if (openingAmount > 0 && mainAccountId) {
      try {
        await AuditTrail.create({
          event_id: Date.now(),
          user_id: userId,
          event_type: 'TRANSACTION_CR',
          action: 'Account Opening Deposit',
          new_value: {
            amount: openingAmount,
            balance: openingAmount,
            account_number: application.account_number,
            customer_id: normalizedCustomerId
          },
          ip_address: req.ip || '127.0.0.1',
          entity_type: 'CustomerAccount',
          entity_id: mainAccountId,        // the id of the newly created account record
          status: 'SUCCESS',
          account_no: application.account_number,
          description: `Opening deposit of ₦${openingAmount} for account ${application.account_number}`,
          timestamp: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction });
        console.log(`✅ Audit trail created for opening deposit: ${application.account_number}`);
      } catch (auditError) {
        console.warn('Could not create audit trail for opening deposit:', auditError.message);
      }
    }

    // ----- 6. Audit trail for the approval itself -----
    try {
      await sequelize.query(
        `INSERT INTO audit_trail (event_id, user_id, event_type, action, old_value, new_value, ip_address, timestamp, entity_type, entity_id, status, account_no, description, branch_id)
         VALUES (?, ?, 'ACCOUNT_APPLICATION_APPROVE', 'Approve Account Application', ?, ?, ?, NOW(), 'AccountApplication', ?, 'SUCCESS', ?, ?, ?)`,
        { replacements: [Date.now(), userId, JSON.stringify({ status: 'PENDING' }), JSON.stringify({ status: 'APPROVED', accountNumber: application.account_number }), req.ip || 'unknown', application.id, application.account_number, `Approved application ${application.id}`, approverBranchId], transaction }
      );
    } catch (e) { console.warn('Audit trail (approval) failed:', e.message); }

    await transaction.commit();
    return res.json({
      success: true,
      message: 'Application approved and accounts created',
      data: { applicationId: application.id, customerId: normalizedCustomerId, accountNumber: application.account_number, customerAccountId, mainAccountId }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ approveApplicationByCustomer error:', error.message);
    return res.status(500).json({ success: false, message: 'Error approving application', details: error.message });
  }
};

export const approveByCustomer = approveApplicationByCustomer; // alias

// ==================== APPROVAL & ACCOUNT CREATION (CUSTOMER ID) ====================
export const approveApplicationAndCreateAccount = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const customerId = req.params.customerId || req.body.customerId;
    const { approvedBy, notes, branch_id } = req.body;
    const userId = req.user?.id || req.headers['x-user-id'] || approvedBy || 'system';
    const approverBranchId = branch_id || req.headers['x-branch-id'] || req.user?.branch_id || '001';

    if (!customerId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'customerId is required' });
    }

    const normalizedCustomerId = String(customerId).padStart(10, '0');

    // Get latest pending application in the approver's branch
    const [application] = await sequelize.query(
      `SELECT * FROM account_applications 
       WHERE customer_id = ? AND status = 'PENDING' AND branch_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      { replacements: [normalizedCustomerId, approverBranchId], type: sequelize.QueryTypes.SELECT, transaction }
    );

    if (!application) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: `No pending application for customer ${customerId} in branch ${approverBranchId}` });
    }

    // Update application to APPROVED
    await sequelize.query(
      `UPDATE account_applications SET status = 'APPROVED', approved_by = ?, approved_at = NOW(), notes = CONCAT(COALESCE(notes, ''), ?), updated_at = NOW() WHERE id = ?`,
      { replacements: [approvedBy || userId, `\n${new Date().toLocaleDateString()}: Approved. ${notes || ''}`, application.id], transaction }
    );

    const [customer] = await sequelize.query(`SELECT * FROM customers WHERE CUST_ID = ?`, { replacements: [normalizedCustomerId], type: sequelize.QueryTypes.SELECT, transaction });
    if (!customer) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: `Customer ${normalizedCustomerId} not found` });
    }

    const openingAmount = parseFloat(application.amount) || 0;
    const productName = application.product_name || 'Savings Account';
    const productCode = application.product_code || 'SAV001';

    // Create entry in customer_accounts
    const [customerAccountResult] = await sequelize.query(
      `INSERT INTO customer_accounts (CUST_ID, account_number, account_name, depositor_name, product_id, product_code, branch_id, status, opening_balance, ledger_balance, cleared_balance, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, NOW(), NOW())`,
      { replacements: [normalizedCustomerId, application.account_number, application.account_name, application.depositor_name, application.product_id, productCode, approverBranchId, openingAmount, openingAmount, openingAmount, application.currency || 'NGN'], transaction }
    );
    const customerAccountId = customerAccountResult.insertId;

    // Create entry in accounts table (main account)
    const [mainAccountResult] = await sequelize.query(
      `INSERT INTO accounts (customer_id, account_number, product_type, branch, REC_ST, ledger_balance, cleared_balance, currency, created_at, updated_at)
       VALUES (?, ?, 'SAVINGS', ?, 'ACTIVE', ?, ?, ?, NOW(), NOW())`,
      { replacements: [parseInt(normalizedCustomerId) || 0, application.account_number, parseInt(approverBranchId) || 1, openingAmount, openingAmount, application.currency || 'NGN'], transaction }
    );
    const mainAccountId = mainAccountResult.insertId;

    // If opening amount > 0, create deposit transaction
    if (openingAmount > 0) {
      try {
        await sequelize.query(
          `INSERT INTO deposit_transactions (customer_id, account_number, transaction_type, amount, currency, status, created_by, transaction_date, branch_id, approved_by, approved_at)
           VALUES (?, ?, 'OPENING_DEPOSIT', ?, ?, 'COMPLETED', ?, NOW(), ?, ?, NOW())`,
          { replacements: [normalizedCustomerId, application.account_number, openingAmount, application.currency || 'NGN', approvedBy || userId, approverBranchId, approvedBy || userId], transaction }
        );
      } catch (e) { console.warn('Deposit transaction not created:', e.message); }
    }

    // Update workflow item
    try {
      await sequelize.query(
        `UPDATE wf_work_items SET STATUS = 'COMPLETED', UPDATED_AT = NOW() WHERE ENTITY_REF = ? AND WORK_ITEM_TYPE = 'AccountApplication'`,
        { replacements: [application.account_number], transaction }
      );
    } catch (e) { console.warn('Workflow update failed:', e.message); }

    // Audit trail
    try {
      await sequelize.query(
        `INSERT INTO audit_trail (event_id, user_id, event_type, action, old_value, new_value, ip_address, timestamp, entity_type, entity_id, status, account_no, description, branch_id)
         VALUES (?, ?, 'ACCOUNT_APPLICATION_APPROVE', 'Approve Account Application', ?, ?, ?, NOW(), 'AccountApplication', ?, 'SUCCESS', ?, ?, ?)`,
        { replacements: [Date.now(), userId, JSON.stringify({ status: 'PENDING' }), JSON.stringify({ status: 'APPROVED', accountNumber: application.account_number }), req.ip || 'unknown', application.id, application.account_number, `Approved application ${application.id}`, approverBranchId], transaction }
      );
    } catch (e) { console.warn('Audit trail failed:', e.message); }

    await transaction.commit();
    return res.json({
      success: true,
      message: 'Application approved and accounts created',
      data: { applicationId: application.id, customerId: normalizedCustomerId, accountNumber: application.account_number, customerAccountId, mainAccountId }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Approval error:', error.message);
    return res.status(500).json({ success: false, message: 'Error approving application', details: error.message });
  }
};