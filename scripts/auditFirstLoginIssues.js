// scripts/auditFirstLoginIssues.js
import { sequelize } from '../../config/db.js';      // adjust to your DB config path
import User from '../src/models/User.js';            // adjust to your User model path
import Login from '../src/models/Login.js';          // adjust to your Login model path
import logger from '../utils/logger.js';             // adjust to your logger path
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment (optional – your app already loads .env)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Audit users with firstLogin = true
 * If a user has any successful login, set firstLogin = false
 */
const auditFirstLoginIssues = async () => {
  let transaction;

  try {
    // Authenticate DB connection (optional – can be removed if already connected)
    await sequelize.authenticate();
    logger.info('Database connection established for first login audit');

    // Start transaction for consistency
    transaction = await sequelize.transaction();

    // Find users with firstLogin = true
    const users = await User.findAll({
      where: { firstLogin: true },
      attributes: ['id', 'user_name', 'firstLogin'],
      transaction,
      raw: true,
    });

    logger.info(`Found ${users.length} users with firstLogin: true`);

    let correctedCount = 0;

    for (const user of users) {
      // Count successful logins for this user
      const successfulLogins = await Login.count({
        where: {
          user_id: user.id,
          success: true,
          status: 'Success',
        },
        transaction,
      });

      if (successfulLogins > 0) {
        logger.warn(
          `User ${user.user_name} has firstLogin=true but ${successfulLogins} successful logins`,
          {
            user_id: user.id,
            successfulLogins,
          }
        );

        // Update firstLogin to false
        await User.update(
          { firstLogin: false },
          {
            where: { id: user.id },
            transaction,
          }
        );

        correctedCount++;
        logger.info(`Corrected firstLogin flag for user ${user.user_name}`);
      }
    }

    await transaction.commit();

    logger.info(`First login audit completed – corrected ${correctedCount} users`);
  } catch (error) {
    if (transaction) await transaction.rollback();
    logger.error('Error during first login audit', { error: error.message });
    throw error;
  }
};

// Run the script if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      await auditFirstLoginIssues();
      process.exit(0);
    } catch (error) {
      logger.error('Script execution failed', { error: error.message });
      process.exit(1);
    }
  })();
}

export default auditFirstLoginIssues;