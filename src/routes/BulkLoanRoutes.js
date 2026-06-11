import express from 'express';
import { upload, bulkIndividualLoanDisbursement, bulkLoanRepayment, downloadTemplate } from '../controllers/BulkLoanController.js';
import asyncHandler from 'express-async-handler';

const router = express.Router();

// ========== DISBURSEMENT ENDPOINT (with full error handling, matching group route) ==========
router.post(
  '/disburse',
  (req, res, next) => {
    console.log('📤 Individual bulk disburse endpoint hit');
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
  asyncHandler(bulkIndividualLoanDisbursement)
);

// ========== REPAYMENT ENDPOINT ==========
router.post('/repay', upload.single('file'), bulkLoanRepayment);

// ========== TEMPLATE DOWNLOAD ==========
router.get('/template', downloadTemplate);

export default router;