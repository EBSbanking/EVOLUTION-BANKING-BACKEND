import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

// Define status constants for consistent usage
const STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED'
};

const PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

const WFWorkItemSchema = new mongoose.Schema({
  WORK_ITEM_ID: {
    type: Number,
    unique: true
  },
  processId: {
    type: String,
    required: true,
    alias: 'BUS_PROC_ID'
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    alias: 'ITEM_ID'
  },
  entityType: {
    type: String,
    required: true,
    alias: 'ITEM_CLASS_NM'
  },
  currentStep: {
    type: String,
    required: true,
    alias: 'SUB_PROC_ID'
  },
  assignedTo: {
    type: String,
    required: true,
    alias: 'TARGET_USER_ROLE_ID'
  },
  dueDate: {
    type: Date,
    required: true,
    alias: 'DEADLINE_TM',
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Default to 7 days from now
  },
  status: {
    type: String,
    required: true,
    enum: Object.values(STATUS),
    alias: 'WAIT_ST',
    default: STATUS.PENDING
  },
  createdBy: {
    type: String,
    required: true,
    alias: 'USER_ID'
  },
  priority: {
    type: String,
    required: true,
    enum: Object.values(PRIORITY),
    default: PRIORITY.MEDIUM
  },
  metadata: {
    type: Object,
    default: {},
    alias: 'ITEM_VALUE'
  },

  // Additional legacy fields
  QUEUE_ID: { type: Number },
  ITEM_DESC: { type: String },
  CUST_ID: { type: Number },
  REC_ST: { type: String, default: 'Active' },
  VERSION: { type: Number, default: 1 },
  BU_ID: { type: String },
  ITEM_TYPE: { type: String },
  ITEM_REF_NO: { type: Number },
  ESCALATION_TM: { type: Number },
  ITEM_BU_ID: { type: String }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    getters: true,
    transform: function (doc, ret) {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    getters: true
  }
});

// Add pagination plugin
WFWorkItemSchema.plugin(mongoosePaginate);

// ======================
// MIDDLEWARE
// ======================

// Validate and sync status fields with case normalization
WFWorkItemSchema.pre('validate', function (next) {
  // 🟣 Normalize status and WAIT_ST to uppercase
  if (this.status && typeof this.status === 'string') {
    this.status = this.status.toUpperCase();
  }

  if (this.WAIT_ST && typeof this.WAIT_ST === 'string') {
    this.WAIT_ST = this.WAIT_ST.toUpperCase();
  }

  // 🟢 Ensure status and WAIT_ST are in sync
  if (this.isModified('status') || this.isModified('WAIT_ST')) {
    if (this.status && this.WAIT_ST && this.status !== this.WAIT_ST) {
      this.WAIT_ST = this.status;
    } else if (this.status && !this.WAIT_ST) {
      this.WAIT_ST = this.status;
    } else if (!this.status && this.WAIT_ST) {
      this.status = this.WAIT_ST;
    }
  }

  // ✅ Validate enum values
  if (this.status && !Object.values(STATUS).includes(this.status)) {
    return next(new Error(`Invalid status value: ${this.status}`));
  }

  if (this.WAIT_ST && !Object.values(STATUS).includes(this.WAIT_ST)) {
    return next(new Error(`Invalid WAIT_ST value: ${this.WAIT_ST}`));
  }

  if (this.priority && !Object.values(PRIORITY).includes(this.priority)) {
    return next(new Error(`Invalid priority value: ${this.priority}`));
  }

  next();
});

// Auto-increment WORK_ITEM_ID
WFWorkItemSchema.pre('save', async function (next) {
  if (!this.WORK_ITEM_ID) {
    const lastItem = await this.constructor.findOne({}, {}, {
      sort: { WORK_ITEM_ID: -1 }
    });
    this.WORK_ITEM_ID = lastItem ? lastItem.WORK_ITEM_ID + 1 : 1;
  }
  next();
});

// Status update hook for findOneAndUpdate operations
WFWorkItemSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  const status = update.status || (update.$set && update.$set.status);

  if (status === STATUS.APPROVED) {
    update.$set = update.$set || {};
    update.$set.REC_ST = 'Completed';
  } else if (status === STATUS.REJECTED) {
    update.$set = update.$set || {};
    update.$set.REC_ST = 'Rejected';
  }

  next();
});

// ======================
// METHODS
// ======================

WFWorkItemSchema.methods.triggerNotification = async function (options = {}) {
  try {
    console.log('Triggering notification for:', {
      workItemId: this.WORK_ITEM_ID,
      process: this.processId,
      entity: this.entityId,
      status: this.status,
      ...options
    });

    // Your custom notification service can be called here
    return {
      success: true,
      message: 'Notification processed',
      workItemId: this.WORK_ITEM_ID,
      status: this.status
    };
  } catch (error) {
    console.error('Notification error:', error);
    throw error;
  }
};

// ======================
// STATICS
// ======================

WFWorkItemSchema.statics.findByStatus = function (status) {
  return this.find({ status });
};

WFWorkItemSchema.statics.findPendingItems = function () {
  return this.find({ status: STATUS.PENDING });
};

const WFWorkItem = mongoose.model('WFWorkItem', WFWorkItemSchema);
export default WFWorkItem;