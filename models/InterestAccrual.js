import mongoose from 'mongoose';

const interestAccrualSchema = new mongoose.Schema({
  ACCT_NO: { type: String, required: true },
  date: { type: Date, required: true },
  dailyInterest: { type: Number, required: true },
  principal: { type: Number, required: true },
  annualRate: { type: Number, required: true },
  accrualType: { type: String, default: 'DAILY_INTEREST' },
  status: { type: String, enum: ['PENDING', 'POSTED', 'REVERSED'], default: 'PENDING' }
}, {
  timestamps: true
});

export default mongoose.model('InterestAccrual', interestAccrualSchema);
