// src/routes/thriftRoutes.js
import express from 'express';
import ThriftController from '../controllers/ThriftController.js';



const router = express.Router();

// ============================================
// API DOCUMENTATION
// ============================================

/**
 * @swagger
 * tags:
 *   - name: Thrift Management
 *     description: Thrift account operations for savings and collections
 */

// ============================================
// 1. THRIFT ACCOUNT CREATION ROUTES
// ============================================

// In your routes file (e.g., thriftRoutes.js)
router.get('/search/customers', ThriftController.searchCustomersByName);
router.get('/search/thrift-accounts', ThriftController.searchThriftAccountsByName);
router.get('/search/quick', ThriftController.quickSearchForCollection);

/**
 * @swagger
 * /api/thrift/accounts:
 *   post:
 *     summary: Create a new thrift account with a new customer
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - FIRST_NAME
 *               - LASTNAME
 *               - initialAmount
 *               - COLLECTION_TYPE
 *             properties:
 *               FIRST_NAME:
 *                 type: string
 *               LASTNAME:
 *                 type: string
 *               FULL_NAME:
 *                 type: string
 *               initialAmount:
 *                 type: number
 *               COLLECTION_TYPE:
 *                 type: string
 *                 enum: [DAILY, WEEKLY, MONTHLY]
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *               RELATIONSHIP_MANAGER:
 *                 type: string
 *               TRANSACTION_DATE:
 *                 type: string
 *                 format: date-time
 *               OPENED_DT:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Thrift account created successfully
 *       400:
 *         description: Invalid input or missing required fields
 *       500:
 *         description: Server error
 */
router.post('/accounts',  ThriftController.createThriftAccount);

/**
 * @swagger
 * /api/thrift/accounts/existing-customer:
 *   post:
 *     summary: Create a thrift account for existing customer
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - CUST_ID
 *               - initialAmount
 *               - COLLECTION_TYPE
 *             properties:
 *               CUST_ID:
 *                 type: string
 *               FULL_NAME:
 *                 type: string
 *               initialAmount:
 *                 type: number
 *               COLLECTION_TYPE:
 *                 type: string
 *                 enum: [DAILY, WEEKLY, MONTHLY]
 *               address:
 *                 type: string
 *               RELATIONSHIP_MANAGER:
 *                 type: string
 *               TRANSACTION_DATE:
 *                 type: string
 *                 format: date-time
 *               OPENED_DT:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Thrift account created successfully
 *       400:
 *         description: Invalid input or customer not found
 *       404:
 *         description: Customer not found
 *       500:
 *         description: Server error
 */
router.post('/accounts/existing-customer',  ThriftController.createThriftAccountForExistingCustomer);

// ============================================
// 2. COLLECTION PROCESSING ROUTES
// ============================================

/**
 * @swagger
 * /api/thrift/collections/daily:
 *   post:
 *     summary: Process daily thrift collection
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - CUST_ID
 *               - ACCT_NO
 *               - amount
 *             properties:
 *               CUST_ID:
 *                 type: string
 *               ACCT_NO:
 *                 type: string
 *               amount:
 *                 type: number
 *               FULL_NAME:
 *                 type: string
 *               TRANSACTION_DATE:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Collection processed successfully
 *       400:
 *         description: Invalid input or insufficient balance
 *       404:
 *         description: Account or customer not found
 *       500:
 *         description: Server error
 */
router.post('/collections/daily',  ThriftController.processDailyCollection);

/**
 * @swagger
 * /api/thrift/collections/weekly:
 *   post:
 *     summary: Process weekly thrift collection
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - CUST_ID
 *               - ACCT_NO
 *               - amount
 *             properties:
 *               CUST_ID:
 *                 type: string
 *               ACCT_NO:
 *                 type: string
 *               amount:
 *                 type: number
 *               FULL_NAME:
 *                 type: string
 *               TRANSACTION_DATE:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Weekly collection processed successfully
 */
router.post('/collections/weekly',  async (req, res) => {
  // Note: You need to implement processWeeklyCollection in controller
  // For now, using daily collection as placeholder
  ThriftController.processDailyCollection(req, res);
});

/**
 * @swagger
 * /api/thrift/collections/monthly:
 *   post:
 *     summary: Process monthly thrift collection
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - CUST_ID
 *               - ACCT_NO
 *               - amount
 *             properties:
 *               CUST_ID:
 *                 type: string
 *               ACCT_NO:
 *                 type: string
 *               amount:
 *                 type: number
 *               FULL_NAME:
 *                 type: string
 *               TRANSACTION_DATE:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Monthly collection processed successfully
 */
router.post('/collections/monthly',  async (req, res) => {
  // Note: You need to implement processMonthlyCollection in controller
  // For now, using daily collection as placeholder
  ThriftController.processDailyCollection(req, res);
});

// ============================================
// 3. WITHDRAWAL ROUTES
// ============================================

/**
 * @swagger
 * /api/thrift/withdrawals:
 *   post:
 *     summary: Process withdrawal from thrift account
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - CUST_ID
 *               - ACCT_NO
 *               - amount
 *             properties:
 *               CUST_ID:
 *                 type: string
 *               ACCT_NO:
 *                 type: string
 *               amount:
 *                 type: number
 *               FULL_NAME:
 *                 type: string
 *               TRANSACTION_DATE:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Withdrawal processed successfully
 *       400:
 *         description: Invalid input or insufficient balance
 *       404:
 *         description: Account or customer not found
 *       500:
 *         description: Server error
 */
router.post('/withdrawals',  ThriftController.processWithdrawal);

// ============================================
// 4. ACCOUNT INFORMATION ROUTES
// ============================================

/**
 * @swagger
 * /api/thrift/accounts/{CUST_ID}/{ACCT_NO}/summary:
 *   get:
 *     summary: Get thrift account summary
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: CUST_ID
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *       - in: path
 *         name: ACCT_NO
 *         required: true
 *         schema:
 *           type: string
 *         description: Account number
 *     responses:
 *       200:
 *         description: Account summary retrieved successfully
 *       404:
 *         description: Account or customer not found
 *       500:
 *         description: Server error
 */
router.get('/accounts/:CUST_ID/:ACCT_NO/summary',  ThriftController.getAccountSummary);

/**
 * @swagger
 * /api/thrift/accounts/customer/{CUST_ID}:
 *   get:
 *     summary: Get all thrift accounts for a customer
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: CUST_ID
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer accounts retrieved successfully
 *       404:
 *         description: Customer not found
 *       500:
 *         description: Server error
 */
router.get('/accounts/customer/:CUST_ID',  ThriftController.getCustomerThriftAccounts);

/**
 * @swagger
 * /api/thrift/accounts:
 *   get:
 *     summary: Get all thrift accounts (Admin)
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, SUSPENDED, CLOSED]
 *         description: Filter by account status
 *       - in: query
 *         name: relationshipManagerId
 *         schema:
 *           type: string
 *         description: Filter by relationship manager
 *     responses:
 *       200:
 *         description: Accounts retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/accounts',  ThriftController.getAllThriftAccounts);

// ============================================
// 5. TRANSACTION HISTORY ROUTES
// ============================================

/**
 * @swagger
 * /api/thrift/transactions/{CUST_ID}/{ACCT_NO}:
 *   get:
 *     summary: Get transaction history for a thrift account
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: CUST_ID
 *         schema:
 *           type: string
 *         description: Customer ID (optional if ACCT_NO provided)
 *       - in: path
 *         name: ACCT_NO
 *         schema:
 *           type: string
 *         description: Account number (optional if CUST_ID provided)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from date (YYYY-MM-DD)
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date (YYYY-MM-DD)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [THRIFT_OPENING, THRIFT_COLLECTION, THRIFT_WITHDRAWAL]
 *         description: Filter by transaction type
 *     responses:
 *       200:
 *         description: Transaction history retrieved successfully
 *       400:
 *         description: Either CUST_ID or ACCT_NO is required
 *       500:
 *         description: Server error
 */
router.get('/transactions/:CUST_ID?/:ACCT_NO?', ThriftController.getTransactionHistory);

// ============================================
// 6. ADDITIONAL OPERATIONS ROUTES
// ============================================

/**
 * @swagger
 * /api/thrift/accounts/{ACCT_NO}/status:
 *   patch:
 *     summary: Update thrift account status
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ACCT_NO
 *         required: true
 *         schema:
 *           type: string
 *         description: Account number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, SUSPENDED, CLOSED]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Account status updated successfully
 *       404:
 *         description: Account not found
 *       500:
 *         description: Server error
 */
router.patch('/accounts/:ACCT_NO/status',  async (req, res) => {
  // You need to implement this in controller
  try {
    const { ACCT_NO } = req.params;
    const { status, notes } = req.body;
    
    const thriftAccount = await Thrift.findOne({ where: { ACCT_NO } });
    if (!thriftAccount) {
      return res.status(404).json({
        success: false,
        message: 'Thrift account not found'
      });
    }
    
    await thriftAccount.update({ 
      status, 
      notes: notes || thriftAccount.notes 
    });
    
    return res.status(200).json({
      success: true,
      message: 'Account status updated successfully',
      data: { ACCT_NO, status }
    });
  } catch (error) {
    logger.error('Error updating account status:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/thrift/accounts/{ACCT_NO}:
 *   get:
 *     summary: Get thrift account details by account number
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ACCT_NO
 *         required: true
 *         schema:
 *           type: string
 *         description: Account number
 *     responses:
 *       200:
 *         description: Account details retrieved successfully
 *       404:
 *         description: Account not found
 *       500:
 *         description: Server error
 */
router.get('/accounts/:ACCT_NO',  async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    
    const thriftAccount = await Thrift.findOne({ 
      where: { ACCT_NO },
      include: [
        {
          model: Customer,
          attributes: ['CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'PHONE_NO', 'accountBalance']
        }
      ]
    });
    
    if (!thriftAccount) {
      return res.status(404).json({
        success: false,
        message: 'Thrift account not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: thriftAccount
    });
  } catch (error) {
    logger.error('Error getting account details:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/thrift/health:
 *   get:
 *     summary: Check thrift service health
 *     tags: [Thrift Management]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Thrift service is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ============================================
// 7. REPORTING ROUTES
// ============================================

/**
 * @swagger
 * /api/thrift/reports/monthly-summary:
 *   get:
 *     summary: Get monthly collection summary report
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           format: YYYY-MM
 *         description: Month for report (e.g., 2024-01)
 *       - in: query
 *         name: relationshipManagerId
 *         schema:
 *           type: string
 *         description: Filter by relationship manager
 *     responses:
 *       200:
 *         description: Monthly summary report
 */
router.get('/reports/monthly-summary',  async (req, res) => {
  try {
    const { month, relationshipManagerId } = req.query;
    
    // Implement monthly summary logic
    const where = {};
    if (relationshipManagerId) {
      where.RELATIONSHIP_MANAGER = relationshipManagerId;
    }
    
    const thriftAccounts = await Thrift.findAll({ where });
    const totalAccounts = thriftAccounts.length;
    const activeAccounts = thriftAccounts.filter(a => a.status === 'ACTIVE').length;
    const totalContributions = thriftAccounts.reduce((sum, acc) => sum + parseFloat(acc.totalContributions), 0);
    const totalWithdrawals = thriftAccounts.reduce((sum, acc) => sum + parseFloat(acc.totalWithdrawals), 0);
    
    return res.status(200).json({
      success: true,
      data: {
        month: month || new Date().toISOString().slice(0, 7),
        summary: {
          totalAccounts,
          activeAccounts,
          inactiveAccounts: totalAccounts - activeAccounts,
          totalContributions,
          totalWithdrawals,
          netBalance: totalContributions - totalWithdrawals
        },
        byCollectionType: {
          DAILY: thriftAccounts.filter(a => a.COLLECTION_TYPE === 'DAILY').length,
          WEEKLY: thriftAccounts.filter(a => a.COLLECTION_TYPE === 'WEEKLY').length,
          MONTHLY: thriftAccounts.filter(a => a.COLLECTION_TYPE === 'MONTHLY').length
        }
      }
    });
  } catch (error) {
    logger.error('Error generating monthly summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ============================================
// 8. BULK OPERATIONS ROUTES
// ============================================

/**
 * @swagger
 * /api/thrift/collections/bulk-daily:
 *   post:
 *     summary: Process bulk daily collections
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               collections:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - CUST_ID
 *                     - ACCT_NO
 *                     - amount
 *                   properties:
 *                     CUST_ID:
 *                       type: string
 *                     ACCT_NO:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     TRANSACTION_DATE:
 *                       type: string
 *                       format: date-time
 *     responses:
 *       200:
 *         description: Bulk collections processed
 */
router.post('/collections/bulk-daily',  async (req, res) => {
  try {
    const { collections } = req.body;
    
    if (!Array.isArray(collections) || collections.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Collections array is required and cannot be empty'
      });
    }
    
    const results = [];
    const errors = [];
    
    for (const collection of collections) {
      try {
        // Simulate processing each collection
        const result = await ThriftController.processDailyCollection(
          { body: collection },
          { 
            status: (code) => ({ json: (data) => ({ statusCode: code, data }) }),
            json: (data) => data
          }
        );
        results.push({ ...collection, success: true, result });
      } catch (error) {
        errors.push({ ...collection, success: false, error: error.message });
      }
    }
    
    return res.status(200).json({
      success: true,
      message: `Processed ${results.length} collections, ${errors.length} failed`,
      data: {
        successful: results.length,
        failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    logger.error('Error processing bulk collections:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ... (existing routes above)

// ============================================
// WITHDRAWAL APPROVAL WORKFLOW ROUTES
// ============================================

/**
 * @swagger
 * /api/thrift/withdrawals:
 *   post:
 *     summary: Submit withdrawal request (requires approval)
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - CUST_ID
 *               - ACCT_NO
 *               - amount
 *             properties:
 *               CUST_ID:
 *                 type: string
 *               ACCT_NO:
 *                 type: string
 *               amount:
 *                 type: number
 *               FULL_NAME:
 *                 type: string
 *               TRANSACTION_DATE:
 *                 type: string
 *                 format: date-time
 *               notes:
 *                 type: string
 *                 description: Optional notes for approval
 *     responses:
 *       200:
 *         description: Withdrawal request submitted successfully (pending approval)
 */
router.post('/withdrawals', ThriftController.processWithdrawal);

/**
 * @swagger
 * /api/thrift/withdrawals/approve:
 *   post:
 *     summary: Approve or reject a withdrawal request
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionId
 *             properties:
 *               transactionId:
 *                 type: integer
 *               approve:
 *                 type: boolean
 *                 default: true
 *               approvalNotes:
 *                 type: string
 *               rejectionReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Withdrawal approved/rejected successfully
 */
router.post('/withdrawals/approve', ThriftController.approveWithdrawal);

/**
 * @swagger
 * /api/thrift/withdrawals/pending:
 *   get:
 *     summary: Get pending withdrawal requests
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING_APPROVAL, ALL]
 *           default: PENDING_APPROVAL
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of pending withdrawal requests
 */
router.get('/withdrawals/pending', ThriftController.getPendingWithdrawals);

/**
 * @swagger
 * /api/thrift/withdrawals/details/:transactionId:
 *   get:
 *     summary: Get withdrawal approval details
 *     tags: [Thrift Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Withdrawal approval details
 */
router.get('/withdrawals/details/:transactionId', ThriftController.getWithdrawalApprovalDetails);

// ... (rest of your routes file)

// ============================================
// EXPORT ROUTER
// ============================================

export default router;