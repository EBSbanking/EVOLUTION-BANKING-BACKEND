// controllers/GroupSavingsController.js - CORRECTED VERSION
import GroupSavings from '../models/GroupSavings.js';
import GroupSavingsContribution from '../models/GroupSavingsContribution.js';
import GroupSavingsWithdrawal from '../models/GroupSavingsWithdrawal.js';
import Group from '../models/Group.js';
import Customer from '../models/Customer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Transaction from '../models/Transaction.js'; // Added missing import
import { generateAccountNumber } from '../utils/generateAccountNumber.js';
import logAuditTrail from '../Services/AuditService.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';
// In controllers/GroupSavingsController.js - UPDATED addContribution
import { createGroupSavingsTransaction } from '../utils/transactionHelper.js';

// Create group savings account with account number generation
export const createGroupSavings = async (req, res) => {
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

    if (!groupCode || !savingsType) {
      return res.status(400).json({
        success: false,
        message: 'Group code and savings type are required.',
      });
    }

    // Validate savings type
    const validSavingsTypes = ['union_purse', 'emergency_fund', 'project_fund', 'general_savings'];
    if (!validSavingsTypes.includes(savingsType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid savings type. Must be one of: ${validSavingsTypes.join(', ')}`,
      });
    }

    // Validate group exists
    const group = await Group.findOne({ groupCode });
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found.',
      });
    }

    // Check if group already has active savings of this type
    const existingSavings = await GroupSavings.findOne({
      groupCode,
      savingsType,
      isActive: true
    });
    if (existingSavings) {
      return res.status(400).json({
        success: false,
        message: `Group already has an active ${savingsType} savings account.`,
      });
    }

    // Validate managers are group members
    let finalManagedBy = managedBy;
    if (finalManagedBy && finalManagedBy.length > 0) {
      const invalidManagers = finalManagedBy.filter(custId => !group.members.includes(custId));
      if (invalidManagers.length > 0) {
        return res.status(400).json({
          success: false,
          message: `The following managers are not group members: ${invalidManagers.join(', ')}`,
        });
      }
    } else {
      // Default to all group members as managers
      finalManagedBy = group.members;
    }

    // Generate account number for group savings
    let accountNumber;
    try {
      const accountResult = await generateAccountNumber('ACCT_SAVINGS');
      accountNumber = accountResult.formattedString;
      
      // Verify the account number is unique
      const existingAccount = await GroupSavings.findOne({ accountNumber });
      if (existingAccount) {
        // Retry with next sequence
        const retryResult = await generateAccountNumber('ACCT_SAVINGS');
        accountNumber = retryResult.formattedString;
      }
    } catch (accountError) {
      logger.error('Error generating account number:', accountError);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate account number for group savings.',
        error: accountError.message,
      });
    }

    const newGroupSavings = new GroupSavings({
      group: group._id,
      groupCode,
      groupName: group.groupName,
      savingsType,
      accountNumber,
      targetAmount: targetAmount || 0,
      currentBalance: 0,
      minimumContribution: minimumContribution || 0,
      contributionFrequency: contributionFrequency || 'monthly',
      managedBy: finalManagedBy,
      withdrawalRules: withdrawalRules || {
        minWithdrawal: 0,
        maxWithdrawal: 0,
        approvalRequired: true,
        minApprovers: 1
      },
      // Initialize all balance fields correctly
      LEDGER_BAL: mongoose.Types.Decimal128.fromString('0.00'),
      CLEARED_BAL: mongoose.Types.Decimal128.fromString('0.00'),
      AVAILABLE_BALANCE: mongoose.Types.Decimal128.fromString('0.00'),
      createdBy: req.user.id
    });

    const savedSavings = await newGroupSavings.save();

    // Log audit trail
    await logAuditTrail(
      'GroupSavings',
      savedSavings._id.toString(),
      req.user.id,
      'CREATE',
      null,
      { 
        groupCode, 
        savingsType, 
        accountNumber,
        targetAmount, 
        managedBy: finalManagedBy 
      },
      req.ip,
      'GROUP_SAVINGS_CREATED'
    );

    logger.info(`Group savings created successfully: ${savedSavings._id} with account number: ${accountNumber}`);
    
    res.status(201).json({
      success: true,
      message: 'Group savings account created successfully.',
      data: savedSavings,
    });
  } catch (error) {
    logger.error('Error creating group savings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating group savings.',
      error: error.message,
    });
  }
};


// In controllers/GroupSavingsController.js - FIXED addContribution
export const addContribution = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const {
      accountNumber,
      memberCustId,
      amount,
      contributionType,
      period,
      notes
    } = req.body;

    console.log('Request body:', req.body);

    if (!accountNumber || !memberCustId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Group savings account number, member CUST_ID and valid amount are required.',
      });
    }

    // Start transaction
    session.startTransaction();

    // Find group savings by account number WITH session for consistency
    const groupSavings = await GroupSavings.findOne({ 
      accountNumber: accountNumber 
    }).session(session);
    
    console.log('Found group savings:', groupSavings);
    
    if (!groupSavings) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }

    // Validate member belongs to group
    const group = await Group.findById(groupSavings.group).session(session);
    console.log('Group members:', group?.members);
    
    if (!group) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Group not found for this savings account.',
      });
    }

    if (!group.members.includes(memberCustId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Member does not belong to this group.',
      });
    }

    // Check minimum contribution
    const minimumContribution = groupSavings.minimumContribution || 0;
    if (amount < minimumContribution && minimumContribution > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Contribution amount must be at least ${minimumContribution}.`,
      });
    }

    // Get current user info
    const currentUser = req.user;

    // Initialize balance fields if they don't exist
    const oldLedgerBal = groupSavings.LEDGER_BAL ? parseFloat(groupSavings.LEDGER_BAL.toString()) : 0;
    const oldClearedBal = groupSavings.CLEARED_BAL ? parseFloat(groupSavings.CLEARED_BAL.toString()) : 0;
    const oldAvailableBalance = groupSavings.AVAILABLE_BALANCE ? parseFloat(groupSavings.AVAILABLE_BALANCE.toString()) : 0;
    const oldCurrentBalance = groupSavings.currentBalance || 0;

    console.log('Old balances:', {
      LEDGER_BAL: oldLedgerBal,
      CLEARED_BAL: oldClearedBal,
      AVAILABLE_BALANCE: oldAvailableBalance,
      currentBalance: oldCurrentBalance
    });

    // Calculate new balances
    const newLedgerBal = oldLedgerBal + amount;
    const newClearedBal = oldClearedBal + amount;
    const newAvailableBalance = oldAvailableBalance + amount;
    const newCurrentBalance = oldCurrentBalance + amount;

    // Update all balance fields (cash deposit affects all balances immediately)
    groupSavings.LEDGER_BAL = mongoose.Types.Decimal128.fromString(newLedgerBal.toFixed(2));
    groupSavings.CLEARED_BAL = mongoose.Types.Decimal128.fromString(newClearedBal.toFixed(2));
    groupSavings.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(newAvailableBalance.toFixed(2));
    groupSavings.currentBalance = newCurrentBalance;
    
    await groupSavings.save({ session });

    // Create contribution record
    const contribution = new GroupSavingsContribution({
      groupSavings: groupSavings._id,
      memberCustId,
      amount,
      contributionType: contributionType || 'regular',
      period: period || new Date().toISOString().slice(0, 7),
      collectedBy: currentUser.custId || currentUser.id,
      notes,
      reference: `GSC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'completed'
    });
    await contribution.save({ session });

    // Create transaction record using the helper function
    const groupTransaction = await createGroupSavingsTransaction({
      groupSavings,
      memberCustId,
      amount,
      transactionType: 'CREDIT',
      description: `Cash contribution from member ${memberCustId} - ${contributionType || 'regular'}`,
      reference: contribution.reference,
      balanceAfter: newAvailableBalance,
      ledgerBalanceAfter: newLedgerBal,
      clearedBalanceAfter: newClearedBal,
      createdBy: currentUser.id,
      contributionId: contribution._id
    }, session);

    await session.commitTransaction();

    // Log audit trail
    await logAuditTrail(
      'GroupSavings',
      groupSavings._id.toString(),
      currentUser.id,
      'CASH_CONTRIBUTION',
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
        amount: amount, 
        memberCustId,
        accountNumber: groupSavings.accountNumber,
        contributionType: contributionType || 'regular'
      },
      req.ip,
      'GROUP_SAVINGS_CASH_CONTRIBUTION'
    );

    logger.info(`Cash contribution added: ${memberCustId} -> ${groupSavings.accountNumber}, Amount: ${amount}, LEDGER_BAL: ${newLedgerBal}, CLEARED_BAL: ${newClearedBal}, AVAILABLE_BALANCE: ${newAvailableBalance}`);

    res.status(200).json({
      success: true,
      message: 'Cash contribution added successfully.',
      data: {
        contribution: {
          _id: contribution._id,
          memberCustId: contribution.memberCustId,
          amount: contribution.amount,
          contributionType: contribution.contributionType,
          period: contribution.period,
          notes: contribution.notes,
          reference: contribution.reference,
          contributionDate: contribution.contributionDate
        },
        groupSavings: {
          accountNumber: groupSavings.accountNumber,
          accountName: groupSavings.groupName,
          savingsType: groupSavings.savingsType,
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
        },
        transaction: {
          reference: groupTransaction.reference,
          type: 'CASH_DEPOSIT',
          amount: amount,
          transactionId: groupTransaction._id
        }
      },
    });

  } catch (error) {
    await session.abortTransaction();
    logger.error('Error adding cash contribution to group savings:', error);
    
    // More detailed error logging
    console.error('Detailed error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to add cash contribution.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  } finally {
    session.endSession();
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
export const getGroupSavings = async (req, res) => {
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

// Get all group savings accounts (for admin purposes)
export const getAllGroupSavings = async (req, res) => {
  try {
    const { page = 1, limit = 10, groupCode, savingsType, isActive } = req.query;

    const filter = {};
    if (groupCode) filter.groupCode = groupCode;
    if (savingsType) filter.savingsType = savingsType;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const groupSavings = await GroupSavings.find(filter)
      .populate('group', 'groupName groupCode')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await GroupSavings.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: groupSavings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching all group savings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching group savings.',
      error: error.message,
    });
  }
};