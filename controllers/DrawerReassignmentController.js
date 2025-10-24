import crypto from 'crypto';
import mongoose from 'mongoose';
import Drawer from '../models/Drawer.js';  // Adjust path
import DrawerReassignment from '../models/DrawerReassignment.js';  // Adjust path
import AuditTrail from '../models/AuditTrail.js';  // Adjust path

export const createDrawerReassignment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      DRAWER_REASSIGNMENT_ID,
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
      NEW_ASSIGNEE_NAME  // Explicitly destructure for use
    } = req.body;

    // Auto-generate SESSION_ID
    const SESSION_ID = crypto.randomUUID();

    // Capture IP_ADDRESS from request
    const IP_ADDRESS = req.ip || req.connection.remoteAddress || 'unknown';

    // Validate required fields (CURRENT_ASSIGNEE_ID optional for initial assignments)
    if (!DRAWER_REASSIGNMENT_ID || !DRAWER_ID || !BU_ID || 
        !NEW_ASSIGNEE_ID || !USER_ID || !CREATED_BY) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Missing required fields' 
      });
    }

    // Verify drawer exists and get current status
    const drawer = await Drawer.findOne({ DRAWER_ID }).session(session);
    if (!drawer) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Drawer not found' });
    }

    // For initial assignments: Skip match if drawer is unassigned (CURRENT_ASSIGNEE_ID is null/0/undefined)
    let effectiveCurrentAssignee = CURRENT_ASSIGNEE_ID || 0;
    let isInitial = false;
    if (!drawer.CURRENT_ASSIGNEE_ID || drawer.CURRENT_ASSIGNEE_ID === 0) {
      isInitial = true;
      if (CURRENT_ASSIGNEE_ID && CURRENT_ASSIGNEE_ID !== 0) {
        // Warn if provided but drawer unassigned (optional: make this an error)
        console.warn(`Initial assignment: Ignoring provided CURRENT_ASSIGNEE_ID ${CURRENT_ASSIGNEE_ID} as drawer is unassigned. Using 0.`);
      }
      effectiveCurrentAssignee = 0;  // Use 0 for schema compatibility (assuming schema allows 0 but not null)
    } else {
      // Standard reassignment: Verify match
      if (drawer.CURRENT_ASSIGNEE_ID !== CURRENT_ASSIGNEE_ID) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: 'Current assignee does not match drawer assignment',
          expected: drawer.CURRENT_ASSIGNEE_ID,
          provided: CURRENT_ASSIGNEE_ID
        });
      }
      effectiveCurrentAssignee = CURRENT_ASSIGNEE_ID;
    }

    // Check for duplicate reassignment ID
    const existingReassignment = await DrawerReassignment.findOne({ 
      DRAWER_REASSIGNMENT_ID 
    }).session(session);
    
    if (existingReassignment) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Reassignment ID already exists' 
      });
    }

    // For initial assignments, optionally skip creating reassignment record if schema doesn't allow CURRENT_ASSIGNEE_ID=0
    // But assuming it does, proceed. If not, comment out the reassignment creation and just update drawer/audit.
    if (isInitial) {
      // Optional: If schema strictly requires a non-zero CURRENT_ASSIGNEE_ID, handle initial differently
      // e.g., don't create reassignment, just update drawer and audit as 'ASSIGNMENT_CREATED'
      // For now, create with 0
    }

    // Create reassignment record (use effectiveCurrentAssignee = 0 for initial)
    const reassignment = new DrawerReassignment({
      DRAWER_REASSIGNMENT_ID,
      DRAWER_ID,
      DRAWER_NO: drawer.DRAWER_NO, // Denormalize for easier queries
      BU_ID,
      CURRENT_ASSIGNEE_ID: effectiveCurrentAssignee,  // 0 for initial
      CURRENT_ASSIGNEE_NAME: effectiveCurrentAssignee && effectiveCurrentAssignee !== 0 ? drawer.CURRENT_ASSIGNEE_NAME : null,
      NEW_ASSIGNEE_ID,
      NEW_ASSIGNEE_NAME: NEW_ASSIGNEE_NAME || 'Unknown', // Fallback if not provided
      RSN_ID,
      REMARKS,
      REASSIGNMENT_TYPE: REASSIGNMENT_TYPE || 'REGULAR',
      REASON_CODE: REASON_CODE || 'OPERATIONAL',
      USER_ID,
      CREATED_BY,
      EFFECTIVE_FROM: EFFECTIVE_FROM || new Date(),
      DRAWER_STATUS_AT_REASSIGNMENT: drawer.WF_STATUS,
      BALANCE_AT_REASSIGNMENT: drawer.CURRENT_BALANCE,
      IP_ADDRESS, // Auto-captured
      SESSION_ID, // Auto-generated
      STATUS: 'COMPLETED', // Assuming immediate completion for now
      REC_ST: 'A',
      VERSION_NO: 1,
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date()
    });

    await reassignment.save({ session });

    // Update drawer current assignment
    drawer.CURRENT_ASSIGNEE_ID = NEW_ASSIGNEE_ID;
    drawer.CURRENT_ASSIGNEE_NAME = NEW_ASSIGNEE_NAME || 'Unknown';
    drawer.LAST_REASSIGNMENT_ID = DRAWER_REASSIGNMENT_ID;
    drawer.VERSION_NO += 1;

    await drawer.save({ session });

    // Prepare change data for new_value (e.g., JSON of updated fields)
    const newValue = {
      assignee_id: NEW_ASSIGNEE_ID,
      assignee_name: NEW_ASSIGNEE_NAME || 'Unknown',
      reassignment_id: DRAWER_REASSIGNMENT_ID,
      effective_from: EFFECTIVE_FROM || new Date().toISOString()
    };

    // Audit trail (adjust description for initial vs. reassignment)
    await AuditTrail.create([{
      event_id: Date.now(),
      user_id: USER_ID,
      event_type: isInitial ? 'DRAWER_ASSIGNMENT_CREATED' : 'DRAWER_REASSIGNMENT_CREATED',
      action: isInitial ? 'Drawer Assignment' : 'Drawer Reassignment',
      entity_type: isInitial ? 'DrawerAssignment' : 'DrawerReassignment',  // Adjust if separate model
      entity_id: isInitial ? null : reassignment._id,  // No entity for initial if no record
      description: isInitial 
        ? `Drawer ${drawer.DRAWER_NO} initially assigned to ${NEW_ASSIGNEE_ID}`
        : `Drawer ${drawer.DRAWER_NO} reassigned from ${effectiveCurrentAssignee} to ${NEW_ASSIGNEE_ID}`,
      reference_no: `REASSIGN-${DRAWER_REASSIGNMENT_ID}`,
      ip_address: IP_ADDRESS,  // Added required field
      new_value: JSON.stringify(newValue),  // Added required field as JSON string of changes
      additional_info: {
        drawer_id: DRAWER_ID,
        drawer_no: drawer.DRAWER_NO,
        previous_assignee: effectiveCurrentAssignee,
        new_assignee: NEW_ASSIGNEE_ID,
        reassignment_type: REASSIGNMENT_TYPE,
        reason_code: REASON_CODE,
        remarks: REMARKS
      }
    }], { session });

    await session.commitTransaction();

    res.status(201).json({
      message: isInitial ? 'Drawer assignment created successfully' : 'Drawer reassignment created successfully',
      reassignment: reassignment,
      drawer: {
        DRAWER_ID: drawer.DRAWER_ID,
        DRAWER_NO: drawer.DRAWER_NO,
        newAssignee: NEW_ASSIGNEE_ID,
        status: drawer.WF_STATUS
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error creating drawer reassignment:', error);
    res.status(500).json({ 
      message: 'Error creating drawer reassignment', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};


// Get reassignment history for a drawer
export const getDrawerReassignmentHistory = async (req, res) => {
  try {
    const { drawerId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const reassignments = await DrawerReassignment.find({ 
      DRAWER_ID: parseInt(drawerId),
      REC_ST: 'A'
    })
    .sort({ CREATE_DT: -1 })
    .limit(parseInt(limit))
    .skip(parseInt(offset));

    const total = await DrawerReassignment.countDocuments({ 
      DRAWER_ID: parseInt(drawerId),
      REC_ST: 'A'
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

// Get reassignments by user
export const getUserReassignments = async (req, res) => {
  try {
    const { userId } = req.params;
    const { type = 'all', limit = 50, offset = 0 } = req.query;

    let query = {
      $or: [
        { CURRENT_ASSIGNEE_ID: parseInt(userId) },
        { NEW_ASSIGNEE_ID: parseInt(userId) }
      ],
      REC_ST: 'A'
    };

    if (type === 'assigned') {
      query = { NEW_ASSIGNEE_ID: parseInt(userId), REC_ST: 'A' };
    } else if (type === 'unassigned') {
      query = { CURRENT_ASSIGNEE_ID: parseInt(userId), REC_ST: 'A' };
    }

    const reassignments = await DrawerReassignment.find(query)
      .sort({ CREATE_DT: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await DrawerReassignment.countDocuments(query);

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
// controllers/DrawerReassignmentController.js
// ... your existing imports and createDrawerReassignment function ...

// Add these missing controller functions:

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

    let query = { REC_ST: 'A' };

    // Build filter query
    if (drawerId) query.DRAWER_ID = parseInt(drawerId);
    if (userId) {
      query.$or = [
        { CURRENT_ASSIGNEE_ID: parseInt(userId) },
        { NEW_ASSIGNEE_ID: parseInt(userId) }
      ];
    }
    if (reassignmentType) query.REASSIGNMENT_TYPE = reassignmentType;
    if (startDate || endDate) {
      query.CREATE_DT = {};
      if (startDate) query.CREATE_DT.$gte = new Date(startDate);
      if (endDate) query.CREATE_DT.$lte = new Date(endDate);
    }

    const reassignments = await DrawerReassignment.find(query)
      .sort({ CREATE_DT: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await DrawerReassignment.countDocuments(query);

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
    
    const reassignment = await DrawerReassignment.findOne({ 
      DRAWER_REASSIGNMENT_ID: parseInt(id),
      REC_ST: 'A' 
    });

    if (!reassignment) {
      return res.status(404).json({ 
        message: 'Drawer reassignment not found' 
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
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { REMARKS, REASON_CODE, STATUS } = req.body;

    const reassignment = await DrawerReassignment.findOne({ 
      DRAWER_REASSIGNMENT_ID: parseInt(id),
      REC_ST: 'A' 
    }).session(session);

    if (!reassignment) {
      await session.abortTransaction();
      return res.status(404).json({ 
        message: 'Drawer reassignment not found' 
      });
    }

    // Only allow updating certain fields
    if (REMARKS) reassignment.REMARKS = REMARKS;
    if (REASON_CODE) reassignment.REASON_CODE = REASON_CODE;
    if (STATUS) reassignment.STATUS = STATUS;
    
    reassignment.VERSION_NO += 1;

    await reassignment.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      message: 'Drawer reassignment updated successfully',
      reassignment
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error updating reassignment:', error);
    res.status(500).json({ 
      message: 'Error updating reassignment', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

export const deleteDrawerReassignment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;

    const reassignment = await DrawerReassignment.findOne({ 
      DRAWER_REASSIGNMENT_ID: parseInt(id),
      REC_ST: 'A' 
    }).session(session);

    if (!reassignment) {
      await session.abortTransaction();
      return res.status(404).json({ 
        message: 'Drawer reassignment not found' 
      });
    }

    // Soft delete
    reassignment.REC_ST = 'I';
    reassignment.VERSION_NO += 1;

    await reassignment.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      message: 'Drawer reassignment deleted successfully'
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error deleting reassignment:', error);
    res.status(500).json({ 
      message: 'Error deleting reassignment', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

export const getReassignmentAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, businessUnit, reassignmentType } = req.query;
    
    let matchQuery = { REC_ST: 'A' };
    
    if (startDate || endDate) {
      matchQuery.CREATE_DT = {};
      if (startDate) matchQuery.CREATE_DT.$gte = new Date(startDate);
      if (endDate) matchQuery.CREATE_DT.$lte = new Date(endDate);
    }
    if (businessUnit) matchQuery.BU_ID = parseInt(businessUnit);
    if (reassignmentType) matchQuery.REASSIGNMENT_TYPE = reassignmentType;

    const analytics = await DrawerReassignment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$REASSIGNMENT_TYPE',
          count: { $sum: 1 },
          drawers: { $addToSet: '$DRAWER_ID' },
          users: { $addToSet: '$NEW_ASSIGNEE_ID' }
        }
      },
      {
        $project: {
          reassignmentType: '$_id',
          count: 1,
          uniqueDrawers: { $size: '$drawers' },
          uniqueUsers: { $size: '$users' },
          _id: 0
        }
      }
    ]);

    res.status(200).json({
      success: true,
      analytics,
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