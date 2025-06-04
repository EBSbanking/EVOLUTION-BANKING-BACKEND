import mongoose from 'mongoose';

const auditTrailSchema = new mongoose.Schema({
  event_id: {
    type: Number,
    required: true,
    unique: true,
  },
  user_id: {
    type: mongoose.Schema.Types.String, // Assuming `id` in Users is a string
    ref: 'User', // Reference to the Users model
    required: true,
  },
  event_type: {
    type: String,
    required: true,
  },
  action: {
    type: String,
    required: true,
  },
  old_value: {
    type: mongoose.Schema.Types.Mixed, // JSONB equivalent in Mongoose
    default: null,
  },
  new_value: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  ip_address: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
  },
}, {
  collection: 'audit_trail',
  versionKey: false,
});

const AuditTrail = mongoose.model('AuditTrail', auditTrailSchema);
export default AuditTrail;
