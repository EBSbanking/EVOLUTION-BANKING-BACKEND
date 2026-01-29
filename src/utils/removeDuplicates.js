import dotenv from 'dotenv';
import sequelize from '../../config/db.js'; // Your MySQL connection

dotenv.config();

/**
 * Remove duplicate deposit records based on ACCT_ID
 */
async function removeDuplicateDeposits() {
  console.log('🔍 Checking for duplicate deposit records...');

  try {
    // First, ensure the deposits table exists
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS deposits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ACCT_ID VARCHAR(100),
        amount DECIMAL(15,2),
        deposit_date DATE,
        deposit_type VARCHAR(50),
        status VARCHAR(50),
        reference VARCHAR(255),
        branch VARCHAR(50),
        teller_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_acct_id (ACCT_ID),
        INDEX idx_deposit_date (deposit_date),
        INDEX idx_reference (reference)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('✅ Deposits table checked/created');

    // Find duplicate ACCT_IDs
    const [duplicates] = await sequelize.query(`
      SELECT 
        ACCT_ID,
        COUNT(*) as duplicate_count,
        GROUP_CONCAT(id ORDER BY created_at DESC) as ids
      FROM deposits
      WHERE ACCT_ID IS NOT NULL
      GROUP BY ACCT_ID
      HAVING duplicate_count > 1
    `);

    if (duplicates.length === 0) {
      console.log('✅ No duplicate deposit records found');
      return;
    }

    console.log(`🔍 Found ${duplicates.length} accounts with duplicate deposits`);

    let totalRemoved = 0;
    let totalProcessed = 0;

    // Process each duplicate group
    for (const duplicate of duplicates) {
      const { ACCT_ID, duplicate_count, ids } = duplicate;
      const idArray = ids.split(',').map(id => parseInt(id.trim()));
      
      if (idArray.length <= 1) continue;

      // Keep the most recent record (first in the list since we ordered DESC)
      const [keepId, ...removeIds] = idArray;

      // Remove duplicates
      if (removeIds.length > 0) {
        await sequelize.query(
          `DELETE FROM deposits WHERE id IN (?)`,
          { replacements: [removeIds] }
        );
        
        totalRemoved += removeIds.length;
        totalProcessed++;
        
        console.log(`   📝 ACCT_ID: ${ACCT_ID} - Keeping ID ${keepId}, removed ${removeIds.length} duplicates`);
      }
    }

    console.log(`✅ Removed ${totalRemoved} duplicate records from ${totalProcessed} accounts`);
    
    // Log summary
    if (totalRemoved > 0) {
      const [remainingCount] = await sequelize.query(`SELECT COUNT(*) as count FROM deposits`);
      console.log(`📊 Total deposits after cleanup: ${remainingCount[0].count}`);
    }

  } catch (error) {
    console.error('❌ Error removing duplicates:', error.message);
    throw error;
  }
}

/**
 * Find and remove all duplicate records across common tables
 */
async function cleanupAllDuplicates() {
  console.log('🧹 Starting comprehensive database cleanup...');

  const tablesToClean = [
    {
      table: 'deposits',
      duplicateField: 'ACCT_ID',
      orderBy: 'created_at DESC'
    },
    {
      table: 'accounts',
      duplicateField: 'account_number',
      orderBy: 'created_at DESC'
    },
    {
      table: 'customers',
      duplicateField: 'customer_id',
      orderBy: 'created_at DESC'
    },
    {
      table: 'transactions',
      duplicateField: 'transaction_id',
      orderBy: 'transaction_date DESC'
    }
  ];

  for (const tableConfig of tablesToClean) {
    try {
      await removeDuplicatesFromTable(tableConfig);
    } catch (error) {
      console.error(`❌ Failed to clean ${tableConfig.table}:`, error.message);
    }
  }

  console.log('✅ Database cleanup completed');
}

/**
 * Remove duplicates from a specific table
 */
async function removeDuplicatesFromTable({ table, duplicateField, orderBy }) {
  console.log(`🔍 Checking for duplicates in ${table} on field ${duplicateField}...`);

  try {
    // Check if table exists
    const [tableExists] = await sequelize.query(
      `SELECT COUNT(*) as count FROM information_schema.tables 
       WHERE table_schema = DATABASE() AND table_name = ?`,
      { replacements: [table] }
    );

    if (tableExists[0].count === 0) {
      console.log(`   ⚠️ Table ${table} does not exist, skipping...`);
      return;
    }

    // Check if field exists
    const [fieldExists] = await sequelize.query(
      `SELECT COUNT(*) as count FROM information_schema.columns 
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      { replacements: [table, duplicateField] }
    );

    if (fieldExists[0].count === 0) {
      console.log(`   ⚠️ Field ${duplicateField} does not exist in ${table}, skipping...`);
      return;
    }

    // Find duplicates
    const [duplicates] = await sequelize.query(`
      SELECT 
        ${duplicateField},
        COUNT(*) as duplicate_count,
        GROUP_CONCAT(id ORDER BY ${orderBy}) as ids
      FROM ${table}
      WHERE ${duplicateField} IS NOT NULL
      GROUP BY ${duplicateField}
      HAVING duplicate_count > 1
      LIMIT 1000
    `);

    if (duplicates.length === 0) {
      console.log(`   ✅ No duplicates found in ${table}`);
      return;
    }

    console.log(`   🔍 Found ${duplicates.length} duplicates in ${table}`);

    let removedCount = 0;
    let processedCount = 0;

    // Process each duplicate group
    for (const duplicate of duplicates) {
      const fieldValue = duplicate[duplicateField];
      const duplicate_count = duplicate.duplicate_count;
      const ids = duplicate.ids;
      
      const idArray = ids.split(',').map(id => parseInt(id.trim()));
      
      if (idArray.length <= 1) continue;

      // Keep the most recent record (first in the list based on orderBy)
      const [keepId, ...removeIds] = idArray;

      // Remove duplicates
      if (removeIds.length > 0) {
        await sequelize.query(
          `DELETE FROM ${table} WHERE id IN (?)`,
          { replacements: [removeIds] }
        );
        
        removedCount += removeIds.length;
        processedCount++;
      }
    }

    console.log(`   ✅ Removed ${removedCount} duplicate records from ${processedCount} groups in ${table}`);

  } catch (error) {
    console.error(`   ❌ Error cleaning ${table}:`, error.message);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting duplicate removal script...');
  
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Connected to MySQL database');

    // Option 1: Clean only deposits
    await removeDuplicateDeposits();
    
    // Option 2: Clean all tables (uncomment if needed)
    // await cleanupAllDuplicates();
    
    console.log('🎉 Script completed successfully');
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  } finally {
    // Close database connection
    await sequelize.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the script
main().catch(console.error);

// Export functions for use in other scripts
export { removeDuplicateDeposits, cleanupAllDuplicates, removeDuplicatesFromTable };