import Thrift from '../models/Thrift.js';
import Customer from '../models/Customer.js';
import Transaction from '../models/Transaction.js';
import logger from '../utils/logger.js';
import generateCustomerNumber from '../utils/generateCustomerNumber.js';
import { generateAccountIdentifiersFromCounter } from '../utils/generateAccountNumber.js';

class ThriftController {
  // Create new thrift account with auto-generated customer
  static async createThriftAccount(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        FIRST_NAME,
        LASTNAME,
        FULL_NAME: providedFullName, // Optional from body
        initialAmount,
        COLLECTION_TYPE,
        address,
        phone,
        RELATIONSHIP_MANAGER, // Updated to match request body key (String, e.g., "PCO04")
        TRANSACTION_DATE, // Add transaction date
        OPENED_DT // Add opened date
      } = req.body;

      // Validate required fields
      if (!FIRST_NAME || !LASTNAME || !initialAmount || !COLLECTION_TYPE) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: FIRST_NAME, LASTNAME, initialAmount, COLLECTION_TYPE'
        });
      }

      // Compute FULL_NAME if not provided
      const fullName = providedFullName || `${FIRST_NAME} ${LASTNAME}`.trim();
      if (!fullName) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Full name cannot be empty'
        });
      }

      // Validate initial amount
      if (initialAmount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Initial amount must be greater than 0'
        });
      }

      // Set transaction date and opened date
      const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();
      const openedDate = OPENED_DT ? new Date(OPENED_DT) : new Date();

      // Generate customer numbers
      let customerNumbers;
      try {
        customerNumbers = await generateCustomerNumber();
        logger.info('Generated customer numbers:', customerNumbers);
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        logger.error('Error generating customer numbers:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to generate customer identifiers',
          error: error.message
        });
      }

      const { CUST_ID, CUST_NO } = customerNumbers;

      // Generate thrift account numbers using savings account pattern
      let accountIdentifiers;
      try {
        // Use "1" prefix for thrift accounts (similar to savings)
        accountIdentifiers = await generateAccountIdentifiersFromCounter('1');
        logger.info('Generated account identifiers:', accountIdentifiers);
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        logger.error('Error generating account identifiers:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to generate account identifiers',
          error: error.message
        });
      }

      const { ACCT_NO, ACCT_ID } = accountIdentifiers;

      // Check if customer already exists (safety check)
      const existingCustomer = await Customer.findOne({ CUST_ID }).session(session);
      if (existingCustomer) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Customer already exists with generated ID'
        });
      }

      // Create new customer with initial balance - map to schema fields
      const customer = new Customer({
        CUST_ID,
        CUST_NO,
        FIRST_NAME,
        LAST_NAME: LASTNAME,
        PHONE_NO: phone || '',
        BU_ID: 1, // Default business unit ID for thrift accounts
        HOME_ADDRESS: address || '123 Main Street, City, State',
        accountBalance: initialAmount, // Custom field - add to schema if needed
        accountType: 'SAVINGS', // Custom field - add to schema if needed
        REC_ST: 'Active', // Map to schema status field
        OPENED_DT: openedDate // Use provided OPENED_DT or current date
      });

      await customer.save({ session });

      // Check if customer has sufficient balance for initial amount
      if (customer.accountBalance < initialAmount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance for initial thrift payment'
        });
      }

      // Check if thrift account already exists
      const existingAccount = await Thrift.findOne({
        $or: [{ ACCT_NO }, { ACCT_ID }, { CUST_ID }]
      }).session(session);

      if (existingAccount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Account with this ACCT_NO, ACCT_ID, or CUST_ID already exists'
        });
      }

      // First payment goes to bank
      const firstPayment = initialAmount;
      const customerAvailableAmount = 0;

      // Create thrift account
      const thriftAccount = new Thrift({
        CUST_ID,
        ACCT_NO,
        ACCT_ID,
        FIRST_NAME,
        LASTNAME,
        FULL_NAME: fullName, // Set computed/provided FULL_NAME
        RELATIONSHIP_MANAGER: RELATIONSHIP_MANAGER || null,
        AMOUNT: customerAvailableAmount,
        ADDRESS: { // Fixed: Parse string address into object structure
          street: address || '',
          city: '',
          state: '',
          zipCode: '',
          country: 'Nigeria'
        },
        COLLECTION_TYPE: COLLECTION_TYPE.toUpperCase(),
        status: 'active',
        openingDate: openedDate, // Use provided OPENED_DT or current date
        initialAmount: firstPayment,
        accountType: 'SAVINGS',
        OPENED_DT: openedDate // Add OPENED_DT field
      });

      await thriftAccount.save({ session });

      // Create transaction record for bank payment
      const bankTransaction = new Transaction({
        CUST_ID,
        ACCT_NO,
        ACCT_ID,
        BU_ID: 1, // Default business unit ID for thrift
        ACCT_NM: `${fullName} Thrift Account`,
        AMOUNT: firstPayment,
        TRANSACTION_TYPE: 'THRIFT_OPENING',
        description: `Thrift account opening - First payment to bank`,
        status: 'COMPLETED',
        createdBy: 'SYSTEM', // Default creator for automated transactions
        TRANSACTION_DATE: transactionDate, // Add transaction date
        metadata: {
          collectionType: COLLECTION_TYPE,
          isFirstPayment: true,
          amountToBank: firstPayment,
          amountToCustomer: 0,
          direction: 'DEBIT',
          balanceAfter: customer.accountBalance - firstPayment,
          reference: `THRIFT_OPEN_${ACCT_NO}_${Date.now()}`,
          transactionDate: transactionDate, // Also store in metadata
          openedDate: openedDate // Store opened date in metadata
        }
      });

      await bankTransaction.save({ session });

      // Update customer account balance (debit the first payment)
      customer.accountBalance -= firstPayment;
      await customer.save({ session });

      await session.commitTransaction();
      session.endSession();

      logger.info(`Thrift account created successfully for customer ${CUST_ID}`, {
        CUST_ID,
        ACCT_NO,
        ACCT_ID,
        initialAmount,
        COLLECTION_TYPE,
        customerName: fullName,
        RELATIONSHIP_MANAGER,
        transactionDate,
        openedDate
      });

      res.status(201).json({
        success: true,
        message: 'Thrift account created successfully',
        data: {
          customer: {
            CUST_ID,
            CUST_NO,
            FIRST_NAME,
            LASTNAME,
            FULL_NAME: fullName,
            phone: customer.PHONE_NO,
            accountBalance: customer.accountBalance,
            accountType: customer.accountType || 'SAVINGS',
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
            accountType: thriftAccount.accountType
          },
          transaction: {
            firstPaymentToBank: firstPayment,
            customerAvailableBalance: customerAvailableAmount,
            customerCurrentBalance: customer.accountBalance,
            TRANSACTION_DATE: transactionDate
          }
        }
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      
      logger.error('Error creating thrift account:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

 // Create thrift account for existing customer
  static async createThriftAccountForExistingCustomer(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        CUST_ID,
        FULL_NAME: providedFullName, // Optional from body
        initialAmount,
        COLLECTION_TYPE,
        address,
        RELATIONSHIP_MANAGER, // Updated to match request body key (String, e.g., "PCO04")
        TRANSACTION_DATE, // Add transaction date
        OPENED_DT // Add opened date
      } = req.body;

      // Validate required fields
      if (!CUST_ID || !initialAmount || !COLLECTION_TYPE) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: CUST_ID, initialAmount, COLLECTION_TYPE'
        });
      }

      // Validate initial amount
      if (initialAmount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Initial amount must be greater than 0'
        });
      }

      // Set transaction date and opened date
      const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();
      const openedDate = OPENED_DT ? new Date(OPENED_DT) : new Date();

      // Validate relationship manager if provided (assuming User model has a 'code' field)
      if (RELATIONSHIP_MANAGER) {
        const managerExists = await mongoose.model('User').exists({ code: RELATIONSHIP_MANAGER }).session(session);
        if (!managerExists) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Invalid relationship manager code'
          });
        }
      }

      // Validate customer exists
      const customer = await Customer.findOne({ CUST_ID }).session(session);
      if (!customer) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Compute FULL_NAME if not provided
      const fullName = providedFullName || `${customer.FIRST_NAME} ${customer.LAST_NAME}`.trim();
      if (!fullName) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Full name cannot be empty'
        });
      }

      // Generate thrift account numbers using savings account pattern
      let accountIdentifiers;
      try {
        accountIdentifiers = await generateAccountIdentifiersFromCounter('1');
        logger.info('Generated account identifiers for existing customer:', accountIdentifiers);
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        logger.error('Error generating account identifiers:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to generate account identifiers',
          error: error.message
        });
      }

      const { ACCT_NO, ACCT_ID } = accountIdentifiers;

      // Check if thrift account already exists for this customer
      const existingAccount = await Thrift.findOne({ CUST_ID, COLLECTION_TYPE: COLLECTION_TYPE.toUpperCase() }).session(session);
      if (existingAccount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Thrift account with ${COLLECTION_TYPE} collection type already exists for this customer`
        });
      }

      // Check if customer has sufficient balance for initial amount
      if (customer.accountBalance < initialAmount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance for initial thrift payment'
        });
      }

      // First payment goes to bank
      const firstPayment = initialAmount;
      const customerAvailableAmount = 0;

      // Create thrift account
      const thriftAccount = new Thrift({
        CUST_ID,
        ACCT_NO,
        ACCT_ID,
        FIRST_NAME: customer.FIRST_NAME,
        LASTNAME: customer.LAST_NAME,
        FULL_NAME: fullName, // Set computed/provided FULL_NAME
        RELATIONSHIP_MANAGER: RELATIONSHIP_MANAGER || null,
        AMOUNT: customerAvailableAmount,
        ADDRESS: { // Fixed: Parse string address into object structure
          street: address || customer.HOME_ADDRESS || '',
          city: '',
          state: '',
          zipCode: '',
          country: 'Nigeria'
        },
        COLLECTION_TYPE: COLLECTION_TYPE.toUpperCase(),
        status: 'active',
        openingDate: openedDate,
        initialAmount: firstPayment,
        accountType: 'SAVINGS',
        OPENED_DT: openedDate // Add OPENED_DT field
      });

      await thriftAccount.save({ session });

      // Create transaction record for bank payment
      const bankTransaction = new Transaction({
        CUST_ID,
        ACCT_NO,
        ACCT_ID,
        BU_ID: 1, // Default business unit ID for thrift
        ACCT_NM: `${fullName} Thrift Account`,
        AMOUNT: firstPayment,
        TRANSACTION_TYPE: 'THRIFT_OPENING',
        description: `Thrift account opening - First payment to bank`,
        status: 'COMPLETED',
        createdBy: 'SYSTEM', // Default creator for automated transactions
        TRANSACTION_DATE: transactionDate, // Add transaction date
        metadata: {
          collectionType: COLLECTION_TYPE,
          isFirstPayment: true,
          amountToBank: firstPayment,
          amountToCustomer: 0,
          direction: 'DEBIT',
          balanceAfter: customer.accountBalance - firstPayment,
          reference: `THRIFT_OPEN_${ACCT_NO}_${Date.now()}`,
          transactionDate: transactionDate, // Also store in metadata
          openedDate: openedDate // Store opened date in metadata
        }
      });

      await bankTransaction.save({ session });

      // Update customer account balance (debit the first payment)
      customer.accountBalance -= firstPayment;
      await customer.save({ session });

      await session.commitTransaction();
      session.endSession();

      logger.info(`Thrift account created for existing customer ${CUST_ID}`, {
        CUST_ID,
        ACCT_NO,
        ACCT_ID,
        initialAmount,
        COLLECTION_TYPE,
        customerName: fullName,
        RELATIONSHIP_MANAGER,
        transactionDate,
        openedDate
      });

      res.status(201).json({
        success: true,
        message: 'Thrift account created successfully',
        data: {
          customer: {
            CUST_ID: customer.CUST_ID,
            CUST_NO: customer.CUST_NO,
            FIRST_NAME: customer.FIRST_NAME,
            LASTNAME: customer.LAST_NAME,
            FULL_NAME: fullName,
            phone: customer.PHONE_NO,
            accountBalance: customer.accountBalance,
            accountType: customer.accountType || 'SAVINGS',
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
            accountType: thriftAccount.accountType
          },
          transaction: {
            firstPaymentToBank: firstPayment,
            customerAvailableBalance: customerAvailableAmount,
            customerCurrentBalance: customer.accountBalance,
            TRANSACTION_DATE: transactionDate
          }
        }
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      
      logger.error('Error creating thrift account for existing customer:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

 // Process daily thrift collection
  static async processDailyCollection(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { 
        CUST_ID, 
        ACCT_NO, 
        amount, 
        FULL_NAME: providedFullName,
        TRANSACTION_DATE // Add transaction date
      } = req.body;

      if (!CUST_ID || !ACCT_NO || !amount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'CUST_ID, ACCT_NO, and amount are required'
        });
      }

      if (amount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0'
        });
      }

      // Set transaction date
      const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();

      // Find thrift account
      const thriftAccount = await Thrift.findOne({ CUST_ID, ACCT_NO })
        .session(session);
      if (!thriftAccount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Thrift account not found'
        });
      }

      // Compute FULL_NAME if provided, else use from DB
      const fullName = providedFullName || thriftAccount.FULL_NAME;
      if (!fullName) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Full name is required for transaction'
        });
      }

      // Find customer
      const customer = await Customer.findOne({ CUST_ID }).session(session);
      if (!customer) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Check if customer has sufficient balance
      if (customer.accountBalance < amount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance'
        });
      }

      // Get current date info
      const today = transactionDate;
      const currentDay = today.getDate();
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

      let amountToBank = 0;
      let amountToCustomer = amount;

      // If it's the last day of month, entire amount goes to bank
      if (currentDay === lastDayOfMonth) {
        amountToBank = amount;
        amountToCustomer = 0;
      }

      // Update thrift account
      thriftAccount.AMOUNT += amountToCustomer;
      thriftAccount.lastCollectionDate = today;
      await thriftAccount.save({ session });

      // Update customer balance
      customer.accountBalance -= amount;
      await customer.save({ session });

      // Create transaction record
      const transaction = new Transaction({
        CUST_ID,
        ACCT_NO,
        ACCT_ID: thriftAccount.ACCT_ID,
        BU_ID: 1, // Default business unit ID
        ACCT_NM: `${fullName} Thrift Account`,
        AMOUNT: amount,
        TRANSACTION_TYPE: 'THRIFT_COLLECTION',
        description: `Thrift collection - ${amountToBank > 0 ? 'Last payment to bank' : 'Regular collection'}`,
        status: 'COMPLETED',
        createdBy: 'SYSTEM',
        TRANSACTION_DATE: transactionDate, // Add transaction date
        metadata: {
          amountToBank,
          amountToCustomer,
          isLastPayment: amountToBank > 0,
          collectionType: 'DAILY',
          collectionDate: today,
          direction: 'DEBIT',
          balanceAfter: customer.accountBalance,
          reference: `THRIFT_COLLECT_${ACCT_NO}_${Date.now()}`,
          transactionDate: transactionDate // Also store in metadata
        }
      });

      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      logger.info(`Daily collection processed for customer ${CUST_ID}`, {
        CUST_ID,
        ACCT_NO,
        amount,
        amountToBank,
        amountToCustomer,
        fullName,
        relationshipManager: thriftAccount.RELATIONSHIP_MANAGER,
        transactionDate
      });

      res.status(200).json({
        success: true,
        message: amountToBank > 0 ? 'Last payment processed successfully - Amount sent to bank' : 'Daily collection processed successfully',
        data: {
          amountCollected: amount,
          amountToBank,
          amountToCustomer,
          customerAvailableBalance: thriftAccount.AMOUNT,
          customerAccountBalance: customer.accountBalance,
          isLastPayment: amountToBank > 0,
          relationshipManager: thriftAccount.RELATIONSHIP_MANAGER,
          TRANSACTION_DATE: transactionDate
        }
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      
      logger.error('Error processing daily collection:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

 // Process weekly collection
static async processWeeklyCollection(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { 
      CUST_ID, 
      ACCT_NO, 
      amount, 
      FULL_NAME: providedFullName,
      TRANSACTION_DATE // Add transaction date
    } = req.body;

    if (!CUST_ID || !ACCT_NO || !amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'CUST_ID, ACCT_NO, and amount are required'
      });
    }

    if (amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    // Set transaction date
    const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();

    const thriftAccount = await Thrift.findOne({ CUST_ID, ACCT_NO })
      .session(session);
    if (!thriftAccount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Thrift account not found'
      });
    }

    // Compute FULL_NAME if provided, else use from DB
    const fullName = providedFullName || thriftAccount.FULL_NAME;
    if (!fullName) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Full name is required for transaction'
      });
    }

    const customer = await Customer.findOne({ CUST_ID }).session(session);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    if (customer.accountBalance < amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // For weekly, check if it's the last week of month
    const today = transactionDate;
    const isLastWeekOfMonth = ThriftController.isLastWeekOfMonth(today);

    let amountToBank = 0;
    let amountToCustomer = amount;

    if (isLastWeekOfMonth) {
      amountToBank = amount;
      amountToCustomer = 0;
    }

    // Update accounts
    thriftAccount.AMOUNT += amountToCustomer;
    thriftAccount.lastCollectionDate = today;
    await thriftAccount.save({ session });

    customer.accountBalance -= amount;
    await customer.save({ session });

    const transaction = new Transaction({
      CUST_ID,
      ACCT_NO,
      ACCT_ID: thriftAccount.ACCT_ID,
      BU_ID: 1,
      ACCT_NM: `${fullName} Thrift Account`,
      AMOUNT: amount,
      TRANSACTION_TYPE: 'THRIFT_COLLECTION',
      description: `Thrift collection - ${amountToBank > 0 ? 'Last weekly payment to bank' : 'Weekly collection'}`,
      status: 'COMPLETED',
      createdBy: 'SYSTEM',
      TRANSACTION_DATE: transactionDate, // Add transaction date
      metadata: {
        amountToBank,
        amountToCustomer,
        isLastPayment: amountToBank > 0,
        collectionType: 'WEEKLY',
        collectionDate: today,
        direction: 'DEBIT',
        balanceAfter: customer.accountBalance,
        reference: `THRIFT_WEEKLY_${ACCT_NO}_${Date.now()}`,
        transactionDate: transactionDate // Also store in metadata
      }
    });

    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    logger.info(`Weekly collection processed for customer ${CUST_ID}`, {
      CUST_ID,
      ACCT_NO,
      amount,
      amountToBank,
      amountToCustomer,
      fullName,
      relationshipManager: thriftAccount.RELATIONSHIP_MANAGER,
      transactionDate
    });

    res.status(200).json({
  success: true,
  message: amountToBank > 0 ? 'Last weekly payment processed successfully' : 'Weekly collection processed successfully',
  data: {
    amountCollected: amount,
    amountToBank,
    amountToCustomer,
    customerAvailableBalance: thriftAccount.AMOUNT,
    customerAccountBalance: customer.accountBalance || 0, // Fallback to 0 if still null
    relationshipManager: thriftAccount.RELATIONSHIP_MANAGER,
    TRANSACTION_DATE: transactionDate
  }
});

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error('Error processing weekly collection:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
      });
    }
  }

 // Process monthly collection
static async processMonthlyCollection(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { 
      CUST_ID, 
      ACCT_NO, 
      amount, 
      FULL_NAME: providedFullName,
      TRANSACTION_DATE // Add transaction date
    } = req.body;

    if (!CUST_ID || !ACCT_NO || !amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'CUST_ID, ACCT_NO, and amount are required'
      });
    }

    if (amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    // Set transaction date
    const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();

    // Find thrift account
    const thriftAccount = await Thrift.findOne({ CUST_ID, ACCT_NO })
      .session(session);
    if (!thriftAccount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Thrift account not found'
      });
    }

    // Compute FULL_NAME if provided, else use from DB
    const fullName = providedFullName || thriftAccount.FULL_NAME;
    if (!fullName) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Full name is required for transaction'
      });
    }

    // Validate collection type
    if (thriftAccount.COLLECTION_TYPE !== 'MONTHLY') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'This account is not configured for monthly collections'
      });
    }

    // Find customer
    const customer = await Customer.findOne({ CUST_ID }).session(session);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if customer has sufficient balance
    if (customer.accountBalance < amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Get current date info for monthly specific logic
    const today = transactionDate;
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Check if this is the first monthly payment
    const isFirstPayment = await ThriftController.isFirstMonthlyPayment(thriftAccount.ACCT_NO);
    
    // Check if this is the last payment of the quarter
    const isQuarterEnd = ThriftController.isQuarterEnd(today);
    
    // Check if this is the last payment of the year
    const isYearEnd = ThriftController.isYearEnd(today);

    let amountToBank = 0;
    let amountToCustomer = amount;
    let description = 'Monthly thrift collection';

    // Business rules for monthly collections
    if (isFirstPayment) {
      amountToBank = amount;
      amountToCustomer = 0;
      description = 'First monthly payment to bank';
    } else if (isYearEnd) {
      amountToBank = amount;
      amountToCustomer = 0;
      description = 'Annual payment to bank';
    } else if (isQuarterEnd) {
      amountToBank = amount;
      amountToCustomer = 0;
      description = 'Quarterly payment to bank';
    }

    // Check if customer has already made payment for this month
    const existingPayment = await Transaction.findOne({
      CUST_ID,
      ACCT_NO,
      TRANSACTION_TYPE: 'THRIFT_COLLECTION',
      'metadata.collectionType': 'MONTHLY',
      'metadata.paymentMonth': currentMonth,
      'metadata.paymentYear': currentYear,
      status: 'COMPLETED'
    }).session(session);

    if (existingPayment && !isFirstPayment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Monthly payment already processed for this month'
      });
    }

    // Update thrift account
    thriftAccount.AMOUNT += amountToCustomer;
    thriftAccount.lastCollectionDate = today;
    await thriftAccount.save({ session });

    // Update customer balance
    customer.accountBalance -= amount;
    await customer.save({ session });

    // Create transaction record
    const transaction = new Transaction({
      CUST_ID,
      ACCT_NO,
      ACCT_ID: thriftAccount.ACCT_ID,
      BU_ID: 1,
      ACCT_NM: `${fullName} Thrift Account`,
      AMOUNT: amount,
      TRANSACTION_TYPE: 'THRIFT_COLLECTION',
      description: description,
      status: 'COMPLETED',
      createdBy: 'SYSTEM',
      TRANSACTION_DATE: transactionDate, // Add transaction date
      metadata: {
        amountToBank,
        amountToCustomer,
        isFirstPayment,
        isQuarterEnd,
        isYearEnd,
        collectionType: 'MONTHLY',
        paymentMonth: currentMonth,
        paymentYear: currentYear,
        quarter: ThriftController.getQuarter(today),
        collectionDate: today,
        direction: 'DEBIT',
        balanceAfter: customer.accountBalance,
        reference: `THRIFT_MONTHLY_${ACCT_NO}_${Date.now()}`,
        transactionDate: transactionDate // Also store in metadata
      }
    });

    await transaction.save({ session });

    // If this is a bank payment, create a separate bank transaction record
    if (amountToBank > 0) {
      const bankTransaction = new Transaction({
        CUST_ID,
        ACCT_NO,
        ACCT_ID: thriftAccount.ACCT_ID,
        BU_ID: 1,
        ACCT_NM: `${fullName} Thrift Account`,
        AMOUNT: amountToBank,
        TRANSACTION_TYPE: 'BANK_PAYMENT',
        description: `${description} - Bank transfer`,
        status: 'COMPLETED',
        createdBy: 'SYSTEM',
        TRANSACTION_DATE: transactionDate, // Add transaction date
        metadata: {
          paymentType: ThriftController.getBankPaymentType(isFirstPayment, isQuarterEnd, isYearEnd),
          thriftAccountNo: ACCT_NO,
          direction: 'DEBIT',
          balanceAfter: customer.accountBalance,
          reference: `BANK_PAYMENT_${ACCT_NO}_${Date.now()}`,
          transactionDate: transactionDate // Also store in metadata
        }
      });
      await bankTransaction.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    // Prepare response message based on payment type
    let message = 'Monthly collection processed successfully';
    if (isFirstPayment) {
      message = 'First monthly payment processed successfully - Amount sent to bank';
    } else if (isYearEnd) {
      message = 'Annual payment processed successfully - Amount sent to bank';
    } else if (isQuarterEnd) {
      message = 'Quarterly payment processed successfully - Amount sent to bank';
    }

    logger.info(`Monthly collection processed for customer ${CUST_ID}`, {
      CUST_ID,
      ACCT_NO,
      amount,
      amountToBank,
      amountToCustomer,
      fullName,
      isFirstPayment,
      isQuarterEnd,
      isYearEnd,
      relationshipManager: thriftAccount.RELATIONSHIP_MANAGER,
      transactionDate
    });

    res.status(200).json({
      success: true,
      message: message,
      data: {
        amountCollected: amount,
        amountToBank,
        amountToCustomer,
        customerAvailableBalance: thriftAccount.AMOUNT,
         customerAccountBalance: customer.accountBalance || 0, // Fallback to 0 if still null
        paymentType: ThriftController.getBankPaymentType(isFirstPayment, isQuarterEnd, isYearEnd),
        nextPaymentDate: ThriftController.getNextMonthlyPaymentDate(today),
        isFirstPayment,
        isQuarterEnd,
        isYearEnd,
        relationshipManager: thriftAccount.RELATIONSHIP_MANAGER,
        TRANSACTION_DATE: transactionDate
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    logger.error('Error processing monthly collection:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}


 // Process withdrawal from thrift account
  static async processWithdrawal(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { 
        CUST_ID, 
        ACCT_NO, 
        amount, 
        FULL_NAME: providedFullName,
        TRANSACTION_DATE // Add transaction date
      } = req.body;

      if (!CUST_ID || !ACCT_NO || !amount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'CUST_ID, ACCT_NO, and amount are required'
        });
      }

      if (amount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0'
        });
      }

      // Set transaction date
      const transactionDate = TRANSACTION_DATE ? new Date(TRANSACTION_DATE) : new Date();

      const thriftAccount = await Thrift.findOne({ CUST_ID, ACCT_NO })
        .session(session);
      if (!thriftAccount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Thrift account not found'
        });
      }

      // Compute FULL_NAME if provided, else use from DB
      const fullName = providedFullName || thriftAccount.FULL_NAME;
      if (!fullName) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Full name is required for transaction'
        });
      }

      const customer = await Customer.findOne({ CUST_ID }).session(session);
      if (!customer) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      if (thriftAccount.AMOUNT < amount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Insufficient thrift balance for withdrawal'
        });
      }

      thriftAccount.AMOUNT -= amount;
      await thriftAccount.save({ session });

      customer.accountBalance += amount;
      await customer.save({ session });

      const transaction = new Transaction({
        CUST_ID,
        ACCT_NO,
        ACCT_ID: thriftAccount.ACCT_ID,
        BU_ID: 1,
        ACCT_NM: `${fullName} Thrift Account`,
        AMOUNT: amount,
        TRANSACTION_TYPE: 'THRIFT_WITHDRAWAL',
        description: 'Withdrawal from thrift account',
        status: 'COMPLETED',
        createdBy: 'SYSTEM',
        TRANSACTION_DATE: transactionDate, // Add transaction date
        metadata: {
          direction: 'CREDIT',
          balanceAfter: customer.accountBalance,
          reference: `THRIFT_WITHDRAW_${ACCT_NO}_${Date.now()}`,
          transactionDate: transactionDate // Also store in metadata
        }
      });

      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      logger.info(`Withdrawal processed for customer ${CUST_ID}`, {
        CUST_ID,
        ACCT_NO,
        amount,
        remainingBalance: thriftAccount.AMOUNT,
        fullName,
        relationshipManager: thriftAccount.RELATIONSHIP_MANAGER,
        transactionDate
      });

      res.status(200).json({
        success: true,
        message: 'Withdrawal processed successfully',
        data: {
          amountWithdrawn: amount,
          remainingThriftBalance: thriftAccount.AMOUNT,
          customerAccountBalance: customer.accountBalance,
          relationshipManager: thriftAccount.RELATIONSHIP_MANAGER,
          TRANSACTION_DATE: transactionDate
        }
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
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
      const { CUST_ID, ACCT_NO } = req.params;

      const thriftAccount = await Thrift.findOne({ CUST_ID, ACCT_NO });
      if (!thriftAccount) {
        return res.status(404).json({
          success: false,
          message: 'Thrift account not found'
        });
      }

      const customer = await Customer.findOne({ CUST_ID });
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
          accountType: thriftAccount.accountType
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
        totalContributions: thriftAccount.AMOUNT
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
      const { CUST_ID } = req.params;

      const customer = await Customer.findOne({ CUST_ID });
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      const thriftAccounts = await Thrift.find({ CUST_ID });

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
            accountType: account.accountType
          }))
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
      const { page = 1, limit = 10, status, relationshipManagerId } = req.query;
      const skip = (page - 1) * limit;

      let query = {};
      if (status) query.status = status;
      if (relationshipManagerId) query.RELATIONSHIP_MANAGER = relationshipManagerId;

      const thriftAccounts = await Thrift.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

      const total = await Thrift.countDocuments(query);

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
            accountType: account.accountType
          })),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
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

  // Get monthly collection summary
  static async getMonthlyCollectionSummary(req, res) {
    try {
      const { CUST_ID, ACCT_NO, year, month } = req.params;

      const thriftAccount = await Thrift.findOne({ CUST_ID, ACCT_NO });
      if (!thriftAccount) {
        return res.status(404).json({
          success: false,
          message: 'Thrift account not found'
        });
      }

      // Get all monthly transactions for the specified period
      const query = {
        CUST_ID,
        ACCT_NO,
        TRANSACTION_TYPE: 'THRIFT_COLLECTION',
        'metadata.collectionType': 'MONTHLY',
        status: 'COMPLETED'
      };

      if (year) {
        query['metadata.paymentYear'] = parseInt(year);
      }
      if (month) {
        query['metadata.paymentMonth'] = parseInt(month);
      }

      const monthlyTransactions = await Transaction.find(query)
        .sort({ createdAt: 1 });

      // Calculate statistics
      const totalContributions = monthlyTransactions.reduce((sum, transaction) => 
        sum + transaction.AMOUNT, 0);
      
      const bankPayments = monthlyTransactions.filter(t => 
        t.metadata.amountToBank > 0);
      
      const totalBankPayments = bankPayments.reduce((sum, transaction) => 
        sum + transaction.metadata.amountToBank, 0);

      const customerPayments = monthlyTransactions.filter(t => 
        t.metadata.amountToCustomer > 0);
      
      const totalCustomerPayments = customerPayments.reduce((sum, transaction) => 
        sum + transaction.metadata.amountToCustomer, 0);

      const summary = {
        accountInfo: {
          CUST_ID: thriftAccount.CUST_ID,
          ACCT_NO: thriftAccount.ACCT_NO,
          ACCT_ID: thriftAccount.ACCT_ID,
          FULL_NAME: thriftAccount.FULL_NAME,
          RELATIONSHIP_MANAGER: thriftAccount.RELATIONSHIP_MANAGER,
          COLLECTION_TYPE: thriftAccount.COLLECTION_TYPE,
          currentBalance: thriftAccount.AMOUNT,
          accountType: thriftAccount.accountType
        },
        collectionSummary: {
          totalContributions,
          totalBankPayments,
          totalCustomerPayments,
          numberOfPayments: monthlyTransactions.length,
          numberOfBankPayments: bankPayments.length,
          bankPaymentTypes: bankPayments.map(payment => ({
            date: payment.createdAt,
            type: payment.metadata.paymentType,
            amount: payment.metadata.amountToBank
          })),
          paymentHistory: monthlyTransactions.map(transaction => ({
            date: transaction.createdAt,
            amount: transaction.AMOUNT,
            amountToBank: transaction.metadata.amountToBank,
            amountToCustomer: transaction.metadata.amountToCustomer,
            type: transaction.metadata.paymentType || 'REGULAR_PAYMENT'
          }))
        },
        nextScheduledPayment: {
          date: this.getNextMonthlyPaymentDate(new Date()),
          expectedAmount: thriftAccount.COLLECTION_TYPE === 'MONTHLY' ? 
            await this.calculateExpectedMonthlyAmount(thriftAccount.ACCT_NO) : 0
        }
      };

      res.status(200).json({
        success: true,
        data: summary
      });

    } catch (error) {
      logger.error('Error getting monthly collection summary:', error);
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
      const { CUST_ID, ACCT_NO } = req.params;
      const { page = 1, limit = 10, fromDate, toDate, type } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      if (!CUST_ID && !ACCT_NO) {
        return res.status(400).json({
          success: false,
          message: 'Either CUST_ID or ACCT_NO is required'
        });
      }

      let query = { };
      if (CUST_ID) query.CUST_ID = CUST_ID;
      if (ACCT_NO) query.ACCT_NO = ACCT_NO;

      // Filter by transaction type if provided
      if (type) {
        query.TRANSACTION_TYPE = type;
      }

      // Filter by date range if provided
      if (fromDate) {
        query.createdAt = { $gte: new Date(fromDate) };
      }
      if (toDate) {
        if (!query.createdAt) query.createdAt = {};
        query.createdAt.$lte = new Date(toDate);
      }

      const transactions = await Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-__v'); // Exclude version key

      const total = await Transaction.countDocuments(query);

      // Enrich transactions with account details if needed
      const enrichedTransactions = transactions.map(txn => ({
        ...txn.toObject(),
        // Add any additional computed fields if needed, e.g., formatted date
        formattedDate: txn.createdAt.toLocaleDateString(),
        formattedAmount: parseFloat(txn.AMOUNT).toLocaleString()
      }));

      res.status(200).json({
        success: true,
        data: {
          transactions: enrichedTransactions,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          },
          filters: {
            fromDate,
            toDate,
            type
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

  // Helper method to check if it's the last week of month
  static isLastWeekOfMonth(date) {
    const nextWeek = new Date(date);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.getMonth() !== date.getMonth();
  }

  // Helper method to check if it's the first monthly payment
  static async isFirstMonthlyPayment(ACCT_NO) {
    const existingPayments = await Transaction.countDocuments({
      ACCT_NO,
      TRANSACTION_TYPE: 'THRIFT_COLLECTION',
      'metadata.collectionType': 'MONTHLY',
      status: 'COMPLETED'
    });
    return existingPayments === 0;
  }

  // Helper method to check if it's quarter end
  static isQuarterEnd(date) {
    const month = date.getMonth();
    const quarterEndMonths = [2, 5, 8, 11]; // March, June, September, December
    return quarterEndMonths.includes(month);
  }

  // Helper method to check if it's year end
  static isYearEnd(date) {
    const month = date.getMonth();
    return month === 11; // December
  }

  // Helper method to get quarter
  static getQuarter(date) {
    const month = date.getMonth();
    return Math.floor(month / 3) + 1;
  }

  // Helper method to get bank payment type
  static getBankPaymentType(isFirstPayment, isQuarterEnd, isYearEnd) {
    if (isFirstPayment) return 'FIRST_PAYMENT';
    if (isYearEnd) return 'ANNUAL_PAYMENT';
    if (isQuarterEnd) return 'QUARTERLY_PAYMENT';
    return 'REGULAR_PAYMENT';
  }

  // Helper method to calculate next monthly payment date
  static getNextMonthlyPaymentDate(currentDate) {
    const nextPayment = new Date(currentDate);
    nextPayment.setMonth(nextPayment.getMonth() + 1);
    nextPayment.setDate(1);
    return nextPayment;
  }

  // Calculate expected monthly amount
  static async calculateExpectedMonthlyAmount(ACCT_NO) {
    // This could be based on account settings, previous payments, or fixed amount
    // For now, returning a default value
    return 5000;
  }

 // Auto-process monthly collections (for cron job) - Updated with transaction dates
  static async processAutoMonthlyCollections() {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const today = new Date();
      
      // Only run on the first day of the month for monthly collections
      if (today.getDate() !== 1) {
        logger.info('Not the first day of month. Skipping auto monthly collections.');
        return;
      }

      logger.info('Processing auto monthly thrift collections...');

      // Get all active monthly thrift accounts
      const monthlyAccounts = await Thrift.find({ 
        COLLECTION_TYPE: 'MONTHLY',
        status: 'active'
      })
        .session(session);

      let processedCount = 0;
      let failedCount = 0;

      for (const account of monthlyAccounts) {
        try {
          const customer = await Customer.findOne({ CUST_ID: account.CUST_ID }).session(session);
          
          if (customer) {
            const monthlyAmount = await this.calculateExpectedMonthlyAmount(account.ACCT_NO);
            
            if (customer.accountBalance >= monthlyAmount) {
              // Process the monthly collection
              const isFirstPayment = await this.isFirstMonthlyPayment(account.ACCT_NO);
              const isQuarterEnd = this.isQuarterEnd(today);
              const isYearEnd = this.isYearEnd(today);

              let amountToBank = 0;
              let amountToCustomer = monthlyAmount;

              if (isFirstPayment || isYearEnd || isQuarterEnd) {
                amountToBank = monthlyAmount;
                amountToCustomer = 0;
              }

              // Update accounts
              account.AMOUNT += amountToCustomer;
              account.lastCollectionDate = today;
              await account.save({ session });

              customer.accountBalance -= monthlyAmount;
              await customer.save({ session });

              // Create transaction record
              const transaction = new Transaction({
                CUST_ID: account.CUST_ID,
                ACCT_NO: account.ACCT_NO,
                ACCT_ID: account.ACCT_ID,
                BU_ID: 1,
                ACCT_NM: `${account.FULL_NAME} Thrift Account`,
                AMOUNT: monthlyAmount,
                TRANSACTION_TYPE: 'THRIFT_COLLECTION',
                description: `Auto monthly collection - ${amountToBank > 0 ? 'Bank payment' : 'Regular collection'}`,
                status: 'COMPLETED',
                createdBy: 'SYSTEM',
                TRANSACTION_DATE: today, // Add transaction date
                metadata: {
                  amountToBank,
                  amountToCustomer,
                  isFirstPayment,
                  isQuarterEnd,
                  isYearEnd,
                  collectionType: 'MONTHLY',
                  paymentMonth: today.getMonth(),
                  paymentYear: today.getFullYear(),
                  quarter: this.getQuarter(today),
                  isAutoProcessed: true,
                  direction: 'DEBIT',
                  balanceAfter: customer.accountBalance,
                  reference: `AUTO_MONTHLY_${account.ACCT_NO}_${Date.now()}`,
                  transactionDate: today // Also store in metadata
                }
              });

              await transaction.save({ session });
              processedCount++;
              logger.info(`Auto-processed monthly collection for account: ${account.ACCT_NO}`, {
                relationshipManager: account.RELATIONSHIP_MANAGER,
                transactionDate: today
              });
            } else {
              logger.warn(`Insufficient balance for auto monthly collection: ${account.ACCT_NO}`);
              failedCount++;
            }
          }
        } catch (accountError) {
          logger.error(`Error processing account ${account.ACCT_NO}:`, accountError);
          failedCount++;
        }
      }

      await session.commitTransaction();
      session.endSession();
      logger.info(`Auto monthly collections completed. Processed: ${processedCount}, Failed: ${failedCount}`);

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      logger.error('Error processing auto monthly collections:', error);
    }
  }
}


export default ThriftController;