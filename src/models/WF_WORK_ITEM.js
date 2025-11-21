import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

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
    required: [true, 'Work Item ID is required'],
    unique: true,
    index: true
  },
  processId: {
    type: Number,
    required: [true, 'Business Process ID is required'],
    alias: 'BUS_PROC_ID',
    index: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Entity ID is required'],
    alias: 'ITEM_ID'
  },
  entityType: {
    type: String,
    required: [true, 'Entity Type is required'],
    alias: 'ITEM_CLASS_NM'
  },
  currentStep: {
    type: Number,
    required: [true, 'Sub Process ID is required'],
    alias: 'SUB_PROC_ID'
  },
  assignedTo: {
    type: String,
    required: [true, 'Assigned To is required'],
    alias: 'TARGET_USER_ROLE_ID',
    trim: true
  },
  dueDate: {
    type: Date,
    required: [true, 'Due Date is required'],
    alias: 'DEADLINE_TM',
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: {
      values: Object.values(STATUS),
      message: '{VALUE} is not a valid status'
    },
    default: STATUS.PENDING
  },
  WAIT_ST: {
    type: String,
    required: [true, 'Wait Status is required'],
    enum: {
      values: Object.values(STATUS), // Same STATUS values
      message: '{VALUE} is not a valid wait status'
    },
    default: STATUS.PENDING
  },
  createdBy: {
    type: String,
    required: [true, 'Creator ID is required'],
    alias: 'USER_ID',
    trim: true
  },
  priority: {
    type: String,
    required: [true, 'Priority is required'],
    enum: {
      values: Object.values(PRIORITY),
      message: '{VALUE} is not a valid priority'
    },
    default: PRIORITY.MEDIUM
  },
  metadata: {
    type: Object,
    default: {},
    alias: 'ITEM_VALUE'
  },
  QUEUE_ID: {
    type: Number,
    required: [true, 'Queue ID is required']
  },
  ITEM_DESC: {
    type: String,
    required: [true, 'Item Description is required'],
    trim: true
  },
  CUST_ID: {
    type: String,
    required: [true, 'Customer ID is required'],
    trim: true
  },
  REC_ST: {
    type: String,
    default: 'Active'
  },
  VERSION: {
    type: Number,
    default: 1
  },
  BU_ID: {
    type: Number,
    required: [true, 'Business Unit ID is required']
  },
  ITEM_TYPE: {
    type: String,
    required: [true, 'Item Type is required']
  },
  ITEM_REF_NO: {
    type: Number,
    required: [true, 'Item Reference Number is required']
  },
  ESCALATION_TM: {
    type: Number
  },
  ITEM_BU_ID: {
    type: Number,
    required: [true, 'Item Business Unit ID is required']
  },
  EVENT_ID: {
    type: String,
    required: [true, 'Event ID is required']
  },
  JOURNAL_ID: {
    type: String
  },
  TRANSACTION_ID: {
    type: Number
  },
  ROW_TS: {
    type: Date,
    required: [true, 'Row Timestamp is required'],
    default: Date.now
  },
  CREATE_DT: {
    type: Date,
    required: [true, 'Create Date is required'],
    default: Date.now
  },
  SYS_CREATE_TS: {
    type: Date,
    required: [true, 'System Create Timestamp is required'],
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    getters: true,
    transform: (doc, ret) => {
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

// Pagination plugin
WFWorkItemSchema.plugin(mongoosePaginate);

// Pre-save middleware to keep status and WAIT_ST in sync
WFWorkItemSchema.pre('save', function(next) {
  // If WAIT_ST is modified, update status to match
  if (this.isModified('WAIT_ST') && this.WAIT_ST) {
    this.status = this.WAIT_ST;
  }
  // If status is modified, update WAIT_ST to match
  if (this.isModified('status') && this.status) {
    this.WAIT_ST = this.status;
  }
  next();
});

const WFWorkItem = mongoose.model('WFWorkItem', WFWorkItemSchema);
export default WFWorkItem;