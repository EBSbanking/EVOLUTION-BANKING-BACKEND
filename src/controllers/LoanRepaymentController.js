import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanRepayment from '../models/LoanRepayment.js';
import LoanRepaymentTransaction from '../models/LoanRepaymentTransaction.js';
import sequelize from '../../config/db.js';

// ========== HELPER FUNCTIONS ==========

// Helper function: Generate receipt number
function generateReceiptNumber() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `RCPT-${timestamp}-${random}`;
}

// Helper function: Generate transaction IDs
function generateTransactionIds() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return {
    TRANSACTION_ID: `TXN-${timestamp}-${random}`,
    EVENT_ID: `EVT-${timestamp}-${random + 1}`,
    TRAN_JOURNAL_ID: `JRN-${timestamp}-${random + 2}`,
    transactionId: `TX-${timestamp}-${random + 3}`,
    JOURNAL_ID: `J-${timestamp}-${random + 4}`
  };
}

// Function: Create repayment transaction record
async function createRepaymentTransactionRecord(loanData, transaction) {
  console.log('Creating loan repayment transaction record...');
  
  try {
    // Map our data to match the database column names (using snake_case with underscores)
    const repaymentTransactionData = {
      a_c_c_t__i_d: loanData.loanAccountId,
      a_c_c_t__n_o: loanData.ACCT_NO || loanData.accountNumber,
      c_u_s_t__i_d: loanData.CUST_ID || loanData.customerId,
      t_r_a_n_s_a_c_t_i_o_n__d_a_t_e: new Date(loanData.paymentDate || new Date()),
      t_r_a_n_s_a_c_t_i_o_n__t_y_p_e: 'REPAYMENT',
      a_m_o_u_n_t: loanData.amount,
      p_r_i_n_c_i_p_a_l__a_m_o_u_n_t: loanData.principalPaid || 0,
      i_n_t_e_r_e_s_t__a_m_o_u_n_t: loanData.interestPaid || 0,
      p_a_y_m_e_n_t__m_e_t_h_o_d: (loanData.paymentMethod || 'CASH').toUpperCase().replace(/\s+/g, '_'),
      t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e: loanData.reference || `REPAY-${Date.now()}`,
      r_e_p_a_y_m_e_n_t__t_y_p_e: 'REPAYMENT',
      i_s__i_n_s_t_a_l_l_m_e_n_t: loanData.isInstallment || true,
      c_r_e_a_t_e_d__b_y: loanData.createdBy || 'system',
      s_t_a_t_u_s: 'COMPLETED',
      r_e_c_e_i_p_t__n_o: loanData.receiptNo || generateReceiptNumber(),
      b_r_a_n_c_h__c_o_d_e: loanData.branchCode || '001',
      p_r_o_d_u_c_t__c_o_d_e: loanData.productCode || 'DEFAULT',
      n_o_t_e_s: loanData.description || 'Loan repayment against schedule',
      g_l__p_o_s_t_e_d: false
    };
    
    console.log('Creating loan_repayment_transactions record:', repaymentTransactionData);
    const repaymentTransaction = await LoanRepaymentTransaction.create(repaymentTransactionData, { transaction });
    
    return repaymentTransaction.id;
    
  } catch (error) {
    console.error('Error creating loan repayment transaction record:', error);
    throw error;
  }
}

// ========== MAIN REPAYMENT FUNCTIONS ==========

export const handleLoanRepayment = async ({ 
  ACCT_NO, 
  amount, 
  date, 
  customerAccountNo,
  paymentMethod = 'BANK_TRANSFER',
  reference,
  description,
  createdBy = 'SYSTEM'
}) => {
  if (isNaN(new Date(date).getTime())) {
    throw new Error('Invalid repayment date.');
  }

  const transaction = await sequelize.transaction();

  try {
    // 1. Fetch loan account
    const loanAccount = await LoanAccount.findOne({ 
      where: { 
        ACCT_NO: String(ACCT_NO).trim() 
      },
      transaction
    });
    
    if (!loanAccount) {
      await transaction.rollback();
      throw new Error('Loan account not found.');
    }

    // 2. Check if loan is active
    const validRepaymentStatuses = ['ACTIVE', 'DISBURSED', 'ONGOING'];
    const loanStatus = loanAccount.LOAN_STATUS?.toUpperCase();
    if (!validRepaymentStatuses.includes(loanStatus)) {
      await transaction.rollback();
      throw new Error(`Loan account is not active for repayments. Current status: ${loanAccount.LOAN_STATUS}`);
    }

    // 3. Find customer account by account_number
    const customerAccount = await CustomerAccount.findOne({ 
      where: { 
        account_number: String(customerAccountNo).trim() 
      },
      transaction
    });

    if (!customerAccount) {
      await transaction.rollback();
      throw new Error(`Customer account ${customerAccountNo} not found.`);
    }

    // 4. Verify customer matches loan (optional but good practice)
    const loanCustId = String(loanAccount.CUST_ID).trim();
    const custId = String(customerAccount.customer_id).trim();
    
    if (loanCustId !== custId) {
      console.warn(`Customer ID mismatch: Loan has ${loanCustId}, Account has ${custId}`);
      // Continue anyway - sometimes accounts might be linked differently
    }

    // 5. Check customer balance
    const amountNum = parseFloat(amount.toString());
    
    // Get customer balance - using available_balance from your data
    let customerAvailableBalance;
    if (customerAccount.available_balance !== undefined) {
      customerAvailableBalance = parseFloat(customerAccount.available_balance);
    } else if (customerAccount.AVAILABLE_BALANCE !== undefined) {
      customerAvailableBalance = parseFloat(customerAccount.AVAILABLE_BALANCE);
    } else {
      customerAvailableBalance = 0;
    }

    if (customerAvailableBalance < amountNum) {
      await transaction.rollback();
      throw new Error(`Insufficient balance in customer account. Available: ${customerAvailableBalance}, Required: ${amountNum}`);
    }

    // 6. Update LoanAccount
    const currentOutstanding = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0);
    const currentTotalRepaid = parseFloat(loanAccount.TOTAL_REPAID_AMOUNT || 0);
    
    // Update outstanding principal
    const newOutstanding = Math.max(0, currentOutstanding - amountNum);
    
    // Update total repaid
    const newTotalRepaid = currentTotalRepaid + amountNum;
    
    // Prepare payment history
    const paymentHistory = loanAccount.paymentHistory || [];
    paymentHistory.push({
      date: new Date(date),
      amount: amountNum,
      type: 'REPAYMENT',
      description: 'Loan repayment'
    });

    // Update loan account
    await loanAccount.update({
      OUTSTANDING_PRINCIPAL: newOutstanding,
      TOTAL_REPAID_AMOUNT: newTotalRepaid,
      LAST_PAYMENT_DATE: new Date(date),
      LAST_PAYMENT_AMOUNT: amountNum,
      paymentHistory: paymentHistory,
      ...(newOutstanding <= 0 && {
        LOAN_STATUS: 'CLOSED',
        CLOSURE_DATE: new Date(date)
      })
    }, { transaction });

    // 7. Debit CustomerAccount
    const newCustomerBalance = customerAvailableBalance - amountNum;
    
    // Prepare transaction history
    const transactionHistory = customerAccount.transactionHistory || [];
    transactionHistory.push({
      date: new Date(date),
      amount: amountNum,
      type: 'LOAN_REPAYMENT',
      description: `Loan repayment for account ${ACCT_NO}`,
      reference: reference || `REPAY-${Date.now()}`
    });

    // Update customer account
    const updateData = {
      transactionHistory: transactionHistory
    };

    // Update appropriate balance field
    if (customerAccount.available_balance !== undefined) {
      updateData.available_balance = newCustomerBalance;
    } else if (customerAccount.AVAILABLE_BALANCE !== undefined) {
      updateData.AVAILABLE_BALANCE = newCustomerBalance;
    }

    // Also update ledger_balance if it exists
    if (customerAccount.ledger_balance !== undefined) {
      const currentLedger = parseFloat(customerAccount.ledger_balance);
      updateData.ledger_balance = currentLedger - amountNum;
    }

    await customerAccount.update(updateData, { transaction });

    // 8. Record repayment
    const repayment = await LoanRepayment.create({
      ACCT_NO: String(ACCT_NO).trim(),
      amount: amountNum,
      date: new Date(date),
      CUST_ID: String(loanAccount.CUST_ID).trim(),
      customerAccountNo: String(customerAccountNo).trim(),
      customerAccountId: customerAccount.id,
      loanAccountId: loanAccount.id,
      paymentMethod: paymentMethod,
      status: 'COMPLETED',
      reference: reference || `REPAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      details: {
        customerBalanceBefore: customerAvailableBalance,
        customerBalanceAfter: newCustomerBalance,
        loanOutstandingBefore: currentOutstanding,
        loanOutstandingAfter: newOutstanding,
        isFinalPayment: newOutstanding <= 0,
        description: description || 'Loan repayment'
      }
    }, { transaction });

    // 9. Create repayment transaction record
    const repaymentTransactionId = await createRepaymentTransactionRecord({
      loanAccountId: loanAccount.id,
      ACCT_NO: loanAccount.ACCT_NO,
      CUST_ID: loanAccount.CUST_ID,
      amount: amountNum,
      principalPaid: amountNum, // For basic repayment, assume all is principal
      interestPaid: 0,
      paymentDate: date,
      paymentMethod: paymentMethod,
      reference: reference || `REPAY-${Date.now()}`,
      description: description || 'Loan repayment',
      receiptNo: `RCPT-${Date.now()}`,
      isInstallment: false,
      createdBy: createdBy,
      branchCode: customerAccount.branch_code || '001',
      productCode: customerAccount.product_code || 'DEFAULT'
    }, transaction);

    await transaction.commit();

    return { 
      success: true, 
      message: 'Loan repayment successful.',
      data: {
        repaymentId: repayment.id,
        repaymentTransactionId: repaymentTransactionId,
        loanAccount: {
          ACCT_NO: loanAccount.ACCT_NO,
          newOutstandingPrincipal: newOutstanding,
          totalRepaid: newTotalRepaid,
          loanStatus: newOutstanding <= 0 ? 'CLOSED' : loanAccount.LOAN_STATUS
        },
        customerAccount: {
          accountNumber: customerAccount.account_number,
          balanceAfter: newCustomerBalance
        }
      }
    };

  } catch (error) {
    await transaction.rollback();
    return { success: false, error: error.message };
  }
};

export const repayLoan = async (req, res) => {
  try {
    const { 
      ACCT_NO, 
      amount, 
      date, 
      customerAccountNo,
      paymentMethod,
      reference,
      description,
      createdBy
    } = req.body;

    // Validate required fields
    const errors = [];
    if (!ACCT_NO) errors.push({ message: 'ACCT_NO is required' });
    if (!amount || isNaN(amount) || amount <= 0) errors.push({ message: 'Valid amount is required' });
    if (!date || isNaN(new Date(date).getTime())) errors.push({ message: 'Valid date is required' });
    if (!customerAccountNo) errors.push({ message: 'customerAccountNo is required' });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    const result = await handleLoanRepayment({ 
      ACCT_NO, 
      amount, 
      date, 
      customerAccountNo,
      paymentMethod,
      reference,
      description,
      createdBy: createdBy || req.user?.id || 'SYSTEM'
    });

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(400).json({
        success: false,
        message: result.error,
        errors: [{ message: result.error }]
      });
    }
  } catch (error) {
    console.error('[Repayment Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      errors: [{ message: error.message }]
    });
  }
};

export const getRepaymentHistoryService = async (ACCT_NO) => {
  try {
    const repayments = await LoanRepayment.findAll({ 
      where: { 
        ACCT_NO: String(ACCT_NO).trim() 
      },
      order: [['date', 'DESC']]
    });
    
    return repayments.map(repayment => {
      const repaymentData = repayment.toJSON();
      return {
        ...repaymentData,
        amount: parseFloat(repaymentData.amount) || 0,
        REPAYMENT_HISTORY: repaymentData.REPAYMENT_HISTORY?.map(item => ({
          amount: parseFloat(item.amount) || 0,
          date: item.date
        })) || []
      };
    });
  } catch (error) {
    throw new Error(`Error fetching repayment history: ${error.message}`);
  }
};

export const getRepaymentHistory = async (req, res) => {
  const { ACCT_NO } = req.query;

  if (!ACCT_NO) {
    return res.status(400).json({ 
      success: false,
      message: 'Account number is required',
      errors: [{ message: 'Account number is required' }]
    });
  }

  try {
    const result = await getRepaymentHistoryService(ACCT_NO);
    return res.status(200).json({
      success: true,
      message: 'Repayment history retrieved successfully',
      data: result,
      count: result.length
    });
  } catch (error) {
    console.error('[History Error]', error);
    return res.status(500).json({ 
      success: false,
      message: error.message || 'Error fetching repayment history',
      errors: [{ message: error.message || 'Internal server error' }]
    });
  }
};

// New enhanced functions for repayment management

export const getLoanRepaymentDetails = async (req, res) => {
  try {
    const { ACCT_NO, repaymentId } = req.query;

    if (!ACCT_NO && !repaymentId) {
      return res.status(400).json({
        success: false,
        message: 'Either ACCT_NO or repaymentId is required'
      });
    }

    let where = {};
    if (repaymentId) {
      where.id = repaymentId;
    } else {
      where.ACCT_NO = String(ACCT_NO).trim();
    }

    const repayments = await LoanRepayment.findAll({
      where,
      include: [
        {
          model: LoanAccount,
          as: 'loanAccount',
          attributes: ['ACCT_NO', 'CUST_ID', 'LOAN_STATUS', 'OUTSTANDING_PRINCIPAL', 'DISBURSEMENT_LIMIT']
        },
        {
          model: CustomerAccount,
          as: 'customerAccount',
          attributes: ['account_number', 'customer_name', 'available_balance']
        }
      ],
      order: [['date', 'DESC']]
    });

    if (repayments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No repayments found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Repayment details retrieved successfully',
      data: repayments.map(r => r.toJSON()),
      count: repayments.length
    });
  } catch (error) {
    console.error('[Get Repayment Details Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get repayment details',
      error: error.message
    });
  }
};

export const reverseLoanRepayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { repaymentId, reversalReason } = req.body;

    if (!repaymentId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'repaymentId is required'
      });
    }

    // Find the repayment
    const repayment = await LoanRepayment.findByPk(repaymentId, { transaction });
    if (!repayment) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Repayment not found'
      });
    }

    // Check if repayment can be reversed
    if (repayment.status !== 'COMPLETED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot reverse repayment with status: ${repayment.status}`
      });
    }

    const repaymentAmount = parseFloat(repayment.amount);
    const ACCT_NO = repayment.ACCT_NO;
    const customerAccountNo = repayment.customerAccountNo;

    // 1. Find loan account
    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: ACCT_NO.trim() },
      transaction
    });

    if (!loanAccount) {
      await transaction.rollback();
      throw new Error('Loan account not found.');
    }

    // 2. Find customer account
    const customerAccount = await CustomerAccount.findOne({
      where: { account_number: customerAccountNo.trim() },
      transaction
    });

    if (!customerAccount) {
      await transaction.rollback();
      throw new Error('Customer account not found.');
    }

    // 3. Reverse loan account changes
    const currentOutstanding = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0);
    const currentTotalRepaid = parseFloat(loanAccount.TOTAL_REPAID_AMOUNT || 0);

    // Add back to outstanding
    const newOutstanding = currentOutstanding + repaymentAmount;
    
    // Subtract from total repaid
    const newTotalRepaid = Math.max(0, currentTotalRepaid - repaymentAmount);

    await loanAccount.update({
      OUTSTANDING_PRINCIPAL: newOutstanding,
      TOTAL_REPAID_AMOUNT: newTotalRepaid,
      LOAN_STATUS: newOutstanding > 0 ? 'ACTIVE' : loanAccount.LOAN_STATUS,
      paymentHistory: [
        ...(loanAccount.paymentHistory || []),
        {
          date: new Date(),
          amount: repaymentAmount,
          type: 'REVERSAL',
          description: `Reversal of repayment ${repaymentId}: ${reversalReason || 'No reason provided'}`
        }
      ]
    }, { transaction });

    // 4. Credit customer account (reverse debit)
    let customerAvailableBalance;
    if (customerAccount.available_balance !== undefined) {
      customerAvailableBalance = parseFloat(customerAccount.available_balance);
      await customerAccount.update({
        available_balance: customerAvailableBalance + repaymentAmount,
        transactionHistory: [
          ...(customerAccount.transactionHistory || []),
          {
            date: new Date(),
            amount: repaymentAmount,
            type: 'LOAN_REPAYMENT_REVERSAL',
            description: `Reversal of loan repayment for account ${ACCT_NO}`,
            reference: `REV-${repaymentId}`
          }
        ]
      }, { transaction });
    }

    // 5. Update repayment record
    await repayment.update({
      status: 'REVERSED',
      reversalDate: new Date(),
      reversalReason: reversalReason || 'User requested reversal',
      reversalDetails: {
        reversedBy: req.user?.id || 'SYSTEM',
        reversedAt: new Date(),
        originalAmount: repaymentAmount,
        reason: reversalReason
      }
    }, { transaction });

    // 6. Create reversal audit record
    const reversalRecord = await LoanRepayment.create({
      ACCT_NO: ACCT_NO.trim(),
      amount: repaymentAmount,
      date: new Date(),
      CUST_ID: String(loanAccount.CUST_ID).trim(),
      customerAccountNo: customerAccountNo.trim(),
      customerAccountId: customerAccount.id,
      loanAccountId: loanAccount.id,
      paymentMethod: 'REVERSAL',
      status: 'REVERSED',
      reference: `REV-${repayment.reference}`,
      parentRepaymentId: repayment.id,
      details: {
        isReversal: true,
        originalRepaymentId: repayment.id,
        reversalReason: reversalReason,
        loanOutstandingAfterReversal: newOutstanding
      }
    }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Repayment reversed successfully',
      data: {
        reversalId: reversalRecord.id,
        originalRepaymentId: repayment.id,
        loanAccount: {
          ACCT_NO: loanAccount.ACCT_NO,
          newOutstandingPrincipal: newOutstanding,
          totalRepaid: newTotalRepaid,
          loanStatus: newOutstanding > 0 ? 'ACTIVE' : loanAccount.LOAN_STATUS
        },
        customerAccount: {
          accountNumber: customerAccount.account_number,
          balanceAfter: customerAvailableBalance + repaymentAmount
        }
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('[Repayment Reversal Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reverse repayment',
      error: error.message
    });
  }
};

export const getRepaymentSummary = async (req, res) => {
  try {
    const { ACCT_NO, startDate, endDate } = req.query;

    if (!ACCT_NO) {
      return res.status(400).json({
        success: false,
        message: 'ACCT_NO is required'
      });
    }

    const where = { ACCT_NO: String(ACCT_NO).trim() };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[sequelize.Op.gte] = new Date(startDate);
      if (endDate) where.date[sequelize.Op.lte] = new Date(endDate);
    }

    // Get loan details first
    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: String(ACCT_NO).trim() }
    });

    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: 'Loan account not found'
      });
    }

    // Get repayment summary
    const repaymentSummary = await LoanRepayment.findAll({
      where,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalRepayments'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
        [sequelize.fn('MIN', sequelize.col('date')), 'firstRepayment'],
        [sequelize.fn('MAX', sequelize.col('date')), 'lastRepayment']
      ],
      raw: true
    });

    const summary = repaymentSummary[0] || {
      totalRepayments: 0,
      totalAmount: 0,
      firstRepayment: null,
      lastRepayment: null
    };

    // Get recent repayments
    const recentRepayments = await LoanRepayment.findAll({
      where,
      order: [['date', 'DESC']],
      limit: 5
    });

    // Calculate loan metrics
    const loanData = loanAccount.toJSON();
    const disbursedAmount = parseFloat(loanData.DISBURSEMENT_LIMIT || 0);
    const outstandingPrincipal = parseFloat(loanData.OUTSTANDING_PRINCIPAL || 0);
    const totalRepaid = parseFloat(summary.totalAmount) || 0;

    const repaymentPercentage = disbursedAmount > 0 ? (totalRepaid / disbursedAmount) * 100 : 0;
    const remainingPercentage = 100 - repaymentPercentage;

    return res.status(200).json({
      success: true,
      message: 'Repayment summary retrieved successfully',
      data: {
        loanDetails: {
          ACCT_NO: loanData.ACCT_NO,
          disbursedAmount: disbursedAmount,
          outstandingPrincipal: outstandingPrincipal,
          loanStatus: loanData.LOAN_STATUS,
          interestRate: loanData.INTEREST_RATE,
          maturityDate: loanData.MATURITY_DT
        },
        repaymentSummary: {
          totalRepayments: parseInt(summary.totalRepayments) || 0,
          totalAmount: parseFloat(summary.totalAmount) || 0,
          firstRepayment: summary.firstRepayment,
          lastRepayment: summary.lastRepayment,
          repaymentPercentage: Math.round(repaymentPercentage * 100) / 100,
          remainingPercentage: Math.round(remainingPercentage * 100) / 100,
          averagePayment: parseInt(summary.totalRepayments) > 0 
            ? parseFloat(summary.totalAmount) / parseInt(summary.totalRepayments)
            : 0
        },
        recentRepayments: recentRepayments.map(r => r.toJSON()),
        recommendations: generateRepaymentRecommendations(
          loanData.LOAN_STATUS,
          outstandingPrincipal,
          disbursedAmount,
          totalRepaid
        )
      }
    });
  } catch (error) {
    console.error('[Repayment Summary Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get repayment summary',
      error: error.message
    });
  }
};

function generateRepaymentRecommendations(loanStatus, outstandingPrincipal, disbursedAmount, totalRepaid) {
  const recommendations = [];

  if (loanStatus === 'DELINQUENT') {
    recommendations.push(
      'Account is delinquent. Consider increasing repayment frequency.',
      'Review loan terms for possible restructuring.',
      'Contact customer for payment arrangement.'
    );
  }

  if (outstandingPrincipal > (disbursedAmount * 0.5) && totalRepaid < (disbursedAmount * 0.3)) {
    recommendations.push(
      'Slow repayment rate detected. Consider payment reminders.',
      'Evaluate customer\'s financial situation.'
    );
  }

  if (outstandingPrincipal < (disbursedAmount * 0.1)) {
    recommendations.push(
      'Loan nearly paid off. Consider early settlement options.',
      'Plan for loan closure documentation.'
    );
  }

  return recommendations;
}

export const bulkRepaymentProcessing = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { repayments } = req.body;

    if (!Array.isArray(repayments) || repayments.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'repayments array is required and must not be empty'
      });
    }

    const results = {
      successful: [],
      failed: [],
      totalProcessed: 0
    };

    // Process each repayment
    for (const repayment of repayments) {
      try {
        const { ACCT_NO, amount, date, customerAccountNo } = repayment;
        
        // Validate required fields
        if (!ACCT_NO || !amount || !date || !customerAccountNo) {
          results.failed.push({
            ...repayment,
            error: 'Missing required fields'
          });
          continue;
        }

        // Process individual repayment
        const result = await handleLoanRepayment({
          ACCT_NO,
          amount,
          date,
          customerAccountNo
        });

        if (result.success) {
          results.successful.push({
            ...repayment,
            result: result.data
          });
        } else {
          results.failed.push({
            ...repayment,
            error: result.error
          });
        }

        results.totalProcessed++;

      } catch (error) {
        results.failed.push({
          ...repayment,
          error: error.message
        });
      }
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Bulk repayment processing completed',
      data: {
        summary: {
          totalSubmitted: repayments.length,
          totalProcessed: results.totalProcessed,
          successful: results.successful.length,
          failed: results.failed.length,
          successRate: repayments.length > 0 
            ? (results.successful.length / repayments.length) * 100 
            : 0
        },
        successful: results.successful,
        failed: results.failed
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('[Bulk Repayment Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process bulk repayments',
      error: error.message
    });
  }
};

// ========== EXPORT HELPER FUNCTIONS ==========

export {
  generateReceiptNumber,
  generateTransactionIds,
  createRepaymentTransactionRecord
};