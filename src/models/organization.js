import mongoose from 'mongoose';

const OrganizationSchema = new mongoose.Schema({
  organizationName: {
    type: String,
    required: [true, 'organizationName is required'],
    unique: true,
    trim: true,
    minlength: [2, 'Organization name must be at least 2 characters long'],
    maxlength: [100, 'Organization name cannot exceed 100 characters']
  },
  organizationCode: {
    type: Number,
    required: [true, 'organizationCode is required'],
    unique: true,
    
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  contactEmail: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
  },
  phoneNumber: {
    type: String,
    trim: true,
    match: [/^\+?[\d\s\-()]{10,}$/, 'Please enter a valid phone number']
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
    default: 'ACTIVE'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'organizations',
  versionKey: false,
  timestamps: false // We're handling createdAt/updatedAt manually
});

// Index for better query performance
OrganizationSchema.index({ organizationName: 1 });
OrganizationSchema.index({ organizationCode: 1 });
OrganizationSchema.index({ status: 1 });
OrganizationSchema.index({ createdAt: -1 });

// Pre-save middleware to update updatedAt
OrganizationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to find active organizations
OrganizationSchema.statics.findActive = function() {
  return this.find({ status: 'ACTIVE' });
};

// Instance method to check if organization is active
OrganizationSchema.methods.isActive = function() {
  return this.status === 'ACTIVE';
};

export default mongoose.model('Organization', OrganizationSchema);