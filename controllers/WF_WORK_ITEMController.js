import mongoose from 'mongoose';
import DepositTransaction from '../models/DepositTransaction.js';
import NotificationService from '../services/NotificationService.js';
import { generateNumber } from '../utils/generateNumber.js';
import Customer from '../models/Customer.js';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import CustomerAccount from '../models/CustomerAccount.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import CreditApplication from '../models/CreditApplication.js';
import LoanAccount from '../models/LoanAccount.js';
import Transaction from '../models/Transaction.js';

const MODEL_MAP = {
  DepositTransaction,
  Customer,
  DepositAccountApplication,
  CustomerAccount,
  CreditApplication,
  LoanAccount,
  Transaction,
};

function normalizeItemType(type) {
  if (!type) return type;
  const lowerType = type.toLowerCase();
  if (lowerType.includes('customer')) return 'Customer';
  if (lowerType.includes('credit')) return 'CreditApplication';
  if (lowerType.includes('deposit account')) return 'DepositAccountApplication';
  if (lowerType.includes('deposit transaction')) return 'DepositTransaction';
  if (lowerType.includes('withdrawal')) return 'CashWithdrawalTransaction';
  if (lowerType.includes('loan')) return 'LoanAccount';
  if (lowerType.includes('customer account')) return 'CustomerAccount';
  if (lowerType.includes('loan account')) return 'LoanAccount';
  if (lowerType.includes('transaction')) return 'Transaction';
  return type;
}


const WF_WORK_ITEMController = {
  submitTransaction: async (req) => {
    try {
      console.log('🟢 Entering submitTransaction');

      const {
        ITEM_VALUE,
        ITEM_DESC,
        ITEM_CLASS_NM,
        ITEM_TYPE,
        CUST_ID,
        USER_ID,
        BU_ID,
        CREATE_DT,
        REC_ST,
        WAIT_ST,
        VERSION,
        TARGET_USER_ROLE_ID,
        ORIGINATOR_USER_ROLE_ID,
        ITEM_ID,
        MAX_DELAY_TM,
        DEADLINE_TM,
        TARGET_DUR_HOURS,
        ESCALATION_MINUTES,
        ITEM_BU_ID,
        HOME_ADDRESS,
        depositPayload
      } = req.body || {};

      if (!ITEM_VALUE || !ITEM_DESC || !ITEM_CLASS_NM || !ITEM_TYPE || !CUST_ID || !USER_ID || !BU_ID || !TARGET_USER_ROLE_ID || !ORIGINATOR_USER_ROLE_ID) {
        throw new Error('Missing required workflow fields');
      }

      if (normalizeItemType(ITEM_TYPE) === 'Customer' && !HOME_ADDRESS) {
        throw new Error('HOME_ADDRESS is required for customer workflow items.');
      }

      let deposit = null;
      if (depositPayload && depositPayload._id) {
        deposit = await DepositTransaction.findById(depositPayload._id);
        if (!deposit) throw new Error('DepositTransaction not found or invalid deposit payload.');
      }

      const normalizedItemType = normalizeItemType(ITEM_TYPE || ITEM_CLASS_NM);
      const TARGET_DUR_TM = TARGET_DUR_HOURS ? TARGET_DUR_HOURS * 3600 : 0;
      const ESCALATION_TM = ESCALATION_MINUTES ? ESCALATION_MINUTES * 60 : 0;

      const WORK_ITEM_ID = generateNumber(6);
      const EVENT_ID = generateNumber(7);
      const BUS_PROC_ID = generateNumber(4);
      const SUB_PROC_ID = generateNumber(4);
      const QUEUE_ID = generateNumber(4);
      const WORK_ITEM_SESSION_ID = generateNumber(8);
      const ITEM_REF_NO = generateNumber(4);

      const existingEvent = await WF_WORK_ITEM.findOne({ EVENT_ID });
      if (existingEvent) {
        return { success: false, error: 'Event ID already exists. Please retry.' };
      }

      const newWorkItem = new WF_WORK_ITEM({
        WORK_ITEM_ID,
        BUS_PROC_ID,
        SUB_PROC_ID,
        QUEUE_ID,
        ITEM_VALUE: Buffer.from(String(ITEM_VALUE)).toString('base64'),
        ITEM_DESC,
        ITEM_CLASS_NM,
        EVENT_ID,
        CUST_ID,
        REC_ST: REC_ST || 'Pending',
        VERSION: VERSION || 1,
        ROW_TS: new Date(),
        USER_ID,
        BU_ID,
        CREATE_DT: CREATE_DT || new Date(),
        SYS_CREATE_TS: new Date(),
        WAIT_ST: WAIT_ST || 'Pending',
        MAX_DELAY_TM,
        DEADLINE_TM,
        ORIGINATOR_USER_ROLE_ID,
        WORK_ITEM_SESSION_ID,
        ITEM_REF_NO,
        TARGET_DUR_TM,
        ESCALATION_TM,
        ITEM_BU_ID,
        ITEM_TYPE: normalizedItemType,
        ITEM_ID: deposit ? deposit._id : ITEM_ID,
        TARGET_USER_ROLE_ID,
        HOME_ADDRESS
      });

      await newWorkItem.save();

      await NotificationService.send({
        ROLE_ID: TARGET_USER_ROLE_ID,
        message: `New work item created: ${ITEM_DESC}`,
        WORK_ITEM_ID,
        EVENT_ID,
        status: 'Pending',
        notificationType: 'system'
      });

      console.log('✅ Workflow item created:', newWorkItem);

      return { success: true, data: newWorkItem };

    } catch (error) {
      console.error('❌ submitTransaction error:', error);
      return { success: false, error: error.message || 'Unexpected error' };
    }
  },

 findWorkItemById: async (workItemId, session) => {
  const numericId = Number(workItemId);

  if (isNaN(numericId)) {
    throw new Error(`Invalid workItemId: ${workItemId}`);
  }

  const workItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID: numericId }).session(session);

  if (!workItem) {
    const error = new Error('WORK_ITEM_NOT_FOUND');
    error.code = 'WORK_ITEM_NOT_FOUND';
    throw error;
  }

  return workItem;
},


  calculateNewBalance: async (query, custId) => {
    const transaction = await DepositTransaction.findOne(query);
    if (!transaction) return null;

    const account = await CustomerAccount.findOne({ ACCT_NO: transaction.ACCT_NO, CUST_ID: custId });
    return account ? account.LEDGER_BAL + transaction.AMOUNT : transaction.AMOUNT;
  },

  archiveWorkItem: async (workItemId) => {
    try {
      await WF_WORK_ITEM.findByIdAndUpdate(workItemId, { ARCHIVED: true });
    } catch (err) {
      console.error('Failed to archive work item:', err);
    }
  },

  getAllWorkItems: async (req, res) => {
    try {
      const pendingWorkItems = await WF_WORK_ITEM.find({ REC_ST: 'Pending' }).sort({ CREATE_DT: -1 });

      if (!pendingWorkItems || pendingWorkItems.length === 0) {
        return res.status(404).json({ message: 'No pending work items found' });
      }

      const enrichedItems = await Promise.all(pendingWorkItems.map(async (item) => {
        let details = null;

        try {
          const itemType = item.ITEM_TYPE;

          if (itemType === 'Customer') {
            details = await Customer.findOne({ CUST_ID: item.CUST_ID }).lean();
          } else if (itemType === 'DepositTransaction') {
            if (mongoose.Types.ObjectId.isValid(item.ITEM_ID)) {
              details = await DepositTransaction.findById(item.ITEM_ID).lean();
            }
          } else if (itemType === 'DepositAccountApplication') {
            details = await DepositAccountApplication.findOne({ CUST_ID: item.CUST_ID }).lean();
          }

        } catch (err) {
          console.warn(`Failed to fetch details for item ${item.ITEM_ID}:`, err.message);
        }

        return {
          ...item.toObject(),
          age: WF_WORK_ITEMController.calculateAge(item.CREATE_DT || item.created_at || item.CREATE_AT),
          details
        };
      }));

      return res.status(200).json({
        message: 'Pending work items fetched successfully.',
        data: enrichedItems
      });
    } catch (error) {
      console.error('Error fetching work items:', error);
      return res.status(500).json({ message: 'Error fetching work items', error: error.message });
    }
  },

  getWorkItemHistory: async (req, res) => {
    try {
      const workItems = await WF_WORK_ITEM.find({ REC_ST: 'Approved' }).sort({ APPROVED_DT: -1 }).limit(100);
      res.status(200).json({ message: 'Work item history fetched successfully.', data: workItems });
    } catch (error) {
      console.error('Error fetching work item history:', error);
      res.status(500).json({ message: 'Error fetching history', error: error.message });
    }
  },

  calculateAge: (createdAt) => {
    try {
      const createdDate = new Date(createdAt);
      const currentDate = new Date();
      if (isNaN(createdDate.getTime())) return 0;
      return Math.floor((currentDate - createdDate) / (1000 * 60 * 60));
    } catch (error) {
      console.error("Error calculating age:", error);
      return 0;
    }
  },

  deleteWorkItem: async (req, res) => {
    try {
      const { WORK_ITEM_ID } = req.params;
      const workItem = await WF_WORK_ITEM.findOneAndDelete({ WORK_ITEM_ID });
      if (!workItem) return res.status(404).json({ message: 'Work item not found.' });
      res.status(200).json({ message: 'Work item deleted successfully.' });
    } catch (error) {
      console.error('Error deleting work item:', error);
      res.status(500).json({ message: 'Error deleting work item', error });
    }
  },

  getWorkItemById: async (req, res) => {
    try {
      const { workItemId } = req.params;
      const workItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID: workItemId });
      if (!workItem) return res.status(404).json({ message: 'Work item not found.' });
      res.status(200).json({ message: 'Work item fetched successfully.', data: workItem });
    } catch (error) {
      console.error('Error fetching work item:', error);
      res.status(500).json({ message: 'Error fetching work item', error });
    }
  },

  getWorkItems: async (req, res) => {
    try {
      const {
        CUST_ID, USER_ID, BU_ID, WAIT_ST, REC_ST,
        ITEM_CLASS_NM = 'DepositAccount',
        page = 1, limit = 10, showAll = false
      } = req.query;

      const query = { ITEM_CLASS_NM };
      if (!showAll && !REC_ST) query.REC_ST = 'Pending';
      if (REC_ST) query.REC_ST = REC_ST;
      if (CUST_ID) query.CUST_ID = CUST_ID;
      if (USER_ID) query.USER_ID = USER_ID;
      if (BU_ID) query.BU_ID = BU_ID;
      if (WAIT_ST) query.WAIT_ST = WAIT_ST;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { CREATE_DT: -1 }
      };

      const workItems = await WF_WORK_ITEM.paginate(query, options);

      if (!workItems || workItems.docs.length === 0) {
        return res.status(404).json({ message: 'No work items found matching the criteria' });
      }

      const decodedWorkItems = workItems.docs.map(item => {
        try {
          const decodedValue = Buffer.from(item.ITEM_VALUE, 'base64').toString('ascii');
          return {
            ...item._doc,
            ITEM_VALUE: decodedValue,
            status: item.REC_ST === 'Completed'
              ? (item.WAIT_ST === 'Approved' ? 'approved' : 'rejected')
              : 'pending'
          };
        } catch {
          return {
            ...item._doc,
            status: item.REC_ST === 'Completed'
              ? (item.WAIT_ST === 'Approved' ? 'approved' : 'rejected')
              : 'pending'
          };
        }
      });

      res.status(200).json({
        message: 'Work items fetched successfully',
        data: decodedWorkItems,
        pagination: {
          total: workItems.totalDocs,
          pages: workItems.totalPages,
          currentPage: workItems.page,
          itemsPerPage: workItems.limit
        }
      });
    } catch (error) {
      console.error('Error fetching work items:', error);
      res.status(500).json({ message: 'Error fetching work items', error: error.message });
    }
  },

  updateWorkItemStatusOnApproval: async (itemClass, custId, approvedBy) => {
    try {
      const workItem = await WF_WORK_ITEM.findOneAndUpdate(
        { ITEM_CLASS_NM: itemClass, CUST_ID: custId },
        {
          REC_ST: 'Completed',
          WAIT_ST: 'Approved',
          APPROVED_BY: approvedBy,
          APPROVED_DT: new Date(),
          COMPLETED_DT: new Date(),
          ACTION_TAKEN: 'Approved',
          UPDATED_AT: new Date()
        },
        { new: true }
      );

      return { success: !!workItem, data: workItem };
    } catch (error) {
      console.error('❌ Error updating work item on approval:', error);
      return { success: false, error: error.message };
    }
  },

  completeWorkItem: async (workItemId, status = 'Approved', userId = 'system', session = null) => {
    try {
      const workItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID: Number(workItemId) }).session(session || null);

      if (!workItem) {
        console.warn(`⚠️ Workflow item ${workItemId} not found`);
        return { success: false, message: 'Workflow item not found' };
      }

      workItem.REC_ST = 'Completed';
      workItem.WAIT_ST = status;
      workItem.APPROVED_BY = userId;
      workItem.APPROVAL_DATE = new Date();
      workItem.COMPLETED_DT = new Date();
      workItem.ACTION_TAKEN = status;
      workItem.LAST_UPDATED = new Date();

      const options = session ? { session } : {};
      await workItem.save(options);

      await NotificationService.send({
        ROLE_ID: workItem.ORIGINATOR_USER_ROLE_ID,
        message: `Workflow item ${workItem.WORK_ITEM_ID} has been ${status}`,
        WORK_ITEM_ID: workItem.WORK_ITEM_ID,
        CUST_ID: workItem.CUST_ID,
        status
      });

      console.log(`✅ Workflow item ${workItemId} updated to ${status}`);
      return { success: true, updatedWorkItem: workItem };
    } catch (error) {
      console.error(`❌ Error completing workflow item ${workItemId}:`, error.message);
      return { success: false, message: error.message };
    }
  },

  updateWorkItemStatusOnRejection: async (itemClass, custId, rejectedBy, rejectionReason) => {
    try {
      const workItem = await WF_WORK_ITEM.findOneAndUpdate(
        { ITEM_CLASS_NM: itemClass, CUST_ID: custId },
        {
          REC_ST: 'Rejected',
          WAIT_ST: 'Rejected',
          COMPLETED_BY: rejectedBy,
          COMPLETED_DT: new Date(),
          ACTION_TAKEN: 'Rejected',
          REJECTION_REASON: rejectionReason,
          UPDATED_AT: new Date()
        },
        { new: true }
      );

      return { success: !!workItem, data: workItem };
    } catch (error) {
      console.error('❌ Error updating work item on rejection:', error);
      return { success: false, error: error.message };
    }
  }
};


export default WF_WORK_ITEMController;