import AuditTrail from '../models/AuditTrail.js';

// Generate sequential event ID
export const generateEventID = async () => {
  const lastEvent = await AuditTrail.findOne().sort({ event_id: -1 });
  return lastEvent ? lastEvent.event_id + 1 : 1;
};

// Main audit logging function
export const logAuditTrail = async (
  entity_type,
  entity_id,
  user_id,
  action,
  old_value,
  new_value,
  ip_address,
  event_type = 'GENERAL',        // ✅ default required field
  additional_info = null
) => {
  try {
    const event_id = await generateEventID();

    const auditLog = new AuditTrail({
      event_id,
      entity_type,
      entity_id,
      user_id,
      action,
      old_value,
      new_value,
      ip_address,
      event_type,                   // ✅ now always set
      additional_info,
      timestamp: new Date(),
    });

    await auditLog.save();
    return auditLog;
  } catch (error) {
    console.error('❌ Error logging audit trail:', error);
    throw new Error(`Failed to log audit trail: ${error.message}`);
  }
};

export default { generateEventID, logAuditTrail };
