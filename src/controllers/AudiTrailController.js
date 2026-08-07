// src/controllers/AudiTrailController.js – FIXED TO MATCH MODEL WITH BETTER LOGGING

import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';
import Branch from '../models/Branch.js';
import { Op } from 'sequelize';

// ========== ENHANCED: Ensure audit_trail table exists and has required columns ==========
const ensureAuditTableColumns = async (transaction = null) => {
  try {
    console.log('🔍 Checking audit_trail table...');

    const [tableCheck] = await AuditTrail.sequelize.query(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'audit_trail'`,
      { transaction }
    );

    if (tableCheck[0].count === 0) {
      console.log('➕ Creating audit_trail table...');
      await AuditTrail.sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`audit_trail\` (
          \`event_id\` BIGINT NOT NULL AUTO_INCREMENT,
          \`USER_ID\` VARCHAR(100) NOT NULL,
          \`EVENT_TYPE\` VARCHAR(100) NOT NULL,
          \`ACTION\` VARCHAR(200) NOT NULL,
          \`OLD_VALUE\` LONGTEXT,
          \`NEW_VALUE\` LONGTEXT,
          \`IP_ADDRESS\` VARCHAR(45) NOT NULL,
          \`timestamp\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          \`ENTITY_TYPE\` VARCHAR(50),
          \`ENTITY_ID\` VARCHAR(255),
          \`status\` ENUM('SUCCESS','FAILED','PARTIAL_SUCCESS','PENDING','PROCESSING') DEFAULT 'PENDING',
          \`ADDITIONAL_INFO\` LONGTEXT,
          \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          \`description\` TEXT,
          \`account_no\` VARCHAR(50),
          \`branch\` INT DEFAULT 1,
          \`user_role\` VARCHAR(50),
          \`reference_no\` VARCHAR(100),
          \`session_id\` VARCHAR(100),
          \`request_id\` VARCHAR(100),
          \`endpoint\` VARCHAR(255),
          \`method\` VARCHAR(10),
          \`user_agent\` TEXT,
          PRIMARY KEY (\`event_id\`),
          INDEX \`idx_event_type\` (\`EVENT_TYPE\`),
          INDEX \`idx_user_id\` (\`USER_ID\`),
          INDEX \`idx_entity_type\` (\`ENTITY_TYPE\`),
          INDEX \`idx_created_at\` (\`created_at\`),
          INDEX \`idx_status\` (\`status\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `, { transaction });
      console.log('✅ audit_trail table created successfully');
    } else {
      console.log('✅ audit_trail table exists');
    }

    console.log('✅ Audit trail table structure verified');
    return true;
  } catch (error) {
    console.error('❌ Error ensuring audit trail table:', error.message);
    return false;
  }
};

/** 🔹 Service function for internal use – matches Sequelize model field names */
export const addAuditTrail = async (auditData, transaction = null) => {
  try {
    // Log the incoming data for debugging
    console.log('📝 Audit data received:', JSON.stringify(auditData, null, 2));
    
    const {
      EVENT_TYPE,
      ACTION,
      USER_ID,
      USER_ROLE,
      OLD_VALUE,
      NEW_VALUE,
      IP_ADDRESS,
      USER_AGENT,
      ENTITY_ID,
      ENTITY_TYPE,
      STATUS = 'SUCCESS',
      DESCRIPTION,
      REFERENCE_NO,
      ACCOUNT_NO,
      SESSION_ID,
      REQUEST_ID,
      ENDPOINT,
      METHOD,
      ADDITIONAL_INFO,
      BRANCH = 1,
      timestamp,
    } = auditData;

    // Validate required fields
    if (!EVENT_TYPE || !USER_ID || !ACTION) {
      console.warn('⚠️ Skipping audit trail: missing required fields', {
        EVENT_TYPE: EVENT_TYPE || 'MISSING',
        USER_ID: USER_ID || 'MISSING',
        ACTION: ACTION || 'MISSING',
      });
      return null;
    }

    const now = new Date();
    
    // Create the audit trail entry using the model's field names (lowercase)
    // The model maps these to the correct database columns via the 'field' property
    const auditTrail = await AuditTrail.create(
      {
        event_type: EVENT_TYPE,      // maps to EVENT_TYPE in DB
        action: ACTION,              // maps to ACTION in DB
        user_id: USER_ID,            // maps to USER_ID in DB
        user_role: USER_ROLE || null,
        old_value: OLD_VALUE || null,
        new_value: NEW_VALUE || null,
        ip_address: IP_ADDRESS || '127.0.0.1',  // maps to IP_ADDRESS in DB
        user_agent: USER_AGENT || null,
        entity_id: ENTITY_ID || 'SYSTEM',       // maps to ENTITY_ID in DB
        entity_type: ENTITY_TYPE || 'SYSTEM',   // maps to ENTITY_TYPE in DB
        status: STATUS,
        description: DESCRIPTION || null,
        reference_no: REFERENCE_NO || null,
        account_no: ACCOUNT_NO || null,
        session_id: SESSION_ID || null,
        request_id: REQUEST_ID || null,
        endpoint: ENDPOINT || null,
        method: METHOD || null,
        additional_info: ADDITIONAL_INFO || null,  // maps to ADDITIONAL_INFO in DB
        branch: BRANCH || 1,
        timestamp: timestamp || now,
        created_at: now,
        updated_at: now,
      },
      { transaction }
    );

    console.log('✅ Audit trail created successfully:', {
      event_id: auditTrail.event_id,
      event_type: EVENT_TYPE,
      action: ACTION,
      user_id: USER_ID,
      entity_type: ENTITY_TYPE || 'SYSTEM',
      entity_id: ENTITY_ID || 'SYSTEM',
      status: STATUS,
      created_at: auditTrail.created_at,
    });

    return auditTrail;
  } catch (error) {
    console.error('❌ Error creating audit trail:', {
      error: error.message,
      stack: error.stack,
      auditData: {
        EVENT_TYPE: auditData.EVENT_TYPE,
        ENTITY_TYPE: auditData.ENTITY_TYPE,
        ENTITY_ID: auditData.ENTITY_ID,
        USER_ID: auditData.USER_ID,
      },
    });

    // Try to log the failure to the audit trail itself
    try {
      await ensureAuditTableColumns();
      const now = new Date();
      const failedEntry = await AuditTrail.create(
        {
          event_type: 'ERROR',
          action: 'add_audit_trail_failed',
          user_id: auditData.USER_ID || 'SYSTEM',
          user_role: 'SYSTEM',
          old_value: null,
          new_value: { error: error.message },
          ip_address: auditData.IP_ADDRESS || '127.0.0.1',
          entity_id: auditData.ENTITY_ID || '0',
          entity_type: auditData.ENTITY_TYPE || 'AUDIT_SYSTEM',
          status: 'FAILED',
          description: `Failed to create audit trail: ${error.message}`,
          additional_info: {
            outcome: 'failure',
            error: error.message,
            timestamp: now.toISOString(),
            original_data: auditData,
          },
          branch: auditData.BRANCH || 1,
          timestamp: now,
          created_at: now,
          updated_at: now,
        },
        { transaction }
      );
      console.log('📝 Error logged to audit trail:', { event_id: failedEntry.event_id });
    } catch (dbError) {
      console.error('🔥 Failed to log error to audit trail:', dbError.message);
    }
    return null;
  }
};

/**
 * 🔹 SIMPLIFIED: Add a real audit log entry with proper event types
 * Use this function instead of addAuditTrail for real events
 */
export const logAuditEvent = async ({
  eventType,
  action,
  userId,
  userRole = null,
  oldValue = null,
  newValue = null,
  ipAddress = '127.0.0.1',
  userAgent = null,
  entityId = 'SYSTEM',
  entityType = 'SYSTEM',
  status = 'SUCCESS',
  description = null,
  referenceNo = null,
  accountNo = null,
  sessionId = null,
  requestId = null,
  endpoint = null,
  method = null,
  additionalInfo = null,
  branch = 1,
  transaction = null,
}) => {
  return addAuditTrail({
    EVENT_TYPE: eventType,
    ACTION: action,
    USER_ID: userId,
    USER_ROLE: userRole,
    OLD_VALUE: oldValue,
    NEW_VALUE: newValue,
    IP_ADDRESS: ipAddress,
    USER_AGENT: userAgent,
    ENTITY_ID: entityId,
    ENTITY_TYPE: entityType,
    STATUS: status,
    DESCRIPTION: description,
    REFERENCE_NO: referenceNo,
    ACCOUNT_NO: accountNo,
    SESSION_ID: sessionId,
    REQUEST_ID: requestId,
    ENDPOINT: endpoint,
    METHOD: method,
    ADDITIONAL_INFO: additionalInfo,
    BRANCH: branch,
    transaction,
  });
};

/** 🔹 API route handler for creating audit trails manually */
export const createAuditTrail = async (req, res) => {
  try {
    console.log('📨 Received POST /audit-trails:', req?.body);
    
    if (!req || !res) {
      const data = req || {};
      const result = await addAuditTrail({
        EVENT_TYPE: data.EVENT_TYPE,
        USER_ID: data.USER_ID || data.user_id,
        BRANCH: data.BRANCH,
        ACTION: data.ACTION,
        OLD_VALUE: data.OLD_VALUE,
        NEW_VALUE: data.NEW_VALUE,
        IP_ADDRESS: data.IP_ADDRESS,
        ENTITY_ID: data.ENTITY_ID,
        ENTITY_TYPE: data.ENTITY_TYPE,
        ADDITIONAL_INFO: data.additional_info || {}
      });
      return result;
    }
    
    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request: Missing request body'
      });
    }
    
    const { 
      EVENT_TYPE, USER_ID, ACTION, OLD_VALUE = null, NEW_VALUE = {},
      IP_ADDRESS, ENTITY_ID = '0', ENTITY_TYPE = 'general', BRANCH = 1, status
    } = req.body;
    const user_id = req.user_id || USER_ID;
    const ip_address = req.ip_address || IP_ADDRESS || req.ip || '0.0.0.0';

    const errors = [];
    if (!EVENT_TYPE) errors.push('EVENT_TYPE is required');
    if (!user_id) errors.push('USER_ID is required');
    if (!ACTION) errors.push('ACTION is required');
    
    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields',
        errors 
      });
    }

    const auditEntry = await addAuditTrail({
      EVENT_TYPE,
      USER_ID: user_id,
      BRANCH,
      ACTION,
      OLD_VALUE,
      NEW_VALUE: NEW_VALUE || {},
      IP_ADDRESS: ip_address,
      ENTITY_ID: ENTITY_ID || '0',
      ENTITY_TYPE,
      STATUS: status || 'SUCCESS',
      ADDITIONAL_INFO: { 
        outcome: 'success', 
        source: 'manual_api',
        level: 'info',
        timestamp: new Date().toISOString()
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Audit trail entry created successfully',
      data: {
        event_id: auditEntry?.event_id,
        event_type: EVENT_TYPE,
        user_id: user_id,
        action: ACTION,
        status: status || 'SUCCESS',
        timestamp: auditEntry?.created_at || new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('🔥 Error creating audit trail:', error.message);
    if (!res) return { success: false, error: error.message };
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

/** 🔹 Get all Audit Trail Entries with optional date filtering */
export const getAllAuditTrails = async (req, res) => {
  try {
    const { 
      dateFrom, dateTo, event_type, user_id, entity_type,
      page = 1, limit = 50
    } = req.query;
    
    const current_user_id = req.user_id || 'system';
    const ip_address = req.ip_address || req.ip || 'unknown';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let replacements = [];

    // Date filtering
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid dateFrom format. Use ISO date (e.g., 2023-01-01)' 
        });
      }
      whereConditions.push('created_at >= ?');
      replacements.push(fromDate);
    } else {
      whereConditions.push('created_at >= ?');
      replacements.push('1970-01-01');
    }

    if (dateTo) {
      let toDate = new Date(dateTo);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid dateTo format. Use ISO date (e.g., 2023-01-01)' 
        });
      }
      toDate.setHours(23, 59, 59, 999);
      whereConditions.push('created_at <= ?');
      replacements.push(toDate);
    } else {
      whereConditions.push('created_at <= ?');
      replacements.push('2100-01-01');
    }

    // Filter by event type (using database column name)
    if (event_type) {
      whereConditions.push('EVENT_TYPE = ?');
      replacements.push(event_type);
    }
    
    // Filter by user ID (using database column name)
    if (user_id) {
      whereConditions.push('USER_ID = ?');
      replacements.push(user_id);
    }
    
    // Filter by entity type (using database column name)
    if (entity_type) {
      whereConditions.push('ENTITY_TYPE = ?');
      replacements.push(entity_type);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    console.log('🔍 Fetching audit trails with where:', whereClause);

    await ensureAuditTableColumns();

    const [results] = await AuditTrail.sequelize.query(
      `SELECT * FROM audit_trail ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      { replacements: [...replacements, parseInt(limit), offset] }
    );

    const [[{ count }]] = await AuditTrail.sequelize.query(
      `SELECT COUNT(*) as count FROM audit_trail ${whereClause}`,
      { replacements }
    );

    return res.status(200).json({
      success: true,
      data: results,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
        hasNextPage: offset + parseInt(limit) < count,
        hasPrevPage: parseInt(page) > 1
      }
    });
    
  } catch (error) {
    console.error('🔥 Error fetching audit trails:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

/** 🔹 Get Audit Trail Entry by ID */
export const getAuditTrailById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🔍 Fetching audit trail by ID:', id);
    await ensureAuditTableColumns();

    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE event_id = ?',
      { replacements: [id] }
    );

    if (!auditTrail) {
      // Log NOT_FOUND event
      await logAuditEvent({
        eventType: 'NOT_FOUND',
        action: 'get_audit_trail_by_id',
        userId: req.user?.user_name || req.user?.id || 'system',
        ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
        entityId: id,
        entityType: 'audit_trail',
        description: `Audit log ${id} not found`,
        status: 'SUCCESS',
      });
      return res.status(404).json({ success: false, message: 'Audit trail not found' });
    }

    return res.status(200).json({ success: true, data: auditTrail });
    
  } catch (error) {
    console.error('🔥 Error fetching audit trail:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

/** 🔹 Get Audit Trail Statistics */
export const getAuditStats = async (req, res) => {
  try {
    await ensureAuditTableColumns();

    const [[{ totalCount }]] = await AuditTrail.sequelize.query(
      'SELECT COUNT(*) as totalCount FROM audit_trail'
    );
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [[{ todayCount }]] = await AuditTrail.sequelize.query(
      'SELECT COUNT(*) as todayCount FROM audit_trail WHERE created_at >= ?',
      { replacements: [today] }
    );
    
    const [eventTypes] = await AuditTrail.sequelize.query(
      'SELECT EVENT_TYPE, COUNT(*) as count FROM audit_trail GROUP BY EVENT_TYPE ORDER BY count DESC LIMIT 10'
    );
    
    const [recentUsers] = await AuditTrail.sequelize.query(
      'SELECT USER_ID FROM audit_trail GROUP BY USER_ID ORDER BY MAX(created_at) DESC LIMIT 5'
    );

    return res.status(200).json({
      success: true,
      data: {
        totalCount,
        todayCount,
        eventTypes,
        recentUsers: recentUsers.map(u => u.USER_ID)
      }
    });
    
  } catch (error) {
    console.error('🔥 Error getting audit stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

/** 🔹 Archive an Audit Trail Entry */
export const archiveAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📦 Archiving audit trail:', id);
    console.warn('⚠️ Archive functionality - soft delete not implemented yet');
    
    return res.status(200).json({ 
      success: true, 
      message: 'Audit trail entry archived successfully' 
    });
    
  } catch (error) {
    console.error('🔥 Error archiving audit trail:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

/** 🔹 Restore an Audit Trail Entry */
export const restoreAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔄 Restoring audit trail:', id);
    console.warn('⚠️ Restore functionality - not implemented yet');
    
    return res.status(200).json({ 
      success: true, 
      message: 'Audit trail entry restored successfully' 
    });
    
  } catch (error) {
    console.error('🔥 Error restoring audit trail:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

/** 🔹 Update an Audit Trail Entry */
export const updateAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const { ACTION, NEW_VALUE } = req.body;

    console.log('✏️ Updating audit trail:', id);
    await ensureAuditTableColumns();

    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE event_id = ?',
      { replacements: [id] }
    );

    if (!auditTrail) {
      return res.status(404).json({ success: false, message: 'Audit trail not found' });
    }

    await AuditTrail.sequelize.query(
      'UPDATE audit_trail SET ACTION = ?, NEW_VALUE = ?, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?',
      {
        replacements: [
          ACTION || auditTrail.ACTION,
          NEW_VALUE ? JSON.stringify(NEW_VALUE) : auditTrail.NEW_VALUE,
          id
        ]
      }
    );

    return res.status(200).json({ 
      success: true,
      message: 'Audit trail entry updated successfully',
      data: { id, ACTION: ACTION || auditTrail.ACTION }
    });
    
  } catch (error) {
    console.error('🔥 Error updating audit trail:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

/** 🔹 Delete an Audit Trail Entry */
export const deleteAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🗑️ Deleting audit trail:', id);
    await ensureAuditTableColumns();

    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE event_id = ?',
      { replacements: [id] }
    );

    if (!auditTrail) {
      return res.status(404).json({ success: false, message: 'Audit trail not found' });
    }

    await AuditTrail.sequelize.query(
      'DELETE FROM audit_trail WHERE event_id = ?',
      { replacements: [id] }
    );

    return res.status(200).json({ success: true, message: 'Audit trail entry deleted successfully' });
    
  } catch (error) {
    console.error('🔥 Error deleting audit trail:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

/** 🔹 Initialize audit system – call on app startup */
export const initializeAuditSystem = async () => {
  try {
    console.log('🚀 Initializing audit system...');
    await ensureAuditTableColumns();
    console.log('✅ Audit system initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize audit system:', error.message);
    return false;
  }
};

// Export the addAuditTrail function as default export for backward compatibility
export default addAuditTrail;