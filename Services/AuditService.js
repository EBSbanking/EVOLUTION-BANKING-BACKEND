// services/auditService.js
import { AuditTrail } from '../models/AuditTrail.js';

export const logAuditEvent = async (eventType, eventId, userId, action, oldValue, newValue, ipAddress) => {
  try {
    await AuditTrail.create({
      EVENT_TYPE: eventType,
      EVENT_ID: eventId,
      USER_ID: userId,
      ACTION: action,
      OLD_VALUE: oldValue,
      NEW_VALUE: newValue,
      ipAddress: ipAddress,
    });
    console.log('Audit log created successfully');
  } catch (error) {
    console.error('Error logging audit event:', error);
  }
};
