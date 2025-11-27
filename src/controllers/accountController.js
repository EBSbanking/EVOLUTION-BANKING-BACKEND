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
      accountName: account.ACCT_DESC,
      accountType: account.metadata?.accountType,
      currentBalance: account.LEDGER_BALANCE,
      status: account.REC_ST === 'A' ? 'Active' : 'Inactive',
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

// 🟢 GET ALL ACCOUNTS (with pagination)
export const getAllAccounts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const accounts = await GLAccount.find()
      .skip(skip)
      .limit(limit)
      .sort({ GL_ACCT_NO: 1 });

    const total = await GLAccount.countDocuments();

    const userFriendlyAccounts = accounts.map(account => ({
      id: account._id,
      accountNumber: account.GL_ACCT_NO,
      accountName: account.ACCT_DESC,
      accountType: account.metadata?.accountType,
      currentBalance: account.LEDGER_BALANCE,
      status: account.REC_ST === 'A' ? 'Active' : 'Inactive',
      systemSource: account.systemSource,
      currency: 'NGN',
      createdAt: account.createdAt,
      lastUpdated: account.updatedAt
    }));

    res.json({
      success: true,
      data: userFriendlyAccounts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalAccounts: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
        accountName: account.ACCT_DESC,
        accountType: account.metadata?.accountType,
        currentBalance: account.LEDGER_BALANCE,
        status: account.REC_ST === 'A' ? 'Active' : 'Inactive',
        systemSource: account.systemSource,
        currency: 'NGN',
        legacySystemId: account.legacyReference?.legacyId,
        createdAt: account.createdAt,
        lastUpdated: account.updatedAt
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
        accountName: account.ACCT_DESC,
        accountType: account.metadata?.accountType,
        currentBalance: account.LEDGER_BALANCE,
        status: account.REC_ST === 'A' ? 'Active' : 'Inactive',
        systemSource: account.systemSource,
        currency: 'NGN',
        legacySystemId: account.legacyReference?.legacyId,
        createdAt: account.createdAt,
        lastUpdated: account.updatedAt
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
        accountName: newAccount.ACCT_DESC,
        accountType: newAccount.metadata?.accountType,
        systemSource: newAccount.systemSource
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
        accountName: account.ACCT_DESC,
        accountType: account.metadata?.accountType,
        currentBalance: account.LEDGER_BALANCE,
        status: account.REC_ST
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
        accountName: account.ACCT_DESC
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
    
    const accounts = await GLAccount.find({ 
      'metadata.accountType': accountType 
    });

    const userFriendlyAccounts = accounts.map(account => ({
      id: account._id,
      accountNumber: account.GL_ACCT_NO,
      accountName: account.ACCT_DESC,
      accountType: account.metadata?.accountType,
      currentBalance: account.LEDGER_BALANCE,
      status: account.REC_ST === 'A' ? 'Active' : 'Inactive',
      systemSource: account.systemSource
    }));

    res.json({
      success: true,
      data: userFriendlyAccounts,
      summary: {
        type: accountType,
        totalAccounts: accounts.length,
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
      account = await GLAccount.findById(id).select('GL_ACCT_NO ACCT_DESC LEDGER_BALANCE REC_ST');
    } else {
      // Handle legacy numeric account IDs (like "000834")
      account = await GLAccount.findOne({ 
        $or: [
          { GL_ACCT_NO: id },
          { 'metadata.legacySystemId': id },
          { accountNumber: id }
        ]
      }).select('GL_ACCT_NO ACCT_DESC LEDGER_BALANCE REC_ST');
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
        accountName: account.ACCT_DESC,
        currentBalance: account.LEDGER_BALANCE,
        currency: 'NGN',
        status: account.REC_ST === 'A' ? 'Active' : 'Inactive',
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
    const totalAccounts = await GLAccount.countDocuments();
    const migratedAccounts = await GLAccount.countDocuments({ systemSource: 'MIGRATED' });
    const manualAccounts = await GLAccount.countDocuments({ systemSource: 'MANUAL' });
    const newSystemAccounts = await GLAccount.countDocuments({ systemSource: 'NEW_SYSTEM' });
    
    const activeAccounts = await GLAccount.countDocuments({ REC_ST: 'A' });
    const inactiveAccounts = await GLAccount.countDocuments({ REC_ST: 'I' });

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
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🟢 SEARCH ACCOUNTS
export const searchAccounts = async (req, res) => {
  try {
    const { q, type, status } = req.query;
    
    let query = {};

    if (q) {
      query.$or = [
        { GL_ACCT_NO: { $regex: q, $options: 'i' } },
        { ACCT_DESC: { $regex: q, $options: 'i' } }
      ];
    }

    if (type) {
      query['metadata.accountType'] = type;
    }

    if (status) {
      query.REC_ST = status === 'active' ? 'A' : 'I';
    }

    const accounts = await GLAccount.find(query).limit(20);

    const userFriendlyAccounts = accounts.map(account => ({
      id: account._id,
      accountNumber: account.GL_ACCT_NO,
      accountName: account.ACCT_DESC,
      accountType: account.metadata?.accountType,
      currentBalance: account.LEDGER_BALANCE,
      status: account.REC_ST === 'A' ? 'Active' : 'Inactive',
      systemSource: account.systemSource
    }));

    res.json({
      success: true,
      data: userFriendlyAccounts,
      searchSummary: {
        query: q,
        results: accounts.length
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

    res.json({
      success: true,
      data: {
        bySource: migrationStats,
        byType: typeStats,
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