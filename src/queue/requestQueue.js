// src/queue/requestQueue.js
import Queue from 'bull';
import Redis from 'ioredis';

// Check if Redis should be used
const USE_REDIS = process.env.USE_REDIS === 'true';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

let redis = null;
let requestQueue = null;

// Only initialize Redis if explicitly enabled
if (USE_REDIS && REDIS_HOST && REDIS_HOST !== 'disabled') {
  try {
    redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.log('⚠️ Redis connection failed, disabling queue');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000);
      }
    });
    
    redis.on('error', (err) => {
      console.log('⚠️ Redis error, queue disabled:', err.message);
      requestQueue = null;
    });
    
    requestQueue = new Queue('requests', { redis });
    console.log('✅ Redis queue initialized');
  } catch (error) {
    console.log('⚠️ Failed to initialize Redis queue:', error.message);
    requestQueue = null;
  }
} else {
  console.log('⚠️ Redis queue disabled (USE_REDIS=false or REDIS_HOST=disabled)');
  requestQueue = null;
}

// Mock queue processor when Redis is disabled
class MockQueue {
  constructor() {
    console.log('📋 Using mock queue (no Redis)');
  }
  
  async add(queueName, data, options) {
    console.log(`📋 Mock queue: ${queueName} processed (Redis disabled)`);
    // Process the job immediately without queuing
    const result = await this.processJob(data);
    return { finished: () => Promise.resolve(result) };
  }
  
  async processJob(data) {
    // Handle different queue types
    if (data.searchTerm) {
      // Mock customer search
      return { success: true, data: [], message: 'Queue disabled - Redis not available' };
    }
    return { success: true, message: 'Queue processed (mock mode)' };
  }
  
  process(name, concurrency, handler) {
    // Store handler for mock processing
    this.handler = handler;
    return this;
  }
}

// Use mock queue if Redis is not available
const activeQueue = requestQueue || new MockQueue();

// Process queue with concurrency (only if real Redis is available)
if (requestQueue) {
  requestQueue.process('customer-search', 10, async (job) => {
    const { searchTerm } = job.data;
    // Process search
    const Customer = (await import('../models/Customer.js')).default;
    const { Op } = await import('sequelize');
    return await Customer.findAll({ 
      where: { name: { [Op.like]: `%${searchTerm}%` } } 
    });
  });
}

// Middleware to queue requests
export const queueRequest = (queueName) => {
  return async (req, res, next) => {
    // If queue is disabled, skip queuing and just call next
    if (!requestQueue) {
      console.log(`⚠️ Queue disabled, skipping queue for: ${queueName}`);
      return next(); // Skip queue and continue to next middleware
    }
    
    try {
      const job = await activeQueue.add(queueName, {
        method: req.method,
        url: req.url,
        body: req.body,
        query: req.query,
        timestamp: Date.now()
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
      });
      
      const result = await job.finished();
      res.json(result);
    } catch (error) {
      console.error('Queue error:', error.message);
      // Fall back to direct processing
      next();
    }
  };
};

// Export queue status for debugging
export const isQueueEnabled = () => !!requestQueue;
export default activeQueue;