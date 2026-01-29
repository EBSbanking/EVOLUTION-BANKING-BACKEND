import CreditApplication from '../models/CreditApplication.js';
import sequelize from '../../config/db.js';

// Enhanced credit application creation middleware (Sequelize version)
const createCreditApplication = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { CUST_ID, CUST_NM, USER_ID, CREATED_BY } = req.body;
    
    // Validate required fields
    if (!CUST_ID) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Customer ID (CUST_ID) is required',
        code: 'MISSING_CUSTOMER_ID'
      });
    }

    if (!CUST_NM) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Customer Name (CUST_NM) is required',
        code: 'MISSING_CUSTOMER_NAME'
      });
    }

    if (!USER_ID) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'User ID (USER_ID) is required',
        code: 'MISSING_USER_ID'
      });
    }

    if (!CREATED_BY) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Created By (CREATED_BY) is required',
        code: 'MISSING_CREATED_BY'
      });
    }

    // Calculate loan cycle count for this customer
    const loanCycleCount = await CreditApplication.count({
      where: { CUST_ID },
      transaction
    });

    // Generate IDs using model's static methods
    const APPL_ID = await CreditApplication.generateApplId();
    const REF_NO = await CreditApplication.generateRefNo();
    const creditApplicationId = await CreditApplication.generateCreditApplicationId();

    // Create new application - use model's field names
    const newApplication = await CreditApplication.create({
      creditApplicationId,
      CUST_ID,
      CUST_NM,
      USER_ID,
      CREATED_BY,
      APPL_ID,
      REF_NO,
      LOAN_CYCLE: loanCycleCount + 1,
      STATUS: 'PENDING', // Use uppercase as per model
      APPL_DT: new Date(),
      CREATE_DT: new Date(),
      ROW_TS: new Date(),
      SYS_CREATE_TS: new Date(),
      
      // Required fields with defaults
      BU_ID: req.body.BU_ID || 'DEFAULT_BU',
      RSN_ID: req.body.RSN_ID || 'DEFAULT_REASON',
      PROD_ID: req.body.PROD_ID || 'DEFAULT_PROD',
      TERM_CD: req.body.TERM_CD || 'MTH', // Monthly term
      TERM_VALUE: req.body.TERM_VALUE || 12, // 12 months
      REPAY_SRC_ACCT_NO: req.body.REPAY_SRC_ACCT_NO || CUST_ID.toString(),
      REC_ST: 'active',
      VERSION_NO: 1,
      TRANSACTION_TYPE: req.body.TRANSACTION_TYPE || 'NEW',
      
      // Optional fields with defaults
      PRODUCT: req.body.PRODUCT || 'Personal Loan',
      Credit_Type: req.body.Credit_Type || 'LOAN',
      Purpose_of_Credit: req.body.Purpose_of_Credit || 'GENERAL LOAN',
      PRIME_LIMIT_AMT: req.body.PRIME_LIMIT_AMT || '1000000',
      Borrower_address: req.body.Borrower_address || {},
      
      // Include other fields from request body
      ...req.body
    }, { transaction });

    // Attach to request for downstream middleware
    req.creditApplication = newApplication;
    
    await transaction.commit();
    next();
  } catch (error) {
    await transaction.rollback();
    
    console.error('Credit Application Creation Error:', {
      error: error.message,
      errorName: error.name,
      errorDetails: error.errors,
      body: req.body
    });

    // Handle unique constraint violation
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message: 'Duplicate application detected',
        code: 'DUPLICATE_APPLICATION',
        errors: error.errors?.map(e => ({
          field: e.path,
          message: e.message,
          value: e.value
        }))
      });
    }

    // Handle validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors: error.errors?.map(e => ({
          field: e.path,
          message: e.message,
          value: e.value
        }))
      });
    }

    // Handle foreign key constraint errors
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid reference data',
        code: 'REFERENCE_ERROR',
        detail: error.parent?.detail || error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create credit application',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      code: 'APPLICATION_CREATION_FAILED',
      timestamp: new Date().toISOString()
    });
  }
};

// Helper function for standalone use (Sequelize version)
const createStandaloneApplication = async (customerData, additionalData = {}, options = {}) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { CUST_ID, CUST_NM, USER_ID, CREATED_BY } = customerData;
    
    // Validate required fields
    if (!CUST_ID || !CUST_NM || !USER_ID || !CREATED_BY) {
      throw new Error('Missing required customer data: CUST_ID, CUST_NM, USER_ID, CREATED_BY are required');
    }

    // Calculate loan cycle count for this customer
    const loanCycleCount = await CreditApplication.count({
      where: { CUST_ID },
      transaction
    });

    // Generate IDs using model's static methods
    const APPL_ID = await CreditApplication.generateApplId();
    const REF_NO = await CreditApplication.generateRefNo();
    const creditApplicationId = await CreditApplication.generateCreditApplicationId();

    // Create application with proper field names
    const application = await CreditApplication.create({
      creditApplicationId,
      CUST_ID,
      CUST_NM,
      USER_ID,
      CREATED_BY,
      APPL_ID,
      REF_NO,
      LOAN_CYCLE: loanCycleCount + 1,
      STATUS: 'PENDING',
      APPL_DT: new Date(),
      CREATE_DT: new Date(),
      ROW_TS: new Date(),
      SYS_CREATE_TS: new Date(),
      BU_ID: additionalData.BU_ID || 'DEFAULT_BU',
      RSN_ID: additionalData.RSN_ID || 'DEFAULT_REASON',
      PROD_ID: additionalData.PROD_ID || 'DEFAULT_PROD',
      TERM_CD: additionalData.TERM_CD || 'MTH',
      TERM_VALUE: additionalData.TERM_VALUE || 12,
      REPAY_SRC_ACCT_NO: additionalData.REPAY_SRC_ACCT_NO || CUST_ID.toString(),
      REC_ST: 'active',
      VERSION_NO: 1,
      TRANSACTION_TYPE: additionalData.TRANSACTION_TYPE || 'NEW',
      PRODUCT: additionalData.PRODUCT || 'Personal Loan',
      Credit_Type: additionalData.Credit_Type || 'LOAN',
      Purpose_of_Credit: additionalData.Purpose_of_Credit || 'GENERAL LOAN',
      PRIME_LIMIT_AMT: additionalData.PRIME_LIMIT_AMT || '1000000',
      Borrower_address: additionalData.Borrower_address || {},
      ...additionalData
    }, { 
      transaction,
      validate: options.validate !== false
    });

    await transaction.commit();
    
    console.log(`Created application ${APPL_ID} for customer ${CUST_NM} (${CUST_ID})`);
    return application;
  } catch (error) {
    await transaction.rollback();
    
    console.error('Standalone creation failed:', {
      error: error.message,
      name: error.name,
      customerData,
      additionalData
    });
    
    // Enhance error with more context
    const enhancedError = new Error(`Failed to create application for customer ${customerData.CUST_ID}: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.customerData = customerData;
    enhancedError.timestamp = new Date();
    
    throw enhancedError;
  }
};

// Alternative: Bulk create applications
const createBulkApplications = async (applicationsData = []) => {
  const transaction = await sequelize.transaction();
  
  try {
    const applications = [];
    
    for (const data of applicationsData) {
      const { CUST_ID, CUST_NM, USER_ID, CREATED_BY, ...rest } = data;
      
      if (!CUST_ID || !CUST_NM || !USER_ID || !CREATED_BY) {
        throw new Error('Missing required customer data in bulk create');
      }

      const loanCycleCount = await CreditApplication.count({
        where: { CUST_ID },
        transaction
      });

      const APPL_ID = await CreditApplication.generateApplId();
      const REF_NO = await CreditApplication.generateRefNo();
      const creditApplicationId = await CreditApplication.generateCreditApplicationId();

      applications.push({
        creditApplicationId,
        CUST_ID,
        CUST_NM,
        USER_ID,
        CREATED_BY,
        APPL_ID,
        REF_NO,
        LOAN_CYCLE: loanCycleCount + 1,
        STATUS: 'PENDING',
        APPL_DT: new Date(),
        CREATE_DT: new Date(),
        ROW_TS: new Date(),
        SYS_CREATE_TS: new Date(),
        BU_ID: rest.BU_ID || 'DEFAULT_BU',
        RSN_ID: rest.RSN_ID || 'DEFAULT_REASON',
        PROD_ID: rest.PROD_ID || 'DEFAULT_PROD',
        TERM_CD: rest.TERM_CD || 'MTH',
        TERM_VALUE: rest.TERM_VALUE || 12,
        REPAY_SRC_ACCT_NO: rest.REPAY_SRC_ACCT_NO || CUST_ID.toString(),
        REC_ST: 'active',
        VERSION_NO: 1,
        TRANSACTION_TYPE: rest.TRANSACTION_TYPE || 'NEW',
        PRODUCT: rest.PRODUCT || 'Personal Loan',
        Credit_Type: rest.Credit_Type || 'LOAN',
        Purpose_of_Credit: rest.Purpose_of_Credit || 'GENERAL LOAN',
        PRIME_LIMIT_AMT: rest.PRIME_LIMIT_AMT || '1000000',
        Borrower_address: rest.Borrower_address || {},
        ...rest
      });
    }

    const createdApplications = await CreditApplication.bulkCreate(applications, {
      transaction,
      validate: true,
      individualHooks: false
    });

    await transaction.commit();
    
    console.log(`Bulk created ${createdApplications.length} applications`);
    return createdApplications;
  } catch (error) {
    await transaction.rollback();
    console.error('Bulk creation failed:', error);
    throw error;
  }
};

// Validation middleware
const validateCreditApplication = async (req, res, next) => {
  try {
    const requiredFields = [
      'CUST_ID', 
      'CUST_NM', 
      'USER_ID', 
      'CREATED_BY',
      'PROD_ID',
      'TERM_CD',
      'TERM_VALUE',
      'REPAY_SRC_ACCT_NO'
    ];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        missingFields,
        code: 'MISSING_FIELDS'
      });
    }

    // Validate term value is positive
    if (req.body.TERM_VALUE <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Term value must be greater than 0',
        code: 'INVALID_TERM_VALUE'
      });
    }

    // Check if customer has too many pending applications
    const pendingCount = await CreditApplication.count({
      where: {
        CUST_ID: req.body.CUST_ID,
        STATUS: 'PENDING'
      }
    });

    if (pendingCount >= 3) { // Configurable threshold
      return res.status(400).json({
        success: false,
        message: 'Customer has too many pending applications',
        code: 'TOO_MANY_PENDING_APPLICATIONS',
        pendingCount
      });
    }

    // Validate PRIME_LIMIT_AMT if provided
    if (req.body.PRIME_LIMIT_AMT) {
      const limit = parseFloat(req.body.PRIME_LIMIT_AMT);
      if (isNaN(limit) || limit <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Prime limit amount must be a positive number',
          code: 'INVALID_PRIME_LIMIT'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_FAILED'
    });
  }
};

// Retry wrapper for application creation
const createWithRetry = async (customerData, data = {}, maxRetries = 3) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Creating application for ${customerData.CUST_ID}, attempt ${attempt}`);
      return await createStandaloneApplication(customerData, data);
    } catch (error) {
      lastError = error;
      
      if (error.name === 'SequelizeUniqueConstraintError' && attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
};

// Get application by ID
const getApplicationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const application = await CreditApplication.findByPk(id);
    
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
        code: 'APPLICATION_NOT_FOUND'
      });
    }
    
    req.creditApplication = application;
    next();
  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch application',
      code: 'FETCH_APPLICATION_FAILED'
    });
  }
};

// Get applications by customer ID
const getCustomerApplications = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const applications = await CreditApplication.scope('byCustomer')(customerId).findAll();
    
    req.creditApplications = applications;
    next();
  } catch (error) {
    console.error('Get customer applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer applications',
      code: 'FETCH_CUSTOMER_APPLICATIONS_FAILED'
    });
  }
};

export { 
  createCreditApplication, 
  createStandaloneApplication,
  createBulkApplications,
  validateCreditApplication,
  createWithRetry,
  getApplicationById,
  getCustomerApplications
};