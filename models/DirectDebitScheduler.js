import mongoose from 'mongoose';

// Define the schema for DirectDebitScheduler
const directDebitSchedulerSchema = new mongoose.Schema(
  {
    SCHED_ID: {
      type: Number,
      required: true,
    },
    DIRECT_DR_ID: {
      type: String,
      required: true,
    },
    PAY_DT: {
      type: Date,
      required: true,
    },
    PAY_AMT: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    SKIP_PAY_FG: {
      type: String,
      default: 'N', // Automatically defaults to "N"
    },
    REC_ST: {
      type: String,
      enum: ['Y', 'N'], // Defines the valid options for REC_ST
      default: 'Y',     // Automatically defaults to "Y"
    },
    VERSION_NO: {
      type: Number,
      default: 1, // Automatically defaults to 1
    },
    ROW_TS: {
      type: Date,
      default: Date.now, // Automatically generates current timestamp
    },
    USER_ID: {
      type: String,
      required: true,
      maxlength: 24,
    },
    CREATE_DT: {
      type: Date,
      required: true,
    },
    CREATED_BY: {
      type: String,
      required: true,
      maxlength: 24,
    },
    SYS_CREATE_TS: {
      type: Date,
      default: Date.now, // Automatically generates current timestamp
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt fields
  }
);

// Create the model using the schema
const DirectDebitScheduler = mongoose.model('DirectDebitScheduler', directDebitSchedulerSchema);

export default DirectDebitScheduler;
