import DepositAccountInterestAudit from '../models/Deposit_Account_INTEREST$AUD.js';
import RateIndex from '../models/Rate-Index.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Products from '../models/Products.js'; // Import Products model
import moment from 'moment';


// Log the interest calculation audit
export const logInterestCalculation = async (accountId, interestData) => {
  try {
    // Fetch the PROD_DESIGN_ID from the Products model based on the account's PROD_ID
    const product = await Products.findOne({ PROD_ID: interestData.PROD_ID });
    if (!product) {
      throw new Error('Product not found');
    }

    const PROD_DESIGN_ID = product.PROD_DESIGN_ID;

    // Create a new DepositAccountInterestAudit record with PROD_DESIGN_ID
    const newAuditRecord = new DepositAccountInterestAudit({
      DEPOSIT_ACCT_INT_ID: PROD_DESIGN_ID, // Set PROD_DESIGN_ID here
      ACCT_ID: accountId, // Using ACCT_ID instead of _id
      INT_RATE_TY: 'TIERED', // This can be dynamic based on the rate type
      MARGIN_RATE: interestData.rate,
      MIN_INT_AMT: interestData.interestAmount,
      REC_ST: 'Active',
      VERSION_NO: 1,
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      CREATED_BY: 'system',
      SYS_CREATE_TS: new Date(),
      FIXED_RATE: 0,
      EFFECTIVE_DT: new Date(),
      AUDIT_ACTION: 'CREATE',
      AUDIT_USER: 'system',
      AUDIT_TS: new Date()
    });

    await newAuditRecord.save();
  } catch (error) {
    console.error('Error logging interest calculation:', error);
  }
};


// Calculate daily interest and post at EOM
export const calculateAndPostDailyInterest = async () => {
  try {
    // Fetch the latest rate from RateIndex model
    const rateIndex = await RateIndex.findOne({}).sort({ EFFECTIVE_DT: -1 }).limit(1); // Get the latest rate
    if (!rateIndex || !rateIndex.FIXED_RATE) {
      return console.log('Interest rate not found in rate index');
    }

    const annualInterestRate = rateIndex.FIXED_RATE;
    const dailyRate = annualInterestRate / 100 / 365;  // Daily interest rate

    // Fetch all active customer accounts
    const customerAccounts = await CustomerAccount.find({ REC_ST: 'ACTIVE' });
    if (!customerAccounts || customerAccounts.length === 0) {
      return console.log('No active customer accounts found');
    }

    // Loop through each customer account to calculate daily interest
    for (let customerAccount of customerAccounts) {
      const principalAmount = customerAccount.LEDGER_BAL;
      if (!principalAmount || principalAmount <= 0) {
        continue; // Skip accounts with no balance or negative balance
      }

      // Calculate interest for the day (ACT/ACT accrual)
      const accrualBasis = 'ACT/ACT';
      const startDate = moment(customerAccount.LAST_INTEREST_CALC_DATE); // The date when interest was last calculated
      const endDate = moment().startOf('day'); // Today's date (midnight)
      const daysInPeriod = endDate.diff(startDate, 'days');

      if (daysInPeriod > 0) {
        // Calculate the accrued interest for the period
        const interestAccrued = (principalAmount * dailyRate * daysInPeriod);
        
        // Prepare the data for the audit log
        const interestData = {
          rate: dailyRate, // Daily rate
          interestAmount: interestAccrued, // Interest accrued since last calculation
          PROD_ID: rateIndex.PROD_ID // Add PROD_ID for product lookup
        };

        // Log the interest calculation audit using ACCT_ID
        await logInterestCalculation(customerAccount.ACCT_ID, interestData);  // Using ACCT_ID here

        // Update the ledger balance for the customer account with the calculated interest
        customerAccount.LEDGER_BAL += interestAccrued;
        customerAccount.LAST_INTEREST_CALC_DATE = moment().toDate(); // Update the last calculation date
        await customerAccount.save();
      }
    }

    console.log('Daily interest calculation and posting completed.');
  } catch (error) {
    console.error('Error during daily interest calculation:', error);
  }
};


// Trigger the interest calculation process manually
export const triggerInterestCalculation = async (req, res) => {
  try {
    console.log('Manually triggering interest calculation...');
    await calculateAndCreateAllInterest(req, res); // Call the existing function for interest calculation
    res.status(200).json({ message: 'Interest calculation triggered successfully.' });
  } catch (error) {
    console.error('Error triggering interest calculation:', error);
    res.status(500).json({ message: 'Error triggering interest calculation.', error: error.message });
  }
};


// Calculate and create audit records for all deposit accounts
export const calculateAndCreateAllInterest = async (req, res) => {
  try {
    const { timePeriodInYears } = req.body;

    // Validate input
    if (!timePeriodInYears) {
      return res.status(400).json({ message: 'timePeriodInYears is required' });
    }

    // Fetch the latest rate from RateIndex model
    const rateIndex = await RateIndex.findOne({}).sort({ EFFECTIVE_DT: -1 }).limit(1); // Get the latest rate
    if (!rateIndex || !rateIndex.FIXED_RATE) {
      return res.status(400).json({ message: 'Interest rate not found in rate index' });
    }

    const annualInterestRate = rateIndex.FIXED_RATE;
    const rateDecimal = annualInterestRate / 100;

    // Fetch all active customer accounts
    const customerAccounts = await CustomerAccount.find({ REC_ST: 'ACTIVE' });
    if (!customerAccounts || customerAccounts.length === 0) {
      return res.status(404).json({ message: 'No active customer accounts found' });
    }

    // Loop through each customer account and calculate interest
    for (let customerAccount of customerAccounts) {
      const principalAmount = customerAccount.LEDGER_BAL;
      if (!principalAmount || principalAmount <= 0) {
        continue; // Skip accounts with no balance or negative balance
      }

      // Fetch the associated product to get PROD_DESIGN_ID
      const product = await Products.findOne({ PROD_ID: rateIndex.PROD_ID });
      if (!product) {
        return res.status(400).json({ message: 'Product not found for the given PROD_ID' });
      }

      const PROD_DESIGN_ID = product.PROD_DESIGN_ID;

      // Calculate interest for this account
      const accrualBasis = 'ACT/ACT';
      const startDate = new Date();
      const endDate = moment().add(timePeriodInYears, 'years').toDate();
      const daysInPeriod = moment(endDate).diff(moment(startDate), 'days');
      const interestEarned = (principalAmount * rateDecimal * daysInPeriod) / 365;

      // Prepare the data for the audit log
      const interestData = {
        rate: rateDecimal, // Interest rate used
        interestAmount: interestEarned, // Calculated interest amount
        PROD_ID: rateIndex.PROD_ID // Include the PROD_ID for product lookup
      };

      // Log the interest calculation audit using ACCT_ID
      await logInterestCalculation(customerAccount.ACCT_ID, interestData); // Using ACCT_ID here

      // Create the Deposit Account Interest Audit record
      const newRecord = new DepositAccountInterestAudit({
        DEPOSIT_ACCT_INT_ID: PROD_DESIGN_ID, // Set PROD_DESIGN_ID here
        ACCT_ID: customerAccount.ACCT_ID,  // Using ACCT_ID for audit
        PROD_ID: rateIndex.PROD_ID,
        INT_RATE_TY: 'CURCLD',
        INDEX_RATE_ID: rateIndex._id,
        RATE_STRUCT_CD: 'Fixed',
        MARGIN_RATE: 0.0,
        MIN_RATE: rateDecimal,
        MAX_RATE: rateDecimal,
        ABSOLUTE_RATE: rateDecimal,
        ACCRUAL_BASIS_TY: accrualBasis,
        ACCRUAL_BAL_BASIS_TY: 'ACT/ACT',
        RATE_CHANGE_FREQ_CD: 'Annually',
        MAX_NO_OF_RATE_CHANGES: 1,
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
        FIXED_RATE: rateDecimal,
        EFFECTIVE_DT: new Date(),
        AUDIT_ACTION: 'CREATE',
        AUDIT_USER: 'system',
        AUDIT_TS: new Date()
      });

      // Save the new interest audit record
      await newRecord.save();
    }

    // Respond with a success message after processing all accounts
    res.status(201).json({
      message: 'Deposit account interest audit records created for all customers'
    });
  } catch (error) {
    console.error('Error creating deposit account interest audit records:', error);
    res.status(500).json({
      message: 'Error creating deposit account interest audit records',
      error: error.message
    });
  }
};


// Fetch all interest audit records (for display purposes)
export const getAllDepositAccountInterestAudits = async (req, res) => {
  try {
    const records = await DepositAccountInterestAudit.find();
    res.status(200).json({ data: records });
  } catch (error) {
    console.error('Error fetching deposit account interest audit records:', error);
    res.status(400).json({
      message: 'Error fetching deposit account interest audit records',
      error: error.message
    });
  }
};

// Get a specific deposit account interest audit record by ID
export const getDepositAccountInterestAuditById = async (req, res) => {
  try {
    const record = await DepositAccountInterestAudit.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: 'Deposit account interest audit record not found' });
    }
    res.status(200).json({ data: record });
  } catch (error) {
    console.error('Error fetching deposit account interest audit record by ID:', error);
    res.status(400).json({ message: 'Error fetching deposit account interest audit record by ID', error: error.message });
  }
};

// Update a deposit account interest audit record by ID
export const updateDepositAccountInterestAudit = async (req, res) => {
  try {
    const updatedRecord = await DepositAccountInterestAudit.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedRecord) {
      return res.status(404).json({ message: 'Deposit account interest audit record not found' });
    }
    res.status(200).json({ message: 'Deposit account interest audit record updated', data: updatedRecord });
  } catch (error) {
    console.error('Error updating deposit account interest audit record:', error);
    res.status(400).json({ message: 'Error updating deposit account interest audit record', error: error.message });
  }
};

// Delete a deposit account interest audit record by ID
export const deleteDepositAccountInterestAudit = async (req, res) => {
  try {
    const deletedRecord = await DepositAccountInterestAudit.findByIdAndDelete(req.params.id);
    if (!deletedRecord) {
      return res.status(404).json({ message: 'Deposit account interest audit record not found' });
    }
    res.status(200).json({ message: 'Deposit account interest audit record deleted', data: deletedRecord });
  } catch (error) {
    console.error('Error deleting deposit account interest audit record:', error);
    res.status(400).json({ message: 'Error deleting deposit account interest audit record', error: error.message });
  }
};

