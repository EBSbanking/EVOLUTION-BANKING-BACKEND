import mongoose from 'mongoose';
import CustomerAccount from '../models/CustomerAccount.js';
import Customer from '../models/Customer.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';
import SavingsProduct from '../models/SavingsProduct.js';
import GLAccount from '../models/GLAccount.js';
import Counter from '../models/Counter.js';

// ============================
// ACCOUNT NUMBER GENERATION FUNCTIONS
// ============================

const USE_NUBAN = true;
const BANK_CODE = '011';

// Calculate NUBAN check digit
const calculateNUBANCheckDigit = (baseNumber) => {
  const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3];
  let sum = 0;
  for (let i = 0; i < baseNumber.length; i++) {
    sum += Number(baseNumber[i]) * weights[i];
  }
  const mod = sum % 10;
  return mod === 0 ? '0' : String(10 - mod);
};

// Generate Account Number for Customer
const generateAccountNumberForCustomer = async (customerId, accountType = 'SAVINGS') => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // First, get the customer to ensure they exist
    const customer = await Customer.findOne({ 
      $or: [
        { CUST_ID: Number(customerId) },
        { CUST_ID: String(customerId).padStart(10, '0') }
      ]
    }).session(session);
    
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    // Determine account type counter
    const accountTypeMap = {
      'SAVINGS': 'ACCT_SAVINGS',
      'CURRENT': 'ACCT_CURRENT',
      'LOAN': 'ACCT_LOAN',
    };
    
    const counterType = accountTypeMap[accountType.toUpperCase()] || 'ACCT_SAVINGS';

    // Get counter for this account type
    const counter = await Counter.findOneAndUpdate(
      { _id: counterType },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );

    if (!counter || typeof counter.seq !== 'number') {
      throw new Error(`Failed to generate account number for ${accountType}`);
    }

    // Generate account number based on type
    let accountNumber;
    if (USE_NUBAN) {
      // NUBAN format: [Type][7-digit serial][check digit]
      const typePrefix = accountType.toUpperCase() === 'SAVINGS' ? '2' : 
                        accountType.toUpperCase() === 'CURRENT' ? '3' : '1';
      
      const serial = counter.seq.toString().padStart(7, '0');
      const baseNumber = `${typePrefix}${serial}`;
      const checkDigit = calculateNUBANCheckDigit(baseNumber);
      accountNumber = `${baseNumber}${checkDigit}`;
    } else {
      // Legacy format
      const prefixMap = {
        'SAVINGS': '100',
        'CURRENT': '210',
        'LOAN': '300',
      };
      const prefix = prefixMap[accountType.toUpperCase()] || '100';
      const sequence = counter.seq.toString().padStart(7, '0');
      accountNumber = `${prefix}${sequence}`;
    }

    // Verify account number is 10 digits
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new Error(`Generated account number ${accountNumber} is not 10 digits`);
    }

    // Also generate ACCT_ID (6 digits)
    const acctIdCounter = await Counter.findOneAndUpdate(
      { _id: 'ACCT_ID_SEQ' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );
    const ACCT_ID = acctIdCounter.seq.toString().padStart(6, '0');

    await session.commitTransaction();

    console.log(`✅ Generated Account for Customer ${customerId}: ACCT_NO=${accountNumber}, ACCT_ID=${ACCT_ID}, Type=${accountType}`);

    return {
      ACCT_NO: accountNumber,
      ACCT_ID,
      CUST_ID: customerId,
      accountType: accountType.toUpperCase(),
      sequence: counter.seq
    };
  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Error generating account number:', error);
    throw new Error(`Failed to generate account number: ${error.message}`);
  } finally {
    await session.endSession();
  }
};

// ============================
// UTILITY FUNCTIONS
// ============================

// Temporary fix - reset counters (run once)
export const resetAccountCounters = async () => {
  try {
    await Counter.updateMany(
      { _id: { $in: ['ACCT_SAVINGS', 'ACCT_CURRENT', 'ACCT_LOAN', 'ACCT_ID_SEQ'] } },
      { $set: { seq: 1000 } }, // Start from 1000 to avoid conflicts
      { upsert: true }
    );
    console.log('✅ Counters reset successfully');
    return { success: true, message: 'Counters reset successfully' };
  } catch (error) {
    console.error('❌ Error resetting counters:', error);
    return { success: false, message: error.message };
  }
};

// Check for duplicate account numbers
export const findDuplicateAccounts = async () => {
  try {
    const duplicates = await CustomerAccount.aggregate([
      {
        $group: {
          _id: "$ACCT_NO",
          count: { $sum: 1 },
          accounts: { $push: "$$ROOT" }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    console.log(`Found ${duplicates.length} duplicate account numbers`);
    return duplicates;
  } catch (error) {
    console.error('Error finding duplicates:', error);
    return [];
  }
};

// ============================
// MAIN ACCOUNT CREATION CONTROLLERS
// ============================

// Original createCustomerAccount function with auto-generation
export const createCustomerAccount = async (req, res) => {
  const customerAccounts = req.body;

  if (!Array.isArray(customerAccounts)) {
    return res.status(400).json({
      success: false,
      message: 'Request body must be an array of customer accounts.',
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const createdAccounts = [];
    const now = new Date();
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    for (const accountData of customerAccounts) {
      const {
        ACCT_NO,
        ACCT_ID,
        ACCT_NM,
        BU_ID,
        ACCOUNT_TYPE,
        PRODUCT_DESC,
        REC_ST,
        CUST_ID,
        productCode,
        INTEREST_RATE,
        INTEREST_GL_ACCT_NO,
        ACCRUED_INTEREST,
        LAST_INTEREST_DATE,
      } = accountData;

      // ✅ Validate required fields
      if (!CUST_ID || !ACCT_NM || !BU_ID || !ACCOUNT_TYPE) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'CUST_ID, ACCT_NM, BU_ID, and ACCOUNT_TYPE are required.',
          account: ACCT_NO || 'new account',
        });
      }

      // ✅ Customer existence check (handles numeric + zero-padded formats)
      const customerExists = await Customer.exists({
        $or: [
          { CUST_ID: Number(CUST_ID) },
          { CUST_ID: String(CUST_ID).padStart(10, '0') }
        ]
      }).session(session);

      if (!customerExists) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Customer does not exist',
          CUST_ID,
          account: ACCT_NO || 'new account',
        });
      }

      // ✅ Validate ACCOUNT_TYPE
      const VALID_ACCOUNT_TYPES = ['SAVINGS', 'CURRENT'];
      const normalizedAccountType = ACCOUNT_TYPE.toUpperCase();
      if (!VALID_ACCOUNT_TYPES.includes(normalizedAccountType)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Invalid ACCOUNT_TYPE. Must be one of ${VALID_ACCOUNT_TYPES.join(', ')}`,
          account: ACCT_NO || 'new account',
        });
      }

      // ✅ Validate REC_ST
      const VALID_REC_ST = ['ACTIVE', 'DORMANT', 'SUSPENDED', 'CLOSED', 'INACTIVE'];
      const normalizedRecSt = REC_ST?.toUpperCase() || 'ACTIVE';
      if (!VALID_REC_ST.includes(normalizedRecSt)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Invalid REC_ST. Must be one of ${VALID_REC_ST.join(', ')}`,
          account: ACCT_NO || 'new account',
        });
      }

      // ✅ Validate productCode for SAVINGS accounts
      if (normalizedAccountType === 'SAVINGS' && !productCode) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'productCode is required for SAVINGS accounts.',
          account: ACCT_NO || 'new account',
        });
      }
      if (productCode) {
        const product = await SavingsProduct.findOne({ productCode }).session(session);
        if (!product) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Invalid productCode: ${productCode}. No matching SavingsProduct found.`,
            account: ACCT_NO || 'new account',
          });
        }
      }

      // ✅ Validate INTEREST_GL_ACCT_NO for SAVINGS accounts
      if (normalizedAccountType === 'SAVINGS' && !INTEREST_GL_ACCT_NO) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'INTEREST_GL_ACCT_NO is required for SAVINGS accounts.',
          account: ACCT_NO || 'new account',
        });
      }

      let finalACCT_NO = ACCT_NO;
      let finalACCT_ID = ACCT_ID;

      // ✅ Auto-generate ACCT_NO if not provided
      if (!finalACCT_NO) {
        try {
          // Generate account number based on account type
          const accountTypeForGeneration = normalizedAccountType;
          const generatedAccount = await generateAccountNumberForCustomer(CUST_ID, accountTypeForGeneration);
          
          finalACCT_NO = generatedAccount.ACCT_NO;
          if (!finalACCT_ID) {
            finalACCT_ID = generatedAccount.ACCT_ID;
          }
          
          console.log(`✅ Auto-generated account number: ${finalACCT_NO} for customer ${CUST_ID}`);
        } catch (genError) {
          await session.abortTransaction();
          return res.status(500).json({
            success: false,
            message: `Failed to generate account number: ${genError.message}`,
            account: 'new account',
          });
        }
      }

      // ✅ Validate ACCT_NO format (10 digits)
      if (!/^\d{10}$/.test(finalACCT_NO)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `ACCT_NO ${finalACCT_NO} is not a valid account number. Must be 10 digits.`,
          account: finalACCT_NO,
        });
      }

      // ✅ Check for duplicate ACCT_NO
      const existingAccount = await CustomerAccount.findOne({ ACCT_NO: finalACCT_NO }).session(session);
      if (existingAccount) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Account already exists',
          reason: `The account number ${finalACCT_NO} already exists.`,
          account: finalACCT_NO,
        });
      }

      // ✅ Auto-generate ACCT_ID if not provided
      if (!finalACCT_ID) {
        // Generate 6-digit ACCT_ID
        const acctIdCounter = await Counter.findOneAndUpdate(
          { _id: 'ACCT_ID_SEQ' },
          { $inc: { seq: 1 } },
          { new: true, upsert: true, session }
        );
        finalACCT_ID = acctIdCounter.seq.toString().padStart(6, '0');
        console.log(`✅ Auto-generated ACCT_ID: ${finalACCT_ID}`);
      }

      // ✅ Validate ACCT_ID format (6 digits)
      if (!/^\d{6}$/.test(finalACCT_ID)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `ACCT_ID ${finalACCT_ID} is not a valid account ID. Must be 6 digits.`,
          account: finalACCT_NO || 'new account',
        });
      }

      // ✅ Check for duplicate ACCT_ID
      const existingAccountId = await CustomerAccount.findOne({ ACCT_ID: finalACCT_ID }).session(session);
      if (existingAccountId) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Account ID already exists',
          reason: `The account ID ${finalACCT_ID} already exists.`,
          account: finalACCT_NO || 'new account',
        });
      }

      // ✅ Prevent direct balance initialization
      if (accountData.LEDGER_BAL || accountData.CLEARED_BAL || accountData.AVAILABLE_BALANCE) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Balance fields (LEDGER_BAL, CLEARED_BAL, AVAILABLE_BALANCE) cannot be set directly. Use transactions to update balances.',
          account: finalACCT_NO || 'new account',
        });
      }

      // ✅ Create new account
      const newCustomerAccount = new CustomerAccount({
        CUST_ID: Number(CUST_ID),
        ACCT_NO: finalACCT_NO,
        ACCT_ID: finalACCT_ID,
        ACCT_NM,
        BU_ID: String(BU_ID).padStart(3, '0'),
        productCode: normalizedAccountType === 'SAVINGS' ? productCode : undefined,
        LEDGER_BAL: mongoose.Types.Decimal128.fromString('0.00'),
        CLEARED_BAL: mongoose.Types.Decimal128.fromString('0.00'),
        AVAILABLE_BALANCE: mongoose.Types.Decimal128.fromString('0.00'),
        ACCOUNT_TYPE: normalizedAccountType,
        PRODUCT_DESC: PRODUCT_DESC || `${normalizedAccountType} Account`,
        REC_ST: normalizedRecSt,
        INTEREST_RATE: mongoose.Types.Decimal128.fromString(parseFloat(INTEREST_RATE || 0).toFixed(2)),
        INTEREST_GL_ACCT_NO: normalizedAccountType === 'SAVINGS' ? INTEREST_GL_ACCT_NO : undefined,
        ACCRUED_INTEREST: mongoose.Types.Decimal128.fromString(parseFloat(ACCRUED_INTEREST || 0).toFixed(2)),
        LAST_INTEREST_DATE: normalizedAccountType === 'SAVINGS' && LAST_INTEREST_DATE ? new Date(LAST_INTEREST_DATE) : undefined,
        lastActivityDate: now,
        DR_ALLOWED: true,
        CR_ALLOWED: true,
      });

      const savedAccount = await newCustomerAccount.save({ session });
      createdAccounts.push(savedAccount);

      // ✅ Audit trail
      try {
        await AuditTrail.create([{
          event_id: Date.now(),
          user_id: userId,
          event_type: 'CUSTOMER_ACCOUNT_CREATE',
          action: 'Create Account',
          old_value: null,
          new_value: savedAccount.toObject(),
          ip_address: ipAddress,
          timestamp: now,
          entity_type: 'CustomerAccount',
          entity_id: savedAccount._id,
          status: 'SUCCESS',
          account_no: savedAccount.ACCT_NO,
          description: `Created ${normalizedAccountType} account for customer ${CUST_ID}`,
        }], { session });
      } catch (auditError) {
        logger.error('Failed to create audit trail for account creation', {
          error: auditError.message,
          account: savedAccount.ACCT_NO,
          timestamp: now,
        });
      }
    }

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: 'Customer accounts created successfully',
      count: createdAccounts.length,
      accounts: createdAccounts,
      note: createdAccounts.some(acc => !req.body.some(b => b.ACCT_NO === acc.ACCT_NO)) 
        ? 'Some account numbers were auto-generated' 
        : 'All account numbers were provided'
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating customer accounts:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date(),
    });

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error',
        error: error.keyValue,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating the customer accounts',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// Alternative simplified account creation with auto-numbers
export const createCustomerAccountWithAutoNumbers = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { CUST_ID, ACCOUNT_TYPE = 'SAVINGS', ...otherData } = req.body;

    // Validate required fields
    if (!CUST_ID || !otherData.ACCT_NM || !otherData.BU_ID) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'CUST_ID, ACCT_NM, and BU_ID are required.',
      });
    }

    // Generate account numbers
    const { ACCT_NO, ACCT_ID } = await generateAccountNumberForCustomer(CUST_ID, ACCOUNT_TYPE);

    // Create the account
    const newAccount = new CustomerAccount({
      ...otherData,
      CUST_ID: Number(CUST_ID),
      ACCT_NO,
      ACCT_ID,
      ACCOUNT_TYPE: ACCOUNT_TYPE.toUpperCase(),
      LEDGER_BAL: mongoose.Types.Decimal128.fromString('0.00'),
      CLEARED_BAL: mongoose.Types.Decimal128.fromString('0.00'),
      AVAILABLE_BALANCE: mongoose.Types.Decimal128.fromString('0.00'),
      lastActivityDate: new Date(),
      DR_ALLOWED: true,
      CR_ALLOWED: true,
      REC_ST: 'ACTIVE',
    });

    const savedAccount = await newAccount.save({ session });
    
    // Audit trail
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    
    await AuditTrail.create([{
      event_id: Date.now(),
      user_id: userId,
      event_type: 'CUSTOMER_ACCOUNT_CREATE',
      action: 'Create Account',
      old_value: null,
      new_value: savedAccount.toObject(),
      ip_address: ipAddress,
      timestamp: new Date(),
      entity_type: 'CustomerAccount',
      entity_id: savedAccount._id,
      status: 'SUCCESS',
      account_no: savedAccount.ACCT_NO,
      description: `Created ${ACCOUNT_TYPE} account for customer ${CUST_ID}`,
    }], { session });

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: savedAccount,
      note: 'Account number was auto-generated'
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error creating account:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error',
        error: error.keyValue,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create account',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Get all customer accounts
export const getAllCustomerAccounts = async (req, res) => {
  try {
    const accounts = await CustomerAccount.find();
    return res.status(200).json({
      success: true,
      message: 'Customer accounts retrieved successfully',
      count: accounts.length,
      accounts,
    });
  } catch (error) {
    logger.error('Error fetching customer accounts:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date(),
    });
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching the customer accounts',
      error: error.message,
    });
  }
};

// Enhanced getCustomerAccountByCUST_ID that handles both legacy and new accounts
// Enhanced getCustomerAccountByCUST_ID that handles both legacy and new accounts
export const getCustomerAccountByCUST_ID = async (req, res) => {
    const { CUST_ID } = req.params;
    
    try {
        if (!CUST_ID) {
            return res.status(400).json({
                success: false,
                message: 'CUST_ID parameter is required',
            });
        }

        console.log(`🔍 Searching for customer accounts with identifier: ${CUST_ID}`);
        
        // Generate multiple formats for searching
        const originalId = CUST_ID.toString().trim();
        const cleanId = originalId.replace(/^0+/, '');
        const numericId = parseInt(cleanId, 10) || 0;
        const paddedId = originalId.padStart(10, '0');

        console.log(`📋 Search formats: original=${originalId}, clean=${cleanId}, numeric=${numericId}, padded=${paddedId}`);

        // Build comprehensive search query for BOTH legacy and new account formats
        const searchQuery = {
            $or: [
                // Legacy format searches (using CUST_ID as string/number)
                { CUST_ID: originalId },
                { CUST_ID: cleanId },
                { CUST_ID: numericId.toString() },
                { CUST_ID: paddedId },
                
                // New format searches (using customer_id as number)
                { customer_id: numericId },
                { customer_id: parseInt(originalId) || 0 },
                
                // Direct account number searches (if someone passes account number instead of customer ID)
                { account_number: originalId },
                { account_number: paddedId },
                { ACCT_NO: originalId },
                { ACCT_NO: paddedId }
            ].filter(condition => {
                const values = Object.values(condition);
                return !values.some(val => val === null || val === undefined || (typeof val === 'number' && isNaN(val)));
            })
        };

        console.log('🔎 Search query:', JSON.stringify(searchQuery, null, 2));

        // Find all accounts for the given customer ID
        const accounts = await CustomerAccount.find(searchQuery)
            .select('account_number ACCT_NO ACCT_NM customer_id CUST_ID customer_code status REC_ST product_type PRODUCT_TYPE ACCOUNT_TYPE branch currency opening_amount cleared_balance ledger_balance LEDGER_BAL AVAILABLE_BALANCE CLEARED_BAL PRODUCT_DESC BU_ID OPENED_DT dv_account_name account_name')
            .lean();

        console.log(`📊 Found ${accounts.length} accounts for customer ${CUST_ID}`);

        if (!accounts || accounts.length === 0) {
            // Enhanced debugging
            const sampleAccounts = await CustomerAccount.aggregate([
                { $sample: { size: 5 } },
                { 
                    $project: {
                        account_number: 1,
                        ACCT_NO: 1,
                        customer_id: 1,
                        CUST_ID: 1,
                        ACCT_NM: 1,
                        account_name: 1,
                        dv_account_name: 1,
                        product_type: 1,
                        status: 1,
                        REC_ST: 1
                    }
                }
            ]);

            return res.status(404).json({
                success: false,
                message: `No accounts found for identifier: ${originalId}`,
                searched_identifier: originalId,
                sample_accounts: sampleAccounts,
                troubleshooting: [
                    'Check if customer has any accounts in the system',
                    'Verify the customer ID format matches account records',
                    'Try using customer_id as a number (without leading zeros)',
                    'Check both customer_id (Number) and CUST_ID (String) fields'
                ]
            });
        }

        // Get customer details - try to get name from Customer collection
        const customerSearchQuery = {
            $or: [
                { CUST_ID: originalId },
                { CUST_ID: cleanId },
                { CUST_ID: numericId.toString() },
                { CUST_ID: paddedId },
                { customer_id: numericId },
                { customer_id: parseInt(originalId) || 0 }
            ].filter(condition => {
                const values = Object.values(condition);
                return !values.some(val => val === null || val === undefined || (typeof val === 'number' && isNaN(val)));
            })
        };

        const customer = await Customer.findOne(customerSearchQuery)
            .select('CUST_ID customer_id FIRST_NAME LAST_NAME FULL_NAME email phone address')
            .lean();

        // Process accounts for consistent response format
        const processedAccounts = accounts.map(account => {
            // Determine account number (prioritize new format, fallback to legacy)
            const accountNumber = account.account_number || account.ACCT_NO;
            
            // Try multiple sources for account name in order of preference:
            // 1. Customer first + last name from Customer collection
            // 2. Customer FULL_NAME from Customer collection
            // 3. ACCT_NM from account
            // 4. account_name from account
            // 5. dv_account_name from account
            // 6. Fallback to "Customer {CUST_ID} Account"
            
            let accountName = 'Account';
            
            // First, try to get from Customer collection
            if (customer) {
                if (customer.FIRST_NAME || customer.LAST_NAME) {
                    accountName = `${customer.FIRST_NAME || ''} ${customer.LAST_NAME || ''}`.trim();
                } else if (customer.FULL_NAME) {
                    accountName = customer.FULL_NAME;
                }
            }
            
            // If still default, try account fields
            if (accountName === 'Account') {
                if (account.ACCT_NM && account.ACCT_NM.trim() !== '' && account.ACCT_NM !== 'Account') {
                    accountName = account.ACCT_NM;
                } else if (account.account_name && account.account_name.trim() !== '' && account.account_name !== 'Account') {
                    accountName = account.account_name;
                } else if (account.dv_account_name && account.dv_account_name.trim() !== '' && account.dv_account_name !== 'Account') {
                    accountName = account.dv_account_name;
                }
            }
            
            // Final fallback
            if (accountName === 'Account' || accountName.trim() === '') {
                const customerId = account.customer_id || account.CUST_ID || CUST_ID;
                accountName = `Customer ${customerId}`;
            }
            
            // Determine balances (handle both formats)
            const ledgerBalance = parseFloat(account.ledger_balance || account.LEDGER_BAL || 0);
            const availableBalance = parseFloat(account.available_balance || account.AVAILABLE_BALANCE || ledgerBalance);
            const clearedBalance = parseFloat(account.cleared_balance || account.CLEARED_BAL || ledgerBalance);
            
            // Determine status
            const status = account.status || account.REC_ST || 'Active';
            
            // Determine product type
            const productType = account.product_type || account.PRODUCT_TYPE || account.ACCOUNT_TYPE || 'SAVINGS';
            
            return {
                // Primary identifiers
                account_number: accountNumber,
                account_name: accountName,
                customer_id: account.customer_id,
                CUST_ID: account.CUST_ID,
                
                // Name source information (for debugging)
                name_source: customer ? 'customer_collection' : 
                            account.ACCT_NM ? 'ACCT_NM' : 
                            account.account_name ? 'account_name' : 
                            account.dv_account_name ? 'dv_account_name' : 'fallback',
                
                // Status and type
                status: status,
                product_type: productType,
                product_description: account.PRODUCT_DESC,
                
                // Balances
                ledger_balance: ledgerBalance,
                available_balance: availableBalance,
                cleared_balance: clearedBalance,
                
                // Additional info
                branch: account.branch || account.BU_ID,
                currency: account.currency || 'NGN',
                opened_date: account.opened_date || account.OPENED_DT,
                
                // Source identification
                is_legacy_account: !!account.ACCT_NO && !account.account_number,
                is_new_account: !!account.account_number,
                
                // Raw fields for debugging
                raw_ACCT_NM: account.ACCT_NM,
                raw_account_name: account.account_name,
                raw_dv_account_name: account.dv_account_name,
                has_customer_data: !!customer
            };
        });

        // Calculate summary statistics
        const totalBalance = processedAccounts.reduce((sum, account) => {
            return sum + account.ledger_balance;
        }, 0);

        const activeAccounts = processedAccounts.filter(account => {
            const status = account.status;
            return ['ACTIVE', 'Active', 'active', 'A', 'OPEN'].includes(status);
        });

        // Group by account type
        const accountsByType = processedAccounts.reduce((acc, account) => {
            const type = account.product_type || 'Unknown';
            if (!acc[type]) acc[type] = [];
            acc[type].push(account);
            return acc;
        }, {});

        return res.status(200).json({
            success: true,
            message: 'Customer accounts retrieved successfully',
            count: processedAccounts.length,
            summary: {
                total_balance: totalBalance,
                active_accounts: activeAccounts.length,
                total_accounts: processedAccounts.length,
                legacy_accounts: processedAccounts.filter(acc => acc.is_legacy_account).length,
                new_accounts: processedAccounts.filter(acc => acc.is_new_account).length
            },
            customer: customer || null,
            accounts: processedAccounts,
            accounts_by_type: accountsByType,
            search_details: {
                searched_identifier: originalId,
                actual_search_used: {
                    as_number: numericId,
                    as_string: originalId
                }
            }
        });
    } catch (error) {
        console.error('❌ Error fetching customer accounts:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching customer accounts',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Update a customer account by account number
export const updateCustomerAccount = async (req, res) => {
  const { ACCT_NO } = req.params;
  const { CUST_ID, ACCT_NM, BU_ID, ACCOUNT_TYPE, PRODUCT_DESC, REC_ST, INTEREST_GL_ACCT_NO, DR_ALLOWED, CR_ALLOWED } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate ACCT_NO
    if (!/^\d{10}$/.test(ACCT_NO)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'ACCT_NO must be a 10-digit number.' });
    }

    // Validate required fields
    if (!CUST_ID || !ACCT_NM || !BU_ID) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'CUST_ID, ACCT_NM, and BU_ID are required.' });
    }

    // Check customer exists (number or padded string)
    const customerExists = await Customer.exists({
      $or: [
        { CUST_ID: Number(CUST_ID) },
        { CUST_ID: String(CUST_ID).padStart(10, '0') }
      ]
    }).session(session);

    if (!customerExists) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Customer does not exist', CUST_ID });
    }

    // Validate ACCOUNT_TYPE
    const VALID_ACCOUNT_TYPES = ['SAVINGS', 'CURRENT', 'FIXED_DEPOSIT', 'LOAN', 'CREDIT_CARD'];
    const normalizedAccountType = ACCOUNT_TYPE?.toUpperCase();
    if (normalizedAccountType && !VALID_ACCOUNT_TYPES.includes(normalizedAccountType)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid ACCOUNT_TYPE. Must be one of ${VALID_ACCOUNT_TYPES.join(', ')}`,
      });
    }

    // Validate REC_ST
    const VALID_REC_ST = ['ACTIVE', 'DORMANT', 'SUSPENDED', 'CLOSED', 'INACTIVE'];
    const normalizedRecSt = REC_ST?.toUpperCase();
    if (normalizedRecSt && !VALID_REC_ST.includes(normalizedRecSt)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid REC_ST. Must be one of ${VALID_REC_ST.join(', ')}`,
      });
    }

    // Validate INTEREST_GL_ACCT_NO if provided
    if (INTEREST_GL_ACCT_NO && !/^\d-\d{2,3}-\d{3}-\d{3}-\d{3}-\d$/.test(INTEREST_GL_ACCT_NO)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid INTEREST_GL_ACCT_NO format: ${INTEREST_GL_ACCT_NO}. Expected format: 1-XX-XXX-XXX-XXX-X or 1-XXX-XXX-XXX-XXX-X`,
      });
    }

    // Validate GL account existence if INTEREST_GL_ACCT_NO is provided
    if (INTEREST_GL_ACCT_NO) {
      const glAccount = await GLAccount.findOne({ GL_ACCT_NO: INTEREST_GL_ACCT_NO }).session(session);
      if (!glAccount) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `GL Account ${INTEREST_GL_ACCT_NO} not found`,
        });
      }
    }

    // Prevent balance updates
    if (req.body.LEDGER_BAL || req.body.CLEARED_BAL || req.body.AVAILABLE_BALANCE) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Balance fields (LEDGER_BAL, CLEARED_BAL, AVAILABLE_BALANCE) cannot be updated directly. Use transactions.',
      });
    }

    // Find existing account
    const existingAccount = await CustomerAccount.findOne({ ACCT_NO }).session(session);
    if (!existingAccount) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Customer account not found' });
    }

    // Determine DR_ALLOWED and CR_ALLOWED
    let finalDRAllowed = existingAccount.DR_ALLOWED;
    let finalCRAllowed = existingAccount.CR_ALLOWED;
    if (normalizedAccountType) {
      // Set defaults based on ACCOUNT_TYPE if provided
      finalDRAllowed = normalizedAccountType !== 'FIXED_DEPOSIT';
      finalCRAllowed = true;
    }
    // Override with explicit values if provided
    if (DR_ALLOWED !== undefined) {
      finalDRAllowed = Boolean(DR_ALLOWED);
    }
    if (CR_ALLOWED !== undefined) {
      finalCRAllowed = Boolean(CR_ALLOWED);
    }

    // Prevent DR_ALLOWED: true for FIXED_DEPOSIT unless explicitly allowed
    if (normalizedAccountType === 'FIXED_DEPOSIT' && finalDRAllowed === true) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'DR_ALLOWED cannot be true for FIXED_DEPOSIT accounts',
      });
    }

    // Build updateData
    const updateData = {
      CUST_ID: Number(CUST_ID),
      ACCT_NM,
      BU_ID: String(BU_ID).padStart(3, '0'),
      ACCOUNT_TYPE: normalizedAccountType || existingAccount.ACCOUNT_TYPE,
      PRODUCT_DESC: PRODUCT_DESC || existingAccount.PRODUCT_DESC,
      REC_ST: normalizedRecSt || existingAccount.REC_ST,
      INTEREST_GL_ACCT_NO: INTEREST_GL_ACCT_NO || existingAccount.INTEREST_GL_ACCT_NO,
      DR_ALLOWED: finalDRAllowed,
      CR_ALLOWED: finalCRAllowed,
      lastActivityDate: new Date(),
    };

    // Update account
    const updatedAccount = await CustomerAccount.findOneAndUpdate(
      { ACCT_NO },
      updateData,
      { new: true, session }
    );

    // Audit trail
    await AuditTrail.create([{
      event_id: Date.now(),
      user_id: req.user?.id || req.headers['x-user-id'] || 'system',
      event_type: 'CUSTOMER_ACCOUNT_UPDATE',
      action: 'Update Account',
      old_value: existingAccount.toObject(),
      new_value: updatedAccount.toObject(),
      ip_address: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      timestamp: new Date(),
      entity_type: 'CustomerAccount',
      entity_id: updatedAccount._id,
      status: 'SUCCESS',
      account_no: ACCT_NO,
      description: 'Updated customer account details',
    }], { session });

    await session.commitTransaction();
    return res.status(200).json({ success: true, message: 'Customer account updated successfully', account: updatedAccount });

  } catch (error) {
    await session.abortTransaction();
    logger.error('Error updating customer account:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      params: req.params,
      timestamp: new Date(),
    });

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error',
        error: error.keyValue,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating the customer account',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};


// Get account details by account number
export const getAccountByNumber = async (req, res) => {
    const { accountNumber } = req.params;
    
    try {
        if (!accountNumber) {
            return res.status(400).json({
                success: false,
                message: 'Account number parameter is required',
            });
        }

        console.log(`🔍 Searching for account: ${accountNumber}`);
        
        // Search in both legacy and new account number fields
        const account = await CustomerAccount.findOne({
            $or: [
                { ACCT_NO: accountNumber },
                { account_number: accountNumber }
            ]
        })
        .select('account_number ACCT_NO ACCT_NM customer_id CUST_ID customer_code status REC_ST product_type PRODUCT_TYPE ACCOUNT_TYPE branch currency opening_amount cleared_balance ledger_balance LEDGER_BAL AVAILABLE_BALANCE CLEARED_BAL PRODUCT_DESC BU_ID OPENED_DT dv_account_name account_name customer_name name FULL_NAME FIRST_NAME LAST_NAME')
        .lean();

        if (!account) {
            return res.status(404).json({
                success: false,
                message: `Account not found: ${accountNumber}`,
                searched_fields: ['ACCT_NO', 'account_number']
            });
        }

        // Get customer details for name
        const customer = await Customer.findOne({
            $or: [
                { CUST_ID: account.CUST_ID },
                { customer_id: account.customer_id }
            ]
        })
        .select('CUST_ID customer_id FIRST_NAME LAST_NAME FULL_NAME email phone address')
        .lean();

        // Determine account name
        let accountName = '';
        
        // First, try customer name
        if (customer) {
            if (customer.FIRST_NAME || customer.LAST_NAME) {
                accountName = `${customer.FIRST_NAME || ''} ${customer.LAST_NAME || ''}`.trim();
            } else if (customer.FULL_NAME) {
                accountName = customer.FULL_NAME;
            }
        }
        
        // If no customer name, try account fields
        if (!accountName || accountName.trim() === '') {
            const nameFields = [
                account.ACCT_NM,
                account.account_name,
                account.customer_name,
                account.name,
                account.FULL_NAME,
                account.dv_account_name,
                `${account.FIRST_NAME || ''} ${account.LAST_NAME || ''}`.trim()
            ];
            
            for (const field of nameFields) {
                if (field && field.trim() !== '' && field !== 'Account' && field !== 'account') {
                    accountName = field;
                    break;
                }
            }
        }
        
        // Final fallback
        if (!accountName || accountName.trim() === '' || accountName === 'Account') {
            const customerId = account.customer_id || account.CUST_ID || 'Unknown';
            accountName = `Customer ${customerId}`;
        }

        // Format balances
        const ledgerBalance = parseFloat(account.ledger_balance || account.LEDGER_BAL || 0);
        const availableBalance = parseFloat(account.available_balance || account.AVAILABLE_BALANCE || ledgerBalance);
        const clearedBalance = parseFloat(account.cleared_balance || account.CLEARED_BAL || ledgerBalance);

        const responseData = {
            success: true,
            message: 'Account retrieved successfully',
            data: {
                account_number: account.account_number || account.ACCT_NO,
                account_name: accountName,
                customer_id: account.customer_id,
                CUST_ID: account.CUST_ID,
                customer_code: account.customer_code,
                status: account.status || account.REC_ST || 'Active',
                product_type: account.product_type || account.PRODUCT_TYPE || account.ACCOUNT_TYPE || 'SAVINGS',
                product_description: account.PRODUCT_DESC,
                ledger_balance: ledgerBalance,
                available_balance: availableBalance,
                cleared_balance: clearedBalance,
                branch: account.branch || account.BU_ID,
                currency: account.currency || 'NGN',
                opened_date: account.opened_date || account.OPENED_DT,
                is_legacy_account: !!account.ACCT_NO && !account.account_number,
                is_new_account: !!account.account_number,
                has_customer_data: !!customer
            }
        };

        return res.status(200).json(responseData);
        
    } catch (error) {
        console.error('❌ Error fetching account:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching account',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};


// Delete a customer account by account number
export const deleteCustomerAccount = async (req, res) => {
  const { ACCT_NO } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate ACCT_NO
    if (!/^\d{10}$/.test(ACCT_NO)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'ACCT_NO must be a 10-digit number.',
      });
    }

    const deletedAccount = await CustomerAccount.findOneAndDelete({ ACCT_NO }, { session });
    if (!deletedAccount) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Customer account not found',
      });
    }

    // Record audit trail
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();

    await AuditTrail.create(
      [{
        event_id: Date.now(),
        user_id: userId,
        event_type: 'CUSTOMER_ACCOUNT_DELETE',
        action: 'Delete Account',
        old_value: deletedAccount.toObject(),
        new_value: null,
        ip_address: ipAddress,
        timestamp: now,
        entity_type: 'CustomerAccount',
        entity_id: deletedAccount._id,
        status: 'SUCCESS',
        account_no: ACCT_NO,
        description: 'Deleted customer account',
      }],
      { session }
    );

    await session.commitTransaction();
    return res.status(200).json({
      success: true,
      message: 'Customer account deleted successfully',
      account: deletedAccount,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error deleting customer account:', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      timestamp: new Date(),
    });

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error',
        error: error.keyValue,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the customer account',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// ------------------------------
// Update dormant accounts by inactivity
const INACTIVITY_PERIOD_MONTHS = 6;

export const updateDormantAccounts = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - INACTIVITY_PERIOD_MONTHS);

    const accountsToDormant = await CustomerAccount.find({
      REC_ST: 'ACTIVE',
      lastActivityDate: { $lt: cutoffDate },
    }).session(session);

    const updatedAccounts = [];
    for (const account of accountsToDormant) {
      const oldValue = account.toObject();
      account.REC_ST = 'DORMANT';
      await account.save({ session });
      updatedAccounts.push(account);

      await AuditTrail.create(
        [{
          event_id: Date.now(),
          user_id: 'system',
          event_type: 'CUSTOMER_ACCOUNT_UPDATE',
          action: 'Mark Account Dormant',
          old_value: oldValue,
          new_value: account.toObject(),
          ip_address: 'system',
          timestamp: new Date(),
          entity_type: 'CustomerAccount',
          entity_id: account._id,
          status: 'SUCCESS',
          account_no: account.ACCT_NO,
          description: `Account marked DORMANT due to inactivity for ${INACTIVITY_PERIOD_MONTHS} months`,
        }],
        { session }
      );

      logger.info(`Account ${account.ACCT_NO} marked as DORMANT due to inactivity.`);
    }

    await session.commitTransaction();
    logger.info(`Updated ${updatedAccounts.length} accounts to DORMANT status.`);
    return updatedAccounts;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error updating dormant accounts:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date(),
    });
    throw error;
  } finally {
    session.endSession();
  }
};




// Account Activation Controller - UPDATED FOR BOTH LEGACY AND NEW ACCOUNT TYPES
export const activateCustomerAccount = async (req, res) => {
  const { ACCT_NO } = req.params;
  const { activationReason, notes } = req.body;
  
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate ACCT_NO (10-digit number)
    if (!/^\d{10}$/.test(ACCT_NO)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'ACCT_NO must be a 10-digit number.',
      });
    }

    // Validate activation reason
    if (!activationReason || activationReason.trim() === '') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Activation reason is required.',
      });
    }

    // UPDATED: Find the account in BOTH legacy (ACCT_NO) and new (account_number) fields
    const account = await CustomerAccount.findOne({
      $or: [
        { ACCT_NO: ACCT_NO },           // Legacy accounts
        { account_number: ACCT_NO }     // New migrated accounts
      ]
    }).session(session);

    if (!account) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Customer account not found in either legacy or new account systems.',
        searched_fields: ['ACCT_NO', 'account_number'],
        account_number: ACCT_NO
      });
    }

    // Determine which field was matched for better response
    const matchedField = account.ACCT_NO === ACCT_NO ? 'ACCT_NO' : 
                        account.account_number === ACCT_NO ? 'account_number' : 'unknown';

    // Check if account is already active
    const currentStatus = account.REC_ST || account.status;
    if (currentStatus === 'ACTIVE' || currentStatus === 'Active') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Account is already active',
        account: {
          account_number: account.ACCT_NO || account.account_number,
          account_name: account.ACCT_NM || account.account_name,
          current_status: currentStatus,
          account_type: account.ACCOUNT_TYPE || account.product_type,
          matched_field: matchedField
        }
      });
    }

    // Validate that account can be activated
    const validPreviousStates = ['DORMANT', 'INACTIVE', 'SUSPENDED', 'dormant', 'inactive', 'suspended'];
    if (!validPreviousStates.includes(currentStatus)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Cannot activate account with status: ${currentStatus}. Only DORMANT, INACTIVE, or SUSPENDED accounts can be activated.`,
        currentStatus: currentStatus,
        matched_field: matchedField
      });
    }

    // Store old values for audit trail
    const oldValue = account.toObject();
    
    // UPDATED: Set status in both REC_ST (legacy) and status (new) fields
    account.REC_ST = 'ACTIVE';
    account.status = 'Active';
    account.lastActivityDate = new Date();
    account.last_updated = new Date();
    
    // If account was DORMANT, also reset any dormant-related flags if they exist
    if (currentStatus === 'DORMANT' || currentStatus === 'dormant') {
      // Reset any dormant-specific fields if they exist in your schema
      account.isDormant = false;
      account.dormantDate = null;
    }

    const updatedAccount = await account.save({ session });

    // Record audit trail
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();

    await AuditTrail.create([{
      event_id: Date.now(),
      user_id: userId,
      event_type: 'ACCOUNT_ACTIVATION',
      action: 'Activate Account',
      old_value: oldValue,
      new_value: updatedAccount.toObject(),
      ip_address: ipAddress,
      timestamp: now,
      entity_type: 'CustomerAccount',
      entity_id: updatedAccount._id,
      status: 'SUCCESS',
      account_no: ACCT_NO,
      description: `Account activated from ${currentStatus} to ACTIVE`,
      additional_info: {
        previous_status: currentStatus,
        new_status: 'ACTIVE',
        activation_reason: activationReason,
        notes: notes || '',
        activated_by: userId,
        activation_date: now,
        matched_field: matchedField,
        account_model: 'CustomerAccount',
        account_identifier: account.ACCT_NO || account.account_number
      }
    }], { session });

    await session.commitTransaction();

    // Log the activation
    logger.info('Account activated successfully', {
      account_number: ACCT_NO,
      previousStatus: currentStatus,
      activatedBy: userId,
      activationReason,
      matchedField,
      timestamp: now
    });

    return res.status(200).json({
      success: true,
      message: 'Account activated successfully',
      account: {
        account_number: account.ACCT_NO || account.account_number,
        account_name: account.ACCT_NM || account.account_name,
        account_type: account.ACCOUNT_TYPE || account.product_type,
        previous_status: currentStatus,
        new_status: 'ACTIVE',
        activation_date: now,
        activated_by: userId,
        matched_field: matchedField,
        account_model: 'CustomerAccount'
      },
      activation_details: {
        reason: activationReason,
        notes: notes || '',
        timestamp: now
      }
    });

  } catch (error) {
    await session.abortTransaction();
    
    logger.error('Error activating customer account:', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body,
      timestamp: new Date(),
    });

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error',
        error: error.keyValue,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while activating the customer account',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// UPDATED: Bulk Account Activation for multiple accounts - BOTH LEGACY AND NEW
export const bulkActivateAccounts = async (req, res) => {
  const { accountNumbers, activationReason, notes } = req.body;
  
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate input
    if (!Array.isArray(accountNumbers) || accountNumbers.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'accountNumbers must be a non-empty array of account numbers.',
      });
    }

    if (!activationReason || activationReason.trim() === '') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Activation reason is required for bulk activation.',
      });
    }

    // Validate all account numbers format
    const invalidAccounts = accountNumbers.filter(acctNo => !/^\d{10}$/.test(acctNo));
    if (invalidAccounts.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Invalid account number format',
        invalidAccounts,
        details: 'All account numbers must be 10-digit numbers.'
      });
    }

    // UPDATED: Find all accounts in BOTH legacy (ACCT_NO) and new (account_number) fields
    const accounts = await CustomerAccount.find({ 
      $or: [
        { ACCT_NO: { $in: accountNumbers } },           // Legacy accounts
        { account_number: { $in: accountNumbers } }     // New migrated accounts
      ]
    }).session(session);

    if (accounts.length === 0) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'No accounts found with the provided account numbers in either legacy or new account systems.',
      });
    }

    // Check for missing accounts
    const foundAccountNumbers = accounts.map(acc => acc.ACCT_NO || acc.account_number);
    const missingAccounts = accountNumbers.filter(acctNo => !foundAccountNumbers.includes(acctNo));
    
    if (missingAccounts.length > 0) {
      console.warn('Some accounts not found:', missingAccounts);
    }

    const activationResults = {
      activated: [],
      alreadyActive: [],
      cannotActivate: [],
      notFound: missingAccounts
    };

    const now = new Date();
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    // Process each account
    for (const account of accounts) {
      const oldValue = account.toObject();
      const currentStatus = account.REC_ST || account.status;
      const matchedField = account.ACCT_NO && accountNumbers.includes(account.ACCT_NO) ? 'ACCT_NO' : 
                          account.account_number && accountNumbers.includes(account.account_number) ? 'account_number' : 'unknown';

      // Skip if already active
      if (currentStatus === 'ACTIVE' || currentStatus === 'Active') {
        activationResults.alreadyActive.push({
          account_number: account.ACCT_NO || account.account_number,
          account_name: account.ACCT_NM || account.account_name,
          current_status: currentStatus,
          matched_field: matchedField
        });
        continue;
      }

      // Check if account can be activated
      const validPreviousStates = ['DORMANT', 'INACTIVE', 'SUSPENDED', 'dormant', 'inactive', 'suspended'];
      if (!validPreviousStates.includes(currentStatus)) {
        activationResults.cannotActivate.push({
          account_number: account.ACCT_NO || account.account_number,
          account_name: account.ACCT_NM || account.account_name,
          current_status: currentStatus,
          reason: `Cannot activate account with status: ${currentStatus}`,
          matched_field: matchedField
        });
        continue;
      }

      // Activate the account - update both legacy and new status fields
      account.REC_ST = 'ACTIVE';
      account.status = 'Active';
      account.lastActivityDate = now;
      account.last_updated = now;
      
      // Reset dormant flags if applicable
      if (currentStatus === 'DORMANT' || currentStatus === 'dormant') {
        account.isDormant = false;
        account.dormantDate = null;
      }

      const updatedAccount = await account.save({ session });

      activationResults.activated.push({
        account_number: account.ACCT_NO || account.account_number,
        account_name: account.ACCT_NM || account.account_name,
        previous_status: currentStatus,
        new_status: 'ACTIVE',
        matched_field: matchedField
      });

      // Create audit trail for each activated account
      await AuditTrail.create([{
        event_id: Date.now() + Math.random(), // Ensure unique event_id
        user_id: userId,
        event_type: 'BULK_ACCOUNT_ACTIVATION',
        action: 'Bulk Activate Account',
        old_value: oldValue,
        new_value: updatedAccount.toObject(),
        ip_address: ipAddress,
        timestamp: now,
        entity_type: 'CustomerAccount',
        entity_id: updatedAccount._id,
        status: 'SUCCESS',
        account_no: account.ACCT_NO || account.account_number,
        description: `Account activated from ${currentStatus} to ACTIVE (Bulk operation)`,
        additional_info: {
          previous_status: currentStatus,
          new_status: 'ACTIVE',
          activation_reason: activationReason,
          notes: notes || '',
          activated_by: userId,
          activation_date: now,
          bulk_operation: true,
          matched_field: matchedField,
          account_model: 'CustomerAccount'
        }
      }], { session });
    }

    await session.commitTransaction();

    // Log bulk activation results
    logger.info('Bulk account activation completed', {
      totalRequested: accountNumbers.length,
      activated: activationResults.activated.length,
      alreadyActive: activationResults.alreadyActive.length,
      cannotActivate: activationResults.cannotActivate.length,
      notFound: activationResults.notFound.length,
      activatedBy: userId,
      timestamp: now
    });

    return res.status(200).json({
      success: true,
      message: 'Bulk account activation completed',
      results: activationResults,
      summary: {
        total_requested: accountNumbers.length,
        successfully_activated: activationResults.activated.length,
        already_active: activationResults.alreadyActive.length,
        cannot_activate: activationResults.cannotActivate.length,
        not_found: activationResults.notFound.length
      },
      activation_details: {
        reason: activationReason,
        notes: notes || '',
        timestamp: now,
        performed_by: userId
      }
    });

  } catch (error) {
    await session.abortTransaction();
    
    logger.error('Error in bulk account activation:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred during bulk account activation',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// UPDATED: Get account activation history - BOTH LEGACY AND NEW
export const getAccountActivationHistory = async (req, res) => {
  const { ACCT_NO } = req.params;

  try {
    // Validate ACCT_NO
    if (!/^\d{10}$/.test(ACCT_NO)) {
      return res.status(400).json({
        success: false,
        message: 'ACCT_NO must be a 10-digit number.',
      });
    }

    // UPDATED: Check if account exists in BOTH legacy and new fields
    const account = await CustomerAccount.findOne({
      $or: [
        { ACCT_NO: ACCT_NO },
        { account_number: ACCT_NO }
      ]
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found in either legacy or new account systems.',
      });
    }

    const accountIdentifier = account.ACCT_NO || account.account_number;

    // Get activation history from audit trail
    const activationHistory = await AuditTrail.find({
      $or: [
        { account_no: ACCT_NO },
        { account_no: accountIdentifier },
        { 'additional_info.account_identifier': accountIdentifier }
      ],
      event_type: { $in: ['ACCOUNT_ACTIVATION', 'BULK_ACCOUNT_ACTIVATION'] }
    })
    .sort({ timestamp: -1 })
    .select('event_type action timestamp user_id description additional_info')
    .lean();

    return res.status(200).json({
      success: true,
      message: 'Account activation history retrieved successfully',
      account: {
        account_number: account.ACCT_NO || account.account_number,
        account_name: account.ACCT_NM || account.account_name,
        account_type: account.ACCOUNT_TYPE || account.product_type,
        current_status: account.REC_ST || account.status
      },
      activation_history: activationHistory,
      total_activations: activationHistory.length
    });

  } catch (error) {
    logger.error('Error fetching account activation history:', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching account activation history',
      error: error.message,
    });
  }
};

// Search customer accounts by multiple criteria
export const searchCustomerAccounts = async (req, res) => {
  try {
    const { 
      searchTerm, 
      accountNumber, 
      customerId, 
      firstName, 
      lastName, 
      customerName,
      status,
      accountType,
      branch,
      limit = 50,
      page = 1 
    } = req.query;

    const skip = (page - 1) * limit;
    
    // Build search query
    const searchQuery = {};
    
    // If a generic search term is provided, search across multiple fields
    if (searchTerm) {
      const term = searchTerm.trim();
      const numericTerm = parseInt(term) || 0;
      
      searchQuery.$or = [
        // Account number searches (both legacy and new formats)
        { ACCT_NO: term },
        { account_number: term },
        
        // Customer ID searches (both legacy and new formats)
        { CUST_ID: term },
        { customer_id: numericTerm },
        { customer_code: term },
        
        // Account name searches
        { ACCT_NM: { $regex: term, $options: 'i' } },
        
        // Customer name searches (need to join with Customer model)
        // We'll handle this separately in aggregation
      ];
    } else {
      // Specific field searches
      if (accountNumber) {
        searchQuery.$or = [
          { ACCT_NO: accountNumber.trim() },
          { account_number: accountNumber.trim() }
        ];
      }
      
      if (customerId) {
        const numericId = parseInt(customerId) || 0;
        const cleanId = customerId.toString().replace(/^0+/, '');
        
        searchQuery.$or = [
          { CUST_ID: customerId },
          { CUST_ID: numericId.toString() },
          { CUST_ID: cleanId },
          { customer_id: numericId },
          { customer_code: customerId }
        ];
      }
      
      if (firstName || lastName || customerName) {
        // We'll handle name searches separately in aggregation
      }
    }
    
    // Additional filters
    if (status) {
      searchQuery.$or = [
        { REC_ST: status.toUpperCase() },
        { status: status }
      ];
    }
    
    if (accountType) {
      searchQuery.$or = [
        { ACCOUNT_TYPE: accountType.toUpperCase() },
        { product_type: accountType }
      ];
    }
    
    if (branch) {
      searchQuery.$or = [
        { BU_ID: branch },
        { branch: parseInt(branch) || 0 }
      ];
    }
    
    // Build aggregation pipeline for complex search with customer name join
    const aggregationPipeline = [];
    
    // Add match stage if we have search criteria
    if (Object.keys(searchQuery).length > 0 && !(firstName || lastName || customerName)) {
      aggregationPipeline.push({ $match: searchQuery });
    }
    
    // Join with Customer collection to search by name
    aggregationPipeline.push({
      $lookup: {
        from: 'customers',
        let: {
          accountCustomerId: '$customer_id',
          accountCustId: '$CUST_ID'
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$customer_id', '$$accountCustomerId'] },
                  { $eq: ['$CUST_ID', '$$accountCustId'] }
                ]
              }
            }
          }
        ],
        as: 'customerInfo'
      }
    });
    
    // Add fields for customer name matching
    aggregationPipeline.push({
      $addFields: {
        customerFirstName: { $arrayElemAt: ['$customerInfo.FIRST_NAME', 0] },
        customerLastName: { $arrayElemAt: ['$customerInfo.LAST_NAME', 0] },
        customerFullName: { $arrayElemAt: ['$customerInfo.FULL_NAME', 0] },
        hasCustomerInfo: { $gt: [{ $size: '$customerInfo' }, 0] }
      }
    });
    
    // Apply name filters if provided
    if (firstName || lastName || customerName || searchTerm) {
      const nameConditions = [];
      
      if (firstName) {
        nameConditions.push({
          customerFirstName: { $regex: firstName, $options: 'i' }
        });
      }
      
      if (lastName) {
        nameConditions.push({
          customerLastName: { $regex: lastName, $options: 'i' }
        });
      }
      
      if (customerName) {
        nameConditions.push({
          $or: [
            { customerFullName: { $regex: customerName, $options: 'i' } },
            { ACCT_NM: { $regex: customerName, $options: 'i' } }
          ]
        });
      }
      
      // If searchTerm is provided, also search in customer names
      if (searchTerm) {
        const term = searchTerm.trim();
        nameConditions.push({
          $or: [
            { customerFirstName: { $regex: term, $options: 'i' } },
            { customerLastName: { $regex: term, $options: 'i' } },
            { customerFullName: { $regex: term, $options: 'i' } }
          ]
        });
      }
      
      if (nameConditions.length > 0) {
        aggregationPipeline.push({
          $match: {
            $or: [
              ...nameConditions,
              // Keep original matches if no name filters or searchTerm is provided
              ...(searchTerm ? [] : [searchQuery].filter(q => Object.keys(q).length > 0))
            ].filter(cond => cond !== undefined && Object.keys(cond).length > 0)
          }
        });
      }
    }
    
    // Project only necessary fields for response
    aggregationPipeline.push({
      $project: {
        // Account identifiers
        account_number: {
          $cond: {
            if: { $ne: ['$account_number', null] },
            then: '$account_number',
            else: '$ACCT_NO'
          }
        },
        account_name: '$ACCT_NM',
        customer_id: {
          $cond: {
            if: { $ne: ['$customer_id', null] },
            then: '$customer_id',
            else: { $toInt: '$CUST_ID' }
          }
        },
        customer_code: '$customer_code',
        
        // Customer information
        customer_first_name: '$customerFirstName',
        customer_last_name: '$customerLastName',
        customer_full_name: '$customerFullName',
        
        // Account details
        account_type: {
          $cond: {
            if: { $ne: ['$ACCOUNT_TYPE', null] },
            then: '$ACCOUNT_TYPE',
            else: '$product_type'
          }
        },
        product_description: '$PRODUCT_DESC',
        status: {
          $cond: {
            if: { $ne: ['$REC_ST', null] },
            then: '$REC_ST',
            else: '$status'
          }
        },
        
        // Balances
        ledger_balance: {
          $cond: {
            if: { $ne: ['$LEDGER_BAL', null] },
            then: { $toDouble: '$LEDGER_BAL' },
            else: { $toDouble: '$ledger_balance' }
          }
        },
        available_balance: {
          $cond: {
            if: { $ne: ['$AVAILABLE_BALANCE', null] },
            then: { $toDouble: '$AVAILABLE_BALANCE' },
            else: { $toDouble: '$available_balance' }
          }
        },
        cleared_balance: {
          $cond: {
            if: { $ne: ['$CLEARED_BAL', null] },
            then: { $toDouble: '$CLEARED_BAL' },
            else: { $toDouble: '$cleared_balance' }
          }
        },
        
        // Branch and dates
        branch: {
          $cond: {
            if: { $ne: ['$BU_ID', null] },
            then: '$BU_ID',
            else: { $toString: '$branch' }
          }
        },
        currency: '$currency',
        opened_date: {
          $cond: {
            if: { $ne: ['$creation_date', null] },
            then: '$creation_date',
            else: '$creation_datetime'
          }
        },
        last_activity_date: '$lastActivityDate',
        last_updated: '$last_updated',
        
        // Flags for identification
        is_legacy_account: { $ne: ['$ACCT_NO', null] },
        is_new_account: { $ne: ['$account_number', null] },
        has_customer_info: '$hasCustomerInfo'
      }
    });
    
    // Get total count
    const countPipeline = [...aggregationPipeline];
    countPipeline.push({ $count: 'total' });
    
    const countResult = await CustomerAccount.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;
    
    // Add pagination
    aggregationPipeline.push(
      { $skip: skip },
      { $limit: parseInt(limit) }
    );
    
    // Execute search
    const accounts = await CustomerAccount.aggregate(aggregationPipeline);
    
    // Calculate summary
    const activeAccounts = accounts.filter(acc => 
      ['ACTIVE', 'Active', 'active', 'A'].includes(acc.status)
    ).length;
    
    const totalBalance = accounts.reduce((sum, acc) => sum + (acc.ledger_balance || 0), 0);
    
    return res.status(200).json({
      success: true,
      message: 'Customer accounts search completed',
      search_criteria: {
        searchTerm: searchTerm || null,
        accountNumber: accountNumber || null,
        customerId: customerId || null,
        firstName: firstName || null,
        lastName: lastName || null,
        customerName: customerName || null,
        status: status || null,
        accountType: accountType || null,
        branch: branch || null
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      summary: {
        total_accounts_found: total,
        active_accounts: activeAccounts,
        total_balance: totalBalance,
        legacy_accounts: accounts.filter(acc => acc.is_legacy_account).length,
        new_accounts: accounts.filter(acc => acc.is_new_account).length,
        accounts_with_customer_info: accounts.filter(acc => acc.has_customer_info).length
      },
      accounts
    });
    
  } catch (error) {
    console.error('Error searching customer accounts:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while searching customer accounts',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

