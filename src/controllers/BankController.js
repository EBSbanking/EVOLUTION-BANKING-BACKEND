// controllers/bankController.js
import Bank from '../models/Banks.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

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

    // Build filter
    const filter = {};
    if (status) filter.status = status.toUpperCase();
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { long_code: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const banks = await Bank.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await Bank.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      success: true,
      data: banks,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
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

    // Check if ID is ObjectId or numeric ID
    let bank;
    if (mongoose.Types.ObjectId.isValid(id)) {
      bank = await Bank.findById(id);
    } else {
      bank = await Bank.findOne({ id: parseInt(id) });
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
      $or: [
        { code: code.toUpperCase() },
        { long_code: long_code.toUpperCase() },
        { name: { $regex: `^${name}$`, $options: 'i' } }
      ]
    });

    if (existingBank) {
      return res.status(400).json({
        success: false,
        message: 'Bank with same code, long code or name already exists'
      });
    }

    // Get next ID
    const lastBank = await Bank.findOne().sort({ id: -1 });
    const nextId = lastBank ? lastBank.id + 1 : 1;

    const bank = await Bank.create({
      id: nextId,
      name: name.trim(),
      code: code.toUpperCase().trim(),
      long_code: long_code.toUpperCase().trim(),
      country: country?.toUpperCase() || 'NG',
      
    });

    logger.info('Bank created successfully', { bankId: bank._id, code: bank.code });

    res.status(201).json({
      success: true,
      message: 'Bank created successfully',
      data: bank
    });

  } catch (error) {
    logger.error('Create bank error:', { error: error.message });
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
// @desc    Update bank
// @route   PUT /api/banks/:id
// @access  Private/Admin
export const updateBank = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove immutable fields
    delete updateData.id;
    delete updateData._id;

    // First, find the bank to get its _id (handle numeric or ObjectId)
    let bank;
    if (mongoose.Types.ObjectId.isValid(id)) {
      bank = await Bank.findById(id);
    } else {
      bank = await Bank.findOne({ id: parseInt(id) });
    }

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Bank not found'
      });
    }

    const actualId = bank._id; // Use the actual _id for update

    // If updating code or long_code, check for duplicates (exclude current bank)
    if (updateData.code || updateData.long_code) {
      const duplicateFilter = { _id: { $ne: actualId } };
      if (updateData.code) {
        duplicateFilter.$or = [{ code: updateData.code.toUpperCase() }];
      }
      if (updateData.long_code) {
        duplicateFilter.$or = duplicateFilter.$or || [];
        duplicateFilter.$or.push({ long_code: updateData.long_code.toUpperCase() });
      }

      const existingBank = await Bank.findOne(duplicateFilter);
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

    updateData.last_updated = new Date();

    const updatedBank = await Bank.findByIdAndUpdate(
      actualId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    logger.info('Bank updated successfully', { bankId: updatedBank._id, code: updatedBank.code });

    res.status(200).json({
      success: true,
      message: 'Bank updated successfully',
      data: updatedBank
    });

  } catch (error) {
    logger.error('Update bank error:', { error: error.message, id: req.params.id });
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

    // First, find the bank to get its _id (handle numeric or ObjectId)
    let bank;
    if (mongoose.Types.ObjectId.isValid(id)) {
      bank = await Bank.findById(id);
    } else {
      bank = await Bank.findOne({ id: parseInt(id) });
    }

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Bank not found'
      });
    }

    const actualId = bank._id; // Use the actual _id for delete

    await Bank.findByIdAndDelete(actualId);

    logger.info('Bank deleted successfully', { bankId: actualId, code: bank.code });

    res.status(200).json({
      success: true,
      message: 'Bank deleted successfully',
      data: { id: bank.id, name: bank.name }  // Use numeric id in response
    });

  } catch (error) {
    logger.error('Delete bank error:', { error: error.message, id: req.params.id });
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
    const banks = await Bank.findActive()
      .sort({ name: 1 })
      .select('id name code long_code displayName')
      .lean();

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

    const banks = await Bank.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { code: { $regex: query, $options: 'i' } },
        { long_code: { $regex: query, $options: 'i' } }
      ],
      status: 'ACTIVE'
    })
    .sort({ name: 1 })
    .limit(20)
    .select('id name code long_code displayName')
    .lean();

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