// src/Services/autoCollectionService.js
import LoanAccount from '../models/LoanAccount.js';
import GroupLoan from '../models/GroupLoan.js'; // Added GroupLoan import
import CustomerAccount from '../models/CustomerAccount.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

/**
 * Enhanced auto-collection service that handles both individual AND group loans
 * This service runs during EOD to check for due payments and auto-debit from customer accounts
 */
export const processAutoCollections = async () => {
  try {
    logger.info('💰 Processing auto-collections for due loans (individual + group)...');
    
    const currentDate = new Date();
    let results = {
      individual: {
        processed: 0,
        overdueMarked: 0,
        failed: 0,
        totalDue: 0
      },
      group: {
        processed: 0,
        overdueMarked: 0,
        failed: 0,
        totalDue: 0,
        membersProcessed: 0,
        membersFailed: 0
      }
    };

    // ==================== PROCESS INDIVIDUAL LOANS ====================
    const dueIndividualLoans = await LoanAccount.find({
      LOAN_STATUS: 'ACTIVE',
      NEXT_PAYMENT_DATE: { 
        $lt: currentDate,
        $ne: null,
        $exists: true
      },
      // Exclude group loan accounts (they'll be handled separately)
      PRODUCT_TYPE: { $ne: 'GROUP_LOAN' },
      lastAutoCollectionAttempt: { 
        $ne: new Date().toISOString().split('T')[0] 
      }
    }).populate('CUST_ID');

    results.individual.totalDue = dueIndividualLoans.length;
    logger.info(`📊 Found ${dueIndividualLoans.length} individual loans with due payments`);

    for (const loan of dueIndividualLoans) {
      try {
        const collectionResult = await processIndividualLoanCollection(loan, currentDate);
        
        if (collectionResult.success) {
          results.individual.processed++;
        } else if (collectionResult.markedOverdue) {
          results.individual.overdueMarked++;
          results.individual.failed++;
        } else {
          results.individual.failed++;
        }
      } catch (error) {
        logger.error(`❌ Error processing individual loan ${loan.ACCT_NO}:`, { error: error.message });
        results.individual.failed++;
      }
    }

    // ==================== PROCESS GROUP LOANS ====================
    const dueGroupLoans = await GroupLoan.find({
      status: { $in: ['active', 'disbursed', 'partially_disbursed'] },
      // Find groups with due payments (simplified logic - adjust based on your business rules)
      $or: [
        { lastCollectionDate: { $lt: new Date(currentDate.setDate(currentDate.getDate() - 30)) } }, // Over 30 days since last collection
        { lastCollectionDate: { $exists: false } }, // Never collected
        { 'collectionProgress.percentage': { $lt: 90 } } // Behind on collections
      ]
    }).populate('individualLoanAccounts');

    results.group.totalDue = dueGroupLoans.length;
    logger.info(`📊 Found ${dueGroupLoans.length} group loans with due payments`);

    for (const groupLoan of dueGroupLoans) {
      try {
        const collectionResult = await processGroupLoanCollection(groupLoan, currentDate);
        
        if (collectionResult.success) {
          results.group.processed++;
          results.group.membersProcessed += collectionResult.membersProcessed || 0;
          results.group.membersFailed += collectionResult.membersFailed || 0;
        } else {
          results.group.failed++;
        }
      } catch (error) {
        logger.error(`❌ Error processing group loan ${groupLoan.loanId}:`, { error: error.message });
        results.group.failed++;
      }
    }

    logger.info('✅ Auto-collections processing completed', { results });

    return {
      success: true,
      results,
      summary: {
        totalProcessed: results.individual.processed + results.group.processed,
        totalOverdueMarked: results.individual.overdueMarked,
        totalFailed: results.individual.failed + results.group.failed,
        totalDueLoans: results.individual.totalDue + results.group.totalDue
      }
    };

  } catch (error) {
    logger.error('❌ Failed to process auto-collections', { error: error.message });
    throw error;
  }
};

/**
 * Process collection for individual loan (existing logic)
 */
const processIndividualLoanCollection = async (loan, currentDate) => {
  try {
    // Check if manual payment was made
    const hasManualPayment = await checkManualPayment(loan, currentDate);
    
    if (hasManualPayment) {
      logger.info(`✅ Manual payment detected for loan ${loan.ACCT_NO}, skipping auto-collection`);
      return { success: true, skipped: true };
    }

    // Calculate due amount
    const dueAmount = await calculateDueAmount(loan);
    
    if (dueAmount <= 0) {
      logger.info(`💰 Loan ${loan.ACCT_NO} has no due amount, skipping`);
      return { success: true, skipped: true };
    }

    // Try auto-collection from customer account
    const collectionResult = await attemptAutoCollectionFromCustomerAccount(loan, dueAmount, currentDate);
    
    if (collectionResult.success) {
      logger.info(`✅ Auto-collection successful for loan ${loan.ACCT_NO}`, {
        amount: collectionResult.amount,
        customerAccount: collectionResult.customerAccount,
        transactionId: collectionResult.transactionId
      });
      
      return { success: true, amount: collectionResult.amount };
    } else {
      // Mark as overdue if auto-collection failed
      await markLoanAsOverdue(loan, currentDate, collectionResult.reason);
      
      logger.info(`⚠️ Auto-collection failed, marked as overdue: ${loan.ACCT_NO}`, {
        reason: collectionResult.reason,
        dueAmount: dueAmount
      });
      
      return { success: false, markedOverdue: true, reason: collectionResult.reason };
    }

  } catch (error) {
    logger.error(`❌ Error in individual loan collection for ${loan.ACCT_NO}:`, { error: error.message });
    return { success: false, error: error.message };
  }
};

/**
 * NEW: Process collection for group loan
 */
const processGroupLoanCollection = async (groupLoan, currentDate) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    logger.info(`👥 Processing auto-collection for group loan: ${groupLoan.loanId}`, {
      groupName: groupLoan.groupName,
      memberCount: groupLoan.memberCount
    });

    const collectionData = {
      collectionDate: currentDate,
      collectedBy: 'system-auto',
      loanCollections: [],
      savingsCollections: [],
      successfulCollections: 0,
      failedCollections: 0,
      savingsProcessed: 0,
      totalLoanCollected: 0,
      totalSavingsCollected: 0,
      repaymentSchedulesUpdated: 0,
      paymentMethod: 'AUTO_DEBIT',
      transactionReference: `GROUP_AUTO_${groupLoan.loanId}_${Date.now()}`
    };

    let membersProcessed = 0;
    let membersFailed = 0;

    // Process each member's loan in the group
    for (const member of groupLoan.members) {
      try {
        const memberLoan = await LoanAccount.findOne({
          _id: { $in: groupLoan.individualLoanAccounts },
          CUST_ID: member.memberId,
          LOAN_STATUS: 'ACTIVE'
        }).session(session);

        if (!memberLoan) {
          logger.warn(`⚠️ Member loan not found for ${member.memberId} in group ${groupLoan.loanId}`);
          continue;
        }

        // Check if member payment is due
        const dueAmount = await calculateDueAmount(memberLoan);
        if (dueAmount <= 0) {
          continue; // Skip if no due amount
        }

        // Attempt collection from member's account
        const collectionResult = await attemptAutoCollectionFromCustomerAccount(memberLoan, dueAmount, currentDate, session);
        
        if (collectionResult.success) {
          collectionData.loanCollections.push({
            accountNo: memberLoan.ACCT_NO,
            amount: dueAmount,
            receiptNo: `AUTO_${memberLoan.ACCT_NO}_${Date.now()}`,
            installmentNo: (memberLoan.installmentsPaid || 0) + 1
          });
          
          collectionData.successfulCollections++;
          collectionData.totalLoanCollected += dueAmount;
          membersProcessed++;

          // Mark member as repaid if loan is fully paid
          if (parseFloat(memberLoan.OUTSTANDING_PRINCIPAL?.toString() || '0') <= 0) {
            await groupLoan.markMemberAsRepaid(memberLoan._id);
          }

          logger.info(`✅ Auto-collection successful for group member ${member.memberId}`, {
            loanAccount: memberLoan.ACCT_NO,
            amount: dueAmount,
            groupLoanId: groupLoan.loanId
          });

        } else {
          collectionData.failedCollections++;
          membersFailed++;
          
          // Mark member loan as overdue
          await markLoanAsOverdue(memberLoan, currentDate, collectionResult.reason);
          
          logger.warn(`⚠️ Auto-collection failed for group member ${member.memberId}`, {
            reason: collectionResult.reason,
            groupLoanId: groupLoan.loanId
          });
        }

      } catch (memberError) {
        logger.error(`❌ Error processing group member ${member.memberId}:`, { error: memberError.message });
        collectionData.failedCollections++;
        membersFailed++;
      }
    }

    // Process group savings if applicable
    if (groupLoan.groupSavings) {
      const savingsResult = await processGroupSavingsCollection(groupLoan, currentDate, session);
      if (savingsResult.processed) {
        collectionData.savingsCollections = savingsResult.collections;
        collectionData.savingsProcessed = savingsResult.count;
        collectionData.totalSavingsCollected = savingsResult.amount;
      }
    }

    // Add collection record to group loan history
    await groupLoan.addCollectionRecord(collectionData);

    // Update group loan totals
    await groupLoan.updateCollectionTotals(
      collectionData.totalLoanCollected,
      collectionData.totalSavingsCollected
    );

    // Commit transaction
    await session.commitTransaction();
    
    logger.info(`✅ Group loan auto-collection completed: ${groupLoan.loanId}`, {
      membersProcessed,
      membersFailed,
      totalLoanCollected: collectionData.totalLoanCollected,
      totalSavingsCollected: collectionData.totalSavingsCollected
    });

    return {
      success: true,
      membersProcessed,
      membersFailed,
      totalLoanCollected: collectionData.totalLoanCollected,
      totalSavingsCollected: collectionData.totalSavingsCollected
    };

  } catch (error) {
    await session.abortTransaction();
    logger.error(`❌ Group loan auto-collection failed: ${groupLoan.loanId}`, { error: error.message });
    return { success: false, error: error.message };
  } finally {
    await session.endSession();
  }
};

/**
 * NEW: Process group savings collections
 */
const processGroupSavingsCollection = async (groupLoan, currentDate, session) => {
  try {
    const collections = [];
    let totalAmount = 0;
    let processedCount = 0;

    // This is a simplified implementation - adjust based on your savings structure
    for (const member of groupLoan.members) {
      try {
        // Calculate savings contribution (simplified - use your business logic)
        const savingsAmount = groupLoan.individualShare * 0.1; // 10% of loan share as savings
        
        if (savingsAmount > 0) {
          // Deduct from member's account
          const customerAccount = await CustomerAccount.findOne({
            CUST_ID: member.memberId,
            accountStatus: 'ACTIVE',
            balance: { $gte: savingsAmount }
          }).session(session);

          if (customerAccount) {
            const oldBalance = parseFloat(customerAccount.balance?.toString() || '0');
            customerAccount.balance = mongoose.Types.Decimal128.fromString((oldBalance - savingsAmount).toFixed(2));
            await customerAccount.save({ session });

            collections.push({
              accountNo: customerAccount.accountNumber,
              amount: savingsAmount,
              type: 'GROUP_SAVINGS'
            });

            totalAmount += savingsAmount;
            processedCount++;
          }
        }
      } catch (memberError) {
        logger.error(`❌ Error processing savings for member ${member.memberId}:`, { error: memberError.message });
      }
    }

    return {
      processed: processedCount > 0,
      collections,
      count: processedCount,
      amount: totalAmount
    };

  } catch (error) {
    logger.error(`❌ Error processing group savings:`, { error: error.message });
    return { processed: false, collections: [], count: 0, amount: 0 };
  }
};

// ==================== EXISTING HELPER FUNCTIONS (keep as is) ====================

/**
 * Check if manual payment was made for the loan
 */
const checkManualPayment = async (loan, currentDate) => {
  try {
    if (loan.LAST_PAYMENT_DATE && new Date(loan.LAST_PAYMENT_DATE) > new Date(loan.NEXT_PAYMENT_DATE)) {
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`❌ Error checking manual payment for loan ${loan.ACCT_NO}:`, { error: error.message });
    return false;
  }
};

/**
 * Calculate the due amount for the loan
 */
const calculateDueAmount = async (loan) => {
  try {
    const principal = parseFloat(loan.OUTSTANDING_PRINCIPAL?.toString() || '0');
    const interestRate = parseFloat(loan.INTEREST_RATE?.toString() || '0') / 100;
    const termValue = loan.TERM_VALUE || 1;
    
    const monthlyInstallment = (principal * interestRate) / termValue;
    return Math.max(0, monthlyInstallment);
  } catch (error) {
    logger.error(`❌ Error calculating due amount for loan ${loan.ACCT_NO}:`, { error: error.message });
    return 0;
  }
};

/**
 * Attempt to auto-collect payment from customer's account
 */
const attemptAutoCollectionFromCustomerAccount = async (loan, dueAmount, currentDate, existingSession = null) => {
  const useExistingSession = !!existingSession;
  const session = existingSession || await mongoose.startSession();
  
  try {
    if (!useExistingSession) {
      session.startTransaction();
    }
    
    const customerAccount = await CustomerAccount.findOne({
      CUST_ID: loan.CUST_ID,
      accountStatus: 'ACTIVE',
      balance: { $gte: dueAmount }
    }).session(session);

    if (!customerAccount) {
      if (!useExistingSession) await session.abortTransaction();
      return {
        success: false,
        reason: 'No active customer account with sufficient balance found'
      };
    }

    // Debit from customer account
    const oldBalance = parseFloat(customerAccount.balance?.toString() || '0');
    const newBalance = oldBalance - dueAmount;
    
    customerAccount.balance = mongoose.Types.Decimal128.fromString(newBalance.toFixed(2));
    customerAccount.lastTransactionDate = currentDate;
    customerAccount.lastTransactionAmount = mongoose.Types.Decimal128.fromString(dueAmount.toFixed(2));
    customerAccount.lastTransactionType = 'DEBIT';
    
    await customerAccount.save({ session });

    // Credit to loan account
    await updateLoanAccountAfterCollection(loan, dueAmount, currentDate, session);

    // Create GL transaction record
    const glTransaction = new GLTransaction({
      transactionDate: currentDate,
      amount: dueAmount,
      currency: loan.CRNCY_ID || 'NGN',
      transactionType: 'LOAN_REPAYMENT_AUTO',
      description: `Auto-collection for loan ${loan.ACCT_NO}`,
      status: 'COMPLETED',
      referenceNumber: `AUTO_COLLECT_${loan.ACCT_NO}_${Date.now()}`,
      createdBy: 'system',
      debitAccount: customerAccount.accountNumber,
      creditAccount: getLoanReceivableGLCode(loan),
      customerId: loan.CUST_ID,
      loanAccountId: loan._id
    });

    await glTransaction.save({ session });

    if (!useExistingSession) {
      await session.commitTransaction();
    }
    
    return {
      success: true,
      amount: dueAmount,
      customerAccount: customerAccount.accountNumber,
      transactionId: glTransaction._id
    };

  } catch (error) {
    if (!useExistingSession) await session.abortTransaction();
    
    logger.error(`❌ Auto-collection failed for loan ${loan.ACCT_NO}:`, {
      error: error.message,
      dueAmount: dueAmount
    });
    
    return {
      success: false,
      reason: `Auto-collection failed: ${error.message}`
    };
  } finally {
    if (!useExistingSession) {
      await session.endSession();
    }
  }
};

/**
 * Update loan account after successful collection
 */
const updateLoanAccountAfterCollection = async (loan, amount, currentDate, session) => {
  try {
    const outstandingPrincipal = parseFloat(loan.OUTSTANDING_PRINCIPAL?.toString() || '0');
    const totalRepaid = parseFloat(loan.TOTAL_REPAID_AMOUNT?.toString() || '0');
    const outstandingBalance = parseFloat(loan.outstanding_balance?.toString() || '0');
    
    const principalPayment = amount;
    
    loan.OUTSTANDING_PRINCIPAL = mongoose.Types.Decimal128.fromString(
      Math.max(0, outstandingPrincipal - principalPayment).toFixed(2)
    );
    loan.TOTAL_REPAID_AMOUNT = mongoose.Types.Decimal128.fromString(
      (totalRepaid + amount).toFixed(2)
    );
    loan.outstanding_balance = mongoose.Types.Decimal128.fromString(
      Math.max(0, outstandingBalance - amount).toFixed(2)
    );
    
    loan.LAST_PAYMENT_DATE = currentDate;
    loan.LAST_PAYMENT_AMOUNT = mongoose.Types.Decimal128.fromString(amount.toFixed(2));
    loan.LAST_PAYMENT_METHOD = 'AUTO_DEBIT';
    
    loan.NEXT_PAYMENT_DATE = calculateNextPaymentDate(loan, currentDate);
    
    if (parseFloat(loan.OUTSTANDING_PRINCIPAL?.toString() || '0') <= 0) {
      loan.LOAN_STATUS = 'CLOSED';
      loan.CLOSURE_DATE = currentDate;
      loan.CLOSED_DATE = currentDate;
    }
    
    await loan.save({ session });

  } catch (error) {
    logger.error(`❌ Error updating loan account ${loan.ACCT_NO}:`, { error: error.message });
    throw error;
  }
};

/**
 * Mark loan as overdue
 */
const markLoanAsOverdue = async (loan, currentDate, reason) => {
  try {
    loan.LOAN_STATUS = 'OVERDUE';
    loan.lastUpdated = currentDate;
    loan.overdueSince = loan.overdueSince || currentDate;
    
    const dueDate = new Date(loan.NEXT_PAYMENT_DATE);
    const overdueDays = Math.ceil((currentDate - dueDate) / (1000 * 60 * 60 * 24));
    loan.overdueDays = overdueDays;
    
    loan.lastCollectionFailure = {
      date: currentDate,
      reason: reason,
      attemptedAmount: await calculateDueAmount(loan)
    };
    
    await loan.save();
    
    logger.info(`📝 Loan ${loan.ACCT_NO} marked as OVERDUE`, {
      overdueDays: overdueDays,
      reason: reason
    });

  } catch (error) {
    logger.error(`❌ Error marking loan ${loan.ACCT_NO} as overdue:`, { error: error.message });
    throw error;
  }
};

/**
 * Calculate next payment date based on payment frequency
 */
const calculateNextPaymentDate = (loan, currentDate) => {
  const nextDate = new Date(currentDate);
  
  switch (loan.PAYMENT_FREQUENCY) {
    case 'DAILY':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'WEEKLY':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'QUARTERLY':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'YEARLY':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
    default:
      nextDate.setMonth(nextDate.getMonth() + 1);
  }
  
  return nextDate;
};

/**
 * Get the GL code for loan receivable account
 */
const getLoanReceivableGLCode = (loan) => {
  const glCodeMap = {
    'INDIVIDUAL_LOAN': '1201001',
    'GROUP_LOAN': '1201002',  
    'BUSINESS_TERM_LOAN': '1201003',
    'CONSUMER_LOAN': '1201004'
  };
  
  return glCodeMap[loan.PRODUCT_TYPE] || '1201000';
};

export default {
  processAutoCollections
};