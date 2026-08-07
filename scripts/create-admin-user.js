// scripts/create-admin-in-admin-users.js
import bcrypt from 'bcrypt';
import sequelize from '../config/db.js';

async function createAdminUser() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Check if admin already exists in admin_users table
    const [existing] = await sequelize.query(
      `SELECT id, username FROM admin_users WHERE username = 'weblogic'`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (existing) {
      console.log('⚠️ Admin user already exists in admin_users table!');
      console.log('User ID:', existing.id);
      console.log('Username:', existing.username);
      return;
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('weblogic1', salt);
    console.log('🔑 Password hash generated');

    // Insert into admin_users table
    const [result] = await sequelize.query(
      `INSERT INTO admin_users (
        username,
        password_hash,
        email,
        full_name,
        role,
        status,
        created_at,
        updated_at
      ) VALUES (
        'weblogic',
        :password,
        'weblogic@evolutionbanking.com',
        'WebLogic Admin',
        'super_admin',
        'active',
        NOW(),
        NOW()
      )`,
      {
        replacements: { password: hashedPassword },
        type: sequelize.QueryTypes.INSERT
      }
    );

    console.log('✅ Admin user created in admin_users table!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 Username:  weblogic');
    console.log('🔑 Password:  weblogic1');
    console.log('📧 Email:    weblogic@evolutionbanking.com');
    console.log('👔 Role:     super_admin');
    console.log('✅ Status:   active');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Verify the user was created
    const [user] = await sequelize.query(
      `SELECT id, username, email, full_name, role, status, created_at 
       FROM admin_users 
       WHERE username = 'weblogic'`,
      { type: sequelize.QueryTypes.SELECT }
    );
    console.log('📊 Created user:', user);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.sql) {
      console.error('📝 SQL:', error.sql);
    }
  } finally {
    await sequelize.close();
  }
}

createAdminUser();