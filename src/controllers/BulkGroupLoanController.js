// controllers/bulkGroupLoanController.js - Final version with all fixes

import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import xlsx from 'xlsx';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';
import pLimit from 'p-limit';

// Import your models
import LoanInterestRate from '../models/LoanInterestRate.js';
import LoanProduct from '../models/LoanProduct.js';
import LoanAccount from '../models/LoanAccount.js';
import LoanPortfolio from '../models/LoanPortfolio.js';
import GroupLoan from '../models/GroupLoan.js';
import Transaction from '../models/Transaction.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import AuditTrail from '../models/AuditTrail.js';
import Customer from '../models/Customer.js';
import LoanRepaymentHistory from '../models/LoanRepaymentHistory.js';
import LoanRepayment from '../models/LoanRepayment.js';
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';
import { createLoanProvision } from '../utils/provisionHelper.js';
import LoanProvision from '../models/LoanProvision.js'; 

// ========== CONFIGURATION ==========
const DAYS_PER_MONTH = 30; // Number of days used to convert a daily loan term to months

// ========== MULTER CONFIGURATION ==========
const BULK_UPLOAD_DIR = 'uploads/bulk-loans';
if (!fs.existsSync(BULK_UPLOAD_DIR)) {
  fs.mkdirSync(BULK_UPLOAD_DIR, { recursive: true });
  console.log(`📁 Created upload directory: ${BULK_UPLOAD_DIR}`);
}

const bulkLoanStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, BULK_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `bulk-loan-${timestamp}-${random}${ext}`);
  }
});

export const upload = multer({ 
  storage: bulkLoanStorage,
  limits: { 
    fileSize: 500 * 1024 * 1024,
    fieldSize: 500 * 1024 * 1024,
    fields: 100,
    parts: 10000,
    headerPairs: 5000,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedMimes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ];
    
    if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedExts.join(', ')}`));
    }
  }
});

// Enhanced multer error handler
export const handleMulterError = (err, req, res, next) => {
  console.error('Multer error details:', {
    code: err.code,
    message: err.message,
    field: err.field,
    storageErrors: err.storageErrors
  });
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: `File too large. Maximum size is 500MB.`
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field. Please upload file with field name "file".'
      });
    }
    if (err.code === 'LIMIT_PART_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many parts in the form. Please try a smaller file or split into multiple files.'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  }
  
  if (err && err.message && err.message.includes('Unexpected end of form')) {
    return res.status(400).json({
      success: false,
      message: 'Upload interrupted. Please check your internet connection and try again.'
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed.'
    });
  }
  
  next();
};

// Upload timeout middleware - INCREASED TO 30 MINUTES
export const uploadTimeout = (req, res, next) => {
  req.setTimeout(1800000, () => {
    console.error('Upload request timeout after 30 minutes');
    res.status(408).json({
      success: false,
      message: 'Upload timeout (30 minutes). Please try with a smaller file or split into multiple files.'
    });
  });
  res.setTimeout(1800000);
  next();
};

// Test endpoint - public
export const testUpload = asyncHandler(async (req, res) => {
  console.log('=== TEST UPLOAD ENDPOINT HIT ===');
  console.log('Request headers:', req.headers);
  console.log('Request file:', req.file);
  
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file received'
    });
  }
  
  res.json({
    success: true,
    message: 'File received successfully',
    file: {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    }
  });
});

// ========== HELPER FUNCTIONS ==========
const safeNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
};

const generateEventId = () => {
  const timestamp = Date.now() % 1000000000;
  const random = Math.floor(Math.random() * 10000);
  let eventId = timestamp * 10000 + random;
  while (eventId > 2147483647) {
    eventId = Math.floor(eventId / 10);
  }
  return eventId;
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection.remoteAddress || '127.0.0.1';
};

const createGLTransactions = async (
  journalId,
  transactionId,
  debitAccount,
  creditAccount,
  amount,
  narration,
  transactionType,
  createdBy,
  currency = 'NGN',
  options = {}
) => {
  const { transaction } = options;
  
  try {
    const glTransaction = await GLAccountTransaction.create({
      JOURNAL_ID: journalId,
      TRANSACTION_ID: transactionId,
      DR_ACCT_NO: debitAccount,
      CR_ACCT_NO: creditAccount,
      AMOUNT: amount,
      NARRATION: narration,
      CREATED_BY: createdBy,
      UPDATED_BY: createdBy,
      TRANSACTION_TYPE: transactionType,
      CURRENCY_CODE: currency,
      STATUS: 'POSTED',
      TransactionId: Date.now()
    }, { transaction });
    
    return glTransaction;
  } catch (error) {
    console.error(`❌ Failed to create GL transaction:`, error.message);
    throw error;
  }
};

const generateTransactionId = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  const baseNumber = Math.floor(timestamp / 1000);
  
  return {
    transactionIdentifier: baseNumber + random,
    eventId: baseNumber + random + 1000000,
    journalId: baseNumber + random + 2000000,
    reference: `REF_BULK_${timestamp}_${random}`
  };
};

const parseGLAccountsFromProduct = (loanProduct, branchId = '001') => {
  let defaultGLAccounts = {};
  let branchGLAccounts = [];
  
  if (loanProduct.default_g_l_accounts) {
    defaultGLAccounts = typeof loanProduct.default_g_l_accounts === 'string' 
      ? JSON.parse(loanProduct.default_g_l_accounts) 
      : loanProduct.default_g_l_accounts;
  } else if (loanProduct.defaultGLAccounts) {
    defaultGLAccounts = typeof loanProduct.defaultGLAccounts === 'string'
      ? JSON.parse(loanProduct.defaultGLAccounts)
      : loanProduct.defaultGLAccounts;
  }
  
  if (loanProduct.branch_g_l_accounts) {
    branchGLAccounts = typeof loanProduct.branch_g_l_accounts === 'string'
      ? JSON.parse(loanProduct.branch_g_l_accounts)
      : loanProduct.branch_g_l_accounts;
  } else if (loanProduct.branchGLAccounts) {
    branchGLAccounts = typeof loanProduct.branchGLAccounts === 'string'
      ? JSON.parse(loanProduct.branchGLAccounts)
      : loanProduct.branchGLAccounts;
  }
  
  const branchConfig = Array.isArray(branchGLAccounts) 
    ? branchGLAccounts.find(b => b.branchCode === branchId || b.branchCode === '*')
    : null;
  
  const loanGLAccount = branchConfig?.loanGLAccount || 
                        branchConfig?.loan_g_l_account ||
                        defaultGLAccounts.loanGLAccount || 
                        defaultGLAccounts.loan_g_l_account;
  
  const customerGLAccount = defaultGLAccounts.interestPayableGLAccountNo ||
                            defaultGLAccounts.interest_payable_g_l_account_no;
  
  const interestReceivableGL = branchConfig?.interestGLAccountNo || 
                               branchConfig?.interest_g_l_account_no ||
                               defaultGLAccounts.interestGLAccountNo ||
                               defaultGLAccounts.interest_g_l_account_no;
  
  const interestIncomeGL = defaultGLAccounts.interestPayableGLAccountNo ||
                           defaultGLAccounts.interest_payable_g_l_account_no ||
                           interestReceivableGL;

  // ✨ NEW: Extract provision GL account (with fallback)
  const provisionGLAccount = branchConfig?.provisionGLAccount ||
                             branchConfig?.provision_g_l_account ||
                             defaultGLAccounts.provisionGLAccount ||
                             defaultGLAccounts.provision_g_l_account;

  return {
    loanGLAccount,
    customerGLAccount,
    interestReceivableGL,
    interestIncomeGL,
    provisionGLAccount  // ← now available
  };
};

const calculateFlatRateEMI = (principal, flatRatePercent, termMonths, paymentFrequency = 'MONTHLY') => {
  const totalInterest = principal * (flatRatePercent / 100) * termMonths;
  const totalRepayment = principal + totalInterest;

  
  let numberOfInstallments = termMonths;
  switch(paymentFrequency.toUpperCase()) {
    case 'DAILY':
      numberOfInstallments = termMonths * 30;
      break;
    case 'WEEKLY':
      numberOfInstallments = termMonths * 4;
      break;
    case 'BIWEEKLY':
      numberOfInstallments = termMonths * 2;
      break;
    case 'MONTHLY':
      numberOfInstallments = termMonths;
      break;
    case 'QUARTERLY':
      numberOfInstallments = Math.ceil(termMonths / 3);
      break;
    default:
      numberOfInstallments = termMonths;
  }
  
  const emi = totalRepayment / numberOfInstallments;
  
  return {
    principal,
    flatRatePercent,
    termMonths,
    totalInterest: parseFloat(totalInterest.toFixed(2)),
    totalRepayment: parseFloat(totalRepayment.toFixed(2)),
    emi: parseFloat(emi.toFixed(2)),
    numberOfInstallments,
    paymentFrequency,
    breakdown: {
      monthlyPrincipal: parseFloat((principal / termMonths).toFixed(2)),
      monthlyInterest: parseFloat((totalInterest / termMonths).toFixed(2)),
      totalPayments: termMonths,
      actualInstallments: numberOfInstallments,
      perInstallmentPrincipal: parseFloat((principal / numberOfInstallments).toFixed(2)),
      perInstallmentInterest: parseFloat((totalInterest / numberOfInstallments).toFixed(2))
    }
  };
};

const calculateDueDate = (startDate, installmentNumber, paymentFrequency) => {
  const dueDate = new Date(startDate);
  
  switch(paymentFrequency.toUpperCase()) {
    case 'DAILY':
      dueDate.setDate(startDate.getDate() + installmentNumber);
      break;
    case 'WEEKLY':
      dueDate.setDate(startDate.getDate() + (installmentNumber * 7));
      break;
    case 'BIWEEKLY':
      dueDate.setDate(startDate.getDate() + (installmentNumber * 14));
      break;
    case 'MONTHLY':
      dueDate.setMonth(startDate.getMonth() + installmentNumber);
      break;
    case 'QUARTERLY':
      dueDate.setMonth(startDate.getMonth() + (installmentNumber * 3));
      break;
    default:
      dueDate.setMonth(startDate.getMonth() + installmentNumber);
  }
  
  return dueDate;
};

// ========== BATCH PROCESSING CONFIGURATION ==========
const BATCH_SIZE = 100;
const CONCURRENT_BATCHES = 3;

// ========== HELPER FUNCTION TO UPDATE LOAN PORTFOLIO ==========
const updateLoanPortfolio = async (loanProduct, branchCode, principalAmount, totalInterest, createdBy, connection) => {
  try {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    const productCode = loanProduct.productCode || loanProduct.PRODUCT_CODE || loanProduct.PROD_ID?.toString() || 'UNKNOWN';
    const productName = loanProduct.PRODUCT_NAME || loanProduct.name || 'Unnamed Product';
    const productType = loanProduct.PRODUCT_TYPE || 'GROUP_LOAN';
    const prodId = loanProduct.PROD_ID;

    // Check if portfolio record exists
    let portfolio = await LoanPortfolio.findOne({
      where: {
        b_r_a_n_c_h__i_d: branchCode,
        p_r_o_d__i_d: prodId,
        y_e_a_r: year,
        m_o_n_t_h: month
      },
      transaction: connection
    });

    if (!portfolio) {
      // Create new record
      portfolio = await LoanPortfolio.create({
        b_r_a_n_c_h__i_d: branchCode,
        p_r_o_d__i_d: prodId,
        p_r_o_d_u_c_t__c_o_d_e: productCode,
        p_r_o_d_u_c_t__n_a_m_e: productName,
        p_r_o_d_u_c_t__t_y_p_e: productType,
        m_o_n_t_h: month,
        y_e_a_r: year,
        c_u_r_r_e_n_c_y: 'NGN',
        t_o_t_a_l__d_i_s_b_u_r_s_e_d: principalAmount,
        t_o_t_a_l__n_e_t__d_i_s_b_u_r_s_e_m_e_n_t: principalAmount,
        t_o_t_a_l__p_r_i_n_c_i_p_a_l: principalAmount,
        o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l: principalAmount,
        t_o_t_a_l__i_n_t_e_r_e_s_t__a_c_c_r_u_e_d: totalInterest,
        n_u_m_b_e_r__o_f__l_o_a_n_s: 1,
        a_c_t_i_v_e__l_o_a_n_s: 1,
        d_i_s_b_u_r_s_e_m_e_n_t__c_o_u_n_t: 1,
        a_v_e_r_a_g_e__l_o_a_n__s_i_z_e: principalAmount,
        s_t_a_t_u_s: 'ACTIVE',
        c_r_e_a_t_e_d__b_y: createdBy,
        u_p_d_a_t_e_d__b_y: createdBy,
        c_r_e_a_t_e_d__d_a_t_e: new Date(),
        u_p_d_a_t_e_d__d_a_t_e: new Date()
      }, { transaction: connection });
      console.log(`✅ Created new portfolio record for product ${productCode}`);
    } else {
      // Update existing record
      await portfolio.update({
        t_o_t_a_l__d_i_s_b_u_r_s_e_d: portfolio.t_o_t_a_l__d_i_s_b_u_r_s_e_d + principalAmount,
        t_o_t_a_l__n_e_t__d_i_s_b_u_r_s_e_m_e_n_t: portfolio.t_o_t_a_l__n_e_t__d_i_s_b_u_r_s_e_m_e_n_t + principalAmount,
        t_o_t_a_l__p_r_i_n_c_i_p_a_l: portfolio.t_o_t_a_l__p_r_i_n_c_i_p_a_l + principalAmount,
        o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l: portfolio.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l + principalAmount,
        t_o_t_a_l__i_n_t_e_r_e_s_t__a_c_c_r_u_e_d: portfolio.t_o_t_a_l__i_n_t_e_r_e_s_t__a_c_c_r_u_e_d + totalInterest,
        n_u_m_b_e_r__o_f__l_o_a_n_s: portfolio.n_u_m_b_e_r__o_f__l_o_a_n_s + 1,
        a_c_t_i_v_e__l_o_a_n_s: portfolio.a_c_t_i_v_e__l_o_a_n_s + 1,
        d_i_s_b_u_r_s_e_m_e_n_t__c_o_u_n_t: portfolio.d_i_s_b_u_r_s_e_m_e_n_t__c_o_u_n_t + 1,
        a_v_e_r_a_g_e__l_o_a_n__s_i_z_e: (portfolio.t_o_t_a_l__p_r_i_n_c_i_p_a_l + principalAmount) / (portfolio.n_u_m_b_e_r__o_f__l_o_a_n_s + 1),
        u_p_d_a_t_e_d__b_y: createdBy,
        u_p_d_a_t_e_d__d_a_t_e: new Date()
      }, { transaction: connection });
      console.log(`✅ Updated portfolio record for product ${productCode}`);
    }

    return true;
  } catch (error) {
    console.error(`❌ Portfolio update failed:`, error.message);
    throw error;
  }
};

// ========== MAIN BULK UPLOAD FUNCTION ==========
export const bulkUploadGroupLoanDisbursement = asyncHandler(async (req, res) => {
  console.log('=== BULK UPLOAD START ===');
  console.log('Request headers:', {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length']
  });
  console.log('File:', req.file ? {
    originalname: req.file.originalname,
    size: req.file.size,
    sizeMB: (req.file.size / 1024 / 1024).toFixed(2),
    mimetype: req.file.mimetype,
    path: req.file.path
  } : 'NO FILE');
  
  const connection = await sequelize.transaction();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const fileSizeMB = req.file.size / 1024 / 1024;
    console.log(`📂 Processing bulk upload file: ${req.file.originalname} (${fileSizeMB.toFixed(2)}MB)`);
    
    if (!fs.existsSync(req.file.path)) {
      console.error(`❌ File does not exist at path: ${req.file.path}`);
      throw new Error('Uploaded file not found');
    }
    
    let workbook;
    let data;
    try {
      console.log('📖 Reading Excel file...');
      workbook = xlsx.readFile(req.file.path, {
        cellDates: true,
        defval: "",
        sheetRows: 20000
      });
      console.log('✅ Excel file read successfully');
    } catch (parseError) {
      console.error('❌ Error parsing Excel file:', parseError);
      throw new Error(`Failed to parse Excel file: ${parseError.message}`);
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    data = xlsx.utils.sheet_to_json(worksheet);
    
    const totalRecords = data.length;
    console.log(`📊 Found ${totalRecords} records in Excel file`);
    
    if (totalRecords === 0) {
      throw new Error('Excel file is empty');
    }
    
    if (data.length > 0) {
      console.log('📋 First record sample:', JSON.stringify(data[0], null, 2));
    }
    
    const requiredFields = ['group_loan_id', 'customer_id', 'customer_name', 'disbursed_amount'];
    const firstRecord = data[0];
    const missingFields = requiredFields.filter(field => !firstRecord.hasOwnProperty(field));
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required columns in Excel: ${missingFields.join(', ')}. Please check the template format.`);
    }
    
    const firstDisbursed = parseFloat(firstRecord.disbursed_amount);
    if (isNaN(firstDisbursed) || firstDisbursed <= 0) {
      throw new Error(`Invalid disbursed_amount value: "${firstRecord.disbursed_amount}". Must be a positive number.`);
    }
    
    const groupedByLoan = {};
    for (const record of data) {
      const groupLoanId = record.group_loan_id.toString().trim();
      if (!groupedByLoan[groupLoanId]) {
        groupedByLoan[groupLoanId] = [];
      }
      groupedByLoan[groupLoanId].push(record);
    }
    
    const totalGroups = Object.keys(groupedByLoan).length;
    console.log(`📦 Grouped into ${totalGroups} groups`);
    
    const results = {
      batchId: uuidv4(),
      totalRecords,
      successful: [],
      failed: [],
      groupLoansProcessed: [],
      repaymentsProcessed: [],
      summary: {
        totalDisbursed: 0,
        totalRepaymentsRecorded: 0,
        totalInstallmentsRecorded: 0,
        totalPaidAmount: 0,
        totalOutstandingPrincipal: 0,
        totalOutstandingInterest: 0,
        totalProcessingFees: 0
      }
    };
    
    const createdBy = req.user?.id || 'SYSTEM';
    const userName = req.user?.name || 'System User';
    
    const groupLoanIds = Object.keys(groupedByLoan);
    let processedGroups = 0;
    
    for (let i = 0; i < groupLoanIds.length; i += BATCH_SIZE) {
      const batchGroups = groupLoanIds.slice(i, Math.min(i + BATCH_SIZE, groupLoanIds.length));
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(groupLoanIds.length / BATCH_SIZE);
      
      console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batchGroups.length} groups)`);
      
      const limit = pLimit(CONCURRENT_BATCHES);
      const batchPromises = batchGroups.map(groupLoanId => 
        limit(() => processGroupLoan(
          groupLoanId, 
          groupedByLoan[groupLoanId], 
          results, 
          req.file.originalname,
          createdBy,
          userName
        ))
      );
      
      await Promise.all(batchPromises);
      processedGroups += batchGroups.length;
      console.log(`✅ Batch ${batchNumber} complete. Progress: ${processedGroups}/${groupLoanIds.length} groups`);
    }
    
    const numericEntityId = parseInt(results.batchId.replace(/-/g, '').slice(0, 10), 10) || Date.now() % 2147483647;
    
    let auditStatus;
    if (results.failed.length === 0) {
      auditStatus = 'SUCCESS';
    } else if (results.successful.length === 0) {
      auditStatus = 'FAILED';
    } else {
      auditStatus = 'SUCCESS';
      console.log(`⚠️ Partial success: ${results.successful.length} succeeded, ${results.failed.length} failed`);
    }
    
    const auditData = {
      batchId: results.batchId,
      fileName: req.file.originalname,
      totalRecords: results.totalRecords,
      successful: results.successful.length,
      failed: results.failed.length,
      summary: results.summary,
      user_name: userName,
      uploadedBy: createdBy,
      uploadDate: new Date().toISOString()
    };
    
    console.log('📝 Creating audit trail with data:', auditData);
    
    let eventId;
    let duplicate = true;
    let attempts = 0;
    while (duplicate && attempts < 5) {
      eventId = generateEventId();
      try {
        await AuditTrail.create({
          event_id: eventId,
          user_id: createdBy,
          user_name: userName,
          event_type: 'BULK_UPLOAD',
          action: 'BULK_GROUP_LOAN_DISBURSEMENT',
          entity_type: 'BulkUpload',
          entity_id: numericEntityId,
          old_value: null,
          new_value: JSON.stringify(auditData),
          ip_address: getClientIp(req),
          user_agent: req.headers['user-agent'],
          status: auditStatus,
          description: `Bulk uploaded ${results.successful.length} loans (${results.failed.length} failed)`,
          timestamp: new Date()
        });
        duplicate = false;
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError' && err.fields?.audit_trails_event_id) {
          attempts++;
          console.warn(`⚠️ Duplicate event_id ${eventId}, retrying (${attempts}/5)`);
          continue;
        }
        throw err;
      }
    }
    if (duplicate) {
      throw new Error('Could not generate unique event ID after 5 attempts');
    }
    
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log(`🗑️ Deleted temporary file: ${req.file.path}`);
      } catch (unlinkError) {
        console.error(`⚠️ Failed to delete file: ${unlinkError.message}`);
      }
    }
    
    console.log(`\n🎉 Bulk upload completed successfully`);
    console.log(`✅ Successful loans: ${results.successful.length}`);
    console.log(`❌ Failed loans: ${results.failed.length}`);
    console.log(`💰 Total Disbursed: ₦${results.summary.totalDisbursed.toLocaleString()}`);
    
    res.status(200).json({
      success: true,
      message: `Bulk upload processed: ${results.successful.length} loans disbursed, ${results.failed.length} failed`,
      data: {
        batchId: results.batchId,
        summary: results.summary,
        successful: results.successful,
        failed: results.failed,
        groupLoansProcessed: results.groupLoansProcessed,
        repaymentsProcessed: results.repaymentsProcessed,
        totalRecords: results.totalRecords,
        successfulCount: results.successful.length,
        failedCount: results.failed.length
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('💥 Bulk upload failed:', error);
    console.error('Error stack:', error.stack);
    
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log(`🗑️ Deleted temporary file after error: ${req.file.path}`);
      } catch (unlinkError) {
        console.error(`⚠️ Failed to delete file: ${unlinkError.message}`);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to process bulk upload',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ========== HELPER FUNCTIONS FOR PROCESSING ==========
const generateNumericId = (stringId) => {
  let hash = 0;
  for (let i = 0; i < stringId.length; i++) {
    hash = ((hash << 5) - hash) + stringId.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
};

async function processGroupLoan(groupLoanId, members, results, fileName, createdBy, userName) {
  const connection = await sequelize.transaction();
  
  try {
    console.log(`🔄 Processing group: ${groupLoanId} with ${members.length} members`);
    
    const productCode = members[0].product_code;
    if (!productCode) {
      throw new Error(`Product code missing for group ${groupLoanId}`);
    }
    
    const loanProduct = await LoanProduct.findOne({
      where: {
        [Op.or]: [
          { productCode },
          { PROD_ID: productCode },
          { PRODUCT_SHORT_NAME: productCode.toUpperCase() }
        ]
      }
    }, { transaction: connection });
    
    if (!loanProduct) {
      throw new Error(`Loan product with code ${productCode} not found`);
    }
    
    let interestRate = null;
    try {
      if (loanProduct.LOAN_INTEREST_RATE_ID) {
        const LoanInterestRateModule = await import('../models/LoanInterestRate.js');
        const LoanInterestRateModel = LoanInterestRateModule.default;
        interestRate = await LoanInterestRateModel.findByPk(loanProduct.LOAN_INTEREST_RATE_ID, {
          transaction: connection
        });
        
        if (interestRate) {
          console.log(`✅ Found interest rate: ${interestRate.name || interestRate.code} (${interestRate.DEFAULT_RATE_PER_MONTH}%)`);
        }
      }
    } catch (rateError) {
      console.warn(`⚠️ Could not load interest rate for product ${productCode}: ${rateError.message}`);
    }
    
    if (!interestRate) {
      console.log(`⚠️ No interest rate found for product ${productCode}, using default rate 6.2%`);
      interestRate = {
        DEFAULT_RATE_PER_MONTH: 6.2,
        id: null,
        name: 'Default Rate',
        code: 'DEFAULT'
      };
    }
    
    const numericGroupId = generateNumericId(groupLoanId);
    console.log(`📊 Generated numeric groupId: ${numericGroupId} from ${groupLoanId}`);
    
    const productType = loanProduct.PRODUCT_TYPE || 'GROUP_LOAN';
    const paymentFrequency = members[0].payment_frequency || 'MONTHLY';
    const branchId = members[0].branch_code || '001';
    const glAccounts = parseGLAccountsFromProduct(loanProduct, branchId);
    
    let groupLoanRecord = await GroupLoan.findOne({
      where: {
        [Op.or]: [
          { loanId: groupLoanId },
          { groupCode: groupLoanId }
        ]
      },
      transaction: connection
    });
    
    const primaryRelationshipManager = members[0].relationship_officer_id || userName;
    let disbursementDate = members[0].disbursement_date ? new Date(members[0].disbursement_date) : new Date();
    
    let totalProcessingFees = 0;
    if (loanProduct.processing_fee_percentage) {
      totalProcessingFees = members.reduce((sum, m) => 
        sum + (parseFloat(m.disbursed_amount) * (loanProduct.processing_fee_percentage / 100)), 0);
    }
    
    if (!groupLoanRecord) {
      groupLoanRecord = await GroupLoan.create({
        groupId: numericGroupId,
        loanId: groupLoanId,
        groupName: members[0].group_name || `Group ${groupLoanId}`,
        groupCode: members[0].group_code || groupLoanId,
        branch: members[0].branch_code || 1,
        productId: loanProduct.PROD_ID,
        productName: loanProduct.PRODUCT_NAME || loanProduct.name,
        totalAmount: members.reduce((sum, m) => sum + parseFloat(m.disbursed_amount), 0),
        memberCount: members.length,
        members: members.map(m => ({
          memberId: m.customer_id,
          name: m.customer_name,
          individualAmount: parseFloat(m.disbursed_amount),
          installmentsPaid: parseInt(m.installments_paid) || 0,
          amountPaid: parseFloat(m.paid_amount) || 0
        })),
        primaryRelationshipManager,
        status: 'disbursed',
        totalFeesCollected: totalProcessingFees,
        netDisbursementAmount: members.reduce((sum, m) => sum + parseFloat(m.disbursed_amount), 0) - totalProcessingFees,
        numPeriods: members[0].tenure || 12,
        paymentFrequency,
        DISBURSEMENT_STATUS: 'DISBURSED',
        DISBURSEMENT_DATE: disbursementDate,
        DISBURSEMENT_METHOD: 'BULK_UPLOAD',
        createdBy,
        metadata: {
          bulkUpload: true,
          fileName,
          uploadedAt: new Date().toISOString(),
          recordCount: members.length,
          interestRateUsed: {
            rate: interestRate.DEFAULT_RATE_PER_MONTH,
            source: interestRate.id ? 'from_product' : 'default'
          }
        }
      }, { transaction: connection });
      
      console.log(`✅ Created group loan: ${groupLoanId} (ID: ${groupLoanRecord.id})`);
    } else {
      console.log(`✅ Found existing group loan: ${groupLoanId} (ID: ${groupLoanRecord.id})`);
    }
    
    const individualLoanIds = [];
    
    for (const member of members) {
      const loanAccountId = await processMember(
        member, 
        groupLoanId, 
        groupLoanRecord, 
        loanProduct, 
        interestRate, 
        productType, 
        paymentFrequency, 
        branchId, 
        glAccounts,
        createdBy, 
        connection, 
        results
      );
      if (loanAccountId) {
        individualLoanIds.push(loanAccountId);
      }
    }
    
    await groupLoanRecord.update({
      individualLoanAccounts: individualLoanIds,
      metadata: {
        ...groupLoanRecord.metadata,
        processedAt: new Date().toISOString(),
        successfulMembers: individualLoanIds.length
      }
    }, { transaction: connection });
    
    await connection.commit();
    
    results.groupLoansProcessed.push({
      groupLoanId,
      databaseId: groupLoanRecord.id,
      memberCount: members.length,
      successfulMembers: individualLoanIds.length,
      totalAmount: groupLoanRecord.totalAmount
    });
    
    console.log(`✅ Group ${groupLoanId} processed successfully (${individualLoanIds.length}/${members.length} members)`);
    
  } catch (error) {
    await connection.rollback();
    console.error(`❌ Error processing group ${groupLoanId}:`, error);
    results.failed.push({
      groupLoanId,
      error: `Group loan processing failed: ${error.message}`
    });
  }
};

async function processMember(member, groupLoanId, groupLoanRecord, loanProduct, interestRate, productType, paymentFrequency, branchId, glAccounts, createdBy, connection, results) {
  try {
    const {
      customer_id,
      customer_name,
      disbursed_amount,
      installments_paid = 0,
      paid_amount = 0,
      payment_dates = '',
      branch_code = branchId,
      interest_rate: memberInterestRate,
      tenure = 12,
      relationship_officer_id,
      disbursement_date
    } = member;
    
    const memberDisbursementDate = disbursement_date ? new Date(disbursement_date) : new Date();
    const principalAmount = parseFloat(disbursed_amount);
    let installmentsPaidCount = parseInt(installments_paid) || 0;
    
    const flatRatePercent = memberInterestRate ? 
      parseFloat(memberInterestRate) : 
      parseFloat(interestRate?.DEFAULT_RATE_PER_MONTH || 6.2);
    
    // Convert tenure to months based on frequency
    let termInMonths;
    switch(paymentFrequency.toUpperCase()) {
      case 'DAILY':
        termInMonths = tenure / DAYS_PER_MONTH;
        break;
      case 'WEEKLY':
        termInMonths = tenure / 4;
        break;
      case 'BIWEEKLY':
        termInMonths = tenure / 2;
        break;
      case 'MONTHLY':
        termInMonths = tenure;
        break;
      case 'QUARTERLY':
        termInMonths = tenure * 3;
        break;
      default:
        termInMonths = tenure;
    }
    termInMonths = Math.max(1, termInMonths);
    
    const flatRateCalc = calculateFlatRateEMI(principalAmount, flatRatePercent, termInMonths, paymentFrequency);
    const totalRepayable = flatRateCalc.totalRepayment;
    const installmentAmount = flatRateCalc.emi;
    const totalInterest = flatRateCalc.totalInterest;
    const numberOfInstallments = flatRateCalc.numberOfInstallments;
    
    // Cap installments paid
    if (installmentsPaidCount > numberOfInstallments) {
      console.warn(`⚠️ Customer ${customer_id}: installments_paid (${installmentsPaidCount}) > number of installments (${numberOfInstallments}). Capping to ${numberOfInstallments}.`);
      installmentsPaidCount = numberOfInstallments;
    }
    
    // Parse payment dates
    let paymentDatesArray = [];
    if (payment_dates && typeof payment_dates === 'string') {
      paymentDatesArray = payment_dates.split(',').map(d => new Date(d.trim()));
    }
    
    // Generate loan account number
    let loanAccNo;
    let isUnique = false;
    let attemptCount = 0;
    const maxAttempts = 20;
    
    while (!isUnique && attemptCount < maxAttempts) {
      const generationResult = await generateLoanAccountNumberByProdId(loanProduct.PROD_ID);
      let candidateNumber;
      if (typeof generationResult === 'string') {
        candidateNumber = generationResult;
      } else if (generationResult && generationResult.accountNumber) {
        candidateNumber = generationResult.accountNumber;
      } else {
        candidateNumber = `319${Date.now().toString().slice(-7)}`;
      }
      candidateNumber = String(candidateNumber).padStart(10, '0').slice(0, 10);
      
      const existingAccount = await LoanAccount.findOne({
        where: { ACCT_NO: candidateNumber },
        transaction: connection
      });
      if (!existingAccount) {
        loanAccNo = candidateNumber;
        isUnique = true;
      }
      attemptCount++;
    }
    if (!loanAccNo) {
      const timestamp = Date.now().toString();
      const last7Digits = timestamp.slice(-7);
      loanAccNo = `319${last7Digits}`;
    }
    
    // Get customer details
    const customer = await Customer.findOne({
      where: { CUST_ID: String(customer_id).padStart(10, '0') },
      attributes: ['CUST_ID', 'FIRST_NAME', 'LAST_NAME', 'HOME_ADDRESS'],
      transaction: connection
    });
    
    // Calculate maturity date
    let maturityDate = new Date(memberDisbursementDate);
    switch(paymentFrequency.toUpperCase()) {
      case 'DAILY':
        maturityDate.setDate(memberDisbursementDate.getDate() + (tenure * DAYS_PER_MONTH));
        break;
      case 'WEEKLY':
        maturityDate.setDate(memberDisbursementDate.getDate() + (tenure * 7 * 4));
        break;
      case 'BIWEEKLY':
        maturityDate.setDate(memberDisbursementDate.getDate() + (tenure * 14 * 2));
        break;
      case 'MONTHLY':
        maturityDate.setMonth(memberDisbursementDate.getMonth() + tenure);
        break;
      case 'QUARTERLY':
        maturityDate.setMonth(memberDisbursementDate.getMonth() + (tenure * 3));
        break;
      default:
        maturityDate.setMonth(memberDisbursementDate.getMonth() + tenure);
    }
    
    // Calculate outstanding balances after prepaid installments
    let outstandingPrincipal = principalAmount;
    let outstandingInterest = totalInterest;
    let totalAmountPaid = parseFloat(paid_amount) || 0;
    
    if (installmentsPaidCount > 0) {
      const paidInstallmentsTotal = installmentAmount * installmentsPaidCount;
      if (totalAmountPaid === 0) {
        totalAmountPaid = paidInstallmentsTotal;
      }
      
      const totalPrincipalPaid = (principalAmount / totalRepayable) * totalAmountPaid;
      const totalInterestPaid = (totalInterest / totalRepayable) * totalAmountPaid;
      
      outstandingPrincipal = principalAmount - totalPrincipalPaid;
      outstandingInterest = totalInterest - totalInterestPaid;
    }
    
    const outstandingBalance = outstandingPrincipal + outstandingInterest;
    
    // Create loan account
    const newLoanAcc = await LoanAccount.create({
      CUST_ID: String(customer_id).padStart(10, '0'),
      ACCT_NM: customer_name,
      ACCT_NO: loanAccNo,
      LOAN_STATUS: installmentsPaidCount === numberOfInstallments ? 'CLOSED' : 'ACTIVE',
      PRODUCT_TYPE: productType,
      AMOUNT: principalAmount,
      amount: principalAmount,
      PROD_ID: loanProduct.PROD_ID,
      PRODUCT_CODE: loanProduct.productCode || loanProduct.PROD_ID,
      PRODUCT_NAME: loanProduct.PRODUCT_NAME || loanProduct.name,
      BRANCH_ID: branch_code,
      BU_ID: branch_code,
      PAYMENT_FREQUENCY: paymentFrequency,
      TERM_CD: getTermCode(paymentFrequency),
      TERM_VALUE: tenure,
      EMI_AMOUNT: installmentAmount,
      PRIMARY_OFFICER_ID: relationship_officer_id || 'SYSTEM',
      RATE_TYPE: 'FIXED',
      INTEREST_TYPE: 'SIMPLE',
      INTEREST_RATE: flatRatePercent,
      INTEREST_RATE_ID: interestRate?.id,
      INTEREST_CALCULATION_METHOD: 'FLAT',
      MATURITY_DT: maturityDate,
      START_DATE: memberDisbursementDate,
      DISBURSEMENT_LIMIT: principalAmount,
      ORIGINAL_PRINCIPAL: principalAmount,
      OUTSTANDING_PRINCIPAL: outstandingPrincipal,
      ACCRUED_INTEREST: outstandingInterest,
      CURRENT_BALANCE: -outstandingBalance,
      LEDGER_BALANCE: -outstandingBalance,
      AVAILABLE_BALANCE: -outstandingBalance,
      TOTAL_DUE: outstandingBalance,
      TOTAL_REPAID_AMOUNT: totalAmountPaid,
      PAYMENTS_MADE: installmentsPaidCount,
      createdBy,
      groupLoanId: groupLoanRecord.id,
      GROUP_LOAN_REF: {
        loanId: groupLoanId,
        groupCode: groupLoanRecord.groupCode,
        totalGroupAmount: groupLoanRecord.totalAmount,
        productId: loanProduct.PROD_ID
      },
      DISBURSEMENT_STATUS: 'DISBURSED',
      DISBURSEMENT_DATE: memberDisbursementDate,
      IS_DISBURSED: true,
      METADATA: {
        bulkUpload: true,
        groupLoanId,
        flatRatePercent,
        totalInterest,
        totalRepayable,
        numberOfInstallments,
        paymentFrequency,
        installmentAmount,
        installmentsPrepaid: installmentsPaidCount,
        amountPrepaid: totalAmountPaid,
        uploadedAt: new Date().toISOString(),
        paymentDates: paymentDatesArray
      }
    }, { transaction: connection });
    
    console.log(`✅ Created loan account ${loanAccNo} for ${customer_name}`);
    
    // ============================================================
    // ⭐ LOAN PROVISION (1% of disbursed amount) – NEW
    // ============================================================
    try {
      const branchCode = branch_code || '001';
      await createLoanProvision({
        loanAccount: newLoanAcc,         // pass the just-created loan account object
        branchCode: branchCode,
        disbursedAmount: principalAmount,
        createdBy: createdBy,
        transaction: connection
      });
    } catch (provisionError) {
      console.warn(`⚠️ Provision creation failed for loan ${loanAccNo}: ${provisionError.message}`);
      // Non‑critical – continue so the loan is still created
    }
    
    // Create disbursement transaction
    const disbursementIds = generateTransactionId();
    
    await Transaction.create({
      transaction_type: 'LOAN_DISBURSEMENT',
      TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
      AMOUNT: principalAmount,
      amount: principalAmount,
      ACCT_NM: customer_name,
      account_name: customer_name,
      CUST_ID: String(customer_id).padStart(10, '0'),
      customer_id: String(customer_id).padStart(10, '0'),
      BU_ID: branch_code,
      bu_id: branch_code,
      ACCT_ID: newLoanAcc.id,
      account_id: newLoanAcc.id,
      ACCT_NO: loanAccNo,
      description: `Bulk disbursement for group loan ${groupLoanId}`,
      reference: disbursementIds.reference,
      transaction_date: memberDisbursementDate,
      status: 'COMPLETED',
      createdBy,
      branch: branch_code,
      TRANSACTION_IDENTIFIER: disbursementIds.transactionIdentifier,
      EVENT_ID: disbursementIds.eventId,
      TRAN_JOURNAL_ID: disbursementIds.journalId,
      metadata: {
        purpose: 'LOAN_DISBURSEMENT',
        groupLoanId,
        memberId: customer_id,
        loanAccountId: newLoanAcc.id,
        disbursementMethod: 'BULK_UPLOAD'
      }
    }, { transaction: connection });
    
    // =====================================================
    // AUTOMATIC REPAYMENT RECORDING FOR PREPAID INSTALLMENTS
    // =====================================================
    
    const memberInstallments = [];
    
    for (let i = 1; i <= numberOfInstallments; i++) {
      const dueDate = calculateDueDate(memberDisbursementDate, i, paymentFrequency);
      const principalPortion = (principalAmount / totalRepayable) * installmentAmount;
      const interestPortion = (totalInterest / totalRepayable) * installmentAmount;
      const isPrepaid = i <= installmentsPaidCount;
      
      const paymentDate = isPrepaid && paymentDatesArray[i - 1] 
        ? paymentDatesArray[i - 1] 
        : (isPrepaid ? dueDate : null);
      
      memberInstallments.push({
        installmentNo: i,
        dueDate,
        principal: parseFloat(principalPortion.toFixed(2)),
        interest: parseFloat(interestPortion.toFixed(2)),
        totalPayment: installmentAmount,
        remainingBalance: totalRepayable - (installmentAmount * i),
        status: isPrepaid ? 'PAID' : 'PENDING',
        amountPaid: isPrepaid ? installmentAmount : 0,
        principalPaid: isPrepaid ? principalPortion : 0,
        interestPaid: isPrepaid ? interestPortion : 0,
        paymentDate: paymentDate,
        isBackdated: isPrepaid
      });
      
      if (isPrepaid) {
        const repaymentRef = `PREPAID_${groupLoanId}_${customer_id}_${i}`;
        const actualPaymentDate = paymentDate || dueDate;
        
        await LoanRepaymentHistory.create({
          loan_account_id: newLoanAcc.id,
          account_number: loanAccNo,
          customer_id: String(customer_id).padStart(10, '0'),
          repayment_date: actualPaymentDate,
          principal_amount: principalPortion,
          interest_amount: interestPortion,
          penalty_amount: 0,
          total_amount: installmentAmount,
          reference: repaymentRef,
          created_by: createdBy,
          created_at: new Date()
        }, { transaction: connection });
        
        await LoanRepayment.create({
          loan_account_id: newLoanAcc.id,
          loan_account_number: loanAccNo,
          customer_id: String(customer_id).padStart(10, '0'),
          customer_name: customer_name,
          principal_amount: principalPortion,
          interest_amount: interestPortion,
          penalty_amount: 0,
          total_amount: installmentAmount,
          installment_number: i,
          repayment_date: actualPaymentDate,
          transaction_reference: repaymentRef,
          status: 'COMPLETED'
        }, { transaction: connection });
        
        results.summary.totalRepaymentsRecorded++;
        console.log(`✅ Recorded prepaid installment ${i}/${numberOfInstallments} for ${customer_name} - Amount: ₦${installmentAmount.toLocaleString()}`);
      }
    }
    
    // Create repayment schedule record
    const termCode = getTermCode(paymentFrequency);
    
    await sequelize.query(
      `INSERT INTO repayment_schedules (
        loan_account_id, account_number, customer_id, start_date, maturity_date,
        principal_amount, interest_rate, term, term_type, payment_frequency,
        emi_amount, total_interest, total_repayment, status, is_schedule_complete,
        interest_rate_type, interest_type, calculation_method, is_term_based_rate,
        schedule, installments_json, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      {
        replacements: [
          newLoanAcc.id,
          loanAccNo,
          String(customer_id).padStart(10, '0'),
          memberDisbursementDate,
          maturityDate,
          principalAmount,
          flatRatePercent,
          tenure,
          termCode,
          paymentFrequency,
          installmentAmount,
          totalInterest,
          totalRepayable,
          installmentsPaidCount === numberOfInstallments ? 'COMPLETED' : 'ACTIVE',
          installmentsPaidCount === numberOfInstallments,
          'FIXED',
          'SIMPLE',
          'FLAT',
          false,
          JSON.stringify(memberInstallments),
          JSON.stringify(memberInstallments),
          createdBy
        ],
        transaction: connection
      }
    );
    
    // Update portfolio
    try {
      await updateLoanPortfolio(loanProduct, branch_code, principalAmount, totalInterest, createdBy, connection);
    } catch (portfolioError) {
      console.warn(`⚠️ Portfolio update failed for ${loanAccNo}:`, portfolioError.message);
    }
    
    // Update summary
    results.summary.totalDisbursed += principalAmount;
    results.summary.totalOutstandingPrincipal += outstandingPrincipal;
    results.summary.totalOutstandingInterest += outstandingInterest;
    results.summary.totalInstallmentsRecorded += installmentsPaidCount;
    results.summary.totalPaidAmount += totalAmountPaid;
    
    results.successful.push({
      customer_id,
      customer_name,
      groupLoanId,
      account_number: loanAccNo,
      disbursed_amount: principalAmount,
      emi: installmentAmount,
      payment_frequency: paymentFrequency,
      installments_paid: installmentsPaidCount,
      paid_amount: totalAmountPaid,
      payment_dates: payment_dates,
      loan_status: installmentsPaidCount === numberOfInstallments ? 'CLOSED' : 'ACTIVE',
      remaining_balance: outstandingBalance
    });
    
    return newLoanAcc.id;
    
  } catch (error) {
    console.error(`❌ Error processing member ${member.customer_id}:`, error.message);
    results.failed.push({
      ...member,
      error: error.message
    });
    return null;
  }
};

// Helper function to get term code from payment frequency
function getTermCode(paymentFrequency) {
  switch(paymentFrequency.toUpperCase()) {
    case 'DAILY': return 'D';
    case 'WEEKLY': return 'W';
    case 'BIWEEKLY': return 'W';
    case 'MONTHLY': return 'M';
    case 'QUARTERLY': return 'Q';
    default: return 'M';
  }
}

// ========== BULK LOAN REPAYMENT FUNCTION ==========
export const bulkLoanRepayment = asyncHandler(async (req, res) => {
  console.log('=== BULK LOAN REPAYMENT START ===');
  console.log('Request headers:', {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length']
  });
  console.log('File:', req.file ? {
    originalname: req.file.originalname,
    size: req.file.size,
    sizeMB: (req.file.size / 1024 / 1024).toFixed(2),
    mimetype: req.file.mimetype,
    path: req.file.path
  } : 'NO FILE');
  
  const connection = await sequelize.transaction();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const fileSizeMB = req.file.size / 1024 / 1024;
    console.log(`📂 Processing bulk repayment file: ${req.file.originalname} (${fileSizeMB.toFixed(2)}MB)`);
    
    if (!fs.existsSync(req.file.path)) {
      console.error(`❌ File does not exist at path: ${req.file.path}`);
      throw new Error('Uploaded file not found');
    }
    
    let workbook;
    let data;
    try {
      console.log('📖 Reading Excel file...');
      workbook = xlsx.readFile(req.file.path, {
        cellDates: true,
        defval: "",
        sheetRows: 20000
      });
      console.log('✅ Excel file read successfully');
    } catch (parseError) {
      console.error('❌ Error parsing Excel file:', parseError);
      throw new Error(`Failed to parse Excel file: ${parseError.message}`);
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    data = xlsx.utils.sheet_to_json(worksheet);
    
    const totalRecords = data.length;
    console.log(`📊 Found ${totalRecords} repayment records in Excel file`);
    
    if (totalRecords === 0) {
      throw new Error('Excel file is empty');
    }
    
    const requiredFields = ['loan_account_number', 'repayment_amount', 'payment_date'];
    const firstRecord = data[0];
    const missingFields = requiredFields.filter(field => !firstRecord.hasOwnProperty(field));
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required columns in Excel: ${missingFields.join(', ')}. Please check the template format.`);
    }
    
    const results = {
      batchId: uuidv4(),
      totalRecords,
      successful: [],
      failed: [],
      transactions: [],
      summary: {
        totalRepaymentAmount: 0,
        totalPrincipalPaid: 0,
        totalInterestPaid: 0,
        totalPenaltyPaid: 0,
        totalLoansUpdated: 0
      }
    };
    
    const createdBy = req.user?.id || 'SYSTEM';
    const userName = req.user?.name || 'System User';
    
    let glAccounts = { loanGLAccount: null, customerGLAccount: null, interestIncomeGL: null };
    
    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      console.log(`\n📝 Processing repayment ${i + 1}/${totalRecords}`);
      
      try {
        const result = await processSingleRepayment(
          record,
          results,
          createdBy,
          userName,
          glAccounts,
          connection
        );
        
        if (result.success) {
          results.successful.push(result);
          results.transactions.push(result.transaction);
          results.summary.totalRepaymentAmount += result.amount;
          results.summary.totalPrincipalPaid += result.principalPaid || 0;
          results.summary.totalInterestPaid += result.interestPaid || 0;
          results.summary.totalPenaltyPaid += result.penaltyPaid || 0;
          results.summary.totalLoansUpdated++;
        } else {
          results.failed.push({
            record,
            error: result.error
          });
        }
        
      } catch (error) {
        console.error(`❌ Error processing repayment:`, error);
        results.failed.push({
          record,
          error: error.message
        });
      }
    }
    
    await connection.commit();
    
    const numericEntityId = parseInt(results.batchId.replace(/-/g, '').slice(0, 10), 10) || Date.now() % 2147483647;
    
    const auditData = {
      batchId: results.batchId,
      fileName: req.file.originalname,
      totalRecords: results.totalRecords,
      successful: results.successful.length,
      failed: results.failed.length,
      summary: results.summary,
      user_name: userName,
      uploadedBy: createdBy,
      uploadDate: new Date().toISOString(),
      type: 'REPAYMENT'
    };
    
    let eventId;
    let duplicate = true;
    let attempts = 0;
    while (duplicate && attempts < 5) {
      eventId = generateEventId();
      try {
        await AuditTrail.create({
          event_id: eventId,
          user_id: createdBy,
          user_name: userName,
          event_type: 'BULK_UPLOAD',
          action: 'BULK_LOAN_REPAYMENT',
          entity_type: 'BulkRepayment',
          entity_id: numericEntityId,
          old_value: null,
          new_value: JSON.stringify(auditData),
          ip_address: getClientIp(req),
          user_agent: req.headers['user-agent'],
          status: results.failed.length === 0 ? 'SUCCESS' : 'PARTIAL',
          description: `Bulk repayment: ${results.successful.length} successful, ${results.failed.length} failed`,
          timestamp: new Date()
        });
        duplicate = false;
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError' && err.fields?.audit_trails_event_id) {
          attempts++;
          console.warn(`⚠️ Duplicate event_id ${eventId}, retrying (${attempts}/5)`);
          continue;
        }
        throw err;
      }
    }
    if (duplicate) {
      throw new Error('Could not generate unique event ID after 5 attempts');
    }
    
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log(`🗑️ Deleted temporary file: ${req.file.path}`);
      } catch (unlinkError) {
        console.error(`⚠️ Failed to delete file: ${unlinkError.message}`);
      }
    }
    
    console.log(`\n🎉 Bulk repayment completed successfully`);
    console.log(`✅ Successful repayments: ${results.successful.length}`);
    console.log(`❌ Failed repayments: ${results.failed.length}`);
    console.log(`💰 Total Repayment Amount: ₦${results.summary.totalRepaymentAmount.toLocaleString()}`);
    
    res.status(200).json({
      success: true,
      message: `Bulk repayment processed: ${results.successful.length} successful, ${results.failed.length} failed`,
      data: {
        batchId: results.batchId,
        summary: results.summary,
        successful: results.successful,
        failed: results.failed,
        transactions: results.transactions,
        totalRecords: results.totalRecords,
        successfulCount: results.successful.length,
        failedCount: results.failed.length
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('💥 Bulk repayment failed:', error);
    console.error('Error stack:', error.stack);
    
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log(`🗑️ Deleted temporary file after error: ${req.file.path}`);
      } catch (unlinkError) {
        console.error(`⚠️ Failed to delete file: ${unlinkError.message}`);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to process bulk repayment',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ========== PROCESS SINGLE REPAYMENT ==========
async function processSingleRepayment(record, results, createdBy, userName, glAccounts, connection) {
  try {
    const {
      loan_account_number,
      repayment_amount,
      principal_paid,
      interest_paid,
      penalty_paid = 0,
      payment_date,
      payment_method = 'CASH',
      reference,
      narration
    } = record;
    
    const amount = parseFloat(repayment_amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error(`Invalid repayment amount: ${repayment_amount}`);
    }
    
    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: loan_account_number },
      transaction: connection
    });
    
    if (!loanAccount) {
      throw new Error(`Loan account ${loan_account_number} not found`);
    }
    
    if (loanAccount.LOAN_STATUS === 'CLOSED') {
      throw new Error(`Loan account ${loan_account_number} is already closed`);
    }
    
    const currentBalance = parseFloat(loanAccount.CURRENT_BALANCE || 0);
    const outstandingBalance = Math.abs(currentBalance);
    const outstandingPrincipal = Math.abs(parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0));
    const outstandingInterest = Math.abs(parseFloat(loanAccount.ACCRUED_INTEREST || 0));
    
    console.log(`💰 Loan ${loan_account_number} - Current Balance: ${currentBalance} (Negative means amount owed: ${outstandingBalance})`);
    console.log(`💰 Outstanding Principal: ${outstandingPrincipal}, Outstanding Interest: ${outstandingInterest}`);
    
    if (amount > outstandingBalance) {
      throw new Error(`Repayment amount (${amount}) exceeds outstanding balance (${outstandingBalance})`);
    }
    
    let principalAllocation = 0;
    let interestAllocation = 0;
    let penaltyAllocation = parseFloat(penalty_paid) || 0;
    let remainingAmount = amount - penaltyAllocation;
    
    if (principal_paid && interest_paid) {
      principalAllocation = parseFloat(principal_paid);
      interestAllocation = parseFloat(interest_paid);
      if (principalAllocation + interestAllocation + penaltyAllocation !== amount) {
        throw new Error(`Allocation sum (${principalAllocation + interestAllocation + penaltyAllocation}) does not equal repayment amount (${amount})`);
      }
    } else {
      interestAllocation = Math.min(remainingAmount, outstandingInterest);
      remainingAmount -= interestAllocation;
      principalAllocation = Math.min(remainingAmount, outstandingPrincipal);
      remainingAmount -= principalAllocation;
      if (remainingAmount > 0) {
        principalAllocation += remainingAmount;
      }
    }
    
    const transactionIds = generateTransactionId();
    const paymentDateObj = payment_date ? new Date(payment_date) : new Date();
    
    const repaymentTransaction = await Transaction.create({
      transaction_type: 'LOAN_REPAYMENT',
      TRANSACTION_TYPE: 'LOAN_REPAYMENT',
      AMOUNT: amount,
      amount: amount,
      ACCT_NM: loanAccount.ACCT_NM,
      account_name: loanAccount.ACCT_NM,
      CUST_ID: loanAccount.CUST_ID,
      customer_id: loanAccount.CUST_ID,
      BU_ID: loanAccount.BU_ID,
      bu_id: loanAccount.BU_ID,
      ACCT_ID: loanAccount.id,
      account_id: loanAccount.id,
      ACCT_NO: loan_account_number,
      description: `Loan repayment - Bulk upload`,
      TRAN_PARTICULARS: narration || `Bulk loan repayment - Reference: ${reference || 'N/A'}`,
      reference: reference || transactionIds.reference,
      REFERENCE: reference || transactionIds.reference,
      transaction_date: paymentDateObj,
      TRAN_DATE: paymentDateObj,
      VALUE_DATE: paymentDateObj,
      status: 'COMPLETED',
      STATUS: 'COMPLETED',
      REC_ST: 'A',
      createdBy,
      branch: loanAccount.BRANCH_ID,
      TRANSACTION_IDENTIFIER: transactionIds.transactionIdentifier,
      EVENT_ID: transactionIds.eventId,
      TRAN_JOURNAL_ID: transactionIds.journalId,
      metadata: {
        purpose: 'LOAN_REPAYMENT',
        repaymentType: 'BULK_UPLOAD',
        principalPaid: principalAllocation,
        interestPaid: interestAllocation,
        penaltyPaid: penaltyAllocation,
        paymentMethod: payment_method,
        batchId: results.batchId,
        uploadedBy: createdBy,
        uploadDate: new Date().toISOString()
      }
    }, { transaction: connection });
    
    await LoanRepayment.create({
      loan_account_id: loanAccount.id,
      loan_account_number: loan_account_number,
      customer_id: loanAccount.CUST_ID,
      customer_name: loanAccount.ACCT_NM,
      principal_amount: principalAllocation,
      interest_amount: interestAllocation,
      penalty_amount: penaltyAllocation,
      total_amount: amount,
      repayment_date: paymentDateObj,
      transaction_reference: reference || transactionIds.reference,
      status: 'COMPLETED'
    }, { transaction: connection });
    
    const newCurrentBalance = currentBalance + amount;
    const newOutstandingPrincipal = outstandingPrincipal - principalAllocation;
    const newOutstandingInterest = outstandingInterest - interestAllocation;
    const newBalanceAbsolute = newOutstandingPrincipal + newOutstandingInterest;
    const newLoanStatus = newBalanceAbsolute <= 0 ? 'CLOSED' : 'ACTIVE';
    
    console.log(`📊 New calculations:`);
    console.log(`   Old Balance: ${currentBalance}`);
    console.log(`   Repayment: +${amount}`);
    console.log(`   New Balance: ${newCurrentBalance}`);
    console.log(`   New Outstanding Principal: ${newOutstandingPrincipal}`);
    console.log(`   New Outstanding Interest: ${newOutstandingInterest}`);
    console.log(`   New Loan Status: ${newLoanStatus}`);
    
    await loanAccount.update({
      OUTSTANDING_PRINCIPAL: newOutstandingPrincipal,
      ACCRUED_INTEREST: newOutstandingInterest,
      CURRENT_BALANCE: newCurrentBalance,
      LEDGER_BALANCE: newCurrentBalance,
      AVAILABLE_BALANCE: newCurrentBalance,
      TOTAL_DUE: newBalanceAbsolute,
      LOAN_STATUS: newLoanStatus,
      lastRepaymentDate: paymentDateObj,
      lastRepaymentAmount: amount,
      updated_at: new Date()
    }, { transaction: connection });
    
    if (glAccounts.loanGLAccount && glAccounts.customerGLAccount) {
      try {
        await createGLTransactions(
          transactionIds.journalId,
          `${transactionIds.transactionIdentifier}-REPAYMENT`,
          glAccounts.customerGLAccount,
          glAccounts.loanGLAccount,
          amount,
          `Loan repayment for ${loan_account_number}`,
          'LOAN_REPAYMENT',
          createdBy,
          'NGN',
          { transaction: connection }
        );
        
        if (principalAllocation > 0) {
          await createGLTransactions(
            transactionIds.journalId,
            `${transactionIds.transactionIdentifier}-PRINCIPAL`,
            glAccounts.customerGLAccount,
            glAccounts.loanGLAccount,
            principalAllocation,
            `Principal repayment for ${loan_account_number}`,
            'LOAN_REPAYMENT_PRINCIPAL',
            createdBy,
            'NGN',
            { transaction: connection }
          );
        }
        
        if (interestAllocation > 0) {
          await createGLTransactions(
            transactionIds.journalId,
            `${transactionIds.transactionIdentifier}-INTEREST`,
            glAccounts.customerGLAccount,
            glAccounts.interestIncomeGL || glAccounts.loanGLAccount,
            interestAllocation,
            `Interest repayment for ${loan_account_number}`,
            'LOAN_REPAYMENT_INTEREST',
            createdBy,
            'NGN',
            { transaction: connection }
          );
        }
      } catch (glError) {
        console.warn(`⚠️ GL transaction failed for ${loan_account_number}:`, glError.message);
      }
    }
    
    await updateRepaymentSchedule(
      loanAccount.id,
      loan_account_number,
      loanAccount.CUST_ID,
      principalAllocation,
      interestAllocation,
      penaltyAllocation,
      paymentDateObj,
      createdBy,
      connection
    );
    
    console.log(`✅ Repayment processed for ${loan_account_number}: ₦${amount.toLocaleString()} (Principal: ₦${principalAllocation.toLocaleString()}, Interest: ₦${interestAllocation.toLocaleString()})`);
    console.log(`   New Balance: ${newCurrentBalance.toLocaleString()}`);
    
    return {
      success: true,
      loanAccountNumber: loan_account_number,
      amount,
      principalPaid: principalAllocation,
      interestPaid: interestAllocation,
      penaltyPaid: penaltyAllocation,
      remainingBalance: Math.abs(newCurrentBalance),
      loanStatus: newLoanStatus,
      transaction: {
        id: repaymentTransaction.id,
        transactionId: transactionIds.transactionIdentifier,
        reference: reference || transactionIds.reference,
        amount,
        type: 'LOAN_REPAYMENT',
        date: paymentDateObj,
        status: 'COMPLETED'
      }
    };
    
  } catch (error) {
    console.error(`❌ Error processing repayment:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ========== UPDATE REPAYMENT SCHEDULE ==========
async function updateRepaymentSchedule(loanAccountId, accountNumber, customerId, principalPaid, interestPaid, penaltyPaid, paymentDate, createdBy, connection) {
  try {
    const scheduleResult = await sequelize.query(
      `SELECT installments_json FROM repayment_schedules 
       WHERE loan_account_id = ? AND account_number = ? AND customer_id = ?`,
      {
        replacements: [loanAccountId, accountNumber, customerId],
        type: sequelize.QueryTypes.SELECT,
        transaction: connection
      }
    );
    
    if (scheduleResult && scheduleResult.length > 0) {
      let installments = scheduleResult[0].installments_json;
      if (typeof installments === 'string') {
        installments = JSON.parse(installments);
      }
      
      let updated = false;
      for (let installment of installments) {
        if (installment.status === 'PENDING') {
          installment.status = 'PAID';
          installment.paidDate = paymentDate;
          installment.amountPaid = (installment.principalPaid || 0) + (installment.interestPaid || 0);
          installment.principalPaid = (installment.principalPaid || 0) + principalPaid;
          installment.interestPaid = (installment.interestPaid || 0) + interestPaid;
          installment.penaltyPaid = (installment.penaltyPaid || 0) + penaltyPaid;
          updated = true;
          break;
        }
      }
      
      if (updated) {
        await sequelize.query(
          `UPDATE repayment_schedules 
           SET installments_json = ?, updated_at = NOW(), updated_by = ?
           WHERE loan_account_id = ? AND account_number = ? AND customer_id = ?`,
          {
            replacements: [JSON.stringify(installments), createdBy, loanAccountId, accountNumber, customerId],
            type: sequelize.QueryTypes.UPDATE,
            transaction: connection
          }
        );
      }
    }
  } catch (error) {
    console.error(`⚠️ Failed to update repayment schedule:`, error.message);
  }
}

// ========== DOWNLOAD TEMPLATE ==========
export const downloadTemplate = async (req, res) => {
  try {
    // Get frequency from query, default to MONTHLY
    const frequency = req.query.frequency?.toUpperCase() || 'MONTHLY';
    const allowedFrequencies = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY'];
    const paymentFrequency = allowedFrequencies.includes(frequency) ? frequency : 'MONTHLY';

    const template = [{
      group_loan_id: 'GRP001',
      customer_id: '0000000001',
      customer_name: 'John Doe',
      product_code: 'LOAN001',
      disbursed_amount: 100000,
      installments_paid: 0,
      paid_amount: 0,
      payment_dates: '',
      branch_code: '001',
      interest_rate: 6.20,
      tenure: 12,
      payment_frequency: paymentFrequency,
      group_name: 'Farmers Group A',
      group_code: 'FARM001',
      disbursement_date: '2024-01-15',
      relationship_officer_id: 'PCO01',
      relationship_officer_name: 'John Officer'
    }];

    const ws = xlsx.utils.json_to_sheet(template);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Template');

    const instructions = [
      { Field: 'group_loan_id', Description: 'Unique identifier for the group loan', Required: 'Yes', Example: 'GRP001' },
      { Field: 'customer_id', Description: 'Customer identifier (10 digits)', Required: 'Yes', Example: '0000000001' },
      { Field: 'customer_name', Description: 'Customer full name', Required: 'Yes', Example: 'John Doe' },
      { Field: 'product_code', Description: 'Loan product code', Required: 'Yes', Example: 'LOAN001' },
      { Field: 'disbursed_amount', Description: 'Total loan amount disbursed', Required: 'Yes', Example: '100000' },
      { Field: 'installments_paid', Description: 'Number of installments already paid (for backdating)', Required: 'No', Example: '0' },
      { Field: 'paid_amount', Description: 'Total amount already paid (for backdating)', Required: 'No', Example: '0' },
      { Field: 'payment_dates', Description: 'Comma-separated payment dates (for backdating)', Required: 'No', Example: '2024-01-15,2024-02-15' },
      { Field: 'branch_code', Description: 'Branch code', Required: 'Yes', Example: '001' },
      { Field: 'interest_rate', Description: 'Interest rate % (optional, uses product default)', Required: 'No', Example: '6.20' },
      { Field: 'tenure', Description: 'Loan tenure in months', Required: 'Yes', Example: '12' },
      { Field: 'payment_frequency', Description: 'Payment frequency: DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY', Required: 'Yes', Example: paymentFrequency },
      { Field: 'group_name', Description: 'Group name', Required: 'No', Example: 'Farmers Group A' },
      { Field: 'group_code', Description: 'Group code', Required: 'No', Example: 'FARM001' },
      { Field: 'disbursement_date', Description: 'Disbursement date (YYYY-MM-DD)', Required: 'No', Example: '2024-01-15' },
      { Field: 'relationship_officer_id', Description: 'Officer ID', Required: 'No', Example: 'PCO01' },
      { Field: 'relationship_officer_name', Description: 'Officer name', Required: 'No', Example: 'John Officer' }
    ];

    const wsInstructions = xlsx.utils.json_to_sheet(instructions);
    xlsx.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

    const notes = [
      { Note: 'IMPORTANT NOTES FOR 5000+ CUSTOMER UPLOADS:' },
      { Note: '' },
      { Note: 'FILE SIZE:' },
      { Note: '- Maximum file size: 500MB' },
      { Note: '- Recommended: Split into batches of 2000-3000 records per file' },
      { Note: '' },
      { Note: 'PROCESSING:' },
      { Note: '- Uploads are processed in batches of 100 groups at a time' },
      { Note: '- Processing time: ~5-10 minutes for 5000 customers' },
      { Note: '- You will receive a batch ID to track progress' },
      { Note: '' },
      { Note: 'BACKDATED REPAYMENTS:' },
      { Note: '- Set installments_paid and paid_amount for backdated payments' },
      { Note: '- Provide payment_dates as comma-separated dates in YYYY-MM-DD format' },
      { Note: '- Number of payment_dates must match installments_paid' }
    ];

    const wsNotes = xlsx.utils.json_to_sheet(notes);
    xlsx.utils.book_append_sheet(wb, wsNotes, 'Important Notes');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=group_loan_template_${paymentFrequency.toLowerCase()}.xlsx`);

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);

  } catch (error) {
    console.error('❌ Error generating template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate template',
      error: error.message
    });
  }
}
// ========== GET LOAN TRANSACTION HISTORY ==========
// ========== GET LOAN TRANSACTION HISTORY - FIXED FOR NEGATIVE BALANCES ==========
export const getLoanTransactionHistory = asyncHandler(async (req, res) => {
  const { accountNumber } = req.params;
  const { limit = 50, offset = 0, startDate, endDate } = req.query;
  
  try {
    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Account number is required'
      });
    }
    
    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: accountNumber }
    });
    
    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: `Loan account ${accountNumber} not found`
      });
    }
    
    // Get current balance (negative means amount owed)
    const currentBalance = parseFloat(loanAccount.CURRENT_BALANCE || 0);
    const amountOwed = Math.abs(currentBalance);
    const outstandingPrincipal = Math.abs(parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0));
    const outstandingInterest = Math.abs(parseFloat(loanAccount.ACCRUED_INTEREST || 0));
    
    let dateFilter = '';
    const replacements = [accountNumber];
    
    if (startDate) {
      dateFilter += ` AND transaction_date >= ?`;
      replacements.push(startDate);
    }
    if (endDate) {
      dateFilter += ` AND transaction_date <= ?`;
      replacements.push(endDate);
    }
    
    const transactions = await sequelize.query(
      `SELECT 
        id,
        transaction_type,
        TRANSACTION_TYPE,
        amount,
        AMOUNT,
        description,
        reference,
        transaction_date,
        status,
        createdBy,
        created_at,
        metadata
       FROM transactions 
       WHERE ACCT_NO = ? 
         AND transaction_type IN ('LOAN_DISBURSEMENT', 'LOAN_REPAYMENT')
         ${dateFilter}
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT ? OFFSET ?`,
      {
        replacements: [...replacements, parseInt(limit), parseInt(offset)],
        type: sequelize.QueryTypes.SELECT,
        timeout: 10000
      }
    );
    
    const repaymentHistory = await LoanRepaymentHistory.findAll({
      where: { loan_account_id: loanAccount.id },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_repayments'],
        [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_repayment_amount'],
        [sequelize.fn('SUM', sequelize.col('principal_amount')), 'total_principal_paid'],
        [sequelize.fn('SUM', sequelize.col('interest_amount')), 'total_interest_paid'],
        [sequelize.fn('SUM', sequelize.col('penalty_amount')), 'total_penalty_paid'],
        [sequelize.fn('MAX', sequelize.col('repayment_date')), 'last_repayment_date']
      ],
      raw: true
    });
    
    const countResult = await sequelize.query(
      `SELECT COUNT(*) as total 
       FROM transactions 
       WHERE ACCT_NO = ? 
         AND transaction_type IN ('LOAN_DISBURSEMENT', 'LOAN_REPAYMENT')
         ${dateFilter}`,
      {
        replacements: [accountNumber],
        type: sequelize.QueryTypes.SELECT,
        timeout: 5000
      }
    );
    
    const transformedTransactions = transactions.map(tx => {
      const amount = parseFloat(tx.amount || tx.AMOUNT);
      const isDisbursement = tx.transaction_type === 'LOAN_DISBURSEMENT' || tx.TRANSACTION_TYPE === 'LOAN_DISBURSEMENT';
      
      return {
        id: tx.id,
        type: tx.transaction_type || tx.TRANSACTION_TYPE,
        amount: isDisbursement ? -Math.abs(amount) : Math.abs(amount), // Disbursement negative, Repayment positive
        absoluteAmount: Math.abs(amount),
        description: tx.description,
        reference: tx.reference,
        date: tx.transaction_date || tx.created_at,
        status: tx.status,
        createdBy: tx.createdBy,
        metadata: typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : tx.metadata
      };
    });
    
    res.json({
      success: true,
      data: {
        loanAccount: {
          accountNumber: loanAccount.ACCT_NO,
          accountName: loanAccount.ACCT_NM,
          customerId: loanAccount.CUST_ID,
          status: loanAccount.LOAN_STATUS,
          currentBalance: currentBalance,
          amountOwed: amountOwed,
          outstandingPrincipal: outstandingPrincipal,
          outstandingInterest: outstandingInterest,
          totalDue: amountOwed
        },
        summary: {
          totalRepayments: parseInt(repaymentHistory[0]?.total_repayments || 0),
          totalRepaymentAmount: parseFloat(repaymentHistory[0]?.total_repayment_amount || 0),
          totalPrincipalPaid: parseFloat(repaymentHistory[0]?.total_principal_paid || 0),
          totalInterestPaid: parseFloat(repaymentHistory[0]?.total_interest_paid || 0),
          totalPenaltyPaid: parseFloat(repaymentHistory[0]?.total_penalty_paid || 0),
          lastRepaymentDate: repaymentHistory[0]?.last_repayment_date
        },
        transactions: transformedTransactions,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: parseInt(countResult[0]?.total || 0),
          pages: Math.ceil((parseInt(countResult[0]?.total || 0)) / parseInt(limit))
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching loan transaction history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction history',
      error: error.message
    });
  }
});

// ========== GET LOAN REPAYMENT DETAILS ==========
export const getLoanRepaymentDetails = asyncHandler(async (req, res) => {
  const { accountNumber } = req.params;
  const { limit = 50, offset = 0, startDate, endDate } = req.query;
  
  try {
    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Account number is required'
      });
    }
    
    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: accountNumber }
    });
    
    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: `Loan account ${accountNumber} not found`
      });
    }
    
    const whereClause = {
      loan_account_id: loanAccount.id,
      account_number: accountNumber
    };
    
    if (startDate || endDate) {
      whereClause.repayment_date = {};
      if (startDate) whereClause.repayment_date[Op.gte] = new Date(startDate);
      if (endDate) whereClause.repayment_date[Op.lte] = new Date(endDate);
    }
    
    const repayments = await LoanRepaymentHistory.findAll({
      where: whereClause,
      order: [['repayment_date', 'DESC'], ['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    const totalCount = await LoanRepaymentHistory.count({
      where: whereClause
    });
    
    const summary = await LoanRepaymentHistory.findAll({
      where: whereClause,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_repayments'],
        [sequelize.fn('SUM', sequelize.col('principal_amount')), 'total_principal_paid'],
        [sequelize.fn('SUM', sequelize.col('interest_amount')), 'total_interest_paid'],
        [sequelize.fn('SUM', sequelize.col('penalty_amount')), 'total_penalty_paid'],
        [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount_paid'],
        [sequelize.fn('MAX', sequelize.col('repayment_date')), 'last_repayment_date']
      ],
      raw: true
    });
    
    res.json({
      success: true,
      data: {
        loanAccount: {
          id: loanAccount.id,
          accountNumber: loanAccount.ACCT_NO,
          accountName: loanAccount.ACCT_NM,
          customerId: loanAccount.CUST_ID,
          outstandingPrincipal: loanAccount.OUTSTANDING_PRINCIPAL,
          outstandingInterest: loanAccount.ACCRUED_INTEREST,
          loanStatus: loanAccount.LOAN_STATUS
        },
        summary: {
          totalRepayments: parseInt(summary[0]?.total_repayments || 0),
          totalPrincipalPaid: parseFloat(summary[0]?.total_principal_paid || 0),
          totalInterestPaid: parseFloat(summary[0]?.total_interest_paid || 0),
          totalPenaltyPaid: parseFloat(summary[0]?.total_penalty_paid || 0),
          totalAmountPaid: parseFloat(summary[0]?.total_amount_paid || 0),
          lastRepaymentDate: summary[0]?.last_repayment_date
        },
        repayments: repayments.map(r => ({
          id: r.id,
          repaymentDate: r.repayment_date,
          principalAmount: parseFloat(r.principal_amount),
          interestAmount: parseFloat(r.interest_amount),
          penaltyAmount: parseFloat(r.penalty_amount),
          totalAmount: parseFloat(r.total_amount),
          reference: r.reference,
          createdBy: r.created_by,
          createdAt: r.created_at
        })),
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: totalCount,
          pages: Math.ceil(totalCount / parseInt(limit))
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching loan repayment details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch repayment details',
      error: error.message
    });
  }
});

// ========== GET BULK REPAYMENT HISTORY ==========
// ========== GET BULK REPAYMENT HISTORY WITH DETAILS ==========
export const getBulkRepaymentHistory = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, includeTransactions = 'true' } = req.query;
  
  try {
    // Get bulk repayment audit records
    const history = await sequelize.query(
      `SELECT 
        id,
        event_id,
        user_id,
        event_type,
        action,
        new_value,
        status,
        description,
        timestamp,
        ip_address
       FROM audit_trails 
       WHERE event_type = 'BULK_UPLOAD' 
         AND action IN ('BULK_LOAN_REPAYMENT', 'BULK_GROUP_LOAN_DISBURSEMENT')
       ORDER BY timestamp DESC 
       LIMIT ? OFFSET ?`,
      {
        replacements: [parseInt(limit), parseInt(offset)],
        type: sequelize.QueryTypes.SELECT,
        timeout: 10000
      }
    );
    
    // Transform and enrich the data
    const transformedHistory = [];
    
    for (const item of history) {
      let parsedData = {};
      if (item.new_value) {
        try {
          parsedData = typeof item.new_value === 'string' ? JSON.parse(item.new_value) : item.new_value;
        } catch (e) {
          console.error('Error parsing new_value:', e);
        }
      }
      
      // Get user name
      const userName = parsedData.user_name || 
                       parsedData.userName || 
                       parsedData.uploadedBy || 
                       parsedData.created_by ||
                       (item.user_id ? `User_${item.user_id}` : 'SYSTEM');
      
      // Get detailed transactions if this is a repayment batch
      let detailedTransactions = [];
      let repaymentDetails = null;
      
      if (includeTransactions === 'true' && item.action === 'BULK_LOAN_REPAYMENT' && parsedData.batchId) {
        // Get all repayment transactions for this batch
        repaymentDetails = await sequelize.query(
          `SELECT 
            id,
            transaction_type,
            amount,
            ACCT_NO as account_number,
            ACCT_NM as account_name,
            description,
            reference,
            transaction_date,
            status,
            createdBy,
            metadata
           FROM transactions 
           WHERE JSON_EXTRACT(metadata, '$.batchId') = ?
             AND transaction_type = 'LOAN_REPAYMENT'
           ORDER BY transaction_date DESC`,
          {
            replacements: [parsedData.batchId],
            type: sequelize.QueryTypes.SELECT,
            timeout: 10000
          }
        );
        
        detailedTransactions = repaymentDetails.map(tx => ({
          id: tx.id,
          transactionId: tx.id,
          accountNumber: tx.account_number,
          accountName: tx.account_name,
          amount: parseFloat(tx.amount),
          type: tx.transaction_type,
          description: tx.description,
          reference: tx.reference,
          date: tx.transaction_date,
          status: tx.status,
          createdBy: tx.createdBy,
          metadata: typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : tx.metadata
        }));
      }
      
      // Also get loan repayment history entries for this batch
      let loanRepaymentHistory = [];
      if (includeTransactions === 'true' && parsedData.batchId) {
        loanRepaymentHistory = await sequelize.query(
          `SELECT 
            id,
            account_number,
            customer_id,
            repayment_date,
            principal_amount,
            interest_amount,
            penalty_amount,
            total_amount,
            reference,
            created_by
           FROM loan_repayment_history 
           WHERE reference LIKE ?
           ORDER BY repayment_date DESC
           LIMIT 100`,
          {
            replacements: [`%${parsedData.batchId}%`],
            type: sequelize.QueryTypes.SELECT,
            timeout: 10000
          }
        );
      }
      
      transformedHistory.push({
        id: item.id,
        batchId: parsedData.batchId,
        fileName: parsedData.fileName,
        type: parsedData.type || (item.action === 'BULK_LOAN_REPAYMENT' ? 'REPAYMENT' : 'DISBURSEMENT'),
        totalRecords: parsedData.totalRecords || 0,
        successfulCount: parsedData.successful || 0,
        failedCount: parsedData.failed || 0,
        status: item.status,
        description: item.description,
        timestamp: item.timestamp,
        user: userName,
        ipAddress: item.ip_address,
        summary: parsedData.summary || {
          totalAmount: 0,
          totalPrincipalPaid: 0,
          totalInterestPaid: 0,
          totalPenaltyPaid: 0
        },
        transactions: detailedTransactions,
        loanRepaymentHistory: loanRepaymentHistory,
        details: {
          totalRepaymentAmount: parsedData.summary?.totalRepaymentAmount || 0,
          totalPrincipalPaid: parsedData.summary?.totalPrincipalPaid || 0,
          totalInterestPaid: parsedData.summary?.totalInterestPaid || 0,
          totalPenaltyPaid: parsedData.summary?.totalPenaltyPaid || 0,
          totalLoansUpdated: parsedData.summary?.totalLoansUpdated || 0,
          failedRepayments: parsedData.failed || 0
        }
      });
    }
    
    // Get total count
    const countResult = await sequelize.query(
      `SELECT COUNT(*) as total 
       FROM audit_trails 
       WHERE event_type = 'BULK_UPLOAD' 
         AND action IN ('BULK_LOAN_REPAYMENT', 'BULK_GROUP_LOAN_DISBURSEMENT')`,
      {
        type: sequelize.QueryTypes.SELECT,
        timeout: 5000
      }
    );
    
    const total = parseInt(countResult[0]?.total || 0);
    
    res.json({
      success: true,
      data: transformedHistory,
      count: transformedHistory.length,
      total: total,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: total,
        pages: Math.ceil(total / parseInt(limit))
      },
      filters: {
        includeTransactions: includeTransactions === 'true'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching bulk repayment history:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bulk repayment history',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========== STREAMING UPLOAD ==========
export const streamingUpload = asyncHandler(async (req, res) => {
  try {
    const batchId = uuidv4();
    const uploadDir = path.join(BULK_UPLOAD_DIR, batchId);
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const chunks = [];
    let totalSize = 0;
    
    req.on('data', (chunk) => {
      chunks.push(chunk);
      totalSize += chunk.length;
    });
    
    req.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      const filePath = path.join(uploadDir, 'upload.xlsx');
      fs.writeFileSync(filePath, buffer);
      
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);
      
      res.json({
        success: true,
        batchId,
        totalRecords: data.length,
        message: `File received. Processing ${data.length} records.`
      });
    });
  } catch (error) {
    console.error('Streaming upload failed:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Add this function to your bulkGroupLoanController.js

// ========== FIELD COLLECTION SHEET ==========
export const generateFieldCollectionSheet = asyncHandler(async (req, res) => {
  const { groupId, groupName, collectionDate } = req.query;
  
  if (!sequelize) {
    return res.status(503).json({
      success: false,
      message: 'Database connection not available'
    });
  }
  
  try {
    // Build query to get all active loans with their group information
    let whereClause = `
      WHERE la.LOAN_STATUS IN ('ACTIVE', 'PARTIALLY_REPAID')
        AND la.IS_DISBURSED = 1
        AND gl.id IS NOT NULL
    `;
    
    const replacements = [];
    
    if (groupId) {
      whereClause += ` AND gl.id = ?`;
      replacements.push(groupId);
    }
    
    if (groupName) {
      whereClause += ` AND gl.groupName LIKE ?`;
      replacements.push(`%${groupName}%`);
    }
    
    // Get all loans with group and customer information
    const loans = await sequelize.query(`
      SELECT 
        gl.id as group_id,
        gl.groupName as group_name,
        gl.groupCode as group_code,
        gl.paymentFrequency as payment_frequency,
        gl.disbursement_date as group_disbursement_date,
        gl.primaryRelationshipManager as relationship_officer,
        la.id as loan_id,
        la.ACCT_NO as loan_account_number,
        la.ACCT_NM as customer_name,
        la.CUST_ID as customer_id,
        la.AMOUNT as disbursed_amount,
        la.OUTSTANDING_PRINCIPAL as outstanding_principal,
        la.ACCRUED_INTEREST as outstanding_interest,
        la.TOTAL_DUE as total_due,
        la.EMI_AMOUNT as installment_amount,
        la.PAYMENT_FREQUENCY as loan_payment_frequency,
        la.START_DATE as loan_start_date,
        la.MATURITY_DT as maturity_date,
        la.lastRepaymentDate as last_payment_date,
        la.lastRepaymentAmount as last_payment_amount,
        CASE 
          WHEN la.TOTAL_DUE <= 0 THEN 'PAID'
          WHEN la.MATURITY_DT < CURDATE() THEN 'OVERDUE'
          WHEN la.TOTAL_DUE > 0 AND DATEDIFF(CURDATE(), COALESCE(la.lastRepaymentDate, la.START_DATE)) > 
            CASE la.PAYMENT_FREQUENCY
              WHEN 'DAILY' THEN 30
              WHEN 'WEEKLY' THEN 14
              WHEN 'BIWEEKLY' THEN 21
              WHEN 'MONTHLY' THEN 45
              WHEN 'QUARTERLY' THEN 120
              ELSE 30
            END THEN 'OVERDUE'
          ELSE 'CURRENT'
        END as payment_status,
        DATEDIFF(CURDATE(), COALESCE(la.lastRepaymentDate, la.START_DATE)) as days_since_last_payment,
        la.METADATA
      FROM group_loans gl
      INNER JOIN loan_accounts la ON la.groupLoanId = gl.id
      ${whereClause}
      ORDER BY gl.id, la.CUST_ID
    `, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT,
      timeout: 30000
    });
    
    if (loans.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active loans found for the specified criteria'
      });
    }
    
    // Group loans by group
    const groups = {};
    loans.forEach(loan => {
      if (!groups[loan.group_id]) {
        groups[loan.group_id] = {
          group_id: loan.group_id,
          group_name: loan.group_name,
          group_code: loan.group_code,
          payment_frequency: loan.payment_frequency,
          relationship_officer: loan.relationship_officer,
          group_disbursement_date: loan.group_disbursement_date,
          members: []
        };
      }
      
      // Calculate expected amount based on payment frequency
      let expectedAmount = 0;
      let overdueDays = loan.days_since_last_payment || 0;
      let isOverdue = loan.payment_status === 'OVERDUE';
      
      const installmentAmount = parseFloat(loan.installment_amount || (loan.disbursed_amount / 12));
      
      if (isOverdue) {
        // Calculate number of missed installments
        let missedInstallments = 1;
        switch(loan.loan_payment_frequency) {
          case 'WEEKLY':
            missedInstallments = Math.floor(overdueDays / 7);
            break;
          case 'BIWEEKLY':
            missedInstallments = Math.floor(overdueDays / 14);
            break;
          case 'MONTHLY':
            missedInstallments = Math.floor(overdueDays / 30);
            break;
          case 'QUARTERLY':
            missedInstallments = Math.floor(overdueDays / 90);
            break;
          default:
            missedInstallments = Math.floor(overdueDays / 30);
        }
        expectedAmount = installmentAmount * (missedInstallments + 1);
      } else {
        expectedAmount = installmentAmount;
      }
      
      groups[loan.group_id].members.push({
        loan_id: loan.loan_id,
        loan_account_number: loan.loan_account_number,
        customer_id: loan.customer_id,
        customer_name: loan.customer_name,
        disbursed_amount: parseFloat(loan.disbursed_amount),
        outstanding_principal: parseFloat(loan.outstanding_principal || 0),
        outstanding_interest: parseFloat(loan.outstanding_interest || 0),
        total_due: parseFloat(loan.total_due || 0),
        installment_amount: installmentAmount,
        payment_frequency: loan.loan_payment_frequency,
        start_date: loan.loan_start_date,
        maturity_date: loan.maturity_date,
        last_payment_date: loan.last_payment_date,
        last_payment_amount: parseFloat(loan.last_payment_amount || 0),
        payment_status: loan.payment_status,
        days_since_last_payment: overdueDays,
        expected_amount: expectedAmount,
        is_overdue: isOverdue
      });
    });
    
    // Generate Excel file
    const xlsxLib = await import('xlsx');
    const xlsx = xlsxLib.default;
    const workbook = xlsx.utils.book_new();
    
    // Create separate sheets for each group
    for (const [groupId, group] of Object.entries(groups)) {
      // Prepare data for the sheet
      const sheetData = [
        ['FIELD COLLECTION SHEET'],
        [''],
        ['GROUP INFORMATION'],
        ['Group ID:', group.group_id],
        ['Group Name:', group.group_name],
        ['Group Code:', group.group_code],
        ['Payment Frequency:', group.payment_frequency],
        ['Relationship Officer:', group.relationship_officer],
        ['Disbursement Date:', group.group_disbursement_date ? new Date(group.group_disbursement_date).toLocaleDateString() : 'N/A'],
        ['Collection Date:', collectionDate ? new Date(collectionDate).toLocaleDateString() : new Date().toLocaleDateString()],
        [''],
        ['MEMBER DETAILS'],
        [
          'S/N',
          'Customer ID',
          'Customer Name',
          'Loan Account',
          'Disbursed Amount (₦)',
          'Installment Amount (₦)',
          'Expected Amount (₦)',
          'Amount Collected (₦)',
          'Savings Collected (₦)',
          'Union Purse (₦)',
          'Outstanding Principal (₦)',
          'Outstanding Interest (₦)',
          'Total Due (₦)',
          'Payment Status',
          'Overdue Days',
          'Last Payment Date',
          'Last Payment Amount (₦)',
          'Maturity Date',
          'Notes'
        ]
      ];
      
      // Add member rows
      group.members.forEach((member, index) => {
        sheetData.push([
          index + 1,
          member.customer_id,
          member.customer_name,
          member.loan_account_number,
          member.disbursed_amount.toLocaleString(),
          member.installment_amount.toLocaleString(),
          member.expected_amount.toLocaleString(),
          '', // Amount Collected (to be filled manually)
          '', // Savings Collected (to be filled manually)
          '', // Union Purse (to be filled manually)
          member.outstanding_principal.toLocaleString(),
          member.outstanding_interest.toLocaleString(),
          member.total_due.toLocaleString(),
          member.payment_status,
          member.days_since_last_payment,
          member.last_payment_date ? new Date(member.last_payment_date).toLocaleDateString() : 'Never',
          member.last_payment_amount.toLocaleString(),
          member.maturity_date ? new Date(member.maturity_date).toLocaleDateString() : 'N/A',
          '' // Notes
        ]);
      });
      
      // Add summary section
      const totalDisbursed = group.members.reduce((sum, m) => sum + m.disbursed_amount, 0);
      const totalExpected = group.members.reduce((sum, m) => sum + m.expected_amount, 0);
      const totalOverdue = group.members.reduce((sum, m) => sum + (m.is_overdue ? m.expected_amount : 0), 0);
      const overdueCount = group.members.filter(m => m.is_overdue).length;
      
      sheetData.push(
        [''],
        ['SUMMARY'],
        ['Total Members:', group.members.length],
        ['Total Disbursed Amount:', totalDisbursed.toLocaleString()],
        ['Total Expected Collection:', totalExpected.toLocaleString()],
        ['Total Overdue Amount:', totalOverdue.toLocaleString()],
        ['Number of Overdue Members:', overdueCount],
        [''],
        ['COLLECTION SUMMARY'],
        ['Total Collected:', ''],
        ['Total Savings Collected:', ''],
        ['Total Union Purse:', ''],
        ['Balance:', ''],
        [''],
        ['OFFICER SIGNATURE:', '_________________________'],
        ['DATE:', new Date().toLocaleDateString()],
        [''],
        ['NOTES:'],
        ['1. Fill in the "Amount Collected" column for each member'],
        ['2. Collect savings separately in the "Savings Collected" column'],
        ['3. Union purse contributions go in the "Union Purse" column'],
        ['4. Overdue members are highlighted in yellow']
      );
      
      // Create worksheet
      const ws = xlsx.utils.aoa_to_sheet(sheetData);
      
      // Apply styling (column widths)
      const colWidths = [
        { wch: 5 },   // S/N
        { wch: 15 },  // Customer ID
        { wch: 25 },  // Customer Name
        { wch: 18 },  // Loan Account
        { wch: 15 },  // Disbursed Amount
        { wch: 15 },  // Installment Amount
        { wch: 15 },  // Expected Amount
        { wch: 15 },  // Amount Collected
        { wch: 15 },  // Savings Collected
        { wch: 15 },  // Union Purse
        { wch: 18 },  // Outstanding Principal
        { wch: 18 },  // Outstanding Interest
        { wch: 15 },  // Total Due
        { wch: 15 },  // Payment Status
        { wch: 12 },  // Overdue Days
        { wch: 15 },  // Last Payment Date
        { wch: 18 },  // Last Payment Amount
        { wch: 15 },  // Maturity Date
        { wch: 20 }   // Notes
      ];
      ws['!cols'] = colWidths;
      
      // Add sheet to workbook
      const sheetName = group.group_name.length > 31 ? group.group_name.substring(0, 28) + '...' : group.group_name;
      xlsx.utils.book_append_sheet(workbook, ws, sheetName);
    }
    
    // Create a summary sheet
    const summaryData = [
      ['FIELD COLLECTION SUMMARY REPORT'],
      [''],
      ['Generated on:', new Date().toLocaleString()],
      [''],
      ['GROUP SUMMARY'],
      ['Group ID', 'Group Name', 'Members', 'Total Disbursed', 'Total Expected', 'Overdue Members', 'Overdue Amount']
    ];
    
    for (const [groupId, group] of Object.entries(groups)) {
      const totalDisbursed = group.members.reduce((sum, m) => sum + m.disbursed_amount, 0);
      const totalExpected = group.members.reduce((sum, m) => sum + m.expected_amount, 0);
      const totalOverdue = group.members.reduce((sum, m) => sum + (m.is_overdue ? m.expected_amount : 0), 0);
      const overdueCount = group.members.filter(m => m.is_overdue).length;
      
      summaryData.push([
        group.group_id,
        group.group_name,
        group.members.length,
        totalDisbursed.toLocaleString(),
        totalExpected.toLocaleString(),
        overdueCount,
        totalOverdue.toLocaleString()
      ]);
    }
    
    summaryData.push(
      [''],
      ['OVERALL SUMMARY'],
      ['Total Groups:', Object.keys(groups).length],
      ['Total Members:', loans.length],
      ['Total Disbursed:', loans.reduce((sum, l) => sum + parseFloat(l.disbursed_amount), 0).toLocaleString()],
      ['Total Expected Collection:', Object.values(groups).reduce((sum, g) => sum + g.members.reduce((s, m) => s + m.expected_amount, 0), 0).toLocaleString()],
      ['Total Overdue Members:', loans.filter(l => l.payment_status === 'OVERDUE').length],
      ['Total Overdue Amount:', Object.values(groups).reduce((sum, g) => sum + g.members.filter(m => m.is_overdue).reduce((s, m) => s + m.expected_amount, 0), 0).toLocaleString()]
    );
    
    const summaryWs = xlsx.utils.aoa_to_sheet(summaryData);
    summaryWs['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 18 }];
    xlsx.utils.book_append_sheet(workbook, summaryWs, 'Summary');
    
    // Set response headers
    const fileName = `field_collection_sheet_${collectionDate || new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);
    
  } catch (error) {
    console.error('❌ Error generating field collection sheet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate field collection sheet',
      error: error.message
    });
  }
});

// ========== GET FIELD COLLECTION SUMMARY (JSON) ==========
export const getFieldCollectionSummary = asyncHandler(async (req, res) => {
  const { groupId, groupName } = req.query;
  
  if (!sequelize) {
    return res.status(503).json({
      success: false,
      message: 'Database connection not available'
    });
  }
  
  try {
    let whereClause = `
      WHERE la.LOAN_STATUS IN ('ACTIVE', 'PARTIALLY_REPAID')
        AND la.IS_DISBURSED = 1
        AND gl.id IS NOT NULL
    `;
    
    const replacements = [];
    
    if (groupId) {
      whereClause += ` AND gl.id = ?`;
      replacements.push(groupId);
    }
    
    if (groupName) {
      whereClause += ` AND gl.groupName LIKE ?`;
      replacements.push(`%${groupName}%`);
    }
    
    const loans = await sequelize.query(`
      SELECT 
        gl.id as group_id,
        gl.groupName as group_name,
        gl.groupCode as group_code,
        gl.paymentFrequency as payment_frequency,
        gl.primaryRelationshipManager as relationship_officer,
        la.id as loan_id,
        la.ACCT_NO as loan_account_number,
        la.ACCT_NM as customer_name,
        la.CUST_ID as customer_id,
        la.AMOUNT as disbursed_amount,
        la.OUTSTANDING_PRINCIPAL as outstanding_principal,
        la.ACCRUED_INTEREST as outstanding_interest,
        la.TOTAL_DUE as total_due,
        la.EMI_AMOUNT as installment_amount,
        la.PAYMENT_FREQUENCY as loan_payment_frequency,
        la.START_DATE as loan_start_date,
        la.MATURITY_DT as maturity_date,
        la.lastRepaymentDate as last_payment_date,
        CASE 
          WHEN la.TOTAL_DUE <= 0 THEN 'PAID'
          WHEN la.MATURITY_DT < CURDATE() THEN 'OVERDUE'
          WHEN la.TOTAL_DUE > 0 AND DATEDIFF(CURDATE(), COALESCE(la.lastRepaymentDate, la.START_DATE)) > 
            CASE la.PAYMENT_FREQUENCY
              WHEN 'DAILY' THEN 30
              WHEN 'WEEKLY' THEN 14
              WHEN 'BIWEEKLY' THEN 21
              WHEN 'MONTHLY' THEN 45
              WHEN 'QUARTERLY' THEN 120
              ELSE 30
            END THEN 'OVERDUE'
          ELSE 'CURRENT'
        END as payment_status
      FROM group_loans gl
      INNER JOIN loan_accounts la ON la.groupLoanId = gl.id
      ${whereClause}
      ORDER BY gl.id, la.CUST_ID
    `, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT,
      timeout: 30000
    });
    
    // Group by group
    const groups = {};
    loans.forEach(loan => {
      if (!groups[loan.group_id]) {
        groups[loan.group_id] = {
          group_id: loan.group_id,
          group_name: loan.group_name,
          group_code: loan.group_code,
          payment_frequency: loan.payment_frequency,
          relationship_officer: loan.relationship_officer,
          members: []
        };
      }
      
      const installmentAmount = parseFloat(loan.installment_amount || (loan.disbursed_amount / 12));
      const isOverdue = loan.payment_status === 'OVERDUE';
      
      groups[loan.group_id].members.push({
        loan_id: loan.loan_id,
        loan_account_number: loan.loan_account_number,
        customer_id: loan.customer_id,
        customer_name: loan.customer_name,
        disbursed_amount: parseFloat(loan.disbursed_amount),
        outstanding_principal: parseFloat(loan.outstanding_principal || 0),
        outstanding_interest: parseFloat(loan.outstanding_interest || 0),
        total_due: parseFloat(loan.total_due || 0),
        installment_amount: installmentAmount,
        payment_frequency: loan.loan_payment_frequency,
        payment_status: loan.payment_status,
        is_overdue: isOverdue,
        start_date: loan.loan_start_date,
        maturity_date: loan.maturity_date,
        last_payment_date: loan.last_payment_date
      });
    });
    
    res.json({
      success: true,
      data: {
        groups: Object.values(groups),
        total_groups: Object.keys(groups).length,
        total_members: loans.length,
        total_disbursed: loans.reduce((sum, l) => sum + parseFloat(l.disbursed_amount), 0),
        total_overdue: loans.filter(l => l.payment_status === 'OVERDUE').length,
        generated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching field collection summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch field collection summary',
      error: error.message
    });
  }
});

// ========== LOAN INSTALLMENT QUERY METHODS ==========

// Get installment summary for a loan
export const getInstallmentSummary = async (req, res) => {
    const { loanAccountId } = req.params;
    
    try {
        const [result] = await sequelize.query(`
            SELECT 
                COUNT(*) as total_installments_paid,
                SUM(principal_amount) as total_principal_paid,
                SUM(interest_amount) as total_interest_paid,
                SUM(penalty_amount) as total_penalty_paid,
                SUM(total_amount) as total_amount_paid,
                MIN(repayment_date) as first_payment_date,
                MAX(repayment_date) as last_payment_date
            FROM loan_repayments 
            WHERE loan_account_id = ? 
              AND status = 'COMPLETED'
        `, {
            replacements: [loanAccountId],
            type: sequelize.QueryTypes.SELECT
        });
        
        res.json({
            success: true,
            data: result || {
                total_installments_paid: 0,
                total_principal_paid: 0,
                total_interest_paid: 0,
                total_penalty_paid: 0,
                total_amount_paid: 0,
                first_payment_date: null,
                last_payment_date: null
            }
        });
    } catch (error) {
        console.error('Error getting installment summary:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get paid installments list
export const getPaidInstallments = async (req, res) => {
    const { loanAccountId } = req.params;
    
    try {
        const installments = await sequelize.query(`
            SELECT 
                installment_number,
                repayment_date,
                principal_amount,
                interest_amount,
                total_amount,
                CASE 
                    WHEN repayment_date > CURDATE() THEN 'FUTURE'
                    WHEN repayment_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 'RECENT'
                    ELSE 'OLD'
                END as payment_recency
            FROM loan_repayments 
            WHERE loan_account_id = ? 
              AND status = 'COMPLETED'
            ORDER BY installment_number ASC
        `, {
            replacements: [loanAccountId],
            type: sequelize.QueryTypes.SELECT
        });
        
        res.json({
            success: true,
            data: installments
        });
    } catch (error) {
        console.error('Error getting paid installments:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get complete loan progress
export const getLoanProgress = async (req, res) => {
    const { loanAccountId } = req.params;
    
    try {
        const [result] = await sequelize.query(`
            SELECT 
                la.ACCT_NO as account_number,
                la.ACCT_NM as customer_name,
                la.LOAN_STATUS,
                la.TERM_VALUE as total_installments_expected,
                la.AMOUNT as original_principal,
                la.OUTSTANDING_PRINCIPAL,
                la.ACCRUED_INTEREST as outstanding_interest,
                la.TOTAL_DUE as total_outstanding,
                COALESCE((
                    SELECT COUNT(*) 
                    FROM loan_repayments lr 
                    WHERE lr.loan_account_id = la.id 
                      AND lr.status = 'COMPLETED'
                ), 0) as installments_paid,
                COALESCE((
                    SELECT SUM(total_amount) 
                    FROM loan_repayments lr 
                    WHERE lr.loan_account_id = la.id 
                      AND lr.status = 'COMPLETED'
                ), 0) as total_amount_paid,
                GREATEST(0, la.TERM_VALUE - COALESCE((
                    SELECT COUNT(*) 
                    FROM loan_repayments lr 
                    WHERE lr.loan_account_id = la.id 
                      AND lr.status = 'COMPLETED'
                ), 0)) as remaining_installments,
                ROUND(
                    COALESCE((
                        SELECT COUNT(*) 
                        FROM loan_repayments lr 
                        WHERE lr.loan_account_id = la.id 
                          AND lr.status = 'COMPLETED'
                    ), 0) / NULLIF(la.TERM_VALUE, 0) * 100, 2
                ) as completion_percentage
            FROM loan_accounts la
            WHERE la.id = ?
        `, {
            replacements: [loanAccountId],
            type: sequelize.QueryTypes.SELECT
        });
        
        res.json({
            success: true,
            data: result || {}
        });
    } catch (error) {
        console.error('Error getting loan progress:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get overdue installments
export const getOverdueInstallments = async (req, res) => {
    const { loanAccountId } = req.params;
    
    try {
        const overdue = await sequelize.query(`
            SELECT 
                installment_number,
                repayment_date,
                total_amount as overdue_amount,
                DATEDIFF(CURDATE(), repayment_date) as days_overdue,
                principal_amount,
                interest_amount
            FROM loan_repayments 
            WHERE loan_account_id = ? 
              AND status = 'PENDING'
              AND repayment_date < CURDATE()
            ORDER BY installment_number ASC
        `, {
            replacements: [loanAccountId],
            type: sequelize.QueryTypes.SELECT
        });
        
        res.json({
            success: true,
            data: overdue
        });
    } catch (error) {
        console.error('Error getting overdue installments:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ========== ROUTE SETUP ==========
export const bulkUploadRoutes = (app) => {
  app.post('/api/bulk/group-loans/test-upload', upload.single('file'), testUpload);
  app.post('/api/bulk/group-loans/disburse', upload.single('file'), bulkUploadGroupLoanDisbursement);
  app.get('/api/bulk/group-loans/template', downloadTemplate);
  app.post('/api/bulk/group-loans/streaming-upload', streamingUpload);
};