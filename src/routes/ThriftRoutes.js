// src/routes/thriftRoutes.js - CORRECTED
import express from 'express';
import ThriftController from '../controllers/ThriftController.js';
import { initializeModels } from '../models/index.js';   // removed getSequelize, getThrift, etc.
import logger from '../utils/logger.js';

const router = express.Router();

// Middleware to ensure models are initialized
router.use(async (req, res, next) => {
  try {
    await initializeModels();
    next();
  } catch (error) {
    logger.error('Failed to initialize models:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server initialization failed',
      error: error.message 
    });
  }
});

// Debug middleware
router.use((req, res, next) => {
  console.log(`📌 Thrift Route Hit: ${req.method} ${req.originalUrl}`);
  next();
});

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Thrift service is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ============================================
// SEARCH ROUTES
// ============================================
router.get('/search/customers', (req, res) => {
  console.log('📌 Search customers route hit');
  ThriftController.searchCustomersByName(req, res);
});

router.get('/search/thrift-accounts', (req, res) => {
  console.log('📌 Search thrift accounts route hit');
  ThriftController.searchThriftAccountsByName(req, res);
});

router.get('/search/quick', (req, res) => {
  console.log('📌 Quick search route hit');
  ThriftController.quickSearchForCollection(req, res);
});

// ============================================
// ACCOUNT CREATION
// ============================================
router.post('/accounts', (req, res) => {
  console.log('📌 Create thrift account route hit');
  ThriftController.createThriftAccount(req, res);
});

router.post('/accounts/existing-customer', (req, res) => {
  console.log('📌 Create thrift account for existing customer route hit');
  ThriftController.createThriftAccountForExistingCustomer(req, res);
});

// ============================================
// COLLECTIONS
// ============================================
router.post('/collections/daily', (req, res) => {
  console.log('📌 Process daily collection route hit');
  ThriftController.processDailyCollection(req, res);
});

// ============================================
// WITHDRAWALS
// ============================================
router.post('/withdrawals/request', (req, res) => {
  console.log('📌 Process withdrawal request route hit');
  ThriftController.processWithdrawal(req, res);
});

router.post('/withdrawals/approve', (req, res) => {
  console.log('📌 Approve withdrawal route hit');
  ThriftController.approveWithdrawal(req, res);
});

router.get('/withdrawals/pending', (req, res) => {
  console.log('📌 Get pending withdrawals route hit');
  ThriftController.getPendingWithdrawals(req, res);
});

router.get('/withdrawals/details/:transactionId', (req, res) => {
  console.log('📌 Get withdrawal details route hit');
  ThriftController.getWithdrawalApprovalDetails(req, res);
});

// ============================================
// ACCOUNT INFO & TRANSACTIONS
// ============================================
router.get('/accounts/:CUST_ID/:ACCT_NO/summary', (req, res) => {
  console.log('📌 Get account summary route hit');
  ThriftController.getAccountSummary(req, res);
});

router.get('/accounts/customer/:customerId', (req, res) => {
  console.log('📌 Get customer thrift accounts route hit');
  ThriftController.getThriftAccountsByCustomerId(req, res);
});

router.get('/accounts', (req, res) => {
  console.log('📌 Get all thrift accounts route hit');
  ThriftController.getThriftAccounts(req, res);
});

router.get('/accounts/:accountNo', (req, res) => {
  console.log('📌 Get thrift account by number route hit');
  ThriftController.getThriftAccountByNumber(req, res);
});

router.patch('/accounts/:accountNo/status', (req, res) => {
  console.log('📌 Update thrift status route hit');
  ThriftController.updateThriftStatus(req, res);
});

router.get('/accounts/:accountNo/transactions', (req, res) => {
  console.log('📌 Get thrift transactions route hit');
  ThriftController.getThriftTransactions(req, res);
});

router.get('/transactions/:CUST_ID?/:ACCT_NO?', (req, res) => {
  console.log('📌 Get transaction history route hit');
  ThriftController.getTransactionHistory(req, res);
});

// NEW ROUTE: Payment history by account number only
router.get('/accounts/:accountNo/payment-history', (req, res) => {
  console.log('📌 Get payment history by account number route hit');
  ThriftController.getPaymentHistoryByAccountNo(req, res);
});

export default router;