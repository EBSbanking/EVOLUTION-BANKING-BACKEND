import mongoose from "mongoose";

// Sub-schema for amount ranges
const rangeSchema = new mongoose.Schema(
  {
    MIN_AMOUNT: { type: Number, required: true, default: 0 },
    MAX_AMOUNT: { type: Number, required: true },
    requiresApproval: { type: Boolean, default: false },
    AUTHORIZED_ROLES: { type: [String], default: [] }
  },
  { _id: false }
);

// Main TransactionPolicy schema
const transactionPolicySchema = new mongoose.Schema({
  POLICY_ID: {
    type: String,
    unique: true,
    required: true
  },
  POLICY_TYPE: {
    type: String,
    enum: ["Deposit", "Withdrawal"],
    required: true
  },
  ROLE_NM: {
    type: String,
    required: true,
    uppercase: true
  },
  RANGES: {
    type: [rangeSchema],
    required: true
  },
  CREATED_AT: { type: Date, default: Date.now }
});

// Compound index ensures one policy per role per type
transactionPolicySchema.index({ ROLE_NM: 1, POLICY_TYPE: 1 }, { unique: true });

const TransactionPolicy =
  mongoose.models.TransactionPolicy ||
  mongoose.model("TransactionPolicy", transactionPolicySchema, "transactionpolicies");

export default TransactionPolicy;
