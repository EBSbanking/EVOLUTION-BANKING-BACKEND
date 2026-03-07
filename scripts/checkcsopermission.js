// scripts/checkCreditOfficerPermissions.js
import { initializeModels, getRole, getPermissions, getSequelize } from '../src/models/index.js';

async function checkCreditOfficerPermissions() {
  try {
    console.log('🔍 Checking Credit Officer (Role 28) permissions...\n');
    
    await initializeModels();
    
    const sequelize = getSequelize();
    
    // Check what tables exist
    const [tables] = await sequelize.query("SHOW TABLES");
    console.log('📋 Available tables:', tables.map(t => Object.values(t)[0]).join(', '));
    
    // Try to find role 28
    const [roles] = await sequelize.query("SELECT * FROM roles WHERE id = 28");
    if (roles.length === 0) {
      console.log('❌ Role 28 not found in roles table');
    } else {
      console.log('✅ Role 28 found:', roles[0]);
    }
    
    // Check if there's a permissions table
    try {
      const [permissions] = await sequelize.query("SELECT * FROM permissions LIMIT 5");
      console.log('\n📋 Sample permissions:', permissions);
      
      // Find the specific permission
      const [targetPerm] = await sequelize.query(
        "SELECT * FROM permissions WHERE name LIKE '%CREATE_LOAN_CREDIT_APPLICATION%' OR name LIKE '%CREDIT_APPLICATION%'"
      );
      console.log('\n🔍 Target permission:', targetPerm);
    } catch (err) {
      console.log('⚠️ Could not query permissions table:', err.message);
    }
    
    // Check if there's a role_permissions junction table
    try {
      const [rolePerms] = await sequelize.query(
        "SELECT * FROM role_permissions WHERE role_id = 28 LIMIT 10"
      );
      console.log('\n📋 Role 28 permissions from junction table:', rolePerms);
    } catch (err) {
      console.log('⚠️ Could not query role_permissions table:', err.message);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkCreditOfficerPermissions();