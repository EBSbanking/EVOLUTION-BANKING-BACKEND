import mongoose from 'mongoose';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';  // General ops logger
import auditLogger from '../utils/AuditLogger.js';  // Hybrid audit logger (file + DB)
import Branch from '../models/Branch.js'

// 🔹 Generate a sequential event_id (kept for backward compat, but now internal to logAuditTrail)
const generateEventID = async () => {
  const lastEvent = await AuditTrail.findOne().sort({ event_id: -1 });
  return lastEvent ? lastEvent.event_id + 1 : 1;
};

/** 🔹 Service function for internal use (no req/res) – Now hybrid via auditLogger */
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
  session,  // Optional: For transactions
  additional_info = {},  // New: For extras like outcome, details
}) => {
  try {
    console.log('Adding audit trail:', {
      EVENT_TYPE,
      USER_ID, });
      
    if (!EVENT_TYPE || !USER_ID) {
      console.log('Skipping audit trail: missing EVENT_TYPE or USER_ID', {
        EVENT_TYPE,
        USER_ID,
      });
      return null;
    }

    // Log via hybrid (triggers DB save + file)
    const auditLogResult = await new Promise((resolve, reject) => {
      auditLogger.info('Audit Event', {
        entity_type: ENTITY_TYPE || 'general',
        entity_id: ENTITY_ID || null,
        user_id: USER_ID,
        branch:BRANCH,
        action: ACTION,
        old_value: OLD_VALUE,
        new_value: NEW_VALUE,
        ip_address: IP_ADDRESS,
        event_type: EVENT_TYPE,
        ...additional_info  // e.g., { outcome: 'success', details: {...} }
      }, (err, result) => {
        if (err) reject(err);
        else resolve(result);  // Returns enriched info with audit_db_id, event_id
      });
    });


    console.log('Audit log result:', auditLogResult);
    // Extract DB entry (from transport's enrichment)
    const event_id = auditLogResult.event_id;
    const auditEntry = await AuditTrail.findOne({ event_id }).session(session);  // Fetch for return (if needed)

    console.log('Audit trail entry created', { event_id, EVENT_TYPE, USER_ID });
    return auditEntry || { event_id, ...auditLogResult };  // Fallback to log info if fetch fails
  } catch (error) {
    console.log('Error creating audit trail', { error: error.message });
    // Self-audit the failure
    auditLogger.error('Audit Event', {
      entity_type: 'audit_system',
      entity_id: null,
      user_id: USER_ID || 'system',
      action: 'add_audit_trail',
      old_value: null,
      new_value: null,
      ip_address: IP_ADDRESS || 'unknown',
      event_type: 'ERROR',
      outcome: 'failure',
      error: error.message
    });
    throw error;
  }
};

/** 🔹 API route handler for creating audit trails manually – Now uses addAuditTrail */
export const createAuditTrail = async (req, res) => {
  try {
    const { 
      EVENT_TYPE, 
      USER_ID, 
      ACTION, 
      OLD_VALUE, 
      NEW_VALUE, 
      IP_ADDRESS, 
      ENTITY_ID, 
      ENTITY_TYPE 
    } = req.body;
    const user_id = req.user_id || USER_ID;  // From middleware or body
    const ip_address = req.ip_address || IP_ADDRESS;

    if (!EVENT_TYPE || !user_id || !ACTION || !NEW_VALUE || !ip_address) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const auditEntry = await addAuditTrail({
      EVENT_TYPE,
      USER_ID: user_id,
      ACTION,
      OLD_VALUE,
      NEW_VALUE,
      IP_ADDRESS: ip_address,
      ENTITY_ID,
      ENTITY_TYPE,
      additional_info: { outcome: 'success', source: 'manual_api' }
    });

    return res.status(201).json({
      message: 'Audit trail entry created',
      event: auditEntry,
    });
  } catch (error) {
    console.error('Error creating audit trail:', error);
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

/** 🔹 Archive an Audit Trail Entry – With self-audit */
export const archiveAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || 'unknown';

    const auditTrail = await AuditTrail.findById(id);

    if (!auditTrail) {
      // Self-audit the not-found
      auditLogger.info('Audit Event', {
        entity_type: 'audit_trail',
        entity_id: id,
        user_id,
        action: 'archive_audit_trail',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address,
        event_type: 'NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: 'Audit trail not found' });
    }

    const old_value = { archived: auditTrail.archived };
    auditTrail.archived = true;
    await auditTrail.save();

    // Self-audit success
    await addAuditTrail({
      EVENT_TYPE: 'ARCHIVE',
      USER_ID: user_id,
      ACTION: 'archive_audit_trail',
      OLD_VALUE: old_value,
      NEW_VALUE: { archived: true },
      IP_ADDRESS: ip_address,
      ENTITY_ID: id,
      ENTITY_TYPE: 'audit_trail',
      additional_info: { outcome: 'success' }
    });

    return res.status(200).json({ message: 'Audit trail entry archived' });
  } catch (error) {
    console.error('Error archiving audit trail:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/** 🔹 Restore an Audit Trail Entry – With self-audit */
export const restoreAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || 'unknown';

    const auditTrail = await AuditTrail.findById(id);

    if (!auditTrail) {
      auditLogger.info('Audit Event', {
        entity_type: 'audit_trail',
        entity_id: id,
        user_id,
        action: 'restore_audit_trail',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address,
        event_type: 'NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: 'Audit trail not found' });
    }

    const old_value = { archived: auditTrail.archived };
    auditTrail.archived = false;
    await auditTrail.save();

    await addAuditTrail({
      EVENT_TYPE: 'RESTORE',
      USER_ID: user_id,
      ACTION: 'restore_audit_trail',
      OLD_VALUE: old_value,
      NEW_VALUE: { archived: false },
      IP_ADDRESS: ip_address,
      ENTITY_ID: id,
      ENTITY_TYPE: 'audit_trail',
      additional_info: { outcome: 'success' }
    });

    return res.status(200).json({ message: 'Audit trail entry restored' });
  } catch (error) {
    console.error('Error restoring audit trail:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/** 🔹 Get all Audit Trail Entries with optional date filtering – With self-audit */
export const getAllAuditTrails = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || 'unknown';

    // Build query object
    const query = {};

    // Validate and add dateFrom filter if provided
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({ message: 'Invalid dateFrom format. Use ISO date (e.g., 2023-01-01)' });
      }
      query.created_at = { $gte: fromDate };
    }

    // Validate and add dateTo filter if provided
    if (dateTo) {
      let toDate = new Date(dateTo);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({ message: 'Invalid dateTo format. Use ISO date (e.g., 2023-01-01)' });
      }
      // Adjust to end of the day to include all records on that day
      toDate.setHours(23, 59, 59, 999);
      // If dateFrom is also provided, update the query; otherwise, initialize it
      if (query.created_at) {
        query.created_at.$lte = toDate;
      } else {
        query.created_at = { $lte: toDate };
      }
    }

    // Only fetch non-archived entries by default
    query.archived = { $ne: true };

    const auditTrails = await AuditTrail.find(query).sort({ created_at: -1 });

    // Self-audit the query (e.g., for access logs)
    await addAuditTrail({
      EVENT_TYPE: 'QUERY',
      USER_ID: user_id,
      ACTION: 'get_all_audit_trails',
      OLD_VALUE: null,
      NEW_VALUE: { count: auditTrails.length, filters: { dateFrom, dateTo } },
      IP_ADDRESS: ip_address,
      ENTITY_ID: null,
      ENTITY_TYPE: 'audit_trail_list',
      additional_info: { outcome: 'success' }
    });

    return res.status(200).json(auditTrails);
  } catch (error) {
    console.error('Error fetching audit trails:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/** 🔹 Get Audit Trail Entry by ID – With self-audit */
export const getAuditTrailById = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || 'unknown';

    const auditTrail = await AuditTrail.findById(id);

    if (!auditTrail) {
      auditLogger.info('Audit Event', {
        entity_type: 'audit_trail',
        entity_id: id,
        user_id,
        action: 'get_audit_trail_by_id',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address,
        event_type: 'NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: 'Audit trail not found' });
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

    return res.status(200).json(auditTrail);
  } catch (error) {
    console.error('Error fetching audit trail:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/** 🔹 Update an Audit Trail Entry – With self-audit */
export const updateAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const { ACTION, NEW_VALUE } = req.body;
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || 'unknown';

    const auditTrail = await AuditTrail.findById(id);

    if (!auditTrail) {
      auditLogger.info('Audit Event', {
        entity_type: 'audit_trail',
        entity_id: id,
        user_id,
        action: 'update_audit_trail',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address,
        event_type: 'NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: 'Audit trail not found' });
    }

    const old_value = { action: auditTrail.action, new_value: auditTrail.new_value };
    auditTrail.action = ACTION || auditTrail.action;
    auditTrail.new_value = NEW_VALUE || auditTrail.new_value;
    await auditTrail.save();

    await addAuditTrail({
      EVENT_TYPE: 'UPDATE',
      USER_ID: user_id,
      ACTION: 'update_audit_trail',
      OLD_VALUE: old_value,
      NEW_VALUE: { action: auditTrail.action, new_value: auditTrail.new_value },
      IP_ADDRESS: ip_address,
      ENTITY_ID: id,
      ENTITY_TYPE: 'audit_trail',
      additional_info: { outcome: 'success' }
    });

    return res.status(200).json({ message: 'Audit trail entry updated' });
  } catch (error) {
    console.error('Error updating audit trail:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/** 🔹 Delete an Audit Trail Entry – With self-audit */
export const deleteAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user_id || 'system';
    const ip_address = req.ip_address || 'unknown';

    const auditTrail = await AuditTrail.findById(id);

    if (!auditTrail) {
      auditLogger.info('Audit Event', {
        entity_type: 'audit_trail',
        entity_id: id,
        user_id,
        action: 'delete_audit_trail',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address,
        event_type: 'NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: 'Audit trail not found' });
    }

    const old_value = { event_id: auditTrail.event_id };
    await auditTrail.deleteOne();

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

    return res.status(200).json({ message: 'Audit trail entry deleted' });
  } catch (error) {
    console.error('Error deleting audit trail:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};