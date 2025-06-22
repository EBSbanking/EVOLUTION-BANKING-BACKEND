import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2'; // <-- Add this

// Define the schema
const WF_WORK_ITEMSchema = new mongoose.Schema({
  WORK_ITEM_ID: { type: Number, required: true, unique: true },
  BUS_PROC_ID: { type: Number, required: true },
  SUB_PROC_ID: { type: Number, required: true },
  QUEUE_ID: { type: Number, required: true },
  ITEM_VALUE: { type: Buffer, required: false },
  ITEM_DESC: { type: String, required: false },
  ITEM_CLASS_NM: { type: String, required: false },
  EVENT_ID: { type: Number, required: true },
  CUST_ID: { type: Number, required: true },
  REC_ST: { type: String, default: 'Active' },
  VERSION: { type: Number, default: 1 },
  ROW_TS: { type: Date, default: Date.now },
  USER_ID: { type: String, required: true },
  BU_ID: { type: String, required: true },
  CREATE_DT: { type: Date, default: Date.now },
  SYS_CREATE_TS: { type: Date, default: Date.now },
  WAIT_ST: { type: String, default: 'Pending' },
  MAX_DELAY_TM: { type: Number, required: false },
  DEADLINE_TM: { type: Date, required: false },
  ORIGINATOR_USER_ROLE_ID: { type: String, required: true },
  WORK_ITEM_SESSION_ID: { type: Number, required: false },
  ITEM_REF_NO: { type: Number, required: true },
  TARGET_DUR_TM: { type: Number, required: false },
  ESCALATION_TM: { type: Number, required: false },
  ITEM_BU_ID: { type: String, required: false },
  ITEM_TYPE: { type: String, required: true },
  ITEM_ID: { type: Number, required: true },
  TARGET_USER_ROLE_ID: { type: String, required: false },
}, {
  timestamps: true // Enables createdAt and updatedAt fields
});

// ✅ Add pagination plugin
WF_WORK_ITEMSchema.plugin(mongoosePaginate);

// Auto-update REC_ST if WAIT_ST is Approved
WF_WORK_ITEMSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();

  if (update.WAIT_ST === 'Approved' && !update.REC_ST) {
    update.REC_ST = 'Completed';
  }

  next();
});

// Optional: Notification mock method
WF_WORK_ITEMSchema.methods.triggerNotification = async function (options) {
  console.log('Triggering notification for workflow item:', this);
  return {
    success: true,
    message: 'Notification triggered successfully',
  };
};

const WF_WORK_ITEM = mongoose.model('WF_WORK_ITEM', WF_WORK_ITEMSchema);
export default WF_WORK_ITEM;
