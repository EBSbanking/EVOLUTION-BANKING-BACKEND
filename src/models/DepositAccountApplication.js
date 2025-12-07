import mongoose from "mongoose";

const DepositAccountApplicationSchema = new mongoose.Schema({
  CUST_ID: { 
    type: String, 
    required: true, 
    trim: true,
    validate: {
      validator: v => /^\d{10}$/.test(v),
      message: "CUST_ID must be exactly 10 digits",
    }
  },

  ACCT_ID: {
    type: String,
    required: true,
    validate: {
      validator: v => /^[A-Z0-9_]+$/.test(v),
      message: "ACCT_ID must be alphanumeric with underscores only",
    },
  },

  ACCT_NO: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    validate: {
      validator: v => /^\d{10}$/.test(v),
      message: "ACCT_NO must be exactly 10 digits (NUBAN format)",
    },
  },

  ACCT_NM: { 
    type: String, 
    required: true,
    trim: true
  },
  
  CRNCY_ID: { 
    type: String, 
    default: "NGN",
    enum: ["NGN"]
  },
  
  PROD_ID: { 
    type: String, 
    required: true,
    validate: {
      validator: v => /^\d+$/.test(v),
      message: "PROD_ID must contain only digits",
    }
  },
  
  BU_ID: { 
    type: String, 
    required: true,
    validate: {
      validator: v => /^\d{3}$/.test(v),
      message: "BU_ID must be exactly 3 digits",
    }
  },
  
  AVAIL_DT: { 
    type: Date, 
    required: true,
    default: Date.now
  },
  
  OPENED_DT: { 
    type: Date, 
    required: true,
    default: Date.now
  },
  
  CREATED_BY: { 
    type: String, 
    required: true,
    trim: true
  },
  
  USER_ID: { 
    type: String, 
    required: true,
    trim: true
  },
  
  CREATED_AT: { 
    type: Date, 
    default: Date.now 
  },
  
  // File URLs or base64 strings
  IMAGE: { 
    type: String, 
    required: true 
  },
  
  DOCUMENT: { 
    type: String, 
    required: true 
  },
  
  DOCUMENT_TYPE: { 
    type: String, 
    required: true,
    trim: true
  },
  
  DOCUMENT_NUMBER: { 
    type: String, 
    required: true,
    trim: true
  },
  
  BANK_MANDATE: { 
    type: String, 
    required: true 
  },
  
  AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
    default: '0.00'
  },
  
  DEPOSITOR_NAME: {
    type: String,
    required: true,
    trim: true
  },
  
  STATUS: {
    type: String,
    enum: ["Pending", "Approved", "Rejected", "Active", "Inactive"],
    default: "Pending",
  },
  
  // For currency breakdown tracking
  DENOMINATIONS: { 
    type: Object,
    default: {}
  },
  
  // Account type (always SAVINGS for deposit accounts)
  ACCOUNT_TYPE: { 
    type: String,
    enum: ["SAVINGS"],
    default: "SAVINGS"
  },
  
  // Additional metadata
  metadata: {
    applicationDate: {
      type: Date,
      default: Date.now
    },
    approvedDate: Date,
    approvedBy: String,
    rejectionReason: String,
    notes: String,
    branchName: String,
    tellerId: String
  }
}, {
  timestamps: true,
  toJSON: {
    getters: true,
    transform: function(doc, ret) {
      // Convert Decimal128 to float for JSON
      if (ret.AMOUNT && typeof ret.AMOUNT === 'object') {
        ret.AMOUNT = parseFloat(ret.AMOUNT.toString());
      }
      return ret;
    }
  }
});

// ✅ Improved pre-save hook for ACCT_ID
DepositAccountApplicationSchema.pre("save", async function (next) {
  try {
    // Validate CUST_ID format
    if (!/^\d{10}$/.test(this.CUST_ID)) {
      throw new Error(`CUST_ID ${this.CUST_ID} is invalid. Must be 10 digits`);
    }

    // Validate ACCT_NO format (NUBAN)
    if (!/^\d{10}$/.test(this.ACCT_NO)) {
      throw new Error(`ACCT_NO ${this.ACCT_NO} is invalid. Must be 10 digits`);
    }

    // For NUBAN accounts, ensure it starts with '2' for savings
    if (!this.ACCT_NO.startsWith('2')) {
      throw new Error(`Savings account number must start with '2' for NUBAN format`);
    }

    // Only generate ACCT_ID if it doesn't exist
    if (!this.ACCT_ID) {
      const timestamp = Date.now();
      const randomSuffix = Math.floor(Math.random() * 1000);
      this.ACCT_ID = `ACCT_${timestamp}_${randomSuffix}`;
    }

    // Validate ACCT_ID format
    if (!/^[A-Z0-9_]+$/.test(this.ACCT_ID)) {
      throw new Error(`ACCT_ID ${this.ACCT_ID} is invalid. Must be alphanumeric with underscores`);
    }

    // Validate PROD_ID
    if (!/^\d+$/.test(this.PROD_ID)) {
      throw new Error(`PROD_ID ${this.PROD_ID} must contain only digits`);
    }

    // Validate BU_ID
    if (!/^\d{3}$/.test(this.BU_ID)) {
      throw new Error(`BU_ID ${this.BU_ID} must be exactly 3 digits`);
    }

    // Validate DOCUMENT_TYPE is not empty
    if (!this.DOCUMENT_TYPE || this.DOCUMENT_TYPE.trim() === '') {
      throw new Error('DOCUMENT_TYPE is required');
    }

    // Validate DOCUMENT_NUMBER is not empty
    if (!this.DOCUMENT_NUMBER || this.DOCUMENT_NUMBER.trim() === '') {
      throw new Error('DOCUMENT_NUMBER is required');
    }

    next();
  } catch (err) {
    next(err);
  }
});

// ✅ Indexes for better query performance
DepositAccountApplicationSchema.index({ ACCT_NO: 1 }, { unique: true });
DepositAccountApplicationSchema.index({ CUST_ID: 1 });
DepositAccountApplicationSchema.index({ PROD_ID: 1 });
DepositAccountApplicationSchema.index({ BU_ID: 1 });
DepositAccountApplicationSchema.index({ STATUS: 1 });
DepositAccountApplicationSchema.index({ CREATED_AT: -1 });
DepositAccountApplicationSchema.index({ DOCUMENT_TYPE: 1 });

// ✅ Virtual for formatted account number display
DepositAccountApplicationSchema.virtual('formattedAccountNumber').get(function() {
  if (this.ACCT_NO && this.ACCT_NO.length === 10) {
    return `${this.ACCT_NO.slice(0, 3)}-${this.ACCT_NO.slice(3, 7)}-${this.ACCT_NO.slice(7)}`;
  }
  return this.ACCT_NO;
});

// ✅ Static method to find by customer ID
DepositAccountApplicationSchema.statics.findByCustomerId = function(customerId) {
  return this.find({ CUST_ID: customerId }).sort({ CREATED_AT: -1 });
};

// ✅ Static method to find active applications
DepositAccountApplicationSchema.statics.findActiveApplications = function() {
  return this.find({ STATUS: { $in: ['Pending', 'Active'] } });
};

// ✅ Static method to find by document type
DepositAccountApplicationSchema.statics.findByDocumentType = function(documentType) {
  return this.find({ DOCUMENT_TYPE: documentType }).sort({ CREATED_AT: -1 });
};

// ✅ Instance method to approve application
DepositAccountApplicationSchema.methods.approve = function(approvedBy) {
  this.STATUS = 'Active';
  this.metadata.approvedDate = new Date();
  this.metadata.approvedBy = approvedBy;
  return this.save();
};

// ✅ Instance method to reject application
DepositAccountApplicationSchema.methods.reject = function(reason, rejectedBy) {
  this.STATUS = 'Rejected';
  this.metadata.rejectionReason = reason;
  this.metadata.approvedBy = rejectedBy;
  return this.save();
};

export default mongoose.models.DepositAccountApplication ||
  mongoose.model("DepositAccountApplication", DepositAccountApplicationSchema);