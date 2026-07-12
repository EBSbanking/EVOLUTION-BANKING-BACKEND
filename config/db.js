// config/db.js - OPTIMIZED for high concurrency (1000+ users)
import { Sequelize } from 'sequelize';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the project root (two levels up from /config)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Database configuration – read from .env with fallbacks
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  // ✅ Ensure password is always a string (never undefined/null)
  password: (process.env.DB_PASSWORD || process.env.DB_PASS || '').toString(),
  database: process.env.DB_NAME || 'core_banking',
  dialect: process.env.DB_DIALECT || 'mysql',
  timezone: process.env.DB_TIMEZONE || '+00:00',
  poolMax: parseInt(process.env.DB_POOL_MAX, 10) || 50,
  poolMin: parseInt(process.env.DB_POOL_MIN, 10) || 10,
  poolAcquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 30000,
  poolIdle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
  poolEvict: parseInt(process.env.DB_POOL_EVICT, 10) || 1000,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 100,
  ssl: process.env.DB_SSL === 'true',
};

console.log('🔧 Database Configuration:', {
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  password: dbConfig.password ? '*** (hidden)' : '(empty)',
  passwordLength: dbConfig.password.length, // ✅ debug: show length (remove later)
  poolMax: dbConfig.poolMax,
  poolMin: dbConfig.poolMin,
  connectionLimit: dbConfig.connectionLimit,
});

// ============================================
// ENSURE DATABASE EXISTS (with retry)
// ============================================
const ensureDatabaseExists = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    let tempConnection;
    try {
      // ✅ Explicitly pass password as string (already done)
      tempConnection = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password, // now guaranteed string
        charset: 'utf8mb4',
        connectTimeout: 10000,
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
      return; // success
    } catch (error) {
      console.error(`❌ Error ensuring database exists (attempt ${i+1}/${retries}):`, error.message);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // exponential backoff
    } finally {
      if (tempConnection) await tempConnection.end();
    }
  }
};

// ============================================
// CREATE REAL SEQUELIZE INSTANCE
// ============================================

await ensureDatabaseExists();

const sequelize = new Sequelize(dbConfig.database, dbConfig.user, dbConfig.password, {
  host: dbConfig.host,
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
    connectTimeout: 30000,
    decimalNumbers: true,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ...(dbConfig.ssl && {
      ssl: {
        rejectUnauthorized: false,
      },
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

// Test the connection with retry
let connected = false;
for (let i = 0; i < 3; i++) {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');
    connected = true;
    break;
  } catch (error) {
    console.error(`❌ Unable to connect to the database (attempt ${i+1}/3):`, error.message);
    if (i === 2) process.exit(1);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
if (!connected) process.exit(1);

console.log('✅ Sequelize instance created (optimized pool)');

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
      connectTimeout: 30000,
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