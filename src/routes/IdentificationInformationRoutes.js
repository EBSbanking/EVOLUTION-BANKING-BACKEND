// src/routes/IdentificationInformationRoutes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  uploadIdentification,
  getIdentifications,
  getIdentificationById,
  getIdentificationsByCustomer,
  approveCustomerDocuments,        // your single‑approval controller
  updateIdentificationStatus,
  setAsPrimary,
  deleteIdentification,
  getExpiringDocuments
} from '../controllers/IdentificationInformationController.js';
import { protect } from '../middlewares/authMiddleware.js';
// If you have a permission middleware, import it, otherwise skip or create a dummy
// import { authorizePermissions } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

console.log('🚀 Identification routes file loaded');

// Debug middleware
router.use((req, res, next) => {
  console.log('\n🔍 ========== INCOMING REQUEST ==========');
  console.log('🔍 URL:', req.method, req.originalUrl);
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    console.log('📦 Content-Length:', req.headers['content-length']);
  }
  next();
});

// ========== MULTER CONFIGURATION ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(process.cwd(), 'uploads', 'identifications');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, or PDF files are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

const handleMulterError = (err, req, res, next) => {
  console.error('❌ Multer error details:', {
    name: err.name,
    code: err.code,
    message: err.message,
    field: err.field
  });
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'File too large. Max 10MB.' });
    if (err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ success: false, message: 'Unexpected file field. Expected "image".' });
    return res.status(400).json({ success: false, message: `Multer error: ${err.message}` });
  }
  if (err) return res.status(400).json({ success: false, message: err.message });
  next();
};

// ========== PROTECT ALL ROUTES (authentication required) ==========
router.use(protect);

// ========== POST – UPLOAD IDENTIFICATION ==========
router.post('/upload', upload.single('image'), handleMulterError, uploadIdentification);

// ========== GET ROUTES ==========
router.get('/', getIdentifications);
router.get('/expiring', getExpiringDocuments);
router.get('/:id', getIdentificationById);
router.get('/customer/:customerId', getIdentificationsByCustomer);

// ========== PUT / PATCH / DELETE ==========
router.put('/:id/status', updateIdentificationStatus);
router.patch('/:id/primary', setAsPrimary);
router.delete('/:id', deleteIdentification);

// ✅ Single approval – document ID in URL (relative path, no duplicate prefix)
router.put('/approve/customer/:custId', protect, approveCustomerDocuments);
// If you have a permission middleware, add it: router.put('/:id/approve', protect, authorizePermissions('approve_identification'), approveIdentification);

// ========== HEALTH CHECK ==========
router.get('/health', (req, res) => res.status(200).json({ status: 'healthy' }));

export default router;