import mongoose from 'mongoose';
import moment from 'moment-timezone';

const auditTrailSchema = new mongoose.Schema(
  {
    event_id: { type: Number, unique: true, required: true }, // Changed to required per second schema
    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    user_id: { type: String, ref: 'User', required: true, alias: 'USER_ID' },
    event_type: { type: String, required: true, alias: 'EVENT_TYPE' },
    action: { type: String, required: true, alias: 'ACTION' },
    old_value: { type: mongoose.Schema.Types.Mixed, default: null, alias: 'OLD_VALUE' },
    new_value: { type: mongoose.Schema.Types.Mixed, required: true, alias: 'NEW_VALUE' },
    ip_address: { type: String, required: true, alias: 'ipAddress' },
    timestamp: { type: Date, default: Date.now, required: true },
    entity_type: { type: String, default: 'CustomerAccount' }, // For transactions, default to CustomerAccount
    entity_id: { type: mongoose.Schema.Types.ObjectId }, // Reference to CustomerAccount _id
    status: { type: String, enum: ['SUCCESS', 'FAILED', 'PENDING'], default: 'SUCCESS' },
    description: { type: String }, // From second schema
    reference_no: { type: String }, // From second schema
    account_no: { type: String }, // From second schema
    additional_info: { type: mongoose.Schema.Types.Mixed }, // For extensibility
  },
  {
    collection: 'audit_trail',
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true, getters: true },
    toObject: { virtuals: true, getters: true },
  }
);

// Virtuals for timezone
auditTrailSchema.virtual('timestamp_WAT').get(function () {
  return moment(this.timestamp).tz('Africa/Lagos').format();
});
auditTrailSchema.virtual('createdAt_WAT').get(function () {
  return moment(this.createdAt).tz('Africa/Lagos').format();
});
auditTrailSchema.virtual('updatedAt_WAT').get(function () {
  return moment(this.updatedAt).tz('Africa/Lagos').format();
});

// Indexes
auditTrailSchema.index({ event_id: 1 });
auditTrailSchema.index({ user_id: 1 });
auditTrailSchema.index({ event_type: 1 });
auditTrailSchema.index({ timestamp: -1 });
auditTrailSchema.index({ account_no: 1 }); // Added for transaction queries by account

// Pre-save hook to generate event_id if not provided
auditTrailSchema.pre('save', async function (next) {
  if (!this.event_id) {
    const lastAudit = await this.constructor.findOne().sort({ event_id: -1 });
    this.event_id = lastAudit && lastAudit.event_id ? lastAudit.event_id + 1 : 1;
  }
  next();
});

const AuditTrail = mongoose.models.AuditTrail || mongoose.model('AuditTrail', auditTrailSchema);
export default AuditTrail;