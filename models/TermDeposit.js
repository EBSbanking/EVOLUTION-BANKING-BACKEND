import mongoose from 'mongoose';

const TermDepositSchema = new mongoose.Schema(
  {
    ACCT_NM: {
      type: String,
      maxlength: 50,
      required: true,
      
    },
    ACCT_NO: {
      type: Number,
      required: true,
      
    },
    START_DT: {
      type: Date,
      required: true,
      
    },
    ROLLOVER_OPT_CD: {
      type: String,
      required: true,
      
    },
    TERM: {
      type: String,
      required: true,
      
    },
    MATURITY_DT: {
      type: Date,
      required: true,
    },
   NOTICE_AMOUNT: {
      type: Number,
      required: true,
      
    },
    PRIMARY_OFFICER: {
      type: String,
      required: true,
      
    },
    INT_SETLMNT_OPTION_CD: {
      type: String,
      required: true,
      
    },
    SETTLEMENT_ACCOUNT: {
      type: Number,
      required: true,
      
    },
    CUST_NM: {
      type: String,
      required: true,
      
    },
    PRINCIPAL_SETTLEMENT_METHOD: {
      type: String,
      required: true,
    },
    RATE_TYPE: {
      type: String,
      required: true,
      
    },
    RATE_PATTERN: {
      type: String,
      required: true,
    
    },
    ABSOLUTE_RATE_INTEREST: {
      type: String,
      required: true,
    },
    FIXED_RATE: {
      type: Number,
    },
    MARGIN_RATE: {
      type: Number,
      
    },
    EFFECTIVE_RATE: {
      type: Number,
      
    },
    EFFECTIVE_DATE: {
      type: Date,
      required: true,
    
    },
    SETTLEMENT_FREQUENCY: {
      type: String,
      required: true,
    },
    NEXT_SETTLEMENT_DATE: {
      type: Date,
      required: true,
    },
    VERSION_NO: {
      type: Number,
      required: true,
    
    },
    CUST_ID: {
      type: Number,
      required: true,
      // alias: 'CUST_ID', // Remove alias if it's not needed
    },
    
    PRIMARY_OFFICER_ID: {
      type: String,
      required: true,
      
    },
    SECONDARY_OFFICER_ID: {
      type: Number,
     
    },
    BU_ID: {
      type: Number,
      required: true,
     
    },
    
    CRNCY_ID: {
      type: Number,
      required: true,
     
    },
    PROD_ID: {
      type: Number,
      required: true,
    
    },
    OPENING_RSN_ID: {
      type: Number,
      
    },
    MKT_CAMPAIGN_REF: {
      type: Number,
 
    },
   ACCT_ID: {
      type: Number,
      required: true,
     
    },
    AUTO_CLOSE_ON_EXPIRY_FG: {
      type: Boolean,
      maxlength: 1,
      
    },
    ALLOW_MULTIPLE_FD: {
      type: Boolean,
      default: false, // Whether multiple FDs are allowed for the same customer
     
    }
  },
  {
    collection: 'TermDeposit',
    timestamps: true,
  }
);



// Export the model
const TermDeposit = mongoose.model('TermDeposit', TermDepositSchema);

export default TermDeposit;