import mongoose from 'mongoose';
import moment from 'moment-timezone';

export const auditTrailSchema = new mongoose.Schema({
  event_id: {
    type: Number,
    unique: true,
    required: false
  },
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId()
  },
  user_id: {
    type: String,
    ref: 'User',
    required: true,
    alias: 'USER_ID'
  },
  event_type: {
    type: String,
    required: true,
    alias: 'EVENT_TYPE'
  },
  action: {
    type: String,
    required: true,
    alias: 'ACTION'
  },
  old_value: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
    alias: 'OLD_VALUE'
  },
  new_value: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    alias: 'NEW_VALUE'
  },
  ip_address: {
    type: String,
    required: true,
    alias: 'ipAddress'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  entity_type: String,
  entity_id: mongoose.Schema.Types.ObjectId,
  status: String,
  additional_info: mongoose.Schema.Types.Mixed
}, {
  collection: 'audit_trail',
  timestamps: true,
  versionKey: false,
  toJSON: { virtuals: true, getters: true },
  toObject: { virtuals: true, getters: true }
});

// Add timezone-aware virtuals
auditTrailSchema.virtual('timestamp_WAT').get(function () {
  return moment(this.timestamp).tz('Africa/Lagos').format();
});

auditTrailSchema.virtual('createdAt_WAT').get(function () {
  return moment(this.createdAt).tz('Africa/Lagos').format();
});

auditTrailSchema.virtual('updatedAt_WAT').get(function () {
  return moment(this.updatedAt).tz('Africa/Lagos').format();
});

// Indexing
auditTrailSchema.index({ event_id: 1 });
auditTrailSchema.index({ user_id: 1 });
auditTrailSchema.index({ event_type: 1 });
auditTrailSchema.index({ timestamp: -1 });

const AuditTrail = mongoose.model('AuditTrail', auditTrailSchema);

export default AuditTrail;
