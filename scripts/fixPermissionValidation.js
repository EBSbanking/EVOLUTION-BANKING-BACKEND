// scripts/fixPermissionValidation.js
import { initializeModels } from '../src/models/index.js';
import { PERMISSIONS, getAllPermissions } from '../src/constants/permissions.js';
import { ROLE_PERMISSION_MAPPING } from '../src/constants/roleMapping.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fixPermissionValidation() {
  try {
    console.log('🔧 Starting permission validation fix...');
    
    // Initialize models
    await initializeModels();
    
    // Get all valid permissions
    const validPermissions = getAllPermissions();
    const validPermissionSet = new Set(validPermissions);
    console.log(`📊 Total valid permissions: ${validPermissions.length}`);
    
    // Check each problematic role
    const problematicRoles = [19, 20, 28, 33, 34, 38];
    const issues = [];
    
    for (const roleId of problematicRoles) {
      const roleData = ROLE_PERMISSION_MAPPING[roleId];
      if (!roleData) {
        console.log(`⚠️ Role ${roleId} not found in ROLE_PERMISSION_MAPPING`);
        continue;
      }
      
      console.log(`\n🔍 Checking role ${roleId}...`);
      
      // Check each permission group
      for (const [groupName, permissions] of Object.entries(roleData.permissions)) {
        if (Array.isArray(permissions)) {
          for (let i = 0; i < permissions.length; i++) {
            const permission = permissions[i];
            if (permission === undefined) {
              issues.push({
                roleId,
                group: groupName,
                index: i,
                permission: 'undefined'
              });
            }
          }
        }
      }
    }
    
    if (issues.length === 0) {
      console.log('✅ No issues found! All permissions are valid.');
      process.exit(0);
    }
    
    console.log('\n📋 Found issues:', issues);
    
    // Now let's fix the roleMapping.js file
    const roleMappingPath = path.join(__dirname, '../src/constants/roleMapping.js');
    let content = fs.readFileSync(roleMappingPath, 'utf8');
    
    // Create a backup
    const backupPath = path.join(__dirname, '../src/constants/roleMapping.js.backup');
    fs.writeFileSync(backupPath, content);
    console.log(`✅ Created backup at ${backupPath}`);
    
    // Fix the issues by removing the undefined permissions
    // This is a simplified fix - you may need to adjust based on your actual structure
    
    // Fix role 19
    content = fixRolePermissions(content, 19, [
      'PERMISSIONS.APPROVAL.BVN_VALIDATION',
      'PERMISSIONS.DASHBOARD.BVN_VALIDATION_STATS',
      'PERMISSIONS.REPORT.BVN_VALIDATION',
      'PERMISSIONS.QUEUE.BVN_VALIDATION_QUEUE',
      'PERMISSIONS.NOTIFICATION.BVN_VALIDATION_NOTIFY',
      'PERMISSIONS.AUDIT.VIEW_BVN_AUDIT'
    ]);
    
    // Fix role 20
    content = fixRolePermissions(content, 20, [
      'PERMISSIONS.APPROVAL.BVN_VALIDATION',
      'PERMISSIONS.DASHBOARD.BVN_VALIDATION_STATS',
      'PERMISSIONS.REPORT.BVN_VALIDATION',
      'PERMISSIONS.QUEUE.BVN_VALIDATION_QUEUE',
      'PERMISSIONS.NOTIFICATION.BVN_VALIDATION_NOTIFY'
    ]);
    
    // Fix role 33
    content = fixRolePermissions(content, 33, [
      'PERMISSIONS.ANALYTICS.BVN_VALIDATION_ANALYTICS'
    ]);
    
    // Fix role 34
    content = fixRolePermissions(content, 34, [
      'PERMISSIONS.RISK.BVN_VALIDATION_RISK'
    ]);
    
    // Fix role 38
    content = fixRolePermissions(content, 38, [
      'PERMISSIONS.VAULT.TRANSFER_BETWEEN_BRANCHES'
    ]);
    
    // Write the fixed content back
    fs.writeFileSync(roleMappingPath, content);
    console.log('✅ Fixed roleMapping.js');
    
    console.log('\n✅ Permission validation fix completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Review the changes in src/constants/roleMapping.js');
    console.log('2. If needed, restore from backup: src/constants/roleMapping.js.backup');
    console.log('3. Run node scripts/permission.js to sync permissions');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  }
}

function fixRolePermissions(content, roleId, permissionsToRemove) {
  console.log(`\n🔧 Fixing role ${roleId}...`);
  
  // Find the role section
  const rolePattern = new RegExp(`${roleId}:\\s*{([^}]+)}`, 's');
  const match = content.match(rolePattern);
  
  if (!match) {
    console.log(`⚠️ Could not find role ${roleId} section`);
    return content;
  }
  
  let roleSection = match[1];
  let modified = false;
  
  // Remove each problematic permission
  for (const permToRemove of permissionsToRemove) {
    // Look for the permission in the role section
    const permPattern = new RegExp(`${permToRemove}[,\\s]*`, 'g');
    if (permPattern.test(roleSection)) {
      roleSection = roleSection.replace(permPattern, '');
      modified = true;
      console.log(`  ✅ Removed ${permToRemove}`);
    }
  }
  
  if (modified) {
    // Clean up any double commas or trailing commas
    roleSection = roleSection.replace(/,\s*,/g, ',');
    roleSection = roleSection.replace(/,\s*}/g, '}');
    roleSection = roleSection.replace(/{\s*,/g, '{');
    
    // Replace the original section
    content = content.replace(rolePattern, `${roleId}: {${roleSection}}`);
  }
  
  return content;
}

fixPermissionValidation();