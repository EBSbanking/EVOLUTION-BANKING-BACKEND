// src/controllers/ThriftController.js
import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import generateCustomerNumber from '../utils/generateCustomerNumber.js';
import { generateAccountIdentifiersFromCounter } from '../utils/generateAccountNumber.js';

// Import model loader functions
import { 
  initModels, 
  getCustomer, 
  getThrift, 
  getTransaction, 
  getUser, 
  getSequelize,
  areModelsInitialized 
} from '../utils/modelLoader.js';

// Initialize models on first use
let modelsInitialized = false;

async function ensureModelsInitialized() {
  if (!modelsInitialized) {
    console.log('🔄 Ensuring models are initialized...');
    
    try {
      // Initialize models
      await initModels();
      
      // Verify we have the models
      const Customer = getCustomer();
      const Thrift = getThrift();
      const Transaction = getTransaction();
      
      if (!Customer || !Thrift || !Transaction) {
        throw new Error('One or more models not available after initialization');
      }
      
      modelsInitialized = true;
      console.log('✅ Models ready for use');
    } catch (error) {
      console.error('❌ Failed to initialize models:', error);
      throw error;
    }
  }
}

class ThriftController {
  // ─────────────────────────────────────────────
  //  Create new thrift account + new customer
  // ─────────────────────────────────────────────
  static async createThriftAccount(req, res) {
    try {
      // Ensure models are initialized
      await ensureModelsInitialized();
      
      // Get models
      const Customer = getCustomer();
      const Thrift = getThrift();
      const Transaction = getTransaction();
      const User = getUser();
      const sequelize = getSequelize();
      
      // Validate models
      if (!Customer || typeof Customer.findOne !== 'function') {
        console.error('❌ Customer model not available');
        return res.status(500).json({
          success: false,
          error: 'Database configuration error',
          details: 'Customer model not available.'
        });
      }
      
      let t;
      
      try {
        t = await sequelize.transaction();
        
        const {
          FIRST_NAME,
          LASTNAME,
          FULL_NAME,
          initialAmount,
          COLLECTION_TYPE,
          address,
          phone,
          RELATIONSHIP_MANAGER,
          TRANSACTION_DATE,
          OPENED_DT,
          city,
          state,
          zipCode
        } = req.body;
        
        // ─── Validation ────────────────────────────────────────
        if (!FIRST_NAME?.trim() || !LASTNAME?.trim()) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            error: 'FIRST_NAME and LASTNAME are required',
          });
        }
        
        if (!initialAmount || Number(initialAmount) <= 0) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            error: 'initialAmount must be a positive number',
          });
        }
        
        const collectionType = COLLECTION_TYPE.toUpperCase().trim();
        const validTypes = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'];
        if (!validTypes.includes(collectionType)) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            error: `Invalid COLLECTION_TYPE. Allowed values: ${validTypes.join(', ')}`,
          });
        }
        
        const fullName = FULL_NAME?.trim() || `${FIRST_NAME.trim()} ${LASTNAME.trim()}`.trim();
        const txDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();
        const openDate = OPENED_DT ? new Date(OPENED_DT) : new Date();
        
        // ─── Generate identifiers ───────────────────────────────
        const { CUST_ID, CUST_NO } = await generateCustomerNumber();
        const { ACCT_NO, ACCT_ID } = await generateAccountIdentifiersFromCounter('1');
        
        console.log(`📊 Generated identifiers: CUST_ID=${CUST_ID}, ACCT_NO=${ACCT_NO}`);
        
        // Generate transaction identifiers - CORRECT TYPES FOR YOUR MODEL
        const timestamp = Date.now();
        const randomNum = Math.floor(Math.random() * 10000);
        
        // Get the next transaction identifier (INTEGER)
        const [lastTransaction] = await sequelize.query(
          'SELECT MAX(transaction_identifier) as max_id FROM transactions',
          { type: sequelize.QueryTypes.SELECT, transaction: t }
        );
        
        const nextTransactionId = (lastTransaction?.max_id || 0) + 1;
        
        // Generate identifiers with CORRECT TYPES:
        const TRANSACTION_IDENTIFIER = nextTransactionId; // INTEGER
        const EVENT_ID = nextTransactionId; // INTEGER (same as transaction identifier)
        const TRAN_JOURNAL_ID = `JRN${timestamp}${randomNum}`; // STRING - maps to journal_id column
        const REFERENCE = `THRIFT_${ACCT_NO}_${timestamp}`; // STRING
        const TRANSACTION_ID = `TXN${nextTransactionId.toString().padStart(10, '0')}`; // STRING
        
        console.log('Generated transaction IDs:', {
          TRANSACTION_IDENTIFIER,
          EVENT_ID,
          TRAN_JOURNAL_ID,
          REFERENCE,
          TRANSACTION_ID
        });
        
        // ─── Check for conflicts ────────────────────────────────
        const existingCustomer = await Customer.findOne({
          where: { CUST_ID },
          transaction: t,
        });
        
        if (existingCustomer) {
          await t.rollback();
          return res.status(409).json({
            success: false,
            error: 'Generated CUST_ID already exists',
          });
        }
        
        const existingThrift = await Thrift.findOne({
          where: { ACCT_NO },
          transaction: t,
        });
        
        if (existingThrift) {
          await t.rollback();
          return res.status(409).json({
            success: false,
            error: 'Generated ACCT_NO already exists',
          });
        }
        
        // ─── Prepare address object ─────────────────────────────
        let addressObj = null;
        if (address || city || state || zipCode) {
          try {
            addressObj = typeof address === 'string' ? JSON.parse(address) : address;
            if (!addressObj || typeof addressObj !== 'object') {
              addressObj = {};
            }
            // Add city, state, zipCode if provided
            if (city) addressObj.city = city;
            if (state) addressObj.state = state;
            if (zipCode) addressObj.zipCode = zipCode;
            if (!addressObj.country) addressObj.country = 'Nigeria';
          } catch {
            // If address is not JSON, create object from separate fields
            addressObj = {
              street: address || '',
              city: city || '',
              state: state || '',
              zipCode: zipCode || '',
              country: 'Nigeria'
            };
          }
        }
        
        // ─── Create customer ────────────────────────────────────
        console.log('Creating customer...');
        const customer = await Customer.create({
          CUST_ID,
          CUST_NO,
          FIRST_NAME,
          LAST_NAME: LASTNAME,
          CUST_NM: fullName,
          PHONE_NO: phone || null,
          HOME_ADDRESS: address || null,
          REC_ST: 'Active',
          OPENED_DT: openDate,
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction: t });
        
        if (!customer) {
          await t.rollback();
          return res.status(500).json({ 
            success: false, 
            error: 'Failed to create customer' 
          });
        }
        
        console.log(`✅ Customer created: ${CUST_ID}`);
        
        // ─── Create thrift account ──────────────────────────────
        console.log('Creating thrift account...');
        const thrift = await Thrift.create({
          CUST_ID,
          ACCT_NO,
          ACCT_ID,
          FIRST_NAME,
          LASTNAME,
          FULL_NAME: fullName,
          RELATIONSHIP_MANAGER: RELATIONSHIP_MANAGER || null,
          AMOUNT: parseFloat(initialAmount),
          ADDRESS: addressObj,
          COLLECTION_TYPE: collectionType,
          status: 'ACTIVE',
          opening_date: openDate,
          OPENED_DT: openDate,
          TRANSACTION_DATE: txDate,
          initial_amount: parseFloat(initialAmount),
          account_type: 'THRIFT',
          total_contributions: parseFloat(initialAmount),
          total_withdrawals: 0,
          notes: `Thrift account opened for ${fullName} with initial deposit of ${initialAmount}`,
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction: t });
        
        if (!thrift) {
          await t.rollback();
          return res.status(500).json({ 
            success: false, 
            error: 'Failed to create thrift account' 
          });
        }
        
        console.log(`✅ Thrift account created: ${ACCT_NO}`);
        
        // ─── Create opening transaction WITH CORRECT FIELD TYPES ─
        console.log('Creating transaction record...');
        
        // Prepare transaction data with ALL required fields
        const transactionData = {
          // Required integer fields (mapped to INTEGER columns)
          TRANSACTION_IDENTIFIER: TRANSACTION_IDENTIFIER, // INTEGER -> transaction_identifier
          EVENT_ID: EVENT_ID, // INTEGER -> event_id
          
          // Required string fields
          TRAN_JOURNAL_ID: TRAN_JOURNAL_ID, // STRING -> journal_id
          REFERENCE: REFERENCE, // STRING -> reference
          TRANSACTION_ID: TRANSACTION_ID, // STRING -> transaction_id
          
          // Other required fields
          ACCT_NO: ACCT_NO,
          ACCT_ID: ACCT_ID,
          BU_ID: 1,
          CUST_ID: CUST_ID,
          ACCT_NM: `${fullName} Thrift Account`,
          AMOUNT: parseFloat(initialAmount),
          transactionDirection: 'DEBIT',
          TRANSACTIONDATE: txDate,
          TRANSACTION_TYPE: 'DEPOSIT',
          description: `Thrift account opening – initial deposit for ${fullName}`,
          status: 'COMPLETED',
          createdBy: 'SYSTEM',
          currency: 'NGN',
          
          metadata: {
            direction: 'DEBIT',
            amountToBank: parseFloat(initialAmount),
            amountToCustomer: 0,
            reference: REFERENCE,
            customerName: fullName,
            collectionType: collectionType,
            relationshipManager: RELATIONSHIP_MANAGER,
            transactionType: 'OPENING_DEPOSIT'
          },
          created_at: new Date(),
          updated_at: new Date()
        };
        
        console.log('Transaction data to create:', JSON.stringify(transactionData, null, 2));
        
        const transactionRecord = await Transaction.create(transactionData, { transaction: t });
        
        console.log(`✅ Transaction created: ${REFERENCE}`);
        
        // ─── Calculate next collection date ─────────────────────
        let nextCollectionDate;
        const today = new Date();
        
        switch (collectionType) {
          case 'DAILY':
            nextCollectionDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
            break;
          case 'WEEKLY':
            nextCollectionDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
            break;
          case 'MONTHLY':
            nextCollectionDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
            break;
          case 'QUARTERLY':
            nextCollectionDate = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
            break;
          default:
            nextCollectionDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        }
        
        // Update thrift account with next collection date
        await Thrift.update(
          { 
            nextCollectionDate,
            updated_at: new Date()
          },
          { 
            where: { ACCT_NO },
            transaction: t 
          }
        );
        
        // ─── Get final data for response ────────────────────────
        
        // Refresh customer data
        const updatedCustomer = await Customer.findOne({
          where: { CUST_ID },
          transaction: t,
          attributes: ['CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM', 'PHONE_NO', 'HOME_ADDRESS', 'REC_ST', 'OPENED_DT']
        });
        
        // Refresh thrift account data
        const updatedThrift = await Thrift.findOne({
          where: { ACCT_NO },
          transaction: t,
          attributes: ['CUST_ID', 'ACCT_NO', 'ACCT_ID', 'FIRST_NAME', 'LASTNAME', 'FULL_NAME', 'RELATIONSHIP_MANAGER', 'AMOUNT', 'ADDRESS', 'COLLECTION_TYPE', 'status', 'OPENED_DT', 'TRANSACTION_DATE', 'initialAmount', 'accountType', 'totalContributions', 'totalWithdrawals', 'nextCollectionDate', 'notes', 'isActive']
        });
        
        await t.commit();
        console.log('✅ Transaction committed successfully');
        
        // ─── Helper function for safe date conversion ────────────
        const safeToISOString = (dateValue) => {
          if (!dateValue) return null;
          try {
            // If it's already a Date object
            if (dateValue instanceof Date && !isNaN(dateValue)) {
              return dateValue.toISOString();
            }
            // If it's a string or other value, try to convert it
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) {
              return date.toISOString();
            }
            return null;
          } catch (error) {
            console.error('Error converting date:', error, 'Value:', dateValue);
            return null;
          }
        };
        
        // ─── Log success ────────────────────────────────────────
        logger.info('Thrift account created successfully', {
          CUST_ID,
          ACCT_NO,
          ACCT_ID,
          customerName: fullName,
          initialAmount,
          collectionType,
          relationshipManager: RELATIONSHIP_MANAGER,
          transactionDate: txDate,
          nextCollectionDate,
          transactionId: TRANSACTION_IDENTIFIER,
          reference: REFERENCE
        });
        
        // ─── Return success response ────────────────────────────
        return res.status(201).json({
          success: true,
          message: 'Thrift account created successfully',
          data: {
            customer: {
              CUST_ID: updatedCustomer.CUST_ID,
              CUST_NO: updatedCustomer.CUST_NO,
              firstName: updatedCustomer.FIRST_NAME,
              lastName: updatedCustomer.LAST_NAME,
              fullName: updatedCustomer.CUST_NM || `${updatedCustomer.FIRST_NAME} ${updatedCustomer.LAST_NAME}`,
              phone: updatedCustomer.PHONE_NO || null,
              address: updatedCustomer.HOME_ADDRESS || null,
              status: updatedCustomer.REC_ST,
              openedDate: safeToISOString(updatedCustomer.OPENED_DT)
            },
            thriftAccount: {
              CUST_ID: updatedThrift.CUST_ID,
              ACCT_NO: updatedThrift.ACCT_NO,
              ACCT_ID: updatedThrift.ACCT_ID,
              firstName: updatedThrift.FIRST_NAME,
              lastName: updatedThrift.LASTNAME,
              fullName: updatedThrift.FULL_NAME,
              relationshipManager: updatedThrift.RELATIONSHIP_MANAGER || null,
              amount: parseFloat(updatedThrift.AMOUNT || 0),
              address: updatedThrift.ADDRESS,
              collectionType: updatedThrift.COLLECTION_TYPE,
              status: updatedThrift.status,
              openingDate: safeToISOString(updatedThrift.OPENED_DT),
              transactionDate: safeToISOString(updatedThrift.TRANSACTION_DATE),
              initialAmount: parseFloat(updatedThrift.initialAmount || 0),
              accountType: updatedThrift.accountType,
              totalContributions: parseFloat(updatedThrift.totalContributions || 0),
              totalWithdrawals: parseFloat(updatedThrift.totalWithdrawals || 0),
              nextCollectionDate: safeToISOString(updatedThrift.nextCollectionDate),
              isActive: updatedThrift.isActive,
              notes: updatedThrift.notes
            },
            transaction: {
              id: transactionRecord.id,
              transactionIdentifier: transactionRecord.TRANSACTION_IDENTIFIER,
              transactionId: transactionRecord.TRANSACTION_ID,
              eventId: transactionRecord.EVENT_ID,
              journalId: transactionRecord.TRAN_JOURNAL_ID,
              reference: transactionRecord.REFERENCE,
              amount: parseFloat(transactionRecord.AMOUNT || 0),
              type: transactionRecord.TRANSACTION_TYPE,
              status: transactionRecord.status,
              date: safeToISOString(transactionRecord.TRANSACTIONDATE),
              description: transactionRecord.description,
              direction: transactionRecord.transactionDirection
            },
            summary: {
              initialDeposit: parseFloat(initialAmount),
              thriftAccountBalance: parseFloat(updatedThrift.AMOUNT || 0),
              netTransfer: parseFloat(initialAmount),
              nextCollectionDate: safeToISOString(nextCollectionDate),
              collectionFrequency: collectionType,
              transactionIdentifier: TRANSACTION_IDENTIFIER,
              reference: REFERENCE
            }
          }
        });
        
      } catch (err) {
        if (t) {
          try {
            await t.rollback();
            console.log('🔄 Transaction rolled back');
          } catch (rollbackErr) {
            console.error('Rollback failed:', rollbackErr.message);
          }
        }
        
        // Log detailed error
        logger.error('createThriftAccount failed', { 
          error: err.message, 
          stack: err.stack,
          body: req.body,
          timestamp: new Date().toISOString()
        });
        
        // Check for specific errors
        let errorMessage = 'Failed to create thrift account';
        if (err.name === 'SequelizeUniqueConstraintError') {
          errorMessage = 'Account number already exists';
        } else if (err.name === 'SequelizeValidationError') {
          errorMessage = 'Validation error: ' + err.errors.map(e => e.message).join(', ');
        } else if (err.message.includes('foreign key constraint')) {
          errorMessage = 'Invalid customer reference';
        } else if (err.message.includes('ACCT_NO')) {
          errorMessage = 'Database column issue. Please sync database schema.';
        } else if (err.message.includes('toISOString')) {
          errorMessage = 'Date conversion error';
        }
        
        return res.status(500).json({ 
          success: false, 
          error: errorMessage,
          details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      
    } catch (initError) {
      console.error('❌ Model initialization error:', initError);
      return res.status(500).json({
        success: false,
        error: 'Database model initialization error',
        details: initError.message
      });
    }
  }


  // ─────────────────────────────────────────────
  // Helper function to generate transaction identifiers with CORRECT TYPES
  // ─────────────────────────────────────────────
  static async generateTransactionIdentifiers(prefix = 'THRIFT', transaction) {
    try {
      // Get the next transaction identifier
      const [lastTransaction] = await sequelize.query(
        'SELECT MAX(transaction_identifier) as max_id FROM transactions',
        { type: sequelize.QueryTypes.SELECT, transaction }
      );
      
      const nextTransactionId = (lastTransaction?.max_id || 0) + 1;
      const timestamp = Date.now();
      const randomNum = Math.floor(Math.random() * 10000);
      
      return {
        TRANSACTION_IDENTIFIER: nextTransactionId, // INTEGER
        EVENT_ID: nextTransactionId, // INTEGER
        TRAN_JOURNAL_ID: `JRN${timestamp}${randomNum}`, // STRING
        REFERENCE: `${prefix}_${timestamp}_${randomNum}`, // STRING
        TRANSACTION_ID: `TXN${nextTransactionId.toString().padStart(10, '0')}` // STRING
      };
    } catch (error) {
      console.error('Error generating transaction IDs:', error);
      // Fallback
      const fallbackId = Math.floor(Math.random() * 1000000);
      const timestamp = Date.now();
      
      return {
        TRANSACTION_IDENTIFIER: fallbackId,
        EVENT_ID: fallbackId,
        TRAN_JOURNAL_ID: `JRN${timestamp}`,
        REFERENCE: `${prefix}_${timestamp}`,
        TRANSACTION_ID: `TXN${fallbackId}`
      };
    }
  }

  // Update other methods to use the async generator
  static async createThriftAccountForExistingCustomer(req, res) {
    let t;
    
    try {
      console.log('🔄 Creating thrift account for existing customer...');
      
      t = await sequelize.transaction();
      
      const {
        CUST_ID,
        FULL_NAME: providedFullName,
        initialAmount,
        COLLECTION_TYPE,
        address,
        RELATIONSHIP_MANAGER,
        TRANSACTION_DATE,
        OPENED_DT
      } = req.body;

      // Validate required fields
      if (!CUST_ID || !initialAmount || !COLLECTION_TYPE) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: CUST_ID, initialAmount, COLLECTION_TYPE'
        });
      }

      // Validate initial amount
      if (Number(initialAmount) <= 0) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Initial amount must be greater than 0'
        });
      }

      // Set transaction date and opened date
      const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();
      const openedDate = OPENED_DT ? new Date(OPENED_DT) : new Date();

      // Validate relationship manager
      if (RELATIONSHIP_MANAGER) {
        const managerExists = await User.findOne({
          where: { code: RELATIONSHIP_MANAGER },
          transaction: t
        });
        if (!managerExists) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: 'Invalid relationship manager code'
          });
        }
      }

      // Validate customer exists
      const customer = await Customer.findOne({
        where: { CUST_ID },
        transaction: t
      });

      if (!customer) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Compute FULL_NAME if not provided
      const fullName = providedFullName || `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim();
      if (!fullName) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Full name cannot be empty'
        });
      }

      // Generate thrift account numbers
      const { ACCT_NO, ACCT_ID } = await generateAccountIdentifiersFromCounter('1');
      
      console.log(`📊 Generated account identifiers: ACCT_NO=${ACCT_NO}, ACCT_ID=${ACCT_ID}`);

      // Generate transaction identifiers WITH CORRECT TYPES
      const { 
        TRANSACTION_IDENTIFIER, 
        EVENT_ID, 
        TRAN_JOURNAL_ID, 
        REFERENCE,
        TRANSACTION_ID 
      } = await ThriftController.generateTransactionIdentifiers('THRIFT_EXIST', t);

      // Check if thrift account already exists
      const existingAccount = await Thrift.findOne({
        where: {
          CUST_ID,
          COLLECTION_TYPE: COLLECTION_TYPE.toUpperCase()
        },
        transaction: t
      });

      if (existingAccount) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Thrift account with ${COLLECTION_TYPE} collection type already exists for this customer`
        });
      }

      // Check if customer has sufficient balance
      if (customer.accountBalance < Number(initialAmount)) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance for initial thrift payment'
        });
      }

      // Create thrift account
      const thriftAccount = await Thrift.create({
        CUST_ID,
        ACCT_NO,
        ACCT_ID,
        FIRST_NAME: customer.FIRST_NAME,
        LASTNAME: customer.LAST_NAME,
        FULL_NAME: fullName,
        RELATIONSHIP_MANAGER: RELATIONSHIP_MANAGER || null,
        AMOUNT: Number(initialAmount),
        ADDRESS: address || customer.HOME_ADDRESS ? {
          street: address || customer.HOME_ADDRESS || '',
          city: '',
          state: '',
          zipCode: '',
          country: 'Nigeria'
        } : null,
        COLLECTION_TYPE: COLLECTION_TYPE.toUpperCase(),
        status: 'ACTIVE',
        openingDate: openedDate,
        OPENED_DT: openedDate,
        TRANSACTION_DATE: transactionDate,
        initialAmount: Number(initialAmount),
        accountType: 'THRIFT',
        totalContributions: Number(initialAmount),
        notes: `Thrift account opened for existing customer ${fullName} with initial deposit of ${initialAmount}`,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction: t });

      // Create transaction record WITH CORRECT TYPES
      const transactionRecord = await Transaction.create({
        // Required fields with correct types
        TRANSACTION_IDENTIFIER, // INTEGER
        EVENT_ID, // INTEGER
        TRAN_JOURNAL_ID, // STRING
        REFERENCE, // STRING
        TRANSACTION_ID, // STRING
        
        // Other required fields
        ACCT_NO,
        ACCT_ID,
        BU_ID: 1,
        CUST_ID,
        ACCT_NM: `${fullName} Thrift Account`,
        AMOUNT: Number(initialAmount),
        transactionDirection: 'DEBIT',
        TRANSACTIONDATE: transactionDate,
        TRANSACTION_TYPE: 'THRIFT_OPENING',
        description: 'Thrift account opening - First payment to bank',
        status: 'COMPLETED',
        createdBy: 'SYSTEM',
        currency: 'NGN',
        metadata: {
          collectionType: COLLECTION_TYPE,
          isFirstPayment: true,
          amountToBank: Number(initialAmount),
          amountToCustomer: 0,
          direction: 'DEBIT',
          balanceAfter: customer.accountBalance - Number(initialAmount),
          reference: REFERENCE,
          transactionDate: transactionDate,
          openedDate: openedDate
        },
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction: t });

      // Update customer balance
      await customer.update({
        accountBalance: customer.accountBalance - Number(initialAmount),
        updated_at: new Date()
      }, { transaction: t });

      await t.commit();

      logger.info(`Thrift account created for existing customer ${CUST_ID}`, {
        CUST_ID, ACCT_NO, ACCT_ID, initialAmount, COLLECTION_TYPE,
        customerName: fullName, RELATIONSHIP_MANAGER, transactionDate, openedDate,
        transactionId: TRANSACTION_IDENTIFIER, reference: REFERENCE
      });

    // ─── Return success response ────────────────────────────
return res.status(201).json({
  success: true,
  message: 'Thrift account created successfully',
  data: {
    customer: {
      CUST_ID: updatedCustomer.CUST_ID,
      CUST_NO: updatedCustomer.CUST_NO,
      firstName: updatedCustomer.FIRST_NAME,
      lastName: updatedCustomer.LAST_NAME,
      fullName: updatedCustomer.CUST_NM || `${updatedCustomer.FIRST_NAME} ${updatedCustomer.LAST_NAME}`,
      phone: updatedCustomer.PHONE_NO || null,
      address: updatedCustomer.HOME_ADDRESS || null,
      status: updatedCustomer.REC_ST,
      openedDate: updatedCustomer.OPENED_DT ? 
        (typeof updatedCustomer.OPENED_DT.toISOString === 'function' 
          ? updatedCustomer.OPENED_DT.toISOString() 
          : new Date(updatedCustomer.OPENED_DT).toISOString()) 
        : null
    },
    thriftAccount: {
      CUST_ID: updatedThrift.CUST_ID,
      ACCT_NO: updatedThrift.ACCT_NO,
      ACCT_ID: updatedThrift.ACCT_ID,
      firstName: updatedThrift.FIRST_NAME,
      lastName: updatedThrift.LASTNAME,
      fullName: updatedThrift.FULL_NAME,
      relationshipManager: updatedThrift.RELATIONSHIP_MANAGER || null,
      amount: parseFloat(updatedThrift.AMOUNT || 0),
      address: updatedThrift.ADDRESS,
      collectionType: updatedThrift.COLLECTION_TYPE,
      status: updatedThrift.status,
      openingDate: updatedThrift.OPENED_DT ? 
        (typeof updatedThrift.OPENED_DT.toISOString === 'function' 
          ? updatedThrift.OPENED_DT.toISOString() 
          : new Date(updatedThrift.OPENED_DT).toISOString()) 
        : null,
      transactionDate: updatedThrift.TRANSACTION_DATE ? 
        (typeof updatedThrift.TRANSACTION_DATE.toISOString === 'function' 
          ? updatedThrift.TRANSACTION_DATE.toISOString() 
          : new Date(updatedThrift.TRANSACTION_DATE).toISOString()) 
        : null,
      initialAmount: parseFloat(updatedThrift.initialAmount || 0),
      accountType: updatedThrift.accountType,
      totalContributions: parseFloat(updatedThrift.totalContributions || 0),
      totalWithdrawals: parseFloat(updatedThrift.totalWithdrawals || 0),
      nextCollectionDate: updatedThrift.nextCollectionDate ? 
        (typeof updatedThrift.nextCollectionDate.toISOString === 'function' 
          ? updatedThrift.nextCollectionDate.toISOString() 
          : new Date(updatedThrift.nextCollectionDate).toISOString()) 
        : null,
      isActive: updatedThrift.isActive,
      notes: updatedThrift.notes
    },
    transaction: {
      id: transactionRecord.id,
      transactionIdentifier: transactionRecord.TRANSACTION_IDENTIFIER,
      transactionId: transactionRecord.TRANSACTION_ID,
      eventId: transactionRecord.EVENT_ID,
      journalId: transactionRecord.TRAN_JOURNAL_ID,
      reference: transactionRecord.REFERENCE,
      amount: parseFloat(transactionRecord.AMOUNT || 0),
      type: transactionRecord.TRANSACTION_TYPE,
      status: transactionRecord.status,
      date: transactionRecord.TRANSACTIONDATE ? 
        (typeof transactionRecord.TRANSACTIONDATE.toISOString === 'function' 
          ? transactionRecord.TRANSACTIONDATE.toISOString() 
          : new Date(transactionRecord.TRANSACTIONDATE).toISOString()) 
        : null,
      description: transactionRecord.description,
      direction: transactionRecord.transactionDirection
    },
    summary: {
      initialDeposit: parseFloat(initialAmount),
      thriftAccountBalance: parseFloat(updatedThrift.AMOUNT || 0),
      netTransfer: parseFloat(initialAmount),
      nextCollectionDate: nextCollectionDate.toISOString(),
      collectionFrequency: collectionType,
      transactionIdentifier: TRANSACTION_IDENTIFIER,
      reference: REFERENCE
    }
  }
});

    } catch (error) {
      if (t && !t.finished) {
        await t.rollback();
      }
      logger.error('Error creating thrift account for existing customer:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }


  // Create thrift account for existing customer
  static async createThriftAccountForExistingCustomer(req, res) {
    try {
      // Ensure models are initialized
      await ensureModelsInitialized();
      
      let t;
      
      try {
        t = await sequelize.transaction();
        
        const {
          CUST_ID,
          FULL_NAME: providedFullName,
          initialAmount,
          COLLECTION_TYPE,
          address,
          RELATIONSHIP_MANAGER,
          TRANSACTION_DATE,
          OPENED_DT
        } = req.body;

        // Validate required fields
        if (!CUST_ID || !initialAmount || !COLLECTION_TYPE) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: 'Missing required fields: CUST_ID, initialAmount, COLLECTION_TYPE'
          });
        }

        // Validate initial amount
        if (Number(initialAmount) <= 0) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: 'Initial amount must be greater than 0'
          });
        }

        // Set transaction date and opened date
        const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();
        const openedDate = OPENED_DT ? new Date(OPENED_DT) : new Date();

        // Validate relationship manager
        if (RELATIONSHIP_MANAGER) {
          const managerExists = await User.findOne({
            where: { code: RELATIONSHIP_MANAGER },
            transaction: t
          });
          if (!managerExists) {
            await t.rollback();
            return res.status(400).json({
              success: false,
              message: 'Invalid relationship manager code'
            });
          }
        }

        // Validate customer exists
        const customer = await Customer.findOne({
          where: { CUST_ID },
          transaction: t
        });

        if (!customer) {
          await t.rollback();
          return res.status(404).json({
            success: false,
            message: 'Customer not found'
          });
        }

        // Compute FULL_NAME if not provided
        const fullName = providedFullName || `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim();
        if (!fullName) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: 'Full name cannot be empty'
          });
        }

        // Generate thrift account numbers
        const { ACCT_NO, ACCT_ID } = await generateAccountIdentifiersFromCounter('1');
        
        console.log(`📊 Generated account identifiers: ACCT_NO=${ACCT_NO}, ACCT_ID=${ACCT_ID}`);

        // Check if thrift account already exists
        const existingAccount = await Thrift.findOne({
          where: {
            CUST_ID,
            COLLECTION_TYPE: COLLECTION_TYPE.toUpperCase()
          },
          transaction: t
        });

        if (existingAccount) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: `Thrift account with ${COLLECTION_TYPE} collection type already exists for this customer`
          });
        }

        // Check if customer has sufficient balance
        if (customer.accountBalance < Number(initialAmount)) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: 'Insufficient balance for initial thrift payment'
          });
        }

        // Create thrift account
        const thriftAccount = await Thrift.create({
          CUST_ID,
          ACCT_NO,
          ACCT_ID,
          FIRST_NAME: customer.FIRST_NAME,
          LASTNAME: customer.LAST_NAME,
          FULL_NAME: fullName,
          RELATIONSHIP_MANAGER: RELATIONSHIP_MANAGER || null,
          AMOUNT: Number(initialAmount),
          ADDRESS: address || customer.HOME_ADDRESS ? {
            street: address || customer.HOME_ADDRESS || '',
            city: '',
            state: '',
            zipCode: '',
            country: 'Nigeria'
          } : null,
          COLLECTION_TYPE: COLLECTION_TYPE.toUpperCase(),
          status: 'ACTIVE',
          openingDate: openedDate,
          OPENED_DT: openedDate,
          TRANSACTION_DATE: transactionDate,
          initialAmount: Number(initialAmount),
          accountType: 'THRIFT',
          totalContributions: Number(initialAmount),
          notes: `Thrift account opened for existing customer ${fullName} with initial deposit of ${initialAmount}`,
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction: t });

        // Create transaction record
        const transactionRecord = await Transaction.create({
          CUST_ID,
          ACCT_NO,
          ACCT_ID,
          BU_ID: 1,
          ACCT_NM: `${fullName} Thrift Account`,
          AMOUNT: Number(initialAmount),
          TRANSACTION_TYPE: 'THRIFT_OPENING',
          description: 'Thrift account opening - First payment to bank',
          status: 'COMPLETED',
          createdBy: 'SYSTEM',
          TRANSACTION_DATE: transactionDate,
          metadata: {
            collectionType: COLLECTION_TYPE,
            isFirstPayment: true,
            amountToBank: Number(initialAmount),
            amountToCustomer: 0,
            direction: 'DEBIT',
            balanceAfter: customer.accountBalance - Number(initialAmount),
            reference: `THRIFT_OPEN_${ACCT_NO}_${Date.now()}`,
            transactionDate: transactionDate,
            openedDate: openedDate
          },
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction: t });

        // Update customer balance
        await customer.update({
          accountBalance: customer.accountBalance - Number(initialAmount),
          updated_at: new Date()
        }, { transaction: t });

        await t.commit();

        logger.info(`Thrift account created for existing customer ${CUST_ID}`, {
          CUST_ID, ACCT_NO, ACCT_ID, initialAmount, COLLECTION_TYPE,
          customerName: fullName, RELATIONSHIP_MANAGER, transactionDate, openedDate
        });

        res.status(201).json({
          success: true,
          message: 'Thrift account created successfully for existing customer',
          data: {
            customer: {
              CUST_ID: customer.CUST_ID,
              CUST_NO: customer.CUST_NO,
              FIRST_NAME: customer.FIRST_NAME,
              LASTNAME: customer.LAST_NAME,
              FULL_NAME: fullName,
              phone: customer.PHONE_NO,
              accountBalance: customer.accountBalance - Number(initialAmount),
              accountType: customer.accountType,
              OPENED_DT: customer.OPENED_DT
            },
            thriftAccount: {
              CUST_ID: thriftAccount.CUST_ID,
              ACCT_NO: thriftAccount.ACCT_NO,
              ACCT_ID: thriftAccount.ACCT_ID,
              FIRST_NAME: thriftAccount.FIRST_NAME,
              LASTNAME: thriftAccount.LASTNAME,
              FULL_NAME: thriftAccount.FULL_NAME,
              RELATIONSHIP_MANAGER: thriftAccount.RELATIONSHIP_MANAGER,
              AMOUNT: thriftAccount.AMOUNT,
              COLLECTION_TYPE: thriftAccount.COLLECTION_TYPE,
              ADDRESS: thriftAccount.ADDRESS,
              status: thriftAccount.status,
              openingDate: thriftAccount.openingDate,
              OPENED_DT: thriftAccount.OPENED_DT,
              accountType: thriftAccount.accountType,
              TRANSACTION_DATE: thriftAccount.TRANSACTION_DATE
            },
            transaction: {
              id: transactionRecord.id,
              amount: Number(initialAmount),
              customerAvailableBalance: thriftAccount.AMOUNT,
              customerCurrentBalance: customer.accountBalance - Number(initialAmount),
              TRANSACTION_DATE: transactionDate
            }
          }
        });

      } catch (error) {
        if (t && !t.finished) {
          await t.rollback();
        }
        logger.error('Error creating thrift account for existing customer:', error);
        res.status(500).json({
          success: false,
          message: 'Internal server error',
          error: error.message
        });
      }

    } catch (initError) {
      console.error('Model initialization error:', initError);
      return res.status(500).json({
        success: false,
        error: 'Database initialization error',
        details: initError.message
      });
    }
  }



// Process daily thrift collection
static async processDailyCollection(req, res) {
  try {
    await ensureModelsInitialized();
    
    // Get models
    const Customer = getCustomer();
    const Thrift = getThrift();
    const Transaction = getTransaction();
    const sequelize = getSequelize();
    
    let t;
    
    try {
      t = await sequelize.transaction();
      
      const { 
        CUST_ID, 
        ACCT_NO, 
        amount, 
        FULL_NAME: providedFullName,
        TRANSACTION_DATE
      } = req.body;

      if (!CUST_ID || !ACCT_NO || !amount) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'CUST_ID, ACCT_NO, and amount are required'
        });
      }

      if (Number(amount) <= 0) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0'
        });
      }

      const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();

      // Find thrift account
      const thriftAccount = await Thrift.findOne({
        where: { CUST_ID, ACCT_NO },
        transaction: t
      });

      if (!thriftAccount) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Thrift account not found'
        });
      }

      // Compute FULL_NAME
      const fullName = providedFullName || thriftAccount.FULL_NAME;
      if (!fullName) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Full name is required for transaction'
        });
      }

      // Find customer
      const customer = await Customer.findOne({
        where: { CUST_ID },
        transaction: t
      });

      if (!customer) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Get current date info
      const today = transactionDate;
      const currentDay = today.getDate();
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

      let amountToBank = 0;
      let amountToCustomer = Number(amount);

      // If it's the last day of month, entire amount goes to bank
      if (currentDay === lastDayOfMonth) {
        amountToBank = Number(amount);
        amountToCustomer = 0;
      }

      // Update thrift account
      await thriftAccount.update({
        AMOUNT: parseFloat(thriftAccount.AMOUNT) + amountToCustomer,
        lastCollectionDate: today,
        totalContributions: parseFloat(thriftAccount.totalContributions) + Number(amount),
        TRANSACTION_DATE: today,
        updated_at: new Date()
      }, { transaction: t });

      // ─── Generate transaction identifiers (SIMILAR TO createThriftAccount) ───
      const timestamp = Date.now();
      const randomNum = Math.floor(Math.random() * 10000);
      
      // Get the next transaction identifier (INTEGER)
      const [lastTransaction] = await sequelize.query(
        'SELECT MAX(transaction_identifier) as max_id FROM transactions',
        { type: sequelize.QueryTypes.SELECT, transaction: t }
      );
      
      const nextTransactionId = (lastTransaction?.max_id || 0) + 1;
      
      // Generate identifiers with CORRECT TYPES:
      const TRANSACTION_IDENTIFIER = nextTransactionId; // INTEGER
      const EVENT_ID = nextTransactionId; // INTEGER (same as transaction identifier)
      const TRAN_JOURNAL_ID = `JRN${timestamp}${randomNum}`; // STRING - maps to journal_id column
      const REFERENCE = `THRIFT_COLLECT_${ACCT_NO}_${timestamp}`; // STRING
      const TRANSACTION_ID = `TXN${nextTransactionId.toString().padStart(10, '0')}`; // STRING

      // Create transaction record with ALL required fields
      await Transaction.create({
        // Required integer fields
        TRANSACTION_IDENTIFIER: TRANSACTION_IDENTIFIER,
        EVENT_ID: EVENT_ID,
        
        // Required string fields
        TRAN_JOURNAL_ID: TRAN_JOURNAL_ID,
        REFERENCE: REFERENCE,
        TRANSACTION_ID: TRANSACTION_ID,
        
        // Other required fields
        CUST_ID,
        ACCT_NO,
        ACCT_ID: thriftAccount.ACCT_ID,
        BU_ID: 1,
        ACCT_NM: `${fullName} Thrift Account`,
        AMOUNT: Number(amount),
        transactionDirection: 'DEBIT',
        TRANSACTIONDATE: transactionDate,
        TRANSACTION_TYPE: 'DEPOSIT',
        description: `Thrift collection - ${amountToBank > 0 ? 'Last payment to bank' : 'Regular collection'}`,
        status: 'COMPLETED',
        createdBy: 'SYSTEM',
        currency: 'NGN',
        
        metadata: {
          amountToBank,
          amountToCustomer,
          isLastPayment: amountToBank > 0,
          collectionType: 'DAILY',
          collectionDate: today,
          direction: 'DEBIT',
          reference: REFERENCE,
          transactionDate: transactionDate
        },
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction: t });

      await t.commit();

      logger.info(`Daily collection processed for customer ${CUST_ID}`, {
        CUST_ID, 
        ACCT_NO, 
        amount, 
        amountToBank, 
        amountToCustomer,
        fullName, 
        relationshipManager: thriftAccount.RELATIONSHIP_MANAGER, 
        transactionDate,
        transactionId: TRANSACTION_IDENTIFIER,
        reference: REFERENCE
      });

      res.status(200).json({
        success: true,
        message: amountToBank > 0 ? 'Last payment processed successfully - Amount sent to bank' : 'Daily collection processed successfully',
        data: {
          amountCollected: Number(amount),
          amountToBank,
          amountToCustomer,
          customerAvailableBalance: parseFloat(thriftAccount.AMOUNT),
          isLastPayment: amountToBank > 0,
          relationshipManager: thriftAccount.RELATIONSHIP_MANAGER,
          TRANSACTION_DATE: transactionDate,
          transactionIdentifier: TRANSACTION_IDENTIFIER,
          reference: REFERENCE,
          transactionId: TRANSACTION_ID
        }
      });

    } catch (error) {
      if (t && !t.finished) {
        await t.rollback();
      }
      logger.error('Error processing daily collection:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }

  } catch (initError) {
    console.error('Model initialization error:', initError);
    return res.status(500).json({
      success: false,
      error: 'Database initialization error',
      details: initError.message
    });
  }
}


  // Process withdrawal from thrift account
  static async processWithdrawal(req, res) {
    let t;
    
    try {
      console.log('🔄 Processing withdrawal...');
      
      t = await sequelize.transaction();
      
      const { 
        CUST_ID, 
        ACCT_NO, 
        amount, 
        FULL_NAME: providedFullName,
        TRANSACTION_DATE
      } = req.body;

      if (!CUST_ID || !ACCT_NO || !amount) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'CUST_ID, ACCT_NO, and amount are required'
        });
      }

      if (Number(amount) <= 0) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0'
        });
      }

      const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();

      // Find thrift account
      const thriftAccount = await Thrift.findOne({
        where: { CUST_ID, ACCT_NO },
        transaction: t
      });

      if (!thriftAccount) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Thrift account not found'
        });
      }

      // Compute FULL_NAME
      const fullName = providedFullName || thriftAccount.FULL_NAME;
      if (!fullName) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Full name is required for transaction'
        });
      }

      // Find customer
      const customer = await Customer.findOne({
        where: { CUST_ID },
        transaction: t
      });

      if (!customer) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Check if thrift account has sufficient balance
      if (thriftAccount.AMOUNT < Number(amount)) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient thrift balance for withdrawal'
        });
      }

      // Update thrift account
      await thriftAccount.update({
        AMOUNT: thriftAccount.AMOUNT - Number(amount),
        totalWithdrawals: thriftAccount.totalWithdrawals + Number(amount),
        TRANSACTION_DATE: transactionDate,
        updated_at: new Date()
      }, { transaction: t });

      // Update customer balance
      await customer.update({
        accountBalance: customer.accountBalance + Number(amount),
        updated_at: new Date()
      }, { transaction: t });

      // Create transaction record
      await Transaction.create({
        CUST_ID,
        ACCT_NO,
        ACCT_ID: thriftAccount.ACCT_ID,
        BU_ID: 1,
        ACCT_NM: `${fullName} Thrift Account`,
        AMOUNT: Number(amount),
        TRANSACTION_TYPE: 'THRIFT_WITHDRAWAL',
        description: 'Withdrawal from thrift account',
        status: 'COMPLETED',
        createdBy: 'SYSTEM',
        TRANSACTION_DATE: transactionDate,
        metadata: {
          direction: 'CREDIT',
          balanceAfter: customer.accountBalance + Number(amount),
          reference: `THRIFT_WITHDRAW_${ACCT_NO}_${Date.now()}`,
          transactionDate: transactionDate
        },
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction: t });

      await t.commit();

      logger.info(`Withdrawal processed for customer ${CUST_ID}`, {
        CUST_ID, ACCT_NO, amount,
        remainingBalance: thriftAccount.AMOUNT,
        fullName, relationshipManager: thriftAccount.RELATIONSHIP_MANAGER, transactionDate
      });

      res.status(200).json({
        success: true,
        message: 'Withdrawal processed successfully',
        data: {
          amountWithdrawn: Number(amount),
          remainingThriftBalance: thriftAccount.AMOUNT,
          customerAccountBalance: customer.accountBalance,
          relationshipManager: thriftAccount.RELATIONSHIP_MANAGER,
          TRANSACTION_DATE: transactionDate
        }
      });

    } catch (error) {
      if (t && !t.finished) {
        await t.rollback();
      }
      logger.error('Error processing withdrawal:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Get thrift account summary
  static async getAccountSummary(req, res) {
    try {
      console.log('🔄 Getting account summary...');
      
      const { CUST_ID, ACCT_NO } = req.params;

      const thriftAccount = await Thrift.findOne({
        where: { CUST_ID, ACCT_NO }
      });

      if (!thriftAccount) {
        return res.status(404).json({
          success: false,
          message: 'Thrift account not found'
        });
      }

      const customer = await Customer.findOne({
        where: { CUST_ID }
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      const today = new Date();
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      const summary = {
        accountInfo: {
          CUST_ID: thriftAccount.CUST_ID,
          ACCT_NO: thriftAccount.ACCT_NO,
          ACCT_ID: thriftAccount.ACCT_ID,
          FIRST_NAME: thriftAccount.FIRST_NAME,
          LASTNAME: thriftAccount.LASTNAME,
          FULL_NAME: thriftAccount.FULL_NAME,
          RELATIONSHIP_MANAGER: thriftAccount.RELATIONSHIP_MANAGER,
          AMOUNT: thriftAccount.AMOUNT,
          COLLECTION_TYPE: thriftAccount.COLLECTION_TYPE,
          ADDRESS: thriftAccount.ADDRESS,
          status: thriftAccount.status,
          openingDate: thriftAccount.openingDate,
          lastCollectionDate: thriftAccount.lastCollectionDate,
          accountType: thriftAccount.accountType,
          totalContributions: thriftAccount.totalContributions,
          totalWithdrawals: thriftAccount.totalWithdrawals,
          nextCollectionDate: thriftAccount.nextCollectionDate
        },
        customerInfo: {
          CUST_ID: customer.CUST_ID,
          CUST_NO: customer.CUST_NO,
          firstName: customer.FIRST_NAME,
          lastName: customer.LAST_NAME,
          FULL_NAME: `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
          phone: customer.PHONE_NO,
          accountBalance: customer.accountBalance,
          accountType: customer.accountType
        },
        nextBankPaymentDate: lastDayOfMonth,
        availableForWithdrawal: thriftAccount.AMOUNT,
        totalContributions: thriftAccount.totalContributions,
        netContribution: thriftAccount.totalContributions - thriftAccount.totalWithdrawals,
        collectionStats: {
          daily: thriftAccount.COLLECTION_TYPE === 'DAILY',
          weekly: thriftAccount.COLLECTION_TYPE === 'WEEKLY',
          monthly: thriftAccount.COLLECTION_TYPE === 'MONTHLY',
          quarterly: thriftAccount.COLLECTION_TYPE === 'QUARTERLY'
        }
      };

      res.status(200).json({
        success: true,
        data: summary
      });

    } catch (error) {
      logger.error('Error getting account summary:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Get all thrift accounts for a customer
  static async getCustomerThriftAccounts(req, res) {
    try {
      console.log('🔄 Getting customer thrift accounts...');
      
      const { CUST_ID } = req.params;

      const customer = await Customer.findOne({
        where: { CUST_ID }
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      const thriftAccounts = await Thrift.findAll({
        where: { CUST_ID },
        order: [['OPENED_DT', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: {
          customer: {
            CUST_ID: customer.CUST_ID,
            CUST_NO: customer.CUST_NO,
            firstName: customer.FIRST_NAME,
            lastName: customer.LAST_NAME,
            FULL_NAME: `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
            accountBalance: customer.accountBalance
          },
          thriftAccounts: thriftAccounts.map(account => ({
            CUST_ID: account.CUST_ID,
            ACCT_NO: account.ACCT_NO,
            ACCT_ID: account.ACCT_ID,
            FIRST_NAME: account.FIRST_NAME,
            LASTNAME: account.LASTNAME,
            FULL_NAME: account.FULL_NAME,
            RELATIONSHIP_MANAGER: account.RELATIONSHIP_MANAGER,
            AMOUNT: account.AMOUNT,
            COLLECTION_TYPE: account.COLLECTION_TYPE,
            ADDRESS: account.ADDRESS,
            status: account.status,
            openingDate: account.openingDate,
            lastCollectionDate: account.lastCollectionDate,
            accountType: account.accountType,
            TRANSACTION_DATE: account.TRANSACTION_DATE,
            nextCollectionDate: account.nextCollectionDate,
            totalContributions: account.totalContributions,
            totalWithdrawals: account.totalWithdrawals
          })),
          summary: {
            totalAccounts: thriftAccounts.length,
            totalBalance: thriftAccounts.reduce((sum, acc) => sum + parseFloat(acc.AMOUNT || 0), 0),
            activeAccounts: thriftAccounts.filter(acc => acc.status === 'ACTIVE').length
          }
        }
      });

    } catch (error) {
      logger.error('Error getting customer thrift accounts:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Get all thrift accounts (Admin)
  static async getAllThriftAccounts(req, res) {
    try {
      console.log('🔄 Getting all thrift accounts...');
      
      const { page = 1, limit = 10, status, relationshipManagerId } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      if (status) where.status = status;
      if (relationshipManagerId) where.RELATIONSHIP_MANAGER = relationshipManagerId;

      const { count, rows: thriftAccounts } = await Thrift.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: {
          thriftAccounts: thriftAccounts.map(account => ({
            CUST_ID: account.CUST_ID,
            ACCT_NO: account.ACCT_NO,
            ACCT_ID: account.ACCT_ID,
            FIRST_NAME: account.FIRST_NAME,
            LASTNAME: account.LASTNAME,
            FULL_NAME: account.FULL_NAME,
            RELATIONSHIP_MANAGER: account.RELATIONSHIP_MANAGER,
            AMOUNT: account.AMOUNT,
            COLLECTION_TYPE: account.COLLECTION_TYPE,
            ADDRESS: account.ADDRESS,
            status: account.status,
            openingDate: account.openingDate,
            lastCollectionDate: account.lastCollectionDate,
            accountType: account.accountType,
            TRANSACTION_DATE: account.TRANSACTION_DATE,
            nextCollectionDate: account.nextCollectionDate,
            totalContributions: account.totalContributions,
            totalWithdrawals: account.totalWithdrawals,
            created_at: account.created_at
          })),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            pages: Math.ceil(count / limit)
          },
          summary: {
            totalAccounts: count,
            totalBalance: thriftAccounts.reduce((sum, acc) => sum + parseFloat(acc.AMOUNT || 0), 0),
            activeAccounts: thriftAccounts.filter(acc => acc.status === 'ACTIVE').length
          }
        }
      });

    } catch (error) {
      logger.error('Error getting all thrift accounts:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Get transaction history for a thrift account
  static async getTransactionHistory(req, res) {
    try {
      console.log('🔄 Getting transaction history...');
      
      const { CUST_ID, ACCT_NO } = req.params;
      const { page = 1, limit = 10, fromDate, toDate, type } = req.query;
      const offset = (page - 1) * limit;

      if (!CUST_ID && !ACCT_NO) {
        return res.status(400).json({
          success: false,
          message: 'Either CUST_ID or ACCT_NO is required'
        });
      }

      const where = {};
      if (CUST_ID) where.CUST_ID = CUST_ID;
      if (ACCT_NO) where.ACCT_NO = ACCT_NO;
      if (type) where.TRANSACTION_TYPE = type;

      if (fromDate) {
        where.TRANSACTION_DATE = { [Op.gte]: new Date(fromDate) };
      }
      if (toDate) {
        where.TRANSACTION_DATE = where.TRANSACTION_DATE || {};
        where.TRANSACTION_DATE[Op.lte] = new Date(toDate);
      }

      const { count, rows: transactions } = await Transaction.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['TRANSACTION_DATE', 'DESC']]
      });

      const enrichedTransactions = transactions.map(txn => ({
        id: txn.id,
        CUST_ID: txn.CUST_ID,
        ACCT_NO: txn.ACCT_NO,
        ACCT_ID: txn.ACCT_ID,
        TRANSACTION_TYPE: txn.TRANSACTION_TYPE,
        AMOUNT: parseFloat(txn.AMOUNT || 0),
        description: txn.description,
        status: txn.status,
        TRANSACTION_DATE: txn.TRANSACTION_DATE,
        formattedDate: new Date(txn.TRANSACTION_DATE).toLocaleDateString(),
        formattedAmount: parseFloat(txn.AMOUNT || 0).toLocaleString(),
        metadata: txn.metadata
      }));

      res.status(200).json({
        success: true,
        data: {
          transactions: enrichedTransactions,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            pages: Math.ceil(count / limit)
          },
          filters: {
            fromDate,
            toDate,
            type
          },
          summary: {
            totalTransactions: count,
            totalAmount: transactions.reduce((sum, txn) => sum + parseFloat(txn.AMOUNT || 0), 0)
          }
        }
      });

    } catch (error) {
      logger.error('Error getting transaction history:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // ─────────────────────────────────────────────
//  Search customers by name
// ─────────────────────────────────────────────
static async searchCustomersByName(req, res) {
  try {
    await ensureModelsInitialized();
    
    const Customer = getCustomer();
    const Thrift = getThrift();
    
    const { searchTerm, page = 1, limit = 20 } = req.query;
    
    if (!searchTerm || searchTerm.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }
    
    const searchQuery = searchTerm.trim();
    const offset = (page - 1) * limit;
    
    // Search in multiple fields: FIRST_NAME, LAST_NAME, CUST_NM (full name)
    const where = {
      [Op.or]: [
        { FIRST_NAME: { [Op.like]: `%${searchQuery}%` } },
        { LAST_NAME: { [Op.like]: `%${searchQuery}%` } },
        { CUST_NM: { [Op.like]: `%${searchQuery}%` } }
      ]
    };
    
    const { count, rows: customers } = await Customer.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['FIRST_NAME', 'ASC'], ['LAST_NAME', 'ASC']],
      attributes: [
        'CUST_ID', 
        'CUST_NO', 
        'FIRST_NAME', 
        'LAST_NAME', 
        'CUST_NM', 
        'PHONE_NO', 
        'HOME_ADDRESS',
        'REC_ST',
        'OPENED_DT',
        'created_at',
        'updated_at'
      ]
    });
    
    // Get thrift accounts for each customer
    const customersWithThriftAccounts = await Promise.all(
      customers.map(async (customer) => {
        const thriftAccounts = await Thrift.findAll({
          where: { CUST_ID: customer.CUST_ID },
          attributes: [
            'ACCT_NO',
            'ACCT_ID',
            'AMOUNT',
            'COLLECTION_TYPE',
            'status',
            'OPENED_DT',
            'TRANSACTION_DATE',
            'nextCollectionDate',
            'totalContributions',
            'totalWithdrawals'
          ],
          order: [['OPENED_DT', 'DESC']]
        });
        
        return {
          customer: {
            CUST_ID: customer.CUST_ID,
            CUST_NO: customer.CUST_NO,
            firstName: customer.FIRST_NAME,
            lastName: customer.LAST_NAME,
            fullName: customer.CUST_NM || `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
            phone: customer.PHONE_NO || null,
            address: customer.HOME_ADDRESS || null,
            status: customer.REC_ST,
            openedDate: customer.OPENED_DT ? 
              (typeof customer.OPENED_DT.toISOString === 'function' 
                ? customer.OPENED_DT.toISOString() 
                : new Date(customer.OPENED_DT).toISOString()) 
              : null,
            createdAt: customer.created_at,
            updatedAt: customer.updated_at
          },
          thriftAccounts: thriftAccounts.map(account => ({
            accountNumber: account.ACCT_NO,
            accountId: account.ACCT_ID,
            balance: parseFloat(account.AMOUNT || 0),
            collectionType: account.COLLECTION_TYPE,
            status: account.status,
            openedDate: account.OPENED_DT ? 
              (typeof account.OPENED_DT.toISOString === 'function' 
                ? account.OPENED_DT.toISOString() 
                : new Date(account.OPENED_DT).toISOString()) 
              : null,
            lastTransactionDate: account.TRANSACTION_DATE ? 
              (typeof account.TRANSACTION_DATE.toISOString === 'function' 
                ? account.TRANSACTION_DATE.toISOString() 
                : new Date(account.TRANSACTION_DATE).toISOString()) 
              : null,
            nextCollectionDate: account.nextCollectionDate ? 
              (typeof account.nextCollectionDate.toISOString === 'function' 
                ? account.nextCollectionDate.toISOString() 
                : new Date(account.nextCollectionDate).toISOString()) 
              : null,
            totalContributions: parseFloat(account.totalContributions || 0),
            totalWithdrawals: parseFloat(account.totalWithdrawals || 0)
          })),
          summary: {
            totalThriftAccounts: thriftAccounts.length,
            totalThriftBalance: thriftAccounts.reduce((sum, acc) => sum + parseFloat(acc.AMOUNT || 0), 0),
            activeThriftAccounts: thriftAccounts.filter(acc => acc.status === 'ACTIVE').length
          }
        };
      })
    );
    
    return res.status(200).json({
      success: true,
      message: 'Search completed successfully',
      data: {
        customers: customersWithThriftAccounts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit),
          hasMore: (offset + customers.length) < count
        },
        search: {
          term: searchQuery,
          totalResults: count,
          resultsInPage: customers.length
        }
      }
    });
    
  } catch (error) {
    console.error('Error searching customers:', error);
    logger.error('searchCustomersByName failed', { 
      error: error.message, 
      stack: error.stack,
      query: req.query,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({
      success: false,
      message: 'Error searching customers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// ─────────────────────────────────────────────
//  Search thrift accounts by customer name
// ─────────────────────────────────────────────
static async searchThriftAccountsByName(req, res) {
  try {
    await ensureModelsInitialized();
    
    const Customer = getCustomer();
    const Thrift = getThrift();
    
    const { searchTerm, page = 1, limit = 20 } = req.query;
    
    if (!searchTerm || searchTerm.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }
    
    const searchQuery = searchTerm.trim();
    const offset = (page - 1) * limit;
    
    // First, find customers matching the search term
    const customers = await Customer.findAll({
      where: {
        [Op.or]: [
          { FIRST_NAME: { [Op.like]: `%${searchQuery}%` } },
          { LAST_NAME: { [Op.like]: `%${searchQuery}%` } },
          { CUST_NM: { [Op.like]: `%${searchQuery}%` } }
        ]
      },
      attributes: ['CUST_ID', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM']
    });
    
    if (customers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No customers found matching the search term',
        data: {
          thriftAccounts: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0,
            hasMore: false
          },
          search: {
            term: searchQuery,
            totalResults: 0,
            resultsInPage: 0
          }
        }
      });
    }
    
    // Get CUST_IDs from found customers
    const customerIds = customers.map(c => c.CUST_ID);
    
    // Find thrift accounts for these customers
    const { count, rows: thriftAccounts } = await Thrift.findAndCountAll({
      where: {
        CUST_ID: { [Op.in]: customerIds }
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['CUST_ID', 'ASC'], ['OPENED_DT', 'DESC']],
      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM', 'PHONE_NO']
      }]
    });
    
    const formattedAccounts = thriftAccounts.map(account => ({
      CUST_ID: account.CUST_ID,
      ACCT_NO: account.ACCT_NO,
      ACCT_ID: account.ACCT_ID,
      customer: {
        CUST_ID: account.customer?.CUST_ID,
        CUST_NO: account.customer?.CUST_NO,
        firstName: account.customer?.FIRST_NAME,
        lastName: account.customer?.LAST_NAME,
        fullName: account.customer?.CUST_NM || `${account.customer?.FIRST_NAME} ${account.customer?.LAST_NAME}`,
        phone: account.customer?.PHONE_NO || null
      },
      accountDetails: {
        firstName: account.FIRST_NAME,
        lastName: account.LASTNAME,
        fullName: account.FULL_NAME,
        relationshipManager: account.RELATIONSHIP_MANAGER || null,
        amount: parseFloat(account.AMOUNT || 0),
        collectionType: account.COLLECTION_TYPE,
        status: account.status,
        openingDate: account.OPENED_DT ? 
          (typeof account.OPENED_DT.toISOString === 'function' 
            ? account.OPENED_DT.toISOString() 
            : new Date(account.OPENED_DT).toISOString()) 
          : null,
        transactionDate: account.TRANSACTION_DATE ? 
          (typeof account.TRANSACTION_DATE.toISOString === 'function' 
            ? account.TRANSACTION_DATE.toISOString() 
            : new Date(account.TRANSACTION_DATE).toISOString()) 
          : null,
        nextCollectionDate: account.nextCollectionDate ? 
          (typeof account.nextCollectionDate.toISOString === 'function' 
            ? account.nextCollectionDate.toISOString() 
            : new Date(account.nextCollectionDate).toISOString()) 
          : null,
        address: account.ADDRESS,
        initialAmount: parseFloat(account.initialAmount || 0),
        accountType: account.accountType,
        totalContributions: parseFloat(account.totalContributions || 0),
        totalWithdrawals: parseFloat(account.totalWithdrawals || 0),
        notes: account.notes,
        isActive: account.isActive
      }
    }));
    
    return res.status(200).json({
      success: true,
      message: 'Search completed successfully',
      data: {
        thriftAccounts: formattedAccounts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit),
          hasMore: (offset + thriftAccounts.length) < count
        },
        search: {
          term: searchQuery,
          totalResults: count,
          resultsInPage: thriftAccounts.length,
          matchedCustomers: customers.length
        }
      }
    });
    
  } catch (error) {
    console.error('Error searching thrift accounts:', error);
    logger.error('searchThriftAccountsByName failed', { 
      error: error.message, 
      stack: error.stack,
      query: req.query,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({
      success: false,
      message: 'Error searching thrift accounts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// ─────────────────────────────────────────────
//  Quick search for thrift collection
// ─────────────────────────────────────────────
static async quickSearchForCollection(req, res) {
  try {
    await ensureModelsInitialized();
    
    const Customer = getCustomer();
    const Thrift = getThrift();
    
    const { searchTerm } = req.query;
    
    if (!searchTerm || searchTerm.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }
    
    const searchQuery = searchTerm.trim();
    
    // Search for active thrift accounts with customer info
    const thriftAccounts = await Thrift.findAll({
      where: {
        status: 'ACTIVE',
        [Op.or]: [
          { ACCT_NO: { [Op.like]: `%${searchQuery}%` } },
          { FIRST_NAME: { [Op.like]: `%${searchQuery}%` } },
          { LASTNAME: { [Op.like]: `%${searchQuery}%` } },
          { FULL_NAME: { [Op.like]: `%${searchQuery}%` } }
        ]
      },
      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM', 'PHONE_NO']
      }],
      limit: 10,
      order: [['FULL_NAME', 'ASC']]
    });
    
    const formattedResults = thriftAccounts.map(account => ({
      CUST_ID: account.CUST_ID,
      ACCT_NO: account.ACCT_NO,
      ACCT_ID: account.ACCT_ID,
      customerName: account.FULL_NAME,
      firstName: account.FIRST_NAME,
      lastName: account.LASTNAME,
      phone: account.customer?.PHONE_NO || null,
      currentBalance: parseFloat(account.AMOUNT || 0),
      collectionType: account.COLLECTION_TYPE,
      nextCollectionDate: account.nextCollectionDate ? 
        (typeof account.nextCollectionDate.toISOString === 'function' 
          ? account.nextCollectionDate.toISOString() 
          : new Date(account.nextCollectionDate).toISOString()) 
        : null,
      relationshipManager: account.RELATIONSHIP_MANAGER || null
    }));
    
    return res.status(200).json({
      success: true,
      message: 'Quick search completed',
      data: {
        results: formattedResults,
        count: formattedResults.length,
        searchTerm: searchQuery
      }
    });
    
  } catch (error) {
    console.error('Error in quick search:', error);
    return res.status(500).json({
      success: false,
      message: 'Error performing quick search',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

  // Helper methods (keep these as is)
  static isLastWeekOfMonth(date) {
    const nextWeek = new Date(date);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.getMonth() !== date.getMonth();
  }

  static async isFirstMonthlyPayment(ACCT_NO) {
    const count = await Transaction.count({
      where: {
        ACCT_NO,
        TRANSACTION_TYPE: 'THRIFT_COLLECTION',
        metadata: { collectionType: 'MONTHLY' }
      }
    });
    return count === 0;
  }

  static isQuarterEnd(date) {
    const month = date.getMonth();
    const quarterEndMonths = [2, 5, 8, 11];
    return quarterEndMonths.includes(month);
  }

  static isYearEnd(date) {
    return date.getMonth() === 11;
  }

  static getQuarter(date) {
    const month = date.getMonth();
    return Math.floor(month / 3) + 1;
  }

  static getBankPaymentType(isFirstPayment, isQuarterEnd, isYearEnd) {
    if (isFirstPayment) return 'FIRST_PAYMENT';
    if (isYearEnd) return 'ANNUAL_PAYMENT';
    if (isQuarterEnd) return 'QUARTERLY_PAYMENT';
    return 'REGULAR_PAYMENT';
  }

  static getNextMonthlyPaymentDate(currentDate) {
    const nextPayment = new Date(currentDate);
    nextPayment.setMonth(nextPayment.getMonth() + 1);
    nextPayment.setDate(1);
    return nextPayment;
  }

  static async calculateExpectedMonthlyAmount(ACCT_NO) {
    return 5000; // Default value
  }
}

export default ThriftController;