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

export default logAuditTrail;
