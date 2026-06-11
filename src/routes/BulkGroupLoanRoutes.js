// routes/bulkGroupLoanRoutes.js - COMPLETE CORRECTED VERSION WITH REPAYMENT ENDPOINTS

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import asyncHandler from 'express-async-handler';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js'; // IMPORT SEQUELIZE DIRECTLY AT THE TOP
import {
  bulkUploadGroupLoanDisbursement,
  downloadTemplate,
  upload,  // Import upload from controller
  bulkLoanRepayment,  // Add this import
  getBulkRepaymentHistory,  // Add this import
  getLoanTransactionHistory,  // Add this import
    generateFieldCollectionSheet,
  getFieldCollectionSummary,
  getInstallmentSummary,
  getPaidInstallments,
  getLoanProgress,
  getOverdueInstallments

} from '../controllers/BulkGroupLoanController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ========== OPTIONS HANDLER FOR CORS PREFLIGHT ==========
router.options('*', (req, res) => {
  console.log('🔄 OPTIONS request to:', req.originalUrl);
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, app-id, x-webhook-signature, x-nip-signature');
  res.header('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

// ========== PUBLIC ENDPOINTS (NO AUTH REQUIRED) ==========

// GET /api/bulk/group-loans/template - Download disbursement template
router.get('/template', asyncHandler(downloadTemplate));

// GET /api/bulk/group-loans/repayment-template - Download repayment template (legacy)
router.get('/repayment-template', asyncHandler(async (req, res) => {
  const xlsx = (await import('xlsx')).default;
  
  const template = [{
    group_loan_id: 'GRP001',
    customer_id: '0000000001',
    repayment_amount: 10000,
    principal_paid: 8000,
    interest_paid: 2000,
    penalty_paid: 0,
    payment_date: '2024-03-15',
    payment_method: 'CASH',
    reference: 'REF001',
    payment_frequency: 'MONTHLY'
  }];
  
  const ws = xlsx.utils.json_to_sheet(template);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'RepaymentTemplate');
  
  const instructions = [
    { Field: 'group_loan_id', Description: 'Group loan identifier (loanId or groupCode)', Required: 'Yes', Example: 'GRP001' },
    { Field: 'customer_id', Description: 'Customer identifier (must match loan account)', Required: 'Yes', Example: '0000000001' },
    { Field: 'repayment_amount', Description: 'Total amount being repaid', Required: 'Yes', Example: '10000' },
    { Field: 'principal_paid', Description: 'Portion applied to principal (optional, auto-calculated)', Required: 'No', Example: '8000' },
    { Field: 'interest_paid', Description: 'Portion applied to interest (optional, auto-calculated)', Required: 'No', Example: '2000' },
    { Field: 'penalty_paid', Description: 'Portion applied to penalties', Required: 'No', Example: '0' },
    { Field: 'payment_date', Description: 'Date of payment (YYYY-MM-DD)', Required: 'No', Example: '2024-03-15' },
    { Field: 'payment_method', Description: 'Payment method: CASH, BANK_TRANSFER, CHEQUE', Required: 'No', Example: 'CASH' },
    { Field: 'reference', Description: 'Transaction reference number', Required: 'No', Example: 'REF001' },
    { Field: 'payment_frequency', Description: 'Payment frequency for installment tracking', Required: 'No', Example: 'MONTHLY' }
  ];
  
  const wsInstructions = xlsx.utils.json_to_sheet(instructions);
  xlsx.utils.book_append_sheet(wb, wsInstructions, 'Instructions');
  
  const notes = [
    { Note: 'IMPORTANT INFORMATION:' },
    { Note: '' },
    { Note: 'STANDALONE REPAYMENT TEMPLATE:' },
    { Note: '1. Use this template for making new repayments on existing loans' },
    { Note: '2. For backdated repayments during disbursement, use the main template' },
    { Note: '3. The system will validate that the loan exists and has outstanding balance' }
  ];
  
  const wsNotes = xlsx.utils.json_to_sheet(notes);
  xlsx.utils.book_append_sheet(wb, wsNotes, 'Important Notes');
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=group_loan_repayment_template.xlsx');
  
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.send(buffer);
}));

// ========== SIMPLE PUBLIC TEST ENDPOINTS ==========
router.get('/test-public', (req, res) => {
  console.log('✅ Public test endpoint hit');
  res.json({
    success: true,
    message: 'Public test endpoint is working!',
    timestamp: new Date().toISOString(),
    endpoints: {
      public: ['GET /template', 'GET /repayment-template', 'GET /repayments/template', 'POST /test-upload', 'POST /disburse'],
      protected: ['GET /history', 'GET /status/:batchId', 'GET /debug/batches', 'GET /frequency-stats', 'GET /debug/raw-audit', 'POST /repayments', 'GET /repayments/history', 'GET /loans/:accountNumber/transactions']
    }
  });
});

router.post('/test-upload', 
  (req, res, next) => {
    console.log('📤 Test upload endpoint hit (PUBLIC)');
    console.log('Headers:', {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    });
    next();
  },
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error('Test upload multer error:', err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            message: 'File too large. Maximum size is 500MB.'
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload failed'
        });
      }
      next();
    });
  },
  (req, res) => {
    console.log('✅ Test upload successful (PUBLIC)');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    res.json({
      success: true,
      message: 'File received successfully (public endpoint)',
      file: {
        originalname: req.file.originalname,
        size: req.file.size,
        sizeMB: (req.file.size / 1024 / 1024).toFixed(2),
        mimetype: req.file.mimetype,
        path: req.file.path
      }
    });
  }
);

// ========== DISBURSEMENT ENDPOINT (Public for testing) ==========
router.post(
  '/disburse',
  (req, res, next) => {
    console.log('📤 Public disburse endpoint hit - NO AUTH REQUIRED');
    console.log('Headers:', {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    });
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000);
    next();
  },
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            message: 'File too large. Maximum size is 500MB.'
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: 'Unexpected field. Please upload file with field name "file".'
          });
        }
        if (err.message && err.message.includes('Unexpected end of form')) {
          return res.status(400).json({
            success: false,
            message: 'Upload interrupted. Please check your connection and try again.'
          });
        }
        
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload failed'
        });
      }
      next();
    });
  },
  (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please select a file with field name "file".'
      });
    }
    
    console.log('✅ File received:', {
      name: req.file.originalname,
      size: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
      path: req.file.path,
      mimetype: req.file.mimetype
    });
    
    next();
  },
  asyncHandler(bulkUploadGroupLoanDisbursement)
);

// ========== REPAYMENT ENDPOINTS (PUBLIC for testing) ==========
// POST /api/bulk/group-loans/repayments - Bulk loan repayments
router.post(
  '/repayments',
  (req, res, next) => {
    console.log('📤 Bulk repayment endpoint hit - NO AUTH REQUIRED');
    console.log('Headers:', {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    });
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000);
    next();
  },
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            message: 'File too large. Maximum size is 500MB.'
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: 'Unexpected field. Please upload file with field name "file".'
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload failed'
        });
      }
      next();
    });
  },
  (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please select a file with field name "file".'
      });
    }
    
    console.log('✅ Repayment file received:', {
      name: req.file.originalname,
      size: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
      path: req.file.path,
      mimetype: req.file.mimetype
    });
    
    next();
  },
  asyncHandler(bulkLoanRepayment)
);

// GET /api/bulk/group-loans/repayments/template - Download repayment template
router.get('/repayments/template', asyncHandler(async (req, res) => {
  const xlsx = (await import('xlsx')).default;
  
  const template = [{
    loan_account_number: '3190000001',
    repayment_amount: 10000,
    principal_paid: 8000,
    interest_paid: 2000,
    penalty_paid: 0,
    payment_date: '2024-03-15',
    payment_method: 'CASH',
    reference: 'REF001',
    narration: 'Monthly loan repayment'
  }];
  
  const ws = xlsx.utils.json_to_sheet(template);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'RepaymentTemplate');
  
  const instructions = [
    { Field: 'loan_account_number', Description: 'Loan account number (10 digits)', Required: 'Yes', Example: '3190000001' },
    { Field: 'repayment_amount', Description: 'Total amount being repaid', Required: 'Yes', Example: '10000' },
    { Field: 'principal_paid', Description: 'Portion applied to principal (optional)', Required: 'No', Example: '8000' },
    { Field: 'interest_paid', Description: 'Portion applied to interest (optional)', Required: 'No', Example: '2000' },
    { Field: 'penalty_paid', Description: 'Portion applied to penalties', Required: 'No', Example: '0' },
    { Field: 'payment_date', Description: 'Date of payment (YYYY-MM-DD)', Required: 'Yes', Example: '2024-03-15' },
    { Field: 'payment_method', Description: 'Payment method: CASH, BANK_TRANSFER, CHEQUE', Required: 'No', Example: 'CASH' },
    { Field: 'reference', Description: 'Transaction reference number', Required: 'No', Example: 'REF001' },
    { Field: 'narration', Description: 'Payment description', Required: 'No', Example: 'Monthly loan repayment' }
  ];
  
  const wsInstructions = xlsx.utils.json_to_sheet(instructions);
  xlsx.utils.book_append_sheet(wb, wsInstructions, 'Instructions');
  
  const notes = [
    { Note: 'IMPORTANT INFORMATION:' },
    { Note: '' },
    { Note: 'LOAN REPAYMENT BULK UPLOAD:' },
    { Note: '1. Use this template to process multiple loan repayments at once' },
    { Note: '2. The system will validate each loan account exists' },
    { Note: '3. Repayments will be applied to interest first, then principal' },
    { Note: '4. If you specify principal_paid and interest_paid, they must sum to repayment_amount' },
    { Note: '5. Penalty payments are applied after principal and interest' }
  ];
  
  const wsNotes = xlsx.utils.json_to_sheet(notes);
  xlsx.utils.book_append_sheet(wb, wsNotes, 'Important Notes');
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=loan_repayment_template.xlsx');
  
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.send(buffer);
}));

// ========== APPLY AUTHENTICATION FOR PROTECTED ROUTES ==========
console.log('🔒 Applying authentication middleware to protected routes...');
router.use(protect);

// Debug middleware for protected routes
router.use((req, res, next) => {
  console.log(`📡 [Protected] ${req.method} ${req.originalUrl} - User: ${req.user?.id || 'unknown'}`);
  next();
});

// ========== DEBUG RAW AUDIT ENDPOINT ==========
router.get('/debug/raw-audit', asyncHandler(async (req, res) => {
  if (!sequelize) {
    return res.status(503).json({ success: false, message: 'Database not available' });
  }
  
  try {
    const rawData = await sequelize.query(
      `SELECT 
        id,
        status,
        description,
        timestamp,
        user_id,
        action,
        new_value
       FROM audit_trails 
       WHERE event_type = 'BULK_UPLOAD' 
         AND action LIKE 'BULK_GROUP_LOAN%'
       ORDER BY timestamp DESC 
       LIMIT 5`,
      {
        type: sequelize.QueryTypes.SELECT,
        timeout: 5000
      }
    );
    
    const debugData = rawData.map(item => ({
      id: item.id,
      new_value_raw: item.new_value,
      new_value_type: typeof item.new_value,
      new_value_parsed: item.new_value ? (() => {
        try {
          return typeof item.new_value === 'string' ? JSON.parse(item.new_value) : item.new_value;
        } catch(e) {
          return { error: e.message, value: item.new_value };
        }
      })() : null,
      status: item.status,
      user_id: item.user_id,
      description: item.description,
      timestamp: item.timestamp
    }));
    
    res.json({
      success: true,
      data: debugData,
      count: debugData.length,
      message: 'Debug data - check new_value_parsed to see what fields are available'
    });
    
  } catch (error) {
    console.error('Error fetching raw audit data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

// ========== HISTORY ENDPOINT ==========
router.get('/history', asyncHandler(async (req, res) => {
  if (!sequelize) {
    console.error('❌ Sequelize not available');
    return res.status(503).json({
      success: false,
      message: 'Database connection not available'
    });
  }
  
  try {
    const history = await sequelize.query(
      `SELECT 
        id,
        status,
        description,
        timestamp,
        user_id,
        action,
        new_value
       FROM audit_trails 
       WHERE event_type = 'BULK_UPLOAD' 
         AND action LIKE 'BULK_GROUP_LOAN%'
       ORDER BY timestamp DESC 
       LIMIT 50`,
      {
        type: sequelize.QueryTypes.SELECT,
        timeout: 10000
      }
    );
    
    console.log(`📊 Found ${history.length} audit trail records`);
    
    const transformedHistory = (history || []).map(item => {
      let parsedData = {};
      
      if (item.new_value) {
        try {
          if (typeof item.new_value === 'string') {
            parsedData = JSON.parse(item.new_value);
          } else if (typeof item.new_value === 'object') {
            parsedData = item.new_value;
          }
        } catch (e) {
          console.error(`Error parsing new_value for item ${item.id}:`, e.message);
        }
      }
      
      const batchId = parsedData.batchId || parsedData.batch_id || parsedData.batchID || `BATCH_${item.id}`;
      const fileName = parsedData.fileName || parsedData.file_name || parsedData.filename || 'Unknown';
      const totalRecords = parsedData.totalRecords || parsedData.total_records || 0;
      const successfulCount = parsedData.successful || parsedData.successful_count || 0;
      const failedCount = parsedData.failed || parsedData.failed_count || 0;
      const userName = parsedData.user_name || parsedData.userName || parsedData.created_by || (item.user_id ? `User_${item.user_id}` : 'SYSTEM');
      
      return {
        batch_id: batchId,
        file_name: fileName,
        record_count: parseInt(totalRecords) || 0,
        successful_count: parseInt(successfulCount) || 0,
        failed_count: parseInt(failedCount) || 0,
        status: item.status || (parseInt(failedCount) > 0 ? 'PARTIAL' : 'SUCCESS'),
        created_at: item.timestamp,
        user: userName,
        action: item.action,
        description: item.description || parsedData.description,
        summary: parsedData.summary || {}
      };
    });
    
    console.log(`✅ Transformed ${transformedHistory.length} history records`);
    
    res.json({
      success: true,
      data: transformedHistory,
      count: transformedHistory.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching bulk upload history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bulk upload history',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

// ========== REPAYMENT HISTORY ENDPOINT ==========
router.get('/repayments/history', asyncHandler(getBulkRepaymentHistory));

// ========== LOAN TRANSACTION HISTORY ENDPOINT ==========
router.get('/loans/:accountNumber/transactions', asyncHandler(getLoanTransactionHistory));

// ========== STATUS ENDPOINT ==========
// In BulkGroupLoanRoutes.js - Update the status endpoint

// ========== STATUS ENDPOINT - UPDATED TO HANDLE LEGACY BATCH IDs WITHOUT METADATA ==========
router.get('/status/:batchId', asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  
  console.log(`🔍 Checking status for batchId: ${batchId}`);
  
  if (!sequelize) {
    console.error('❌ Sequelize instance not available');
    return res.status(503).json({
      success: false,
      message: 'Database connection not available'
    });
  }
  
  // Check if batchId is numeric (like 40)
  const isNumeric = /^\d+$/.test(batchId);
  
  try {
    let auditResult = null;
    
    // Try to find by ID directly (since batchId might be a number like 40)
    if (isNumeric) {
      // Search by ID in audit_trails
      [auditResult] = await sequelize.query(
        `SELECT 
          id,
          status,
          description,
          timestamp,
          user_id,
          new_value
         FROM audit_trails 
         WHERE event_type = 'BULK_UPLOAD'
           AND id = ?
         ORDER BY timestamp DESC 
         LIMIT 1`,
        {
          replacements: [parseInt(batchId)],
          type: sequelize.QueryTypes.SELECT,
          timeout: 5000
        }
      );
    }
    
    // If not found by ID, try to find by batchId in new_value
    if (!auditResult) {
      [auditResult] = await sequelize.query(
        `SELECT 
          id,
          status,
          description,
          timestamp,
          user_id,
          new_value
         FROM audit_trails 
         WHERE event_type = 'BULK_UPLOAD'
           AND JSON_EXTRACT(new_value, '$.batchId') = ?
         ORDER BY timestamp DESC 
         LIMIT 1`,
        {
          replacements: [batchId],
          type: sequelize.QueryTypes.SELECT,
          timeout: 5000
        }
      );
    }
    
    // If still not found, try description search
    if (!auditResult) {
      [auditResult] = await sequelize.query(
        `SELECT 
          id,
          status,
          description,
          timestamp,
          user_id,
          new_value
         FROM audit_trails 
         WHERE event_type = 'BULK_UPLOAD'
           AND description LIKE ?
         ORDER BY timestamp DESC 
         LIMIT 1`,
        {
          replacements: [`%${batchId}%`],
          type: sequelize.QueryTypes.SELECT,
          timeout: 5000
        }
      );
    }
    
    if (auditResult) {
      let parsedData = {};
      if (auditResult.new_value) {
        try {
          parsedData = typeof auditResult.new_value === 'string' 
            ? JSON.parse(auditResult.new_value) 
            : auditResult.new_value;
        } catch (e) {
          console.error('Error parsing new_value:', e);
        }
      }
      
      return res.json({
        success: true,
        data: {
          id: auditResult.id,
          batchId: parsedData.batchId || `BATCH_${auditResult.id}`,
          status: auditResult.status || 'UNKNOWN',
          description: auditResult.description || 'Batch processed',
          timestamp: auditResult.timestamp,
          user: parsedData.user_name || `User_${auditResult.user_id}`,
          record_count: parsedData.totalRecords || 0,
          successful_count: parsedData.successful || 0,
          failed_count: parsedData.failed || 0,
          fileName: parsedData.fileName || 'Unknown',
          summary: parsedData.summary || {},
          results: parsedData
        }
      });
    }
    
    // If not found in audit_trails, check group_loans table with only existing columns
    // Try to find by loan_id (if it exists)
    let groupLoanResult = null;
    
    try {
      // First, check if the table has loan_id column
      const [columns] = await sequelize.query(
        `SHOW COLUMNS FROM group_loans`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      const columnNames = columns.map(col => col.Field);
      console.log('Group loans columns:', columnNames);
      
      // Build query based on available columns
      let selectFields = ['id'];
      let whereConditions = [];
      const replacements = [];
      
      if (columnNames.includes('loan_id')) {
        selectFields.push('loan_id as loanId');
        whereConditions.push(`loan_id = ?`);
        replacements.push(batchId);
      }
      
      if (columnNames.includes('group_code')) {
        selectFields.push('group_code as groupCode');
        if (!whereConditions.length) whereConditions.push(`group_code = ?`);
        replacements.push(batchId);
      }
      
      if (columnNames.includes('created_at')) {
        selectFields.push('created_at');
      }
      
      if (columnNames.includes('created_by')) {
        selectFields.push('created_by');
      }
      
      if (columnNames.includes('total_amount')) {
        selectFields.push('total_amount as totalAmount');
      }
      
      if (columnNames.includes('status')) {
        selectFields.push('status');
      }
      
      if (selectFields.length > 1 && whereConditions.length > 0) {
        const query = `SELECT ${selectFields.join(', ')} FROM group_loans WHERE ${whereConditions.join(' OR ')} LIMIT 1`;
        console.log('Executing group_loans query:', query);
        
        [groupLoanResult] = await sequelize.query(
          query,
          {
            replacements: replacements,
            type: sequelize.QueryTypes.SELECT,
            timeout: 5000
          }
        );
      }
    } catch (groupError) {
      console.warn('⚠️ Could not query group_loans:', groupError.message);
    }
    
    if (groupLoanResult) {
      return res.json({
        success: true,
        data: {
          id: groupLoanResult.id,
          batchId: batchId,
          status: groupLoanResult.status || 'PROCESSED',
          description: `Group loan processed for: ${groupLoanResult.groupCode || groupLoanResult.loanId || batchId}`,
          timestamp: groupLoanResult.created_at,
          user: groupLoanResult.created_by || 'SYSTEM',
          record_count: 1,
          successful_count: 1,
          failed_count: 0,
          fileName: 'Group Loan',
          results: {
            batchId: batchId,
            fileName: 'Group Loan',
            totalRecords: 1,
            successful: 1,
            failed: 0,
            summary: {
              totalDisbursed: groupLoanResult.totalAmount || 0
            }
          }
        }
      });
    }
    
    return res.status(404).json({
      success: false,
      message: `Batch ID "${batchId}" not found`,
      suggestions: [
        'Try using the record ID (e.g., 40) instead of BATCH_40',
        'Check recent batches using /api/bulk/group-loans/debug/batches',
        'Upload a new file to generate a valid batch ID'
      ],
      batchId: batchId
    });
    
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch batch status',
      error: error.message
    });
  }
}));

// In BulkGroupLoanRoutes.js - Add this endpoint

// ========== GET BATCH DETAILS BY RECORD ID ==========
router.get('/details/by-id/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!sequelize) {
    return res.status(503).json({ success: false, message: 'Database not available' });
  }
  
  try {
    const [auditResult] = await sequelize.query(
      `SELECT 
        id,
        status,
        description,
        timestamp,
        user_id,
        new_value
       FROM audit_trails 
       WHERE event_type = 'BULK_UPLOAD'
         AND id = ?
       LIMIT 1`,
      {
        replacements: [id],
        type: sequelize.QueryTypes.SELECT,
        timeout: 5000
      }
    );
    
    if (!auditResult) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    
    let parsedData = {};
    if (auditResult.new_value) {
      try {
        parsedData = typeof auditResult.new_value === 'string' 
          ? JSON.parse(auditResult.new_value) 
          : auditResult.new_value;
      } catch (e) {}
    }
    
    res.json({
      success: true,
      data: {
        id: auditResult.id,
        batchId: parsedData.batchId || `BATCH_${auditResult.id}`,
        fileName: parsedData.fileName || 'Unknown',
        totalRecords: parsedData.totalRecords || 0,
        successful: parsedData.successful || 0,
        failed: parsedData.failed || 0,
        status: auditResult.status,
        description: auditResult.description,
        timestamp: auditResult.timestamp,
        user: parsedData.user_name || `User_${auditResult.user_id}`,
        summary: parsedData.summary || {}
      }
    });
    
  } catch (error) {
    console.error('Error fetching batch details by ID:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

// ========== DEBUG BATCHES ENDPOINT ==========
router.get('/debug/batches', asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;
  
  if (!sequelize) {
    return res.status(503).json({
      success: false,
      message: 'Database connection not available',
      data: []
    });
  }
  
  try {
    const auditBatches = await sequelize.query(
      `SELECT 
        JSON_EXTRACT(new_value, '$.batchId') as batchId,
        status,
        description,
        timestamp,
        user_id
       FROM audit_trails 
       WHERE event_type = 'BULK_UPLOAD' 
         AND action LIKE 'BULK_GROUP_LOAN%'
         AND JSON_EXTRACT(new_value, '$.batchId') IS NOT NULL
       ORDER BY timestamp DESC 
       LIMIT ?`,
      {
        replacements: [parseInt(limit)],
        type: sequelize.QueryTypes.SELECT,
        timeout: 5000
      }
    );
    
    const cleanedBatches = auditBatches.map(batch => ({
      ...batch,
      batchId: batch.batchId ? batch.batchId.replace(/^"|"$/g, '') : null
    })).filter(batch => batch.batchId);
    
    res.json({
      success: true,
      data: cleanedBatches,
      count: cleanedBatches.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch batches',
      error: error.message
    });
  }
}));

// ========== HEALTH CHECK ==========
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Bulk group loan service is running',
    timestamp: new Date().toISOString(),
    sequelize: !!sequelize,
    endpoints: {
      public: [
        'GET /template', 
        'GET /repayment-template', 
        'GET /repayments/template',
        'GET /test-public', 
        'POST /test-upload', 
        'POST /disburse',
        'POST /repayments'
      ],
      protected: [
        'GET /test', 
        'GET /history', 
        'GET /repayments/history',
        'GET /loans/:accountNumber/transactions',
        'GET /status/:batchId', 
        'GET /debug/batches', 
        'GET /debug/raw-audit', 
        'GET /frequency-stats'
      ]
    }
  });
});

// ========== TEST ENDPOINT (Protected) ==========
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Protected test endpoint is working!',
    user: {
      id: req.user?.id,
      username: req.user?.username,
      role: req.user?.role
    },
    timestamp: new Date().toISOString()
  });
});

// ========== FREQUENCY STATS ==========
router.get('/frequency-stats', asyncHandler(async (req, res) => {
  if (!sequelize) {
    return res.json({
      success: true,
      data: {
        DAILY: { count: 0, totalAmount: 0, totalInterest: 0 },
        WEEKLY: { count: 0, totalAmount: 0, totalInterest: 0 },
        BIWEEKLY: { count: 0, totalAmount: 0, totalInterest: 0 },
        MONTHLY: { count: 0, totalAmount: 0, totalInterest: 0 },
        QUARTERLY: { count: 0, totalAmount: 0, totalInterest: 0 }
      }
    });
  }
  
  try {
    const stats = await sequelize.query(`
      SELECT 
        PAYMENT_FREQUENCY as payment_frequency,
        COUNT(*) as count,
        SUM(AMOUNT) as totalAmount,
        SUM(AMOUNT * INTEREST_RATE / 100 * TERM_VALUE) as totalInterest
      FROM loan_accounts 
      WHERE PAYMENT_FREQUENCY IS NOT NULL 
        AND LOAN_STATUS IN ('ACTIVE', 'PARTIALLY_REPAID')
      GROUP BY PAYMENT_FREQUENCY
    `, {
      type: sequelize.QueryTypes.SELECT
    });
    
    const formattedStats = {
      DAILY: { count: 0, totalAmount: 0, totalInterest: 0 },
      WEEKLY: { count: 0, totalAmount: 0, totalInterest: 0 },
      BIWEEKLY: { count: 0, totalAmount: 0, totalInterest: 0 },
      MONTHLY: { count: 0, totalAmount: 0, totalInterest: 0 },
      QUARTERLY: { count: 0, totalAmount: 0, totalInterest: 0 }
    };
    
    if (stats && Array.isArray(stats)) {
      stats.forEach(stat => {
        const freq = stat.payment_frequency?.toUpperCase();
        if (freq && formattedStats[freq]) {
          formattedStats[freq] = {
            count: parseInt(stat.count) || 0,
            totalAmount: parseFloat(stat.totalAmount) || 0,
            totalInterest: parseFloat(stat.totalInterest) || 0
          };
        }
      });
    }
    
    res.json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    console.error('Error fetching frequency stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch frequency stats',
      error: error.message
    });
  }
}));

// ========== CATCH-ALL FOR UNDEFINED ROUTES ==========
router.use('*', (req, res) => {
  console.log(`❌ Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    availableRoutes: {
      public: [
        'GET /template', 
        'GET /repayment-template', 
        'GET /repayments/template',
        'GET /test-public', 
        'POST /test-upload', 
        'POST /disburse',
        'POST /repayments'
      ],
      protected: [
        'GET /test', 
        'GET /history', 
        'GET /repayments/history',
        'GET /loans/:accountNumber/transactions',
        'GET /status/:batchId', 
        'GET /debug/batches', 
        'GET /debug/raw-audit', 
        'GET /frequency-stats'
      ]
    }
  });
});


// ========== FIELD COLLECTION SHEET ENDPOINTS ==========
router.get('/field-collection-sheet', asyncHandler(generateFieldCollectionSheet));
router.get('/field-collection-summary', asyncHandler(getFieldCollectionSummary));

// Loan installment tracking routes
router.get('/loans/:loanAccountId/installment-summary', getInstallmentSummary);
router.get('/loans/:loanAccountId/paid-installments', getPaidInstallments);
router.get('/loans/:loanAccountId/progress', getLoanProgress);
router.get('/loans/:loanAccountId/overdue', getOverdueInstallments);



export default router;