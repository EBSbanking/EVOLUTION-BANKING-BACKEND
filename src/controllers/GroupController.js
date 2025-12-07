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
import { calculateLoanRepayment } from './LoanProductController.js';
import Transaction from '../models/Transaction.js';
import LoanAccountSummary from '../models/LoanAccountSummary.js';
import Branch from '../models/Branch.js';
import InterestRate from '../models/LoanInterestRate.js';
import GLAccount from '../models/GLAccount.js';
import {getLoanAccountDisbursementInfo} from '../controllers/LoanAccountSummaryController.js';
import LoanRepaymentTransaction from '../models/LoanRepaymentTransaction.js';
import Collection from '../models/Collection.js';
import {  calculateInterestByProductType } from '../Services/InterestCalculationService.js';
import InterestCalculationService from '../Services/InterestCalculationService.js';
import { processGroupLoanDisbursement,
  updateLoanPortfolioForGroupDisbursement,
  processSingleGroupMemberDisbursement,
  getGLAccountsFromProduct,
  disburseGroupLoan} from '../Services/processGroupLoanDisbursement.js';

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
    legacyId,
    mysqlId,
    page = 1,
    limit = 20,
    populateMembers = 'true'
  } = req.query;

  // Build dynamic filter
  const filter = {};
  
  if (id) {
    try {
      filter._id = new mongoose.Types.ObjectId(id);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID format'
      });
    }
  }
  
  if (legacyId) {
    filter.legacyId = Number(legacyId);
  }
  
  if (mysqlId) {
    filter.mysqlId = Number(mysqlId);
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

  try {
    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Execute query with pagination
    const [groups, total] = await Promise.all([
      Group.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Group.countDocuments(filter)
    ]);
    
    if (!groups || groups.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No groups found',
        data: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          pages: 0
        }
      });
    }

    // Check if we should populate member details
    const shouldPopulate = populateMembers === 'true';
    
    if (!shouldPopulate) {
      // Return groups without populating member details
      return res.status(200).json({
        success: true,
        count: groups.length,
        total,
        data: groups.map(group => ({
          ...group,
          members: Array.isArray(group.members) ? group.members : []
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    }
    
    // ==================== FIX: Handle different member structures ====================
    
    // Collect all unique member CUST_IDs - handle both string and object formats
    const allMemberIds = groups.flatMap(group => {
      if (!group.members || !Array.isArray(group.members)) {
        return [];
      }
      
      return group.members.map(member => {
        try {
          // Case 1: member is already a string (CUST_ID)
          if (typeof member === 'string') {
            // Validate it's a valid CUST_ID format
            return member.trim() || null;
          }
          
          // Case 2: member is an object
          if (typeof member === 'object' && member !== null) {
            // Try to extract CUST_ID from different possible field names
            const custId = member.CUST_ID || 
                          member.customerId || 
                          member.custId || 
                          member.memberId || 
                          member.id;
            
            // Return as string if found
            if (custId) {
              return String(custId).trim();
            }
            
            // If no CUST_ID but has customerId or other ID fields
            if (member.customerId) {
              return String(member.customerId).trim();
            }
            
            // Last resort: if member has a toString method
            if (typeof member.toString === 'function') {
              return member.toString().trim();
            }
          }
          
          return null;
        } catch (error) {
          console.warn('Error extracting member ID:', error.message, { member });
          return null;
        }
      }).filter(id => id !== null && id !== ''); // Remove null/empty values
    });

    // Remove duplicates
    const uniqueMemberIds = [...new Set(allMemberIds)];
    
    console.log('Total groups found:', groups.length);
    console.log('Unique member IDs to fetch:', uniqueMemberIds.length);
    
    if (uniqueMemberIds.length > 0) {
      console.log('Sample member IDs:', uniqueMemberIds.slice(0, 5));
    } else {
      console.log('No valid member IDs found in groups');
    }

    // ==================== Fetch member details ====================
    let memberLookup = {};
    
    if (uniqueMemberIds.length > 0) {
      try {
        // Try to fetch from Customer model
        const membersData = await Customer.find(
          { CUST_ID: { $in: uniqueMemberIds } },
          'CUST_ID FIRST_NAME LAST_NAME GENDER EMAIL PHONE_NUMBER ACCT_NO'
        ).lean();
        
        // Build lookup map
        memberLookup = membersData.reduce((acc, member) => {
          if (member.CUST_ID) {
            acc[member.CUST_ID] = {
              CUST_ID: member.CUST_ID,
              CUST_NAME: `${member.FIRST_NAME || ''} ${member.LAST_NAME || ''}`.trim() || 'Unknown Customer',
              GENDER: member.GENDER || '',
              EMAIL: member.EMAIL || '',
              PHONE_NUMBER: member.PHONE_NUMBER || '',
              ACCT_NO: member.ACCT_NO || ''
            };
          }
          return acc;
        }, {});
        
        console.log('Successfully fetched member details:', membersData.length);
      } catch (error) {
        console.error('Error fetching member details:', error.message);
        // Don't fail the whole request if member fetch fails
      }
    }

    // ==================== Populate groups with member details ====================
    const populatedGroups = groups.map(group => {
      const groupMembers = [];
      
      if (Array.isArray(group.members)) {
        group.members.forEach(member => {
          try {
            let custId = null;
            let memberDetails = null;
            
            // Extract CUST_ID
            if (typeof member === 'string') {
              custId = member.trim();
            } else if (typeof member === 'object' && member !== null) {
              custId = member.CUST_ID || member.customerId || member.custId || member.memberId || member.id;
              if (custId) custId = String(custId).trim();
              
              // If member object has details, use them
              if (member.customerName || member.firstName) {
                memberDetails = {
                  CUST_ID: custId || 'N/A',
                  CUST_NAME: member.customerName || `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Unknown Customer',
                  GENDER: member.gender || '',
                  EMAIL: member.email || '',
                  PHONE_NUMBER: member.phoneNumber || '',
                  ACCT_NO: member.membershipNumber || ''
                };
              }
            }
            
            if (custId) {
              // Use fetched details if available, otherwise use extracted details or minimal info
              if (memberLookup[custId]) {
                groupMembers.push(memberLookup[custId]);
              } else if (memberDetails) {
                groupMembers.push(memberDetails);
              } else {
                groupMembers.push({
                  CUST_ID: custId,
                  CUST_NAME: 'Unknown Customer (ID only)',
                  GENDER: '',
                  EMAIL: '',
                  PHONE_NUMBER: '',
                  ACCT_NO: ''
                });
              }
            }
          } catch (memberError) {
            console.warn('Error processing member:', memberError.message, { member });
          }
        });
      }
      
      // Return group with cleaned data
      return {
        _id: group._id,
        groupCode: group.groupCode || '',
        groupName: group.groupName || '',
        members: groupMembers,
        memberCount: groupMembers.length,
        branch: group.branch || 0,
        status: group.status || 'active',
        groupType: group.groupType || 'Union',
        legacyId: group.legacyId,
        mysqlId: group.mysqlId,
        relationshipManager: group.relationshipManager || 0,
        regDate: group.regDate,
        meetingDay: group.meetingDay,
        meetingFrequency: group.meetingFrequency,
        unionAddress: group.unionAddress,
        createdBy: group.createdBy,
        offlineId: group.offlineId,
        unionPurseAccount: group.unionPurseAccount,
        migrationId: group.migrationId,
        originalData: group.originalData,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        // Virtual field
        displayName: `${group.groupCode || ''} - ${group.groupName || ''}`.trim()
      };
    });

    return res.status(200).json({
      success: true,
      count: populatedGroups.length,
      total,
      data: populatedGroups,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      },
      memberFetchStats: {
        uniqueMemberIds: uniqueMemberIds.length,
        memberDetailsFetched: Object.keys(memberLookup).length,
        groupsWithMembers: populatedGroups.filter(g => g.members.length > 0).length
      }
    });

  } catch (error) {
    console.error('Error in getGroups:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
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
    console.log('=== STARTING GROUP LOAN CREATION (NON-DISBURSED) ===');
    
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
      adminFee = "",
      interestRate,
      termValue,
      paymentFrequency,
      capitalizeInterest = false,
      capitalizationFrequency = 'MONTHLY',
      capitalizationThreshold = 0,
      deductUpfrontInterest = false,
      upfrontInterestPercentage = 0,
      penaltyRate = 5,
      dayCountConvention = 'ACTUAL/365'
    } = req.body;

    // Validate required fields
    if (!groupCode || !primaryRelationshipManager || !loanPurpose || !savingsAccount || members.length === 0) {
      throw new Error('Missing required fields: groupCode, primaryRelationshipManager, loanPurpose, savingsAccount, and members are required');
    }

    // Fetch group
    const group = await Group.findOne({ groupCode }).session(session);
    if (!group) throw new Error('Group not found');

    // Check for existing active loan
    const existing = await GroupLoan.findOne({
      groupCode,
      status: { $in: ['applied', 'approved', 'disbursed', 'partially_disbursed'] }
    }).session(session);
    if (existing) throw new Error(`Group already has active loan: ${existing.loanId}`);

    // Fetch loan product
    const loanProduct = await LoanProduct.findOne({ PROD_ID: productId }).session(session);
    if (!loanProduct) throw new Error(`Loan product with PROD_ID ${productId} not found`);

    // Generate loan ID and get creator
    const loanId = await generateGroupLoanId();
    const createdBy = req.user?._id || (await User.findOne({ employeeId: 'SYSTEM' }))?._id;

    let computedTotal = 0;
    const processedMembers = [];
    let totalFeesCollected = 0;
    let totalUpfrontInterest = 0;

    // ==================== MEMBER VALIDATION ====================
    for (const m of members) {
      const memberId = safeToString(m.memberId);
      const amount = safeNumber(m.individualAmount);
      const savingsAccNo = safeToString(m.savingsAccountNo);
      const name = safeToString(m.name, `Member ${memberId}`);

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

    // ==================== INTEREST CALCULATION PARAMETERS ====================
    const effectiveInterestRate = interestRate || parseFloat(loanProduct.interestRate?.toString() || '6.5');
    const effectiveTermValue = termValue || safeNumber(loanProduct.maxTerm) || 12;
    const effectivePaymentFrequency = paymentFrequency || loanProduct.PAYMENT_FREQUENCY || 'WEEKLY';
    const productType = loanProduct.PRODUCT_TYPE || 'GROUP_LOAN';

    console.log('=== GROUP LOAN APPLICATION PARAMETERS ===');
    console.log('Members:', processedMembers.length);
    console.log('Total Amount:', finalTotal);
    console.log('Interest Rate:', effectiveInterestRate + '%');
    console.log('Term:', effectiveTermValue);
    console.log('Payment Frequency:', effectivePaymentFrequency);

    // ==================== CALCULATE LOAN TERMS ====================
    const startDate = new Date();
    let maturityDate = calculateMaturityDate(startDate, effectiveTermValue, effectivePaymentFrequency);

    // ==================== DEBIT FEES AND UPFRONT INTEREST ONLY ====================
    for (const mem of processedMembers) {
      const processingFeeAmount = mem.individualAmount * (safeNumber(processingFee) / 100);
      const adminFeeAmount = safeNumber(adminFee);
      const memberTotalFees = processingFeeAmount + adminFeeAmount;
      totalFeesCollected += memberTotalFees;

      let memberUpfrontInterest = 0;
      if (deductUpfrontInterest && upfrontInterestPercentage > 0) {
        memberUpfrontInterest = mem.individualAmount * (upfrontInterestPercentage / 100);
        totalUpfrontInterest += memberUpfrontInterest;
      }

      const totalDebit = memberTotalFees + memberUpfrontInterest;
      
      if (totalDebit > 0) {
        const available = safeNumber(mem.savingsAccount.AVAILABLE_BALANCE || mem.savingsAccount.ledger_balance || 0);
        if (available < totalDebit) {
          throw new Error(`Member ${mem.name} insufficient balance for fees + upfront interest. Available: ₦${available}, Required: ₦${totalDebit}`);
        }

        // Update savings account balance
        mem.savingsAccount.AVAILABLE_BALANCE = available - totalDebit;
        if (mem.savingsAccount.ledger_balance !== undefined) {
          mem.savingsAccount.ledger_balance -= totalDebit;
        }
        await mem.savingsAccount.save({ session });

        // Record transaction for fees and upfront interest only
        const accountNumber = mem.savingsAccount.account_number || mem.savingsAccount.ACCT_NO;
        const accountName = mem.savingsAccount.ACCT_NM || mem.savingsAccount.account_name || mem.name;
        const customerId = mem.savingsAccount.CUST_ID || mem.savingsAccount.customer_id || mem.memberId;
        const businessUnit = mem.savingsAccount.BU_ID || group.branch || '100';

        const feeTransaction = new Transaction({
          TRANSACTION_TYPE: 'DEBIT',
          AMOUNT: parseFloat(totalDebit),
          ACCT_NM: accountName,
          CUST_ID: normalizeCustomerId(customerId),
          BU_ID: businessUnit,
          ACCT_ID: mem.savingsAccount._id,
          ACCT_NO: accountNumber,
          account_number: accountNumber,
          transaction_type: 'DEBIT',
          amount: parseFloat(totalDebit),
          description: `Group loan application fees`,
          reference: `GL_FEE_${loanId}_${mem.memberId}_${Date.now()}`,
          TRAN_PARTICULARS: `Fees for group loan application ${loanId}`,
          transaction_date: new Date(),
          TRAN_DATE: new Date(),
          VALUE_DATE: new Date(),
          STATUS: 'COMPLETED',
          REC_ST: 'A',
          createdBy: createdBy,
          branch: group.branch || 1,
          CREATED_BY: createdBy?.toString() || 'SYSTEM',
          BALANCE: available - totalDebit,
          AVAILABLE_BALANCE: available - totalDebit,
          metadata: { 
            purpose: 'GROUP_LOAN_APPLICATION_FEES', 
            loanId, 
            memberId: mem.memberId,
            applicationOnly: true,
            disbursementPending: true
          }
        });

        await feeTransaction.save({ session });
      }
    }

    // ==================== CREATE LOAN ACCOUNTS (NON-DISBURSED) ====================
    const individualLoanIds = [];
    const memberRepaymentSchedules = [];
    const memberInterestCalculations = [];

    for (const mem of processedMembers) {
      const loanAccNo = await generateLoanAccountNumberByProdId(productId);
      
      console.log(`\n=== Creating NON-DISBURSED loan account ${loanAccNo} for member ${mem.memberId} ===`);

      // Calculate fees and upfront interest for this member
      const processingFeeAmount = mem.individualAmount * (safeNumber(processingFee) / 100);
      const adminFeeAmount = safeNumber(adminFee);
      const memberTotalFees = processingFeeAmount + adminFeeAmount;
      
      let memberUpfrontInterest = 0;
      if (deductUpfrontInterest && upfrontInterestPercentage > 0) {
        memberUpfrontInterest = mem.individualAmount * (upfrontInterestPercentage / 100);
      }

      // ==================== CORRECT FLAT RATE INTEREST CALCULATION ====================
      const principal = mem.individualAmount;
      const annualInterestRate = effectiveInterestRate;
      const termMonths = effectiveTermValue;
      
      // Calculate total interest
      const totalInterest = (principal * annualInterestRate * termMonths) / (12 * 100);
      const totalRepayment = principal + totalInterest;
      
      // Determine number of installments
      let numberOfInstallments = 0;
      switch(effectivePaymentFrequency.toUpperCase()) {
        case 'DAILY':
          numberOfInstallments = termMonths * 30;
          break;
        case 'WEEKLY':
          numberOfInstallments = termMonths * 4;
          break;
        case 'BIWEEKLY':
          numberOfInstallments = termMonths * 2;
          break;
        case 'MONTHLY':
          numberOfInstallments = termMonths;
          break;
        case 'QUARTERLY':
          numberOfInstallments = Math.ceil(termMonths / 3);
          break;
        default:
          numberOfInstallments = termMonths;
      }
      
      const installmentAmount = totalRepayment / numberOfInstallments;
      const interestPerInstallment = totalInterest / numberOfInstallments;
      const principalPerInstallment = principal / numberOfInstallments;

      // ==================== GENERATE REPAYMENT SCHEDULE ====================
      const memberInstallments = [];
      let remainingBalance = principal;
      
      for (let i = 0; i < numberOfInstallments; i++) {
        const dueDate = new Date(startDate);
        
        switch(effectivePaymentFrequency.toUpperCase()) {
          case 'DAILY':
            dueDate.setDate(startDate.getDate() + (i + 1));
            break;
          case 'WEEKLY':
            dueDate.setDate(startDate.getDate() + ((i + 1) * 7));
            break;
          case 'BIWEEKLY':
            dueDate.setDate(startDate.getDate() + ((i + 1) * 14));
            break;
          case 'MONTHLY':
            dueDate.setMonth(startDate.getMonth() + (i + 1));
            break;
          case 'QUARTERLY':
            dueDate.setMonth(startDate.getMonth() + ((i + 1) * 3));
            break;
          default:
            dueDate.setMonth(startDate.getMonth() + (i + 1));
        }
        
        const isLastInstallment = i === numberOfInstallments - 1;
        const installmentPrincipal = isLastInstallment ? 
          remainingBalance : principalPerInstallment;
        const installmentInterest = isLastInstallment ? 
          (installmentAmount - installmentPrincipal) : interestPerInstallment;
        
        remainingBalance -= installmentPrincipal;
        
        memberInstallments.push({
          installmentNo: i + 1,
          dueDate: dueDate,
          principal: safeNumber(installmentPrincipal.toFixed(2)),
          interest: safeNumber(installmentInterest.toFixed(2)),
          totalPayment: safeNumber(installmentAmount.toFixed(2)),
          remainingBalance: safeNumber(remainingBalance.toFixed(2)),
          status: 'PENDING',
          amountPaid: 0,
          principalPaid: 0,
          interestPaid: 0,
          penaltyAccrued: 0,
          capitalizedInterest: 0,
          paymentDate: null,
          isEarlyPayment: false,
          isOverduePayment: false,
          lateFeeCharged: 0
        });
      }

      // Store interest calculation
      memberInterestCalculations.push({
        memberId: mem.memberId,
        memberName: mem.name,
        principal: mem.individualAmount,
        interestCalculation: {
          totalInterest: totalInterest,
          totalRepayment: totalRepayment,
          installmentAmount: installmentAmount,
          numberOfInstallments: numberOfInstallments,
          calculationMethod: 'flat'
        },
        upfrontInterest: memberUpfrontInterest,
        fees: {
          processingFee: processingFeeAmount,
          adminFee: adminFeeAmount,
          total: memberTotalFees
        }
      });

      // ==================== CREATE LOAN ACCOUNT WITH ZERO BALANCE ====================
      const newLoanAcc = new LoanAccount({
        CUST_ID: normalizeCustomerId(mem.memberId),
        ACCT_NM: mem.name,
        ACCT_NO: loanAccNo,
        LOAN_STATUS: 'APPROVED',
        PRODUCT_TYPE: 'GROUP_LOAN',

        PROD_ID: loanProduct.PROD_ID,
        BU_ID: loanProduct.BU_ID[0] || '100',
        PAYMENT_FREQUENCY: effectivePaymentFrequency,
        TERM_CD: loanProduct.TERM_CD || 'W',
        PRIMARY_OFFICER_ID: primaryRelationshipManager,

        INTEREST_RATE: effectiveInterestRate,
        INTEREST_CALCULATION_METHOD: 'flat',
        DAY_COUNT_CONVENTION: dayCountConvention,
        CAPITALIZE_INTEREST: capitalizeInterest,
        CAPITALIZATION_FREQUENCY: capitalizationFrequency,
        CAPITALIZATION_THRESHOLD: capitalizationThreshold,

        PENALTY_RATE: penaltyRate,
        DEDUCT_UPFRONT_INTEREST: deductUpfrontInterest,
        UPFRONT_INTEREST_PERCENTAGE: upfrontInterestPercentage,
        UPFRONT_INTEREST_AMOUNT: memberUpfrontInterest,

        APPL_ID: `APP_${loanId}_${mem.memberId}`,
        JOURNAL_ID: `JNL_${loanId}_${Date.now()}`,

        MATURITY_DT: maturityDate,
        TERM_VALUE: effectiveTermValue,

        DISBURSEMENT_LIMIT: mem.individualAmount,
        
        // CRITICAL: ALL BALANCES ARE 0.00 - LOAN NOT DISBURSED
        OUTSTANDING_PRINCIPAL: 0.00,
        ORIGINAL_PRINCIPAL: mem.individualAmount,
        CURRENT_BALANCE: 0.00,
        LEDGER_BALANCE: 0.00,
        AVAILABLE_BALANCE: 0.00,
        ARREARS_AMOUNT: 0.00,
        ACCRUED_INTEREST: 0.00,
        CAPITALIZED_INTEREST: 0.00,
        PENALTY_ACCRUED: 0.00,
        TOTAL_DUE: 0.00,

        Borrower_address: {
          street: '',
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
          upfrontInterest: memberUpfrontInterest,
          feesCollectedFromSavings: true,
          collectionDate: new Date()
        },
        PAYMENT_SCHEDULE: memberInstallments,
        
        DISBURSEMENT_STATUS: 'PENDING',
        DISBURSEMENT_DATE: null,
        IS_DISBURSED: false,
      });

      const savedLoanAcc = await newLoanAcc.save({ session });
      individualLoanIds.push(savedLoanAcc._id);

      // ==================== CREATE REPAYMENT SCHEDULE ====================
      const repaymentScheduleData = {
        LOAN_ACCOUNT_ID: savedLoanAcc._id,
        ACCT_NO: loanAccNo,
        CUST_ID: normalizeCustomerId(mem.memberId),
        START_DATE: startDate,
        MATURITY_DATE: maturityDate,
        PRINCIPAL_AMOUNT: mem.individualAmount,
        INTEREST_RATE: effectiveInterestRate,
        TERM: effectiveTermValue,
        TERM_TYPE: mapPaymentFrequencyToTermType(effectivePaymentFrequency),
        paymentFrequency: mapPaymentFrequencyToSchema(effectivePaymentFrequency),
        DAY_COUNT_CONVENTION: dayCountConvention,
        CAPITALIZATION_ENABLED: capitalizeInterest,
        CAPITALIZATION_FREQUENCY: capitalizationFrequency,
        installments: memberInstallments,
        TOTAL_INTEREST: totalInterest,
        TOTAL_REPAYMENT: totalRepayment,
        INTEREST_CALCULATION_METHOD: 'flat',
        TRANSACTION_ID: `TXN_${loanId}_${mem.memberId}`,
        EVENT_ID: `EVT_${loanId}_${Date.now()}`,
        CREATED_BY: createdBy.toString(),
        STATUS: 'PENDING_DISBURSEMENT', // NOT ACTIVE
        EMI_AMOUNT: installmentAmount,
        UPFRONT_INTEREST: {
          type: deductUpfrontInterest ? 'UPFRONT' : 'NONE',
          amount: memberUpfrontInterest,
          percentage: upfrontInterestPercentage
        },
        DISBURSEMENT_STATUS: 'PENDING'
      };

      const repaymentSchedule = new RepaymentSchedule(repaymentScheduleData);
      const savedSchedule = await repaymentSchedule.save({ session });

      memberRepaymentSchedules.push({
        memberId: mem.memberId,
        memberName: mem.name,
        loanAccountId: savedLoanAcc._id,
        repaymentScheduleId: savedSchedule._id,
        loanAccountNo: loanAccNo
      });
    }

    // ==================== CALCULATE GROUP SUMMARY ====================
    const totalInterest = (finalTotal * effectiveInterestRate * effectiveTermValue) / (12 * 100);
    const totalRepayment = finalTotal + totalInterest;

    // ==================== CREATE GROUP LOAN ====================
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
      interestRate: effectiveInterestRate,
      loanTerm: effectivePaymentFrequency.toLowerCase(),
      termValue: effectiveTermValue,
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
      status: 'approved', // Approved but not disbursed
      totalFeesCollected,
      totalUpfrontInterestCollected: totalUpfrontInterest,
      netDisbursementAmount: finalTotal,
      interestConfiguration: {
        calculationMethod: 'flat',
        dayCountConvention: dayCountConvention,
        capitalizationEnabled: capitalizeInterest,
        capitalizationFrequency: capitalizationFrequency,
        capitalizationThreshold: capitalizationThreshold,
        penaltyRate: penaltyRate,
        deductUpfrontInterest: deductUpfrontInterest,
        upfrontInterestPercentage: upfrontInterestPercentage
      },
      interestCalculations: memberInterestCalculations,
      interestDetails: {
        totalInterest: totalInterest,
        totalRepayment: totalRepayment,
        paymentFrequency: effectivePaymentFrequency,
        totalInstallments: effectiveTermValue,
        interestRate: effectiveInterestRate
      },
      DISBURSEMENT_STATUS: 'PENDING',
      DISBURSEMENT_DATE: null
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

    console.log(`\n✅ GROUP LOAN ${loanId} APPROVED SUCCESSFULLY ===`);
    console.log(`   Members: ${processedMembers.length}`);
    console.log(`   Total Amount: ₦${finalTotal.toLocaleString()}`);
    console.log(`   Status: APPROVED (Not Disbursed)`);
    console.log(`   Loan Portfolio: NOT UPDATED (Will update on disbursement)`);

    res.status(201).json({
      success: true,
      message: `Group loan ${loanId} approved successfully. Funds not disbursed.`,
      data: {
        loanId,
        totalAmount: finalTotal,
        totalFeesCollected,
        totalUpfrontInterestCollected: totalUpfrontInterest,
        netDisbursed: 0.00, // NOT DISBURSED
        pendingDisbursement: finalTotal,
        memberCount: processedMembers.length,
        loanStatus: 'APPROVED',
        disbursementStatus: 'PENDING',
        note: 'Loan portfolio will be updated upon disbursement'
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

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate flat rate schedule
 */
function generateFlatRateSchedule({
  principal,
  interestRate,
  termValue,
  paymentAmount,
  totalInstallments,
  paymentFrequency,
  startDate,
  precision = 2
}) {
  const schedule = [];
  let remainingBalance = principal;
  const totalInterest = principal * (interestRate / 100) * (termValue / 12);
  const totalRepayment = principal + totalInterest;
  
  // Calculate equal principal and interest portions
  const equalPrincipal = principal / totalInstallments;
  const equalInterest = totalInterest / totalInstallments;

  for (let i = 1; i <= totalInstallments; i++) {
    const dueDate = calculateDueDate(startDate, i, paymentFrequency);
    
    // For the last installment, adjust to ensure zero balance
    let principalPortion = equalPrincipal;
    let interestPortion = equalInterest;
    let totalPayment = paymentAmount;
    
    if (i === totalInstallments) {
      // Final installment - adjust to clear remaining balance
      principalPortion = remainingBalance;
      interestPortion = totalPayment - principalPortion;
    } else {
      remainingBalance -= principalPortion;
    }
    
    schedule.push({
      installmentNo: i,
      dueDate,
      principal: parseFloat(principalPortion.toFixed(precision)),
      interest: parseFloat(interestPortion.toFixed(precision)),
      totalPayment: parseFloat(totalPayment.toFixed(precision)),
      remainingBalance: parseFloat(remainingBalance.toFixed(precision))
    });
  }

  return schedule;
}

/**
 * Calculate due date based on payment frequency
 */
function calculateDueDate(startDate, periodNumber, paymentFrequency) {
  const date = new Date(startDate);
  
  switch (paymentFrequency.toUpperCase()) {
    case 'DAILY':
      date.setDate(date.getDate() + periodNumber);
      break;
    case 'WEEKLY':
      date.setDate(date.getDate() + (periodNumber * 7));
      break;
    case 'BIWEEKLY':
      date.setDate(date.getDate() + (periodNumber * 14));
      break;
    case 'MONTHLY':
      date.setMonth(date.getMonth() + periodNumber);
      break;
    case 'QUARTERLY':
      date.setMonth(date.getMonth() + (periodNumber * 3));
      break;
    case 'SEMI_ANNUAL':
      date.setMonth(date.getMonth() + (periodNumber * 6));
      break;
    case 'ANNUAL':
      date.setFullYear(date.getFullYear() + periodNumber);
      break;
    default:
      // Default to monthly
      date.setMonth(date.getMonth() + periodNumber);
  }
  
  return date.toISOString().split('T')[0];
}


/**
 * Map payment frequency to schema format
 */
function mapPaymentFrequencyToSchema(paymentFrequency) {
  const mapping = {
    'DAILY': 'DAILY',
    'WEEKLY': 'WEEKLY',
    'BIWEEKLY': 'BI_WEEKLY',
    'MONTHLY': 'MONTHLY',
    'QUARTERLY': 'QUARTERLY',
    'SEMI_ANNUAL': 'SEMI_ANNUAL',
    'ANNUAL': 'ANNUAL'
  };
  
  return mapping[paymentFrequency.toUpperCase()] || 'MONTHLY';
}

/**
 * Validate repayment schedule data
 */
function validateRepaymentScheduleData(data) {
  const requiredFields = [
    'LOAN_ACCOUNT_ID',
    'ACCT_NO',
    'CUST_ID',
    'START_DATE',
    'MATURITY_DATE',
    'PRINCIPAL_AMOUNT',
    'INTEREST_RATE',
    'TERM',
    'TERM_TYPE',
    'paymentFrequency',
    'installments',
    'TOTAL_INTEREST',
    'TOTAL_REPAYMENT',
    'TRANSACTION_ID',
    'EVENT_ID',
    'CREATED_BY',
    'STATUS'
  ];
  
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields in repayment schedule: ${missingFields.join(', ')}`);
  }
  
  if (!Array.isArray(data.installments) || data.installments.length === 0) {
    throw new Error('Installments array is required and must not be empty');
  }
};


// Enhanced calculateFlatRatePrecise function to ensure proper field names
function calculateFlatRatePrecise({ principal, annualRate, termMonths, startDate, paymentFrequency }) {
  const monthlyRate = annualRate / 100 / 12;
  const totalInterest = principal * monthlyRate * termMonths;
  const totalRepayment = principal + totalInterest;
  
  // Calculate payment amount based on frequency
  let paymentAmount;
  let totalInstallments;
  
  switch (paymentFrequency?.toUpperCase()) {
    case 'DAILY':
      totalInstallments = termMonths * 30; // Approximate
      paymentAmount = totalRepayment / totalInstallments;
      break;
    case 'WEEKLY':
      totalInstallments = termMonths * 4; // Approximate
      paymentAmount = totalRepayment / totalInstallments;
      break;
    case 'BI_WEEKLY':
    case 'BIWEEKLY':
      totalInstallments = termMonths * 2; // Approximate
      paymentAmount = totalRepayment / totalInstallments;
      break;
    case 'MONTHLY':
    default:
      totalInstallments = termMonths;
      paymentAmount = totalRepayment / totalInstallments;
      break;
  }
  
  // Generate installments
  const installments = [];
  let remainingBalance = principal;
  let currentDate = new Date(startDate);
  
  for (let i = 1; i <= totalInstallments; i++) {
    // Calculate principal and interest for this installment
    const interest = remainingBalance * monthlyRate;
    const principalPayment = paymentAmount - interest;
    
    // Adjust for final installment to ensure zero balance
    if (i === totalInstallments) {
      remainingBalance = 0;
    } else {
      remainingBalance -= principalPayment;
    }
    
    // Set due date based on payment frequency
    const dueDate = new Date(currentDate);
    switch (paymentFrequency?.toUpperCase()) {
      case 'DAILY':
        dueDate.setDate(currentDate.getDate() + 1);
        break;
      case 'WEEKLY':
        dueDate.setDate(currentDate.getDate() + 7);
        break;
      case 'BI_WEEKLY':
      case 'BIWEEKLY':
        dueDate.setDate(currentDate.getDate() + 14);
        break;
      case 'MONTHLY':
      default:
        dueDate.setMonth(currentDate.getMonth() + 1);
        break;
    }
    
    installments.push({
      installmentNo: i, // Use installmentNo to match schema
      dueDate: dueDate,
      principal: Math.max(0, principalPayment),
      interest: Math.max(0, interest),
      totalPayment: paymentAmount,
      remainingBalance: Math.max(0, remainingBalance)
    });
    
    currentDate = new Date(dueDate);
  }
  
  // Final adjustment to ensure zero balance
  if (installments.length > 0) {
    const lastInstallment = installments[installments.length - 1];
    lastInstallment.remainingBalance = 0;
    lastInstallment.totalPayment = lastInstallment.principal + lastInstallment.interest;
  }
  
  return {
    installments,
    totalInterest,
    totalRepayment,
    paymentAmount,
    totalInstallments,
    emi: paymentAmount // Alias for EMI_AMOUNT field
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

// const safeNumber = (value, defaultValue = 0) => {
//   if (value === null || value === undefined) return defaultValue;
//   const num = Number(value);
//   return isNaN(num) ? defaultValue : num;
// };

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


// Helper function to calculate due dates from disbursement date
function calculateDueDateFromDisbursement(disbursementDate, installmentNumber, paymentFrequency) {
  const dueDate = new Date(disbursementDate);
  
  switch (paymentFrequency?.toUpperCase()) {
    case 'DAILY':
      dueDate.setDate(disbursementDate.getDate() + installmentNumber);
      break;
    case 'WEEKLY':
      dueDate.setDate(disbursementDate.getDate() + (installmentNumber * 7));
      break;
    case 'BI_WEEKLY':
      dueDate.setDate(disbursementDate.getDate() + (installmentNumber * 14));
      break;
    case 'MONTHLY':
      dueDate.setMonth(disbursementDate.getMonth() + installmentNumber);
      break;
    case 'QUARTERLY':
      dueDate.setMonth(disbursementDate.getMonth() + (installmentNumber * 3));
      break;
    case 'YEARLY':
      dueDate.setFullYear(disbursementDate.getFullYear() + installmentNumber);
      break;
    default:
      dueDate.setMonth(disbursementDate.getMonth() + installmentNumber);
  }
  
  return dueDate;
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

    // STEP 1: Find the group loan with repayment schedules
    const groupLoan = await GroupLoan.findOne({ 
      loanId: groupId.toUpperCase() 
    })
    .populate('members.memberId')
    .populate('individualLoanAccounts')
    .populate('memberRepaymentSchedules.repaymentScheduleId'); // Populate repayment schedules

    if (!groupLoan) {
      return res.status(404).json({
        success: false,
        message: `Group loan with ID ${groupId} not found`
      });
    }

    console.log(`✅ Found group loan: ${groupLoan.loanId}, Status: ${groupLoan.status}`);
    console.log(`📊 Repayment schedules: ${groupLoan.memberRepaymentSchedules?.length || 0}`);

    // STEP 2: Get all loan accounts for this group
    const loanAccounts = await LoanAccount.find({
      groupLoan: groupLoan._id
    })
    .populate('CUST_ID')
    .sort({ ACCT_NO: 1 });

    console.log(`📊 Found ${loanAccounts.length} loan accounts for group`);

    // STEP 3: Get repayment schedules for all loan accounts
    const loanAccountIds = loanAccounts.map(acc => acc._id);
    const repaymentSchedules = await RepaymentSchedule.find({
      LOAN_ACCOUNT_ID: { $in: loanAccountIds }
    });

    // Create a map for quick lookup of repayment schedules
    const repaymentScheduleMap = new Map();
    repaymentSchedules.forEach(schedule => {
      repaymentScheduleMap.set(schedule.LOAN_ACCOUNT_ID.toString(), schedule);
    });

    console.log(`📅 Found ${repaymentSchedules.length} repayment schedules`);

    // STEP 4: Get loan account summaries (handle case where model might not exist)
    let loanSummaries = [];
    let summaryMap = new Map();
    
    try {
      // Check if LoanAccountSummary model exists
      if (mongoose.modelNames().includes('LoanAccountSummary')) {
        const LoanAccountSummary = mongoose.model('LoanAccountSummary');
        
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

    // STEP 5: Get recent payment transactions
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

    // STEP 6: Build collection sheet data
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
        paymentFrequency: groupLoan.paymentFrequency || 'WEEKLY',
        interestRate: groupLoan.interestRate || 0
      },
      summary: {
        totalMembers: loanAccounts.length,
        totalOutstanding: 0,
        totalInstallmentAmount: 0,
        totalPrincipalDue: 0,
        totalInterestDue: 0,
        activeMembers: 0,
        overdueMembers: 0,
        totalLoanAmount: 0,
        totalRepaymentCollected: 0
      },
      members: []
    };

    // STEP 7: Process each member's repayment details with repayment schedule data
    for (const loanAcc of loanAccounts) {
      try {
        const loanSummary = summaryMap.get(loanAcc._id.toString());
        const memberPayments = paymentMap.get(loanAcc.ACCT_NO) || [];
        const repaymentSchedule = repaymentScheduleMap.get(loanAcc._id.toString());
        
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

        // === AUTOMATICALLY GET INSTALLMENT DETAILS FROM REPAYMENT SCHEDULE ===
        let installmentAmount = 0;
        let principalAmount = 0;
        let interestAmount = 0;
        let nextDueDate = null;
        let currentInstallment = null;
        let totalPrincipalDue = 0;
        let totalInterestDue = 0;
        let totalInstallments = 0;
        let emiAmount = 0;

        if (repaymentSchedule) {
          console.log(`📅 Using repayment schedule for ${loanAcc.ACCT_NO}`);
          
          // Get EMI amount from repayment schedule
          emiAmount = safeNumber(repaymentSchedule.EMI_AMOUNT);
          installmentAmount = emiAmount;
          totalInstallments = repaymentSchedule.installments?.length || 0;

          // Find current/next installment
          const now = new Date();
          currentInstallment = repaymentSchedule.installments?.find(inst => 
            inst.status === 'PENDING' || inst.status === 'OVERDUE'
          );

          if (currentInstallment) {
            principalAmount = safeNumber(currentInstallment.principal);
            interestAmount = safeNumber(currentInstallment.interest);
            installmentAmount = safeNumber(currentInstallment.totalPayment);
            nextDueDate = currentInstallment.dueDate;
          } else {
            // If no current installment, use first installment values
            const firstInstallment = repaymentSchedule.installments?.[0];
            if (firstInstallment) {
              principalAmount = safeNumber(firstInstallment.principal);
              interestAmount = safeNumber(firstInstallment.interest);
              installmentAmount = safeNumber(firstInstallment.totalPayment);
              nextDueDate = firstInstallment.dueDate;
            }
          }

          // Calculate total principal and interest due from all pending installments
          const pendingInstallments = repaymentSchedule.installments?.filter(inst => 
            inst.status === 'PENDING' || inst.status === 'OVERDUE'
          ) || [];

          totalPrincipalDue = pendingInstallments.reduce((sum, inst) => sum + safeNumber(inst.principal), 0);
          totalInterestDue = pendingInstallments.reduce((sum, inst) => sum + safeNumber(inst.interest), 0);

        } else {
          // Fallback calculation if no repayment schedule found
          console.log(`⚠️ No repayment schedule found for ${loanAcc.ACCT_NO}, using fallback`);
          installmentAmount = groupLoan.installmentAmount || 
                            loanAcc.installmentAmount ||
                            (loanSummary?.INSTALLMENT_AMOUNT || 
                            (loanAmount * 0.05)); // 5% as fallback

          // Estimate principal and interest split (80% principal, 20% interest as default)
          principalAmount = installmentAmount * 0.8;
          interestAmount = installmentAmount * 0.2;
        }

        // Determine payment frequency
        const paymentFrequency = repaymentSchedule?.paymentFrequency || 
                               groupLoan.paymentFrequency || 
                               loanAcc.PAYMENT_FREQUENCY || 
                               'WEEKLY';

        // Calculate outstanding balance - use multiple fallbacks
        let outstandingBalance = 0;
        if (loanSummary) {
          outstandingBalance = loanSummary.OUTSTANDING_PRINCIPAL || 
                             loanSummary.CLEARED_BAL || 
                             (loanAmount - totalRepayment);
        } else if (repaymentSchedule) {
          // Calculate from repayment schedule
          const paidInstallments = repaymentSchedule.installments?.filter(inst => 
            inst.status === 'PAID' || inst.status === 'PARTIAL'
          ) || [];
          
          const totalPaid = paidInstallments.reduce((sum, inst) => sum + safeNumber(inst.amountPaid), 0);
          outstandingBalance = Math.max(0, loanAmount - totalPaid);
        } else {
          // Fallback calculation
          outstandingBalance = Math.max(0, loanAmount - totalRepayment);
        }

        // If no next due date from repayment schedule, calculate it
        if (!nextDueDate) {
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
            nextDueDate = nextDate;
          }
        }

        // Check if member is overdue
        const isOverdue = nextDueDate && new Date(nextDueDate) < new Date();
        const daysOverdue = isOverdue ? 
          Math.floor((new Date() - new Date(nextDueDate)) / (1000 * 60 * 60 * 24)) : 0;

        // Build member repayment record with repayment schedule details
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
          
          // Repayment schedule details
          installmentAmount: parseFloat(installmentAmount.toFixed(2)),
          principalAmount: parseFloat(principalAmount.toFixed(2)),
          interestAmount: parseFloat(interestAmount.toFixed(2)),
          emiAmount: parseFloat(emiAmount.toFixed(2)),
          totalPrincipalDue: parseFloat(totalPrincipalDue.toFixed(2)),
          totalInterestDue: parseFloat(totalInterestDue.toFixed(2)),
          
          totalRepayment: parseFloat(totalRepayment.toFixed(2)),
          outstandingBalance: parseFloat(Math.max(0, outstandingBalance).toFixed(2)),
          lastPaymentAmount: parseFloat(lastPaymentAmount.toFixed(2)),
          
          // Dates and frequency
          startDate: loanAcc.START_DT || loanAcc.disbursedAt,
          nextPaymentDate: nextDueDate,
          paymentFrequency: paymentFrequency,
          lastPaymentDate: lastPayment?.TRANSACTIONDATE,
          
          // Repayment schedule info
          hasRepaymentSchedule: !!repaymentSchedule,
          totalInstallments: totalInstallments,
          currentInstallment: currentInstallment?.installmentNo || 1,
          repaymentScheduleId: repaymentSchedule?._id,
          
          // Status
          isOverdue: isOverdue,
          daysOverdue: daysOverdue,
          loanStatus: loanAcc.LOAN_STATUS || 'ACTIVE',
          installmentStatus: currentInstallment?.status || 'PENDING'
        };

        collectionSheet.members.push(memberRecord);

        // Update summary totals
        collectionSheet.summary.totalOutstanding += memberRecord.outstandingBalance;
        collectionSheet.summary.totalInstallmentAmount += memberRecord.installmentAmount;
        collectionSheet.summary.totalPrincipalDue += memberRecord.principalAmount;
        collectionSheet.summary.totalInterestDue += memberRecord.interestAmount;
        collectionSheet.summary.totalLoanAmount += memberRecord.loanAmount;
        collectionSheet.summary.totalRepaymentCollected += memberRecord.totalRepayment;
        collectionSheet.summary.activeMembers++;
        
        if (memberRecord.isOverdue) {
          collectionSheet.summary.overdueMembers++;
        }

      } catch (error) {
        console.error(`❌ Error processing member ${loanAcc.ACCT_NO}:`, error.message);
        // Continue with next member even if one fails
      }
    }

    // STEP 8: Final calculations
    collectionSheet.summary.averageInstallment = collectionSheet.members.length > 0 ?
      collectionSheet.summary.totalInstallmentAmount / collectionSheet.members.length : 0;

    collectionSheet.summary.collectionRate = collectionSheet.summary.totalLoanAmount > 0 ?
      (collectionSheet.summary.totalRepaymentCollected / collectionSheet.summary.totalLoanAmount * 100) : 0;

    // Add repayment schedule summary
    collectionSheet.summary.repaymentSchedulesFound = repaymentSchedules.length;
    collectionSheet.summary.membersWithSchedules = collectionSheet.members.filter(m => m.hasRepaymentSchedule).length;

    // Sort members by customer name for easy reference
    collectionSheet.members.sort((a, b) => a.customerName.localeCompare(b.customerName));

    console.log(`✅ Collection sheet generated successfully`);
    console.log(`📋 Summary: ${collectionSheet.members.length} members, ₦${collectionSheet.summary.totalOutstanding.toLocaleString()} total outstanding`);
    console.log(`💰 Principal Due: ₦${collectionSheet.summary.totalPrincipalDue.toLocaleString()}`);
    console.log(`💰 Interest Due: ₦${collectionSheet.summary.totalInterestDue.toLocaleString()}`);
    console.log(`📅 Repayment Schedules: ${collectionSheet.summary.repaymentSchedulesFound} found`);

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

// // Helper function for safe number conversion
// function safeNumber(value, defaultValue = 0) {
//   if (value === null || value === undefined) return defaultValue;
//   const num = Number(value);
//   return isNaN(num) ? defaultValue : num;
// };

// Submit collections API
export const submitGroupCollections = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { 
      groupId, 
      collections, 
      savings, 
      collectedBy, 
      collectionDate,
      paymentMethod = 'CASH',
      transactionReference,
      isInstallment = true
    } = req.body;

    if (!groupId || !collections) {
      return res.status(400).json({
        success: false,
        message: 'Group ID and collections data are required'
      });
    }

    await session.withTransaction(async () => {
      const results = {
        successful: [],
        failed: [],
        savingsProcessed: [],
        repaymentSchedulesUpdated: []
      };

      // Get group loan details for validation
      const groupLoan = await GroupLoan.findOne({ 
        $or: [
          { _id: groupId },
          { loanId: groupId }
        ]
      }).populate('individualLoanAccounts').session(session);

      if (!groupLoan) {
        throw new Error(`Group loan ${groupId} not found`);
      }

      console.log(`💰 Processing collections for group: ${groupLoan.groupName || groupId}`);

      // STEP 0: CREATE COLLECTION DOCUMENT FIRST
      const collectionDoc = new Collection({
        groupId: groupLoan._id,
        groupLoanId: groupLoan._id,
        loanId: groupLoan.loanId,
        groupCode: groupLoan.groupCode,
        amount: collections.reduce((sum, col) => sum + (col.amount || 0), 0),
        currency: 'NGN',
        collectionDate: new Date(collectionDate || new Date()),
        branch: groupLoan.branch || 100,
        relationshipManager: groupLoan.primaryRelationshipManager || groupLoan.createdBy,
        channel: 6, // Field collection channel
        createdBy: collectedBy || 'FIELD_AGENT',
        paymentMethod: paymentMethod,
        transactionReference: transactionReference || `GRP_${groupId}_${Date.now()}`,
        repaymentType: 'loan_repayment',
        status: 'pending'
      });

      await collectionDoc.save({ session });
      console.log(`📄 Collection document created: ${collectionDoc.collectionId}`);

      // STEP 1: Process loan repayments with installment servicing
      for (const collection of collections) {
        let loanAccount = null;
        try {
          if (!collection.accountNo || !collection.amount) {
            results.failed.push({
              accountNo: collection.accountNo,
              reason: 'Missing account number or amount'
            });
            continue;
          }

          console.log(`🔍 Processing loan collection for: ${collection.accountNo}, Amount: ${collection.amount}`);

          // Find the loan account
          loanAccount = await LoanAccount.findOne({ 
            $or: [
              { ACCT_NO: collection.accountNo },
              { accountNumber: collection.accountNo }
            ]
          }).session(session);

          if (!loanAccount) {
            results.failed.push({
              accountNo: collection.accountNo,
              reason: 'Loan account not found'
            });
            continue;
          }

          // Find repayment schedule for this loan account
          const repaymentSchedule = await RepaymentSchedule.findOne({
            LOAN_ACCOUNT_ID: loanAccount._id
          }).session(session);

          if (!repaymentSchedule) {
            results.failed.push({
              accountNo: collection.accountNo,
              reason: 'No repayment schedule found for this loan account'
            });
            continue;
          }

          // Find current/next installment
          const now = new Date();
          let currentInstallment;
          
          if (Array.isArray(repaymentSchedule.installments)) {
            currentInstallment = repaymentSchedule.installments.find(inst => 
              inst.status === 'PENDING' || inst.status === 'OVERDUE' || inst.status === 'PARTIAL'
            );
          } else {
            console.warn('Repayment schedule installments is not an array:', repaymentSchedule.installments);
            results.failed.push({
              accountNo: collection.accountNo,
              reason: 'Invalid repayment schedule structure'
            });
            continue;
          }

          if (!currentInstallment) {
            results.failed.push({
              accountNo: collection.accountNo,
              reason: 'No pending installments found'
            });
            continue;
          }

          console.log(`📅 Current installment: ${currentInstallment.installmentNo}, Due: ${currentInstallment.dueDate}`);

          // Validate payment amount against installment
          const expectedAmount = safeNumber(currentInstallment.totalPayment);
          const paidAmount = safeNumber(collection.amount);
          const tolerance = 0.01;

          if (Math.abs(paidAmount - expectedAmount) > tolerance && isInstallment) {
            results.failed.push({
              accountNo: collection.accountNo,
              reason: `Payment amount (${paidAmount}) does not match expected installment (${expectedAmount})`
            });
            continue;
          }

          // Allocate payment between principal and interest
          const allocation = allocatePaymentToInstallment(
            paidAmount,
            currentInstallment,
            repaymentSchedule.installments
          );

          console.log(`📊 Payment allocation - Principal: ${allocation.principal}, Interest: ${allocation.interest}`);

          // STEP 1A: Update repayment schedule installment
          currentInstallment.amountPaid = safeNumber(currentInstallment.amountPaid) + paidAmount;
          currentInstallment.principalPaid = safeNumber(currentInstallment.principalPaid) + allocation.principal;
          currentInstallment.interestPaid = safeNumber(currentInstallment.interestPaid) + allocation.interest;
          currentInstallment.paymentDate = new Date(collectionDate || new Date());
          
          // Update installment status
          if (currentInstallment.amountPaid >= expectedAmount) {
            currentInstallment.status = 'PAID';
          } else if (currentInstallment.amountPaid > 0) {
            currentInstallment.status = 'PARTIAL';
          }

          // Check if payment is early or overdue
          const dueDate = new Date(currentInstallment.dueDate);
          if (currentInstallment.paymentDate < dueDate) {
            currentInstallment.isEarlyPayment = true;
          } else if (currentInstallment.paymentDate > dueDate) {
            currentInstallment.isOverduePayment = true;
          }

          // STEP 1B: Update loan account
          loanAccount.updateBalances(
            allocation.principal,
            allocation.interest,
            paidAmount
          );
          
          loanAccount.LAST_PAYMENT_DATE = new Date(collectionDate || new Date());
          loanAccount.LAST_PAYMENT_AMOUNT = paidAmount;
          loanAccount.LAST_PAYMENT_METHOD = paymentMethod;

          // Add to payment history
          loanAccount.paymentHistory.push({
            date: new Date(collectionDate || new Date()),
            amount: paidAmount,
            installmentNo: currentInstallment.installmentNo,
            paymentMethod: paymentMethod,
            isEarlyPayment: currentInstallment.isEarlyPayment,
            isOverduePayment: currentInstallment.isOverduePayment
          });

          await loanAccount.save({ session });

          // STEP 1C: Create detailed repayment transaction
          const repaymentTransaction = new Transaction({
            ACCT_NO: collection.accountNo,
            ACCT_ID: loanAccount._id.toString(),
            ACCT_NM: loanAccount.ACCT_NM,
            CUST_ID: loanAccount.CUST_ID,
            TRANSACTION_TYPE: 'CREDIT',
            AMOUNT: paidAmount,
            PRINCIPAL_AMOUNT: allocation.principal,
            INTEREST_AMOUNT: allocation.interest,
            BU_ID: loanAccount.BU_ID || 100,
            PAYMENT_METHOD: paymentMethod,
            TRANSACTION_REFERENCE: transactionReference || `GRP_${groupId}_${Date.now()}_${collection.accountNo}`,
            description: `Loan installment ${currentInstallment.installmentNo} - Group ${groupLoan.groupName || groupId}`,
            status: 'COMPLETED',
            createdBy: collectedBy || 'FIELD_AGENT',
            currency: 'NGN',
            metadata: {
              purpose: 'LOAN_REPAYMENT',
              groupId: groupId,
              groupName: groupLoan.groupName,
              installmentNo: currentInstallment.installmentNo,
              paymentMethod: paymentMethod,
              receiptNo: collection.receiptNo,
              collectionDate: collectionDate,
              isInstallment: isInstallment,
              principalAllocation: allocation.principal,
              interestAllocation: allocation.interest,
              remainingPrincipal: parseFloat(loanAccount.OUTSTANDING_PRINCIPAL.toString()),
              collectionId: collectionDoc._id // Link to collection document
            }
          });

          await repaymentTransaction.save({ session });

          // STEP 1D: ADD LOAN REPAYMENT TO COLLECTION DOCUMENT
          collectionDoc.loanRepayments.push({
            loanAccountId: loanAccount._id,
            loanAccountNumber: collection.accountNo,
            customerId: loanAccount.CUST_ID,
            customerName: loanAccount.ACCT_NM,
            principalAmount: allocation.principal,
            interestAmount: allocation.interest,
            penaltyAmount: 0,
            totalAmount: paidAmount,
            installmentNumber: currentInstallment.installmentNo,
            repaymentDate: new Date(collectionDate || new Date()),
            transactionReference: repaymentTransaction.TRANSACTION_REFERENCE,
            status: 'processed'
          });

          // STEP 1E: Create loan event for audit trail
          await LoanEvent.createServicingEvent({
            ACCT_NO: collection.accountNo,
            LOAN_ACCOUNT_ID: loanAccount._id,
            CUST_ID: loanAccount.CUST_ID,
            eventType: 'GROUP_COLLECTION',
            status: 'PROCESSED',
            installmentNumber: currentInstallment.installmentNo,
            paymentDate: new Date(collectionDate || new Date()),
            amount: paidAmount,
            principalAmount: allocation.principal,
            interestAmount: allocation.interest,
            transactionId: repaymentTransaction._id,
            repaymentScheduleId: repaymentSchedule._id,
            collectionId: collectionDoc._id, // Link to collection
            details: {
              groupId: groupId,
              groupName: groupLoan.groupName,
              collectionType: 'INSTALLMENT',
              paymentMethod: paymentMethod,
              receiptNo: collection.receiptNo,
              remainingPrincipal: parseFloat(loanAccount.OUTSTANDING_PRINCIPAL.toString()),
              previousStatus: currentInstallment.status,
              newStatus: currentInstallment.status,
              expectedAmount: expectedAmount,
              paidAmount: paidAmount,
              collectionId: collectionDoc.collectionId
            },
            createdBy: collectedBy || 'FIELD_AGENT',
            branchId: loanAccount.BU_ID
          });

          // STEP 1F: Update repayment schedule status
          const allInstallmentsPaid = repaymentSchedule.installments.every(inst => 
            inst.status === 'PAID'
          );

          if (allInstallmentsPaid) {
            repaymentSchedule.STATUS = 'COMPLETED';
            loanAccount.LOAN_STATUS = 'CLOSED';
            loanAccount.CLOSURE_DATE = new Date();
            loanAccount.CLOSED_DATE = new Date();
            await loanAccount.save({ session });
          } else {
            repaymentSchedule.STATUS = 'ACTIVE';
          }

          await repaymentSchedule.save({ session });

          // STEP 1G: Update LoanAccountSummary if exists
          await updateLoanAccountSummary(loanAccount, repaymentTransaction, session);

          // STEP 1H: Update group loan totals
          groupLoan.totalRepaid = safeNumber(groupLoan.totalRepaid) + paidAmount;
          groupLoan.remainingBalance = Math.max(0, safeNumber(groupLoan.totalRepayable) - safeNumber(groupLoan.totalRepaid));
          groupLoan.installmentsPaid = safeNumber(groupLoan.installmentsPaid) + 1;

          // Record success with detailed information
          results.successful.push({
            accountNo: collection.accountNo,
            customerName: loanAccount.ACCT_NM,
            amount: paidAmount,
            principal: allocation.principal,
            interest: allocation.interest,
            installmentNo: currentInstallment.installmentNo,
            transactionId: repaymentTransaction._id,
            remainingPrincipal: parseFloat(loanAccount.OUTSTANDING_PRINCIPAL.toString()),
            nextInstallment: getNextInstallment(repaymentSchedule.installments),
            loanStatus: loanAccount.LOAN_STATUS,
            collectionId: collectionDoc._id
          });

          results.repaymentSchedulesUpdated.push({
            accountNo: collection.accountNo,
            scheduleId: repaymentSchedule._id,
            installmentNo: currentInstallment.installmentNo,
            status: currentInstallment.status
          });

          console.log(`✅ Successfully processed loan collection for ${collection.accountNo}`);

        } catch (error) {
          console.error(`❌ Error processing collection for ${collection.accountNo}:`, error.message);
          
          // Record failed event
          if (loanAccount) {
            await LoanEvent.createServicingEvent({
              ACCT_NO: collection.accountNo,
              LOAN_ACCOUNT_ID: loanAccount._id,
              CUST_ID: loanAccount.CUST_ID,
              eventType: 'GROUP_COLLECTION',
              status: 'FAILED',
              errorMessage: error.message,
              collectionId: collectionDoc._id,
              details: {
                groupId: groupId,
                collectionData: collection,
                errorStack: error.stack
              },
              createdBy: collectedBy || 'FIELD_AGENT'
            });
          }
          
          results.failed.push({
            accountNo: collection.accountNo,
            reason: error.message
          });
        }
      }

      // STEP 2: Process savings collections
      if (savings && savings.length > 0) {
        for (const saving of savings) {
          try {
            if (!saving.accountNo || !saving.amount) {
              console.log(`⚠️ Skipping invalid savings collection:`, saving);
              continue;
            }

            console.log(`💰 Processing savings collection for: ${saving.accountNo}, Amount: ${saving.amount}`);

            // Try to find GroupSavings account first
            let groupSavings = await GroupSavings.findOne({
              $or: [
                { accountNumber: saving.accountNo },
                { groupCode: saving.accountNo }
              ]
            }).session(session);

            if (groupSavings) {
              // Process as GroupSavings collection
              await processGroupSavingsCollection(groupSavings, saving, groupId, collectedBy, paymentMethod, transactionReference, collectionDate, session);
              
              // ADD SAVINGS TO COLLECTION DOCUMENT
              collectionDoc.savingsCollections.push({
                accountNumber: saving.accountNo,
                customerId: groupSavings.groupId,
                customerName: groupSavings.groupName,
                amount: saving.amount,
                savingsType: 'GROUP_SAVINGS',
                transactionReference: transactionReference,
                status: 'processed'
              });

              results.savingsProcessed.push({
                accountNo: saving.accountNo,
                amount: saving.amount,
                type: 'GROUP_SAVINGS',
                groupName: groupSavings.groupName,
                newBalance: groupSavings.AVAILABLE_BALANCE
              });

              console.log(`✅ Successfully processed group savings collection for ${saving.accountNo}`);
              continue;
            }

            // If not GroupSavings, try individual CustomerAccount
            const savingsAccount = await CustomerAccount.findOne({
              $or: [
                { account_number: saving.accountNo },
                { ACCT_NO: saving.accountNo }
              ]
            }).session(session);

            if (!savingsAccount) {
              console.log(`❌ Savings account not found: ${saving.accountNo}`);
              continue;
            }

            // Create savings transaction
            const savingsTransaction = new Transaction({
              ACCT_NO: saving.accountNo,
              ACCT_ID: savingsAccount._id.toString(),
              ACCT_NM: savingsAccount.account_name || savingsAccount.ACCT_NM,
              CUST_ID: savingsAccount.customer_id || savingsAccount.CUST_ID,
              TRANSACTION_TYPE: 'CREDIT',
              AMOUNT: saving.amount,
              BU_ID: savingsAccount.branch || 100,
              PAYMENT_METHOD: paymentMethod,
              TRANSACTION_REFERENCE: transactionReference || `GRP_SAV_${groupId}_${Date.now()}`,
              description: `Savings collection - Group ${groupLoan.groupName || groupId}`,
              status: 'COMPLETED',
              createdBy: collectedBy || 'FIELD_AGENT',
              currency: 'NGN',
              metadata: {
                purpose: 'SAVINGS_COLLECTION',
                groupId: groupId,
                groupName: groupLoan.groupName,
                collectionDate: collectionDate,
                collectionId: collectionDoc._id
              }
            });

            await savingsTransaction.save({ session });

            // Update savings account balance
            const currentBalance = safeNumber(savingsAccount.AVAILABLE_BALANCE);
            savingsAccount.AVAILABLE_BALANCE = currentBalance + safeNumber(saving.amount);
            
            if (savingsAccount.ledger_balance !== undefined) {
              savingsAccount.ledger_balance += safeNumber(saving.amount);
            }

            await savingsAccount.save({ session });

            // ADD INDIVIDUAL SAVINGS TO COLLECTION DOCUMENT
            collectionDoc.savingsCollections.push({
              accountNumber: saving.accountNo,
              customerId: savingsAccount.customer_id || savingsAccount.CUST_ID,
              customerName: savingsAccount.account_name || savingsAccount.ACCT_NM,
              amount: saving.amount,
              savingsType: 'INDIVIDUAL_SAVINGS',
              transactionReference: savingsTransaction.TRANSACTION_REFERENCE,
              status: 'processed'
            });

            results.savingsProcessed.push({
              accountNo: saving.accountNo,
              amount: saving.amount,
              transactionId: savingsTransaction._id,
              newBalance: savingsAccount.AVAILABLE_BALANCE,
              type: 'INDIVIDUAL_SAVINGS'
            });

            console.log(`✅ Successfully processed individual savings collection for ${saving.accountNo}`);

          } catch (error) {
            console.error(`❌ Error processing savings for ${saving.accountNo}:`, error.message);
          }
        }
      }

      // STEP 3: UPDATE COLLECTION DOCUMENT WITH FINAL STATUS
      const totalLoanCollected = results.successful.reduce((sum, s) => sum + s.amount, 0);
      const totalSavingsCollected = results.savingsProcessed.reduce((sum, s) => sum + s.amount, 0);

      // Update collection document with processing summary
      collectionDoc.processingSummary = {
        totalLoanAmount: totalLoanCollected,
        totalSavingsAmount: totalSavingsCollected,
        totalFeesAmount: 0,
        successfulLoanRepayments: results.successful.length,
        failedLoanRepayments: results.failed.length,
        successfulSavings: results.savingsProcessed.length,
        failedSavings: 0,
        repaymentSchedulesUpdated: results.repaymentSchedulesUpdated.length,
        totalProcessedAmount: totalLoanCollected + totalSavingsCollected
      };

      // Update collection status based on results
      if (results.successful.length > 0 || results.savingsProcessed.length > 0) {
        collectionDoc.status = results.failed.length === 0 ? 'processed' : 'partially_processed';
        collectionDoc.processedAt = new Date();
        collectionDoc.processedBy = collectedBy;
      }

      await collectionDoc.save({ session });

      // STEP 4: Update group loan with comprehensive collection summary
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
        savingsProcessed: results.savingsProcessed.length,
        totalLoanCollected: totalLoanCollected,
        totalSavingsCollected: totalSavingsCollected,
        repaymentSchedulesUpdated: results.repaymentSchedulesUpdated.length,
        paymentMethod: paymentMethod,
        transactionReference: transactionReference,
        collectionId: collectionDoc._id // Link to collection document
      });

      // Update group loan last collection date
      groupLoan.lastCollectionDate = new Date(collectionDate || new Date());

      await groupLoan.save({ session });

      console.log(`🎉 Collection processing completed`);
      console.log(`📊 Summary: ${results.successful.length} loan collections, ${results.savingsProcessed.length} savings collections`);
      console.log(`💰 Total Loan Collected: ₦${totalLoanCollected.toLocaleString()}`);
      console.log(`💰 Total Savings Collected: ₦${totalSavingsCollected.toLocaleString()}`);
      console.log(`📄 Collection Document: ${collectionDoc.collectionId}`);

      res.status(200).json({
        success: true,
        message: `Collections submitted successfully. ${results.successful.length} loan collections, ${results.savingsProcessed.length} savings collections processed.`,
        data: {
          summary: {
            totalLoanCollected: totalLoanCollected,
            totalSavingsCollected: totalSavingsCollected,
            successfulLoanCollections: results.successful.length,
            failedLoanCollections: results.failed.length,
            savingsCollections: results.savingsProcessed.length,
            repaymentSchedulesUpdated: results.repaymentSchedulesUpdated.length,
            groupName: groupLoan.groupName,
            groupId: groupLoan.loanId || groupLoan._id,
            collectionId: collectionDoc.collectionId
          },
          loanResults: results,
          savingsResults: results.savingsProcessed,
          collection: {
            id: collectionDoc._id,
            collectionId: collectionDoc.collectionId,
            status: collectionDoc.status,
            totalAmount: collectionDoc.amount,
            loanRepayments: collectionDoc.loanRepayments.length,
            savingsCollections: collectionDoc.savingsCollections.length
          }
        }
      });
    });

  } catch (error) {
    console.error('💥 Error submitting collections:', error);
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      message: 'Failed to submit collections',
      error: error.message
    });
  } finally {
    await session.endSession();
  }
});

// ==================== ENHANCED HELPER FUNCTIONS ====================

// Allocate payment between principal and interest for installment
function allocatePaymentToInstallment(paidAmount, currentInstallment, allInstallments) {
  const expectedPrincipal = safeNumber(currentInstallment.principal);
  const expectedInterest = safeNumber(currentInstallment.interest);
  const alreadyPaidPrincipal = safeNumber(currentInstallment.principalPaid);
  const alreadyPaidInterest = safeNumber(currentInstallment.interestPaid);
  
  const remainingPrincipal = Math.max(0, expectedPrincipal - alreadyPaidPrincipal);
  const remainingInterest = Math.max(0, expectedInterest - alreadyPaidInterest);
  const totalRemaining = remainingPrincipal + remainingInterest;

  let principalAllocation = 0;
  let interestAllocation = 0;

  if (paidAmount >= totalRemaining) {
    // Pay off remaining balance
    principalAllocation = remainingPrincipal;
    interestAllocation = remainingInterest;
  } else {
    // Partial payment - allocate proportionally
    const principalRatio = remainingPrincipal / totalRemaining;
    const interestRatio = remainingInterest / totalRemaining;
    
    principalAllocation = paidAmount * principalRatio;
    interestAllocation = paidAmount * interestRatio;
  }

  return {
    principal: Math.round(principalAllocation * 100) / 100,
    interest: Math.round(interestAllocation * 100) / 100
  };
}

// Get next installment after current one
function getNextInstallment(installments) {
  if (!Array.isArray(installments)) return null;
  
  const nextInstallment = installments.find(inst => 
    inst.status === 'PENDING' || inst.status === 'OVERDUE'
  );

  return nextInstallment ? {
    installmentNo: nextInstallment.installmentNo,
    dueDate: nextInstallment.dueDate,
    totalPayment: nextInstallment.totalPayment,
    principal: nextInstallment.principal,
    interest: nextInstallment.interest
  } : null;
}



// Update LoanAccountSummary
async function updateLoanAccountSummary(loanAccount, transaction, session) {
  try {
    const LoanAccountSummary = mongoose.model('LoanAccountSummary');
    let summary = await LoanAccountSummary.findOne({ ACCT_NO: loanAccount.ACCT_NO }).session(session);
    
    if (summary) {
      await LoanAccountSummary.updateFromTransaction(transaction);
    }
  } catch (error) {
    console.error('Error updating LoanAccountSummary:', error.message);
    // Don't fail the whole process if summary update fails
  }
}

// Process GroupSavings collection
async function processGroupSavingsCollection(groupSavings, saving, groupId, collectedBy, paymentMethod, transactionReference, collectionDate, session) {
  try {
    // Update GroupSavings balance
    const amount = safeNumber(saving.amount);
    await groupSavings.updateBalance(amount, 'AVAILABLE_BALANCE');
    
    // Create savings transaction
    const savingsTransaction = new Transaction({
      ACCT_NO: groupSavings.accountNumber,
      ACCT_ID: groupSavings._id.toString(),
      ACCT_NM: groupSavings.groupName,
      CUST_ID: groupSavings.groupCode, // Using groupCode as CUST_ID for groups
      TRANSACTION_TYPE: 'CREDIT',
      AMOUNT: amount,
      BU_ID: groupSavings.branch || 100,
      PAYMENT_METHOD: paymentMethod,
      TRANSACTION_REFERENCE: transactionReference || `GRP_SAV_${groupId}_${Date.now()}`,
      description: `Group savings collection - ${groupSavings.groupName}`,
      status: 'COMPLETED',
      createdBy: collectedBy || 'FIELD_AGENT',
      currency: 'NGN',
      metadata: {
        purpose: 'GROUP_SAVINGS_COLLECTION',
        groupId: groupId,
        groupName: groupSavings.groupName,
        savingsType: groupSavings.savingsType,
        collectionDate: collectionDate
      }
    });

    await savingsTransaction.save({ session });
    
    return savingsTransaction;
  } catch (error) {
    console.error('Error processing group savings collection:', error);
    throw error;
  }
}



// ==================== HELPER FUNCTIONS ====================

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


export const repayGroupLoan = asyncHandler(async (req, res) => {
  let groupLoanId = req.params.groupLoanId || req.params.id || req.body.groupLoanId;
  
  console.log('=== REPAYMENT REQUEST DETAILS ===');
  console.log('Extracted groupLoanId:', groupLoanId);

  if (!groupLoanId) {
    const urlParts = req.originalUrl.split('/');
    const possibleId = urlParts[urlParts.length - 2];
    if (possibleId && possibleId !== 'repayment') {
      groupLoanId = possibleId;
    }
  }

  if (!groupLoanId) {
    return res.status(400).json({
      success: false,
      message: 'Group loan ID is required.',
    });
  }

  const {
    totalRepayAmount,
    memberRepayments = [],
    isInstallment,
    paymentMethod = 'CASH',
    transactionReference,
    isLegacyLoan = false,
    repaymentType = 'PRO_RATA',
    paymentFrequency,
    collectedBy
  } = req.body;

  // Validate member repayments array
  if (!memberRepayments || memberRepayments.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Member repayments array is required.',
    });
  }

  // Enhanced group loan lookup
  let groupLoan = await GroupLoan.findOne({
    loanId: groupLoanId
  })
  .populate('group', 'members groupCode groupName')
  .populate('individualLoanAccounts')
  .populate('members.memberId');

  if (!groupLoan) {
    groupLoan = await GroupLoan.findOne({
      $or: [
        { groupCode: groupLoanId },
        { _id: groupLoanId }
      ]
    })
    .populate('group', 'members groupCode groupName')
    .populate('individualLoanAccounts')
    .populate('members.memberId');
  }

  if (!groupLoan) {
    return res.status(404).json({
      success: false,
      message: `Group loan not found for ID: ${groupLoanId}.`
    });
  }

  console.log(`✅ Found group loan: ${groupLoan.loanId}, Group Code: ${groupLoan.groupCode}`);

  // Status validation
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

  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    console.log('🔄 Starting transaction for group loan repayment...');

    // STEP 0: CREATE COLLECTION DOCUMENT
    const totalCollectionAmount = memberRepayments.reduce((sum, member) => 
      sum + (member.loanAmount || 0) + (member.savingsAmount || 0), 0
    );

    const collectionDoc = new Collection({
      groupId: groupLoan._id,
      groupLoanId: groupLoan._id,
      loanId: groupLoan.loanId,
      groupCode: groupLoan.groupCode,
      amount: totalCollectionAmount,
      currency: 'NGN',
      collectionDate: new Date(),
      branch: groupLoan.branch || 100,
      relationshipManager: groupLoan.primaryRelationshipManager || groupLoan.createdBy,
      channel: 6,
      createdBy: collectedBy || req.user?.id || 'system',
      paymentMethod: paymentMethod,
      transactionReference: transactionReference || `GRP_REPAY_${groupLoan.loanId}_${Date.now()}`,
      repaymentType: 'loan_repayment',
      status: 'pending'
    });

    await collectionDoc.save({ session });
    console.log(`📄 Collection document created: ${collectionDoc.collectionId}`);

    const paymentDate = new Date();
    const oldTotalRepaid = groupLoan.totalRepaid || 0;
    const repaidMembers = [];
    const repaymentDetails = [];

    // Process individual member repayments (your existing logic)
    await processIndividualMemberRepayments(
      groupLoan,
      memberRepayments,
      memberExpectedRepayments, // This should come from your calculation
      isInstallment,
      paymentDate,
      paymentMethod,
      transactionReference,
      req.user?.id || 'system',
      repaidMembers,
      repaymentDetails,
      session,
      expectedRepaymentDetails,
      repaymentType,
      paymentFrequency,
      accruedInterestDetails
    );

    // ADD LOAN REPAYMENTS TO COLLECTION DOCUMENT
    for (const repayment of repaymentDetails) {
      if (repayment.loanAccountId) {
        collectionDoc.loanRepayments.push({
          loanAccountId: repayment.loanAccountId,
          loanAccountNumber: repayment.accountNumber,
          customerId: repayment.customerId,
          customerName: repayment.customerName,
          principalAmount: repayment.principalAmount || 0,
          interestAmount: repayment.interestAmount || 0,
          penaltyAmount: repayment.penaltyAmount || 0,
          totalAmount: repayment.totalAmount || 0,
          installmentNumber: repayment.installmentNumber,
          repaymentDate: paymentDate,
          transactionReference: repayment.transactionReference,
          status: 'processed'
        });
      }
    }

    // ADD SAVINGS COLLECTIONS TO COLLECTION DOCUMENT
    for (const member of memberRepayments) {
      if (member.savingsAmount && member.savingsAmount > 0) {
        collectionDoc.savingsCollections.push({
          accountNumber: member.accountNumber || member.memberId,
          customerId: member.customerId,
          customerName: member.customerName,
          amount: member.savingsAmount,
          savingsType: 'INDIVIDUAL_SAVINGS',
          transactionReference: transactionReference,
          status: 'processed'
        });
      }
    }

    // UPDATE COLLECTION DOCUMENT STATUS
    const successfulRepayments = repaymentDetails.filter(rd => rd.success).length;
    collectionDoc.processingSummary = {
      totalLoanAmount: repaymentDetails.reduce((sum, rd) => sum + (rd.totalAmount || 0), 0),
      totalSavingsAmount: memberRepayments.reduce((sum, m) => sum + (m.savingsAmount || 0), 0),
      totalFeesAmount: 0,
      successfulLoanRepayments: successfulRepayments,
      failedLoanRepayments: repaymentDetails.length - successfulRepayments,
      successfulSavings: memberRepayments.filter(m => m.savingsAmount > 0).length,
      failedSavings: 0,
      repaymentSchedulesUpdated: successfulRepayments,
      totalProcessedAmount: totalCollectionAmount
    };

    collectionDoc.status = successfulRepayments > 0 ? 'processed' : 'partially_processed';
    collectionDoc.processedAt = new Date();
    collectionDoc.processedBy = collectedBy || req.user?.id || 'system';

    await collectionDoc.save({ session });

    // Update group loan (your existing logic continues...)
    const calculatedTotalRepayAmount = memberRepayments.reduce((sum, member) => 
      sum + (member.loanAmount || 0) + (member.savingsAmount || 0), 0
    );

    groupLoan.totalRepaid = (groupLoan.totalRepaid || 0) + calculatedTotalRepayAmount;
    
    // Handle repaidToMembers
    if (repaidMembers && repaidMembers.length > 0) {
      const repaidObjectIds = repaidMembers.map(id => {
        if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
          return new mongoose.Types.ObjectId(id);
        }
        return id;
      });
      
      const existingRepaid = groupLoan.repaidToMembers || [];
      const newRepaidSet = new Set([
        ...existingRepaid.map(id => id.toString()),
        ...repaidObjectIds.map(id => id.toString())
      ]);
      
      groupLoan.repaidToMembers = Array.from(newRepaidSet).map(id => 
        new mongoose.Types.ObjectId(id)
      );
    }
    
    if (isInstallment) {
      groupLoan.installmentsPaid = (groupLoan.installmentsPaid || 0) + 1;
      groupLoan.nextDueDate = calculateNextDueDate(paymentDate, paymentFrequency, groupLoan.lastRepaymentDate);
    }
    
    const totalRepayable = groupLoan.totalRepayable || (groupLoan.totalAmount + (groupLoan.totalInterest || 0));
    
    if (groupLoan.totalRepaid >= totalRepayable) {
      groupLoan.status = isLegacyLoan ? 'repaid_legacy' : 'repaid';
      groupLoan.repaidAt = paymentDate;
      groupLoan.remainingBalance = 0;
    } else {
      groupLoan.remainingBalance = totalRepayable - groupLoan.totalRepaid;
    }
    
    groupLoan.lastRepaymentDate = paymentDate;
    
    if (isLegacyLoan && !groupLoan.migrationCompleted) {
      groupLoan.migrationCompleted = true;
      groupLoan.lastMigratedAt = paymentDate;
    }
    
    await groupLoan.save({ session });

    // Commit transaction
    await session.commitTransaction();
    console.log('✅ Transaction committed successfully');

    res.status(200).json({
      success: true,
      message: `Group loan repayment processed successfully for ${repaidMembers.length} members.`,
      data: {
        groupLoan: {
          _id: groupLoan._id,
          loanId: groupLoan.loanId,
          groupCode: groupLoan.groupCode,
          groupName: groupLoan.groupName,
          status: groupLoan.status,
          totalRepaid: groupLoan.totalRepaid,
          remainingBalance: groupLoan.remainingBalance,
          installmentsPaid: groupLoan.installmentsPaid
        },
        repaymentSummary: {
          totalAmount: calculatedTotalRepayAmount,
          totalLoanAmount: memberRepayments.reduce((sum, m) => sum + (m.loanAmount || 0), 0),
          totalSavingsAmount: memberRepayments.reduce((sum, m) => sum + (m.savingsAmount || 0), 0),
          membersRepaid: repaidMembers.length,
          paymentDate,
          paymentMethod
        },
        collection: {
          id: collectionDoc._id,
          collectionId: collectionDoc.collectionId,
          status: collectionDoc.status,
          totalAmount: collectionDoc.amount,
          loanRepayments: collectionDoc.loanRepayments.length,
          savingsCollections: collectionDoc.savingsCollections.length
        },
        memberDetails: repaymentDetails
      },
    });

  } catch (error) {
    console.error('💥 Error processing group loan repayment:', error);
    
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
   
    res.status(500).json({
      success: false,
      message: 'Failed to process group loan repayment.',
      error: error.message
    });
  } finally {
    await session.endSession();
  }
});

// Enhanced validation function with dynamic principal/interest checks
const validateIndividualMemberRepayments = (memberRepayments, memberExpectedRepayments, groupLoan, expectedRepaymentDetails, paymentFrequency, repaymentType) => {
  let totalLoanAmount = 0;
  let totalSavingsAmount = 0;

  for (const memberRepayment of memberRepayments) {
    const memberExpected = memberExpectedRepayments.find(m => 
      m.memberId === memberRepayment.memberId || 
      m.accountNumber === memberRepayment.accountNumber
    );

    if (!memberExpected) {
      return {
        valid: false,
        message: `Member not found in group: ${memberRepayment.memberId || memberRepayment.accountNumber}`
      };
    }

    // Validate that principal + interest equals loan amount
    const calculatedTotal = (memberRepayment.principal || 0) + (memberRepayment.interest || 0);
    if (Math.abs(calculatedTotal - (memberRepayment.loanAmount || 0)) > 0.01) {
      return {
        valid: false,
        message: `Principal (${memberRepayment.principal}) + Interest (${memberRepayment.interest}) = ${calculatedTotal} doesn't match loan amount ${memberRepayment.loanAmount} for member ${memberExpected.memberName}`
      };
    }

    // Check if principal repayment is reasonable - use dynamic values from memberExpected
    const maxReasonablePrincipal = memberExpected.originalPrincipal || 
                                  memberExpected.loanAmount || 
                                  memberExpected.outstandingPrincipal || 
                                  (memberExpected.outstandingPrincipal + memberExpected.outstandingInterest);
    
    if (memberRepayment.principal > maxReasonablePrincipal) {
      return {
        valid: false,
        message: `Principal repayment ${memberRepayment.principal} exceeds reasonable amount ${maxReasonablePrincipal} for member ${memberExpected.memberName}`
      };
    }

    // Validate loan amount doesn't exceed outstanding principal + interest
    const maxLoanRepayment = (memberExpected.outstandingPrincipal || 0) + (memberExpected.outstandingInterest || 0);
    if (memberRepayment.loanAmount > maxLoanRepayment) {
      return {
        valid: false,
        message: `Loan repayment amount ${memberRepayment.loanAmount} exceeds maximum allowed ${maxLoanRepayment} for member ${memberExpected.memberName}`
      };
    }

    totalLoanAmount += memberRepayment.loanAmount || 0;
    totalSavingsAmount += memberRepayment.savingsAmount || 0;
  }

  // Validate installment amounts if this is an installment payment
  if (expectedRepaymentDetails && expectedRepaymentDetails.installmentAmount) {
    const tolerance = 0.01; // Allow small rounding differences
    const totalExpected = memberExpectedRepayments.reduce((sum, m) => sum + (m.expectedAmount || 0), 0);
    
    if (Math.abs(totalLoanAmount - totalExpected) > tolerance) {
      return {
        valid: false,
        message: `Total loan repayment amount ${totalLoanAmount} does not match expected ${paymentFrequency.toLowerCase()} installment amount ${totalExpected}`
      };
    }
  }

  return { valid: true };
};

// Allocate repayment amount between principal and interest
const allocateRepaymentAmount = (repaymentAmount, outstandingInterest, outstandingPrincipal, repaymentType) => {
  let principal = 0;
  let interest = 0;

  switch (repaymentType) {
    case 'INTEREST_FIRST':
      // Pay interest first, then principal
      interest = Math.min(repaymentAmount, outstandingInterest);
      principal = Math.max(0, repaymentAmount - interest);
      break;
    
    case 'PRINCIPAL_FIRST':
      // Pay principal first, then interest
      principal = Math.min(repaymentAmount, outstandingPrincipal);
      interest = Math.max(0, repaymentAmount - principal);
      break;
    
    case 'PRO_RATA':
    default:
      // Pay proportionally
      const totalOutstanding = outstandingPrincipal + outstandingInterest;
      if (totalOutstanding > 0) {
        principal = (outstandingPrincipal / totalOutstanding) * repaymentAmount;
        interest = (outstandingInterest / totalOutstanding) * repaymentAmount;
        
        // Round to 2 decimal places
        principal = Math.round(principal * 100) / 100;
        interest = Math.round(interest * 100) / 100;
        
        // Handle rounding differences
        const totalAllocated = principal + interest;
        if (totalAllocated < repaymentAmount) {
          interest += (repaymentAmount - totalAllocated);
        }
      }
      break;
  }

  // Ensure we don't exceed outstanding amounts
  principal = Math.min(principal, outstandingPrincipal);
  interest = Math.min(interest, outstandingInterest);

  return { principal, interest };
};

// Process member savings payment
const processMemberSavingsPayment = async (
  memberExpected,
  savingsAmount,
  paymentDate,
  paymentMethod,
  transactionReference,
  userId,
  session
) => {
  // Find savings account
  const savingsAccount = await SavingsAccount.findOne({
    ACCT_NO: memberExpected.savingsAccountNo
  }).session(session);

  if (savingsAccount) {
    // Update savings account balance
    savingsAccount.CURRENT_BALANCE = (savingsAccount.CURRENT_BALANCE || 0) + savingsAmount;
    await savingsAccount.save({ session });

    // Create savings transaction
    const savingsTransaction = new SavingsTransaction({
      ACCT_ID: savingsAccount._id,
      ACCT_NO: savingsAccount.ACCT_NO,
      CUST_ID: savingsAccount.CUST_ID,
      TRANSACTION_DATE: paymentDate,
      TRANSACTION_TYPE: 'DEPOSIT',
      AMOUNT: savingsAmount,
      PAYMENT_METHOD: paymentMethod,
      TRANSACTION_REFERENCE: transactionReference,
      CREATED_BY: userId,
      STATUS: 'COMPLETED',
      DESCRIPTION: 'Group loan savings collection'
    });

    await savingsTransaction.save({ session });

    console.log(`💰 Savings account ${savingsAccount.ACCT_NO} updated: +${savingsAmount}`);
  } else {
    console.log(`⚠️ Savings account not found: ${memberExpected.savingsAccountNo}`);
  }
};


// Updated processMemberLoanRepayment with proper error handling and debugging
const processMemberLoanRepayment = async (
  loanAccount,
  loanAmount,
  principalAmount,
  interestAmount,
  paymentDate,
  paymentMethod,
  transactionReference,
  userId,
  session,
  repaymentType,
  isInstallment
) => {
  try {
    console.log(`🔧 Starting loan repayment processing for account: ${loanAccount?.ACCT_NO}`);
    console.log(`   Loan Amount: ${loanAmount}, Principal: ${principalAmount}, Interest: ${interestAmount}`);
    console.log(`   Loan Account ID: ${loanAccount?._id}`);

    // Get current loan summary
    let loanSummary = await LoanAccountSummary.findOne({
      ACCT_ID: loanAccount._id
    }).session(session);

    console.log(`📊 Found existing loan summary: ${!!loanSummary}`);

    if (!loanSummary) {
      console.log(`🆕 Creating new loan summary...`);
      
      // Safely parse values with proper null checks
      const initialPrincipal = parseFloat(
        (loanAccount?.LOAN_AMOUNT?.toString() || 
         loanAccount?.ACTUAL_DISBURSEMENT?.toString() || 
         '0').replace(/[^0-9.-]/g, '')
      ) || 0;

      const initialInterest = parseFloat(
        (loanAccount?.remainingInterestAmount?.toString() || 
         loanAccount?.TOTAL_INTEREST?.toString() || 
         '0').replace(/[^0-9.-]/g, '')
      ) || 0;
      
      // Calculate required fields for LoanAccountSummary
      const startDate = loanAccount?.START_DT || loanAccount?.DISBURSED_DT || new Date();
      const maturityDate = loanAccount?.MATURITY_DT || calculateMaturityDate(loanAccount, startDate);
      const nextPaymentDate = calculateNextPaymentDate(loanAccount, startDate);
      const totalInstallments = calculateTotalInstallments(loanAccount);
      const installmentAmount = calculateInstallmentAmount(loanAccount, initialPrincipal, totalInstallments);

      // Validate all required fields are present
      if (!loanAccount.ACCT_NO) {
        throw new Error('ACCT_NO is required for loan account');
      }
      if (!loanAccount.CUST_ID) {
        throw new Error('CUST_ID is required for loan account');
      }
      if (!userId) {
        throw new Error('userId is required for CREATED_BY field');
      }

      loanSummary = new LoanAccountSummary({
        // Required fields from the schema
        ACCT_ID: loanAccount._id,
        ACCT_NO: loanAccount.ACCT_NO,
        CUST_ID: loanAccount.CUST_ID,
        ORIGINAL_PRINCIPAL: initialPrincipal,
        OUTSTANDING_PRINCIPAL: initialPrincipal,
        INSTALLMENT_AMOUNT: installmentAmount,
        TOTAL_INSTALLMENTS: totalInstallments,
        NEXT_PAYMENT_DT: nextPaymentDate,
        MATURITY_DT: maturityDate,
        START_DT: startDate,
        CREATED_BY: userId,
        
        // Optional fields with defaults
        TOTAL_INTEREST: initialInterest,
        TOTAL_REPAYMENT: 0,
        PAID_INSTALLMENTS: 0,
        PAYMENT_FREQUENCY: loanAccount?.PAYMENT_FREQUENCY || 'MONTHLY',
        LOAN_STATUS: loanAccount?.LOAN_STATUS || 'ACTIVE',
        REC_ST: 'A',
        PAID_INTEREST: 0,
        LAST_PAYMENT_DT: null,
        LAST_PAYMENT_AMOUNT: 0,
        DELINQUENT_DAYS: 0,
        CLEARED_BAL: 0,
        CUR_PAYOFF: 0
      });

      console.log(`✅ New loan summary created successfully`);
    }

    console.log(`📊 Current loan summary for ${loanAccount.ACCT_NO}:`);
    console.log(`   Outstanding Principal: ${loanSummary.OUTSTANDING_PRINCIPAL}`);
    console.log(`   Total Interest: ${loanSummary.TOTAL_INTEREST}`);
    console.log(`   Paid Interest: ${loanSummary.PAID_INTEREST}`);
    console.log(`   Total Repayment: ${loanSummary.TOTAL_REPAYMENT}`);

    // Safely handle all numeric values with defaults
    const safePrincipalAmount = principalAmount || 0;
    const safeInterestAmount = interestAmount || 0;
    const safeLoanAmount = loanAmount || 0;
    const safeOutstandingPrincipal = loanSummary.OUTSTANDING_PRINCIPAL || 0;
    const safeTotalInterest = loanSummary.TOTAL_INTEREST || 0;
    const safePaidInterest = loanSummary.PAID_INTEREST || 0;

    // Validate that principal + interest equals total loan amount
    const calculatedTotal = safePrincipalAmount + safeInterestAmount;
    if (Math.abs(calculatedTotal - safeLoanAmount) > 0.01) {
      console.warn(`⚠️ Principal (${safePrincipalAmount}) + Interest (${safeInterestAmount}) = ${calculatedTotal} doesn't match loan amount ${safeLoanAmount}. Using provided allocation.`);
    }

    // Handle case where outstanding principal is zero but we're trying to pay principal
    let adjustedPrincipalAmount = safePrincipalAmount;
    let adjustedInterestAmount = safeInterestAmount;

    if (safePrincipalAmount > 0 && safeOutstandingPrincipal === 0) {
      console.warn(`⚠️ Principal repayment requested but outstanding principal is 0. Reallocating to interest.`);
      adjustedInterestAmount += adjustedPrincipalAmount;
      adjustedPrincipalAmount = 0;
    }

    // Validate we don't overpay - with adjusted amounts
    if (adjustedPrincipalAmount > safeOutstandingPrincipal) {
      const excessPrincipal = adjustedPrincipalAmount - safeOutstandingPrincipal;
      console.warn(`⚠️ Principal repayment ${adjustedPrincipalAmount} exceeds outstanding principal ${safeOutstandingPrincipal}. Moving ${excessPrincipal} to interest.`);
      adjustedInterestAmount += excessPrincipal;
      adjustedPrincipalAmount = safeOutstandingPrincipal;
    }

    // Calculate available interest (total interest minus paid interest)
    const availableInterest = safeTotalInterest - safePaidInterest;
    if (adjustedInterestAmount > availableInterest) {
      console.warn(`⚠️ Interest repayment ${adjustedInterestAmount} exceeds available interest ${availableInterest}. Capping at ${availableInterest}.`);
      adjustedInterestAmount = availableInterest;
    }

    // Final validation - ensure we're not trying to pay more than available
    const totalPayment = adjustedPrincipalAmount + adjustedInterestAmount;
    const maxAvailable = safeOutstandingPrincipal + availableInterest;
    
    if (totalPayment > maxAvailable) {
      throw new Error(`Total payment ${totalPayment} exceeds maximum available ${maxAvailable}. Please adjust payment amounts.`);
    }

    // Update loan summary with safe values
    loanSummary.TOTAL_REPAYMENT = (loanSummary.TOTAL_REPAYMENT || 0) + totalPayment;
    loanSummary.OUTSTANDING_PRINCIPAL = safeOutstandingPrincipal - adjustedPrincipalAmount;
    loanSummary.PAID_INTEREST = safePaidInterest + adjustedInterestAmount;
    loanSummary.LAST_PAYMENT_DT = paymentDate;
    loanSummary.LAST_PAYMENT_AMOUNT = totalPayment;
    
    // Increment paid installments if this is an installment payment
    if (isInstallment) {
      loanSummary.PAID_INSTALLMENTS = (loanSummary.PAID_INSTALLMENTS || 0) + 1;
    }

    // Update next due date for installments
    if (isInstallment) {
      loanSummary.NEXT_PAYMENT_DT = calculateNextPaymentDate(loanAccount, paymentDate);
    }

    // Update loan status if fully paid
    if (loanSummary.OUTSTANDING_PRINCIPAL <= 0 && availableInterest <= 0) {
      loanSummary.LOAN_STATUS = 'CLOSED';
    }

    // Update last customer activity date
    loanSummary.LAST_CUST_ACTIVITY_DT = new Date();

    console.log(`💾 Saving loan summary updates...`);
    await loanSummary.save({ session });
    console.log(`✅ Loan summary saved successfully`);

    // Create repayment transaction record - CORRECTED FIELD NAMES
    console.log(`📝 Creating repayment transaction...`);
    
    // Validate required fields for LoanRepaymentTransaction
    if (!transactionReference) {
      throw new Error('TRANSACTION_REFERENCE is required for LoanRepaymentTransaction');
    }
    if (!userId) {
      throw new Error('userId (CREATED_BY) is required for LoanRepaymentTransaction');
    }

    const repaymentTransaction = new LoanRepaymentTransaction({
      // Required fields for LoanRepaymentTransaction schema
      ACCT_ID: loanAccount._id, // Required: ObjectId reference to LoanAccount
      ACCT_NO: loanAccount.ACCT_NO, // Required: String
      CUST_ID: loanAccount.CUST_ID, // Required: String
      TRANSACTION_DATE: paymentDate, // Required: Date
      TRANSACTION_TYPE: 'REPAYMENT', // Required: String with enum
      AMOUNT: totalPayment, // Required: Number
      PRINCIPAL_AMOUNT: adjustedPrincipalAmount, // Required: Number
      INTEREST_AMOUNT: adjustedInterestAmount, // Required: Number
      PAYMENT_METHOD: paymentMethod, // Required: String with enum
      TRANSACTION_REFERENCE: transactionReference, // Required: String
      REPAYMENT_TYPE: repaymentType, // Optional: String with enum
      IS_INSTALLMENT: isInstallment, // Optional: Boolean
      CREATED_BY: userId, // Required: String
      STATUS: 'COMPLETED', // Optional: String with enum
      RECEIPT_NO: transactionReference // Optional: String
    });

    console.log(`💾 Saving repayment transaction with reference: ${transactionReference}`);
    await repaymentTransaction.save({ session });
    console.log(`✅ Repayment transaction saved successfully`);

    console.log(`📊 Loan account ${loanAccount.ACCT_NO} updated:`);
    console.log(`   Principal repaid: ${adjustedPrincipalAmount}`);
    console.log(`   Interest repaid: ${adjustedInterestAmount}`);
    console.log(`   Total payment: ${totalPayment}`);
    console.log(`   New outstanding principal: ${loanSummary.OUTSTANDING_PRINCIPAL}`);
    console.log(`   New paid interest: ${loanSummary.PAID_INTEREST}`);
    console.log(`   New total repayment: ${loanSummary.TOTAL_REPAYMENT}`);

  } catch (error) {
    console.error(`💥 ERROR in processMemberLoanRepayment for account ${loanAccount?.ACCT_NO}:`, error);
    throw error;
  }
};

// Helper function to calculate next payment date
const calculateNextPaymentDate = (loanAccount, fromDate) => {
  const nextDate = new Date(fromDate);
  const paymentFrequency = loanAccount?.PAYMENT_FREQUENCY || 'MONTHLY';

  switch (paymentFrequency.toUpperCase()) {
    case 'DAILY':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'WEEKLY':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'BI-WEEKLY':
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'QUARTERLY':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    default:
      nextDate.setMonth(nextDate.getMonth() + 1);
  }
  
  return nextDate;
};

// Helper function to calculate maturity date
const calculateMaturityDate = (loanAccount, startDate) => {
  const maturityDate = new Date(startDate);
  const termValue = loanAccount?.TERM_VALUE || 12;
  const termCode = loanAccount?.TERM_CD || 'M';

  switch (termCode.toUpperCase()) {
    case 'D': // Daily
      maturityDate.setDate(maturityDate.getDate() + termValue);
      break;
    case 'W': // Weekly
      maturityDate.setDate(maturityDate.getDate() + (termValue * 7));
      break;
    case 'M': // Monthly
      maturityDate.setMonth(maturityDate.getMonth() + termValue);
      break;
    case 'Y': // Yearly
      maturityDate.setFullYear(maturityDate.getFullYear() + termValue);
      break;
    default:
      maturityDate.setMonth(maturityDate.getMonth() + 12);
  }
  
  return maturityDate;
};

// Helper function to calculate total installments
const calculateTotalInstallments = (loanAccount) => {
  const termValue = loanAccount?.TERM_VALUE || 12;
  const termCode = loanAccount?.TERM_CD || 'M';
  const paymentFrequency = loanAccount?.PAYMENT_FREQUENCY || 'MONTHLY';

  let totalMonths = termValue;
  if (termCode.toUpperCase() === 'W') {
    totalMonths = Math.ceil(termValue * 7 / 30); // Convert weeks to approximate months
  } else if (termCode.toUpperCase() === 'Y') {
    totalMonths = termValue * 12;
  }

  switch (paymentFrequency.toUpperCase()) {
    case 'DAILY':
      return totalMonths * 30; // Approximate
    case 'WEEKLY':
      return Math.ceil(totalMonths * 4.33);
    case 'BI-WEEKLY':
      return Math.ceil(totalMonths * 2.17);
    case 'MONTHLY':
      return totalMonths;
    case 'QUARTERLY':
      return Math.ceil(totalMonths / 3);
    default:
      return totalMonths;
  }
};

// Helper function to calculate installment amount
const calculateInstallmentAmount = (loanAccount, principal, totalInstallments) => {
  // If loan account has installment amount, use it
  if (loanAccount?.installmentAmount) {
    return loanAccount.installmentAmount;
  }
  
  // Calculate based on principal and installments
  if (totalInstallments > 0) {
    return principal / totalInstallments;
  }
  
  // Default to 5% of principal
  return principal * 0.05;
};




// In processIndividualMemberRepayments function, update the repayment tracking:
const processIndividualMemberRepayments = async (
  groupLoan,
  memberRepayments,
  memberExpectedRepayments,
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
  paymentFrequency,
  accruedInterestDetails
) => {
  for (const memberRepayment of memberRepayments) {
    const memberExpected = memberExpectedRepayments.find(m => 
      m.memberId === memberRepayment.memberId || 
      m.accountNumber === memberRepayment.accountNumber
    );

    if (!memberExpected) {
      throw new Error(`Member not found: ${memberRepayment.memberId || memberRepayment.accountNumber}`);
    }

    const memberId = memberExpected.memberId;
    const loanAccountNo = memberExpected.accountNumber;
    
    console.log(`💳 Processing repayment for member: ${memberExpected.memberName}`);
    console.log(`   Loan Amount: ${memberRepayment.loanAmount || 0}`);
    console.log(`   Savings Amount: ${memberRepayment.savingsAmount || 0}`);
    console.log(`   Account: ${loanAccountNo}`);
    console.log(`   Member ID: ${memberId}`);

    // Find the individual loan account
    let loanAccount = await LoanAccount.findOne({ 
      ACCT_NO: loanAccountNo,
      CUST_ID: memberId
    }).session(session);

    if (!loanAccount) {
      // If not found with ACCT_NO, try with APPL_ID or other identifiers
      loanAccount = await LoanAccount.findOne({
        $or: [
          { ACCT_NO: loanAccountNo },
          { APPL_ID: memberExpected.applicationId },
          { CUST_ID: memberId }
        ]
      }).session(session);
    }

    if (!loanAccount) {
      console.error(`Loan account search details:`);
      console.error(`- ACCT_NO: ${loanAccountNo}`);
      console.error(`- CUST_ID: ${memberId}`);
      console.error(`- APPL_ID: ${memberExpected.applicationId}`);
      throw new Error(`Loan account not found for member ${memberExpected.memberName}. Searched with ACCT_NO: ${loanAccountNo}, CUST_ID: ${memberId}`);
    }

    console.log(`✅ Found loan account: ${loanAccount.ACCT_NO} for ${memberExpected.memberName}`);

    // Process loan repayment using the provided principal and interest amounts
    if (memberRepayment.loanAmount > 0) {
      await processMemberLoanRepayment(
        loanAccount,
        memberRepayment.loanAmount,
        memberRepayment.principal, // Use provided principal amount
        memberRepayment.interest,  // Use provided interest amount
        paymentDate,
        paymentMethod,
        transactionReference,
        userId,
        session,
        repaymentType,
        isInstallment
      );
    }

    // Process savings payment (if any)
    if (memberRepayment.savingsAmount > 0) {
      await processMemberSavingsPayment(
        memberExpected,
        memberRepayment.savingsAmount,
        paymentDate,
        paymentMethod,
        transactionReference,
        userId,
        session
      );
    }

    // FIXED: Update repayment tracking - push LoanAccount ObjectId instead of memberId string
    // Push the loanAccount._id (ObjectId) to repaidToMembers array
    if (!repaidMembers.includes(loanAccount._id.toString())) {
      repaidMembers.push(loanAccount._id.toString());
    }

    repaymentDetails.push({
      memberId,
      memberName: memberExpected.memberName,
      accountNumber: loanAccountNo,
      loanAccountId: loanAccount._id, // Include the ObjectId for reference
      loanAmount: memberRepayment.loanAmount || 0,
      savingsAmount: memberRepayment.savingsAmount || 0,
      principal: memberRepayment.principal || 0,
      interest: memberRepayment.interest || 0,
      totalAmount: (memberRepayment.loanAmount || 0) + (memberRepayment.savingsAmount || 0),
      paymentDate,
      paymentMethod,
      transactionReference,
      receiptNo: memberRepayment.receiptNo,
      isInstallment,
      repaymentType
    });

    console.log(`✅ Successfully processed repayment for ${memberExpected.memberName}`);
  }
};


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

// Get group loan by ID - Updated with BU_ID filtering
export const getGroupLoan = asyncHandler(async (req, res) => {
  const { groupLoanId } = req.params;
  
  // Get user's BU_ID from request - FIXED: Use user.BU_ID || user.branch
  const userBUId = req.user?.BU_ID || req.user?.branch;
  
  if (!userBUId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. User BU_ID or branch not found.'
    });
  }

  // Build base query with BU_ID filtering
  const baseQuery = { _id: groupLoanId };
  
  // Add BU_ID filter to ensure users only see loans from their business unit
  baseQuery.$or = [
    { BU_ID: userBUId },
    { branch: safeNumber(userBUId) }
  ];

  let groupLoan = await GroupLoan.findOne(baseQuery)
    .populate('group', 'groupName groupCode members branch relationshipManager')
    .populate('primaryRelationshipManager', 'name email employeeId BU_ID branch')
    .populate('secondaryRelationshipManager', 'name email employeeId BU_ID branch')
    .populate('createdBy', 'name email employeeId BU_ID branch')
    .populate('groupSavings', 'accountNumber currentBalance savingsType BU_ID branch')
    .populate({
      path: 'individualLoanAccounts',
      select: 'ACCT_NO ACCT_NM CUST_ID LOAN_STATUS DISBURSEMENT_LIMIT ACTUAL_DISBURSEMENT TOTAL_INTEREST TOTAL_REPAYMENT repaidAmount OUTSTANDING_PRINCIPAL installmentAmount numPeriods installmentsPaid disbursedAt START_DT MATURITY_DT BU_ID branch',
      // Filter individual loan accounts by BU_ID
      match: { 
        $or: [
          { BU_ID: userBUId },
          { branch: safeNumber(userBUId) }
        ]
      }
    })
    .populate({
      path: 'disbursedToMembers',
      select: 'ACCT_NO ACCT_NM CUST_ID BU_ID branch',
      match: { 
        $or: [
          { BU_ID: userBUId },
          { branch: safeNumber(userBUId) }
        ]
      }
    })
    .populate({
      path: 'repaidToMembers',
      select: 'ACCT_NO ACCT_NM CUST_ID BU_ID branch',
      match: { 
        $or: [
          { BU_ID: userBUId },
          { branch: safeNumber(userBUId) }
        ]
      }
    });

  if (!groupLoan) {
    // Check if group loan exists but user doesn't have access
    const existsWithoutAccess = await GroupLoan.findById(groupLoanId);
    if (existsWithoutAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to view this group loan from your business unit.',
        userBUId: userBUId,
        requiredBUId: existsWithoutAccess.BU_ID || existsWithoutAccess.branch
      });
    }
    
    return res.status(404).json({
      success: false,
      message: 'Group loan not found.',
    });
  }

  // Convert to object for manipulation
  groupLoan = groupLoan.toObject();
  
  // Add BU context information
  groupLoan.userContext = {
    userBUId: userBUId,
    userBranch: req.user?.branch,
    hasAccess: true,
    accessedAt: new Date()
  };

  // Calculate additional financial metrics
  groupLoan.remainingBalance = Math.max(0, (groupLoan.totalRepayable || 0) - (groupLoan.totalRepaid || 0));
  groupLoan.repaymentProgress = groupLoan.totalRepayable ?
    ((groupLoan.totalRepaid || 0) / groupLoan.totalRepayable) * 100 : 0;

  // Get detailed member information
  if (groupLoan.group && groupLoan.group.members) {
    const memberDetails = await Customer.find(
      { 
        CUST_ID: { $in: groupLoan.group.members }
      },
      'CUST_ID FIRST_NAME LAST_NAME phone_number email address BU_ID branch'
    );
    
    // Map member details with their loan accounts (only those accessible by user's BU)
    groupLoan.memberDetails = memberDetails.map(member => {
      const loanAccount = groupLoan.individualLoanAccounts.find(
        acc => acc.CUST_ID === member.CUST_ID
      );
      return {
        ...member.toObject(),
        loanAccount: loanAccount || null,
        hasLoanAccess: !!loanAccount // Indicates if user can see this member's loan
      };
    });
  }

  // Filter out any null individual loan accounts (due to BU filtering)
  groupLoan.individualLoanAccounts = groupLoan.individualLoanAccounts?.filter(acc => acc !== null) || [];
  groupLoan.disbursedToMembers = groupLoan.disbursedToMembers?.filter(member => member !== null) || [];
  groupLoan.repaidToMembers = groupLoan.repaidToMembers?.filter(member => member !== null) || [];

  // Calculate summary statistics based on accessible data only
  const accessibleLoanAccounts = groupLoan.individualLoanAccounts || [];
  
  groupLoan.summary = {
    totalMembers: groupLoan.memberCount,
    accessibleMembers: groupLoan.memberDetails?.length || 0,
    totalLoans: accessibleLoanAccounts.length,
    activeLoans: accessibleLoanAccounts.filter(acc => acc.LOAN_STATUS === 'ACTIVE').length,
    repaidLoans: accessibleLoanAccounts.filter(acc => acc.LOAN_STATUS === 'REPAID').length,
    pendingLoans: accessibleLoanAccounts.filter(acc => acc.LOAN_STATUS === 'PENDING').length,
    totalDisbursed: accessibleLoanAccounts.reduce((sum, acc) => sum + safeNumber(acc.ACTUAL_DISBURSEMENT), 0),
    totalRepaid: accessibleLoanAccounts.reduce((sum, acc) => sum + safeNumber(acc.repaidAmount), 0),
    totalOutstanding: accessibleLoanAccounts.reduce((sum, acc) => sum + safeNumber(acc.OUTSTANDING_PRINCIPAL), 0),
    buContext: {
      userBUId: userBUId,
      userBranch: req.user?.branch,
      filteredResults: accessibleLoanAccounts.length,
      accessLevel: 'BU_RESTRICTED'
    }
  };

  // Add BU-wise breakdown if multiple BUs are involved
  if (groupLoan.individualLoanAccounts.length > 0) {
    const buBreakdown = {};
    groupLoan.individualLoanAccounts.forEach(acc => {
      const buId = acc.BU_ID || acc.branch || 'UNKNOWN';
      if (!buBreakdown[buId]) {
        buBreakdown[buId] = {
          count: 0,
          totalDisbursed: 0,
          totalRepaid: 0,
          totalOutstanding: 0
        };
      }
      buBreakdown[buId].count++;
      buBreakdown[buId].totalDisbursed += safeNumber(acc.ACTUAL_DISBURSEMENT);
      buBreakdown[buId].totalRepaid += safeNumber(acc.repaidAmount);
      buBreakdown[buId].totalOutstanding += safeNumber(acc.OUTSTANDING_PRINCIPAL);
    });
    
    groupLoan.summary.buBreakdown = buBreakdown;
  }

  // Add branch information to response
  groupLoan.branchInfo = {
    userBranch: req.user?.branch,
    loanBranch: groupLoan.branch,
    branchMatch: safeNumber(groupLoan.branch) === safeNumber(req.user?.branch)
  };

  logger.info(`Group loan fetched: ${groupLoanId} by user ${req.user.id} from BU: ${userBUId}, Branch: ${req.user?.branch}`);

  res.status(200).json({
    success: true,
    message: `Group loan details retrieved (showing data from your business unit: ${userBUId})`,
    data: groupLoan,
    accessInfo: {
      userBUId: userBUId,
      userBranch: req.user?.branch,
      filteredAccounts: groupLoan.individualLoanAccounts.length,
      totalPossibleAccounts: groupLoan.memberCount,
      branchAccess: groupLoan.branchInfo.branchMatch ? 'SAME_BRANCH' : 'DIFFERENT_BRANCH'
    }
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



/**
 * @desc Get comprehensive repayment collection sheet for a group loan
 * @route GET /api/collections/group-repayment/:groupId
 * @access Public
 */
/**
 * @desc Get comprehensive repayment collection sheet for a group loan
 * @route GET /api/collections/group-repayment/:groupId
 * @access Public
 */
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
      if (summary.ACCT_ID) {
        summaryMap.set(summary.ACCT_ID.toString(), summary);
      }
    });

    // FIXED: Use CustomerAccount instead of SavingsAccount
    // Get savings accounts for group members - FIXED: Handle undefined CUST_ID
    const customerIds = loanAccounts
      .map(acc => acc.CUST_ID?._id || acc.CUST_ID)
      .filter(id => id != null); // Remove null/undefined values

    console.log(`📊 Found ${customerIds.length} customer IDs`);

    let savingsAccounts = [];
    let savingsMap = new Map();
    
    if (customerIds.length > 0) {
      savingsAccounts = await CustomerAccount.find({
        CUST_ID: { $in: customerIds },
        $or: [
          { STATUS: 'ACTIVE' },
          { REC_ST: 'A' },
          { status: 'ACTIVE' },
          { status: 'active' }
        ]
      }).select('ACCT_NO CUST_ID AVAILABLE_BALANCE ledger_balance ACCT_NM account_name PRODUCT_TYPE account_number');

      savingsAccounts.forEach(account => {
        if (account.CUST_ID) {
          savingsMap.set(account.CUST_ID.toString(), account);
        }
      });
    }

    // Calculate expected repayment details for the group
    const paymentFrequency = groupLoan.paymentFrequency || 'MONTHLY';
    const expectedRepaymentDetails = calculateExpectedRepayment(groupLoan, paymentFrequency);
    const accruedInterestDetails = calculateAccruedInterest(groupLoan, expectedRepaymentDetails);
    const memberExpectedRepayments = calculateMemberExpectedRepayments(
      groupLoan, 
      expectedRepaymentDetails, 
      accruedInterestDetails
    );

    // Build repayment collection sheet with enhanced member details
    const collectionSheet = {
      groupInfo: {
        groupId: groupLoan.loanId,
        groupName: groupLoan.groupName,
        groupCode: groupLoan.groupCode,
        status: groupLoan.status,
        totalMembers: groupLoan.members?.length || 0,
        totalLoanAmount: groupLoan.totalAmount || 0,
        individualShare: groupLoan.individualShare || 0,
        paymentFrequency: paymentFrequency,
        installmentAmount: groupLoan.installmentAmount || 0,
        interestRate: groupLoan.interestRate || 0,
        disbursementDate: groupLoan.disbursedAt,
        maturityDate: calculateGroupMaturityDate(groupLoan),
        totalDisbursed: groupLoan.totalDisbursed || groupLoan.totalAmount || 0,
        totalRepaid: groupLoan.totalRepaid || 0,
        remainingBalance: groupLoan.remainingBalance || 0
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
        nextCollectionDate: null,
        expectedTotalRepayment: expectedRepaymentDetails.totalRepayment,
        expectedInstallment: expectedRepaymentDetails.installmentAmount,
        accruedInterest: accruedInterestDetails.totalAccruedInterest,
        totalSavingsBalance: 0
      },
      memberRepayments: [],
      installmentSchedule: generateInstallmentSchedule(groupLoan),
      groupPerformance: {
        repaymentTrend: await getRepaymentTrend(groupLoan._id, startDate, endDate),
        memberPerformance: await getMemberPerformanceStats(loanAccounts, summaryMap)
      },
      // NEW: Member collection spreadsheet data
      collectionSpreadsheet: {
        summary: {
          totalMembers: memberExpectedRepayments.length,
          totalExpectedAmount: memberExpectedRepayments.reduce((sum, member) => sum + (member.expectedAmount || 0), 0),
          totalOutstandingPrincipal: memberExpectedRepayments.reduce((sum, member) => sum + (member.outstandingPrincipal || 0), 0),
          totalOutstandingInterest: memberExpectedRepayments.reduce((sum, member) => sum + (member.outstandingInterest || 0), 0),
          totalSavingsBalance: 0,
          paymentFrequency: paymentFrequency,
          installmentAmount: expectedRepaymentDetails.installmentAmount
        },
        members: []
      }
    };

    // Process each member's repayment status with enhanced details - FIXED: Add null checks
    for (const loanAccount of loanAccounts) {
      try {
        const loanSummary = summaryMap.get(loanAccount._id?.toString());
        
        // FIXED: Handle undefined CUST_ID safely
        const customerId = loanAccount.CUST_ID?._id?.toString() || loanAccount.CUST_ID?.toString();
        if (!customerId) {
          console.log(`⚠️ Skipping loan account ${loanAccount.ACCT_NO} - No customer ID found`);
          continue;
        }

        const savingsAccount = savingsMap.get(customerId);
        
        // Get member expected repayment details
        const memberExpected = memberExpectedRepayments.find(m => 
          m.accountNumber === loanAccount.ACCT_NO || 
          m.memberId === customerId
        );

        const repaymentStatus = await getMemberRepaymentStatus(loanAccount, loanSummary, groupLoan);
        if (!repaymentStatus) {
          console.log(`⚠️ Could not get repayment status for ${loanAccount.ACCT_NO}`);
          continue;
        }
        
        // Calculate savings balance - FIXED: Use correct field names
        const savingsBalance = savingsAccount ? 
          (safeNumber(savingsAccount.AVAILABLE_BALANCE) || safeNumber(savingsAccount.ledger_balance) || 0) : 0;
        
        // Enhanced member repayment details with installment and savings info
        const enhancedRepaymentStatus = {
          ...repaymentStatus,
          // Installment and expected repayment information
          expectedInstallment: safeNumber(memberExpected?.expectedAmount),
          principalShare: safeNumber(memberExpected?.principalAmount),
          interestShare: safeNumber(memberExpected?.interestAmount),
          outstandingPrincipal: safeNumber(memberExpected?.outstandingPrincipal),
          outstandingInterest: safeNumber(memberExpected?.outstandingInterest),
          
          // Savings information - FIXED: Use CustomerAccount fields
          savingsAccountNo: savingsAccount?.ACCT_NO || savingsAccount?.account_number || 'N/A',
          savingsAccountName: savingsAccount?.ACCT_NM || savingsAccount?.account_name || 'N/A',
          currentSavingsBalance: savingsBalance,
          savingsProductType: savingsAccount?.PRODUCT_TYPE || 'N/A',
          
          // Disbursement details
          actualDisbursement: safeNumber(loanAccount.ACTUAL_DISBURSEMENT) || safeNumber(loanAccount.DISBURSEMENT_LIMIT) || 0,
          disbursementDate: loanAccount.disbursedAt || loanAccount.START_DT || groupLoan.disbursedAt,
          
          // Loan balance details
          originalLoanAmount: safeNumber(loanAccount.ORIGINAL_PRINCIPAL) || safeNumber(loanAccount.DISBURSEMENT_LIMIT) || 0,
          currentLoanBalance: safeNumber(repaymentStatus.outstandingBalance),
          totalRepaidToDate: safeNumber(repaymentStatus.totalRepaid),
          
          // Payment schedule
          nextDueDate: repaymentStatus.nextPaymentDate,
          isInstallmentDue: repaymentStatus.isOverdue || false,
          daysUntilDue: repaymentStatus.nextPaymentDate ? 
            Math.ceil((new Date(repaymentStatus.nextPaymentDate) - new Date()) / (1000 * 60 * 60 * 24)) : 0,
          
          // Collection status
          collectionStatus: getCollectionStatus(repaymentStatus, memberExpected),
          recommendedAction: getRecommendedAction(repaymentStatus, memberExpected)
        };

        collectionSheet.memberRepayments.push(enhancedRepaymentStatus);

        // Update summary totals with safe numbers
        collectionSheet.repaymentSummary.totalLoanAmount += safeNumber(repaymentStatus.loanAmount);
        collectionSheet.repaymentSummary.totalDisbursed += safeNumber(enhancedRepaymentStatus.actualDisbursement);
        collectionSheet.repaymentSummary.totalRepaid += safeNumber(repaymentStatus.totalRepaid);
        collectionSheet.repaymentSummary.totalOutstanding += safeNumber(repaymentStatus.outstandingBalance);
        collectionSheet.repaymentSummary.totalSavingsBalance += safeNumber(enhancedRepaymentStatus.currentSavingsBalance);
        
        if (repaymentStatus.isOverdue) {
          collectionSheet.repaymentSummary.overdueMembers++;
          collectionSheet.repaymentSummary.totalOverdue += safeNumber(repaymentStatus.overdueAmount);
        }
        
        if (repaymentStatus.isFullyPaid) {
          collectionSheet.repaymentSummary.fullyPaidMembers++;
        } else {
          collectionSheet.repaymentSummary.activeMembers++;
        }

        // Track next collection date
        if (repaymentStatus.nextPaymentDate && 
            (!collectionSheet.repaymentSummary.nextCollectionDate || 
             new Date(repaymentStatus.nextPaymentDate) < new Date(collectionSheet.repaymentSummary.nextCollectionDate))) {
          collectionSheet.repaymentSummary.nextCollectionDate = repaymentStatus.nextPaymentDate;
        }

        // Add to collection spreadsheet
        collectionSheet.collectionSpreadsheet.members.push({
          memberId: customerId,
          memberName: loanAccount.CUST_ID?.FIRST_NM ? 
            `${loanAccount.CUST_ID.FIRST_NM || ''} ${loanAccount.CUST_ID.MIDDLE_NM || ''} ${loanAccount.CUST_ID.LAST_NM || ''}`.trim() :
            loanAccount.ACCT_NM || 'Unknown Customer',
          loanAccountNo: loanAccount.ACCT_NO,
          savingsAccountNo: savingsAccount?.ACCT_NO || savingsAccount?.account_number || 'N/A',
          
          // Expected repayment amounts
          expectedRepayment: safeNumber(memberExpected?.expectedAmount),
          principalAmount: safeNumber(memberExpected?.principalAmount),
          interestAmount: safeNumber(memberExpected?.interestAmount),
          
          // Current balances
          outstandingPrincipal: safeNumber(memberExpected?.outstandingPrincipal),
          outstandingInterest: safeNumber(memberExpected?.outstandingInterest),
          currentLoanBalance: safeNumber(repaymentStatus.outstandingBalance),
          currentSavingsBalance: safeNumber(enhancedRepaymentStatus.currentSavingsBalance),
          
          // Disbursement info
          totalDisbursement: safeNumber(enhancedRepaymentStatus.actualDisbursement),
          totalRepaid: safeNumber(repaymentStatus.totalRepaid),
          
          // Payment status
          nextDueDate: repaymentStatus.nextPaymentDate,
          isOverdue: repaymentStatus.isOverdue,
          overdueAmount: safeNumber(repaymentStatus.overdueAmount),
          daysOverdue: safeNumber(repaymentStatus.daysOverdue),
          
          // Collection fields (to be filled by CSO)
          collectedLoanAmount: 0,
          collectedSavingsAmount: 0,
          totalCollected: 0,
          
          // Status indicators
          paymentStatus: getPaymentStatus(repaymentStatus),
          collectionPriority: getCollectionPriority(repaymentStatus)
        });

      } catch (memberError) {
        console.error(`❌ Error processing member for loan account ${loanAccount.ACCT_NO}:`, memberError.message);
        // Continue with next member even if one fails
      }
    }

    // Calculate final summary metrics
    collectionSheet.repaymentSummary.collectionRate = 
      collectionSheet.repaymentSummary.totalLoanAmount > 0 ?
      (collectionSheet.repaymentSummary.totalRepaid / collectionSheet.repaymentSummary.totalLoanAmount) * 100 : 0;

    collectionSheet.repaymentSummary.averageInstallment = 
      collectionSheet.repaymentSummary.activeMembers > 0 ?
      collectionSheet.repaymentSummary.totalOutstanding / collectionSheet.repaymentSummary.activeMembers : 0;

    // Update collection spreadsheet summary
    collectionSheet.collectionSpreadsheet.summary.totalSavingsBalance = collectionSheet.repaymentSummary.totalSavingsBalance;

    // Include payment history if requested
    if (includeHistory === 'true') {
      collectionSheet.paymentHistory = await getGroupPaymentHistory(groupLoan._id, startDate, endDate);
    }

    console.log(`✅ Group repayment collection sheet generated for ${groupId}`);
    console.log(`📊 Summary: ${collectionSheet.repaymentSummary.activeMembers} active, ${collectionSheet.repaymentSummary.overdueMembers} overdue, ${collectionSheet.repaymentSummary.collectionRate.toFixed(1)}% collected`);
    console.log(`💰 Expected installment: ${expectedRepaymentDetails.installmentAmount?.toLocaleString()}`);
    console.log(`🏦 Total savings balance: ${collectionSheet.repaymentSummary.totalSavingsBalance.toLocaleString()}`);

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
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Safe number utility function
const safeNumber = (value, defaultValue = 0) => {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'object' && value.toString) {
    // Handle Decimal128 objects
    return parseFloat(value.toString()) || defaultValue;
  }
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

// Also update the getMemberRepaymentStatus function with null checks
async function getMemberRepaymentStatus(loanAccount, loanSummary, groupLoan) {
  try {
    const disbursementInfo = getLoanAccountDisbursementInfo(loanAccount, groupLoan);
    const isOverdue = loanSummary?.DELINQUENT_DAYS > 0;
    const overdueAmount = isOverdue ? safeNumber(loanSummary?.OUTSTANDING_PRINCIPAL) : 0;
    const isFullyPaid = safeNumber(loanSummary?.OUTSTANDING_PRINCIPAL) <= 0;

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
      loanAmount: safeNumber(loanAccount.DISBURSEMENT_LIMIT),
      actualDisbursement: disbursementInfo.actualDisbursement,
      individualShare: safeNumber(loanAccount.individualShare),
      
      // Repayment Status
      installmentAmount: memberInstallment,
      totalRepaid: safeNumber(loanSummary?.TOTAL_REPAYMENT),
      outstandingBalance: safeNumber(loanSummary?.OUTSTANDING_PRINCIPAL),
      overdueAmount: overdueAmount,
      
      // Payment Information
      lastPaymentDate: loanSummary?.LAST_PAYMENT_DT,
      lastPaymentAmount: safeNumber(loanSummary?.LAST_PAYMENT_AMOUNT),
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
  } catch (error) {
    console.error(`Error in getMemberRepaymentStatus for account ${loanAccount.ACCT_NO}:`, error);
    return null;
  }
}

// Helper function to calculate expected repayment details
const calculateExpectedRepayment = (groupLoan, paymentFrequency) => {
  const totalLoanAmount = groupLoan.totalAmount || 0;
  const interestRate = groupLoan.interestRate || 0;
  const loanTerm = groupLoan.termValue || groupLoan.loanTerm || 12; // Default to 12 months
  
  // Calculate total interest
  const totalInterest = totalLoanAmount * (interestRate / 100) * (loanTerm / 12);
  const totalRepayment = totalLoanAmount + totalInterest;
  
  // Calculate installment amount based on payment frequency
  let installmentAmount = 0;
  switch (paymentFrequency.toUpperCase()) {
    case 'WEEKLY':
      installmentAmount = totalRepayment / (loanTerm * 4); // Approximate weeks
      break;
    case 'BIWEEKLY':
      installmentAmount = totalRepayment / (loanTerm * 2); // Approximate fortnights
      break;
    case 'MONTHLY':
    default:
      installmentAmount = totalRepayment / loanTerm;
      break;
  }
  
  return {
    totalLoanAmount,
    totalInterest,
    totalRepayment,
    installmentAmount: Math.round(installmentAmount * 100) / 100, // Round to 2 decimal places
    paymentFrequency,
    loanTerm
  };
};

// Helper function to calculate accrued interest
const calculateAccruedInterest = (groupLoan, repaymentDetails) => {
  const disbursementDate = groupLoan.disbursedAt || new Date();
  const currentDate = new Date();
  const daysSinceDisbursement = Math.max(1, Math.floor((currentDate - disbursementDate) / (1000 * 60 * 60 * 24)));
  
  const dailyInterestRate = (groupLoan.interestRate || 0) / 100 / 365;
  const totalLoanAmount = groupLoan.totalAmount || 0;
  const totalAccruedInterest = totalLoanAmount * dailyInterestRate * daysSinceDisbursement;
  
  return {
    totalAccruedInterest: Math.round(totalAccruedInterest * 100) / 100,
    daysSinceDisbursement,
    dailyInterestRate
  };
};

// Helper function to calculate member expected repayments
const calculateMemberExpectedRepayments = (groupLoan, expectedRepaymentDetails, accruedInterestDetails) => {
  if (!groupLoan.members || groupLoan.members.length === 0) {
    return [];
  }
  
  const totalMembers = groupLoan.members.length;
  const individualShare = groupLoan.individualShare || (groupLoan.totalAmount / totalMembers);
  
  return groupLoan.members.map((member, index) => {
    const memberShare = individualShare;
    const memberInterestShare = (memberShare / expectedRepaymentDetails.totalLoanAmount) * expectedRepaymentDetails.totalInterest;
    const memberAccruedInterest = (memberShare / expectedRepaymentDetails.totalLoanAmount) * accruedInterestDetails.totalAccruedInterest;
    
    return {
      memberId: member.memberId?._id || member.memberId,
      memberName: member.name || member.memberId?.FIRST_NM || `Member ${index + 1}`,
      accountNumber: member.loanAccountNo || `LN${groupLoan.groupCode}${(index + 1).toString().padStart(3, '0')}`,
      savingsAccountNo: member.savingsAccountNo || `SV${groupLoan.groupCode}${(index + 1).toString().padStart(3, '0')}`,
      expectedAmount: Math.round((memberShare + memberInterestShare) / expectedRepaymentDetails.loanTerm * 100) / 100,
      principalAmount: Math.round(memberShare / expectedRepaymentDetails.loanTerm * 100) / 100,
      interestAmount: Math.round(memberInterestShare / expectedRepaymentDetails.loanTerm * 100) / 100,
      outstandingPrincipal: memberShare,
      outstandingInterest: memberAccruedInterest,
      currentBalance: memberShare + memberAccruedInterest,
      isLegacy: member.isLegacy || false
    };
  });
};

// Helper function to get collection status
const getCollectionStatus = (repaymentStatus, memberExpected) => {
  if (repaymentStatus.isFullyPaid) {
    return 'PAID_IN_FULL';
  } else if (repaymentStatus.isOverdue) {
    return 'OVERDUE';
  } else if (repaymentStatus.totalRepaid > 0) {
    return 'PARTIALLY_PAID';
  } else {
    return 'PENDING_FIRST_PAYMENT';
  }
};

// Helper function to get recommended action
const getRecommendedAction = (repaymentStatus, memberExpected) => {
  if (repaymentStatus.isOverdue) {
    return 'COLLECT_OVERDUE_AMOUNT';
  } else if (repaymentStatus.nextPaymentDate && repaymentStatus.nextPaymentDate <= new Date()) {
    return 'COLLECT_CURRENT_INSTALLMENT';
  } else {
    return 'COLLECT_REGULAR_INSTALLMENT';
  }
};

// Helper function to get payment status
const getPaymentStatus = (repaymentStatus) => {
  if (repaymentStatus.isFullyPaid) return 'FULLY_PAID';
  if (repaymentStatus.isOverdue) return 'OVERDUE';
  if (repaymentStatus.totalRepaid > 0) return 'ACTIVE';
  return 'PENDING';
};

// Helper function to get collection priority
const getCollectionPriority = (repaymentStatus) => {
  if (repaymentStatus.isOverdue && repaymentStatus.daysOverdue > 30) return 'HIGH';
  if (repaymentStatus.isOverdue) return 'MEDIUM';
  return 'LOW';
};


// Helper function to generate installment schedule
function generateInstallmentSchedule(groupLoan) {
  if (!groupLoan.disbursedAt) return [];

  const schedule = [];
  const totalInstallments = groupLoan.termValue || groupLoan.numPeriods || 12;
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
  const loanTerm = groupLoan.paymentFrequency || 'MONTHLY';

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
};



export default {
  createGroup,
  getGroups,
  addMemberToGroup,
  updateGroup,
  removeMemberFromGroup,
  getGroupByLegacyId,
  getGroupsByBranch,
  createGroupLoanApplication,
  repayGroupLoan,
  getGroupLoan,
  deleteGroup,
   getPendingCreditApplications
};