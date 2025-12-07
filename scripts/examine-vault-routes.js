// examine-vault-routes.js
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const vaultRoutesPath = join(__dirname, '..', 'src', 'routes', 'VaultRoutes.js');

console.log('🔍 Examining VaultRoutes.js file...\n');

try {
  const content = readFileSync(vaultRoutesPath, 'utf8');
  const lines = content.split('\n');
  
  console.log('📋 Found vault routes with checkPermissions:');
  
  // Find all lines with checkPermissions
  lines.forEach((line, lineNumber) => {
    if (line.includes('checkPermissions')) {
      console.log(`Line ${lineNumber + 1}: ${line.trim()}`);
    }
  });
  
  console.log('\n🔍 Looking specifically for GET /vault routes:');
  
  // Find GET routes for vaults
  lines.forEach((line, lineNumber) => {
    if (line.includes('router.get') && line.includes('vault')) {
      console.log(`\nLine ${lineNumber + 1}: ${line.trim()}`);
      
      // Show next few lines for context
      for (let i = 1; i <= 3; i++) {
        if (lines[lineNumber + i]) {
          console.log(`       ${lines[lineNumber + i].trim()}`);
        }
      }
    }
  });
  
  // Check line 213 specifically (from your output)
  console.log('\n🔍 Checking line 213 specifically:');
  if (lines[212]) { // Array is 0-indexed
    console.log(`Line 213: ${lines[212].trim()}`);
    
    // Show context around line 213
    console.log('\nContext around line 213:');
    for (let i = 210; i <= 215; i++) {
      if (lines[i]) {
        console.log(`Line ${i + 1}: ${lines[i].trim()}`);
      }
    }
  }
  
  // Check if there are routes without checkPermissions
  console.log('\n🔍 Checking for routes that might be missing permission checks:');
  
  const routePatterns = [
    'router.get(',
    'router.post(',
    'router.put(',
    'router.delete(',
    'router.patch('
  ];
  
  routePatterns.forEach(pattern => {
    lines.forEach((line, lineNumber) => {
      if (line.includes(pattern) && line.includes('vault') && !line.includes('checkPermissions')) {
        // Check if the next line has checkPermissions
        const nextLine = lines[lineNumber + 1] || '';
        if (!nextLine.includes('checkPermissions')) {
          console.log(`⚠️  Line ${lineNumber + 1}: ${line.trim()}`);
          console.log(`   Next line: ${nextLine.trim()}`);
        }
      }
    });
  });
  
  console.log('\n🎯 ANALYSIS:');
  console.log('===========');
  console.log('1. Your VaultRoutes.js uses checkPermissions("VIEW_VAULTS")');
  console.log('2. This should work if MODULE_PERMISSIONS has "VIEW_VAULTS" key');
  console.log('3. Check if the route you\'re hitting uses VIEW_VAULTS');
  
} catch (error) {
  console.error('❌ Error reading file:', error.message);
}

// check-module-permissions.js
console.log('🔍 Checking MODULE_PERMISSIONS for vault-related keys...\n');

// These are the keys found in your VaultRoutes.js
const vaultPermissionKeys = [
  'CREATE_VAULT',
  'VIEW_VAULTS',
  'VIEW_VAULT_STATISTICS',
  'UPDATE_VAULT',
  'DEACTIVATE_VAULT',
  'VIEW_BRANCH_SUMMARY',  // This might be the issue!
  'TRANSFER_BETWEEN_BRANCHES',
  'VIEW_VAULT_CONFIG',
  'CONFIGURE_VAULT',
  'AUTHORIZE_PERSONNEL',
  'REVOKE_AUTHORIZATION',
  'VIEW_AUTHORIZED_PERSONNEL',
  'BULK_BRANCH_AUTHORIZE',
  'CREATE_APPROVAL_REQUEST',
  'APPROVE_REQUEST',
  'VIEW_PENDING_APPROVALS',
  'LOG_ACCESS_ATTEMPT',
  'RECORD_MAINTENANCE',
  'UPDATE_SECURITY_FEATURES',
  'VIEW_ACCESS_LOGS',
  'VIEW_VAULT_UTILIZATION',
  'VIEW_SECURITY_COMPLIANCE',
  'VIEW_AUDIT_TRAIL',
  'OPEN_VAULT',
  'CLOSE_VAULT',
  'VIEW_VAULT_STATUS'
];

console.log('📋 Checking which keys exist in MODULE_PERMISSIONS:\n');

// We need to check your actual MODULE_PERMISSIONS from permissions.js
// For now, let me show you what should be there based on your earlier code

console.log('Based on your earlier code, these should exist:');
console.log('✅ VIEW_VAULTS: PERMISSIONS.VAULT.VIEW_VAULTS');
console.log('✅ CREATE_VAULT: PERMISSIONS.VAULT.CREATE_VAULT');
console.log('✅ UPDATE_VAULT: PERMISSIONS.VAULT.UPDATE_VAULT');
console.log('✅ DEACTIVATE_VAULT: PERMISSIONS.VAULT.DEACTIVATE_VAULT');
console.log('✅ VIEW_VAULT_CONFIG: PERMISSIONS.VAULT.VIEW_VAULT_CONFIG');
console.log('✅ CONFIGURE_VAULT: PERMISSIONS.VAULT.CONFIGURE_VAULT');
console.log('✅ AUTHORIZE_PERSONNEL: PERMISSIONS.VAULT.AUTHORIZE_PERSONNEL');
console.log('✅ REVOKE_AUTHORIZATION: PERMISSIONS.VAULT.REVOKE_AUTHORIZATION');
console.log('✅ VIEW_AUTHORIZED_PERSONNEL: PERMISSIONS.VAULT.VIEW_AUTHORIZED_PERSONNEL');
console.log('✅ CREATE_APPROVAL_REQUEST: PERMISSIONS.VAULT.CREATE_APPROVAL_REQUEST');
console.log('✅ APPROVE_REQUEST: PERMISSIONS.VAULT.APPROVE_REQUEST');
console.log('✅ VIEW_PENDING_APPROVALS: PERMISSIONS.VAULT.VIEW_PENDING_APPROVALS');
console.log('✅ LOG_ACCESS_ATTEMPT: PERMISSIONS.VAULT.LOG_ACCESS_ATTEMPT');
console.log('✅ RECORD_MAINTENANCE: PERMISSIONS.VAULT.RECORD_MAINTENANCE');
console.log('✅ UPDATE_SECURITY_FEATURES: PERMISSIONS.VAULT.UPDATE_SECURITY_FEATURES');
console.log('✅ VIEW_ACCESS_LOGS: PERMISSIONS.VAULT.VIEW_ACCESS_LOGS');
console.log('✅ VIEW_VAULT_UTILIZATION: PERMISSIONS.VAULT.VIEW_VAULT_UTILIZATION');
console.log('✅ VIEW_SECURITY_COMPLIANCE: PERMISSIONS.VAULT.VIEW_SECURITY_COMPLIANCE');
console.log('✅ VIEW_VAULT_STATISTICS: PERMISSIONS.VAULT.VIEW_VAULT_STATISTICS');
console.log('✅ VIEW_AUDIT_TRAIL: PERMISSIONS.VAULT.VIEW_AUDIT_TRAIL');
console.log('✅ OPEN_VAULT: PERMISSIONS.VAULT.OPEN_VAULT');
console.log('✅ CLOSE_VAULT: PERMISSIONS.VAULT.CLOSE_VAULT');
console.log('✅ VIEW_VAULT_STATUS: PERMISSIONS.VAULT.VIEW_VAULT_STATUS');

console.log('\n⚠️  POTENTIAL ISSUES:');
console.log('==================');
console.log('1. VIEW_BRANCH_SUMMARY might not exist in MODULE_PERMISSIONS');
console.log('2. TRANSFER_BETWEEN_BRANCHES might not exist');
console.log('3. BULK_BRANCH_AUTHORIZE might not exist');

console.log('\n🔧 QUICK FIX: Add missing keys to MODULE_PERMISSIONS');
console.log('===================================================\n');

console.log('Add these to your MODULE_PERMISSIONS in permissions.js:\n');

const missingPermissions = [
  'VIEW_BRANCH_SUMMARY',
  'TRANSFER_BETWEEN_BRANCHES', 
  'BULK_BRANCH_AUTHORIZE'
];

missingPermissions.forEach(key => {
  console.log(`${key}: PERMISSIONS.VAULT.${key},`);
});

console.log('\n📋 But wait, first check if these permissions exist in PERMISSIONS.VAULT');
console.log('If they don\'t exist, you need to add them to PERMISSIONS.VAULT first.');