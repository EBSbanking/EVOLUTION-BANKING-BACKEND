// jobs/accrualJob.js – CORRECTED VERSION
import cron from 'node-cron';
import { sequelize } from '../../config/db.js';
import { LoanAccount, CustomerAccount, InterestAccrual } from '../models/index.js';
import { getProductTypeByProdIdInternal } from '../controllers/ProductTypeMappingController.js';
import { Op } from 'sequelize';  // ✅ Add this import

/**
 * Calculate daily interest based on balance and annual rate
 * @param {number} balance - principal or ledger balance
 * @param {number} annualRatePercent - interest rate in percent (e.g., 10 for 10%)
 * @returns {number} daily interest amount
 */
const calculateDailyInterest = (balance, annualRatePercent) => {
  if (!balance || balance <= 0 || !annualRatePercent || annualRatePercent <= 0) return 0;
  const dailyRate = annualRatePercent / 100 / 365;
  return balance * dailyRate;
};

/**
 * Process a single account and record daily accrual
 * @param {Object} account - Sequelize model instance (LoanAccount or CustomerAccount)
 * @param {string} productType - 'LOAN', 'SAVINGS', or 'TERM_DEPOSIT'
 * @param {Object} transaction - Sequelize transaction
 */
const processAccountAccrual = async (account, productType, transaction) => {
  try {
    let balance = 0;
    let annualRate = 0;
    let accountNumber;
    let productId;
    let customerId;

    if (productType === 'LOAN') {
      balance = parseFloat(account.OUTSTANDING_PRINCIPAL) || 0;
      annualRate = parseFloat(account.INTEREST_RATE) || 0;
      accountNumber = account.ACCT_NO;
      productId = account.LOAN_PRODUCT_ID;
      customerId = account.CUST_ID;
    } else {
      // Savings or Term Deposit (CustomerAccount)
      balance = parseFloat(account.ledger_balance) || 0;
      annualRate = parseFloat(account.interest_rate) || 0;
      accountNumber = account.account_number;
      productId = account.product_id;
      customerId = account.CUST_ID;
    }

    if (balance <= 0 || annualRate <= 0) return;

    const dailyInterest = calculateDailyInterest(balance, annualRate);
    if (dailyInterest <= 0) return;

    // Fetch GL mapping (optional, for future GL posting)
    let glMapping = null;
    if (productId) {
      try {
        const productMapping = await getProductTypeByProdIdInternal(productId);
        glMapping = productMapping.glAccounts;
      } catch (err) {
        console.warn(`No product mapping for PROD_ID ${productId}: ${err.message}`);
      }
    }

    // ✅ Check if InterestAccrual model exists and table is available
    let accrualRecord = null;
    try {
      // Insert daily accrual record
      const accrualData = {
        account_no: accountNumber,
        date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
        daily_interest: dailyInterest,  // ✅ Use snake_case to match table
        principal: balance,
        annual_rate: annualRate,  // ✅ Use snake_case
        accrual_type: 'DAILY_INTEREST',  // ✅ Use snake_case
        status: 'PENDING',
        product_type: productType,  // ✅ Use snake_case
        product_id: productId,  // ✅ Use snake_case
        customer_id: customerId,  // ✅ Use snake_case
        gl_interest_accrued: glMapping?.gl_interest_accrued || null,
        gl_interest_income: glMapping?.gl_interest_income || null,
        gl_interest_expense: glMapping?.gl_interest_expense || null,
      };

      // ✅ Check if InterestAccrual model is available
      if (InterestAccrual && typeof InterestAccrual.create === 'function') {
        accrualRecord = await InterestAccrual.create(accrualData, { transaction });
      } else {
        // ✅ Fallback: Insert directly via SQL if model is not available
        const columns = Object.keys(accrualData).join(', ');
        const values = Object.values(accrualData);
        const placeholders = values.map(() => '?').join(', ');
        
        await sequelize.query(
          `INSERT INTO interest_accruals (${columns}) VALUES (${placeholders})`,
          { replacements: values, transaction }
        );
      }
    } catch (err) {
      // ✅ If table doesn't exist, create it
      if (err.message.includes("doesn't exist") || err.message.includes("Table '")) {
        console.log('🔧 Creating interest_accruals table...');
        await createInterestAccrualsTable(transaction);
        
        // Retry insertion
        const accrualData = {
          account_no: accountNumber,
          date: new Date().toISOString().slice(0, 10),
          daily_interest: dailyInterest,
          principal: balance,
          annual_rate: annualRate,
          accrual_type: 'DAILY_INTEREST',
          status: 'PENDING',
          product_type: productType,
          product_id: productId,
          customer_id: customerId,
        };
        
        await sequelize.query(
          `INSERT INTO interest_accruals SET ?`,
          { replacements: [accrualData], transaction }
        );
      } else {
        throw err;
      }
    }

    // ✅ Update cumulative accrued interest on the account
    const currentAccrued = parseFloat(account.accrued_interest) || 0;
    const newAccrued = currentAccrued + dailyInterest;
    
    if (typeof account.update === 'function') {
      await account.update({ accrued_interest: newAccrued }, { transaction });
    } else {
      // Fallback for raw SQL
      await sequelize.query(
        `UPDATE ${productType === 'LOAN' ? 'loan_accounts' : 'customer_accounts'} 
         SET accrued_interest = ? 
         WHERE ${productType === 'LOAN' ? 'ACCT_NO' : 'account_number'} = ?`,
        { replacements: [newAccrued, accountNumber], transaction }
      );
    }

    console.log(`✅ ${productType} accrual: ${accountNumber} – ₦${dailyInterest.toFixed(2)}`);
  } catch (err) {
    console.error(`❌ Failed to process accrual for ${productType} account ${account.ACCT_NO || account.account_number}:`, err.message);
    throw err;
  }
};

/**
 * ✅ Create interest_accruals table if it doesn't exist
 */
const createInterestAccrualsTable = async (transaction = null) => {
  const sql = `
    CREATE TABLE IF NOT EXISTS interest_accruals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      account_no VARCHAR(50) NOT NULL,
      date DATE NOT NULL,
      daily_interest DECIMAL(15,4) DEFAULT 0,
      principal DECIMAL(15,4) DEFAULT 0,
      annual_rate DECIMAL(10,4) DEFAULT 0,
      accrual_type VARCHAR(50) DEFAULT 'DAILY_INTEREST',
      status VARCHAR(20) DEFAULT 'PENDING',
      product_type VARCHAR(50),
      product_id INT,
      customer_id VARCHAR(50),
      gl_interest_accrued VARCHAR(50),
      gl_interest_income VARCHAR(50),
      gl_interest_expense VARCHAR(50),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_account_no (account_no),
      INDEX idx_date (date),
      INDEX idx_status (status),
      INDEX idx_product_type (product_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  
  const options = transaction ? { transaction } : {};
  await sequelize.query(sql, options);
  console.log('✅ interest_accruals table created');
};

export const startAccrualJob = () => {
  console.log('🚀 Starting accrual job...');
  
  // ✅ Create table on startup if it doesn't exist
  createInterestAccrualsTable().catch(err => {
    console.error('❌ Failed to create interest_accruals table:', err.message);
  });

  // Runs daily at 11:30 PM (adjust timezone as needed)
  cron.schedule(
    '30 23 * * *',
    async () => {
      console.log('🔄 Running daily interest accrual job...');
      const transaction = await sequelize.transaction();
      let totalProcessed = 0;
      let errorCount = 0;

      try {
        // 1. Process ACTIVE loan accounts
        let activeLoans = [];
        try {
          activeLoans = await LoanAccount.findAll({
            where: { LOAN_STATUS: 'ACTIVE' },
            transaction,
          });
        } catch (err) {
          console.warn('Could not fetch LoanAccount:', err.message);
        }

        for (const loan of activeLoans) {
          try {
            await processAccountAccrual(loan, 'LOAN', transaction);
            totalProcessed++;
          } catch (err) {
            console.error(`❌ Loan ${loan.ACCT_NO}:`, err.message);
            errorCount++;
          }
        }

        // 2. Process ACTIVE savings / term deposit accounts from CustomerAccount
        let depositAccounts = [];
        try {
          depositAccounts = await CustomerAccount.findAll({
            where: {
              status: 'ACTIVE',
              product_type: { [Op.in]: ['SAVINGS', 'TERM_DEPOSIT'] },
            },
            transaction,
          });
        } catch (err) {
          console.warn('Could not fetch CustomerAccount:', err.message);
          // Try using alternative field name
          try {
            depositAccounts = await CustomerAccount.findAll({
              where: {
                status: 'ACTIVE',
                account_type: { [Op.in]: ['SAVINGS', 'TERM_DEPOSIT'] },
              },
              transaction,
            });
          } catch (err2) {
            console.warn('Could not fetch CustomerAccount with account_type:', err2.message);
          }
        }

        for (const acc of depositAccounts) {
          try {
            const productType = acc.product_type === 'SAVINGS' ? 'SAVINGS' : 'TERM_DEPOSIT';
            await processAccountAccrual(acc, productType, transaction);
            totalProcessed++;
          } catch (err) {
            console.error(`❌ ${acc.product_type || acc.account_type} ${acc.account_number}:`, err.message);
            errorCount++;
          }
        }

        await transaction.commit();
        console.log(`✅ Daily interest accrual completed. Processed ${totalProcessed} accounts. Errors: ${errorCount}`);
        
      } catch (error) {
        await transaction.rollback();
        console.error('❌ Daily accrual job failed:', error);
      }
    },
    { timezone: 'Africa/Lagos' }
  );
  
  console.log('✅ Accrual job scheduled for 11:30 PM daily');
};