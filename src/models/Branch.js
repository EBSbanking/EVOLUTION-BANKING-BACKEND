import mongoose from 'mongoose';

const branchSchema = new mongoose.Schema({
  organizationName: {
    type: String,
    trim: true,
    required: true // Make required to ensure consistency
  },
  branchName: {
    type: String,
    required: true,
    trim: true
  },
  branchCode: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d{3}$/, 'Branch code must be a 3-digit number'] // Enforce 3-digit format like "010"
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});



export default mongoose.model('Branch', branchSchema);