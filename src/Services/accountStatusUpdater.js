// services/accountStatusUpdater.js
import { Op } from 'sequelize';
import CustomerAccount from '../models/CustomerAccount.js';
import logger from '../utils/logger.js';

// Inactivity period in months (6 months = 180 days)
const INACTIVITY_PERIOD_MONTHS = 6;

/**
 * Helper: get the correct column name for last activity date.
 * First tries 'updated_at', then 'last_activity_date', then falls back to 'updated_at'.
 * @returns {Promise<string>}
 */
let _cachedColumnName = null;
async function getLastActivityColumn() {
  if (_cachedColumnName) return _cachedColumnName;
  try {
    // Try 'updated_at'
    await CustomerAccount.findOne({ attributes: ['updated_at'], limit: 1 });
    _cachedColumnName = 'updated_at';
    return 'updated_at';
  } catch (err) {
    // Try 'last_activity_date'
    try {
      await CustomerAccount.findOne({ attributes: ['last_activity_date'], limit: 1 });
      _cachedColumnName = 'last_activity_date';
      console.log('⚠️ Using last_activity_date column for dormancy check');
      return 'last_activity_date';
    } catch (err2) {
      // Fallback: use 'updated_at' (will cause error if still missing)
      console.warn('⚠️ Neither updated_at nor last_activity_date found – defaulting to updated_at');
      _cachedColumnName = 'updated_at';
      return 'updated_at';
    }
  }
}

/**
 * Count dormant accounts that need to be updated
 * @returns {Promise<number>} - Number of dormant accounts
 */
export const countDormantAccountsToUpdate = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - INACTIVITY_PERIOD_MONTHS);
    
    console.log('📊 Counting dormant accounts with cutoff:', cutoffDate.toISOString());

    const columnName = await getLastActivityColumn();
    const count = await CustomerAccount.count({
      where: {
        status: 'ACTIVE',
        [columnName]: {
          [Op.lt]: cutoffDate
        }
      }
    });

    console.log(`✅ Dormant account count: ${count}`);
    return count;
  } catch (error) {
    console.error('❌ Error counting dormant accounts:', error);
    // Return 0 instead of throwing to avoid breaking status endpoints
    return 0;
  }
};

/**
 * Update dormant accounts to dormant status
 * @returns {Promise<Object>} - Update results with count
 */
export const updateDormantAccounts = async () => {
  const transaction = await CustomerAccount.sequelize.transaction();
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - INACTIVITY_PERIOD_MONTHS);

    console.log('📊 Updating dormant accounts with cutoff:', cutoffDate.toISOString());

    const columnName = await getLastActivityColumn();

    // First, get the accounts to update
    const accountsToDormant = await CustomerAccount.findAll({
      where: {
        status: 'ACTIVE',
        [columnName]: {
          [Op.lt]: cutoffDate
        }
      },
      transaction
    });

    if (accountsToDormant.length === 0) {
      await transaction.commit();
      console.log('📝 No dormant accounts to update');
      return { updated: 0 };
    }

    console.log(`📝 Found ${accountsToDormant.length} accounts to mark as dormant`);

    // Update in bulk
    const [updatedCount] = await CustomerAccount.update(
      {
        status: 'DORMANT',
        updated_at: new Date()
      },
      {
        where: {
          status: 'ACTIVE',
          [columnName]: {
            [Op.lt]: cutoffDate
          }
        },
        transaction
      }
    );

    // Log each account
    for (const account of accountsToDormant) {
      console.log(`   ✅ Account ${account.account_number} (ID: ${account.id}) marked as DORMANT due to inactivity.`);
    }
    
    await transaction.commit();
    console.log(`✅ Successfully updated ${updatedCount} accounts to dormant status`);
    return { updated: updatedCount };
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error updating dormant accounts:', error);
    throw error;
  }
};

/**
 * Get accounts that will become dormant soon
 * @param {number} daysThreshold - Days before dormancy to consider (default: 30)
 * @returns {Promise<Array>} - Accounts nearing dormancy
 */
export const getAccountsNearingDormancy = async (daysThreshold = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - INACTIVITY_PERIOD_MONTHS);
    
    const warningDate = new Date(cutoffDate);
    warningDate.setDate(warningDate.getDate() + daysThreshold);

    console.log('📊 Getting accounts nearing dormancy between:', {
      from: cutoffDate.toISOString(),
      to: warningDate.toISOString()
    });

    const columnName = await getLastActivityColumn();

    const accounts = await CustomerAccount.findAll({
      where: {
        status: 'ACTIVE',
        [columnName]: {
          [Op.between]: [cutoffDate, warningDate]
        }
      },
      attributes: [
        'id', 
        'account_number', 
        'customer_id', 
        columnName,
        'status',
        'account_name'
      ],
      limit: 100,
      order: [[columnName, 'ASC']]
    });

    console.log(`✅ Found ${accounts.length} accounts nearing dormancy`);
    return accounts;
    
  } catch (error) {
    console.error('❌ Error getting accounts nearing dormancy:', error);
    throw error;
  }
};

/**
 * Reactivate a dormant account
 * @param {string|number} accountId - Account ID
 * @returns {Promise<Object>} - Updated account
 */
export const reactivateDormantAccount = async (accountId) => {
  const transaction = await CustomerAccount.sequelize.transaction();
  
  try {
    console.log('📊 Reactivating dormant account:', accountId);
    
    const account = await CustomerAccount.findByPk(accountId, { transaction });
    
    if (!account) {
      throw new Error(`Account with ID ${accountId} not found`);
    }
    
    console.log('📋 Found account:', {
      id: account.id,
      accountNo: account.account_number,
      status: account.status
    });
    
    if (account.status !== 'DORMANT') {
      throw new Error(`Account is not dormant. Current status: ${account.status}`);
    }
    
    // Update the account
    account.status = 'ACTIVE';
    account.updated_at = new Date();
    // Also update the activity column to now
    const columnName = await getLastActivityColumn();
    account[columnName] = new Date();
    
    await account.save({ transaction });
    await transaction.commit();
    
    console.log(`✅ Account ${account.account_number} reactivated from dormant status`);
    return account;
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error reactivating dormant account:', error);
    throw error;
  }
};

/**
 * Get dormant accounts statistics
 * @returns {Promise<Object>} - Dormant accounts statistics
 */
export const getDormantAccountsStats = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - INACTIVITY_PERIOD_MONTHS);
    
    // Get counts by status
    const totalActive = await CustomerAccount.count({
      where: { status: 'ACTIVE' }
    });
    
    const totalDormant = await CustomerAccount.count({
      where: { status: 'DORMANT' }
    });
    
    const totalPending = await CustomerAccount.count({
      where: { status: 'PENDING' }
    });
    
    const totalSuspended = await CustomerAccount.count({
      where: { status: 'SUSPENDED' }
    });
    
    const totalClosed = await CustomerAccount.count({
      where: { status: 'CLOSED' }
    });
    
    const columnName = await getLastActivityColumn();
    const pendingDormant = await CustomerAccount.count({
      where: {
        status: 'ACTIVE',
        [columnName]: {
          [Op.lt]: cutoffDate
        }
      }
    });
    
    return {
      total: totalActive + totalDormant + totalPending + totalSuspended + totalClosed,
      byStatus: {
        ACTIVE: totalActive,
        DORMANT: totalDormant,
        PENDING: totalPending,
        SUSPENDED: totalSuspended,
        CLOSED: totalClosed
      },
      pendingDormant,
      inactivityPeriodMonths: INACTIVITY_PERIOD_MONTHS,
      cutoffDate: cutoffDate.toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error getting dormant accounts stats:', error);
    throw error;
  }
};

// Export all functions (keeping the same interface as the original)
export default {
  countDormantAccountsToUpdate,
  updateDormantAccounts,
  getAccountsNearingDormancy,
  reactivateDormantAccount,
  getDormantAccountsStats
};