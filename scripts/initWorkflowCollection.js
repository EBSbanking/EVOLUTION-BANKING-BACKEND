// scripts/initWorkflowCollection.js
import mongoose from 'mongoose';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import Transaction from '../models/Transaction.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';

async function initializeWorkflowCollection() {
  const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined');
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected successfully');

    const pendingTransactions = await Transaction.find({
      status: { $in: ['PENDING', 'PENDING_APPROVAL'] }
    });

    for (const tx of pendingTransactions) {
      const {
        WORK_ITEM_ID,
        BUS_PROC_ID,
        SUB_PROC_ID,
        QUEUE_ID,
        EVENT_ID,
        JOURNAL_ID,
        TRANSACTION_ID
      } = generateWorkflowIdentifiers();

      await WF_WORK_ITEM.create({
        WORK_ITEM_ID,
        processId: BUS_PROC_ID,
        currentStep: SUB_PROC_ID,
        QUEUE_ID,
        ITEM_DESC: `${tx.TRANSACTION_TYPE} Transaction`,
        entityType: 'TRANSACTION',
        EVENT_ID,
        JOURNAL_ID,
        TRANSACTION_ID,
        CUST_ID: tx.CUST_ID,
        REC_ST: 'PENDING',
        createdBy: tx.createdBy,
        BU_ID: tx.BU_ID,
        ITEM_TYPE: 'Transaction',
        entityId: tx._id,
        assignedTo: 'COMPLIANCE_OFFICER',
        metadata: {
          transactionType: tx.TRANSACTION_TYPE,
          amount: tx.AMOUNT,
          accountNumber: tx.ACCT_NO
        }
      });
    }

    console.log(`✅ Created ${pendingTransactions.length} workflow items`);
  } catch (err) {
    console.error('❌ Error initializing workflow items:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

initializeWorkflowCollection();
