import DepositAccountInterest_Tier from '../models/DepositAccountInterest_Tier.js';
import DepositAccountInterestAudit from '../models/Deposit_Account_INTEREST$AUD.js'; // Import the audit model
import CustomerAccount from '../models/CustomerAccount.js';
import Products from '../models/Products.js'; // Import Products model
import moment from 'moment';

// DepositAccountInterest_TierController.js
export const createTier = async (req, res) => {
  // Your code here
try {
    // Destructure necessary fields from request body
    const { 
      DEPOSIT_ACCT_INT_TIER_ID, 
      DEPOSIT_ACCT_INT_ID,
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
    if (!DEPOSIT_ACCT_INT_TIER_ID || !DEPOSIT_ACCT_INT_ID || !PROD_ID || !MARGIN_RATE || !TO_AMT || !REC_ST || !VERSION_NO || !USER_ID || !CREATE_DT || !CREATED_BY || !SYS_CREATE_TS || !MARGIN_TY_CD) {
      return res.status(400).json({ message: 'Missing required fields for creating interest tier' });
    }

    // Ensure MARGIN_RATE, TO_AMT, FROM_AMT, PENAL_MARGIN_RATE are valid numbers
    if (isNaN(MARGIN_RATE) || isNaN(TO_AMT) || (FROM_AMT && isNaN(FROM_AMT)) || (PENAL_MARGIN_RATE && isNaN(PENAL_MARGIN_RATE))) {
      return res.status(400).json({ message: 'MARGIN_RATE, TO_AMT, FROM_AMT, and PENAL_MARGIN_RATE must be valid numbers.' });
    }

    // Ensure REC_ST is a single character (max length of 1)
    if (REC_ST.length !== 1) {
      return res.status(400).json({ message: 'REC_ST must be a single character.' });
    }

    // Create a new DepositAccountInterest_Tier document
    const newInterestTier = new DepositAccountInterest_Tier({
      DEPOSIT_ACCT_INT_TIER_ID, 
      DEPOSIT_ACCT_INT_ID,
      PROD_ID, 
      MARGIN_RATE: mongoose.Types.Decimal128.fromString(MARGIN_RATE.toString()),  // Store as Decimal128
      FROM_AMT: FROM_AMT ? mongoose.Types.Decimal128.fromString(FROM_AMT.toString()) : undefined,  // Store as Decimal128 if available
      TO_AMT: mongoose.Types.Decimal128.fromString(TO_AMT.toString()),  // Store as Decimal128
      REC_ST, 
      VERSION_NO, 
      ROW_TS: new Date(),  // Timestamp for the row
      USER_ID, 
      CREATE_DT: moment(CREATE_DT).toDate(),  // Convert to Date object
      CREATED_BY, 
      SYS_CREATE_TS: moment(SYS_CREATE_TS).toDate(),  // Convert to Date object
      MARGIN_TY_CD, 
      PENAL_MARGIN_RATE: PENAL_MARGIN_RATE ? mongoose.Types.Decimal128.fromString(PENAL_MARGIN_RATE.toString()) : undefined,  // Store as Decimal128 if available
      PENAL_MARGIN_TY_CD
    });

    // Save the new interest tier document
    await newInterestTier.save();

    // Respond with success message and the saved tier data
    res.status(201).json({
      message: 'Interest tier created successfully',
      data: newInterestTier
    });
    
  } catch (error) {
    console.error('Error creating interest tier:', error);
    res.status(500).json({
      message: 'Error creating interest tier',
      error: error.message
    });
  }
};

// Fetch tiered interest rates based on the account balance
export const calculateTieredInterest = async (customerAccount) => {
  const tiers = await DepositAccountInterest_Tier.find({ DEPOSIT_ACCT_INT_ID: customerAccount.DEPOSIT_ACCT_INT_ID });

  let applicableRate = 0;

  // Loop through each tier to determine the applicable interest rate based on the account balance
  for (const tier of tiers) {
    if (
      (tier.FROM_AMT === undefined || customerAccount.LEDGER_BAL >= tier.FROM_AMT) &&
      customerAccount.LEDGER_BAL <= tier.TO_AMT
    ) {
      applicableRate = tier.MARGIN_RATE;
      break;
    }
  }

  if (applicableRate === 0) {
    throw new Error('No applicable interest rate found for this account balance.');
  }

  return applicableRate;
};


export const calculateAndCreateTieredInterest = async (req, res) => {
  try {
    const customerAccounts = await CustomerAccount.find({ REC_ST: 'ACTIVE' });
    if (!customerAccounts || customerAccounts.length === 0) {
      return res.status(404).json({ message: 'No active customer accounts found' });
    }

    // Fetch the interest tiers for all the relevant deposit accounts (based on PROD_ID)
    const depositInterestTiers = await DepositAccountInterest_Tier.find({ REC_ST: 'A' });

    if (!depositInterestTiers || depositInterestTiers.length === 0) {
      return res.status(404).json({ message: 'No active interest tiers found' });
    }

    for (let customerAccount of customerAccounts) {
      const principalAmount = customerAccount.LEDGER_BAL;
      if (!principalAmount || principalAmount <= 0) {
        continue; // Skip accounts with no balance or negative balance
      }

      // Fetch product design ID (PROD_DESIGN_ID) based on customer account's product ID (PROD_ID)
      const product = await Products.findOne({ PROD_ID: customerAccount.PROD_ID });
      if (!product) {
        return res.status(404).json({ message: 'Product not found for customer account' });
      }

      const PROD_DESIGN_ID = product.PROD_DESIGN_ID; // Get the PROD_DESIGN_ID from the product

      // Find the matching tier for this customer account
      const applicableTier = depositInterestTiers.find(
        (tier) => tier.PROD_ID === customerAccount.PROD_ID
      );

      if (!applicableTier) {
        continue; // If no matching tier is found, skip to next customer account
      }

      const marginRate = applicableTier.MARGIN_RATE;
      const penalMarginRate = applicableTier.PENAL_MARGIN_RATE || 0;

      // Calculate the applicable interest rate based on the margin rate
      const applicableRate = marginRate;

      // Calculate interest using the applicable rate
      const startDate = new Date();
      const endDate = moment().add(1, 'year').toDate();
      const daysInPeriod = moment(endDate).diff(moment(startDate), 'days');
      const interestEarned = (principalAmount * applicableRate * daysInPeriod) / 365;

      // Prepare the data for the audit log
      const interestData = {
        rate: applicableRate, // Margin rate as the applicable rate
        interestAmount: interestEarned, // Calculated interest amount
        PROD_ID: customerAccount.PROD_ID // Ensure the PROD_ID is accurate
      };

      // Create the Deposit Account Interest Audit record
      const newTierRecord = new DepositAccountInterestAudit({
        DEPOSIT_ACCT_INT_ID: PROD_DESIGN_ID, // Use PROD_DESIGN_ID from the Products model
        ACCT_ID: customerAccount.ACCT_ID, // Using ACCT_ID for audit
        PROD_ID: customerAccount.PROD_ID,
        INT_RATE_TY: 'TIERED', // Since it's based on tiered rate
        MARGIN_RATE: marginRate,
        MIN_RATE: marginRate, // Assuming minimum and maximum rate are the same for the margin rate
        MAX_RATE: marginRate,
        ABSOLUTE_RATE: marginRate, // If needed, you can calculate the absolute rate here
        ACCRUAL_BASIS_TY: 'ACT/ACT',
        ACCRUAL_BAL_BASIS_TY: 'ACT/ACT',
        MARGIN_TY_CD: applicableTier.MARGIN_TY_CD,
        MARGIN_BAL_BASIS_TY: 'ACT/ACT', // Assuming same basis as accrual
        RATE_CHANGE_FREQ_CD: 'Annually',
        MAX_NO_OF_RATE_CHANGES: 1,
        RATE_CHANGE_FREQ_VALUE: 1,
        SETLMNT_FREQ_CD: 'EOM',
        SETLMNT_FREQ_VALUE: moment(endDate).date(),
        MIN_INT_AMT: interestEarned,
        OVR_FG: 'N',
        REC_ST: 'Active',
        VERSION_NO: 1,
        ROW_TS: new Date(),
        USER_ID: 'system',
        CREATE_DT: new Date(),
        CREATED_BY: 'system',
        SYS_CREATE_TS: new Date(),
        LAST_SETLMNT_DT: endDate,
        NEXT_SETLMNT_DT: moment(endDate).add(1, 'month').toDate(),
        FIXED_RATE: 0, // You can calculate a fixed rate here if required
        EFFECTIVE_DT: new Date(),
        AUDIT_ACTION: 'CREATE',
        AUDIT_USER: 'system',
        AUDIT_TS: new Date()
      });

      // Save the new interest record based on the tiered calculation
      await newTierRecord.save();
    }

    // Respond with a success message after processing all accounts
    res.status(201).json({ message: 'Deposit account interest calculated using tiered rates.' });
  } catch (error) {
    console.error('Error calculating tiered interest:', error);
    res.status(500).json({ message: 'Error calculating tiered interest', error: error.message });
  }
};

// Get all deposit account interest tiers
export const getAllTiers = async (req, res) => {
  try {
    const tiers = await DepositAccountInterest_Tier.find();
    res.status(200).json(tiers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a deposit account interest tier by ID
export const getTierById = async (req, res) => {
  try {
    const tier = await DepositAccountInterest_Tier.findById(req.params.id);
    if (!tier) {
      return res.status(404).json({ message: 'Tier not found' });
    }
    res.status(200).json(tier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete a deposit account interest tier by ID
export const deleteTier = async (req, res) => {
  try {
    const deletedTier = await DepositAccountInterest_Tier.findByIdAndDelete(req.params.id);
    if (!deletedTier) {
      return res.status(404).json({ message: 'Tier not found' });
    }
    res.status(200).json({ message: 'Tier deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTier = async (req, res) => {
  try {
    const { 
      DEPOSIT_ACCT_INT_TIER_ID,
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
    if (!DEPOSIT_ACCT_INT_TIER_ID || !PROD_ID || !MARGIN_RATE || !TO_AMT || !REC_ST || !VERSION_NO || !USER_ID || !CREATE_DT || !CREATED_BY || !SYS_CREATE_TS || !MARGIN_TY_CD) {
      return res.status(400).json({ message: 'Missing required fields for updating interest tier' });
    }

    // Ensure MARGIN_RATE, TO_AMT, FROM_AMT, PENAL_MARGIN_RATE are valid numbers
    if (isNaN(MARGIN_RATE) || isNaN(TO_AMT) || (FROM_AMT && isNaN(FROM_AMT)) || (PENAL_MARGIN_RATE && isNaN(PENAL_MARGIN_RATE))) {
      return res.status(400).json({ message: 'MARGIN_RATE, TO_AMT, FROM_AMT, and PENAL_MARGIN_RATE must be valid numbers.' });
    }

    // Ensure REC_ST is a single character (max length of 1)
    if (REC_ST.length !== 1) {
      return res.status(400).json({ message: 'REC_ST must be a single character.' });
    }

    // Find the existing DepositAccountInterest_Tier by DEPOSIT_ACCT_INT_TIER_ID
    let interestTier = await DepositAccountInterest_Tier.findOne({ DEPOSIT_ACCT_INT_TIER_ID });

    if (!interestTier) {
      return res.status(404).json({ message: 'Interest tier not found for the provided DEPOSIT_ACCT_INT_TIER_ID' });
    }

    // Update the interest tier fields
    interestTier.MARGIN_RATE = mongoose.Types.Decimal128.fromString(MARGIN_RATE.toString());  // Store as Decimal128
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
      message: 'Interest tier updated successfully',
      data: interestTier
    });
  } catch (error) {
    console.error('Error updating interest tier:', error);
    res.status(500).json({
      message: 'Error updating interest tier',
      error: error.message
    });
  }
};