// utils/logger.js
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = process.env.LOG_LEVEL || 'info';

export default {
  error: (...args) => logLevels.error <= logLevels[currentLevel] && console.error('[ERROR]', ...args),
  warn: (...args) => logLevels.warn <= logLevels[currentLevel] && console.warn('[WARN]', ...args),
  info: (...args) => logLevels.info <= logLevels[currentLevel] && console.log('[INFO]', ...args),
  debug: (...args) => logLevels.debug <= logLevels[currentLevel] && console.log('[DEBUG]', ...args)
};