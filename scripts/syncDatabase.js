// scripts/syncDatabase.js
import { runSyncScript } from '../config/db.js';

async function main() {
  const mode = process.argv[2] || 'create'; // 'create', 'alter', or 'force'
  
  console.log('🚀 Database Sync Script');
  console.log('=======================');
  
  try {
    await runSyncScript(mode);
    console.log('✅ Sync script completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync script failed:', error.message);
    process.exit(1);
  }
}

main();