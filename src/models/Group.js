// models/Group.js - Mongoose Schema for Group
import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  groupCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true, // e.g., 'GRP001'
  },
  groupName: {
    type: String,
    required: true,
    trim: true,
  },
  members: [{
    type: String, // CUST_ID as string
    required: true,
  }],
  memberCount: {
    type: Number,
    default: 0, // Auto-updated on add/remove
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'dissolved'],
    default: 'active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save middleware to update memberCount
groupSchema.pre('save', function (next) {
  this.memberCount = this.members.length;
  this.updatedAt = Date.now();
  next();
});

// Index for fast queries
groupSchema.index({ groupCode: 1 });
groupSchema.index({ groupName: 'text' });

export default mongoose.model('Group', groupSchema);