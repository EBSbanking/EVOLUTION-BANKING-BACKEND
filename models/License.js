import mongoose from 'mongoose';

const LicenseSchema = new mongoose.Schema({
  expires: {
    type: Date,
    required: true
  },
  issued_to: {
    type: String,
    required: true,
    trim: true
  },
  license_type: {
    type: String,
    enum: ['Standard', 'Pro', 'Enterprise'],
    default: 'Standard'
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  encrypted_key: {
    type: String,
    required: true,
    unique: true // ✅ Prevent reuse
  },
  is_used: {
    type: Boolean,
    default: false // ✅ Track if it's been used
  },
  used_at: {
    type: Date,
    default: null // ✅ When it was used
  }
});

export default mongoose.model('License', LicenseSchema);
