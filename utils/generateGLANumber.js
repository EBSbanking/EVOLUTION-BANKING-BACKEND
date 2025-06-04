// utils/generateGLANumber.js

/**
 * Helper function to generate GL_ACCT_NO based on selected values.
 * @param {number} CHART_OF_ACCT_ID - Chart of accounts ID
 * @param {number} BAL_CD - Balance code
 * @param {number} SUB_LEDGER_NO - Subledger number
 * @param {number} LEDGER_NO - Ledger number
 * @param {number} BU_ID - Business Unit ID
 * @returns {string} - Generated GL Account Number
 */
export const generateGLAccountNumber = (
    CHART_OF_ACCT_ID,
    BAL_CD,
    SUB_LEDGER_NO,
    LEDGER_NO,
    BU_ID
) => {
    const formattedCHART_OF_ACCT_ID = String(CHART_OF_ACCT_ID).padStart(1, '0');
    const formattedBAL_CD = String(BAL_CD).padStart(3, '0');
    const formattedSUB_LEDGER_NO = String(SUB_LEDGER_NO).padStart(3, '0');
    const formattedLEDGER_NO = String(LEDGER_NO).padStart(3, '0');
    const formattedBU_ID = String(BU_ID).padStart(3, '0');

    return `${formattedCHART_OF_ACCT_ID}-${formattedBAL_CD}-${formattedSUB_LEDGER_NO}-${formattedLEDGER_NO}-${formattedBU_ID}`;
};
