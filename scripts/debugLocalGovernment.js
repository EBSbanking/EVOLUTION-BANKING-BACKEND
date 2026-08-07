// scripts/debugLocalGovernment.js
import dotenv from 'dotenv';
import LocalGovernment from '../src/models/LocalGovernment.js';
import sequelize from '../config/db.js';

dotenv.config();

async function debugLocalGovernment() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Show LocalGovernment model attributes
    console.log('📋 LocalGovernment model columns:');
    const attributes = Object.keys(LocalGovernment.rawAttributes);
    console.log(attributes);

    // Show table structure
    const [columns] = await sequelize.query('DESCRIBE local_governments');
    console.log('\n📋 LocalGovernment table structure:');
    console.table(columns);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

debugLocalGovernment();