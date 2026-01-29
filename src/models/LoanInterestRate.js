import { DataTypes } from 'sequelize';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';

// ==================== HELPER FUNCTIONS ====================

const convertTermToMonths = (value, termType) => {
  const numValue = parseInt(value);
  
  switch(termType.toUpperCase()) {
    case 'DAYS':
      return Math.ceil(numValue / 30.44);
    case 'WEEKS':
      return Math.ceil(numValue / 4.345);
    case 'MONTHS':
      return numValue;
    case 'QUARTERS':
      return numValue * 3;
    case 'YEARS':
      return numValue * 12;
    default:
      return numValue;
  }
};

const LoanInterestRate = sequelize.define('LoanInterestRate', {
  // ========== LOAN_PROUD_INT_ID FIELD ==========
  LOAN_PROUD_INT_ID: {
    type: DataTypes.INTEGER,
    unique: false, // CHANGED FROM true TO false
    allowNull: true,
    description: "Legacy product interest ID",
    defaultValue: null,
    field: 'loan_proud_int_id'
  },
  // =============================================
  
  // Product Identification
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    trim: true,
    description: "Descriptive name for the interest rate"
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    trim: true
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    trim: true,
    uppercase: true,
    description: "Unique code for the interest rate"
  },
  
  // Rate Configuration
  RATE_TYPE: {
    type: DataTypes.ENUM('FIXED', 'VARIABLE', 'TIERED', 'PROMOTIONAL', 'INTRODUCTORY'),
    allowNull: false,
    defaultValue: 'FIXED',
    description: "Type of interest rate",
    field: 'rate_type'
  },
  INTEREST_TYPE: {
    type: DataTypes.ENUM('SIMPLE', 'COMPOUND'),
    allowNull: false,
    defaultValue: 'SIMPLE',
    description: "Interest calculation type",
    field: 'interest_type'
  },
  CALCULATION_METHOD: {
    type: DataTypes.ENUM('FLAT', 'REDUCING_BALANCE', 'RULE_OF_78'),
    allowNull: false,
    defaultValue: 'FLAT',
    description: "Method for calculating interest",
    field: 'calculation_method'
  },
  
  // Rate Values (Monthly rates for consistency)
  MIN_RATE_PER_MONTH: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0.0,
    field: 'min_rate_per_month',
    validate: {
      min: { args: [0], msg: 'Minimum rate must be non-negative' },
      max: { args: [999.9999], msg: 'Minimum rate cannot exceed 999.9999%' }
    },
    description: "Minimum interest rate per month (%)"
  },
  MAX_RATE_PER_MONTH: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 100.0,
    field: 'max_rate_per_month',
    validate: {
      min: { args: [0], msg: 'Maximum rate must be non-negative' },
      max: { args: [999.9999], msg: 'Maximum rate cannot exceed 999.9999%' },
      validateMinMax(value) {
        if (parseFloat(value) < parseFloat(this.MIN_RATE_PER_MONTH)) {
          throw new Error('MAX_RATE_PER_MONTH must be greater than or equal to MIN_RATE_PER_MONTH');
        }
      }
    },
    description: "Maximum interest rate per month (%)"
  },
  DEFAULT_RATE_PER_MONTH: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 1.0,
    field: 'default_rate_per_month',
    validate: {
      min: { args: [0], msg: 'Default rate must be non-negative' },
      max: { args: [999.9999], msg: 'Default rate cannot exceed 999.9999%' },
      validateDefaultRate(value) {
        const min = parseFloat(this.MIN_RATE_PER_MONTH);
        const max = parseFloat(this.MAX_RATE_PER_MONTH);
        const def = parseFloat(value);
        
        if (def < min || def > max) {
          throw new Error(`Default rate (${def}%) must be between min (${min}%) and max (${max}%) rates`);
        }
      }
    },
    description: "Default interest rate per month (%)"
  },
  ANNUAL_PERCENTAGE_RATE: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true,
    field: 'annual_percentage_rate',
    validate: {
      min: { args: [0], msg: 'APR must be non-negative' },
      max: { args: [9999.9999], msg: 'APR cannot exceed 9999.9999%' }
    },
    description: "Annual Percentage Rate (%)"
  },
  TOTAL_INTEREST_RATE: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true,
    field: 'total_interest_rate',
    description: "Total interest rate for the loan term"
  },
  
  // For variable rates - references RateIndex
  INDEX_RATE_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'index_rate_id',
    description: "Reference to market index rate for variable rates"
  },
  MARGIN_RATE: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'margin_rate',
    validate: {
      min: { args: [-100], msg: 'Margin rate cannot be less than -100%' },
      max: { args: [100], msg: 'Margin rate cannot exceed 100%' }
    },
    description: "Margin to add/subtract from index rate (%)"
  },
  SPREAD_RATE: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'spread_rate',
    validate: {
      min: { args: [-100], msg: 'Spread rate cannot be less than -100%' },
      max: { args: [100], msg: 'Spread rate cannot exceed 100%' }
    },
    description: "Additional spread over index + margin (%)"
  },
  
  // Term Configuration
  MIN_TERM_VALUE: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'min_term_value',
    validate: {
      min: { args: [1], msg: 'Minimum term must be at least 1' }
    },
    description: "Minimum loan term value"
  },
  MAX_TERM_VALUE: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 60,
    field: 'max_term_value',
    validate: {
      min: { args: [1], msg: 'Maximum term must be at least 1' }
    },
    description: "Maximum loan term value"
  },
  MIN_TERM_MONTHS: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'min_term_months',
    description: "Minimum term in months"
  },
  MAX_TERM_MONTHS: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'max_term_months',
    description: "Maximum term in months"
  },
  TERM_TYPE: {
    type: DataTypes.ENUM('DAYS', 'WEEKS', 'MONTHS', 'QUARTERS', 'YEARS'),
    allowNull: false,
    defaultValue: 'MONTHS',
    field: 'term_type',
    description: "Unit for term values"
  },
  
  // Accrual Configuration
  ACCRUAL_BASIS: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'ACTUAL/360',
    field: 'accrual_basis',
    description: "Day count convention for interest accrual"
  },
  ACCRUAL_FREQUENCY: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'DAILY',
    field: 'accrual_frequency',
    description: "Frequency of interest accrual"
  },
  
  // Loan Amount Constraints
  MIN_LOAN_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'min_loan_amount'
  },
  MAX_LOAN_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 1000000000.00,
    field: 'max_loan_amount'
  },
  
  // Capitalization
  CAPITALIZE_INTEREST: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'capitalize_interest',
    description: "Whether to capitalize unpaid interest"
  },
  COMPOUNDING_FREQUENCY: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'MONTHLY',
    field: 'compounding_frequency'
  },
  
  // Amortization
  AMORTIZED: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'amortized',
    description: "Whether loan is amortized"
  },
  REPAYMENT_FREQUENCY: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'MONTHLY',
    field: 'repayment_frequency'
  },
  
  // Rate Change Rules
  RATE_CHANGE_ALLOWED: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'rate_change_allowed',
    description: "Whether rate changes are allowed after loan disbursement"
  },
  RATE_CHANGE_NOTICE_DAYS: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 30,
    field: 'rate_change_notice_days',
    validate: {
      min: { args: [0], msg: 'Rate change notice cannot be negative' }
    },
    description: "Notice period required for rate changes (days)"
  },
  MAX_RATE_CHANGES: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'max_rate_changes',
    validate: {
      min: { args: [0], msg: 'Maximum rate changes cannot be negative' }
    },
    description: "Maximum number of rate changes allowed"
  },
  
  // Fees
  ORIGINATION_FEE_RATE: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'origination_fee_rate',
    validate: {
      min: { args: [0], msg: 'Origination fee rate must be non-negative' },
      max: { args: [100], msg: 'Origination fee rate cannot exceed 100%' }
    },
    description: "Origination fee as percentage of loan amount"
  },
  PROCESSING_FEE_FIXED: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'processing_fee_fixed'
  },
  LATE_PAYMENT_PENALTY_RATE: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'late_payment_penalty_rate',
    validate: {
      min: { args: [0], msg: 'Late payment penalty must be non-negative' },
      max: { args: [100], msg: 'Late payment penalty cannot exceed 100%' }
    },
    description: "Late payment penalty rate (%)"
  },
  EARLY_REPAYMENT_PENALTY_RATE: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'early_repayment_penalty_rate',
    validate: {
      min: { args: [0], msg: 'Early repayment penalty must be non-negative' },
      max: { args: [100], msg: 'Early repayment penalty cannot exceed 100%' }
    },
    description: "Early repayment penalty rate (%)"
  },
  
  // Tiered Rates (for TIERED rate type)
  TIERED_RATES: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'tiered_rates',
    description: "Array of tiered rate structures"
  },
  
  // Effective Dates
  EFFECTIVE_DATE: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'effective_date',
    description: "Date when this rate becomes effective"
  },
  EXPIRY_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expiry_date',
    description: "Date when this rate expires"
  },
  
  // Status
  STATUS: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'DRAFT', 'PENDING', 'EXPIRED', 'DELETED'),
    allowNull: false,
    defaultValue: 'DRAFT'
  },
  
  // Audit Fields
  CREATED_BY: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'created_by'
  },
  CREATED_AT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  UPDATED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'updated_by'
  },
  UPDATED_AT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  },
  LAST_UPDATED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'last_updated_by'
  },
  
  // Metadata
  VERSION: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '1.0',
    field: 'version'
  },
  TAGS: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    field: 'tags'
  },
  NOTES: {
    type: DataTypes.TEXT,
    allowNull: true,
    trim: true,
    field: 'notes'
  },
  IS_ACTIVE: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_active'
  },
  IS_FLAT_RATE: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_flat_rate',
    description: "Indicates if this is a flat rate product"
  }
}, {
  tableName: 'loan_interest_rates',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,
  freezeTableName: true,
  
  // REMOVED OR SIMPLIFIED INDEXES - THIS IS THE KEY FIX
  indexes: [
    // Only essential indexes
    {
      unique: true,
      fields: ['code'],
      name: 'idx_code_unique'
    },
    {
      fields: ['STATUS'],
      name: 'idx_status'
    },
    {
      fields: ['RATE_TYPE'],
      name: 'idx_rate_type'
    },
    {
      fields: ['IS_ACTIVE'],
      name: 'idx_is_active'
    }
    // REMOVED all other indexes to prevent the 64-key limit issue
  ],
  
  hooks: {
    beforeCreate: (rate, options) => {
      // Set IS_ACTIVE based on STATUS
      rate.IS_ACTIVE = rate.STATUS === 'ACTIVE';
      
      // Calculate term months if not provided
      if (!rate.MIN_TERM_MONTHS) {
        rate.MIN_TERM_MONTHS = convertTermToMonths(rate.MIN_TERM_VALUE, rate.TERM_TYPE);
      }
      if (!rate.MAX_TERM_MONTHS) {
        rate.MAX_TERM_MONTHS = convertTermToMonths(rate.MAX_TERM_VALUE, rate.TERM_TYPE);
      }
      
      // Set flat rate flag
      rate.IS_FLAT_RATE = rate.CALCULATION_METHOD === 'FLAT' && rate.INTEREST_TYPE === 'SIMPLE';
      
      // Calculate total interest rate if not provided
      if (!rate.TOTAL_INTEREST_RATE && rate.DEFAULT_RATE_PER_MONTH && rate.MAX_TERM_VALUE) {
        rate.TOTAL_INTEREST_RATE = parseFloat(rate.DEFAULT_RATE_PER_MONTH) * parseInt(rate.MAX_TERM_VALUE);
      }
    },
    
    beforeUpdate: (rate, options) => {
      // Set IS_ACTIVE based on STATUS
      rate.IS_ACTIVE = rate.STATUS === 'ACTIVE';
      
      // Update flat rate flag
      rate.IS_FLAT_RATE = rate.CALCULATION_METHOD === 'FLAT' && rate.INTEREST_TYPE === 'SIMPLE';
      
      // Update term months if term values changed
      if (rate.changed('MIN_TERM_VALUE') || rate.changed('TERM_TYPE')) {
        rate.MIN_TERM_MONTHS = convertTermToMonths(rate.MIN_TERM_VALUE, rate.TERM_TYPE);
      }
      if (rate.changed('MAX_TERM_VALUE') || rate.changed('TERM_TYPE')) {
        rate.MAX_TERM_MONTHS = convertTermToMonths(rate.MAX_TERM_VALUE, rate.TERM_TYPE);
      }
      
      // Update total interest rate if default rate or max term changed
      if (rate.changed('DEFAULT_RATE_PER_MONTH') || rate.changed('MAX_TERM_VALUE')) {
        rate.TOTAL_INTEREST_RATE = parseFloat(rate.DEFAULT_RATE_PER_MONTH) * parseInt(rate.MAX_TERM_VALUE);
      }
      
      // Set UPDATED_BY if not set
      if (!rate.UPDATED_BY && rate.CREATED_BY) {
        rate.UPDATED_BY = rate.CREATED_BY;
      }
    }
  },
  
  getterMethods: {
    termRangeMonths() {
      return `${this.MIN_TERM_MONTHS} - ${this.MAX_TERM_MONTHS} months`;
    },
    
    termRangeFormatted() {
      return `${this.MIN_TERM_VALUE} - ${this.MAX_TERM_VALUE} ${this.TERM_TYPE.toLowerCase()}`;
    },
    
    annualRate() {
      return (parseFloat(this.DEFAULT_RATE_PER_MONTH || 0) * 12).toFixed(2);
    },
    
    rateDescription() {
      let desc = `${this.name}: ${parseFloat(this.DEFAULT_RATE_PER_MONTH || 0).toFixed(2)}% per month`;
      
      if (this.RATE_TYPE === 'VARIABLE') {
        desc += ` (Variable - based on index + ${parseFloat(this.MARGIN_RATE || 0).toFixed(2)}% margin)`;
      }
      
      return desc;
    }
  }
});

// ==================== MANUAL TABLE INITIALIZATION ====================

/**
 * Manual table creation function to avoid Sequelize sync issues
 */
LoanInterestRate.initializeTable = async function() {
  try {
    console.log('=== INITIALIZING LOAN_INTEREST_RATES TABLE (MANUAL MODE) ===');
    
    // Check if table exists
    const [results] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = 'loan_interest_rates'
    `);
    
    if (results[0].count === 0) {
      console.log('Creating loan_interest_rates table...');
      
      await sequelize.query(`
        CREATE TABLE loan_interest_rates (
          id INT PRIMARY KEY AUTO_INCREMENT,
          loan_proud_int_id INT,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          code VARCHAR(50) NOT NULL UNIQUE,
          rate_type ENUM('FIXED', 'VARIABLE', 'TIERED', 'PROMOTIONAL', 'INTRODUCTORY') DEFAULT 'FIXED',
          interest_type ENUM('SIMPLE', 'COMPOUND') DEFAULT 'SIMPLE',
          calculation_method ENUM('FLAT', 'REDUCING_BALANCE', 'RULE_OF_78') DEFAULT 'FLAT',
          min_rate_per_month DECIMAL(10,4) DEFAULT 0.0000,
          max_rate_per_month DECIMAL(10,4) DEFAULT 100.0000,
          default_rate_per_month DECIMAL(10,4) DEFAULT 1.0000,
          annual_percentage_rate DECIMAL(10,4),
          total_interest_rate DECIMAL(10,4),
          index_rate_id INT,
          margin_rate DECIMAL(10,4) DEFAULT 0.0000,
          spread_rate DECIMAL(10,4) DEFAULT 0.0000,
          min_term_value INT DEFAULT 1,
          max_term_value INT DEFAULT 60,
          min_term_months INT,
          max_term_months INT,
          term_type ENUM('DAYS', 'WEEKS', 'MONTHS', 'QUARTERS', 'YEARS') DEFAULT 'MONTHS',
          accrual_basis VARCHAR(50) DEFAULT 'ACTUAL/360',
          accrual_frequency VARCHAR(50) DEFAULT 'DAILY',
          min_loan_amount DECIMAL(20,2) DEFAULT 0.00,
          max_loan_amount DECIMAL(20,2) DEFAULT 1000000000.00,
          capitalize_interest BOOLEAN DEFAULT FALSE,
          compounding_frequency VARCHAR(50) DEFAULT 'MONTHLY',
          amortized BOOLEAN DEFAULT TRUE,
          repayment_frequency VARCHAR(50) DEFAULT 'MONTHLY',
          rate_change_allowed BOOLEAN DEFAULT FALSE,
          rate_change_notice_days INT DEFAULT 30,
          max_rate_changes INT DEFAULT 1,
          origination_fee_rate DECIMAL(10,4) DEFAULT 0.0000,
          processing_fee_fixed DECIMAL(20,2) DEFAULT 0.00,
          late_payment_penalty_rate DECIMAL(10,4) DEFAULT 0.0000,
          early_repayment_penalty_rate DECIMAL(10,4) DEFAULT 0.0000,
          tiered_rates JSON,
          effective_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          expiry_date DATETIME,
          status ENUM('ACTIVE', 'INACTIVE', 'DRAFT', 'PENDING', 'EXPIRED', 'DELETED') DEFAULT 'DRAFT',
          created_by VARCHAR(100) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_by VARCHAR(100),
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          last_updated_by VARCHAR(100),
          version VARCHAR(20) DEFAULT '1.0',
          tags JSON,
          notes TEXT,
          is_active BOOLEAN DEFAULT FALSE,
          is_flat_rate BOOLEAN DEFAULT FALSE,
          INDEX idx_code_unique (code),
          INDEX idx_status (status),
          INDEX idx_rate_type (rate_type),
          INDEX idx_is_active (is_active)
        )
      `);
      
      console.log('✅ loan_interest_rates table created successfully');
    } else {
      console.log('✅ loan_interest_rates table already exists');
      
      // Check if we need to add unique constraint on code
      try {
        const [indexInfo] = await sequelize.query(`
          SHOW INDEX FROM loan_interest_rates 
          WHERE Column_name = 'code' AND Non_unique = 0
        `);
        
        if (!indexInfo || indexInfo.length === 0) {
          console.log('Adding unique constraint to code column...');
          await sequelize.query(`
            ALTER TABLE loan_interest_rates 
            ADD UNIQUE INDEX idx_code_unique (code)
          `);
          console.log('✅ Unique constraint added to code column');
        }
      } catch (error) {
        console.log('Note: Unique constraint on code may already exist');
      }
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to initialize loan_interest_rates table:', error.message);
    return false;
  }
};

// ==================== FIX COLUMN NAMES ====================

/**
 * Function to fix the weird column names (with underscores between each letter)
 */
LoanInterestRate.fixColumnNames = async function() {
  try {
    console.log('🛠️ Fixing column names in loan_interest_rates table...');
    
    const renameQueries = [
      // Check if weird columns exist and rename them
      `ALTER TABLE loan_interest_rates 
       CHANGE COLUMN IF EXISTS \`l_o_a_n__p_r_o_u_d__i_n_t__i_d\` \`loan_proud_int_id\` INT`,
       
      `ALTER TABLE loan_interest_rates 
       CHANGE COLUMN IF EXISTS \`r_a_t_e__t_y_p_e\` \`rate_type\` ENUM('FIXED', 'VARIABLE', 'TIERED', 'PROMOTIONAL', 'INTRODUCTORY')`,
       
      `ALTER TABLE loan_interest_rates 
       CHANGE COLUMN IF EXISTS \`i_n_t_e_r_e_s_t__t_y_p_e\` \`interest_type\` ENUM('SIMPLE', 'COMPOUND')`,
       
      `ALTER TABLE loan_interest_rates 
       CHANGE COLUMN IF EXISTS \`c_a_l_c_u_l_a_t_i_o_n__m_e_t_h_o_d\` \`calculation_method\` ENUM('FLAT', 'REDUCING_BALANCE', 'RULE_OF_78')`,
       
      `ALTER TABLE loan_interest_rates 
       CHANGE COLUMN IF EXISTS \`m_i_n__r_a_t_e__p_e_r__m_o_n_t_h\` \`min_rate_per_month\` DECIMAL(10,4)`,
       
      `ALTER TABLE loan_interest_rates 
       CHANGE COLUMN IF EXISTS \`m_a_x__r_a_t_e__p_e_r__m_o_n_t_h\` \`max_rate_per_month\` DECIMAL(10,4)`,
       
      `ALTER TABLE loan_interest_rates 
       CHANGE COLUMN IF EXISTS \`d_e_f_a_u_l_t__r_a_t_e__p_e_r__m_o_n_t_h\` \`default_rate_per_month\` DECIMAL(10,4)`,
       
      `ALTER TABLE loan_interest_rates 
       CHANGE COLUMN IF EXISTS \`a_n_n_u_a_l__p_e_r_c_e_n_t_a_g_e__r_a_t_e\` \`annual_percentage_rate\` DECIMAL(10,4)`
    ];
    
    for (const query of renameQueries) {
      try {
        await sequelize.query(query);
        console.log(`✅ Executed: ${query.split('IF EXISTS')[1]?.split('`')[1] || 'rename query'}`);
      } catch (error) {
        // Column may not exist or already renamed
        console.log(`ℹ️ Skipping: ${error.message}`);
      }
    }
    
    console.log('✅ Column names fixed successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Failed to fix column names:', error.message);
    return false;
  }
};

// ==================== SAFE SYNC FUNCTION ====================

/**
 * Safe sync function that uses manual initialization
 */
LoanInterestRate.syncTable = async function(options = {}) {
  try {
    console.log('🔧 Syncing LoanInterestRate table (safe mode)...');
    
    // Always use manual initialization to avoid ALTER issues
    await LoanInterestRate.initializeTable();
    
    // Try to fix column names if needed
    if (options.fixColumns) {
      await LoanInterestRate.fixColumnNames();
    }
    
    console.log('✅ LoanInterestRate table synced successfully (safe mode)');
    return true;
    
  } catch (error) {
    console.error('❌ Table sync failed:', error);
    throw error;
  }
};

// ==================== INITIALIZATION ====================

/**
 * Initialize the model
 */
LoanInterestRate.initialize = async function() {
  try {
    console.log('🚀 Initializing LoanInterestRate model...');
    
    // Use manual table initialization
    await LoanInterestRate.initializeTable();
    
    // Optional: fix column names
    if (process.env.FIX_COLUMN_NAMES === 'true') {
      await LoanInterestRate.fixColumnNames();
    }
    
    console.log('✅ LoanInterestRate model initialized successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Failed to initialize LoanInterestRate model:', error.message);
    return false;
  }
};

// ==================== EXPORT ====================

export default LoanInterestRate;
export { LoanInterestRate, convertTermToMonths };