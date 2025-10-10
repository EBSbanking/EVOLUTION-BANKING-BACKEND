import mongoose from 'mongoose';
import AuditTrail from '../models/AuditTrail.js';

// Define Sequence schema for generating unique IDs
const SequenceSchema = new mongoose.Schema({
  collection: { type: String, required: true, unique: true },
  value: { type: Number, default: 0 }
});

const Sequence = mongoose.model('Sequence', SequenceSchema, 'sequences');

// Helper to generate a random number with 8 to 12 digits
const generateRandomDigits = (minDigits = 8, maxDigits = 12) => {
  try {
    const min = Math.pow(10, minDigits - 1);
    const max = Math.pow(10, maxDigits) - 1;
    const value = Math.floor(Math.random() * (max - min + 1)) + min;
    if (!value || typeof value !== 'number' || value < min || value > max) {
      throw new Error(`Invalid random digits generated: ${value}`);
    }
    return value.toString(); // Return as string to match expected format
  } catch (error) {
    console.error('generateRandomDigits error:', error.message);
    throw new Error(`Failed to generate random digits: ${error.message}`);
  }
};

export const generateWorkflowIdentifiers = async () => {
  const maxRetries = 3;
  let attempt = 1;

  while (attempt <= maxRetries) {
    const session = await mongoose.startSession();
    let identifiers = null; // Initialize identifiers as null

    try {
      console.log(`generateWorkflowIdentifiers: Starting attempt ${attempt}`);

      await session.withTransaction(async () => {
        // Generate TRANSACTION_ID
        const transactionSeq = await Sequence.findOneAndUpdate(
          { collection: 'transactions' },
          { $inc: { value: 1 } },
          { new: true, upsert: true, session }
        );
        if (!transactionSeq?.value || transactionSeq.value <= 0) {
          throw new Error(`Failed to generate valid TRANSACTION_ID on attempt ${attempt}`);
        }
        console.log(`generateWorkflowIdentifiers: Generated TRANSACTION_ID: ${transactionSeq.value}`);

        // Generate WORK_ITEM_ID
        const workItemSeq = await Sequence.findOneAndUpdate(
          { collection: 'wfworkitems' },
          { $inc: { value: 1 } },
          { new: true, upsert: true, session }
        );
        if (!workItemSeq?.value || workItemSeq.value <= 0) {
          throw new Error(`Failed to generate valid WORK_ITEM_ID on attempt ${attempt}`);
        }
        console.log(`generateWorkflowIdentifiers: Generated WORK_ITEM_ID: ${workItemSeq.value}`);

        // Generate EVENT_ID
        const eventSeq = await Sequence.findOneAndUpdate(
          { collection: 'audit_trail_events' },
          { $inc: { value: 1 } },
          { new: true, upsert: true, session }
        );
        if (!eventSeq?.value || eventSeq.value <= 0) {
          throw new Error(`Failed to generate valid EVENT_ID on attempt ${attempt}`);
        }
        console.log(`generateWorkflowIdentifiers: Generated EVENT_ID: ${eventSeq.value}`);

        // Generate other identifiers
        const BUS_PROC_ID = 1000 + Math.floor(Math.random() * 9000);
        const SUB_PROC_ID = 1000 + Math.floor(Math.random() * 9000);
        const QUEUE_ID = 1000 + Math.floor(Math.random() * 9000);
        const JOURNAL_ID = Math.floor(1000000000000000 + Math.random() * 9000000000000000).toString();

        // Generate transaction IDs
        const glInterestPaymentTxnId = generateRandomDigits();
        const glSettlementTxnId = generateRandomDigits();
        const customerInterestPaymentTxnId = generateRandomDigits();
        const customerSettlementTxnId = generateRandomDigits();

        // Validate transaction IDs
        const transactionIds = {
          glInterestPaymentTxnId,
          glSettlementTxnId,
          customerInterestPaymentTxnId,
          customerSettlementTxnId
        };
        for (const [key, value] of Object.entries(transactionIds)) {
          if (!value || typeof value !== 'string' || !/^\d{8,12}$/.test(value)) {
            throw new Error(`Invalid ${key}: ${value} on attempt ${attempt}`);
          }
        }
        console.log(`generateWorkflowIdentifiers: Generated transaction IDs:`, JSON.stringify(transactionIds, null, 2));

        // Construct identifiers object
        identifiers = {
          TRANSACTION_ID: transactionSeq.value,
          WORK_ITEM_ID: workItemSeq.value,
          BUS_PROC_ID,
          SUB_PROC_ID,
          QUEUE_ID,
          EVENT_ID: eventSeq.value,
          JOURNAL_ID,
          glInterestPaymentTxnId,
          glSettlementTxnId,
          customerInterestPaymentTxnId,
          customerSettlementTxnId
        };

        console.log(`generateWorkflowIdentifiers: Constructed identifiers on attempt ${attempt}:`, JSON.stringify(identifiers, null, 2));
      });

      // Check if identifiers is set before committing
      if (!identifiers) {
        throw new Error(`Identifiers object not set after transaction on attempt ${attempt}`);
      }

      console.log(`generateWorkflowIdentifiers: Committing transaction on attempt ${attempt}`);
      await session.commitTransaction();
      console.log(`generateWorkflowIdentifiers: Transaction committed successfully on attempt ${attempt}`);
      return identifiers; // Return identifiers explicitly

    } catch (error) {
      console.error(`generateWorkflowIdentifiers: Attempt ${attempt} failed: ${error.message}`);
      await session.abortTransaction();
      if (attempt === maxRetries) {
        throw new Error(`Failed to generate identifiers after ${maxRetries} attempts: ${error.message}`);
      }
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay before retry
    } finally {
      console.log(`generateWorkflowIdentifiers: Ending session for attempt ${attempt}`);
      await session.endSession();
    }
  }

  // This line should never be reached due to the throw in the catch block
  throw new Error('Failed to generate identifiers after maximum retries');
};

export default generateWorkflowIdentifiers;