// controllers/DrawerReassignmentController.js
import crypto from 'crypto';
import Drawer from '../models/Drawer.js';
import DrawerReassignment from '../models/DrawerReassignment.js';
import AuditTrail from '../models/AuditTrail.js';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import { addAuditTrail } from '../models/AuditTrail.js'; // Adjust the path as needed

// =============================================
// DRAWER REASSIGNMENT CRUD OPERATIONS
// =============================================

export const createDrawerReassignment = async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const {
      DRAWER_ID,
      BU_ID,
      CURRENT_ASSIGNEE_ID,
      NEW_ASSIGNEE_ID,
      RSN_ID,
      REMARKS,
      REASSIGNMENT_TYPE,
      REASON_CODE,
      USER_ID,
      CREATED_BY,
      EFFECTIVE_FROM,
      NEW_ASSIGNEE_NAME
    } = req.body;

    // Auto-generate DRAWER_REASSIGNMENT_ID
    const DRAWER_REASSIGNMENT_ID = generateReassignmentId();
    
    // Auto-generate SESSION_ID
    const SESSION_ID = crypto.randomUUID();

    // Capture IP_ADDRESS from request
    const IP_ADDRESS = req.ip || req.connection.remoteAddress || 'unknown';

    // Validate required fields
    if (!DRAWER_ID || !BU_ID || !NEW_ASSIGNEE_ID || !USER_ID || !CREATED_BY) {
      await t.rollback();
      return res.status(400).json({ 
        message: 'Missing required fields',
        required: ['DRAWER_ID', 'BU_ID', 'NEW_ASSIGNEE_ID', 'USER_ID', 'CREATED_BY'],
        received: { DRAWER_ID, BU_ID, NEW_ASSIGNEE_ID, USER_ID, CREATED_BY }
      });
    }

    // Verify drawer exists and get current status
    const drawer = await Drawer.findOne({ 
      where: { DRAWER_ID },
      transaction: t 
    });
    
    if (!drawer) {
      await t.rollback();
      return res.status(404).json({ 
        message: 'Drawer not found',
        drawerId: DRAWER_ID 
      });
    }

    // CRITICAL: Check if drawer is CLOSED before allowing reassignment
    if (drawer.WF_STATUS === 'OPEN') {
      await t.rollback();
      return res.status(400).json({ 
        message: 'Drawer must be closed before reassignment',
        currentStatus: drawer.WF_STATUS,
        drawerNo: drawer.DRAWER_NO,
        lastOpened: drawer.LAST_DRAWER_OPEN_DT,
        lastClosed: drawer.LAST_DRAWER_CLOSE_DT,
        instructions: 'Please close the drawer first before proceeding with reassignment'
      });
    }

    // Check if drawer is active
    if (drawer.REC_ST !== 'A') {
      await t.rollback();
      return res.status(400).json({ 
        message: 'Drawer is not active and cannot be reassigned',
        currentRecordStatus: drawer.REC_ST
      });
    }

    // Determine if this is an initial assignment or reassignment
    let effectiveCurrentAssignee = CURRENT_ASSIGNEE_ID || '0';
    let isInitial = false;
    
    // CHANGED: Now comparing as strings since CURRENT_ASSIGNEE_ID is STRING in Drawer model
    if (!drawer.CURRENT_ASSIGNEE_ID || drawer.CURRENT_ASSIGNEE_ID === '0') {
      isInitial = true;
      if (CURRENT_ASSIGNEE_ID && CURRENT_ASSIGNEE_ID !== '0') {
        console.warn(`Initial assignment: Ignoring provided CURRENT_ASSIGNEE_ID ${CURRENT_ASSIGNEE_ID} as drawer is unassigned. Using '0'.`);
      }
      effectiveCurrentAssignee = '0';
    } else {
      // Standard reassignment: Verify match - both should be strings now
      if (drawer.CURRENT_ASSIGNEE_ID !== CURRENT_ASSIGNEE_ID) {
        await t.rollback();
        return res.status(400).json({ 
          message: 'Current assignee does not match drawer assignment',
          expected: drawer.CURRENT_ASSIGNEE_ID,
          provided: CURRENT_ASSIGNEE_ID,
          drawerNo: drawer.DRAWER_NO,
          currentAssigneeName: drawer.CURRENT_ASSIGNEE_NAME
        });
      }
      effectiveCurrentAssignee = CURRENT_ASSIGNEE_ID;
    }

    // Create reassignment record with auto-generated ID
    const reassignment = await DrawerReassignment.create({
      DRAWER_REASSIGNMENT_ID, // Auto-generated ID
      DRAWER_ID,
      DRAWER_NO: drawer.DRAWER_NO,
      BU_ID: BU_ID.toString(),
      CURRENT_ASSIGNEE_ID: effectiveCurrentAssignee,
      CURRENT_ASSIGNEE_NAME: effectiveCurrentAssignee && effectiveCurrentAssignee !== '0' ? drawer.CURRENT_ASSIGNEE_NAME : null,
      NEW_ASSIGNEE_ID: NEW_ASSIGNEE_ID,
      NEW_ASSIGNEE_NAME: NEW_ASSIGNEE_NAME || 'Unknown',
      RSN_ID: RSN_ID ? RSN_ID.toString() : null,
      REMARKS,
      REASSIGNMENT_TYPE: REASSIGNMENT_TYPE || 'REGULAR',
      REASON_CODE: REASON_CODE || 'OPERATIONAL',
      USER_ID: USER_ID,
      CREATED_BY: CREATED_BY,
      EFFECTIVE_FROM: EFFECTIVE_FROM || new Date(),
      DRAWER_STATUS_AT_REASSIGNMENT: drawer.WF_STATUS,
      BALANCE_AT_REASSIGNMENT: drawer.CURRENT_BALANCE,
      IP_ADDRESS,
      SESSION_ID,
      STATUS: 'COMPLETED',
      REC_ST: 'A',
      VERSION_NO: 1,
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date()
    }, { transaction: t });

    // Update drawer current assignment
    // REMOVED: The complex type conversion logic since Drawer model now uses STRING
    // CHANGED: Simple assignment since both models now use STRING for assignee IDs
    drawer.CURRENT_ASSIGNEE_ID = NEW_ASSIGNEE_ID;
    drawer.CURRENT_ASSIGNEE_NAME = NEW_ASSIGNEE_NAME || 'Unknown';
    drawer.LAST_REASSIGNMENT_ID = reassignment.DRAWER_REASSIGNMENT_ID;
    drawer.VERSION_NO = (drawer.VERSION_NO || 0) + 1;

    await drawer.save({ transaction: t });

    // Prepare change data for new_value
    const newValue = {
      assignee_id: NEW_ASSIGNEE_ID,
      assignee_name: NEW_ASSIGNEE_NAME || 'Unknown',
      reassignment_id: reassignment.DRAWER_REASSIGNMENT_ID,
      effective_from: EFFECTIVE_FROM || new Date().toISOString(),
      drawer_status: drawer.WF_STATUS,
      previous_assignee: effectiveCurrentAssignee
    };

    // Create audit trail - Direct approach without addAuditTrail function
    // Generate event_id (timestamp-based)
    const eventId = Date.now();
    
    // Create the audit trail directly using AuditTrail model
    await AuditTrail.create({
      event_id: eventId,
      user_id: USER_ID,
      event_type: isInitial ? 'DRAWER_ASSIGNMENT_CREATED' : 'DRAWER_REASSIGNMENT_CREATED',
      action: isInitial ? 'Drawer Assignment' : 'Drawer Reassignment',
      new_value: newValue,
      ip_address: IP_ADDRESS,
      entity_type: 'Drawer',
      entity_id: parseInt(DRAWER_ID), // CRITICAL: Must be integer
      status: 'SUCCESS',
      description: isInitial 
        ? `Drawer ${drawer.DRAWER_NO} initially assigned to ${NEW_ASSIGNEE_ID} (${NEW_ASSIGNEE_NAME}) - Status: ${drawer.WF_STATUS}`
        : `Drawer ${drawer.DRAWER_NO} reassigned from ${effectiveCurrentAssignee} to ${NEW_ASSIGNEE_ID} (${NEW_ASSIGNEE_NAME}) - Status: ${drawer.WF_STATUS}`,
      reference_no: `REASSIGN-${reassignment.DRAWER_REASSIGNMENT_ID}`,
      additional_info: {
        drawer_id: DRAWER_ID,
        drawer_no: drawer.DRAWER_NO,
        drawer_status: drawer.WF_STATUS,
        previous_assignee: effectiveCurrentAssignee,
        previous_assignee_name: drawer.CURRENT_ASSIGNEE_NAME,
        new_assignee: NEW_ASSIGNEE_ID,
        new_assignee_name: NEW_ASSIGNEE_NAME,
        reassignment_type: REASSIGNMENT_TYPE,
        reason_code: REASON_CODE,
        remarks: REMARKS,
        is_initial_assignment: isInitial,
        balance_at_reassignment: drawer.CURRENT_BALANCE,
        reassignment_id: reassignment.DRAWER_REASSIGNMENT_ID
      },
      timestamp: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    }, { transaction: t });

    await t.commit();

    res.status(201).json({
      message: isInitial ? 'Drawer assignment created successfully' : 'Drawer reassignment created successfully',
      reassignment: reassignment,
      drawer: {
        DRAWER_ID: drawer.DRAWER_ID,
        DRAWER_NO: drawer.DRAWER_NO,
        newAssignee: NEW_ASSIGNEE_ID,
        newAssigneeName: NEW_ASSIGNEE_NAME,
        status: drawer.WF_STATUS,
        previousStatus: drawer.WF_STATUS,
        balance: drawer.CURRENT_BALANCE
      },
      validation: {
        drawerWasClosed: true,
        allowedReassignment: true,
        reassignmentId: reassignment.DRAWER_REASSIGNMENT_ID
      }
    });

  } catch (error) {
    await t.rollback();
    console.error('Error creating drawer reassignment:', error);
    
    // Provide more detailed error information
    const errorResponse = {
      message: 'Error creating drawer reassignment',
      error: error.message
    };
    
    // Include SQL details if available
    if (error.sql) {
      errorResponse.sql = error.sql;
      errorResponse.parameters = error.parameters;
    }
    
    // Include validation errors if available
    if (error.errors) {
      errorResponse.details = error.errors.map(e => ({
        message: e.message,
        type: e.type,
        path: e.path,
        value: e.value
      }));
    }
    
    res.status(500).json(errorResponse);
  }
};

// Helper function to generate unique reassignment ID
function generateReassignmentId() {
  // Generate a timestamp-based ID: REASSIGN-YYYYMMDD-HHMMSS-RANDOM
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, ''); // HHMMSS
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 random chars
  
  return `REASSIGN-${dateStr}-${timeStr}-${randomStr}`;
}





export const getAllDrawerReassignments = async (req, res) => {
  try {
    const { 
      drawerId, 
      userId, 
      reassignmentType, 
      startDate, 
      endDate, 
      limit = 50, 
      offset = 0 
    } = req.query;

    let where = { REC_ST: 'A' };

    // Build filter query
    if (drawerId) where.DRAWER_ID = parseInt(drawerId);
    if (userId) {
      where[Op.or] = [
        { CURRENT_ASSIGNEE_ID: userId },
        { NEW_ASSIGNEE_ID: userId }
      ];
    }
    if (reassignmentType) where.REASSIGNMENT_TYPE = reassignmentType;
    if (startDate || endDate) {
      where.CREATE_DT = {};
      if (startDate) where.CREATE_DT[Op.gte] = new Date(startDate);
      if (endDate) where.CREATE_DT[Op.lte] = new Date(endDate);
    }

    const reassignments = await DrawerReassignment.findAll({
      where,
      order: [['CREATE_DT', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total = await DrawerReassignment.count({ where });

    res.status(200).json({
      success: true,
      total,
      count: reassignments.length,
      reassignments
    });
  } catch (error) {
    console.error('Error fetching reassignments:', error);
    res.status(500).json({ 
      message: 'Error fetching reassignments', 
      error: error.message 
    });
  }
};

export const getDrawerReassignmentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Try both integer and string lookup since IDs might be either
    let reassignment;
    
    if (/^\d+$/.test(id)) {
      // If numeric, try as integer ID
      reassignment = await DrawerReassignment.findOne({ 
        where: { 
          DRAWER_REASSIGNMENT_ID: parseInt(id),
          REC_ST: 'A' 
        }
      });
    }
    
    // If not found with integer, try as string
    if (!reassignment) {
      reassignment = await DrawerReassignment.findOne({ 
        where: { 
          DRAWER_REASSIGNMENT_ID: id,
          REC_ST: 'A' 
        }
      });
    }

    if (!reassignment) {
      return res.status(404).json({ 
        message: 'Drawer reassignment not found',
        id: id
      });
    }

    res.status(200).json({
      success: true,
      reassignment
    });
  } catch (error) {
    console.error('Error fetching reassignment:', error);
    res.status(500).json({ 
      message: 'Error fetching reassignment', 
      error: error.message 
    });
  }
};

export const updateDrawerReassignment = async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { REMARKS, REASON_CODE, STATUS } = req.body;

    // Find reassignment (handle both string and integer IDs)
    let reassignment;
    if (/^\d+$/.test(id)) {
      reassignment = await DrawerReassignment.findOne({ 
        where: { 
          DRAWER_REASSIGNMENT_ID: parseInt(id),
          REC_ST: 'A' 
        },
        transaction: t
      });
    }
    
    if (!reassignment) {
      reassignment = await DrawerReassignment.findOne({ 
        where: { 
          DRAWER_REASSIGNMENT_ID: id,
          REC_ST: 'A' 
        },
        transaction: t
      });
    }

    if (!reassignment) {
      await t.rollback();
      return res.status(404).json({ 
        message: 'Drawer reassignment not found' 
      });
    }

    // Only allow updating certain fields
    if (REMARKS) reassignment.REMARKS = REMARKS;
    if (REASON_CODE) reassignment.REASON_CODE = REASON_CODE;
    if (STATUS) reassignment.STATUS = STATUS;
    
    reassignment.VERSION_NO += 1;

    await reassignment.save({ transaction: t });
    await t.commit();

    res.status(200).json({
      message: 'Drawer reassignment updated successfully',
      reassignment
    });
  } catch (error) {
    await t.rollback();
    console.error('Error updating reassignment:', error);
    res.status(500).json({ 
      message: 'Error updating reassignment', 
      error: error.message 
    });
  }
};

export const deleteDrawerReassignment = async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const { id } = req.params;

    // Find reassignment (handle both string and integer IDs)
    let reassignment;
    if (/^\d+$/.test(id)) {
      reassignment = await DrawerReassignment.findOne({ 
        where: { 
          DRAWER_REASSIGNMENT_ID: parseInt(id),
          REC_ST: 'A' 
        },
        transaction: t
      });
    }
    
    if (!reassignment) {
      reassignment = await DrawerReassignment.findOne({ 
        where: { 
          DRAWER_REASSIGNMENT_ID: id,
          REC_ST: 'A' 
        },
        transaction: t
      });
    }

    if (!reassignment) {
      await t.rollback();
      return res.status(404).json({ 
        message: 'Drawer reassignment not found' 
      });
    }

    // Soft delete
    reassignment.REC_ST = 'I';
    reassignment.VERSION_NO += 1;

    await reassignment.save({ transaction: t });
    await t.commit();

    res.status(200).json({
      message: 'Drawer reassignment deleted successfully'
    });
  } catch (error) {
    await t.rollback();
    console.error('Error deleting reassignment:', error);
    res.status(500).json({ 
      message: 'Error deleting reassignment', 
      error: error.message 
    });
  }
};

// =============================================
// DRAWER REASSIGNMENT REPORTS & ANALYTICS
// =============================================

export const getDrawerReassignmentHistory = async (req, res) => {
  try {
    const { drawerId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const reassignments = await DrawerReassignment.findAll({ 
      where: { 
        DRAWER_ID: parseInt(drawerId),
        REC_ST: 'A'
      },
      order: [['CREATE_DT', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total = await DrawerReassignment.count({ 
      where: { 
        DRAWER_ID: parseInt(drawerId),
        REC_ST: 'A'
      }
    });

    res.status(200).json({
      success: true,
      total,
      count: reassignments.length,
      reassignments
    });
  } catch (error) {
    console.error('Error fetching reassignment history:', error);
    res.status(500).json({ 
      message: 'Error fetching reassignment history', 
      error: error.message 
    });
  }
};

export const getUserReassignments = async (req, res) => {
  try {
    const { userId } = req.params;
    const { type = 'all', limit = 50, offset = 0 } = req.query;

    let where = {
      [Op.or]: [
        { CURRENT_ASSIGNEE_ID: userId },
        { NEW_ASSIGNEE_ID: userId }
      ],
      REC_ST: 'A'
    };

    if (type === 'assigned') {
      where = { NEW_ASSIGNEE_ID: userId, REC_ST: 'A' };
    } else if (type === 'unassigned') {
      where = { CURRENT_ASSIGNEE_ID: userId, REC_ST: 'A' };
    }

    const reassignments = await DrawerReassignment.findAll({
      where,
      order: [['CREATE_DT', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total = await DrawerReassignment.count({ where });

    res.status(200).json({
      success: true,
      total,
      count: reassignments.length,
      reassignments
    });
  } catch (error) {
    console.error('Error fetching user reassignments:', error);
    res.status(500).json({ 
      message: 'Error fetching user reassignments', 
      error: error.message 
    });
  }
};

export const getReassignmentAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, businessUnit, reassignmentType } = req.query;
    
    let where = { REC_ST: 'A' };
    
    if (startDate || endDate) {
      where.CREATE_DT = {};
      if (startDate) where.CREATE_DT[Op.gte] = new Date(startDate);
      if (endDate) where.CREATE_DT[Op.lte] = new Date(endDate);
    }
    if (businessUnit) where.BU_ID = businessUnit;
    if (reassignmentType) where.REASSIGNMENT_TYPE = reassignmentType;

    const allReassignments = await DrawerReassignment.findAll({ where });
    
    // Manual aggregation
    const analytics = {};
    allReassignments.forEach(reassignment => {
      const type = reassignment.REASSIGNMENT_TYPE;
      if (!analytics[type]) {
        analytics[type] = {
          reassignmentType: type,
          count: 0,
          uniqueDrawers: new Set(),
          uniqueUsers: new Set()
        };
      }
      
      analytics[type].count++;
      analytics[type].uniqueDrawers.add(reassignment.DRAWER_ID);
      analytics[type].uniqueUsers.add(reassignment.NEW_ASSIGNEE_ID);
    });

    // Format response
    const result = Object.values(analytics).map(item => ({
      reassignmentType: item.reassignmentType,
      count: item.count,
      uniqueDrawers: item.uniqueDrawers.size,
      uniqueUsers: item.uniqueUsers.size
    }));

    res.status(200).json({
      success: true,
      analytics: result,
      period: {
        startDate,
        endDate,
        businessUnit
      }
    });
  } catch (error) {
    console.error('Error fetching reassignment analytics:', error);
    res.status(500).json({ 
      message: 'Error fetching reassignment analytics', 
      error: error.message 
    });
  }
};

// =============================================
// ADDITIONAL FUNCTIONS FOR EXTENDED ROUTES
// =============================================

export const getReassignmentsByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const reassignments = await DrawerReassignment.findAll({
      where: {
        STATUS: status,
        REC_ST: 'A'
      },
      order: [['CREATE_DT', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total = await DrawerReassignment.count({
      where: {
        STATUS: status,
        REC_ST: 'A'
      }
    });

    res.status(200).json({
      success: true,
      status,
      total,
      count: reassignments.length,
      reassignments
    });
  } catch (error) {
    console.error('Error fetching reassignments by status:', error);
    res.status(500).json({ 
      message: 'Error fetching reassignments by status', 
      error: error.message 
    });
  }
};

export const getActiveDrawerReassignments = async (req, res) => {
  try {
    const { drawerId } = req.params;

    const reassignments = await DrawerReassignment.findActiveByDrawer(parseInt(drawerId));

    res.status(200).json({
      success: true,
      count: reassignments.length,
      reassignments
    });
  } catch (error) {
    console.error('Error fetching active reassignments:', error);
    res.status(500).json({ 
      message: 'Error fetching active reassignments', 
      error: error.message 
    });
  }
};

// Note: Renamed from getUserCurrentAssignments to avoid confusion
export const getCurrentDrawerAssignment = async (req, res) => {
  try {
    const { drawerId } = req.params;

    // Try to find the drawer first to get the correct ID
    const drawer = await Drawer.findOne({
      where: {
        [Op.or]: [
          { DRAWER_ID: parseInt(drawerId) || 0 },
          { DRAWER_NO: drawerId }
        ]
      }
    });

    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: 'Drawer not found'
      });
    }

    // Use the model's static method
    const currentAssignment = await DrawerReassignment.getCurrentAssignment(drawer.DRAWER_ID);

    if (!currentAssignment) {
      return res.status(404).json({
        success: false,
        message: 'No active assignment found for this drawer',
        drawer: {
          DRAWER_ID: drawer.DRAWER_ID,
          DRAWER_NO: drawer.DRAWER_NO,
          CURRENT_ASSIGNEE_ID: drawer.CURRENT_ASSIGNEE_ID,
          CURRENT_ASSIGNEE_NAME: drawer.CURRENT_ASSIGNEE_NAME
        }
      });
    }

    res.status(200).json({
      success: true,
      currentAssignment,
      drawer: {
        DRAWER_ID: drawer.DRAWER_ID,
        DRAWER_NO: drawer.DRAWER_NO
      }
    });
  } catch (error) {
    console.error('Error fetching current assignment:', error);
    res.status(500).json({ 
      message: 'Error fetching current assignment', 
      error: error.message 
    });
  }
};

// Get all current assignments for a specific user
export const getUserCurrentAssignments = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const currentAssignments = await DrawerReassignment.findAll({
      where: {
        NEW_ASSIGNEE_ID: userId.toString(),
        STATUS: 'COMPLETED',
        REC_ST: 'A',
        EFFECTIVE_TO: null
      },
      order: [['EFFECTIVE_FROM', 'DESC']]
    });

    // If no assignments found with NEW_ASSIGNEE_ID, check if user has any as CURRENT_ASSIGNEE_ID
    if (currentAssignments.length === 0) {
      const alternativeAssignments = await DrawerReassignment.findAll({
        where: {
          CURRENT_ASSIGNEE_ID: userId.toString(),
          STATUS: 'COMPLETED',
          REC_ST: 'A',
          EFFECTIVE_TO: null
        },
        order: [['EFFECTIVE_FROM', 'DESC']]
      });
      
      return res.status(200).json({
        success: true,
        message: 'User has no active assignments as new assignee, but found as current assignee (possibly ending assignments)',
        count: alternativeAssignments.length,
        assignments: alternativeAssignments,
        userId,
        assignmentType: 'current_assignee'
      });
    }

    res.status(200).json({
      success: true,
      count: currentAssignments.length,
      assignments: currentAssignments,
      userId,
      assignmentType: 'new_assignee'
    });
  } catch (error) {
    console.error('Error fetching user current assignments:', error);
    res.status(500).json({ 
      message: 'Error fetching user current assignments', 
      error: error.message 
    });
  }
};

export const getDrawerReassignmentsWithDetails = async (req, res) => {
  try {
    const { 
      drawerId, 
      userId, 
      reassignmentType, 
      startDate, 
      endDate, 
      limit = 50, 
      offset = 0,
      includeDrawer = 'true'
    } = req.query;

    let where = { REC_ST: 'A' };

    // Build filter query
    if (drawerId) where.DRAWER_ID = parseInt(drawerId);
    if (userId) {
      where[Op.or] = [
        { CURRENT_ASSIGNEE_ID: userId },
        { NEW_ASSIGNEE_ID: userId }
      ];
    }
    if (reassignmentType) where.REASSIGNMENT_TYPE = reassignmentType;
    if (startDate || endDate) {
      where.CREATE_DT = {};
      if (startDate) where.CREATE_DT[Op.gte] = new Date(startDate);
      if (endDate) where.CREATE_DT[Op.lte] = new Date(endDate);
    }

    const options = {
      where,
      order: [['CREATE_DT', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    // Include drawer details if requested
    if (includeDrawer === 'true') {
      options.include = [
        {
          model: Drawer,
          as: 'drawer',
          attributes: ['DRAWER_NO', 'DRAWER_NM', 'WF_STATUS', 'CURRENT_BALANCE', 'DRAWER_TY_CD']
        }
      ];
    }

    const reassignments = await DrawerReassignment.findAll(options);
    const total = await DrawerReassignment.count({ where });

    res.status(200).json({
      success: true,
      total,
      count: reassignments.length,
      reassignments,
      filters: {
        drawerId: drawerId || 'all',
        userId: userId || 'all',
        reassignmentType: reassignmentType || 'all',
        dateRange: startDate || endDate ? `${startDate || 'any'} to ${endDate || 'any'}` : 'all',
        includeDrawerDetails: includeDrawer === 'true'
      }
    });
  } catch (error) {
    console.error('Error fetching reassignments with details:', error);
    res.status(500).json({ 
      message: 'Error fetching reassignments', 
      error: error.message 
    });
  }
};

export const getReassignmentStatistics = async (req, res) => {
  try {
    const { period = 'month', startDate, endDate, buId } = req.query;
    
    // Calculate date range based on period
    let dateFilter = {};
    const now = new Date();
    
    switch(period.toLowerCase()) {
      case 'day':
        dateFilter.startDate = new Date(now.setHours(0, 0, 0, 0));
        dateFilter.endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'week':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        dateFilter.startDate = startOfWeek;
        dateFilter.endDate = new Date(now);
        break;
      case 'month':
        dateFilter.startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'year':
        dateFilter.startDate = new Date(now.getFullYear(), 0, 1);
        dateFilter.endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      default:
        if (startDate && endDate) {
          dateFilter.startDate = new Date(startDate);
          dateFilter.endDate = new Date(endDate);
        } else {
          // Default to last 30 days
          dateFilter.startDate = new Date(now.setDate(now.getDate() - 30));
          dateFilter.endDate = new Date();
        }
    }

    let where = {
      REC_ST: 'A',
      CREATE_DT: {
        [Op.between]: [dateFilter.startDate, dateFilter.endDate]
      }
    };
    
    if (buId) where.BU_ID = buId.toString();

    const reassignments = await DrawerReassignment.findAll({ where });
    
    // Calculate statistics
    const stats = {
      period: period,
      dateRange: {
        start: dateFilter.startDate.toISOString(),
        end: dateFilter.endDate.toISOString()
      },
      totalReassignments: reassignments.length,
      byType: {},
      byStatus: {},
      byBusinessUnit: {},
      topDrawers: {},
      topUsers: {}
    };

    // Aggregate data
    reassignments.forEach(reassignment => {
      // By type
      const type = reassignment.REASSIGNMENT_TYPE;
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      
      // By status
      const status = reassignment.STATUS;
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      
      // By business unit
      const bu = reassignment.BU_ID;
      stats.byBusinessUnit[bu] = (stats.byBusinessUnit[bu] || 0) + 1;
      
      // Top drawers
      const drawerId = reassignment.DRAWER_ID;
      stats.topDrawers[drawerId] = (stats.topDrawers[drawerId] || 0) + 1;
      
      // Top users (new assignees)
      const userId = reassignment.NEW_ASSIGNEE_ID;
      stats.topUsers[userId] = (stats.topUsers[userId] || 0) + 1;
    });

    // Sort top drawers and users
    stats.topDrawersSorted = Object.entries(stats.topDrawers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([drawerId, count]) => ({ drawerId, count }));
    
    stats.topUsersSorted = Object.entries(stats.topUsers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));

    res.status(200).json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error('Error fetching reassignment statistics:', error);
    res.status(500).json({ 
      message: 'Error fetching reassignment statistics', 
      error: error.message 
    });
  }
};