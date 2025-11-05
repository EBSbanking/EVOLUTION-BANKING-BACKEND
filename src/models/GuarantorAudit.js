// models/GuarantorAudit.js
import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const RelationshipOfficerSchema = new mongoose.Schema({
  id: {
    type: String,
    required: false,
  },
  name: {
    type: String,
    required: false,
  }
}, { _id: false });

const GuarantorAuditSchema = new mongoose.Schema({
  guarantorId: {
    type: Number,
    required: true
  },
  action: {
    type: String,
    enum: [
      "CREATE",
      "UPDATE",
      "DEACTIVATE",
      "REACTIVATE",
      "DELETE",
      "APPROVED",
      "REJECTED",
      "REMOVAL_REQUESTED", // ✅ ADD THIS
      "REMOVAL_APPROVED",  // ✅ ADD THIS  
      "REMOVAL_REJECTED",  // ✅ ADD THIS
      "REMOVAL_CANCELLED"  // ✅ ADD THIS
    ],
    required: true
  },
  changedFields: {
    type: [String],
    default: []
  },
  previousValues: {
    type: mongoose.Schema.Types.Mixed
  },
  performedBy: {
    type: String,
    required: true
  },
  notes: {
    type: String
  },
  ipAddress: {
    type: String
  },
  relationshipOfficer: {
    type: RelationshipOfficerSchema,
    default: {}
  }
}, {
  timestamps: true
});

GuarantorAuditSchema.plugin(mongoosePaginate);

const GuarantorAudit =
  mongoose.models.GuarantorAudit ||
  mongoose.model('GuarantorAudit', GuarantorAuditSchema);

export default GuarantorAudit;