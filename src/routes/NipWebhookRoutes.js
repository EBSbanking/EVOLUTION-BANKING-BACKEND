// src/routes/NipWebhookRoutes.js
import express from 'express';
import NIPWebhook from '../webhooks/NipWebhook.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Stricter rate limiting for NIP endpoints (financial transactions)
const nipLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: { 
    SessionID: null,
    ResponseCode: '96',
    ResponseDescription: 'Rate limit exceeded. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply stricter rate limiting to all NIP routes
router.use(nipLimiter);

// Initialize NIP webhook handler
const nipWebhook = new NIPWebhook();

// ===========================================
// NIP STANDARD ENDPOINTS
// ===========================================

/**
 * NIP Funds Transfer (Single Item)
 * POST /api/nip-webhook/fundtransfer
 */
router.post('/fundtransfer', async (req, res, next) => {
  try {
    await nipWebhook.handleNIPFundsTransfer(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * NIP Name Enquiry (Single Item)
 * POST /api/nip-webhook/nameenquiry
 */
router.post('/nameenquiry', async (req, res, next) => {
  try {
    await nipWebhook.handleNIPNameEnquiry(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * NIP Transaction Status Enquiry
 * POST /api/nip-webhook/statusenquiry
 */
router.post('/statusenquiry', async (req, res, next) => {
  try {
    await nipWebhook.handleNIPStatusEnquiry(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * NIP Funds Transfer Reversal
 * POST /api/nip-webhook/reversal
 */
router.post('/reversal', async (req, res, next) => {
  try {
    await nipWebhook.handleNIPReversal(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * NIP Financial Institution List
 * POST /api/nip-webhook/institutionlist
 */
router.post('/institutionlist', async (req, res, next) => {
  try {
    await nipWebhook.handleFinancialInstitutionList(req, res);
  } catch (error) {
    next(error);
  }
});

// ===========================================
// NIP BATCH ENDPOINTS (if needed)
// ===========================================

/**
 * NIP Bulk Funds Transfer
 * POST /api/nip-webhook/bulkfundtransfer
 */
router.post('/bulkfundtransfer', async (req, res, next) => {
  try {
    // You would need to implement this in your NIPWebhook class
    await nipWebhook.handleNIPBulkFundsTransfer?.(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * NIP Bulk Name Enquiry
 * POST /api/nip-webhook/bulknameenquiry
 */
router.post('/bulknameenquiry', async (req, res, next) => {
  try {
    // You would need to implement this in your NIPWebhook class
    await nipWebhook.handleNIPBulkNameEnquiry?.(req, res);
  } catch (error) {
    next(error);
  }
});

// ===========================================
// HEALTH & MONITORING
// ===========================================

/**
 * NIP Webhook Health Check
 * GET /api/nip-webhook/health
 */
router.get('/health', async (req, res, next) => {
  try {
    await nipWebhook.healthCheck(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * NIP Webhook Metrics (if implemented)
 * GET /api/nip-webhook/metrics
 */
router.get('/metrics', async (req, res, next) => {
  try {
    const metrics = await nipWebhook.getMetrics?.() || {
      status: 'Metrics not implemented',
      timestamp: new Date().toISOString()
    };
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

// ===========================================
// ERROR HANDLING FOR NIP ROUTES
// ===========================================

// Error handler specific to NIP routes
router.use((err, req, res, next) => {
  console.error('NIP Webhook Error:', {
    path: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack,
    body: req.body
  });

  // Return NIP-compliant error response
  res.status(200).json({
    SessionID: req.body?.SessionID || null,
    DestinationInstitutionCode: process.env.NIP_INSTITUTION_CODE || '',
    ChannelCode: req.body?.ChannelCode || null,
    ResponseCode: '96',
    ResponseDescription: 'System error occurred',
    ...(req.path.includes('fundtransfer') && {
      PaymentReference: req.body?.PaymentReference || null
    }),
    ...(req.path.includes('nameenquiry') && {
      AccountNumber: req.body?.AccountNumber || null
    })
  });
});

export default router;