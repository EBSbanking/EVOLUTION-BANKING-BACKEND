// config/db.js - COMPLETE CORRECTED VERSION
import { Sequelize } from 'sequelize';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'core_banking',
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
};

console.log('🔧 Database Configuration:', {
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  password: dbConfig.password ? '*** (hidden)' : '(empty)',
  connectionLimit: dbConfig.connectionLimit,
});

// ============================================
// MYSQL2 POOL
// ============================================

let mysqlPoolInstance = null;

const createMySQLPool = () => {
  if (!mysqlPoolInstance) {
    mysqlPoolInstance = mysql.createPool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      waitForConnections: true,
      connectionLimit: dbConfig.connectionLimit,
      queueLimit: 0,
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
        if (field.type === 'TINY' && field.length === 1) {
          return field.string() === '1';
        }
        return next();
      }
    });
    console.log('✅ MySQL2 pool created');
  }
  return mysqlPoolInstance;
};

// ============================================
// SEQUELIZE INSTANCE
// ============================================

let sequelizeInstance = null;

const createSequelize = () => {
  if (!sequelizeInstance) {
    sequelizeInstance = new Sequelize(dbConfig.database, dbConfig.user, dbConfig.password, {
      host: dbConfig.host,
      port: dbConfig.port,
      dialect: 'mysql',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: dbConfig.connectionLimit,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      dialectOptions: {
        connectTimeout: 10000,
        decimalNumbers: true,
        charset: 'utf8mb4',
        supportBigNumbers: true,
        bigNumberStrings: true,
      },
      define: {
        timestamps: true,
        underscored: true,
        freezeTableName: true,
      },
      timezone: '+00:00',
    });
    console.log('✅ Sequelize instance created');
  }
  return sequelizeInstance;
};

// ============================================
// EXPORT FUNCTIONS (individual exports)
// ============================================

// Each function is exported individually
export const getSequelize = () => {
  if (!sequelizeInstance) {
    return createSequelize();
  }
  return sequelizeInstance;
};

export const getPool = () => {
  if (!mysqlPoolInstance) {
    return createMySQLPool();
  }
  return mysqlPoolInstance;
};

export const initializePool = () => getPool();

export const getConnection = async () => {
  const pool = getPool();
  const connection = await pool.getConnection();
  await connection.execute('SET time_zone = "+00:00"');
  await connection.execute('SET SESSION sql_mode = "STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION"');
  return connection;
};

export const executeQuery = async (sql, params = []) => {
  const connection = await getConnection();
  try {
    const [result] = await connection.execute(sql, params);
    return result;
  } finally {
    connection.release();
  }
};

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

export const closePool = async () => {
  if (mysqlPoolInstance) {
    await mysqlPoolInstance.end();
    mysqlPoolInstance = null;
    console.log('✅ Database pool closed');
  }
};

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

export const closeConnections = async () => {
  try {
    if (sequelizeInstance) await sequelizeInstance.close();
    await closePool();
    console.log('✅ All database connections closed');
  } catch (error) {
    console.error('❌ Error closing connections:', error.message);
  }
};

// ============================================
// CREATE INSTANCES AND ALIASES
// ============================================

// Create instances
const sequelize = getSequelize();
const mysqlPool = getPool();

// Create alias for backward compatibility
const checkConnection = checkDatabaseHealth;

// ============================================
// EXPORTS - SIMPLE AND CORRECT
// ============================================

// Export only the instances and aliases (functions are already exported individually above)
export { sequelize, mysqlPool, checkConnection };

// Create a comprehensive db object
const db = {
  // Instances
  sequelize,
  mysqlPool,
  
  // Functions (already exported individually above)
  getSequelize,
  getPool,
  initializePool,
  getConnection,
  executeQuery,
  executeTransaction,
  closePool,
  checkDatabaseHealth,
  closeConnections,
  
  // Aliases
  checkConnection,
  
  // For backward compatibility
  pool: mysqlPool,
  connection: sequelize
};

// Export sequelize as default for models that use: import sequelize from './config/db.js'
export default sequelize;

// Attach utilities to sequelize instance for convenience
Object.assign(sequelize, db);