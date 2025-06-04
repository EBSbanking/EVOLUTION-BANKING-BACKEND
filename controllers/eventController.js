import connectDB from '../config/db.js'; // Use the Mongoose connection
import Event from '../models/event.js'; // Event model
import Customer from '../models/Customer.js';   // Customer model
import Transaction from '../models/Transaction.js'; // Transaction model
import CashWithdrawalTransaction from '../models/CashWithdrawalTransaction.js'; // Cash withdrawal model
import DepositTransaction from '../models/DepositTransaction.js'; // Cash deposit model
// import TransferTransaction from '../models/TransferTransaction.js'; // Transfer transaction model
import TermDeposit from '../models/TermDeposit.js'; // Term deposit model
import CreditApplication from '../models/CreditApplication.js'; // Credit application model

// Fetch eventId by workItemId
// Fetch eventId by workItemId
export const getEventIdByWorkItemId = async (req, res) => {
  try {
    const { workItemId } = req.query; // Extract workItemId from query parameters
    console.log('Received workItemId:', workItemId);  // Add this log

    if (!workItemId) {
      return res.status(400).json({ error: "WORK_ITEM_ID is required" });
    }

    await connectDB();

    const event = await Event.findOne({ WORK_ITEM_ID: workItemId });

    console.log('Found event:', event);  // Add this log

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

    await connectDB();

    // Find the customer data using the eventId
    const customerData = await Customer.findOne({ EVENT_ID: eventId });

    // Debugging: Check what customerData looks like
    console.log("Found customer data:", customerData);

    // If no data found, return an error
    if (!customerData) {
      return res.status(404).json({ error: "Customer data not found for this EVENT_ID" });
    }

    // Respond with customer data
    res.json(customerData);

  } catch (error) {
    console.error("Error fetching customer data:", error);
    res.status(500).json({ message: "Something went wrong!", error: error.message });
  }
};



// Fetch transaction details using EVENT_ID
export const getTransactionDetails = async (req, res) => {
  try {
    const { eventId, transactionType } = req.query;
    if (!eventId) {
      return res.status(400).json({ error: "EVENT_ID is required" });
    }
    await connectDB();
    let transactions;
    if (transactionType) {
      switch (transactionType) {
        case 'cashWithdrawal':
          transactions = await CashWithdrawalTransaction.find({ EVENT_ID: eventId });
          break;
        case 'cashDeposit':
          transactions = await DepositTransaction.find({ EVENT_ID: eventId });
          break;
        // case 'transfer':
        //   transactions = await TransferTransaction.find({ EVENT_ID: eventId });
        //   break;
        case 'termDeposit':
          transactions = await TermDeposit.find({ EVENT_ID: eventId });
          break;
        case 'creditApplication':
          transactions = await CreditApplication.find({ EVENT_ID: eventId });
          break;
        default:
          return res.status(400).json({ error: "Invalid transaction type" });
      }
    } else {
      transactions = await Transaction.find({ EVENT_ID: eventId });
    }
    if (!transactions || transactions.length === 0) {
      return res.status(404).json({ error: "No transactions found for this EVENT_ID" });
    }
    res.json(transactions);
  } catch (error) {
    console.error("Error fetching transaction details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Fetch transaction details using QUEUE_ID
// Fetch transaction details using EVENT_ID and/or QUEUE_ID
export const getTransactionByEventOrQueueId = async (req, res) => {
  try {
    const { eventId, queueId } = req.query;

    if (!eventId && !queueId) {
      return res.status(400).json({ error: "Either EVENT_ID or Queue ID is required" });
    }

    await connectDB();

    let query = {};
    if (eventId) query.EVENT_ID = eventId;
    if (queueId) query.queueId = queueId;

    const transactions = await Transaction.find(query);

    if (!transactions || transactions.length === 0) {
      return res.status(404).json({ error: "No transactions found for the given criteria" });
    }

    res.json(transactions);
  } catch (error) {
    console.error("Error fetching transaction:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
