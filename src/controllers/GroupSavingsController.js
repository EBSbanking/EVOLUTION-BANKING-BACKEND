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
// In GroupSavingsController.js - UPDATED VERSION
// In GroupSavingsController.js - FULLY UPDATED VERSION

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
    
    // ✅ GENERATE ACCOUNT NUMBER - SIMPLIFIED VERSION
    let accountNumber;
    let accountResult;

    try {
      // Use the simplified group account generator from utils/accountGenerator.js
      accountResult = await generateAccountNumberForGroup(safeGroupCode);
      
      if (accountResult && accountResult.ACCT_NO) {
        accountNumber = accountResult.ACCT_NO;
        console.log(`✅ Generated group account number: ${accountNumber}`);
        
        // Double-check uniqueness in both tables (just to be safe)
        const existingGS = await GroupSavings.findOne({ 
          where: { accountNumber },
          transaction
        });
        
        const existingCA = await CustomerAccount.findOne({ 
          where: { account_number: accountNumber },
          transaction
        });

        if (existingGS || existingCA) {
          console.log(`⚠️ Account number ${accountNumber} already exists, retrying...`);
          // Generate again
          const retryResult = await generateAccountNumberForGroup(safeGroupCode);
          if (retryResult && retryResult.ACCT_NO) {
            accountNumber = retryResult.ACCT_NO;
          } else {
            throw new Error('Failed to generate unique account number on retry');
          }
        }
      } else {
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
    
    // ✅ GET GROUP MEMBERS SAFELY AND ENSURE THEY'RE IN THE RIGHT FORMAT
    let groupMembers = [];
    try {
      if (group.members) {
        if (Array.isArray(group.members)) {
          groupMembers = group.members;
        } else if (typeof group.members === 'string') {
          try {
            const parsed = JSON.parse(group.members);
            groupMembers = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            // If parsing fails, extract numbers
            const numbers = group.members.match(/\d+/g);
            groupMembers = numbers || [];
          }
        }
      }
    } catch (e) {
      console.warn('Error parsing group members:', e);
      groupMembers = [];
    }

    // Clean and pad members
    groupMembers = groupMembers
      .filter(m => m && /^\d+$/.test(String(m)) && String(m) !== '0')
      .map(m => String(m).padStart(10, '0'))
      .filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates

    console.log('Cleaned group members:', groupMembers);
    
    // ✅ CLEAN MANAGEDBY ARRAY
    let cleanedManagedBy = [];
    if (managedBy && Array.isArray(managedBy)) {
      cleanedManagedBy = managedBy
        .filter(m => m && /^\d+$/.test(String(m)) && String(m) !== '0')
        .map(m => String(m).padStart(10, '0'))
        .filter((v, i, a) => a.indexOf(v) === i);
    }
    
    // ✅ CREATE GROUP SAVINGS ACCOUNT WITH SAFE BALANCES
    const groupSavingsData = {
      groupId: group.id,
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
      
      // Management - use cleaned arrays
      managedBy: cleanedManagedBy,
      members: groupMembers, // Use cleaned members array
      
      // Withdrawal rules
      withdrawalRules: withdrawalRules || {},
      
      // Status and audit
      status: 'active',
      isActive: true,
      createdById: createdById
    };
    
    console.log('GroupSavings data being created:', JSON.stringify(groupSavingsData, null, 2));
    
    const savedSavings = await GroupSavings.create(groupSavingsData, { transaction });
    console.log('✅ GroupSavings created successfully:', savedSavings.id);
    
    // ✅ SAFE CUSTOMER ACCOUNT CREATION - WITH CORRECT SNAKE_CASE FIELDS
    const customerAccountData = {
      // Core fields
      customer_id: group.id, // Using group id as customer_id for group accounts
      account_number: accountNumber,
      account_name: `${safeToString(group.groupName)} - ${safeSavingsType.replace('_', ' ').toUpperCase()}`,
      
      // Product fields
      product_type: 'SAVINGS',
      product_name: 'Group Savings',
      product_code: 'GROUP_SAVINGS',
      product_description: `Group Savings - ${safeSavingsType.replace('_', ' ')}`,
      
      // Account type and status
      account_type: 'SAVINGS',
      status: 'ACTIVE',
      
      // Branch and business unit
      branch_id: 1,
      branch_name: 'Main Branch',
      bu_id: '001',
      
      // Currency
      currency_code: 'NGN',
      
      // Balance fields - all set to zero
      opening_balance: 0.00,
      current_balance: 0.00,
      available_balance: 0.00,
      ledger_balance: 0.00,
      cleared_balance: 0.00,
      
      // Interest fields
      interest_rate: 0.00,
      accrued_interest: 0.00,
      
      // Permissions
      is_online_enabled: true,
      allow_debit: true,
      allow_credit: true,
      
      // Audit fields
      created_by: createdById.toString(),
      created_by_name: req.user?.name || 'System',
      approved_by: '1',
      approved_by_name: 'System',
      approved_at: new Date(),
      
      // Dates
      account_opened_date: new Date(),
      
      // ✅ GROUP-SPECIFIC FIELDS - using snake_case to match database schema
      is_group_account: true,
      group_savings_id: savedSavings.id
    };
    
    const savedCustomerAccount = await CustomerAccount.create(customerAccountData, { transaction });
    console.log('✅ CustomerAccount created successfully:', savedCustomerAccount.id);
    
    // Link back to GroupSavings - using the field name from your GroupSavings model
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
          managedBy: cleanedManagedBy,
          members: groupMembers,
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
        new_value: {
          customer_id: group.id,
          account_number: accountNumber,
          account_name: `${safeToString(group.groupName)} - ${safeSavingsType.replace('_', ' ').toUpperCase()}`,
          is_group_account: true,
          group_savings_id: savedSavings.id
        },
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
          account_name: savedCustomerAccount.account_name,
          is_group_account: savedCustomerAccount.is_group_account,
          group_savings_id: savedCustomerAccount.group_savings_id
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
    const { groupSavingsId, accountNumber, amount, contributedBy, contributionDate, description, memberCustId, contributionType, period, notes } = req.body;
    console.log('=== PROCESSING GROUP SAVINGS CONTRIBUTION ===');
    console.log('Contribution details:', { groupSavingsId, accountNumber, amount, contributedBy, memberCustId, contributionType, period });
    
    // ✅ SAFE VALIDATION
    const safeAmount = safeParseFloat(amount, 0);
    const safeContributedBy = safeToString(contributedBy || memberCustId); // Use memberCustId as fallback
    const safeDescription = safeToString(description || notes, 'Group savings contribution');
    const safeContributionType = safeToString(contributionType, 'regular');
    
    if (safeAmount <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Contribution amount must be greater than 0.',
      });
    }
    
    if (!safeContributedBy) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Member/Customer ID is required.',
      });
    }
    
    // ✅ FIND GROUP SAVINGS - either by ID or account number
    let groupSavings;
    
    if (groupSavingsId) {
      groupSavings = await GroupSavings.findByPk(safeToString(groupSavingsId), { transaction });
    } else if (accountNumber) {
      groupSavings = await GroupSavings.findOne({ 
        where: { accountNumber: safeToString(accountNumber) },
        transaction 
      });
    } else {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Either groupSavingsId or accountNumber is required.',
      });
    }
    
    if (!groupSavings) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }
    
    console.log('✅ Group savings found:', { 
      id: groupSavings.id, 
      accountNumber: groupSavings.accountNumber,
      groupCode: groupSavings.groupCode,
      currentBalance: groupSavings.currentBalance 
    });
    
    // Check if member is part of the group
    const memberId = safeContributedBy.padStart(10, '0');
    const groupMembers = groupSavings.members || [];
    
    if (!groupMembers.includes(memberId)) {
      console.warn(`Member ${memberId} is not in the group members list:`, groupMembers);
      // Optional: Uncomment if you want to enforce member validation
      // await transaction.rollback();
      // return res.status(400).json({
      //   success: false,
      //   message: 'This member is not part of the group and cannot contribute.',
      // });
    }
    
    if (groupSavings.status !== 'active') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot contribute to inactive or closed group savings account.',
      });
    }
    
    // Check minimum contribution
    const minContribution = safeParseFloat(groupSavings.minimumContribution, 0);
    if (minContribution > 0 && safeAmount < minContribution) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Contribution amount must be at least ${minContribution}.`,
      });
    }
    
    // ✅ SAFE BALANCE UPDATE
    const currentBalance = safeParseFloat(groupSavings.AVAILABLE_BALANCE);
    const newBalance = currentBalance + safeAmount;
    
    console.log('Balance update:', { currentBalance, safeAmount, newBalance });
    
    // Update GroupSavings balances safely
    await groupSavings.update({
      AVAILABLE_BALANCE: newBalance,
      LEDGER_BAL: newBalance,
      CLEARED_BAL: newBalance,
      currentBalance: newBalance
    }, { transaction });
    
    console.log('✅ GroupSavings balance updated');
    
    // Get the correct field name for groupSavings_id
    const modelAttributes = GroupSavingsContribution.getAttributes();
    console.log('Model attributes:', Object.keys(modelAttributes));
    
    let groupSavingsIdField = 'groupSavings_id';
    
    // Check for the correct field name
    const possibleFields = ['groupSavingsId', 'groupSavings_id', 'groupId', 'group_id', 'savingsId'];
    for (const field of possibleFields) {
      if (modelAttributes[field]) {
        groupSavingsIdField = field;
        console.log(`Using field: ${field} for group savings ID`);
        break;
      }
    }
    
    // Format period correctly - model likely expects YYYY-MM format
    let formattedPeriod = period;
    if (period) {
      // If period includes day, extract just year-month
      if (period.includes('-') && period.split('-').length === 3) {
        formattedPeriod = period.substring(0, 7); // Get YYYY-MM from YYYY-MM-DD
        console.log(`Formatted period from ${period} to ${formattedPeriod}`);
      }
    } else {
      // Default to current year-month
      const now = new Date();
      formattedPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    
    // ✅ CREATE CONTRIBUTION RECORD
    const contributionData = {
      [groupSavingsIdField]: groupSavings.id,
      amount: safeAmount,
      contributionDate: contributionDate ? new Date(contributionDate) : new Date(),
      status: 'completed'
    };
    
    // Add optional fields if they exist in the model
    if (modelAttributes.memberCustId) {
      contributionData.memberCustId = memberId;
    }
    
    if (modelAttributes.member_cust_id) {
      contributionData.member_cust_id = memberId;
    }
    
    if (modelAttributes.contributedBy) {
      contributionData.contributedBy = memberId;
    }
    
    if (modelAttributes.contributionType) {
      contributionData.contributionType = safeContributionType;
    }
    
    // Handle period field with correct format
    if (modelAttributes.period) {
      contributionData.period = formattedPeriod;
    }
    
    if (modelAttributes.notes) {
      contributionData.notes = safeDescription;
    }
    
    if (modelAttributes.description) {
      contributionData.description = safeDescription;
    }
    
    if (modelAttributes.reference) {
      contributionData.reference = `GSC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    if (modelAttributes.collectedBy) {
      contributionData.collectedBy = req.user?.id || 'system';
    }
    
    console.log('Creating contribution with data:', contributionData);
    
    const contribution = await GroupSavingsContribution.create(contributionData, { transaction });
    
    console.log('✅ Contribution record created with ID:', contribution.id);
    
    // ✅ SYNC TO CUSTOMER ACCOUNT (if the function exists)
    if (typeof syncGroupSavingsBalance === 'function') {
      try {
        await syncGroupSavingsBalance(groupSavings.id, transaction);
        console.log('✅ Synced with customer account');
      } catch (syncError) {
        console.warn('⚠️ Failed to sync with customer account:', syncError.message);
        // Continue - don't fail the transaction if sync fails
      }
    }
    
    // ✅ CREATE TRANSACTION RECORD (if Transaction model exists)
    try {
      // Check if Transaction model exists in sequelize
      const Transaction = sequelize.models && sequelize.models.Transaction;
      if (Transaction) {
        const transactionRecord = await Transaction.create({
          account_number: groupSavings.accountNumber,
          account_name: groupSavings.groupName,
          transaction_type: 'CREDIT',
          amount: safeAmount,
          description: safeDescription,
          reference: contributionData.reference || `GSC-${Date.now()}`,
          balance_after: newBalance,
          ledger_balance_after: newBalance,
          cleared_balance_after: newBalance,
          created_by: req.user?.id || 'system',
          transaction_method: 'CASH',
          transaction_date: new Date(),
          currency: 'NGN',
          status: 'COMPLETED',
          member_cust_id: memberId,
          group_savings_id: groupSavings.id
        }, { transaction });
        
        console.log('✅ Transaction record created:', transactionRecord.id);
      }
    } catch (txnError) {
      console.warn('⚠️ Failed to create transaction record:', txnError.message);
      // Continue - don't fail the transaction
    }
    
    // ✅ CREATE AUDIT TRAIL
    try {
      // Check if createDirectAuditTrail function exists
      if (typeof createDirectAuditTrail === 'function') {
        await createDirectAuditTrail({
          entity_type: 'GroupSavingsContribution',
          entity_id: contribution.id.toString(),
          user_id: req.user?.id?.toString() || 'system',
          action: 'CREATE',
          old_value: null,
          new_value: {
            amount: safeAmount,
            memberId: memberId,
            groupSavingsId: groupSavings.id,
            accountNumber: groupSavings.accountNumber
          },
          ip_address: req.ip || '127.0.0.1',
          event_type: 'GROUP_SAVINGS_CONTRIBUTION',
          account_no: groupSavings.accountNumber,
          description: `Contribution of ${safeAmount} to group savings ${groupSavings.accountNumber}`,
        }, transaction);
      }
    } catch (auditError) {
      console.warn('⚠️ Audit trail creation failed:', auditError.message);
    }
    
    // ✅ COMMIT TRANSACTION
    await transaction.commit();
    console.log('✅ Contribution transaction committed successfully');
    
    logger.info(`Contribution added: ${safeAmount} to account ${groupSavings.accountNumber} by member ${memberId}`);
    
    res.status(201).json({
      success: true,
      message: 'Contribution added successfully.',
      data: {
        contribution: {
          id: contribution.id,
          amount: safeAmount,
          memberId: memberId,
          previousBalance: currentBalance,
          newBalance: newBalance,
          contributionDate: contribution.contributionDate,
          period: formattedPeriod,
          reference: contribution.reference || null
        },
        groupSavings: {
          id: groupSavings.id,
          accountNumber: groupSavings.accountNumber,
          groupCode: groupSavings.groupCode,
          groupName: groupSavings.groupName,
          currentBalance: newBalance
        }
      }
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error adding contribution:', error);
    logger.error('Error adding contribution:', error);

    let errorMessage = 'Failed to add contribution.';
    if (error.name === 'SequelizeValidationError') {
      errorMessage = `Validation error: ${error.errors.map(e => e.message).join(', ')}`;
    } else if (error.name === 'SequelizeUniqueConstraintError') {
      errorMessage = 'Duplicate entry found.';
    } else if (error.name === 'SequelizeDatabaseError') {
      errorMessage = `Database error: ${error.message}`;
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
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

// ✅ GET GROUP CONTRIBUTIONS - DEBUG VERSION
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
    
    console.log('Group savings found:', groupSavings.id);
    
    // Try to get the model attributes to see what fields exist
    const modelAttributes = GroupSavingsContribution.getAttributes();
    console.log('GroupSavingsContribution attributes:', Object.keys(modelAttributes));
    
    // Find the correct foreign key field
    let foreignKeyField = null;
    const possibleFields = ['groupSavingsId', 'groupSavings_id', 'groupId', 'group_id', 'savingsId'];
    
    for (const field of possibleFields) {
      if (modelAttributes[field]) {
        foreignKeyField = field;
        console.log(`Found matching field: ${field}`);
        break;
      }
    }
    
    if (!foreignKeyField) {
      console.error('Could not find matching foreign key field');
      return res.status(500).json({
        success: false,
        message: 'Database schema mismatch',
        error: 'Could not find the correct foreign key field'
      });
    }
    
    // Build query with the correct field name
    const where = { [foreignKeyField]: groupSavings.id };
    
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
    
    // Calculate summary statistics - FIXED: Changed 'memberCustId' to 'member_cust_id'
    const summaryStats = await GroupSavingsContribution.findOne({
      where,
      attributes: [
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
        [sequelize.fn('AVG', sequelize.col('amount')), 'averageAmount'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'contributionCount'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('member_cust_id'))), 'uniqueMemberCount']
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
// ✅ GET ALL GROUP SAVINGS ACCOUNTS WITH PAGINATION AND FILTERS
export const getAllGroupSavings = asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      savingsType,
      groupCode,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    console.log('📋 Fetching all group savings with params:', { page, limit, status, savingsType, groupCode, search });

    // Build where clause
    const where = {};
    
    if (status) {
      where.status = status;
    }
    
    if (savingsType) {
      where.savingsType = savingsType;
    }
    
    if (groupCode) {
      where.groupCode = { [Op.like]: `%${groupCode}%` };
    }
    
    if (search) {
      where[Op.or] = [
        { groupCode: { [Op.like]: `%${search}%` } },
        { groupName: { [Op.like]: `%${search}%` } },
        { accountNumber: { [Op.like]: `%${search}%` } }
      ];
    }

    // Parse pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Validate sort order
    const validSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Get total count for pagination
    const totalCount = await GroupSavings.count({ where });

    // Try to get paginated results with association
    let groupSavings = [];
    
    try {
      // Try with association first
      groupSavings = await GroupSavings.findAll({
        where,
        limit: limitNum,
        offset,
        order: [[sortBy, validSortOrder]],
        include: [
          {
            model: Group,
            as: 'group',
            attributes: ['id', 'groupName', 'groupCode', 'memberCount', 'members', 'createdAt'],
            required: false // Use LEFT JOIN instead of INNER JOIN
          }
        ]
      });
    } catch (assocError) {
      console.warn('⚠️ Association error, falling back to basic query:', assocError.message);
      
      // Fallback to basic query without association
      groupSavings = await GroupSavings.findAll({
        where,
        limit: limitNum,
        offset,
        order: [[sortBy, validSortOrder]]
      });
      
      // Manually fetch group details for each savings account
      for (const savings of groupSavings) {
        try {
          const group = await Group.findByPk(savings.groupId, {
            attributes: ['id', 'groupName', 'groupCode', 'memberCount', 'members', 'createdAt']
          });
          savings.dataValues.group = group ? group.toJSON() : null;
        } catch (groupError) {
          savings.dataValues.group = null;
        }
      }
    }

    console.log(`✅ Found ${groupSavings.length} group savings accounts (total: ${totalCount})`);

    // Calculate summary statistics
    const summary = await GroupSavings.findAll({
      where,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalAccounts'],
        [sequelize.fn('SUM', sequelize.col('currentBalance')), 'totalBalance'],
        [sequelize.fn('AVG', sequelize.col('currentBalance')), 'averageBalance'],
        [sequelize.fn('SUM', sequelize.col('targetAmount')), 'totalTargetAmount'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('savingsType'))), 'uniqueSavingsTypes']
      ],
      raw: true
    });

    // Get counts by status
    const activeCount = await GroupSavings.count({ 
      where: { ...where, status: 'active' } 
    });
    
    const inactiveCount = await GroupSavings.count({ 
      where: { ...where, status: 'inactive' } 
    });
    
    const closedCount = await GroupSavings.count({ 
      where: { ...where, status: 'closed' } 
    });

    // Get counts by savings type
    const savingsTypeCounts = await GroupSavings.findAll({
      where,
      attributes: [
        'savingsType',
        [sequelize.fn('COUNT', sequelize.col('savingsType')), 'count']
      ],
      group: ['savingsType']
    });

    res.status(200).json({
      success: true,
      message: 'Group savings accounts retrieved successfully.',
      data: {
        accounts: groupSavings,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalCount,
          limit: limitNum,
          hasNext: pageNum * limitNum < totalCount,
          hasPrev: pageNum > 1
        },
        summary: {
          totalAccounts: summary[0]?.totalAccounts || 0,
          totalBalance: safeParseFloat(summary[0]?.totalBalance, 0),
          averageBalance: safeParseFloat(summary[0]?.averageBalance, 0),
          totalTargetAmount: safeParseFloat(summary[0]?.totalTargetAmount, 0),
          uniqueSavingsTypes: summary[0]?.uniqueSavingsTypes || 0,
          byStatus: {
            active: activeCount,
            inactive: inactiveCount,
            closed: closedCount
          },
          bySavingsType: savingsTypeCounts.reduce((acc, item) => {
            acc[item.savingsType] = parseInt(item.dataValues.count);
            return acc;
          }, {})
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching all group savings:', error);
    logger.error('Error fetching all group savings:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch group savings accounts.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ✅ GET ALL GROUP SAVINGS - SIMPLIFIED VERSION (for dropdowns and basic listings)
export const getAllGroupSavingsSimple = asyncHandler(async (req, res) => {
  try {
    const { limit = 100, activeOnly = true } = req.query;

    const where = {};
    if (activeOnly === 'true' || activeOnly === true) {
      where.status = 'active';
      where.isActive = true;
    }

    const groupSavings = await GroupSavings.findAll({
      where,
      limit: parseInt(limit),
      order: [['createdAt', 'DESC']],
      attributes: [
        'id',
        'groupId',
        'groupCode',
        'groupName',
        'accountNumber',
        'savingsType',
        'currentBalance',
        'targetAmount',
        'status',
        'isActive',
        'createdAt'
      ]
    });

    res.status(200).json({
      success: true,
      message: 'Group savings accounts retrieved successfully.',
      data: groupSavings,
      count: groupSavings.length
    });

  } catch (error) {
    console.error('❌ Error fetching simple group savings list:', error);
    logger.error('Error fetching simple group savings list:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch group savings accounts.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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

