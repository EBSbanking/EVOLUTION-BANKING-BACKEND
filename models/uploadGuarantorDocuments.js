import mongoose from 'mongoose';

const UploadGuarantorDocumentsSchema = new mongoose.Schema({
  GUARANTOR_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guarantor',
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  public_id: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  format: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: String,
    default: 'System'
  },
  docType: {
    type: String,
    enum: ['IMAGE', 'DOCUMENT'],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  versionKey: false
});

// Add index for better query performance
UploadGuarantorDocumentsSchema.index({ GUARANTOR_ID: 1, docType: 1 });

const UploadGuarantorDocuments = mongoose.model('UploadGuarantorDocuments', UploadGuarantorDocumentsSchema);

export default UploadGuarantorDocuments;