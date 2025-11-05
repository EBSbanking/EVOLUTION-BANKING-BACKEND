// services/accountStatusUpdater.js

import CustomerAccount from '../models/CustomerAccount.js';

// Update dormant accounts by inactivity
const INACTIVITY_PERIOD_MONTHS = 6;

export const updateDormantAccounts = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - INACTIVITY_PERIOD_MONTHS);

    const accountsToDormant = await CustomerAccount.find({
      REC_ST: 'ACTIVE',
      lastActivityDate: { $lt: cutoffDate }
    });

    for (const account of accountsToDormant) {
      account.REC_ST = 'DORMANT';
      await account.save();
      console.log(`Account ${account.ACCT_NO} marked as DORMANT due to inactivity.`);
    }
  } catch (error) {
    console.error('Error updating dormant accounts:', error);
  }
};

export const countDormantAccountsToUpdate = async () => {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - INACTIVITY_PERIOD_MONTHS);

  const count = await CustomerAccount.countDocuments({
    REC_ST: 'ACTIVE',
    lastActivityDate: { $lt: cutoffDate }
  });

  return count;
};
