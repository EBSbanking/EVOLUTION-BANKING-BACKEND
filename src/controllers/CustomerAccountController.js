import mongoose from 'mongoose';
import CustomerAccount from '../models/CustomerAccount.js';
import Customer from '../models/Customer.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';
import SavingsProduct from '../models/SavingsProduct.js';

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

      // ✅ Check for duplicate ACCT_NO
      if (ACCT_NO) {
        const existingAccount = await CustomerAccount.findOne({ ACCT_NO }).session(session);
        if (existingAccount) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: 'Account already exists',
            reason: `The account number ${ACCT_NO} already exists.`,
            account: ACCT_NO,
          });
        }
        if (!/^\d{10}$/.test(ACCT_NO)) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `ACCT_NO ${ACCT_NO} is not a valid account number. Must be 10 digits.`,
            account: ACCT_NO,
          });
        }
      }

      // ✅ Check for duplicate ACCT_ID
      if (ACCT_ID) {
        const existingAccountId = await CustomerAccount.findOne({ ACCT_ID }).session(session);
        if (existingAccountId) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: 'Account ID already exists',
            reason: `The account ID ${ACCT_ID} already exists.`,
            account: ACCT_NO || 'new account',
          });
        }
        if (!/^\d{6}$/.test(ACCT_ID)) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `ACCT_ID ${ACCT_ID} is not a valid account ID. Must be 6 digits.`,
            account: ACCT_NO || 'new account',
          });
        }
      }

      // ✅ Prevent direct balance initialization
      if (accountData.LEDGER_BAL || accountData.CLEARED_BAL || accountData.AVAILABLE_BALANCE) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Balance fields (LEDGER_BAL, CLEARED_BAL, AVAILABLE_BALANCE) cannot be set directly. Use transactions to update balances.',
          account: ACCT_NO || 'new account',
        });
      }

      // ✅ Create new account
      const newCustomerAccount = new CustomerAccount({
        CUST_ID: Number(CUST_ID),
        ACCT_NO,
        ACCT_ID,
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
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating customer accounts:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: now,
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

export const getCustomerAccountById = async (req, res) => {
  const { ACCT_NO } = req.params;
  try {
    if (!/^\d{10}$/.test(ACCT_NO)) {
      return res.status(400).json({
        success: false,
        message: 'ACCT_NO must be a 10-digit number.',
      });
    }

    // UPDATED: Explicitly select fields including ACCT_NM to ensure it's returned
    const account = await CustomerAccount.findOne({ ACCT_NO })
      .select('ACCT_NO ACCT_NM customer_id status product_type branch currency opening_amount cleared_balance ledger_balance REC_ST ACCOUNT_TYPE PRODUCT_DESC created_by last_updated')
      .lean(); // Use lean() for better performance if full doc not needed

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Customer account retrieved successfully',
      account,
    });
  } catch (error) {
    logger.error('Error fetching customer account:', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      timestamp: new Date(),
    });
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching the customer account',
      error: error.message,
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

// Get customer accounts by CUST_ID
// Get customer accounts by CUST_ID (handles multiple formats including legacy customer_id)
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
        const cleanId = originalId.replace(/^0+/, ''); // Remove leading zeros
        const numericId = parseInt(originalId, 10); // Convert to number
        
        console.log(`📋 Search formats: original=${originalId}, clean=${cleanId}, numeric=${numericId}`);

        // Build search query for multiple CUST_ID AND customer_id formats
        const searchQuery = {
            $or: [
                // Search by CUST_ID in multiple formats
                { CUST_ID: originalId },          // Try with original format "0000000057"
                { CUST_ID: cleanId },             // Try without leading zeros "57"
                { CUST_ID: numericId.toString() }, // Try as number string "57"
                
                // Search by legacy customer_id field
                { customer_id: numericId },       // Try as number 57
                { customer_id: parseInt(originalId) || 0 } // Try parsing original as number
            ]
        };

        console.log('🔎 Search query:', JSON.stringify(searchQuery, null, 2));

        // Find all accounts for the given customer ID in multiple formats
        const accounts = await CustomerAccount.find(searchQuery)
            .select('ACCT_NO ACCT_NM account_number customer_id CUST_ID customer_code status product_type branch currency opening_amount cleared_balance ledger_balance REC_ST ACCOUNT_TYPE PRODUCT_DESC created_by last_updated approval_date creation_datetime glAccounts productDetails')
            .lean();

        if (!accounts || accounts.length === 0) {
            // Enhanced debugging: Check what accounts exist in the database
            const sampleAccounts = await CustomerAccount.find({})
                .select('ACCT_NO account_number CUST_ID customer_id ACCT_NM product_type status')
                .limit(5)
                .lean();
            
            console.log('📊 Sample accounts in database:', sampleAccounts);
            
            return res.status(404).json({
                success: false,
                message: `No accounts found for identifier: ${originalId}`,
                searched_identifier: originalId,
                searched_formats: [
                    `CUST_ID: ${originalId}`,
                    `CUST_ID: ${cleanId}`,
                    `CUST_ID: ${numericId}`,
                    `customer_id: ${numericId}`,
                    `customer_id: ${parseInt(originalId) || 'invalid'}`
                ],
                sample_accounts: sampleAccounts,
                troubleshooting: [
                    'Check if customer has any accounts',
                    'Verify the identifier format matches account records',
                    'Try using different formats (with/without leading zeros)',
                    'Check both CUST_ID and customer_id fields'
                ]
            });
        }

        // Determine which fields and formats were matched
        const matchedFields = accounts.reduce((acc, account) => {
            if (account.CUST_ID === originalId || account.CUST_ID === cleanId || account.CUST_ID === numericId.toString()) {
                acc.CUST_ID = account.CUST_ID;
            }
            if (account.customer_id == numericId || account.customer_id == originalId) {
                acc.customer_id = account.customer_id;
            }
            return acc;
        }, {});

        console.log(`✅ Found ${accounts.length} accounts`);
        console.log(`📝 Matched fields:`, matchedFields);

        // Get customer details from both CUST_ID and legacy customer_id
        const customer = await Customer.findOne({
            $or: [
                { CUST_ID: originalId },
                { CUST_ID: cleanId },
                { CUST_ID: numericId.toString() },
                { legacy_customer_id: numericId },
                { customer_id: numericId }
            ]
        }).select('CUST_ID legacy_customer_id customer_id FIRST_NAME LAST_NAME email phone address');

        // Group accounts by matched field for better insight
        const accountsByMatchedField = accounts.reduce((acc, account) => {
            let matchedOn = [];
            
            if (account.CUST_ID === originalId || account.CUST_ID === cleanId || account.CUST_ID === numericId.toString()) {
                matchedOn.push('CUST_ID');
            }
            if (account.customer_id == numericId || account.customer_id == originalId) {
                matchedOn.push('customer_id');
            }
            
            const key = matchedOn.join('_') || 'unknown';
            if (!acc[key]) acc[key] = [];
            acc[key].push({
                ...account,
                matched_fields: matchedOn
            });
            return acc;
        }, {});

        // Group accounts by product type for better organization
        const accountsByType = accounts.reduce((acc, account) => {
            const type = account.product_type || account.ACCOUNT_TYPE || 'Unknown';
            if (!acc[type]) acc[type] = [];
            acc[type].push(account);
            return acc;
        }, {});

        return res.status(200).json({
            success: true,
            message: 'Customer accounts retrieved successfully',
            count: accounts.length,
            customer: customer || null,
            matched_fields: matchedFields,
            accounts_by_matched_field: accountsByMatchedField,
            accounts_by_type: accountsByType,
            accounts: accounts,
            search_details: {
                searched_identifier: originalId,
                searched_formats: {
                    CUST_ID: [originalId, cleanId, numericId.toString()],
                    customer_id: [numericId, parseInt(originalId) || 'invalid']
                },
                matched_fields: matchedFields
            }
        });
    } catch (error) {
        console.error('❌ Error fetching customer accounts:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching customer accounts',
            error: error.message,
        });
    }
};