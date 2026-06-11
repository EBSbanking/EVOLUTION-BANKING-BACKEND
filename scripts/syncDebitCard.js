// scripts/syncDebitCard.js
import sequelize from '../config/db.js';
import DebitCard from '../src/models/DebitCard.js';

async function syncDebitCardTable() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established.');
    
    await DebitCard.sync({ alter: false });
    console.log('✅ DebitCard table created/verified successfully.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to sync DebitCard table:', error.message);
    process.exit(1);
  }
}

syncDebitCardTable();