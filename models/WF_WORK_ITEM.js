import mongoose from 'mongoose';

// Define the schema as you have it
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
  WAIT_ST: { type: String, required: false },
  MAX_DELAY_TM: { type: Number, required: false },
  DEADLINE_TM: { type: Date, required: false },
  ORIGINATOR_USER_ROLE_ID: { type: String, required: true },
  WORK_ITEM_SESSION_ID: { type: Number, required: false },
  ITEM_REF_NO: { type: Number, required: true },
  TARGET_DUR_TM: { type: Number, required: false },
  ESCALATION_TM: { type: Number, required: false },
  ITEM_BU_ID: { type: String, required: false },
  ITEM_TYPE: { type: String, required: false },
  ITEM_ID: { type: Number, required: true },
  TARGET_USER_ROLE_ID: { type: String, required: false },
});

// Schema validation hook (pre-update hook)
WF_WORK_ITEMSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();

  // Check if WAIT_ST is being updated to "Approved" and REC_ST is not set
  if (update.WAIT_ST === 'Approved' && !update.REC_ST) {
    // Automatically set REC_ST to "Completed" if not provided
    this.set('REC_ST', 'Completed');
  }

  next();
});

// Adding triggerNotification method to the schema
WF_WORK_ITEMSchema.methods.triggerNotification = async function(options) {
  console.log('Triggering notification for workflow item:', this);

  return {
    success: true,
    message: 'Notification triggered successfully',
  };
};

const WF_WORK_ITEM = mongoose.model('WF_WORK_ITEM', WF_WORK_ITEMSchema);
export default WF_WORK_ITEM;
