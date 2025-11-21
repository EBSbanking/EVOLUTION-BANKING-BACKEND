// models/AuditTrail.js
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
      alias: 'IP_ADDRESS' 
    },
    timestamp: { 
      type: Date, 
      default: Date.now, 
      required: true 
    },
    entity_type: { 
      type: String, 
      required: true,
      alias: 'ENTITY_TYPE'
    },
    entity_id: { 
      type: mongoose.Schema.Types.Mixed,
      required: true,
      alias: 'ENTITY_ID'
    },
    status: { 
      type: String, 
      enum: ['SUCCESS', 'FAILED', 'PENDING'], 
      default: 'SUCCESS' 
    },
    description: { 
      type: String,
      alias: 'DESCRIPTION'
    },
    reference_no: { 
      type: String,
      alias: 'REFERENCE_NO'
    },
    account_no: { 
      type: String,
      alias: 'ACCOUNT_NO'
    },
    additional_info: { 
      type: mongoose.Schema.Types.Mixed,
      alias: 'ADDITIONAL_INFO'
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

// Pre-save hook to generate event_id if not provided
auditTrailSchema.pre('save', async function (next) {
  if (!this.event_id) {
    try {
      const lastAudit = await this.constructor.findOne().sort({ event_id: -1 });
      this.event_id = lastAudit && lastAudit.event_id ? lastAudit.event_id + 1 : 1;
    } catch (error) {
      this.event_id = Date.now();
    }
  }
  next();
});

const AuditTrail = mongoose.models.AuditTrail || mongoose.model('AuditTrail', auditTrailSchema);

// Simple, clean addAuditTrail function that matches your usage
export const addAuditTrail = async (auditData, session = null) => {
  try {
    const {
      EVENT_TYPE,
      USER_ID,
      ACTION,
      NEW_VALUE,
      OLD_VALUE,
      IP_ADDRESS,
      ENTITY_ID,
      ENTITY_TYPE,
      STATUS,
      DESCRIPTION,
      REFERENCE_NO,
      ACCOUNT_NO
    } = auditData;

    // Validate required fields
    if (!EVENT_TYPE || !USER_ID || !ACTION || !ENTITY_ID || !ENTITY_TYPE) {
      console.warn('Skipping audit trail: missing required fields', {
        EVENT_TYPE, USER_ID, ACTION, ENTITY_ID, ENTITY_TYPE
      });
      return null;
    }

    // Generate event_id
    let event_id;
    try {
      const lastAudit = await AuditTrail.findOne().sort({ event_id: -1 });
      event_id = lastAudit && lastAudit.event_id ? lastAudit.event_id + 1 : 1;
    } catch (error) {
      event_id = Date.now();
    }

    const auditTrail = new AuditTrail({
      event_id,
      event_type: EVENT_TYPE,
      user_id: USER_ID,
      action: ACTION,
      new_value: NEW_VALUE || {},
      old_value: OLD_VALUE || null,
      ip_address: String(IP_ADDRESS || '127.0.0.1'),
      entity_id: ENTITY_ID,
      entity_type: ENTITY_TYPE,
      status: STATUS || 'SUCCESS',
      description: DESCRIPTION,
      reference_no: REFERENCE_NO,
      account_no: ACCOUNT_NO,
      timestamp: new Date()
    });

    const options = session ? { session } : {};
    await auditTrail.save(options);
    
    console.log('✅ Audit trail created:', {
      event_type: EVENT_TYPE,
      entity_type: ENTITY_TYPE,
      entity_id: ENTITY_ID
    });
    
    return auditTrail;
  } catch (error) {
    console.error('❌ Error creating audit trail:', {
      error: error.message,
      auditData: {
        EVENT_TYPE: auditData.EVENT_TYPE,
        ENTITY_TYPE: auditData.ENTITY_TYPE,
        ENTITY_ID: auditData.ENTITY_ID
      }
    });
    return null;
  }
};

// Add this to your AuditTrail.js file (at the bottom, before export default)

// Alternative function with different parameter order for backward compatibility
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
  return addAuditTrail({
    EVENT_TYPE: event_type,
    USER_ID: user_id,
    ACTION: action,
    NEW_VALUE: new_value,
    OLD_VALUE: old_value,
    IP_ADDRESS: ip_address,
    ENTITY_ID: entity_id,
    ENTITY_TYPE: entity_type,
    STATUS: 'SUCCESS',
    DESCRIPTION: additional_info?.description,
    REFERENCE_NO: additional_info?.reference_no,
    ACCOUNT_NO: additional_info?.account_no
  });
};

export default AuditTrail;