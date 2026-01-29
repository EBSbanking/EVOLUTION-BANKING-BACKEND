import { NextOfKin, Customer } from '../models/index.js';

// @desc    Get all next of kins
// @route   GET /api/next-of-kins
// @access  Private
export const getAllNextOfKins = async (req, res) => {
  try {
    const { customerId, isPrimary, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const where = {};
    if (customerId) where.customerId = customerId;
    if (isPrimary) where.IS_PRIMARY = isPrimary === 'true';
    
    const { count, rows: nextOfKins } = await NextOfKin.findAndCountAll({
      where,
      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['id', 'CUST_ID', 'CUST_NM', 'CUST_NO', 'status']
      }],
      order: [['IS_PRIMARY', 'DESC'], ['CREATED_DT', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.status(200).json({
      success: true,
      count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      nextOfKins
    });
  } catch (error) {
    console.error('Error getting next of kins:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get next of kin by ID
// @route   GET /api/next-of-kins/:id
// @access  Private
export const getNextOfKinById = async (req, res) => {
  try {
    const nextOfKin = await NextOfKin.findByPk(req.params.id, {
      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['id', 'CUST_ID', 'CUST_NM', 'CUST_NO', 'status', 'PHONE_NO', 'EMAIL_ADDRESS']
      }]
    });
    
    if (!nextOfKin) {
      return res.status(404).json({
        success: false,
        message: 'Next of kin not found'
      });
    }
    
    res.status(200).json({
      success: true,
      nextOfKin
    });
  } catch (error) {
    console.error('Error getting next of kin:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get next of kins by customer ID
// @route   GET /api/customers/:customerId/next-of-kins
// @access  Private
export const getNextOfKinsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    // Check if customer exists
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    const nextOfKins = await NextOfKin.findAll({
      where: { customerId },
      order: [['IS_PRIMARY', 'DESC'], ['CREATED_DT', 'DESC']]
    });
    
    res.status(200).json({
      success: true,
      count: nextOfKins.length,
      nextOfKins
    });
  } catch (error) {
    console.error('Error getting customer next of kins:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create next of kin
// @route   POST /api/next-of-kins
// @access  Private
export const createNextOfKin = async (req, res) => {
  try {
    const {
      customerId,
      NEXTOF_KIN_NM,
      RELATIONSHIP,
      PHONE_NO,
      EMAIL,
      ADDRESS,
      IS_PRIMARY
    } = req.body;
    
    // Validate required fields
    if (!customerId || !NEXTOF_KIN_NM || !RELATIONSHIP || !PHONE_NO || !ADDRESS) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: customerId, NEXTOF_KIN_NM, RELATIONSHIP, PHONE_NO, ADDRESS'
      });
    }
    
    // Check if customer exists
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // If setting as primary, unset other primary next of kins
    if (IS_PRIMARY === true) {
      await NextOfKin.update(
        { IS_PRIMARY: false },
        { where: { customerId, IS_PRIMARY: true } }
      );
    }
    
    const nextOfKin = await NextOfKin.create({
      customerId,
      NEXTOF_KIN_NM,
      RELATIONSHIP,
      PHONE_NO,
      EMAIL,
      ADDRESS,
      IS_PRIMARY: IS_PRIMARY || false,
      CREATED_DT: new Date()
    });
    
    res.status(201).json({
      success: true,
      message: 'Next of kin created successfully',
      nextOfKin
    });
  } catch (error) {
    console.error('Error creating next of kin:', error);
    
    if (error.name === 'SequelizeValidationError') {
      const errors = error.errors.map(err => ({
        field: err.path,
        message: err.message
      }));
      
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

// @desc    Update next of kin
// @route   PUT /api/next-of-kins/:id
// @access  Private
export const updateNextOfKin = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const nextOfKin = await NextOfKin.findByPk(id);
    if (!nextOfKin) {
      return res.status(404).json({
        success: false,
        message: 'Next of kin not found'
      });
    }
    
    // If setting as primary and it's currently not primary
    if (updateData.IS_PRIMARY === true && !nextOfKin.IS_PRIMARY) {
      await NextOfKin.update(
        { IS_PRIMARY: false },
        { where: { customerId: nextOfKin.customerId, IS_PRIMARY: true } }
      );
    }
    
    // Update the record
    await nextOfKin.update(updateData);
    
    res.status(200).json({
      success: true,
      message: 'Next of kin updated successfully',
      nextOfKin
    });
  } catch (error) {
    console.error('Error updating next of kin:', error);
    
    if (error.name === 'SequelizeValidationError') {
      const errors = error.errors.map(err => ({
        field: err.path,
        message: err.message
      }));
      
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

// @desc    Delete next of kin
// @route   DELETE /api/next-of-kins/:id
// @access  Private
export const deleteNextOfKin = async (req, res) => {
  try {
    const { id } = req.params;
    
    const nextOfKin = await NextOfKin.findByPk(id);
    if (!nextOfKin) {
      return res.status(404).json({
        success: false,
        message: 'Next of kin not found'
      });
    }
    
    await nextOfKin.destroy();
    
    res.status(200).json({
      success: true,
      message: 'Next of kin deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting next of kin:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Set primary next of kin
// @route   PUT /api/next-of-kins/:id/set-primary
// @access  Private
export const setPrimaryNextOfKin = async (req, res) => {
  try {
    const { id } = req.params;
    
    const nextOfKin = await NextOfKin.findByPk(id);
    if (!nextOfKin) {
      return res.status(404).json({
        success: false,
        message: 'Next of kin not found'
      });
    }
    
    // Unset all other primary next of kins for this customer
    await NextOfKin.update(
      { IS_PRIMARY: false },
      { where: { customerId: nextOfKin.customerId, IS_PRIMARY: true } }
    );
    
    // Set this one as primary
    nextOfKin.IS_PRIMARY = true;
    await nextOfKin.save();
    
    res.status(200).json({
      success: true,
      message: 'Primary next of kin set successfully',
      nextOfKin
    });
  } catch (error) {
    console.error('Error setting primary next of kin:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get primary next of kin for customer
// @route   GET /api/customers/:customerId/next-of-kins/primary
// @access  Private
export const getPrimaryNextOfKin = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    const primaryNextOfKin = await NextOfKin.findOne({
      where: { customerId, IS_PRIMARY: true }
    });
    
    res.status(200).json({
      success: true,
      primaryNextOfKin: primaryNextOfKin || null
    });
  } catch (error) {
    console.error('Error getting primary next of kin:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Bulk create next of kins
// @route   POST /api/next-of-kins/bulk
// @access  Private
export const bulkCreateNextOfKins = async (req, res) => {
  try {
    const { customerId, nextOfKins } = req.body;
    
    if (!customerId || !Array.isArray(nextOfKins) || nextOfKins.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide customerId and array of nextOfKins'
      });
    }
    
    // Check if customer exists
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // Prepare data for bulk create
    const nextOfKinData = nextOfKins.map((nok, index) => ({
      customerId,
      NEXTOF_KIN_NM: nok.NEXTOF_KIN_NM,
      RELATIONSHIP: nok.RELATIONSHIP,
      PHONE_NO: nok.PHONE_NO,
      EMAIL: nok.EMAIL,
      ADDRESS: nok.ADDRESS,
      IS_PRIMARY: index === 0, // First one as primary if none specified
      CREATED_DT: new Date()
    }));
    
    const created = await NextOfKin.bulkCreate(nextOfKinData, {
      validate: true,
      returning: true
    });
    
    res.status(201).json({
      success: true,
      message: `${created.length} next of kins created successfully`,
      count: created.length,
      nextOfKins: created
    });
  } catch (error) {
    console.error('Error bulk creating next of kins:', error);
    
    if (error.name === 'SequelizeValidationError') {
      const errors = error.errors.map(err => ({
        field: err.path,
        message: err.message
      }));
      
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