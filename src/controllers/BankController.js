// controllers/BankController.js
import { Op } from 'sequelize';
import Bank from '../models/Banks.js';
import logger from '../utils/logger.js';
import axios from 'axios';

// Prembly API configuration – read from environment
const PREMBLY_API_KEY = process.env.PREMBLY_API_KEY || process.env.PREMBLY_PUBLIC_KEY;
const PREMBLY_APP_ID = process.env.PREMBLY_APP_ID;
const PREMBLY_BANK_URL = 'https://api.prembly.com/verification/bank_account/bank_code';

// Log configuration status (but not the actual key)
console.log('🔐 Prembly config:');
console.log(`  → API Key: ${PREMBLY_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`  → App ID: ${PREMBLY_APP_ID ? '✅ Set' : '❌ Missing'}`);
console.log(`  → URL: ${PREMBLY_BANK_URL}`);

// Helper function to call Prembly API with error handling
const fetchFromPrembly = async () => {
  if (!PREMBLY_API_KEY || !PREMBLY_APP_ID) {
    throw new Error('Prembly API credentials (API Key and App ID) are not configured.');
  }

  try {
    const response = await axios.get(PREMBLY_BANK_URL, {
      headers: {
        'x-api-key': PREMBLY_API_KEY,
        'app-id': PREMBLY_APP_ID
      },
      timeout: 60000 // 60 seconds
    });

    return response.data;
  } catch (error) {
    // Enhance error with details for logging
    if (error.response) {
      // The request was made and the server responded with a status code outside 2xx
      throw new Error(`Prembly API error: ${error.response.status} - ${error.response.data?.message || error.message}`);
    } else if (error.request) {
      // The request was made but no response was received
      throw new Error(`Prembly API no response: ${error.message} (${error.code || 'unknown'})`);
    } else {
      // Something happened in setting up the request
      throw new Error(`Prembly API request error: ${error.message}`);
    }
  }
};

// @desc    Get all banks (paginated, with search & filters)
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

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    const order = [[sortBy, sortOrder.toUpperCase()]];

    const { count, rows: banks } = await Bank.findAndCountAll({
      where,
      order,
      limit: limitNum,
      offset,
      raw: true
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

// @desc    Get single bank by ID
// @route   GET /api/banks/:id
// @access  Public
export const getBank = async (req, res) => {
  try {
    const { id } = req.params;

    let bank = await Bank.findByPk(id);
    
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

// @desc    Create new bank (manual)
// @route   POST /api/banks
// @access  Private/Admin
export const createBank = async (req, res) => {
  try {
    const { name, code, long_code, country, currency, gateway, type } = req.body;

    const existingBank = await Bank.findOne({
      where: {
        [Op.or]: [
          { code: code?.toUpperCase() },
          { long_code: long_code?.toUpperCase() },
          { name: { [Op.eq]: name?.trim() } }
        ]
      }
    });

    if (existingBank) {
      return res.status(400).json({
        success: false,
        message: 'Bank with same code, long code or name already exists'
      });
    }

    const lastBank = await Bank.findOne({ order: [['id', 'DESC']] });
    const nextId = lastBank ? lastBank.id + 1 : 1;

    const bank = await Bank.create({
      id: nextId,
      name: name?.trim(),
      code: code?.toUpperCase().trim(),
      long_code: long_code?.toUpperCase().trim(),
      country: country?.toUpperCase() || 'NG',
      currency: currency?.toUpperCase() || 'NGN',
      status: 'ACTIVE',
      type: type || 'nuban',
      gateway: gateway || null,
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

    delete updateData.id;
    
    let bank = await Bank.findByPk(id);
    
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

    const actualId = bank.id;

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

    if (updateData.code) updateData.code = updateData.code.toUpperCase().trim();
    if (updateData.long_code) updateData.long_code = updateData.long_code.toUpperCase().trim();
    if (updateData.name) updateData.name = updateData.name.trim();
    if (updateData.country) updateData.country = updateData.country.toUpperCase();
    if (updateData.currency) updateData.currency = updateData.currency.toUpperCase();

    updateData.updated_at = new Date();

    await Bank.update(updateData, {
      where: { id: actualId }
    });

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

    let bank = await Bank.findByPk(id);
    
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

    const actualId = bank.id;

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

// @desc    Get active banks (for dropdowns)
// @route   GET /api/banks/active/list
// @access  Public
export const getActiveBanks = async (req, res) => {
  try {
    const banks = await Bank.findAll({
      where: { status: 'ACTIVE' },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'code', 'long_code', 'type', 'currency'],
      raw: true
    });

    res.status(200).json({
      success: true,
      data: banks,
      count: banks.length
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
      attributes: ['id', 'name', 'code', 'long_code', 'currency', 'type'],
      raw: true
    });

    res.status(200).json({
      success: true,
      data: banks,
      count: banks.length
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

// @desc    Get bank by name
// @route   GET /api/banks/name/:name
// @access  Public
export const getBankByName = async (req, res) => {
  try {
    const { name } = req.params;
    const bank = await Bank.findOne({
      where: { 
        name: { [Op.like]: `%${name}%` },
        status: 'ACTIVE'
      }
    });
    if (!bank) {
      return res.status(404).json({ success: false, message: 'Bank not found' });
    }
    res.status(200).json({ success: true, data: bank });
  } catch (error) {
    logger.error('Get bank by name error:', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Validate bank code
// @route   POST /api/banks/validate
// @access  Public
export const validateBankCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Bank code is required'
      });
    }

    const bank = await Bank.findOne({
      where: { 
        code: code.toUpperCase(),
        status: 'ACTIVE'
      }
    });

    res.status(200).json({
      success: true,
      valid: !!bank,
      data: bank ? {
        id: bank.id,
        name: bank.name,
        code: bank.code,
        currency: bank.currency
      } : null
    });

  } catch (error) {
    logger.error('Validate bank code error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error while validating bank code',
      error: error.message
    });
  }
};

// ============================================================
//  PREMBLY INTEGRATION — Fetch & Sync Banks
// ============================================================

/**
 * Fetch banks directly from Prembly API (read‑only, no DB storage)
 * GET /api/banks/fetch-from-prembly
 */
export const fetchBanksFromPrembly = async (req, res) => {
  try {
    const premblyData = await fetchFromPrembly();

    if (premblyData?.status === true && Array.isArray(premblyData.data)) {
      logger.info(`✅ Fetched ${premblyData.data.length} banks from Prembly`);
      
      return res.status(200).json({
        success: true,
        message: 'Banks fetched successfully from Prembly',
        data: premblyData.data,
        count: premblyData.data.length,
        is_sandbox: premblyData.is_sandbox || false,
        meta: premblyData.meta || {},
        billing_info: premblyData.billing_info || null,
        verification: premblyData.verification || null,
        reference_id: premblyData.reference_id || null
      });
    }

    throw new Error(premblyData?.message || 'Failed to fetch banks');

  } catch (error) {
    logger.error('Fetch banks from Prembly error:', { error: error.message });
    
    let errorMessage = 'Failed to fetch banks from Prembly';
    if (error.message.includes('not configured')) {
      errorMessage = 'Prembly API credentials are not configured in environment variables.';
    } else if (error.message.includes('401')) {
      errorMessage = 'Authentication failed. Please check your Prembly API key and App ID.';
    } else if (error.message.includes('429')) {
      errorMessage = 'Rate limit exceeded. Please try again later.';
    } else if (error.message.includes('no response') || error.message.includes('socket hang up')) {
      errorMessage = 'Could not connect to Prembly API. Please check your network and firewall settings.';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message,
      details: error.response?.data
    });
  }
};

/**
 * Sync banks from Prembly to local database (upsert)
 * POST /api/banks/sync-from-prembly
 */
export const syncBanksFromPrembly = async (req, res) => {
  try {
    const premblyData = await fetchFromPrembly();

    if (premblyData?.status !== true || !Array.isArray(premblyData.data)) {
      throw new Error(premblyData?.message || 'Failed to fetch banks');
    }

    const premblyBanks = premblyData.data;
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const premblyBank of premblyBanks) {
      try {
        // Check if bank already exists by code or prembly_id
        const existingBank = await Bank.findOne({
          where: {
            [Op.or]: [
              { code: premblyBank.code },
              { prembly_id: premblyBank.id }
            ]
          }
        });

        const bankData = {
          name: premblyBank.name,
          code: premblyBank.code,
          long_code: premblyBank.longcode || premblyBank.code,
          country: premblyBank.country || 'NG',
          currency: premblyBank.currency || 'NGN',
          status: premblyBank.active ? 'ACTIVE' : 'INACTIVE',
          slug: premblyBank.slug,
          type: premblyBank.type || 'nuban',
          gateway: premblyBank.gateway || null,
          pay_with_bank: premblyBank.pay_with_bank || false,
          supports_transfer: premblyBank.supports_transfer !== undefined ? premblyBank.supports_transfer : true,
          available_for_direct_debit: premblyBank.available_for_direct_debit || false,
          prembly_id: premblyBank.id,
          updated_at: new Date()
        };

        if (existingBank) {
          await Bank.update(bankData, { where: { id: existingBank.id } });
          updated++;
          if (process.env.NODE_ENV !== 'production') {
            logger.debug(`🔄 Updated bank: ${premblyBank.name} (${premblyBank.code})`);
          }
        } else {
          const lastBank = await Bank.findOne({ order: [['id', 'DESC']] });
          const nextId = lastBank ? lastBank.id + 1 : 1;
          
          await Bank.create({
            id: nextId,
            ...bankData,
            created_at: new Date()
          });
          created++;
          logger.info(`✅ Created bank: ${premblyBank.name} (${premblyBank.code})`);
        }
      } catch (bankError) {
        logger.error(`❌ Error syncing bank ${premblyBank.name}:`, bankError.message);
        skipped++;
      }
    }

    logger.info(`✅ Sync complete: ${created} created, ${updated} updated, ${skipped} skipped`);

    res.status(200).json({
      success: true,
      message: 'Banks synced successfully from Prembly',
      data: {
        created,
        updated,
        skipped,
        total: premblyBanks.length,
        is_sandbox: premblyData.is_sandbox || false
      }
    });

  } catch (error) {
    logger.error('Sync banks from Prembly error:', { error: error.message });
    
    let errorMessage = 'Failed to sync banks from Prembly';
    if (error.message.includes('not configured')) {
      errorMessage = 'Prembly API credentials are not configured in environment variables.';
    } else if (error.message.includes('401')) {
      errorMessage = 'Authentication failed. Please check your Prembly API key and App ID.';
    } else if (error.message.includes('429')) {
      errorMessage = 'Rate limit exceeded. Please try again later.';
    } else if (error.message.includes('no response') || error.message.includes('socket hang up')) {
      errorMessage = 'Could not connect to Prembly API. Please check your network and firewall settings.';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
  }
};

/**
 * Get bank sync status (counts, last update, etc.)
 * GET /api/banks/sync-status
 */
export const getBankSyncStatus = async (req, res) => {
  try {
    const totalBanks = await Bank.count();
    const activeBanks = await Bank.count({ where: { status: 'ACTIVE' } });
    const lastBank = await Bank.findOne({ order: [['updated_at', 'DESC']] });
    
    const banksByCountry = await Bank.findAll({
      attributes: ['country', [Bank.sequelize.fn('COUNT', Bank.sequelize.col('country')), 'count']],
      group: ['country'],
      raw: true
    });

    res.status(200).json({
      success: true,
      data: {
        total_banks: totalBanks,
        active_banks: activeBanks,
        inactive_banks: totalBanks - activeBanks,
        last_updated: lastBank?.updated_at || null,
        banks_by_country: banksByCountry,
        prembly_configured: !!PREMBLY_API_KEY && !!PREMBLY_APP_ID
      }
    });

  } catch (error) {
    logger.error('Get bank sync status error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error while fetching bank sync status',
      error: error.message
    });
  }
};