// models/CustomerTransaction.js
import mongoose from "mongoose";
import logger from "../utils/logger.js";

const customerTransactionSchema = new mongoose.Schema(
  {
    // Transaction Identifiers
    transactionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    referenceNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    
    // Account Information
    accountNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    customerId: {
      type: Number,
      required: true,
      index: true,
    },
    customerCode: {
      type: String,
      trim: true,
    },
    
    // Transaction Details
    transactionType: {
      type: String,
      required: true,
      enum: [
        "DEPOSIT",
        "WITHDRAWAL", 
        "TRANSFER",
        "BILL_PAYMENT",
        "LOAN_DISBURSEMENT",
        "LOAN_REPAYMENT",
        "INTEREST_CREDIT",
        "CHARGE",
        "REVERSAL",
        "ADJUSTMENT"
      ],
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    balanceAfter: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    balanceBefore: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    
    // Transaction Metadata
    currency: {
      type: String,
      default: "NGN",
      trim: true,
    },
    narration: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["CASH", "TRANSFER", "CHEQUE", "ONLINE", "ATM", "MOBILE", "OTHER"],
      default: "CASH",
    },
    
    // Counterparty Information (for transfers)
    counterpartyAccount: {
      type: String,
      trim: true,
    },
    counterpartyName: {
      type: String,
      trim: true,
    },
    counterpartyBank: {
      type: String,
      trim: true,
    },
    
    // Branch & User Information
    branchCode: {
      type: String,
      required: true,
      trim: true,
    },
    branchName: {
      type: String,
      trim: true,
    },
    tellerId: {
      type: String,
      trim: true,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
    },
    userName: {
      type: String,
      trim: true,
    },
    
    // Status & Authorization
    status: {
      type: String,
      required: true,
      enum: ["PENDING", "COMPLETED", "FAILED", "REVERSED", "DECLINED"],
      default: "COMPLETED",
    },
    authorizationCode: {
      type: String,
      trim: true,
    },
    approvedBy: {
      type: String,
      trim: true,
    },
    
    // Date & Time Information
    transactionDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    valueDate: {
      type: Date,
      default: Date.now,
    },
    postedDate: {
      type: Date,
      default: Date.now,
    },
    
    // Additional Metadata
    channel: {
      type: String,
      enum: ["BRANCH", "ATM", "MOBILE", "ONLINE", "POS", "AGENT", "OTHER"],
      default: "BRANCH",
    },
    deviceId: {
      type: String,
      trim: true,
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    
    // Reversal Information
    isReversal: {
      type: Boolean,
      default: false,
    },
    reversedTransactionId: {
      type: String,
      trim: true,
    },
    reversalReason: {
      type: String,
      trim: true,
    },
    
    // Audit Trail
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      virtuals: true,
      transform: (doc, ret) => {
        // Convert Decimal128 to numbers
        const decimalFields = ["amount", "balanceAfter", "balanceBefore"];
        decimalFields.forEach(field => {
          if (ret[field] && typeof ret[field] === "object") {
            ret[field] = parseFloat(ret[field].toString());
          }
        });
        
        // Format dates
        const dateFields = ["transactionDate", "valueDate", "postedDate", "createdAt", "updatedAt"];
        dateFields.forEach(field => {
          if (ret[field]) {
            ret[field] = new Date(ret[field]).toISOString();
          }
        });
        
        return ret;
      },
    },
  }
);

// Indexes for efficient querying
customerTransactionSchema.index({ accountNumber: 1, transactionDate: -1 });
customerTransactionSchema.index({ customerId: 1, transactionDate: -1 });
customerTransactionSchema.index({ transactionType: 1, transactionDate: -1 });
customerTransactionSchema.index({ status: 1 });
customerTransactionSchema.index({ referenceNo: 1 });
customerTransactionSchema.index({ branchCode: 1, transactionDate: -1 });
customerTransactionSchema.index({ userId: 1, transactionDate: -1 });

// Virtual for formatted transaction date
customerTransactionSchema.virtual("formattedDate").get(function () {
  return this.transactionDate
    ? this.transactionDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";
});

// Virtual for formatted time
customerTransactionSchema.virtual("formattedTime").get(function () {
  return this.transactionDate
    ? this.transactionDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
});

// Pre-save hook to generate transaction ID
customerTransactionSchema.pre("save", async function (next) {
  try {
    if (!this.transactionId) {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      this.transactionId = `TXN${timestamp}${random}`.slice(0, 20);
    }
    
    if (!this.referenceNo) {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      this.referenceNo = `REF${timestamp}${random}`.slice(0, 20);
    }
    
    next();
  } catch (error) {
    logger.error("Error in transaction pre-save hook:", error);
    next(error);
  }
});

const CustomerTransaction = mongoose.models.CustomerTransaction || 
  mongoose.model("CustomerTransaction", customerTransactionSchema);

export default CustomerTransaction;