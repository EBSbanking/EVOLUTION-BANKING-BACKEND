// models/GroupSavingsContribution.js
import mongoose from 'mongoose';

const groupSavingsContributionSchema = new mongoose.Schema({
  groupSavings: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GroupSavings',
    required: true
  },
  memberCustId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  contributionDate: {
    type: Date,
    default: Date.now
  },
  contributionType: {
    type: String,
    enum: ['regular', 'special', 'penalty', 'initial'],
    default: 'regular'
  },
  period: {
    type: String, // e.g., "2024-01" for January 2024
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'completed'
  },
  reference: {
    type: String,
    unique: true
  },
  collectedBy: {
    type: String, // CUST_ID of collector
    required: true
  },
  notes: {
    type: String
  }
});

export default mongoose.model('GroupSavingsContribution', groupSavingsContributionSchema);