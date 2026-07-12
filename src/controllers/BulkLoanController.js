// controllers/bulkLoanController.js
// Full implementation for bulk individual loan disbursement + repayment
// Supports >50 customers, automatic prepaid installment recording, batching, concurrency
// INCLUDES: Loan provision (1% of disbursed amount) with GL posting

import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import xlsx from 'xlsx';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';
import pLimit from 'p-limit';
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';

// ========== DIRECT MODEL IMPORTS ==========
import LoanProduct from '../models/LoanProduct.js';
import LoanInterestRate from '../models/LoanInterestRate.js';
import LoanPortfolio from '../models/LoanPortfolio.js';
import LoanAccount from '../models/LoanAccount.js';          // ✅ ADDED for provision
import AuditTrail from '../models/AuditTrail.js';
import Customer from '../models/Customer.js';
import { ProcessingSummary } from '../models/Collection.js';
import Collection from '../models/Collection.js';
import Group from '../models/Group.js';
import LoanRepaymentHistory from '../models/LoanRepaymentHistory.js';
import LoanProvision from '../models/LoanProvision.js';

// ✅ Import loan provision helper
import { createLoanProvision } from '../utils/provisionHelper.js';

// ========== DIAGNOSTIC: Check imports ==========
console.log('\n=== DIAGNOSTIC: Checking imports ===');
console.log('LoanProduct:', typeof LoanProduct, LoanProduct ? '✅' : '❌');
console.log('LoanAccount:', typeof LoanAccount, LoanAccount ? '✅' : '❌');
console.log('AuditTrail:', typeof AuditTrail, AuditTrail ? '✅' : '❌');
console.log('Customer:', typeof Customer, Customer ? '✅' : '❌');
console.log('ProcessingSummary:', typeof ProcessingSummary, ProcessingSummary ? '✅' : '❌');
console.log('Collection:', typeof Collection, Collection ? '✅' : '❌');
console.log('================================\n');

// ========== CONFIGURATION ==========
const BATCH_SIZE = 100;
const CONCURRENT_BATCHES = 5;
const UPLOAD_DIR = 'uploads/bulk-loans';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    cb(null, `bulk-${timestamp}-${random}${path.extname(file.originalname)}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedMimes = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];
    if (['.xlsx', '.xls', '.csv'].includes(ext) && allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Use .xlsx, .xls, or .csv'));
    }
  }
});

// ========== HELPER FUNCTIONS ==========
const safeNumber = (val) => {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
};

const generateEventId = () => {
  const ts = Date.now() % 1000000000;
  const rand = Math.floor(Math.random() * 10000);
  let id = ts * 10000 + rand;
  while (id > 2147483647) id = Math.floor(id / 10);
  return id;
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress;
};

// Generate transaction identifiers
const generateTransactionId = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  const base = Math.floor(timestamp / 1000);
  return {
    transactionIdentifier: base + random,
    eventId: base + random + 1000000,
    journalId: base + random + 2000000,
    reference: `REF_BULK_${timestamp}_${random}`
  };
};

// Calculate due date based on payment frequency
const calculateDueDate = (startDate, installmentNumber, paymentFrequency) => {
  const due = new Date(startDate);
  switch (paymentFrequency.toUpperCase()) {
    case 'DAILY': due.setDate(startDate.getDate() + installmentNumber); break;
    case 'WEEKLY': due.setDate(startDate.getDate() + installmentNumber * 7); break;
    case 'BIWEEKLY': due.setDate(startDate.getDate() + installmentNumber * 14); break;
    case 'MONTHLY': due.setMonth(startDate.getMonth() + installmentNumber); break;
    case 'QUARTERLY': due.setMonth(startDate.getMonth() + installmentNumber * 3); break;
    default: due.setMonth(startDate.getMonth() + installmentNumber);
  }
  return due;
};

// Flat rate EMI calculation
const calculateFlatRateEMI = (principal, flatRatePercent, termMonths, paymentFrequency = 'MONTHLY') => {
  const totalInterest = principal * (flatRatePercent / 100) * termMonths;
  const totalRepayment = principal + totalInterest;
  let numberOfInstallments = termMonths;
  switch (paymentFrequency.toUpperCase()) {
    case 'DAILY': numberOfInstallments = termMonths * 30; break;
    case 'WEEKLY': numberOfInstallments = termMonths * 4; break;
    case 'BIWEEKLY': numberOfInstallments = termMonths * 2; break;
    case 'QUARTERLY': numberOfInstallments = Math.ceil(termMonths / 3); break;
    default: numberOfInstallments = termMonths;
  }
  const emi = totalRepayment / numberOfInstallments;
  return {
    principal,
    flatRatePercent,
    termMonths,
    totalInterest: parseFloat(totalInterest.toFixed(2)),
    totalRepayment: parseFloat(totalRepayment.toFixed(2)),
    emi: parseFloat(emi.toFixed(2)),
    numberOfInstallments,
    paymentFrequency,
    perInstallmentPrincipal: parseFloat((principal / numberOfInstallments).toFixed(2)),
    perInstallmentInterest: parseFloat((totalInterest / numberOfInstallments).toFixed(2))
  };
};

// Generate unique loan account number - uses raw SQL with correct column names
const generateUniqueAccountNumber = async (prodId, transaction) => {
  let attempts = 0;
  while (attempts < 10) {
    let accNo = await generateLoanAccountNumberByProdId(prodId);
    if (typeof accNo === 'object') accNo = accNo.accountNumber;
    accNo = String(accNo).padStart(10, '0').slice(0, 10);

    const [existing] = await sequelize.query(
      `SELECT id FROM loan_accounts WHERE ACCT_NO = ? LIMIT 1`,
      {
        replacements: [accNo],
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );
    if (!existing) return accNo;
    attempts++;
  }
  return `319${Date.now().toString().slice(-7)}`;
};

// Get or create default collection ID – using Sequelize models
const getOrCreateCollectionId = async (connection) => {
  try {
    let group = await Group.findOne({ transaction: connection });
    if (!group) {
      group = await Group.create({
        groupCode: 'DEFAULT_GROUP',
        groupName: 'Default Group',
        branch: 1,
        createdBy: 1,
        status: 'ACTIVE',
        description: 'Automatically created default group for individual loan collections'
      }, { transaction: connection });
      console.log(`✅ Created default group with ID: ${group.id}`);
    } else {
      console.log(`📋 Using existing group ID: ${group.id}`);
    }

    let collection = await Collection.findOne({
      where: { groupId: group.id },
      transaction: connection
    });

    if (!collection) {
      const collectionData = {
        groupId: group.id,
        groupCode: group.groupCode || 'DEFAULT_GROUP',
        amount: 0,
        currency: 'NGN',
        collectionDate: new Date(),
        status: 'pending',
        repaymentType: 'loan_repayment',
        branch: 1,
        relationshipManager: 1,
        channel: 6,
        paymentMethod: 'CASH',
        transactionReference: `REF_${Date.now()}`,
        createdBy: 'SYSTEM'
      };

      const newCollection = Collection.build(collectionData);
      await newCollection.save({ hooks: false, transaction: connection });
      collection = newCollection;
      console.log(`✅ Created default collection with ID: ${collection.id} (hooks skipped)`);

      await ProcessingSummary.create({
        collectionId: collection.id,
        totalLoanAmount: 0,
        totalSavingsAmount: 0,
        totalFeesAmount: 0,
        successfulLoanRepayments: 0,
        failedLoanRepayments: 0,
        successfulSavings: 0,
        failedSavings: 0,
        repaymentSchedulesUpdated: 0,
        totalProcessedAmount: 0
      }, { transaction: connection });
      console.log(`✅ Created ProcessingSummary for collection ${collection.id}`);

      collection.status = 'pending';
      await collection.save({ transaction: connection });
      console.log(`✅ Collection saved with ProcessingSummary in place`);
    } else {
      console.log(`📋 Using existing collection ID: ${collection.id} for group ${group.id}`);
      const summary = await ProcessingSummary.findOne({ where: { collectionId: collection.id }, transaction: connection });
      if (!summary) {
        await ProcessingSummary.create({
          collectionId: collection.id,
          totalLoanAmount: 0,
          totalSavingsAmount: 0,
          totalFeesAmount: 0,
          successfulLoanRepayments: 0,
          failedLoanRepayments: 0,
          successfulSavings: 0,
          failedSavings: 0,
          repaymentSchedulesUpdated: 0,
          totalProcessedAmount: 0
        }, { transaction: connection });
        console.log(`✅ Created missing ProcessingSummary for existing collection ${collection.id}`);
      }
    }

    return collection.id;
  } catch (error) {
    console.error(`❌ Error in getOrCreateCollectionId:`, error.message);
    const anyCollection = await Collection.findOne({ transaction: connection });
    if (anyCollection) {
      console.log(`⚠️ Fallback: using collection ID: ${anyCollection.id}`);
      return anyCollection.id;
    }
    throw new Error(`Cannot get or create collection: ${error.message}`);
  }
};

// Create repayment schedule record with installments
const createRepaymentSchedule = async (loanAccountId, loanAccNo, customerId, principal, flatRatePercent, termMonths, paymentFrequency, emiCalc, totalInterest, totalRepayable, createdBy, connection, installmentsPaidCount = 0, paymentDatesArray = []) => {
  try {
    const installments = [];
    const disbursementDateObj = new Date();
    let remainingBalance = totalRepayable;
    
    for (let i = 1; i <= termMonths; i++) {
      const dueDate = calculateDueDate(disbursementDateObj, i, paymentFrequency);
      const principalPortion = emiCalc.perInstallmentPrincipal;
      const interestPortion = emiCalc.perInstallmentInterest;
      const totalPortion = principalPortion + interestPortion;
      
      const isPrepaid = i <= installmentsPaidCount;
      const paymentDate = (isPrepaid && paymentDatesArray[i-1]) ? paymentDatesArray[i-1] : (isPrepaid ? dueDate : null);
      
      remainingBalance -= totalPortion;
      
      installments.push({
        installmentNo: i,
        dueDate: dueDate.toISOString(),
        principal: principalPortion,
        interest: interestPortion,
        totalPayment: totalPortion,
        remainingBalance: Math.max(0, remainingBalance),
        status: isPrepaid ? 'PAID' : 'PENDING',
        amountPaid: isPrepaid ? totalPortion : 0,
        principalPaid: isPrepaid ? principalPortion : 0,
        interestPaid: isPrepaid ? interestPortion : 0,
        isBackdated: isPrepaid
      });
    }
    
    const installmentsJson = JSON.stringify(installments);
    
    const insertScheduleQuery = `
      INSERT INTO repayment_schedules (
        loan_account_id, account_number, customer_id, start_date, maturity_date,
        principal_amount, interest_rate, term, term_type, payment_frequency,
        total_interest, total_repayment, emi_amount, status,
        interest_rate_type, interest_type, calculation_method, is_term_based_rate,
        created_by, installments_json, schedule, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    
    const scheduleValues = [
      loanAccountId, loanAccNo, String(customerId).padStart(10, '0'),
      new Date(), calculateDueDate(new Date(), termMonths, paymentFrequency),
      principal, flatRatePercent, termMonths, paymentFrequency.charAt(0), paymentFrequency,
      totalInterest, totalRepayable, emiCalc.emi, 'ACTIVE',
      'FIXED', 'SIMPLE', 'FLAT_RATE', 0,
      createdBy, installmentsJson, installmentsJson
    ];
    
    await sequelize.query(insertScheduleQuery, {
      replacements: scheduleValues,
      transaction: connection
    });
    console.log(`✅ Repayment schedule created for loan account ${loanAccNo} with ${termMonths} installments`);
  } catch (error) {
    console.warn(`⚠️ Could not create repayment schedule:`, error.message);
  }
};

// ========== FIND LOAN PRODUCT HELPER - CORRECTED FIELD NAMES ==========
const findLoanProduct = async (productCodeStr, connection) => {
  let loanProduct = null;
  const searchCode = String(productCodeStr).trim();
  
  console.log(`🔍 Searching for loan product: "${searchCode}"`);
  
  // Try 1: Search by prod_id (numeric)
  if (!loanProduct && !isNaN(searchCode)) {
    loanProduct = await LoanProduct.findOne({
      where: { prod_id: parseInt(searchCode, 10) },
      transaction: connection
    });
    if (loanProduct) console.log(`✅ Found by prod_id: ${searchCode}`);
  }
  
  // Try 2: Search by product_code (string)
  if (!loanProduct) {
    loanProduct = await LoanProduct.findOne({
      where: { product_code: searchCode },
      transaction: connection
    });
    if (loanProduct) console.log(`✅ Found by product_code: ${searchCode}`);
  }
  
  // Try 3: Search by product_short_name
  if (!loanProduct) {
    loanProduct = await LoanProduct.findOne({
      where: { product_short_name: searchCode.toUpperCase() },
      transaction: connection
    });
    if (loanProduct) console.log(`✅ Found by product_short_name: ${searchCode}`);
  }
  
  // Try 4: Search by name (partial match)
  if (!loanProduct) {
    loanProduct = await LoanProduct.findOne({
      where: { name: { [Op.like]: `%${searchCode}%` } },
      transaction: connection
    });
    if (loanProduct) console.log(`✅ Found by name: ${searchCode}`);
  }
  
  return loanProduct;
};

// ========== CORE: PROCESS SINGLE LOAN (DISBURSEMENT + PREPAID INSTALLMENTS) ==========
async function processIndividualLoan(record, results, createdBy, connection) {
  try {
    const {
      customer_id,
      customer_name,
      disbursed_amount,
      product_code,
      installments_paid = 0,
      paid_amount = 0,
      payment_dates = '',
      interest_rate,
      tenure = 12,
      payment_frequency = 'MONTHLY',
      disbursement_date = new Date().toISOString().slice(0, 10),
      branch_code = '001',
      relationship_officer_id = 'SYSTEM'
    } = record;

    console.log('\n=== LOAN DETAILS ===');
    console.log('customer_id:', customer_id);
    console.log('customer_name:', customer_name);
    console.log('disbursed_amount:', disbursed_amount);
    console.log('product_code:', product_code);
    console.log('payment_frequency:', payment_frequency);
    console.log('tenure:', tenure);
    console.log('installments_paid:', installments_paid);
    console.log('disbursement_date:', disbursement_date);
    console.log('====================\n');

    const principal = safeNumber(disbursed_amount);
    if (principal <= 0) throw new Error(`Invalid disbursed_amount: ${disbursed_amount}`);

    const productCodeStr = String(product_code).trim();

    // ========== FIND LOAN PRODUCT ==========
    const loanProduct = await findLoanProduct(productCodeStr, connection);
    
    if (!loanProduct) {
      console.log(`❌ Loan product NOT found for: ${productCodeStr}`);
      
      const allProducts = await LoanProduct.findAll({
        attributes: ['prod_id', 'product_code', 'product_short_name', 'name', 'loan_interest_rate_id'],
        raw: true,
        limit: 10,
        transaction: connection
      });
      
      console.log('Sample of available products:', JSON.stringify(allProducts, null, 2));
      throw new Error(`Loan product not found: ${productCodeStr}`);
    }

    console.log(`✅ Found loan product: ID=${loanProduct.prod_id}, Name=${loanProduct.name || loanProduct.product_short_name}`);

    // ========== FETCH INTEREST RATE ==========
    let flatRatePercent = safeNumber(interest_rate);
    if (flatRatePercent === 0 && loanProduct) {
      try {
        let rateValue = null;
        if (loanProduct.loan_interest_rate_id) {
          const rateRecord = await LoanInterestRate.findByPk(loanProduct.loan_interest_rate_id, {
            transaction: connection
          });
          if (rateRecord) {
            rateValue = parseFloat(rateRecord.DEFAULT_RATE_PER_MONTH);
          }
        }
        if (rateValue) {
          flatRatePercent = rateValue;
          console.log(`✅ Interest rate: ${flatRatePercent}% per month (${flatRatePercent * 12}% annual)`);
        } else {
          flatRatePercent = 6.2;
          console.log(`⚠️ Using default interest rate: ${flatRatePercent}%`);
        }
      } catch (rateError) {
        console.error('Error fetching interest rate:', rateError.message);
        flatRatePercent = 6.2;
      }
    }

    const termMonths = parseInt(tenure);
    if (isNaN(termMonths) || termMonths <= 0) throw new Error(`Invalid tenure: ${tenure}`);

    const emiCalc = calculateFlatRateEMI(principal, flatRatePercent, termMonths, payment_frequency);
    const installmentAmount = emiCalc.emi;
    const totalInterest = emiCalc.totalInterest;
    const totalRepayable = emiCalc.totalRepayment;
    const numberOfInstallments = emiCalc.numberOfInstallments;

    let installmentsPaidCount = parseInt(installments_paid) || 0;
    if (installmentsPaidCount > numberOfInstallments) {
      console.warn(`Capping installments_paid from ${installmentsPaidCount} to ${numberOfInstallments}`);
      installmentsPaidCount = numberOfInstallments;
    }

    let paymentDatesArray = [];
    if (payment_dates && typeof payment_dates === 'string') {
      paymentDatesArray = payment_dates.split(',').map(d => new Date(d.trim()));
    }

    const disbursementDateObj = new Date(disbursement_date);
    const maturityDate = calculateDueDate(disbursementDateObj, termMonths, payment_frequency);

    // Generate loan account number using the product's prod_id
    const loanAccNo = await generateUniqueAccountNumber(loanProduct.prod_id, connection);

    const customer = await Customer.findOne({
      where: { CUST_ID: String(customer_id).padStart(10, '0') },
      transaction: connection
    });
    if (!customer) console.warn(`Customer ${customer_id} not found, but continuing`);

    // ========== CREATE LOAN ACCOUNT – using correct model column names ==========
    const columns = [
      'ACCT_NO',
      'ACCT_NM',
      'CUST_ID',
      'AMOUNT',
      'DISBURSED_AMOUNT',
      'OUTSTANDING_PRINCIPAL',
      'accrued_interest',
      'INTEREST_RATE',
      'LOAN_STATUS',
      'SERVICING_STATUS',
      'TERM_CD',
      'TERM_VALUE',
      'LOAN_PRODUCT_ID',
      'MATURITY_DT',
      'DISBURSEMENT_DATE',
      'APPLICATION_DATE',
      'created_at',
      'updated_at'
    ];

    const insertValues = [
      loanAccNo,
      customer_name,
      String(customer_id).padStart(10, '0'),
      principal,
      principal,
      principal,
      totalInterest,
      flatRatePercent,
      installmentsPaidCount === numberOfInstallments ? 'CLOSED' : 'ACTIVE',
      'SERVICED',
      payment_frequency.charAt(0),
      termMonths,
      loanProduct.prod_id,
      maturityDate,
      disbursementDateObj,
      disbursementDateObj,
      new Date(),
      new Date()
    ];

    const placeholders = columns.map(() => '?').join(', ');
    const insertLoanQuery = `INSERT INTO loan_accounts (${columns.join(', ')}) VALUES (${placeholders})`;

    console.log(`📊 Inserting loan with ${insertValues.length} values`);
    const [loanResult] = await sequelize.query(insertLoanQuery, {
      replacements: insertValues,
      transaction: connection
    });

    const loanAccountId = loanResult.insertId || loanResult;
    console.log(`✅ Loan account created with ID: ${loanAccountId}`);

    // ============================================================
    // ⭐ LOAN PROVISION (1% of disbursed amount) – NEW
    // ============================================================
    try {
      // Fetch the loan account instance (needed by createLoanProvision)
      const loanAccountInstance = await LoanAccount.findByPk(loanAccountId, { transaction: connection });
      if (loanAccountInstance) {
        const branchCode = branch_code || '001';
        await createLoanProvision({
          loanAccount: loanAccountInstance,
          branchCode: branchCode,
          disbursedAmount: principal,
          createdBy: createdBy,
          transaction: connection
        });
        console.log(`✅ Loan provision created for ${loanAccNo}`);
      } else {
        console.warn(`⚠️ Could not fetch loan account instance for provision (ID: ${loanAccountId})`);
      }
    } catch (provisionError) {
      console.warn(`⚠️ Provision creation failed for loan ${loanAccNo}: ${provisionError.message}`);
      // Non‑critical – continue so the loan is still created
    }

    // ========== CREATE REPAYMENT SCHEDULE ==========
    await createRepaymentSchedule(
      loanAccountId, loanAccNo, customer_id, principal, flatRatePercent,
      termMonths, payment_frequency, emiCalc, totalInterest, totalRepayable,
      createdBy, connection, installmentsPaidCount, paymentDatesArray
    );

    // ========== UPDATE LOAN PORTFOLIO TABLE using Model ==========
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    const productType = loanProduct.product_type || 'INDIVIDUAL_LOAN';
    const productCodeValue = loanProduct.product_code || String(loanProduct.prod_id);
    const productName = loanProduct.name || loanProduct.product_short_name || productCodeValue;

    let [portfolio, created] = await LoanPortfolio.findOrCreate({
      where: {
        BRANCH_ID: branch_code,
        PROD_ID: loanProduct.prod_id,
        YEAR: currentYear,
        MONTH: currentMonth
      },
      defaults: {
        BRANCH_ID: branch_code,
        PROD_ID: loanProduct.prod_id,
        PRODUCT_CODE: productCodeValue,
        PRODUCT_NAME: productName,
        PRODUCT_TYPE: productType,
        MONTH: currentMonth,
        YEAR: currentYear,
        CURRENCY: 'NGN',
        STATUS: 'ACTIVE',
        CREATED_BY: createdBy,
        UPDATED_BY: createdBy
      },
      transaction: connection
    });

    await portfolio.update({
      TOTAL_DISBURSED: (parseFloat(portfolio.TOTAL_DISBURSED) || 0) + principal,
      TOTAL_NET_DISBURSEMENT: (parseFloat(portfolio.TOTAL_NET_DISBURSEMENT) || 0) + principal,
      TOTAL_PRINCIPAL: (parseFloat(portfolio.TOTAL_PRINCIPAL) || 0) + principal,
      OUTSTANDING_PRINCIPAL: (parseFloat(portfolio.OUTSTANDING_PRINCIPAL) || 0) + principal,
      TOTAL_INTEREST_ACCRUED: (parseFloat(portfolio.TOTAL_INTEREST_ACCRUED) || 0) + totalInterest,
      NUMBER_OF_LOANS: (portfolio.NUMBER_OF_LOANS || 0) + 1,
      ACTIVE_LOANS: (portfolio.ACTIVE_LOANS || 0) + 1,
      DISBURSEMENT_COUNT: (portfolio.DISBURSEMENT_COUNT || 0) + 1,
      UPDATED_BY: createdBy
    }, { transaction: connection });

    console.log(`✅ Loan portfolio updated for product ${productCodeValue}`);

    // ========== CREATE DISBURSEMENT TRANSACTION ==========
    const txIds = generateTransactionId();

    const insertTransQuery = `
      INSERT INTO transactions (
        account_number, account_id, bu_id, customer_id, account_name,
        amount, transaction_direction, transaction_date, transaction_type,
        transaction_identifier, event_id, journal_id, reference,
        description, currency, created_by, status, metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const transValues = [
      loanAccNo, String(loanAccountId), branch_code,
      String(customer_id).padStart(10, '0'), customer_name,
      principal, 'DEBIT', disbursementDateObj, 'LOAN_DISBURSEMENT',
      txIds.transactionIdentifier, txIds.eventId, txIds.journalId, txIds.reference,
      `Bulk loan disbursement for ${customer_name}`, 'NGN', createdBy, 'COMPLETED',
      JSON.stringify({ purpose: 'LOAN_DISBURSEMENT', loanAccountId, batchId: results.batchId })
    ];

    await sequelize.query(insertTransQuery, { replacements: transValues, transaction: connection });
    console.log('✅ Disbursement transaction created');

    // ========== RECORD PREPAID INSTALLMENTS ==========
    let totalAmountPaid = 0;
    let totalPrincipalPaid = 0;
    let totalInterestPaid = 0;

    if (installmentsPaidCount > 0) {
      const perInstallmentPrincipal = emiCalc.perInstallmentPrincipal;
      const perInstallmentInterest = emiCalc.perInstallmentInterest;
      
      const collectionId = await getOrCreateCollectionId(connection);
      console.log(`📋 Using collection ID: ${collectionId}`);

      for (let i = 1; i <= installmentsPaidCount; i++) {
        const dueDate = calculateDueDate(disbursementDateObj, i, payment_frequency);
        const paymentDate = (paymentDatesArray[i-1] && !isNaN(paymentDatesArray[i-1])) ? paymentDatesArray[i-1] : dueDate;
        const principalPortion = perInstallmentPrincipal;
        const interestPortion = perInstallmentInterest;
        const totalPortion = principalPortion + interestPortion;

        // Insert into loan_repayment_history
        const insertHistoryQuery = `
          INSERT INTO loan_repayment_history (
            loan_account_id, account_number, customer_id, repayment_date,
            principal_amount, interest_amount, penalty_amount, total_amount,
            reference, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        await sequelize.query(insertHistoryQuery, {
          replacements: [
            loanAccountId, loanAccNo, String(customer_id).padStart(10, '0'),
            paymentDate, principalPortion, interestPortion, 0, totalPortion,
            `PREPAID_${results.batchId}_${customer_id}_${i}`, createdBy
          ],
          transaction: connection
        });

        // Insert into loan_repayments
        const insertRepaymentQuery = `
          INSERT INTO loan_repayments (
            collection_id, loan_account_id, loan_account_number, customer_id, customer_name,
            principal_amount, interest_amount, penalty_amount, total_amount,
            installment_number, repayment_date, transaction_reference, status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;
        await sequelize.query(insertRepaymentQuery, {
          replacements: [
            collectionId, loanAccountId, loanAccNo,
            String(customer_id).padStart(10, '0'), customer_name,
            principalPortion, interestPortion, 0, totalPortion,
            i, paymentDate, `PREPAID_${results.batchId}_${customer_id}_${i}`, 'COMPLETED'
          ],
          transaction: connection
        });

        totalPrincipalPaid += principalPortion;
        totalInterestPaid += interestPortion;
        totalAmountPaid += totalPortion;
      }

      // ========== UPDATE LOAN ACCOUNT after prepaid installments ==========
      const newOutstandingPrincipal = principal - totalPrincipalPaid;
      const newOutstandingInterest = totalInterest - totalInterestPaid;
      const newTotalDue = newOutstandingPrincipal + newOutstandingInterest;

      const updateLoanQuery = `
        UPDATE loan_accounts SET
          OUTSTANDING_PRINCIPAL = ?,
          accrued_interest = ?,
          LOAN_STATUS = ?,
          updated_at = NOW()
        WHERE id = ?
      `;

      await sequelize.query(updateLoanQuery, {
        replacements: [
          newOutstandingPrincipal,
          newOutstandingInterest,
          newTotalDue <= 0 ? 'CLOSED' : 'ACTIVE',
          loanAccountId
        ],
        transaction: connection
      });

      results.summary.totalRepaymentsRecorded += installmentsPaidCount;
      results.summary.totalPaidAmount += totalAmountPaid;
    }

    results.summary.totalDisbursed += principal;
    results.summary.totalOutstandingPrincipal += (principal - totalPrincipalPaid);
    results.summary.totalOutstandingInterest += (totalInterest - totalInterestPaid);

    results.successful.push({
      customer_id, customer_name, account_number: loanAccNo,
      disbursed_amount: principal, emi: installmentAmount,
      installments_paid: installmentsPaidCount, paid_amount: totalAmountPaid,
      loan_status: installmentsPaidCount === numberOfInstallments ? 'CLOSED' : 'ACTIVE',
      remaining_balance: (principal - totalPrincipalPaid) + (totalInterest - totalInterestPaid)
    });

    return loanAccountId;
  } catch (error) {
    console.error(`Error processing loan:`, error.message);
    results.failed.push({
      customer_id: record.customer_id,
      customer_name: record.customer_name,
      product_code: record.product_code,
      error: error.message
    });
    return null;
  }
}

// ========== BULK DISBURSEMENT ENDPOINT ==========
export const bulkIndividualLoanDisbursement = asyncHandler(async (req, res) => {
  console.log('=== BULK INDIVIDUAL LOAN DISBURSEMENT START ===');
  let connection;
  let results;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const workbook = xlsx.readFile(req.file.path, { cellDates: true, defval: "" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);
    const totalRecords = data.length;
    if (totalRecords === 0) throw new Error('Excel file is empty');

    const requiredFields = ['customer_id', 'customer_name', 'disbursed_amount', 'product_code'];
    const firstRow = data[0];
    const missing = requiredFields.filter(f => !firstRow.hasOwnProperty(f));
    if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);

    console.log(`Processing ${totalRecords} records`);

    results = {
      batchId: uuidv4(),
      totalRecords,
      successful: [],
      failed: [],
      summary: {
        totalDisbursed: 0,
        totalOutstandingPrincipal: 0,
        totalOutstandingInterest: 0,
        totalRepaymentsRecorded: 0,
        totalPaidAmount: 0
      }
    };

    const createdBy = req.user?.id || 'SYSTEM';
    const userName = req.user?.name || 'System User';

    connection = await sequelize.transaction();

    const limit = pLimit(CONCURRENT_BATCHES);
    const batches = [];
    for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
      batches.push(data.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      const promises = batch.map(record => limit(() => processIndividualLoan(record, results, createdBy, connection)));
      await Promise.all(promises);
    }

    await connection.commit();
    console.log('✅ Transaction committed');

    // Audit trail
    try {
      const auditData = {
        batchId: results.batchId,
        fileName: req.file.originalname,
        totalRecords,
        successful: results.successful.length,
        failed: results.failed.length,
        summary: results.summary,
        user_name: userName,
        uploadedBy: createdBy,
        type: 'INDIVIDUAL_LOAN_DISBURSEMENT'
      };
      let eventId = generateEventId();
      let duplicate = true;
      let attempts = 0;
      while (duplicate && attempts < 5) {
        eventId = generateEventId();
        try {
          await AuditTrail.create({
            event_id: eventId,
            user_id: createdBy,
            user_name: userName,
            event_type: 'BULK_UPLOAD',
            action: 'BULK_INDIVIDUAL_LOAN_DISBURSEMENT',
            entity_type: 'BulkLoan',
            entity_id: Date.now() % 2147483647,
            new_value: JSON.stringify(auditData),
            ip_address: getClientIp(req),
            user_agent: req.headers['user-agent'],
            status: results.failed.length === 0 ? 'SUCCESS' : 'FAILED',
            description: `Bulk disbursed ${results.successful.length} loans, ${results.failed.length} failed`
          });
          duplicate = false;
        } catch (err) {
          if (err.name === 'SequelizeUniqueConstraintError' && err.fields?.event_id) {
            attempts++;
            console.warn(`⚠️ Duplicate event_id ${eventId}, retrying (${attempts}/5)`);
            continue;
          }
          throw err;
        }
      }
      console.log('✅ Audit trail created');
    } catch (auditError) {
      console.error('❌ Failed to create audit trail (non-critical):', auditError.message);
    }

    // Cleanup file
    try {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
        console.log('✅ Temporary file deleted');
      }
    } catch (cleanupError) {
      console.error('❌ Failed to delete temporary file (non-critical):', cleanupError.message);
    }

    res.status(200).json({
      success: true,
      message: `Processed ${results.successful.length} loans successfully, ${results.failed.length} failed`,
      data: {
        batchId: results.batchId,
        summary: results.summary,
        successful: results.successful,
        failed: results.failed,
        totalRecords
      }
    });
  } catch (error) {
    if (connection && connection.finished !== 'commit') {
      try {
        await connection.rollback();
        console.log('✅ Transaction rolled back due to error');
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError.message);
      }
    }
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🗑️ Deleted temporary file after error');
      } catch (cleanupError) {}
    }
    console.error('❌ Bulk disbursement failed:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ========== BULK REPAYMENT ENDPOINT ==========
export const bulkLoanRepayment = asyncHandler(async (req, res) => {
  console.log('=== BULK LOAN REPAYMENT START ===');
  let connection;

  try {
    if (!req.file) throw new Error('No file uploaded');
    const workbook = xlsx.readFile(req.file.path, { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);
    if (data.length === 0) throw new Error('Empty file');

    const requiredFields = ['loan_account_number', 'repayment_amount', 'payment_date'];
    const missing = requiredFields.filter(f => !data[0].hasOwnProperty(f));
    if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);

    const results = {
      batchId: uuidv4(),
      totalRecords: data.length,
      successful: [],
      failed: [],
      summary: { totalRepaymentAmount: 0, totalPrincipalPaid: 0, totalInterestPaid: 0, totalPenaltyPaid: 0 }
    };

    const createdBy = req.user?.id || 'SYSTEM';
    connection = await sequelize.transaction();

    const limit = pLimit(CONCURRENT_BATCHES);
    const promises = data.map(record => limit(() => processSingleRepayment(record, results, createdBy, connection)));
    await Promise.all(promises);
    await connection.commit();

    // Audit trail
    try {
      const auditData = {
        batchId: results.batchId,
        fileName: req.file.originalname,
        totalRecords: data.length,
        successful: results.successful.length,
        failed: results.failed.length,
        summary: results.summary,
        type: 'BULK_REPAYMENT'
      };
      await AuditTrail.create({
        event_id: generateEventId(),
        user_id: createdBy,
        user_name: req.user?.name || 'System User',
        event_type: 'BULK_UPLOAD',
        action: 'BULK_LOAN_REPAYMENT',
        entity_type: 'BulkRepayment',
        entity_id: Date.now() % 2147483647,
        new_value: JSON.stringify(auditData),
        ip_address: getClientIp(req),
        user_agent: req.headers['user-agent'],
        status: results.failed.length === 0 ? 'SUCCESS' : 'FAILED',
        description: `Bulk repayments: ${results.successful.length} successful, ${results.failed.length} failed`
      });
    } catch (auditError) {
      console.error('Audit trail error (non-critical):', auditError.message);
    }

    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(200).json({ success: true, data: results });
  } catch (error) {
    if (connection && connection.finished !== 'commit') {
      await connection.rollback();
    }
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper for single repayment (corrected – no underscores, proper column names)
async function processSingleRepayment(record, results, createdBy, connection) {
  try {
    const { 
      loan_account_number, 
      repayment_amount, 
      payment_date, 
      principal_paid, 
      interest_paid, 
      penalty_paid = 0, 
      reference, 
      narration 
    } = record;

    const amount = safeNumber(repayment_amount);
    if (amount <= 0) throw new Error(`Invalid amount: ${repayment_amount}`);

    const [loan] = await sequelize.query(
      `SELECT 
        id, 
        CUST_ID, 
        ACCT_NM, 
        LOAN_STATUS, 
        OUTSTANDING_PRINCIPAL, 
        accrued_interest AS ACCRUED_INTEREST,
        TOTAL_REPAID_AMOUNT, 
        PAYMENTS_MADE
       FROM loan_accounts 
       WHERE ACCT_NO = ? 
       LIMIT 1`,
      {
        replacements: [loan_account_number],
        type: sequelize.QueryTypes.SELECT,
        transaction: connection
      }
    );

    if (!loan) throw new Error(`Loan account ${loan_account_number} not found`);
    if (loan.LOAN_STATUS === 'CLOSED') throw new Error(`Loan already closed`);

    const outstandingPrincipal = safeNumber(loan.OUTSTANDING_PRINCIPAL);
    const outstandingInterest = safeNumber(loan.ACCRUED_INTEREST);
    const outstandingBalance = outstandingPrincipal + outstandingInterest;

    if (amount > outstandingBalance) {
      throw new Error(`Repayment amount ${amount} exceeds outstanding ${outstandingBalance}`);
    }

    let principalAlloc = safeNumber(principal_paid);
    let interestAlloc = safeNumber(interest_paid);
    let penaltyAlloc = safeNumber(penalty_paid);

    if (principalAlloc === 0 && interestAlloc === 0) {
      interestAlloc = Math.min(amount, outstandingInterest);
      principalAlloc = amount - interestAlloc;
    }

    const totalAlloc = principalAlloc + interestAlloc + penaltyAlloc;
    if (Math.abs(totalAlloc - amount) > 0.01) {
      throw new Error(`Allocation sum ${totalAlloc} != amount ${amount}`);
    }

    const paymentDateObj = new Date(payment_date);
    const txIds = generateTransactionId();
    const collectionId = await getOrCreateCollectionId(connection);

    // ========== CREATE REPAYMENT TRANSACTION ==========
    const insertRepaymentQuery = `
      INSERT INTO transactions (
        account_number, account_id, bu_id, customer_id, account_name,
        amount, transaction_direction, transaction_date, transaction_type,
        transaction_identifier, event_id, journal_id, reference,
        description, currency, created_by, status, metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const repaymentTransValues = [
      loan_account_number, 
      String(loan.id), 
      '001',
      loan.CUST_ID, 
      loan.ACCT_NM,
      amount, 
      'CREDIT', 
      paymentDateObj, 
      'LOAN_REPAYMENT',
      txIds.transactionIdentifier, 
      txIds.eventId, 
      txIds.journalId, 
      reference || txIds.reference,
      narration || 'Bulk loan repayment', 
      'NGN', 
      createdBy, 
      'COMPLETED',
      JSON.stringify({ 
        purpose: 'LOAN_REPAYMENT', 
        loanAccountId: loan.id, 
        batchId: results.batchId 
      })
    ];

    await sequelize.query(insertRepaymentQuery, {
      replacements: repaymentTransValues,
      transaction: connection
    });
    console.log(`✅ Repayment transaction created for ${loan_account_number}`);

    // ========== INSERT INTO loan_repayment_history ==========
    const insertHistoryQuery = `
      INSERT INTO loan_repayment_history (
        loan_account_id, account_number, customer_id, repayment_date,
        principal_amount, interest_amount, penalty_amount, total_amount,
        reference, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    await sequelize.query(insertHistoryQuery, {
      replacements: [
        loan.id, 
        loan_account_number, 
        loan.CUST_ID,
        paymentDateObj, 
        principalAlloc, 
        interestAlloc, 
        penaltyAlloc, 
        amount,
        reference || txIds.reference, 
        createdBy
      ],
      transaction: connection
    });

    // ========== INSERT INTO loan_repayments ==========
    const insertLoanRepaymentQuery = `
      INSERT INTO loan_repayments (
        collection_id, loan_account_id, loan_account_number, customer_id, customer_name,
        principal_amount, interest_amount, penalty_amount, total_amount,
        repayment_date, transaction_reference, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    await sequelize.query(insertLoanRepaymentQuery, {
      replacements: [
        collectionId, 
        loan.id, 
        loan_account_number, 
        loan.CUST_ID, 
        loan.ACCT_NM,
        principalAlloc, 
        interestAlloc, 
        penaltyAlloc, 
        amount,
        paymentDateObj, 
        reference || txIds.reference, 
        'COMPLETED'
      ],
      transaction: connection
    });

    // ========== UPDATE LOAN ACCOUNT – CORRECT COLUMN NAMES ==========
    const newOutstandingPrincipal = outstandingPrincipal - principalAlloc;
    const newOutstandingInterest = outstandingInterest - interestAlloc;
    const newTotalDue = newOutstandingPrincipal + newOutstandingInterest;
    const newLoanStatus = newTotalDue <= 0 ? 'CLOSED' : 'ACTIVE';

    const updateLoanQuery = `
      UPDATE loan_accounts SET
        OUTSTANDING_PRINCIPAL = ?,
        accrued_interest = ?,
        LOAN_STATUS = ?,
        TOTAL_REPAID_AMOUNT = TOTAL_REPAID_AMOUNT + ?,
        PAYMENTS_MADE = PAYMENTS_MADE + 1,
        updated_at = NOW()
      WHERE id = ?
    `;

    await sequelize.query(updateLoanQuery, {
      replacements: [
        newOutstandingPrincipal,
        newOutstandingInterest,
        newLoanStatus,
        amount,
        loan.id
      ],
      transaction: connection
    });

    results.summary.totalRepaymentAmount += amount;
    results.summary.totalPrincipalPaid += principalAlloc;
    results.summary.totalInterestPaid += interestAlloc;
    results.summary.totalPenaltyPaid += penaltyAlloc;

    results.successful.push({ 
      loan_account_number, 
      amount, 
      remaining_balance: newTotalDue 
    });

    return true;
  } catch (error) {
    console.error('Error processing single repayment:', error.message);
    results.failed.push({ record, error: error.message });
    return false;
  }
}

// ========== DOWNLOAD TEMPLATE ==========
export const downloadTemplate = async (req, res) => {
  const frequency = req.query.frequency?.toUpperCase() || 'MONTHLY';
  const template = [{
    customer_id: '0000000001',
    customer_name: 'John Doe',
    product_code: '301',
    disbursed_amount: 100000,
    installments_paid: 0,
    paid_amount: 0,
    payment_dates: '',
    branch_code: '001',
    interest_rate: 6.2,
    tenure: 12,
    payment_frequency: frequency,
    disbursement_date: new Date().toISOString().slice(0,10),
    relationship_officer_id: 'OFF001'
  }];
  const ws = xlsx.utils.json_to_sheet(template);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Template');
  const instructions = [
    { Field: 'customer_id', Description: 'Customer ID (10 digits)', Required: 'Yes' },
    { Field: 'customer_name', Description: 'Full name', Required: 'Yes' },
    { Field: 'product_code', Description: 'Loan product code (PROD_ID or productCode)', Required: 'Yes' },
    { Field: 'disbursed_amount', Description: 'Principal amount', Required: 'Yes' },
    { Field: 'installments_paid', Description: 'Number of prepaid installments', Required: 'No' },
    { Field: 'paid_amount', Description: 'Total amount already paid (if any)', Required: 'No' },
    { Field: 'payment_dates', Description: 'Comma-separated dates for each prepaid installment', Required: 'No' },
    { Field: 'interest_rate', Description: 'Override interest rate %', Required: 'No' },
    { Field: 'tenure', Description: 'Loan term (months)', Required: 'Yes' },
    { Field: 'payment_frequency', Description: 'DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY', Required: 'Yes' },
    { Field: 'disbursement_date', Description: 'YYYY-MM-DD', Required: 'No' }
  ];
  const wsInst = xlsx.utils.json_to_sheet(instructions);
  xlsx.utils.book_append_sheet(wb, wsInst, 'Instructions');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=individual_loan_template.xlsx`);
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.send(buffer);
};

// ========== DEBUG ENDPOINT - Check available products ==========
export const debugLoanProducts = asyncHandler(async (req, res) => {
  try {
    const products = await LoanProduct.findAll({
      attributes: ['PROD_ID', 'productCode', 'product_code', 'PRODUCT_SHORT_NAME', 'p_r_o_d_u_c_t__s_h_o_r_t__n_a_m_e', 'name'],
      raw: true,
      limit: 50
    });
    
    console.log('=== LOAN PRODUCTS IN DATABASE ===');
    console.log(JSON.stringify(products, null, 2));
    console.log('================================');
    
    res.status(200).json({
      success: true,
      count: products.length,
      products
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== EXPORT ROUTES SETUP ==========
export const bulkLoanRoutes = (app) => {
  app.post('/api/bulk/individual/disburse', upload.single('file'), bulkIndividualLoanDisbursement);
  app.post('/api/bulk/individual/repay', upload.single('file'), bulkLoanRepayment);
  app.get('/api/bulk/individual/template', downloadTemplate);
  app.get('/api/bulk/debug/products', debugLoanProducts);
};