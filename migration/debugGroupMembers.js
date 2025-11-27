// migrate-groups-with-members-debug.js
import mysql from 'mysql2/promise';
import { MongoClient, Decimal128 } from 'mongodb';

const MYSQL_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'core_x_banking',
  port: 3306,
};

const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'evolution_banking';

async function debugGroupMembers() {
  let mysqlConnection;
  let mongoClient;
  
  try {
    console.log('🔌 Connecting to MySQL...');
    mysqlConnection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ MySQL connected.');

    console.log('🔍 DEBUG: Searching for group members data...\n');

    // 1. First, let's see all tables in the database
    console.log('📋 ALL TABLES IN DATABASE:');
    const [tables] = await mysqlConnection.execute('SHOW TABLES');
    tables.forEach(table => {
      const tableName = Object.values(table)[0];
      console.log(`   - ${tableName}`);
    });

    // 2. Look for tables that might contain group members
    console.log('\n🔍 SEARCHING FOR GROUP-RELATED TABLES:');
    const groupRelatedTables = tables.filter(table => {
      const tableName = Object.values(table)[0].toLowerCase();
      return tableName.includes('group') || 
             tableName.includes('member') || 
             tableName.includes('customer') && tableName.includes('group');
    });

    groupRelatedTables.forEach(table => {
      const tableName = Object.values(table)[0];
      console.log(`   - ${tableName}`);
    });

    // 3. Check structure of group-related tables
    console.log('\n📊 STRUCTURE OF GROUP-RELATED TABLES:');
    for (const table of groupRelatedTables) {
      const tableName = Object.values(table)[0];
      console.log(`\n   Table: ${tableName}`);
      
      try {
        const [structure] = await mysqlConnection.execute(`DESCRIBE \`${tableName}\``);
        structure.forEach(col => {
          console.log(`     ${col.Field} (${col.Type})`);
        });

        // Show sample data
        const [sampleData] = await mysqlConnection.execute(`SELECT * FROM \`${tableName}\` LIMIT 3`);
        console.log(`     Sample data (first 3 rows):`);
        sampleData.forEach((row, index) => {
          console.log(`       Row ${index + 1}:`, JSON.stringify(row));
        });

        // Count total records
        const [countResult] = await mysqlConnection.execute(`SELECT COUNT(*) as total FROM \`${tableName}\``);
        console.log(`     Total records: ${countResult[0].total}`);
      } catch (error) {
        console.log(`     ❌ Error reading table: ${error.message}`);
      }
    }

    // 4. Specifically check for group_id relationships
    console.log('\n🔗 CHECKING FOR GROUP_ID RELATIONSHIPS:');
    for (const table of tables) {
      const tableName = Object.values(table)[0];
      
      try {
        const [structure] = await mysqlConnection.execute(`DESCRIBE \`${tableName}\``);
        const hasGroupId = structure.some(col => 
          col.Field.toLowerCase().includes('group') && 
          (col.Field.toLowerCase().includes('id') || col.Field.toLowerCase().includes('_id'))
        );

        if (hasGroupId) {
          console.log(`\n   Table "${tableName}" has group-related columns:`);
          structure.forEach(col => {
            if (col.Field.toLowerCase().includes('group') || 
                col.Field.toLowerCase().includes('member') ||
                col.Field.toLowerCase().includes('customer')) {
              console.log(`     - ${col.Field} (${col.Type})`);
            }
          });

          // Show sample of group relationships
          const [sampleRelations] = await mysqlConnection.execute(
            `SELECT * FROM \`${tableName}\` WHERE group_id IS NOT NULL OR groupId IS NOT NULL LIMIT 5`
          );
          if (sampleRelations.length > 0) {
            console.log(`     Sample relationships:`);
            sampleRelations.forEach((row, index) => {
              console.log(`       ${index + 1}:`, JSON.stringify(row));
            });
          }
        }
      } catch (error) {
        // Skip tables we can't read
      }
    }

    // 5. Check specific group examples
    console.log('\n👥 CHECKING SPECIFIC GROUPS FOR MEMBERS:');
    const groupIds = [176, 183]; // Your example groups
    for (const groupId of groupIds) {
      console.log(`\n   Group ID: ${groupId}`);
      
      // Try to find members in various tables
      const possibleTables = [
        'group_members', 'customer_groups', 'group_customers', 
        'members', 'group_member', 'customer_group'
      ];

      for (const tableName of possibleTables) {
        try {
          const [members] = await mysqlConnection.execute(
            `SELECT * FROM \`${tableName}\` WHERE group_id = ? LIMIT 5`,
            [groupId]
          );
          if (members.length > 0) {
            console.log(`     ✅ Found ${members.length} members in ${tableName}:`);
            members.forEach(member => {
              console.log(`       - Member:`, JSON.stringify(member));
            });
          }
        } catch (error) {
          // Table doesn't exist or error
        }
      }
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    if (mysqlConnection) {
      await mysqlConnection.end();
      console.log('\n🔌 MySQL disconnected.');
    }
  }
}

// Run the debug
debugGroupMembers().catch(console.error);