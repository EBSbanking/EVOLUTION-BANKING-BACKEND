import express from 'express';
import {
  createApplication,
  createSimpleApplication,
  approveApplicationAndCreateAccount,   // ✅ full account creation
  handleMultipartForm,
  handleFormData,
  testUpload,
  testNoFiles,
  debugFormData,
  getAllApplications,
  getApplicationById,
  getApplicationsByCustomer,
  getPendingCount,
  approveByCustomer,                    // alias for status-only (kept for compatibility)
  updateApplicationByCustomer,
  approveApplicationByCustomer,         // status-only (kept for reference)
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

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Account Application API is working',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      test: 'GET /test',
      create: 'POST /create',
      createSimple: 'POST /create-simple',
      getAll: 'GET /all',
      getById: 'GET /:id',
      getByCustomer: 'GET /customer/:customerId',
      updateByCustomer: 'PATCH /customer/:customerId/update',
      approveByCustomer: 'POST /customer/:customerId/approve',  // now creates full account
      rejectByCustomer: 'POST /customer/:customerId/reject',
      addDocuments: 'POST /customer/:customerId/documents',
      getDocuments: 'GET /customer/:customerId/documents',
      deleteDocument: 'DELETE /customer/:customerId/documents/:documentId'
    }
  });
});

router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Account Application API test endpoint',
    timestamp: new Date().toISOString(),
    note: 'All endpoints are functional',
    serverTime: new Date().toLocaleString()
  });
});

router.post('/debug', debugFormData);
router.post('/test-no-files', testNoFiles);
router.post('/test-upload', handleMultipartForm, testUpload);

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
    timestamp: new Date().toISOString()
  });
});

// Get applications by branch identifier
router.get('/by-bu/:bu_id', getApplicationByBu);

// ========================================
// APPLICATION CREATION ENDPOINTS
// ========================================
router.post('/create-simple', createSimpleApplication);
router.post('/create', handleFormData, handleMultipartForm, createApplication);

// ========================================
// APPLICATION RETRIEVAL ENDPOINTS
// ========================================
router.get('/all', getAllApplications);
router.get('/:id', getApplicationById);
router.get('/customer/:customerId', getApplicationsByCustomer);
router.get('/stats/pending-count', getPendingCount);

// ========================================
// APPROVAL ENDPOINTS
// ========================================

// Full approval (creates customer_accounts & accounts) - this is the one the frontend calls
router.post(
  '/customer/:customerId/approve',
  handleFormData,
  handleMultipartForm,
  approveApplicationAndCreateAccount   // ✅ changed from approveApplicationByCustomer
);

// Alternative full approval route (kept for compatibility)
router.post(
  '/approve-by-customer/:customerId',
  approveApplicationAndCreateAccount
);

// Status-only approval (if needed elsewhere)
router.post('/:id/approve', approveByCustomer);

// ========================================
// APPLICATION MANAGEMENT ENDPOINTS
// ========================================
router.patch(
  '/customer/:customerId/update',
  handleFormData,
  handleMultipartForm,
  updateApplicationByCustomer
);

router.post(
  '/customer/:customerId/reject',
  handleFormData,
  handleMultipartForm,
  rejectApplicationByCustomer
);

// ========================================
// DOCUMENT MANAGEMENT ENDPOINTS
// ========================================
router.post(
  '/customer/:customerId/documents',
  handleFormData,
  handleMultipartForm,
  addDocumentsToApplication
);
router.get('/customer/:customerId/documents', getApplicationDocuments);
router.delete('/customer/:customerId/documents/:documentId', deleteApplicationDocument);

// ========================================
// 404 HANDLER FOR THIS ROUTER
// ========================================
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found in Account Application API: ${req.originalUrl}`,
    method: req.method,
    timestamp: new Date().toISOString(),
    suggestions: [
      "Check available routes at: GET /api/account-applications/routes",
      "Test API health at: GET /api/account-applications/health",
      "Review API documentation"
    ],
    exampleEndpoints: [
      "GET /api/account-applications/health",
      "POST /api/account-applications/create",
      "PATCH /api/account-applications/customer/:customerId/update",
      "GET /api/account-applications/customer/:customerId"
    ]
  });
});

export default router;