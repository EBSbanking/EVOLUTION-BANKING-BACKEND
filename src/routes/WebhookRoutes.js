// src/routes/WebhookRoutes.js
import express from 'express';
import webhookController from '../controllers/WebhookController.js';
import nipWebhookRoutes from './NipWebhookRoutes.js';
// Fix the import path - from 'middlewares' to 'middleware'
import { authenticateWebhook } from '../middlewares/authMiddleware.js';
import rateLimit from 'express-rate-limit';

// Try to import XML parser, fallback to custom parser if not available
let xmlParser;
try {
  xmlParser = (await import('express-xml-bodyparser')).default;
} catch (error) {
  console.warn('express-xml-bodyparser not found, using custom XML parser');
  try {
    const { default: customXmlParser } = await import('../middleware/xmlParser.js');
    xmlParser = customXmlParser;
  } catch (importError) {
    console.warn('Custom XML parser not found, using simple parser');
    xmlParser = () => (req, res, next) => next();
  }
}

// Try to import CSV parser
let csvParser;
try {
  csvParser = (await import('../middleware/csvParser.js')).default;
} catch (error) {
  console.warn('CSV parser not found, creating simple parser');
  csvParser = (req, res, next) => {
    if (req.is('text/csv') || req.is('csv')) {
      const csvString = req.body?.toString() || '';
      const lines = csvString.split('\n');
      const headers = lines[0].split(',');
      const result = [];
      
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const obj = {};
        const currentline = lines[i].split(',');
        
        for (let j = 0; j < headers.length; j++) {
          obj[headers[j].trim()] = currentline[j]?.trim();
        }
        result.push(obj);
      }
      
      req.body = result;
    }
    next();
  };
}

const router = express.Router();

// Rate limiting for webhooks
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many webhook requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all webhook routes
router.use(webhookLimiter);

// Optional: Authenticate webhooks if needed
// Uncomment this when authenticateWebhook is properly exported
// router.use(authenticateWebhook);

// ===========================================
// MAIN WEBHOOK ENDPOINTS
// ===========================================

// Main webhook endpoint - handles all gateway types
router.post('/webhook', webhookController.handleWebhook);

// Specific webhook endpoints for backward compatibility
router.post('/webhook/json', webhookController.handleJsonWebhook);
router.post('/webhook/xml', xmlParser(), webhookController.handleXmlWebhook);
router.post('/webhook/csv', csvParser, webhookController.handleCsvWebhook);

// Simple webhook for backward compatibility
router.post('/webhook/simple', webhookController.simpleWebhook);

// Health check
router.get('/webhook/health', webhookController.healthCheck);

// ===========================================
// NIP WEBHOOK ENDPOINTS (via controller)
// ===========================================

// NIP specific endpoints using the controller
router.post('/nip/fund-transfer', webhookController.handleNIPFundsTransfer);
router.post('/nip/name-enquiry', webhookController.handleNIPNameEnquiry);
router.post('/nip/status-enquiry', webhookController.handleNIPStatusEnquiry);
router.post('/nip/reversal', webhookController.handleNIPReversal);

// ===========================================
// DEDICATED NIP ROUTES
// ===========================================
router.use('/nip-webhook', nipWebhookRoutes);

// ===========================================
// ADDITIONAL NIP COMPATIBILITY ENDPOINTS
// ===========================================

// NIP alternative paths
router.post('/nip/fundtransfer', (req, res, next) => {
  req.url = '/nip-webhook/fundtransfer';
  router.handle(req, res, next);
});

router.post('/nip/nameenquiry', (req, res, next) => {
  req.url = '/nip-webhook/nameenquiry';
  router.handle(req, res, next);
});

router.post('/nip/statusenquiry', (req, res, next) => {
  req.url = '/nip-webhook/statusenquiry';
  router.handle(req, res, next);
});

router.post('/nip/reversal-alternative', (req, res, next) => {
  req.url = '/nip-webhook/reversal';
  router.handle(req, res, next);
});

router.post('/nip/institutionlist', (req, res, next) => {
  req.url = '/nip-webhook/institutionlist';
  router.handle(req, res, next);
});

// ===========================================
// BATCH PROCESSING ENDPOINTS
// ===========================================

router.post('/webhook/batch/json', (req, res, next) => {
  req.body._batch = true;
  req.body.gateway = 'json';
  webhookController.handleJsonWebhook(req, res, next);
});

router.post('/webhook/batch/xml', xmlParser(), (req, res, next) => {
  req.body._batch = true;
  req.body.gateway = 'xml';
  webhookController.handleXmlWebhook(req, res, next);
});

router.post('/webhook/batch/csv', csvParser, (req, res, next) => {
  req.body._batch = true;
  req.body.gateway = 'csv';
  webhookController.handleCsvWebhook(req, res, next);
});

// ===========================================
// WEBHOOK CONFIGURATION ENDPOINTS
// ===========================================

router.get('/webhook/config', (req, res) => {
  res.json({
    supportedGateways: ['json', 'xml', 'csv', 'nip', 'paypal', 'stripe', 'flutterwave', 'paystack'],
    rateLimiting: {
      windowMs: 15 * 60 * 1000,
      max: 100
    },
    authentication: !!process.env.WEBHOOK_SECRET,
    version: '1.0.0'
  });
});

router.post('/webhook/validate', (req, res) => {
  const { gateway } = req.body;
  
  if (!gateway) {
    return res.status(400).json({
      valid: false,
      error: 'Gateway type not specified'
    });
  }

  res.json({
    gateway,
    valid: true,
    requiredFields: ['xferRef', 'beneficiary.account']
  });
});

// ===========================================
// LEGACY/CATCH-ALL ENDPOINTS
// ===========================================

router.post('/webhook/:type', (req, res) => {
  const { type } = req.params;
  console.warn(`Deprecated endpoint /webhook/${type} used. Please use /webhook with gateway parameter.`);
  req.body.gateway = type;
  webhookController.handleWebhook(req, res);
});

router.all('/webhook/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Webhook endpoint not found',
    availableEndpoints: [
      'POST /webhook - Main webhook endpoint',
      'POST /webhook/json - JSON webhook',
      'POST /webhook/xml - XML webhook',
      'POST /webhook/csv - CSV webhook',
      'POST /nip/fund-transfer - NIP funds transfer',
      'GET /webhook/health - Health check'
    ]
  });
});

export default router;