import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { logAuditTrail as modelLogAuditTrail } from '../models/AuditTrail.js';
import mongoose from 'mongoose';

// Custom Transport for MongoDB AuditTrail Integration
class AuditTrailTransport extends winston.Transport {
  constructor(opts = {}) {
    super(opts);
    this.level = opts.level || 'info';
    this.silent = opts.silent || false;
  }

  log(info, callback) {
    // Only process audit events (skip general logs)
    if (info.message !== 'Audit Event') {
      return callback(null, info);
    }

    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) { // 1 = connected
      console.warn('⚠️ MongoDB not connected, skipping audit log');
      info.audit_db_skipped = true;
      info.audit_db_reason = 'MongoDB not connected';
      return callback(null, info);
    }

    // Extract params for logAuditTrail from the log meta (info object)
    const {
      entity_type,
      entity_id,
      branch,
      user_id,
      action,
      old_value,
      new_value,
      ip_address,
      event_type = 'GENERAL',
      // Catch-all for extra fields
      ...extraFields
    } = info;

    // Validate required fields
    if (!entity_type || !user_id || !action) {
      const err = new Error('Missing required audit fields: entity_type, user_id, action');
      console.error('❌ Audit validation failed:', err.message);
      info.audit_validation_failed = true;
      info.audit_error = err.message;
      return callback(null, info);
    }

    // Set timeout for audit logging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Audit log timeout after 5000ms')), 5000);
    });

    // Log to DB asynchronously with timeout
    Promise.race([
      modelLogAuditTrail(
        entity_type,
        entity_id,
        branch || 1, // Provide default branch if not specified - FIXED
        user_id,
        action,
        old_value,
        new_value,
        ip_address || '127.0.0.1',
        event_type,
        { ...extraFields, timestamp: info.timestamp }
      ),
      timeoutPromise
    ])
      .then((auditLog) => {
        if (auditLog) {
          // Enrich the log with DB ID for file output
          info.audit_db_id = auditLog._id;
          info.event_id = auditLog.event_id;
          info.audit_db_success = true;
        } else {
          // Log was not saved to DB but don't fail the transport
          info.audit_db_skipped = true;
          info.audit_db_reason = 'Model returned null';
        }
        callback(null, info);
      })
      .catch((err) => {
        console.error('❌ DB Audit logging failed:', err.message);
        info.audit_db_error = err.message;
        info.audit_db_skipped = true;
        callback(null, info); // Don't fail the transport
      });
  }
}

// File Transport (daily rotation to logs/audit-YYYY-MM-DD.log)
const fileTransport = new DailyRotateFile({
  filename: 'logs/audit-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  )
});

// Create the hybrid logger
const auditLogger = winston.createLogger({
  level: 'info',
  transports: [
    fileTransport,
    new AuditTrailTransport({ level: 'info' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true })
  )
});

// Named export for backward compatibility - UPDATED TO INCLUDE BRANCH PARAMETER
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
    // Ensure branch is included in the additional_info or provide default
    const branch = additional_info?.branch || 1;
    
    auditLogger.info('Audit Event', {
      entity_type,
      entity_id,
      user_id,
      action,
      old_value,
      new_value,
      ip_address: ip_address || '127.0.0.1',
      event_type,
      branch, // Include branch in the log data
      ...additional_info // Spread additional info (branch might be here too, which is fine)
    }, (err, result) => {
      if (err) {
        console.error('❌ Audit logger transport error:', err);
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

// Alternative simplified logAuditTrail function that includes branch explicitly
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
      ip_address: ip_address || '127.0.0.1',
      event_type,
      branch,
      ...additional_info
    }, (err, result) => {
      if (err) {
        console.error('❌ Audit logger transport error:', err);
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

// Keep the default export
export default auditLogger;