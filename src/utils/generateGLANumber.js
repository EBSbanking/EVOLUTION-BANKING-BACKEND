import mongoose from 'mongoose';
import Subfolder from '../models/Subfolder.js';
import { logger } from './logger.js';
import GLAccount from '../models/GLAccount.js'; // Ensure model import aligns with current schema (with organizationName, branchName)

// Fallback logger if import fails
const fallbackLogger = {
  info: (message, meta) => console.log(`INFO: ${message}`, meta || ''),
  error: (message, meta) => console.error(`ERROR: ${message}`, meta || ''),
  debug: (message, meta) => console.debug(`DEBUG: ${message}`, meta || ''),
  warn: (message, meta) => console.warn(`WARN: ${message}`, meta || ''),
};

/**
 * Configuration for flexible GL account segments. Customize lengths and padding here.
 * Example: { min: 1, max: 3, pad: 3 } allows 1-3 digits, padded to 3.
 */
const SEGMENT_CONFIG = {
  CHART_OF_ACCT_ID: { min: 1, max: 2, pad: 2 },
  BAL_CD: { min: 1, max: 3, pad: 3 },
  SUB_LEDGER_NO: { min: 1, max: 3, pad: 3 },
  GL_ACCT_CAT: { min: 1, max: 3, pad: 3 },
  BU_ID: { min: 1, max: 3, pad: 3 }, // branchCode
  LEDGER_NO: { min: 1, max: 3, pad: 3 },
};

/**
 * Helper function to generate GL_ACCT_NO based on selected values with flexible segments.
 * Supports variable lengths (1-3 digits per segment) and optional alphanumeric.
 * @param {number|string} CHART_OF_ACCT_ID - Chart of accounts ID (e.g., 1 or 'A1')
 * @param {number|string} BAL_CD - Balance code (e.g., 10 or 'B2')
 * @param {number|string} SUB_LEDGER_NO - Subledger number (e.g., 112)
 * @param {number|string} GL_ACCT_CAT - GL Account Category code (e.g., 001)
 * @param {number|string} BU_ID - Business Unit ID / branchCode (e.g., 102)
 * @param {number|string} LEDGER_NO - Ledger number (e.g., 110)
 * @param {Object} [configOverrides] - Optional overrides for segment config
 * @returns {string} - Generated GL Account Number (e.g., '01-010-112-001-102-110' or flexible variant)
 */
export const generateGLAccountNumber = (
  CHART_OF_ACCT_ID,
  BAL_CD,
  SUB_LEDGER_NO,
  GL_ACCT_CAT,
  BU_ID,
  LEDGER_NO,
  configOverrides = {}
) => {
  try {
    // Validate inputs exist
    const inputs = { CHART_OF_ACCT_ID, BAL_CD, SUB_LEDGER_NO, GL_ACCT_CAT, BU_ID, LEDGER_NO };
    for (const [key, value] of Object.entries(inputs)) {
      if (value === undefined || value === null) {
        throw new Error(`Missing required input: ${key}`);
      }
    }

    // Use overridden or default config
    const effectiveConfig = { ...SEGMENT_CONFIG, ...configOverrides };

    // Validate and format each segment
    const segments = [];
    const segmentKeys = ['CHART_OF_ACCT_ID', 'BAL_CD', 'SUB_LEDGER_NO', 'GL_ACCT_CAT', 'BU_ID', 'LEDGER_NO'];
    for (const key of segmentKeys) {
      const value = inputs[key];
      const { min, max, pad } = effectiveConfig[key];
      const strValue = String(value).trim();

      // Allow alphanumeric, but enforce length
      if (strValue.length < min || strValue.length > max) {
        throw new Error(`${key} must be ${min}-${max} characters (alphanumeric allowed)`);
      }

      // Pad if needed (left-pad with zeros for numbers, or spaces/no-pad for alpha)
      const padded = Number.isNaN(Number(strValue)) 
        ? strValue.padEnd(pad, ' ') // For alpha, right-pad with spaces or customize
        : strValue.padStart(pad, '0'); // For numeric, left-pad with zeros

      segments.push(padded);
    }

    const glAcctNo = segments.join('-');
    
    // Validate overall format (flexible regex for variable lengths)
    validateGLAccountFormat(glAcctNo, effectiveConfig);

    (logger.info || fallbackLogger.info)('Generated GL Account Number', {
      glAcctNo,
      inputs,
      config: effectiveConfig,
    });
    return glAcctNo;
  } catch (error) {
    (logger.error || fallbackLogger.error)('Error generating GL Account Number', {
      error: error.message,
      inputs,
    });
    throw error;
  }
};

/**
 * Auto-generate next GL_ACCT_ID (7-digit string), scoped to organization/branch if provided.
 * @param {mongoose.ClientSession} session - MongoDB session for transaction
 * @param {string} [organizationName] - Optional filter for organization
 * @param {string} [branchName] - Optional filter for branch
 * @returns {string} - Next GL_ACCT_ID (e.g., '0000001')
 */
export const generateNextGLAcctId = async (session, organizationName = null, branchName = null) => {
  try {
    const filter = {};
    if (organizationName) filter.organizationName = organizationName;
    if (branchName) filter.branchName = branchName;

    const lastAcct = await GLAccount.findOne(filter)
      .sort({ GL_ACCT_ID: -1 })
      .limit(1)
      .session(session || null);

    const newGLAcctId = lastAcct
      ? String(parseInt(lastAcct.GL_ACCT_ID, 10) + 1).padStart(7, '0')
      : '0000001';

    (logger.info || fallbackLogger.info)('Generated GL_ACCT_ID', { newGLAcctId, filter });
    return newGLAcctId;
  } catch (error) {
    (logger.error || fallbackLogger.error)('Error generating GL_ACCT_ID', {
      error: error.message,
      filter: { organizationName, branchName },
    });
    throw error;
  }
};

/**
 * Validate GL_ACCT_NO format with flexible segment lengths.
 * @param {string} glAcctNo - GL Account Number to validate
 * @param {Object} [config] - Segment config for validation (from SEGMENT_CONFIG)
 * @returns {boolean} - True if valid
 * @throws {Error} - If format is invalid
 */
export const validateGLAccountFormat = (glAcctNo, config = SEGMENT_CONFIG) => {
  // Split by dashes and validate each segment against config
  const segments = glAcctNo.split('-');
  if (segments.length !== 6) {
    throw new Error(`GL_ACCT_NO must have exactly 6 segments separated by dashes: ${glAcctNo}`);
  }

  const segmentKeys = ['CHART_OF_ACCT_ID', 'BAL_CD', 'SUB_LEDGER_NO', 'GL_ACCT_CAT', 'BU_ID', 'LEDGER_NO'];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i].trim();
    const { min, max } = config[segmentKeys[i]];
    if (segment.length < min || segment.length > max) {
      throw new Error(`${segmentKeys[i]} segment must be ${min}-${max} characters: ${segment}`);
    }
    // Optional: Enforce alphanumeric if needed
    if (!/^[a-zA-Z0-9 ]+$/.test(segment)) {
      throw new Error(`${segmentKeys[i]} segment must be alphanumeric or spaces: ${segment}`);
    }
  }

  if (!/^[a-zA-Z0-9 -]+$/.test(glAcctNo)) {
    throw new Error(`GL_ACCT_NO contains invalid characters: ${glAcctNo}`);
  }

  return true;
};

/**
 * Generate Transaction ID
 * @returns {string} - Generated Transaction ID (e.g., timestamp + random 4 digits)
 */
export const generateTransactionId = () => {
  const base = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);
  const transactionId = base + random;
  (logger.info || fallbackLogger.info)('Generated Transaction ID', { transactionId });
  return transactionId;
};

/**
 * Generate Journal ID
 * @returns {string} - Generated Journal ID (e.g., last 8 digits of timestamp + random 4 digits)
 */
export const generateJournalId = () => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(1000 + Math.random() * 9000);
  const journalId = `${timestamp}${random}`;
  (logger.info || fallbackLogger.info)('Generated Journal ID', { journalId });
  return journalId;
};

/**
 * Create Root Subfolder
 * @param {string} createdBy - User ID creating the subfolder
 * @param {number} ledgerNo - Ledger number
 * @param {Object} options - Options object containing MongoDB session
 * @returns {Object} - Created subfolder document
 */
export const createRootSubfolder = async (createdBy, ledgerNo, { session }) => {
  try {
    // Find the highest subfolderId to generate the next sequential ID
    const maxSubfolder = await Subfolder.findOne()
      .sort({ subfolderId: -1 })
      .session(session || null);
    const subfolderId = maxSubfolder ? Number(maxSubfolder.subfolderId) + 1 : 1;
    const parentId = subfolderId;

    const newSubfolder = new Subfolder({
      subfolderId,
      parentId,
      createdBy,
      ledgerNo,
      isRoot: true,
      name: `Root-${subfolderId}`,
    });

    await newSubfolder.save({ session });
    (logger.info || fallbackLogger.info)('Created root subfolder', {
      subfolderId,
      parentId,
      createdBy,
      ledgerNo,
    });
    return newSubfolder;
  } catch (error) {
    (logger.error || fallbackLogger.error)('Error creating root subfolder', {
      error: error.message,
      createdBy,
      ledgerNo,
    });
    throw error;
  }
};