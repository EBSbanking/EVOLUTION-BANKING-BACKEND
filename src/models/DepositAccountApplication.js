import mongoose from "mongoose";

const DepositAccountApplicationSchema = new mongoose.Schema({
  CUST_ID: { type: String, required: true, trim: true },

  ACCT_ID: {
    type: String,
    // REMOVED: unique: true, // Remove unique constraint
    validate: {
      validator: v => /^\d{6}$/.test(v),
      message: "ACCT_ID must be exactly 6 digits",
    },
  },

  ACCT_NO: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: v => /^\d{10}$/.test(v),
      message: "ACCT_NO must be exactly 10 digits",
    },
  },

  ACCT_NM: { type: String, required: true },
  CRNCY_ID: { type: String, default: "NGN" },
  PROD_ID: { type: String },
  BU_ID: { type: String, required: true },
  AVAIL_DT: { type: Date, required: true },
  OPENED_DT: { type: Date, required: true },
  CREATED_BY: { type: String, required: true },
  USER_ID: { type: String, required: true },
  CREATED_AT: { type: Date, default: Date.now },
  IMAGE: { type: String, required: true },
  DOCUMENT: { type: String, required: true },
  DOCUMENT_TYPE: { type: String, required: true },
  DOCUMENT_NUMBER: { type: String, required: true },
  BANK_MANDATE: { type: String, required: true },
  STATUS: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
  },
  DENOMINATIONS: { type: Object }, // Add this if needed
  ACCOUNT_TYPE: { type: String } // Add this if needed
});

// ✅ Improved pre-save hook for ACCT_ID
DepositAccountApplicationSchema.pre("save", async function (next) {
  try {
    // Only generate ACCT_ID if it doesn't exist
    if (!this.ACCT_ID) {
      const lastDoc = await this.constructor.findOne().sort({ _id: -1 }).lean();
      const nextId = lastDoc ? parseInt(lastDoc.ACCT_ID || '0', 10) + 1 : 1;
      this.ACCT_ID = String(nextId).padStart(6, "0");
    }

    if (!/^\d{6}$/.test(this.ACCT_ID)) {
      throw new Error(`ACCT_ID ${this.ACCT_ID} is invalid. Must be 6 digits`);
    }

    next();
  } catch (err) {
    next(err);
  }
});

export default mongoose.models.DepositAccountApplication ||
  mongoose.model("DepositAccountApplication", DepositAccountApplicationSchema);