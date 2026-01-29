// controllers/autoReclassificationController.js
import AutoReclassifyInformation from '../models/AutoReclassifyInformation.js';
import LoanAccount from '../models/LoanAccount.js';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

// Create a new auto-reclassification configuration
export const createReclassification = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { prod_cd, prod_id, ...configData } = req.body;

    // Validate required fields
    if (!prod_cd || !prod_id) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Product code (prod_cd) and Product ID (prod_id) are required' 
      });
    }

    // Check if configuration already exists for this product
    const existingConfig = await AutoReclassifyInformation.findOne({
      where: { prod_cd },
      transaction
    });

    if (existingConfig) {
      await transaction.rollback();
      return res.status(409).json({ 
        success: false, 
        message: `Reclassification configuration already exists for product code: ${prod_cd}`,
        existingId: existingConfig.id
      });
    }

    // Validate the configuration data
    const validationErrors = AutoReclassifyInformation.validateConfig(req.body);
    if (validationErrors.length > 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed', 
        errors: validationErrors 
      });
    }

    // Create new configuration with transaction
    const newEntry = await AutoReclassifyInformation.create(req.body, { transaction });
    
    await transaction.commit();
    
    res.status(201).json({ 
      success: true, 
      message: 'Reclassification configuration created successfully', 
      data: newEntry 
    });
    
  } catch (error) {
    await transaction.rollback();
    
    console.error('Error creating reclassification:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error creating reclassification configuration', 
      error: error.message 
    });
  }
};

// Get all auto-reclassification configurations
export const getAllReclassifications = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status = 'active', 
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'DESC' 
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {};
    
    // Status filter
    if (status === 'active') {
      whereClause.is_active = true;
    } else if (status === 'inactive') {
      whereClause.is_active = false;
    } else if (status === 'all') {
      // Include all, no filter
    }

    // Search filter
    if (search) {
      whereClause[Op.or] = [
        { prod_cd: { [Op.like]: `%${search}%` } },
        { prod_id: { [Op.like]: `%${search}%` } }
      ];
    }

    // Execute query with pagination
    const { count, rows } = await AutoReclassifyInformation.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder.toUpperCase()]],
      attributes: { exclude: ['createdAt', 'updatedAt'] } // Hide timestamps if needed
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      },
      summary: {
        totalActive: await AutoReclassifyInformation.count({ where: { is_active: true } }),
        totalInactive: await AutoReclassifyInformation.count({ where: { is_active: false } })
      }
    });

  } catch (error) {
    console.error('Error fetching reclassifications:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching reclassification configurations', 
      error: error.message 
    });
  }
};

// Get entry by ID
export const getReclassificationById = async (req, res) => {
  try {
    const entry = await AutoReclassifyInformation.findByPk(req.params.id, {
      attributes: { exclude: ['createdAt', 'updatedAt'] } // Hide timestamps if needed
    });
    
    if (!entry) {
      return res.status(404).json({ 
        success: false, 
        message: 'Reclassification configuration not found' 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      data: entry 
    });
    
  } catch (error) {
    console.error('Error fetching reclassification by ID:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching reclassification configuration', 
      error: error.message 
    });
  }
};

// Get configuration by product code
export const getReclassificationByProductCode = async (req, res) => {
  try {
    const { prod_cd } = req.params;
    
    const entry = await AutoReclassifyInformation.findOne({
      where: { prod_cd },
      attributes: { exclude: ['createdAt', 'updatedAt'] }
    });
    
    if (!entry) {
      return res.status(404).json({ 
        success: false, 
        message: `Reclassification configuration not found for product code: ${prod_cd}` 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      data: entry 
    });
    
  } catch (error) {
    console.error('Error fetching reclassification by product code:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching reclassification configuration', 
      error: error.message 
    });
  }
};

// Update an auto-reclassification configuration
export const updateReclassification = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Find the existing configuration
    const existingConfig = await AutoReclassifyInformation.findByPk(id, { transaction });
    
    if (!existingConfig) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Reclassification configuration not found' 
      });
    }

    // If product code is being changed, check for conflicts
    if (updateData.prod_cd && updateData.prod_cd !== existingConfig.prod_cd) {
      const duplicateConfig = await AutoReclassifyInformation.findOne({
        where: { 
          prod_cd: updateData.prod_cd,
          id: { [Op.ne]: id } // Exclude current record
        },
        transaction
      });
      
      if (duplicateConfig) {
        await transaction.rollback();
        return res.status(409).json({ 
          success: false, 
          message: `Product code "${updateData.prod_cd}" is already in use by another configuration` 
        });
      }
    }

    // If product ID is being changed, validate it
    if (updateData.prod_id && updateData.prod_id !== existingConfig.prod_id) {
      // Check if product ID already exists (optional - depends on your business rules)
      const duplicateProdId = await AutoReclassifyInformation.findOne({
        where: { 
          prod_id: updateData.prod_id,
          id: { [Op.ne]: id }
        },
        transaction
      });
      
      if (duplicateProdId) {
        await transaction.rollback();
        return res.status(409).json({ 
          success: false, 
          message: `Product ID "${updateData.prod_id}" is already in use by another configuration` 
        });
      }
    }

    // Validate the updated configuration data
    const combinedData = {
      ...existingConfig.toJSON(),
      ...updateData
    };
    
    const validationErrors = AutoReclassifyInformation.validateConfig(combinedData);
    if (validationErrors.length > 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed', 
        errors: validationErrors 
      });
    }

    // Add audit information
    const finalUpdateData = {
      ...updateData,
      updated_by: req.user?.username || 'system',
      updatedAt: new Date()
    };

    // Perform the update
    const [affectedRows] = await AutoReclassifyInformation.update(finalUpdateData, {
      where: { id },
      transaction,
      returning: true, // Return updated record
      individualHooks: true // Trigger model hooks
    });

    if (affectedRows === 0) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Reclassification configuration not found or no changes made' 
      });
    }

    // Get the updated record
    const updatedConfig = await AutoReclassifyInformation.findByPk(id, { transaction });
    
    await transaction.commit();
    
    // Log the update for auditing
    logReclassificationUpdate(existingConfig, updatedConfig, req.user);
    
    res.status(200).json({ 
      success: true, 
      message: 'Reclassification configuration updated successfully', 
      data: updatedConfig,
      changes: getChangedFields(existingConfig, updatedConfig)
    });
    
  } catch (error) {
    await transaction.rollback();
    
    console.error('Error updating reclassification:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error updating reclassification configuration', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Partial update (PATCH method)
export const patchReclassification = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const patchData = req.body;
    
    // Find the existing configuration
    const existingConfig = await AutoReclassifyInformation.findByPk(id, { transaction });
    
    if (!existingConfig) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Reclassification configuration not found' 
      });
    }

    // Prepare update data
    const updateData = {
      ...patchData,
      updated_by: req.user?.username || 'system',
      updatedAt: new Date()
    };

    // Apply partial update
    const [affectedRows] = await AutoReclassifyInformation.update(updateData, {
      where: { id },
      transaction,
      returning: true,
      individualHooks: true
    });

    if (affectedRows === 0) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Reclassification configuration not found or no changes made' 
      });
    }

    // Get the updated record
    const updatedConfig = await AutoReclassifyInformation.findByPk(id, { transaction });
    
    await transaction.commit();
    
    // Log the update
    logReclassificationUpdate(existingConfig, updatedConfig, req.user);
    
    res.status(200).json({ 
      success: true, 
      message: 'Reclassification configuration partially updated successfully', 
      data: updatedConfig,
      changes: getChangedFields(existingConfig, updatedConfig)
    });
    
  } catch (error) {
    await transaction.rollback();
    
    console.error('Error patching reclassification:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error updating reclassification configuration', 
      error: error.message 
    });
  }
};

// Delete an auto-reclassification configuration (soft delete)
export const deleteReclassification = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { hardDelete = false } = req.query;
    
    const entry = await AutoReclassifyInformation.findByPk(id, { transaction });
    
    if (!entry) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Reclassification configuration not found' 
      });
    }

    if (hardDelete === 'true') {
      // Hard delete (permanent removal)
      await entry.destroy({ transaction });
      await transaction.commit();
      
      return res.status(200).json({ 
        success: true, 
        message: 'Reclassification configuration permanently deleted' 
      });
    } else {
      // Soft delete (deactivate)
      await entry.update({
        is_active: false,
        updated_by: req.user?.username || 'system',
        updatedAt: new Date()
      }, { transaction });
      
      await transaction.commit();
      
      return res.status(200).json({ 
        success: true, 
        message: 'Reclassification configuration deactivated successfully' 
      });
    }
    
  } catch (error) {
    await transaction.rollback();
    
    console.error('Error deleting reclassification:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting reclassification configuration', 
      error: error.message 
    });
  }
};

// Reactivate a deactivated configuration
export const reactivateReclassification = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    const entry = await AutoReclassifyInformation.findByPk(id, { transaction });
    
    if (!entry) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Reclassification configuration not found' 
      });
    }

    if (entry.is_active) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Configuration is already active' 
      });
    }

    // Reactivate the configuration
    await entry.update({
      is_active: true,
      updated_by: req.user?.username || 'system',
      updatedAt: new Date()
    }, { transaction });
    
    await transaction.commit();
    
    res.status(200).json({ 
      success: true, 
      message: 'Reclassification configuration reactivated successfully', 
      data: entry 
    });
    
  } catch (error) {
    await transaction.rollback();
    
    console.error('Error reactivating reclassification:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error reactivating reclassification configuration', 
      error: error.message 
    });
  }
};

// Get configurations by product type or other criteria
export const getReclassificationsByCriteria = async (req, res) => {
  try {
    const { 
      product_type,
      enabled_features, // e.g., 'pre_dominant,escheated'
      min_days,
      max_days 
    } = req.query;

    const whereClause = { is_active: true };

    // Add filters based on criteria
    if (product_type) {
      whereClause.product_type = product_type;
    }

    if (enabled_features) {
      const features = enabled_features.split(',');
      const featureConditions = [];
      
      features.forEach(feature => {
        switch(feature.trim()) {
          case 'pre_dominant':
            featureConditions.push({ enable_pre_dominant_classification: true });
            break;
          case 'escheated':
            featureConditions.push({ enable_escheated_classification: true });
            break;
          case 'bad_debt':
            featureConditions.push({ enable_bad_debt_classification: true });
            break;
        }
      });
      
      if (featureConditions.length > 0) {
        whereClause[Op.or] = featureConditions;
      }
    }

    // Days range filter
    if (min_days || max_days) {
      const daysFields = [
        'pre_dominant_days',
        'dominant_days',
        'escheated_days',
        'non_accrual_days',
        'delinquent_days',
        'matured_days',
        'bad_debt_days'
      ];
      
      whereClause[Op.or] = daysFields.map(field => {
        const condition = {};
        if (min_days) condition[Op.gte] = parseInt(min_days);
        if (max_days) condition[Op.lte] = parseInt(max_days);
        return { [field]: condition };
      });
    }

    const configurations = await AutoReclassifyInformation.findAll({
      where: whereClause,
      order: [['prod_cd', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: configurations,
      count: configurations.length
    });

  } catch (error) {
    console.error('Error fetching reclassifications by criteria:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching reclassification configurations', 
      error: error.message 
    });
  }
};

// Validate configuration data
export const validateReclassification = async (req, res) => {
  try {
    const validationErrors = AutoReclassifyInformation.validateConfig(req.body);
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Configuration data is valid'
    });
    
  } catch (error) {
    console.error('Error validating reclassification:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error validating configuration', 
      error: error.message 
    });
  }
};

// Get configuration statistics
export const getReclassificationStats = async (req, res) => {
  try {
    const stats = await AutoReclassifyInformation.getSummary();
    
    // Additional statistics
    const totalConfigs = await AutoReclassifyInformation.count();
    const byProductType = await AutoReclassifyInformation.findAll({
      attributes: [
        'product_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['product_type'],
      raw: true
    });

    res.status(200).json({
      success: true,
      data: {
        summary: stats,
        totals: {
          all: totalConfigs,
          byProductType: byProductType.reduce((acc, item) => {
            acc[item.product_type || 'unknown'] = parseInt(item.count);
            return acc;
          }, {})
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching reclassification stats:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching statistics', 
      error: error.message 
    });
  }
};

// Apply reclassification rules to a specific loan
export const applyReclassificationToLoan = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { loan_account_no, prod_cd } = req.body;
    
    if (!loan_account_no || !prod_cd) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Loan account number and product code are required'
      });
    }

    // Find the loan
    const loan = await LoanAccount.findOne({
      where: { ACCT_NO: loan_account_no },
      transaction
    });

    if (!loan) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Loan account ${loan_account_no} not found`
      });
    }

    // Find the reclassification configuration
    const config = await AutoReclassifyInformation.findOne({
      where: { prod_cd, is_active: true },
      transaction
    });

    if (!config) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Reclassification configuration not found for product code: ${prod_cd}`
      });
    }

    // Apply reclassification rules (simplified example)
    const reclassificationResult = {
      loanAccount: loan.ACCT_NO,
      productCode: prod_cd,
      appliedRules: [],
      newClassification: loan.status,
      changes: []
    };

    // Check each rule and apply if conditions met
    if (config.enable_pre_dominant_classification) {
      // Example: Check days overdue and reclassify
      const daysOverdue = calculateDaysOverdue(loan);
      if (daysOverdue >= config.pre_dominant_days) {
        reclassificationResult.appliedRules.push('pre_dominant_classification');
        reclassificationResult.newClassification = 'PRE_DOMINANT';
        reclassificationResult.changes.push({
          rule: 'pre_dominant_classification',
          daysOverdue: daysOverdue,
          threshold: config.pre_dominant_days
        });
      }
    }

    // Update loan if classification changed
    if (reclassificationResult.newClassification !== loan.status) {
      await loan.update({
        status: reclassificationResult.newClassification,
        last_reclassification_date: new Date(),
        reclassification_reason: 'Applied auto-reclassification rules'
      }, { transaction });
    }

    await transaction.commit();
    
    res.status(200).json({
      success: true,
      message: 'Reclassification rules applied successfully',
      data: reclassificationResult
    });
    
  } catch (error) {
    await transaction.rollback();
    
    console.error('Error applying reclassification to loan:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error applying reclassification rules', 
      error: error.message 
    });
  }
};

// Bulk update multiple configurations
export const bulkUpdateReclassifications = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { updates } = req.body; // Array of {id, updateData}
    
    if (!Array.isArray(updates) || updates.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Updates array is required and cannot be empty'
      });
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { id, ...updateData } = update;
        
        if (!id) {
          errors.push({ id, error: 'Missing ID' });
          continue;
        }

        // Find existing configuration
        const existingConfig = await AutoReclassifyInformation.findByPk(id, { transaction });
        
        if (!existingConfig) {
          errors.push({ id, error: 'Configuration not found' });
          continue;
        }

        // Validate update
        const validationErrors = AutoReclassifyInformation.validateConfig({
          ...existingConfig.toJSON(),
          ...updateData
        });

        if (validationErrors.length > 0) {
          errors.push({ id, error: 'Validation failed', details: validationErrors });
          continue;
        }

        // Apply update
        const finalUpdateData = {
          ...updateData,
          updated_by: req.user?.username || 'system',
          updatedAt: new Date()
        };

        const [affectedRows] = await AutoReclassifyInformation.update(finalUpdateData, {
          where: { id },
          transaction
        });

        if (affectedRows > 0) {
          const updatedConfig = await AutoReclassifyInformation.findByPk(id, { transaction });
          results.push({
            id,
            success: true,
            data: updatedConfig
          });
        } else {
          errors.push({ id, error: 'No changes made' });
        }

      } catch (error) {
        errors.push({ id: update.id, error: error.message });
      }
    }

    await transaction.commit();
    
    res.status(200).json({
      success: true,
      message: 'Bulk update completed',
      summary: {
        total: updates.length,
        successful: results.length,
        failed: errors.length
      },
      results,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    await transaction.rollback();
    
    console.error('Error in bulk update:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error performing bulk update', 
      error: error.message 
    });
  }
};

// Helper function to calculate days overdue
const calculateDaysOverdue = (loan) => {
  if (!loan.due_date || !loan.status) return 0;
  
  const dueDate = new Date(loan.due_date);
  const today = new Date();
  const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
  
  return Math.max(0, daysOverdue);
};

// Helper function to get changed fields
const getChangedFields = (oldData, newData) => {
  const changes = [];
  
  // Compare all fields
  const fields = Object.keys(newData.toJSON());
  
  fields.forEach(field => {
    if (oldData[field] !== newData[field]) {
      changes.push({
        field,
        oldValue: oldData[field],
        newValue: newData[field]
      });
    }
  });
  
  return changes;
};

// Helper function to log updates
const logReclassificationUpdate = (oldConfig, newConfig, user) => {
  const changes = getChangedFields(oldConfig, newConfig);
  
  if (changes.length > 0) {
    console.log(`Reclassification config ${newConfig.id} updated by ${user?.username || 'system'}:`, {
      timestamp: new Date(),
      changes,
      oldProdCd: oldConfig.prod_cd,
      newProdCd: newConfig.prod_cd,
      user: user?.username || 'system'
    });
  }
};

// Export all functions
export default {
  createReclassification,
  getAllReclassifications,
  getReclassificationById,
  getReclassificationByProductCode,
  updateReclassification,
  patchReclassification,
  deleteReclassification,
  reactivateReclassification,
  getReclassificationsByCriteria,
  validateReclassification,
  getReclassificationStats,
  applyReclassificationToLoan,
  bulkUpdateReclassifications
};