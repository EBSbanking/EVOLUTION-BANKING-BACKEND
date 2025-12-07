// models/GLAccount.js
import mongoose from 'mongoose';

const LegacyAccountReferenceSchema = new mongoose.Schema({
  legacyId: { type: String, required: true },
  legacyGLCode: { type: String, required: true },
  legacyName: { type: String, required: true },
  legacyType: { type: String, required: true },
  legacyAccountUsage: { type: String, required: true },
  legacyGLGroup: { type: String, default: null },
  legacyBalance: { type: Number, default: 0 },
  legacyUnreconciledBalance: { type: Number, default: 0 },
  migratedAt: { type: Date, default: Date.now },
  migrationVersion: { type: String, default: '1.0' },
  migrationBatchId: { type: String, default: null },
  balanceMigrated: { type: Boolean, default: false }
}, { _id: false });

const BalanceHistorySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  ledgerBalance: Number,
  availableBalance: Number,
  transactionId: String,
  description: String,
  changeType: {
    type: String,
    enum: ['MIGRATION', 'TRANSACTION', 'ADJUSTMENT', 'RECONCILIATION', 'OPENING_BALANCE']
  },
  createdBy: String,
  reference: String,
  metadata: mongoose.Schema.Types.Mixed
}, { _id: false });

const EmbeddedTransactionSchema = new mongoose.Schema({
  JOURNAL_ID: { type: String, required: true },
  TRANSACTION_ID: { type: String, required: true },
  TYPE: { type: String, enum: ['DEBIT', 'CREDIT'], required: true },
  AMOUNT: { type: Number, required: true, min: 0 },
  NARRATION: { type: String, required: true },
  CREATED_BY: { type: String, required: true },
  CREATED_AT: { type: Date, default: Date.now, required: true },
  branchCode: { type: String, required: true },
  organizationCode: { type: Number, required: true },
  systemSource: { 
    type: String, 
    enum: ['LEGACY', 'NEW_SYSTEM', 'MIGRATED'],
    default: 'NEW_SYSTEM'
  },
  legacyReference: {
    legacyTransactionId: String,
    legacyJournalId: String
  },
  balanceImpact: {
    previousLedgerBalance: Number,
    newLedgerBalance: Number,
    previousAvailableBalance: Number,
    newAvailableBalance: Number
  }
}, { _id: false });

// NEW: Chart of Accounts Segment Schema
const COASegmentSchema = new mongoose.Schema({
  entity: { 
    type: String, 
    required: true,
    validate: {
      validator: function(v) {
        return /^\d{2}$/.test(v); // 2-digit entity code
      },
      message: 'Entity must be a 2-digit number'
    }
  },
  branch: { 
    type: String, 
    required: true,
    validate: {
      validator: function(v) {
        return /^\d{3}$/.test(v); // 3-digit branch code
      },
      message: 'Branch must be a 3-digit number'
    }
  },
  accountClass: { 
    type: String, 
    required: true,
    validate: {
      validator: function(v) {
        return /^\d{3}$/.test(v); // 3-digit account class
      },
      message: 'Account class must be a 3-digit number'
    }
  },
  accountType: { 
    type: String, 
    required: true,
    validate: {
      validator: function(v) {
        return /^\d{3}$/.test(v); // 3-digit account type
      },
      message: 'Account type must be a 3-digit number'
    }
  },
  subAccount: { 
    type: String, 
    default: '000',
    validate: {
      validator: function(v) {
        return /^\d{3}$/.test(v); // 3-digit sub-account
      },
      message: 'Sub-account must be a 3-digit number'
    }
  }
}, { _id: false });

const GLAccountSchema = new mongoose.Schema({
  // ==================== CORE IDENTIFIERS ====================
  GL_ACCT_NO: { 
    type: String, 
    required: true,
  },
  GL_ACCT_ID: { 
    type: String, 
    required: true,
  },
  CREATED_BY: { type: String, required: true },
  
  // TEMPORARY: Add this field to stop the error
  createdBy: { type: String }, // ← ADDED TEMPORARILY
  
  // ==================== CHART OF ACCOUNTS STRUCTURE ====================
  coaStructure: {
    // Standard COA segments (Entity-Branch-Class-Type-SubAccount)
    segments: {
      type: COASegmentSchema,
      required: true
    },
    
    // Financial statement classification - UPDATED to match frontend
    financialStatement: {
      type: {
        type: String,
        enum: ['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'EQUITY'],
        required: true
      },
  category: {
  type: String,
  enum: [
    // ===================================================================
    // ASSETS
    // ===================================================================
    'CASH_AND_CASH_EQUIVALENTS',
    'DUE_FROM_BANKS',
    'CASH_ACCOUNT',
    'BANK_ACCOUNT',
    'TRADING_SECURITIES',
    'DERIVATIVE_ASSETS',
    'LOANS_AND_ADVANCES',
    'LOAN_PORTFOLIO_GROSS',
    'LOAN_PORTFOLIO',
    'NET_LOANS_AND_ADVANCES',
    'LOAN_ASSET',
    'LOAN_RECEIVABLE',
    'CUSTOMER_ACCOUNT',
    'INVESTMENT_SECURITIES_HTM',
    'INVESTMENT_SECURITIES_AFS',
    'INVESTMENT_SECURITIES_FVPL',
    'INVESTMENT_ASSET',
    'INVESTMENTS_IN_SUBSIDIARIES',
    'INVESTMENTS_IN_ASSOCIATES',
    'INVESTMENT_PROPERTY',
    'PROPERTY_PLANT_AND_EQUIPMENT',
    'FIXED_ASSET',
    'RIGHT_OF_USE_ASSETS',
    'LEASE_ASSET',
    'INTANGIBLE_ASSETS',
    'INTANGIBLE_ASSET',
    'GOODWILL',
    'DEFERRED_TAX_ASSETS',
    'DEFERRED_TAX_ASSET',
    'ACCRUED_INCOME_RECEIVABLE',
    'INTEREST_RECEIVABLE',
    'ACCRUED_INTEREST',
    'FEE_AND_COMMISSION_RECEIVABLE',
    'FEE_RECEIVABLE',
    'RECEIVABLE_ACCOUNT',
    'PREPAYMENTS_AND_OTHER_ASSETS',
    'PREPAID_EXPENSE',
    'INVENTORY',
    'FORECLOSURE_ASSETS',
    'OTHER_ASSETS',
    'OTHER_ASSET',
    'CURRENT_ASSET',
    'SUSPENSE_ASSETS',
    'CLEARING_AND_SETTLEMENT_ASSETS',
    'INTERBRANCH_ASSETS',
    'INTER_BRANCH',

    // ===================================================================
    // LIABILITIES
    // ===================================================================
    'CUSTOMER_DEPOSITS',
    'SAVINGS_DEPOSITS',
    'CURRENT_AND_DEMAND_DEPOSITS',
    'TIME_AND_FIXED_DEPOSITS',
    'TIME_DEPOSITS',
    'DEPOSITS_LIABILITY',
    'DUE_TO_BANKS',
    'BORROWINGS_FROM_CENTRAL_BANK',
    'BORROWINGS_FROM_OTHER_BANKS',
    'BORROWINGS',
    'LOAN_LIABILITY',
    'SUBORDINATED_DEBT',
    'DEBT_SECURITIES_ISSUED',
    'BONDS_PAYABLE',
    'DERIVATIVE_LIABILITIES',
    'INTEREST_PAYABLE',
    'ACCRUED_EXPENSES_PAYABLE',
    'ACCRUED_EXPENSES',
    'DIVIDENDS_PAYABLE',
    'DIVIDEND_PAYABLE',
    'TAX_PAYABLE',
    'DEFERRED_TAX_LIABILITIES',
    'DEFERRED_TAX_LIABILITY',
    'LEASE_LIABILITIES',
    'LEASE_LIABILITY',
    'PROVISIONS_AND_CONTINGENCIES',
    'PROVISIONS',
    'EMPLOYEE_BENEFIT_LIABILITIES',
    'UNEARNED_REVENUE',
    'PAYABLE_ACCOUNT',
    'CURRENT_LIABILITY',
    'LONG_TERM_LIABILITY',
    'OTHER_LIABILITIES',
    'OTHER_LIABILITY',
    'LIABILITY_ACCOUNT',
    'SUSPENSE_LIABILITIES',
    'CLEARING_AND_SETTLEMENT_LIABILITIES',
    'INTERBRANCH_LIABILITIES',

    // ===================================================================
    // EQUITY
    // ===================================================================
    'SHARE_CAPITAL',
    'SHARE_PREMIUM',
    'CAPITAL_ACCOUNT',
    'RETAINED_EARNINGS',
    'STATUTORY_RESERVE',
    'GENERAL_RISK_RESERVE',
    'REVALUATION_RESERVE',
    'FAIR_VALUE_RESERVE',
    'FOREIGN_CURRENCY_TRANSLATION_RESERVE',
    'OTHER_COMPREHENSIVE_INCOME',
    'TREASURY_SHARES',
    'TREASURY_STOCK',
    'CAPITAL_RESERVE',
    'DONATED_CAPITAL',
    'OTHER_EQUITY_COMPONENTS',
    'OTHER_EQUITY',
    'EQUITY_ACCOUNT',
    'ADDITIONAL_PAID_IN_CAPITAL',

    // ===================================================================
    // REVENUE
    // ===================================================================
    'INTEREST_INCOME_LOANS',
    'INTEREST_INCOME_INVESTMENTS',
    'INTEREST_INCOME_PLACEMENTS',
    'LOAN_INTEREST_INCOME',
    'INVESTMENT_INTEREST_INCOME',
    'INTEREST_INCOME',
    'FEE_AND_COMMISSION_INCOME',
    'FEE_INCOME',
    'PROCESSING_FEE',
    'INSURANCE_FEE',
    'UPFRONT_INTEREST',
    'OTHER_FEES',
    'COMMISSION_INCOME',
    'TRADING_INCOME',
    'FOREIGN_EXCHANGE_INCOME',
    'FOREIGN_EXCHANGE_GAIN',
    'DIVIDEND_INCOME',
    'RENTAL_INCOME',
    'GAIN_ON_SALE_OF_ASSETS',
    'REALIZED_GAIN',
    'UNREALIZED_GAIN',
    'RECOVERIES_ON_LOANS_WRITTEN_OFF',
    'LATE_FEE_INCOME',
    'PENALTY_INCOME',
    'SERVICE_INCOME',
    'SALES_REVENUE',
    'OTHER_OPERATING_INCOME',
    'OTHER_REVENUE',
    'OPERATING_REVENUE',
    'REVENUE_ACCOUNT',
    'NON_OPERATING_INCOME',

    // ===================================================================
    // EXPENSES
    // ===================================================================
    'INTEREST_EXPENSE_DEPOSITS',
    'INTEREST_EXPENSE_BORROWINGS',
    'INTEREST_EXPENSE',
    'FEE_AND_COMMISSION_EXPENSE',
    'LOAN_LOSS_PROVISION_EXPENSE',
    'IMPAIRMENT_LOSSES',
    'LOAN_LOSS_PROVISION',
    'BAD_DEBT_EXPENSE',
    'STAFF_COSTS',
    'STAFF_EXPENSE',
    'SALARIES_WAGES',
    'EMPLOYEE_BENEFITS',
    'DEPRECIATION_EXPENSE',
    'AMORTIZATION_EXPENSE',
    'OCCUPANCY_COSTS',
    'RENT_EXPENSE',
    'UTILITIES_EXPENSE',
    'IT_AND_COMMUNICATION_EXPENSES',
    'MARKETING_AND_ADVERTISING',
    'MARKETING_EXPENSE',
    'PROFESSIONAL_AND_LEGAL_FEES',
    'PROFESSIONAL_FEES',
    'TRAVEL_AND_ENTERTAINMENT',
    'TRAVEL_EXPENSE',
    'INSURANCE_EXPENSE',
    'REPAIRS_AND_MAINTENANCE',
    'REPAIRS_MAINTENANCE',
    'ADMINISTRATIVE_EXPENSES',
    'ADMINISTRATIVE_EXPENSE',
    'ADMIN_EXPENSE',
    'OTHER_OPERATING_EXPENSES',
    'OTHER_EXPENSE',
    'FINANCE_COST',
    'BORROWING_COST',
    'FOREIGN_EXCHANGE_LOSS',
    'LOSS_ON_SALE_OF_ASSETS',
    'TAX_EXPENSE',
    'NON_OPERATING_EXPENSES',
    'OPERATING_EXPENSE',
    'EXPENSE_ACCOUNT',

    // ===================================================================
    // CONTROL, SUSPENSE & SPECIAL PURPOSE
    // ===================================================================
    'CONTROL_ACCOUNTS',
    'CONTROL_ACCOUNT',
    'SUSPENSE_ACCOUNTS',
    'SUSPENSE_ACCOUNT',
    'CLEARING_ACCOUNTS',
    'CLEARING_ACCOUNT',
    'TRANSIT_ACCOUNTS',
    'INTERCOMPANY_ACCOUNTS',
    'INTERCOMPANY_ACCOUNT',
    'RECONCILIATION_ACCOUNTS',
    'RECONCILIATION_ACCOUNT',
    'UNAPPLIED_FUNDS',
    'UNCLEARED_EFFECTS',
    'LOAN_SUSPENSE',
    'INTEREST_SUSPENSE',
    'FEE_SUSPENSE',
    'UNEARNED_INTEREST',
    'LOAN_DISBURSEMENT_CONTROL',
    'LOAN_REPAYMENT_CONTROL',
    'LOAN_CHARGE_OFF',
    'PROVISION_FOR_LOAN_LOSSES',
    'RECOVERIES_ACCOUNT',
    'DELINQUENT_LOAN_ACCOUNT',
    'RESTRUCTURED_LOAN_ACCOUNT',
    'HEAD_OFFICE_BRANCH_ACCOUNT',
    'NOSTRO_ACCOUNTS',
    'NOSTRO_ACCOUNT',
    'VOSTRO_ACCOUNTS',
    'VOSTRO_ACCOUNT',
    'MEMORANDUM_ACCOUNTS',
    'MEMORANDUM_ACCOUNT',
    'OFF_BALANCE_SHEET_COMMITMENTS',
    'OFF_BALANCE_SHEET_ACCOUNT',
    'CONTINGENT_LIABILITIES',
    'CONTINGENT_ACCOUNT',

    // ===================================================================
    // TAX & REGULATORY
    // ===================================================================
    'WITHHOLDING_TAX_PAYABLE',
    'VAT_PAYABLE',
    'INCOME_TAX_PAYABLE',
    'DEFERRED_TAX_PAYABLE',
    'DEFERRED_TAX',
    'TAX_EXPENSE_ACCOUNTS',
    'OTHER_TAX_ACCOUNTS',
    'REGULATORY_RESERVE_ACCOUNTS',
    'CAPITAL_ADEQUACY_RESERVE',
    'CREDIT_RISK_RESERVE',
    'LIQUIDITY_RESERVE',
    'STATUTORY_DEPOSITS_WITH_CBN',
    'CBN_CRR_ACCOUNT',
    'CBN_LIQUIDITY_RATIO_ACCOUNT',
    'OTHER_REGULATORY_ACCOUNTS',

    // ===================================================================
    // CONTRA ACCOUNTS
    // ===================================================================
    'LOAN_LOSS_PROVISIONS',
    'CONTRA_ASSET_ACCOUNTS',
    'CONTRA_LIABILITY_ACCOUNTS',
    'CONTRA_ASSET',
    'CONTRA_LIABILITY',
     'WITHHOLDING_TAX_PAYABLE', // Add the ones you know you'll use
  'BALANCE_SHEET',
  'INCOME_STATEMENT',

    // ===================================================================
    // CASH FLOW (Reporting Only)
    // ===================================================================
    'CASH_FLOWS_FROM_OPERATING_ACTIVITIES',
    'CASH_FLOWS_FROM_INVESTING_ACTIVITIES',
    'CASH_FLOWS_FROM_FINANCING_ACTIVITIES'
  ],
  required: true,
  index: true // Recommended: speeds up queries on category
},
subCategory: { type: String }, // Optional: e.g., "Retail Loans", "Corporate Loans", "Overdrafts"
      subCategory: { type: String } // More detailed classification
    },
    
    // Account hierarchy
    hierarchy: {
      level: {
        type: Number,
        enum: [1, 2, 3, 4, 5], // 1=Main, 2=Group, 3=Category, 4=Sub-category, 5=Detail
        required: true,
        default: 5
      },
      parentAccountNo: { type: String }, // Reference to parent GL_ACCT_NO
      isControlAccount: { type: Boolean, default: false },
      isSummaryAccount: { type: Boolean, default: false },
      childAccounts: [{ type: String }] // Array of child GL_ACCT_NOs
    },
    
    // Accounting properties
    accounting: {
      normalBalance: {
        type: String,
        enum: ['DEBIT', 'CREDIT'],
        required: true
      },
      balanceType: {
        type: String,
        enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
        required: true
      },
      isTemporary: { type: Boolean, default: false }, // Revenue/Expense accounts
      isPermanent: { type: Boolean, default: true }, // Asset/Liability/Equity accounts
      requiresClosing: { type: Boolean, default: false } // For temporary accounts
    }
  },
  
  // ==================== BRANCH & ORGANIZATION ====================
  organizationName: { 
    type: String, 
    required: true,
  },
  organizationCode: { 
    type: Number, 
    required: true,
  },
  branchName: { 
    type: String, 
    required: true,
  },
  branchCode: { 
    type: String, 
    required: true,
  },
  branchType: {
    type: String,
    enum: ['MAIN', 'REGIONAL', 'SUB', 'MOBILE'],
    default: 'MAIN'
  },
  
  // ==================== ACCOUNT CLASSIFICATION ====================
  categoryCode: { type: String },
  categoryName: { type: String, default: 'Default Category' },
  parentCode: { type: String, default: null },
  level: { type: Number, required: true },
  
  // ==================== ACCOUNT STRUCTURE ====================
  LEDGER_NO: { type: String, required: true },
  PARENT_ID: { type: mongoose.Schema.Types.ObjectId, default: null },
  subfolderId: { type: String, required: true },
  BAL_CD: { type: String, required: true },
  SUB_LEDGER_NO: { type: String, required: true },
  SEG_NO: { type: Number, default: 1 },
  CHART_OF_ACCT_ID: { type: String, required: true },
  ACCT_DESC: { type: String, required: true },
  GL_ACCT_CAT: { type: String, required: true },
  
  // ==================== TRANSACTION & POSTING CONTROLS ====================
  JOURNAL_ID: { type: String, default: null },
  TRANSACTION_TYPE: { type: String, default: 'Asset Balance' },
  CR_ALLOWED: { type: Boolean, default: true },
  DR_ALLOWED: { type: Boolean, default: true },
  REC_ST: { 
    type: String, 
    default: 'Active', 
    enum: ['Active', 'Inactive', 'Suspended', 'Closed'],
  },
  POST_ALLOW: { type: Boolean, default: true },
  POST_FG: { type: Boolean, default: false },
  CONTROL_ACCT_FG: { type: Boolean, default: false },
  SUSPENSE_ACCT_FG: { type: Boolean, default: false },
  ALLOW_BAL_SWING_FG: { type: Boolean, default: false },
  
  // ==================== SEGMENTATION ====================
  SEG_VALUE: { type: String, default: '' },
  SEG_DESC: { type: String, default: 'Default Description' },
  SEG_TY_CD: { type: String, default: '' },
  SEG_PLACEHLDR_ID: { type: String, default: '' },
  DELAY_GL_POSTING: { type: Boolean, default: false },
  
  // ==================== FINANCIAL DATA ====================
  LEDGER_BALANCE: { 
    type: Number, 
    default: 0,
    set: function(value) {
      this._previousLedgerBalance = this.LEDGER_BALANCE;
      return value;
    }
  },
  AVAILABLE_BALANCE: { 
    type: Number, 
    default: 0,
    set: function(value) {
      this._previousAvailableBalance = this.AVAILABLE_BALANCE;
      return value;
    }
  },
  OPENING_BALANCE: { type: Number, default: 0 },
  CURRENT_BALANCE: { type: Number, default: 0 },
  CURRENCY_CODE: { type: String, default: 'NGN' },
  
  // ==================== HISTORY & AUDIT ====================
  balanceHistory: [BalanceHistorySchema],
  transactions: [EmbeddedTransactionSchema],
  
  // ==================== SETTLEMENT & REFERENCES ====================
  SETTLEMENT_GL_ACCT_NO: { type: String, default: null },
  INTER_BRANCH_ACCOUNT: { type: Boolean, default: false },
  
  // ==================== LEGACY SYSTEM COMPATIBILITY ====================
  legacyReference: LegacyAccountReferenceSchema,
  systemSource: {
    type: String,
    enum: ['LEGACY', 'NEW_SYSTEM', 'MIGRATED'],
    default: 'NEW_SYSTEM'
  },
  
  // ==================== SYNC STATUS ====================
  syncStatus: {
    lastSynced: Date,
    syncRequired: { type: Boolean, default: false },
    legacyBalance: Number,
    currentBalance: Number,
    balanceDifference: Number,
    lastSyncError: String,
    syncAttempts: { type: Number, default: 0 },
    balanceReconciled: { type: Boolean, default: false },
    reconciliationDate: Date,
    lastReconciliationId: String
  },

  // ==================== METADATA - FULLY UPDATED TO MATCH FRONTEND ====================
  metadata: {
    accountType: { 
      type: String, 
      required: true,
       enum: [
    // ===================================================================
    // ASSETS
    // ===================================================================
    'CASH_AND_CASH_EQUIVALENTS',
    'DUE_FROM_BANKS',
    'CASH_ACCOUNT',
    'BANK_ACCOUNT',
    'TRADING_SECURITIES',
    'DERIVATIVE_ASSETS',
    'LOANS_AND_ADVANCES',
    'LOAN_PORTFOLIO_GROSS',
    'LOAN_PORTFOLIO',
    'NET_LOANS_AND_ADVANCES',
    'LOAN_ASSET',
    'LOAN_RECEIVABLE',
    'CUSTOMER_ACCOUNT',
    'INVESTMENT_SECURITIES_HTM',
    'INVESTMENT_SECURITIES_AFS',
    'INVESTMENT_SECURITIES_FVPL',
    'INVESTMENT_ASSET',
    'INVESTMENTS_IN_SUBSIDIARIES',
    'INVESTMENTS_IN_ASSOCIATES',
    'INVESTMENT_PROPERTY',
    'PROPERTY_PLANT_AND_EQUIPMENT',
    'FIXED_ASSET',
    'RIGHT_OF_USE_ASSETS',
    'LEASE_ASSET',
    'INTANGIBLE_ASSETS',
    'INTANGIBLE_ASSET',
    'GOODWILL',
    'DEFERRED_TAX_ASSETS',
    'DEFERRED_TAX_ASSET',
    'ACCRUED_INCOME_RECEIVABLE',
    'INTEREST_RECEIVABLE',
    'ACCRUED_INTEREST',
    'FEE_AND_COMMISSION_RECEIVABLE',
    'FEE_RECEIVABLE',
    'RECEIVABLE_ACCOUNT',
    'PREPAYMENTS_AND_OTHER_ASSETS',
    'PREPAID_EXPENSE',
    'INVENTORY',
    'FORECLOSURE_ASSETS',
    'OTHER_ASSETS',
    'OTHER_ASSET',
    'CURRENT_ASSET',
    'SUSPENSE_ASSETS',
    'CLEARING_AND_SETTLEMENT_ASSETS',
    'INTERBRANCH_ASSETS',
    'INTER_BRANCH',

    // ===================================================================
    // LIABILITIES
    // ===================================================================
    'CUSTOMER_DEPOSITS',
    'SAVINGS_DEPOSITS',
    'CURRENT_AND_DEMAND_DEPOSITS',
    'TIME_AND_FIXED_DEPOSITS',
    'TIME_DEPOSITS',
    'DEPOSITS_LIABILITY',
    'DUE_TO_BANKS',
    'BORROWINGS_FROM_CENTRAL_BANK',
    'BORROWINGS_FROM_OTHER_BANKS',
    'BORROWINGS',
    'LOAN_LIABILITY',
    'SUBORDINATED_DEBT',
    'DEBT_SECURITIES_ISSUED',
    'BONDS_PAYABLE',
    'DERIVATIVE_LIABILITIES',
    'INTEREST_PAYABLE',
    'ACCRUED_EXPENSES_PAYABLE',
    'ACCRUED_EXPENSES',
    'DIVIDENDS_PAYABLE',
    'DIVIDEND_PAYABLE',
    'TAX_PAYABLE',
    'DEFERRED_TAX_LIABILITIES',
    'DEFERRED_TAX_LIABILITY',
    'LEASE_LIABILITIES',
    'LEASE_LIABILITY',
    'PROVISIONS_AND_CONTINGENCIES',
    'PROVISIONS',
    'EMPLOYEE_BENEFIT_LIABILITIES',
    'UNEARNED_REVENUE',
    'PAYABLE_ACCOUNT',
    'CURRENT_LIABILITY',
    'LONG_TERM_LIABILITY',
    'OTHER_LIABILITIES',
    'OTHER_LIABILITY',
    'LIABILITY_ACCOUNT',
    'SUSPENSE_LIABILITIES',
    'CLEARING_AND_SETTLEMENT_LIABILITIES',
    'INTERBRANCH_LIABILITIES',

    // ===================================================================
    // EQUITY
    // ===================================================================
    'SHARE_CAPITAL',
    'SHARE_PREMIUM',
    'CAPITAL_ACCOUNT',
    'RETAINED_EARNINGS',
    'STATUTORY_RESERVE',
    'GENERAL_RISK_RESERVE',
    'REVALUATION_RESERVE',
    'FAIR_VALUE_RESERVE',
    'FOREIGN_CURRENCY_TRANSLATION_RESERVE',
    'OTHER_COMPREHENSIVE_INCOME',
    'TREASURY_SHARES',
    'TREASURY_STOCK',
    'CAPITAL_RESERVE',
    'DONATED_CAPITAL',
    'OTHER_EQUITY_COMPONENTS',
    'OTHER_EQUITY',
    'EQUITY_ACCOUNT',
    'ADDITIONAL_PAID_IN_CAPITAL',

    // ===================================================================
    // REVENUE
    // ===================================================================
    'INTEREST_INCOME_LOANS',
    'INTEREST_INCOME_INVESTMENTS',
    'INTEREST_INCOME_PLACEMENTS',
    'LOAN_INTEREST_INCOME',
    'INVESTMENT_INTEREST_INCOME',
    'INTEREST_INCOME',
    'FEE_AND_COMMISSION_INCOME',
    'FEE_INCOME',
    'PROCESSING_FEE',
    'INSURANCE_FEE',
    'UPFRONT_INTEREST',
    'OTHER_FEES',
    'COMMISSION_INCOME',
    'TRADING_INCOME',
    'FOREIGN_EXCHANGE_INCOME',
    'FOREIGN_EXCHANGE_GAIN',
    'DIVIDEND_INCOME',
    'RENTAL_INCOME',
    'GAIN_ON_SALE_OF_ASSETS',
    'REALIZED_GAIN',
    'UNREALIZED_GAIN',
    'RECOVERIES_ON_LOANS_WRITTEN_OFF',
    'LATE_FEE_INCOME',
    'PENALTY_INCOME',
    'SERVICE_INCOME',
    'SALES_REVENUE',
    'OTHER_OPERATING_INCOME',
    'OTHER_REVENUE',
    'OPERATING_REVENUE',
    'REVENUE_ACCOUNT',
    'NON_OPERATING_INCOME',

    // ===================================================================
    // EXPENSES
    // ===================================================================
    'INTEREST_EXPENSE_DEPOSITS',
    'INTEREST_EXPENSE_BORROWINGS',
    'INTEREST_EXPENSE',
    'FEE_AND_COMMISSION_EXPENSE',
    'LOAN_LOSS_PROVISION_EXPENSE',
    'IMPAIRMENT_LOSSES',
    'LOAN_LOSS_PROVISION',
    'BAD_DEBT_EXPENSE',
    'STAFF_COSTS',
    'STAFF_EXPENSE',
    'SALARIES_WAGES',
    'EMPLOYEE_BENEFITS',
    'DEPRECIATION_EXPENSE',
    'AMORTIZATION_EXPENSE',
    'OCCUPANCY_COSTS',
    'RENT_EXPENSE',
    'UTILITIES_EXPENSE',
    'IT_AND_COMMUNICATION_EXPENSES',
    'MARKETING_AND_ADVERTISING',
    'MARKETING_EXPENSE',
    'PROFESSIONAL_AND_LEGAL_FEES',
    'PROFESSIONAL_FEES',
    'TRAVEL_AND_ENTERTAINMENT',
    'TRAVEL_EXPENSE',
    'INSURANCE_EXPENSE',
    'REPAIRS_AND_MAINTENANCE',
    'REPAIRS_MAINTENANCE',
    'ADMINISTRATIVE_EXPENSES',
    'ADMINISTRATIVE_EXPENSE',
    'ADMIN_EXPENSE',
    'OTHER_OPERATING_EXPENSES',
    'OTHER_EXPENSE',
    'FINANCE_COST',
    'BORROWING_COST',
    'FOREIGN_EXCHANGE_LOSS',
    'LOSS_ON_SALE_OF_ASSETS',
    'TAX_EXPENSE',
    'NON_OPERATING_EXPENSES',
    'OPERATING_EXPENSE',
    'EXPENSE_ACCOUNT',

    // ===================================================================
    // CONTROL, SUSPENSE & SPECIAL PURPOSE
    // ===================================================================
    'CONTROL_ACCOUNTS',
    'CONTROL_ACCOUNT',
    'SUSPENSE_ACCOUNTS',
    'SUSPENSE_ACCOUNT',
    'CLEARING_ACCOUNTS',
    'CLEARING_ACCOUNT',
    'TRANSIT_ACCOUNTS',
    'INTERCOMPANY_ACCOUNTS',
    'INTERCOMPANY_ACCOUNT',
    'RECONCILIATION_ACCOUNTS',
    'RECONCILIATION_ACCOUNT',
    'UNAPPLIED_FUNDS',
    'UNCLEARED_EFFECTS',
    'LOAN_SUSPENSE',
    'INTEREST_SUSPENSE',
    'FEE_SUSPENSE',
    'UNEARNED_INTEREST',
    'LOAN_DISBURSEMENT_CONTROL',
    'LOAN_REPAYMENT_CONTROL',
    'LOAN_CHARGE_OFF',
    'PROVISION_FOR_LOAN_LOSSES',
    'RECOVERIES_ACCOUNT',
    'DELINQUENT_LOAN_ACCOUNT',
    'RESTRUCTURED_LOAN_ACCOUNT',
    'HEAD_OFFICE_BRANCH_ACCOUNT',
    'NOSTRO_ACCOUNTS',
    'NOSTRO_ACCOUNT',
    'VOSTRO_ACCOUNTS',
    'VOSTRO_ACCOUNT',
    'MEMORANDUM_ACCOUNTS',
    'MEMORANDUM_ACCOUNT',
    'OFF_BALANCE_SHEET_COMMITMENTS',
    'OFF_BALANCE_SHEET_ACCOUNT',
    'CONTINGENT_LIABILITIES',
    'CONTINGENT_ACCOUNT',

    // ===================================================================
    // TAX & REGULATORY
    // ===================================================================
    'WITHHOLDING_TAX_PAYABLE',
    'VAT_PAYABLE',
    'INCOME_TAX_PAYABLE',
    'DEFERRED_TAX_PAYABLE',
    'DEFERRED_TAX',
    'TAX_EXPENSE_ACCOUNTS',
    'OTHER_TAX_ACCOUNTS',
    'REGULATORY_RESERVE_ACCOUNTS',
    'CAPITAL_ADEQUACY_RESERVE',
    'CREDIT_RISK_RESERVE',
    'LIQUIDITY_RESERVE',
    'STATUTORY_DEPOSITS_WITH_CBN',
    'CBN_CRR_ACCOUNT',
    'CBN_LIQUIDITY_RATIO_ACCOUNT',
    'OTHER_REGULATORY_ACCOUNTS',

    // ===================================================================
    // CONTRA ACCOUNTS
    // ===================================================================
    'LOAN_LOSS_PROVISIONS',
    'CONTRA_ASSET_ACCOUNTS',
    'CONTRA_LIABILITY_ACCOUNTS',
    'CONTRA_ASSET',
    'CONTRA_LIABILITY',

    // ===================================================================
    // CASH FLOW (Reporting Only)
    // ===================================================================
    'CASH_FLOWS_FROM_OPERATING_ACTIVITIES',
    'CASH_FLOWS_FROM_INVESTING_ACTIVITIES',
    'CASH_FLOWS_FROM_FINANCING_ACTIVITIES'
  ],
  required: true,
  index: true // Recommended: speeds up queries on category
},
    productType: { 
      type: String,
      enum: [
        'PERSONAL_LOAN',
        'BUSINESS_LOAN', 
        'MORTGAGE_LOAN',
        'AUTO_LOAN',
        'EDUCATION_LOAN',
        'CONSUMER_LOAN',
        'SME_LOAN',
        'AGRICULTURAL_LOAN',
        'DAILY_LOAN',
        'MONTHLY_LOAN',
        'WEEKLY_LOAN',
        'GROUP_LOAN',
        'GROUP_MONTHLY_LOAN',
        'ASSET_LOAN',
        'SOLAR_LOAN',
        'RAPID_CASH_LOAN',
        'STAFF_SALARY_ADVANCE',
        'STAFF_LOAN',
        'INDIVIDUAL_LOAN',
        'CORPORATE_LOAN',
        'OVERDRAFT',
        'HOME_IMPROVEMENT_LOAN',
        'SMALL_MEDIUM_ENTERPRISE_LOAN',
        'SCHOOL_IMPROVEMENT_LOAN',
        'AGRICULTURE_LOAN',
      ]
    },

    subBranchCode: { type: String },
    accountSuffix: { type: String },
    templateGenerated: { type: Boolean, default: false },
    dynamicAccount: { type: Boolean, default: false },
    bulkCreated: { type: Boolean, default: false },
    branchSpecific: { type: Boolean, default: true },
    consolidationRequired: { type: Boolean, default: false },
    coaCompliant: { type: Boolean, default: true },
    mappedAccountType: { type: String }, // For backward compatibility
    accountClass: { type: String }, // Derived from accountType
    normalBalance: { type: String, enum: ['DEBIT', 'CREDIT'] },
    migrationFlags: {
      requiresValidation: { type: Boolean, default: false },
      validationPassed: { type: Boolean, default: false },
      migrationNotes: String,
      balanceValidated: { type: Boolean, default: false }
    },
    balanceSettings: {
      allowNegative: { type: Boolean, default: false },
      minimumBalance: { type: Number, default: 0 },
      maximumBalance: { type: Number, default: 1000000000 },
      autoReconcile: { type: Boolean, default: true }
    },
  },
  branchTimezone: { type: String, default: 'Africa/Lagos' },
  
}, {
  timestamps: true,
  collection: 'gl_accounts',
  strict: true // Ensure strict mode
});


// ==================== INDEXES ====================
GLAccountSchema.index({ GL_ACCT_NO: 1 }, { unique: true });
GLAccountSchema.index({ GL_ACCT_ID: 1 }, { unique: true });

// COA Structure indexes
GLAccountSchema.index({ 'coaStructure.segments.entity': 1, 'coaStructure.segments.branch': 1 });
GLAccountSchema.index({ 'coaStructure.segments.accountClass': 1 });
GLAccountSchema.index({ 'coaStructure.segments.accountType': 1 });
GLAccountSchema.index({ 'coaStructure.financialStatement.type': 1 });
GLAccountSchema.index({ 'coaStructure.financialStatement.category': 1 });
GLAccountSchema.index({ 'coaStructure.hierarchy.level': 1 });
GLAccountSchema.index({ 'coaStructure.hierarchy.parentAccountNo': 1 });
GLAccountSchema.index({ 'coaStructure.accounting.normalBalance': 1 });

// Organization and branch indexes
GLAccountSchema.index({ organizationCode: 1, branchCode: 1 });
GLAccountSchema.index({ organizationName: 1, branchCode: 1, GL_ACCT_NO: 1 });
GLAccountSchema.index({ organizationCode: 1, GL_ACCT_NO: 1, branchCode: 1 });

// Account type and category indexes - ENHANCED
GLAccountSchema.index({ organizationCode: 1, branchCode: 1, 'metadata.accountType': 1 });
GLAccountSchema.index({ organizationCode: 1, 'metadata.accountType': 1 });
GLAccountSchema.index({ 'metadata.accountType': 1 });
GLAccountSchema.index({ organizationCode: 1, branchCode: 1, GL_ACCT_CAT: 1 });
GLAccountSchema.index({ organizationCode: 1, 'metadata.branchSpecific': 1 });
GLAccountSchema.index({ 'metadata.accountClass': 1 });

// Status and operational indexes
GLAccountSchema.index({ organizationCode: 1, branchCode: 1, REC_ST: 1 });
GLAccountSchema.index({ organizationCode: 1, REC_ST: 1 });

// Balance and financial indexes
GLAccountSchema.index({ organizationCode: 1, LEDGER_BALANCE: 1 });
GLAccountSchema.index({ organizationCode: 1, OPENING_BALANCE: 1 });

// Legacy system indexes
GLAccountSchema.index({ 'legacyReference.legacyId': 1 });
GLAccountSchema.index({ 'legacyReference.legacyGLCode': 1 });
GLAccountSchema.index({ 'legacyReference.balanceMigrated': 1 });
GLAccountSchema.index({ systemSource: 1 });
GLAccountSchema.index({ organizationCode: 1, systemSource: 1 });

// Sync and reconciliation indexes
GLAccountSchema.index({ organizationCode: 1, 'syncStatus.syncRequired': 1 });
GLAccountSchema.index({ organizationCode: 1, 'syncStatus.balanceReconciled': 1 });

// Compound indexes for COA queries
GLAccountSchema.index({ 
  organizationCode: 1,
  'coaStructure.financialStatement.type': 1,
  'coaStructure.accounting.normalBalance': 1,
  REC_ST: 1 
});

GLAccountSchema.index({ 
  'coaStructure.segments.entity': 1,
  'coaStructure.segments.branch': 1,
  'coaStructure.segments.accountClass': 1,
  'coaStructure.hierarchy.level': 1
});

// NEW: Enhanced compound indexes for frontend queries
GLAccountSchema.index({ 
  organizationCode: 1,
  branchCode: 1,
  'metadata.accountType': 1,
  REC_ST: 1 
});

GLAccountSchema.index({ 
  'metadata.accountType': 1,
  'coaStructure.financialStatement.type': 1,
  'coaStructure.accounting.balanceType': 1
});

// ==================== STATIC METHODS - ENHANCED ====================

// Basic query methods
GLAccountSchema.statics.findByBranch = function(organizationCode, branchCode) {
  return this.find({ organizationCode, branchCode, REC_ST: 'Active' });
};

GLAccountSchema.statics.findByOrganization = function(organizationCode) {
  return this.find({ organizationCode, REC_ST: 'Active' });
};

GLAccountSchema.statics.findInterBranchAccounts = function(organizationCode) {
  return this.find({ 
    organizationCode, 
    'metadata.accountType': 'INTER_BRANCH',
    REC_ST: 'Active' 
  });
};

GLAccountSchema.statics.findByOrganizationAndType = function(organizationCode, accountType) {
  return this.find({ 
    organizationCode, 
    'metadata.accountType': accountType,
    REC_ST: 'Active' 
  });
};

// NEW: Enhanced query methods for frontend compatibility
GLAccountSchema.statics.findByAccountTypes = function(organizationCode, accountTypes = []) {
  return this.find({ 
    organizationCode, 
    'metadata.accountType': { $in: accountTypes },
    REC_ST: 'Active' 
  });
};

GLAccountSchema.statics.findByAccountClass = function(organizationCode, accountClass) {
  return this.find({ 
    organizationCode, 
    'metadata.accountClass': accountClass,
    REC_ST: 'Active' 
  });
};

GLAccountSchema.statics.findSuspenseAccounts = function(organizationCode) {
  const suspenseTypes = [
    'SUSPENSE_ACCOUNT', 'LOAN_SUSPENSE', 'INTEREST_SUSPENSE', 'FEE_SUSPENSE',
    'CLEARING_ACCOUNT', 'UNAPPLIED_FUNDS'
  ];
  return this.find({ 
    organizationCode, 
    'metadata.accountType': { $in: suspenseTypes },
    REC_ST: 'Active' 
  });
};

// COA-based query methods
GLAccountSchema.statics.findByCOASegments = function(entity, branch, accountClass = null, accountType = null) {
  const query = {
    'coaStructure.segments.entity': entity,
    'coaStructure.segments.branch': branch,
    REC_ST: 'Active'
  };
  
  if (accountClass) query['coaStructure.segments.accountClass'] = accountClass;
  if (accountType) query['coaStructure.segments.accountType'] = accountType;
  
  return this.find(query);
};

GLAccountSchema.statics.findByFinancialStatement = function(organizationCode, statementType, category = null) {
  const query = {
    organizationCode,
    'coaStructure.financialStatement.type': statementType,
    REC_ST: 'Active'
  };
  
  if (category) query['coaStructure.financialStatement.category'] = category;
  
  return this.find(query);
};

GLAccountSchema.statics.findControlAccounts = function(organizationCode) {
  return this.find({
    organizationCode,
    'coaStructure.hierarchy.isControlAccount': true,
    REC_ST: 'Active'
  });
};

GLAccountSchema.statics.findChildAccounts = function(parentAccountNo) {
  return this.find({
    'coaStructure.hierarchy.parentAccountNo': parentAccountNo,
    REC_ST: 'Active'
  });
};

// NEW: Enhanced COA structure analysis
GLAccountSchema.statics.getCOAStructure = async function(organizationCode) {
  return this.aggregate([
    {
      $match: {
        organizationCode,
        REC_ST: 'Active'
      }
    },
    {
      $group: {
        _id: {
          entity: '$coaStructure.segments.entity',
          accountClass: '$coaStructure.segments.accountClass',
          financialType: '$coaStructure.financialStatement.type',
          accountType: '$metadata.accountType',
          level: '$coaStructure.hierarchy.level'
        },
        totalAccounts: { $sum: 1 },
        totalBalance: { $sum: '$LEDGER_BALANCE' },
        accountTypes: { $addToSet: '$metadata.accountType' },
        exampleAccounts: { $push: { GL_ACCT_NO: '$GL_ACCT_NO', ACCT_DESC: '$ACCT_DESC' } }
      }
    },
    {
      $sort: {
        '_id.entity': 1,
        '_id.accountClass': 1,
        '_id.level': 1
      }
    }
  ]);
};

// Legacy system methods
GLAccountSchema.statics.findByLegacyId = function(legacyId) {
  return this.findOne({ 'legacyReference.legacyId': legacyId });
};

GLAccountSchema.statics.findByLegacyGLCode = function(legacyGLCode) {
  return this.findOne({ 'legacyReference.legacyGLCode': legacyGLCode });
};

GLAccountSchema.statics.findMigratedAccounts = function(organizationCode) {
  return this.find({ 
    organizationCode, 
    systemSource: 'MIGRATED' 
  });
};

// Enhanced balance summary with COA structure
GLAccountSchema.statics.getCOABalanceSummary = async function(organizationCode) {
  return this.aggregate([
    {
      $match: {
        organizationCode,
        REC_ST: 'Active'
      }
    },
    {
      $group: {
        _id: {
          financialStatement: '$coaStructure.financialStatement.type',
          category: '$coaStructure.financialStatement.category',
          accountType: '$metadata.accountType',
          normalBalance: '$coaStructure.accounting.normalBalance'
        },
        totalBalance: { $sum: '$LEDGER_BALANCE' },
        accountCount: { $sum: 1 },
        branches: { $addToSet: '$branchCode' },
        avgBalance: { $avg: '$LEDGER_BALANCE' },
        maxBalance: { $max: '$LEDGER_BALANCE' },
        minBalance: { $min: '$LEDGER_BALANCE' }
      }
    },
    {
      $project: {
        financialStatement: '$_id.financialStatement',
        category: '$_id.category',
        accountType: '$_id.accountType',
        normalBalance: '$_id.normalBalance',
        totalBalance: 1,
        accountCount: 1,
        branchCount: { $size: '$branches' },
        avgBalance: { $round: ['$avgBalance', 2] },
        maxBalance: 1,
        minBalance: 1,
        netBalance: {
          $cond: {
            if: { $eq: ['$_id.normalBalance', 'CREDIT'] },
            then: { $multiply: ['$totalBalance', -1] },
            else: '$totalBalance'
          }
        }
      }
    },
    {
      $sort: {
        financialStatement: 1,
        category: 1,
        accountType: 1
      }
    }
  ]);
};

// NEW: Frontend-compatible balance summary
GLAccountSchema.statics.getFrontendBalanceSummary = async function(organizationCode) {
  return this.aggregate([
    {
      $match: {
        organizationCode,
        REC_ST: 'Active'
      }
    },
    {
      $group: {
        _id: {
          accountType: '$metadata.accountType',
          accountClass: '$metadata.accountClass',
          normalBalance: '$metadata.normalBalance',
          branchCode: '$branchCode'
        },
        totalBalance: { $sum: '$LEDGER_BALANCE' },
        accountCount: { $sum: 1 },
        branchName: { $first: '$branchName' },
        exampleAccounts: { $push: { GL_ACCT_NO: '$GL_ACCT_NO', ACCT_DESC: '$ACCT_DESC' } }
      }
    },
    {
      $project: {
        accountType: '$_id.accountType',
        accountClass: '$_id.accountClass',
        normalBalance: '$_id.normalBalance',
        branchCode: '$_id.branchCode',
        branchName: 1,
        totalBalance: 1,
        accountCount: 1,
        netBalance: {
          $cond: {
            if: { $eq: ['$_id.normalBalance', 'CREDIT'] },
            then: { $multiply: ['$totalBalance', -1] },
            else: '$totalBalance'
          }
        },
        exampleAccounts: { $slice: ['$exampleAccounts', 3] } // Limit examples
      }
    },
    {
      $sort: {
        accountClass: 1,
        accountType: 1
      }
    }
  ]);
};

// Keep existing legacy methods
GLAccountSchema.statics.getOrganizationBalanceSummary = async function(organizationCode) {
  return this.aggregate([
    {
      $match: {
        organizationCode,
        REC_ST: 'Active'
      }
    },
    {
      $group: {
        _id: {
          branchCode: '$branchCode',
          accountType: '$metadata.accountType',
          systemSource: '$systemSource',
          financialType: '$coaStructure.financialStatement.type'
        },
        totalBalance: { $sum: '$LEDGER_BALANCE' },
        totalLegacyBalance: { $sum: '$legacyReference.legacyBalance' },
        accountCount: { $sum: 1 },
        branchName: { $first: '$branchName' },
        balanceMigratedCount: {
          $sum: {
            $cond: [{ $eq: ['$legacyReference.balanceMigrated', true] }, 1, 0]
          }
        },
        coaCategory: { $first: '$coaStructure.financialStatement.category' }
      }
    },
    {
      $group: {
        _id: '$_id.branchCode',
        branchName: { $first: '$branchName' },
        totalBalance: { $sum: '$totalBalance' },
        totalLegacyBalance: { $sum: '$totalLegacyBalance' },
        accountCount: { $sum: '$accountCount' },
        balanceDifference: { $subtract: [{ $sum: '$totalBalance' }, { $sum: '$totalLegacyBalance' }] },
        balanceMigratedCount: { $sum: '$balanceMigratedCount' },
        breakdown: {
          $push: {
            accountType: '$_id.accountType',
            systemSource: '$_id.systemSource',
            financialType: '$_id.financialType',
            coaCategory: '$coaCategory',
            balance: '$totalBalance',
            legacyBalance: '$totalLegacyBalance',
            difference: { $subtract: ['$totalBalance', '$totalLegacyBalance'] },
            count: '$accountCount'
          }
        }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

// ==================== INSTANCE METHODS - ENHANCED ====================

// Basic methods
GLAccountSchema.methods.canPost = function (type) {
  if (type === 'DR') return this.DR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  if (type === 'CR') return this.CR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  return false;
};

GLAccountSchema.methods.isBranchSpecific = function () {
  return this.metadata.branchSpecific;
};

GLAccountSchema.methods.getBranchInfo = function () {
  return {
    organizationCode: this.organizationCode,
    organizationName: this.organizationName,
    branchCode: this.branchCode,
    branchName: this.branchName,
    branchType: this.branchType
  };
};

// NEW: Frontend-compatible methods
GLAccountSchema.methods.getFrontendData = function() {
  return {
    id: this._id,
    GL_ACCT_NO: this.GL_ACCT_NO,
    GL_ACCT_ID: this.GL_ACCT_ID,
    ACCT_DESC: this.ACCT_DESC,
    accountType: this.metadata.accountType,
    accountClass: this.metadata.accountClass,
    normalBalance: this.metadata.normalBalance,
    organizationCode: this.organizationCode,
    organizationName: this.organizationName,
    branchCode: this.branchCode,
    branchName: this.branchName,
    LEDGER_BALANCE: this.LEDGER_BALANCE,
    AVAILABLE_BALANCE: this.AVAILABLE_BALANCE,
    CURRENCY_CODE: this.CURRENCY_CODE,
    REC_ST: this.REC_ST,
    coaStructure: this.coaStructure,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

GLAccountSchema.methods.isAssetAccount = function() {
  const assetTypes = [
    'CURRENT_ASSET', 'CUSTOMER_ACCOUNT', 'CASH_ACCOUNT', 'BANK_ACCOUNT', 
    'RECEIVABLE_ACCOUNT', 'FIXED_ASSET', 'LOAN_ASSET', 'INTANGIBLE_ASSET', 
    'OTHER_ASSET', 'PROPERTY_PLANT_EQUIPMENT', 'INVESTMENT_ASSET',
    'LOAN_PORTFOLIO', 'LOAN_RECEIVABLE', 'INTEREST_RECEIVABLE', 'FEE_RECEIVABLE',
    'ACCRUED_INTEREST', 'DUE_FROM_BANKS', 'TRADING_SECURITIES', 'HELD_TO_MATURITY_SECURITIES',
    'INVENTORY', 'PREPAID_EXPENSE', 'DEFERRED_TAX_ASSET', 'GOODWILL', 'LEASE_ASSET'
  ];
  return assetTypes.includes(this.metadata.accountType);
};

GLAccountSchema.methods.isLiabilityAccount = function() {
  const liabilityTypes = [
    'CURRENT_LIABILITY', 'LIABILITY_ACCOUNT', 'PAYABLE_ACCOUNT', 'LONG_TERM_LIABILITY', 
    'LOAN_LIABILITY', 'DEPOSITS_LIABILITY', 'OTHER_LIABILITY',
    'CUSTOMER_DEPOSITS', 'SAVINGS_DEPOSITS', 'TIME_DEPOSITS', 'INTEREST_PAYABLE',
    'ACCRUED_EXPENSES', 'TAX_PAYABLE', 'DIVIDEND_PAYABLE', 'BORROWINGS', 'BONDS_PAYABLE',
    'LEASE_LIABILITY', 'DEFERRED_TAX_LIABILITY', 'PROVISIONS', 'CONTINGENT_LIABILITY'
  ];
  return liabilityTypes.includes(this.metadata.accountType);
};

GLAccountSchema.methods.isEquityAccount = function() {
  const equityTypes = [
    'SHARE_CAPITAL', 'CAPITAL_ACCOUNT', 'RETAINED_EARNINGS', 'EQUITY_ACCOUNT', 
    'OTHER_EQUITY', 'ADDITIONAL_PAID_IN_CAPITAL', 'TREASURY_STOCK', 
    'OTHER_COMPREHENSIVE_INCOME', 'DONATED_CAPITAL', 'REVALUATION_RESERVE', 
    'CAPITAL_RESERVE', 'STATUTORY_RESERVE'
  ];
  return equityTypes.includes(this.metadata.accountType);
};

GLAccountSchema.methods.isRevenueAccount = function() {
  const revenueTypes = [
    'OPERATING_REVENUE', 'REVENUE_ACCOUNT', 'SERVICE_INCOME', 'INTEREST_INCOME', 
    'FEE_INCOME', 'PROCESSING_FEE', 'INSURANCE_FEE', 'UPFRONT_INTEREST', 'OTHER_FEES', 
    'OTHER_REVENUE', 'LOAN_INTEREST_INCOME', 'INVESTMENT_INTEREST_INCOME', 
    'COMMISSION_INCOME', 'TRADING_INCOME', 'DIVIDEND_INCOME', 'RENTAL_INCOME', 
    'LATE_FEE_INCOME', 'PENALTY_INCOME', 'FOREIGN_EXCHANGE_GAIN', 'REALIZED_GAIN', 
    'UNREALIZED_GAIN', 'SALES_REVENUE'
  ];
  return revenueTypes.includes(this.metadata.accountType);
};

GLAccountSchema.methods.isExpenseAccount = function() {
  const expenseTypes = [
    'OPERATING_EXPENSE', 'EXPENSE_ACCOUNT', 'STAFF_EXPENSE', 'ADMINISTRATIVE_EXPENSE', 
    'ADMIN_EXPENSE', 'FINANCE_COST', 'INTEREST_EXPENSE', 'OTHER_EXPENSE',
    'SALARIES_WAGES', 'EMPLOYEE_BENEFITS', 'RENT_EXPENSE', 'UTILITIES_EXPENSE',
    'DEPRECIATION_EXPENSE', 'AMORTIZATION_EXPENSE', 'PROFESSIONAL_FEES', 'MARKETING_EXPENSE',
    'TRAVEL_EXPENSE', 'INSURANCE_EXPENSE', 'REPAIRS_MAINTENANCE', 'BAD_DEBT_EXPENSE',
    'LOAN_LOSS_PROVISION', 'FOREIGN_EXCHANGE_LOSS', 'TAX_EXPENSE', 'BORROWING_COST'
  ];
  return expenseTypes.includes(this.metadata.accountType);
};

// COA-based methods
GLAccountSchema.methods.getCOAInfo = function() {
  return {
    fullAccountNumber: this.GL_ACCT_NO,
    segments: this.coaStructure.segments,
    financialStatement: this.coaStructure.financialStatement,
    hierarchy: this.coaStructure.hierarchy,
    accounting: this.coaStructure.accounting
  };
};

GLAccountSchema.methods.isBalanceSheetAccount = function() {
  return this.coaStructure.financialStatement.type === 'BALANCE_SHEET';
};

GLAccountSchema.methods.isIncomeStatementAccount = function() {
  return this.coaStructure.financialStatement.type === 'INCOME_STATEMENT';
};

GLAccountSchema.methods.getNormalBalanceMultiplier = function() {
  return this.coaStructure.accounting.normalBalance === 'DEBIT' ? 1 : -1;
};

GLAccountSchema.methods.calculateNetBalance = function() {
  return this.LEDGER_BALANCE * this.getNormalBalanceMultiplier();
};

GLAccountSchema.methods.isControlAccount = function() {
  return this.coaStructure.hierarchy.isControlAccount;
};

GLAccountSchema.methods.isDetailAccount = function() {
  return this.coaStructure.hierarchy.level === 5;
};

// Enhanced COA validation
GLAccountSchema.methods.validateCOAStructure = function() {
  const errors = [];
  
  // Validate segment consistency
  if (this.coaStructure.segments.entity !== String(this.organizationCode).padStart(2, '0')) {
    errors.push('Entity segment does not match organization code');
  }
  
  if (this.coaStructure.segments.branch !== this.branchCode.padStart(3, '0')) {
    errors.push('Branch segment does not match branch code');
  }
  
  // Validate account type consistency with COA structure
  if (this.isAssetAccount() && this.coaStructure.accounting.balanceType !== 'ASSET') {
    errors.push('Asset account type inconsistent with COA balance type');
  }
  
  if (this.isLiabilityAccount() && this.coaStructure.accounting.balanceType !== 'LIABILITY') {
    errors.push('Liability account type inconsistent with COA balance type');
  }
  
  if (this.isEquityAccount() && this.coaStructure.accounting.balanceType !== 'EQUITY') {
    errors.push('Equity account type inconsistent with COA balance type');
  }
  
  if (this.isRevenueAccount() && this.coaStructure.accounting.balanceType !== 'REVENUE') {
    errors.push('Revenue account type inconsistent with COA balance type');
  }
  
  if (this.isExpenseAccount() && this.coaStructure.accounting.balanceType !== 'EXPENSE') {
    errors.push('Expense account type inconsistent with COA balance type');
  }
  
  return errors;
};

// Legacy system methods
GLAccountSchema.methods.requiresSync = function() {
  return this.systemSource === 'MIGRATED' && this.syncStatus.syncRequired;
};

GLAccountSchema.methods.markForSync = function(reason = 'Balance discrepancy') {
  this.syncStatus.syncRequired = true;
  this.syncStatus.lastSyncError = reason;
  this.syncStatus.syncAttempts += 1;
  return this.save();
};

GLAccountSchema.methods.completeSync = function(newBalance) {
  this.syncStatus.lastSynced = new Date();
  this.syncStatus.syncRequired = false;
  this.syncStatus.legacyBalance = newBalance;
  this.syncStatus.currentBalance = this.LEDGER_BALANCE;
  this.syncStatus.balanceDifference = this.LEDGER_BALANCE - newBalance;
  this.syncStatus.lastSyncError = null;
  
  if (Math.abs(this.syncStatus.balanceDifference) <= 0.01) {
    this.syncStatus.balanceReconciled = true;
    this.syncStatus.reconciliationDate = new Date();
  }
  
  return this.save();
};

// Balance migration methods
GLAccountSchema.methods.migrateBalance = async function(legacyBalance, transactionData = {}) {
  try {
    const previousBalance = this.LEDGER_BALANCE;
    
    // Update all balance fields
    this.LEDGER_BALANCE = legacyBalance;
    this.AVAILABLE_BALANCE = legacyBalance;
    this.OPENING_BALANCE = legacyBalance;
    this.CURRENT_BALANCE = legacyBalance;
    
    // Update legacy reference
    this.legacyReference.legacyBalance = legacyBalance;
    this.legacyReference.balanceMigrated = true;
    
    // Add to balance history
    this.balanceHistory.push({
      date: new Date(),
      ledgerBalance: legacyBalance,
      availableBalance: legacyBalance,
      transactionId: transactionData.transactionId || `BAL_MIG_${Date.now()}`,
      description: transactionData.description || 'Balance migration from legacy system',
      changeType: 'MIGRATION',
      createdBy: transactionData.createdBy || 'system_migration',
      reference: transactionData.reference || `Legacy ID: ${this.legacyReference.legacyId}`,
      metadata: {
        previousBalance: previousBalance,
        migrationType: 'FULL',
        sourceSystem: 'LEGACY'
      }
    });
    
    // Update sync status
    this.syncStatus.legacyBalance = legacyBalance;
    this.syncStatus.currentBalance = legacyBalance;
    this.syncStatus.balanceDifference = 0;
    this.syncStatus.balanceReconciled = true;
    this.syncStatus.reconciliationDate = new Date();
    this.syncStatus.lastReconciliationId = transactionData.transactionId || `RECON_${Date.now()}`;
    
    // Update migration flags
    this.metadata.migrationFlags.balanceValidated = true;
    
    await this.save();
    
    console.log(`Balance migrated for ${this.GL_ACCT_NO}: ${previousBalance} -> ${legacyBalance}`);
    return true;
    
  } catch (error) {
    console.error(`Balance migration failed for ${this.GL_ACCT_NO}:`, error);
    return false;
  }
};

// ==================== MIDDLEWARE - ENHANCED ====================

GLAccountSchema.pre('save', function(next) {
  // Auto-populate derived fields
  if (this.metadata.accountType && !this.metadata.accountClass) {
    if (this.isAssetAccount()) this.metadata.accountClass = 'ASSET';
    else if (this.isLiabilityAccount()) this.metadata.accountClass = 'LIABILITY';
    else if (this.isEquityAccount()) this.metadata.accountClass = 'EQUITY';
    else if (this.isRevenueAccount()) this.metadata.accountClass = 'REVENUE';
    else if (this.isExpenseAccount()) this.metadata.accountClass = 'EXPENSE';
  }
  
  // Auto-set normal balance
  if (this.metadata.accountType && !this.metadata.normalBalance) {
    if (this.isAssetAccount() || this.isExpenseAccount()) {
      this.metadata.normalBalance = 'DEBIT';
    } else {
      this.metadata.normalBalance = 'CREDIT';
    }
  }
  
  // Validate organization code format
  if (this.organizationCode && typeof this.organizationCode !== 'number') {
    return next(new Error('Organization code must be a number'));
  }
  
  // Validate COA structure
  if (this.coaStructure) {
    const coaErrors = this.validateCOAStructure();
    if (coaErrors.length > 0) {
      return next(new Error(`COA validation failed: ${coaErrors.join(', ')}`));
    }
  }
  
  // Ensure branch code is included in GL account number for branch-specific accounts
  if (this.metadata.branchSpecific && !this.GL_ACCT_NO.includes(this.branchCode)) {
    console.warn(`Branch-specific account ${this.GL_ACCT_NO} may not include branch code ${this.branchCode}`);
  }
  
  // Auto-set system source for migrated accounts with legacy reference
  if (this.legacyReference && this.systemSource === 'NEW_SYSTEM') {
    this.systemSource = 'MIGRATED';
  }
  
  // Validate balance constraints
  if (this.LEDGER_BALANCE < this.metadata.balanceSettings.minimumBalance && !this.metadata.balanceSettings.allowNegative) {
    return next(new Error(`Balance cannot be below minimum: ${this.metadata.balanceSettings.minimumBalance}`));
  }
  
  if (this.LEDGER_BALANCE > this.metadata.balanceSettings.maximumBalance) {
    return next(new Error(`Balance cannot exceed maximum: ${this.metadata.balanceSettings.maximumBalance}`));
  }
  
  next();
});

GLAccountSchema.post('save', function(doc) {
  // Track balance changes in history if balance changed significantly
  if (this._previousLedgerBalance !== undefined && 
      Math.abs(this._previousLedgerBalance - doc.LEDGER_BALANCE) > 0.01) {
    console.log(`Balance change detected for ${doc.GL_ACCT_NO}: ${this._previousLedgerBalance} -> ${doc.LEDGER_BALANCE}`);
  }
  
  console.log(`GL Account ${doc.GL_ACCT_NO} saved for organization ${doc.organizationCode}, Account Type: ${doc.metadata.accountType}, Balance: ${doc.LEDGER_BALANCE}`);
});

GLAccountSchema.pre('remove', function(next) {
  if (this.systemSource === 'MIGRATED') {
    console.warn(`Deleting migrated account ${this.GL_ACCT_NO} with legacy ID ${this.legacyReference.legacyId}, Balance: ${this.LEDGER_BALANCE}`);
  }
  next();
});

export default mongoose.model('GLAccount', GLAccountSchema);