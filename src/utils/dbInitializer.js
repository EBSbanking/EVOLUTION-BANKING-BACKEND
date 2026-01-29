// utils/dbInitializer.js
import mysql from 'mysql2/promise';
import logger from './logger.js';
import { createError, ERROR_CODES } from './errorUtils.js';

// Get database connection from pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Fo$th3DR$=083',
  database: process.env.DB_NAME || 'core_banking',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Define table schemas
const tableSchemas = {
  systemdates: `
    CREATE TABLE IF NOT EXISTS systemdates (
      id INT PRIMARY KEY AUTO_INCREMENT,
      current_date DATE NOT NULL,
      next_business_date DATE NOT NULL,
      previous_business_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `,
  
  holidays: `
    CREATE TABLE IF NOT EXISTS holidays (
      id INT PRIMARY KEY AUTO_INCREMENT,
      date DATE NOT NULL,
      description VARCHAR(255) NOT NULL,
      recurring BOOLEAN DEFAULT TRUE,
      country VARCHAR(10) DEFAULT 'NG',
      created_by VARCHAR(100) DEFAULT 'system',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_holiday (date, country)
    ) ENGINE=InnoDB
  `,
  
  accounts: `
    CREATE TABLE IF NOT EXISTS accounts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      account_number VARCHAR(50) UNIQUE NOT NULL,
      customer_id INT NOT NULL,
      account_type ENUM('SAVINGS', 'CURRENT', 'LOAN', 'FIXED_DEPOSIT') NOT NULL,
      balance DECIMAL(15,2) DEFAULT 0.00,
      available_balance DECIMAL(15,2) DEFAULT 0.00,
      currency VARCHAR(3) DEFAULT 'NGN',
      status ENUM('ACTIVE', 'INACTIVE', 'DORMANT', 'CLOSED') DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customer (customer_id),
      INDEX idx_account_type (account_type)
    ) ENGINE=InnoDB
  `,
  
  loans: `
    CREATE TABLE IF NOT EXISTS loans (
      id INT PRIMARY KEY AUTO_INCREMENT,
      loan_number VARCHAR(50) UNIQUE NOT NULL,
      customer_id INT NOT NULL,
      account_id INT NOT NULL,
      principal_amount DECIMAL(15,2) NOT NULL,
      interest_rate DECIMAL(5,2) NOT NULL,
      term_months INT NOT NULL,
      remaining_balance DECIMAL(15,2) NOT NULL,
      status ENUM('ACTIVE', 'PAID', 'DEFAULTED', 'WRITTEN_OFF') DEFAULT 'ACTIVE',
      disbursement_date DATE NOT NULL,
      maturity_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customer (customer_id),
      INDEX idx_account (account_id)
    ) ENGINE=InnoDB
  `,
  
  transactions: `
    CREATE TABLE IF NOT EXISTS transactions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      transaction_reference VARCHAR(100) UNIQUE NOT NULL,
      account_id INT NOT NULL,
      customer_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      transaction_type ENUM('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT') NOT NULL,
      status ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED') DEFAULT 'COMPLETED',
      narration TEXT,
      balance_after DECIMAL(15,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_account (account_id),
      INDEX idx_customer (customer_id),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB
  `,
  
  thrifts: `
    CREATE TABLE IF NOT EXISTS thrifts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      thrift_number VARCHAR(50) UNIQUE NOT NULL,
      customer_id INT NOT NULL,
      thrift_type ENUM('DAILY', 'WEEKLY', 'MONTHLY') NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      status ENUM('ACTIVE', 'COMPLETED', 'TERMINATED') DEFAULT 'ACTIVE',
      start_date DATE NOT NULL,
      end_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customer (customer_id)
    ) ENGINE=InnoDB
  `,
  
  customers: `
    CREATE TABLE IF NOT EXISTS customers (
      id INT PRIMARY KEY AUTO_INCREMENT,
      customer_code VARCHAR(50) UNIQUE NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE,
      phone VARCHAR(20) UNIQUE NOT NULL,
      date_of_birth DATE,
      address TEXT,
      id_type ENUM('NIN', 'DRIVERS_LICENSE', 'VOTERS_CARD', 'PASSPORT'),
      id_number VARCHAR(100),
      status ENUM('ACTIVE', 'INACTIVE', 'BLACKLISTED') DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (email),
      INDEX idx_phone (phone)
    ) ENGINE=InnoDB
  `,
  
  ledgers: `
    CREATE TABLE IF NOT EXISTS ledgers (
      id INT PRIMARY KEY AUTO_INCREMENT,
      gl_code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      category ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE') NOT NULL,
      balance DECIMAL(15,2) DEFAULT 0.00,
      parent_gl_code VARCHAR(50),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_category (category),
      INDEX idx_parent (parent_gl_code)
    ) ENGINE=InnoDB
  `,
  
  gltransactionqueues: `
    CREATE TABLE IF NOT EXISTS gltransactionqueues (
      id INT PRIMARY KEY AUTO_INCREMENT,
      transaction_id INT NOT NULL,
      gl_code VARCHAR(50) NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      entry_type ENUM('DEBIT', 'CREDIT') NOT NULL,
      status ENUM('PENDING', 'PROCESSED', 'FAILED') DEFAULT 'PENDING',
      processed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_transaction (transaction_id),
      INDEX idx_gl_code (gl_code),
      INDEX idx_status (status)
    ) ENGINE=InnoDB
  `,
  
  reconciliations: `
    CREATE TABLE IF NOT EXISTS reconciliations (
      id INT PRIMARY KEY AUTO_INCREMENT,
      reconciliation_date DATE NOT NULL,
      account_id INT NOT NULL,
      statement_balance DECIMAL(15,2) NOT NULL,
      ledger_balance DECIMAL(15,2) NOT NULL,
      difference DECIMAL(15,2),
      status ENUM('MATCHED', 'UNMATCHED', 'ADJUSTED') DEFAULT 'UNMATCHED',
      reconciled_by VARCHAR(100),
      reconciled_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_account_date (account_id, reconciliation_date),
      INDEX idx_status (status)
    ) ENGINE=InnoDB
  `
};

export async function initializeCollections() {
  try {
    logger.info('Starting MySQL table initialization...');
    
    // Get connection from pool
    const connection = await pool.getConnection();
    
    try {
      // Initialize each table
      for (const [tableName, schemaSQL] of Object.entries(tableSchemas)) {
        try {
          // Execute the CREATE TABLE IF NOT EXISTS statement
          await connection.execute(schemaSQL);
          logger.info(`Table ${tableName} is ready`);
          
          // Add sample data for holidays table
          if (tableName === 'holidays') {
            try {
              // Check if we already have holidays
              const [existingHolidays] = await connection.execute(
                'SELECT COUNT(*) as count FROM holidays'
              );
              
              if (existingHolidays[0].count === 0) {
                // Add a sample holiday
                const nextYear = new Date().getFullYear() + 1;
                await connection.execute(
                  'INSERT INTO holidays (date, description, recurring, country, created_by) VALUES (?, ?, ?, ?, ?)',
                  [`${nextYear}-01-01`, 'New Year Day', true, 'NG', 'system']
                );
                logger.info('Added sample holiday for testing');
              }
            } catch (holidayError) {
              logger.warn(`Could not check/add sample holiday: ${holidayError.message}`);
            }
          }
        } catch (tableError) {
          logger.warn(`Table ${tableName} initialization issue:`, { error: tableError.message });
        }
      }
      
      logger.info('All MySQL tables initialized successfully');
      
    } finally {
      // Always release the connection back to the pool
      connection.release();
    }
    
  } catch (error) {
    logger.error('Failed to initialize MySQL tables', { error: error.message });
    throw createError(ERROR_CODES.DATABASE_ERROR, `Database initialization failed: ${error.message}`);
  }
}

// Export pool for use in other modules
export { pool };