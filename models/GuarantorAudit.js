// models/GuarantorAudit.js
import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const GuarantorAuditSchema = new mongoose.Schema({
  guarantorId: {
    type: Number,  // Changed from ObjectId to Number
    required: true
  },
  action: {
    type: String,
    enum: ["CREATE", "UPDATE", "DEACTIVATE", "REACTIVATE", "DELETE"],
    required: true
  },
  changedFields: [String],
  previousValues: mongoose.Schema.Types.Mixed,
  performedBy: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  notes: String,
  ipAddress: String,
  relationshipOfficer: {
    id: String,
    name: String
  }
}, {
  timestamps: true
});

// Enable pagination
GuarantorAuditSchema.plugin(mongoosePaginate);

const GuarantorAudit = mongoose.models.GuarantorAudit || 
  mongoose.model('GuarantorAudit', GuarantorAuditSchema);

export default GuarantorAudit;