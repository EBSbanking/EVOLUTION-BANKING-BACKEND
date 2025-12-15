// controllers/customerTransactionController.js
import CustomerTransaction from "../models/CustomerTransaction.js";
import CustomerAccount from "../models/CustomerAccount.js";
import logger from "../utils/logger.js";

// Get transaction history for a customer account
export const getCustomerTransactions = async (req, res) => {
  try {
    const { accountNumber } = req.params;
    const {
      startDate,
      endDate,
      transactionType,
      status,
      page = 1,
      limit = 50,
      sortBy = "transactionDate",
      sortOrder = "desc",
    } = req.query;

    // Validate account exists
    const account = await CustomerAccount.findOne({ account_number: accountNumber });
    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    // Build query
    const query = { accountNumber };

    // Date range filter
    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) {
        query.transactionDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.transactionDate.$lte = new Date(endDate);
      }
    }

    // Transaction type filter
    if (transactionType) {
      query.transactionType = transactionType.toUpperCase();
    }

    // Status filter
    if (status) {
      query.status = status.toUpperCase();
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    // Execute query
    const transactions = await CustomerTransaction.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await CustomerTransaction.countDocuments(query);

    // Get account summary
    const accountSummary = {
      accountNumber: account.account_number,
      customerId: account.customer_id,
      accountType: account.ACCOUNT_TYPE,
      currentBalance: account.ledger_balance,
      availableBalance: account.AVAILABLE_BALANCE,
      currency: account.currency || "NGN",
      status: account.REC_ST,
      branch: account.branch,
    };

    // Calculate summary statistics
    const totalDeposits = await CustomerTransaction.aggregate([
      { $match: { ...query, transactionType: "DEPOSIT", status: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const totalWithdrawals = await CustomerTransaction.aggregate([
      { $match: { ...query, transactionType: "WITHDRAWAL", status: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const summary = {
      totalDeposits: totalDeposits[0]?.total || 0,
      totalWithdrawals: totalWithdrawals[0]?.total || 0,
      netFlow: (totalDeposits[0]?.total || 0) - (totalWithdrawals[0]?.total || 0),
      transactionCount: total,
    };

    // Format response
    const formattedTransactions = transactions.map((tran) => ({
      id: tran._id,
      transactionId: tran.transactionId,
      referenceNo: tran.referenceNo,
      accountNumber: tran.accountNumber,
      transactionType: tran.transactionType,
      amount: tran.amount,
      balanceBefore: tran.balanceBefore,
      balanceAfter: tran.balanceAfter,
      currency: tran.currency,
      narration: tran.narration,
      category: tran.category,
      status: tran.status,
      transactionDate: tran.transactionDate,
      valueDate: tran.valueDate,
      postedDate: tran.postedDate,
      formattedDate: new Date(tran.transactionDate).toLocaleDateString(),
      formattedTime: new Date(tran.transactionDate).toLocaleTimeString(),
      channel: tran.channel,
      tellerId: tran.tellerId,
      userId: tran.userId,
      userName: tran.userName,
      branchCode: tran.branchCode,
      branchName: tran.branchName,
      counterpartyAccount: tran.counterpartyAccount,
      counterpartyName: tran.counterpartyName,
      counterpartyBank: tran.counterpartyBank,
      isReversal: tran.isReversal,
      reversedTransactionId: tran.reversedTransactionId,
      reversalReason: tran.reversalReason,
    }));

    return res.status(200).json({
      success: true,
      message: "Transaction history retrieved successfully",
      data: {
        account: accountSummary,
        summary,
        transactions: formattedTransactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalTransactions: total,
          limit: parseInt(limit),
          hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching customer transactions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch transaction history",
      error: error.message,
    });
  }
};

// Get transactions by customer ID
export const getTransactionsByCustomerId = async (req, res) => {
  try {
    const { customerId } = req.params;
    const {
      startDate,
      endDate,
      transactionType,
      status,
      page = 1,
      limit = 50,
    } = req.query;

    // Build query
    const query = { customerId: parseInt(customerId) };

    // Date range filter
    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) {
        query.transactionDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.transactionDate.$lte = new Date(endDate);
      }
    }

    if (transactionType) query.transactionType = transactionType;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const transactions = await CustomerTransaction.find(query)
      .sort({ transactionDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await CustomerTransaction.countDocuments(query);

    // Get customer accounts for summary
    const accounts = await CustomerAccount.find({ customer_id: parseInt(customerId) })
      .select("account_number ACCOUNT_TYPE ledger_balance AVAILABLE_BALANCE REC_ST branch")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Customer transactions retrieved successfully",
      data: {
        customerId,
        accounts,
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalTransactions: total,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching customer transactions by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch customer transactions",
      error: error.message,
    });
  }
};

// Get transaction by ID
export const getTransactionById = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await CustomerTransaction.findOne({
      $or: [
        { transactionId },
        { referenceNo: transactionId },
        { _id: transactionId },
      ],
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Transaction retrieved successfully",
      data: transaction,
    });
  } catch (error) {
    logger.error("Error fetching transaction by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch transaction",
      error: error.message,
    });
  }
};

// Search transactions (admin function)
export const searchTransactions = async (req, res) => {
  try {
    const {
      accountNumber,
      customerId,
      customerCode,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      transactionType,
      status,
      branchCode,
      userId,
      page = 1,
      limit = 100,
    } = req.query;

    const query = {};

    if (accountNumber) query.accountNumber = accountNumber;
    if (customerId) query.customerId = parseInt(customerId);
    if (customerCode) query.customerCode = customerCode;
    
    // Date range
    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) query.transactionDate.$gte = new Date(startDate);
      if (endDate) query.transactionDate.$lte = new Date(endDate);
    }
    
    // Amount range
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = parseFloat(minAmount);
      if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
    }
    
    if (transactionType) query.transactionType = transactionType;
    if (status) query.status = status;
    if (branchCode) query.branchCode = branchCode;
    if (userId) query.userId = userId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const transactions = await CustomerTransaction.find(query)
      .sort({ transactionDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await CustomerTransaction.countDocuments(query);

    // Summary statistics
    const summary = await CustomerTransaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          depositAmount: {
            $sum: {
              $cond: [
                { $eq: ["$transactionType", "DEPOSIT"] },
                "$amount",
                0,
              ],
            },
          },
          withdrawalAmount: {
            $sum: {
              $cond: [
                { $eq: ["$transactionType", "WITHDRAWAL"] },
                "$amount",
                0,
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      message: "Transactions search completed",
      data: {
        transactions,
        summary: summary[0] || {
          totalAmount: 0,
          depositAmount: 0,
          withdrawalAmount: 0,
          count: 0,
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalTransactions: total,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    logger.error("Error searching transactions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to search transactions",
      error: error.message,
    });
  }
};

// Export transactions to CSV/Excel
export const exportTransactions = async (req, res) => {
  try {
    const { accountNumber, startDate, endDate, format = "csv" } = req.query;

    const query = {};
    if (accountNumber) query.accountNumber = accountNumber;
    
    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) query.transactionDate.$gte = new Date(startDate);
      if (endDate) query.transactionDate.$lte = new Date(endDate);
    }

    const transactions = await CustomerTransaction.find(query)
      .sort({ transactionDate: -1 })
      .lean();

    if (format === "csv") {
      // Convert to CSV
      const csvData = transactions.map((tran) => ({
        "Transaction ID": tran.transactionId,
        "Reference No": tran.referenceNo,
        "Account Number": tran.accountNumber,
        "Transaction Date": new Date(tran.transactionDate).toISOString(),
        "Transaction Type": tran.transactionType,
        "Amount": tran.amount,
        "Balance Before": tran.balanceBefore,
        "Balance After": tran.balanceAfter,
        "Narration": tran.narration,
        "Status": tran.status,
        "Channel": tran.channel,
        "Teller ID": tran.tellerId,
        "Branch": tran.branchName,
      }));

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=transactions_${Date.now()}.csv`
      );
      
      // Simple CSV generation
      const csvHeaders = Object.keys(csvData[0] || {}).join(",");
      const csvRows = csvData.map((row) => Object.values(row).join(","));
      const csvContent = [csvHeaders, ...csvRows].join("\n");
      
      return res.send(csvContent);
    }

    return res.status(200).json({
      success: true,
      message: "Transactions ready for export",
      data: transactions,
    });
  } catch (error) {
    logger.error("Error exporting transactions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to export transactions",
      error: error.message,
    });
  }
};