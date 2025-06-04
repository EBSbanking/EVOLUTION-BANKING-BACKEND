// models/OverdueLoan.js
import mongoose from 'mongoose';

const OverdueLoanSchema = new mongoose.Schema({
  loan_id: {
    type: Number,
    required: true,
    unique: true
  },
  cust_id: {
    type: Number,
    required: true
  },
  amount_due: {
    type: Number,
    required: true
  },
  due_date: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    required: true,
    default: 'Pending'
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  versionKey: false, // disable __v field
  timestamps: false // disables createdAt and updatedAt auto fields
});

const OverdueLoan = mongoose.model('OverdueLoan', OverdueLoanSchema);

export default OverdueLoan;
