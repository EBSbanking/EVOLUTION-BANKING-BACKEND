// utils/ledgerHelper.js
import sequelize from '../../config/db.js';
import Ledger from '../models/Ledger.js';

/**
 * Update ledger balance for a GL account without using FOR UPDATE locks
 * @param {string} glAccountNo - GL account number
 * @param {number} amount - Amount to update
 * @param {object} transaction - Sequelize transaction
 * @param {boolean} isCredit - true for credit (decrease balance), false for debit (increase balance)
 * @param {string} branchCode - Branch code (BU_ID) - defaults to '001'
 * @param {string} organizationCode - Organization code - defaults to '1'
 * @param {string} createdBy - User who created the transaction - defaults to 'SYSTEM'
 */
export async function updateLedgerBalance(
  glAccountNo, 
  amount, 
  transaction, 
  isCredit = false, 
  branchCode = '001',
  organizationCode = '1',
  createdBy = 'SYSTEM'
) {
  try {
    // Find the ledger using the correct column name
    const ledger = await Ledger.findOne({
      where: { GL_ACCT_NO: glAccountNo },
      transaction,
    });

    if (!ledger) {
      console.warn(`⚠️ Ledger not found for account: ${glAccountNo}`);
      // ✅ Create the ledger entry if it doesn't exist
      try {
        // Generate a unique GL_ACCT_ID
        const sanitizedAccount = glAccountNo.replace(/[^a-zA-Z0-9]/g, '_');
        const uniqueId = `${sanitizedAccount}_${Date.now()}`;
        
        // Determine GL_ACCT_CAT based on account type
        let glAcctCat = isCredit ? 'LIABILITY' : 'ASSET';
        if (glAccountNo.includes('EXPENSE') || glAccountNo.includes('PROVISION_EXPENSE')) {
          glAcctCat = 'EXPENSE';
        } else if (glAccountNo.includes('PROVISION') || glAccountNo.includes('RESERVE')) {
          glAcctCat = 'CONTRA_ASSET';
        }
        
        // Determine BAL_CD based on account category
        let balCd = isCredit ? 'CREDIT' : 'DEBIT';
        if (glAcctCat === 'ASSET' || glAcctCat === 'EXPENSE') {
          balCd = 'DEBIT';
        } else if (glAcctCat === 'LIABILITY' || glAcctCat === 'EQUITY' || glAcctCat === 'REVENUE') {
          balCd = 'CREDIT';
        } else if (glAcctCat === 'CONTRA_ASSET') {
          balCd = 'CREDIT';
        }
        
        // Generate LEDGER_NO based on branch
        const ledgerNo = `LEDGER_${branchCode}`;
        
        const newLedger = await Ledger.create({
          GL_ACCT_NO: glAccountNo,
          GL_ACCT_ID: uniqueId,
          CHART_OF_ACCT_ID: '10001',
          BAL_CD: balCd,
          SUB_LEDGER_NO: `SL_${branchCode}`,
          ACCT_DESC: `Auto-created account: ${glAccountNo}`,
          LEDGER_NO: ledgerNo,
          BU_ID: branchCode,
          GL_ACCT_CAT: glAcctCat,
          CR_ALLOWED: isCredit ? 1 : 0,
          DR_ALLOWED: isCredit ? 0 : 1,
          REC_ST: 'Active',
          POST_ALLOW: 1,
          CREATED_BY: createdBy,
          SEG_NO: `SEG_${branchCode}`,
          organizationName: 'Default Organization',
          branchName: `Branch ${branchCode}`,
          organizationCode: organizationCode,
          branchCode: branchCode,
          branchType: 'MAIN',
          LEDGER_BALANCE: 0,
          CURRENT_BALANCE: 0,
          AVAILABLE_BALANCE: 0,
          OPENING_BALANCE: 0,
          CURRENCY_CODE: 'NGN',
          createdAt: new Date(),
          updatedAt: new Date()
        }, { transaction });
        console.log(`✅ Auto-created ledger for: ${glAccountNo} (Branch: ${branchCode})`);
        return 0;
      } catch (createError) {
        console.error(`❌ Failed to auto-create ledger ${glAccountNo}:`, createError.message);
        return null;
      }
    }

    const currentBalance = parseFloat(ledger.LEDGER_BALANCE) || 0;
    const newBalance = isCredit ? currentBalance - amount : currentBalance + amount;

    // Update using the correct column names
    await sequelize.query(
      `UPDATE ledgers SET 
        LEDGER_BALANCE = ?, 
        CURRENT_BALANCE = ?, 
        AVAILABLE_BALANCE = ?,
        ROW_TS = NOW() 
       WHERE GL_ACCT_NO = ?`,
      {
        replacements: [newBalance, newBalance, newBalance, glAccountNo],
        transaction
      }
    );

    return newBalance;
  } catch (error) {
    console.error(`❌ Error updating ledger ${glAccountNo}:`, error.message);
    return null;
  }
}

/**
 * Update ledger balance with full context (branch-aware)
 * @param {object} params - Parameters object
 * @param {string} params.glAccountNo - GL account number
 * @param {number} params.amount - Amount to update
 * @param {object} params.transaction - Sequelize transaction
 * @param {boolean} params.isCredit - true for credit, false for debit
 * @param {string} params.branchCode - Branch code
 * @param {string} params.organizationCode - Organization code
 * @param {string} params.createdBy - User who created the transaction
 */
export async function updateLedgerBalanceWithContext({
  glAccountNo,
  amount,
  transaction,
  isCredit = false,
  branchCode = '001',
  organizationCode = '1',
  createdBy = 'SYSTEM'
}) {
  try {
    const ledger = await Ledger.findOne({
      where: { GL_ACCT_NO: glAccountNo },
      transaction,
    });

    if (!ledger) {
      console.warn(`⚠️ Ledger not found for account: ${glAccountNo}`);
      try {
        const sanitizedAccount = glAccountNo.replace(/[^a-zA-Z0-9]/g, '_');
        const uniqueId = `${sanitizedAccount}_${Date.now()}`;
        
        // Determine GL_ACCT_CAT based on account type
        let glAcctCat = isCredit ? 'LIABILITY' : 'ASSET';
        if (glAccountNo.includes('EXPENSE') || glAccountNo.includes('PROVISION_EXPENSE')) {
          glAcctCat = 'EXPENSE';
        } else if (glAccountNo.includes('PROVISION') || glAccountNo.includes('RESERVE')) {
          glAcctCat = 'CONTRA_ASSET';
        }
        
        // Determine BAL_CD based on account category
        let balCd = isCredit ? 'CREDIT' : 'DEBIT';
        if (glAcctCat === 'ASSET' || glAcctCat === 'EXPENSE') {
          balCd = 'DEBIT';
        } else if (glAcctCat === 'LIABILITY' || glAcctCat === 'EQUITY' || glAcctCat === 'REVENUE') {
          balCd = 'CREDIT';
        } else if (glAcctCat === 'CONTRA_ASSET') {
          balCd = 'CREDIT';
        }
        
        const ledgerNo = `LEDGER_${branchCode}`;
        
        const newLedger = await Ledger.create({
          GL_ACCT_NO: glAccountNo,
          GL_ACCT_ID: uniqueId,
          CHART_OF_ACCT_ID: '10001',
          BAL_CD: balCd,
          SUB_LEDGER_NO: `SL_${branchCode}`,
          ACCT_DESC: `Auto-created account: ${glAccountNo}`,
          LEDGER_NO: ledgerNo,
          BU_ID: branchCode,
          GL_ACCT_CAT: glAcctCat,
          CR_ALLOWED: isCredit ? 1 : 0,
          DR_ALLOWED: isCredit ? 0 : 1,
          REC_ST: 'Active',
          POST_ALLOW: 1,
          CREATED_BY: createdBy,
          SEG_NO: `SEG_${branchCode}`,
          organizationName: 'Default Organization',
          branchName: `Branch ${branchCode}`,
          organizationCode: organizationCode,
          branchCode: branchCode,
          branchType: 'MAIN',
          LEDGER_BALANCE: 0,
          CURRENT_BALANCE: 0,
          AVAILABLE_BALANCE: 0,
          OPENING_BALANCE: 0,
          CURRENCY_CODE: 'NGN',
          createdAt: new Date(),
          updatedAt: new Date()
        }, { transaction });
        console.log(`✅ Auto-created ledger for: ${glAccountNo} (Branch: ${branchCode})`);
        return 0;
      } catch (createError) {
        console.error(`❌ Failed to auto-create ledger ${glAccountNo}:`, createError.message);
        return null;
      }
    }

    const currentBalance = parseFloat(ledger.LEDGER_BALANCE) || 0;
    const newBalance = isCredit ? currentBalance - amount : currentBalance + amount;

    await sequelize.query(
      `UPDATE ledgers SET 
        LEDGER_BALANCE = ?, 
        CURRENT_BALANCE = ?, 
        AVAILABLE_BALANCE = ?,
        ROW_TS = NOW() 
       WHERE GL_ACCT_NO = ?`,
      {
        replacements: [newBalance, newBalance, newBalance, glAccountNo],
        transaction
      }
    );

    return newBalance;
  } catch (error) {
    console.error(`❌ Error updating ledger ${glAccountNo}:`, error.message);
    return null;
  }
}

/**
 * Batch update ledger balances without locks
 */
export async function batchUpdateLedgerBalances(entries, transaction) {
  const results = [];
  for (const entry of entries) {
    const { glAccountNo, amount, type, branchCode = '001', organizationCode = '1', createdBy = 'SYSTEM' } = entry;
    const isCredit = type === 'CREDIT';
    const result = await updateLedgerBalance(
      glAccountNo, 
      amount, 
      transaction, 
      isCredit, 
      branchCode,
      organizationCode,
      createdBy
    );
    results.push({ glAccountNo, amount, type, success: result !== null });
  }
  return results;
}