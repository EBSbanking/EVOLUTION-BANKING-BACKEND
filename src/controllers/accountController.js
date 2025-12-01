import mongoose from 'mongoose';
import GLAccount from '../models/GLAccount.js';
import generateUserReport from '../../migration/generateUserReport.js';

// 🟢 GET ALL MIGRATED ACCOUNTS
export const getMigratedAccounts = async (req, res) => {
  try {
    const accounts = await GLAccount.find({ systemSource: 'MIGRATED' });
    
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
    const filter = {};
    
    // Status filter - handle both 'A'/'I' and 'Active'/'Inactive'
    if (status) {
      if (status === 'Active') {
        filter.$or = [
          { REC_ST: 'A' },
          { REC_ST: 'Active' },
          { REC_ST: 'ACTIVE' }
        ];
      } else if (status === 'Inactive') {
        filter.$or = [
          { REC_ST: 'I' },
          { REC_ST: 'Inactive' },
          { REC_ST: 'INACTIVE' }
        ];
      } else {
        filter.REC_ST = status;
      }
    }
    
    // Account type filter
    if (accountType) {
      filter['metadata.accountType'] = accountType;
    }
    
    // System source filter
    if (systemSource) {
      filter.systemSource = systemSource;
    }
    
    // Currency filter
    if (currency) {
      filter.currency = currency;
    }
    
    // Search filter
    if (search) {
      filter.$or = [
        { GL_ACCT_NO: { $regex: search, $options: 'i' } },
        { ACCT_DESC: { $regex: search, $options: 'i' } },
        { accountName: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    const sortFieldMap = {
      'accountNumber': 'GL_ACCT_NO',
      'accountName': 'ACCT_DESC',
      'currentBalance': 'LEDGER_BALANCE',
      'status': 'REC_ST',
      'createdAt': 'createdAt',
      'lastUpdated': 'updatedAt'
    };
    
    const actualSortField = sortFieldMap[sortBy] || 'GL_ACCT_NO';
    sort[actualSortField] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const accounts = await GLAccount.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v');

    const total = await GLAccount.countDocuments(filter);

    // Transform to user-friendly format
    const userFriendlyAccounts = accounts.map(account => ({
      id: account._id,
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
        total,
        pages: Math.ceil(total / parseInt(limit)),
        hasNext: page < Math.ceil(total / parseInt(limit)),
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
    
    const account = await GLAccount.findOne({ GL_ACCT_NO: accountNumber });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: `Account with number ${accountNumber} not found`
      });
    }

    res.json({
      success: true,
      data: {
        id: account._id,
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

// 🟢 GET ACCOUNT BY MONGODB ID
export const getAccountById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account ID format'
      });
    }

    const account = await GLAccount.findById(id);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: account._id,
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
  try {
    const accountData = req.body;

    // Check if account number already exists
    const existingAccount = await GLAccount.findOne({ 
      GL_ACCT_NO: accountData.GL_ACCT_NO 
    });
    
    if (existingAccount) {
      return res.status(400).json({
        success: false,
        error: `Account with number ${accountData.GL_ACCT_NO} already exists`
      });
    }

    const newAccount = new GLAccount({
      ...accountData,
      systemSource: accountData.systemSource || 'MANUAL',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newAccount.save();

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        id: newAccount._id,
        accountNumber: newAccount.GL_ACCT_NO,
        accountName: newAccount.ACCT_DESC || newAccount.accountName,
        accountType: newAccount.metadata?.accountType,
        systemSource: newAccount.systemSource,
        currentBalance: newAccount.LEDGER_BALANCE,
        status: getAccountStatus(newAccount.REC_ST) // Use helper function
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 UPDATE ACCOUNT
export const updateAccount = async (req, res) => {
  try {
    const { id, accountNumber } = req.params;
    let account;

    if (id) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid account ID format'
        });
      }
      account = await GLAccount.findById(id);
    } else if (accountNumber) {
      account = await GLAccount.findOne({ GL_ACCT_NO: accountNumber });
    }

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    // Update account fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        account[key] = req.body[key];
      }
    });

    account.updatedAt = new Date();
    await account.save();

    res.json({
      success: true,
      message: 'Account updated successfully',
      data: {
        id: account._id,
        accountNumber: account.GL_ACCT_NO,
        accountName: account.ACCT_DESC || account.accountName,
        accountType: account.metadata?.accountType,
        currentBalance: account.LEDGER_BALANCE,
        status: getAccountStatus(account.REC_ST), // Use helper function
        systemSource: account.systemSource
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 DELETE ACCOUNT
export const deleteAccount = async (req, res) => {
  try {
    const { id, accountNumber } = req.params;
    let account;

    if (id) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid account ID format'
        });
      }
      account = await GLAccount.findByIdAndDelete(id);
    } else if (accountNumber) {
      account = await GLAccount.findOneAndDelete({ GL_ACCT_NO: accountNumber });
    }

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    res.json({
      success: true,
      message: 'Account deleted successfully',
      data: {
        accountNumber: account.GL_ACCT_NO,
        accountName: account.ACCT_DESC || account.accountName
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 GET ACCOUNTS BY TYPE
export const getAccountsByType = async (req, res) => {
  try {
    const { accountType } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    
    const accounts = await GLAccount.find({ 
      'metadata.accountType': accountType 
    })
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ GL_ACCT_NO: 1 });

    const total = await GLAccount.countDocuments({ 
      'metadata.accountType': accountType 
    });

    const userFriendlyAccounts = accounts.map(account => ({
      id: account._id,
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
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      summary: {
        type: accountType,
        totalAccounts: total,
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
    
    // Support both MongoDB ObjectId and legacy numeric IDs
    if (mongoose.Types.ObjectId.isValid(id)) {
      account = await GLAccount.findById(id).select('GL_ACCT_NO ACCT_DESC accountName LEDGER_BALANCE REC_ST currency');
    } else {
      // Handle legacy numeric account IDs (like "000834")
      account = await GLAccount.findOne({ 
        $or: [
          { GL_ACCT_NO: id },
          { 'metadata.legacySystemId': id },
          { accountNumber: id }
        ]
      }).select('GL_ACCT_NO ACCT_DESC accountName LEDGER_BALANCE REC_ST currency');
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
    const activeAccounts = await GLAccount.countDocuments({
      $or: [
        { REC_ST: 'A' },
        { REC_ST: 'Active' },
        { REC_ST: 'ACTIVE' }
      ]
    });

    // Count inactive accounts - handle both 'I' and 'Inactive'
    const inactiveAccounts = await GLAccount.countDocuments({
      $or: [
        { REC_ST: 'I' },
        { REC_ST: 'Inactive' },
        { REC_ST: 'INACTIVE' }
      ]
    });

    const totalAccounts = await GLAccount.countDocuments();
    const migratedAccounts = await GLAccount.countDocuments({ systemSource: 'MIGRATED' });
    const manualAccounts = await GLAccount.countDocuments({ systemSource: 'MANUAL' });
    const newSystemAccounts = await GLAccount.countDocuments({ systemSource: 'NEW_SYSTEM' });
    
    // Get total balance
    const balanceResult = await GLAccount.aggregate([
      {
        $group: {
          _id: null,
          totalBalance: { $sum: '$LEDGER_BALANCE' }
        }
      }
    ]);

    const totalBalance = balanceResult[0]?.totalBalance || 0;

    // Get account type distribution
    const typeDistribution = await GLAccount.aggregate([
      {
        $group: {
          _id: '$metadata.accountType',
          count: { $sum: 1 },
          totalBalance: { $sum: '$LEDGER_BALANCE' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

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
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 SEARCH ACCOUNTS
export const searchAccounts = async (req, res) => {
  try {
    const { q, type, status, systemSource, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    let query = {};

    if (q) {
      query.$or = [
        { GL_ACCT_NO: { $regex: q, $options: 'i' } },
        { ACCT_DESC: { $regex: q, $options: 'i' } },
        { accountName: { $regex: q, $options: 'i' } }
      ];
    }

    if (type) {
      query['metadata.accountType'] = type;
    }

    if (status) {
      // Handle both 'active'/'inactive' and 'A'/'I'
      if (status === 'active') {
        query.$or = [
          { REC_ST: 'A' },
          { REC_ST: 'Active' },
          { REC_ST: 'ACTIVE' }
        ];
      } else if (status === 'inactive') {
        query.$or = [
          { REC_ST: 'I' },
          { REC_ST: 'Inactive' },
          { REC_ST: 'INACTIVE' }
        ];
      } else {
        query.REC_ST = status;
      }
    }

    if (systemSource) {
      query.systemSource = systemSource;
    }

    const accounts = await GLAccount.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ GL_ACCT_NO: 1 });

    const total = await GLAccount.countDocuments(query);

    const userFriendlyAccounts = accounts.map(account => ({
      id: account._id,
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
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      searchSummary: {
        query: q,
        results: total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 GET MIGRATION STATISTICS
export const getMigrationStatistics = async (req, res) => {
  try {
    const migrationStats = await GLAccount.aggregate([
      {
        $group: {
          _id: '$systemSource',
          count: { $sum: 1 },
          totalBalance: { $sum: '$LEDGER_BALANCE' },
          averageBalance: { $avg: '$LEDGER_BALANCE' }
        }
      }
    ]);

    const typeStats = await GLAccount.aggregate([
      {
        $group: {
          _id: '$metadata.accountType',
          count: { $sum: 1 },
          totalBalance: { $sum: '$LEDGER_BALANCE' }
        }
      }
    ]);

    const statusStats = await GLAccount.aggregate([
      {
        $group: {
          _id: '$REC_ST',
          count: { $sum: 1 },
          totalBalance: { $sum: '$LEDGER_BALANCE' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        bySource: migrationStats,
        byType: typeStats,
        byStatus: statusStats,
        summary: {
          totalAccounts: await GLAccount.countDocuments(),
          migratedAccounts: await GLAccount.countDocuments({ systemSource: 'MIGRATED' }),
          totalBalance: migrationStats.reduce((sum, stat) => sum + (stat.totalBalance || 0), 0)
        }
      }
    });
  } catch (error) {
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