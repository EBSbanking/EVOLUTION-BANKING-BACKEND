// models/GroupLoan.js - Schema for Group Loan Application
import mongoose from 'mongoose';

const groupLoanSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
  },
  groupCode: {
    type: String,
    required: true, // Denormalized for quick lookup
  },
  groupName: {
    type: String,
    required: true,
  },
  totalAmount: {
    type: Number,
    required: true, // e.g., 900000 for the group
  },
  individualShare: {
    type: Number,
    required: true, // e.g., 30000 per member (total / memberCount)
  },
  memberCount: {
    type: Number,
    required: true, // Number of members at application time
  },
  applicationDate: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['applied', 'approved', 'disbursed', 'rejected'],
    default: 'applied',
  },
  disbursedAt: {
    type: Date,
  },
  disbursedToMembers: [{ // Track disbursed individual loans
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Assuming user model for officer
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save for individualShare calculation
groupLoanSchema.pre('save', function (next) {
  if (this.isNew && this.memberCount > 0) {
    this.individualShare = this.totalAmount / this.memberCount;
  }
  this.updatedAt = Date.now();
  next();
});

// // Index for queries
// groupLoanSchema.index({ group: 1 });
// groupLoanSchema.index({ status: 1 });
// groupLoanSchema.index({ applicationDate: -1 });

export default mongoose.model('GroupLoan', groupLoanSchema);