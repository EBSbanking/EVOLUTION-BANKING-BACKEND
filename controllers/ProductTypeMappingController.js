import ProductTypeMapping from '../models/ProductTypeMapping.js';
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';

/**
 * Create or update a product type mapping and generate loan account number
 */
export const createOrUpdateMapping = async (req, res) => {
  try {
    const { PROD_ID, PRODUCT_TYPE } = req.body;

    if (!PROD_ID || !PRODUCT_TYPE) {
      return res.status(400).json({
        success: false,
        message: 'PROD_ID and PRODUCT_TYPE are required'
      });
    }

    // Save or update product type mapping
    const updatedMapping = await ProductTypeMapping.findOneAndUpdate(
      { PROD_ID },
      { PRODUCT_TYPE },
      { upsert: true, new: true }
    );

    // Generate loan account number
    let generatedAccountNumber = null;
    try {
      generatedAccountNumber = await generateLoanAccountNumberByProdId(PROD_ID);
    } catch (accountError) {
      console.warn('Account number generation failed:', accountError.message);
      // Optional: You can still return success if mapping worked
    }

    return res.status(200).json({
      success: true,
      message: 'Mapping created/updated successfully',
      data: {
        mapping: updatedMapping,
        generatedAccountNumber
      }
    });

  } catch (error) {
    console.error('Error creating/updating mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create or update mapping',
      error: error.message || 'Unexpected error'
    });
  }
};


/**
 * Get product type by PROD_ID (API-style for route use)
 */
export const getProductTypeByProdId = async (req, res) => {
  try {
    const { PROD_ID } = req.params;
    const mapping = await ProductTypeMapping.findOne({ PROD_ID: parseInt(PROD_ID) });

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: `No mapping found for PROD_ID ${PROD_ID}`
      });
    }

    return res.status(200).json({
      success: true,
      data: mapping
    });

  } catch (error) {
    console.error('Error fetching mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch mapping',
      error: error.message
    });
  }
};

/**
 * Utility for internal use in loan controller: get product type only (no res)
 */

// REMOVE or COMMENT OUT THIS BLOCK (in controller)
export const getProductTypeOnly = async (PROD_ID) => {
  const mapping = await ProductTypeMapping.findOne({ PROD_ID: parseInt(PROD_ID) });
  if (!mapping) {
    throw {
      code: 'PRODUCT_TYPE_MAPPING_NOT_FOUND',
      message: `No mapping found for PROD_ID ${PROD_ID}`,
      status: 404
    };
  }
  return mapping.PRODUCT_TYPE;
};



/**
 * Get all product type mappings
 */
export const getAllMappings = async (req, res) => {
  try {
    const mappings = await ProductTypeMapping.find({});
    return res.status(200).json({
      success: true,
      data: mappings
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve mappings',
      error: error.message
    });
  }
};

/**
 * Delete mapping by PROD_ID
 */
export const deleteMapping = async (req, res) => {
  try {
    const { PROD_ID } = req.params;
    const result = await ProductTypeMapping.deleteOne({ PROD_ID: parseInt(PROD_ID) });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: `No mapping found for PROD_ID ${PROD_ID}`
      });
    }

    return res.status(200).json({
      success: true,
      message: `Mapping for PROD_ID ${PROD_ID} deleted`
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete mapping',
      error: error.message
    });
  }
};
