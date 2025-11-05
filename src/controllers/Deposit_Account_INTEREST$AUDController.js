import mongoose from 'mongoose'; // ✅ ADD MISSING IMPORT
import DepositAccountInterestAudit from '../models/Deposit_Account_INTEREST$AUD.js';
import RateIndex from '../models/Rate-Index.js';
import CustomerAccount from '../models/CustomerAccount.js';
import SavingsProduct from '../models/SavingsProduct.js';
import moment from 'moment';

// Log the interest calculation audit
export const logInterestCalculation = async (accountId, interestData) => {
  try {
    const product = await SavingsProduct.findOne({ PROD_ID: interestData.PROD_ID });
    if (!product) {
      throw new Error('Savings product not found');
    }

    const newAuditRecord = new DepositAccountInterestAudit({
      DEPOSIT_ACCT_INT_ID: product.PROD_DESIGN_ID || interestData.PROD_ID, // Use PROD_DESIGN_ID if available
      ACCT_ID: accountId,
      PROD_ID: interestData.PROD_ID,
      INT_RATE_TY: interestData.rateType || 'STANDARD',
      MARGIN_RATE: interestData.rate,
      MIN_INT_AMT: interestData.interestAmount,
      REC_ST: 'Active',
      VERSION_NO: 1,
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      CREATED_BY: 'system',
      SYS_CREATE_TS: new Date(),
      FIXED_RATE: interestData.fixedRate || 0,
      EFFECTIVE_DT: new Date(),
      AUDIT_ACTION: 'CREATE',
      AUDIT_USER: 'system',
      AUDIT_TS: new Date()
    });

    await newAuditRecord.save();
    return newAuditRecord;
  } catch (error) {
    console.error('Error logging interest calculation:', error);
    throw error;
  }
};

// Calculate daily interest and post at EOM
export const calculateAndPostDailyInterest = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Fetch the latest rate from RateIndex model
    const rateIndex = await RateIndex.findOne({}).sort({ EFFECTIVE_DT: -1 }).limit(1);
    if (!rateIndex || !rateIndex.FIXED_RATE) {
      await session.abortTransaction();
      return { success: false, message: 'Interest rate not found in rate index' };
    }

    const annualInterestRate = parseFloat(rateIndex.FIXED_RATE.toString());
    const dailyRate = annualInterestRate / 100 / 365;

    // Fetch all active savings customer accounts
    const customerAccounts = await CustomerAccount.find({ 
      REC_ST: 'ACTIVE',
      ACCOUNT_TYPE: { $in: ['SAVINGS', 'TERM_DEPOSIT'] }
    }).session(session);

    if (!customerAccounts || customerAccounts.length === 0) {
      await session.abortTransaction();
      return { success: false, message: 'No active savings customer accounts found' };
    }

    let processedCount = 0;

    for (let customerAccount of customerAccounts) {
      const principalAmount = customerAccount.LEDGER_BAL;
      if (!principalAmount || parseFloat(principalAmount.toString()) <= 0) {
        continue;
      }

      // Calculate interest for the period since last calculation
      const lastCalcDate = customerAccount.LAST_INTEREST_CALC_DATE || customerAccount.createdAt;
      const startDate = moment(lastCalcDate);
      const endDate = moment().startOf('day');
      const daysInPeriod = endDate.diff(startDate, 'days');

      if (daysInPeriod > 0) {
        const principalAmountNum = parseFloat(principalAmount.toString());
        const interestAccrued = principalAmountNum * dailyRate * daysInPeriod;

        // Log the interest calculation
        await logInterestCalculation(customerAccount.ACCT_ID, {
          rate: dailyRate,
          interestAmount: interestAccrued,
          PROD_ID: customerAccount.PROD_ID,
          rateType: 'DAILY'
        });

        // Update account balance
        customerAccount.LEDGER_BAL = mongoose.Types.Decimal128.fromString((principalAmountNum + interestAccrued).toString());
        customerAccount.LAST_INTEREST_CALC_DATE = moment().toDate();
        await customerAccount.save({ session });
        
        processedCount++;
      }
    }

    await session.commitTransaction();
    return { 
      success: true, 
      message: 'Daily interest calculation completed',
      processed: processedCount 
    };

  } catch (error) {
    await session.abortTransaction();
    console.error('Error during daily interest calculation:', error);
    return { success: false, message: error.message };
  } finally {
    session.endSession();
  }
};

// Trigger the interest calculation process manually
export const triggerInterestCalculation = async (req, res) => {
  try {
    console.log('Manually triggering interest calculation...');
    const result = await calculateAndPostDailyInterest();
    
    if (result.success) {
      res.status(200).json({ 
        success: true,
        message: result.message,
        processed: result.processed
      });
    } else {
      res.status(400).json({ 
        success: false,
        message: result.message 
      });
    }
  } catch (error) {
    console.error('Error triggering interest calculation:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error triggering interest calculation', 
      error: error.message 
    });
  }
};

// ... other methods (getAllDepositAccountInterestAudits, etc.) remain the same

// Fetch all interest audit records (for display purposes)
export const getAllDepositAccountInterestAudits = async (req, res) => {
  try {
    const records = await DepositAccountInterestAudit.find().sort({ AUDIT_TS: -1 });
    res.status(200).json({ 
      success: true,
      count: records.length,
      data: records 
    });
  } catch (error) {
    console.error('Error fetching deposit account interest audit records:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching deposit account interest audit records',
      error: error.message
    });
  }
};

// Calculate and create audit records for all deposit accounts
export const calculateAndCreateAllInterest = async (req, res) => {
  try {
    const { timePeriodInYears } = req.body;

    // Validate input
    if (!timePeriodInYears) {
      return res.status(400).json({ 
        success: false,
        message: 'timePeriodInYears is required' 
      });
    }

    // Fetch the latest rate from RateIndex model
    const rateIndex = await RateIndex.findOne({}).sort({ EFFECTIVE_DT: -1 }).limit(1);
    if (!rateIndex || !rateIndex.FIXED_RATE) {
      return res.status(400).json({ 
        success: false,
        message: 'Interest rate not found in rate index' 
      });
    }

    const annualInterestRate = parseFloat(rateIndex.FIXED_RATE.toString());
    const rateDecimal = annualInterestRate / 100;

    // Fetch all active customer accounts
    const customerAccounts = await CustomerAccount.find({ 
      REC_ST: 'ACTIVE',
      ACCOUNT_TYPE: { $in: ['SAVINGS', 'TERM_DEPOSIT'] }
    });

    if (!customerAccounts || customerAccounts.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'No active savings customer accounts found' 
      });
    }

    let processedCount = 0;
    let errorCount = 0;

    // Loop through each customer account and calculate interest
    for (let customerAccount of customerAccounts) {
      try {
        const principalAmount = customerAccount.LEDGER_BAL;
        if (!principalAmount || parseFloat(principalAmount.toString()) <= 0) {
          continue; // Skip accounts with no balance or negative balance
        }

        // Use the customer account's PROD_ID to find the savings product
        const product = await SavingsProduct.findOne({ PROD_ID: customerAccount.PROD_ID });
        if (!product) {
          console.log(`Savings product not found for PROD_ID: ${customerAccount.PROD_ID}`);
          errorCount++;
          continue;
        }

        const PROD_DESIGN_ID = product.PROD_DESIGN_ID || customerAccount.PROD_ID;

        // Convert Decimal128 to number for calculation
        const principalAmountNum = parseFloat(principalAmount.toString());
        
        // Calculate interest for this account
        const startDate = new Date();
        const endDate = moment().add(timePeriodInYears, 'years').toDate();
        const daysInPeriod = moment(endDate).diff(moment(startDate), 'days');
        const interestEarned = (principalAmountNum * rateDecimal * daysInPeriod) / 365;

        // Prepare the data for the audit log
        const interestData = {
          rate: rateDecimal,
          interestAmount: interestEarned,
          PROD_ID: customerAccount.PROD_ID,
          rateType: 'FIXED'
        };

        // Log the interest calculation audit using ACCT_ID
        await logInterestCalculation(customerAccount.ACCT_ID, interestData);

        // Create the Deposit Account Interest Audit record
        const newRecord = new DepositAccountInterestAudit({
          DEPOSIT_ACCT_INT_ID: PROD_DESIGN_ID,
          ACCT_ID: customerAccount.ACCT_ID,
          PROD_ID: customerAccount.PROD_ID,
          INT_RATE_TY: 'CURCLD',
          INDEX_RATE_ID: rateIndex._id,
          RATE_STRUCT_CD: 'Fixed',
          MARGIN_RATE: 0.0,
          MIN_RATE: rateDecimal,
          MAX_RATE: rateDecimal,
          ABSOLUTE_RATE: rateDecimal,
          ACCRUAL_BASIS_TY: 'ACT/ACT',
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
        processedCount++;
        
      } catch (accountError) {
        console.error(`Error processing account ${customerAccount.ACCT_ID}:`, accountError);
        errorCount++;
      }
    }

    // Respond with a success message after processing all accounts
    res.status(201).json({
      success: true,
      message: 'Deposit account interest audit records created',
      summary: {
        totalAccounts: customerAccounts.length,
        processed: processedCount,
        errors: errorCount
      }
    });
  } catch (error) {
    console.error('Error creating deposit account interest audit records:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating deposit account interest audit records',
      error: error.message
    });
  }
};

// Get a specific deposit account interest audit record by ID
export const getDepositAccountInterestAuditById = async (req, res) => {
  try {
    const record = await DepositAccountInterestAudit.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ 
        success: false,
        message: 'Deposit account interest audit record not found' 
      });
    }
    res.status(200).json({ 
      success: true,
      data: record 
    });
  } catch (error) {
    console.error('Error fetching deposit account interest audit record by ID:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching deposit account interest audit record by ID', 
      error: error.message 
    });
  }
};

// Get deposit account interest audits by account ID
export const getDepositAccountInterestAuditsByAccountId = async (req, res) => {
  try {
    const { accountId } = req.params;
    const records = await DepositAccountInterestAudit.find({ ACCT_ID: accountId }).sort({ AUDIT_TS: -1 });
    
    res.status(200).json({ 
      success: true,
      count: records.length,
      data: records 
    });
  } catch (error) {
    console.error('Error fetching deposit account interest audits by account ID:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching deposit account interest audits by account ID', 
      error: error.message 
    });
  }
};

// Update a deposit account interest audit record by ID
export const updateDepositAccountInterestAudit = async (req, res) => {
  try {
    const updatedRecord = await DepositAccountInterestAudit.findByIdAndUpdate(
      req.params.id, 
      { 
        ...req.body,
        AUDIT_ACTION: 'UPDATE',
        AUDIT_TS: new Date()
      }, 
      { new: true, runValidators: true }
    );
    if (!updatedRecord) {
      return res.status(404).json({ 
        success: false,
        message: 'Deposit account interest audit record not found' 
      });
    }
    res.status(200).json({ 
      success: true,
      message: 'Deposit account interest audit record updated', 
      data: updatedRecord 
    });
  } catch (error) {
    console.error('Error updating deposit account interest audit record:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating deposit account interest audit record', 
      error: error.message 
    });
  }
};

// Delete a deposit account interest audit record by ID
export const deleteDepositAccountInterestAudit = async (req, res) => {
  try {
    const deletedRecord = await DepositAccountInterestAudit.findByIdAndDelete(req.params.id);
    if (!deletedRecord) {
      return res.status(404).json({ 
        success: false,
        message: 'Deposit account interest audit record not found' 
      });
    }
    res.status(200).json({ 
      success: true,
      message: 'Deposit account interest audit record deleted', 
      data: deletedRecord 
    });
  } catch (error) {
    console.error('Error deleting deposit account interest audit record:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting deposit account interest audit record', 
      error: error.message 
    });
  }
};