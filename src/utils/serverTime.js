import SystemDate from '../models/SystemDate.js';
import logger from './logger.js'; // General logger for ops (non-audit) – now with daily rotation
import auditLogger from './AuditLogger.js'; // Hybrid audit logger (file + DB) – lowercase for consistency
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

  // Helper to get audit context (defaults for internal calls)
  const getAuditContext = (context = {}) => ({
    user_id: context.user_id || 'system',
    ip_address: context.ip_address || 'internal',
  });

  const setServerTimeOffset = async (offsetMs, context = {}) => {
    if (isProduction) throw new Error('Time adjustment not allowed in production');
    
    const { user_id, ip_address } = getAuditContext(context);
    const oldOffset = serverTimeOffset;
    const oldTime = getServerTime();
    
    try {
      serverTimeOffset = offsetMs;
      if (isFrozen) {
        frozenTime += offsetMs;
        serverTimeOffset = 0; // Reset offset after applying to frozen time
      }
      
      const newTime = getServerTime();
      
      // General log
      logger.info(`Server time adjusted by ${offsetMs}ms`, { currentWAT: newTime.toISOString() });
      
      // Audit event (non-blocking)
      auditLogger.info('Audit Event', {
        entity_type: 'system_time',
        entity_id: 'server_offset',
        user_id,
        action: 'adjust_time',
        old_value: { offset: oldOffset, time: oldTime.toISOString() },
        new_value: { offset: serverTimeOffset, time: newTime.toISOString() },
        ip_address,
        event_type: 'SYSTEM_ADJUST',
        outcome: 'success'
      }).catch(auditError => {
        logger.warn('Audit failed for time offset adjustment', { error: auditError.message });
      });
    } catch (error) {
      logger.error('Error adjusting server time offset', { error: error.message });
      throw error; // Re-throw business errors
    }
  };

  const freezeTime = async (atTime = Date.now(), context = {}) => {
    if (isProduction) throw new Error('Time freezing not allowed in production');
    
    const { user_id, ip_address } = getAuditContext(context);
    const oldState = { isFrozen, frozenTime: frozenTime?.toISOString() || null };
    
    try {
      isFrozen = true;
      frozenTime = atTime;
      
      // General log
      logger.info(`Time frozen at: ${new Date(frozenTime).toISOString()}`);
      
      // Audit event (non-blocking)
      auditLogger.info('Audit Event', {
        entity_type: 'system_time',
        entity_id: 'freeze',
        user_id,
        action: 'freeze_time',
        old_value: oldState,
        new_value: { isFrozen: true, frozenAt: new Date(frozenTime).toISOString() },
        ip_address,
        event_type: 'SYSTEM_FREEZE',
        outcome: 'success'
      }).catch(auditError => {
        logger.warn('Audit failed for time freeze', { error: auditError.message });
      });
    } catch (error) {
      logger.error('Error freezing time', { error: error.message });
      throw error;
    }
  };

  const unfreezeTime = async (context = {}) => {
    const { user_id, ip_address } = getAuditContext(context);
    const oldState = { isFrozen, frozenTime: frozenTime?.toISOString() || null };
    
    try {
      isFrozen = false;
      frozenTime = null;
      
      // General log
      logger.info('Time unfrozen');
      
      // Audit event (non-blocking)
      auditLogger.info('Audit Event', {
        entity_type: 'system_time',
        entity_id: 'unfreeze',
        user_id,
        action: 'unfreeze_time',
        old_value: oldState,
        new_value: { isFrozen: false },
        ip_address,
        event_type: 'SYSTEM_UNFREEZE',
        outcome: 'success'
      }).catch(auditError => {
        logger.warn('Audit failed for time unfreeze', { error: auditError.message });
      });
    } catch (error) {
      logger.error('Error unfreezing time', { error: error.message });
      throw error;
    }
  };

  const getBusinessDate = async (context = {}) => {
    const { user_id = 'system', ip_address = 'internal' } = getAuditContext(context);
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
      const today = new Date('2025-10-15');  // Example: Use current date for testing
      today.setHours(0, 0, 0, 0);
      const newSystemDate = await SystemDate.create({
        currentBusinessDate: today,
        nextBusinessDate: today,
        isEODProcessing: false,
        eodStatus: 'IDLE',
        eodHistory: [],
      });
      
      // Audit the initialization (non-blocking)
      auditLogger.info('Audit Event', {
        entity_type: 'system_date',
        entity_id: newSystemDate._id.toString(),
        user_id,
        action: 'initialize_business_date',
        old_value: null,
        new_value: {
          currentBusinessDate: today.toISOString(),
          nextBusinessDate: today.toISOString(),
          eodStatus: 'IDLE'
        },
        ip_address,
        event_type: 'SYSTEM_INIT',
        outcome: 'success'
      }).catch(auditError => {
        logger.warn('Audit failed for system date initialization', { error: auditError.message });
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
      
      // Audit failure (non-blocking)
      auditLogger.error('Audit Event', {
        entity_type: 'system_date',
        entity_id: null,
        user_id,
        action: 'get_business_date',
        old_value: null,
        new_value: null,
        ip_address,
        event_type: 'SYSTEM_ERROR',
        outcome: 'failure',
        error: error.message
      }).catch(auditError => {
        logger.warn('Audit failed for business date error', { error: auditError.message });
      });
      
      return getServerTime(); // Fallback to server time
    }
  };

  const setProductionMode = async (production, context = {}) => {
    const { user_id, ip_address } = getAuditContext(context);
    if (production && (isFrozen || serverTimeOffset !== 0)) {
      const errorMsg = 'Cannot enable production mode with active time modifications';
      
      // Audit the failure (non-blocking)
      auditLogger.error('Audit Event', {
        entity_type: 'system_config',
        entity_id: 'production_mode',
        user_id,
        action: 'set_production_mode',
        old_value: { isProduction },
        new_value: { attempted: production, status: 'blocked' },
        ip_address,
        event_type: 'SYSTEM_ERROR',
        outcome: 'failure',
        error: errorMsg
      }).catch(auditError => {
        logger.warn('Audit failed for production mode block', { error: auditError.message });
      });
      
      throw new Error(errorMsg);
    }
    
    const oldMode = isProduction;
    
    try {
      isProduction = production;
      
      // General log
      logger.info(`Production mode set to: ${production}`);
      
      // Audit event (non-blocking)
      auditLogger.info('Audit Event', {
        entity_type: 'system_config',
        entity_id: 'production_mode',
        user_id,
        action: 'set_production_mode',
        old_value: { isProduction: oldMode },
        new_value: { isProduction: production },
        ip_address,
        event_type: 'SYSTEM_CONFIG',
        outcome: 'success'
      }).catch(auditError => {
        logger.warn('Audit failed for production mode set', { error: auditError.message });
      });
    } catch (error) {
      logger.error('Error setting production mode', { error: error.message });
      throw error;
    }
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

// Initialize with current WAT time (general log only)
logger.info(`Server time initialized (WAT): ${timeService.getServerTime().toISOString()}`);

// Optional: Audit the server startup (non-blocking, no await)
try {
  auditLogger.info('Audit Event', {
    entity_type: 'system',
    entity_id: 'server_startup',
    user_id: 'system',
    action: 'server_start',
    old_value: null,
    new_value: { timestamp: new Date().toISOString(), watTime: timeService.getServerTime().toISOString() },
    ip_address: 'internal',
    event_type: 'SYSTEM_START',
    outcome: 'success'
  }).catch(auditError => {
    logger.warn('Startup audit failed (non-blocking)', { error: auditError.message });
  });
} catch (error) {
  logger.warn('Could not log startup audit', { error: error.message });
}

export const {
  getServerTime,
  setServerTimeOffset,
  getBusinessDate,
  freezeTime,
  unfreezeTime,
} = timeService;