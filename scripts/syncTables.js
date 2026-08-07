import { syncAllTables } from '../src/models/index.js';
import sequelize from '../config/db.js';

(async () => {
  try {
    await syncAllTables({ alter: true });
    console.log('✅ Tables synced successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Sync failed:', err);
    process.exit(1);
  }
})();