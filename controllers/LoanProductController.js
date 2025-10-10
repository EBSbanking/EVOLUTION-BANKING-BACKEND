import mongoose from 'mongoose';
import Product from '../models/SavingsProducts.js';
import LoanProduct from '../models/LoanProduct.js';
import SavingsProduct from '../models/SavingsProduct.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js';
import GLAccount from '../models/GLAccount.js';
import { getPrefixForProductType } from '../utils/generateLoanAccountId.js';

export const ProductsController = {

  // Create a new product with appropriate GL accounts and mapping
  createProduct: async (req, res) => {
    try {
      // Step 1: Validate required fields
      if (!req.body.name || !req.body.PROD_ID || !req.body.productCode) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: name, PROD_ID, and productCode are required'
        });
      }

      const { name, productCode, productType } = req.body;

      // Step 2: Determine product type from productCode or name
      let PRODUCT_TYPE = productType;
      if (!PRODUCT_TYPE) {
        switch (String(productCode)) {
          case '300':
            PRODUCT_TYPE = 'BUSINESS TERM LOAN';
            break;
          case '301':
            PRODUCT_TYPE = 'INDIVIDUAL LOAN';
            break;
          case '302':
            PRODUCT_TYPE = 'CONSUMER LOAN';
            break;
          case '303':
            PRODUCT_TYPE = 'MORTGAGE';
            break;
          case '304':
            PRODUCT_TYPE = 'AUTO LOAN';
            break;
          case '305':
            PRODUCT_TYPE = 'PERSONAL LOAN';
            break;
          case '306':
            PRODUCT_TYPE = 'EDUCATION LOAN';
            break;
          case '307':
            PRODUCT_TYPE = 'CREDIT CARD';
            break;
          case '308':
            PRODUCT_TYPE = 'LINE OF CREDIT';
            break;
          case '309':
            PRODUCT_TYPE = 'SME LOAN';
            break;
          default:
            // Fallback to name matching
            const lowerName = name.toLowerCase();
            if (/individual\s*loan/i.test(lowerName)) PRODUCT_TYPE = 'INDIVIDUAL LOAN';
            else if (/term\s*deposit/i.test(lowerName)) PRODUCT_TYPE = 'TERM_DEPOSIT';
            else if (/savings?/i.test(lowerName)) PRODUCT_TYPE = 'SAVINGS';
            else if (/business\s*term\s*loan/i.test(lowerName)) PRODUCT_TYPE = 'BUSINESS TERM LOAN';
            else if (/consumer\s*loan/i.test(lowerName)) PRODUCT_TYPE = 'CONSUMER LOAN';
            else if (/mortgage/i.test(lowerName)) PRODUCT_TYPE = 'MORTGAGE';
            else if (/auto\s*loan/i.test(lowerName) || /car\s*loan/i.test(lowerName)) PRODUCT_TYPE = 'AUTO LOAN';
            else if (/personal\s*loan/i.test(lowerName)) PRODUCT_TYPE = 'PERSONAL LOAN';
            else if (/education\s*loan/i.test(lowerName) || /student\s*loan/i.test(lowerName)) PRODUCT_TYPE = 'EDUCATION LOAN';
            else if (/credit\s*card/i.test(lowerName)) PRODUCT_TYPE = 'CREDIT CARD';
            else if (/line\s*of\s*credit/i.test(lowerName)) PRODUCT_TYPE = 'LINE OF CREDIT';
            else if (/sme\s*loan/i.test(lowerName)) PRODUCT_TYPE = 'SME LOAN';
            else PRODUCT_TYPE = 'GENERAL';
        }
      }

      // Step 3: Define recommended GL accounts based on product type (but make them optional)
      let recommendedGLAccounts = [];
      let productData = { ...req.body };

      if (PRODUCT_TYPE.includes('LOAN') || PRODUCT_TYPE === 'MORTGAGE' || PRODUCT_TYPE === 'CREDIT CARD') {
        recommendedGLAccounts = [
          'glAccountNo', 'interestGLAccountNo', 'interestPayableGLAccountNo',
          'withholdingTaxGLAccountNo', 'suspenseGLAccountNo', 'principalGLAccountNo',
          // 'chargeOffGLAccountNo', 'loanChargeReceivableGLAccountNo', 'contingentGLAccountNo',
          // 'delinquentGLAccountNo', 'interestIncomeGLAccountNo', 'interestReceivableGLAccountNo',
          // 'interestSuspenseGLAccountNo', 'lateFeeSuspenseGLAccountNo', 'maturityGLAccountNo',
          // 'nonAccrualGLAccountNo', 'nonAccrualInterestOffsetGLAccountNo',
          // 'nonAccrualInterestReceivableGLAccountNo', 'provisionReserveGLAccountNo',
          // 'provisionExpenseGLAccountNo', 'recoveriesGLAccountNo', 'repaymentControlGLAccountNo',
          // 'loanSuspenseGLAccountNo', 'unappliedFundsGLAccountNo', 'unclearedBalanceGLAccountNo',
          // 'unearnedInterestGLAccountNo'
        ];

        // Only include GL accounts that are actually provided
        productData = {
          ...productData,
          ...(req.body.glAccountNo && { glAccountNo: req.body.glAccountNo }),
          ...(req.body.interestGLAccountNo && { interestGLAccountNo: req.body.interestGLAccountNo }),
          // Add similar conditional checks for all other GL accounts
        };
      } else if (PRODUCT_TYPE === 'SAVINGS' || PRODUCT_TYPE === 'TERM_DEPOSIT') {
        recommendedGLAccounts = [
          // 'depositChargeReceivableGLAccountNo', 'delinquentBalanceGLAccountNo',
          // 'dormantBalanceGLAccountNo', 'earmarkedBalanceGLAccountNo',
          // 'escheatedBalanceGLAccountNo', 'interestChequesGLAccountNo',
          // 'interestExpenseGLAccountNo', 'interestIncomeGLAccountNo',
          // 'interestPayableGLAccountNo', 'interestReceivableGLAccountNo',
          // 'interestSuspenseGLAccountNo', 'maturedBalanceGLAccountNo',
          // 'maturityChequesGLAccountNo', 'nonAccrualBalanceGLAccountNo',
          // 'overdrawnBalanceGLAccountNo', 'preDormantBalanceGLAccountNo',
          // 'principalBalanceGLAccountNo', 'provisionReserveGLAccountNo',
          // 'provisionExpenseGLAccountNo', 'rejectedCreditSuspenseGLAccountNo',
          // 'rejectedDebitSuspenseGLAccountNo', 'reservedBalanceGLAccountNo',
          // 'unclearedBalanceGLAccountNo', 'writeOffBalanceGLAccountNo',
          // 'recoveriesGLAccountNo'
        ];

        // Only include GL accounts that are actually provided
        productData = {
          ...productData,
          ...(req.body.depositChargeReceivableGLAccountNo && { depositChargeReceivableGLAccountNo: req.body.depositChargeReceivableGLAccountNo }),
          // Add similar conditional checks for all other GL accounts
        };
      }

      // Step 4: Validate provided GL accounts exist in GLAccount model
      const providedGLAccounts = recommendedGLAccounts.filter(account => req.body[account]);
      
      for (const account of providedGLAccounts) {
        const glAccount = await GLAccount.findOne({ accountNo: req.body[account] });
        if (!glAccount) {
          return res.status(400).json({
            success: false,
            message: `Invalid GL account number: ${req.body[account]} for ${account}`,
            recommendedAccounts: recommendedGLAccounts
          });
        }
      }

      // Step 5: Process fee structure for loan products
      if (PRODUCT_TYPE.includes('LOAN') || PRODUCT_TYPE === 'MORTGAGE' || PRODUCT_TYPE === 'CREDIT CARD') {
        if (productData.feeStructure) {
          productData.feeStructure = productData.feeStructure.map(fee => {
            const amount = fee.amount !== undefined
              ? new mongoose.Types.Decimal128(fee.amount.toString())
              : new mongoose.Types.Decimal128('0');

            return {
              ...fee,
              feeType: fee.feeType?.toUpperCase().replace(/\s+/g, '_') || 'OTHER',
              amount,
              name: fee.name || fee.feeType || 'Unnamed Fee'
            };
          });

          // Validate GL account codes for fees if provided
          for (const fee of productData.feeStructure) {
            if (fee.glAccountCode) {
              const glAccount = await GLAccount.findOne({ accountNo: fee.glAccountCode });
              if (!glAccount) {
                return res.status(400).json({
                  success: false,
                  message: `Invalid GL account code: ${fee.glAccountCode} for fee: ${fee.name || fee.feeType}`
                });
              }
            }
          }
        }

        // Convert and validate processing fee rate
        if (productData.processingFeeRate !== undefined) {
          productData.processingFeeRate = new mongoose.Types.Decimal128(
            productData.processingFeeRate.toString()
          );

          if (parseFloat(productData.processingFeeRate.toString()) > 0 && productData.processingFeeGLCode) {
            const glAccount = await GLAccount.findOne({ accountNo: productData.processingFeeGLCode });
            if (!glAccount) {
              return res.status(400).json({
                success: false,
                message: `Invalid processing fee GL account code: ${productData.processingFeeGLCode}`
              });
            }
          }
        }
      }

      // Step 6: Save base product
      const newProduct = new Product(productData);
      await newProduct.save();

      // Step 7: Save to appropriate product type collection
      let specificProduct;
      if (PRODUCT_TYPE.includes('LOAN') || PRODUCT_TYPE === 'MORTGAGE' || PRODUCT_TYPE === 'CREDIT CARD') {
        specificProduct = await LoanProduct.findOneAndUpdate(
          { productCode },
          productData,
          { upsert: true, new: true }
        );
      } else if (PRODUCT_TYPE === 'SAVINGS' || PRODUCT_TYPE === 'TERM_DEPOSIT') {
        specificProduct = await SavingsProduct.findOneAndUpdate(
          { productCode },
          productData,
          { upsert: true, new: true }
        );
      } else {
        // For general products, just use the base product
        specificProduct = newProduct;
      }

      // Step 8: Get the account prefix
      const accountPrefix = getPrefixForProductType(PRODUCT_TYPE);

      // Step 9: Save product-type mapping with GL accounts and account prefix
      const PROD_ID = req.body.PROD_ID || productCode;
      await ProductTypeMapping.findOneAndUpdate(
        { PROD_ID },
        { 
          PROD_ID,
          PRODUCT_TYPE,
          productName: name,
          accountPrefix,
          glAccounts: productData
        },
        { upsert: true, new: true }
      );

      // Step 10: Send successful response
      return res.status(201).json({
        success: true,
        message: `${PRODUCT_TYPE} product created successfully`,
        data: {
          baseProduct: newProduct,
          specificProduct: specificProduct.toObject({ getters: true, virtuals: true }),
          productType: PRODUCT_TYPE,
          accountPrefix,
          providedGLAccounts,
          recommendedGLAccounts: recommendedGLAccounts.filter(acc => !providedGLAccounts.includes(acc))
        }
      });

    } catch (error) {
      console.error('Create Product Error:', error);

      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }

      if (error.name === 'MongoError' && error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Product with this PROD_ID or productCode already exists'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Error creating product',
        error: error.message
      });
    }
  }
};

// Get all loan products
export const getAllLoanProducts = async (req, res) => {
  try {
    const products = await LoanProduct.find();
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.error('Fetch All Loan Products Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching loan products', 
      error: error.message 
    });
  }
};

// Get single loan product
export const getLoanProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = mongoose.Types.ObjectId.isValid(id)
      ? await LoanProduct.findById(id)
      : await LoanProduct.findOne({ 
          $or: [
            { productCode: id },
            { PROD_ID: id }
          ]
        });

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Loan product not found' 
      });
    }

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    console.error('Fetch Loan Product Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching loan product', 
      error: error.message 
    });
  }
};

// Update loan product
export const updateLoanProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate GL codes if updating fee structure
    if (req.body.feeStructure) {
      for (const fee of req.body.feeStructure) {
        if (!fee.glAccountCode) {
          return res.status(400).json({ 
            success: false, 
            message: `GL account code is required for fee type: ${fee.feeType}` 
          });
        }
      }
    }

    const updated = await LoanProduct.findByIdAndUpdate(
      id,
      {
        ...req.body,
        updatedAt: new Date()
      }, 
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ 
        success: false, 
        message: 'Loan product not found' 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Loan product updated', 
      data: updated 
    });
  } catch (error) {
    console.error('Update Loan Product Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating loan product', 
      error: error.message 
    });
  }
};

// Delete loan product
export const deleteLoanProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await LoanProduct.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ 
        success: false, 
        message: 'Loan product not found' 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Loan product deleted' 
    });
  } catch (error) {
    console.error('Delete Loan Product Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting loan product', 
      error: error.message 
    });
  }
};