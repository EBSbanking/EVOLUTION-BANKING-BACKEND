// scripts/validateRoleMappings.js
import { initializeModels, getRole } from '../src/models/index.js';
import { PERMISSIONS, getAllPermissions } from '../src/constants/permissions.js';
import { ROLE_PERMISSIONS } from '../src/constants/roleMapping.js';

async function validateRoleMappings() {
  try {
    console.log('Validating role mappings...');
    
    // Initialize models
    await initializeModels();
    
    // Get all valid permissions
    const validPermissions = getAllPermissions();
    const validPermissionSet = new Set(validPermissions);
    
    console.log(`Total valid permissions: ${validPermissions.length}`);
    
    // Track issues
    const issues = [];
    
    // Check each role's permissions
    for (const [roleId, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      if (!permissions || !Array.isArray(permissions)) {
        issues.push(`Role ${roleId}: Permissions is not an array`);
        continue;
      }
      
      for (const permission of permissions) {
        if (!validPermissionSet.has(permission)) {
          issues.push(`Role ${roleId}: Permission "${permission}" is not defined in PERMISSIONS`);
        }
      }
    }
    
    if (issues.length > 0) {
      console.log('\n❌ Found issues:');
      issues.forEach(issue => console.log(`  - ${issue}`));
    } else {
      console.log('\n✅ All role permissions are valid!');
    }
    
    // Check module existence
    console.log('\nChecking module references...');
    const modules = Object.keys(PERMISSIONS);
    
    // This is where roles 19,20,28,33,34,38 might be referencing modules directly
    // You might have something like this in your roleMapping:
    // { roleId: 19, permissions: ['APPROVAL', 'DASHBOARD', ...] }
    
    const moduleIssues = [];
    // You would need to check your role definitions for module-level references
    
    if (moduleIssues.length > 0) {
      console.log('\n❌ Module reference issues:');
      moduleIssues.forEach(issue => console.log(`  - ${issue}`));
    }
    
    process.exit(issues.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('Validation failed:', error);
    process.exit(1);
  }
}

validateRoleMappings();