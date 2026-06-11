import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import sequelize from '../../config/db.js';

// Custom Transport for MySQL AuditTrail Integration
class AuditTrailTransport extends winston.Transport {
  constructor(opts = {}) {
    super(opts);
    this.level = opts.level || 'info';
    this.silent = opts.silent || false;
    this.dbInitialized = false;

    // Initialize table asynchronously
    this.initializeAuditTable().catch(() => {
      this.dbInitialized = false;
    });
  }

  async initializeAuditTable() {
    try {
      // FIXED: Change user_id from INT to VARCHAR to accept 'system'
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          event_id VARCHAR(50) UNIQUE,
          entity_type VARCHAR(100) NOT NULL,
          entity_id VARCHAR(100),
          branch INT DEFAULT 1,
          user_id VARCHAR(100) DEFAULT 'system',
          action VARCHAR(100) NOT NULL,
          old_value JSON,
          new_value JSON,
          ip_address VARCHAR(50),
          event_type VARCHAR(50) DEFAULT 'GENERAL',
          additional_info JSON,
          status VARCHAR(20) DEFAULT 'SUCCESS',
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_entity (entity_type, entity_id),
          INDEX idx_user (user_id(100)),
          INDEX idx_action (action),
          INDEX idx_created (created_at),
          INDEX idx_event_type (event_type),
          INDEX idx_branch (branch)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      console.log('✅ Audit logs table initialized successfully');
      this.dbInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize audit table:', error.message);
      this.dbInitialized = false;
    }
  }

  // Helper method to convert 'system' string to appropriate value
  normalizeUserId(userId) {
    if (userId === 'system' || userId === 'SYSTEM') {
      return 'system';
    }
    
    // If it's a number, keep as number
    if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
      return parseInt(userId);
    }
    
    // Default fallback
    return 'system';
  }

  async insertAuditLog(logData) {
    try {
      const event_id = `AUDIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const oldValueJson = logData.old_value ? JSON.stringify(logData.old_value) : null;
      const newValueJson = logData.new_value ? JSON.stringify(logData.new_value) : null;
      const additionalInfoJson = logData.additional_info ? JSON.stringify(logData.additional_info) : null;
      
      const normalizedUserId = this.normalizeUserId(logData.user_id);

      const [result] = await sequelize.query(
        `INSERT INTO audit_logs (
          event_id, entity_type, entity_id, branch, user_id, 
          action, old_value, new_value, ip_address, event_type, 
          additional_info, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        {
          replacements: [
            event_id,
            logData.entity_type,
            logData.entity_id || null,
            logData.branch || 1,
            normalizedUserId,
            logData.action,
            oldValueJson,
            newValueJson,
            logData.ip_address || '127.0.0.1',
            logData.event_type || 'GENERAL',
            additionalInfoJson,
            'SUCCESS'
          ],
        }
      );

      return {
        id: result.insertId || result.affectedRows,
        event_id,
        success: true,
      };
    } catch (error) {
      console.error('❌ MySQL audit insert error:', error.message);
      throw error;
    }
  }

  // FIXED: log method with better validation
  log(info, callback) {
    // Create a promise for the logging operation
    const logPromise = new Promise((resolve, reject) => {
      // ===== FIX: Better message validation =====
      // Instead of requiring exact 'Audit Event' message, check if required fields exist
      const hasRequiredFields = info && (
        info.entity_type || 
        info.action || 
        info.user_id ||
        // Also accept if it's a regular log message
        (info.message && typeof info.message === 'string')
      );
      
      // Skip validation for non-audit logs
      const isNonAuditLog = info.message && 
        (info.message !== 'Audit Event' && 
         !info.entity_type && 
         !info.action);
      
      if (!hasRequiredFields) {
        // For regular winston logs, just resolve without error
        if (callback) callback(null, info);
        resolve(info);
        return;
      }
      
      // For non-audit logs, just pass through
      if (isNonAuditLog) {
        if (callback) callback(null, info);
        resolve(info);
        return;
      }

      if (!this.dbInitialized) {
        console.warn('⚠️ Audit DB not ready — skipping log to MySQL');
        info.audit_db_skipped = true;
        info.audit_db_reason = 'Table not initialized';
        if (callback) callback(null, info);
        resolve(info);
        return;
      }

      const {
        entity_type,
        entity_id,
        branch = 1,
        user_id,
        action,
        old_value,
        new_value,
        ip_address = '127.0.0.1',
        event_type = 'GENERAL',
        ...additional_info
      } = info;

      if (!entity_type || !user_id || !action) {
        info.audit_validation_failed = true;
        info.audit_error = 'Missing required fields: entity_type, user_id, action';
        if (callback) callback(null, info);
        resolve(info);
        return;
      }

      // 5-second timeout for audit insert
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Audit log timeout')), 5000)
      );

      sequelize
        .authenticate()
        .then(() =>
          Promise.race([
            this.insertAuditLog({
              entity_type,
              entity_id,
              branch,
              user_id,
              action,
              old_value,
              new_value,
              ip_address,
              event_type,
              additional_info,
            }),
            timeout,
          ])
        )
        .then((result) => {
          if (result && result.success) {
            info.audit_db_id = result.id;
            info.event_id = result.event_id;
            info.audit_db_success = true;
          }
          if (callback) callback(null, info);
          resolve(info);
        })
        .catch((err) => {
          console.error('❌ Audit logging failed:', err.message);
          info.audit_db_skipped = true;
          info.audit_db_error = err.message;
          if (callback) callback(null, info);
          resolve(info);
        });
    });

    // Make sure we return a promise
    return logPromise;
  }
}

// Daily rotating file transport
const fileTransport = new DailyRotateFile({
  filename: 'logs/audit-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
});

// Create the logger
const auditLogger = winston.createLogger({
  level: 'info',
  transports: [
    fileTransport,
    new AuditTrailTransport({ level: 'info' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  // Add this to handle errors without crashing
  exitOnError: false,
});

// Safe audit log wrapper
export const safeAuditLog = async (auditData) => {
  return new Promise((resolve, reject) => {
    try {
      const result = auditLogger.info(auditData);
      
      // Check if result is a promise
      if (result && typeof result.then === 'function') {
        result.then(resolve).catch(reject);
      } else {
        resolve(result);
      }
    } catch (error) {
      console.error('Safe audit log error:', error);
      resolve(null); // Resolve instead of reject to prevent crashes
    }
  });
};

export const logAuditTrail = async (
  entity_type,
  entity_id,
  user_id,
  action,
  old_value,
  new_value,
  ip_address,
  event_type = 'GENERAL',
  additional_info = {}
) => {
  try {
    const result = await safeAuditLog({
      message: 'Audit Event',
      entity_type,
      entity_id,
      user_id,
      action,
      old_value,
      new_value,
      ip_address: ip_address || '127.0.0.1',
      event_type,
      branch: additional_info.branch || 1,
      ...additional_info,
    });
    return result;
  } catch (error) {
    console.error('Audit log failed:', error);
    return null; // Return null instead of throwing
  }
};

export const logAuditTrailWithBranch = async (
  entity_type,
  entity_id,
  user_id,
  action,
  old_value,
  new_value,
  ip_address,
  event_type = 'GENERAL',
  branch = 1,
  additional_info = {}
) => {
  try {
    const result = await safeAuditLog({
      message: 'Audit Event',
      entity_type,
      entity_id,
      user_id,
      action,
      old_value,
      new_value,
      ip_address: ip_address || '127.0.0.1',
      event_type,
      branch,
      ...additional_info,
    });
    return result;
  } catch (error) {
    console.error('Audit log failed:', error);
    return null;
  }
};

export const isAuditReady = () => {
  const transport = auditLogger.transports.find((t) => t instanceof AuditTrailTransport);
  return transport && transport.dbInitialized;
};

export const insertAuditLog = async (auditData) => {
  const transport = auditLogger.transports.find((t) => t instanceof AuditTrailTransport);
  if (!transport || !transport.dbInitialized) {
    throw new Error('AuditTrailTransport not ready');
  }
  return await transport.insertAuditLog(auditData);
};

export const queryAuditLogs = async (filters = {}, limit = 100, offset = 0) => {
  const where = [];
  const values = [];

  if (filters.entity_type) {
    where.push('entity_type = ?');
    values.push(filters.entity_type);
  }
  if (filters.entity_id) {
    where.push('entity_id = ?');
    values.push(filters.entity_id);
  }
  if (filters.user_id) {
    where.push('user_id = ?');
    values.push(filters.user_id);
  }
  if (filters.action) {
    where.push('action = ?');
    values.push(filters.action);
  }
  if (filters.branch) {
    where.push('branch = ?');
    values.push(filters.branch);
  }
  if (filters.event_type) {
    where.push('event_type = ?');
    values.push(filters.event_type);
  }
  if (filters.start_date) {
    where.push('created_at >= ?');
    values.push(filters.start_date);
  }
  if (filters.end_date) {
    where.push('created_at <= ?');
    values.push(filters.end_date);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [logs] = await sequelize.query(
    `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    { replacements: [...values, limit, offset] }
  );

  return logs;
};

export const getRecentAuditLogs = async (limit = 50) => {
  const [logs] = await sequelize.query(
    `SELECT id, event_id, entity_type, entity_id, user_id, action, ip_address, event_type, created_at 
     FROM audit_logs 
     ORDER BY created_at DESC 
     LIMIT ?`,
    { replacements: [limit] }
  );
  return logs;
};

export const countAuditLogsByEntity = async (startDate = null, endDate = null) => {
  let where = '';
  const values = [];

  if (startDate && endDate) {
    where = 'WHERE created_at BETWEEN ? AND ?';
    values.push(startDate, endDate);
  } else if (startDate) {
    where = 'WHERE created_at >= ?';
    values.push(startDate);
  } else if (endDate) {
    where = 'WHERE created_at <= ?';
    values.push(endDate);
  }

  const [counts] = await sequelize.query(
    `SELECT entity_type, COUNT(*) as count, COUNT(DISTINCT user_id) as unique_users 
     FROM audit_logs ${where}
     GROUP BY entity_type 
     ORDER BY count DESC`,
    { replacements: values }
  );

  return counts;
};

// Add global error handler for unhandled rejections from this module
process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.message && reason.message.includes('Invalid audit message')) {
    console.error('Audit logger unhandled rejection (ignored):', reason.message);
    // Don't crash - just log and continue
    return;
  }
  console.error('Unhandled Rejection:', reason);
});

export { auditLogger };
export default auditLogger;