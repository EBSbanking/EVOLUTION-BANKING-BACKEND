// src/routes/thriftRoutes.js - SIMPLIFIED VERSION
import express from 'express';
import ThriftController from '../controllers/ThriftController.js';
import { 
  getThrift, 
  getCustomer, 
  getTransaction,
  getSequelize,
  initializeModels 
} from '../models/index.js';
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

// ============================================
// HEALTH CHECK ROUTE
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
router.get('/search/customers', ThriftController.searchCustomersByName);
router.get('/search/thrift-accounts', ThriftController.searchThriftAccountsByName);
router.get('/search/quick', ThriftController.quickSearchForCollection);

// ============================================
// THRIFT ACCOUNT CREATION ROUTES
// ============================================
router.post('/accounts', ThriftController.createThriftAccount);
router.post('/accounts/existing-customer', ThriftController.createThriftAccountForExistingCustomer);

// ============================================
// COLLECTION PROCESSING ROUTES
// ============================================
router.post('/collections/daily', ThriftController.processDailyCollection);

// ============================================
// WITHDRAWAL ROUTES
// ============================================
router.post('/withdrawals/request', ThriftController.processWithdrawal);
router.post('/withdrawals/approve', ThriftController.approveWithdrawal);
router.get('/withdrawals/pending', ThriftController.getPendingWithdrawals);
router.get('/withdrawals/details/:transactionId', ThriftController.getWithdrawalApprovalDetails);

// ============================================
// ACCOUNT INFORMATION ROUTES
// ============================================
router.get('/accounts/:CUST_ID/:ACCT_NO/summary', ThriftController.getAccountSummary);
router.get('/accounts/customer/:customerId', ThriftController.getCustomerThriftAccounts);
router.get('/accounts', ThriftController.getAllThriftAccounts);
router.get('/accounts/:accountNo', ThriftController.getThriftAccount);
router.patch('/accounts/:accountNo/status', ThriftController.updateThriftStatus);
router.get('/accounts/:accountNo/transactions', ThriftController.getThriftTransactions);
router.get('/transactions/:CUST_ID?/:ACCT_NO?', ThriftController.getTransactionHistory);

export default router;