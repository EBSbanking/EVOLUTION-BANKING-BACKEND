// utils/glAccountHelper.js
import GLAccount from '../models/GLAccount.js';

/**
 * Resolve a GL account pattern containing wildcards (***, ###, XXX) into a concrete account number.
 */
export function resolveGLAccountForBranch(pattern, branchCode) {
  const branchPadded = branchCode.toString().padStart(3, '0');
  return pattern.replace(/\*{3}/g, branchPadded)
                .replace(/#{3}/g, branchPadded)
                .replace(/XXX/g, branchPadded);
}

/**
 * Ensure a GL account exists for a given branch, product and pattern.
 * If missing, create it using the pattern and sensible defaults.
 */
export async function ensureGLAccountForBranch(pattern, branchCode, accountType, product, transaction) {
  const resolvedAccountNo = resolveGLAccountForBranch(pattern, branchCode);
  let glAccount = await GLAccount.findOne({
    where: { GL_ACCT_NO: resolvedAccountNo },
    transaction
  });
  if (glAccount) return glAccount;

  // Create a new GL account with default values (adjust column names to match your schema)
  const glAcctId = `${accountType}_${branchCode}_${Date.now()}`;
  glAccount = await GLAccount.create({
    GL_ACCT_NO: resolvedAccountNo,
    GL_ACCT_ID: glAcctId,
    accountType: accountType,           // maps to account_type column
    REC_ST: 'Active',
    CREATED_BY: 'SYSTEM',
    coaStructure: '{}',
    organizationName: product?.organizationName || 'Default Organization',
    organizationCode: product?.organizationCode || 1,
    branchName: `Branch ${branchCode}`,
    branchCode: branchCode,
    level: 4,
    LEDGER_NO: 'LEDGER001',
    subfolderId: 'SUB001',
    BAL_CD: 'BAL_CD',
    SUB_LEDGER_NO: 'SUB_LEDGER001',
    CHART_OF_ACCT_ID: 'CHART001',
    ACCT_DESC: `${accountType} account for branch ${branchCode}`,
    GL_ACCT_CAT: accountType,
    CR_ALLOWED: true,
    DR_ALLOWED: true,
    POST_ALLOW: true,
    CURRENCY_CODE: 'NGN',
    metadata: '{}',
    createdAt: new Date(),
    updatedAt: new Date()
  }, { transaction });
  console.log(`✅ Auto-created GL account ${resolvedAccountNo} (${accountType}) for branch ${branchCode}`);
  return glAccount;
}

// Default export for compatibility with `import ... from '...'`
export default {
  resolveGLAccountForBranch,
  ensureGLAccountForBranch
};