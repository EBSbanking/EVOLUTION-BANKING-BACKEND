// src/controllers/chartofAccountController.js
import { Op } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import ChartofAccount from '../models/ChartofAccount.js';
import GLAccount from '../models/GLAccount.js';  // ✅ import GLAccount model
import Branch from '../models/Branch.js'; // if you have one

console.log('✅ Chart of Accounts controller loaded with Sequelize');


// ============================================
// Helper: generate new GL code
// ============================================
function generateNewGlCode(sourceAccount, orgCode, targetBranchCode, prefix) {
  const orgPart = String(orgCode).padStart(2, '0');
  const branchPart = String(targetBranchCode).padStart(3, '0');

  const sourceCode = sourceAccount.GL_ACCT_NO || ''; // ✅ use GL_ACCT_NO
  if (sourceCode.length >= 5) {
    const rest = sourceCode.slice(5);
    let newCode = orgPart + branchPart + rest;
    if (prefix) {
      newCode = prefix + newCode;
    }
    return newCode;
  }

  // Fallback: generate a new code from scratch
  const base = sourceCode.padStart(8, '0');
  const rest = base.slice(5);
  let newCode = orgPart + branchPart + rest;
  if (prefix) {
    newCode = prefix + newCode;
  }
  return newCode;
}

export const chartofAccountController = {
  // ============================================
  // CREATE – with hierarchical support
  // ============================================
  async createAccount(req, res) {
    try {
      const {
        name, glcode, type, account_usage, gl_group, balance,
        unreconciled_balance, manual_entries, description, status,
        organization_code, branch_code, metadata,
        // NEW hierarchical fields
        parentId,
        isFolder = false,
        sortOrder = 0
      } = req.body;

      // Validate required fields
      if (!name || !type || !account_usage || !organization_code || !branch_code) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: name, type, account_usage, organization_code, branch_code'
        });
      }

      // Check for duplicate GL code
      if (glcode) {
        const existing = await ChartofAccount.findOne({
          where: { organization_code, branch_code, glcode, is_deleted: false }
        });
        if (existing) {
          return res.status(409).json({
            success: false,
            message: `GL code ${glcode} already exists in this branch`
          });
        }
      }

      // ---------- HIERARCHY LOGIC ----------
      let accountLevel = 1;
      let accountPath = null;

      if (parentId) {
        const parent = await ChartofAccount.findOne({
          where: { id: parentId, organization_code, branch_code, is_deleted: false }
        });
        if (!parent) {
          return res.status(404).json({
            success: false,
            message: 'Parent account not found'
          });
        }
        // Level = parent level + 1
        accountLevel = (parent.accountLevel || 0) + 1;
        // Path = parent path + parent id (or just parent id if no path)
        accountPath = parent.accountPath
          ? `${parent.accountPath}/${parent.id}`
          : `${parent.id}`;
      }

      // Create new account
      const newAccount = await ChartofAccount.create({
        name,
        glcode: glcode || null,
        type,
        account_usage,
        gl_group: gl_group || null,
        balance: balance || 0,
        unreconciled_balance: unreconciled_balance || 0,
        manual_entries: manual_entries || 'NO',
        description: description || '',
        status: status || 'ACTIVE',
        organization_code,
        branch_code,
        metadata: metadata || {},
        created_by: req.user?.id || 'system',
        // Hierarchy fields
        parentId,
        accountLevel,
        isFolder: isFolder || false,
        sortOrder: sortOrder || 0,
        accountPath
      });

      res.status(201).json({
        success: true,
        message: 'Chart of account created successfully',
        data: newAccount
      });

    } catch (error) {
      console.error('Create account error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create chart of account',
        error: error.message
      });
    }
  },

  // ============================================
  // READ – flat list (pagination, search, filters)
  // ============================================
  async getAccounts(req, res) {
    try {
      const {
        organization_code,
        branch_code,
        type,
        account_usage,
        gl_group,
        status,
        page = 1,
        limit = 10,
        search
      } = req.query;

      const where = { is_deleted: false };
      if (organization_code) where.organization_code = parseInt(organization_code);
      if (branch_code) where.branch_code = branch_code;
      if (type) where.type = type;
      if (account_usage) where.account_usage = account_usage;
      if (gl_group) where.gl_group = gl_group;
      if (status) where.status = status.toUpperCase();

      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { glcode: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } }
        ];
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);
      const limitValue = parseInt(limit);

      const { count, rows } = await ChartofAccount.findAndCountAll({
        where,
        limit: limitValue,
        offset,
        order: [['accountLevel', 'ASC'], ['sortOrder', 'ASC'], ['name', 'ASC']]
      });

      res.json({
        success: true,
        data: rows,
        pagination: {
          current: parseInt(page),
          totalPages: Math.ceil(count / limitValue),
          totalItems: count,
          itemsPerPage: limitValue
        }
      });

    } catch (error) {
      console.error('Get accounts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch accounts',
        error: error.message
      });
    }
  },

  // ============================================
  // 🌳 READ – full hierarchical tree
  // ============================================
// 🌳 READ – full hierarchical tree
async getTree(req, res) {
  try {
    const { organization_code, branch_code } = req.query;

    if (!organization_code) {
      return res.status(400).json({
        success: false,
        message: 'organization_code is required'
      });
    }

    // ✅ Use raw column names to avoid mapping issues
    const where = {
      organization_code: parseInt(organization_code),
      is_deleted: false,
      parent_id: null // root nodes
    };
    if (branch_code) where.branch_code = branch_code;

    // Fetch root nodes with children (recursive)
    const roots = await ChartofAccount.findAll({
      where,
      include: [{
        model: ChartofAccount,
        as: 'children',
        include: [{
          model: ChartofAccount,
          as: 'children'
        }]
      }],
      order: [
        ['sort_order', 'ASC'],
        ['name', 'ASC']
      ]
    });

    res.json({
      success: true,
      data: roots
    });

  } catch (error) {
    console.error('Get tree error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch account tree',
      error: error.message
    });
  }
},

  // ============================================
  // READ – single account by ID
  // ============================================
  async getAccount(req, res) {
    try {
      const { id } = req.params;

      const account = await ChartofAccount.findOne({
        where: { id, is_deleted: false },
        include: [
          { model: ChartofAccount, as: 'parent' },
          { model: ChartofAccount, as: 'children' }
        ]
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Chart of account not found'
        });
      }

      res.json({
        success: true,
        data: account
      });

    } catch (error) {
      console.error('Get account error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch account',
        error: error.message
      });
    }
  },



  // ============================================
  // DELETE (soft delete)
  // ============================================
  async deleteAccount(req, res) {
    try {
      const { id } = req.params;

      const account = await ChartofAccount.findOne({
        where: { id, is_deleted: false }
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Chart of account not found'
        });
      }

      // Check if it has children
      const childrenCount = await ChartofAccount.count({
        where: { parentId: id, is_deleted: false }
      });
      if (childrenCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete account with ${childrenCount} child accounts. Delete or reassign children first.`
        });
      }

      // Check balance
      if (account.balance !== 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete account with non-zero balance'
        });
      }

      await account.update({
        is_deleted: true,
        deleted_at: new Date(),
        deleted_by: req.user?.id || 'system'
      });

      res.json({
        success: true,
        message: 'Account deleted successfully'
      });

    } catch (error) {
      console.error('Delete account error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete account',
        error: error.message
      });
    }
  },

  // ============================================
  // BALANCE OPERATIONS
  // ============================================
  async updateBalance(req, res) {
    try {
      const { id } = req.params;
      const { balance } = req.body;

      const account = await ChartofAccount.findOne({
        where: { id, is_deleted: false }
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Chart of account not found'
        });
      }

      const oldBalance = account.balance;
      await account.update({
        balance,
        updated_by: req.user?.id || 'system'
      });

      res.json({
        success: true,
        message: 'Balance updated successfully',
        data: {
          old_balance: oldBalance,
          new_balance: balance,
          difference: balance - oldBalance
        }
      });

    } catch (error) {
      console.error('Update balance error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update balance',
        error: error.message
      });
    }
  },

  // ============================================
  // GL ACCOUNT MAPPING (unchanged)
  // ============================================
  async mapToGLAccount(req, res) {
    try {
      const { id } = req.params;
      const { gl_account_id, gl_account_no } = req.body;

      const account = await ChartofAccount.findOne({
        where: { id, is_deleted: false }
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Chart of account not found'
        });
      }

      const glAccount = await GLAccount.findByPk(gl_account_id);
      if (!glAccount) {
        return res.status(404).json({
          success: false,
          message: 'GL Account not found'
        });
      }

      await account.update({
        gl_account_id,
        gl_account_no,
        mapping_status: 'MAPPED',
        mapped_at: new Date()
      });

      res.json({
        success: true,
        message: 'Successfully mapped to GL account',
        data: account
      });

    } catch (error) {
      console.error('Map to GL account error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to map to GL account',
        error: error.message
      });
    }
  },

  // ============================================
  // REPORTS & ANALYTICS
  // ============================================
  async getBalanceSummary(req, res) {
    try {
      const { organization_code, branch_code } = req.query;

      if (!organization_code) {
        return res.status(400).json({
          success: false,
          message: 'Organization code is required'
        });
      }

      const where = {
        organization_code: parseInt(organization_code),
        is_deleted: false
      };
      if (branch_code) where.branch_code = branch_code;

      const accounts = await ChartofAccount.findAll({
        where,
        attributes: ['id', 'name', 'type', 'balance']
      });

      const summary = {
        total_accounts: accounts.length,
        total_balance: 0,
        by_type: {}
      };

      accounts.forEach(acc => {
        const type = acc.type;
        const bal = parseFloat(acc.balance || 0);
        summary.total_balance += bal;
        if (!summary.by_type[type]) {
          summary.by_type[type] = { count: 0, balance: 0 };
        }
        summary.by_type[type].count += 1;
        summary.by_type[type].balance += bal;
      });

      summary.total_balance = parseFloat(summary.total_balance.toFixed(2));
      Object.keys(summary.by_type).forEach(type => {
        summary.by_type[type].balance = parseFloat(summary.by_type[type].balance.toFixed(2));
      });

      res.json({
        success: true,
        data: summary
      });

    } catch (error) {
      console.error('Balance summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get balance summary',
        error: error.message
      });
    }
  },

  async getMappingStatistics(req, res) {
    try {
      const { organization_code } = req.query;

      if (!organization_code) {
        return res.status(400).json({
          success: false,
          message: 'Organization code is required'
        });
      }

      const where = {
        organization_code: parseInt(organization_code),
        is_deleted: false
      };

      const [total, mapped, unmapped] = await Promise.all([
        ChartofAccount.count({ where }),
        ChartofAccount.count({ where: { ...where, gl_account_id: { [Op.ne]: null } } }),
        ChartofAccount.count({ where: { ...where, gl_account_id: null } })
      ]);

      res.json({
        success: true,
        data: {
          total,
          mapped,
          unmapped,
          mapped_percentage: total > 0 ? ((mapped / total) * 100).toFixed(2) : 0,
          unmapped_percentage: total > 0 ? ((unmapped / total) * 100).toFixed(2) : 0
        }
      });

    } catch (error) {
      console.error('Mapping statistics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get mapping statistics',
        error: error.message
      });
    }
  },

  // ============================================
  // BULK OPERATIONS (unchanged)
  // ============================================
  async bulkCreateAccounts(req, res) {
    try {
      const { accounts } = req.body;

      if (!Array.isArray(accounts) || accounts.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Accounts array is required'
        });
      }

      const results = { successful: [], failed: [] };

      for (const accountData of accounts) {
        try {
          const account = await ChartofAccount.create({
            ...accountData,
            created_by: req.user?.id || 'system_bulk'
          });
          results.successful.push(account);
        } catch (error) {
          results.failed.push({
            data: accountData,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        message: `Bulk creation completed: ${results.successful.length} successful, ${results.failed.length} failed`,
        data: results
      });

    } catch (error) {
      console.error('Bulk create error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk create accounts',
        error: error.message
      });
    }
  },

// ============================================
// CLONE COA – with branch name correction
// ============================================
async cloneCOAForBranch(req, res) {
  try {
    const {
      sourceBranchCode,
      targetBranchCode,
      organization_code,
      targetBranchName,          // <-- now required
      glAccountIds = null,
      options = {}
    } = req.body;

    const {
      copyBalance = false,
      prefixNewCode = true,
      glCodePrefix = '',
      overwrite = false
    } = options;

    // 1. Validate
    if (!sourceBranchCode || !targetBranchCode || !organization_code || !targetBranchName) {
      return res.status(400).json({
        success: false,
        message: 'sourceBranchCode, targetBranchCode, organization_code, and targetBranchName are required'
      });
    }
    if (sourceBranchCode === targetBranchCode) {
      return res.status(400).json({
        success: false,
        message: 'Source and target branches must be different'
      });
    }

    // 2. Fetch source GL accounts
    const whereSource = {
      organizationCode: parseInt(organization_code, 10),
      branchCode: sourceBranchCode,
      rec_st: 'Active'
    };

    let sourceAccounts;
    const isSelective = glAccountIds && Array.isArray(glAccountIds) && glAccountIds.length > 0;

    if (isSelective) {
      sourceAccounts = await GLAccount.findAll({
        where: {
          ...whereSource,
          GL_ACCT_ID: { [Op.in]: glAccountIds }   // ✅ uses GL_ACCT_ID (model attribute)
        },
        raw: true
      });
    } else {
      sourceAccounts = await GLAccount.findAll({ where: whereSource, raw: true });
    }

    if (!sourceAccounts || sourceAccounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No GL accounts found to clone'
      });
    }

    // 3. Overwrite handling – only for full clone
    if (!isSelective) {
      if (!overwrite) {
        const existing = await GLAccount.findOne({
          where: {
            organizationCode: parseInt(organization_code, 10),
            branchCode: targetBranchCode
          }
        });
        if (existing) {
          return res.status(409).json({
            success: false,
            message: 'Target branch already has GL accounts. Enable "overwrite" to replace them.'
          });
        }
      } else {
        await GLAccount.destroy({
          where: {
            organizationCode: parseInt(organization_code, 10),
            branchCode: targetBranchCode
          },
          force: true
        });
      }
    }

    // 4. Map old -> new IDs
    const oldToNewMap = new Map();
    const newAccounts = [];
    const now = new Date();

    // 5. Prepare new accounts
    for (const oldAccount of sourceAccounts) {
      const newGlCode = generateNewGlCode(
        oldAccount,
        organization_code,
        targetBranchCode,
        prefixNewCode ? glCodePrefix : ''
      );

      // Ensure GL_ACCT_NO is unique in target branch
      let finalGlCode = newGlCode;
      let counter = 0;
      let unique = false;
      while (!unique) {
        const existing = await GLAccount.findOne({
          where: {
            organizationCode: parseInt(organization_code, 10),
            branchCode: targetBranchCode,
            GL_ACCT_NO: finalGlCode
          }
        });
        if (existing) {
          const base = finalGlCode.slice(0, -2);
          const suffix = String(counter + 1).padStart(2, '0');
          finalGlCode = base + suffix;
          counter++;
          if (counter > 99) break;
        } else {
          unique = true;
        }
      }

      const newGlAccountId = `GL${Date.now()}${Math.floor(Math.random() * 10000)}`;

      const newAccount = {
        ...oldAccount,
        GL_ACCT_ID: newGlAccountId,
        GL_ACCT_NO: finalGlCode,
        branchCode: targetBranchCode,
        branchName: targetBranchName,   // ✅ store the provided name
        // Balances
        LEDGER_BALANCE: copyBalance ? oldAccount.LEDGER_BALANCE : 0,
        AVAILABLE_BALANCE: copyBalance ? oldAccount.AVAILABLE_BALANCE : 0,
        OPENING_BALANCE: copyBalance ? oldAccount.OPENING_BALANCE : 0,
        CURRENT_BALANCE: copyBalance ? oldAccount.CURRENT_BALANCE : 0,
        createdAt: now,
        updatedAt: now,
        _oldParentAccountId: oldAccount.PARENT_ID,
        id: undefined,
        _id: undefined
      };

      oldToNewMap.set(oldAccount.GL_ACCT_ID, newAccount.GL_ACCT_ID);
      newAccounts.push(newAccount);
    }

    // 6. Remap PARENT_ID
    for (const newAccount of newAccounts) {
      const oldParentId = newAccount._oldParentAccountId;
      if (oldParentId) {
        const newParentId = oldToNewMap.get(oldParentId);
        newAccount.PARENT_ID = newParentId || null;
      }
      delete newAccount._oldParentAccountId;
    }

    // 7. Insert in transaction
    await GLAccount.sequelize.transaction(async (t) => {
      const insertable = newAccounts.map(acc => {
        const validAttributes = [
          'GL_ACCT_NO', 'GL_ACCT_ID', 'CREATED_BY', 'coaStructure',
          'organizationName', 'organizationCode', 'branchName', 'branchCode',
          'branchType', 'categoryCode', 'categoryName', 'parentCode',
          'level', 'LEDGER_NO', 'PARENT_ID', 'subfolderId', 'BAL_CD',
          'SUB_LEDGER_NO', 'SEG_NO', 'CHART_OF_ACCT_ID', 'ACCT_DESC',
          'accountType', 'GL_ACCT_CAT', 'JOURNAL_ID', 'TRANSACTION_TYPE',
          'CR_ALLOWED', 'DR_ALLOWED', 'REC_ST', 'POST_ALLOW', 'POST_FG',
          'CONTROL_ACCT_FG', 'SUSPENSE_ACCT_FG', 'ALLOW_BAL_SWING_FG',
          'SEG_VALUE', 'SEG_DESC', 'SEG_TY_CD', 'SEG_PLACEHLDR_ID',
          'DELAY_GL_POSTING', 'LEDGER_BALANCE', 'AVAILABLE_BALANCE',
          'OPENING_BALANCE', 'CURRENT_BALANCE', 'CURRENCY_CODE',
          'balanceHistory', 'transactions', 'SETTLEMENT_GL_ACCT_NO',
          'INTER_BRANCH_ACCOUNT', 'legacyReference', 'systemSource',
          'syncStatus', 'metadata', 'branchTimezone', 'createdAt', 'updatedAt'
        ];
        const filtered = {};
        validAttributes.forEach(field => {
          if (acc[field] !== undefined) filtered[field] = acc[field];
        });
        return filtered;
      });

      await GLAccount.bulkCreate(insertable, { transaction: t });
    });

    res.status(200).json({
      success: true,
      message: `Successfully cloned ${newAccounts.length} GL account(s) to branch ${targetBranchCode}`,
      data: { clonedCount: newAccounts.length, targetBranchCode }
    });

  } catch (error) {
    console.error('Clone COA error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clone chart of accounts',
      error: error.message
    });
  }
},


  // ============================================
  // TEST (unchanged)
  // ============================================
  test(req, res) {
    res.json({
      success: true,
      message: 'Chart of Accounts controller is working!',
      timestamp: new Date().toISOString(),
      method: 'Sequelize ORM',
      status: '✅ Operational'
    });
  }
};