// services/productService.js
import ProductTypeMapping from '../models/ProductTypeMapping.js';

export const getProductTypeOnly = async (PROD_ID) => {
  const mapping = await ProductTypeMapping.findOne({ PROD_ID: parseInt(PROD_ID) });

  if (!mapping || !mapping.PRODUCT_TYPE) {
    throw new Error(`No mapping found for PROD_ID ${PROD_ID}`);
  }

  return mapping.PRODUCT_TYPE;
};
