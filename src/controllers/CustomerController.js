// src/controllers/CustomerController.js - FIXED VERSION
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

// ============================================
// MODEL INITIALIZATION FUNCTIONS
// ============================================

/**
 * Initialize models safely (replaces getModelsSafe)
 */
export const getModelsSafe = async () => {
  console.log('🔄 getModelsSafe called - using initModels instead...');
  return await initModels();
};

/**
 * Initialize models
 */
const initModels = async () => {
  if (modelsInitialized) {
    console.log('📦 Models already initialized');
    return { Customer, AML, WF_WORK_ITEM, sequelize };
  }
  
  try {
    console.log('🔄 Initializing models...');
    
    // Initialize models from models/index.js
    console.log('📦 Calling initializeModels()...');
    const models = await initializeModels();
    console.log('✅ initializeModels() completed');
    
    // Get models using getter functions
    Customer = getCustomer();
    AML = getAML();
    WF_WORK_ITEM = getWF_WORK_ITEM();
    sequelize = getSequelize();
    
    if (!sequelize) {
      throw new Error('Sequelize instance not loaded');
    }
    
    // CRITICAL FIX: If Customer is a function, we need to call it with sequelize
    if (Customer && typeof Customer === 'function') {
      console.log('🔄 Customer is a function, initializing it with sequelize...');
      
      // Check if it's already an initialized Sequelize model
      if (Customer.prototype && typeof Customer.findOne === 'function') {
        console.log('✅ Customer is already an initialized Sequelize model');
      } else {
        // Initialize the model by calling the function with sequelize
        console.log('🔧 Calling Customer function with sequelize...');
        try {
          Customer = Customer(sequelize);
          console.log('✅ Customer model initialized via function call');
        } catch (callError) {
          console.error('❌ Failed to call Customer function:', callError.message);
          throw new Error('Could not initialize Customer model');
        }
      }
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
        console.log('🔄 Creating customers table...');
        
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
    console.log('✅ Models initialized successfully');
    return { Customer, AML, WF_WORK_ITEM, sequelize };
    
  } catch (error) {
    console.error('❌ Failed to initialize models:', error.message);
    console.error('Error stack:', error.stack);
    
    // Reset initialization flag on failure
    modelsInitialized = false;
    throw error;
  }
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
// CUSTOMER CONTROLLER FUNCTIONS
// ============================================

/**
 * Get pending customers
 */
export const getPendingCustomers = async (req, res) => {
  try {
    console.log('📋 Getting pending customers...');
    
    // Initialize models first
    await initModels();
    
    if (!sequelize) {
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
    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total 
      FROM customers 
      ${whereClause}
    `, {
      replacements: replacements
    });
    
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / parseInt(limit));
    
    // Get customers with pagination
    const [pendingCustomers] = await sequelize.query(`
      SELECT 
        id, CUST_ID, CUST_NO, TITLE_ID, FIRST_NAME, MIDDLE_NAME, 
        LAST_NAME, CUST_NM, HOME_ADDRESS, EMAIL_ADDRESS, BU_ID,
        PHONE_NO, status, REC_ST, CREATE_DT, CREATED_BY
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
 * Get all customers (using models)
 */
export const getAllCustomers = async (req, res) => {
  try {
    console.log('📋 Getting all customers...');
    
    // Initialize models first
    await initModels();
    
    if (!Customer || !sequelize) {
      throw new Error('Customer model not available');
    }
    
    // Function to check and add missing columns to customers table
    const ensureCustomerTableColumns = async () => {
      try {
        console.log('🔍 Checking customers table structure...');
        
        // List of columns that might be missing but are in the model
        const columnsToCheck = [
          'EVENT_ID', 'createdAt', 'updatedAt', 'customer_type_id', 
          'relationship_officer_id', 'APPROVED_BY', 'APPROVED_DT',
          'SUSPENDED_BY', 'SUSPENDED_DT', 'CLOSED_BY', 'CLOSED_DT',
          'REJECTED_BY', 'REJECTED_DT'
        ];
        
        for (const column of columnsToCheck) {
          const [columnCheck] = await sequelize.query(
            `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'customers' 
             AND COLUMN_NAME = ?`,
            { replacements: [column] }
          );
          
          if (columnCheck[0].count === 0) {
            console.log(`ℹ️ Column ${column} does not exist in customers table, but it's expected in the model`);
            // We'll exclude this column from SELECT queries
          }
        }
        
        console.log('✅ Customers table structure checked');
        return true;
      } catch (error) {
        console.error('❌ Error checking customers table structure:', error.message);
        // Don't throw error, just log and continue
        return false;
      }
    };
    
    // Check table structure first
    await ensureCustomerTableColumns();
    
    const { page = 1, limit = 50, search = '', status = '' } = req.query;
    const offset = (page - 1) * limit;
    
    // Build WHERE clause with explicit column selection to avoid missing columns
    let whereConditions = {};
    
    if (search) {
      whereConditions = {
        [Op.or]: [
          { CUST_ID: { [Op.like]: `%${search}%` } },
          { CUST_NO: { [Op.like]: `%${search}%` } },
          { FIRST_NAME: { [Op.like]: `%${search}%` } },
          { LAST_NAME: { [Op.like]: `%${search}%` } },
          { CUST_NM: { [Op.like]: `%${search}%` } },
          { EMAIL_ADDRESS: { [Op.like]: `%${search}%` } },
          { PHONE_NO: { [Op.like]: `%${search}%` } }
        ]
      };
    }
    
    if (status) {
      whereConditions.status = status;
    }
    
    // Use raw query to avoid Sequelize model issues with missing columns
    let countQuery = 'SELECT COUNT(*) as total FROM customers WHERE 1=1';
    let dataQuery = 'SELECT * FROM customers WHERE 1=1';
    const replacements = [];
    
    if (search) {
      countQuery += ` AND (
        CUST_ID LIKE ? OR 
        CUST_NO LIKE ? OR 
        FIRST_NAME LIKE ? OR 
        LAST_NAME LIKE ? OR 
        CUST_NM LIKE ? OR 
        EMAIL_ADDRESS LIKE ? OR 
        PHONE_NO LIKE ?
      )`;
      dataQuery += ` AND (
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
      countQuery += ' AND status = ?';
      dataQuery += ' AND status = ?';
      replacements.push(status);
    }
    
    // Get total count
    const [[countResult]] = await sequelize.query(countQuery, {
      replacements: status ? [status] : []
    });
    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);
    
    // Get customers with pagination
    dataQuery += ' ORDER BY CREATE_DT DESC LIMIT ? OFFSET ?';
    const dataReplacements = [...replacements, parseInt(limit), offset];
    
    const [customers] = await sequelize.query(dataQuery, {
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
        'CREATE_DT', 'CREATED_BY'
      ];
      
      expectedFields.forEach(field => {
        if (cleaned[field] === undefined) {
          cleaned[field] = null;
        }
      });
      
      return cleaned;
    });
    
    console.log(`✅ Retrieved ${cleanedCustomers.length} customers`);
    
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
      error: error.message,
      details: 'The customers table structure may be different from the model definition. Try running /api/customer/test-db-connection to check database structure.'
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
    await initModels();
    
    if (!Customer) {
      throw new Error('Customer model not available');
    }
    
    // Get the actual column names from the model
    console.log('🔍 Customer model attributes:', Object.keys(Customer.rawAttributes || {}));
    
    // Check what columns exist
    const attributes = Customer.rawAttributes || {};
    const columnNames = Object.keys(attributes);
    console.log('🔍 Available columns:', columnNames);
    
    // Convert to string for consistent handling
    const customerId = String(CUST_ID).trim();
    
    // Try to find customer by different ID fields
    let customer = null;
    let queryAttempts = [];
    
    // Check which ID columns exist in the model
    const possibleIdColumns = ['customer_id', 'id', 'CUST_ID', 'customerId', 'cust_id'];
    
    for (const column of possibleIdColumns) {
      if (columnNames.includes(column)) {
        console.log(`🔍 Trying column "${column}" with value: "${customerId}"`);
        
        try {
          customer = await Customer.findOne({
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
        customer = await Customer.findByPk(numericId);
      }
    }
    
    // If still not found, try with different formats
    if (!customer) {
      // Try padded version
      if (customerId.length < 10) {
        const paddedId = customerId.padStart(10, '0');
        console.log(`🔍 Trying padded ID: "${paddedId}"`);
        
        // Try all possible columns again with padded ID
        for (const column of possibleIdColumns) {
          if (columnNames.includes(column)) {
            customer = await Customer.findOne({
              where: { [column]: paddedId }
            });
            if (customer) break;
          }
        }
      }
    }
    
    if (!customer) {
      console.log(`❌ Customer not found with ID: ${customerId}`);
      
      // Get sample data to show what exists
      let sampleCustomers = [];
      try {
        sampleCustomers = await Customer.findAll({
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
    
    console.log(`✅ Found customer:`, customer.toJSON());
    
    res.json({
      success: true,
      message: 'Customer retrieved successfully',
      customer: customer.toJSON()
    });
    
  } catch (error) {
    console.error('❌ Error getting customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve customer',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const createCustomer = async (req, res) => {
  const startTime = Date.now();
  console.log('🚀 Starting createCustomer (advanced version)...');
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
    await initModels();
    
    if (!Customer || !sequelize) {
      throw new Error('Models not initialized properly');
    }
    
    let transaction = null;
    let transactionCompleted = false;
    let userId = ''; // Declare userId at the function scope

    try {
      // Start transaction
      console.log('🔄 Starting database transaction...');
      transaction = await sequelize.transaction();
      console.log('✅ Transaction started');
      
      // Destructure with cleaned up defaults
      const {
        CUST_ID,
        CUST_NO,
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
        USER_ID = 'system',
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
      
      // Check by CUST_NO if provided
      if (CUST_NO) {
        console.log(`🔍 Checking for CUST_NO: ${CUST_NO}`);
        try {
          existingCustomer = await Customer.findOne({
            where: { CUST_NO: CUST_NO },
            attributes: ['id', 'CUST_ID', 'CUST_NO', 'EMAIL_ADDRESS', 'FIRST_NAME', 'LAST_NAME'],
            transaction
          });
          console.log(`✅ CUST_NO check completed: ${existingCustomer ? 'Found' : 'Not found'}`);
        } catch (custNoError) {
          console.warn(`⚠️ CUST_NO check error: ${custNoError.message}`);
        }
      }
      
      // If not found by CUST_NO, check by EMAIL_ADDRESS
      if (!existingCustomer && EMAIL_ADDRESS) {
        console.log(`🔍 Checking for EMAIL_ADDRESS: ${EMAIL_ADDRESS}`);
        try {
          existingCustomer = await Customer.findOne({
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
          message: existingCustomer.CUST_NO === CUST_NO 
            ? `Customer with CUST_NO ${CUST_NO} already exists (${existingCustomer.FIRST_NAME} ${existingCustomer.LAST_NAME})` 
            : `Customer with email ${EMAIL_ADDRESS} already exists (${existingCustomer.FIRST_NAME} ${existingCustomer.LAST_NAME})`,
          existingCustomer: {
            CUST_ID: existingCustomer.CUST_ID,
            CUST_NO: existingCustomer.CUST_NO,
            name: `${existingCustomer.FIRST_NAME} ${existingCustomer.LAST_NAME}`,
            EMAIL_ADDRESS: existingCustomer.EMAIL_ADDRESS
          }
        });
      }
      
      console.log('✅ No existing customer found, proceeding...');
      
      // Auto-generate Customer ID & Number if not provided
      const { CUST_ID: generatedCUST_ID, CUST_NO: generatedCUST_NO } = await generateCustomerNumber();
      
      // ALWAYS use the generated values, ignore any CUST_ID/CUST_NO from request body
      const finalCUST_ID = generatedCUST_ID;
      const finalCUST_NO = generatedCUST_NO;

      userId = USER_ID || CREATED_BY || "SYSTEM"; // Assign to the outer scope variable
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
        status: 'Pending'
        // Note: createdAt and updatedAt will be handled by Sequelize or added in raw query
      };

      console.log('📄 Creating customer with data:');
      console.log('  - CUST_ID:', finalCUST_ID);
      console.log('  - CUST_NO:', finalCUST_NO);
      console.log('  - Name:', fullName);

      // ========== CHECK AND ADD MISSING COLUMNS ==========
      console.log('🔍 Checking customers table structure...');
      
      // Function to check and add missing columns
      const ensureCustomerTableColumns = async () => {
        try {
          // Check if createdAt column exists
          const [createdAtCheck] = await sequelize.query(
            `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'customers' 
             AND COLUMN_NAME = 'createdAt'`,
            { transaction }
          );
          
          if (createdAtCheck[0].count === 0) {
            console.log('➕ Adding createdAt column to customers table...');
            await sequelize.query(
              `ALTER TABLE customers 
               ADD COLUMN createdAt DATETIME DEFAULT CURRENT_TIMESTAMP`,
              { transaction }
            );
            console.log('✅ createdAt column added successfully');
          }
          
          // Check if updatedAt column exists
          const [updatedAtCheck] = await sequelize.query(
            `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'customers' 
             AND COLUMN_NAME = 'updatedAt'`,
            { transaction }
          );
          
          if (updatedAtCheck[0].count === 0) {
            console.log('➕ Adding updatedAt column to customers table...');
            await sequelize.query(
              `ALTER TABLE customers 
               ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
              { transaction }
            );
            console.log('✅ updatedAt column added successfully');
          }
          
          console.log('✅ Customers table structure verified');
          return true;
        } catch (error) {
          console.error('❌ Error checking/updating customers table structure:', error.message);
          throw error;
        }
      };

      // Ensure the table has required columns before inserting
      await ensureCustomerTableColumns();
      
      // ========== CREATE CUSTOMER ==========
      console.log('👨‍👩‍👧‍👦 Creating customer...');
      
      let newCustomer;
      
      // Option 1: Use Sequelize's create method (recommended)
      try {
        // Use Sequelize's create method - it handles column/value matching automatically
        console.log('🔄 Using Sequelize create method...');
        newCustomer = await Customer.create(customerData, { transaction });
        console.log("✅ Customer created with ID:", newCustomer.id);
      } catch (sequelizeError) {
        console.warn('⚠️ Sequelize create failed, falling back to raw query:', sequelizeError.message);
        
        // Option 2: Fall back to raw query if Sequelize create fails
        // Create the columnNames array with EXACTLY the columns in your database table
        const columnNames = [
          'CUST_ID', 'CUST_NO', 'TITLE_ID', 'FIRST_NAME', 'MIDDLE_NAME', 'LAST_NAME',
          'CUST_NM', 'HOME_ADDRESS', 'EMAIL_ADDRESS', 'BU_ID', 'MAIDEN_NM', 'CNTRY_OF_BIRTH_ID', 'CUST_CAT',
          'CAMPAIGN_ID', 'GENDER_TY', 'COUNTRY_NM', 'STATE', 'NIN', 'BVN', 'LOCAL_GOV', 'OPENING_RSN_ID',
          'RESIDENT_CNTRY_ID', 'RISK_CLASS', 'STMNT_FREQ_CD', 'STMNT_FREQ_VALUE', 'CREATED_BY', 'USER_ID',
          'CREATE_DT', 'INDUSTRY_ID', 'INDUSTRY_CD', 'TAX_STATUS', 'MARITAL_ST', 'TAX_GRP_ID', 'OPERATIONS_CRNCY_ID',
          'EMP_ST', 'ORGANISATION_NM', 'REGISTRATION_ADDRESS', 'ALERT_DELIVERY_METHOD', 'KYC_LEVEL', 'PHONE_NO',
          'SMS', 'IS_PEP', 'SANCTION_SCORE', 'DOCUMENT_VERIFICATION_STATUS', 'REC_ST', 'status',
          'createdAt', 'updatedAt'
        ];

        console.log(`🔢 Column count: ${columnNames.length}`);

        // Create placeholders dynamically
        const placeholders = columnNames.map(() => '?').join(', ');

        // Create replacements array - MUST MATCH THE COLUMN NAMES IN ORDER!
        const replacements = [
          finalCUST_ID, finalCUST_NO, TITLE_ID, FIRST_NAME, MIDDLE_NAME, LAST_NAME,
          fullName, HOME_ADDRESS, EMAIL_ADDRESS ? EMAIL_ADDRESS.toLowerCase() : null, BU_ID,
          MAIDEN_NM, CNTRY_OF_BIRTH_ID, CUST_CAT, CAMPAIGN_ID, GENDER_TY, COUNTRY_NM,
          STATE, NIN, BVN, LOCAL_GOV, OPENING_RSN_ID, RESIDENT_CNTRY_ID, RISK_CLASS,
          STMNT_FREQ_CD, STMNT_FREQ_VALUE, CREATED_BY, userId,
          CREATE_DT ? new Date(CREATE_DT) : now, INDUSTRY_ID, INDUSTRY_CD,
          TAX_STATUS, MARITAL_ST, TAX_GRP_ID, OPERATIONS_CRNCY_ID, EMP_ST, ORGANISATION_NM,
          REGISTRATION_ADDRESS, ALERT_DELIVERY_METHOD, KYC_LEVEL, PHONE_NO, SMS,
          IS_PEP, SANCTION_SCORE, DOCUMENT_VERIFICATION_STATUS, REC_ST, 'Pending',
          now, now  // createdAt and updatedAt
        ];

        console.log(`🔢 Replacement values count: ${replacements.length}`);

        // Debug: Log each column with its value
        console.log('🔍 Debug: Column-value mapping (first 10):');
        for (let i = 0; i < Math.min(10, columnNames.length); i++) {
          console.log(`${i + 1}. ${columnNames[i]} = ${replacements[i] !== undefined ? JSON.stringify(replacements[i]) : 'UNDEFINED'}`);
        }

        // Validate counts match
        if (columnNames.length !== replacements.length) {
          console.error(`❌ Mismatch! Columns: ${columnNames.length}, Values: ${replacements.length}`);
          throw new Error(`Column count (${columnNames.length}) doesn't match value count (${replacements.length})`);
        }

        const [result] = await sequelize.query(
          `INSERT INTO customers (${columnNames.join(', ')}) VALUES (${placeholders})`,
          {
            replacements,
            transaction
          }
        );

        // Get the created customer ID
        const customerId = result.insertId;
        
        // Fetch the created customer to return complete data
        newCustomer = await Customer.findOne({
          where: { id: customerId },
          transaction
        });
        
        if (!newCustomer) {
          // Create a mock customer object if we can't fetch it
          newCustomer = { id: customerId, ...customerData, createdAt: now, updatedAt: now };
        }
        
        console.log("✅ Customer created with ID:", newCustomer.id);
      }
      
      // Create Next of Kin records if provided
      if (processedNextOfKin.length > 0) {
        console.log(`📝 Processing ${processedNextOfKin.length} Next of Kin records...`);
        
        try {
          // First, ensure the next_of_kins table exists (not nextofkins)
          const ensureNextOfKinTable = async (transaction) => {
            try {
              console.log('🔍 Checking next_of_kins table...');
              
              // Check if the table exists (with correct name: next_of_kins)
              const [tableCheck] = await sequelize.query(
                `SELECT TABLE_NAME
                 FROM INFORMATION_SCHEMA.TABLES
                 WHERE TABLE_SCHEMA = DATABASE()
                 AND TABLE_NAME = 'next_of_kins'`,
                { transaction }
              );
              
              if (tableCheck.length === 0) {
                console.log('➕ Creating next_of_kins table...');
                
                // Create the table with correct structure
                await sequelize.query(`
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
                
                console.log('✅ next_of_kins table created successfully');
              } else {
                console.log('✅ next_of_kins table already exists');
              }
              
              return true;
            } catch (error) {
              console.error('❌ Error checking/creating next_of_kins table:', error.message);
              throw error;
            }
          };

          await ensureNextOfKinTable(transaction);
          
          // Process each next of kin
          for (const kin of processedNextOfKin) {
            const nextOfKinData = {
              customerId: newCustomer.id,
              NEXTOF_KIN_NM: kin.NEXTOF_KIN_NM || '',
              RELATIONSHIP: kin.RELATIONSHIP || '',
              PHONE_NO: kin.PHONE_NO || '',
              EMAIL: kin.EMAIL || null,
              ADDRESS: kin.ADDRESS || '',
              IS_PRIMARY: kin.IS_PRIMARY || false,
              CREATED_DT: kin.CREATED_DT ? new Date(kin.CREATED_DT) : now,
              createdAt: now,
              updatedAt: now
            };
            
            console.log(`  ➕ Creating Next of Kin: ${nextOfKinData.NEXTOF_KIN_NM}`);
            
            // Use raw SQL to insert into the correct table
            await sequelize.query(
              `INSERT INTO next_of_kins 
               (customerId, NEXTOF_KIN_NM, RELATIONSHIP, PHONE_NO, EMAIL, ADDRESS, IS_PRIMARY, CREATED_DT, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              {
                replacements: [
                  nextOfKinData.customerId,
                  nextOfKinData.NEXTOF_KIN_NM,
                  nextOfKinData.RELATIONSHIP,
                  nextOfKinData.PHONE_NO,
                  nextOfKinData.EMAIL,
                  nextOfKinData.ADDRESS,
                  nextOfKinData.IS_PRIMARY,
                  nextOfKinData.CREATED_DT,
                  nextOfKinData.createdAt,
                  nextOfKinData.updatedAt
                ],
                transaction
              }
            );
          }
          
          console.log(`✅ Created ${processedNextOfKin.length} Next of Kin records`);
        } catch (kinError) {
          console.error('❌ Error creating Next of Kin records:', kinError.message);
          console.error('❌ Error details:', kinError);
          throw new Error(`Failed to create Next of Kin records: ${kinError.message}`);
        }
      }
      
      // AML & Sanction List Check for PEP
      let amlWorkItemId = null;
      let amlRecord = null;
      let customerRiskRating = "Low";
      
      if (IS_PEP && AML) {
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

        amlRecord = await AML.create({
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
          UPDATED_BY: userId || "system",
        }, { transaction });

        console.log("✅ AML record created for PEP customer");

        // Workflow Submission for AML
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
            amlWorkItemId = amlWorkflowResponse.data.WORK_ITEM_ID;
            console.log("✅ AML workflow item created:", amlWorkItemId);
          } else {
            console.warn("⚠️ AML workflow creation failed:", amlWorkflowResponse.message);
          }
        } catch (workflowError) {
          console.warn("⚠️ AML workflow submission error:", workflowError.message);
        }
      } else if (IS_PEP && !AML) {
        console.warn('⚠️ IS_PEP is true but AML model not available');
      }

      // COMMIT TRANSACTION
      await transaction.commit();
      transactionCompleted = true;
      console.log("✅ Transaction committed successfully");

      // THEN SUBMIT CUSTOMER WORKFLOW (outside transaction)
      let customerWorkItemId = null;
      let workflowDetails = null;
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
          customerWorkItemId = customerWorkflowResponse.data.WORK_ITEM_ID;
          workflowDetails = customerWorkflowResponse.data;
          console.log("✅ Customer workflow item created:", customerWorkItemId);
        } else {
          customerWorkItemId = "Workflow creation failed";
          console.warn("⚠️ Customer workflow creation failed:", customerWorkflowResponse.message);
        }
      } catch (workflowError) {
        customerWorkItemId = "Workflow error";
        console.warn("⚠️ Customer workflow submission failed:", workflowError.message);
      }

      // Prepare response
      const enhancedResponse = {
        success: true,
        message: `Customer ${fullName} created successfully${IS_PEP ? " with AML profile" : ""}.`,
        timestamp: new Date().toISOString(),
        customerId: newCustomer.id,
        
        // Quick reference for essential info
        quickReference: {
          CUST_ID: finalCUST_ID,
          CUST_NO: finalCUST_NO,
          CUST_NM: fullName,
          WORK_ITEM_ID: customerWorkItemId,
          AML_WORK_ITEM_ID: amlWorkItemId,
          isPEP: IS_PEP,
          riskRating: customerRiskRating
        },
        
        // Processing metadata
        metadata: {
          processingTime: `${Date.now() - startTime}ms`,
          ipAddress: ipAddress,
          businessUnit: BU_ID,
          transactionStatus: 'completed',
          databaseOperation: 'successful',
          method: 'Advanced (with workflow)'
        }
      };

      return res.status(201).json(enhancedResponse);
      
    } catch (error) {
      // ROLLBACK TRANSACTION IF NOT COMPLETED
      if (!transactionCompleted && transaction) {
        try {
          await transaction.rollback();
          console.log("🔄 Transaction rolled back due to error");
        } catch (rollbackError) {
          console.error("❌ Failed to rollback transaction:", rollbackError.message);
        }
      }

      console.error("❌ Create Customer Error:", error.message);
      console.error("❌ Error stack:", error.stack);
      
      if (error.sql) {
        console.error("SQL Error:", error.sql);
        console.error("Parameters:", error.parameters);
      }

      // Audit failure - Ensure userId is defined
      try {
        // Use the userId variable from earlier in the function
        // If it's not defined, use 0 (system)
        const auditUserId = userId ? (parseInt(userId) || 0) : 0;
        
        await auditLogger.error("Audit Event", {
          entity_type: "CUSTOMER_CREATE",
          entity_id: null,
          user_id: auditUserId,
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
        timestamp: new Date().toISOString(),
        suggestion: "Please check if the next_of_kins table exists in your database"
      });
    }
  } catch (error) {
    console.error("❌ Error in createCustomer (model initialization):", error.message);
    
    return res.status(500).json({
      success: false,
      message: "Failed to initialize models or connect to database",
      error: error.message,
      timestamp: new Date().toISOString(),
      suggestion: "Please run /api/customer/test-db-connection first to check database connection"
    });
  }
};


/**
 * Update customer
 */
export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Initialize models first
    await initModels();
    
    if (!Customer) {
      throw new Error('Customer model not available');
    }
    
    // Check if customer exists
    const existingCustomer = await Customer.findByPk(id);
    
    if (!existingCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // Add updated timestamp
    updateData.updatedAt = new Date();
    
    // Update customer
    await existingCustomer.update(updateData);
    
    res.json({
      success: true,
      message: 'Customer updated successfully',
      customer: existingCustomer
    });
    
  } catch (error) {
    console.error('❌ Error updating customer:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update customer',
      error: error.message
    });
  }
};

/**
 * Delete customer (soft delete by updating status)
 */
export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Initialize models first
    await initModels();
    
    if (!Customer) {
      throw new Error('Customer model not available');
    }
    
    // Check if customer exists
    const existingCustomer = await Customer.findByPk(id);
    
    if (!existingCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // Soft delete by updating status
    await existingCustomer.update({
      status: 'Deleted',
      updatedAt: new Date()
    });
    
    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting customer:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete customer',
      error: error.message
    });
  }
};

/**
 * Search customers with advanced filtering
 */
export const searchCustomers = async (req, res) => {
  try {
    const { 
      query = '',
      field = 'all',
      status = '',
      cust_cat = '',
      from_date = '',
      to_date = '',
      limit = 100 
    } = req.query;
    
    // Initialize models first
    await initModels();
    
    if (!Customer || !sequelize) {
      throw new Error('Customer model or sequelize not available');
    }
    
    let whereConditions = {};
    
    // Build where conditions based on parameters
    if (query) {
      if (field === 'all' || !field) {
        whereConditions = {
          [Op.or]: [
            { CUST_ID: { [Op.like]: `%${query}%` } },
            { CUST_NO: { [Op.like]: `%${query}%` } },
            { FIRST_NAME: { [Op.like]: `%${query}%` } },
            { LAST_NAME: { [Op.like]: `%${query}%` } },
            { CUST_NM: { [Op.like]: `%${query}%` } },
            { EMAIL_ADDRESS: { [Op.like]: `%${query}%` } },
            { PHONE_NO: { [Op.like]: `%${query}%` } },
            { NIN: { [Op.like]: `%${query}%` } },
            { BVN: { [Op.like]: `%${query}%` } }
          ]
        };
      } else {
        whereConditions[field] = { [Op.like]: `%${query}%` };
      }
    }
    
    if (status) {
      whereConditions.status = status;
    }
    
    if (cust_cat) {
      whereConditions.CUST_CAT = cust_cat;
    }
    
    if (from_date) {
      whereConditions.createdAt = { [Op.gte]: new Date(from_date) };
    }
    
    if (to_date) {
      whereConditions.createdAt = { [Op.lte]: new Date(to_date) };
    }
    
    // Get customers
    const customers = await Customer.findAll({
      where: whereConditions,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      message: 'Search completed successfully',
      results: customers,
      count: customers.length
    });
    
  } catch (error) {
    console.error('❌ Error searching customers:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to search customers',
      error: error.message
    });
}
};

/**
 * Get customer statistics
 */
export const getCustomerStats = async (req, res) => {
  try {
    // Initialize models first
    await initModels();
    
    if (!Customer || !sequelize) {
      throw new Error('Customer model or sequelize not available');
    }
    
    // Get various statistics using Sequelize
    const total = await Customer.count();
    
    const statusStats = await Customer.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['status']
    });
    
    const categoryStats = await Customer.findAll({
      attributes: ['CUST_CAT', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      where: { CUST_CAT: { [Op.ne]: null } },
      group: ['CUST_CAT']
    });
    
    const recentCustomers = await Customer.count({
      where: {
        createdAt: { [Op.gte]: sequelize.literal('DATE_SUB(NOW(), INTERVAL 7 DAY)') }
      }
    });
    
    const todayCustomers = await Customer.count({
      where: sequelize.where(sequelize.fn('DATE', sequelize.col('createdAt')), sequelize.fn('CURDATE'))
    });
    
    res.json({
      success: true,
      message: 'Customer statistics retrieved',
      stats: {
        total,
        byStatus: statusStats,
        byCategory: categoryStats,
        recent7Days: recentCustomers,
        today: todayCustomers
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting customer stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get customer statistics',
      error: error.message
    });
  }
};

/**
 * Get customer summary dashboard
 */
export const getCustomerSummary = async (req, res) => {
  try {
    console.log("📊 Getting customer dashboard summary...");
    
    // Initialize models first
    await initModels();
    
    if (!Customer || !sequelize) {
      console.error("❌ Customer model or sequelize not available");
      return res.status(500).json({
        success: false,
        message: "Database model initialization failed"
      });
    }

    // Get summary statistics
    let totalCustomers = 0;
    let activeCustomers = 0;
    let pendingCustomers = 0;
    let rejectedCustomers = 0;
    let inactiveCustomers = 0;
    let closedCustomers = 0;

    try {
      totalCustomers = await Customer.count();
      console.log(`✅ Total customers: ${totalCustomers}`);
    } catch (error) {
      console.warn("⚠️ Error counting total customers:", error.message);
    }

    // Count by status
    const statusCounts = {};
    const statuses = ['ACTIVE', 'PENDING', 'REJECTED', 'INACTIVE', 'CLOSED'];
    
    for (const status of statuses) {
      try {
        const count = await Customer.count({ 
          where: { REC_ST: status.toUpperCase() } 
        });
        statusCounts[status] = count;
        console.log(`✅ ${status} customers: ${count}`);
      } catch (error) {
        console.warn(`⚠️ Error counting ${status} customers:`, error.message);
        statusCounts[status] = 0;
      }
    }

    activeCustomers = statusCounts.ACTIVE || 0;
    pendingCustomers = statusCounts.PENDING || 0;
    rejectedCustomers = statusCounts.REJECTED || 0;
    inactiveCustomers = statusCounts.INACTIVE || 0;
    closedCustomers = statusCounts.CLOSED || 0;

    // Get latest customers
    let latestCustomers = [];
    try {
      latestCustomers = await Customer.findAll({
        attributes: ['CUST_ID', 'CUST_NM', 'REC_ST', 'CREATE_DT', 'FIRST_NAME', 'LAST_NAME'],
        order: [['CREATE_DT', 'DESC']],
        limit: 5
      });
      console.log(`✅ Latest customers retrieved: ${latestCustomers.length}`);
    } catch (error) {
      console.warn("⚠️ Error getting latest customers:", error.message);
    }

    // Get customers by risk class
    let riskDistribution = {};
    try {
      const riskClasses = await Customer.findAll({
        attributes: ['RISK_CLASS', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['RISK_CLASS'],
        where: { RISK_CLASS: { [Op.ne]: null } }
      });
      
      riskDistribution = riskClasses.reduce((acc, item) => {
        acc[item.RISK_CLASS] = item.dataValues.count;
        return acc;
      }, {});
      console.log("✅ Risk distribution retrieved");
    } catch (error) {
      console.warn("⚠️ Error getting risk distribution:", error.message);
    }

    // Calculate other statuses
    const calculatedStatuses = activeCustomers + pendingCustomers + rejectedCustomers + inactiveCustomers + closedCustomers;
    const otherCustomers = totalCustomers > calculatedStatuses ? totalCustomers - calculatedStatuses : 0;

    res.status(200).json({
      success: true,
      data: {
        summary: {
          total: totalCustomers,
          active: activeCustomers,
          pending: pendingCustomers,
          rejected: rejectedCustomers,
          inactive: inactiveCustomers,
          closed: closedCustomers,
          other: otherCustomers,
          calculatedStatuses: calculatedStatuses
        },
        riskDistribution: riskDistribution,
        latestCustomers: latestCustomers.map(customer => ({
          CUST_ID: customer.CUST_ID,
          name: `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
          status: customer.REC_ST,
          createdDate: customer.CREATE_DT,
          fullName: customer.CUST_NM
        })),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("❌ Error fetching customer summary:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching customer summary",
      error: error.message
    });
  }
};

// ===== DEBUG ROUTES =====



/**
 * Test database connection (legacy route)
 */
export const testDbConnection = async (req, res) => {
  try {
    await testDatabaseConnection(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message
    });
  }
};



/**
 * Fix customers table (add missing columns if needed)
 */
export const fixCustomersTable = async (req, res) => {
  try {
    const sequelize = req.db.sequelize;
    
    console.log('🔧 Fixing customers table...');
    
    // Common columns that might be missing
    const columnsToAdd = [
      { name: 'CNTRY_OF_BIRTH_ID', type: 'VARCHAR(100)' },
      { name: 'CUST_CAT', type: 'VARCHAR(100)' },
      { name: 'CAMPAIGN_ID', type: 'VARCHAR(100)' },
      { name: 'GENDER_TY', type: 'VARCHAR(50)' },
      { name: 'NIN', type: 'VARCHAR(50)' },
      { name: 'BVN', type: 'VARCHAR(50)' }
    ];
    
    let fixesApplied = [];
    
    for (const column of columnsToAdd) {
      try {
        await sequelize.query(`
          ALTER TABLE customers 
          ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
        `);
        fixesApplied.push(`✅ Added column: ${column.name}`);
      } catch (error) {
        if (!error.message.includes('Duplicate column name')) {
          fixesApplied.push(`⚠️ Failed to add ${column.name}: ${error.message}`);
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Table fix completed',
      fixes: fixesApplied,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fixing table:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fix table',
      error: error.message
    });
  }
};



// ===== DEBUG ROUTES =====

/**
 * Test database connection and schema
 */
export const testDatabaseConnection = async (req, res) => {
  try {
    console.log('🧪 Testing database connection and schema...');
    
    // Initialize models
    await initModels();
    
    if (!Customer || !sequelize) {
      throw new Error('Models not initialized properly');
    }
    
    // Test 1: Database connection
    await sequelize.authenticate();
    console.log('✅ Database connection successful');
    
    // Test 2: Check if customers table exists
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'customers'
    `);
    
    const tableExists = tables.length > 0;
    console.log('✅ Customers table exists:', tableExists);
    
    // Test 3: Describe the customers table
    let columns = [];
    if (tableExists) {
      [columns] = await sequelize.query(`DESCRIBE customers`);
      
      console.log('📋 Customers table columns (total:', columns.length, '):');
      columns.slice(0, 10).forEach(col => {
        console.log(`  - ${col.Field}: ${col.Type} (${col.Null === 'YES' ? 'Nullable' : 'Not Null'})`);
      });
      if (columns.length > 10) {
        console.log(`  ... and ${columns.length - 10} more columns`);
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Database test completed',
      data: {
        databaseConnected: true,
        customersTableExists: tableExists,
        columnCount: columns.length,
        sampleColumns: columns.slice(0, 10).map(c => ({ name: c.Field, type: c.Type })),
        customerModel: Customer ? '✅ Loaded' : '❌ Not loaded',
        sequelize: sequelize ? '✅ Loaded' : '❌ Not loaded'
      }
    });
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Database test failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Sync database schema
 */
export const syncDatabase = async (req, res) => {
  try {
    console.log('🔄 Syncing database schema...');
    
    // Initialize models
    await initModels();
    
    if (!Customer || !sequelize) {
      throw new Error('Models not initialized properly');
    }
    
    // Test connection first
    await sequelize.authenticate();
    console.log('✅ Database connection verified');
    
    // Sync the Customer model
    console.log('🔄 Syncing Customer model...');
    await Customer.sync({ alter: true });
    console.log('✅ Customer model synced with alter');
    
    return res.status(200).json({
      success: true,
      message: 'Database schema synced successfully',
      data: {
        customerSynced: true
      }
    });
  } catch (error) {
    console.error('❌ Database sync failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Database sync failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Fix database schema (force recreate)
 */
export const fixDatabaseSchema = async (req, res) => {
  try {
    console.log('🔧 Fixing database schema (force recreate)...');
    
    // Initialize models
    await initModels();
    
    if (!Customer || !sequelize) {
      throw new Error('Models not initialized properly');
    }
    
    // Step 1: Force recreate table
    console.log('🔄 Force recreating customers table...');
    await Customer.sync({ force: true });
    console.log('✅ Customers table recreated');
    
    // Step 2: Get new table info
    console.log('📋 Getting new table info...');
    const [newColumns] = await sequelize.query(`DESCRIBE customers`);
    console.log('New columns:', newColumns.length);
    
    return res.status(200).json({
      success: true,
      message: 'Database schema fixed successfully (table recreated)',
      data: {
        newColumnCount: newColumns.length,
        warning: 'ALL EXISTING DATA WAS DELETED (if any existed)',
        sampleColumns: newColumns.slice(0, 10).map(c => c.Field)
      }
    });
  } catch (error) {
    console.error('❌ Failed to fix database schema:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fix database schema',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Create table if not exists
 */
export const createTable = async (req, res) => {
  try {
    console.log('🔄 Creating customers table if not exists...');
    
    // Initialize models
    await initModels();
    
    if (!sequelize) {
      throw new Error('Sequelize not available');
    }
    
    // Test connection first
    await sequelize.authenticate();
    console.log('✅ Database connection verified');
    
    // Manual table creation SQL
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        CUST_ID VARCHAR(255),
        CUST_NO VARCHAR(255),
        TITLE_ID VARCHAR(50),
        FIRST_NAME VARCHAR(255),
        MIDDLE_NAME VARCHAR(255),
        LAST_NAME VARCHAR(255),
        CUST_NM VARCHAR(255),
        HOME_ADDRESS TEXT,
        EMAIL_ADDRESS VARCHAR(255),
        BU_ID VARCHAR(100),
        MAIDEN_NM VARCHAR(255),
        BIRTH_DT DATE,
        CNTRY_OF_BIRTH_ID VARCHAR(100),
        CUST_CAT VARCHAR(100),
        CAMPAIGN_ID VARCHAR(100),
        GENDER_TY VARCHAR(50),
        COUNTRY_NM VARCHAR(100),
        STATE VARCHAR(100),
        NIN VARCHAR(50),
        BVN VARCHAR(50),
        LOCAL_GOV VARCHAR(100),
        OPENING_RSN_ID VARCHAR(100),
        OPENED_DT DATE,
        RESIDENT_CNTRY_ID VARCHAR(100),
        RISK_CLASS VARCHAR(50),
        STMNT_FREQ_CD VARCHAR(50),
        STMNT_FREQ_VALUE VARCHAR(50),
        CREATED_BY VARCHAR(255),
        USER_ID VARCHAR(255),
        CREATE_DT DATETIME,
        INDUSTRY_ID VARCHAR(100),
        INDUSTRY_CD VARCHAR(100),
        TAX_STATUS VARCHAR(50),
        MARITAL_ST VARCHAR(50),
        TAX_GRP_ID VARCHAR(100),
        OPERATIONS_CRNCY_ID VARCHAR(100),
        EMP_ST VARCHAR(50),
        ORGANISATION_NM VARCHAR(255),
        REGISTRATION_ADDRESS TEXT,
        REGISTRATION_DT DATE,
        ALERT_DELIVERY_METHOD VARCHAR(50),
        KYC_LEVEL VARCHAR(50),
        PHONE_NO VARCHAR(50),
        SMS VARCHAR(50) DEFAULT 'Enabled',
        IS_PEP BOOLEAN DEFAULT FALSE,
        SANCTION_SCORE INT DEFAULT 10,
        DOCUMENT_VERIFICATION_STATUS VARCHAR(50) DEFAULT 'Pending',
        REC_ST VARCHAR(50) DEFAULT 'PENDING',
        status VARCHAR(50) DEFAULT 'Pending',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    await sequelize.query(createTableSQL);
    console.log('✅ customers table created or already exists');
    
    // Verify table exists
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'customers'
    `);
    
    if (tables.length > 0) {
      const [columns] = await sequelize.query(`DESCRIBE customers`);
      
      return res.status(200).json({
        success: true,
        message: 'Customers table created successfully',
        data: {
          tableCreated: true,
          columnCount: columns.length,
          columns: columns.map(col => col.Field)
        }
      });
    } else {
      throw new Error('Failed to create customers table');
    }
  } catch (error) {
    console.error('❌ Failed to create table:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create customers table',
      error: error.message,
      sql: error.sql
    });
  }
};

// ===== Counter Management Routes =====

export const testCounter = async (req, res) => {
  try {
    console.log('🧪 Testing customer number generator...');
    
    // Test the generator
    const result = await generateCustomerNumber();
    
    // Get counter status
    const status = await getCurrentCounterStatus();
    
    return res.status(200).json({
      success: true,
      message: 'Counter test completed',
      generated: result,
      status: status,
      modelsInitialized: modelsInitialized
    });
  } catch (error) {
    console.error('❌ Counter test failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Counter test failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const resetCounterEndpoint = async (req, res) => {
  try {
    const { CUST_ID } = req.body || {};
    const newCustId = CUST_ID || '0000000000';
    
    console.log(`🔄 Resetting counter to: ${newCustId}`);
    
    const result = await resetCounter(newCustId);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('❌ Counter reset failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Counter reset failed',
      error: error.message
    });
  }
};

export const getCounterStatusEndpoint = async (req, res) => {
  try {
    const status = await getCurrentCounterStatus();
    
    return res.status(200).json({
      success: true,
      message: 'Counter status retrieved',
      data: status
    });
  } catch (error) {
    console.error('❌ Failed to get counter status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get counter status',
      error: error.message
    });
  }
};

// // ===== Helper Function: getCustomerSummary =====
// const getCustomerSummary = (customer, nextOfKin, workflowDetails, amlRecord) => {
//   return {
//     id: customer.id,
//     CUST_ID: customer.CUST_ID,
//     CUST_NO: customer.CUST_NO,
//     fullName: customer.CUST_NM || `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
//     email: customer.EMAIL_ADDRESS,
//     phone: customer.PHONE_NO,
//     status: customer.status || customer.REC_ST,
//     businessUnit: customer.BU_ID,
//     kycLevel: customer.KYC_LEVEL,
//     isPEP: customer.IS_PEP || false,
//     createdDate: customer.CREATE_DT,
//     nextOfKin: nextOfKin ? nextOfKin.map(nok => ({
//       name: nok.NEXTOF_KIN_NM,
//       relationship: nok.RELATIONSHIP,
//       phone: nok.PHONE_NO,
//       isPrimary: nok.IS_PRIMARY || false
//     })) : [],
//     workflow: workflowDetails ? {
//       workItemId: workflowDetails.WORK_ITEM_ID,
//       status: workflowDetails.REC_ST,
//       priority: workflowDetails.PRIORITY
//     } : null,
//     amlProfile: amlRecord ? {
//       riskRating: amlRecord.CUSTOMER_RISK_RATING,
//       sanctionMatch: amlRecord.SANCTION_MATCH,
//       status: amlRecord.AML_STATUS
//     } : null
//   };
// };

// Simple test function
export const testCustomerModel = async (req, res) => {
  try {
    console.log('🔍 Testing Customer model...');
    
    // Initialize models
    await initModels();
    
    if (!Customer) {
      return res.status(500).json({
        success: false,
        message: 'Customer model not initialized'
      });
    }
    
    // Try a simple query with limited columns
    const count = await Customer.count();
    
    // Try to get column names
    const [columns] = await sequelize.query(`DESCRIBE customers`);
    const columnNames = columns.map(col => col.Field);
    
    return res.status(200).json({
      success: true,
      message: 'Customer model test successful',
      data: {
        customerCount: count,
        columnCount: columns.length,
        columns: columnNames,
        customerModel: Customer ? '✅ Loaded' : '❌ Not loaded',
        sequelize: sequelize ? '✅ Loaded' : '❌ Not loaded'
      }
    });
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message
    });
  }
};



export const batchUploadCustomers = async (fileBuffer) => {
  try {
    console.log("📁 Processing batch upload with buffer length:", fileBuffer?.length);

    if (!fileBuffer || fileBuffer.length === 0) {
      return {
        success: false,
        message: "Empty file buffer received",
        total: 0,
        created: 0,
        errors: ["File buffer is empty"],
        duplicates: 0,
        failed: 0,
      };
    }

    // 🔥 Ensure table has all required columns before starting batch upload
    await ensureCustomerTableColumns(sequelize);

    // ✅ Use the imported sequelize instance
    const transaction = await sequelize.transaction();

    try {
      // Also check if CustomerBatchService needs initialization
      let CustomerBatchService;
      try {
        const batchServiceModule = await import('../services/CustomerBatchService.js');
        CustomerBatchService = batchServiceModule.default || batchServiceModule.CustomerBatchService;
      } catch (importError) {
        console.error('❌ Failed to import CustomerBatchService:', importError.message);
        await transaction.rollback();
        return {
          success: false,
          message: "Batch processing service not available",
          total: 0,
          created: 0,
          duplicates: 0,
          failed: 0,
          errors: ["Batch processing service initialization failed"]
        };
      }

      if (!CustomerBatchService || typeof CustomerBatchService.processExcelBatch !== 'function') {
        await transaction.rollback();
        return {
          success: false,
          message: "Batch processing service not properly initialized",
          total: 0,
          created: 0,
          duplicates: 0,
          failed: 0,
          errors: ["Batch processing function not available"]
        };
      }

      const result = await CustomerBatchService.processExcelBatch(fileBuffer, transaction);
      
      await transaction.commit();
      
      return {
        success: result.success || false,
        message: result.message || "Processing completed",
        total: result.total || 0,
        created: result.created || 0,
        duplicates: result.duplicates || 0,
        failed: result.failed || 0,
        errors: result.errors || [],
        ...result,
      };
    } catch (batchError) {
      await transaction.rollback();
      console.error("❌ Batch processing error:", batchError);
      throw batchError;
    }
  } catch (error) {
    console.error("❌ Batch upload error in controller:", error);
    return {
      success: false,
      message: "Processing failed",
      error: error.message,
      total: 0,
      created: 0,
      duplicates: 0,
      failed: 0,
      errors: [error.message],
    };
  }
};
// IMPORTANT: The following functions need to be updated to use Sequelize syntax
// They're currently using Mongoose syntax (findOne, findOneAndUpdate, etc.)

// src/controllers/CustomerController.js



export const initializeCustomerApprovalSystem = async () => {
  try {
    console.log('🚀 Initializing customer approval system...');
    
    // Get sequelize instance
    const sequelize = getSequelize();
    
    if (!sequelize) {
      console.error('❌ Database connection not available');
      return false;
    }
    
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection verified');
    
    // Check if customers table exists
    const [tables] = await sequelize.query(
      "SHOW TABLES LIKE 'customers'"
    );
    
    if (tables.length === 0) {
      console.log('⚠️ Customers table does not exist');
      return false;
    }
    
    // Ensure all required columns exist
    const columnsToEnsure = [
      { name: 'APPROVED_BY', type: 'VARCHAR(100)', nullable: true },
      { name: 'APPROVED_DT', type: 'DATETIME', nullable: true },
      { name: 'SUSPENDED_BY', type: 'VARCHAR(100)', nullable: true },
      { name: 'SUSPENDED_DT', type: 'DATETIME', nullable: true },
      { name: 'CLOSED_BY', type: 'VARCHAR(100)', nullable: true },
      { name: 'CLOSED_DT', type: 'DATETIME', nullable: true },
      { name: 'REJECTED_BY', type: 'VARCHAR(100)', nullable: true },
      { name: 'REJECTED_DT', type: 'DATETIME', nullable: true },
      { name: 'createdAt', type: 'DATETIME', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
      { name: 'updatedAt', type: 'DATETIME', nullable: false, defaultValue: 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
    ];
    
    console.log('🔍 Checking customer table columns...');
    const [existingColumns] = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'customers'`
    );
    
    const existingColumnNames = existingColumns.map(col => col.COLUMN_NAME);
    
    for (const column of columnsToEnsure) {
      if (!existingColumnNames.includes(column.name)) {
        console.log(`   ➕ Adding ${column.name} column...`);
        
        let alterQuery = `ALTER TABLE customers ADD COLUMN ${column.name} ${column.type}`;
        
        if (column.nullable === false) {
          alterQuery += ' NOT NULL';
        } else {
          alterQuery += ' NULL';
        }
        
        if (column.defaultValue) {
          alterQuery += ` DEFAULT ${column.defaultValue}`;
        }
        
        try {
          await sequelize.query(alterQuery);
          console.log(`   ✅ ${column.name} column added`);
        } catch (error) {
          console.warn(`   ⚠️ Failed to add ${column.name}:`, error.message);
        }
      } else {
        console.log(`   ✓ ${column.name} already exists`);
      }
    }
    
    console.log('✅ Customer approval system initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize customer approval system:', error.message);
    console.error('Error stack:', error.stack);
    return false;
  }
};

export const approveCustomer = async (req, res) => {
  try {
    console.log("✅ APPROVE CUSTOMER REQUEST");
    console.log("Params:", req.params);
    console.log("Body:", req.body);

    const CUSTOMER_ID = String(req.params.customerId || req.body.customerId || "").trim();
    const APPROVED_BY = String(req.body.approvedBy || "").trim();

    if (!CUSTOMER_ID) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    if (!APPROVED_BY) {
      return res.status(400).json({
        success: false,
        message: "approvedBy is required in request body",
      });
    }

    // Get sequelize instance
    const sequelize = getSequelize();
    
    if (!sequelize) {
      throw new Error('Database connection not available');
    }

    console.log('🔍 Finding customer in database...');
    
    // Direct SQL query to find customer (most reliable)
    const [customers] = await sequelize.query(
      `SELECT * FROM customers WHERE CUST_ID = ?`,
      {
        replacements: [CUSTOMER_ID]
      }
    );

    if (customers.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Customer not found: ${CUSTOMER_ID}`,
      });
    }

    const customer = customers[0];
    
    console.log(`📋 Customer found: ${customer.CUST_NM || customer.FIRST_NAME || 'Unknown'}`);
    console.log(`📊 Current status: ${customer.REC_ST || customer.status || 'Unknown'}`);

    // Check if already active
    if ((customer.REC_ST && customer.REC_ST === "ACTIVE") || 
        (customer.status && customer.status === "Active")) {
      return res.status(200).json({
        success: true,
        message: "Customer is already Active",
        currentStatus: customer.REC_ST || customer.status,
        data: {
          CUST_ID: customer.CUST_ID,
          CUST_NO: customer.CUST_NO || 'N/A',
          CUST_NM: customer.CUST_NM || `${customer.FIRST_NAME || ''} ${customer.LAST_NAME || ''}`.trim(),
          status: customer.REC_ST || customer.status,
        },
      });
    }

    // Update customer
    console.log(`🔄 Updating customer ${CUSTOMER_ID} to ACTIVE...`);
    const now = new Date();
    
    const updateQuery = `
      UPDATE customers 
      SET REC_ST = 'ACTIVE', 
          status = 'Active',
          APPROVED_BY = ?,
          APPROVED_DT = ?,
          updatedAt = ?
      WHERE CUST_ID = ?
    `;
    
    await sequelize.query(updateQuery, {
      replacements: [APPROVED_BY, now, now, CUSTOMER_ID]
    });

    // Update workflow if exists
    try {
      console.log('🔍 Checking for workflow table...');
      const [workflowTables] = await sequelize.query(
        `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'wf_work_items'`
      );
      
      if (workflowTables[0].count > 0) {
        console.log('🔄 Updating workflow...');
        await sequelize.query(
          `UPDATE wf_work_items 
           SET REC_ST = 'Completed',
               WAIT_ST = 'Approved',
               APPROVED_BY = ?,
               APPROVED_DT = ?,
               COMPLETED_DT = ?,
               ACTION_TAKEN = 'Approved',
               updatedAt = ?
           WHERE ITEM_CLASS_NM = 'Customer' 
             AND ITEM_VALUE = ? 
             AND REC_ST = 'Pending'`,
          {
            replacements: [APPROVED_BY, now, now, now, CUSTOMER_ID]
          }
        );
        console.log("✅ Workflow updated successfully");
      } else {
        console.log("ℹ️ wf_work_items table doesn't exist, skipping workflow update");
      }
    } catch (wfError) {
      console.warn("⚠️ Workflow update failed:", wfError.message);
    }

    // Get updated customer data
    const [updatedCustomers] = await sequelize.query(
      `SELECT CUST_ID, CUST_NO, CUST_NM, FIRST_NAME, LAST_NAME, 
              REC_ST, status, APPROVED_BY, APPROVED_DT 
       FROM customers WHERE CUST_ID = ?`,
      {
        replacements: [CUSTOMER_ID]
      }
    );

    console.log(`✅ Customer ${CUSTOMER_ID} approved by ${APPROVED_BY}`);

    return res.status(200).json({
      success: true,
      message: "Customer approved successfully",
      data: {
        CUST_ID: updatedCustomers[0]?.CUST_ID || CUSTOMER_ID,
        CUST_NO: updatedCustomers[0]?.CUST_NO || 'N/A',
        CUST_NM: updatedCustomers[0]?.CUST_NM || 
                `${updatedCustomers[0]?.FIRST_NAME || ''} ${updatedCustomers[0]?.LAST_NAME || ''}`.trim(),
        newStatus: "ACTIVE",
        approvedBy: APPROVED_BY,
        approvedAt: now,
        previousStatus: customer.REC_ST || customer.status,
      },
    });
  } catch (error) {
    console.error("❌ APPROVAL ERROR:", error.message);
    console.error("Error stack:", error.stack);
    
    return res.status(500).json({
      success: false,
      message: "Internal server error during approval",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Please contact support',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
};


export const getCustomerDetails = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    const [customers] = await sequelize.query(
      `SELECT * FROM customers WHERE CUST_ID = ?`,
      { replacements: [customerId] }
    );
    
    if (customers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    return res.json({
      success: true,
      data: customers[0]
    });
  } catch (error) {
    console.error('Error fetching customer details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch customer details',
      error: error.message
    });
  }
};

// Health check for customer approval system
export const approvalSystemHealth = async (req, res) => {
  try {
    // Test database connection
    await sequelize.authenticate();
    
    // Check if customers table exists
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'customers'");
    
    // Check if required columns exist
    const requiredColumns = ['APPROVED_BY', 'APPROVED_DT', 'REC_ST', 'status'];
    const missingColumns = [];
    
    for (const column of requiredColumns) {
      const [exists] = await sequelize.query(
        `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'customers' 
         AND COLUMN_NAME = ?`,
        { replacements: [column] }
      );
      
      if (exists[0].count === 0) {
        missingColumns.push(column);
      }
    }
    
    return res.json({
      success: true,
      system: 'Customer Approval System',
      database: 'Connected',
      customersTable: tables.length > 0 ? 'Exists' : 'Missing',
      requiredColumns: missingColumns.length === 0 ? 'All present' : `Missing: ${missingColumns.join(', ')}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      system: 'Customer Approval System',
      database: 'Connection failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// For now, you can add this placeholder for other functions to be updated:
const updateFunctionsForSequelize = async () => {
  console.log("⚠️ IMPORTANT: The following functions need to be updated to use Sequelize syntax:");
  console.log("  - rejectCustomer");
  console.log("  - getAllCustomer");
  console.log("  - getCustomerById");
  console.log("  - getPendingCustomers");
  console.log("  - updateCustomer");
  console.log("  - deactivateCustomer");
  console.log("  - searchCustomers");
  console.log("  - advancedSearchCustomers");
  console.log("");
  console.log("✅ createCustomer and batchUploadCustomers are already updated for Sequelize");
};

export const rejectCustomer = async (req, res) => {
  try {
    console.log("🔍 REJECTION REQUEST:", {
      body: req.body,
      params: req.params,
      timestamp: new Date().toISOString(),
    });

    // --- Extract parameters from both body and params ---
    const CUSTOMER_ID = String(
      req.params.customerId || req.body.customerId || ""
    ).trim();

    const REJECTED_BY = String(req.body.rejectedBy || "").trim();
    const REJECTION_REASON = String(
      req.body.rejectionReason || "No reason provided"
    ).trim();

    // --- Validation ---
    if (!CUSTOMER_ID) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }
    if (!REJECTED_BY) {
      return res.status(400).json({
        success: false,
        message: "rejectedBy is required",
      });
    }

    const paddedCustomerId = CUSTOMER_ID.padStart(10, "0");
    console.log("🔍 Looking up customer for rejection:", paddedCustomerId);

    // --- Initialize models first ---
    const models = await getModelsSafe();
    const Customer = models.Customer;
    
    if (!Customer || typeof Customer.findOne !== 'function') {
      console.error("❌ Customer model not properly initialized");
      return res.status(500).json({
        success: false,
        message: "Database model initialization failed",
        error: "Customer model not available"
      });
    }

    // Safe attributes list
    const safeAttributes = [
      'id', 'CUST_ID', 'CUST_NO', 'TITLE_ID', 'FIRST_NAME', 'MIDDLE_NAME', 
      'LAST_NAME', 'CUST_NM', 'HOME_ADDRESS', 'EMAIL_ADDRESS', 'BU_ID', 
      'MAIDEN_NM', 'BIRTH_DT', 'CNTRY_OF_BIRTH_ID', 'CUST_CAT', 'CAMPAIGN_ID', 
      'GENDER_TY', 'COUNTRY_NM', 'STATE', 'NIN', 'BVN', 'LOCAL_GOV', 
      'OPENING_RSN_ID', 'OPENED_DT', 'RESIDENT_CNTRY_ID', 'RISK_CLASS', 
      'STMNT_FREQ_CD', 'STMNT_FREQ_VALUE', 'CREATED_BY', 'USER_ID', 'CREATE_DT', 
      'INDUSTRY_ID', 'INDUSTRY_CD', 'TAX_STATUS', 'MARITAL_ST', 'TAX_GRP_ID', 
      'OPERATIONS_CRNCY_ID', 'EMP_ST', 'ORGANISATION_NM', 'REGISTRATION_ADDRESS', 
      'REGISTRATION_DT', 'ALERT_DELIVERY_METHOD', 'KYC_LEVEL', 'PHONE_NO', 'SMS', 
      'IS_PEP', 'SANCTION_SCORE', 'DOCUMENT_VERIFICATION_STATUS', 'REC_ST', 
      'status', 'EVENT_ID', 'REJECTED_BY', 'REJECTED_DT', 'REJECTION_REASON',
      'UPDATED_BY', 'UPDATED_AT', 'createdAt', 'updatedAt'
    ];

    // --- Find the customer first to check current status ---
    const customer = await Customer.findOne({ 
      where: { CUST_ID: paddedCustomerId },
      attributes: safeAttributes
    });

    if (!customer) {
      console.log("❌ Customer not found for rejection:", paddedCustomerId);
      return res.status(404).json({
        success: false,
        message: `Customer not found: ${paddedCustomerId}`,
      });
    }

    console.log("🔍 CUSTOMER FOUND FOR REJECTION:", {
      CUST_ID: customer.CUST_ID,
      CURRENT_STATUS: customer.REC_ST,
      id: customer.id,
    });

    // --- Check if customer can be rejected (case-insensitive) ---
    const currentStatusUpper = (customer.REC_ST || '').toUpperCase();
    
    if (currentStatusUpper === "REJECTED") {
      return res.status(400).json({
        success: false,
        message: "Customer is already Rejected",
      });
    }

    if (currentStatusUpper === "ACTIVE" || currentStatusUpper === "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "Cannot reject an Active/Approved customer",
      });
    }

    // --- Check allowed states for rejection (case-insensitive) ---
    const allowedRejectionStates = ["pending", "in review", "submitted", "under review", "draft", "p"];
    const currentStatusLower = (customer.REC_ST || '').toLowerCase();
    
    if (!allowedRejectionStates.includes(currentStatusLower)) {
      return res.status(400).json({
        success: false,
        message: `Customer cannot be rejected from current status: ${customer.REC_ST}`,
        currentStatus: customer.REC_ST,
        allowedStates: ["PENDING", "IN REVIEW", "SUBMITTED", "UNDER REVIEW", "DRAFT", "P"],
      });
    }

    // --- REJECT THE CUSTOMER ---
    console.log("✅ Rejecting customer from", customer.REC_ST, "to Rejected");

    // Update customer using Sequelize
    const updateData = {
      REC_ST: "Rejected",
      REJECTED_BY: REJECTED_BY,
      REJECTED_DT: new Date(),
      REJECTION_REASON: REJECTION_REASON,
      UPDATED_BY: REJECTED_BY,
      UPDATED_AT: new Date(),
      updatedAt: new Date()
    };

    // Update with case-insensitive check for current status
    const [affectedRows, [updatedCustomer]] = await Customer.update(updateData, {
      where: {
        CUST_ID: paddedCustomerId,
        REC_ST: customer.REC_ST // Match exact current status
      },
      returning: true,
      individualHooks: true
    });

    if (affectedRows === 0) {
      console.log("❌ Customer status changed during rejection process");
      return res.status(409).json({
        success: false,
        message: "Customer status was changed by another process. Please refresh and try again.",
      });
    }

    console.log("✅ CUSTOMER REJECTED SUCCESSFULLY:", {
      CUST_ID: updatedCustomer.CUST_ID,
      NEW_STATUS: updatedCustomer.REC_ST,
      REJECTED_BY: updatedCustomer.REJECTED_BY,
    });

    // --- Update workflow ---
    let workflowUpdated = false;
    try {
      const { WF_WORK_ITEM: WFModel } = models;
      if (WFModel && typeof WFModel.update === 'function') {
        const [wfAffectedRows] = await WFModel.update(
          {
            REC_ST: "Completed",
            WAIT_ST: "Rejected",
            REJECTED_BY: REJECTED_BY,
            REJECTED_DT: new Date(),
            COMPLETED_DT: new Date(),
            ACTION_TAKEN: "Rejected",
            REJECTION_REASON: REJECTION_REASON,
            UPDATED_AT: new Date(),
            UPDATED_BY: REJECTED_BY,
          },
          {
            where: {
              ITEM_CLASS_NM: "Customer",
              ITEM_VALUE: paddedCustomerId,
              REC_ST: { [Op.in]: ["Pending", "Submitted", "In Review"] }
            }
          }
        );

        if (wfAffectedRows > 0) {
          workflowUpdated = true;
          console.log(`✅ Workflow updated: ${wfAffectedRows} record(s) affected`);
        } else {
          console.warn("⚠ Workflow item not found for customer:", paddedCustomerId);
        }
      } else {
        console.warn("⚠ WF_WORK_ITEM model not available");
      }
    } catch (wfError) {
      console.warn("⚠ Workflow update failed:", wfError.message);
    }

    const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    // --- Audit trail via hybrid logger ---
    auditLogger.info("Audit Event", {
      entity_type: "CUSTOMER_REJECT",
      entity_id: customer.id,
      user_id: REJECTED_BY,
      action: `Customer ${paddedCustomerId} rejected by ${REJECTED_BY}. Reason: ${REJECTION_REASON}`,
      old_value: customer.REC_ST,
      new_value: "Rejected",
      ip_address: ipAddress,
      event_type: "CUSTOMER_REJECT",
      outcome: "success",
      rejection_reason: REJECTION_REASON,
    });

    // --- Send notification ---
    try {
      await NotificationService.sendNotification({
        type: "CUSTOMER_REJECTED",
        recipient: REJECTED_BY,
        title: "Customer Rejection Completed",
        message: `Customer ${customer.CUST_NM} (${customer.CUST_ID}) has been rejected. Reason: ${REJECTION_REASON}`,
        data: {
          customerId: customer.CUST_ID,
          customerName: customer.CUST_NM,
          rejectedBy: REJECTED_BY,
          rejectionReason: REJECTION_REASON,
          timestamp: new Date(),
        },
      });
    } catch (notifyError) {
      console.warn("⚠ Notification failed:", notifyError.message);
    }

    // --- Success response ---
    return res.status(200).json({
      success: true,
      message: "Customer rejected successfully",
      data: {
        CUST_ID: updatedCustomer.CUST_ID,
        CUST_NO: updatedCustomer.CUST_NO,
        CUST_NM: updatedCustomer.CUST_NM,
        previousStatus: customer.REC_ST,
        newStatus: "Rejected",
        rejectedBy: REJECTED_BY,
        rejectionReason: REJECTION_REASON,
        rejectedAt: updatedCustomer.REJECTED_DT,
        workflowUpdated: workflowUpdated,
      },
    });
  } catch (error) {
    console.error("❌ REJECTION ERROR:", error);
    
    // Audit failure (non-blocking)
    const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    auditLogger.error("Audit Event", {
      entity_type: "CUSTOMER_REJECT",
      entity_id: req.params.customerId || null,
      user_id: req.body.rejectedBy || "system",
      action: "reject_customer",
      old_value: null,
      new_value: null,
      ip_address: ipAddress,
      event_type: "CUSTOMER_ERROR",
      outcome: "failure",
      error: error.message,
      rejection_reason: req.body.rejectionReason || null,
    });
    
    return res.status(500).json({
      success: false,
      message: "Internal server error during rejection",
      error: error.message,
    });
  }
};



export const deactivateCustomer = async (req, res) => {
  const { CUST_ID } = req.params;
  const userId = req.user?.username || req.body.USER_ID || "SYSTEM"; // From user or body
  const ipAddress =
    req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  try {
    const customer = await Customer.findOne({ CUST_ID });

    if (!customer) {
      // Self-audit not-found (optional)
      auditLogger.info("Audit Event", {
        entity_type: "customer_deactivate",
        entity_id: CUST_ID,
        user_id: userId,
        action: "deactivate_customer",
        old_value: null,
        new_value: { status: "not_found" },
        ip_address: ipAddress,
        event_type: "DEACTIVATE_NOT_FOUND",
        outcome: "failure",
      });
      return res.status(404).json({ message: "Customer not found" });
    }

    const oldValue = JSON.stringify(customer);

    customer.REC_ST = "Inactive";
    await customer.save();

    const oldStatus = customer.REC_ST; // Before update

    // Optional: update related work item status
    await WF_WORK_ITEMController.updateWorkItemStatusOnRejection(
      "CUSTOMER",
      CUST_ID,
      userId
    );

    // Audit log via hybrid logger
    auditLogger.info("Audit Event", {
      entity_type: "CUSTOMER_DEACTIVATE",
      entity_id: customer._id,
      user_id: userId,
      action: `Customer ${customer.CUST_NM} deactivated`,
      old_value: oldStatus,
      new_value: "Inactive",
      ip_address: ipAddress,
      event_type: "CUSTOMER_DEACTIVATE",
      outcome: "success",
    });

    res.status(200).json({
      success: true,
      message: "Customer deactivated successfully",
      customer,
    });
  } catch (error) {
    console.error("Error deactivating customer:", error);
    // Audit failure (non-blocking)
    auditLogger.error("Audit Event", {
      entity_type: "customer_deactivate",
      entity_id: CUST_ID,
      user_id: userId,
      action: "deactivate_customer",
      old_value: null,
      new_value: null,
      ip_address: ipAddress,
      event_type: "DEACTIVATE_ERROR",
      outcome: "failure",
      error: error.message,
    });
    res.status(500).json({
      success: false,
      message: "Failed to deactivate customer",
      error: error.message,
    });
  }
};

// Add this search function to your CustomerController.js

// Helper function
const performSearch = async (CustomerModel, req, res) => {
  try {
    const { name, accountNumber, phone, email, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    // Build search conditions
    const whereConditions = {};
    
    if (name) {
      whereConditions[Op.or] = [
        { first_name: { [Op.like]: `%${name}%` } },
        { last_name: { [Op.like]: `%${name}%` } },
        { other_names: { [Op.like]: `%${name}%` } }
      ];
    }
    
    if (accountNumber) {
      whereConditions.account_number = { [Op.like]: `%${accountNumber}%` };
    }
    
    if (phone) {
      whereConditions.phone = { [Op.like]: `%${phone}%` };
    }
    
    if (email) {
      whereConditions.email = { [Op.like]: `%${email}%` };
    }
    
    // Search customers
    const { rows: customers, count } = await CustomerModel.findAndCountAll({
      where: whereConditions,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        {
          model: getCustomerType(),
          as: 'customerType',
          attributes: ['id', 'type_name']
        },
        {
          model: getRelationshipOfficer(),
          as: 'relationshipOfficer',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });
    
    // Audit success
    try {
      auditLogger.info("Audit Event", {
        entity_type: "customer_search",
        entity_id: null,
        user_id: req.user_id || "system",
        action: "search_customers",
        old_value: null,
        new_value: JSON.stringify({ 
          searchParams: req.query,
          resultCount: count 
        }),
        ip_address: req.ip || "unknown",
        event_type: "SEARCH_SUCCESS",
        outcome: "success",
        error: null
      });
    } catch (auditError) {
      console.error('Error logging audit success:', auditError);
    }
    
    return res.status(200).json({
      success: true,
      message: "Customers retrieved successfully",
      data: {
        customers,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Error in performSearch:', error);
    throw error;
  }
};




// Simple in-memory cache for models
let modelCache = {
  Customer: null,
  CustomerType: null,
  RelationshipOfficer: null
};

const loadModelsOnce = async () => {
  if (modelCache.Customer) {
    return modelCache;
  }
  
  try {
    console.log('🔄 Loading models for CustomerController...');
    const modelsModule = await import('../models/index.js');
    
    if (modelsModule.initializeModels) {
      await modelsModule.initializeModels();
    }
    
    modelCache = {
      Customer: modelsModule.getCustomer ? modelsModule.getCustomer() : null,
      CustomerType: modelsModule.getCustomerType ? modelsModule.getCustomerType() : null,
      RelationshipOfficer: modelsModule.getRelationshipOfficer ? modelsModule.getRelationshipOfficer() : null
    };
    
    console.log('✅ Models loaded in CustomerController');
    
    // Log the actual attribute names from the model
    if (modelCache.Customer) {
      const attributes = Object.keys(modelCache.Customer.rawAttributes);
      console.log('Customer model attributes:', attributes);
    }
    
  } catch (error) {
    console.error('❌ Failed to load models in CustomerController:', error);
  }
  
  return modelCache;
};



// Add this to your CustomerController or create a new controller
export const getCustomerSchema = async (req, res) => {
  try {
    const models = await loadModelsOnce();
    
    if (!models.Customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer model not loaded'
      });
    }
    
    // Get model attributes
    const attributes = models.Customer.rawAttributes;
    const attributeNames = Object.keys(attributes);
    
    // Get model options
    const options = models.Customer.options;
    
    // Try to get table info from database
    let tableInfo = null;
    try {
      const queryInterface = models.Customer.sequelize.getQueryInterface();
      tableInfo = await queryInterface.describeTable(models.Customer.tableName);
    } catch (error) {
      console.warn('Could not get table info:', error.message);
    }
    
    return res.status(200).json({
      success: true,
      data: {
        modelName: models.Customer.name,
        tableName: models.Customer.tableName,
        attributes: attributeNames,
        attributeDetails: attributes,
        options: {
          tableName: options.tableName,
          timestamps: options.timestamps,
          freezeTableName: options.freezeTableName
        },
        databaseTableInfo: tableInfo,
        sampleQuery: 'SELECT * FROM ' + models.Customer.tableName + ' LIMIT 1'
      }
    });
    
  } catch (error) {
    console.error('Schema error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting schema',
      error: error.message
    });
  }
};
// Advanced search with multiple criteria
export const advancedSearchCustomers = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      bvn,
      nin,
      status,
      riskClass,
      isPEP,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = req.query;

    const userId = req.user_id || "system";
    const ipAddress = req.ip_address || "0.0.0.0";

    let query = {};

    // Name filters
    if (firstName) {
      query.FIRST_NAME = new RegExp(firstName, "i");
    }
    if (lastName) {
      query.LAST_NAME = new RegExp(lastName, "i");
    }

    // Contact filters
    if (email) {
      query.EMAIL_ADDRESS = new RegExp(email, "i");
    }
    if (phone) {
      query.PHONE_NO = new RegExp(phone, "i");
    }

    // Identification filters
    if (bvn) {
      query.BVN = bvn;
    }
    if (nin) {
      query.NIN = nin;
    }

    // Status and risk filters
    if (status) {
      query.REC_ST = status;
    }
    if (riskClass) {
      query.RISK_CLASS = riskClass;
    }
    if (isPEP !== undefined) {
      query.IS_PEP = isPEP === "true";
    }

    // Date range filter
    if (fromDate || toDate) {
      query.CREATE_DT = {};
      if (fromDate) {
        query.CREATE_DT.$gte = new Date(fromDate);
      }
      if (toDate) {
        query.CREATE_DT.$lte = new Date(toDate);
      }
    }

    const customers = await Customer.find(query)
      .sort({ CREATE_DT: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("nextOfKin")
      .select("-__v");

    const total = await Customer.countDocuments(query);

    // Audit the advanced search
    auditLogger.info("Audit Event", {
      entity_type: "customer_advanced_search",
      entity_id: null,
      user_id: userId,
      action: "advanced_search_customers",
      old_value: null,
      new_value: {
        filters: {
          firstName,
          lastName,
          email,
          phone,
          bvn,
          nin,
          status,
          riskClass,
          isPEP,
          fromDate,
          toDate,
        },
        count: customers.length,
        pagination: { page, limit, total },
      },
      ip_address: ipAddress,
      event_type: "ADVANCED_SEARCH_SUCCESS",
      outcome: "success",
    });

    res.status(200).json({
      success: true,
      data: customers,
      filters_applied: {
        firstName,
        lastName,
        email,
        phone,
        bvn,
        nin,
        status,
        riskClass,
        isPEP,
        fromDate,
        toDate,
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error in advanced customer search:", error);

    auditLogger.error("Audit Event", {
      entity_type: "customer_advanced_search",
      entity_id: null,
      user_id: req.user_id || "system",
      action: "advanced_search_customers",
      old_value: null,
      new_value: null,
      ip_address: req.ip || "unknown",
      event_type: "ADVANCED_SEARCH_ERROR",
      outcome: "failure",
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: "Error in advanced customer search",
      error: error.message,
    });
  }
};

