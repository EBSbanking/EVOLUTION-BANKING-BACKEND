import mongoose from 'mongoose';
import CustomerAccount from '../models/CustomerAccount.js';
import Customer from '../models/Customer.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';
import SavingsProduct from '../models/SavingsProduct.js';
import GLAccount from '../models/GLAccount.js';

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
        
        // Generate multiple formats for searching - FIXED FOR NUMBER/STRING ISSUES
        const originalId = CUST_ID.toString().trim();
        const cleanId = originalId.replace(/^0+/, ''); // Remove leading zeros
        const numericId = parseInt(cleanId, 10) || 0; // Convert to number, default to 0 if invalid
        const paddedId = originalId.padStart(10, '0'); // Ensure 10-digit format
        
        console.log(`📋 Search formats: original=${originalId}, clean=${cleanId}, numeric=${numericId}, padded=${paddedId}`);

        // Build comprehensive search query that handles Number/String types correctly
        const searchQuery = {
            $or: [
                // Search by CUST_ID as String (if it exists as string in some docs)
                { CUST_ID: originalId },
                { CUST_ID: cleanId },
                { CUST_ID: numericId.toString() },
                { CUST_ID: paddedId },
                
                // Search by customer_id as Number (PRIMARY - matches your schema)
                { customer_id: numericId },
                // Also try parsing the original string as number
                { customer_id: parseInt(originalId) || 0 },
                
                // Search by account_number directly
                { account_number: originalId },
                { account_number: paddedId },
                
                // Legacy field searches
                { customer_code: originalId },
                { customer_code: cleanId },
                { customer_code: numericId.toString() }
            ].filter(condition => {
                // Filter out invalid conditions (like customer_id: NaN)
                const values = Object.values(condition);
                return !values.some(val => val === null || val === undefined || (typeof val === 'number' && isNaN(val)));
            })
        };

        console.log('🔎 Search query:', JSON.stringify(searchQuery, null, 2));

        // Find all accounts for the given customer ID in multiple formats
        const accounts = await CustomerAccount.find(searchQuery)
            .select('account_number ACCT_NO ACCT_NM customer_id CUST_ID customer_code status REC_ST product_type PRODUCT_TYPE ACCOUNT_TYPE branch currency opening_amount cleared_balance ledger_balance LEDGER_BAL AVAILABLE_BALANCE PRODUCT_DESC')
            .lean();

        if (!accounts || accounts.length === 0) {
            // Enhanced debugging: Check what accounts exist in the database
            const sampleAccounts = await CustomerAccount.find({})
                .select('account_number ACCT_NO customer_id CUST_ID ACCT_NM product_type status REC_ST')
                .limit(10)
                .lean();
            
            console.log('📊 Sample accounts in database:', sampleAccounts);
            
            // Also check if any accounts exist with similar customer_id
            const similarAccounts = await CustomerAccount.find({
                $or: [
                    { customer_id: { $gte: numericId - 100, $lte: numericId + 100 } },
                    { CUST_ID: { $regex: cleanId.slice(-4), $options: 'i' } }
                ]
            })
            .select('account_number ACCT_NO customer_id CUST_ID ACCT_NM')
            .limit(5)
            .lean();

            return res.status(404).json({
                success: false,
                message: `No accounts found for identifier: ${originalId}`,
                searched_identifier: originalId,
                searched_formats: {
                    as_string: [originalId, cleanId, numericId.toString(), paddedId],
                    as_number: [numericId, parseInt(originalId) || 'invalid'],
                    as_account_number: [originalId, paddedId]
                },
                sample_accounts: sampleAccounts,
                similar_accounts_found: similarAccounts,
                troubleshooting: [
                    'Check if customer has any accounts',
                    'Verify the identifier format matches account records',
                    'Try using customer_id as a number (without leading zeros)',
                    'Check both customer_id (Number) and CUST_ID (String) fields',
                    'Search by account_number directly if known'
                ]
            });
        }

        // Determine which fields and formats were matched
        const matchedFields = accounts.reduce((acc, account) => {
            // Check customer_id matches (as number)
            if (account.customer_id === numericId || account.customer_id === parseInt(originalId)) {
                acc.customer_id = account.customer_id;
            }
            // Check CUST_ID matches (as string)
            if (account.CUST_ID === originalId || account.CUST_ID === cleanId || account.CUST_ID === numericId.toString() || account.CUST_ID === paddedId) {
                acc.CUST_ID = account.CUST_ID;
            }
            // Check account_number matches
            if (account.account_number === originalId || account.account_number === paddedId) {
                acc.account_number = account.account_number;
            }
            return acc;
        }, {});

        console.log(`✅ Found ${accounts.length} accounts`);
        console.log(`📝 Matched fields:`, matchedFields);

        // Get customer details from multiple identifier fields
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
            .select('CUST_ID customer_id FIRST_NAME LAST_NAME email phone address')
            .lean();

        // Group accounts by matched field for better insight
        const accountsByMatchedField = accounts.reduce((acc, account) => {
            let matchedOn = [];
            
            // Check what field matched
            if (account.customer_id === numericId || account.customer_id === parseInt(originalId)) {
                matchedOn.push('customer_id');
            }
            if (account.CUST_ID === originalId || account.CUST_ID === cleanId || account.CUST_ID === numericId.toString() || account.CUST_ID === paddedId) {
                matchedOn.push('CUST_ID');
            }
            if (account.account_number === originalId || account.account_number === paddedId) {
                matchedOn.push('account_number');
            }
            
            const key = matchedOn.join('_') || 'unknown';
            if (!acc[key]) acc[key] = [];
            
            // Enhanced account information
            const enhancedAccount = {
                // Primary identifiers
                account_number: account.account_number || account.ACCT_NO,
                account_name: account.ACCT_NM,
                customer_id: account.customer_id,
                CUST_ID: account.CUST_ID,
                
                // Status and type
                status: account.status || account.REC_ST,
                product_type: account.product_type || account.PRODUCT_TYPE || account.ACCOUNT_TYPE,
                
                // Balances
                ledger_balance: account.ledger_balance || account.LEDGER_BAL,
                available_balance: account.AVAILABLE_BALANCE,
                cleared_balance: account.cleared_balance,
                
                // Additional info
                branch: account.branch,
                currency: account.currency,
                product_description: account.PRODUCT_DESC,
                
                // Match info
                matched_fields: matchedOn
            };
            
            acc[key].push(enhancedAccount);
            return acc;
        }, {});

        // Group accounts by product type
        const accountsByType = accounts.reduce((acc, account) => {
            const type = account.product_type || account.PRODUCT_TYPE || account.ACCOUNT_TYPE || 'Unknown';
            if (!acc[type]) acc[type] = [];
            
            acc[type].push({
                account_number: account.account_number || account.ACCT_NO,
                account_name: account.ACCT_NM,
                status: account.status || account.REC_ST,
                balance: account.ledger_balance || account.LEDGER_BAL,
                currency: account.currency
            });
            return acc;
        }, {});

        // Calculate summary statistics
        const totalBalance = accounts.reduce((sum, account) => {
            return sum + (parseFloat(account.ledger_balance || account.LEDGER_BAL || 0));
        }, 0);

        const activeAccounts = accounts.filter(account => {
            const status = account.status || account.REC_ST;
            return ['ACTIVE', 'Active', 'active', 'A', 'OPEN'].includes(status);
        });

        return res.status(200).json({
            success: true,
            message: 'Customer accounts retrieved successfully',
            count: accounts.length,
            summary: {
                total_balance: totalBalance,
                active_accounts: activeAccounts.length,
                total_accounts: accounts.length
            },
            customer: customer || null,
            matched_fields: matchedFields,
            accounts_by_matched_field: accountsByMatchedField,
            accounts_by_type: accountsByType,
            all_accounts: accounts.map(account => ({
                account_number: account.account_number || account.ACCT_NO,
                account_name: account.ACCT_NM,
                customer_id: account.customer_id,
                CUST_ID: account.CUST_ID,
                status: account.status || account.REC_ST,
                product_type: account.product_type || account.PRODUCT_TYPE,
                balance: parseFloat(account.ledger_balance || account.LEDGER_BAL || 0),
                available_balance: parseFloat(account.AVAILABLE_BALANCE || 0),
                currency: account.currency,
                branch: account.branch
            })),
            search_details: {
                searched_identifier: originalId,
                actual_search_used: {
                    as_number: numericId,
                    as_string: originalId
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
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
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

