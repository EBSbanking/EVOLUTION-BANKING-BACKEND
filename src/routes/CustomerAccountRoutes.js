// src/routes/CustomerAccountRoutes.js
import express from 'express';
import { 
  createCustomerAccount, 
  getAllCustomerAccounts, 
  updateCustomerAccount,
  deleteCustomerAccount,
  getCustomerAccountByCUST_ID,
  updateDormantAccounts,
  searchCustomersByName,
  getAccountByNumber,
  bulkActivateAccounts, 
  getAccountActivationHistory,
  // NEW: Approval workflow functions
  requestAccountActivation,
  requestAccountDeactivation,
  approveActivationRequest,
  approveDeactivationRequest,
  cancelDeactivationRequest,
  getPendingDeactivationRequests,
  getDeactivationRequestDetails,
  checkApprovalStatus,
  getAccountTransactionHistory,
  // These functions don't exist in your controller - removing them:
  // rejectDeactivationRequest,
  // getPendingApprovals,
  // getApprovalHistory,
  // cancelApprovalRequest
  // Direct activation/deactivation routes (commented out in controller)
  // activateCustomerAccount,
  // deactivateCustomerAccount
} from '../controllers/CustomerAccountController.js';

import logger from '../utils/logger.js'; 
import AuditTrail from '../models/AuditTrail.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { Op } from 'sequelize';

const router = express.Router();

// Debug endpoint
router.get('/debug-all-accounts', async (req, res) => {
  try {
    const accounts = await CustomerAccount.findAll();
    res.json({ total: accounts.length, sample: accounts.slice(0, 5).map(a => a.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Main routes
router.get('/accounts/:accountNumber', getAccountByNumber);
router.get('/customers-account/search/:name', searchCustomersByName);
router.post('/accounts', createCustomerAccount);
router.get('/accounts', getAllCustomerAccounts);
router.put('/accounts/:accountNumber', updateCustomerAccount);
router.delete('/accounts/:ACCT_NO', deleteCustomerAccount);
router.get('/customer/:CUST_ID', getCustomerAccountByCUST_ID);

router.get('/transactions/:accountNumber', getAccountTransactionHistory);

// ============================================
// DEPRECATED: Direct activation/deactivation routes (keep for backward compatibility)
// These functions are commented out in your controller
// ============================================
// router.patch('/accounts/:accountNumber/activate', activateCustomerAccount);
// router.patch('/accounts/:accountNumber/deactivate', deactivateCustomerAccount);

// ============================================
// NEW: Approval Workflow Routes
// ============================================

// 1. Account Activation Approval Workflow
router.post('/accounts/:accountNumber/request-activation', requestAccountActivation);
router.post('/:accountNumber/activation/approve', approveActivationRequest);

// 2. Account Deactivation Approval Workflow
router.post('/accounts/:accountNumber/request-deactivation', requestAccountDeactivation);
router.post('/:accountNumber/deactivation/approve', approveDeactivationRequest);
// Note: rejectDeactivationRequest doesn't exist in your controller
// router.post('/approvals/deactivation/:requestId/reject', rejectDeactivationRequest);
router.delete('/approvals/deactivation/:requestId/cancel', cancelDeactivationRequest);

// 3. Generic Approval Management (works for both activation and deactivation)
router.get('/approvals/:requestId/status', checkApprovalStatus);
// Note: These functions don't exist in your controller
// router.get('/approvals/pending', getPendingApprovals);
// router.get('/approvals/history', getApprovalHistory);
// router.delete('/approvals/:requestId/cancel', cancelApprovalRequest);

// 4. Deactivation-specific routes
router.get('/approvals/deactivation/pending', getPendingDeactivationRequests);
router.get('/approvals/deactivation/:requestId/details', getDeactivationRequestDetails);

// ============================================
// Bulk Operations
// ============================================
router.post('/accounts/bulk-activate', bulkActivateAccounts);
router.get('/accounts/:ACCT_NO/activation-history', getAccountActivationHistory);

// ============================================
// Transaction History
// ============================================
router.get('/transactions/:ACCT_NO', async (req, res) => {
  const { ACCT_NO } = req.params;

  if (!/^\d{10}$/.test(ACCT_NO)) {
    return res.status(400).json({ success: false, message: 'Invalid account number format' });
  }

  try {
    const transactions = await AuditTrail.findAll({
      where: {
        account_no: ACCT_NO,
        event_type: { [Op.in]: ['TRANSACTION_DR', 'TRANSACTION_CR'] }
      },
      order: [['timestamp', 'DESC']],
    });

    res.json({
      success: true,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    logger.error('Transaction history fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================
// System Maintenance Routes
// ============================================
router.post('/system/update-dormant', updateDormantAccounts);

// ============================================
// Health Check and Monitoring
// ============================================
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Customer Account API',
    version: '2.0.0',
    features: {
      approval_workflow: true,
      two_level_approval: true,
      audit_trail: true
    }
  });
});

// ============================================
// Route Documentation (for API documentation)
// ============================================
router.get('/routes', (req, res) => {
  const routes = [
    // Account Management
    { method: 'GET', path: '/api/accounts/:accountNumber', description: 'Get account by number' },
    { method: 'POST', path: '/api/accounts', description: 'Create new account' },
    { method: 'PUT', path: '/api/accounts/:accountNumber', description: 'Update account' },
    { method: 'DELETE', path: '/api/accounts/:ACCT_NO', description: 'Delete account' },
    { method: 'GET', path: '/api/accounts', description: 'Get all accounts' },
    { method: 'GET', path: '/api/customer/:CUST_ID', description: 'Get accounts by customer ID' },
    
    // Search
    { method: 'GET', path: '/api/customers-account/search/:name', description: 'Search accounts by customer name' },
    
    // Activation Workflow
    { method: 'POST', path: '/api/accounts/:accountNumber/request-activation', description: 'Request account activation (requires approval)' },
    { method: 'POST', path: '/api/approvals/activation/:requestId/approve', description: 'Approve activation request' },
    
    // Deactivation Workflow
    { method: 'POST', path: '/api/accounts/:accountNumber/request-deactivation', description: 'Request account deactivation (requires approval)' },
    { method: 'POST', path: '/api/approvals/deactivation/:requestId/approve', description: 'Approve deactivation request' },
    { method: 'DELETE', path: '/api/approvals/deactivation/:requestId/cancel', description: 'Cancel deactivation request' },
    
    // Approval Management
    { method: 'GET', path: '/api/approvals/:requestId/status', description: 'Check approval request status' },
    { method: 'GET', path: '/api/approvals/deactivation/pending', description: 'Get pending deactivation requests' },
    { method: 'GET', path: '/api/approvals/deactivation/:requestId/details', description: 'Get deactivation request details' },
    
    // Bulk Operations
    { method: 'POST', path: '/api/accounts/bulk-activate', description: 'Bulk activate accounts' },
    { method: 'GET', path: '/api/accounts/:ACCT_NO/activation-history', description: 'Get account activation history' },
    
    // Transaction History
    { method: 'GET', path: '/api/transactions/:ACCT_NO', description: 'Get account transaction history' },
    
    // System
    { method: 'POST', path: '/api/system/update-dormant', description: 'Update dormant accounts (system admin only)' },
    
    // Debug
    { method: 'GET', path: '/api/debug-all-accounts', description: 'Debug endpoint to see all accounts' },
    
    // Health
    { method: 'GET', path: '/api/health', description: 'API health check' },
    
    // Documentation
    { method: 'GET', path: '/api/routes', description: 'Get all available routes' }
  ];
  
  res.json({
    success: true,
    routes,
    note: 'All approval workflow routes require authentication and proper role permissions'
  });
});

export default router;