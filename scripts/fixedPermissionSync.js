// scripts/fixedPermissionSync.js
import { initializeModels, getRole, getPermissions, getSequelize } from '../src/models/index.js';
import { PERMISSIONS, getAllPermissions } from '../src/constants/permissions.js';
import { ROLE_PERMISSION_MAPPING, ROLE_MAPPING } from '../src/constants/roleMapping.js';

async function fixedPermissionSync() {
  try {
    console.log('🚀 Starting fixed permission sync...');
    
    // Initialize models
    console.log('Initializing models...');
    await initializeModels();
    
    // Get models using getters
    const Role = getRole();
    const Permission = getPermissions();
    const sequelize = getSequelize();
    
    console.log('✅ Models initialized');
    console.log(`Role model: ${Role ? 'Available' : 'Not available'}`);
    console.log(`Permission model: ${Permission ? 'Available' : 'Not available'}`);
    
    if (!Role || !Permission) {
      throw new Error('Required models are not available');
    }
    
    // Get all valid permissions
    const validPermissions = getAllPermissions();
    const validPermissionSet = new Set(validPermissions);
    console.log(`\n📊 Total valid permissions: ${validPermissions.length}`);
    
    // Track all issues
    const allIssues = [];
    const rolesToFix = [19, 20, 28, 33, 34, 38];
    
    // Check each problematic role
    for (const roleId of rolesToFix) {
      console.log(`\n🔍 Analyzing role ${roleId} (${ROLE_MAPPING[roleId]?.ROLE_NM || 'Unknown'})...`);
      
      const rolePermissions = ROLE_PERMISSION_MAPPING[roleId]?.permissions;
      if (!rolePermissions) {
        console.log(`  ⚠️ No permissions found for role ${roleId}`);
        continue;
      }
      
      const invalidPermissions = [];
      
      // Check each permission group
      for (const [groupName, permissions] of Object.entries(rolePermissions)) {
        if (Array.isArray(permissions)) {
          for (const permission of permissions) {
            if (!validPermissionSet.has(permission)) {
              invalidPermissions.push({ group: groupName, permission });
            }
          }
        }
      }
      
      if (invalidPermissions.length > 0) {
        console.log(`  ❌ Found ${invalidPermissions.length} invalid permissions:`);
        invalidPermissions.forEach(ip => {
          console.log(`    - ${ip.group}: ${ip.permission}`);
          allIssues.push(`Role ${roleId}: ${ip.permission} is not a valid permission`);
        });
      } else {
        console.log(`  ✅ All permissions are valid for role ${roleId}`);
      }
    }
    
    if (allIssues.length > 0) {
      console.log('\n📋 Summary of issues found:');
      allIssues.forEach(issue => console.log(`  - ${issue}`));
      
      console.log('\n🔧 Suggested fixes:');
      console.log('\n1. For Role 19 (Branch Manager), remove these invalid permissions:');
      console.log('   - PERMISSIONS.APPROVAL.BVN_VALIDATION');
      console.log('   - PERMISSIONS.DASHBOARD.BVN_VALIDATION_STATS');
      console.log('   - PERMISSIONS.REPORT.BVN_VALIDATION');
      console.log('   - PERMISSIONS.QUEUE.BVN_VALIDATION_QUEUE');
      console.log('   - PERMISSIONS.NOTIFICATION.BVN_VALIDATION_NOTIFY');
      console.log('   - PERMISSIONS.AUDIT.VIEW_BVN_AUDIT');
      
      console.log('\n2. For Role 20 (Branch Operation Supervisor), remove:');
      console.log('   - PERMISSIONS.APPROVAL.BVN_VALIDATION');
      console.log('   - PERMISSIONS.DASHBOARD.BVN_VALIDATION_STATS');
      console.log('   - PERMISSIONS.REPORT.BVN_VALIDATION');
      console.log('   - PERMISSIONS.QUEUE.BVN_VALIDATION_QUEUE');
      console.log('   - PERMISSIONS.NOTIFICATION.BVN_VALIDATION_NOTIFY');
      
      console.log('\n3. For Role 33 (Business Analyst), remove:');
      console.log('   - PERMISSIONS.ANALYTICS.BVN_VALIDATION_ANALYTICS');
      
      console.log('\n4. For Role 34 (Credit Risk Analyst), remove:');
      console.log('   - PERMISSIONS.RISK.BVN_VALIDATION_RISK');
      
      console.log('\n5. For Role 38 (Vault Manager), remove:');
      console.log('   - PERMISSIONS.VAULT.TRANSFER_BETWEEN_BRANCHES');
      
      console.log('\n📝 Or add these missing permissions to your PERMISSIONS object in permissions.js:');
      console.log(`
// Add these to your PERMISSIONS object in src/constants/permissions.js:

// In the APPROVAL section:
BVN_VALIDATION: 'APPROVE_BVN_VALIDATION',

// In the DASHBOARD section:
BVN_VALIDATION_STATS: 'VIEW_BVN_VALIDATION_STATS',

// In the REPORT section:
BVN_VALIDATION: 'VIEW_BVN_VALIDATION_REPORT',

// In the QUEUE section:
BVN_VALIDATION_QUEUE: 'MANAGE_BVN_VALIDATION_QUEUE',

// In the NOTIFICATION section:
BVN_VALIDATION_NOTIFY: 'SEND_BVN_VALIDATION_NOTIFICATIONS',

// In the AUDIT section:
VIEW_BVN_AUDIT: 'VIEW_BVN_AUDIT_LOGS',

// In the ANALYTICS section:
BVN_VALIDATION_ANALYTICS: 'VIEW_BVN_VALIDATION_ANALYTICS',

// In the RISK section:
BVN_VALIDATION_RISK: 'ASSESS_BVN_VALIDATION_RISK',

// In the VAULT section:
TRANSFER_BETWEEN_BRANCHES: 'TRANSFER_VAULT_BETWEEN_BRANCHES',
      `);
    } else {
      console.log('\n✅ No issues found! All role permissions are valid.');
    }
    
    // Now check the database
    console.log('\n🔍 Checking database for roles...');
    for (const roleId of rolesToFix) {
      const role = await Role.findByPk(roleId);
      if (role) {
        console.log(`  ✅ Role ${roleId} (${role.ROLE_NM || role.name}) exists in database`);
      } else {
        console.log(`  ⚠️ Role ${roleId} not found in database - you may need to create it`);
      }
    }
    
    console.log('\n✅ Fixed permission sync completed successfully');
    console.log('\n📋 Next steps:');
    console.log('1. Update src/constants/roleMapping.js to remove the invalid permissions');
    console.log('2. OR add the missing permissions to src/constants/permissions.js');
    console.log('3. Run this script again to verify fixes');
    console.log('4. Run the original permission.js to sync with database');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Permission sync failed:', error);
    process.exit(1);
  }
}

fixedPermissionSync();