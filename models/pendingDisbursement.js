import mongoose from 'mongoose';

const pendingDisbursementSchema = new mongoose.Schema({
  workItemId: {
    type: String,
    required: true,
    index: true
  },
  loanAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
    required: true
  },
  transactionData: {
    type: Object,
    required: true
  },
  status: { 
    type: String, 
    enum: ['PENDING', 'APPROVED', 'REJECTED'], 
    default: 'PENDING',
    index: true
  },
  createdBy: {
    type: String,
    required: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  approvedBy: {
    type: String,
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  loanAccountNo: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  }
}, {
  timestamps: false,
  versionKey: false
});

// Indexes
pendingDisbursementSchema.index({ loanAccountId: 1, status: 1 });
pendingDisbursementSchema.index({ createdAt: 1 });

const PendingDisbursement = mongoose.model('PendingDisbursement', pendingDisbursementSchema);

export default PendingDisbursement;