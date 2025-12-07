import express from 'express';
import multer from 'multer';
import {
  generateLicense,
  validateLicenseFile,
  getLicenseDetails,
  checkLicenseExists
} from '../controllers/LicenseController.js';

const router = express.Router();

// Multer configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024, // 1MB
    files: 1,
    fields: 5
  },
  fileFilter: (req, file, cb) => {
    // Accept .txt files and check extension
    const allowedMimeTypes = ['text/plain', 'application/octet-stream'];
    const allowedExtensions = ['.txt'];
    
    const fileExtension = file.originalname.toLowerCase().slice(
      file.originalname.lastIndexOf('.')
    );
    
    if (allowedMimeTypes.includes(file.mimetype) && 
        allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed'), false);
    }
  }
}).single('licenseFile');

// Error handling wrapper for file upload
const handleFileUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          message: 'File too large (max 1MB)',
          maxSize: '1MB',
          code: 'FILE_TOO_LARGE'
        });
      }
      if (err.message === 'Only .txt files are allowed') {
        return res.status(415).json({ 
          message: 'Invalid file type',
          accepted: 'text/plain (.txt files only)',
          code: 'INVALID_FILE_TYPE'
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ 
          message: 'Too many files',
          maxFiles: 1,
          code: 'TOO_MANY_FILES'
        });
      }
      return res.status(400).json({ 
        message: 'File upload failed',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Upload error',
        code: 'UPLOAD_ERROR'
      });
    }
    next();
  });
};

// Parse JSON body for non-file uploads
const parseJsonBody = (req, res, next) => {
  if (!req.headers['content-type']?.includes('multipart/form-data')) {
    express.json()(req, res, next);
  } else {
    next();
  }
};

// Routes
router.post('/generate', generateLicense);

// Validation with file upload support
router.post('/validate', 
  parseJsonBody,
  (req, res, next) => {
    // Check if this is a file upload or JSON request
    const isFileUpload = req.headers['content-type']?.includes('multipart/form-data');
    
    if (isFileUpload) {
      handleFileUpload(req, res, next);
    } else {
      // For JSON requests, ensure encryptedKey is present
      if (!req.body.encryptedKey) {
        return res.status(400).json({
          message: 'For JSON requests, encryptedKey field is required',
          usage: { encryptedKey: 'your-encrypted-license-key' }
        });
      }
      next();
    }
  },
  validateLicenseFile
);

// Alternative direct validation endpoint (JSON only)
router.post('/validate-key', 
  express.json(),
  (req, res, next) => {
    if (!req.body.encryptedKey) {
      return res.status(400).json({
        message: 'encryptedKey is required',
        example: { encryptedKey: 'your-encrypted-key-here' }
      });
    }
    next();
  },
  validateLicenseFile
);

// License details and existence check
router.get('/details', getLicenseDetails);
router.get('/check', checkLicenseExists);

// Health check endpoint for license service
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'license-management',
    endpoints: [
      'POST /api/licenses/generate',
      'POST /api/licenses/validate',
      'GET /api/licenses/details',
      'GET /api/licenses/check'
    ],
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;