// utils/generateCustomerNumber.js
import { initializeModels, getCustomer } from '../models/index.js';
import sequelize from '../../config/db.js';        // ✅ Direct import (same as Counter.js)

// Constants
const CUST_ID_LENGTH = 10;
const CUST_NO_LENGTH = 9;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

// New start values
const INITIAL_CUST_ID_BASE = 99999999;     // 0099999999 (last used before 0100000000)
const INITIAL_CUST_NO_BASE = 0;            // 000000000 (last used before 000000001)

let Customer = null;
let modelsInitialized = false;

// Initialize models
const initModelsForUtility = async () => {
  if (modelsInitialized) return { Customer, sequelize };

  try {
    console.log('🔄 Initializing models for generateCustomerNumber...');
    const models = await initializeModels();
    Customer = getCustomer();
    if (!Customer || typeof Customer.findOne !== 'function') {
      throw new Error('Customer model not properly initialized');
    }
    console.log('✅ Models initialized');
    modelsInitialized = true;
    return { Customer, sequelize };
  } catch (error) {
    console.error('❌ Model initialization failed:', error);
    throw error;
  }
};

// Safe DB operation with retry
const safeDbOperation = async (operation, maxRetries = 3, delay = 100) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await initModelsForUtility();
      if (!Customer) throw new Error('Customer model not initialized');
      return await operation();
    } catch (error) {
      console.warn(`⚠️ Attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) throw error;
      const backoffDelay = delay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      modelsInitialized = false;
    }
  }
};

// Verify / repair counter table (uses correct sequelize.query)
const verifyAndRepairCounter = async () => {
  try {
    console.log('🔍 Verifying counter table...');
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_counter'
    `);

    if (tables.length === 0) {
      console.log('🔄 Creating counter table...');
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS customer_counter (
          id INT AUTO_INCREMENT PRIMARY KEY,
          counter_type VARCHAR(50) NOT NULL UNIQUE,
          last_used_id VARCHAR(50) NOT NULL,
          last_used_number VARCHAR(50) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      // Insert with new initial values
      await sequelize.query(`
        INSERT INTO customer_counter (counter_type, last_used_id, last_used_number) 
        VALUES ('customer', '0099999999', '000000000')
      `);
      console.log('✅ Counter table created with new start values');
    } else {
      // Check if old default exists and update if needed
      const [rows] = await sequelize.query(`
        SELECT last_used_id, last_used_number FROM customer_counter WHERE counter_type = 'customer'
      `);
      if (rows.length && rows[0].last_used_id === '0000000000' && rows[0].last_used_number === '000000000') {
        console.log('🔄 Updating old counter to new start values (0099999999 / 000000000)');
        await sequelize.query(`
          UPDATE customer_counter SET last_used_id = '0099999999', last_used_number = '000000000', updated_at = NOW()
          WHERE counter_type = 'customer'
        `);
      }
      console.log('✅ Counter table ready');
    }
    return true;
  } catch (error) {
    console.error('❌ Counter table error:', error.message);
    return false;
  }
};

// Get last used numbers from DB
const getLastUsedNumbers = async () => {
  return await safeDbOperation(async () => {
    await verifyAndRepairCounter();
    const [results] = await sequelize.query(`
      SELECT last_used_id, last_used_number FROM customer_counter WHERE counter_type = 'customer' LIMIT 1
    `);
    if (results.length) {
      return { lastCUST_ID: results[0].last_used_id, lastCUST_NO: results[0].last_used_number };
    }
    return { lastCUST_ID: '0099999999', lastCUST_NO: '000000000' };
  });
};

// Update last used numbers
const updateLastUsedNumbers = async (custId, custNo) => {
  await safeDbOperation(async () => {
    await sequelize.query(`
      UPDATE customer_counter SET last_used_id = ?, last_used_number = ?, updated_at = NOW()
      WHERE counter_type = 'customer'
    `, { replacements: [custId, custNo] });
    console.log(`📊 Counter updated: CUST_ID=${custId}, CUST_NO=${custNo}`);
  });
};

// Check if CUST_ID already exists
const customerIdExists = async (custId) => {
  return await safeDbOperation(async () => {
    const existing = await Customer.findOne({ where: { CUST_ID: custId }, attributes: ['id'] });
    return !!existing;
  });
};

// Check if CUST_NO already exists
const customerNumberExists = async (custNo) => {
  return await safeDbOperation(async () => {
    const existing = await Customer.findOne({ where: { CUST_NO: custNo }, attributes: ['id'] });
    return !!existing;
  });
};

// Find next available (both ID and Number)
const findNextAvailable = async (lastId, lastNo) => {
  let idBase = parseInt(lastId, 10);
  let noBase = parseInt(lastNo, 10);
  let attempts = 0;
  const maxAttempts = 1000;

  while (attempts < maxAttempts) {
    const nextIdBase = idBase + 1;
    const nextNoBase = noBase + 1;
    const proposedId = String(nextIdBase).padStart(CUST_ID_LENGTH, '0');
    const proposedNo = String(nextNoBase).padStart(CUST_NO_LENGTH, '0');

    const idUsed = await customerIdExists(proposedId);
    const noUsed = await customerNumberExists(proposedNo);

    if (!idUsed && !noUsed) {
      return {
        CUST_ID: proposedId,
        CUST_NO: proposedNo,
        idBase: nextIdBase,
        noBase: nextNoBase
      };
    }
    idBase = nextIdBase;
    noBase = nextNoBase;
    attempts++;
  }
  throw new Error('Could not find free customer ID/number after many attempts');
};

// Main generation function
const generateCustomerNumber = async () => {
  try {
    await initModelsForUtility();
    const { lastCUST_ID, lastCUST_NO } = await getLastUsedNumbers();
    console.log(`📊 Last used: CUST_ID=${lastCUST_ID}, CUST_NO=${lastCUST_NO}`);

    const { CUST_ID, CUST_NO, idBase, noBase } = await findNextAvailable(lastCUST_ID, lastCUST_NO);
    await updateLastUsedNumbers(CUST_ID, CUST_NO);
    console.log(`✅ Generated: CUST_ID=${CUST_ID}, CUST_NO=${CUST_NO}`);
    return {
      CUST_ID,
      CUST_NO,
      lastCUST_ID,
      lastCUST_NO,
      isFallback: false
    };
  } catch (error) {
    console.error('❌ Generation failed:', error);
    return generateFallbackCustomerNumber();
  }
};

// Fallback (timestamp based)
const generateFallbackCustomerNumber = async () => {
  console.log('⚠️ Using fallback generation');
  let startId = 100000000; // 0100000000 in 10-digit
  let startNo = 1;         // 000000001 in 9-digit
  try {
    const { lastCUST_ID, lastCUST_NO } = await getLastUsedNumbers();
    startId = parseInt(lastCUST_ID, 10) + 1;
    startNo = parseInt(lastCUST_NO, 10) + 1;
  } catch (e) {}
  const safeId = Math.min(startId, 9999999999);
  const safeNo = Math.min(startNo, 999999999);
  const CUST_ID = String(safeId).padStart(CUST_ID_LENGTH, '0');
  const CUST_NO = String(safeNo).padStart(CUST_NO_LENGTH, '0');
  return {
    CUST_ID,
    CUST_NO,
    isFallback: true,
    timestamp: new Date().toISOString()
  };
};

// Exports
export { generateCustomerNumber };
export const generateCustomerNumberLegacy = async () => generateCustomerNumber();
export const getCurrentCounterStatus = async () => {
  try {
    await initModelsForUtility();
    const { lastCUST_ID, lastCUST_NO } = await getLastUsedNumbers();
    const customerCount = await safeDbOperation(() => Customer.count());
    const highestCustomer = await safeDbOperation(() => Customer.findOne({
      order: [['CUST_ID', 'DESC']],
      attributes: ['CUST_ID', 'CUST_NO', 'CUST_NM']
    }));
    return {
      counter: { lastCUST_ID, lastCUST_NO },
      database: {
        customerCount,
        highestCustomer: highestCustomer ? {
          CUST_ID: highestCustomer.CUST_ID,
          CUST_NO: highestCustomer.CUST_NO,
          name: highestCustomer.CUST_NM
        } : null
      },
      isInSync: highestCustomer ? lastCUST_ID === highestCustomer.CUST_ID : true,
      modelsInitialized,
      CustomerModel: Customer ? '✅ Loaded' : '❌ Not loaded',
      sequelize: sequelize ? '✅ Loaded' : '❌ Not loaded'
    };
  } catch (error) {
    return { error: error.message };
  }
};

export const resetCounter = async (newCustId = '0099999999', newCustNo = '000000000') => {
  try {
    await initModelsForUtility();
    if (!/^\d{10}$/.test(newCustId) || !/^\d{9}$/.test(newCustNo)) {
      throw new Error('CUST_ID must be 10 digits, CUST_NO must be 9 digits');
    }
    await safeDbOperation(async () => {
      await sequelize.query(`
        UPDATE customer_counter SET last_used_id = ?, last_used_number = ?, updated_at = NOW()
        WHERE counter_type = 'customer'
      `, { replacements: [newCustId, newCustNo] });
    });
    return { success: true, message: 'Counter reset', newCUST_ID: newCustId, newCUST_NO: newCustNo };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export const generateSimpleCustomerNumber = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const base = parseInt(timestamp.toString().slice(-6) + random.toString().padStart(4, '0'), 10) % 10000000000;
  return {
    CUST_ID: String(base).padStart(CUST_ID_LENGTH, '0'),
    CUST_NO: String(base % 1000000000).padStart(CUST_NO_LENGTH, '0'),
    isSimple: true
  };
};

export default generateCustomerNumber;