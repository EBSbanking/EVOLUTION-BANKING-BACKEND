// src/utils/removeDuplicates.js
import dotenv from 'dotenv';
import sequelize from '../../config/db.js';

dotenv.config();

/**
 * Remove duplicate deposit records based on a_c_c_t__i_d (actual column)
 */
async function removeDuplicateDeposits() {
  console.log('🔍 Checking for duplicate deposit records...');

  try {
    const [duplicates] = await sequelize.query(`
      SELECT 
        \`a_c_c_t__i_d\` as ACCT_ID,
        COUNT(*) as duplicate_count,
        GROUP_CONCAT(id ORDER BY created_at DESC) as ids
      FROM deposits
      WHERE \`a_c_c_t__i_d\` IS NOT NULL
      GROUP BY \`a_c_c_t__i_d\`
      HAVING duplicate_count > 1
    `);

    if (duplicates.length === 0) {
      console.log('✅ No duplicate deposit records found');
      return;
    }

    console.log(`🔍 Found ${duplicates.length} accounts with duplicate deposits`);

    let totalRemoved = 0;
    let totalProcessed = 0;

    for (const duplicate of duplicates) {
      const { ACCT_ID, ids } = duplicate;
      const idArray = ids.split(',').map(id => parseInt(id.trim()));
      
      if (idArray.length <= 1) continue;

      const [keepId, ...removeIds] = idArray;

      if (removeIds.length > 0) {
        await sequelize.query(
          `DELETE FROM deposits WHERE id IN (?)`,
          { replacements: [removeIds] }
        );
        
        totalRemoved += removeIds.length;
        totalProcessed++;
        
        console.log(`   📝 a_c_c_t__i_d: ${ACCT_ID} - Keeping ID ${keepId}, removed ${removeIds.length} duplicates`);
      }
    }

    console.log(`✅ Removed ${totalRemoved} duplicate records from ${totalProcessed} accounts`);
    
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
 * Remove duplicates from a specific table (used by cleanupAllDuplicates)
 */
async function removeDuplicatesFromTable({ table, duplicateField, orderBy }) {
  console.log(`🔍 Checking for duplicates in ${table} on field ${duplicateField}...`);

  try {
    const [tableExists] = await sequelize.query(
      `SELECT COUNT(*) as count FROM information_schema.tables 
       WHERE table_schema = DATABASE() AND table_name = ?`,
      { replacements: [table] }
    );

    if (tableExists[0].count === 0) {
      console.log(`   ⚠️ Table ${table} does not exist, skipping...`);
      return;
    }

    const [fieldExists] = await sequelize.query(
      `SELECT COUNT(*) as count FROM information_schema.columns 
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      { replacements: [table, duplicateField] }
    );

    if (fieldExists[0].count === 0) {
      console.log(`   ⚠️ Field ${duplicateField} does not exist in ${table}, skipping...`);
      return;
    }

    const quotedField = duplicateField.includes('_') ? `\`${duplicateField}\`` : duplicateField;

    const [duplicates] = await sequelize.query(`
      SELECT 
        ${quotedField} as dup_value,
        COUNT(*) as duplicate_count,
        GROUP_CONCAT(id ORDER BY ${orderBy}) as ids
      FROM ${table}
      WHERE ${quotedField} IS NOT NULL
      GROUP BY ${quotedField}
      HAVING duplicate_count > 1
      LIMIT 1000
    `);

    if (duplicates.length === 0) {
      console.log(`   ✅ No duplicates found in ${table}`);
      return;
    }

    console.log(`   🔍 Found ${duplicates.length} duplicate groups in ${table}`);

    let removedCount = 0;
    let processedCount = 0;

    for (const duplicate of duplicates) {
      const fieldValue = duplicate.dup_value;
      const ids = duplicate.ids;
      
      const idArray = ids.split(',').map(id => parseInt(id.trim()));
      
      if (idArray.length <= 1) continue;

      const [keepId, ...removeIds] = idArray;

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
 * Main execution – runs on server startup
 * IMPORTANT: Do NOT close the database connection – the app manages it.
 */
async function main() {
  console.log('🚀 Starting duplicate removal script...');
  
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to MySQL database');

    // Clean only deposits
    await removeDuplicateDeposits();
    
    // Optionally clean other tables (uncomment if needed)
    // await cleanupAllDuplicates();
    
    console.log('🎉 Script completed successfully');
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    // Do not throw – let the server continue
  }
  // ✅ DO NOT close the connection – the app needs it
}

// Run the script (remove this line if you don't want it on startup)
main().catch(console.error);

// Export functions for use in other scripts
export { removeDuplicateDeposits, removeDuplicatesFromTable };