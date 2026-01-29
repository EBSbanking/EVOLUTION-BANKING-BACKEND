// simple-fix.js - SIMPLE DIRECT FIX
import { getPool } from '../config/db.js';

async function simpleFix() {
  console.log('🔧 Simple Direct Fix\n');
  
  const pool = getPool();
  const conn = await pool.getConnection();
  
  try {
    console.log('1️⃣ Adding missing columns to users table...');
    
    // First, just add the missing columns
    try {
      await conn.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active VARCHAR(50) DEFAULT 'Active'");
      console.log('   ✅ Added is_active column');
    } catch (error) {
      console.log('   ⚠️ Error adding is_active:', error.message);
    }
    
    try {
      await conn.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS utype VARCHAR(50) DEFAULT 'Staff'");
      console.log('   ✅ Added utype column');
    } catch (error) {
      console.log('   ⚠️ Error adding utype:', error.message);
    }
    
    console.log('\n2️⃣ Now checking admin user...');
    
    // Check if admin exists
    const [admin] = await conn.query("SELECT id FROM users WHERE username = 'admin'");
    
    if (admin.length === 0) {
      console.log('   Creating admin user...');
      const bcrypt = await import('bcrypt');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await conn.query(`
        INSERT INTO users (
          username, password, email, first_name, last_name, 
          status, isAdmin, is_active, utype
        ) VALUES (
          'admin', ?, 'admin@evolutionbanking.com',
          'System', 'Administrator', 'Active', TRUE, 'Active', 'Staff'
        )
      `, [hashedPassword]);
      console.log('   ✅ Created admin user (password: admin123)');
    } else {
      console.log(`   ✅ Admin user already exists (ID: ${admin[0].id})`);
    }
    
    console.log('\n3️⃣ Showing users...');
    const [users] = await conn.query(`
      SELECT id, username, email, status, isAdmin, is_active, utype 
      FROM users 
      LIMIT 5
    `);
    
    users.forEach(user => {
      console.log(`   ${user.id}. ${user.username} - ${user.status} ${user.isAdmin ? '[Admin]' : ''}`);
    });
    
    console.log('\n🎉 Fix completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    conn.release();
    await pool.end();
  }
}

simpleFix();