// models/Bank.js
import mongoose from 'mongoose';

const bankSchema = new mongoose.Schema(
  {
    // Core Identifiers
    id: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    long_code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    last_updated: {
      type: Date,
      default: Date.now,
    },
    
    // Additional fields you might want
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
      default: 'ACTIVE',
    },
    country: {
      type: String,
      default: 'NG',
      maxlength: 3,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.bank_id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Virtual for bank display name
bankSchema.virtual('displayName').get(function() {
  return `${this.name} (${this.code})`;
});

// Indexes
bankSchema.index({ code: 1 }, { unique: true });
bankSchema.index({ name: 1 });
bankSchema.index({ status: 1 });

// Static method to find active banks
bankSchema.statics.findActive = function() {
  return this.find({ status: 'ACTIVE' });
};

// Static method to find by code
bankSchema.statics.findByCode = function(code) {
  return this.findOne({ code: code.toUpperCase() });
};

// Instance method to check if bank is active
bankSchema.methods.isActive = function() {
  return this.status === 'ACTIVE';
};

const Bank = mongoose.models.Bank || mongoose.model('Bank', bankSchema);

export default Bank;