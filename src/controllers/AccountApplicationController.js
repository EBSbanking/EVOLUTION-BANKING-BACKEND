// controllers/AccountApplicationController.js - UPDATED WITH NOTIFICATIONS
// FIXED: Product lookup with proper replacements
// FIXED: Collation mismatch with COLLATE
// FIXED: Product column value in accounts table
// UPDATED: Send notifications to approving officer

import AccountApplication from '../models/AccountApplication.js';
import CustomerAccount from '../models/CustomerAccount.js';
import DepositTransaction from '../models/DepositTransaction.js';
import Customer from '../models/Customer.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import AuditTrail from '../models/AuditTrail.js';
import SavingsProduct from '../models/SavingsProduct.js';
import smsService from '../utils/smsService.js';
import SMS from '../models/SMS.js';
import sequelize from '../../config/db.js';
import { v2 as cloudinaryV2 } from 'cloudinary';
import multer from 'multer';
import { Op } from 'sequelize';

// Import Notification Service
import notificationService, { 
  sendApprovalNotification, 
  sendNotification 
} from '../services/NotificationService.js';

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

/**
 * Send notification to approving officer
 */
const sendApprovalRequestNotification = async (application, customer, productName, req) => {
  try {
    const BU_ID = application.branch_id || application.BU_ID;
    const submittedBy = req.user?.user_name || req.user?.name || 'System User';
    
    // Send notification to branch managers/approving officers
    const notificationResult = await sendApprovalNotification({
      itemType: 'account_opening',
      itemId: application.id,
      itemName: `Account for ${customer.FIRST_NAME || ''} ${customer.LAST_NAME || ''}`.trim() || application.account_name,
      description: `New account application for ${application.account_name} with product ${productName}`,
      submittedBy: submittedBy,
      BU_ID: BU_ID,
      priority: 'high',
      metadata: {
        customerId: application.customer_id,
        accountNumber: application.account_number,
        productName: productName,
        applicationId: application.id,
        amount: application.amount
      }
    });

    console.log('✅ Approval notification sent:', notificationResult);
    return notificationResult;
  } catch (error) {
    console.error('❌ Failed to send approval notification:', error);
    return null;
  }
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

    // ========== SEND NOTIFICATION TO APPROVING OFFICER ==========
    try {
      await sendApprovalRequestNotification(accountApplication, customer, productName, req);
    } catch (notifError) {
      console.warn('⚠️ Notification failed but application was created:', notifError.message);
    }

    // ========== GL REFERENCE ==========
    try {
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
            openingAmount,
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
      data: { 
        applicationId: accountApplication.id, 
        customerId: normalizedCUST_ID, 
        accountNumber, 
        productName, 
        status: 'PENDING',
        notificationSent: true
      }
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

    // ========== SEND NOTIFICATION TO APPROVING OFFICER ==========
    try {
      await sendApprovalRequestNotification(accountApplication, customer, productName, req);
    } catch (notifError) {
      console.warn('⚠️ Notification failed but application was created:', notifError.message);
    }

    // ========== GL REFERENCE ==========
    try {
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
            openingAmount,
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
      data: { 
        applicationId: accountApplication.id, 
        customerId: normalizedCUST_ID, 
        accountNumber, 
        productName, 
        productCode, 
        status: 'PENDING',
        notificationSent: true
      }
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

// ================================================================
// ✅ FIXED: approveApplicationByCustomer WITH NOTIFICATIONS
// ================================================================
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
    
    // Get the application
    const application = await AccountApplication.findOne({
      where: {
        customer_id: normalizedCustomerId,
        branch_id: approverBranchId,
        status: 'PENDING'
      },
      order: [['created_at', 'DESC']],
      transaction
    });

    if (!application) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: `No pending application for customer ${customerId} in branch ${approverBranchId}` 
      });
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
      { 
        replacements: [normalizedCustomerId], 
        type: sequelize.QueryTypes.SELECT, 
        transaction 
      }
    );
    
    if (!customer) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: `Customer ${normalizedCustomerId} not found` 
      });
    }

    const openingAmount = parseFloat(application.amount) || 0;
    
    // ========== PRODUCT LOOKUP ==========
    let productName = application.product_name || 'Savings Account';
    let productCode = application.product_code || 'SAV001';
    let productType = 'SAVINGS';
    let currency = application.currency || 'NGN';
    let productId = application.product_id;
    
    console.log('🔍 Looking up product with:', { productId, productCode, productName });

    try {
      let product = null;
      
      // Try 1: By PROD_ID (numeric)
      if (productId && !isNaN(parseInt(productId))) {
        console.log('🔍 Trying PROD_ID:', productId);
        const [result] = await sequelize.query(
          `SELECT PROD_ID, PROD_CD, PROD_DESC, PRODUCT_TYPE, CRNCY_ID 
           FROM savings_products 
           WHERE PROD_ID = ? AND REC_ST = 'Active' 
           LIMIT 1`,
          { 
            replacements: [parseInt(productId)], 
            type: sequelize.QueryTypes.SELECT, 
            transaction 
          }
        );
        if (result) {
          product = result;
          console.log('✅ Found by PROD_ID:', product);
        }
      }
      
      // Try 2: By PROD_CD (if not found)
      if (!product && productCode) {
        console.log('🔍 Trying PROD_CD:', productCode);
        const [result] = await sequelize.query(
          `SELECT PROD_ID, PROD_CD, PROD_DESC, PRODUCT_TYPE, CRNCY_ID 
           FROM savings_products 
           WHERE PROD_CD COLLATE utf8mb4_unicode_ci = ? AND REC_ST = 'Active' 
           LIMIT 1`,
          { 
            replacements: [productCode], 
            type: sequelize.QueryTypes.SELECT, 
            transaction 
          }
        );
        if (result) {
          product = result;
          console.log('✅ Found by PROD_CD:', product);
        }
      }
      
      // Try 3: By PROD_DESC (if not found)
      if (!product && productName) {
        console.log('🔍 Trying PROD_DESC:', productName);
        const [result] = await sequelize.query(
          `SELECT PROD_ID, PROD_CD, PROD_DESC, PRODUCT_TYPE, CRNCY_ID 
           FROM savings_products 
           WHERE PROD_DESC COLLATE utf8mb4_unicode_ci LIKE ? AND REC_ST = 'Active' 
           LIMIT 1`,
          { 
            replacements: [`%${productName}%`], 
            type: sequelize.QueryTypes.SELECT, 
            transaction 
          }
        );
        if (result) {
          product = result;
          console.log('✅ Found by PROD_DESC:', product);
        }
      }
      
      // Try 4: Default - get first active savings product
      if (!product) {
        console.log('🔍 No product found, getting default savings product...');
        const [result] = await sequelize.query(
          `SELECT PROD_ID, PROD_CD, PROD_DESC, PRODUCT_TYPE, CRNCY_ID 
           FROM savings_products 
           WHERE REC_ST = 'Active' AND PRODUCT_TYPE = 'SAVINGS' 
           ORDER BY PROD_ID LIMIT 1`,
          { 
            type: sequelize.QueryTypes.SELECT, 
            transaction 
          }
        );
        if (result) {
          product = result;
          console.log('✅ Found default product:', product);
        }
      }
      
      if (product) {
        productName = product.PROD_DESC || productName;
        productType = product.PRODUCT_TYPE || 'SAVINGS';
        currency = product.CRNCY_ID || 'NGN';
        productCode = product.PROD_CD || productCode;
        productId = product.PROD_ID || productId;
        console.log('✅ Final product selected:', { productName, productType, productCode });
      } else {
        console.warn('⚠️ No product found, using defaults:', { productName, productType });
      }
    } catch (err) {
      console.warn('Could not fetch product details:', err.message);
      // Continue with defaults
    }

    // ----- 4. Create entry in customer_accounts -----
    const [existingCustomerAccount] = await sequelize.query(
      `SELECT * FROM customer_accounts WHERE account_number = ? LIMIT 1`,
      { 
        replacements: [application.account_number], 
        type: sequelize.QueryTypes.SELECT, 
        transaction 
      }
    );
    
    let customerAccountId;
    if (existingCustomerAccount) {
      await sequelize.query(
        `UPDATE customer_accounts SET 
          account_name = ?, 
          status = 'ACTIVE', 
          product_id = ?, 
          product_code = ?,
          updated_at = NOW() 
        WHERE id = ?`,
        { 
          replacements: [
            application.account_name || productName,
            productId,
            productCode,
            existingCustomerAccount.id
          ], 
          transaction 
        }
      );
      customerAccountId = existingCustomerAccount.id;
    } else {
      const [result] = await sequelize.query(
        `INSERT INTO customer_accounts (
          CUST_ID, account_number, account_name, depositor_name, 
          product_id, product_code, branch_id, status, 
          opening_balance, ledger_balance, cleared_balance, 
          currency, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, NOW(), NOW())`,
        { 
          replacements: [
            normalizedCustomerId, 
            application.account_number, 
            application.account_name || productName, 
            application.depositor_name || '',
            productId,
            productCode,
            approverBranchId,
            openingAmount,
            openingAmount,
            openingAmount,
            currency
          ], 
          transaction 
        }
      );
      customerAccountId = result.insertId;
    }

    // ----- 5. Create entry in accounts table - WITH PRODUCT COLUMN -----
    const now = new Date();
    const accountType = productType === 'SAVINGS' ? 'SAVINGS' : 
                       productType === 'CURRENT' ? 'CURRENT' : 
                       productType === 'LOAN' ? 'LOAN' : 'SAVINGS';
    const finalProductName = productName || 'Savings Account';

    console.log('📊 Final product name being used:', finalProductName);

    const insertQuery = `
      INSERT INTO accounts (
        customer_id,
        account_number,
        acct_no,
        acct_nm,
        account_type,
        product_type,
        product,
        branch,
        ledger_balance,
        available_balance,
        cleared_balance,
        rec_st,
        currency,
        online_enabled,
        dr_allowed,
        cr_allowed,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertValues = [
      parseInt(application.customer_id) || 0,
      application.account_number,
      application.account_number,
      application.account_name || finalProductName,
      accountType,
      productType || 'SAVINGS',
      finalProductName,
      parseInt(application.branch_id) || 1,
      openingAmount,
      openingAmount,
      openingAmount,
      'ACTIVE',
      currency || 'NGN',
      1,
      1,
      1,
      now,
      now
    ];

    let mainAccountId;
    try {
      const [result] = await sequelize.query(insertQuery, {
        replacements: insertValues,
        transaction
      });
      mainAccountId = result.insertId;
      console.log('✅ Account created with ID:', mainAccountId);
    } catch (insertError) {
      console.error('❌ Failed to insert into accounts table:', insertError.message);
      
      const simpleQuery = `
        INSERT INTO accounts (
          customer_id,
          account_number,
          product_type,
          product,
          branch,
          ledger_balance,
          available_balance,
          cleared_balance,
          rec_st,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const simpleValues = [
        parseInt(application.customer_id) || 0,
        application.account_number,
        productType || 'SAVINGS',
        finalProductName,
        parseInt(application.branch_id) || 1,
        openingAmount,
        openingAmount,
        openingAmount,
        'ACTIVE',
        now,
        now
      ];
      
      const [simpleResult] = await sequelize.query(simpleQuery, {
        replacements: simpleValues,
        transaction
      });
      mainAccountId = simpleResult.insertId;
      console.log('✅ Account created with simplified insert, ID:', mainAccountId);
    }

    // ----- 6. Create opening deposit transaction -----
    if (openingAmount > 0) {
      try {
        await sequelize.query(
          `INSERT INTO deposit_transactions (
            customer_id, account_number, transaction_type, amount, 
            currency, status, created_by, transaction_date, 
            branch_id, approved_by, approved_at, created_at, updated_at
          ) VALUES (?, ?, 'OPENING_DEPOSIT', ?, ?, 'COMPLETED', ?, NOW(), ?, ?, NOW(), NOW(), NOW())`,
          { 
            replacements: [
              normalizedCustomerId, 
              application.account_number, 
              openingAmount, 
              currency, 
              approvedBy || userId, 
              approverBranchId, 
              approvedBy || userId
            ], 
            transaction 
          }
        );
        console.log('✅ Deposit transaction created');
      } catch (e) { 
        console.warn('Deposit transaction not created:', e.message); 
      }
    }

    // ----- 7. Update workflow -----
    try {
      await sequelize.query(
        `UPDATE wf_work_items SET STATUS = 'COMPLETED', UPDATED_AT = NOW() WHERE ITEM_REF_NO = ? AND ITEM_TYPE = 'AccountApplication'`,
        { 
          replacements: [application.account_number], 
          transaction 
        }
      );
    } catch (e) { 
      console.warn('Workflow update failed:', e.message); 
    }

    // ----- 8. Create audit trail -----
    try {
      await AuditTrail.create({
        event_id: Date.now(),
        user_id: userId,
        event_type: 'ACCOUNT_APPLICATION_APPROVE',
        action: 'Approve Account Application',
        old_value: JSON.stringify({ status: 'PENDING' }),
        new_value: JSON.stringify({ 
          status: 'APPROVED', 
          accountNumber: application.account_number,
          productId: productId,
          productName: finalProductName
        }),
        ip_address: req.ip || '127.0.0.1',
        entity_type: 'AccountApplication',
        entity_id: application.id,
        status: 'SUCCESS',
        account_no: application.account_number,
        description: `Approved application ${application.id} with product ${finalProductName}`,
        timestamp: now,
        created_at: now,
        updated_at: now
      }, { transaction });
    } catch (e) { 
      console.warn('Audit trail creation failed:', e.message); 
    }

    // ========== ✅ SEND APPROVAL NOTIFICATION ==========
    try {
      // Send notification to customer (SMS already handled)
      // Send notification to the approving officer about successful approval
      await sendNotification({
        roleId: 'Admin',
        message: `Account application for ${customer.FIRST_NAME || ''} ${customer.LAST_NAME || ''} has been approved. Account: ${application.account_number}`,
        itemId: application.id,
        priority: 'medium',
        metadata: {
          customerId: normalizedCustomerId,
          accountNumber: application.account_number,
          productName: finalProductName,
          approvedBy: approvedBy || userId
        }
      });
      console.log('✅ Approval notification sent');
    } catch (notifError) {
      console.warn('⚠️ Notification failed:', notifError.message);
    }

    await transaction.commit();

    // ----- 9. Send SMS notification -----
    const customerPhone = customer.PHONE_NO;
    const customerFullName = `${customer.FIRST_NAME || ''} ${customer.LAST_NAME || ''}`.trim() || customer.CUST_NM;
    const accountNumber = application.account_number;
    const referenceNo = `APP-${application.id}-${Date.now()}`;

    if (customerPhone && customerPhone.trim()) {
      const formattedAmount = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
      }).format(openingAmount);
      const formattedBalance = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
      }).format(openingAmount);

      const messageContent = `${customerFullName}, your ${finalProductName} account ${accountNumber} has been opened with an initial deposit of ${formattedAmount}. New balance: ${formattedBalance}. Ref: ${referenceNo}. Thank you for banking with us.`;

      try {
        await SMS.create({
          EXTERNAL_SMS_ID: `SMS_${Date.now()}_${Math.random()}`,
          RECIPIENT_PHONE_NUMBER: customerPhone,
          REC_ST: 'A',
          USER_ID: approvedBy || userId,
          MESSAGE_CONTENT: messageContent,
          CREATE_DT: now,
          CREATED_BY: approvedBy || userId,
          ACCT_BALANCE: openingAmount,
          DISP_AVAIL_BAL: openingAmount,
          TXN_AMT: openingAmount,
          ACCT_NO: accountNumber,
          DR_CR_IND: 'C',
          TXN_DATE: now,
          DEPOSITOR_PAYEE_NM: customerFullName,
        });
        console.log(`✅ SMS record created for account opening: ${accountNumber}`);

        setImmediate(async () => {
          try {
            const result = await smsService.sendSMS(customerPhone, messageContent);
            if (!result.success) {
              console.error(`❌ SMS sending failed for ${customerPhone}:`, result.error);
            } else {
              console.log(`✅ SMS sent to ${customerPhone} for account opening`);
            }
          } catch (err) {
            console.error(`❌ Error sending SMS to ${customerPhone}:`, err.message);
          }
        });
      } catch (smsError) {
        console.error(`❌ Failed to create SMS record for account ${accountNumber}:`, smsError.message);
      }
    } else {
      console.warn(`⚠️ No phone number for customer ${normalizedCustomerId}, skipping SMS alert`);
    }

    return res.json({
      success: true,
      message: 'Application approved and accounts created',
      data: { 
        applicationId: application.id, 
        customerId: normalizedCustomerId, 
        accountNumber: application.account_number, 
        customerAccountId, 
        mainAccountId,
        product: {
          id: productId,
          code: productCode,
          name: finalProductName,
          type: productType
        }
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ approveApplicationByCustomer error:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.message && error.message.includes("Field 'product' doesn't have a default value")) {
      return res.status(500).json({ 
        success: false, 
        message: 'The accounts table requires a product value. Please ensure the product is selected.',
        details: 'Product column is required in accounts table'
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Error approving application', 
      details: error.message 
    });
  }
};

export const approveByCustomer = approveApplicationByCustomer; // alias

// ================================================================
// ✅ FIXED: approveApplicationAndCreateAccount WITH NOTIFICATIONS
// ================================================================
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
    
    // ========== PRODUCT LOOKUP ==========
    let productName = application.product_name || 'Savings Account';
    let productCode = application.product_code || 'SAV001';
    let productType = 'SAVINGS';
    let currency = application.currency || 'NGN';
    let productId = application.product_id;
    
    console.log('🔍 Looking up product with:', { productId, productCode, productName });

    try {
      let product = null;
      
      if (productId && !isNaN(parseInt(productId))) {
        const [result] = await sequelize.query(
          `SELECT PROD_ID, PROD_CD, PROD_DESC, PRODUCT_TYPE, CRNCY_ID 
           FROM savings_products 
           WHERE PROD_ID = ? AND REC_ST = 'Active' 
           LIMIT 1`,
          { 
            replacements: [parseInt(productId)], 
            type: sequelize.QueryTypes.SELECT, 
            transaction 
          }
        );
        if (result) product = result;
      }
      
      if (!product && productCode) {
        const [result] = await sequelize.query(
          `SELECT PROD_ID, PROD_CD, PROD_DESC, PRODUCT_TYPE, CRNCY_ID 
           FROM savings_products 
           WHERE PROD_CD COLLATE utf8mb4_unicode_ci = ? AND REC_ST = 'Active' 
           LIMIT 1`,
          { 
            replacements: [productCode], 
            type: sequelize.QueryTypes.SELECT, 
            transaction 
          }
        );
        if (result) product = result;
      }
      
      if (!product && productName) {
        const [result] = await sequelize.query(
          `SELECT PROD_ID, PROD_CD, PROD_DESC, PRODUCT_TYPE, CRNCY_ID 
           FROM savings_products 
           WHERE PROD_DESC COLLATE utf8mb4_unicode_ci LIKE ? AND REC_ST = 'Active' 
           LIMIT 1`,
          { 
            replacements: [`%${productName}%`], 
            type: sequelize.QueryTypes.SELECT, 
            transaction 
          }
        );
        if (result) product = result;
      }
      
      if (!product) {
        const [result] = await sequelize.query(
          `SELECT PROD_ID, PROD_CD, PROD_DESC, PRODUCT_TYPE, CRNCY_ID 
           FROM savings_products 
           WHERE REC_ST = 'Active' AND PRODUCT_TYPE = 'SAVINGS' 
           ORDER BY PROD_ID LIMIT 1`,
          { 
            type: sequelize.QueryTypes.SELECT, 
            transaction 
          }
        );
        if (result) product = result;
      }
      
      if (product) {
        productName = product.PROD_DESC || productName;
        productType = product.PRODUCT_TYPE || 'SAVINGS';
        currency = product.CRNCY_ID || 'NGN';
        productCode = product.PROD_CD || productCode;
        productId = product.PROD_ID || productId;
        console.log('✅ Final product selected:', { productName, productType, productCode });
      }
    } catch (err) {
      console.warn('Could not fetch product details:', err.message);
    }

    // Create entry in customer_accounts
    const [customerAccountResult] = await sequelize.query(
      `INSERT INTO customer_accounts (CUST_ID, account_number, account_name, depositor_name, product_id, product_code, branch_id, status, opening_balance, ledger_balance, cleared_balance, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, NOW(), NOW())`,
      { 
        replacements: [
          normalizedCustomerId, 
          application.account_number, 
          application.account_name, 
          application.depositor_name, 
          productId, 
          productCode, 
          approverBranchId, 
          openingAmount, 
          openingAmount, 
          openingAmount, 
          currency
        ], 
        transaction 
      }
    );
    const customerAccountId = customerAccountResult.insertId;

    // ----- Create entry in accounts table -----
    const now = new Date();
    const finalProductName = productName || 'Savings Account';

    const insertQuery = `
      INSERT INTO accounts (
        customer_id,
        account_number,
        acct_no,
        acct_nm,
        account_type,
        product_type,
        product,
        branch,
        ledger_balance,
        available_balance,
        cleared_balance,
        rec_st,
        currency,
        online_enabled,
        dr_allowed,
        cr_allowed,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertValues = [
      parseInt(normalizedCustomerId) || 0,
      application.account_number,
      application.account_number,
      application.account_name || finalProductName,
      productType === 'SAVINGS' ? 'SAVINGS' : 'SAVINGS',
      productType || 'SAVINGS',
      finalProductName,
      parseInt(approverBranchId) || 1,
      openingAmount,
      openingAmount,
      openingAmount,
      'ACTIVE',
      currency || 'NGN',
      1,
      1,
      1,
      now,
      now
    ];

    let mainAccountId;
    try {
      const [mainAccountResult] = await sequelize.query(insertQuery, {
        replacements: insertValues,
        transaction
      });
      mainAccountId = mainAccountResult.insertId;
      console.log('✅ Account created with ID:', mainAccountId);
    } catch (insertError) {
      console.error('❌ Failed to insert into accounts:', insertError.message);
      
      const simpleQuery = `
        INSERT INTO accounts (
          customer_id,
          account_number,
          product_type,
          product,
          branch,
          ledger_balance,
          available_balance,
          cleared_balance,
          rec_st,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const simpleValues = [
        parseInt(normalizedCustomerId) || 0,
        application.account_number,
        productType || 'SAVINGS',
        finalProductName,
        parseInt(approverBranchId) || 1,
        openingAmount,
        openingAmount,
        openingAmount,
        'ACTIVE',
        now,
        now
      ];
      
      const [simpleResult] = await sequelize.query(simpleQuery, {
        replacements: simpleValues,
        transaction
      });
      mainAccountId = simpleResult.insertId;
      console.log('✅ Account created with simplified insert, ID:', mainAccountId);
    }

    // If opening amount > 0, create deposit transaction
    if (openingAmount > 0) {
      try {
        await sequelize.query(
          `INSERT INTO deposit_transactions (customer_id, account_number, transaction_type, amount, currency, status, created_by, transaction_date, branch_id, approved_by, approved_at)
           VALUES (?, ?, 'OPENING_DEPOSIT', ?, ?, 'COMPLETED', ?, NOW(), ?, ?, NOW())`,
          { replacements: [normalizedCustomerId, application.account_number, openingAmount, currency, approvedBy || userId, approverBranchId, approvedBy || userId], transaction }
        );
      } catch (e) { console.warn('Deposit transaction not created:', e.message); }
    }

    // Workflow update
    try {
      await sequelize.query(
        `UPDATE wf_work_items SET STATUS = 'COMPLETED', UPDATED_AT = NOW() WHERE ITEM_REF_NO = ? AND ITEM_TYPE = 'AccountApplication'`,
        { replacements: [application.account_number], transaction }
      );
    } catch (e) { console.warn('Workflow update failed:', e.message); }

    // Audit trail
    try {
      await sequelize.query(
        `INSERT INTO audit_trail (event_id, user_id, event_type, action, old_value, new_value, ip_address, timestamp, entity_type, entity_id, status, account_no, description, branch_id)
         VALUES (?, ?, 'ACCOUNT_APPLICATION_APPROVE', 'Approve Account Application', ?, ?, ?, NOW(), 'AccountApplication', ?, 'SUCCESS', ?, ?, ?)`,
        { 
          replacements: [
            Date.now(), 
            userId, 
            JSON.stringify({ status: 'PENDING' }), 
            JSON.stringify({ status: 'APPROVED', accountNumber: application.account_number }), 
            req.ip || 'unknown', 
            application.id, 
            application.account_number, 
            `Approved application ${application.id} with product ${finalProductName}`, 
            approverBranchId
          ], 
          transaction 
        }
      );
    } catch (e) { console.warn('Audit trail failed:', e.message); }

    // ========== ✅ SEND APPROVAL NOTIFICATION ==========
    try {
      await sendNotification({
        roleId: 'Admin',
        message: `Account application for ${customer.FIRST_NAME || ''} ${customer.LAST_NAME || ''} has been approved. Account: ${application.account_number}`,
        itemId: application.id,
        priority: 'medium',
        metadata: {
          customerId: normalizedCustomerId,
          accountNumber: application.account_number,
          productName: finalProductName,
          approvedBy: approvedBy || userId
        }
      });
      console.log('✅ Approval notification sent');
    } catch (notifError) {
      console.warn('⚠️ Notification failed:', notifError.message);
    }

    await transaction.commit();

    // Send SMS notification
    const customerPhone = customer.PHONE_NO;
    const customerFullName = `${customer.FIRST_NAME || ''} ${customer.LAST_NAME || ''}`.trim() || customer.CUST_NM;
    const accountNumber = application.account_number;
    const amount = openingAmount;
    const newBalance = openingAmount;
    const referenceNo = `APP-${application.id}-${Date.now()}`;

    if (customerPhone && customerPhone.trim()) {
      const formattedAmount = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
      }).format(amount);
      const formattedBalance = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
      }).format(newBalance);

      const messageContent = `${customerFullName}, your ${finalProductName} account ${accountNumber} has been opened with an initial deposit of ${formattedAmount}. New balance: ${formattedBalance}. Ref: ${referenceNo}. Thank you for banking with us.`;

      try {
        await SMS.create({
          EXTERNAL_SMS_ID: `SMS_${Date.now()}_${Math.random()}`,
          RECIPIENT_PHONE_NUMBER: customerPhone,
          REC_ST: 'A',
          USER_ID: approvedBy || userId,
          MESSAGE_CONTENT: messageContent,
          CREATE_DT: new Date(),
          CREATED_BY: approvedBy || userId,
          ACCT_BALANCE: newBalance,
          DISP_AVAIL_BAL: newBalance,
          TXN_AMT: amount,
          ACCT_NO: accountNumber,
          DR_CR_IND: 'C',
          TXN_DATE: new Date(),
          DEPOSITOR_PAYEE_NM: customerFullName,
        });
        console.log(`✅ SMS record created for account opening: ${accountNumber}`);

        setImmediate(async () => {
          try {
            const result = await smsService.sendSMS(customerPhone, messageContent);
            if (!result.success) console.error(`SMS failed: ${result.error}`);
          } catch (err) {
            console.error(`SMS error: ${err.message}`);
          }
        });
      } catch (smsError) {
        console.error(`Failed to create SMS record: ${smsError.message}`);
      }
    } else {
      console.warn(`No phone number for customer ${normalizedCustomerId}, skipping SMS`);
    }

    return res.json({
      success: true,
      message: 'Application approved and accounts created',
      data: { 
        applicationId: application.id, 
        customerId: normalizedCustomerId, 
        accountNumber: application.account_number, 
        customerAccountId, 
        mainAccountId,
        product: {
          id: productId,
          code: productCode,
          name: finalProductName,
          type: productType
        }
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Approval error:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.message && error.message.includes("Field 'product' doesn't have a default value")) {
      return res.status(500).json({ 
        success: false, 
        message: 'The accounts table requires a product value. Please ensure the product is selected.',
        details: 'Product column is required in accounts table'
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Error approving application', 
      details: error.message 
    });
  }
};