import mongoose from 'mongoose';

// Define schema for each amount range
const PolicyRangeSchema = new mongoose.Schema({
  MIN_AMOUNT: { type: Number, default: 0 },
  MAX_AMOUNT: { type: Number, required: true },
  requiresApproval: { type: Boolean, default: false }, // NEW FLAG
  AUTHORIZED_ROLES: { type: [String], required: true },
}, { _id: false }); // prevents nested _id fields for each range

// Main policy schema per role
const TransactionPolicySchema = new mongoose.Schema({
  ROLE_NM: { type: String, required: true, unique: true },
  RANGES: { type: [PolicyRangeSchema], required: true }
});

// Export the model
export default mongoose.model('TransactionPolicy', TransactionPolicySchema, 'transactionpolicies');
