// controllers/loanRepaymentTransactionController.js
import LoanRepaymentTransaction from '../models/LoanRepaymentTransaction.js';
import LoanAccount from '../models/LoanAccount.js';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

// Async handler utility
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Create a new repayment transaction
export const createRepaymentTransaction = asyncHandler(async (req, res) => {
  const {
    ACCT_NO,
    CUST_ID,
    AMOUNT,
    PRINCIPAL_AMOUNT,
    INTEREST_AMOUNT,
    PAYMENT_METHOD = 'CASH',
    TRANSACTION_REFERENCE,
    REPAYMENT_TYPE = 'PRO_RATA',
    IS_INSTALLMENT = false,
    RECEIPT_NO,
    TRANSACTION_DATE,
    STATUS = 'COMPLETED'
  } = req.body;

  // Validate required fields
  if (!ACCT_NO || !CUST_ID || !AMOUNT || !PRINCIPAL_AMOUNT || !INTEREST_AMOUNT || !TRANSACTION_REFERENCE) {
    return res.status(400).json({
      success: false,
      message: 'ACCT_NO, CUST_ID, AMOUNT, PRINCIPAL_AMOUNT, INTEREST_AMOUNT, and TRANSACTION_REFERENCE are required fields.'
    });
  }

  // Validate amounts
  if (AMOUNT < 0 || PRINCIPAL_AMOUNT < 0 || INTEREST_AMOUNT < 0) {
    return res.status(400).json({
      success: false,
      message: 'AMOUNT, PRINCIPAL_AMOUNT, and INTEREST_AMOUNT must be positive numbers.'
    });
  }

  // Validate that principal + interest equals total amount
  if (Math.abs(AMOUNT - (PRINCIPAL_AMOUNT + INTEREST_AMOUNT)) > 0.01) {
    return res.status(400).json({
      success: false,
      message: `PRINCIPAL_AMOUNT (${PRINCIPAL_AMOUNT}) + INTEREST_AMOUNT (${INTEREST_AMOUNT}) must equal AMOUNT (${AMOUNT}).`
    });
  }

  const t = await sequelize.transaction();

  try {
    // Find the loan account to get ACCT_ID
    const loanAccount = await LoanAccount.findOne({
      where: { 
        ACCT_NO,
        CUST_ID 
      },
      transaction: t
    });

    if (!loanAccount) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: `Loan account not found for ACCT_NO: ${ACCT_NO} and CUST_ID: ${CUST_ID}`
      });
    }

    // Check for duplicate transaction reference
    const existingTransaction = await LoanRepaymentTransaction.findOne({
      where: { TRANSACTION_REFERENCE },
      transaction: t
    });

    if (existingTransaction) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Transaction with this reference already exists.'
      });
    }

    // Create the repayment transaction
    const repaymentTransaction = await LoanRepaymentTransaction.create({
      ACCT_ID: loanAccount.ACCT_ID,
      ACCT_NO,
      CUST_ID,
      TRANSACTION_DATE: TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date(),
      TRANSACTION_TYPE: 'REPAYMENT',
      AMOUNT,
      PRINCIPAL_AMOUNT,
      INTEREST_AMOUNT,
      PAYMENT_METHOD,
      TRANSACTION_REFERENCE,
      REPAYMENT_TYPE,
      IS_INSTALLMENT,
      CREATED_BY: req.user?.id || 'system',
      STATUS,
      RECEIPT_NO: RECEIPT_NO || TRANSACTION_REFERENCE
    }, { transaction: t });

    await t.commit();

    console.log(`✅ Repayment transaction created: ${TRANSACTION_REFERENCE} for account ${ACCT_NO}`);

    res.status(201).json({
      success: true,
      message: 'Repayment transaction created successfully.',
      data: repaymentTransaction
    });

  } catch (error) {
    await t.rollback();
    console.error('💥 Error creating repayment transaction:', error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference must be unique.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create repayment transaction.',
      error: error.message
    });
  }
});

// Get all repayment transactions with filtering and pagination
export const getRepaymentTransactions = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    ACCT_NO,
    CUST_ID,
    startDate,
    endDate,
    PAYMENT_METHOD,
    STATUS,
    REPAYMENT_TYPE
  } = req.query;

  const whereClause = {};

  // Build where clause
  if (ACCT_NO) whereClause.ACCT_NO = ACCT_NO;
  if (CUST_ID) whereClause.CUST_ID = CUST_ID;
  if (PAYMENT_METHOD) whereClause.PAYMENT_METHOD = PAYMENT_METHOD;
  if (STATUS) whereClause.STATUS = STATUS;
  if (REPAYMENT_TYPE) whereClause.REPAYMENT_TYPE = REPAYMENT_TYPE;

  // Date range filter
  if (startDate || endDate) {
    whereClause.TRANSACTION_DATE = {};
    if (startDate) whereClause.TRANSACTION_DATE[Op.gte] = new Date(startDate);
    if (endDate) whereClause.TRANSACTION_DATE[Op.lte] = new Date(endDate);
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: transactions } = await LoanRepaymentTransaction.findAndCountAll({
    where: whereClause,
    limit: parseInt(limit),
    offset: offset,
    order: [['TRANSACTION_DATE', 'DESC']],
    include: [{
      model: LoanAccount,
      attributes: ['ACCT_NM', 'LOAN_AMOUNT', 'LOAN_STATUS']
    }]
  });

  const totalPages = Math.ceil(count / parseInt(limit));

  res.status(200).json({
    success: true,
    message: 'Repayment transactions retrieved successfully.',
    data: {
      transactions,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: count,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    }
  });
});

// Get repayment transaction by ID
export const getRepaymentTransactionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid transaction ID format. Must be a number.'
    });
  }

  const transaction = await LoanRepaymentTransaction.findByPk(id, {
    include: [{
      model: LoanAccount,
      attributes: ['ACCT_NM', 'LOAN_AMOUNT', 'LOAN_STATUS', 'PRODUCT_TYPE']
    }]
  });

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Repayment transaction not found.'
    });
  }

  res.status(200).json({
    success: true,
    message: 'Repayment transaction retrieved successfully.',
    data: transaction
  });
});

// Get repayment transactions by account number
export const getTransactionsByAccount = asyncHandler(async (req, res) => {
  const { accountNo } = req.params;
  const {
    page = 1,
    limit = 10,
    startDate,
    endDate
  } = req.query;

  const whereClause = { ACCT_NO: accountNo };

  // Date range filter
  if (startDate || endDate) {
    whereClause.TRANSACTION_DATE = {};
    if (startDate) whereClause.TRANSACTION_DATE[Op.gte] = new Date(startDate);
    if (endDate) whereClause.TRANSACTION_DATE[Op.lte] = new Date(endDate);
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: transactions } = await LoanRepaymentTransaction.findAndCountAll({
    where: whereClause,
    limit: parseInt(limit),
    offset: offset,
    order: [['TRANSACTION_DATE', 'DESC']]
  });

  // Calculate totals
  const totalStats = await LoanRepaymentTransaction.findOne({
    where: whereClause,
    attributes: [
      [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount'],
      [sequelize.fn('SUM', sequelize.col('PRINCIPAL_AMOUNT')), 'totalPrincipal'],
      [sequelize.fn('SUM', sequelize.col('INTEREST_AMOUNT')), 'totalInterest'],
      [sequelize.fn('COUNT', sequelize.col('TRANSACTION_ID')), 'transactionCount']
    ],
    raw: true
  });

  const stats = totalStats || {
    totalAmount: 0,
    totalPrincipal: 0,
    totalInterest: 0,
    transactionCount: 0
  };

  const totalPages = Math.ceil(count / parseInt(limit));

  res.status(200).json({
    success: true,
    message: 'Account repayment transactions retrieved successfully.',
    data: {
      accountNo,
      transactions,
      summary: {
        totalAmount: parseFloat(stats.totalAmount) || 0,
        totalPrincipal: parseFloat(stats.totalPrincipal) || 0,
        totalInterest: parseFloat(stats.totalInterest) || 0,
        transactionCount: parseInt(stats.transactionCount) || 0
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: count,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    }
  });
});

// Get repayment transactions by customer ID
export const getTransactionsByCustomer = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const {
    page = 1,
    limit = 10,
    startDate,
    endDate
  } = req.query;

  const whereClause = { CUST_ID: customerId };

  // Date range filter
  if (startDate || endDate) {
    whereClause.TRANSACTION_DATE = {};
    if (startDate) whereClause.TRANSACTION_DATE[Op.gte] = new Date(startDate);
    if (endDate) whereClause.TRANSACTION_DATE[Op.lte] = new Date(endDate);
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: transactions } = await LoanRepaymentTransaction.findAndCountAll({
    where: whereClause,
    limit: parseInt(limit),
    offset: offset,
    order: [['TRANSACTION_DATE', 'DESC']],
    include: [{
      model: LoanAccount,
      attributes: ['ACCT_NM', 'LOAN_AMOUNT', 'PRODUCT_TYPE']
    }]
  });

  // Calculate customer totals
  const customerStats = await LoanRepaymentTransaction.findOne({
    where: whereClause,
    attributes: [
      [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount'],
      [sequelize.fn('SUM', sequelize.col('PRINCIPAL_AMOUNT')), 'totalPrincipal'],
      [sequelize.fn('SUM', sequelize.col('INTEREST_AMOUNT')), 'totalInterest'],
      [sequelize.fn('COUNT', sequelize.col('TRANSACTION_ID')), 'transactionCount'],
      [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('ACCT_NO'))), 'uniqueAccountsCount']
    ],
    raw: true
  });

  const stats = customerStats || {
    totalAmount: 0,
    totalPrincipal: 0,
    totalInterest: 0,
    transactionCount: 0,
    uniqueAccountsCount: 0
  };

  const totalPages = Math.ceil(count / parseInt(limit));

  res.status(200).json({
    success: true,
    message: 'Customer repayment transactions retrieved successfully.',
    data: {
      customerId,
      transactions,
      summary: {
        totalAmount: parseFloat(stats.totalAmount) || 0,
        totalPrincipal: parseFloat(stats.totalPrincipal) || 0,
        totalInterest: parseFloat(stats.totalInterest) || 0,
        transactionCount: parseInt(stats.transactionCount) || 0,
        uniqueAccounts: parseInt(stats.uniqueAccountsCount) || 0
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: count,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    }
  });
});

// Update repayment transaction status
export const updateTransactionStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { STATUS, updatedBy } = req.body;

  if (!id || isNaN(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid transaction ID format. Must be a number.'
    });
  }

  const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'];
  if (!STATUS || !validStatuses.includes(STATUS)) {
    return res.status(400).json({
      success: false,
      message: `STATUS is required and must be one of: ${validStatuses.join(', ')}`
    });
  }

  const transaction = await LoanRepaymentTransaction.findByPk(id);

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Repayment transaction not found.'
    });
  }

  // Don't allow updating completed transactions to pending
  if (transaction.STATUS === 'COMPLETED' && STATUS === 'PENDING') {
    return res.status(400).json({
      success: false,
      message: 'Cannot change COMPLETED transaction back to PENDING.'
    });
  }

  transaction.STATUS = STATUS;
  transaction.UPDATED_BY = updatedBy || req.user?.id || 'system';

  await transaction.save();

  console.log(`🔄 Transaction ${id} status updated to: ${STATUS}`);

  res.status(200).json({
    success: true,
    message: 'Transaction status updated successfully.',
    data: transaction
  });
});

// Delete repayment transaction (soft delete by changing status)
export const deleteRepaymentTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason, deletedBy } = req.body;

  if (!id || isNaN(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid transaction ID format. Must be a number.'
    });
  }

  const transaction = await LoanRepaymentTransaction.findByPk(id);

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Repayment transaction not found.'
    });
  }

  if (transaction.STATUS === 'COMPLETED') {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete COMPLETED transactions. Consider cancelling instead.'
    });
  }

  // Soft delete by changing status to CANCELLED
  transaction.STATUS = 'CANCELLED';
  transaction.UPDATED_BY = deletedBy || req.user?.id || 'system';
  
  // Store cancellation reason in a separate column or JSON field
  // Assuming you have a CANCELLATION_REASON column
  if (transaction.CANCELLATION_REASON !== undefined) {
    transaction.CANCELLATION_REASON = reason;
  }

  await transaction.save();

  console.log(`🗑️ Transaction ${id} cancelled. Reason: ${reason}`);

  res.status(200).json({
    success: true,
    message: 'Transaction cancelled successfully.',
    data: transaction
  });
});

// Get repayment statistics
export const getRepaymentStatistics = asyncHandler(async (req, res) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;

  const whereClause = { STATUS: 'COMPLETED' };

  // Date range filter
  if (startDate || endDate) {
    whereClause.TRANSACTION_DATE = {};
    if (startDate) whereClause.TRANSACTION_DATE[Op.gte] = new Date(startDate);
    if (endDate) whereClause.TRANSACTION_DATE[Op.lte] = new Date(endDate);
  }

  let groupColumn;
  switch (groupBy) {
    case 'day':
      groupColumn = sequelize.fn('DATE', sequelize.col('TRANSACTION_DATE'));
      break;
    case 'week':
      groupColumn = sequelize.fn('YEARWEEK', sequelize.col('TRANSACTION_DATE'));
      break;
    case 'month':
      groupColumn = sequelize.literal("DATE_FORMAT(TRANSACTION_DATE, '%Y-%m')");
      break;
    default:
      groupColumn = sequelize.fn('DATE', sequelize.col('TRANSACTION_DATE'));
  }

  const statistics = await LoanRepaymentTransaction.findAll({
    where: whereClause,
    attributes: [
      [groupColumn, 'date'],
      [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount'],
      [sequelize.fn('SUM', sequelize.col('PRINCIPAL_AMOUNT')), 'totalPrincipal'],
      [sequelize.fn('SUM', sequelize.col('INTEREST_AMOUNT')), 'totalInterest'],
      [sequelize.fn('COUNT', sequelize.col('TRANSACTION_ID')), 'transactionCount'],
      [sequelize.fn('AVG', sequelize.col('AMOUNT')), 'averageAmount']
    ],
    group: ['date'],
    order: [[sequelize.col('date'), 'ASC']],
    raw: true
  });

  // Overall totals
  const overallStats = await LoanRepaymentTransaction.findOne({
    where: whereClause,
    attributes: [
      [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount'],
      [sequelize.fn('SUM', sequelize.col('PRINCIPAL_AMOUNT')), 'totalPrincipal'],
      [sequelize.fn('SUM', sequelize.col('INTEREST_AMOUNT')), 'totalInterest'],
      [sequelize.fn('COUNT', sequelize.col('TRANSACTION_ID')), 'transactionCount'],
      [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('ACCT_NO'))), 'uniqueAccountsCount'],
      [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('CUST_ID'))), 'uniqueCustomersCount']
    ],
    raw: true
  });

  const overall = overallStats || {
    totalAmount: 0,
    totalPrincipal: 0,
    totalInterest: 0,
    transactionCount: 0,
    uniqueAccountsCount: 0,
    uniqueCustomersCount: 0
  };

  const avgAmount = overall.transactionCount > 0 
    ? parseFloat(overall.totalAmount) / parseInt(overall.transactionCount)
    : 0;

  res.status(200).json({
    success: true,
    message: 'Repayment statistics retrieved successfully.',
    data: {
      statistics,
      overview: {
        totalAmount: parseFloat(overall.totalAmount) || 0,
        totalPrincipal: parseFloat(overall.totalPrincipal) || 0,
        totalInterest: parseFloat(overall.totalInterest) || 0,
        transactionCount: parseInt(overall.transactionCount) || 0,
        uniqueAccountsCount: parseInt(overall.uniqueAccountsCount) || 0,
        uniqueCustomersCount: parseInt(overall.uniqueCustomersCount) || 0,
        averageTransactionAmount: avgAmount
      }
    }
  });
});

// Export controller functions
export default {
  createRepaymentTransaction,
  getRepaymentTransactions,
  getRepaymentTransactionById,
  getTransactionsByAccount,
  getTransactionsByCustomer,
  updateTransactionStatus,
  deleteRepaymentTransaction,
  getRepaymentStatistics
};