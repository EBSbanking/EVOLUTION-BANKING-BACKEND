// src/middlewares/amlCheckMiddleware.js
import AMLTransactionMonitor from '../services/AMLTransactionMonitor.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Customer from '../models/Customer.js';

export const amlCheckMiddleware = async (req, res, next) => {
  // Store original json method
  const originalJson = res.json;
  
  // Override json method to add AML check before sending response
  res.json = function(data) {
    // If transaction was created and we have AML check to add
    if (res.locals.transaction && res.locals.amlCheck) {
      data.amlCheck = res.locals.amlCheck;
    }
    originalJson.call(this, data);
  };
  
  next();
};

export const checkTransactionAML = async (req, res, next) => {
  try {
    const { accountNumber, amount, transactionType } = req.body;
    
    // Get customer account and customer
    const customerAccount = await CustomerAccount.findOne({
      where: { account_number: accountNumber }
    });
    
    if (!customerAccount) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
    
    const customer = await Customer.findOne({
      where: { CUST_ID: customerAccount.customer_id }
    });
    
    // Create transaction object for AML check
    const transaction = {
      id: `temp_${Date.now()}`,
      amount: amount,
      created_at: new Date(),
      type: transactionType,
      additional_info: req.body.additional_info || {}
    };
    
    // Run AML analysis
    const amlCheck = await AMLTransactionMonitor.analyzeTransaction(
      transaction,
      customerAccount,
      customer
    );
    
    // Store in locals for later use
    res.locals.amlCheck = amlCheck;
    res.locals.customerAccount = customerAccount;
    res.locals.customer = customer;
    
    // Handle immediate blocks
    if (amlCheck.requiresSuspiciousReport) {
      return res.status(403).json({
        success: false,
        message: 'Transaction blocked due to AML suspicion. Please contact support.',
        amlCheck,
        requiresApproval: false,
        blocked: true
      });
    }
    
    if (amlCheck.requiresApproval) {
      return res.status(202).json({
        success: true,
        message: 'Transaction requires AML review. An approver will review shortly.',
        amlCheck,
        requiresApproval: true,
        blocked: false
      });
    }
    
    // AML cleared, proceed
    next();
    
  } catch (error) {
    console.error('AML Check Error:', error);
    next(error);
  }
};