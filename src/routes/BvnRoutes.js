// src/routes/BvnRoutes.js
import express from 'express';
import { verifyBVN, healthCheck } from '../controllers/BvnController.js';

const router = express.Router();

// Add a test route to verify the router is working
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'BVN router is working',
    timestamp: new Date().toISOString()
  });
});

// Health check
router.get('/health', healthCheck);

// BVN verification
router.post('/bvn/verify', verifyBVN);

export default router;