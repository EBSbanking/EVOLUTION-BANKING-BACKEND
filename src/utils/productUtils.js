import ProductTypeMapping from '../models/ProductTypeMapping.js';

export async function getProductTypeByProdId(PROD_ID) {
  const mapping = await ProductTypeMapping.findOne({ PROD_ID: parseInt(PROD_ID) });
  if (!mapping) {
    throw {
      code: 'PRODUCT_TYPE_MAPPING_NOT_FOUND',
      message: `No product type mapping found for PROD_ID ${PROD_ID}`,
      status: 404
    };
  }
  return mapping.PRODUCT_TYPE;
}
