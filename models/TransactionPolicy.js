import mongoose from 'mongoose';

// Define schema for each amount range
const PolicyRangeSchema = new mongoose.Schema({
  MIN_AMOUNT: { type: Number, default: 0 },
  MAX_AMOUNT: { type: Number, required: true },
  requiresApproval: { type: Boolean, default: false },
  AUTHORIZED_ROLES: { type: [String], required: true },
}, { _id: false });

// Main policy schema per role
const TransactionPolicySchema = new mongoose.Schema({
  POLICY_ID: {
    type: String,
    unique: true,
    required: true
  },
  ROLE_NM: {
    type: String,
    required: true,
    unique: true
  },
  RANGES: {
    type: [PolicyRangeSchema],
    required: true
  }
});

// Export the model
export default mongoose.model('TransactionPolicy', TransactionPolicySchema, 'transactionpolicies');
