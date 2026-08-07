// routes/cards.js

import express from 'express';
import {
  issueCard,
  cardPurchase,
  getCustomerCards,
  setDailyLimit,
  setPerTransactionLimit,
  setCardPin,
  blockCard,
  unblockCard,
  getCardTransactionHistory,
  getCardDetailsForPrinting,
  cardPayment
} from '../controllers/DebitCardController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ================================================================
// ✅ CARD ISSUANCE & MANAGEMENT
// ================================================================

/**
 * @route   POST /api/cards/issue
 * @desc    Issue a new card
 * @access  Private
 */
router.post('/cards/issue', authenticate, issueCard);

/**
 * @route   POST /api/cards/transaction
 * @desc    Process a card purchase transaction
 * @access  Private
 */
router.post('/cards/transaction', authenticate, cardPurchase);

/**
 * @route   GET /api/cards/customer/:customerId
 * @desc    Get all cards for a customer
 * @access  Private
 */
router.get('/cards/customer/:customerId', authenticate, getCustomerCards);

/**
 * @route   PUT /api/cards/daily-limit
 * @desc    Update daily limit for a card
 * @access  Private
 */
router.put('/cards/daily-limit', authenticate, setDailyLimit);

/**
 * @route   PUT /api/cards/per-transaction-limit
 * @desc    Update per-transaction limit for a card
 * @access  Private
 */
router.put('/cards/per-transaction-limit', authenticate, setPerTransactionLimit);

/**
 * @route   POST /api/cards/set-pin
 * @desc    Set PIN for a card
 * @access  Private
 */
router.post('/cards/set-pin', authenticate, setCardPin);

/**
 * @route   POST /api/cards/block
 * @desc    Block a card
 * @access  Private
 */
router.post('/cards/block', authenticate, blockCard);

/**
 * @route   POST /api/cards/unblock
 * @desc    Unblock a card
 * @access  Private
 */
router.post('/cards/unblock', authenticate, unblockCard);

/**
 * @route   GET /api/cards/transactions
 * @desc    Get card transaction history
 * @access  Private
 */
router.get('/cards/transactions', authenticate, getCardTransactionHistory);

// ================================================================
// ✅ FLUTTERWAVE CARD PAYMENT
// ================================================================

/**
 * @route   POST /api/cards/pay
 * @desc    Process a card payment via Flutterwave
 * @access  Private
 */
router.post('/cards/pay', authenticate, cardPayment);

/**
 * @route   POST /api/cards/pay/public
 * @desc    Process a card payment via Flutterwave (public - for testing)
 * @access  Public
 */
router.post('/cards/pay/public', cardPayment);

// ================================================================
// ✅ CARD PRINTING
// ================================================================

/**
 * @route   GET /api/cards/:identifier/details
 * @desc    Get full card details including decrypted CVV
 * @desc    Supports both cardId (numeric) and cardPan (alphanumeric)
 * @access  Private (requires debit_card.print permission)
 */
router.get('/cards/:identifier/details', authenticate, getCardDetailsForPrinting);

// ================================================================
// ✅ DEBUG ROUTES (Remove in production)
// ================================================================

/**
 * @route   GET /api/cards/debug/card
 * @desc    DEBUG: Get card by ID or last4
 * @access  Private
 */
router.get('/cards/debug/card', authenticate, async (req, res) => {
  try {
    const { id, last4, customerId } = req.query;
    let whereClause = {};
    
    if (id) {
      whereClause.id = id;
    } else if (last4) {
      whereClause.cardLast4 = last4;
      if (customerId) {
        whereClause.customerId = customerId;
      }
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Provide id or last4 (with customerId)' 
      });
    }
    
    const card = await DebitCard.findOne({
      where: whereClause,
      attributes: [
        'id', 'cardLast4', 'cardStatus', 'flutterwaveEnabled',
        'expiryMonth', 'expiryYear', 'customerId', 'encryptedCvv',
        'createdAt', 'updatedAt'
      ]
    });
    
    if (!card) {
      return res.status(404).json({ 
        success: false, 
        error: 'Card not found',
        debug: { whereClause }
      });
    }
    
    return res.status(200).json({
      success: true,
      data: card
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/cards/debug/customer/:customerId
 * @desc    DEBUG: Get all cards for a customer with full details
 * @access  Private
 */
router.get('/cards/debug/customer/:customerId', authenticate, async (req, res) => {
  try {
    const { customerId } = req.params;
    const cards = await DebitCard.findAll({
      where: { 
        customerId: customerId
      },
      attributes: [
        'id', 'cardLast4', 'cardStatus', 'flutterwaveEnabled',
        'expiryMonth', 'expiryYear', 'customerId', 'encryptedCvv',
        'createdAt', 'updatedAt'
      ]
    });
    
    return res.status(200).json({
      success: true,
      data: cards
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;