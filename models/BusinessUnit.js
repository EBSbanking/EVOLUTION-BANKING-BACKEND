import mongoose from 'mongoose';

const BusinessUnitSchema = new mongoose.Schema({
  BU_ID: {
    type: String,
    required: true,
    unique: true,
    match: [/^\d{3}$/, 'BU_ID must be a 3-digit string'],
    trim: true
  },
  BUSINESS_UNIT: { type: String, required: true, trim: true },
  DESCRIPTION: { type: String, required: true, trim: true },
  ADDRESS: { type: String, required: true, trim: true },
  created_at: { type: Date, default: Date.now }
});

BusinessUnitSchema.index({ BU_ID: 1 }, { unique: true });

const BusinessUnit = mongoose.model('BusinessUnit', BusinessUnitSchema);

export default BusinessUnit;