import mongoose from 'mongoose';

const loanEventSchema = new mongoose.Schema({
  ACCT_NO: { type: String, required: true },
  eventType: { type: String, required: true }, // e.g., 'SERVICING_UPDATE'
  status: { type: String, required: true }, // 'SERVICED' | 'UNSERVICED'
  installmentNumber: { type: Number },
  details: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now },
  createdBy: String
});

export default mongoose.model('LoanEvent', loanEventSchema);