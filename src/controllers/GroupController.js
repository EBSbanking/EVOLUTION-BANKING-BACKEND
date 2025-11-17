// controllers/GroupController.js - Complete Controller with Legacy Field Support and GL Integration
import mongoose from 'mongoose';
import Group from '../models/Group.js';
import GroupLoan from '../models/GroupLoan.js';
import LoanAccount from '../models/LoanAccount.js';
import Customer from '../models/Customer.js';
import User from '../models/User.js';
import CustomerAccount from '../models/CustomerAccount.js';
import GroupSavings from '../models/GroupSavings.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import Counter from '../models/Counter.js';
import InterestRate from '../models/LoanInterestRate.js';
import { getPrefixForProductType } from '../utils/generateLoanAccountId.js';
import { calculateMaturityDate } from '../utils/loanUtils.js';
import logAuditTrail from '../Services/AuditService.js';
import logger from '../utils/logger.js';
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { v4 as uuidv4 } from 'uuid';
import RateIndex from '../models/Rate-Index.js';
import { createLedgerEntry } from './GLAccountController.js';
import GLAccount from '../models/GLAccount.js';
import Transaction from '../models/Transaction.js';
import InsurancePolicy from '../models/InsurancePolicy.js';
import Ledger from '../models/Ledger.js';
import Branch from '../models/Branch.js';
import { safeToString, safeNumber, safeBoolean } from '../utils/safeHandlers.js';
// DYNAMIC GL Account Template Configuration - With wildcards for all branches
export const GL_ACCOUNT_TEMPLATES = {
  PROCESSING_FEE: {
    template: 'BR-SB-400-001-SF', // BR=Branch(3), SB=SubBranch(3), SF=Suffix(3)
    description: 'Processing Fee Income',
    transactionType: 'PROCESSING_FEE',
    accountType: 'REVENUE'
  },
  INSURANCE_FEE: {
    template: 'BR-SB-400-002-SF',
    description: 'Insurance Premium Income',
    transactionType: 'INSURANCE_PREMIUM',
    accountType: 'REVENUE'
  },
  UPFRONT_INTEREST: {
    template: 'BR-SB-400-003-SF',
    description: 'Interest Income',
    transactionType: 'UPFRONT_INTEREST',
    accountType: 'REVENUE'
  },
  OTHER_FEES: {
    template: 'BR-SB-400-004-SF',
    description: 'Other Fee Income',
    transactionType: 'OTHER_FEES',
    accountType: 'REVENUE'
  },
  CUSTOMER_ACCOUNT: {
    template: 'BR-SB-100-001-SF',
    description: 'Customer Deposit Account',
    transactionType: 'CUSTOMER_ACCOUNT',
    accountType: 'LIABILITY'
  },
  LOAN_ASSET: {
    template: 'BR-SB-200-001-SF',
    description: 'Loan Assets',
    transactionType: 'LOAN_DISBURSEMENT',
    accountType: 'ASSET'
  }
};
// DYNAMIC Loan Product to GL Account Mapping
export const LOAN_PRODUCT_TEMPLATES = {
  'GROUP_LOAN': 'BR-SB-200-001-SF',
  'INDIVIDUAL_LOAN': 'BR-SB-200-002-SF',
  'BUSINESS_LOAN': 'BR-SB-200-003-SF',
  'PERSONAL_LOAN': 'BR-SB-200-004-SF',
  'MORTGAGE': 'BR-SB-200-005-SF',
  'AUTO_LOAN': 'BR-SB-200-006-SF'
};
// Helper function to get available account types
export const getAvailableAccountTypes = () => {
  return [
    "CUSTOMER_ACCOUNT",
    "LOAN_ASSET",
    "PROCESSING_FEE",
    "INSURANCE_FEE",
    "UPFRONT_INTEREST",
    "OTHER_FEES"
  ];
};
// Helper function to get available product types
export const getAvailableProductTypes = () => {
  return [
    "PERSONAL_LOAN",
    "BUSINESS_LOAN",
    "MORTGAGE_LOAN",
    "AUTO_LOAN",
    "EDUCATION_LOAN"
  ];
};
// Generate dynamic GL account number based on branch code and parameters
export const generateGLAccount = (template, branchCode = '001', subBranchCode = '001', accountSuffix = '100') => {
  return template
    .replace('BR', branchCode.padStart(3, '0')) // Branch code (3 digits)
    .replace('SB', subBranchCode.padStart(3, '0')) // Sub-branch (3 digits)
    .replace('SF', accountSuffix.padStart(3, '0')); // Account suffix (3 digits)
};
// Get GL account for a specific branch and account type
export const getGLAccountForBranch = (accountType, branchCode, subBranchCode = '001', accountSuffix = '100') => {
  const template = GL_ACCOUNT_TEMPLATES[accountType]?.template;
  if (!template) {
    throw new Error(`Unknown account type: ${accountType}`);
  }
  return generateGLAccount(template, branchCode, subBranchCode, accountSuffix);
};
// Get loan asset GL account for specific branch and product
export const getLoanAssetGLAccount = (productType, branchCode, subBranchCode = '001', accountSuffix = '100') => {
  const template = LOAN_PRODUCT_TEMPLATES[productType] || 'BR-SB-200-000-SF';
  return generateGLAccount(template, branchCode, subBranchCode, accountSuffix);
};
// Get branch by ID and return branchCode
export const getBranchCode = async (branchId, session = null) => {
  try {
    const branch = await Branch.findById(branchId).session(session);
    if (!branch) {
      throw new Error(`Branch not found with ID: ${branchId}`);
    }
    if (!branch.branchCode) {
      throw new Error(`Branch ${branch.branchName} does not have a branchCode`);
    }
    return branch.branchCode;
  } catch (error) {
    logger.error(`Error getting branch code for branch ${branchId}:`, error);
    throw error;
  }
};
// Get all GL accounts for a specific branch (useful for setup)
export const getAllGLAccountsForBranch = (branchCode, subBranchCode = '001', accountSuffix = '100') => {
  const accounts = {};
  Object.keys(GL_ACCOUNT_TEMPLATES).forEach(accountType => {
    accounts[accountType] = getGLAccountForBranch(accountType, branchCode, subBranchCode, accountSuffix);
  });
  // Add loan product accounts
  Object.keys(LOAN_PRODUCT_TEMPLATES).forEach(productType => {
    accounts[`${productType}_ASSET`] = getLoanAssetGLAccount(productType, branchCode, subBranchCode, accountSuffix);
  });
  return accounts;
};
// Get default accrual basis type
export const getDefaultAccrualBasisType = async (productType = 'GROUP_LOAN') => {
  try {
    const defaultConfig = await InterestRate.findOne({ productType, isDefault: true });
    return defaultConfig?.accrualBasisType || 'ACTUAL/360';
  } catch (error) {
    logger.error(`Error getting default accrual basis:`, error);
    return 'ACTUAL/360';
  }
};
// Dynamic fee type detector
export const detectFeeType = (feeName, chargeCode = '') => {
  const name = feeName?.toLowerCase() || '';
  const code = chargeCode?.toLowerCase() || '';
  if (name.includes('process') || code.includes('proc')) return 'PROCESSING_FEE';
  if (name.includes('insur') || code.includes('ins')) return 'INSURANCE_FEE';
  if (name.includes('interest') || code.includes('int')) return 'UPFRONT_INTEREST';
  if (name.includes('admin') || code.includes('adm')) return 'OTHER_FEES';
  if (name.includes('service') || code.includes('svc')) return 'OTHER_FEES';
  if (name.includes('charge') || code.includes('chg')) return 'OTHER_FEES';
  return 'OTHER_FEES';
};
// Calculate total fees dynamically from all components
export const calculateTotalFees = (fees) => {
  let total = 0;
  // Add standard fee components
  if (fees.processingFee > 0) total += fees.processingFee;
  if (fees.insuranceFee > 0) total += fees.insuranceFee;
  if (fees.otherFees > 0) total += fees.otherFees;
  if (fees.upfrontInterest > 0) total += fees.upfrontInterest;
  // Add charges array total
  if (fees.charges && Array.isArray(fees.charges)) {
    total += fees.charges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
  }
  return total;
};
// Get fee breakdown for reporting
export const getFeeBreakdown = (fees) => {
  const breakdown = {};
  if (fees.processingFee > 0) breakdown.processingFee = fees.processingFee;
  if (fees.insuranceFee > 0) breakdown.insuranceFee = fees.insuranceFee;
  if (fees.otherFees > 0) breakdown.otherFees = fees.otherFees;
  if (fees.upfrontInterest > 0) breakdown.upfrontInterest = fees.upfrontInterest;
  if (fees.charges && Array.isArray(fees.charges)) {
    breakdown.charges = fees.charges.map(charge => ({
      name: charge.name,
      amount: charge.amount,
      type: charge.chargeType
    }));
  }
  return breakdown;
};
// Helper function to credit fees to respective GL accounts
const creditFeesToGLAccounts = async (loanAccount, userId, session, branchId) => {
  const branchCode = await getBranchCode(branchId, session);
  const fees = loanAccount.FEE_DETAILS;
  // Process each fee type separately
  const feeTransactions = [];
  // 1. Processing Fee
  if (fees.processingFee > 0) {
    feeTransactions.push({
      type: 'PROCESSING_FEE',
      amount: fees.processingFee,
      glAccountCode: getGLAccountForBranch('PROCESSING_FEE', branchCode), // Dynamic Processing Fee Income GL
      description: `Processing fee for loan ${loanAccount.ACCT_NO}`
    });
  }
  // 2. Insurance Fee
  if (fees.insuranceFee > 0) {
    feeTransactions.push({
      type: 'INSURANCE_FEE',
      amount: fees.insuranceFee,
      glAccountCode: getGLAccountForBranch('INSURANCE_FEE', branchCode), // Dynamic Insurance Fee Income GL
      description: `Insurance premium for loan ${loanAccount.ACCT_NO}`
    });
  }
  // 3. Other Fees
  if (fees.otherFees > 0) {
    feeTransactions.push({
      type: 'OTHER_FEES',
      amount: fees.otherFees,
      glAccountCode: getGLAccountForBranch('OTHER_FEES', branchCode), // Dynamic Other Fee Income GL
      description: `Other fees for loan ${loanAccount.ACCT_NO}`
    });
  }
  // 4. Upfront Interest (optional)
  if (fees.upfrontInterest > 0) {
    feeTransactions.push({
      type: 'UPFRONT_INTEREST',
      amount: fees.upfrontInterest,
      glAccountCode: getGLAccountForBranch('UPFRONT_INTEREST', branchCode), // Dynamic Upfront Interest Income GL
      description: `Upfront interest for loan ${loanAccount.ACCT_NO}`
    });
  }
  // 5. Individual Charges
  if (fees.charges && fees.charges.length > 0) {
    for (const charge of fees.charges) {
      if (charge.amount > 0) {
        feeTransactions.push({
          type: charge.chargeType || 'ADMINISTRATIVE',
          amount: charge.amount,
          glAccountCode: charge.glAccountCode || getGLAccountForBranch('OTHER_FEES', branchCode), // Dynamic Default Admin Fee GL
          description: `${charge.name} for loan ${loanAccount.ACCT_NO}`
        });
      }
    }
  }
  // Process all fee transactions
  for (const feeTxn of feeTransactions) {
    try {
      // Find the GL account
      const glAccount = await GLAccount.findOne({
        GL_ACCT_NO: feeTxn.glAccountCode
      }).session(session);
   
      if (!glAccount) {
        throw new Error(`GL account not found: ${feeTxn.glAccountCode}`);
      }
   
      // Create ledger entry (credit to income GL account)
      const customerGLCode = getGLAccountForBranch('CUSTOMER_ACCOUNT', branchCode);
      await createLedgerEntry(
        null,
        null,
        {
          DR_ACCT_NO: customerGLCode, // Dynamic Debit Customer Account GL
          CR_ACCT_NO: feeTxn.glAccountCode, // Credit Fee Income GL
          AMOUNT: feeTxn.amount,
          NARRATION: feeTxn.description,
          CREATED_BY: userId,
          TRANSACTION_TYPE: 'FEE_COLLECTION',
          JOURNAL_ID: `FEE_${loanAccount.ACCT_NO}_${Date.now()}`
        },
        { session }
      );
   
      // Update GL account balance
      glAccount.LEDGER_BALANCE = (glAccount.LEDGER_BALANCE || 0) + feeTxn.amount;
      await glAccount.save({ session });
   
    } catch (error) {
      logger.error(`Error processing fee transaction for ${feeTxn.type}:`, error);
      throw new Error(`Failed to process ${feeTxn.type}: ${error.message}`);
    }
  }
};
// Helper function to activate insurance
const activateInsurance = async (loanAccount, userId, session) => {
  if (!loanAccount.insuranceDetails) return;
  // Update insurance status
  loanAccount.insuranceDetails.premiumCollected = true;
  loanAccount.insuranceDetails.policyActive = true;
  loanAccount.insuranceDetails.activationDate = new Date();
  await loanAccount.save({ session });
  // Log insurance activation
  await logAuditTrail(
    'LoanAccount',
    loanAccount._id.toString(),
    userId,
    'INSURANCE_ACTIVATED',
    { premiumCollected: false, policyActive: false },
    {
      premiumCollected: true,
      policyActive: true,
      premiumAmount: loanAccount.insuranceDetails.premiumAmount,
      policyNumber: loanAccount.insuranceDetails.policyNumber
    },
    '127.0.0.1',
    'INSURANCE_ACTIVATION'
  );
};
// Auto-calculate processing fee (percentage of loan amount)
const calculateProcessingFee = (loanAmount, processingFeePercentage) => {
  return loanAmount * (processingFeePercentage / 100); // e.g., 1% processing fee
};
// Auto-calculate admin fee (flat ₦1000 per member)
const calculateAdminFee = () => {
  return 1000; // Flat ₦1000 admin fee
};
// Helper function to generate Group Loan account number
const getLoanAccountNumberForGroupLoan = async () => {
  const prefix = getPrefixForProductType('GROUP_LOAN'); // '310'
  const counterId = `ACCT_NO_${prefix}`;
  const result = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const sequence = result.seq.toString().padStart(7, '0');
  const accountNumber = `${prefix}${sequence}`;
  if (!/^\d{10}$/.test(accountNumber)) {
    throw new Error(`Invalid group loan account number format: ${accountNumber}`);
  }
  return accountNumber;
};
// Create a new group (updated with legacy field support)
export const createGroup = asyncHandler(async (req, res) => {
  const {
    groupCode,
    groupName,
    members,
    // Legacy fields
    branch,
    relationshipManager,
    regDate,
    minMembers,
    maxMembers,
    meetingDay,
    meetingFrequency,
    unionAddress,
    groupType,
    unionPurseAccount
  } = req.body;
  if (!groupCode || !groupName || !Array.isArray(members) || members.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Group code, name, and at least one member (CUST_ID) are required.',
    });
  }
  // Validate members exist (check Customers by CUST_ID)
  const validMembers = await Customer.find({ CUST_ID: { $in: members } });
  if (validMembers.length !== members.length) {
    return res.status(400).json({
      success: false,
      message: 'One or more member CUST_IDs not found.',
    });
  }
  // Check for existing group memberships
  const existingMemberships = await Group.find({
    members: { $in: members }
  }).select('members groupName');
  if (existingMemberships.length > 0) {
    const conflicts = {};
    existingMemberships.forEach(group => {
      group.members.forEach(memberCustId => {
        if (members.includes(memberCustId)) {
          if (!conflicts[memberCustId]) {
            conflicts[memberCustId] = [];
          }
          conflicts[memberCustId].push(group.groupName);
        }
      });
    });
  
    const conflictMessage = Object.entries(conflicts).map(([custId, groups]) =>
      `Member ${custId} already exists in group(s): ${groups.join(', ')}`
    ).join('; ');
  
    return res.status(400).json({
      success: false,
      message: `Cannot add members already in other groups: ${conflictMessage}`,
    });
  }
  // Create new group with legacy fields
  const newGroup = new Group({
    groupCode,
    groupName,
    members,
    // Legacy fields
    branch: branch || 0,
    relationshipManager: relationshipManager || 0,
    regDate: regDate ? new Date(regDate) : new Date(),
    minMembers: minMembers || 0,
    maxMembers: maxMembers || 0,
    meetingDay: meetingDay || 'Monday',
    meetingFrequency: meetingFrequency || 'Once Every Week',
    unionAddress: unionAddress || '',
    createdBy: req.user?.id || 0,
    groupType: groupType || 'Union',
    unionPurseAccount: unionPurseAccount || 0,
  });
  const savedGroup = await newGroup.save();
  // Manually populate members for response
  const populatedMembersData = await Customer.find({ CUST_ID: { $in: savedGroup.members } }, 'CUST_ID FIRST_NAME LAST_NAME');
  const populatedMembers = populatedMembersData.map(member => ({
    CUST_ID: member.CUST_ID,
    CUST_NAME: `${member.FIRST_NAME} ${member.LAST_NAME}`.trim()
  }));
  const responseData = {
    ...savedGroup.toObject(),
    members: populatedMembers
  };
  // Log audit trail for group creation
  await logAuditTrail(
    'Group',
    savedGroup._id.toString(),
    req.user?.id || 'system',
    'CREATE',
    null,
    {
      groupCode,
      groupName,
      memberCount: members.length,
      branch: savedGroup.branch,
      relationshipManager: savedGroup.relationshipManager,
      groupType: savedGroup.groupType
    },
    req.ip,
    'GROUP_CREATION'
  );
  logger.info(`Group created successfully: ${savedGroup._id} with legacy fields`);
  res.status(201).json({
    success: true,
    message: 'Group created successfully.',
    data: responseData,
  });
});
// Get all groups with legacy field support
export const getGroups = asyncHandler(async (req, res) => {
  const {
    id,
    groupCode,
    groupName,
    branch,
    status,
    groupType,
    legacyId
  } = req.query;
  // Build dynamic filter
  const filter = {};
  if (id) {
    filter._id = id;
  }
  if (legacyId) {
    filter.legacyId = Number(legacyId);
  }
  if (branch) {
    filter.branch = Number(branch);
  }
  if (status) {
    filter.status = status;
  }
  if (groupType) {
    filter.groupType = groupType;
  }
  // Support case-insensitive search for groupCode and groupName
  if (groupCode || groupName) {
    filter.$or = [];
    if (groupCode) {
      filter.$or.push({ groupCode: { $regex: groupCode, $options: 'i' } });
    }
    if (groupName) {
      filter.$or.push({ groupName: { $regex: groupName, $options: 'i' } });
    }
  }
  // Fetch matching groups
  const groups = await Group.find(filter).lean();
  if (!groups || groups.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No groups found matching your search criteria.',
    });
  }
  // Collect all unique member CUST_IDs
  const allMemberIds = [...new Set(groups.flatMap(g => g.members))];
  // Fetch member details from Customer
  const membersData = await Customer.find(
    { CUST_ID: { $in: allMemberIds } },
    'CUST_ID FIRST_NAME LAST_NAME'
  ).lean();
  // Build a quick lookup map for names
  const memberLookup = membersData.reduce((acc, member) => {
    acc[member.CUST_ID] = `${member.FIRST_NAME} ${member.LAST_NAME}`.trim();
    return acc;
  }, {});
  // Populate group members with names
  const populatedGroups = groups.map(group => ({
    ...group,
    members: group.members.map(custId => ({
      CUST_ID: custId,
      CUST_NAME: memberLookup[custId] || 'Unknown Customer',
    })),
  }));
  res.status(200).json({
    success: true,
    count: populatedGroups.length,
    data: populatedGroups,
  });
});



// Add member to existing group with legacy field preservation
export const addMemberToGroup = asyncHandler(async (req, res) => {
  const { groupCode, memberCustId } = req.body;
  if (!groupCode || !memberCustId) {
    return res.status(400).json({
      success: false,
      message: 'Group code and member CUST_ID are required.',
    });
  }
  const group = await Group.findOne({ groupCode });
  if (!group) {
    return res.status(404).json({
      success: false,
      message: 'Group not found.',
    });
  }
  // Check if member already exists in this group
  if (group.members.includes(memberCustId)) {
    return res.status(400).json({
      success: false,
      message: 'Member already in group.',
    });
  }
  // Validate member exists
  const member = await Customer.findOne({ CUST_ID: memberCustId });
  if (!member) {
    return res.status(404).json({
      success: false,
      message: 'Member not found for CUST_ID.',
    });
  }
  // Check if member already exists in another group
  const existingMembership = await Group.findOne({
    members: memberCustId,
    _id: { $ne: group._id }
  }).select('groupName');
  if (existingMembership) {
    return res.status(400).json({
      success: false,
      message: `Member already exists in group: ${existingMembership.groupName}`,
    });
  }
  const oldMembers = [...group.members];
  group.members.push(memberCustId);
  await group.save();
  // Manually populate members for response
  const populatedMembersData = await Customer.find({ CUST_ID: { $in: group.members } }, 'CUST_ID FIRST_NAME LAST_NAME');
  const populatedMembers = populatedMembersData.map(member => ({
    CUST_ID: member.CUST_ID,
    CUST_NAME: `${member.FIRST_NAME} ${member.LAST_NAME}`.trim()
  }));
  const responseData = {
    ...group.toObject(),
    members: populatedMembers
  };
  // Log audit trail
  await logAuditTrail(
    'Group',
    group._id.toString(),
    req.user?.id || 'system',
    'ADD_MEMBER',
    { members: oldMembers },
    { members: group.members },
    req.ip,
    'GROUP_MEMBER_ADDED'
  );
  logger.info(`Member added to group successfully: ${group._id}, Member CUST_ID: ${memberCustId}`);
  res.status(200).json({
    success: true,
    message: 'Member added to group successfully.',
    data: responseData,
  });
});
// Update group information including legacy fields
export const updateGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const {
    groupName,
    branch,
    relationshipManager,
    regDate,
    minMembers,
    maxMembers,
    meetingDay,
    meetingFrequency,
    unionAddress,
    groupType,
    unionPurseAccount,
    status
  } = req.body;
  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({
      success: false,
      message: 'Group not found.',
    });
  }
  const oldData = {
    groupName: group.groupName,
    branch: group.branch,
    relationshipManager: group.relationshipManager,
    regDate: group.regDate,
    minMembers: group.minMembers,
    maxMembers: group.maxMembers,
    meetingDay: group.meetingDay,
    meetingFrequency: group.meetingFrequency,
    unionAddress: group.unionAddress,
    groupType: group.groupType,
    unionPurseAccount: group.unionPurseAccount,
    status: group.status
  };
  // Update fields if provided
  if (groupName !== undefined) group.groupName = groupName;
  if (branch !== undefined) group.branch = branch;
  if (relationshipManager !== undefined) group.relationshipManager = relationshipManager;
  if (regDate !== undefined) group.regDate = new Date(regDate);
  if (minMembers !== undefined) group.minMembers = minMembers;
  if (maxMembers !== undefined) group.maxMembers = maxMembers;
  if (meetingDay !== undefined) group.meetingDay = meetingDay;
  if (meetingFrequency !== undefined) group.meetingFrequency = meetingFrequency;
  if (unionAddress !== undefined) group.unionAddress = unionAddress;
  if (groupType !== undefined) group.groupType = groupType;
  if (unionPurseAccount !== undefined) group.unionPurseAccount = unionPurseAccount;
  if (status !== undefined) group.status = status;
  await group.save();
  // Log audit trail
  await logAuditTrail(
    'Group',
    group._id.toString(),
    req.user?.id || 'system',
    'UPDATE',
    oldData,
    {
      groupName: group.groupName,
      branch: group.branch,
      relationshipManager: group.relationshipManager,
      regDate: group.regDate,
      minMembers: group.minMembers,
      maxMembers: group.maxMembers,
      meetingDay: group.meetingDay,
      meetingFrequency: group.meetingFrequency,
      unionAddress: group.unionAddress,
      groupType: group.groupType,
      unionPurseAccount: group.unionPurseAccount,
      status: group.status
    },
    req.ip,
    'GROUP_UPDATED'
  );
  logger.info(`Group updated successfully: ${group._id}`);
  res.status(200).json({
    success: true,
    message: 'Group updated successfully.',
    data: group,
  });
});
// Remove member from group
export const removeMemberFromGroup = asyncHandler(async (req, res) => {
  const { groupId, memberCustId } = req.params;
  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({
      success: false,
      message: 'Group not found.',
    });
  }
  if (!group.members.includes(memberCustId)) {
    return res.status(400).json({
      success: false,
      message: 'Member not found in group.',
    });
  }
  const oldMembers = [...group.members];
  group.members = group.members.filter(member => member !== memberCustId);
  await group.save();
  // Log audit trail
  await logAuditTrail(
    'Group',
    group._id.toString(),
    req.user?.id || 'system',
    'REMOVE_MEMBER',
    { members: oldMembers },
    { members: group.members },
    req.ip,
    'GROUP_MEMBER_REMOVED'
  );
  logger.info(`Member removed from group: ${group._id}, Member CUST_ID: ${memberCustId}`);
  res.status(200).json({
    success: true,
    message: 'Member removed from group successfully.',
    data: group,
  });
});
// Get group by legacy ID
export const getGroupByLegacyId = asyncHandler(async (req, res) => {
  const { legacyId } = req.params;
  const group = await Group.findOne({ legacyId: Number(legacyId) }).lean();
  if (!group) {
    return res.status(404).json({
      success: false,
      message: 'Group not found for the provided legacy ID.',
    });
  }
  // Populate member details
  const membersData = await Customer.find(
    { CUST_ID: { $in: group.members } },
    'CUST_ID FIRST_NAME LAST_NAME'
  ).lean();
  const populatedMembers = membersData.map(member => ({
    CUST_ID: member.CUST_ID,
    CUST_NAME: `${member.FIRST_NAME} ${member.LAST_NAME}`.trim()
  }));
  const responseData = {
    ...group,
    members: populatedMembers
  };
  res.status(200).json({
    success: true,
    data: responseData,
  });
});
// Get groups by branch
export const getGroupsByBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const groups = await Group.find({ branch: Number(branchId) }).lean();
  if (!groups || groups.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No groups found for the specified branch.',
    });
  }
  // Populate member details for all groups
  const allMemberIds = [...new Set(groups.flatMap(g => g.members))];
  const membersData = await Customer.find(
    { CUST_ID: { $in: allMemberIds } },
    'CUST_ID FIRST_NAME LAST_NAME'
  ).lean();
  const memberLookup = membersData.reduce((acc, member) => {
    acc[member.CUST_ID] = `${member.FIRST_NAME} ${member.LAST_NAME}`.trim();
    return acc;
  }, {});
  const populatedGroups = groups.map(group => ({
    ...group,
    members: group.members.map(custId => ({
      CUST_ID: custId,
      CUST_NAME: memberLookup[custId] || 'Unknown Customer',
    })),
  }));
  res.status(200).json({
    success: true,
    count: populatedGroups.length,
    data: populatedGroups,
  });
});
// Add this helper function at the top with other imports
const generateGroupLoanId = async () => {
  try {
    const counterId = 'GROUP_LOAN_ID';
    const result = await Counter.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const sequence = result.seq.toString().padStart(6, '0');
    return `GL${sequence}`; // Format: GL000001, GL000002, etc.
  } catch (error) {
    logger.error('Error generating group loan ID:', error);
    // Fallback: timestamp-based ID
    const timestamp = Date.now().toString().slice(-8);
    return `GL${timestamp}`;
  }
};
// Updated createGroupLoanApplication function with COMPLETE safe handling
export const createGroupLoanApplication = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('=== STARTING GROUP LOAN CREATION ===');
    
    // ✅ SAFE UTILITY FUNCTIONS
    const safeToString = (value, defaultValue = '') => {
      if (value === null || value === undefined) return defaultValue;
      if (typeof value === 'string') return value.trim();
      if (typeof value.toString === 'function') {
        try {
          return value.toString().trim();
        } catch (error) {
          return defaultValue;
        }
      }
      return String(value || defaultValue).trim();
    };

    const safeNumber = (value, defaultValue = 0) => {
      if (value === null || value === undefined) return defaultValue;
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    const safeBoolean = (value, defaultValue = false) => {
      if (value === null || value === undefined) return defaultValue;
      return Boolean(value);
    };

    // Create a safe version of req.body with defaults
    const safeBody = {
      groupCode: '',
      totalAmount: 0,
      primaryRelationshipManager: '',
      secondaryRelationshipManager: null,
      loanPurpose: '',
      savingsAccount: '',
      interestRate: 0,
      loanTerm: '',
      termValue: 0,
      disbursementMethod: 'CASH',
      useSavingsAsCollateral: false,
      groupSavingsId: null,
      members: [],
      rateType: 'FIXED',
      interestType: 'COMPOUND',
      accrualBasisType: '',
      accrualFrequency: 'DAILY',
      accrualFrequencyValue: 1,
      fixedRate: true,
      capitalizeInterest: false,
      amortized: false,
      rateChangeAllowed: false,
      rateChangeNoticeDays: 30,
      charges: [],
      insuranceDetails: null,
      processingFee: null,
      adminFee: null,
      insuranceFee: 0,
      otherFees: 0,
      upfrontInterest: false,
      upfrontInterestPercentage: 0,
      ...req.body
    };

    const {
      groupCode,
      totalAmount,
      primaryRelationshipManager,
      secondaryRelationshipManager,
      loanPurpose,
      savingsAccount,
      interestRate,
      loanTerm,
      termValue,
      disbursementMethod,
      useSavingsAsCollateral,
      groupSavingsId,
      members,
      rateType,
      interestType,
      accrualBasisType,
      accrualFrequency,
      accrualFrequencyValue,
      fixedRate,
      capitalizeInterest,
      amortized,
      rateChangeAllowed,
      rateChangeNoticeDays,
      charges,
      insuranceDetails,
      processingFee,
      adminFee,
      insuranceFee,
      otherFees,
      upfrontInterest,
      upfrontInterestPercentage
    } = safeBody;

    console.log('Received group loan application request:', { 
      groupCode, 
      totalAmount, 
      membersCount: members?.length 
    });

    // SAFE FIELD CONVERSIONS
    const safeGroupCode = safeToString(groupCode);
    const safePrimaryRM = safeToString(primaryRelationshipManager);
    const safeLoanPurpose = safeToString(loanPurpose);
    const safeSavingsAccount = safeToString(savingsAccount);
    const safeLoanTerm = safeToString(loanTerm).toLowerCase();
    const safeDisbursementMethod = safeToString(disbursementMethod);
    const safeTermValue = safeNumber(termValue);
    
    const safeTotalAmount = safeNumber(totalAmount);
    const safeInterestRate = safeNumber(interestRate);
    const safeSecondaryRM = secondaryRelationshipManager ? safeToString(secondaryRelationshipManager) : null;
    const safeUseSavingsAsCollateral = safeBoolean(useSavingsAsCollateral);
    const safeGroupSavingsId = groupSavingsId ? safeToString(groupSavingsId) : null;
    
    const safeRateType = safeToString(rateType);
    const safeInterestType = safeToString(interestType);
    const safeAccrualBasisType = safeToString(accrualBasisType);
    const safeAccrualFrequency = safeToString(accrualFrequency);
    const safeAccrualFrequencyValue = safeNumber(accrualFrequencyValue, 1);
    const safeFixedRate = safeBoolean(fixedRate, true);
    const safeCapitalizeInterest = safeBoolean(capitalizeInterest);
    const safeAmortized = safeBoolean(amortized);
    const safeRateChangeAllowed = safeBoolean(rateChangeAllowed);
    const safeRateChangeNoticeDays = safeNumber(rateChangeNoticeDays, 30);
    const safeUpfrontInterest = safeBoolean(upfrontInterest);
    const safeUpfrontInterestPercentage = safeNumber(upfrontInterestPercentage);

    console.log('=== VALIDATING REQUIRED FIELDS ===');

    // VALIDATE REQUIRED FIELDS
    const validationErrors = [];
    if (!safeGroupCode) validationErrors.push('Group code is required');
    if (!safePrimaryRM) validationErrors.push('Primary relationship manager is required');
    if (!safeLoanPurpose) validationErrors.push('Loan purpose is required');
    if (!safeSavingsAccount) validationErrors.push('Savings account is required');
    if (!safeLoanTerm) validationErrors.push('Loan term is required');
    if (!safeTermValue || safeTermValue <= 0) validationErrors.push('Valid term value is required');
    if (!safeDisbursementMethod) validationErrors.push('Disbursement method is required');

    // ✅ NEW VALIDATION: Check if members array is provided and has required fields
    if (!members || !Array.isArray(members) || members.length === 0) {
      validationErrors.push('At least one member is required with memberId, individualAmount, and savingsAccountNo');
    }

    if (validationErrors.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Validate loanTerm
    if (!['weekly', 'monthly', 'yearly'].includes(safeLoanTerm)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Loan term must be one of: weekly, monthly, yearly.',
      });
    }

    // Get group
    const group = await Group.findOne({ groupCode: safeGroupCode }).select('branch members groupName groupCode').session(session);
    if (!group) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Group not found.',
      });
    }

    // SAFE GROUP VALIDATION
    if (!group.members || !Array.isArray(group.members) || group.members.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'No members found in group.' 
      });
    }

    // ✅ CHECK FOR EXISTING ACTIVE GROUP LOAN FOR THIS GROUP
    const existingActiveGroupLoan = await GroupLoan.findOne({
      groupCode: safeGroupCode,
      status: { $in: ['applied', 'approved', 'disbursed', 'partially_disbursed', 'active'] }
    }).session(session);

    if (existingActiveGroupLoan) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Group "${group.groupName}" already has an active loan application (${existingActiveGroupLoan.loanId}). Please settle or close the existing loan before applying for a new one.`,
        existingLoan: {
          loanId: existingActiveGroupLoan.loanId,
          status: existingActiveGroupLoan.status,
          totalAmount: existingActiveGroupLoan.totalAmount,
          appliedDate: existingActiveGroupLoan.applicationDate
        }
      });
    }

    // Generate Group Loan ID
    const loanId = await generateGroupLoanId();
    console.log('Generated loan ID:', loanId);

    // SAFE USER ID HANDLING
    let validCreatedBy = req.user?._id || req.user?.id;

    if (!validCreatedBy) {
      const systemUser = await User.findOne({ employeeId: 'SYSTEM' }).session(session);
      if (systemUser) {
        validCreatedBy = systemUser._id;
      } else {
        const fallbackUser = new User({
          employeeId: 'SYSTEM',
          name: 'System User',
          email: 'system@bank.com',
          role: 'SYSTEM'
        });
        const savedUser = await fallbackUser.save({ session });
        validCreatedBy = savedUser._id;
      }
    }

    // SAFE OBJECTID VALIDATION
    const createdByIdString = validCreatedBy ? safeToString(validCreatedBy.toString()) : '';
    if (!mongoose.Types.ObjectId.isValid(createdByIdString)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Invalid user authentication. Please log in again.',
      });
    }

    // ✅ ENHANCED MEMBERS PROCESSING WITH REQUIRED SAVINGS ACCOUNT VALIDATION
    let processingMembers = [];
    let computedTotalAmount = 0;
    
    for (const mem of members) {
      const memberId = safeToString(mem.memberId);
      const individualAmount = safeNumber(mem.individualAmount);
      const savingsAccountNo = safeToString(mem.savingsAccountNo); // ✅ REQUIRED FIELD
      const memberName = safeToString(mem.name, 'Unknown Member');
      
      console.log(`🔍 Processing member: ${memberName} (${memberId}) - Savings Account: ${savingsAccountNo}`);

      // ✅ VALIDATE REQUIRED MEMBER FIELDS
      if (!memberId) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Member ID is required for all members. Missing for: ${memberName}`
        });
      }

      if (!individualAmount || individualAmount <= 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Valid individual amount is required for member ${memberName} (${memberId})`
        });
      }

      // ✅ VALIDATE SAVINGS ACCOUNT NUMBER IS PROVIDED
      if (!savingsAccountNo) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Savings account number is required for member ${memberName} (${memberId}). Please specify which savings account should receive the loan disbursement.`
        });
      }

      // ✅ VALIDATE SAVINGS ACCOUNT EXISTS AND IS ACTIVE
      console.log(`🔍 Validating savings account: ${savingsAccountNo} for member ${memberId}`);
      
      const memberSavingsAccount = await CustomerAccount.findOne({
        account_number: savingsAccountNo,
        status: 'ACTIVE'
      }).session(session);

      if (!memberSavingsAccount) {
        await session.abortTransaction();
        
        // Check if account exists but inactive
        const inactiveAccount = await CustomerAccount.findOne({
          account_number: savingsAccountNo
        }).session(session);
        
        if (inactiveAccount) {
          return res.status(400).json({
            success: false,
            message: `Savings account ${savingsAccountNo} exists but is not active. Status: ${inactiveAccount.status}`,
            memberId: memberId,
            memberName: memberName,
            accountNumber: savingsAccountNo,
            accountStatus: inactiveAccount.status
          });
        }
        
        return res.status(404).json({
          success: false,
          message: `Savings account not found: ${savingsAccountNo} for member ${memberName} (${memberId})`,
          memberId: memberId,
          memberName: memberName,
          savingsAccountNo: savingsAccountNo,
          troubleshooting: [
            'Verify the savings account number is correct',
            'Ensure the account exists in the system',
            'Check if the account status is ACTIVE'
          ]
        });
      }

      // ✅ VALIDATE SAVINGS ACCOUNT BELONGS TO THE MEMBER
      if (memberSavingsAccount.CUST_ID !== memberId) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Savings account ${savingsAccountNo} does not belong to member ${memberId}. Account belongs to CUST_ID: ${memberSavingsAccount.CUST_ID}`,
          memberId: memberId,
          memberName: memberName,
          savingsAccountNo: savingsAccountNo,
          accountOwner: memberSavingsAccount.CUST_ID,
          accountCustomerName: memberSavingsAccount.customerName
        });
      }

      console.log(`✅ Validated savings account: ${savingsAccountNo} for member ${memberId}`);

      // ✅ CHECK IF MEMBER HAS EXISTING ACTIVE LOAN
      const existingMemberLoan = await LoanAccount.findOne({
        CUST_ID: memberId,
        LOAN_STATUS: { $in: ['ACTIVE', 'PENDING', 'APPROVED', 'APPROVED_PENDING_DISBURSAL'] },
        PRODUCT_TYPE: 'GROUP_LOAN'
      }).session(session);

      if (existingMemberLoan) {
        await session.abortTransaction();
        
        // Get group loan details for the existing loan
        const existingGroupLoan = await GroupLoan.findOne({
          individualLoanAccounts: existingMemberLoan._id
        }).populate('group', 'groupName groupCode').session(session);

        const groupName = existingGroupLoan?.group?.groupName || 'Unknown Group';
        const existingLoanId = existingGroupLoan?.loanId || 'Unknown Loan ID';
        
        return res.status(400).json({
          success: false,
          message: `Member ${memberId} (${memberName}) already has an active group loan.`,
          memberDetails: {
            memberId: memberId,
            memberName: memberName,
            existingLoan: {
              loanId: existingLoanId,
              groupName: groupName,
              loanStatus: existingMemberLoan.LOAN_STATUS,
              loanAmount: existingMemberLoan.DISBURSEMENT_LIMIT,
              outstandingPrincipal: existingMemberLoan.OUTSTANDING_PRINCIPAL
            }
          }
        });
      }
      
      const memberCustomer = await Customer.findOne({ CUST_ID: memberId }).select('FIRST_NAME LAST_NAME address').session(session);
      if (!memberCustomer) {
        await session.abortTransaction();
        return res.status(404).json({ 
          success: false, 
          message: `Customer not found for memberId: ${memberId}` 
        });
      }
      
      const firstName = safeToString(memberCustomer.FIRST_NAME);
      const lastName = safeToString(memberCustomer.LAST_NAME);
      const finalMemberName = memberName !== 'Unknown Member' ? memberName : `${firstName} ${lastName}`.trim() || 'Unknown Member';
      
      const memberData = {
        memberId: memberId,
        individualAmount: individualAmount,
        name: finalMemberName,
        savingsAccountNo: savingsAccountNo, // ✅ USER-PROVIDED SAVINGS ACCOUNT
        savingsAccountType: memberSavingsAccount.account_type,
        savingsAccountBalance: safeNumber(memberSavingsAccount.ledger_balance, 0),
        isInGroup: group.members.includes(memberId),
        savingsAccountDetails: {
          account_number: memberSavingsAccount.account_number,
          account_type: memberSavingsAccount.account_type,
          customerName: memberSavingsAccount.customerName,
          CUST_ID: memberSavingsAccount.CUST_ID,
          status: memberSavingsAccount.status,
          currentBalance: safeNumber(memberSavingsAccount.ledger_balance, 0),
          availableBalance: safeNumber(memberSavingsAccount.AVAILABLE_BALANCE, 0)
        }
      };
      processingMembers.push(memberData);
      computedTotalAmount += individualAmount;
    }

    // SAFE TOTAL AMOUNT CALCULATION
    const finalTotalAmount = safeTotalAmount > 0 ? safeTotalAmount : safeNumber(computedTotalAmount);

    if (safeTotalAmount > 0 && Math.abs(safeTotalAmount - computedTotalAmount) > 0.01) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Provided totalAmount (${safeTotalAmount}) does not match sum of individualAmounts (${computedTotalAmount}).`
      });
    }
    
    if (finalTotalAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'Total amount must be greater than 0.' 
      });
    }

    // SAFE SAVINGS ACCOUNT VALIDATION
    const savings = await CustomerAccount.findOne({ account_number: safeSavingsAccount }).session(session);
    if (!savings) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Savings account not found.',
      });
    }

    // ... [Rest of your existing code for fee calculations, interest calculations, etc.]
    // SAFE FEE CALCULATION
    const processingFeePercentage = processingFee !== null ? safeNumber(processingFee, 3) : 3;
    const adminFeeAmount = adminFee !== null ? safeNumber(adminFee, 1000) : 1000;
    const totalInsuranceFee = safeNumber(insuranceFee);
    const totalOtherFees = safeNumber(otherFees);

    // SAFE CHARGES PROCESSING
    let totalChargesAmount = 0;
    const processedCharges = (charges || []).map(charge => {
      const amount = safeNumber(charge?.amount);
      totalChargesAmount += amount;
      
      const numericChargeId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9), 10);
      
      return {
        chargeId: numericChargeId,
        chargeCode: safeToString(charge?.chargeCode, `CHG_${Date.now()}`),
        name: safeToString(charge?.name, 'Other Charge'),
        amount: amount,
        glAccountCode: safeToString(charge?.glAccountCode, '005-001-400-004-100'),
        chargeType: safeToString(charge?.chargeType, 'OTHER_FEES'),
        isUpfront: safeBoolean(charge?.isUpfront, false)
      };
    });

    // Calculate fees function
    const calculateMemberFees = (individualAmount, processingFeePercent, adminFee) => {
      const processingFee = individualAmount * (processingFeePercent / 100);
      const adminFeeAmount = adminFee;
      return {
        processingFee,
        adminFee: adminFeeAmount,
        totalFees: processingFee + adminFeeAmount
      };
    };

    let totalGroupProcessingFee = 0;
    let totalGroupAdminFee = 0;
    let totalGroupFees = 0;

    const memberFeeDetails = processingMembers.map(member => {
      const fees = calculateMemberFees(member.individualAmount, processingFeePercentage, adminFeeAmount);
      totalGroupProcessingFee += fees.processingFee;
      totalGroupAdminFee += fees.adminFee;
      totalGroupFees += fees.totalFees;
      return {
        memberId: member.memberId,
        name: member.name,
        individualAmount: member.individualAmount,
        savingsAccountNo: member.savingsAccountNo,
        fees: fees
      };
    });

    const totalFees = totalGroupFees + totalInsuranceFee + totalOtherFees + totalChargesAmount;

    // SAFE INTEREST CALCULATION
    let years;
    if (safeLoanTerm === 'weekly') {
      years = safeTermValue / 52;
    } else if (safeLoanTerm === 'monthly') {
      years = safeTermValue / 12;
    } else if (safeLoanTerm === 'yearly') {
      years = safeTermValue;
    } else {
      years = safeTermValue;
    }
    
    const rate = safeInterestRate / 100;
    const totalInterest = finalTotalAmount * rate * years;

    let upfrontInterestAmount = 0;
    let remainingInterestAmount = totalInterest;
    if (safeUpfrontInterest && safeUpfrontInterestPercentage > 0) {
      upfrontInterestAmount = totalInterest * (safeUpfrontInterestPercentage / 100);
      remainingInterestAmount = totalInterest - upfrontInterestAmount;
    }

    const totalRepayable = finalTotalAmount + totalInterest;
    const numPeriods = safeTermValue;
    const groupInstallment = totalRepayable / numPeriods;

    const netDisbursementAmount = finalTotalAmount;

    if (netDisbursementAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Net disbursement amount after fees and upfront interest would be ${netDisbursementAmount}. Adjust loan amount or reduce fees.`
      });
    }

    // SAFE INDIVIDUAL LOANACCOUNT CREATION WITH SAVINGS ACCOUNT INFO
    const individualLoanAccounts = [];
    const startDate = new Date();
    
    for (const mem of processingMembers) {
      try {
        // Generate loan account number
        let individualLoanAccountNumber;
        try {
          individualLoanAccountNumber = await getLoanAccountNumberForGroupLoan();
        } catch (accountError) {
          const timestamp = Date.now().toString().slice(-8);
          const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
          individualLoanAccountNumber = `1${timestamp}${random}`.padStart(10, '0');
        }

        // Get customer details
        const memberCustomer = await Customer.findOne({ CUST_ID: mem.memberId }).select('address FIRST_NAME LAST_NAME').session(session);
        if (!memberCustomer) {
          throw new Error(`Customer not found for ${mem.memberId}`);
        }

        // SAFE CUSTOMER DATA
        const customerFirstName = safeToString(memberCustomer.FIRST_NAME);
        const customerLastName = safeToString(memberCustomer.LAST_NAME);
        const customerName = `${customerFirstName} ${customerLastName}`.trim() || mem.name;

        // Calculate individual member's share
        const memberShareRatio = mem.individualAmount / finalTotalAmount;
        const individualShare = mem.individualAmount;
        const individualInterest = individualShare * rate * years;
        const individualUpfrontInterest = individualInterest * (safeUpfrontInterestPercentage / 100);
        const individualRemainingInterest = individualInterest - individualUpfrontInterest;
        const individualTotalRepayable = individualShare + individualInterest;
        const individualInstallment = individualTotalRepayable / numPeriods;

        // Calculate member fees
        const memberFees = calculateMemberFees(mem.individualAmount, processingFeePercentage, adminFeeAmount);
        const memberInsuranceFee = totalInsuranceFee * memberShareRatio;
        const memberOtherFees = totalOtherFees * memberShareRatio;

        const memberCharges = processedCharges.map((charge, index) => ({
          ...charge,
          chargeId: parseInt(`${Date.now()}${index}${Math.floor(Math.random() * 100)}`.slice(-9), 10)
        }));

        const memberTotalFees = memberFees.totalFees + memberInsuranceFee + memberOtherFees + memberCharges.reduce((sum, charge) => sum + charge.amount, 0);
        const memberNetDisbursement = individualShare;

        // Calculate maturity date
        const maturityDt = new Date(startDate);
        switch (safeLoanTerm) {
          case 'weekly':
            maturityDt.setDate(maturityDt.getDate() + (safeTermValue * 7));
            break;
          case 'monthly':
            maturityDt.setMonth(maturityDt.getMonth() + safeTermValue);
            break;
          case 'yearly':
            maturityDt.setFullYear(maturityDt.getFullYear() + safeTermValue);
            break;
          default:
            maturityDt.setMonth(maturityDt.getMonth() + safeTermValue);
        }

        // SAFE CUSTOMER ID CONVERSION
        const safeCustId = parseInt(mem.memberId, 10) || 0;

        const newIndividualLoanAccount = new LoanAccount({
          CUST_ID: safeCustId,
          ACCT_NM: customerName,
          ACCT_NO: individualLoanAccountNumber,
          LOAN_STATUS: 'PENDING',
          PRIMARY_OFFICER_ID: safePrimaryRM,
          BU_ID: 'DEFAULT_BU_001',
          PROD_ID: 1,
          PRODUCT_TYPE: 'GROUP_LOAN',
          APPL_ID: uuidv4().replace(/-/g, '').slice(0, 32),
          JOURNAL_ID: uuidv4().replace(/-/g, '').slice(0, 32),
          PAYMENT_FREQUENCY: safeLoanTerm.toUpperCase(),
          INTEREST_RATE: safeInterestRate,
          INTEREST_RATE_ID: 1,
          MATURITY_DT: maturityDt,
          TERM_VALUE: safeTermValue,
          TERM_CD: safeLoanTerm.toUpperCase(),
          DISBURSEMENT_LIMIT: individualShare,
          ACTUAL_DISBURSEMENT: 0.00,
          OUTSTANDING_PRINCIPAL: individualShare,
          TOTAL_INTEREST: individualInterest,
          TOTAL_REPAYMENT: individualTotalRepayable,
          deductUpfrontInterest: safeUpfrontInterest,
          partialUpfrontInterest: safeUpfrontInterestPercentage > 0 && safeUpfrontInterestPercentage < 100,
          upfrontInterestPercentage: safeUpfrontInterestPercentage,
          upfrontInterestAmount: individualUpfrontInterest,
          remainingInterestAmount: individualRemainingInterest,
          Borrower_address: {
            street: safeToString(memberCustomer.address?.street, 'Not Provided'),
            city: safeToString(memberCustomer.address?.city, 'Not Provided'),
            state: safeToString(memberCustomer.address?.state, 'Not Provided'),
            zipCode: safeToString(memberCustomer.address?.zipCode, '00000'),
            country: 'Nigeria'
          },
          groupLoan: null,
          loanPurpose: safeLoanPurpose,
          interestRate: safeInterestRate,
          loanTerm: safeLoanTerm,
          disbursementMethod: safeDisbursementMethod,
          individualShare,
          installmentAmount: individualInstallment,
          numPeriods: safeTermValue,
          createdBy: validCreatedBy,
          // ✅ STORE USER-PROVIDED SAVINGS ACCOUNT FOR DISBURSEMENT
          savingsAccountNo: mem.savingsAccountNo,
          savingsAccountDetails: mem.savingsAccountDetails,
          FEE_DETAILS: {
            processingFee: memberFees.processingFee,
            adminFee: memberFees.adminFee,
            insuranceFee: memberInsuranceFee,
            otherFees: memberOtherFees,
            totalFees: memberTotalFees,
            charges: memberCharges,
            upfrontInterest: individualUpfrontInterest,
            upfrontInterestPercentage: safeUpfrontInterestPercentage,
            processingFeePercentage: processingFeePercentage,
            adminFeeAmount: adminFeeAmount
          },
          netDisbursementAmount: memberNetDisbursement,
          totalDeductions: memberTotalFees + individualUpfrontInterest,
          insuranceDetails: insuranceDetails ? {
            ...insuranceDetails,
            premiumAmount: memberInsuranceFee,
            insuredAmount: individualShare,
            coverageType: safeToString(insuranceDetails.coverageType, 'LOAN_PROTECTION'),
            provider: safeToString(insuranceDetails.provider, 'DEFAULT_INSURER'),
            policyNumber: safeToString(insuranceDetails.policyNumber, `POL_${individualLoanAccountNumber}`),
            startDate: insuranceDetails.startDate || startDate,
            endDate: insuranceDetails.endDate || maturityDt
          } : null
        });

        const savedIndividualLoanAccount = await newIndividualLoanAccount.save({ session });
        individualLoanAccounts.push(savedIndividualLoanAccount._id);
      } catch (error) {
        await session.abortTransaction();
        logger.error(`Failed to create LoanAccount for member ${mem.memberId}:`, error);
        return res.status(400).json({
          success: false,
          message: `Failed to create LoanAccount for member ${mem.memberId}: ${error.message}`
        });
      }
    }

    // SAFE GROUP LOAN CREATION
    const newGroupLoan = new GroupLoan({
      loanId: loanId,
      group: group._id,
      groupCode: safeToString(group.groupCode, safeGroupCode),
      groupName: safeToString(group.groupName, 'Unknown Group'),
      totalAmount: finalTotalAmount,
      memberCount: processingMembers.length,
      individualShare: finalTotalAmount / processingMembers.length,
      members: processingMembers.map(mem => ({
        memberId: safeToString(mem.memberId),
        name: safeToString(mem.name),
        individualAmount: mem.individualAmount,
        savingsAccountNo: mem.savingsAccountNo, // ✅ STORE USER-PROVIDED SAVINGS ACCOUNT
        savingsAccountType: mem.savingsAccountType,
        savingsAccountBalance: mem.savingsAccountBalance,
        savingsAccountDetails: mem.savingsAccountDetails
      })),
      branch: safeNumber(group.branch, 0),
      primaryRelationshipManager: safePrimaryRM,
      secondaryRelationshipManager: safeSecondaryRM,
      loanPurpose: safeLoanPurpose,
      savingsAccount: safeSavingsAccount,
      interestRate: safeInterestRate,
      loanTerm: safeLoanTerm,
      termValue: safeTermValue,
      disbursementMethod: safeDisbursementMethod,
      useSavingsAsCollateral: safeUseSavingsAsCollateral,
      groupSavings: null,
      savingsCollateral: 0,
      individualLoanAccounts,
      createdBy: validCreatedBy,
      status: 'applied',
      totalInterest,
      totalRepayable,
      installmentAmount: groupInstallment,
      numPeriods,
      netDisbursementAmount,
      totalFees,
      upfrontInterestAmount,
      remainingInterestAmount,
      feeSummary: {
        processingFee: totalGroupProcessingFee,
        adminFee: totalGroupAdminFee,
        insuranceFee: totalInsuranceFee,
        otherFees: totalOtherFees,
        totalCharges: totalChargesAmount,
        totalFees: totalFees,
        charges: processedCharges,
        upfrontInterestPercentage: safeUpfrontInterestPercentage,
        processingFeePercentage: processingFeePercentage,
        adminFeeAmount: adminFeeAmount
      },
      insuranceDetails: insuranceDetails ? {
        totalPremium: totalInsuranceFee,
        totalCoverage: finalTotalAmount,
        ...insuranceDetails
      } : null,
      rateType: safeRateType,
      interestType: safeInterestType,
      accrualBasisType: safeAccrualBasisType,
      accrualFrequency: safeAccrualFrequency,
      accrualFrequencyValue: safeAccrualFrequencyValue,
      fixedRate: safeFixedRate,
      capitalizeInterest: safeCapitalizeInterest,
      amortized: safeAmortized,
      rateChangeAllowed: safeRateChangeAllowed,
      rateChangeNoticeDays: safeRateChangeNoticeDays,
      upfrontInterest: safeUpfrontInterest,
      upfrontInterestPercentage: safeUpfrontInterestPercentage
    });

    const savedLoan = await newGroupLoan.save({ session });

    // Update individual LoanAccounts with group loan reference
    await LoanAccount.updateMany(
      { _id: { $in: individualLoanAccounts } },
      { groupLoan: savedLoan._id },
      { session }
    );

    // ✅ COMMIT TRANSACTION
    await session.commitTransaction();
    console.log('✅ Group loan transaction committed successfully');

    // Populate response (outside transaction)
    await savedLoan.populate('group', 'groupName memberCount');

    // Response message with LOAN ID and savings account info
    let message = `Group loan application ${loanId} created successfully for ${processingMembers.length} members. `;
    message += `Total amount: ₦${finalTotalAmount.toLocaleString()}. `;
    message += `Processing Fee: ${processingFeePercentage}% per member, Admin Fee: ₦${adminFeeAmount.toLocaleString()} per member. `;
    message += `Total fees: ₦${totalFees.toLocaleString()}. `;

    if (upfrontInterestAmount > 0) {
      message += `Upfront interest: ₦${upfrontInterestAmount.toLocaleString()}. `;
    }

    message += `Total repayable: ₦${totalRepayable.toLocaleString()} over ${safeTermValue} ${safeLoanTerm} payments.`;
    message += ` Loan amounts will be disbursed to the specified savings accounts.`;
    
    console.log('Group loan application created successfully:', loanId);
    
    res.status(201).json({
      success: true,
      message: message,
      data: {
        ...savedLoan.toObject(),
        loanId: loanId
      },
      financialSummary: {
        totalAmount: finalTotalAmount,
        totalFees: totalFees,
        processingFeePercentage: processingFeePercentage,
        adminFeeAmount: adminFeeAmount,
        upfrontInterest: upfrontInterestAmount,
        netDisbursement: netDisbursementAmount,
        totalInterest: totalInterest,
        totalRepayable: totalRepayable,
        installmentAmount: groupInstallment,
        memberFeeBreakdown: memberFeeDetails
      },
      memberSavingsAccounts: processingMembers.map(mem => ({
        memberId: mem.memberId,
        name: mem.name,
        savingsAccountNo: mem.savingsAccountNo,
        savingsAccountType: mem.savingsAccountType,
        currentBalance: mem.savingsAccountBalance,
        accountStatus: 'VALIDATED'
      }))
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Error in createGroupLoanApplication:', error);
    console.error('Error stack:', error.stack);
    logger.error('Group loan application creation failed:', error);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  } finally {
    session.endSession();
  }
});
/////////////////////////////////////////////////////////////////////////
// Add this to your GroupController.js
export const approveGroupLoan = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
 
  try {
    await session.withTransaction(async () => {
      const { id: groupLoanId } = req.params;
      const { approvalNotes } = req.body;

      console.log('=== APPROVING GROUP LOAN ===');
      console.log('Group Loan ID:', groupLoanId);

      // SAFE UTILITY FUNCTIONS
      const safeToString = (value, defaultValue = '') => {
        if (value === null || value === undefined) return defaultValue;
        if (typeof value === 'string') return value.trim();
        if (typeof value.toString === 'function') {
          try {
            return value.toString().trim();
          } catch (error) {
            return defaultValue;
          }
        }
        return String(value || defaultValue).trim();
      };

      // Safe user ID handler
      const getSafeUserId = (userId) => {
        if (!userId) return null;
        if (mongoose.Types.ObjectId.isValid(userId)) return userId;
        if (typeof userId === 'number') return userId.toString();
        if (typeof userId === 'string') return userId;
        return String(userId);
      };

      const safeUserId = getSafeUserId(req.user.id);

      // Build query
      const query = { loanId: groupLoanId };
      
      console.log('Searching for group loan with query:', query);

      const groupLoan = await GroupLoan.findOne(query).session(session);
      
      if (!groupLoan) {
        throw new Error(`Group loan with ID '${groupLoanId}' not found`);
      }

      console.log('Found group loan:', groupLoan.loanId, 'Current status:', groupLoan.status);

      // ✅ FIX: Check if already approved - handle gracefully
      if (groupLoan.status === 'approved') {
        console.log(`✅ Group loan ${groupLoan.loanId} is already approved - updating timestamps only`);
        
        // Update timestamps and notes without changing status
        groupLoan.approvedAt = new Date();
        groupLoan.approvedBy = safeUserId;
        groupLoan.approvalNotes = safeToString(approvalNotes, '');
        groupLoan.lastUpdatedBy = safeUserId;
        groupLoan.updatedAt = new Date();
        
        // ✅ FIX: Use $set to avoid triggering status validation
        await GroupLoan.updateOne(
          { _id: groupLoan._id },
          { 
            $set: {
              approvedAt: new Date(),
              approvedBy: safeUserId,
              approvalNotes: safeToString(approvalNotes, ''),
              lastUpdatedBy: safeUserId,
              updatedAt: new Date()
            }
          },
          { session }
        );

        // Log audit trail for the update
        await logAuditTrail(
          'GroupLoan',
          groupLoan._id.toString(),
          safeUserId,
          'APPROVE_UPDATE',
          { previousStatus: 'approved' },
          {
            status: 'approved',
            approvedAt: new Date(),
            approvedBy: safeUserId,
            approvalNotes: safeToString(approvalNotes, ''),
            memberCount: groupLoan.memberCount,
            totalAmount: groupLoan.totalAmount
          },
          req.ip,
          'GROUP_LOAN_APPROVAL_UPDATE'
        );

        console.log('✅ Group loan approval details updated successfully:', groupLoan.loanId);
        return; // Exit early
      }

      // Check if already disbursed
      if (groupLoan.status === 'disbursed' || groupLoan.status === 'partially_disbursed') {
        throw new Error(`Group loan ${groupLoan.loanId} has already been disbursed`);
      }

      // Check if rejected (cannot approve a rejected loan)
      if (groupLoan.status === 'rejected') {
        throw new Error(`Group loan ${groupLoan.loanId} cannot be approved because it has been rejected`);
      }

      // Store the original status
      const originalStatus = groupLoan.status;

      // ✅ FIX: Temporarily disable status validation for this save operation
      groupLoan._skipStatusValidation = true;

      // Update status to approved
      groupLoan.status = 'approved';
      groupLoan.approvedAt = new Date();
      groupLoan.approvedBy = safeUserId;
      groupLoan.approvalNotes = safeToString(approvalNotes, '');
      groupLoan.lastUpdatedBy = safeUserId;
      
      await groupLoan.save({ session });

      // Also update individual loan accounts
      await LoanAccount.updateMany(
        { groupLoan: groupLoan._id },
        {
          LOAN_STATUS: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: safeUserId
        },
        { session }
      );

      // Log audit trail
      await logAuditTrail(
        'GroupLoan',
        groupLoan._id.toString(),
        safeUserId,
        'APPROVE',
        { previousStatus: originalStatus },
        {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: safeUserId,
          approvalNotes: safeToString(approvalNotes, ''),
          memberCount: groupLoan.memberCount,
          totalAmount: groupLoan.totalAmount
        },
        req.ip,
        'GROUP_LOAN_APPROVAL'
      );

      console.log('✅ Group loan approved successfully:', groupLoan.loanId);
    });

    // Find the updated group loan
    const groupLoan = await GroupLoan.findOne({ loanId: req.params.id });

    res.status(200).json({
      success: true,
      message: `Group loan ${groupLoan.loanId} approved successfully`,
      data: {
        groupLoanId: groupLoan.loanId,
        status: groupLoan.status,
        approvedAt: groupLoan.approvedAt,
        approvedBy: groupLoan.approvedBy,
        approvalNotes: groupLoan.approvalNotes,
        memberCount: groupLoan.memberCount,
        totalAmount: groupLoan.totalAmount
      }
    });

  } catch (error) {
    console.error('❌ Group loan approval failed:', error);
   
    let statusCode = 500;
    if (error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('already') || error.message.includes('cannot be approved')) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Approval failed'
    });
  } finally {
    await session.endSession();
  }
});
///////////////////////////////////////////////////////////////////////
/// Reject LoanApplication
//////////////////////////////////////////////////////////////////////
// Add this to your GroupController.js
export const rejectGroupLoan = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
 
  try {
    await session.withTransaction(async () => {
      const { groupLoanId } = req.params;
      const { rejectionReason } = req.body; // Get rejection reason from request body
     
      console.log('=== REJECTING GROUP LOAN ===');
      console.log('Group Loan ID:', groupLoanId, 'Reason:', rejectionReason);
      // SAFE UTILITY FUNCTIONS
      const safeToString = (value, defaultValue = '') => {
        if (value === null || value === undefined) return defaultValue;
        if (typeof value === 'string') return value.trim();
        if (typeof value.toString === 'function') {
          try {
            return value.toString().trim();
          } catch (error) {
            return defaultValue;
          }
        }
        return String(value || defaultValue).trim();
      };
      // SAFE OBJECTID CHECK
      const isValidObjectId = (id) => {
        return mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);
      };
      // Build query
      const query = { loanId: groupLoanId };
      if (isValidObjectId(groupLoanId)) {
        query.$or = [
          { loanId: groupLoanId },
          { _id: new mongoose.Types.ObjectId(groupLoanId) }
        ];
      }
      const groupLoan = await GroupLoan.findOne(query).session(session);
      if (!groupLoan) {
        throw new Error(`Group loan with ID '${groupLoanId}' not found`);
      }
      console.log('Found group loan:', groupLoan.loanId, 'Current status:', groupLoan.status);
      // Check if already rejected
      if (groupLoan.status === 'rejected') {
        throw new Error(`Group loan ${groupLoan.loanId} is already rejected`);
      }
      // Check if already disbursed (cannot reject after disbursement)
      if (groupLoan.status === 'disbursed' || groupLoan.status === 'partially_disbursed') {
        throw new Error(`Group loan ${groupLoan.loanId} cannot be rejected because it has already been disbursed`);
      }
      // Check if already approved (can reject approved loans before disbursement)
      if (groupLoan.status === 'approved') {
        console.log('Rejecting previously approved loan:', groupLoan.loanId);
      }
      // Validate rejection reason
      const safeRejectionReason = safeToString(rejectionReason, 'No reason provided');
      if (!safeRejectionReason || safeRejectionReason === 'No reason provided') {
        console.warn('⚠️ No rejection reason provided');
      }
      // Update status to rejected
      groupLoan.status = 'rejected';
      groupLoan.rejectedAt = new Date();
      groupLoan.rejectedBy = req.user.id;
      groupLoan.rejectionReason = safeRejectionReason;
      groupLoan.lastUpdatedBy = req.user.id;
      await groupLoan.save({ session });
      // Also update individual loan accounts to rejected status
      await LoanAccount.updateMany(
        { groupLoan: groupLoan._id },
        {
          LOAN_STATUS: 'REJECTED',
          rejectedAt: new Date(),
          rejectedBy: req.user.id,
          rejectionReason: safeRejectionReason
        },
        { session }
      );
      // Log audit trail
      await logAuditTrail(
        'GroupLoan',
        groupLoan._id.toString(),
        req.user.id,
        'REJECT',
        { previousStatus: groupLoan.status },
        {
          status: 'rejected',
          rejectedAt: new Date(),
          rejectedBy: req.user.id,
          rejectionReason: safeRejectionReason,
          memberCount: groupLoan.memberCount,
          totalAmount: groupLoan.totalAmount
        },
        req.ip,
        'GROUP_LOAN_REJECTION'
      );
      console.log('✅ Group loan rejected successfully:', groupLoan.loanId);
    });
    const groupLoan = await GroupLoan.findOne({ loanId: req.params.groupLoanId });
   
    res.status(200).json({
      success: true,
      message: `Group loan ${groupLoan.loanId} rejected successfully`,
      data: {
        groupLoanId: groupLoan.loanId,
        status: groupLoan.status,
        rejectedAt: groupLoan.rejectedAt,
        rejectedBy: groupLoan.rejectedBy,
        rejectionReason: groupLoan.rejectionReason,
        memberCount: groupLoan.memberCount,
        totalAmount: groupLoan.totalAmount
      }
    });
  } catch (error) {
    console.error('❌ Group loan rejection failed:', error);
   
    let statusCode = 500;
    if (error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('already') || error.message.includes('cannot be rejected')) {
      statusCode = 400;
    }
    res.status(statusCode).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Rejection failed'
    });
  } finally {
    await session.endSession();
  }
});


///////////////////////////////////////////////////////////////////////
/// Get Approved Credit Applications - FIXED
//////////////////////////////////////////////////////////////////////

export const getApprovedCreditApplications = asyncHandler(async (req, res) => {
  try {
    // ✅ LOCAL SAFE UTILITY FUNCTIONS
    const safeToString = (value, defaultValue = '') => {
      if (value === null || value === undefined) return defaultValue;
      if (typeof value === 'string') return value.trim();
      if (typeof value.toString === 'function') {
        try {
          return value.toString().trim();
        } catch (error) {
          return defaultValue;
        }
      }
      return String(value || defaultValue).trim();
    };

    const safeNumber = (value, defaultValue = 0) => {
      if (value === null || value === undefined) return defaultValue;
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    const {
      page = 1,
      limit = 10,
      groupCode,
      branchId,
      primaryRM,
      sortBy = 'approvedAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter for approved credit applications
    const filter = {
      status: 'approved'
    };

    // Optional filters
    if (groupCode) {
      filter.groupCode = { $regex: safeToString(groupCode), $options: 'i' };
    }
    if (branchId) {
      filter.branch = safeNumber(branchId);
    }
    if (primaryRM) {
      filter.primaryRelationshipManager = { $regex: safeToString(primaryRM), $options: 'i' };
    }

    // Pagination and sorting
    const pageNum = safeNumber(page, 1);
    const limitNum = safeNumber(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = { approvedAt: -1 }; // Default sort by approval date
    if (sortBy === 'totalAmount') sortOptions.totalAmount = sortOrder === 'desc' ? -1 : 1;
    if (sortBy === 'groupName') sortOptions.groupName = sortOrder === 'desc' ? -1 : 1;
    if (sortBy === 'applicationDate') sortOptions.applicationDate = sortOrder === 'desc' ? -1 : 1;

    console.log('Fetching approved applications with filter:', {
      filter,
      skip,
      limit: limitNum,
      sort: sortOptions
    });

    // ✅ FIX: Fetch approved applications without problematic population
    const approvedApplications = await GroupLoan.find(filter)
      .populate('group', 'groupName groupCode members branch')
      // ✅ FIX: Remove population of user fields that contain numeric IDs
      // .populate('approvedBy', 'name email employeeId') // Removed due to numeric ID
      // .populate('createdBy', 'name email employeeId') // Removed due to numeric ID
      .populate({
        path: 'individualLoanAccounts',
        select: 'ACCT_NO ACCT_NM CUST_ID LOAN_STATUS DISBURSEMENT_LIMIT OUTSTANDING_PRINCIPAL'
      })
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count for pagination
    const totalCount = await GroupLoan.countDocuments(filter);

    // ✅ FIX: Enhanced each application with safe data access
    const enhancedApplications = approvedApplications.map(app => {
      const totalMembers = app.memberCount || (app.members ? app.members.length : 0);
      
      const memberNames = app.members && app.members.length > 0 
        ? app.members.slice(0, 3).map(member => member.name || `Member ${member.memberId}`)
        : [];

      const totalFees = app.feeSummary?.totalFees || 0;
      const netDisbursement = app.netDisbursementAmount || 0;
      const totalRepayable = app.totalRepayable || 0;

      // Calculate days since approval
      const approvalDate = app.approvedAt || new Date();
      const daysSinceApproval = Math.floor((new Date() - new Date(approvalDate)) / (1000 * 60 * 60 * 24));

      // ✅ FIX: Safe user ID handling
      const getSafeUserId = (userId) => {
        if (!userId) return null;
        if (typeof userId === 'object' && userId._id) return userId._id; // If already populated object
        return userId; // Return as is (could be ObjectId, string, or number)
      };

      return {
        _id: app._id,
        loanId: app.loanId,
        groupCode: app.groupCode,
        groupName: app.groupName,
        group: app.group,
        totalAmount: app.totalAmount,
        status: app.status,
        applicationDate: app.applicationDate,
        approvedAt: app.approvedAt,
        approvedBy: getSafeUserId(app.approvedBy), // Safe user ID
        approvalNotes: app.approvalNotes,
        primaryRelationshipManager: app.primaryRelationshipManager,
        secondaryRelationshipManager: app.secondaryRelationshipManager,
        loanPurpose: app.loanPurpose,
        interestRate: app.interestRate,
        individualLoanAccounts: app.individualLoanAccounts,
        summary: {
          totalAmount: app.totalAmount,
          totalMembers,
          memberPreview: memberNames.join(', ') + (totalMembers > 3 ? ` and ${totalMembers - 3} more` : ''),
          daysSinceApproval,
          financialSummary: {
            totalFees,
            netDisbursement,
            totalRepayable
          },
          readyForDisbursement: app.status === 'approved' && !app.disbursedAt
        }
      };
    });

    res.status(200).json({
      success: true,
      message: `Found ${totalCount} approved credit applications`,
      data: enhancedApplications,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount,
        hasNext: skip + enhancedApplications.length < totalCount,
        hasPrev: pageNum > 1
      },
      filters: {
        applied: { groupCode, branchId, primaryRM, status: 'approved' }
      }
    });

  } catch (error) {
    console.error('Error fetching approved credit applications:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch approved credit applications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

///////////////////////////////////////////////////////////////////////
/// Get Rejected Credit Applications - FIXED
//////////////////////////////////////////////////////////////////////

export const getRejectedCreditApplications = asyncHandler(async (req, res) => {
  try {
    // ✅ LOCAL SAFE UTILITY FUNCTIONS
    const safeToString = (value, defaultValue = '') => {
      if (value === null || value === undefined) return defaultValue;
      if (typeof value === 'string') return value.trim();
      if (typeof value.toString === 'function') {
        try {
          return value.toString().trim();
        } catch (error) {
          return defaultValue;
        }
      }
      return String(value || defaultValue).trim();
    };

    const safeNumber = (value, defaultValue = 0) => {
      if (value === null || value === undefined) return defaultValue;
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    const {
      page = 1,
      limit = 10,
      groupCode,
      branchId,
      primaryRM,
      sortBy = 'rejectedAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter for rejected credit applications
    const filter = {
      status: 'rejected'
    };

    // Optional filters
    if (groupCode) {
      filter.groupCode = { $regex: safeToString(groupCode), $options: 'i' };
    }
    if (branchId) {
      filter.branch = safeNumber(branchId);
    }
    if (primaryRM) {
      filter.primaryRelationshipManager = { $regex: safeToString(primaryRM), $options: 'i' };
    }

    // Pagination and sorting
    const pageNum = safeNumber(page, 1);
    const limitNum = safeNumber(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = { rejectedAt: -1 }; // Default sort by rejection date
    if (sortBy === 'totalAmount') sortOptions.totalAmount = sortOrder === 'desc' ? -1 : 1;
    if (sortBy === 'groupName') sortOptions.groupName = sortOrder === 'desc' ? -1 : 1;
    if (sortBy === 'applicationDate') sortOptions.applicationDate = sortOrder === 'desc' ? -1 : 1;

    console.log('Fetching rejected applications with filter:', {
      filter,
      skip,
      limit: limitNum,
      sort: sortOptions
    });

    // ✅ FIX: Fetch rejected applications without problematic population
    const rejectedApplications = await GroupLoan.find(filter)
      .populate('group', 'groupName groupCode members branch')
      // ✅ FIX: Remove population of user fields that contain numeric IDs
      // .populate('rejectedBy', 'name email employeeId') // Removed due to numeric ID
      // .populate('createdBy', 'name email employeeId') // Removed due to numeric ID
      .populate({
        path: 'individualLoanAccounts',
        select: 'ACCT_NO ACCT_NM CUST_ID LOAN_STATUS DISBURSEMENT_LIMIT'
      })
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count for pagination
    const totalCount = await GroupLoan.countDocuments(filter);

    // ✅ FIX: Enhanced each application with safe data access
    const enhancedApplications = rejectedApplications.map(app => {
      const totalMembers = app.memberCount || (app.members ? app.members.length : 0);
      
      const memberNames = app.members && app.members.length > 0 
        ? app.members.slice(0, 3).map(member => member.name || `Member ${member.memberId}`)
        : [];

      // Calculate days since rejection
      const rejectionDate = app.rejectedAt || new Date();
      const daysSinceRejection = Math.floor((new Date() - new Date(rejectionDate)) / (1000 * 60 * 60 * 24));

      // ✅ FIX: Safe user ID handling
      const getSafeUserId = (userId) => {
        if (!userId) return null;
        if (typeof userId === 'object' && userId._id) return userId._id; // If already populated object
        return userId; // Return as is (could be ObjectId, string, or number)
      };

      return {
        _id: app._id,
        loanId: app.loanId,
        groupCode: app.groupCode,
        groupName: app.groupName,
        group: app.group,
        totalAmount: app.totalAmount,
        status: app.status,
        applicationDate: app.applicationDate,
        rejectedAt: app.rejectedAt,
        rejectedBy: getSafeUserId(app.rejectedBy), // Safe user ID
        rejectionReason: app.rejectionReason,
        primaryRelationshipManager: app.primaryRelationshipManager,
        secondaryRelationshipManager: app.secondaryRelationshipManager,
        loanPurpose: app.loanPurpose,
        interestRate: app.interestRate,
        individualLoanAccounts: app.individualLoanAccounts,
        summary: {
          totalAmount: app.totalAmount,
          totalMembers,
          memberPreview: memberNames.join(', ') + (totalMembers > 3 ? ` and ${totalMembers - 3} more` : ''),
          daysSinceRejection,
          rejectionReason: app.rejectionReason || 'No reason provided'
        }
      };
    });

    res.status(200).json({
      success: true,
      message: `Found ${totalCount} rejected credit applications`,
      data: enhancedApplications,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount,
        hasNext: skip + enhancedApplications.length < totalCount,
        hasPrev: pageNum > 1
      },
      filters: {
        applied: { groupCode, branchId, primaryRM, status: 'rejected' }
      }
    });

  } catch (error) {
    console.error('Error fetching rejected credit applications:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rejected credit applications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});


// Updated disburseGroupLoan function
// Updated disburseGroupLoan controller with ObjectId validation fix
export const disburseGroupLoan = asyncHandler(async (req, res) => {
  // IMMEDIATE PARAMETER VALIDATION
  console.log('=== REQUEST DEBUG INFO ===');
  console.log('req.params:', req.params);
 
  let groupLoanId = req.params.groupLoanId;
 
  if (!groupLoanId || groupLoanId === 'undefined') {
    groupLoanId = req.params.id || req.params.loanId || req.params.groupLoanId;
  }
 
  if (!groupLoanId || groupLoanId === 'undefined') {
    return res.status(400).json({
      success: false,
      message: 'Group loan ID is required'
    });
  }

  // ✅ FIX: Validate if groupLoanId can be an ObjectId before including in query
  const isValidObjectId = mongoose.Types.ObjectId.isValid(groupLoanId);
  const query = isValidObjectId
    ? { $or: [{ loanId: groupLoanId }, { _id: groupLoanId }] }
    : { loanId: groupLoanId };

  const session = await mongoose.startSession();
  let disbursementResults = {
    successful: [],
    failed: [],
    feesCollected: [],
    insuranceActivated: [],
    insufficientFunds: [],
    skipped: [],
    validationErrors: []
  };
  try {
    await session.withTransaction(async () => {
      console.log('=== STARTING GROUP LOAN DISBURSEMENT ===');
      console.log('Group Loan ID:', groupLoanId);
      console.log('Query used:', JSON.stringify(query, null, 2)); // Debug log for query
     
      // SAFE UTILITY FUNCTIONS
      const safeToString = (value, defaultValue = '') => {
        if (value === null || value === undefined) return defaultValue;
        if (typeof value === 'string') return value.trim();
        return String(value || defaultValue).trim();
      };
      const safeNumber = (value, defaultValue = 0) => {
        if (value === null || value === undefined) return defaultValue;
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
      };
      // Find group loan - UPDATED QUERY WITH OBJECTID VALIDATION
      let groupLoan = await GroupLoan.findOne(query)
      .populate('group', 'branch groupCode groupName')
      .populate('individualLoanAccounts')
      .session(session);
      if (!groupLoan) {
        throw new Error(`Group loan with ID '${groupLoanId}' not found`);
      }
      console.log('✅ Found group loan:', groupLoan.loanId, 'Status:', groupLoan.status);
      // Status checks
      if (groupLoan.status === 'disbursed' || groupLoan.status === 'partially_disbursed') {
        throw new Error(`Group loan ${groupLoan.loanId} has already been ${groupLoan.status}`);
      }
      if (groupLoan.status !== 'approved') {
        throw new Error(`Group loan ${groupLoan.loanId} must be approved before disbursement. Current status: ${groupLoan.status}`);
      }
      const branchId = safeNumber(groupLoan.group?.branch, 1);
      const startDate = new Date();
      // Get individual loan accounts
      const individualAccounts = await LoanAccount.find({
        groupLoan: groupLoan._id,
        LOAN_STATUS: { $in: ['PENDING', 'APPROVED', 'APPROVED_PENDING_DISBURSAL'] }
      }).session(session);
      if (!individualAccounts || individualAccounts.length === 0) {
        throw new Error('No individual loan accounts found for this group loan');
      }
      console.log(`Found ${individualAccounts.length} individual loan accounts for disbursement`);
      let totalDisbursed = 0;
      let totalFeesCollected = 0;
      // ENHANCED VALIDATION WITH SAVINGS ACCOUNT INFO
      console.log('=== STARTING ENHANCED VALIDATION ===');
     
      for (const loanAccount of individualAccounts) {
        try {
          const loanAmount = safeNumber(loanAccount.DISBURSEMENT_LIMIT, 0);
          const custId = safeToString(loanAccount.CUST_ID);
          const accountName = safeToString(loanAccount.ACCT_NM, 'Unknown Customer');
          const loanAccountNumber = safeToString(loanAccount.ACCT_NO);
          const savingsAccountNo = safeToString(loanAccount.savingsAccountNo); // NEW: Get savings account from loan account
          console.log(`\n🔍 Validating: ${accountName} (CUST_ID: ${custId}, Loan Acc: ${loanAccountNumber}, Savings Acc: ${savingsAccountNo})`);
          // Basic validations
          if (loanAmount <= 0) {
            disbursementResults.validationErrors.push({
              custId: custId,
              name: accountName,
              loanAccountNumber: loanAccountNumber,
              reason: 'Invalid loan amount'
            });
            continue;
          }
          if (!custId) {
            disbursementResults.validationErrors.push({
              custId: custId,
              name: accountName,
              loanAccountNumber: loanAccountNumber,
              reason: 'Missing customer ID'
            });
            continue;
          }
          // ENHANCED CUSTOMER ACCOUNT SEARCH USING SAVINGS ACCOUNT NUMBER
          let customerAccount = null;
          let searchLog = [];
          // Strategy 1: Use savings account number from loan account
          if (savingsAccountNo) {
            customerAccount = await CustomerAccount.findOne({
              account_number: savingsAccountNo,
              account_type: 'SAVINGS'
            }).session(session);
            if (customerAccount) {
              searchLog.push(`Found with savings account number: ${savingsAccountNo}`);
              console.log(`✅ Found account with savings account number: ${customerAccount.account_number}`);
            }
          }
          // Strategy 2: Exact CUST_ID match with SAVINGS account type
          if (!customerAccount) {
            customerAccount = await CustomerAccount.findOne({
              CUST_ID: custId,
              account_type: 'SAVINGS'
            }).session(session);
            if (customerAccount) {
              searchLog.push(`Found with CUST_ID + SAVINGS account: ${custId}`);
              console.log(`✅ Found account with CUST_ID: ${customerAccount.account_number}`);
            }
          }
          // Strategy 3: Exact CUST_ID match (any account type)
          if (!customerAccount) {
            customerAccount = await CustomerAccount.findOne({ CUST_ID: custId }).session(session);
            if (customerAccount) {
              searchLog.push(`Found with CUST_ID only: ${custId} (type: ${customerAccount.account_type})`);
              console.log(`✅ Found account with CUST_ID: ${customerAccount.account_number}`);
            }
          }
          // If still no account found
          if (!customerAccount) {
            console.error(`❌ NO CUSTOMER ACCOUNT FOUND for CUST_ID: ${custId}, Savings Account: ${savingsAccountNo}`);
            console.error('Search strategies attempted:', searchLog);
           
            disbursementResults.validationErrors.push({
              custId: custId,
              name: accountName,
              loanAccountNumber: loanAccountNumber,
              savingsAccountNo: savingsAccountNo,
              reason: 'Customer savings account not found',
              searchStrategies: searchLog,
              troubleshooting: [
                `Check if savings account '${savingsAccountNo}' exists for customer ${custId}`,
                'Verify account_type is set to SAVINGS',
                'Ensure customer has an active savings account'
              ]
            });
            continue;
          }
          console.log(`✅ Customer account found: ${customerAccount.account_number} (Type: ${customerAccount.account_type})`);
          // FEE VALIDATION
          const feeDetails = loanAccount.FEE_DETAILS || {};
          const totalFees = safeNumber(feeDetails.processingFee, 0) +
                           safeNumber(feeDetails.adminFee, 0) +
                           safeNumber(feeDetails.insuranceFee, 0) +
                           safeNumber(feeDetails.otherFees, 0) +
                           safeNumber(feeDetails.upfrontInterest, 0);
          const availableBalance = safeNumber(customerAccount.AVAILABLE_BALANCE, safeNumber(customerAccount.ledger_balance, 0));
          console.log(`💰 Fee check for ${custId}: Total Fees = ${totalFees}, Available Balance = ${availableBalance}`);
          if (totalFees > 0 && availableBalance < totalFees) {
            disbursementResults.insufficientFunds.push({
              custId: custId,
              name: accountName,
              loanAccountNumber: loanAccountNumber,
              savingsAccountNo: customerAccount.account_number,
              requiredFees: totalFees,
              availableBalance: availableBalance,
              shortfall: totalFees - availableBalance,
              customerAccount: customerAccount.account_number,
              reason: 'Insufficient funds for fee payment'
            });
          } else {
            console.log(`✅ Sufficient funds for ${custId}`);
          }
        } catch (validationError) {
          console.error(`Validation error:`, validationError);
          disbursementResults.validationErrors.push({
            custId: safeToString(loanAccount.CUST_ID),
            name: safeToString(loanAccount.ACCT_NM, 'Unknown'),
            loanAccountNumber: safeToString(loanAccount.ACCT_NO),
            reason: `Validation error: ${validationError.message}`
          });
        }
      }
      // VALIDATION SUMMARY
      console.log('\n=== VALIDATION SUMMARY ===');
      console.log(`Total accounts: ${individualAccounts.length}`);
      console.log(`Validation errors: ${disbursementResults.validationErrors.length}`);
      console.log(`Insufficient funds: ${disbursementResults.insufficientFunds.length}`);
      console.log(`Ready for disbursement: ${individualAccounts.length - disbursementResults.validationErrors.length - disbursementResults.insufficientFunds.length}`);
      // If validation fails, throw detailed error
      if (disbursementResults.validationErrors.length > 0 || disbursementResults.insufficientFunds.length > 0) {
        const error = new Error('Pre-disbursement validation failed');
        error.validationDetails = {
          validationErrors: disbursementResults.validationErrors,
          insufficientFunds: disbursementResults.insufficientFunds,
          totalAccounts: individualAccounts.length,
          validAccounts: individualAccounts.length - disbursementResults.validationErrors.length - disbursementResults.insufficientFunds.length
        };
        throw error;
      }
      console.log('✅ All accounts validated successfully');
      // PROCESS DISBURSEMENT FOR EACH ACCOUNT
      for (const loanAccount of individualAccounts) {
        const memberSession = await mongoose.startSession();
      
        try {
          await memberSession.withTransaction(async () => {
            const custId = safeToString(loanAccount.CUST_ID);
            const accountName = safeToString(loanAccount.ACCT_NM, 'Unknown Customer');
            const loanAmount = safeNumber(loanAccount.DISBURSEMENT_LIMIT, 0);
            const loanAccountNumber = safeToString(loanAccount.ACCT_NO);
            const savingsAccountNo = safeToString(loanAccount.savingsAccountNo);
            console.log(`🚀 Processing disbursement for: ${custId} - ${accountName}, Savings Account: ${savingsAccountNo}`);
            // Skip if already active
            if (loanAccount.LOAN_STATUS === 'ACTIVE') {
              disbursementResults.skipped.push({
                custId: custId,
                name: accountName,
                loanAccountNumber: loanAccountNumber,
                reason: 'Loan already active'
              });
              return;
            }
            // GET CUSTOMER ACCOUNT USING SAVINGS ACCOUNT NUMBER
            const customerAccount = await CustomerAccount.findOne({
              account_number: savingsAccountNo
            }).session(memberSession);
            if (!customerAccount) {
              throw new Error(`Customer savings account not found: ${savingsAccountNo}`);
            }
            // FEE CALCULATION
            const feeDetails = loanAccount.FEE_DETAILS || {};
            const processingFee = safeNumber(feeDetails.processingFee, 0);
            const adminFee = safeNumber(feeDetails.adminFee, 0);
            const insuranceFee = safeNumber(feeDetails.insuranceFee, 0);
            const otherFees = safeNumber(feeDetails.otherFees, 0);
            const upfrontInterest = safeNumber(feeDetails.upfrontInterest, 0);
          
            const totalFees = processingFee + adminFee + insuranceFee + otherFees + upfrontInterest;
            // STEP 1: DEBIT FEES FROM CUSTOMER ACCOUNT
            if (totalFees > 0) {
              try {
                console.log(`💰 Debiting fees: ${totalFees} from ${custId} (Account: ${customerAccount.account_number})`);
                await debitFeesFromCustomerAccount(loanAccount, customerAccount, req.user.id, memberSession, branchId);
                totalFeesCollected += totalFees;
                disbursementResults.feesCollected.push({
                  custId: custId,
                  name: accountName,
                  loanAccountNumber: loanAccountNumber,
                  totalFees: totalFees,
                  accountDebited: safeToString(customerAccount.account_number),
                  transactionType: 'FEE_COLLECTION'
                });
                console.log(`✅ Fees collected successfully from ${custId}`);
              } catch (feeError) {
                console.error(`❌ Fee collection failed for ${custId}:`, feeError);
                throw new Error(`Fee collection failed: ${feeError.message}`);
              }
            }
            // STEP 2: ACTIVATE INSURANCE
            if (loanAccount.insuranceDetails && typeof activateInsurance === 'function') {
              try {
                console.log(`🛡️ Activating insurance for ${custId}`);
                await activateInsurance(loanAccount, req.user.id, memberSession);
                disbursementResults.insuranceActivated.push({
                  custId: custId,
                  name: accountName,
                  loanAccountNumber: loanAccountNumber,
                  premium: safeNumber(loanAccount.insuranceDetails.premiumAmount, 0)
                });
                console.log(`✅ Insurance activated for ${custId}`);
              } catch (insuranceError) {
                console.warn(`⚠️ Insurance activation failed for ${custId}:`, insuranceError);
                // Continue with disbursement even if insurance fails
              }
            }
            // STEP 3: DISBURSE FULL LOAN AMOUNT TO CUSTOMER SAVINGS ACCOUNT
            try {
              console.log(`💸 Disbursing loan amount: ${loanAmount} to ${custId} (Account: ${customerAccount.account_number})`);
              await disburseFullAmount(loanAccount, customerAccount, req.user.id, memberSession, branchId);
              console.log(`✅ Loan disbursed successfully to ${custId}`);
            } catch (disbursementError) {
              console.error(`❌ Loan disbursement failed for ${custId}:`, disbursementError);
              throw new Error(`Loan disbursement failed: ${disbursementError.message}`);
            }
            // STEP 4: UPDATE LOAN ACCOUNT STATUS
            loanAccount.ACTUAL_DISBURSEMENT = loanAmount;
            loanAccount.LOAN_STATUS = 'ACTIVE';
            loanAccount.START_DT = startDate;
            loanAccount.disbursedAt = startDate;
            loanAccount.netDisbursementAmount = loanAmount;
            loanAccount.totalDeductions = totalFees;
            if (loanAccount.FEE_DETAILS) {
              loanAccount.FEE_DETAILS.feesCollected = true;
              loanAccount.FEE_DETAILS.collectionDate = startDate;
              loanAccount.FEE_DETAILS.collectionMethod = 'CUSTOMER_ACCOUNT_DEBIT';
              loanAccount.FEE_DETAILS.collectedBy = req.user.id;
            }
            if (loanAccount.insuranceDetails) {
              loanAccount.insuranceDetails.premiumCollected = true;
              loanAccount.insuranceDetails.policyActive = true;
              loanAccount.insuranceDetails.collectionDate = startDate;
            }
            await loanAccount.save({ session: memberSession });
          
            totalDisbursed += loanAmount;
            disbursementResults.successful.push({
              custId: custId,
              name: accountName,
              loanAccountId: loanAccount._id,
              loanAccountNumber: loanAccountNumber,
              loanAmount: loanAmount,
              feesPaid: totalFees,
              netReceived: loanAmount,
              savingsAccountNo: savingsAccountNo,
              customerAccount: safeToString(customerAccount.account_number),
              disbursementDate: startDate,
              transactionReferences: {
                feeTransaction: `FEE_${Date.now()}_${custId}`,
                disbursementTransaction: `DISB_${Date.now()}_${custId}`
              },
              note: `Full loan amount disbursed to savings account. Fees debited from customer account.`
            });
            console.log(`🎉 Successfully completed disbursement for member ${custId}`);
          });
        } catch (memberError) {
          console.error(`💥 Error disbursing to member ${loanAccount.CUST_ID}:`, memberError);
          disbursementResults.failed.push({
            custId: safeToString(loanAccount.CUST_ID),
            name: safeToString(loanAccount.ACCT_NM, 'Unknown'),
            loanAccountId: loanAccount._id,
            loanAccountNumber: safeToString(loanAccount.ACCT_NO),
            savingsAccountNo: safeToString(loanAccount.savingsAccountNo),
            reason: memberError.message,
            errorDetails: process.env.NODE_ENV === 'development' ? memberError.stack : undefined
          });
        } finally {
          await memberSession.endSession();
        }
      }
      // Determine group loan status based on results
      let groupLoanStatus = 'disbursed';
      if (disbursementResults.failed.length > 0 && disbursementResults.successful.length > 0) {
        groupLoanStatus = 'partially_disbursed';
      } else if (disbursementResults.successful.length === 0) {
        groupLoanStatus = 'approved'; // Revert to approved if all failed
      }
      // Update group loan status and financials
      groupLoan.status = groupLoanStatus;
      groupLoan.disbursedAt = startDate;
      groupLoan.actualDisbursementDate = startDate;
      groupLoan.feesCollected = disbursementResults.feesCollected.length > 0;
      groupLoan.lastUpdatedBy = req.user.id;
      groupLoan.netDisbursementAmount = totalDisbursed;
    
      // Update disbursed members tracking
      groupLoan.disbursedToMembers = individualAccounts
        .filter(acc => disbursementResults.successful.some(s => s.loanAccountId.toString() === acc._id.toString()))
        .map(acc => acc._id);
      // Store disbursement results summary
      groupLoan.disbursementResults = {
        summary: {
          totalMembers: individualAccounts.length,
          successful: disbursementResults.successful.length,
          failed: disbursementResults.failed.length,
          insufficientFunds: disbursementResults.insufficientFunds.length,
          skipped: disbursementResults.skipped.length,
          validationErrors: disbursementResults.validationErrors.length,
          totalDisbursed: totalDisbursed,
          totalFeesCollected: totalFeesCollected,
          disbursementDate: startDate,
          processedBy: req.user.id,
          disbursementMethod: 'FULL_AMOUNT_WITH_SEPARATE_FEE_DEBIT'
        },
        details: disbursementResults
      };
      await groupLoan.save({ session });
      // Log comprehensive disbursement audit trail
      await logAuditTrail(
        'GroupLoan',
        groupLoan._id.toString(),
        req.user.id,
        'DISBURSE_WITH_FEES',
        { previousStatus: 'approved' },
        {
          status: groupLoan.status,
          successful: disbursementResults.successful.length,
          failed: disbursementResults.failed.length,
          insufficientFunds: disbursementResults.insufficientFunds.length,
          feesCollected: disbursementResults.feesCollected.length,
          insuranceActivated: disbursementResults.insuranceActivated.length,
          skipped: disbursementResults.skipped.length,
          totalFees: totalFeesCollected,
          totalDisbursed: totalDisbursed,
          netDisbursement: totalDisbursed,
          disbursementMethod: 'FULL_AMOUNT_WITH_SEPARATE_FEE_DEBIT'
        },
        req.ip,
        'GROUP_LOAN_DISBURSEMENT_WITH_ACCOUNT_DEBIT'
      );
      console.log('=== GROUP LOAN DISBURSEMENT COMPLETED ===');
      console.log('Summary:', {
        totalMembers: individualAccounts.length,
        successful: disbursementResults.successful.length,
        failed: disbursementResults.failed.length,
        totalDisbursed: totalDisbursed,
        totalFees: totalFeesCollected,
        disbursementMethod: 'FULL_AMOUNT_WITH_SEPARATE_FEE_DEBIT'
      });
    });
    // If we reach here, the transaction was successful
    // Re-fetch the group loan to get updated data
    const groupLoan = await GroupLoan.findOne({
      loanId: groupLoanId
    });
    let message = '';
    if (disbursementResults.failed.length === 0) {
      message = `Group loan ${groupLoan.loanId} fully disbursed to ${disbursementResults.successful.length} members successfully. Fees debited from customer savings accounts.`;
    } else if (disbursementResults.successful.length > 0) {
      message = `Group loan ${groupLoan.loanId} partially disbursed. ${disbursementResults.successful.length} successful, ${disbursementResults.failed.length} failed.`;
    } else {
      message = `Group loan ${groupLoan.loanId} disbursement failed for all members.`;
    }
    res.status(200).json({
      success: disbursementResults.successful.length > 0,
      message: message,
      data: {
        groupLoanId: groupLoan.loanId,
        groupLoanObjectId: groupLoan._id,
        groupLoanStatus: groupLoan.status,
        disbursementSummary: {
          totalMembers: disbursementResults.successful.length + disbursementResults.failed.length + disbursementResults.skipped.length,
          successful: disbursementResults.successful.length,
          failed: disbursementResults.failed.length,
          insufficientFunds: disbursementResults.insufficientFunds.length,
          skipped: disbursementResults.skipped.length,
          validationErrors: disbursementResults.validationErrors.length
        },
        financialBreakdown: {
          totalLoanAmount: safeNumber(groupLoan.totalAmount, 0),
          totalDisbursed: disbursementResults.successful.reduce((sum, s) => sum + s.loanAmount, 0),
          totalFeesCollected: disbursementResults.feesCollected.reduce((sum, f) => sum + f.totalFees, 0),
          netCustomerReceipt: disbursementResults.successful.reduce((sum, s) => sum + s.netReceived, 0),
          feesCollectionMethod: 'DEBIT_FROM_CUSTOMER_SAVINGS_ACCOUNTS',
          disbursementDate: new Date(),
          note: 'Full loan amounts disbursed to customer savings accounts. Fees debited separately from customer savings accounts.'
        },
        details: disbursementResults
      }
    });
  } catch (error) {
    console.error('❌ Group loan disbursement failed:', error);
  
    // Determine appropriate status code based on error type
    let statusCode = 500;
    let errorMessage = 'Group loan disbursement failed';
  
    if (error.message.includes('not found')) {
      statusCode = 404;
      errorMessage = error.message;
    } else if (error.message.includes('already been') || error.message.includes('must be approved')) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.message.includes('Pre-disbursement validation failed')) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.message.includes('Group loan ID is required')) {
      statusCode = 400;
      errorMessage = error.message;
    }
    // Enhanced error response with validation details
    const errorResponse = {
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error during disbursement',
    };
    // Include validation details if available
    if (error.validationDetails) {
      errorResponse.validationDetails = error.validationDetails;
    }
    // Include individual validation arrays
    if (disbursementResults.validationErrors.length > 0) {
      errorResponse.validationErrors = disbursementResults.validationErrors;
    }
    if (disbursementResults.insufficientFunds.length > 0) {
      errorResponse.insufficientFunds = disbursementResults.insufficientFunds;
    }
    res.status(statusCode).json(errorResponse);
  } finally {
    await session.endSession();
  }
});

// Helper function to debit fees from customer account
const debitFeesFromCustomerAccount = async (loanAccount, customerAccount, userId, session, branchId) => {
  try {
    console.log(`Starting fee debit for customer ${customerAccount.CUST_ID}, account ${customerAccount.account_number}`);
   
    // SAFE UTILITY FUNCTIONS
    const safeNumber = (value, defaultValue = 0) => {
      if (value === null || value === undefined) return defaultValue;
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };
    const safeToString = (value, defaultValue = '') => {
      if (value === null || value === undefined) return defaultValue;
      return String(value || defaultValue).trim();
    };
    // Get fee details safely
    const feeDetails = loanAccount.FEE_DETAILS || {};
    const processingFee = safeNumber(feeDetails.processingFee, 0);
    const adminFee = safeNumber(feeDetails.adminFee, 0);
    const insuranceFee = safeNumber(feeDetails.insuranceFee, 0);
    const otherFees = safeNumber(feeDetails.otherFees, 0);
    const upfrontInterest = safeNumber(feeDetails.upfrontInterest, 0);
   
    const totalFees = processingFee + adminFee + insuranceFee + otherFees + upfrontInterest;
    if (totalFees <= 0) {
      console.log('No fees to debit for customer:', customerAccount.CUST_ID);
      return { success: true, message: 'No fees to debit', totalFees: 0 };
    }
    // Get current balances safely
    const currentLedgerBalance = safeNumber(customerAccount.ledger_balance, 0);
    const currentAvailableBalance = safeNumber(customerAccount.AVAILABLE_BALANCE, currentLedgerBalance);
    // Validate sufficient balance for fees
    if (currentAvailableBalance < totalFees) {
      throw new Error(`Insufficient balance for fees. Required: ${totalFees}, Available: ${currentAvailableBalance}`);
    }
    // Calculate new balances
    const newLedgerBalance = currentLedgerBalance - totalFees;
    const newAvailableBalance = currentAvailableBalance - totalFees;
    // Create detailed fee transaction record
    const feeTransaction = new Transaction({
      transaction_type: 'DEBIT',
      amount: totalFees,
      currency: 'NGN',
      description: `Loan Processing Fees - ${loanAccount.ACCT_NO}`,
      reference: `FEE_${Date.now()}_${loanAccount.CUST_ID}`,
      status: 'completed',
      customer_account: customerAccount._id,
      loan_account: loanAccount._id,
      branch: branchId,
      created_by: userId,
      transaction_date: new Date(),
      balance_after: newLedgerBalance,
      metadata: {
        feeBreakdown: {
          processingFee: processingFee,
          adminFee: adminFee,
          insuranceFee: insuranceFee,
          otherFees: otherFees,
          upfrontInterest: upfrontInterest
        },
        loanAccountNumber: safeToString(loanAccount.ACCT_NO),
        customerAccountNumber: safeToString(customerAccount.account_number),
        transactionPurpose: 'LOAN_FEES_COLLECTION'
      }
    });
    await feeTransaction.save({ session });
    // Update customer account balance
    customerAccount.ledger_balance = newLedgerBalance;
    customerAccount.AVAILABLE_BALANCE = newAvailableBalance;
    customerAccount.last_activity_date = new Date();
    // Add transaction history
    if (!customerAccount.transaction_history) {
      customerAccount.transaction_history = [];
    }
   
    customerAccount.transaction_history.push({
      date: new Date(),
      type: 'DEBIT',
      amount: totalFees,
      description: `Loan fees for ${loanAccount.ACCT_NO}`,
      reference: feeTransaction.reference,
      balance_after: newLedgerBalance
    });
    await customerAccount.save({ session });
    console.log(`✅ Successfully debited fees: ₦${totalFees} from customer ${customerAccount.CUST_ID}`);
    console.log(` Previous balance: ₦${currentLedgerBalance}, New balance: ₦${newLedgerBalance}`);
    return {
      success: true,
      totalFees: totalFees,
      feeBreakdown: {
        processingFee: processingFee,
        adminFee: adminFee,
        insuranceFee: insuranceFee,
        otherFees: otherFees,
        upfrontInterest: upfrontInterest
      },
      previousBalance: currentLedgerBalance,
      newBalance: newLedgerBalance,
      transactionReference: feeTransaction.reference
    };
  } catch (error) {
    console.error(`❌ Failed to debit fees for customer ${customerAccount?.CUST_ID}:`, error);
    throw new Error(`Fee debit failed: ${error.message}`);
  }
};
// Helper function to disburse full loan amount to customer
const disburseFullAmount = async (loanAccount, customerAccount, userId, session, branchId) => {
  try {
    console.log(`Starting loan disbursement to customer ${customerAccount.CUST_ID}, account ${customerAccount.account_number}`);
   
    // SAFE UTILITY FUNCTIONS
    const safeNumber = (value, defaultValue = 0) => {
      if (value === null || value === undefined) return defaultValue;
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };
    const safeToString = (value, defaultValue = '') => {
      if (value === null || value === undefined) return defaultValue;
      return String(value || defaultValue).trim();
    };
    // Get loan amount safely
    const loanAmount = safeNumber(loanAccount.DISBURSEMENT_LIMIT, 0);
   
    if (loanAmount <= 0) {
      throw new Error(`Invalid loan amount: ${loanAmount}`);
    }
    // Get current balances safely
    const currentLedgerBalance = safeNumber(customerAccount.ledger_balance, 0);
    const currentAvailableBalance = safeNumber(customerAccount.AVAILABLE_BALANCE, currentLedgerBalance);
    // Calculate new balances
    const newLedgerBalance = currentLedgerBalance + loanAmount;
    const newAvailableBalance = currentAvailableBalance + loanAmount;
    // Create disbursement transaction record
    const disbursementTransaction = new Transaction({
      transaction_type: 'CREDIT',
      amount: loanAmount,
      currency: 'NGN',
      description: `Loan Disbursement - ${loanAccount.ACCT_NO}`,
      reference: `DISB_${Date.now()}_${loanAccount.CUST_ID}`,
      status: 'completed',
      customer_account: customerAccount._id,
      loan_account: loanAccount._id,
      branch: branchId,
      created_by: userId,
      transaction_date: new Date(),
      balance_after: newLedgerBalance,
      metadata: {
        loanAccountNumber: safeToString(loanAccount.ACCT_NO),
        customerAccountNumber: safeToString(customerAccount.account_number),
        loanPurpose: safeToString(loanAccount.loanPurpose, 'Not specified'),
        disbursementMethod: safeToString(loanAccount.disbursementMethod, 'CASH'),
        transactionPurpose: 'LOAN_DISBURSEMENT'
      }
    });
    await disbursementTransaction.save({ session });
    // Update customer account balance
    customerAccount.ledger_balance = newLedgerBalance;
    customerAccount.AVAILABLE_BALANCE = newAvailableBalance;
    customerAccount.last_activity_date = new Date();
    // Add transaction history
    if (!customerAccount.transaction_history) {
      customerAccount.transaction_history = [];
    }
   
    customerAccount.transaction_history.push({
      date: new Date(),
      type: 'CREDIT',
      amount: loanAmount,
      description: `Loan disbursement - ${loanAccount.ACCT_NO}`,
      reference: disbursementTransaction.reference,
      balance_after: newLedgerBalance
    });
    await customerAccount.save({ session });
    // Update loan account disbursement details
    loanAccount.ACTUAL_DISBURSEMENT = loanAmount;
    loanAccount.START_DT = new Date();
    loanAccount.disbursedAt = new Date();
   
    if (!loanAccount.disbursement_details) {
      loanAccount.disbursement_details = {};
    }
   
    loanAccount.disbursement_details.disbursementDate = new Date();
    loanAccount.disbursement_details.disbursedBy = userId;
    loanAccount.disbursement_details.disbursementReference = disbursementTransaction.reference;
    loanAccount.disbursement_details.disbursementMethod = safeToString(loanAccount.disbursementMethod, 'CASH');
    await loanAccount.save({ session });
    console.log(`✅ Successfully disbursed loan: ₦${loanAmount} to customer ${customerAccount.CUST_ID}`);
    console.log(` Previous balance: ₦${currentLedgerBalance}, New balance: ₦${newLedgerBalance}`);
    return {
      success: true,
      loanAmount: loanAmount,
      previousBalance: currentLedgerBalance,
      newBalance: newLedgerBalance,
      transactionReference: disbursementTransaction.reference,
      disbursementDate: new Date()
    };
  } catch (error) {
    console.error(`❌ Failed to disburse loan to customer ${customerAccount?.CUST_ID}:`, error);
    throw new Error(`Loan disbursement failed: ${error.message}`);
  }
};
// Additional helper function for comprehensive fee breakdown
const getLoanAccountFeeBreakdown = (loanAccount) => {
  const safeNumber = (value, defaultValue = 0) => {
    if (value === null || value === undefined) return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };
  const feeDetails = loanAccount.FEE_DETAILS || {};
 
  const processingFee = safeNumber(feeDetails.processingFee, 0);
  const adminFee = safeNumber(feeDetails.adminFee, 0);
  const insuranceFee = safeNumber(feeDetails.insuranceFee, 0);
  const otherFees = safeNumber(feeDetails.otherFees, 0);
  const upfrontInterest = safeNumber(feeDetails.upfrontInterest, 0);
 
  const totalFees = processingFee + adminFee + insuranceFee + otherFees + upfrontInterest;
  return {
    processingFee,
    adminFee,
    insuranceFee,
    otherFees,
    upfrontInterest,
    totalFees,
    breakdown: [
      { type: 'Processing Fee', amount: processingFee },
      { type: 'Admin Fee', amount: adminFee },
      { type: 'Insurance Fee', amount: insuranceFee },
      { type: 'Other Fees', amount: otherFees },
      { type: 'Upfront Interest', amount: upfrontInterest }
    ].filter(item => item.amount > 0)
  };
};
// Helper to validate customer account before operations
const validateCustomerAccount = async (customerAccount, requiredAmount = 0, operation = 'DEBIT') => {
  const safeNumber = (value, defaultValue = 0) => {
    if (value === null || value === undefined) return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };
  if (!customerAccount) {
    throw new Error('Customer account not found');
  }
  const currentLedgerBalance = safeNumber(customerAccount.ledger_balance, 0);
  const currentAvailableBalance = safeNumber(customerAccount.AVAILABLE_BALANCE, currentLedgerBalance);
  if (operation === 'DEBIT' && currentAvailableBalance < requiredAmount) {
    throw new Error(`Insufficient balance. Required: ${requiredAmount}, Available: ${currentAvailableBalance}`);
  }
  if (requiredAmount <= 0 && operation === 'DEBIT') {
    throw new Error('Invalid amount for debit operation');
  }
  return {
    currentLedgerBalance,
    currentAvailableBalance,
    isValid: true
  };
};

// Add this function to your GroupController.js (or appropriate controller for credit applications)

export const getPendingCreditApplications = asyncHandler(async (req, res) => {
  try {
    // ✅ IMMEDIATE FIX: Check if this is being called with wrong parameters
    if (req.params.id === 'pending-credit-applications') {
      console.log('🔄 Route misconfiguration detected, but proceeding...');
      // Clear the erroneous parameter
      req.params = {};
    }

    // ✅ LOCAL SAFE UTILITY FUNCTIONS 
    const safeToString = (value, defaultValue = '') => {
      if (value === null || value === undefined) return defaultValue;
      if (typeof value === 'string') return value.trim();
      return String(value || defaultValue).trim();
    };

    const safeNumber = (value, defaultValue = 0) => {
      if (value === null || value === undefined) return defaultValue;
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    const {
      page = 1,
      limit = 10,
      groupCode,
      branchId,
      primaryRM,
      status = 'applied',
      sortBy = 'applicationDate',
      sortOrder = 'desc'
    } = req.query;

    console.log('📋 Query parameters:', req.query);

    // Build filter
    const filter = {
      status: { $in: ['applied'] } // Only get 'applied' status loans
    };

    // Optional filters
    if (groupCode) {
      filter.groupCode = { $regex: safeToString(groupCode), $options: 'i' };
    }
    if (branchId) {
      filter.branch = safeNumber(branchId);
    }
    if (primaryRM) {
      filter.primaryRelationshipManager = { $regex: safeToString(primaryRM), $options: 'i' };
    }

    // Pagination
    const pageNum = Math.max(1, safeNumber(page, 1));
    const limitNum = Math.min(50, Math.max(1, safeNumber(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortOptions = { applicationDate: -1 };
    if (sortBy === 'totalAmount') sortOptions.totalAmount = sortOrder === 'desc' ? -1 : 1;
    if (sortBy === 'groupName') sortOptions.groupName = sortOrder === 'desc' ? -1 : 1;

    console.log('🔍 Database query:', { filter, skip, limit: limitNum, sort: sortOptions });

    // Simple query without complex population first
    const pendingApplications = await GroupLoan.find(filter)
      .populate('group', 'groupName groupCode')
      .populate('createdBy', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalCount = await GroupLoan.countDocuments(filter);

    console.log(`✅ Found ${pendingApplications.length} applications out of ${totalCount} total`);

    // Enhanced response
    const enhancedApplications = pendingApplications.map(app => ({
      loanId: app.loanId,
      groupCode: app.groupCode,
      groupName: app.groupName,
      totalAmount: app.totalAmount,
      memberCount: app.memberCount,
      status: app.status,
      applicationDate: app.applicationDate,
      primaryRelationshipManager: app.primaryRelationshipManager,
      loanPurpose: app.loanPurpose,
      interestRate: app.interestRate,
      summary: {
        totalAmount: app.totalAmount,
        totalMembers: app.memberCount,
        daysPending: Math.floor((new Date() - new Date(app.applicationDate)) / (1000 * 60 * 60 * 24)),
        financialSummary: {
          totalFees: app.feeSummary?.totalFees || 0,
          netDisbursement: app.netDisbursementAmount || 0,
          totalRepayable: app.totalRepayable || 0
        }
      }
    }));

    res.status(200).json({
      success: true,
      message: `Found ${pendingApplications.length} pending credit applications`,
      data: enhancedApplications,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount,
        hasNext: skip + pendingApplications.length < totalCount,
        hasPrev: pageNum > 1
      }
    });

  } catch (error) {
    console.error('❌ Error in getPendingCreditApplications:', error);
    
    // Specific error handling
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid parameter format',
        error: 'Route configuration issue detected'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending credit applications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// In your GroupController.js - update getGroupLoan function

// Repay group loan (split repayment across members)
export const repayGroupLoan = asyncHandler(async (req, res) => {
  const { groupLoanId } = req.params;
  const {
    totalRepayAmount,
    isInstallment,
    paymentMethod = 'CASH',
    transactionReference,
    isLegacyLoan = false
  } = req.body;
  // Validate required fields
  if (!totalRepayAmount || totalRepayAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Repayment amount is required and must be greater than 0.',
    });
  }
  // Get group loan - handle both legacy and new loans
  let groupLoan;
  if (isLegacyLoan) {
    // Handle legacy group loans (using legacyId or other identifier)
    groupLoan = await GroupLoan.findOne({
      $or: [
        { _id: groupLoanId },
        { legacyId: groupLoanId },
        { mysqlId: groupLoanId }
      ]
    })
    .populate('group', 'members groupCode groupName')
    .populate('individualLoanAccounts');
  } else {
    // Standard lookup
    groupLoan = await GroupLoan.findById(groupLoanId)
      .populate('group', 'members groupCode groupName')
      .populate('individualLoanAccounts');
  }
  if (!groupLoan) {
    return res.status(404).json({
      success: false,
      message: 'Group loan not found.',
    });
  }
  // Enhanced status validation for both legacy and modern loans
  const validRepaymentStatuses = [
    'disbursed', 'partially_disbursed', 'active',
    'disbursed_legacy', 'active_legacy', 'approved' // Include legacy statuses
  ];
 
  if (!validRepaymentStatuses.includes(groupLoan.status)) {
    return res.status(400).json({
      success: false,
      message: `Group loan must be in disbursed/active status for repayment. Current status: ${groupLoan.status}`,
    });
  }
  // Calculate financials with legacy fallbacks
  const totalRepayable = groupLoan.totalRepayable ||
                        (groupLoan.totalAmount + (groupLoan.totalInterest || 0)) ||
                        (groupLoan.loanAmount + (groupLoan.interestAmount || 0)); // Legacy field names
  const currentTotalRepaid = groupLoan.totalRepaid || groupLoan.repaidAmount || 0; // Legacy field name
  const remainingBalance = totalRepayable - currentTotalRepaid;
  if (totalRepayAmount > remainingBalance) {
    return res.status(400).json({
      success: false,
      message: `Repayment amount (${totalRepayAmount.toLocaleString()}) exceeds remaining balance (${remainingBalance.toLocaleString()}).`,
    });
  }
  // Validate installment amount with tolerance for legacy calculations
  let validationMessage = '';
  if (isInstallment && groupLoan.installmentAmount) {
    const tolerance = isLegacyLoan ? 1.00 : 0.01; // Higher tolerance for legacy loans
    if (Math.abs(totalRepayAmount - groupLoan.installmentAmount) > tolerance) {
      return res.status(400).json({
        success: false,
        message: `For installment repayment, amount should match the scheduled ${groupLoan.loanTerm} installment of ${groupLoan.installmentAmount.toLocaleString()}.`,
      });
    }
    validationMessage = ` (${groupLoan.loanTerm} installment applied)`;
  }
  const paymentDate = new Date();
  const oldTotalRepaid = currentTotalRepaid;
  const repaidMembers = [];
  const repaymentDetails = [];
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Determine if we need legacy processing
      const needsLegacyProcessing = isLegacyLoan ||
                                  !groupLoan.individualLoanAccounts ||
                                  groupLoan.individualLoanAccounts.length === 0;
      if (needsLegacyProcessing) {
        await processLegacyGroupLoanRepayment(
          groupLoan,
          totalRepayAmount,
          isInstallment,
          paymentDate,
          req.user.id,
          repaidMembers,
          repaymentDetails,
          session
        );
      } else {
        // Process modern group loans with individual LoanAccounts
        await processModernGroupLoanRepayment(
          groupLoan,
          totalRepayAmount,
          isInstallment,
          paymentDate,
          paymentMethod,
          transactionReference,
          req.user.id,
          repaidMembers,
          repaymentDetails,
          session
        );
      }
      // Update group loan repayment totals
      groupLoan.totalRepaid = (groupLoan.totalRepaid || 0) + totalRepayAmount;
      groupLoan.repaidToMembers = [...new Set([...(groupLoan.repaidToMembers || []), ...repaidMembers])];
      // Track installments paid at group level
      if (isInstallment) {
        groupLoan.installmentsPaid = (groupLoan.installmentsPaid || 0) + 1;
      }
      // Check if group loan is fully repaid
      if (groupLoan.totalRepaid >= totalRepayable) {
        groupLoan.status = isLegacyLoan ? 'repaid_legacy' : 'repaid';
        groupLoan.repaidAt = paymentDate;
        groupLoan.remainingBalance = 0;
      } else {
        groupLoan.remainingBalance = totalRepayable - groupLoan.totalRepaid;
      }
      // Update last repayment date
      groupLoan.lastRepaymentDate = paymentDate;
      // Mark as migrated if this is a legacy loan's first repayment
      if (isLegacyLoan && !groupLoan.migrationCompleted) {
        groupLoan.migrationCompleted = true;
        groupLoan.lastMigratedAt = paymentDate;
      }
      await groupLoan.save({ session });
    });
    // Log audit trail
    await logAuditTrail(
      'GroupLoan',
      groupLoan._id.toString(),
      req.user.id,
      'REPAY',
      {
        totalRepaid: oldTotalRepaid,
        status: groupLoan.status,
        isLegacyLoan
      },
      {
        totalRepaid: groupLoan.totalRepaid,
        isInstallment,
        totalRepayAmount,
        paymentMethod,
        membersRepaid: repaidMembers.length,
        loanType: isLegacyLoan ? 'legacy' : 'modern'
      },
      req.ip,
      isLegacyLoan ? 'LEGACY_GROUP_LOAN_REPAYMENT' : 'GROUP_LOAN_REPAYMENT'
    );
    logger.info(`Group loan repayment processed: ${groupLoan._id}, Amount: ${totalRepayAmount}, Members: ${repaidMembers.length}, Type: ${isLegacyLoan ? 'legacy' : 'modern'}`);
    const installmentInfo = groupLoan.installmentAmount ? ` Expected ${groupLoan.loanTerm} installment per group: ${groupLoan.installmentAmount.toLocaleString()}.` : '';
   
    res.status(200).json({
      success: true,
      message: `Group loan repayment of ${totalRepayAmount.toLocaleString()} processed successfully for ${repaidMembers.length} members.${validationMessage} Total repaid: ${groupLoan.totalRepaid.toLocaleString()}.${installmentInfo}`,
      data: {
        groupLoan: {
          _id: groupLoan._id,
          groupCode: groupLoan.groupCode,
          status: groupLoan.status,
          totalRepaid: groupLoan.totalRepaid,
          remainingBalance: groupLoan.remainingBalance,
          installmentsPaid: groupLoan.installmentsPaid,
          isLegacyLoan
        },
        repaymentSummary: {
          totalAmount: totalRepayAmount,
          membersRepaid: repaidMembers.length,
          paymentDate,
          paymentMethod,
          isInstallment,
          isLegacyLoan
        },
        memberDetails: repaymentDetails
      },
    });
  } catch (error) {
    logger.error(`Error processing group loan repayment: ${error.message}`);
    await session.abortTransaction();
   
    res.status(500).json({
      success: false,
      message: 'Failed to process group loan repayment.',
      error: error.message,
      isLegacyLoan
    });
  } finally {
    await session.endSession();
  }
});
// Helper function for legacy group loan repayment (no individual LoanAccounts)
const processLegacyGroupLoanRepayment = async (
  groupLoan,
  totalRepayAmount,
  isInstallment,
  paymentDate,
  userId,
  repaidMembers,
  repaymentDetails,
  session
) => {
  // For legacy loans, we might not have individual LoanAccounts
  // So we track repayment at the group level only or create stub records
 
  if (groupLoan.group && groupLoan.group.members) {
    // Calculate equal share per member for legacy loans
    const individualRepay = totalRepayAmount / groupLoan.group.members.length;
   
    for (const memberCustId of groupLoan.group.members) {
      try {
        // Try to find existing loan account for this member
        let loanAccount = await LoanAccount.findOne({
          CUST_ID: memberCustId,
          groupLoan: groupLoan._id
        }).session(session);
        if (!loanAccount) {
          // Get customer details for account name
          const customer = await Customer.findOne({ CUST_ID: memberCustId }).session(session);
          const customerName = customer ?
            `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim() :
            `Member ${memberCustId}`;
          // Create a stub loan account for tracking if none exists
          // Use realistic estimates based on group loan data
          const estimatedLoanAmount = (groupLoan.totalAmount / groupLoan.group.members.length) || individualRepay * 10;
          const estimatedInterest = estimatedLoanAmount * 0.2; // 20% interest estimate
         
          loanAccount = new LoanAccount({
            CUST_ID: memberCustId,
            ACCT_NM: customerName,
            ACCT_NO: `LEGACY_${groupLoan.groupCode}_${memberCustId}_${Date.now().toString().slice(-6)}`,
            LOAN_STATUS: 'ACTIVE',
            DISBURSEMENT_LIMIT: estimatedLoanAmount,
            ACTUAL_DISBURSEMENT: estimatedLoanAmount,
            OUTSTANDING_PRINCIPAL: estimatedLoanAmount,
            TOTAL_INTEREST: estimatedInterest,
            TOTAL_REPAYMENT: estimatedLoanAmount + estimatedInterest,
            repaidAmount: 0,
            groupLoan: groupLoan._id,
            isLegacy: true,
            migratedFrom: 'legacy_system',
            createdBy: userId,
            START_DT: groupLoan.disbursedAt || groupLoan.applicationDate || new Date(),
            MATURITY_DT: groupLoan.repaidAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
          });
        }
        // Update repayment tracking
        const currentRepaid = loanAccount.repaidAmount || 0;
        loanAccount.repaidAmount = currentRepaid + individualRepay;
        loanAccount.OUTSTANDING_PRINCIPAL = Math.max(0, loanAccount.DISBURSEMENT_LIMIT - (loanAccount.repaidAmount - loanAccount.TOTAL_INTEREST));
       
        if (isInstallment) {
          loanAccount.installmentsPaid = (loanAccount.installmentsPaid || 0) + 1;
        }
        // Check if fully repaid
        if (loanAccount.repaidAmount >= loanAccount.TOTAL_REPAYMENT) {
          loanAccount.LOAN_STATUS = 'REPAID';
          loanAccount.repaidAt = paymentDate;
        }
        await loanAccount.save({ session });
        repaidMembers.push(loanAccount._id);
        // Get customer details for response
        const customer = await Customer.findOne({ CUST_ID: memberCustId }).session(session);
        repaymentDetails.push({
          custId: memberCustId,
          name: customer ? `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim() : `Member ${memberCustId}`,
          amount: individualRepay,
          loanAccountNo: loanAccount.ACCT_NO,
          newBalance: loanAccount.TOTAL_REPAYMENT - loanAccount.repaidAmount,
          isLegacy: true
        });
      } catch (memberError) {
        logger.error(`Error processing legacy member ${memberCustId}:`, memberError);
        // Continue with other members even if one fails
      }
    }
  }
};
// Helper function for modern group loan repayment
const processModernGroupLoanRepayment = async (
  groupLoan,
  totalRepayAmount,
  isInstallment,
  paymentDate,
  paymentMethod,
  transactionReference,
  userId,
  repaidMembers,
  repaymentDetails,
  session
) => {
  // Process repayment for each individual loan account (modern approach)
  for (const loanAccount of groupLoan.individualLoanAccounts) {
    if (!['ACTIVE', 'disbursed'].includes(loanAccount.LOAN_STATUS)) {
      continue; // Skip non-active loans
    }
    // Calculate member's share of repayment based on their loan amount
    const memberShareRatio = loanAccount.DISBURSEMENT_LIMIT / groupLoan.totalAmount;
    const memberRepayAmount = totalRepayAmount * memberShareRatio;
    // Update loan account repayment fields
    const currentRepaid = loanAccount.repaidAmount || 0;
    const memberTotalRepayable = loanAccount.TOTAL_REPAYMENT || (loanAccount.DISBURSEMENT_LIMIT + (loanAccount.TOTAL_INTEREST || 0));
   
    loanAccount.repaidAmount = currentRepaid + memberRepayAmount;
    loanAccount.OUTSTANDING_PRINCIPAL = Math.max(0, loanAccount.DISBURSEMENT_LIMIT - (loanAccount.repaidAmount - (loanAccount.TOTAL_INTEREST || 0)));
   
    // Track installments paid
    if (isInstallment) {
      loanAccount.installmentsPaid = (loanAccount.installmentsPaid || 0) + 1;
    }
    // Check if individual loan is fully repaid
    if (loanAccount.repaidAmount >= memberTotalRepayable) {
      loanAccount.LOAN_STATUS = 'REPAID';
      loanAccount.repaidAt = paymentDate;
    }
    await loanAccount.save({ session });
    repaidMembers.push(loanAccount._id);
    repaymentDetails.push({
      custId: loanAccount.CUST_ID,
      name: loanAccount.ACCT_NM,
      amount: memberRepayAmount,
      loanAccountNo: loanAccount.ACCT_NO,
      newBalance: memberTotalRepayable - loanAccount.repaidAmount,
      isLegacy: false
    });
    // Update repayment schedule if exists and this is an installment
    if (isInstallment) {
      await updateRepaymentSchedule(loanAccount, memberRepayAmount, paymentDate, session);
    }
    // Create repayment transaction record
    await createRepaymentTransaction(
      loanAccount,
      memberRepayAmount,
      paymentMethod,
      transactionReference,
      userId,
      groupLoan.group.branch,
      session
    );
  }
};
// Get group loan by ID - Updated with proper population
export const getGroupLoan = asyncHandler(async (req, res) => {
  const { groupLoanId } = req.params;
 
  let groupLoan = await GroupLoan.findById(groupLoanId)
    .populate('group', 'groupName groupCode members branch relationshipManager')
    .populate('primaryRelationshipManager', 'name email employeeId')
    .populate('secondaryRelationshipManager', 'name email employeeId')
    .populate('createdBy', 'name email employeeId')
    .populate('groupSavings', 'accountNumber currentBalance savingsType')
    .populate('individualLoanAccounts', 'ACCT_NO ACCT_NM CUST_ID LOAN_STATUS DISBURSEMENT_LIMIT ACTUAL_DISBURSEMENT TOTAL_INTEREST TOTAL_REPAYMENT repaidAmount OUTSTANDING_PRINCIPAL installmentAmount numPeriods installmentsPaid disbursedAt START_DT MATURITY_DT')
    .populate('disbursedToMembers', 'ACCT_NO ACCT_NM CUST_ID')
    .populate('repaidToMembers', 'ACCT_NO ACCT_NM CUST_ID');
  if (!groupLoan) {
    return res.status(404).json({
      success: false,
      message: 'Group loan not found.',
    });
  }
  // Convert to object for manipulation
  groupLoan = groupLoan.toObject();
  // Calculate additional financial metrics
  groupLoan.remainingBalance = Math.max(0, (groupLoan.totalRepayable || 0) - (groupLoan.totalRepaid || 0));
  groupLoan.repaymentProgress = groupLoan.totalRepayable ?
    ((groupLoan.totalRepaid || 0) / groupLoan.totalRepayable) * 100 : 0;
  // Get detailed member information
  if (groupLoan.group && groupLoan.group.members) {
    const memberDetails = await Customer.find(
      { CUST_ID: { $in: groupLoan.group.members } },
      'CUST_ID FIRST_NAME LAST_NAME phone_number email address'
    );
    // Map member details with their loan accounts
    groupLoan.memberDetails = memberDetails.map(member => {
      const loanAccount = groupLoan.individualLoanAccounts.find(
        acc => acc.CUST_ID === member.CUST_ID
      );
      return {
        ...member.toObject(),
        loanAccount: loanAccount || null
      };
    });
  }
  // Calculate summary statistics
  groupLoan.summary = {
    totalMembers: groupLoan.memberCount,
    activeLoans: groupLoan.individualLoanAccounts.filter(acc => acc.LOAN_STATUS === 'ACTIVE').length,
    repaidLoans: groupLoan.individualLoanAccounts.filter(acc => acc.LOAN_STATUS === 'REPAID').length,
    totalDisbursed: groupLoan.individualLoanAccounts.reduce((sum, acc) => sum + (acc.ACTUAL_DISBURSEMENT || 0), 0),
    totalRepaid: groupLoan.individualLoanAccounts.reduce((sum, acc) => sum + (acc.repaidAmount || 0), 0),
    totalOutstanding: groupLoan.individualLoanAccounts.reduce((sum, acc) => sum + (acc.OUTSTANDING_PRINCIPAL || 0), 0)
  };
  logger.info(`Group loan fetched: ${groupLoanId} by user ${req.user.id}`);
 
  res.status(200).json({
    success: true,
    data: groupLoan,
  });
});
// Helper function to update repayment schedule
const updateRepaymentSchedule = async (loanAccount, amount, paymentDate, session) => {
  try {
    const schedule = await RepaymentSchedule.findOne({ LOAN_ACCOUNT_ID: loanAccount._id }).session(session);
    if (schedule && schedule.nextPayment) {
      const installmentNo = schedule.nextPayment.installmentNo;
      const installment = schedule.installments.find(inst => inst.installmentNo === installmentNo);
     
      if (installment) {
        const paymentData = {
          amount: amount,
          principal: parseFloat(installment.principal.toString()),
          interest: parseFloat(installment.interest.toString()),
          paymentDate,
          isEarlyPayment: new Date(installment.dueDate) > paymentDate,
          status: 'PAID'
        };
       
        schedule.updateInstallmentPayment(installmentNo, paymentData);
        await schedule.save({ session });
      }
    }
  } catch (error) {
    logger.error(`Error updating repayment schedule for loan ${loanAccount.ACCT_NO}:`, error);
    // Don't fail the entire repayment if schedule update fails
  }
};
// Helper function to create repayment transaction
const createRepaymentTransaction = async (loanAccount, amount, paymentMethod, reference, userId, branchId, session) => {
  try {
    const transaction = new Transaction({
      account_number: loanAccount.ACCT_NO,
      transaction_type: 'CREDIT',
      amount: amount,
      description: `Loan repayment for ${loanAccount.ACCT_NM}`,
      status: 'completed',
      payment_method: paymentMethod,
      reference: reference || `REPAY_${loanAccount.ACCT_NO}_${Date.now()}`,
      createdBy: userId,
      branch: branchId,
      transaction_date: new Date(),
      metadata: {
        loanAccount: loanAccount.ACCT_NO,
        customerId: loanAccount.CUST_ID,
        repaymentType: 'GROUP_LOAN'
      }
    });
    await transaction.save({ session });
    return transaction;
  } catch (error) {
    logger.error(`Error creating repayment transaction for loan ${loanAccount.ACCT_NO}:`, error);
    // Don't fail the entire repayment if transaction creation fails
  }
};
// Delete group
export const deleteGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({
      success: false,
      message: 'Group not found.',
    });
  }
  // Check if group has active loans
  const activeLoans = await GroupLoan.find({
    group: groupId,
    status: { $in: ['approved', 'disbursed', 'partially_disbursed'] }
  });
  if (activeLoans.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete group with active loans. Please close all loans first.',
    });
  }
  const groupData = group.toObject();
  await Group.findByIdAndDelete(groupId);
  // Log audit trail
  await logAuditTrail(
    'Group',
    groupId,
    req.user?.id || 'system',
    'DELETE',
    groupData,
    null,
    req.ip,
    'GROUP_DELETED'
  );
  logger.info(`Group deleted: ${groupId}`);
  res.status(200).json({
    success: true,
    message: 'Group deleted successfully.',
  });
});
export default {
  createGroup,
  getGroups,
  addMemberToGroup,
  updateGroup,
  removeMemberFromGroup,
  getGroupByLegacyId,
  getGroupsByBranch,
  createGroupLoanApplication,
  disburseGroupLoan,
  repayGroupLoan,
  getGroupLoan,
  deleteGroup,
   getPendingCreditApplications
};