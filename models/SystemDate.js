// In models/SystemDate.js
import mongoose from 'mongoose';
import { calculateNextBusinessDate } from '../utils/dateUtils.js'; // Move function to a shared utility file

const SystemDateSchema = new mongoose.Schema({
  currentBusinessDate: {
    type: Date,
    required: true,
    default: () => new Date().setHours(0, 0, 0, 0),
  },
  nextBusinessDate: {
    type: Date,
    required: true,
  },
  lastEODDate: {
    type: Date,
  },
  lastEODProcessedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  isEODProcessing: {
    type: Boolean,
    default: false,
  },
  eodStatus: {
    type: String,
    enum: ['IDLE', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'],
    default: 'IDLE',
  },
  eodHistory: [{
    processedDate: Date,
    processingStart: Date,
    processingEnd: Date,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: String,
    transactionsProcessed: Number,
    errors: [String],
  }],
}, { timestamps: true });

// Indexes
SystemDateSchema.index({ currentBusinessDate: 1 });
SystemDateSchema.index({ isEODProcessing: 1 });

// Pre-save hook to calculate next business date
SystemDateSchema.pre('save', async function(next) {
  if (this.isModified('currentBusinessDate')) {
    try {
      this.nextBusinessDate = await calculateNextBusinessDate(this.currentBusinessDate);
    } catch (error) {
      return next(new Error(`Failed to calculate next business date: ${error.message}`));
    }
  }
  next();
});

const SystemDate = mongoose.model('SystemDate', SystemDateSchema);
export default SystemDate;