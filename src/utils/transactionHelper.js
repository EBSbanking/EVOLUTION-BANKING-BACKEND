// utils/transactionHelper.js - DYNAMIC BU_ID
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';

// Cache for business units to avoid repeated database queries
let businessUnitsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Function to get business units with caching
const getBusinessUnits = async () => {
  const now = Date.now();
  
  // Return cached data if it's still valid
  if (businessUnitsCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return businessUnitsCache;
  }

  try {
    const BusinessUnit = mongoose.models.BusinessUnit;
    if (!BusinessUnit) {
      throw new Error('BusinessUnit model not found');
    }

    const units = await BusinessUnit.find({}).sort({ BU_ID: 1 });
    businessUnitsCache = units;
    cacheTimestamp = now;
    
    return units;
  } catch (error) {
    console.warn('Could not fetch business units, using default:', error.message);
    return null;
  }
};

// Function to get the appropriate BU_ID for group savings
const getGroupSavingsBUId = async () => {
  // First try environment variable
  if (process.env.GROUP_SAVINGS_BU_ID) {
    return process.env.GROUP_SAVINGS_BU_ID;
  }

  // Then try to find a matching business unit
  const businessUnits = await getBusinessUnits();
  if (businessUnits) {
    // Look for business units with names related to savings, groups, or cooperatives
    const preferredUnits = businessUnits.filter(unit => 
      unit.BUSINESS_UNIT?.toLowerCase().includes('saving') ||
      unit.BUSINESS_UNIT?.toLowerCase().includes('group') ||
      unit.BUSINESS_UNIT?.toLowerCase().includes('cooperative') ||
      unit.BUSINESS_UNIT?.toLowerCase().includes('union')
    );

    if (preferredUnits.length > 0) {
      return preferredUnits[0].BU_ID;
    }

    // Fallback to Information Technology (106) if no specific savings unit found
    const itUnit = businessUnits.find(unit => unit.BU_ID === '106');
    if (itUnit) {
      return itUnit.BU_ID;
    }

    // Final fallback: use the first available business unit
    if (businessUnits.length > 0) {
      return businessUnits[0].BU_ID;
    }
  }

  // Ultimate fallback
  return '106';
};

export const createGroupSavingsTransaction = async (transactionData, session = null) => {
  const {
    groupSavings,
    memberCustId,
    amount,
    transactionType,
    description,
    reference,
    balanceAfter,
    ledgerBalanceAfter,
    clearedBalanceAfter,
    createdBy,
    contributionId = null,
    customBUId = null // Allow overriding BU_ID per transaction
  } = transactionData;

  // Get dynamic BU_ID
  const BU_ID = customBUId || await getGroupSavingsBUId();

  const transactionPayload = {
    // Required fields based on your Transaction schema
    createdBy: createdBy,
    TRANSACTION_TYPE: transactionType.toUpperCase(),
    AMOUNT: amount,
    ACCT_NM: groupSavings.groupName,
    CUST_ID: memberCustId,
    BU_ID: BU_ID, // Dynamic BU_ID
    ACCT_ID: groupSavings._id.toString(),
    ACCT_NO: groupSavings.accountNumber,
    
    // Additional fields
    account_no: groupSavings.accountNumber,
    account_name: groupSavings.groupName,
    transaction_type: transactionType.toUpperCase(),
    amount: amount,
    description: description,
    reference: reference,
    balance_after: balanceAfter,
    ledger_balance_after: ledgerBalanceAfter,
    cleared_balance_after: clearedBalanceAfter,
    created_by: createdBy,
    transaction_method: 'CASH',
    transaction_date: new Date(),
    currency: 'NGN',
    status: 'COMPLETED',
    
    // Group savings specific fields
    transaction_category: 'GROUP_SAVINGS_CONTRIBUTION',
    member_cust_id: memberCustId,
    group_savings_id: groupSavings._id
  };

  if (contributionId) {
    transactionPayload.contribution_id = contributionId;
  }

  const transaction = new Transaction(transactionPayload);
  
  if (session) {
    await transaction.save({ session });
  } else {
    await transaction.save();
  }
  
  return transaction;
};

// Utility function to refresh the cache if needed
export const refreshBusinessUnitsCache = async () => {
  businessUnitsCache = null;
  cacheTimestamp = null;
  return await getBusinessUnits();
};