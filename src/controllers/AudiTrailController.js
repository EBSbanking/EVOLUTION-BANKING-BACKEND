import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';  // General ops logger
import auditLogger from '../utils/AuditLogger.js';  // Hybrid audit logger (file + DB)
import Branch from '../models/Branch.js';
import { Op } from 'sequelize';

// Function to check and add missing columns to audit_trail table
const ensureAuditTableColumns = async (transaction = null) => {
  try {
    console.log('🔍 Checking audit_trail table structure...');
    
    // Check if created_at column exists
    const [createdAtCheck] = await AuditTrail.sequelize.query(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'audit_trail' 
       AND COLUMN_NAME = 'created_at'`,
      { transaction }
    );
    
    if (createdAtCheck[0].count === 0) {
      console.log('➕ Adding created_at column to audit_trail table...');
      await AuditTrail.sequelize.query(
        `ALTER TABLE audit_trail 
         ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
        { transaction }
      );
      console.log('✅ created_at column added successfully');
    }
    
    // Check if updated_at column exists
    const [updatedAtCheck] = await AuditTrail.sequelize.query(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'audit_trail' 
       AND COLUMN_NAME = 'updated_at'`,
      { transaction }
    );
    
    if (updatedAtCheck[0].count === 0) {
      console.log('➕ Adding updated_at column to audit_trail table...');
      await AuditTrail.sequelize.query(
        `ALTER TABLE audit_trail 
         ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
        { transaction }
      );
      console.log('✅ updated_at column added successfully');
    }
    
    console.log('✅ Audit trail table structure verified');
    return true;
  } catch (error) {
    console.error('❌ Error checking/updating audit trail table structure:', error.message);
    return false;
  }
};

/** 🔹 Service function for internal use (no req/res) – Now hybrid via auditLogger */
// Update ONLY the addAuditTrail function in your controller:
export const addAuditTrail = async ({
  EVENT_TYPE,
  USER_ID,
  BRANCH,
  ACTION,
  OLD_VALUE,
  NEW_VALUE,
  IP_ADDRESS,
  ENTITY_ID,
  ENTITY_TYPE,
  transaction,  // Optional: For transactions
  additional_info = {},  // New: For extras like outcome, details
}) => {
  try {
    console.log('📝 Adding audit trail:', { EVENT_TYPE, USER_ID });
    
    if (!EVENT_TYPE || !USER_ID) {
      console.log('⚠️ Skipping audit trail: missing EVENT_TYPE or USER_ID', {
        EVENT_TYPE,
        USER_ID,
      });
      return null;
    }

    // 🔥 REMOVE event_id generation - Let the database auto-generate it
    // const event_id = `AUDIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Provide defaults for required fields
    const entity_id = ENTITY_ID || '0';  // Default to '0' instead of null
    const new_value = NEW_VALUE || {};   // Default to empty object instead of null
    const old_value = OLD_VALUE || null;  // old_value can be null
    const timestamp = new Date();
    const now = new Date();

    console.log('📤 Creating audit entry with defaults...');

    // Use raw SQL to match your exact table structure
    // 🔥 REMOVE event_id from the INSERT statement
    const [result] = await AuditTrail.sequelize.query(
      `INSERT INTO audit_trail (
        USER_ID, EVENT_TYPE, ACTION, OLD_VALUE, NEW_VALUE,
        IP_ADDRESS, timestamp, ENTITY_TYPE, ENTITY_ID, status, ADDITIONAL_INFO, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      {
        replacements: [
          USER_ID,
          EVENT_TYPE,
          ACTION || 'Unknown Action',
          old_value ? JSON.stringify(old_value) : null,
          JSON.stringify(new_value),
          IP_ADDRESS || '0.0.0.0',
          timestamp,
          ENTITY_TYPE || 'general',
          entity_id,
          'SUCCESS',
          JSON.stringify({
            ...additional_info,
            source: additional_info.source || 'direct_api',
            timestamp: timestamp.toISOString()
          }),
          now,  // created_at
          now   // updated_at
        ],
        transaction
      }
    );

    // Get the auto-generated event_id from the insert result
    const event_id = result.insertId;
    
    console.log('🎉 Audit trail entry created:', { event_id, EVENT_TYPE, USER_ID });
    
    // Try to use auditLogger (fire and forget)
    try {
      auditLogger.info('Audit Event', {
        entity_type: ENTITY_TYPE || 'general',
        entity_id: entity_id,
        user_id: USER_ID,
        branch: BRANCH || 1,
        action: ACTION || 'Unknown Action',
        old_value: old_value,
        new_value: new_value,
        ip_address: IP_ADDRESS || '0.0.0.0',
        event_type: EVENT_TYPE,
        ...additional_info
      }, (err, result) => {
        if (err) {
          console.error('❌ auditLogger callback error:', err);
        } else {
          console.log('✅ auditLogger callback result:', result);
        }
      });
    } catch (logError) {
      console.warn('⚠️ auditLogger failed, continuing anyway:', logError.message);
    }
    
    return { 
      event_id,
      USER_ID,
      EVENT_TYPE,
      ACTION: ACTION || 'Unknown Action',
      created_at: now,
      updated_at: now
    };
    
  } catch (error) {
    console.log('🔥 Error creating audit trail:', error.message);
    
    // Self-audit the failure using raw query
    try {
      const timestamp = new Date();
      // 🔥 REMOVE string event_id generation for error too
      // const errorEventId = `ERROR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();
      
      // 🔥 Ensure audit table has required columns before error logging
      await ensureAuditTableColumns();
      
      // 🔥 REMOVE event_id from error INSERT too
      const [errorResult] = await AuditTrail.sequelize.query(
        `INSERT INTO audit_trail (
          USER_ID, EVENT_TYPE, ACTION, OLD_VALUE, NEW_VALUE,
          IP_ADDRESS, timestamp, ENTITY_TYPE, ENTITY_ID, status, ADDITIONAL_INFO,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        {
          replacements: [
            USER_ID || 'system',
            'ERROR',
            'add_audit_trail',
            null,
            JSON.stringify({ error: error.message }),
            IP_ADDRESS || 'unknown',
            timestamp,
            'audit_system',
            '0',
            'FAILURE',
            JSON.stringify({
              outcome: 'failure',
              error: error.message,
              timestamp: timestamp.toISOString()
            }),
            now,
            now
          ]
        }
      );
      
      const errorEventId = errorResult.insertId;
      console.log('📝 Error logged to audit trail:', { event_id: errorEventId });
    } catch (dbError) {
      console.error('🔥 Failed to log error to audit trail:', dbError.message);
    }
    throw error;
  }
};

/** 🔹 API route handler for creating audit trails manually */
export const createAuditTrail = async (req, res) => {
  try {
    console.log('📨 Received POST /audit-trails:', req.body);
    
    // 🔥 FIX: Add null check for req.body
    if (!req || !req.body) {
      console.error('Invalid request or missing body in createAuditTrail');
      return res.status(400).json({
        success: false,
        message: 'Invalid request: Missing request body'
      });
    }
    
    const { 
      EVENT_TYPE, 
      USER_ID, 
      ACTION, 
      OLD_VALUE = null, 
      NEW_VALUE = {},  // Default to empty object
      IP_ADDRESS, 
      ENTITY_ID = '0',  // Default to '0' instead of undefined
      ENTITY_TYPE = 'general',
      BRANCH = 1,
      status
    } = req.body || {};
    
    const user_id = req.user_id || USER_ID;  // From middleware or body
    const ip_address = req.ip_address || IP_ADDRESS || req.ip || '0.0.0.0';

    console.log('🔍 Validating fields:', {
      EVENT_TYPE, user_id, ACTION, NEW_VALUE, ip_address
    });

    // Validate required fields
    const errors = [];
    if (!EVENT_TYPE) errors.push('EVENT_TYPE is required');
    if (!user_id) errors.push('USER_ID is required');
    if (!ACTION) errors.push('ACTION is required');
    
    if (errors.length > 0) {
      console.log('❌ Validation failed:', errors);
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields',
        errors 
      });
    }

    console.log('🚀 Calling addAuditTrail...');

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

    console.log('✅ Audit created successfully:', auditEntry?.event_id);

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
      dateFrom, 
      dateTo, 
      event_type, 
      user_id, 
      entity_type,
      page = 1,
      limit = 50
    } = req.query;
    
    const current_user_id = req.user_id || 'system';
    const ip_address = req.ip_address || req.ip || 'unknown';

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE conditions
    let whereConditions = [];
    let replacements = [];

    // Validate and add dateFrom filter if provided
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

    // Validate and add dateTo filter if provided
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

    // Additional filters
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

    // 🔥 Ensure audit table has required columns before querying
    await ensureAuditTableColumns();

    // Get results with pagination
    const [results] = await AuditTrail.sequelize.query(
      `SELECT * FROM audit_trail ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      {
        replacements: [...replacements, parseInt(limit), offset]
      }
    );

    // Get total count
    const [[{ count }]] = await AuditTrail.sequelize.query(
      `SELECT COUNT(*) as count FROM audit_trail ${whereClause}`,
      {
        replacements: replacements
      }
    );

    // Self-audit the query
    await addAuditTrail({
      EVENT_TYPE: 'QUERY',
      USER_ID: current_user_id,
      ACTION: 'get_all_audit_trails',
      OLD_VALUE: null,
      NEW_VALUE: { 
        count, 
        filters: { dateFrom, dateTo, event_type, user_id, entity_type, page, limit } 
      },
      IP_ADDRESS: ip_address,
      ENTITY_ID: '0',
      ENTITY_TYPE: 'audit_trail_list',
      additional_info: { outcome: 'success' }
    });

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

    // 🔥 Ensure audit table has required columns before querying
    await ensureAuditTableColumns();

    // Get audit trail by ID using raw query
    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE id = ?',
      {
        replacements: [id]
      }
    );

    if (!auditTrail) {
      console.log('❌ Audit trail not found:', id);
      
      // Log the not-found event
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
      
      return res.status(404).json({ 
        success: false,
        message: 'Audit trail not found' 
      });
    }

    await addAuditTrail({
      EVENT_TYPE: 'QUERY',
      USER_ID: user_id,
      ACTION: 'get_audit_trail_by_id',
      OLD_VALUE: null,
      NEW_VALUE: { event_id: auditTrail.event_id, id: auditTrail.id },
      IP_ADDRESS: ip_address,
      ENTITY_ID: id,
      ENTITY_TYPE: 'audit_trail',
      additional_info: { outcome: 'success' }
    });

    return res.status(200).json({
      success: true,
      data: auditTrail
    });
    
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

    // 🔥 Ensure audit table has required columns before querying
    await ensureAuditTableColumns();

    // Get total count
    const [[{ totalCount }]] = await AuditTrail.sequelize.query(
      'SELECT COUNT(*) as totalCount FROM audit_trail'
    );
    
    // Get today's count (using created_at column)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [[{ todayCount }]] = await AuditTrail.sequelize.query(
      'SELECT COUNT(*) as todayCount FROM audit_trail WHERE created_at >= ?',
      {
        replacements: [today]
      }
    );
    
    // Get event type distribution
    const [eventTypes] = await AuditTrail.sequelize.query(
      'SELECT EVENT_TYPE, COUNT(*) as count FROM audit_trail GROUP BY EVENT_TYPE ORDER BY count DESC LIMIT 10'
    );
    
    // Get recent users
    const [recentUsers] = await AuditTrail.sequelize.query(
      'SELECT USER_ID FROM audit_trail GROUP BY USER_ID ORDER BY MAX(created_at) DESC LIMIT 5'
    );

    // Self-audit
    await addAuditTrail({
      EVENT_TYPE: 'QUERY',
      USER_ID: user_id,
      ACTION: 'get_audit_stats',
      OLD_VALUE: null,
      NEW_VALUE: { 
        totalCount, 
        todayCount,
        eventTypesCount: eventTypes.length
      },
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

    // 🔥 Ensure audit table has required columns before querying
    await ensureAuditTableColumns();

    // Check if audit trail exists
    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE id = ?',
      {
        replacements: [id]
      }
    );

    if (!auditTrail) {
      console.log('❌ Audit trail not found:', id);
      
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
      
      return res.status(404).json({ 
        success: false,
        message: 'Audit trail not found' 
      });
    }

    // Update the audit trail to archived
    await AuditTrail.sequelize.query(
      'UPDATE audit_trail SET archived = 1 WHERE id = ?',
      {
        replacements: [id]
      }
    );

    // Self-audit success
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
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || req.ip || 'unknown';

    console.log('🔄 Restoring audit trail:', id);

    // 🔥 Ensure audit table has required columns before querying
    await ensureAuditTableColumns();

    // Check if audit trail exists
    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE id = ?',
      {
        replacements: [id]
      }
    );

    if (!auditTrail) {
      console.log('❌ Audit trail not found:', id);
      
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
      
      return res.status(404).json({ 
        success: false,
        message: 'Audit trail not found' 
      });
    }

    // Update the audit trail to unarchived
    await AuditTrail.sequelize.query(
      'UPDATE audit_trail SET archived = 0 WHERE id = ?',
      {
        replacements: [id]
      }
    );

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
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || req.ip || 'unknown';

    console.log('✏️ Updating audit trail:', id);

    // 🔥 Ensure audit table has required columns before querying
    await ensureAuditTableColumns();

    // Check if audit trail exists
    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE id = ?',
      {
        replacements: [id]
      }
    );

    if (!auditTrail) {
      console.log('❌ Audit trail not found:', id);
      
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
      
      return res.status(404).json({ 
        success: false,
        message: 'Audit trail not found' 
      });
    }

    const old_value = { 
      ACTION: auditTrail.ACTION, 
      NEW_VALUE: auditTrail.NEW_VALUE 
    };
    
    // Update the audit trail
    await AuditTrail.sequelize.query(
      'UPDATE audit_trail SET ACTION = ?, NEW_VALUE = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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
      NEW_VALUE: { 
        ACTION: ACTION || auditTrail.ACTION, 
        NEW_VALUE: NEW_VALUE || auditTrail.NEW_VALUE,
        id 
      },
      IP_ADDRESS: ip_address,
      ENTITY_ID: id,
      ENTITY_TYPE: 'audit_trail',
      additional_info: { outcome: 'success' }
    });

    return res.status(200).json({ 
      success: true,
      message: 'Audit trail entry updated successfully',
      data: {
        id,
        ACTION: ACTION || auditTrail.ACTION
      }
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

    // 🔥 Ensure audit table has required columns before querying
    await ensureAuditTableColumns();

    // Check if audit trail exists
    const [[auditTrail]] = await AuditTrail.sequelize.query(
      'SELECT * FROM audit_trail WHERE id = ?',
      {
        replacements: [id]
      }
    );

    if (!auditTrail) {
      console.log('❌ Audit trail not found:', id);
      
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
      
      return res.status(404).json({ 
        success: false,
        message: 'Audit trail not found' 
      });
    }

    const old_value = { event_id: auditTrail.event_id };
    
    // Delete the audit trail
    await AuditTrail.sequelize.query(
      'DELETE FROM audit_trail WHERE id = ?',
      {
        replacements: [id]
      }
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

    return res.status(200).json({ 
      success: true,
      message: 'Audit trail entry deleted successfully'
    });
    
  } catch (error) {
    console.error('🔥 Error deleting audit trail:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

// 🔥 Add an initialization function to call on app startup
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