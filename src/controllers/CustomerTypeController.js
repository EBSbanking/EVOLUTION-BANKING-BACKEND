// src/controllers/customerTypeController.js - USING MODEL HELPER
import { getCustomerType } from '../utils/modelHelper.js';

// @desc    Get all customer types
// @route   GET /api/customer-types
// @access  Public/Private
export const getAllCustomerTypes = async (req, res) => {
  try {
    const CustomerType = getCustomerType();
    
    const { 
      category, 
      status = 'ACTIVE', 
      includeInactive = false,
      page = 1, 
      limit = 20 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    const where = {};
    
    if (!includeInactive) {
      where.REC_ST = status.toUpperCase();
    }
    
    if (category) {
      where.CUST_CAT = category.toUpperCase();
    }
    
    const { count, rows: customerTypes } = await CustomerType.findAndCountAll({
      where,
      order: [['CUST_TY', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.status(200).json({
      success: true,
      count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      customerTypes: customerTypes.map(ct => ct.getSummary ? ct.getSummary() : ct)
    });
  } catch (error) {
    console.error('Error getting customer types:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get active customer types
// @route   GET /api/customer-types/active
// @access  Public
export const getActiveCustomerTypes = async (req, res) => {
  try {
    const CustomerType = getCustomerType();
    
    const customerTypes = await CustomerType.findAll({
      where: { REC_ST: 'ACTIVE' },
      order: [['CUST_TY', 'ASC']]
    });
    
    res.status(200).json({
      success: true,
      count: customerTypes.length,
      customerTypes: customerTypes.map(ct => ct.getSummary ? ct.getSummary() : ct)
    });
  } catch (error) {
    console.error('Error getting active customer types:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get customer type by ID
// @route   GET /api/customer-types/:id
// @access  Private
export const getCustomerTypeById = async (req, res) => {
  try {
    const CustomerType = getCustomerType();
    
    const customerType = await CustomerType.findByPk(req.params.id);
    
    if (!customerType) {
      return res.status(404).json({
        success: false,
        message: 'Customer type not found'
      });
    }
    
    res.status(200).json({
      success: true,
      customerType: customerType.getSummary ? customerType.getSummary() : customerType
    });
  } catch (error) {
    console.error('Error getting customer type:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create customer type
// @route   POST /api/customer-types
// @access  Private (Admin only)
export const createCustomerType = async (req, res) => {
  try {
    const CustomerType = getCustomerType();
    
    const {
      CUST_TY,
      CUST_CAT,
      DESCRIPTION,
      MIN_AGE,
      MAX_AGE,
      REC_ST = 'ACTIVE'
    } = req.body;
    
    // Validate required fields
    if (!CUST_TY || !CUST_CAT || !DESCRIPTION || MIN_AGE === undefined || MAX_AGE === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: CUST_TY, CUST_CAT, DESCRIPTION, MIN_AGE, MAX_AGE'
      });
    }
    
    // Check if customer type already exists
    const existingType = await CustomerType.findOne({ where: { CUST_TY } });
    if (existingType) {
      return res.status(400).json({
        success: false,
        message: `Customer type '${CUST_TY}' already exists`
      });
    }
    
    // Validate age range
    if (parseInt(MIN_AGE) >= parseInt(MAX_AGE)) {
      return res.status(400).json({
        success: false,
        message: 'MIN_AGE must be less than MAX_AGE'
      });
    }
    
    const customerType = await CustomerType.create({
      CUST_TY,
      CUST_CAT: CUST_CAT.toUpperCase(),
      DESCRIPTION,
      MIN_AGE: parseInt(MIN_AGE),
      MAX_AGE: parseInt(MAX_AGE),
      REC_ST: REC_ST.toUpperCase()
    });
    
    res.status(201).json({
      success: true,
      message: 'Customer type created successfully',
      customerType: customerType.getSummary ? customerType.getSummary() : customerType
    });
  } catch (error) {
    console.error('Error creating customer type:', error);
    
    if (error.name === 'SequelizeValidationError') {
      const errors = error.errors?.map(err => ({
        field: err.path,
        message: err.message
      })) || [];
      
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update customer type
// @route   PUT /api/customer-types/:id
// @access  Private (Admin only)
export const updateCustomerType = async (req, res) => {
  try {
    const CustomerType = getCustomerType();
    const { id } = req.params;
    const updateData = req.body;
    
    const customerType = await CustomerType.findByPk(id);
    if (!customerType) {
      return res.status(404).json({
        success: false,
        message: 'Customer type not found'
      });
    }
    
    // If updating CUST_TY, check for duplicates
    if (updateData.CUST_TY && updateData.CUST_TY !== customerType.CUST_TY) {
      const existingType = await CustomerType.findOne({ 
        where: { CUST_TY: updateData.CUST_TY } 
      });
      
      if (existingType && existingType.CUST_TY_ID !== parseInt(id)) {
        return res.status(400).json({
          success: false,
          message: `Customer type '${updateData.CUST_TY}' already exists`
        });
      }
    }
    
    // Convert enums to uppercase if provided
    if (updateData.CUST_CAT) {
      updateData.CUST_CAT = updateData.CUST_CAT.toUpperCase();
    }
    
    if (updateData.REC_ST) {
      updateData.REC_ST = updateData.REC_ST.toUpperCase();
    }
    
    // Validate age range if updating ages
    if (updateData.MIN_AGE !== undefined || updateData.MAX_AGE !== undefined) {
      const minAge = updateData.MIN_AGE !== undefined ? parseInt(updateData.MIN_AGE) : customerType.MIN_AGE;
      const maxAge = updateData.MAX_AGE !== undefined ? parseInt(updateData.MAX_AGE) : customerType.MAX_AGE;
      
      if (minAge >= maxAge) {
        return res.status(400).json({
          success: false,
          message: 'MIN_AGE must be less than MAX_AGE'
        });
      }
    }
    
    await customerType.update(updateData);
    
    res.status(200).json({
      success: true,
      message: 'Customer type updated successfully',
      customerType: customerType.getSummary ? customerType.getSummary() : customerType
    });
  } catch (error) {
    console.error('Error updating customer type:', error);
    
    if (error.name === 'SequelizeValidationError') {
      const errors = error.errors?.map(err => ({
        field: err.path,
        message: err.message
      })) || [];
      
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete customer type (soft delete)
// @route   DELETE /api/customer-types/:id
// @access  Private (Admin only)
export const deleteCustomerType = async (req, res) => {
  try {
    const CustomerType = getCustomerType();
    const { id } = req.params;
    
    const customerType = await CustomerType.findByPk(id);
    if (!customerType) {
      return res.status(404).json({
        success: false,
        message: 'Customer type not found'
      });
    }
    
    await customerType.destroy();
    
    res.status(200).json({
      success: true,
      message: 'Customer type deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting customer type:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Activate customer type
// @route   PUT /api/customer-types/:id/activate
// @access  Private (Admin only)
export const activateCustomerType = async (req, res) => {
  try {
    const CustomerType = getCustomerType();
    const { id } = req.params;
    
    const customerType = await CustomerType.findByPk(id);
    if (!customerType) {
      return res.status(404).json({
        success: false,
        message: 'Customer type not found'
      });
    }
    
    await customerType.update({ REC_ST: 'ACTIVE' });
    
    res.status(200).json({
      success: true,
      message: 'Customer type activated successfully',
      customerType: customerType.getSummary ? customerType.getSummary() : customerType
    });
  } catch (error) {
    console.error('Error activating customer type:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Deactivate customer type
// @route   PUT /api/customer-types/:id/deactivate
// @access  Private (Admin only)
export const deactivateCustomerType = async (req, res) => {
  try {
    const CustomerType = getCustomerType();
    const { id } = req.params;
    
    const customerType = await CustomerType.findByPk(id);
    if (!customerType) {
      return res.status(404).json({
        success: false,
        message: 'Customer type not found'
      });
    }
    
    await customerType.update({ REC_ST: 'INACTIVE' });
    
    res.status(200).json({
      success: true,
      message: 'Customer type deactivated successfully',
      customerType: customerType.getSummary ? customerType.getSummary() : customerType
    });
  } catch (error) {
    console.error('Error deactivating customer type:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Validate customer age against type
// @route   POST /api/customer-types/validate-age
// @access  Public/Private
export const validateCustomerAge = async (req, res) => {
  try {
    const CustomerType = getCustomerType();
    const { customerTypeId, age } = req.body;
    
    if (!customerTypeId || age === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide customerTypeId and age'
      });
    }
    
    const customerType = await CustomerType.findByPk(customerTypeId);
    
    if (!customerType) {
      return res.status(404).json({
        success: false,
        isValid: false,
        message: 'Customer type not found'
      });
    }
    
    const minAge = customerType.MIN_AGE;
    const maxAge = customerType.MAX_AGE;
    const parsedAge = parseInt(age);
    
    if (parsedAge < minAge) {
      return res.status(200).json({
        success: false,
        isValid: false,
        message: `Minimum age for ${customerType.CUST_TY} is ${minAge} years`
      });
    }
    
    if (parsedAge > maxAge) {
      return res.status(200).json({
        success: false,
        isValid: false,
        message: `Maximum age for ${customerType.CUST_TY} is ${maxAge} years`
      });
    }
    
    res.status(200).json({
      success: true,
      isValid: true,
      message: 'Age is valid for this customer type'
    });
  } catch (error) {
    console.error('Error validating customer age:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get customer types by category
// @route   GET /api/customer-types/category/:category
// @access  Public
export const getCustomerTypesByCategory = async (req, res) => {
  try {
    const CustomerType = getCustomerType();
    const { category } = req.params;
    
    const validCategories = ['INDIVIDUAL', 'CORPORATE', 'SME', 'GOVERNMENT', 'STAFF'];
    if (!validCategories.includes(category.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category. Must be: INDIVIDUAL, CORPORATE, SME, GOVERNMENT, or STAFF'
      });
    }
    
    const customerTypes = await CustomerType.findAll({
      where: { 
        CUST_CAT: category.toUpperCase(),
        REC_ST: 'ACTIVE'
      },
      order: [['CUST_TY', 'ASC']]
    });
    
    res.status(200).json({
      success: true,
      category: category.toUpperCase(),
      count: customerTypes.length,
      customerTypes: customerTypes.map(ct => ct.getSummary ? ct.getSummary() : ct)
    });
  } catch (error) {
    console.error('Error getting customer types by category:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get all customer type categories
// @route   GET /api/customer-types/categories
// @access  Public
export const getCustomerTypeCategories = async (req, res) => {
  try {
    const CustomerType = getCustomerType();
    
    const categories = [
      { 
        value: 'INDIVIDUAL', 
        label: 'Individual', 
        description: 'Individual customers/personal banking' 
      },
      { 
        value: 'CORPORATE', 
        label: 'Corporate', 
        description: 'Large corporate organizations' 
      },
      { 
        value: 'SME', 
        label: 'SME', 
        description: 'Small and Medium Enterprises' 
      },
      { 
        value: 'GOVERNMENT', 
        label: 'Government', 
        description: 'Government agencies and parastatals' 
      },
      { 
        value: 'STAFF', 
        label: 'Staff', 
        description: 'Bank staff members' 
      }
    ];
    
    // Get count for each category
    const counts = await Promise.all(
      categories.map(async (category) => {
        const count = await CustomerType.count({ 
          where: { 
            CUST_CAT: category.value,
            REC_ST: 'ACTIVE'
          }
        });
        return { ...category, count };
      })
    );
    
    res.status(200).json({
      success: true,
      categories: counts
    });
  } catch (error) {
    console.error('Error getting customer type categories:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};