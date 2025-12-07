// models/SystemDate.js
import mongoose from 'mongoose';
import { calculateNextBusinessDate } from '../utils/dateUtils.js'; // Ensure this utility exists; if not, implement it
import logger from '../utils/logger.js';

const SystemDateSchema = new mongoose.Schema({
  currentBusinessDate: {
    type: Date,
    required: true,
    default: () => new Date(new Date().setHours(0, 0, 0, 0)),
  },
  nextBusinessDate: {
    type: Date,
    required: true,
  },
  lastEODDate: {
    type: Date,
  },
  lastEODProcessedBy: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and string
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
      type: mongoose.Schema.Types.Mixed, // FIXED: Changed from ObjectId to Mixed
      ref: 'User',
    },
    status: String,
    transactionsProcessed: Number,
    errors: [String],
  }],
}, { 
  timestamps: true,
  suppressReservedKeysWarning: true
});

// Indexes
SystemDateSchema.index({ currentBusinessDate: 1 });
SystemDateSchema.index({ isEODProcessing: 1 }, { sparse: true });
SystemDateSchema.index({ eodStatus: 1 });

// Pre-save hook to calculate next business date
SystemDateSchema.pre('save', async function(next) {
  if (this.isModified('currentBusinessDate')) {
    try {
      this.nextBusinessDate = await calculateNextBusinessDate(this.currentBusinessDate);
    } catch (error) {
      logger.error(`Failed to calculate next business date: ${error.message}`);
      return next(new Error(`Failed to calculate next business date: ${error.message}`));
    }
  }
  next();
});

// Post-save hook for additional logging
SystemDateSchema.post('save', function(doc) {
  logger.info('System date updated:', { 
    currentBusinessDate: doc.currentBusinessDate, 
    eodStatus: doc.eodStatus 
  });
});

// Static method to clean up invalid data
SystemDateSchema.statics.cleanupInvalidData = async function() {
  try {
    console.log('🧹 Cleaning up invalid SystemDate data...');
    
    // Use direct MongoDB update to avoid Mongoose validation
    const result = await mongoose.connection.db.collection('systemdates').updateMany(
      {
        $or: [
          { "lastEODProcessedBy": { $type: "string" } },
          { "eodHistory.processedBy": { $type: "string" } }
        ]
      },
      [
        {
          $set: {
            lastEODProcessedBy: {
              $cond: {
                if: { $eq: [{ $type: "$lastEODProcessedBy" }, "string"] },
                then: null,
                else: "$lastEODProcessedBy"
              }
            },
            eodHistory: {
              $map: {
                input: "$eodHistory",
                as: "history",
                in: {
                  $mergeObjects: [
                    "$$history",
                    {
                      processedBy: {
                        $cond: {
                          if: { $eq: [{ $type: "$$history.processedBy" }, "string"] },
                          then: null,
                          else: "$$history.processedBy"
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      ]
    );
    
    console.log(`✅ Cleaned up ${result.modifiedCount} SystemDate documents`);
    return result.modifiedCount;
  } catch (error) {
    console.log('⚠️ Error cleaning up SystemDate data:', error.message);
    return 0;
  }
};

// Static method to fix existing invalid string IDs
SystemDateSchema.statics.fixStringUserIds = async function() {
  try {
    console.log('🔧 Fixing string user IDs in SystemDate...');
    
    // Find all documents with string user IDs
    const docs = await this.find({
      $or: [
        { "lastEODProcessedBy": { $type: "string" } },
        { "eodHistory.processedBy": { $type: "string" } }
      ]
    });
    
    let fixedCount = 0;
    
    for (const doc of docs) {
      let needsUpdate = false;
      
      // Convert string lastEODProcessedBy to null
      if (typeof doc.lastEODProcessedBy === 'string') {
        doc.lastEODProcessedBy = null;
        needsUpdate = true;
      }
      
      // Convert string processedBy in eodHistory to null
      if (doc.eodHistory && doc.eodHistory.length > 0) {
        for (const history of doc.eodHistory) {
          if (typeof history.processedBy === 'string') {
            history.processedBy = null;
            needsUpdate = true;
          }
        }
      }
      
      if (needsUpdate) {
        // Save without validation to bypass schema validation
        await mongoose.connection.db.collection('systemdates').updateOne(
          { _id: doc._id },
          { 
            $set: { 
              lastEODProcessedBy: doc.lastEODProcessedBy,
              eodHistory: doc.eodHistory
            } 
          }
        );
        fixedCount++;
      }
    }
    
    console.log(`✅ Fixed ${fixedCount} SystemDate documents with string user IDs`);
    return fixedCount;
  } catch (error) {
    console.log('⚠️ Error fixing string user IDs:', error.message);
    return 0;
  }
};

const SystemDate = mongoose.model('SystemDate', SystemDateSchema);
export default SystemDate;