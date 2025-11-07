// models/SystemDate.js
import mongoose from 'mongoose';
import { calculateNextBusinessDate } from '../utils/dateUtils.js'; // Ensure this utility exists; if not, implement it

const SystemDateSchema = new mongoose.Schema({
  currentBusinessDate: {
    type: Date,
    required: true,
    default: () => new Date(new Date().setHours(0, 0, 0, 0)), // FIXED: Wrap setHours result in new Date() to return Date object
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
}, { 
  timestamps: true,
  suppressReservedKeysWarning: true  // Suppress the reserved key warning as recommended
});

// Indexes (uncommented and added for performance; sparse for optional fields)
SystemDateSchema.index({ currentBusinessDate: 1 });
SystemDateSchema.index({ isEODProcessing: 1 }, { sparse: true });
SystemDateSchema.index({ eodStatus: 1 });

// Pre-save hook to calculate next business date
SystemDateSchema.pre('save', async function(next) {
  if (this.isModified('currentBusinessDate')) {
    try {
      this.nextBusinessDate = await calculateNextBusinessDate(this.currentBusinessDate);
    } catch (error) {
      logger.error(`Failed to calculate next business date: ${error.message}`); // Add logging if logger imported
      return next(new Error(`Failed to calculate next business date: ${error.message}`));
    }
  }
  next();
});

// Post-save hook for additional logging (optional, for auditing)
SystemDateSchema.post('save', function(doc) {
  logger.info('System date updated:', { currentBusinessDate: doc.currentBusinessDate, eodStatus: doc.eodStatus });
});

const SystemDate = mongoose.model('SystemDate', SystemDateSchema);
export default SystemDate;