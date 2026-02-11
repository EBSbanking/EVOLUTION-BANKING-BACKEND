// routes/licenseRoutes.js
import express from 'express';
import multer from 'multer';
import {
  generateLicense,
  validateLicenseFile,
  getLicenseDetails,
  checkLicenseExists,
  getAllLicenses,
  deleteLicense,
  renewLicense,
  // New functions for direct validation
  validateLicense,
  activateLicense,
  getLicenseStatusPost,
  debugValidation,
  validateForLogin

} from '../controllers/LicenseController.js';

const router = express.Router();

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 // 1MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed'), false);
    }
  }
});

// ✅ Keep all your existing routes exactly as they were
router.post('/generate', generateLicense);
router.post('/validate', upload.single('licenseFile'), validateLicenseFile); // This is FILE validation
router.post('/details', getLicenseDetails);
router.get('/check', checkLicenseExists);
router.get('/all', getAllLicenses);
router.delete('/:id', deleteLicense);
router.put('/renew/:id', renewLicense);

// ✅ Add new routes for direct key validation (different endpoints)
router.post('/validate-key', validateLicense);          // POST /api/license/validate-key
router.post('/activate-key', activateLicense);          // POST /api/license/activate-key  
router.post('/key-status', getLicenseStatusPost);  // GET /api/license/key-status/:key

router.post('/validate-for-login', validateForLogin);




router.get('/debug-validation', debugValidation);

export default router;