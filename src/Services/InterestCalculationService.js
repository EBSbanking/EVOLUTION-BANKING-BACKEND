// src/services/InterestCalculationService.js - MYSQL VERSION
import { Decimal } from 'decimal.js';
import sequelize from '../../config/db.js';

export default class InterestCalculationService {
  constructor() {
    console.log('InterestCalculationService initialized (MySQL)');
  }

  /**
   * Convert value to MySQL-safe decimal
   */
  toMySQLDecimal(value) {
    if (value === null || value === undefined) return 0.00;
    if (value instanceof Decimal) return parseFloat(value.toFixed(2));
    
    try {
      const decimalValue = new Decimal(value);
      return parseFloat(decimalValue.toFixed(2));
    } catch (error) {
      console.warn('Failed to convert to MySQL decimal:', value, error.message);
      return 0.00;
    }
  }

  /**
   * Convert term to months based on term code
   */
  convertTermToMonths(termValue, termCode) {
    const termCodeUpper = String(termCode).toUpperCase();
    
    switch (termCodeUpper) {
      case 'D': return termValue / 30.44; // Days to months
      case 'W': return termValue / 4.345; // Weeks to months
      case 'BW': return termValue / 2; // Bi-weeks to months
      case 'M': return termValue; // Already in months
      case 'Q': return termValue * 3; // Quarters to months
      case 'Y': return termValue * 12; // Years to months
      default: return termValue; // Default to months
    }
  }

  /**
   * Get total payments based on frequency
   */
  getTotalPaymentsForFrequency(termValue, termCode, paymentFrequency) {
    const termMonths = this.convertTermToMonths(termValue, termCode);
    const frequency = String(paymentFrequency).toUpperCase();
    
    let totalPayments;
    
    switch (frequency) {
      case 'DAILY': totalPayments = termMonths * 30.44; break;
      case 'WEEKLY': totalPayments = termMonths * 4.345; break;
      case 'BI_WEEKLY': totalPayments = termMonths * 2; break;
      case 'MONTHLY': totalPayments = termMonths; break;
      case 'QUARTERLY': totalPayments = termMonths / 3; break;
      case 'SEMI_ANNUALLY': totalPayments = termMonths / 6; break;
      case 'ANNUALLY': totalPayments = termMonths / 12; break;
      default: totalPayments = termMonths; // Default to monthly
    }
    
    return Math.ceil(totalPayments);
  }

  /**
   * Calculate next payment date
   */
  calculateNextPaymentDate(installmentNumber, paymentFrequency, startDate) {
    const date = new Date(startDate);
    const frequency = String(paymentFrequency).toUpperCase();
    
    switch (frequency) {
      case 'DAILY': 
        date.setDate(date.getDate() + installmentNumber);
        break;
      case 'WEEKLY': 
        date.setDate(date.getDate() + (installmentNumber * 7));
        break;
      case 'BI_WEEKLY': 
        date.setDate(date.getDate() + (installmentNumber * 14));
        break;
      case 'MONTHLY': 
        date.setMonth(date.getMonth() + installmentNumber);
        break;
      case 'QUARTERLY': 
        date.setMonth(date.getMonth() + (installmentNumber * 3));
        break;
      case 'SEMI_ANNUALLY': 
        date.setMonth(date.getMonth() + (installmentNumber * 6));
        break;
      case 'ANNUALLY': 
        date.setFullYear(date.getFullYear() + installmentNumber);
        break;
      default: 
        date.setMonth(date.getMonth() + installmentNumber);
    }
    
    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  }

  /**
   * Calculate FIXED RATE / SIMPLE INTEREST EMI
   * Used for flat rate loans where interest is calculated on original principal
   */
  calculateFixedRateEMI(principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate, isRateForTerm = false) {
    console.log('=== FIXED RATE / SIMPLE INTEREST CALCULATION (MySQL) ===');
    console.log(`Principal: ₦${principal}, Annual Rate: ${annualRatePercent}%, Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);
    console.log(`Is rate for term duration? ${isRateForTerm}`);

    let totalInterest;
    
    if (isRateForTerm || annualRatePercent > 50) {
      console.log(`Rate ${annualRatePercent}% is for the entire term, not annual`);
      totalInterest = principal * (annualRatePercent / 100);
    } else {
      // For annual rates
      const timeInYears = this.convertTermToMonths(termValue, termCode) / 12;
      totalInterest = principal * (annualRatePercent / 100) * timeInYears;
      console.log(`Rate ${annualRatePercent}% is annual, time in years: ${timeInYears.toFixed(4)}`);
    }
    
    const totalRepayable = principal + totalInterest;
    const totalPayments = this.getTotalPaymentsForFrequency(termValue, termCode, paymentFrequency);
    const emi = totalRepayable / totalPayments;

    console.log(`Total Interest: ₦${totalInterest.toFixed(2)}`);
    console.log(`Total Repayable: ₦${totalRepayable.toFixed(2)}`);
    console.log(`EMI (per payment): ₦${emi.toFixed(2)}`);
    console.log(`Total Payments: ${totalPayments}`);

    // Generate schedule
    const installments = [];
    let remaining = principal;

    for (let i = 1; i <= totalPayments; i++) {
      const interestPortion = totalInterest / totalPayments;
      let principalPortion = emi - interestPortion;

      if (i === totalPayments) {
        principalPortion = remaining;
      }

      remaining -= principalPortion;
      if (remaining < 0.01) remaining = 0;

      const dueDate = this.calculateNextPaymentDate(i, paymentFrequency, startDate);

      installments.push({
        installmentNo: i,
        dueDate,
        principal: this.toMySQLDecimal(principalPortion),
        interest: this.toMySQLDecimal(interestPortion),
        totalPayment: this.toMySQLDecimal(principalPortion + interestPortion),
        remainingBalance: this.toMySQLDecimal(remaining),
        status: 'PENDING'
      });
    }

    return {
      emi: this.toMySQLDecimal(emi),
      totalInterest: this.toMySQLDecimal(totalInterest),
      totalRepayable: this.toMySQLDecimal(totalRepayable),
      totalPayment: this.toMySQLDecimal(totalRepayable), // Added for compatibility
      installments,
      calculationMethod: 'FIXED_RATE_SIMPLE',
      interestType: 'SIMPLE',
      rateUsed: annualRatePercent,
      isRateForTerm: isRateForTerm || annualRatePercent > 50
    };
  }

  /**
   * Calculate REDUCING BALANCE / COMPOUND EMI
   * Used for reducing balance loans where interest is calculated on outstanding balance
   */
  calculateReducingBalanceEMI(principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate) {
    console.log('=== REDUCING BALANCE / COMPOUND INTEREST CALCULATION (MySQL) ===');
    console.log(`Principal: ₦${principal}, Annual Rate: ${annualRatePercent}%, Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);

    const totalPayments = this.getTotalPaymentsForFrequency(termValue, termCode, paymentFrequency);
    
    // Calculate periodic rate based on payment frequency
    let periodicRate;
    const frequency = String(paymentFrequency).toUpperCase();
    
    switch (frequency) {
      case 'DAILY': periodicRate = annualRatePercent / 100 / 365; break;
      case 'WEEKLY': periodicRate = annualRatePercent / 100 / 52; break;
      case 'BI_WEEKLY': periodicRate = annualRatePercent / 100 / 26; break;
      case 'MONTHLY': periodicRate = annualRatePercent / 100 / 12; break;
      case 'QUARTERLY': periodicRate = annualRatePercent / 100 / 4; break;
      case 'SEMI_ANNUALLY': periodicRate = annualRatePercent / 100 / 2; break;
      case 'ANNUALLY': periodicRate = annualRatePercent / 100; break;
      default: periodicRate = annualRatePercent / 100 / 12; // Default to monthly
    }

    let emi;
    if (periodicRate === 0) {
      emi = principal / totalPayments;
    } else {
      emi = principal * periodicRate * Math.pow(1 + periodicRate, totalPayments) /
            (Math.pow(1 + periodicRate, totalPayments) - 1);
    }

    const totalRepayable = emi * totalPayments;
    const totalInterest = totalRepayable - principal;

    // Generate schedule
    const installments = [];
    let remaining = principal;

    for (let i = 1; i <= totalPayments; i++) {
      const interestPortion = remaining * periodicRate;
      let principalPortion = emi - interestPortion;

      if (i === totalPayments) {
        principalPortion = remaining;
      }

      remaining -= principalPortion;
      if (remaining < 0.01) remaining = 0;

      const dueDate = this.calculateNextPaymentDate(i, paymentFrequency, startDate);

      installments.push({
        installmentNo: i,
        dueDate,
        principal: this.toMySQLDecimal(principalPortion),
        interest: this.toMySQLDecimal(interestPortion),
        totalPayment: this.toMySQLDecimal(principalPortion + interestPortion),
        remainingBalance: this.toMySQLDecimal(remaining),
        status: 'PENDING'
      });
    }

    return {
      emi: this.toMySQLDecimal(emi),
      totalInterest: this.toMySQLDecimal(totalInterest),
      totalRepayable: this.toMySQLDecimal(totalRepayable),
      totalPayment: this.toMySQLDecimal(totalRepayable), // Added for compatibility
      installments,
      calculationMethod: 'REDUCING_BALANCE_COMPOUND',
      interestType: 'COMPOUND',
      rateUsed: annualRatePercent
    };
  }

  /**
   * Calculate interest based on product type
   */
  calculateInterestByProductType(productType, principal, ratePercent, termValue, termCode, paymentFrequency, startDate) {
    console.log(`=== CALCULATING INTEREST BY PRODUCT TYPE (MySQL): ${productType} ===`);
    console.log(`Principal: ₦${principal}, Rate: ${ratePercent}%`);
    console.log(`Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);

    // Map product types to calculation methods
    const calculationMethodMap = {
      'FIXED_RATE_LOAN': 'FIXED_RATE',
      'FLAT_RATE_LOAN': 'FIXED_RATE',
      'REDUCING_BALANCE_LOAN': 'REDUCING_BALANCE',
      'EMI_LOAN': 'REDUCING_BALANCE',
      'SIMPLE_INTEREST_LOAN': 'FIXED_RATE',
      'COMPOUND_INTEREST_LOAN': 'REDUCING_BALANCE',
      'MICROFINANCE_LOAN': 'FIXED_RATE',
      'PERSONAL_LOAN': 'REDUCING_BALANCE',
      'BUSINESS_LOAN': 'REDUCING_BALANCE',
      'HOME_LOAN': 'REDUCING_BALANCE',
      'CAR_LOAN': 'REDUCING_BALANCE',
      'EDUCATION_LOAN': 'REDUCING_BALANCE',
    };
    
    const calculationMethod = calculationMethodMap[productType] || 'REDUCING_BALANCE';
    const isFixedTermRate = ['FIXED_RATE_LOAN', 'FLAT_RATE_LOAN', 'SIMPLE_INTEREST_LOAN', 'MICROFINANCE_LOAN'].includes(productType);
    
    console.log(`Using calculation method: ${calculationMethod}`);
    console.log(`Is fixed term rate? ${isFixedTermRate}`);
    
    return this.calculateEMIWithChosenMethod(
      principal,
      ratePercent,
      termValue,
      termCode,
      paymentFrequency,
      startDate,
      calculationMethod,
      isFixedTermRate
    );
  }

  /**
   * ENHANCED EMI CALCULATION - Main entry point for loan application
   * Aligns with applyForLoan function requirements
   */
  calculateInterestAndEMIEnhanced(principalAmount, loanInterestRate, termValue, termCode, paymentFrequency, startDate) {
    console.log('=== ENHANCED EMI CALCULATION STARTED (MySQL) ===');
    console.log(`Principal: ₦${principalAmount}`);
    console.log(`Interest Rate Config:`, loanInterestRate);

    // Extract rate - prefer ABSOLUTE_RATE, fallback to FIXED_RATE
    let ratePercent = loanInterestRate.ABSOLUTE_RATE || loanInterestRate.FIXED_RATE || loanInterestRate.DEFAULT_RATE_PER_MONTH || 0;
    
    // Log the rate type to understand what we're dealing with
    console.log(`Rate Type: ${loanInterestRate.RATE_TYPE}, Interest Type: ${loanInterestRate.INTEREST_TYPE}`);
    console.log(`Extracted Rate: ${ratePercent}%`);

    // Check if rate is monthly or annual
    const isFixedOrSimple = (loanInterestRate.RATE_TYPE === 'FIXED' || loanInterestRate.INTEREST_TYPE === 'SIMPLE');
    
    if (isFixedOrSimple) {
      console.log('Using FIXED RATE / SIMPLE INTEREST method');
      
      // For fixed rate loans, the rate is usually for the entire term
      // Example: 74.4% for 6 months = total interest over the term
      return this.calculateFixedRateEMI(
        principalAmount, 
        ratePercent, 
        termValue, 
        termCode, 
        paymentFrequency, 
        startDate, 
        true
      );
    } else {
      console.log('Using REDUCING BALANCE / COMPOUND method');
      
      // For reducing balance, check if rate is monthly
      const isMonthlyRate = ratePercent < 20; // Rates < 20% are likely monthly
      if (isMonthlyRate) {
        console.warn(`⚠️ Rate ${ratePercent}% appears to be monthly - converting to annual: ${ratePercent * 12}%`);
        ratePercent = ratePercent * 12;
      }
      
      return this.calculateReducingBalanceEMI(
        principalAmount, 
        ratePercent, 
        termValue, 
        termCode, 
        paymentFrequency, 
        startDate
      );
    }
  }

  /**
   * Calculate EMI with chosen method - For applyForLoan compatibility
   */
  calculateEMIWithChosenMethod(principal, ratePercent, termValue, termCode, paymentFrequency, startDate, calculationMethod, isFixedTermRate = false) {
    console.log('=== CALCULATING EMI WITH CHOSEN METHOD (MySQL) ===');
    console.log(`Method: ${calculationMethod}, Rate: ${ratePercent}%`);
    console.log(`Is rate for term duration? ${isFixedTermRate}`);
    
    // Force the calculation method based on user choice
    if (calculationMethod === 'FLAT_RATE' || calculationMethod === 'FIXED_RATE') {
      console.log('Using FLAT RATE (Simple Interest) calculation');
      
      // For flat rate loans, we need to know if the rate is for term or annual
      if (isFixedTermRate || ratePercent > 50) {
        console.log(`Rate ${ratePercent}% is for the entire ${termValue} ${termCode} term`);
      }
      
      return this.calculateFixedRateEMI(
        principal, 
        ratePercent, 
        termValue, 
        termCode, 
        paymentFrequency, 
        startDate, 
        isFixedTermRate || ratePercent > 50
      );
    } else if (calculationMethod === 'REDUCING_BALANCE' || calculationMethod === 'EMI') {
      console.log('Using REDUCING BALANCE (Compound Interest) calculation');
      
      // For reducing balance, assume rate is annual
      // If rate seems too high for annual (> 50%), it might be for term
      if (ratePercent > 50) {
        console.warn(`⚠️ WARNING: Rate ${ratePercent}% seems high for annual rate in reducing balance method`);
      }
      
      return this.calculateReducingBalanceEMI(
        principal, 
        ratePercent, 
        termValue, 
        termCode, 
        paymentFrequency, 
        startDate
      );
    } else {
      console.warn(`Unknown calculation method: ${calculationMethod}, defaulting to REDUCING_BALANCE`);
      return this.calculateReducingBalanceEMI(
        principal, 
        ratePercent, 
        termValue, 
        termCode, 
        paymentFrequency, 
        startDate
      );
    }
  }

  /**
   * Calculate total interest for loan
   */
  calculateTotalInterest(principal, ratePercent, termValue, termCode, calculationMethod, isFixedTermRate = false) {
    const termMonths = this.convertTermToMonths(termValue, termCode);
    
    if (calculationMethod === 'FLAT_RATE' || calculationMethod === 'FIXED_RATE') {
      if (isFixedTermRate || ratePercent > 50) {
        // Rate is for the entire term
        return principal * (ratePercent / 100);
      } else {
        // Rate is annual
        const timeInYears = termMonths / 12;
        return principal * (ratePercent / 100) * timeInYears;
      }
    } else {
      // For reducing balance, we need to calculate the full schedule
      // For simplicity, use an approximation
      const annualRate = ratePercent / 100;
      const timeInYears = termMonths / 12;
      return principal * annualRate * timeInYears * 0.6; // Approximation factor for reducing balance
    }
  }

  /**
   * Calculate effective annual percentage rate (APR)
   */
  calculateAPR(principal, totalInterest, termMonths, fees = 0) {
    try {
      const totalCost = totalInterest + fees;
      const financeCharge = new Decimal(totalCost).div(principal).times(100);
      const termInYears = new Decimal(termMonths).div(12);
      
      const apr = financeCharge.div(termInYears).toNumber();
      
      return {
        success: true,
        data: {
          principal,
          totalInterest,
          fees,
          totalCost,
          termMonths,
          apr: parseFloat(apr.toFixed(2)),
          calculationDate: new Date()
        }
      };
    } catch (error) {
      console.error('Error calculating APR:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate daily accrued interest
   */
  calculateDailyAccruedInterest(principal, annualRate, days) {
    const dailyRate = annualRate / 100 / 365;
    return principal * dailyRate * days;
  }

  /**
   * Calculate penalty interest for overdue loans
   */
  calculatePenaltyInterest(principal, penaltyRate, overdueDays) {
    const dailyPenaltyRate = penaltyRate / 100 / 365;
    return principal * dailyPenaltyRate * overdueDays;
  }

  /**
   * Generate repayment schedule for MySQL storage
   */
  async generateRepaymentScheduleForMySQL(emiResult, loanAccountData) {
    try {
      // Create loan_installments table if it doesn't exist
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS loan_installments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          loan_account_id INT NOT NULL,
          account_number VARCHAR(50),
          customer_id VARCHAR(50),
          installment_number INT NOT NULL,
          due_date DATE NOT NULL,
          principal_amount DECIMAL(15,2) NOT NULL,
          interest_amount DECIMAL(15,2) NOT NULL,
          total_amount DECIMAL(15,2) NOT NULL,
          remaining_balance DECIMAL(15,2) NOT NULL,
          status ENUM('PENDING', 'PAID', 'OVERDUE', 'PARTIAL') DEFAULT 'PENDING',
          amount_paid DECIMAL(15,2) DEFAULT 0.00,
          principal_paid DECIMAL(15,2) DEFAULT 0.00,
          interest_paid DECIMAL(15,2) DEFAULT 0.00,
          fees_paid DECIMAL(15,2) DEFAULT 0.00,
          payment_date DATE,
          payment_reference VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_loan_account (loan_account_id),
          INDEX idx_due_date (due_date),
          INDEX idx_status (status),
          UNIQUE KEY unique_installment (loan_account_id, installment_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Generate installments for MySQL insertion
      const installments = emiResult.installments.map((installment) => ({
        loan_account_id: loanAccountData.id || loanAccountData._id,
        account_number: loanAccountData.account_number || loanAccountData.ACCT_NO,
        customer_id: loanAccountData.customer_id || loanAccountData.CUST_ID,
        installment_number: installment.installmentNo,
        due_date: installment.dueDate,
        principal_amount: installment.principal,
        interest_amount: installment.interest,
        total_amount: installment.totalPayment,
        remaining_balance: installment.remainingBalance,
        status: 'PENDING'
      }));

      // Insert installments into MySQL
      const insertedIds = [];
      for (const installment of installments) {
        const [result] = await sequelize.query(
          `INSERT INTO loan_installments SET ?`,
          { replacements: [installment] }
        );
        insertedIds.push(result.insertId);
      }

      console.log(`✅ Generated ${installments.length} installments for loan account: ${loanAccountData.account_number || loanAccountData.ACCT_NO}`);

      return {
        success: true,
        loan_account_id: loanAccountData.id || loanAccountData._id,
        account_number: loanAccountData.account_number || loanAccountData.ACCT_NO,
        customer_id: loanAccountData.customer_id || loanAccountData.CUST_ID,
        start_date: loanAccountData.start_date || loanAccountData.START_DT,
        maturity_date: loanAccountData.maturity_date || loanAccountData.MATURITY_DT,
        principal_amount: loanAccountData.principal_amount || loanAccountData.DISBURSEMENT_LIMIT,
        interest_rate: loanAccountData.interest_rate || loanAccountData.INTEREST_RATE,
        interest_type: loanAccountData.interest_type || loanAccountData.INTEREST_TYPE,
        calculation_method: emiResult.calculationMethod,
        term_value: loanAccountData.term_value || loanAccountData.TERM_VALUE,
        term_code: loanAccountData.term_code || loanAccountData.TERM_CD,
        payment_frequency: loanAccountData.payment_frequency || loanAccountData.PAYMENT_FREQUENCY,
        emi_amount: emiResult.emi,
        total_interest: emiResult.totalInterest,
        total_repayable: emiResult.totalRepayable,
        total_installments: installments.length,
        installment_ids: insertedIds,
        generated_at: new Date()
      };
    } catch (error) {
      console.error('Error generating repayment schedule for MySQL:', error.message);
      throw error;
    }
  }

  /**
   * Create loan accounts table if it doesn't exist
   */
  async createLoanAccountsTableIfNotExists() {
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS loan_accounts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          account_number VARCHAR(50) UNIQUE NOT NULL,
          customer_id VARCHAR(50) NOT NULL,
          product_type VARCHAR(100),
          principal_amount DECIMAL(15,2) NOT NULL,
          interest_rate DECIMAL(10,4) NOT NULL,
          interest_type ENUM('SIMPLE', 'COMPOUND') DEFAULT 'SIMPLE',
          calculation_method VARCHAR(50),
          term_value INT NOT NULL,
          term_code VARCHAR(10) DEFAULT 'M',
          payment_frequency VARCHAR(20) DEFAULT 'MONTHLY',
          start_date DATE NOT NULL,
          maturity_date DATE,
          emi_amount DECIMAL(15,2),
          total_interest DECIMAL(15,2),
          total_repayable DECIMAL(15,2),
          outstanding_balance DECIMAL(15,2),
          status ENUM('ACTIVE', 'CLOSED', 'DEFAULTED', 'WRITTEN_OFF') DEFAULT 'ACTIVE',
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_account_number (account_number),
          INDEX idx_customer_id (customer_id),
          INDEX idx_status (status),
          INDEX idx_maturity_date (maturity_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      
      console.log('✅ Loan accounts table ready');
      return true;
    } catch (error) {
      console.error('Error creating loan accounts table:', error.message);
      return false;
    }
  }

  /**
   * Save loan calculation to database
   */
  async saveLoanCalculation(loanData, emiResult) {
    try {
      await this.createLoanAccountsTableIfNotExists();
      
      const loanAccount = {
        account_number: loanData.account_number || `LOAN_${Date.now()}`,
        customer_id: loanData.customer_id || loanData.CUST_ID,
        product_type: loanData.product_type,
        principal_amount: loanData.principal_amount || loanData.DISBURSEMENT_LIMIT,
        interest_rate: loanData.interest_rate || loanData.INTEREST_RATE,
        interest_type: loanData.interest_type || (emiResult.interestType === 'SIMPLE' ? 'SIMPLE' : 'COMPOUND'),
        calculation_method: emiResult.calculationMethod,
        term_value: loanData.term_value || loanData.TERM_VALUE,
        term_code: loanData.term_code || loanData.TERM_CD,
        payment_frequency: loanData.payment_frequency || loanData.PAYMENT_FREQUENCY,
        start_date: loanData.start_date || loanData.START_DT,
        maturity_date: this.calculateNextPaymentDate(
          loanData.term_value || loanData.TERM_VALUE,
          loanData.term_code || loanData.TERM_CD,
          loanData.start_date || loanData.START_DT
        ),
        emi_amount: emiResult.emi,
        total_interest: emiResult.totalInterest,
        total_repayable: emiResult.totalRepayable,
        outstanding_balance: emiResult.totalRepayable,
        status: 'ACTIVE',
        created_by: loanData.created_by
      };

      const [result] = await sequelize.query(
        `INSERT INTO loan_accounts SET ?`,
        { replacements: [loanAccount] }
      );

      console.log(`✅ Loan account saved with ID: ${result.insertId}`);

      // Generate and save repayment schedule
      const scheduleResult = await this.generateRepaymentScheduleForMySQL(emiResult, {
        id: result.insertId,
        ...loanAccount
      });

      return {
        success: true,
        loan_account_id: result.insertId,
        loan_account: loanAccount,
        emi_calculation: emiResult,
        repayment_schedule: scheduleResult
      };
    } catch (error) {
      console.error('Error saving loan calculation:', error.message);
      throw error;
    }
  }

  /**
   * Validate interest rate configuration
   */
  validateInterestRateConfig(loanInterestRate) {
    const errors = [];
    
    if (!loanInterestRate) {
      errors.push('Interest rate configuration is required');
    }
    
    if (loanInterestRate) {
      if (!loanInterestRate.DEFAULT_RATE_PER_MONTH && 
          !loanInterestRate.ABSOLUTE_RATE && 
          !loanInterestRate.FIXED_RATE) {
        errors.push('No valid rate found in interest rate configuration');
      }
      
      if (loanInterestRate.DEFAULT_RATE_PER_MONTH && 
          (isNaN(loanInterestRate.DEFAULT_RATE_PER_MONTH) || loanInterestRate.DEFAULT_RATE_PER_MONTH < 0)) {
        errors.push('Invalid DEFAULT_RATE_PER_MONTH value');
      }
      
      if (loanInterestRate.ABSOLUTE_RATE && 
          (isNaN(loanInterestRate.ABSOLUTE_RATE) || loanInterestRate.ABSOLUTE_RATE < 0)) {
        errors.push('Invalid ABSOLUTE_RATE value');
      }
      
      if (loanInterestRate.FIXED_RATE && 
          (isNaN(loanInterestRate.FIXED_RATE) || loanInterestRate.FIXED_RATE < 0)) {
        errors.push('Invalid FIXED_RATE value');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : null
    };
  }

  /**
   * Get loan calculations by customer
   */
  async getLoanCalculationsByCustomer(customerId) {
    try {
      const [loans] = await sequelize.query(
        `SELECT * FROM loan_accounts 
         WHERE customer_id = ? 
         ORDER BY created_at DESC`,
        { replacements: [customerId] }
      );

      return loans;
    } catch (error) {
      console.error('Error fetching loan calculations:', error.message);
      throw error;
    }
  }

  /**
   * Get loan installments by loan account
   */
  async getLoanInstallments(loanAccountId) {
    try {
      const [installments] = await sequelize.query(
        `SELECT * FROM loan_installments 
         WHERE loan_account_id = ? 
         ORDER BY installment_number ASC`,
        { replacements: [loanAccountId] }
      );

      return installments;
    } catch (error) {
      console.error('Error fetching loan installments:', error.message);
      throw error;
    }
  }
}

// Export standalone functions for backward compatibility
export const calculateInterestAndEMIEnhanced = (principalAmount, loanInterestRate, termValue, termCode, paymentFrequency, startDate) => {
  const service = new InterestCalculationService();
  return service.calculateInterestAndEMIEnhanced(principalAmount, loanInterestRate, termValue, termCode, paymentFrequency, startDate);
};

export const calculateEMIWithChosenMethod = (principal, ratePercent, termValue, termCode, paymentFrequency, startDate, calculationMethod, isFixedTermRate = false) => {
  const service = new InterestCalculationService();
  return service.calculateEMIWithChosenMethod(principal, ratePercent, termValue, termCode, paymentFrequency, startDate, calculationMethod, isFixedTermRate);
};

export const calculateFixedRateEMI = (principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate, isRateForTerm = false) => {
  const service = new InterestCalculationService();
  return service.calculateFixedRateEMI(principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate, isRateForTerm);
};

export const calculateReducingBalanceEMI = (principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate) => {
  const service = new InterestCalculationService();
  return service.calculateReducingBalanceEMI(principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate);
};

export const calculateInterestByProductType = (productType, principal, ratePercent, termValue, termCode, paymentFrequency, startDate) => {
  const service = new InterestCalculationService();
  return service.calculateInterestByProductType(productType, principal, ratePercent, termValue, termCode, paymentFrequency, startDate);
};

// MySQL-specific exports
export const saveLoanCalculation = async (loanData, emiResult) => {
  const service = new InterestCalculationService();
  return await service.saveLoanCalculation(loanData, emiResult);
};

export const getLoanCalculationsByCustomer = async (customerId) => {
  const service = new InterestCalculationService();
  return await service.getLoanCalculationsByCustomer(customerId);
};

export const getLoanInstallments = async (loanAccountId) => {
  const service = new InterestCalculationService();
  return await service.getLoanInstallments(loanAccountId);
};