// src/utils/generateLoanAccountId.js - Corrected to return string account numbers

import { Op } from 'sequelize';
import Counter from '../models/Counter.js';
import Transaction from '../models/Transaction.js';
import LoanProduct from '../models/LoanProduct.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js';
import sequelize from '../../config/db.js';

// ✅ Account prefix logic based on product type ONLY (3-digit prefixes for 10-digit account numbers)
export function getPrefixForProductType(productType) {
  const typeStr = String(productType).toUpperCase().trim();
  const normalizedType = typeStr.replace(/\s+/g, '_');
  
  const prefixMap = {
    'BUSINESS_TERM_LOAN': '300',
    'INDIVIDUAL_LOAN': '301',
    'CONSUMER_LOAN': '302',
    'MORTGAGE': '303',
    'AUTO_LOAN': '304',
    'PERSONAL_LOAN': '305',
    'EDUCATION_LOAN': '306',
    'CREDIT_CARD': '307',
    'LINE_OF_CREDIT': '308',
    'SME_LOAN': '309',
    'GROUP_LOAN': '310',
    'MONTHLY': '311',
    'ASSET_LOAN': '312',
    'RAPID_CASH_LOAN': '313',
    'STAFF_LOAN': '314',
    'STAFF_SALARY_ADVANCE': '315',
    'GROUP_MONTHLY_LOAN': '316',
    'SOLAR_LOAN': '317',
    'DAILY_LOAN': '318',
    'GENERAL_LOAN': '319'
  };

  const prefix = prefixMap[normalizedType];
  if (prefix) return prefix;
  if (normalizedType.includes('LOAN')) return '319';
  throw new Error(`Unsupported product type: ${productType}`);
}

// ✅ Database lookup for product type using ProductTypeMapping
export const getProductTypeFromDatabase = async (PROD_ID) => {
  try {
    console.log(`🔍 Looking up product type mapping for PROD_ID: ${PROD_ID}`);
    const productMapping = await ProductTypeMapping.findOne({ where: { PROD_ID } });
    if (productMapping && productMapping.PRODUCT_TYPE) {
      console.log(`✅ Found product type in mapping: ${productMapping.PRODUCT_TYPE}`);
      return productMapping.PRODUCT_TYPE;
    }
    console.log(`⚠️ No mapping found in ProductTypeMapping, checking LoanProduct...`);
    const product = await LoanProduct.findOne({
      where: {
        [Op.or]: [
          { PROD_ID },
          { product_code: PROD_ID.toString() }   // fixed column name
        ]
      }
    });
    if (product) {
      const productType = product.PRODUCT_TYPE || product.product_type || product.type;
      if (productType) {
        console.log(`✅ Found product type in LoanProduct: ${productType}`);
        return productType;
      }
    }
    return null;
  } catch (error) {
    console.error('Database lookup error:', error);
    return null;
  }
};

// ✅ Enhanced fallback with better mapping
export const getProductTypeFallback = async (PROD_ID) => {
  console.log(`🔍 Getting product type for PROD_ID: ${PROD_ID}`);
  try {
    const productType = await getProductTypeFromDatabase(PROD_ID);
    if (productType) return productType;
    
    const prodIdStr = PROD_ID.toString();
    const prodNum = Number(PROD_ID);
    
    // Pattern mapping based on PROD_CD
    const patternMap = {
      300: 'BUSINESS_TERM_LOAN', 301: 'INDIVIDUAL_LOAN', 302: 'CONSUMER_LOAN',
      303: 'MORTGAGE', 304: 'AUTO_LOAN', 305: 'PERSONAL_LOAN', 306: 'EDUCATION_LOAN',
      307: 'CREDIT_CARD', 308: 'LINE_OF_CREDIT', 309: 'SME_LOAN', 310: 'GROUP_LOAN',
      311: 'MONTHLY', 312: 'ASSET_LOAN', 313: 'RAPID_CASH_LOAN', 314: 'STAFF_LOAN',
      315: 'STAFF_SALARY_ADVANCE', 316: 'GROUP_MONTHLY_LOAN', 317: 'SOLAR_LOAN',
      318: 'DAILY_LOAN', 319: 'GENERAL_LOAN'
    };
    if (patternMap[prodNum]) return patternMap[prodNum];
    
    // Check if PROD_ID is a 3-digit prefix itself
    if (/^\d{3}$/.test(prodIdStr) && patternMap[prodNum]) return patternMap[prodNum];
    
    console.log(`⚠️ Using GENERAL_LOAN fallback for PROD_ID: ${PROD_ID}`);
    return 'GENERAL_LOAN';
  } catch (error) {
    console.error('Error in getProductTypeFallback:', error);
    return 'GENERAL_LOAN';
  }
};

// ✅ FIXED: Returns a STRING (the account number) – NOT an object
export const generateLoanAccountNumberByProdId = async (PROD_ID, transaction = null) => {
  let localTransaction = transaction;
  let shouldCommit = false;
  
  try {
    console.log(`🚀 Generating 10-digit loan account for PROD_ID: ${PROD_ID}`);
    
    if (!localTransaction) {
      localTransaction = await sequelize.transaction();
      shouldCommit = true;
    }
    
    const productType = await getProductTypeFallback(PROD_ID);
    const prefix = getPrefixForProductType(productType);
    console.log(`📊 ${productType} → Prefix: ${prefix}`);
    
    const counterName = `LOAN_ACCT_${prefix}`;
    let counter = await Counter.findOne({
      where: { name: counterName },
      transaction: localTransaction
    });
    
    let nextSeq;
    if (counter) {
      nextSeq = (counter.seq || 0) + 1;
      await counter.update({ seq: nextSeq }, { transaction: localTransaction });
      console.log(`✅ Updated counter for ${prefix} to seq: ${nextSeq}`);
    } else {
      nextSeq = 1;
      counter = await Counter.create({
        name: counterName,
        seq: nextSeq,
        description: `${productType} account numbers (10-digit format: ${prefix} + 7-digit sequence)`
      }, { transaction: localTransaction });
      console.log(`✅ Created new counter for ${prefix} starting at 1`);
    }

    if (!counter) throw new Error(`Counter ${counterName} update failed`);

    const sequencePart = String(nextSeq).padStart(7, '0');
    const accountNumber = `${prefix}${sequencePart}`;
    
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new Error(`Invalid account number: ${accountNumber} - Expected 10 digits, got ${accountNumber.length} digits`);
    }

    if (shouldCommit) await localTransaction.commit();

    console.log(`✅ Generated 10-digit account: ${accountNumber} (${productType})`);
    console.log(`   Format: ${prefix} (prefix) + ${sequencePart} (sequence) = ${accountNumber.length} digits`);
    
    // ✅ Return the account number string only
    return accountNumber;

  } catch (error) {
    if (shouldCommit && localTransaction) await localTransaction.rollback();
    console.error('❌ Generation failed:', error.message);
    
    // Fallback – still returns a string
    const timestamp = Date.now().toString();
    const fallbackSeq = timestamp.slice(-7).padStart(7, '0');
    const fallbackNumber = `319${fallbackSeq}`;
    console.log(`⚠️ Using fallback account number: ${fallbackNumber} (${fallbackNumber.length} digits)`);
    return fallbackNumber;
  }
};

// ✅ generateDepositAccountNumber – now returns a string
export const generateDepositAccountNumber = async (PROD_ID, transaction = null) => {
  let localTransaction = transaction;
  let shouldCommit = false;
  
  try {
    console.log(`💰 Generating 10-digit deposit account for PROD_ID: ${PROD_ID}`);
    if (!localTransaction) {
      localTransaction = await sequelize.transaction();
      shouldCommit = true;
    }
    
    let counter = await Counter.findOne({
      where: { name: 'DEPOSIT_ACCOUNT_NUMBER' },
      transaction: localTransaction
    });
    
    let nextSeq;
    if (counter) {
      nextSeq = (counter.seq || 0) + 1;
      await counter.update({ seq: nextSeq }, { transaction: localTransaction });
      console.log(`✅ Updated deposit counter to seq: ${nextSeq}`);
    } else {
      nextSeq = 10;
      counter = await Counter.create({
        name: 'DEPOSIT_ACCOUNT_NUMBER',
        seq: nextSeq,
        description: 'Deposit account numbers (10-digit format: 20 + 8-digit sequence)'
      }, { transaction: localTransaction });
      console.log(`✅ Created new deposit counter starting at 10`);
    }

    if (!counter) throw new Error('Deposit counter update failed');

    const sequencePart = String(nextSeq).padStart(8, '0');
    const accountNumber = `20${sequencePart}`;
    
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new Error(`Invalid deposit account: ${accountNumber} - Expected 10 digits, got ${accountNumber.length} digits`);
    }

    if (shouldCommit) await localTransaction.commit();
    console.log(`✅ Generated 10-digit deposit: ${accountNumber}`);
    return accountNumber;

  } catch (error) {
    if (shouldCommit && localTransaction) await localTransaction.rollback();
    console.error('❌ Deposit generation failed:', error);
    const fallbackNumber = `20${Date.now().toString().slice(-8).padStart(8, '0')}`;
    return fallbackNumber;
  }
};

// ✅ Universal account number generator – returns string
export const generateAccountNumberByProdId = async (PROD_ID, transaction = null) => {
  try {
    const productMapping = await ProductTypeMapping.findOne({ where: { PROD_ID } });
    if (productMapping && (productMapping.PRODUCT_TYPE === 'SAVINGS' || productMapping.PRODUCT_TYPE === 'TERM_DEPOSIT')) {
      return await generateDepositAccountNumber(PROD_ID, transaction);
    }
    return await generateLoanAccountNumberByProdId(PROD_ID, transaction);
  } catch (error) {
    console.error('Universal generation failed:', error);
    const fallbackNumber = Date.now().toString().slice(-10).padStart(10, '0');
    return fallbackNumber;
  }
};

// ✅ Initialize counters – unchanged, does not rely on return types
export const initializeCounters = async () => {
  const startTime = Date.now();
  try {
    console.log('🚀 INITIALIZING ACCOUNT NUMBER COUNTERS');
    console.log('='.repeat(50));
    
    let depositCounter = await Counter.findOne({ where: { name: 'DEPOSIT_ACCOUNT_NUMBER' } });
    if (!depositCounter) {
      depositCounter = await Counter.create({
        name: 'DEPOSIT_ACCOUNT_NUMBER',
        seq: 10,
        description: 'Generates deposit account numbers (2000000011, 2000000012, ...)'
      });
      console.log('✅ Created deposit counter (starts at: 2000000011)');
    } else {
      console.log(`📊 Deposit counter exists: sequence ${depositCounter.seq}`);
      const nextSeq = (depositCounter.seq || 0) + 1;
      console.log(`   Next account: 20${String(nextSeq).padStart(8, '0')}`);
    }
    
    const loanPrefixes = ['300','301','302','303','304','305','306','307','308','309','310','311','312','313','314','315','316','317','318','319'];
    const prefixNames = {
      '300': 'Business Term Loan', '301': 'Individual Loan', '302': 'Consumer Loan',
      '303': 'Mortgage', '304': 'Auto Loan', '305': 'Personal Loan', '306': 'Education Loan',
      '307': 'Credit Card', '308': 'Line of Credit', '309': 'SME Loan', '310': 'Group Loan',
      '311': 'Monthly Loan', '312': 'Asset Loan', '313': 'Rapid Cash Loan', '314': 'Staff Loan',
      '315': 'Staff Salary Advance', '316': 'Group Monthly Loan', '317': 'Solar Loan',
      '318': 'Daily Loan', '319': 'General Loan'
    };
    
    let createdCount = 0, existingCount = 0;
    for (const prefix of loanPrefixes) {
      const counterName = `LOAN_ACCT_${prefix}`;
      let counter = await Counter.findOne({ where: { name: counterName } });
      if (!counter) {
        await Counter.create({
          name: counterName,
          seq: 0,
          description: `Generates ${prefixNames[prefix] || 'loan'} account numbers (10-digit format: ${prefix} + 7-digit sequence)`
        });
        createdCount++;
        console.log(`✅ Created counter for prefix ${prefix} (${prefixNames[prefix] || 'loan'})`);
      } else {
        existingCount++;
        console.log(`📊 Counter exists for prefix ${prefix}: sequence ${counter.seq}`);
      }
    }
    
    const elapsedTime = Date.now() - startTime;
    console.log('\n📈 INITIALIZATION SUMMARY:');
    console.log('='.repeat(50));
    console.log(`✅ Deposit counter: ${depositCounter ? 'Ready' : 'Failed'}`);
    console.log(`✅ Loan counters: ${createdCount} created, ${existingCount} existing`);
    console.log(`✅ Total counters: ${createdCount + existingCount + 1}`);
    console.log(`⏱️  Time taken: ${elapsedTime}ms`);
    console.log('\n🎯 READY TO GENERATE 10-DIGIT ACCOUNT NUMBERS');
    
    return { success: true, depositCounter: depositCounter?.seq || 10, loanCountersCreated: createdCount, loanCountersExisting: existingCount, totalCounters: createdCount + existingCount + 1, elapsedTime };
  } catch (error) {
    console.error('❌ INITIALIZATION FAILED:', error);
    return { success: false, error: error.message, elapsedTime: Date.now() - startTime };
  }
};

// ✅ generateTransactionId – unchanged (returns string)
export const generateTransactionId = async (prefix = 'TXN', transaction = null) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  const transactionId = `${prefix}_${timestamp}_${random}`;
  if (transaction) {
    try {
      const existing = await Transaction.findOne({ where: { TRANSACTION_ID: transactionId }, transaction });
      if (existing) {
        const extraRandom = Math.floor(Math.random() * 10000);
        return `${prefix}_${timestamp}_${random}_${extraRandom}`;
      }
    } catch (error) { console.warn('Could not verify transaction ID uniqueness:', error.message); }
  }
  return transactionId;
};

export const generateTransactionIdSync = (prefix = 'TXN') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
};

export default {
  getPrefixForProductType,
  generateLoanAccountNumberByProdId,
  generateDepositAccountNumber,
  generateAccountNumberByProdId,
  getProductTypeFromDatabase,
  getProductTypeFallback,
  initializeCounters,
  generateTransactionId,
  generateTransactionIdSync
};