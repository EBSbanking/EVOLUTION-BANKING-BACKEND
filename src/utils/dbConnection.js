import mysql from 'mysql2/promise';
import { logger } from './logger.js';

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'core_banking',
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  queueLimit: parseInt(process.env.DB_QUEUE_LIMIT, 10) || 0,
};

// Database pool
let pool;

// Initialize database pool
export const initializePool = () => {
  if (pool) {
    logger.info('Database pool already initialized');
    return pool;
  }

  logger.info('Initializing database pool...', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user
  });

  pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: dbConfig.connectionLimit,
    queueLimit: dbConfig.queueLimit,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: true,
    connectTimeout: 10000,
    debug: process.env.NODE_ENV === 'development',
    multipleStatements: false,
    typeCast: function (field, next) {
      // Convert TINYINT(1) to boolean
      if (field.type === 'TINY' && field.length === 1) {
        return field.string() === '1';
      }
      return next();
    }
  });

  // Test initial connection
  pool.getConnection((err, connection) => {
    if (err) {
      logger.error('Database connection failed:', { error: err.message });
    } else {
      logger.info('Database connection successful');
      
      // Check database version
      connection.query('SELECT VERSION() as version', (versionErr, results) => {
        if (!versionErr && results[0]) {
          logger.info(`MySQL Version: ${results[0].version}`);
        }
        connection.release();
      });
    }
  });

  // Handle pool errors
  pool.on('error', (err) => {
    logger.error('Database pool error:', { error: err.message });
    
    // Attempt to reconnect after delay
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || 
        err.code === 'ECONNREFUSED' || 
        err.code === 'ETIMEDOUT') {
      logger.info('Attempting to reconnect to database in 5 seconds...');
      setTimeout(() => {
        pool = null;
        initializePool();
      }, 5000);
    }
  });

  return pool;
};

// Get database connection
export const getConnection = async () => {
  if (!pool) {
    initializePool();
  }
  
  try {
    const connection = await pool.getConnection();
    
    // Set session variables for consistency
    await connection.execute('SET time_zone = "+00:00"');
    await connection.execute('SET SESSION sql_mode = "STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION"');
    
    return connection;
  } catch (error) {
    logger.error('Failed to get database connection:', { error: error.message });
    
    // Check if pool initialization is needed
    if (error.code === 'PROTOCOL_CONNECTION_LOST' || 
        error.code === 'ECONNREFUSED' || 
        error.code === 'ETIMEDOUT') {
      logger.info('Reinitializing database pool...');
      pool = null;
      initializePool();
      
      // Retry once
      try {
        const connection = await pool.getConnection();
        logger.info('Reconnection successful');
        return connection;
      } catch (retryError) {
        throw new Error(`Failed to connect to database after retry: ${retryError.message}`);
      }
    }
    
    throw error;
  }
};

// Execute query helper
export const executeQuery = async (sql, params = []) => {
  const connection = await getConnection();
  
  try {
    const [result] = await connection.execute(sql, params);
    return result;
  } catch (error) {
    logger.error('Query execution failed:', {
      error: error.message,
      query: sql,
      params: params
    });
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Execute transaction
export const executeTransaction = async (callback) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Close pool (for graceful shutdown)
export const closePool = async () => {
  if (pool) {
    try {
      await pool.end();
      logger.info('Database pool closed successfully');
      pool = null;
    } catch (error) {
      logger.error('Error closing database pool:', { error: error.message });
    }
  }
};

// Health check
export const checkDatabaseHealth = async () => {
  try {
    const connection = await getConnection();
    const [result] = await connection.query('SELECT 1 as health_check, NOW() as timestamp');
    connection.release();
    
    return {
      status: 'healthy',
      timestamp: result[0].timestamp,
      database: dbConfig.database,
      message: 'Database connection is healthy'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: dbConfig.database,
      error: error.message,
      message: 'Database connection failed'
    };
  }
};

export default {
  initializePool,
  getConnection,
  executeQuery,
  executeTransaction,
  closePool,
  checkDatabaseHealth
};