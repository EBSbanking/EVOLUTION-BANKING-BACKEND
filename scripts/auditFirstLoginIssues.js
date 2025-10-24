// scripts/auditFirstLoginIssues.js
import mongoose from 'mongoose';
import User from '../models/User.js'; // Adjust path if needed
import Login from '../models/Login.js'; // Adjust path if needed
import logger from '../utils/logger.js'; // Adjust path if needed
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

// MongoDB connection function
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not defined in .env');
    }
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('Connected to MongoDB for first login audit');
  } catch (error) {
    logger.error('MongoDB connection error', { error: error.message });
    throw error;
  }
};

// Audit function
const auditFirstLoginIssues = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Find users with firstLogin: true
    const users = await User.find({ firstLogin: true });
    logger.info(`Found ${users.length} users with firstLogin: true`);

    for (const user of users) {
      const successfulLogins = await Login.countDocuments({
        user_id: user._id,
        success: true,
        status: 'Success',
      });
      if (successfulLogins > 0) {
        logger.warn(`User ${user.user_name} has firstLogin=true but ${successfulLogins} successful logins`, {
          user_id: user._id,
          successfulLogins,
        });
        user.firstLogin = false;
        await user.save();
        logger.info(`Corrected firstLogin flag for user ${user.user_name}`);
      }
    }
    logger.info('First login audit completed');
  } catch (error) {
    logger.error('Error during first login audit', { error: error.message });
    throw error;
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
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