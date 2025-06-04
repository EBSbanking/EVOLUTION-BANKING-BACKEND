import mongoose from 'mongoose';

const customerTypeSchema = new mongoose.Schema({
  CUST_TY_ID: {
    type: Number,
    autoIncrement: true,    // Note: Mongoose doesn't support autoIncrement by default, see note below
    unique: true,
    required: true,
  },
  CUST_TY: {
    type: String,
    maxlength: 50,
    required: true,
  },
  CUST_CAT: {
    type: String,
    enum: ['INDIVIDUAL', 'CORPORATE', 'SME', 'GOVERNMENT', 'STAFF'],
    required: true,
  },
  DESCRIPTION: {
    type: String,
    required: true,
  },
  REC_ST: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    required: true,
    default: 'ACTIVE',
  },
  MIN_AGE: {
    type: Number,
    required: true,
  },
  MAX_AGE: {
    type: Number,
    required: true,
  }
}, {
  collection: 'CUSTOMER_TYPE', // MongoDB collection name
  timestamps: true,            // createdAt and updatedAt fields
  // No direct equivalent of paranoid (soft delete) in Mongoose; implement with plugins if needed
});



const CustomerType = mongoose.models.CustomerType || mongoose.model('CustomerType', customerTypeSchema);

export default CustomerType;
