// utils/checkSanctionList.js
import axios from 'axios';
import { logAuditTrail } from '../utils/AuditLogger.js';

// Cache for storing sanction check results (in-memory, consider Redis for production)
const sanctionCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Test patterns for manual sanction checking
const testPatterns = {
  bvn: ['00000000000', '11111111111', '99999999999'],
  nin: ['22222222222', '33333333333'],
  names: ['TEST SANCTION', 'JOHN DOE', 'JANE SMITH'] // Case insensitive
};

export const checkSanctionList = async (bvn, nin, customerName = null) => {
  try {
    // Validate inputs
    if (!bvn && !nin && !customerName) {
      throw new Error('Either BVN, NIN or customer name is required for sanction check');
    }

    // Check cache first
    const cacheKey = `${bvn || ''}|${nin || ''}|${customerName || ''}`.toUpperCase();
    const cachedResult = sanctionCache.get(cacheKey);
    
    if (cachedResult && (Date.now() - cachedResult.timestamp < CACHE_TTL)) {
      await logAuditTrail(
        'SANCTION_CHECK_CACHE_HIT',
        { bvn, nin, customerName },
        cachedResult
      );
      return cachedResult;
    }

    let isSanctioned = false;
    let sanctionDetails = null;
    
    if (config.sanctionCheck.enabled) {
      // If API is enabled (you can keep this for future integration)
      try {
        const response = await axios.post(config.sanctionCheck.apiUrl, { bvn, nin, customerName });
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

    // Log the sanction check
    await logAuditTrail(
      'SANCTION_CHECK',
      { bvn, nin, customerName },
      result
    );

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

    await logAuditTrail(
      'SANCTION_CHECK_ERROR',
      { bvn, nin, customerName },
      failSafeResult
    );

    return failSafeResult;
  }
};

// Helper function to clear cache (can be called periodically)
export const clearSanctionCache = () => {
  sanctionCache.clear();
  console.log('Sanction check cache cleared');
};

/**
 * Adds test patterns to the manual sanction list
 * @param {'bvn'|'nin'|'names'} type - Identifier type
 * @param {string[]} values - Values to add
 * @returns {void}
 */
export const addTestPatterns = (type, values) => {
  if (testPatterns[type]) {
    testPatterns[type].push(...values);
    console.log(`Added ${values.length} ${type.toUpperCase()} patterns to test list`);
  } else {
    throw new Error(`Invalid pattern type: ${type}. Use 'bvn', 'nin', or 'names'`);
  }
};

// Example usage (documentation only, not part of the module)
/*
// Basic check (same as before)
const result = await checkSanctionList('00000000000', '12345678901');

// New: Check with name
const result = await checkSanctionList(null, null, 'John Doe Test Sanction');

// New: Add test patterns dynamically
addTestPatterns('bvn', ['33333333333', '44444444444']);
addTestPatterns('names', ['ALERT PERSON', 'BLOCKED CUSTOMER']);

// Clear cache (same as before)
clearSanctionCache();
*/
export default checkSanctionList;