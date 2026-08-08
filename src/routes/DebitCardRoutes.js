// routes/debitCardRoutes.js
import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  // Card Issuance (Approval Workflow)
  requestCardIssuance,
  issueCard,
  issueCardDirectly,
  executeCardIssuanceFromApproval,
  
  // Card Management
  getCustomerCards,
  getCardDetailsForPrinting,
  setDailyLimit,
  setPerTransactionLimit,
  setCardPin,
  blockCard,
  unblockCard,
  getCardTransactionHistory,
  
  // Flutterwave Payments
  cardPayment,
  verifyFlutterwavePayment,
  refundFlutterwavePayment,
  getFlutterwaveTransactionStatus,
  listFlutterwaveTransactions,
  flutterwaveHealthCheck,
  
  // Card Purchase
  cardPurchase,
} from '../controllers/DebitCardController.js';

const router = express.Router();

// ============================================
// CARD ISSUANCE - APPROVAL WORKFLOW
// ============================================

/**
 * POST /api/debit-cards/cards/request-issuance
 * @description Request card issuance with approval workflow
 * @access Authenticated users
 */
router.post('/cards/request-issuance', authenticate, requestCardIssuance);

/**
 * POST /api/debit-cards/cards/issue
 * @description Direct card issuance (kept for backward compatibility)
 * @access Authenticated users with proper permissions
 */
router.post('/cards/issue', authenticate, issueCard);

/**
 * POST /api/debit-cards/cards/issue-direct
 * @description Direct card issuance bypassing approval (admin only)
 * @access Admin only
 */
router.post('/cards/issue-direct', authenticate, issueCardDirectly);

// ============================================
// CARD MANAGEMENT
// ============================================

/**
 * GET /api/debit-cards/cards/customer/:customerId
 * @description Get all cards for a customer
 * @access Authenticated users
 */
router.get('/cards/customer/:customerId', authenticate, getCustomerCards);

/**
 * GET /api/debit-cards/cards/:identifier/details
 * @description Get card details for printing (includes CVV)
 * @access Users with debit_card.print permission
 */
router.get('/cards/:identifier/details', authenticate, getCardDetailsForPrinting);

/**
 * PUT /api/debit-cards/cards/daily-limit
 * @description Set daily spending limit for a card
 * @access Authenticated users
 */
router.put('/cards/daily-limit', authenticate, setDailyLimit);

/**
 * PUT /api/debit-cards/cards/per-transaction-limit
 * @description Set per-transaction limit for a card
 * @access Authenticated users
 */
router.put('/cards/per-transaction-limit', authenticate, setPerTransactionLimit);

/**
 * PUT /api/debit-cards/cards/pin
 * @description Set PIN for a card
 * @access Authenticated users
 */
router.put('/cards/pin', authenticate, setCardPin);

/**
 * POST /api/debit-cards/cards/block
 * @description Block a card
 * @access Authenticated users
 */
router.post('/cards/block', authenticate, blockCard);

/**
 * POST /api/debit-cards/cards/unblock
 * @description Unblock a card
 * @access Authenticated users
 */
router.post('/cards/unblock', authenticate, unblockCard);

/**
 * GET /api/debit-cards/cards/transactions
 * @description Get card transaction history
 * @access Authenticated users
 */
router.get('/cards/transactions', authenticate, getCardTransactionHistory);

// ============================================
// FLUTTERWAVE PAYMENTS
// ============================================

/**
 * POST /api/debit-cards/payments/charge
 * @description Initiate a card payment via Flutterwave
 * @access Authenticated users
 */
router.post('/payments/charge', authenticate, cardPayment);

/**
 * GET /api/debit-cards/payments/verify/:reference
 * @description Verify a Flutterwave payment
 * @access Authenticated users
 */
router.get('/payments/verify/:reference', authenticate, verifyFlutterwavePayment);

/**
 * POST /api/debit-cards/payments/refund
 * @description Refund a Flutterwave payment
 * @access Authenticated users with proper permissions
 */
router.post('/payments/refund', authenticate, refundFlutterwavePayment);

/**
 * GET /api/debit-cards/payments/status/:reference
 * @description Get Flutterwave transaction status
 * @access Authenticated users
 */
router.get('/payments/status/:reference', authenticate, getFlutterwaveTransactionStatus);

/**
 * GET /api/debit-cards/payments/transactions
 * @description List Flutterwave transactions
 * @access Authenticated users with proper permissions
 */
router.get('/payments/transactions', authenticate, listFlutterwaveTransactions);

/**
 * GET /api/debit-cards/payments/health
 * @description Flutterwave health check
 * @access Public
 */
router.get('/payments/health', flutterwaveHealthCheck);

// ============================================
// CARD PURCHASE
// ============================================

/**
 * POST /api/debit-cards/purchase
 * @description Process a card purchase transaction
 * @access Authenticated users
 */
router.post('/purchase', authenticate, cardPurchase);

// ============================================
// EXPORT ROUTER
// ============================================

export default router;