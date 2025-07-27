import mongoose from 'mongoose';

const ProductMappingSchema = new mongoose.Schema({
  productCode: { type: Number, required: true },
  PROD_ID: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  allowedCurrencies: { type: [String], default: [] },
  processingFeeRate: { type: Number, default: 0 },
  feeStructure: { type: [Object], default: [] },
}, {
  timestamps: true
});

// Export model safely (prevents OverwriteModelError in dev/watch mode)
const ProductMapping = mongoose.models.ProductMapping || mongoose.model('ProductMapping', ProductMappingSchema);

export default ProductMapping;
