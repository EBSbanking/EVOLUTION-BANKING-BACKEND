import SystemDate from '../models/SystemDate.js';
import logger from './logger.js'; // Assuming logger is available, as seen in SystemDateController.js
import retry from 'async-retry';

const WAT_OFFSET = 3600000; // UTC+1 (1 hour in ms)

const createTimeService = () => {
  let serverTimeOffset = 0;
  let isProduction = process.env.NODE_ENV === 'production';
  let isFrozen = false;
  let frozenTime = null;

  const getCurrentTime = () => (isFrozen ? frozenTime : Date.now());

  const getServerTime = () => {
    return new Date(getCurrentTime() + WAT_OFFSET + (isProduction ? 0 : serverTimeOffset));
  };

  const setServerTimeOffset = (offsetMs) => {
    if (isProduction) throw new Error('Time adjustment not allowed in production');
    serverTimeOffset = offsetMs;
    if (isFrozen) {
      frozenTime += offsetMs;
      serverTimeOffset = 0; // Reset offset after applying to frozen time
    }
    logger.info(`Server time adjusted by ${offsetMs}ms`, { currentWAT: getServerTime().toISOString() });
  };

  const freezeTime = (atTime = Date.now()) => {
    if (isProduction) throw new Error('Time freezing not allowed in production');
    isFrozen = true;
    frozenTime = atTime;
    logger.info(`Time frozen at: ${new Date(frozenTime).toISOString()}`);
  };

  const unfreezeTime = () => {
    isFrozen = false;
    frozenTime = null;
    logger.info('Time unfrozen');
  };

  const getBusinessDate = async () => {
    try {
      const start = Date.now();
      const systemDate = await retry(
        async () => {
          // Note: Ensure SystemDate model has an index on { createdAt: -1 } for performance
          const result = await SystemDate.findOne().sort({ createdAt: -1 });
          logger.info(`SystemDate query took ${Date.now() - start}ms`);
          return result;
        },
        {
          retries: 3,
          factor: 2,
          minTimeout: 1000,
          maxTimeout: 5000,
          onRetry: (err, attempt) => {
            logger.warn(`Retry attempt ${attempt} for SystemDate query`, { error: err.message });
          },
        }
      );

      if (systemDate?.currentBusinessDate) {
        return new Date(new Date(systemDate.currentBusinessDate).getTime() + WAT_OFFSET);
      }

      logger.warn('No system date found, initializing default');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newSystemDate = await SystemDate.create({
        currentBusinessDate: today,
        nextBusinessDate: today,
        isEODProcessing: false,
        eodStatus: 'IDLE',
        eodHistory: [],
      });
      logger.info('Default system date initialized', {
        currentBusinessDate: today.toISOString(),
        nextBusinessDate: today.toISOString(),
      });
      return new Date(today.getTime() + WAT_OFFSET);
    } catch (error) {
      logger.error('Failed to fetch or initialize business date', {
        error: error.message,
        stack: error.stack,
      });
      return getServerTime(); // Fallback to server time
    }
  };

  const setProductionMode = (production) => {
    if (production && (isFrozen || serverTimeOffset !== 0)) {
      throw new Error('Cannot enable production mode with active time modifications');
    }
    isProduction = production;
    logger.info(`Production mode set to: ${production}`);
  };

  return {
    getServerTime,
    setServerTimeOffset,
    getBusinessDate,
    freezeTime,
    unfreezeTime,
    setProductionMode,
    getCurrentState: () => ({
      isProduction,
      isFrozen,
      serverTimeOffset,
      currentTime: getServerTime(),
    }),
  };
};

// Create a singleton instance
const timeService = createTimeService();

// Initialize with current WAT time
logger.info(`Server time initialized (WAT): ${timeService.getServerTime().toISOString()}`);

export const {
  getServerTime,
  setServerTimeOffset,
  getBusinessDate,
  freezeTime,
  unfreezeTime,
} = timeService;