// models/WF_WORK_ITEM.js
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
    required: true,
    unique: true
  },
  processId: {
    type: Number,            // corresponds to BUS_PROC_ID
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
    type: Number,            // corresponds to SUB_PROC_ID
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
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
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

  // Additional/legacy fields
  QUEUE_ID: { type: Number, required: true },
  ITEM_DESC: { type: String },
  CUST_ID: { type: Number },
  REC_ST: { type: String, default: 'Active' },
  VERSION: { type: Number, default: 1 },
  BU_ID: { type: String },
  ITEM_TYPE: { type: String },
  ITEM_REF_NO: { type: Number },
  ESCALATION_TM: { type: Number },
  ITEM_BU_ID: { type: String },
  EVENT_ID: { type: Number, required: true }, // based on your generator
  JOURNAL_ID: { type: Number },               // if you're storing it
  TRANSACTION_ID: { type: Number }            // if you're storing it
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

// Export the model
const WFWorkItem = mongoose.model('WFWorkItem', WFWorkItemSchema);
export default WFWorkItem;
