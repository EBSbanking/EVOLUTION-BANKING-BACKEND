// utils/auditLogger.js
import AuditTrail from '../models/AuditTrail.js';

// Generate a sequential event ID
export const generateEventID = async () => {
    const lastEvent = await AuditTrail.findOne().sort({ event_id: -1 });
    return lastEvent ? lastEvent.event_id + 1 : 1;
};

// Main audit logging function
export const logAuditTrail = async (EVENT_TYPE, EVENT_ID, USER_ID, ACTION, OLD_VALUE, NEW_VALUE, ipAddress) => {
  try {
    const auditEntry = new AuditTrail({
      EVENT_TYPE,
      EVENT_ID,
      USER_ID,
      ACTION,
      OLD_VALUE,
      NEW_VALUE,
      ipAddress
    });

    await auditEntry.save();
    console.log('Audit log recorded successfully.');
  } catch (error) {
    console.error('Error logging audit trail:', error);
  }
};

export default {
  generateEventID,
  logAuditTrail
};