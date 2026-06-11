import express from 'express';
import Queue from 'bull';
import Redis from 'ioredis';
import { Op } from 'sequelize';

const router = express.Router();

// Redis connection with error handling
let redis;
let requestQueue;
let queueEnabled = false;

try {
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 2) {
        console.warn('⚠️ Redis unavailable - queue features disabled');
        return null;
      }
      return Math.min(times * 100, 1000);
    }
  });
  
  requestQueue = new Queue('requests', { redis });
  queueEnabled = true;
  
  // Process queue
  requestQueue.process('customer-search', 10, async (job) => {
    const { searchTerm } = job.data;
    const Customer = (await import('../models/Customer.js')).default;
    return await Customer.findAll({ 
      where: { name: { [Op.like]: `%${searchTerm}%` } },
      limit: 100
    });
  });
  
  console.log('✅ Queue system initialized');
} catch (error) {
  console.warn('⚠️ Queue system disabled:', error.message);
}

const queueRequest = (queueName) => {
  return async (req, res) => {
    if (!queueEnabled) {
      return res.status(503).json({
        success: false,
        message: 'Queue service unavailable - Redis not configured',
        fallback: true,
        suggestion: 'Install Redis or contact administrator'
      });
    }
    
    try {
      const job = await requestQueue.add(queueName, {
        searchTerm: req.body.searchTerm,
        timestamp: Date.now()
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
      });
      
      const result = await job.finished();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };
};

router.post('/customer-search', queueRequest('customer-search'));
router.get('/health', (req, res) => {
  res.json({ queueEnabled, redisConnected: queueEnabled });
});

export default router;