// scripts/debugState.js
import dotenv from 'dotenv';
import State from '../src/models/State.js';
import sequelize from '../config/db.js';

dotenv.config();

async function debugState() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Show State model attributes
    console.log('📋 State model columns:');
    const attributes = Object.keys(State.rawAttributes);
    console.log(attributes);

    // Show table structure
    const [columns] = await sequelize.query('DESCRIBE states');
    console.log('\n📋 States table structure:');
    console.table(columns);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

debugState();