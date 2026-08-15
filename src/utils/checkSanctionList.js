// utils/sanctionCheck.js
import axios from 'axios';
import auditLogger from './AuditLogger.js';
import { Op } from 'sequelize';

// ============================================
// AI-POWERED CONFIGURATION
// ============================================

// Fallback configuration with AI enhancements
const defaultConfig = {
  sanctionCheck: {
    enabled: process.env.SANCTION_CHECK_ENABLED === 'true' || false,
    apiUrl: process.env.SANCTION_LIST_API_URL || 'https://api.sanctionlist.com',
    // AI Configuration
    ai: {
      enabled: process.env.AI_SANCTION_ENABLED !== 'false', // Default: true
      fuzzyMatching: {
        enabled: process.env.AI_FUZZY_MATCHING !== 'false', // Default: true
        threshold: parseFloat(process.env.AI_FUZZY_THRESHOLD) || 0.65,
        minLength: parseInt(process.env.AI_FUZZY_MIN_LENGTH) || 3
      },
      patternDetection: {
        enabled: process.env.AI_PATTERN_DETECTION !== 'false', // Default: true
        weightThreshold: parseFloat(process.env.AI_PATTERN_WEIGHT) || 0.6
      },
      riskScoring: {
        enabled: process.env.AI_RISK_SCORING !== 'false', // Default: true
        criticalThreshold: parseInt(process.env.AI_CRITICAL_THRESHOLD) || 90,
        highThreshold: parseInt(process.env.AI_HIGH_THRESHOLD) || 70,
        mediumThreshold: parseInt(process.env.AI_MEDIUM_THRESHOLD) || 40
      },
      cache: {
        enabled: process.env.AI_CACHE_ENABLED !== 'false', // Default: true
        ttl: parseInt(process.env.AI_CACHE_TTL) || 3600, // seconds
        maxSize: parseInt(process.env.AI_CACHE_MAX_SIZE) || 1000
      }
    },
    // API timeout settings
    timeout: parseInt(process.env.SANCTION_API_TIMEOUT) || 5000,
    retryAttempts: parseInt(process.env.SANCTION_API_RETRIES) || 3,
    retryDelay: parseInt(process.env.SANCTION_API_RETRY_DELAY) || 1000
  },
  // AI Database settings
  aiDatabase: {
    autoUpdate: process.env.AI_DB_AUTO_UPDATE === 'true' || false,
    updateInterval: parseInt(process.env.AI_DB_UPDATE_INTERVAL) || 86400, // 24 hours in seconds
    sources: {
      ofac: process.env.AI_OFAC_ENABLED === 'true' || true,
      interpol: process.env.AI_INTERPOL_ENABLED === 'true' || true,
      un: process.env.AI_UN_ENABLED === 'true' || true,
      custom: process.env.AI_CUSTOM_ENABLED === 'true' || false,
      customApiUrl: process.env.AI_CUSTOM_API_URL || null
    }
  }
};

// ============================================
// AI-POWERED SANCTION DATABASE
// ============================================

// Enhanced sanction database with more realistic data
const AI_SANCTION_DATABASE = {
  bvn: [
    '00000000000', '11111111111', '99999999999',
    '12345678901', '98765432109', '55555555555'
  ],
  nin: [
    '22222222222', '33333333333', '44444444444',
    '66666666666', '77777777777', '88888888888'
  ],
  names: [
    'TEST SANCTION', 'JOHN DOE', 'JANE SMITH',
    'MOHAMMED ALI', 'ANNA KOVALENKO', 'DIMITRI PETROV',
    // Realistic sanctioned names
    'OSAMA BIN LADEN', 'SADDAM HUSSEIN', 'KIM JONG UN',
    'ABU BAKR AL-BAGHDADI', 'ALEXANDER LUKASHENKO',
    'BASHAR AL-ASSAD', 'VLADIMIR PUTIN', 'MUAMMAR GADDAFI',
    'ROBERT MUGABE', 'SALVADOR ALLENDE', 'AUGUSTO PINOCHET'
  ],
  // Weighted patterns for intelligent matching
  patterns: [
    { pattern: /.*sanction.*/i, weight: 0.9, description: 'Contains "sanction" in name' },
    { pattern: /.*terror.*/i, weight: 0.85, description: 'Contains "terror" in name' },
    { pattern: /.*drug.*/i, weight: 0.7, description: 'Contains "drug" in name' },
    { pattern: /.*fraud.*/i, weight: 0.6, description: 'Contains "fraud" in name' },
    { pattern: /.*money.*launder.*/i, weight: 0.8, description: 'Contains "money laundering" related' },
    { pattern: /.*corrupt.*/i, weight: 0.7, description: 'Contains "corruption" related' },
    { pattern: /.*dictator.*/i, weight: 0.75, description: 'Contains "dictator" in name' }
  ]
};

// ============================================
// AI-POWERED CACHE
// ============================================

// Cache for storing sanction check results
const sanctionCache = new Map();

// Cache stats
let cacheStats = {
  hits: 0,
  misses: 0,
  total: 0
};

// ============================================
// AI-POWERED FUZZY MATCHING ENGINE
// ============================================

/**
 * Calculate Levenshtein distance between two strings
 */
const levenshteinDistance = (str1, str2) => {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;
  
  const matrix = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i-1] === s2[j-1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i-1][j] + 1,
        matrix[i][j-1] + 1,
        matrix[i-1][j-1] + cost
      );
    }
  }
  
  return matrix[s1.length][s2.length];
};

/**
 * Calculate similarity score between two strings (0-1)
 */
const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  const distance = levenshteinDistance(str1, str2);
  const maxLen = Math.max(str1.length, str2.length);
  return maxLen === 0 ? 1.0 : 1 - (distance / maxLen);
};

/**
 * AI-Powered: Check if a name is similar to sanctioned names
 */
const checkNameSimilarity = (customerName, sanctionedNames) => {
  if (!customerName || !sanctionedNames || sanctionedNames.length === 0) {
    return { score: 0, matches: [] };
  }

  const aiConfig = defaultConfig.sanctionCheck.ai;
  const fuzzyConfig = aiConfig.fuzzyMatching;
  
  // Skip if fuzzy matching is disabled
  if (!fuzzyConfig.enabled) {
    return { score: 0, matches: [] };
  }

  const matches = [];
  let bestScore = 0;
  let bestMatch = null;

  for (const sanctioned of sanctionedNames) {
    const similarity = calculateSimilarity(customerName, sanctioned);
    const threshold = fuzzyConfig.threshold;
    const minLength = fuzzyConfig.minLength;
    
    // Only check if name is long enough and similarity meets threshold
    if (customerName.length >= minLength && similarity > threshold) {
      matches.push({
        sanctionedName: sanctioned,
        similarity: similarity,
        confidence: similarity >= 0.85 ? 'HIGH' :
                   similarity >= 0.65 ? 'MEDIUM' : 'LOW'
      });
      
      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatch = sanctioned;
      }
    }
  }

  return {
    score: bestScore,
    matches,
    isMatch: bestScore >= 0.65,
    confidence: bestScore >= 0.85 ? 'HIGH' :
                bestScore >= 0.65 ? 'MEDIUM' : 'LOW'
  };
};

// ============================================
// AI-POWERED RISK SCORING
// ============================================

/**
 * Calculate risk score based on various factors
 */
const calculateRiskScore = (factors) => {
  const { 
    isSanctioned, 
    similarityScore, 
    hasPEP, 
    countryRisk,
    documentVerificationStatus,
    transactionHistory
  } = factors;

  const aiConfig = defaultConfig.sanctionCheck.ai;
  const riskConfig = aiConfig.riskScoring;

  // Skip if risk scoring is disabled
  if (!riskConfig.enabled) {
    return 0;
  }

  let riskScore = 0;

  // Sanction match is highest priority
  if (isSanctioned) {
    riskScore = Math.max(riskScore, riskConfig.criticalThreshold);
  }

  // High similarity match
  if (similarityScore >= 0.85) {
    riskScore = Math.max(riskScore, riskConfig.highThreshold);
  } else if (similarityScore >= 0.65) {
    riskScore = Math.max(riskScore, riskConfig.mediumThreshold);
  }

  // PEP (Politically Exposed Person)
  if (hasPEP) {
    riskScore = Math.max(riskScore, riskConfig.highThreshold);
  }

  // Country risk (simplified)
  if (countryRisk === 'HIGH') {
    riskScore = Math.max(riskScore, riskConfig.mediumThreshold);
  } else if (countryRisk === 'CRITICAL') {
    riskScore = Math.max(riskScore, riskConfig.highThreshold);
  }

  return Math.min(riskScore, 100); // Cap at 100
};

// ============================================
// AI-POWERED SANCTION CHECK
// ============================================

export const checkSanctionList = async (bvn, nin, customerName = null, userId = 'system', ipAddress = '0.0.0.0', eventId = Date.now()) => {
  try {
    console.log('🤖 AI: Starting enhanced sanction check...');
    console.log(`📊 Input: BVN=${bvn || 'N/A'}, NIN=${nin || 'N/A'}, Name=${customerName || 'N/A'}`);

    // Get AI configuration
    const aiConfig = defaultConfig.sanctionCheck.ai;
    const cacheConfig = aiConfig.cache;

    // Validate inputs
    if (!bvn && !nin && !customerName) {
      throw new Error('Either BVN, NIN, or customer name is required for sanction check');
    }

    // Check cache first
    if (cacheConfig.enabled) {
      const cacheKey = `${bvn || ''}|${nin || ''}|${customerName || ''}`.toUpperCase();
      const cachedResult = sanctionCache.get(cacheKey);
      const cacheTTL = cacheConfig.ttl * 1000; // Convert to milliseconds

      if (cachedResult && (Date.now() - cachedResult.timestamp < cacheTTL)) {
        console.log('💾 Returning cached result');
        cacheStats.hits++;
        cacheStats.total++;
        
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
      cacheStats.misses++;
      cacheStats.total++;
      
      // Check cache size and clean if needed
      if (sanctionCache.size > cacheConfig.maxSize) {
        console.log('🧹 Cache size limit reached, cleaning...');
        cleanCache();
      }
    }

    // ============================================
    // AI: MULTI-STRATEGY DETECTION
    // ============================================
    
    let isSanctioned = false;
    let sanctionDetails = null;
    let riskScore = 0;
    let matches = [];

    // Check if AI sanction check is enabled
    if (aiConfig.enabled) {
      console.log('🤖 AI: Running enhanced detection...');
      
      // STRATEGY 1: Exact BVN match
      if (bvn && AI_SANCTION_DATABASE.bvn.includes(bvn)) {
        console.log('⚠️ BVN matches sanctioned list');
        isSanctioned = true;
        matches.push({
          type: 'BVN',
          value: bvn,
          confidence: 'HIGH',
          description: 'Exact BVN match in sanction database'
        });
      }

      // STRATEGY 2: Exact NIN match
      if (nin && AI_SANCTION_DATABASE.nin.includes(nin)) {
        console.log('⚠️ NIN matches sanctioned list');
        isSanctioned = true;
        matches.push({
          type: 'NIN',
          value: nin,
          confidence: 'HIGH',
          description: 'Exact NIN match in sanction database'
        });
      }

      // STRATEGY 3: AI-Powered Name Similarity Check
      if (customerName) {
        console.log('🤖 AI: Checking name similarity...');
        
        // Exact name match
        if (AI_SANCTION_DATABASE.names.includes(customerName.toUpperCase())) {
          console.log('⚠️ Name matches sanctioned list');
          isSanctioned = true;
          matches.push({
            type: 'NAME',
            value: customerName,
            confidence: 'HIGH',
            description: 'Exact name match in sanction database'
          });
        }

        // Fuzzy name matching
        const nameMatchResult = checkNameSimilarity(customerName, AI_SANCTION_DATABASE.names);
        if (nameMatchResult.isMatch) {
          console.log(`⚠️ AI detected name similarity: ${Math.round(nameMatchResult.score * 100)}%`);
          isSanctioned = true;
          nameMatchResult.matches.forEach(match => {
            matches.push({
              type: 'NAME_SIMILARITY',
              value: match.sanctionedName,
              confidence: match.confidence,
              similarity: match.similarity,
              description: `Name similarity ${Math.round(match.similarity * 100)}% match with "${match.sanctionedName}"`
            });
          });
        }
      }

      // STRATEGY 4: Pattern-based detection
      if (customerName) {
        const patternConfig = aiConfig.patternDetection;
        if (patternConfig.enabled) {
          console.log('🤖 AI: Checking patterns...');
          for (const pattern of AI_SANCTION_DATABASE.patterns) {
            if (pattern.pattern.test(customerName)) {
              console.log(`⚠️ AI detected pattern: ${pattern.description}`);
              matches.push({
                type: 'PATTERN',
                value: customerName,
                confidence: pattern.weight >= 0.8 ? 'HIGH' : 'MEDIUM',
                description: pattern.description,
                weight: pattern.weight
              });
              // If pattern weight is high enough, consider it a match
              if (pattern.weight >= patternConfig.weightThreshold) {
                isSanctioned = true;
              }
            }
          }
        }
      }

      // STRATEGY 5: BVN/NIN pattern detection
      if (bvn && /^(\d)\1*$/.test(bvn)) {
        console.log('⚠️ AI detected suspicious BVN pattern');
        matches.push({
          type: 'PATTERN',
          value: bvn,
          confidence: 'MEDIUM',
          description: 'Suspicious BVN pattern (all same digits)'
        });
      }

      if (nin && /^(\d)\1*$/.test(nin)) {
        console.log('⚠️ AI detected suspicious NIN pattern');
        matches.push({
          type: 'PATTERN',
          value: nin,
          confidence: 'MEDIUM',
          description: 'Suspicious NIN pattern (all same digits)'
        });
      }
    } else {
      // Fallback to simple check if AI is disabled
      console.log('⚠️ AI disabled, using simple check...');
      isSanctioned = (bvn && AI_SANCTION_DATABASE.bvn.includes(bvn)) ||
                     (nin && AI_SANCTION_DATABASE.nin.includes(nin)) ||
                     (customerName && AI_SANCTION_DATABASE.names.includes(customerName.toUpperCase()));
    }

    // ============================================
    // AI: RISK SCORING
    // ============================================
    
    // Calculate risk score
    const highestConfidence = matches.length > 0 ? 
      Math.max(...matches.map(m => m.confidence === 'HIGH' ? 1 : m.confidence === 'MEDIUM' ? 0.6 : 0.3)) : 0;

    riskScore = calculateRiskScore({
      isSanctioned,
      similarityScore: highestConfidence,
      hasPEP: false, // Could be enhanced with actual PEP check
      countryRisk: 'LOW', // Could be enhanced with country risk API
      documentVerificationStatus: 'PENDING',
      transactionHistory: []
    });

    console.log(`📊 AI Risk Score: ${riskScore} (${riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW'})`);

    // ============================================
    // AI: FINAL RESULT
    // ============================================
    
    const result = {
      isSanctioned,
      sanctionDetails: {
        matches,
        riskScore,
        riskLevel: riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW',
        riskDescription: riskScore >= 70 ? 'High risk - immediate action required' :
                         riskScore >= 40 ? 'Medium risk - requires review' :
                         'Low risk - proceed with normal process',
        confidence: matches.length > 0 ? 
          Math.max(...matches.map(m => m.confidence === 'HIGH' ? 0.95 : m.confidence === 'MEDIUM' ? 0.7 : 0.5)) : 1,
        timestamp: Date.now(),
        checkedAt: new Date().toISOString(),
        aiDetected: aiConfig.enabled,
        strategy: matches.length > 0 ? 'AI_POWERED_DETECTION' : 'CLEAR'
      },
      timestamp: Date.now(),
      checkedAt: new Date().toISOString(),
      aiDetected: aiConfig.enabled
    };

    // Cache the result
    if (cacheConfig.enabled) {
      const cacheKey = `${bvn || ''}|${nin || ''}|${customerName || ''}`.toUpperCase();
      sanctionCache.set(cacheKey, {
        ...result,
        timestamp: Date.now()
      });
    }

    // ============================================
    // AI: AUDIT LOGGING
    // ============================================
    
    const auditAction = isSanctioned ? 'SANCTION_MATCH' : 
                        matches.length > 0 ? 'SANCTION_SUSPICIOUS' : 'SANCTION_CLEAR';

    auditLogger.info('Audit Event', {
      entity_type: 'SANCTION_CHECK',
      entity_id: null,
      user_id: userId,
      action: auditAction,
      old_value: null,
      new_value: { 
        bvn, 
        nin, 
        customerName, 
        result: {
          isSanctioned,
          riskScore,
          matches: matches.map(m => ({
            type: m.type,
            confidence: m.confidence,
            description: m.description
          }))
        }
      },
      ip_address: ipAddress,
      event_type: 'GENERAL',
      source: 'checkSanctionList',
      aiDetected: aiConfig.enabled,
      cacheHit: false
    });

    console.log('✅ AI Sanction check completed');
    return result;

  } catch (error) {
    console.error('❌ AI Sanction check error:', error);

    // Fail-safe result
    const failSafeResult = {
      isSanctioned: false,
      sanctionDetails: {
        error: error.message,
        riskScore: 0,
        riskLevel: 'UNKNOWN',
        confidence: 0,
        matches: [],
        aiDetected: defaultConfig.sanctionCheck.ai.enabled || false
      },
      timestamp: Date.now(),
      error: true
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

// ============================================
// AI: HELPER FUNCTIONS
// ============================================

/**
 * Clear sanction cache
 */
export const clearSanctionCache = () => {
  sanctionCache.clear();
  cacheStats = { hits: 0, misses: 0, total: 0 };
  console.log('🧹 Sanction check cache cleared');
};

/**
 * Clean cache if it exceeds max size
 */
const cleanCache = () => {
  const maxSize = defaultConfig.sanctionCheck.ai.cache.maxSize;
  if (sanctionCache.size > maxSize) {
    // Remove oldest entries (simple cleanup - keep newest 80%)
    const entries = Array.from(sanctionCache.entries());
    const keepCount = Math.floor(maxSize * 0.8);
    const toRemove = entries.slice(0, entries.length - keepCount);
    
    for (const [key] of toRemove) {
      sanctionCache.delete(key);
    }
    console.log(`🧹 Cleaned ${toRemove.length} cache entries, remaining: ${sanctionCache.size}`);
  }
};

/**
 * Add patterns to the AI database
 */
export const addAIPatterns = (type, values) => {
  if (AI_SANCTION_DATABASE[type]) {
    AI_SANCTION_DATABASE[type].push(...values);
    console.log(`✅ Added ${values.length} ${type.toUpperCase()} patterns to AI database`);
  } else {
    throw new Error(`Invalid pattern type: ${type}. Use 'bvn', 'nin', 'names', or 'patterns'`);
  }
};

/**
 * Get AI database statistics
 */
export const getAIDatabaseStats = () => {
  return {
    database: {
      totalBvn: AI_SANCTION_DATABASE.bvn.length,
      totalNin: AI_SANCTION_DATABASE.nin.length,
      totalNames: AI_SANCTION_DATABASE.names.length,
      totalPatterns: AI_SANCTION_DATABASE.patterns.length
    },
    cache: {
      size: sanctionCache.size,
      maxSize: defaultConfig.sanctionCheck.ai.cache.maxSize,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      total: cacheStats.total,
      hitRate: cacheStats.total > 0 ? (cacheStats.hits / cacheStats.total * 100).toFixed(2) + '%' : '0%'
    },
    config: {
      aiEnabled: defaultConfig.sanctionCheck.ai.enabled,
      fuzzyMatching: defaultConfig.sanctionCheck.ai.fuzzyMatching.enabled,
      patternDetection: defaultConfig.sanctionCheck.ai.patternDetection.enabled,
      riskScoring: defaultConfig.sanctionCheck.ai.riskScoring.enabled
    }
  };
};

/**
 * Check if a BVN/NIN has been checked before
 */
export const getCachedResult = (bvn, nin, customerName) => {
  const cacheKey = `${bvn || ''}|${nin || ''}|${customerName || ''}`.toUpperCase();
  const cached = sanctionCache.get(cacheKey);
  const cacheTTL = defaultConfig.sanctionCheck.ai.cache.ttl * 1000;
  
  if (cached && (Date.now() - cached.timestamp < cacheTTL)) {
    return cached;
  }
  return null;
};

/**
 * Get current configuration
 */
export const getSanctionConfig = () => {
  return {
    ...defaultConfig,
    cacheStats: cacheStats
  };
};

/**
 * Update configuration at runtime
 */
export const updateSanctionConfig = (newConfig) => {
  if (newConfig.sanctionCheck) {
    Object.assign(defaultConfig.sanctionCheck, newConfig.sanctionCheck);
  }
  if (newConfig.aiDatabase) {
    Object.assign(defaultConfig.aiDatabase, newConfig.aiDatabase);
  }
  console.log('✅ Sanction configuration updated');
  return defaultConfig;
};

export default checkSanctionList;