// sync-all-permissions.js - Fixed for Windows
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = join(__dirname, '..');

// Load .env file manually if dotenv fails
try {
  const envPath = join(parentDir, '.env');
  const envContent = readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n');
  envLines.forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value.length > 0) {
      process.env[key.trim()] = value.join('=').trim().replace(/^"|"$/g, '');
    }
  });
} catch (error) {
  console.log('⚠️  Could not load .env file, using existing environment variables');
}

// Import the syncPermissions function using dynamic import with proper path
let syncPermissions;
let ROLE_MAPPING;

try {
  // First, try to import using the correct path
  const permissionsPath = new URL('../utils/permissions.js', import.meta.url).href;
  const permissionsModule = await import(permissionsPath);
  syncPermissions = permissionsModule.syncPermissions;
  ROLE_MAPPING = permissionsModule.ROLE_MAPPING;
  console.log('✅ Successfully imported permissions module');
} catch (error) {
  console.error('❌ Failed to import permissions module:', error.message);
  console.log('🔄 Trying alternative import method...');
  
  // Alternative: Try to construct the module manually
  // Since we can't import, let's create a minimal version
  syncPermissions = async function() {
    console.log('⚠️  Using fallback syncPermissions function');
    
    // Connect to database
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI not found');
    }
    
    await mongoose.connect(mongoURI);
    
    // Create a simple Permissions model if it doesn't exist
    const PermissionsSchema = new mongoose.Schema({
      BU_ROLE_ID: { type: Number, required: true, unique: true },
      ROLE_NAME: String,
      IS_ACTIVE: Boolean,
      DESCRIPTION: String,
      VAULT_ACCESS_LEVEL: [String],
      CUSTOMER_ACCESS_LEVEL: [String],
      ACCOUNT_ACCESS_LEVEL: [String],
      DRAWER_ACCESS_LEVEL: [String],
      LOAN_OPERATIONS_ACCESS_LEVEL: [String],
      REPORT_ACCESS_LEVEL: [String],
      DASHBOARD_ACCESS_LEVEL: [String],
      APPROVAL_ACCESS_LEVEL: [String],
      DEPOSIT_ACCESS_LEVEL: [String],
      RATE_ACCESS_LEVEL: [String],
      PERFORMANCE_ACCESS_LEVEL: [String],
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    });
    
    const Permissions = mongoose.models.Permissions || 
                       mongoose.model('Permissions', PermissionsSchema);
    
    // Define role 19 permissions (Branch Manager)
    const role19Permissions = {
      BU_ROLE_ID: 19,
      ROLE_NAME: 'Branch Manager',
      IS_ACTIVE: true,
      DESCRIPTION: 'Permissions for Branch Manager',
      VAULT_ACCESS_LEVEL: [
        'CREATE_VAULT',
        'VIEW_VAULTS',
        'VIEW_VAULT_CONFIG',
        'CONFIGURE_VAULT',
        'UPDATE_VAULT',
        'MANAGE_VAULT_ACCESS',
        'AUTHORIZE_PERSONNEL',
        'REVOKE_AUTHORIZATION',
        'VIEW_AUTHORIZED_PERSONNEL',
        'APPROVE_REQUEST',
        'VIEW_PENDING_APPROVALS',
        'RECORD_MAINTENANCE',
        'VIEW_ACCESS_LOGS',
        'VIEW_VAULT_UTILIZATION',
        'VIEW_SECURITY_COMPLIANCE',
        'VIEW_VAULT_STATISTICS',
        'VIEW_AUDIT_TRAIL',
        'OPEN_VAULT',
        'CLOSE_VAULT',
        'VIEW_VAULT_STATUS',
        'VIEW_BRANCH_VAULTS',
        'MANAGE_BRANCH_VAULTS',
        'CONFIGURE_BRANCH_VAULT',
        'VIEW_BRANCH_VAULT_STATUS',
        'BRANCH_VAULT_ACCESS'
      ],
      CUSTOMER_ACCESS_LEVEL: [
        'CREATE_CUSTOMER', 'VIEW_CUSTOMER', 'UPDATE_CUSTOMER', 'DELETE_CUSTOMER',
        'VERIFY_KYC', 'CUSTOMER_IDENTIFICATION', 'VIEW_CUSTOMER_PROFILE', 'CUSTOMER_APPROVAL'
      ],
      ACCOUNT_ACCESS_LEVEL: [
        'OPEN_ACCOUNT', 'CLOSE_ACCOUNT', 'FREEZE_ACCOUNT', 'VIEW_ACCOUNT_BALANCE',
        'VIEW_ACCOUNT_STATEMENT', 'DEPOSIT_101', 'WITHDRAWAL_102', 'UPDATE_ACCOUNT',
        'CREATE_TERM_DEPOSIT'
      ],
      LOAN_OPERATIONS_ACCESS_LEVEL: ['APPROVE_LOAN'],
      APPROVAL_ACCESS_LEVEL: [
        'APPROVE_CUSTOMER_ACTION', 'APPROVE_STANDING_ORDER',
        'APPROVE_VAULT_ACCESS', 'APPROVE_VAULT_OPERATION'
      ],
      DASHBOARD_ACCESS_LEVEL: [
        'VIEW_DASHBOARD', 'VIEW_TRANSACTION_OVERVIEW', 'VIEW_MANAGER_DASHBOARD',
        'ACCESS_QUICK_ACTIONS', 'VIEW_BU_PERFORMANCE'
      ],
      REPORT_ACCESS_LEVEL: ['VIEW_REPORTS', 'VIEW_PERFORMANCE_METRICS'],
      DEPOSIT_ACCESS_LEVEL: ['DEPOSIT_APPLICATION_APPROVAL'],
      RATE_ACCESS_LEVEL: ['SETUP_DEPOSIT_INTEREST'],
      PERFORMANCE_ACCESS_LEVEL: ['VIEW_PERFORMANCE_METRICS']
    };
    
    // Update or create role 19 permissions
    const result = await Permissions.findOneAndUpdate(
      { BU_ROLE_ID: 19 },
      { $set: role19Permissions },
      { 
        upsert: true,
        new: true,
        runValidators: true 
      }
    );
    
    console.log(`✅ Updated permissions for Branch Manager (Role 19)`);
    console.log(`📋 Added ${role19Permissions.VAULT_ACCESS_LEVEL.length} vault permissions`);
    
    return result;
  };
}

async function runSync() {
  try {
    // Get MongoDB URI
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      console.error('❌ MONGODB_URI not found in environment variables');
      console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('MONGODB')));
      throw new Error('MONGODB_URI not found');
    }

    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected successfully');

    console.log('\n🔄 Starting permission synchronization...');
    
    if (typeof syncPermissions === 'function') {
      await syncPermissions();
      console.log('\n✅ Permissions synchronization completed successfully');
    } else {
      console.log('❌ syncPermissions function not available');
    }
    
    // Verify role 19 was updated
    console.log('\n🔍 Verifying role 19 update...');
    
    // Define Permissions model for verification
    const PermissionsSchema = new mongoose.Schema({
      BU_ROLE_ID: { type: Number, required: true, unique: true },
      ROLE_NAME: String,
      VAULT_ACCESS_LEVEL: [String],
    });
    
    const Permissions = mongoose.models.Permissions || 
                       mongoose.model('Permissions', PermissionsSchema);
    
    const role19 = await Permissions.findOne({ BU_ROLE_ID: 19 }).lean();
    
    if (role19) {
      console.log('✅ Role 19 found in database');
      console.log(`📋 Role Name: ${role19.ROLE_NAME}`);
      
      if (role19.VAULT_ACCESS_LEVEL && Array.isArray(role19.VAULT_ACCESS_LEVEL)) {
        console.log(`✅ VAULT_ACCESS_LEVEL found with ${role19.VAULT_ACCESS_LEVEL.length} permissions`);
        console.log('📋 Includes VIEW_VAULTS?', role19.VAULT_ACCESS_LEVEL.includes('VIEW_VAULTS'));
        
        if (role19.VAULT_ACCESS_LEVEL.length > 0) {
          console.log('📋 First 5 vault permissions:');
          role19.VAULT_ACCESS_LEVEL.slice(0, 5).forEach((perm, i) => {
            console.log(`  [${i}] ${perm}`);
          });
        }
      } else {
        console.log('❌ VAULT_ACCESS_LEVEL is missing or not an array');
      }
    } else {
      console.log('❌ Role 19 not found in database');
    }
    
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('\n🔌 MongoDB disconnected');
    }
    console.log('\n🔍 Sync process complete');
  }
}

runSync();