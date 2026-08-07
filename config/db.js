// config/db.js - OPTIMIZED for high concurrency (5000+ users)
// FIXED: Explicit TCP enforcement, fallback to 'localhost' if 127.0.0.1 fails

import { Sequelize } from 'sequelize';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ============================================================
// Database configuration – read from .env with fallbacks
// ============================================================
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',        // Default IP
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: (process.env.DB_PASSWORD || process.env.DB_PASS || '').toString(),
  database: process.env.DB_NAME || 'core_banking',
  dialect: process.env.DB_DIALECT || 'mysql',
  timezone: process.env.DB_TIMEZONE || '+00:00',

  // Pool settings
  poolMax: parseInt(process.env.DB_POOL_MAX, 10) || 250,
  poolMin: parseInt(process.env.DB_POOL_MIN, 10) || 30,
  poolAcquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 30000,
  poolIdle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
  poolEvict: parseInt(process.env.DB_POOL_EVICT, 10) || 1000,

  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 400,
  ssl: process.env.DB_SSL === 'true',   // Only if explicitly set
};

console.log('🔧 Database Configuration:', {
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  password: dbConfig.password ? '*** (hidden)' : '(empty)',
  passwordLength: dbConfig.password.length,
  ssl: dbConfig.ssl,
  poolMax: dbConfig.poolMax,
  connectionLimit: dbConfig.connectionLimit,
});

// ============================================
// UTILITY: Try connecting with a given host
// ============================================
const tryConnection = async (host, port, user, password, database) => {
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    charset: 'utf8mb4',
    connectTimeout: 60000,
    ssl: false,
    socketPath: undefined,           // Force TCP (no named pipe)
  });
  const [rows] = await conn.execute(
    'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
    [database]
  );
  await conn.end();
  return rows.length > 0;
};

// ============================================
// ENSURE DATABASE EXISTS (with host fallback)
// ============================================
const ensureDatabaseExists = async (retries = 3) => {
  let lastError = null;
  const hosts = [dbConfig.host, 'localhost']; // Try primary, then localhost

  for (let host of hosts) {
    for (let i = 0; i < retries; i++) {
      let tempConnection;
      try {
        tempConnection = await mysql.createConnection({
          host: host,
          port: dbConfig.port,
          user: dbConfig.user,
          password: dbConfig.password,
          charset: 'utf8mb4',
          connectTimeout: 60000,
          ssl: false,
          socketPath: undefined,         // Force TCP
        });

        const [rows] = await tempConnection.execute(
          'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
          [dbConfig.database]
        );

        if (rows.length === 0) {
          console.log(`📦 Database '${dbConfig.database}' does not exist. Creating...`);
          await tempConnection.execute(
            `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`
             DEFAULT CHARACTER SET utf8mb4
             DEFAULT COLLATE utf8mb4_unicode_ci`
          );
          console.log(`✅ Database '${dbConfig.database}' created successfully`);
        } else {
          console.log(`✅ Database '${dbConfig.database}' already exists`);
        }

        // If we got here, host works – update dbConfig.host to the successful one
        dbConfig.host = host;
        console.log(`✅ Connected using host: ${host}`);
        return;
      } catch (error) {
        lastError = error;
        console.error(`❌ Error connecting via ${host} (attempt ${i+1}/${retries}):`, error.message);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
        }
      } finally {
        if (tempConnection) await tempConnection.end();
      }
    }
    // If we tried all retries for this host and failed, try next host
    if (lastError && lastError.code === 'ETIMEDOUT') {
      console.warn(`⚠️  Host ${host} timed out. Trying next host...`);
    }
  }

  // If all hosts failed, throw the last error
  throw lastError || new Error('Failed to connect to any host');
};

// ============================================
// CREATE SEQUELIZE INSTANCE
// ============================================

await ensureDatabaseExists();

const sequelize = new Sequelize(dbConfig.database, dbConfig.user, dbConfig.password, {
  host: dbConfig.host,   // now uses the successful host
  port: dbConfig.port,
  dialect: dbConfig.dialect,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: dbConfig.poolMax,
    min: dbConfig.poolMin,
    acquire: dbConfig.poolAcquire,
    idle: dbConfig.poolIdle,
    evict: dbConfig.poolEvict,
  },
  dialectOptions: {
    connectTimeout: 60000,
    decimalNumbers: true,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    socketPath: undefined,        // Force TCP
    ssl: false,                   // Explicitly disable SSL
    ...(dbConfig.ssl && {
      ssl: { rejectUnauthorized: false },
    }),
  },
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true,
  },
  timezone: dbConfig.timezone,
  retry: {
    max: 5,
    match: [
      /SequelizeConnectionError/,
      /SequelizeConnectionAcquireTimeoutError/,
      /ECONNRESET/,
      /Connection lost/
    ],
    backoffBase: 1000,
    backoffExponent: 1.5,
  },
});

// Test the connection
let connected = false;
for (let i = 0; i < 3; i++) {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');
    connected = true;
    break;
  } catch (error) {
    console.error(`❌ Unable to connect to the database (attempt ${i+1}/3):`, error.message);
    if (i === 2) {
      console.error('❌ All connection attempts failed. Exiting.');
      process.exit(1);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
if (!connected) process.exit(1);

console.log('✅ Sequelize instance created (optimized pool for high concurrency)');

// ============================================
// MYSQL2 POOL (same credentials)
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
      connectTimeout: 60000,
      socketPath: undefined,        // Force TCP
      ssl: false,
    });
    console.log('✅ MySQL2 pool created (limit: ' + dbConfig.connectionLimit + ')');
  }
  return mysqlPoolInstance;
};

export const getPool = () => {
  if (!mysqlPoolInstance) {
    return createMySQLPool();
  }
  return mysqlPoolInstance;
};

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
    await sequelize.close();
    await closePool();
    console.log('✅ All database connections closed');
  } catch (error) {
    console.error('❌ Error closing connections:', error.message);
  }
};

export const initializeDatabase = async () => {
  return { sequelize, mysqlPool: mysqlPoolInstance };
};

export default sequelize;
export { sequelize };

// Backward compatibility exports
export const getSequelize = async () => {
  if (!sequelize) {
    throw new Error('Sequelize not initialized. Call initializeDatabase() first.');
  }
  return sequelize;
};

export const getSequelizeInstance = async () => {
  if (!sequelize) {
    throw new Error('Sequelize not initialized. Call initializeDatabase() first.');
  }
  return sequelize;
};

export const sequelizeInstance = sequelize;
export const query = async (sql, options = {}) => sequelize.query(sql, options);
export const authenticate = async () => sequelize.authenticate();
export const sync = async (options = {}) => sequelize.sync(options);
export const models = () => sequelize.models;

console.log('✅ db.js exports configured with backward compatibility');