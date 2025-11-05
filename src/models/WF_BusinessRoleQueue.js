import mongoose from 'mongoose';

const wfBusinessRoleQueueSchema = new mongoose.Schema({
  BUS_ROLE_QUEUE_ID: {
    type: String, // Unique identifier for the business role queue
    required: true,
   
  },
  ROLE_ID: {
    type: String, // Role ID (e.g., "Manager", "Approver")
    required: true,
  },
  QUEUE_ID: {
    type: String, // Queue ID (e.g., unique identifier for the queue)
    required: true,
  },
  REC_ST: {
    type: String, // Record status (e.g., "Active", "Inactive")
    required: true,
  },
  VERSION: {
    type: String, // Version of the queue data (e.g., "1.0")
    required: true,
  },
  ROW_TS: {
    type: Date, // Timestamp when the row was last updated
    required: true,
    default: Date.now,
  },
  USER_ID: {
    type: String, // User ID associated with the record
    required: true,
  },
  CREATE_DT: {
    type: Date, // Date when the record was created
    required: true,
    default: Date.now,
  },
  CREATED_BY: {
    type: String, // User or system who created the record
    required: true,
  },
  SYS_CREATE_TS: {
    type: Date, // System timestamp when the record was created
    required: true,
    default: Date.now,
  },
  ITEM_ACCESS_RIGHT: {
    type: String, // Access rights for the item in the queue (e.g., "Read", "Write")
    required: false,
  },
});

const WF_BusinessRoleQueue = mongoose.model('WF_BusinessRoleQueue', wfBusinessRoleQueueSchema);

export default WF_BusinessRoleQueue;
