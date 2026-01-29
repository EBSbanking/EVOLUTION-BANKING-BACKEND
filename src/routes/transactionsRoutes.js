// src/routes/transactions.js
import express from 'express';
import { 
  createTransaction, 
  getAllTransactions, 
  getTransactionByAcctNo, 
  deleteTransaction,
  approveTransaction,
  createBulkTransactions
} from '../controllers/TransactionController.js';

const router = express.Router();

console.log('Transactions routes loaded');

// REGULAR ROUTES (always available)
router.post('/create', createTransaction);
router.get('/all', getAllTransactions);
router.post('/approved', approveTransaction);
router.get('/acct/:ACCT_NO', getTransactionByAcctNo);
router.delete('/delete/:id', deleteTransaction);
router.post('/bulk-posting', createBulkTransactions);

// ENCRYPTED ROUTE (dynamically loaded)
router.post('/process-encrypted', async (req, res, next) => {
  try {
    // Dynamically import the encryption middleware
    const module = await import('../middlewares/decryptPayload.js');
    const decryptPayload = module.decryptPayload;
    
    if (typeof decryptPayload !== 'function') {
      return res.status(500).json({
        error: 'Encryption middleware not available',
        type: typeof decryptPayload
      });
    }
    
    // Dynamically import the postTransaction service
    const { postTransaction } = await import('../Services/postTransaction.js');
    
    if (typeof postTransaction !== 'function') {
      return res.status(500).json({
        error: 'Transaction service not available',
        type: typeof postTransaction
      });
    }
    
    // Use both middleware and handler
    return decryptPayload(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          error: 'Decryption failed',
          message: err.message
        });
      }
      return postTransaction(req, res);
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load encrypted transaction route',
      message: error.message
    });
  }
});

// Encryption test endpoint
router.get('/encryption-test', async (req, res) => {
  try {
    const module = await import('../middlewares/decryptPayload.js');
    
    if (module.encryptionTest && typeof module.encryptionTest === 'function') {
      return module.encryptionTest(req, res);
    }
  } catch (error) {
    // Fall through to basic response
  }
  
  // Fallback response
  res.json({
    message: 'Transaction encryption status',
    encryptionAvailable: false,
    note: 'Encryption middleware not loaded',
    endpoints: {
      regular: [
        'POST /create',
        'GET /all', 
        'POST /approved',
        'GET /acct/:ACCT_NO',
        'DELETE /delete/:id', 
        'POST /bulk-posting'
      ],
      encrypted: 'POST /process-encrypted (may not work)'
    }
  });
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'transaction-api',
    routes: router.stack
      .filter(layer => layer.route)
      .map(layer => {
        const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(', ');
        return `${methods} ${layer.route.path}`;
      })
  });
});

///////////////////////////////
// In your transactions.js router
router.post('/process-encrypted-test', async (req, res) => {
  try {
    console.log('Test endpoint called - accepting plaintext');
    
    // Check if request is encrypted or plaintext
    const isEncrypted = req.body.encryptedData && req.body.iv;
    
    let payload;
    if (isEncrypted) {
      // Handle encrypted payload
      const module = await import('../middlewares/decryptPayload.js');
      const decryptPayload = module.decryptPayload;
      
      // Create a mock middleware chain
      return decryptPayload(req, res, async (err) => {
        if (err) {
          return res.status(400).json({
            error: 'Decryption failed in test endpoint',
            message: err.message
          });
        }
        
        // Now call the postTransaction service
        const { postTransaction } = await import('../Services/postTransaction.js');
        return postTransaction(req, res);
      });
    } else {
      // Plaintext - process directly
      console.log('Processing plaintext payload:', req.body);
      
      // Import and use postTransaction directly
      const { postTransaction } = await import('../Services/postTransaction.js');
      
      // Mock req.body for the service
      const mockReq = { ...req, body: req.body };
      const mockRes = {
        json: (data) => res.json(data),
        status: (code) => ({ json: (data) => res.status(code).json(data) })
      };
      
      return postTransaction(mockReq, mockRes);
    }
    
  } catch (error) {
    res.status(500).json({
      error: 'Test endpoint failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;