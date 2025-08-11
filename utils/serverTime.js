// utils/serverTime.js
import SystemDate from '../models/SystemDate.js';

const WAT_OFFSET = 3600000; // UTC+1 (1 hour in ms)

const createTimeService = () => {
  let serverTimeOffset = 0;
  let isProduction = process.env.NODE_ENV === 'production';
  let isFrozen = false;
  let frozenTime = null;

  const getCurrentTime = () => isFrozen ? frozenTime : Date.now();

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
    console.log(`Server time adjusted by ${offsetMs}ms (Current WAT: ${getServerTime()})`);
  };

  const freezeTime = (atTime = Date.now()) => {
    if (isProduction) throw new Error('Time freezing not allowed in production');
    isFrozen = true;
    frozenTime = atTime;
    console.log(`Time frozen at: ${new Date(frozenTime)}`);
  };

  const unfreezeTime = () => {
    isFrozen = false;
    frozenTime = null;
    console.log('Time unfrozen');
  };

  const getBusinessDate = async () => {
    const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
    if (systemDate?.currentBusinessDate) {
      return new Date(new Date(systemDate.currentBusinessDate).getTime() + WAT_OFFSET);
    }
    return getServerTime();
  };

  const setProductionMode = (production) => {
    if (production && (isFrozen || serverTimeOffset !== 0)) {
      throw new Error('Cannot enable production mode with active time modifications');
    }
    isProduction = production;
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
      currentTime: getServerTime()
    })
  };
};

// Create a singleton instance
const timeService = createTimeService();

// Initialize with current WAT time
console.log(`Server time initialized (WAT): ${timeService.getServerTime()}`);

export const { 
  getServerTime, 
  setServerTimeOffset, 
  getBusinessDate,
  freezeTime,
  unfreezeTime
} = timeService;