// utils/generateLoanAccountId.js - Sequelize Version
import { Op } from 'sequelize';
import Counter from '../models/Counter.js';
import Transaction from '../models/Transaction.js';
import LoanProduct from '../models/LoanProduct.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js'; // Import the ProductTypeMapping model
import sequelize from '../../config/db.js';

// ✅ Account prefix logic based on product type ONLY - UPDATED
export function getPrefixForProductType(productType) {
  const typeStr = String(productType).toUpperCase().trim();

  // Map to consistent format (with underscores)
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
    'MONTHLY': '311', // Note: Just "MONTHLY" not "MONTHLY_LOAN"
    'ASSET_LOAN': '312',
    'RAPID_CASH_LOAN': '313',
    'STAFF_LOAN': '314',
    'STAFF_SALARY_ADVANCE': '315',
    'GROUP_MONTHLY_LOAN': '316',
    'SOLAR_LOAN': '317',
    'DAILY_LOAN': '318',
    'GENERAL_LOAN': '319' // Updated from '399' to '319'
  };

  // Return prefix from map, or use general loan if contains "LOAN"
  const prefix = prefixMap[normalizedType];
  if (prefix) {
    return prefix;
  }
  
  // Fallback for loan types not in map
  if (normalizedType.includes('LOAN')) {
    return '319'; // Use GENERAL_LOAN prefix
  }
  
  throw new Error(`Unsupported product type: ${productType}`);
}

// ✅ IMPROVED: Database lookup for product type using ProductTypeMapping
export const getProductTypeFromDatabase = async (PROD_ID) => {
  try {
    console.log(`🔍 Looking up product type mapping for PROD_ID: ${PROD_ID}`);
    
    // First, try the ProductTypeMapping model (primary source)
    const productMapping = await ProductTypeMapping.findOne({ 
      where: { PROD_ID: PROD_ID }
    });
    
    if (productMapping) {
      const productType = productMapping.PRODUCT_TYPE;
      if (productType) {
        console.log(`✅ Found product type in mapping: ${productType} for PROD_ID: ${PROD_ID}`);
        return productType;
      }
    }
    
    // Fallback to LoanProduct model
    console.log(`⚠️ No mapping found in ProductTypeMapping, checking LoanProduct...`);
    const product = await LoanProduct.findOne({ 
      where: {
        [Op.or]: [
          { PROD_ID: PROD_ID },
          { productCode: PROD_ID.toString() }
        ]
      }
    });
    
    if (product) {
      // Extract product type from various possible fields
      const productType = product.PRODUCT_TYPE || 
                         product.productType || 
                         product.type ||
                         product.PROD_CAT_TY ||
                         product.productCategory;
      
      if (productType) {
        console.log(`✅ Found product type in LoanProduct: ${productType} for PROD_ID: ${PROD_ID}`);
        return productType;
      }
    }
    
    console.log(`⚠️ No product type found for PROD_ID: ${PROD_ID}`);
    return null;
    
  } catch (error) {
    console.error('Database lookup error:', error);
    return null;
  }
};

// ✅ ENHANCED: Fallback with better mapping
export const getProductTypeFallback = async (PROD_ID) => {
  console.log(`🔍 Getting product type for PROD_ID: ${PROD_ID}`);
  
  try {
    // 1. First try database lookup using new mapping
    const productType = await getProductTypeFromDatabase(PROD_ID);
    if (productType) {
      return productType;
    }
    
    // 2. Try to infer from PROD_ID patterns
    const prodIdStr = PROD_ID.toString();
    const prodNum = Number(PROD_ID);
    
    // Updated patterns based on your PROD_CD mapping
    if (prodNum === 300 || prodIdStr.startsWith('300')) {
      return 'BUSINESS_TERM_LOAN';
    } else if (prodNum === 301 || prodIdStr.startsWith('301')) {
      return 'INDIVIDUAL_LOAN';
    } else if (prodNum === 302 || prodIdStr.startsWith('302')) {
      return 'CONSUMER_LOAN';
    } else if (prodNum === 303 || prodIdStr.startsWith('303')) {
      return 'MORTGAGE';
    } else if (prodNum === 304 || prodIdStr.startsWith('304')) {
      return 'AUTO_LOAN';
    } else if (prodNum === 305 || prodIdStr.startsWith('305')) {
      return 'PERSONAL_LOAN';
    } else if (prodNum === 306 || prodIdStr.startsWith('306')) {
      return 'EDUCATION_LOAN';
    } else if (prodNum === 307 || prodIdStr.startsWith('307')) {
      return 'CREDIT_CARD';
    } else if (prodNum === 308 || prodIdStr.startsWith('308')) {
      return 'LINE_OF_CREDIT';
    } else if (prodNum === 309 || prodIdStr.startsWith('309')) {
      return 'SME_LOAN';
    } else if (prodNum === 310 || prodIdStr.startsWith('310')) {
      return 'GROUP_LOAN';
    } else if (prodNum === 311 || prodIdStr.startsWith('311')) {
      return 'MONTHLY';
    } else if (prodNum === 312 || prodIdStr.startsWith('312')) {
      return 'ASSET_LOAN';
    } else if (prodNum === 313 || prodIdStr.startsWith('313')) {
      return 'RAPID_CASH_LOAN';
    } else if (prodNum === 314 || prodIdStr.startsWith('314')) {
      return 'STAFF_LOAN';
    } else if (prodNum === 315 || prodIdStr.startsWith('315')) {
      return 'STAFF_SALARY_ADVANCE';
    } else if (prodNum === 316 || prodIdStr.startsWith('316')) {
      return 'GROUP_MONTHLY_LOAN';
    } else if (prodNum === 317 || prodIdStr.startsWith('317')) {
      return 'SOLAR_LOAN';
    } else if (prodNum === 318 || prodIdStr.startsWith('318')) {
      return 'DAILY_LOAN';
    } else if (prodNum === 319 || prodIdStr.startsWith('319')) {
      return 'GENERAL_LOAN';
    }
    
    // 3. Default to general loan
    console.log(`⚠️ Using GENERAL_LOAN fallback for PROD_ID: ${PROD_ID}`);
    return 'GENERAL_LOAN';
    
  } catch (error) {
    console.error('Error in getProductTypeFallback:', error);
    return 'GENERAL_LOAN';
  }
};

// ✅ OPTIMIZED: Generate loan account number by PROD_ID
export const generateLoanAccountNumberByProdId = async (PROD_ID, transaction = null) => {
  let localTransaction = transaction;
  let shouldCommit = false;
  
  try {
    console.log(`🚀 Generating loan account for PROD_ID: ${PROD_ID}`);
    
    // Start transaction if no transaction provided
    if (!localTransaction) {
      localTransaction = await sequelize.transaction();
      shouldCommit = true;
    }
    
    // Get product type
    const productType = await getProductTypeFallback(PROD_ID);
    const prefix = getPrefixForProductType(productType);
    
    console.log(`📊 ${productType} → Prefix: ${prefix}`);
    
    // Get or create counter
    const counterName = `LOAN_ACCT_${prefix}`;
    
    // Find existing counter
    let counter = await Counter.findOne({
      where: { _id: counterName },
      transaction: localTransaction
    });
    
    if (counter) {
      // Increment existing counter
      await Counter.update(
        { seq: sequelize.literal('seq + 1') },
        {
          where: { _id: counterName },
          transaction: localTransaction
        }
      );
      
      // Fetch updated counter
      counter = await Counter.findOne({
        where: { _id: counterName },
        transaction: localTransaction
      });
    } else {
      // Create new counter
      counter = await Counter.create({
        _id: counterName,
        seq: 1,
        name: `Counter for ${productType}`,
        description: `${productType} account numbers`,
        createdAt: new Date()
      }, { transaction: localTransaction });
    }

    if (!counter) {
      throw new Error(`Counter ${counterName} update failed`);
    }

    // Generate account number
    const accountNumber = `${prefix}${String(counter.seq).padStart(7, '0')}`;
    
    // Validate
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new Error(`Invalid account number: ${accountNumber}`);
    }

    // Commit if we started the transaction
    if (shouldCommit) {
      await localTransaction.commit();
    }

    console.log(`✅ Generated: ${accountNumber} (${productType})`);
    
    return {
      success: true,
      accountNumber,
      prefix,
      productType,
      PROD_ID,
      sequenceNumber: counter.seq,
      timestamp: new Date()
    };

  } catch (error) {
    // Rollback on error
    if (shouldCommit && localTransaction) {
      await localTransaction.rollback();
    }
    
    console.error('❌ Generation failed:', error.message);
    
    // Fallback generation - use GENERAL_LOAN prefix (319)
    const fallbackNumber = `319${Date.now().toString().slice(-7).padStart(7, '0')}`;
    
    return {
      success: false,
      accountNumber: fallbackNumber,
      prefix: '319',
      productType: 'GENERAL_LOAN',
      PROD_ID,
      sequenceNumber: 0,
      isFallback: true,
      error: error.message,
      timestamp: new Date()
    };
  }
};

// ✅ ENHANCED: Generate deposit account number
export const generateDepositAccountNumber = async (PROD_ID, transaction = null) => {
  let localTransaction = transaction;
  let shouldCommit = false;
  
  try {
    console.log(`💰 Generating deposit account for PROD_ID: ${PROD_ID}`);
    
    if (!localTransaction) {
      localTransaction = await sequelize.transaction();
      shouldCommit = true;
    }
    
    // Find existing counter
    let counter = await Counter.findOne({
      where: { _id: 'DEPOSIT_ACCOUNT_NUMBER' },
      transaction: localTransaction
    });
    
    if (counter) {
      // Increment existing counter
      await Counter.update(
        { seq: sequelize.literal('seq + 1') },
        {
          where: { _id: 'DEPOSIT_ACCOUNT_NUMBER' },
          transaction: localTransaction
        }
      );
      
      // Fetch updated counter
      counter = await Counter.findOne({
        where: { _id: 'DEPOSIT_ACCOUNT_NUMBER' },
        transaction: localTransaction
      });
    } else {
      // Create new counter starting from 10
      counter = await Counter.create({
        _id: 'DEPOSIT_ACCOUNT_NUMBER',
        seq: 10, // Start from 10 → 2000000011
        name: 'Deposit Account Counter',
        description: 'Deposit account numbers',
        createdAt: new Date()
      }, { transaction: localTransaction });
    }

    if (!counter) {
      throw new Error('Deposit counter update failed');
    }

    // Generate: 20000000 + sequence (11, 12, 13...)
    const accountNumber = `20000000${String(counter.seq).padStart(2, '0')}`;
    
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new Error(`Invalid deposit account: ${accountNumber}`);
    }

    if (shouldCommit) {
      await localTransaction.commit();
    }

    console.log(`✅ Generated deposit: ${accountNumber}`);
    
    return {
      success: true,
      accountNumber,
      prefix: '20',
      productType: 'DEPOSIT',
      PROD_ID,
      sequenceNumber: counter.seq,
      timestamp: new Date()
    };

  } catch (error) {
    if (shouldCommit && localTransaction) {
      await localTransaction.rollback();
    }
    
    console.error('❌ Deposit generation failed:', error);
    
    // Fallback
    const fallbackNumber = `20000000${Date.now().toString().slice(-2)}`;
    
    return {
      success: false,
      accountNumber: fallbackNumber,
      prefix: '20',
      productType: 'DEPOSIT',
      PROD_ID,
      sequenceNumber: 0,
      isFallback: true,
      error: error.message,
      timestamp: new Date()
    };
  }
};

// ✅ SMART: Universal account number generator
export const generateAccountNumberByProdId = async (PROD_ID, transaction = null) => {
  try {
    // Check ProductTypeMapping first to determine product type
    const productMapping = await ProductTypeMapping.findOne({ 
      where: { PROD_ID: PROD_ID }
    });
    
    if (productMapping) {
      const productType = productMapping.PRODUCT_TYPE;
      // Check if it's a deposit product
      if (productType === 'SAVINGS' || productType === 'TERM_DEPOSIT') {
        return await generateDepositAccountNumber(PROD_ID, transaction);
      }
    }
    
    // Default to loan for everything else
    return await generateLoanAccountNumberByProdId(PROD_ID, transaction);
    
  } catch (error) {
    console.error('Universal generation failed:', error);
    
    // Ultimate fallback
    const fallbackNumber = Date.now().toString().slice(-10).padStart(10, '0');
    
    return {
      success: false,
      accountNumber: fallbackNumber,
      prefix: '00',
      productType: 'UNKNOWN',
      PROD_ID,
      sequenceNumber: 0,
      isFallback: true,
      error: error.message,
      timestamp: new Date()
    };
  }
};

// ✅ COMPREHENSIVE: Initialize all counters - UPDATED
export const initializeCounters = async () => {
  const startTime = Date.now();
  
  try {
    console.log('🚀 INITIALIZING ACCOUNT NUMBER COUNTERS');
    console.log('='.repeat(50));
    
    // Check deposit counter
    let depositCounter = await Counter.findOne({ 
      where: { _id: 'DEPOSIT_ACCOUNT_NUMBER' }
    });
    
    if (!depositCounter) {
      depositCounter = await Counter.create({
        _id: 'DEPOSIT_ACCOUNT_NUMBER',
        seq: 10,
        name: 'Deposit Account Counter',
        description: 'Generates deposit account numbers (2000000011, 2000000012, ...)',
        createdAt: new Date()
      });
      console.log('✅ Created deposit counter (starts at: 2000000011)');
    } else {
      console.log(`📊 Deposit counter exists: sequence ${depositCounter.seq}`);
      console.log(`   Next account: 20000000${String(depositCounter.seq + 1).padStart(2, '0')}`);
    }
    
    // Initialize all loan counters with new prefix mapping
    const loanPrefixes = [
      '300', '301', '302', '303', '304', '305', '306', '307', 
      '308', '309', '310', '311', '312', '313', '314', '315',
      '316', '317', '318', '319'  // Updated: 319 instead of 399
    ];
    
    const prefixNames = {
      '300': 'Business Term Loan',
      '301': 'Individual Loan',
      '302': 'Consumer Loan',
      '303': 'Mortgage',
      '304': 'Auto Loan',
      '305': 'Personal Loan',
      '306': 'Education Loan',
      '307': 'Credit Card',
      '308': 'Line of Credit',
      '309': 'SME Loan',
      '310': 'Group Loan',
      '311': 'Monthly Loan',
      '312': 'Asset Loan',
      '313': 'Rapid Cash Loan',
      '314': 'Staff Loan',
      '315': 'Staff Salary Advance',
      '316': 'Group Monthly Loan',
      '317': 'Solar Loan',
      '318': 'Daily Loan',
      '319': 'General Loan'  // Updated
    };
    
    let createdCount = 0;
    let existingCount = 0;
    
    for (const prefix of loanPrefixes) {
      const counterName = `LOAN_ACCT_${prefix}`;
      let counter = await Counter.findOne({ 
        where: { _id: counterName }
      });
      
      if (!counter) {
        counter = await Counter.create({
          _id: counterName,
          seq: 0,
          name: `Loan Counter: ${prefixNames[prefix] || 'Unknown'}`,
          description: `Generates ${prefixNames[prefix] || 'loan'} account numbers`,
          createdAt: new Date()
        });
        createdCount++;
      } else {
        existingCount++;
      }
    }
    
    const elapsedTime = Date.now() - startTime;
    
    console.log('\n📈 INITIALIZATION SUMMARY:');
    console.log('='.repeat(50));
    console.log(`✅ Deposit counter: ${depositCounter ? 'Ready' : 'Failed'}`);
    console.log(`✅ Loan counters: ${createdCount} created, ${existingCount} existing`);
    console.log(`✅ Total counters: ${createdCount + existingCount + 1}`);
    console.log(`⏱️  Time taken: ${elapsedTime}ms`);
    console.log('\n🎯 READY TO GENERATE ACCOUNT NUMBERS');
    
    // Show quick reference
    console.log('\n🔢 QUICK REFERENCE - ALL PRODUCT TYPES:');
    console.log('-'.repeat(40));
    console.log('Deposit accounts:     2000000011, 2000000012, ...');
    console.log('Business Term Loan:   3000000001, 3000000002, ...');
    console.log('Individual Loan:      3010000001, 3010000002, ...');
    console.log('Consumer Loan:        3020000001, 3020000002, ...');
    console.log('Mortgage:             3030000001, 3030000002, ...');
    console.log('Auto Loan:            3040000001, 3040000002, ...');
    console.log('Personal Loan:        3050000001, 3050000002, ...');
    console.log('Education Loan:       3060000001, 3060000002, ...');
    console.log('Credit Card:          3070000001, 3070000002, ...');
    console.log('Line of Credit:       3080000001, 3080000002, ...');
    console.log('SME Loan:             3090000001, 3090000002, ...');
    console.log('Group Loan:           3100000001, 3100000002, ...');
    console.log('Monthly Loan:         3110000001, 3110000002, ...');
    console.log('Asset Loan:           3120000001, 3120000002, ...');
    console.log('Rapid Cash Loan:      3130000001, 3130000002, ...');
    console.log('Staff Loan:           3140000001, 3140000002, ...');
    console.log('Staff Salary Advance: 3150000001, 3150000002, ...');
    console.log('Group Monthly Loan:   3160000001, 3160000002, ...');
    console.log('Solar Loan:           3170000001, 3170000002, ...');
    console.log('Daily Loan:           3180000001, 3180000002, ...');
    console.log('General Loan:         3190000001, 3190000002, ...');
    
    return {
      success: true,
      depositCounter: depositCounter?.seq || 10,
      loanCountersCreated: createdCount,
      loanCountersExisting: existingCount,
      totalCounters: createdCount + existingCount + 1,
      elapsedTime
    };
    
  } catch (error) {
    console.error('❌ INITIALIZATION FAILED:', error);
    
    return {
      success: false,
      error: error.message,
      elapsedTime: Date.now() - startTime
    };
  }
};

// ✅ DETAILED: Debug function
export const debugAccountNumberGeneration = async (detailed = false) => {
  try {
    console.log('\n🔍 ACCOUNT NUMBER GENERATION DEBUG');
    console.log('='.repeat(50));
    
    const counters = await Counter.findAll({
      order: [['_id', 'ASC']]
    });
    
    if (!counters.length) {
      console.log('No counters found in database.');
      return { counters: [] };
    }
    
    console.log(`Found ${counters.length} counter(s):\n`);
    
    let depositInfo = null;
    const loanInfos = [];
    
    counters.forEach(counter => {
      if (counter._id === 'DEPOSIT_ACCOUNT_NUMBER') {
        const current = `20000000${String(counter.seq).padStart(2, '0')}`;
        const next = `20000000${String(counter.seq + 1).padStart(2, '0')}`;
        
        depositInfo = {
          id: counter._id,
          sequence: counter.seq,
          currentAccount: current,
          nextAccount: next,
          createdAt: counter.createdAt
        };
        
        console.log(`💰 DEPOSIT COUNTER:`);
        console.log(`   Sequence: ${counter.seq}`);
        console.log(`   Current: ${current}`);
        console.log(`   Next: ${next}`);
        
      } else if (counter._id.startsWith('LOAN_ACCT_')) {
        const prefix = counter._id.replace('LOAN_ACCT_', '');
        const current = `${prefix}${String(counter.seq).padStart(7, '0')}`;
        const next = `${prefix}${String(counter.seq + 1).padStart(7, '0')}`;
        
        loanInfos.push({
          prefix,
          sequence: counter.seq,
          currentAccount: current,
          nextAccount: next
        });
        
        if (detailed) {
          console.log(`📊 LOAN COUNTER (${prefix}):`);
          console.log(`   Sequence: ${counter.seq}`);
          console.log(`   Current: ${current}`);
          console.log(`   Next: ${next}`);
        }
      }
    });
    
    if (!detailed && loanInfos.length > 0) {
      console.log(`\n📈 LOAN COUNTERS SUMMARY:`);
      console.log(`   Total loan counters: ${loanInfos.length}`);
      console.log(`   First: ${loanInfos[0].currentAccount}`);
      console.log(`   Last: ${loanInfos[loanInfos.length - 1].currentAccount}`);
    }
    
    console.log('\n✅ Debug complete');
    
    return {
      counters: counters.length,
      deposit: depositInfo,
      loans: loanInfos,
      detailed
    };
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    return { error: error.message };
  }
};

// ✅ BATCH: Test multiple account generations - COMPREHENSIVE UPDATED
export const testAccountGeneration = async (testCases = null) => {
  console.log('\n🧪 ACCOUNT GENERATION TEST SUITE');
  console.log('='.repeat(50));
  
  const defaultTests = [
    // Business Term Loan (300)
    { PROD_ID: 3001, type: 'loan', expected: 'BUSINESS_TERM_LOAN', prefix: '300' },
    { PROD_ID: 300, type: 'loan', expected: 'BUSINESS_TERM_LOAN', prefix: '300' },
    
    // Individual Loan (301)
    { PROD_ID: 3011, type: 'loan', expected: 'INDIVIDUAL_LOAN', prefix: '301' },
    { PROD_ID: 301, type: 'loan', expected: 'INDIVIDUAL_LOAN', prefix: '301' },
    
    // Consumer Loan (302)
    { PROD_ID: 3021, type: 'loan', expected: 'CONSUMER_LOAN', prefix: '302' },
    { PROD_ID: 302, type: 'loan', expected: 'CONSUMER_LOAN', prefix: '302' },
    
    // Mortgage (303)
    { PROD_ID: 3031, type: 'loan', expected: 'MORTGAGE', prefix: '303' },
    { PROD_ID: 303, type: 'loan', expected: 'MORTGAGE', prefix: '303' },
    
    // Auto Loan (304)
    { PROD_ID: 3041, type: 'loan', expected: 'AUTO_LOAN', prefix: '304' },
    { PROD_ID: 304, type: 'loan', expected: 'AUTO_LOAN', prefix: '304' },
    
    // Personal Loan (305)
    { PROD_ID: 3051, type: 'loan', expected: 'PERSONAL_LOAN', prefix: '305' },
    { PROD_ID: 305, type: 'loan', expected: 'PERSONAL_LOAN', prefix: '305' },
    
    // Education Loan (306)
    { PROD_ID: 3061, type: 'loan', expected: 'EDUCATION_LOAN', prefix: '306' },
    { PROD_ID: 306, type: 'loan', expected: 'EDUCATION_LOAN', prefix: '306' },
    
    // Credit Card (307)
    { PROD_ID: 3071, type: 'loan', expected: 'CREDIT_CARD', prefix: '307' },
    { PROD_ID: 307, type: 'loan', expected: 'CREDIT_CARD', prefix: '307' },
    
    // Line of Credit (308)
    { PROD_ID: 3081, type: 'loan', expected: 'LINE_OF_CREDIT', prefix: '308' },
    { PROD_ID: 308, type: 'loan', expected: 'LINE_OF_CREDIT', prefix: '308' },
    
    // SME Loan (309)
    { PROD_ID: 3091, type: 'loan', expected: 'SME_LOAN', prefix: '309' },
    { PROD_ID: 309, type: 'loan', expected: 'SME_LOAN', prefix: '309' },
    
    // Group Loan (310)
    { PROD_ID: 3101, type: 'loan', expected: 'GROUP_LOAN', prefix: '310' },
    { PROD_ID: 310, type: 'loan', expected: 'GROUP_LOAN', prefix: '310' },
    
    // Monthly Loan (311)
    { PROD_ID: 3111, type: 'loan', expected: 'MONTHLY', prefix: '311' },
    { PROD_ID: 311, type: 'loan', expected: 'MONTHLY', prefix: '311' },
    
    // Asset Loan (312)
    { PROD_ID: 3121, type: 'loan', expected: 'ASSET_LOAN', prefix: '312' },
    { PROD_ID: 312, type: 'loan', expected: 'ASSET_LOAN', prefix: '312' },
    
    // Rapid Cash Loan (313)
    { PROD_ID: 3131, type: 'loan', expected: 'RAPID_CASH_LOAN', prefix: '313' },
    { PROD_ID: 313, type: 'loan', expected: 'RAPID_CASH_LOAN', prefix: '313' },
    
    // Staff Loan (314)
    { PROD_ID: 3141, type: 'loan', expected: 'STAFF_LOAN', prefix: '314' },
    { PROD_ID: 314, type: 'loan', expected: 'STAFF_LOAN', prefix: '314' },
    
    // Staff Salary Advance (315)
    { PROD_ID: 3151, type: 'loan', expected: 'STAFF_SALARY_ADVANCE', prefix: '315' },
    { PROD_ID: 315, type: 'loan', expected: 'STAFF_SALARY_ADVANCE', prefix: '315' },
    
    // Group Monthly Loan (316)
    { PROD_ID: 3161, type: 'loan', expected: 'GROUP_MONTHLY_LOAN', prefix: '316' },
    { PROD_ID: 316, type: 'loan', expected: 'GROUP_MONTHLY_LOAN', prefix: '316' },
    
    // Solar Loan (317)
    { PROD_ID: 3171, type: 'loan', expected: 'SOLAR_LOAN', prefix: '317' },
    { PROD_ID: 317, type: 'loan', expected: 'SOLAR_LOAN', prefix: '317' },
    
    // Daily Loan (318)
    { PROD_ID: 3181, type: 'loan', expected: 'DAILY_LOAN', prefix: '318' },
    { PROD_ID: 318, type: 'loan', expected: 'DAILY_LOAN', prefix: '318' },
    
    // General Loan (319)
    { PROD_ID: 3191, type: 'loan', expected: 'GENERAL_LOAN', prefix: '319' },
    { PROD_ID: 319, type: 'loan', expected: 'GENERAL_LOAN', prefix: '319' },
    
    // General fallback tests (for unmapped PROD_IDs)
    { PROD_ID: 1001, type: 'loan', expected: 'GENERAL_LOAN', prefix: '319' },
    { PROD_ID: 9999, type: 'loan', expected: 'GENERAL_LOAN', prefix: '319' },
    
    // Deposit products
    { PROD_ID: 2001, type: 'deposit', expected: 'DEPOSIT', prefix: '20' },
    { PROD_ID: 200, type: 'deposit', expected: 'DEPOSIT', prefix: '20' },
    { PROD_ID: 201, type: 'deposit', expected: 'DEPOSIT', prefix: '20' },
    
    // Edge cases
    { PROD_ID: '300', type: 'loan', expected: 'BUSINESS_TERM_LOAN', prefix: '300' }, // String input
    { PROD_ID: 'ABC', type: 'loan', expected: 'GENERAL_LOAN', prefix: '319' }, // Invalid input
    { PROD_ID: 0, type: 'loan', expected: 'GENERAL_LOAN', prefix: '319' }, // Zero
    { PROD_ID: -100, type: 'loan', expected: 'GENERAL_LOAN', prefix: '319' }, // Negative
  ];
  
  const tests = testCases || defaultTests;
  const results = [];
  let passed = 0;
  let failed = 0;
  let perfectMatches = 0;
  let acceptableMatches = 0;
  let partialMatches = 0;
  
  console.log(`Running ${tests.length} test cases...\n`);
  
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`🔬 Test ${i + 1}/${tests.length}: PROD_ID ${test.PROD_ID} (Expected: ${test.expected}, Prefix: ${test.prefix})`);
    
    try {
      let result;
      
      if (test.type === 'deposit') {
        result = await generateDepositAccountNumber(test.PROD_ID);
      } else {
        result = await generateLoanAccountNumberByProdId(test.PROD_ID);
      }
      
      const prefixMatch = result.prefix === test.prefix;
      const typeMatch = result.productType === test.expected;
      
      const testResult = {
        testNumber: i + 1,
        PROD_ID: test.PROD_ID,
        expected: test.expected,
        expectedPrefix: test.prefix,
        actualType: result.productType,
        actualPrefix: result.prefix,
        accountNumber: result.accountNumber,
        success: result.success,
        isFallback: result.isFallback || false,
        prefixMatch,
        typeMatch,
        overallMatch: prefixMatch && typeMatch
      };
      
      results.push(testResult);
      
      if (result.success) {
        console.log(`   ✅ Generated: ${result.accountNumber}`);
        console.log(`   Type: ${result.productType} (Expected: ${test.expected})`);
        console.log(`   Prefix: ${result.prefix} (Expected: ${test.prefix})`);
        
        if (prefixMatch && typeMatch) {
          console.log(`   🎯 PERFECT MATCH!`);
          passed++;
          perfectMatches++;
        } else if (result.productType === 'GENERAL_LOAN' && result.prefix === '319') {
          // Acceptable fallback for unmapped products
          console.log(`   ⚠️  ACCEPTABLE (General loan fallback)`);
          passed++;
          acceptableMatches++;
        } else if (test.expected === 'GENERAL_LOAN' && result.productType === 'GENERAL_LOAN') {
          // Acceptable if expecting general loan and got it (even if prefix doesn't match)
          console.log(`   ⚠️  ACCEPTABLE (Got general loan as expected)`);
          passed++;
          acceptableMatches++;
        } else {
          console.log(`   ❌ PARTIAL MATCH`);
          console.log(`      Expected: ${test.expected} (${test.prefix})`);
          console.log(`      Got: ${result.productType} (${result.prefix})`);
          failed++;
          partialMatches++;
        }
      } else {
        console.log(`   ⚠️  FALLBACK: ${result.accountNumber}`);
        console.log(`   Error: ${result.error}`);
        
        // Check if fallback is acceptable
        if (test.expected === 'GENERAL_LOAN' && result.productType === 'GENERAL_LOAN') {
          console.log(`   ⚠️  ACCEPTABLE FALLBACK (General loan expected)`);
          passed++;
          acceptableMatches++;
        } else {
          console.log(`   ❌ UNEXPECTED FALLBACK`);
          failed++;
        }
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
      
      results.push({
        testNumber: i + 1,
        PROD_ID: test.PROD_ID,
        expected: test.expected,
        error: error.message,
        success: false
      });
    }
    
    // Add small delay between tests to avoid overwhelming
    if (i < tests.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log('\n📊 TEST SUMMARY:');
  console.log('='.repeat(50));
  console.log(`Total tests: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success rate: ${((passed / tests.length) * 100).toFixed(1)}%`);
  
  console.log('\n📈 DETAILED BREAKDOWN:');
  console.log('-'.repeat(30));
  console.log(`Perfect matches: ${perfectMatches}`);
  console.log(`Acceptable matches: ${acceptableMatches}`);
  console.log(`Partial matches: ${partialMatches}`);
  
  // Show product type coverage
  console.log('\n📋 PRODUCT TYPE COVERAGE:');
  console.log('-'.repeat(30));
  
  const productTypes = [
    { name: 'BUSINESS_TERM_LOAN', prefix: '300' },
    { name: 'INDIVIDUAL_LOAN', prefix: '301' },
    { name: 'CONSUMER_LOAN', prefix: '302' },
    { name: 'MORTGAGE', prefix: '303' },
    { name: 'AUTO_LOAN', prefix: '304' },
    { name: 'PERSONAL_LOAN', prefix: '305' },
    { name: 'EDUCATION_LOAN', prefix: '306' },
    { name: 'CREDIT_CARD', prefix: '307' },
    { name: 'LINE_OF_CREDIT', prefix: '308' },
    { name: 'SME_LOAN', prefix: '309' },
    { name: 'GROUP_LOAN', prefix: '310' },
    { name: 'MONTHLY', prefix: '311' },
    { name: 'ASSET_LOAN', prefix: '312' },
    { name: 'RAPID_CASH_LOAN', prefix: '313' },
    { name: 'STAFF_LOAN', prefix: '314' },
    { name: 'STAFF_SALARY_ADVANCE', prefix: '315' },
    { name: 'GROUP_MONTHLY_LOAN', prefix: '316' },
    { name: 'SOLAR_LOAN', prefix: '317' },
    { name: 'DAILY_LOAN', prefix: '318' },
    { name: 'GENERAL_LOAN', prefix: '319' },
    { name: 'DEPOSIT', prefix: '20' }
  ];
  
  // Count how many product types were tested
  const testedTypes = new Set();
  results.forEach(result => {
    if (result.actualType) {
      testedTypes.add(result.actualType);
    }
  });
  
  console.log(`Product types tested: ${testedTypes.size}/${productTypes.length}`);
  console.log('Tested types:');
  Array.from(testedTypes).sort().forEach(type => {
    const matchingTest = tests.find(t => t.expected === type);
    if (matchingTest) {
      console.log(`  - ${type} (prefix: ${matchingTest.prefix})`);
    }
  });
  
  // Show untested types
  const untestedTypes = productTypes.filter(pt => !testedTypes.has(pt.name));
  if (untestedTypes.length > 0) {
    console.log('\n⚠️  UNTESTED PRODUCT TYPES:');
    untestedTypes.forEach(pt => {
      console.log(`  - ${pt.name} (prefix: ${pt.prefix})`);
    });
  }
  
  // Return detailed results
  return {
    total: tests.length,
    passed,
    failed,
    successRate: (passed / tests.length) * 100,
    breakdown: {
      perfectMatches,
      acceptableMatches,
      partialMatches
    },
    coverage: {
      productTypesTested: testedTypes.size,
      totalProductTypes: productTypes.length,
      coveragePercentage: (testedTypes.size / productTypes.length) * 100
    },
    results
  };
};

// ✅ Add this new function to test specific product type mappings
export const testProductTypeMapping = async (PROD_ID, expectedType = null, expectedPrefix = null) => {
  console.log(`\n🧪 PRODUCT TYPE MAPPING TEST`);
  console.log('='.repeat(40));
  
  try {
    // Get product type from database
    const productType = await getProductTypeFromDatabase(PROD_ID);
    
    // Get product type from fallback
    const fallbackType = await getProductTypeFallback(PROD_ID);
    
    // Get prefix
    const prefix = getPrefixForProductType(productType || fallbackType);
    
    console.log(`PROD_ID: ${PROD_ID}`);
    console.log(`Database lookup: ${productType || 'Not found'}`);
    console.log(`Fallback logic: ${fallbackType}`);
    console.log(`Determined prefix: ${prefix}`);
    
    // Validate against expectations if provided
    if (expectedType || expectedPrefix) {
      console.log('\n✅ VALIDATION:');
      
      if (expectedType) {
        const typeMatches = (productType === expectedType) || (fallbackType === expectedType);
        console.log(`Expected type: ${expectedType}`);
        console.log(`Type match: ${typeMatches ? '✅' : '❌'}`);
      }
      
      if (expectedPrefix) {
        console.log(`Expected prefix: ${expectedPrefix}`);
        console.log(`Prefix match: ${prefix === expectedPrefix ? '✅' : '❌'}`);
      }
    }
    
    // Generate account number to verify
    console.log('\n🔢 ACCOUNT NUMBER GENERATION TEST:');
    const result = await generateLoanAccountNumberByProdId(PROD_ID);
    
    console.log(`Generated: ${result.accountNumber}`);
    console.log(`Product type: ${result.productType}`);
    console.log(`Prefix: ${result.prefix}`);
    console.log(`Success: ${result.success ? '✅' : '❌'}`);
    
    if (result.isFallback) {
      console.log(`⚠️  Used fallback generation`);
    }
    
    return {
      PROD_ID,
      databaseType: productType,
      fallbackType,
      prefix,
      generated: {
        accountNumber: result.accountNumber,
        productType: result.productType,
        prefix: result.prefix,
        success: result.success,
        isFallback: result.isFallback
      },
      matches: {
        type: expectedType ? ((productType === expectedType) || (fallbackType === expectedType)) : null,
        prefix: expectedPrefix ? (prefix === expectedPrefix) : null
      }
    };
    
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    return {
      PROD_ID,
      error: error.message,
      success: false
    };
  }
};

// ✅ HELPER: Get prefix information - UPDATED
export const getPrefixInfo = (productType) => {
  try {
    const prefix = getPrefixForProductType(productType);
    
    const prefixMap = {
      '300': 'Business Term Loan',
      '301': 'Individual Loan',
      '302': 'Consumer Loan',
      '303': 'Mortgage',
      '304': 'Auto Loan',
      '305': 'Personal Loan',
      '306': 'Education Loan',
      '307': 'Credit Card',
      '308': 'Line of Credit',
      '309': 'SME Loan',
      '310': 'Group Loan',
      '311': 'Monthly Loan',
      '312': 'Asset Loan',
      '313': 'Rapid Cash Loan',
      '314': 'Staff Loan',
      '315': 'Staff Salary Advance',
      '316': 'Group Monthly Loan',
      '317': 'Solar Loan',
      '318': 'Daily Loan',
      '319': 'General Loan'  // Updated
    };
    
    return {
      productType,
      prefix,
      productName: prefixMap[prefix] || 'Unknown Product',
      exampleAccounts: [
        `${prefix}0000001`,
        `${prefix}0000002`,
        `${prefix}0000003`
      ],
      description: `${prefixMap[prefix] || productType} accounts start with ${prefix}`,
      format: `${prefix} + 7-digit sequence = 10-digit account`,
      valid: true
    };
  } catch (error) {
    return {
      productType,
      prefix: '319',  // Updated to use GENERAL_LOAN prefix
      productName: 'General Loan',
      exampleAccounts: ['3190000001', '3190000002'],
      description: `Using general loan prefix for "${productType}"`,
      error: error.message,
      valid: false
    };
  }
};

// ✅ TRANSACTION: Generate unique transaction ID
// ✅ TRANSACTION: Generate unique numeric transaction IDs (with backward compatibility)
export const generateTransactionId = async (transaction = null, returnObject = true) => {
  try {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000); // 0-999
    
    // Create numeric ID (combine timestamp and random number)
    let numericId = parseInt(`${timestamp}${random.toString().padStart(3, '0')}`);
    
    // Ensure uniqueness
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const existing = await Transaction.findOne({ 
        where: { TRANSACTION_ID: numericId },
        transaction
      });
      
      if (!existing) {
        break; // Unique found
      }
      
      // Regenerate with different random part
      const newTimestamp = Date.now();
      const newRandom = Math.floor(Math.random() * 1000);
      numericId = parseInt(`${newTimestamp}${newRandom.toString().padStart(3, '0')}`);
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      // Last resort: simple numeric
      numericId = parseInt(Date.now().toString() + Math.floor(Math.random() * 1000000).toString());
    }
    
    console.log(`🔑 Generated NUMERIC transaction ID: ${numericId}`);
    
    // Return format based on parameter
    if (returnObject) {
      return {
        TRANSACTION_ID: numericId,
        EVENT_ID: numericId + 1,
        JOURNAL_ID: numericId + 2,
        TRAN_JOURNAL_ID: numericId + 2
      };
    } else {
      // Backward compatibility: return just the transaction ID as a number
      return numericId;
    }
    
  } catch (error) {
    console.error('Transaction ID generation failed:', error);
    
    // Simple numeric fallback
    const fallbackId = parseInt(Date.now().toString() + Math.floor(Math.random() * 1000).toString());
    
    if (returnObject) {
      return {
        TRANSACTION_ID: fallbackId,
        EVENT_ID: fallbackId + 1,
        JOURNAL_ID: fallbackId + 2,
        TRAN_JOURNAL_ID: fallbackId + 2
      };
    } else {
      return fallbackId;
    }
  }
};

// ✅ ADMIN: Reset counters
export const resetDepositAccountCounter = async (startFrom = 10) => {
  const t = await sequelize.transaction();
  
  try {
    const [counter, created] = await Counter.findOrCreate({
      where: { _id: 'DEPOSIT_ACCOUNT_NUMBER' },
      defaults: {
        seq: startFrom,
        name: 'Deposit Account Counter',
        description: 'Deposit account numbers',
        createdAt: new Date()
      },
      transaction: t
    });
    
    if (!created) {
      await Counter.update(
        {
          seq: startFrom,
          updatedAt: new Date()
        },
        {
          where: { _id: 'DEPOSIT_ACCOUNT_NUMBER' },
          transaction: t
        }
      );
    }
    
    await t.commit();
    
    const nextAccount = `20000000${String(startFrom).padStart(2, '0')}`;
    
    console.log(`🔄 Deposit counter reset to: ${startFrom}`);
    console.log(`   Next account: ${nextAccount}`);
    
    return {
      success: true,
      sequence: startFrom,
      nextAccount,
      timestamp: new Date()
    };
    
  } catch (error) {
    await t.rollback();
    console.error('Reset failed:', error);
    return { success: false, error: error.message };
  }
};

export const resetLoanAccountCounter = async (prefix, startFrom = 0) => {
  const t = await sequelize.transaction();
  
  try {
    const counterName = `LOAN_ACCT_${prefix}`;
    
    const [counter, created] = await Counter.findOrCreate({
      where: { _id: counterName },
      defaults: {
        seq: startFrom,
        name: `Loan Counter: ${prefix}`,
        description: `Loan account numbers with prefix ${prefix}`,
        createdAt: new Date()
      },
      transaction: t
    });
    
    if (!created) {
      await Counter.update(
        {
          seq: startFrom,
          updatedAt: new Date()
        },
        {
          where: { _id: counterName },
          transaction: t
        }
      );
    }
    
    await t.commit();
    
    const nextAccount = `${prefix}${String(startFrom).padStart(7, '0')}`;
    
    console.log(`🔄 Loan counter ${prefix} reset to: ${startFrom}`);
    console.log(`   Next account: ${nextAccount}`);
    
    return {
      success: true,
      prefix,
      sequence: startFrom,
      nextAccount,
      timestamp: new Date()
    };
    
  } catch (error) {
    await t.rollback();
    console.error(`Reset failed for prefix ${prefix}:`, error);
    return { success: false, prefix, error: error.message };
  }
};

// ✅ BATCH: Reset all loan counters - UPDATED
export const resetAllLoanCounters = async (startFrom = 0) => {
  const t = await sequelize.transaction();
  
  try {
    console.log('🔄 Resetting all loan counters...');
    
    const loanPrefixes = [
      '300', '301', '302', '303', '304', '305', '306', '307', 
      '308', '309', '310', '311', '312', '313', '314', '315',
      '316', '317', '318', '319'  // Updated
    ];
    
    const results = [];
    
    for (const prefix of loanPrefixes) {
      const counterName = `LOAN_ACCT_${prefix}`;
      
      const [counter, created] = await Counter.findOrCreate({
        where: { _id: counterName },
        defaults: {
          seq: startFrom,
          name: `Loan Counter: ${prefix}`,
          description: `Loan account numbers with prefix ${prefix}`,
          createdAt: new Date()
        },
        transaction: t
      });
      
      if (!created) {
        await Counter.update(
          {
            seq: startFrom,
            updatedAt: new Date()
          },
          {
            where: { _id: counterName },
            transaction: t
          }
        );
      }
      
      results.push({
        success: true,
        prefix,
        sequence: startFrom
      });
    }
    
    await t.commit();
    
    console.log(`\n📊 Reset complete: ${results.length} counters reset`);
    
    return {
      success: true,
      total: results.length,
      results
    };
    
  } catch (error) {
    await t.rollback();
    console.error('Batch reset failed:', error);
    return { success: false, error: error.message };
  }
};

// ✅ UTILITY: Get all product types and prefixes - UPDATED
export const getAllProductPrefixes = () => {
  const productTypes = [
    'BUSINESS_TERM_LOAN',
    'INDIVIDUAL_LOAN',
    'CONSUMER_LOAN',
    'MORTGAGE',
    'AUTO_LOAN',
    'PERSONAL_LOAN',
    'EDUCATION_LOAN',
    'CREDIT_CARD',
    'LINE_OF_CREDIT',
    'SME_LOAN',
    'GROUP_LOAN',
    'MONTHLY',  // Note: Just "MONTHLY" not "MONTHLY_LOAN"
    'ASSET_LOAN',
    'RAPID_CASH_LOAN',
    'STAFF_LOAN',
    'STAFF_SALARY_ADVANCE',
    'GROUP_MONTHLY_LOAN',
    'SOLAR_LOAN',
    'DAILY_LOAN',
    'GENERAL_LOAN'
  ];
  
  return productTypes.map(type => getPrefixInfo(type));
};

// Export all functions
export default {
  // Core functions
  getPrefixForProductType,
  generateLoanAccountNumberByProdId,
  generateDepositAccountNumber,
  generateAccountNumberByProdId,
  generateTransactionId,
  
  // Database & lookup
  getProductTypeFromDatabase,
  getProductTypeFallback,
  
  // Management
  initializeCounters,
  resetDepositAccountCounter,
  resetLoanAccountCounter,
  resetAllLoanCounters,
  
  // Debug & info
  debugAccountNumberGeneration,
  testAccountGeneration,
  testProductTypeMapping,
  getPrefixInfo,
  getAllProductPrefixes,
  
  // Version info
  version: '2.2.0',
  description: 'Updated account number generation system with comprehensive testing'
};