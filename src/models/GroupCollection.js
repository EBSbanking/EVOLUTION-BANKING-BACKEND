// models/GroupCollection.js - Schema for Group Loan Collection Record
import mongoose from 'mongoose';

const groupCollectionSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
  },
  groupLoan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GroupLoan',
    required: true, // Links this collection to a specific group loan application
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Officer who recorded the collection
    required: true,
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
  },
  relationshipManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // RM overseeing the group
    required: true,
  },
  date: {
    type: Date,
    required: true, // Collection date
  },
  total: {
    type: Number,
    required: true, // Total amount collected
    min: 0,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  currency: {
    type: String,
    default: 'NGN',
    uppercase: true,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  offlineId: {
    type: String, // For offline sync tracking
    default: null,
  },
  channel: {
    type: Number, // Or ref to Channel model if applicable
    required: true,
    min: 1,
  },
  legacyId: {
    type: Number, // For migration/legacy data mapping
    unique: true,
    sparse: true, // Allows nulls without uniqueness conflict
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
});

// Pre-save middleware to update lastUpdated
groupCollectionSchema.pre('save', function (next) {
  this.lastUpdated = new Date();
  next();
});

// Indexes for efficient queries
groupCollectionSchema.index({ group: 1 });
groupCollectionSchema.index({ groupLoan: 1 });
groupCollectionSchema.index({ status: 1 });
groupCollectionSchema.index({ date: -1 });
groupCollectionSchema.index({ branch: 1 });
groupCollectionSchema.index({ legacyId: 1 });

// Optional: Virtual for total collections per group loan (populate in queries if needed)
// groupCollectionSchema.virtual('isLatest').get(function () {
//   // Logic to check if this is the most recent collection for the group loan
// });

export default mongoose.model('GroupCollection', groupCollectionSchema);