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
import asyncHandler from 'express-async-handler'; // Added missing import for asyncHandler
import SavingsProduct from '../models/SavingsProduct.js';
import AuditTrail from '../models/AuditTrail.js';



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

    // ✅ VALIDATION - FIXED: Check all required fields early
    if (!groupCode || !savingsType || targetAmount == null || minimumContribution == null) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Required: groupCode, savingsType, targetAmount, minimumContribution.',
      });
    }

    // Validate savings type
    const validSavingsTypes = ['union_purse', 'emergency_fund', 'project_fund', 'general_savings', 'project_savings'];
    if (!validSavingsTypes.includes(savingsType)) {
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
      normalizedFrequency = contributionFrequency.toLowerCase().trim();
      if (!validFrequencies.includes(normalizedFrequency)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Invalid contribution frequency. Must be one of: ${validFrequencies.join(', ')}`,
        });
      }
    }

    // ✅ VALIDATE GROUP EXISTS
    const group = await Group.findOne({ groupCode }).session(session);
    if (!group) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Group not found.',
      });
    }

    // ✅ CHECK FOR EXISTING SAVINGS
    const existingSavings = await GroupSavings.findOne({
      groupCode,
      savingsType,
      status: 'active'
    }).session(session);
    
    if (existingSavings) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Group already has an active ${savingsType} savings account.`,
      });
    }

    // ✅ VALIDATE MANAGERS
    let finalManagedBy = managedBy;
    if (finalManagedBy && Array.isArray(finalManagedBy) && finalManagedBy.length > 0) {
      // Filter out invalid managers and dedupe
      finalManagedBy = [...new Set(finalManagedBy.filter(custId => group.members.includes(custId)))];
      if (finalManagedBy.length === 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'At least one valid manager from group members is required.',
        });
      }
    } else {
      // Default to all unique group members as managers
      finalManagedBy = [...new Set(group.members)];
      if (finalManagedBy.length === 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Group must have at least one member to assign as manager.',
        });
      }
    }

    // ✅ GENERATE ACCOUNT NUMBER - FIXED: Check uniqueness in BOTH GroupSavings & CustomerAccount
    let accountNumber;
    try {
      let attempts = 0;
      while (attempts < 5) {  // Increased retries for dual checks
        const accountResult = await generateAccountNumber('ACCT_SAVINGS');
        accountNumber = accountResult.formattedString;
        
        // Check uniqueness in GroupSavings
        const existingGS = await GroupSavings.findOne({ accountNumber }).session(session);
        // Check uniqueness in CustomerAccount
        const existingCA = await CustomerAccount.findOne({ account_number: accountNumber }).session(session);
        
        if (!existingGS && !existingCA) {
          break;  // Unique in both
        }
        attempts++;
        console.log(`⚠️ Account number ${accountNumber} duplicate in GS/CA, retrying... (attempt ${attempts})`);
      }
      if (attempts >= 5) {
        throw new Error('Failed to generate unique account number after 5 attempts across collections');
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

    // ✅ CREATE OR FIND SAVINGS PRODUCT - FIXED: Correct default query (keep underscore)
    let savingsProduct;
    try {
      console.log('🔍 Finding/Creating SavingsProduct for group savings...');
      
      // First, try to find an existing active product for the savingsType - FIXED: Use toUpperCase() only
      const defaultProductCode = savingsType.toUpperCase();  // "UNION_PURSE" (keeps underscore)
      savingsProduct = await SavingsProduct.findByProductCode(defaultProductCode);
      if (!savingsProduct || !savingsProduct.isActive()) {
        console.log(`📝 No active default product found for "${defaultProductCode}", creating group-specific one...`);
        
        // Generate a valid PROD_ID with extra validation
        let PROD_ID = await SavingsProduct.getNextProdId();
        // Force validation and fallback
        if (!Number.isInteger(PROD_ID) || PROD_ID <= 0 || isNaN(PROD_ID)) {
          console.warn(`⚠️ Invalid PROD_ID from getNextProdId: ${PROD_ID}, using fallback`);
          PROD_ID = await SavingsProduct.getNextProdId();  // Retry once
        }
        const productCode = `GRP_${groupCode}_${savingsType.toUpperCase()}`;
        
        console.log(`✅ Validated PROD_ID: ${PROD_ID}, Product Code: ${productCode}`);

        const savingsProductData = {
          PROD_ID: Number(PROD_ID),  // Ensure it's a clean Number
          productCode: productCode,
          productName: `Group Savings - ${group.groupName} - ${savingsType.replace('_', ' ')}`,
          productDescription: `Group savings account for ${group.groupName} - ${savingsType.replace('_', ' ')}`,
          productType: 'SAVINGS',
          CRNCY_ID: 'NGN',
          BU_ID: ['001'],
          REC_ST: 'A',
          CREATED_BY: req.user?.id?.toString() || 'system',
          // Financial configuration
          interestRate: mongoose.Types.Decimal128.fromString("0.00"),
          minimumBalance: mongoose.Types.Decimal128.fromString(String(minimumContribution || 0)),
          // Legacy fields for compatibility
          PROD_CD: productCode,
          PROD_DESC: `Group savings account for ${group.groupName}`,
          PRODUCT_TYPE: 'SAVINGS'
        };

        savingsProduct = new SavingsProduct(savingsProductData);
        await savingsProduct.save({ session });
        console.log('✅ Group-specific SavingsProduct created successfully with PROD_ID:', savingsProduct.PROD_ID);
      } else {
        console.log('✅ Using existing default SavingsProduct:', savingsProduct.productCode, '(PROD_ID:', savingsProduct.PROD_ID, ')');
      }
    } catch (productError) {
      console.error('❌ Error handling SavingsProduct:', productError);
      await session.abortTransaction();
      return res.status(400).json({  // Downgraded to 400 for product issues
        success: false,
        message: `No active product found or created for ${savingsType}. Check logs: ${productError.message}`,
      });
    }

    // ✅ HANDLE createdBy PROPERLY
    let createdById;
    try {
      if (req.user && req.user.id && mongoose.Types.ObjectId.isValid(req.user.id)) {
        createdById = new mongoose.Types.ObjectId(req.user.id);
      } else {
        console.warn('Invalid or missing user ID for createdBy, using system default');
        createdById = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'); // Replace with actual system ID
      }
    } catch (error) {
      console.warn('Error processing createdBy, using system default:', error);
      createdById = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
    }

    // ✅ CREATE GROUP SAVINGS ACCOUNT WITH UPDATED MODEL
    const newGroupSavings = new GroupSavings({
      // Group identification
      group: group._id,
      groupCode,
      groupName: group.groupName,
      
      // Savings configuration
      savingsType,
      accountNumber,
      
      // Financial fields
      targetAmount: mongoose.Types.Decimal128.fromString(String(targetAmount)),
      minimumContribution: mongoose.Types.Decimal128.fromString(String(minimumContribution)),
      
      // Balance fields (using Decimal128)
      LEDGER_BAL: mongoose.Types.Decimal128.fromString('0.00'),
      CLEARED_BAL: mongoose.Types.Decimal128.fromString('0.00'),
      AVAILABLE_BALANCE: mongoose.Types.Decimal128.fromString('0.00'),
      currentBalance: 0, // Backward compatibility
      
      // Contribution settings
      contributionFrequency: normalizedFrequency,
      
      // Management
      managedBy: finalManagedBy,
      members: [...new Set(group.members)], // Dedupe all group members
      
      // Withdrawal rules
      withdrawalRules: {
        minWithdrawal: mongoose.Types.Decimal128.fromString(String(withdrawalRules?.minWithdrawal || 0)),
        maxWithdrawal: mongoose.Types.Decimal128.fromString(String(withdrawalRules?.maxWithdrawal || 0)),
        approvalRequired: withdrawalRules?.approvalRequired !== false,
        minApprovers: Math.max(1, Number(withdrawalRules?.minApprovers || 1)),
        withdrawalFrequency: withdrawalRules?.withdrawalFrequency || 'anytime'
      },
      
      // Product linking
      linkedProductId: Number(savingsProduct.PROD_ID),
      linkedProductCode: savingsProduct.productCode,
      
      // Status and audit
      status: 'active',
      isActive: true,
      createdBy: createdById
    });

    const savedSavings = await newGroupSavings.save({ session });

    // ✅ CREATE CORRESPONDING CUSTOMER ACCOUNT
    const numericGroupCode = groupCode.replace(/^GRP/i, '');
    const groupCustId = numericGroupCode && !isNaN(numericGroupCode) ? Number(numericGroupCode) : 99999;

    const groupCustomerAccount = new CustomerAccount({
      account_number: accountNumber,
      customer_id: groupCustId,
      branch: 1,
      product: savingsProduct.PROD_CD || savingsProduct.productCode,  // Dynamic from product
      product_type: 'savings',
      primary_relationship_manager: 1,
      ACCT_NO: accountNumber,  // ✅ FIXED: Autogenerated via unique accountNumber (no separate gen needed)
      ACCT_ID: accountNumber.slice(-6),
      ACCT_NM: `${group.groupName} - ${savingsType.replace('_', ' ').toUpperCase()}`,
      CUST_ID: groupCustId,
      BU_ID: '001',
      ACCOUNT_TYPE: 'SAVINGS',
      PRODUCT_DESC: `Group Savings - ${savingsType.replace('_', ' ')}`,
      REC_ST: 'ACTIVE',
      LEDGER_BAL: mongoose.Types.Decimal128.fromString('0.00'),
      CLEARED_BAL: mongoose.Types.Decimal128.fromString('0.00'),
      AVAILABLE_BALANCE: mongoose.Types.Decimal128.fromString('0.00'),
      cleared_balance: 0,
      ledger_balance: 0,
      INTEREST_RATE: mongoose.Types.Decimal128.fromString('0.00'),
      INTEREST_GL_ACCT_NO: '1-01-001-001-001-1',
      ACCRUED_INTEREST: mongoose.Types.Decimal128.fromString('0.00'),
      DR_ALLOWED: true,
      CR_ALLOWED: true,
      lastActivityDate: new Date(),
      status: 'Active',
      substatus: 'Active',
      creation_date: new Date(),
      last_updated: new Date(),
      isGroupAccount: true,
      groupSavingsId: savedSavings._id,
      linkedProductId: Number(savingsProduct.PROD_ID),
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

    // Link back
    savedSavings.customerAccount = savedCustomerAccount._id;
    await savedSavings.save({ session });

    // ✅ AUDIT TRAILS (unchanged)
    await logAuditTrail(
      'GroupSavings',
      savedSavings._id.toString(),
      req.user?.id?.toString() || 'system',
      'CREATE',
      null,
      { 
        groupCode, 
        savingsType, 
        accountNumber,
        targetAmount, 
        managedBy: finalManagedBy,
        customerAccountId: savedCustomerAccount._id,
        savingsProductId: savingsProduct.PROD_ID
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
      description: `Created group savings account for ${group.groupName} - ${savingsType}`,
    }], { session });

    // ✅ COMMIT TRANSACTION
    await session.commitTransaction();

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
        savingsProduct: {
          PROD_ID: savingsProduct.PROD_ID,
          productCode: savingsProduct.productCode,
          productName: savingsProduct.productName
        }
      },
    });
  } catch (error) {
    await session.abortTransaction();
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
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

/**
 * Sync GroupSavings balance to CustomerAccount
 */
export const syncGroupSavingsBalance = async (groupSavingsId, session = null) => {
  try {
    const groupSavings = await GroupSavings.findById(groupSavingsId).session(session);
    if (!groupSavings || !groupSavings.customerAccount) {
      throw new Error('Group savings or linked customer account not found');
    }

    const customerAccount = await CustomerAccount.findById(groupSavings.customerAccount).session(session);
    if (!customerAccount) {
      throw new Error('Linked customer account not found');
    }

    // Convert Decimal128 to numbers for comparison
    const groupLedgerBal = parseFloat(groupSavings.LEDGER_BAL.toString());
    const customerLedgerBal = parseFloat(customerAccount.LEDGER_BAL.toString());

    if (groupLedgerBal !== customerLedgerBal) {
      // Update CustomerAccount balances to match GroupSavings
      customerAccount.LEDGER_BAL = groupSavings.LEDGER_BAL;
      customerAccount.CLEARED_BAL = groupSavings.CLEARED_BAL;
      customerAccount.AVAILABLE_BALANCE = groupSavings.AVAILABLE_BALANCE;
      customerAccount.lastActivityDate = new Date();

      await customerAccount.save({ session });
      
      logger.info(`Synced balances for group savings ${groupSavingsId} to customer account ${customerAccount.ACCT_NO}`);
    }

    return customerAccount;
  } catch (error) {
    logger.error('Error syncing group savings balance:', error);
    throw error;
  }
};

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

// In controllers/GroupSavingsController.js - FIXED addContribution
// In controllers/GroupSavingsController.js - UPDATED addContribution
export const addContribution = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { groupSavingsId } = req.params;
    const { customerId, amount, paymentMethod, transactionReference } = req.body;

    // Find group savings
    const groupSavings = await GroupSavings.findById(groupSavingsId).session(session);
    if (!groupSavings) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Group savings account not found.',
      });
    }

    // Validate customer is group member
    const group = await Group.findById(groupSavings.group).session(session);
    if (!group.members.includes(customerId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Customer is not a member of this group.',
      });
    }

    // Create contribution record
    const contribution = new GroupSavingsContribution({
      groupSavings: groupSavingsId,
      customer: customerId,
      amount,
      paymentMethod,
      transactionReference,
      contributionDate: new Date(),
      status: 'completed'
    });

    await contribution.save({ session });

    // Update GroupSavings balances
    const currentLedger = parseFloat(groupSavings.LEDGER_BAL.toString());
    const newLedger = currentLedger + parseFloat(amount);
    
    groupSavings.LEDGER_BAL = mongoose.Types.Decimal128.fromString(newLedger.toFixed(2));
    groupSavings.CLEARED_BAL = mongoose.Types.Decimal128.fromString(newLedger.toFixed(2));
    groupSavings.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(newLedger.toFixed(2));
    groupSavings.currentBalance = newLedger;
    groupSavings.lastContributionDate = new Date();

    await groupSavings.save({ session });

    // Sync to CustomerAccount
    await syncGroupSavingsBalance(groupSavingsId, session);

    // Create transaction record
    await createGroupSavingsTransaction({
      accountNumber: groupSavings.accountNumber,
      amount: parseFloat(amount),
      type: 'CREDIT',
      description: `Group savings contribution - ${paymentMethod}`,
      reference: transactionReference,
      customerId: customerId,
      session
    });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: 'Contribution added successfully.',
      data: contribution,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error adding contribution:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding contribution.',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
});

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