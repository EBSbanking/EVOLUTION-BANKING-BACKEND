// models/Sequence.js
import mongoose from 'mongoose';

const SequenceSchema = new mongoose.Schema({
  targetCollection: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  value: { 
    type: Number, 
    default: 1000
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  strict: false
});

// Pre-save middleware
SequenceSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  if (!this.targetCollection || this.targetCollection === null || this.targetCollection === 'null') {
    this.targetCollection = `sequence_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  next();
});

// Static method to safely get or create sequence
SequenceSchema.statics.getOrCreateSequence = async function(collectionName, session = null) {
  try {
    const sequence = await this.findOneAndUpdate(
      { targetCollection: collectionName },
      { 
        $setOnInsert: { 
          targetCollection: collectionName,
          value: 1000,
          createdAt: new Date()
        }
      },
      { 
        upsert: true, 
        new: true, 
        session,
        setDefaultsOnInsert: true
      }
    );
    return sequence;
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error - sequence already exists
      const existing = await this.findOne({ targetCollection: collectionName }).session(session);
      if (existing) return existing;
    }
    throw error;
  }
};

// Static method to increment and get next value
SequenceSchema.statics.getNextValue = async function(collectionName, session = null) {
  try {
    const sequence = await this.findOneAndUpdate(
      { targetCollection: collectionName },
      { 
        $inc: { value: 1 },
        $set: { updatedAt: new Date() }
      },
      { 
        new: true, 
        upsert: true, 
        session,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    );
    
    if (!sequence) {
      throw new Error(`Failed to get sequence for ${collectionName}`);
    }
    
    return sequence.value;
  } catch (error) {
    if (error.code === 11000) {
      // Retry once if there's a duplicate key error
      const sequence = await this.findOne({ targetCollection: collectionName }).session(session);
      if (sequence) {
        const updated = await this.findOneAndUpdate(
          { targetCollection: collectionName },
          { 
            $inc: { value: 1 },
            $set: { updatedAt: new Date() }
          },
          { new: true, session }
        );
        return updated.value;
      }
    }
    throw error;
  }
};

const Sequence = mongoose.model('Sequence', SequenceSchema, 'sequences');
export default Sequence;