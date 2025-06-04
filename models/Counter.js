import mongoose from 'mongoose';

// Define the counter schema
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },  // The name of the counter (e.g., 'CUST_ID', 'orderID')
  seq: { type: Number, required: true, default: 0 },  // The sequence number for that counter
});

// Check if the model already exists before defining it
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

export default Counter;
