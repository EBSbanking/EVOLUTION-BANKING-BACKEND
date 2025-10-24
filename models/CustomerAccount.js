// models/CustomerAccount.js - Complete Updated Schema
import mongoose from "mongoose";
import { generateAccountNumber, generateAccountId } from "../utils/generateAccountNumber.js";
import logger from "../utils/logger.js";
import SavingsProduct from "./SavingsProduct.js";

const customerAccountSchema = new mongoose.Schema(
  {
    CUST_ID: { 
      type: Number, 
      required: true, 
      index: true 
    },
    ACCT_ID: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: v => /^\d{6}$/.test(v),
        message: "ACCT_ID must be exactly 6 digits",
      },
    },
    ACCT_NO: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      validate: {
        validator: v => /^\d{10}$/.test(v),
        message: props => `${props.value} is not a valid 10-digit account number`,
      },
    },
    ACCT_NM: { 
      type: String, 
      required: true, 
      trim: true, 
      maxlength: 100 
    },
    BU_ID: {
      type: Number,
      required: true,
      validate: {
        validator: v => Number.isInteger(v) && v > 0,
        message: props => `${props.value} is not a valid BUSINESS_UNIT. Must be a positive integer.`,
      },
    },
    DEPOSITOR_NAME: {
      type: String,
      trim: true,
      maxlength: 100,
      validate: {
        validator: v => v ? /^[A-Za-z\s]{1,100}$/.test(v) : true,
        message: props => `${props.value} is not a valid DEPOSITOR_NAME. Must be letters and spaces, up to 100 characters.`,
      },
    },
    productCode: {
      type: String,
      required: function() { 
        return this.ACCOUNT_TYPE === 'SAVINGS' && this.isNew;
      },
      ref: 'SavingsProduct',
      validate: {
        validator: async function(v) {
          if (this.ACCOUNT_TYPE !== 'SAVINGS') return true;
          if (!v) return true;
          
          try {
            console.log('🔍 Validating productCode:', v, 'Type:', typeof v);
            
            // FIXED: Use correct REC_ST values - "A" instead of "ACTIVE"
            const product = await SavingsProduct.findOne({
              $or: [
                { productCode: String(v) },
                { PROD_ID: Number(v) },
                { PROD_CD: String(v) }
              ],
              // FIXED: Use the correct active status from your database
              REC_ST: "A"
            });

            console.log('🔍 Search result:', product ? 'FOUND' : 'NOT FOUND');
            if (product) {
              console.log('✅ Found product:', {
                productCode: product.productCode,
                PROD_ID: product.PROD_ID,
                REC_ST: product.REC_ST,
                productName: product.productName
              });
            } else {
              // Debug: Check what products exist
              const allProducts = await SavingsProduct.find({});
              console.log('📋 All products in database:', allProducts.map(p => ({
                productCode: p.productCode,
                PROD_ID: p.PROD_ID,
                REC_ST: p.REC_ST,
                productName: p.productName
              })));
            }

            return !!product;
          } catch (error) {
            console.error('❌ Error in productCode validation:', error.message);
            return false;
          }
        },
        message: props => `Invalid productCode: ${props.value}. No active SavingsProduct found.`,
      },
    },
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
      default: {
        OneThousandNaira: 0,
        FiveHundredNaira: 0,
        TwoHundredNaira: 0,
        OneHundredNaira: 0,
        FiftyNaira: 0,
        TwentyNaira: 0,
        TenNaira: 0,
        FiveNaira: 0,
        TOTAL_CURRENCY_COUNT: 0,
      },
    },
    LEDGER_BAL: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0.00"),
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    CLEARED_BAL: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0.00"),
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    AVAILABLE_BALANCE: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0.00"),
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    ACCOUNT_TYPE: {
      type: String,
      required: true,
      enum: ["SAVINGS", "CURRENT"],
      uppercase: true,
    },
    PRODUCT_DESC: { 
      type: String, 
      required: true, 
      trim: true 
    },
    REC_ST: {
      type: String,
      enum: ["ACTIVE", "DORMANT", "SUSPENDED", "CLOSED", "INACTIVE"],
      default: "ACTIVE",
      uppercase: true,
    },
    INTEREST_RATE: { 
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0.00"),
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    ACCRUED_INTEREST: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0.00"),
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    LAST_INTEREST_DATE: { 
      type: Date,
      required: function() { 
        return this.ACCOUNT_TYPE === 'SAVINGS' && this.isNew; 
      },
      default: function() {
        return this.ACCOUNT_TYPE === 'SAVINGS' ? new Date() : undefined;
      }
    },
    lastActivityDate: { 
      type: Date, 
      default: Date.now 
    },
    DR_ALLOWED: {
      type: Boolean,
      default: true,
    },
    CR_ALLOWED: {
      type: Boolean,
      default: true,
    },
    isOverdraftAllowed: {
      type: Boolean,
      default: false
    },
    overdraftLimit: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0.00"),
      get: v => (v ? parseFloat(v.toString()) : 0)
    }
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      virtuals: true,
      transform: (doc, ret) => {
        // Convert Decimal128 to numbers in JSON output
        ["LEDGER_BAL", "CLEARED_BAL", "AVAILABLE_BALANCE", "ACCRUED_INTEREST", "INTEREST_RATE", "overdraftLimit"].forEach(field => {
          if (ret[field] && typeof ret[field] === "object") {
            ret[field] = parseFloat(ret[field].toString());
          }
        });
        
        // Format account numbers
        if (ret.ACCT_ID) ret.ACCT_ID = ret.ACCT_ID.toString().padStart(6, "0");
        if (ret.ACCT_NO) ret.ACCT_NO = ret.ACCT_NO.toString().padStart(10, "0");
        
        return ret;
      },
    },
  }
);

// Virtual for getting GL accounts from the associated product
customerAccountSchema.virtual('glAccounts').get(function() {
  if (this.ACCOUNT_TYPE === 'SAVINGS' && this.productCode && typeof this.productCode === 'object') {
    return this.productCode.glAccounts;
  }
  return null;
});

// Virtual for easy access to product details
customerAccountSchema.virtual('productDetails').get(function() {
  if (this.ACCOUNT_TYPE === 'SAVINGS' && this.productCode && typeof this.productCode === 'object') {
    const { glAccounts, ...productDetails } = this.productCode.toObject();
    return productDetails;
  }
  return null;
});

// Pre-save hook: auto-generate ACCT_ID and ACCT_NO if missing
customerAccountSchema.pre("save", async function (next) {
  try {
    // Generate ACCT_ID if missing
    if (!this.ACCT_ID) {
      const rawId = await generateAccountId();
      this.ACCT_ID = String(rawId).padStart(6, "0");
    }
    if (!/^\d{6}$/.test(this.ACCT_ID)) {
      throw new Error(`ACCT_ID ${this.ACCT_ID} is invalid. Must be 6 digits`);
    }

    // Generate ACCT_NO if missing
    if (!this.ACCT_NO) {
      const rawNo = await generateAccountNumber();
      this.ACCT_NO = String(rawNo).padStart(10, "0");
    }
    if (!/^\d{10}$/.test(this.ACCT_NO)) {
      throw new Error(`ACCT_NO ${this.ACCT_NO} is invalid. Must be 10 digits`);
    }

    // For SAVINGS accounts, validate product and set basic info (NOT GL accounts)
    if (this.ACCOUNT_TYPE === 'SAVINGS' && this.isNew) {
      // FIXED: Use correct REC_ST values - "A" instead of "ACTIVE"
      let product = await SavingsProduct.findOne({
        $or: [
          { productCode: String(this.productCode) },
          { productCode: Number(this.productCode) },
          { PROD_ID: Number(this.productCode) },
          { PROD_CD: String(this.productCode) },
          { PROD_ID: String(this.productCode) }
        ],
        // FIXED: Use the correct active status from your database
        REC_ST: "A"
      });

      if (!product) {
        // Log detailed debug info
        const allMatchingProducts = await SavingsProduct.find({
          $or: [
            { productCode: String(this.productCode) },
            { productCode: Number(this.productCode) },
            { PROD_ID: Number(this.productCode) },
            { PROD_CD: String(this.productCode) },
            { PROD_ID: String(this.productCode) }
          ]
        });

        logger.error('No active SavingsProduct found in pre-save hook', {
          productCode: this.productCode,
          productCodeType: typeof this.productCode,
          matchingProducts: allMatchingProducts.map(p => ({
            productCode: p.productCode,
            PROD_ID: p.PROD_ID,
            PROD_CD: p.PROD_CD,
            productName: p.productName,
            REC_ST: p.REC_ST
          }))
        });

        throw new Error(`No active SavingsProduct found for productCode: ${this.productCode}`);
      }

      // Set only basic product information
      this.PRODUCT_DESC = product.productName || product.PROD_DESC || 'Savings Account';
      
      // Get interest rate from multiple possible fields
      let interestRate = 0;
      if (product.rateInformation?.fixedRate) {
        interestRate = product.rateInformation.fixedRate;
      } else if (product.interestRate) {
        interestRate = product.interestRate;
      } else if (product.rateInformation?.effectiveRate) {
        interestRate = product.rateInformation.effectiveRate;
      }
      
      this.INTEREST_RATE = mongoose.Types.Decimal128.fromString(String(interestRate));

      // Set LAST_INTEREST_DATE if not already set
      if (!this.LAST_INTEREST_DATE) {
        this.LAST_INTEREST_DATE = new Date();
      }

      logger.info('Successfully validated and set product info for SAVINGS account', {
        productCode: this.productCode,
        productName: this.PRODUCT_DESC,
        interestRate: interestRate
      });
    } else if (this.ACCOUNT_TYPE === 'CURRENT' && this.isNew) {
      // For CURRENT accounts, ensure productCode is not set and clear interest fields
      this.productCode = undefined;
      this.INTEREST_RATE = mongoose.Types.Decimal128.fromString("0.00");
      this.ACCRUED_INTEREST = mongoose.Types.Decimal128.fromString("0.00");
      this.LAST_INTEREST_DATE = undefined;
    }

    next();
  } catch (err) {
    logger.error("Error in CustomerAccount pre-save hook:", { error: err.message });
    next(err);
  }
});

// Indexes for better query performance
customerAccountSchema.index({ CUST_ID: 1, ACCOUNT_TYPE: 1 });
customerAccountSchema.index({ ACCT_NO: 1 });
customerAccountSchema.index({ REC_ST: 1 });
customerAccountSchema.index({ lastActivityDate: -1 });
customerAccountSchema.index({ productCode: 1 });

const CustomerAccount =
  mongoose.models.CustomerAccount ||
  mongoose.model("CustomerAccount", customerAccountSchema);

export default CustomerAccount;