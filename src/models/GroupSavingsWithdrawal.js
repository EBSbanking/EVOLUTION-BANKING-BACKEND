// models/GroupSavingsWithdrawal.js
import mongoose from 'mongoose';

const groupSavingsWithdrawalSchema = new mongoose.Schema({
  groupSavings: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GroupSavings',
    required: true
  },
  requestedBy: {
    type: String, // CUST_ID
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  purpose: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'disbursed'],
    default: 'pending'
  },
  approvers: [{
    approverCustId: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected']
    },
    comments: String,
    approvedAt: Date
  }],
  requiredApprovals: {
    type: Number,
    default: 1
  },
  currentApprovals: {
    type: Number,
    default: 0
  },
  requestDate: {
    type: Date,
    default: Date.now
  },
  approvedAt: {
    type: Date
  },
  disbursedAt: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  transactionReference: {
    type: String
  }
});

export default mongoose.model('GroupSavingsWithdrawal', groupSavingsWithdrawalSchema);