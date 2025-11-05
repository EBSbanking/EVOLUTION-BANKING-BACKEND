import express from 'express';
import multer from 'multer';
import {uploadGuarantorDocuments} from '../controllers/uploadGuarantorDocumentsController.js';

const router = express.Router();

// Enhanced multer configuration with strict validation
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, './uploads/temp/'); // Temporary storage
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 2 // Exactly 2 files
  },
  fileFilter: (req, file, cb) => {
    // Only accept these exact field names (case-sensitive)
    const allowedFields = ['IMAGE', 'DOCUMENT'];
    if (allowedFields.includes(file.fieldname)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid field name. Only ${allowedFields.join(', ')} allowed`), false);
    }
  }
});

// Error handling middleware
const handleUploadErrors = (err, req, res, next) => {
  if (err) {
    console.error('Upload middleware error:', err);
    return res.status(400).json({
      success: false,
      code: 'UPLOAD_ERROR',
      message: err.message,
      type: err.code || 'VALIDATION_ERROR'
    });
  }
  next();
};

router.post('/upload-guarantor/:guarantorId/documents',
  // Debugging middleware
  (req, res, next) => {
    console.log('Incoming request headers:', req.headers);
    next();
  },
  
  // File handling
  upload.fields([
    { name: 'IMAGE', maxCount: 1 },
    { name: 'DOCUMENT', maxCount: 1 }
  ]),
  
  // Error handling
  handleUploadErrors,
  
  // Main controller
  uploadGuarantorDocuments
);

export default router;