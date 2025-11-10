// models/CustomerAccount.js - Updated Schema Aligned with MySQL 'account' Table
import mongoose from "mongoose";
import { generateAccountNumber, generateAccountId } from "../utils/generateAccountNumber.js";
import logger from "../utils/logger.js";
import SavingsProduct from "./SavingsProduct.js";

const customerAccountSchema = new mongoose.Schema(
  {
    // Core Identifiers (Aligned with MySQL: id, customer_id)
    id: {
      type: mongoose.Schema.Types.ObjectId,
      auto: true, // MongoDB's native _id, but keeping for reference
    },
    customer_id: { // Maps to MySQL: customer_id (bigint)
      type: Number, // bigint(20) -> Number
      required: true,
      index: true,
    },
    customer_code: { // Maps to MySQL: customer_code (varchar)
      type: String,
      trim: true,
      maxlength: 225,
    },

   // Account Numbers & IDs (Aligned with MySQL: account_number, offline_id)
account_number: { // Maps to MySQL: account_number (varchar)
  type: String,
  required: true,
  unique: true,
  trim: true,
  maxlength: 225,
  validate: {
    validator: v => /^\d{10}$/.test(v), // Assuming NUBAN-like 10-digit
    message: value => `${value} is not a valid account number`,
  },
},
offline_id: { // Maps to MySQL: offline_id (bigint)
  type: Number,
  sparse: true, // Allows nulls
},

    // Product & Type Fields (Aligned with MySQL: product_type, product)
    product_type: { // Maps to MySQL: product_type (varchar)
      type: String,
      required: true,
      trim: true,
      maxlength: 225,
    },
    product: { // Maps to MySQL: product (varchar) - ref to productCode
      type: String,
      required: true,
      trim: true,
      maxlength: 225,
      ref: 'SavingsProduct', // Assuming link to products
    },

    // Branch & Manager Fields (Aligned with MySQL: branch, secondary_branch, primary_relationship_manager, secondary_relationship_manager)
    branch: { // Maps to MySQL: branch (bigint)
      type: Number,
      required: true,
    },
    secondary_branch: { // Maps to MySQL: secondary_branch (bigint)
      type: Number,
      sparse: true,
    },
    primary_relationship_manager: { // Maps to MySQL: primary_relationship_manager (bigint)
      type: Number,
      required: true,
    },
    secondary_relationship_manager: { // Maps to MySQL: secondary_relationship_manager (bigint)
      type: Number,
      sparse: true,
    },

    // Amount Fields (Aligned with MySQL: opening_amount, loan_amount, plan_amount, cleared_balance, ledger_balance)
    opening_amount: { // Maps to MySQL: opening_amount (double)
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    loan_amount: { // Maps to MySQL: loan_amount (double)
      type: mongoose.Schema.Types.Decimal128,
      sparse: true,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    plan_amount: { // Maps to MySQL: plan_amount (double)
      type: mongoose.Schema.Types.Decimal128,
      sparse: true,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    cleared_balance: { // Maps to MySQL: cleared_balance (double) - default 0
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    ledger_balance: { // Maps to MySQL: ledger_balance (double) - default 0
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },

    // Date Fields (Aligned with MySQL: creation_date, last_updated, application_date, approval_date, planned_liquidation_date, last_interest_accrual_date, closed_date)
    creation_date: { // Maps to MySQL: creation_date (date)
      type: Date,
      sparse: true,
    },
    last_updated: { // Maps to MySQL: last_updated (timestamp) - default CURRENT_TIMESTAMP
      type: Date,
      default: Date.now,
    },
    application_date: { // Maps to MySQL: application_date (date)
      type: Date,
      sparse: true,
    },
    approval_date: { // Maps to MySQL: approval_date (date)
      type: Date,
      sparse: true,
    },
    planned_liquidation_date: { // Maps to MySQL: planned_liquidation_date (date)
      type: Date,
      sparse: true,
    },
    last_interest_accrual_date: { // Maps to MySQL: last_interest_accrual_date (date)
      type: Date,
      sparse: true,
    },
    closed_date: { // Maps to MySQL: closed_date (date)
      type: Date,
      sparse: true,
    },
    creation_datetime: { // Maps to MySQL: creation_datetime (datetime)
      type: Date,
      sparse: true,
    },

    // Loan & Repayment Fields (Aligned with MySQL: loan_term, term_type, repayment_date, repayment_day, payment_frequency, plan_duration, term_duration, term_duration_type)
    loan_term: { // Maps to MySQL: loan_term (bigint)
      type: Number,
      sparse: true,
    },
    term_type: { // Maps to MySQL: term_type (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    repayment_date: { // Maps to MySQL: repayment_date (varchar) - storing as string for flexibility
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    repayment_day: { // Maps to MySQL: repayment_day (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    payment_frequency: { // Maps to MySQL: payment_frequency (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    plan_duration: { // Maps to MySQL: plan_duration (bigint)
      type: Number,
      sparse: true,
    },
    term_duration: { // Maps to MySQL: term_duration (bigint)
      type: Number,
      sparse: true,
    },
    term_duration_type: { // Maps to MySQL: term_duration_type (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },

    // Interest & Rate Fields (Aligned with MySQL: agreed_interest_rate, rollover_interest_rate, capitalized_interest, interest_capitalization_period, interest_credit_count)
    agreed_interest_rate: { // Maps to MySQL: agreed_interest_rate (decimal)
      type: mongoose.Schema.Types.Decimal128,
      sparse: true,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    rollover_interest_rate: { // Maps to MySQL: rollover_interest_rate (double)
      type: mongoose.Schema.Types.Decimal128,
      sparse: true,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    capitalized_interest: { // Maps to MySQL: capitalized_interest (double)
      type: mongoose.Schema.Types.Decimal128,
      sparse: true,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    interest_capitalization_period: { // Maps to MySQL: interest_capitalization_period (text)
      type: String,
      sparse: true,
    },
    interest_credit_count: { // Maps to MySQL: interest_credit_count (bigint)
      type: Number,
      default: 0,
      sparse: true,
    },

    // Linked & Beneficiary Fields (Aligned with MySQL: linked_savings_account, beneficiary_account_type, beneficiary_account_own, beneficiary_acc_other, customer_old, beneficiary_acc_bank, beneficiary_acc_number)
    linked_savings_account: { // Maps to MySQL: linked_savings_account (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    savings_id: { // Maps to MySQL: savings_id (bigint) - for auto-created linked savings
      type: Number,
      sparse: true,
    },
    beneficiary_account_type: { // Maps to MySQL: beneficiary_account_type (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    beneficiary_account_own: { // Maps to MySQL: beneficiary_account_own (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    beneficiary_acc_other: { // Maps to MySQL: beneficiary_acc_other (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    customer_old: { // Maps to MySQL: customer_old (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    beneficiary_acc_bank: { // Maps to MySQL: beneficiary_acc_bank (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    beneficiary_acc_number: { // Maps to MySQL: beneficiary_acc_number (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },

    // Rollover & Maturity Fields (Aligned with MySQL: maturity_roll_over, rollover_duration)
    maturity_roll_over: { // Maps to MySQL: maturity_roll_over (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    rollover_duration: { // Maps to MySQL: rollover_duration (bigint)
      type: Number,
      sparse: true,
    },

    // Origin & DVA Fields (Aligned with MySQL: origin_of_funding, dva_account, dva_bank, dv_account_name)
    origin_of_funding: { // Maps to MySQL: origin_of_funding (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    dva_account: { // Maps to MySQL: dva_account (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    dva_bank: { // Maps to MySQL: dva_bank (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },
    dv_account_name: { // Maps to MySQL: dv_account_name (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },

    // Status Fields (Aligned with MySQL: status, substatus)
    status: { // Maps to MySQL: status (varchar) - default 'Active', enum
      type: String,
      required: true,
      enum: ["Active", "Closed", "Pending", "Rejected"],
      default: "Active",
    },
    substatus: { // Maps to MySQL: substatus (varchar) - default 'Active'
      type: String,
      default: "Active",
      trim: true,
      maxlength: 225,
    },

    // User & Approval Fields (Aligned with MySQL: created_by, approved_by, channel)
    created_by: { // Maps to MySQL: created_by (bigint)
      type: Number,
      sparse: true,
    },
    approved_by: { // Maps to MySQL: approved_by (bigint)
      type: Number,
      sparse: true,
    },
    channel: { // Maps to MySQL: channel (bigint)
      type: Number,
      sparse: true,
    },

    // Disbursement Fields (Aligned with MySQL: disbursement_method, disbursement_account_no)
    disbursement_method: { // Maps to MySQL: disbursement_method (varchar) - default 'Cheque'
      type: String,
      default: "Cheque",
      trim: true,
      maxlength: 225,
    },
    disbursement_account_no: { // Maps to MySQL: disbursement_account_no (varchar)
      type: String,
      trim: true,
      maxlength: 225,
      sparse: true,
    },

    // Thrift & Alert Fields (Aligned with MySQL: total_debited_thrift_fee, sms_alert, email_alert)
    total_debited_thrift_fee: { // Maps to MySQL: total_debited_thrift_fee (double)
      type: mongoose.Schema.Types.Decimal128,
      sparse: true,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    sms_alert: { // Maps to MySQL: sms_alert (varchar) - default 'No'
      type: String,
      enum: ["Yes", "No"],
      default: "No",
    },
    email_alert: { // Maps to MySQL: email_alert (varchar) - default 'No'
      type: String,
      enum: ["Yes", "No"],
      default: "No",
    },

    // Enable & Currency Fields (Aligned with MySQL: online_enabled, currency)
    online_enabled: { // Maps to MySQL: online_enabled (bigint(1)) - 1-Disabled, 2-Enabled (mapping to Boolean for simplicity)
      type: Boolean,
      default: true, // Assuming 1=true (Enabled)
    },
    currency: { // Maps to MySQL: currency (varchar) - default 'NGN'
      type: String,
      default: "NGN",
      trim: true,
      maxlength: 20,
    },

    // Auto-Approve & Tier Fields (Aligned with MySQL: auto_approve, isfirst, tier)
    auto_approve: { // Maps to MySQL: auto_approve (bigint(1)) - 0-NO, 1-YES
      type: Boolean,
      default: false, // 0=false
    },
    isfirst: { // Maps to MySQL: isfirst (bigint(1)) - default 0
      type: Number,
      default: 0,
      enum: [0, 1],
    },
    tier: { // Maps to MySQL: tier (type cut off, assuming varchar or int for customer tier)
      type: String, // Flexible; change to Number if numeric
      trim: true,
      maxlength: 225,
      sparse: true,
    },

    // Existing Fields from Original Schema (Retained & Aligned)
    // (e.g., CUST_ID -> customer_id already mapped; ACCT_ID/ACCT_NO -> account_number; etc.)
    // Add any non-overlapping like ACCOUNT_TYPE, PRODUCT_DESC, REC_ST, etc., if needed for deposits/loans hybrid
    ACCOUNT_TYPE: { // Retained for deposit accounts
      type: String,
      enum: ["SAVINGS", "CURRENT", "LOAN"], // Extended for loans
      uppercase: true,
    },
    PRODUCT_DESC: { // Retained
      type: String,
      required: true,
      trim: true,
    },
    REC_ST: { // Retained, aligned with status
      type: String,
      enum: ["ACTIVE", "DORMANT", "SUSPENDED", "CLOSED", "INACTIVE"],
      default: "ACTIVE",
      uppercase: true,
    },
    INTEREST_RATE: { // Retained, aligned with agreed_interest_rate
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    ACCRUED_INTEREST: { // Retained
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    LAST_INTEREST_DATE: { // Retained
      type: Date,
      sparse: true,
    },
    lastActivityDate: { // Retained
      type: Date,
      default: Date.now,
    },
    DR_ALLOWED: { // Retained for deposits
      type: Boolean,
      default: true,
    },
    CR_ALLOWED: { // Retained
      type: Boolean,
      default: true,
    },
    isOverdraftAllowed: { // Retained for current accounts
      type: Boolean,
      default: false,
    },
    overdraftLimit: { // Retained
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    productCode: { // Retained, for product ref
      type: String,
      ref: 'SavingsProduct',
      sparse: true,
    },
    // Currency Count Structure (Retained if needed for deposits)
    CURRENCY_COUNT: {
      type: {
        OneThousandNaira: { type: Number, default: 0, min: 0 },
        FiveHundredNaira: { type: Number, default: 0, min: 0 },
        TwoHundredNaira: { type: Number, default: 0, min: 0 },
        OneHundredNaira: { type: Number, default: 0, min: 0 },
        FiftyNaira: { type: Number, default: 0, min: 0 },
        TwentyNaira: { type: Number, default: 0, min: 0 },
        TenNaira: { type: Number, default: 0, min: 0 },
        FiveNaira: { type: Number, default: 0, min: 0 },
        TOTAL_CURRENCY_COUNT: { type: Number, default: 0, min: 0 },
      },
      default: () => ({
        OneThousandNaira: 0, FiveHundredNaira: 0, TwoHundredNaira: 0,
        OneHundredNaira: 0, FiftyNaira: 0, TwentyNaira: 0,
        TenNaira: 0, FiveNaira: 0, TOTAL_CURRENCY_COUNT: 0,
      }),
    },
    // Balances (Retained, aligned with cleared/ledger)
    AVAILABLE_BALANCE: { // Retained
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
  },
  {
    timestamps: true, // Adds createdAt/updatedAt
    toJSON: {
      getters: true,
      virtuals: true,
      transform: (doc, ret) => {
        // Convert Decimal128 to numbers
        const decimalFields = [
          "opening_amount", "loan_amount", "plan_amount", "cleared_balance",
          "ledger_balance", "agreed_interest_rate", "rollover_interest_rate",
          "capitalized_interest", "total_debited_thrift_fee", "INTEREST_RATE",
          "ACCRUED_INTEREST", "overdraftLimit", "AVAILABLE_BALANCE"
        ];
        decimalFields.forEach(field => {
          if (ret[field] && typeof ret[field] === "object") {
            ret[field] = parseFloat(ret[field].toString());
          }
        });
        return ret;
      },
    },
  }
);

// Virtuals (Retained & Extended)
customerAccountSchema.virtual('glAccounts').get(function() {
  if (this.product && typeof this.product === 'object') {
    return this.product.glAccounts;
  }
  return null;
});

customerAccountSchema.virtual('productDetails').get(function() {
  if (this.product && typeof this.product === 'object') {
    const { glAccounts, ...details } = this.product.toObject();
    return details;
  }
  return null;
});

// Pre-save Hook (Updated to Handle Loan/Deposit Logic)
customerAccountSchema.pre("save", async function (next) {
  try {
    // Generate account_number if missing (aligns with ACCT_NO logic)
    if (!this.account_number) {
      const rawNo = await generateAccountNumber();
      this.account_number = String(rawNo).padStart(10, "0");
    }

    // For SAVINGS/LOAN accounts, validate product
    if ((this.ACCOUNT_TYPE === 'SAVINGS' || this.ACCOUNT_TYPE === 'LOAN') && this.isNew) {
      let product = await SavingsProduct.findOne({
        $or: [
          { productCode: String(this.product) },
          { PROD_ID: Number(this.product) },
          { PROD_CD: String(this.product) }
        ],
        REC_ST: "A" // Assuming active status
      });

      if (!product) {
        logger.error('No active product found', { product: this.product });
        throw new Error(`No active product found for: ${this.product}`);
      }

      this.PRODUCT_DESC = product.productName || product.PROD_DESC || 'Account Product';
      
      // Set interest rate (align with agreed_interest_rate)
      let interestRate = product.rateInformation?.fixedRate || product.interestRate || 0;
      this.INTEREST_RATE = mongoose.Types.Decimal128.fromString(String(interestRate));
      this.agreed_interest_rate = this.INTEREST_RATE; // Sync fields

      if (!this.LAST_INTEREST_DATE) {
        this.LAST_INTEREST_DATE = new Date();
      }

      logger.info('Validated product for account', { product: this.product, type: this.ACCOUNT_TYPE });
    }

    // For CURRENT accounts
    if (this.ACCOUNT_TYPE === 'CURRENT' && this.isNew) {
      this.INTEREST_RATE = 0;
      this.agreed_interest_rate = 0;
      this.ACCRUED_INTEREST = 0;
      this.LAST_INTEREST_DATE = undefined;
    }

    // Set defaults for new docs
    if (this.isNew) {
      this.last_updated = new Date();
      if (!this.status) this.status = 'Active';
      if (!this.REC_ST) this.REC_ST = 'ACTIVE';
    }

    next();
  } catch (err) {
    logger.error("Error in pre-save hook:", { error: err.message });
    next(err);
  }
});

// // Indexes (Extended for MySQL Alignment)
// customerAccountSchema.index({ customer_id: 1, product_type: 1 });
// customerAccountSchema.index({ account_number: 1 });
// customerAccountSchema.index({ status: 1 });
// customerAccountSchema.index({ last_updated: -1 });
// customerAccountSchema.index({ product: 1 });
// customerAccountSchema.index({ branch: 1 });

const CustomerAccount = mongoose.models.CustomerAccount || mongoose.model("CustomerAccount", customerAccountSchema);

export default CustomerAccount;