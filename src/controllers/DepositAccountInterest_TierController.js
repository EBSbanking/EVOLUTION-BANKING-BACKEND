import sequelize from '../../config/db.js';
import DepositAccountInterest_Tier from '../models/DepositAccountInterest_Tier.js';
import DepositAccountInterestAudit from '../models/Deposit_Account_INTEREST$AUD.js';
import CustomerAccount from '../models/CustomerAccount.js';
import SavingsProduct from '../models/SavingsProduct.js';
import moment from 'moment';
import { Op } from 'sequelize';

// Helper function to generate the next DEPOSIT_ACCT_INT_TIER_ID for a specific product
const generateNextTierIdForProduct = async (PROD_ID, transaction = null) => {
  try {
    const highestTier = await DepositAccountInterest_Tier.findOne({
      where: { PROD_ID },
      order: [['DEPOSIT_ACCT_INT_TIER_ID', 'DESC']],
      attributes: ['DEPOSIT_ACCT_INT_TIER_ID'],
      transaction
    });

    if (highestTier && highestTier.DEPOSIT_ACCT_INT_TIER_ID) {
      return highestTier.DEPOSIT_ACCT_INT_TIER_ID + 1;
    }

    return 1;
  } catch (error) {
    console.error('Error generating next tier ID for product:', error);
    return Date.now();
  }
};

// Create tier for a product
export const createTier = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      PROD_ID,
      MARGIN_RATE,
      FROM_AMT,
      TO_AMT,
      REC_ST,
      VERSION_NO,
      USER_ID,
      CREATE_DT,
      CREATED_BY,
      SYS_CREATE_TS,
      MARGIN_TY_CD,
      PENAL_MARGIN_RATE,
      PENAL_MARGIN_TY_CD
    } = req.body;

    // Validate required fields
    if (!PROD_ID || !MARGIN_RATE || !TO_AMT || !REC_ST || !VERSION_NO || !USER_ID || !CREATE_DT || !CREATED_BY || !SYS_CREATE_TS || !MARGIN_TY_CD) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields for creating interest tier'
      });
    }

    // Verify the product exists
    const product = await SavingsProduct.findOne({
      where: { PROD_ID },
      transaction
    });
    
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Savings product with PROD_ID ${PROD_ID} not found`
      });
    }

    // Generate the next DEPOSIT_ACCT_INT_TIER_ID automatically for this product
    const DEPOSIT_ACCT_INT_TIER_ID = await generateNextTierIdForProduct(PROD_ID, transaction);

    // Create a new DepositAccountInterest_Tier document
    const newInterestTier = await DepositAccountInterest_Tier.create({
      DEPOSIT_ACCT_INT_TIER_ID,
      DEPOSIT_ACCT_INT_ID: PROD_ID, // Same as PROD_ID
      PROD_ID,
      MARGIN_RATE: parseFloat(MARGIN_RATE.toString()),
      FROM_AMT: FROM_AMT ? parseFloat(FROM_AMT.toString()) : null,
      TO_AMT: parseFloat(TO_AMT.toString()),
      REC_ST,
      VERSION_NO,
      ROW_TS: new Date(),
      USER_ID,
      CREATE_DT: moment(CREATE_DT).toDate(),
      CREATED_BY,
      SYS_CREATE_TS: moment(SYS_CREATE_TS).toDate(),
      MARGIN_TY_CD,
      PENAL_MARGIN_RATE: PENAL_MARGIN_RATE ? parseFloat(PENAL_MARGIN_RATE.toString()) : null,
      PENAL_MARGIN_TY_CD,
      created_at: new Date(),
      updated_at: new Date()
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Interest tier created successfully',
      data: newInterestTier
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

// Calculate tiered interest for a specific account
export const calculateTieredInterestForAccount = async (customerAccount, transaction = null) => {
  try {
    const tiers = await DepositAccountInterest_Tier.findAll({
      where: {
        DEPOSIT_ACCT_INT_ID: customerAccount.PROD_ID || customerAccount.productCode,
        REC_ST: 'A'
      },
      transaction
    });

    let applicableRate = 0;
    const principalAmount = parseFloat(customerAccount.LEDGER_BAL || 0);

    // Find the applicable tier based on balance range
    for (const tier of tiers) {
      const fromAmt = tier.FROM_AMT ? parseFloat(tier.FROM_AMT) : 0;
      const toAmt = parseFloat(tier.TO_AMT);

      if (principalAmount >= fromAmt && principalAmount <= toAmt) {
        applicableRate = parseFloat(tier.MARGIN_RATE);
        break;
      }
    }

    if (applicableRate === 0) {
      throw new Error('No applicable interest rate found for this account balance.');
    }

    return applicableRate;
  } catch (error) {
    console.error('Error calculating tiered interest:', error);
    throw error;
  }
};

// Calculate and apply tiered interest for all accounts
export const calculateAndApplyTieredInterest = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const customerAccounts = await CustomerAccount.findAll({
      where: {
        REC_ST: 'ACTIVE',
        ACCOUNT_TYPE: { [Op.in]: ['SAVINGS', 'TERM_DEPOSIT'] } // Only savings accounts
      },
      transaction
    });

    if (!customerAccounts || customerAccounts.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No active savings customer accounts found'
      });
    }

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (let customerAccount of customerAccounts) {
      try {
        const principalAmount = customerAccount.LEDGER_BAL;
        if (!principalAmount || parseFloat(principalAmount) <= 0) {
          skippedCount++;
          continue;
        }

        // Calculate applicable tiered rate
        const applicableRate = await calculateTieredInterestForAccount(customerAccount, transaction);

        // Calculate daily interest (simplified - you might want more complex logic)
        const principalAmountNum = parseFloat(principalAmount);
        const dailyRate = applicableRate / 100 / 365;
        const interestEarned = principalAmountNum * dailyRate;

        // Update account balances
        await customerAccount.update({
          LEDGER_BAL: principalAmountNum + interestEarned,
          ACCRUED_INTEREST: (parseFloat(customerAccount.ACCRUED_INTEREST || 0) + interestEarned),
          LAST_INTEREST_DATE: new Date(),
          updated_at: new Date()
        }, { transaction });
        
        processedCount++;

      } catch (accountError) {
        console.error(`Error processing account ${customerAccount.ACCT_ID}:`, accountError.message);
        errorCount++;
      }
    }

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: 'Tiered interest calculated and applied to accounts',
      summary: {
        totalAccounts: customerAccounts.length,
        processed: processedCount,
        skipped: skippedCount,
        errors: errorCount
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error calculating tiered interest:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating tiered interest',
      error: error.message
    });
  }
};

// Get all deposit account interest tiers
export const getAllTiers = async (req, res) => {
  try {
    const tiers = await DepositAccountInterest_Tier.findAll({
      order: [['DEPOSIT_ACCT_INT_TIER_ID', 'ASC']]
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

// Get a deposit account interest tier by ID
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

// Get a deposit account interest tier by DEPOSIT_ACCT_INT_TIER_ID
export const getTierByTierId = async (req, res) => {
  try {
    const tier = await DepositAccountInterest_Tier.findOne({
      where: {
        DEPOSIT_ACCT_INT_TIER_ID: parseInt(req.params.tierId)
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

// Delete a deposit account interest tier by ID
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

// Update tier
export const updateTier = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      PROD_ID,
      MARGIN_RATE,
      FROM_AMT,
      TO_AMT,
      REC_ST,
      VERSION_NO,
      USER_ID,
      CREATE_DT,
      CREATED_BY,
      SYS_CREATE_TS,
      MARGIN_TY_CD,
      PENAL_MARGIN_RATE,
      PENAL_MARGIN_TY_CD
    } = req.body;

    // Validate input
    if (!PROD_ID || !MARGIN_RATE || !TO_AMT || !REC_ST || !VERSION_NO || !USER_ID || !CREATE_DT || !CREATED_BY || !SYS_CREATE_TS || !MARGIN_TY_CD) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields for updating interest tier'
      });
    }

    // Ensure MARGIN_RATE, TO_AMT, FROM_AMT, PENAL_MARGIN_RATE are valid numbers
    if (isNaN(MARGIN_RATE) || isNaN(TO_AMT) || (FROM_AMT && isNaN(FROM_AMT)) || (PENAL_MARGIN_RATE && isNaN(PENAL_MARGIN_RATE))) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'MARGIN_RATE, TO_AMT, FROM_AMT, and PENAL_MARGIN_RATE must be valid numbers.'
      });
    }

    // Ensure REC_ST is a single character (max length of 1)
    if (REC_ST.length !== 1) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'REC_ST must be a single character.'
      });
    }

    // Parse the route param as the PROD_ID (Number)
    const prodId = parseInt(req.params.id, 10);
    if (isNaN(prodId)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid PROD_ID provided in URL'
      });
    }

    // Find the existing DepositAccountInterest_Tier by PROD_ID
    let interestTier = await DepositAccountInterest_Tier.findOne({
      where: { PROD_ID: prodId },
      transaction
    });

    if (!interestTier) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Interest tier not found'
      });
    }

    // Update the interest tier fields
    await interestTier.update({
      PROD_ID,
      MARGIN_RATE: parseFloat(MARGIN_RATE.toString()),
      FROM_AMT: FROM_AMT ? parseFloat(FROM_AMT.toString()) : null,
      TO_AMT: parseFloat(TO_AMT.toString()),
      REC_ST,
      VERSION_NO,
      USER_ID,
      CREATE_DT: moment(CREATE_DT).toDate(),
      CREATED_BY,
      SYS_CREATE_TS: moment(SYS_CREATE_TS).toDate(),
      MARGIN_TY_CD,
      PENAL_MARGIN_RATE: PENAL_MARGIN_RATE ? parseFloat(PENAL_MARGIN_RATE.toString()) : null,
      PENAL_MARGIN_TY_CD,
      updated_at: new Date()
    }, { transaction });

    await transaction.commit();

    // Get updated tier
    const updatedTier = await DepositAccountInterest_Tier.findByPk(interestTier.id);

    // Respond with success message
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

// Get tiers by product ID
export const getTiersByProductId = async (req, res) => {
  try {
    const { productId } = req.params;
    const tiers = await DepositAccountInterest_Tier.findAll({
      where: { PROD_ID: productId }
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

// Get applicable tier for an account balance
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

    const principalAmount = parseFloat(account.LEDGER_BAL || 0);
    
    // Get tiers for the account's product
    const tiers = await DepositAccountInterest_Tier.findAll({
      where: {
        DEPOSIT_ACCT_INT_ID: account.PROD_ID || account.productCode,
        REC_ST: 'A'
      },
      order: [
        ['FROM_AMT', 'ASC'],
        ['TO_AMT', 'ASC']
      ]
    });

    let applicableTier = null;
    
    // Find the applicable tier based on balance range
    for (const tier of tiers) {
      const fromAmt = tier.FROM_AMT ? parseFloat(tier.FROM_AMT) : 0;
      const toAmt = parseFloat(tier.TO_AMT);

      if (principalAmount >= fromAmt && principalAmount <= toAmt) {
        applicableTier = tier;
        break;
      }
    }

    if (!applicableTier) {
      return res.status(404).json({
        success: false,
        message: 'No applicable interest rate found for this account balance.',
        accountBalance: principalAmount,
        availableTiers: tiers.length
      });
    }

    res.status(200).json({
      success: true,
      data: {
        applicableTier,
        accountBalance: principalAmount,
        interestRate: parseFloat(applicableTier.MARGIN_RATE)
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

// Bulk create tiers for a product
export const bulkCreateTiers = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { PROD_ID, tiers } = req.body;

    if (!PROD_ID || !Array.isArray(tiers) || tiers.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'PROD_ID and tiers array are required'
      });
    }

    // Verify the product exists
    const product = await SavingsProduct.findOne({
      where: { PROD_ID },
      transaction
    });

    if (!product) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Savings product with PROD_ID ${PROD_ID} not found`
      });
    }

    const createdTiers = [];
    let nextTierId = await generateNextTierIdForProduct(PROD_ID, transaction);

    for (const tierData of tiers) {
      const {
        MARGIN_RATE,
        FROM_AMT,
        TO_AMT,
        REC_ST = 'A',
        VERSION_NO = 1,
        USER_ID = 'system',
        CREATE_DT = new Date(),
        CREATED_BY = 'system',
        SYS_CREATE_TS = new Date(),
        MARGIN_TY_CD = 'FIXED',
        PENAL_MARGIN_RATE,
        PENAL_MARGIN_TY_CD
      } = tierData;

      // Validate required fields for each tier
      if (!MARGIN_RATE || !TO_AMT) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Each tier must have MARGIN_RATE and TO_AMT'
        });
      }

      const newTier = await DepositAccountInterest_Tier.create({
        DEPOSIT_ACCT_INT_TIER_ID: nextTierId,
        DEPOSIT_ACCT_INT_ID: PROD_ID,
        PROD_ID,
        MARGIN_RATE: parseFloat(MARGIN_RATE.toString()),
        FROM_AMT: FROM_AMT ? parseFloat(FROM_AMT.toString()) : null,
        TO_AMT: parseFloat(TO_AMT.toString()),
        REC_ST,
        VERSION_NO,
        ROW_TS: new Date(),
        USER_ID,
        CREATE_DT: moment(CREATE_DT).toDate(),
        CREATED_BY,
        SYS_CREATE_TS: moment(SYS_CREATE_TS).toDate(),
        MARGIN_TY_CD,
        PENAL_MARGIN_RATE: PENAL_MARGIN_RATE ? parseFloat(PENAL_MARGIN_RATE.toString()) : null,
        PENAL_MARGIN_TY_CD,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      createdTiers.push(newTier);
      nextTierId++;
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

// Search tiers with pagination
export const searchTiers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      PROD_ID, 
      REC_ST, 
      MARGIN_TY_CD,
      minRate,
      maxRate 
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    if (PROD_ID) where.PROD_ID = PROD_ID;
    if (REC_ST) where.REC_ST = REC_ST;
    if (MARGIN_TY_CD) where.MARGIN_TY_CD = MARGIN_TY_CD;

    if (minRate || maxRate) {
      where.MARGIN_RATE = {};
      if (minRate) where.MARGIN_RATE[Op.gte] = parseFloat(minRate);
      if (maxRate) where.MARGIN_RATE[Op.lte] = parseFloat(maxRate);
    }

    const { count, rows: tiers } = await DepositAccountInterest_Tier.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: offset,
      order: [['DEPOSIT_ACCT_INT_TIER_ID', 'ASC']]
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

// Get tier statistics
export const getTierStatistics = async (req, res) => {
  try {
    const stats = await DepositAccountInterest_Tier.findAll({
      attributes: [
        'PROD_ID',
        [sequelize.fn('COUNT', sequelize.col('id')), 'tierCount'],
        [sequelize.fn('MIN', sequelize.col('MARGIN_RATE')), 'minRate'],
        [sequelize.fn('MAX', sequelize.col('MARGIN_RATE')), 'maxRate'],
        [sequelize.fn('AVG', sequelize.col('MARGIN_RATE')), 'avgRate']
      ],
      group: ['PROD_ID'],
      order: [['PROD_ID', 'ASC']]
    });

    const totalStats = await DepositAccountInterest_Tier.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalTiers'],
        [sequelize.literal("COUNT(CASE WHEN REC_ST = 'A' THEN 1 END)"), 'activeTiers'],
        [sequelize.literal("COUNT(CASE WHEN REC_ST = 'I' THEN 1 END)"), 'inactiveTiers']
      ]
    });

    res.status(200).json({
      success: true,
      data: {
        byProduct: stats,
        summary: totalStats[0]
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