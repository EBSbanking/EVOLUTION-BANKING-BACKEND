import mongoose from 'mongoose';
const { Schema } = mongoose;

const standingOrderExecutionSchema = new Schema({
  standingOrderId: {
    type: Schema.Types.ObjectId,
    ref: 'StandingOrder',
    required: true,
    index: true
  },
  executionDate: {
    type: Date,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true,
    default: 'NGN'  // Updated default
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED', 'SKIPPED'],  // UPDATED: Uppercase for consistency; added 'SKIPPED' for cases where SO is not active
    default: 'PENDING'
  },
  failureReason: {
    type: String,
    required: false,
    maxlength: 500
  },
  // NEW: Reference to standing order status at execution time (for audit/compliance)
  standingOrderStatusAtExecution: {
    type: String,
    enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
    required: true  // Captured from StandingOrder.status to log why it might have been skipped
  },
  // NEW: Optional notes (e.g., "Skipped: Standing order pending approval")
  executionNotes: {
    type: String,
    required: false,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Composite index for quick lookups
standingOrderExecutionSchema.index({ standingOrderId: 1, executionDate: -1 });
standingOrderExecutionSchema.index({ status: 1 });  // NEW: Index for execution status queries

// Pre-save hook to ensure consistency
standingOrderExecutionSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Fetch standing order status at execution time
    try {
      const standingOrder = await mongoose.model('StandingOrder').findById(this.standingOrderId);
      if (standingOrder) {
        this.standingOrderStatusAtExecution = standingOrder.status;
        if (standingOrder.status !== 'APPROVED' || !standingOrder.isActive) {
          this.status = 'SKIPPED';
          this.executionNotes = `Skipped: Standing order status is '${standingOrder.status}'`;
        }
      } else {
        this.status = 'FAILED';
        this.failureReason = 'Standing order not found';
      }
    } catch (err) {
      this.status = 'FAILED';
      this.failureReason = `Error fetching standing order: ${err.message}`;
    }
  }
  next();
});

const StandingOrderExecution = mongoose.model('StandingOrderExecution', standingOrderExecutionSchema);
export default StandingOrderExecution;