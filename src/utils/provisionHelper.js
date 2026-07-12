// utils/provisionHelper.js
import LoanProvision from '../models/LoanProvision.js';
import LoanProduct from '../models/LoanProduct.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import Ledger from '../models/Ledger.js';
import sequelize from '../../config/db.js';

/**
 * Get the provision GL account from loan product configuration.
 * Supports branch overrides and wildcards (for global products).
 */
function getProvisionGLAccountFromProduct(loanProduct, branchCode) {
  let defaultGLAccounts = {};
  let branchGLAccounts = [];

  // Parse default GL accounts
  if (loanProduct.default_gl_accounts) {
    defaultGLAccounts = typeof loanProduct.default_gl_accounts === 'string'
      ? JSON.parse(loanProduct.default_gl_accounts)
      : loanProduct.default_gl_accounts;
  } else if (loanProduct.defaultGLAccounts) {
    defaultGLAccounts = typeof loanProduct.defaultGLAccounts === 'string'
      ? JSON.parse(loanProduct.defaultGLAccounts)
      : loanProduct.defaultGLAccounts;
  }

  // Parse branch GL accounts
  if (loanProduct.branch_gl_accounts) {
    branchGLAccounts = typeof loanProduct.branch_gl_accounts === 'string'
      ? JSON.parse(loanProduct.branch_gl_accounts)
      : loanProduct.branch_gl_accounts;
  } else if (loanProduct.branchGLAccounts) {
    branchGLAccounts = typeof loanProduct.branchGLAccounts === 'string'
      ? JSON.parse(loanProduct.branchGLAccounts)
      : loanProduct.branchGLAccounts;
  }

  // Find branch-specific config
  const branchConfig = Array.isArray(branchGLAccounts)
    ? branchGLAccounts.find(b => b.branchCode === branchCode || b.branchCode === '*')
    : null;

  // Try branch override, then default
  let provisionGL = branchConfig?.provisionGLAccount ||
                    branchConfig?.provision_g_l_account ||
                    defaultGLAccounts.provisionGLAccount ||
                    defaultGLAccounts.provision_g_l_account;

  // If product is global and we have a wildcard pattern, resolve it
  if (provisionGL && loanProduct.is_global_product) {
    const branchPadded = branchCode.toString().padStart(3, '0');
    provisionGL = provisionGL.replace(/\*{3}/g, branchPadded)
                             .replace(/#{3}/g, branchPadded)
                             .replace(/XXX/g, branchPadded);
  }

  return provisionGL || null;
}

/**
 * Create a loan provision record and post GL entries.
 * @param {Object} params
 * @param {Object} params.loanAccount - LoanAccount instance
 * @param {string} params.branchCode - branch code
 * @param {number} params.disbursedAmount - the amount just disbursed
 * @param {string} params.createdBy - user ID or 'SYSTEM'
 * @param {Object} params.transaction - Sequelize transaction
 * @returns {Promise<Object>} the created provision record
 */
export async function createLoanProvision({ loanAccount, branchCode, disbursedAmount, createdBy = 'SYSTEM', transaction }) {
  // 1. Retrieve loan product
  const loanProduct = await LoanProduct.findOne({
    where: { prod_id: loanAccount.LOAN_PRODUCT_ID },
    transaction
  });
  if (!loanProduct) {
    throw new Error(`Loan product with prod_id ${loanAccount.LOAN_PRODUCT_ID} not found`);
  }

  // 2. Resolve provision GL account using helper
  const branch = branchCode || loanAccount.BU_ID || '001';
  const provisionGL = getProvisionGLAccountFromProduct(loanProduct, branch);
  if (!provisionGL) {
    throw new Error(`Provision GL account not configured for product ${loanProduct.prod_id}`);
  }

  // 3. Calculate provision
  const provisionRate = 0.01; // 1%
  const provisionAmount = disbursedAmount * provisionRate;

  // 4. Create provision record
  const provision = await LoanProvision.create({
    loan_account_id: loanAccount.id,
    acct_no: loanAccount.ACCT_NO,
    disbursement_amount: disbursedAmount,
    provision_rate: provisionRate,
    provision_amount: provisionAmount,
    gl_account: provisionGL,
    provision_date: new Date(),
    status: 'ACTIVE',
    created_by: createdBy
  }, { transaction });

  // 5. Post GL entries (Credit provision GL, Debit provision expense)
  const expenseGL = 'PROVISION_EXPENSE_GL'; // You can make this configurable per product

  // Helper to ensure Ledger entry exists
  async function ensureLedgerForBranch(glAccountNo, accountType, branchCode, transaction) {
    let ledger = await Ledger.findOne({ where: { GL_ACCT_NO: glAccountNo }, transaction });
    if (ledger) return ledger;
    const ledgerId = `${accountType}_${branchCode}_${Date.now()}`;
    ledger = await Ledger.create({
      GL_ACCT_NO: glAccountNo,
      GL_ACCT_ID: ledgerId,
      CHART_OF_ACCT_ID: '10001',
      BAL_CD: accountType === 'ASSET' ? 'DEBIT' : 'CREDIT',
      SUB_LEDGER_NO: '001',
      ACCT_DESC: `${accountType} account for branch ${branchCode}`,
      LEDGER_NO: '001',
      BU_ID: branchCode,
      GL_ACCT_CAT: accountType,
      CREATED_BY: 'SYSTEM',
      SEG_NO: '001',
      organizationName: 'Default Organization',
      branchName: `Branch ${branchCode}`,
      organizationCode: '1',
      branchCode: branchCode,
      REC_ST: 'Active',
      CR_ALLOWED: true,
      DR_ALLOWED: true,
      POST_ALLOW: true,
      CURRENCY_CODE: 'NGN',
      LEDGER_BALANCE: 0,
      CURRENT_BALANCE: 0,
      AVAILABLE_BALANCE: 0,
      OPENING_BALANCE: 0,
      ROW_TS: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    }, { transaction });
    return ledger;
  }

  // Ensure both GL accounts exist in Ledger
  const provisionLedger = await ensureLedgerForBranch(provisionGL, 'CONTRA_ASSET', branch, transaction);
  const expenseLedger = await ensureLedgerForBranch(expenseGL, 'EXPENSE', branch, transaction);

  // Create GL transaction entry (journal)
  const numericTxId = Date.now() + Math.floor(Math.random() * 1000);
  const transactionIdStr = `GL-PROV-${numericTxId}`;
  const journalId = `JRNL-PROV-${loanAccount.id}-${numericTxId}`;

  await GLAccountTransaction.create({
    JOURNAL_ID: journalId,
    TRANSACTION_ID: transactionIdStr,
    DR_ACCT_NO: expenseGL,                // Debit expense
    CR_ACCT_NO: provisionGL,              // Credit provision (contra-asset)
    AMOUNT: provisionAmount,
    NARRATION: `Loan provision for loan ${loanAccount.ACCT_NO} (1% of ₦${disbursedAmount})`,
    CREATED_BY: createdBy,
    TRANSACTION_TYPE: 'LOAN_PROVISION',
    CURRENCY_CODE: 'NGN',
    STATUS: 'POSTED',
    TransactionId: numericTxId,
    createdAt: new Date(),
    updatedAt: new Date()
  }, { transaction });

  // Update Ledger balances
  await provisionLedger.update({
    LEDGER_BALANCE: (parseFloat(provisionLedger.LEDGER_BALANCE) || 0) + provisionAmount,
    CURRENT_BALANCE: (parseFloat(provisionLedger.CURRENT_BALANCE) || 0) + provisionAmount,
    ROW_TS: new Date()
  }, { transaction });
  await expenseLedger.update({
    LEDGER_BALANCE: (parseFloat(expenseLedger.LEDGER_BALANCE) || 0) + provisionAmount,
    CURRENT_BALANCE: (parseFloat(expenseLedger.CURRENT_BALANCE) || 0) + provisionAmount,
    ROW_TS: new Date()
  }, { transaction });

  console.log(`✅ Loan provision of ₦${provisionAmount} created for loan ${loanAccount.ACCT_NO}`);
  return provision;
}