// utils/auditHelper.js
import auditLogger from './AuditLogger.js';
// ✅ ALTERNATIVE - Proper Promise implementation
export const logAuditTrail = (
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
  return new Promise((resolve) => {
    try {
      auditLogger.info('Audit Event', {
        entity_type,
        entity_id,
        user_id,
        action,
        old_value,
        new_value,
        ip_address,
        event_type,
        ...additional_info,
        timestamp: new Date().toISOString()
      });
      
      resolve({ success: true, message: 'Audit logged successfully' });
    } catch (error) {
      console.error('Audit logging failed:', error);
      resolve({ success: false, error: error.message });
    }
  });
};

export default logAuditTrail;