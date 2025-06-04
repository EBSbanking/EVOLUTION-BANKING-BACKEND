import mongoose from 'mongoose';

const drawerCloseOutSchema = new mongoose.Schema({
  drawerCloseOutPosnHistId: {
    type: Number,
    required: true,
    unique: true, // Ensure uniqueness for this field
  },
  openingBal: {
    type: mongoose.Decimal128,
    required: true,
    default: 0,
  },
  totalCashIn: {
    type: mongoose.Decimal128,
    required: true,
    default: 0,
  },
  totalCashOut: {
    type: mongoose.Decimal128,
    required: true,
    default: 0,
  },
  totalCashBought: {
    type: mongoose.Decimal128,
    required: true,
    default: 0,
  },
  totalCashSale: {
    type: mongoose.Decimal128,
    required: true,
    default: 0,
  },
  closingBal: {
    type: mongoose.Decimal128,
    required: true,
    default: 0,
  },
  cashBoughtCount: {
    type: Number,
    required: true,
    default: 0,
  },
  cashInCount: {
    type: Number,
    required: true,
    default: 0,
  },
  cashSaleCount: {
    type: Number,
    required: true,
    default: 0,
  },
  cashOutCount: {
    type: Number,
    required: true,
    default: 0,
  },
  overageAmt: {
    type: mongoose.Decimal128,
    required: true,
    default: 0,
  },
  shortageAmt: {
    type: mongoose.Decimal128,
    required: true,
    default: 0,
  },
  drawerCrncyId: {
    type: Number,
    required: true,
  },
  recSt: {
    type: String,
    required: true,
    enum: ['A', 'I'], // Assuming 'A' for Active, 'I' for Inactive
    default: 'A',
  },
  versionNo: {
    type: Number,
    required: true,
    default: 1,
  },
  rowTs: {
    type: Date,
    required: true,
    default: Date.now,
  },
  userId: {
    type: String,
    required: true,
    maxlength: 24,
  },
  createDt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  sysCreateTs: {
    type: Date,
    required: true,
    default: Date.now,
  },
  createdBy: {
    type: String,
    required: true,
    maxlength: 24,
  },
  drawerCloseDt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  drawerOpenDt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  sysUserId: {
    type: Number,
    required: true,
  },
  drawerId: {
    type: Number,
    required: true,
  },
  crncyId: {
    type: Number,
    required: true,
  },
});

// Create the model using the schema
const DrawerCloseOut = mongoose.model('DrawerCloseOut', drawerCloseOutSchema);

export default DrawerCloseOut;
