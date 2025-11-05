import axios from 'axios';
import auditLogger from './AuditLogger.js';  // Hybrid audit logger (file + DB)

// Cache for storing sanction check results (in-memory, consider Redis for production)
const sanctionCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Test patterns for manual sanction checking
const testPatterns = {
  bvn: ['00000000000', '11111111111', '99999999999'],
  nin: ['22222222222', '33333333333'],
  names: ['TEST SANCTION', 'JOHN DOE', 'JANE SMITH'] // Case insensitive
};

// Fallback configuration
const defaultConfig = {
  sanctionCheck: {
    enabled: process.env.SANCTION_CHECK_ENABLED === 'true' || false,
    apiUrl: process.env.SANCTION_LIST_API_URL || 'https://api.sanctionlist.com'
  }
};

export const checkSanctionList = async (bvn, nin, customerName = null, userId = 'system', ipAddress = '0.0.0.0', eventId = Date.now()) => {
  try {
    // Validate inputs
    if (!bvn && !nin && !customerName) {
      throw new Error('Either BVN, NIN, or customer name is required for sanction check');
    }

    // Check cache first
    const cacheKey = `${bvn || ''}|${nin || ''}|${customerName || ''}`.toUpperCase();
    const cachedResult = sanctionCache.get(cacheKey);

    if (cachedResult && (Date.now() - cachedResult.timestamp < CACHE_TTL)) {
      // Audit via hybrid logger
      auditLogger.info('Audit Event', {
        entity_type: 'SANCTION_CHECK',
        entity_id: null,
        user_id: userId,
        action: 'SANCTION_CHECK_CACHE_HIT',
        old_value: null,
        new_value: { bvn, nin, customerName, result: cachedResult },
        ip_address: ipAddress,
        event_type: 'GENERAL',
        source: 'checkSanctionList',
        cacheHit: true
      });
      return cachedResult;
    }

    let isSanctioned = false;
    let sanctionDetails = null;

    // Check if sanction check API is enabled
    if (defaultConfig.sanctionCheck.enabled) {
      try {
        const response = await axios.post(defaultConfig.sanctionCheck.apiUrl, { bvn, nin, customerName });
        isSanctioned = response.data.isMatch;
        sanctionDetails = response.data.matches;
      } catch (apiError) {
        console.error('Sanction API error, falling back to manual check:', apiError);
        // Fall through to manual check
      }
    }

    // Manual sanction check (always performed as fallback)
    const isBvnMatch = bvn && testPatterns.bvn.includes(bvn);
    const isNinMatch = nin && testPatterns.nin.includes(nin);
    const isNameMatch = customerName &&
      testPatterns.names.some(name =>
        customerName.toUpperCase().includes(name.toUpperCase())
      );

    if (!isSanctioned) {
      isSanctioned = isBvnMatch || isNinMatch || isNameMatch;
      sanctionDetails = isBvnMatch ? {
        matchedField: 'BVN',
        matchedValue: bvn,
        list: 'Manual Sanction List'
      } : isNinMatch ? {
        matchedField: 'NIN',
        matchedValue: nin,
        list: 'Manual Sanction List'
      } : isNameMatch ? {
        matchedField: 'NAME',
        matchedValue: customerName,
        list: 'Manual PEP List'
      } : null;
    }

    // Cache the result
    const result = {
      isSanctioned,
      sanctionDetails,
      timestamp: Date.now(),
      checkedAt: new Date().toISOString()
    };

    sanctionCache.set(cacheKey, result);

    // Log the sanction check via hybrid logger
    auditLogger.info('Audit Event', {
      entity_type: 'SANCTION_CHECK',
      entity_id: null,
      user_id: userId,
      action: isSanctioned ? 'SANCTION_MATCH' : 'SANCTION_CLEAR',
      old_value: null,
      new_value: { bvn, nin, customerName, result },
      ip_address: ipAddress,
      event_type: 'GENERAL',
      source: 'checkSanctionList'
    });

    return result;
  } catch (error) {
    console.error('Sanction check error:', error);

    // Fail-safe result
    const failSafeResult = {
      isSanctioned: false,
      sanctionDetails: null,
      error: error.message,
      timestamp: Date.now()
    };

    // Audit failure via hybrid logger
    auditLogger.error('Audit Event', {
      entity_type: 'SANCTION_CHECK',
      entity_id: null,
      user_id: userId,
      action: 'SANCTION_CHECK_FAILED',
      old_value: null,
      new_value: { bvn, nin, customerName, error: error.message },
      ip_address: ipAddress,
      event_type: 'GENERAL',
      source: 'checkSanctionList',
      error: true
    });

    return failSafeResult;
  }
};

// Helper function to clear cache
export const clearSanctionCache = () => {
  sanctionCache.clear();
  console.log('Sanction check cache cleared');
};

// Adds test patterns to the manual sanction list
export const addTestPatterns = (type, values) => {
  if (testPatterns[type]) {
    testPatterns[type].push(...values);
    console.log(`Added ${values.length} ${type.toUpperCase()} patterns to test list`);
  } else {
    throw new Error(`Invalid pattern type: ${type}. Use 'bvn', 'nin', or 'names'`);
  }
};

export default checkSanctionList;