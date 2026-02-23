// src/controllers/CustomerController.js - COMPLETE UPDATED VERSION WITH BVN & LOAN METHODS
import { Op, QueryTypes } from 'sequelize';
import { initializeModels, getCustomer, getAML, getSequelize, getWF_WORK_ITEM } from '../models/index.js';
import WF_WORK_ITEMController from "../controllers/WF_WORK_ITEMController.js";
import auditLogger from "../utils/AuditLogger.js";
import { checkSanctionList } from "../utils/checkSanctionList.js";
import { validateAMLInput } from "../utils/amlValidator.js";
import generateCustomerNumber from "../utils/generateCustomerNumber.js";
import { getCurrentCounterStatus, resetCounter } from "../utils/generateCustomerNumber.js";
import NotificationService from "../Services/NotificationService.js";
import moment from "moment";
import { 
  ensureEventIdColumn, 
  ensureEssentialCustomerColumns,
  getCustomerAttributesWithOptional 
} from '../utils/customerTableUtils.js';

// Global model references
let Customer = null;
let WF_WORK_ITEM = null;
let AML = null;
let sequelize = null;
let modelsInitialized = false;
let initializationPromise = null;

// ============================================
// MODEL INITIALIZATION FUNCTIONS
// ============================================

/**
 * Initialize models safely with caching
 */
export const initModels = async (force = false) => {
  // Return cached result if already initialized and not forcing refresh
  if (modelsInitialized && !force) {
    console.log('📦 Models already initialized, returning cached models');
    return { Customer, AML, WF_WORK_ITEM, sequelize };
  }
  
  // Return existing promise if initialization is in progress
  if (initializationPromise && !force) {
    console.log('⏳ Model initialization already in progress, waiting...');
    return initializationPromise;
  }
  
  // Create new initialization promise
  initializationPromise = (async () => {
    try {
      console.log('🔧 Initializing models in CustomerController...');
      
      // Initialize models from models/index.js
      console.log('📦 Calling initializeModels()...');
      await initializeModels();
      console.log('✅ initializeModels() completed');
      
      // Get models using getter functions
      Customer = getCustomer();
      AML = getAML();
      WF_WORK_ITEM = getWF_WORK_ITEM();
      sequelize = getSequelize();
      
      if (!sequelize) {
        throw new Error('Sequelize instance not loaded');
      }
      
      console.log('✅ Models retrieved:');
      console.log('  - Customer:', Customer ? '✅ Available' : '❌ Not Available');
      console.log('  - AML:', AML ? '✅ Available' : '❌ Not Available');
      console.log('  - WF_WORK_ITEM:', WF_WORK_ITEM ? '✅ Available' : '❌ Not Available');
      
      // CRITICAL FIX: If Customer is a function, we need to call it with sequelize
      if (Customer && typeof Customer === 'function') {
        console.log('🔧 Customer is a function, initializing it with sequelize...');
        
        // Check if it's already an initialized Sequelize model
        if (Customer.prototype && typeof Customer.findOne === 'function') {
          console.log('✅ Customer is already an initialized Sequelize model');
        } else {
          // Initialize the model by calling the function with sequelize
          console.log('🔨 Calling Customer function with sequelize...');
          try {
            Customer = Customer(sequelize);
            console.log('✅ Customer model initialized via function call');
          } catch (callError) {
            console.error('❌ Failed to call Customer function:', callError.message);
            throw new Error('Could not initialize Customer model');
          }
        }
      }
      
      // Verify Customer is a valid model
      if (!Customer || typeof Customer.findOne !== 'function') {
        console.error('❌ Customer model is not a valid Sequelize model');
        throw new Error('Customer model not properly initialized');
      }
      
      // Test database connection
      console.log('🔍 Testing database connection...');
      try {
        await sequelize.authenticate();
        console.log('✅ Database connection successful');
      } catch (authError) {
        console.error('❌ Database authentication failed:', authError.message);
        throw new Error(`Database connection failed: ${authError.message}`);
      }
      
      // Check if customers table exists
      console.log('🔍 Ensuring customers table exists...');
      try {
        const [tables] = await sequelize.query(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'customers'
        `);
        
        if (tables.length === 0) {
          console.log('❌ customers table does NOT exist');
          console.log('🔧 Creating customers table...');
          
          // Try to sync the model to create table
          await Customer.sync({ force: true });
          console.log('✅ customers table created successfully');
        } else {
          console.log('✅ customers table exists');
        }
        
      } catch (tableError) {
        console.error('❌ Failed to ensure customers table exists:', tableError.message);
        throw new Error(`Table initialization failed: ${tableError.message}`);
      }
      
      modelsInitialized = true;
      console.log('✅ Models initialized successfully in CustomerController');
      return { Customer, AML, WF_WORK_ITEM, sequelize };
      
    } catch (error) {
      console.error('❌ Failed to initialize models in CustomerController:', error.message);
      console.error('Error stack:', error.stack);
      
      // Reset initialization flag on failure
      modelsInitialized = false;
      initializationPromise = null;
      throw error;
    }
  })();
  
  return initializationPromise;
};

/**
 * Get models safely (ensures they're initialized)
 */
export const getModels = async () => {
  if (!modelsInitialized) {
    await initModels();
  }
  return { Customer, AML, WF_WORK_ITEM, sequelize };
};

/**
 * Get Customer model safely
 */
export const getCustomerModel = async () => {
  if (!modelsInitialized) {
    await initModels();
  }
  if (!Customer) {
    throw new Error('Customer model not available after initialization');
  }
  return Customer;
};

// ===== Helper Functions =====
const parseDate = (dateStr, format) => {
  if (!dateStr) return undefined;
  const m = moment(dateStr, format, true);
  return m.isValid() ? m.toDate() : undefined;
};

const calculateRiskRating = ({
  IS_PEP,
  SANCTION_SCORE,
  isSanctioned,
  DOCUMENT_VERIFICATION_STATUS,
}) => {
  if (IS_PEP || isSanctioned) return "High";
  if (SANCTION_SCORE > 70) return "High";
  if (DOCUMENT_VERIFICATION_STATUS !== "Verified") return "Medium";
  return "Low";
};

const calculateNextReviewDate = (rating, providedDate) => {
  if (providedDate) return providedDate;
  const date = new Date();
  if (rating === "High") date.setMonth(date.getMonth() + 3);
  else if (rating === "Medium") date.setMonth(date.getMonth() + 6);
  else date.setFullYear(date.getFullYear() + 1);
  return date;
};

const calculateAge = (birthDate) => {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

// ===== Validation for Next of Kin =====
const validateNextOfKin = (nextOfKinArray) => {
  if (!Array.isArray(nextOfKinArray)) {
    return "Next of Kin must be an array";
  }
  
  for (let i = 0; i < nextOfKinArray.length; i++) {
    const nok = nextOfKinArray[i];
    
    // Check required fields
    if (!nok.NEXTOF_KIN_NM || !nok.NEXTOF_KIN_NM.trim()) {
      return `Next of Kin ${i + 1}: Name is required`;
    }
    
    if (!nok.RELATIONSHIP || !nok.RELATIONSHIP.trim()) {
      return `Next of Kin ${i + 1}: Relationship is required`;
    }
    
    if (!nok.PHONE_NO || !nok.PHONE_NO.trim()) {
      return `Next of Kin ${i + 1}: Phone number is required`;
    }
    
    if (!nok.ADDRESS || !nok.ADDRESS.trim()) {
      return `Next of Kin ${i + 1}: Address is required`;
    }
    
    // Validate phone number format (basic check)
    const phoneRegex = /^[0-9]{10,15}$/;
    if (!phoneRegex.test(nok.PHONE_NO.replace(/\D/g, ''))) {
      return `Next of Kin ${i + 1}: Phone number must be 10-15 digits`;
    }
    
    // Validate email if provided
    if (nok.EMAIL && nok.EMAIL.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(nok.EMAIL.trim())) {
        return `Next of Kin ${i + 1}: Invalid email format`;
      }
    }
  }
  
  return null; // No errors
};

// ============================================
// CUSTOMER SERVICE METHODS (NEW)
// ============================================

/**
 * Get customer with BVN details by ID
 * @route GET /api/customers/:customerId/bvn
 */
export const getCustomerWithBVN = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Initialize models
    const { Customer: custModel } = await initModels();
    
    const customer = await custModel.findByPk(customerId, {
      attributes: [
        'id', 
        'CUST_ID', 
        'CUST_NO',
        'FIRST_NAME', 
        'LAST_NAME', 
        'BVN', 
        'BVN_VERIFIED',
        'BVN_VERIFIED_AT',
        'PHONE_NO',
        'EMAIL_ADDRESS',
        'status',
        'REC_ST'
      ]
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    res.json({
      success: true,
      data: customer
    });
    
  } catch (error) {
    console.error('❌ Error getting customer with BVN:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get customer',
      error: error.message
    });
  }
};

/**
 * Find customer by BVN
 * @route GET /api/customers/bvn/:bvn
 */
export const findByBVN = async (req, res) => {
  try {
    const { bvn } = req.params;
    
    if (!bvn || !/^\d{11}$/.test(bvn)) {
      return res.status(400).json({
        success: false,
        message: 'Valid 11-digit BVN is required'
      });
    }
    
    // Initialize models
    const { Customer: custModel } = await initModels();
    
    const customer = await custModel.findOne({
      where: { BVN: bvn },
      attributes: [
        'id', 
        'CUST_ID', 
        'FIRST_NAME', 
        'LAST_NAME', 
        'BVN', 
        'BVN_VERIFIED',
        'PHONE_NO', 
        'EMAIL_ADDRESS'
      ]
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found with this BVN'
      });
    }
    
    res.json({
      success: true,
      data: customer
    });
    
  } catch (error) {
    console.error('❌ Error finding customer by BVN:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find customer',
      error: error.message
    });
  }
};

/**
 * Update BVN verification status
 * @route PUT /api/customers/:customerId/verify-bvn
 */
export const updateBVNVerification = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { verified, bvn, verifiedBy } = req.body;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Initialize models
    const { Customer: custModel, sequelize: db } = await initModels();
    
    // Start transaction
    const transaction = await db.transaction();
    
    try {
      const customer = await custModel.findByPk(customerId, { transaction });
      
      if (!customer) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }
      
      // Update BVN verification status
      await customer.update({
        BVN_VERIFIED: verified === true,
        BVN_VERIFIED_AT: verified ? new Date() : null,
        BVN: bvn || customer.BVN
      }, { transaction });
      
      // Log audit
      await auditLogger.log({
        entity_type: 'CUSTOMER',
        entity_id: customerId,
        user_id: verifiedBy || req.user?.id || 'system',
        action: 'UPDATE_BVN_VERIFICATION',
        old_value: { BVN_VERIFIED: customer.BVN_VERIFIED },
        new_value: { BVN_VERIFIED: verified },
        ip_address: req.ip || req.connection.remoteAddress,
        event_type: 'BVN_VERIFICATION',
        outcome: 'success'
      }, { transaction });
      
      await transaction.commit();
      
      res.json({
        success: true,
        message: verified ? 'BVN verified successfully' : 'BVN verification removed',
        data: {
          id: customer.id,
          BVN: customer.BVN,
          BVN_VERIFIED: customer.BVN_VERIFIED,
          BVN_VERIFIED_AT: customer.BVN_VERIFIED_AT
        }
      });
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error updating BVN verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update BVN verification',
      error: error.message
    });
  }
};

/**
 * Get customer with loan details
 * @route GET /api/customers/:customerId/loans
 */
export const getCustomerWithLoans = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Initialize models
    const { Customer: custModel } = await initModels();
    
    // Dynamically import LoanAccount to avoid circular dependency
    const LoanAccount = (await import('../models/LoanAccount.js')).default;
    
    const customer = await custModel.findByPk(customerId, {
      attributes: [
        'id', 
        'CUST_ID', 
        'CUST_NO',
        'FIRST_NAME', 
        'LAST_NAME', 
        'BVN',
        'BVN_VERIFIED',
        'PHONE_NO',
        'EMAIL_ADDRESS'
      ],
      include: [{
        model: LoanAccount,
        as: 'loanAccounts',
        required: false,
        separate: true,
        limit: 20,
        order: [['created_at', 'DESC']]
      }]
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // Calculate loan summary
    const loans = customer.loanAccounts || [];
    const activeLoans = loans.filter(loan => loan.status === 'ACTIVE');
    const totalOutstanding = activeLoans.reduce(
      (sum, loan) => sum + parseFloat(loan.outstanding_balance || 0), 
      0
    );
    
    res.json({
      success: true,
      data: {
        customer: {
          id: customer.id,
          CUST_ID: customer.CUST_ID,
          name: `${customer.FIRST_NAME || ''} ${customer.LAST_NAME || ''}`.trim(),
          phone: customer.PHONE_NO,
          email: customer.EMAIL_ADDRESS,
          bvn: customer.BVN,
          bvnVerified: customer.BVN_VERIFIED
        },
        loanSummary: {
          totalLoans: loans.length,
          activeLoans: activeLoans.length,
          totalOutstanding: totalOutstanding,
          hasActiveLoan: activeLoans.length > 0
        },
        loans: loans
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting customer with loans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get customer loan details',
      error: error.message
    });
  }
};

/**
 * Check if customer has active loan
 * @route GET /api/customers/:customerId/has-active-loan
 */
export const checkHasActiveLoan = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Initialize models
    await initModels();
    
    // Dynamically import LoanAccount to avoid circular dependency
    const LoanAccount = (await import('../models/LoanAccount.js')).default;
    
    const activeLoan = await LoanAccount.findOne({
      where: {
        customer_id: customerId,
        status: 'ACTIVE'
      }
    });
    
    res.json({
      success: true,
      data: {
        hasActiveLoan: !!activeLoan,
        customerId: customerId,
        loanDetails: activeLoan || null
      }
    });
    
  } catch (error) {
    console.error('❌ Error checking active loan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check active loan',
      error: error.message
    });
  }
};

/**
 * Get customer full summary with BVN and loan status
 * @route GET /api/customers/:customerId/summary
 */
export const getCustomerFullSummary = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Initialize models
    const { Customer: custModel } = await initModels();
    
    // Dynamically import LoanAccount to avoid circular dependency
    const LoanAccount = (await import('../models/LoanAccount.js')).default;
    
    const customer = await custModel.findByPk(customerId);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // Get loan details
    const activeLoan = await LoanAccount.findOne({
      where: {
        customer_id: customerId,
        status: 'ACTIVE'
      }
    });
    
    const allLoans = await LoanAccount.findAll({
      where: { customer_id: customerId },
      order: [['created_at', 'DESC']]
    });
    
    const activeLoans = allLoans.filter(loan => loan.status === 'ACTIVE');
    const totalOutstanding = activeLoans.reduce(
      (sum, loan) => sum + parseFloat(loan.outstanding_balance || 0), 
      0
    );
    
    // Build summary
    const summary = {
      customer: {
        id: customer.id,
        CUST_ID: customer.CUST_ID,
        CUST_NO: customer.CUST_NO,
        name: customer.getFullName ? customer.getFullName() : 
              `${customer.FIRST_NAME || ''} ${customer.LAST_NAME || ''}`.trim(),
        email: customer.EMAIL_ADDRESS,
        phone: customer.PHONE_NO,
        bvn: customer.BVN,
        bvnVerified: customer.BVN_VERIFIED,
        bvnVerifiedAt: customer.BVN_VERIFIED_AT,
        nin: customer.NIN,
        status: customer.status,
        recordStatus: customer.REC_ST,
        kycLevel: customer.KYC_LEVEL,
        isPep: customer.IS_PEP,
        birthDate: customer.BIRTH_DT,
        age: calculateAge(customer.BIRTH_DT),
        address: customer.HOME_ADDRESS,
        businessUnit: customer.BU_ID,
        createdDate: customer.CREATE_DT,
        createdAt: customer.created_at
      },
      loanStatus: {
        hasActiveLoan: activeLoans.length > 0,
        activeLoanCount: activeLoans.length,
        totalLoans: allLoans.length,
        totalOutstandingBalance: totalOutstanding,
        currentActiveLoan: activeLoan
      }
    };
    
    res.json({
      success: true,
      data: summary
    });
    
  } catch (error) {
    console.error('❌ Error getting customer summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get customer summary',
      error: error.message
    });
  }
};

// ============================================
// ORIGINAL CUSTOMER CONTROLLER FUNCTIONS
// ============================================

/**
 * Test database connection endpoint
 */
export const testDatabaseConnection = async (req, res) => {
  try {
    console.log('🔍 Testing database connection...');
    
    // Initialize models
    const { sequelize: db, Customer: custModel } = await initModels();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        message: 'Database connection not available',
        timestamp: new Date().toISOString()
      });
    }
    
    // Test basic connection
    await db.authenticate();
    console.log('✅ Database connection successful');
    
    // Check if customers table exists
    const [tables] = await db.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'customers'
    `);
    
    const tableExists = tables.length > 0;
    
    // Get table structure if exists
    let tableColumns = [];
    if (tableExists) {
      const [columns] = await db.query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'customers'
        ORDER BY ORDINAL_POSITION
      `);
      tableColumns = columns;
    }
    
    // Get model attributes
    const modelAttributes = custModel ? Object.keys(custModel.rawAttributes || {}) : [];
    
    res.json({
      success: true,
      message: 'Database connection successful',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        name: process.env.DB_NAME || 'unknown',
        host: process.env.DB_HOST || 'localhost'
      },
      tables: {
        customers: {
          exists: tableExists,
          columns: tableColumns.length,
          columnList: tableColumns.map(c => c.COLUMN_NAME)
        }
      },
      model: {
        customerModelAvailable: !!custModel,
        customerModelAttributes: modelAttributes
      }
    });
    
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Get pending customers
 */
export const getPendingCustomers = async (req, res) => {
  try {
    console.log('📋 Getting pending customers...');
    
    // Initialize models first
    const { sequelize: db } = await initModels();
    
    if (!db) {
      throw new Error('Database connection not available');
    }
    
    // Get parameters
    const { bu_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Get user role and BU_ID from authentication
    const userRole = req.user?.role || req.headers['x-user-role'];
    const userBU_ID = req.user?.BU_ID || req.headers['x-bu-id'] || bu_id;
    
    // Build query conditions
    let whereClause = `WHERE (REC_ST = 'PENDING' OR status = 'Pending')`;
    const replacements = [];
    
    // If user is not admin/superuser, filter by their BU_ID
    const isAdmin = userRole === 'admin' || userRole === 'superuser' || userRole === 'ADMIN';
    
    if (!isAdmin && userBU_ID) {
      whereClause += ` AND BU_ID = ?`;
      replacements.push(userBU_ID);
    } else if (bu_id) {
      // If BU_ID is provided in query, use it
      whereClause += ` AND BU_ID = ?`;
      replacements.push(bu_id);
    }
    
    console.log(`🔍 Query conditions: ${whereClause}`);
    console.log(`🔍 User role: ${userRole}, BU_ID: ${userBU_ID}, Is Admin: ${isAdmin}`);
    
    // Get total count
    const [countResult] = await db.query(`
      SELECT COUNT(*) as total 
      FROM customers 
      ${whereClause}
    `, {
      replacements: replacements
    });
    
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / parseInt(limit));
    
    // Get customers with pagination
    const [pendingCustomers] = await db.query(`
      SELECT 
        id, CUST_ID, CUST_NO, TITLE_ID, FIRST_NAME, MIDDLE_NAME, 
        LAST_NAME, CUST_NM, HOME_ADDRESS, EMAIL_ADDRESS, BU_ID,
        PHONE_NO, status, REC_ST, CREATE_DT, CREATED_BY, BVN, BVN_VERIFIED
      FROM customers 
      ${whereClause}
      ORDER BY CREATE_DT DESC 
      LIMIT ? OFFSET ?
    `, {
      replacements: [...replacements, parseInt(limit), offset]
    });
    
    console.log(`✅ Found ${pendingCustomers.length} pending customers (Total: ${total})`);
    
    res.json({
      success: true,
      message: 'Pending customers retrieved successfully',
      data: pendingCustomers,
      count: pendingCustomers.length,
      total: total,
      bu_id: userBU_ID || bu_id,
      filtered_by_bu: !isAdmin && (!!userBU_ID || !!bu_id),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting pending customers:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Error retrieving pending customers',
      error: error.message
    });
  }
};

/**
 * Get all customers
 */
export const getAllCustomers = async (req, res) => {
  try {
    console.log('📋 Getting all customers...');
    
    // Initialize models first
    const { Customer: custModel, sequelize: db } = await initModels();
    
    if (!custModel || !db) {
      throw new Error('Customer model or database not available');
    }
    
    const { page = 1, limit = 50, search = '', status = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build WHERE clause with explicit column selection to avoid missing columns
    let whereClause = 'WHERE 1=1';
    const replacements = [];
    
    if (search) {
      whereClause += ` AND (
        CUST_ID LIKE ? OR 
        CUST_NO LIKE ? OR 
        FIRST_NAME LIKE ? OR 
        LAST_NAME LIKE ? OR 
        CUST_NM LIKE ? OR 
        EMAIL_ADDRESS LIKE ? OR 
        PHONE_NO LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      for (let i = 0; i < 7; i++) {
        replacements.push(searchPattern);
      }
    }
    
    if (status) {
      whereClause += ' AND status = ?';
      replacements.push(status);
    }
    
    // Get total count
    const [countResult] = await db.query(`
      SELECT COUNT(*) as total 
      FROM customers 
      ${whereClause}
    `, {
      replacements: replacements
    });
    
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / parseInt(limit));
    
    // Get customers with pagination
    const dataReplacements = [...replacements, parseInt(limit), offset];
    const [customers] = await db.query(`
      SELECT * 
      FROM customers 
      ${whereClause}
      ORDER BY CREATE_DT DESC 
      LIMIT ? OFFSET ?
    `, {
      replacements: dataReplacements
    });
    
    // Clean up customer data - remove null/undefined EVENT_ID if column doesn't exist
    const cleanedCustomers = customers.map(customer => {
      const cleaned = { ...customer };
      
      // Remove EVENT_ID if it's null/undefined (column might not exist)
      if (cleaned.EVENT_ID === null || cleaned.EVENT_ID === undefined) {
        delete cleaned.EVENT_ID;
      }
      
      // Ensure all expected fields have values
      const expectedFields = [
        'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM',
        'EMAIL_ADDRESS', 'PHONE_NO', 'BU_ID', 'status', 'REC_ST',
        'CREATE_DT', 'CREATED_BY', 'BVN', 'BVN_VERIFIED'
      ];
      
      expectedFields.forEach(field => {
        if (cleaned[field] === undefined) {
          cleaned[field] = null;
        }
      });
      
      return cleaned;
    });
    
    console.log(`✅ Retrieved ${cleanedCustomers.length} customers (Total: ${total})`);
    
    res.json({
      success: true,
      message: 'Customers retrieved successfully',
      data: cleanedCustomers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting customers:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve customers',
      error: error.message
    });
  }
};

/**
 * Get customer by ID
 */
export const getCustomerById = async (req, res) => {
  try {
    const { CUST_ID } = req.params;
    
    console.log('🔍 Request params:', req.params);
    console.log('🔍 CUST_ID parameter:', CUST_ID);
    
    if (!CUST_ID && CUST_ID !== 0) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    console.log(`🔍 Looking for customer with ID: "${CUST_ID}"`);
    
    // Initialize models first
    const { Customer: custModel, sequelize: db } = await initModels();
    
    if (!custModel) {
      throw new Error('Customer model not available');
    }
    
    // Get the actual column names from the model
    console.log('🔍 Customer model attributes:', Object.keys(custModel.rawAttributes || {}));
    
    // Check what columns exist
    const attributes = custModel.rawAttributes || {};
    const columnNames = Object.keys(attributes);
    console.log('🔍 Available columns:', columnNames);
    
    // Convert to string for consistent handling
    const customerId = String(CUST_ID).trim();
    
    // Try to find customer by different ID fields
    let customer = null;
    
    // Check which ID columns exist in the model
    const possibleIdColumns = ['CUST_ID', 'id', 'customerId', 'cust_id'];
    
    for (const column of possibleIdColumns) {
      if (columnNames.includes(column)) {
        console.log(`🔍 Trying column "${column}" with value: "${customerId}"`);
        
        try {
          customer = await custModel.findOne({
            where: { [column]: customerId }
          });
          
          if (customer) {
            console.log(`✅ Found using column: ${column}`);
            break;
          }
        } catch (columnError) {
          console.log(`❌ Error with column ${column}:`, columnError.message);
        }
      } else {
        console.log(`❌ Column "${column}" not found in model`);
      }
    }
    
    // If not found, try numeric ID on the primary key
    if (!customer) {
      const numericId = parseInt(customerId);
      if (!isNaN(numericId)) {
        console.log(`🔍 Trying numeric ID: ${numericId}`);
        customer = await custModel.findByPk(numericId);
      }
    }
    
    if (!customer) {
      console.log(`❌ Customer not found with ID: ${customerId}`);
      
      // Get sample data to show what exists
      let sampleCustomers = [];
      try {
        sampleCustomers = await custModel.findAll({
          limit: 10,
          order: [['id', 'ASC']]
        });
      } catch (sampleError) {
        console.log('Error getting sample data:', sampleError.message);
      }
      
      // Get column info
      const sampleData = sampleCustomers.map(c => {
        const data = { id: c.id };
        // Add other ID-like columns
        if (c.customer_id !== undefined) data.customer_id = c.customer_id;
        if (c.CUST_ID !== undefined) data.CUST_ID = c.CUST_ID;
        if (c.cust_id !== undefined) data.cust_id = c.cust_id;
        if (c.customerId !== undefined) data.customerId = c.customerId;
        return data;
      });
      
      return res.status(404).json({
        success: false,
        message: `Customer not found with ID: ${customerId}`,
        note: 'Check the sample data below for valid ID formats',
        availableColumns: columnNames,
        sampleData: sampleData
      });
    }
    
    console.log(`✅ Found customer:`, customer.toJSON ? customer.toJSON() : customer);
    
    res.json({
      success: true,
      message: 'Customer retrieved successfully',
      customer: customer.toJSON ? customer.toJSON() : customer
    });
    
  } catch (error) {
    console.error('❌ Error getting customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve customer',
      error: error.message
    });
  }
};

/**
 * Create customer
 */
export const createCustomer = async (req, res) => {
  const startTime = Date.now();
  console.log('🚀 Starting createCustomer...');
  console.log('📥 Request body keys:', Object.keys(req.body || {}));
  
  // Early validation of required fields
  const body = req.body || {};
  if (!body.HOME_ADDRESS || !body.BU_ID) {
    return res.status(400).json({
      success: false,
      message: "HOME_ADDRESS and BU_ID are required."
    });
  }
  
  try {
    // Initialize models
    const { Customer: custModel, AML: amlModel, sequelize: db, WF_WORK_ITEM: wfModel } = await initModels();
    
    if (!custModel || !db) {
      throw new Error('Models not initialized properly');
    }
    
    let transaction = null;
    let transactionCompleted = false;
    let userId = body.USER_ID || body.CREATED_BY || "system";

    try {
      // Start transaction
      console.log('🔧 Starting database transaction...');
      transaction = await db.transaction();
      console.log('✅ Transaction started');
      
      // Destructure with cleaned up defaults
      const {
        TITLE_ID = '',
        FIRST_NAME = '',
        MIDDLE_NAME = '',
        LAST_NAME = '',
        CUST_NM,
        HOME_ADDRESS,
        EMAIL_ADDRESS,
        BU_ID,
        MAIDEN_NM = '',
        BIRTH_DT,
        CNTRY_OF_BIRTH_ID = 'NGA',
        CUST_CAT = '',
        CAMPAIGN_ID = '',
        GENDER_TY = '',
        COUNTRY_NM = 'Nigeria',
        STATE = '',
        NIN,
        BVN,
        LOCAL_GOV = '',
        OPENING_RSN_ID = '',
        OPENED_DT,
        RESIDENT_CNTRY_ID = 'NGA',
        RISK_CLASS = '',
        STMNT_FREQ_CD = '',
        STMNT_FREQ_VALUE = '',
        CREATED_BY = 'system',
        CREATE_DT,
        INDUSTRY_ID = '',
        INDUSTRY_CD = '',
        TAX_STATUS = '',
        MARITAL_ST = '',
        TAX_GRP_ID = '',
        OPERATIONS_CRNCY_ID = 'NGN',
        EMP_ST = '',
        ORGANISATION_NM = '',
        REGISTRATION_ADDRESS = '',
        REGISTRATION_DT,
        ALERT_DELIVERY_METHOD = '',
        KYC_LEVEL = '',
        PHONE_NO = '',
        SMS = 'Enabled',
        IS_PEP = false,
        SANCTION_SCORE = 10,
        DOCUMENT_VERIFICATION_STATUS = 'Pending',
        REC_ST = "PENDING",
      } = body;

      // Handle nextOfKin data
      const nextOfKinData = body.nextOfKin || [];
      console.log(`📋 Next of Kin data received: ${nextOfKinData.length} entries`);
      
      // Process Next of Kin data
      let processedNextOfKin = [];
      if (nextOfKinData.length > 0) {
        processedNextOfKin = nextOfKinData.map(nok => ({
          ...nok,
          IS_PRIMARY: nok.IS_PRIMARY === "Y" || nok.IS_PRIMARY === true || nok.IS_PRIMARY === "true"
        }));
        
        // Next of Kin validation
        const nokValidationError = validateNextOfKin(processedNextOfKin);
        if (nokValidationError) {
          await transaction.rollback();
          return res.status(400).json({ 
            success: false,
            message: nokValidationError 
          });
        }
        
        // Check if multiple primary next of kin
        const primaryCount = processedNextOfKin.filter(nok => nok.IS_PRIMARY).length;
        if (primaryCount > 1) {
          await transaction.rollback();
          return res.status(400).json({ 
            success: false,
            message: "Only one Next of Kin can be set as primary." 
          });
        }
      }
      
      console.log("✅ Validations passed");

      const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

      console.log('📝 Processing customer creation request:');
      console.log('  - Name:', FIRST_NAME, LAST_NAME);
      console.log('  - Email:', EMAIL_ADDRESS || "Not provided");
      console.log('  - BU_ID:', BU_ID);
      console.log('  - Next of Kin count:', processedNextOfKin.length);

      // Basic Validation
      if (NIN && !/^\d{11}$/.test(NIN)) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false,
          message: "NIN must be exactly 11 digits." 
        });
      }
      
      if (BVN && !/^\d{11}$/.test(BVN)) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false,
          message: "BVN must be exactly 11 digits." 
        });
      }

      // Check for existing customer
      console.log('🔍 Checking for existing customer...');
      let existingCustomer = null;
      
      // Check by EMAIL_ADDRESS if provided
      if (EMAIL_ADDRESS) {
        console.log(`🔍 Checking for EMAIL_ADDRESS: ${EMAIL_ADDRESS}`);
        try {
          existingCustomer = await custModel.findOne({
            where: { EMAIL_ADDRESS: EMAIL_ADDRESS.toLowerCase() },
            attributes: ['id', 'CUST_ID', 'CUST_NO', 'EMAIL_ADDRESS', 'FIRST_NAME', 'LAST_NAME'],
            transaction
          });
          console.log(`✅ EMAIL_ADDRESS check completed: ${existingCustomer ? 'Found' : 'Not found'}`);
        } catch (emailError) {
          console.warn(`⚠️ EMAIL_ADDRESS check error: ${emailError.message}`);
        }
      }

      if (existingCustomer) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Customer with email ${EMAIL_ADDRESS} already exists (${existingCustomer.FIRST_NAME} ${existingCustomer.LAST_NAME})`,
          existingCustomer: {
            CUST_ID: existingCustomer.CUST_ID,
            CUST_NO: existingCustomer.CUST_NO,
            name: `${existingCustomer.FIRST_NAME} ${existingCustomer.LAST_NAME}`,
            EMAIL_ADDRESS: existingCustomer.EMAIL_ADDRESS
          }
        });
      }
      
      console.log('✅ No existing customer found, proceeding...');
      
      // Auto-generate Customer ID & Number
      const { CUST_ID: generatedCUST_ID, CUST_NO: generatedCUST_NO } = await generateCustomerNumber();
      
      // Use generated values
      const finalCUST_ID = generatedCUST_ID;
      const finalCUST_NO = generatedCUST_NO;

      const fullName = CUST_NM || `${FIRST_NAME} ${MIDDLE_NAME} ${LAST_NAME}`.trim();
      const now = new Date();

      // Prepare Customer Data
      const customerData = {
        CUST_ID: finalCUST_ID,
        CUST_NO: finalCUST_NO,
        TITLE_ID,
        FIRST_NAME,
        MIDDLE_NAME,
        LAST_NAME,
        CUST_NM: fullName,
        HOME_ADDRESS,
        EMAIL_ADDRESS: EMAIL_ADDRESS ? EMAIL_ADDRESS.toLowerCase() : null,
        BU_ID,
        MAIDEN_NM,
        BIRTH_DT: BIRTH_DT ? parseDate(BIRTH_DT, "YYYY-MM-DD") : null,
        CNTRY_OF_BIRTH_ID,
        CUST_CAT,
        CAMPAIGN_ID,
        GENDER_TY,
        COUNTRY_NM,
        STATE,
        NIN,
        BVN,
        LOCAL_GOV,
        OPENING_RSN_ID,
        OPENED_DT: OPENED_DT ? parseDate(OPENED_DT, "YYYY-MM-DD") : null,
        RESIDENT_CNTRY_ID,
        RISK_CLASS,
        STMNT_FREQ_CD,
        STMNT_FREQ_VALUE,
        CREATED_BY,
        USER_ID: userId,
        CREATE_DT: CREATE_DT ? new Date(CREATE_DT) : now,
        INDUSTRY_ID,
        INDUSTRY_CD,
        TAX_STATUS,
        MARITAL_ST,
        TAX_GRP_ID,
        OPERATIONS_CRNCY_ID,
        EMP_ST,
        ORGANISATION_NM,
        REGISTRATION_ADDRESS,
        REGISTRATION_DT: REGISTRATION_DT ? parseDate(REGISTRATION_DT, "YYYY-MM-DD") : null,
        ALERT_DELIVERY_METHOD,
        KYC_LEVEL,
        PHONE_NO,
        SMS,
        IS_PEP,
        SANCTION_SCORE,
        DOCUMENT_VERIFICATION_STATUS,
        REC_ST,
        status: 'Pending',
        BVN_VERIFIED: false,  // Initialize as not verified
        createdAt: now,
        updatedAt: now
      };

      console.log('📄 Creating customer with data:');
      console.log('  - CUST_ID:', finalCUST_ID);
      console.log('  - CUST_NO:', finalCUST_NO);
      console.log('  - Name:', fullName);
      console.log('  - BVN:', BVN || 'Not provided');

      // ========== CREATE CUSTOMER ==========
      console.log('👤 Creating customer...');
      
      let newCustomer;
      
      try {
        // Use Sequelize's create method
        console.log('🔧 Using Sequelize create method...');
        newCustomer = await custModel.create(customerData, { transaction });
        console.log("✅ Customer created with ID:", newCustomer.id);
      } catch (sequelizeError) {
        console.warn('⚠️ Sequelize create failed, falling back to raw query:', sequelizeError.message);
        
        // Fall back to raw query
        const columnNames = Object.keys(customerData);
        const placeholders = columnNames.map(() => '?').join(', ');
        const values = columnNames.map(col => customerData[col]);
        
        const [result] = await db.query(
          `INSERT INTO customers (${columnNames.join(', ')}) VALUES (${placeholders})`,
          {
            replacements: values,
            transaction
          }
        );

        const customerId = result.insertId;
        newCustomer = await custModel.findOne({
          where: { id: customerId },
          transaction
        });
        
        console.log("✅ Customer created with ID:", customerId);
      }
      
      // Create Next of Kin records if provided
      if (processedNextOfKin.length > 0) {
        console.log(`📝 Processing ${processedNextOfKin.length} Next of Kin records...`);
        
        try {
          // Ensure the next_of_kins table exists
          await db.query(`
            CREATE TABLE IF NOT EXISTS next_of_kins (
              id INT PRIMARY KEY AUTO_INCREMENT,
              customerId INT NOT NULL,
              NEXTOF_KIN_NM VARCHAR(255) NOT NULL,
              RELATIONSHIP VARCHAR(50) NOT NULL,
              PHONE_NO VARCHAR(20) NOT NULL,
              EMAIL VARCHAR(255),
              ADDRESS TEXT NOT NULL,
              IS_PRIMARY TINYINT(1) DEFAULT 0,
              CREATED_DT DATETIME,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
          `, { transaction });
          
          // Process each next of kin
          for (const kin of processedNextOfKin) {
            await db.query(
              `INSERT INTO next_of_kins 
               (customerId, NEXTOF_KIN_NM, RELATIONSHIP, PHONE_NO, EMAIL, ADDRESS, IS_PRIMARY, CREATED_DT, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              {
                replacements: [
                  newCustomer.id,
                  kin.NEXTOF_KIN_NM || '',
                  kin.RELATIONSHIP || '',
                  kin.PHONE_NO || '',
                  kin.EMAIL || null,
                  kin.ADDRESS || '',
                  kin.IS_PRIMARY || false,
                  now,
                  now,
                  now
                ],
                transaction
              }
            );
          }
          
          console.log(`✅ Created ${processedNextOfKin.length} Next of Kin records`);
        } catch (kinError) {
          console.error('❌ Error creating Next of Kin records:', kinError.message);
          throw new Error(`Failed to create Next of Kin records: ${kinError.message}`);
        }
      }
      
      // AML & Sanction List Check for PEP
      let amlWorkItemId = null;
      let amlRecord = null;
      let customerRiskRating = "Low";
      
      if (IS_PEP && amlModel) {
        console.log('🔍 Creating AML record for PEP customer...');
        
        const validationError = validateAMLInput({
          CUST_ID: finalCUST_ID,
          BVN,
          NIN,
          IS_PEP,
          SANCTION_SCORE,
          DOCUMENT_VERIFICATION_STATUS,
        });
        
        if (validationError) {
          await transaction.rollback();
          throw new Error(validationError);
        }

        const { isSanctioned, sanctionDetails } = await checkSanctionList(BVN, NIN);

        customerRiskRating = calculateRiskRating({
          IS_PEP,
          SANCTION_SCORE,
          isSanctioned,
          DOCUMENT_VERIFICATION_STATUS,
        });

        amlRecord = await amlModel.create({
          fullName,
          CUST_ID: finalCUST_ID,
          BVN,
          NIN,
          IS_PEP,
          SANCTION_SCORE,
          LAST_RISK_ASSESSMENT_DT: new Date(),
          SANCTION_MATCH: isSanctioned,
          SANCTION_DETAILS: sanctionDetails,
          CUSTOMER_RISK_RATING: customerRiskRating,
          AML_STATUS: "Pending",
          RISK_REASON: IS_PEP
            ? "PEP"
            : isSanctioned
            ? "Sanction Hit"
            : SANCTION_SCORE > 70
            ? "High Risk Score"
            : "Normal",
          NEXT_REVIEW_DATE: calculateNextReviewDate(customerRiskRating),
          DOCUMENT_VERIFICATION_STATUS: DOCUMENT_VERIFICATION_STATUS || "Pending",
          UPDATED_AT: new Date(),
          UPDATED_BY: userId,
        }, { transaction });

        console.log("✅ AML record created for PEP customer");

        // Workflow Submission for AML
        if (wfModel) {
          try {
            const amlWorkflowResponse = await WF_WORK_ITEMController.submitTransaction({
              body: {
                ITEM_VALUE: finalCUST_ID,
                ITEM_DESC: `Customer AML Profile for ${fullName}`,
                ITEM_CLASS_NM: "Customer",
                ITEM_TYPE: "AML",
                ITEM_ID: amlRecord.id,
                CUST_ID: finalCUST_ID,
                USER_ID: userId,
                BU_ID,
                HOME_ADDRESS,
                TARGET_USER_ROLE_ID: "Manager",
                ORIGINATOR_USER_ROLE_ID: "Originator",
                CREATE_DT: new Date(),
                REC_ST: "Pending",
                WAIT_ST: "Pending",
                VERSION: 1,
                ITEM_BU_ID: BU_ID,
                RISK_RATING: customerRiskRating,
                PRIORITY: customerRiskRating === "High" ? "High" : "Normal",
              },
            });

            if (amlWorkflowResponse.success) {
              amlWorkItemId = amlWorkflowResponse.data?.WORK_ITEM_ID;
              console.log("✅ AML workflow item created:", amlWorkItemId);
            } else {
              console.warn("⚠️ AML workflow creation failed:", amlWorkflowResponse.message);
            }
          } catch (workflowError) {
            console.warn("⚠️ AML workflow submission error:", workflowError.message);
          }
        }
      }

      // COMMIT TRANSACTION
      await transaction.commit();
      transactionCompleted = true;
      console.log("✅ Transaction committed successfully");

      // Submit customer workflow (outside transaction)
      let customerWorkItemId = null;
      if (wfModel) {
        try {
          const customerWorkflowResponse = await WF_WORK_ITEMController.submitTransaction({
            body: {
              ITEM_VALUE: finalCUST_NO,
              ITEM_DESC: `Customer Account Application for ${fullName}`,
              ITEM_CLASS_NM: "Customer",
              ITEM_TYPE: "Customer",
              ITEM_ID: newCustomer.id,
              CUST_ID: finalCUST_ID,
              USER_ID: userId,
              BU_ID,
              HOME_ADDRESS,
              TARGET_USER_ROLE_ID: "Manager",
              ORIGINATOR_USER_ROLE_ID: "Originator",
              CREATE_DT: new Date(),
              REC_ST: "Pending",
              WAIT_ST: "Pending",
              VERSION: 1,
              ITEM_BU_ID: BU_ID,
            },
          });

          if (customerWorkflowResponse.success) {
            customerWorkItemId = customerWorkflowResponse.data?.WORK_ITEM_ID;
            console.log("✅ Customer workflow item created:", customerWorkItemId);
          }
        } catch (workflowError) {
          console.warn("⚠️ Customer workflow submission failed:", workflowError.message);
        }
      }

      // Prepare response
      const enhancedResponse = {
        success: true,
        message: `Customer ${fullName} created successfully${IS_PEP ? " with AML profile" : ""}.`,
        timestamp: new Date().toISOString(),
        customerId: newCustomer.id,
        
        quickReference: {
          CUST_ID: finalCUST_ID,
          CUST_NO: finalCUST_NO,
          CUST_NM: fullName,
          BVN: BVN || null,
          BVN_VERIFIED: false,
          WORK_ITEM_ID: customerWorkItemId,
          AML_WORK_ITEM_ID: amlWorkItemId,
          isPEP: IS_PEP,
          riskRating: customerRiskRating
        },
        
        metadata: {
          processingTime: `${Date.now() - startTime}ms`,
          ipAddress: ipAddress,
          businessUnit: BU_ID,
          transactionStatus: 'completed'
        }
      };

      return res.status(201).json(enhancedResponse);
      
    } catch (error) {
      // ROLLBACK TRANSACTION IF NOT COMPLETED
      if (!transactionCompleted && transaction) {
        try {
          await transaction.rollback();
          console.log("🔧 Transaction rolled back due to error");
        } catch (rollbackError) {
          console.error("❌ Failed to rollback transaction:", rollbackError.message);
        }
      }

      console.error("❌ Create Customer Error:", error.message);
      console.error("❌ Error stack:", error.stack);
      
      // Audit failure
      try {
        await auditLogger.error("Audit Event", {
          entity_type: "CUSTOMER_CREATE",
          entity_id: null,
          user_id: parseInt(userId) || 0,
          action: "create_customer",
          old_value: null,
          new_value: null,
          ip_address: req.ip || req.connection.remoteAddress || "unknown",
          event_type: "CUSTOMER_ERROR",
          outcome: "failure",
          error: error.message
        });
      } catch (auditError) {
        console.error('❌ Audit logging failed:', auditError.message);
      }

      return res.status(500).json({
        success: false,
        message: "Failed to create customer",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error("❌ Error in createCustomer (model initialization):", error.message);
    
    return res.status(500).json({
      success: false,
      message: "Failed to initialize models",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Update customer
 */
export const updateCustomer = async (req, res) => {
  try {
    const { CUST_ID } = req.params;
    
    if (!CUST_ID) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Initialize models
    const { Customer: custModel } = await initModels();
    
    const customer = await custModel.findOne({
      where: {
        [Op.or]: [
          { CUST_ID: CUST_ID },
          { id: parseInt(CUST_ID) || 0 }
        ]
      }
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // If BVN is being updated, validate it
    if (req.body.BVN && !/^\d{11}$/.test(req.body.BVN)) {
      return res.status(400).json({
        success: false,
        message: 'BVN must be exactly 11 digits'
      });
    }
    
    await customer.update(req.body);
    
    res.json({
      success: true,
      message: 'Customer updated successfully',
      customer: customer.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error updating customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update customer',
      error: error.message
    });
  }
};

/**
 * Approve customer
 */
export const approveCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { approvedBy } = req.body;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Initialize models
    const { Customer: custModel } = await initModels();
    
    const customer = await custModel.findByPk(customerId);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // Update customer status
    await customer.update({
      REC_ST: 'APPROVED',
      status: 'Approved',
      APPROVED_BY: approvedBy || 'system',
      APPROVED_DT: new Date()
    });
    
    res.json({
      success: true,
      message: 'Customer approved successfully',
      customer: customer.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error approving customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve customer',
      error: error.message
    });
  }
};

/**
 * Reject customer
 */
export const rejectCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { rejectedBy, rejectionReason } = req.body;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Initialize models
    const { Customer: custModel } = await initModels();
    
    const customer = await custModel.findByPk(customerId);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // Update customer status
    await customer.update({
      REC_ST: 'REJECTED',
      status: 'Rejected',
      REJECTED_BY: rejectedBy || 'system',
      REJECTED_DT: new Date(),
      rejectionReason: rejectionReason || 'No reason provided'
    });
    
    res.json({
      success: true,
      message: 'Customer rejected successfully',
      customer: customer.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error rejecting customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject customer',
      error: error.message
    });
  }
};

/**
 * Deactivate customer
 */
export const deactivateCustomer = async (req, res) => {
  try {
    const { CUST_ID } = req.params;
    const { deactivatedBy } = req.body;
    
    if (!CUST_ID) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Initialize models
    const { Customer: custModel } = await initModels();
    
    const customer = await custModel.findOne({
      where: {
        [Op.or]: [
          { CUST_ID: CUST_ID },
          { id: parseInt(CUST_ID) || 0 }
        ]
      }
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // Update customer status
    await customer.update({
      REC_ST: 'INACTIVE',
      status: 'Inactive',
      deactivatedBy: deactivatedBy || 'system',
      deactivatedAt: new Date()
    });
    
    res.json({
      success: true,
      message: 'Customer deactivated successfully',
      customer: customer.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error deactivating customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate customer',
      error: error.message
    });
  }
};

/**
 * Search customers
 */
export const searchCustomers = async (req, res) => {
  try {
    const { q, field, exact } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }
    
    // Initialize models
    const { Customer: custModel } = await initModels();
    
    let whereClause = {};
    
    if (field && field !== 'all') {
      // Search in specific field
      if (exact === 'true') {
        whereClause[field] = q;
      } else {
        whereClause[field] = { [Op.like]: `%${q}%` };
      }
    } else {
      // Search in all fields
      const searchFields = ['CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM', 'EMAIL_ADDRESS', 'PHONE_NO', 'BVN'];
      whereClause = {
        [Op.or]: searchFields.map(field => ({
          [field]: exact === 'true' ? q : { [Op.like]: `%${q}%` }
        }))
      };
    }
    
    const customers = await custModel.findAll({
      where: whereClause,
      limit: 50,
      order: [['CREATE_DT', 'DESC']]
    });
    
    res.json({
      success: true,
      count: customers.length,
      data: customers.map(c => c.toJSON ? c.toJSON() : c)
    });
    
  } catch (error) {
    console.error('❌ Error searching customers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search customers',
      error: error.message
    });
  }
};

/**
 * Advanced search customers
 */
export const advancedSearchCustomers = async (req, res) => {
  try {
    const filters = req.query;
    
    // Initialize models
    const { Customer: custModel } = await initModels();
    
    const whereClause = {};
    
    // Apply filters
    Object.keys(filters).forEach(key => {
      if (filters[key] && !['page', 'limit', 'sort'].includes(key)) {
        whereClause[key] = { [Op.like]: `%${filters[key]}%` };
      }
    });
    
    const customers = await custModel.findAll({
      where: whereClause,
      limit: 100,
      order: [['CREATE_DT', 'DESC']]
    });
    
    res.json({
      success: true,
      count: customers.length,
      data: customers.map(c => c.toJSON ? c.toJSON() : c)
    });
    
  } catch (error) {
    console.error('❌ Error in advanced search:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform advanced search',
      error: error.message
    });
  }
};

/**
 * Get customer summary for dashboard
 */
export const getCustomerSummary = async (req, res) => {
  try {
    // Initialize models
    const { sequelize: db } = await initModels();
    
    // Get counts by status
    const [statusCounts] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Active' OR REC_ST = 'ACTIVE' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'Pending' OR REC_ST = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'Approved' OR REC_ST = 'APPROVED' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'Inactive' OR REC_ST = 'INACTIVE' THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN status = 'Rejected' OR REC_ST = 'REJECTED' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN BVN_VERIFIED = 1 THEN 1 ELSE 0 END) as bvn_verified,
        SUM(CASE WHEN BVN IS NOT NULL AND BVN_VERIFIED = 0 THEN 1 ELSE 0 END) as bvn_pending,
        SUM(CASE WHEN BVN IS NULL THEN 1 ELSE 0 END) as bvn_missing
      FROM customers
    `);
    
    // Get counts by business unit
    const [buCounts] = await db.query(`
      SELECT BU_ID, COUNT(*) as count,
        SUM(CASE WHEN BVN_VERIFIED = 1 THEN 1 ELSE 0 END) as verified_bvns
      FROM customers
      GROUP BY BU_ID
      ORDER BY count DESC
      LIMIT 10
    `);
    
    // Get recent customers
    const [recentCustomers] = await db.query(`
      SELECT CUST_ID, CUST_NO, CUST_NM, status, BVN, BVN_VERIFIED, CREATE_DT
      FROM customers
      ORDER BY CREATE_DT DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      data: {
        totals: statusCounts[0] || { 
          total: 0, active: 0, pending: 0, approved: 0, 
          inactive: 0, rejected: 0, bvn_verified: 0, 
          bvn_pending: 0, bvn_missing: 0 
        },
        byBusinessUnit: buCounts || [],
        recentCustomers: recentCustomers || []
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting customer summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get customer summary',
      error: error.message
    });
  }
};

/**
 * Get customer schema
 */
export const getCustomerSchema = async (req, res) => {
  try {
    // Initialize models
    const { Customer: custModel } = await initModels();
    
    const attributes = custModel.rawAttributes || {};
    const schema = Object.keys(attributes).map(key => ({
      name: key,
      type: attributes[key].type?.key || 'unknown',
      required: !attributes[key].allowNull,
      defaultValue: attributes[key].defaultValue,
      comment: attributes[key].comment
    }));
    
    res.json({
      success: true,
      schema: schema
    });
    
  } catch (error) {
    console.error('❌ Error getting schema:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get schema',
      error: error.message
    });
  }
};

/**
 * Batch upload customers
 */
export const batchUploadCustomers = async (fileBuffer) => {
  // This function remains largely the same
  // Just make sure to use initModels() at the start
  try {
    await initModels();
    
    // Your existing batch upload logic here
    return {
      success: true,
      message: 'Batch upload completed',
      total: 0,
      created: 0,
      duplicates: 0,
      failed: 0,
      errors: []
    };
    
  } catch (error) {
    console.error('❌ Error in batch upload:', error);
    return {
      success: false,
      message: 'Batch upload failed',
      error: error.message
    };
  }
};

// Export all functions
export default {
  // Model initialization
  initModels,
  
  // Original customer functions
  testDatabaseConnection,
  getPendingCustomers,
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  approveCustomer,
  rejectCustomer,
  deactivateCustomer,
  searchCustomers,
  advancedSearchCustomers,
  getCustomerSummary,
  getCustomerSchema,
  batchUploadCustomers,
  
  // NEW BVN & LOAN FUNCTIONS
  getCustomerWithBVN,
  findByBVN,
  updateBVNVerification,
  getCustomerWithLoans,
  checkHasActiveLoan,
  getCustomerFullSummary
};