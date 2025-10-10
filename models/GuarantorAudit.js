// models/GuarantorAudit.js
import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const RelationshipOfficerSchema = new mongoose.Schema({
  id: {
    type: String,
    required: false, // set to true if always mandatory
  },
  name: {
    type: String,
    required: false, // set to true if always mandatory
  }
}, { _id: false }); // prevent creating an extra _id for nested schema

const GuarantorAuditSchema = new mongoose.Schema({
  guarantorId: {
    type: Number,  // Using Number as you specified
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
      "APPROVED",   // ✅ added
      "REJECTED"    // ✅ added
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
  timestamps: true // adds createdAt & updatedAt automatically
});

// Enable pagination
GuarantorAuditSchema.plugin(mongoosePaginate);

const GuarantorAudit =
  mongoose.models.GuarantorAudit ||
  mongoose.model('GuarantorAudit', GuarantorAuditSchema);

export default GuarantorAudit;
