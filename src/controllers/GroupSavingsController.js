// controllers/GroupSavingsController.js - UPDATED WITH SAFE HANDLING
import GroupSavings from '../models/GroupSavings.js';
import GroupSavingsContribution from '../models/GroupSavingsContribution.js';
import GroupSavingsWithdrawal from '../models/GroupSavingsWithdrawal.js';
import Group from '../models/Group.js';
import Customer from '../models/Customer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Transaction from '../models/Transaction.js';
import { generateAccountNumber } from '../utils/generateAccountNumber.js';
import logAuditTrail from '../Services/AuditService.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';
import { createGroupSavingsTransaction } from '../utils/transactionHelper.js';
import asyncHandler from 'express-async-handler';
import SavingsProduct from '../models/SavingsProduct.js';
import AuditTrail from '../models/AuditTrail.js';

// ✅ SAFE UTILITY FUNCTIONS
const safeParseFloat = (value, defaultValue = 0) => {
  if (value === null || value === undefined) return defaultValue;
  try {
    if (typeof value === 'object' && value.toString) {
      const str = value.toString();
      return parseFloat(str) || defaultValue;
    }
    return parseFloat(value) || defaultValue;
  } catch (error) {
    console.error('Error in safeParseFloat:', error);
    return defaultValue;
  }
};

const safeDecimal128 = (value, defaultValue = '0.00') => {
  try {
    if (!value && value !== 0) return mongoose.Types.Decimal128.fromString(defaultValue);
    
    const numValue = safeParseFloat(value, parseFloat(defaultValue));
    return mongoose.Types.Decimal128.fromString(numValue.toFixed(2));
  } catch (error) {
    console.error('Error in safeDecimal128:', error);
    return mongoose.Types.Decimal128.fromString(defaultValue);
  }
};

const safeToString = (value, defaultValue = '') => {
  if (value === null || value === undefined) return defaultValue;
  try {
    if (typeof value === 'string') return value.trim();
    if (typeof value.toString === 'function') return value.toString().trim();
    return String(value || defaultValue).trim();
  } catch (error) {
    return defaultValue;
  }
};

// ✅ CREATE GROUP SAVINGS - UPDATED WITH SAFE HANDLING
export const createGroupSavings = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      groupCode,
      savingsType,
      targetAmount,
      minimumContribution,
      contributionFrequency,
      managedBy,
      withdrawalRules
    } = req.body;

    console.log('=== STARTING GROUP SAVINGS CREATION ===');
    console.log('Received request:', { groupCode, savingsType, targetAmount, minimumContribution });

    // ✅ SAFE VALIDATION
    const safeGroupCode = safeToString(groupCode);
    const safeSavingsType = safeToString(savingsType);
    const safeTargetAmount = safeParseFloat(targetAmount, 0);
    const safeMinContribution = safeParseFloat(minimumContribution, 0);

    if (!safeGroupCode || !safeSavingsType) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Required: groupCode, savingsType.',
      });
    }

    // Validate savings type
    const validSavingsTypes = ['union_purse', 'emergency_fund', 'project_fund', 'general_savings', 'project_savings'];
    if (!validSavingsTypes.includes(safeSavingsType)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid savings type. Must be one of: ${validSavingsTypes.join(', ')}`,
      });
    }

    // Validate contribution frequency
    const validFrequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'custom'];
    let normalizedFrequency = 'monthly';
    
    if (contributionFrequency) {
      normalizedFrequency = safeToString(contributionFrequency).toLowerCase();
      if (!validFrequencies.includes(normalizedFrequency)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Invalid contribution frequency. Must be one of: ${validFrequencies.join(', ')}`,
        });
      }
    }

    // ✅ VALIDATE GROUP EXISTS
    const group = await Group.findOne({ groupCode: safeGroupCode }).session(session);
    if (!group) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Group not found.',
      });
    }

    // ✅ CHECK FOR EXISTING SAVINGS
    const existingSavings = await GroupSavings.findOne({
      groupCode: safeGroupCode,
      savingsType: safeSavingsType,
      status: 'active'
    }).session(session);
    
    if (existingSavings) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Group already has an active ${safeSavingsType} savings account.`,
      });
    }

    // ✅ SAFE MANAGERS VALIDATION
    let finalManagedBy = [];
    try {
      if (managedBy && Array.isArray(managedBy) && managedBy.length > 0) {
        // Filter out invalid managers and dedupe
        finalManagedBy = [...new Set(managedBy.filter(custId => 
          group.members && group.members.includes(custId)
        ))];
      }
      
      // If no valid managers provided, use group members
      if (finalManagedBy.length === 0) {
        finalManagedBy = group.members ? [...new Set(group.members)] : [];
      }
      
      if (finalManagedBy.length === 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Group must have at least one member to assign as manager.',
        });
      }
    } catch (managerError) {
      console.error('Error processing managers:', managerError);
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Invalid manager data provided.',
      });
    }

    // ✅ GENERATE ACCOUNT NUMBER WITH SAFE HANDLING
    let accountNumber;
    try {
      let attempts = 0;
      while (attempts < 5) {
        const accountResult = await generateAccountNumber('ACCT_SAVINGS');
        accountNumber = safeToString(accountResult?.formattedString);
        
        if (!accountNumber) {
          attempts++;
          continue;
        }

        // Check uniqueness in both collections
        const existingGS = await GroupSavings.findOne({ accountNumber }).session(session);
        const existingCA = await CustomerAccount.findOne({ account_number: accountNumber }).session(session);
        
        if (!existingGS && !existingCA) {
          break;
        }
        attempts++;
        console.log(`⚠️ Account number ${accountNumber} duplicate, retrying... (attempt ${attempts})`);
      }
      
      if (!accountNumber) {
        throw new Error('Failed to generate account number');
      }
    } catch (accountError) {
      logger.error('Error generating account number:', accountError);
      await session.abortTransaction();
      return res.status(500).json({
        success: false,
        message: 'Failed to generate unique account number for group savings.',
        error: accountError.message,
      });
    }

    // ✅ SAFE SAVINGS PRODUCT HANDLING
    let savingsProduct;
    try {
      console.log('🔍 Finding/Creating SavingsProduct for group savings...');
      
      const defaultProductCode = safeSavingsType.toUpperCase();
      savingsProduct = await SavingsProduct.findByProductCode(defaultProductCode);
      
      if (!savingsProduct || !savingsProduct.isActive()) {
        console.log(`📝 No active default product found for "${defaultProductCode}", creating group-specific one...`);
        
        let PROD_ID = await SavingsProduct.getNextProdId();
        if (!Number.isInteger(PROD_ID) || PROD_ID <= 0) {
          console.warn(`⚠️ Invalid PROD_ID: ${PROD_ID}, using timestamp fallback`);
          PROD_ID = Math.floor(Date.now() / 1000) % 1000000;
        }
        
        const productCode = `GRP_${safeGroupCode}_${safeSavingsType.toUpperCase()}`;
        console.log(`✅ Using PROD_ID: ${PROD_ID}, Product Code: ${productCode}`);

        const savingsProductData = {
          PROD_ID: Number(PROD_ID),
          productCode: productCode,
          productName: `Group Savings - ${safeToString(group.groupName)} - ${safeSavingsType.replace('_', ' ')}`,
          productDescription: `Group savings account for ${safeToString(group.groupName)} - ${safeSavingsType.replace('_', ' ')}`,
          productType: 'SAVINGS',
          CRNCY_ID: 'NGN',
          BU_ID: ['001'],
          REC_ST: 'A',
          CREATED_BY: req.user?.id?.toString() || 'system',
          interestRate: safeDecimal128("0.00"),
          minimumBalance: safeDecimal128(safeMinContribution),
          PROD_CD: productCode,
          PROD_DESC: `Group savings account for ${safeToString(group.groupName)}`,
          PRODUCT_TYPE: 'SAVINGS'
        };

        savingsProduct = new SavingsProduct(savingsProductData);
        await savingsProduct.save({ session });
        console.log('✅ Group-specific SavingsProduct created successfully');
      } else {
        console.log('✅ Using existing SavingsProduct:', savingsProduct.productCode);
      }
    } catch (productError) {
      console.error('❌ Error handling SavingsProduct:', productError);
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Failed to setup savings product: ${productError.message}`,
      });
    }

    // ✅ SAFE CREATEDBY HANDLING
    let createdById;
    try {
      if (req.user && req.user.id && mongoose.Types.ObjectId.isValid(req.user.id)) {
        createdById = new mongoose.Types.ObjectId(req.user.id);
      } else {
        console.warn('Invalid or missing user ID for createdBy, using system default');
        // Create a safe fallback ObjectId
        createdById = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
      }
    } catch (error) {
      console.warn('Error processing createdBy, using system default:', error);
      createdById = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
    }

    // ✅ SAFE WITHDRAWAL RULES
    const safeWithdrawalRules = {
      minWithdrawal: safeDecimal128(withdrawalRules?.minWithdrawal || 0),
      maxWithdrawal: safeDecimal128(withdrawalRules?.maxWithdrawal || 0),
      approvalRequired: withdrawalRules?.approvalRequired !== false,
      minApprovers: Math.max(1, safeParseFloat(withdrawalRules?.minApprovers, 1)),
      withdrawalFrequency: safeToString(withdrawalRules?.withdrawalFrequency, 'anytime')
    };

    // ✅ CREATE GROUP SAVINGS ACCOUNT WITH SAFE BALANCES
    const newGroupSavings = new GroupSavings({
      // Group identification
      group: group._id,
      groupCode: safeGroupCode,
      groupName: safeToString(group.groupName, 'Unknown Group'),
      
      // Savings configuration
      savingsType: safeSavingsType,
      accountNumber: accountNumber,
      
      // Financial fields with safe defaults
      targetAmount: safeDecimal128(safeTargetAmount),
      minimumContribution: safeDecimal128(safeMinContribution),
      
      // Balance fields with safe initialization
      LEDGER_BAL: safeDecimal128('0.00'),
      CLEARED_BAL: safeDecimal128('0.00'),
      AVAILABLE_BALANCE: safeDecimal128('0.00'),
      currentBalance: 0,
      
      // Contribution settings
      contributionFrequency: normalizedFrequency,
      
      // Management
      managedBy: finalManagedBy,
      members: group.members ? [...new Set(group.members)] : [],
      
      // Withdrawal rules
      withdrawalRules: safeWithdrawalRules,
      
      // Product linking
      linkedProductId: savingsProduct ? Number(savingsProduct.PROD_ID) : 0,
      linkedProductCode: savingsProduct ? savingsProduct.productCode : 'DEFAULT',
      
      // Status and audit
      status: 'active',
      isActive: true,
      createdBy: createdById
    });

    const savedSavings = await newGroupSavings.save({ session });
    console.log('✅ GroupSavings created successfully:', savedSavings._id);

    // ✅ SAFE CUSTOMER ACCOUNT CREATION
    let groupCustId;
    try {
      const numericGroupCode = safeGroupCode.replace(/^GRP/i, '');
      groupCustId = numericGroupCode && !isNaN(numericGroupCode) ? Number(numericGroupCode) : 99999;
    } catch (error) {
      groupCustId = 99999;
    }

    const groupCustomerAccount = new CustomerAccount({
      account_number: accountNumber,
      customer_id: groupCustId,
      branch: 1,
      product: savingsProduct ? (savingsProduct.PROD_CD || savingsProduct.productCode) : 'DEFAULT_SAVINGS',
      product_type: 'savings',
      primary_relationship_manager: 1,
      ACCT_NO: accountNumber,
      ACCT_ID: accountNumber.slice(-6),
      ACCT_NM: `${safeToString(group.groupName)} - ${safeSavingsType.replace('_', ' ').toUpperCase()}`,
      CUST_ID: groupCustId,
      BU_ID: '001',
      ACCOUNT_TYPE: 'SAVINGS',
      PRODUCT_DESC: `Group Savings - ${safeSavingsType.replace('_', ' ')}`,
      REC_ST: 'ACTIVE',
      LEDGER_BAL: safeDecimal128('0.00'),
      CLEARED_BAL: safeDecimal128('0.00'),
      AVAILABLE_BALANCE: safeDecimal128('0.00'),
      cleared_balance: 0,
      ledger_balance: 0,
      INTEREST_RATE: safeDecimal128('0.00'),
      INTEREST_GL_ACCT_NO: '1-01-001-001-001-1',
      ACCRUED_INTEREST: safeDecimal128('0.00'),
      DR_ALLOWED: true,
      CR_ALLOWED: true,
      lastActivityDate: new Date(),
      status: 'Active',
      substatus: 'Active',
      creation_date: new Date(),
      last_updated: new Date(),
      isGroupAccount: true,
      groupSavingsId: savedSavings._id,
      linkedProductId: savingsProduct ? Number(savingsProduct.PROD_ID) : 0,
      currency: 'NGN',
      created_by: 1,
      approved_by: 1,
      channel: 1,
      online_enabled: true,
      auto_approve: false,
      isfirst: 0,
      sms_alert: 'No',
      email_alert: 'No',
      disbursement_method: 'Cheque'
    });

    const savedCustomerAccount = await groupCustomerAccount.save({ session });
    console.log('✅ CustomerAccount created successfully:', savedCustomerAccount._id);

    // Link back to GroupSavings
    savedSavings.customerAccount = savedCustomerAccount._id;
    await savedSavings.save({ session });

    // ✅ SAFE AUDIT TRAILS
    try {
      await logAuditTrail(
        'GroupSavings',
        savedSavings._id.toString(),
        req.user?.id?.toString() || 'system',
        'CREATE',
        null,
        { 
          groupCode: safeGroupCode, 
          savingsType: safeSavingsType, 
          accountNumber,
          targetAmount: safeTargetAmount, 
          managedBy: finalManagedBy,
          customerAccountId: savedCustomerAccount._id,
          savingsProductId: savingsProduct ? savingsProduct.PROD_ID : 'N/A'
        },
        req.ip,
        'GROUP_SAVINGS_CREATED'
      );

      await AuditTrail.create([{
        event_id: Date.now(),
        user_id: req.user?.id?.toString() || 'system',
        event_type: 'CUSTOMER_ACCOUNT_CREATE',
        action: 'Create Group Savings Account',
        old_value: null,
        new_value: savedCustomerAccount.toObject(),
        ip_address: req.ip,
        timestamp: new Date(),
        entity_type: 'CustomerAccount',
        entity_id: savedCustomerAccount._id,
        status: 'SUCCESS',
        account_no: accountNumber,
        description: `Created group savings account for ${safeToString(group.groupName)} - ${safeSavingsType}`,
      }], { session });
    } catch (auditError) {
      console.warn('⚠️ Audit trail creation failed (non-critical):', auditError);
      // Continue with transaction - audit failures shouldn't block savings creation
    }

    // ✅ COMMIT TRANSACTION
    await session.commitTransaction();
    console.log('✅ Transaction committed successfully');

    logger.info(`Group savings created successfully: ${savedSavings._id} with account number: ${accountNumber}`);
    
    res.status(201).json({
      success: true,
      message: 'Group savings account created successfully with linked CustomerAccount and SavingsProduct.',
      data: {
        groupSavings: savedSavings,
        customerAccount: {
          _id: savedCustomerAccount._id,
          account_number: savedCustomerAccount.account_number,
          ACCT_NM: savedCustomerAccount.ACCT_NM
        },
        savingsProduct: savingsProduct ? {
          PROD_ID: savingsProduct.PROD_ID,
          productCode: savingsProduct.productCode,
          productName: savingsProduct.productName
        } : null
      },
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Error creating group savings:', error);
    logger.error('Error creating group savings:', error);
    
    let errorMessage = 'Server error creating group savings.';
    if (error.name === 'ValidationError') {
      errorMessage = `Validation error: ${Object.values(error.errors).map(e => e.message).join(', ')}`;
    } else if (error.name === 'CastError') {
      errorMessage = `Data type error for field ${error.path}: ${error.value} is not a valid ${error.kind}`;
    } else if (error.code === 11000) {
      errorMessage = 'Duplicate entry found. Account number or product code already exists.';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  } finally {
    session.endSession();
  }
};

// ✅ UPDATED SYNC BALANCE FUNCTION WITH SAFE HANDLING
export const syncGroupSavingsBalance = async (groupSavingsId, session = null) => {
  try {
    console.log('🔄 Syncing group savings balance for:', groupSavingsId);
    
    const groupSavings = await GroupSavings.findById(groupSavingsId).session(session);
    if (!groupSavings) {
      throw new Error('Group savings not found');
    }

    if (!groupSavings.customerAccount) {
      throw new Error('No linked customer account found');
    }

    const customerAccount = await CustomerAccount.findById(groupSavings.customerAccount).session(session);
    if (!customerAccount) {
      throw new Error('Linked customer account not found');
    }

    // ✅ SAFE BALANCE COMPARISON
    const groupLedgerBal = safeParseFloat(groupSavings.LEDGER_BAL);
    const customerLedgerBal = safeParseFloat(customerAccount.LEDGER_BAL);

    console.log('Balance comparison:', {
      groupLedgerBal,
      customerLedgerBal,
      difference: Math.abs(groupLedgerBal - customerLedgerBal)
    });

    if (Math.abs(groupLedgerBal - customerLedgerBal) > 0.01) {
      // Update CustomerAccount balances to match GroupSavings safely
      customerAccount.LEDGER_BAL = safeDecimal128(groupSavings.LEDGER_BAL);
      customerAccount.CLEARED_BAL = safeDecimal128(groupSavings.CLEARED_BAL);
      customerAccount.AVAILABLE_BALANCE = safeDecimal128(groupSavings.AVAILABLE_BALANCE);
      customerAccount.ledger_balance = groupLedgerBal;
      customerAccount.cleared_balance = safeParseFloat(groupSavings.CLEARED_BAL);
      customerAccount.lastActivityDate = new Date();

      await customerAccount.save({ session });
      
      logger.info(`Synced balances for group savings ${groupSavingsId} to customer account ${customerAccount.ACCT_NO}`);
      console.log('✅ Balances synced successfully');
    } else {
      console.log('✅ Balances already in sync');
    }

    return customerAccount;
  } catch (error) {
    console.error('❌ Error syncing group savings balance:', error);
    logger.error('Error syncing group savings balance:', error);
    throw error;
  }
};

// ✅ ADD CONTRIBUTION WITH SAFE BALANCE HANDLING
export const addContribution = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { groupSavingsId, amount, contributedBy, contributionDate, description } = req.body;

    console.log('=== PROCESSING GROUP SAVINGS CONTRIBUTION ===');
    console.log('Contribution details:', { groupSavingsId, amount, contributedBy });

    // ✅ SAFE VALIDATION
    const safeGroupSavingsId = safeToString(groupSavingsId);
    const safeAmount = safeParseFloat(amount, 0);
    const safeContributedBy = safeToString(contributedBy);
    const safeDescription = safeToString(description, 'Group savings contribution');

    if (!safeGroupSavingsId || !mongoose.Types.ObjectId.isValid(safeGroupSavingsId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Valid groupSavingsId is required.',
      });
    }

    if (safeAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Contribution amount must be greater than 0.',
      });
    }

    // ✅ GET GROUP SAVINGS WITH SAFE HANDLING
    const groupSavings = await GroupSavings.findById(safeGroupSavingsId).session(session);
    if (!groupSavings) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }

    if (groupSavings.status !== 'active') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Cannot contribute to inactive or closed group savings account.',
      });
    }

    // ✅ SAFE BALANCE UPDATE
    const currentBalance = safeParseFloat(groupSavings.AVAILABLE_BALANCE);
    const newBalance = currentBalance + safeAmount;

    // Update GroupSavings balances safely
    groupSavings.AVAILABLE_BALANCE = safeDecimal128(newBalance);
    groupSavings.LEDGER_BAL = safeDecimal128(newBalance);
    groupSavings.CLEARED_BAL = safeDecimal128(newBalance);
    groupSavings.currentBalance = newBalance;

    await groupSavings.save({ session });
    console.log('✅ GroupSavings balance updated');

    // ✅ CREATE CONTRIBUTION RECORD
    const contribution = new GroupSavingsContribution({
      groupSavings: groupSavings._id,
      amount: safeDecimal128(safeAmount),
      contributedBy: safeContributedBy,
      contributionDate: contributionDate ? new Date(contributionDate) : new Date(),
      description: safeDescription,
      previousBalance: safeDecimal128(currentBalance),
      newBalance: safeDecimal128(newBalance),
      status: 'completed'
    });

    await contribution.save({ session });
    console.log('✅ Contribution record created');

    // ✅ SYNC TO CUSTOMER ACCOUNT
    await syncGroupSavingsBalance(groupSavings._id, session);

    // ✅ CREATE TRANSACTION RECORD
    try {
      await createGroupSavingsTransaction({
        groupSavingsId: groupSavings._id,
        amount: safeAmount,
        type: 'CONTRIBUTION',
        description: safeDescription,
        contributedBy: safeContributedBy,
        session
      });
      console.log('✅ Transaction record created');
    } catch (transactionError) {
      console.warn('⚠️ Transaction creation failed (non-critical):', transactionError);
      // Continue - transaction failure shouldn't block contribution
    }

    // ✅ AUDIT TRAIL
    try {
      await logAuditTrail(
        'GroupSavings',
        groupSavings._id.toString(),
        req.user?.id?.toString() || 'system',
        'CONTRIBUTION',
        { previousBalance: currentBalance },
        { 
          newBalance,
          amount: safeAmount,
          contributedBy: safeContributedBy,
          contributionId: contribution._id
        },
        req.ip,
        'GROUP_SAVINGS_CONTRIBUTION'
      );
    } catch (auditError) {
      console.warn('⚠️ Audit trail creation failed (non-critical):', auditError);
    }

    // ✅ COMMIT TRANSACTION
    await session.commitTransaction();
    console.log('✅ Contribution transaction committed');

    res.status(201).json({
      success: true,
      message: 'Contribution added successfully.',
      data: {
        contribution: {
          _id: contribution._id,
          amount: safeAmount,
          previousBalance: currentBalance,
          newBalance: newBalance,
          contributedBy: safeContributedBy,
          contributionDate: contribution.contributionDate
        },
        groupSavings: {
          _id: groupSavings._id,
          accountNumber: groupSavings.accountNumber,
          currentBalance: newBalance
        }
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Error adding contribution:', error);
    logger.error('Error adding contribution:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to add contribution.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  } finally {
    session.endSession();
  }
});

// ✅ GET GROUP SAVINGS BALANCE WITH SAFE HANDLING
export const getGroupSavingsBalance = asyncHandler(async (req, res) => {
  try {
    const { groupSavingsId } = req.params;

    if (!groupSavingsId || !mongoose.Types.ObjectId.isValid(groupSavingsId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid groupSavingsId is required.',
      });
    }

    const groupSavings = await GroupSavings.findById(groupSavingsId);
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }

    // ✅ SAFE BALANCE EXTRACTION
    const balances = {
      ledgerBalance: safeParseFloat(groupSavings.LEDGER_BAL),
      clearedBalance: safeParseFloat(groupSavings.CLEARED_BAL),
      availableBalance: safeParseFloat(groupSavings.AVAILABLE_BALANCE),
      currentBalance: safeParseFloat(groupSavings.currentBalance),
      targetAmount: safeParseFloat(groupSavings.targetAmount),
      progressToTarget: groupSavings.progressToTarget,
      isTargetAchieved: groupSavings.isTargetAchieved
    };

    res.status(200).json({
      success: true,
      message: 'Group savings balance retrieved successfully.',
      data: {
        groupSavings: {
          _id: groupSavings._id,
          groupCode: groupSavings.groupCode,
          groupName: groupSavings.groupName,
          accountNumber: groupSavings.accountNumber,
          savingsType: groupSavings.savingsType,
          status: groupSavings.status
        },
        balances
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving group savings balance:', error);
    logger.error('Error retrieving group savings balance:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve group savings balance.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});
/**
 * Get combined account information
 */
export const getCombinedAccountInfo = async (accountNumber) => {
  try {
    // Try to find in CustomerAccount first
    let customerAccount = await CustomerAccount.findOne({ ACCT_NO: accountNumber });
    let groupSavings = null;

    if (customerAccount && customerAccount.isGroupAccount) {
      // If it's a group account, find the linked GroupSavings
      groupSavings = await GroupSavings.findOne({ customerAccount: customerAccount._id });
    } else {
      // If not found in CustomerAccount, try GroupSavings directly
      groupSavings = await GroupSavings.findOne({ accountNumber });
      if (groupSavings && groupSavings.customerAccount) {
        customerAccount = await CustomerAccount.findById(groupSavings.customerAccount);
      }
    }

    return {
      customerAccount,
      groupSavings,
      isGroupAccount: !!(customerAccount?.isGroupAccount || groupSavings)
    };
  } catch (error) {
    logger.error('Error getting combined account info:', error);
    throw error;
  }
};


// controllers/GroupSavingsController.js - CORRECTED VERSION
export const addBulkContributionsWithIndividualTransactions = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { accountNumber, contributions, period, notes } = req.body;

    console.log('Bulk contributions request:', { accountNumber, contributionsCount: contributions?.length });

    if (!accountNumber || !contributions || !Array.isArray(contributions) || contributions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Group savings account number and contributions array are required.',
      });
    }

    // Validate each contribution
    for (const contribution of contributions) {
      if (!contribution.memberCustId || !contribution.amount || contribution.amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Each contribution must have memberCustId and valid amount.',
        });
      }
    }

    // Start transaction
    session.startTransaction();

    // Find group savings by account number
    const groupSavings = await GroupSavings.findOne({ accountNumber }).session(session);
    if (!groupSavings) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }

    // Validate group exists
    const group = await Group.findById(groupSavings.group).session(session);
    if (!group) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Group not found for this savings account.',
      });
    }

    // Get current user info
    const currentUser = req.user;

    // Store old balances for audit
    const oldLedgerBal = parseFloat(groupSavings.LEDGER_BAL?.toString() || '0');
    const oldClearedBal = parseFloat(groupSavings.CLEARED_BAL?.toString() || '0');
    const oldAvailableBalance = parseFloat(groupSavings.AVAILABLE_BALANCE?.toString() || '0');
    const oldCurrentBalance = groupSavings.currentBalance || 0;

    let totalAmount = 0;
    const contributionResults = [];
    const failedContributions = [];
    const transactions = [];

    // Process each contribution
    for (const contrib of contributions) {
      try {
        const { memberCustId, amount, contributionType, individualNotes } = contrib;

        // Validate member belongs to group
        if (!group.members.includes(memberCustId)) {
          failedContributions.push({ memberCustId, amount, error: 'Member does not belong to this group' });
          continue;
        }

        // Check minimum contribution
        const minimumContribution = groupSavings.minimumContribution || 0;
        if (amount < minimumContribution && minimumContribution > 0) {
          failedContributions.push({
            memberCustId,
            amount,
            error: `Contribution amount must be at least ${minimumContribution}`
          });
          continue;
        }

        totalAmount += amount;

        // Create contribution record
        const contribution = new GroupSavingsContribution({
          groupSavings: groupSavings._id,
          memberCustId,
          amount,
          contributionType: contributionType || 'regular',
          period: period || new Date().toISOString().slice(0, 7),
          collectedBy: currentUser.custId || currentUser.id,
          notes: individualNotes || notes,
          reference: `GSC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          status: 'completed'
        });
        await contribution.save({ session });

        // Create individual transaction for each contribution - FIXED
        // Use the Transaction model directly instead of createGroupSavingsTransaction
        const transaction = new Transaction({
          // Required Transaction schema fields
          ACCT_NO: groupSavings.accountNumber,
          ACCT_ID: groupSavings._id.toString(),
          BU_ID: 106, // Your business unit ID for group savings
          CUST_ID: memberCustId,
          ACCT_NM: groupSavings.groupName,
          AMOUNT: amount,
          TRANSACTION_TYPE: 'CREDIT',
          createdBy: currentUser.id,
          
          // Additional fields
          description: `Cash contribution from member ${memberCustId} - ${contributionType || 'regular'}`,
          currency: 'NGN',
          status: 'COMPLETED',
          transaction_method: 'CASH',
          
          // Balance information
          balance_after: oldAvailableBalance + totalAmount,
          ledger_balance_after: oldLedgerBal + totalAmount,
          cleared_balance_after: oldClearedBal + totalAmount,
          
          // Group savings metadata
          transaction_category: 'GROUP_SAVINGS_CONTRIBUTION',
          member_cust_id: memberCustId,
          group_savings_id: groupSavings._id,
          contribution_id: contribution._id,
          
          // ❌ DO NOT include these - let Transaction model hooks generate them:
          // TRANSACTION_ID: ...,
          // EVENT_ID: ...,
          // TRAN_JOURNAL_ID: ...,
          // REFERENCE: ...,
        });

        await transaction.save({ session });

        contributionResults.push(contribution);
        transactions.push(transaction);
        
        console.log(`Created contribution and transaction for member ${memberCustId}`, {
          contributionId: contribution._id,
          transactionId: transaction.TRANSACTION_ID,
          reference: transaction.REFERENCE
        });

      } catch (error) {
        console.error(`Error processing contribution for member ${contrib.memberCustId}:`, error);
        failedContributions.push({
          memberCustId: contrib.memberCustId,
          amount: contrib.amount,
          error: error.message
        });
      }
    }

    // If all contributions failed, abort transaction
    if (contributionResults.length === 0 && failedContributions.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'All contributions failed.',
        data: { failedContributions }
      });
    }

    // Update group savings balances with total amount
    const newLedgerBal = oldLedgerBal + totalAmount;
    const newClearedBal = oldClearedBal + totalAmount;
    const newAvailableBalance = oldAvailableBalance + totalAmount;
    const newCurrentBalance = oldCurrentBalance + totalAmount;

    groupSavings.LEDGER_BAL = mongoose.Types.Decimal128.fromString(newLedgerBal.toFixed(2));
    groupSavings.CLEARED_BAL = mongoose.Types.Decimal128.fromString(newClearedBal.toFixed(2));
    groupSavings.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(newAvailableBalance.toFixed(2));
    groupSavings.currentBalance = newCurrentBalance;
    
    await groupSavings.save({ session });

    await session.commitTransaction();

    // Log audit trail
    await logAuditTrail(
      'GroupSavings',
      groupSavings._id.toString(),
      currentUser.id,
      'BULK_CASH_CONTRIBUTION_INDIVIDUAL_TXNS',
      { 
        oldLedgerBal: oldLedgerBal,
        oldClearedBal: oldClearedBal,
        oldAvailableBalance: oldAvailableBalance,
        oldCurrentBalance: oldCurrentBalance
      },
      { 
        newLedgerBal: newLedgerBal,
        newClearedBal: newClearedBal,
        newAvailableBalance: newAvailableBalance,
        newCurrentBalance: newCurrentBalance,
        totalAmount: totalAmount,
        successfulContributions: contributionResults.length,
        failedContributions: failedContributions.length,
        individualTransactions: transactions.length,
        accountNumber: groupSavings.accountNumber
      },
      req.ip,
      'GROUP_SAVINGS_BULK_CONTRIBUTION_INDIVIDUAL_TXNS'
    );

    logger.info(`Bulk contributions with individual transactions processed: ${contributionResults.length} successful, ${failedContributions.length} failed, Total: ${totalAmount}`);

    res.status(200).json({
      success: true,
      message: `Bulk contributions processed successfully with individual transactions. ${contributionResults.length} successful, ${failedContributions.length} failed.`,
      data: {
        summary: {
          totalAmount,
          successfulCount: contributionResults.length,
          failedCount: failedContributions.length,
          transactionCount: transactions.length,
          accountNumber: groupSavings.accountNumber,
          accountName: groupSavings.groupName
        },
        successfulContributions: contributionResults.map(contrib => ({
          _id: contrib._id,
          memberCustId: contrib.memberCustId,
          amount: contrib.amount,
          contributionType: contrib.contributionType,
          reference: contrib.reference,
          contributionDate: contrib.contributionDate
        })),
        transactions: transactions.map(txn => ({
          transactionId: txn.TRANSACTION_ID,
          reference: txn.REFERENCE,
          amount: txn.AMOUNT,
          memberCustId: txn.CUST_ID
        })),
        failedContributions,
        groupSavings: {
          accountNumber: groupSavings.accountNumber,
          accountName: groupSavings.groupName,
          oldBalances: {
            LEDGER_BAL: oldLedgerBal,
            CLEARED_BAL: oldClearedBal,
            AVAILABLE_BALANCE: oldAvailableBalance,
            currentBalance: oldCurrentBalance
          },
          newBalances: {
            LEDGER_BAL: newLedgerBal,
            CLEARED_BAL: newClearedBal,
            AVAILABLE_BALANCE: newAvailableBalance,
            currentBalance: newCurrentBalance
          }
        }
      },
    });

  } catch (error) {
    await session.abortTransaction();
    logger.error('Error in addBulkContributionsWithIndividualTransactions:', error);
    
    console.error('Detailed error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to process bulk contributions with individual transactions.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  } finally {
    session.endSession();
  }
};


// In controllers/GroupSavingsController.js - ADD THIS FUNCTION
export const getGroupContributions = async (req, res) => {
  try {
    const { accountNumber } = req.params;
    const { 
      period, 
      memberCustId, 
      page = 1, 
      limit = 10,
      startDate,
      endDate,
      contributionType 
    } = req.query;

    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Account number is required.',
      });
    }

    // Find group savings by account number
    const groupSavings = await GroupSavings.findOne({ accountNumber });
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }

    // Build query
    const query = { groupSavings: groupSavings._id };
    
    if (period) query.period = period;
    if (memberCustId) query.memberCustId = memberCustId;
    if (contributionType) query.contributionType = contributionType;
    
    // Date range filtering
    if (startDate || endDate) {
      query.contributionDate = {};
      if (startDate) query.contributionDate.$gte = new Date(startDate);
      if (endDate) query.contributionDate.$lte = new Date(endDate);
    }

    // Parse pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get contributions with pagination and population
    const contributions = await GroupSavingsContribution.find(query)
      .populate('collectedBy', 'firstName lastName email') // Populate collector info if available
      .sort({ contributionDate: -1 })
      .limit(limitNum)
      .skip(skip);

    // Get total count for pagination
    const totalCount = await GroupSavingsContribution.countDocuments(query);

    // Calculate summary statistics
    const summaryStats = await GroupSavingsContribution.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          averageAmount: { $avg: '$amount' },
          contributionCount: { $sum: 1 },
          uniqueMembers: { $addToSet: '$memberCustId' }
        }
      },
      {
        $project: {
          totalAmount: 1,
          averageAmount: 1,
          contributionCount: 1,
          uniqueMemberCount: { $size: '$uniqueMembers' }
        }
      }
    ]);

    // Get member details for the contributions
    const memberCustIds = [...new Set(contributions.map(contrib => contrib.memberCustId))];
    const memberDetails = await Customer.find(
      { CUST_ID: { $in: memberCustIds } },
      'CUST_ID FIRST_NAME LAST_NAME'
    );

    // Create a map for quick member lookup
    const memberMap = {};
    memberDetails.forEach(member => {
      memberMap[member.CUST_ID] = {
        firstName: member.FIRST_NAME,
        lastName: member.LAST_NAME
      };
    });

    // Enhance contributions with member names
    const enhancedContributions = contributions.map(contrib => ({
      ...contrib.toObject(),
      memberName: memberMap[contrib.memberCustId] 
        ? `${memberMap[contrib.memberCustId].firstName} ${memberMap[contrib.memberCustId].lastName}`
        : 'Unknown Member'
    }));

    res.status(200).json({
      success: true,
      message: 'Contributions retrieved successfully.',
      data: {
        contributions: enhancedContributions,
        summary: summaryStats[0] || {
          totalAmount: 0,
          averageAmount: 0,
          contributionCount: 0,
          uniqueMemberCount: 0
        },
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalCount,
          hasNext: pageNum * limitNum < totalCount,
          hasPrev: pageNum > 1
        },
        accountInfo: {
          accountNumber: groupSavings.accountNumber,
          accountName: groupSavings.groupName,
          savingsType: groupSavings.savingsType,
          currentBalance: groupSavings.currentBalance
        }
      },
    });

  } catch (error) {
    logger.error('Error fetching group contributions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch group contributions.',
      error: error.message,
    });
  }
};

// Request withdrawal from group savings - Updated with correct balance fields
export const requestWithdrawal = async (req, res) => {
  try {
    const { accountNumber } = req.params; // Changed to accountNumber
    const {
      amount,
      purpose
    } = req.body;

    if (!amount || amount <= 0 || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount and purpose are required.',
      });
    }

    // Find group savings by account number
    const groupSavings = await GroupSavings.findOne({ accountNumber });
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }

    // Check if user is authorized to request withdrawal
    if (!groupSavings.managedBy.includes(req.user.custId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to request withdrawals from this savings account.',
      });
    }

    // Check balance using AVAILABLE_BALANCE
    const availableBalance = parseFloat(groupSavings.AVAILABLE_BALANCE.toString());
    if (amount > availableBalance) {
      return res.status(400).json({
        success: false,
        message: `Insufficient funds in group savings. Available balance: ${availableBalance}`,
      });
    }

    // Check withdrawal rules
    if (groupSavings.withdrawalRules.minWithdrawal > 0 && amount < groupSavings.withdrawalRules.minWithdrawal) {
      return res.status(400).json({
        success: false,
        message: `Withdrawal amount must be at least ${groupSavings.withdrawalRules.minWithdrawal}.`,
      });
    }

    if (groupSavings.withdrawalRules.maxWithdrawal > 0 && amount > groupSavings.withdrawalRules.maxWithdrawal) {
      return res.status(400).json({
        success: false,
        message: `Withdrawal amount cannot exceed ${groupSavings.withdrawalRules.maxWithdrawal}.`,
      });
    }

    const withdrawalRequest = new GroupSavingsWithdrawal({
      groupSavings: groupSavings._id,
      requestedBy: req.user.custId,
      amount,
      purpose,
      requiredApprovals: groupSavings.withdrawalRules.minApprovers,
      approvers: groupSavings.managedBy.map(managerCustId => ({
        approverCustId: managerCustId,
        status: 'pending'
      }))
    });

    await withdrawalRequest.save();

    // Log audit trail with account number
    await logAuditTrail(
      'GroupSavings',
      groupSavings._id.toString(),
      req.user.id,
      'WITHDRAWAL_REQUEST',
      null,
      { 
        amount, 
        purpose, 
        withdrawalRequestId: withdrawalRequest._id,
        accountNumber: groupSavings.accountNumber,
        availableBalance: availableBalance
      },
      req.ip,
      'GROUP_SAVINGS_WITHDRAWAL_REQUEST'
    );

    logger.info(`Withdrawal requested: ${withdrawalRequest._id}, Account: ${groupSavings.accountNumber}, Amount: ${amount}`);

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully. Waiting for approvals.',
      data: {
        ...withdrawalRequest.toObject(),
        accountNumber: groupSavings.accountNumber
      },
    });
  } catch (error) {
    logger.error('Error requesting withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Server error requesting withdrawal.',
      error: error.message,
    });
  }
};

// Approve/reject withdrawal request
export const processWithdrawalApproval = async (req, res) => {
  try {
    const { withdrawalRequestId } = req.params;
    const { action, comments } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Valid action (approve/reject) is required.',
      });
    }

    const withdrawalRequest = await GroupSavingsWithdrawal.findById(withdrawalRequestId)
      .populate('groupSavings');
    
    if (!withdrawalRequest) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal request not found.',
      });
    }

    // Check if user is authorized to approve
    const userApprover = withdrawalRequest.approvers.find(
      approver => approver.approverCustId === req.user.custId
    );

    if (!userApprover) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to approve this withdrawal request.',
      });
    }

    // Check if already processed
    if (withdrawalRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Withdrawal request is already ${withdrawalRequest.status}.`,
      });
    }

    // Update approver status
    userApprover.status = action === 'approve' ? 'approved' : 'rejected';
    userApprover.comments = comments;
    userApprover.approvedAt = new Date();

    if (action === 'approve') {
      withdrawalRequest.currentApprovals += 1;
    }

    // Check if request is fully approved
    if (withdrawalRequest.currentApprovals >= withdrawalRequest.requiredApprovals) {
      withdrawalRequest.status = 'approved';
      withdrawalRequest.approvedAt = new Date();
    } else if (action === 'reject') {
      withdrawalRequest.status = 'rejected';
      withdrawalRequest.rejectionReason = comments;
    }

    await withdrawalRequest.save();

    // Log audit trail with account number
    await logAuditTrail(
      'GroupSavings',
      withdrawalRequest.groupSavings._id.toString(),
      req.user.id,
      `WITHDRAWAL_${action.toUpperCase()}`,
      null,
      { 
        withdrawalRequestId, 
        action, 
        comments,
        accountNumber: withdrawalRequest.groupSavings.accountNumber,
        currentApprovals: withdrawalRequest.currentApprovals,
        requiredApprovals: withdrawalRequest.requiredApprovals
      },
      req.ip,
      'GROUP_SAVINGS_WITHDRAWAL_APPROVAL'
    );

    logger.info(`Withdrawal request ${action}d: ${withdrawalRequestId} for account: ${withdrawalRequest.groupSavings.accountNumber}`);

    res.status(200).json({
      success: true,
      message: `Withdrawal request ${action}d successfully.`,
      data: {
        ...withdrawalRequest.toObject(),
        accountNumber: withdrawalRequest.groupSavings.accountNumber
      },
    });
  } catch (error) {
    logger.error('Error processing withdrawal approval:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing withdrawal approval.',
      error: error.message,
    });
  }
};

// Disburse approved withdrawal - Updated with correct balance fields
export const disburseWithdrawal = async (req, res) => {
  try {
    const { withdrawalRequestId } = req.params;

    const withdrawalRequest = await GroupSavingsWithdrawal.findById(withdrawalRequestId)
      .populate('groupSavings');
    
    if (!withdrawalRequest) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal request not found.',
      });
    }

    if (withdrawalRequest.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Only approved withdrawal requests can be disbursed.',
      });
    }

    const groupSavings = withdrawalRequest.groupSavings;

    // Check balance again using AVAILABLE_BALANCE
    const availableBalance = parseFloat(groupSavings.AVAILABLE_BALANCE.toString());
    if (withdrawalRequest.amount > availableBalance) {
      return res.status(400).json({
        success: false,
        message: `Insufficient funds in group savings. Available balance: ${availableBalance}`,
      });
    }

    // Start transaction for withdrawal disbursement
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Store old balances for audit
      const oldLedgerBal = groupSavings.LEDGER_BAL;
      const oldClearedBal = groupSavings.CLEARED_BAL;
      const oldAvailableBalance = groupSavings.AVAILABLE_BALANCE;
      const oldCurrentBalance = groupSavings.currentBalance;

      // Update all balance fields
      groupSavings.LEDGER_BAL = mongoose.Types.Decimal128.fromString(
        (parseFloat(oldLedgerBal.toString()) - withdrawalRequest.amount).toFixed(2)
      );
      groupSavings.CLEARED_BAL = mongoose.Types.Decimal128.fromString(
        (parseFloat(oldClearedBal.toString()) - withdrawalRequest.amount).toFixed(2)
      );
      groupSavings.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(
        (parseFloat(oldAvailableBalance.toString()) - withdrawalRequest.amount).toFixed(2)
      );
      groupSavings.currentBalance = parseFloat(groupSavings.AVAILABLE_BALANCE.toString());

      await groupSavings.save({ session });

      // Update withdrawal request
      withdrawalRequest.status = 'disbursed';
      withdrawalRequest.disbursedAt = new Date();
      withdrawalRequest.disbursedBy = req.user.id;
      withdrawalRequest.transactionReference = `GSW-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await withdrawalRequest.save({ session });

      // Create transaction record
      const transaction = new Transaction({
        account_no: groupSavings.accountNumber,
        account_name: groupSavings.groupName,
        transaction_type: 'DEBIT',
        amount: withdrawalRequest.amount,
        description: `Group savings withdrawal - ${withdrawalRequest.purpose}`,
        reference: withdrawalRequest.transactionReference,
        balance_after: parseFloat(groupSavings.AVAILABLE_BALANCE.toString()),
        ledger_balance_after: parseFloat(groupSavings.LEDGER_BAL.toString()),
        cleared_balance_after: parseFloat(groupSavings.CLEARED_BAL.toString()),
        created_by: req.user.id,
        transaction_method: 'TRANSFER',
        transaction_date: new Date(),
        currency: 'NGN',
        status: 'COMPLETED'
      });
      await transaction.save({ session });

      await session.commitTransaction();

      // Log audit trail
      await logAuditTrail(
        'GroupSavings',
        groupSavings._id.toString(),
        req.user.id,
        'WITHDRAWAL_DISBURSED',
        {
          oldLedgerBal: parseFloat(oldLedgerBal.toString()),
          oldClearedBal: parseFloat(oldClearedBal.toString()),
          oldAvailableBalance: parseFloat(oldAvailableBalance.toString()),
          oldCurrentBalance: oldCurrentBalance
        },
        { 
          newLedgerBal: parseFloat(groupSavings.LEDGER_BAL.toString()),
          newClearedBal: parseFloat(groupSavings.CLEARED_BAL.toString()),
          newAvailableBalance: parseFloat(groupSavings.AVAILABLE_BALANCE.toString()),
          newCurrentBalance: groupSavings.currentBalance,
          withdrawalAmount: withdrawalRequest.amount,
          accountNumber: groupSavings.accountNumber,
          transactionReference: withdrawalRequest.transactionReference
        },
        req.ip,
        'GROUP_SAVINGS_WITHDRAWAL_DISBURSED'
      );

      logger.info(`Withdrawal disbursed: ${withdrawalRequestId}, Account: ${groupSavings.accountNumber}, Amount: ${withdrawalRequest.amount}`);

      res.status(200).json({
        success: true,
        message: 'Withdrawal disbursed successfully.',
        data: {
          withdrawalRequest: {
            ...withdrawalRequest.toObject(),
            accountNumber: groupSavings.accountNumber
          },
          accountNumber: groupSavings.accountNumber,
          newBalances: {
            LEDGER_BAL: parseFloat(groupSavings.LEDGER_BAL.toString()),
            CLEARED_BAL: parseFloat(groupSavings.CLEARED_BAL.toString()),
            AVAILABLE_BALANCE: parseFloat(groupSavings.AVAILABLE_BALANCE.toString()),
            currentBalance: groupSavings.currentBalance
          },
          transaction: {
            reference: transaction.reference,
            transactionId: transaction._id
          }
        },
      });

    } catch (transactionError) {
      await session.abortTransaction();
      logger.error('Transaction failed during withdrawal disbursement:', transactionError);
      throw transactionError;
    } finally {
      session.endSession();
    }

  } catch (error) {
    logger.error('Error disbursing withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Server error disbursing withdrawal.',
      error: error.message,
    });
  }
};

// Get group savings details with contributions and withdrawals
export const getGroupSavingsById = async (req, res) => {
  try {
    const { groupSavingsId } = req.params;

    const groupSavings = await GroupSavings.findById(groupSavingsId)
      .populate('group', 'groupName members groupCode')
      .populate('createdBy', 'name email');

    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }

    // Get recent contributions
    const contributions = await GroupSavingsContribution.find({
      groupSavings: groupSavingsId
    })
      .sort({ contributionDate: -1 })
      .limit(10);

    // Get pending withdrawal requests
    const pendingWithdrawals = await GroupSavingsWithdrawal.find({
      groupSavings: groupSavingsId,
      status: 'pending'
    });

    // Get approved withdrawal requests
    const approvedWithdrawals = await GroupSavingsWithdrawal.find({
      groupSavings: groupSavingsId,
      status: 'approved'
    });

    // Get member details
    const memberDetails = await Customer.find(
      { CUST_ID: { $in: groupSavings.managedBy } },
      'CUST_ID FIRST_NAME LAST_NAME'
    );

    const responseData = {
      ...groupSavings.toObject(),
      recentContributions: contributions,
      pendingWithdrawals,
      approvedWithdrawals,
      managers: memberDetails
    };

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    logger.error('Error fetching group savings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching group savings.',
      error: error.message,
    });
  }
};

// Get group savings by account number
export const getGroupSavingsByAccountNumber = async (req, res) => {
  try {
    const { accountNumber } = req.params;

    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Account number is required.',
      });
    }

    const groupSavings = await GroupSavings.findOne({ accountNumber })
      .populate('group', 'groupName members groupCode')
      .populate('createdBy', 'name email');

    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }

    // Get recent contributions
    const contributions = await GroupSavingsContribution.find({
      groupSavings: groupSavings._id
    })
      .sort({ contributionDate: -1 })
      .limit(10);

    // Get pending withdrawal requests
    const pendingWithdrawals = await GroupSavingsWithdrawal.find({
      groupSavings: groupSavings._id,
      status: 'pending'
    });

    // Get member details
    const memberDetails = await Customer.find(
      { CUST_ID: { $in: groupSavings.managedBy } },
      'CUST_ID FIRST_NAME LAST_NAME'
    );

    const responseData = {
      ...groupSavings.toObject(),
      recentContributions: contributions,
      pendingWithdrawals,
      managers: memberDetails
    };

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    logger.error('Error fetching group savings by account number:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching group savings.',
      error: error.message,
    });
  }
};

// Get all group savings accounts for a group
export const getGroupSavingsByGroup = async (req, res) => {
  try {
    const { groupCode } = req.params;

    const groupSavings = await GroupSavings.find({ groupCode, isActive: true })
      .populate('group', 'groupName members')
      .sort({ createdAt: -1 });

    if (!groupSavings || groupSavings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active group savings accounts found for this group.',
      });
    }

    res.status(200).json({
      success: true,
      count: groupSavings.length,
      data: groupSavings,
    });
  } catch (error) {
    logger.error('Error fetching group savings by group:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching group savings.',
      error: error.message,
    });
  }
};

// Update group savings account
export const updateGroupSavings = async (req, res) => {
  try {
    const { groupSavingsId } = req.params;
    const {
      targetAmount,
      minimumContribution,
      contributionFrequency,
      managedBy,
      withdrawalRules,
      isActive
    } = req.body;

    const groupSavings = await GroupSavings.findById(groupSavingsId);
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }

    // Validate managers if provided
    if (managedBy && managedBy.length > 0) {
      const group = await Group.findById(groupSavings.group);
      const invalidManagers = managedBy.filter(custId => !group.members.includes(custId));
      if (invalidManagers.length > 0) {
        return res.status(400).json({
          success: false,
          message: `The following managers are not group members: ${invalidManagers.join(', ')}`,
        });
      }
    }

    // Store old values for audit
    const oldValues = {
      targetAmount: groupSavings.targetAmount,
      minimumContribution: groupSavings.minimumContribution,
      contributionFrequency: groupSavings.contributionFrequency,
      managedBy: [...groupSavings.managedBy],
      withdrawalRules: { ...groupSavings.withdrawalRules },
      isActive: groupSavings.isActive
    };

    // Update fields
    if (targetAmount !== undefined) groupSavings.targetAmount = targetAmount;
    if (minimumContribution !== undefined) groupSavings.minimumContribution = minimumContribution;
    if (contributionFrequency !== undefined) groupSavings.contributionFrequency = contributionFrequency;
    if (managedBy !== undefined) groupSavings.managedBy = managedBy;
    if (withdrawalRules !== undefined) groupSavings.withdrawalRules = withdrawalRules;
    if (isActive !== undefined) groupSavings.isActive = isActive;

    groupSavings.updatedAt = new Date();

    const updatedSavings = await groupSavings.save();

    // Log audit trail with account number
    await logAuditTrail(
      'GroupSavings',
      groupSavingsId,
      req.user.id,
      'UPDATE',
      oldValues,
      {
        targetAmount: updatedSavings.targetAmount,
        minimumContribution: updatedSavings.minimumContribution,
        contributionFrequency: updatedSavings.contributionFrequency,
        managedBy: updatedSavings.managedBy,
        withdrawalRules: updatedSavings.withdrawalRules,
        isActive: updatedSavings.isActive,
        accountNumber: updatedSavings.accountNumber
      },
      req.ip,
      'GROUP_SAVINGS_UPDATED'
    );

    logger.info(`Group savings updated successfully: ${groupSavingsId}, Account: ${groupSavings.accountNumber}`);

    res.status(200).json({
      success: true,
      message: 'Group savings account updated successfully.',
      data: updatedSavings,
    });
  } catch (error) {
    logger.error('Error updating group savings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating group savings.',
      error: error.message,
    });
  }
};

// Get Group Savings by Group Code - Updated to Use GroupSavings Model for Group-Level Savings
export const getGroupSavingsByGroupCode = asyncHandler(async (req, res) => {
  const { groupCode } = req.params;
  try {
    if (!groupCode) {
      return res.status(400).json({
        success: false,
        message: 'Group code is required.',
      });
    }

    // Find GroupSavings by groupCode
    const groupSavings = await GroupSavings.findOne({ groupCode })
      .populate('createdBy', 'name email');

    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }

    // Manually find the associated group by groupCode for robustness
    const group = await Group.findOne({ groupCode }).select('groupName groupCode memberCount members');
    if (!group) {
      logger.error(`Group not found for groupCode ${groupCode}`);
      return res.status(404).json({
        success: false,
        message: 'Associated group not found for this savings account.',
      });
    }

    // Aggregate member savings if needed (optional - add if individual savings required)
    const memberSavings = await CustomerAccount.find({
      CUST_ID: { $in: group.members },
      ACCOUNT_TYPE: 'SAVINGS',
      REC_ST: 'ACTIVE',
    }).populate('productCode', 'PROD_DESC');

    const groupSavingsSummary = {
      groupSavings: {
        ...groupSavings.toObject(),
        group: {
          _id: group._id,
          groupName: group.groupName,
          groupCode: group.groupCode,
          memberCount: group.memberCount || group.members.length,
          members: group.members.length,
        },
      },
      individualMemberSavings: {
        totalAccounts: memberSavings.length,
        totalBalance: 0,
        totalAccruedInterest: 0,
        averageBalance: 0,
        accounts: memberSavings.map(account => ({
          ACCT_NO: account.ACCT_NO,
          CUST_ID: account.CUST_ID,
          ACCT_NM: account.ACCT_NM,
          PRODUCT_DESC: account.PRODUCT_DESC,
          LEDGER_BALANCE: account.LEDGER_BALANCE,
          ACCRUED_INTEREST: account.ACCRUED_INTEREST,
          LAST_INTEREST_DATE: account.LAST_INTEREST_DATE,
          REC_ST: account.REC_ST,
        })),
      },
    };

    // Calculate totals for individual savings
    groupSavingsSummary.individualMemberSavings.totalBalance = memberSavings.reduce((sum, account) => sum + (account.LEDGER_BALANCE || 0), 0);
    groupSavingsSummary.individualMemberSavings.totalAccruedInterest = memberSavings.reduce((sum, account) => sum + (account.ACCRUED_INTEREST || 0), 0);
    groupSavingsSummary.individualMemberSavings.averageBalance = (group.memberCount || group.members.length) > 0 ? groupSavingsSummary.individualMemberSavings.totalBalance / (group.memberCount || group.members.length) : 0;

    logger.info(`Group savings fetched for group ${groupCode}: Group balance ${groupSavings.currentBalance.toLocaleString()}, Individual accounts: ${memberSavings.length}, Total individual balance: ${groupSavingsSummary.individualMemberSavings.totalBalance.toLocaleString()}`);

    res.status(200).json({
      success: true,
      message: 'Group savings retrieved successfully.',
      data: groupSavingsSummary,
    });
  } catch (error) {
    logger.error('Error fetching group savings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching group savings.',
      error: error.message,
    });
  }
});


// FIXED: Add getGroupSavings function
export const getGroupSavings = asyncHandler(async (req, res) => {
  const { groupCode } = req.params;
  try {
    if (!groupCode) {
      return res.status(400).json({
        success: false,
        message: 'Group code is required.',
      });
    }

    const group = await Group.findOne({ groupCode });
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found.',
      });
    }

    // Find all savings accounts for group members
    const memberSavings = await CustomerAccount.find({
      CUST_ID: { $in: group.members },
      ACCOUNT_TYPE: 'SAVINGS',
      REC_ST: 'ACTIVE',
    }).populate('productCode', 'PROD_DESC');

    if (!memberSavings || memberSavings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active savings accounts found for group members.',
      });
    }

    // Aggregate group savings totals
    const groupSavingsSummary = {
      totalMembers: group.members.length,
      totalSavingsAccounts: memberSavings.length,
      totalBalance: 0,
      totalAccruedInterest: 0,
      averageBalance: 0,
      accounts: memberSavings.map(account => ({
        ACCT_NO: account.ACCT_NO,
        CUST_ID: account.CUST_ID,
        ACCT_NM: account.ACCT_NM,
        PRODUCT_DESC: account.PRODUCT_DESC,
        LEDGER_BALANCE: account.LEDGER_BALANCE,
        ACCRUED_INTEREST: account.ACCRUED_INTEREST,
        LAST_INTEREST_DATE: account.LAST_INTEREST_DATE,
        REC_ST: account.REC_ST,
      })),
    };

    // Calculate totals
    groupSavingsSummary.totalBalance = memberSavings.reduce((sum, account) => sum + (account.LEDGER_BALANCE || 0), 0);
    groupSavingsSummary.totalAccruedInterest = memberSavings.reduce((sum, account) => sum + (account.ACCRUED_INTEREST || 0), 0);
    groupSavingsSummary.averageBalance = groupSavingsSummary.totalMembers > 0 ? groupSavingsSummary.totalBalance / groupSavingsSummary.totalMembers : 0;

    logger.info(`Group savings fetched for group ${groupCode}: ${memberSavings.length} accounts, total balance: ${groupSavingsSummary.totalBalance.toLocaleString()}`);

    res.status(200).json({
      success: true,
      message: 'Group savings retrieved successfully.',
      data: {
        group: {
          groupCode,
          groupName: group.groupName,
          memberCount: group.members.length,
        },
        savingsSummary: groupSavingsSummary,
      },
    });
  } catch (error) {
    logger.error('Error fetching group savings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching group savings.',
      error: error.message,
   });
  }
});

// In controllers/GroupSavingsController.js
export const getAccountByNumber = asyncHandler(async (req, res) => {
  try {
    const { accountNumber } = req.params;

    const accountInfo = await getCombinedAccountInfo(accountNumber);

    if (!accountInfo.customerAccount && !accountInfo.groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Account not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Account retrieved successfully.',
      data: accountInfo,
    });
  } catch (error) {
    logger.error('Error retrieving account:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving account.',
      error: error.message,
    });
  }
});