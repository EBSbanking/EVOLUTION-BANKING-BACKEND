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
  // updateApplication,
  // approveApplication,
  // rejectApplication,
  // uploadApplicationDocuments,
  // New functions for customer-based operations
  updateApplicationByCustomer,
  approveApplicationByCustomer,
  rejectApplicationByCustomer,
  // New document management endpoints
  addDocumentsToApplication,
  getApplicationDocuments,
  deleteApplicationDocument
} from '../controllers/AccountApplicationController.js';

const router = express.Router();

// ========================================
// HEALTH CHECK & DEBUG ENDPOINTS
// ========================================

// Health check endpoint
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
      approveByCustomer: 'POST /customer/:customerId/approve',
      rejectByCustomer: 'POST /customer/:customerId/reject',
      addDocuments: 'POST /customer/:customerId/documents',
      getDocuments: 'GET /customer/:customerId/documents',
      deleteDocument: 'DELETE /customer/:customerId/documents/:documentId'
    }
  });
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Account Application API test endpoint',
    timestamp: new Date().toISOString(),
    note: 'All endpoints are functional',
    serverTime: new Date().toLocaleString()
  });
});

// Debug endpoint for form data
router.post('/debug', debugFormData);

// Test endpoints
router.post('/test-no-files', testNoFiles);
router.post('/test-upload', handleMultipartForm, testUpload);

// Route info endpoint
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

// ========================================
// APPLICATION CREATION ENDPOINTS
// ========================================

// Simple create without files (uses JSON or form-urlencoded)
router.post('/create-simple', createSimpleApplication);

// Main create endpoint with files (uses multipart/form-data)
router.post('/create', handleFormData, handleMultipartForm, createApplication);

// ========================================
// APPLICATION RETRIEVAL ENDPOINTS
// ========================================

// Get all applications with optional filters
router.get('/all', getAllApplications);

// Get application by ID
router.get('/:id', getApplicationById);

// Get applications by customer ID
router.get('/customer/:customerId', getApplicationsByCustomer);

// Get pending applications count
router.get('/stats/pending-count', getPendingCount);

// image approval routes
router.post('/:id/approve', approveByCustomer);

// Alternative route
router.post(
  '/approve-by-customer/:customerId',
  approveApplicationAndCreateAccount
);

// ========================================
// APPLICATION MANAGEMENT ENDPOINTS (CUSTOMER-BASED)
// ========================================

// Update application by customer ID with file upload support
router.patch(
  '/customer/:customerId/update',
  handleFormData,
  handleMultipartForm,
  updateApplicationByCustomer
);

// Approve application by customer ID with optional documents
router.post(
  '/customer/:customerId/approve',
  handleFormData,
  handleMultipartForm,
  approveApplicationByCustomer
);

// Reject application by customer ID with optional documents
router.post(
  '/customer/:customerId/reject',
  handleFormData,
  handleMultipartForm,
  rejectApplicationByCustomer
);

// ========================================
// DOCUMENT MANAGEMENT ENDPOINTS
// ========================================

// Add documents to existing application (customer-based)
router.post(
  '/customer/:customerId/documents',
  handleFormData,
  handleMultipartForm,
  addDocumentsToApplication
);

// Get documents for application (customer-based)
router.get(
  '/customer/:customerId/documents',
  getApplicationDocuments
);

// Delete specific document (customer-based)
router.delete(
  '/customer/:customerId/documents/:documentId',
  deleteApplicationDocument
);

// ========================================
// ORIGINAL ENDPOINTS (for backward compatibility - commented out)
// ========================================

/*
// Update application by application ID (PATCH - partial update)
router.patch('/:id/update', updateApplication);

// Approve application by application ID
router.post('/:id/approve', approveApplication);

// Reject application by application ID
router.post('/:id/reject', rejectApplication);

// Upload documents to existing application
router.post('/:applicationId/documents', handleMultipartForm, uploadApplicationDocuments);
*/

// ========================================
// 404 HANDLER FOR THIS ROUTER
// ========================================

// Catch-all for this router (if no route matches)
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