// src/controllers/CollateralController.js
import Collateral from '../models/Collateral.js';
import Branch from '../models/Branch.js';
import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import { getWF_WORK_ITEM } from '../models/index.js';
import { addAuditTrail } from './AudiTrailController.js';

// ✅ Define approval officer roles
const APPROVAL_OFFICER_ROLES = [
  'Branch Manager',
  'Branch Operation Supervisor',
  'Head of Credit',
  'Internal Control Manager',
  'Internal Control Officer',
  'Chief Operation Officer',
  'Chief Financial Officer',
  'Chief Executive Officer',
  'Internal Audit Manager',
  'Senior Financial Accountant',
  'Financial Accountant Manager',
  'Loan Processing Supervisor'
];

// ✅ Define admin/superuser roles
const ADMIN_ROLES = [
  'Administrator',
  'SuperAdmin',
  'SystemAdmin'
];

/**
 * Check if user is an approval officer
 */
const isApprovalOfficer = (user) => {
  const userRole = user?.role || user?.primary_business_role || user?.ROLE_NM;
  if (!userRole) return false;
  
  if (ADMIN_ROLES.some(role => userRole.includes(role) || userRole === role)) {
    return true;
  }
  
  return APPROVAL_OFFICER_ROLES.some(role => 
    userRole.includes(role) || userRole === role
  );
};

/**
 * Check if user has admin privileges
 */
const isAdmin = (user) => {
  const userRole = user?.role || user?.primary_business_role || user?.ROLE_NM;
  if (!userRole) return false;
  return ADMIN_ROLES.some(role => userRole.includes(role) || userRole === role);
};

/**
 * Generate collateral ID
 */
const generateCollateralId = async () => {
  const lastCollateral = await Collateral.findOne({
    order: [['COLLATERAL_ID', 'DESC']],
    attributes: ['COLLATERAL_ID']
  });
  return (lastCollateral?.COLLATERAL_ID || 0) + 1;
};

/**
 * Generate collateral reference number
 */
const generateCollateralRefNo = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `COL-${year}${month}${day}-${random}`;
};

/**
 * Generate workflow identifiers
 */
const generateWorkflowIdentifiers = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return {
    WORK_ITEM_ID: `WI-${timestamp}-${random}`,
    QUEUE_ID: `Q-${timestamp}-${random}`,
    SUB_PROC_ID: `SP-${timestamp}-${random}`,
    BUS_PROC_ID: `BP-${timestamp}-${random}`,
    EVENT_ID: `EVT-${timestamp}-${random}`
  };
};

/**
 * Create workflow item for approval
 */
const createWorkflowItem = async (params, transaction) => {
  const WF_WORK_ITEM = getWF_WORK_ITEM();
  if (!WF_WORK_ITEM) {
    logger.warn('WF_WORK_ITEM model not available, skipping workflow creation');
    return null;
  }

  const {
    collateralId,
    collateralRefNo,
    custId,
    buId,
    createdBy,
    collateralData
  } = params;

  const identifiers = generateWorkflowIdentifiers();

  const workflowItem = await WF_WORK_ITEM.create({
    WORK_ITEM_ID: identifiers.WORK_ITEM_ID,
    ITEM_VALUE: collateralId,
    ITEM_DESC: `Collateral Registration - ${collateralRefNo}`,
    ITEM_CLASS_NM: 'Collateral',
    ITEM_TYPE: 'COLLATERAL',
    EVENT_ID: identifiers.EVENT_ID,
    CUST_ID: custId,
    REC_ST: 'Pending',
    VERSION: 1,
    USER_ID: createdBy,
    BU_ID: buId,
    CREATE_DT: new Date(),
    WAIT_ST: 'Pending',
    ITEM_ID: collateralId,
    ITEM_REF_NO: collateralRefNo,
    ORIGINATOR_USER_ROLE_ID: 'Originator',
    QUEUE_ID: identifiers.QUEUE_ID,
    SUB_PROC_ID: identifiers.SUB_PROC_ID,
    BUS_PROC_ID: identifiers.BUS_PROC_ID,
    TARGET_USER_ROLE_ID: 'BranchApprover',
    ITEM_BU_ID: buId,
    ITEM_DATA: JSON.stringify({
      collateral: collateralData,
      requestType: 'COLLATERAL_CREATION'
    })
  }, { transaction });

  logger.info(`✅ Workflow item created for collateral ${collateralRefNo}: ${identifiers.WORK_ITEM_ID}`);
  return workflowItem;
};

/**
 * Get branch details by BU_ID
 */
const getBranchDetails = async (buId) => {
  try {
    if (!buId) return null;
    
    let branch = await Branch.findOne({
      where: { 
        [Op.or]: [
          { BU_ID: buId },
          { businessUnitId: buId },
          { id: buId },
          { branchCode: buId }
        ]
      }
    });
    
    if (!branch) {
      branch = await Branch.findOne({
        where: { branchCode: String(buId) }
      });
    }
    
    if (!branch) {
      branch = await Branch.findOne({
        where: { legacyId: String(buId) }
      });
    }
    
    return branch;
  } catch (error) {
    logger.error('Error fetching branch details:', error);
    return null;
  }
};

/**
 * Log audit trail for collateral actions
 */
const logCollateralAudit = async ({
  eventType,
  action,
  userId,
  userRole,
  collateralId,
  oldValue = null,
  newValue = null,
  ipAddress = '127.0.0.1',
  entityType = 'COLLATERAL',
  status = 'SUCCESS',
  description = null,
  branch = 1,
  transaction = null
}) => {
  try {
    await addAuditTrail({
      EVENT_TYPE: eventType,
      ACTION: action,
      USER_ID: userId || 'SYSTEM',
      USER_ROLE: userRole || 'SYSTEM',
      OLD_VALUE: oldValue,
      NEW_VALUE: newValue,
      IP_ADDRESS: ipAddress,
      ENTITY_ID: collateralId,
      ENTITY_TYPE: entityType,
      STATUS: status,
      DESCRIPTION: description,
      BRANCH: branch,
      ADDITIONAL_INFO: {
        timestamp: new Date().toISOString(),
        source: 'CollateralController'
      }
    }, transaction);
  } catch (error) {
    console.error('❌ Failed to log audit:', error.message);
  }
};

// ==========================================
// CREATE - Create new collateral
// ==========================================
export const createCollateral = async (req, res) => {
  const transaction = await Collateral.sequelize.transaction();
  
  try {
    const {
      CUST_ID,
      COLLATERAL_TY_ID,
      COLLATERAL_TYPE_DESC,
      COLLATERAL_DESC,
      COLLATERAL_CRNCY_ID,
      COLLATERAL_COST,
      COLLATERAL_MARKET_VALUE,
      LENDING_PCT,
      COLLATERAL_EXPIRY_DT,
      COLLATERAL_LOCATION,
      LOAN_ACCOUNT_NO,
      ADDR_ID,
      BU_ID,
      ...rest
    } = req.body;

    if (!CUST_ID || !COLLATERAL_TY_ID || !COLLATERAL_DESC || !COLLATERAL_CRNCY_ID || !BU_ID) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: CUST_ID, COLLATERAL_TY_ID, COLLATERAL_DESC, COLLATERAL_CRNCY_ID, BU_ID'
      });
    }

    const branch = await getBranchDetails(BU_ID);
    if (!branch) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Branch with BU_ID ${BU_ID} not found`
      });
    }

    const collateralId = await generateCollateralId();
    const collateralRefNo = generateCollateralRefNo();
    const userId = req.user?.id || req.user?.user_id || req.user?.userId || req.user?.user_name || 'SYSTEM';
    const userRole = req.user?.role || req.user?.primary_business_role || 'SYSTEM';
    const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    const collateral = await Collateral.create({
      COLLATERAL_ID: collateralId,
      CUST_ID,
      COLLATERAL_TY_ID,
      COLLATERAL_TYPE_DESC: COLLATERAL_TYPE_DESC || null,
      COLLATERAL_REF_NO: collateralRefNo,
      COLLATERAL_DESC,
      COLLATERAL_CRNCY_ID,
      COLLATERAL_COST: COLLATERAL_COST || null,
      COLLATERAL_MARKET_VALUE: COLLATERAL_MARKET_VALUE || null,
      LENDING_PCT: LENDING_PCT || null,
      COLLATERAL_EXPIRY_DT: COLLATERAL_EXPIRY_DT || null,
      COLLATERAL_LOCATION: COLLATERAL_LOCATION || null,
      LOAN_ACCOUNT_NO: LOAN_ACCOUNT_NO || null,
      ADDR_ID: ADDR_ID || null,
      COLLATERAL_STATUS: 'Pending',
      REC_ST: 'P',
      BU_ID: BU_ID,
      BRANCH_NAME: branch.branchName || null,
      BRANCH_CODE: branch.branchCode || null,
      USER_ID: userId,
      CREATE_DT: new Date(),
      CREATED_BY: userId,
      ...rest
    }, { transaction });

    const workflowItem = await createWorkflowItem({
      collateralId: collateral.id,
      collateralRefNo,
      custId: CUST_ID,
      buId: BU_ID,
      createdBy: userId,
      collateralData: collateral.toJSON()
    }, transaction);

    // ✅ Log audit trail
    await logCollateralAudit({
      eventType: 'CREATE',
      action: 'create_collateral',
      userId: userId,
      userRole: userRole,
      collateralId: collateral.id,
      newValue: collateral.toJSON(),
      ipAddress: ipAddress,
      branch: BU_ID,
      description: `Collateral created: ${collateralRefNo} for customer ${CUST_ID}`,
      transaction
    });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Collateral created and submitted for approval',
      data: {
        collateral: collateral.getSummary(),
        branch: {
          branchName: branch.branchName,
          branchCode: branch.branchCode,
          BU_ID: branch.BU_ID || branch.id
        },
        workflow: workflowItem ? {
          workItemId: workflowItem.WORK_ITEM_ID,
          status: 'Pending Approval',
          queueId: workflowItem.QUEUE_ID
        } : null
      }
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error creating collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating collateral',
      error: error.message
    });
  }
};

// ==========================================
// GET ALL - Get all collateral
// ==========================================
export const getAllCollateral = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      custId,
      loanAccountNo,
      status,
      searchTerm,
      approvalStatus
    } = req.query;

    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;

    const whereClause = {};

    if (!isAdmin(req.user)) {
      whereClause.BU_ID = userBuId;
    }

    if (approvalStatus) {
      whereClause.REC_ST = approvalStatus;
    } else {
      whereClause.REC_ST = { [Op.in]: ['A', 'P'] };
    }

    if (custId) whereClause.CUST_ID = custId;
    if (loanAccountNo) whereClause.LOAN_ACCOUNT_NO = loanAccountNo;
    if (status) whereClause.COLLATERAL_STATUS = status;
    
    if (searchTerm) {
      whereClause[Op.or] = [
        { COLLATERAL_DESC: { [Op.like]: `%${searchTerm}%` } },
        { COLLATERAL_REF_NO: { [Op.like]: `%${searchTerm}%` } },
        { COLLATERAL_TYPE_DESC: { [Op.like]: `%${searchTerm}%` } }
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Collateral.findAndCountAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });

    return res.status(200).json({
      success: true,
      data: rows.map(row => ({
        ...row.getSummary(),
        branch: {
          branchName: row.BRANCH_NAME || null,
          branchCode: row.BRANCH_CODE || null,
          BU_ID: row.BU_ID || null
        }
      })),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    logger.error('Error fetching collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching collateral',
      error: error.message
    });
  }
};

// ==========================================
// GET BY ID - Get collateral by ID
// ==========================================
export const getCollateralById = async (req, res) => {
  try {
    const { id } = req.params;
    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;

    const collateral = await Collateral.findOne({
      where: { 
        [Op.or]: [
          { id: id },
          { COLLATERAL_ID: id }
        ]
      }
    });

    if (!collateral) {
      return res.status(404).json({
        success: false,
        message: 'Collateral not found'
      });
    }

    if (collateral.BU_ID !== userBuId && !isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This collateral belongs to a different branch.'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...collateral.getSummary(),
        branch: {
          branchName: collateral.BRANCH_NAME || null,
          branchCode: collateral.BRANCH_CODE || null,
          BU_ID: collateral.BU_ID || null
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching collateral',
      error: error.message
    });
  }
};

// ==========================================
// GET PENDING APPROVALS BY BRANCH
// ==========================================
export const getPendingApprovalsByBranch = async (req, res) => {
  try {
    const { buId } = req.params;
    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;

    if (buId !== userBuId && !isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: `You are not authorized to view pending approvals for branch ${buId}.`
      });
    }

    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereClause = {
      BU_ID: buId,
      REC_ST: 'P',
      COLLATERAL_STATUS: 'Pending'
    };

    const { count, rows } = await Collateral.findAndCountAll({
      where: whereClause,
      order: [['created_at', 'ASC']],
      limit: parseInt(limit),
      offset: offset
    });

    return res.status(200).json({
      success: true,
      data: rows.map(row => ({
        ...row.getSummary(),
        branch: {
          branchName: row.BRANCH_NAME,
          branchCode: row.BRANCH_CODE,
          BU_ID: row.BU_ID
        }
      })),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    logger.error('Error fetching pending approvals:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching pending approvals',
      error: error.message
    });
  }
};

// ==========================================
// APPROVE BRANCH COLLATERAL
// ==========================================
export const approveBranchCollateral = async (req, res) => {
  const transaction = await Collateral.sequelize.transaction();
  
  try {
    const { buId } = req.params;
    const { notes } = req.body;

    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;
    const userId = req.user?.id || req.user?.user_id || req.user?.userId || req.user?.user_name || 'SYSTEM';
    const userRole = req.user?.role || req.user?.primary_business_role;
    const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    if (!isApprovalOfficer(req.user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only approval officers can approve collateral.'
      });
    }

    if (buId !== userBuId && !isAdmin(req.user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: `You are not authorized to approve collateral for branch ${buId}.`
      });
    }

    const collaterals = await Collateral.findAll({
      where: { 
        BU_ID: buId,
        REC_ST: 'P',
        COLLATERAL_STATUS: 'Pending'
      }
    });

    if (collaterals.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No pending collateral found for this branch'
      });
    }

    const branch = await getBranchDetails(buId);
    const approvedCollaterals = [];
    const sequelize = Collateral.sequelize;

    for (const collateral of collaterals) {
      const oldValue = collateral.toJSON();
      
      await collateral.update({
        REC_ST: 'A',
        COLLATERAL_STATUS: 'Active',
        APPROVED_BY: userId,
        APPROVED_BY_ROLE: userRole,
        APPROVED_DT: new Date(),
        APPROVAL_NOTES: notes || null,
        BRANCH_NAME: branch?.branchName || collateral.BRANCH_NAME,
        BRANCH_CODE: branch?.branchCode || collateral.BRANCH_CODE,
        updated_at: new Date()
      }, { transaction });

      // ✅ Log audit trail for approval
      await logCollateralAudit({
        eventType: 'APPROVE',
        action: 'approve_collateral',
        userId: userId,
        userRole: userRole,
        collateralId: collateral.id,
        oldValue: oldValue,
        newValue: collateral.toJSON(),
        ipAddress: ipAddress,
        branch: buId,
        description: `Collateral ${collateral.COLLATERAL_REF_NO} approved by ${userId}`,
        transaction
      });

      // Update workflow using raw SQL
      try {
        await sequelize.query(
          `UPDATE wf_work_items 
           SET REC_ST = ?, 
               WAIT_ST = ?, 
               APPROVED_BY = ?, 
               APPROVED_BY_ROLE = ?, 
               APPROVED_DT = ?, 
               APPROVAL_NOTES = ? 
           WHERE ITEM_ID = ? AND ITEM_TYPE = ?`,
          {
            replacements: [
              'Approved',
              'Completed',
              userId,
              userRole,
              new Date(),
              notes || null,
              collateral.id,
              'COLLATERAL'
            ],
            transaction
          }
        );
        console.log(`✅ Workflow updated for collateral ${collateral.COLLATERAL_REF_NO}`);
      } catch (workflowError) {
        console.warn('⚠️ Could not update workflow:', workflowError.message);
      }

      approvedCollaterals.push(collateral);
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `✅ ${approvedCollaterals.length} collateral(s) approved successfully for branch ${buId}`,
      data: {
        branch: branch ? {
          branchName: branch.branchName,
          branchCode: branch.branchCode,
          BU_ID: branch.BU_ID || branch.id
        } : {
          branchName: collaterals[0]?.BRANCH_NAME,
          branchCode: collaterals[0]?.BRANCH_CODE,
          BU_ID: buId
        },
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
        approvedCount: approvedCollaterals.length,
        collaterals: approvedCollaterals.map(c => c.getSummary())
      }
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error approving branch collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error approving collateral',
      error: error.message
    });
  }
};

// ==========================================
// REJECT BRANCH COLLATERAL
// ==========================================
export const rejectBranchCollateral = async (req, res) => {
  const transaction = await Collateral.sequelize.transaction();
  
  try {
    const { buId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;
    const userId = req.user?.id || req.user?.user_id || req.user?.userId || req.user?.user_name || 'SYSTEM';
    const userRole = req.user?.role || req.user?.primary_business_role;
    const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    if (!isApprovalOfficer(req.user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only approval officers can reject collateral.'
      });
    }

    if (buId !== userBuId && !isAdmin(req.user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: `You are not authorized to reject collateral for branch ${buId}.`
      });
    }

    const collaterals = await Collateral.findAll({
      where: { 
        BU_ID: buId,
        REC_ST: 'P',
        COLLATERAL_STATUS: 'Pending'
      }
    });

    if (collaterals.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No pending collateral found for this branch'
      });
    }

    const rejectedCollaterals = [];
    const sequelize = Collateral.sequelize;

    for (const collateral of collaterals) {
      const oldValue = collateral.toJSON();
      
      await collateral.update({
        REC_ST: 'R',
        COLLATERAL_STATUS: 'Rejected',
        REJECTED_BY: userId,
        REJECTED_BY_ROLE: userRole,
        REJECTED_DT: new Date(),
        REJECTION_REASON: reason,
        updated_at: new Date()
      }, { transaction });

      // ✅ Log audit trail for rejection
      await logCollateralAudit({
        eventType: 'REJECT',
        action: 'reject_collateral',
        userId: userId,
        userRole: userRole,
        collateralId: collateral.id,
        oldValue: oldValue,
        newValue: collateral.toJSON(),
        ipAddress: ipAddress,
        branch: buId,
        description: `Collateral ${collateral.COLLATERAL_REF_NO} rejected by ${userId}. Reason: ${reason}`,
        transaction
      });

      // Update workflow using raw SQL
      try {
        await sequelize.query(
          `UPDATE wf_work_items 
           SET REC_ST = ?, 
               WAIT_ST = ?, 
               REJECTED_BY = ?, 
               REJECTED_BY_ROLE = ?, 
               REJECTED_DT = ?, 
               REJECTION_REASON = ? 
           WHERE ITEM_ID = ? AND ITEM_TYPE = ?`,
          {
            replacements: [
              'Rejected',
              'Completed',
              userId,
              userRole,
              new Date(),
              reason,
              collateral.id,
              'COLLATERAL'
            ],
            transaction
          }
        );
        console.log(`✅ Workflow updated for collateral ${collateral.COLLATERAL_REF_NO}`);
      } catch (workflowError) {
        console.warn('⚠️ Could not update workflow:', workflowError.message);
      }

      rejectedCollaterals.push(collateral);
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `❌ ${rejectedCollaterals.length} collateral(s) rejected for branch ${buId}`,
      data: {
        branch: {
          branchName: collaterals[0]?.BRANCH_NAME,
          branchCode: collaterals[0]?.BRANCH_CODE,
          BU_ID: buId
        },
        rejectedBy: userId,
        rejectedAt: new Date().toISOString(),
        reason: reason,
        rejectedCount: rejectedCollaterals.length,
        collaterals: rejectedCollaterals.map(c => c.getSummary())
      }
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error rejecting branch collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error rejecting collateral',
      error: error.message
    });
  }
};

// ==========================================
// APPROVE INDIVIDUAL COLLATERAL
// ==========================================
export const approveCollateral = async (req, res) => {
  const transaction = await Collateral.sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;
    const userId = req.user?.id || req.user?.user_id || req.user?.userId || req.user?.user_name || 'SYSTEM';
    const userRole = req.user?.role || req.user?.primary_business_role;
    const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    if (!isApprovalOfficer(req.user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only approval officers can approve collateral.'
      });
    }

    const collateral = await Collateral.findOne({
      where: { 
        [Op.or]: [
          { id: id },
          { COLLATERAL_ID: id }
        ],
        REC_ST: 'P',
        COLLATERAL_STATUS: 'Pending'
      }
    });

    if (!collateral) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Collateral not found or already processed'
      });
    }

    if (collateral.BU_ID !== userBuId && !isAdmin(req.user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: `You are not authorized to approve this collateral.`
      });
    }

    const branch = await getBranchDetails(collateral.BU_ID);
    const sequelize = Collateral.sequelize;
    const oldValue = collateral.toJSON();

    await collateral.update({
      REC_ST: 'A',
      COLLATERAL_STATUS: 'Active',
      APPROVED_BY: userId,
      APPROVED_BY_ROLE: userRole,
      APPROVED_DT: new Date(),
      APPROVAL_NOTES: notes || null,
      BRANCH_NAME: branch?.branchName || collateral.BRANCH_NAME,
      BRANCH_CODE: branch?.branchCode || collateral.BRANCH_CODE,
      updated_at: new Date()
    }, { transaction });

    // ✅ Log audit trail
    await logCollateralAudit({
      eventType: 'APPROVE',
      action: 'approve_collateral',
      userId: userId,
      userRole: userRole,
      collateralId: collateral.id,
      oldValue: oldValue,
      newValue: collateral.toJSON(),
      ipAddress: ipAddress,
      branch: collateral.BU_ID,
      description: `Collateral ${collateral.COLLATERAL_REF_NO} approved by ${userId}`,
      transaction
    });

    // Update workflow using raw SQL
    try {
      await sequelize.query(
        `UPDATE wf_work_items 
         SET REC_ST = ?, 
             WAIT_ST = ?, 
             APPROVED_BY = ?, 
             APPROVED_BY_ROLE = ?, 
             APPROVED_DT = ?, 
             APPROVAL_NOTES = ? 
         WHERE ITEM_ID = ? AND ITEM_TYPE = ?`,
        {
          replacements: [
            'Approved',
            'Completed',
            userId,
            userRole,
            new Date(),
            notes || null,
            collateral.id,
            'COLLATERAL'
          ],
          transaction
        }
      );
    } catch (workflowError) {
      console.warn('⚠️ Could not update workflow:', workflowError.message);
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Collateral approved successfully',
      data: {
        ...collateral.getSummary(),
        branch: branch ? {
          branchName: branch.branchName,
          branchCode: branch.branchCode,
          BU_ID: branch.BU_ID || branch.id
        } : {
          branchName: collateral.BRANCH_NAME,
          branchCode: collateral.BRANCH_CODE,
          BU_ID: collateral.BU_ID
        }
      }
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error approving collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error approving collateral',
      error: error.message
    });
  }
};

// ==========================================
// REJECT INDIVIDUAL COLLATERAL
// ==========================================
export const rejectCollateral = async (req, res) => {
  const transaction = await Collateral.sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;
    const userId = req.user?.id || req.user?.user_id || req.user?.userId || req.user?.user_name || 'SYSTEM';
    const userRole = req.user?.role || req.user?.primary_business_role;
    const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    if (!isApprovalOfficer(req.user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only approval officers can reject collateral.'
      });
    }

    const collateral = await Collateral.findOne({
      where: { 
        [Op.or]: [
          { id: id },
          { COLLATERAL_ID: id }
        ],
        REC_ST: 'P',
        COLLATERAL_STATUS: 'Pending'
      }
    });

    if (!collateral) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Collateral not found or already processed'
      });
    }

    if (collateral.BU_ID !== userBuId && !isAdmin(req.user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: `You are not authorized to reject this collateral.`
      });
    }

    const sequelize = Collateral.sequelize;
    const oldValue = collateral.toJSON();

    await collateral.update({
      REC_ST: 'R',
      COLLATERAL_STATUS: 'Rejected',
      REJECTED_BY: userId,
      REJECTED_BY_ROLE: userRole,
      REJECTED_DT: new Date(),
      REJECTION_REASON: reason,
      updated_at: new Date()
    }, { transaction });

    // ✅ Log audit trail
    await logCollateralAudit({
      eventType: 'REJECT',
      action: 'reject_collateral',
      userId: userId,
      userRole: userRole,
      collateralId: collateral.id,
      oldValue: oldValue,
      newValue: collateral.toJSON(),
      ipAddress: ipAddress,
      branch: collateral.BU_ID,
      description: `Collateral ${collateral.COLLATERAL_REF_NO} rejected by ${userId}. Reason: ${reason}`,
      transaction
    });

    // Update workflow using raw SQL
    try {
      await sequelize.query(
        `UPDATE wf_work_items 
         SET REC_ST = ?, 
             WAIT_ST = ?, 
             REJECTED_BY = ?, 
             REJECTED_BY_ROLE = ?, 
             REJECTED_DT = ?, 
             REJECTION_REASON = ? 
         WHERE ITEM_ID = ? AND ITEM_TYPE = ?`,
        {
          replacements: [
            'Rejected',
            'Completed',
            userId,
            userRole,
            new Date(),
            reason,
            collateral.id,
            'COLLATERAL'
          ],
          transaction
        }
      );
    } catch (workflowError) {
      console.warn('⚠️ Could not update workflow:', workflowError.message);
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Collateral rejected successfully',
      data: {
        id: collateral.id,
        collateralRefNo: collateral.COLLATERAL_REF_NO,
        status: 'Rejected',
        reason: reason,
        rejectedBy: userId,
        rejectedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error rejecting collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error rejecting collateral',
      error: error.message
    });
  }
};

// ==========================================
// UPDATE - Update all collateral for a branch by BU_ID
// ==========================================
export const updateCollateralByBranch = async (req, res) => {
  const transaction = await Collateral.sequelize.transaction();
  
  try {
    const { buId } = req.params; // ✅ Changed from 'id' to 'buId'
    const updates = req.body;
    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;
    const userId = req.user?.id || req.user?.user_id || req.user?.userId || req.user?.user_name || 'SYSTEM';
    const userRole = req.user?.role || req.user?.primary_business_role;
    const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    // ✅ Verify the user is authorized to update this branch
    if (buId !== userBuId && !isAdmin(req.user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: `You are not authorized to update collateral for branch ${buId}.`
      });
    }

    // ✅ Find all collateral for this branch
    const collaterals = await Collateral.findAll({
      where: { 
        BU_ID: buId,
        REC_ST: { [Op.in]: ['A', 'P'] } // Only update active or pending collateral
      }
    });

    if (collaterals.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No collateral found for this branch'
      });
    }

    console.log(`✏️ Updating ${collaterals.length} collateral(s) for branch ${buId}`);

    const allowedUpdates = [
      'COLLATERAL_TYPE_DESC',
      'COLLATERAL_DESC',
      'COLLATERAL_COST',
      'COLLATERAL_MARKET_VALUE',
      'LENDING_PCT',
      'COLLATERAL_EXPIRY_DT',
      'COLLATERAL_LOCATION',
      'LOAN_ACCOUNT_NO',
      'ADDR_ID',
      'COLLATERAL_STATUS'
    ];

    const updateData = {};
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    // If no fields to update
    if (Object.keys(updateData).length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    const updatedCollaterals = [];
    const sequelize = Collateral.sequelize;

    for (const collateral of collaterals) {
      // Check if collateral is rejected
      if (collateral.REC_ST === 'R') {
        console.log(`⚠️ Skipping rejected collateral: ${collateral.COLLATERAL_REF_NO}`);
        continue;
      }

      const oldValue = collateral.toJSON();

      // Add system fields
      updateData.ROW_TS = new Date();
      updateData.updated_at = new Date();

      await collateral.update(updateData, { transaction });

      // ✅ Log audit trail
      await logCollateralAudit({
        eventType: 'UPDATE',
        action: 'update_collateral_branch',
        userId: userId,
        userRole: userRole,
        collateralId: collateral.id,
        oldValue: oldValue,
        newValue: collateral.toJSON(),
        ipAddress: ipAddress,
        branch: buId,
        description: `Collateral ${collateral.COLLATERAL_REF_NO} updated by ${userId} (Branch: ${buId})`,
        transaction
      });

      updatedCollaterals.push(collateral);
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `✅ ${updatedCollaterals.length} collateral(s) updated successfully for branch ${buId}`,
      data: {
        branch: {
          BU_ID: buId,
          branchName: collaterals[0]?.BRANCH_NAME || null,
          branchCode: collaterals[0]?.BRANCH_CODE || null
        },
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
        updatedCount: updatedCollaterals.length,
        collaterals: updatedCollaterals.map(c => c.getSummary())
      }
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating branch collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating collateral',
      error: error.message
    });
  }
};

// ==========================================
// UPDATE INDIVIDUAL - Update single collateral by ID
// ==========================================
export const updateCollateralById = async (req, res) => {
  const transaction = await Collateral.sequelize.transaction();
  
  try {
    const { id } = req.params;
    const updates = req.body;
    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;
    const userId = req.user?.id || req.user?.user_id || req.user?.userId || req.user?.user_name || 'SYSTEM';
    const userRole = req.user?.role || req.user?.primary_business_role;
    const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    const collateral = await Collateral.findOne({
      where: { 
        [Op.or]: [
          { id: id },
          { COLLATERAL_ID: id }
        ]
      }
    });

    if (!collateral) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Collateral not found'
      });
    }

    if (collateral.BU_ID !== userBuId && !isAdmin(req.user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Access denied. This collateral belongs to a different branch.'
      });
    }

    if (collateral.REC_ST === 'R') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot update rejected collateral. Please create a new request.'
      });
    }

    const allowedUpdates = [
      'COLLATERAL_TYPE_DESC',
      'COLLATERAL_DESC',
      'COLLATERAL_COST',
      'COLLATERAL_MARKET_VALUE',
      'LENDING_PCT',
      'COLLATERAL_EXPIRY_DT',
      'COLLATERAL_LOCATION',
      'LOAN_ACCOUNT_NO',
      'ADDR_ID',
      'COLLATERAL_STATUS'
    ];

    const oldValue = collateral.toJSON();
    const updateData = {};
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    // If no fields to update
    if (Object.keys(updateData).length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    updateData.ROW_TS = new Date();
    updateData.updated_at = new Date();

    await collateral.update(updateData, { transaction });

    // ✅ Log audit trail
    await logCollateralAudit({
      eventType: 'UPDATE',
      action: 'update_collateral',
      userId: userId,
      userRole: userRole,
      collateralId: collateral.id,
      oldValue: oldValue,
      newValue: collateral.toJSON(),
      ipAddress: ipAddress,
      branch: collateral.BU_ID,
      description: `Collateral ${collateral.COLLATERAL_REF_NO} updated by ${userId}`,
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Collateral updated successfully',
      data: collateral.getSummary()
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating collateral',
      error: error.message
    });
  }
};

// ==========================================
// DELETE INDIVIDUAL - Delete single collateral by ID
// ==========================================
export const deleteCollateralById = async (req, res) => {
  const transaction = await Collateral.sequelize.transaction();
  
  try {
    const { id } = req.params;
    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;
    const userId = req.user?.id || req.user?.user_name || 'SYSTEM';
    const userRole = req.user?.role || req.user?.primary_business_role;
    const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    const collateral = await Collateral.findOne({
      where: { 
        [Op.or]: [
          { id: id },
          { COLLATERAL_ID: id }
        ],
        REC_ST: { [Op.in]: ['A', 'P'] }
      }
    });

    if (!collateral) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Collateral not found or already deleted'
      });
    }

    if (collateral.BU_ID !== userBuId && !isAdmin(req.user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Access denied. This collateral belongs to a different branch.'
      });
    }

    const oldValue = collateral.toJSON();

    await collateral.update({
      REC_ST: 'I',
      COLLATERAL_STATUS: 'Inactive',
      DELETED_BY: userId,
      DELETED_DT: new Date(),
      updated_at: new Date()
    }, { transaction });

    // ✅ Log audit trail
    await logCollateralAudit({
      eventType: 'DELETE',
      action: 'delete_collateral',
      userId: userId,
      userRole: userRole,
      collateralId: collateral.id,
      oldValue: oldValue,
      newValue: null,
      ipAddress: ipAddress,
      branch: collateral.BU_ID,
      description: `Collateral ${collateral.COLLATERAL_REF_NO} deleted by ${userId}`,
      transaction
    });

    const WF_WORK_ITEM = getWF_WORK_ITEM();
    if (WF_WORK_ITEM) {
      const sequelize = Collateral.sequelize;
      try {
        await sequelize.query(
          `UPDATE wf_work_items 
           SET REC_ST = 'Deleted', 
               WAIT_ST = 'Completed', 
               DELETED_BY = ?, 
               DELETED_DT = ? 
           WHERE ITEM_ID = ? AND ITEM_TYPE = ?`,
          {
            replacements: [
              userId,
              new Date(),
              collateral.id,
              'COLLATERAL'
            ],
            transaction
          }
        );
      } catch (workflowError) {
        console.warn('⚠️ Could not update workflow:', workflowError.message);
      }
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Collateral deleted successfully',
      data: {
        ...collateral.getSummary(),
        deletedBy: userId,
        deletedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting collateral',
      error: error.message
    });
  }
};

// ==========================================
// DELETE - Delete collateral (soft delete) by BU_ID
// ==========================================
export const deleteCollateralbybranch = async (req, res) => {
  const transaction = await Collateral.sequelize.transaction();
  
  try {
    const { buId } = req.params;
    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;
    const userId = req.user?.id || req.user?.user_name || 'SYSTEM';
    const userRole = req.user?.role || req.user?.primary_business_role;
    const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    if (buId !== userBuId && !isAdmin(req.user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: `You are not authorized to delete collateral for branch ${buId}.`
      });
    }

    const collaterals = await Collateral.findAll({
      where: { 
        BU_ID: buId,
        REC_ST: { [Op.in]: ['A', 'P'] }
      }
    });

    if (collaterals.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No collateral found for this branch'
      });
    }

    console.log(`🗑️ Deleting ${collaterals.length} collateral(s) for branch ${buId}`);

    const deletedCollaterals = [];
    const sequelize = Collateral.sequelize;

    for (const collateral of collaterals) {
      const oldValue = collateral.toJSON();
      
      await collateral.update({
        REC_ST: 'I',
        COLLATERAL_STATUS: 'Inactive',
        DELETED_BY: userId,
        DELETED_DT: new Date(),
        updated_at: new Date()
      }, { transaction });

      // ✅ Log audit trail
      await logCollateralAudit({
        eventType: 'DELETE',
        action: 'delete_collateral_branch',
        userId: userId,
        userRole: userRole,
        collateralId: collateral.id,
        oldValue: oldValue,
        newValue: null,
        ipAddress: ipAddress,
        branch: buId,
        description: `Collateral ${collateral.COLLATERAL_REF_NO} deleted by ${userId} (Branch: ${buId})`,
        transaction
      });

      // Update workflow if exists
      if (WF_WORK_ITEM) {
        try {
          await sequelize.query(
            `UPDATE wf_work_items 
             SET REC_ST = 'Deleted', 
                 WAIT_ST = 'Completed', 
                 DELETED_BY = ?, 
                 DELETED_DT = ? 
             WHERE ITEM_ID = ? AND ITEM_TYPE = ?`,
            {
              replacements: [
                userId,
                new Date(),
                collateral.id,
                'COLLATERAL'
              ],
              transaction
            }
          );
        } catch (workflowError) {
          console.warn('⚠️ Could not update workflow for collateral:', collateral.id, workflowError.message);
        }
      }

      deletedCollaterals.push(collateral);
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `✅ ${deletedCollaterals.length} collateral(s) deleted successfully for branch ${buId}`,
      data: {
        branch: {
          BU_ID: buId,
          branchName: collaterals[0]?.BRANCH_NAME || null,
          branchCode: collaterals[0]?.BRANCH_CODE || null
        },
        deletedBy: userId,
        deletedAt: new Date().toISOString(),
        deletedCount: deletedCollaterals.length,
        collaterals: deletedCollaterals.map(c => c.getSummary())
      }
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting collateral',
      error: error.message
    });
  }
};

// ==========================================
// GET BY BRANCH - Get collateral by branch BU_ID
// ==========================================
export const getCollateralByBranch = async (req, res) => {
  try {
    const { buId } = req.params;
    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;

    if (buId !== userBuId && !isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: `You are not authorized to view collateral for branch ${buId}.`
      });
    }

    const { 
      page = 1, 
      limit = 50, 
      status,
      searchTerm 
    } = req.query;

    const whereClause = { BU_ID: buId };

    if (status) {
      whereClause.COLLATERAL_STATUS = status;
    }
    
    if (searchTerm) {
      whereClause[Op.or] = [
        { COLLATERAL_DESC: { [Op.like]: `%${searchTerm}%` } },
        { COLLATERAL_REF_NO: { [Op.like]: `%${searchTerm}%` } },
        { COLLATERAL_TYPE_DESC: { [Op.like]: `%${searchTerm}%` } }
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Collateral.findAndCountAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });

    return res.status(200).json({
      success: true,
      data: rows.map(row => ({
        ...row.getSummary(),
        branch: {
          branchName: row.BRANCH_NAME,
          branchCode: row.BRANCH_CODE,
          BU_ID: row.BU_ID
        }
      })),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      },
      branch: {
        BU_ID: buId,
        branchName: rows[0]?.BRANCH_NAME || null,
        branchCode: rows[0]?.BRANCH_CODE || null
      }
    });

  } catch (error) {
    logger.error('Error fetching branch collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching branch collateral',
      error: error.message
    });
  }
};

// ==========================================
// GET NDIC SUMMARY - NDIC report summary
// ==========================================
export const getNDICCollateralSummary = async (req, res) => {
  try {
    const { loanAccountNo } = req.params;

    if (!loanAccountNo) {
      return res.status(400).json({
        success: false,
        message: 'Loan account number is required'
      });
    }

    console.log(`🔍 Fetching NDIC summary for loan: ${loanAccountNo}`);

    const collaterals = await Collateral.findAll({
      where: { 
        LOAN_ACCOUNT_NO: loanAccountNo
      }
    });

    console.log(`📊 Found ${collaterals.length} collateral(s) for loan ${loanAccountNo}`);

    if (collaterals.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          hasCollateral: false,
          collateralType: 'N/A',
          collateralValue: 0,
          collateralLocation: 'N/A',
          collateralStatus: 'N/A',
          secured: 'No',
          cashBacked: 'No',
          cashAmount: 0,
          branch: null,
          totalCollaterals: 0,
          activeCollaterals: 0,
          pendingCollaterals: 0,
          loanAccountNo: loanAccountNo,
          details: []
        }
      });
    }

    const activeCollaterals = collaterals.filter(c => c.REC_ST === 'A');
    const pendingCollaterals = collaterals.filter(c => c.REC_ST === 'P');
    const rejectedCollaterals = collaterals.filter(c => c.REC_ST === 'R');
    
    const totalValue = collaterals.reduce((sum, c) => sum + (parseFloat(c.COLLATERAL_MARKET_VALUE) || 0), 0);
    const activeValue = activeCollaterals.reduce((sum, c) => sum + (parseFloat(c.COLLATERAL_MARKET_VALUE) || 0), 0);
    const pendingValue = pendingCollaterals.reduce((sum, c) => sum + (parseFloat(c.COLLATERAL_MARKET_VALUE) || 0), 0);

    const primaryCollateral = activeCollaterals.length > 0 ? activeCollaterals[0] : 
                             pendingCollaterals.length > 0 ? pendingCollaterals[0] : 
                             collaterals[0];

    let status = 'No Active Collateral';
    if (activeCollaterals.length > 0) {
      status = 'Active';
    } else if (pendingCollaterals.length > 0) {
      status = 'Pending Approval';
    } else if (rejectedCollaterals.length > 0) {
      status = 'Rejected';
    }

    const ndicSummary = {
      hasCollateral: collaterals.length > 0,
      collateralType: primaryCollateral?.COLLATERAL_TYPE_DESC || 'Other',
      collateralValue: totalValue,
      activeCollateralValue: activeValue,
      pendingCollateralValue: pendingValue,
      collateralLocation: primaryCollateral?.COLLATERAL_LOCATION || 'N/A',
      collateralStatus: status,
      secured: activeCollaterals.length > 0 ? 'Yes' : 'No',
      cashBacked: primaryCollateral?.COLLATERAL_TY_ID === 1 ? 'Yes' : 'No',
      cashAmount: primaryCollateral?.COLLATERAL_TY_ID === 1 ? totalValue : 0,
      branch: primaryCollateral ? {
        branchName: primaryCollateral.BRANCH_NAME,
        branchCode: primaryCollateral.BRANCH_CODE,
        BU_ID: primaryCollateral.BU_ID
      } : null,
      loanAccountNo: loanAccountNo,
      summary: {
        totalCollaterals: collaterals.length,
        active: activeCollaterals.length,
        pending: pendingCollaterals.length,
        rejected: rejectedCollaterals.length,
        totalValue: totalValue
      },
      details: collaterals.map(c => ({
        ...c.getSummary(),
        status: c.REC_ST === 'P' ? 'Pending' : 
                c.REC_ST === 'A' ? 'Active' : 
                c.REC_ST === 'R' ? 'Rejected' : 'Inactive'
      }))
    };

    return res.status(200).json({
      success: true,
      data: ndicSummary
    });

  } catch (error) {
    logger.error('Error generating NDIC collateral summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating NDIC collateral summary',
      error: error.message
    });
  }
};

// ==========================================
// GET STATS - Collateral statistics
// ==========================================
export const getCollateralStats = async (req, res) => {
  try {
    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;

    const whereClause = {};

    if (!isAdmin(req.user)) {
      whereClause.BU_ID = userBuId;
    }

    const totalCollateral = await Collateral.count({
      where: whereClause
    });

    const totalValue = await Collateral.sum('COLLATERAL_MARKET_VALUE', {
      where: whereClause
    });

    const types = await Collateral.getCollateralTypes();

    const activeCount = await Collateral.count({
      where: { 
        ...whereClause,
        REC_ST: 'A'
      }
    });

    const pendingCount = await Collateral.count({
      where: { 
        ...whereClause,
        REC_ST: 'P'
      }
    });

    const expiredCount = await Collateral.count({
      where: { 
        ...whereClause,
        COLLATERAL_EXPIRY_DT: { [Op.lt]: new Date() }
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        total: totalCollateral,
        active: activeCount,
        pending: pendingCount,
        expired: expiredCount,
        totalValue: parseFloat(totalValue) || 0,
        types: types
      }
    });

  } catch (error) {
    logger.error('Error fetching collateral stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching collateral stats',
      error: error.message
    });
  }
};

// ==========================================
// BULK CREATE - Bulk create collateral
// ==========================================
export const bulkCreateCollateral = async (req, res) => {
  const transaction = await Collateral.sequelize.transaction();
  
  try {
    const { collaterals } = req.body;
    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;
    const userId = req.user?.id || req.user?.user_id || req.user?.userId || req.user?.user_name || 'SYSTEM';
    const userRole = req.user?.role || req.user?.primary_business_role;
    const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    if (!collaterals || !Array.isArray(collaterals) || collaterals.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid collaterals data. Expected array of collateral objects'
      });
    }

    const branch = await getBranchDetails(userBuId);
    const createdCollaterals = [];

    for (const data of collaterals) {
      const collateralId = await generateCollateralId();
      const collateralRefNo = generateCollateralRefNo();

      const collateral = await Collateral.create({
        COLLATERAL_ID: collateralId,
        COLLATERAL_REF_NO: collateralRefNo,
        USER_ID: userId,
        CREATED_BY: userId,
        CREATE_DT: new Date(),
        REC_ST: 'P',
        COLLATERAL_STATUS: 'Pending',
        BU_ID: userBuId,
        BRANCH_NAME: branch?.branchName || null,
        BRANCH_CODE: branch?.branchCode || null,
        ...data
      }, { transaction });

      // ✅ Log audit trail for each created collateral
      await logCollateralAudit({
        eventType: 'CREATE',
        action: 'bulk_create_collateral',
        userId: userId,
        userRole: userRole,
        collateralId: collateral.id,
        newValue: collateral.toJSON(),
        ipAddress: ipAddress,
        branch: userBuId,
        description: `Bulk collateral created: ${collateralRefNo} for customer ${data.CUST_ID}`,
        transaction
      });

      // Create workflow for each collateral
      await createWorkflowItem({
        collateralId: collateral.id,
        collateralRefNo,
        custId: data.CUST_ID,
        buId: userBuId,
        createdBy: userId,
        collateralData: collateral.toJSON()
      }, transaction);

      createdCollaterals.push(collateral);
    }

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: `${createdCollaterals.length} collateral records created and submitted for approval`,
      data: createdCollaterals.map(c => c.getSummary())
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error bulk creating collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating collateral records',
      error: error.message
    });
  }
};

// ==========================================
// GET BY CUSTOMER - Get collateral by customer
// ==========================================
export const getCollateralByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;

    const whereClause = { CUST_ID: customerId };

    if (!isAdmin(req.user)) {
      whereClause.BU_ID = userBuId;
    }

    const collaterals = await Collateral.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      data: collaterals.map(row => ({
        ...row.getSummary(),
        branch: {
          branchName: row.BRANCH_NAME,
          branchCode: row.BRANCH_CODE,
          BU_ID: row.BU_ID
        }
      })),
      total: collaterals.length,
      totalValue: await Collateral.getTotalValueByCustomer(customerId)
    });

  } catch (error) {
    logger.error('Error fetching customer collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching customer collateral',
      error: error.message
    });
  }
};

// ==========================================
// GET BY LOAN - Get collateral by loan account
// ==========================================
export const getCollateralByLoan = async (req, res) => {
  try {
    const { loanAccountNo } = req.params;
    const userBuId = req.user?.businessUnit || req.user?.BU_ID || req.user?.bu_id;

    const whereClause = { LOAN_ACCOUNT_NO: loanAccountNo };

    if (!isAdmin(req.user)) {
      whereClause.BU_ID = userBuId;
    }

    const collaterals = await Collateral.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });

    const summary = {
      hasCollateral: collaterals.length > 0,
      totalValue: collaterals.reduce((sum, c) => sum + parseFloat(c.COLLATERAL_MARKET_VALUE || 0), 0),
      types: collaterals.map(c => c.COLLATERAL_TYPE_DESC || c.COLLATERAL_DESC),
      details: collaterals.map(c => ({
        ...c.getSummary(),
        branch: {
          branchName: c.BRANCH_NAME,
          branchCode: c.BRANCH_CODE,
          BU_ID: c.BU_ID
        }
      }))
    };

    return res.status(200).json({
      success: true,
      data: summary
    });

  } catch (error) {
    logger.error('Error fetching loan collateral:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching loan collateral',
      error: error.message
    });
  }
};

// ==========================================
// EXPORT ALL
// ==========================================
export default {
  createCollateral,
  getAllCollateral,
  getCollateralById,
  getCollateralByCustomer,
  getCollateralByLoan,
  getCollateralByBranch,
  updateCollateralById,
updateCollateralByBranch,
  deleteCollateralById,
  deleteCollateralbybranch,
  getPendingApprovalsByBranch,
  approveBranchCollateral,
  rejectBranchCollateral,
  approveCollateral,
  rejectCollateral,
  getNDICCollateralSummary,
  getCollateralStats,
  bulkCreateCollateral
};