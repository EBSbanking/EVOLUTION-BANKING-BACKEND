// models/organization.js
import mongoose from 'mongoose';

const OrganizationSchema = new mongoose.Schema({
  organizationName: {
    type: String,
    required: [true, 'organizationName is required'],
    unique: true,
    trim: true
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
  collection: 'organizations',
  versionKey: false
});

export default mongoose.model('Organization', OrganizationSchema);