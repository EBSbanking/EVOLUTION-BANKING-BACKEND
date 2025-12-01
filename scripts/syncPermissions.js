// syncPermissions.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { syncPermissions } from '../src/constants/roleMapping.js';
import connectDB from '../config/db.js';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Go up one level to project root (since this script is in scripts/ folder)
const projectRoot = resolve(__dirname, '..');

// Load environment variables from the project root
dotenv.config({ path: resolve(projectRoot, '.env') });

async function runSync() {
  try {
    console.log('🔄 Connecting to database...');
    console.log('📝 MONGODB_URI exists:', !!process.env.MONGODB_URI);
    
    await connectDB();
    
    console.log('🔄 Syncing permissions...');
    await syncPermissions();
    
    console.log('✅ Permissions synced successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to sync permissions:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

runSync();