
// controllers/GroupController.js - Updated Controller with New Fields, Interest Calculation, Weekly/Monthly Support, Repayment Schedule Integration, Loan Utils, and Logging
import Group from '../models/Group.js';
import GroupLoan from '../models/GroupLoan.js';
import LoanAccount from '../models/LoanAccount.js'; // Existing model
import Customer from '../models/Customer.js'; // Customer model
import User from '../models/User.js'; // Assuming User model for creator
import CustomerAccount from '../models/CustomerAccount.js'; // Assuming CustomerAccount model for savings
import GroupSavings from '../models/GroupSavings.js'; // Group savings model
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import { getPrefixForProductType } from '../utils/generateLoanAccountId.js';
import { calculateMaturityDate } from '../utils/loanUtils.js';
import logAuditTrail from '../Services/AuditService.js';
import logger from '../utils/logger.js';


// Create a new group (updated to use CUST_ID strings for members, validate against Customer model)
export const createGroup = async (req, res) => {
  try {
    const { groupCode, groupName, members } = req.body; // members: array of CUST_ID strings
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
      // Find conflicting members
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
    const newGroup = new Group({
      groupCode,
      groupName,
      members,
    });
    const savedGroup = await newGroup.save();
    // Manually populate members for response (fetch Customers by CUST_ID and create CUST_NAME)
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
      req.user.id,
      'CREATE',
      null,
      { groupCode, groupName, memberCount: members.length },
      req.ip,
      'GROUP_CREATION'
    );
    logger.info(`Group created successfully: ${savedGroup._id}`);
    res.status(201).json({
      success: true,
      message: 'Group created successfully.',
      data: responseData,
    });
  } catch (error) {
    logger.error('Error creating group:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating group.',
      error: error.message,
    });
  }
};

// Get all groups, or search by groupName/groupCode, or specific ID
export const getGroups = async (req, res) => {
  try {
    const { id, groupCode, groupName } = req.query; // Optional filters and search terms

    // Build dynamic filter
    const filter = {};

    if (id) {
      filter._id = id;
    } else {
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

    // Return response
    res.status(200).json({
      success: true,
      count: populatedGroups.length,
      data: populatedGroups,
    });
  } catch (error) {
    logger.error('Error fetching groups:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching groups.',
      error: error.message,
    });
  }
};


// Add member to existing group (updated to use CUST_ID string)
export const addMemberToGroup = async (req, res) => {
  try {
    const { groupCode, memberCustId } = req.body; // memberCustId: CUST_ID string
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
    // Validate member exists (check Customer by CUST_ID)
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
      _id: { $ne: group._id } // Exclude current group
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
    // Manually populate members for response (fetch Customers by CUST_ID and create CUST_NAME)
    const populatedMembersData = await Customer.find({ CUST_ID: { $in: group.members } }, 'CUST_ID FIRST_NAME LAST_NAME');
    const populatedMembers = populatedMembersData.map(member => ({
      CUST_ID: member.CUST_ID,
      CUST_NAME: `${member.FIRST_NAME} ${member.LAST_NAME}`.trim()
    }));
    const responseData = {
      ...group.toObject(),
      members: populatedMembers
    };
    // Log audit trail for adding member to group
    await logAuditTrail(
      'Group',
      group._id.toString(),
      req.user.id,
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
  } catch (error) {
    logger.error('Error adding member to group:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding member.',
      error: error.message,
    });
  }
};

// Create group loan application - Updated to include new fields (loanTerm now supports 'weekly', 'monthly', 'yearly')
export const createGroupLoanApplication = async (req, res) => {
  try {
    const {
      groupCode,
      totalAmount, // Loan Amount for group
      primaryRelationshipManager, // User ID
      secondaryRelationshipManager, // Optional User ID
      loanPurpose,
      savingsAccount, // CustomerAccount ID
      interestRate,
      loanTerm, // e.g., 'weekly', 'monthly', 'yearly'
      termValue, // e.g., 52 for weekly, 12 for monthly
      disbursementMethod,
      useSavingsAsCollateral, // New field
      groupSavingsId // New field
    } = req.body;

    if (!groupCode || !totalAmount || totalAmount <= 0 || !primaryRelationshipManager || !loanPurpose || !savingsAccount || !interestRate || !loanTerm || !termValue || !disbursementMethod) {
      return res.status(400).json({
        success: false,
        message: 'Group code, total amount, primary RM, loan purpose, savings account, interest rate, loan term (weekly/monthly/yearly), term value, and disbursement method are required.',
      });
    }

    // Validate loanTerm
    if (!['weekly', 'monthly', 'yearly'].includes(loanTerm)) {
      return res.status(400).json({
        success: false,
        message: 'Loan term must be one of: weekly, monthly, yearly.',
      });
    }

    const group = await Group.findOne({ groupCode });
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found.',
      });
    }

    if (group.memberCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Group must have at least one member.',
      });
    }

    // Validate primary RM
    const primaryRM = await User.findById(primaryRelationshipManager);
    if (!primaryRM) {
      return res.status(404).json({
        success: false,
        message: 'Primary Relationship Manager not found.',
      });
    }

    // Validate secondary RM (optional)
    let secondaryRM = null;
    if (secondaryRelationshipManager) {
      secondaryRM = await User.findById(secondaryRelationshipManager);
      if (!secondaryRM) {
        return res.status(404).json({
          success: false,
          message: 'Secondary Relationship Manager not found.',
        });
      }
    }

    // Validate savings account
    const savings = await CustomerAccount.findById(savingsAccount);
    if (!savings) {
      return res.status(404).json({
        success: false,
        message: 'Savings account not found.',
      });
    }

    // If using savings as collateral, validate group savings
    let groupSavings = null;
    let savingsCollateral = 0;
    
    if (useSavingsAsCollateral && groupSavingsId) {
      groupSavings = await GroupSavings.findOne({
        _id: groupSavingsId,
        groupCode: group.groupCode,
        isActive: true
      });

      if (!groupSavings) {
        return res.status(404).json({
          success: false,
          message: 'Group savings account not found or not active.',
        });
      }

      // Check if savings balance is sufficient as collateral
      const minCollateral = totalAmount * 0.1; // 10% of loan amount as minimum collateral
      if (groupSavings.currentBalance < minCollateral) {
        return res.status(400).json({
          success: false,
          message: `Insufficient savings balance for collateral. Minimum required: ${minCollateral.toLocaleString()}. Current balance: ${groupSavings.currentBalance.toLocaleString()}`,
        });
      }

      // Calculate collateral amount (max 50% of loan amount or actual balance, whichever is lower)
      savingsCollateral = Math.min(groupSavings.currentBalance, totalAmount * 0.5);
      
      // Log collateral hold
      await logAuditTrail(
        'GroupSavings',
        groupSavings._id.toString(),
        req.user.id,
        'COLLATERAL_HOLD',
        { currentBalance: groupSavings.currentBalance },
        { collateralAmount: savingsCollateral, loanAmount: totalAmount },
        req.ip,
        'GROUP_SAVINGS_COLLATERAL_HOLD'
      );
    }

    // Generate individual LoanAccount numbers and create LoanAccount documents for each member
    const individualLoanAccounts = [];
    for (const memberCustId of group.members) {
      try {
        // Generate unique 10-digit LoanAccount number for this member (starting with 310 for GROUP_LOAN)
        const individualLoanAccountNumber = await getLoanAccountNumberForGroupLoan();

        // Create or update LoanAccount for the member (assuming we create new for group loan application)
        const memberCustomer = await Customer.findOne({ CUST_ID: memberCustId });
        if (!memberCustomer) {
          return res.status(404).json({
            success: false,
            message: `Customer not found for member CUST_ID: ${memberCustId}`,
          });
        }

        // Create new LoanAccount linked to group loan (pending status)
        const newIndividualLoanAccount = new LoanAccount({
          CUST_ID: memberCustId,
          ACCT_NM: `${memberCustomer.FIRST_NAME} ${memberCustomer.LAST_NAME}`.trim(),
          ACCT_NO: individualLoanAccountNumber,
          LOAN_STATUS: 'applied', // Pending application status
          groupLoan: null, // Will be set after GroupLoan creation
          loanPurpose,
          interestRate,
          loanTerm,
          termValue,
          disbursementMethod,
          individualShare: totalAmount / group.memberCount,
          totalInterest: (totalAmount / group.memberCount) * (interestRate / 100) * (termValue / 12), // Simple interest calculation
          totalRepayable: (totalAmount / group.memberCount) + ((totalAmount / group.memberCount) * (interestRate / 100) * (termValue / 12)),
          installmentAmount: ((totalAmount / group.memberCount) + ((totalAmount / group.memberCount) * (interestRate / 100) * (termValue / 12))) / termValue,
          numPeriods: termValue,
          ACTUAL_DISBURSEMENT: 0.00, // Initial balance 0.00 until disbursement
          BALANCE: 0.00, // Current balance 0.00
          createdBy: req.user.id,
          // Add other relevant fields as needed
        });

        const savedIndividualLoanAccount = await newIndividualLoanAccount.save();
        individualLoanAccounts.push(savedIndividualLoanAccount._id);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: `Failed to create LoanAccount for member ${memberCustId}: ${error.message}`,
        });
      }
    }

    const newGroupLoan = new GroupLoan({
      group: group._id,
      groupCode: group.groupCode,
      groupName: group.groupName,
      totalAmount,
      memberCount: group.memberCount,
      primaryRelationshipManager,
      secondaryRelationshipManager: secondaryRM ? secondaryRM._id : null,
      loanPurpose,
      savingsAccount,
      interestRate,
      loanTerm,
      termValue,
      disbursementMethod,
      useSavingsAsCollateral: useSavingsAsCollateral || false,
      groupSavings: groupSavings ? groupSavings._id : null,
      savingsCollateral: savingsCollateral,
      individualLoanAccounts, // Array of individual LoanAccount IDs
      createdBy: req.user.id,
    });

    const savedLoan = await newGroupLoan.save();
    
    // Update individual LoanAccounts with group loan reference
    for (const loanAccountId of individualLoanAccounts) {
      await LoanAccount.findByIdAndUpdate(loanAccountId, {
        groupLoan: savedLoan._id
      });
    }

    // Populate the response with related data
    await savedLoan.populate('group', 'groupName memberCount');
    await savedLoan.populate('primaryRelationshipManager', 'name email');
    await savedLoan.populate('secondaryRelationshipManager', 'name email');
    await savedLoan.populate('savingsAccount', 'accountNumber balance');
    await savedLoan.populate('individualLoanAccounts', 'CUST_ID ACCT_NO ACCT_NM LOAN_STATUS');
    
    if (groupSavings) {
      await savedLoan.populate('groupSavings', 'savingsType currentBalance');
    }

    // Log audit trail for group loan application creation
    const auditData = {
      groupCode, 
      totalAmount, 
      loanPurpose, 
      interestRate, 
      loanTerm, 
      termValue,
      useSavingsAsCollateral: useSavingsAsCollateral || false,
      savingsCollateral,
      individualLoanAccounts: individualLoanAccounts.length
    };

    await logAuditTrail(
      'GroupLoan',
      savedLoan._id.toString(),
      req.user.id,
      'CREATE',
      null,
      auditData,
      req.ip,
      'GROUP_LOAN_APPLICATION'
    );

    logger.info(`Group loan application created successfully: ${savedLoan._id} with ${individualLoanAccounts.length} individual accounts and savings collateral: ${savingsCollateral}`);
    
    let message = `Group loan application created successfully. Individual share: ${(totalAmount / group.memberCount).toLocaleString()}. Repayment term: ${termValue} ${loanTerm} periods. ${individualLoanAccounts.length} individual loan accounts created (balance: 0.00 each).`;
    
    if (useSavingsAsCollateral && savingsCollateral > 0) {
      message += ` Group savings collateral: ${savingsCollateral.toLocaleString()}.`;
    }

    res.status(201).json({
      success: true,
      message: message,
      data: savedLoan,
    });
  } catch (error) {
    logger.error('Error creating group loan application:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating group loan.',
      error: error.message,
    });
  }
};

// Helper function to generate Group Loan account number (add this to the file or utils)
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


// Disburse group loan (split and update individual loans) - Updated to support weekly/monthly/yearly interest calc, installment computation, create repayment schedules using loanUtils
// Disburse group loan - Enhanced with detailed member tracking
export const disburseGroupLoan = async (req, res) => {
  try {
    const { groupLoanId } = req.params;
    const groupLoan = await GroupLoan.findById(groupLoanId)
      .populate('group')
      .populate('groupSavings');
      
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

    // Group savings collateral verification (your existing code)
    if (groupLoan.useSavingsAsCollateral && groupLoan.groupSavings) {
      const currentSavingsBalance = groupLoan.groupSavings.currentBalance;
      const minRequiredCollateral = groupLoan.totalAmount * 0.1;
      
      if (currentSavingsBalance < minRequiredCollateral) {
        return res.status(400).json({
          success: false,
          message: `Insufficient group savings balance for collateral. Current balance: ${currentSavingsBalance.toLocaleString()}, Minimum required: ${minRequiredCollateral.toLocaleString()}`,
        });
      }

      const updatedCollateral = Math.min(currentSavingsBalance, groupLoan.totalAmount * 0.5);
      groupLoan.savingsCollateral = updatedCollateral;

      await logAuditTrail(
        'GroupSavings',
        groupLoan.groupSavings._id.toString(),
        req.user.id,
        'COLLATERAL_VERIFIED',
        null,
        { 
          collateralAmount: updatedCollateral, 
          currentBalance: currentSavingsBalance,
          loanAmount: groupLoan.totalAmount 
        },
        req.ip,
        'GROUP_SAVINGS_COLLATERAL_VERIFIED'
      );
    }

    const group = groupLoan.group;
    const individualShare = groupLoan.totalAmount / groupLoan.memberCount;

    // Calculate financials (your existing code)
    let years;
    if (groupLoan.loanTerm === 'weekly') {
      years = groupLoan.termValue / 52;
    } else if (groupLoan.loanTerm === 'monthly') {
      years = groupLoan.termValue / 12;
    } else if (groupLoan.loanTerm === 'yearly') {
      years = groupLoan.termValue;
    } else {
      years = groupLoan.termValue;
    }

    const rate = groupLoan.interestRate / 100;
    const totalInterest = groupLoan.totalAmount * rate * years;
    const totalRepayable = groupLoan.totalAmount + totalInterest;
    const numPeriods = groupLoan.termValue;
    const groupInstallment = totalRepayable / numPeriods;

    // Set calculated fields on group loan
    groupLoan.totalInterest = totalInterest;
    groupLoan.totalRepayable = totalRepayable;
    groupLoan.installmentAmount = groupInstallment;
    groupLoan.numPeriods = numPeriods;

    const startDate = new Date();
    const termCode = groupLoan.loanTerm === 'weekly' ? 'W' : groupLoan.loanTerm === 'monthly' ? 'M' : 'Y';
    const maturityDate = calculateMaturityDate(startDate, groupLoan.termValue, termCode);
    const paymentFrequency = groupLoan.loanTerm === 'weekly' ? 'WEEKLY' : groupLoan.loanTerm === 'monthly' ? 'MONTHLY' : 'YEARLY';

    // Enhanced member tracking
    const disbursementResults = {
      successful: [],
      failed: [],
      skipped: []
    };

    // Get member details for better reporting
    const memberDetails = await Customer.find(
      { CUST_ID: { $in: group.members } },
      'CUST_ID FIRST_NAME LAST_NAME'
    );

    const memberLookup = memberDetails.reduce((acc, member) => {
      acc[member.CUST_ID] = `${member.FIRST_NAME} ${member.LAST_NAME}`.trim();
      return acc;
    }, {});

    for (const memberCustId of group.members) {
      const memberName = memberLookup[memberCustId] || 'Unknown Member';
      
      try {
        const loanAccount = await LoanAccount.findOne({ CUST_ID: memberCustId });
        
        if (!loanAccount) {
          disbursementResults.failed.push({
            custId: memberCustId,
            name: memberName,
            reason: 'Loan account not found',
            individualShare
          });
          continue;
        }

        // Check if loan account is eligible for disbursement
        if (loanAccount.LOAN_STATUS && !['active', 'pending'].includes(loanAccount.LOAN_STATUS)) {
          disbursementResults.skipped.push({
            custId: memberCustId,
            name: memberName,
            reason: `Loan account status is '${loanAccount.LOAN_STATUS}' - not eligible for disbursement`,
            individualShare,
            currentStatus: loanAccount.LOAN_STATUS
          });
          continue;
        }

        // Perform disbursement to this member
        loanAccount.ACTUAL_DISBURSEMENT += individualShare;
        
        // Update group-related fields
        loanAccount.groupLoan = groupLoanId;
        loanAccount.loanPurpose = groupLoan.loanPurpose;
        loanAccount.interestRate = groupLoan.interestRate;
        loanAccount.loanTerm = groupLoan.loanTerm;
        loanAccount.termValue = groupLoan.termValue;
        loanAccount.disbursementMethod = groupLoan.disbursementMethod;
        
        // Set group savings collateral information
        if (groupLoan.useSavingsAsCollateral) {
          loanAccount.groupSavingsCollateral = groupLoan.savingsCollateral / groupLoan.memberCount;
        }

        // Calculate individual financials
        const individualInterest = individualShare * rate * years;
        loanAccount.totalInterest = individualInterest;
        loanAccount.totalRepayable = individualShare + individualInterest;
        const individualInstallment = groupInstallment / groupLoan.memberCount;
        loanAccount.installmentAmount = individualInstallment;
        loanAccount.numPeriods = numPeriods;
     
        // Set status and dates
        loanAccount.LOAN_STATUS = 'disbursed';
        loanAccount.disbursedAt = startDate;
     
        await loanAccount.save();

        // Generate repayment schedule
        const principalAmount = individualShare;
        const totalInterestIndividual = individualInterest;
        const emiIndividual = individualInstallment;
        
        let currentDate = new Date(startDate);
        const installments = [];
        let remainingPrincipal = principalAmount;
        const principalPerInstallment = principalAmount / numPeriods;
        const interestPerInstallment = totalInterestIndividual / numPeriods;
        
        for (let i = 1; i <= numPeriods; i++) {
          if (groupLoan.loanTerm === 'weekly') {
            currentDate.setDate(currentDate.getDate() + 7);
          } else if (groupLoan.loanTerm === 'monthly') {
            currentDate.setMonth(currentDate.getMonth() + 1);
          } else if (groupLoan.loanTerm === 'yearly') {
            currentDate.setFullYear(currentDate.getFullYear() + 1);
          }
          const dueDate = new Date(currentDate);
          const principal = (i === numPeriods ? remainingPrincipal : principalPerInstallment);
          const interest = interestPerInstallment;
          const totalPayment = principal + interest;
          remainingPrincipal -= principal;
          const remainingBalance = Math.max(0, remainingPrincipal);
          installments.push({
            installmentNo: i,
            dueDate,
            principal,
            interest,
            totalPayment,
            remainingBalance,
            status: 'PENDING'
          });
        }

        const emiResult = {
          installments,
          totalInterest: totalInterestIndividual,
          totalRepayment: individualShare + individualInterest,
          emi: emiIndividual
        };

        const loanData = {
          _id: loanAccount._id,
          ACCT_NO: loanAccount.ACCT_NO || loanAccount._id.toString(),
          CUST_ID: loanAccount.CUST_ID,
          START_DT: startDate,
          MATURITY_DT: maturityDate,
          DISBURSEMENT_LIMIT: principalAmount,
          INTEREST_RATE: groupLoan.interestRate,
          TERM_VALUE: groupLoan.termValue,
          TERM_CD: termCode,
          PAYMENT_FREQUENCY: paymentFrequency,
          TRANSACTION_ID: `GRP_DISB_${groupLoan._id}_${loanAccount._id}`,
          EVENT_ID: 'group_loan_disbursement',
          CREATED_BY: req.user.id,
          GROUP_SAVINGS_COLLATERAL: groupLoan.useSavingsAsCollateral ? (groupLoan.savingsCollateral / groupLoan.memberCount) : 0,
          partialUpfrontInterest: false,
          deductUpfrontInterest: false,
          upfrontInterestAmount: 0,
          upfrontInterestPercentage: 0,
          GUARANTOR_ID: null,
          GUARANTEED_AMOUNT: 0,
          GUARANTEED_AMT: 0
        };

        await RepaymentSchedule.createFromEMIResult(emiResult, loanData);

        // Record successful disbursement
        disbursementResults.successful.push({
          custId: memberCustId,
          name: memberName,
          loanAccountId: loanAccount._id,
          individualShare,
          individualInstallment: emiIndividual,
          totalRepayable: individualShare + individualInterest
        });

      } catch (memberError) {
        logger.error(`Error disbursing to member ${memberCustId}:`, memberError);
        disbursementResults.failed.push({
          custId: memberCustId,
          name: memberLookup[memberCustId] || 'Unknown Member',
          reason: memberError.message,
          individualShare
        });
      }
    }

    // Update group loan status based on results
    groupLoan.status = disbursementResults.failed.length === 0 ? 'disbursed' : 'partially_disbursed';
    groupLoan.disbursedAt = startDate;
    groupLoan.disbursedToMembers = disbursementResults.successful.map(m => m.loanAccountId);
    groupLoan.failedDisbursements = disbursementResults.failed.map(m => m.custId);
    groupLoan.skippedDisbursements = disbursementResults.skipped.map(m => m.custId);

    await groupLoan.save();

    // Enhanced audit trail with member details
    await logAuditTrail(
      'GroupLoan',
      groupLoan._id.toString(),
      req.user.id,
      'DISBURSE',
      { status: 'approved' },
      { 
        status: groupLoan.status, 
        successful: disbursementResults.successful.length,
        failed: disbursementResults.failed.length,
        skipped: disbursementResults.skipped.length,
        totalInterest, 
        totalRepayable,
        savingsCollateral: groupLoan.savingsCollateral
      },
      req.ip,
      'GROUP_LOAN_DISBURSEMENT'
    );

    logger.info(`Group loan disbursed: ${groupLoan._id} - Success: ${disbursementResults.successful.length}, Failed: ${disbursementResults.failed.length}, Skipped: ${disbursementResults.skipped.length}`);

    // Enhanced response with detailed member information
    res.status(200).json({
      success: true,
      message: `Group loan disbursement completed. Successful: ${disbursementResults.successful.length}, Failed: ${disbursementResults.failed.length}, Skipped: ${disbursementResults.skipped.length}`,
      data: {
        groupLoan: {
          ...groupLoan.toObject(),
          individualShare,
          totalInterest,
          totalRepayable,
          groupInstallment
        },
        disbursementDetails: {
          summary: {
            totalMembers: group.members.length,
            successful: disbursementResults.successful.length,
            failed: disbursementResults.failed.length,
            skipped: disbursementResults.skipped.length
          },
          successfulMembers: disbursementResults.successful,
          failedMembers: disbursementResults.failed,
          skippedMembers: disbursementResults.skipped
        },
        financialSummary: {
          individualShare,
          individualInstallment: groupInstallment / groupLoan.memberCount,
          totalInterest,
          totalRepayable,
          groupInstallment,
          savingsCollateral: groupLoan.savingsCollateral
        }
      },
    });
  } catch (error) {
    logger.error('Error disbursing group loan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during disbursement.',
      error: error.message,
    });
  }
};

// Repay group loan (split repayment across members) - Updated to support weekly/monthly repayment schedules and update individual repayment schedules
export const repayGroupLoan = async (req, res) => {
  try {
    const { groupLoanId } = req.params;
    const { totalRepayAmount, isInstallment } = req.body; // isInstallment: optional flag to validate against installment amount
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
      if (Math.abs(totalRepayAmount - groupLoan.installmentAmount) > 0.01) { // Allow small floating point differences
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
    for (const memberCustId of group.members) {
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
    groupLoan.repaidToMembers = [...(groupLoan.repaidToMembers || []), ...repaidMembers]; // Track all repaid instances
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
  } catch (error) {
    logger.error('Error repaying group loan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during repayment.',
      error: error.message,
    });
  }
};

// Get group loan by ID - Updated populate to include installment fields
export const getGroupLoan = async (req, res) => {
  try {
    const { groupLoanId } = req.params;
    let groupLoan = await GroupLoan.findById(groupLoanId)
      .populate('group', 'groupName memberCount')
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
  } catch (error) {
    logger.error('Error fetching group loan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching group loan.',
      error: error.message,
    });
  }
};