// services/drawerService.js
import { Op } from 'sequelize';

export class DrawerService {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.Drawer = sequelize.models.Drawer;
  }

 // In drawerService.js
async findDrawerByIdentifier(identifier, transaction = null) {
  const options = transaction ? { transaction } : {};
  
  if (!identifier) return null;
  
  const identifierStr = identifier.toString().trim();
  
  const whereClause = {
    [Op.or]: [
      { DRAWER_NO: identifierStr },
      { USER_ID: identifierStr },  // This is key
      { DRAWER_ID: parseInt(identifierStr) || 0 },
      { id: parseInt(identifierStr) || 0 }
    ]
  };
  
  const drawer = await this.Drawer.findOne({
    where: whereClause,
    ...options
  });
  
  return drawer;
}

  /**
   * Find drawer by USER_ID
   * @param {string} userId - User ID
   * @param {object} transaction - Optional transaction object
   * @returns {Promise<object|null>} Drawer object or null
   */
  async findDrawerByUserId(userId, transaction = null) {
    const options = transaction ? { transaction } : {};
    
    if (!userId) {
      console.warn('⚠️ findDrawerByUserId called with null/undefined userId');
      return null;
    }

    try {
      const drawer = await this.Drawer.findOne({
        where: { USER_ID: userId.toString().trim() },
        ...options
      });

      if (!drawer) {
        console.log(`⚠️ Drawer not found for USER_ID: ${userId}`);
        return null;
      }

      return drawer;
    } catch (error) {
      console.error(`❌ Error finding drawer by USER_ID ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Find drawer by DRAWER_NO
   * @param {string} drawerNo - Drawer number
   * @param {object} transaction - Optional transaction object
   * @returns {Promise<object|null>} Drawer object or null
   */
  async findDrawerByDrawerNo(drawerNo, transaction = null) {
    const options = transaction ? { transaction } : {};
    
    if (!drawerNo) {
      console.warn('⚠️ findDrawerByDrawerNo called with null/undefined drawerNo');
      return null;
    }

    try {
      const drawer = await this.Drawer.findOne({
        where: { DRAWER_NO: drawerNo.toString().trim() },
        ...options
      });

      if (!drawer) {
        console.log(`⚠️ Drawer not found for DRAWER_NO: ${drawerNo}`);
        return null;
      }

      return drawer;
    } catch (error) {
      console.error(`❌ Error finding drawer by DRAWER_NO ${drawerNo}:`, error);
      throw error;
    }
  }

  /**
   * Get all drawers with optional filters
   * @param {object} filters - Filter criteria
   * @param {object} options - Pagination options
   * @returns {Promise<object>} Drawers and count
   */
  async getDrawers(filters = {}, options = {}) {
    const { 
      status, 
      userId, 
      drawerType, 
      buId,
      limit = 100,
      offset = 0,
      orderBy = 'id',
      orderDir = 'ASC'
    } = filters;

    const whereClause = {};
    
    if (status) {
      whereClause.WF_STATUS = status;
    }
    if (userId) {
      whereClause.USER_ID = userId;
    }
    if (drawerType) {
      whereClause.DRAWER_TY_CD = drawerType;
    }
    if (buId) {
      whereClause.BU_ID = buId;
    }

    try {
      const { rows, count } = await this.Drawer.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [[orderBy, orderDir]]
      });

      return { drawers: rows, total: count };
    } catch (error) {
      console.error('❌ Error getting drawers:', error);
      throw error;
    }
  }

  /**
   * Unified balance updater
   * @param {number} drawerId - Drawer ID
   * @param {number} newBalance - New balance
   * @param {object} transaction - Optional transaction object
   * @returns {Promise<object>} Updated drawer
   */
  async updateDrawerBalance(drawerId, newBalance, transaction = null) {
    const options = transaction ? { transaction } : {};
    
    if (!drawerId) {
      throw new Error('drawerId is required to update balance');
    }

    if (isNaN(newBalance) || newBalance < 0) {
      throw new Error(`Invalid balance amount: ${newBalance}`);
    }

    const formattedBalance = parseFloat(parseFloat(newBalance).toFixed(2));
    
    try {
      await this.Drawer.update(
        {
          CURRENT_BALANCE: formattedBalance,
          VERSION_NO: this.sequelize.literal('COALESCE(VERSION_NO, 0) + 1'),
          updated_at: new Date()
        },
        {
          where: { id: drawerId },
          ...options
        }
      );

      // Verify the update
      const updatedDrawer = await this.Drawer.findOne({
        where: { id: drawerId },
        attributes: ['CURRENT_BALANCE', 'DRAWER_NO', 'WF_STATUS', 'USER_ID'],
        ...options
      });

      console.log(`✅ Drawer ${updatedDrawer?.DRAWER_NO} (User: ${updatedDrawer?.USER_ID || 'N/A'}) balance updated to: ₦${updatedDrawer?.CURRENT_BALANCE?.toFixed(2)}`);
      
      return updatedDrawer;
    } catch (error) {
      console.error(`❌ Error updating drawer ${drawerId} balance:`, error);
      throw error;
    }
  }

  /**
   * Add amount to drawer balance
   * @param {number} drawerId - Drawer ID
   * @param {number} amount - Amount to add
   * @param {object} transaction - Optional transaction object
   * @returns {Promise<object>} Updated drawer
   */
  async addToDrawerBalance(drawerId, amount, transaction = null) {
    if (amount < 0) {
      throw new Error('Amount to add must be positive');
    }

    const drawer = await this.Drawer.findOne({
      where: { id: drawerId },
      ...(transaction ? { transaction } : {})
    });

    if (!drawer) {
      throw new Error(`Drawer ${drawerId} not found`);
    }

    const currentBalance = parseFloat(drawer.CURRENT_BALANCE) || 0;
    const newBalance = currentBalance + parseFloat(amount);

    return await this.updateDrawerBalance(drawerId, newBalance, transaction);
  }

  /**
   * Subtract amount from drawer balance
   * @param {number} drawerId - Drawer ID
   * @param {number} amount - Amount to subtract
   * @param {object} transaction - Optional transaction object
   * @returns {Promise<object>} Updated drawer
   */
  async subtractFromDrawerBalance(drawerId, amount, transaction = null) {
    if (amount < 0) {
      throw new Error('Amount to subtract must be positive');
    }

    const drawer = await this.Drawer.findOne({
      where: { id: drawerId },
      ...(transaction ? { transaction } : {})
    });

    if (!drawer) {
      throw new Error(`Drawer ${drawerId} not found`);
    }

    const currentBalance = parseFloat(drawer.CURRENT_BALANCE) || 0;
    
    if (currentBalance < amount) {
      throw new Error(`Insufficient balance. Available: ₦${currentBalance.toFixed(2)}, Required: ₦${amount.toFixed(2)}`);
    }

    const newBalance = currentBalance - parseFloat(amount);

    return await this.updateDrawerBalance(drawerId, newBalance, transaction);
  }

  /**
   * Validate drawer for transaction
   * @param {object} drawer - Drawer object
   * @param {number} amount - Transaction amount
   * @param {string} transactionType - Type of transaction
   * @returns {object} Validation result
   */
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
    const isWithdrawal = ['WITHDRAWAL', 'DEBIT', 'CASH_DISBURSEMENT', 'WITHDRAW'].includes(transactionType.toUpperCase());
    
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
    let limitMessage = '';
    
    if (newBalance > maxBalance) {
      limitExceeded = true;
      limitMessage = `Transaction would exceed maximum balance of ₦${maxBalance.toFixed(2)}`;
    }
    
    if (newBalance < minBalance) {
      limitExceeded = true;
      limitMessage = `Transaction would go below minimum balance of ₦${minBalance.toFixed(2)}`;
    }

    // Check if drawer has cash limit
    if (drawer.DRAWER_CASH_LIMIT_FG === 'Y' && amount > parseFloat(drawer.TOTAL_INSURED_AMT || 0)) {
      return {
        valid: false,
        message: `Amount exceeds drawer cash limit of ₦${parseFloat(drawer.TOTAL_INSURED_AMT).toFixed(2)}`
      };
    }

    return {
      valid: true,
      currentBalance,
      newBalance,
      limitExceeded,
      limitMessage,
      drawerInfo: {
        id: drawer.id,
        DRAWER_ID: drawer.DRAWER_ID,
        DRAWER_NO: drawer.DRAWER_NO,
        DRAWER_NM: drawer.DRAWER_NM,
        USER_ID: drawer.USER_ID,
        WF_STATUS: drawer.WF_STATUS
      }
    };
  }

  /**
   * Open a drawer
   * @param {number} drawerId - Drawer ID
   * @param {string} userId - User ID opening the drawer
   * @param {object} transaction - Optional transaction object
   * @returns {Promise<object>} Updated drawer
   */
  async openDrawer(drawerId, userId, transaction = null) {
    const options = transaction ? { transaction } : {};
    
    const drawer = await this.Drawer.findOne({
      where: { id: drawerId },
      ...options
    });

    if (!drawer) {
      throw new Error(`Drawer ${drawerId} not found`);
    }

    if (drawer.WF_STATUS === 'OPEN') {
      throw new Error(`Drawer ${drawer.DRAWER_NO} is already open`);
    }

    await this.Drawer.update(
      {
        WF_STATUS: 'OPEN',
        CURRENT_ASSIGNEE_ID: userId,
        CURRENT_ASSIGNEE_NAME: userId,
        LAST_DRAWER_OPEN_DT: new Date(),
        updated_at: new Date()
      },
      {
        where: { id: drawerId },
        ...options
      }
    );

    const updatedDrawer = await this.Drawer.findOne({
      where: { id: drawerId },
      ...options
    });

    console.log(`✅ Drawer ${updatedDrawer.DRAWER_NO} opened by ${userId}`);
    return updatedDrawer;
  }

  /**
   * Close a drawer
   * @param {number} drawerId - Drawer ID
   * @param {string} userId - User ID closing the drawer
   * @param {object} transaction - Optional transaction object
   * @returns {Promise<object>} Updated drawer
   */
  async closeDrawer(drawerId, userId, transaction = null) {
    const options = transaction ? { transaction } : {};
    
    const drawer = await this.Drawer.findOne({
      where: { id: drawerId },
      ...options
    });

    if (!drawer) {
      throw new Error(`Drawer ${drawerId} not found`);
    }

    if (drawer.WF_STATUS === 'CLOSED') {
      throw new Error(`Drawer ${drawer.DRAWER_NO} is already closed`);
    }

    await this.Drawer.update(
      {
        WF_STATUS: 'CLOSED',
        LAST_DRAWER_CLOSE_DT: new Date(),
        updated_at: new Date()
      },
      {
        where: { id: drawerId },
        ...options
      }
    );

    const updatedDrawer = await this.Drawer.findOne({
      where: { id: drawerId },
      ...options
    });

    console.log(`✅ Drawer ${updatedDrawer.DRAWER_NO} closed by ${userId}`);
    return updatedDrawer;
  }
}

// Export singleton instance
let drawerServiceInstance = null;

/**
 * Get the drawer service instance
 * @param {object} sequelize - Sequelize instance
 * @returns {DrawerService} DrawerService instance
 */
export const getDrawerService = (sequelize) => {
  if (!drawerServiceInstance && sequelize) {
    drawerServiceInstance = new DrawerService(sequelize);
  }
  return drawerServiceInstance;
};

export default DrawerService;