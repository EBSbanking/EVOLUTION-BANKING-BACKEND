import sequelize from '../../config/db.js';
import DepositAccountInterestAudit from '../models/Deposit_Account_INTEREST$AUD.js';
import RateIndex from '../models/Rate-Index.js';
import CustomerAccount from '../models/CustomerAccount.js';
import SavingsProduct from '../models/SavingsProduct.js';
import moment from 'moment';
import { Op } from 'sequelize';

// Log the interest calculation audit
export const logInterestCalculation = async (accountId, interestData, transaction = null) => {
  try {
    const product = await SavingsProduct.findOne({
      where: { PROD_ID: interestData.PROD_ID },
      transaction
    });
    
    if (!product) {
      throw new Error('Savings product not found');
    }

    const newAuditRecord = await DepositAccountInterestAudit.create({
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
      AUDIT_TS: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    }, { transaction });

    return newAuditRecord;
  } catch (error) {
    console.error('Error logging interest calculation:', error);
    throw error;
  }
};

// Calculate daily interest and post at EOM
export const calculateAndPostDailyInterest = async () => {
  const transaction = await sequelize.transaction();

  try {
    // Fetch the latest rate from RateIndex model
    const rateIndex = await RateIndex.findOne({
      order: [['EFFECTIVE_DT', 'DESC']],
      transaction
    });
    
    if (!rateIndex || !rateIndex.FIXED_RATE) {
      await transaction.rollback();
      return { success: false, message: 'Interest rate not found in rate index' };
    }

    const annualInterestRate = parseFloat(rateIndex.FIXED_RATE);
    const dailyRate = annualInterestRate / 100 / 365;

    // Fetch all active savings customer accounts
    const customerAccounts = await CustomerAccount.findAll({
      where: {
        REC_ST: 'ACTIVE',
        ACCOUNT_TYPE: { [Op.in]: ['SAVINGS', 'TERM_DEPOSIT'] }
      },
      transaction
    });

    if (!customerAccounts || customerAccounts.length === 0) {
      await transaction.rollback();
      return { success: false, message: 'No active savings customer accounts found' };
    }

    let processedCount = 0;

    for (let customerAccount of customerAccounts) {
      const principalAmount = customerAccount.LEDGER_BAL;
      if (!principalAmount || parseFloat(principalAmount) <= 0) {
        continue;
      }

      // Calculate interest for the period since last calculation
      const lastCalcDate = customerAccount.LAST_INTEREST_CALC_DATE || customerAccount.created_at;
      const startDate = moment(lastCalcDate);
      const endDate = moment().startOf('day');
      const daysInPeriod = endDate.diff(startDate, 'days');

      if (daysInPeriod > 0) {
        const principalAmountNum = parseFloat(principalAmount);
        const interestAccrued = principalAmountNum * dailyRate * daysInPeriod;

        // Log the interest calculation
        await logInterestCalculation(customerAccount.ACCT_ID, {
          rate: dailyRate,
          interestAmount: interestAccrued,
          PROD_ID: customerAccount.PROD_ID,
          rateType: 'DAILY'
        }, transaction);

        // Update account balance
        await customerAccount.update({
          LEDGER_BAL: principalAmountNum + interestAccrued,
          LAST_INTEREST_CALC_DATE: moment().toDate(),
          updated_at: new Date()
        }, { transaction });
        
        processedCount++;
      }
    }

    await transaction.commit();
    return { 
      success: true, 
      message: 'Daily interest calculation completed',
      processed: processedCount 
    };

  } catch (error) {
    await transaction.rollback();
    console.error('Error during daily interest calculation:', error);
    return { success: false, message: error.message };
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

// Fetch all interest audit records (for display purposes)
export const getAllDepositAccountInterestAudits = async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate, accountId, productId } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    
    // Apply filters
    if (accountId) where.ACCT_ID = accountId;
    if (productId) where.PROD_ID = productId;
    
    if (startDate || endDate) {
      where.AUDIT_TS = {};
      if (startDate) where.AUDIT_TS[Op.gte] = new Date(startDate);
      if (endDate) where.AUDIT_TS[Op.lte] = new Date(endDate);
    }

    const { count, rows: records } = await DepositAccountInterestAudit.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: offset,
      order: [['AUDIT_TS', 'DESC']]
    });

    res.status(200).json({ 
      success: true,
      count: records.length,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit),
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
  const transaction = await sequelize.transaction();

  try {
    const { timePeriodInYears } = req.body;

    // Validate input
    if (!timePeriodInYears) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'timePeriodInYears is required' 
      });
    }

    // Fetch the latest rate from RateIndex model
    const rateIndex = await RateIndex.findOne({
      order: [['EFFECTIVE_DT', 'DESC']],
      transaction
    });
    
    if (!rateIndex || !rateIndex.FIXED_RATE) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Interest rate not found in rate index' 
      });
    }

    const annualInterestRate = parseFloat(rateIndex.FIXED_RATE);
    const rateDecimal = annualInterestRate / 100;

    // Fetch all active customer accounts
    const customerAccounts = await CustomerAccount.findAll({
      where: {
        REC_ST: 'ACTIVE',
        ACCOUNT_TYPE: { [Op.in]: ['SAVINGS', 'TERM_DEPOSIT'] }
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
    let errorCount = 0;

    // Loop through each customer account and calculate interest
    for (let customerAccount of customerAccounts) {
      try {
        const principalAmount = customerAccount.LEDGER_BAL;
        if (!principalAmount || parseFloat(principalAmount) <= 0) {
          continue; // Skip accounts with no balance or negative balance
        }

        // Use the customer account's PROD_ID to find the savings product
        const product = await SavingsProduct.findOne({
          where: { PROD_ID: customerAccount.PROD_ID },
          transaction
        });
        
        if (!product) {
          console.log(`Savings product not found for PROD_ID: ${customerAccount.PROD_ID}`);
          errorCount++;
          continue;
        }

        const PROD_DESIGN_ID = product.PROD_DESIGN_ID || customerAccount.PROD_ID;

        // Convert to number for calculation
        const principalAmountNum = parseFloat(principalAmount);
        
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
        await logInterestCalculation(customerAccount.ACCT_ID, interestData, transaction);

        // Create the Deposit Account Interest Audit record
        await DepositAccountInterestAudit.create({
          DEPOSIT_ACCT_INT_ID: PROD_DESIGN_ID,
          ACCT_ID: customerAccount.ACCT_ID,
          PROD_ID: customerAccount.PROD_ID,
          INT_RATE_TY: 'CURCLD',
          INDEX_RATE_ID: rateIndex.id,
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
          AUDIT_TS: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction });

        processedCount++;
        
      } catch (accountError) {
        console.error(`Error processing account ${customerAccount.ACCT_ID}:`, accountError);
        errorCount++;
      }
    }

    await transaction.commit();

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
    await transaction.rollback();
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
    const record = await DepositAccountInterestAudit.findByPk(req.params.id);
    
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
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: records } = await DepositAccountInterestAudit.findAndCountAll({
      where: { ACCT_ID: accountId },
      limit: parseInt(limit),
      offset: offset,
      order: [['AUDIT_TS', 'DESC']]
    });

    res.status(200).json({ 
      success: true,
      count: records.length,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit),
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
  const transaction = await sequelize.transaction();

  try {
    const record = await DepositAccountInterestAudit.findByPk(req.params.id, { transaction });
    
    if (!record) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'Deposit account interest audit record not found' 
      });
    }

    await record.update({
      ...req.body,
      AUDIT_ACTION: 'UPDATE',
      AUDIT_TS: new Date(),
      updated_at: new Date()
    }, { transaction });

    await transaction.commit();

    // Get updated record
    const updatedRecord = await DepositAccountInterestAudit.findByPk(req.params.id);

    res.status(200).json({ 
      success: true,
      message: 'Deposit account interest audit record updated', 
      data: updatedRecord 
    });
  } catch (error) {
    await transaction.rollback();
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
  const transaction = await sequelize.transaction();

  try {
    const record = await DepositAccountInterestAudit.findByPk(req.params.id, { transaction });
    
    if (!record) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'Deposit account interest audit record not found' 
      });
    }

    await record.destroy({ transaction });
    await transaction.commit();

    res.status(200).json({ 
      success: true,
      message: 'Deposit account interest audit record deleted', 
      data: record 
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error deleting deposit account interest audit record:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting deposit account interest audit record', 
      error: error.message 
    });
  }
};

// Get interest calculation summary
export const getInterestCalculationSummary = async (req, res) => {
  try {
    const { startDate, endDate, productId } = req.query;

    const where = {
      AUDIT_ACTION: 'CREATE'
    };

    if (startDate || endDate) {
      where.AUDIT_TS = {};
      if (startDate) where.AUDIT_TS[Op.gte] = new Date(startDate);
      if (endDate) where.AUDIT_TS[Op.lte] = new Date(endDate);
    }

    if (productId) where.PROD_ID = productId;

    // Get total interest calculated
    const totalInterest = await DepositAccountInterestAudit.sum('MIN_INT_AMT', { where });

    // Get count of calculations
    const calculationCount = await DepositAccountInterestAudit.count({ where });

    // Get by account type
    const byAccountType = await DepositAccountInterestAudit.findAll({
      attributes: [
        'PROD_ID',
        [sequelize.fn('COUNT', sequelize.col('id')), 'calculationCount'],
        [sequelize.fn('SUM', sequelize.col('MIN_INT_AMT')), 'totalInterest']
      ],
      where,
      group: ['PROD_ID'],
      order: [[sequelize.fn('SUM', sequelize.col('MIN_INT_AMT')), 'DESC']]
    });

    // Get recent calculations
    const recentCalculations = await DepositAccountInterestAudit.findAll({
      where,
      limit: 10,
      order: [['AUDIT_TS', 'DESC']],
      include: [{
        model: CustomerAccount,
        as: 'customerAccount',
        required: false,
        attributes: ['ACCT_NM', 'account_number']
      }]
    });

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalInterest: totalInterest || 0,
          calculationCount,
          averageInterest: calculationCount > 0 ? (totalInterest || 0) / calculationCount : 0
        },
        byAccountType,
        recentCalculations
      }
    });
  } catch (error) {
    console.error('Error getting interest calculation summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting interest calculation summary',
      error: error.message
    });
  }
};

// Bulk delete audit records
export const bulkDeleteAuditRecords = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { ids, startDate, endDate } = req.body;

    let where = {};

    if (ids && Array.isArray(ids) && ids.length > 0) {
      where.id = { [Op.in]: ids };
    } else if (startDate || endDate) {
      where.AUDIT_TS = {};
      if (startDate) where.AUDIT_TS[Op.lt] = new Date(startDate);
      if (endDate) where.AUDIT_TS[Op.lt] = new Date(endDate);
    } else {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Either ids array or date range is required'
      });
    }

    const deletedCount = await DepositAccountInterestAudit.destroy({
      where,
      transaction
    });

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: `${deletedCount} audit records deleted successfully`
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error bulk deleting audit records:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk deleting audit records',
      error: error.message
    });
  }
};

// Archive old audit records (move to archive table if you have one)
export const archiveOldAuditRecords = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { cutoffDate } = req.body;
    
    if (!cutoffDate) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'cutoffDate is required'
      });
    }

    // Find old records
    const oldRecords = await DepositAccountInterestAudit.findAll({
      where: {
        AUDIT_TS: { [Op.lt]: new Date(cutoffDate) }
      },
      transaction
    });

    if (oldRecords.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: true,
        message: 'No old records found to archive'
      });
    }

    // If you have an archive table, create records there
    // const archiveRecords = oldRecords.map(record => ({
    //   ...record.toJSON(),
    //   archived_at: new Date()
    // }));
    // await ArchiveTable.bulkCreate(archiveRecords, { transaction });

    // Delete the old records
    await DepositAccountInterestAudit.destroy({
      where: {
        AUDIT_TS: { [Op.lt]: new Date(cutoffDate) }
      },
      transaction
    });

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: `${oldRecords.length} old audit records archived and deleted`,
      archivedCount: oldRecords.length
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error archiving old audit records:', error);
    res.status(500).json({
      success: false,
      message: 'Error archiving old audit records',
      error: error.message
    });
  }
};