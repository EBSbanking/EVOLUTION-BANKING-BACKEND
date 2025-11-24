// controllers/loanRepaymentTransactionController.js
import LoanRepaymentTransaction from '../models/LoanRepaymentTransaction.js';
import LoanAccount from '../models/LoanAccount.js';
import mongoose from 'mongoose';

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

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find the loan account to get ACCT_ID
    const loanAccount = await LoanAccount.findOne({ 
      ACCT_NO,
      CUST_ID 
    }).session(session);

    if (!loanAccount) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Loan account not found for ACCT_NO: ${ACCT_NO} and CUST_ID: ${CUST_ID}`
      });
    }

    // Check for duplicate transaction reference
    const existingTransaction = await LoanRepaymentTransaction.findOne({
      TRANSACTION_REFERENCE
    }).session(session);

    if (existingTransaction) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Transaction with this reference already exists.'
      });
    }

    // Create the repayment transaction
    const repaymentTransaction = new LoanRepaymentTransaction({
      ACCT_ID: loanAccount._id,
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
    });

    await repaymentTransaction.save({ session });
    await session.commitTransaction();

    console.log(`✅ Repayment transaction created: ${TRANSACTION_REFERENCE} for account ${ACCT_NO}`);

    res.status(201).json({
      success: true,
      message: 'Repayment transaction created successfully.',
      data: repaymentTransaction
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('💥 Error creating repayment transaction:', error);
    
    if (error.code === 11000) {
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
  } finally {
    session.endSession();
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

  const filter = {};

  // Build filter object
  if (ACCT_NO) filter.ACCT_NO = ACCT_NO;
  if (CUST_ID) filter.CUST_ID = CUST_ID;
  if (PAYMENT_METHOD) filter.PAYMENT_METHOD = PAYMENT_METHOD;
  if (STATUS) filter.STATUS = STATUS;
  if (REPAYMENT_TYPE) filter.REPAYMENT_TYPE = REPAYMENT_TYPE;

  // Date range filter
  if (startDate || endDate) {
    filter.TRANSACTION_DATE = {};
    if (startDate) filter.TRANSACTION_DATE.$gte = new Date(startDate);
    if (endDate) filter.TRANSACTION_DATE.$lte = new Date(endDate);
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { TRANSACTION_DATE: -1 },
    populate: {
      path: 'ACCT_ID',
      select: 'ACCT_NM LOAN_AMOUNT LOAN_STATUS'
    }
  };

  const transactions = await LoanRepaymentTransaction.paginate(filter, options);

  res.status(200).json({
    success: true,
    message: 'Repayment transactions retrieved successfully.',
    data: {
      transactions: transactions.docs,
      pagination: {
        currentPage: transactions.page,
        totalPages: transactions.totalPages,
        totalItems: transactions.totalDocs,
        hasNextPage: transactions.hasNextPage,
        hasPrevPage: transactions.hasPrevPage
      }
    }
  });
});

// Get repayment transaction by ID
export const getRepaymentTransactionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid transaction ID format.'
    });
  }

  const transaction = await LoanRepaymentTransaction.findById(id)
    .populate('ACCT_ID', 'ACCT_NM LOAN_AMOUNT LOAN_STATUS PRODUCT_TYPE');

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

  const filter = { ACCT_NO: accountNo };

  // Date range filter
  if (startDate || endDate) {
    filter.TRANSACTION_DATE = {};
    if (startDate) filter.TRANSACTION_DATE.$gte = new Date(startDate);
    if (endDate) filter.TRANSACTION_DATE.$lte = new Date(endDate);
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { TRANSACTION_DATE: -1 }
  };

  const transactions = await LoanRepaymentTransaction.paginate(filter, options);

  // Calculate totals
  const totalStats = await LoanRepaymentTransaction.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$AMOUNT' },
        totalPrincipal: { $sum: '$PRINCIPAL_AMOUNT' },
        totalInterest: { $sum: '$INTEREST_AMOUNT' },
        transactionCount: { $sum: 1 }
      }
    }
  ]);

  const stats = totalStats.length > 0 ? totalStats[0] : {
    totalAmount: 0,
    totalPrincipal: 0,
    totalInterest: 0,
    transactionCount: 0
  };

  res.status(200).json({
    success: true,
    message: 'Account repayment transactions retrieved successfully.',
    data: {
      accountNo,
      transactions: transactions.docs,
      summary: {
        totalAmount: stats.totalAmount,
        totalPrincipal: stats.totalPrincipal,
        totalInterest: stats.totalInterest,
        transactionCount: stats.transactionCount
      },
      pagination: {
        currentPage: transactions.page,
        totalPages: transactions.totalPages,
        totalItems: transactions.totalDocs,
        hasNextPage: transactions.hasNextPage,
        hasPrevPage: transactions.hasPrevPage
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

  const filter = { CUST_ID: customerId };

  // Date range filter
  if (startDate || endDate) {
    filter.TRANSACTION_DATE = {};
    if (startDate) filter.TRANSACTION_DATE.$gte = new Date(startDate);
    if (endDate) filter.TRANSACTION_DATE.$lte = new Date(endDate);
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { TRANSACTION_DATE: -1 },
    populate: {
      path: 'ACCT_ID',
      select: 'ACCT_NM LOAN_AMOUNT PRODUCT_TYPE'
    }
  };

  const transactions = await LoanRepaymentTransaction.paginate(filter, options);

  // Calculate customer totals
  const customerStats = await LoanRepaymentTransaction.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$CUST_ID',
        totalAmount: { $sum: '$AMOUNT' },
        totalPrincipal: { $sum: '$PRINCIPAL_AMOUNT' },
        totalInterest: { $sum: '$INTEREST_AMOUNT' },
        transactionCount: { $sum: 1 },
        accountsCount: { $addToSet: '$ACCT_NO' }
      }
    }
  ]);

  const stats = customerStats.length > 0 ? customerStats[0] : {
    totalAmount: 0,
    totalPrincipal: 0,
    totalInterest: 0,
    transactionCount: 0,
    accountsCount: []
  };

  res.status(200).json({
    success: true,
    message: 'Customer repayment transactions retrieved successfully.',
    data: {
      customerId,
      transactions: transactions.docs,
      summary: {
        totalAmount: stats.totalAmount,
        totalPrincipal: stats.totalPrincipal,
        totalInterest: stats.totalInterest,
        transactionCount: stats.transactionCount,
        uniqueAccounts: stats.accountsCount?.length || 0
      },
      pagination: {
        currentPage: transactions.page,
        totalPages: transactions.totalPages,
        totalItems: transactions.totalDocs,
        hasNextPage: transactions.hasNextPage,
        hasPrevPage: transactions.hasPrevPage
      }
    }
  });
});

// Update repayment transaction status
export const updateTransactionStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { STATUS, updatedBy } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid transaction ID format.'
    });
  }

  const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'];
  if (!STATUS || !validStatuses.includes(STATUS)) {
    return res.status(400).json({
      success: false,
      message: `STATUS is required and must be one of: ${validStatuses.join(', ')}`
    });
  }

  const transaction = await LoanRepaymentTransaction.findById(id);

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

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid transaction ID format.'
    });
  }

  const transaction = await LoanRepaymentTransaction.findById(id);

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
  
  // Store cancellation reason in metadata if needed
  transaction.metadata = {
    ...transaction.metadata,
    cancellationReason: reason,
    cancelledAt: new Date(),
    cancelledBy: deletedBy || req.user?.id || 'system'
  };

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

  const matchStage = { STATUS: 'COMPLETED' };

  // Date range filter
  if (startDate || endDate) {
    matchStage.TRANSACTION_DATE = {};
    if (startDate) matchStage.TRANSACTION_DATE.$gte = new Date(startDate);
    if (endDate) matchStage.TRANSACTION_DATE.$lte = new Date(endDate);
  }

  let groupStage = {};
  switch (groupBy) {
    case 'day':
      groupStage = {
        _id: {
          year: { $year: '$TRANSACTION_DATE' },
          month: { $month: '$TRANSACTION_DATE' },
          day: { $dayOfMonth: '$TRANSACTION_DATE' }
        },
        date: { $first: '$TRANSACTION_DATE' }
      };
      break;
    case 'week':
      groupStage = {
        _id: {
          year: { $year: '$TRANSACTION_DATE' },
          week: { $week: '$TRANSACTION_DATE' }
        },
        date: { $first: '$TRANSACTION_DATE' }
      };
      break;
    case 'month':
      groupStage = {
        _id: {
          year: { $year: '$TRANSACTION_DATE' },
          month: { $month: '$TRANSACTION_DATE' }
        },
        date: { $first: '$TRANSACTION_DATE' }
      };
      break;
    default:
      groupStage = {
        _id: {
          year: { $year: '$TRANSACTION_DATE' },
          month: { $month: '$TRANSACTION_DATE' },
          day: { $dayOfMonth: '$TRANSACTION_DATE' }
        },
        date: { $first: '$TRANSACTION_DATE' }
      };
  }

  const statistics = await LoanRepaymentTransaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        ...groupStage,
        totalAmount: { $sum: '$AMOUNT' },
        totalPrincipal: { $sum: '$PRINCIPAL_AMOUNT' },
        totalInterest: { $sum: '$INTEREST_AMOUNT' },
        transactionCount: { $sum: 1 },
        averageAmount: { $avg: '$AMOUNT' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);

  // Overall totals
  const overallStats = await LoanRepaymentTransaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$AMOUNT' },
        totalPrincipal: { $sum: '$PRINCIPAL_AMOUNT' },
        totalInterest: { $sum: '$INTEREST_AMOUNT' },
        transactionCount: { $sum: 1 },
        uniqueAccounts: { $addToSet: '$ACCT_NO' },
        uniqueCustomers: { $addToSet: '$CUST_ID' }
      }
    }
  ]);

  const overall = overallStats.length > 0 ? overallStats[0] : {
    totalAmount: 0,
    totalPrincipal: 0,
    totalInterest: 0,
    transactionCount: 0,
    uniqueAccounts: [],
    uniqueCustomers: []
  };

  res.status(200).json({
    success: true,
    message: 'Repayment statistics retrieved successfully.',
    data: {
      statistics,
      overview: {
        totalAmount: overall.totalAmount,
        totalPrincipal: overall.totalPrincipal,
        totalInterest: overall.totalInterest,
        transactionCount: overall.transactionCount,
        uniqueAccountsCount: overall.uniqueAccounts?.length || 0,
        uniqueCustomersCount: overall.uniqueCustomers?.length || 0,
        averageTransactionAmount: overall.transactionCount > 0 ? overall.totalAmount / overall.transactionCount : 0
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