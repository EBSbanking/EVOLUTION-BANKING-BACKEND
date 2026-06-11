// scripts/reset-counters.js
import { resetCounter } from '../src/utils/generateCustomerNumber.js';
import sequelize from '../config/db.js';

const runReset = async () => {
  try {
    console.log('🔄 Resetting customer counter...');
    
    // Test database connection first
    await sequelize.authenticate();
    console.log('✅ Database connected');
    
    const result = await resetCounter('0000000000');
    
    if (result.success) {
      console.log('✅ Counter reset successfully!');
      console.log(`📊 New starting point: ${result.newCUST_ID}`);
      console.log('   Next customer will get: 0000000001');
    } else {
      console.error('❌ Reset failed:', result.message);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

runReset();