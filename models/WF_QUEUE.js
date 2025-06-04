import mongoose from 'mongoose';

// Define the schema for WF_QUEUE

    const wfQueueSchema = new mongoose.Schema({
        QUEUE_ID: { type: Number, required: true },
        BUS_PROC_ID: { type: Number, required: true },
        QUEUE_CD: { type: String, required: false },
        QUEUE_DESC: { type: String, required: false },
        QUEUE_TY: { type: String, required: true },
        TARGET_DURATION_PD_CD: { type: String, required: false },
        TARGET_DURATION_VALUE: { type: Number, required: false },
        MAX_DURATION_PD_CD: { type: String, required: false },
        MAX_DURATION_VALUE: { type: Number, required: false },
        DEADLINE_PD_CD: { type: String, required: false },
        DEADLINE_VALUE: { type: Number, required: false },
        DEADLINE_ALERT_RECIPIENT_ID: { type: String, required: false },
        PRIORITY_LEVEL: { type: String, required: false },
        REC_ST: { type: String, required: true },
        VERSION_NO: { type: Number, required: true },
        ROW_TS: { type: Date, required: true, default: Date.now },
        USER_ID: { type: String, required: true },
        NOTIFY_ORIGINATOR_FG: { type: String, required: true },
        ESCALATION_TIME_VALUE: { type: Number, required: false },
        ESCALATION_TIME_CD: { type: String, required: false },
        ESCALATION_AUDIANCE_ID: { type: String, required: false },
        PARTICIPANT_TYPE: { type: String },
        ITEM_NOTIFY_REQ_FG: { type: Boolean, required: false },
        BU_PRIMARY_VISIBILITY: { type: String, required: true },
      });
      

// Create and export the model
const WF_QUEUE = mongoose.model('WF_QUEUE', wfQueueSchema);

export default WF_QUEUE;
