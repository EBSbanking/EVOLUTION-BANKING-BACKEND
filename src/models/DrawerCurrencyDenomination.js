import mongoose from 'mongoose';

const { Schema } = mongoose;

const drawerCurrencyDenominationSchema = new Schema({
  drawerCrncyDenomId: { type: String, required: true, unique: true }, // Ensure this is a string (e.g., "D12345")
  denomCount: [
    {
      denomId: { type: Number, required: true },  // Denomination ID (e.g., 1000, 500, 200)
      count: { type: Number, required: true },    // Quantity of the denomination (e.g., 20 pieces of 1000)
      amount: { type: Number },    // This will be calculated in pre-save hook
      Total: { type: Number },     // This will also be calculated in pre-save hook
    }
  ],
  totalAmount: { type: Number, default: 0 },  // Overall total amount for all denominations
  denomCountType: { 
    type: String, 
    required: true, 
    maxlength: 1, 
    default: 'T',
    enum: ['T', 'S', 'O'] // Optional: Define types if applicable
  },
  recSt: { type: String, required: true, maxlength: 1 },  // Record status (e.g., 'A' for Active)
  versionNo: { type: Number, required: true }, // Version number for tracking changes
  rowTs: { type: Date, required: true }, // Timestamp
  userId: { type: String, required: true, maxlength: 24 }, // User ID for linking
  createDt: { type: Date, required: true }, // Creation Date
  sysCreateTs: { type: Date, default: Date.now }, // System timestamp (default to current date)
  createdBy: { type: String, required: true, maxlength: 24 }, // Created by (User)
  drawerCrncyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Drawer', 
    required: true // Reference to Drawer collection
  },
  drawerId: { type: String, required: true } // Drawer ID
});

// Pre-save hook to calculate the `amount` and `Total` for each denomination and the `totalAmount`
drawerCurrencyDenominationSchema.pre('save', function(next) {
  let totalAmount = 0;

  this.denomCount.forEach(denom => {
    denom.amount = denom.denomId * denom.count; // Calculate amount for each denomination
    denom.Total = denom.amount;                 // Total equals amount
    totalAmount += denom.amount;                // Accumulate totalAmount
  });

  this.totalAmount = totalAmount; // Set the totalAmount for the document
  next();
});

// // Adding indexes for performance
// drawerCurrencyDenominationSchema.index({ drawerCrncyDenomId: 1 });
// drawerCurrencyDenominationSchema.index({ drawerCrncyId: 1 });

// Create and export the model
const DrawerCurrencyDenomination = mongoose.model('DrawerCurrencyDenomination', drawerCurrencyDenominationSchema);

export default DrawerCurrencyDenomination;
