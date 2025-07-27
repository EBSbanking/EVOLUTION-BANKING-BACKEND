// models/SystemDate.js
import mongoose from 'mongoose';

const SystemDateSchema = new mongoose.Schema({
  currentBusinessDate: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  nextBusinessDate: {
    type: Date,
    required: true
  },
  lastEODDate: {
    type: Date
  },
  lastEODProcessedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isEODProcessing: {
    type: Boolean,
    default: false
  },
  // In models/SystemDate.js
eodStatus: {
  type: String,
  enum: ['IDLE', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'], // Add IDLE
  default: 'IDLE' // Change default if needed
},
  eodHistory: [{
    processedDate: Date,
    processingStart: Date,
    processingEnd: Date,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: String,
    transactionsProcessed: Number,
    errors: [String]
  }]
}, { timestamps: true });

// Indexes
SystemDateSchema.index({ currentBusinessDate: 1 });
SystemDateSchema.index({ isEODProcessing: 1 });

// Pre-save hook to calculate next business date
SystemDateSchema.pre('save', function(next) {
  if (this.isModified('currentBusinessDate')) {
    const nextDate = new Date(this.currentBusinessDate);
    nextDate.setDate(nextDate.getDate() + 1);
    this.nextBusinessDate = nextDate;
  }
  next();
});

const SystemDate = mongoose.model('SystemDate', SystemDateSchema);

export default SystemDate;