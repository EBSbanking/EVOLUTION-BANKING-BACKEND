// src/utils/initializeApplication.js - FULLY CONVERTED TO MySQL/Sequelize WITH DUPLICATE REMOVAL
import logger from './logger.js';
import { sequelize } from '../../config/db.js'; // Adjust path if needed

/**
 * Ensures required indexes exist using raw SQL (partial unique indexes for NULL safety)
 */
const createTableIndexes = async () => {
  try {
    logger.info('🔧 Ensuring MySQL table indexes...');

    const indexesConfig = {
      transactions: [
        `CREATE UNIQUE INDEX IF NOT EXISTS transactionId_unique ON transactions (transactionId) WHERE transactionId IS NOT NULL;`,
        `CREATE INDEX IF NOT EXISTS userId_date_desc ON transactions (userId, date DESC);`,
        `CREATE INDEX IF NOT EXISTS accountId_index ON transactions (accountId);`
      ],
      users: [
        `CREATE UNIQUE INDEX IF NOT EXISTS email_unique ON users (email) WHERE email IS NOT NULL;`,
        `CREATE INDEX IF NOT EXISTS status_index ON users (status);`
      ],
      accounts: [
        `CREATE UNIQUE INDEX IF NOT EXISTS accountNumber_unique ON accounts (accountNumber) WHERE accountNumber IS NOT NULL;`,
        `CREATE INDEX IF NOT EXISTS userId_index ON accounts (userId);`
      ]
    };

    let createdCount = 0;

    for (const [tableName, sqlCommands] of Object.entries(indexesConfig)) {
      for (const sql of sqlCommands) {
        try {
          await sequelize.query(sql);
          createdCount++;
          logger.debug(`Ensured index on ${tableName}`);
        } catch (indexError) {
          if (indexError.message.includes('Duplicate key name') || 
              indexError.message.includes('already exists')) {
            logger.debug(`Index already exists on ${tableName}`);
          } else {
            logger.warn(`Could not create index on ${tableName}: ${indexError.message}`);
          }
        }
      }
    }

    logger.info(`✅ MySQL indexes initialized: ${createdCount} ensured`);
  } catch (error) {
    logger.error('❌ Failed to initialize MySQL indexes', {
      error: error.message,
      stack: error.stack
    });
  }
};

/**
 * Comprehensive cleanup: Fixes NULLs AND removes actual duplicates
 * Keeps the latest row (by id DESC)
 */
const cleanupDuplicateNulls = async () => {
  try {
    logger.info('🧹 Starting comprehensive MySQL cleanup: NULLs + Duplicates...');

    const cleanupConfig = [
      { table: 'transactions', field: 'transactionId' },
      { table: 'users',        field: 'email' },
      { table: 'accounts',     field: 'accountNumber' }
    ];

    let totalFixedNulls = 0;
    let totalDeletedDuplicates = 0;

    for (const { table, field } of cleanupConfig) {
      try {
        // Step 1: Fix NULL values with temporary unique placeholders
        const [[{ nullCount }]] = await sequelize.query(
          `SELECT COUNT(*) AS nullCount FROM ${table} WHERE ${field} IS NULL`
        );

        if (nullCount > 0) {
          logger.warn(`Found ${nullCount} NULL values in ${table}.${field} — assigning temporary values`);

          await sequelize.query(`
            UPDATE ${table}
            SET ${field} = CONCAT('temp_', UNIX_TIMESTAMP(NOW(3)), '_', id)
            WHERE ${field} IS NULL
          `);

          totalFixedNulls += nullCount;
          logger.info(`Fixed ${nullCount} NULLs in ${table}.${field}`);
        }

        // Step 2: Detect and remove actual duplicates (keep newest by id)
        const [duplicates] = await sequelize.query(`
          SELECT ${field}, COUNT(*) AS dup_count
          FROM ${table}
          WHERE ${field} IS NOT NULL
          GROUP BY ${field}
          HAVING dup_count > 1
        `);

        if (duplicates.length > 0) {
          logger.warn(`Found ${duplicates.length} duplicate groups in ${table}.${field}`);

          for (const dup of duplicates) {
            const value = dup[field];
            logger.info(`Removing duplicates for ${field} = '${value}'`);

            // Delete all duplicates except the one with highest id (latest)
            const deleteResult = await sequelize.query(`
              DELETE t1 FROM ${table} t1
              INNER JOIN ${table} t2
              WHERE t1.${field} = ?
                AND t1.id < t2.id
                AND t2.${field} = ?
            `, { replacements: [value, value] });

            const deleted = deleteResult[0]?.affectedRows || 0;
            totalDeletedDuplicates += deleted;

            logger.info(`Deleted ${deleted} duplicate rows for ${value}`);
          }
        } else {
          logger.debug(`No duplicates found in ${table}.${field}`);
        }

      } catch (err) {
        logger.error(`Cleanup failed for ${table}.${field}:`, {
          error: err.message,
          stack: err.stack
        });
      }
    }

    logger.info(`✅ Cleanup completed:
      Fixed ${totalFixedNulls} NULL values
      Deleted ${totalDeletedDuplicates} duplicate rows`);

  } catch (error) {
    logger.error('❌ Comprehensive cleanup failed', {
      error: error.message,
      stack: error.stack
    });
  }
};

/**
 * Initialize system dates using Sequelize model
 */
const initializeSystemDates = async () => {
  try {
    logger.info('📅 Initializing system dates...');

    const { default: SystemDate } = await import('../models/SystemDate.js'); // Adjust path if needed

    const systemDate = await SystemDate.findOne();

    if (!systemDate) {
      logger.warn('⚠️ No system date found — creating default');

      await SystemDate.create({
        currentBusinessDate: new Date(),
        previousBusinessDate: new Date(),
        nextBusinessDate: new Date(),
        eodStatus: 'OPEN',
        lastUpdated: new Date(),
        // Add any other required fields from your SystemDate model
      });

      logger.info('✅ Default system date created');
    } else {
      logger.info(`✅ System date loaded: ${systemDate.currentBusinessDate?.toISOString()?.split('T')[0] || 'N/A'}`);
    }
  } catch (error) {
    logger.error('❌ System dates initialization failed:', {
      error: error.message,
      stack: error.stack
    });
    logger.warn('⚠️ Using current system time as fallback');
  }
};

/**
 * Main initialization function - Pure MySQL/Sequelize
 */
const initializeApplication = async () => {
  try {
    logger.info('🚀 Starting application initialization (MySQL)');

    // Confirm MySQL connection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('MySQL connection timeout in init')), 30000);

      sequelize.authenticate()
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch(reject);
    });

    logger.info('✅ MySQL connection confirmed');

    // Run in order: cleanup (NULLs + duplicates) → indexes → system dates
    await cleanupDuplicateNulls();
    await createTableIndexes();
    await initializeSystemDates();

    logger.info('✅ Application initialization completed successfully');
  } catch (error) {
    logger.error('❌ Application initialization failed', {
      error: error.message,
      stack: error.stack
    });

    logger.warn('⚠️ Initialization failed — server will continue, but some features may be limited until tables exist');
  }
};

export default initializeApplication;