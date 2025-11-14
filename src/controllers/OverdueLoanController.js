import OverdueLoan from '../models/OverdueLoan.js';
import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import logger from '../utils/logger.js';

export const checkOverdueLoans = async () => {
  try {
    const currentDate = new Date();
    
    logger.info('Starting comprehensive overdue loan check with legacy migration support', { currentDate });

    // STEP 1: Find ALL loans including migrated ones
    const allLoans = await LoanAccount.find({
      $or: [
        // Active loans in new system
        { 
          LOAN_STATUS: { $in: ['Active', 'Disbursed', 'Pending Repayment'] },
          DISBURSEMENT_DATE: { $exists: true, $ne: null }
        },
        // Migrated loans that might be overdue
        { 
          IS_MIGRATED: true,
          LOAN_STATUS: { $in: ['Active', 'Disbursed', 'Pending Repayment', 'Overdue'] },
          MIGRATION_DATE: { $exists: true }
        }
      ]
    });

    logger.info(`Found ${allLoans.length} loans to check (including migrated loans)`);

    const newlyOverdueLoans = [];
    const updatedOverdueRecords = [];
    const repaymentScheduleUpdates = [];
    const legacyLoansProcessed = [];

    for (const loan of allLoans) {
      try {
        // Check if this is a migrated loan
        const isMigratedLoan = loan.IS_MIGRATED === true;
        
        if (isMigratedLoan) {
          legacyLoansProcessed.push(loan.ACCT_NO);
        }

        // Get repayment schedule for this loan
        const repaymentSchedule = await RepaymentSchedule.findOne({ 
          ACCT_NO: loan.ACCT_NO 
        });

        // Handle loans without repayment schedules (common in migrations)
        if (!repaymentSchedule || !repaymentSchedule.SCHEDULE) {
          if (isMigratedLoan) {
            // For migrated loans, create overdue status based on legacy data
            await handleMigratedLoanWithoutSchedule(loan, currentDate, newlyOverdueLoans, updatedOverdueRecords);
          } else {
            logger.warn(`No repayment schedule found for loan ${loan.ACCT_NO}`);
          }
          continue;
        }

        // Check each installment in the repayment schedule
        const overdueInstallments = repaymentSchedule.SCHEDULE.filter(inst => {
          const dueDate = new Date(inst.dueDate);
          const isOverdue = dueDate < currentDate && 
                 (inst.status === 'PENDING' || inst.status === 'PARTIAL');
          
          // Special handling for migrated loans with legacy overdue status
          if (isMigratedLoan && loan.LEGACY_OVERDUE_STATUS) {
            return isOverdue || inst.status === 'OVERDUE';
          }
          
          return isOverdue;
        });

        if (overdueInstallments.length > 0) {
          logger.info(`Loan ${loan.ACCT_NO} has ${overdueInstallments.length} overdue installments`, {
            isMigrated: isMigratedLoan,
            legacyOverdueStatus: loan.LEGACY_OVERDUE_STATUS,
            overdueInstallments: overdueInstallments.map(inst => ({
              installmentNumber: inst.installmentNumber,
              dueDate: inst.dueDate,
              status: inst.status,
              amountDue: inst.totalPayment
            }))
          });

          // Mark installments as OVERDUE in repayment schedule
          for (const installment of overdueInstallments) {
            await RepaymentSchedule.updateOne(
              {
                _id: repaymentSchedule._id,
                'SCHEDULE.installmentNumber': installment.installmentNumber
              },
              {
                $set: { 
                  'SCHEDULE.$.status': 'OVERDUE',
                  'SCHEDULE.$.overdueSince': currentDate,
                  // Preserve legacy data if available
                  ...(installment.legacyData && { 'SCHEDULE.$.legacyData': installment.legacyData })
                }
              }
            );
            repaymentScheduleUpdates.push({
              loanAccountNo: loan.ACCT_NO,
              installmentNumber: installment.installmentNumber,
              dueDate: installment.dueDate,
              isMigrated: isMigratedLoan
            });
          }

          // Calculate overall loan overdue status with migration considerations
          const isLoanOverdue = overdueInstallments.length > 0;
          const maxDaysOverdue = calculateMaxDaysOverdue(overdueInstallments, currentDate, loan);
          
          // For migrated loans, consider legacy overdue days
          const effectiveDaysOverdue = isMigratedLoan ? 
            Math.max(maxDaysOverdue, loan.LEGACY_OVERDUE_DAYS || 0) : 
            maxDaysOverdue;

          if ((isLoanOverdue && loan.LOAN_STATUS !== 'Overdue') || 
              (isMigratedLoan && loan.LEGACY_OVERDUE_STATUS)) {
            
            // Update loan status to Overdue
            await LoanAccount.updateOne(
              { _id: loan._id },
              { 
                $set: { 
                  LOAN_STATUS: 'Overdue',
                  LAST_STATUS_UPDATE: currentDate,
                  DAYS_OVERDUE: effectiveDaysOverdue,
                  // Clear legacy status once processed
                  ...(isMigratedLoan && { 
                    LEGACY_OVERDUE_STATUS: null,
                    LEGACY_OVERDUE_DAYS: null 
                  })
                } 
              }
            );

            // Update servicing status based on overdue severity
            const servicingStatus = calculateServicingStatus(effectiveDaysOverdue, loan);

            await LoanAccount.updateOne(
              { _id: loan._id },
              { $set: { SERVICING_STATUS: servicingStatus } }
            );

            // Create or update overdue loan record
            const overdueRecord = await createOrUpdateOverdueRecord(
              loan, 
              overdueInstallments[0].dueDate,
              currentDate,
              effectiveDaysOverdue,
              overdueInstallments.length,
              isMigratedLoan
            );
            
            newlyOverdueLoans.push({
              acct_no: loan.ACCT_NO,
              customerId: loan.CUST_ID,
              loanAmount: loan.LOAN_AMOUNT,
              disbursementDate: loan.DISBURSEMENT_DATE,
              firstOverdueDate: overdueInstallments[0].dueDate,
              daysOverdue: effectiveDaysOverdue,
              overdueInstallments: overdueInstallments.length,
              totalOverdueAmount: overdueInstallments.reduce((sum, inst) => 
                sum + parseFloat(inst.totalPayment.toString()), 0
              ),
              isMigrated: isMigratedLoan,
              legacyId: loan.LEGACY_LOAN_ID
            });

            updatedOverdueRecords.push(overdueRecord);

            // Create loan event for overdue status
            const LoanEvent = (await import('../models/LoanEvent.js')).default;
            const event = new LoanEvent({
              ACCT_NO: loan.ACCT_NO,
              eventType: 'LOAN_OVERDUE',
              status: 'Overdue',
              details: {
                overdueInstallments: overdueInstallments.length,
                maxDaysOverdue: effectiveDaysOverdue,
                totalOverdueAmount: overdueInstallments.reduce((sum, inst) => 
                  sum + parseFloat(inst.totalPayment.toString()), 0
                ),
                trigger: isMigratedLoan ? 'LEGACY_MIGRATION' : 'AUTO_DETECTION',
                isMigrated: isMigratedLoan,
                legacyOverdueStatus: loan.LEGACY_OVERDUE_STATUS
              },
              createdBy: 'SYSTEM'
            });
            await event.save();
          }
        }
      } catch (loanError) {
        logger.error(`Error processing loan ${loan.ACCT_NO}:`, { 
          error: loanError.message,
          isMigrated: loan.IS_MIGRATED 
        });
      }
    }

    // STEP 2: Handle legacy overdue loans without repayment schedules
    await processLegacyOverdueLoans(currentDate, newlyOverdueLoans, updatedOverdueRecords);

    // STEP 3: Update existing overdue loans status and check for recovery
    const existingOverdueUpdate = await OverdueLoan.updateMany(
      { due_date: { $lt: currentDate }, status: 'Pending' },
      { $set: { status: 'Overdue', updated_at: currentDate } }
    );

    // STEP 4: Check for loans that are no longer overdue (recovered)
    const recoveredLoans = await checkRecoveredLoans(currentDate);

    logger.info('Comprehensive overdue loan check with legacy support completed', {
      totalLoans: allLoans.length,
      migratedLoans: legacyLoansProcessed.length,
      newlyOverdueLoans: newlyOverdueLoans.length,
      existingOverdueUpdated: existingOverdueUpdate.modifiedCount,
      repaymentScheduleUpdates: repaymentScheduleUpdates.length,
      recoveredLoans: recoveredLoans.length
    });

    return {
      success: true,
      newlyOverdue: newlyOverdueLoans,
      existingUpdated: existingOverdueUpdate.modifiedCount,
      repaymentUpdates: repaymentScheduleUpdates,
      recovered: recoveredLoans,
      migratedLoansProcessed: legacyLoansProcessed.length,
      totalProcessed: allLoans.length
    };

  } catch (error) {
    logger.error('Error checking overdue loans:', { error: error.message, stack: error.stack });
    throw error;
  }
};

// NEW: Handle migrated loans without repayment schedules
const handleMigratedLoanWithoutSchedule = async (loan, currentDate, newlyOverdueLoans, updatedOverdueRecords) => {
  try {
    // Check if loan was overdue in legacy system
    const wasLegacyOverdue = loan.LEGACY_OVERDUE_STATUS && 
                            ['OVERDUE', 'DELINQUENT', 'NON_PERFORMING'].includes(loan.LEGACY_OVERDUE_STATUS);
    
    // Check if loan should be overdue based on migration date and terms
    const shouldBeOverdue = await shouldMigratedLoanBeOverdue(loan, currentDate);

    if (wasLegacyOverdue || shouldBeOverdue) {
      logger.info(`Migrated loan ${loan.ACCT_NO} marked as overdue from legacy system`, {
        legacyStatus: loan.LEGACY_OVERDUE_STATUS,
        migrationDate: loan.MIGRATION_DATE,
        shouldBeOverdue
      });

      // Calculate days overdue
      const daysOverdue = calculateMigratedLoanOverdueDays(loan, currentDate);
      
      // Update loan status
      await LoanAccount.updateOne(
        { _id: loan._id },
        { 
          $set: { 
            LOAN_STATUS: 'Overdue',
            LAST_STATUS_UPDATE: currentDate,
            DAYS_OVERDUE: daysOverdue,
            SERVICING_STATUS: calculateServicingStatus(daysOverdue, loan),
            LEGACY_OVERDUE_STATUS: null // Clear after processing
          } 
        }
      );

      // Create overdue record
      const overdueRecord = await createOrUpdateOverdueRecord(
        loan, 
        loan.MIGRATION_DATE || loan.DISBURSEMENT_DATE,
        currentDate,
        daysOverdue,
        1, // Assume 1 installment for migrated loans without schedule
        true // isMigrated
      );

      newlyOverdueLoans.push({
        acct_no: loan.ACCT_NO,
        customerId: loan.CUST_ID,
        loanAmount: loan.LOAN_AMOUNT,
        disbursementDate: loan.DISBURSEMENT_DATE,
        firstOverdueDate: loan.MIGRATION_DATE || currentDate,
        daysOverdue: daysOverdue,
        overdueInstallments: 1,
        totalOverdueAmount: loan.LOAN_AMOUNT, // Use full loan amount as estimate
        isMigrated: true,
        legacyId: loan.LEGACY_LOAN_ID,
        processedAs: 'LEGACY_OVERDUE'
      });

      updatedOverdueRecords.push(overdueRecord);
    }
  } catch (error) {
    logger.error(`Error handling migrated loan ${loan.ACCT_NO}:`, { error: error.message });
  }
};

// NEW: Determine if migrated loan should be overdue
const shouldMigratedLoanBeOverdue = async (loan, currentDate) => {
  if (!loan.MIGRATION_DATE || !loan.DISBURSEMENT_DATE) return false;

  const migrationDate = new Date(loan.MIGRATION_DATE);
  const disbursementDate = new Date(loan.DISBURSEMENT_DATE);
  
  // Calculate expected repayment date based on loan terms
  const expectedRepaymentDate = calculateExpectedRepaymentDateFromTerms(loan);
  
  if (!expectedRepaymentDate) return false;

  // Consider migration grace period (typically 30 days)
  const migrationGracePeriod = loan.MIGRATION_GRACE_DAYS || 30;
  const gracePeriodEnd = new Date(migrationDate);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + migrationGracePeriod);

  // Loan is overdue if expected repayment has passed and grace period has ended
  return expectedRepaymentDate < currentDate && gracePeriodEnd < currentDate;
};

// NEW: Calculate overdue days for migrated loans
const calculateMigratedLoanOverdueDays = (loan, currentDate) => {
  if (loan.LEGACY_OVERDUE_DAYS) {
    return loan.LEGACY_OVERDUE_DAYS + Math.floor((currentDate - new Date(loan.MIGRATION_DATE)) / (1000 * 60 * 60 * 24));
  }

  const expectedRepaymentDate = calculateExpectedRepaymentDateFromTerms(loan);
  if (!expectedRepaymentDate) return 0;

  return Math.max(0, Math.floor((currentDate - expectedRepaymentDate) / (1000 * 60 * 60 * 24)));
};

// NEW: Calculate expected repayment date from loan terms for migrated loans
const calculateExpectedRepaymentDateFromTerms = (loan) => {
  if (!loan.DISBURSEMENT_DATE) return null;

  const disbursementDate = new Date(loan.DISBURSEMENT_DATE);
  let repaymentDate = new Date(disbursementDate);

  if (loan.LOAN_TERM && loan.TERM_TYPE) {
    switch (loan.TERM_TYPE.toLowerCase()) {
      case 'days':
      case 'daily':
        repaymentDate.setDate(disbursementDate.getDate() + loan.LOAN_TERM);
        break;
      case 'weeks':
      case 'weekly':
        repaymentDate.setDate(disbursementDate.getDate() + (loan.LOAN_TERM * 7));
        break;
      case 'months':
      case 'monthly':
        repaymentDate.setMonth(disbursementDate.getMonth() + loan.LOAN_TERM);
        break;
      case 'years':
      case 'yearly':
        repaymentDate.setFullYear(disbursementDate.getFullYear() + loan.LOAN_TERM);
        break;
      default:
        repaymentDate.setMonth(disbursementDate.getMonth() + (loan.LOAN_TERM || 1));
    }
  } else {
    repaymentDate.setDate(disbursementDate.getDate() + 30);
  }

  return repaymentDate;
};

// NEW: Process loans that were overdue in legacy system
const processLegacyOverdueLoans = async (currentDate, newlyOverdueLoans, updatedOverdueRecords) => {
  try {
    const legacyOverdueLoans = await LoanAccount.find({
      IS_MIGRATED: true,
      LEGACY_OVERDUE_STATUS: { $exists: true, $ne: null },
      LOAN_STATUS: { $ne: 'Overdue' } // Not already processed
    });

    for (const loan of legacyOverdueLoans) {
      await handleMigratedLoanWithoutSchedule(loan, currentDate, newlyOverdueLoans, updatedOverdueRecords);
    }
  } catch (error) {
    logger.error('Error processing legacy overdue loans:', { error: error.message });
  }
};

// Enhanced helper function with legacy support
const createOrUpdateOverdueRecord = async (loan, firstOverdueDate, currentDate, daysOverdue, overdueInstallmentCount, isMigrated = false) => {
  try {
    const existingRecord = await OverdueLoan.findOne({ 
      $or: [
        { loanAccountNo: loan.ACCT_NO },
        ...(loan.LEGACY_LOAN_ID ? [{ legacyLoanId: loan.LEGACY_LOAN_ID }] : [])
      ],
      status: { $in: ['Pending', 'Overdue'] }
    });

    const totalOverdueAmount = await calculateTotalOverdueAmount(loan.ACCT_NO);

    const overdueData = {
      status: 'Overdue',
      due_date: firstOverdueDate,
      updated_at: currentDate,
      overdue_days: daysOverdue,
      overdue_installments: overdueInstallmentCount,
      total_overdue_amount: totalOverdueAmount,
      last_escalation_date: currentDate,
      ...(isMigrated && {
        is_migrated: true,
        legacy_loan_id: loan.LEGACY_LOAN_ID,
        migration_date: loan.MIGRATION_DATE,
        legacy_overdue_status: loan.LEGACY_OVERDUE_STATUS
      })
    };

    if (existingRecord) {
      const updatedRecord = await OverdueLoan.findOneAndUpdate(
        { _id: existingRecord._id },
        {
          $set: overdueData,
          $inc: { escalation_count: 1 }
        },
        { new: true }
      );
      return updatedRecord;
    } else {
      const newOverdueRecord = new OverdueLoan({
        loanAccountNo: loan.ACCT_NO,
        customerId: loan.CUST_ID,
        due_date: firstOverdueDate,
        loan_amount: loan.LOAN_AMOUNT,
        disbursement_date: loan.DISBURSEMENT_DATE,
        status: 'Overdue',
        created_at: currentDate,
        updated_at: currentDate,
        overdue_days: daysOverdue,
        overdue_installments: overdueInstallmentCount,
        total_overdue_amount: totalOverdueAmount,
        expected_repayment_date: firstOverdueDate,
        escalation_count: 1,
        last_escalation_date: currentDate,
        ...(isMigrated && {
          is_migrated: true,
          legacy_loan_id: loan.LEGACY_LOAN_ID,
          migration_date: loan.MIGRATION_DATE
        })
      });

      await newOverdueRecord.save();
      return newOverdueRecord;
    }
  } catch (error) {
    logger.error('Error creating/updating overdue record:', { error: error.message });
    throw error;
  }
};

// Enhanced days overdue calculation with legacy support
const calculateMaxDaysOverdue = (overdueInstallments, currentDate, loan) => {
  const maxDaysFromInstallments = Math.max(...overdueInstallments.map(inst => 
    Math.ceil((currentDate - new Date(inst.dueDate)) / (1000 * 60 * 60 * 24))
  ));

  // For migrated loans, consider legacy overdue days
  if (loan.IS_MIGRATED && loan.LEGACY_OVERDUE_DAYS) {
    return Math.max(maxDaysFromInstallments, loan.LEGACY_OVERDUE_DAYS);
  }

  return maxDaysFromInstallments;
};

// Enhanced servicing status calculation
const calculateServicingStatus = (daysOverdue, loan) => {
  if (daysOverdue > 90) return 'DELINQUENT';
  if (daysOverdue > 30) return 'NON_PERFORMING';
  if (daysOverdue > 0) return 'UNSERVICED';
  return 'SERVICED';
};

// Helper to calculate total overdue amount from repayment schedule
const calculateTotalOverdueAmount = async (loanAccountNo) => {
  try {
    const repaymentSchedule = await RepaymentSchedule.findOne({ ACCT_NO: loanAccountNo });
    if (!repaymentSchedule) return 0;

    const overdueInstallments = repaymentSchedule.SCHEDULE.filter(inst => 
      inst.status === 'OVERDUE' || 
      (new Date(inst.dueDate) < new Date() && inst.status !== 'PAID')
    );

    return overdueInstallments.reduce((sum, inst) => {
      const amountDue = parseFloat(inst.totalPayment.toString());
      const amountPaid = parseFloat(inst.amountPaid?.toString() || '0');
      return sum + (amountDue - amountPaid);
    }, 0);
  } catch (error) {
    logger.error('Error calculating total overdue amount:', { error: error.message });
    return 0;
  }
};

// New function to check for recovered loans
const checkRecoveredLoans = async (currentDate) => {
  try {
    const recoveredLoans = [];
    
    // Find overdue loans that might have been paid
    const overdueLoans = await OverdueLoan.find({ status: 'Overdue' });
    
    for (const overdueLoan of overdueLoans) {
      const repaymentSchedule = await RepaymentSchedule.findOne({ 
        ACCT_NO: overdueLoan.loanAccountNo 
      });
      
      if (repaymentSchedule) {
        const overdueInstallments = repaymentSchedule.SCHEDULE.filter(inst => 
          inst.status === 'OVERDUE'
        );
        
        // If no overdue installments, loan is recovered
        if (overdueInstallments.length === 0) {
          // Update overdue record
          await OverdueLoan.updateOne(
            { _id: overdueLoan._id },
            { 
              $set: { 
                status: 'Recovered',
                recovered_at: currentDate,
                updated_at: currentDate
              } 
            }
          );
          
          // Update loan account status
          await LoanAccount.updateOne(
            { ACCT_NO: overdueLoan.loanAccountNo },
            { 
              $set: { 
                LOAN_STATUS: 'Active',
                SERVICING_STATUS: 'SERVICED',
                LAST_STATUS_UPDATE: currentDate
              } 
            }
          );

          recoveredLoans.push({
            loanAccountNo: overdueLoan.loanAccountNo,
            recoveredAt: currentDate,
            previousOverdueDays: overdueLoan.overdue_days
          });
        }
      }
    }
    
    return recoveredLoans;
  } catch (error) {
    logger.error('Error checking recovered loans:', { error: error.message });
    return [];
  }
};

// Enhanced getOverdueLoans with repayment schedule integration
export const getOverdueLoans = async (includeDetails = false) => {
  try {
    const overdueLoans = await OverdueLoan.find({ status: 'Overdue' });

    if (includeDetails) {
      const enrichedLoans = await Promise.all(
        overdueLoans.map(async (overdueLoan) => {
          const [loanAccount, repaymentSchedule] = await Promise.all([
            LoanAccount.findOne({ 
              ACCT_NO: overdueLoan.loanAccountNo 
            }).select('CUST_ID LOAN_AMOUNT DISBURSEMENT_DATE LOAN_TERM TERM_TYPE CUSTOMER_NAME SERVICING_STATUS IS_MIGRATED LEGACY_LOAN_ID MIGRATION_DATE'),
            RepaymentSchedule.findOne({ 
              ACCT_NO: overdueLoan.loanAccountNo 
            })
          ]);
          
          const overdueInstallments = repaymentSchedule?.SCHEDULE?.filter(inst => 
            inst.status === 'OVERDUE'
          ) || [];

          return {
            ...overdueLoan.toObject(),
            loanDetails: loanAccount || {},
            repaymentDetails: {
              totalInstallments: repaymentSchedule?.SCHEDULE?.length || 0,
              overdueInstallments: overdueInstallments.length,
              nextDueInstallment: repaymentSchedule?.SCHEDULE?.find(inst => 
                inst.status === 'PENDING'
              ),
              totalOverdueAmount: overdueInstallments.reduce((sum, inst) => 
                sum + (parseFloat(inst.totalPayment.toString()) - parseFloat(inst.amountPaid?.toString() || '0')), 0
              )
            }
          };
        })
      );
      return enrichedLoans;
    }

    return overdueLoans;
  } catch (error) {
    logger.error('Error retrieving overdue loans:', { error: error.message });
    throw error;
  }
};

// New function to get overdue loan statistics
export const getOverdueLoanStats = async () => {
  try {
    const currentDate = new Date();
    
    const stats = await OverdueLoan.aggregate([
      { $match: { status: 'Overdue' } },
      {
        $group: {
          _id: null,
          totalOverdueLoans: { $sum: 1 },
          totalOverdueAmount: { $sum: '$loan_amount' },
          avgOverdueDays: { $avg: '$overdue_days' },
          maxOverdueDays: { $max: '$overdue_days' },
          migratedOverdueLoans: {
            $sum: { $cond: [{ $eq: ['$is_migrated', true] }, 1, 0] }
          }
        }
      }
    ]);

    const overdueByDays = await OverdueLoan.aggregate([
      { $match: { status: 'Overdue' } },
      {
        $bucket: {
          groupBy: '$overdue_days',
          boundaries: [0, 30, 60, 90, 180, 365],
          default: 'Over_1_Year',
          output: {
            count: { $sum: 1 },
            totalAmount: { $sum: '$loan_amount' },
            migratedCount: {
              $sum: { $cond: [{ $eq: ['$is_migrated', true] }, 1, 0] }
            }
          }
        }
      }
    ]);

    // Get servicing status distribution
    const servicingStats = await LoanAccount.aggregate([
      { $match: { LOAN_STATUS: 'Overdue' } },
      {
        $group: {
          _id: '$SERVICING_STATUS',
          count: { $sum: 1 },
          totalAmount: { $sum: '$LOAN_AMOUNT' }
        }
      }
    ]);

    return {
      summary: stats[0] || { 
        totalOverdueLoans: 0, 
        totalOverdueAmount: 0, 
        avgOverdueDays: 0, 
        maxOverdueDays: 0,
        migratedOverdueLoans: 0
      },
      distribution: overdueByDays,
      servicingStatus: servicingStats,
      asOfDate: currentDate
    };
  } catch (error) {
    logger.error('Error getting overdue loan stats:', { error: error.message });
    throw error;
  }
};

// Function to manually mark loan as overdue (for admin/legacy purposes)
export const manuallyMarkLoanOverdue = async (loanAccountNo, reason, markedBy) => {
  try {
    const loan = await LoanAccount.findOne({ ACCT_NO: loanAccountNo });
    if (!loan) {
      throw new Error('Loan account not found');
    }

    const currentDate = new Date();

    // Update loan status
    await LoanAccount.updateOne(
      { _id: loan._id },
      { 
        $set: { 
          LOAN_STATUS: 'Overdue',
          LAST_STATUS_UPDATE: currentDate,
          DAYS_OVERDUE: loan.DAYS_OVERDUE || 1,
          SERVICING_STATUS: 'UNSERVICED'
        } 
      }
    );

    // Create overdue record
    const overdueRecord = new OverdueLoan({
      loanAccountNo: loan.ACCT_NO,
      customerId: loan.CUST_ID,
      due_date: currentDate,
      loan_amount: loan.LOAN_AMOUNT,
      disbursement_date: loan.DISBURSEMENT_DATE,
      status: 'Overdue',
      created_at: currentDate,
      updated_at: currentDate,
      overdue_days: loan.DAYS_OVERDUE || 1,
      overdue_installments: 1,
      total_overdue_amount: loan.LOAN_AMOUNT,
      expected_repayment_date: currentDate,
      escalation_count: 1,
      last_escalation_date: currentDate,
      manual_mark_reason: reason,
      marked_by: markedBy
    });

    await overdueRecord.save();

    // Create audit event
    const LoanEvent = (await import('../models/LoanEvent.js')).default;
    const event = new LoanEvent({
      ACCT_NO: loan.ACCT_NO,
      eventType: 'LOAN_OVERDUE_MANUAL',
      status: 'Overdue',
      details: {
        reason: reason,
        markedBy: markedBy,
        trigger: 'MANUAL_MARKING'
      },
      createdBy: markedBy
    });
    await event.save();

    logger.info(`Loan ${loanAccountNo} manually marked as overdue by ${markedBy}`, { reason });

    return {
      success: true,
      message: 'Loan manually marked as overdue',
      loanAccountNo,
      overdueRecord: overdueRecord._id
    };
  } catch (error) {
    logger.error('Error manually marking loan as overdue:', { error: error.message });
    throw error;
  }
};

// Function to get loan overdue history
export const getLoanOverdueHistory = async (loanAccountNo) => {
  try {
    const overdueHistory = await OverdueLoan.find({ 
      loanAccountNo: loanAccountNo 
    }).sort({ created_at: -1 });

    const loanAccount = await LoanAccount.findOne({ ACCT_NO: loanAccountNo })
      .select('CUST_ID LOAN_AMOUNT DISBURSEMENT_DATE LOAN_TERM TERM_TYPE CUSTOMER_NAME');

    return {
      loanDetails: loanAccount,
      overdueHistory: overdueHistory,
      totalOverdueEvents: overdueHistory.length,
      currentStatus: overdueHistory.length > 0 ? overdueHistory[0].status : 'CURRENT'
    };
  } catch (error) {
    logger.error('Error getting loan overdue history:', { error: error.message });
    throw error;
  }
};

export default {
  checkOverdueLoans,
  getOverdueLoans,
  getOverdueLoanStats,
  manuallyMarkLoanOverdue,
  getLoanOverdueHistory
};