import Product from '../models/SavingsProducts.js';
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
    let product = await Product.findOne({ PROD_ID: parseInt(prodId) });
    if (product) {
      console.log(`✅ Found product:`, product.PRODUCT_TYPE);
      return product;
    }
    
    // Try with string PROD_ID
    product = await Product.findOne({ PROD_ID: prodId });
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
    '300': 'BUSINESS TERM LOAN',
    '301': 'INDIVIDUAL LOAN',
    '302': 'CONSUMER LOAN',
    '303': 'MORTGAGE',
    '304': 'AUTO LOAN',
    '305': 'PERSONAL LOAN',
    '306': 'EDUCATION LOAN',
    '307': 'CREDIT CARD',
    '308': 'LINE OF CREDIT',
    '309': 'SME LOAN',
    '500': 'SAVINGS'
  };
  
  return typeMap[prodIdStr] || 'SAVINGS';
};