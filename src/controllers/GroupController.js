// controllers/GroupController.js - Complete Controller with Legacy Field Support
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
import LoanInterestRate from '../models/LoanInterestRate.js'; // Your interest rate model
import RateIndex from '../models/Rate-Index.js'; 





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



// Create group loan application - Updated for dynamic interest rate from setup
export const createGroupLoanApplication = asyncHandler(async (req, res) => {
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
    
    // Interest rate configuration
    rateType = 'FIXED',
    interestType = 'COMPOUND',
    accrualBasisType = 'ACTUAL/360',
    accrualFrequency = 'DAILY',
    accrualFrequencyValue = 1,
    fixedRate = true,
    
    // Additional fields
    capitalizeInterest = false,
    amortized = false,
    rateChangeAllowed = false,
    rateChangeNoticeDays = 30,
    
    // Charges and Fees (Applied during credit application)
    charges = [],
    insuranceDetails = null,
    processingFee = 0,
    insuranceFee = 0,
    otherFees = 0,
    upfrontInterest = false,
    upfrontInterestPercentage = 0
  } = req.body;

  // Validate required fields
  if (!groupCode || !primaryRelationshipManager || !loanPurpose || !savingsAccount || !loanTerm || !termValue || !disbursementMethod || !members || !Array.isArray(members) || members.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Group code, primary RM, loan purpose, savings account, loan term, term value, disbursement method, and members array are required.',
    });
  }

  // Validate loanTerm
  if (!['weekly', 'monthly', 'yearly'].includes(loanTerm)) {
    return res.status(400).json({
      success: false,
      message: 'Loan term must be one of: weekly, monthly, yearly.',
    });
  }

  const group = await Group.findOne({ groupCode }).select('branch members groupName');
  if (!group) {
    return res.status(404).json({
      success: false,
      message: 'Group not found.',
    });
  }

  // Validate each member and compute total from individualAmounts
  let computedTotalAmount = 0;
  const processingMembers = [];
  for (const mem of members) {
    if (!mem.memberId || typeof mem.individualAmount !== 'number' || mem.individualAmount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Each member must have a valid memberId and positive individualAmount.' 
      });
    }

    const memberCustomer = await Customer.findOne({ CUST_ID: mem.memberId }).select('FIRST_NAME LAST_NAME address');
    if (!memberCustomer) {
      return res.status(404).json({ success: false, message: `Customer not found for memberId: ${mem.memberId}` });
    }

    const memberData = {
      ...mem,
      name: mem.name || `${memberCustomer.FIRST_NAME} ${memberCustomer.LAST_NAME}`.trim(),
      isInGroup: group.members.includes(mem.memberId)
    };

    processingMembers.push(memberData);
    computedTotalAmount += mem.individualAmount;
  }

  // Validate totalAmount
  const finalTotalAmount = totalAmount || computedTotalAmount;
  if (totalAmount && totalAmount !== computedTotalAmount) {
    return res.status(400).json({ 
      success: false, 
      message: `Provided totalAmount (${totalAmount}) does not match sum of individualAmounts (${computedTotalAmount}).` 
    });
  }
  if (finalTotalAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Total amount must be greater than 0.' });
  }

  // Validate savings account
  const savings = await CustomerAccount.findOne({ account_number: savingsAccount });
  if (!savings) {
    return res.status(404).json({
      success: false,
      message: 'Savings account not found.',
    });
  }

  // Calculate total fees and charges
  const totalProcessingFee = parseFloat(processingFee) || 0;
  const totalInsuranceFee = parseFloat(insuranceFee) || 0;
  const totalOtherFees = parseFloat(otherFees) || 0;
  
  let totalChargesAmount = 0;
  const processedCharges = charges.map(charge => {
    const amount = parseFloat(charge.amount) || 0;
    totalChargesAmount += amount;
    return {
      chargeId: charge.chargeId || Date.now() + Math.random(),
      chargeCode: charge.chargeCode || `CHG_${Date.now()}`,
      name: charge.name || 'Processing Charge',
      amount: amount,
      glAccountCode: charge.glAccountCode || '400001',
      chargeType: charge.chargeType || 'PROCESSING_FEE',
      isUpfront: charge.isUpfront !== false // Default to true
    };
  });

  const totalFees = totalProcessingFee + totalInsuranceFee + totalOtherFees + totalChargesAmount;

  // Calculate interest and financials (Applied during credit application)
  let years;
  if (loanTerm === 'weekly') {
    years = termValue / 52;
  } else if (loanTerm === 'monthly') {
    years = termValue / 12;
  } else if (loanTerm === 'yearly') {
    years = termValue;
  } else {
    years = termValue;
  }

  const rate = interestRate / 100;
  const totalInterest = finalTotalAmount * rate * years;
  
  // Calculate upfront interest if applicable
  let upfrontInterestAmount = 0;
  let remainingInterestAmount = totalInterest;
  
  if (upfrontInterest && upfrontInterestPercentage > 0) {
    upfrontInterestAmount = totalInterest * (upfrontInterestPercentage / 100);
    remainingInterestAmount = totalInterest - upfrontInterestAmount;
  }

  const totalRepayable = finalTotalAmount + totalInterest;
  const numPeriods = termValue;
  const groupInstallment = totalRepayable / numPeriods;

  // Calculate net disbursement amount after deducting fees and upfront interest
  const netDisbursementAmount = finalTotalAmount - totalFees - upfrontInterestAmount;

  if (netDisbursementAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: `Net disbursement amount after fees and upfront interest would be ${netDisbursementAmount}. Adjust loan amount or reduce fees.`
    });
  }

  // Group savings collateral
  let groupSavings = null;
  let savingsCollateral = 0;
 
  if (useSavingsAsCollateral && groupSavingsId) {
    groupSavings = await GroupSavings.findOne({
      groupCode: groupSavingsId,
      isActive: true
    });
    
    if (groupSavings) {
      savingsCollateral = Math.min(groupSavings.currentBalance, finalTotalAmount * 0.5);
    }
  }

  // Individual LoanAccount creation with ALL financial calculations
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
      const memberCustomer = await Customer.findOne({ CUST_ID: mem.memberId }).select('address FIRST_NAME LAST_NAME');
      if (!memberCustomer) {
        throw new Error(`Customer not found for ${mem.memberId}`);
      }

      // Address with fallbacks
      const borrowerAddress = {
        street: memberCustomer.address?.street || 'Not Provided',
        city: memberCustomer.address?.city || 'Not Provided',
        state: memberCustomer.address?.state || 'Not Provided',
        zipCode: memberCustomer.address?.zipCode || '00000',
        country: 'Nigeria'
      };

      // Map terms
      const paymentFrequency = loanTerm.toUpperCase();
      const termCd = loanTerm.toUpperCase();

      // Calculate maturity
      const maturityDt = new Date(startDate);
      switch (loanTerm.toLowerCase()) {
        case 'weekly':
          maturityDt.setDate(maturityDt.getDate() + (termValue * 7));
          break;
        case 'monthly':
          maturityDt.setMonth(maturityDt.getMonth() + termValue);
          break;
        case 'yearly':
          maturityDt.setFullYear(maturityDt.getFullYear() + termValue);
          break;
        default:
          maturityDt.setMonth(maturityDt.getMonth() + termValue);
      }

      // Calculate individual member's share
      const memberShareRatio = mem.individualAmount / finalTotalAmount;
      const individualShare = mem.individualAmount;
      
      // Calculate individual financials
      const individualInterest = individualShare * rate * years;
      const individualUpfrontInterest = individualInterest * (upfrontInterestPercentage / 100);
      const individualRemainingInterest = individualInterest - individualUpfrontInterest;
      const individualTotalRepayable = individualShare + individualInterest;
      const individualInstallment = individualTotalRepayable / numPeriods;

      // Calculate individual fees
      const memberProcessingFee = totalProcessingFee * memberShareRatio;
      const memberInsuranceFee = totalInsuranceFee * memberShareRatio;
      const memberOtherFees = totalOtherFees * memberShareRatio;
      const memberCharges = processedCharges.map(charge => ({
        ...charge,
        amount: charge.amount * memberShareRatio
      }));

      const memberTotalFees = memberProcessingFee + memberInsuranceFee + memberOtherFees + memberCharges.reduce((sum, charge) => sum + charge.amount, 0);
      const memberNetDisbursement = individualShare - memberTotalFees - individualUpfrontInterest;

      // Generate IDs
      const applId = uuidv4().replace(/-/g, '').slice(0, 32);
      const journalId = uuidv4().replace(/-/g, '').slice(0, 32);
      const productType = 'GROUP_LOAN';
      const buId = group.branch || 'DEFAULT_BU_001';

      const newIndividualLoanAccount = new LoanAccount({
        // Core fields
        CUST_ID: mem.memberId,
        ACCT_NM: mem.name || `${memberCustomer.FIRST_NAME} ${memberCustomer.LAST_NAME}`.trim(),
        ACCT_NO: individualLoanAccountNumber,
        LOAN_STATUS: 'PENDING',

        // Required legacy fields
        PRIMARY_OFFICER_ID: primaryRelationshipManager,
        BU_ID: buId,
        PROD_ID: 1, // Group loan product ID
        PRODUCT_TYPE: productType,
        APPL_ID: applId,
        JOURNAL_ID: journalId,
        PAYMENT_FREQUENCY: paymentFrequency,
        INTEREST_RATE: interestRate,
        MATURITY_DT: maturityDt,
        TERM_VALUE: termValue,
        TERM_CD: termCd,

        // Loan amounts (ALL calculated during credit application)
        DISBURSEMENT_LIMIT: individualShare,
        ACTUAL_DISBURSEMENT: 0.00, // Will be set during disbursement
        OUTSTANDING_PRINCIPAL: individualShare,
        TOTAL_INTEREST: individualInterest,
        TOTAL_REPAYMENT: individualTotalRepayable,

        // Upfront interest calculations
        deductUpfrontInterest: upfrontInterest,
        partialUpfrontInterest: upfrontInterestPercentage > 0 && upfrontInterestPercentage < 100,
        upfrontInterestPercentage: upfrontInterestPercentage,
        upfrontInterestAmount: individualUpfrontInterest,
        remainingInterestAmount: individualRemainingInterest,

        // Address
        Borrower_address: borrowerAddress,

        // Group loan specific
        groupLoan: null,
        loanPurpose,
        interestRate: interestRate,
        loanTerm,
        disbursementMethod,
        individualShare,
        installmentAmount: individualInstallment,
        numPeriods: termValue,
        createdBy: req.user.id,
        
        // Fees and charges (Applied during credit application)
        FEE_DETAILS: {
          processingFee: memberProcessingFee,
          insuranceFee: memberInsuranceFee,
          otherFees: memberOtherFees,
          totalFees: memberTotalFees,
          charges: memberCharges,
          upfrontInterest: individualUpfrontInterest,
          upfrontInterestPercentage: upfrontInterestPercentage
        },

        // Net amounts for disbursement
        netDisbursementAmount: memberNetDisbursement,
        totalDeductions: memberTotalFees + individualUpfrontInterest,

        // Insurance details
        insuranceDetails: insuranceDetails ? {
          ...insuranceDetails,
          premiumAmount: memberInsuranceFee,
          insuredAmount: individualShare,
          coverageType: insuranceDetails.coverageType || 'LOAN_PROTECTION',
          provider: insuranceDetails.provider || 'DEFAULT_INSURER',
          policyNumber: insuranceDetails.policyNumber || `POL_${individualLoanAccountNumber}`,
          startDate: insuranceDetails.startDate || startDate,
          endDate: insuranceDetails.endDate || maturityDt
        } : null
      });

      const savedIndividualLoanAccount = await newIndividualLoanAccount.save();
      individualLoanAccounts.push(savedIndividualLoanAccount._id);

    } catch (error) {
      logger.error(`Failed to create LoanAccount for member ${mem.memberId}:`, error);
      return res.status(400).json({
        success: false,
        message: `Failed to create LoanAccount for member ${mem.memberId}: ${error.message}`
      });
    }
  }

  // GroupLoan creation
  const newGroupLoan = new GroupLoan({
    group: group._id,
    groupCode: group.groupCode,
    groupName: group.groupName,
    totalAmount: finalTotalAmount,
    memberCount: processingMembers.length,
    primaryRelationshipManager,
    secondaryRelationshipManager: secondaryRelationshipManager || null,
    loanPurpose,
    savingsAccount,
    interestRate: interestRate,
    loanTerm,
    termValue,
    disbursementMethod,
    useSavingsAsCollateral: useSavingsAsCollateral || false,
    groupSavings: groupSavings ? groupSavings._id : null,
    savingsCollateral,
    individualLoanAccounts,
    branch: group.branch,
    createdBy: req.user.id,
    status: 'pending',
    
    // Financial summary (calculated during credit application)
    totalInterest: totalInterest,
    totalRepayable: totalRepayable,
    installmentAmount: groupInstallment,
    numPeriods: numPeriods,
    netDisbursementAmount: netDisbursementAmount,
    totalFees: totalFees,
    upfrontInterestAmount: upfrontInterestAmount,
    remainingInterestAmount: remainingInterestAmount,

    // Fees and charges summary
    feeSummary: {
      processingFee: totalProcessingFee,
      insuranceFee: totalInsuranceFee,
      otherFees: totalOtherFees,
      totalCharges: totalChargesAmount,
      totalFees: totalFees,
      charges: processedCharges,
      upfrontInterestPercentage: upfrontInterestPercentage
    },

    // Insurance details
    insuranceDetails: insuranceDetails ? {
      ...insuranceDetails,
      totalPremium: totalInsuranceFee,
      totalCoverage: finalTotalAmount
    } : null
  });

  const savedLoan = await newGroupLoan.save();
  
  // Update individual LoanAccounts with group loan reference
  await LoanAccount.updateMany(
    { _id: { $in: individualLoanAccounts } },
    { groupLoan: savedLoan._id }
  );

  // Populate response
  await savedLoan.populate('group', 'groupName memberCount');
  await savedLoan.populate('savingsAccount', 'account_number ledger_balance');
  
  if (groupSavings) {
    await savedLoan.populate('groupSavings', 'savingsType currentBalance');
  }

  // Response message with financial breakdown
  let message = `Group loan application created successfully for ${processingMembers.length} members. `;
  message += `Total amount: ${finalTotalAmount.toLocaleString()}. `;
  message += `Net disbursement: ${netDisbursementAmount.toLocaleString()} (after ${totalFees.toLocaleString()} fees`;
  
  if (upfrontInterestAmount > 0) {
    message += ` and ${upfrontInterestAmount.toLocaleString()} upfront interest`;
  }
  message += `). `;
  
  message += `Total repayable: ${totalRepayable.toLocaleString()} over ${termValue} ${loanTerm} payments.`;

  res.status(201).json({
    success: true,
    message: message,
    data: savedLoan,
    financialSummary: {
      totalAmount: finalTotalAmount,
      totalFees: totalFees,
      upfrontInterest: upfrontInterestAmount,
      netDisbursement: netDisbursementAmount,
      totalInterest: totalInterest,
      totalRepayable: totalRepayable,
      installmentAmount: groupInstallment
    }
  });
});


// Disburse group loan - Enhanced with detailed member tracking
export const disburseGroupLoan = asyncHandler(async (req, res) => {
  const { groupLoanId } = req.params;
  const groupLoan = await GroupLoan.findById(groupLoanId)
    .populate('group')
    .populate('groupSavings')
    .populate('individualLoanAccounts');
      
  if (!groupLoan) {
    return res.status(404).json({
      success: false,
      message: 'Group loan not found.',
    });
  }

  if (groupLoan.status !== 'approved') {
    return res.status(400).json({
      success: false,
      message: 'Group loan must be approved before disbursement.',
    });
  }

  const startDate = new Date();
  const disbursementResults = {
    successful: [],
    failed: [],
    feesCollected: [],
    insuranceActivated: [],
    insufficientFunds: []
  };

  // Get all individual loan accounts for this group loan
  const individualAccounts = await LoanAccount.find({ 
    groupLoan: groupLoanId,
    LOAN_STATUS: 'PENDING'
  });

  for (const loanAccount of individualAccounts) {
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        // STEP 1: GET CUSTOMER'S ACCOUNT TO DEBIT FEES FROM
        const customerAccount = await CustomerAccount.findOne({ 
          CUST_ID: loanAccount.CUST_ID,
          account_type: 'SAVINGS' // Or whatever account type to debit from
        }).session(session);

        if (!customerAccount) {
          throw new Error(`Customer account not found for member ${loanAccount.CUST_ID}`);
        }

        const totalFees = loanAccount.FEE_DETAILS.totalFees + loanAccount.FEE_DETAILS.upfrontInterest;
        
        // STEP 2: CHECK IF CUSTOMER HAS SUFFICIENT BALANCE FOR FEES
        if (customerAccount.ledger_balance < totalFees) {
          disbursementResults.insufficientFunds.push({
            custId: loanAccount.CUST_ID,
            name: loanAccount.ACCT_NM,
            requiredFees: totalFees,
            availableBalance: customerAccount.ledger_balance,
            shortfall: totalFees - customerAccount.ledger_balance
          });
          throw new Error(`Insufficient funds for fees. Required: ${totalFees}, Available: ${customerAccount.ledger_balance}`);
        }

        // STEP 3: DEBIT FEES AND CHARGES FROM CUSTOMER ACCOUNT
        if (totalFees > 0) {
          await debitFeesFromCustomerAccount(loanAccount, customerAccount, req.user.id, session);
          
          disbursementResults.feesCollected.push({
            custId: loanAccount.CUST_ID,
            name: loanAccount.ACCT_NM,
            totalFees: totalFees,
            accountDebited: customerAccount.account_number,
            newBalance: customerAccount.ledger_balance - totalFees
          });
        }

        // STEP 4: ACTIVATE INSURANCE (Premium already collected above)
        if (loanAccount.insuranceDetails) {
          await activateInsurance(loanAccount, req.user.id, session);
          
          disbursementResults.insuranceActivated.push({
            custId: loanAccount.CUST_ID,
            name: loanAccount.ACCT_NM,
            premium: loanAccount.insuranceDetails.premiumAmount,
            coverage: loanAccount.insuranceDetails.insuredAmount,
            policyNumber: loanAccount.insuranceDetails.policyNumber
          });
        }

        // STEP 5: DISBURSE FULL LOAN AMOUNT TO CUSTOMER (No deductions since fees already paid)
        await disburseFullAmount(loanAccount, customerAccount, req.user.id, session);

        // STEP 6: UPDATE LOAN ACCOUNT STATUS
        loanAccount.ACTUAL_DISBURSEMENT = loanAccount.DISBURSEMENT_LIMIT; // Full amount disbursed
        loanAccount.LOAN_STATUS = 'ACTIVE';
        loanAccount.START_DT = startDate;
        loanAccount.disbursedAt = startDate;
        loanAccount.FEE_DETAILS.feesCollected = true;
        loanAccount.FEE_DETAILS.collectionDate = startDate;
        loanAccount.FEE_DETAILS.collectionMethod = 'CUSTOMER_ACCOUNT_DEBIT';
        
        if (loanAccount.insuranceDetails) {
          loanAccount.insuranceDetails.premiumCollected = true;
          loanAccount.insuranceDetails.policyActive = true;
          loanAccount.insuranceDetails.collectionDate = startDate;
        }

        await loanAccount.save({ session });

        disbursementResults.successful.push({
          custId: loanAccount.CUST_ID,
          name: loanAccount.ACCT_NM,
          loanAccountId: loanAccount._id,
          loanAmount: loanAccount.DISBURSEMENT_LIMIT,
          feesPaid: totalFees,
          netReceived: loanAccount.DISBURSEMENT_LIMIT, // Customer gets full loan amount
          accountNumber: loanAccount.ACCT_NO,
          customerAccount: customerAccount.account_number
        });

      });

    } catch (memberError) {
      logger.error(`Error disbursing to member ${loanAccount.CUST_ID}:`, memberError);
      disbursementResults.failed.push({
        custId: loanAccount.CUST_ID,
        name: loanAccount.ACCT_NM,
        reason: memberError.message
      });
    } finally {
      await session.endSession();
    }
  }

  // Update group loan status
  groupLoan.status = disbursementResults.failed.length === 0 ? 'disbursed' : 'partially_disbursed';
  groupLoan.disbursedAt = startDate;
  groupLoan.actualDisbursementDate = startDate;
  groupLoan.feesCollected = true;
  groupLoan.disbursementResults = disbursementResults;

  await groupLoan.save();

  // Log comprehensive disbursement
  await logAuditTrail(
    'GroupLoan',
    groupLoan._id.toString(),
    req.user.id,
    'DISBURSE_WITH_FEES',
    { status: 'approved' },
    { 
      status: groupLoan.status, 
      successful: disbursementResults.successful.length,
      failed: disbursementResults.failed.length,
      insufficientFunds: disbursementResults.insufficientFunds.length,
      feesCollected: disbursementResults.feesCollected.length,
      insuranceActivated: disbursementResults.insuranceActivated.length,
      totalFees: groupLoan.feeSummary.totalFees,
      totalDisbursed: groupLoan.totalAmount // Full amount since fees collected separately
    },
    req.ip,
    'GROUP_LOAN_DISBURSEMENT_WITH_ACCOUNT_DEBIT'
  );

  res.status(200).json({
    success: true,
    message: `Group loan disbursement completed. ${disbursementResults.successful.length} successful, ${disbursementResults.failed.length} failed, ${disbursementResults.insufficientFunds.length} insufficient funds.`,
    data: {
      disbursementSummary: disbursementResults,
      financialBreakdown: {
        totalLoanAmount: groupLoan.totalAmount,
        totalFeesCollected: groupLoan.feeSummary.totalFees,
        netCustomerReceipt: groupLoan.totalAmount, // Customers receive full loan amount
        feesCollectionMethod: 'DEBIT_FROM_CUSTOMER_ACCOUNTS'
      }
    }
  });
});

// Repay group loan (split repayment across members)
export const repayGroupLoan = asyncHandler(async (req, res) => {
  const { groupLoanId } = req.params;
  const { totalRepayAmount, isInstallment } = req.body;

  if (!totalRepayAmount || totalRepayAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Repayment amount is required and must be greater than 0.',
    });
  }

  const groupLoan = await GroupLoan.findById(groupLoanId).populate('group');
  if (!groupLoan) {
    return res.status(404).json({
      success: false,
      message: 'Group loan not found.',
    });
  }

  if (groupLoan.status !== 'disbursed') {
    return res.status(400).json({
      success: false,
      message: 'Group loan must be disbursed before repayment.',
    });
  }

  // Optional: Validate if this is an installment repayment
  let validationMessage = '';
  if (isInstallment && groupLoan.installmentAmount) {
    if (Math.abs(totalRepayAmount - groupLoan.installmentAmount) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `For installment repayment, amount should match the scheduled ${groupLoan.loanTerm} installment of ${groupLoan.installmentAmount.toLocaleString()}.`,
      });
    }
    validationMessage = ` (${groupLoan.loanTerm} installment applied)`;
  }

  const individualRepay = totalRepayAmount / groupLoan.memberCount;
  const paymentDate = new Date();
  const oldTotalRepaid = groupLoan.totalRepaid || 0;

  // Update each member's LoanAccount with repayment
  const repaidMembers = [];
  for (const memberCustId of groupLoan.group.members) {
    const loanAccount = await LoanAccount.findOne({ CUST_ID: memberCustId });
    if (loanAccount) {
      // Fallback: Update loanAccount fields
      if (loanAccount.repaidAmount === undefined || loanAccount.repaidAmount === null) {
        loanAccount.repaidAmount = 0;
      }
      loanAccount.repaidAmount += individualRepay;
      if (!loanAccount.remainingBalance) loanAccount.remainingBalance = 0;
      loanAccount.remainingBalance = Math.max(0, loanAccount.totalRepayable - loanAccount.repaidAmount);
      
      // Track number of installments paid (if installment)
      if (isInstallment) {
        if (!loanAccount.installmentsPaid) loanAccount.installmentsPaid = 0;
        loanAccount.installmentsPaid += 1;
      }
      await loanAccount.save();
      repaidMembers.push(loanAccount._id);

      // Update repayment schedule if exists
      if (isInstallment) {
        const schedule = await RepaymentSchedule.findOne({ LOAN_ACCOUNT_ID: loanAccount._id });
        if (schedule && schedule.nextPayment) {
          const installmentNo = schedule.nextPayment.installmentNo;
          const installment = schedule.installments.find(inst => inst.installmentNo === installmentNo);
          if (installment) {
            // Full installment payment
            const paymentData = {
              amount: individualRepay,
              principal: parseFloat(installment.principal.toString()),
              interest: parseFloat(installment.interest.toString()),
              paymentDate,
              isEarlyPayment: new Date(installment.dueDate) > paymentDate
            };
            schedule.updateInstallmentPayment(installmentNo, paymentData);
            await schedule.save();
          }
        }
      }
    }
  }

  // Update group loan repayment totals
  if (groupLoan.totalRepaid === undefined || groupLoan.totalRepaid === null) {
    groupLoan.totalRepaid = 0;
  }
  groupLoan.totalRepaid += totalRepayAmount;
  groupLoan.repaidToMembers = [...(groupLoan.repaidToMembers || []), ...repaidMembers];
  
  // If installment, track group installments paid
  if (isInstallment) {
    if (!groupLoan.installmentsPaid) groupLoan.installmentsPaid = 0;
    groupLoan.installmentsPaid += 1;
  }

  // Check if fully repaid
  if (groupLoan.totalRepaid >= groupLoan.totalRepayable) {
    groupLoan.status = 'repaid';
    groupLoan.repaidAt = paymentDate;
  }

  await groupLoan.save();

  // Log audit trail for group loan repayment
  await logAuditTrail(
    'GroupLoan',
    groupLoan._id.toString(),
    req.user.id,
    'REPAY',
    { totalRepaid: oldTotalRepaid },
    { totalRepaid: groupLoan.totalRepaid, isInstallment, totalRepayAmount },
    req.ip,
    'GROUP_LOAN_REPAYMENT'
  );

  logger.info(`Group loan repayment processed: ${groupLoan._id}, Amount: ${totalRepayAmount}`);

  const installmentInfo = groupLoan.installmentAmount ? ` Expected ${groupLoan.loanTerm} installment per group: ${groupLoan.installmentAmount.toLocaleString()}.` : '';

  res.status(200).json({
    success: true,
    message: `Group loan repayment of ${totalRepayAmount.toLocaleString()} processed successfully for ${repaidMembers.length} members.${validationMessage} Individual repayment share: ${individualRepay.toLocaleString()}. Total repaid: ${groupLoan.totalRepaid.toLocaleString()}.${installmentInfo}`,
    data: groupLoan,
  });
});

// Get group loan by ID
export const getGroupLoan = asyncHandler(async (req, res) => {
  const { groupLoanId } = req.params;
  let groupLoan = await GroupLoan.findById(groupLoanId)
    .populate('group', 'groupName memberCount branch relationshipManager')
    .populate('primaryRelationshipManager', 'name email')
    .populate('secondaryRelationshipManager', 'name email')
    .populate('savingsAccount', 'accountNumber balance')
    .populate('disbursedToMembers', 'CUST_ID ACTUAL_DISBURSEMENT LOAN_STATUS totalInterest totalRepayable repaidAmount remainingBalance installmentAmount numPeriods installmentsPaid');

  if (!groupLoan) {
    return res.status(404).json({
      success: false,
      message: 'Group loan not found.',
    });
  }

  // Manually populate members from group (CUST_IDs)
  const populatedMembers = await LoanAccount.find({ CUST_ID: { $in: groupLoan.group.members } }, 'CUST_ID ACCT_NM');
  groupLoan = groupLoan.toObject();
  groupLoan.members = populatedMembers;

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
  deleteGroup
};