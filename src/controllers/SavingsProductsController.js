import mongoose from 'mongoose';
import Product from '../models/Products.js';
import LoanProduct from '../models/LoanProduct.js';
import SavingsProduct from '../models/SavingsProduct.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js';
import GLAccount from '../models/GLAccount.js';
import { getPrefixForProductType } from '../utils/generateLoanAccountId.js';
import { logger } from '../utils/logger.js';

export const ProductsController = {
  createProduct: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Step 1: Clean request body
      const requestBody = { ...req.body };
      delete requestBody['PROD_CD '];

      // Step 2: Extract key fields
      const { PROD_ID, productName, PROD_DESC, PROD_CD, PRODUCT_TYPE, productCode, ...restOfBody } = requestBody;

      if (!PROD_ID || !productName || !PROD_CD) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'PROD_ID, productName, and PROD_CD are required fields'
        });
      }

      // Step 3: Determine product type
      let finalProductType = PRODUCT_TYPE || restOfBody.PROD_CAT_TY;
      if (!finalProductType) {
        switch (String(PROD_CD)) {
          case '200': finalProductType = 'SAVINGS'; break;
          case '201': finalProductType = 'TERM_DEPOSIT'; break;
          default: finalProductType = 'SAVINGS';
        }
      }

      // Step 4: Base product
      const productData = {
        PROD_ID: Number(PROD_ID),
        PROD_CD: PROD_CD.toString(),
        PROD_DESC: PROD_DESC || productName,
        PRODUCT_TYPE: finalProductType,
        productName,
        productCode: productCode || PROD_CD.toString(),
        CRNCY_ID: restOfBody.CRNCY_ID || 'NGN',
        START_DT: restOfBody.START_DT ? new Date(restOfBody.START_DT) : new Date(),
        REC_ST: restOfBody.REC_ST || 'Active',
        CREATED_BY: restOfBody.CREATED_BY || 'system',
        VERSION_NO: restOfBody.VERSION_NO,
        PROD_CAT_TY: restOfBody.PROD_CAT_TY,
        PROD_DESIGN_ID: restOfBody.PROD_DESIGN_ID ? Number(restOfBody.PROD_DESIGN_ID) : undefined,
        MIN_AGE_YEAR: restOfBody.MIN_AGE_YEAR ? Number(restOfBody.MIN_AGE_YEAR) : undefined,
        BU_ID: restOfBody.BU_ID,
        USER_ID: restOfBody.USER_ID,
        STMNT_FREQ_CD: restOfBody.STMNT_FREQ_CD,
        STMNT_FREQ_VALUE: restOfBody.STMNT_FREQ_VALUE ? Number(restOfBody.STMNT_FREQ_VALUE) : undefined,
        ACCT_CYCLE_CD: restOfBody.ACCT_CYCLE_CD,
        ACCT_CYCLE_VALUE: restOfBody.ACCT_CYCLE_VALUE ? Number(restOfBody.ACCT_CYCLE_VALUE) : undefined,
        ACCT_AUTH_BUS_PROD_ID: restOfBody.ACCT_AUTH_BUS_PROD_ID ? Number(restOfBody.ACCT_AUTH_BUS_PROD_ID) : undefined
      };

      // Step 5: Prepare SavingsProduct data
      let savingsProductData = null;
      if (['SAVINGS', 'TERM_DEPOSIT'].includes(finalProductType)) {
        savingsProductData = {
          ...productData,
          productType: finalProductType,
          BU_ID: restOfBody.BU_ID || '001'
        };

        // Add nested info
        if (restOfBody.rateInformation) {
          const { rateType, fixedRate, marginRate, effectiveRate, effectiveDate } = restOfBody.rateInformation;
          savingsProductData.rateInformation = {
            rateType: rateType || 'FIXED',
            effectiveRate: mongoose.Types.Decimal128.fromString((effectiveRate || '0').toString()),
            effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date()
          };
          if (rateType === 'FIXED' && fixedRate)
            savingsProductData.rateInformation.fixedRate = mongoose.Types.Decimal128.fromString(fixedRate.toString());
          if (rateType === 'FLOATING' && marginRate)
            savingsProductData.rateInformation.marginRate = mongoose.Types.Decimal128.fromString(marginRate.toString());
        }

        if (restOfBody.settlementInformation)
          savingsProductData.settlementInformation = { ...restOfBody.settlementInformation };
        if (restOfBody.accrualInformation)
          savingsProductData.accrualInformation = { ...restOfBody.accrualInformation };
        if (restOfBody.chargesSetup)
          savingsProductData.chargesSetup = { ...restOfBody.chargesSetup };

        // Validate GL accounts
        const glFields = [
          'principalBalanceGLAccountNo',
          'interestGLAccountNo',
          'interestPayableGLAccountNo',
          'withholdingTaxGLAccountNo',
          'depositChargeReceivableGLAccountNo',
          'delinquentBalanceGLAccountNo',
          'dormantBalanceGLAccountNo',
          'earmarkedBalanceGLAccountNo',
          'escheatedBalanceGLAccountNo',
          'interestChequesGLAccountNo',
          'interestExpenseGLAccountNo',
          'interestIncomeGLAccountNo',
          'interestReceivableGLAccountNo',
          'interestSuspenseGLAccountNo',
          'maturedBalanceGLAccountNo',
          'maturityChequesGLAccountNo',
          'nonAccrualBalanceGLAccountNo',
          'overdrawnBalanceGLAccountNo',
          'preDormantBalanceGLAccountNo',
          'provisionReserveGLAccountNo',
          'provisionExpenseGLAccountNo',
          'rejectedCreditSuspenseGLAccountNo',
          'rejectedDebitSuspenseGLAccountNo',
          'reservedBalanceGLAccountNo',
          'unclearedBalanceGLAccountNo',
          'writeOffBalanceGLAccountNo',
          'recoveriesGLAccountNo',
          'interestCreditGLAccountNo',
          'interestDebitGLAccountNo'
        ];


        for (const field of glFields) {
          if (restOfBody[field]) {
            const glAccount = await GLAccount.findOne({ GL_ACCT_NO: restOfBody[field] }).session(session);
            if (!glAccount) {
              await session.abortTransaction();
              return res.status(400).json({
                success: false,
                message: `Invalid GL account: ${restOfBody[field]} for ${field}`
              });
            }
            savingsProductData[field] = restOfBody[field];
          }
        }
      }

      // Step 6: Save base Product
      const newProduct = new Product(productData);
      await newProduct.save({ session });

      // Step 7: Product mapping
      const accountPrefix = getPrefixForProductType(finalProductType);
      await ProductTypeMapping.findOneAndUpdate(
        { PROD_ID: PROD_ID.toString() },
        {
          PROD_ID: PROD_ID.toString(),
          PRODUCT_TYPE: finalProductType,
          productName,
          PROD_DESC: productData.PROD_DESC,
          PROD_CD: PROD_CD.toString(),
          accountPrefix
        },
        { upsert: true, new: true, session }
      );

      // Step 8: Save SavingsProduct / LoanProduct
      if (savingsProductData) {
        await SavingsProduct.findOneAndUpdate(
          { PROD_ID: Number(PROD_ID) },
          savingsProductData,
          { upsert: true, new: true, session }
        );
      }

      if (['LOAN', 'MORTGAGE', 'CREDIT CARD'].includes(finalProductType)) {
        await LoanProduct.findOneAndUpdate(
          { PROD_ID: PROD_ID },
          productData,
          { upsert: true, new: true, session }
        );
      }

      // Step 9: Verify that the SavingsProduct can be found (your lookup code)
      const productCodeString = (productCode || PROD_CD)?.toString();
      const product = await SavingsProduct.findOne({
        $or: [
          { productCode: productCodeString },
          { PROD_CD: productCodeString },
          { PROD_ID: parseInt(productCodeString) }
        ],
        REC_ST: { $in: [/^active$/i, /^a$/i] }
      }).session(session);

      if (!product) {
        const found = await SavingsProduct.find({
          $or: [
            { productCode: productCodeString },
            { PROD_CD: productCodeString },
            { PROD_ID: parseInt(productCodeString) }
          ]
        }).session(session);
        logger.error(`❌ No active SavingsProduct found for productCode: ${productCodeString}`);
        logger.info(`Found ${found.length} total products for that code:`, found);
        throw new Error(`Invalid productCode: ${productCodeString}. No active SavingsProduct found.`);
      }

      // Step 10: Commit
      await session.commitTransaction();

      return res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: {
          product: productData,
          savingsProduct: savingsProductData || null,
          mapping: { PROD_ID, PRODUCT_TYPE: finalProductType, accountPrefix }
        }
      });
    } catch (error) {
      await session.abortTransaction();
      logger.error('Product creation failed', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        message: 'Failed to create product',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  },

  // Get product method
  getProduct: async (req, res) => {
    try {
      const { id } = req.params;
      
      let product = await Product.findOne({ 
        $or: [
          { PROD_ID: Number(id) },
          { productCode: id },
          { PROD_CD: id }
        ]
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      let savingsProduct = null;
      if (product.PRODUCT_TYPE === 'SAVINGS' || product.PRODUCT_TYPE === 'TERM_DEPOSIT') {
        savingsProduct = await SavingsProduct.findOne({ 
          PROD_ID: product.PROD_ID 
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          baseProduct: product,
          detailedProduct: savingsProduct
        }
      });

    } catch (error) {
      logger.error('Get product failed', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get product',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  },

  // Get all products
// Get all products
getAllProducts: async (req, res) => {
  try {
    const products = await Product.find().lean();
    const detailedProducts = await Promise.all(
      products.map(async (product) => {
        // Fetch product type mapping first to get the PRODUCT_TYPE
        const mapping = await ProductTypeMapping.findOne({ PROD_ID: product.PROD_ID }).lean();
        
        let specificProduct = null;
        
        // Use mapping PRODUCT_TYPE if available, otherwise use product's PRODUCT_TYPE
        const productType = mapping?.PRODUCT_TYPE || product.PRODUCT_TYPE;
        
        // If still no PRODUCT_TYPE, try to determine it from PROD_CD or other fields
        let finalProductType = productType;
        if (!finalProductType || finalProductType === 'undefined') {
          console.warn(`No PRODUCT_TYPE found for product ID ${product.PROD_ID}, attempting to determine from other fields`);
          
          // Try to determine product type from PROD_CD
          if (product.PROD_CD) {
            switch (String(product.PROD_CD)) {
              case '100':
              case '200': finalProductType = 'SAVINGS'; break;
              case '201': finalProductType = 'TERM_DEPOSIT'; break;
              case '300': finalProductType = 'BUSINESS TERM LOAN'; break;
              case '301': finalProductType = 'INDIVIDUAL LOAN'; break;
              case '302': finalProductType = 'CONSUMER LOAN'; break;
              case '303': finalProductType = 'MORTGAGE'; break;
              case '304': finalProductType = 'AUTO LOAN'; break;
              case '305': finalProductType = 'PERSONAL LOAN'; break;
              case '306': finalProductType = 'EDUCATION LOAN'; break;
              case '307': finalProductType = 'CREDIT CARD'; break;
              case '308': finalProductType = 'LINE OF CREDIT'; break;
              case '309': finalProductType = 'SME LOAN'; break;
              case '500': finalProductType = 'SAVINGS'; break; // Assuming 500 is savings
              default: 
                // Try to determine from product description
                const desc = product.PROD_DESC || '';
                if (desc.toLowerCase().includes('savings')) finalProductType = 'SAVINGS';
                else if (desc.toLowerCase().includes('term deposit')) finalProductType = 'TERM_DEPOSIT';
                else if (desc.toLowerCase().includes('loan')) finalProductType = 'GENERAL LOAN';
                else finalProductType = 'SAVINGS'; // Default fallback
            }
          } else {
            finalProductType = 'SAVINGS'; // Default fallback
          }
          
          console.log(`Determined PRODUCT_TYPE for PROD_ID ${product.PROD_ID}: ${finalProductType}`);
        }

        // Check product type and fetch specific product details
        if (finalProductType && (
          finalProductType.includes('LOAN') ||
          finalProductType === 'MORTGAGE' ||
          finalProductType === 'CREDIT CARD'
        )) {
          specificProduct = await LoanProduct.findOne({ PROD_ID: product.PROD_ID }).lean();
        } else if (finalProductType && (
          finalProductType === 'SAVINGS' || 
          finalProductType === 'TERM_DEPOSIT'
        )) {
          specificProduct = await SavingsProduct.findOne({ PROD_ID: product.PROD_ID }).lean();
        }

        return { 
          ...product, 
          mapping, 
          specificProduct,
          // Ensure PRODUCT_TYPE is always set
          PRODUCT_TYPE: finalProductType 
        };
      })
    );

    // Separate valid and invalid products
    const validProducts = detailedProducts.filter((product) => product.PRODUCT_TYPE && product.PRODUCT_TYPE !== 'undefined');
    const invalidProducts = detailedProducts.filter((product) => !product.PRODUCT_TYPE || product.PRODUCT_TYPE === 'undefined');

    if (invalidProducts.length > 0) {
      console.warn(`Found ${invalidProducts.length} products with invalid/missing PRODUCT_TYPE`, {
        invalidProductIds: invalidProducts.map((p) => p.PROD_ID),
      });
      
      // Optionally, you can auto-fix these products by updating their PRODUCT_TYPE
      await Promise.all(
        invalidProducts.map(async (product) => {
          try {
            await Product.findOneAndUpdate(
              { PROD_ID: product.PROD_ID },
              { PRODUCT_TYPE: product.PRODUCT_TYPE || 'SAVINGS' }
            );
            console.log(`Auto-updated PRODUCT_TYPE for PROD_ID ${product.PROD_ID} to: ${product.PRODUCT_TYPE || 'SAVINGS'}`);
          } catch (updateError) {
            console.error(`Failed to auto-update PRODUCT_TYPE for PROD_ID ${product.PROD_ID}:`, updateError.message);
          }
        })
      );
    }

    res.status(200).json({
      success: true,
      data: validProducts,
      warnings: invalidProducts.length > 0 ? {
        message: `Found ${invalidProducts.length} products with missing PRODUCT_TYPE that were auto-corrected`,
        invalidProductIds: invalidProducts.map((p) => p.PROD_ID),
        autoCorrected: true
      } : null,
    });
  } catch (error) {
    console.error('Error fetching products:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, message: 'Error fetching products', error: error.message });
  }
},

  // Get a product by PROD_ID
 // Get a product by PROD_ID
getProductById: async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID parameter
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product ID is required' 
      });
    }

    // Convert ID to number for PROD_ID query
    const productId = Number(id);
    if (isNaN(productId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid product ID format' 
      });
    }

    // Get base product
    const product = await Product.findOne({ PROD_ID: productId }).lean();
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: `Product with ID ${id} not found` 
      });
    }

    // Get product type mapping
    const mapping = await ProductTypeMapping.findOne({ 
      PROD_ID: productId.toString() 
    }).lean();

    // Get specific product based on type
    let specificProduct = null;
    const productType = product.PRODUCT_TYPE;

    if (productType === 'SAVINGS' || productType === 'TERM_DEPOSIT') {
      specificProduct = await SavingsProduct.findOne({ 
        PROD_ID: productId 
      }).lean();
      
      // If not found by PROD_ID, try productCode as fallback
      if (!specificProduct && product.productCode) {
        specificProduct = await SavingsProduct.findOne({ 
          productCode: product.productCode 
        }).lean();
      }
    } else if (productType.includes('LOAN') || productType === 'MORTGAGE' || productType === 'CREDIT CARD') {
      specificProduct = await LoanProduct.findOne({ 
        PROD_ID: productId 
      }).lean();
    }

    // Transform Decimal128 fields to numbers for response
    const transformDecimalFields = (obj) => {
      if (!obj) return obj;
      
      const transformed = { ...obj };
      const decimalFields = [
        'interestRate', 'minAmount', 'maxAmount', 'processingFeeRate', 
        'lateFeePerDay', 'maxLateFee', 'minimumBalance', 'maximumBalance',
        'chargeAmount', 'fixedRate', 'marginRate', 'effectiveRate'
      ];

      decimalFields.forEach(field => {
        if (transformed[field] && typeof transformed[field] === 'object') {
          transformed[field] = parseFloat(transformed[field].toString());
        }
      });

      // Transform nested rateInformation
      if (transformed.rateInformation) {
        const rateInfo = { ...transformed.rateInformation };
        ['fixedRate', 'marginRate', 'effectiveRate'].forEach(field => {
          if (rateInfo[field] && typeof rateInfo[field] === 'object') {
            rateInfo[field] = parseFloat(rateInfo[field].toString());
          }
        });
        transformed.rateInformation = rateInfo;
      }

      // Transform nested chargesSetup
      if (transformed.chargesSetup && transformed.chargesSetup.chargeAmount && typeof transformed.chargesSetup.chargeAmount === 'object') {
        transformed.chargesSetup.chargeAmount = parseFloat(transformed.chargesSetup.chargeAmount.toString());
      }

      return transformed;
    };

    // Transform all products
    const transformedProduct = transformDecimalFields(product);
    const transformedSpecificProduct = transformDecimalFields(specificProduct);
    const transformedMapping = transformDecimalFields(mapping);

    // Prepare response data
    const responseData = {
      baseProduct: transformedProduct,
      mapping: transformedMapping,
      specificProduct: transformedSpecificProduct
    };

    // Log successful retrieval
    logger.info('Product retrieved successfully', { 
      PROD_ID: productId,
      PRODUCT_TYPE: productType,
      hasSpecificProduct: !!specificProduct
    });

    res.status(200).json({ 
      success: true, 
      message: 'Product retrieved successfully',
      data: responseData
    });

  } catch (error) {
    // Log error details
    logger.error('Error fetching product by ID', { 
      error: error.message,
      productId: req.params.id,
      stack: error.stack
    });

    res.status(500).json({ 
      success: false, 
      message: 'Error fetching product', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
},

  
 // Update a product by PROD_ID
updateProduct: async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { PRODUCT_TYPE, ...updateData } = req.body;
    const finalProductType = PRODUCT_TYPE || updateData.PRODUCT_TYPE;

    // Step 1: Validate product exists
    const existingProduct = await Product.findOne({ PROD_ID: Number(id) }).session(session);
    if (!existingProduct) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    // Step 2: Process monetary fields for base product
    const decimalFields = ['minAmount', 'maxAmount', 'interestRate', 'processingFeeRate', 'lateFeePerDay', 'maxLateFee'];
    decimalFields.forEach(field => {
      if (updateData[field] !== undefined && updateData[field] !== null) {
        updateData[field] = mongoose.Types.Decimal128.fromString(updateData[field].toString());
      }
    });

    // Step 3: Process rateInformation for base product
    if (updateData.rateInformation) {
      const { rateType, fixedRate, marginRate, effectiveRate, effectiveDate } = updateData.rateInformation;
      
      if (effectiveRate === undefined || effectiveRate === null) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'effectiveRate is required'
        });
      }

      updateData.rateInformation = {
        rateType: rateType || 'FIXED',
        effectiveRate: mongoose.Types.Decimal128.fromString(effectiveRate.toString()),
        effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date()
      };

      if (rateType === 'FIXED' && fixedRate !== undefined && fixedRate !== null) {
        updateData.rateInformation.fixedRate = mongoose.Types.Decimal128.fromString(fixedRate.toString());
      }
      
      if (rateType === 'FLOATING' && marginRate !== undefined && marginRate !== null) {
        updateData.rateInformation.marginRate = mongoose.Types.Decimal128.fromString(marginRate.toString());
      }
    }

    // Step 4: Prepare savings product update data if applicable
    let savingsProductUpdateData = null;
    if (finalProductType === 'SAVINGS' || finalProductType === 'TERM_DEPOSIT') {
      savingsProductUpdateData = { ...updateData };
      
      // Process savings-specific decimal fields
      const savingsDecimalFields = ['minimumBalance', 'maximumBalance'];
      savingsDecimalFields.forEach(field => {
        if (savingsProductUpdateData[field] !== undefined && savingsProductUpdateData[field] !== null) {
          savingsProductUpdateData[field] = mongoose.Types.Decimal128.fromString(savingsProductUpdateData[field].toString());
        }
      });

      // Process rateInformation for savings product
      if (savingsProductUpdateData.rateInformation) {
        const { rateType, fixedRate, marginRate, effectiveRate, effectiveDate } = savingsProductUpdateData.rateInformation;
        
        savingsProductUpdateData.rateInformation = {
          rateType: rateType || 'FIXED',
          effectiveRate: mongoose.Types.Decimal128.fromString(effectiveRate.toString()),
          effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date()
        };

        if (rateType === 'FIXED' && fixedRate !== undefined && fixedRate !== null) {
          savingsProductUpdateData.rateInformation.fixedRate = mongoose.Types.Decimal128.fromString(fixedRate.toString());
        }
        
        if (rateType === 'FLOATING' && marginRate !== undefined && marginRate !== null) {
          savingsProductUpdateData.rateInformation.marginRate = mongoose.Types.Decimal128.fromString(marginRate.toString());
        }
      }

      // Process settlementInformation
      if (savingsProductUpdateData.settlementInformation) {
        savingsProductUpdateData.settlementInformation = {
          settlementFrequency: savingsProductUpdateData.settlementInformation.settlementFrequency || 'MONTHLY',
          principalSettlementMethod: savingsProductUpdateData.settlementInformation.principalSettlementMethod || 'ACCOUNT',
          interestSettlementMethod: savingsProductUpdateData.settlementInformation.interestSettlementMethod || 'ACCOUNT',
          settlementGLAccountNo: savingsProductUpdateData.settlementInformation.settlementGLAccountNo
        };
      }

      // Process accrualInformation
      if (savingsProductUpdateData.accrualInformation) {
        savingsProductUpdateData.accrualInformation = {
          accrualBasis: savingsProductUpdateData.accrualInformation.accrualBasis || 'ACT/360',
          accrualStartDate: savingsProductUpdateData.accrualInformation.accrualStartDate ? 
            new Date(savingsProductUpdateData.accrualInformation.accrualStartDate) : new Date(),
          accrualFrequency: savingsProductUpdateData.accrualInformation.accrualFrequency || 'DAILY'
        };
      }

      // Process chargesSetup
      if (savingsProductUpdateData.chargesSetup) {
        savingsProductUpdateData.chargesSetup = {
          CHRG_ID: savingsProductUpdateData.chargesSetup.CHRG_ID ? Number(savingsProductUpdateData.chargesSetup.CHRG_ID) : undefined,
          CHRG_CD: savingsProductUpdateData.chargesSetup.CHRG_CD,
          chargeType: savingsProductUpdateData.chargesSetup.chargeType || 'FLAT',
          chargeAmount: mongoose.Types.Decimal128.fromString(
            (savingsProductUpdateData.chargesSetup.chargeAmount || '0').toString()
          ),
          chargeGLAccountNo: savingsProductUpdateData.chargesSetup.chargeGLAccountNo,
          chargeName: savingsProductUpdateData.chargesSetup.chargeName,
          status: savingsProductUpdateData.chargesSetup.status,
          TIER_TY: savingsProductUpdateData.chargesSetup.TIER_TY,
          BAL_ACTION_CD: savingsProductUpdateData.chargesSetup.BAL_ACTION_CD,
          VERSION_NO: savingsProductUpdateData.chargesSetup.VERSION_NO ? Number(savingsProductUpdateData.chargesSetup.VERSION_NO) : undefined,
          USER_ID: savingsProductUpdateData.chargesSetup.USER_ID,
          CREATED_BY: savingsProductUpdateData.chargesSetup.CREATED_BY || 'system'
        };
      }
    }

    // Step 5: Validate GL accounts
    const glFields = [
      'principalBalanceGLAccountNo', 'interestGLAccountNo', 'interestPayableGLAccountNo', 'withholdingTaxGLAccountNo',
      'depositChargeReceivableGLAccountNo', 'delinquentBalanceGLAccountNo', 'dormantBalanceGLAccountNo',
      'earmarkedBalanceGLAccountNo', 'escheatedBalanceGLAccountNo', 'interestChequesGLAccountNo',
      'interestExpenseGLAccountNo', 'interestIncomeGLAccountNo', 'interestReceivableGLAccountNo',
      'interestSuspenseGLAccountNo', 'maturedBalanceGLAccountNo', 'maturityChequesGLAccountNo',
      'nonAccrualBalanceGLAccountNo', 'overdrawnBalanceGLAccountNo', 'preDormantBalanceGLAccountNo',
      'provisionReserveGLAccountNo', 'provisionExpenseGLAccountNo', 'rejectedCreditSuspenseGLAccountNo',
      'rejectedDebitSuspenseGLAccountNo', 'reservedBalanceGLAccountNo', 'unclearedBalanceGLAccountNo',
      'writeOffBalanceGLAccountNo', 'recoveriesGLAccountNo', 'interestCreditGLAccountNo', 'interestDebitGLAccountNo'
    ];

    const providedGLAccounts = {};
    for (const field of glFields) {
      if (updateData[field]) {
        // Validate GL account exists
        const glAccount = await GLAccount.findOne({ GL_ACCT_NO: updateData[field] }).session(session);
        if (!glAccount) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Invalid GL account number: ${updateData[field]} for ${field}`
          });
        }
        providedGLAccounts[field] = updateData[field];
      }
    }

    // Step 6: Update base product
    const updatedProduct = await Product.findOneAndUpdate(
      { PROD_ID: Number(id) },
      updateData,
      { new: true, runValidators: true, session }
    );

    if (!updatedProduct) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found after update attempt' 
      });
    }

    // Step 7: Update specific product type
    let updatedSpecificProduct = null;
    if (finalProductType === 'SAVINGS' || finalProductType === 'TERM_DEPOSIT') {
      updatedSpecificProduct = await SavingsProduct.findOneAndUpdate(
        { PROD_ID: Number(id) },
        savingsProductUpdateData || updateData,
        { new: true, runValidators: true, session }
      );
    } else if (finalProductType.includes('LOAN') || finalProductType === 'MORTGAGE' || finalProductType === 'CREDIT CARD') {
      updatedSpecificProduct = await LoanProduct.findOneAndUpdate(
        { PROD_ID: Number(id) },
        updateData,
        { new: true, runValidators: true, session }
      );
    }

    // Step 8: Update product type mapping
    const accountPrefix = getPrefixForProductType(finalProductType || updatedProduct.PRODUCT_TYPE);
    
    await ProductTypeMapping.findOneAndUpdate(
      { PROD_ID: id },
      {
        PROD_ID: id,
        PRODUCT_TYPE: finalProductType || updatedProduct.PRODUCT_TYPE,
        productName: updateData.productName || updatedProduct.productName,
        PROD_DESC: updateData.PROD_DESC || updatedProduct.PROD_DESC,
        PROD_CD: updateData.PROD_CD || updatedProduct.PROD_CD,
        accountPrefix: accountPrefix,
        glAccounts: providedGLAccounts
      },
      { upsert: true, new: true, session }
    );

    // Step 9: Commit transaction
    await session.commitTransaction();

    // Step 10: Return success response
    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: {
        baseProduct: updatedProduct,
        specificProduct: updatedSpecificProduct
      }
    });

  } catch (error) {
    await session.abortTransaction();
    
    logger.error('Product update failed', { 
      error: error.message,
      productId: req.params.id 
    });

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Schema validation failed during update',
        errors
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Error updating product', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  } finally {
    session.endSession();
  }
},

  // Delete a product by PROD_ID
  deleteProduct: async (req, res) => {
    try {
      const deletedProduct = await Product.findOneAndDelete({ PROD_ID: req.params.id });
      if (!deletedProduct) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      await LoanProduct.deleteOne({ PROD_ID: req.params.id });
      await SavingsProduct.deleteOne({ PROD_ID: req.params.id });
      await ProductTypeMapping.deleteOne({ PROD_ID: req.params.id });

      res.status(200).json({ success: true, message: 'Product and related data deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error deleting product', error: error.message });
    }
  }
};

export default ProductsController;