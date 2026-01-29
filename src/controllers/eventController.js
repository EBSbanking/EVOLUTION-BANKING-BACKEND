// controllers/workItemController.js
import sequelize from '../../config/db.js'; // Use the Sequelize connection
import Event from '../models/event.js'; // Event model
import Customer from '../models/Customer.js';   // Customer model
import Transaction from '../models/Transaction.js'; // Transaction model
import CashWithdrawalTransaction from '../models/CashWithdrawalTransaction.js'; // Cash withdrawal model
import DepositTransaction from '../models/DepositTransaction.js'; // Cash deposit model
// import TransferTransaction from '../models/TransferTransaction.js'; // Transfer transaction model
import TermDeposit from '../models/TermDeposit.js'; // Term deposit model
import CreditApplication from '../models/CreditApplication.js'; // Credit application model

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
};

// Fetch eventId by workItemId
export const getEventIdByWorkItemId = async (req, res) => {
  try {
    const { workItemId } = req.query; // Extract workItemId from query parameters
    console.log('Received workItemId:', workItemId);

    if (!workItemId) {
      return res.status(400).json({ error: "WORK_ITEM_ID is required" });
    }

    // Test connection first
    await testConnection();

    const event = await Event.findOne({
      where: { WORK_ITEM_ID: workItemId }
    });

    console.log('Found event:', event);

    if (!event) {
      return res.status(404).json({ error: "Event not found for this WORK_ITEM_ID" });
    }

    res.json({ eventId: event.EVENT_ID });
  } catch (error) {
    console.error("Error fetching eventId:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Fetch customer data by eventId
export const getCustomerDataByEventId = async (req, res) => {
  try {
    const { eventId } = req.query;
    
    // Check if eventId is provided
    if (!eventId) {
      return res.status(400).json({ error: "EVENT_ID is required" });
    }

    console.log(`Looking for customer data with EVENT_ID: ${eventId}`);

    // Test connection first
    await testConnection();

    // Find the customer data using the eventId
    const customerData = await Customer.findOne({
      where: { EVENT_ID: eventId }
    });

    // Debugging: Check what customerData looks like
    console.log("Found customer data:", customerData);

    // If no data found, return an error
    if (!customerData) {
      return res.status(404).json({ error: "Customer data not found for this EVENT_ID" });
    }

    // Convert to plain object for response
    const plainCustomerData = customerData.get({ plain: true });

    // Respond with customer data
    res.json(plainCustomerData);

  } catch (error) {
    console.error("Error fetching customer data:", error);
    res.status(500).json({ 
      message: "Something went wrong!", 
      error: error.message 
    });
  }
};

// Fetch transaction details using EVENT_ID
export const getTransactionDetails = async (req, res) => {
  try {
    const { eventId, transactionType } = req.query;
    
    if (!eventId) {
      return res.status(400).json({ error: "EVENT_ID is required" });
    }

    // Test connection first
    await testConnection();

    let transactions;

    if (transactionType) {
      switch (transactionType) {
        case 'cashWithdrawal':
          transactions = await CashWithdrawalTransaction.findAll({ 
            where: { EVENT_ID: eventId } 
          });
          break;
        case 'cashDeposit':
          transactions = await DepositTransaction.findAll({ 
            where: { EVENT_ID: eventId } 
          });
          break;
        // case 'transfer':
        //   transactions = await TransferTransaction.findAll({ 
        //     where: { EVENT_ID: eventId } 
        //   });
        //   break;
        case 'termDeposit':
          transactions = await TermDeposit.findAll({ 
            where: { EVENT_ID: eventId } 
          });
          break;
        case 'creditApplication':
          transactions = await CreditApplication.findAll({ 
            where: { EVENT_ID: eventId } 
          });
          break;
        default:
          return res.status(400).json({ error: "Invalid transaction type" });
      }
    } else {
      // Fetch all transaction types
      transactions = await Transaction.findAll({ 
        where: { EVENT_ID: eventId } 
      });
    }

    if (!transactions || transactions.length === 0) {
      return res.status(404).json({ error: "No transactions found for this EVENT_ID" });
    }

    // Convert to plain objects for response
    const plainTransactions = transactions.map(transaction => 
      transaction.get({ plain: true })
    );

    res.json(plainTransactions);
  } catch (error) {
    console.error("Error fetching transaction details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Fetch transaction details using EVENT_ID and/or QUEUE_ID
export const getTransactionByEventOrQueueId = async (req, res) => {
  try {
    const { eventId, queueId } = req.query;

    if (!eventId && !queueId) {
      return res.status(400).json({ error: "Either EVENT_ID or Queue ID is required" });
    }

    // Test connection first
    await testConnection();

    // Build query conditions
    const where = {};
    
    if (eventId) {
      where.EVENT_ID = eventId;
    }
    
    if (queueId) {
      // Note: Adjust field name based on your Transaction model
      // If your Transaction model has QUEUE_ID field, use that
      // Otherwise, adjust to match your actual schema
      where.QUEUE_ID = queueId;
    }

    const transactions = await Transaction.findAll({ where });

    if (!transactions || transactions.length === 0) {
      return res.status(404).json({ error: "No transactions found for the given criteria" });
    }

    // Convert to plain objects for response
    const plainTransactions = transactions.map(transaction => 
      transaction.get({ plain: true })
    );

    res.json(plainTransactions);
  } catch (error) {
    console.error("Error fetching transaction:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Enhanced: Fetch complete work item details including related data
export const getWorkItemDetails = async (req, res) => {
  try {
    const { workItemId } = req.query;

    if (!workItemId) {
      return res.status(400).json({ error: "WORK_ITEM_ID is required" });
    }

    // Test connection first
    await testConnection();

    // Get event details
    const event = await Event.findOne({
      where: { WORK_ITEM_ID: workItemId }
    });

    if (!event) {
      return res.status(404).json({ error: "Event not found for this WORK_ITEM_ID" });
    }

    // Get customer data
    const customerData = await Customer.findOne({
      where: { EVENT_ID: event.EVENT_ID }
    });

    // Get all transactions for this event
    const transactions = await Transaction.findAll({
      where: { EVENT_ID: event.EVENT_ID }
    });

    // Get specific transaction types
    const cashWithdrawals = await CashWithdrawalTransaction.findAll({
      where: { EVENT_ID: event.EVENT_ID }
    });

    const deposits = await DepositTransaction.findAll({
      where: { EVENT_ID: event.EVENT_ID }
    });

    const termDeposits = await TermDeposit.findAll({
      where: { EVENT_ID: event.EVENT_ID }
    });

    const creditApplications = await CreditApplication.findAll({
      where: { EVENT_ID: event.EVENT_ID }
    });

    const response = {
      event: event.get({ plain: true }),
      customer: customerData ? customerData.get({ plain: true }) : null,
      transactions: {
        all: transactions.map(t => t.get({ plain: true })),
        cashWithdrawals: cashWithdrawals.map(t => t.get({ plain: true })),
        deposits: deposits.map(t => t.get({ plain: true })),
        termDeposits: termDeposits.map(t => t.get({ plain: true })),
        creditApplications: creditApplications.map(t => t.get({ plain: true }))
      },
      summary: {
        totalTransactions: transactions.length,
        totalCashWithdrawals: cashWithdrawals.length,
        totalDeposits: deposits.length,
        totalTermDeposits: termDeposits.length,
        totalCreditApplications: creditApplications.length
      }
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching work item details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Enhanced: Search transactions across multiple types
export const searchTransactions = async (req, res) => {
  try {
    const { 
      eventId, 
      queueId, 
      customerId, 
      startDate, 
      endDate,
      status,
      type 
    } = req.query;

    // Build base query
    const baseQuery = {};

    if (eventId) baseQuery.EVENT_ID = eventId;
    if (queueId) baseQuery.QUEUE_ID = queueId;
    if (customerId) baseQuery.CUSTOMER_ID = customerId;
    if (status) baseQuery.STATUS = status;

    // Add date range if provided
    if (startDate || endDate) {
      baseQuery.CREATED_AT = {};
      if (startDate) baseQuery.CREATED_AT[sequelize.Op.gte] = new Date(startDate);
      if (endDate) baseQuery.CREATED_AT[sequelize.Op.lte] = new Date(endDate);
    }

    let results = {};

    if (!type || type === 'all') {
      // Search across all transaction types
      results.transactions = await Transaction.findAll({ where: baseQuery });
      results.cashWithdrawals = await CashWithdrawalTransaction.findAll({ where: baseQuery });
      results.deposits = await DepositTransaction.findAll({ where: baseQuery });
      results.termDeposits = await TermDeposit.findAll({ where: baseQuery });
      results.creditApplications = await CreditApplication.findAll({ where: baseQuery });
    } else {
      // Search specific transaction type
      switch (type) {
        case 'transaction':
          results.transactions = await Transaction.findAll({ where: baseQuery });
          break;
        case 'cashWithdrawal':
          results.cashWithdrawals = await CashWithdrawalTransaction.findAll({ where: baseQuery });
          break;
        case 'deposit':
          results.deposits = await DepositTransaction.findAll({ where: baseQuery });
          break;
        case 'termDeposit':
          results.termDeposits = await TermDeposit.findAll({ where: baseQuery });
          break;
        case 'creditApplication':
          results.creditApplications = await CreditApplication.findAll({ where: baseQuery });
          break;
        default:
          return res.status(400).json({ error: "Invalid transaction type" });
      }
    }

    // Convert to plain objects
    const response = {};
    for (const [key, value] of Object.entries(results)) {
      if (Array.isArray(value)) {
        response[key] = value.map(item => item.get({ plain: true }));
      }
    }

    res.json(response);
  } catch (error) {
    console.error("Error searching transactions:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};