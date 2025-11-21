// controllers/loanCollectionController.js
import LoanAccountSummary from '../models/LoanAccountSummary.js';
import LoanAccount from '../models/LoanAccount.js';
import GroupLoan from '../models/GroupLoan.js';

// Add asyncHandler definition at the top
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ========== HELPER FUNCTION DECLARATIONS ==========

// Disbursement Information Functions
export async function getLoanAccountDisbursementInfo(loanAccount, groupLoan = null) {
  const disbursedAmount = parseFloat(loanAccount.ACTUAL_DISBURSEMENT?.toString() || '0');
  const disbursementLimit = parseFloat(loanAccount.DISBURSEMENT_LIMIT?.toString() || '0');
  const totalFees = parseFloat(loanAccount.FEE_DETAILS?.totalFees?.toString() || '0');
  const upfrontInterest = parseFloat(loanAccount.upfrontInterestAmount?.toString() || '0');
  
  let memberDisbursementDetails = null;
  if (groupLoan && groupLoan.disbursementResults?.details?.successful) {
    memberDisbursementDetails = groupLoan.disbursementResults.details.successful.find(
      disbursement => disbursement.loanAccountNumber === loanAccount.ACCT_NO
    );
  }

  return {
    approvedAmount: disbursementLimit,
    actualDisbursement: disbursedAmount,
    totalFeesDeducted: totalFees,
    upfrontInterestDeducted: upfrontInterest,
    netAmountReceived: disbursedAmount,
    disbursementMethod: loanAccount.disbursementMethod,
    disbursementDate: loanAccount.START_DT,
    memberSpecificDetails: memberDisbursementDetails,
    verification: {
      approvedAmount: disbursementLimit,
      totalDeductions: totalFees + upfrontInterest,
      shouldDisburse: disbursementLimit - (totalFees + upfrontInterest),
      actualDisbursed: disbursedAmount,
      isAccurate: Math.abs(disbursedAmount - (disbursementLimit - totalFees - upfrontInterest)) < 0.01
    }
  };
}

function getGroupDisbursementInfo(groupLoan) {
  if (!groupLoan.disbursementResults?.summary) {
    return {
      totalDisbursed: 0,
      successfulDisbursements: 0,
      failedDisbursements: 0,
      disbursementRate: 0,
      totalFeesCollected: 0
    };
  }

  const summary = groupLoan.disbursementResults.summary;
  return {
    totalDisbursed: summary.totalDisbursed || 0,
    successfulDisbursements: summary.successful || 0,
    failedDisbursements: summary.failed || 0,
    insufficientFunds: summary.insufficientFunds || 0,
    totalFeesCollected: summary.totalFeesCollected || 0,
    disbursementRate: summary.totalMembers > 0 ? (summary.successful / summary.totalMembers) * 100 : 0,
    disbursementDate: summary.disbursementDate,
    processedBy: summary.processedBy
  };
}

function getIndividualDisbursementInfo(loanAccount) {
  const disbursedAmount = parseFloat(loanAccount.ACTUAL_DISBURSEMENT?.toString() || '0');
  const disbursementLimit = parseFloat(loanAccount.DISBURSEMENT_LIMIT?.toString() || '0');
  const totalFees = parseFloat(loanAccount.FEE_DETAILS?.totalFees?.toString() || '0');
  const upfrontInterest = parseFloat(loanAccount.upfrontInterestAmount?.toString() || '0');

  return {
    approvedAmount: disbursementLimit,
    actualDisbursement: disbursedAmount,
    totalFeesDeducted: totalFees,
    upfrontInterestDeducted: upfrontInterest,
    netAmountReceived: disbursedAmount,
    disbursementMethod: loanAccount.disbursementMethod,
    disbursementDate: loanAccount.START_DT
  };
}

function getCustomerDisbursementInfo(loanAccounts) {
  const totalApproved = loanAccounts.reduce((sum, acc) => 
    sum + parseFloat(acc.DISBURSEMENT_LIMIT?.toString() || '0'), 0);
  const totalDisbursed = loanAccounts.reduce((sum, acc) => 
    sum + parseFloat(acc.ACTUAL_DISBURSEMENT?.toString() || '0'), 0);
  const totalFees = loanAccounts.reduce((sum, acc) => 
    sum + parseFloat(acc.FEE_DETAILS?.totalFees?.toString() || '0'), 0);

  return {
    totalApproved,
    totalDisbursed,
    totalFees,
    disbursementRate: totalApproved > 0 ? (totalDisbursed / totalApproved) * 100 : 0,
    averageDisbursement: loanAccounts.length > 0 ? totalDisbursed / loanAccounts.length : 0
  };
}

function getBranchDisbursementInfo(loanAccounts) {
  const totalApproved = loanAccounts.reduce((sum, acc) => 
    sum + parseFloat(acc.DISBURSEMENT_LIMIT?.toString() || '0'), 0);
  const totalDisbursed = loanAccounts.reduce((sum, acc) => 
    sum + parseFloat(acc.ACTUAL_DISBURSEMENT?.toString() || '0'), 0);
  const totalFees = loanAccounts.reduce((sum, acc) => 
    sum + parseFloat(acc.FEE_DETAILS?.totalFees?.toString() || '0'), 0);

  return {
    totalApproved,
    totalDisbursed,
    totalFees,
    averageLoanSize: loanAccounts.length > 0 ? totalApproved / loanAccounts.length : 0,
    disbursementRate: totalApproved > 0 ? (totalDisbursed / totalApproved) * 100 : 0
  };
}

// Utility Functions
function calculateFeesFromLoanAccount(loanAcc) {
  let totalFees = 0;
  
  if (loanAcc.FEE_DETAILS?.processingFee) {
    totalFees += parseFloat(loanAcc.FEE_DETAILS.processingFee.toString());
  }
  
  if (loanAcc.FEE_DETAILS?.totalFees) {
    totalFees += parseFloat(loanAcc.FEE_DETAILS.totalFees.toString());
  }
  
  if (loanAcc.upfrontInterestAmount) {
    totalFees += parseFloat(loanAcc.upfrontInterestAmount.toString());
  }
  
  if (loanAcc.FEE_DETAILS?.charges) {
    loanAcc.FEE_DETAILS.charges.forEach(charge => {
      if (charge.amount) {
        totalFees += parseFloat(charge.amount.toString());
      }
    });
  }
  
  return parseFloat(totalFees.toFixed(2));
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN'
  }).format(amount || 0);
}

// Group Repayment Specific Functions
function generateInstallmentSchedule(groupLoan) {
  if (!groupLoan.disbursedAt) return [];

  const schedule = [];
  const totalInstallments = groupLoan.numPeriods || 12;
  const installmentAmount = groupLoan.installmentAmount || 0;
  const frequency = groupLoan.paymentFrequency || 'MONTHLY';
  let currentDate = new Date(groupLoan.disbursedAt);

  for (let i = 1; i <= totalInstallments; i++) {
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

// ========== MAIN CONTROLLER FUNCTIONS ==========

export const getUniversalCollectionSheet = asyncHandler(async (req, res) => {
  const { loanId, groupId, customerId, branchId } = req.query;

  try {
    let collectionSheet = {
      type: '',
      info: {},
      summary: {
        totalMembers: 0,
        totalOutstanding: 0,
        totalInstallmentAmount: 0,
        activeMembers: 0,
        overdueMembers: 0,
        totalLoanAmount: 0,
        totalRepaid: 0,
        totalDisbursed: 0,
        totalFeesCollected: 0,
        totalUpfrontInterest: 0,
        netDisbursement: 0
      },
      members: []
    };

    if (groupId) {
      console.log(`🔍 Fetching collection sheet for group: ${groupId}`);
      collectionSheet.type = 'GROUP';
      
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

      collectionSheet.info = {
        groupId: groupLoan.loanId,
        groupName: groupLoan.groupName || `Group ${groupLoan.loanId}`,
        totalMembers: groupLoan.members?.length || 0,
        totalLoanAmount: groupLoan.totalAmount || 0,
        status: groupLoan.status,
        productId: groupLoan.productId,
        disbursementDate: groupLoan.disbursedAt,
        createdAt: groupLoan.createdAt,
        paymentFrequency: groupLoan.paymentFrequency || 'WEEKLY',
        disbursementInfo: getGroupDisbursementInfo(groupLoan)
      };

      const loanAccounts = await LoanAccount.find({
        groupLoan: groupLoan._id
      })
      .populate('CUST_ID')
      .sort({ ACCT_NO: 1 });

      await processLoanAccounts(loanAccounts, collectionSheet, groupLoan);

    } else if (loanId) {
      console.log(`🔍 Fetching collection sheet for individual loan: ${loanId}`);
      collectionSheet.type = 'INDIVIDUAL';
      
      const loanAccount = await LoanAccount.findOne({ 
        ACCT_NO: loanId 
      })
      .populate('CUST_ID')
      .populate('groupLoan');

      if (!loanAccount) {
        return res.status(404).json({
          success: false,
          message: `Loan account with ID ${loanId} not found`
        });
      }

      collectionSheet.info = {
        loanAccountNo: loanAccount.ACCT_NO,
        customerName: loanAccount.ACCT_NM,
        customerId: loanAccount.CUST_ID,
        loanAmount: parseFloat(loanAccount.DISBURSEMENT_LIMIT?.toString() || '0'),
        status: loanAccount.LOAN_STATUS,
        productId: loanAccount.PROD_ID,
        disbursementDate: loanAccount.START_DT,
        paymentFrequency: loanAccount.PAYMENT_FREQUENCY || 'MONTHLY',
        disbursementInfo: getIndividualDisbursementInfo(loanAccount)
      };

      await processLoanAccounts([loanAccount], collectionSheet);

    } else if (customerId) {
      console.log(`🔍 Fetching collection sheet for customer: ${customerId}`);
      collectionSheet.type = 'CUSTOMER';
      
      const loanAccounts = await LoanAccount.find({
        CUST_ID: customerId,
        LOAN_STATUS: { $in: ['ACTIVE', 'OVERDUE'] }
      })
      .populate('CUST_ID')
      .populate('groupLoan')
      .sort({ ACCT_NO: 1 });

      if (loanAccounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No active loans found for customer ${customerId}`
        });
      }

      const customer = loanAccounts[0].CUST_ID;
      collectionSheet.info = {
        customerId: customerId,
        customerName: customer?.FIRST_NM ? 
          `${customer.FIRST_NM || ''} ${customer.MIDDLE_NM || ''} ${customer.LAST_NM || ''}`.trim() :
          loanAccounts[0].ACCT_NM,
        totalLoans: loanAccounts.length,
        totalLoanAmount: loanAccounts.reduce((sum, acc) => sum + parseFloat(acc.DISBURSEMENT_LIMIT?.toString() || '0'), 0),
        disbursementInfo: getCustomerDisbursementInfo(loanAccounts)
      };

      await processLoanAccounts(loanAccounts, collectionSheet);

    } else if (branchId) {
      console.log(`🔍 Fetching collection sheet for branch: ${branchId}`);
      collectionSheet.type = 'BRANCH';
      
      const loanAccounts = await LoanAccount.find({
        BU_ID: branchId,
        LOAN_STATUS: { $in: ['ACTIVE', 'OVERDUE'] }
      })
      .populate('CUST_ID')
      .populate('groupLoan')
      .sort({ ACCT_NO: 1 });

      if (loanAccounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No active loans found for branch ${branchId}`
        });
      }

      collectionSheet.info = {
        branchId: branchId,
        totalLoans: loanAccounts.length,
        totalCustomers: new Set(loanAccounts.map(acc => acc.CUST_ID)).size,
        disbursementInfo: getBranchDisbursementInfo(loanAccounts)
      };

      await processLoanAccounts(loanAccounts, collectionSheet);

    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide one of: groupId, loanId, customerId, or branchId'
      });
    }

    // Final calculations
    collectionSheet.summary.averageInstallment = collectionSheet.members.length > 0 ?
      collectionSheet.summary.totalInstallmentAmount / collectionSheet.members.length : 0;

    collectionSheet.summary.collectionRate = collectionSheet.summary.totalLoanAmount > 0 ?
      ((collectionSheet.summary.totalRepaid) / collectionSheet.summary.totalLoanAmount * 100) : 0;

    collectionSheet.summary.disbursementRate = collectionSheet.summary.totalLoanAmount > 0 ?
      ((collectionSheet.summary.totalDisbursed) / collectionSheet.summary.totalLoanAmount * 100) : 0;

    collectionSheet.members.sort((a, b) => a.customerName.localeCompare(b.customerName));

    console.log(`✅ ${collectionSheet.type} Collection sheet generated successfully`);

    res.status(200).json({
      success: true,
      message: `${collectionSheet.type} collection sheet generated successfully`,
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

export const getGroupRepaymentCollectionSheet = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { includeHistory, startDate, endDate } = req.query;

  // Define getLoanAccountDisbursementInfo locally within this function
  const getLoanAccountDisbursementInfo = (loanAccount, groupLoan = null) => {
    const disbursedAmount = parseFloat(loanAccount.ACTUAL_DISBURSEMENT?.toString() || '0');
    const disbursementLimit = parseFloat(loanAccount.DISBURSEMENT_LIMIT?.toString() || '0');
    const totalFees = parseFloat(loanAccount.FEE_DETAILS?.totalFees?.toString() || '0');
    const upfrontInterest = parseFloat(loanAccount.upfrontInterestAmount?.toString() || '0');
    
    let memberDisbursementDetails = null;
    if (groupLoan && groupLoan.disbursementResults?.details?.successful) {
      memberDisbursementDetails = groupLoan.disbursementResults.details.successful.find(
        disbursement => disbursement.loanAccountNumber === loanAccount.ACCT_NO
      );
    }

    return {
      approvedAmount: disbursementLimit,
      actualDisbursement: disbursedAmount,
      totalFeesDeducted: totalFees,
      upfrontInterestDeducted: upfrontInterest,
      netAmountReceived: disbursedAmount,
      disbursementMethod: loanAccount.disbursementMethod,
      disbursementDate: loanAccount.START_DT,
      memberSpecificDetails: memberDisbursementDetails,
      verification: {
        approvedAmount: disbursementLimit,
        totalDeductions: totalFees + upfrontInterest,
        shouldDisburse: disbursementLimit - (totalFees + upfrontInterest),
        actualDisbursed: disbursedAmount,
        isAccurate: Math.abs(disbursedAmount - (disbursementLimit - totalFees - upfrontInterest)) < 0.01
      }
    };
  };

  // Define getMemberRepaymentStatus locally as well
  const getMemberRepaymentStatus = (loanAccount, loanSummary, groupLoan) => {
    const disbursementInfo = getLoanAccountDisbursementInfo(loanAccount, groupLoan);
    const isOverdue = loanSummary?.DELINQUENT_DAYS > 0;
    const overdueAmount = isOverdue ? parseFloat(loanSummary?.OUTSTANDING_PRINCIPAL?.toString() || '0') : 0;
    const isFullyPaid = parseFloat(loanSummary?.OUTSTANDING_PRINCIPAL?.toString() || '0') <= 0;

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
      loanAmount: parseFloat(loanAccount.DISBURSEMENT_LIMIT?.toString() || '0'),
      actualDisbursement: disbursementInfo.actualDisbursement,
      individualShare: parseFloat(loanAccount.individualShare?.toString() || '0'),
      installmentAmount: memberInstallment,
      totalRepaid: parseFloat(loanSummary?.TOTAL_REPAYMENT?.toString() || '0'),
      outstandingBalance: parseFloat(loanSummary?.OUTSTANDING_PRINCIPAL?.toString() || '0'),
      overdueAmount: overdueAmount,
      lastPaymentDate: loanSummary?.LAST_PAYMENT_DT,
      lastPaymentAmount: parseFloat(loanSummary?.LAST_PAYMENT_AMOUNT?.toString() || '0'),
      nextPaymentDate: loanSummary?.NEXT_PAYMENT_DT,
      isOverdue: isOverdue,
      daysOverdue: loanSummary?.DELINQUENT_DAYS || 0,
      isFullyPaid: isFullyPaid,
      paidInstallments: loanSummary?.PAID_INSTALLMENTS || 0,
      totalInstallments: loanSummary?.TOTAL_INSTALLMENTS || 0,
      remainingInstallments: (loanSummary?.TOTAL_INSTALLMENTS || 0) - (loanSummary?.PAID_INSTALLMENTS || 0),
      phone: loanAccount.CUST_ID?.PHONE_NO || 'N/A',
      email: loanAccount.CUST_ID?.EMAIL || 'N/A',
      collectionNotes: '',
      lastCollectionDate: null,
      collectionOfficer: loanAccount.PRIMARY_OFFICER_ID
    };
  };

  try {
    console.log(`🔍 Fetching repayment collection sheet for group: ${groupId}`);

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

    const loanAccountIds = loanAccounts.map(acc => acc._id);
    const loanSummaries = await LoanAccountSummary.find({
      ACCT_ID: { $in: loanAccountIds }
    });

    const summaryMap = new Map();
    loanSummaries.forEach(summary => {
      summaryMap.set(summary.ACCT_ID.toString(), summary);
    });

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

    for (const loanAccount of loanAccounts) {
      const loanSummary = summaryMap.get(loanAccount._id.toString());
      const repaymentStatus = getMemberRepaymentStatus(loanAccount, loanSummary, groupLoan);

      collectionSheet.memberRepayments.push(repaymentStatus);

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

      if (repaymentStatus.nextPaymentDate && 
          (!collectionSheet.repaymentSummary.nextCollectionDate || 
           repaymentStatus.nextPaymentDate < collectionSheet.repaymentSummary.nextCollectionDate)) {
        collectionSheet.repaymentSummary.nextCollectionDate = repaymentStatus.nextPaymentDate;
      }
    }

    collectionSheet.repaymentSummary.collectionRate = 
      collectionSheet.repaymentSummary.totalLoanAmount > 0 ?
      (collectionSheet.repaymentSummary.totalRepaid / collectionSheet.repaymentSummary.totalLoanAmount) * 100 : 0;

    collectionSheet.repaymentSummary.averageInstallment = 
      collectionSheet.repaymentSummary.activeMembers > 0 ?
      collectionSheet.repaymentSummary.totalOutstanding / collectionSheet.repaymentSummary.activeMembers : 0;

    if (includeHistory === 'true') {
      collectionSheet.paymentHistory = await getGroupPaymentHistory(groupLoan._id, startDate, endDate);
    }

    console.log(`✅ Group repayment collection sheet generated for ${groupId}`);

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

// ========== ASYNC HELPER FUNCTIONS ==========

async function processLoanAccounts(loanAccounts, collectionSheet, groupLoan = null) {
  const loanAccountIds = loanAccounts.map(acc => acc._id);
  const loanAccountNumbers = loanAccounts.map(acc => acc.ACCT_NO).filter(accNo => accNo);
  
  const loanSummaries = await LoanAccountSummary.find({
    $or: [
      { ACCT_ID: { $in: loanAccountIds } },
      { ACCT_NO: { $in: loanAccountNumbers } }
    ]
  });

  const summaryByIdMap = new Map();
  const summaryByNoMap = new Map();
  
  loanSummaries.forEach(summary => {
    if (summary.ACCT_ID) {
      summaryByIdMap.set(summary.ACCT_ID.toString(), summary);
    }
    if (summary.ACCT_NO) {
      summaryByNoMap.set(summary.ACCT_NO, summary);
    }
  });

  for (const loanAcc of loanAccounts) {
    try {
      let loanSummary = summaryByIdMap.get(loanAcc._id.toString());
      if (!loanSummary && loanAcc.ACCT_NO) {
        loanSummary = summaryByNoMap.get(loanAcc.ACCT_NO);
      }

      if (!loanSummary) {
        loanSummary = await createLoanSummaryFromLoanAccount(loanAcc, groupLoan);
      }

      const disbursementInfo = getLoanAccountDisbursementInfo(loanAcc, groupLoan);

      const memberRecord = {
        memberId: loanAcc.CUST_ID?._id || loanAcc.CUST_ID || loanAcc._id,
        customerId: loanAcc.CUST_ID?.CUST_ID || loanAcc.CUST_ID || 'N/A',
        customerName: loanAcc.CUST_ID?.FIRST_NM ? 
          `${loanAcc.CUST_ID.FIRST_NM || ''} ${loanAcc.CUST_ID.MIDDLE_NM || ''} ${loanAcc.CUST_ID.LAST_NM || ''}`.trim() :
          loanAcc.ACCT_NM || 'Customer Name Not Available',
        loanAccountNo: loanAcc.ACCT_NO || `ACC-${loanAcc._id}`,
        accountName: loanAcc.ACCT_NM || 'N/A',
        netDisbursementAmount: parseFloat(loanSummary.ORIGINAL_PRINCIPAL.toFixed(2)),
        loanAmount: parseFloat(loanSummary.ORIGINAL_PRINCIPAL.toFixed(2)),
        feesDeducted: calculateFeesFromLoanAccount(loanAcc),
        installmentAmount: parseFloat(loanSummary.INSTALLMENT_AMOUNT.toFixed(2)),
        totalRepayment: parseFloat(loanSummary.TOTAL_REPAYMENT.toFixed(2)),
        outstandingBalance: parseFloat(loanSummary.OUTSTANDING_PRINCIPAL.toFixed(2)),
        lastPaymentAmount: parseFloat(loanSummary.LAST_PAYMENT_AMOUNT.toFixed(2)),
        disbursementDetails: disbursementInfo,
        startDate: loanSummary.START_DT,
        nextPaymentDate: loanSummary.NEXT_PAYMENT_DT,
        paymentFrequency: loanSummary.PAYMENT_FREQUENCY,
        lastPaymentDate: loanSummary.LAST_PAYMENT_DT,
        maturityDate: loanSummary.MATURITY_DT,
        isOverdue: loanSummary.DELINQUENT_DAYS > 0,
        daysOverdue: loanSummary.DELINQUENT_DAYS,
        loanStatus: loanSummary.LOAN_STATUS,
        paidInstallments: loanSummary.PAID_INSTALLMENTS,
        totalInstallments: loanSummary.TOTAL_INSTALLMENTS,
        remainingInstallments: loanSummary.TOTAL_INSTALLMENTS - loanSummary.PAID_INSTALLMENTS,
        branchId: loanAcc.BU_ID,
        productType: loanAcc.PRODUCT_TYPE,
        interestRate: parseFloat(loanAcc.INTEREST_RATE?.toString() || '0'),
        isGroupLoan: !!loanAcc.groupLoan,
        groupLoanId: loanAcc.groupLoan?.loanId || null
      };

      collectionSheet.members.push(memberRecord);

      collectionSheet.summary.totalMembers++;
      collectionSheet.summary.totalOutstanding += memberRecord.outstandingBalance;
      collectionSheet.summary.totalInstallmentAmount += memberRecord.installmentAmount;
      collectionSheet.summary.totalLoanAmount += memberRecord.loanAmount;
      collectionSheet.summary.totalRepaid += memberRecord.totalRepayment;
      collectionSheet.summary.totalDisbursed += disbursementInfo.actualDisbursement;
      collectionSheet.summary.totalFeesCollected += disbursementInfo.totalFeesDeducted;
      collectionSheet.summary.totalUpfrontInterest += disbursementInfo.upfrontInterestDeducted;
      collectionSheet.summary.netDisbursement += disbursementInfo.netAmountReceived;
      collectionSheet.summary.activeMembers++;
      
      if (memberRecord.isOverdue) {
        collectionSheet.summary.overdueMembers++;
      }

    } catch (error) {
      console.error(`❌ Error processing loan ${loanAcc.ACCT_NO}:`, error.message);
    }
  }
}

async function createLoanSummaryFromLoanAccount(loanAcc, groupLoan = null) {
  const loanAmount = loanAcc.ACTUAL_DISBURSEMENT || 
                    loanAcc.ORIGINAL_PRINCIPAL || 
                    loanAcc.DISBURSEMENT_LIMIT || 
                    (groupLoan ? (groupLoan.totalAmount / groupLoan.members?.length) : 0) || 0;

  const installmentAmount = groupLoan?.installmentAmount || 
                           loanAcc.installmentAmount ||
                           (loanAmount * 0.05);

  const paymentFrequency = groupLoan?.paymentFrequency || 
                          loanAcc.PAYMENT_FREQUENCY || 
                          'MONTHLY';

  const startDate = loanAcc.START_DT || loanAcc.disbursedAt || (groupLoan?.disbursedAt) || new Date();
  
  const nextPaymentDate = new Date(startDate);
  switch (paymentFrequency.toUpperCase()) {
    case 'WEEKLY':
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 7);
      break;
    case 'BI-WEEKLY':
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 14);
      break;
    case 'MONTHLY':
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      break;
    case 'QUARTERLY':
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 3);
      break;
    default:
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
  }

  const maturityDate = new Date(startDate);
  if (loanAcc.TERM_CD && loanAcc.TERM_VALUE) {
    switch (loanAcc.TERM_CD.toUpperCase()) {
      case 'M':
      case 'MONTHLY':
        maturityDate.setMonth(maturityDate.getMonth() + loanAcc.TERM_VALUE);
        break;
      case 'Y':
      case 'YEARLY':
        maturityDate.setFullYear(maturityDate.getFullYear() + loanAcc.TERM_VALUE);
        break;
      default:
        maturityDate.setMonth(maturityDate.getMonth() + 12);
    }
  } else {
    maturityDate.setMonth(maturityDate.getMonth() + 12);
  }

  let totalInstallments = 12;
  if (loanAcc.TERM_CD && loanAcc.TERM_VALUE) {
    const termInMonths = loanAcc.TERM_CD.toUpperCase() === 'Y' ? loanAcc.TERM_VALUE * 12 : loanAcc.TERM_VALUE;
    
    switch (paymentFrequency.toUpperCase()) {
      case 'WEEKLY':
        totalInstallments = Math.ceil(termInMonths * 4.33);
        break;
      case 'BI-WEEKLY':
        totalInstallments = Math.ceil(termInMonths * 2.17);
        break;
      case 'MONTHLY':
        totalInstallments = termInMonths;
        break;
      case 'QUARTERLY':
        totalInstallments = Math.ceil(termInMonths / 3);
        break;
      default:
        totalInstallments = termInMonths;
    }
  }

  const loanSummary = new LoanAccountSummary({
    ACCT_ID: loanAcc._id,
    ACCT_NO: loanAcc.ACCT_NO || loanAcc.accountNumber,
    CUST_ID: loanAcc.CUST_ID,
    ORIGINAL_PRINCIPAL: loanAmount,
    OUTSTANDING_PRINCIPAL: loanAmount,
    INSTALLMENT_AMOUNT: installmentAmount,
    TOTAL_INSTALLMENTS: totalInstallments,
    PAID_INSTALLMENTS: 0,
    NEXT_PAYMENT_DT: nextPaymentDate,
    MATURITY_DT: maturityDate,
    START_DT: startDate,
    PAYMENT_FREQUENCY: paymentFrequency,
    LOAN_STATUS: loanAcc.LOAN_STATUS || 'ACTIVE',
    CREATED_BY: 'SYSTEM_AUTO_CREATE'
  });

  return await loanSummary.save();
}

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
        $limit: 50
      }
    ]);

    return history;
  } catch (error) {
    console.error('Error fetching payment history:', error);
    return [];
  }
}

// ========== SINGLE CLEAN EXPORT SECTION ==========

// Export all functions as named exports
export default  {
  getLoanAccountDisbursementInfo,
  getGroupDisbursementInfo,
  getIndividualDisbursementInfo,
  getCustomerDisbursementInfo,
  getBranchDisbursementInfo,
  processLoanAccounts,
  generateInstallmentSchedule,
  calculateGroupMaturityDate,
  getRepaymentTrend,
  getMemberPerformanceStats,
  getGroupPaymentHistory
};

