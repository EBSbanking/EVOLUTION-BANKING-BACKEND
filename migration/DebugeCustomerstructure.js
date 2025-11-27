// debug-customer-structure.js
import mysql from 'mysql2/promise';

const MYSQL_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'core_x_banking',
  port: 3306,
};

async function debugCustomerStructure() {
  let mysqlConnection;
  
  try {
    console.log('🔌 Connecting to MySQL...');
    mysqlConnection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ MySQL connected.');

    // Check customer table structure
    console.log('\n📋 CUSTOMER TABLE STRUCTURE:');
    const [structure] = await mysqlConnection.execute('DESCRIBE customer');
    structure.forEach(col => {
      console.log(`   ${col.Field} (${col.Type})`);
    });

    // Check if there are any customers with group_id
    console.log('\n🔍 CHECKING CUSTOMERS WITH GROUP_ID:');
    const [customersWithGroup] = await mysqlConnection.execute(`
      SELECT COUNT(*) as count 
      FROM customer 
      WHERE group_id IS NOT NULL
    `);
    console.log(`   Customers with group_id: ${customersWithGroup[0].count}`);

    // Show sample customers with group_id
    console.log('\n👥 SAMPLE CUSTOMERS WITH GROUP_ID:');
    const [sampleCustomers] = await mysqlConnection.execute(`
      SELECT * FROM customer 
      WHERE group_id IS NOT NULL 
      LIMIT 5
    `);
    sampleCustomers.forEach((customer, index) => {
      console.log(`   Customer ${index + 1}:`, JSON.stringify(customer, null, 2));
    });

    // Check specific groups for members
    console.log('\n🔍 CHECKING SPECIFIC GROUPS FOR MEMBERS:');
    const groupIds = [176, 183]; // Your example groups
    for (const groupId of groupIds) {
      const [members] = await mysqlConnection.execute(`
        SELECT COUNT(*) as count 
        FROM customer 
        WHERE group_id = ?
      `, [groupId]);
      console.log(`   Group ${groupId}: ${members[0].count} members`);
      
      if (members[0].count > 0) {
        const [memberDetails] = await mysqlConnection.execute(`
          SELECT * FROM customer 
          WHERE group_id = ? 
          LIMIT 3
        `, [groupId]);
        console.log(`   Sample members for group ${groupId}:`);
        memberDetails.forEach((member, index) => {
          console.log(`     Member ${index + 1}:`, JSON.stringify(member));
        });
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

debugCustomerStructure().catch(console.error);