import SavingsProducts from '../models/SavingsProduct.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js';

export const getProductTypeByProdIdInternal = async (prodId) => {
  try {
    console.log(`🔍 Looking up product for PROD_ID: ${prodId}`);
    
    // Try to find in ProductTypeMapping first
    let mapping = await ProductTypeMapping.findOne({ PROD_ID: parseInt(prodId) });
    if (mapping) {
      console.log(`✅ Found product mapping:`, mapping.PRODUCT_TYPE);
      return mapping;
    }
    
    // Try to find in Products collection
    let product = await SavingsProducts.findOne({ PROD_ID: parseInt(prodId) });
    if (product) {
      console.log(`✅ Found product:`, product.PRODUCT_TYPE);
      return product;
    }
    
    // Try with string PROD_ID
    product = await SavingsProducts.findOne({ PROD_ID: prodId });
    if (product) {
      console.log(`✅ Found product (string ID):`, product.PRODUCT_TYPE);
      return product;
    }
    
    console.warn(`❌ No product found for PROD_ID: ${prodId}`);
    return null;
    
  } catch (error) {
    console.error('❌ Error in getProductTypeByProdIdInternal:', error);
    throw error;
  }
};

// Fallback function if primary one fails
export const getProductTypeFallback = (prodId) => {
  const prodIdStr = String(prodId);
  const typeMap = {
    '100': 'SAVINGS',
    '200': 'SAVINGS', 
    '201': 'TERM_DEPOSIT',
    '300': 'BUSINESS_TERM_LOAN',
    '301': 'INDIVIDUAL_LOAN',
    '302': 'CONSUMER_LOAN',
    '303': 'MORTGAGE_LOAN',
    '304': 'AUTO_LOAN',
    '305': 'PERSONAL_LOAN',
    '306': 'EDUCATION_LOAN',
    '307': 'CREDIT_CARD',
    '308': 'LINE_OF_CREDIT',
    '309': 'SME_LOAN',
    '400': 'GROUP_LOAN',
    '500': 'SAVINGS'
  };
  
  return typeMap[prodIdStr] || 'SAVINGS';
};

// Optional: Combined function that tries DB first, then fallback
export const getProductType = async (prodId) => {
  try {
    const result = await getProductTypeByProdIdInternal(prodId);
    if (result) {
      // Return the product type from the document
      return result.PRODUCT_TYPE || result.product_type || 'SAVINGS';
    }
    
    // Fallback to hardcoded mapping
    return getProductTypeFallback(prodId);
  } catch (error) {
    console.error('Error getting product type, using fallback:', error);
    return getProductTypeFallback(prodId);
  }
};