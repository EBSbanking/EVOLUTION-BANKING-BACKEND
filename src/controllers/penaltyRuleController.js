// controllers/penaltyRuleController.js
import PenaltyRule from '../models/PenaltyRule.js';
import { paginate } from '../utils/pagination.js';

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