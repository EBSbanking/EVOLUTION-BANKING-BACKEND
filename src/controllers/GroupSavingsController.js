import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import GroupSavings from '../models/GroupSavings.js';
import GroupSavingsContribution from '../models/GroupSavingsContribution.js';
import GroupSavingsWithdrawal from '../models/GroupSavingsWithdrawal.js';
import Group from '../models/Group.js';
import Customer from '../models/Customer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Transaction from '../models/Transaction.js';
import { generateAccountNumberForGroup } from '../utils/generateAccountNumber.js';
import logAuditTrail from '../Services/AuditService.js';
import { logger } from '../utils/logger.js';
import asyncHandler from 'express-async-handler';
import SavingsProduct from '../models/SavingsProduct.js';
import AuditTrail from '../models/AuditTrail.js';

// ✅ SAFE UTILITY FUNCTIONS (Updated for Sequelize)
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
    if (!value && value !== 0) return parseFloat(defaultValue);

    const numValue = safeParseFloat(value, parseFloat(defaultValue));
    return parseFloat(numValue.toFixed(2));
  } catch (error) {
    console.error('Error in safeDecimal128:', error);
    return parseFloat(defaultValue);
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

// ✅ AUDIT TRAIL HELPER (Updated for Sequelize)
const createDirectAuditTrail = async (data, transaction) => {
  try {
    const auditEntry = await AuditTrail.create({
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      user_id: data.user_id,
      action: data.action,
      old_value: data.old_value,
      new_value: data.new_value,
      ip_address: data.ip_address,
      event_type: data.event_type,
      account_no: data.account_no,
      branch: data.branch,
      description: data.description,
      isGroupAccount: data.isGroupAccount,
      groupCode: data.groupCode,
      savingsType: data.savingsType,
      timestamp: new Date()
    }, { transaction });
    
    console.log(`✅ Audit trail created for ${data.entity_type}: ${data.entity_id}`);
    return auditEntry;
  } catch (error) {
    console.error('❌ Error creating direct audit trail:', error);
    throw error;
  }
};

// ✅ CREATE GROUP SAVINGS - FIXED WITH CORRECT ACCOUNT GENERATION
export const createGroupSavings = async (req, res) => {
  const transaction = await sequelize.transaction();
  
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
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Required: groupCode, savingsType.',
      });
    }
    
    // Validate savings type
    const validSavingsTypes = ['union_purse', 'emergency_fund', 'project_fund', 'general_savings', 'project_savings'];
    if (!validSavingsTypes.includes(safeSavingsType)) {
      await transaction.rollback();
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
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Invalid contribution frequency. Must be one of: ${validFrequencies.join(', ')}`,
        });
      }
    }
    
    // ✅ VALIDATE GROUP EXISTS
    const group = await Group.findOne({ 
      where: { groupCode: safeGroupCode },
      transaction
    });
    
    if (!group) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Group not found.',
      });
    }
    
    // ✅ CHECK FOR EXISTING SAVINGS
    const existingSavings = await GroupSavings.findOne({
      where: {
        groupCode: safeGroupCode,
        savingsType: safeSavingsType,
        status: 'active'
      },
      transaction
    });

    if (existingSavings) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Group already has an active ${safeSavingsType} savings account.`,
      });
    }
    
    // ✅ GENERATE ACCOUNT NUMBER WITH SAFE HANDLING - FIXED: Use generateAccountNumberForGroup
    let accountNumber;
    try {
      let attempts = 0;
      while (attempts < 5) {
        // FIXED: Use the new group-specific function
        const accountResult = await generateAccountNumberForGroup(safeGroupCode);
        accountNumber = safeToString(accountResult?.ACCT_NO);

        if (!accountNumber) {
          attempts++;
          continue;
        }
        
        // Check uniqueness in both collections
        const existingGS = await GroupSavings.findOne({ 
          where: { accountNumber },
          transaction
        });
        
        const existingCA = await CustomerAccount.findOne({ 
          where: { ACCT_NO: accountNumber },
          transaction
        });

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
      await transaction.rollback();
      return res.status(500).json({
        success: false,
        message: 'Failed to generate unique account number for group savings.',
        error: accountError.message,
      });
    }
    
    // ✅ SAFE CREATEDBY HANDLING
    let createdById = req.user?.id || 'system';
    
    // ✅ CREATE GROUP SAVINGS ACCOUNT WITH SAFE BALANCES
    const groupSavingsData = {
      group_id: group.id,
      groupCode: safeGroupCode,
      groupName: group.groupName || 'Unknown Group',
      
      // Savings configuration
      savingsType: safeSavingsType,
      accountNumber: accountNumber,
      
      // Financial fields with safe defaults
      targetAmount: safeTargetAmount,
      minimumContribution: safeMinContribution,
      
      // Balance fields with safe initialization
      LEDGER_BAL: 0.00,
      CLEARED_BAL: 0.00,
      AVAILABLE_BALANCE: 0.00,
      currentBalance: 0,
      
      // Contribution settings
      contributionFrequency: normalizedFrequency,
      
      // Management
      managedBy: JSON.stringify(managedBy || []),
      members: JSON.stringify(group.members || []),
      
      // Withdrawal rules
      withdrawalRules: JSON.stringify(withdrawalRules || {}),
      
      // Status and audit
      status: 'active',
      isActive: true,
      created_by: createdById
    };
    
    const savedSavings = await GroupSavings.create(groupSavingsData, { transaction });
    console.log('✅ GroupSavings created successfully:', savedSavings.id);
    
    // ✅ SAFE CUSTOMER ACCOUNT CREATION
    const customerAccountData = {
      account_number: accountNumber,
      customer_id: group.id, // Using group id as customer_id for group accounts
      branch: 1,
      product: 'DEFAULT_SAVINGS',
      product_type: 'savings',
      primary_relationship_manager: 1,
      ACCT_NO: accountNumber,
      ACCT_ID: accountNumber.slice(-6),
      ACCT_NM: `${safeToString(group.groupName)} - ${safeSavingsType.replace('_', ' ').toUpperCase()}`,
      CUST_ID: group.id,
      BU_ID: '001',
      ACCOUNT_TYPE: 'SAVINGS',
      PRODUCT_DESC: `Group Savings - ${safeSavingsType.replace('_', ' ')}`,
      REC_ST: 'ACTIVE',
      LEDGER_BAL: 0.00,
      CLEARED_BAL: 0.00,
      AVAILABLE_BALANCE: 0.00,
      cleared_balance: 0,
      ledger_balance: 0,
      INTEREST_RATE: 0.00,
      INTEREST_GL_ACCT_NO: '1-01-001-001-001-1',
      ACCRUED_INTEREST: 0.00,
      DR_ALLOWED: true,
      CR_ALLOWED: true,
      lastActivityDate: new Date(),
      status: 'Active',
      substatus: 'Active',
      creation_date: new Date(),
      last_updated: new Date(),
      isGroupAccount: true,
      groupSavingsId: savedSavings.id,
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
    };
    
    const savedCustomerAccount = await CustomerAccount.create(customerAccountData, { transaction });
    console.log('✅ CustomerAccount created successfully:', savedCustomerAccount.id);
    
    // Link back to GroupSavings
    await savedSavings.update({ customerAccount: savedCustomerAccount.id }, { transaction });
    
    // ✅ SAFE AUDIT TRAILS
    try {
      // Create audit trail for GroupSavings
      await createDirectAuditTrail({
        entity_type: 'GroupSavings',
        entity_id: savedSavings.id.toString(),
        user_id: req.user?.id?.toString() || 'system',
        action: 'CREATE',
        old_value: null,
        new_value: {
          groupCode: safeGroupCode,
          savingsType: safeSavingsType,
          accountNumber: accountNumber,
          targetAmount: safeTargetAmount,
          managedBy: managedBy || [],
          customerAccountId: savedCustomerAccount.id.toString()
        },
        ip_address: req.ip || '127.0.0.1',
        event_type: 'GROUP_SAVINGS_CREATED',
        account_no: accountNumber,
        branch: 1,
        description: `Created group savings account for ${safeToString(group.groupName)} - ${safeSavingsType}`,
      }, transaction);
      
      // Create audit trail for CustomerAccount
      await createDirectAuditTrail({
        entity_type: 'CustomerAccount',
        entity_id: savedCustomerAccount.id.toString(),
        user_id: req.user?.id?.toString() || 'system',
        action: 'CREATE',
        old_value: null,
        new_value: customerAccountData,
        ip_address: req.ip || '127.0.0.1',
        event_type: 'CUSTOMER_ACCOUNT_CREATED',
        account_no: accountNumber,
        branch: 1,
        description: `Created customer account for group savings: ${safeToString(group.groupName)}`,
        isGroupAccount: true,
        groupCode: safeGroupCode,
        savingsType: safeSavingsType
      }, transaction);
      
      console.log('✅ All audit trails created successfully');
    } catch (auditError) {
      console.warn('⚠️ Audit trail creation failed (non-critical):', auditError.message);
      // Continue with transaction - audit failures shouldn't block savings creation
    }
    
    // ✅ COMMIT TRANSACTION
    await transaction.commit();
    console.log('✅ Transaction committed successfully');
    logger.info(`Group savings created successfully: ${savedSavings.id} with account number: ${accountNumber}`);

    res.status(201).json({
      success: true,
      message: 'Group savings account created successfully with linked CustomerAccount.',
      data: {
        groupSavings: savedSavings,
        customerAccount: {
          id: savedCustomerAccount.id,
          account_number: savedCustomerAccount.account_number,
          ACCT_NM: savedCustomerAccount.ACCT_NM
        }
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error creating group savings:', error);
    logger.error('Error creating group savings:', error);

    let errorMessage = 'Server error creating group savings.';
    if (error.name === 'SequelizeValidationError') {
      errorMessage = `Validation error: ${error.errors.map(e => e.message).join(', ')}`;
    } else if (error.name === 'SequelizeUniqueConstraintError') {
      errorMessage = 'Duplicate entry found. Account number already exists.';
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// ✅ UPDATED SYNC BALANCE FUNCTION WITH SAFE HANDLING
export const syncGroupSavingsBalance = asyncHandler(async (req, res) => {
  try {
    const { groupSavingsId } = req.params;
    console.log('🔄 Syncing group savings balance for:', groupSavingsId);

    const groupSavings = await GroupSavings.findByPk(groupSavingsId);
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings not found'
      });
    }
    
    if (!groupSavings.customerAccount) {
      return res.status(404).json({
        success: false,
        message: 'No linked customer account found'
      });
    }
    
    const customerAccount = await CustomerAccount.findByPk(groupSavings.customerAccount);
    if (!customerAccount) {
      return res.status(404).json({
        success: false,
        message: 'Linked customer account not found'
      });
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
      await customerAccount.update({
        LEDGER_BAL: groupSavings.LEDGER_BAL,
        CLEARED_BAL: groupSavings.CLEARED_BAL,
        AVAILABLE_BALANCE: groupSavings.AVAILABLE_BALANCE,
        ledger_balance: groupLedgerBal,
        cleared_balance: safeParseFloat(groupSavings.CLEARED_BAL),
        lastActivityDate: new Date()
      });

      logger.info(`Synced balances for group savings ${groupSavingsId} to customer account ${customerAccount.ACCT_NO}`);
      console.log('✅ Balances synced successfully');
      
      res.status(200).json({
        success: true,
        message: 'Balances synced successfully',
        data: {
          groupSavingsId,
          customerAccountId: customerAccount.id,
          syncedBalances: {
            ledgerBalance: groupLedgerBal,
            clearedBalance: safeParseFloat(groupSavings.CLEARED_BAL),
            availableBalance: safeParseFloat(groupSavings.AVAILABLE_BALANCE)
          }
        }
      });
    } else {
      console.log('✅ Balances already in sync');
      res.status(200).json({
        success: true,
        message: 'Balances already in sync',
        data: {
          groupSavingsId,
          customerAccountId: customerAccount.id,
          currentBalances: {
            ledgerBalance: groupLedgerBal,
            clearedBalance: safeParseFloat(groupSavings.CLEARED_BAL),
            availableBalance: safeParseFloat(groupSavings.AVAILABLE_BALANCE)
          }
        }
      });
    }
  } catch (error) {
    console.error('❌ Error syncing group savings balance:', error);
    logger.error('Error syncing group savings balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync balances',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ✅ ADD CONTRIBUTION WITH SAFE BALANCE HANDLING
export const addContribution = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { groupSavingsId, amount, contributedBy, contributionDate, description } = req.body;
    console.log('=== PROCESSING GROUP SAVINGS CONTRIBUTION ===');
    console.log('Contribution details:', { groupSavingsId, amount, contributedBy });
    
    // ✅ SAFE VALIDATION
    const safeGroupSavingsId = safeToString(groupSavingsId);
    const safeAmount = safeParseFloat(amount, 0);
    const safeContributedBy = safeToString(contributedBy);
    const safeDescription = safeToString(description, 'Group savings contribution');
    
    if (safeAmount <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Contribution amount must be greater than 0.',
      });
    }
    
    // ✅ GET GROUP SAVINGS WITH SAFE HANDLING
    const groupSavings = await GroupSavings.findByPk(safeGroupSavingsId, { transaction });
    
    if (!groupSavings) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }
    
    if (groupSavings.status !== 'active') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot contribute to inactive or closed group savings account.',
      });
    }
    
    // ✅ SAFE BALANCE UPDATE
    const currentBalance = safeParseFloat(groupSavings.AVAILABLE_BALANCE);
    const newBalance = currentBalance + safeAmount;
    
    // Update GroupSavings balances safely
    await groupSavings.update({
      AVAILABLE_BALANCE: newBalance,
      LEDGER_BAL: newBalance,
      CLEARED_BAL: newBalance,
      currentBalance: newBalance
    }, { transaction });
    
    console.log('✅ GroupSavings balance updated');
    
    // ✅ CREATE CONTRIBUTION RECORD
    const contribution = await GroupSavingsContribution.create({
      groupSavings_id: groupSavings.id,
      amount: safeAmount,
      contributedBy: safeContributedBy,
      contributionDate: contributionDate ? new Date(contributionDate) : new Date(),
      description: safeDescription,
      previousBalance: currentBalance,
      newBalance: newBalance,
      status: 'completed'
    }, { transaction });
    
    console.log('✅ Contribution record created');
    
    // ✅ SYNC TO CUSTOMER ACCOUNT
    await syncGroupSavingsBalance(groupSavings.id, transaction);
    
    // ✅ COMMIT TRANSACTION
    await transaction.commit();
    console.log('✅ Contribution transaction committed');
    
    res.status(201).json({
      success: true,
      message: 'Contribution added successfully.',
      data: {
        contribution: {
          id: contribution.id,
          amount: safeAmount,
          previousBalance: currentBalance,
          newBalance: newBalance,
          contributedBy: safeContributedBy,
          contributionDate: contribution.contributionDate
        },
        groupSavings: {
          id: groupSavings.id,
          accountNumber: groupSavings.accountNumber,
          currentBalance: newBalance
        }
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error adding contribution:', error);
    logger.error('Error adding contribution:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to add contribution.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

// ✅ GET GROUP SAVINGS BALANCE
export const getGroupSavingsBalance = asyncHandler(async (req, res) => {
  try {
    const {
      groupSavingsId,
      accountNumber,
      groupCode,
      groupName,
      savingsType
    } = req.params;
    
    // Build query based on provided parameters
    let where = {};
    let include = [];

    if (groupSavingsId) {
      where.id = groupSavingsId;
    } else if (accountNumber) {
      where.accountNumber = safeToString(accountNumber);
    } else if (groupCode) {
      where.groupCode = safeToString(groupCode);
      
      // If savings type is provided, include it in query
      if (savingsType) {
        where.savingsType = safeToString(savingsType);
      }
    } else if (groupName) {
      where.groupName = { [Op.like]: `%${safeToString(groupName)}%` };
      
      // If savings type is provided, include it in query
      if (savingsType) {
        where.savingsType = safeToString(savingsType);
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide one of: groupSavingsId, accountNumber, groupCode, or groupName.',
      });
    }
    
    // Find the group savings account
    const groupSavings = await GroupSavings.findOne({
      where,
      include: include
    });
    
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
        searchedBy: where,
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
    
    // Get group details if needed
    let groupDetails = null;
    if (groupSavings.group_id) {
      try {
        groupDetails = await Group.findByPk(groupSavings.group_id, {
          attributes: ['id', 'groupName', 'groupCode', 'memberCount', 'members', 'createdAt']
        });
      } catch (groupError) {
        console.warn('Could not fetch group details:', groupError.message);
      }
    }
    
    // Get recent contributions summary
    const recentContributions = await GroupSavingsContribution.findAll({
      where: { groupSavings_id: groupSavings.id },
      order: [['contributionDate', 'DESC']],
      limit: 5,
      attributes: ['id', 'amount', 'contributedBy', 'contributionDate', 'description']
    });
    
    // Calculate total contributions
    const contributionsSummary = await GroupSavingsContribution.findOne({
      where: { groupSavings_id: groupSavings.id },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalContributions'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'contributionCount'],
        [sequelize.fn('MAX', sequelize.col('contributionDate')), 'lastContributionDate']
      ],
      raw: true
    });
    
    // Get withdrawal requests summary
    const pendingWithdrawals = await GroupSavingsWithdrawal.count({
      where: {
        groupSavings_id: groupSavings.id,
        status: 'pending'
      }
    });
    
    const responseData = {
      groupSavings: {
        id: groupSavings.id,
        groupCode: groupSavings.groupCode,
        groupName: groupSavings.groupName,
        accountNumber: groupSavings.accountNumber,
        savingsType: groupSavings.savingsType,
        status: groupSavings.status,
        isActive: groupSavings.isActive,
        createdAt: groupSavings.createdAt,
        updatedAt: groupSavings.updatedAt,
        contributionFrequency: groupSavings.contributionFrequency,
        managedBy: groupSavings.managedBy,
        withdrawalRules: groupSavings.withdrawalRules
      },
      balances,
      groupDetails,
      summary: {
        totalContributions: contributionsSummary?.totalContributions || 0,
        contributionCount: contributionsSummary?.contributionCount || 0,
        lastContributionDate: contributionsSummary?.lastContributionDate,
        pendingWithdrawals,
        recentContributions
      }
    };
    
    res.status(200).json({
      success: true,
      message: 'Group savings balance retrieved successfully.',
      data: responseData
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

// ✅ GET GROUP SAVINGS BY GROUP CODE
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
    const groupSavings = await GroupSavings.findOne({
      where: { groupCode }
    });
    
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }
    
    // Find the associated group by groupCode
    const group = await Group.findOne({
      where: { groupCode },
      attributes: ['id', 'groupName', 'groupCode', 'memberCount', 'members']
    });
    
    if (!group) {
      logger.error(`Group not found for groupCode ${groupCode}`);
      return res.status(404).json({
        success: false,
        message: 'Associated group not found for this savings account.',
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Group savings retrieved successfully.',
      data: {
        ...groupSavings.toJSON(),
        group: {
          id: group.id,
          groupName: group.groupName,
          groupCode: group.groupCode,
          memberCount: group.memberCount,
          members: group.members
        }
      }
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

// ✅ GET GROUP SAVINGS BY ACCOUNT NUMBER
export const getGroupSavingsByAccountNumber = asyncHandler(async (req, res) => {
  try {
    const { accountNumber } = req.params;
    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Account number is required.',
      });
    }
    
    const groupSavings = await GroupSavings.findOne({
      where: { accountNumber: safeToString(accountNumber) },
      include: [
        {
          model: Group,
          as: 'group',
          attributes: ['id', 'groupName', 'groupCode', 'members']
        }
      ]
    });
    
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }
    
    // Get recent contributions
    const recentContributions = await GroupSavingsContribution.findAll({
      where: { groupSavings_id: groupSavings.id },
      order: [['contributionDate', 'DESC']],
      limit: 10
    });
    
    // Get pending withdrawal requests
    const pendingWithdrawals = await GroupSavingsWithdrawal.findAll({
      where: {
        groupSavings_id: groupSavings.id,
        status: 'pending'
      }
    });
    
    const responseData = {
      ...groupSavings.toJSON(),
      recentContributions,
      pendingWithdrawals
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
});

// ✅ GET ALL GROUP SAVINGS FOR A GROUP
export const getGroupSavingsByGroup = asyncHandler(async (req, res) => {
  try {
    const { groupCode } = req.params;
    const groupSavings = await GroupSavings.findAll({
      where: { 
        groupCode,
        isActive: true 
      },
      include: [
        {
          model: Group,
          as: 'group',
          attributes: ['id', 'groupName', 'members']
        }
      ],
      order: [['createdAt', 'DESC']]
    });
    
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
});

// ✅ UPDATE GROUP SAVINGS ACCOUNT
export const updateGroupSavings = asyncHandler(async (req, res) => {
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
    
    const groupSavings = await GroupSavings.findByPk(groupSavingsId);
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }
    
    // Validate managers if provided
    if (managedBy && managedBy.length > 0) {
      const group = await Group.findByPk(groupSavings.group_id);
      if (group) {
        const groupMembers = JSON.parse(group.members || '[]');
        const invalidManagers = managedBy.filter(custId => !groupMembers.includes(custId));
        
        if (invalidManagers.length > 0) {
          return res.status(400).json({
            success: false,
            message: `The following managers are not group members: ${invalidManagers.join(', ')}`,
          });
        }
      }
    }
    
    // Store old values for audit
    const oldValues = {
      targetAmount: groupSavings.targetAmount,
      minimumContribution: groupSavings.minimumContribution,
      contributionFrequency: groupSavings.contributionFrequency,
      managedBy: groupSavings.managedBy,
      withdrawalRules: groupSavings.withdrawalRules,
      isActive: groupSavings.isActive
    };
    
    // Update fields
    const updateData = {};
    if (targetAmount !== undefined) updateData.targetAmount = targetAmount;
    if (minimumContribution !== undefined) updateData.minimumContribution = minimumContribution;
    if (contributionFrequency !== undefined) updateData.contributionFrequency = contributionFrequency;
    if (managedBy !== undefined) updateData.managedBy = JSON.stringify(managedBy);
    if (withdrawalRules !== undefined) updateData.withdrawalRules = JSON.stringify(withdrawalRules);
    if (isActive !== undefined) updateData.isActive = isActive;
    updateData.updatedAt = new Date();
    
    await groupSavings.update(updateData);
    
    logger.info(`Group savings updated successfully: ${groupSavingsId}, Account: ${groupSavings.accountNumber}`);
    
    res.status(200).json({
      success: true,
      message: 'Group savings account updated successfully.',
      data: groupSavings,
    });
  } catch (error) {
    logger.error('Error updating group savings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating group savings.',
      error: error.message,
    });
  }
});

// ✅ GET GROUP CONTRIBUTIONS
export const getGroupContributions = asyncHandler(async (req, res) => {
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
    const groupSavings = await GroupSavings.findOne({ where: { accountNumber } });
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }
    
    // Build query
    const where = { groupSavings_id: groupSavings.id };
    
    if (period) where.period = period;
    if (memberCustId) where.memberCustId = memberCustId;
    if (contributionType) where.contributionType = contributionType;
    
    // Date range filtering
    if (startDate || endDate) {
      where.contributionDate = {};
      if (startDate) where.contributionDate[Op.gte] = new Date(startDate);
      if (endDate) where.contributionDate[Op.lte] = new Date(endDate);
    }
    
    // Parse pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    // Get contributions with pagination
    const { count: totalCount, rows: contributions } = await GroupSavingsContribution.findAndCountAll({
      where,
      order: [['contributionDate', 'DESC']],
      limit: limitNum,
      offset
    });
    
    // Calculate summary statistics
    const summaryStats = await GroupSavingsContribution.findOne({
      where,
      attributes: [
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
        [sequelize.fn('AVG', sequelize.col('amount')), 'averageAmount'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'contributionCount'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('memberCustId'))), 'uniqueMemberCount']
      ],
      raw: true
    });
    
    res.status(200).json({
      success: true,
      message: 'Contributions retrieved successfully.',
      data: {
        contributions,
        summary: summaryStats || {
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
});

// ✅ GET ACCOUNT BY NUMBER (COMBINED INFO)
export const getAccountByNumber = asyncHandler(async (req, res) => {
  try {
    const { accountNumber } = req.params;
    
    // Try to find in CustomerAccount first
    let customerAccount = await CustomerAccount.findOne({ where: { ACCT_NO: accountNumber } });
    let groupSavings = null;
    
    if (customerAccount && customerAccount.isGroupAccount) {
      // If it's a group account, find the linked GroupSavings
      groupSavings = await GroupSavings.findOne({ where: { customerAccount: customerAccount.id } });
    } else {
      // If not found in CustomerAccount, try GroupSavings directly
      groupSavings = await GroupSavings.findOne({ where: { accountNumber } });
      if (groupSavings && groupSavings.customerAccount) {
        customerAccount = await CustomerAccount.findByPk(groupSavings.customerAccount);
      }
    }
    
    if (!customerAccount && !groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Account not found.',
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Account retrieved successfully.',
      data: {
        customerAccount,
        groupSavings,
        isGroupAccount: !!(customerAccount?.isGroupAccount || groupSavings)
      },
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


/**
 * Get Group Savings Balance by Account Number
 */
export const getGroupSavingsBalanceByAccountNumber = asyncHandler(async (req, res) => {
  try {
    const { accountNumber } = req.params;
    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Account number is required.',
      });
    }
    const groupSavings = await GroupSavings.findOne({
      accountNumber: safeToString(accountNumber)
    });
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }
    // Return balance (you can reuse the balance extraction logic from above)
    return sendGroupSavingsResponse(res, groupSavings);
  } catch (error) {
    console.error('❌ Error retrieving group savings by account number:', error);
    logger.error('Error retrieving group savings by account number:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve group savings.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

/**
 * Get Group Savings Balance by Group Code (and optionally savings type)
 */
export const getGroupSavingsBalanceByGroupCode = asyncHandler(async (req, res) => {
  try {
    const { groupCode, savingsType } = req.params;
    if (!groupCode) {
      return res.status(400).json({
        success: false,
        message: 'Group code is required.',
      });
    }
    let query = { groupCode: safeToString(groupCode) };

    // If savings type is provided, filter by it
    if (savingsType) {
      query.savingsType = safeToString(savingsType);
    }
    const groupSavings = await GroupSavings.findOne(query);
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: savingsType
          ? `No ${savingsType} savings account found for group ${groupCode}`
          : `No savings account found for group ${groupCode}`,
      });
    }
    // Return balance
    return sendGroupSavingsResponse(res, groupSavings);
  } catch (error) {
    console.error('❌ Error retrieving group savings by group code:', error);
    logger.error('Error retrieving group savings by group code:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve group savings.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

/**
 * Search Group Savings by Group Name (partial match)
 */
export const searchGroupSavingsByGroupName = asyncHandler(async (req, res) => {
  try {
    const { groupName } = req.params;
    const {
      savingsType,
      page = 1,
      limit = 10
    } = req.query;
    if (!groupName) {
      return res.status(400).json({
        success: false,
        message: 'Group name is required.',
      });
    }
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    let query = {
      groupName: { $regex: safeToString(groupName), $options: 'i' }
    };
    // Filter by savings type if provided
    if (savingsType) {
      query.savingsType = safeToString(savingsType);
    }
    // Get paginated results
    const groupSavings = await GroupSavings.find(query)
      .skip(skip)
      .limit(limitNum)
      .sort({ groupName: 1 });
    const totalCount = await GroupSavings.countDocuments(query);
    if (groupSavings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No group savings accounts found matching the search criteria.',
      });
    }
    // Get balances for each account
    const accountsWithBalances = groupSavings.map(account => ({
      _id: account._id,
      groupCode: account.groupCode,
      groupName: account.groupName,
      accountNumber: account.accountNumber,
      savingsType: account.savingsType,
      status: account.status,
      isActive: account.isActive,
      createdAt: account.createdAt,
      balances: {
        ledgerBalance: safeParseFloat(account.LEDGER_BAL),
        clearedBalance: safeParseFloat(account.CLEARED_BAL),
        availableBalance: safeParseFloat(account.AVAILABLE_BALANCE),
        currentBalance: safeParseFloat(account.currentBalance),
        targetAmount: safeParseFloat(account.targetAmount)
      }
    }));
    res.status(200).json({
      success: true,
      message: 'Group savings accounts retrieved successfully.',
      data: {
        accounts: accountsWithBalances,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalCount,
          hasNext: pageNum * limitNum < totalCount,
          hasPrev: pageNum > 1
        }
      }
    });
  } catch (error) {
    console.error('❌ Error searching group savings by name:', error);
    logger.error('Error searching group savings by name:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to search group savings.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

/**
 * Helper function to send standardized response
 */
const sendGroupSavingsResponse = async (res, groupSavings) => {
  const balances = {
    ledgerBalance: safeParseFloat(groupSavings.LEDGER_BAL),
    clearedBalance: safeParseFloat(groupSavings.CLEARED_BAL),
    availableBalance: safeParseFloat(groupSavings.AVAILABLE_BALANCE),
    currentBalance: safeParseFloat(groupSavings.currentBalance),
    targetAmount: safeParseFloat(groupSavings.targetAmount),
    progressToTarget: groupSavings.progressToTarget,
    isTargetAchieved: groupSavings.isTargetAchieved
  };
  // Get group details if available
  let groupDetails = null;
  if (groupSavings.group) {
    try {
      groupDetails = await Group.findById(groupSavings.group).select('groupName groupCode memberCount members');
    } catch (error) {
      console.warn('Could not fetch group details:', error.message);
    }
  }
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
        status: groupSavings.status,
        isActive: groupSavings.isActive,
        createdAt: groupSavings.createdAt,
        group: groupDetails
      },
      balances
    }
  });
};

/**
 * Universal search endpoint that accepts query parameters
 */
export const searchGroupSavings = asyncHandler(async (req, res) => {
  try {
    const {
      id,
      accountNumber,
      groupCode,
      groupName,
      savingsType,
      status = 'active'
    } = req.query;
    let query = { status: safeToString(status) };
    // Build query based on provided parameters
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      query._id = id;
    } else if (accountNumber) {
      query.accountNumber = safeToString(accountNumber);
    } else if (groupCode) {
      query.groupCode = safeToString(groupCode);
    } else if (groupName) {
      query.groupName = { $regex: safeToString(groupName), $options: 'i' };
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one search parameter: id, accountNumber, groupCode, or groupName.',
      });
    }
    // Add savings type filter if provided
    if (savingsType) {
      query.savingsType = safeToString(savingsType);
    }
    const groupSavings = await GroupSavings.findOne(query);
    if (!groupSavings) {
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }
    // Return the balance
    return sendGroupSavingsResponse(res, groupSavings);
  } catch (error) {
    console.error('❌ Error searching group savings:', error);
    logger.error('Error searching group savings:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to search group savings.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

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
export const addBulkContributionsWithIndividualTransactions = asyncHandler(async (req, res) => {
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
});


// Request withdrawal from group savings - Updated with correct balance fields
export const requestWithdrawal = asyncHandler(async (req, res) => {
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
});

// Approve/reject withdrawal request
export const processWithdrawalApproval = asyncHandler(async (req, res) => {
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
});

// Disburse approved withdrawal - Updated with correct balance fields
export const disburseWithdrawal = asyncHandler(async (req, res) => {
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
});

// Get group savings details with contributions and withdrawals
export const getGroupSavingsById = asyncHandler(async (req, res) => {
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

