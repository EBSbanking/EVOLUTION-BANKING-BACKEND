import mongoose from 'mongoose';
import moment from 'moment-timezone';

const auditTrailSchema = new mongoose.Schema(
  {
    event_id: { 
      type: Number, 
      unique: true, 
      required: true,
      index: true 
    },
    _id: { 
      type: mongoose.Schema.Types.ObjectId, 
      default: () => new mongoose.Types.ObjectId() 
    },
    user_id: { 
      type: String, 
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
    entity_type: { 
      type: String, 
      default: 'general' 
    },
    entity_id: { 
      type: mongoose.Schema.Types.Mixed, // CHANGED: Now accepts any type
      default: null 
    },
    status: { 
      type: String, 
      enum: ['SUCCESS', 'FAILED', 'PENDING'], 
      default: 'SUCCESS' 
    },
    description: { 
      type: String 
    },
    reference_no: { 
      type: String 
    },
    account_no: { 
      type: String 
    },
    additional_info: { 
      type: mongoose.Schema.Types.Mixed 
    },
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

// // Indexes
// auditTrailSchema.index({ event_id: 1 });
// auditTrailSchema.index({ user_id: 1 });
// auditTrailSchema.index({ event_type: 1 });
// auditTrailSchema.index({ timestamp: -1 });
// auditTrailSchema.index({ account_no: 1 });
// auditTrailSchema.index({ entity_id: 1 }); // Added index for entity_id

// Pre-save hook to generate event_id if not provided
auditTrailSchema.pre('save', async function (next) {
  if (!this.event_id) {
    try {
      const lastAudit = await this.constructor.findOne().sort({ event_id: -1 });
      this.event_id = lastAudit && lastAudit.event_id ? lastAudit.event_id + 1 : 1;
    } catch (error) {
      // Fallback: use timestamp if database query fails
      this.event_id = Date.now();
    }
  }
  next();
});

const AuditTrail = mongoose.models.AuditTrail || mongoose.model('AuditTrail', auditTrailSchema);

// Enhanced audit logging function with better error handling
export const logAuditTrail = async (
  entity_type,
  entity_id,
  user_id,
  action,
  old_value,
  new_value,
  ip_address,
  event_type = 'GENERAL',
  additional_info = null
) => {
  try {
    // Generate event_id first to ensure it's always available
    let event_id;
    try {
      const lastAudit = await AuditTrail.findOne().sort({ event_id: -1 });
      event_id = lastAudit && lastAudit.event_id ? lastAudit.event_id + 1 : 1;
    } catch (error) {
      // Fallback if we can't query the database
      event_id = Date.now();
    }

    const auditLog = new AuditTrail({
      entity_type: entity_type || 'general',
      entity_id: entity_id, // Can now be string, ObjectId, number, or any value
      user_id: user_id || 'system',
      action: action || 'UNKNOWN',
      old_value: old_value,
      new_value: new_value || {}, // Ensure new_value is never null
      ip_address: ip_address || '0.0.0.0',
      event_type: event_type,
      additional_info: additional_info,
      timestamp: new Date(),
      event_id: event_id // Explicitly set event_id to avoid validation errors
    });

    await auditLog.save();
    return auditLog;
  } catch (error) {
    console.error('❌ Error logging audit trail:', {
      error: error.message,
      entity_type,
      entity_id,
      user_id,
      action,
      event_type
    });
    
    // Don't throw the error to prevent breaking the application
    // Just log it and return null so the main application continues
    return null;
  }
};

export default AuditTrail;