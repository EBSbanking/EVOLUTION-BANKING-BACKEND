// src/routes/EncryptionRoutes.js (SIMPLE FIX)
import express from 'express';

const router = express.Router();

console.log('EncryptionRoutes loaded (safe mode)');

// Basic test endpoint
router.get('/test', (req, res) => {
  res.json({
    message: 'Encryption API is running in safe mode',
    status: 'active',
    note: 'Full encryption features disabled due to initialization issues'
  });
});

// Dynamic decryption endpoint
router.post('/decrypt', async (req, res) => {
  try {
    const module = await import('../middlewares/decryptPayload.js');
    const { decryptPayload } = module;
    
    if (typeof decryptPayload === 'function') {
      // Create a wrapper to handle the middleware
      return new Promise((resolve, reject) => {
        decryptPayload(req, res, (err) => {
          if (err) {
            res.status(400).json({
              error: 'Decryption failed',
              message: err.message
            });
            resolve();
          } else if (req.decryptedData) {
            res.json({
              success: true,
              decryptedData: req.decryptedData,
              metadata: req.encryptionMetadata
            });
            resolve();
          } else {
            res.status(500).json({
              error: 'Decryption completed but no data',
              note: 'Middleware may not be working correctly'
            });
            resolve();
          }
        });
      });
    } else {
      res.status(500).json({
        error: 'Decryption middleware not available',
        type: typeof decryptPayload
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load decryption module',
      message: error.message
    });
  }
});

export default router;