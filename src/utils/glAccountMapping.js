// utils/glAccountMapping.js
import GLAccount from '../models/GLAccount.js';

export const getMappedGLAccounts = async () => {
    const mappings = {
        liability: { ACCT_DESC: 'Liability Account', ACCT_NO: '1-102-100-004-101' },
        interBranch: { ACCT_DESC: 'Inter-Branch Account', ACCT_NO: '1-102-100-005-101' },
        branchOps: { ACCT_DESC: 'Branch Operations Account', ACCT_NO: '1-102-100-006-101' },
    };
    

    const accounts = {};

    for (const [key, { ACCT_DESC, ACCT_NO }] of Object.entries(mappings)) {
        const account = await GLAccount.findOne({ ACCT_NO, ACCT_DESC });
        if (!account) {
            throw new Error(`GL Account not found for ${key}`);
        }
        accounts[key] = account;
    }
    

    return accounts;
};

