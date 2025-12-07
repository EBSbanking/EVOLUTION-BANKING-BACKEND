// diagnostic.js - Updated with connection handling
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from parent directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = join(__dirname, '..');

dotenv.config({ path: join(parentDir, '.env') });

// Import Permissions model directly
const PermissionsSchema = new mongoose.Schema({
  BU_ROLE_ID: { type: Number, required: true, unique: true },
  ROLE_NAME: String,
  IS_ACTIVE: Boolean,
  DESCRIPTION: String,
  VAULT_ACCESS_LEVEL: [String],
  // Add other permission fields as needed
});

const Permissions = mongoose.models.Permissions || mongoose.model('Permissions', PermissionsSchema);

async function diagnosePermissions() {
  try {
    // Get MongoDB URI from environment or use default
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/banking_system';
    console.log('🔗 Connecting to MongoDB:', mongoURI.replace(/\/\/[^@]+@/, '//***:***@')); // Hide credentials
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ MongoDB connected successfully');
    
    // Check role 19 specifically
    const role19 = await Permissions.findOne({ BU_ROLE_ID: 19 }).lean();
    
    console.log('\n🔍 DIAGNOSTIC CHECK FOR ROLE 19');
    console.log('================================');
    
    if (!role19) {
      console.log('❌ No permissions found for role 19');
      console.log('\n⚠️  Running syncPermissions might be needed');
      return;
    }
    
    console.log('✅ Role found:', role19.ROLE_NAME);
    console.log('📋 Document ID:', role19._id);
    console.log('📋 All keys in document:', Object.keys(role19).join(', '));
    
    // Check VAULT_ACCESS_LEVEL specifically
    if (role19.VAULT_ACCESS_LEVEL) {
      console.log('\n📋 VAULT_ACCESS_LEVEL:');
      console.log('Type:', typeof role19.VAULT_ACCESS_LEVEL);
      console.log('Is Array?', Array.isArray(role19.VAULT_ACCESS_LEVEL));
      console.log('Length:', role19.VAULT_ACCESS_LEVEL.length);
      
      if (role19.VAULT_ACCESS_LEVEL.length === 0) {
        console.log('⚠️  VAULT_ACCESS_LEVEL array is EMPTY!');
      } else {
        console.log('\n📋 Permissions in VAULT_ACCESS_LEVEL array:');
        role19.VAULT_ACCESS_LEVEL.forEach((perm, index) => {
          console.log(`  [${index}] "${perm}"`);
          console.log(`     Type: ${typeof perm}, Length: ${perm.length}`);
          console.log(`     Char codes: ${Array.from(perm).map(c => c.charCodeAt(0)).join(', ')}`);
        });
        
        // Check for VIEW_VAULTS
        console.log('\n🔍 Looking for "VIEW_VAULTS":');
        
        // Exact match
        const exactMatch = role19.VAULT_ACCESS_LEVEL.includes('VIEW_VAULTS');
        console.log('✅ Exact match:', exactMatch);
        
        // Case-insensitive search
        const upperCasePerms = role19.VAULT_ACCESS_LEVEL.map(p => p.toUpperCase().trim());
        console.log('✅ Case-insensitive match:', upperCasePerms.includes('VIEW_VAULTS'));
        
        // Trimmed search
        const trimmedPerms = role19.VAULT_ACCESS_LEVEL.map(p => p.trim());
        console.log('✅ Trimmed match:', trimmedPerms.includes('VIEW_VAULTS'));
        
        // Find similar permissions
        console.log('\n🔍 Similar vault-related permissions:');
        role19.VAULT_ACCESS_LEVEL.forEach(perm => {
          if (perm.toUpperCase().includes('VAULT')) {
            console.log(`  Found: "${perm}"`);
          }
        });
        
        // Check if it's actually "VIEW_VAULT" (singular) instead of "VIEW_VAULTS" (plural)
        console.log('\n🔍 Checking for similar permission names:');
        const similarNames = ['VIEW_VAULT', 'VIEW VAULTS', 'VIEW-VAULTS', 'VAULT_VIEW', 'VAULTS_VIEW'];
        similarNames.forEach(name => {
          const found = role19.VAULT_ACCESS_LEVEL.some(p => 
            p.toUpperCase().replace(/[_-]/g, '') === name.toUpperCase().replace(/[_-]/g, '')
          );
          console.log(`  "${name}": ${found ? '✅' : '❌'}`);
        });
      }
    } else {
      console.log('❌ VAULT_ACCESS_LEVEL field not found in role 19 document');
      console.log('📋 Available permission fields:');
      Object.keys(role19).forEach(key => {
        if (key.includes('ACCESS') || key.includes('PERMISSION')) {
          console.log(`  ${key}:`, role19[key]);
        }
      });
    }
    
    // Check all permission arrays
    console.log('\n🔍 Checking all permission arrays in document:');
    Object.entries(role19).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        console.log(`\n📋 ${key} (${value.length} items):`);
        if (value.length > 0) {
          console.log('  Sample:', value.slice(0, 5).map(p => `"${p}"`).join(', '));
          if (value.length > 5) console.log(`  ... and ${value.length - 5} more`);
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Diagnostic error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('\n🔌 MongoDB disconnected');
    }
    console.log('\n🔍 Diagnostic complete');
  }
}

// Run the diagnostic
diagnosePermissions();