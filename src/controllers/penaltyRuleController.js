// src/controllers/PenaltyController.js
import PenaltyAccrualService from '../services/PenaltyAccrualService.js';
import { getLoanAccount, getPenaltyRule, getLoanPenalty } from '../models/index.js';
import PenaltyRule from '../models/PenaltyRule.js';
import { paginate } from '../utils/pagination.js';
import logger from '../utils/logger.js';
import moment from 'moment';
import sequelize from '../../config/db.js';

class PenaltyController {
  /**
   * Get penalty accrual status
   */
  static async getStatus(req, res) {
    try {
      const LoanPenalty = getLoanPenalty();
      
      // Get today's accruals
      const today = moment().format('YYYY-MM-DD');
      const todayAccruals = await LoanPenalty.count({
        where: {
          accrual_date: today,
          status: 'PENDING'
        }
      });

      // Get total pending penalties
      const totalPending = await LoanPenalty.sum('amount', {
        where: { status: 'PENDING' }
      });

      // Get active penalty rules count
      const PenaltyRule = getPenaltyRule();
      const activeRules = await PenaltyRule.count({
        where: { 
          [sequelize.Op.or]: [
            { is_active: true },
            { status: 'ACTIVE' }
          ]
        }
      });

      res.status(200).json({
        success: true,
        data: {
          status: 'IDLE',
          lastRun: null,
          nextRun: null,
          schedule: 'Daily at 00:05 AM',
          todayAccruals,
          totalPendingAmount: totalPending || 0,
          activeRules
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get penalty status:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to get penalty status',
        error: error.message
      });
    }
  }

  /**
   * Manually trigger penalty accrual
   */
  static async accruePenalties(req, res) {
    try {
      const { accrualDate } = req.body;
      const date = accrualDate ? new Date(accrualDate) : new Date();
      const userId = req.user?.username || req.user?.user_name || 'system';
      
      logger.info(`Manual penalty accrual triggered by ${userId}`);
      
      const results = await PenaltyAccrualService.runDailyPenaltyAccrual(date);
      
      res.status(200).json({
        success: true,
        message: `Penalty accrual completed: ${results.penaltiesApplied} penalties applied totaling ₦${results.totalPenaltyAmount.toFixed(2)}`,
        data: results,
        triggeredBy: userId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Manual penalty accrual failed:', error.message);
      res.status(500).json({
        success: false,
        message: 'Penalty accrual failed',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Get penalty summary for a specific loan
   */
  static async getLoanPenaltySummary(req, res) {
    try {
      const { loanId } = req.params;
      
      if (!loanId) {
        return res.status(400).json({
          success: false,
          message: 'Loan ID is required'
        });
      }

      const summary = await PenaltyAccrualService.getLoanPenaltySummary(loanId);
      
      // Get loan details
      const LoanAccount = getLoanAccount();
      const loan = await LoanAccount.findByPk(loanId, {
        attributes: ['id', 'acct_no', 'acct_nm', 'loan_status', 'outstanding_principal']
      });

      res.status(200).json({
        success: true,
        data: {
          loan: loan || { id: loanId },
          summary
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting penalty summary:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to get penalty summary',
        error: error.message
      });
    }
  }

  /**
   * Process penalty payment
   */
  static async processPenaltyPayment(req, res) {
    try {
      const { loanId, amount, paymentMethod = 'CASH' } = req.body;
      const userId = req.user?.username || req.user?.user_name || 'system';
      
      if (!loanId) {
        return res.status(400).json({
          success: false,
          message: 'Loan ID is required'
        });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid payment amount is required'
        });
      }

      const result = await PenaltyAccrualService.processPenaltyPayment(
        loanId,
        amount,
        paymentMethod
      );

      logger.info(`Penalty payment processed by ${userId} for loan ${loanId}: ₦${amount}`);

      res.status(200).json({
        success: true,
        message: 'Penalty payment processed successfully',
        data: result,
        processedBy: userId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error processing penalty payment:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to process penalty payment',
        error: error.message
      });
    }
  }

  /**
   * Waive a penalty
   */
  static async waivePenalty(req, res) {
    try {
      const { penaltyId, reason } = req.body;
      const userId = req.user?.username || req.user?.user_name || 'system';
      
      if (!penaltyId) {
        return res.status(400).json({
          success: false,
          message: 'Penalty ID is required'
        });
      }

      const LoanPenalty = getLoanPenalty();
      const penalty = await LoanPenalty.findByPk(penaltyId);

      if (!penalty) {
        return res.status(404).json({
          success: false,
          message: 'Penalty not found'
        });
      }

      if (penalty.status === 'PAID') {
        return res.status(400).json({
          success: false,
          message: 'Penalty has already been paid'
        });
      }

      await penalty.update({
        status: 'WAIVED',
        description: penalty.description 
          ? `${penalty.description} - Waived: ${reason || 'Admin action'}`
          : `Waived: ${reason || 'Admin action'}`,
        updated_at: new Date()
      });

      // Update loan total penalty
      await PenaltyAccrualService.updateLoanTotalPenalty(penalty.loan_id);

      logger.info(`Penalty ${penaltyId} waived by ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Penalty waived successfully',
        data: {
          penaltyId,
          waivedBy: userId,
          reason: reason || 'Admin action',
          waivedAt: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error waiving penalty:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to waive penalty',
        error: error.message
      });
    }
  }

  // ================================================================
  // PENALTY RULE MANAGEMENT
  // ================================================================

  /**
   * Create penalty rule
   */
  static async createPenaltyRule(req, res) {
    try {
      const {
        rule_name,
        rule_type = 'LATE_PAYMENT',
        calculation_method = 'PERCENTAGE',
        rate_value,
        fixed_amount,
        min_amount,
        max_amount,
        grace_period_days = 0,
        effective_from,
        effective_to,
        status = 'ACTIVE',
        applicable_to = {},
        tier_config = [],
        description,
        created_by
      } = req.body;

      // Validate required fields
      if (!rule_name) {
        return res.status(400).json({
          success: false,
          message: 'Rule name is required'
        });
      }

      // Validate calculation method
      if (calculation_method === 'PERCENTAGE' && !rate_value) {
        return res.status(400).json({
          success: false,
          message: 'Rate value is required for percentage calculation'
        });
      }

      if (calculation_method === 'FIXED' && !fixed_amount) {
        return res.status(400).json({
          success: false,
          message: 'Fixed amount is required for fixed calculation'
        });
      }

      if (calculation_method === 'TIERED' && (!tier_config || tier_config.length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'Tier configuration is required for tiered calculation'
        });
      }

      // Check if rule name already exists
      const existingRule = await PenaltyRule.findOne({
        where: { rule_name }
      });

      if (existingRule) {
        return res.status(400).json({
          success: false,
          message: 'Rule name already exists'
        });
      }

      // Create the penalty rule
      const penaltyRule = await PenaltyRule.create({
        rule_name,
        rule_type,
        calculation_method,
        rate_value,
        fixed_amount,
        min_amount,
        max_amount,
        grace_period_days,
        effective_from: effective_from || new Date(),
        effective_to,
        status,
        applicable_to,
        tier_config,
        description,
        created_by: created_by || req.user?.id
      });

      logger.info(`Penalty rule created by ${req.user?.username || 'system'}: ${rule_name}`);

      res.status(201).json({
        success: true,
        message: 'Penalty rule created successfully',
        data: penaltyRule
      });
    } catch (error) {
      logger.error('Error creating penalty rule:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to create penalty rule',
        error: error.message
      });
    }
  }

  /**
   * Get all penalty rules with pagination and filtering
   */
  static async getPenaltyRules(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        rule_type,
        status,
        calculation_method,
        search,
        effective_from,
        effective_to
      } = req.query;

      const where = {};

      if (rule_type) where.rule_type = rule_type;
      if (status) where.status = status;
      if (calculation_method) where.calculation_method = calculation_method;
      
      // Search by rule name or description
      if (search) {
        where[sequelize.Op.or] = [
          { rule_name: { [sequelize.Op.like]: `%${search}%` } },
          { description: { [sequelize.Op.like]: `%${search}%` } }
        ];
      }

      // Date range filtering
      if (effective_from || effective_to) {
        where.effective_from = {};
        if (effective_from) where.effective_from[sequelize.Op.gte] = new Date(effective_from);
        if (effective_to) where.effective_from[sequelize.Op.lte] = new Date(effective_to);
      }

      const result = await paginate(PenaltyRule, parseInt(page), parseInt(limit), {
        where,
        order: [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Error fetching penalty rules:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch penalty rules',
        error: error.message
      });
    }
  }

  /**
   * Get penalty rule by ID
   */
  static async getPenaltyRuleById(req, res) {
    try {
      const { id } = req.params;

      const penaltyRule = await PenaltyRule.findByPk(id);

      if (!penaltyRule) {
        return res.status(404).json({
          success: false,
          message: 'Penalty rule not found'
        });
      }

      res.json({
        success: true,
        data: penaltyRule
      });
    } catch (error) {
      logger.error('Error fetching penalty rule:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch penalty rule',
        error: error.message
      });
    }
  }

  /**
   * Update penalty rule
   */
  static async updatePenaltyRule(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const penaltyRule = await PenaltyRule.findByPk(id);

      if (!penaltyRule) {
        return res.status(404).json({
          success: false,
          message: 'Penalty rule not found'
        });
      }

      // Check if rule name is being changed and already exists
      if (updateData.rule_name && updateData.rule_name !== penaltyRule.rule_name) {
        const existingRule = await PenaltyRule.findOne({
          where: { rule_name: updateData.rule_name }
        });

        if (existingRule) {
          return res.status(400).json({
            success: false,
            message: 'Rule name already exists'
          });
        }
      }

      // Update the penalty rule
      await penaltyRule.update(updateData);

      logger.info(`Penalty rule ${id} updated by ${req.user?.username || 'system'}`);

      res.json({
        success: true,
        message: 'Penalty rule updated successfully',
        data: penaltyRule
      });
    } catch (error) {
      logger.error('Error updating penalty rule:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to update penalty rule',
        error: error.message
      });
    }
  }

  /**
   * Delete (soft delete) penalty rule
   */
  static async deletePenaltyRule(req, res) {
    try {
      const { id } = req.params;

      const penaltyRule = await PenaltyRule.findByPk(id);

      if (!penaltyRule) {
        return res.status(404).json({
          success: false,
          message: 'Penalty rule not found'
        });
      }

      // Soft delete by setting status to INACTIVE
      penaltyRule.status = 'INACTIVE';
      await penaltyRule.save();

      logger.info(`Penalty rule ${id} deleted by ${req.user?.username || 'system'}`);

      res.json({
        success: true,
        message: 'Penalty rule deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting penalty rule:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to delete penalty rule',
        error: error.message
      });
    }
  }

  /**
   * Calculate penalty based on rule
   */
  static async calculatePenalty(req, res) {
    try {
      const { rule_type, amount, days_overdue, loan_data = {} } = req.body;

      if (!rule_type || !amount || days_overdue === undefined) {
        return res.status(400).json({
          success: false,
          message: 'rule_type, amount, and days_overdue are required'
        });
      }

      const penaltyAmount = await PenaltyRule.calculatePenalty(
        rule_type,
        parseFloat(amount),
        parseInt(days_overdue),
        loan_data
      );

      res.json({
        success: true,
        data: {
          penalty_amount: penaltyAmount,
          rule_type,
          base_amount: amount,
          days_overdue
        }
      });
    } catch (error) {
      logger.error('Error calculating penalty:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate penalty',
        error: error.message
      });
    }
  }

  /**
   * Get active rules
   */
  static async getActiveRules(req, res) {
    try {
      const { rule_type } = req.query;
      const now = new Date();

      const where = {
        status: 'ACTIVE',
        effective_from: { [sequelize.Op.lte]: now },
        [sequelize.Op.or]: [
          { effective_to: null },
          { effective_to: { [sequelize.Op.gte]: now } }
        ]
      };

      if (rule_type) where.rule_type = rule_type;

      const activeRules = await PenaltyRule.findAll({
        where,
        order: [['rule_name', 'ASC']]
      });

      res.json({
        success: true,
        data: activeRules
      });
    } catch (error) {
      logger.error('Error fetching active rules:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch active rules',
        error: error.message
      });
    }
  }

  /**
   * Get rule types enum values
   */
  static async getRuleTypes(req, res) {
    try {
      const ruleTypes = [
        { value: 'LATE_PAYMENT', label: 'Late Payment' },
        { value: 'EARLY_REPAYMENT', label: 'Early Repayment' },
        { value: 'DEFAULT_FEE', label: 'Default Fee' },
        { value: 'SERVICE_CHARGE', label: 'Service Charge' }
      ];

      res.json({
        success: true,
        data: ruleTypes
      });
    } catch (error) {
      logger.error('Error fetching rule types:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch rule types',
        error: error.message
      });
    }
  }

  /**
   * Get calculation methods enum values
   */
  static async getCalculationMethods(req, res) {
    try {
      const methods = [
        { value: 'PERCENTAGE', label: 'Percentage' },
        { value: 'FIXED', label: 'Fixed Amount' },
        { value: 'TIERED', label: 'Tiered' },
        { value: 'DAILY_RATE', label: 'Daily Rate' }
      ];

      res.json({
        success: true,
        data: methods
      });
    } catch (error) {
      logger.error('Error fetching calculation methods:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch calculation methods',
        error: error.message
      });
    }
  }
}

export default PenaltyController;