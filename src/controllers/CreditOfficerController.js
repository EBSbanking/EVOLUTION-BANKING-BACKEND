// controllers/CreditOfficerController.js
import { getTransaction, getCustomer, getThrift, Op, initializeModels } from '../models/index.js';
import logger from '../utils/logger.js';

class CreditOfficerController {
  // Get recent activities
  static async getRecentActivities(req, res) {
    try {
      const { limit = 10 } = req.query;
      const parsedLimit = parseInt(limit);
      
      // Ensure models are initialized
      await initializeModels();
      
      // Get models using the getter functions
      const Transaction = getTransaction();
      const Customer = getCustomer();
      const Thrift = getThrift();
      
      // Check if models exist
      if (!Transaction) {
        logger.error('Transaction model not available');
        return res.status(503).json({
          success: false,
          message: 'Service not available',
          error: 'Transaction model not initialized'
        });
      }

      // Get recent transactions using Sequelize
      const recentTransactions = await Transaction.findAll({
        where: {
          status: 'COMPLETED'
        },
        order: [['created_at', 'DESC']],
        limit: parsedLimit,
        attributes: [
          'id',
          'CUST_ID',
          'ACCT_NO',
          'AMOUNT',
          'TRANSACTION_TYPE',
          'description',
          'created_at',
          'status'
        ]
      });

      const activities = [];

      // Add transactions to activities
      if (recentTransactions && recentTransactions.length > 0) {
        activities.push(...recentTransactions.map(txn => ({
          type: 'transaction',
          id: txn.id,
          customerId: txn.CUST_ID,
          accountNo: txn.ACCT_NO,
          amount: parseFloat(txn.AMOUNT),
          description: txn.description || `${txn.TRANSACTION_TYPE} transaction`,
          transactionType: txn.TRANSACTION_TYPE,
          status: txn.status,
          timestamp: txn.created_at,
          icon: '💰'
        })));
      }

      // Get recent customers if Customer model exists
      if (Customer) {
        try {
          // First, get the actual columns from the Customer model
          const customerAttributes = Object.keys(Customer.rawAttributes || {});
          logger.info('Customer model available attributes:', customerAttributes);
          
          // Build attributes array based on what exists
          const selectedAttributes = [];
          if (customerAttributes.includes('id')) selectedAttributes.push('id');
          if (customerAttributes.includes('CUST_ID')) selectedAttributes.push('CUST_ID');
          if (customerAttributes.includes('FIRST_NAME')) selectedAttributes.push('FIRST_NAME');
          if (customerAttributes.includes('LAST_NAME')) selectedAttributes.push('LAST_NAME');
          if (customerAttributes.includes('created_at')) selectedAttributes.push('created_at');
          if (customerAttributes.includes('balance')) selectedAttributes.push('balance');
          if (customerAttributes.includes('account_balance')) selectedAttributes.push('account_balance');
          
          // If no specific attributes found, use a safe minimal set
          if (selectedAttributes.length === 0) {
            selectedAttributes.push('id', 'CUST_ID', 'created_at');
          }
          
          const recentCustomers = await Customer.findAll({
            order: [['created_at', 'DESC']],
            limit: parsedLimit,
            attributes: selectedAttributes
          });

          activities.push(...recentCustomers.map(customer => {
            // Get name from available fields
            let name = 'Customer';
            if (customer.FIRST_NAME && customer.LAST_NAME) {
              name = `${customer.FIRST_NAME} ${customer.LAST_NAME}`;
            } else if (customer.FIRST_NAME) {
              name = customer.FIRST_NAME;
            } else if (customer.CUST_ID) {
              name = `Customer ${customer.CUST_ID}`;
            }
            
            // Get balance from available fields
            let balance = 0;
            if (customer.balance !== undefined) balance = parseFloat(customer.balance);
            if (customer.account_balance !== undefined) balance = parseFloat(customer.account_balance);
            if (customer.ACCOUNT_BALANCE !== undefined) balance = parseFloat(customer.ACCOUNT_BALANCE);
            
            return {
              type: 'customer',
              id: customer.id,
              customerId: customer.CUST_ID,
              name: name,
              balance: balance,
              timestamp: customer.created_at,
              icon: '👤'
            };
          }));
        } catch (customerError) {
          logger.error('Error fetching customers:', customerError.message);
          // Continue without customers
        }
      }

      // Get recent thrift accounts if Thrift model exists
      if (Thrift) {
        try {
          const thriftAttributes = Object.keys(Thrift.rawAttributes || {});
          logger.info('Thrift model available attributes:', thriftAttributes);
          
          const selectedAttributes = [];
          if (thriftAttributes.includes('id')) selectedAttributes.push('id');
          if (thriftAttributes.includes('CUST_ID')) selectedAttributes.push('CUST_ID');
          if (thriftAttributes.includes('ACCT_NO')) selectedAttributes.push('ACCT_NO');
          if (thriftAttributes.includes('FULL_NAME')) selectedAttributes.push('FULL_NAME');
          if (thriftAttributes.includes('AMOUNT')) selectedAttributes.push('AMOUNT');
          if (thriftAttributes.includes('COLLECTION_TYPE')) selectedAttributes.push('COLLECTION_TYPE');
          if (thriftAttributes.includes('created_at')) selectedAttributes.push('created_at');
          
          if (selectedAttributes.length > 0) {
            const recentThriftAccounts = await Thrift.findAll({
              order: [['created_at', 'DESC']],
              limit: parsedLimit,
              attributes: selectedAttributes
            });

            activities.push(...recentThriftAccounts.map(account => ({
              type: 'thrift',
              id: account.id,
              customerId: account.CUST_ID,
              accountNo: account.ACCT_NO,
              name: account.FULL_NAME || `Thrift Account ${account.ACCT_NO}`,
              amount: parseFloat(account.AMOUNT || 0),
              collectionType: account.COLLECTION_TYPE,
              timestamp: account.created_at,
              icon: '🏦'
            })));
          }
        } catch (thriftError) {
          logger.error('Error fetching thrift accounts:', thriftError.message);
          // Continue without thrift accounts
        }
      }
      
      // Sort activities by timestamp (newest first)
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // Limit results
      const finalActivities = activities.slice(0, parsedLimit);

      res.status(200).json({
        success: true,
        data: finalActivities,
        count: finalActivities.length,
        message: 'Recent activities retrieved successfully'
      });
      
    } catch (error) {
      logger.error('Error fetching recent activities:', {
        message: error.message,
        stack: error.stack
      });
      
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
      // Ensure models are initialized
      await initializeModels();
      
      const Transaction = getTransaction();
      
      if (!Transaction) {
        logger.error('Transaction model not available');
        return res.status(503).json({
          success: false,
          message: 'Service not available',
          error: 'Transaction model not initialized'
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Today's transactions count and amount
      const todayTransactions = await Transaction.findAll({
        where: {
          created_at: {
            [Op.gte]: today,
            [Op.lt]: tomorrow
          },
          status: 'COMPLETED'
        }
      });

      const totalTransactions = todayTransactions.length;
      const totalTransactionAmount = todayTransactions.reduce((sum, txn) => sum + parseFloat(txn.AMOUNT), 0);

      // Get new customers count if Customer model exists
      let newCustomers = 0;
      const Customer = getCustomer();
      if (Customer) {
        try {
          newCustomers = await Customer.count({
            where: {
              created_at: {
                [Op.gte]: today,
                [Op.lt]: tomorrow
              }
            }
          });
        } catch (customerError) {
          logger.error('Error counting new customers:', customerError.message);
        }
      }

      // Today's thrift collections
      const todayThriftCollections = await Transaction.findAll({
        where: {
          TRANSACTION_TYPE: 'THRIFT_COLLECTION',
          created_at: {
            [Op.gte]: today,
            [Op.lt]: tomorrow
          },
          status: 'COMPLETED'
        }
      });

      const totalThriftCollections = todayThriftCollections.length;
      const totalThriftAmount = todayThriftCollections.reduce((sum, txn) => sum + parseFloat(txn.AMOUNT), 0);

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
      logger.error('Error fetching today stats:', {
        message: error.message,
        stack: error.stack
      });
      
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