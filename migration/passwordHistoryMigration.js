// migration/passwordHistoryMigration.js
import mongoose from 'mongoose';
import User from '../models/User.js';
import bcrypt from 'bcrypt';

async function migratePasswordHistory() {
  try {
    const users = await User.find({});
    
    for (const user of users) {
      if (user.password && !user.passwordHistory) {
        user.passwordHistory = [user.password];
        user.passwordChangedAt = user.updatedAt || user.createdAt;
        await user.save();
        console.log(`Migrated user: ${user.user_name}`);
      }
    }
    
    console.log('Password history migration completed');
  } catch (error) {
    console.error('Migration error:', error);
  }
}

// Run migration if needed
// migratePasswordHistory();