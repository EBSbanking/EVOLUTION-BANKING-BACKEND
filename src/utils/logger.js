// logger.js - CRASH‑RESILIENT VERSION (no uncaught exceptions)
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ========== SAFE JSON STRINGIFY (prevents circular errors) ==========
function safeStringify(obj, indent = 2) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    // Handle special objects that might cause issues
    if (value instanceof Buffer) return '[Buffer]';
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
        ...value
      };
    }
    if (value && typeof value === 'object' && value.constructor?.name === 'Sequelize') return '[Sequelize]';
    if (value && typeof value === 'object' && value.constructor?.name === 'ClientRequest') return '[ClientRequest]';
    if (value && typeof value === 'object' && value.constructor?.name === 'RedirectableRequest') return '[RedirectableRequest]';
    return value;
  }, indent);
}

// Define logging levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = process.env.LOG_LEVEL || 'info';

// Determine a safe log directory (user‑writable)
let logDir;
let fileLoggingEnabled = true;

// Allow disabling file logs via env var (useful for Windows permission issues)
if (process.env.DISABLE_FILE_LOGS === 'true') {
  fileLoggingEnabled = false;
  console.warn('⚠️ File logging disabled via DISABLE_FILE_LOGS environment variable');
}

if (fileLoggingEnabled) {
  // Try project‑relative 'logs' first; if it fails, fall back to system temp
  const projectLogs = path.join(process.cwd(), 'logs');
  try {
    if (!fs.existsSync(projectLogs)) {
      fs.mkdirSync(projectLogs, { recursive: true });
    }
    // Test write permission by creating a temporary file
    const testFile = path.join(projectLogs, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    logDir = projectLogs;
    console.log(`✅ Using log directory: ${logDir}`);
  } catch (err) {
    console.warn(`⚠️ Cannot write to project logs directory (${projectLogs}): ${err.message}`);
    // Fallback to system temp directory
    const tempLogs = path.join(os.tmpdir(), 'evolution-banking-logs');
    try {
      if (!fs.existsSync(tempLogs)) {
        fs.mkdirSync(tempLogs, { recursive: true });
      }
      const testFile = path.join(tempLogs, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      logDir = tempLogs;
      console.log(`✅ Using fallback log directory: ${logDir}`);
    } catch (fallbackErr) {
      console.error(`❌ Cannot write to fallback directory either. Disabling file logging.`, fallbackErr.message);
      fileLoggingEnabled = false;
    }
  }
}

// Helper to create a file transport safely (prevents uncaught exceptions)
function createSafeFileTransport(options) {
  try {
    const transport = new DailyRotateFile(options);
    // Suppress transport errors that would otherwise crash the process
    transport.on('error', (err) => {
      console.error(`⚠️ Log file transport error (${options.filename}):`, err.message);
    });
    return transport;
  } catch (err) {
    console.error(`❌ Failed to create file transport (${options.filename}):`, err.message);
    return null;
  }
}

// Build transports array (console always enabled)
const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaString = Object.keys(meta).length ? safeStringify(meta) : '';
        return `${timestamp || new Date().toISOString()} [${level}] ${message}${metaString ? ` ${metaString}` : ''}`;
      })
    ),
  }),
];

// Add file transports only if enabled
if (fileLoggingEnabled && logDir) {
  const errorTransport = createSafeFileTransport({
    filename: `${logDir}/error-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    level: 'error',
  });
  if (errorTransport) transports.push(errorTransport);

  const combinedTransport = createSafeFileTransport({
    filename: `${logDir}/combined-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
  });
  if (combinedTransport) transports.push(combinedTransport);
}

// Winston logger instance
export const logger = winston.createLogger({
  level: currentLevel,
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json({
      replacer: (key, value) => {
        if (value instanceof Buffer || value?.buffer) return '[Buffer]';
        if (value?.constructor?.name === 'Sequelize') return '[Sequelize]';
        if (value?.constructor?.name === 'ClientRequest') return '[ClientRequest]';
        if (value?.constructor?.name === 'RedirectableRequest') return '[RedirectableRequest]';
        if (typeof value === 'object' && value !== null) {
          try {
            JSON.stringify(value);
            return value;
          } catch {
            return '[Circular Object]';
          }
        }
        return value;
      },
    })
  ),
  transports,
  exitOnError: false,
  exceptionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const stackStr = stack ? `\nStack: ${stack}` : '';
          const metaString = Object.keys(meta).length ? `\nMeta: ${safeStringify(meta)}` : '';
          return `${timestamp} [${level}] UNHANDLED EXCEPTION: ${message}${stackStr}${metaString}`;
        })
      ),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const stackStr = stack ? `\nStack: ${stack}` : '';
          const metaString = Object.keys(meta).length ? `\nMeta: ${safeStringify(meta)}` : '';
          return `${timestamp} [${level}] UNHANDLED REJECTION: ${message}${stackStr}${metaString}`;
        })
      ),
    }),
  ],
});

// Add file exception handler only if file logging is enabled
if (fileLoggingEnabled && logDir) {
  const exceptionTransport = createSafeFileTransport({
    filename: `${logDir}/exceptions-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxFiles: '30d',
  });
  if (exceptionTransport) {
    logger.exceptions.handle(exceptionTransport);
  }

  const rejectionTransport = createSafeFileTransport({
    filename: `${logDir}/rejections-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxFiles: '30d',
  });
  if (rejectionTransport) {
    logger.rejections.handle(rejectionTransport);
  }
}

// Graceful close
logger.close = async () => {
  return new Promise((resolve) => {
    logger.transports.forEach(transport => {
      if (transport.close) {
        transport.close();
      }
    });
    setTimeout(resolve, 2000);
  });
};

// Log startup (safe – won't crash if file transport missing)
logger.info('🚀 Winston logger initialized', {
  level: currentLevel,
  logDir: logDir || 'console only',
  fileLoggingEnabled,
  nodeVersion: process.version,
  platform: process.platform,
});

export default logger;