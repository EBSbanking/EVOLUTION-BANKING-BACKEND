// src/controllers/CustomerController.js - COMPLETE FIXED VERSION
import { Op, QueryTypes } from 'sequelize';
import { initializeModels, getCustomer, getAML, getWF_WORK_ITEM } from '../models/index.js';
import { getSequelize } from '../../config/db.js';
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

// ============================================
// MODEL VARIABLES (will be set in initModels)
// ============================================
let Customer = null;
let AML = null;
let WF_WORK_ITEM = null;
let sequelize = null;
let Group = null;
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
    return { Customer, AML, WF_WORK_ITEM, Group, sequelize };
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

      // FIX: Get sequelize properly - await the promise if needed
      try {
        let sequelizeInstance = getSequelize();
        
        // Check if it's a promise and await it
        if (sequelizeInstance && typeof sequelizeInstance.then === 'function') {
          console.log('⏳ Sequelize is a promise, awaiting...');
          sequelizeInstance = await sequelizeInstance;
        }
        
        // Also try direct import as fallback
        if (!sequelizeInstance || typeof sequelizeInstance.authenticate !== 'function') {
          console.log('🔄 Trying direct import fallback...');
          const dbModule = await import('../../config/db.js');
          sequelizeInstance = dbModule.sequelize || dbModule.default || dbModule.getSequelize?.();
          
          if (sequelizeInstance && typeof sequelizeInstance.then === 'function') {
            sequelizeInstance = await sequelizeInstance;
          }
        }
        
        if (!sequelizeInstance) {
          throw new Error('Could not get sequelize instance');
        }
        
        if (typeof sequelizeInstance.authenticate !== 'function') {
          console.error('❌ Invalid sequelize instance type:', typeof sequelizeInstance);
          console.error('❌ Available keys:', Object.keys(sequelizeInstance || {}));
          throw new Error('Sequelize instance is not valid - missing authenticate method');
        }
        
        sequelize = sequelizeInstance;
        console.log('✅ Sequelize instance obtained successfully');
        
        // Test database connection
        console.log('🔍 Testing database connection...');
        await sequelize.authenticate();
        console.log('✅ Database connection successful');
        
      } catch (seqError) {
        console.error('❌ Failed to get sequelize instance:', seqError.message);
        throw new Error(`Sequelize initialization failed: ${seqError.message}`);
      }
      
      // NEW: Dynamically import Group model
      try {
        const GroupModule = await import('../models/Group.js');
        Group = GroupModule.default || GroupModule;
        console.log('✅ Group model loaded:', Group ? 'Available' : 'Not Available');
      } catch (groupError) {
        console.warn('⚠️ Could not load Group model:', groupError.message);
        Group = null;
      }
      
      if (!sequelize) {
        throw new Error('Sequelize instance not loaded');
      }
      
      console.log('✅ Models retrieved:');
      console.log('  - Customer:', Customer ? '✅ Available' : '❌ Not Available');
      console.log('  - AML:', AML ? '✅ Available' : '❌ Not Available');
      console.log('  - WF_WORK_ITEM:', WF_WORK_ITEM ? '✅ Available' : '❌ Not Available');
      console.log('  - Group:', Group ? '✅ Available' : '❌ Not Available');
      
      // Verify Customer is a valid model
      if (!Customer || typeof Customer.findOne !== 'function') {
        console.error('❌ Customer model is not a valid Sequelize model');
        throw new Error('Customer model not properly initialized');
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
      return { Customer, AML, WF_WORK_ITEM, Group, sequelize };
      
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
  return { Customer, AML, WF_WORK_ITEM, Group, sequelize };
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
    
    const phoneRegex = /^[0-9]{10,15}$/;
    if (!phoneRegex.test(nok.PHONE_NO.replace(/\D/g, ''))) {
      return `Next of Kin ${i + 1}: Phone number must be 10-15 digits`;
    }
    
    if (nok.EMAIL && nok.EMAIL.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(nok.EMAIL.trim())) {
        return `Next of Kin ${i + 1}: Invalid email format`;
      }
    }
  }
  
  return null;
};

// ===== NEW: Group Assignment Helper Functions =====

const validateGroup = async (groupId, transaction = null) => {
  if (!groupId) return null;
  
  if (!Group) {
    throw new Error('Group model not available');
  }
  
  const group = await Group.findByPk(groupId, { transaction });
  
  if (!group) {
    throw new Error(`Group with ID ${groupId} not found`);
  }
  
  if (group.status !== 'active') {
    throw new Error(`Group is not active (current status: ${group.status})`);
  }
  
  if (!group.canAddMember()) {
    throw new Error(`Group has reached maximum member limit (${group.maxMembers})`);
  }
  
  return group;
};

const assignCustomerToGroup = async (customerId, groupId, options = {}) => {
  const { transaction, skipValidation = false } = options;
  
  if (!groupId) return null;
  
  try {
    if (!skipValidation) {
      await validateGroup(groupId, transaction);
    }
    
    await Customer.update(
      { 
        groupId: groupId,
        groupJoinedAt: new Date()
      },
      { 
        where: { id: customerId },
        transaction 
      }
    );
    
    if (Group && !skipValidation) {
      const group = await Group.findByPk(groupId, { transaction });
      if (group) {
        await group.addMember(customerId);
      }
    }
    
    console.log(`✅ Customer ${customerId} assigned to group ${groupId}`);
    return { success: true, groupId };
    
  } catch (error) {
    console.error(`❌ Failed to assign customer ${customerId} to group ${groupId}:`, error.message);
    throw error;
  }
};

const bulkAssignCustomersToGroups = async (assignments, transaction) => {
  const results = {
    success: [],
    failed: [],
    total: assignments.length
  };
  
  for (const { customerId, groupId } of assignments) {
    try {
      if (groupId) {
        await assignCustomerToGroup(customerId, groupId, { transaction, skipValidation: false });
        results.success.push({ customerId, groupId });
      }
    } catch (error) {
      results.failed.push({ 
        customerId, 
        groupId, 
        reason: error.message 
      });
    }
  }
  
  results.successCount = results.success.length;
  results.failedCount = results.failed.length;
  
  return results;
};




// ============================================
// GROUP MANAGEMENT FUNCTIONS (NEW)
// ============================================



/**
 * Remove customer from group
 * @route DELETE /api/customers/:customerId/remove-group
 */
export const removeCustomerFromGroup = async (req, res) => {
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
    
    // Start transaction
    const transaction = await sequelize.transaction();
    
    try {
      // Find customer
      const customer = await Customer.findByPk(customerId, { transaction });
      
      if (!customer) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }
      
      if (!customer.groupId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Customer is not assigned to any group'
        });
      }
      
      const oldGroupId = customer.groupId;
      
      // Remove from group's members
      const group = await Group.findByPk(oldGroupId, { transaction });
      if (group) {
        await group.removeMember(customer.id);
      }
      
      // Update customer
      await customer.update({
        groupId: null,
        groupJoinedAt: null
      }, { transaction });
      
      // Log audit
      await auditLogger.log({
        entity_type: 'CUSTOMER',
        entity_id: customerId,
        user_id: req.user?.id || 'system',
        action: 'REMOVE_FROM_GROUP',
        old_value: { groupId: oldGroupId },
        new_value: { groupId: null },
        ip_address: req.ip || req.connection.remoteAddress,
        event_type: 'GROUP_REMOVAL',
        outcome: 'success'
      }, { transaction });
      
      await transaction.commit();
      
      res.json({
        success: true,
        message: 'Customer removed from group successfully',
        data: {
          customerId: customer.id,
          previousGroupId: oldGroupId
        }
      });
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error removing customer from group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove customer from group',
      error: error.message
    });
  }
};

/**
 * Get customers by group
 * @route GET /api/customers/group/:groupId
 */
/**
 * Get customers by group
 * @route GET /api/customers/group/:groupId
 */
export const getCustomersByGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }
    
    // Initialize models
    await initModels();
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Find group
    const group = await Group.findByPk(groupId);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Get customers in group with pagination
    const { count, rows: customers } = await Customer.findAndCountAll({
      where: { groupId },
      attributes: [
        'id', 'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME',
        'CUST_NM', 'EMAIL_ADDRESS', 'PHONE_NO', 'BVN', 'NIN',
        'status', 'REC_ST', 'groupJoinedAt', 'KYC_LEVEL'
      ],
      offset,
      limit: parseInt(limit),
      order: [['groupJoinedAt', 'DESC']]
    });
    
    res.json({
      success: true,
      data: {
        group: {
          id: group.id,
          groupCode: group.groupCode,
          groupName: group.groupName,
          memberCount: group.memberCount,
          maxMembers: group.maxMembers
        },
        customers: customers.map(c => c.toJSON ? c.toJSON() : c),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / parseInt(limit))
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting customers by group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get customers by group',
      error: error.message
    });
  }
};


// ============================================
// CUSTOMER SERVICE METHODS (EXISTING + GROUP)
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
        'REC_ST',
        'groupId', // NEW: Include group info
        'groupJoinedAt'
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
        'EMAIL_ADDRESS',
        'groupId' // NEW: Include group info
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
          BVN_VERIFIED_AT: customer.BVN_VERIFIED_AT,
          groupId: customer.groupId // Include group info
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
        'EMAIL_ADDRESS',
        'groupId', // NEW: Include group info
        'groupJoinedAt'
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
    
    // Get group info if customer is in a group
    let groupInfo = null;
    if (customer.groupId && Group) {
      const group = await Group.findByPk(customer.groupId, {
        attributes: ['id', 'groupCode', 'groupName']
      });
      if (group) {
        groupInfo = group.toJSON ? group.toJSON() : group;
      }
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
          bvnVerified: customer.BVN_VERIFIED,
          groupInfo // NEW: Include group info
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
    
    // Get customer group info
    const customer = await Customer.findByPk(customerId, {
      attributes: ['groupId', 'groupJoinedAt']
    });
    
    res.json({
      success: true,
      data: {
        hasActiveLoan: !!activeLoan,
        customerId: customerId,
        loanDetails: activeLoan || null,
        groupId: customer?.groupId || null // Include group info
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
 * Get customer full summary with BVN, loan status, and group info
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
    
    // Get group info if customer is in a group
    let groupInfo = null;
    if (customer.groupId && Group) {
      const group = await Group.findByPk(customer.groupId, {
        attributes: ['id', 'groupCode', 'groupName', 'groupType', 'memberCount']
      });
      if (group) {
        groupInfo = group.toJSON ? group.toJSON() : group;
      }
    }
    
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
        createdAt: customer.created_at,
        // NEW: Group info
        groupId: customer.groupId,
        groupJoinedAt: customer.groupJoinedAt,
        groupInfo: groupInfo
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
// ORIGINAL CUSTOMER CONTROLLER FUNCTIONS (UPDATED WITH GROUP)
// ============================================

/**
 * Test database connection endpoint
 */
export const testDatabaseConnection = async (req, res) => {
  try {
    console.log('🔍 Testing database connection...');
    
    // Initialize models
    const { sequelize: db, Customer: custModel, Group: groupModel } = await initModels();
    
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
      AND TABLE_NAME IN ('customers', 'Groups')
    `);
    
    const tableNames = tables.map(t => t.TABLE_NAME);
    
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
        customers: tableNames.includes('customers'),
        groups: tableNames.includes('Groups')
      },
      models: {
        customerModelAvailable: !!custModel,
        groupModelAvailable: !!groupModel
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
 * Get pending customers - FINAL FIXED VERSION
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
    
    // 🔥 FIXED: Build query conditions properly
    let whereConditions = [];
    const replacements = [];
    
    // Add status condition
    whereConditions.push(`(c.REC_ST = 'PENDING' OR c.status = 'Pending' OR c.status = 'PENDING')`);
    
    // Add BU_ID filter if needed
    const isAdmin = userRole === 'admin' || userRole === 'superuser' || userRole === 'ADMIN';
    
    if (!isAdmin && userBU_ID) {
      whereConditions.push(`c.BU_ID = ?`);
      replacements.push(userBU_ID);
    } else if (bu_id) {
      whereConditions.push(`c.BU_ID = ?`);
      replacements.push(bu_id);
    }
    
    // Build WHERE clause
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';
    
    console.log(`🔍 Query conditions: ${whereClause}`);
    console.log(`🔍 User role: ${userRole}, BU_ID: ${userBU_ID}, Is Admin: ${isAdmin}`);
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM customers c
      ${whereClause}
    `;
    
    console.log('📊 Count query:', countQuery);
    console.log('📊 Replacements:', replacements);
    
    const countResult = await db.query(countQuery, {
      replacements: replacements,
      type: db.QueryTypes.SELECT
    });
    
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / parseInt(limit));
    
    // 🔥 FIXED: Simplified query without trying to detect column names
    // Just use the base query without Groups table for now
    const mainQuery = `
      SELECT 
        c.id, 
        c.CUST_ID, 
        c.CUST_NO, 
        c.TITLE_ID, 
        c.FIRST_NAME, 
        c.MIDDLE_NAME, 
        c.LAST_NAME, 
        c.CUST_NM, 
        c.HOME_ADDRESS, 
        c.EMAIL_ADDRESS, 
        c.BU_ID,
        c.PHONE_NO, 
        c.status, 
        c.REC_ST, 
        c.CREATE_DT, 
        c.CREATED_BY, 
        c.BVN, 
        c.BVN_VERIFIED,
        c.group_id as groupId, 
        c.group_joined_at as groupJoinedAt
      FROM customers c
      ${whereClause}
      ORDER BY c.CREATE_DT DESC 
      LIMIT ? OFFSET ?
    `;
    
    console.log('📊 Main query:', mainQuery);
    console.log('📊 Query replacements:', [...replacements, parseInt(limit), offset]);
    
    const pendingCustomersResult = await db.query(mainQuery, {
      replacements: [...replacements, parseInt(limit), offset],
      type: db.QueryTypes.SELECT
    });
    
    const pendingCustomers = pendingCustomersResult || [];
    
    console.log(`✅ Found ${pendingCustomers.length} pending customers (Total: ${total})`);
    
    // Try to get group information separately if needed
    let customersWithGroups = pendingCustomers;
    
    if (pendingCustomers.length > 0) {
      // Get group IDs that exist
      const groupIds = pendingCustomers
        .filter(c => c.groupId)
        .map(c => c.groupId);
      
      if (groupIds.length > 0) {
        try {
          // Fetch group information separately
          const groupsResult = await db.query(`
            SELECT id, group_code, group_name 
            FROM Groups 
            WHERE id IN (?)
          `, {
            replacements: [groupIds],
            type: db.QueryTypes.SELECT
          });
          
          const groups = groupsResult || [];
          
          // Create a map of group info
          const groupMap = {};
          groups.forEach(g => {
            groupMap[g.id] = {
              groupCode: g.group_code || g.groupCode,
              groupName: g.group_name || g.groupName
            };
          });
          
          // Add group info to customers
          customersWithGroups = pendingCustomers.map(customer => {
            if (customer.groupId && groupMap[customer.groupId]) {
              return {
                ...customer,
                groupCode: groupMap[customer.groupId].groupCode,
                groupName: groupMap[customer.groupId].groupName
              };
            }
            return customer;
          });
          
          console.log(`✅ Added group information for ${Object.keys(groupMap).length} groups`);
        } catch (groupError) {
          console.log('⚠️ Could not fetch group information:', groupError.message);
          // Continue without group info
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Pending customers retrieved successfully',
      data: customersWithGroups,
      count: customersWithGroups.length,
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
    console.error('❌ Error stack:', error.stack);
    
    // Ultimate fallback - simplest possible query
    try {
      console.log('⚠️ Using ultimate fallback query...');
      
      const { sequelize: fallbackDb } = await initModels();
      const { bu_id, page = 1, limit = 50 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      const fallbackQuery = `
        SELECT 
          id, 
          CUST_ID, 
          CUST_NO, 
          TITLE_ID, 
          FIRST_NAME, 
          MIDDLE_NAME, 
          LAST_NAME, 
          CUST_NM, 
          HOME_ADDRESS, 
          EMAIL_ADDRESS, 
          BU_ID,
          PHONE_NO, 
          status, 
          REC_ST, 
          CREATE_DT, 
          CREATED_BY, 
          BVN, 
          BVN_VERIFIED,
          group_id as groupId, 
          group_joined_at as groupJoinedAt
        FROM customers
        WHERE REC_ST = 'PENDING' OR status = 'Pending' OR status = 'PENDING'
        ORDER BY CREATE_DT DESC 
        LIMIT ? OFFSET ?
      `;
      
      const fallbackResult = await fallbackDb.query(fallbackQuery, {
        replacements: [parseInt(limit), offset],
        type: fallbackDb.QueryTypes.SELECT
      });
      
      const fallbackCustomers = fallbackResult || [];
      
      // Get total count for fallback
      const countResult = await fallbackDb.query(`
        SELECT COUNT(*) as total 
        FROM customers
        WHERE REC_ST = 'PENDING' OR status = 'Pending' OR status = 'PENDING'
      `, {
        type: fallbackDb.QueryTypes.SELECT
      });
      
      const total = countResult[0]?.total || 0;
      
      return res.json({
        success: true,
        message: 'Pending customers retrieved successfully (fallback mode)',
        data: fallbackCustomers,
        count: fallbackCustomers.length,
        total: total,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        }
      });
      
    } catch (fallbackError) {
      console.error('❌ All fallback queries failed:', fallbackError.message);
      
      return res.status(500).json({
        success: false,
        message: 'Error retrieving pending customers',
        error: error.message
      });
    }
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
        c.CUST_ID LIKE ? OR 
        c.CUST_NO LIKE ? OR 
        c.FIRST_NAME LIKE ? OR 
        c.LAST_NAME LIKE ? OR 
        c.CUST_NM LIKE ? OR 
        c.EMAIL_ADDRESS LIKE ? OR 
        c.PHONE_NO LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      for (let i = 0; i < 7; i++) {
        replacements.push(searchPattern);
      }
    }
    
    if (status) {
      whereClause += ' AND c.status = ?';
      replacements.push(status);
    }
    
    // Get total count
    const [countResult] = await db.query(`
      SELECT COUNT(*) as total 
      FROM customers c
      ${whereClause}
    `, {
      replacements: replacements
    });
    
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / parseInt(limit));
    
    // Prepare replacements for the main query (includes limit and offset)
    const dataReplacements = [...replacements, parseInt(limit), offset];
    
    // Build the main SQL query with proper LEFT JOIN and escaped table name
    const sqlQuery = `
      SELECT 
        c.*,
        g.group_code as groupCode, 
        g.group_name as groupName, 
        g.group_type as groupType
      FROM customers c
      LEFT JOIN \`Groups\` g ON c.group_id = g.id
      ${whereClause}
      ORDER BY c.CREATE_DT DESC 
      LIMIT ? OFFSET ?
    `;
    
    // Log the generated SQL for debugging
    console.log('Generated SQL:', sqlQuery);
    
    const [customers] = await db.query(sqlQuery, {
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
        'CREATE_DT', 'CREATED_BY', 'BVN', 'BVN_VERIFIED',
        'groupId', 'groupJoinedAt', 'groupCode', 'groupName'
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
    
    // Initialize models with error handling
    let custModel, groupModel;
    try {
      const models = await initModels();
      custModel = models.Customer;
      groupModel = models.Group;
    } catch (initError) {
      console.error('Error initializing models:', initError);
      return res.status(503).json({
        success: false,
        message: 'Database models could not be initialized',
        error: initError.message
      });
    }
    
    if (!custModel) {
      return res.status(503).json({
        success: false,
        message: 'Customer model not available'
      });
    }
    
    // Convert to string for consistent handling
    const customerId = String(CUST_ID).trim();
    
    // Try to find customer by different ID fields
    let customer = null;
    
    // Try direct database query to debug
    console.log(`🔍 Executing direct query to check if customer exists...`);
    const { sequelize } = await initModels();
    
    try {
      const [results] = await sequelize.query(
        `SELECT * FROM customers WHERE CUST_ID = ? OR CUST_NO = ? OR id = ?`,
        {
          replacements: [customerId, customerId, parseInt(customerId) || 0],
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      if (results) {
        console.log(`✅ Found customer via direct query:`, results);
        customer = results;
      } else {
        console.log(`❌ No customer found via direct query`);
      }
    } catch (queryError) {
      console.error(`❌ Direct query error:`, queryError.message);
    }
    
    // If direct query didn't work, try Sequelize methods
    if (!customer) {
      // Try CUST_ID first (most likely)
      try {
        console.log(`🔍 Trying CUST_ID with value: "${customerId}"`);
        
        customer = await custModel.findOne({
          where: { CUST_ID: customerId }
        });
        
        if (customer) {
          console.log(`✅ Found using CUST_ID`);
        }
      } catch (error) {
        console.log(`❌ Error with CUST_ID:`, error.message);
      }
    }
    
    // If not found, try id
    if (!customer) {
      const numericId = parseInt(customerId);
      if (!isNaN(numericId)) {
        console.log(`🔍 Trying id: ${numericId}`);
        try {
          customer = await custModel.findByPk(numericId);
          if (customer) {
            console.log(`✅ Found using id`);
          }
        } catch (error) {
          console.log(`❌ Error with id:`, error.message);
        }
      }
    }
    
    // If still not found, try CUST_NO
    if (!customer) {
      console.log(`🔍 Trying CUST_NO with value: "${customerId}"`);
      try {
        customer = await custModel.findOne({
          where: { CUST_NO: customerId }
        });
        if (customer) {
          console.log(`✅ Found using CUST_NO`);
        }
      } catch (error) {
        console.log(`❌ Error with CUST_NO:`, error.message);
      }
    }
    
    // If still not found, try with exact match including leading zeros
    if (!customer) {
      console.log(`🔍 Trying exact match with leading zeros: "${customerId}"`);
      try {
        customer = await custModel.findOne({
          where: { CUST_ID: customerId }
        });
        if (customer) {
          console.log(`✅ Found using exact match`);
        }
      } catch (error) {
        console.log(`❌ Error with exact match:`, error.message);
      }
    }
    
    if (!customer) {
      console.log(`❌ Customer not found with ID: ${customerId}`);
      
      // Get sample data to show what exists
      let sampleCustomers = [];
      try {
        sampleCustomers = await custModel.findAll({
          limit: 5,
          order: [['id', 'ASC']],
          attributes: ['id', 'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME']
        });
      } catch (sampleError) {
        console.log('Error getting sample data:', sampleError.message);
      }
      
      const sampleData = sampleCustomers.map(c => ({
        id: c.id,
        CUST_ID: c.CUST_ID,
        CUST_NO: c.CUST_NO,
        name: `${c.FIRST_NAME || ''} ${c.LAST_NAME || ''}`.trim()
      }));
      
      return res.status(404).json({
        success: false,
        message: `Customer not found with ID: ${customerId}`,
        note: 'Check the sample data below for valid ID formats',
        sampleData: sampleData
      });
    }
    
    // If customer has a groupId, fetch group information separately
    let groupInfo = null;
    if (customer.groupId && groupModel) {
      try {
        groupInfo = await groupModel.findByPk(customer.groupId, {
          attributes: ['id', 'groupCode', 'groupName', 'groupType', 'memberCount']
        });
      } catch (groupError) {
        console.warn('⚠️ Could not fetch group info:', groupError.message);
      }
    }
    
    // Convert customer to JSON and add group info
    const customerJson = customer.toJSON ? customer.toJSON() : customer;
    if (groupInfo) {
      customerJson.group = groupInfo;
    }
    
    console.log(`✅ Found customer:`, customerJson);
    
    res.json({
      success: true,
      message: 'Customer retrieved successfully',
      data: customerJson
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
 * Create customer with optional group assignment
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
  
  // Check for groupId in request body
  const { groupId } = body;
  if (groupId) {
    console.log(`👥 Customer will be assigned to group: ${groupId}`);
  }
  
  try {
    // Initialize models - NOW INCLUDING GROUP
    const { Customer: custModel, AML: amlModel, sequelize: db, WF_WORK_ITEM: wfModel, Group: groupModel } = await initModels();
    
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
      
      // VALIDATE GROUP IF PROVIDED - NEW
      let validatedGroup = null;
      if (groupId) {
        if (!groupModel) {
          throw new Error('Group model not available');
        }
        
        validatedGroup = await groupModel.findByPk(groupId, { transaction });
        
        if (!validatedGroup) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Group with ID ${groupId} not found`
          });
        }
        
        if (validatedGroup.status !== 'active') {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Group is not active (current status: ${validatedGroup.status})`
          });
        }
        
        // Check if group can accept more members
        if (validatedGroup.maxMembers > 0 && validatedGroup.memberCount >= validatedGroup.maxMembers) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Group has reached maximum member limit (${validatedGroup.maxMembers})`
          });
        }
        
        console.log(`✅ Group validated: ${validatedGroup.groupName} (${validatedGroup.groupCode})`);
      }
      
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
      if (groupId) console.log('  - Group ID:', groupId, 'Group Name:', validatedGroup?.groupName);

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

      // Prepare Customer Data - INCLUDING groupId
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
        BVN_VERIFIED: false,
        // Add group ID if provided (already validated)
        groupId: groupId || null,
        groupJoinedAt: groupId ? now : null,
        createdAt: now,
        updatedAt: now
      };

      console.log('📄 Creating customer with data:');
      console.log('  - CUST_ID:', finalCUST_ID);
      console.log('  - CUST_NO:', finalCUST_NO);
      console.log('  - Name:', fullName);
      console.log('  - BVN:', BVN || 'Not provided');
      if (groupId) console.log('  - Group:', groupId, validatedGroup?.groupName);

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
      
      // If groupId was provided, add customer to group's members array
      if (groupId && validatedGroup) {
        try {
          console.log(`👥 Adding customer to group ${groupId} members array...`);
          await validatedGroup.addMember(newCustomer.id);
          console.log('✅ Customer added to group members array');
          
          // Update member count (should be handled by Group model hook, but we can force refresh)
          await validatedGroup.reload({ transaction });
          console.log(`📊 Group member count now: ${validatedGroup.memberCount}`);
        } catch (groupError) {
          console.error('❌ Failed to add customer to group members array:', groupError.message);
          // Don't fail the whole transaction, but log error
          // You might want to rollback here depending on requirements
        }
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

      // Prepare response with group info
      let groupInfo = null;
      if (groupId && validatedGroup) {
        groupInfo = {
          groupId: validatedGroup.id,
          groupCode: validatedGroup.groupCode,
          groupName: validatedGroup.groupName,
          memberCount: validatedGroup.memberCount
        };
      }

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
          riskRating: customerRiskRating,
          // Include group info
          groupId: groupId || null,
          groupInfo: groupInfo
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

// ============================================
// ADD MISSING FUNCTIONS
// ============================================

/**
 * Approve customer
 * @route PUT /api/customers/approve/:customerId
 */
export const approveCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { approvedBy } = req.body;
    
    console.log('📝 Approving customer:', { customerId, approvedBy });
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Initialize models
    const { Customer: custModel, sequelize: db } = await initModels();
    
    if (!custModel || !db) {
      throw new Error('Models not initialized properly');
    }
    
    // Search for customer by CUST_ID, id, or CUST_NO
    let customer = await custModel.findOne({
      where: { CUST_ID: customerId },
      attributes: ['id', 'CUST_ID', 'CUST_NO', 'CUST_NM', 'REC_ST', 'status', 'groupId']
    });
    
    if (!customer && !isNaN(parseInt(customerId))) {
      customer = await custModel.findOne({
        where: { id: parseInt(customerId) },
        attributes: ['id', 'CUST_ID', 'CUST_NO', 'CUST_NM', 'REC_ST', 'status', 'groupId']
      });
    }
    
    if (!customer) {
      customer = await custModel.findOne({
        where: { CUST_NO: customerId },
        attributes: ['id', 'CUST_ID', 'CUST_NO', 'CUST_NM', 'REC_ST', 'status', 'groupId']
      });
    }
    
    if (!customer) {
      console.log('❌ Customer not found with any identifier:', customerId);
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    console.log('✅ Customer found:', {
      id: customer.id,
      CUST_ID: customer.CUST_ID,
      CUST_NO: customer.CUST_NO,
      currentStatus: customer.status,
      currentREC_ST: customer.REC_ST,
      groupId: customer.groupId
    });
    
    // Check if already active or approved
    if (customer.REC_ST === 'ACTIVE' || customer.status === 'Approved') {
      return res.status(400).json({
        success: false,
        message: 'Customer is already approved'
      });
    }
    
    const transaction = await db.transaction();
    
    try {
      // ✅ Update: set REC_ST = 'ACTIVE', status = 'Approved'
      const [updateResult] = await db.query(
        `UPDATE customers 
         SET REC_ST = 'ACTIVE', 
             status = 'Approved', 
             APPROVED_BY = ?, 
             APPROVED_DT = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        {
          replacements: [approvedBy || 'system', customer.id],
          transaction
        }
      );
      
      console.log('📊 Update result:', updateResult);
      
      if (updateResult.affectedRows === 0) {
        throw new Error('No rows were updated');
      }
      
      await transaction.commit();
      console.log('✅ Transaction committed successfully');
      
      // Fetch the updated customer
      const [updatedRows] = await db.query(
        `SELECT id, CUST_ID, CUST_NO, CUST_NM, REC_ST, status, APPROVED_BY, APPROVED_DT, group_id as groupId 
         FROM customers 
         WHERE id = ?`,
        {
          replacements: [customer.id]
        }
      );
      
      const updatedCustomer = updatedRows[0];
      
      console.log('✅ Customer approved successfully. REC_ST:', updatedCustomer.REC_ST, 'status:', updatedCustomer.status);
      
      res.json({
        success: true,
        message: 'Customer approved successfully',
        customer: {
          id: updatedCustomer.id,
          CUST_ID: updatedCustomer.CUST_ID,
          CUST_NO: updatedCustomer.CUST_NO,
          CUST_NM: updatedCustomer.CUST_NM,
          status: updatedCustomer.status,
          REC_ST: updatedCustomer.REC_ST,
          approvedBy: updatedCustomer.APPROVED_BY,
          approvedAt: updatedCustomer.APPROVED_DT,
          groupId: updatedCustomer.groupId
        }
      });
      
    } catch (updateError) {
      await transaction.rollback();
      console.error('❌ Update error, transaction rolled back:', updateError);
      throw updateError;
    }
    
  } catch (error) {
    console.error('❌ Error approving customer:', error);
    console.error('❌ Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to approve customer',
      error: error.message
    });
  }
};

/**
 * Reject customer
 * @route PUT /api/customers/reject/:customerId
 */
export const rejectCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { rejectedBy, rejectionReason } = req.body;
    
    console.log('📝 Rejecting customer:', { customerId, rejectedBy, rejectionReason });
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Initialize models
    const { Customer: custModel, sequelize: db } = await initModels();
    
    if (!custModel || !db) {
      throw new Error('Models not initialized properly');
    }
    
    // Search for customer by multiple identifiers
    let customer = await custModel.findOne({
      where: { CUST_ID: customerId }
    });
    
    if (!customer && !isNaN(parseInt(customerId))) {
      customer = await custModel.findOne({
        where: { id: parseInt(customerId) }
      });
    }
    
    if (!customer) {
      customer = await custModel.findOne({
        where: { CUST_NO: customerId }
      });
    }
    
    if (!customer) {
      console.log('❌ Customer not found with any identifier:', customerId);
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    console.log('✅ Customer found:', {
      id: customer.id,
      CUST_ID: customer.CUST_ID,
      CUST_NO: customer.CUST_NO,
      currentStatus: customer.status,
      currentREC_ST: customer.REC_ST
    });
    
    // Check if already rejected
    if (customer.REC_ST === 'REJECTED' || customer.status === 'Rejected') {
      return res.status(400).json({
        success: false,
        message: 'Customer is already rejected'
      });
    }
    
    const transaction = await db.transaction();
    
    try {
      // Update customer: set REC_ST to 'REJECTED', status to 'Rejected'
      const [updateResult] = await db.query(
        `UPDATE customers 
         SET REC_ST = 'REJECTED', 
             status = 'Rejected', 
             REJECTED_BY = ?, 
             REJECTED_DT = NOW(), 
             REJECTION_REASON = ?,
             updated_at = NOW()
         WHERE id = ?`,
        {
          replacements: [rejectedBy || 'system', rejectionReason || 'No reason provided', customer.id],
          transaction
        }
      );
      
      if (updateResult.affectedRows === 0) {
        throw new Error('No rows were updated');
      }
      
      await transaction.commit();
      
      console.log('✅ Customer rejected successfully');
      
      // Fetch updated customer
      const [updatedRows] = await db.query(
        `SELECT id, CUST_ID, CUST_NO, CUST_NM, REC_ST, status, REJECTED_BY, REJECTED_DT, REJECTION_REASON, group_id as groupId 
         FROM customers 
         WHERE id = ?`,
        { replacements: [customer.id] }
      );
      
      const updatedCustomer = updatedRows[0];
      
      res.json({
        success: true,
        message: 'Customer rejected',
        customer: {
          id: updatedCustomer.id,
          CUST_ID: updatedCustomer.CUST_ID,
          CUST_NO: updatedCustomer.CUST_NO,
          CUST_NM: updatedCustomer.CUST_NM,
          status: updatedCustomer.status,
          REC_ST: updatedCustomer.REC_ST,
          rejectedBy: updatedCustomer.REJECTED_BY,
          rejectedAt: updatedCustomer.REJECTED_DT,
          rejectionReason: updatedCustomer.REJECTION_REASON,
          groupId: updatedCustomer.groupId
        }
      });
      
    } catch (updateError) {
      await transaction.rollback();
      console.error('❌ Update error, transaction rolled back:', updateError);
      throw updateError;
    }
    
  } catch (error) {
    console.error('❌ Error rejecting customer:', error);
    console.error('❌ Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to reject customer',
      error: error.message
    });
  }
};

/**
 * Deactivate customer
 * @route PATCH /api/customers/:CUST_ID/deactivate
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
      customer: customer.toJSON ? customer.toJSON() : customer
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
 * @route GET /api/customers/search
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
      order: [['CREATE_DT', 'DESC']],
      attributes: [
        'id', 'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 
        'CUST_NM', 'EMAIL_ADDRESS', 'PHONE_NO', 'BVN', 'NIN',
        'status', 'REC_ST', 'groupId', 'groupJoinedAt'
      ]
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
 * @route GET /api/customers/advanced-search
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
      order: [['CREATE_DT', 'DESC']],
      attributes: [
        'id', 'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 
        'CUST_NM', 'EMAIL_ADDRESS', 'PHONE_NO', 'BVN', 'NIN',
        'status', 'REC_ST', 'groupId', 'groupJoinedAt'
      ]
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
 * @route GET /api/customers/dashboard-summary
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
      SELECT CUST_ID, CUST_NO, CUST_NM, status, BVN, BVN_VERIFIED, CREATE_DT, group_id as groupId
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
 * @route GET /api/customers/schema
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
    const { Customer: custModel, sequelize, Group } = await initModels();
    
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
    
    // Define allowed fields to update (whitelist)
    const allowedFields = [
      'TITLE_ID', 'FIRST_NAME', 'MIDDLE_NAME', 'LAST_NAME', 'CUST_NM',
      'HOME_ADDRESS', 'EMAIL_ADDRESS', 'BU_ID', 'MAIDEN_NM', 'BIRTH_DT',
      'CNTRY_OF_BIRTH_ID', 'CUST_CAT', 'CAMPAIGN_ID', 'GENDER_TY',
      'NATIONALITY_NO', 'COUNTRY_NM', 'STATE', 'LOCAL_GOV', 'OPENING_RSN_ID',
      'OPENED_DT', 'RESIDENT_CNTRY_ID', 'RISK_CLASS', 'STMNT_FREQ_CD',
      'STMNT_FREQ_VALUE', 'CREATED_BY', 'USER_ID', 'INDUSTRY_ID', 'INDUSTRY_CD',
      'TAX_STATUS', 'TAX_GRP_ID', 'MARITAL_ST', 'OPERATIONS_CRNCY_ID', 'EMP_ST',
      'ORGANISATION_NM', 'REGISTRATION_ADDRESS', 'REGISTRATION_DT',
      'ALERT_DELIVERY_METHOD', 'KYC_LEVEL', 'PHONE_NO', 'SMS', 'IS_PEP',
      'BVN', 'NIN', 'SANCTION_SCORE', 'DOCUMENT_VERIFICATION_STATUS',
      'groupId', 'group_joined_at', 'status', 'REC_ST'
    ];
    
    // Filter update data to only allowed fields
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }
    
    // Handle SMS checkbox value (convert boolean to 'Enabled'/'Disabled')
    if (updateData.SMS !== undefined) {
      updateData.SMS = updateData.SMS ? 'Enabled' : 'Disabled';
    }
    
    // Handle groupId change
    const oldGroupId = customer.groupId;
    const newGroupId = updateData.groupId;
    
    await customer.update(updateData);
    
    // If group assignment changed, update group members arrays
    if (newGroupId !== oldGroupId && Group) {
      try {
        const transaction = await sequelize.transaction();
        try {
          // Remove from old group if existed
          if (oldGroupId) {
            const oldGroup = await Group.findByPk(oldGroupId, { transaction });
            if (oldGroup) {
              await oldGroup.removeMember(customer.id);
            }
          }
          // Add to new group if provided
          if (newGroupId) {
            const newGroup = await Group.findByPk(newGroupId, { transaction });
            if (newGroup && newGroup.status === 'active') {
              if (newGroup.canAddMember()) {
                await newGroup.addMember(customer.id);
              } else {
                console.warn(`Group ${newGroupId} is at maximum capacity`);
              }
            }
          }
          await transaction.commit();
        } catch (groupError) {
          await transaction.rollback();
          console.warn('⚠️ Group update failed:', groupError.message);
        }
      } catch (error) {
        console.warn('⚠️ Could not update group members:', error.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Customer updated successfully',
      customer: customer.toJSON ? customer.toJSON() : customer
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
 * Batch upload customers with group support
 */
// In your CustomerController.js - COMPLETE FIXED VERSION

// In your CustomerController.js - FIXED VERSION with group assignment

export const batchUploadCustomers = async (req, res) => {
  const startTime = Date.now();
  console.log('📦 Starting batch upload...');
  
  const updateExisting = req.query.updateExisting === 'true';
  
  try {
    const { Customer: custModel, sequelize: db, Group: groupModel } = await initModels();
    
    if (!custModel || !db) {
      throw new Error('Models not initialized properly');
    }
    
    const customers = req.body.customers || [];
    
    if (!customers.length) {
      return res.status(400).json({
        success: false,
        message: 'No customer data provided'
      });
    }
    
    console.log(`📊 Processing ${customers.length} customers`);
    console.log(`🔄 Update existing: ${updateExisting ? 'YES' : 'NO'}`);
    
    const transaction = await db.transaction();
    
    try {
      const results = {
        total: customers.length,
        created: 0,
        updated: 0,
        duplicates: 0,
        failed: 0,
        assignedToGroups: 0,
        errors: [],
        successes: []
      };
      
      // Track group assignments for batch update
      const groupAssignments = {};
      
      for (let index = 0; index < customers.length; index++) {
        const row = customers[index];
        const rowNumber = index + 2;
        
        try {
          const custId = row.CUST_ID || '';
          const email = row.EMAIL_ADDRESS || '';
          const groupCode = row.GROUP_ID || row.groupId || '';
          
          console.log(`🔍 Row ${rowNumber}: CUST_ID=${custId}, GROUP=${groupCode}`);
          
          // Check if customer exists
          let existingCustomer = null;
          if (custId) {
            existingCustomer = await custModel.findOne({
              where: { CUST_ID: custId },
              transaction,
              attributes: ['id', 'CUST_ID', 'CUST_NO']
            });
          }
          
          if (existingCustomer) {
            if (updateExisting) {
              // Update existing customer
              console.log(`🔄 Updating existing customer: ${custId}`);
              
              const updateData = {};
              
              if (row.FIRST_NAME) updateData.FIRST_NAME = row.FIRST_NAME;
              if (row.LAST_NAME) updateData.LAST_NAME = row.LAST_NAME;
              if (row.HOME_ADDRESS) updateData.HOME_ADDRESS = row.HOME_ADDRESS;
              if (row.EMAIL_ADDRESS) updateData.EMAIL_ADDRESS = row.EMAIL_ADDRESS;
              if (row.PHONE_NO) updateData.PHONE_NO = row.PHONE_NO.toString();
              if (row.STATE) updateData.STATE = row.STATE;
              if (row.REC_ST) updateData.REC_ST = row.REC_ST;
              if (row.GENDER_TY) updateData.GENDER_TY = row.GENDER_TY;
              if (row.BU_ID) updateData.BU_ID = row.BU_ID.toString();
              
              // Handle BVN
              if (row.BVN) {
                const bvnStr = row.BVN.toString();
                if (bvnStr.length === 11 || bvnStr.length === 12) {
                  updateData.BVN = bvnStr;
                }
              }
              
              if (row.NIN) updateData.NIN = row.NIN.toString();
              if (row.NEXTOF_KIN_NM_1) updateData.NEXTOF_KIN_NM_1 = row.NEXTOF_KIN_NM_1;
              if (row.RELATIONSHIP_1) updateData.RELATIONSHIP_1 = row.RELATIONSHIP_1;
              if (row.KIN_PHONE_NO_1) updateData.KIN_PHONE_NO_1 = row.KIN_PHONE_NO_1.toString();
              if (row.KIN_ADDRESS_1) updateData.KIN_ADDRESS_1 = row.KIN_ADDRESS_1;
              
              // Handle group assignment - update group_id field if it exists
              if (groupCode) {
                updateData.group_id = groupCode;
              }
              
              // Handle Excel numeric date
              if (row.BIRTH_DT) {
                const birthDate = convertExcelDate(row.BIRTH_DT);
                if (birthDate) {
                  updateData.BIRTH_DT = birthDate;
                }
              }
              
              updateData.updated_at = new Date();
              
              await existingCustomer.update(updateData, { transaction });
              
              // Track for group assignment
              if (groupCode) {
                if (!groupAssignments[groupCode]) {
                  groupAssignments[groupCode] = [];
                }
                groupAssignments[groupCode].push(custId);
              }
              
              results.updated++;
              results.successes.push({ 
                row: rowNumber, 
                CUST_ID: custId, 
                action: 'UPDATED',
                group: groupCode || null
              });
              console.log(`✅ Updated customer: ${custId}`);
            } else {
              results.duplicates++;
              results.errors.push({ 
                row: rowNumber, 
                CUST_ID: custId, 
                message: 'Customer already exists (use ?updateExisting=true to update)' 
              });
              console.log(`⚠️ Duplicate customer: ${custId}`);
            }
            continue;
          }
          
          // ===== CREATE NEW CUSTOMER =====
          console.log(`🆕 Creating new customer: ${custId}`);
          
          const now = new Date();
          
          // Handle Excel numeric date
          let birthDate = null;
          if (row.BIRTH_DT) {
            birthDate = convertExcelDate(row.BIRTH_DT);
          }
          
          // Handle BVN
          let bvnValue = null;
          if (row.BVN) {
            bvnValue = row.BVN.toString();
            // Accept both 11 and 12 digit BVN
            if (bvnValue.length !== 11 && bvnValue.length !== 12) {
              console.log(`⚠️ Invalid BVN length for ${custId}: ${bvnValue.length} - skipping BVN`);
              bvnValue = null;
            }
          }
          
          // Build customer data object
          const customerData = {
            CUST_ID: custId,
            CUST_NO: row.CUST_NO || custId,
            FIRST_NAME: row.FIRST_NAME || '',
            LAST_NAME: row.LAST_NAME || '',
            CUST_NM: `${row.FIRST_NAME || ''} ${row.LAST_NAME || ''}`.trim(),
            HOME_ADDRESS: row.HOME_ADDRESS || '',
            EMAIL_ADDRESS: row.EMAIL_ADDRESS || null,
            BU_ID: row.BU_ID ? row.BU_ID.toString() : null,
            PHONE_NO: row.PHONE_NO ? row.PHONE_NO.toString() : '',
            BIRTH_DT: birthDate,
            GENDER_TY: row.GENDER_TY || '',
            STATE: row.STATE || '',
            REC_ST: row.REC_ST || 'PENDING',
            NEXTOF_KIN_NM_1: row.NEXTOF_KIN_NM_1 || '',
            RELATIONSHIP_1: row.RELATIONSHIP_1 || '',
            KIN_PHONE_NO_1: row.KIN_PHONE_NO_1 ? row.KIN_PHONE_NO_1.toString() : '',
            KIN_ADDRESS_1: row.KIN_ADDRESS_1 || '',
            group_id: groupCode || null,  // Set group_id field
            created_at: now,
            updated_at: now,
            CREATE_DT: now,
            CREATED_BY: 'batch_upload',
            USER_ID: 'system',
            status: 'Pending',
            BVN_VERIFIED: false,
            IS_PEP: false,
            SANCTION_SCORE: 10,
            DOCUMENT_VERIFICATION_STATUS: 'Pending'
          };
          
          // Add optional fields only if valid
          if (bvnValue) customerData.BVN = bvnValue;
          if (row.NIN) customerData.NIN = row.NIN.toString();
          
          // Create the customer
          const newCustomer = await custModel.create(customerData, { transaction });
          
          // Track for group assignment
          if (groupCode) {
            if (!groupAssignments[groupCode]) {
              groupAssignments[groupCode] = [];
            }
            groupAssignments[groupCode].push(custId);
          }
          
          results.created++;
          results.successes.push({ 
            row: rowNumber, 
            CUST_ID: custId, 
            action: 'CREATED',
            group: groupCode || null
          });
          console.log(`✅ Created customer: ${custId}`);
          
        } catch (rowError) {
          console.error(`❌ Error processing row ${rowNumber}:`, rowError.message);
          results.failed++;
          results.errors.push({ 
            row: rowNumber, 
            error: rowError.message, 
            data: row 
          });
        }
      }
      
      // ===== PROCESS GROUP ASSIGNMENTS =====
      if (Object.keys(groupAssignments).length > 0) {
        console.log(`👥 Processing group assignments for ${Object.keys(groupAssignments).length} groups...`);
        
        for (const [groupCode, memberIds] of Object.entries(groupAssignments)) {
          try {
            // Find the group by group_code
            const group = await groupModel.findOne({
              where: { group_code: groupCode },
              transaction
            });
            
            if (group) {
              console.log(`🔍 Found group: ${group.group_name} (${groupCode})`);
              
              // Get current members
              let currentMembers = [];
              if (group.members) {
                try {
                  currentMembers = JSON.parse(group.members);
                } catch (e) {
                  // If not JSON, try comma-separated
                  currentMembers = group.members.split(',').map(m => m.trim()).filter(Boolean);
                }
              }
              
              // Add new members
              const updatedMembers = [...new Set([...currentMembers, ...memberIds])];
              
              // Update member count
              const memberCount = updatedMembers.length;
              
              // Store as JSON
              const membersJson = JSON.stringify(updatedMembers);
              
              // Update the group
              await group.update({
                members: membersJson,
                member_count: memberCount,
                updated_at: new Date()
              }, { transaction });
              
              console.log(`✅ Added ${memberIds.length} members to group ${groupCode}. Total members: ${memberCount}`);
              results.assignedToGroups += memberIds.length;
            } else {
              console.log(`⚠️ Group not found: ${groupCode}`);
              results.errors.push({
                message: `Group not found: ${groupCode}`,
                affectedCustomers: memberIds
              });
            }
          } catch (groupError) {
            console.error(`❌ Error processing group ${groupCode}:`, groupError);
            results.errors.push({
              message: `Failed to update group ${groupCode}: ${groupError.message}`,
              affectedCustomers: memberIds
            });
          }
        }
      }
      
      await transaction.commit();
      
      const processingTime = Date.now() - startTime;
      console.log(`✅ Batch upload completed in ${processingTime}ms`);
      console.log(`📊 Results: Created: ${results.created}, Updated: ${results.updated}, Duplicates: ${results.duplicates}, Failed: ${results.failed}, Group Assignments: ${results.assignedToGroups}`);
      
      return res.status(200).json({
        success: true,
        message: updateExisting ? 'Batch upload completed (with updates)' : 'Batch upload completed',
        summary: {
          total: results.total,
          created: results.created,
          updated: results.updated,
          duplicates: results.duplicates,
          failed: results.failed,
          assignedToGroups: results.assignedToGroups,
          successRate: results.total > 0 ? (((results.created + results.updated) / results.total) * 100).toFixed(2) + '%' : '0%'
        },
        groupAssignments: groupAssignments,
        details: {
          successes: results.successes,
          errors: results.errors
        },
        metadata: {
          processingTimeMs: processingTime,
          updateMode: updateExisting
        }
      });
      
    } catch (transactionError) {
      await transaction.rollback();
      console.error('❌ Transaction error:', transactionError);
      throw transactionError;
    }
    
  } catch (error) {
    console.error('❌ Fatal error in batch upload:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Batch upload failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Helper function to convert Excel date number to JavaScript Date
function convertExcelDate(excelDate) {
  if (!excelDate) return null;
  
  try {
    // If it's already a string in DD/MM/YYYY format
    if (typeof excelDate === 'string' && excelDate.includes('/')) {
      const parts = excelDate.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
    }
    
    // If it's a number (Excel date)
    if (typeof excelDate === 'number') {
      // Excel dates are days since 1900-01-01
      const excelEpoch = new Date(1900, 0, 1);
      const days = excelDate - 2; // Adjust for Excel's leap year bug
      return new Date(excelEpoch.getTime() + days * 86400000);
    }
    
    // Try regular Date parsing
    const date = new Date(excelDate);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    return null;
  } catch (e) {
    console.log(`⚠️ Error converting date: ${excelDate}`, e.message);
    return null;
  }
}


// Replace the export default at the bottom with:

// Replace the export default at the bottom with this:

// Add this right before your exports
console.log('📋 Exporting from CustomerController:', [
  'initModels',
  'testDatabaseConnection',
  'getPendingCustomers',
  'getAllCustomers',
  'getCustomerById',
  'createCustomer',
  'updateCustomer',
  'approveCustomer',
  'rejectCustomer',
  'deactivateCustomer',
  'searchCustomers',
  'advancedSearchCustomers',
  'getCustomerSummary',
  'getCustomerSchema',
  'batchUploadCustomers',
  'getCustomerWithBVN',
  'findByBVN',
  'updateBVNVerification',
  'getCustomerWithLoans',
  'checkHasActiveLoan',
  'getCustomerFullSummary',
  'assignCustomerToGroup',
  'removeCustomerFromGroup',
  'getCustomersByGroup',
  'bulkAssignCustomersToGroups'
].join(', '));

// export {
//   initModels,
//   testDatabaseConnection,
//   getPendingCustomers,
//   getAllCustomers,
//   getCustomerById,
//   createCustomer,
//   updateCustomer,
//   approveCustomer,
//   rejectCustomer,
//   deactivateCustomer,
//   searchCustomers,
//   advancedSearchCustomers,
//   getCustomerSummary,
//   getCustomerSchema,
//   batchUploadCustomers,
//   getCustomerWithBVN,
//   findByBVN,
//   updateBVNVerification,
//   getCustomerWithLoans,
//   checkHasActiveLoan,
//   getCustomerFullSummary,
//   assignCustomerToGroup,
//   removeCustomerFromGroup,
//    // ✅ SINGLE EXPORT - NO DUPLICATE
//   bulkAssignCustomersToGroups  // ✅ SINGLE EXPORT - NO "Endpoint" suffix
// };