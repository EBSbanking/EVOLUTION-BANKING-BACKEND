// test-permission-logic.js
// This script tests the permission logic without database connection

console.log('🔍 TESTING PERMISSION LOGIC');
console.log('============================\n');

// Simulate your PERMISSIONS constants
const PERMISSIONS = {
  VAULT: {
    VIEW_VAULTS: 'VIEW_VAULTS',
    CREATE_VAULT: 'CREATE_VAULT',
    VIEW_VAULT_CONFIG: 'VIEW_VAULT_CONFIG',
    // ... other permissions
  }
};

// Simulate MODULE_PERMISSIONS
const MODULE_PERMISSIONS = {
  VIEW_VAULTS: PERMISSIONS.VAULT.VIEW_VAULTS,
  CREATE_VAULT: PERMISSIONS.VAULT.CREATE_VAULT,
  VIEW_VAULT_CONFIG: PERMISSIONS.VAULT.VIEW_VAULT_CONFIG,
  // ... other mappings
};

// Simulate Role 19 permissions from your sync script
const ROLE_19_PERMISSIONS = {
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
  ]
};

// Test 1: Check MODULE_PERMISSIONS mapping
console.log('🧪 TEST 1: MODULE_PERMISSIONS Mapping');
console.log('=====================================\n');

const moduleKey = 'VIEW_VAULTS';
const requiredPermission = MODULE_PERMISSIONS[moduleKey];

console.log(`Module Key: "${moduleKey}"`);
console.log(`MODULE_PERMISSIONS["${moduleKey}"] = "${requiredPermission}"`);
console.log(`Type: ${typeof requiredPermission}`);
console.log(`Is string? ${typeof requiredPermission === 'string'}`);
console.log(`Length: ${requiredPermission.length}`);
console.log(`Exact value: "${requiredPermission}"\n`);

if (typeof requiredPermission !== 'string') {
  console.log('❌ ERROR: MODULE_PERMISSIONS["VIEW_VAULTS"] is not a string!');
  console.log('This could be the issue in your checkPermissions middleware.\n');
}

// Test 2: Check if permission exists in role permissions
console.log('🧪 TEST 2: Permission in Role 19');
console.log('================================\n');

console.log(`Checking if "${requiredPermission}" exists in ROLE_19_PERMISSIONS.VAULT_ACCESS_LEVEL`);
const hasPermission = ROLE_19_PERMISSIONS.VAULT_ACCESS_LEVEL.includes(requiredPermission);
console.log(`Result: ${hasPermission ? '✅ YES' : '❌ NO'}\n`);

if (!hasPermission) {
  console.log('🔍 Let me check what permissions are actually in the array:');
  ROLE_19_PERMISSIONS.VAULT_ACCESS_LEVEL.forEach((perm, index) => {
    console.log(`  [${index}] "${perm}"`);
  });
  
  console.log('\n🔍 Checking case sensitivity:');
  const upperCasePerms = ROLE_19_PERMISSIONS.VAULT_ACCESS_LEVEL.map(p => p.toUpperCase());
  console.log(`Case-insensitive match: ${upperCasePerms.includes(requiredPermission.toUpperCase())}`);
}

// Test 3: Simulate the full checkPermissions flow
console.log('\n🧪 TEST 3: Full checkPermissions Flow Simulation');
console.log('===============================================\n');

console.log('Step 1: User makes request to /api/vaults');
console.log('Step 2: Middleware receives moduleKey = "VIEW_VAULTS"');
console.log(`Step 3: Gets requiredPermission = "${requiredPermission}"`);
console.log(`Step 4: User roleId = 19`);
console.log(`Step 5: Checks if role 19 has permission "${requiredPermission}"`);
console.log(`Step 6: Result = ${hasPermission ? '✅ ACCESS GRANTED' : '❌ ACCESS DENIED'}`);

// Test 4: Check common issues
console.log('\n🔧 TROUBLESHOOTING COMMON ISSUES');
console.log('================================\n');

const issues = [
  {
    name: 'Module key typo',
    test: () => MODULE_PERMISSIONS['view_vaults'] || MODULE_PERMISSIONS['viewVaults'] || MODULE_PERMISSIONS['VIEW_VAULT']
  },
  {
    name: 'Permission value mismatch',
    test: () => requiredPermission === 'VIEW_VAULTS'
  },
  {
    name: 'Array contains permission',
    test: () => ROLE_19_PERMISSIONS.VAULT_ACCESS_LEVEL.some(p => p === requiredPermission)
  },
  {
    name: 'Case sensitivity',
    test: () => ROLE_19_PERMISSIONS.VAULT_ACCESS_LEVEL.some(p => 
      p.toLowerCase() === requiredPermission.toLowerCase()
    )
  }
];

issues.forEach((issue, index) => {
  const result = issue.test();
  console.log(`${index + 1}. ${issue.name}: ${result ? '✅ OK' : '❌ ISSUE'}`);
});

// Test 5: Check your actual route usage
console.log('\n📋 HOW YOUR ROUTES SHOULD BE SET UP');
console.log('===================================\n');

console.log('Example 1: Using checkPermissions middleware');
console.log('-------------------------------------------');
console.log(`router.get('/vaults', checkPermissions('VIEW_VAULTS'), vaultController.getVaults);\n`);

console.log('Example 2: Alternative module keys (if you have them)');
console.log('-----------------------------------------------------');
console.log(`router.get('/vaults', checkPermissions('viewVaults'), vaultController.getVaults);`);
console.log(`router.get('/vaults', checkPermissions('view_vaults'), vaultController.getVaults);\n`);

console.log('🔍 Check your actual route file to see which module key you are using.');
console.log('The module key must exactly match a key in your MODULE_PERMISSIONS object.\n');

// Show all MODULE_PERMISSIONS keys related to vault
console.log('📋 All MODULE_PERMISSIONS keys containing "VAULT":');
Object.keys(MODULE_PERMISSIONS).forEach(key => {
  if (key.includes('VAULT') || key.includes('Vault') || key.includes('vault')) {
    console.log(`  "${key}" -> "${MODULE_PERMISSIONS[key]}"`);
  }
});

console.log('\n🎯 NEXT STEPS:');
console.log('=============');
console.log('1. Check which module key you are using in your route');
console.log('2. Verify it exists in MODULE_PERMISSIONS');
console.log('3. Make sure the value is a string (not an object or array)');
console.log('4. Check server logs for permission check output');