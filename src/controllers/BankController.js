// controllers/bankController.js
import { Op } from 'sequelize';
import Bank from '../models/Banks.js';
import logger from '../utils/logger.js';

// @desc    Get all banks
// @route   GET /api/banks
// @access  Public
export const getAllBanks = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'name',
      sortOrder = 'asc',
      search,
      status
    } = req.query;

    // Build where conditions
    const where = {};
    
    if (status) {
      where.status = status.toUpperCase();
    }
    
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { code: { [Op.like]: `%${search}%` } },
        { long_code: { [Op.like]: `%${search}%` } }
      ];
    }

    // Parse pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build order
    const order = [[sortBy, sortOrder.toUpperCase()]];

    // Execute query with pagination
    const { count, rows: banks } = await Bank.findAndCountAll({
      where,
      order,
      limit: limitNum,
      offset,
      raw: true // Returns plain objects instead of instances
    });

    const totalPages = Math.ceil(count / limitNum);

    res.status(200).json({
      success: true,
      data: banks,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });

  } catch (error) {
    logger.error('Get all banks error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error while fetching banks',
      error: error.message
    });
  }
};

// @desc    Get single bank
// @route   GET /api/banks/:id
// @access  Public
export const getBank = async (req, res) => {
  try {
    const { id } = req.params;

    // Try to find by primary key (ID)
    let bank = await Bank.findByPk(id);
    
    // If not found by primary key, try to find by numeric id field
    if (!bank) {
      // Check if id is a number (for numeric id field)
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        bank = await Bank.findOne({ where: { id: numericId } });
      }
    }

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Bank not found'
      });
    }

    res.status(200).json({
      success: true,
      data: bank
    });

  } catch (error) {
    logger.error('Get bank error:', { error: error.message, id: req.params.id });
    res.status(500).json({
      success: false,
      message: 'Server error while fetching bank',
      error: error.message
    });
  }
};

// @desc    Create new bank
// @route   POST /api/banks
// @access  Private/Admin
export const createBank = async (req, res) => {
  try {
    const { name, code, long_code, country } = req.body;

    // Check if bank already exists
    const existingBank = await Bank.findOne({
      where: {
        [Op.or]: [
          { code: code.toUpperCase() },
          { long_code: long_code.toUpperCase() },
          { name: { [Op.eq]: name.trim() } } // Case-sensitive exact match
        ]
      }
    });

    if (existingBank) {
      return res.status(400).json({
        success: false,
        message: 'Bank with same code, long code or name already exists'
      });
    }

    // Get next ID
    const lastBank = await Bank.findOne({ 
      order: [['id', 'DESC']] 
    });
    
    const nextId = lastBank ? lastBank.id + 1 : 1;

    const bank = await Bank.create({
      id: nextId,
      name: name.trim(),
      code: code.toUpperCase().trim(),
      long_code: long_code.toUpperCase().trim(),
      country: country?.toUpperCase() || 'NG',
      status: 'ACTIVE', // Default status
      created_at: new Date(),
      updated_at: new Date()
    });

    logger.info('Bank created successfully', { bankId: bank.id, code: bank.code });

    res.status(201).json({
      success: true,
      message: 'Bank created successfully',
      data: bank
    });

  } catch (error) {
    logger.error('Create bank error:', { error: error.message });
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(err => err.message)
      });
    }
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Bank with same code, long code or name already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while creating bank',
      error: error.message
    });
  }
};

// @desc    Update bank
// @route   PUT /api/banks/:id
// @access  Private/Admin
export const updateBank = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove immutable fields
    delete updateData.id;
    
    // First, find the bank
    let bank;
    
    // Try by primary key first
    bank = await Bank.findByPk(id);
    
    // If not found, try by numeric id field
    if (!bank) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        bank = await Bank.findOne({ where: { id: numericId } });
      }
    }

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Bank not found'
      });
    }

    const actualId = bank.id; // Use the actual id for update

    // If updating code or long_code, check for duplicates (exclude current bank)
    if (updateData.code || updateData.long_code) {
      const where = {
        [Op.and]: [
          { id: { [Op.ne]: actualId } }
        ]
      };
      
      const orConditions = [];
      
      if (updateData.code) {
        orConditions.push({ code: updateData.code.toUpperCase() });
      }
      
      if (updateData.long_code) {
        orConditions.push({ long_code: updateData.long_code.toUpperCase() });
      }
      
      if (orConditions.length > 0) {
        where[Op.and].push({ [Op.or]: orConditions });
      }

      const existingBank = await Bank.findOne({ where });
      
      if (existingBank) {
        return res.status(400).json({
          success: false,
          message: 'Bank with same code or long code already exists'
        });
      }
    }

    // Normalize data
    if (updateData.code) updateData.code = updateData.code.toUpperCase().trim();
    if (updateData.long_code) updateData.long_code = updateData.long_code.toUpperCase().trim();
    if (updateData.name) updateData.name = updateData.name.trim();
    if (updateData.country) updateData.country = updateData.country.toUpperCase();

    updateData.updated_at = new Date();

    // Update the bank
    await Bank.update(updateData, {
      where: { id: actualId }
    });

    // Fetch updated bank
    const updatedBank = await Bank.findByPk(actualId);

    logger.info('Bank updated successfully', { bankId: updatedBank.id, code: updatedBank.code });

    res.status(200).json({
      success: true,
      message: 'Bank updated successfully',
      data: updatedBank
    });

  } catch (error) {
    logger.error('Update bank error:', { error: error.message, id: req.params.id });
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(err => err.message)
      });
    }
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Duplicate code or long code'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while updating bank',
      error: error.message
    });
  }
};

// @desc    Delete bank
// @route   DELETE /api/banks/:id
// @access  Private/Admin
export const deleteBank = async (req, res) => {
  try {
    const { id } = req.params;

    // First, find the bank
    let bank;
    
    // Try by primary key first
    bank = await Bank.findByPk(id);
    
    // If not found, try by numeric id field
    if (!bank) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        bank = await Bank.findOne({ where: { id: numericId } });
      }
    }

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Bank not found'
      });
    }

    const actualId = bank.id; // Use the actual id for delete

    // Delete the bank
    await Bank.destroy({
      where: { id: actualId }
    });

    logger.info('Bank deleted successfully', { bankId: actualId, code: bank.code });

    res.status(200).json({
      success: true,
      message: 'Bank deleted successfully',
      data: { id: bank.id, name: bank.name }
    });

  } catch (error) {
    logger.error('Delete bank error:', { error: error.message, id: req.params.id });
    
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete bank because it is referenced by other records'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while deleting bank',
      error: error.message
    });
  }
};

// @desc    Get active banks
// @route   GET /api/banks/active/list
// @access  Public
export const getActiveBanks = async (req, res) => {
  try {
    const banks = await Bank.findAll({
      where: { status: 'ACTIVE' },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'code', 'long_code', 'displayName'],
      raw: true
    });

    res.status(200).json({
      success: true,
      data: banks
    });

  } catch (error) {
    logger.error('Get active banks error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error while fetching active banks',
      error: error.message
    });
  }
};

// @desc    Search banks
// @route   GET /api/banks/search/:query
// @access  Public
export const searchBanks = async (req, res) => {
  try {
    const { query } = req.params;

    const banks = await Bank.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: `%${query}%` } },
          { code: { [Op.like]: `%${query}%` } },
          { long_code: { [Op.like]: `%${query}%` } }
        ],
        status: 'ACTIVE'
      },
      order: [['name', 'ASC']],
      limit: 20,
      attributes: ['id', 'name', 'code', 'long_code', 'displayName'],
      raw: true
    });

    res.status(200).json({
      success: true,
      data: banks
    });

  } catch (error) {
    logger.error('Search banks error:', { error: error.message, query: req.params.query });
    res.status(500).json({
      success: false,
      message: 'Server error while searching banks',
      error: error.message
    });
  }
};

// @desc    Get bank by code
// @route   GET /api/banks/code/:code
// @access  Public
export const getBankByCode = async (req, res) => {
  try {
    const { code } = req.params;

    const bank = await Bank.findOne({
      where: { 
        code: code.toUpperCase(),
        status: 'ACTIVE'
      }
    });

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Bank not found'
      });
    }

    res.status(200).json({
      success: true,
      data: bank
    });

  } catch (error) {
    logger.error('Get bank by code error:', { error: error.message, code: req.params.code });
    res.status(500).json({
      success: false,
      message: 'Server error while fetching bank by code',
      error: error.message
    });
  }
};