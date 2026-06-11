// jobs/accrualJob.js – FINAL VERSION (uses LoanAccount + CustomerAccount)
import cron from 'node-cron';
import { sequelize } from '../../config/db.js';
import { LoanAccount, CustomerAccount, InterestAccrual } from '../models/index.js';
import { getProductTypeByProdIdInternal } from '../controllers/ProductTypeMappingController.js';

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
      productId = account.product_id;   // adjust if your column is named differently
      customerId = account.customer_id;
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

    // Insert daily accrual record
    const accrualData = {
      account_no: accountNumber,
      date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
      dailyInterest: dailyInterest,
      principal: balance,
      annualRate: annualRate,
      accrualType: 'DAILY_INTEREST',
      status: 'PENDING',
      product_type: productType,
      product_id: productId,
      customer_id: customerId,
      gl_interest_accrued: glMapping?.gl_interest_accrued || null,
      gl_interest_income: glMapping?.gl_interest_income || null,
      gl_interest_expense: glMapping?.gl_interest_expense || null,
    };

    await InterestAccrual.create(accrualData, { transaction });

    // Update cumulative accrued interest on the account
    const currentAccrued = parseFloat(account.accrued_interest) || 0;
    const newAccrued = currentAccrued + dailyInterest;
    await account.update({ accrued_interest: newAccrued }, { transaction });

    console.log(`✅ ${productType} accrual: ${accountNumber} – ₦${dailyInterest.toFixed(2)}`);
  } catch (err) {
    console.error(`❌ Failed to process accrual for ${productType} account ${account.ACCT_NO || account.account_number}:`, err.message);
    throw err;
  }
};

export const startAccrualJob = () => {
  // Runs daily at midnight (adjust timezone as needed)
  cron.schedule(
    '0 0 * * *',
    async () => {
      const transaction = await sequelize.transaction();
      let totalProcessed = 0;
      let errorCount = 0;

      try {
        // 1. Process ACTIVE loan accounts
        const activeLoans = await LoanAccount.findAll({
          where: { LOAN_STATUS: 'ACTIVE' },
          transaction,
        });
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
        const depositAccounts = await CustomerAccount.findAll({
          where: {
            status: 'ACTIVE',
            product_type: { [sequelize.Op.in]: ['SAVINGS', 'TERM_DEPOSIT'] },
          },
          transaction,
        });
        for (const acc of depositAccounts) {
          try {
            const productType = acc.product_type === 'SAVINGS' ? 'SAVINGS' : 'TERM_DEPOSIT';
            await processAccountAccrual(acc, productType, transaction);
            totalProcessed++;
          } catch (err) {
            console.error(`❌ ${acc.product_type} ${acc.account_number}:`, err.message);
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
    { timezone: 'Africa/Lagos' } // adjust to your server timezone
  );
};