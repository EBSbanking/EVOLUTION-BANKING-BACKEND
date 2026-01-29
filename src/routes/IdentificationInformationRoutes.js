import express from 'express';
import multer from 'multer';
import path from 'path';
import {
  uploadIdentification,
  getIdentifications,
  getIdentificationById,
  getIdentificationsByCustomer,
  updateIdentificationStatus,
  setAsPrimary,
  deleteIdentification,
  getExpiringDocuments
} from '../controllers/IdentificationInformationController.js'; // Fixed import name

// Middleware imports
import { authenticate } from '../middlewares/authMiddleware.js';


const router = express.Router();

// Configure multer for disk storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(process.cwd(), 'uploads', 'identifications');
    // Create directory if it doesn't exist
    const fs = require('fs');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Create upload middleware
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and PDF files are allowed.'), false);
    }
  }
});

// Configure multer for memory storage (optional)
const memoryStorage = multer.memoryStorage();
const memoryUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 10 // Max 10 files for bulk upload
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and PDF files are allowed.'), false);
    }
  }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
};

// Apply authentication to all routes
router.use(authenticate);

// POST routes
router.post(
  '/upload',
  upload.single('document'), // Use single file upload
  handleMulterError,
  uploadIdentification
);

router.post(
  '/upload/memory',
  memoryUpload.single('document'),
  handleMulterError,
  uploadIdentification
);

// GET routes
router.get('/', getIdentifications);
router.get('/expiring', getExpiringDocuments);
router.get('/:id', getIdentificationById);
router.get('/customer/:customerId', getIdentificationsByCustomer);

// PUT/PATCH routes
router.put('/:id/status', updateIdentificationStatus);
router.patch('/:id/primary', setAsPrimary);

// DELETE routes
router.delete('/:id', deleteIdentification);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'identification-service'
  });
});

export default router;