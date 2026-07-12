// controllers/DepositAccountInterest_TierController.js
import sequelize from '../../config/db.js';
import DepositAccountInterest_Tier from '../models/DepositAccountInterest_Tier.js';
import CustomerAccount from '../models/CustomerAccount.js';
import SavingsProduct from '../models/SavingsProduct.js';
import moment from 'moment';
import { Op } from 'sequelize';

// Helper function to get next tier ID for a product
const getNextTierIdForProduct = async (productType, transaction = null) => {
  try {
    const highestTier = await DepositAccountInterest_Tier.findOne({
      where: { product_type: productType },
      order: [['id', 'DESC']],
      attributes: ['id'],
      transaction
    });

    return highestTier ? highestTier.id + 1 : 1;
  } catch (error) {
    console.error('Error generating next tier ID:', error);
    return Date.now();
  }
};

// ============================================================
// CREATE TIER
// ============================================================
export const createTier = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      tier_name,
      min_balance,
      max_balance,
      interest_rate,
      product_type,
      currency,
      is_active,
      created_by
    } = req.body;

    // Validate required fields
    if (!tier_name || !interest_rate || !product_type) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: tier_name, interest_rate, product_type'
      });
    }

    // Verify the product exists
    const product = await SavingsProduct.findOne({
      where: { PRODUCT_TYPE: product_type.toUpperCase() },
      transaction
    });
    
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Savings product with PRODUCT_TYPE ${product_type} not found`
      });
    }

    // Validate min/max balance
    const minBal = parseFloat(min_balance) || 0;
    const maxBal = max_balance ? parseFloat(max_balance) : null;
    
    if (maxBal !== null && minBal > maxBal) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'min_balance cannot be greater than max_balance'
      });
    }

    // Create new tier
    const newTier = await DepositAccountInterest_Tier.create({
      tier_name,
      min_balance: minBal,
      max_balance: maxBal,
      interest_rate: parseFloat(interest_rate),
      product_type: product_type.toUpperCase(),
      currency: currency || 'NGN',
      is_active: is_active !== undefined ? is_active : true,
      created_by: created_by || req.user?.id || 'system',
      created_at: new Date(),
      updated_at: new Date()
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Interest tier created successfully',
      data: newTier
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error creating interest tier:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating interest tier',
      error: error.message
    });
  }
};

// ============================================================
// GET ALL TIERS
// ============================================================
export const getAllTiers = async (req, res) => {
  try {
    const { product_type, is_active } = req.query;
    const where = {};

    if (product_type) where.product_type = product_type.toUpperCase();
    if (is_active !== undefined) where.is_active = is_active === 'true';

    const tiers = await DepositAccountInterest_Tier.findAll({
      where,
      order: [['product_type', 'ASC'], ['min_balance', 'ASC']]
    });
    
    res.status(200).json({
      success: true,
      count: tiers.length,
      data: tiers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================================
// GET TIER BY ID
// ============================================================
export const getTierById = async (req, res) => {
  try {
    const tier = await DepositAccountInterest_Tier.findByPk(req.params.id);
    
    if (!tier) {
      return res.status(404).json({
        success: false,
        message: 'Tier not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: tier
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================================
// GET TIERS BY PRODUCT TYPE
// ============================================================
export const getTiersByProductType = async (req, res) => {
  try {
    const { productType } = req.params;
    const tiers = await DepositAccountInterest_Tier.findAll({
      where: { 
        product_type: productType.toUpperCase(),
        is_active: true
      },
      order: [['min_balance', 'ASC']]
    });

    res.status(200).json({
      success: true,
      count: tiers.length,
      data: tiers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================================
// UPDATE TIER
// ============================================================
export const updateTier = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tierId = req.params.id;
    const {
      tier_name,
      min_balance,
      max_balance,
      interest_rate,
      product_type,
      currency,
      is_active,
      updated_by
    } = req.body;

    // Find existing tier
    const tier = await DepositAccountInterest_Tier.findByPk(tierId, { transaction });
    
    if (!tier) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Tier not found'
      });
    }

    // Validate min/max balance if provided
    const minBal = min_balance !== undefined ? parseFloat(min_balance) : parseFloat(tier.min_balance);
    const maxBal = max_balance !== undefined ? (max_balance ? parseFloat(max_balance) : null) : (tier.max_balance ? parseFloat(tier.max_balance) : null);
    
    if (maxBal !== null && minBal > maxBal) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'min_balance cannot be greater than max_balance'
      });
    }

    // Update tier
    await tier.update({
      tier_name: tier_name || tier.tier_name,
      min_balance: minBal,
      max_balance: maxBal,
      interest_rate: interest_rate !== undefined ? parseFloat(interest_rate) : tier.interest_rate,
      product_type: product_type ? product_type.toUpperCase() : tier.product_type,
      currency: currency || tier.currency,
      is_active: is_active !== undefined ? is_active : tier.is_active,
      updated_by: updated_by || req.user?.id || 'system',
      updated_at: new Date()
    }, { transaction });

    await transaction.commit();

    // Get updated tier
    const updatedTier = await DepositAccountInterest_Tier.findByPk(tierId);

    res.status(200).json({
      success: true,
      message: 'Interest tier updated successfully',
      data: updatedTier
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error updating interest tier:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating interest tier',
      error: error.message
    });
  }
};

// ============================================================
// DELETE TIER
// ============================================================
export const deleteTier = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tier = await DepositAccountInterest_Tier.findByPk(req.params.id, { transaction });
    
    if (!tier) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Tier not found'
      });
    }

    await tier.destroy({ transaction });
    await transaction.commit();

    res.status(200).json({
      success: true,
      message: 'Tier deleted successfully'
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================================
// BULK CREATE TIERS
// ============================================================
export const bulkCreateTiers = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { product_type, tiers } = req.body;

    if (!product_type || !Array.isArray(tiers) || tiers.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'product_type and tiers array are required'
      });
    }

    // Verify the product exists
    const product = await SavingsProduct.findOne({
      where: { PRODUCT_TYPE: product_type.toUpperCase() },
      transaction
    });

    if (!product) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Savings product with PRODUCT_TYPE ${product_type} not found`
      });
    }

    const createdTiers = [];

    for (const tierData of tiers) {
      const {
        tier_name,
        min_balance = 0,
        max_balance,
        interest_rate,
        currency = 'NGN',
        is_active = true,
        created_by = 'system'
      } = tierData;

      if (!tier_name || !interest_rate) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Each tier must have tier_name and interest_rate'
        });
      }

      // Validate min/max balance
      const minBal = parseFloat(min_balance) || 0;
      const maxBal = max_balance ? parseFloat(max_balance) : null;
      
      if (maxBal !== null && minBal > maxBal) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `min_balance cannot be greater than max_balance for tier: ${tier_name}`
        });
      }

      const newTier = await DepositAccountInterest_Tier.create({
        tier_name,
        min_balance: minBal,
        max_balance: maxBal,
        interest_rate: parseFloat(interest_rate),
        product_type: product_type.toUpperCase(),
        currency: currency || 'NGN',
        is_active: is_active !== undefined ? is_active : true,
        created_by: created_by || 'system',
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      createdTiers.push(newTier);
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: `${createdTiers.length} tiers created successfully`,
      data: createdTiers
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error bulk creating tiers:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk creating tiers',
      error: error.message
    });
  }
};

// ============================================================
// GET APPLICABLE TIER FOR ACCOUNT
// ============================================================
export const getApplicableTierForAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    
    // Get account details
    const account = await CustomerAccount.findByPk(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    const balance = parseFloat(account.LEDGER_BAL || account.available_balance || 0);
    const productType = account.PRODUCT_TYPE || account.product_type || account.productCode;
    
    if (!productType) {
      return res.status(400).json({
        success: false,
        message: 'Account does not have a product type associated'
      });
    }

    // Find applicable tier
    const tier = await DepositAccountInterest_Tier.findApplicableTier(productType, balance);

    if (!tier) {
      return res.status(404).json({
        success: false,
        message: 'No applicable interest tier found for this account balance.',
        accountBalance: balance,
        productType
      });
    }

    res.status(200).json({
      success: true,
      data: {
        tier: tier.getTierInfo(),
        accountBalance: balance,
        interestRate: parseFloat(tier.interest_rate),
        productType
      }
    });
  } catch (error) {
    console.error('Error getting applicable tier:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================================
// GET TIER SUMMARY
// ============================================================
export const getTierSummary = async (req, res) => {
  try {
    const { productType } = req.params;
    
    if (!productType) {
      return res.status(400).json({
        success: false,
        message: 'productType is required'
      });
    }

    const summary = await DepositAccountInterest_Tier.getTierSummary(productType.toUpperCase());

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting tier summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================================
// SEARCH TIERS
// ============================================================
export const searchTiers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      product_type, 
      is_active,
      min_rate,
      max_rate,
      search 
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    if (product_type) where.product_type = product_type.toUpperCase();
    if (is_active !== undefined) where.is_active = is_active === 'true';
    if (min_rate || max_rate) {
      where.interest_rate = {};
      if (min_rate) where.interest_rate[Op.gte] = parseFloat(min_rate);
      if (max_rate) where.interest_rate[Op.lte] = parseFloat(max_rate);
    }
    if (search) {
      where[Op.or] = [
        { tier_name: { [Op.like]: `%${search}%` } },
        { product_type: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows: tiers } = await DepositAccountInterest_Tier.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: offset,
      order: [['product_type', 'ASC'], ['min_balance', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: tiers,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================================
// GET TIER STATISTICS
// ============================================================
export const getTierStatistics = async (req, res) => {
  try {
    const stats = await DepositAccountInterest_Tier.findAll({
      attributes: [
        'product_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'tierCount'],
        [sequelize.fn('MIN', sequelize.col('interest_rate')), 'minRate'],
        [sequelize.fn('MAX', sequelize.col('interest_rate')), 'maxRate'],
        [sequelize.fn('AVG', sequelize.col('interest_rate')), 'avgRate']
      ],
      group: ['product_type'],
      order: [['product_type', 'ASC']]
    });

    const totalStats = await DepositAccountInterest_Tier.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalTiers'],
        [sequelize.literal("COUNT(CASE WHEN is_active = 1 THEN 1 END)"), 'activeTiers'],
        [sequelize.literal("COUNT(CASE WHEN is_active = 0 THEN 1 END)"), 'inactiveTiers']
      ]
    });

    res.status(200).json({
      success: true,
      data: {
        byProduct: stats,
        summary: totalStats[0] || { totalTiers: 0, activeTiers: 0, inactiveTiers: 0 }
      }
    });
  } catch (error) {
    console.error('Error getting tier statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================================
// CALCULATE TIERED INTEREST FOR ACCOUNT (Internal function)
// ============================================================
export const calculateTieredInterestForAccount = async (customerAccount, transaction = null) => {
  try {
    const productType = customerAccount.PRODUCT_TYPE || customerAccount.product_type || customerAccount.productCode;
    
    if (!productType) {
      throw new Error('Account does not have a product type');
    }

    const balance = parseFloat(customerAccount.LEDGER_BAL || customerAccount.available_balance || 0);
    
    const tier = await DepositAccountInterest_Tier.findApplicableTier(productType, balance, transaction);
    
    if (!tier) {
      throw new Error('No applicable interest tier found for this account balance');
    }

    return parseFloat(tier.interest_rate);
  } catch (error) {
    console.error('Error calculating tiered interest:', error);
    throw error;
  }
};

// ============================================================
// CALCULATE AND APPLY TIERED INTEREST (API Endpoint)
// ============================================================
export const calculateAndApplyTieredInterest = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const customerAccounts = await CustomerAccount.findAll({
      where: {
        REC_ST: 'ACTIVE',
        [Op.or]: [
          { ACCOUNT_TYPE: 'SAVINGS' },
          { ACCOUNT_TYPE: 'TERM_DEPOSIT' }
        ]
      },
      transaction
    });

    if (!customerAccounts || customerAccounts.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No active savings accounts found'
      });
    }

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const results = [];

    for (const account of customerAccounts) {
      try {
        const balance = parseFloat(account.LEDGER_BAL || account.available_balance || 0);
        
        if (balance <= 0) {
          skippedCount++;
          continue;
        }

        const productType = account.PRODUCT_TYPE || account.product_type || account.productCode;
        
        if (!productType) {
          skippedCount++;
          continue;
        }

        const tier = await DepositAccountInterest_Tier.findApplicableTier(productType, balance, transaction);
        
        if (!tier) {
          skippedCount++;
          continue;
        }

        const interestRate = parseFloat(tier.interest_rate);
        const dailyRate = interestRate / 100 / 365;
        const interestEarned = balance * dailyRate;

        // Update account balance
        const newBalance = balance + interestEarned;
        
        await account.update({
          LEDGER_BAL: newBalance,
          ACCRUED_INTEREST: (parseFloat(account.ACCRUED_INTEREST || 0) + interestEarned),
          LAST_INTEREST_DATE: new Date(),
          updated_at: new Date()
        }, { transaction });

        processedCount++;
        results.push({
          accountId: account.id,
          accountNumber: account.ACCT_NO || account.account_number,
          balance,
          interestRate,
          interestEarned,
          newBalance
        });

      } catch (accountError) {
        console.error(`Error processing account ${account.id}:`, accountError.message);
        errorCount++;
      }
    }

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: 'Tiered interest calculated and applied successfully',
      summary: {
        totalAccounts: customerAccounts.length,
        processed: processedCount,
        skipped: skippedCount,
        errors: errorCount
      },
      results: results.slice(0, 10) // Return first 10 results for preview
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error applying tiered interest:', error);
    res.status(500).json({
      success: false,
      message: 'Error applying tiered interest',
      error: error.message
    });
  }
};

// ============================================================
// APPLY TIERED INTEREST TO ALL ACCOUNTS (Alias)
// ============================================================
export const applyTieredInterestToAllAccounts = calculateAndApplyTieredInterest;

// ============================================================
// GET TIER BY TIER ID (by product type)
// ============================================================
export const getTierByTierId = async (req, res) => {
  try {
    const { tierId } = req.params;
    
    const tier = await DepositAccountInterest_Tier.findOne({
      where: { 
        id: tierId
      }
    });
    
    if (!tier) {
      return res.status(404).json({
        success: false,
        message: 'Tier not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: tier
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};