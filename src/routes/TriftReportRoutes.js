// routes/thrift.js
import express from 'express';
import ThriftReportController from '../controllers/ThriftReportController.js';

const router = express.Router();

// Thrift Report Status & Metadata
router.get('/reports/status', ThriftReportController.getThriftReportStatus);

// Thrift Accounts Data (for display in UI)
router.get('/reports/accounts', ThriftReportController.getThriftAccountsForReport);

// Summary Statistics
router.get('/reports/summary', ThriftReportController.getThriftSummaryStatistics);

// Report Generation & Download
router.get('/reports/generate', ThriftReportController.generateThriftAccountsReport);

export default router;