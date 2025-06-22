// WF_WORK_ITEMController.js

import CreditApplication from '../models/CreditApplication.js';
import LoanAccount from '../models/LoanAccount.js';
import Customer from '../models/Customer.js';
import DepositTransaction from '../models/DepositTransaction.js';
import CashWithdrawalTransaction from '../models/CashWithdrawalTransaction.js';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import { generateNumber } from '../utils/generateNumber.js';
import NotificationService from '../services/NotificationService.js';

function normalizeItemType(type) {
  if (!type) return type;
  const lowerType = type.toLowerCase();
  if (lowerType.includes('customer')) return 'Customer';
  if (lowerType.includes('credit')) return 'CreditApplication';
  if (lowerType.includes('deposit account')) return 'DepositAccountApplication';
  if (lowerType.includes('deposit transaction')) return 'DepositTransaction';
  if (lowerType.includes('withdrawal')) return 'CashWithdrawalTransaction';
  if (lowerType.includes('loan')) return 'LoanAccount';
  return type;
}

const MODEL_MAP = {
  Customer,
  CreditApplication,
  LoanAccount,
  DepositTransaction,
  CashWithdrawalTransaction,
  DepositAccountApplication,
};

class WF_WORK_ITEMController {
  static async submitTransaction(req, res) {
    try {
      const {
        ITEM_VALUE, ITEM_DESC, ITEM_CLASS_NM, CUST_ID, REC_ST = 'Pending', VERSION, ROW_TS,
        USER_ID, BU_ID, CREATE_DT, SYS_CREATE_TS, WAIT_ST, MAX_DELAY_TM,
        DEADLINE_TM, ORIGINATOR_USER_ROLE_ID, TARGET_DUR_HOURS, ESCALATION_MINUTES,
        ITEM_BU_ID, ITEM_TYPE, TARGET_USER_ROLE_ID, HOME_ADDRESS
      } = req.body;

      if (ITEM_TYPE === 'Customer' && !HOME_ADDRESS) {
        return res.status(400).json({ message: 'HOME_ADDRESS is required for customer workflow items.' });
      }

      const TARGET_DUR_TM = TARGET_DUR_HOURS ? TARGET_DUR_HOURS * 3600 : 0;
      const ESCALATION_TM = ESCALATION_MINUTES ? ESCALATION_MINUTES * 60 : 0;

      const WORK_ITEM_ID = generateNumber(6);
      const BUS_PROC_ID = generateNumber(4);
      const SUB_PROC_ID = generateNumber(4);
      const QUEUE_ID = generateNumber(4);
      const ITEM_ID = generateNumber(4);
      const EVENT_ID = generateNumber(7);
      const WORK_ITEM_SESSION_ID = generateNumber(8);
      const ITEM_REF_NO = generateNumber(4);

      const existingEvent = await WF_WORK_ITEM.findOne({ EVENT_ID });
      if (existingEvent) {
        return res.status(400).json({ message: 'Event ID already exists. Please try again.' });
      }

      const normalizedItemType = normalizeItemType(ITEM_TYPE || ITEM_CLASS_NM);

      const newWorkItem = new WF_WORK_ITEM({
        WORK_ITEM_ID, BUS_PROC_ID, SUB_PROC_ID, QUEUE_ID, ITEM_VALUE, ITEM_DESC,
        ITEM_CLASS_NM, EVENT_ID, CUST_ID, REC_ST, VERSION, ROW_TS, USER_ID,
        BU_ID, CREATE_DT, SYS_CREATE_TS, WAIT_ST, MAX_DELAY_TM, DEADLINE_TM,
        ORIGINATOR_USER_ROLE_ID, WORK_ITEM_SESSION_ID, ITEM_REF_NO, TARGET_DUR_TM,
        ESCALATION_TM, ITEM_BU_ID, ITEM_TYPE: normalizedItemType, ITEM_ID, TARGET_USER_ROLE_ID,
        HOME_ADDRESS
      });

      await newWorkItem.save();

      await NotificationService.send({
        ROLE_ID: TARGET_USER_ROLE_ID,
        message: `New work item created: ${ITEM_DESC}`,
        WORK_ITEM_ID,
        EVENT_ID,
        status: 'Pending',
      });

      res.status(201).json({
        message: 'Work item created and notification sent successfully.',
        data: newWorkItem,
      });
    } catch (error) {
      console.error('Error creating work item:', error);
      res.status(500).json({ message: 'Error creating work item', error });
    }
  }

  static async updateWorkItemStatusOnApproval(itemType, itemId, approvedBy) {
    try {
      const normalizedType = normalizeItemType(itemType);
      const model = MODEL_MAP[normalizedType];
      if (!model) throw new Error(`Model for item type '${normalizedType}' not found.`);

      // Find the main record being approved
      const record = await model.findOne({ _id: itemId });
      if (!record) throw new Error(`${normalizedType} with ID ${itemId} not found.`);

      const isCustomer = normalizedType === 'Customer';
      const newStatus = isCustomer ? 'Active' : 'Approved';

      // Update the main record
      record.REC_ST = newStatus;
      record.STATUS = newStatus;
      record.APPROVED_BY = approvedBy;
      record.APPROVED_DT = new Date();
      await record.save();

      // Prepare all possible identifiers that might link to work items
      const identifiers = [
        record._id.toString(),
        record.CUST_ID,
        record.CUST_NO?.toString(),
        record.APPLICATION_NO?.toString(),
        record.ACCT_NO?.toString()
      ].filter(Boolean);

      // Create query conditions that cover all possible matching scenarios
      const queryConditions = {
        ITEM_TYPE: normalizedType,
        REC_ST: 'Pending', // Only update pending items
        $or: [
          { ITEM_ID: { $in: identifiers } },
          { CUST_ID: { $in: identifiers } },
          { ITEM_VALUE: { $in: identifiers.map(id => Buffer.from(id).toString('base64')) } },
          { ITEM_VALUE: { $in: identifiers } }, // In case it's stored raw
          { 'metadata.originalId': { $in: identifiers } } // Additional possible field
        ]
      };

      // Prepare update fields
      const updateFields = {
        REC_ST: newStatus,
        WAIT_ST: newStatus,
        APPROVED_BY: approvedBy,
        APPROVED_DT: new Date(),
        COMPLETED_DT: new Date(),
      };

      // Update all matching work items
      const updateResult = await WF_WORK_ITEM.updateMany(
        queryConditions,
        { $set: updateFields }
      );

      // Find and archive all affected items
      const affectedItems = await WF_WORK_ITEM.find(queryConditions);
      for (const item of affectedItems) {
        await this.archiveWorkItem(item._id);
      }

      // Only send notification if we found affected work items
      if (affectedItems.length > 0) {
        await NotificationService.send({
          ROLE_ID: record.ORIGINATOR_USER_ROLE_ID || 'System',
          message: `${normalizedType} ${record._id} approved by ${approvedBy}`,
          status: newStatus,
          ITEM_TYPE: normalizedType,
          WORK_ITEM_ID: affectedItems[0].WORK_ITEM_ID
        });
      }

      return {
        success: true,
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount,
        affectedItems: affectedItems.length
      };
    } catch (err) {
      console.error('Approval failed:', {
        error: err.message,
        itemType,
        itemId,
        approvedBy,
        stack: err.stack
      });
      return {
        success: false,
        error: err.message
      };
    }
  }

  static async archiveWorkItem(workItemId, session = null) {
    try {
      const options = session ? { session } : {};
      await WF_WORK_ITEM.findByIdAndDelete(workItemId, options);
      return true;
    } catch (err) {
      console.error('Failed to archive work item:', err);
      return false;
    }
  }

  static async getAllWorkItems(req, res) {
    try {
      const workItems = await WF_WORK_ITEM.find({ REC_ST: { $in: ['Pending', 'Rejected'] } }).sort({ CREATE_DT: -1 });
      const workItemsWithAge = workItems.map(item => ({
        ...item.toObject(),
        age: WF_WORK_ITEMController.calculateAge(item.CREATE_DT || item.created_at || item.CREATE_AT)
      }));
      res.status(200).json({ message: 'Active work items fetched successfully.', data: workItemsWithAge });
    } catch (error) {
      console.error('Error fetching work items:', error);
      res.status(500).json({ message: 'Error fetching work items', error: error.message });
    }
  }

  static async getWorkItemHistory(req, res) {
    try {
      const workItems = await WF_WORK_ITEM.find({ REC_ST: 'Approved' }).sort({ APPROVED_DT: -1 }).limit(100);
      res.status(200).json({ message: 'Work item history fetched successfully.', data: workItems });
    } catch (error) {
      console.error('Error fetching work item history:', error);
      res.status(500).json({ message: 'Error fetching history', error: error.message });
    }
  }

  static calculateAge(createdAt) {
    try {
      const createdDate = new Date(createdAt);
      const currentDate = new Date();
      if (isNaN(createdDate.getTime())) return 0;
      return Math.floor((currentDate - createdDate) / (1000 * 60 * 60));
    } catch (error) {
      console.error("Error calculating age:", error);
      return 0;
    }
  }

  static async deleteWorkItem(req, res) {
    try {
      const { WORK_ITEM_ID } = req.params;
      const workItem = await WF_WORK_ITEM.findOneAndDelete({ WORK_ITEM_ID });
      if (!workItem) return res.status(404).json({ message: 'Work item not found.' });
      res.status(200).json({ message: 'Work item deleted successfully.' });
    } catch (error) {
      console.error('Error deleting work item:', error);
      res.status(500).json({ message: 'Error deleting work item', error });
    }
  }

  static async getWorkItemById(req, res) {
    try {
      const { workItemId } = req.params;
      const workItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID: workItemId });
      if (!workItem) return res.status(404).json({ message: 'Work item not found.' });
      res.status(200).json({ message: 'Work item fetched successfully.', data: workItem });
    } catch (error) {
      console.error('Error fetching work item:', error);
      res.status(500).json({ message: 'Error fetching work item', error });
    }
  }

  static async getWorkItems(req, res) {
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
  }
}

export default WF_WORK_ITEMController;