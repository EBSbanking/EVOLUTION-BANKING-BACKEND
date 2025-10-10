import winston from 'winston';

// Define logging levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Define current log level (defaults to 'info')
const currentLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: currentLevel,
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
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
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}] ${message}${metaString ? ` ${metaString}` : ''}`;
        })
      ),
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

export default logger;