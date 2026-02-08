// src/controllers/chartofAccountController.js

import { Op } from 'sequelize';
import ChartofAccount from '../models/ChartofAccount.js';
import GLAccount from '../models/GLAccount.js';

console.log('✅ Chart of Accounts controller loaded with Sequelize');

// Controller methods
export const chartofAccountController = {
  // CREATE - Create new account
  async createAccount(req, res) {
    try {
      const {
        name, glcode, type, account_usage, gl_group, balance,
        unreconciled_balance, manual_entries, description, status,
        organization_code, branch_code, metadata
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
        const existingAccount = await ChartofAccount.findOne({
          where: {
            organization_code,
            branch_code,
            glcode,
            is_deleted: false
          }
        });
        
        if (existingAccount) {
          return res.status(409).json({
            success: false,
            message: `GL code ${glcode} already exists in this branch`
          });
        }
      }

      // Create new account using Sequelize
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
        created_by: req.user?.id || 'system'
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

  // READ - Get all accounts (FIXED with Sequelize)
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

      // Build where clause for Sequelize
      const where = {
        is_deleted: false
      };
      
      if (organization_code) {
        where.organization_code = parseInt(organization_code);
      }
      if (branch_code) {
        where.branch_code = branch_code;
      }
      if (type) {
        where.type = type;
      }
      if (account_usage) {
        where.account_usage = account_usage;
      }
      if (gl_group) {
        where.gl_group = gl_group;
      }
      if (status) {
        where.status = status.toUpperCase();
      }

      // Text search with Sequelize Op.or
      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { glcode: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } }
        ];
      }

      // Calculate pagination
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const limitValue = parseInt(limit);

      // Get accounts with Sequelize
      const { count, rows: accounts } = await ChartofAccount.findAndCountAll({
        where,
        limit: limitValue,
        offset: offset,
        order: [['name', 'ASC']]
      });

      res.json({
        success: true,
        data: accounts,
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

  // READ - Get single account by ID
  async getAccount(req, res) {
    try {
      const { id } = req.params;

      const account = await ChartofAccount.findOne({
        where: {
          id: id,
          is_deleted: false
        }
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

  // UPDATE - Update account
  async updateAccount(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Find the account
      const account = await ChartofAccount.findOne({
        where: {
          id: id,
          is_deleted: false
        }
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
          where: {
            organization_code: account.organization_code,
            branch_code: account.branch_code,
            glcode: updateData.glcode,
            is_deleted: false,
            id: { [Op.ne]: id }
          }
        });
        
        if (existingAccount) {
          return res.status(409).json({
            success: false,
            message: `GL code ${updateData.glcode} already exists in this branch`
          });
        }
      }

      // Update the account
      await account.update({
        ...updateData,
        updated_by: req.user?.id || 'system'
      });

      res.json({
        success: true,
        message: 'Account updated successfully',
        data: account
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
        where: {
          id: id,
          is_deleted: false
        }
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

      // Soft delete
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

  // BALANCE OPERATIONS
  async updateBalance(req, res) {
    try {
      const { id } = req.params;
      const { balance, transactionData = {} } = req.body;

      const account = await ChartofAccount.findOne({
        where: {
          id: id,
          is_deleted: false
        }
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Chart of account not found'
        });
      }

      // Update balance
      await account.update({
        balance: balance,
        updated_by: req.user?.id || 'system'
      });

      res.json({
        success: true,
        message: 'Balance updated successfully',
        data: {
          old_balance: account.balance,
          new_balance: balance,
          difference: balance - account.balance
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

  // GL ACCOUNT MAPPING
  async mapToGLAccount(req, res) {
    try {
      const { id } = req.params;
      const { gl_account_id, gl_account_no } = req.body;

      const account = await ChartofAccount.findOne({
        where: {
          id: id,
          is_deleted: false
        }
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Chart of account not found'
        });
      }

      // Verify GL account exists using Sequelize
      const glAccount = await GLAccount.findByPk(gl_account_id);
      if (!glAccount) {
        return res.status(404).json({
          success: false,
          message: 'GL Account not found'
        });
      }

      // Update mapping
      await account.update({
        gl_account_id: gl_account_id,
        gl_account_no: gl_account_no,
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

  // REPORTS & ANALYTICS - Get balance summary
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

      if (branch_code) {
        where.branch_code = branch_code;
      }

      // Get all accounts with Sequelize
      const accounts = await ChartofAccount.findAll({
        where,
        attributes: ['id', 'name', 'type', 'balance']
      });

      // Calculate summary manually
      const summary = {
        total_accounts: accounts.length,
        total_balance: 0,
        by_type: {}
      };

      accounts.forEach(account => {
        const type = account.type;
        const balance = parseFloat(account.balance || 0);
        
        summary.total_balance += balance;
        
        if (!summary.by_type[type]) {
          summary.by_type[type] = {
            count: 0,
            balance: 0
          };
        }
        
        summary.by_type[type].count += 1;
        summary.by_type[type].balance += balance;
      });

      // Format balances
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

  // REPORTS & ANALYTICS - Get mapping statistics
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

      // Get counts using Sequelize
      const [total, mapped, unmapped] = await Promise.all([
        ChartofAccount.count({ where }),
        ChartofAccount.count({
          where: {
            ...where,
            gl_account_id: { [Op.ne]: null }
          }
        }),
        ChartofAccount.count({
          where: {
            ...where,
            gl_account_id: null
          }
        })
      ]);

      const stats = {
        total,
        mapped,
        unmapped,
        mapped_percentage: total > 0 ? ((mapped / total) * 100).toFixed(2) : 0,
        unmapped_percentage: total > 0 ? ((unmapped / total) * 100).toFixed(2) : 0
      };

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

  // SIMPLE TEST METHOD
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