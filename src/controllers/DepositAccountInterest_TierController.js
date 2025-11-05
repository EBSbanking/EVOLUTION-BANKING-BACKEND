import mongoose from 'mongoose';
import DepositAccountInterest_Tier from '../models/DepositAccountInterest_Tier.js';
import DepositAccountInterestAudit from '../models/Deposit_Account_INTEREST$AUD.js';
import CustomerAccount from '../models/CustomerAccount.js';
import SavingsProduct from '../models/SavingsProduct.js';
import moment from 'moment';

// Helper function to generate the next DEPOSIT_ACCT_INT_TIER_ID for a specific product
const generateNextTierIdForProduct = async (PROD_ID) => {
  try {
    const highestTier = await DepositAccountInterest_Tier.findOne({ 
      PROD_ID: PROD_ID 
    })
    .sort({ DEPOSIT_ACCT_INT_TIER_ID: -1 })
    .select('DEPOSIT_ACCT_INT_TIER_ID');
    
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
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields for creating interest tier' 
      });
    }

    // Verify the product exists
    const product = await SavingsProduct.findOne({ PROD_ID: PROD_ID });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Savings product with PROD_ID ${PROD_ID} not found`
      });
    }

    // Generate the next DEPOSIT_ACCT_INT_TIER_ID automatically for this product
    const DEPOSIT_ACCT_INT_TIER_ID = await generateNextTierIdForProduct(PROD_ID);

    // Create a new DepositAccountInterest_Tier document
    const newInterestTier = new DepositAccountInterest_Tier({
      DEPOSIT_ACCT_INT_TIER_ID,
      DEPOSIT_ACCT_INT_ID: PROD_ID, // Same as PROD_ID
      PROD_ID, 
      MARGIN_RATE: mongoose.Types.Decimal128.fromString(MARGIN_RATE.toString()),
      FROM_AMT: FROM_AMT ? mongoose.Types.Decimal128.fromString(FROM_AMT.toString()) : undefined,
      TO_AMT: mongoose.Types.Decimal128.fromString(TO_AMT.toString()),
      REC_ST, 
      VERSION_NO, 
      ROW_TS: new Date(),
      USER_ID, 
      CREATE_DT: moment(CREATE_DT).toDate(),
      CREATED_BY, 
      SYS_CREATE_TS: moment(SYS_CREATE_TS).toDate(),
      MARGIN_TY_CD, 
      PENAL_MARGIN_RATE: PENAL_MARGIN_RATE ? mongoose.Types.Decimal128.fromString(PENAL_MARGIN_RATE.toString()) : undefined,
      PENAL_MARGIN_TY_CD
    });

    await newInterestTier.save();

    res.status(201).json({
      success: true,
      message: 'Interest tier created successfully',
      data: newInterestTier
    });
    
  } catch (error) {
    console.error('Error creating interest tier:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating interest tier',
      error: error.message
    });
  }
};

// Calculate tiered interest for a specific account
export const calculateTieredInterestForAccount = async (customerAccount) => {
  try {
    const tiers = await DepositAccountInterest_Tier.find({ 
      DEPOSIT_ACCT_INT_ID: customerAccount.PROD_ID,
      REC_ST: 'A'
    });

    let applicableRate = 0;
    const principalAmount = parseFloat(customerAccount.LEDGER_BAL.toString());

    // Find the applicable tier based on balance range
    for (const tier of tiers) {
      const fromAmt = tier.FROM_AMT ? parseFloat(tier.FROM_AMT.toString()) : 0;
      const toAmt = parseFloat(tier.TO_AMT.toString());
      
      if (principalAmount >= fromAmt && principalAmount <= toAmt) {
        applicableRate = parseFloat(tier.MARGIN_RATE.toString());
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
  try {
    const customerAccounts = await CustomerAccount.find({ 
      REC_ST: 'ACTIVE',
      ACCOUNT_TYPE: { $in: ['SAVINGS', 'TERM_DEPOSIT'] } // Only savings accounts
    });

    if (!customerAccounts || customerAccounts.length === 0) {
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
        if (!principalAmount || parseFloat(principalAmount.toString()) <= 0) {
          skippedCount++;
          continue;
        }

        // Calculate applicable tiered rate
        const applicableRate = await calculateTieredInterestForAccount(customerAccount);
        
        // Calculate daily interest (simplified - you might want more complex logic)
        const principalAmountNum = parseFloat(principalAmount.toString());
        const dailyRate = applicableRate / 100 / 365;
        const interestEarned = principalAmountNum * dailyRate;

        // Update account balances
        customerAccount.LEDGER_BAL = mongoose.Types.Decimal128.fromString((principalAmountNum + interestEarned).toString());
        customerAccount.ACCRUED_INTEREST = mongoose.Types.Decimal128.fromString(
          (parseFloat((customerAccount.ACCRUED_INTEREST || '0').toString()) + interestEarned).toString()
        );
        customerAccount.LAST_INTEREST_DATE = new Date();
        
        await customerAccount.save();
        processedCount++;

      } catch (accountError) {
        console.error(`Error processing account ${customerAccount.ACCT_ID}:`, accountError.message);
        errorCount++;
      }
    }

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
    console.error('Error calculating tiered interest:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error calculating tiered interest', 
      error: error.message 
    });
  }
};

// ... other methods (getAllTiers, getTierById, etc.) remain the same


// Get all deposit account interest tiers
export const getAllTiers = async (req, res) => {
  try {
    const tiers = await DepositAccountInterest_Tier.find().sort({ DEPOSIT_ACCT_INT_TIER_ID: 1 });
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

// Get a deposit account interest tier by MongoDB ID
export const getTierById = async (req, res) => {
  try {
    const tier = await DepositAccountInterest_Tier.findById(req.params.id);
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
      DEPOSIT_ACCT_INT_TIER_ID: parseInt(req.params.tierId) 
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

// Delete a deposit account interest tier by MongoDB ID
export const deleteTier = async (req, res) => {
  try {
    const deletedTier = await DepositAccountInterest_Tier.findByIdAndDelete(req.params.id);
    if (!deletedTier) {
      return res.status(404).json({ 
        success: false,
        message: 'Tier not found' 
      });
    }
    res.status(200).json({ 
      success: true,
      message: 'Tier deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};
export const updateTier = async (req, res) => {
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

    // Validate input (REMOVED DEPOSIT_ACCT_INT_TIER_ID from validation)
    if (!PROD_ID || !MARGIN_RATE || !TO_AMT || !REC_ST || !VERSION_NO || !USER_ID || !CREATE_DT || !CREATED_BY || !SYS_CREATE_TS || !MARGIN_TY_CD) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields for updating interest tier' 
      });
    }

    // Ensure MARGIN_RATE, TO_AMT, FROM_AMT, PENAL_MARGIN_RATE are valid numbers
    if (isNaN(MARGIN_RATE) || isNaN(TO_AMT) || (FROM_AMT && isNaN(FROM_AMT)) || (PENAL_MARGIN_RATE && isNaN(PENAL_MARGIN_RATE))) {
      return res.status(400).json({ 
        success: false,
        message: 'MARGIN_RATE, TO_AMT, FROM_AMT, and PENAL_MARGIN_RATE must be valid numbers.' 
      });
    }

    // Ensure REC_ST is a single character (max length of 1)
    if (REC_ST.length !== 1) {
      return res.status(400).json({ 
        success: false,
        message: 'REC_ST must be a single character.' 
      });
    }

    // Parse the route param as the PROD_ID (Number)
    const prodId = parseInt(req.params.id, 10);
    if (isNaN(prodId)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid PROD_ID provided in URL' 
      });
    }

    // Find the existing DepositAccountInterest_Tier by PROD_ID
    let interestTier = await DepositAccountInterest_Tier.findOne({ PROD_ID: prodId });

    if (!interestTier) {
      return res.status(404).json({ 
        success: false,
        message: 'Interest tier not found' 
      });
    }

    // Update the interest tier fields
    interestTier.PROD_ID = PROD_ID;
    interestTier.MARGIN_RATE = mongoose.Types.Decimal128.fromString(MARGIN_RATE.toString());
    interestTier.FROM_AMT = FROM_AMT ? mongoose.Types.Decimal128.fromString(FROM_AMT.toString()) : undefined;
    interestTier.TO_AMT = mongoose.Types.Decimal128.fromString(TO_AMT.toString());
    interestTier.REC_ST = REC_ST;
    interestTier.VERSION_NO = VERSION_NO;
    interestTier.USER_ID = USER_ID;
    interestTier.CREATE_DT = moment(CREATE_DT).toDate();
    interestTier.CREATED_BY = CREATED_BY;
    interestTier.SYS_CREATE_TS = moment(SYS_CREATE_TS).toDate();
    interestTier.MARGIN_TY_CD = MARGIN_TY_CD;
    interestTier.PENAL_MARGIN_RATE = PENAL_MARGIN_RATE ? mongoose.Types.Decimal128.fromString(PENAL_MARGIN_RATE.toString()) : undefined;
    interestTier.PENAL_MARGIN_TY_CD = PENAL_MARGIN_TY_CD;

    // Save the updated interest tier document
    await interestTier.save();

    // Respond with success message
    res.status(200).json({
      success: true,
      message: 'Interest tier updated successfully',
      data: interestTier
    });
  } catch (error) {
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
    const tiers = await DepositAccountInterest_Tier.find({ PROD_ID: productId });
    
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