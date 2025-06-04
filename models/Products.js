import mongoose from 'mongoose';

// Define the schema for the Product model
const productSchema = new mongoose.Schema({
  PROD_ID: {
    type: Number,
    required: true, // Make it required
  },
  PROD_CD: {
    type: Number,
    required: true, // Make it required
  },
  PROD_DESC: {
    type: String,
    required: true, // Make it required
  },
  CRNCY_ID: {
    type: String,
    required: true, // Make it required
  },
  PROD_CAT_TY: {
    type: String,
    required: true, // Make it required
  },
  PROD_DESIGN_ID: {
    type: Number,
    required: true, // Make it required
  },
  START_DT: {
    type: Date,
    required: true, // Make it required
  },
  REC_ST: {
    type: String,
    required: true, // Make it required
  },
  MIN_AGE_YEAR: {
    type: Number,
    required: true, // Make it required
  },
  VERSION_NO: {
    type: String,
    required: true, // Make it required
  },
  ROW_TS: {
    type: Date,
    default: Date.now, // Automatically set the timestamp when the document is created
  },
  CREATED_BY: {
    type: String,
    required: true, // Make it required
  },
  CREATED_DT: {
    type: Date,
    default: Date.now, // Automatically set the creation date if not provided
  },
  STMNT_FREQ_CD: {
    type: String,
    required: true, // Make it required
  },
  STMNT_FREQ_VALUE: {
    type: Number,
    required: true, // Make it required
  },
  ACCT_AUTH_BUS_PROD_ID: {
    type: Number,
    required: true, // Make it required
  },
  USER_ID:{
    type: String,
    required: true,
  },
  ACCT_CYCLE_CD: {
    type: String,
    required: true, // Make it required
  },
  ACCT_CYCLE_VALUE: {
    type: Number,
    required: true, // Make it required
  },
});

// Create the model based on the schema
const Product = mongoose.model('Product', productSchema);

export default Product;
