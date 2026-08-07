// src/models/LoanAccount.js – WITH LOAN CYCLE TRACKING & CORRECT FIELD MAPPING
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
      attributes: ['id', 'ACCT_NO', 'loan_cycle', 'LOAN_STATUS', 'DISBURSEMENT_DATE', 'OUTSTANDING_PRINCIPAL', 'ACCRUED_INTEREST'],
      order: [['created_at', 'ASC']]
    });
    
    return loans.map(loan => ({
      accountNumber: loan.ACCT_NO,
      loanCycle: loan.loan_cycle,
      status: loan.LOAN_STATUS,
      disbursementDate: loan.DISBURSEMENT_DATE,
      outstandingPrincipal: loan.OUTSTANDING_PRINCIPAL,
      accruedInterest: loan.ACCRUED_INTEREST
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
   * Get total accrued interest for a customer across all loans
   * @param {string} customerId - The customer ID
   * @returns {Promise<number>} Total accrued interest
   */
  static async getTotalAccruedInterest(customerId) {
    const result = await this.sum('ACCRUED_INTEREST', {
      where: { 
        CUST_ID: customerId,
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED', 'APPROVED'] }
      }
    });
    return parseFloat(result) || 0;
  }

  /**
   * Get total outstanding balance (principal + interest) for a customer
   * @param {string} customerId - The customer ID
   * @returns {Promise<number>} Total outstanding balance
   */
  static async getTotalOutstandingBalance(customerId) {
    const principal = await this.getTotalOutstandingPrincipal(customerId);
    const interest = await this.getTotalAccruedInterest(customerId);
    return principal + interest;
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
          const loans = await this.findAll({
            where: { CUST_ID: custId },
            order: [['created_at', 'ASC']],
            attributes: ['id', 'ACCT_NO', 'loan_cycle']
          });
          
          console.log(`📊 Customer ${custId}: ${loans.length} loans`);
          
          let customerUpdated = 0;
          
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

  // ========== INSTANCE METHODS ==========
  getAccountNumber() { return this.ACCT_NO; }
  getCustomerId() { return this.CUST_ID; }
  getLoanStatus() { return this.LOAN_STATUS; }
  getOutstandingPrincipal() { return parseFloat(this.OUTSTANDING_PRINCIPAL) || 0; }
  getAccruedInterest() { return parseFloat(this.ACCRUED_INTEREST) || 0; }
  getTotalOutstanding() { return this.getOutstandingPrincipal() + this.getAccruedInterest(); }
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

  /**
   * Check if a year is a leap year
   * @param {number} year - The year to check
   * @returns {boolean} True if leap year
   */
  _isLeapYear(year) {
    // Leap year rule: divisible by 4, but not by 100 unless also by 400
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  /**
   * Calculate year fraction using Actual/Actual (ISMA) convention
   * Accounts for leap years by counting actual days in each year
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {number} Year fraction
   */
  _calculateActualActualYearFraction(startDate, endDate) {
    let yearFraction = 0;
    let currentDate = new Date(startDate);
    
    while (currentDate < endDate) {
      const year = currentDate.getFullYear();
      const isLeapYear = this._isLeapYear(year);
      const daysInYear = isLeapYear ? 366 : 365;
      
      // Get the next year start date
      const nextYearStart = new Date(year + 1, 0, 1);
      const segmentEnd = nextYearStart < endDate ? nextYearStart : endDate;
      
      // Calculate days in this segment
      const daysInSegment = Math.floor((segmentEnd - currentDate) / (1000 * 60 * 60 * 24));
      
      // Add the fraction for this year
      yearFraction += daysInSegment / daysInYear;
      
      currentDate = segmentEnd;
    }
    
    return yearFraction;
  }

  /**
   * Calculate total interest accrued on this loan
   * Supports multiple day count conventions:
   * - ACTUAL_365: Actual days / 365 (standard for most loans)
   * - ACTUAL_360: Actual days / 360 (used in money markets)
   * - ACTUAL_ACTUAL: Actual days / actual days in year (most accurate, handles leap years)
   * 
   * @param {Date} asOfDate - Date to calculate interest up to
   * @param {string} dayCountConvention - Day count convention (default: 'ACTUAL_365')
   * @returns {number} Total interest accrued
   */
  calculateAccruedInterest(asOfDate = new Date(), dayCountConvention = 'ACTUAL_365') {
    if (!this.INTEREST_RATE || !this.OUTSTANDING_PRINCIPAL) return 0;
    if (parseFloat(this.OUTSTANDING_PRINCIPAL) <= 0) return 0;

    const rate = parseFloat(this.INTEREST_RATE) / 100;
    const principal = parseFloat(this.OUTSTANDING_PRINCIPAL);
    const startDate = new Date(this.DISBURSEMENT_DATE || this.APPLICATION_DATE);
    const endDate = new Date(asOfDate);

    if (startDate >= endDate) return 0;

    let yearFraction;

    switch (dayCountConvention) {
      case 'ACTUAL_360':
        // Actual/360 - used in many money market instruments
        const actualDays360 = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
        yearFraction = actualDays360 / 360;
        break;
        
      case 'ACTUAL_ACTUAL':
        // Actual/Actual - most accurate, accounts for leap years
        yearFraction = this._calculateActualActualYearFraction(startDate, endDate);
        break;
        
      case 'ACTUAL_365':
      default:
        // Actual/365 - used in most loan agreements
        const actualDays365 = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
        yearFraction = actualDays365 / 365;
    }

    // Simple interest: principal * rate * time
    return principal * rate * yearFraction;
  }

  /**
   * Get interest details with different day count conventions
   * @param {Date} asOfDate - Date to calculate interest up to
   * @param {string} convention - Day count convention
   * @returns {object} Interest calculation details
   */
  getInterestDetails(asOfDate = new Date(), convention = 'ACTUAL_365') {
    const interest = this.calculateAccruedInterest(asOfDate, convention);

    return {
      principal: parseFloat(this.OUTSTANDING_PRINCIPAL),
      interestRate: parseFloat(this.INTEREST_RATE),
      interestAccrued: interest,
      totalOutstanding: parseFloat(this.OUTSTANDING_PRINCIPAL) + interest,
      dayCountConvention: convention,
      asOfDate: asOfDate,
      disbursementDate: this.DISBURSEMENT_DATE,
      daysSinceDisbursement: Math.floor((asOfDate - new Date(this.DISBURSEMENT_DATE || this.APPLICATION_DATE)) / (1000 * 60 * 60 * 24)),
      loanStatus: this.LOAN_STATUS,
      accountNumber: this.ACCT_NO
    };
  }

  /**
   * Calculate interest using standard ACTUAL/365
   * @param {Date} asOfDate - Date to calculate interest up to
   * @returns {number} Total interest accrued
   */
  calculateInterestStandard(asOfDate = new Date()) {
    return this.calculateAccruedInterest(asOfDate, 'ACTUAL_365');
  }

  /**
   * Calculate interest using ACTUAL/360 (money market)
   * @param {Date} asOfDate - Date to calculate interest up to
   * @returns {number} Total interest accrued
   */
  calculateInterestMoneyMarket(asOfDate = new Date()) {
    return this.calculateAccruedInterest(asOfDate, 'ACTUAL_360');
  }

  /**
   * Calculate interest using ACTUAL/ACTUAL (most accurate with leap year handling)
   * @param {Date} asOfDate - Date to calculate interest up to
   * @returns {number} Total interest accrued
   */
  calculateInterestActual(asOfDate = new Date()) {
    return this.calculateAccruedInterest(asOfDate, 'ACTUAL_ACTUAL');
  }

  /**
   * Get the day count convention name for display
   * @returns {string} Day count convention name
   */
  getDefaultDayCountConvention() {
    // This could be stored in the loan account or determined from product
    return 'ACTUAL_365';
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
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'M',
      field: 'TERM_CD'
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

    GUARANTOR_ID: {
      type: DataTypes.STRING(20),
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

    // Loan Cycle Tracking
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
  },
  {
    sequelize,
    modelName: 'LoanAccount',
    tableName: 'loan_accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    defaultScope: {
      attributes: {
        exclude: ['penalty_rule_id']
      }
    },
    scopes: {
      withAllFields: {
        attributes: {}
      }
    },
    hooks: {
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
      beforeBulkCreate: async (loans, options) => {
        if (!loans || loans.length === 0) return;
        
        const loansByCustomer = {};
        for (const loan of loans) {
          if (loan.CUST_ID) {
            if (!loansByCustomer[loan.CUST_ID]) {
              loansByCustomer[loan.CUST_ID] = [];
            }
            loansByCustomer[loan.CUST_ID].push(loan);
          }
        }
        
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