// controllers/penaltyController.js
import Penalty from '../models/LoanPenalty.js';
import PenaltyRule from '../models/PenaltyRule.js'; // ADD THIS IMPORT
import PenaltyService from '../Services/PenaltyService.js';
import { paginate } from '../utils/pagination.js';
import sequelize from '../../config/db.js'; // ADD THIS IMPORT

// ============================================
// PENALTY RULE CONTROLLERS
// ============================================

export const createPenaltyRule = async (req, res) => {
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

    res.status(201).json({
      success: true,
      message: 'Penalty rule created successfully',
      data: penaltyRule
    });
  } catch (error) {
    console.error('Error creating penalty rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create penalty rule',
      error: error.message
    });
  }
};

export const getPenaltyRules = async (req, res) => {
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
    console.error('Error fetching penalty rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch penalty rules',
      error: error.message
    });
  }
};

export const getPenaltyRuleById = async (req, res) => {
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
    console.error('Error fetching penalty rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch penalty rule',
      error: error.message
    });
  }
};

export const updatePenaltyRule = async (req, res) => {
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

    res.json({
      success: true,
      message: 'Penalty rule updated successfully',
      data: penaltyRule
    });
  } catch (error) {
    console.error('Error updating penalty rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update penalty rule',
      error: error.message
    });
  }
};

export const deletePenaltyRule = async (req, res) => {
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

    res.json({
      success: true,
      message: 'Penalty rule deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting penalty rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete penalty rule',
      error: error.message
    });
  }
};

export const calculatePenalty = async (req, res) => {
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
    console.error('Error calculating penalty:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate penalty',
      error: error.message
    });
  }
};

export const getActiveRules = async (req, res) => {
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
    console.error('Error fetching active rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active rules',
      error: error.message
    });
  }
};

// ============================================
// PENALTY CONTROLLERS (already in your file)
// ============================================

export const createPenalty = async (req, res) => {
  try {
    const {
      loan_id,
      penalty_type = 'LATE_PAYMENT',
      amount,
      rate,
      calculation_basis = 'OUTSTANDING',
      period_start,
      period_end,
      days_count = 0,
      description,
      applied_by,
      metadata = {}
    } = req.body;

    // Validate required fields
    if (!loan_id || !amount) {
      return res.status(400).json({
        success: false,
        message: 'loan_id and amount are required'
      });
    }

    // Create penalty
    const penalty = await Penalty.create({
      loan_id,
      penalty_type,
      amount: parseFloat(amount),
      rate: rate ? parseFloat(rate) : null,
      calculation_basis,
      period_start: period_start || new Date(),
      period_end,
      days_count,
      description,
      applied_by: applied_by || req.user?.id,
      metadata
    });

    res.status(201).json({
      success: true,
      message: 'Penalty created successfully',
      data: penalty
    });
  } catch (error) {
    console.error('Error creating penalty:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create penalty',
      error: error.message
    });
  }
};

export const getPenalties = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      loan_id,
      penalty_type,
      status,
      applied_by,
      start_date,
      end_date,
      min_amount,
      max_amount
    } = req.query;

    const where = {};

    if (loan_id) where.loan_id = loan_id;
    if (penalty_type) where.penalty_type = penalty_type;
    if (status) where.status = status;
    if (applied_by) where.applied_by = applied_by;
    
    // Amount range filtering
    if (min_amount || max_amount) {
      where.amount = {};
      if (min_amount) where.amount[sequelize.Op.gte] = parseFloat(min_amount);
      if (max_amount) where.amount[sequelize.Op.lte] = parseFloat(max_amount);
    }
    
    // Date range filtering
    if (start_date || end_date) {
      where.applied_date = {};
      if (start_date) where.applied_date[sequelize.Op.gte] = new Date(start_date);
      if (end_date) where.applied_date[sequelize.Op.lte] = new Date(end_date);
    }

    const result = await paginate(Penalty, parseInt(page), parseInt(limit), {
      where,
      order: [['applied_date', 'DESC']]
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching penalties:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch penalties',
      error: error.message
    });
  }
};

export const getPenaltyById = async (req, res) => {
  try {
    const { id } = req.params;

    const penalty = await Penalty.findByPk(id);

    if (!penalty) {
      return res.status(404).json({
        success: false,
        message: 'Penalty not found'
      });
    }

    res.json({
      success: true,
      data: penalty
    });
  } catch (error) {
    console.error('Error fetching penalty:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch penalty',
      error: error.message
    });
  }
};

export const getPenaltiesByLoan = async (req, res) => {
  try {
    const { loan_id } = req.params;
    const { status } = req.query;

    const penalties = await Penalty.findByLoanId(loan_id, { status });

    const totalActive = await Penalty.getTotalActiveByLoan(loan_id);

    res.json({
      success: true,
      data: {
        penalties,
        summary: {
          total: penalties.length,
          active: penalties.filter(p => p.status === 'ACTIVE').length,
          waived: penalties.filter(p => p.status === 'WAIVED').length,
          paid: penalties.filter(p => p.status === 'PAID').length,
          total_amount: totalActive
        }
      }
    });
  } catch (error) {
    console.error('Error fetching loan penalties:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loan penalties',
      error: error.message
    });
  }
};

export const updatePenalty = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const penalty = await Penalty.findByPk(id);

    if (!penalty) {
      return res.status(404).json({
        success: false,
        message: 'Penalty not found'
      });
    }

    // Don't allow updating certain fields if penalty is already paid/waived
    if (['PAID', 'WAIVED'].includes(penalty.status)) {
      const restrictedFields = ['amount', 'rate', 'calculation_basis', 'period_start', 'period_end'];
      for (const field of restrictedFields) {
        if (field in updateData) {
          return res.status(400).json({
            success: false,
            message: `Cannot update ${field} for ${penalty.status} penalty`
          });
        }
      }
    }

    await penalty.update(updateData);

    res.json({
      success: true,
      message: 'Penalty updated successfully',
      data: penalty
    });
  } catch (error) {
    console.error('Error updating penalty:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update penalty',
      error: error.message
    });
  }
};

export const waivePenalty = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const penalty = await PenaltyService.waivePenalty(id, userId, reason);

    res.json({
      success: true,
      message: 'Penalty waived successfully',
      data: penalty
    });
  } catch (error) {
    console.error('Error waiving penalty:', error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

export const settlePenalty = async (req, res) => {
  try {
    const { id } = req.params;
    const { reference_number } = req.body;

    const penalty = await PenaltyService.settlePenalty(id, reference_number);

    res.json({
      success: true,
      message: 'Penalty settled successfully',
      data: penalty
    });
  } catch (error) {
    console.error('Error settling penalty:', error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

export const applyLatePaymentPenalty = async (req, res) => {
  try {
    const { loan_id, overdue_days, principal_amount } = req.body;

    if (!loan_id || overdue_days === undefined || !principal_amount) {
      return res.status(400).json({
        success: false,
        message: 'loan_id, overdue_days, and principal_amount are required'
      });
    }

    const penalty = await PenaltyService.applyLatePaymentPenalty(
      loan_id,
      parseInt(overdue_days),
      parseFloat(principal_amount)
    );

    if (!penalty) {
      return res.json({
        success: true,
        message: 'No penalty applied (within grace period or no active rule)',
        data: null
      });
    }

    res.status(201).json({
      success: true,
      message: 'Late payment penalty applied successfully',
      data: penalty
    });
  } catch (error) {
    console.error('Error applying late payment penalty:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply late payment penalty',
      error: error.message
    });
  }
};

export const applyBatchPenalties = async (req, res) => {
  try {
    const { overdue_loans } = req.body;

    if (!overdue_loans || !Array.isArray(overdue_loans)) {
      return res.status(400).json({
        success: false,
        message: 'overdue_loans array is required'
      });
    }

    const results = await PenaltyService.applyBatchPenalties(overdue_loans);

    res.json({
      success: true,
      message: 'Batch penalties applied',
      data: results
    });
  } catch (error) {
    console.error('Error applying batch penalties:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply batch penalties',
      error: error.message
    });
  }
};

export const recalculatePenalties = async (req, res) => {
  try {
    const { loan_id } = req.params;

    const result = await PenaltyService.recalculatePenalties(loan_id);

    res.json({
      success: true,
      message: 'Penalties recalculated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error recalculating penalties:', error);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

export const getPenaltyStatistics = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const where = {};
    
    // Date range filtering
    if (start_date || end_date) {
      where.applied_date = {};
      if (start_date) where.applied_date[sequelize.Op.gte] = new Date(start_date);
      if (end_date) where.applied_date[sequelize.Op.lte] = new Date(end_date);
    }

    // Get statistics by status
    const statusStats = await Penalty.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
      ],
      where,
      group: ['status'],
      raw: true
    });

    // Get statistics by penalty type
    const typeStats = await Penalty.findAll({
      attributes: [
        'penalty_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
      ],
      where,
      group: ['penalty_type'],
      raw: true
    });

    // Get overall totals
    const totals = await Penalty.findOne({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
        [
          sequelize.literal(`SUM(CASE WHEN status = 'ACTIVE' THEN amount ELSE 0 END)`),
          'active_amount'
        ],
        [
          sequelize.literal(`SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END)`),
          'paid_amount'
        ]
      ],
      where,
      raw: true
    });

    res.json({
      success: true,
      data: {
        by_status: statusStats,
        by_type: typeStats,
        totals
      }
    });
  } catch (error) {
    console.error('Error fetching penalty statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch penalty statistics',
      error: error.message
    });
  }
};