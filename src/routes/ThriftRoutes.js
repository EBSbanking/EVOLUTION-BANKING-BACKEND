import express from 'express';
import ThriftController from '../controllers/ThriftController.js';

const router = express.Router();

// Debug middleware to log all requests
router.use((req, res, next) => {
  console.log(`[THRIFT ROUTE] ${req.method} ${req.originalUrl}`);
  next();
});

// Debug route to verify router is working
router.get('/debug', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Thrift routes are working!',
    availableEndpoints: [
      'POST /accounts - Create thrift account',
      'POST /collections/daily - Process daily collection',
      'POST /collections/weekly - Process weekly collection', 
      'POST /collections/monthly - Process monthly collection',
      'POST /withdrawals - Process withdrawal',
      'GET /accounts/:CUST_ID/:ACCT_NO/summary - Get account summary',
      'GET /accounts/:CUST_ID/:ACCT_NO/transactions - Get transaction history',
      'GET /customers/:CUST_ID/accounts - Get customer accounts',
      'GET /admin/accounts - Get all accounts (admin)'
    ],
    timestamp: new Date().toISOString()
  });
});

// Create new thrift account
router.post('/accounts', ThriftController.createThriftAccount);

// Process daily collection
router.post('/collections/daily', ThriftController.processDailyCollection);

// Process withdrawal from thrift account
router.post('/withdrawals', ThriftController.processWithdrawal);

// Get thrift account summary
router.get('/accounts/:CUST_ID/:ACCT_NO/summary', ThriftController.getAccountSummary);

// Get transaction history for thrift account
router.get('/accounts/:CUST_ID/:ACCT_NO/transactions', ThriftController.getTransactionHistory);

// Get all thrift accounts for a customer
router.get('/customers/:CUST_ID/accounts', ThriftController.getCustomerThriftAccounts);

// Additional routes for different collection types
router.post('/collections/weekly', ThriftController.processWeeklyCollection);
router.post('/collections/monthly', ThriftController.processMonthlyCollection);

// Admin routes
router.get('/admin/accounts', ThriftController.getAllThriftAccounts);
// router.get('/admin/collections/pending', ThriftController.getPendingCollections);
// router.post('/admin/collections/process-batch', ThriftController.processBatchCollections);

export default router;