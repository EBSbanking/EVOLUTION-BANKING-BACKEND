// models/Group.js - Updated Mongoose Schema for Group
import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  // New fields
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
    default: [], // Changed from required: true to default: []
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
  
  // Legacy fields (preserved for migration)
  legacyId: {
    type: Number, // Store as number instead of ObjectId
    unique: true,
    sparse: true
  },
  branch: {
    type: Number,
    required: true,
  },
  relationshipManager: {
    type: Number, // staff ID
    required: true,
  },
  regDate: {
    type: Date,
    default: Date.now,
  },
  minMembers: {
    type: Number,
    default: 0,
  },
  maxMembers: {
    type: Number,
    default: 0,
  },
  meetingDay: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  },
  meetingFrequency: {
    type: String,
    enum: ['Once Every Week', 'Once Every Two Weeks', 'Once Every Month'],
  },
  unionAddress: {
    type: String,
    trim: true,
  },
  createdBy: {
    type: Number, // staff ID
    required: true,
  },
  offlineId: {
    type: String,
    default: null,
  },
  groupType: {
    type: String,
    enum: ['Union', 'Association', 'Cooperative', 'Other'],
    default: 'Union',
  },
  unionPurseAccount: {
    type: Number,
    default: 0,
  },
  migrationId: {
    type: String,
    default: null,
  },
  
  // Migration reference fields (ADD THESE)
  mysqlId: {
    type: Number, // Original MySQL ID
    sparse: true
  },
  originalData: {
    type: mongoose.Schema.Types.Mixed, // Store original MySQL data if needed
    default: null
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: false // Disable automatic timestamps since we have custom ones
});

// Pre-save middleware to update memberCount and timestamps
groupSchema.pre('save', function (next) {
  // Update memberCount based on members array length
  if (Array.isArray(this.members)) {
    this.memberCount = this.members.length;
  } else {
    this.memberCount = 0;
    this.members = [];
  }
  
  // Always update updatedAt
  this.updatedAt = new Date();
  
  next();
});

// Pre-update middleware for findOneAndUpdate operations
groupSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  
  // If members array is being updated, update memberCount too
  if (update.$set && update.$set.members) {
    update.$set.memberCount = update.$set.members.length;
  } else if (update.members) {
    update.memberCount = update.members.length;
  }
  
  // Always update updatedAt
  if (update.$set) {
    update.$set.updatedAt = new Date();
  } else {
    update.updatedAt = new Date();
  }
  
  next();
});

// Indexes for fast queries
groupSchema.index({ groupCode: 1 }, { unique: true });
groupSchema.index({ groupName: 'text' });
groupSchema.index({ branch: 1 });
groupSchema.index({ relationshipManager: 1 });
groupSchema.index({ status: 1 });
groupSchema.index({ legacyId: 1 }, { unique: true, sparse: true });
groupSchema.index({ mysqlId: 1 }, { sparse: true });

// Virtual for formatted group display
groupSchema.virtual('displayName').get(function() {
  return `${this.groupCode} - ${this.groupName}`;
});

// Method to check if group can accept more members
groupSchema.methods.canAddMember = function() {
  if (this.maxMembers === 0) return true; // No limit
  return this.memberCount < this.maxMembers;
};

// Method to add member to group
groupSchema.methods.addMember = function(customerId) {
  if (!this.members.includes(customerId)) {
    this.members.push(customerId);
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to remove member from group
groupSchema.methods.removeMember = function(customerId) {
  this.members = this.members.filter(member => member !== customerId);
  return this.save();
};

// Static method to find active groups by branch
groupSchema.statics.findActiveByBranch = function(branchId) {
  return this.find({ branch: branchId, status: 'active' });
};

// Static method to find by legacy ID
groupSchema.statics.findByLegacyId = function(legacyId) {
  return this.findOne({ legacyId: Number(legacyId) });
};

// Static method to find by MySQL ID
groupSchema.statics.findByMysqlId = function(mysqlId) {
  return this.findOne({ mysqlId: Number(mysqlId) });
};

// Static method to get group by code
groupSchema.statics.findByGroupCode = function(groupCode) {
  return this.findOne({ groupCode: groupCode.toUpperCase() });
};

export default mongoose.model('Group', groupSchema);