import express from 'express';
import multer from 'multer';
import {
  generateLicense,
  validateLicenseFile,
  getLicenseDetails
} from '../controllers/LicenseController.js';

const router = express.Router();

// Multer setup (in-memory, limit, filter)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024, // 1MB max
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed'), false);
    }
  }
}).single('licenseFile');

// Middleware for upload errors
const handleFileUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File too large (max 1MB)' });
      }
      if (err.message === 'Only .txt files are allowed') {
        return res.status(415).json({ message: 'Only .txt files are accepted' });
      }
      if (err.message === 'Unexpected end of form') {
        return res.status(400).json({ message: 'Malformed file upload' });
      }
      return res.status(400).json({ message: 'File upload failed', error: err.message });
    }
    next();
  });
};

// Routes
router.post('/generate', generateLicense);

// Dual-mode validator: file upload or raw encryptedKey
router.post('/validate-file',
  (req, res, next) => {
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      return handleFileUpload(req, res, next);
    }
    next();
  },
  validateLicenseFile
);

router.get('/details', getLicenseDetails);

export default router;
