// In your routes file (e.g., routes/thrift.js)
import express from 'express';
import ThriftReportController from '../controllers/ThriftReportController.js';

const router = express.Router();

// Thrift Reports Routes
router.get('/reports/accounts', ThriftReportController.getThriftAccountsForReport);
router.get('/reports/accounts/download', ThriftReportController.generateThriftAccountsReport);

export default router;