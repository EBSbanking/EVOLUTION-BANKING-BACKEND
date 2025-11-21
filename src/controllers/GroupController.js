// src/controllers/GroupController.js
import mongoose from 'mongoose';
import Group from '../models/Group.js';
import GroupLoan from '../models/GroupLoan.js';
import LoanAccount from '../models/LoanAccount.js';
import Customer from '../models/Customer.js';
import User from '../models/User.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanProduct from '../models/LoanProduct.js';  // ← ADDED
import ProductTypeMapping from '../models/ProductTypeMapping.js';
import Counter from '../models/Counter.js';
import logger from '../utils/logger.js';
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { v4 as uuidv4 } from 'uuid';
import logAuditTrail from '../Services/AuditService.js';
import LoanInterestRate from '../models/LoanInterestRate.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import { 
   calculateLoanRepayment } from '../controllers/LoanInterestRateController.js';
import Transaction from '../models/Transaction.js';
import LoanAccountSummary from '../models/LoanAccountSummary.js';
import Branch from '../models/Branch.js';
import InterestRate from '../models/LoanInterestRate.js';
import GLAccount from '../models/GLAccount.js';
import {getLoanAccountDisbursementInfo} from '../controllers/LoanAccountSummaryController.js';



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


// Convert to Decimal128 safely
const toDecimal = (val, field) => {
  const num = parseFloat(val);
  if (isNaN(num) || num < 0) throw new Error(`${field} must be a positive number`);
  return mongoose.Types.Decimal128.fromString(num.toFixed(2));
};





// Helper functions
const normalizeCustomerId = (id) => String(id).padStart(10, '0');

// Generate group loan ID
async function generateGroupLoanId() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `GL${timestamp}${random}`;
}

// Generate loan account number by product ID
async function generateLoanAccountNumberByProdId(productId) {
  try {
    // Find the last loan account for this product to increment
    const lastLoanAccount = await LoanAccount.findOne(
      { PROD_ID: productId },
      { ACCT_NO: 1 },
      { sort: { createdAt: -1 } }
    );

    let nextNumber = 1;
    
    if (lastLoanAccount && lastLoanAccount.ACCT_NO) {
      // Extract numeric part and increment
      const lastNumber = parseInt(lastLoanAccount.ACCT_NO.slice(-6)) || 0;
      nextNumber = lastNumber + 1;
    }

    // Format: 2 + productId (padded to 3 digits) + sequential number (padded to 6 digits)
    const productPart = String(productId).padStart(3, '0');
    const sequentialPart = String(nextNumber).padStart(6, '0');
    
    const loanAccountNo = `2${productPart}${sequentialPart}`;
    
    console.log(`Generated loan account: ${loanAccountNo} for product ${productId}`);
    return loanAccountNo;
    
  } catch (error) {
    console.error('Error generating loan account number:', error);
    // Fallback: timestamp-based generation
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `2${String(productId).padStart(3, '0')}${timestamp}${random}`.slice(0, 16);
  }
}

// Calculate flat rate interest (make sure this function exists)
function calculateFlatRate({ principal, annualRate, termMonths, startDate, paymentFrequency }) {
  const principalAmount = parseFloat(principal) || 0;
  const interestRate = parseFloat(annualRate) || 0;
  const termValue = parseInt(termMonths) || 0;

  if (!principalAmount || !interestRate || !termValue) {
    throw new Error('Invalid parameters for interest calculation');
  }

  // Calculate total interest (flat rate)
  const totalInterest = principalAmount * (interestRate / 100) * (termValue / 12);
  const totalRepayment = principalAmount + totalInterest;
  
  let totalInstallments = termValue;
  let installmentAmount = totalRepayment / totalInstallments;

  // Generate installment schedule
  const installments = [];
  let remainingBalance = totalRepayment;
  const start = new Date(startDate);

  for (let i = 1; i <= totalInstallments; i++) {
    let dueDate = new Date(start);
    
    // Calculate due date based on payment frequency
    switch (paymentFrequency.toUpperCase()) {
      case 'WEEKLY':
        dueDate.setDate(start.getDate() + (i * 7));
        break;
      case 'BI_WEEKLY':
        dueDate.setDate(start.getDate() + (i * 14));
        break;
      case 'MONTHLY':
      default:
        dueDate.setMonth(start.getMonth() + i);
        break;
    }

    const principalPortion = i === totalInstallments ? 
      principalAmount - (installmentAmount * (totalInstallments - 1)) : 
      installmentAmount - (totalInterest / totalInstallments);
    
    const interestPortion = installmentAmount - principalPortion;
    
    remainingBalance -= installmentAmount;
    if (i === totalInstallments) remainingBalance = 0;

    installments.push({
      installmentNo: i,
      dueDate: dueDate.toISOString().split('T')[0],
      principal: parseFloat(principalPortion.toFixed(2)),
      interest: parseFloat(interestPortion.toFixed(2)),
      totalPayment: parseFloat(installmentAmount.toFixed(2)),
      remainingBalance: parseFloat(Math.max(0, remainingBalance).toFixed(2))
    });
  }

  return {
    totalInterest: parseFloat(totalInterest.toFixed(2)),
    paymentAmount: parseFloat(installmentAmount.toFixed(2)),
    totalRepayment: parseFloat(totalRepayment.toFixed(2)),
    totalInstallments,
    installments
  };
}

export const createGroupLoanApplication = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('=== STARTING GROUP LOAN CREATION (FULL DISBURSEMENT + FEES FROM SAVINGS + REPAYMENT SCHEDULE) ===');

    const {
      groupCode,
      totalAmount,
      primaryRelationshipManager,
      loanPurpose,
      savingsAccount,
      productId = 400,
      disbursementMethod = 'CASH',
      members = [],
      processingFee = 3,
      adminFee = 1000
    } = req.body;

    if (!groupCode || !primaryRelationshipManager || !loanPurpose || !savingsAccount || members.length === 0) {
      throw new Error('Missing required fields: groupCode, primaryRelationshipManager, loanPurpose, savingsAccount, and members are required');
    }

    const group = await Group.findOne({ groupCode }).session(session);
    if (!group) throw new Error('Group not found');

    const existing = await GroupLoan.findOne({
      groupCode,
      status: { $in: ['applied', 'approved', 'disbursed', 'partially_disbursed'] }
    }).session(session);
    if (existing) throw new Error(`Group already has active loan: ${existing.loanId}`);

    const loanProduct = await LoanProduct.findOne({ PROD_ID: productId }).session(session);
    if (!loanProduct) throw new Error(`Loan product with PROD_ID ${productId} not found`);

    const loanId = await generateGroupLoanId();
    const createdBy = req.user?._id || (await User.findOne({ employeeId: 'SYSTEM' }))?._id;

    let computedTotal = 0;
    const processedMembers = [];
    let totalFeesCollected = 0;

    // Validate members
    for (const m of members) {
      const memberId = safeToString(m.memberId);
      const amount = safeNumber(m.individualAmount);
      const savingsAccNo = safeToString(m.savingsAccountNo);
      const name = safeToString(m.name, 'Unknown Member');

      if (!memberId || amount <= 0 || !savingsAccNo) {
        throw new Error(`Invalid member data for ${name}: memberId, individualAmount, and savingsAccountNo are required`);
      }

      const savingsAcc = await CustomerAccount.findOne({
        $or: [{ account_number: savingsAccNo }, { ACCT_NO: savingsAccNo }]
      }).session(session);

      if (!savingsAcc) throw new Error(`Savings account ${savingsAccNo} not found`);
      
      const accountStatus = savingsAcc.status || savingsAcc.REC_ST || '';
      if (!['ACTIVE', 'Active', 'A', 'OPEN'].includes(accountStatus)) {
        throw new Error(`Savings account ${savingsAccNo} is not active. Current status: ${accountStatus}`);
      }

      const accountOwnerId = savingsAcc.CUST_ID || savingsAcc.customer_id;
      if (!accountOwnerId) throw new Error(`Savings account ${savingsAccNo} has no owner`);

      const memberNorm = normalizeCustomerId(memberId);
      const ownerNorm = normalizeCustomerId(accountOwnerId);
      if (memberNorm !== ownerNorm) {
        throw new Error(`Account ${savingsAccNo} does not belong to member ${memberId}`);
      }

      processedMembers.push({
        memberId,
        name,
        individualAmount: amount,
        savingsAccountNo: savingsAccNo,
        savingsAccount: savingsAcc
      });

      computedTotal += amount;
    }

    const finalTotal = safeNumber(totalAmount) || computedTotal;
    if (Math.abs(finalTotal - computedTotal) > 0.01) {
      throw new Error(`Total amount mismatch: Calculated ${computedTotal} vs Provided ${finalTotal}`);
    }

    // Dynamic values from product
    const termValue = safeNumber(req.body.termValue) || loanProduct.maxTerm || 12;
    const paymentFrequency = loanProduct.PAYMENT_FREQUENCY || 'WEEKLY';
    const interestRate = parseFloat(loanProduct.interestRate?.toString() || '6.5');

    // Maturity date
    const startDate = new Date();
    const maturityDate = new Date(startDate);
    if (paymentFrequency.includes('WEEK')) {
      maturityDate.setDate(startDate.getDate() + termValue * 7);
    } else {
      maturityDate.setMonth(startDate.getMonth() + termValue);
    }

    console.log('=== LOAN PARAMETERS ===');
    console.log('Total Amount:', finalTotal);
    console.log('Interest Rate:', interestRate + '%');
    console.log('Term Value:', termValue);
    console.log('Payment Frequency:', paymentFrequency);
    console.log('Maturity Date:', maturityDate.toISOString().split('T')[0]);

    // === CREATE LOAN ACCOUNTS + DEBIT FEES + CREATE REPAYMENT SCHEDULE ===
    const individualLoanIds = [];
    const memberRepaymentSchedules = [];

    for (const mem of processedMembers) {
      const loanAccNo = await generateLoanAccountNumberByProdId(productId);
      
      console.log(`Processing member ${mem.memberId} with loan account ${loanAccNo}`);

      // Fees calculation
      const processingFeeAmount = mem.individualAmount * (safeNumber(processingFee) / 100);
      const adminFeeAmount = safeNumber(adminFee);
      const memberTotalFees = processingFeeAmount + adminFeeAmount;
      totalFeesCollected += memberTotalFees;

      // DEBIT FEES FROM SAVINGS
      if (memberTotalFees > 0) {
        const available = safeNumber(mem.savingsAccount.AVAILABLE_BALANCE || mem.savingsAccount.ledger_balance || 0);
        if (available < memberTotalFees) {
          throw new Error(`Member ${mem.name} insufficient balance for fees. Available: ₦${available}, Required: ₦${memberTotalFees}`);
        }

        // Update savings account balance
        mem.savingsAccount.AVAILABLE_BALANCE = available - memberTotalFees;
        if (mem.savingsAccount.ledger_balance !== undefined) {
          mem.savingsAccount.ledger_balance -= memberTotalFees;
        }
        await mem.savingsAccount.save({ session });

        // Get account details for transaction
        const accountNumber = mem.savingsAccount.account_number || mem.savingsAccount.ACCT_NO;
        const accountName = mem.savingsAccount.ACCT_NM || mem.savingsAccount.account_name || mem.name;
        const customerId = mem.savingsAccount.CUST_ID || mem.savingsAccount.customer_id || mem.memberId;
        const businessUnit = mem.savingsAccount.BU_ID || group.branch || '100';

        // Record fee transaction with all required fields
        const feeTransaction = new Transaction({
          // Required core fields
          TRANSACTION_TYPE: 'DEBIT',
          AMOUNT: parseFloat(memberTotalFees),
          ACCT_NM: accountName,
          CUST_ID: normalizeCustomerId(customerId),
          BU_ID: businessUnit,
          ACCT_ID: mem.savingsAccount._id,
          ACCT_NO: accountNumber,
          
          // Account number aliases
          account_number: accountNumber,
          transaction_type: 'DEBIT',
          amount: parseFloat(memberTotalFees),
          
          // Descriptive fields
          description: `Group loan fees - Processing ₦${processingFeeAmount.toFixed(2)} + Admin ₦${adminFeeAmount.toFixed(2)}`,
          reference: `FEE_${loanAccNo}_${Date.now()}`,
          TRAN_PARTICULARS: `Loan processing and admin fees for group loan ${loanId}`,
          TRAN_REFERENCE: `GL_FEE_${loanId}_${mem.memberId}`,
          
          // Date fields
          transaction_date: new Date(),
          TRAN_DATE: new Date(),
          VALUE_DATE: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          
          // Status fields
          STATUS: 'COMPLETED',
          REC_ST: 'A',
          TRAN_STATUS: 'SUCCESS',
          
          // User and branch
          createdBy: createdBy,
          branch: group.branch || 1,
          CREATED_BY: createdBy?.toString() || 'SYSTEM',
          
          // Balance information
          BALANCE: available - memberTotalFees,
          AVAILABLE_BALANCE: available - memberTotalFees,
          LEDGER_BALANCE: (mem.savingsAccount.ledger_balance || available) - memberTotalFees,
          
          // Metadata
          metadata: { 
            purpose: 'GROUP_LOAN_FEES', 
            loanId, 
            memberId: mem.memberId,
            processingFee: processingFeeAmount,
            adminFee: adminFeeAmount,
            totalFees: memberTotalFees,
            loanAccountNo: loanAccNo
          }
        });

        await feeTransaction.save({ session });

        console.log(`✅ Debited fees ₦${memberTotalFees} from ${accountNumber} for member ${mem.memberId}`);
      }

      // Calculate member's repayment schedule with precise calculation
      const memberRepayment = calculateFlatRatePrecise({
        principal: mem.individualAmount,
        annualRate: interestRate,
        termMonths: termValue,
        startDate,
        paymentFrequency
      });

      // Validate final balance is zero
      const finalInstallment = memberRepayment.installments[memberRepayment.installments.length - 1];
      if (Math.abs(finalInstallment.remainingBalance) > 0.01) {
        console.warn(`Final balance not zero for member ${mem.memberId}: ${finalInstallment.remainingBalance}. Adjusting...`);
        // Force final balance to zero and adjust the last payment
        const adjustment = finalInstallment.remainingBalance;
        memberRepayment.installments[memberRepayment.installments.length - 1].remainingBalance = 0;
        memberRepayment.installments[memberRepayment.installments.length - 1].totalPayment += adjustment;
        memberRepayment.installments[memberRepayment.installments.length - 1].interest += adjustment;
      }

      if (!memberRepayment.installments || !Array.isArray(memberRepayment.installments)) {
        throw new Error(`Failed to generate repayment schedule for member ${mem.memberId}`);
      }

      // Verify the schedule totals
      const totalCalculated = memberRepayment.installments.reduce((sum, inst) => sum + inst.totalPayment, 0);
      const expectedTotal = memberRepayment.totalRepayment;
      if (Math.abs(totalCalculated - expectedTotal) > 0.01) {
        console.warn(`Schedule total mismatch for member ${mem.memberId}: Calculated ${totalCalculated} vs Expected ${expectedTotal}`);
      }

      console.log(`✅ Generated repayment schedule for ${mem.memberId}: ${memberRepayment.installments.length} installments, Final Balance: ${memberRepayment.installments[memberRepayment.installments.length - 1].remainingBalance}`);

      // Create loan account
      const newLoanAcc = new LoanAccount({
        CUST_ID: normalizeCustomerId(mem.memberId),
        ACCT_NM: mem.name,
        ACCT_NO: loanAccNo,
        LOAN_STATUS: 'PENDING',
        PRODUCT_TYPE: 'GROUP_LOAN',

        PROD_ID: loanProduct.PROD_ID,
        BU_ID: loanProduct.BU_ID[0] || '100',
        PAYMENT_FREQUENCY: paymentFrequency,
        TERM_CD: loanProduct.TERM_CD || 'W',
        PRIMARY_OFFICER_ID: primaryRelationshipManager,

        loanGLAccount: loanProduct.loanGLAccount,
        principalGLAccountNo: loanProduct.principalGLAccountNo,
        interestGLAccountNo: loanProduct.interestGLAccountNo,
        SETTLEMENT_GL_ACCT_NO: loanProduct.SETTLEMENT_GL_ACCT_NO,

        INTEREST_RATE_ID: 1,
        INTEREST_RATE: interestRate,

        APPL_ID: `APP_${loanId}_${mem.memberId}`,
        JOURNAL_ID: `JNL_${loanId}_${Date.now()}`,

        MATURITY_DT: maturityDate,
        TERM_VALUE: termValue,

        DISBURSEMENT_LIMIT: mem.individualAmount,
        OUTSTANDING_PRINCIPAL: mem.individualAmount,
        ORIGINAL_PRINCIPAL: mem.individualAmount,

        Borrower_address: {
          street: 'Group Member Residence',
          city: 'Lagos',
          state: 'Lagos',
          zipCode: '100001',
          country: 'Nigeria'
        },

        loanPurpose,
        createdBy,
        savingsAccountNo: mem.savingsAccountNo,
        FEE_DETAILS: {
          processingFee: processingFeeAmount,
          adminFee: adminFeeAmount,
          totalFees: memberTotalFees,
          feesCollectedFromSavings: true,
          collectionDate: new Date()
        },
        PAYMENT_SCHEDULE: memberRepayment.installments
      });

      const savedLoanAcc = await newLoanAcc.save({ session });
      individualLoanIds.push(savedLoanAcc._id);

      // === CREATE REPAYMENT SCHEDULE DOCUMENT ===
      const repaymentScheduleData = {
        LOAN_ACCOUNT_ID: savedLoanAcc._id,
        ACCT_NO: loanAccNo,
        CUST_ID: normalizeCustomerId(mem.memberId),
        START_DATE: startDate,
        MATURITY_DATE: maturityDate,
        PRINCIPAL_AMOUNT: mem.individualAmount,
        INTEREST_RATE: interestRate,
        TERM: termValue,
        TERM_TYPE: loanProduct.TERM_CD || 'W',
        paymentFrequency,
        installments: memberRepayment.installments.map(inst => ({
          installmentNo: inst.installmentNo,
          dueDate: inst.dueDate,
          principal: inst.principal,
          interest: inst.interest,
          totalPayment: inst.totalPayment,
          remainingBalance: inst.remainingBalance,
          status: 'PENDING',
          amountPaid: 0,
          principalPaid: 0,
          interestPaid: 0
        })),
        TOTAL_INTEREST: memberRepayment.totalInterest,
        TOTAL_REPAYMENT: memberRepayment.totalRepayment,
        TRANSACTION_ID: `TXN_${loanId}_${mem.memberId}`,
        EVENT_ID: `EVT_${loanId}_${Date.now()}`,
        CREATED_BY: createdBy.toString(),
        STATUS: 'PENDING',
        EMI_AMOUNT: memberRepayment.paymentAmount
      };

      const repaymentSchedule = new RepaymentSchedule(repaymentScheduleData);
      const savedSchedule = await repaymentSchedule.save({ session });

      memberRepaymentSchedules.push({
        memberId: mem.memberId,
        memberName: mem.name,
        loanAccountId: savedLoanAcc._id,
        repaymentScheduleId: savedSchedule._id,
        loanAccountNo: loanAccNo,
        schedule: memberRepayment
      });

      console.log(`✅ Created loan account ${loanAccNo} for member ${mem.memberId} with ${memberRepayment.installments.length} installments`);
    }

    // === CREATE GROUP LOAN ===
    const groupLoanInterest = calculateFlatRatePrecise({
      principal: finalTotal,
      annualRate: interestRate,
      termMonths: termValue,
      startDate,
      paymentFrequency
    });

    // Validate group loan final balance
    const groupFinalInstallment = groupLoanInterest.installments[groupLoanInterest.installments.length - 1];
    if (Math.abs(groupFinalInstallment.remainingBalance) > 0.01) {
      console.warn(`Group loan final balance not zero: ${groupFinalInstallment.remainingBalance}. Adjusting...`);
      groupLoanInterest.installments[groupLoanInterest.installments.length - 1].remainingBalance = 0;
    }

    const newGroupLoan = new GroupLoan({
      loanId,
      group: group._id,
      groupCode,
      groupName: group.groupName || 'Unknown Group',
      totalAmount: finalTotal,
      individualShare: finalTotal / processedMembers.length,
      memberCount: processedMembers.length,
      members: processedMembers.map(m => ({
        memberId: m.memberId,
        name: m.name,
        individualAmount: m.individualAmount,
        savingsAccountNo: m.savingsAccountNo
      })),
      branch: group.branch || 1,
      primaryRelationshipManager,
      loanPurpose,
      savingsAccount,
      interestRate,
      loanTerm: paymentFrequency.toLowerCase(),
      termValue,
      productId: loanProduct.PROD_ID,
      individualLoanAccounts: individualLoanIds,
      memberRepaymentSchedules: memberRepaymentSchedules.map(rs => ({
        memberId: rs.memberId,
        memberName: rs.memberName,
        loanAccountId: rs.loanAccountId,
        repaymentScheduleId: rs.repaymentScheduleId,
        loanAccountNo: rs.loanAccountNo
      })),
      createdBy,
      status: 'applied',
      totalFeesCollected,
      netDisbursementAmount: finalTotal,
      interestDetails: {
        totalInterest: groupLoanInterest.totalInterest,
        totalRepayment: groupLoanInterest.totalRepayment,
        paymentAmount: groupLoanInterest.paymentAmount,
        calculationMethod: 'flat',
        paymentFrequency: paymentFrequency,
        totalInstallments: groupLoanInterest.totalInstallments
      },
      paymentSchedule: groupLoanInterest.installments.map(i => ({
        installmentNo: i.installmentNo,
        dueDate: i.dueDate,
        principal: i.principal,
        interest: i.interest,
        totalPayment: i.totalPayment,
        remainingBalance: i.remainingBalance
      }))
    });

    await newGroupLoan.save({ session });

    // Update individual loan accounts with group loan reference
    await LoanAccount.updateMany(
      { _id: { $in: individualLoanIds } },
      { 
        groupLoan: newGroupLoan._id,
        GROUP_LOAN_REF: {
          loanId: loanId,
          groupCode: groupCode,
          totalGroupAmount: finalTotal
        }
      },
      { session }
    );

    await session.commitTransaction();

    console.log(`✅ Group loan ${loanId} created successfully with ${processedMembers.length} members`);
    console.log(`   Total Fees Collected: ₦${totalFeesCollected.toLocaleString()}`);
    console.log(`   Total Loan Amount: ₦${finalTotal.toLocaleString()}`);
    console.log(`   Repayment Schedules Created: ${memberRepaymentSchedules.length}`);
    
    // Final validation
    let allBalancesZero = true;
    for (const ms of memberRepaymentSchedules) {
      const finalBalance = ms.schedule.installments[ms.schedule.installments.length - 1].remainingBalance;
      if (Math.abs(finalBalance) > 0.01) {
        console.warn(`Member ${ms.memberId} final balance: ${finalBalance}`);
        allBalancesZero = false;
      }
    }
    console.log(`   All final balances zero: ${allBalancesZero}`);

    res.status(201).json({
      success: true,
      message: `Group loan ${loanId} created successfully. ₦${totalFeesCollected.toLocaleString()} fees collected from savings accounts.`,
      data: {
        loanId,
        totalAmount: finalTotal,
        totalFeesCollected,
        netDisbursed: finalTotal,
        memberCount: processedMembers.length,
        repaymentSchedulesCreated: memberRepaymentSchedules.length,
        interestRate: interestRate + '%',
        paymentFrequency: paymentFrequency,
        termValue: termValue,
        interestDetails: {
          totalInterest: groupLoanInterest.totalInterest,
          paymentAmount: groupLoanInterest.paymentAmount,
          totalRepayment: groupLoanInterest.totalRepayment,
          totalInstallments: groupLoanInterest.totalInstallments
        },
        memberAccounts: memberRepaymentSchedules.map(ms => ({
          memberId: ms.memberId,
          memberName: ms.memberName,
          loanAccountNo: ms.loanAccountNo,
          installmentAmount: ms.schedule.paymentAmount,
          totalInstallments: ms.schedule.totalInstallments,
          finalBalance: ms.schedule.installments[ms.schedule.installments.length - 1].remainingBalance
        }))
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Group loan creation failed:', error);
    res.status(400).json({ 
      success: false, 
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    await session.endSession();
  }
});

// Add this precise calculation function
const calculateFlatRatePrecise = ({ principal, annualRate, termMonths, startDate, paymentFrequency }) => {
  // Convert everything to pennies to avoid floating-point errors
  const principalInCents = Math.round(principal * 100);
  const monthlyRate = annualRate / 100 / 12;
  const totalInterestInCents = Math.round(principalInCents * monthlyRate * termMonths);
  const totalRepaymentInCents = principalInCents + totalInterestInCents;
  
  let totalInstallments;
  
  if (paymentFrequency.includes('WEEK')) {
    totalInstallments = termMonths * 4;
  } else {
    totalInstallments = termMonths;
  }
  
  const paymentInCents = Math.floor(totalRepaymentInCents / totalInstallments);
  const remainder = totalRepaymentInCents - (paymentInCents * totalInstallments);
  
  const installments = [];
  let remainingBalanceInCents = totalRepaymentInCents;
  
  for (let i = 1; i <= totalInstallments; i++) {
    const dueDate = new Date(startDate);
    if (paymentFrequency.includes('WEEK')) {
      dueDate.setDate(startDate.getDate() + (i * 7));
    } else {
      dueDate.setMonth(startDate.getMonth() + i);
    }
    
    let paymentThisInstallment = paymentInCents;
    
    // Add remainder to the first installment to distribute rounding difference
    if (i === 1) {
      paymentThisInstallment += remainder;
    }
    
    const principalThisInstallment = Math.floor(principalInCents / totalInstallments);
    const interestThisInstallment = paymentThisInstallment - principalThisInstallment;
    
    remainingBalanceInCents -= paymentThisInstallment;
    
    // Ensure final balance is exactly zero
    if (i === totalInstallments) {
      remainingBalanceInCents = 0;
    }
    
    installments.push({
      installmentNo: i,
      dueDate,
      principal: principalThisInstallment / 100,
      interest: interestThisInstallment / 100,
      totalPayment: paymentThisInstallment / 100,
      remainingBalance: Math.max(0, remainingBalanceInCents) / 100
    });
  }
  
  return {
    principal: principalInCents / 100,
    totalInterest: totalInterestInCents / 100,
    totalRepayment: totalRepaymentInCents / 100,
    paymentAmount: paymentInCents / 100,
    totalInstallments,
    installments
  };
};


// Helper function to get payment field name based on frequency
function getPaymentFieldName(paymentFrequency) {
  switch (paymentFrequency.toUpperCase()) {
    case 'WEEKLY':
      return 'WEEKLY_PAYMENT';
    case 'BI_WEEKLY':
      return 'BI_WEEKLY_PAYMENT';
    case 'MONTHLY':
    default:
      return 'MONTHLY_PAYMENT';
  }
}

/////////////////////////////////////////////////////////////////////////
// Add this to your GroupController.js
export const approveGroupLoan = asyncHandler(async (req, res) => {
  let loanId = req.params.id || req.params.groupLoanId || req.body.loanId;

  if (!loanId) {
    return res.status(400).json({
      success: false,
      message: "Group loan ID is required (e.g., GL000123)"
    });
  }

  loanId = loanId.toString().trim().toUpperCase();

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // Search by human-readable loanId (String)
      const groupLoan = await GroupLoan.findOne({ loanId }).session(session);

      if (!groupLoan) {
        throw new Error(`Group loan with ID ${loanId} not found`);
      }

      const userId = req.user?._id || req.user?.id;

      // Already approved? → Just update notes (idempotent)
      if (groupLoan.status === 'approved') {
        groupLoan.approvedAt = new Date();
        groupLoan.approvedBy = userId;
        groupLoan.approvalNotes = req.body.approvalNotes || groupLoan.approvalNotes || '';
        groupLoan.lastUpdatedBy = userId;

        await groupLoan.save({ session });

        await logAuditTrail(
          'GroupLoan',
          groupLoan._id.toString(),
          userId,
          'APPROVE_UPDATE',
          { status: 'approved' },
          { approvedAt: groupLoan.approvedAt, approvalNotes: groupLoan.approvalNotes },
          req.ip,
          'GROUP_LOAN_APPROVAL_UPDATE'
        );

        return;
      }

      // Cannot approve disbursed or rejected loans
      if (['disbursed', 'partially_disbursed'].includes(groupLoan.status)) {
        throw new Error(`Cannot approve: loan ${loanId} has already been disbursed`);
      }
      if (groupLoan.status === 'rejected') {
        throw new Error(`Cannot approve: loan ${loanId} was previously rejected`);
      }

      // APPROVE THE LOAN
      groupLoan.status = 'approved';
      groupLoan.approvedAt = new Date();
      groupLoan.approvedBy = userId;
      groupLoan.approvalNotes = req.body.approvalNotes || '';
      groupLoan.lastUpdatedBy = userId;

      await groupLoan.save({ session });

      // Update all individual loan accounts
      await LoanAccount.updateMany(
        { groupLoan: groupLoan._id },
        {
          LOAN_STATUS: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: userId
        },
        { session }
      );

      // Audit trail
      await logAuditTrail(
        'GroupLoan',
        groupLoan._id.toString(),
        userId,
        'APPROVE',
        { previousStatus: 'applied' },
        {
          status: 'approved',
          approvedAt: groupLoan.approvedAt,
          totalAmount: groupLoan.totalAmount
        },
        req.ip,
        'GROUP_LOAN_APPROVAL'
      );

      console.log(`Group loan ${loanId} approved by user ${userId}`);
    });

    // Final response
    const updatedLoan = await GroupLoan.findOne({ loanId })
      .select('loanId status approvedAt approvedBy approvalNotes totalAmount memberCount')
      .lean();

    res.status(200).json({
      success: true,
      message: `Group loan ${loanId} approved successfully`,
      data: updatedLoan
    });

  } catch (error) {
    console.error('Group loan approval failed:', error.message);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({
      success: false,
      message: error.message
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
  let loanId = req.params.groupLoanId || req.params.id || req.body.loanId;

  if (!loanId) {
    return res.status(400).json({
      success: false,
      message: "Group loan ID is required (e.g., GL000123)"
    });
  }

  loanId = loanId.toString().trim().toUpperCase();

  const { rejectionReason } = req.body;
  if (!rejectionReason?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Rejection reason is required"
    });
  }

  const session = new mongoose.Session();
  await session.startTransaction();

  try {
    // Search by human-readable loanId (String)
    const groupLoan = await GroupLoan.findOne({ loanId }).session(session);

    if (!groupLoan) {
      throw new Error(`Group loan with ID ${loanId} not found`);
    }

    const userId = req.user?._id || req.user?.id;

    // Already rejected?
    if (groupLoan.status === 'rejected') {
      throw new Error(`Group loan ${loanId} is already rejected`);
    }

    // Cannot reject disbursed loans
    if (['disbursed', 'partially_disbursed'].includes(groupLoan.status)) {
      throw new Error(`Cannot reject: loan ${loanId} has already been disbursed`);
    }

    // REJECT THE LOAN
    groupLoan.status = 'rejected';
    groupLoan.rejectedAt = new Date();
    groupLoan.rejectedBy = userId;
    groupLoan.rejectionReason = rejectionReason.trim();
    groupLoan.lastUpdatedBy = userId;

    await groupLoan.save({ session });

    // Update all individual loan accounts
    await LoanAccount.updateMany(
      { groupLoan: groupLoan._id },
      {
        LOAN_STATUS: 'REJECTED',
        rejectedAt: new Date(),
        rejectedBy: userId,
        rejectionReason: rejectionReason.trim()
      },
      { session }
    );

    // Audit trail
    await logAuditTrail(
      'GroupLoan',
      groupLoan._id.toString(),
      userId,
      'REJECT',
      { previousStatus: groupLoan.status },
      {
        status: 'rejected',
        rejectedAt: groupLoan.rejectedAt,
        rejectionReason: groupLoan.rejectionReason
      },
      req.ip,
      'GROUP_LOAN_REJECTION'
    );

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `Group loan ${loanId} rejected successfully`,
      data: {
        loanId: groupLoan.loanId,
        status: 'rejected',
        rejectedAt: groupLoan.rejectedAt,
        rejectedBy: groupLoan.rejectedBy,
        rejectionReason: groupLoan.rejectionReason
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Group loan rejection failed:', error.message);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({
      success: false,
      message: error.message
    });
  } finally {
    await session.endSession();
  }
});


///////////////////////////////////////////////////////////////////////
/// Get Approved Credit Applications - FIXED
//////////////////////////////////////////////////////////////////////



// UTILITY FUNCTIONS
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

// Helper to enhance applications (approved or rejected)
const enhanceApplications = (apps, type = 'approved') => {
  return apps.map(app => {
    const totalMembers = app.memberCount || (app.members?.length || 0);
    const memberPreview = app.members
      ? app.members.slice(0, 3).map(m => m.name || `Member ${m.memberId || 'Unknown'}`).join(', ')
      : '';

    const more = totalMembers > 3 ? ` and ${totalMembers - 3} more` : '';

    const dateField = type === 'approved' ? app.approvedAt : app.rejectedAt;
    const fallbackDate = app.applicationDate || new Date();
    const daysSince = Math.floor((Date.now() - new Date(dateField || fallbackDate)) / (1000 * 60 * 60 * 24));

    return {
      _id: app._id,
      loanId: app.loanId,
      groupCode: app.groupCode,
      groupName: app.group?.groupName || app.groupName || 'Unknown Group',
      totalAmount: app.totalAmount || 0,
      status: app.status,
      applicationDate: app.applicationDate,
      [type === 'approved' ? 'approvedAt' : 'rejectedAt']: dateField,
      [type === 'approved' ? 'approvedBy' : 'rejectedBy']: app[type === 'approved' ? 'approvedBy' : 'rejectedBy'],
      [type === 'approved' ? 'approvalNotes' : 'rejectionReason']: 
        type === 'approved' ? app.approvalNotes : app.rejectionReason,

      primaryRelationshipManager: app.primaryRelationshipManager || 'Unassigned',
      loanPurpose: app.loanPurpose || 'Not specified',
      interestRate: app.interestRate || 0,
      branch: app.branch || app.group?.branch,
      businessUnit: app.businessUnit || app.BU_ID,

      summary: {
        totalMembers,
        memberPreview: memberPreview + more,
        daysSince,
        totalFees: app.feeSummary?.totalFees || 0,
        netDisbursement: app.netDisbursementAmount || app.totalAmount || 0,
        totalRepayable: app.totalRepayable || (app.totalAmount + (app.totalInterest || 0)) || 0
      }
    };
  });
};

// GET APPROVED CREDIT APPLICATIONS WITH BU FILTERING
export const getApprovedCreditApplications = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 10, groupCode, branchId, primaryRM, showAll = false } = req.query;

    // Get user's BU_ID from request
    const userBUId = req.user?.BU_ID || req.user?.businessUnit || req.user?.branch;
    
    // Build filter
    const filter = { status: 'approved' };
    
    // Apply BU filtering unless showAll=true
    if (!showAll && userBUId) {
      filter.$or = [
        { businessUnit: userBUId },
        { BU_ID: userBUId },
        { branch: safeNumber(userBUId) }
      ];
    }
    
    // Apply optional filters
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
    const limitNum = Math.min(100, Math.max(1, safeNumber(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    console.log(`Fetching ${showAll ? 'ALL' : 'BU-filtered'} approved applications for BU: ${userBUId}`);

    // Fetch applications
    const applications = await GroupLoan.find(filter)
      .populate('group', 'groupName groupCode branch')
      .select('loanId groupCode group groupName totalAmount status applicationDate approvedAt approvedBy approvalNotes primaryRelationshipManager loanPurpose interestRate memberCount members feeSummary netDisbursementAmount totalRepayable branch businessUnit BU_ID')
      .sort({ approvedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await GroupLoan.countDocuments(filter);

    const message = showAll 
      ? `Found ${applications.length} approved credit applications (all business units)`
      : `Found ${applications.length} approved credit applications for your business unit (BU: ${userBUId})`;

    res.json({
      success: true,
      message,
      count: applications.length,
      total,
      userBUId: showAll ? null : userBUId,
      showAll: !!showAll,
      data: enhanceApplications(applications, 'approved'),
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum * limitNum < total,
        hasPrev: pageNum > 1
      }
    });

  } catch (error) {
    console.error('Error in getApprovedCreditApplications:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error occurred'
    });
  }
});

// GET REJECTED CREDIT APPLICATIONS WITH BU FILTERING
export const getRejectedCreditApplications = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 10, groupCode, branchId, primaryRM, showAll = false } = req.query;

    // Get user's BU_ID from request
    const userBUId = req.user?.BU_ID || req.user?.businessUnit || req.user?.branch;
    
    // Build filter
    const filter = { status: 'rejected' };
    
    // Apply BU filtering unless showAll=true
    if (!showAll && userBUId) {
      filter.$or = [
        { businessUnit: userBUId },
        { BU_ID: userBUId },
        { branch: safeNumber(userBUId) }
      ];
    }
    
    // Apply optional filters
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
    const limitNum = Math.min(100, Math.max(1, safeNumber(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    console.log(`Fetching ${showAll ? 'ALL' : 'BU-filtered'} rejected applications for BU: ${userBUId}`);

    // Fetch applications
    const applications = await GroupLoan.find(filter)
      .populate('group', 'groupName groupCode branch')
      .select('loanId groupCode group groupName totalAmount status applicationDate rejectedAt rejectedBy rejectionReason primaryRelationshipManager loanPurpose interestRate memberCount members branch businessUnit BU_ID')
      .sort({ rejectedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await GroupLoan.countDocuments(filter);

    const message = showAll 
      ? `Found ${applications.length} rejected credit applications (all business units)`
      : `Found ${applications.length} rejected credit applications for your business unit (BU: ${userBUId})`;

    res.json({
      success: true,
      message,
      count: applications.length,
      total,
      userBUId: showAll ? null : userBUId,
      showAll: !!showAll,
      data: enhanceApplications(applications, 'rejected'),
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum * limitNum < total,
        hasPrev: pageNum > 1
      }
    });

  } catch (error) {
    console.error('Error in getRejectedCreditApplications:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error occurred'
    });
  }
});

// Updated disburseGroupLoan function
export const disburseGroupLoan = asyncHandler(async (req, res) => {
  let groupLoanId = req.params.groupLoanId || req.params.id || req.body.loanId;

  if (!groupLoanId) {
    return res.status(400).json({
      success: false,
      message: "Group loan ID is required (e.g., GL000123)"
    });
  }

  groupLoanId = groupLoanId.toString().trim().toUpperCase();
  console.log(`=== STARTING DISBURSEMENT FOR GROUP LOAN: ${groupLoanId} ===`);

  const session = await mongoose.startSession();

  const results = {
    successful: [],
    failed: [],
    feesCollected: [],
    insufficientFunds: [],
    missingSavingsAccounts: [],
    invalidLoanAccounts: [],
    validationErrors: []
  };

  const safeNumber = (v, def = 0) => (isNaN(Number(v)) ? def : Number(v));

  try {
    await session.withTransaction(async () => {
      // STEP 1: Find the group loan
      console.log(`🔍 Looking for group loan: ${groupLoanId}`);
      const groupLoan = await GroupLoan.findOne({ loanId: groupLoanId })
        .populate('individualLoanAccounts')
        .populate('members.memberId')
        .session(session);

      if (!groupLoan) {
        throw new Error(`Group loan with ID ${groupLoanId} not found`);
      }

      console.log(`✅ Found group loan: ${groupLoan.loanId}, Status: ${groupLoan.status}, Members: ${groupLoan.members?.length || 0}`);

      // Check if already disbursed
      if (['disbursed', 'partially_disbursed', 'active'].includes(groupLoan.status)) {
        throw new Error(`Cannot disburse: loan ${groupLoan.loanId} has already been disbursed. Current status: ${groupLoan.status}`);
      }

      if (groupLoan.status !== 'approved') {
        throw new Error(`Loan ${groupLoan.loanId} is not approved. Current status: ${groupLoan.status}`);
      }

      // STEP 2: Get loan accounts
      console.log(`🔍 Looking for loan accounts for group loan: ${groupLoan._id}`);
      const loanAccounts = await LoanAccount.find({
        groupLoan: groupLoan._id
      }).session(session);

      console.log(`📊 Found ${loanAccounts.length} loan accounts total`);

      // Filter eligible loan accounts
      const eligibleLoanAccounts = loanAccounts.filter(acc => {
        const status = (acc.LOAN_STATUS || '').toString().toUpperCase();
        const eligibleStatuses = ['APPROVED', 'APPROVED_PENDING_DISBURSAL', 'PENDING', 'approved', 'pending'];
        const isEligible = eligibleStatuses.includes(status);
        
        if (!isEligible) {
          console.log(`❌ Loan account ${acc.ACCT_NO} has ineligible status: ${status}`);
        }
        
        return isEligible;
      });

      console.log(`✅ ${eligibleLoanAccounts.length} loan accounts eligible for disbursement`);

      if (eligibleLoanAccounts.length === 0) {
        throw new Error('No eligible loan accounts found for disbursement');
      }

      // STEP 3: Process each loan account
      for (const loanAcc of eligibleLoanAccounts) {
        console.log(`\n--- Processing loan account: ${loanAcc.ACCT_NO} ---`);
        
        try {
          // Validate loan account
          if (!loanAcc.ACCT_NO || loanAcc.ACCT_NO.toString().length < 5) {
            const errorMsg = `Invalid loan account number: ${loanAcc.ACCT_NO}`;
            console.log(`❌ ${errorMsg}`);
            results.invalidLoanAccounts.push({
              custId: loanAcc.CUST_ID,
              name: loanAcc.ACCT_NM,
              loanAccountNo: loanAcc.ACCT_NO,
              reason: errorMsg
            });
            continue;
          }

          // Determine savings account number
          const savingsAccNo = loanAcc.savingsAccountNo || groupLoan.savingsAccount;
          if (!savingsAccNo) {
            const errorMsg = 'No savings account specified';
            console.log(`❌ ${errorMsg}`);
            results.missingSavingsAccounts.push({
              custId: loanAcc.CUST_ID,
              name: loanAcc.ACCT_NM,
              loanAccountNo: loanAcc.ACCT_NO,
              reason: errorMsg
            });
            continue;
          }

          console.log(`💳 Savings account to use: ${savingsAccNo}`);

          // Determine loan amount
          const loanAmount = safeNumber(
            loanAcc.DISBURSEMENT_LIMIT || 
            loanAcc.ORIGINAL_PRINCIPAL || 
            groupLoan.individualShare || 
            (groupLoan.totalAmount / groupLoan.memberCount)
          );

          if (loanAmount <= 0) {
            const errorMsg = `Invalid loan amount: ${loanAmount}`;
            console.log(`❌ ${errorMsg}`);
            results.validationErrors.push({
              custId: loanAcc.CUST_ID,
              loanAccountNo: loanAcc.ACCT_NO,
              reason: errorMsg
            });
            continue;
          }

          console.log(`💰 Loan amount: ₦${loanAmount}`);

          // Find savings account
          console.log(`🔍 Searching for savings account by account_number: ${savingsAccNo}`);
          let savingsAccount = await CustomerAccount.findOne({
            account_number: savingsAccNo
          }).session(session);

          if (!savingsAccount) {
            // Try alternative search if account_number doesn't work
            console.log(`🔍 Trying alternative search for savings account: ${savingsAccNo}`);
            savingsAccount = await CustomerAccount.findOne({
              $or: [
                { ACCT_NO: savingsAccNo },
                { account_no: savingsAccNo }
              ]
            }).session(session);

            if (!savingsAccount) {
              const errorMsg = `Savings account ${savingsAccNo} not found`;
              console.log(`❌ ${errorMsg}`);
              results.missingSavingsAccounts.push({
                custId: loanAcc.CUST_ID,
                name: loanAcc.ACCT_NM,
                loanAccountNo: loanAcc.ACCT_NO,
                savingsAccountNo: savingsAccNo,
                reason: errorMsg
              });
              continue;
            }
          }

          console.log(`✅ Found savings account: ${savingsAccount.account_number || savingsAccount.ACCT_NO}`);

          // Check account status
          const accountStatus = (savingsAccount.status || savingsAccount.REC_ST || '').toString().toUpperCase();
          console.log(`📊 Savings account status: ${accountStatus}`);
          
          const activeStatuses = ['ACTIVE', 'A', 'OPEN', 'LIVE'];
          if (!activeStatuses.includes(accountStatus)) {
            const errorMsg = `Savings account not active. Status: ${accountStatus}`;
            console.log(`❌ ${errorMsg}`);
            results.validationErrors.push({
              custId: loanAcc.CUST_ID,
              loanAccountNo: loanAcc.ACCT_NO,
              savingsAccountNo: savingsAccNo,
              reason: errorMsg
            });
            continue;
          }

          // Check available balance
          const availableBalance = safeNumber(
            savingsAccount.AVAILABLE_BALANCE || 
            savingsAccount.ledger_balance || 
            savingsAccount.cleared_balance ||
            savingsAccount.balance ||
            0
          );

          console.log(`💵 Available balance: ₦${availableBalance}`);

          // Check fees
          const totalFees = safeNumber(loanAcc.FEE_DETAILS?.totalFees || 0);
          console.log(`💸 Total fees: ₦${totalFees}`);

          if (totalFees > 0 && availableBalance < totalFees) {
            const errorMsg = `Insufficient funds for fees. Required: ₦${totalFees}, Available: ₦${availableBalance}`;
            console.log(`❌ ${errorMsg}`);
            results.insufficientFunds.push({
              custId: loanAcc.CUST_ID,
              loanAccountNo: loanAcc.ACCT_NO,
              savingsAccountNo: savingsAccNo,
              required: totalFees,
              available: availableBalance,
              shortfall: totalFees - availableBalance,
              reason: errorMsg
            });
            continue;
          }

          // === PROCESS DISBURSEMENT ===
          console.log(`🔄 Starting disbursement process...`);

          // STEP 1: Deduct fees if any
          if (totalFees > 0) {
            console.log(`💳 Deducting fees: ₦${totalFees}`);
            savingsAccount.AVAILABLE_BALANCE = availableBalance - totalFees;
            if (savingsAccount.ledger_balance !== undefined) {
              savingsAccount.ledger_balance -= totalFees;
            }
            if (savingsAccount.cleared_balance !== undefined) {
              savingsAccount.cleared_balance -= totalFees;
            }
            await savingsAccount.save({ session });

            // Create fee transaction - FIXED: Added ACCT_ID
            const feeTransaction = new Transaction({
              ACCT_NO: savingsAccNo,
              ACCT_ID: savingsAccount._id?.toString() || savingsAccount.ACCT_ID || savingsAccNo, // FIX: Added ACCT_ID
              ACCT_NM: savingsAccount.account_name || savingsAccount.ACCT_NM || loanAcc.ACCT_NM,
              CUST_ID: savingsAccount.customer_id || savingsAccount.CUST_ID || loanAcc.CUST_ID,
              TRANSACTION_TYPE: 'DEBIT',
              AMOUNT: totalFees,
              BU_ID: Number(savingsAccount.branch?.toString() || groupLoan.branch?.toString() || '100'), // FIX: Ensure number
              description: `Loan fees for ${groupLoan.loanId}`,
              status: 'COMPLETED',
              createdBy: req.user?._id?.toString() || 'SYSTEM',
              currency: 'NGN',
              metadata: { 
                purpose: 'LOAN_FEES', 
                loanId: groupLoan.loanId,
                loanAccountNo: loanAcc.ACCT_NO,
                memberId: loanAcc.CUST_ID
              }
            });

            await feeTransaction.save({ session });
            results.feesCollected.push({
              custId: loanAcc.CUST_ID,
              name: loanAcc.ACCT_NM,
              amount: totalFees,
              loanAccountNo: loanAcc.ACCT_NO,
              savingsAccountNo: savingsAccNo
            });
            console.log(`✅ Fees deducted successfully`);
          }

          // STEP 2: Credit loan amount to savings
          const currentBalance = safeNumber(
            savingsAccount.AVAILABLE_BALANCE || 
            savingsAccount.ledger_balance || 
            savingsAccount.cleared_balance || 
            0
          );
          
          console.log(`💰 Crediting loan amount: ₦${loanAmount} to savings account`);
          
          savingsAccount.AVAILABLE_BALANCE = currentBalance + loanAmount;
          if (savingsAccount.ledger_balance !== undefined) {
            savingsAccount.ledger_balance += loanAmount;
          }
          if (savingsAccount.cleared_balance !== undefined) {
            savingsAccount.cleared_balance += loanAmount;
          }
          await savingsAccount.save({ session });

          // Create credit transaction - FIXED: Added ACCT_ID
          const creditTransaction = new Transaction({
            ACCT_NO: savingsAccNo,
            ACCT_ID: savingsAccount._id?.toString() || savingsAccount.ACCT_ID || savingsAccNo, // FIX: Added ACCT_ID
            ACCT_NM: savingsAccount.account_name || savingsAccount.ACCT_NM || loanAcc.ACCT_NM,
            CUST_ID: savingsAccount.customer_id || savingsAccount.CUST_ID || loanAcc.CUST_ID,
            TRANSACTION_TYPE: 'CREDIT',
            AMOUNT: loanAmount,
            BU_ID: Number(savingsAccount.branch?.toString() || groupLoan.branch?.toString() || '100'), // FIX: Ensure number
            description: `Loan disbursement - ${groupLoan.loanId}`,
            status: 'COMPLETED',
            createdBy: req.user?._id?.toString() || 'SYSTEM',
            currency: 'NGN',
            metadata: { 
              purpose: 'LOAN_DISBURSEMENT', 
              loanId: groupLoan.loanId,
              loanAccountNo: loanAcc.ACCT_NO,
              memberId: loanAcc.CUST_ID
            }
          });

          await creditTransaction.save({ session });
          console.log(`✅ Loan amount credited to savings account`);

          // STEP 3: Update loan account
          console.log(`📝 Updating loan account status...`);
          loanAcc.LOAN_STATUS = 'ACTIVE';
          loanAcc.ACTUAL_DISBURSEMENT = loanAmount;
          loanAcc.disbursedAt = new Date();
          loanAcc.START_DT = new Date();
          loanAcc.OUTSTANDING_PRINCIPAL = loanAmount;
          loanAcc.ledger_balance = -loanAmount;
          loanAcc.outstanding_balance = loanAmount;
          loanAcc.AVAILABLE_BALANCE = 0;
          loanAcc.REC_ST = 'A';

          await loanAcc.save({ session });
          console.log(`✅ Loan account updated successfully`);

          // Record success
          results.successful.push({
            custId: loanAcc.CUST_ID,
            name: loanAcc.ACCT_NM,
            loanAccountNo: loanAcc.ACCT_NO,
            savingsAccountNo: savingsAccNo,
            loanAmount: loanAmount,
            feesDeducted: totalFees,
            netReceived: loanAmount - totalFees,
            savingsBalanceBefore: currentBalance,
            savingsBalanceAfter: currentBalance + loanAmount - totalFees
          });

          console.log(`🎉 SUCCESS: Disbursement completed for ${loanAcc.ACCT_NM}`);

        } catch (error) {
          console.error(`💥 ERROR processing ${loanAcc.ACCT_NO}:`, error.message);
          results.failed.push({
            custId: loanAcc.CUST_ID,
            loanAccountNo: loanAcc.ACCT_NO,
            name: loanAcc.ACCT_NM,
            savingsAccountNo: loanAcc.savingsAccountNo,
            reason: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
          });
        }
      }

      // STEP 4: Update group loan status
      console.log(`\n=== DISBURSEMENT SUMMARY ===`);
      console.log(`Successful: ${results.successful.length}`);
      console.log(`Failed: ${results.failed.length}`);
      console.log(`Missing Savings: ${results.missingSavingsAccounts.length}`);
      console.log(`Insufficient Funds: ${results.insufficientFunds.length}`);
      console.log(`Invalid Accounts: ${results.invalidLoanAccounts.length}`);

      if (results.successful.length === eligibleLoanAccounts.length) {
        groupLoan.status = 'disbursed';
        console.log(`✅ All disbursements successful - marking as DISBURSED`);
      } else if (results.successful.length > 0) {
        groupLoan.status = 'partially_disbursed';
        console.log(`⚠️ Partial disbursement - marking as PARTIALLY_DISBURSED`);
      } else {
        groupLoan.status = 'approved';
        console.log(`❌ All disbursements failed - keeping as APPROVED`);
      }

      groupLoan.disbursedAt = new Date();
      groupLoan.actualDisbursementDate = new Date();
      groupLoan.disbursementResults = {
        summary: {
          totalMembers: eligibleLoanAccounts.length,
          successful: results.successful.length,
          failed: results.failed.length,
          insufficientFunds: results.insufficientFunds.length,
          missingSavingsAccounts: results.missingSavingsAccounts.length,
          invalidLoanAccounts: results.invalidLoanAccounts.length,
          validationErrors: results.validationErrors.length,
          totalDisbursed: results.successful.reduce((sum, s) => sum + s.loanAmount, 0),
          totalFeesCollected: results.feesCollected.reduce((sum, f) => sum + f.amount, 0),
          disbursementDate: new Date(),
          processedBy: req.user?._id || 'SYSTEM'
        },
        details: results
      };

      await groupLoan.save({ session });
      console.log(`💾 Group loan status updated to: ${groupLoan.status}`);
    });

    // Prepare final response
    const totalProcessed = results.successful.length + results.failed.length + 
                         results.missingSavingsAccounts.length + results.invalidLoanAccounts.length +
                         results.validationErrors.length;

    const response = {
      success: results.successful.length > 0,
      message: results.successful.length > 0 
        ? `Disbursement completed for ${results.successful.length}/${totalProcessed} members` 
        : 'Disbursement failed for all members',
      summary: {
        totalProcessed,
        successful: results.successful.length,
        failed: results.failed.length,
        missingSavingsAccounts: results.missingSavingsAccounts.length,
        invalidLoanAccounts: results.invalidLoanAccounts.length,
        validationErrors: results.validationErrors.length,
        insufficientFunds: results.insufficientFunds.length,
        feesCollected: results.feesCollected.length,
        totalDisbursed: results.successful.reduce((sum, s) => sum + s.loanAmount, 0),
        totalFees: results.feesCollected.reduce((sum, f) => sum + f.amount, 0)
      },
      details: results
    };

    if (results.successful.length === 0) {
      return res.status(400).json(response);
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('💥 DISBURSEMENT FAILED:', error.message);
    res.status(400).json({
      success: false,
      message: error.message || 'Disbursement failed',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    await session.endSession();
    console.log(`=== DISBURSEMENT PROCESS COMPLETED ===`);
  }
});
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

// GROUP REPAYMENT
// controllers/groupRepaymentController.js

// controllers/groupRepaymentController.js

export const getGroupCollectionSheet = asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  if (!groupId) {
    return res.status(400).json({
      success: false,
      message: "Group ID is required (e.g., GL90659288STV3)"
    });
  }

  try {
    console.log(`🔍 Fetching collection sheet for group: ${groupId}`);

    // STEP 1: Find the group loan
    const groupLoan = await GroupLoan.findOne({ 
      loanId: groupId.toUpperCase() 
    })
    .populate('members.memberId')
    .populate('individualLoanAccounts');

    if (!groupLoan) {
      return res.status(404).json({
        success: false,
        message: `Group loan with ID ${groupId} not found`
      });
    }

    console.log(`✅ Found group loan: ${groupLoan.loanId}, Status: ${groupLoan.status}`);

    // STEP 2: Get all loan accounts for this group
    const loanAccounts = await LoanAccount.find({
      groupLoan: groupLoan._id
    })
    .populate('CUST_ID')
    .sort({ ACCT_NO: 1 });

    console.log(`📊 Found ${loanAccounts.length} loan accounts for group`);

    // STEP 3: Get loan account summaries (handle case where model might not exist)
    let loanSummaries = [];
    let summaryMap = new Map();
    
    try {
      // Check if LoanAccountSummary model exists
      if (mongoose.modelNames().includes('LoanAccountSummary')) {
        const LoanAccountSummary = mongoose.model('LoanAccountSummary');
        const loanAccountIds = loanAccounts.map(acc => acc._id);
        
        loanSummaries = await LoanAccountSummary.find({
          ACCT_ID: { $in: loanAccountIds }
        });

        // Create a map for quick lookup
        loanSummaries.forEach(summary => {
          summaryMap.set(summary.ACCT_ID.toString(), summary);
        });
      } else {
        console.log('⚠️ LoanAccountSummary model not found, using fallback data');
      }
    } catch (error) {
      console.log('⚠️ Could not fetch loan summaries, using fallback data:', error.message);
    }

    // STEP 4: Get recent payment transactions
    const recentPayments = await Transaction.find({
      ACCT_NO: { $in: loanAccounts.map(acc => acc.ACCT_NO) },
      TRANSACTION_TYPE: 'CREDIT',
      status: 'COMPLETED',
      'metadata.purpose': 'LOAN_REPAYMENT'
    })
    .sort({ TRANSACTIONDATE: -1 });

    // Group recent payments by account
    const paymentMap = new Map();
    recentPayments.forEach(payment => {
      if (!paymentMap.has(payment.ACCT_NO)) {
        paymentMap.set(payment.ACCT_NO, []);
      }
      paymentMap.get(payment.ACCT_NO).push(payment);
    });

    // STEP 5: Build collection sheet data
    const collectionSheet = {
      groupInfo: {
        groupId: groupLoan.loanId,
        groupName: groupLoan.groupName || `Group ${groupLoan.loanId}`,
        totalMembers: groupLoan.members?.length || 0,
        totalLoanAmount: groupLoan.totalAmount || 0,
        status: groupLoan.status,
        productId: groupLoan.productId,
        disbursementDate: groupLoan.disbursedAt,
        createdAt: groupLoan.createdAt,
        paymentFrequency: groupLoan.paymentFrequency || 'WEEKLY'
      },
      summary: {
        totalMembers: loanAccounts.length,
        totalOutstanding: 0,
        totalInstallmentAmount: 0,
        activeMembers: 0,
        overdueMembers: 0,
        totalLoanAmount: 0
      },
      members: []
    };

    // STEP 6: Process each member's repayment details
    for (const loanAcc of loanAccounts) {
      try {
        const loanSummary = summaryMap.get(loanAcc._id.toString());
        const memberPayments = paymentMap.get(loanAcc.ACCT_NO) || [];
        
        // Calculate net disbursement amount (loan amount minus fees)
        const loanAmount = loanAcc.ACTUAL_DISBURSEMENT || 
                          loanAcc.ORIGINAL_PRINCIPAL || 
                          loanAcc.DISBURSEMENT_LIMIT || 
                          (groupLoan.totalAmount / groupLoan.members?.length) || 0;
        
        const fees = loanAcc.FEE_DETAILS?.totalFees || 0;
        const netDisbursementAmount = Math.max(0, loanAmount - fees);

        // Get last payment amount
        const lastPayment = memberPayments.length > 0 ? memberPayments[0] : null;
        const lastPaymentAmount = lastPayment ? lastPayment.AMOUNT : 0;

        // Calculate total repayment (principal + interest paid so far)
        const totalRepayment = memberPayments.reduce((sum, payment) => sum + payment.AMOUNT, 0);

        // Get installment amount from group loan or calculate
        const installmentAmount = groupLoan.installmentAmount || 
                                loanAcc.installmentAmount ||
                                (loanSummary?.INSTALLMENT_AMOUNT || 
                                (loanAmount * 0.05)); // 5% as fallback

        // Determine payment frequency
        const paymentFrequency = groupLoan.paymentFrequency || 
                               loanAcc.PAYMENT_FREQUENCY || 
                               'WEEKLY';

        // Calculate outstanding balance - use multiple fallbacks
        let outstandingBalance = 0;
        if (loanSummary) {
          outstandingBalance = loanSummary.OUTSTANDING_PRINCIPAL || 
                             loanSummary.CLEARED_BAL || 
                             (loanAmount - totalRepayment);
        } else {
          // Fallback calculation
          outstandingBalance = Math.max(0, loanAmount - totalRepayment);
        }

        // Get next payment date
        let nextPaymentDate = null;
        if (loanSummary && loanSummary.NEXT_PAYMENT_DT) {
          nextPaymentDate = loanSummary.NEXT_PAYMENT_DT;
        } else {
          // Calculate next payment date based on start date and frequency
          const startDate = loanAcc.START_DT || loanAcc.disbursedAt || groupLoan.disbursedAt;
          if (startDate) {
            const nextDate = new Date(startDate);
            if (paymentFrequency === 'WEEKLY') {
              nextDate.setDate(nextDate.getDate() + 7);
            } else if (paymentFrequency === 'MONTHLY') {
              nextDate.setMonth(nextDate.getMonth() + 1);
            } else if (paymentFrequency === 'BI-WEEKLY') {
              nextDate.setDate(nextDate.getDate() + 14);
            }
            nextPaymentDate = nextDate;
          }
        }

        // Check if member is overdue
        const isOverdue = nextPaymentDate && new Date(nextPaymentDate) < new Date();
        const daysOverdue = isOverdue ? 
          Math.floor((new Date() - new Date(nextPaymentDate)) / (1000 * 60 * 60 * 24)) : 0;

        // Build member repayment record
        const memberRecord = {
          // Basic member info
          memberId: loanAcc.CUST_ID?._id || loanAcc.CUST_ID,
          customerId: loanAcc.CUST_ID?.CUST_ID || loanAcc.CUST_ID,
          customerName: loanAcc.CUST_ID?.FIRST_NM ? 
            `${loanAcc.CUST_ID.FIRST_NM || ''} ${loanAcc.CUST_ID.MIDDLE_NM || ''} ${loanAcc.CUST_ID.LAST_NM || ''}`.trim() :
            loanAcc.ACCT_NM || 'Customer Name Not Available',
          
          // Loan account info
          loanAccountNo: loanAcc.ACCT_NO || 'N/A',
          accountName: loanAcc.ACCT_NM || 'N/A',
          
          // Financial details
          netDisbursementAmount: parseFloat(netDisbursementAmount.toFixed(2)),
          loanAmount: parseFloat(loanAmount.toFixed(2)),
          feesDeducted: parseFloat(fees.toFixed(2)),
          installmentAmount: parseFloat(installmentAmount.toFixed(2)),
          totalRepayment: parseFloat(totalRepayment.toFixed(2)),
          outstandingBalance: parseFloat(Math.max(0, outstandingBalance).toFixed(2)),
          lastPaymentAmount: parseFloat(lastPaymentAmount.toFixed(2)),
          
          // Dates and frequency
          startDate: loanAcc.START_DT || loanAcc.disbursedAt,
          nextPaymentDate: nextPaymentDate,
          paymentFrequency: paymentFrequency,
          lastPaymentDate: lastPayment?.TRANSACTIONDATE,
          
          // Status
          isOverdue: isOverdue,
          daysOverdue: daysOverdue,
          loanStatus: loanAcc.LOAN_STATUS || 'ACTIVE'
        };

        collectionSheet.members.push(memberRecord);

        // Update summary totals
        collectionSheet.summary.totalOutstanding += memberRecord.outstandingBalance;
        collectionSheet.summary.totalInstallmentAmount += memberRecord.installmentAmount;
        collectionSheet.summary.totalLoanAmount += memberRecord.loanAmount;
        collectionSheet.summary.activeMembers++;
        
        if (memberRecord.isOverdue) {
          collectionSheet.summary.overdueMembers++;
        }

      } catch (error) {
        console.error(`❌ Error processing member ${loanAcc.ACCT_NO}:`, error.message);
        // Continue with next member even if one fails
      }
    }

    // STEP 7: Final calculations
    collectionSheet.summary.averageInstallment = collectionSheet.members.length > 0 ?
      collectionSheet.summary.totalInstallmentAmount / collectionSheet.members.length : 0;

    collectionSheet.summary.collectionRate = collectionSheet.summary.totalLoanAmount > 0 ?
      ((collectionSheet.summary.totalLoanAmount - collectionSheet.summary.totalOutstanding) / 
       collectionSheet.summary.totalLoanAmount * 100) : 0;

    // Sort members by customer name for easy reference
    collectionSheet.members.sort((a, b) => a.customerName.localeCompare(b.customerName));

    console.log(`✅ Collection sheet generated successfully`);
    console.log(`📋 Summary: ${collectionSheet.members.length} members, ₦${collectionSheet.summary.totalOutstanding.toLocaleString()} total outstanding`);

    res.status(200).json({
      success: true,
      message: `Collection sheet generated for group ${groupId}`,
      data: collectionSheet,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('💥 ERROR generating collection sheet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate collection sheet',
      error: error.message
    });
  }
});

// Submit collections API
export const submitGroupCollections = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { groupId, collections, savings, collectedBy, collectionDate } = req.body;

    if (!groupId || !collections) {
      return res.status(400).json({
        success: false,
        message: 'Group ID and collections data are required'
      });
    }

    await session.withTransaction(async () => {
      const results = {
        successful: [],
        failed: []
      };

      // Process each collection
      for (const collection of collections) {
        try {
          if (!collection.accountNo || !collection.amount) {
            results.failed.push({
              accountNo: collection.accountNo,
              reason: 'Missing account number or amount'
            });
            continue;
          }

          // Find the loan account
          const loanAccount = await LoanAccount.findOne({ 
            ACCT_NO: collection.accountNo 
          }).session(session);

          if (!loanAccount) {
            results.failed.push({
              accountNo: collection.accountNo,
              reason: 'Loan account not found'
            });
            continue;
          }

          // Create repayment transaction
          const repaymentTransaction = new Transaction({
            ACCT_NO: collection.accountNo,
            ACCT_ID: loanAccount._id.toString(),
            ACCT_NM: loanAccount.ACCT_NM,
            CUST_ID: loanAccount.CUST_ID,
            TRANSACTION_TYPE: 'CREDIT',
            AMOUNT: collection.amount,
            BU_ID: loanAccount.BU_ID || 100,
            description: `Loan repayment - Group ${groupId}`,
            status: 'COMPLETED',
            createdBy: collectedBy || 'FIELD_AGENT',
            currency: 'NGN',
            metadata: {
              purpose: 'LOAN_REPAYMENT',
              groupId: groupId,
              paymentMethod: collection.paymentMethod,
              receiptNo: collection.receiptNo,
              collectionDate: collectionDate
            }
          });

          await repaymentTransaction.save({ session });

          // Update loan account outstanding balance
          const currentOutstanding = loanAccount.OUTSTANDING_PRINCIPAL || loanAccount.outstanding_balance || 0;
          loanAccount.OUTSTANDING_PRINCIPAL = Math.max(0, currentOutstanding - collection.amount);
          loanAccount.outstanding_balance = Math.max(0, currentOutstanding - collection.amount);
          loanAccount.LAST_PAYMENT_DATE = new Date();
          loanAccount.LAST_PAYMENT_AMOUNT = collection.amount;

          await loanAccount.save({ session });

          results.successful.push({
            accountNo: collection.accountNo,
            amount: collection.amount,
            transactionId: repaymentTransaction._id
          });

        } catch (error) {
          results.failed.push({
            accountNo: collection.accountNo,
            reason: error.message
          });
        }
      }

      // Process savings if any
      if (savings && savings.length > 0) {
        for (const saving of savings) {
          try {
            if (!saving.accountNo || !saving.amount) continue;

            // Find savings account
            const savingsAccount = await CustomerAccount.findOne({
              account_number: saving.accountNo
            }).session(session);

            if (savingsAccount) {
              // Create savings transaction
              const savingsTransaction = new Transaction({
                ACCT_NO: saving.accountNo,
                ACCT_ID: savingsAccount._id.toString(),
                ACCT_NM: savingsAccount.account_name || savingsAccount.ACCT_NM,
                CUST_ID: savingsAccount.customer_id || savingsAccount.CUST_ID,
                TRANSACTION_TYPE: 'CREDIT',
                AMOUNT: saving.amount,
                BU_ID: savingsAccount.branch || 100,
                description: `Savings collection - Group ${groupId}`,
                status: 'COMPLETED',
                createdBy: collectedBy || 'FIELD_AGENT',
                currency: 'NGN',
                metadata: {
                  purpose: 'SAVINGS_COLLECTION',
                  groupId: groupId,
                  collectionDate: collectionDate
                }
              });

              await savingsTransaction.save({ session });

              // Update savings account balance
              savingsAccount.AVAILABLE_BALANCE = (savingsAccount.AVAILABLE_BALANCE || 0) + saving.amount;
              if (savingsAccount.ledger_balance !== undefined) {
                savingsAccount.ledger_balance += saving.amount;
              }

              await savingsAccount.save({ session });
            }
          } catch (error) {
            console.error(`Error processing savings for ${saving.accountNo}:`, error.message);
          }
        }
      }

      // Update group loan with collection summary
      const groupLoan = await GroupLoan.findOne({ loanId: groupId }).session(session);
      if (groupLoan) {
        if (!groupLoan.collectionHistory) {
          groupLoan.collectionHistory = [];
        }

        groupLoan.collectionHistory.push({
          collectionDate: collectionDate || new Date(),
          collectedBy: collectedBy,
          loanCollections: collections,
          savingsCollections: savings || [],
          successfulCollections: results.successful.length,
          failedCollections: results.failed.length,
          totalCollected: collections.reduce((sum, col) => sum + col.amount, 0)
        });

        await groupLoan.save({ session });
      }

      res.status(200).json({
        success: true,
        message: `Collections submitted successfully. ${results.successful.length} successful, ${results.failed.length} failed.`,
        data: results
      });
    });

  } catch (error) {
    console.error('Error submitting collections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit collections',
      error: error.message
    });
  } finally {
    await session.endSession();
  }
});

// ==================== HELPER FUNCTIONS ====================

// Helper function to calculate expected repayment amounts
const calculateExpectedRepayment = (groupLoan, paymentFrequency) => {
  console.log('=== CALCULATING EXPECTED REPAYMENT ===');
  console.log('Group Loan Total:', groupLoan.totalAmount);
  console.log('Interest Rate:', groupLoan.interestRate);
  console.log('Term Value:', groupLoan.termValue);
  console.log('Payment Frequency:', paymentFrequency);

  const principal = groupLoan.totalAmount || 0;
  const interestRate = groupLoan.interestRate || 0;
  const termValue = groupLoan.termValue || 12;
  
  // Calculate total interest (simple interest for now)
  const totalInterest = principal * (interestRate / 100) * (termValue / 12);
  const totalRepayment = principal + totalInterest;
  
  // Calculate installment amount based on payment frequency
  let installmentAmount = 0;
  let totalInstallments = termValue;
  
  if (paymentFrequency.includes('WEEK')) {
    totalInstallments = termValue * 4; // Approximate weeks in month
    installmentAmount = totalRepayment / totalInstallments;
  } else if (paymentFrequency.includes('MONTH')) {
    installmentAmount = totalRepayment / totalInstallments;
  } else {
    // Default to monthly
    installmentAmount = totalRepayment / totalInstallments;
  }
  
  const result = {
    principal,
    totalInterest,
    totalRepayment,
    installmentAmount: Math.round(installmentAmount * 100) / 100,
    totalInstallments,
    paymentFrequency
  };
  
  console.log('Expected Repayment Calculation:', result);
  return result;
};

// Helper function to calculate accrued interest
const calculateAccruedInterest = (groupLoan, expectedRepaymentDetails) => {
  console.log('=== CALCULATING ACCRUED INTEREST ===');
  
  const principal = groupLoan.totalAmount || 0;
  const interestRate = groupLoan.interestRate || 0;
  const totalInterest = expectedRepaymentDetails.totalInterest || 0;
  
  // Simple calculation: assume interest accrues linearly
  const totalRepaid = groupLoan.totalRepaid || 0;
  const installmentsPaid = groupLoan.installmentsPaid || 0;
  const totalInstallments = expectedRepaymentDetails.totalInstallments || 12;
  
  const accruedInterestPerInstallment = totalInterest / totalInstallments;
  const totalAccruedInterest = accruedInterestPerInstallment * installmentsPaid;
  
  const result = {
    totalAccruedInterest: Math.round(totalAccruedInterest * 100) / 100,
    accruedInterestPerInstallment: Math.round(accruedInterestPerInstallment * 100) / 100,
    installmentsPaid,
    totalInstallments
  };
  
  console.log('Accrued Interest Calculation:', result);
  return result;
};

// Calculate expected repayment for each member (spreadsheet view)
const calculateMemberExpectedRepayments = (groupLoan, expectedRepaymentDetails, accruedInterestDetails) => {
  const memberRepayments = [];
  
  if (!groupLoan.individualLoanAccounts || groupLoan.individualLoanAccounts.length === 0) {
    // For legacy loans without individual accounts, distribute equally
    const groupMembers = groupLoan.group?.members || [];
    const memberCount = groupMembers.length;
    
    if (memberCount > 0) {
      const memberShare = expectedRepaymentDetails.installmentAmount / memberCount;
      const principalShare = (groupLoan.totalAmount || 0) / memberCount;
      const interestShare = (expectedRepaymentDetails.totalInterest || 0) / memberCount;
      
      groupMembers.forEach(member => {
        memberRepayments.push({
          memberId: member._id || member.CUST_ID,
          memberName: member.name || member.CUST_NM || 'Unknown Member',
          accountNumber: member.accountNumber || member.ACCT_NO || 'N/A',
          savingsAccountNo: member.savingsAccountNo || 'N/A',
          expectedAmount: memberShare,
          principalAmount: principalShare,
          interestAmount: interestShare,
          outstandingPrincipal: principalShare,
          outstandingInterest: interestShare,
          currentBalance: principalShare + interestShare,
          isLegacy: true
        });
      });
    }
  } else {
    // For modern loans with individual accounts
    const totalPrincipal = groupLoan.individualLoanAccounts.reduce((sum, account) => 
      sum + (account.OUTSTANDING_PRINCIPAL || account.DISBURSEMENT_LIMIT || 0), 0);
    
    groupLoan.individualLoanAccounts.forEach(account => {
      const memberPrincipal = account.OUTSTANDING_PRINCIPAL || account.DISBURSEMENT_LIMIT || 0;
      const memberShare = totalPrincipal > 0 ? memberPrincipal / totalPrincipal : 0;
      
      const expectedAmount = expectedRepaymentDetails.installmentAmount * memberShare;
      const principalAmount = (groupLoan.totalAmount || 0) * memberShare;
      const interestAmount = (expectedRepaymentDetails.totalInterest || 0) * memberShare;
      
      // Calculate accrued interest for this member
      let memberAccruedInterest = account.interestOutstanding || 0;
      if (accruedInterestDetails && account.ORIGINAL_PRINCIPAL) {
        const memberAccruedShare = account.ORIGINAL_PRINCIPAL / accruedInterestDetails.totalPrincipal;
        memberAccruedInterest = Math.max(memberAccruedInterest, accruedInterestDetails.totalAccruedInterest * memberAccruedShare);
      }
      
      memberRepayments.push({
        memberId: account.CUST_ID,
        memberName: account.ACCT_NM || 'Unknown Member',
        accountNumber: account.ACCT_NO,
        savingsAccountNo: account.savingsAccountNo,
        expectedAmount: expectedAmount,
        principalAmount: principalAmount,
        interestAmount: interestAmount,
        outstandingPrincipal: account.OUTSTANDING_PRINCIPAL || 0,
        outstandingInterest: memberAccruedInterest,
        currentBalance: account.outstanding_balance || account.OUTSTANDING_PRINCIPAL || 0,
        isLegacy: false
      });
    });
  }
  
  return memberRepayments;
};

// Payment frequency detection
const getPaymentFrequency = (providedFrequency, groupLoan) => {
  console.log('=== PAYMENT FREQUENCY ANALYSIS ===');
  console.log('Input providedFrequency:', providedFrequency);
  console.log('GroupLoan paymentFrequency:', groupLoan.paymentFrequency);
  console.log('GroupLoan loanTerm:', groupLoan.loanTerm);
  
  // Priority 1: Use explicitly provided frequency
  if (providedFrequency) {
    const freq = providedFrequency.toUpperCase();
    console.log('Using provided frequency:', freq);
    return freq;
  }
  
  // Priority 2: Use paymentFrequency field
  if (groupLoan.paymentFrequency) {
    const freq = groupLoan.paymentFrequency.toUpperCase();
    console.log('Using paymentFrequency field:', freq);
    return freq;
  }
  
  // Priority 3: Convert loanTerm to payment frequency
  if (groupLoan.loanTerm) {
    const loanTerm = groupLoan.loanTerm.toLowerCase().trim();
    console.log('Processing loanTerm:', loanTerm);
    
    let detectedFrequency;
    switch (loanTerm) {
      case 'weekly':
      case 'week':
      case 'w':
      case 'wk':
        detectedFrequency = 'WEEKLY';
        break;
      case 'bi-weekly':
      case 'bi_weekly':
      case 'biweekly':
      case 'bw':
      case 'bi-week':
      case 'bi_week':
        detectedFrequency = 'BI_WEEKLY';
        break;
      case 'monthly':
      case 'month':
      case 'm':
        detectedFrequency = 'MONTHLY';
        break;
      default:
        detectedFrequency = groupLoan.loanTerm.toUpperCase();
    }
    console.log('Detected frequency from loanTerm:', detectedFrequency);
    return detectedFrequency;
  }
  
  // Priority 4: Check individual loan accounts
  if (groupLoan.individualLoanAccounts && groupLoan.individualLoanAccounts.length > 0) {
    const firstLoanAccount = groupLoan.individualLoanAccounts[0];
    if (firstLoanAccount.PAYMENT_FREQUENCY) {
      const freq = firstLoanAccount.PAYMENT_FREQUENCY.toUpperCase();
      console.log('Using individual loan account frequency:', freq);
      return freq;
    }
  }
  
  console.log('Using default frequency: MONTHLY');
  return 'MONTHLY';
};

// Helper function to validate member repayments
const validateMemberRepayments = (memberRepayments, groupLoan, expectedRepaymentDetails, paymentFrequency, repaymentType) => {
  console.log('=== VALIDATING MEMBER REPAYMENTS ===');
  
  const totalMemberAmount = memberRepayments.reduce((sum, member) => sum + (member.amount || 0), 0);
  const groupMembers = groupLoan.members || [];
  
  // Check if all member IDs exist in the group
  for (const repayment of memberRepayments) {
    const memberExists = groupMembers.some(member => member.memberId === repayment.memberId);
    if (!memberExists) {
      return {
        valid: false,
        message: `Member ${repayment.memberId} not found in group ${groupLoan.groupCode}`
      };
    }
  }
  
  // Validate repayment type allocation
  if (repaymentType === 'principal' || repaymentType === 'interest') {
    for (const repayment of memberRepayments) {
      if (repaymentType === 'principal' && repayment.interest > 0) {
        return {
          valid: false,
          message: 'Interest amount should be zero for principal-only repayment'
        };
      }
      if (repaymentType === 'interest' && repayment.principal > 0) {
        return {
          valid: false,
          message: 'Principal amount should be zero for interest-only repayment'
        };
      }
    }
  }
  
  return { valid: true, message: 'Member repayments validated successfully' };
};

// Helper function to calculate next due date
const calculateNextDueDate = (paymentDate, paymentFrequency, lastRepaymentDate) => {
  const nextDate = new Date(paymentDate);
  
  switch (paymentFrequency.toUpperCase()) {
    case 'WEEKLY':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'BIWEEKLY':
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'QUARTERLY':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    default:
      nextDate.setMonth(nextDate.getMonth() + 1); // Default to monthly
  }
  
  return nextDate;
};

// Helper function to process modern group loan repayment with members
const processModernGroupLoanRepaymentWithMembers = async (
  groupLoan,
  calculatedTotalRepayAmount,
  memberRepayments,
  isInstallment,
  paymentDate,
  paymentMethod,
  transactionReference,
  userId,
  repaidMembers,
  repaymentDetails,
  session,
  expectedRepaymentDetails,
  repaymentType,
  finalPaymentFrequency,
  accruedInterestDetails
) => {
  console.log('=== PROCESSING MODERN GROUP LOAN REPAYMENT ===');
  
  const individualLoanAccounts = groupLoan.individualLoanAccounts || [];
  
  if (memberRepayments && memberRepayments.length > 0) {
    // Process specific member repayments
    for (const memberRepayment of memberRepayments) {
      await processSingleMemberRepayment(
        memberRepayment,
        individualLoanAccounts,
        paymentDate,
        paymentMethod,
        transactionReference,
        userId,
        repaidMembers,
        repaymentDetails,
        session,
        repaymentType
      );
    }
  } else {
    // Distribute total amount equally among members
    const memberCount = groupLoan.members.length;
    const amountPerMember = calculatedTotalRepayAmount / memberCount;
    
    for (const member of groupLoan.members) {
      const memberRepayment = {
        memberId: member.memberId,
        amount: amountPerMember,
        principal: amountPerMember * 0.8, // Example allocation
        interest: amountPerMember * 0.2   // Example allocation
      };
      
      await processSingleMemberRepayment(
        memberRepayment,
        individualLoanAccounts,
        paymentDate,
        paymentMethod,
        transactionReference,
        userId,
        repaidMembers,
        repaymentDetails,
        session,
        repaymentType
      );
    }
  }
};

// Helper function to process single member repayment
const processSingleMemberRepayment = async (
  memberRepayment,
  individualLoanAccounts,
  paymentDate,
  paymentMethod,
  transactionReference,
  userId,
  repaidMembers,
  repaymentDetails,
  session,
  repaymentType
) => {
  const memberLoanAccount = individualLoanAccounts.find(acc => 
    acc.CUST_ID === memberRepayment.memberId
  );
  
  if (!memberLoanAccount) {
    console.log(`❌ No loan account found for member: ${memberRepayment.memberId}`);
    return;
  }
  
  console.log(`💳 Processing repayment for member: ${memberRepayment.memberId}, Amount: ${memberRepayment.amount}`);
  
  // Update loan account
  const principalPaid = memberRepayment.principal || 0;
  const interestPaid = memberRepayment.interest || 0;
  
  memberLoanAccount.OUTSTANDING_PRINCIPAL = Math.max(0, memberLoanAccount.OUTSTANDING_PRINCIPAL - principalPaid);
  memberLoanAccount.outstanding_balance = Math.max(0, memberLoanAccount.outstanding_balance - (principalPaid + interestPaid));
  memberLoanAccount.ledger_balance = -memberLoanAccount.outstanding_balance;
  
  // Add repayment transaction
  await new Transaction({
    ACCT_NO: memberLoanAccount.ACCT_NO,
    ACCT_ID: memberLoanAccount._id.toString(),
    BU_ID: memberLoanAccount.BU_ID || 1,
    CUST_ID: memberLoanAccount.CUST_ID,
    ACCT_NM: memberLoanAccount.ACCT_NM,
    AMOUNT: memberRepayment.amount,
    TRANSACTIONDATE: paymentDate,
    TRANSACTION_TYPE: 'CREDIT',
    description: `Loan repayment - ${repaymentType}`,
    currency: 'NGN',
    createdBy: userId.toString(),
    status: 'COMPLETED',
    metadata: {
      purpose: 'LOAN_REPAYMENT',
      principalPaid,
      interestPaid,
      repaymentType,
      paymentMethod
    }
  }).save({ session });
  
  repaidMembers.push(memberRepayment.memberId);
  repaymentDetails.push({
    memberId: memberRepayment.memberId,
    memberName: memberLoanAccount.ACCT_NM,
    loanAccountNo: memberLoanAccount.ACCT_NO,
    amount: memberRepayment.amount,
    principal: principalPaid,
    interest: interestPaid,
    remainingPrincipal: memberLoanAccount.OUTSTANDING_PRINCIPAL,
    remainingBalance: memberLoanAccount.outstanding_balance
  });
  
  await memberLoanAccount.save({ session });
  console.log(`✅ Repayment processed for member: ${memberRepayment.memberId}`);
};

// Helper function to process legacy group loan repayment
const processLegacyGroupLoanRepayment = async (
  groupLoan,
  calculatedTotalRepayAmount,
  isInstallment,
  paymentDate,
  userId,
  repaidMembers,
  repaymentDetails,
  session
) => {
  console.log('=== PROCESSING LEGACY GROUP LOAN REPAYMENT ===');
  
  // For legacy loans, we just record the repayment at group level
  const principalPaid = calculatedTotalRepayAmount * 0.8; // Example allocation
  const interestPaid = calculatedTotalRepayAmount * 0.2; // Example allocation
  
  // Record group-level transaction
  await new Transaction({
    ACCT_NO: groupLoan.groupCode,
    ACCT_ID: groupLoan._id.toString(),
    BU_ID: groupLoan.branch || 1,
    CUST_ID: 'GROUP', // Special identifier for group transactions
    ACCT_NM: groupLoan.groupName,
    AMOUNT: calculatedTotalRepayAmount,
    TRANSACTIONDATE: paymentDate,
    TRANSACTION_TYPE: 'CREDIT',
    description: `Legacy group loan repayment`,
    currency: 'NGN',
    createdBy: userId.toString(),
    status: 'COMPLETED',
    metadata: {
      purpose: 'LEGACY_GROUP_REPAYMENT',
      principalPaid,
      interestPaid,
      isInstallment
    }
  }).save({ session });
  
  // For legacy loans, mark all members as repaid
  groupLoan.members.forEach(member => {
    repaidMembers.push(member.memberId);
    repaymentDetails.push({
      memberId: member.memberId,
      memberName: member.name,
      loanAccountNo: 'LEGACY',
      amount: calculatedTotalRepayAmount / groupLoan.members.length,
      principal: principalPaid / groupLoan.members.length,
      interest: interestPaid / groupLoan.members.length,
      remainingPrincipal: 0, // Legacy loans don't track individual balances
      remainingBalance: 0
    });
  });
  
  console.log(`✅ Legacy repayment processed for ${groupLoan.members.length} members`);
};

// // Helper function for audit trail
// const logAuditTrail = async (
//   entityType,
//   entityId,
//   userId,
//   action,
//   oldState,
//   newState,
//   ipAddress,
//   eventType
// ) => {
//   try {
//     console.log('=== AUDIT TRAIL ===');
//     console.log('Entity:', entityType);
//     console.log('Entity ID:', entityId);
//     console.log('User:', userId);
//     console.log('Action:', action);
//     console.log('Old State:', oldState);
//     console.log('New State:', newState);
//     console.log('IP:', ipAddress);
//     console.log('Event:', eventType);
    
//     // You can implement your audit trail logging here
//     // This could save to an AuditTrail collection or log to a file
//   } catch (error) {
//     console.error('Error logging audit trail:', error);
//   }
// };

// ==================== MAIN REPAYMENT FUNCTION ====================

export const repayGroupLoan = asyncHandler(async (req, res) => {
  // FIX: Get groupLoanId from multiple possible sources
  let groupLoanId = req.params.groupLoanId || req.params.id || req.body.groupLoanId;
  
  console.log('=== REPAYMENT REQUEST DETAILS ===');
  console.log('Params:', req.params);
  console.log('Body:', req.body);
  console.log('Query:', req.query);
  console.log('Extracted groupLoanId:', groupLoanId);

  // If still undefined, try to extract from URL
  if (!groupLoanId) {
    const urlParts = req.originalUrl.split('/');
    const possibleId = urlParts[urlParts.length - 2]; // Second last part of URL
    if (possibleId && possibleId !== 'repayment') {
      groupLoanId = possibleId;
      console.log('Extracted from URL:', groupLoanId);
    }
  }

  if (!groupLoanId) {
    return res.status(400).json({
      success: false,
      message: 'Group loan ID is required. Please provide it in the URL path like: /api/group/group-loans/GL90659288STV3/repayment',
    });
  }

  const {
    totalRepayAmount,
    memberRepayments = [],
    isInstallment,
    paymentMethod = 'CASH',
    transactionReference,
    isLegacyLoan = false,
    repaymentType = 'both',
    paymentFrequency
  } = req.body;

  console.log(`🔍 Looking for group loan with ID: ${groupLoanId}`);

  // Validate required fields
  if ((!totalRepayAmount || totalRepayAmount <= 0) && (!memberRepayments || memberRepayments.length === 0)) {
    return res.status(400).json({
      success: false,
      message: 'Either totalRepayAmount or memberRepayments array is required.',
    });
  }

  // FIXED: Enhanced group loan lookup - ONLY search by loanId, not _id
  let groupLoan = await GroupLoan.findOne({
    loanId: groupLoanId // Only search by loanId field, not _id
  })
  .populate('group', 'members groupCode groupName')
  .populate('individualLoanAccounts');

  if (!groupLoan) {
    console.log(`❌ Group loan not found for loanId: ${groupLoanId}`);
    
    // Try alternative search if needed
    console.log(`🔍 Trying alternative search...`);
    groupLoan = await GroupLoan.findOne({
      $or: [
        { groupCode: groupLoanId },
        { _id: groupLoanId } // Only try _id if it's a valid ObjectId
      ]
    })
    .populate('group', 'members groupCode groupName')
    .populate('individualLoanAccounts');
  }

  if (!groupLoan) {
    console.log(`❌ Group loan not found for any identifier: ${groupLoanId}`);
    
    // Show available loans for debugging
    const allGroupLoans = await GroupLoan.find({}).select('loanId groupCode _id status').limit(10);
    const availableLoans = allGroupLoans.map(gl => ({
      loanId: gl.loanId, 
      groupCode: gl.groupCode, 
      _id: gl._id, 
      status: gl.status
    }));
    
    console.log('Available group loans:', availableLoans);
    
    return res.status(404).json({
      success: false,
      message: `Group loan not found for ID: ${groupLoanId}.`,
      availableLoans: availableLoans,
      suggestion: 'Try using one of the available loan IDs shown above.'
    });
  }

  console.log(`✅ Found group loan: ${groupLoan.loanId}, Group Code: ${groupLoan.groupCode}, Status: ${groupLoan.status}`);

  // Enhanced status validation
  const validRepaymentStatuses = [
    'disbursed', 'partially_disbursed', 'active',
    'disbursed_legacy', 'active_legacy', 'approved'
  ];
 
  if (!validRepaymentStatuses.includes(groupLoan.status)) {
    return res.status(400).json({
      success: false,
      message: `Group loan must be in disbursed/active status for repayment. Current status: ${groupLoan.status}`,
    });
  }

  // Payment frequency detection
  const finalPaymentFrequency = getPaymentFrequency(paymentFrequency, groupLoan);
  
  console.log('=== PAYMENT FREQUENCY DETECTION ===');
  console.log('Provided frequency:', paymentFrequency);
  console.log('Loan paymentFrequency:', groupLoan.paymentFrequency);
  console.log('Loan loanTerm:', groupLoan.loanTerm);
  console.log('Final detected frequency:', finalPaymentFrequency);

  // Calculate expected repayment amounts with payment frequency
  const expectedRepaymentDetails = calculateExpectedRepayment(groupLoan, finalPaymentFrequency);
  
  // Calculate accrued interest for proper allocation
  const accruedInterestDetails = calculateAccruedInterest(groupLoan, expectedRepaymentDetails);
  
  // NEW: Calculate member expected repayments (spreadsheet view)
  const memberExpectedRepayments = calculateMemberExpectedRepayments(
    groupLoan, 
    expectedRepaymentDetails, 
    accruedInterestDetails
  );

  console.log('=== MEMBER EXPECTED REPAYMENTS (SPREADSHEET VIEW) ===');
  memberExpectedRepayments.forEach((member, index) => {
    console.log(`Member ${index + 1}: ${member.memberName}`);
    console.log(`  Account: ${member.accountNumber}`);
    console.log(`  Savings Account: ${member.savingsAccountNo || 'N/A'}`);
    console.log(`  Expected Amount: ${member.expectedAmount.toLocaleString()}`);
    console.log(`  Principal: ${member.principalAmount.toLocaleString()}`);
    console.log(`  Interest: ${member.interestAmount.toLocaleString()}`);
    console.log(`  Outstanding Principal: ${member.outstandingPrincipal.toLocaleString()}`);
    console.log(`  Outstanding Interest: ${member.outstandingInterest.toLocaleString()}`);
    console.log(`  Current Balance: ${member.currentBalance.toLocaleString()}`);
    console.log('---');
  });

  // Calculate financials with proper interest handling
  const totalRepayable = expectedRepaymentDetails.totalRepayment || 
                        groupLoan.totalRepayable ||
                        (groupLoan.totalAmount + accruedInterestDetails.totalAccruedInterest);
  
  const currentTotalRepaid = groupLoan.totalRepaid || groupLoan.repaidAmount || 0;
  const remainingBalance = totalRepayable - currentTotalRepaid;

  // Calculate total from member repayments if provided
  let calculatedTotalRepayAmount = totalRepayAmount;
  if (memberRepayments && memberRepayments.length > 0) {
    calculatedTotalRepayAmount = memberRepayments.reduce((sum, member) => sum + (member.amount || 0), 0);
    
    const validationResult = validateMemberRepayments(
      memberRepayments, 
      groupLoan, 
      expectedRepaymentDetails,
      finalPaymentFrequency,
      repaymentType
    );
    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        message: validationResult.message
      });
    }
  }

  if (calculatedTotalRepayAmount > remainingBalance) {
    return res.status(400).json({
      success: false,
      message: `Repayment amount (${calculatedTotalRepayAmount.toLocaleString()}) exceeds remaining balance (${remainingBalance.toLocaleString()}).`,
    });
  }

  // Enhanced installment validation with payment frequency
  let validationMessage = '';
  if (isInstallment && expectedRepaymentDetails.installmentAmount) {
    const tolerance = isLegacyLoan ? 1.00 : 0.01;
    const expectedAmount = expectedRepaymentDetails.installmentAmount;
    
    if (Math.abs(calculatedTotalRepayAmount - expectedAmount) > tolerance) {
      return res.status(400).json({
        success: false,
        message: `For ${finalPaymentFrequency.toLowerCase()} installment repayment, amount should match the scheduled installment of ${expectedAmount.toLocaleString()}.`,
      });
    }
    validationMessage = ` (${finalPaymentFrequency.toLowerCase()} installment applied)`;
  }

  const paymentDate = new Date();
  const oldTotalRepaid = currentTotalRepaid;
  const repaidMembers = [];
  const repaymentDetails = [];
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // Determine processing method
      const needsLegacyProcessing = isLegacyLoan ||
                                  !groupLoan.individualLoanAccounts ||
                                  groupLoan.individualLoanAccounts.length === 0;

      if (needsLegacyProcessing) {
        await processLegacyGroupLoanRepayment(
          groupLoan,
          calculatedTotalRepayAmount,
          isInstallment,
          paymentDate,
          req.user.id,
          repaidMembers,
          repaymentDetails,
          session
        );
      } else {
        // Process modern group loans with individual member support
        await processModernGroupLoanRepaymentWithMembers(
          groupLoan,
          calculatedTotalRepayAmount,
          memberRepayments,
          isInstallment,
          paymentDate,
          paymentMethod,
          transactionReference,
          req.user.id,
          repaidMembers,
          repaymentDetails,
          session,
          expectedRepaymentDetails,
          repaymentType,
          finalPaymentFrequency,
          accruedInterestDetails
        );
      }

      // Update group loan repayment totals
      groupLoan.totalRepaid = (groupLoan.totalRepaid || 0) + calculatedTotalRepayAmount;
      groupLoan.repaidToMembers = [...new Set([...(groupLoan.repaidToMembers || []), ...repaidMembers])];
      
      // Track installments paid at group level
      if (isInstallment) {
        groupLoan.installmentsPaid = (groupLoan.installmentsPaid || 0) + 1;
        
        // Update next due date based on payment frequency
        groupLoan.nextDueDate = calculateNextDueDate(
          paymentDate, 
          finalPaymentFrequency, 
          groupLoan.lastRepaymentDate
        );
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
        totalRepayAmount: calculatedTotalRepayAmount,
        memberRepaymentsCount: memberRepayments?.length || 0,
        paymentMethod,
        paymentFrequency: finalPaymentFrequency,
        membersRepaid: repaidMembers.length,
        loanType: isLegacyLoan ? 'legacy' : 'modern',
        repaymentType,
        expectedInstallment: expectedRepaymentDetails.installmentAmount,
        accruedInterest: accruedInterestDetails.totalAccruedInterest
      },
      req.ip,
      isLegacyLoan ? 'LEGACY_GROUP_LOAN_REPAYMENT' : 'GROUP_LOAN_REPAYMENT'
    );

    logger.info(`Group loan repayment processed: ${groupLoan._id}, Amount: ${calculatedTotalRepayAmount}, Frequency: ${finalPaymentFrequency}, RepaymentType: ${repaymentType}, Members: ${repaidMembers.length}`);
    
    const installmentInfo = expectedRepaymentDetails.installmentAmount ? 
      ` Expected ${finalPaymentFrequency.toLowerCase()} installment: ${expectedRepaymentDetails.installmentAmount.toLocaleString()}.` : '';

    res.status(200).json({
      success: true,
      message: `Group loan ${finalPaymentFrequency.toLowerCase()} repayment of ${calculatedTotalRepayAmount.toLocaleString()} processed successfully for ${repaidMembers.length} members.${validationMessage} Total repaid: ${groupLoan.totalRepaid.toLocaleString()}.${installmentInfo}`,
      data: {
        groupLoan: {
          _id: groupLoan._id,
          groupCode: groupLoan.groupCode,
          status: groupLoan.status,
          totalRepaid: groupLoan.totalRepaid,
          remainingBalance: groupLoan.remainingBalance,
          installmentsPaid: groupLoan.installmentsPaid,
          nextDueDate: groupLoan.nextDueDate,
          paymentFrequency: finalPaymentFrequency,
          isLegacyLoan
        },
        repaymentSummary: {
          totalAmount: calculatedTotalRepayAmount,
          membersRepaid: repaidMembers.length,
          paymentDate,
          paymentMethod,
          paymentFrequency: finalPaymentFrequency,
          isInstallment,
          isLegacyLoan,
          memberRepaymentsUsed: memberRepayments && memberRepayments.length > 0,
          repaymentType,
          expectedInstallment: expectedRepaymentDetails.installmentAmount,
          totalInterest: expectedRepaymentDetails.totalInterest,
          totalRepayment: expectedRepaymentDetails.totalRepayment,
          accruedInterest: accruedInterestDetails.totalAccruedInterest
        },
        memberDetails: repaymentDetails,
        // NEW: Add member spreadsheet data
        memberSpreadsheet: {
          summary: {
            totalMembers: memberExpectedRepayments.length,
            totalExpectedAmount: memberExpectedRepayments.reduce((sum, member) => sum + member.expectedAmount, 0),
            totalOutstandingPrincipal: memberExpectedRepayments.reduce((sum, member) => sum + member.outstandingPrincipal, 0),
            totalOutstandingInterest: memberExpectedRepayments.reduce((sum, member) => sum + member.outstandingInterest, 0),
            paymentFrequency: finalPaymentFrequency,
            installmentAmount: expectedRepaymentDetails.installmentAmount
          },
          members: memberExpectedRepayments.map(member => ({
            memberId: member.memberId,
            memberName: member.memberName,
            loanAccountNo: member.accountNumber,
            savingsAccountNo: member.savingsAccountNo,
            expectedRepayment: member.expectedAmount,
            outstandingPrincipal: member.outstandingPrincipal,
            outstandingInterest: member.outstandingInterest,
            currentBalance: member.currentBalance,
            principalShare: member.principalAmount,
            interestShare: member.interestAmount,
            isLegacy: member.isLegacy
          }))
        }
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

// ==================== OTHER FUNCTIONS (KEEP ONLY ONE VERSION) ====================

// Add this to your GroupController.js
export const getGroupLoanPortfolio = asyncHandler(async (req, res) => {
  try {
    const {
      status,
      branch,
      groupCode,
      dateFrom,
      dateTo,
      relationshipManager
    } = req.query;

    // Build filter
    const filter = {};
    
    if (status) filter.status = status;
    if (branch) filter.branch = Number(branch);
    if (groupCode) filter.groupCode = { $regex: groupCode, $options: 'i' };
    if (relationshipManager) {
      filter.primaryRelationshipManager = { $regex: relationshipManager, $options: 'i' };
    }
    
    // Date range filter
    if (dateFrom || dateTo) {
      filter.applicationDate = {};
      if (dateFrom) filter.applicationDate.$gte = new Date(dateFrom);
      if (dateTo) filter.applicationDate.$lte = new Date(dateTo);
    }

    // Fetch group loans with populated data
    const groupLoans = await GroupLoan.find(filter)
      .populate('group', 'groupName groupCode members')
      .populate('individualLoanAccounts', 'ACCT_NO ACCT_NM OUTSTANDING_PRINCIPAL outstanding_balance')
      .populate('createdBy', 'name email')
      .sort({ applicationDate: -1 })
      .lean();

    // Calculate portfolio summary
    const summary = {
      totalLoans: groupLoans.length,
      totalAmount: groupLoans.reduce((sum, loan) => sum + (loan.totalAmount || 0), 0),
      totalRepaid: groupLoans.reduce((sum, loan) => sum + (loan.totalRepaid || 0), 0),
      totalOutstanding: groupLoans.reduce((sum, loan) => sum + (loan.remainingBalance || 0), 0),
      activeLoans: groupLoans.filter(loan => ['disbursed', 'active'].includes(loan.status)).length,
      completedLoans: groupLoans.filter(loan => ['repaid', 'closed'].includes(loan.status)).length,
      overdueLoans: groupLoans.filter(loan => 
        loan.remainingBalance > 0 && loan.status === 'disbursed'
      ).length
    };

    res.status(200).json({
      success: true,
      message: 'Portfolio data retrieved successfully',
      data: groupLoans,
      summary: summary
    });

  } catch (error) {
    console.error('Error fetching portfolio data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch portfolio data',
      error: error.message
    });
  }
});

// Remove duplicate function definitions below - only keep the ones above

// Helper function to update repayment schedule
// Helper function to update repayment schedule
const updateRepaymentSchedule = async (loanAccount, amount, paymentDate, session) => {
  try {
    const schedule = await RepaymentSchedule.findOne({ LOAN_ACCOUNT_ID: loanAccount._id }).session(session);
    
    if (!schedule) {
      console.log(`No repayment schedule found for loan account: ${loanAccount.ACCT_NO}`);
      return;
    }

    // Find the next pending installment
    const pendingInstallment = schedule.installments.find(inst => 
      inst.status === 'PENDING' || inst.status === 'DUE'
    );

    if (!pendingInstallment) {
      console.log(`No pending installments found for loan account: ${loanAccount.ACCT_NO}`);
      return;
    }

    const installmentNo = pendingInstallment.installmentNo;
    
    // Update the installment directly
    const installment = schedule.installments.find(inst => inst.installmentNo === installmentNo);
    
    if (installment) {
      // Calculate allocation between principal and interest
      const principalAmount = Math.min(amount, installment.principal);
      const interestAmount = Math.min(amount - principalAmount, installment.interest);
      
      // Update installment status and payment details
      installment.status = amount >= installment.totalPayment ? 'PAID' : 'PARTIAL';
      installment.amountPaid = (installment.amountPaid || 0) + amount;
      installment.principalPaid = (installment.principalPaid || 0) + principalAmount;
      installment.interestPaid = (installment.interestPaid || 0) + interestAmount;
      installment.paymentDate = paymentDate;
      
      // Update remaining balance
      if (installment.remainingBalance !== undefined) {
        installment.remainingBalance = Math.max(0, installment.remainingBalance - amount);
      }

      // Update next payment reference if this installment is fully paid
      if (installment.status === 'PAID') {
        const nextInstallment = schedule.installments.find(inst => 
          inst.installmentNo === installmentNo + 1 && 
          (inst.status === 'PENDING' || inst.status === 'DUE')
        );
        
        if (nextInstallment) {
          schedule.nextPayment = {
            installmentNo: nextInstallment.installmentNo,
            dueDate: nextInstallment.dueDate,
            amountDue: nextInstallment.totalPayment
          };
        } else {
          schedule.nextPayment = null; // No more payments
        }
      }

      await schedule.save({ session });
      console.log(`✅ Updated repayment schedule for installment ${installmentNo}, loan: ${loanAccount.ACCT_NO}`);
    }
  } catch (error) {
    logger.error(`Error updating repayment schedule for loan ${loanAccount.ACCT_NO}:`, error);
    // Don't fail the entire repayment if schedule update fails
  }
};

// Helper function to create repayment transaction
const createRepaymentTransaction = async (loanAccount, amount, paymentMethod, reference, userId, branchId, session) => {
  try {
    // Create transaction with proper schema fields
    const transaction = new Transaction({
      // Core required fields
      ACCT_NO: loanAccount.ACCT_NO,
      ACCT_ID: loanAccount._id.toString(),
      BU_ID: branchId || loanAccount.BU_ID || 1,
      CUST_ID: loanAccount.CUST_ID,
      ACCT_NM: loanAccount.ACCT_NM,
      AMOUNT: amount,
      TRANSACTIONDATE: new Date(),
      TRANSACTION_TYPE: 'CREDIT',
      
      // Additional required fields
      TRANSACTION_ID: 0, // Will be auto-generated by pre-save hook
      EVENT_ID: 0, // Will be auto-generated by pre-save hook
      TRAN_JOURNAL_ID: '', // Will be auto-generated by pre-save hook
      REFERENCE: reference || `REPAY_${loanAccount.ACCT_NO}_${Date.now()}`,
      
      // Descriptive fields
      description: `Loan repayment for ${loanAccount.ACCT_NM}`,
      currency: 'NGN',
      createdBy: userId.toString(),
      status: 'COMPLETED',
      
      // Branch information
      branch: branchId || loanAccount.branch || 1,
      
      // Metadata
      metadata: {
        purpose: 'LOAN_REPAYMENT',
        loanAccountNo: loanAccount.ACCT_NO,
        customerId: loanAccount.CUST_ID,
        paymentMethod: paymentMethod,
        repaymentType: 'GROUP_LOAN'
      }
    });

    await transaction.save({ session });
    console.log(`✅ Created repayment transaction for loan: ${loanAccount.ACCT_NO}, Amount: ${amount}`);
    return transaction;
  } catch (error) {
    logger.error(`Error creating repayment transaction for loan ${loanAccount.ACCT_NO}:`, error);
    // Don't fail the entire repayment if transaction creation fails
    return null;
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

//////////
// controllers/loanCollectionController.js - Add this function

/**
 * @desc Get comprehensive repayment collection sheet for a group loan
 * @route GET /api/collections/group-repayment/:groupId
 * @access Public
 */
export const getGroupRepaymentCollectionSheet = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { includeHistory, startDate, endDate } = req.query;

  try {
    console.log(`🔍 Fetching repayment collection sheet for group: ${groupId}`);

    // Find the group loan
    const groupLoan = await GroupLoan.findOne({ 
      loanId: groupId.toUpperCase() 
    })
    .populate('individualLoanAccounts')
    .populate('members.memberId')
    .populate('disbursedToMembers')
    .populate('repaidToMembers');

    if (!groupLoan) {
      return res.status(404).json({
        success: false,
        message: `Group loan with ID ${groupId} not found`
      });
    }

    // Get all loan accounts for this group
    const loanAccounts = await LoanAccount.find({
      groupLoan: groupLoan._id
    })
    .populate('CUST_ID')
    .sort({ ACCT_NO: 1 });

    if (loanAccounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No loan accounts found for group ${groupId}`
      });
    }

    // Get loan account summaries
    const loanAccountIds = loanAccounts.map(acc => acc._id);
    const loanSummaries = await LoanAccountSummary.find({
      ACCT_ID: { $in: loanAccountIds }
    });

    const summaryMap = new Map();
    loanSummaries.forEach(summary => {
      summaryMap.set(summary.ACCT_ID.toString(), summary);
    });

    // Build repayment collection sheet
    const collectionSheet = {
      groupInfo: {
        groupId: groupLoan.loanId,
        groupName: groupLoan.groupName,
        groupCode: groupLoan.groupCode,
        status: groupLoan.status,
        totalMembers: groupLoan.members?.length || 0,
        totalLoanAmount: groupLoan.totalAmount || 0,
        individualShare: groupLoan.individualShare || 0,
        paymentFrequency: groupLoan.paymentFrequency || 'MONTHLY',
        installmentAmount: groupLoan.installmentAmount || 0,
        interestRate: groupLoan.interestRate || 0,
        disbursementDate: groupLoan.disbursedAt,
        maturityDate: calculateGroupMaturityDate(groupLoan)
      },
      repaymentSummary: {
        totalMembers: loanAccounts.length,
        activeMembers: 0,
        overdueMembers: 0,
        fullyPaidMembers: 0,
        totalLoanAmount: 0,
        totalDisbursed: 0,
        totalRepaid: 0,
        totalOutstanding: 0,
        totalOverdue: 0,
        collectionRate: 0,
        averageInstallment: 0,
        nextCollectionDate: null
      },
      memberRepayments: [],
      installmentSchedule: generateInstallmentSchedule(groupLoan),
      groupPerformance: {
        repaymentTrend: await getRepaymentTrend(groupLoan._id, startDate, endDate),
        memberPerformance: await getMemberPerformanceStats(loanAccounts, summaryMap)
      }
    };

    // Process each member's repayment status
    for (const loanAccount of loanAccounts) {
      const loanSummary = summaryMap.get(loanAccount._id.toString());
      const repaymentStatus = await getMemberRepaymentStatus(loanAccount, loanSummary, groupLoan);

      collectionSheet.memberRepayments.push(repaymentStatus);

      // Update summary totals
      collectionSheet.repaymentSummary.totalLoanAmount += repaymentStatus.loanAmount;
      collectionSheet.repaymentSummary.totalDisbursed += repaymentStatus.actualDisbursement;
      collectionSheet.repaymentSummary.totalRepaid += repaymentStatus.totalRepaid;
      collectionSheet.repaymentSummary.totalOutstanding += repaymentStatus.outstandingBalance;
      
      if (repaymentStatus.isOverdue) {
        collectionSheet.repaymentSummary.overdueMembers++;
        collectionSheet.repaymentSummary.totalOverdue += repaymentStatus.overdueAmount;
      }
      
      if (repaymentStatus.isFullyPaid) {
        collectionSheet.repaymentSummary.fullyPaidMembers++;
      } else {
        collectionSheet.repaymentSummary.activeMembers++;
      }

      // Track next collection date
      if (repaymentStatus.nextPaymentDate && 
          (!collectionSheet.repaymentSummary.nextCollectionDate || 
           repaymentStatus.nextPaymentDate < collectionSheet.repaymentSummary.nextCollectionDate)) {
        collectionSheet.repaymentSummary.nextCollectionDate = repaymentStatus.nextPaymentDate;
      }
    }

    // Calculate final summary metrics
    collectionSheet.repaymentSummary.collectionRate = 
      collectionSheet.repaymentSummary.totalLoanAmount > 0 ?
      (collectionSheet.repaymentSummary.totalRepaid / collectionSheet.repaymentSummary.totalLoanAmount) * 100 : 0;

    collectionSheet.repaymentSummary.averageInstallment = 
      collectionSheet.repaymentSummary.activeMembers > 0 ?
      collectionSheet.repaymentSummary.totalOutstanding / collectionSheet.repaymentSummary.activeMembers : 0;

    // Include payment history if requested
    if (includeHistory === 'true') {
      collectionSheet.paymentHistory = await getGroupPaymentHistory(groupLoan._id, startDate, endDate);
    }

    console.log(`✅ Group repayment collection sheet generated for ${groupId}`);
    console.log(`📊 Summary: ${collectionSheet.repaymentSummary.activeMembers} active, ${collectionSheet.repaymentSummary.overdueMembers} overdue, ${collectionSheet.repaymentSummary.collectionRate.toFixed(1)}% collected`);

    res.status(200).json({
      success: true,
      message: `Group repayment collection sheet for ${groupLoan.groupName} generated successfully`,
      data: collectionSheet,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('💥 ERROR generating group repayment collection sheet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate group repayment collection sheet',
      error: error.message
    });
  }
});

// Helper function to get member repayment status
async function getMemberRepaymentStatus(loanAccount, loanSummary, groupLoan) {
  const disbursementInfo = getLoanAccountDisbursementInfo(loanAccount, groupLoan);
  const isOverdue = loanSummary?.DELINQUENT_DAYS > 0;
  const overdueAmount = isOverdue ? parseFloat(loanSummary?.OUTSTANDING_PRINCIPAL?.toString() || '0') : 0;
  const isFullyPaid = parseFloat(loanSummary?.OUTSTANDING_PRINCIPAL?.toString() || '0') <= 0;

  // Calculate member's share of group installment
  const groupInstallment = groupLoan.installmentAmount || 0;
  const memberInstallment = loanAccount.installmentAmount || 
                           (groupInstallment / (groupLoan.members?.length || 1));

  return {
    memberId: loanAccount.CUST_ID?._id || loanAccount.CUST_ID,
    customerId: loanAccount.CUST_ID?.CUST_ID || 'N/A',
    customerName: loanAccount.CUST_ID?.FIRST_NM ? 
      `${loanAccount.CUST_ID.FIRST_NM || ''} ${loanAccount.CUST_ID.MIDDLE_NM || ''} ${loanAccount.CUST_ID.LAST_NM || ''}`.trim() :
      loanAccount.ACCT_NM || 'Customer Name Not Available',
    
    loanAccountNo: loanAccount.ACCT_NO,
    
    // Financial Information
    loanAmount: parseFloat(loanAccount.DISBURSEMENT_LIMIT?.toString() || '0'),
    actualDisbursement: disbursementInfo.actualDisbursement,
    individualShare: parseFloat(loanAccount.individualShare?.toString() || '0'),
    
    // Repayment Status
    installmentAmount: memberInstallment,
    totalRepaid: parseFloat(loanSummary?.TOTAL_REPAYMENT?.toString() || '0'),
    outstandingBalance: parseFloat(loanSummary?.OUTSTANDING_PRINCIPAL?.toString() || '0'),
    overdueAmount: overdueAmount,
    
    // Payment Information
    lastPaymentDate: loanSummary?.LAST_PAYMENT_DT,
    lastPaymentAmount: parseFloat(loanSummary?.LAST_PAYMENT_AMOUNT?.toString() || '0'),
    nextPaymentDate: loanSummary?.NEXT_PAYMENT_DT,
    
    // Status Flags
    isOverdue: isOverdue,
    daysOverdue: loanSummary?.DELINQUENT_DAYS || 0,
    isFullyPaid: isFullyPaid,
    paidInstallments: loanSummary?.PAID_INSTALLMENTS || 0,
    totalInstallments: loanSummary?.TOTAL_INSTALLMENTS || 0,
    remainingInstallments: (loanSummary?.TOTAL_INSTALLMENTS || 0) - (loanSummary?.PAID_INSTALLMENTS || 0),
    
    // Contact Information
    phone: loanAccount.CUST_ID?.PHONE_NO || 'N/A',
    email: loanAccount.CUST_ID?.EMAIL || 'N/A',
    
    // Collection Notes
    collectionNotes: '',
    lastCollectionDate: null,
    collectionOfficer: loanAccount.PRIMARY_OFFICER_ID
  };
}

// Helper function to generate installment schedule
function generateInstallmentSchedule(groupLoan) {
  if (!groupLoan.disbursedAt) return [];

  const schedule = [];
  const totalInstallments = groupLoan.numPeriods || 12;
  const installmentAmount = groupLoan.installmentAmount || 0;
  const frequency = groupLoan.paymentFrequency || 'MONTHLY';
  let currentDate = new Date(groupLoan.disbursedAt);

  for (let i = 1; i <= totalInstallments; i++) {
    // Calculate due date based on frequency
    switch (frequency.toUpperCase()) {
      case 'WEEKLY':
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case 'BI-WEEKLY':
        currentDate.setDate(currentDate.getDate() + 14);
        break;
      case 'MONTHLY':
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case 'QUARTERLY':
        currentDate.setMonth(currentDate.getMonth() + 3);
        break;
      default:
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    schedule.push({
      installmentNumber: i,
      dueDate: new Date(currentDate),
      amount: installmentAmount,
      status: new Date() > currentDate ? 'DUE' : 'UPCOMING'
    });
  }

  return schedule;
}

// Helper function to get repayment trend
async function getRepaymentTrend(groupLoanId, startDate, endDate) {
  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);

  try {
    const trend = await LoanAccountSummary.aggregate([
      {
        $lookup: {
          from: 'loanaccounts',
          localField: 'ACCT_ID',
          foreignField: '_id',
          as: 'loanAccount'
        }
      },
      {
        $unwind: '$loanAccount'
      },
      {
        $match: {
          'loanAccount.groupLoan': groupLoanId,
          ...(Object.keys(dateFilter).length > 0 && { LAST_PAYMENT_DT: dateFilter })
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$LAST_PAYMENT_DT' },
            month: { $month: '$LAST_PAYMENT_DT' }
          },
          totalCollections: { $sum: '$LAST_PAYMENT_AMOUNT' },
          paymentCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    return trend;
  } catch (error) {
    console.error('Error calculating repayment trend:', error);
    return [];
  }
}

// Helper function to get member performance stats
async function getMemberPerformanceStats(loanAccounts, summaryMap) {
  const performance = {
    onTimePayers: 0,
    occasionalLate: 0,
    frequentLate: 0,
    defaulters: 0
  };

  loanAccounts.forEach(loanAccount => {
    const summary = summaryMap.get(loanAccount._id.toString());
    if (!summary) return;

    const daysOverdue = summary.DELINQUENT_DAYS || 0;

    if (daysOverdue === 0) {
      performance.onTimePayers++;
    } else if (daysOverdue <= 7) {
      performance.occasionalLate++;
    } else if (daysOverdue <= 30) {
      performance.frequentLate++;
    } else {
      performance.defaulters++;
    }
  });

  return performance;
}

// Helper function to get group payment history
async function getGroupPaymentHistory(groupLoanId, startDate, endDate) {
  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);

  try {
    const history = await LoanAccountSummary.aggregate([
      {
        $lookup: {
          from: 'loanaccounts',
          localField: 'ACCT_ID',
          foreignField: '_id',
          as: 'loanAccount'
        }
      },
      {
        $unwind: '$loanAccount'
      },
      {
        $match: {
          'loanAccount.groupLoan': groupLoanId,
          LAST_PAYMENT_DT: { $ne: null },
          ...(Object.keys(dateFilter).length > 0 && { LAST_PAYMENT_DT: dateFilter })
        }
      },
      {
        $project: {
          customerName: '$loanAccount.ACCT_NM',
          loanAccountNo: '$loanAccount.ACCT_NO',
          paymentDate: '$LAST_PAYMENT_DT',
          amount: '$LAST_PAYMENT_AMOUNT',
          installmentNumber: '$PAID_INSTALLMENTS'
        }
      },
      {
        $sort: { paymentDate: -1 }
      },
      {
        $limit: 50 // Last 50 payments
      }
    ]);

    return history;
  } catch (error) {
    console.error('Error fetching payment history:', error);
    return [];
  }
}

// Helper function to calculate group maturity date
function calculateGroupMaturityDate(groupLoan) {
  if (!groupLoan.disbursedAt) return null;

  const maturityDate = new Date(groupLoan.disbursedAt);
  const termValue = groupLoan.termValue || 12;
  const loanTerm = groupLoan.loanTerm || 'MONTHLY';

  switch (loanTerm.toUpperCase()) {
    case 'WEEKLY':
      maturityDate.setDate(maturityDate.getDate() + (termValue * 7));
      break;
    case 'MONTHLY':
      maturityDate.setMonth(maturityDate.getMonth() + termValue);
      break;
    case 'YEARLY':
      maturityDate.setFullYear(maturityDate.getFullYear() + termValue);
      break;
    default:
      maturityDate.setMonth(maturityDate.getMonth() + 12);
  }

  return maturityDate;
}

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