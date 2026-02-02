// services/drawerService.js
import { Op } from 'sequelize';

export class DrawerService {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.Drawer = sequelize.models.Drawer;
  }

  // Unified drawer finder - used by BOTH functions
  async findDrawerByIdentifier(identifier, transaction = null) {
    const options = transaction ? { transaction } : {};
    
    // Try multiple identifier types
    const whereClause = {
      [Op.or]: [
        { DRAWER_NO: identifier.toString() },
        { DRAWER_ID: parseInt(identifier) || 0 },
        { id: parseInt(identifier) || 0 }
      ]
    };

    const drawer = await this.Drawer.findOne({
      where: whereClause,
      ...options
    });

    if (!drawer) return null;

    return {
      // Raw data for compatibility
      ...drawer.dataValues,
      // Convenience methods
      updateBalance: async (newBalance, txn = transaction) => {
        await this.updateDrawerBalance(drawer.id, newBalance, txn);
      }
    };
  }

  // Unified balance updater - used by BOTH functions
  async updateDrawerBalance(drawerId, newBalance, transaction = null) {
    const options = transaction ? { transaction } : {};
    
    await this.Drawer.update(
      {
        CURRENT_BALANCE: parseFloat(newBalance.toFixed(2)),
        VERSION_NO: this.sequelize.literal('COALESCE(VERSION_NO, 0) + 1'),
        updatedAt: new Date()
      },
      {
        where: { id: drawerId },
        ...options
      }
    );

    // Verify the update
    const updatedDrawer = await this.Drawer.findOne({
      where: { id: drawerId },
      attributes: ['CURRENT_BALANCE', 'DRAWER_NO', 'WF_STATUS'],
      ...options
    });

    console.log(`✅ Drawer ${updatedDrawer?.DRAWER_NO} balance updated to: ₦${updatedDrawer?.CURRENT_BALANCE?.toFixed(2)}`);
    
    return updatedDrawer;
  }

  // Check if drawer is open and valid for transactions
  async validateDrawerForTransaction(drawer, amount, transactionType) {
    if (!drawer) {
      return { valid: false, message: 'Drawer not found' };
    }

    if (drawer.WF_STATUS !== 'OPEN') {
      return { 
        valid: false, 
        message: 'Drawer is not open for transactions',
        currentStatus: drawer.WF_STATUS 
      };
    }

    if (drawer.REC_ST !== 'A') {
      return { valid: false, message: 'Drawer is not active' };
    }

    // Check balance for withdrawals/debits
    const currentBalance = parseFloat(drawer.CURRENT_BALANCE) || 0;
    const isWithdrawal = ['WITHDRAWAL', 'DEBIT', 'CASH_DISBURSEMENT'].includes(transactionType.toUpperCase());
    
    if (isWithdrawal && currentBalance < amount) {
      return {
        valid: false,
        message: `Insufficient drawer balance. Available: ₦${currentBalance.toFixed(2)}, Required: ₦${amount.toFixed(2)}`
      };
    }

    // Check limits
    const minBalance = parseFloat(drawer.MIN_BAL) || 0;
    const maxBalance = parseFloat(drawer.MAX_BAL) || 999999999;
    const newBalance = isWithdrawal ? currentBalance - amount : currentBalance + amount;
    
    let limitExceeded = false;
    if (newBalance > maxBalance || newBalance < minBalance) {
      limitExceeded = true;
    }

    return {
      valid: true,
      currentBalance,
      newBalance,
      limitExceeded,
      drawerInfo: {
        id: drawer.id,
        DRAWER_ID: drawer.DRAWER_ID,
        DRAWER_NO: drawer.DRAWER_NO,
        DRAWER_NM: drawer.DRAWER_NM
      }
    };
  }
}

// Export singleton instance
let drawerServiceInstance = null;
export const getDrawerService = (sequelize) => {
  if (!drawerServiceInstance && sequelize) {
    drawerServiceInstance = new DrawerService(sequelize);
  }
  return drawerServiceInstance;
};