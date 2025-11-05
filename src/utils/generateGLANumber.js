import mongoose from 'mongoose';
import Subfolder from '../models/Subfolder.js';
import { logger } from './logger.js';
import GLAccount from '../models/GLAccount.js';

// Fallback logger if import fails
const fallbackLogger = {
  info: (message, meta) => console.log(`INFO: ${message}`, meta || ''),
  error: (message, meta) => console.error(`ERROR: ${message}`, meta || ''),
  debug: (message, meta) => console.debug(`DEBUG: ${message}`, meta || ''),
  warn: (message, meta) => console.warn(`WARN: ${message}`, meta || ''),
};

/**
 * Helper function to generate GL_ACCT_NO based on selected values.
 * @param {number|string} CHART_OF_ACCT_ID - Chart of accounts ID (0-99)
 * @param {number|string} BAL_CD - Balance code (0-999)
 * @param {number|string} SUB_LEDGER_NO - Subledger number (0-999)
 * @param {number|string} GL_ACCT_CAT - GL Account Category code (0-999)
 * @param {number|string} BU_ID - Business Unit ID (0-999)
 * @param {number|string} LEDGER_NO - Ledger number (0-999)
 * @returns {string} - Generated GL Account Number (e.g., 01-010-112-001-102-110)
 */
export const generateGLAccountNumber = (
  CHART_OF_ACCT_ID,
  BAL_CD,
  SUB_LEDGER_NO,
  GL_ACCT_CAT,
  BU_ID,
  LEDGER_NO
) => {
  try {
    // Validate inputs exist
    const inputs = { CHART_OF_ACCT_ID, BAL_CD, SUB_LEDGER_NO, GL_ACCT_CAT, BU_ID, LEDGER_NO };
    for (const [key, value] of Object.entries(inputs)) {
      if (value === undefined || value === null) {
        throw new Error(`Missing required input: ${key}`);
      }
    }

    // Validate input ranges
    if (!Number.isInteger(Number(CHART_OF_ACCT_ID)) || Number(CHART_OF_ACCT_ID) < 0 || Number(CHART_OF_ACCT_ID) > 99) {
      throw new Error('CHART_OF_ACCT_ID must be an integer between 0 and 99');
    }
    if (!Number.isInteger(Number(BAL_CD)) || Number(BAL_CD) < 0 || Number(BAL_CD) > 999) {
      throw new Error('BAL_CD must be an integer between 0 and 999');
    }
    if (!Number.isInteger(Number(SUB_LEDGER_NO)) || Number(SUB_LEDGER_NO) < 0 || Number(SUB_LEDGER_NO) > 999) {
      throw new Error('SUB_LEDGER_NO must be an integer between 0 and 999');
    }
    if (!Number.isInteger(Number(GL_ACCT_CAT)) || Number(GL_ACCT_CAT) < 0 || Number(GL_ACCT_CAT) > 999) {
      throw new Error('GL_ACCT_CAT must be an integer between 0 and 999');
    }
    if (!Number.isInteger(Number(BU_ID)) || Number(BU_ID) < 0 || Number(BU_ID) > 999) {
      throw new Error('BU_ID must be an integer between 0 and 999');
    }
    if (!Number.isInteger(Number(LEDGER_NO)) || Number(LEDGER_NO) < 0 || Number(LEDGER_NO) > 999) {
      throw new Error('LEDGER_NO must be an integer between 0 and 999');
    }

    const formattedCHART_OF_ACCT_ID = String(CHART_OF_ACCT_ID).padStart(2, '0');
    const formattedBAL_CD = String(BAL_CD).padStart(3, '0');
    const formattedSUB_LEDGER_NO = String(SUB_LEDGER_NO).padStart(3, '0');
    const formattedGL_ACCT_CAT = String(GL_ACCT_CAT).padStart(3, '0');
    const formattedBU_ID = String(BU_ID).padStart(3, '0');
    const formattedLEDGER_NO = String(LEDGER_NO).padStart(3, '0');

    const glAcctNo = `${formattedCHART_OF_ACCT_ID}-${formattedBAL_CD}-${formattedSUB_LEDGER_NO}-${formattedGL_ACCT_CAT}-${formattedBU_ID}-${formattedLEDGER_NO}`;
    
    // Validate format
    validateGLAccountFormat(glAcctNo);

    (logger.info || fallbackLogger.info)('Generated GL Account Number', {
      glAcctNo,
      inputs,
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
 * Auto-generate next GL_ACCT_ID (7-digit string)
 * @param {mongoose.ClientSession} session - MongoDB session for transaction
 * @returns {string} - Next GL_ACCT_ID (e.g., '0000001')
 */
export const generateNextGLAcctId = async (session) => {
  try {
    const lastAcct = await GLAccount.findOne()
      .sort({ GL_ACCT_ID: -1 })
      .limit(1)
      .session(session || null);

    const newGLAcctId = lastAcct
      ? String(parseInt(lastAcct.GL_ACCT_ID, 10) + 1).padStart(7, '0')
      : '0000001';

    (logger.info || fallbackLogger.info)('Generated GL_ACCT_ID', { newGLAcctId });
    return newGLAcctId;
  } catch (error) {
    (logger.error || fallbackLogger.error)('Error generating GL_ACCT_ID', {
      error: error.message,
    });
    throw error;
  }
};

/**
 * Validate GL_ACCT_NO format
 * Accepts:
 *  - 01-012-002-001-102-110 (padded format)
 *  - 1-12-2-1-102-110 (shorter format)
 * @param {string} glAcctNo - GL Account Number to validate
 * @returns {boolean} - True if valid
 * @throws {Error} - If format is invalid
 */
export const validateGLAccountFormat = (glAcctNo) => {
  // Pattern A: NN-NNN-NNN-NNN-NNN-NNN (padded, e.g., 01-012-002-001-102-110)
  const regexPadded = /^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}-\d{3}$/;

  // Pattern B: N-NN-N-N-NNN-NNN (shorter, e.g., 1-12-2-1-102-110)
  const regexShort = /^\d{1,2}-\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}$/;

  const isValid = regexPadded.test(glAcctNo) || regexShort.test(glAcctNo);

  if (!isValid) {
    (logger.warn || fallbackLogger.warn)('Invalid GL Account Number format', {
      glAcctNo,
      expected: 'NN-NNN-NNN-NNN-NNN-NNN or N-NN-N-N-NNN-NNN'
    });
    throw new Error(
      `Invalid GL Account format: ${glAcctNo}. Expected formats: 
       • 01-012-002-001-102-110 (padded) 
       • 1-12-2-1-102-110 (short)`
    );
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