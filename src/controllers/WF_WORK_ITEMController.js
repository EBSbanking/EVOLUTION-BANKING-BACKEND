// controllers/WF_WORK_ITEMController.js
// ✅ Correct import - use the actual file name with underscores
import WFWorkItem from '../models/WF_WORK_ITEM.js';
import DepositTransaction from '../models/DepositTransaction.js';
import NotificationService from '../Services/NotificationService.js';
import generateNumber from '../utils/generateNumber.js';
import Customer from '../models/Customer.js';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import CustomerAccount from '../models/CustomerAccount.js';
import CreditApplication from '../models/CreditApplication.js';
import LoanAccount from '../models/LoanAccount.js';
import Transaction from '../models/Transaction.js';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

// ... rest of the controller code remains the same ...

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

// Async handler utility
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Helper function with fallback for generateNumber
const generateIdWithFallback = async (length, collectionName) => {
  try {
    return await generateNumber(length, collectionName);
  } catch (error) {
    console.warn(`⚠️ generateNumber failed, using fallback for ${collectionName}:`, error.message);
    // Fallback: timestamp + random
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000);
    const combined = timestamp + random;
    return parseInt(combined.slice(-length).padStart(length, '0'));
  }
};

const WFWorkItemController = {
  /**
   * Move work item to achieved status and exit workflow
   */
  moveToAchieved: async (workItemId, status, userId = 'system', transaction = null) => {
    try {
      const workItem = await WFWorkItem.findByPk(workItemId, { transaction });

      if (!workItem) {
        console.warn(`⚠️ Workflow item ${workItemId} not found`);
        return { success: false, message: 'Workflow item not found' };
      }

      // Update to achieved status and mark as completed
      await workItem.update({
        REC_ST: 'achieved',
        WAIT_ST: status,
        APPROVED_BY: userId,
        APPROVAL_DATE: new Date(),
        COMPLETED_DT: new Date(),
        ACTION_TAKEN: status === 'APPROVED' ? 'Approved' : 'Completed',
        LAST_UPDATED: new Date(),
        WORKFLOW_STATUS: 'EXITED',
        lastUpdatedBy: userId
      }, { transaction });

      await NotificationService.send({
        ROLE_ID: workItem.ORIGINATOR_USER_ROLE_ID,
        message: `Workflow item ${workItem.WORK_ITEM_ID} has been ${status} and moved to achieved status`,
        WORK_ITEM_ID: workItem.WORK_ITEM_ID,
        CUST_ID: workItem.CUST_ID,
        status: 'achieved'
      });

      console.log(`✅ Workflow item ${workItemId} moved to achieved status with ${status}`);
      return { success: true, updatedWorkItem: workItem };
    } catch (error) {
      console.error(`❌ Error moving workflow item ${workItemId} to achieved:`, error.message);
      return { success: false, message: error.message };
    }
  },

  /**
   * Update work item status on approval and move to achieved
   */
  updateWorkItemStatusOnApproval: async (itemClass, custId, approvedBy) => {
    const t = await sequelize.transaction();
    
    try {
      const workItem = await WFWorkItem.findOne({
        where: { 
          ITEM_CLASS_NM: itemClass, 
          CUST_ID: custId, 
          REC_ST: 'pending' 
        },
        transaction: t
      });

      if (!workItem) {
        await t.rollback();
        return { success: false, error: 'No pending workflow item found' };
      }

      await workItem.update({
        REC_ST: 'achieved',
        WAIT_ST: 'APPROVED',
        APPROVED_BY: approvedBy,
        APPROVED_DT: new Date(),
        COMPLETED_DT: new Date(),
        ACTION_TAKEN: 'Approved',
        WORKFLOW_STATUS: 'EXITED',
        lastUpdatedBy: approvedBy
      }, { transaction: t });

      await t.commit();

      await NotificationService.send({
        ROLE_ID: workItem.TARGET_USER_ROLE_ID,
        message: `Work item ${workItem.ITEM_DESC} approved by ${approvedBy} and moved to achieved status`,
        WORK_ITEM_ID: workItem.WORK_ITEM_ID,
        EVENT_ID: workItem.EVENT_ID,
        status: 'achieved',
        notificationType: 'system',
      });

      return { success: true, data: workItem };
    } catch (error) {
      await t.rollback();
      console.error('❌ Error updating work item on approval:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update work item status on rejection
   */
  updateWorkItemStatusOnRejection: async (itemClass, custId, rejectedBy, comments) => {
    const t = await sequelize.transaction();
    
    try {
      const workItem = await WFWorkItem.findOne({
        where: { 
          ITEM_CLASS_NM: itemClass, 
          CUST_ID: custId, 
          REC_ST: 'pending' 
        },
        transaction: t
      });

      if (!workItem) {
        await t.rollback();
        return { success: false, error: 'No pending workflow item found' };
      }

      await workItem.update({
        REC_ST: 'completed',
        WAIT_ST: 'REJECTED',
        REJECTED_BY: rejectedBy,
        COMMENTS: comments,
        COMPLETED_DT: new Date(),
        ACTION_TAKEN: 'Rejected',
        lastUpdatedBy: rejectedBy
      }, { transaction: t });

      await t.commit();

      await NotificationService.send({
        ROLE_ID: workItem.TARGET_USER_ROLE_ID,
        message: `Work item ${workItem.ITEM_DESC} rejected by ${rejectedBy}: ${comments}`,
        WORK_ITEM_ID: workItem.WORK_ITEM_ID,
        EVENT_ID: workItem.EVENT_ID,
        status: 'rejected',
        notificationType: 'system',
      });

      return { success: true, data: workItem };
    } catch (error) {
      await t.rollback();
      console.error('❌ Error updating work item on rejection:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Complete work item and move to achieved for approved/completed statuses
   */
  completeWorkItem: async (workItemId, status = 'APPROVED', userId = 'system', transaction = null) => {
    try {
      const workItem = await WFWorkItem.findByPk(workItemId, { transaction });

      if (!workItem) {
        console.warn(`⚠️ Workflow item ${workItemId} not found`);
        return { success: false, message: 'Workflow item not found' };
      }

      const shouldMoveToAchieved = status === 'APPROVED' || status === 'COMPLETED';
      
      if (shouldMoveToAchieved) {
        return await WFWorkItemController.moveToAchieved(workItemId, status, userId, transaction);
      } else {
        await workItem.update({
          REC_ST: 'completed',
          WAIT_ST: status,
          APPROVED_BY: userId,
          APPROVAL_DATE: new Date(),
          COMPLETED_DT: new Date(),
          ACTION_TAKEN: status,
          LAST_UPDATED: new Date(),
          lastUpdatedBy: userId
        }, { transaction });

        await NotificationService.send({
          ROLE_ID: workItem.ORIGINATOR_USER_ROLE_ID,
          message: `Workflow item ${workItem.WORK_ITEM_ID} has been ${status}`,
          WORK_ITEM_ID: workItem.WORK_ITEM_ID,
          CUST_ID: workItem.CUST_ID,
          status
        });

        console.log(`✅ Workflow item ${workItemId} updated to ${status}`);
        return { success: true, updatedWorkItem: workItem };
      }
    } catch (error) {
      console.error(`❌ Error completing workflow item ${workItemId}:`, error.message);
      return { success: false, message: error.message };
    }
  },

  /**
   * Get achieved work items
   */
  getAchievedWorkItems: asyncHandler(async (req, res) => {
    try {
      const {
        page = 1, 
        limit = 10,
        CUST_ID,
        ITEM_CLASS_NM
      } = req.query;

      const whereClause = { REC_ST: 'achieved' };
      
      if (CUST_ID) whereClause.CUST_ID = CUST_ID;
      if (ITEM_CLASS_NM) whereClause.ITEM_CLASS_NM = ITEM_CLASS_NM;

      const { count, rows: workItems } = await WFWorkItem.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        order: [['COMPLETED_DT', 'DESC']]
      });

      if (!workItems || workItems.length === 0) {
        return res.status(200).json({ 
          success: true,
          message: 'No achieved work items found',
          data: []
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Achieved work items fetched successfully',
        data: workItems,
        pagination: {
          total: count,
          pages: Math.ceil(count / parseInt(limit)),
          currentPage: parseInt(page),
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching achieved work items:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Error fetching achieved work items', 
        error: error.message 
      });
    }
  }),

  /**
   * Submit transaction - creates a new workflow item
   */
  submitTransaction: async (req) => {
    const t = await sequelize.transaction();
    
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
        depositPayload,
      } = req.body || {};

      if (!ITEM_VALUE || !ITEM_DESC || !ITEM_CLASS_NM || !ITEM_TYPE || !CUST_ID || !USER_ID || !BU_ID || !TARGET_USER_ROLE_ID || !ORIGINATOR_USER_ROLE_ID) {
        await t.rollback();
        throw new Error('Missing required workflow fields');
      }

      if (normalizeItemType(ITEM_TYPE) === 'Customer' && !HOME_ADDRESS) {
        await t.rollback();
        throw new Error('HOME_ADDRESS is required for customer workflow items.');
      }

      let deposit = null;
      if (depositPayload && depositPayload.id) {
        deposit = await DepositTransaction.findByPk(depositPayload.id, { transaction: t });
        if (!deposit) {
          await t.rollback();
          throw new Error('DepositTransaction not found or invalid deposit payload.');
        }
      }

      const normalizedItemType = normalizeItemType(ITEM_TYPE || ITEM_CLASS_NM);
      const TARGET_DUR_TM = TARGET_DUR_HOURS ? TARGET_DUR_HOURS * 3600 : 0;
      const ESCALATION_TM = ESCALATION_MINUTES ? ESCALATION_MINUTES * 60 : 0;

      // Generate IDs
      const WORK_ITEM_ID = await generateIdWithFallback(6, 'work_item');
      const EVENT_ID = await generateIdWithFallback(7, 'work_event');
      const BUS_PROC_ID = await generateIdWithFallback(4, 'business_process');
      const SUB_PROC_ID = await generateIdWithFallback(4, 'sub_process');
      const QUEUE_ID = await generateIdWithFallback(4, 'work_queue');
      const WORK_ITEM_SESSION_ID = await generateIdWithFallback(8, 'work_session');
      const ITEM_REF_NO = await generateIdWithFallback(4, 'item_reference');

      // Check for existing event
      const existingEvent = await WFWorkItem.findOne({
        where: { EVENT_ID },
        transaction: t
      });
      
      if (existingEvent) {
        await t.rollback();
        return { success: false, error: 'Event ID already exists. Please retry.' };
      }

      const newWorkItem = await WFWorkItem.create({
        WORK_ITEM_ID,
        BUS_PROC_ID,
        SUB_PROC_ID,
        QUEUE_ID,
        ITEM_VALUE: Buffer.from(String(ITEM_VALUE)).toString('base64'),
        ITEM_DESC,
        ITEM_CLASS_NM,
        EVENT_ID,
        CUST_ID,
        REC_ST: REC_ST || 'pending',
        VERSION: VERSION || 1,
        ROW_TS: new Date(),
        USER_ID,
        BU_ID,
        CREATE_DT: CREATE_DT || new Date(),
        SYS_CREATE_TS: new Date(),
        WAIT_ST: WAIT_ST || 'PENDING',
        MAX_DELAY_TM,
        DEADLINE_TM,
        ORIGINATOR_USER_ROLE_ID,
        WORK_ITEM_SESSION_ID,
        ITEM_REF_NO,
        TARGET_DUR_TM,
        ESCALATION_TM,
        ITEM_BU_ID,
        ITEM_TYPE: normalizedItemType,
        ITEM_ID: deposit ? deposit.id : ITEM_ID,
        TARGET_USER_ROLE_ID,
        HOME_ADDRESS,
      }, { transaction: t });

      await t.commit();

      await NotificationService.send({
        ROLE_ID: TARGET_USER_ROLE_ID,
        message: `New work item created: ${ITEM_DESC}`,
        WORK_ITEM_ID,
        EVENT_ID,
        status: 'pending',
        notificationType: 'system',
      });

      console.log('✅ Workflow item created:', newWorkItem);
      return { success: true, data: newWorkItem };

    } catch (error) {
      await t.rollback();
      console.error('❌ submitTransaction error:', error);
      return { success: false, error: error.message || 'Unexpected error' };
    }
  },

  /**
   * Find work item by ID
   */
  findWorkItemById: async (workItemId, transaction = null) => {
    const numericId = Number(workItemId);

    if (isNaN(numericId)) {
      throw new Error(`Invalid workItemId: ${workItemId}`);
    }

    const workItem = await WFWorkItem.findByPk(numericId, { transaction });

    if (!workItem) {
      const error = new Error('WORK_ITEM_NOT_FOUND');
      error.code = 'WORK_ITEM_NOT_FOUND';
      throw error;
    }

    return workItem;
  },

  /**
   * Calculate new balance
   */
  calculateNewBalance: async (query, custId) => {
    const transaction = await DepositTransaction.findOne({ where: query });
    if (!transaction) return null;

    const account = await CustomerAccount.findOne({ 
      where: { 
        ACCT_NO: transaction.ACCT_NO, 
        CUST_ID: custId 
      }
    });
    return account ? account.LEDGER_BAL + transaction.AMOUNT : transaction.AMOUNT;
  },

  /**
   * Archive work item
   */
  archiveWorkItem: async (workItemId) => {
    try {
      await WFWorkItem.update(
        { ARCHIVED: true },
        { where: { WORK_ITEM_ID: workItemId } }
      );
    } catch (err) {
      console.error('Failed to archive work item:', err);
    }
  },

  /**
   * Get all work items - FIXED VERSION (no CREATED_AT reference)
   */
  getAllWorkItems: asyncHandler(async (req, res) => {
    try {
      const workItems = await WFWorkItem.findAll({
        where: {
          REC_ST: 'pending'
        },
        order: [['CREATE_DT', 'DESC']]
      });

      if (!workItems || workItems.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No pending work items found',
          data: []
        });
      }

      const enrichedItems = await Promise.all(
        workItems.map(async (item) => {
          let details = null;

          try {
            const itemType = item.ITEM_TYPE;

            if (itemType === 'Customer') {
              details = await Customer.findOne({ 
                where: { CUST_ID: item.CUST_ID } 
              });
            } else if (itemType === 'DepositTransaction' && item.ITEM_ID) {
              details = await DepositTransaction.findByPk(item.ITEM_ID);
            } else if (itemType === 'DepositAccountApplication') {
              details = await DepositAccountApplication.findOne({ 
                where: { CUST_ID: item.CUST_ID } 
              });
            }
          } catch (err) {
            console.warn(`⚠️ Failed to fetch details for item ${item.ITEM_ID}:`, err.message);
          }

          return {
            ...item.toJSON(),
            // ✅ Use CREATE_DT only (CREATED_AT doesn't exist)
            age: WFWorkItemController.calculateAge(
              item.CREATE_DT || new Date()
            ),
            details
          };
        })
      );

      return res.status(200).json({
        success: true,
        message: 'Pending work items fetched successfully.',
        data: enrichedItems
      });
    } catch (error) {
      console.error('❌ Error fetching work items:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching work items',
        error: error.message
      });
    }
  }),

  /**
   * Get work item history
   */
  getWorkItemHistory: asyncHandler(async (req, res) => {
    try {
      const workItems = await WFWorkItem.findAll({
        where: {
          [Op.or]: [
            { REC_ST: 'completed' },
            { REC_ST: 'achieved' }
          ]
        },
        order: [['COMPLETED_DT', 'DESC']],
        limit: 100
      });
      
      res.status(200).json({ 
        success: true,
        message: 'Work item history fetched successfully.', 
        data: workItems 
      });
    } catch (error) {
      console.error('Error fetching work item history:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error fetching history', 
        error: error.message 
      });
    }
  }),

  /**
   * Calculate age of work item - FIXED (no CREATED_AT)
   */
  calculateAge: (createdAt) => {
    try {
      const dateToUse = createdAt || new Date();
      const createdDate = new Date(dateToUse);
      const currentDate = new Date();
      if (isNaN(createdDate.getTime())) return 0;
      return Math.floor((currentDate - createdDate) / (1000 * 60 * 60));
    } catch (error) {
      console.error("Error calculating age:", error);
      return 0;
    }
  },

  /**
   * Delete work item
   */
  deleteWorkItem: asyncHandler(async (req, res) => {
    try {
      const { WORK_ITEM_ID } = req.params;
      const workItem = await WFWorkItem.findOne({ where: { WORK_ITEM_ID } });
      
      if (!workItem) {
        return res.status(404).json({ 
          success: false,
          message: 'Work item not found.' 
        });
      }
      
      await workItem.destroy();
      res.status(200).json({ 
        success: true,
        message: 'Work item deleted successfully.' 
      });
    } catch (error) {
      console.error('Error deleting work item:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error deleting work item', 
        error: error.message 
      });
    }
  }),

  /**
   * Get work item by ID
   */
  getWorkItemById: asyncHandler(async (req, res) => {
    try {
      const { workItemId } = req.params;
      const workItem = await WFWorkItem.findOne({ where: { WORK_ITEM_ID: workItemId } });
      
      if (!workItem) {
        return res.status(404).json({ 
          success: false,
          message: 'Work item not found.' 
        });
      }
      
      res.status(200).json({ 
        success: true,
        message: 'Work item fetched successfully.', 
        data: workItem 
      });
    } catch (error) {
      console.error('Error fetching work item:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error fetching work item', 
        error: error.message 
      });
    }
  }),

  /**
   * Get work items with pagination and filtering
   */
  getWorkItems: asyncHandler(async (req, res) => {
    try {
      const {
        CUST_ID, USER_ID, BU_ID, WAIT_ST, REC_ST,
        ITEM_CLASS_NM = 'DepositAccount',
        page = 1, limit = 10, showAll = false
      } = req.query;

      const whereClause = { ITEM_CLASS_NM };
      
      if (!showAll && !REC_ST) whereClause.REC_ST = 'pending';
      if (REC_ST) whereClause.REC_ST = REC_ST;
      if (CUST_ID) whereClause.CUST_ID = CUST_ID;
      if (USER_ID) whereClause.USER_ID = USER_ID;
      if (BU_ID) whereClause.BU_ID = BU_ID;
      if (WAIT_ST) whereClause.WAIT_ST = WAIT_ST;

      const { count, rows: workItems } = await WFWorkItem.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        order: [['CREATE_DT', 'DESC']]
      });

      if (!workItems || workItems.length === 0) {
        return res.status(200).json({ 
          success: true,
          message: 'No work items found matching the criteria',
          data: []
        });
      }

      const decodedWorkItems = workItems.map(item => {
        try {
          const decodedValue = Buffer.from(item.ITEM_VALUE, 'base64').toString('ascii');
          return {
            ...item.toJSON(),
            ITEM_VALUE: decodedValue,
            status: item.REC_ST === 'achieved' ? 'achieved' : 
                   item.REC_ST === 'completed' ? 
                   (item.WAIT_ST === 'APPROVED' ? 'approved' : 'rejected') : 
                   'pending'
          };
        } catch {
          return {
            ...item.toJSON(),
            status: item.REC_ST === 'achieved' ? 'achieved' : 
                   item.REC_ST === 'completed' ? 
                   (item.WAIT_ST === 'APPROVED' ? 'approved' : 'rejected') : 
                   'pending'
          };
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Work items fetched successfully',
        data: decodedWorkItems,
        pagination: {
          total: count,
          pages: Math.ceil(count / parseInt(limit)),
          currentPage: parseInt(page),
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching work items:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Error fetching work items', 
        error: error.message 
      });
    }
  }),

  /**
   * Get work items by user role
   */
  getWorkItemsByUserRole: asyncHandler(async (req, res) => {
    try {
      const { userRole } = req.params;
      const { page = 1, limit = 10, status = 'PENDING' } = req.query;

      const whereClause = { 
        TARGET_USER_ROLE_ID: userRole,
        status 
      };

      const { count, rows: workItems } = await WFWorkItem.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        order: [['priority', 'DESC'], ['DEADLINE_TM', 'ASC']]
      });

      res.status(200).json({
        success: true,
        message: 'Work items fetched successfully',
        data: workItems,
        pagination: {
          total: count,
          pages: Math.ceil(count / parseInt(limit)),
          currentPage: parseInt(page),
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching work items by user role:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error fetching work items', 
        error: error.message 
      });
    }
  }),

  /**
   * Update work item status
   */
  updateWorkItemStatus: asyncHandler(async (req, res) => {
    const t = await sequelize.transaction();
    
    try {
      const { workItemId } = req.params;
      const { status, comments, updatedBy } = req.body;

      const workItem = await WFWorkItem.findByPk(workItemId, { transaction: t });
      
      if (!workItem) {
        await t.rollback();
        return res.status(404).json({ 
          success: false,
          message: 'Work item not found.' 
        });
      }

      const updateData = {
        status,
        lastUpdatedBy: updatedBy || req.user?.id || 'system',
        updatedAt: new Date()
      };

      if (comments) {
        updateData.comments = workItem.comments ? 
          `${workItem.comments}\n${comments}` : comments;
      }

      if (status === 'APPROVED') {
        updateData.APPROVED_BY = updatedBy || req.user?.id || 'system';
        updateData.APPROVAL_DATE = new Date();
        updateData.COMPLETED_DT = new Date();
      } else if (status === 'REJECTED') {
        updateData.REJECTED_BY = updatedBy || req.user?.id || 'system';
        updateData.COMPLETED_DT = new Date();
      }

      await workItem.update(updateData, { transaction: t });
      await t.commit();

      await NotificationService.send({
        ROLE_ID: workItem.ORIGINATOR_USER_ROLE_ID,
        message: `Workflow item ${workItem.WORK_ITEM_ID} status updated to ${status}`,
        WORK_ITEM_ID: workItem.WORK_ITEM_ID,
        CUST_ID: workItem.CUST_ID,
        status
      });

      res.status(200).json({
        success: true,
        message: 'Work item status updated successfully.',
        data: workItem
      });
    } catch (error) {
      await t.rollback();
      console.error('Error updating work item status:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error updating work item status', 
        error: error.message 
      });
    }
  }),

  /**
   * Get work item statistics
   */
  getWorkItemStats: asyncHandler(async (req, res) => {
    try {
      const stats = await WFWorkItem.countByStatus();
      
      // Get overdue count
      const now = new Date();
      const overdueCount = await WFWorkItem.count({
        where: {
          DEADLINE_TM: { [Op.lt]: now },
          status: 'PENDING'
        }
      });

      // Get high priority count
      const highPriorityCount = await WFWorkItem.count({
        where: {
          priority: { [Op.in]: ['HIGH', 'CRITICAL'] },
          status: 'PENDING'
        }
      });

      res.status(200).json({
        success: true,
        message: 'Work item statistics fetched successfully',
        data: {
          statusStats: stats,
          overdueCount,
          highPriorityCount,
          total: Object.values(stats).reduce((a, b) => a + b, 0)
        }
      });
    } catch (error) {
      console.error('Error fetching work item stats:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error fetching work item statistics', 
        error: error.message 
      });
    }
  })
};

export default WFWorkItemController;