// src/routes/EMTLRoutes.js
import express from 'express';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';
import {
  EMTLPolicyService,
  EMTLCollectionService,
  EMTLRemittanceService,
  EMTLReceiptService,
  EMTLReportService
} from '../Services/index.js';
import transactionController from '../Services/postTransaction.js';
import {
  getEMTLConfig,
  updateEMTLConfig,
  getAuditTrail,
  getRemittanceReport as getAdminRemittanceReport
} from '../controllers/EMTLAdminController.js';

const router = express.Router();

// ✅ TEST ROUTE – verify mounting (endpoint: /emt/test)
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'EMTL router is mounted and working!' });
});

// ============================================================
// ✅ EMTL ROUTES - Transaction & Reporting
// ============================================================

// Public health check
router.get('/health', async (req, res) => {
  try {
    const policy = await EMTLPolicyService.getActivePolicy();
    return res.status(200).json({
      success: true,
      service: 'EMTL Services',
      status: 'healthy',
      policy: policy ? {
        id: policy.id,
        policy_code: policy.policy_code,
        enabled: policy.enabled,
        is_active: policy.is_active,
        levy_type: policy.levy_type,
        levy_amount: policy.levy_amount,
        threshold: policy.threshold
      } : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      service: 'EMTL Services',
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Reports (protected)
router.get('/report', protect, async (req, res) => {
  try {
    await transactionController.getEMTLReport(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/report/remittance', protect, async (req, res) => {
  try {
    await transactionController.getRemittanceReport(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Receipt
router.get('/receipt/:transactionId', protect, async (req, res) => {
  try {
    await transactionController.generateReceipt(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Remittance file (admin only)
router.get('/remittance/file', protect, isAdmin, async (req, res) => {
  try {
    await transactionController.generateRemittanceFile(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark collections as remitted (admin only)
router.post('/remittance/mark', protect, isAdmin, async (req, res) => {
  try {
    await transactionController.markCollectionsRemitted(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Collections (protected)
router.get('/collections/pending', protect, async (req, res) => {
  try {
    await transactionController.getPendingCollections(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/collections', protect, async (req, res) => {
  try {
    await transactionController.getCollectionsByDateRange(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/collections/account/:accountNo', protect, async (req, res) => {
  try {
    await transactionController.getCollectionsByAccount(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/collections/customer/:customerNo', protect, async (req, res) => {
  try {
    await transactionController.getCollectionsByCustomer(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Statistics (protected)
router.get('/statistics', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }
    const stats = await EMTLPolicyService.getStatistics(new Date(startDate), new Date(endDate));
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Weekly remittance report (admin only)
router.get('/remittance/weekly', protect, isAdmin, async (req, res) => {
  try {
    const report = await EMTLRemittanceService.generateWeeklyReport();
    return res.status(200).json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Remittance history (admin only)
router.get('/remittance/history', protect, isAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }
    const history = await EMTLRemittanceService.getRemittanceHistory(new Date(startDate), new Date(endDate));
    return res.status(200).json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// ✅ EMTL ADMIN CONFIGURATION ROUTES (admin only)
// ============================================================
// These are mounted at /emt/admin/config, /emt/admin/audit, etc.
router.get('/admin/config', protect, isAdmin, getEMTLConfig);
router.put('/admin/config', protect, isAdmin, updateEMTLConfig);
router.get('/admin/audit', protect, isAdmin, getAuditTrail);
router.get('/admin/remittance-report', protect, isAdmin, getAdminRemittanceReport);

export default router;