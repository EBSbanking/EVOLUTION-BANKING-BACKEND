import Transaction from '../models/Transaction.js';
import Customer from '../models/Customer.js';
import Thrift from '../models/Thrift.js';
import logger from '../utils/logger.js';

class CreditOfficerController {
  // Get recent activities
  static async getRecentActivities(req, res) {
    try {
      const { limit = 10 } = req.query;
      
      // Get recent transactions
      const recentTransactions = await Transaction.find()
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .select('CUST_ID ACCT_NO AMOUNT TRANSACTION_TYPE description createdAt status');

      // Get recent customers
      const recentCustomers = await Customer.find()
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .select('CUST_ID FIRST_NAME LAST_NAME accountBalance createdAt');

      // Get recent thrift accounts
      const recentThriftAccounts = await Thrift.find()
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .select('CUST_ID ACCT_NO FULL_NAME AMOUNT COLLECTION_TYPE createdAt');

      const activities = [
        ...recentTransactions.map(txn => ({
          type: 'transaction',
          id: txn._id,
          customerId: txn.CUST_ID,
          accountNo: txn.ACCT_NO,
          amount: txn.AMOUNT,
          description: txn.description,
          transactionType: txn.TRANSACTION_TYPE,
          status: txn.status,
          timestamp: txn.createdAt,
          icon: '💰'
        })),
        ...recentCustomers.map(customer => ({
          type: 'customer',
          id: customer._id,
          customerId: customer.CUST_ID,
          name: `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
          balance: customer.accountBalance,
          timestamp: customer.createdAt,
          icon: '👤'
        })),
        ...recentThriftAccounts.map(account => ({
          type: 'thrift',
          id: account._id,
          customerId: account.CUST_ID,
          accountNo: account.ACCT_NO,
          name: account.FULL_NAME,
          amount: account.AMOUNT,
          collectionType: account.COLLECTION_TYPE,
          timestamp: account.createdAt,
          icon: '🏦'
        }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
       .slice(0, parseInt(limit));

      res.status(200).json({
        success: true,
        data: activities
      });
    } catch (error) {
      logger.error('Error fetching recent activities:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch recent activities',
        error: error.message
      });
    }
  }

  // Get today's stats
  static async getTodayStats(req, res) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Today's transactions count and amount
      const todayTransactions = await Transaction.find({
        createdAt: {
          $gte: today,
          $lt: tomorrow
        },
        status: 'COMPLETED'
      });

      const totalTransactions = todayTransactions.length;
      const totalTransactionAmount = todayTransactions.reduce((sum, txn) => sum + txn.AMOUNT, 0);

      // Today's new customers
      const newCustomers = await Customer.countDocuments({
        createdAt: {
          $gte: today,
          $lt: tomorrow
        }
      });

      // Today's thrift collections
      const todayThriftCollections = await Transaction.find({
        TRANSACTION_TYPE: 'THRIFT_COLLECTION',
        createdAt: {
          $gte: today,
          $lt: tomorrow
        },
        status: 'COMPLETED'
      });

      const totalThriftCollections = todayThriftCollections.length;
      const totalThriftAmount = todayThriftCollections.reduce((sum, txn) => sum + txn.AMOUNT, 0);

      const stats = {
        totalTransactions,
        totalTransactionAmount,
        newCustomers,
        totalThriftCollections,
        totalThriftAmount,
        date: today.toISOString().split('T')[0]
      };

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error fetching today stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch today stats',
        error: error.message
      });
    }
  }

  // Get user configuration
  static async getConfig(req, res) {
    try {
      const config = {
        features: {
          thriftCollections: true,
          loanApplications: true,
          customerManagement: true,
          reports: true
        },
        limits: {
          maxDailyTransactions: 100,
          maxCustomerAccounts: 5,
          maxThriftAmount: 500000
        },
        ui: {
          theme: 'light',
          language: 'en',
          dateFormat: 'DD/MM/YYYY'
        },
        permissions: {
          canCreateCustomer: true,
          canProcessLoans: true,
          canViewReports: true,
          canManageThrift: true
        }
      };

      res.status(200).json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error('Error fetching config:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch configuration',
        error: error.message
      });
    }
  }
}

export default CreditOfficerController;