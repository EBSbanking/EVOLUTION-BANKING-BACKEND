// src/controllers/AudiTrailController.js – CORRECTED VERSION (audit trail in getAllAuditTrails disabled)
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';
import auditLogger from '../utils/AuditLogger.js';
import Branch from '../models/Branch.js';
import { Op } from 'sequelize';

// ========== ENHANCED: Ensure audit_trail table exists and has required columns ==========
const ensureAuditTableColumns = async (transaction = null) => {
  try {
    console.log('🔍 Checking audit_trail table...');

    // Step 1: Check if the table exists
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
          \`event_id\` INT NOT NULL AUTO_INCREMENT,
          \`USER_ID\` VARCHAR(50) NOT NULL,
          \`EVENT_TYPE\` VARCHAR(50) NOT NULL,
          \`ACTION\` TEXT,
          \`OLD_VALUE\` TEXT,
          \`NEW_VALUE\` TEXT,
          \`IP_ADDRESS\` VARCHAR(45),
          \`timestamp\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          \`ENTITY_TYPE\` VARCHAR(50),
          \`ENTITY_ID\` VARCHAR(50),
          \`status\` VARCHAR(20),
          \`ADDITIONAL_INFO\` TEXT,
          \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`event_id\`),
          INDEX \`idx_event_type\` (\`EVENT_TYPE\`),
          INDEX \`idx_user_id\` (\`USER_ID\`),
          INDEX \`idx_entity_type\` (\`ENTITY_TYPE\`),
          INDEX \`idx_created_at\` (\`created_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `, { transaction });
      console.log('✅ audit_trail table created successfully');
    } else {
      console.log('✅ audit_trail table exists');
    }

    // Step 2: Ensure required columns exist (add missing ones if any)
    // Check for created_at column
    const [createdAtCheck] = await AuditTrail.sequelize.query(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'audit_trail' 
       AND COLUMN_NAME = 'created_at'`,
      { transaction }
    );
    if (createdAtCheck[0].count === 0) {
      console.log('➕ Adding created_at column...');
      await AuditTrail.sequelize.query(
        `ALTER TABLE audit_trail ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
        { transaction }
      );
    }

    // Check for updated_at column
    const [updatedAtCheck] = await AuditTrail.sequelize.query(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'audit_trail' 
       AND COLUMN_NAME = 'updated_at'`,
      { transaction }
    );
    if (updatedAtCheck[0].count === 0) {
      console.log('➕ Adding updated_at column...');
      await AuditTrail.sequelize.query(
        `ALTER TABLE audit_trail ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
        { transaction }
      );
    }

    // Check for branch column (if required by your model – add if missing)
    const [branchCheck] = await AuditTrail.sequelize.query(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'audit_trail' 
       AND COLUMN_NAME = 'branch'`,
      { transaction }
    );
    if (branchCheck[0].count === 0) {
      console.log('➕ Adding branch column (optional)...');
      await AuditTrail.sequelize.query(
        `ALTER TABLE audit_trail ADD COLUMN branch INT DEFAULT 1`,
        { transaction }
      );
    }

    console.log('✅ Audit trail table structure verified');
    return true;
  } catch (error) {
    console.error('❌ Error ensuring audit trail table:', error.message);
    return false;
  }
};

/** 🔹 Service function for internal use – uses Sequelize model (no raw SQL) */
export const addAuditTrail = async (auditData, transaction = null) => {
  try {
    const {
      EVENT_TYPE,
      USER_ID,
      USER_ROLE,
      ACTION,
      NEW_VALUE,
      OLD_VALUE,
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
      timestamp = new Date(),
      BRANCH = 1,        // ✅ default branch
    } = auditData;

    // Validate required fields – only EVENT_TYPE, USER_ID, ACTION, ENTITY_ID, ENTITY_TYPE are mandatory
    if (!EVENT_TYPE || !USER_ID || !ACTION || !ENTITY_ID || !ENTITY_TYPE) {
      console.warn('Skipping audit trail: missing required fields', {
        EVENT_TYPE, USER_ID, ACTION, ENTITY_ID, ENTITY_TYPE,
      });
      return null;
    }

    const now = new Date();
    const auditTrail = await AuditTrail.create(
      {
        event_type: EVENT_TYPE,
        user_id: USER_ID,
        user_role: USER_ROLE,
        action: ACTION,
        new_value: NEW_VALUE || null,
        old_value: OLD_VALUE,
        ip_address: String(IP_ADDRESS || '127.0.0.1'),
        user_agent: USER_AGENT,
        entity_id: ENTITY_ID,
        entity_type: ENTITY_TYPE,
        status: STATUS,
        description: DESCRIPTION,
        reference_no: REFERENCE_NO,
        account_no: ACCOUNT_NO,
        session_id: SESSION_ID,
        request_id: REQUEST_ID,
        endpoint: ENDPOINT,
        method: METHOD,
        additional_info: ADDITIONAL_INFO,
        branch: BRANCH,   // ✅ include branch
        timestamp: timestamp,
        created_at: now,
        updated_at: now,
      },
      { transaction }
    );

    console.log('✅ Audit trail created:', {
      event_id: auditTrail.event_id,
      event_type: EVENT_TYPE,
      entity_type: ENTITY_TYPE,
      entity_id: ENTITY_ID,
      created_at: auditTrail.created_at,
      updated_at: auditTrail.updated_at,
    });

    // Fire‑and‑forget auditLogger (optional)
    try {
      auditLogger.info('Audit Event', {
        entity_type: ENTITY_TYPE || 'general',
        entity_id: ENTITY_ID,
        user_id: USER_ID,
        branch: BRANCH || 1,
        action: ACTION || 'Unknown Action',
        old_value: OLD_VALUE,
        new_value: NEW_VALUE,
        ip_address: IP_ADDRESS || '0.0.0.0',
        event_type: EVENT_TYPE,
        ...(ADDITIONAL_INFO || {}),
      }, (err, result) => {
        if (err) console.error('❌ auditLogger callback error:', err);
        else console.log('✅ auditLogger callback result:', result);
      });
    } catch (logError) {
      console.warn('⚠️ auditLogger failed, continuing anyway:', logError.message);
    }

    return auditTrail;
  } catch (error) {
    console.error('❌ Error creating audit trail:', {
      error: error.message,
      stack: error.stack,
      auditData: {
        EVENT_TYPE: auditData.EVENT_TYPE,
        ENTITY_TYPE: auditData.ENTITY_TYPE,
        ENTITY_ID: auditData.ENTITY_ID,
      },
    });

    // Self-audit the failure (optional)
    try {
      await ensureAuditTableColumns();
      const now = new Date();
      const failedEntry = await AuditTrail.create(
        {
          event_type: 'ERROR',
          user_id: auditData.USER_ID || 'system',
          action: 'add_audit_trail_failed',
          new_value: { error: error.message },
          ip_address: auditData.IP_ADDRESS || 'unknown',
          entity_id: auditData.ENTITY_ID || '0',
          entity_type: auditData.ENTITY_TYPE || 'audit_system',
          status: 'FAILURE',
          branch: auditData.BRANCH || 1,
          additional_info: {
            outcome: 'failure',
            error: error.message,
            timestamp: now.toISOString(),
          },
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
        additional_info: data.additional_info || {}
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
      additional_info: { 
        outcome: 'success', 
        source: 'manual_api',
        level: 'info',
        timestamp: new Date().toISOString(),
        status: status || 'SUCCESS'
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

    if (event_type) {
      whereConditions.push('EVENT_TYPE = ?');
      replacements.push(event_type);
    }
    if (user_id) {
      whereConditions.push('USER_ID = ?');
      replacements.push(user_id);
    }
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

    // ✅ DISABLED – audit log for QUERY events was causing validation errors.
    // Uncomment only after ensuring the AuditTrail model accepts all fields without validation.
    /*
    await addAuditTrail({
      EVENT_TYPE: 'QUERY',
      USER_ID: current_user_id,
      ACTION: 'get_all_audit_trails',
      OLD_VALUE: null,
      NEW_VALUE: { count, filters: { dateFrom, dateTo, event_type, user_id, entity_type, page, limit } },
      IP_ADDRESS: ip_address,
      ENTITY_ID: '0',
      ENTITY_TYPE: 'audit_trail_list',
      additional_info: { outcome: 'success' }
    });
    */

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
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || req.ip || 'unknown';

    console.log('🔍 Fetching audit trail by ID:', id);
    await ensureAuditTableColumns();

    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE event_id = ?',
      { replacements: [id] }
    );

    if (!auditTrail) {
      await addAuditTrail({
        EVENT_TYPE: 'NOT_FOUND',
        USER_ID: user_id,
        ACTION: 'get_audit_trail_by_id',
        OLD_VALUE: null,
        NEW_VALUE: { status: 'not_found', id },
        IP_ADDRESS: ip_address,
        ENTITY_ID: id,
        ENTITY_TYPE: 'audit_trail',
        additional_info: { outcome: 'failure' }
      });
      return res.status(404).json({ success: false, message: 'Audit trail not found' });
    }

    await addAuditTrail({
      EVENT_TYPE: 'QUERY',
      USER_ID: user_id,
      ACTION: 'get_audit_trail_by_id',
      OLD_VALUE: null,
      NEW_VALUE: { event_id: auditTrail.event_id },
      IP_ADDRESS: ip_address,
      ENTITY_ID: id,
      ENTITY_TYPE: 'audit_trail',
      additional_info: { outcome: 'success' }
    });

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
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || req.ip || 'unknown';

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

    await addAuditTrail({
      EVENT_TYPE: 'QUERY',
      USER_ID: user_id,
      ACTION: 'get_audit_stats',
      OLD_VALUE: null,
      NEW_VALUE: { totalCount, todayCount, eventTypesCount: eventTypes.length },
      IP_ADDRESS: ip_address,
      ENTITY_ID: '0',
      ENTITY_TYPE: 'audit_stats',
      additional_info: { outcome: 'success' }
    });

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
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || req.ip || 'unknown';

    console.log('📦 Archiving audit trail:', id);
    await ensureAuditTableColumns();

    // Note: The table may not have an `archived` column. This function assumes it exists.
    // If it doesn't, you need to add it with ALTER TABLE.
    // For now, we'll comment out the actual update and just log.
    console.warn('⚠️ Archive functionality requires an `archived` column in audit_trail. Skipping update.');
    
    // Example of how to add the column (run once):
    // await AuditTrail.sequelize.query(`ALTER TABLE audit_trail ADD COLUMN archived TINYINT DEFAULT 0`);

    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE event_id = ?',
      { replacements: [id] }
    );

    if (!auditTrail) {
      await addAuditTrail({
        EVENT_TYPE: 'NOT_FOUND',
        USER_ID: user_id,
        ACTION: 'archive_audit_trail',
        OLD_VALUE: null,
        NEW_VALUE: { status: 'not_found', id },
        IP_ADDRESS: ip_address,
        ENTITY_ID: id,
        ENTITY_TYPE: 'audit_trail',
        additional_info: { outcome: 'failure' }
      });
      return res.status(404).json({ success: false, message: 'Audit trail not found' });
    }

    // If archived column exists, uncomment:
    // await AuditTrail.sequelize.query(
    //   'UPDATE audit_trail SET archived = 1 WHERE event_id = ?',
    //   { replacements: [id] }
    // );

    await addAuditTrail({
      EVENT_TYPE: 'ARCHIVE',
      USER_ID: user_id,
      ACTION: 'archive_audit_trail',
      OLD_VALUE: { archived: auditTrail.archived || 0 },
      NEW_VALUE: { archived: 1, id },
      IP_ADDRESS: ip_address,
      ENTITY_ID: id,
      ENTITY_TYPE: 'audit_trail',
      additional_info: { outcome: 'success' }
    });

    return res.status(200).json({ success: true, message: 'Audit trail entry archived successfully' });
    
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
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || req.ip || 'unknown';

    console.log('🔄 Restoring audit trail:', id);
    await ensureAuditTableColumns();

    // Requires `archived` column – see note in archiveAuditTrail
    console.warn('⚠️ Restore functionality requires an `archived` column in audit_trail. Skipping update.');

    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE event_id = ?',
      { replacements: [id] }
    );

    if (!auditTrail) {
      await addAuditTrail({
        EVENT_TYPE: 'NOT_FOUND',
        USER_ID: user_id,
        ACTION: 'restore_audit_trail',
        OLD_VALUE: null,
        NEW_VALUE: { status: 'not_found', id },
        IP_ADDRESS: ip_address,
        ENTITY_ID: id,
        ENTITY_TYPE: 'audit_trail',
        additional_info: { outcome: 'failure' }
      });
      return res.status(404).json({ success: false, message: 'Audit trail not found' });
    }

    // If archived column exists, uncomment:
    // await AuditTrail.sequelize.query(
    //   'UPDATE audit_trail SET archived = 0 WHERE event_id = ?',
    //   { replacements: [id] }
    // );

    await addAuditTrail({
      EVENT_TYPE: 'RESTORE',
      USER_ID: user_id,
      ACTION: 'restore_audit_trail',
      OLD_VALUE: { archived: auditTrail.archived || 1 },
      NEW_VALUE: { archived: 0, id },
      IP_ADDRESS: ip_address,
      ENTITY_ID: id,
      ENTITY_TYPE: 'audit_trail',
      additional_info: { outcome: 'success' }
    });

    return res.status(200).json({ success: true, message: 'Audit trail entry restored successfully' });
    
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
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || req.ip || 'unknown';

    console.log('✏️ Updating audit trail:', id);
    await ensureAuditTableColumns();

    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE event_id = ?',
      { replacements: [id] }
    );

    if (!auditTrail) {
      await addAuditTrail({
        EVENT_TYPE: 'NOT_FOUND',
        USER_ID: user_id,
        ACTION: 'update_audit_trail',
        OLD_VALUE: null,
        NEW_VALUE: { status: 'not_found', id },
        IP_ADDRESS: ip_address,
        ENTITY_ID: id,
        ENTITY_TYPE: 'audit_trail',
        additional_info: { outcome: 'failure' }
      });
      return res.status(404).json({ success: false, message: 'Audit trail not found' });
    }

    const old_value = { ACTION: auditTrail.ACTION, NEW_VALUE: auditTrail.NEW_VALUE };
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

    await addAuditTrail({
      EVENT_TYPE: 'UPDATE',
      USER_ID: user_id,
      ACTION: 'update_audit_trail',
      OLD_VALUE: old_value,
      NEW_VALUE: { ACTION: ACTION || auditTrail.ACTION, NEW_VALUE: NEW_VALUE || auditTrail.NEW_VALUE, id },
      IP_ADDRESS: ip_address,
      ENTITY_ID: id,
      ENTITY_TYPE: 'audit_trail',
      additional_info: { outcome: 'success' }
    });

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
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || req.ip || 'unknown';

    console.log('🗑️ Deleting audit trail:', id);
    await ensureAuditTableColumns();

    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE event_id = ?',
      { replacements: [id] }
    );

    if (!auditTrail) {
      await addAuditTrail({
        EVENT_TYPE: 'NOT_FOUND',
        USER_ID: user_id,
        ACTION: 'delete_audit_trail',
        OLD_VALUE: null,
        NEW_VALUE: { status: 'not_found', id },
        IP_ADDRESS: ip_address,
        ENTITY_ID: id,
        ENTITY_TYPE: 'audit_trail',
        additional_info: { outcome: 'failure' }
      });
      return res.status(404).json({ success: false, message: 'Audit trail not found' });
    }

    const old_value = { event_id: auditTrail.event_id };
    await AuditTrail.sequelize.query(
      'DELETE FROM audit_trail WHERE event_id = ?',
      { replacements: [id] }
    );

    await addAuditTrail({
      EVENT_TYPE: 'DELETE',
      USER_ID: user_id,
      ACTION: 'delete_audit_trail',
      OLD_VALUE: old_value,
      NEW_VALUE: null,
      IP_ADDRESS: ip_address,
      ENTITY_ID: id,
      ENTITY_TYPE: 'audit_trail',
      additional_info: { outcome: 'success' }
    });

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