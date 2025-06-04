// models/TransactionPolicy.js
import mongoose from 'mongoose';

const TransactionPolicySchema = new mongoose.Schema({
  ROLE_NM: { type: String, required: true, unique: true },
  MIN_AMOUNT: { type: Number, default: 0 }, // Minimum amount the role can post
  MAX_AMOUNT: { type: Number, required: true }, // Maximum amount the role can post without authorization
  AUTHORIZED_ROLES: { type: [String], required: true }, // Roles allowed to authorize transactions above MAX_AMOUNT
});

export default mongoose.model('TransactionPolicy', TransactionPolicySchema);
