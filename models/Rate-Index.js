import mongoose from 'mongoose';

// Define the schema for the RateIndex model
const rateIndexSchema = new mongoose.Schema({
  INDEX_RATE_ID: {
    type: Number,
    required: true, // Make it required
  },
  INDEX_CD: {
    type: Number,
    required: true, // Make it required
  },
  INDEX_RATE: {
    type: Number,
    required: true, // Make it required
  },
  INDEX_NM: {
    type: String,
    required: true, // Make it required
  },
  CRNCY_ID: {
    type: String,
    required: true, // Make it required
  },
  PRECISION: {
    type: Number,
    required: true, // Make it required
  },
  EFFECTIVE_DT: {
    type: Date,
    required: true, // Make it required
  },
  VERSION: {
    type: String,
    required: true, // Make it required
  },
  REC_ST: {
    type: String,
    required: true, // Make it required
  },
  CREATED_DT: {
    type: Date,
    default: Date.now, // Set the creation date to now if not provided
  },
  CREATED_BY: {
    type: String,
    required: true, // Make it required
  },
  SYS_CREATE_TS: {
    type: Date,
    default: Date.now, // Automatically set the timestamp when the document is created
  },
});

// Add the method to the schema
rateIndexSchema.methods.calculateInterest = function (principal, termValue) {
  // Assuming interest is calculated as: principal * (rate / 100) * termValue
  // Adjust the formula as per your interest calculation logic
  const interestRate = this.INDEX_RATE;
  const interest = (principal * interestRate * termValue) / 100;
  return interest;
};

// Create the model based on the schema
const RateIndex = mongoose.model('RateIndex', rateIndexSchema);

export default RateIndex;
