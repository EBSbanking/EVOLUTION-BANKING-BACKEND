// src/models/LoanAccount.js – WITH LOAN CYCLE TRACKING & CORRECT FIELD MAPPING
// REMOVED: penalty_rule_id (does not exist in database)
import { DataTypes, Op, QueryTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class LoanAccount extends Model {
  /**
   * Get the next loan cycle number for a customer
   * @param {string} customerId - The customer ID
   * @param {object} transaction - Optional Sequelize transaction
   * @returns {Promise<number>} The next loan cycle number (1-based)
   */
  static async getNextLoanCycle(customerId, transaction = null) {
    if (!customerId) return 1;
    
    const count = await this.count({
      where: { CUST_ID: customerId },
      transaction
    });
    
    return count + 1;
  }

  /**
   * Get all loan cycles for a customer (history)
   * @param {string} customerId - The customer ID
   * @returns {Promise<Array>} Array of loan accounts with cycle numbers
   */
  static async getLoanCycleHistory(customerId) {
    const loans = await this.findAll({
      where: { CUST_ID: customerId },
      attributes: ['id', 'ACCT_NO', 'loan_cycle', 'LOAN_STATUS', 'DISBURSEMENT_DATE', 'OUTSTANDING_PRINCIPAL'],
      order: [['created_at', 'ASC']]
    });
    
    return loans.map(loan => ({
      accountNumber: loan.ACCT_NO,
      loanCycle: loan.loan_cycle,
      status: loan.LOAN_STATUS,
      disbursementDate: loan.DISBURSEMENT_DATE,
      outstandingPrincipal: loan.OUTSTANDING_PRINCIPAL
    }));
  }

  /**
   * Get the current loan cycle for a customer (latest cycle number)
   * @param {string} customerId - The customer ID
   * @returns {Promise<number>} The current loan cycle number
   */
  static async getCurrentLoanCycle(customerId) {
    const count = await this.count({
      where: { CUST_ID: customerId }
    });
    return count;
  }

  /**
   * Get total outstanding principal for a customer across all loans
   * @param {string} customerId - The customer ID
   * @returns {Promise<number>} Total outstanding principal
   */
  static async getTotalOutstandingPrincipal(customerId) {
    const result = await this.sum('OUTSTANDING_PRINCIPAL', {
      where: { 
        CUST_ID: customerId,
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED', 'APPROVED'] }
      }
    });
    return parseFloat(result) || 0;
  }

  /**
   * Get loan count by customer ID
   * @param {string} customerId - The customer ID
   * @returns {Promise<number>} Total number of loans for this customer
   */
  static async getLoanCountByCustomer(customerId) {
    if (!customerId) return 0;
    return await this.count({
      where: { CUST_ID: customerId }
    });
  }

  /**
   * Get all customers with their loan counts
   * @returns {Promise<Array>} Array of customers with loan counts
   */
  static async getAllCustomersWithLoanCounts() {
    const results = await this.findAll({
      attributes: [
        'CUST_ID',
        [sequelize.fn('COUNT', sequelize.col('id')), 'loanCount']
      ],
      group: ['CUST_ID'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
    });
    return results.map(r => ({
      customerId: r.CUST_ID,
      loanCount: parseInt(r.get('loanCount')) || 0
    }));
  }

  /**
   * Backfill loan_cycle for all existing loans
   * @param {object} options - Options including batch size
   * @returns {Promise<object>} Summary of backfill operation
   */
  static async backfillLoanCycle(options = {}) {
    const { batchSize = 100, dryRun = false } = options;
    
    console.log('🔄 Starting loan_cycle backfill...');
    
    try {
      // Get all customers with their loan counts
      const customers = await this.findAll({
        attributes: ['CUST_ID'],
        group: ['CUST_ID'],
        raw: true
      });
      
      console.log(`📊 Found ${customers.length} customers with loans`);
      
      let totalUpdated = 0;
      let totalErrors = 0;
      const errors = [];
      
      for (const customer of customers) {
        const custId = customer.CUST_ID;
        if (!custId) continue;
        
        try {
          // Get all loans for this customer ordered by creation
          const loans = await this.findAll({
            where: { CUST_ID: custId },
            order: [['created_at', 'ASC']],
            attributes: ['id', 'ACCT_NO', 'loan_cycle']
          });
          
          console.log(`📊 Customer ${custId}: ${loans.length} loans`);
          
          let customerUpdated = 0;
          
          // Update each loan with its cycle number
          for (let i = 0; i < loans.length; i++) {
            const loan = loans[i];
            const cycleNumber = i + 1;
            
            if (loan.loan_cycle !== cycleNumber) {
              if (!dryRun) {
                await loan.update({ loan_cycle: cycleNumber });
                console.log(`  ✅ Loan ${loan.ACCT_NO}: cycle ${cycleNumber}`);
              } else {
                console.log(`  🔍 DRY RUN: Loan ${loan.ACCT_NO}: would set cycle to ${cycleNumber} (currently ${loan.loan_cycle})`);
              }
              customerUpdated++;
            }
          }
          
          totalUpdated += customerUpdated;
          console.log(`✅ Customer ${custId}: updated ${customerUpdated} loans`);
          
        } catch (customerError) {
          console.error(`❌ Error processing customer ${custId}:`, customerError.message);
          totalErrors++;
          errors.push({ customerId: custId, error: customerError.message });
        }
      }
      
      console.log(`✅ Backfill completed! Updated ${totalUpdated} loans, ${totalErrors} errors`);
      
      return {
        success: true,
        totalUpdated,
        totalErrors,
        errors,
        dryRun
      };
      
    } catch (error) {
      console.error('❌ Error during backfill:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async findOverdueLoans(currentDate = new Date()) {
    await this.ensureTableExists();
    return await this.findAll({
      where: {
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED', 'APPROVED'] },
        NEXT_PAYMENT_DATE: { [Op.lt]: currentDate },
        OUTSTANDING_PRINCIPAL: { [Op.gt]: 0 }
      }
    });
  }

  static async markLoansAsOverdue(currentDate = new Date()) {
    await this.ensureTableExists();
    const overdueLoans = await this.findOverdueLoans(currentDate);
    let modifiedCount = 0;
    for (const loan of overdueLoans) {
      try {
        await loan.update({ LOAN_STATUS: 'OVERDUE', updatedAt: new Date() });
        modifiedCount++;
      } catch (error) {
        console.error(`Failed to mark loan ${loan.ACCT_NO} as overdue:`, error.message);
      }
    }
    return { modifiedCount };
  }

  static async findByAccountNumber(accountNumber) {
    await this.ensureTableExists();
    return await this.findOne({ where: { ACCT_NO: accountNumber } });
  }

  static async findByCustomerId(customerId) {
    await this.ensureTableExists();
    return await this.findAll({ where: { CUST_ID: customerId } });
  }

  static async findByCreatedBy(userId) {
    await this.ensureTableExists();
    return await this.findAll({ 
      where: { CREATED_BY: userId },
      order: [['created_at', 'DESC']]
    });
  }

  static async ensureTableExists() {
    try {
      const [result] = await sequelize.query(
        `SELECT COUNT(*) as tableExists FROM information_schema.tables 
         WHERE table_schema = DATABASE() AND table_name = 'loan_accounts'`,
        { type: QueryTypes.SELECT }
      );
      if (result.tableExists === 0) {
        console.log('📝 Creating loan_accounts table...');
        await this.sync({ force: false });
        console.log('✅ loan_accounts table created');
      }
      return true;
    } catch (error) {
      console.error('❌ Error ensuring loan_accounts table:', error.message);
      return false;
    }
  }

  getAccountNumber() { return this.ACCT_NO; }
  getCustomerId() { return this.CUST_ID; }
  getLoanStatus() { return this.LOAN_STATUS; }
  getOutstandingPrincipal() { return parseFloat(this.OUTSTANDING_PRINCIPAL) || 0; }
  isActive() { return ['ACTIVE', 'DISBURSED', 'APPROVED'].includes(this.LOAN_STATUS); }
  
  /**
   * Get the loan cycle number for this specific loan
   * @returns {number} The loan cycle number
   */
  getLoanCycle() { return this.loan_cycle || 1; }
  
  /**
   * Check if loan is in arrears (overdue)
   * @returns {boolean} True if loan is overdue
   */
  isOverdue() {
    if (!this.NEXT_PAYMENT_DATE) return false;
    return new Date(this.NEXT_PAYMENT_DATE) < new Date();
  }
  
  /**
   * Get days in arrears
   * @returns {number} Number of days overdue (0 if not overdue)
   */
  getDaysInArrears() {
    if (!this.isOverdue()) return 0;
    const diff = Math.floor((Date.now() - new Date(this.NEXT_PAYMENT_DATE).getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }
}

LoanAccount.init(
  {
    id: { 
      type: DataTypes.INTEGER, 
      primaryKey: true, 
      autoIncrement: true 
    },

    // Basic loan account info
    ACCT_NO: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'acct_no'
    },
    ACCT_NM: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'acct_nm'
    },
    CUST_ID: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'cust_id'
    },
    LOAN_PRODUCT_ID: {
      type: DataTypes.INTEGER,
      field: 'loan_product_id'
    },

    // Amounts - using correct field mapping (snake_case from database)
    AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      field: 'amount'
    },
    DISBURSED_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'disbursed_amount'
    },
    OUTSTANDING_PRINCIPAL: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'outstanding_principal'
    },
    ACCRUED_INTEREST: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'accrued_interest'
    },
    PENALTY_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'penalty_amount'
    },

    // Interest and status
    INTEREST_RATE: {
      type: DataTypes.DECIMAL(10, 4),
      defaultValue: 0,
      field: 'interest_rate'
    },
    LOAN_STATUS: {
      type: DataTypes.STRING(50),
      defaultValue: 'PENDING',
      field: 'loan_status'
    },
    SERVICING_STATUS: {
      type: DataTypes.STRING(50),
      defaultValue: 'SERVICED',
      field: 'servicing_status'
    },

    // Dates
    APPLICATION_DATE: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'application_date'
    },
    APPROVAL_DATE: {
      type: DataTypes.DATE,
      field: 'approval_date'
    },
    DISBURSEMENT_DATE: {
      type: DataTypes.DATE,
      field: 'disbursement_date'
    },
    CLOSURE_DATE: {
      type: DataTypes.DATE,
      field: 'closure_date'
    },
    LAST_REPAYMENT_DATE: {
      type: DataTypes.DATE,
      field: 'last_repayment_date'
    },
    LAST_REPAYMENT_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'last_repayment_amount'
    },
    NEXT_PAYMENT_DATE: {
      type: DataTypes.DATE,
      field: 'next_payment_date'
    },
    MATURITY_DT: {
      type: DataTypes.DATE,
      field: 'maturity_dt'
    },

    // Repayment tracking
    TOTAL_REPAID_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'total_repaid_amount'
    },
    TERM_CD: {
      type: DataTypes.STRING(20),
      defaultValue: 'MONTHLY',
      field: 'term_cd'
    },
    TERM_VALUE: {
      type: DataTypes.INTEGER,
      defaultValue: 12,
      field: 'term_value'
    },
    CUSTOMER_ACCOUNT_ID: {
      type: DataTypes.BIGINT,
      field: 'customer_account_id'
    },

    // Guarantor info
    GUARANTOR_ID: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'guarantor_id'
    },
    GUARANTEED_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: true,
      field: 'guaranteed_amount'
    },

    // Portfolio
    LOAN_PORTFOLIO_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'loan_portfolio_id'
    },

    // Audit fields
    CREATED_BY: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'created_by'
    },

    // ✅ Loan Cycle Tracking
    loan_cycle: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false,
      field: 'loan_cycle',
      comment: 'Number of loans this customer has received (1-based, incremental)'
    },

    // Schedule flags
    hasRepaymentSchedule: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'has_repayment_schedule'
    },
    repaymentScheduleId: {
      type: DataTypes.INTEGER,
      field: 'repayment_schedule_id'
    },

    // Timestamps
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
    // ❌ REMOVED: penalty_rule_id - This column does NOT exist in the loan_accounts table
    // The penalty_rule_id is stored in loan_penalties table, not loan_accounts
  },
  {
    sequelize,
    modelName: 'LoanAccount',
    tableName: 'loan_accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    hooks: {
      /**
       * Automatically set the loan_cycle before creating a new loan
       */
      beforeCreate: async (loan, options) => {
        if (loan.CUST_ID) {
          const count = await LoanAccount.count({
            where: { CUST_ID: loan.CUST_ID },
            transaction: options.transaction
          });
          loan.loan_cycle = count + 1;
          console.log(`📊 Loan cycle for customer ${loan.CUST_ID}: ${loan.loan_cycle} (previous loans: ${count})`);
        } else {
          loan.loan_cycle = 1;
          console.warn('⚠️ No CUST_ID provided, setting loan_cycle to 1');
        }
      },
      /**
       * Handle bulk creation - set loan_cycle for each loan
       */
      beforeBulkCreate: async (loans, options) => {
        if (!loans || loans.length === 0) return;
        
        // Group loans by CUST_ID
        const loansByCustomer = {};
        for (const loan of loans) {
          if (loan.CUST_ID) {
            if (!loansByCustomer[loan.CUST_ID]) {
              loansByCustomer[loan.CUST_ID] = [];
            }
            loansByCustomer[loan.CUST_ID].push(loan);
          }
        }
        
        // For each customer, get the current count and assign cycles
        for (const [custId, customerLoans] of Object.entries(loansByCustomer)) {
          const currentCount = await LoanAccount.count({
            where: { CUST_ID: custId },
            transaction: options.transaction
          });
          
          customerLoans.forEach((loan, index) => {
            loan.loan_cycle = currentCount + index + 1;
          });
        }
      }
    }
  }
);

export default LoanAccount;