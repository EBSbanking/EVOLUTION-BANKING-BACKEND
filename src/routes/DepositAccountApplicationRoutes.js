// routes/depositAccountApplicationRoutes.js
import express from "express";
import DepositAccountApplicationController from "../controllers/DepositAccountApplicationController.js";
import { getProductTypeByProdIdInternal } from "../services/productservice.js";
import { generateAccountIdentifiersFromCounter } from "../utils/accountHelper.js";

const router = express.Router();

// 🔑 Enhanced Account type mapping with fallbacks
const ACCOUNT_TYPE_MAP = {
  SAVINGS: "SAVINGS",
  CURRENT: "CURRENT", 
  LOAN: "LOAN",
  TERM_DEPOSIT: "TERM_DEPOSIT",
  BUSINESS_TERM_LOAN: "LOAN",
  INDIVIDUAL_LOAN: "LOAN",
  CONSUMER_LOAN: "LOAN",
  MORTGAGE: "LOAN",
  AUTO_LOAN: "LOAN",
  PERSONAL_LOAN: "LOAN",
  EDUCATION_LOAN: "LOAN",
  CREDIT_CARD: "CREDIT_CARD",
  LINE_OF_CREDIT: "LOAN",
  SME_LOAN: "LOAN",
  GENERAL_LOAN: "LOAN"
};

// ✅ Helper function to determine product type from PROD_ID
const determineProductTypeFromProdId = (prodId) => {
  const prodIdStr = String(prodId);
  
  // Map PROD_ID to product type
  const prodIdMap = {
    '100': 'SAVINGS',
    '200': 'SAVINGS',
    '201': 'TERM_DEPOSIT',
    '300': 'BUSINESS_TERM_LOAN',
    '301': 'INDIVIDUAL_LOAN',
    '302': 'CONSUMER_LOAN',
    '303': 'MORTGAGE',
    '304': 'AUTO_LOAN',
    '305': 'PERSONAL_LOAN',
    '306': 'EDUCATION_LOAN',
    '307': 'CREDIT_CARD',
    '308': 'LINE_OF_CREDIT',
    '309': 'SME_LOAN',
    '500': 'SAVINGS'
  };
  
  return prodIdMap[prodIdStr] || 'SAVINGS'; // Default fallback
};

// In your depositAccountApplicationRoutes.js - update the account generation part:

// ✅ Generate Account Number + Account ID
router.get("/generate-account-number", async (req, res) => {
  try {
    const { prodId } = req.query;
    
    console.log('🔍 Generate Account Number Request:', { prodId, query: req.query });
    
    if (!prodId) {
      return res.status(400).json({ 
        success: false,
        message: "prodId query parameter is required." 
      });
    }

    console.log(`🔄 Processing request for prodId: ${prodId}`);

    let product;
    let productType;
    
    try {
      // Try to get product from product service
      product = await getProductTypeByProdIdInternal(prodId);
      console.log('📦 Product service response:', product);
    } catch (productError) {
      console.warn('⚠️ Product service error, using fallback:', productError.message);
      product = null;
    }

    if (product) {
      // Use product type from service
      productType = (
        product.PRODUCT_TYPE ||
        product.PROD_CAT_TY ||
        product.PROD_DESC ||
        ""
      ).toUpperCase().trim();
      
      console.log(`✅ Product Type from service: ${productType}`);
    }

    // If no product type from service, determine from PROD_ID
    if (!productType) {
      productType = determineProductTypeFromProdId(prodId);
      console.log(`🔄 Product Type determined from PROD_ID: ${productType}`);
    }

    // Final validation
    if (!productType || productType === 'UNDEFINED') {
      console.error('❌ Invalid product type, using SAVINGS as fallback');
      productType = 'SAVINGS';
    }

    console.log(`🎯 Final Product Type for generation: ${productType}`);

    // Generate identifiers with fallback
    let accountIdentifiers;
    try {
      accountIdentifiers = await generateAccountIdentifiersFromCounter(productType);
    } catch (genError) {
      console.error('❌ Primary account generation failed, using fallback:', genError.message);
      accountIdentifiers = generateFallbackAccountIdentifiers(productType);
    }

    const { ACCT_NO, ACCT_ID, nubanCategory, prefix, isFallback } = accountIdentifiers;
    
    console.log(`✅ Final Generated - ACCT_NO: ${ACCT_NO}, ACCT_ID: ${ACCT_ID}`);
    console.log(`📊 Generation Details - Product: ${productType}, NUBAN: ${nubanCategory}, Prefix: ${prefix}, Fallback: ${isFallback || false}`);

    return res.status(200).json({
      success: true,
      message: "Account number and ID generated successfully",
      prodId: String(prodId),
      productType,
      nubanCategory,
      prefix,
      ACCT_NO,
      ACCT_ID,
      isFallback: isFallback || false
    });
    
  } catch (error) {
    console.error("❌ Error generating account number:", {
      message: error.message,
      stack: error.stack,
      prodId: req.query.prodId
    });
    
    return res.status(500).json({ 
      success: false,
      message: "Internal Server Error", 
      error: error.message 
    });
  }
});

// ✅ Application Creation
router.post("/create", DepositAccountApplicationController.createApplication);

// ✅ Application Retrieval
router.get(
  "/customer/:CUST_ID",
  DepositAccountApplicationController.getApplicationByCustId
);
router.get(
  "/account/:ACCT_NO",
  DepositAccountApplicationController.getApplicationByACCT_NO
);

// ✅ Application Status Management
router.put(
  "/approve/customer/:CUST_ID",
  DepositAccountApplicationController.approveApplicationByCustomerId
);
router.put(
  "/reject/customer/:CUST_ID",
  DepositAccountApplicationController.rejectApplicationByCustomerId
);
router.put(
  "/status/:id",
  DepositAccountApplicationController.updateApplicationStatus
);

// ✅ Application Updates
router.put(
  "/:CUST_ID",
  DepositAccountApplicationController.updateApplication
);

// ✅ Application Deletion
router.delete("/:id", DepositAccountApplicationController.deleteApplication);

// ✅ Health check endpoint
router.get("/health", (req, res) => {
  res.json({ 
    success: true, 
    message: 'Deposit Account Application API is running',
    timestamp: new Date().toISOString()
  });
});

export default router;