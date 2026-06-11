// routes/groupRoutes.js - CLEAN FIXED VERSION

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import sequelize from '../../config/db.js';
import {
  createGroup,
  getGroups,
  addMemberToGroup,
  createGroupLoanApplication,
  disburseGroupLoan,
  repayGroupLoan,
  getGroupLoan,
  approveGroupLoan,
  rejectGroupLoan,
  getPendingCreditApplications,
  getApprovedCreditApplications, 
  getRejectedCreditApplications,
  getGroupLoanPortfolio,
  getGroupRepaymentCollectionSheet,
  submitGroupCollections,
  getGroupsByBranch 
} from '../controllers/GroupController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = Router();

console.log('🔄 Initializing group routes...');

// ============================================
// SIMPLE PING ENDPOINT - NO AUTH REQUIRED
// ============================================
router.get('/ping', (req, res) => {
  console.log('🏓 PING received at /api/group/ping');
  res.json({
    success: true,
    message: 'Group routes are alive!',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /ping',
      'GET /field-collection-sheet-test',
      'GET /field-collection-sheet',
      'GET /field-collection-summary',
      'GET /status'
    ]
  });
});

// ============================================
// GROUP MANAGEMENT ROUTES
// ============================================

router.post('/groups', authenticate, createGroup);
router.get('/groups', authenticate, getGroups);
router.post('/groups/:groupCode/members', authenticate, addMemberToGroup);
router.get('/branch/:branchId', authenticate, getGroupsByBranch);

// ============================================
// GROUP LOAN MANAGEMENT ROUTES
// ============================================

router.post('/group-loans', authenticate, createGroupLoanApplication);
router.post('/group-loans/:id/disbursement', authenticate, disburseGroupLoan);
router.post('/group-loans/:groupLoanId/repayment', authenticate, repayGroupLoan);
router.get('/group-loans/portfolio', authenticate, getGroupLoanPortfolio);

// ============================================
// CREDIT APPLICATIONS ROUTES
// ============================================

router.get('/group-loans/pending-credit-applications', authenticate, getPendingCreditApplications);
router.get('/group-loans/approved-credit-applications', authenticate, getApprovedCreditApplications);
router.get('/group-loans/rejected-credit-applications', authenticate, getRejectedCreditApplications);

// ============================================
// PARAMETERIZED GROUP LOAN ROUTES
// ============================================

router.get('/group-loans/:id', authenticate, getGroupLoan);
router.patch('/group-loans/:id/approve', authenticate, approveGroupLoan);
router.patch('/group-loans/:id/reject', authenticate, rejectGroupLoan);

// ============================================
// FIELD COLLECTION SHEET ENDPOINT - OPTIMIZED VERSION
// ============================================

// Test endpoint to verify route is working (NO AUTH for testing)
router.get('/field-collection-sheet-test', (req, res) => {
  console.log('✅ Test endpoint hit at /field-collection-sheet-test');
  res.json({
    success: true,
    message: 'Field collection sheet test endpoint is working',
    user: req.user?.id || req.user?.username || 'Not authenticated',
    query: req.query,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// FIELD COLLECTION SHEET ENDPOINT - FIXED
// Now includes application_date as fallback for disbursement date.
// ============================================

router.get('/field-collection-sheet', authenticate, asyncHandler(async (req, res) => {
  const { groupId, groupName, collectionDate } = req.query;
  const currentCollectionDate = collectionDate ? new Date(collectionDate) : new Date();

  console.log('📊 Field Collection Sheet Request:', {
    groupId,
    groupName,
    collectionDate,
    user: req.user?.id,
    timestamp: new Date().toISOString()
  });

  if (!sequelize) {
    return res.status(503).json({
      success: false,
      message: 'Database connection not available'
    });
  }

  try {
    // ============================================
    // 1. Fetch group loan details – now includes application_date
    // ============================================
    let groupWhereClause = '';
    const groupReplacements = [];

    if (groupId && groupName) {
      groupWhereClause = `WHERE (gl.id = ? OR gl.group_name LIKE ?)`;
      groupReplacements.push(groupId, `%${groupName}%`);
    } else if (groupId) {
      groupWhereClause = `WHERE gl.id = ?`;
      groupReplacements.push(groupId);
    } else if (groupName) {
      groupWhereClause = `WHERE gl.group_name LIKE ?`;
      groupReplacements.push(`%${groupName}%`);
    } else {
      groupWhereClause = `WHERE 1=1`;
    }

    const groupLoans = await sequelize.query(`
      SELECT 
        gl.id as group_loan_id,
        gl.group_code,
        gl.group_name,
        gl.members,
        gl.total_amount,
        gl.loan_term,
        gl.term_value,
        gl.disbursed_at,
        gl.application_date,                -- NEW: fetch application_date
        gl.primary_relationship_manager as relationship_officer,
        gl.status as loan_status,
        gl.installment_amount,
        gl.num_periods,
        gl.total_interest,
        gl.total_repayable
      FROM group_loans gl
      ${groupWhereClause}
      ORDER BY gl.id
      LIMIT 1
    `, {
      replacements: groupReplacements,
      type: sequelize.QueryTypes.SELECT,
      timeout: 30000
    });

    console.log(`📊 Found ${groupLoans.length} group loans`);

    if (groupLoans.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No group loans found for the specified criteria'
      });
    }

    const groupLoan = groupLoans[0];

    // Determine the effective disbursement date: use disbursed_at if set, otherwise application_date
    let effectiveDisbursementDate = null;
    if (groupLoan.disbursed_at) {
      effectiveDisbursementDate = new Date(groupLoan.disbursed_at);
    } else if (groupLoan.application_date) {
      effectiveDisbursementDate = new Date(groupLoan.application_date);
    }
    const disbursementDateStr = effectiveDisbursementDate ? effectiveDisbursementDate.toLocaleDateString() : 'N/A';

    // Parse members from the group loan – handle both string array and object array
    let rawMembers = [];
    if (groupLoan.members) {
      try {
        rawMembers = typeof groupLoan.members === 'string' ? JSON.parse(groupLoan.members) : groupLoan.members;
        console.log(`Group ${groupLoan.group_name} has ${rawMembers.length} raw members:`, rawMembers);
      } catch (e) {
        console.error('Error parsing members:', e);
      }
    }

    if (rawMembers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No members found in this group loan'
      });
    }

    // Normalize members to objects with memberId and name (if available)
    const members = rawMembers.map(member => {
      if (typeof member === 'string') {
        return { memberId: member, name: null, installmentsPaid: 0, amountPaid: 0 };
      } else if (typeof member === 'object' && member !== null) {
        return {
          memberId: member.memberId || member.id,
          name: member.name || null,
          installmentsPaid: member.installmentsPaid || 0,
          amountPaid: member.amountPaid || 0
        };
      } else {
        return null;
      }
    }).filter(m => m !== null);

    console.log(`Normalized ${members.length} members`);

    // Calculate the correct installment amount
    const numPeriods = parseInt(groupLoan.num_periods) || 12;
    const totalRepayable = parseFloat(groupLoan.total_repayable) || parseFloat(groupLoan.total_amount) || 0;
    let calculatedInstallmentAmount = totalRepayable / numPeriods;
    const effectiveInstallmentAmount = (parseFloat(groupLoan.installment_amount) > 0)
      ? parseFloat(groupLoan.installment_amount)
      : calculatedInstallmentAmount;

    console.log(`📊 Loan details - Total: ${totalRepayable}, Periods: ${numPeriods}, Installment: ${effectiveInstallmentAmount}`);

    // STEP 2: Get all loan accounts for these members (active or partially repaid)
    const memberConditions = members.map(member => {
      const memberId = member.memberId;
      const cleanId = memberId.toString().replace(/^0+/, '');
      const paddedId = cleanId.padStart(10, '0');
      return `(la.CUST_ID = '${cleanId}' OR la.CUST_ID = '${paddedId}')`;
    }).join(' OR ');

    const allLoans = await sequelize.query(`
      SELECT 
        la.id as loan_id,
        la.a_c_c_t__n_o as loan_account_number,
        la.a_c_c_t__n_m as customer_name,
        la.CUST_ID as customer_id,
        la.a_m_o_u_n_t as disbursed_amount,
        la.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l as outstanding_principal,
        la.a_c_c_r_u_e_d__i_n_t_e_r_e_s_t as outstanding_interest,
        la.l_a_s_t__r_e_p_a_y_m_e_n_t__d_a_t_e as last_payment_date,
        la.m_a_t_u_r_i_t_y__d_t as maturity_date,
        la.d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e as disbursement_date,
        la.l_o_a_n__s_t_a_t_u_s as loan_status,
        rs.schedule as repayment_schedule,
        rs.installments_json,
        rs.status as schedule_status,
        CASE 
          WHEN la.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l <= 0 THEN 'PAID'
          WHEN la.m_a_t_u_r_i_t_y__d_t < CURDATE() THEN 'OVERDUE'
          WHEN DATEDIFF(CURDATE(), COALESCE(la.l_a_s_t__r_e_p_a_y_m_e_n_t__d_a_t_e, la.d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e)) > 45 THEN 'OVERDUE'
          ELSE 'CURRENT'
        END as payment_status,
        DATEDIFF(CURDATE(), COALESCE(la.l_a_s_t__r_e_p_a_y_m_e_n_t__d_a_t_e, la.d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e)) as days_since_last_payment
      FROM loan_accounts la
      LEFT JOIN repayment_schedules rs ON rs.loan_account_id = la.id
      WHERE la.l_o_a_n__s_t_a_t_u_s IN ('ACTIVE', 'PARTIALLY_REPAID')
        AND la.d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e IS NOT NULL
        AND (${memberConditions})
    `, {
      type: sequelize.QueryTypes.SELECT,
      timeout: 30000
    });

    console.log(`📊 Found ${allLoans.length} active loans for group members`);

    // Map loan details by customer_id
    const loanMap = new Map();
    allLoans.forEach(loan => {
      const cleanId = loan.customer_id ? loan.customer_id.toString().replace(/^0+/, '') : '';
      loanMap.set(cleanId, loan);
    });

    // Helper function to parse repayment schedule
    const parseRepaymentSchedule = (scheduleStr) => {
      if (!scheduleStr) return null;
      try {
        if (typeof scheduleStr === 'string') {
          return JSON.parse(scheduleStr);
        }
        return scheduleStr;
      } catch (e) {
        return null;
      }
    };

    // Helper function to get current expected amount from repayment schedule
    const getExpectedAmountFromSchedule = (repaymentSchedule, currentDate) => {
      if (!repaymentSchedule || !Array.isArray(repaymentSchedule)) {
        return null;
      }
      const currentInstallment = repaymentSchedule.find(inst =>
        inst.status === 'PENDING' || inst.status === 'OVERDUE' || inst.status === 'DUE'
      );
      if (currentInstallment) {
        return {
          amount: parseFloat(currentInstallment.totalPayment) || 0,
          dueDate: currentInstallment.dueDate,
          installmentNo: currentInstallment.installmentNo,
          status: currentInstallment.status
        };
      }
      return null;
    };

    const paymentFrequency = groupLoan.loan_term || 'MONTHLY';
    const membersWithLoans = [];

    // Iterate over all members (including those without loans)
    for (const member of members) {
      const cleanMemberId = member.memberId.toString().replace(/^0+/, '');
      const loan = loanMap.get(cleanMemberId);

      // Get member name
      let memberName = member.name;
      if (!memberName && loan) {
        memberName = loan.customer_name;
      }
      if (!memberName) {
        memberName = 'Unknown';
      }

      const installmentsPaid = member.installmentsPaid || 0;
      const nextInstallmentNumber = installmentsPaid + 1;

      let expectedAmount = 0;
      let nextDueDate = null;
      let outstandingPrincipal = 0;
      let outstandingInterest = 0;
      let totalDue = 0;
      let disbursedAmount = 0;
      let loanAccountNumber = null;
      let lastPaymentDate = null;
      let maturityDate = null;
      let disbursementDate = null;
      let daysSinceLastPayment = 0;
      let paymentStatus = 'NO_LOAN';
      let isMemberOverdue = false;

      if (loan) {
        // Member has an active loan
        disbursedAmount = Math.abs(parseFloat(loan.disbursed_amount) || 0);
        outstandingPrincipal = Math.abs(parseFloat(loan.outstanding_principal) || 0);
        outstandingInterest = Math.abs(parseFloat(loan.outstanding_interest) || 0);
        totalDue = outstandingPrincipal + outstandingInterest;
        loanAccountNumber = loan.loan_account_number;
        lastPaymentDate = loan.last_payment_date;
        maturityDate = loan.maturity_date;
        disbursementDate = loan.disbursement_date;
        daysSinceLastPayment = parseInt(loan.days_since_last_payment) || 0;

        // Calculate expected amount based on repayment schedule or installment number
        if (nextInstallmentNumber <= numPeriods) {
          expectedAmount = effectiveInstallmentAmount;

          if (effectiveDisbursementDate) {
            nextDueDate = new Date(effectiveDisbursementDate);
            if (paymentFrequency.toLowerCase() === 'monthly') {
              nextDueDate.setMonth(effectiveDisbursementDate.getMonth() + nextInstallmentNumber);
            } else if (paymentFrequency.toLowerCase() === 'weekly') {
              nextDueDate.setDate(effectiveDisbursementDate.getDate() + (nextInstallmentNumber * 7));
            }
          }
        } else {
          expectedAmount = 0;
        }

        // Override with repayment schedule if available
        let repaymentSchedule = null;
        if (loan.repayment_schedule) {
          repaymentSchedule = parseRepaymentSchedule(loan.repayment_schedule);
        } else if (loan.installments_json) {
          repaymentSchedule = parseRepaymentSchedule(loan.installments_json);
        }

        if (repaymentSchedule && repaymentSchedule.length > 0) {
          const expectedInfo = getExpectedAmountFromSchedule(repaymentSchedule, currentCollectionDate);
          if (expectedInfo) {
            expectedAmount = expectedInfo.amount;
            nextDueDate = expectedInfo.dueDate;
          }
        }

        isMemberOverdue = nextDueDate && new Date(nextDueDate) < currentCollectionDate;
        paymentStatus = isMemberOverdue ? 'OVERDUE' : (expectedAmount > 0 ? 'CURRENT' : 'PAID');
      } else {
        paymentStatus = 'NO_LOAN';
      }

      membersWithLoans.push({
        sn: membersWithLoans.length + 1,
        customer_id: cleanMemberId,
        customer_name: memberName,
        loan_account_number: loanAccountNumber || '',
        disbursed_amount: disbursedAmount,
        expected_amount: expectedAmount,
        installment_amount: effectiveInstallmentAmount,
        outstanding_principal: outstandingPrincipal,
        outstanding_interest: outstandingInterest,
        total_due: totalDue,
        payment_status: paymentStatus,
        days_since_last_payment: daysSinceLastPayment,
        last_payment_date: lastPaymentDate,
        maturity_date: maturityDate,
        is_overdue: isMemberOverdue,
        disbursement_date: disbursementDate,
        next_due_date: nextDueDate,
        installments_paid: installmentsPaid,
        next_installment: nextInstallmentNumber,
        total_installments: numPeriods
      });
    }

    // Calculate summary
    const totalMembers = membersWithLoans.length;
    const totalDisbursed = membersWithLoans.reduce((sum, m) => sum + m.disbursed_amount, 0);
    const totalExpected = membersWithLoans.reduce((sum, m) => sum + m.expected_amount, 0);
    const totalOverdue = membersWithLoans.reduce((sum, m) => sum + (m.is_overdue ? m.expected_amount : 0), 0);
    const overdueCount = membersWithLoans.filter(m => m.is_overdue).length;

    // ============================================
    // 3. Generate Excel sheet
    // ============================================
    const xlsxLib = await import('xlsx');
    const xlsx = xlsxLib.default;
    const workbook = xlsx.utils.book_new();

    const sheetData = [
      ['FIELD COLLECTION SHEET'],
      [''],
      ['Generated on:', new Date().toLocaleString()],
      [''],
      ['GROUP INFORMATION'],
      ['Group ID:', groupLoan.group_loan_id],
      ['Group Name:', groupLoan.group_name],
      ['Group Code:', groupLoan.group_code || 'N/A'],
      ['Loan Term:', `${paymentFrequency} (${numPeriods} periods total)`],
      ['Installment Amount:', `₦${effectiveInstallmentAmount.toLocaleString()}`],
      ['Relationship Officer:', groupLoan.relationship_officer || 'Not Assigned'],
      ['Disbursement/Application Date:', disbursementDateStr],   // updated label and value
      ['Total Loan Amount:', `₦${parseFloat(groupLoan.total_amount || 0).toLocaleString()}`],
      ['Collection Date:', collectionDate ? new Date(collectionDate).toLocaleDateString() : new Date().toLocaleDateString()],
      [''],
      ['MEMBER DETAILS'],
      [
        'S/N', 'Customer ID', 'Customer Name', 'Loan Account',
        'Disbursed (₦)', 'Installment (₦)', 'Expected (₦)',
        'Amount Collected (₦)', 'Savings (₦)', 'Union Purse (₦)',
        'Outstanding Principal (₦)', 'Outstanding Interest (₦)', 'Total Due (₦)',
        'Status', 'Overdue Days', 'Installments Paid', 'Next Due Date', 'Maturity Date', 'Notes'
      ]
    ];

    membersWithLoans.forEach((member, index) => {
      sheetData.push([
        index + 1,
        member.customer_id,
        member.customer_name,
        member.loan_account_number,
        member.disbursed_amount.toLocaleString(),
        member.installment_amount.toLocaleString(),
        member.expected_amount.toLocaleString(),
        '', // Amount Collected
        '', // Savings
        '', // Union Purse
        member.outstanding_principal.toLocaleString(),
        member.outstanding_interest.toLocaleString(),
        member.total_due.toLocaleString(),
        member.payment_status,
        member.days_since_last_payment,
        `${member.installments_paid}/${member.total_installments}`,
        member.next_due_date ? new Date(member.next_due_date).toLocaleDateString() : 'N/A',
        member.maturity_date ? new Date(member.maturity_date).toLocaleDateString() : 'N/A',
        ''
      ]);
    });

    // Summary and notes
    sheetData.push(
      [''],
      ['SUMMARY'],
      ['Total Members:', totalMembers],                                      ['COLLECTION SUMMARY'],
      ['Total Disbursed Amount:', `₦${totalDisbursed.toLocaleString()}`],    ['Total Collected:', ''],
      ['Total Expected Collection:', `₦${totalExpected.toLocaleString()}`],  ['Total Savings Collected:', ''],
      ['Total Overdue Amount:', `₦${totalOverdue.toLocaleString()}`],        ['Total Union Purse:', ''],
      ['Number of Overdue Members:', overdueCount],                          ['Balance:', ''],
      [''],                                                                  [''],
     
      ['OFFICER SIGNATURE:', '_________________________'], ['BRANCH MANAGER SIGNATURE:', '_________________________'],
      ['DATE:', new Date().toLocaleDateString()],          ['DATE:', new Date().toLocaleDateString()],
      ['Name:', '_________________________'],              ['Name:', '_________________________'],
      [''],                                                ['Stamp:', '_________________________'], 
                                                           [''],
      ['NOTES:'],
      ['1. Fill in the "Amount Collected" column for each member'],
      ['2. Collect savings separately in the "Savings Collected" column'],
      ['3. Union purse contributions go in the "Union Purse" column'],
      ['4. Overdue members require immediate attention'],
      ['5. Both Officer and Branch Manager signatures are required for validation'],
      ['6. "Expected" amount is the current installment due (Installment amount: ₦${effectiveInstallmentAmount.toLocaleString()})'],
      ['7. Installments Paid shows progress: e.g., "3/48" means 3 out of 48 installments completed'],
      ['8. Members with "NO_LOAN" status have no active loan; collect savings/union purse only.']
    );

    const ws = xlsx.utils.aoa_to_sheet(sheetData);
    const colWidths = [
      { wch: 5 }, { wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
      { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 20 }
    ];
    ws['!cols'] = colWidths;

    const sheetName = groupLoan.group_name.length > 31 ? groupLoan.group_name.substring(0, 28) + '...' : groupLoan.group_name;
    xlsx.utils.book_append_sheet(workbook, ws, sheetName);

    // Set response headers
    const fileName = `field_collection_sheet_${collectionDate || new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);

  } catch (error) {
    console.error('❌ Error generating field collection sheet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate field collection sheet',
      error: error.message
    });
  }
}));

// ============================================
// FIELD COLLECTION SUMMARY ENDPOINT (FIXED)
// ============================================

// ============================================
// FIELD COLLECTION SUMMARY ENDPOINT - FIXED
// ============================================

// ============================================
// FIELD COLLECTION SUMMARY ENDPOINT - FIXED
// ============================================

router.get('/field-collection-summary', authenticate, asyncHandler(async (req, res) => {
  const { groupId, groupName } = req.query;

  if (!sequelize) {
    return res.status(503).json({
      success: false,
      message: 'Database connection not available'
    });
  }

  try {
    // Build the WHERE clause for group filtering
    let whereClause = '';
    const replacements = [];

    if (groupId) {
      whereClause = 'AND g.id = ?';
      replacements.push(groupId);
    } else if (groupName) {
      whereClause = 'AND g.group_name LIKE ?';
      replacements.push(`%${groupName}%`);
    }
    // If no filter, we return all groups that have active loans.

    // Query groups and their members with active loans
    const results = await sequelize.query(`
      SELECT 
        g.id as group_id,
        g.group_name,
        g.group_code,
        la.CUST_ID as customer_id,
        la.a_c_c_t__n_m as customer_name,
        la.a_m_o_u_n_t as disbursed_amount
      FROM groups g
      INNER JOIN loan_accounts la ON JSON_CONTAINS(g.members, JSON_QUOTE(la.CUST_ID))
      WHERE la.l_o_a_n__s_t_a_t_u_s IN ('ACTIVE', 'PARTIALLY_REPAID')
        AND la.d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e IS NOT NULL
        ${whereClause}
      LIMIT 500
    `, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT,
      timeout: 30000
    });

    // Group results by group_id
    const groupsMap = new Map();
    results.forEach(row => {
      if (!groupsMap.has(row.group_id)) {
        groupsMap.set(row.group_id, {
          group_id: row.group_id,
          group_name: row.group_name,
          group_code: row.group_code,
          members: []
        });
      }
      const group = groupsMap.get(row.group_id);
      group.members.push({
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        disbursed_amount: parseFloat(row.disbursed_amount) || 0
      });
    });

    const groups = Array.from(groupsMap.values());

    // Calculate overall totals (across all returned groups)
    const totalMembers = groups.reduce((sum, g) => sum + g.members.length, 0);
    const totalDisbursed = groups.reduce((sum, g) => 
      sum + g.members.reduce((s, m) => s + m.disbursed_amount, 0), 0
    );

    res.json({
      success: true,
      data: {
        groups: groups,            // each group with its members
        total_groups: groups.length,
        total_members: totalMembers,
        total_disbursed: totalDisbursed,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error fetching field collection summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch field collection summary',
      error: error.message
    });
  }
}));

// ============================================
// GROUP REPAYMENT AND COLLECTION ROUTES
// ============================================

router.get('/group-repayment/:groupId', authenticate, getGroupRepaymentCollectionSheet);
router.post('/submit-collections', authenticate, submitGroupCollections);

// ============================================
// STATUS CHECK ROUTE
// ============================================

router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Group routes are working',
    timestamp: new Date().toISOString(),
    routes: [
      'GET /ping',
      'GET /field-collection-sheet-test',
      'GET /field-collection-sheet',
      'GET /field-collection-summary',
      'POST /groups',
      'GET /groups',
      'POST /groups/:groupCode/members',
      'GET /branch/:branchId',
      'POST /group-loans',
      'POST /group-loans/:id/disbursement',
      'POST /group-loans/:groupLoanId/repayment',
      'GET /group-loans/portfolio',
      'GET /group-loans/pending-credit-applications',
      'GET /group-loans/approved-credit-applications',
      'GET /group-loans/rejected-credit-applications',
      'GET /group-loans/:id',
      'PATCH /group-loans/:id/approve',
      'PATCH /group-loans/:id/reject',
      'GET /group-repayment/:groupId',
      'POST /submit-collections'
    ]
  });
});

console.log('✅ Group routes registered successfully');

export default router;