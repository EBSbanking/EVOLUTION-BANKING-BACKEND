// src/services/timeService.js - COMPLETE FIXED VERSION with camelCase
import logger from '../utils/logger.js';
import auditLogger from '../utils/AuditLogger.js';
import SystemDate from '../models/SystemDate.js';
import { Op } from 'sequelize';

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
      throw error;
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

  // ============================================================
  // ✅ FIXED: getBusinessDate - Uses camelCase from the model
  // ============================================================
  const getBusinessDate = async (context = {}) => {
    const { user_id = 'system', ip_address = 'internal' } = getAuditContext(context);
    try {
      const start = Date.now();
      
      // Get the latest system date from database
      const systemDate = await SystemDate.findOne({
        order: [['created_at', 'DESC']]
      });
      
      logger.info(`SystemDate query took ${Date.now() - start}ms`);

      // ✅ FIX: Use camelCase from the model
      if (systemDate?.currentBusinessDate) {
        // ✅ FIX: Always return the stored business date, NEVER auto-advance
        const businessDate = new Date(systemDate.currentBusinessDate);
        businessDate.setHours(0, 0, 0, 0);
        
        // Log warning if business date is behind server date by more than 1 day
        const serverDate = new Date(getServerTime());
        serverDate.setHours(0, 0, 0, 0);
        const daysDiff = Math.floor((serverDate - businessDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 1) {
          logger.warn(`Business date (${businessDate.toISOString().split('T')[0]}) is ${daysDiff} days behind server date (${serverDate.toISOString().split('T')[0]}). This is normal if EOD hasn't been run.`);
        }
        
        return businessDate;
      }

      logger.warn('No system date found, using server time as fallback');
      return getServerTime();
    } catch (error) {
      logger.error('Failed to fetch business date', {
        error: error.message,
        stack: error.stack,
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

  // Get business date status (useful for UI)
  // ✅ FIXED: Uses camelCase from the model
  const getBusinessDateStatus = async () => {
    try {
      const systemDate = await SystemDate.findOne({
        order: [['created_at', 'DESC']]
      });

      if (!systemDate) {
        return {
          success: false,
          message: 'No system date found'
        };
      }

      // ✅ FIX: Use camelCase from the model
      const businessDate = new Date(systemDate.currentBusinessDate);
      const serverDate = new Date(getServerTime());
      serverDate.setHours(0, 0, 0, 0);
      
      const daysBehind = Math.floor((serverDate - businessDate) / (1000 * 60 * 60 * 24));

      return {
        success: true,
        data: {
          business_date: businessDate,
          server_date: serverDate,
          formatted_business_date: businessDate.toISOString().split('T')[0],
          formatted_server_date: serverDate.toISOString().split('T')[0],
          days_behind: daysBehind,
          // ✅ FIX: Use camelCase from the model
          eod_status: systemDate.eodStatus,
          is_eod_processing: systemDate.isEODProcessing,
          last_eod_date: systemDate.lastEODDate,
          last_eod_processed_by: systemDate.lastEODProcessedBy || systemDate.lastEODProcessedByLegacy,
          needs_eod: daysBehind > 0 && systemDate.eodStatus === 'COMPLETED'
        }
      };
    } catch (error) {
      logger.error('Error getting business date status:', error);
      return {
        success: false,
        message: error.message
      };
    }
  };

  return {
    getServerTime,
    setServerTimeOffset,
    getBusinessDate,
    getBusinessDateStatus,
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
  getBusinessDateStatus,
  freezeTime,
  unfreezeTime,
} = timeService;