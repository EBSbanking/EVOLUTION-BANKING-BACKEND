import mongoose from 'mongoose';
const { Schema } = mongoose;

// Enum for frequency
const frequencyEnum = ['daily', 'weekly', 'monthly', 'yearly'];

// Enum for status (approval workflow states)
const statusEnum = ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'];

const standingOrderSchema = new Schema({
  // Account references (using acctNo from your Accounts collection)
  customerAcctNo: {
    type: String,
    required: true,
    ref: 'Account'  // Assuming Account model has acctNo as the identifier
  },
  beneficiaryAcctNo: {
    type: String,
    required: true,
    ref: 'Account'
  },

  // Debit details
  amount: {
    type: Number,  // Or use mongoose.Types.Decimal128 for precision (recommended for NGN)
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'NGN',
    uppercase: true,
    enum: ['NGN']  // Only NGN as per your update
  },

  // Recurrence rules
  frequency: {
    type: String,
    required: true,
    enum: frequencyEnum
  },
  interval: {
    type: Number,
    default: 1,
    min: 1
  },

  // Weekly-specific
  dayOfWeek: {
    type: Number,
    min: 1,
    max: 7,  // 1=Monday, 7=Sunday
    required: function() { return this.frequency === 'weekly'; }
  },

  // Monthly-specific: Fixed day
  dayOfMonth: {
    type: Number,
    min: 1,
    max: 31,
    required: function() { 
      return this.frequency === 'monthly' && !this.weekOfMonth;
    }
  },

  // Monthly-specific: Week-based
  weekOfMonth: {
    type: Number,
    min: 1,
    max: 5,  // 1=first, ..., 5=last
    required: function() { 
      return this.frequency === 'monthly' && !this.dayOfMonth;
    }
  },

  // Schedule bounds
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: false  // NULL = indefinite
  },

  // Status and metadata
  status: {
    type: String,
    enum: statusEnum,
    default: 'PENDING_APPROVAL',
    required: true
  },
  isActive: {
    type: Boolean,
    default: false  // Initially inactive until approved
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',  // Reference to user who approved
    required: false
  },
  approvedAt: {
    type: Date,
    required: false
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',  // Reference to user who rejected
    required: false
  },
  rejectedAt: {
    type: Date,
    required: false
  },
  comments: {
    type: String,
    required: false,
    maxlength: 500
  },
  maxExecutions: {
    type: Number,
    min: 1,
    required: false
  },
  nextExecutionDate: {
    type: Date,
    required: false  // Computed by your cron job
  }
}, {
  timestamps: true  // Auto-adds createdAt/updatedAt
});

// Indexes for performance (e.g., query by customer and frequency)
standingOrderSchema.index({ customerAcctNo: 1, frequency: 1 });
standingOrderSchema.index({ nextExecutionDate: 1 });
standingOrderSchema.index({ status: 1 });  // NEW: Index for quick status queries

// Custom validation (e.g., ensure monthly has either dayOfMonth or weekOfMonth + dayOfWeek)
standingOrderSchema.pre('save', function(next) {
  if (this.frequency === 'monthly') {
    if (!this.dayOfMonth && (!this.weekOfMonth || !this.dayOfWeek)) {
      return next(new Error('Monthly orders require dayOfMonth or weekOfMonth + dayOfWeek'));
    }
    if (this.dayOfMonth && (this.weekOfMonth || this.dayOfWeek)) {
      return next(new Error('Use either dayOfMonth (fixed) or weekOfMonth + dayOfWeek (relative)'));
    }
  }

  // NEW: Sync isActive with status (active only if APPROVED)
  if (this.status === 'APPROVED') {
    this.isActive = true;
  } else if (['REJECTED', 'CANCELLED', 'EXPIRED'].includes(this.status)) {
    this.isActive = false;
  }

  next();
});

// Compound index for pending approvals
standingOrderSchema.index({ status: 'PENDING_APPROVAL', customerAcctNo: 1 });

const StandingOrder = mongoose.model('StandingOrder', standingOrderSchema);
export default StandingOrder;