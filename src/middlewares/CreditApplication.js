import CreditApplication from '../models/CreditApplication.js';
import mongoose from 'mongoose';

// Enhanced credit application creation middleware
const createCreditApplication = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { cust_ID } = req.body; // Or get from params/other source
    
    if (!cust_ID) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Customer ID (cust_ID) is required',
        code: 'MISSING_CUSTOMER_ID'
      });
    }

    // Generate unique application ID
    const generateAppId = async () => {
      const lastApp = await CreditApplication.findOne()
        .sort({ APPL_ID: -1 })
        .session(session);
      const lastNum = lastApp ? parseInt(lastApp.APPL_ID.split('/')[1]) : 0;
      return `CRAPP/${String(lastNum + 1).padStart(4, '0')}`;
    };

    const APPL_ID = await generateAppId();

    // Calculate loan cycle count
    const loanCycleCount = await CreditApplication.countDocuments({ 
      cust_ID 
    }).session(session);

    const newApplication = new CreditApplication({
      APPL_ID,
      cust_ID,
      BU_ID: req.body.BU_ID || 'DEFAULT_BU',
      RSN_ID: req.body.RSN_ID || 'DEFAULT_REASON',
      LOAN_CYCLE: loanCycleCount + 1,
      STATUS: 'Pending',
      CREATED_AT: new Date(),
      // Include other fields from request body
      ...req.body
    });

    await newApplication.save({ session });

    // Attach to request for downstream middleware
    req.creditApplication = newApplication;
    
    await session.commitTransaction();
    next();
  } catch (error) {
    await session.abortTransaction();
    
    console.error('Credit Application Creation Error:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate application detected',
        code: 'DUPLICATE_APPLICATION'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create credit application',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      code: 'APPLICATION_CREATION_FAILED'
    });
  } finally {
    session.endSession();
  }
};

// Usage example in routes:
// router.post('/applications', createCreditApplication, applicationController.processApplication);

// Helper function for standalone use
const createStandaloneApplication = async (custID, additionalData = {}) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    
    const count = await CreditApplication.countDocuments({ cust_ID: custID }).session(session);
    const APPL_ID = `CRAPP/${String(count + 1).padStart(4, '0')}`;
    
    const application = new CreditApplication({
      APPL_ID,
      cust_ID: custID,
      LOAN_CYCLE: count + 1,
      STATUS: 'Pending',
      CREATED_AT: new Date(),
      ...additionalData
    });

    await application.save({ session });
    await session.commitTransaction();
    
    console.log(`Created application ${APPL_ID} for customer ${custID}`);
    return application;
  } catch (error) {
    await session.abortTransaction();
    console.error('Standalone creation failed:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

export { createCreditApplication, createStandaloneApplication };