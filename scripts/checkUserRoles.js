// scripts/checkUserRoles.js
import { initializeModels, getUserRole, getSequelize } from '../src/models/index.js';

async function checkUserRoles() {
  try {
    console.log('🔍 Checking user roles in database...\n');
    
    await initializeModels();
    
    const UserRole = getUserRole();
    const sequelize = getSequelize();
    
    // Get all user roles
    const allUserRoles = await UserRole.findAll({
      attributes: ['user_id', 'role_id', 'ROLE_NM', 'SYSUSER_ID', 'BU_ID', 'Business_Unit', 'USER_ROLE_IDS', 'ROLE_NMS'],
      raw: true
    });
    
    console.log(`📊 Total user roles in database: ${allUserRoles.length}`);
    
    if (allUserRoles.length === 0) {
      console.log('❌ No user roles found in the database!');
      return;
    }
    
    // Show sample of user roles
    console.log('\n📋 Sample of user roles (first 5):');
    allUserRoles.slice(0, 5).forEach((role, index) => {
      console.log(`\n[${index + 1}] User Role Record:`);
      console.log(`  user_id: ${role.user_id}`);
      console.log(`  role_id: ${role.role_id}`);
      console.log(`  ROLE_NM: ${role.ROLE_NM}`);
      console.log(`  SYSUSER_ID: ${role.SYSUSER_ID}`);
      console.log(`  USER_ROLE_IDS: ${role.USER_ROLE_IDS}`);
      console.log(`  ROLE_NMS: ${role.ROLE_NMS}`);
    });
    
    // Check for role ID 28 specifically
    console.log('\n🔎 Searching for role ID 28...');
    
    const role28Records = allUserRoles.filter(role => {
      // Check direct role_id
      if (role.role_id === 28) return true;
      
      // Check USER_ROLE_IDS
      if (role.USER_ROLE_IDS) {
        try {
          const ids = JSON.parse(role.USER_ROLE_IDS);
          if (Array.isArray(ids) && ids.includes(28)) return true;
          if (ids === 28) return true;
        } catch (e) {
          // Not JSON, try string contains
          if (role.USER_ROLE_IDS.includes('28')) return true;
        }
      }
      return false;
    });
    
    console.log(`Found ${role28Records.length} records for role ID 28`);
    
    if (role28Records.length > 0) {
      console.log('\n📋 Records for role ID 28:');
      role28Records.forEach((record, index) => {
        console.log(`\n[${index + 1}] Record:`);
        console.log(`  user_id: ${record.user_id}`);
        console.log(`  SYSUSER_ID: ${record.SYSUSER_ID}`);
        console.log(`  role_id: ${record.role_id}`);
        console.log(`  USER_ROLE_IDS: ${record.USER_ROLE_IDS}`);
      });
    } else {
      console.log('\n❌ No records found for role ID 28!');
      
      // Let's check what role IDs do exist
      const existingRoleIds = [...new Set(allUserRoles.map(r => r.role_id).filter(id => id))];
      console.log('\n📋 Existing role_ids in database:', existingRoleIds);
      
      // Check if any USER_ROLE_IDS contain 28
      const rolesWith28InArray = allUserRoles.filter(r => 
        r.USER_ROLE_IDS && r.USER_ROLE_IDS.includes('28')
      );
      if (rolesWith28InArray.length > 0) {
        console.log('\n⚠️ Found records with 28 in USER_ROLE_IDS but not matched:');
        rolesWith28InArray.forEach(r => {
          console.log(`  user_id: ${r.user_id}, USER_ROLE_IDS: ${r.USER_ROLE_IDS}`);
        });
      }
    }
    
    // Check Users table
    console.log('\n👥 Checking Users table...');
    try {
      const [users] = await sequelize.query(
        `SELECT user_name, username, email, SYSUSER_ID FROM users LIMIT 5`,
        { type: sequelize.QueryTypes.SELECT }
      );
      console.log('Sample users:', users);
    } catch (err) {
      console.log('Could not query users table:', err.message);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkUserRoles();