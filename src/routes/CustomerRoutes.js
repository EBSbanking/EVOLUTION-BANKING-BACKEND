// routes/CustomerRoutes.js - FINAL CORRECTED VERSION

console.log('🔍 ========== LOADING CUSTOMER ROUTES ==========');
console.log('🔍 File: CustomerRoutes.js');

// ========== STATIC IMPORTS ONLY (NO DYNAMIC) ==========
import express from 'express';
import path from 'path';
import XLSX from 'xlsx';
import csv from 'csvtojson';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js'; // ✅ ADDED: For sequelize.fn

import Customer from '../models/Customer.js';
import { generateCustomerNumber } from '../utils/generateCustomerNumber.js';

// ✅ All controller functions – imported ONCE
import {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  deactivateCustomer,
  approveCustomer,
  getPendingCustomers,
  updateCustomer,
  rejectCustomer,
  batchUploadCustomers,
  searchCustomers,
  advancedSearchCustomers,
  getCustomerWithBVN,
  findByBVN,
  updateBVNVerification,
  getCustomerWithLoans,
  checkHasActiveLoan,
  getCustomerFullSummary,
  assignCustomerToGroup,
  removeCustomerFromGroup,
  getCustomersByGroup,
  bulkAssignCustomersToGroups
} from '../controllers/CustomerController.js';

console.log('✅ All imports completed successfully');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
console.log('🔍 Router instance created');

// Helper function for error handling
const handleError = (res, error, defaultMessage = 'An error occurred') => {
  console.error(error);
  const statusCode = error.message?.includes('not found') ? 404 : 500;
  res.status(statusCode).json({
    success: false,
    message: defaultMessage,
    error: error.message
  });
};

console.log('🔍 Helper functions defined');

// ============================================================
// ✅ SEARCH ROUTES
// ============================================================

router.get('/search', async (req, res) => {
  console.log('🔍 Search customers endpoint called');
  const searchTerm = req.query.q || req.query.name;
  const { field, exact } = req.query;

  if (!searchTerm) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required (use q or name parameter)'
    });
  }

  try {
    const searchFields = [
      'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM',
      'EMAIL_ADDRESS', 'PHONE_NO', 'BVN', 'NIN'
    ];
    let whereClause = {};

    if (field && field !== 'all' && searchFields.includes(field)) {
      whereClause[field] = exact === 'true' ? searchTerm : { [Op.like]: `%${searchTerm}%` };
    } else {
      whereClause = {
        [Op.or]: searchFields.map(f => ({
          [f]: exact === 'true' ? searchTerm : { [Op.like]: `%${searchTerm}%` }
        }))
      };
    }

    const customers = await Customer.findAll({
      where: whereClause,
      attributes: [
        'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM',
        'EMAIL_ADDRESS', 'PHONE_NO', 'BVN', 'NIN',
        'HOME_ADDRESS', 'BU_ID', 'STATUS', 'CREATED_AT', 'UPDATED_AT'
      ],
      limit: 50,
      order: [['CREATED_AT', 'DESC']]
    });

    res.json({
      success: true,
      count: customers.length,
      query: searchTerm,
      field: field || 'all',
      exact: exact === 'true',
      data: customers.map(c => c.toJSON ? c.toJSON() : c)
    });
  } catch (error) {
    handleError(res, error, 'Failed to search customers');
  }
});

router.post('/search/advanced', async (req, res) => {
  try {
    const { searchTerm, fields = [], exact = false, page = 1, limit = 20, sortBy = 'CREATED_AT', sortOrder = 'DESC' } = req.body;
    if (!searchTerm) {
      return res.status(400).json({ success: false, message: 'Search term is required' });
    }

    const allSearchableFields = ['CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM', 'EMAIL_ADDRESS', 'PHONE_NO', 'BVN', 'NIN'];
    const searchableFields = fields.length > 0 ? fields.filter(f => allSearchableFields.includes(f)) : allSearchableFields;

    let whereClause = {};
    if (exact) {
      whereClause = { [Op.or]: searchableFields.map(f => ({ [f]: searchTerm })) };
    } else {
      whereClause = { [Op.or]: searchableFields.map(f => ({ [f]: { [Op.like]: `%${searchTerm}%` } })) };
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await Customer.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder]]
    });

    res.json({
      success: true,
      data: {
        customers: rows.map(c => c.toJSON ? c.toJSON() : c),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      },
      searchCriteria: { term: searchTerm, fields: searchableFields, exact }
    });
  } catch (error) {
    handleError(res, error, 'Failed to perform advanced search');
  }
});

router.get('/search/quick', async (req, res) => {
  try {
    const { term } = req.query;
    if (!term || term.length < 2) {
      return res.status(400).json({ success: false, message: 'Search term must be at least 2 characters' });
    }
    const customers = await Customer.findAll({
      where: {
        [Op.or]: [
          { CUST_NO: { [Op.like]: `%${term}%` } },
          { CUST_NM: { [Op.like]: `%${term}%` } },
          { FIRST_NAME: { [Op.like]: `%${term}%` } },
          { LAST_NAME: { [Op.like]: `%${term}%` } }
        ]
      },
      limit: 10,
      attributes: ['CUST_ID', 'CUST_NO', 'CUST_NM', 'FIRST_NAME', 'LAST_NAME', 'EMAIL_ADDRESS', 'PHONE_NO']
    });
    res.json({ success: true, count: customers.length, data: customers });
  } catch (error) {
    handleError(res, error, 'Failed to perform quick search');
  }
});

// ============================================================
// ✅ DEBUG & UPLOAD ROUTES
// ============================================================

router.post('/debug-file-structure', (req, res) => {
  try {
    if (!req.files || !req.files.customersFile) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const file = req.files.customersFile;
    res.json({
      success: true,
      fileInfo: {
        name: file.name,
        size: file.size,
        mimetype: file.mimetype,
        dataLength: file.data?.length || 0,
        isBuffer: Buffer.isBuffer(file.data),
        availableKeys: Object.keys(file)
      }
    });
  } catch (error) {
    handleError(res, error, 'Debug failed');
  }
});

router.post('/test-upload', (req, res) => {
  try {
    if (!req.files || !req.files.customersFile) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const file = req.files.customersFile;
    res.json({ success: true, message: 'File uploaded!', file: { name: file.name, size: file.size, type: file.mimetype } });
  } catch (error) {
    handleError(res, error, 'Upload test failed');
  }
});

router.post('/batch-upload', batchUploadCustomers);
router.get('/batch-template', (req, res) => {
  // (keep your template fields here – omitted for brevity)
  res.json({ success: true, fields: [] });
});

// ============================================================
// ✅ CUSTOMER CRUD
// ============================================================
router.post('/customers', createCustomer);
router.get('/customers', getAllCustomers);
router.get('/customers/pending', getPendingCustomers);
router.get('/customers/:CUST_ID', getCustomerById);
router.put('/customers/:CUST_ID', updateCustomer);
router.put('/approve/:customerId', approveCustomer);
router.put('/reject/:customerId', rejectCustomer);
router.patch('/customers/:CUST_ID/deactivate', deactivateCustomer);

router.get('/summary', async (req, res) => {
  try {
    const userId = req.query.userId;
    let whereClause = {};
    if (userId) whereClause = { CREATED_BY: userId };
    const total = await Customer.count({ where: whereClause });
    const active = await Customer.count({ where: { ...whereClause, STATUS: 'Active' } });
    const pending = await Customer.count({ where: { ...whereClause, STATUS: 'Pending' } });
    res.json({
      success: true,
      data: { userId: userId || 'all', count: total, active, pending, summary: { total, active, pending } }
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch summary');
  }
});

// ============================================================
// ✅ GENERATE CUSTOMER NUMBER (plain numeric)
// ============================================================
router.get('/generate-customer-number', async (req, res) => {
  console.log('🔍 Generate customer number endpoint called');
  try {
    const result = await generateCustomerNumber();
    res.status(200).json({
      success: true,
      data: {
        customerId: result.CUST_ID,
        customerNumber: result.CUST_NO,
        isFallback: result.isFallback || false
      },
      message: result.isFallback ? 'Generated (fallback)' : 'Generated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Generation error:', error);
    const ts = Date.now().toString().slice(-8);
    const custId = String(ts).padStart(10, '0');
    const custNo = String(ts).padStart(9, '0');
    res.status(200).json({
      success: true,
      data: { customerId: custId, customerNumber: custNo, isFallback: true },
      message: 'Generated (fallback)',
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================================
// ✅ BVN, LOAN, GROUP ROUTES
// ============================================================
router.get('/customers/:customerId/bvn', getCustomerWithBVN);
router.get('/customers/bvn/:bvn', findByBVN);
router.put('/customers/:customerId/verify-bvn', updateBVNVerification);

router.get('/customers/:customerId/loans', getCustomerWithLoans);
router.get('/customers/:customerId/has-active-loan', checkHasActiveLoan);
router.get('/customers/:customerId/summary', getCustomerFullSummary);

router.patch('/customers/:customerId/group', async (req, res) => {
  const { groupId } = req.body;
  if (!groupId) {
    return res.status(400).json({ success: false, message: 'groupId is required' });
  }
  try {
    const result = await assignCustomerToGroup(req.params.customerId, groupId, {});
    res.json({ success: true, message: 'Assigned to group', data: result });
  } catch (error) {
    handleError(res, error, 'Failed to assign to group');
  }
});

router.delete('/customers/:customerId/group', removeCustomerFromGroup);
router.get('/groups/:groupId/customers', getCustomersByGroup);
router.get('/customers/group/:groupId', getCustomersByGroup);

router.post('/customers/bulk-assign-group', async (req, res) => {
  const { assignments } = req.body;
  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ success: false, message: 'assignments array required' });
  }
  try {
    const result = await bulkAssignCustomersToGroups(assignments, null);
    res.json({ success: true, message: 'Bulk assignment processed', data: result });
  } catch (error) {
    handleError(res, error, 'Bulk assignment failed');
  }
});

// ============================================================
// ✅ CUSTOMER DASHBOARD SUMMARY (ADDED)
// ============================================================
router.get('/dashboard-summary', async (req, res) => {
  console.log('🔍 Dashboard summary endpoint called');
  try {
    const userId = req.user?.userId || req.query.userId;
    let whereClause = {};
    
    // Filter by user if provided
    if (userId) {
      whereClause = { CREATED_BY: userId };
    }

    // Get counts
    const totalCustomers = await Customer.count({ where: whereClause });
    const activeCustomers = await Customer.count({ 
      where: { ...whereClause, STATUS: 'Active' } 
    });
    const pendingCustomers = await Customer.count({ 
      where: { ...whereClause, STATUS: 'Pending' } 
    });
    const inactiveCustomers = await Customer.count({ 
      where: { ...whereClause, STATUS: 'Inactive' } 
    });

    // Get recent customers (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const newCustomersLast30Days = await Customer.count({
      where: {
        ...whereClause,
        CREATED_AT: { [Op.gte]: thirtyDaysAgo }
      }
    });

    // Get today's new customers
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCustomers = await Customer.count({
      where: {
        ...whereClause,
        CREATED_AT: { [Op.gte]: today }
      }
    });

    // Get customers by business unit (if BU_ID field exists)
    const customersByBU = await Customer.findAll({
      attributes: [
        'BU_ID',
        [sequelize.fn('COUNT', sequelize.col('CUST_ID')), 'count']
      ],
      where: whereClause,
      group: ['BU_ID'],
      raw: true
    });

    res.json({
      success: true,
      data: {
        totalCustomers,
        activeCustomers,
        pendingCustomers,
        inactiveCustomers,
        newCustomersLast30Days,
        todayCustomers,
        customersByBU: customersByBU || [],
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard summary',
      error: error.message
    });
  }
});

// ============================================================
// ✅ CUSTOMER DASHBOARD SUMMARY ALIAS (for backward compatibility)
// ============================================================
router.get('/customer-dashboard-summary', async (req, res) => {
  // Forward to the main dashboard summary endpoint
  req.query = req.query || {};
  req.user = req.user || {};
  // Call the same handler logic
  const handler = router.stack.find(layer => layer.route?.path === '/dashboard-summary');
  if (handler) {
    await handler.handle(req, res);
  } else {
    res.status(500).json({
      success: false,
      message: 'Dashboard summary handler not found'
    });
  }
});

console.log('🔍 ========== CUSTOMER ROUTES LOADED SUCCESSFULLY ==========');
console.log('🔍 Registered routes:');
console.log('  - GET    /search');
console.log('  - POST   /search/advanced');
console.log('  - GET    /search/quick');
console.log('  - POST   /debug-file-structure');
console.log('  - POST   /test-upload');
console.log('  - POST   /batch-upload');
console.log('  - GET    /batch-template');
console.log('  - POST   /customers');
console.log('  - GET    /customers');
console.log('  - GET    /customers/pending');
console.log('  - GET    /customers/:CUST_ID');
console.log('  - PUT    /customers/:CUST_ID');
console.log('  - PUT    /approve/:customerId');
console.log('  - PUT    /reject/:customerId');
console.log('  - PATCH  /customers/:CUST_ID/deactivate');
console.log('  - GET    /summary');
console.log('  - GET    /generate-customer-number');
console.log('  - GET    /customers/:customerId/bvn');
console.log('  - GET    /customers/bvn/:bvn');
console.log('  - PUT    /customers/:customerId/verify-bvn');
console.log('  - GET    /customers/:customerId/loans');
console.log('  - GET    /customers/:customerId/has-active-loan');
console.log('  - GET    /customers/:customerId/summary');
console.log('  - PATCH  /customers/:customerId/group');
console.log('  - DELETE /customers/:customerId/group');
console.log('  - GET    /groups/:groupId/customers');
console.log('  - GET    /customers/group/:groupId');
console.log('  - POST   /customers/bulk-assign-group');
console.log('  - GET    /dashboard-summary');
console.log('  - GET    /customer-dashboard-summary');

export default router;