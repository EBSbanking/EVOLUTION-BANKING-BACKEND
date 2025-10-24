import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';  // Add this import

// Define logging levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Define current log level (defaults to 'info')
const currentLevel = process.env.LOG_LEVEL || 'info';

// Log directory (env or default)
const logDir = process.env.LOGS_DIR || 'logs';

// Ensure log directory exists (with error handling)
import fs from 'fs';
import path from 'path';
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    console.log(`📁 Created log directory: ${logDir}`);
  } catch (err) {
    console.error(`❌ Failed to create log directory ${logDir}:`, err.message);
  }
}

export const logger = winston.createLogger({
  level: currentLevel,
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // NEW: Always include stack traces
    winston.format.json({
      replacer: (key, value) => {
        if (value instanceof Buffer || value?.buffer) return '[Buffer]';
        if (value?.constructor?.name === 'MongoClient') return '[MongoClient]';
        if (value?.constructor?.name === 'ClientSession') return '[ClientSession]'; // Added for Mongoose sessions
        if (typeof value === 'object' && value !== null) {
          // Prevent circular references in nested objects
          try {
            JSON.stringify(value); // Test for circularity
            return value;
          } catch {
            return '[Circular Object]';
          }
        }
        return value;
      },
    })
  ),
  transports: [
    // Console (dev-friendly)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}] ${message}${metaString ? ` ${metaString}` : ''}`;
        })
      ),
    }),
    // Daily rotated error logs
    new DailyRotateFile({
      filename: `${logDir}/error-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'error',
    }),
    // Daily rotated combined logs
    new DailyRotateFile({
      filename: `${logDir}/combined-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],
  // NEW: Disable auto-exit on errors—let app handle
  exitOnError: false,
  // Handle uncaught exceptions: Log to file + console (prevents silent timeouts)
  exceptionHandlers: [
    new DailyRotateFile({
      filename: `${logDir}/exceptions-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '30d',
    }),
    // NEW: Add console for immediate visibility (avoids file-only hang)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const stackStr = stack ? `\nStack: ${stack}` : '';
          const metaString = Object.keys(meta).length ? `\nMeta: ${JSON.stringify(meta, null, 2)}` : '';
          return `${timestamp} [${level}] UNHANDLED EXCEPTION: ${message}${stackStr}${metaString}`;
        })
      ),
    }),
  ],
  // NEW: Handle rejected promises: Log + console
  rejectionHandlers: [
    new DailyRotateFile({
      filename: `${logDir}/rejections-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '30d',
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const stackStr = stack ? `\nStack: ${stack}` : '';
          const metaString = Object.keys(meta).length ? `\nMeta: ${JSON.stringify(meta, null, 2)}` : '';
          return `${timestamp} [${level}] UNHANDLED REJECTION: ${message}${stackStr}${metaString}`;
        })
      ),
    }),
  ],
});

// NEW: Graceful close for transports (call in server.js shutdown)
logger.close = async () => {
  return new Promise((resolve) => {
    logger.transports.forEach(transport => {
      if (transport.close) {
        transport.close();
      }
    });
    // Give 2s for flush, then force resolve
    setTimeout(resolve, 2000);
  });
};

// Log startup
logger.info('🚀 Winston logger initialized', {
  level: currentLevel,
  logDir,
  nodeVersion: process.version,
  platform: process.platform,
});

export default logger;