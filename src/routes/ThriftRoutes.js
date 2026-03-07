// src/routes/thriftRoutes.js - UPDATED VERSION
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

// Debug middleware to log all requests
router.use((req, res, next) => {
  console.log(`📌 Thrift Route Hit: ${req.method} ${req.originalUrl}`);
  next();
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
router.get('/search/customers', (req, res) => {
  console.log('📌 Search customers route hit');
  if (typeof ThriftController.searchCustomersByName === 'function') {
    ThriftController.searchCustomersByName(req, res);
  } else {
    res.status(500).json({ success: false, message: 'searchCustomersByName not implemented' });
  }
});

router.get('/search/thrift-accounts', (req, res) => {
  console.log('📌 Search thrift accounts route hit');
  if (typeof ThriftController.searchThriftAccountsByName === 'function') {
    ThriftController.searchThriftAccountsByName(req, res);
  } else {
    res.status(500).json({ success: false, message: 'searchThriftAccountsByName not implemented' });
  }
});

router.get('/search/quick', (req, res) => {
  console.log('📌 Quick search route hit');
  if (typeof ThriftController.quickSearchForCollection === 'function') {
    ThriftController.quickSearchForCollection(req, res);
  } else {
    res.status(500).json({ success: false, message: 'quickSearchForCollection not implemented' });
  }
});

// ============================================
// THRIFT ACCOUNT CREATION ROUTES
// ============================================
router.post('/accounts', (req, res) => {
  console.log('📌 Create thrift account route hit');
  console.log('Request body:', req.body);
  
  if (typeof ThriftController.createThriftAccount === 'function') {
    ThriftController.createThriftAccount(req, res);
  } else {
    console.error('❌ createThriftAccount is not a function!', ThriftController);
    res.status(500).json({ 
      success: false, 
      message: 'createThriftAccount method not found in controller',
      controllerKeys: Object.keys(ThriftController)
    });
  }
});

router.post('/accounts/existing-customer', (req, res) => {
  console.log('📌 Create thrift account for existing customer route hit');
  if (typeof ThriftController.createThriftAccountForExistingCustomer === 'function') {
    ThriftController.createThriftAccountForExistingCustomer(req, res);
  } else {
    res.status(500).json({ success: false, message: 'createThriftAccountForExistingCustomer not implemented' });
  }
});

// ============================================
// COLLECTION PROCESSING ROUTES
// ============================================
router.post('/collections/daily', (req, res) => {
  console.log('📌 Process daily collection route hit');
  if (typeof ThriftController.processDailyCollection === 'function') {
    ThriftController.processDailyCollection(req, res);
  } else {
    res.status(500).json({ success: false, message: 'processDailyCollection not implemented' });
  }
});

// ============================================
// WITHDRAWAL ROUTES
// ============================================
router.post('/withdrawals/request', (req, res) => {
  console.log('📌 Process withdrawal request route hit');
  if (typeof ThriftController.processWithdrawal === 'function') {
    ThriftController.processWithdrawal(req, res);
  } else {
    res.status(500).json({ success: false, message: 'processWithdrawal not implemented' });
  }
});

router.post('/withdrawals/approve', (req, res) => {
  console.log('📌 Approve withdrawal route hit');
  if (typeof ThriftController.approveWithdrawal === 'function') {
    ThriftController.approveWithdrawal(req, res);
  } else {
    res.status(500).json({ success: false, message: 'approveWithdrawal not implemented' });
  }
});

router.get('/withdrawals/pending', (req, res) => {
  console.log('📌 Get pending withdrawals route hit');
  if (typeof ThriftController.getPendingWithdrawals === 'function') {
    ThriftController.getPendingWithdrawals(req, res);
  } else {
    res.status(500).json({ success: false, message: 'getPendingWithdrawals not implemented' });
  }
});

router.get('/withdrawals/details/:transactionId', (req, res) => {
  console.log('📌 Get withdrawal details route hit');
  if (typeof ThriftController.getWithdrawalApprovalDetails === 'function') {
    ThriftController.getWithdrawalApprovalDetails(req, res);
  } else {
    res.status(500).json({ success: false, message: 'getWithdrawalApprovalDetails not implemented' });
  }
});

// ============================================
// ACCOUNT INFORMATION ROUTES
// ============================================
router.get('/accounts/:CUST_ID/:ACCT_NO/summary', (req, res) => {
  console.log('📌 Get account summary route hit');
  if (typeof ThriftController.getAccountSummary === 'function') {
    ThriftController.getAccountSummary(req, res);
  } else {
    res.status(500).json({ success: false, message: 'getAccountSummary not implemented' });
  }
});

// FIXED: Changed from getCustomerThriftAccounts to getThriftAccountsByCustomerId
router.get('/accounts/customer/:customerId', (req, res) => {
  console.log('📌 Get customer thrift accounts route hit');
  if (typeof ThriftController.getThriftAccountsByCustomerId === 'function') {
    ThriftController.getThriftAccountsByCustomerId(req, res);
  } else {
    res.status(500).json({ success: false, message: 'getThriftAccountsByCustomerId not implemented' });
  }
});

router.get('/accounts', (req, res) => {
  console.log('📌 Get all thrift accounts route hit');
  if (typeof ThriftController.getThriftAccounts === 'function') {
    ThriftController.getThriftAccounts(req, res);
  } else {
    res.status(500).json({ success: false, message: 'getThriftAccounts not implemented' });
  }
});

// FIXED: Changed from getThriftAccount to getThriftAccountByNumber
router.get('/accounts/:accountNo', (req, res) => {
  console.log('📌 Get thrift account by number route hit');
  if (typeof ThriftController.getThriftAccountByNumber === 'function') {
    ThriftController.getThriftAccountByNumber(req, res);
  } else {
    res.status(500).json({ success: false, message: 'getThriftAccountByNumber not implemented' });
  }
});

router.patch('/accounts/:accountNo/status', (req, res) => {
  console.log('📌 Update thrift status route hit');
  if (typeof ThriftController.updateThriftStatus === 'function') {
    ThriftController.updateThriftStatus(req, res);
  } else {
    res.status(500).json({ success: false, message: 'updateThriftStatus not implemented' });
  }
});

router.get('/accounts/:accountNo/transactions', (req, res) => {
  console.log('📌 Get thrift transactions route hit');
  if (typeof ThriftController.getThriftTransactions === 'function') {
    ThriftController.getThriftTransactions(req, res);
  } else {
    res.status(500).json({ success: false, message: 'getThriftTransactions not implemented' });
  }
});

router.get('/transactions/:CUST_ID?/:ACCT_NO?', (req, res) => {
  console.log('📌 Get transaction history route hit');
  if (typeof ThriftController.getTransactionHistory === 'function') {
    ThriftController.getTransactionHistory(req, res);
  } else {
    res.status(500).json({ success: false, message: 'getTransactionHistory not implemented' });
  }
});

export default router;