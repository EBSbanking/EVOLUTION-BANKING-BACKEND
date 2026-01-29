import sequelize from '../../config/db.js'; // Sequelize instance
import GLAccount from '../models/GLAccount.js';
import generateUserReport from '../../migration/generateUserReport.js';
import { Op } from 'sequelize';

// 🟢 GET ALL MIGRATED ACCOUNTS
export const getMigratedAccounts = async (req, res) => {
  try {
    const accounts = await GLAccount.findAll({ 
      where: { systemSource: 'MIGRATED' }
    });
    
    const userFriendlyAccounts = accounts.map(account => ({
      id: account.GL_ACCT_NO,
      accountNumber: account.GL_ACCT_NO,
      accountName: account.accountName,
      accountType: account.metadata?.accountType,
      currentBalance: account.LEDGER_BALANCE,
      status: getAccountStatus(account.REC_ST), // Use helper function
      currency: 'NGN',
      legacySystemId: account.legacyReference?.legacyId,
      lastUpdated: account.updatedAt
    }));
    
    res.json({
      success: true,
      data: userFriendlyAccounts,
      summary: {
        totalAccounts: accounts.length,
        totalBalance: accounts.reduce((sum, acc) => sum + (acc.LEDGER_BALANCE || 0), 0),
        migrationDate: '2024-01-15'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 GET ALL ACCOUNTS (with pagination, filtering, and sorting)
export const getAllAccounts = async (req, res) => {
  try {
    const {
      status,
      accountType,
      systemSource,
      currency,
      page = 1,
      limit = 50,
      sortBy = 'accountNumber',
      sortOrder = 'asc',
      search
    } = req.query;

    // Build filter object
    const where = {};
    
    // Status filter - handle both 'A'/'I' and 'Active'/'Inactive'
    if (status) {
      if (status === 'Active') {
        where.REC_ST = { [Op.in]: ['A', 'Active', 'ACTIVE'] };
      } else if (status === 'Inactive') {
        where.REC_ST = { [Op.in]: ['I', 'Inactive', 'INACTIVE'] };
      } else {
        where.REC_ST = status;
      }
    }
    
    // Account type filter
    if (accountType) {
      where['$metadata.accountType$'] = accountType;
    }
    
    // System source filter
    if (systemSource) {
      where.systemSource = systemSource;
    }
    
    // Currency filter
    if (currency) {
      where.currency = currency;
    }
    
    // Search filter
    if (search) {
      where[Op.or] = [
        { GL_ACCT_NO: { [Op.like]: `%${search}%` } },
        { ACCT_DESC: { [Op.like]: `%${search}%` } },
        { accountName: { [Op.like]: `%${search}%` } }
      ];
    }

    // Build sort array
    const order = [];
    const sortFieldMap = {
      'accountNumber': 'GL_ACCT_NO',
      'accountName': 'ACCT_DESC',
      'currentBalance': 'LEDGER_BALANCE',
      'status': 'REC_ST',
      'createdAt': 'createdAt',
      'lastUpdated': 'updatedAt'
    };
    
    const actualSortField = sortFieldMap[sortBy] || 'GL_ACCT_NO';
    order.push([actualSortField, sortOrder === 'desc' ? 'DESC' : 'ASC']);

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const { count, rows: accounts } = await GLAccount.findAndCountAll({
      where,
      order,
      offset,
      limit: parseInt(limit),
      // Exclude sequelize metadata columns if needed
      attributes: { exclude: ['__v'] } // Adjust based on your model
    });

    // Transform to user-friendly format
    const userFriendlyAccounts = accounts.map(account => ({
      id: account.id || account.GL_ACCT_NO, // Use primary key or account number
      accountNumber: account.GL_ACCT_NO,
      accountName: account.ACCT_DESC || account.accountName,
      accountType: account.metadata?.accountType,
      currentBalance: account.LEDGER_BALANCE,
      status: getAccountStatus(account.REC_ST), // Use helper function
      systemSource: account.systemSource,
      currency: account.currency || 'NGN',
      createdAt: account.createdAt,
      lastUpdated: account.updatedAt,
      // Include additional fields for frontend compatibility
      GL_ACCT_CAT: account.GL_ACCT_CAT,
      BAL_CD: account.BAL_CD,
      LEDGER_NO: account.LEDGER_NO,
      SUB_LEDGER_NO: account.SUB_LEDGER_NO,
      categoryCode: account.categoryCode,
      categoryName: account.categoryName,
      organizationName: account.organizationName,
      organizationCode: account.organizationCode,
      branchName: account.branchName,
      branchCode: account.branchCode
    }));

    res.json({
      success: true,
      data: userFriendlyAccounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit)),
        hasNext: page < Math.ceil(count / parseInt(limit)),
        hasPrev: page > 1
      },
      filters: {
        status,
        accountType,
        systemSource,
        currency,
        search
      },
      message: 'Accounts retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching accounts',
      error: error.message
    });
  }
};

// 🟢 GET ACCOUNT BY ACCOUNT NUMBER
export const getAccountByNumber = async (req, res) => {
  try {
    const { accountNumber } = req.params;
    
    const account = await GLAccount.findOne({ 
      where: { GL_ACCT_NO: accountNumber } 
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: `Account with number ${accountNumber} not found`
      });
    }

    res.json({
      success: true,
      data: {
        id: account.id || account.GL_ACCT_NO,
        accountNumber: account.GL_ACCT_NO,
        accountName: account.ACCT_DESC || account.accountName,
        accountType: account.metadata?.accountType,
        currentBalance: account.LEDGER_BALANCE,
        status: getAccountStatus(account.REC_ST), // Use helper function
        systemSource: account.systemSource,
        currency: account.currency || 'NGN',
        legacySystemId: account.legacyReference?.legacyId,
        createdAt: account.createdAt,
        lastUpdated: account.updatedAt,
        // Include COA fields
        GL_ACCT_CAT: account.GL_ACCT_CAT,
        BAL_CD: account.BAL_CD,
        LEDGER_NO: account.LEDGER_NO,
        SUB_LEDGER_NO: account.SUB_LEDGER_NO,
        categoryCode: account.categoryCode,
        categoryName: account.categoryName,
        organizationName: account.organizationName,
        organizationCode: account.organizationCode,
        branchName: account.branchName,
        branchCode: account.branchCode,
        CHART_OF_ACCT_ID: account.CHART_OF_ACCT_ID,
        SEG_NO: account.SEG_NO,
        level: account.level,
        metadata: account.metadata
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 GET ACCOUNT BY ID (primary key)
export const getAccountById = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await GLAccount.findByPk(id);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: account.id,
        accountNumber: account.GL_ACCT_NO,
        accountName: account.ACCT_DESC || account.accountName,
        accountType: account.metadata?.accountType,
        currentBalance: account.LEDGER_BALANCE,
        status: getAccountStatus(account.REC_ST), // Use helper function
        systemSource: account.systemSource,
        currency: account.currency || 'NGN',
        legacySystemId: account.legacyReference?.legacyId,
        createdAt: account.createdAt,
        lastUpdated: account.updatedAt,
        // Include COA fields
        GL_ACCT_CAT: account.GL_ACCT_CAT,
        BAL_CD: account.BAL_CD,
        LEDGER_NO: account.LEDGER_NO,
        SUB_LEDGER_NO: account.SUB_LEDGER_NO,
        categoryCode: account.categoryCode,
        categoryName: account.categoryName,
        organizationName: account.organizationName,
        organizationCode: account.organizationCode,
        branchName: account.branchName,
        branchCode: account.branchCode,
        CHART_OF_ACCT_ID: account.CHART_OF_ACCT_ID,
        SEG_NO: account.SEG_NO,
        level: account.level,
        metadata: account.metadata
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 CREATE NEW ACCOUNT
export const createAccount = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const accountData = req.body;

    // Check if account number already exists
    const existingAccount = await GLAccount.findOne({ 
      where: { GL_ACCT_NO: accountData.GL_ACCT_NO }
    });
    
    if (existingAccount) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: `Account with number ${accountData.GL_ACCT_NO} already exists`
      });
    }

    const newAccount = await GLAccount.create({
      ...accountData,
      systemSource: accountData.systemSource || 'MANUAL',
      createdAt: new Date(),
      updatedAt: new Date()
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        id: newAccount.id,
        accountNumber: newAccount.GL_ACCT_NO,
        accountName: newAccount.ACCT_DESC || newAccount.accountName,
        accountType: newAccount.metadata?.accountType,
        systemSource: newAccount.systemSource,
        currentBalance: newAccount.LEDGER_BALANCE,
        status: getAccountStatus(newAccount.REC_ST) // Use helper function
      }
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 UPDATE ACCOUNT
export const updateAccount = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id, accountNumber } = req.params;
    let account;

    if (id) {
      account = await GLAccount.findByPk(id);
    } else if (accountNumber) {
      account = await GLAccount.findOne({ 
        where: { GL_ACCT_NO: accountNumber } 
      });
    }

    if (!account) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    // Update account fields
    await account.update({
      ...req.body,
      updatedAt: new Date()
    }, { transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Account updated successfully',
      data: {
        id: account.id,
        accountNumber: account.GL_ACCT_NO,
        accountName: account.ACCT_DESC || account.accountName,
        accountType: account.metadata?.accountType,
        currentBalance: account.LEDGER_BALANCE,
        status: getAccountStatus(account.REC_ST), // Use helper function
        systemSource: account.systemSource
      }
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 DELETE ACCOUNT
export const deleteAccount = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id, accountNumber } = req.params;
    let account;

    if (id) {
      account = await GLAccount.findByPk(id);
    } else if (accountNumber) {
      account = await GLAccount.findOne({ 
        where: { GL_ACCT_NO: accountNumber } 
      });
    }

    if (!account) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    const accountNumberToDelete = account.GL_ACCT_NO;
    const accountNameToDelete = account.ACCT_DESC || account.accountName;
    
    await account.destroy({ transaction });
    await transaction.commit();

    res.json({
      success: true,
      message: 'Account deleted successfully',
      data: {
        accountNumber: accountNumberToDelete,
        accountName: accountNameToDelete
      }
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 GET ACCOUNTS BY TYPE
export const getAccountsByType = async (req, res) => {
  try {
    const { accountType } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    const { count, rows: accounts } = await GLAccount.findAndCountAll({ 
      where: { 
        '$metadata.accountType$': accountType 
      },
      offset,
      limit: parseInt(limit),
      order: [['GL_ACCT_NO', 'ASC']]
    });

    const userFriendlyAccounts = accounts.map(account => ({
      id: account.id,
      accountNumber: account.GL_ACCT_NO,
      accountName: account.ACCT_DESC || account.accountName,
      accountType: account.metadata?.accountType,
      currentBalance: account.LEDGER_BALANCE,
      status: getAccountStatus(account.REC_ST), // Use helper function
      systemSource: account.systemSource,
      currency: account.currency || 'NGN'
    }));

    res.json({
      success: true,
      data: userFriendlyAccounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit))
      },
      summary: {
        type: accountType,
        totalAccounts: count,
        totalBalance: accounts.reduce((sum, acc) => sum + (acc.LEDGER_BALANCE || 0), 0)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 GET ACCOUNT BALANCE
export const getAccountBalance = async (req, res) => {
  try {
    const { id } = req.params;
    
    let account;
    
    // Check if it's a primary key (numeric)
    if (!isNaN(id)) {
      account = await GLAccount.findByPk(id, {
        attributes: ['id', 'GL_ACCT_NO', 'ACCT_DESC', 'accountName', 'LEDGER_BALANCE', 'REC_ST', 'currency', 'updatedAt']
      });
    }
    
    if (!account) {
      // Try to find by account number
      account = await GLAccount.findOne({ 
        where: { 
          [Op.or]: [
            { GL_ACCT_NO: id },
            { '$metadata.legacySystemId$': id },
            { accountNumber: id }
          ]
        },
        attributes: ['id', 'GL_ACCT_NO', 'ACCT_DESC', 'accountName', 'LEDGER_BALANCE', 'REC_ST', 'currency', 'updatedAt']
      });
    }
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    res.json({
      success: true,
      data: {
        accountNumber: account.GL_ACCT_NO,
        accountName: account.ACCT_DESC || account.accountName,
        currentBalance: account.LEDGER_BALANCE,
        currency: account.currency || 'NGN',
        status: getAccountStatus(account.REC_ST), // Use helper function
        lastUpdated: account.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 GET ACCOUNTS SUMMARY
export const getAccountsSummary = async (req, res) => {
  try {
    // Count active accounts - handle both 'A' and 'Active'
    const activeAccounts = await GLAccount.count({
      where: {
        REC_ST: { [Op.in]: ['A', 'Active', 'ACTIVE'] }
      }
    });

    // Count inactive accounts - handle both 'I' and 'Inactive'
    const inactiveAccounts = await GLAccount.count({
      where: {
        REC_ST: { [Op.in]: ['I', 'Inactive', 'INACTIVE'] }
      }
    });

    const totalAccounts = await GLAccount.count();
    const migratedAccounts = await GLAccount.count({ 
      where: { systemSource: 'MIGRATED' } 
    });
    const manualAccounts = await GLAccount.count({ 
      where: { systemSource: 'MANUAL' } 
    });
    const newSystemAccounts = await GLAccount.count({ 
      where: { systemSource: 'NEW_SYSTEM' } 
    });
    
    // Get total balance using SQL aggregation
    const totalBalanceResult = await GLAccount.sum('LEDGER_BALANCE');
    const totalBalance = totalBalanceResult || 0;

    // Get account type distribution
    // Note: This might need adjustment based on how metadata is stored in MySQL
    // If metadata is a JSON column:
    const typeDistribution = await GLAccount.findAll({
      attributes: [
        [sequelize.json('metadata.accountType'), 'accountType'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('LEDGER_BALANCE')), 'totalBalance']
      ],
      group: ['accountType'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      raw: true
    });

    res.json({
      success: true,
      data: {
        totalAccounts,
        totalBalance,
        bySource: {
          migrated: migratedAccounts,
          manual: manualAccounts,
          newSystem: newSystemAccounts
        },
        byStatus: {
          active: activeAccounts,
          inactive: inactiveAccounts
        },
        byType: typeDistribution
      }
    });
  } catch (error) {
    console.error('Error in getAccountsSummary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 SEARCH ACCOUNTS
export const searchAccounts = async (req, res) => {
  try {
    const { q, type, status, systemSource, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const where = {};

    if (q) {
      where[Op.or] = [
        { GL_ACCT_NO: { [Op.like]: `%${q}%` } },
        { ACCT_DESC: { [Op.like]: `%${q}%` } },
        { accountName: { [Op.like]: `%${q}%` } }
      ];
    }

    if (type) {
      where['$metadata.accountType$'] = type;
    }

    if (status) {
      // Handle both 'active'/'inactive' and 'A'/'I'
      if (status === 'active') {
        where.REC_ST = { [Op.in]: ['A', 'Active', 'ACTIVE'] };
      } else if (status === 'inactive') {
        where.REC_ST = { [Op.in]: ['I', 'Inactive', 'INACTIVE'] };
      } else {
        where.REC_ST = status;
      }
    }

    if (systemSource) {
      where.systemSource = systemSource;
    }

    const { count, rows: accounts } = await GLAccount.findAndCountAll({
      where,
      offset,
      limit: parseInt(limit),
      order: [['GL_ACCT_NO', 'ASC']]
    });

    const userFriendlyAccounts = accounts.map(account => ({
      id: account.id,
      accountNumber: account.GL_ACCT_NO,
      accountName: account.ACCT_DESC || account.accountName,
      accountType: account.metadata?.accountType,
      currentBalance: account.LEDGER_BALANCE,
      status: getAccountStatus(account.REC_ST), // Use helper function
      systemSource: account.systemSource,
      currency: account.currency || 'NGN'
    }));

    res.json({
      success: true,
      data: userFriendlyAccounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit))
      },
      searchSummary: {
        query: q,
        results: count
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 GET MIGRATION STATISTICS
export const getMigrationStatistics = async (req, res) => {
  try {
    // Group by systemSource
    const migrationStats = await GLAccount.findAll({
      attributes: [
        'systemSource',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('LEDGER_BALANCE')), 'totalBalance'],
        [sequelize.fn('AVG', sequelize.col('LEDGER_BALANCE')), 'averageBalance']
      ],
      group: ['systemSource'],
      raw: true
    });

    // Group by account type (if metadata is JSON)
    const typeStats = await GLAccount.findAll({
      attributes: [
        [sequelize.json('metadata.accountType'), 'accountType'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('LEDGER_BALANCE')), 'totalBalance']
      ],
      group: [sequelize.json('metadata.accountType')],
      raw: true
    });

    // Group by status
    const statusStats = await GLAccount.findAll({
      attributes: [
        'REC_ST',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('LEDGER_BALANCE')), 'totalBalance']
      ],
      group: ['REC_ST'],
      raw: true
    });

    const totalAccounts = await GLAccount.count();
    const migratedAccounts = await GLAccount.count({ 
      where: { systemSource: 'MIGRATED' } 
    });
    const totalBalanceResult = await GLAccount.sum('LEDGER_BALANCE');

    res.json({
      success: true,
      data: {
        bySource: migrationStats,
        byType: typeStats,
        byStatus: statusStats,
        summary: {
          totalAccounts,
          migratedAccounts,
          totalBalance: totalBalanceResult || 0
        }
      }
    });
  } catch (error) {
    console.error('Error in getMigrationStatistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Helper function to determine account status from REC_ST field
 * Supports both 'A'/'I' and 'Active'/'Inactive' formats
 */
const getAccountStatus = (recSt) => {
  if (!recSt) return 'Unknown';
  
  const status = recSt.toString().toUpperCase();
  
  if (status === 'A' || status === 'ACTIVE') {
    return 'Active';
  } else if (status === 'I' || status === 'INACTIVE') {
    return 'Inactive';
  } else {
    return recSt; // Return original value if not recognized
  }
};

/**
 * Helper function to normalize REC_ST for queries
 */
const normalizeRecSt = (recSt) => {
  if (!recSt) return null;
  
  const status = recSt.toString().toUpperCase();
  
  if (status === 'A' || status === 'ACTIVE') {
    return ['A', 'Active', 'ACTIVE'];
  } else if (status === 'I' || status === 'INACTIVE') {
    return ['I', 'Inactive', 'INACTIVE'];
  } else {
    return [recSt];
  }
};