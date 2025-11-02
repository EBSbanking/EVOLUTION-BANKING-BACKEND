// routes/uploadTest.js
import express from 'express';
import multer from 'multer';

const router = express.Router();

// Ultra simple multer - no file filtering, no limits
const simpleUpload = multer({ 
  storage: multer.memoryStorage() 
});

// Test endpoint 1 - No validation
router.post('/test1', simpleUpload.single('customersFile'), (req, res) => {
  console.log('🔄 Test 1 - File received:', !!req.file);
  
  if (req.file) {
    console.log('✅ File details:', {
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype
    });
  }

  res.json({
    success: true,
    message: 'Test 1 completed',
    fileReceived: !!req.file,
    fileName: req.file?.originalname
  });
});

// Test endpoint 2 - With your exact config
router.post('/test2', (req, res, next) => {
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
      console.log('🔍 File filter check:', file.originalname);
      cb(null, true); // Always accept
    },
    limits: { fileSize: 50 * 1024 * 1024 }
  }).single('customersFile')(req, res, (err) => {
    if (err) {
      console.error('❌ Multer error:', err);
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, (req, res) => {
  res.json({
    success: true,
    message: 'Test 2 completed',
    fileReceived: !!req.file
  });
});

export default router;