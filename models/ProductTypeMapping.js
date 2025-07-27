import mongoose from 'mongoose';

const ProductTypeMappingSchema = new mongoose.Schema({
  PROD_ID: { type: Number, required: true, unique: true },
  PRODUCT_TYPE: { type: String, required: true }
});

// Use the correct schema name here
const ProductTypeMapping =
  mongoose.models.ProductTypeMapping || mongoose.model('ProductTypeMapping', ProductTypeMappingSchema);

export default ProductTypeMapping;
