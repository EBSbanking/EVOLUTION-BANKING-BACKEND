import express from 'express';
import {
  createApplication,
  createSimpleApplication,
  approveApplicationAndCreateAccount,
  handleMultipartForm,
  handleFormData,
  testUpload,
  testNoFiles,
  debugFormData,
  getAllApplications,
  getApplicationById,
  getApplicationsByCustomer,
  getPendingCount,
  approveByCustomer,
  updateApplicationByCustomer,
  approveApplicationByCustomer,
  rejectApplicationByCustomer,
  addDocumentsToApplication,
  getApplicationDocuments,
  deleteApplicationDocument,
  getApplicationByBu
} from '../controllers/AccountApplicationController.js';

const router = express.Router();

// ========================================
// HEALTH CHECK & DEBUG ENDPOINTS
// ========================================

/**
 * @route GET /api/account-applications/health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Account Application API is working',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      test: 'GET /test',
      routes: 'GET /routes',
      create: 'POST /create',
      createSimple: 'POST /create-simple',
      getAll: 'GET /all',
      getById: 'GET /:id',
      getByCustomer: 'GET /customer/:customerId',
      getByBranch: 'GET /by-bu/:bu_id',
      updateByCustomer: 'PATCH /customer/:customerId/update',
      approveByCustomer: 'POST /customer/:customerId/approve',
      rejectByCustomer: 'POST /customer/:customerId/reject',
      addDocuments: 'POST /customer/:customerId/documents',
      getDocuments: 'GET /customer/:customerId/documents',
      deleteDocument: 'DELETE /customer/:customerId/documents/:documentId',
      stats: 'GET /stats/pending-count'
    }
  });
});

/**
 * @route GET /api/account-applications/test
 * @desc Test endpoint
 * @access Public
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Account Application API test endpoint',
    timestamp: new Date().toISOString(),
    note: 'All endpoints are functional',
    serverTime: new Date().toLocaleString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * @route GET /api/account-applications/routes
 * @desc List all registered routes
 * @access Public
 */
router.get('/routes', (req, res) => {
  const routes = [];
  router.stack.forEach((layer) => {
    if (layer.route) {
      routes.push({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0].toUpperCase(),
        middleware: layer.route.stack.length
      });
    }
  });
  res.json({
    success: true,
    routes: routes,
    count: routes.length,
    timestamp: new Date().toISOString(),
    basePath: '/api/account-applications'
  });
});

// ========================================
// DEBUG ENDPOINTS
// ========================================

/**
 * @route POST /api/account-applications/debug
 * @desc Debug form data
 * @access Public
 */
router.post('/debug', debugFormData);

/**
 * @route POST /api/account-applications/test-no-files
 * @desc Test endpoint without files
 * @access Public
 */
router.post('/test-no-files', testNoFiles);

/**
 * @route POST /api/account-applications/test-upload
 * @desc Test file upload endpoint
 * @access Public
 */
router.post('/test-upload', handleMultipartForm, testUpload);

// ========================================
// APPLICATION RETRIEVAL ENDPOINTS
// ========================================

/**
 * @route GET /api/account-applications/all
 * @desc Get all applications with pagination
 * @access Private
 */
router.get('/all', getAllApplications);

/**
 * @route GET /api/account-applications/by-bu/:bu_id
 * @desc Get applications by branch ID
 * @access Private
 */
router.get('/by-bu/:bu_id', getApplicationByBu);

/**
 * @route GET /api/account-applications/:id
 * @desc Get application by ID
 * @access Private
 */
router.get('/:id', getApplicationById);

/**
 * @route GET /api/account-applications/customer/:customerId
 * @desc Get applications by customer ID
 * @access Private
 */
router.get('/customer/:customerId', getApplicationsByCustomer);

/**
 * @route GET /api/account-applications/stats/pending-count
 * @desc Get count of pending applications
 * @access Private
 */
router.get('/stats/pending-count', getPendingCount);

// ========================================
// APPLICATION CREATION ENDPOINTS
// ========================================

/**
 * @route POST /api/account-applications/create-simple
 * @desc Create application without file uploads
 * @access Private
 */
router.post('/create-simple', createSimpleApplication);

/**
 * @route POST /api/account-applications/create
 * @desc Create application with file uploads
 * @access Private
 */
router.post('/create', handleFormData, handleMultipartForm, createApplication);

// ========================================
// APPLICATION UPDATE ENDPOINTS
// ========================================

/**
 * @route PATCH /api/account-applications/customer/:customerId/update
 * @desc Update application by customer ID
 * @access Private
 */
router.patch(
  '/customer/:customerId/update',
  handleFormData,
  handleMultipartForm,
  updateApplicationByCustomer
);

// ========================================
// APPROVAL ENDPOINTS
// ========================================

/**
 * @route POST /api/account-applications/customer/:customerId/approve
 * @desc APPROVE application and create full account
 * @access Private
 * @description This endpoint creates customer_accounts and accounts entries
 */
router.post(
  '/customer/:customerId/approve',
  handleFormData,
  handleMultipartForm,
  approveApplicationAndCreateAccount
);

/**
 * @route POST /api/account-applications/approve-by-customer/:customerId
 * @desc Alternative approval endpoint (full account creation)
 * @access Private
 */
router.post(
  '/approve-by-customer/:customerId',
  handleFormData,
  handleMultipartForm,
  approveApplicationAndCreateAccount
);

/**
 * @route POST /api/account-applications/:id/approve
 * @desc Status-only approval (legacy, kept for compatibility)
 * @access Private
 */
router.post('/:id/approve', approveByCustomer);

// ========================================
// REJECTION ENDPOINTS
// ========================================

/**
 * @route POST /api/account-applications/customer/:customerId/reject
 * @desc Reject application by customer ID
 * @access Private
 */
router.post(
  '/customer/:customerId/reject',
  handleFormData,
  handleMultipartForm,
  rejectApplicationByCustomer
);

// ========================================
// DOCUMENT MANAGEMENT ENDPOINTS
// ========================================

/**
 * @route POST /api/account-applications/customer/:customerId/documents
 * @desc Add documents to application
 * @access Private
 */
router.post(
  '/customer/:customerId/documents',
  handleFormData,
  handleMultipartForm,
  addDocumentsToApplication
);

/**
 * @route GET /api/account-applications/customer/:customerId/documents
 * @desc Get documents for application
 * @access Private
 */
router.get('/customer/:customerId/documents', getApplicationDocuments);

/**
 * @route DELETE /api/account-applications/customer/:customerId/documents/:documentId
 * @desc Delete a document from application
 * @access Private
 */
router.delete('/customer/:customerId/documents/:documentId', deleteApplicationDocument);

// ========================================
// BULK OPERATIONS ENDPOINTS
// ========================================

/**
 * @route POST /api/account-applications/bulk-approve
 * @desc Bulk approve applications
 * @access Private
 * @example
 * Request Body:
 * {
 *   "applicationIds": [1, 2, 3],
 *   "approved_by": "Manager Name",
 *   "notes": "Bulk approval notes",
 *   "branch_id": "102"
 * }
 */
router.post('/bulk-approve', async (req, res) => {
  try {
    const { applicationIds, approved_by, notes, branch_id } = req.body;
    
    if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'applicationIds array is required'
      });
    }

    // Import the bulk approve controller
    const { bulkApproveApplications } = await import('../controllers/AccountApplicationController.js');
    
    // Call the bulk approve function
    const result = await bulkApproveApplications(req, res);
    return result;
  } catch (error) {
    console.error('❌ Bulk approve error:', error);
    return res.status(500).json({
      success: false,
      message: 'Bulk approval failed',
      details: error.message
    });
  }
});

/**
 * @route POST /api/account-applications/bulk-reject
 * @desc Bulk reject applications
 * @access Private
 * @example
 * Request Body:
 * {
 *   "applicationIds": [1, 2, 3],
 *   "rejected_by": "Manager Name",
 *   "rejection_reason": "Bulk rejection reason",
 *   "branch_id": "102"
 * }
 */
router.post('/bulk-reject', async (req, res) => {
  try {
    const { applicationIds, rejected_by, rejection_reason, branch_id } = req.body;
    
    if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'applicationIds array is required'
      });
    }

    if (!rejection_reason) {
      return res.status(400).json({
        success: false,
        message: 'rejection_reason is required for bulk reject'
      });
    }

    // Import the bulk reject controller
    const { bulkRejectApplications } = await import('../controllers/AccountApplicationController.js');
    
    // Call the bulk reject function
    const result = await bulkRejectApplications(req, res);
    return result;
  } catch (error) {
    console.error('❌ Bulk reject error:', error);
    return res.status(500).json({
      success: false,
      message: 'Bulk rejection failed',
      details: error.message
    });
  }
});

// ========================================
// 404 HANDLER FOR THIS ROUTER
// ========================================

/**
 * @route * (fallback)
 * @desc Handle 404 errors for undefined routes
 * @access Public
 */
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found in Account Application API: ${req.originalUrl}`,
    method: req.method,
    timestamp: new Date().toISOString(),
    suggestions: [
      "Check available routes at: GET /api/account-applications/routes",
      "Test API health at: GET /api/account-applications/health",
      "Review API documentation",
      "Make sure you're using the correct HTTP method"
    ],
    exampleEndpoints: [
      "GET /api/account-applications/health",
      "POST /api/account-applications/create",
      "PATCH /api/account-applications/customer/:customerId/update",
      "GET /api/account-applications/customer/:customerId",
      "POST /api/account-applications/customer/:customerId/approve",
      "POST /api/account-applications/customer/:customerId/reject"
    ],
    availableMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
    note: 'All POST and PATCH routes require proper authentication'
  });
});

export default router;