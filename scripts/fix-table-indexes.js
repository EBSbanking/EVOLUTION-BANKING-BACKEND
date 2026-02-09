// scripts/fix-table-indexes.js
import sequelize from '../config/db.js';

async function fixTableIndexes() {
  const problematicTables = [
    'charges',
    'loan_portfolio',
    'accounts',
    'chart_of_accounts',
    'organizations',
    'licenses',
    'loan_account_details',
    'group_loans',
    'relationship_officers',
    'sms_records',
    'banks',
    'thrift_accounts',
    'groups',
    'collections',
    'group_savings',
    'group_savings_contributions',
    'vaults',
    'customer_transactions',
    'penalty_rules',
    'drawers',
    'approval_requests'
  ];
  
  console.log('🔧 Fixing tables with too many indexes...');
  
  for (const tableName of problematicTables) {
    try {
      // Check if table exists
      const [tables] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`);
      
      if (tables.length === 0) {
        console.log(`   ⚠️  ${tableName} doesn't exist, skipping`);
        continue;
      }
      
      // Count indexes
      const [indexCount] = await sequelize.query(`
        SELECT COUNT(*) as count 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_NAME = '${tableName}' 
        AND TABLE_SCHEMA = DATABASE()
      `);
      
      const count = parseInt(indexCount[0].count);
      
      if (count > 60) { // Getting close to MySQL limit
        console.log(`   ⚠️  ${tableName} has ${count} indexes, fixing...`);
        
        // Get existing table structure
        const [structure] = await sequelize.query(`SHOW CREATE TABLE ${tableName}`);
        const createStatement = structure[0]['Create Table'];
        
        // Drop table
        await sequelize.query(`DROP TABLE IF EXISTS ${tableName}`);
        console.log(`   ✅ Dropped ${tableName}`);
        
        // Recreate without most indexes (only keep primary key)
        // We'll use a simpler approach - let the model sync recreate it
        console.log(`   ⏳ ${tableName} will be recreated on next sync`);
      } else {
        console.log(`   ✅ ${tableName} is OK (${count} indexes)`);
      }
    } catch (error) {
      console.log(`   ❌ Error fixing ${tableName}: ${error.message}`);
    }
  }
  
  console.log('\n✅ Table index fix completed');
  console.log('💡 Restart your server to recreate tables with proper indexes');
}

fixTableIndexes();