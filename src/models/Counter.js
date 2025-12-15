// models/Counter.js
import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  seq: {
    type: Number,
    default: 0,
    min: 0
  },
  description: {
    type: String,
    required: false
  },
  lastGeneratedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// ✅ Critical: Proper static method that your helpers expect
counterSchema.statics.getNextSequence = async function(name) {
  const counter = await this.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { 
      new: true, 
      upsert: true, 
      setDefaultsOnInsert: true,
      returnDocument: 'after'
    }
  );

  if (!counter) {
    throw new Error(`Failed to increment counter: ${name}`);
  }

  counter.lastGeneratedAt = new Date();
  await counter.save(); // Update timestamp

  return counter.seq;
};

// Optional: Convenience method if you still want it
counterSchema.statics.getCurrentSequence = async function(name) {
  const counter = await this.findOne({ _id: name });
  return counter ? counter.seq : null;
};

// Optional: Reset method
counterSchema.statics.resetSequence = async function(name, value = 0) {
  return await this.findOneAndUpdate(
    { _id: name },
    { seq: value, lastGeneratedAt: new Date() },
    { upsert: true, new: true }
  );
};

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

export default Counter;