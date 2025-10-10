import mongoose from 'mongoose';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';

// 🔹 Generate a sequential event_id
const generateEventID = async () => {
  const lastEvent = await AuditTrail.findOne().sort({ event_id: -1 });
  return lastEvent ? lastEvent.event_id + 1 : 1;
};

/** * 🔹 Service function for internal use (no req/res) */
export const addAuditTrail = async ({
  EVENT_TYPE,
  USER_ID,
  ACTION,
  OLD_VALUE,
  NEW_VALUE,
  IP_ADDRESS,
  ENTITY_ID,
  ENTITY_TYPE,
  session,
}) => {
  try {
    if (!EVENT_TYPE || !USER_ID) {
      logger.warn('Skipping audit trail: missing EVENT_TYPE or USER_ID', {
        EVENT_TYPE,
        USER_ID,
      });
      return null;
    }

    const event_id = await generateEventID();

    const auditEntry = new AuditTrail({
      event_id,
      user_id: USER_ID,
      event_type: EVENT_TYPE,
      action: ACTION,
      old_value: OLD_VALUE,
      new_value: NEW_VALUE,
      ip_address: IP_ADDRESS,
      entity_id: ENTITY_ID,
      entity_type: ENTITY_TYPE,
      created_at: new Date(),
    });

    await auditEntry.save({ session });

    logger.info('Audit trail entry created', { event_id, EVENT_TYPE, USER_ID });
    return auditEntry;
  } catch (error) {
    logger.error('Error creating audit trail', { error: error.message });
    throw error;
  }
};

/** * 🔹 API route handler for creating audit trails manually */
export const createAuditTrail = async (req, res) => {
  try {
    const { EVENT_TYPE, USER_ID, ACTION, OLD_VALUE, NEW_VALUE, IP_ADDRESS } =
      req.body;

    if (
      !EVENT_TYPE ||
      !USER_ID ||
      !ACTION ||
      !NEW_VALUE ||
      !IP_ADDRESS
    ) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const event_id = await generateEventID();

    const auditEntry = new AuditTrail({
      event_id,
      user_id: USER_ID,
      event_type: EVENT_TYPE,
      action: ACTION,
      old_value: OLD_VALUE,
      new_value: NEW_VALUE,
      ip_address: IP_ADDRESS,
      created_at: new Date(),
    });

    await auditEntry.save();

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

/** * 🔹 Archive an Audit Trail Entry */
export const archiveAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;

    const auditTrail = await AuditTrail.findById(id);

    if (!auditTrail) {
      return res.status(404).json({ message: 'Audit trail not found' });
    }

    auditTrail.archived = true;
    await auditTrail.save();

    return res.status(200).json({ message: 'Audit trail entry archived' });
  } catch (error) {
    console.error('Error archiving audit trail:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/** * 🔹 Restore an Audit Trail Entry */
export const restoreAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;

    const auditTrail = await AuditTrail.findById(id);

    if (!auditTrail) {
      return res.status(404).json({ message: 'Audit trail not found' });
    }

    auditTrail.archived = false;
    await auditTrail.save();

    return res.status(200).json({ message: 'Audit trail entry restored' });
  } catch (error) {
    console.error('Error restoring audit trail:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/** * 🔹 Get all Audit Trail Entries with optional date filtering */
export const getAllAuditTrails = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

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

    return res.status(200).json(auditTrails);
  } catch (error) {
    console.error('Error fetching audit trails:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/** * 🔹 Get Audit Trail Entry by ID */
export const getAuditTrailById = async (req, res) => {
  try {
    const { id } = req.params;

    const auditTrail = await AuditTrail.findById(id);

    if (!auditTrail) {
      return res.status(404).json({ message: 'Audit trail not found' });
    }

    return res.status(200).json(auditTrail);
  } catch (error) {
    console.error('Error fetching audit trail:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/** * 🔹 Update an Audit Trail Entry */
export const updateAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const { ACTION, NEW_VALUE } = req.body;

    const auditTrail = await AuditTrail.findById(id);

    if (!auditTrail) {
      return res.status(404).json({ message: 'Audit trail not found' });
    }

    auditTrail.action = ACTION || auditTrail.action;
    auditTrail.new_value = NEW_VALUE || auditTrail.new_value;

    await auditTrail.save();

    return res.status(200).json({ message: 'Audit trail entry updated' });
  } catch (error) {
    console.error('Error updating audit trail:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/** * 🔹 Delete an Audit Trail Entry */
export const deleteAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;

    const auditTrail = await AuditTrail.findById(id);

    if (!auditTrail) {
      return res.status(404).json({ message: 'Audit trail not found' });
    }

    await auditTrail.deleteOne();

    return res.status(200).json({ message: 'Audit trail entry deleted' });
  } catch (error) {
    console.error('Error deleting audit trail:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};