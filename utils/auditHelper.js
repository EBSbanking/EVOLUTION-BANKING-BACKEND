// utils/auditHelper.js
import auditLogger from './AuditLogger.js';

export const logAuditTrail = async (
  entity_type,
  entity_id,
  user_id,
  action,
  old_value,
  new_value,
  ip_address,
  event_type = 'GENERAL',
  additional_info = null
) => {
  return new Promise((resolve, reject) => {
    auditLogger.info('Audit Event', {
      entity_type,
      entity_id,
      user_id,
      action,
      old_value,
      new_value,
      ip_address,
      event_type,
      ...additional_info
    }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

export default logAuditTrail;