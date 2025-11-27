import ChartofAccount from '../models/ChartofAccount.js';
import GLAccount from '../models/GLAccount.js';

export const chartofAccountController = {
  
  // CREATE
  async createAccount(req, res) {
    try {
      const {
        name, glcode, type, account_usage, gl_group, balance,
        unreconciled_balance, manual_entries, description, status,
        organizationCode, branchCode, metadata
      } = req.body;

      // Validate required fields
      if (!name || !type || !account_usage || !organizationCode || !branchCode) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: name, type, account_usage, organizationCode, branchCode'
        });
      }

      // Check for duplicate GL code in same organization/branch
      if (glcode) {
        const existingAccount = await ChartofAccount.findOne({
          organizationCode,
          branchCode,
          glcode,
          isDeleted: false
        });
        
        if (existingAccount) {
          return res.status(409).json({
            success: false,
            message: `GL code ${glcode} already exists in this branch`
          });
        }
      }

      const newAccount = new ChartofAccount({
        name,
        glcode,
        type,
        account_usage,
        gl_group: gl_group || null,
        balance: balance || 0,
        unreconciled_balance: unreconciled_balance || 0,
        manual_entries: manual_entries || 'NO',
        description,
        status: status || 'ACTIVE',
        organizationCode,
        branchCode,
        metadata: metadata || {},
        createdBy: req.user?.id || 'system'
      });

      await newAccount.save();

      res.status(201).json({
        success: true,
        message: 'Chart of account created successfully',
        data: newAccount.getAccountInfo()
      });

    } catch (error) {
      console.error('Create chart account error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create chart of account',
        error: error.message
      });
    }
  },

  // READ - Get all accounts with filtering
  async getAccounts(req, res) {
    try {
      const {
        organizationCode,
        branchCode,
        type,
        account_usage,
        gl_group,
        status,
        page = 1,
        limit = 10,
        search
      } = req.query;

      // Build filter
      const filter = { isDeleted: false };
      
      if (organizationCode) filter.organizationCode = parseInt(organizationCode);
      if (branchCode) filter.branchCode = branchCode;
      if (type) filter.type = type;
      if (account_usage) filter.account_usage = account_usage;
      if (gl_group) filter.gl_group = gl_group;
      if (status) filter.status = status.toUpperCase();

      // Text search
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { glcode: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { name: 1 }
      };

      // Using mongoose pagination or regular find for simplicity
      const accounts = await ChartofAccount.find(filter)
        .limit(options.limit * 1)
        .skip((options.page - 1) * options.limit)
        .sort(options.sort);

      const total = await ChartofAccount.countDocuments(filter);

      res.json({
        success: true,
        data: accounts,
        pagination: {
          current: options.page,
          totalPages: Math.ceil(total / options.limit),
          totalItems: total,
          itemsPerPage: options.limit
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

  // READ - Get single account
  async getAccount(req, res) {
    try {
      const { id } = req.params;

      const account = await ChartofAccount.findOne({
        _id: id,
        isDeleted: false
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Chart of account not found'
        });
      }

      res.json({
        success: true,
        data: account.getAccountInfo()
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

  // UPDATE
  async updateAccount(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const account = await ChartofAccount.findOne({
        _id: id,
        isDeleted: false
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Chart of account not found'
        });
      }

      // Prevent updating certain fields directly
      const allowedUpdates = [
        'name', 'glcode', 'type', 'account_usage', 'gl_group', 
        'description', 'status', 'metadata'
      ];
      
      const updateData = {};
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          updateData[field] = updates[field];
        }
      });

      // Handle GL code uniqueness check
      if (updateData.glcode && updateData.glcode !== account.glcode) {
        const existingAccount = await ChartofAccount.findOne({
          organizationCode: account.organizationCode,
          branchCode: account.branchCode,
          glcode: updateData.glcode,
          isDeleted: false,
          _id: { $ne: id }
        });
        
        if (existingAccount) {
          return res.status(409).json({
            success: false,
            message: `GL code ${updateData.glcode} already exists in this branch`
          });
        }
      }

      Object.assign(account, updateData);
      account.updatedBy = req.user?.id || 'system';
      
      await account.save();

      res.json({
        success: true,
        message: 'Account updated successfully',
        data: account.getAccountInfo()
      });

    } catch (error) {
      console.error('Update account error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update account',
        error: error.message
      });
    }
  },

  // DELETE (Soft delete)
  async deleteAccount(req, res) {
    try {
      const { id } = req.params;

      const account = await ChartofAccount.findOne({
        _id: id,
        isDeleted: false
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Chart of account not found'
        });
      }

      // Check if account has balance
      if (account.balance !== 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete account with non-zero balance'
        });
      }

      await account.softDelete(req.user?.id || 'system');

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

  // BALANCE OPERATIONS
  async updateBalance(req, res) {
    try {
      const { id } = req.params;
      const { balance, transactionData = {} } = req.body;

      const account = await ChartofAccount.findOne({
        _id: id,
        isDeleted: false
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Chart of account not found'
        });
      }

      const result = await account.updateBalance(balance, transactionData);

      res.json({
        success: true,
        message: 'Balance updated successfully',
        data: result
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

  // GL ACCOUNT MAPPING
  async mapToGLAccount(req, res) {
    try {
      const { id } = req.params;
      const { glAccountId, glAccountNo } = req.body;

      const account = await ChartofAccount.findOne({
        _id: id,
        isDeleted: false
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Chart of account not found'
        });
      }

      // Verify GL account exists
      const glAccount = await GLAccount.findById(glAccountId);
      if (!glAccount) {
        return res.status(404).json({
          success: false,
          message: 'GL Account not found'
        });
      }

      await account.mapToGLAccount(glAccountId, glAccountNo);

      res.json({
        success: true,
        message: 'Successfully mapped to GL account',
        data: account.getAccountInfo()
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

  // REPORTS & ANALYTICS
  async getBalanceSummary(req, res) {
    try {
      const { organizationCode, branchCode } = req.query;

      if (!organizationCode) {
        return res.status(400).json({
          success: false,
          message: 'Organization code is required'
        });
      }

      const summary = await ChartofAccount.getBalanceSummary(
        parseInt(organizationCode), 
        branchCode
      );

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
      const { organizationCode } = req.query;

      if (!organizationCode) {
        return res.status(400).json({
          success: false,
          message: 'Organization code is required'
        });
      }

      const stats = await ChartofAccount.getMappingStatistics(parseInt(organizationCode));

      res.json({
        success: true,
        data: stats
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

  // BULK OPERATIONS
  async bulkCreateAccounts(req, res) {
    try {
      const { accounts } = req.body;

      if (!Array.isArray(accounts) || accounts.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Accounts array is required'
        });
      }

      const results = {
        successful: [],
        failed: []
      };

      for (const accountData of accounts) {
        try {
          const account = new ChartofAccount({
            ...accountData,
            createdBy: req.user?.id || 'system_bulk'
          });
          await account.save();
          results.successful.push(account.getAccountInfo());
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
  }
};